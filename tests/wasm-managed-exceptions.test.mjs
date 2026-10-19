import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime,program,bytes,reference;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-exceptions-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-exceptions.eli','utf8'),'exceptions.eli');reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function instance(){bytes??=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);return a;}
const box=(a,v)=>typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;
const read=(a,v)=>v?.kind===4?a.readNumber(v):v?.kind===5?a.readString(v):v;
function finish(a,values=[]){for(const v of values)a.release(v);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function items(a,value){return Array.from({length:a.length(value)},(_,i)=>{const v=a.get(value,i);try{return read(a,v);}finally{a.release(v);}});}
test('throw catch and finally lower to zero-import WASM and distinguish every primitive including null false and undefined',()=>{
 const a=instance();for(const value of[null,false,true,undefined,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'','😀\ud800']){const input=box(a,value);for(const name of['caught','indirect','handler-throw']){const out=a.invoke(name,name==='handler-throw'?[null,input]:[input]);assert.deepEqual(read(a,out),reference[name.replaceAll('-','_')](...(name==='handler-throw'?[null,value]:[value])));a.release(out);}a.release(input);}finish(a);
});
test('finally preserves successful values, runs once through nested propagation and replaces pending throws only when it throws',()=>{
 const a=instance(),first=a.string('first'),second=a.string('second');for(const name of['normal','nested']){const trace=a.sourceArray([]),expected=[];const out=a.invoke(name,[first,trace]);assert.equal(read(a,out),reference[name]('first',expected));assert.deepEqual(items(a,trace),expected);a.release(out);a.release(trace);}const trace=a.sourceArray([]);let caught;try{a.invoke('replaced',[first,second,trace]);}catch(error){caught=error;}assert(caught&&typeof caught==='object');assert(a.keyEqual(caught,second));assert.deepEqual(items(a,trace),['first','finally']);finish(a,[first,second,trace,caught]);
});
test('cross-function recursion, shadowing and captured catch bindings retain exact source identity through collecting GC',()=>{
 const a=instance(),value=a.sourceObject({}),depth=a.number(12);for(const name of['caught','indirect','across']){const out=a.invoke(name,name==='across'?[depth,value]:[value]);assert(a.keyEqual(out,value));a.release(out);}const pair=a.invoke('shadow',[value]),caught=a.get(pair,0),outer=a.get(pair,1);assert(a.keyEqual(caught,value));assert.equal(a.readNumber(outer),7);const closure=a.invoke('handler-closure',[value]);a.collect();const retained=a.invoke('call-handler',[closure]);assert(a.keyEqual(retained,value));finish(a,[value,depth,pair,caught,outer,closure,retained]);
});

test('source Error TypeError RangeError and SyntaxError retain real prototype names, nonenumerable messages and optional cause',async()=>{
 const source=`(defconst marker 1)
 (defun make (kind message options) (cond ((= kind 0) (new (js* "Error") message options)) ((= kind 1) (new (js* "TypeError") message options)) ((= kind 2) (new (js* "RangeError") message options)) (t (new (js* "SyntaxError") message options))))
 (defun describe (error) (js-array (aref error "name") (aref error "message") (Object/hasOwn error "name") (Object/hasOwn error "message") (Object/hasOwn error "cause") (Object/keys error)))
 (export make describe)`;
 const p=b.compiler.compile_ir_string(source,'source-errors.eli'),artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);const a=instantiateManagedRuntime(artifact);a.auto(1);
 for(let kind=0;kind<4;kind++)for(const message of[undefined,null,false,0,-0,NaN,'','中😀\ud800']){const k=a.number(kind),m=box(a,message),cause=a.sourceObject({}),options=a.sourceObject({cause}),out=a.invoke('make',[k,m,options]),description=a.invoke('describe',[out]);const expected=new[Error,TypeError,RangeError,SyntaxError][kind](message,{cause:{}});const fields=[];for(let i=0;i<5;i++){const value=a.get(description,i);fields.push(read(a,value));a.release(value);}const keys=a.get(description,5);assert.deepEqual(fields,[expected.name,expected.message,Object.hasOwn(expected,'name'),Object.hasOwn(expected,'message'),Object.hasOwn(expected,'cause')]);assert.deepEqual(items(a,keys),Object.keys(expected));for(const v of[k,m,cause,options,out,description,keys])a.release(v);a.collect();}finish(a);
});

test('Error default string conversion uses inherited name then message and preserves user override order',()=>{
 const source=`(defconst marker 1)
 (defun run (name message) (let ((error (new (js* "TypeError") message))) (put error "name" name) (js-call (js-array error) :join ""))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'error-string.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const name of[undefined,null,false,0,'','Other'])for(const message of[undefined,null,false,0,'','中']){const n=box(a,name),m=box(a,message),out=a.invoke('run',[n,m]),expected=new TypeError(message);expected.name=name;assert.equal(read(a,out),String(expected));for(const v of[n,m,out])a.release(v);}finish(a);
});

test('runtime TypeError and RangeError enter source catches with retained WASM diagnostics and permit recovery',()=>{
 const source=`(defconst marker 1)
 (defun run (mode) (try (if mode (Math/round (js-object :valueOf (lambda () (js-object)) :toString (lambda () (js-object)))) (js-call 1 :toString 1)) (catch error (js-array (aref error "name") (aref error "message") (aref (aref error "eliscriptDiagnostic") "code"))) (finally 7))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'runtime-catch.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const [mode,name,code]of[[true,'TypeError','ELI-RT0003'],[false,'RangeError','ELI-RT0010'],[true,'TypeError','ELI-RT0003']]){const out=a.invoke('run',[mode]);assert.deepEqual(items(a,out),[name,code==='ELI-RT0010'?'invalid Number.toString radix':'managed argument or bounds error',code]);a.release(out);}finish(a);
});

test('catch lexical mutation, source validation and firstclass Error constructors match the existing JS emitter',async()=>{
 const source=`(defconst marker 1)
 (defun mutate (value) (try (throw value) (catch error (setq error 8) (lambda () error))))
 (defun call (fn) (funcall fn))
 (defun selected () (try (throw 3) (catch error error) (finally 1)))
 (defun error-alias (message) (let ((ctor (js* "TypeError"))) (let ((error (funcall ctor message))) (js-array (aref error "name") (aref error "message")))))
 (export mutate call selected error-alias)`;
 const p=b.compiler.compile_ir_string(source,'catch-bindings.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 const value=a.number(1),fn=a.invoke('mutate',[value]);a.collect();const out=a.invoke('call',[fn]);assert.equal(a.readNumber(out),js.call(js.mutate(1)));const selected=a.invoke('selected');assert.equal(a.readNumber(selected),js.selected());const text=a.string('x'),error=a.invoke('error-alias',[text]);assert.deepEqual(items(a,error),js.error_alias('x'));finish(a,[value,fn,out,selected,text,error]);assert.throws(()=>b.compiler.compile_ir_string('(defun f () (try 1 (catch a a) (catch b b)))','duplicate-catch.eli'),/at most one catch/);
});

test('pending source exceptions are heap roots and illegal raw handles remain numeric ABI failures',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,16384);assert(heap);e['heap-auto'](heap,1);
 const value=e['value-string'](heap,1);assert(value);e['value-unit-set'](heap,value,0,120);e['value-seal'](heap,value);e['value-throw'](heap,value);assert.equal(e['last-error'](),11);assert.equal(e['value-exception-pending'](heap),1);e['heap-collect'](heap);assert.equal(e['value-kind'](heap,value),5);assert.equal(e['value-throw'](heap,0xffffffff),0);assert.equal(e['last-error'](),1);assert.equal(e['value-exception-take'](heap),value);assert.equal(e['value-exception-pending'](heap),0);e['heap-collect'](heap);assert.equal(e['heap-live'](heap),0);assert.equal(e['value-exception-take'](heap),0);assert.equal(e['last-error'](),3);
});

test('capacity failures during Error creation preserve caller frames and recover after released source objects are collected',()=>{
 const source='(defconst marker 1) (defun make (message) (new (js* "Error") message)) (export make)',p=b.compiler.compile_ir_string(source,'error-capacity.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)),{maxSlots:64,initialBytes:4096,maxBytes:16384});a.auto(1);
 const message=a.string('x'),frame=a.frame(1);a.frameSet(frame,0,message);const retained=[];let failure;for(let i=0;i<100;i++){try{retained.push(a.invoke('make',[message]));}catch(error){failure=error;break;}}assert.equal(failure?.eliscriptDiagnostic?.code,'ELI-RT0002');assert.equal(a.stats().frameDepth,1);for(const error of retained)a.release(error);a.collect();const recovered=a.invoke('make',[message]),key=a.string('message'),text=a.objectGet(recovered,key);assert.equal(a.readString(text),'x');a.leaveFrame(frame);finish(a,[message,recovered,key,text]);
});

test('real WASM traps bypass catch and finally without being disguised as a source Error and unwind only dynamic frames',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-cell-get (heap cell)'),end=source.indexOf('  (defun value-cell-set',start);assert(start>=0&&end>start);
 const faulty=source.slice(0,start)+'  (defun value-cell-get (heap cell) (load-u32 4294967295))\n'+source.slice(end),r=b.compiler.compile_ir_string(faulty,'trap-exception-runtime.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(program,r)));a.auto(1);const value=a.number(4),callback=a.invoke('handler-closure',[value]),frame=a.frame(1);a.frameSet(frame,0,value);assert.throws(()=>a.invoke('call-handler',[callback]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const recovered=a.invoke('caught',[value]);assert(a.keyEqual(recovered,value));a.leaveFrame(frame);finish(a,[value,callback,recovered]);
});

test('runtime origin classification separates null reads, repeat ranges and JSON syntax while finally restores the original exception class',()=>{
 const source=`(defconst marker 1)
 (defun fail-one (mode) (cond ((= mode 0) (aref nil "x")) ((= mode 1) (js-call "x" :repeat -1)) (t (JSON/parse "{"))))
 (defun run (mode) (try (try (fail-one mode) (finally (try (Math/round (js-object :valueOf (lambda () (js-object)) :toString (lambda () (js-object)))) (catch ignored 0)))) (catch error (js-array (aref error "name") (aref (aref error "eliscriptDiagnostic") "code"))))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'runtime-origin.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const [mode,name,code]of[[0,'TypeError','ELI-RT0001'],[1,'RangeError','ELI-RT0003'],[2,'SyntaxError','ELI-RT0003'],[1,'RangeError','ELI-RT0003']]){const m=a.number(mode),out=a.invoke('run',[m]);assert.deepEqual(items(a,out),[name,code]);a.release(m);a.release(out);}finish(a);
});

test('uncaught primitives cross the adapter exactly and failed module evaluation rethrows its original source value per instance until close',()=>{
 const a=instance();for(const value of[null,undefined,false,true,0,-0,NaN,'x']){const input=box(a,value);let seen=false,actual;try{a.invoke('uncaught',[input]);}catch(error){seen=true;actual=error;}assert(seen);assert.deepEqual(read(a,actual),value);a.release(actual);a.release(input);}finish(a);
 for(const value of['nil','undefined','false','(new (js* "TypeError") "init")']){const p=b.compiler.compile_ir_string('(defconst fail (throw '+value+')) (export fail)','module-throw.eli'),artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(artifact,{initializeModule:false});a.auto(1);const seen=[];for(let i=0;i<2;i++){try{a.initializeModule();assert.fail('initializer must throw');}catch(error){seen.push(error);}a.collect();assert.equal(a.stats().frameDepth,0);}if(value.startsWith('(new')){assert(a.keyEqual(seen[0],seen[1]));const key=a.string('message'),text=a.objectGet(seen[0],key);assert.equal(a.readString(text),'init');a.release(key);a.release(text);}else assert.deepEqual(seen,[value==='nil'?null:value==='undefined'?undefined:false,value==='nil'?null:value==='undefined'?undefined:false]);finish(a,seen);}
});

test('unrepresented generated Error stacks remain unsupported while explicit stack data preserves JavaScript descriptors and write restrictions',async()=>{
 const source=`(defconst marker 1)
  (defun read-stack (error) (aref error "stack"))
  (defun has-stack (error) (Object/hasOwn error "stack"))
  (defun describe-stack (error) (Object/getOwnPropertyDescriptor error "stack"))
  (defun define-default-stack (error) (Object/defineProperty error "stack" (js-object :value 9)))
  (defun set-stack (error) (put error "stack" 9))
  (defun make () (new (js* "Error") "x"))
  (defun custom-stack (value mode)
   (let ((error (new globalThis/TypeError "explicit stack")) (outcome "unchanged"))
    (put error :stack value)
    (cond ((= mode 1) (Object/defineProperty error "stack" (js-object :writable false)))
          ((= mode 2) (Object/freeze error)))
    (unless (= mode 0)
     (setq outcome (try (put error :stack "replacement") "written" (catch failure (get failure :name)))))
    (let ((descriptor (Object/getOwnPropertyDescriptor error "stack")))
     (JSON/stringify (js-array (Object/is (aref error "stack") value) (Object/hasOwn error "stack")
      (Object/is (get descriptor :value) value) (get descriptor :writable)
      (get descriptor :enumerable) (get descriptor :configurable) outcome)))))
  (defun receiver-stack-setter (written)
   (let ((receiver (js* "this")))
    (put receiver :calls (1+ (get receiver :calls))) (put receiver :seen written)))
  (defun receiver-stack (mode value)
   (let* ((error (new globalThis/TypeError "receiver stack"))
          (receiver (js-object :seen "before" :calls 0)) (prototype (js-object)))
    (put error :stack "target")
    (cond
     ((= mode 1)
      (Reflect/deleteProperty error "stack")
      (Object/defineProperty prototype "stack" (js-object
       :set receiver-stack-setter :configurable t))
      (Object/setPrototypeOf error prototype))
     ((= mode 2)
      (Reflect/deleteProperty error "stack")
      (Object/defineProperty prototype "stack" (js-object :value "locked" :writable false :configurable t))
      (Object/setPrototypeOf error prototype))
     ((= mode 3) (Object/freeze receiver)))
    (let* ((outcome (Reflect/set error "stack" value receiver))
           (descriptor (Object/getOwnPropertyDescriptor receiver "stack")))
     (JSON/stringify (js-array outcome (get receiver :calls)
      (Object/hasOwn error "stack") (Object/hasOwn receiver "stack")
      (Object/is (get error :stack) "target") (Object/is (get error :stack) "locked")
      (Object/is (get receiver :seen) value) (Object/is (get receiver :stack) value)
      (if descriptor (js-array (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)) nil))))))
  (export read-stack has-stack describe-stack define-default-stack set-stack make custom-stack receiver-stack)`;
 const p=b.compiler.compile_ir_string(source,'error-stack-boundary.eli');
 const js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
 const artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const a=instantiateManagedRuntime(artifact);a.auto(1);const error=a.invoke('make'),object=a.sourceObject({stack:true});
 try{
  // A fresh managed Error has no represented engine-generated stack. These
  // negative profile checks do not claim equivalence with the host's stack.
  for(const name of['read-stack','has-stack','describe-stack','define-default-stack'])assert.throws(()=>a.invoke(name,[error]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
  for(const target of[error,object]){
   if(target===object){assert.equal(a.invoke('read-stack',[target]),true);assert.equal(a.invoke('has-stack',[target]),true);}
   const written=a.invoke('set-stack',[target]);try{assert.equal(a.readNumber(written),9);}finally{a.release(written);}
   const actual=a.invoke('read-stack',[target]);try{assert.equal(a.readNumber(actual),9);}finally{a.release(actual);}
   assert.equal(a.invoke('has-stack',[target]),true);
  }
  for(const value of['TypeError: supplied\n    at original.eli:3:7',-0,undefined,false])for(const mode of[0,1,2]){
   const input=box(a,value),option=a.number(mode);let out;
   try{
    const expected=JSON.parse(js.custom_stack(value,mode));
    assert.deepEqual(expected,[true,true,true,mode===0,false,mode!==2,mode===0?'unchanged':'TypeError']);
    out=a.invoke('custom-stack',[input,option]);assert.deepEqual(JSON.parse(a.readString(out)),expected);
   }finally{a.release(out);a.release(option);a.release(input);}
   a.collect();assert.equal(a.stats().frameDepth,0);
  }
  const receiverExpected=[
   [true,0,true,true,true,false,false,true,[true,true,true]],
   [true,1,false,false,false,false,true,false,null],
   [false,0,false,false,false,true,false,false,null],
   [false,0,true,false,true,false,false,false,null],
  ];
  for(const value of['explicit receiver stack',-0])for(let mode=0;mode<receiverExpected.length;mode++){
   const input=box(a,value),option=a.number(mode);let out;
   try{
    const expected=JSON.parse(js.receiver_stack(mode,value));assert.deepEqual(expected,receiverExpected[mode]);
    out=a.invoke('receiver-stack',[option,input]);assert.deepEqual(JSON.parse(a.readString(out)),expected);
   }finally{a.release(out);a.release(option);a.release(input);}
   a.collect();assert.equal(a.stats().frameDepth,0);
  }
 }finally{finish(a,[error,object]);}
});

test('cold Error realm dynamic lookups calls overrides and explicit prototypes match JavaScript reflection and recover after GC',async()=>{
 const source=`(defconst marker 1)
  (defun property (object key) (get object key))
  (defun invoke-method (object key arguments)
   (let ((method (property object key))) (js-call method :apply object arguments)))
  (defun own-render (&rest ignored) "own")
  (defun prototype-render (&rest ignored) "prototype")
  (defun cold-lookup ()
   (let* ((error (new (js* "Error") "message"))
          (constructor (property error "constructor"))
          (to-string (property error "toString"))
          (own (property error "hasOwnProperty"))
          (enumerable (property error "propertyIsEnumerable"))
          (prototype (Object/getPrototypeOf error))
          (called (js-call constructor :call nil "called"))
          (applied (js-call constructor :apply nil (js-array "applied")))
          (bound (js-call constructor :bind nil "bound")) (bound-error (funcall bound)))
    (JSON/stringify (js-array
     (Object/is constructor (js* "Error")) (Object/is prototype (get constructor :prototype))
     (Object/is (property prototype "constructor") constructor)
     (Object/is to-string (property prototype "toString"))
     (Object/is own (get globalThis.Object.prototype :hasOwnProperty))
     (Object/is enumerable (get globalThis.Object.prototype :propertyIsEnumerable))
     (invoke-method error "toString" (js-array))
     (js-call own :call error "message") (js-call enumerable :call error "message")
     (get called :message) (get applied :message) (get bound-error :message)
     (Object/is constructor (property error "constructor"))))))
  (defun overwrite ()
   (let* ((error (new (js* "Error") "message")) (prototype (Object/getPrototypeOf error))
          (original-method (property prototype "toString"))
          (original-constructor (property prototype "constructor")))
    (try
     (put prototype :toString prototype-render)
     (let ((inherited (invoke-method error "toString" (js-array))))
      (put error :toString own-render)
      (let ((own (invoke-method error "toString" (js-array))))
       (Reflect/deleteProperty error "toString") (put prototype :constructor false)
       (JSON/stringify (js-array inherited own
        (invoke-method error "toString" (js-array)) (property error "constructor")
        (Object/hasOwn error "toString")))))
     (finally (put prototype :toString original-method) (put prototype :constructor original-constructor)))))
  (defun getter-order ()
   (let ((error (new (js* "Error") "message")) (trace (js-array)))
    (Object/defineProperty error "toString" (js-object :configurable t
     :get (lambda () (js-call trace :push "getter") own-render)))
    (let* ((method (property error "toString"))
           (result (js-call method :call error (progn (js-call trace :push "argument") 7))))
     (JSON/stringify (js-array result trace)))))
  (defun explicit-prototypes ()
   (let ((error (new (js* "Error") "message")) (custom (js-object :constructor false :toString own-render)))
    (Object/setPrototypeOf error nil)
    (let ((empty (js-array (Object/is (Object/getPrototypeOf error) nil)
                  (Object/is (property error "constructor") undefined)
                  (Object/is (property error "toString") undefined))))
     (Object/setPrototypeOf error custom)
     (JSON/stringify (js-array empty (Object/is (Object/getPrototypeOf error) custom)
      (property error "constructor") (invoke-method error "toString" (js-array))
      (Object/is (Object/getPrototypeOf error) custom))))))
  (defun reflection ()
   (let* ((error (new (js* "Error") "message"))
          (constructor (property error "constructor")) (prototype (Object/getPrototypeOf error))
          (descriptor (Object/getOwnPropertyDescriptor prototype "toString"))
          (reflected (Reflect/getOwnPropertyDescriptor prototype "toString")))
    (JSON/stringify (js-array
     (Object/is (Reflect/getPrototypeOf error) prototype)
     (Object/is (Reflect/get error "constructor") constructor)
     (Reflect/has error "toString") (Object/hasOwn error "constructor")
     (invoke-method error "hasOwnProperty" (js-array "message"))
     (invoke-method error "propertyIsEnumerable" (js-array "message"))
     (Object/is (get descriptor :value) (property error "toString"))
     (Object/is (get reflected :value) (get descriptor :value))
     (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)
     (get reflected :writable) (get reflected :enumerable) (get reflected :configurable)))))
  (defun recover (value) (+ value marker))
  (export cold-lookup overwrite getter-order explicit-prototypes reflection recover)`;
 const p=b.compiler.compile_ir_string(source,'cold-error-realm.eli');
 const js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
 const artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const observations=[
  ['cold-lookup',[true,true,true,true,true,true,'Error: message',true,false,'called','applied','bound',true]],
  ['overwrite',['prototype','own','prototype',false,false]],
  ['getter-order',['own',['getter','argument']]],
  ['explicit-prototypes',[[true,true,true],true,false,'own',true]],
  ['reflection',[true,true,true,false,true,false,true,true,true,false,true,true,false,true]],
 ];
 for(const [name,expected]of observations){
  const a=instantiateManagedRuntime(artifact);a.auto(1);const keep=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,keep);
  try{
   for(let index=0;index<2;index++){
    const oracle=JSON.parse(js[name.replaceAll('-','_')]());assert.deepEqual(oracle,expected);
    const out=a.invoke(name);try{assert.deepEqual(JSON.parse(a.readString(out)),oracle);}finally{a.release(out);}
    a.collect();assert.equal(a.stats().frameDepth,1);
    const held=a.frameGet(caller,0);try{assert(Object.is(a.readNumber(held),-0));}finally{a.release(held);}
    const input=a.number(7),recovered=a.invoke('recover',[input]);
    try{assert.equal(a.readNumber(recovered),js.recover(7));}finally{a.release(recovered);a.release(input);}
   }
  }finally{a.leaveFrame(caller);finish(a,[keep]);}
 }
},30000);

let generationEvidence;
function generations(){return generationEvidence??=buildGenerations();}
async function buildGenerations(){
 const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort(),all=[b];let previous=b;
 for(const generation of[2,3]){
  const output=resolve(directory,'g'+generation),bootstrap=resolve(output,'bootstrap');await mkdir(bootstrap,{recursive:true});
  for(const file of files){const path=resolve('bootstrap/compiler',file),name=file.replace(/\.eli$/,'.mjs'),source=await readFile(path,'utf8'),emission=previous.compiler.compile_string_with_source_map(source,path,name,relative(bootstrap,path));await writeFile(resolve(bootstrap,name),emission.javascript+'//# sourceMappingURL='+name+'.map\n');await writeFile(resolve(bootstrap,name+'.map'),emission.sourceMap);}
  const current=await buildBackends({outputRoot:output,frontend:previous.compiler});current.compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);all.push(current);previous=current;
 }
 const filename=resolve('tests/fixtures/wasm-managed-exceptions.eli'),source=await readFile(filename,'utf8'),seedFile=resolve(directory,'exceptions-seed.mjs'),seed=spawnSync(resolve('bin/eliscript-seed'),['--output',seedFile,filename],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);const javascript=await readFile(seedFile,'utf8'),outputs=[];
 for(const current of all){const p=current.compiler.compile_ir_string(source,filename),r=current.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');assert.equal(current.compiler.emit_ir_string(p),javascript);outputs.push(Uint8Array.from(current.managed.emit_managed_wasm(p,r)));}
 for(const file of files){const path=resolve('bootstrap/compiler',file),source=await readFile(path,'utf8'),expected=all[0].compiler.compile_string(source,path);for(const current of all.slice(1))assert.equal(current.compiler.compile_string(source,path),expected);}
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[1],outputs[2]);
 const seeded=await buildBackends({outputRoot:resolve(directory,'seed-backends'),seed:true}),seedRuntime=seeded.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli'),seedProgram=seeded.compiler.compile_ir_string(source,filename);assert.deepEqual(Uint8Array.from(seeded.managed.emit_managed_wasm(seedProgram,seedRuntime)),outputs[0]);
 return {bytes:outputs[2],javascript};
}
test('Seed and complete three-generation frontend and backend artifacts preserve exception IR and zero-import WASM bytes',async()=>{
 const evidence=await generations(),a=instantiateManagedRuntime(evidence.bytes);a.auto(1);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(evidence.bytes)),[]);const text=a.string('seed'),trace=a.sourceArray([]),out=a.invoke('nested',[text,trace]);assert(a.keyEqual(out,text));assert.deepEqual(items(a,trace),['inner','catch','outer']);for(let i=0;i<4;i++){const kind=a.number(i),error=a.invoke('make-error',[kind,text,undefined]),description=a.invoke('error-summary',[error]);assert.deepEqual(items(a,description),[['Error','TypeError','RangeError','SyntaxError'][i],'seed',false,true,false]);for(const value of[kind,error,description])a.release(value);}finish(a,[text,trace,out]);
},120000);
test('Node executes the exact Seed and three-generation zero-import artifact with source exceptions and Error identity',async()=>{
 const evidence=await generations(),path=resolve(directory,'exceptions.wasm');await writeFile(path,evidence.bytes);
 const script=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {instantiateManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href)};const bytes=await readFile(process.argv[1]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);for(const value of[null,undefined,false,true]){assert.equal(a.invoke('caught',[value]),value);let entered=false;try{a.invoke('uncaught',[value]);}catch(error){entered=true;assert.equal(error,value);}assert(entered);}const message=a.string('node'),kind=a.number(1),error=a.invoke('make-error',[kind,message,undefined]),out=a.invoke('caught',[error]);assert(a.keyEqual(error,out));const summary=a.invoke('error-summary',[out]),name=a.get(summary,0),text=a.get(summary,1);assert.equal(a.readString(name),'TypeError');assert.equal(a.readString(text),'node');for(const value of[message,kind,error,out,summary,name,text])a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`;
 const result=spawnSync('node',['--input-type=module','-e',script,path],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
},120000);
