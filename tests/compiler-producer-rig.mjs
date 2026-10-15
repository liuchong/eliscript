import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildBackends,backendModules} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {compilerBudget,compilerMemory,readCompilerValue,finishCompiler} from './whole-compiler-rig.mjs';

export const producerProfiles=Object.freeze({
 small:Object.freeze({budget:compilerBudget,memory:compilerMemory,auto:65536}),
 'full-runtime':Object.freeze({
  budget:Object.freeze({maxSlots:1048575,initialBytes:67108864,maxBytes:268435456}),
  memory:Object.freeze({initialPages:2048,maximumPages:16384}),auto:4194304,
 }),
});

// The wire transports plain compiler IR. It keeps JSON's missing-value rules;
// only finite negative zero differs, so JSON.parse can recover its exact sign.
export function compilerInputWire(value){
 const ancestors=new Set();let negativeZeroCount=0;
 function encode(value){
  if(value===null)return 'null';
  if(typeof value==='number'){if(Object.is(value,-0)){negativeZeroCount++;return '-0';}return JSON.stringify(value);}
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='bigint')throw new TypeError('compiler IR wire cannot serialize BigInt');
  if(typeof value!=='object')return undefined;
  if(ancestors.has(value))throw new TypeError('compiler IR wire cannot serialize cyclic data');
  ancestors.add(value);
  try{
   if(Array.isArray(value)){const values=[];for(let i=0;i<value.length;i++)values.push(encode(value[i])??'null');return '['+values.join(',')+']';}
   const prototype=Object.getPrototypeOf(value);
   if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('compiler IR wire requires plain JSON data');
   const fields=[];for(const key of Object.keys(value)){const encoded=encode(value[key]);if(encoded!==undefined)fields.push(JSON.stringify(key)+':'+encoded);}return '{'+fields.join(',')+'}';
  }finally{ancestors.delete(value);}
 }
 return {text:encode(value),negativeZeroCount};
}
export function stringifyCompilerInput(value){return compilerInputWire(value).text;}

export const producerSource='(defun add (a b) (+ a b)) (export add)';
export const managedProducerSource='(defun run (value) (let ((items (js-array value "中😀"))) (let ((read (lambda () (js-array (aref items 0) (aref items 1))))) (funcall read)))) (export run)';
const entrySource=`(import "./bootstrap/compiler.mjs" compile-ir-string compile-string serialize-ir-program)
 (import "./backends/wasm.mjs" emit-numeric-wasm)
 (import "./backends/native.mjs" emit-native-numeric-object emit-native-numeric-library emit-typed-native-memory-library)
 (import "./backends/managed.mjs" lower-managed-program emit-managed-wasm)
 (defun produce-js (source filename) (compile-string source filename))
 (defun produce-ir (source filename) (serialize-ir-program (compile-ir-string source filename)))
 (defun produce-numeric-wasm (source filename) (JSON/stringify (emit-numeric-wasm (compile-ir-string source filename))))
 (defun produce-native-object (source filename) (JSON/stringify (emit-native-numeric-object (compile-ir-string source filename) "arm64-macos")))
 (defun produce-native-library (source filename) (JSON/stringify (emit-native-numeric-library (compile-ir-string source filename) "arm64-macos")))
 (defun produce-managed-wasm (source filename runtime-json)
   (JSON/stringify (emit-managed-wasm (compile-ir-string source filename) (JSON/parse runtime-json))))
 (defun produce-managed-native (source filename runtime-json)
   (let ((lowered (lower-managed-program (compile-ir-string source filename) (JSON/parse runtime-json))))
     (JSON/stringify (js-object :bytes (emit-typed-native-memory-library (get lowered :typed) "arm64-macos") :descriptor (get lowered :descriptor) :typed (get lowered :typed)))))
 (defun decode-runtime-ir (runtime-json) (JSON/parse runtime-json))
 (defun produce-managed-wasm-from-ir (source filename runtime-ir)
   (JSON/stringify (emit-managed-wasm (compile-ir-string source filename) runtime-ir)))
 (defun produce-managed-native-from-ir (source filename runtime-ir)
   (let ((lowered (lower-managed-program (compile-ir-string source filename) runtime-ir)))
     (JSON/stringify (js-object :bytes (emit-typed-native-memory-library (get lowered :typed) "arm64-macos") :descriptor (get lowered :descriptor) :typed (get lowered :typed)))))
 (export produce-js produce-ir produce-numeric-wasm produce-native-object produce-native-library produce-managed-wasm produce-managed-native
   decode-runtime-ir produce-managed-wasm-from-ir produce-managed-native-from-ir)`;

function failureDetail(a,error){
 const detail={name:error?.name,message:error?.message,diagnostic:error?.eliscriptDiagnostic};
 if(a&&error?.kind===13){
  try{for(const name of['name','message','eliscriptDiagnostic']){const key=a.string(name);let value;try{value=a.objectGet(error,key);detail[name]=readCompilerValue(a,value);}finally{a.release(key);a.release(value);}}}
  catch(inspectionError){detail.inspectionFailure=inspectionError?.message??String(inspectionError);}
  finally{a.release(error);}
 }
 return detail;
}

// The candidate links every real module at its actual import path. JavaScript
// builds the initial executable; every produce_* call runs the algorithms in it.
export async function buildCompilerProducer({producerHost='wasm',profile='small',onStage=()=>{}}={}){
 assert(Object.hasOwn(producerProfiles,profile),'unknown producer profile');
 const {budget,memory,auto}=producerProfiles[profile];
 assert(['wasm','native'].includes(producerHost));
 if(producerHost==='native'){assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');}
 const directory=await mkdtemp(resolve(tmpdir(),'eliscript-compiler-producer-'));
 let stage='bootstrap',a;
 const mark=(name,extra={})=>{stage=name;onStage({stage,producerHost,profile,productTarget:'compiler-runtime',...extra,...(a?{stats:a.stats(),live:a.live()}: {})});};
 try{
  mark('bootstrap',{directory,budget,memory,auto});
  const backend=await buildBackends({outputRoot:directory});
  const names=(await readdir('bootstrap/compiler')).filter(name=>name.endsWith('.eli')).sort();assert.equal(names.length,13);assert.equal(backendModules.length,8);
  mark('compile-real-module-ir');
  const modules=await Promise.all([
   ...names.map(async name=>({id:'bootstrap/'+name.replace(/[.]eli$/,'.mjs'),program:backend.compiler.compile_ir_string(await readFile(resolve('bootstrap/compiler',name),'utf8'),name)})),
   ...backendModules.map(async name=>({id:'backends/'+name+'.mjs',program:backend.compiler.compile_ir_string(await readFile(resolve('bootstrap/backends',name+'.eli'),'utf8'),name+'.eli')})),
  ]);
  modules.push({id:'test-entry.mjs',program:backend.compiler.compile_ir_string(entrySource,'test-entry.eli')});
  assert.equal(modules.length,22);
  const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
  const saved=JSON.stringify(modules),runtimeWire=compilerInputWire(runtime),runtimeJSON=runtimeWire.text;
  if(runtimeWire.negativeZeroCount===0)assert.equal(runtimeJSON,JSON.stringify(runtime),'the zero-free current runtime wire must retain the original JSON bytes');
  mark('runtime-wire',{runtimeJSONBytes:Buffer.byteLength(runtimeJSON),negativeZeroCount:runtimeWire.negativeZeroCount});
  mark('emit-complete-producer-'+producerHost,{moduleCount:modules.length});
  if(producerHost==='wasm'){
   const bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'test-entry.mjs',runtime,memory));
   assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
   mark('instantiate-producer',{bytes:bytes.length});
   a=instantiateManagedRuntime(bytes,{...budget,initializeModule:false});
  }else{
   const lowered=backend.managed.lower_managed_project(modules,'test-entry.mjs',runtime);
   const bytes=Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos'));
   const path=resolve(directory,'producer.dylib');await writeFile(path,bytes);mark('instantiate-producer',{bytes:bytes.length});
   a=await instantiateNativeManagedRuntime(path,lowered,{...memory,...budget,initializeModule:false});
  }
  assert.equal(JSON.stringify(modules),saved);assert.equal(stringifyCompilerInput(runtime),runtimeJSON);a.auto(auto);
  mark('initialize-producer');a.initializeModule();mark('producer-ready');
  return {directory,backend,modules,runtime,runtimeJSON,a,mark,producerHost,profile,budget,memory,auto,
   call(name,args){const productTarget=name==='produce_js'?'javascript':name==='produce_ir'?'canonical-ir':name.includes('wasm')?'wasm':name==='produce_native_object'?'arm64-macos-object':'arm64-macos-library';mark(name+'-box-input',{productTarget,inputBytes:args.reduce((sum,v)=>sum+Buffer.byteLength(v),0)});const roots=[];try{for(const value of args)roots.push(a.string(value));mark(name+'-invoke',{productTarget});const out=a.invoke(name,roots);try{const text=a.readString(out);mark(name+'-read-output',{productTarget,outputBytes:Buffer.byteLength(text)});return text;}finally{a.release(out);}}finally{roots.forEach(root=>a.release(root));}},
   callFromRuntimeIR(mode,args){
    const productTarget=mode==='managed-wasm'?'wasm':'arm64-macos-library',method=mode==='managed-wasm'?'produce_managed_wasm_from_ir':'produce_managed_native_from_ir';
    const roots=[];let runtimeIR,out;
    mark('decode-runtime-ir-box-input',{productTarget,inputBytes:args.reduce((sum,value)=>sum+Buffer.byteLength(value),0)});
    try{
     // Hold the same three boxed inputs for both stages. The host neither walks
     // nor reconstructs the parsed graph; its sole new ownership is this root.
     for(const value of args)roots.push(a.string(value));
     mark('decode-runtime-ir-invoke',{productTarget});runtimeIR=a.invoke('decode_runtime_ir',[roots[2]]);
     mark('decode-ready',{productTarget});
     mark('emit-from-runtime-ir',{productTarget,method});out=a.invoke(method,[roots[0],roots[1],runtimeIR]);
     const text=a.readString(out);mark(method+'-read-output',{productTarget,outputBytes:Buffer.byteLength(text)});return text;
    }finally{a.release(out);a.release(runtimeIR);roots.forEach(root=>a.release(root));}
   },
   async close({preserve=false}={}){finishCompiler(a);a=undefined;if(!preserve)await rm(directory,{recursive:true,force:true});},
  };
 }catch(error){try{onStage({stage,producerHost,profile,productTarget:'compiler-runtime',failed:true,directory,error:failureDetail(a,error),...(a?{stats:a.stats(),live:a.live()}: {})});}finally{try{a?.close?.();}catch{}}throw error;}
}

export async function runProducerCandidate(mode='numeric',{producerHost='wasm',profile='small',onStage=()=>{}}={}){
 assert(['numeric','managed-wasm','managed-native','runtime-ir'].includes(mode));
 if(mode==='runtime-ir')assert.equal(profile,'full-runtime','runtime-ir requires the explicit full-runtime candidate profile');
 const fixture=await buildCompilerProducer({producerHost,profile,onStage});const {backend,a,mark,budget,memory,auto}=fixture;let failed=false;
 try{
  const runtimeSource=mode==='runtime-ir'?await readFile('bootstrap/runtime/memory.eli'):undefined;
  const source=runtimeSource?runtimeSource.toString('utf8'):mode==='numeric'?producerSource:managedProducerSource,filename=mode==='runtime-ir'?'bootstrap/runtime/memory.eli':'producer-'+mode+'.eli';
  const sourceIdentity=runtimeSource?{sourceSha256:createHash('sha256').update(runtimeSource).digest('hex'),sourceBytes:runtimeSource.length}:{};
  await writeFile(resolve(fixture.directory,'candidate-input.json'),JSON.stringify({mode,producerHost,profile,source,filename,budget,memory,auto,...sourceIdentity,...(mode==='numeric'||mode==='runtime-ir'?{}:{runtimeJSON:fixture.runtimeJSON})}));
  if(mode==='runtime-ir')mark('runtime-ir-source',{productTarget:'canonical-ir',filename,...sourceIdentity});
  const program=backend.compiler.compile_ir_string(source,filename),saved=JSON.stringify(program);
  if(mode==='runtime-ir'){
   const expectedIR=backend.compiler.serialize_ir_program(program);
   mark('runtime-ir-reference-ready',{productTarget:'canonical-ir',outputBytes:Buffer.byteLength(expectedIR),...sourceIdentity});
   assert.equal(fixture.call('produce_ir',[source,filename]),expectedIR);
   mark('runtime-ir-compared',{productTarget:'canonical-ir',outputBytes:Buffer.byteLength(expectedIR),...sourceIdentity});
  }else{
   assert.equal(fixture.call('produce_js',[source,filename]),backend.compiler.compile_string(source,filename));
   assert.equal(fixture.call('produce_ir',[source,filename]),backend.compiler.serialize_ir_program(program));
  }
  if(mode==='numeric'){
   const javascript=fixture.call('produce_js',[source,filename]),actualJS=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
   const wasm=Uint8Array.from(JSON.parse(fixture.call('produce_numeric_wasm',[source,filename])));
   assert.deepEqual(wasm,Uint8Array.from(backend.wasm.emit_numeric_wasm(program)));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);
   const product=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
   const object=Uint8Array.from(JSON.parse(fixture.call('produce_native_object',[source,filename])));
   assert.deepEqual(object,Uint8Array.from(backend.native.emit_native_numeric_object(program,'arm64-macos')));assert.equal(new DataView(object.buffer).getUint32(0,true),0xfeedfacf);
   const inputs=[[20,22],[-1,1],[-0,-0],[Infinity,-Infinity],[Number.MIN_VALUE,0]];
   for(const values of inputs)assert(Object.is(product.add(...values),actualJS.add(...values)));
   const path=resolve(fixture.directory,'numeric.mjs');await writeFile(path,javascript);
   const node=spawnSync('node',['--input-type=module','-e','import assert from "node:assert/strict";const m=await import(process.argv[1]);assert.equal(m.add(20,22),42);assert.equal(m.add(-1,1),0);assert(Object.is(m.add(-0,-0),-0));',pathToFileURL(path).href],{encoding:'utf8',timeout:10000});assert.equal(node.status,0,node.stderr);
   if(process.platform==='darwin'&&process.arch==='arm64'){
    const library=Uint8Array.from(JSON.parse(fixture.call('produce_native_library',[source,filename])));
    assert.deepEqual(library,Uint8Array.from(backend.native.emit_native_numeric_library(program,'arm64-macos')));
    const path=resolve(fixture.directory,'numeric.dylib');await writeFile(path,library);const {dlopen}=await import('bun:ffi'),native=dlopen(path,{add:{args:['f64','f64'],returns:'f64'}});
    try{for(const values of inputs)assert(Object.is(native.symbols.add(...values),actualJS.add(...values)));}finally{native.close();}
    mark('native-product-executed',{productTarget:'arm64-macos-library',bytes:library.length});
   }
   mark('numeric-products-executed',{productTarget:'numeric-wasm-and-arm64-macos-object',wasmBytes:wasm.length,objectBytes:object.length});
  }else if(mode!=='runtime-ir'){
   // This is the complete current runtime IR, without a reduced fixture or a
   // substitute host implementation. Its fixed capacity failures stay visible.
   const inputs=[source,filename,fixture.runtimeJSON];
   // Preserve the original small-budget failure path. Only the explicit full
   // profile exposes the pure-Eli decoder and emitter as separately timed calls.
   const wire=profile==='full-runtime'?fixture.callFromRuntimeIR(mode,inputs):fixture.call(mode==='managed-wasm'?'produce_managed_wasm':'produce_managed_native',inputs);
   const emitted=JSON.parse(wire);let product;
   if(mode==='managed-wasm'){
    const bytes=Uint8Array.from(emitted);assert.deepEqual(bytes,Uint8Array.from(backend.managed.emit_managed_wasm(program,fixture.runtime)));
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);product=instantiateManagedRuntime(bytes);mark('managed-product-instantiated',{productTarget:mode,bytes:bytes.length});
   }else{
    assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
    const lowered=backend.managed.lower_managed_program(program,fixture.runtime),bytes=Uint8Array.from(emitted.bytes);
    assert.deepEqual(emitted.descriptor,lowered.descriptor);assert.deepEqual(emitted.typed,lowered.typed);assert.deepEqual(bytes,Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));
    const path=resolve(fixture.directory,'managed.dylib');await writeFile(path,bytes);product=await instantiateNativeManagedRuntime(path,{typed:emitted.typed,descriptor:emitted.descriptor});mark('managed-product-instantiated',{productTarget:mode,bytes:bytes.length});
   }
   try{product.auto(1);const input=product.number(42);try{const out=product.invoke('run',[input]);try{assert.deepEqual(readCompilerValue(product,out),[42,'中😀']);}finally{product.release(out);}}finally{product.release(input);}}finally{finishCompiler(product);}
   mark('managed-product-executed',{productTarget:mode});
  }
  assert.equal(JSON.stringify(program),saved);a.collect();assert.equal(a.stats().frameDepth,0);mark('candidate-complete',{mode,productTarget:mode});
 }catch(error){failed=true;const detail=failureDetail(a,error);mark('candidate-failed',{mode,productTarget:mode,error:detail,directory:fixture.directory,input:resolve(fixture.directory,'candidate-input.json')});throw error;
 }finally{try{await fixture.close({preserve:failed});}catch(error){onStage({stage:'candidate-cleanup-failed',producerHost,profile,productTarget:mode,mode,message:error?.message});if(!failed)throw error;}}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]??'numeric',producerHost=process.argv[3]??'wasm',profile=process.argv[4]??'small';
 try{await runProducerCandidate(mode,{producerHost,profile,onStage:value=>process.stdout.write(JSON.stringify(value)+'\n')});}
 catch(error){process.stderr.write((error?.stack??String(error))+'\n');process.exitCode=1;}
}
