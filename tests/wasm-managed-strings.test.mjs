import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';import {inspect} from 'node:util';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-strings-'));backend=await buildBackends({outputRoot:directory});
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),moduleEnd=source.lastIndexOf(')');assert(moduleEnd>=0);
 // Only this test's compiled copy exposes the two private borrow helpers. Keep
 // the production export surface unchanged and avoid unrelated realm bootstrap.
 const testSource=source.slice(0,moduleEnd)+'\n  (export heap-borrow-root heap-return-root)\n'+source.slice(moduleEnd);
 runtimeProgram=backend.compiler.compile_ir_string(testSource,'runtime.eli');program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-strings.eli','utf8'),'strings.eli');bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
const read=(a,x)=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):x.kind===5?a.readString(x):x:x;
function invoke(a,name,args){const v=a.invoke(name,args);try{return read(a,v);}finally{a.release(v);}}
function check(a,name,inputs){const args=inputs.map(x=>box(a,x));try{assert.deepEqual(invoke(a,name,args),js[name.replaceAll('-','_')](...inputs),name);}catch(error){error.message+='\n'+name+' '+inspect(inputs);throw error;}finally{args.forEach(x=>a.release(x));}a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
const positions=[null,false,true,undefined,NaN,Infinity,-Infinity,0,-0,.5,-.5,1,-1,3.5,-3.5,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**32-1,2**32];
const texts=['','x','a\0b','中😀\ud800x\udfff','ababa','\ud83d\ude00','\ud83dx\ude00'];
test('ordinary UTF16 property and character access keeps code units, code points, signed positions and exact missing results under GC',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of texts){check(a,'size',[text]);for(const key of[0,-0,1,2,99,-1,.5,NaN,Infinity,'0','1','01','','length'])for(const name of['read-value','default-value'])check(a,name,name==='default-value'?[text,key,'fallback']:[text,key]);
  for(const position of positions)for(const name of['at','char-at','char-code','code-point'])check(a,name,[text,position]);for(const key of['0','1','length'])check(a,'nth-value',[key,text]);check(a,'scan',[text]);}
});
test('source slice, substring and substr preserve each conversion rule and endpoints without code-point normalization',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of texts)for(const lo of positions)for(const hi of positions)for(const name of['slice','substring','substr'])check(a,name,[text,lo,hi]);
});
test('forward and reverse source searches preserve empty needles, overlapping matches, NaN defaults and primitive string conversions',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of texts)for(const needle of['','x','a','aba','\0','😀','\ud800',null,false,true,undefined,0,-0,-1,NaN,Infinity,-Infinity])for(const p of positions)for(const name of['find','last','includes','starts','ends'])check(a,name,[text,needle,p]);
});
test('String repeat, trim, well-formed repair, identities and variadic concat retain exact primitive text and lone surrogates',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of texts){for(const name of['identity','value','well-formed','repair','trim','trim-start','trim-end'])check(a,name,[text]);for(const count of[null,false,true,undefined,NaN,-0,-.5,0,.5,1,3.5])check(a,'repeat',[text,count]);for(const value of[null,false,true,undefined,0,-0,2**32-1,-1,NaN,Infinity,-Infinity,'中😀'])check(a,'concat',[text,value,'!',value]);}
 const whitespace='\u0009\u000a\u000b\u000c\u000d \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';for(const text of[whitespace,whitespace+'x'+whitespace,'\u0085x\u0085','\u180ex\u180e','😀'])for(const name of['trim','trim-start','trim-end'])check(a,name,[text]);for(const count of[-1,-1.5,-Infinity,Infinity]){const s=a.string('x'),n=a.number(count);assert.throws(()=>a.invoke('repeat',[s,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(s);a.release(n);}check(a,'repeat',['',Number.MAX_VALUE]);
});
test('raw text queries reject unfinished string keys and protect borrowed receiver, positions and results across allocating GC',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,65536),call=(name,...args)=>{const out=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const string=(text,sealed=true)=>{const h=call('value-string',text.length),view=new DataView(e.memory.buffer),p=call('value-data',h,5);for(let i=0;i<text.length;i++)view.setUint16(p+i*2,text.charCodeAt(i),true);if(sealed)call('value-seal',h);return h;};
 const s=string('中😀'),key=string('0',false);e['value-text-get'](heap,s,key,0);assert.equal(e['last-error'](),6);call('value-seal',key);call('heap-auto',1);const first=call('value-text-get',s,key,0);call('heap-pin',s);call('heap-pin',key);call('heap-pin',first);assert.equal(new DataView(e.memory.buffer).getUint16(call('value-data',first,5),true),'中'.charCodeAt(0));
 const p=call('value-number',0,0x3ff00000),out=call('value-source-text-method',s,p,3,3);call('heap-pin',out);assert.equal(new DataView(e.memory.buffer).getFloat64(call('value-data',out,4),true),0x1f600);for(const h of[s,key,first,out])call('heap-release',h);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});
test('text calls capture receiver and earlier arguments, evaluate ignored extras and preserve lazy defaults before method conversions',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);check(a,'capture',['abcdef',1,'xy']);check(a,'concat-capture',['base','old','new']);
 const s=a.string('中😀'),trace=a.sourceObject({});assert.equal(invoke(a,'ignored',[s,trace]),'中');for(const [name,expected]of[['first',1],['second',2]]){const key=a.string(name),value=a.objectGet(trace,key);assert.equal(a.readNumber(value),expected);a.release(value);a.release(key);}a.release(trace);a.release(s);a.collect();assert.equal(a.live(),0);
 for(const text of texts)for(const key of[0,1,99,'0','length'])check(a,'default-order',[text,key]);
});
test('source text boundaries are immutable, source-bound unsupported calls and malformed arity are refused, and invalid handles stay branded',async()=>{
 const before=JSON.stringify(program);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);
 for(const expression of['(js-call s :toLowerCase)','(js-call s :split "x")']){const ir=backend.compiler.compile_ir_string(`(defun f (s) ${expression}) (export f)`,'supported-text.eli'),saved=JSON.stringify(ir),bytes=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));assert(WebAssembly.validate(bytes));assert.equal(JSON.stringify(ir),saved);}
 // General member invocation now preserves dead branches instead of rejecting
 // a property spelling everywhere, including methods on user-defined objects.
 const formerlyRejected=['(js-call s method)','(js-call s :toLocaleLowerCase)','(js-call s :normalize)','(js-call s :matchAll "x")','(js-call s :match "x")'];
 const deadSource=formerlyRejected.map((expression,index)=>`(defun dead${index} (s method) (if false ${expression} s))`).join('\n')+`
 (defun dynamic (s method argument) (js-call s method argument))
 (defun matched (s) (let ((found (js-call s :match "x"))) (if found (get found 0) nil)))
 (defun matched-all (s) (let* ((iterator (js-call s :matchAll "x")) (step (js-call iterator :next)))
  (if (get step :done) nil (get (get step :value) 0))))
 (defun dynamic-matched (s) (let* ((method "match") (found (js-call s method "x"))) (if found (get found 0) nil)))
 (defun dynamic-matched-all (s) (let* ((method "matchAll") (iterator (js-call s method "x")) (step (js-call iterator :next)))
  (if (get step :done) nil (get (get step :value) 0))))
 (defun custom-matched (s) (let ((pattern (js-object)))
  (put pattern (js* "Symbol.match") (lambda (input) (js-array input)))
  (get (js-call s :match pattern) 0)))
 (defun custom-matched-all (s) (let ((pattern (js-object)))
  (put pattern (js* "Symbol.matchAll") (lambda (input)
   (js-object :next (lambda () (js-object :done false :value (js-array input))))))
  (get (get (js-call (js-call s :matchAll pattern) :next) :value) 0)))
 (defun protocol-fault () (let ((trace (js-array)) (marker (js-object)) (pattern (js-object)))
  (put pattern (js* "Symbol.match") (lambda (input) (js-call trace :push "method") (throw marker)))
  (try (js-call "text" :match (progn (js-call trace :push "argument") pattern))
   (catch error (JSON/stringify (js-array (= error marker) trace))))))
 (defun invalid-all () (let ((pattern (new (js* "RegExp") "x")))
  (try (js-call "abxx" :matchAll pattern) (catch error (get error :name)))))
 (defun normalized (s) (js-call s :normalize))
 (defun localized (s) (js-call s :toLocaleLowerCase))
 (defun custom () (let ((value (js-object :normalize (lambda () "custom-normalize") :toLocaleLowerCase (lambda () "custom-locale"))))
  (js-call (js-call value :normalize) :concat "/" (js-call value :toLocaleLowerCase))))
 (defun dynamic-order ()
  (let* ((trace (js-array)) (text "abcd")
         (key (js-object :toString (lambda () (js-call trace :push "key") "slice")))
         (result (js-call (progn (js-call trace :push "receiver") text)
           (progn (js-call trace :push "key-expression") key)
           (progn (js-call trace :push "first") (setq text "changed") 1)
           (progn (js-call trace :push "second") 3)
           (progn (js-call trace :push "extra") 99))))
   (JSON/stringify (js-array result trace))))
 (defun null-order ()
  (let* ((trace (js-array)) (key (js-object :toString (lambda () (js-call trace :push "coercion") "slice"))))
   (try (js-call nil (progn (js-call trace :push "key-expression") key) (js-call trace :push "argument"))
    (catch error (JSON/stringify (js-array (get error :name) trace))))))
 (defun prototype-order (throwing)
  (let* ((trace (js-array)) (prototype (get (js* "String") :prototype))
         (saved (Object/getOwnPropertyDescriptor prototype "slice")) (marker (js-object)) (method "slice"))
   (try
    (Object/defineProperty prototype "slice" (js-object :configurable t :get (lambda ()
     (js-call trace :push "get")
     (if throwing (throw marker) (lambda (argument) (js-call trace :push "old-call") (js-call "old:" :concat argument))))))
    (let ((result (try
      (js-call "abcd" method (progn (js-call trace :push "argument")
       (Object/defineProperty prototype "slice" (js-object :configurable t :value (lambda (argument) "new"))) "ARG"))
      (catch error (= error marker)))))
     (JSON/stringify (js-array result trace)))
    (finally (if saved (Object/defineProperty prototype "slice" saved) (Reflect/deleteProperty prototype "slice"))))))
 (defun native-capture-order ()
  (let* ((trace (js-array)) (prototype (get (js* "String") :prototype))
         (saved (Object/getOwnPropertyDescriptor prototype "slice")) (method "slice"))
   (try
    (let ((result (js-call "abcd" method (progn (js-call trace :push "argument")
      (Object/defineProperty prototype "slice" (js-object :configurable t :value (lambda (argument) "new"))) 1))))
     (JSON/stringify (js-array result trace)))
    (finally (if saved (Object/defineProperty prototype "slice" saved) (Reflect/deleteProperty prototype "slice"))))))
 (export dead0 dead1 dead2 dead3 dead4 dynamic matched matched-all dynamic-matched dynamic-matched-all
  custom-matched custom-matched-all normalized localized custom
  dynamic-order null-order prototype-order native-capture-order protocol-fault invalid-all)`;
 const deadIR=backend.compiler.compile_ir_string(deadSource,'dead-text.eli'),deadJS=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(deadIR)).toString('base64'));
 const deadBytes=Uint8Array.from(backend.managed.emit_managed_wasm(deadIR,runtimeProgram));
 const dead=instantiateManagedRuntime(deadBytes);
 dead.auto(1);
 const held=dead.string('unchanged'),method=dead.string('missing');
 const withCleanup=(body,steps)=>{
  let failed=false,failure,result;const cleanupErrors=[];
  try{result=body();}catch(error){failed=true;failure=error;}
  steps((label,operation)=>{
   try{operation();}catch(error){
    const cleanupError=new Error('string fixture cleanup: '+label,{cause:error});
    if(!failed){failed=true;failure=cleanupError;}
    else if(cleanupErrors.length<12)cleanupErrors.push(cleanupError);
   }
  });
  if(failed){
   if(cleanupErrors.length){
    const error=new Error((failure instanceof Error?failure.message:'string fixture failed')+'; subsequent cleanup also failed',{cause:failure});
    error.cleanupErrors=cleanupErrors;throw error;
   }
   throw failure;
  }
  return result;
 };
 const invokeWithCleanup=(runtime,name,args)=>{
  let value,returned=false;
  return withCleanup(()=>{value=runtime.invoke(name,args);returned=true;return read(runtime,value);},cleanup=>{
   if(returned)cleanup('result '+name,()=>runtime.release(value));
  });
 };
 withCleanup(()=>{
  for(let index=0;index<formerlyRejected.length;index++)assert.equal(invoke(dead,'dead'+index,[held,method]),deadJS['dead'+index]('unchanged','missing'));
  const activeCases=[['dynamic',['abcd','slice',1]],['dynamic',['中x','toUpperCase',0]],
   ['matched',['abxx']],['matched',['none']],['matched-all',['abxx']],['matched-all',['none']],['custom',[]],
   ['dynamic-order',[]],['null-order',[]],['prototype-order',[false]],['prototype-order',[true]],['native-capture-order',[]],
   ['dynamic-matched',['abxx']],['dynamic-matched',['none']],['dynamic-matched-all',['abxx']],['dynamic-matched-all',['none']],
   ['custom-matched',['中😀\ud800']],['custom-matched-all',['中😀\ud800']],['protocol-fault',[]],['invalid-all',[]]];
  const oracle=spawnSync('node',['--input-type=module','-e',
   "let input='';for await(const chunk of process.stdin)input+=chunk;const {javascript,cases}=JSON.parse(input);const m=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));process.stdout.write(JSON.stringify(cases.map(([name,args])=>m[name.replaceAll('-','_')](...args))));"],
   {input:JSON.stringify({javascript:backend.compiler.emit_ir_string(deadIR),cases:activeCases}),encoding:'utf8',timeout:30000});
  assert.equal(oracle.error,undefined);assert.equal(oracle.status,0,oracle.stderr);const expected=JSON.parse(oracle.stdout);
  for(const [index,[name,inputs]]of activeCases.entries()){
   const args=[];
   withCleanup(()=>{
    try{for(const input of inputs)args.push(box(dead,input));assert.deepEqual(invokeWithCleanup(dead,name,args),expected[index],name);}
    catch(error){
     let heapContext='stats unavailable';
     try{heapContext=JSON.stringify({stats:dead.stats(),auto:1,
      maxSlots:1024,initialBytes:65536,maxBytes:16777216});}catch{}
     throw new Error('active string case '+name+' '+inspect(inputs)+'; heap='+heapContext,{cause:error});
    }
   },cleanup=>{for(const[index,arg]of args.entries())cleanup('active '+name+' argument '+index,()=>dead.release(arg));});
  }
  // Keep the previously observed capacity boundary on the mutated/restored
  // realm. Refusing a request must not invalidate any independent caller root.
  let dirtyZero,dirtyFrame,dirtyCapacity;
  try{
   withCleanup(()=>{
    assert.equal(dead.readString(held),'unchanged','held string before dirty manual pressure');
    assert.equal(dead.readString(method),'missing','method string before dirty manual pressure');
    dirtyZero=dead.number(-0);dirtyFrame=dead.frame(1);dead.frameSet(dirtyFrame,0,dirtyZero);
    dead.auto(0);dead.collect();
    assert.equal(dead.readString(held),'unchanged','held string after first dirty manual collection');
    assert.equal(dead.readString(method),'missing','method string after first dirty manual collection');
    for(let round=0;round<16;round++)for(const[index,[name,inputs]]of activeCases.entries())if(/^(?:dynamic-|custom-)?matched(?:-all)?$/.test(name)){
     const args=[];
     withCleanup(()=>{
      for(const input of inputs)args.push(box(dead,input));
      try{assert.deepEqual(invokeWithCleanup(dead,name,args),expected[index],name+' dirty manual round='+round);}
      catch(error){
       if(error.eliscriptDiagnostic?.code!=='ELI-RT0002')throw error;
       dirtyCapacity=error;
      }
     },cleanup=>{for(const[index,arg]of args.entries())cleanup('dirty '+name+' argument '+index,()=>dead.release(arg));});
     if(dirtyCapacity)return;
     dead.collect();
     assert.equal(dead.stats().frameDepth,1);
    }
   },cleanup=>{
    cleanup('dirty realm held string',()=>assert.equal(dead.readString(held),'unchanged'));
    cleanup('dirty realm method string',()=>assert.equal(dead.readString(method),'missing'));
    if(dirtyFrame!==undefined){
     cleanup('dirty realm caller frame depth',()=>assert.equal(dead.stats().frameDepth,1));
     cleanup('dirty realm caller negative zero',()=>{
      const retained=dead.frameGet(dirtyFrame,0);
      withCleanup(()=>assert(Object.is(dead.readNumber(retained),-0)),release=>release('dirty retained caller value',()=>dead.release(retained)));
     });
     cleanup('dirty caller frame',()=>dead.leaveFrame(dirtyFrame));
    }
    if(dirtyZero!==undefined)cleanup('dirty caller negative zero handle',()=>dead.release(dirtyZero));
    cleanup('restore active automatic collection',()=>dead.auto(1));
   });
  }catch(error){
   if(!dirtyCapacity)throw error;
   const failure=new Error('dirty realm capacity refusal must preserve caller roots and cleanup',{cause:error});
   failure.capacityFailure=dirtyCapacity;throw failure;
  }
  // Each collection policy gets an independent realm from the same compiled
  // bytes, with the original default slot/byte budgets. Keep the full active
  // sequence, including prototype mutations, together on the original realm.
  for(const threshold of[0,1]){
   const stress=instantiateManagedRuntime(deadBytes);let heldZero,heldText,outer;
   let refusalCount=0,recoveryCount=0;const refusalEvidence=[];
   const assertStressRoots=()=>{
    assert.equal(stress.stats().frameDepth,1);assert.equal(stress.readString(heldText),'stress-held');
    const retained=stress.frameGet(outer,0);
    withCleanup(()=>assert(Object.is(stress.readNumber(retained),-0)),cleanup=>cleanup('retained caller value',()=>stress.release(retained)));
   };
   const request=(name,inputs,expectedValue,context,allowCapacity)=>{
    const args=[];let refused;
    withCleanup(()=>{
     try{for(const input of inputs)args.push(box(stress,input));assert.deepEqual(invokeWithCleanup(stress,name,args),expectedValue,context);}
     catch(error){
      if(allowCapacity&&error.eliscriptDiagnostic?.code==='ELI-RT0002'){
       refused=error;assertStressRoots();
       for(const[index,arg]of args.entries())assert.deepEqual(read(stress,arg),inputs[index],'refused request retains argument '+index);
      }else throw new Error(context+' '+inspect(inputs),{cause:error});
     }
    },cleanup=>{for(const[index,arg]of args.entries())cleanup('repeated '+name+' argument '+index,()=>stress.release(arg));});
    return refused;
   };
   withCleanup(()=>{
    stress.auto(threshold);heldZero=stress.number(-0);heldText=stress.string('stress-held');
    outer=stress.frame(1);stress.frameSet(outer,0,heldZero);
    if(threshold===0)stress.collect();
    for(let round=0;round<16;round++)for(const [index,[name,inputs]]of activeCases.entries())if(/^(?:dynamic-|custom-)?matched(?:-all)?$/.test(name)){
     const context='repeated string protocol '+name+' collection='+threshold+' round='+round;
     const refused=request(name,inputs,expected[index],context,threshold===0);
     if(refused){
      refusalCount++;
      if(refusalEvidence.length<8)refusalEvidence.push({name,round,code:refused.eliscriptDiagnostic.code,stats:stress.stats()});
     }
     if(threshold===0)stress.collect();
     assertStressRoots();
     if(refused){
      // A manual heap may refuse the allocation demand of this exact request.
      // After its complete cleanup/collection, prove recovery once with the
      // same inputs and automatic collection; then restore the manual policy.
      withCleanup(()=>{
       stress.auto(1);request(name,inputs,expected[index],context+' automatic recovery',false);assertStressRoots();
       recoveryCount++;
      },cleanup=>cleanup('restore manual collection after refusal',()=>stress.auto(0)));
      stress.collect();assertStressRoots();
     }
    }
    assert.equal(recoveryCount,refusalCount);
    if(refusalCount)console.info('manual string protocol capacity refusals '+JSON.stringify({refusalCount,recoveryCount,cases:refusalEvidence}));
   },cleanup=>{
    if(outer!==undefined)cleanup('caller frame',()=>stress.leaveFrame(outer));
    if(heldZero!==undefined)cleanup('caller negative zero',()=>stress.release(heldZero));
    if(heldText!==undefined)cleanup('independent caller string',()=>stress.release(heldText));
    cleanup('stress module',()=>stress.closeModule());cleanup('stress heap collection',()=>stress.collect());
    cleanup('stress empty heap assertion',()=>assert.equal(stress.live(),0));
    cleanup('stress empty frame assertion',()=>assert.equal(stress.stats().frameDepth,0));
   });
  }
  // Locale casing and Unicode normalization remain explicitly unsupported on
  // strings. Successful generic member lookup does not advertise these APIs.
  for(const name of['normalized','localized'])assert.throws(()=>dead.invoke(name,[held]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0003');
 },cleanup=>{
  cleanup('held string',()=>dead.release(held));cleanup('method string',()=>dead.release(method));
  cleanup('module',()=>dead.closeModule());cleanup('heap collection',()=>dead.collect());
  cleanup('empty heap assertion',()=>assert.equal(dead.live(),0));
  cleanup('empty frame assertion',()=>assert.equal(dead.stats().frameDepth,0));
 });
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),s=a.string('abc'),foreign=b.string('x');assert.throws(()=>a.invoke('concat',[s,foreign,true,false]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(foreign);b.collect();
 const opaque=a.sourceObject({}),fraction=a.number(.5),position=a.string('1');for(const [name,args]of[['char-at',[s,opaque]],['char-at',[s,position]],['concat',[s,fraction,true,false]],['read-value',[s,opaque]],['read-value',[s,position]],['read-value',[s,a.string('constructor')]]]){if(name==='char-at'&&args[1]===opaque){assert.equal(invoke(a,name,args),js.char_at('abc',{}));assert.equal(js.char_at('abc',{}),'a');continue;}if((name==='read-value'||name==='char-at')&&args[1]===position){assert.equal(invoke(a,name,args),'b');continue;}if(name==='concat'&&args[1]===fraction){assert.equal(invoke(a,name,args),'abc0.5truefalse');continue;}assert.throws(()=>a.invoke(name,args));if(name==='read-value'&&args[1]!==opaque)a.release(args[1]);}
 for(const x of[s,opaque,fraction,position])a.release(x);a.collect();assert.equal(a.live(),0);assert.throws(()=>a.invoke('trim',[s]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
});
test('native initialization root-range release preserves returned values caller roots and exact refusal before any partial clearing',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
 const heap=e['heap-new'](64,4096,65536),outer=e['frame-new'](heap,1),inner=e['frame-new'](heap,4);
 assert(heap&&outer&&inner);
 const caller=e['value-number'](heap,0,0x80000000),values=[1,2,3,4].map(value=>e['value-number'](heap,value,0));
 assert.equal(e['frame-set'](heap,outer,0,caller),1);
 for(const[index,value]of values.entries())assert.equal(e['frame-set'](heap,inner,index,value),1);
 for(const[first,end,keep]of[[3,2,2],[0,5,2],[1,4,0],[1,4,4]]){
  assert.equal(e['frame-clear-range'](heap,inner,first,end,keep),0);assert.equal(e['last-error'](),3);
  for(const[index,value]of values.entries())assert.equal(e['frame-get'](heap,inner,index),value);
 }
 assert.equal(e['frame-clear-range'](heap,inner,1,4,2),1);assert.equal(e['last-error'](),0);
 assert.deepEqual(values.map((_,index)=>e['frame-get'](heap,inner,index)),[values[0],0,values[2],0]);
 e['heap-collect'](heap);assert.equal(e['last-error'](),0);assert.equal(e['frame-depth'](heap),2);
 for(const value of[caller,values[0],values[2]])assert.equal(e['value-kind'](heap,value),4);
 for(const value of[values[1],values[3]]){assert.equal(e['value-kind'](heap,value),0);assert.equal(e['last-error'](),1);}
 assert.equal(e['frame-get'](heap,outer,0),caller);
 assert(Object.is(new DataView(e.memory.buffer).getFloat64(e['value-data'](heap,caller,4),true),-0));
 assert.equal(e['frame-pop'](heap,inner),1);assert.equal(e['frame-pop'](heap,outer),1);
 e['heap-collect'](heap);assert.equal(e['last-error'](),0);assert.equal(e['heap-live'](heap),0);
});
test('immediate temporary roots preserve manual collection metadata binding cells and caller roots across capacity refusal',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
 const heap=e['heap-new'](256,8192,65536),call=(name,...args)=>{
  const value=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;
 };
 assert(heap);const held=call('value-number',0,0x80000000);call('heap-pin',held);
 const binding=call('value-binding-cell-new');call('heap-pin',binding);call('value-binding-init',binding,held);
 const outer=call('frame-new',1);call('frame-set',outer,0,held);
 const args=call('value-refs',7,4);call('heap-pin',args);
 for(let index=0;index<4;index++)call('value-set',args,index,index);
 const metadata=()=>{
  const view=new DataView(e.memory.buffer),control=view.getUint32(heap+16,true),pool=view.getUint32(control+4,true),base=view.getUint32(pool+16,true);
  return Array.from({length:6},(_,index)=>view.getUint32(base+index*4,true));
 };
 const immediateSlots=()=>{
  const view=new DataView(e.memory.buffer),control=view.getUint32(heap+16,true),pool=view.getUint32(control+4,true),base=view.getUint32(pool+16,true);
  return Array.from({length:24},(_,index)=>view.getUint32(base+index*4,true));
 };
 const before=metadata();assert.equal(before[1],0);assert.equal(before[3],0);
 // Immediate IDs must not touch metadata slot zero or existing entries 1..3,
 // even transiently before a matching return. No native realm setup is needed.
 const beforeSlots=immediateSlots();
 for(const value of[0,1,2,3]){
  assert.equal(call('heap-borrow-root',value),0);assert.deepEqual(immediateSlots(),beforeSlots);
  assert.equal(call('heap-return-root',value),0);assert.deepEqual(immediateSlots(),beforeSlots);
 }
 assert.deepEqual(metadata(),before);
 call('heap-collect');
 const assertRoots=()=>{
  assert.equal(call('value-binding-get',binding),held);
  assert.deepEqual([0,1,2,3].map(index=>call('value-get',args,index)),[0,1,2,3]);
  assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',outer,0),held);
  assert(Object.is(new DataView(e.memory.buffer).getFloat64(call('value-data',held,4),true),-0));
  assert.equal(metadata()[1],0);
 };
 assertRoots();
 let exhausted=false;
 for(let index=0;index<=256;index++){
  const value=e['value-number'](heap,index,0)>>>0;
  if(value===0){assert.equal(e['last-error'](),2);exhausted=true;break;}
  assert.equal(e['last-error'](),0);
 }
 assert(exhausted,'manual allocation must refuse the fixed slot capacity');assertRoots();
 assert(call('heap-collect')>0);assertRoots();assert(call('value-number',7,0)>3);
 call('heap-release',args);call('frame-pop',outer);call('heap-release',held);
 call('heap-release',binding);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});
test('deterministic random UTF16 methods and full f64 position words agree with independent JS during automatic collection',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);let seed=0x84fbd9a;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};const bits=new DataView(new ArrayBuffer(8));
 for(let i=0;i<1024;i++){const units=Array.from({length:next()%64},()=>next()%65536),text=String.fromCharCode(...units),needle=i%3?text.slice(next()%(text.length+1),next()%(text.length+1)):String.fromCharCode(next()%65536);bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const position=bits.getFloat64(0,true);for(const name of['at','char-at','char-code','code-point'])check(a,name,[text,position]);for(const name of['find','last','includes','starts','ends'])check(a,name,[text,needle,position]);for(const name of['slice','substring','substr'])check(a,name,[text,position,(next()%65)-32]);for(const name of['well-formed','repair'])check(a,name,[text]);}
});
test('source searches retain bounded Two-Way behavior on long periodic and overlapping text in both directions',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:65536,maxBytes:4194304});a.auto(1);
 for(const [text,needle]of[['a'.repeat(262144)+'b','a'.repeat(32768)+'c'],['ab'.repeat(65536)+'z','ab'.repeat(8192)+'z'],['a'.repeat(65536),'a'.repeat(8192)],['\ud800'.repeat(65536)+'中','\ud800'.repeat(8192)+'中']])for(const position of[undefined,NaN,0,99,Infinity,-Infinity])for(const name of['find','last','includes','starts','ends'])check(a,name,[text,needle,position]);
});
test('text capacity failures preserve input bits and caller frames; real search traps unwind only private roots and retain earlier errors',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun heap-text-search-unit '),end=source.indexOf('  (defun heap-text-find-direction ',start);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun heap-text-search-unit (data length index reverse) (load-u16 4294967295))\n'+source.slice(end),'trap-runtime.eli'),a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,injected)));a.auto(1);
 const s=a.string('xxx'),bad=a.sourceObject({valueOf:false,toString:false}),good=a.number(0),frame=a.frame(1);a.frameSet(frame,0,s);assert.throws(()=>js.fault('xxx',{valueOf:false,toString:false}),TypeError);assert.throws(()=>a.invoke('fault',[s,bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);assert.throws(()=>a.invoke('fault',[s,good]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.readString(s),'xxx');const retained=a.frameGet(frame,0);assert(a.keyEqual(retained,s));a.release(retained);a.leaveFrame(frame);for(const x of[s,bad,good])a.release(x);a.collect();assert.equal(a.live(),0);
 const bounded=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});bounded.auto(1);const original=bounded.string('中😀\ud800'),n=bounded.number(10000),outer=bounded.frame(1);bounded.frameSet(outer,0,original);assert.throws(()=>bounded.invoke('repeat',[original,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(bounded.readString(original),'中😀\ud800');assert.equal(bounded.stats().frameDepth,1);bounded.leaveFrame(outer);bounded.release(n);bounded.release(original);bounded.collect();assert.equal(bounded.live(),0);
});
test('text literal emission refuses malformed method IR before lowering absent children and preserves the original source schema',()=>{
 for(const malformed of ['missing','null-receiver','null-key']){
  const copy=structuredClone(program);let method;const visit=v=>{if(!v||typeof v!=='object'||method)return;if(v.kind==='method-call')method=v;else for(const x of Object.values(v))visit(x);};visit(copy);assert(method);
  if(malformed==='missing')method.children=method.children.slice(0,1);else method.children[malformed==='null-receiver'?0:1]=null;
  const before=JSON.stringify(copy);assert.throws(()=>backend.managed.emit_managed_wasm(copy,runtimeProgram),e=>{
   assert.equal(e.eliscriptDiagnostic?.code,'ELI-B0001');
   assert.deepEqual(e.eliscriptDiagnostic.location,{file:'strings.eli',
    start:{offset:method.span.start,line:method.span.line,column:method.span.column},
    end:{offset:method.span.end,line:method.span.endLine,column:method.span.endColumn}});return true;
  });assert.equal(JSON.stringify(copy),before);
 }
});
test('Node executes identical zero-import source text bytes with code-point, reverse-search, trim and repair semantics and complete root cleanup',async()=>{
 const path=resolve(directory,'text.wasm');await writeFile(path,bytes);const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const s=a.string('中😀\\ud800'),p=a.number(1),point=a.invoke('code-point',[s,p]);assert.equal(a.readNumber(point),0x1f600);a.release(point);const fixed=a.invoke('repair',[s]);assert.equal(a.readString(fixed),'中😀�');a.release(fixed);const needle=a.string('😀'),nan=a.number(NaN),last=a.invoke('last',[s,needle,nan]);assert.equal(a.readNumber(last),1);a.release(last);const spaced=a.string('\\ufeff x \\u2000'),trimmed=a.invoke('trim',[spaced]);assert.equal(a.readString(trimmed),'x');for(const v of[s,p,needle,nan,spaced,trimmed])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});

test('omitted method arguments, zero-argument concat and ignored identity arguments preserve source defaults and borrowed value lifetime',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of texts)for(const name of['concat-empty','char-empty','at-empty','slice-empty','substring-empty','substr-empty','find-empty','repeat-empty'])check(a,name,[text]);
 for(const extra of[.5,Number.MIN_VALUE,NaN,undefined,true,'x'])check(a,'ignored-identity',['中😀',extra]);const s=a.string('held'),object=a.sourceObject({}),alias=a.invoke('ignored-identity',[s,object]);assert(a.keyEqual(alias,s));a.release(s);a.collect();assert.equal(a.readString(alias),'held');a.release(alias);a.release(object);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});

const staticLiteralText=String.fromCharCode(...Array.from({length:8192},(_,index)=>
 index%7===0?0:index%7===1?0xd800:index%7===2?0xdfff:index%7===3?0xfeff:(index*4051)&0xffff));
function staticLiteralSource(text){return'(defun literal () '+JSON.stringify(text)+') (defun source-text () (js-call literal :toString)) (export literal source-text)';}
function staticLiteralShape(typed){
 const pending=typed.functions.map(fn=>fn.body),seen=new Set(),copies=[];let count=0;
 while(pending.length){const node=pending.pop();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);count++;
  if(node.kind==='memory-data-copy')copies.push(node);if(Array.isArray(node.children))pending.push(...node.children);
 }
 return{count,copies};
}
function closeStaticLiteral(a,roots=[]){try{roots.forEach(root=>a.release(root));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}finally{a.close?.();}}
let staticLiteralProduct;
async function staticLiteralArtifact(){
 if(staticLiteralProduct)return staticLiteralProduct;
 const text=staticLiteralText,source=staticLiteralSource(text),p=backend.compiler.compile_ir_string(source,'static-literal-中.eli');
 const saved=JSON.stringify(p),lowered=backend.managed.lower_managed_program(p,runtimeProgram);
 const bytes=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtimeProgram));assert.equal(JSON.stringify(p),saved);
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
 assert.equal(reference.literal(),text);
 // Bun rewrites Unicode and escape spellings in Function.toString. The source
 // contract uses the actual Node function created from these exact JS bytes.
 const oracle=spawnSync('node',['--input-type=module','-e',
  "let source='';for await(const chunk of process.stdin)source+=chunk;const m=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));process.stdout.write(JSON.stringify({text:m.literal(),sourceText:m.literal.toString()}));"],
  {input:backend.compiler.emit_ir_string(p),encoding:'utf8',timeout:30000});
 assert.equal(oracle.error,undefined);assert.equal(oracle.status,0,oracle.stderr);
 const nodeReference=JSON.parse(oracle.stdout);assert.equal(nodeReference.text,text);
 return staticLiteralProduct={text,source,p,lowered,bytes,sourceText:nodeReference.sourceText};
}
function assertStaticLiteral(a,product){
 a.auto(1);const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);let literal,sourceText;
 try{
  literal=a.invoke('literal');assert.equal(a.readString(literal),product.text);
  assert.equal(a.length(literal),product.text.length);
  try{sourceText=a.invoke('source-text');}
  catch(error){throw new Error('static literal source-text invocation after literal length '+product.text.length+'; auto GC enabled',{cause:error});}
  assert.equal(a.readString(sourceText),product.sourceText);
  const filler=a.string('growth'.repeat(8192));a.release(filler);a.collect();
  assert.equal(a.readString(literal),product.text);assert.equal(a.readString(sourceText),product.sourceText);
  const again=a.invoke('source-text');try{assert.equal(a.readString(again),product.sourceText);}finally{a.release(again);}
  const caller=a.frameGet(frame,0);try{assert(Object.is(a.readNumber(caller),-0));}finally{a.release(caller);}
  assert.equal(a.stats().frameDepth,1);
 }finally{a.leaveFrame(frame);closeStaticLiteral(a,[held,...[literal,sourceText].filter(value=>value!==undefined)]);}
}
test('Given exact UTF16 literal data when emitted and collected then owned copies preserve NUL BOM surrogate pairs lone surrogates and complete Function source text',async()=>{
 const product=await staticLiteralArtifact();assertStaticLiteral(instantiateManagedRuntime(product.bytes,{maxSlots:2048,initialBytes:65536,maxBytes:2097152}),product);
 for(const text of['','a','中😀\ud800\0\udfff']){
  const p=backend.compiler.compile_ir_string(staticLiteralSource(text),'static-small.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(p,runtimeProgram));
  const a=instantiateManagedRuntime(artifact,{maxSlots:2048,initialBytes:65536,maxBytes:2097152});let output;
  try{output=a.invoke('literal');assert.equal(a.readString(output),text);}finally{closeStaticLiteral(a,output===undefined?[]:[output]);}
 }
},120000);
test('Given larger source literals when managed IR is lowered then string bytes remain static data instead of a per-code-unit control tree',async()=>{
 const product=await staticLiteralArtifact(),large=staticLiteralShape(product.lowered.typed);
 const small=backend.managed.lower_managed_program(backend.compiler.compile_ir_string(staticLiteralSource('x'),'static-small.eli'),runtimeProgram),smallShape=staticLiteralShape(small.typed);
 assert(large.copies.some(copy=>copy.value===product.text),'the literal retains its exact UTF16 static payload');
 assert(large.copies.some(copy=>copy.value===product.sourceText),'Function.toString retains its complete original generated source');
 assert(large.count<=smallShape.count+128,'growing literal text must not grow the executable control tree per code unit');
},120000);
test.skipIf(process.arch!=='arm64'||!['darwin','linux'].includes(process.platform))('Given native literal static blocks when their bytes are copied then the same UTF16 source and collecting-root contract executes without imports',async()=>{
 const product=await staticLiteralArtifact(),target=process.platform==='linux'?'arm64-linux':'arm64-macos';
 const path=resolve(directory,'static-literal'+(process.platform==='linux'?'.so':'.dylib'));
 await writeFile(path,Uint8Array.from(backend.native.emit_typed_native_memory_library(product.lowered.typed,target)));
 assertStaticLiteral(await instantiateNativeManagedRuntime(path,product.lowered,{maxSlots:2048,initialBytes:65536,maxBytes:2097152}),product);
},120000);
