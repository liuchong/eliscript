import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildCompilerProducer} from './compiler-producer-rig.mjs';
const requestedHost=process.env.ELISCRIPT_STAGE_PRODUCER_HOST??'wasm';
let fixture,reader,expander,analyzer,lower,stages=[],collectBetween=false,rejectStage;
beforeAll(async()=>{
 assert(['wasm','native'].includes(requestedHost),'unknown requested compiler host');
 fixture=await buildCompilerProducer({producerHost:requestedHost,onStage:event=>{stages.push(event);if(collectBetween&&event.stage.endsWith('-ready'))fixture.a.collect();if(event.stage===rejectStage)throw new Error('observer failure '+rejectStage);}});
 [reader,expander,analyzer,lower]=await Promise.all(['reader','expander','analyzer','lower'].map(name=>import(pathToFileURL(resolve(fixture.directory,'bootstrap',name+'.mjs')).href)));
},120000);
afterAll(async()=>{if(fixture)await fixture.close();});
function release(...values){values.forEach(value=>fixture.a.release(value));}
function observedError(error){
 if(error?.kind!==13)throw error;
 const out={name:undefined,message:undefined,eliscriptDiagnostic:undefined};try{for(const key of['name','message','eliscriptDiagnostic']){const name=fixture.a.string(key);let value;try{value=fixture.a.objectGet(error,name);if(value?.kind===5)out[key]=fixture.a.readString(value);else if(key==='eliscriptDiagnostic')out[key]=value===undefined?undefined:readDiagnostic(value);}finally{release(name,value);}}return out;}finally{release(error);}
}
function readDiagnostic(value){const result={};const keys=fixture.a.objectKeys(value);try{for(let i=0;i<fixture.a.length(keys);i++){const key=fixture.a.get(keys,i),child=fixture.a.objectGet(value,key);try{const name=fixture.a.readString(key);result[name]=child?.kind===13?readDiagnostic(child):child?.kind===5?fixture.a.readString(child):child?.kind===4?fixture.a.readNumber(child):child;}finally{release(key,child);}}}finally{release(keys);}return result;}
function expectedError(fn){try{fn();assert.fail('expected source failure');}catch(error){return{name:error.name,message:error.message,eliscriptDiagnostic:error.eliscriptDiagnostic};}}
function checkFailure(fn,oracle){let error;try{fn();assert.fail('expected managed source failure');}catch(caught){error=caught;}assert.deepEqual(observedError(error),expectedError(oracle));}

test('stage harness reexports actual Reader expander analyzer lower and canonical serializer functions',()=>{
 assert.equal(fixture.producerHost,requestedHost,'requested compiler execution host must be real');
 for(const name of['read_string','expand_module','analyze_module','lower_module','serialize_ir_program']){const fn=fixture.a.getExport(name);try{assert.equal(fn.kind,18,name);}finally{release(fn);}}
});

test('opaque stage roots retain real macro semantics through collection and feed exact executable WASM and native products',async()=>{
 const a=fixture.a;collectBetween=true;
 try{for(const source of['(defun add (a b) (+ a b)) (export add)','(defmacro twice (x) `(+ ,x ,x)) (defun add (a b) (+ (twice a) b)) (export add)']){
  stages=[];const filename='staged.eli',program=fixture.compileStages(source,filename),expected=fixture.backend.compiler.compile_ir_string(source,filename);
  try{
   assert.equal(fixture.serializeIR(program),fixture.backend.compiler.serialize_ir_program(expected));
   assert.deepEqual(stages.filter(event=>event.stage.endsWith('-ready')).map(event=>event.stage),['read-ready','expand-ready','analyze-ready','lower-ready','serialize-ready']);
   const wasm=fixture.emitProductIR('wasm',program);assert.deepEqual(wasm,Uint8Array.from(fixture.backend.wasm.emit_numeric_wasm(expected)));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);
   const product=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports,js=await import('data:text/javascript;base64,'+Buffer.from(fixture.backend.compiler.emit_ir_string(expected)).toString('base64'));
   for(const args of[[20,22],[-1,1],[-0,-0],[Infinity,-Infinity],[Number.MIN_VALUE,0]])assert(Object.is(product.add(...args),js.add(...args)));
   const wasmPath=resolve(fixture.directory,'stage-'+source.length+'.wasm'),jsPath=resolve(fixture.directory,'stage-'+source.length+'.mjs');await writeFile(wasmPath,wasm);await writeFile(jsPath,fixture.backend.compiler.emit_ir_string(expected));
   const node=spawnSync('node',['--input-type=module','-e','import assert from "node:assert/strict";import{readFileSync}from"node:fs";const reference=await import(process.argv[2]),bytes=readFileSync(process.argv[1]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const product=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;for(const args of[[20,22],[-1,1],[-0,-0],[Infinity,-Infinity],[Number.MIN_VALUE,0]])assert(Object.is(product.add(...args),reference.add(...args)));',wasmPath,pathToFileURL(jsPath).href],{encoding:'utf8',timeout:10000});assert.equal(node.status,0,node.stderr);
   const object=fixture.emitProductIR('native-object',program);assert.deepEqual(object,Uint8Array.from(fixture.backend.native.emit_native_numeric_object(expected,'arm64-macos')));
   if(process.platform==='darwin'&&process.arch==='arm64'){
    const bytes=fixture.emitProductIR('native-library',program);assert.deepEqual(bytes,Uint8Array.from(fixture.backend.native.emit_native_numeric_library(expected,'arm64-macos')));
    const path=resolve(fixture.directory,'staged-'+source.length+'.dylib');await writeFile(path,bytes);const {dlopen}=await import('bun:ffi'),native=dlopen(path,{add:{args:['f64','f64'],returns:'f64'}});
    try{for(const args of[[20,22],[-1,1],[-0,-0]])assert(Object.is(native.symbols.add(...args),js.add(...args)));}finally{native.close();}
   }
  }finally{release(program);}
  a.collect();assert.equal(a.stats().frameDepth,0);
 }}finally{collectBetween=false;}
},30000);

test('all source stages preserve original failures caller roots and recovery without leaking syntax or IR roots',()=>{
 const a=fixture.a,filename='stage-error.eli';
 // Warm reflection and error construction before taking the no-leak baseline.
 checkFailure(()=>fixture.compileStages('(','warm.eli'),()=>fixture.backend.compiler.compile_ir_string('(','warm.eli'));
 const warm=fixture.compileStages('(defun add (a b) (+ a b)) (export add)',filename);fixture.serializeIR(warm);release(warm);a.collect();
 const held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);a.collect();const baseline=a.live();
 try{
  for(const source of['(defun broken (','(defmacro bad () missing) (bad)','missing']){
   checkFailure(()=>fixture.compileStages(source,filename),()=>fixture.backend.compiler.compile_ir_string(source,filename));
   assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.collect();assert.equal(a.live(),baseline,source);
  }
  const source='(defun f ([1]) nil)',text=a.string(source),file=a.string(filename),forms=a.invoke('read_string',[text,file]);
  try{checkFailure(()=>fixture.invokeStage('lower', [forms,file]),()=>lower.lower_module(reader.read_string(source,filename),filename));}finally{release(text,file,forms);}
  checkFailure(()=>fixture.serializeIR(null),()=>fixture.backend.compiler.serialize_ir_program(null));
  const unsupported=fixture.compileStages('(defun text () "not numeric") (export text)',filename);
  try{checkFailure(()=>fixture.emitProductIR('wasm',unsupported),()=>fixture.backend.wasm.emit_numeric_wasm(fixture.backend.compiler.compile_ir_string('(defun text () "not numeric") (export text)',filename)));}finally{release(unsupported);}
  a.collect();assert.equal(a.live(),baseline);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  const recovered=fixture.compileStages('(defun add (a b) (+ a b)) (export add)',filename);try{assert.equal(new WebAssembly.Instance(new WebAssembly.Module(fixture.emitProductIR('wasm',recovered))).exports.add(20,22),42);}finally{release(recovered);}
 }finally{a.leaveFrame(caller);release(held);}
});

test('stage observer failures release every returned opaque root including aliased analysis results',()=>{
 const a=fixture.a,source='(defun add (a b) (+ a b)) (export add)',filename='observer.eli';a.collect();const baseline=a.live();
 for(const stage of['read-ready','expand-ready','analyze-ready','lower-ready']){
  rejectStage=stage;try{assert.throws(()=>fixture.compileStages(source,filename),new RegExp('observer failure '+stage));}finally{rejectStage=undefined;}
  a.collect();assert.equal(a.live(),baseline,stage);assert.equal(a.stats().frameDepth,0);
 }
});


test('serialization and backend observer failures release returned roots while retaining the caller IR',()=>{
 const a=fixture.a,program=fixture.compileStages('(defun add (a b) (+ a b)) (export add)','observer-products.eli');
 try{
  // Prepare serializer reflection state before measuring only transient roots.
  fixture.serializeIR(program);a.collect();const baseline=a.live();
  for(const [stage,invoke]of[['serialize-ready',()=>fixture.serializeIR(program)],['emit-wasm-ready',()=>fixture.emitProductIR('wasm',program)]]){
   rejectStage=stage;try{assert.throws(invoke,new RegExp('observer failure '+stage));}finally{rejectStage=undefined;}
   a.collect();assert.equal(a.live(),baseline,stage);assert.equal(a.stats().frameDepth,0);
  }
  assert.equal(new WebAssembly.Instance(new WebAssembly.Module(fixture.emitProductIR('wasm',program))).exports.add(20,22),42);
 }finally{release(program);}
});


// Reuse the identical five semantic cases in a real native compiler process.
// The explicit child flag also prevents recursion if host selection regresses.
if(requestedHost==='wasm'&&process.env.ELISCRIPT_STAGE_PRODUCER_CHILD!=='1'){
 test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('the same five stage tests execute in a real native compiler host',()=>{
  const child=spawnSync(process.execPath,['test',resolve('tests/compiler-producer-stages.test.mjs')],{cwd:resolve('.'),encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,ELISCRIPT_STAGE_PRODUCER_HOST:'native',ELISCRIPT_STAGE_PRODUCER_CHILD:'1'}});
  if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);
  assert.equal(child.error,undefined,'native stage child: '+child.error?.message);assert.equal(child.signal,null);assert.equal(child.status,0,'native compiler stage suite must pass unchanged');
  assert.match(child.stderr,/5 pass/);assert.match(child.stderr,/0 fail/);
 },190000);
}
