import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtime,entry,modules,reference,failure,bytes;
const flatten=nodes=>nodes.flatMap(node=>node.kind==='module-declaration'?flatten(node.children):[node]);
const wrappers=`
 (defun observe (mode input filename)
   (try (js-array t (cond ((= mode 0) (evaluation-operation-request input))
                        ((= mode 1) (evaluation-input-description input filename))
                        (t (evaluation-form-description input filename))))
     (catch error (js-array false (get error :message) (get error :eliscriptDiagnostic)))))
 (defun diagnostic (message filename)
   (try (funcall evaluation-fail message filename) (catch error (js-array (get error :message) (get error :eliscriptDiagnostic)))))
 (defun diagnostic-identity (message filename)
   (try (funcall evaluation-fail message filename)
     (catch error (Object/is (get (get error :eliscriptDiagnostic) :message) message))))
 (export observe diagnostic diagnostic-identity evaluation-operation-format evaluation-operation-version
   evaluation-input-format evaluation-input-version evaluation-form-format evaluation-form-version)`;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-entry-'));backend=await buildBackends({outputRoot:directory});
 entry=backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/compiler.eli','utf8'),'compiler.eli');
 const nodes=flatten(entry.body),support=flatten(backend.compiler.compile_ir_string('(import "./reader.mjs" read-string) (import "./compiler.mjs" evaluation-operation-request evaluation-input-description evaluation-form-description evaluation-fail evaluation-operation-format evaluation-operation-version evaluation-input-format evaluation-input-version evaluation-form-format evaluation-form-version) '+wrappers,'evaluation-entry.eli').body);
 // This is the real evaluation API dependency closure, not the whole compiler.
 // Module evaluation depends on lower/emitter/project capabilities outside it.
 const selected=nodes.filter(node=>node.value?.startsWith('evaluation-')&&node.value!=='evaluation-module-description');
 modules=await Promise.all(['syntax','reader'].map(async name=>({id:name+'.mjs',program:backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/'+name+'.eli','utf8'),name+'.eli')})));
 modules.push({id:'entry.mjs',program:{...entry,body:[...support.filter(node=>node.kind==='import-declaration'&&node.value==='./reader.mjs'),...selected,...support.filter(node=>node.kind!=='import-declaration')]}});
 runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 const raw='(message, filename) => { const error = new Error(message); error.eliscriptDiagnostic = { format: \'eliscript-diagnostic\', version: 1, code: \'ELI-E0001\', severity: \'error\', phase: \'evaluation-request\', message, ...(filename ? { location: { file: filename } } : {}) }; throw error; }';
 const original=flatten(backend.compiler.compile_ir_string('(defconst evaluation-fail (js* '+JSON.stringify(raw)+'))','original-entry-helper.eli').body)[0];
 const originalPath=resolve(directory,'compiler-original.mjs'),originalJS=backend.compiler.emit_ir_string({...entry,body:nodes.map(node=>node.value==='evaluation-fail'?original:node.kind==='import-declaration'?{...node,value:pathToFileURL(resolve(directory,'bootstrap',node.value)).href}:node)});await writeFile(originalPath,originalJS);reference=await import('data:text/javascript;base64,'+Buffer.from(originalJS).toString('base64'));
 const helper=nodes.find(node=>node.value==='evaluation-fail');assert(helper);
 const exported=flatten(backend.compiler.compile_ir_string('(defconst evaluation-fail nil) (export evaluation-fail)','diagnostic-export.eli').body).filter(node=>node.kind==='export-declaration');
 failure=(await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string({...entry,body:[helper,...exported]})).toString('base64'))).evaluation_fail;
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(rt=runtime){if(bytes&&rt===runtime)return bytes;const snapshot=JSON.stringify(modules),result=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'entry.mjs',rt));assert.equal(JSON.stringify(modules),snapshot);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(result)),[]);if(rt===runtime)bytes=result;return result;}
function decode(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(decode(a,child));}finally{a.release(child);}}return out;}if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=decode(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return value;}
function box(a,value){if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);if(value&&typeof value==='object'){const children=Object.fromEntries(Object.entries(value).map(([key,child])=>[key,box(a,child)]));try{return Array.isArray(value)?a.sourceArray(Object.values(children)):a.sourceObject(children);}finally{Object.values(children).forEach(child=>a.release(child));}}return value;}
function invoke(a,mode,input,filename){const roots=[a.number(mode),box(a,input),box(a,filename)];try{const out=a.invoke('observe',roots);try{return decode(a,out);}finally{a.release(out);}}finally{roots.forEach(root=>a.release(root));}}
function expected(mode,input,filename){try{return[true,mode===0?reference.evaluation_operation_request(input):mode===1?reference.evaluation_input_description(input,filename):reference.evaluation_form_description(input,filename)];}catch(error){return[false,error.message,error.eliscriptDiagnostic];}}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
const originalFailure=(message,filename)=>{const error=new Error(message);error.eliscriptDiagnostic={format:'eliscript-diagnostic',version:1,code:'ELI-E0001',severity:'error',phase:'evaluation-request',message,...(filename?{location:{file:filename}}:{})};throw error;};
const capture=(fn,...args)=>{try{fn(...args);assert.fail('must throw');}catch(error){return error;}};
test('real evaluation entry API closure and Reader dependencies execute in zero-import WASM',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:8192,initialBytes:1048576});a.auto(1);
 for(const name of['evaluation_operation_format','evaluation_operation_version','evaluation_input_format','evaluation_input_version','evaluation_form_format','evaluation_form_version']){const value=a.getExport(name);assert.deepEqual(decode(a,value),reference[name]);a.release(value);}
 for(const input of[{operation:'describe'},{id:'request',operation:'reset'},{id:7,operation:'evaluate',source:'(+ 1 2)',filename:'😀.eli'},{operation:'load',source:'x',filename:'file',root:'root',line:2,column:3}])assert.deepEqual(invoke(a,0,input),expected(0,input));
 for(const source of['',' ; comment','(+ 1','(+ 1 2)','(defun f () 1)','(defmacro f (x) x)','(module example)','(import "./x.mjs" x)','(defmulti value (lambda (x) x))','(defprotocol IRun run)','😀','"\\uD800"'])for(const mode of[1,2])assert.deepEqual(invoke(a,mode,source,'entry.eli'),expected(mode,source,'entry.eli'));
 finish(a);
});
test('evaluation operation input form and diagnostic rejection retains exact original errors and recovers under collecting GC',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:8192,initialBytes:1048576});a.auto(1);
 for(const input of[undefined,null,false,1,[],{}, {operation:'unknown'},{operation:'describe',source:'x'},{operation:'reset',filename:'x'},{operation:'describe',extra:1},{operation:'evaluate',source:'x',filename:''},{operation:'evaluate',source:'',filename:'f'},{id:'',operation:'describe'},{id:-1,operation:'describe'},{id:NaN,operation:'describe'},{operation:'load',source:'x',filename:'f',root:3},{operation:'load',source:'x',filename:'f',line:0},{operation:'load',source:'x',filename:'f',column:1.5}])assert.deepEqual(invoke(a,0,input),expected(0,input));
 for(const input of[undefined,null,false,0,'',')','(a) (b)','(defun 1 () 2)'])for(const file of[undefined,null,false,0,'','bad.eli'])for(const mode of[1,2])assert.deepEqual(invoke(a,mode,input,file),expected(mode,input,file));
 assert.deepEqual(invoke(a,1,'ok','recovered.eli'),expected(1,'ok','recovered.eli'));assert(a.stats().collections>100);finish(a);
});
test('evaluation diagnostic lambda keeps original arrow ABI native filename truth Error capture and message conversion ordering',()=>{
 assert.equal(failure.length,2);assert.equal(Object.hasOwn(failure,'prototype'),false);assert.throws(()=>Reflect.construct(String,[],failure),TypeError);
 for(const message of[undefined,null,false,-0,NaN,'',1n,'中😀\ud800',Symbol('m')])for(const filename of[undefined,null,false,true,-0,NaN,'',0n,'f',[],{},Symbol('file')]){const actual=capture(failure,message,filename),expected=capture(originalFailure,message,filename);assert.equal(Object.getPrototypeOf(actual),Object.getPrototypeOf(expected));assert.equal(actual.message,expected.message);assert.deepEqual(actual.eliscriptDiagnostic,expected.eliscriptDiagnostic);if(actual.eliscriptDiagnostic)assert(Object.is(actual.eliscriptDiagnostic.message,message));}
 const observe=fn=>{const events=[],sentinel={},saved=globalThis.Error;try{globalThis.Error=function(message){events.push('construct');return new saved(message);};const message={[Symbol.toPrimitive](hint){events.push(hint);throw sentinel;}};return{events,same:capture(fn,message,'file')===sentinel};}finally{globalThis.Error=saved;}};assert.deepEqual(observe(failure),observe(originalFailure));
 const saved=globalThis.Error,returned={};try{let argument;globalThis.Error=function(message){argument=message;return returned;};const message={};assert.equal(capture(failure,message,[]),returned);assert.equal(argument,message);assert.equal(returned.eliscriptDiagnostic.message,message);assert.deepEqual(returned.eliscriptDiagnostic.location.file,[]);}finally{globalThis.Error=saved;}
});
test('WASM evaluation diagnostics keep native filename truth and original message identity',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const message of[undefined,null,false,-0,NaN,'m',[],{}])for(const filename of[undefined,null,false,true,-0,NaN,'',[],{},'f']){const m=box(a,message),f=box(a,filename);let out;try{assert.equal(a.invoke('diagnostic_identity',[m,f]),true);out=a.invoke('diagnostic',[m,f]);const actual=decode(a,out),error=capture(originalFailure,message,filename);assert.deepEqual(actual,[error.message,error.eliscriptDiagnostic]);}finally{a.release(out);a.release(m);a.release(f);}}
 finish(a);
});
test('entry evaluation OOM preserves caller roots and a later small request recovers',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:256,initialBytes:32768,maxBytes:262144});a.auto(1);const source=a.string('['+'x '.repeat(256)+']'),filename=a.string('capacity.eli'),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 const mode=a.number(1);assert.throws(()=>a.invoke('observe',[mode,source,filename]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(mode);a.release(source);a.release(filename);a.collect();assert.deepEqual(invoke(a,1,'ok','file'),expected(1,'ok','file'));a.leaveFrame(caller);a.release(held);finish(a);
});
test('a real evaluation diagnostic WASM trap escapes source catch and unwinds only private frames',async()=>{
 const text=await readFile('bootstrap/runtime/memory.eli','utf8'),first=text.indexOf('  (defun value-error-new '),last=text.indexOf('  (defun heap-error-diagnostic ',first);assert(first>=0&&last>first);
 const injected=backend.compiler.compile_ir_string(text.slice(0,first)+'  (defun value-error-new (heap arguments count kind) (load-u32 4294967295))\n'+text.slice(last),'entry-trap.eli'),a=instantiateManagedRuntime(artifact(injected));a.auto(1);
 const message=a.string('bad'),file=a.string('file'),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);assert.throws(()=>a.invoke('diagnostic',[message,file]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.leaveFrame(caller);for(const root of[message,file,held])a.release(root);finish(a);
});
test('Node executes the same evaluation closure WASM bytes against its real JavaScript compiler entry',async()=>{
 const file=resolve(directory,'entry.wasm');await writeFile(file,artifact());const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const reference=await import(process.argv[2]);const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',decode.toString(),box.toString(),invoke.toString(),expected.toString(),finish.toString(),"const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:1048576});a.auto(1);for(const input of[{operation:'describe'},{operation:'evaluate',source:'x',filename:'f'},null,{operation:'unknown'}])assert.deepEqual(invoke(a,0,input),expected(0,input));for(const text of['(+ 1','(defun f () 1)',')'])for(const mode of[1,2])assert.deepEqual(invoke(a,mode,text,'node.eli'),expected(mode,text,'node.eli'));finish(a);"].join('\n');const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(resolve(directory,'compiler-original.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});
test('public Seed and bootstrap JS retain identical compiler entry bytes and module description query semantics',async()=>{
 const source='(module sample (defmacro twice (x) `(+ ,x ,x)) (defvar private 1) (defun public () private) (export public))';
 assert.deepEqual(backend.compiler.evaluation_module_description(source,'query.eli'),reference.evaluation_module_description(source,'query.eli'));
 const description=backend.compiler.evaluation_module_description(source,'query.eli');assert(Object.isFrozen(description));for(const field of['bindings','exports','macroSources'])assert(Object.isFrozen(description[field]));
 const output=resolve(directory,'entry-seed.mjs'),seed=spawnSync(resolve('bin/eliscript-seed'),['--source-map','--output',output,resolve('bootstrap/compiler/compiler.eli')],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);
 const strip=text=>text.replace(/\/\/# sourceMappingURL=[^\n]*\n?$/,'');assert.equal(strip(await readFile(output,'utf8')),strip(await readFile(resolve(directory,'bootstrap/compiler.mjs'),'utf8')));
});
// Whole entry linking and execution run unconditionally in wasm-compiler-candidate-smoke.test.mjs.
