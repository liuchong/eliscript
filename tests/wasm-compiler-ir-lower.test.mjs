import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory, backend, runtime, modules, helpers, helperFile;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-ir-lower-'));
 backend=await buildBackends({outputRoot:directory});
 runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 modules=[];
 for(const name of ['syntax','ir','lower'])modules.push({id:name+'.mjs',program:backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/'+name+'.eli','utf8'),name+'.eli')});
 const source=(await readFile('bootstrap/compiler/ir.eli','utf8')).trimEnd();
 const exposed=source.slice(0,-1)+'\n(export schema-fail dense-json-array-p plain-record-keys parse-json))';
 const helperIR=backend.compiler.compile_ir_string(exposed,'ir-helper-parity.eli');
 const javascript=backend.compiler.emit_ir_string(helperIR);helperFile=resolve(directory,'ir-helper-parity.mjs');await writeFile(helperFile,javascript);
 helpers=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
test('the entire IR module and actual syntax/lower dependency graph compile to zero-import WASM without extracting private helpers',()=>{
 const saved=JSON.stringify(modules);
 for(const entry of ['ir.mjs','lower.mjs']){
  const bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(entry==='ir.mjs'?[modules[1]]:modules,entry,runtime));
  assert.equal(JSON.stringify(modules),saved);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
  const a=instantiateManagedRuntime(bytes);a.auto(1);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});


const originalDense = value => {
 if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || Object.getOwnPropertySymbols(value).length!==0) return false;
 const names=Object.getOwnPropertyNames(value);
 if(names.length!==value.length+1||names[names.length-1]!=='length')return false;
 for(let index=0;index<value.length;index+=1){const name=String(index);if(names[index]!==name)return false;const descriptor=Object.getOwnPropertyDescriptor(value,name);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return false;}
 return true;
};
const originalRecord=value=>{
 if(value===null||typeof value!=='object'||Array.isArray(value))return null;
 const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return null;
 if(Object.getOwnPropertySymbols(value).length!==0)return null;
 const names=Object.getOwnPropertyNames(value);
 for(const name of names){const descriptor=Object.getOwnPropertyDescriptor(value,name);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return null;}
 return names.sort();
};
test('portable IR predicates retain the original raw JS descriptor and prototype rules, proxy observation order and arrow reflection',()=>{
 const values=[undefined,null,false,true,0,-0,NaN,'',Symbol('x'),()=>{},[],[undefined],[null],Array(1),{},Object.create(null),Object.create({}),new Date(),new Map(),Object.prototype,Array.prototype];
 const nonenumerable={};Object.defineProperty(nonenumerable,'x',{value:1});values.push(nonenumerable);
 const accessor={};Object.defineProperty(accessor,'x',{enumerable:true,get(){throw Error('must not invoke data getter');}});values.push(accessor);
 const symbol={};symbol[Symbol('x')]=1;values.push(symbol);
 const array=[1];Object.defineProperty(array,'0',{enumerable:true,get(){throw Error('must not invoke data getter');}});values.push(array);
 const named=[1];named.extra=true;values.push(named,Object.freeze([1,2]));
 for(const value of values){assert.equal(helpers.dense_json_array_p(value),originalDense(value));assert.deepEqual(helpers.plain_record_keys(value),originalRecord(value));}
 for(const [actual,expected] of [[helpers.dense_json_array_p,originalDense],[helpers.plain_record_keys,originalRecord]]){
  assert.equal(actual.length,expected.length);assert.equal(Object.hasOwn(actual,'prototype'),false);assert.throws(()=>Reflect.construct(function(){},[],actual),TypeError);
  const observe=fn=>{const trace=[];const value=new Proxy({b:2,a:1},{getPrototypeOf(target){trace.push('prototype');return Reflect.getPrototypeOf(target);},ownKeys(target){trace.push('keys');return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key);}});const out=fn(value);return{out,trace};};
  assert.deepEqual(observe(actual),observe(expected));
 }
});
test('ordinary schema failures preserve the original Error constructor argument count',()=>{
 const script=`import assert from 'node:assert/strict';const helpers=await import(process.argv[1]);
 const OriginalError=globalThis.Error,calls=[];let thrown;
 try{globalThis.Error=class extends OriginalError{constructor(...args){calls.push(args);super(...args);}};try{helpers.schema_fail('kept','ignored');}catch(error){thrown=error;}}
 finally{globalThis.Error=OriginalError;}
 assert(thrown instanceof OriginalError);assert.deepEqual(calls,[['kept']]);assert.equal(Object.hasOwn(thrown,'cause'),false);assert.equal(thrown.eliscriptDiagnostic.message,'kept');`;
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(helperFile).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});
test('portable schema and JSON rejection helpers keep exact diagnostic values, callback errors and original arrow contracts',()=>{
 assert.equal(helpers.schema_fail.length,1);assert.equal(helpers.parse_json.length,2);
 for(const fn of [helpers.schema_fail,helpers.parse_json]){assert.equal(Object.hasOwn(fn,'prototype'),false);assert.throws(()=>Reflect.construct(function(){},[],fn),TypeError);}
 for(const message of [undefined,null,false,0,-0,'中😀',{},Symbol('x')]){
  if(typeof message==='symbol'){assert.throws(()=>helpers.schema_fail(message),TypeError);continue;}
  try{helpers.schema_fail(message);assert.fail('must throw');}catch(error){assert(error instanceof Error);assert.equal(error.eliscriptDiagnostic.message,message);assert.equal(error.eliscriptDiagnostic.code,'ELI-I0001');}
 }
 for(const text of ['null','false','0','-0','"中😀"','[1,null]','{"x":2}'])assert.deepEqual(helpers.parse_json(text,()=>assert.fail('valid JSON')),JSON.parse(text));
 for(const text of ['{','undefined','[1,]']){const calls=[];assert.equal(helpers.parse_json(text,(...args)=>{calls.push(args);return false;}),false);assert.deepEqual(calls,[['invalid canonical IR JSON']]);
  try{helpers.parse_json(text,helpers.schema_fail);assert.fail('must throw schema error');}catch(error){assert.equal(error.message,'invalid canonical IR JSON');assert.equal(error.eliscriptDiagnostic.message,error.message);assert(error.cause instanceof SyntaxError);const descriptor=Object.getOwnPropertyDescriptor(error,'cause');assert.equal(descriptor.enumerable,false);assert.equal(descriptor.writable,true);assert.equal(descriptor.configurable,true);}
 }
 const thrown={};assert.throws(()=>helpers.parse_json('{',()=>{throw thrown;}),error=>error===thrown);
 const extra=new Proxy({},{get(){throw Error('ignored extra must not be read');}});assert.equal(helpers.parse_json('null',()=>assert.fail('valid input'),extra),null);
 assert.throws(()=>helpers.schema_fail('ordinary',extra),error=>error.message==='ordinary'&&!Object.hasOwn(error,'cause'));
 const parse=JSON.parse,original=new SyntaxError('actual parser failure');
 try{JSON.parse=()=>{throw original;};assert.throws(()=>helpers.parse_json('{',helpers.schema_fail),error=>error.message==='invalid canonical IR JSON'&&error.cause===original);}
 finally{JSON.parse=parse;}
});

test('standard prototype identity and mutations remain realm roots and survive explicit close through held object edges without module globals',()=>{
 const program=backend.compiler.compile_ir_string('(defun proto (value) (Object/getPrototypeOf value)) (defun root () globalThis.Object.prototype) (defun array-root () globalThis.Array.prototype) (export proto root array-root)','realm-lifetime.eli');
 let bytes;try{bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtime));}catch(error){console.error(JSON.stringify(error.eliscriptDiagnostic));throw error;}
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 const before=a.sourceObject({}),array=a.sourceArray([]),objectProto=a.invoke('root'),arrayProto=a.invoke('array-root'),key=a.string('inherited');
 a.objectSet(objectProto,key,true);const beforeProto=a.invoke('proto',[before]);assert(a.keyEqual(beforeProto,objectProto));a.release(beforeProto);
 const after=a.sourceObject({}),afterProto=a.invoke('proto',[after]);assert(a.keyEqual(afterProto,objectProto));a.release(afterProto);
 a.release(objectProto);a.release(arrayProto);a.collect();assert.equal(a.objectGet(before,key),true);assert.equal(a.objectGet(after,key),true);
 assert.equal(a.closeModule(),false);a.collect();assert.equal(a.objectGet(before,key),true);assert.equal(a.objectGet(after,key),true);
 const later=a.sourceObject({});assert.equal(a.objectGet(later,key),true);
 for(const value of[before,after,array,key,later])a.release(value);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});

test('canonical IR numeric values keep positive and negative zero distinct after raw Object.is migration',()=>{
 for(const value of [0,-0,1,-1]){
  const program=backend.compiler.compile_ir_string('(defconst x 0)','zero.eli');
  program.body[0].children[0].value=value;
  const text=helpers.serialize_program(program);
  assert.equal(text.includes('"value":-0'),Object.is(value,-0));
 }
});

// Preserve IEEE negative zero at the JSON-only test boundary for real syntax trees.
function syntaxJSON(value){
 if(typeof value==='number'&&Object.is(value,-0))return '-0';
 if(Array.isArray(value))return '['+value.map(syntaxJSON).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+syntaxJSON(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function finish(a,values=[]){for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function sourceError(a,fn){
 let thrown;try{fn();assert.fail('must throw source schema error');}catch(error){thrown=error;}
 assert.equal(thrown.kind,13);
 const get=(object,name)=>{const key=a.string(name);try{return a.objectGet(object,key);}finally{a.release(key);}};
 const message=get(thrown,'message'),diagnostic=get(thrown,'eliscriptDiagnostic'),code=get(diagnostic,'code'),phase=get(diagnostic,'phase');
 try{return{message:a.readString(message),code:a.readString(code),phase:a.readString(phase)};}
 finally{for(const value of[thrown,message,diagnostic,code,phase])a.release(value);}
}
test('the full IR module validates, deserializes and canonically serializes real compiler output with exact Unicode, zero signs and schema diagnostics',()=>{
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(modules[1].program,runtime));
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const source of ['', '(defconst answer 42)', '(defun identity (value) value)', '(defconst text "中😀\\ud800")', '(defun run () (try (throw nil) (catch [x nil &rest rest] x) (finally false)))']){
  const program=backend.compiler.compile_ir_string(source,'真实-ir.eli'),canonical=helpers.serialize_program(program),input=a.string(canonical),parsed=a.invoke('deserialize-program',[input]),serialized=a.invoke('serialize-program',[parsed]);
  assert.equal(a.readString(serialized),canonical);
  for(const value of[input,parsed,serialized])a.release(value);
 }
 const valid=helpers.serialize_program(backend.compiler.compile_ir_string('(defconst x 1)','valid.eli'));
 for(const [input,message]of [[valid+' ','IR source is valid JSON but not canonical IR JSON'],['{"format":"wrong","program":{"body":[],"filename":"x"},"version":1}','unsupported IR format: wrong']]){
  const text=a.string(input);let expected;try{helpers.deserialize_program(input);}catch(error){expected=error.eliscriptDiagnostic;}
  assert(expected);assert.deepEqual(sourceError(a,()=>a.invoke('deserialize-program',[text])),{message,code:expected.code,phase:expected.phase});a.release(text);
 }
 finish(a);
});
test('the complete lower module consumes actual reader syntax trees through real imports and produces the exact JS oracle IR text',async()=>{
 const reader=await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href),lower=await import(pathToFileURL(resolve(directory,'bootstrap/lower.mjs')).href);
 const entry=backend.compiler.compile_ir_string('(import "./lower.mjs" lower-module) (import "./ir.mjs" serialize-program) (defun run (source filename) (serialize-program (lower-module (JSON/parse source) filename))) (export run)','lower-entry.eli');
 const graph=[...modules,{id:'entry.mjs',program:entry}],saved=JSON.stringify(graph),bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(graph,'entry.mjs',runtime));
 assert.equal(JSON.stringify(graph),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:262144,maxBytes:16777216});a.auto(1);
 const corpus=['(defconst x 1)','(defconst negative-zero -0)','(defun f (x &optional y &rest tail) (if x (+ y 1) tail))','(defun f () (let* ((x 1) (y 2)) (loop ((n x)) (if n (recur nil) y))))','(defun f () (try (throw (js-array)) (catch {:strs [x] :or {x 7} :as all} (js-array x all)) (finally false)))','(defconst q (quote [中 value]))',
  '(import "./dep.mjs" x y) (defvar count 0) (defun f () (setq count (1+ count)) (js-call x :method count)) (export f count) (export-default y)',
  '(defun f ([x nil &rest tail] {:keys [a] :strs [b] :syms [c] :or {a 1} :as record}) (js-array x tail a b c record))',
  '(defun f (value) (progn (put value :x (new globalThis.Map)) (get value :x) (aref value "x") (js* "value")))',
  '(defun f (value) (try (throw value) (catch [x &rest rest] (try x (finally rest))) (finally nil)))',
  '(defconst values (js-array nil undefined false true -0.0 1.5)) (defconst text "\\ud800中😀\\udfff")'];
 let state=0x91a3cbd;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 for(let index=0;index<32;index++){let text='';for(let unit=0;unit<next()%16;unit++)text+=String.fromCharCode(next()%65536);corpus.push('(defconst generated-'+index+' '+JSON.stringify(text)+') (defun f (value) (if value '+(next()%1024)+' nil))');}
 for(const source of corpus){
  const filename='实际-lower.eli',forms=reader.read_string(source,filename),expected=helpers.serialize_program(lower.lower_module(forms,filename)),input=a.string(syntaxJSON(forms)),file=a.string(filename),out=a.invoke('run',[input,file]);
  assert.equal(a.readString(out),expected,source);
  for(const value of[input,file,out])a.release(value);
 }
 finish(a);
});

test('Object reflection observes actual own data descriptors, array length ordering, freezing and Symbol keys against independent JS',async()=>{
 const source=`
 (defun run ()
  (let ((object (js-object :b 2 "10" 10 "2" 2 :a 1)) (array (js-array 1 undefined)) (symbol (js-call (js* "Symbol") :for "ir-key")))
   (put array :extra 7) (put object symbol false)
   (js-array (JSON/stringify (Object/getOwnPropertyNames object))
    (JSON/stringify (Object/getOwnPropertyNames array))
    (JSON/stringify (Object/getOwnPropertyDescriptor object "a"))
    (JSON/stringify (Object/getOwnPropertyDescriptor array "length"))
    (JSON/stringify (Object/getOwnPropertyDescriptor "A😀" "1"))
    (JSON/stringify (Object/getOwnPropertyDescriptor (Object/freeze object) "a"))
    (Object/is (aref (Object/getOwnPropertyDescriptor object symbol) "value") false)
    (undefined? (Object/getOwnPropertyDescriptor object "missing")))))
 (defun extra-order () (let ((trace (js-object :n "")))
  (Object/getOwnPropertyDescriptor
   (progn (put trace :n (+ (aref trace "n") "r")) (js-object :x 1))
   (js-object :toString (lambda () (put trace :n (+ (aref trace "n") "k")) "x"))
   (put trace :n (+ (aref trace "n") "e"))) (aref trace "n")))
 (export run extra-order)`;
 const p=backend.compiler.compile_ir_string(source,'reflection.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64')),bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(bytes);a.auto(1);
 const out=a.invoke('run'),expected=js.run();assert.equal(a.length(out),expected.length);
 for(let i=0;i<expected.length;i++){const value=a.get(out,i);assert.equal(value?.kind===5?a.readString(value):value,expected[i]);a.release(value);}
 const effects=a.invoke('extra-order');assert.equal(a.readString(effects),js.extra_order());assert.equal(a.readString(effects),'rek');finish(a,[out,effects]);
});

test('materialized standard prototypes preserve inherited array holes and named data without turning them into own properties',async()=>{
 const source=`(defun run () (let ((prototype globalThis.Array.prototype) (root globalThis.Object.prototype) (value (js-array)))
  (put value :length 2) (put prototype "1" 7) (put prototype "__ir_array_data" 9) (put root "__ir_object_data" 11)
  (js-array (aref value "1") (aref value "__ir_array_data") (aref value "__ir_object_data")
   (Object/hasOwn value "1") (undefined? (Object/getOwnPropertyDescriptor value "1"))
   (JSON/stringify (Object/getOwnPropertyNames value))))) (export run)`;
 const p=backend.compiler.compile_ir_string(source,'prototype-inheritance.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 const properties=[[Array.prototype,'1'],[Array.prototype,'__ir_array_data'],[Object.prototype,'__ir_object_data']],saved=properties.map(([object,key])=>Object.getOwnPropertyDescriptor(object,key));let expected;
 try{expected=js.run();}finally{properties.forEach(([object,key],index)=>{if(saved[index])Object.defineProperty(object,key,saved[index]);else delete object[key];});}
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('run');
 for(let i=0;i<expected.length;i++){const value=a.get(out,i);assert.equal(value?.kind===5?a.readString(value):value?.kind===4?a.readNumber(value):value,expected[i]);a.release(value);}finish(a,[out]);
});

test('reflection aliases and shadowed ordinary methods preserve missing arguments, ignored extras and source evaluation order',async()=>{
 const source=`(defun run ()
  (let ((trace (js-object :n "")) (value (js-object :x 1)))
   (let ((names Object/getOwnPropertyNames) (descriptor Object/getOwnPropertyDescriptor)
         (Object (js-object :getPrototypeOf (lambda (x) (str "shadow:" x))
                           :getOwnPropertyNames (lambda (x) (js-array (str "own:" x)))
                           :getOwnPropertyDescriptor (lambda (x key) (str x ":" key)))))
    (js-array (JSON/stringify (funcall names value (put trace :n "e")))
      (aref (funcall descriptor value "x") "value")
      (Object/getPrototypeOf "p") (JSON/stringify (Object/getOwnPropertyNames "n"))
      (Object/getOwnPropertyDescriptor "d" "k")
      (try (funcall names) (catch error (aref error "name"))) (aref trace "n"))))) (export run)`;
 const p=backend.compiler.compile_ir_string(source,'reflection-calls.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('run'),expected=js.run();
 for(let i=0;i<expected.length;i++){const value=a.get(out,i);assert.equal(value?.kind===5?a.readString(value):value?.kind===4?a.readNumber(value):value,expected[i]);a.release(value);}finish(a,[out]);
});

test('the canonical Object prototype retains its immutable null parent and ordinary objects still permit a real prototype change',async()=>{
 const source=`(defun run () (let ((root globalThis.Object.prototype) (ordinary (js-object)) (parent (js-object "__proto__" nil :inherited 7)))
  (js-array (try (put root "__proto__" parent) "accepted" (catch error (aref error "name")))
   (nil? (Object/getPrototypeOf root)) (progn (put root "__proto__" nil) (nil? (Object/getPrototypeOf root)))
   (progn (put ordinary "__proto__" parent) (aref ordinary "inherited"))))) (export run)`;
 const p=backend.compiler.compile_ir_string(source,'immutable-prototype.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('run'),expected=js.run();
 for(let i=0;i<expected.length;i++){const value=a.get(out,i);assert.equal(value?.kind===5?a.readString(value):value?.kind===4?a.readNumber(value):value,expected[i]);a.release(value);}finish(a,[out]);
});

test('reflection raw ABI rejects malformed argument lists, stale handles and private frames without losing caller roots',()=>{
 const p=backend.compiler.compile_ir_string('(defun own (value key) (Object/getOwnPropertyDescriptor value key)) (export own)','reflection-abi.eli'),bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime));
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](256,32768,262144),args=e['value-refs'](h,7,2),target=e['value-object-new'](h,3),caller=e['frame-new'](h,2);
 e['frame-set'](h,caller,0,args);e['frame-set'](h,caller,1,target);e['value-set'](h,args,0,target);e['value-set'](h,args,1,3);
 const before=e['heap-live'](h);
 for(const [input,count,op,code]of[[0xffffffff,0,0,1],[caller,1,0,1],[args,3,0,3],[args,2,3,3]]){
  assert.equal(e['value-object-reflection'](h,input,count,op),0);assert.equal(e['last-error'](),code);assert.equal(e['frame-depth'](h),1);assert.equal(e['heap-live'](h),before);
 }
 assert.equal(e['value-standard-prototype-existing'](h,2),0);assert.equal(e['last-error'](),3);
 assert.equal(e['value-standard-prototype-existing'](0xffffffff,0),0);assert.equal(e['last-error'](),1);
 const stale=e['value-string'](h,0);e['heap-collect'](h);const offset=e['value-data'](h,args,7);
 new DataView(e.memory.buffer).setUint32(offset,stale,true);assert.equal(e['value-object-reflection'](h,args,2,0),0);assert.equal(e['last-error'](),1);assert.equal(e['frame-depth'](h),1);
 new DataView(e.memory.buffer).setUint32(offset,target,true);e['frame-pop'](h,caller);e['value-standard-prototypes-close'](h);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
});

test('whole IR allocation failure preserves caller roots and frames and a later canonical round trip succeeds',()=>{
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(modules[1].program,runtime)),a=instantiateManagedRuntime(bytes,{maxSlots:1024,initialBytes:262144,maxBytes:16777216});a.auto(1);
 const huge=helpers.serialize_program(backend.compiler.compile_ir_string(Array.from({length:96},(_,i)=>'(defconst value-'+i+' '+i+')').join('\n'),'capacity.eli'));
 const input=a.string(huge),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 assert.throws(()=>a.invoke('deserialize-program',[input]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.collect();
 const canonical=helpers.serialize_program(backend.compiler.compile_ir_string('','recovered.eli')),text=a.string(canonical),parsed=a.invoke('deserialize-program',[text]),out=a.invoke('serialize-program',[parsed]);assert.equal(a.readString(out),canonical);
 a.leaveFrame(caller);finish(a,[held,text,parsed,out]);
});

test('actual reflection traps escape source catch and unwind only the callee frames',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),first=source.indexOf('  (defun heap-reflection-label '),last=source.indexOf('  (defun heap-reflection-prototype ',first);assert(first>=0&&last>first);
 const injected=backend.compiler.compile_ir_string(source.slice(0,first)+'  (defun heap-reflection-label (heap label) (load-u32 4294967295))\n'+source.slice(last),'reflection-trap.eli');
 const p=backend.compiler.compile_ir_string('(defun run (value) (try (Object/getOwnPropertyDescriptor value "x") (catch error "swallowed"))) (defun recover () 7) (export run recover)','reflection-trap-entry.eli'),bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,injected)),a=instantiateManagedRuntime(bytes);a.auto(1);
 const seven=a.number(7),input=a.sourceObject({x:seven}),caller=a.frame(1);a.frameSet(caller,0,input);
 assert.throws(()=>a.invoke('run',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const value=a.invoke('recover');assert.equal(a.readNumber(value),7);a.release(value);a.leaveFrame(caller);finish(a,[input,seven]);
});

test('public Seed and three full compiler generations preserve JavaScript, maps and complete IR/lower WASM artifact bytes',async()=>{
 const files=(await readdir('bootstrap/compiler')).filter(name=>name.endsWith('.eli')).sort();assert.equal(files.length,13);
 const seedDirectory=resolve(directory,'public-seed');await mkdir(seedDirectory);
 for(const name of['ir','lower']){const file=resolve(seedDirectory,name+'.mjs'),seed=spawnSync(resolve('bin/eliscript-seed'),['--source-map','--output',file,resolve('bootstrap/compiler/'+name+'.eli')],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(file,'utf8'),await readFile(resolve(directory,'bootstrap',name+'.mjs'),'utf8'));}
 const expected=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'lower.mjs',runtime));let compiler=backend.compiler,previous;
 for(let generation=1;generation<=3;generation++){
  const stageRoot=resolve(directory,'generation-'+generation),output=resolve(stageRoot,'bootstrap');await mkdir(output,{recursive:true});const emitted=new Map();
  for(const file of files){const path=resolve('bootstrap/compiler',file),source=await readFile(path,'utf8'),generated=file.replace(/\.eli$/,'.mjs'),program=compiler.compile_ir_string(source,path),saved=JSON.stringify(program),result=compiler.emit_ir_string_with_source_map(program,source,generated,relative(resolve(directory,'fixed'),path));assert.equal(JSON.stringify(program),saved);const javascript=result.javascript+'//# sourceMappingURL='+generated+'.map\n';emitted.set(file,{javascript,map:result.sourceMap});if(previous)assert.deepEqual(emitted.get(file),previous.get(file),'generation '+generation+': '+file);await writeFile(resolve(output,generated),javascript);await writeFile(resolve(output,generated+'.map'),result.sourceMap);}
  previous=emitted;compiler=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);
  const stage=await buildBackends({outputRoot:stageRoot,frontend:compiler});assert.deepEqual(Uint8Array.from(stage.managed.emit_managed_project_wasm(modules,'lower.mjs',runtime)),expected,'zero-import artifact at generation '+generation);
 }
},60000);

test('independent Node executes the same entire IR and lower modules against its native JavaScript compiler modules',async()=>{
 const entry=backend.compiler.compile_ir_string('(import "./lower.mjs" lower-module) (import "./ir.mjs" serialize-program) (defun run (forms filename) (serialize-program (lower-module (JSON/parse forms) filename))) (export run)','node-lower-entry.eli');
 const irFile=resolve(directory,'whole-ir.wasm'),lowerFile=resolve(directory,'whole-lower.wasm');await writeFile(irFile,Uint8Array.from(backend.managed.emit_managed_wasm(modules[1].program,runtime)));await writeFile(lowerFile,Uint8Array.from(backend.managed.emit_managed_project_wasm([...modules,{id:'entry.mjs',program:entry}],'entry.mjs',runtime)));
 const script=["import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';",syntaxJSON.toString(),'const {instantiateManagedRuntime}=await import(process.argv[1]);const reader=await import(process.argv[2]),ir=await import(process.argv[3]),lower=await import(process.argv[4]);','const bytes=[readFileSync(process.argv[5]),readFileSync(process.argv[6])];for(const artifact of bytes)assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);','const [a,b]=bytes.map(artifact=>instantiateManagedRuntime(artifact,{maxSlots:8192,initialBytes:262144}));a.auto(1);b.auto(1);',
  'for(const source of '+JSON.stringify(['','(defconst x -0)','(defun f (x &rest tail) (if x tail nil))','(defconst text "😀\\ud800")','(defun f () (try (throw nil) (catch {:strs [x] :or {x 1}} x) (finally false)))'])+') {const filename="node真实.eli",forms=reader.read_string(source,filename),expected=ir.serialize_program(lower.lower_module(forms,filename)),input=a.string(expected),parsed=a.invoke("deserialize-program",[input]),out=a.invoke("serialize-program",[parsed]);assert.equal(a.readString(out),expected);for(const value of[input,parsed,out])a.release(value);const ast=b.string(syntaxJSON(forms)),file=b.string(filename),lowered=b.invoke("run",[ast,file]);assert.equal(b.readString(lowered),expected);for(const value of[ast,file,lowered])b.release(value);}',
  'for(const input of ["{","[1,]","undefined"]){let expected;try{ir.deserialize_program(input);}catch(error){expected=error;}assert.equal(expected.message,"invalid canonical IR JSON");assert(expected.cause instanceof SyntaxError);const text=a.string(input),owned=[text];let actual;try{a.invoke("deserialize-program",[text]);assert.fail("expected schema error");}catch(error){actual=error;owned.push(error);}const get=(object,key)=>{const name=a.string(key);try{const value=a.objectGet(object,name);owned.push(value);return value;}finally{a.release(name);}};const diagnostic=get(actual,"eliscriptDiagnostic"),cause=get(actual,"cause");assert.equal(a.readString(get(actual,"message")),expected.message);assert.equal(a.readString(get(diagnostic,"message")),expected.message);assert.equal(a.readString(get(diagnostic,"code")),expected.eliscriptDiagnostic.code);assert.equal(a.readString(get(cause,"name")),expected.cause.name);for(const value of owned)a.release(value);}',
  'for(const runtime of[a,b]){runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}'
 ].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,...['reader','ir','lower'].map(name=>pathToFileURL(resolve(directory,'bootstrap',name+'.mjs')).href),irFile,lowerFile],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},60000);

test('actual Array prototype callbacks participate in inherited conversion, sorting and Symbol iterator lookup',async()=>{
 const source=`(defun run () (let ((prototype globalThis.Array.prototype))
  (put prototype "join" (lambda () "joined"))
  (let ((joined (funcall (js* "String") (js-array 1 2))))
   (put prototype "toString" (lambda () "text"))
   (let ((text (funcall (js* "String") (js-array 1))))
    (put prototype (js* "Symbol.toPrimitive") (lambda (hint) (str "hint:" hint)))
    (let ((primitive (funcall (js* "String") (js-array))))
     (put prototype "sort" (lambda () "sorted"))
     (let ((sorted (js-call (js-array 2 1) :sort)))
      (put prototype (js* "Symbol.iterator") (lambda () (let ((count 0)) (js-object :next (lambda () (if (= count 0) (progn (setq count 1) (js-object :done false :value 7)) (js-object :done t)))))))
      (str joined "/" text "/" primitive "/" sorted "/" (JSON/stringify (Array/from (js-array 1 2)))))))))) (export run)`;
 const p=backend.compiler.compile_ir_string(source,'prototype-protocols.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 const keys=['join','toString',Symbol.toPrimitive,'sort',Symbol.iterator],saved=keys.map(key=>Object.getOwnPropertyDescriptor(Array.prototype,key));let expected;
 try{expected=js.run();}finally{keys.forEach((key,i)=>{if(saved[i])Object.defineProperty(Array.prototype,key,saved[i]);else delete Array.prototype[key];});}
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('run');assert.equal(a.readString(out),expected);finish(a,[out]);
});


test('the whole lower module preserves actual invalid-binding errors and recovers without retaining failed syntax trees',async()=>{
 const reader=await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href),lower=await import(pathToFileURL(resolve(directory,'bootstrap/lower.mjs')).href);
 const entry=backend.compiler.compile_ir_string('(import "./lower.mjs" lower-module) (import "./ir.mjs" serialize-program) (defun run (forms filename) (serialize-program (lower-module (JSON/parse forms) filename))) (export run)','lower-negative-entry.eli');
 const bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm([...modules,{id:'entry.mjs',program:entry}],'entry.mjs',runtime)),a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:262144});a.auto(1);
 const filename='invalid-binding.eli',file=a.string(filename),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 for(const source of['(defun f ([1]) nil)','(defun f ([x :as all]) all)','(defun f () (let (([1] (js-array 2))) nil))']){
  const forms=reader.read_string(source,filename),input=a.string(syntaxJSON(forms));let expected;try{lower.lower_module(forms,filename);}catch(error){expected=error;}assert(expected instanceof Error,source);
  let thrown;try{a.invoke('run',[input,file]);assert.fail('expected lower error');}catch(error){thrown=error;assert.equal(thrown.kind,13);}
  const messageKey=a.string('message'),message=a.objectGet(thrown,messageKey),nameKey=a.string('name'),name=a.objectGet(thrown,nameKey);
  assert.equal(a.readString(message),expected.message);assert.equal(a.readString(name),expected.name);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  for(const value of[input,thrown,messageKey,message,nameKey,name])a.release(value);a.collect();
 }
 const forms=reader.read_string('(defconst recovered 7)',filename),input=a.string(syntaxJSON(forms)),out=a.invoke('run',[input,file]);assert.equal(a.readString(out),helpers.serialize_program(lower.lower_module(forms,filename)));a.leaveFrame(caller);finish(a,[file,held,input,out]);
});
