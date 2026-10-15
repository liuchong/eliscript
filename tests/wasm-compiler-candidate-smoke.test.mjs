// An isolated candidate configuration, separate from existing acceptance corpora.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const budget=Object.freeze({maxSlots:131072,initialBytes:8*1024*1024,maxBytes:64*1024*1024,initialPages:128,maximumPages:4096,auto:65536,externalTimeoutMs:180000});
const sample='(defun add (a b) (+ a b)) (export add)';
function log(phase,details={}){process.stdout.write(JSON.stringify({phase,...details})+'\n');}
async function runCandidate(){
 let directory,a,phase='configuration';
 const advance=(name,details)=>{phase=name;log(name,details);};
 try{
  advance('configuration',{budget,sample});directory=await mkdtemp(resolve(tmpdir(),'eliscript-compiler-candidate-'));advance('bootstrap-start',{directory});
  const backend=await buildBackends({outputRoot:directory});advance('bootstrap-complete');
  const names=(await readdir(resolve(root,'bootstrap/compiler'))).filter(name=>name.endsWith('.eli')).sort();assert.equal(names.length,13);const modules=[],hash=createHash('sha256');
  for(const name of names){const source=await readFile(resolve(root,'bootstrap/compiler',name),'utf8');hash.update(name+'\0'+source+'\0');modules.push({id:name.replace(/[.]eli$/,'.mjs'),program:backend.compiler.compile_ir_string(source,name)});}
  const runtimeSource=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');hash.update(runtimeSource);const runtime=backend.compiler.compile_ir_string(runtimeSource,'runtime.eli');advance('modules-parsed',{modules:names,sourceSha256:hash.digest('hex')});
  const snapshot=JSON.stringify(modules),bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'compiler.mjs',runtime,{initialPages:budget.initialPages,maximumPages:budget.maximumPages}));assert.equal(JSON.stringify(modules),snapshot);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);advance('zero-import-artifact',{bytes:bytes.length});
  a=instantiateManagedRuntime(bytes,{maxSlots:budget.maxSlots,initialBytes:budget.initialBytes,maxBytes:budget.maxBytes,initializeModule:false});a.auto(budget.auto);advance('initialize-start');a.initializeModule();advance('initialize-complete',{stats:a.stats()});
  const source=a.string(sample),filename=a.string('candidate-add.eli');advance('compile-string-start');const output=a.invoke('compile_string',[source,filename]),javascript=a.readString(output);advance('compile-string-complete',{bytes:Buffer.byteLength(javascript),stats:a.stats()});
  const expected=backend.compiler.compile_string(sample,'candidate-add.eli');assert(Buffer.from(javascript).equals(Buffer.from(expected)),'candidate output must match JavaScript compiler byte for byte');const evaluated=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));assert.equal(evaluated.add(20,22),42);assert.equal(evaluated.add(-1,1),0);
  const path=resolve(directory,'candidate-add.mjs');await writeFile(path,javascript);const child=spawnSync('node',['--input-type=module','-e','import assert from "node:assert/strict";const m=await import(process.argv[1]);assert.equal(m.add(20,22),42);assert.equal(m.add(-1,1),0);',pathToFileURL(path).href],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);advance('produced-javascript-executed',{engines:['Bun','Node'],byteIdentical:true});
  for(const value of[source,filename,output])a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);advance('complete',{stats:a.stats()});
 }catch(error){
  const diagnostic={name:error?.name,message:error?.message,diagnostic:error?.eliscriptDiagnostic};
  if(a&&error?.kind===13){for(const field of['name','message']){try{const key=a.string(field),value=a.objectGet(error,key);diagnostic[field]=value?.kind===5?a.readString(value):value;a.release(key);a.release(value);}catch{}}}
  log('candidate-failure',{at:phase,...diagnostic});throw error;
 }finally{if(directory)await rm(directory,{recursive:true,force:true});}
}
if(process.env.ELISCRIPT_COMPILER_CANDIDATE_CHILD==='1')await runCandidate();
else{
 const {test}=await import('bun:test');
 test('candidate whole 13-module zero-import WASM compiler compiles and executes one small add program within its fixed budget',()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:root,env:{...process.env,ELISCRIPT_COMPILER_CANDIDATE_CHILD:'1'},encoding:'utf8',timeout:budget.externalTimeoutMs,maxBuffer:1024*1024});
  process.stdout.write(child.stdout??'');
  assert.equal(child.status,0,JSON.stringify({error:child.error?.code,signal:child.signal,stderr:child.stderr}));
 },190000);
}
