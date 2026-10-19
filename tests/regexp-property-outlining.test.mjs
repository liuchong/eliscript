import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

// Captured from the complete original definition before partitioning. The
// baseline is independent of helper boundaries and is never regenerated here.
const originalSHA256='d3e11e410bbb87a5e5f3c0979aaf776e4fdd39d42c2c615c34511c7d60f562b6';
const rootName='regexp-property-id-base',prefix=rootName+'-part-';
let directory,backend,definitions,reconstructed,outlined,originalJS,splitJS,sourceIR,names,packedSource;
const normalize=source=>source.replace(/\s+/g,' ').trim();
function parse(source){
  const stack=[];let result;
  for(const token of source.match(/\(|\)|[^\s()]+/g)){
    if(token==='('){const value=[];if(stack.length)stack.at(-1).push(value);stack.push(value);}
    else if(token===')'){result=stack.pop();}
    else stack.at(-1).push(token);
  }
  assert.equal(stack.length,0);return result;
}
function inline(source,active=new Set()){
  return source.replace(/\((regexp-property-id-base-part-\d{4}) (source start length(?: unit)?)\)/g,(_,name,args)=>{
    assert(!active.has(name),'private partitions must not introduce recursion');
    const text=definitions.get(name);assert(text,'every private call resolves to its actual definition');
    const match=/^\(defun [^\s]+ \(([^)]*)\) ([\s\S]*)\)$/.exec(text);assert(match);
    assert.equal(args,match[1],'the original lexical inputs are forwarded without evaluation changes');
    return inline(match[2],new Set([...active,name]));
  });
}
function supportedNames(tree){
  const result=new Map();
  const visit=(value,unit,characters)=>{
    if(!Array.isArray(value)){
      if(/^\d+$/.test(value)&&Number(value)>0){
        assert(characters.length>0&&characters.every(code=>Number.isInteger(code)));
        const name=String.fromCharCode(...characters),id=Number(value);
        if(result.has(name))assert.equal(result.get(name),id);else result.set(name,id);
      }
      return;
    }
    if(value[0]==='let'){
      const binding=value[1][0];assert.equal(binding[0],'unit');
      assert.deepEqual(binding[1].slice(0,2),['string-code-unit-at','source']);
      const offset=binding[1][2];assert.deepEqual(offset.slice(0,2),['+','start']);
      visit(value[2],Number(offset[2]),characters);return;
    }
    assert.equal(value[0],'if');const condition=value[1];
    let yes=characters;
    if(condition[0]==='='&&condition[1]==='unit'){
      yes=characters.slice();yes[unit]=Number(condition[2]);
    }
    visit(value[2],unit,yes);visit(value[3],unit,characters);
  };
  visit(tree[3],null,[]);return result;
}
function observations(action){try{return{ok:true,value:action()};}catch(error){return{ok:false,name:error.name,message:error.message};}}
function irNodes(node){let count=0;const pending=[node];while(pending.length){const value=pending.pop();count++;pending.push(...value.children);}return count;}

beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-regexp-outline-'));
  const originalSource=await readFile('tests/fixtures/regexp-property-original-trie.eli','utf8');definitions=new Map();
  for(const match of originalSource.matchAll(/\(defun (regexp-property-id-base(?:-part-\d{4})?) /g)){
    assert(!definitions.has(match[1]));definitions.set(match[1],definition(originalSource,match[1]+' '));
  }
  reconstructed=inline(definitions.get(rootName));
  names=supportedNames(parse(reconstructed));
  const source=await readFile('bootstrap/backends/regexp.eli','utf8');
  // Keep the complete frozen trie as the independent semantic oracle. The
  // production representation now stores aliases as data instead of making
  // every character decision a local-generating managed expression.
  const start=source.indexOf(';; BEGIN GENERATED UNICODE PROPERTY ALIASES');
  const end=source.indexOf(';; END GENERATED UNICODE PROPERTY ALIASES',start);
  assert(start>=0&&end>start);packedSource=source.slice(start,end);
  outlined='(module regexp.outline\n'+packedSource+'\n(export '+rootName+'))';
  backend=await buildBackends({outputRoot:directory});
  sourceIR=backend.compiler.compile_ir_string(outlined,'regexp-outline.eli');
  splitJS=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(sourceIR)).toString('base64'));
  // Reconstruct the frozen original only in memory, rather than maintaining a
  // second huge fixture that could drift together with the new implementation.
  originalJS=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.compile_string(
    '(module regexp.original '+reconstructed+' (export '+rootName+'))','regexp-original.eli')).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('packed property aliases retain the frozen complete original trie inventory while production lookup is bounded data code',()=>{
  assert.equal(createHash('sha256').update(normalize(reconstructed)).digest('hex'),originalSHA256);
  assert.equal(definitions.size,69);assert.equal(names.size>100,true);
  for(const text of definitions.values())assert(text.length<=30000,'each generated function has a bounded source body');
  const root=sourceIR.body[0].kind==='module-declaration'?sourceIR.body[0].children:sourceIR.body;
  const target=root.find(node=>node.kind==='function-declaration'&&node.value===rootName);
  assert(target);assert(irNodes(target)<1000,'production lookup must not restore the original giant alias decision tree');
  // The former >1000-node frontend regression is still covered by compiling
  // the exact original above, rather than being silently dropped with the trie.
  const originalIR=backend.compiler.compile_ir_string('(module regexp.original '+reconstructed+')','regexp-original.eli');
  const originalRoot=originalIR.body[0].kind==='module-declaration'?originalIR.body[0].children:originalIR.body;
  assert(irNodes(originalRoot.find(node=>node.kind==='function-declaration'&&node.value===rootName))>1000);
  assert.equal(parse(definitions.get(rootName))[1],rootName);
});

test('actual split and original JS retain every supported property alias plus case offsets trailing UTF16 and source read failures',()=>{
  const actual=splitJS.regexp_property_id_base,original=originalJS.regexp_property_id_base;
  for(const [name]of names){
    for(const text of [name,name.toLowerCase(),name.toUpperCase(),name+'x',name.slice(0,-1),'\ud800'+name,name+'\udfff']){
      assert.deepEqual(observations(()=>actual(text,0,text.length)),observations(()=>original(text,0,text.length)),text);
    }
    assert.equal(actual('!'+name+'?',1,name.length),original('!'+name+'?',1,name.length),name+' at offset');
    assert.equal(actual('😀'+name,2,name.length),original('😀'+name,2,name.length),name+' after a surrogate pair');
  }
  for(const source of ['',null,undefined,17,false,{},'\0','\ud800','\udfff','😀']){
    for(const [start,length]of [[0,0],[0,1],[-1,3],[1,2],[NaN,2],[0,NaN],[0,-1],[0,Infinity]]){
      assert.deepEqual(observations(()=>actual(source,start,length)),observations(()=>original(source,start,length)));
    }
  }
  const run=fn=>{const reads=[],marker=new Error('original source read');
    const source={charCodeAt(index){reads.push(index);if(reads.length===3)throw marker;return'ASCII'.charCodeAt(index);}};
    let caught;try{fn(source,0,5);}catch(error){caught=error;}
    return{reads,caught: caught===undefined?undefined:caught===marker?'same original error':caught.name};};
  assert.deepEqual(run(actual),run(original));
});

test('real complete-runtime managed WASM keeps outlined locals bounded and executes the property trie without imports under the original small compiler budget',async()=>{
  const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
  const lowered=backend.managed.lower_managed_program(sourceIR,runtime);
  const owned=lowered.typed.functions.filter(fn=>fn.name.startsWith('__eliscript_managed_'));
  assert(owned.length>=[...packedSource.matchAll(/\(defun /g)].length,
    'all actual lookup helpers are lowered rather than replaced with a host import');
  for(const fn of owned)assert(fn.locals.length<=20000,fn.name+' exceeds the outlined function local budget');
  const bytes=Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed,{initialPages:128,maximumPages:1024}),
    'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
  const module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  const path=resolve(directory,'property-outlined.wasm');await writeFile(path,bytes);
  const node=spawnSync('node',['--input-type=module','-e',
    'import assert from "node:assert/strict";import{readFileSync}from"node:fs";const m=new WebAssembly.Module(readFileSync(process.argv[1]));assert.deepEqual(WebAssembly.Module.imports(m),[]);',path],
    {encoding:'utf8',timeout:30000});
  assert.equal(node.error,undefined);assert.equal(node.signal,null);assert.equal(node.status,0,node.stderr);
  const a=instantiateManagedRuntime(bytes,{maxSlots:131072,initialBytes:8388608,maxBytes:67108864});a.auto(65536);
  try{
    const all=[...names.keys()],step=Math.max(1,Math.floor(all.length/64));
    const cases=all.filter((_,index)=>index%step===0).concat(['','unknown','ascii','ASCIIx','\ud800','😀']);
    for(const name of cases){
      const text=a.string(name),start=a.number(0),length=a.number(name.length);let result;
      try{result=a.invoke(rootName,[text,start,length]);assert.equal(a.readNumber(result),originalJS.regexp_property_id_base(name,0,name.length),name);}
      finally{if(result!==undefined)a.release(result);a.release(text);a.release(start);a.release(length);}
    }
  }finally{a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
},120000);
