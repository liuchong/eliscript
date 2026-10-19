import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildIndependentCompiler,loadCompilerSources} from '../tools/backends/compiler-build.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {encodeCompilerIR} from '../tools/backends/compiler-session.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

let directory,sources,artifact,compiler,emitter;
const filename='虚拟😀/arity.eli';
const source='; 😀中\r\n(defun token (x)\r\n  (host-identity-token x))\r\n(export token)';
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-ir-arity-'));
  sources=await loadCompilerSources();
  artifact=await buildIndependentCompiler({host:'javascript',sources,profile:'full-runtime',
    outputRoot:directory,retainIR:false,debug:false});
  compiler=await import(pathToFileURL(resolve(directory,'bootstrap/compiler.mjs')).href);
  emitter=await import(pathToFileURL(resolve(directory,'bootstrap/emitter.mjs')).href);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function intrinsics(program){
  const pending=[...program.body].reverse(),found=[];
  while(pending.length){const node=pending.pop();
    if(node.kind==='intrinsic'&&node.value==='host-identity-token')found.push(node);
    for(let index=(node.children?.length??0)-1;index>=0;index--)pending.push(node.children[index]);
  }
  return found;
}
function expectedSpan(text,fragment,at=text.indexOf(fragment)){
  assert(at>=0);
  const position=offset=>{
    const prefix=text.slice(0,offset),lines=prefix.split('\n');
    return{offset:Array.from(prefix).length,line:lines.length,column:Array.from(lines.at(-1)).length+1};
  };
  const start=position(at),end=position(at+fragment.length);
  return{filename,start:start.offset,end:end.offset,line:start.line,column:start.column,
    endLine:end.line,endColumn:end.column};
}
function captured(action){let caught=false,result;try{action();}catch(error){caught=true;result=error;}
  assert(caught,'the malformed original IR must actually fail');return result;}
function malformed(original,count){
  const program=structuredClone(original),node=intrinsics(program)[0],operand=node.children[0];
  node.children=count===0?[]:[operand,structuredClone(operand)];
  return{program,node};
}

test('Given original Unicode IR When intrinsic arity is corrupted Then the real emitter preserves its Error and exact owning span',()=>{
  const original=compiler.compile_ir_string(source,filename),before=encodeCompilerIR(original);
  const span=expectedSpan(source,'(host-identity-token x)');
  assert.deepEqual(intrinsics(original)[0].span,span);
  for(const count of[0,2]){
    const{program,node}=malformed(original,count),snapshot=encodeCompilerIR(program);
    const error=captured(()=>compiler.emit_ir_string(program));
    assert(error instanceof Error);
    assert.equal(error.message,`host-identity-token expects 1 argument, got ${count}`);
    assert.equal(error.eliscriptIRSpan,node.span);
    assert.deepEqual(error.eliscriptIRSpan,span);
    assert.equal(Object.hasOwn(error,'eliscriptDiagnostic'),false);
    assert.equal(encodeCompilerIR(program),snapshot);
  }
  assert.equal(encodeCompilerIR(original),before);
  assert.equal(typeof compiler.emit_ir_string(original),'string');
});

test('Given an existing Error at the real arity boundary When metadata is attached Then identity message and existing diagnostics remain intact',()=>{
  const program=compiler.compile_ir_string(source,filename),node=intrinsics(program)[0],operand=node.children[0];
  for(const frozen of[false,true]){
    const diagnostic={format:'eliscript-diagnostic',version:1,code:'ORIGINAL',phase:'original',message:'original diagnostic'};
    const original=Object.assign(new Error('original arity-boundary error'),{eliscriptDiagnostic:diagnostic});
    if(frozen)Object.freeze(original);
    const corrupted={...node,children:new Proxy([operand],{get(target,key,receiver){
      if(key==='length')throw original;
      return Reflect.get(target,key,receiver);
    }})};
    assert.equal(captured(()=>emitter.emit_expression(corrupted)),original);
    assert.equal(original.message,'original arity-boundary error');
    assert.equal(original.eliscriptDiagnostic,diagnostic);
    if(frozen)assert.equal(Object.hasOwn(original,'eliscriptIRSpan'),false);
    else assert.equal(original.eliscriptIRSpan,node.span);
  }
  const innerSpan={...node.span,start:node.span.start+1},inner=Object.assign(new Error('inner arity failure'),{eliscriptIRSpan:innerSpan});
  const nested={...node,children:new Proxy([operand],{get(target,key,receiver){
    if(key==='length')throw inner;return Reflect.get(target,key,receiver);
  }})};
  assert.equal(captured(()=>emitter.emit_expression(nested)),inner);
  assert.equal(inner.eliscriptIRSpan,innerSpan,'an outer boundary cannot replace an already precise inner span');
});

test('Given two nested corrupt intrinsics When real emission walks source order Then only the first exact node owns the failure',()=>{
  const nested='; 😀\n(defun token (x) (js-array (host-identity-token x) (host-identity-token x))) (export token)';
  const program=compiler.compile_ir_string(nested,filename),nodes=intrinsics(program);
  assert.equal(nodes.length,2);
  nodes[0].children=[];nodes[1].children.push(structuredClone(nodes[1].children[0]));
  const error=captured(()=>compiler.emit_ir_string(program));
  assert.equal(error.message,'host-identity-token expects 1 argument, got 0');
  assert.equal(error.eliscriptIRSpan,nodes[0].span);
  assert.notDeepEqual(error.eliscriptIRSpan,nodes[1].span);
  assert.deepEqual(error.eliscriptIRSpan,expectedSpan(nested,'(host-identity-token x)'));
});

test('Given initialized real compiler sessions When binary IR emission rejects arity Then exact structured locations survive and valid WASM still executes',async()=>{
  const session=await openCompilerArtifact(artifact);
  try{
    await session.request({operation:'runtime',source:sources.runtime.source,filename:sources.runtime.filename,
      literalSources:structuredClone(sources.literalSources)});
    const original=compiler.compile_ir_string(source,filename),span=expectedSpan(source,'(host-identity-token x)');
    const originalWire=encodeCompilerIR(original);
    for(const target of['wasm','native'])for(const count of[0,2]){
      const{program}=malformed(original,count),message=`host-identity-token expects 1 argument, got ${count}`;
      await assert.rejects(async()=>session.request({operation:'emit-ir',target,ir:encodeCompilerIR(program),
        nativeTarget:process.platform==='linux'?'arm64-linux':'arm64-macos',nativeFormat:'library'}),error=>{
        assert.equal(error.message,message);
        assert.deepEqual(error.eliscriptDiagnostic,{format:'eliscript-diagnostic',version:1,code:'ELI-B0001',
          severity:'error',phase:'managed-backend',message,
          location:{file:filename,start:{offset:span.start,line:span.line,column:span.column},
            end:{offset:span.end,line:span.endLine,column:span.endColumn}}});
        return true;
      });
    }
    const product=await session.request({operation:'emit-ir',target:'wasm',ir:originalWire});
    const bytes=Uint8Array.from(product.bytes),module=new WebAssembly.Module(bytes);
    assert.deepEqual(WebAssembly.Module.imports(module),[]);
    const runtime=instantiateManagedRuntime(bytes);
    try{
      runtime.auto(1);const object=runtime.sourceObject({}),first=runtime.invoke('token',[object]);
      try{const second=runtime.invoke('token',[object]);
        try{assert.equal(runtime.readNumber(first),runtime.readNumber(second));assert(runtime.readNumber(first)>0);}
        finally{runtime.release(second);}
      }finally{runtime.release(first);runtime.release(object);}
    }finally{runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}
    assert.equal(encodeCompilerIR(original),originalWire);
  }finally{await session.close();}
},120000);
