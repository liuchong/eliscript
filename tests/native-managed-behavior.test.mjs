import {afterAll,beforeAll,describe,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const root=resolve(import.meta.dir,'..'),sourceRoot=resolve(process.env.ELISCRIPT_NATIVE_MANAGED_SOURCE_ROOT??root);
const catalog=JSON.parse(await readFile(resolve(sourceRoot,'tests/fixtures/wasm-managed-behavior.json'),'utf8'));
assert.equal(catalog.format,'eliscript-managed-bdd');assert.equal(catalog.version,1);
const scenarios=catalog.features.flatMap(feature=>feature.scenarios);
assert.equal(scenarios.length,101,'reuse every accepted managed BDD scenario');
assert.equal(new Set(scenarios.map(scenario=>scenario.id)).size,scenarios.length);
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
let directory,b,runtime;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-managed-bdd-'));
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);
 b=await buildBackends({outputRoot:directory});
 const path=resolve(b.directory,'native-under-test.mjs');
 await writeFile(path,b.compiler.compile_string(await readFile(resolve(root,'bootstrap/backends/native.eli'),'utf8'),'native.eli'));
 b.native=await import(pathToFileURL(path).href);
 runtime=b.compiler.compile_ir_string(await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function observe(a,value){
 if(value===null||typeof value!=='object')return value;
 if(value.kind===4)return a.readNumber(value);
 if(value.kind===5)return a.readString(value);
 assert.equal(value.kind,14,'BDD results use ordinary source arrays');
 return Array.from({length:a.length(value)},(_,index)=>{const item=a.get(value,index);try{return observe(a,item);}finally{a.release(item);}});
}
for(const feature of catalog.features)describe('Native feature: '+feature.name+' — '+feature.description,()=>{
 for(const scenario of feature.scenarios){
  for(const field of ['given','when','then','source'])assert.equal(typeof scenario[field],'string');
  nativeTest('Scenario: '+scenario.id+'\nGiven '+scenario.given+'\nWhen '+scenario.when+'\nThen '+scenario.then,async()=>{
   const filename='bdd-'+scenario.id+'.eli',source=';中😀\n(defconst marker 1)\n'+scenario.source+'\n(export run'+(Object.hasOwn(scenario,'recover')?' recover':'')+')';
   const program=b.compiler.compile_ir_string(source,filename),before=JSON.stringify(program),runtimeBefore=JSON.stringify(runtime);
   const javascript=b.compiler.emit_ir_string(program).replace(/from "eliscript\/([^"]+)"/g,(_,path)=>'from '+JSON.stringify(pathToFileURL(resolve(sourceRoot,path)).href));
   const js=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
   if(scenario.compileError){
    assert.deepEqual(js.run(),scenario.expected);
    assert.throws(()=>b.managed.lower_managed_program(program,runtime,true),error=>error.eliscriptDiagnostic?.code===scenario.compileError&&error.eliscriptDiagnostic.location.file===filename&&error.eliscriptDiagnostic.location.start.line>=2);
    assert.equal(JSON.stringify(program),before);assert.equal(JSON.stringify(runtime),runtimeBefore);return;
   }
   const lowered=b.managed.lower_managed_program(program,runtime,true),typedBefore=JSON.stringify(lowered.typed);
   const path=resolve(directory,scenario.id+'.dylib');
   await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));
   assert.equal(JSON.stringify(lowered.typed),typedBefore);assert.equal(JSON.stringify(program),before);assert.equal(JSON.stringify(runtime),runtimeBefore);
   const a=await instantiateNativeManagedRuntime(path,lowered);a.auto(1);
   try{
    if(scenario.runtimeError){
     assert.throws(()=>js.run(),error=>error.name===scenario.jsError&&(scenario.runtimeError!=='ELI-RT0009'||error.eliscriptDiagnostic?.code===scenario.runtimeError));
     assert.throws(()=>a.invoke('run'),error=>error.eliscriptDiagnostic?.code===scenario.runtimeError&&(!scenario.wasmError||error.name===scenario.wasmError));
     assert.equal(a.stats().frameDepth,0);
     if(Object.hasOwn(scenario,'recover')){const out=a.invoke('recover');try{assert.deepEqual(observe(a,out),scenario.recover);assert.deepEqual(js.recover(),scenario.recover);}finally{a.release(out);}}
    }else{
     const out=a.invoke('run');try{assert.deepEqual(js.run(),scenario.expected);assert.deepEqual(observe(a,out),scenario.expected);}finally{a.release(out);}
    }
   }finally{
    try{a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
    finally{a.close();await rm(path,{force:true});}
   }
  },30000);
 }
});
