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
let directory,backend,runtime,program,bytes,reference,source;
const methods=['map','filter','forEach','every','some','reduce','reduceRight','indexOf','lastIndexOf','sort','slice','concat'];
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-array-inheritance-'));backend=await buildBackends({outputRoot:directory});runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 const operations={
  map:'(js-call value :map (lambda (item) item))',filter:'(js-call value :filter (lambda () t))',forEach:'(let ((seen (js-array))) (js-call value :forEach (lambda (item index) (js-call seen :push (js-array index item)))) seen)',
  every:'(let ((seen (js-array))) (js-call value :every (lambda (item index) (js-call seen :push index) false)) seen)',some:'(let ((seen (js-array))) (js-call value :some (lambda (item index) (js-call seen :push index) t)) seen)',reduce:'(js-call value :reduce (lambda (sum item index) (+ sum index)) 0)',reduceRight:'(js-call value :reduceRight (lambda (sum item index) (+ sum index)) 0)',
  indexOf:'(js-call value :indexOf inherited)',lastIndexOf:'(js-call value :lastIndexOf inherited)',sort:'(js-call value :sort)',slice:'(js-call value :slice 0)',concat:'(js-call (js-array) :concat value)'};
 source=`(defun sparse (inherited) (let ((prototype globalThis.Array.prototype) (value (js-array))) (put prototype :length 0) (put prototype "1" inherited) (put value :length 4) (put value "3" 3) value))
 (defun describe (value) (js-array (JSON/stringify value) (JSON/stringify (Object/keys value)) (Object/hasOwn value "1") (undefined? (Object/getOwnPropertyDescriptor value "1"))))
 ${methods.map(method=>`(defun test-${method} (inherited) (let ((value (sparse inherited))) (let ((out ${operations[method]})) (JSON/stringify (js-array ${['map','filter','forEach','every','some','sort','slice','concat'].includes(method)?'(describe out)':'out'} (describe value))))))`).join('\n')}
 (defun dynamic (mode)
  (let ((value (sparse 7)) (prototype globalThis.Array.prototype) (trace (js-array)))
   (put value "0" 1) (when (= mode 1) (put prototype :length 0))
   (let ((out (js-call value :map (lambda (item index)
     (js-call trace :push index)
     (when (= index 0) (cond ((= mode 0) (put prototype :length 0)) ((= mode 1) (put prototype "1" 7)) (t (put value :length 1)))) item))))
    (JSON/stringify (js-array (describe out) trace (describe value))))))
 (defun sort-effect () (let ((value (sparse 7)) (prototype globalThis.Array.prototype) (trace (js-array)))
  (js-call value :sort (lambda (a b) (js-call trace :push 1) (put prototype :length 0) (- a b)))
  (JSON/stringify (js-array (describe value) trace))))
 (defun argument-effect (concat) (let ((value (sparse 7)) (prototype globalThis.Array.prototype) (trace (js-array)))
  (let ((out (if concat (js-call (js-array) :concat (progn (js-call trace :push 1) (put prototype :length 0) value))
   (js-call value :slice (progn (js-call trace :push 1) (put prototype :length 0) 0)))))
   (JSON/stringify (js-array (describe out) trace)))))
 (defun prototype () globalThis.Array.prototype)
 (defun object-prototype () globalThis.Object.prototype)
 (defun range-copy (concat) (let ((value (sparse 7))) (JSON/stringify (describe (if concat (js-call (js-array 9) :concat value) (js-call value :slice 1 4))))))
 (defun throw-callback (value) (js-call value :map (lambda (item) (throw item))))
 (defconst iterate (js* "(iterable, visit) => { for (const item of iterable) visit(item); }"))
 (defun iterator-inherited (inherited mode)
  (let ((value (sparse inherited)))
   (JSON/stringify
    (cond ((= mode 0) (let ((out (js-array))) (funcall iterate value (lambda (item) (js-call out :push item))) out))
     ((= mode 1) (apply (lambda (&rest items) items) value))
     ((= mode 2) (Array/from value))
     ((= mode 3) (try (throw value) (catch [a b c &rest tail] (js-array a b c tail))))
     ((= mode 4) (Array/from (js-call value :entries)))
     (t (Array/from (js-call value :keys)))))))
 (defun native ()
  (let ((method (aref globalThis.Array.prototype "push")) (value (js-array 1)))
   (JSON/stringify (js-array (js-call method :call value 2 3) value (get method :name) (get method :length)))))
 ${methods.map(method=>`(defun raw-${method} (value inherited) (JSON/stringify ${['map','filter','forEach','every','some','sort','slice','concat'].includes(method)?'(describe '+operations[method]+')':operations[method]}))`).join('\n')}
 (export iterator-inherited dynamic sort-effect argument-effect prototype object-prototype range-copy throw-callback native ${methods.map(method=>'test-'+method).join(' ')} ${methods.map(method=>'raw-'+method).join(' ')})`;
 program=backend.compiler.compile_ir_string(source,'array-inheritance.eli');const javascript=backend.compiler.emit_ir_string(program);reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));await writeFile(resolve(directory,'reference.mjs'),javascript);
 const frozen=JSON.stringify(program);bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtime));assert.equal(JSON.stringify(program),frozen);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function withPrototype(fn){
 const saved=Object.getOwnPropertyDescriptors(Array.prototype);
 try{return fn();}finally{
  for(const key of Reflect.ownKeys(Array.prototype))if(!Object.hasOwn(saved,key))delete Array.prototype[key];
  for(const key of Reflect.ownKeys(saved))if(key!=='length')Object.defineProperty(Array.prototype,key,saved[key]);
  Object.defineProperty(Array.prototype,'length',saved.length);
 }
}
function finish(a,values=[]){for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
for(const method of methods)test('Array '+method+' observes inherited numeric data while own keys and descriptors remain own-only',()=>{
 for(const inherited of[7,undefined]){const a=instantiateManagedRuntime(bytes);a.auto(1);const input=inherited===undefined?undefined:a.number(inherited),expected=withPrototype(()=>reference['test_'+method](inherited)),out=a.invoke('test-'+method,[input]);assert.equal(a.readString(out),expected,method+': '+String(inherited));finish(a,[input,out]);}
});
test('independent Node native JS and identical WASM bytes exercise the full inherited-array HasProperty family',async()=>{
 const artifact=resolve(directory,'inheritance.wasm');await writeFile(artifact,bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const {instantiateManagedRuntime}=await import(process.argv[1]),reference=await import(process.argv[2]),bytes=readFileSync(process.argv[3]);',withPrototype.toString(),finish.toString(),
  'for(const method of '+JSON.stringify(methods)+'){for(const inherited of[7,undefined]){const a=instantiateManagedRuntime(bytes);a.auto(1);const input=inherited===undefined?undefined:a.number(inherited),expected=withPrototype(()=>reference["test_"+method](inherited)),out=a.invoke("test-"+method,[input]);assert.equal(a.readString(out),expected,method);finish(a,[input,out]);}}',
  'for(const inherited of[7,undefined])for(let mode=0;mode<6;mode++){const a=instantiateManagedRuntime(bytes);a.auto(1);const input=inherited===undefined?undefined:a.number(inherited),m=a.number(mode),expected=withPrototype(()=>reference.iterator_inherited(inherited,mode)),out=a.invoke("iterator-inherited",[input,m]);assert.equal(a.readString(out),expected,"iterator mode "+mode);finish(a,[input,m,out]);}'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(resolve(directory,'reference.mjs')).href,artifact],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('live HasProperty observes prototype addition, deletion and inherited indices beyond a shrunken receiver',()=>{
 for(const mode of[0,1,2]){const a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.number(mode),expected=withPrototype(()=>reference.dynamic(mode)),out=a.invoke('dynamic',[input]);assert.equal(a.readString(out),expected,'dynamic mode '+mode);finish(a,[input,out]);}
});
test('sorting snapshots inherited data before comparator mutation and copy methods observe argument effects first',()=>{
 for(const [name,args]of[['sort-effect',[]],['argument-effect',[false]],['argument-effect',[true]]]){const a=instantiateManagedRuntime(bytes);a.auto(1);const expected=withPrototype(()=>reference[name.replaceAll('-','_')](...args)),out=a.invoke(name,args);assert.equal(a.readString(out),expected,name);finish(a,[out]);}
});

test('deterministic sparse arrays preserve inherited undefined, holes and every implemented HasProperty algorithm',()=>{
 let state=0x795ac20;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 for(let trial=0;trial<12;trial++){
  const length=2+next()%6,own=new Array(length),inherited=new Array(length);
  for(let index=0;index<length;index++){if(next()%3===0)own[index]=next()%4===0?undefined:next()%16;if(next()%3===0)inherited[index]=next()%4===0?undefined:next()%16;}
  for(const method of methods){
   const copy=Object.assign(new Array(length),own),expected=withPrototype(()=>{Array.prototype.length=0;for(const key of Object.keys(inherited))Array.prototype[key]=inherited[key];return reference['raw_'+method](copy,undefined);});
   const a=instantiateManagedRuntime(bytes);a.auto(1);const prototype=a.invoke('prototype'),boxed=[],items=new Array(length);a.resize(prototype,length);
   for(const key of Object.keys(inherited)){const value=inherited[key]===undefined?undefined:a.number(inherited[key]);boxed.push(value);a.set(prototype,Number(key),value);}
   for(const key of Object.keys(own)){const value=own[key]===undefined?undefined:a.number(own[key]);boxed.push(value);items[key]=value;}
   const input=a.sourceArray(items),out=a.invoke('raw-'+method,[input,undefined]);assert.equal(a.readString(out),expected,method+' trial '+trial);finish(a,[prototype,input,out,...boxed]);
  }
 }
});

test('inherited thrown values retain exact identity including undefined and unwind only callback-owned frames',()=>{
 for(const inherited of[undefined,false,{marker:true}]){
  const expected=withPrototype(()=>{Array.prototype[1]=inherited;let caught=false;try{reference.throw_callback(new Array(4));}catch(error){caught=true;assert.equal(error,inherited);}assert(caught);});assert.equal(expected,undefined);
  const a=instantiateManagedRuntime(bytes);a.auto(1);const prototype=a.invoke('prototype'),input=a.sourceArray(new Array(4)),marker=inherited&&typeof inherited==='object'?a.sourceObject({marker:true}):inherited,caller=a.frame(1);a.frameSet(caller,0,input);a.resize(prototype,2);a.set(prototype,1,marker);
  let caught=false,thrown;try{a.invoke('throw-callback',[input]);}catch(error){caught=true;thrown=error;}assert(caught);if(marker&&typeof marker==='object'){assert(a.keyEqual(thrown,marker));a.release(thrown);}else assert.equal(thrown,marker);assert.equal(a.stats().frameDepth,1);assert.equal(a.length(input),4);
  a.resize(prototype,0);a.leaveFrame(caller);finish(a,[prototype,input,marker]);
 }
});
test('HasProperty does not execute the inherited Get while actual Get traps, preserving raw caller frames and roots',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),first=source.indexOf('  (defun heap-object-read-data '),last=source.indexOf('  (defun heap-object-read ',first);assert(first>=0&&last>first);
 const trapped=source.slice(0,first)+'  (defun heap-object-read-data (heap object key) (load-u32 4294967295))\n'+source.slice(last);
 const exposed=trapped.trimEnd().slice(0,-1)+'\n (defun test-array-has-inherited (heap value index) (heap-source-array-index-read heap value index 2))\n (export test-array-has-inherited))';
 const injected=backend.compiler.compile_ir_string(exposed,'inheritance-get-trap.eli');
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(program,injected));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact)).exports,h=e['heap-new'](128,32768,65536),prototype=e['value-standard-prototype'](h,0),key=e['value-string'](h,1);
 new DataView(e.memory.buffer).setUint16(e['value-data'](h,key,5),49,true);e['value-seal'](h,key);e['value-object-put'](h,prototype,key,3,2);
 const input=e['value-array-new'](h,2),caller=e['frame-new'](h,1);e['frame-set'](h,caller,0,input);
 assert.equal(e['value-array-has'](h,input,key),0);assert.equal(e['last-error'](),0);
 assert.equal(e['test-array-has-inherited'](h,input,1),1);assert.equal(e['last-error'](),0);assert.equal(e['frame-depth'](h),1);
 assert.throws(()=>e['value-array-get'](h,input,key,0),WebAssembly.RuntimeError);assert.equal(e['frame-depth'](h),1);
 assert.equal(e['test-array-has-inherited'](h,input,1),1);e['frame-pop'](h,caller);e['value-standard-prototypes-close'](h);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
});

test('inherited-array allocation failure keeps caller frames and live prototype edges, then copying recovers',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:16384,maxBytes:65536});a.auto(1);const prototype=a.invoke('prototype'),input=a.sourceArray(new Array(4)),caller=a.frame(1);a.frameSet(caller,0,input);a.resize(prototype,2);a.set(prototype,1,undefined);
 const padding=[];let exhausted=false;try{for(let i=0;i<128;i++)padding.push(a.number(i));}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');exhausted=true;}assert(exhausted);
 assert.throws(()=>a.invoke('raw-map',[input,undefined]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert.equal(a.length(input),4);
 for(const value of padding)a.release(value);a.collect();const out=invokeWithHeapDiagnostic(a,'raw-slice',[input,undefined]);assert.equal(a.readString(out),withPrototype(()=>{Array.prototype[1]=undefined;return reference.raw_slice(new Array(4),undefined);}));a.leaveFrame(caller);finish(a,[prototype,input,out]);
});
test('native Array prototype callables preserve their real invocation receiver name and arity',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('native');assert.equal(a.readString(out),withPrototype(()=>reference.native()));finish(a,[out]);
});

test('slice offsets and concat receiver prefixes preserve holes even when the result inherits a different index',()=>{
 for(const concat of[false,true]){const a=instantiateManagedRuntime(bytes);a.auto(1);const expected=withPrototype(()=>reference.range_copy(concat)),out=a.invoke('range-copy',[concat]);assert.equal(a.readString(out),expected);finish(a,[out]);}
});
test('all HasProperty families walk beyond Array prototype to actual Object prototype numeric data',()=>{
 for(const inherited of[7,undefined])for(const method of methods){
  const saved=Object.getOwnPropertyDescriptor(Object.prototype,'1');let expected;
  try{expected=withPrototype(()=>{Array.prototype.length=0;Object.prototype[1]=inherited;const value=new Array(4);value[3]=3;return reference['raw_'+method](value,inherited);});}
  finally{if(saved)Object.defineProperty(Object.prototype,'1',saved);else delete Object.prototype[1];}
  const a=instantiateManagedRuntime(bytes);a.auto(1);const arrayPrototype=a.invoke('prototype'),objectPrototype=a.invoke('object-prototype'),key=a.string('1'),number=inherited===undefined?undefined:a.number(inherited),three=a.number(3);a.objectSet(objectPrototype,key,number);const items=new Array(4);items[3]=three;const input=a.sourceArray(items),out=a.invoke('raw-'+method,[input,number]);assert.equal(a.readString(out),expected,method);finish(a,[arrayPrototype,objectPrototype,key,number,three,input,out]);
 }
});

test('source Array iterators perform inherited Get for for-of, argument spread, Array.from, catch binding and entries',()=>{
 for(const inherited of[7,undefined])for(let mode=0;mode<6;mode++){const expected=withPrototype(()=>reference.iterator_inherited(inherited,mode)),a=instantiateManagedRuntime(bytes);a.auto(1);const input=inherited===undefined?undefined:a.number(inherited),m=a.number(mode),out=a.invoke('iterator-inherited',[input,m]);assert.equal(a.readString(out),expected,'iterator mode '+mode);finish(a,[input,m,out]);}
});
test('keys iterator does not Get inherited numeric values while entries and values execute the real inherited read',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),first=source.indexOf('  (defun heap-object-read-data '),last=source.indexOf('  (defun heap-object-read ',first);assert(first>=0&&last>first);
 const trapped=source.slice(0,first)+'  (defun heap-object-read-data (heap object key) (load-u32 4294967295))\n'+source.slice(last),exposed=trapped.trimEnd().slice(0,-1)+'\n (defun test-iterator-step (heap iterator) (heap-source-iterator-step heap iterator))\n (export test-iterator-step))',injected=backend.compiler.compile_ir_string(exposed,'iterator-inherited-get-trap.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(program,injected));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 for(const method of[6,7,8]){const e=new WebAssembly.Instance(new WebAssembly.Module(artifact)).exports,h=e['heap-new'](128,32768,65536),prototype=e['value-standard-prototype'](h,0),key=e['value-string'](h,1);new DataView(e.memory.buffer).setUint16(e['value-data'](h,key,5),49,true);e['value-seal'](h,key);e['value-object-put'](h,prototype,key,3,2);const input=e['value-array-new'](h,2),caller=e['frame-new'](h,2);e['frame-set'](h,caller,0,input);const iterator=e['value-source-method'](h,input,method,3,3);e['frame-set'](h,caller,1,iterator);assert.equal(e['test-iterator-step'](h,iterator),1);if(method===7){assert.equal(e['test-iterator-step'](h,iterator),1);assert.equal(e['last-error'](),0);}else assert.throws(()=>e['test-iterator-step'](h,iterator),WebAssembly.RuntimeError);assert.equal(e['frame-depth'](h),1);e['frame-pop'](h,caller);e['value-standard-prototypes-close'](h);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);}
});
