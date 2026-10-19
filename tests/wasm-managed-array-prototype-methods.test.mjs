import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {invokeWithHeapDiagnostic} from './helpers/managed-heap-diagnostic.mjs';
const methods=['push','pop','slice','map','filter','forEach','some','every','find','findIndex','findLast','findLastIndex','reduce','reduceRight','sort','toSorted','join','toString','concat','includes','indexOf','lastIndexOf','keys','values','entries'];
let directory,backend,runtime,program,bytes,reference,source;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-array-methods-'));backend=await buildBackends({outputRoot:directory});runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 source=`(defun replacement (trace label) (lambda (&rest args) (put trace :n (str (aref trace "n") ":" label)) (js-array label (js-length args) (JSON/stringify args))))
 ${methods.map(name=>`(defun test-${name} (mode)
  (let ((prototype (if (= mode 9) nil globalThis.Array.prototype)) (root globalThis.Object.prototype) (value (js-array 1 2)) (trace (js-object :n "")) (marker (js-object :tag "marker")))
   (cond ((or (= mode 7) (= mode 9)) (put root "${name}" (replacement trace "object")))
    ((= mode 1) (put prototype "${name}" false) (put value "${name}" (replacement trace "own")))
    ((= mode 2) (put prototype "${name}" nil)) ((= mode 3) (put prototype "${name}" undefined))
    ((= mode 4) (put prototype "${name}" false)) ((= mode 5) (put prototype "${name}" 42))
    (t (put prototype "${name}" (replacement trace "prototype"))))
   (let ((out (try (js-call value :${name}
     (progn (put trace :n (str (aref trace "n") "1"))
      (cond ((= mode 6) (put prototype "${name}" (replacement trace "late")))
       ((= mode 8) (throw false)) ((= mode 10) (throw undefined)) ((= mode 11) (throw marker))) 11)
     (progn (put trace :n (str (aref trace "n") "2")) 22)
     (progn (put trace :n (str (aref trace "n") "3")) 33))
    (catch error (cond ((Object/is error marker) "thrown-object") ((= error false) "thrown-false") ((undefined? error) "thrown-undefined") (t (aref error "name")))))))
    (JSON/stringify (js-array (aref trace "n") out value)))))`).join('\n')}
 (defun native () (aref globalThis.Array.prototype "push"))
 (defun recover () (+ 1 2))
 (export native recover ${methods.map(name=>'test-'+name).join(' ')})`;
 program=backend.compiler.compile_ir_string(source,'array-prototype-methods.eli');const saved=JSON.stringify(program),javascript=backend.compiler.emit_ir_string(program);reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));await writeFile(resolve(directory,'reference.mjs'),javascript);bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtime));assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function withPrototypes(fn){
 const arrays=Object.getOwnPropertyDescriptors(Array.prototype),objects=Object.getOwnPropertyDescriptors(Object.prototype);
 try{return fn();}finally{
  for(const [prototype,saved]of[[Object.prototype,objects],[Array.prototype,arrays]]){
   for(const key of Reflect.ownKeys(prototype))if(!Object.hasOwn(saved,key))delete prototype[key];
   for(const key of Reflect.ownKeys(saved))if(key!=='length')Object.defineProperty(prototype,key,saved[key]);
   if(Object.hasOwn(saved,'length'))Object.defineProperty(prototype,'length',saved.length);
  }
 }
}
function finish(a,values=[]){for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
for(const name of methods)test('Array '+name+' resolves source prototype overrides, own priority, nullish callees and captured argument order',()=>{
 for(let mode=0;mode<=11;mode++){const expected=withPrototypes(()=>reference['test_'+name](mode)),a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.number(mode),out=a.invoke('test-'+name,[input]);assert.equal(a.readString(out),expected,name+' mode '+mode);finish(a,[input,out]);}
});
test('independent Node native methods and the same zero-import bytes preserve all source Array override contracts',async()=>{
 const artifact=resolve(directory,'array-prototype-methods.wasm');await writeFile(artifact,bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]),reference=await import(process.argv[2]),bytes=readFileSync(process.argv[3]);',withPrototypes.toString(),finish.toString(),
 'for(const name of '+JSON.stringify(methods)+'){for(let mode=0;mode<=11;mode++){const expected=withPrototypes(()=>reference["test_"+name](mode)),a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.number(mode),out=a.invoke("test-"+name,[input]);assert.equal(a.readString(out),expected,name+" mode "+mode);finish(a,[input,out]);}}'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(resolve(directory,'reference.mjs')).href,artifact],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('override dispatch capacity failure preserves caller frames and recovers without retained roots',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:32768,maxBytes:131072});a.auto(1);const mode=a.number(6),caller=a.frame(1);a.frameSet(caller,0,mode);const padding=[];let exhausted=false;
 try{for(let i=0;i<512;i++)padding.push(a.number(i));}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');exhausted=true;}assert(exhausted);
 assert.throws(()=>a.invoke('test-push',[mode]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);
 for(const value of padding)a.release(value);a.collect();const out=invokeWithHeapDiagnostic(a,'test-push',[mode]);assert.equal(a.readString(out),withPrototypes(()=>reference.test_push(6)));assert.equal(a.stats().frameDepth,1);a.leaveFrame(caller);finish(a,[mode,out]);
});
test('captured prototype callee Get traps unwind private frames while a later independent source call recovers',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),first=source.indexOf('  (defun value-array-callback-get '),last=source.indexOf('  ;; The supported source objects',first);assert(first>=0&&last>first);
 const injected=backend.compiler.compile_ir_string(source.slice(0,first)+'  (defun value-array-callback-get (heap value key) (load-u32 4294967295))\n'+source.slice(last),'array-method-get-trap.eli');
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(program,injected));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 for(const name of ['push','includes','keys']){const a=instantiateManagedRuntime(artifact);a.auto(1);const mode=a.number(0),caller=a.frame(1);a.frameSet(caller,0,mode);assert.throws(()=>a.invoke('test-'+name,[mode]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const out=a.invoke('recover');assert.equal(a.readNumber(out),3);assert.equal(a.stats().frameDepth,1);a.leaveFrame(caller);finish(a,[mode,out]);}
});
test('default Array native method lookup returns a real managed callable',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const method=a.invoke('native');assert.equal(method.kind,18);finish(a,[method]);
});
