// Complete linked Analyzer test harness; no test registration or host callbacks.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
export let directory,backend,runtime,modules,reader,reference,bytes,analyzerFailure,transientFailure,transientReference;
const flatten=values=>values.flatMap(node=>node.kind==='module-declaration'?flatten(node.children):[node]);
export async function setup(){
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-analyzer-'));backend=await buildBackends({outputRoot:directory});
 modules=await Promise.all(['syntax','symbol','reader','transient-analysis','analyzer'].map(async name=>({id:name+'.mjs',program:backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/'+name+'.eli','utf8'),name+'.eli')})));
 modules.push({id:'entry.mjs',program:backend.compiler.compile_ir_string('(import "./reader.mjs" read-string) (import "./analyzer.mjs" analyze-module select-portable-module) (import "./transient-analysis.mjs" analyze-transients) (export read-string analyze-module select-portable-module analyze-transients)','analyzer-entry.eli')});
 for(const[id,name]of[['analyzer.mjs','fail'],['transient-analysis.mjs','transient-fail']]){const p=modules.find(module=>module.id===id).program,node=flatten(p.body).find(node=>node.kind==='variable-declaration'&&node.value===name);assert(node);const exported=backend.compiler.compile_ir_string('(defconst '+name+' nil) (export '+name+')','diagnostic-export.eli').body.filter(node=>node.kind==='export-declaration');const helper=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string({...p,body:[node,...exported]})).toString('base64'));if(id==='analyzer.mjs')analyzerFailure=helper.fail;else transientFailure=helper.transient_fail;}
 runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');reference=await import(pathToFileURL(resolve(directory,'bootstrap/analyzer.mjs')).href);reader=await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href);transientReference=await import(pathToFileURL(resolve(directory,'bootstrap/transient-analysis.mjs')).href);
}
export async function teardown(){if(directory)await rm(directory,{recursive:true,force:true});}
export function artifact(options){if(bytes&&!options)return bytes;const saved=JSON.stringify(modules);let result;try{result=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'entry.mjs',runtime,options));}catch(error){error.message+=' '+JSON.stringify(error.eliscriptDiagnostic);throw error;}assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(result)),[]);if(!options)bytes=result;return result;}
export function decode(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(decode(a,child));}finally{a.release(child);}}return out;}if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=decode(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return value;}
export function property(a,value,name){const key=a.string(name);try{return a.objectGet(value,key);}finally{a.release(key);}}
export function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
export function analyzeObserved(a,source,filename,operation='analyze_module'){
 const text=a.string(source),file=a.string(filename);let forms,out;
 try{forms=a.invoke('read_string',[text,file]);out=a.invoke(operation,[forms,file]);assert(a.keyEqual(forms,out));return{status:'ok'};}
 catch(error){if(!error?.kind){error.testManagedState={stage:forms===undefined?'read_string':operation,...a.stats()};throw error;}const message=property(a,error,'message'),diagnostic=property(a,error,'eliscriptDiagnostic');try{return{status:'error',message:a.readString(message),diagnostic:decode(a,diagnostic)};}finally{a.release(message);a.release(diagnostic);a.release(error);}}
 finally{for(const root of[text,file,forms,out])if(root!==undefined)a.release(root);}
}
export function expectedAnalysis(source,filename){try{const forms=reader.read_string(source,filename);assert.equal(reference.analyze_module(forms,filename),forms);return{status:'ok'};}catch(error){return{status:'error',message:error.message,diagnostic:error.eliscriptDiagnostic};}}
