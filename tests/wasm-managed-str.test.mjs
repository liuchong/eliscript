import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
const root=resolve(import.meta.dir,'..'),sourceRoot=resolve(process.env.ELISCRIPT_NATIVE_MANAGED_SOURCE_ROOT??root);
const family=`
(defun convert (value) (str value))
(defun zero () (str))
(defun simple () (js-array (str (js-array 1 2)) (str undefined nil false t (- 0)) (str "中😀" "尾") (str (js-object))))
(defun sparse () (let ((a (js-array 1))) (put a :length 4) (put a 2 nil) (str a)))
(defun ordered (mode)
 (let* ((events (js-array)) (cause (js-object :token 7))
  (make (lambda (label) (js-call events :push label)
   (js-object :toString (lambda () (js-call events :push (+ "convert" label))
    (if (and (= mode 1) (= label "first")) (throw cause) label))))))
  (try (js-array (str (funcall make "first") (funcall make "second") (funcall make "third")) events)
   (catch error (js-array (Object/is error cause) events)))))
(defun protocol (mode)
 (let* ((events (js-array)) (v (js-object)))
  (when (/= mode 0)
   (put v :toString (lambda () (js-call events :push "toString") (if (= mode 2) (js-object) "ordinary")))
   (put v :valueOf (lambda () (js-call events :push "valueOf") 7)))
  (when (or (= mode 3) (= mode 4))
   (put v (js* "Symbol.toPrimitive") (lambda (hint) (js-call events :push hint) (if (= mode 4) (funcall (js* "Symbol") "returned") "special"))))
  (when (= mode 5) (put v (js* "Symbol.toPrimitive") 7))
  (when (= mode 6) (put v (js* "Symbol.toPrimitive") nil))
  (try (js-array (str v) events) (catch error (js-array (aref error "name") events)))))
(defun symbols () (js-array (str (funcall (js* "Symbol"))) (str (funcall (js* "Symbol") "中😀")) (str (funcall (js* "Symbol.for") "registered"))))
(defun template (value) (js* "\u0060\u0024{value}\u0060"))
(defun symbol-template () (template (funcall (js* "Symbol") "x")))
(defun cycle () (let ((a (js-array 1))) (js-call a :push a) (str a)))
(defun custom-join () (let* ((events (js-array)) (a (js-array 1 2))) (put a :join (lambda () (js-call events :push "join") "custom")) (js-array (str a) events)))
(defun identity (cause) (let ((v (js-object))) (put v (js* "Symbol.toPrimitive") (lambda (hint) (throw cause))) (try (str v) (catch error (Object/is error cause)))))
(defun allocate (text) (str text text text text text text text text))
(export convert zero simple sparse ordered protocol symbols template symbol-template cycle custom-join identity allocate)`;
let directory,b,runtime,runtimeSource,managedSource,js;
async function managedFor(current,label){
 const path=resolve(current.directory,'str-'+label+'.mjs');
 await writeFile(path,current.compiler.compile_string(managedSource,'managed.eli'));
 return import(pathToFileURL(path).href);
}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-str-'));
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);
 b=await buildBackends({outputRoot:directory});
 const source=await readFile(resolve(sourceRoot,'bootstrap/backends/managed.eli'),'utf8');
 const local=await readFile(resolve(root,'bootstrap/backends/managed.eli'),'utf8');
 managedSource=source.replace(definition(source,'lower-managed-text-conversion'),definition(local,'lower-managed-text-conversion'));
 b.managed=await managedFor(b,'current');
 runtimeSource=await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8');runtime=b.compiler.compile_ir_string(runtimeSource,'runtime.eli');
 js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.compile_string(family,'str.eli')).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(source=family,r=runtime,current=b){const p=current.compiler.compile_ir_string(source,'str.eli'),before=JSON.stringify(p),bytes=Uint8Array.from(current.managed.emit_managed_wasm(p,r,{abi:'managed-module-v1'}));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);assert.equal(JSON.stringify(p),before);return{p,bytes,r};}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const item=a.get(v,i);try{return read(a,item);}finally{a.release(item);}});return v;}
function result(a,name,args=[]){const out=a.invoke(name,args);try{return read(a,out);}finally{a.release(out);}}
function finish(a){try{a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}finally{a.close?.();}}
const opened=()=>instantiateManagedRuntime(artifact().bytes);

test('str arrays use the existing full String conversion rather than primitive-only conversion',()=>{
 const a=opened();a.auto(1);try{assert.deepEqual(result(a,'simple'),js.simple());assert.equal(result(a,'sparse'),js.sparse());}finally{finish(a);}
});
test('str zero arguments and all primitive conversions preserve JavaScript exact text',()=>{
 const a=opened();a.auto(1);try{assert.equal(result(a,'zero'),'');for(const value of [undefined,null,false,true,-0,NaN,Infinity,-Infinity,1e-7,1e21,'','中😀\ud800']){const input=typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;try{assert.equal(result(a,'convert',[input]),js.convert(value));}finally{a.release(input);}}}finally{finish(a);}
});
test('str interleaves each operand evaluation with conversion and keeps the original thrown identity',()=>{
 const a=opened();a.auto(1);try{for(const mode of [0,1]){const input=a.number(mode);try{assert.deepEqual(result(a,'ordered',[input]),js.ordered(mode));}finally{a.release(input);}}for(const cause of [undefined,null,false,a.sourceObject({})]){assert.equal(a.invoke('identity',[cause]),true);a.release(cause);}}finally{finish(a);}
});
test('str ordinary string-hint fallback and custom ToPrimitive retain the full existing protocol',()=>{
 const a=opened();a.auto(1);try{for(let mode=0;mode<7;mode++){const input=a.number(mode);try{assert.deepEqual(result(a,'protocol',[input]),js.protocol(mode));}finally{a.release(input);}}assert.deepEqual(result(a,'custom-join'),js.custom_join());}finally{finish(a);}
});
test('str allows direct Symbol descriptions while template and Symbol-returning object conversion still reject',()=>{
 const a=opened();a.auto(1);try{assert.deepEqual(result(a,'symbols'),js.symbols());assert.throws(()=>a.invoke('symbol-template'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');}finally{finish(a);}
});
test('str retains the established cyclic array error contract and recovers after clearing all private roots',()=>{
 const a=opened();a.auto(1);try{assert.throws(()=>a.invoke('cycle'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0009');assert.equal(a.stats().frameDepth,0);assert.equal(result(a,'sparse'),js.sparse());}finally{finish(a);}
});

test('str capacity failure preserves caller roots and permits a later conversion',()=>{
 const a=instantiateManagedRuntime(artifact().bytes,{maxSlots:128,initialBytes:8192,maxBytes:16384});a.auto(1);
 const input=a.string('x'.repeat(1800)),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 try{assert.throws(()=>a.invoke('allocate',[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.collect();assert.equal(result(a,'convert',[held]),'0');}
 finally{a.leaveFrame(frame);a.release(held);finish(a);}
});
test('str actual runtime memory traps unwind private roots and preserve a caller frame',()=>{
 const source=runtimeSource.replace(definition(runtimeSource,'heap-join-text'),'(defun heap-join-text (heap value) (load-u32 4294967295))');
 const r=b.compiler.compile_ir_string(source,'trap-runtime.eli'),a=instantiateManagedRuntime(artifact(family,r).bytes);a.auto(1);
 const input=a.number(7),frame=a.frame(1);a.frameSet(frame,0,input);
 try{assert.throws(()=>a.invoke('convert',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.readNumber(input),7);assert.equal(result(a,'zero'),'');}
 finally{a.leaveFrame(frame);a.release(input);finish(a);}
});
async function nativeOf(code,label,options={}){
 const lowered=b.managed.lower_managed_program(code.p,code.r,true),before=JSON.stringify(lowered.typed),path=resolve(directory,label+'.dylib');
 await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));assert.equal(JSON.stringify(lowered.typed),before);
 return instantiateNativeManagedRuntime(path,lowered,options);
}
nativeTest('the same str IR executes the complete conversion family in real native memory code',async()=>{
 const a=await nativeOf(artifact(),'native');a.auto(1);
 try{
  for(const name of ['zero','simple','sparse','symbols','custom-join'])assert.deepEqual(result(a,name),js[name.replaceAll('-','_')]());
  for(const mode of [0,1]){const n=a.number(mode);try{assert.deepEqual(result(a,'ordered',[n]),js.ordered(mode));}finally{a.release(n);}}
  for(let mode=0;mode<7;mode++){const n=a.number(mode);try{assert.deepEqual(result(a,'protocol',[n]),js.protocol(mode));}finally{a.release(n);}}
  for(const value of [undefined,null,false,true,-0,NaN,Infinity,'中😀\ud800']){const input=typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;try{assert.equal(result(a,'convert',[input]),js.convert(value));}finally{a.release(input);}}
  for(const cause of [undefined,null,false,a.sourceObject({})]){assert.equal(a.invoke('identity',[cause]),true);a.release(cause);}
  assert.throws(()=>a.invoke('symbol-template'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('cycle'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0009');assert.equal(result(a,'zero'),'');
 }finally{finish(a);}
});
nativeTest('native str OOM and actual machine memory bounds traps preserve caller roots',async()=>{
 const small=await nativeOf(artifact(),'native-small',{maxSlots:128,initialBytes:8192,maxBytes:16384});small.auto(1);
 const text=small.string('x'.repeat(1800)),held=small.number(-0),frame=small.frame(1);small.frameSet(frame,0,held);
 try{assert.throws(()=>small.invoke('allocate',[text]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(small.stats().frameDepth,1);small.release(text);small.collect();assert.equal(result(small,'convert',[held]),'0');assert(Object.is(small.readNumber(held),-0));}finally{small.leaveFrame(frame);small.release(held);finish(small);}
 const r=b.compiler.compile_ir_string(runtimeSource.replace(definition(runtimeSource,'heap-join-text'),'(defun heap-join-text (heap value) (load-u32 4294967295))'),'trap-runtime.eli');
 const a=await nativeOf(artifact(family,r),'native-trap'),input=a.number(7),caller=a.frame(1);a.frameSet(caller,0,input);
 try{assert.throws(()=>a.invoke('convert',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.readNumber(input),7);assert.equal(result(a,'zero'),'');}finally{a.leaveFrame(caller);a.release(input);finish(a);}
});
test('Node independently executes the original JS oracle and identical collecting WASM str artifact',async()=>{
 const code=artifact(),path=resolve(directory,'str-node.wasm');await writeFile(path,code.bytes);
 const script=`import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{instantiateManagedRuntime}from ${JSON.stringify(pathToFileURL(resolve(root,'tools/backends/managed-runtime.mjs')).href)};
 const js=await import(${JSON.stringify('data:text/javascript;base64,'+Buffer.from(b.compiler.compile_string(family,'str.eli')).toString('base64'))});
 const bytes=await readFile(process.argv[1]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);
 function read(v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const child=a.get(v,i);try{return read(child);}finally{a.release(child);}});return v;}
 function result(name,args=[]){const out=a.invoke(name,args);try{return read(out);}finally{a.release(out);}}
 for(const name of ['zero','simple','sparse','symbols','custom-join'])assert.deepEqual(result(name),js[name.replaceAll('-','_')]());
 for(const name of ['ordered','protocol'])for(let mode=0;mode<(name==='ordered'?2:7);mode++){const n=a.number(mode);assert.deepEqual(result(name,[n]),js[name](mode));a.release(n);}
 for(const v of [undefined,null,false,true,-0,NaN,Infinity,-Infinity,1e-7,1e21,'中😀\\ud800']){const input=typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;assert.equal(result('convert',[input]),js.convert(v));a.release(input);}
 assert.throws(()=>a.invoke('symbol-template'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('cycle'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0009');a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`;
 const child=spawnSync('node',['--input-type=module','-e',script,path],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('str keeps independent Seed and three complete compiler generations at identical JS maps WASM and native bytes',async()=>{
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);
 const files=(await readdir(resolve(sourceRoot,'bootstrap/compiler'))).filter(name=>name.endsWith('.eli')).sort(),all=[b];let previous=b;
 for(const generation of [2,3]){
  const output=resolve(directory,'g'+generation),bootstrap=resolve(output,'bootstrap');await mkdir(bootstrap,{recursive:true});
  for(const file of files){const path=resolve(sourceRoot,'bootstrap/compiler',file),name=file.replace(/\.eli$/,'.mjs'),source=await readFile(path,'utf8'),emission=previous.compiler.compile_string_with_source_map(source,path,name,relative(bootstrap,path));await writeFile(resolve(bootstrap,name),emission.javascript+'//# sourceMappingURL='+name+'.map\n');await writeFile(resolve(bootstrap,name+'.map'),emission.sourceMap);}
  const current=await buildBackends({outputRoot:output,frontend:previous.compiler});current.compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);current.managed=await managedFor(current,'g'+generation);all.push(current);previous=current;
 }
 for(const file of files){const path=resolve(sourceRoot,'bootstrap/compiler',file),source=await readFile(path,'utf8'),name=file.replace(/\.eli$/,'.mjs'),reference=b.compiler.compile_string_with_source_map(source,path,name,'../compiler/'+file);for(const current of all.slice(1))assert.deepEqual(current.compiler.compile_string_with_source_map(source,path,name,'../compiler/'+file),reference);}
 const filename=resolve(directory,'str.eli'),seedOutput=resolve(directory,'str-seed.mjs');await writeFile(filename,family);
 const child=spawnSync(resolve(sourceRoot,'bin/eliscript-seed'),['--output',seedOutput,filename],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);const javascript=await readFile(seedOutput,'utf8');
 const seed=await buildBackends({outputRoot:resolve(directory,'seed'),seed:true}),managedInput=resolve(directory,'managed-str.eli'),managedOutput=resolve(seed.directory,'str-seed-managed.mjs');await writeFile(managedInput,managedSource);
 const managedChild=spawnSync(resolve(sourceRoot,'bin/eliscript-seed'),['--output',managedOutput,managedInput],{encoding:'utf8',timeout:30000});assert.equal(managedChild.status,0,managedChild.stderr);seed.managed=await import(pathToFileURL(managedOutput).href);all.push(seed);
 const outputs=[],native=[];
 for(const current of all){const p=current.compiler.compile_ir_string(family,filename),r=current.compiler.compile_ir_string(runtimeSource,'runtime.eli');assert.equal(current.compiler.emit_ir_string(p),javascript);const before=JSON.stringify(p);outputs.push(Uint8Array.from(current.managed.emit_managed_wasm(p,r,{abi:'managed-module-v1'})));const lowered=current.managed.lower_managed_program(p,r,true);native.push(Uint8Array.from(current.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));assert.equal(JSON.stringify(p),before);}
 for(const output of outputs.slice(1))assert.deepEqual(output,outputs[0]);for(const output of native.slice(1))assert.deepEqual(output,native[0]);
 const a=instantiateManagedRuntime(outputs[2]);a.auto(1);try{for(const name of ['simple','sparse','symbols','custom-join'])assert.deepEqual(result(a,name),js[name.replaceAll('-','_')]());}finally{finish(a);}
},120000);
