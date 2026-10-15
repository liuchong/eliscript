import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
const root=resolve(import.meta.dir,'..'),sourceRoot=resolve(process.env.ELISCRIPT_NATIVE_MANAGED_SOURCE_ROOT??root);
const readerExports=['read-string','read-token','reference-read-token','skip-space-and-comments','reference-skip-space-and-comments','whitespace-code-p','reference-whitespace-code-p','delimiter-code-p','reference-delimiter-code-p'];
const readerEntry=`(import "./reader.mjs" ${readerExports.join(' ')}) (defun read-observed (source filename) (try (js-array t (read-string source filename)) (catch error (js-array false error)))) (export ${readerExports.join(' ')} read-observed)`;
const formatterEntry='(import "./formatter.mjs" formatter-format formatter-version formatter-width formatter-indent format-source) (defun format-observed (source filename) (try (js-array t (format-source source filename)) (catch error (js-array false error)))) (export formatter-format formatter-version formatter-width formatter-indent format-source format-observed)';
const symbolsEntry=`(import "./syntax.mjs" make-span symbol-node node-name node-span node-kind) (import "./symbol.mjs" munge-segment binding-name reference-name)
(defun compile-name (name) (symbol-node (binding-name name) (make-span "source.eli" 0 (get name :length) 1 1 1 (1+ (get name :length)))))
(export compile-name node-name node-span node-kind munge-segment binding-name reference-name)`;
let directory,b,runtime,modules,references,fixtures;
const cache=new Map();
async function setup(){
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-compiler-modules-'));
 const{buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);b=await buildBackends({outputRoot:directory});
 const nativePath=resolve(b.directory,'native-under-test.mjs');await writeFile(nativePath,b.compiler.compile_string(await readFile(resolve(root,'bootstrap/backends/native.eli'),'utf8'),'native.eli'));b.native=await import(pathToFileURL(nativePath).href);
 modules=new Map();references=new Map();
 for(const name of ['syntax','reader','formatter','symbol']){
  const source=await readFile(resolve(sourceRoot,'bootstrap/compiler',name+'.eli'),'utf8');modules.set(name,{id:name+'.mjs',program:b.compiler.compile_ir_string(source,name+'.eli')});references.set(name,await import(pathToFileURL(resolve(directory,'bootstrap',name+'.mjs')).href));
 }
 runtime=b.compiler.compile_ir_string(await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');
 fixtures={symbols:JSON.parse(await readFile(resolve(sourceRoot,'tests/fixtures/bootstrap-symbols.json'),'utf8'))};
}
async function teardown(){if(directory)await rm(directory,{recursive:true,force:true});}
async function artifact(kind,memoryOptions){
 const cacheKey=memoryOptions?kind+JSON.stringify(memoryOptions):kind;
 if(cache.has(cacheKey))return cache.get(cacheKey);
 const names=kind==='reader'?['syntax','reader']:kind==='formatter'?['syntax','reader','formatter']:['syntax','symbol'];
 const entry=kind==='reader'?readerEntry:kind==='formatter'?formatterEntry:symbolsEntry;
 const project=[...names.map(n=>modules.get(n)),{id:'entry.mjs',program:b.compiler.compile_ir_string(entry,kind+'-entry.eli')}],saved=JSON.stringify(project),runtimeSaved=JSON.stringify(runtime);
 const lowered=b.managed.lower_managed_project(project,'entry.mjs',runtime);
 const wasm=Uint8Array.from(b.managed.emit_managed_project_wasm(project,'entry.mjs',runtime,memoryOptions));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);
 const path=resolve(directory,kind+'.dylib');await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));
 assert.equal(JSON.stringify(project),saved);assert.equal(JSON.stringify(runtime),runtimeSaved);
 const result={path,lowered,wasm};cache.set(cacheKey,result);return result;
}
async function pair(kind,options={maxSlots:8192,initialBytes:1048576},memoryOptions){const a=await artifact(kind,memoryOptions);return [instantiateManagedRuntime(a.wasm,options),await instantiateNativeManagedRuntime(a.path,a.lowered,memoryOptions?{...options,...memoryOptions}:options)];}
function decode(a,value){
 if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);
 if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(decode(a,child));}finally{a.release(child);}}return out;}
 if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=decode(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}
 return value;
}
function property(a,object,name){const key=a.string(name);try{return a.objectGet(object,key);}finally{a.release(key);}}
function box(a,value){return typeof value==='string'?a.string(value):typeof value==='number'?a.number(value):value;}
function observed(a,kind,source,filename){const input=box(a,source),file=box(a,filename);try{const out=a.invoke(kind+'_observed',[input,file]),passed=a.get(out,0),value=a.get(out,1);try{if(passed)return kind==='read'?{forms:decode(a,value)}:{value:a.readString(value)};const message=property(a,value,'message'),diagnostic=property(a,value,'eliscriptDiagnostic');try{return{message:a.readString(message),diagnostic:decode(a,diagnostic)};}finally{a.release(message);a.release(diagnostic);}}finally{a.release(value);a.release(out);}}finally{a.release(input);a.release(file);}}
function expected(kind,source,filename){try{return kind==='read'?{forms:references.get('reader').read_string(source,filename)}:{value:references.get('formatter').format_source(source,filename)};}catch(error){return{message:error.message,diagnostic:error.eliscriptDiagnostic};}}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);a.close?.();}

export {setup,teardown,pair,decode,property,box,observed,expected,finish,references,fixtures,readerExports,sourceRoot};
