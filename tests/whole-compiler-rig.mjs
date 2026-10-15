import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
export const compilerBudget=Object.freeze({maxSlots:131072,initialBytes:8388608,maxBytes:67108864});
export const compilerMemory=Object.freeze({initialPages:128,maximumPages:4096});
export async function buildWholeCompiler({entrySource}={}){
 const directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-compiler-'));
 try{
  const backend=await buildBackends({outputRoot:directory}),names=(await readdir('bootstrap/compiler')).filter(name=>name.endsWith('.eli')).sort();assert.equal(names.length,13);
  const modules=await Promise.all(names.map(async name=>({id:name.replace(/[.]eli$/,'.mjs'),program:backend.compiler.compile_ir_string(await readFile(resolve('bootstrap/compiler',name),'utf8'),name)})));
  const entry=entrySource===undefined?'compiler.mjs':'test-entry.mjs';
  if(entrySource!==undefined)modules.push({id:entry,program:backend.compiler.compile_ir_string(entrySource,entry)});
  const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli'),saved=JSON.stringify(modules),runtimeSaved=JSON.stringify(runtime);
  const lowered=backend.managed.lower_managed_project(modules,entry,runtime);assert.equal(JSON.stringify(modules),saved);assert.equal(JSON.stringify(runtime),runtimeSaved);
  let bytes,nativePath;
  const fixture={directory,backend,modules,runtime,lowered,
   async wasm(){if(!bytes){bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,entry,runtime,compilerMemory));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);}const a=instantiateManagedRuntime(bytes,{...compilerBudget,initializeModule:false});a.auto(65536);a.initializeModule();return a;},
   async native(){if(!nativePath){nativePath=resolve(directory,'compiler.dylib');await writeFile(nativePath,Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));}const a=await instantiateNativeManagedRuntime(nativePath,lowered,{...compilerMemory,...compilerBudget,initializeModule:false});try{a.auto(65536);a.initializeModule();return a;}catch(error){try{a.close();}catch{}throw error;}},
   async close(){await rm(directory,{recursive:true,force:true});}};
  return fixture;
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
export function readCompilerValue(a,value){
 if(value===null||typeof value!=='object')return value;
 if(value.kind===4)return a.readNumber(value);if(value.kind===5)return a.readString(value);
 if(value.kind===14)return Array.from({length:a.length(value)},(_,i)=>{const child=a.get(value,i);try{return readCompilerValue(a,child);}finally{a.release(child);}});
 if(value.kind===13){const result={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{Object.defineProperty(result,a.readString(key),{value:readCompilerValue(a,child),enumerable:true,writable:true,configurable:true});}finally{a.release(child);a.release(key);}}}finally{a.release(keys);}return result;}
 throw new TypeError('unsupported compiler observation kind '+value.kind);
}
export function finishCompiler(a){try{a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}finally{a.close?.();}}
