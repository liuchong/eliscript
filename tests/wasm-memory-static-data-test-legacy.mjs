import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
import {pathToFileURL} from 'node:url';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {createHash} from 'node:crypto';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,snapshot,actualRuntime;
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-wasm-static-data-'));
  backend=await buildBackends({outputRoot:directory});
  // Inspect the real private copier through an isolated test module; the
  // production backend keeps its existing public export surface.
  const source=await readFile(resolve('bootstrap/backends/wasm.eli'),'utf8');
  const helpers=['require-memory-data-copy','require-wasm-expression-node','copy-wasm-expression-node',
    'same-wasm-expression-snapshot','intern-wasm-expression','copy-wasm-expression',
    'make-wasm-validation-workspace','validate-fresh-wasm-expression','validate-fresh-typed-wasm-program'];
  const helperSource='(module wasm.snapshot\n(import '+JSON.stringify(pathToFileURL(resolve(directory,'backends/numeric.mjs')).href)+
    ' backend-fail)\n'+helpers.map(name=>definition(source,name+' ')).join('\n')+
    '\n(export copy-wasm-expression make-wasm-validation-workspace validate-fresh-wasm-expression validate-fresh-typed-wasm-program))';
  snapshot=await import('data:text/javascript;base64,'+
    Buffer.from(backend.compiler.compile_string(helperSource,'wasm-snapshot.eli')).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const node=(kind,value,children=[],extra={})=>({kind,type:'u32',value,children,...extra});
const constant=value=>node('literal',value);
const local=index=>node('local',index);
const copy=(text,address=local(0))=>node('memory-data-copy',text,[address]);
function program(entries){return{abi:'memory-u32',filename:'static-data.eli',functions:entries.map(([name,body],index)=>({
  name,index,arity:1,locals:[{name:'address',type:'u32',index:0}],body,
})),exports:entries.map(([name])=>name)};}
function emit(input,options={initialPages:1,maximumPages:2}){
  const bytes=Uint8Array.from(backend.wasm.emit_typed_memory_wasm(input,options));
  const module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  return{bytes,e:new WebAssembly.Instance(module).exports};
}
function units(e,address,text){
  const view=new DataView(e.memory.buffer);
  return Array.from({length:text.length},(_,index)=>view.getUint16(address+index*2,true));
}
const expected=text=>Array.from({length:text.length},(_,index)=>text.charCodeAt(index));
const rejection=error=>error.eliscriptDiagnostic?.code==='ELI-B0001';
const staticSource=(text,destination='address')=>
  '(import "eliscript:memory32" copy-static-u16 load-u32 store-u32)\n'+
  '(defun run (address) (copy-static-u16 '+destination+' '+JSON.stringify(text)+'))\n(export run)';
function freezeTree(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

test('Given a memory kernel static literal When lowered from actual source Then it copies exact units with one address evaluation and bounded code',()=>{
  const text='table\0😀\ud800\udfff\uffff'.repeat(4096);
  const source=staticSource(text,'(progn (store-u32 0 (+ (load-u32 0) 1)) address)');
  const ir=backend.compiler.compile_ir_string(source,'static-kernel-source.eli'),saved=JSON.stringify(ir);
  const bytes=Uint8Array.from(backend.wasm.emit_memory_wasm(ir,{initialPages:4,maximumPages:4}));
  assert(bytes.length<text.length*2+512,'the source capability lowers to data, not per-unit stores');
  assert.equal(JSON.stringify(ir),saved);
  const module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  const e=new WebAssembly.Instance(module).exports;
  assert.equal(e.run(16),0);assert.deepEqual(units(e,16,text),expected(text));
  assert.equal(new DataView(e.memory.buffer).getUint32(0,true),1);
  new Uint8Array(e.memory.buffer,16,text.length*2).fill(0x97);
  assert.equal(e.run(16),0);assert.deepEqual(units(e,16,text),expected(text));
  assert.equal(new DataView(e.memory.buffer).getUint32(0,true),2);
  const end=e.memory.buffer.byteLength-4;
  new Uint8Array(e.memory.buffer,end,4).fill(0x91);
  assert.throws(()=>e.run(end),WebAssembly.RuntimeError);
  assert.deepEqual([...new Uint8Array(e.memory.buffer,end,4)],[0x91,0x91,0x91,0x91]);
  assert.equal(new DataView(e.memory.buffer).getUint32(0,true),3);
});

test('Given dynamic or malformed static-copy arguments When lowering Then source diagnostics reject them before execution',()=>{
  for(const body of ['(copy-static-u16 address address)','(copy-static-u16 address 42)',
    '(copy-static-u16 address)','(copy-static-u16 address "a" "b")',
    '(let ((copy-static-u16 address)) (copy-static-u16 address "a"))']){
    const source='(import "eliscript:memory32" copy-static-u16)\n(defun run (address) '+body+')\n(export run)';
    const ir=backend.compiler.compile_ir_string(source,'bad-static-kernel.eli');
    assert.throws(()=>backend.wasm.emit_memory_wasm(ir),rejection);
    for(const target of ['arm64-macos','arm64-linux'])
      assert.throws(()=>backend.native.emit_native_memory_library(ir,target),rejection);
  }
  const source='(defun run (address) (copy-static-u16 address "a"))\n(export run)';
  assert.throws(()=>backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'unimported.eli')),rejection);
});

test('Given exact UTF16 static data When copied repeatedly Then isolated surrogates zero units and immutable source survive ordinary heap mutations',()=>{
  const text='\0"\\\r\n中😀\ud800x\udfff',input=program([['first',copy(text)],['second',copy(text)],['empty',copy('')]]);
  const before=JSON.stringify(input),{e}=emit(input);
  assert.equal(JSON.stringify(input),before,'passive data allocation must not mutate public typed nodes');
  for(const name of ['first','second']){
    assert.equal(e[name](16),0);assert.deepEqual(units(e,16,text),expected(text));
    new Uint8Array(e.memory.buffer,16,text.length*2).fill(0xa5);
  }
  assert.equal(e.first(32),0);assert.deepEqual(units(e,32,text),expected(text));
  assert.equal(e.empty(65536),0);
  assert.throws(()=>e.empty(65537),WebAssembly.RuntimeError);
});

test('Given a destination with effects When copying Then it executes once and out-of-bounds copies leave every byte unchanged',()=>{
  const counter=node('memory-op','store-u32',[constant(0),node('word-arithmetic','+',[
    node('memory-op','load-u32',[constant(0)]),constant(1)])]);
  const address=node('sequence',null,[counter,local(0)]),text='copy😀';
  const{e}=emit(program([['run',copy(text,address)]]));
  assert.equal(e.run(16),0);assert.equal(new DataView(e.memory.buffer).getUint32(0,true),1);
  const byteLength=text.length*2,last=65536-byteLength;
  assert.equal(e.run(last),0);assert.deepEqual(units(e,last,text),expected(text));
  new Uint8Array(e.memory.buffer,last,byteLength).fill(0x91);
  const before=Uint8Array.from(new Uint8Array(e.memory.buffer,last,byteLength));
  assert.throws(()=>e.run(last+1),WebAssembly.RuntimeError);
  assert.deepEqual(new Uint8Array(e.memory.buffer,last,byteLength),before);
  assert.equal(new DataView(e.memory.buffer).getUint32(0,true),3);
  assert.throws(()=>e.run(-1),WebAssembly.RuntimeError);
});

test('Given a long ordinary source string When emitted Then code size remains bounded while every UTF16 unit remains exact',()=>{
  const text='source😀\ud800\r\n'.repeat(1024),{bytes,e}=emit(program([['run',copy(text)]]));
  assert(bytes.length<text.length*2+256,'source units belong to static data, not per-unit instructions');
  assert.equal(e.run(8),0);assert.deepEqual(units(e,8,text),expected(text));
  assert.equal(e.run(32768),0);assert.deepEqual(units(e,32768,text),expected(text));
});

test('Given debug emission When static copying traps Then the original source range and real instruction address remain recorded',()=>{
  const span={filename:'静态😀.eli',start:2,end:9,line:1,column:3,endLine:1,endColumn:10};
  const input=program([['run',{...copy('😀'),span}]]);
  const artifact=backend.wasm.emit_typed_memory_wasm_artifact(input,{initialPages:1,maximumPages:1});
  const module=new WebAssembly.Module(Uint8Array.from(artifact.bytes));
  assert.deepEqual(WebAssembly.Module.imports(module),[]);
  const e=new WebAssembly.Instance(module).exports;
  assert.throws(()=>e.run(65535),WebAssembly.RuntimeError);
  assert(artifact.debug.ranges.some(range=>range.kind==='memory-data-copy'&&range.span?.filename===span.filename));
  assert(artifact.debug.trapSites.some(site=>site.address>0));
});

test('Given malformed internal data nodes When emitted Then the existing backend refusal precedes module construction',()=>{
  for(const bad of [copy(null),copy([1,2]),node('memory-data-copy','x',[]),
    node('memory-data-copy','x',[constant(0),constant(1)]),node('memory-data-copy','x',[null]),
    node('memory-data-copy','x',[{...constant(0),type:'f64'}]),
    {...copy('x'),type:'f64'}])assert.throws(()=>emit(program([['bad',bad]])),rejection);
  const numeric=program([['bad',copy('x')]]);numeric.abi='numeric-f64';
  assert.throws(()=>backend.wasm.emit_typed_numeric_wasm(numeric),rejection);
});

test('Given frozen reusable typed input When ordinary and debug emitters allocate scratch Then later consumers retain the original locals and indirect calls',()=>{
  const text='source\0😀\ud800';
  const counter=node('memory-op','store-u32',[constant(0),node('word-arithmetic','+',[
    node('memory-op','load-u32',[constant(0)]),constant(1)])]);
  const input=program([
    ['copy',copy(text,node('sequence',null,[counter,local(0)]))],
    ['indirect',node('call-indirect',1,[local(0),constant(0)])],
  ]);
  input.table=[0];input.indirectArities=[1];
  input.metadata={filename:'保留😀.eli',zero:-0,values:[NaN,Infinity,-Infinity]};
  const before=structuredClone(input);freezeTree(input);
  const first=emit(input),second=emit(input);
  assert.deepEqual(input,before);
  assert.deepEqual(first.bytes,second.bytes,'repeated emission must not accumulate scratch locals or signature metadata');
  assert.equal(first.e.indirect(32),0);assert.deepEqual(units(first.e,32,text),expected(text));
  assert.equal(new DataView(first.e.memory.buffer).getUint32(0,true),1);
  const options=freezeTree({initialPages:1,maximumPages:2});
  const debug=backend.wasm.emit_typed_memory_wasm_artifact(input,options);
  const debugAgain=backend.wasm.emit_typed_memory_wasm_artifact(input,options);
  assert.deepEqual(debug.bytes,debugAgain.bytes);
  assert.deepEqual(input,before);assert.deepEqual(options,{initialPages:1,maximumPages:2});
  const e=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(debug.bytes))).exports;
  assert.equal(e.indirect(64),0);assert.deepEqual(units(e,64,text),expected(text));
  for(const fn of input.functions){
    assert.equal(fn.locals.length,1);
    assert(!Object.hasOwn(fn.body,'signatureIndex'));
  }
  const store=input.functions[0].body.children[0].children[0];
  assert(!Object.hasOwn(store,'addressLocal'));assert(!Object.hasOwn(store,'valueLocal'));
});

test('Given frozen numeric input When the public typed emitter copies its working tree Then IEEE literals and all original metadata remain exact',()=>{
  const values=[-0,NaN,Infinity,-Infinity],input=program(values.map((value,index)=>['number'+index,{...constant(value),type:'f64'}]));
  input.abi='numeric-f64';
  for(const fn of input.functions)fn.locals[0].type='f64';
  input.metadata={source:'\0😀\ud800',negativeZero:-0,nonFinite:[NaN,Infinity,-Infinity]};
  const before=structuredClone(input);freezeTree(input);
  const first=Uint8Array.from(backend.wasm.emit_typed_numeric_wasm(input));
  const second=Uint8Array.from(backend.wasm.emit_typed_numeric_wasm(input));
  assert.deepEqual(first,second);assert.deepEqual(input,before);
  const e=new WebAssembly.Instance(new WebAssembly.Module(first)).exports;
  for(const [index,value]of values.entries())assert(Object.is(e['number'+index](0),value));
});

test('Given malformed static-copy destinations When either public memory emitter refuses Then the original parent span and unchanged input survive the failure',()=>{
  const span={filename:'坏目标😀.eli',start:4,end:12,line:3,column:5,endLine:3,endColumn:13};
  for(const children of [[null],[undefined],[3],[[]],[{type:'u32'}],
    [{...constant(0),children:null}],[{...constant(0),type:'f64'}],[],[constant(0),constant(1)]]){
    const input=program([['bad',{...node('memory-data-copy','x',children),span}]]),before=structuredClone(input);
    freezeTree(input);
    for(const method of ['emit_typed_memory_wasm','emit_typed_memory_wasm_artifact']){
      assert.throws(()=>backend.wasm[method](input,{initialPages:1,maximumPages:1}),error=>{
        assert.equal(error.eliscriptDiagnostic?.code,'ELI-B0001');
        assert.equal(error.eliscriptDiagnostic.location.file,span.filename);
        assert.deepEqual(error.eliscriptDiagnostic.location.start,{line:span.line,column:span.column});
        return true;
      });
      assert.deepEqual(input,before);
    }
  }
  const valid=emit(program([['recovered',copy('恢复😀')]]));
  assert.equal(valid.e.recovered(16),0);assert.deepEqual(units(valid.e,16,'恢复😀'),expected('恢复😀'));
});

test('Given a shared typed DAG When private snapshots complete Then equivalent occurrences share within the function without expanding retained trees',()=>{
  let root=constant(7);
  for(let depth=0;depth<12;depth++)root=node('sequence',null,[root,root]);
  freezeTree(root);
  const output=snapshot.copy_wasm_expression(root,null,true),seen=new Set(),pending=[output];
  assert.notEqual(output,root);assert.notEqual(output.children,root.children);
  while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);
    if(current.children.length){assert.equal(current.children[0],current.children[1]);pending.push(...current.children);}}
  assert.equal(seen.size,13,'the private result retains the original DAG size, not one node per traversal path');
  assert.equal(snapshot.copy_wasm_expression(root,null,true).children[0]===output.children[0],false,
    'independent function snapshots never share private scratch-bearing nodes');
});

test('Given repeated getter-bearing nodes When each occurrence is snapshotted Then reads IEEE values symbols and thrown identities retain their original order',()=>{
  const values=[-0,0,NaN,NaN],reads=[];
  const source={kind:'literal',type:'f64',get value(){const index=reads.length;reads.push(index);return values[index];},children:[]};
  const output=snapshot.copy_wasm_expression(node('sequence',null,[source,source,source,source]),null,false);
  assert.deepEqual(reads,[0,1,2,3]);
  assert(Object.is(output.children[0].value,-0));assert(Object.is(output.children[1].value,0));
  assert.notEqual(output.children[0],output.children[1]);
  assert.equal(output.children[2],output.children[3],'identical private NaN snapshots may share after both getters ran');

  const symbol=Symbol('original metadata'),symbolValues=[-0,0];let symbolReads=0;
  const symbolSource=constant(1);
  Object.defineProperty(symbolSource,symbol,{enumerable:true,get(){return symbolValues[symbolReads++];}});
  const symbolic=snapshot.copy_wasm_expression(node('sequence',null,[symbolSource,symbolSource]),null,true);
  assert.equal(symbolReads,2);assert.notEqual(symbolic.children[0],symbolic.children[1]);
  assert(Object.is(symbolic.children[0][symbol],-0));assert(Object.is(symbolic.children[1][symbol],0));

  const marker=new Error('original second occurrence getter failure');let calls=0;
  const failing={...constant(0),get value(){if(++calls===2)throw marker;return 0;}};
  const invalid=program([['run',node('sequence',null,[failing,failing])]]);
  assert.throws(()=>backend.wasm.emit_typed_memory_wasm(invalid,{initialPages:0}),error=>error===marker);
  assert.equal(calls,2,'upfront snapshot failure still precedes later memory option validation');
  assert.equal(emit(program([['recovered',constant(17)]])).e.recovered(0),17);
});

test('Given shared nodes across functions with distinct locals When memory and indirect scratch is prepared Then exact bytes debug and frozen inputs match expanded input',()=>{
  const span={filename:'共享😀.eli',start:0,end:1,line:1,column:1,endLine:1,endColumn:2};
  const sharedLoad=node('memory-op','load-u32',[local(0)],{span});
  const sharedIndirect=node('call-indirect',1,[local(0),constant(0)],{span});
  const input=program([
    ['load',node('sequence',null,[sharedLoad,sharedLoad])],
    ['other',node('sequence',null,[copy('原\0😀',constant(128)),sharedLoad])],
    ['indirect',sharedIndirect],['otherIndirect',sharedIndirect],
  ]);
  input.functions[1].locals.push({name:'existing-word',index:1,type:'u32'},{name:'existing-float',index:2,type:'f64'});
  input.functions[3].locals.push({name:'existing-word',index:1,type:'u32'});
  input.table=[0];input.indirectArities=[1];
  // An independent complete tree reference has no shared expression identities
  // for the production copier to intern. It retains all original field order.
  const expand=value=>Array.isArray(value)?value.map(expand):value&&typeof value==='object'
    ?Object.fromEntries(Reflect.ownKeys(value).map(key=>[key,expand(value[key])])):value;
  const expanded=expand(input),before=structuredClone(input);freezeTree(input);
  const actual=emit(input),reference=emit(expanded);
  assert.deepEqual(actual.bytes,reference.bytes);
  const left=backend.wasm.emit_typed_memory_wasm_artifact(input,{initialPages:1,maximumPages:2});
  const right=backend.wasm.emit_typed_memory_wasm_artifact(expanded,{initialPages:1,maximumPages:2});
  assert.deepEqual(left.bytes,right.bytes);assert.deepEqual(left.debug,right.debug);
  new DataView(actual.e.memory.buffer).setUint32(16,0x12345678,true);
  for(const name of ['load','other','indirect','otherIndirect'])assert.equal(actual.e[name](16),0x12345678);
  assert.deepEqual(units(actual.e,128,'原\0😀'),expected('原\0😀'));
  assert.deepEqual(input,before);
  assert.deepEqual(emit(input).bytes,actual.bytes);
});

test('Given later malformed typed input When upfront snapshotting fails Then the exact later source error precedes earlier body and memory option failures',()=>{
  const span={filename:'后续😀.eli',start:2,end:3,line:4,column:3,endLine:4,endColumn:4};
  const input=program([['first',node('unknown-kind',null)],['later',copy('bad',null)]]);
  input.functions[1].body.span=span;freezeTree(input);
  for(const method of ['emit_typed_memory_wasm','emit_typed_memory_wasm_artifact']){
    assert.throws(()=>backend.wasm[method](input,{initialPages:0}),error=>{
      assert.equal(error.eliscriptDiagnostic?.code,'ELI-B0001');
      assert.equal(error.eliscriptDiagnostic.location.file,span.filename);
      assert.match(error.message,/static UTF16 copy/);return true;
    });
  }
});

function trackedValidationWorkspace(){
  class TrackedSet extends Set{
    peak=0;clears=0;deleted=0;peakDeleted=0;
    add(value){super.add(value);this.peak=Math.max(this.peak,this.size);return this;}
    delete(value){const removed=super.delete(value);if(removed)this.deleted++;
      this.peakDeleted=Math.max(this.peakDeleted,this.deleted);return removed;}
    clear(){super.clear();this.clears++;this.deleted=0;}
  }
  const work=snapshot.make_wasm_validation_workspace();work.seen=new TrackedSet();work.active=new TrackedSet();return work;
}

test('Given a wide shared fresh graph When the validation memo fills Then every edge remains checked and forgotten subtrees are revisited within bounded caches',()=>{
  const work=trackedValidationWorkspace(),empty=Object.freeze([]);let kinds=0,childReads=0;
  const shared=Object.freeze({get kind(){kinds++;return'literal';},type:'u32',value:7,
    get children(){childReads++;return empty;}});
  const unique=Array.from({length:65543},(_,index)=>Object.freeze({...constant(index),children:empty}));
  const children=Object.freeze([shared,shared,...unique,shared]),root=Object.freeze(node('sequence',null,children));
  assert.equal(snapshot.validate_fresh_wasm_expression(root,null,true,work),root);
  assert.equal(kinds,3,'each repeated incoming edge retains its node contract check');
  assert.equal(childReads,5,'the late shared leaf is fully revisited after the finite memo forgets it');
  assert(work.seen.peak<=65536);assert(work.seen.clears>=2);
  assert(work.active.peak<=2);assert(work.active.clears>10);
  assert(work.active.peakDeleted<=4096,'wide traversal cannot retain unbounded active-set tombstones');
  assert.equal(work.active.size,0);assert.equal(work.nodes.length,2);assert.equal(work.positions.length,2);
  assert(work.nodes.every(value=>value===null),'the reusable depth storage releases completed source nodes');
  assert.equal(root.children,children);assert.equal(root.children.at(-1),shared);
});

test('Given deep fresh graphs When active membership is rebuilt Then all current ancestors remain protected and the same workspace recovers from a cycle',()=>{
  const work=trackedValidationWorkspace();let deep=Object.freeze({...constant(9),children:Object.freeze([])});
  for(let depth=0;depth<12000;depth++)deep=Object.freeze(node('sequence',null,Object.freeze([deep])));
  assert.equal(snapshot.validate_fresh_wasm_expression(deep,null,true,work),deep);
  assert.equal(work.nodes.length,12001);assert.equal(work.positions.length,12001);
  assert.equal(work.active.peak,12001);assert(work.active.clears>2);assert.equal(work.active.size,0);
  assert(work.nodes.every(value=>value===null));

  const path=Array.from({length:6500},()=>node('sequence',null));
  for(let index=0;index<path.length-1;index++)path[index].children=[path[index+1]];
  path.at(-1).children=[path[2500]];
  path[2500].span={filename:'cycle-after-rebuild.eli',start:1,end:2,line:3,column:2,endLine:3,endColumn:3};
  for(const current of path){Object.freeze(current.children);Object.freeze(current);}
  assert.throws(()=>snapshot.validate_fresh_wasm_expression(path[0],null,true,work),error=>{
    assert.equal(error.eliscriptDiagnostic?.code,'ELI-B0001');
    assert.equal(error.eliscriptDiagnostic.location.file,'cycle-after-rebuild.eli');
    assert.match(error.message,/cyclic child graph/);return true;
  });
  const valid=constant(11);assert.equal(snapshot.validate_fresh_wasm_expression(valid,null,true,work),valid);
  assert.equal(work.active.size,0);assert(work.nodes.every(value=>value===null));
});

test('Given malformed fresh input after a full memo When DFS reaches its original first edge Then exact source ownership and later-function refusal remain unchanged',()=>{
  const work=trackedValidationWorkspace();
  const first=copy('bad',null);first.span={filename:'first-after-flush.eli',start:1,end:2,line:4,column:2,endLine:4,endColumn:3};
  const second={...constant(1),children:null,span:{filename:'later.eli',start:0,end:1,line:1,column:1,endLine:1,endColumn:2}};
  const root=node('sequence',null,[...Array.from({length:65540},(_,index)=>constant(index)),first,second]);
  const refuse=error=>{assert.equal(error.eliscriptDiagnostic?.code,'ELI-B0001');
    assert.equal(error.eliscriptDiagnostic.location.file,'first-after-flush.eli');assert.match(error.message,/static UTF16 copy/);return true;};
  assert.throws(()=>snapshot.validate_fresh_wasm_expression(root,null,true,work),refuse);
  assert(work.seen.peak<=65536);assert(work.seen.clears>=2);
  const input=program([['earlier',constant(1)],['later',root]]);
  assert.throws(()=>snapshot.validate_fresh_typed_wasm_program(input),refuse);
  const recovered=program([['one',constant(1)],['two',constant(2)]]);
  assert.equal(snapshot.validate_fresh_typed_wasm_program(recovered),recovered);
});

async function completeRuntime() {
  if(!actualRuntime){
    actualRuntime=backend.compiler.compile_ir_string(await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8'),
      'bootstrap/runtime/memory.eli');
    freezeTree(actualRuntime);
  }
  return actualRuntime;
}
function canonicalHash(input){
  return createHash('sha256').update(backend.compiler.serialize_ir_program(input)).digest('hex');
}
const productMemory={initialPages:64,maximumPages:256};
function originalManagedProduct(input,runtime,project,debug){
  const lowered=project?backend.managed.lower_managed_project(input,'first.mjs',runtime,{}):
    backend.managed.lower_managed_program(input,runtime);
  const artifact=debug?backend.wasm.emit_typed_memory_wasm_artifact(lowered.typed,productMemory):null;
  const bytes=backend.wasm.append_metadata_section(artifact?artifact.bytes:
    backend.wasm.emit_typed_memory_wasm(lowered.typed,productMemory),
    'eliscript-managed-control',JSON.stringify(lowered.descriptor));
  if(artifact)artifact.debug.moduleByteLength=bytes.length;
  return{bytes:Uint8Array.from(bytes),descriptor:lowered.descriptor,...(artifact?{debug:artifact.debug}:{})};
}

test('Given complete original runtime IR When source IR and cyclic projects emit owned WASM products Then exact legacy bytes debug and immutable sources survive',async()=>{
  const runtime=await completeRuntime(),runtimeBefore=canonicalHash(runtime);
  const single=backend.compiler.compile_ir_string('(defun work (x) (+ x 2)) (export work)','first.eli');
  const modules=[
    {id:'first.mjs',program:backend.compiler.compile_ir_string(
      '(import "./second.mjs" offset) (defun work (x) (+ x (offset))) (export work)','first.eli')},
    {id:'second.mjs',program:backend.compiler.compile_ir_string(
      '(import "./first.mjs" work) (defun offset () 2) (defun relay (x) (work x)) (export offset relay)','second.eli')},
  ];
  freezeTree(single);freezeTree(modules);
  const singleBefore=canonicalHash(single),modulesBefore=modules.map(record=>canonicalHash(record.program));
  for(const project of [false,true])for(const debug of [false,true]){
    const input=project?modules:single,expected=originalManagedProduct(input,runtime,project,debug);
    let calls=0;
    const configure=(...args)=>{calls++;assert.equal(args.length,0,'configuration cannot observe or replace private typed IR');
      return{memory:productMemory,debug};};
    const actual=project?backend.wasm.emit_managed_project_wasm_product(input,'first.mjs',runtime,{},configure):
      backend.wasm.emit_managed_ir_wasm_product(input,runtime,{},configure);
    assert.equal(calls,1);assert.equal(Object.hasOwn(actual,'typed'),false);
    assert.deepEqual(Object.keys(actual).sort(),debug?['bytes','debug','descriptor']:['bytes','descriptor']);
    assert.deepEqual(Uint8Array.from(actual.bytes),expected.bytes);
    assert.deepEqual(actual.descriptor,expected.descriptor);
    if(debug)assert.deepEqual(actual.debug,expected.debug);
    const instance=instantiateManagedRuntime(Uint8Array.from(actual.bytes));
    try{
      const argument=instance.number(40);let result;
      try{result=instance.invoke('work',[argument]);assert.equal(instance.readNumber(result),42);}
      finally{if(result!==undefined)instance.release(result);instance.release(argument);}
    }finally{instance.closeModule();instance.collect();assert.equal(instance.live(),0);assert.equal(instance.stats().frameDepth,0);}
  }
  assert.equal(canonicalHash(single),singleBefore);
  assert.deepEqual(modules.map(record=>canonicalHash(record.program)),modulesBefore);
  assert.equal(canonicalHash(runtime),runtimeBefore);
},120000);

test('Given owned managed products When lowering or output configuration throws Then original phase order primitive identity and recovery remain intact',async()=>{
  const runtime=await completeRuntime();
  const source=backend.compiler.compile_ir_string('(defun work (x) (+ x 2)) (export work)','first.eli');
  for(const [project,marker]of [[false,undefined],[true,false]]){
    let calls=0,caught=false;
    const configure=(...args)=>{calls++;assert.equal(args.length,0);throw marker;};
    try{
      if(project)backend.wasm.emit_managed_project_wasm_product([{id:'first.mjs',program:source}],'first.mjs',runtime,{},configure);
      else backend.wasm.emit_managed_ir_wasm_product(source,runtime,{},configure);
    }catch(error){caught=true;assert.equal(error,marker);}
    assert.equal(caught,true);assert.equal(calls,1);

    const invalid=structuredClone(source);invalid.body[0].kind='unknown-source-IR';let expected;
    try{
      if(project)backend.managed.lower_managed_project([{id:'first.mjs',program:invalid}],'first.mjs',runtime,{});
      else backend.managed.lower_managed_program(invalid,runtime);
    }catch(error){expected=error;}
    assert(expected instanceof Error);calls=0;
    const forbidden=()=>{calls++;throw new Error('configuration cannot precede lowering');};
    assert.throws(()=>project?backend.wasm.emit_managed_project_wasm_product([{id:'first.mjs',program:invalid}],
      'first.mjs',runtime,{abi:'unknown'},forbidden):backend.wasm.emit_managed_ir_wasm_product(invalid,runtime,{abi:'unknown'},forbidden),error=>{
        assert.equal(error.message,expected.message);assert.deepEqual(error.eliscriptDiagnostic,expected.eliscriptDiagnostic);return true;
      });
    assert.equal(calls,0);
  }
  const withBinding=backend.compiler.compile_ir_string(
    '(defconst increment 2) (defun work (x) (+ x increment)) (export work)','first.eli');
  for(const [project,program,abi]of [[false,source,'unknown'],[false,withBinding,'managed-control-v1'],
    [true,source,'managed-control-v1']]){
    let expected,calls=0;
    try{
      if(project)backend.managed.emit_managed_project_wasm([{id:'first.mjs',program}],'first.mjs',runtime,{abi});
      else backend.managed.emit_managed_wasm(program,runtime,{abi});
    }catch(error){expected=error;}
    // backend-fail's existing wire contract throws a diagnostic record, while
    // the source schema validator above throws an actual Error. Keep both.
    assert.equal(Object.getPrototypeOf(expected),Object.prototype);
    assert.equal(typeof expected.message,'string');
    assert.equal(expected.eliscriptDiagnostic?.code,'ELI-B0001');
    assert.equal(expected.eliscriptDiagnostic.phase,project?'managed-link':'managed-backend');
    const configure=()=>{calls++;return{memory:productMemory,debug:false};};
    assert.throws(()=>project?backend.wasm.emit_managed_project_wasm_product([{id:'first.mjs',program}],
      'first.mjs',runtime,{abi},configure):backend.wasm.emit_managed_ir_wasm_product(program,runtime,{abi},configure),error=>{
        assert.equal(Object.getPrototypeOf(error),Object.getPrototypeOf(expected));
        assert.equal(error.message,expected.message);assert.deepEqual(error.eliscriptDiagnostic,expected.eliscriptDiagnostic);return true;
      });
    assert.equal(calls,0,'legacy ABI refusal remains after lowering and before output configuration');
  }
  const recovered=backend.wasm.emit_managed_ir_wasm_product(source,runtime,{},()=>({memory:productMemory,debug:false}));
  assert(WebAssembly.validate(Uint8Array.from(recovered.bytes)));
},120000);
