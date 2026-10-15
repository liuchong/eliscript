import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import{readFile,mkdtemp,rm}from'node:fs/promises';import{resolve}from'node:path';import{tmpdir}from'node:os';
import{buildBackends}from'../tools/backends/build.mjs';import{instantiateManagedRuntime}from'../tools/backends/managed-runtime.mjs';
let directory,b,runtime,rawBytes;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-descriptor-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');rawBytes=Uint8Array.from(b.wasm.emit_memory_wasm(runtime,{maximumPages:128}));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(rawBytes)),[]);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function raw(slots=14){const e=new WebAssembly.Instance(new WebAssembly.Module(rawBytes)).exports,r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'? (...a)=>v(...a)>>>0:v]));const h=r.heap_new(slots,4096,4096);assert(h);const object=r.value_object_new(h,3);assert(object);r.heap_pin(h,object);const n=r.value_number(h,0,0x80000000),key=r.value_string(h,1);r.value_unit_set(h,key,0,120);r.value_seal(h,key);r.heap_pin(h,key);assert.equal(r.value_object_put(h,object,key,n,2),1);const args=r.value_refs(h,7,2);assert(args);r.value_set(h,args,0,object);r.value_set(h,args,1,key);const frame=r.frame_new(h,2);assert(frame);r.frame_set(h,frame,0,args);r.frame_set(h,frame,1,object);r.heap_release(h,object);r.heap_release(h,key);r.heap_collect(h);r.heap_auto(h,1);return{r,h,object,n,key,args,frame};}
test('a complete ordinary descriptor fits its actual fourteen rooted slots under per-allocation GC',()=>{
 const{r,h,object,n,args,frame}=raw(),descriptor=r.value_object_reflection(h,args,2,2);assert(descriptor,'descriptor must fit the fixed slot budget');assert.equal(r.last_error(),0);assert.equal(r.frame_depth(h),1);assert.equal(r.value_kind(h,descriptor),13);assert(Object.is(new DataView(r.memory.buffer).getFloat64(r.value_data(h,n,4),true),-0));assert.equal(r.value_kind(h,object),13);r.frame_pop(h,frame);r.heap_collect(h);assert.equal(r.heap_live(h),0);
});
const source=`
 (defun describe (value key) (Object/getOwnPropertyDescriptor value key))
 (defun encode (value) (JSON/stringify value))
 (defun names (value) (JSON/stringify (Object/getOwnPropertyNames value)))
 (defun freeze (value) (Object/freeze value))
 (defun key (trace) (js-object :toString (lambda () (js-call trace :push "key") "x")))
 (defun ordered (value name trace) (Object/getOwnPropertyDescriptor value name (js-call trace :push "extra")))
 (defun prototype-probe ()
  (let ((root globalThis.Object.prototype) (value (js-object :x -0)))
   (put root :value 101) (put root :writable false) (put root :enumerable false) (put root :configurable false)
   (let ((descriptor (Object/getOwnPropertyDescriptor value "x")))
    (js-array (JSON/stringify (Object/getOwnPropertyNames descriptor)) (JSON/stringify descriptor)
     (Object/is (aref descriptor "value") -0)
     (Object/is (Object/getPrototypeOf descriptor) root)))))
 (export describe encode names freeze key ordered prototype-probe)`;
async function compiled(rt=runtime){const program=b.compiler.compile_ir_string(source,'descriptor.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64')),bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,rt));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return{js,bytes};}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const x=a.get(v,i);try{return read(a,x);}finally{a.release(x);}});return v;}
function finish(a,roots=[]){for(const x of roots)a.release(x);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('fresh mutable descriptor fields, ordering and flags match native independent ordinary, frozen, array and UTF16 oracles',async()=>{
 const{bytes}=await compiled(),a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const [reference,name,frozen]of[[{x:-0},'x',false],[{x:undefined},'x',false],[{x:7},'x',true],[[7,undefined],'0',false],[[7,undefined],'length',false],[[7],'0',true],['A😀','1',false],['A😀','length',false],[{x:7},'missing',false]]){
  const n=typeof reference==='object'&&!Array.isArray(reference)&&reference.x!==undefined?a.number(reference.x):undefined;
  const arrayValues=Array.isArray(reference)?reference.map(x=>typeof x==='number'?a.number(x):x):[];
  const target=typeof reference==='string'?a.string(reference):Array.isArray(reference)?a.sourceArray(arrayValues):a.sourceObject({x:n}),key=a.string(name);
  if(frozen){Object.freeze(reference);const same=a.invoke('freeze',[target]);assert(a.keyEqual(same,target));a.release(same);}
  const expected=Object.getOwnPropertyDescriptor(reference,name),out=a.invoke('describe',[target,key]);
  if(!expected)assert.equal(out,undefined);else{
   const names=a.invoke('names',[out]),encoded=a.invoke('encode',[out]);assert.equal(a.readString(names),JSON.stringify(Object.getOwnPropertyNames(expected)));assert.equal(a.readString(encoded),JSON.stringify(expected));
   const valueKey=a.string('value'),value=a.objectGet(out,valueKey);assert(Object.is(read(a,value),expected.value));a.release(value);
   const changed=a.number(19);a.objectSet(out,valueKey,changed);const updated=a.objectGet(out,valueKey);assert.equal(a.readNumber(updated),19);const again=a.invoke('describe',[target,key]);assert.equal(a.keyEqual(out,again),false);const original=a.objectGet(again,valueKey);assert(Object.is(read(a,original),expected.value));for(const x of[names,encoded,valueKey,changed,updated,again,original])a.release(x);
  }
  for(const x of[target,key,out,n,...arrayValues])a.release(x);a.collect();assert.equal(a.live(),0);
 }
 finish(a);
});
test('internal descriptor fields remain own data properties despite Object.prototype name collisions',async()=>{
 const{bytes,js}=await compiled(),fields=['value','writable','enumerable','configurable'],saved=fields.map(k=>Object.getOwnPropertyDescriptor(Object.prototype,k));let expected;
 try{expected=js.prototype_probe();}finally{for(const key of fields)delete Object.prototype[key];fields.forEach((key,i)=>{if(saved[i])Object.defineProperty(Object.prototype,key,saved[i]);});}
 const a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('prototype-probe');assert.deepEqual(read(a,out),expected);finish(a,[out]);
});
test('unchanged JS dispatch preserves Proxy descriptor traps, string-hint key conversion and ignored extra order',async()=>{
 const{js}=await compiled();
 const observe=fn=>{const trace=[],target=new Proxy({x:7},{getOwnPropertyDescriptor(value,key){trace.push('descriptor:'+key);return Reflect.getOwnPropertyDescriptor(value,key);}}),key={[Symbol.toPrimitive](hint){trace.push(hint);return'x';}};return{descriptor:fn(target,key,trace),trace};};
 const oracle=(target,key,trace)=>Object.getOwnPropertyDescriptor(target,key,trace.push('extra'));
 assert.deepEqual(observe(js.ordered),observe(oracle));assert.deepEqual(observe(js.ordered).trace,['extra','string','descriptor:x']);
});
test('true thirteen-slot OOM preserves original signed data and the caller frame without leaking partial descriptors',()=>{
 const{r,h,object,n,args,frame}=raw(13);assert.equal(r.value_object_reflection(h,args,2,2),0);assert.equal(r.last_error(),2);assert.equal(r.frame_depth(h),1);assert.equal(r.value_kind(h,object),13);assert(Object.is(new DataView(r.memory.buffer).getFloat64(r.value_data(h,n,4),true),-0));r.frame_pop(h,frame);r.heap_collect(h);assert.equal(r.heap_live(h),0);
});
test('a real label-construction trap keeps evaluation effects and caller roots while an earlier nullish failure wins',async()=>{
 const original=await readFile('bootstrap/runtime/memory.eli','utf8'),signature='(defun heap-reflection-label (heap label)';assert(original.includes(signature));
 const injected=b.compiler.compile_ir_string(original.replace(signature,signature+' (when (= label 2) (load-u32 4294967295))'),'descriptor-trap.eli'),{bytes}=await compiled(injected),a=instantiateManagedRuntime(bytes);a.auto(1);
 const value=a.number(-0),target=a.sourceObject({x:value}),trace=a.sourceArray([]),key=a.invoke('key',[trace]),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 assert.throws(()=>a.invoke('ordered',[undefined,key,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,trace),['extra']);assert.equal(a.stats().frameDepth,1);a.resize(trace,0);
 assert.throws(()=>a.invoke('ordered',[target,key,trace]),WebAssembly.RuntimeError);assert.deepEqual(read(a,trace),['extra','key']);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert(Object.is(a.readNumber(value),-0));a.leaveFrame(frame);finish(a,[value,target,trace,key,held]);
});
