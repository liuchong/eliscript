import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dir,'..');
const {buildBackends}=await import(pathToFileURL(resolve(root,'tools/backends/build.mjs')));
const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(root,'tools/backends/managed-runtime.mjs')));
let directory,b,runtime,sequence=0,fixture,fixtureBytes,fixtureReference;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-globals-red-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');fixture=b.compiler.compile_ir_string(await readFile(resolve(root,'tests/fixtures/wasm-managed-module-bindings.eli'),'utf8'),'module-bindings.eli');fixtureReference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(fixture)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function pair(source){const ir=b.compiler.compile_ir_string(source,'globals.eli');const javascript='// reference '+(++sequence)+'\n'+b.compiler.emit_ir_string(ir);const ref=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));const bytes=Uint8Array.from(b.managed.emit_managed_wasm(ir,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return {ref,bytes,a:instantiateManagedRuntime(bytes)};}
function number(a,name,args=[]){const x=a.invoke(name,args);try{return a.readNumber(x)}finally{a.release(x)}}
test('top-level bindings preserve exact primitive values and mutable module state',async()=>{
 const {ref,a}=await pair('(defconst zero -0.0) (defvar count 0) (defun get-zero () zero) (defun tick () (setq count (1+ count))) (export get-zero tick)');assert(Object.is(number(a,'get-zero'),ref.get_zero()));for(let i=0;i<8;i++)assert.equal(number(a,'tick'),ref.tick());finish(a);
});
test('module initializers run once in source order and may call later function declarations',async()=>{
 const {ref,a}=await pair('(defvar sequence 0) (defconst first (mark 1)) (defconst second (mark 2)) (mark 3) (defun mark (x) (setq sequence (+ (* sequence 10) x))) (defun result () (+ sequence first second)) (export result)');for(let i=0;i<4;i++)assert.equal(number(a,'result'),ref.result());finish(a);
});
test('lexical and captured locals shadow module bindings without changing the global cell',async()=>{
 const {ref,a}=await pair('(defvar value 7) (defun global-value () value) (defun local-value () (let ((value 8)) ((lambda () (setq value (1+ value)) value)))) (export global-value local-value)');assert.equal(number(a,'local-value'),ref.local_value());assert.equal(number(a,'global-value'),ref.global_value());finish(a);
});
test('the same module bytes create isolated owned globals in independent heaps',async()=>{
 const {bytes,a}=await pair('(defvar count 0) (defun tick () (setq count (1+ count))) (export tick)');const other=instantiateManagedRuntime(bytes);assert.equal(number(a,'tick'),1);assert.equal(number(a,'tick'),2);assert.equal(number(other,'tick'),1);finish(a);finish(other);
});
test('global object identity survives caller release and automatic collection',async()=>{
 const {a}=await pair('(defconst state (js-array 7)) (defun get-state () state) (defun allocate () (js-array 1 2 3)) (export get-state allocate)');a.auto(1);const saved=a.invoke('get-state');for(let i=0;i<96;i++){const x=a.invoke('allocate');a.release(x);a.collect();}const again=a.invoke('get-state');assert(a.keyEqual(saved,again));const first=a.get(again,0);assert.equal(a.readNumber(first),7);finish(a,[saved,again,first]);
});
test('uninitialized top-level reads reject module evaluation rather than inventing a value',async()=>{
 const source='(defconst first (read-later)) (defconst later 7) (defun read-later () later) (export read-later)',ir=b.compiler.compile_ir_string(source,'tdz.eli');
 const javascript=b.compiler.emit_ir_string(ir),control=spawnSync('node',['--input-type=module','--eval',javascript],{encoding:'utf8',timeout:30000});assert.equal(control.status,1);assert.match(control.stderr,/ReferenceError/);
 const bytes=Uint8Array.from(b.managed.emit_managed_wasm(ir,runtime));assert.throws(()=>instantiateManagedRuntime(bytes),e=>e.eliscriptDiagnostic?.code==='ELI-RT0008');
});

function instance(options={}){fixtureBytes??=Uint8Array.from(b.managed.emit_managed_wasm(fixture,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(fixtureBytes)),[]);const a=instantiateManagedRuntime(fixtureBytes,options);a.auto(1);return a;}
function readArray(a,array){const out=[];for(let i=0;i<a.length(array);i++){const x=a.get(array,i);try{out.push(x===null||typeof x==='boolean'||x===undefined?x:x.kind===4?a.readNumber(x):x.kind===14?readArray(a,x):a.readString(x));}finally{a.release(x);}}return out;}
function finish(a,values=[]){for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}

test('module value exports are live bindings and function getters retain source identity',()=>{
 const a=instance(),zero=a.getExport('negative-zero'),state=a.getExport('state'),alias=a.invoke('read-state'),key=a.string('self'),self=a.objectGet(state,key),functionExport=a.getExport('identity'),functionValue=a.invoke('identity-value');
 assert(Object.is(a.readNumber(zero),-0));assert(a.keyEqual(state,alias));assert(a.keyEqual(state,self));assert(a.keyEqual(functionExport,functionValue));
 const n=a.number(9),written=a.invoke('write-counter',[n]);a.release(written);const counter=a.getExport('counter');assert.equal(a.readNumber(counter),9);assert.equal(a.getExport('unset'),null);assert.equal(a.getExport('missing'),null);
 assert.throws(()=>a.getExport('not-exported'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('counter'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a,[zero,state,alias,key,self,functionExport,functionValue,n,counter]);
});

test('dynamic function exports follow reassignment and preserve optional rest and exact values',()=>{
 const a=instance(),zero=a.number(-0),nan=a.number(NaN),old=a.getExport('current');let out=a.invoke('current',[zero,nan,true]);assert.deepEqual(readArray(a,out),[-0,[NaN,true],0]);a.release(out);
 const identity=a.getExport('identity'),changed=a.invoke('set-current',[identity]);a.release(changed);out=a.invoke('current',[zero]);assert(Object.is(a.readNumber(out),-0));a.release(out);
 const actual=a.getExport('current');assert(a.keyEqual(actual,identity));assert(!a.keyEqual(actual,old));assert.throws(()=>a.invoke('identity',[]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a,[zero,nan,old,identity,actual]);
});

test('eager and deferred initialization execute exactly once and preserve existing caller roots',()=>{
 const a=instance({initializeModule:false}),keep=a.number(7),frame=a.frame(1);a.frameSet(frame,0,keep);
 assert.throws(()=>a.invoke('read-counter'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0008');assert.throws(()=>a.getExport('counter'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0008');assert.equal(a.stats().frameDepth,1);
 a.initializeModule();for(let i=0;i<4;i++)a.initializeModule();const log=a.getExport('initialization-log');assert.deepEqual(readArray(a,log),[1,2,3]);assert.equal(number(a,'tick'),1);a.initializeModule();assert.equal(number(a,'read-counter'),1);
 const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),7);a.leaveFrame(frame);finish(a,[keep,saved,log]);
});

test('closing module state releases unreachable graphs while caller-owned values retain their lifetime',()=>{
 const a=instance(),state=a.getExport('state'),log=a.getExport('initialization-log'),frame=a.frame(1);a.frameSet(frame,0,state);a.release(state);a.closeModule();a.collect();assert.equal(a.stats().frameDepth,1);const held=a.frameGet(frame,0);assert.equal(held.kind,13);assert.deepEqual(readArray(a,log),[1,2,3]);
 for(const operation of[()=>a.invoke('read-state'),()=>a.getExport('state'),()=>a.initializeModule()])assert.throws(operation,e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 a.release(held);a.release(log);a.leaveFrame(frame);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);a.closeModule();a.collect();assert.equal(a.live(),0);
});

test('module initialization failures are cached and discard partial globals without disturbing caller frames',()=>{
 const ir=b.compiler.compile_ir_string('(defconst saved (js-array 1 2 3)) (defconst bad (false)) (export saved)','failed-module.eli'),bytes=Uint8Array.from(b.managed.emit_managed_wasm(ir,runtime)),a=instantiateManagedRuntime(bytes,{initializeModule:false});a.auto(1);const keep=a.number(7),frame=a.frame(1);a.frameSet(frame,0,keep);
 for(let i=0;i<3;i++){assert.throws(()=>a.initializeModule(),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.collect();assert.equal(a.stats().frameDepth,1);assert.equal(a.live(),2);const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),7);a.release(saved);}
 assert.throws(()=>a.getExport('saved'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.leaveFrame(frame);a.release(keep);a.collect();assert.equal(a.live(),0);
});

test('actual initializer traps unwind entered frames and retain the original trap and caller value',async()=>{
 const source=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8'),start=source.indexOf('  (defun value-module-init (heap index value)'),end=source.indexOf('  (defun ',start+10);assert(start>=0&&end>start);
 const faulty=source.slice(0,start)+'  (defun value-module-init (heap index value) (load-u32 4294967295))\n'+source.slice(end),rt=b.compiler.compile_ir_string(faulty,'module-trap.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(fixture,rt)),{initializeModule:false});a.auto(1);const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
 assert.throws(()=>a.initializeModule(),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);a.collect();const saved=a.frameGet(frame,0);assert(Object.is(a.readNumber(saved),-0));assert.equal(a.live(),2);a.release(saved);a.leaveFrame(frame);a.release(keep);a.collect();assert.equal(a.live(),0);
});

test('actual capacity failure during declaration does not publish an initialized module or leak cells',()=>{
 const a=instance({maxSlots:8,initialBytes:4096,maxBytes:8192,initializeModule:false}),keep=a.number(7),frame=a.frame(1);a.frameSet(frame,0,keep);
 for(let i=0;i<2;i++){assert.throws(()=>a.initializeModule(),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');a.collect();assert.equal(a.stats().frameDepth,1);assert.equal(a.live(),2);}
 a.leaveFrame(frame);a.release(keep);a.collect();assert.equal(a.live(),0);
});


test('dynamic export calls snapshot their callee before argument getters mutate its binding',()=>{
 const a=instance(),value=a.number(7),identity=a.getExport('identity'),args=[value,false];Object.defineProperty(args,1,{get(){const changed=a.invoke('set-current',[identity]);a.release(changed);a.release(value);a.collect();return false;}});
 const out=a.invoke('current',args);assert.deepEqual(readArray(a,out),[7,[false],0]);a.release(out);finish(a,[identity]);
});

test('export TDZ precedes argument getters and noncallable values remain captured after getters',()=>{
 const a=instance({initializeModule:false});let evaluated=false;const args=[];Object.defineProperty(args,0,{get(){evaluated=true;return true;}});
 assert.throws(()=>a.invoke('current',args),e=>e.eliscriptDiagnostic?.code==='ELI-RT0008');assert.equal(evaluated,false);a.initializeModule();
 const identity=a.getExport('identity'),counterArgs=[];Object.defineProperty(counterArgs,0,{get(){evaluated=true;const changed=a.invoke('write-counter',[identity]);a.release(changed);a.collect();return true;}});
 assert.throws(()=>a.invoke('counter',counterArgs),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(evaluated,true);assert.equal(a.invoke('counter',[false]),false);finish(a,[identity]);
});


test('the requested module ABI supports function-only sources and refuses implicit profile changes',()=>{
 const ir=b.compiler.compile_ir_string('(defun identity (x) x) (export identity)','forced-module.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(ir,runtime,{abi:'managed-module-v1'})));a.initializeModule();const f=a.getExport('identity');assert.equal(f.kind,18);finish(a,[f]);
 assert.throws(()=>b.managed.emit_managed_wasm(fixture,runtime,{abi:'managed-control-v1'}),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 assert.throws(()=>b.managed.emit_managed_wasm(ir,runtime,{abi:'unknown'}),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});

test('the explicit module CLI emits executable state and refuses incompatible ABI and output targets',async()=>{
 const output=resolve(directory,'module-cli.wasm'),command=resolve(root,'tools/backends/compile.mjs'),input=resolve(root,'tests/fixtures/wasm-managed-module-bindings.eli');
 const result=spawnSync('bun',[command,'--abi','managed-module-v1','--target','wasm','-o',output,input],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
 const a=instantiateManagedRuntime(await readFile(output));assert.equal(number(a,'tick'),1);finish(a);
 for(const[abi,target]of[['managed-control-v1','wasm'],['managed-module-v1','js'],['managed-module-v1','native']]){
  const rejected=resolve(directory,abi+'-'+target+'.out'),child=spawnSync('bun',[command,'--abi',abi,'--target',target,'-o',rejected,input],{cwd:root,encoding:'utf8',timeout:30000});assert.notEqual(child.status,0);assert.equal(await Bun.file(rejected).exists(),false);
 }
},60000);


test('module globals cannot silently enable a shadowed builtin constructor even in dead code',()=>{
 for(const[source,filename]of[['(defvar globalThis nil) (defun f () (if false (new globalThis.Map) nil)) (export f)','shadow-globalThis.eli'],['(defconst Map nil) (defun f () (new (js* "Map"))) (export f)','shadow-Map.eli'],['(defvar Set nil) (defun f () (new (js* "Set"))) (export f)','shadow-Set.eli']]){
  const ir=b.compiler.compile_ir_string(source,filename),saved=JSON.stringify(ir);assert.throws(()=>b.managed.emit_managed_wasm(ir,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file===filename);assert.equal(JSON.stringify(ir),saved);
 }
});


function rawModule(){
 const ir=structuredClone(runtime);ir.body.push({kind:'export-declaration',value:null,children:['value-module-status','value-module-begin','value-module-declare','value-module-get','value-module-init','value-module-set','value-module-complete','value-module-close','value-module-check','value-module-abort'].map(value=>({kind:'reference',value,children:[]}))});
 const bytes=Uint8Array.from(b.wasm.emit_memory_wasm(ir));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,32768);
 const call=(name,...args)=>{const result=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return result;};call('heap-auto',1);return{e,heap,call};
}

test('a module cannot publish ready state while declared bindings remain uninitialized',()=>{
 const{e,heap,call}=rawModule();call('value-module-begin',1);call('value-module-declare',0,1);
 e['value-module-complete'](heap);assert.equal(e['last-error'](),8);assert.equal(call('value-module-status'),1);
 call('value-module-init',0,3);call('value-module-complete');assert.equal(call('value-module-status'),2);assert.equal(call('value-module-get',0),3);call('value-module-close');call('heap-collect');assert.equal(call('heap-live'),0);
});

test('raw module cells retain exact words reject invalid writes and keep reentrant ownership intact',()=>{
 const{e,heap,call}=rawModule(),keep=call('value-number',0,0x80000000);call('heap-pin',keep);const frame=call('frame-new',1);call('frame-set',frame,0,keep);call('heap-release',keep);call('value-module-begin',2);call('value-module-declare',0,0);call('value-module-declare',1,1);
 e['value-module-get'](heap,0);assert.equal(e['last-error'](),8);e['value-module-begin'](heap,2);assert.equal(e['last-error'](),3);assert.equal(call('value-module-status'),1);assert.equal(call('frame-depth'),1);
 e['value-module-init'](heap,0,4);assert.equal(e['last-error'](),1);e['value-module-get'](heap,0);assert.equal(e['last-error'](),8);call('value-module-init',0,keep);call('value-module-init',1,3);
 e['value-module-init'](heap,0,2);assert.equal(e['last-error'](),3);e['value-module-set'](heap,0,2);assert.equal(e['last-error'](),3);assert.equal(call('value-module-get',0),keep);call('value-module-complete');
 const next=call('value-number',1,0);call('value-module-set',1,next);call('heap-collect');assert.equal(call('value-module-get',1),next);call('value-module-close');call('heap-collect');assert.equal(call('frame-get',frame,0),keep);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('module metadata refuses missing helpers malformed indexes mismatched exports and changed signatures',()=>{
 const lowered=b.managed.lower_managed_program(fixture,runtime),raw=b.wasm.emit_typed_memory_wasm(lowered.typed);
 for(const mutate of[d=>{delete d.module;},d=>{d.module.initialize='heap-collect';},d=>{d.module.bindingCount=-1;},d=>{d.module.functionCount=0;},d=>{d.module.exports[0].kind=9;},d=>{d.module.exports[0].index=d.module.bindingCount;},d=>{d.module.exports.pop();},d=>{d.module.exports.push(d.module.exports[0]);},d=>{d.functions[0].bindingIndex++;},d=>{d.functions[0].callingConvention='unknown';},d=>{d.functions[0].arity=2;},d=>{d.functions[0].parameterKinds=[];},d=>{d.functions.find(f=>f.name==='read-state').arity=1;}]){
  const descriptor=structuredClone(lowered.descriptor);mutate(descriptor);const bytes=Uint8Array.from(b.wasm.append_metadata_section(raw,'eliscript-managed-control',JSON.stringify(descriptor)));assert.throws(()=>instantiateManagedRuntime(bytes),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 }
});

test('module selection refuses non-string ABI requests rather than changing profiles implicitly',()=>{
 const ir=b.compiler.compile_ir_string('(defun f () 1) (export f)','abi-options.eli');for(const abi of[false,true,0,{},[]])assert.throws(()=>b.managed.emit_managed_wasm(ir,runtime,{abi}),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});


test('initializer-created sibling closures retain shared local cells after its root frame is gone',async()=>{
 const{ref,a}=await pair('(defconst pair (let ((value 0)) (js-array (lambda () (setq value (1+ value))) (lambda () value)))) (defvar current nil) (defun set-current (f) (setq current f)) (export pair current set-current)');a.auto(1);
 const siblings=a.getExport('pair'),increment=a.get(siblings,0),read=a.get(siblings,1);
 for(let i=0;i<32;i++){let selected=a.invoke('set-current',[increment]);a.release(selected);assert.equal(number(a,'current'),ref.pair[0]());selected=a.invoke('set-current',[read]);a.release(selected);a.collect();assert.equal(number(a,'current'),ref.pair[1]());}
 finish(a,[siblings,increment,read]);
});

test('module lowering refuses malformed declarations duplicate bindings immutable writes and hidden initialization IR',()=>{
 for(const change of[p=>p.body[0].properties.mutable='true',p=>p.body[0].children.push({kind:'literal',value:9,children:[]}),p=>p.body[0].value='',p=>p.body[0].value='read',p=>p.body[1].children[0]={kind:'managed-global-init',globalEntry:{name:'x',index:0},children:[]}]){
  const ir=b.compiler.compile_ir_string('(defvar x 1) (defun read () x) (export read)','bad-module.eli');change(ir);const saved=JSON.stringify(ir);assert.throws(()=>b.managed.emit_managed_wasm(ir,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');assert.equal(JSON.stringify(ir),saved);
 }
 const ir=b.compiler.compile_ir_string('(defvar x 1) (defun write (v) (setq x v)) (export write)','readonly-module.eli');ir.body[0].properties.mutable=false;const saved=JSON.stringify(ir);assert.throws(()=>b.managed.emit_managed_wasm(ir,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');assert.equal(JSON.stringify(ir),saved);
});

test('a module artifact cannot masquerade as the original control ABI by stripping its descriptor',()=>{
 const ir=b.compiler.compile_ir_string('(defun f () 1) (export f)','stripped-module.eli'),lowered=b.managed.lower_managed_program(ir,runtime,true),descriptor=structuredClone(lowered.descriptor);descriptor.abi='managed-control-v1';delete descriptor.module;
 const bytes=Uint8Array.from(b.wasm.append_metadata_section(b.wasm.emit_typed_memory_wasm(lowered.typed),'eliscript-managed-control',JSON.stringify(descriptor)));assert.throws(()=>instantiateManagedRuntime(bytes),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
});


test('generated global assignments preserve independent exact-value models through repeated collection',()=>{
 const a=instance();let random=0x28f3a41;const next=()=>random=(Math.imul(random,1664525)+1013904223)>>>0;
 const scalar=x=>x===null||typeof x==='boolean'||x===undefined?x:x.kind===4?a.readNumber(x):a.readString(x);
 for(let i=0;i<128;i++){
  let expected;switch(next()%7){case 0:expected=undefined;break;case 1:expected=null;break;case 2:expected=false;break;case 3:expected=true;break;case 4:expected='中😀'+next();break;default:{const bits=new DataView(new ArrayBuffer(8));bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);expected=bits.getFloat64(0,true);}}
  const value=typeof expected==='number'?a.number(expected):typeof expected==='string'?a.string(expected):expected,returned=a.invoke('write-counter',[value]);assert(Object.is(scalar(returned),expected));a.release(returned);a.release(value);a.collect();const read=a.getExport('counter');assert(Object.is(scalar(read),expected));a.release(read);
 }finish(a);
});

test('raw module roots preserve NaN payloads and full binary64 words without arithmetic conversion',()=>{
 const{e,heap,call}=rawModule();call('value-module-begin',1);call('value-module-declare',0,1);call('value-module-init',0,0);call('value-module-complete');
 for(const[low,high]of[[0,0],[0,0x80000000],[1,0],[0xabcdef01,0x7ff80000],[1,0x7ff00000],[0x12345678,0xfff80000],[0,0x7ff00000],[0,0xfff00000],[0xffffffff,0x7fefffff]]){
  const value=call('value-number',low,high);call('value-module-set',0,value);call('heap-collect');const actual=call('value-module-get',0),offset=call('value-data',actual,4),view=new DataView(e.memory.buffer);assert.deepEqual([view.getUint32(offset,true),view.getUint32(offset+4,true)],[low,high]);
 }call('value-module-close');call('heap-collect');assert.equal(call('heap-live'),0);
});

test('independent Node executes the same module bytes and generated JavaScript with exact exports and cleanup',async()=>{
 const artifact=resolve(directory,'standalone-module.wasm'),javascript=resolve(directory,'standalone-module.mjs'),runner=resolve(directory,'node-module-runner.mjs');await writeFile(artifact,Uint8Array.from(b.managed.emit_managed_wasm(fixture,runtime)));await writeFile(javascript,b.compiler.emit_ir_string(fixture));
 await writeFile(runner,`import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{instantiateManagedRuntime}from${JSON.stringify(pathToFileURL(resolve(root,'tools/backends/managed-runtime.mjs')).href)};import*as ref from'./standalone-module.mjs';
 const bytes=await readFile(new URL('./standalone-module.wasm',import.meta.url));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);
 const negative=a.getExport('negative-zero');assert(Object.is(a.readNumber(negative),ref.negative_zero));a.release(negative);for(let i=0;i<64;i++){const result=a.invoke('tick');assert.equal(a.readNumber(result),ref.tick());a.release(result);a.collect();}
 const identity=a.getExport('identity'),direct=a.invoke('identity-value');assert(a.keyEqual(identity,direct));const changed=a.invoke('set-current',[identity]);a.release(changed);ref.set_current(ref.identity);const tiny=a.number(Number.MIN_VALUE),out=a.invoke('current',[tiny]);assert(Object.is(a.readNumber(out),ref.current(Number.MIN_VALUE)));for(const x of[identity,direct,tiny,out])a.release(x);
 const other=instantiateManagedRuntime(bytes);const first=other.invoke('tick');assert.equal(other.readNumber(first),1);other.release(first);other.closeModule();other.collect();assert.equal(other.live(),0);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);console.log('independent Node module execution passed');`);
 const result=spawnSync('node',[runner],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/independent Node module execution passed/);
});


test('an ordinary exported function failure keeps earlier global writes and does not poison the module',async()=>{
 const{a}=await pair('(defvar value 0) (defun fail-after-write () (setq value 7) (false) (setq value 99)) (defun read () value) (export value fail-after-write read)');a.auto(1);const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
 assert.throws(()=>a.invoke('fail-after-write'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);assert.equal(number(a,'read'),7);a.initializeModule();assert.equal(number(a,'read'),7);a.leaveFrame(frame);finish(a,[keep]);
});


test('logical module export names preserve full UTF16 while physical WASM names remain stable',async()=>{
 const variable='值\ud800',functionName='取😀\udfff',source=`(defconst ${variable} -0.0) (defun ${functionName} () ${variable}) (export ${variable} ${functionName})`,ir=b.compiler.compile_ir_string(source,'unicode-module.eli');
 const ref=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64'));assert(Object.is(Object.values(ref).find(x=>typeof x==='function')(),-0));
 const lowered=b.managed.lower_managed_program(ir,runtime);for(const[name,i]of[[variable,0],[functionName,1]])assert.deepEqual(lowered.descriptor.functions.find(x=>x.name===name).wireName,'__eliscript_export_'+i);
 const a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(ir,runtime))),value=a.getExport(variable),actual=a.invoke(functionName);assert(Object.is(a.readNumber(value),-0));assert(Object.is(a.readNumber(actual),-0));finish(a,[value,actual]);
});
