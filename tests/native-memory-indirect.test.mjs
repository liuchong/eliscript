import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
let directory,b,memory,next=0;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-indirect-'));b=await buildBackends({outputRoot:directory});memory=await import(pathToFileURL(resolve(b.directory,'memory.mjs')).href);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const source=`(import "eliscript:memory32" call-source load-u8 load-u32 store-u8 store-u32)
(defun first (a b c d) (+ (+ a b) (+ c d)))
(defun second (a b c d) (+ (* a b) (* c d)))
(defun wrong (a) a)
(defun mark (value digit) (store-u32 0 (+ (* (load-u32 0) 10) digit)) value)
(defun dispatch (slot) (call-source (mark 1 1) (mark 2 2) (mark 3 3) (mark 4 4) (mark slot 5)))
(defun after (slot) (dispatch slot) (store-u8 8 99))
(defun target-trap (a b c d) (store-u8 9 77) (load-u32 65535))
(defun bounce (a b c d) (call-source a b c d 0))
(defun read (p) (load-u32 p))
(export dispatch after read)`;
function typed(text=source){return memory.lower_memory_program(b.compiler.compile_ir_string(text,'indirect.eli'));}
function table(program,names){program.table=names.map(name=>program.functions.find(f=>f.name===name).index);return program;}
async function pair(program,signatures,options={initialPages:1,maximumPages:16}){
 const wasmBytes=Uint8Array.from(b.wasm.emit_typed_memory_wasm(structuredClone(program),options));assert(WebAssembly.validate(wasmBytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes)),[]);
 const w=new WebAssembly.Instance(new WebAssembly.Module(wasmBytes)).exports;
 const file=resolve(directory,`indirect-${next++}.dylib`);await writeFile(file,Uint8Array.from(b.native.emit_typed_native_memory_library(program,'arm64-macos')));
 return {n:await openNativeMemory(file,signatures,options),w};
}

test('native typed memory accepts the existing static function table IR without mutating it',()=>{
 const program=table(typed(),['first','second','wrong','target-trap','bounce']),saved=JSON.stringify(program);
 assert.equal(typeof b.native.emit_typed_native_memory_object,'function');
 const first=Uint8Array.from(b.native.emit_typed_native_memory_object(program,'arm64-macos'));
 assert.deepEqual(first,Uint8Array.from(b.native.emit_typed_native_memory_object(program,'arm64-macos')));assert.equal(JSON.stringify(program),saved);
});

nativeTest('native call-source selects runtime table slots, checks signature/bounds, and preserves argument effects',async()=>{
 const {n,w}=await pair(table(typed(),['first','second','wrong','target-trap','bounce']),{dispatch:1,after:1,read:1});
 try{for(const [slot,expected] of [[0,10],[1,14],[4,10]]){
  n.write(new Uint8Array(12));new Uint8Array(w.memory.buffer).fill(0,0,12);
  assert.equal(n.invoke('dispatch',slot),expected);assert.equal(w.dispatch(slot)>>>0,expected);assert.equal(n.invoke('read',0),12345);assert.equal(w.read(0),12345);
 }
 for(const slot of [2,5,0x80000000,0xffffffff]){
  n.write(new Uint8Array(12));new Uint8Array(w.memory.buffer).fill(0,0,12);
  assert.throws(()=>n.invoke('after',slot),WebAssembly.RuntimeError);assert.throws(()=>w.after(slot),WebAssembly.RuntimeError);
  assert.equal(n.invoke('read',0),12345);assert.equal(n.read(8,1)[0],0);assert.equal(new Uint8Array(w.memory.buffer)[8],0);
 }
 n.write(new Uint8Array(12));assert.throws(()=>n.invoke('after',3),WebAssembly.RuntimeError);assert.equal(n.read(9,1)[0],77);assert.equal(n.read(8,1)[0],0);
 }finally{n.close();}
});

nativeTest('native raw call-source with an empty declared table traps after arguments without host imports',async()=>{
 const program=typed(),file=resolve(directory,'empty.dylib');
 await writeFile(file,Uint8Array.from(b.native.emit_native_memory_library(b.compiler.compile_ir_string(source,'indirect.eli'),'arm64-macos')));
 const n=await openNativeMemory(file,{dispatch:1,read:1});const w=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(b.wasm.emit_typed_memory_wasm(program)))).exports;
 try{assert.throws(()=>n.invoke('dispatch',0),WebAssembly.RuntimeError);assert.throws(()=>w.dispatch(0),WebAssembly.RuntimeError);assert.equal(n.invoke('read',0),12345);assert.equal(w.read(0),12345);}finally{n.close();}
});

test('native indirect validation rejects invalid table entries and undeclared or malformed signatures',()=>{
 const valid=table(typed(),['first']);
 for(const mutate of [p=>p.abi='numeric-f64',p=>p.table=[-1],p=>p.table=[p.functions.length],p=>p.table=[null],p=>p.indirectArities=[-1],p=>p.indirectArities=[65536],p=>{p.table=null;},p=>{p.functions.find(f=>f.name==='dispatch').body.children[0].value=3;}]){
  const p=structuredClone(valid);mutate(p);assert.throws(()=>b.native.emit_typed_native_memory_object(p,'arm64-macos'),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 }
});

nativeTest('the complete managed runtime executes native object captures, closures and GC through the real table',async()=>{
 const runtime=b.compiler.compile_ir_string(await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8')+'\n(defun invalid-function (heap) (value-function-new heap 4294967295 0)) (export invalid-function)','runtime.eli');
 const program=b.compiler.compile_ir_string(`
 (defun make (x) (let ((box (js-object :value x))) (lambda (step) (put box :value (+ (get box :value) step)) (get box :value))))
 (defun run (x) (let ((f (make x))) (+ (funcall f 2) (funcall f 3))))
 (export make run)`,'native-managed.eli');
 const lowered=b.managed.lower_managed_program(program,runtime),saved=JSON.stringify(lowered.typed);
 const signatures=Object.fromEntries(['heap-new','last-error','value-number','value-data','heap-pin','heap-release','heap-collect','heap-live','heap-auto','value-refs','value-set','value-source-invoke','invalid-function','frame-current','frame-depth','frame-unwind'].map(name=>[name,lowered.typed.functions.find(f=>f.name===name).arity]));
 for(const alias of lowered.typed.aliases)signatures[alias.name]=lowered.typed.functions.find(f=>f.name===alias.function).arity;
 const {n,w}=await pair(lowered.typed,signatures);
 assert.equal(JSON.stringify(lowered.typed),saved);
 const number=(invoke,heap,value)=>{const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);view.setFloat64(0,value,true);return invoke('value-number',heap,view.getUint32(0,true),view.getUint32(4,true));};
 const ni=(name,...args)=>n.invoke(name,...args),wi=(name,...args)=>w[name](...args)>>>0;
 const nread=(h,v)=>new DataView(n.read(ni('value-data',h,v,4),8).buffer).getFloat64(0,true);
 const wread=(h,v)=>new DataView(w.memory.buffer).getFloat64(wi('value-data',h,v,4),true);
 try{for(const [invoke,read] of [[wi,wread],[ni,nread]]){
  const heap=invoke('heap-new',64,4096,1048576);assert(heap>0);assert.equal(invoke('heap-auto',heap,1),1);
  const input=number(invoke,heap,10);assert(input>0);assert.equal(invoke('heap-pin',heap,input),1);
  const early=invoke('make',heap,input);assert(early>0,`${invoke===ni?'native':'WASM'} make error ${invoke('last-error')}`);assert.equal(invoke('heap-pin',heap,early),1);
  const result=invoke('run',heap,input);assert(result>0,`${invoke===ni?'native':'WASM'} run error ${invoke('last-error')}, live ${invoke('heap-live',heap)}`);assert.equal(invoke('last-error'),0);assert.equal(read(heap,result),27);
  const closure=invoke('make',heap,input);assert(closure>0);assert.equal(invoke('heap-pin',heap,closure),1);
  const step=number(invoke,heap,2);assert.equal(invoke('heap-pin',heap,step),1);
  const args=invoke('value-refs',heap,7,1);assert(args>0);assert.equal(invoke('heap-pin',heap,args),1);assert.equal(invoke('value-set',heap,args,0,step),1);
  for(const expected of [12,14,16]){invoke('heap-collect',heap);const result=invoke('value-source-invoke',heap,closure,args,1);assert(result>0);assert.equal(invoke('last-error'),0);assert.equal(read(heap,result),expected);}
  const invalid=invoke('invalid-function',heap);assert(invalid>0);assert.equal(invoke('heap-pin',heap,invalid),1);
  const target=invoke('frame-current',heap),depth=invoke('frame-depth',heap);
  assert.throws(()=>invoke('value-source-invoke',heap,invalid,args,1),WebAssembly.RuntimeError);
  // Both engines interrupt the runtime before its frame pop. The existing
  // managed adapter boundary must unwind to the recorded frame after a trap.
  assert(invoke('frame-depth',heap)>depth);assert.equal(invoke('frame-unwind',heap,target),1);assert.equal(invoke('frame-depth',heap),depth);
  for(const value of [input,early,closure,step,args,invalid])assert.equal(invoke('heap-release',heap,value),1);
  invoke('heap-collect',heap);assert.equal(invoke('heap-live',heap),0);
 }}finally{n.close();}
},120000);

nativeTest('native typed locals begin at zero rather than reusing prior callee stack bytes',async()=>{
 const program=typed('(defun poison () (let ((word 3735928559)) word)) (defun zero () 0) (defun run () (poison) (zero)) (export run)');
 const zero=program.functions.find(f=>f.name==='zero');zero.locals=[{name:'implicit-zero',type:'u32',index:0}];zero.body={kind:'local',type:'u32',value:0,children:[]};
 const {n,w}=await pair(program,{run:0});try{assert.equal(w.run(),0);assert.equal(n.invoke('run'),0);}finally{n.close();}
});

nativeTest('native typed indirect calls retain nine word arguments and existing export aliases',async()=>{
 const program=typed('(defun sum (a b c d e f g h i) (+ (+ (+ (+ (+ (+ (+ (+ a b) c) d) e) f) g) h) i)) (defun invoke (slot a b c d e f g h i) (sum a b c d e f g h i)) (export invoke)');
 const invoke=program.functions.find(f=>f.name==='invoke'),call=invoke.body.children[0];
 call.kind='call-indirect';call.value=9;call.children.push({kind:'local',type:'u32',value:0,children:[]});
 table(program,['sum']);program.indirectArities=[9];program.aliases=[{name:'invoke-alias',function:'invoke'}];
 const {n,w}=await pair(program,{invoke:10,'invoke-alias':10});
 try{for(const name of ['invoke','invoke-alias'])for(const values of [[1,2,3,4,5,6,7,8,9],[0xffffffff,0x80000000,3,4,5,6,7,8,9]]){
  const args=[0,...values];assert.equal(n.invoke(name,...args),w[name](...args)>>>0);assert.equal(n.invoke(name,...args),values.reduce((a,b)=>(a+b)>>>0,0));
 }
 assert.throws(()=>n.invoke('invoke-alias',1,1,2,3,4,5,6,7,8,9),WebAssembly.RuntimeError);
 }finally{n.close();}
});

test('native typed entry validation protects frame slots and alias identity',()=>{
 const program=table(typed(),['first']);
 for(const mutate of [p=>p.functions[0].locals[0].index=99,p=>p.functions[0].locals[0].type='f64',p=>p.functions[0].body.children[0]={kind:'local',type:'u32',value:999,children:[]},p=>p.aliases=[{name:'dispatch',function:'first'}],p=>p.aliases=[{name:'alias',function:'absent'}],p=>p.functions[0].arity=65536]){
  const bad=structuredClone(program);mutate(bad);assert.throws(()=>b.native.emit_typed_native_memory_library(bad,'arm64-macos'),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 }
});
