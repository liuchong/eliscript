import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
const root=resolve(import.meta.dir,'..'),sourceRoot=resolve(process.env.ELISCRIPT_NATIVE_MANAGED_SOURCE_ROOT??root);
let directory,b,normal,trapped,buildArtifact,runtimeSource;
const open=async(artifact,options={})=>(await import('../tools/backends/native-managed-runtime.mjs')).instantiateNativeManagedRuntime(artifact.path,artifact.lowered,{maxSlots:256,initialBytes:16384,maxBytes:1048576,maximumPages:32,...options});
const source=`(defconst marker 1)
(defun make (x) (let ((box (js-object :value x))) (lambda (step) (put box :value (+ (get box :value) step)) (get box :value))))
(defun call (callback step) (funcall callback step))
(defun transformed (array text) (js-array (js-call array :slice 1) (js-call text :toUpperCase)))
(defun caught (value) (try (throw value) (catch error error)))
(defun uncaught (value) (throw value))
(defun make-error (kind message) (cond ((= kind 0) (new (js* "Error") message)) ((= kind 1) (new (js* "TypeError") message)) ((= kind 2) (new (js* "RangeError") message)) (t (new (js* "SyntaxError") message))))
(defun error-summary (error) (js-array (aref error "name") (aref error "message")))
(defun diagnosis (mode) (try (if mode (Math/round (js-object :valueOf (lambda () (js-object)) :toString (lambda () (js-object)))) (js-call 1 :toString 1)) (catch error (js-array (aref error "name") (aref (aref error "eliscriptDiagnostic") "code")))))
(defun tdz (input) (let ((a 99)) (try (throw input) (catch {:strs [a] :or {a a}} a))))
(defun repeat-text (text count) (js-call text :repeat count))
(defun fault (text start) (js-call text :indexOf "x" start))
(export make call transformed caught uncaught make-error error-summary diagnosis tdz repeat-text fault)`;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-managed-'));
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);
 b=await buildBackends({outputRoot:directory});
 const nativeModule=resolve(b.directory,'native-under-test.mjs');await writeFile(nativeModule,b.compiler.compile_string(await readFile(resolve(root,'bootstrap/backends/native.eli'),'utf8'),'native.eli'));b.native=await import(pathToFileURL(nativeModule).href);
 runtimeSource=await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8');
 buildArtifact=async function(runtimeSource,name,text=source){
  const program=b.compiler.compile_ir_string(text,'native-managed-adapter.eli');
  const runtime=b.compiler.compile_ir_string(runtimeSource,`${name}-runtime.eli`),lowered=b.managed.lower_managed_program(program,runtime,true);
  const wasm=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime,{abi:'managed-module-v1',maximumPages:32}));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);
  const path=resolve(directory,`${name}.dylib`);await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));return {path,lowered,wasm};
 }
 normal=await buildArtifact(runtimeSource,'normal');
 trapped=await buildArtifact(runtimeSource.replace(definition(runtimeSource,'heap-text-search-unit'),'(defun heap-text-search-unit (data length index reverse) (load-u16 4294967295))'),'trap');
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function value(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14||v?.kind===7){return Array.from({length:a.length(v)},(_,i)=>{const child=a.get(v,i);try{return value(a,child);}finally{a.release(child);}});}return v;}
function box(a,v){return typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;}
function finish(a,values=[]){for(const v of values)a.release(v);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);a.close?.();}
function wasm(artifact=normal,options={}){return instantiateManagedRuntime(artifact.wasm,{maxSlots:256,initialBytes:16384,maxBytes:1048576,...options});}

nativeTest('native managed adapter executes object captures and escaped closures with the existing WASM API',async()=>{
 const adapters=[wasm(),await open(normal)];
 assert.deepEqual(Object.keys(adapters[1]).filter(name=>name!=='close'),Object.keys(adapters[0]));
 for(const [name,member] of Object.entries(adapters[0]))if(typeof member==='function')assert.equal(adapters[1][name].length,member.length,name);
 for(const a of adapters){a.auto(1);const ten=a.number(10),two=a.number(2),fn=a.invoke('make',[ten]);a.collect();
  for(const expected of [12,14,16]){const out=a.invoke('call',[fn,two]);assert.equal(a.readNumber(out),expected);a.release(out);a.collect();}
  finish(a,[ten,two,fn]);
 }
});

nativeTest('native managed array and Unicode text transfers preserve roots, holes and copied results',async()=>{
 for(const a of [wasm(),await open(normal)]){a.auto(1);const one=a.number(1),text=a.string('a中😀\ud800'),input=a.sourceArray([one,,undefined,text]),out=a.invoke('transformed',[input,text]);
  assert.deepEqual(value(a,out),[[undefined,undefined,'a中😀\ud800'],'A中😀\ud800']);assert.equal(a.length(input),4);
  const bytes=a.bytes([1,2,3]),copy=a.readBytes(bytes);copy[0]=99;assert.deepEqual(a.readBytes(bytes),Uint8Array.of(1,2,3));a.release(bytes);
  finish(a,[one,text,input,out]);
 }
});

nativeTest('native managed source throws retain primitive and object identity and Error class semantics',async()=>{
 for(const a of [wasm(),await open(normal)]){a.auto(1);const retained=[];
  for(const v of [null,undefined,false,true,0,-0,NaN,'中\ud800']){
   const input=box(a,v);retained.push(input);const out=a.invoke('caught',[input]);assert.deepEqual(value(a,out),v);a.release(out);
   let entered=false;try{a.invoke('uncaught',[input]);}catch(error){entered=true;if(input&&typeof input==='object'){assert(a.keyEqual(input,error));a.release(error);}else assert.equal(error,input);}assert(entered);assert.equal(a.stats().frameDepth,0);
  }
  const object=a.sourceObject({});retained.push(object);let thrown;try{a.invoke('uncaught',[object]);}catch(error){thrown=error;}assert(a.keyEqual(thrown,object));retained.push(thrown);
  for(const [kind,name] of ['Error','TypeError','RangeError','SyntaxError'].entries()){const k=a.number(kind),message=a.string('message'),error=a.invoke('make-error',[k,message]),summary=a.invoke('error-summary',[error]);assert.deepEqual(value(a,summary),[name,'message']);retained.push(k,message,error,summary);}
  assert.throws(()=>a.invoke('tdz',[object]),e=>e instanceof ReferenceError&&e.eliscriptDiagnostic?.code==='ELI-RT0012');
  for(const [mode,expected] of [[true,['TypeError','ELI-RT0003']],[false,['RangeError','ELI-RT0010']]]){const out=a.invoke('diagnosis',[mode]);assert.deepEqual(value(a,out),expected);a.release(out);}
  finish(a,retained);
 }
});

nativeTest('native managed fault injection automatically unwinds private roots and preserves the caller frame',async()=>{
 for(const a of [wasm(trapped),await open(trapped)]){a.auto(1);const text=a.string('xxx'),bad=a.sourceObject({}),good=a.number(0),frame=a.frame(1);a.frameSet(frame,0,text);
  assert.throws(()=>a.invoke('fault',[text,bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);
  assert.throws(()=>a.invoke('fault',[text,good]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.readString(text),'xxx');
  const retained=a.frameGet(frame,0);assert(a.keyEqual(retained,text));a.release(retained);a.leaveFrame(frame);finish(a,[text,bad,good]);
 }
});

nativeTest('native managed loader owns close and validates descriptor failure without a WASM execution wrapper',async()=>{
 const oldModule=WebAssembly.Module,oldInstance=WebAssembly.Instance;let a;
 try{WebAssembly.Module=function(){throw Error('native loading must not construct WASM');};WebAssembly.Instance=function(){throw Error('native execution must not construct WASM');};a=await open(normal);const v=a.number(7);assert.equal(a.readNumber(v),7);a.release(v);}finally{WebAssembly.Module=oldModule;WebAssembly.Instance=oldInstance;}
 a.close();a.close();for(const run of [()=>a.number(1),()=>a.collect(),()=>a.release(null),()=>a.stats()])assert.throws(run,/closed/);
 const invalid={...normal,lowered:{...normal.lowered,descriptor:{...normal.lowered.descriptor,version:99}}};await assert.rejects(open(invalid),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 const next=await open(normal,{initializeModule:false});assert.throws(()=>next.invoke('caught',[null]),e=>e instanceof ReferenceError&&e.eliscriptDiagnostic?.code==='ELI-RT0008');next.initializeModule();finish(next);
});

nativeTest('native managed initialization caches exact thrown values and can close failed modules',async()=>{
 for(const thrown of ['nil','undefined','false','(new (js* "TypeError") "initialization")']){
  const artifact=await buildArtifact(runtimeSource,`initialize-${thrown.length}`,`(defconst failed (throw ${thrown})) (defun entry () failed) (export entry)`);
  for(const a of [wasm(artifact,{initializeModule:false}),await open(artifact,{initializeModule:false})]){
   const errors=[];for(let i=0;i<2;i++){let entered=false;try{a.initializeModule();}catch(error){entered=true;errors.push(error);}assert(entered);assert.equal(a.stats().frameDepth,0);}
   if(thrown==='nil')assert.deepEqual(errors,[null,null]);else if(thrown==='undefined')assert.deepEqual(errors,[undefined,undefined]);else if(thrown==='false')assert.deepEqual(errors,[false,false]);else{assert(a.keyEqual(errors[0],errors[1]));const key=a.string('message'),message=a.objectGet(errors[0],key);assert.equal(a.readString(message),'initialization');a.release(key);a.release(message);
    a.closeModule();a.collect();const nameKey=a.string('name'),name=a.objectGet(errors[0],nameKey);assert.equal(a.readString(name),'TypeError');a.release(nameKey);a.release(name);}
   finish(a,errors);
  }
  let entered=false;try{await open(artifact);}catch(error){entered=true;if(thrown==='nil')assert.equal(error,null);else if(thrown==='undefined')assert.equal(error,undefined);else if(thrown==='false')assert.equal(error,false);else assert.equal(error?.kind,13);}assert(entered);
 }
},120000);

nativeTest('native managed instances reject foreign handles and closing during getters cannot reuse a freed mapping',async()=>{
 const a=await open(normal),b=await open(normal),number=a.number(2),other=b.number(3);
 assert.throws(()=>b.readNumber(number),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(b.readNumber(other),3);
 const args=[];Object.defineProperty(args,0,{get(){a.close();return number;}});args.length=1;
 assert.throws(()=>a.invoke('caught',args),/closed/);assert.throws(()=>a.readNumber(number),/closed/);finish(b,[other]);a.close();
});

nativeTest('native managed capacity failures retain caller roots and source operands',async()=>{
 for(const a of [wasm(normal,{maxSlots:64,initialBytes:4096,maxBytes:4096}),await open(normal,{maxSlots:64,initialBytes:4096,maxBytes:4096})]){
  a.auto(1);const text=a.string('中😀\ud800'),count=a.number(10000),frame=a.frame(1);a.frameSet(frame,0,text);
  assert.throws(()=>a.invoke('repeat-text',[text,count]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.readString(text),'中😀\ud800');assert.equal(a.stats().frameDepth,1);
  a.leaveFrame(frame);finish(a,[text,count]);
 }
});

test('shared WASM loader rejects an explicitly null control descriptor before runtime entry',()=>{
 const ir=b.compiler.compile_ir_string('(defun identity (x) x) (export identity)','bad-control.eli');
 const plain=b.wasm.emit_memory_wasm(ir);
 for(const descriptor of ['null','false','0','[]','{}']){
  const bytes=Uint8Array.from(b.wasm.append_metadata_section(plain,'eliscript-managed-control',descriptor));
  assert.throws(()=>instantiateManagedRuntime(bytes),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 }
 assert.throws(()=>instantiateManagedRuntime(new Uint8Array(),{initializeModule:1}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
});
