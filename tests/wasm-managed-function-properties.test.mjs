import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const standardErrorOwnNames=['length','name','prototype'];
const standardErrorShape=JSON.stringify([[],standardErrorOwnNames,[],true,['function','',0,false,true]]);
const errorStackExtensions=['captureStackTrace','stackTraceLimit','prepareStackTrace'];
const standardRestrictedDescriptors='[true,true,true,false,true,"",0,false,false,false,false,"TypeError",["argument"]]';
// Stable ABI IDs, deliberately distinct from constructor property order.
const wellKnownSymbolNames=['iterator','toPrimitive','match','replace','search','split','species','isConcatSpreadable','toStringTag','hasInstance','asyncIterator','unscopables','matchAll','dispose','asyncDispose'];
const reflectionKeys=['isFinite','missing','name','length','prototype','caller','arguments','call','apply','bind','constructor','toString','__proto__','parseInt','parseFloat','fromCharCode','fromCodePoint','raw',...wellKnownSymbolNames];
const reflectionSource=`
  (defun reflection-normalize (value owner)
    (cond
      ((= value undefined) (js-array "undefined"))
      ((= value nil) (js-array "null"))
      ((= (value-type value) "function")
        (js-array "function" (get value :name) (get value :length)
          (Object/hasOwn value "prototype") (Object/is value (get globalThis/Function :prototype))))
      ((= (value-type value) "object") (js-array "object" (Object/is value (get owner :prototype))))
      ((= (value-type value) "symbol") (js-array "symbol" (globalThis/String value)))
      (t (js-array "value" value))))
  (defun reflection-snapshot (mode key)
    (let* ((owner (choose mode)) (descriptor (Object/getOwnPropertyDescriptor owner key)))
      (JSON/stringify (js-array
        (try (js-array "value" (reflection-normalize (aref owner key) owner))
          (catch error (js-array "throw" (get error :name))))
        (object-has? owner key) (Object/hasOwn owner key)
        (if (= descriptor undefined) (js-array "undefined")
          (js-array "descriptor" (Object/hasOwn descriptor "value")
            (reflection-normalize (get descriptor :value) owner)
            (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)
            (reflection-normalize (get descriptor :get) owner)
            (reflection-normalize (get descriptor :set) owner)))))))
  (defun reflection-shape (mode)
    (let ((symbol-names (js-array)) (symbol-keys (symbols mode)) (symbol-index 0))
      (while (< symbol-index (js-length symbol-keys))
        (js-call symbol-names :push (globalThis/String (aref symbol-keys symbol-index)))
        (setq symbol-index (1+ symbol-index)))
      (JSON/stringify (js-array (keys mode) (names mode) symbol-names
        (Object/is (prototype mode) (get globalThis/Function :prototype))
        (reflection-normalize (prototype mode) (choose mode))))))
  (defvar reflection-trace nil)
  (defun reflection-method (argument)
    (js-call reflection-trace :push (js-array "call" (Object/is (js* "this") ordinary))) argument)
  (defun reflection-effects (mode)
    (let* ((trace (js-array)) (sentinel (js-object :reason "getter")))
      (setq reflection-trace trace)
      (Object/defineProperty ordinary "probe"
        (js-object :configurable t :get (lambda ()
          (js-call trace :push "get")
          (cond ((= mode 1) (throw sentinel)) ((= mode 2) 7) (t reflection-method)))))
      (try
        (JSON/stringify (js-array
          (try (js-call ordinary :probe (progn (js-call trace :push "argument") 12))
            (catch error (if (Object/is error sentinel) "same getter error" (get error :name)))) trace))
        (finally (Reflect/deleteProperty ordinary "probe") (setq reflection-trace nil)))))
  (defun static-number (mode input radix)
    (if (= mode 0) (js-call globalThis/Number :parseInt input radix)
      (js-call globalThis/Number :parseFloat input)))
  (defun detached-number (mode input radix)
    (funcall (get globalThis/Number (if (= mode 0) "parseInt" "parseFloat")) input radix))
  (defun static-string (mode arguments)
    (js-call (get globalThis/String (if (= mode 0) "fromCharCode" "fromCodePoint")) :apply undefined arguments))
  (defun static-constant (key) (get globalThis/Number key))
  (defun code-effects (mode)
    (let* ((trace (js-array)) (first (js-object)) (second (js-object)) (sentinel (js-object)))
      (put first (get globalThis/Symbol :toPrimitive) (lambda (hint)
        (js-call trace :push (str "first:" hint)) (if (= mode 1) (throw sentinel) 65)))
      (put second (get globalThis/Symbol :toPrimitive) (lambda (hint)
        (js-call trace :push (str "second:" hint)) 128512))
      (JSON/stringify (js-array
        (try (js-call globalThis/String :fromCodePoint first second) (catch error (Object/is error sentinel))) trace))))
  (defun static-order (mode)
    (let* ((trace (js-array)) (sentinel (js-object)) (input (js-object)) (radix (js-object)))
      (put input (get globalThis/Symbol :toPrimitive) (lambda (hint)
        (js-call trace :push (str "input:" hint))
        (if (= mode 1) (throw sentinel) "  -fftail")))
      (put radix (get globalThis/Symbol :toPrimitive) (lambda (hint)
        (js-call trace :push (str "radix:" hint))
        (if (= mode 2) (throw sentinel) 16)))
      (JSON/stringify (js-array
        (try (js-call globalThis/Number :parseInt input radix (progn (js-call trace :push "extra") 9))
          (catch error (Object/is error sentinel))) trace))))
  (defun raw-order (mode)
    (let* ((trace (js-array)) (raw (js-object)) (template (js-object))
           (first (js-object)) (second (js-object)) (sentinel (js-object)))
      (Object/defineProperty template "raw" (js-object :get (lambda ()
        (js-call trace :push "raw") (if (= mode 1) (throw sentinel) raw))))
      (Object/defineProperty raw "length" (js-object :get (lambda () (js-call trace :push "length") (if (= mode 2) 0 3))))
      (Object/defineProperty raw "0" (js-object :get (lambda () (js-call trace :push "0") "A")))
      (Object/defineProperty raw "1" (js-object :get (lambda () (js-call trace :push "1") "B")))
      (Object/defineProperty raw "2" (js-object :get (lambda () (js-call trace :push "2") "C")))
      (put first (get globalThis/Symbol :toPrimitive) (lambda (hint)
        (js-call trace :push (str "first:" hint)) (if (= mode 3) (throw sentinel) "X")))
      (put second (get globalThis/Symbol :toPrimitive) (lambda (hint) (js-call trace :push (str "second:" hint)) "Y"))
      (JSON/stringify (js-array
        (try (js-call globalThis/String :raw template first second) (catch error (Object/is error sentinel))) trace))))
  (defun restricted-descriptors ()
    (let* ((prototype (get globalThis/Function :prototype))
           (a (Object/getOwnPropertyDescriptor prototype "caller"))
           (b (Object/getOwnPropertyDescriptor prototype "arguments")) (getter (get a :get))
           (trace (js-array)))
      (JSON/stringify (js-array (Object/is getter (get a :set))
        (Object/is getter (get b :get)) (Object/is getter (get b :set))
        (get a :enumerable) (get a :configurable) (get getter :name) (get getter :length)
        (Object/isExtensible getter) (Object/hasOwn getter "prototype")
        (get (Object/getOwnPropertyDescriptor getter "name") :configurable)
        (get (Object/getOwnPropertyDescriptor getter "length") :configurable)
        (try (funcall getter (progn (js-call trace :push "argument") 9)) (catch error (get error :name))) trace))))
  (defun parser-aliases ()
    (let* ((constructor globalThis/Number) (integer (get constructor :parseInt)) (floating (get constructor :parseFloat))
           (global-integer (js* "parseInt")) (global-floating (js* "globalThis.parseFloat"))
           (before (js-array (Object/is integer global-integer) (Object/is floating global-floating))))
      (try
        (put constructor :parseInt (lambda (input radix) 77))
        (Reflect/deleteProperty constructor "parseFloat")
        (JSON/stringify (js-array before
          (Object/is (js* "parseInt") integer) (Object/is (js* "globalThis.parseInt") integer)
          (Object/is (js* "parseFloat") floating) (Object/is (js* "globalThis.parseFloat") floating)
          (js-call constructor :parseInt "10" 10) (funcall (js* "globalThis.parseInt") "10" 10)
          (funcall (js* "parseFloat") "1.5tail") (get constructor :parseFloat)))
        (finally (put constructor :parseInt integer) (put constructor :parseFloat floating)))))
  (defun static-shadow ()
    (let ((parseInt (lambda (input radix) 88))
          (String (js-object :fromCharCode (lambda (input) "shadow"))))
      (JSON/stringify (js-array (funcall (js* "parseInt") "1" 10)
        (funcall (js* "globalThis.parseInt") "1" 10) (js-call String :fromCharCode 65)
        (js-call globalThis/String :fromCharCode 65)))))
  (defun descriptor-field (descriptor key) (get descriptor key))
  (defun symbol-static (index)
    (aref (js-array ${wellKnownSymbolNames.map(name=>`(js* "Symbol.${name}")`).join(' ')}) index))
  (defun symbol-dynamic (key) (get globalThis/Symbol key))
  (defun symbol-alias (key)
    (let ((constructor globalThis/Symbol)) (get constructor key)))
  (defun symbol-same (left right) (Object/is left right))
  (defun symbol-description (value) (get value :description))
  (defun symbol-text (value) (globalThis/String value))
  (defun symbol-key (object key value) (put object key value) (get object key))
  (defun symbol-own-keys (object) (Object/getOwnPropertySymbols object))
  (defun symbol-key-for (value) (Symbol/keyFor value))
  (defun error-stack-observation ()
    (let ((error (funcall (choose 3) "stack boundary")))
      (try (js-array "value" (value-type (get error :stack)))
        (catch failure (js-array "unsupported" (get (get failure :eliscriptDiagnostic) :code))))))
  (export descriptor-field error-stack-observation reflection-snapshot reflection-shape reflection-effects static-number detached-number static-string static-constant code-effects static-order raw-order restricted-descriptors parser-aliases static-shadow symbol-static symbol-dynamic symbol-alias symbol-same symbol-description symbol-text symbol-key symbol-own-keys symbol-key-for)
`;
const constantNames=['MAX_VALUE','MIN_VALUE','NaN','NEGATIVE_INFINITY','POSITIVE_INFINITY','MAX_SAFE_INTEGER','MIN_SAFE_INTEGER','EPSILON'];
const integerCases=[['-0',undefined],['\ufeff\u2000-000tail',10],['1e9',10],['0xFFG',undefined],['+0xF',16],['-0xF',0],['0b11',0],['zzz',36],['z',35],['900719925474099267',10],['9'.repeat(400),10],['.5',10],['101',2],['11',-4294967294],['11',4294967298],['11',2.9],['',0],[true,16],[null,36],[undefined,36]];
const floatCases=['-0','-0xFF','1e+bad','1.e+2','.5tail','NaN','+Infinityxyz','-Infinity','infinity','9'.repeat(400),'\ufeff\u2000-3.5tail','2.2250738585072014e-308text','4.9406564584124654e-324 trailing','1.00000000000000011102230246251565404236316680908203125tail'];
const stringCases=[[],[0,-0,65,65535,65536,-1,NaN,Infinity],[65,0x1f600,0xd800,0x10ffff]];
let directory,b,runtime,program,bytes,lowered,js,oracle;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-function-builtin-'));b=await buildBackends({outputRoot:directory});
 runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 const original=await readFile('tests/fixtures/wasm-managed-function-properties.eli','utf8'),end=original.lastIndexOf(')');
 const source=original.slice(0,end)+reflectionSource+original.slice(end);
 program=b.compiler.compile_ir_string(source,'function-builtin.eli');const saved=JSON.stringify(program);
 const javascript=b.compiler.emit_ir_string(program),reference=resolve(directory,'function-builtin.mjs');await writeFile(reference,javascript);
 js=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
 lowered=b.managed.lower_managed_program(program,runtime);bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime));
 assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const script=`import assert from 'node:assert/strict';
 // Observe one realm without invoking its restricted accessors. Keep output
 // bounded and assign identities locally instead of printing function source.
 const initialFunction=Function,initialFunctionPrototype=Function.prototype;
 const ownDescriptor=Object.getOwnPropertyDescriptor,isExtensible=Object.isExtensible;
 const restrictedIdentities=new WeakMap(),restrictedSnapshots=[];let nextRestrictedIdentity=1;
 function restrictedIdentity(value){
  if((typeof value!=='function'&&typeof value!=='object')||value===null)return null;
  if(!restrictedIdentities.has(value))restrictedIdentities.set(value,nextRestrictedIdentity++);
  return restrictedIdentities.get(value);
 }
 function restrictedFunction(value){
  if(typeof value!=='function')return{type:typeof value,id:restrictedIdentity(value)};
  const name=ownDescriptor(value,'name'),length=ownDescriptor(value,'length');
  return{id:restrictedIdentity(value),name:name?.value,length:length?.value,
   extensible:isExtensible(value),prototypeOwn:ownDescriptor(value,'prototype')!==undefined,
   nameFlags:name&&[name.writable,name.enumerable,name.configurable],
   lengthFlags:length&&[length.writable,length.enumerable,length.configurable]};
 }
 function restrictedSnapshot(stage){
  assert(restrictedSnapshots.length<48,'bounded restricted-accessor observations');
  const prototype=Function.prototype,caller=ownDescriptor(prototype,'caller'),args=ownDescriptor(prototype,'arguments');
  const descriptor=d=>d===undefined?null:{enumerable:d.enumerable,configurable:d.configurable,
   getter:restrictedFunction(d.get),setter:restrictedFunction(d.set)};
  const observation={stage,functionUnchanged:Function===initialFunction,prototypeUnchanged:prototype===initialFunctionPrototype,
   caller:descriptor(caller),arguments:descriptor(args)};
  restrictedSnapshots.push(observation);
  process.stderr.write('[restricted-accessor-realm] '+JSON.stringify(observation)+'\\n');
 }
 const nodeOptions=process.env.NODE_OPTIONS||'';
 process.stderr.write('[restricted-accessor-environment] '+JSON.stringify({
  node:process.versions.node,bun:process.versions.bun||null,v8:process.versions.v8,
  release:process.release?.name,nodeOptionsPresent:nodeOptions.length!==0,
  preloadOptionPresent:/--(?:require|import)(?:=|\\s)/.test(nodeOptions),
  loaderOptionPresent:/--(?:experimental-)?loader(?:=|\\s)/.test(nodeOptions),
  nodePathPresent:!!process.env.NODE_PATH})+'\\n');
 restrictedSnapshot('before-generated-module-import');
 const m=await import(process.argv[1]);
 restrictedSnapshot('after-generated-module-import');
 const constructors=[Number,String,Symbol,Error,Number.isFinite],keys=${JSON.stringify(reflectionKeys)};
 function norm(value,owner){if(value===undefined)return['undefined'];if(value===null)return['null'];
  if(typeof value==='function')return['function',value.name,value.length,Object.hasOwn(value,'prototype'),value===Function.prototype];
  if(typeof value==='object')return['object',value===owner.prototype];
  if(typeof value==='symbol')return['symbol',String(value)];return['value',value];}
 const result=[];
 for(let mode=0;mode<constructors.length;mode++){
  const owner=constructors[mode],fields=Object.create(null);
  for(const key of keys){let reading;try{reading=['value',norm(owner[key],owner)];}catch(error){reading=['throw',error.name];}
   const d=Object.getOwnPropertyDescriptor(owner,key),descriptor=d===undefined?['undefined']:['descriptor',Object.hasOwn(d,'value'),norm(d.value,owner),d.writable,d.enumerable,d.configurable,norm(d.get,owner),norm(d.set,owner)];
   fields[key]=JSON.stringify([reading,Object.hasOwn(owner,key),Object.hasOwn(owner,key),descriptor]);
   assert.equal(m.reflection_snapshot(mode,key),fields[key],mode+'/'+key);}
  const shape=JSON.stringify([Object.keys(owner),Object.getOwnPropertyNames(owner),Object.getOwnPropertySymbols(owner).map(String),Object.getPrototypeOf(owner)===Function.prototype,norm(Object.getPrototypeOf(owner),owner)]);
  assert.equal(m.reflection_shape(mode),shape,'shape/'+mode);result.push({fields,shape});
  restrictedSnapshot('after-builtin-reflection/'+mode);
 }
 const standardErrorNames=${JSON.stringify(standardErrorOwnNames)},stackExtensionNames=${JSON.stringify(errorStackExtensions)};
 const errorExtensions={completeOwnNames:Object.getOwnPropertyNames(Error),fields:Object.create(null),unclassifiedOwnNames:[]};
 for(const key of stackExtensionNames){
  const d=Object.getOwnPropertyDescriptor(Error,key);let reading;
  try{reading=['value',norm(Error[key],Error)];}catch(error){reading=['throw',error.name];}
  const descriptor=d===undefined?['undefined']:['descriptor',Object.hasOwn(d,'value'),norm(d.value,Error),d.writable,d.enumerable,d.configurable,norm(d.get,Error),norm(d.set,Error)];
  errorExtensions.fields[key]=JSON.stringify([reading,Object.hasOwn(Error,key),Object.hasOwn(Error,key),descriptor]);
  assert.equal(m.reflection_snapshot(3,key),errorExtensions.fields[key],'Node extension/'+key);
 }
 // Keep every host key: classification never changes the full Node shape above.
 for(const key of errorExtensions.completeOwnNames)if(!standardErrorNames.includes(key)&&!stackExtensionNames.includes(key))errorExtensions.unclassifiedOwnNames.push(key);
 for(const key of standardErrorNames){const d=Object.getOwnPropertyDescriptor(Error,key);
  assert.equal(d.enumerable,false);assert.equal(d.configurable,key!=='prototype');assert.equal(d.writable,false);}
 assert.equal(Error.length,1);assert.equal(Error.name,'Error');assert.equal(Object.getPrototypeOf(Error),Function.prototype);
 assert.deepEqual(m.error_stack_observation(),['value','string']);
 restrictedSnapshot('after-error-stack-observation');
 const effects=['[12,["get","argument",["call",true]]]','["same getter error",["get"]]','["TypeError",["get","argument"]]'];
 for(let mode=0;mode<effects.length;mode++){assert.equal(m.reflection_effects(mode),effects[mode]);restrictedSnapshot('after-reflection-effects/'+mode);}
 function record(value){if(Number.isNaN(value))return{nan:true};const bytes=new ArrayBuffer(8),view=new DataView(bytes);view.setFloat64(0,value,true);return{words:[view.getUint32(0,true),view.getUint32(4,true)]};}
 const integers=${JSON.stringify(integerCases.map(([input,radix])=>({input:input===undefined?{undefined:true}:{value:input},radix:radix===undefined?{undefined:true}:{value:radix}})))};
 const ints=integers.map(({input,radix})=>{const a=input.undefined?undefined:input.value,b=radix.undefined?undefined:radix.value,expected=Number.parseInt(a,b);assert(Object.is(m.static_number(0,a,b),expected));return record(expected);});
 restrictedSnapshot('after-integer-parsing');
 const floats=${JSON.stringify(floatCases)}.map(input=>{const expected=Number.parseFloat(input);assert(Object.is(m.static_number(1,input),expected));return record(expected);});
 restrictedSnapshot('after-float-parsing');
 const staticOrder=['[-255,["extra","input:string","radix:number"]]','[true,["extra","input:string"]]','[true,["extra","input:string","radix:number"]]'];
 const rawOrder=['["AXBYC",["raw","length","0","first:string","1","second:string","2"]]','[true,["raw"]]','["",["raw","length"]]','[true,["raw","length","0","first:string"]]'];
 for(let mode=0;mode<staticOrder.length;mode++){assert.equal(m.static_order(mode),staticOrder[mode]);restrictedSnapshot('after-static-order/'+mode);}
 for(let mode=0;mode<rawOrder.length;mode++){assert.equal(m.raw_order(mode),rawOrder[mode]);restrictedSnapshot('after-raw-order/'+mode);}
 const constants=${JSON.stringify(constantNames)}.map(key=>{const expected=Number[key];assert(Object.is(m.static_constant(key),expected));return record(expected);});
 restrictedSnapshot('after-number-constants');
 const codeEffects=['["A😀",["first:number","second:number"]]','[true,["first:number"]]'];
 for(let mode=0;mode<codeEffects.length;mode++){assert.equal(m.code_effects(mode),codeEffects[mode]);restrictedSnapshot('after-code-effects/'+mode);}
 // Retain the complete host observation and the independent standard gate.
 // A descriptor difference is not treated as a permitted language extension.
 for(const [index,key]of ${JSON.stringify(wellKnownSymbolNames)}.entries()){
  const symbol=Symbol[key],descriptor=Object.getOwnPropertyDescriptor(Symbol,key),object={};
  assert.equal(typeof symbol,'symbol',key);assert.equal(m.symbol_static(index),symbol,key);assert.equal(m.symbol_dynamic(key),symbol,key);assert.equal(m.symbol_alias(key),symbol,key);
  assert.equal(m.symbol_description(symbol),symbol.description);assert.equal(m.symbol_text(symbol),String(symbol));assert.equal(m.symbol_key_for(symbol),undefined);
  assert.equal(descriptor.value,symbol);assert.equal(descriptor.writable,false);assert.equal(descriptor.enumerable,false);assert.equal(descriptor.configurable,false);
  assert(Object.is(m.symbol_key(object,symbol,-0),-0));assert.deepEqual(m.symbol_own_keys(object),[symbol]);
 }
 restrictedSnapshot('after-well-known-symbols');
 const restricted=m.restricted_descriptors(),restrictedStandard=${JSON.stringify(standardRestrictedDescriptors)};
 restrictedSnapshot('after-restricted-descriptors');
 const caller=Object.getOwnPropertyDescriptor(Function.prototype,'caller'),argumentsDescriptor=Object.getOwnPropertyDescriptor(Function.prototype,'arguments'),getter=caller.get,trace=[];
 let outcome;try{getter((trace.push('argument'),9));}catch(error){outcome=error.name;}
 const restrictedHost=JSON.stringify([getter===caller.set,getter===argumentsDescriptor.get,getter===argumentsDescriptor.set,caller.enumerable,caller.configurable,getter.name,getter.length,Object.isExtensible(getter),Object.hasOwn(getter,'prototype'),Object.getOwnPropertyDescriptor(getter,'name').configurable,Object.getOwnPropertyDescriptor(getter,'length').configurable,outcome,trace]);
 assert.equal(restricted,restrictedHost);
 restrictedSnapshot('after-direct-restricted-host-observation');
 const aliases='[[true,true],true,true,true,true,77,10,1.5,null]';assert.equal(m.parser_aliases(),aliases);
 restrictedSnapshot('after-parser-aliases');
 const shadow='[88,1,"shadow","A"]';assert.equal(m.static_shadow(),shadow);
 restrictedSnapshot('after-static-shadow');
 console.log(JSON.stringify({builtins:result,errorExtensions,effects,ints,floats,staticOrder,rawOrder,restricted,restrictedStandard,restrictedSnapshots,constants,codeEffects,aliases,shadow}));`;
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(reference).href],{encoding:'utf8',timeout:30000});
 if(child.stderr)process.stderr.write(child.stderr);
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr||child.stdout);oracle=JSON.parse(child.stdout);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
test('independent Node restricted accessors satisfy the complete standard ThrowTypeError descriptor contract',()=>{
 // Deliberately retain the original strict comparison as its own gate. A host
 // legacy-accessor difference is a failure, never a skipped or accepted result.
 assert.equal(oracle.restricted,oracle.restrictedStandard);
});
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14){const out=[];for(let i=0;i<a.length(v);i++){const x=a.get(v,i);try{out.push(read(a,x));}finally{a.release(x);}}return out;}return v;}
function value(a,name,args=[]){const result=a.invoke(name,args);try{return read(a,result);}finally{a.release(result);}}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function checkBuiltins(a){
 a.auto(1);
 for(let mode=0;mode<5;mode++){
  const n=a.number(mode);
  try{
   for(const name of reflectionKeys){const key=a.string(name);try{assert.equal(value(a,'reflection-snapshot',[n,key]),oracle.builtins[mode].fields[name],mode+'/'+name);}finally{a.release(key);}}
   assert.equal(value(a,'reflection-shape',[n]),mode===3?standardErrorShape:oracle.builtins[mode].shape,'standard own keys/names/symbols/prototype '+mode);
  }finally{a.release(n);}
  a.collect();assert.equal(a.stats().frameDepth,0);
 }
 checkWellKnownSymbols(a);
}
function checkWellKnownSymbols(a){
 a.auto(1);const object=a.sourceObject({}),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 try{
  for(const [index,name]of wellKnownSymbolNames.entries()){
   const position=a.number(index),key=a.string(name),symbol=a.invoke('symbol-static',[position]);let dynamic,alias,incoming,out;
   try{
    dynamic=a.invoke('symbol-dynamic',[key]);alias=a.invoke('symbol-alias',[key]);
    assert.equal(a.invoke('symbol-same',[symbol,dynamic]),true,name);assert.equal(a.invoke('symbol-same',[symbol,alias]),true,name);
    assert.equal(value(a,'symbol-description',[symbol]),'Symbol.'+name);assert.equal(value(a,'symbol-text',[symbol]),'Symbol(Symbol.'+name+')');assert.equal(a.invoke('symbol-key-for',[symbol]),undefined);
    assert.equal(a.toHostValue(symbol),Symbol[name],name);incoming=a.fromHostValue(Symbol[name]);assert.equal(a.invoke('symbol-same',[symbol,incoming]),true,name);
    out=a.invoke('symbol-key',[object,incoming,held]);assert(Object.is(a.readNumber(out),-0));
   }finally{for(const root of[position,key,symbol,dynamic,alias,incoming,out])if(root!==undefined)a.release(root);}
   a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  }
  const keys=a.invoke('symbol-own-keys',[object]);
  try{assert.equal(a.length(keys),wellKnownSymbolNames.length);
   for(const [index,name]of wellKnownSymbolNames.entries()){
    const symbol=a.get(keys,index),key=a.string(name),again=a.invoke('symbol-alias',[key]);
    try{assert.equal(a.invoke('symbol-same',[symbol,again]),true,name);assert.equal(a.toHostValue(symbol),Symbol[name],name);}
    finally{a.release(symbol);a.release(key);a.release(again);}
   }
  }finally{a.release(keys);}
 }finally{a.leaveFrame(frame);a.release(object);a.release(held);}
}
function checkOrdinary(a){
 const mode=a.number(5);a.auto(1);
 try{for(const name of['kind','isFinite']){const key=a.string(name);try{assert.equal(value(a,'read',[mode,key]),js.read(5,name));assert.equal(value(a,'has',[mode,key]),js.has(5,name));const descriptor=a.invoke('descriptor',[mode,key]);try{assert.equal(descriptor,js.descriptor(5,name));assert.equal(descriptor,undefined);}finally{a.release(descriptor);}}finally{a.release(key);}}}finally{a.release(mode);}
}
function checkCalls(a){
 a.auto(1);const string=a.string('12'),number=a.number(2),mode=a.number(0),key=a.string('isFinite');
 try{for(let i=0;i<4;i++){
  assert.equal(value(a,'has',[mode,key]),true);assert.deepEqual(value(a,'cached'),js.cached());
  assert.equal(value(a,'call-number',[string]),js.call_number('12'));assert.equal(value(a,'call-string',[number]),js.call_string(2));
  assert.equal(value(a,'call-finite',[number]),js.call_finite(2));assert.equal(value(a,'static-finite',[number]),js.static_finite(2));
  assert.equal(value(a,'call-symbol'),js.call_symbol());assert.equal(value(a,'call-error'),js.call_error());assert.deepEqual(value(a,'effects'),js.effects());
  for(let effect=0;effect<3;effect++){const n=a.number(effect);try{assert.equal(value(a,'reflection-effects',[n]),oracle.effects[effect]);}finally{a.release(n);}}
  a.collect();assert.equal(a.stats().frameDepth,0);
 }}finally{a.release(string);a.release(number);a.release(mode);a.release(key);}
}
function numberFromRecord(record){if(record.nan)return NaN;const bytes=new ArrayBuffer(8),view=new DataView(bytes);view.setUint32(0,record.words[0],true);view.setUint32(4,record.words[1],true);return view.getFloat64(0,true);}
function sourcePrimitive(a,value){return typeof value==='string'?a.string(value):typeof value==='number'?a.number(value):value;}
function checkStandardStatics(a){
 a.auto(1);
 for(let index=0;index<constantNames.length;index++){
  const key=a.string(constantNames[index]),mode=a.number(0);let output,snapshot;
  try{output=a.invoke('static-constant',[key]);assert(Object.is(a.readNumber(output),numberFromRecord(oracle.constants[index])));
   snapshot=a.invoke('reflection-snapshot',[mode,key]);const descriptor=JSON.parse(a.readString(snapshot))[3];
   assert.equal(descriptor[0],'descriptor');assert.equal(descriptor[1],true);assert.deepEqual(descriptor.slice(3,6),[false,false,false]);
  }finally{a.release(key);a.release(mode);if(output)a.release(output);if(snapshot)a.release(snapshot);}
 }
 for(let mode=0;mode<2;mode++){
  const n=a.number(mode),cases=mode===0?integerCases:floatCases.map(input=>[input,undefined]);
  try{for(let index=0;index<cases.length;index++){
   const input=sourcePrimitive(a,cases[index][0]),radix=sourcePrimitive(a,cases[index][1]);let output;
   try{output=a.invoke(index%2===0?'static-number':'detached-number',[n,input,radix]);assert(Object.is(a.readNumber(output),numberFromRecord(mode===0?oracle.ints[index]:oracle.floats[index])),mode+'/'+index);}
   finally{a.release(input);a.release(radix);if(output)a.release(output);}
  }}finally{a.release(n);}
 }
 const codePoint=a.number(1);
 try{for(const invalid of[-1,.5,0x110000,NaN,Infinity]){
  const item=a.number(invalid),argv=a.sourceArray([item]);
  try{assert.throws(()=>a.invoke('static-string',[codePoint,argv]),RangeError);assert.equal(a.stats().frameDepth,0);}
  finally{a.release(item);a.release(argv);}
 }}finally{a.release(codePoint);}
 for(let mode=0;mode<oracle.codeEffects.length;mode++){
  const n=a.number(mode);try{assert.equal(value(a,'code-effects',[n]),oracle.codeEffects[mode]);}finally{a.release(n);}
 }
 for(let mode=0;mode<2;mode++){
  const n=a.number(mode),cases=mode===0?stringCases:stringCases.filter((_,index)=>index!==1);
  try{for(const values of cases){const parts=values.map(value=>a.number(value)),input=a.sourceArray(parts);let output;
   try{output=a.invoke('static-string',[n,input]);assert.equal(a.readString(output),(mode===0?String.fromCharCode:String.fromCodePoint)(...values));}
   finally{for(const part of parts)a.release(part);a.release(input);if(output)a.release(output);}
  }}finally{a.release(n);}
 }
 for(const [name,expected]of[['static-order',oracle.staticOrder],['raw-order',oracle.rawOrder]])for(let mode=0;mode<expected.length;mode++){
  const n=a.number(mode);try{assert.equal(value(a,name,[n]),expected[mode]);}finally{a.release(n);}
 }
 assert.equal(value(a,'restricted-descriptors'),standardRestrictedDescriptors);
 assert.equal(value(a,'static-shadow'),oracle.shadow);
 assert.equal(value(a,'parser-aliases'),oracle.aliases);
 a.collect();assert.equal(a.stats().frameDepth,0);
}
function checkErrorProfile(a){
 assert.deepEqual(lowered.descriptor.errorReflection,{standardOwnPropertyNames:standardErrorOwnNames,stack:'unsupported',hostExtensions:[]});
 const mode=a.number(3);a.auto(1);
 try{
  // The independent runtime exposes its complete standard shape, not a filtered
  // copy of Node's host-specific key list. Node's full original shape is retained.
  assert.equal(value(a,'reflection-shape',[mode]),standardErrorShape);
  const names=a.invoke('names',[mode]);try{assert.deepEqual(read(a,names),standardErrorOwnNames);}finally{a.release(names);}
  for(const key of standardErrorOwnNames){const field=a.string(key);try{
   const descriptor=a.invoke('descriptor',[mode,field]);try{
    const writable=a.string('writable'),enumerable=a.string('enumerable'),configurable=a.string('configurable');
    try{assert.equal(a.invoke('descriptor-field',[descriptor,writable]),false);assert.equal(a.invoke('descriptor-field',[descriptor,enumerable]),false);assert.equal(a.invoke('descriptor-field',[descriptor,configurable]),key!=='prototype');}
    finally{a.release(writable);a.release(enumerable);a.release(configurable);}
   }finally{a.release(descriptor);}
  }finally{a.release(field);}}
  const absent=JSON.stringify([['value',['undefined']],false,false,['undefined']]);
  for(const key of errorStackExtensions){const field=a.string(key);try{
   assert.equal(value(a,'reflection-snapshot',[mode,field]),absent,'independent runtime does not claim '+key);
   assert.equal(typeof oracle.errorExtensions.fields[key],'string');
  }finally{a.release(field);}}
  const stack=a.invoke('error-stack-observation');try{assert.deepEqual(read(a,stack),['unsupported','ELI-RT0003']);}finally{a.release(stack);}
  assert.deepEqual(oracle.errorExtensions.completeOwnNames,JSON.parse(oracle.builtins[3].shape)[1]);
 }finally{a.release(mode);}
 a.collect();assert.equal(a.stats().frameDepth,0);
}
function checkWasm(check){const a=instantiateManagedRuntime(bytes,{initializeModule:false});try{a.auto(1);a.initializeModule();check(a);}finally{finish(a);}}
test('manual initialization retains its capacity refusal and complete cleanup while the same bytes initialize under collecting GC',()=>{
 const unpressured=instantiateManagedRuntime(bytes,{initializeModule:false});
 try{
  unpressured.initializeModule();assert.equal(unpressured.stats().collections,0);
  assert(unpressured.live()>0);assert.equal(unpressured.stats().frameDepth,0);
  unpressured.collect();assert.deepEqual(value(unpressured,'cached'),js.cached());
 }finally{finish(unpressured);}
 // Released handles remain garbage until manual collection. Make the negative
 // premise actual slot pressure rather than depending on eager realm waste.
 const fillGarbage=a=>{for(let i=0;i<1024;i++){const item=a.number(7);a.release(item);}assert.equal(a.live(),1024);assert.equal(a.stats().collections,0);};
 const manual=instantiateManagedRuntime(bytes,{initializeModule:false});
 try{
  fillGarbage(manual);
  assert.throws(()=>manual.initializeModule(),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
  assert.equal(manual.live(),1024);assert.equal(manual.stats().collections,0);assert.equal(manual.stats().frameDepth,0);
  manual.collect();assert.equal(manual.live(),0);assert.equal(manual.stats().frameDepth,0);
 }finally{finish(manual);}
 const collecting=instantiateManagedRuntime(bytes,{initializeModule:false});
 try{
  fillGarbage(collecting);
  collecting.auto(1);collecting.initializeModule();
  assert.deepEqual(value(collecting,'cached'),js.cached());assert.equal(collecting.stats().frameDepth,0);
  collecting.collect();assert(collecting.live()>0);assert(collecting.live()<1024);
 }finally{finish(collecting);}
});
test('a host missing a represented disposal symbol rejects transfer and preserves caller roots and supported identities',async()=>{
 const path=resolve('tools/backends/managed-host.mjs'),original=await readFile(path,'utf8'),needle='Symbol.matchAll,Symbol.dispose,Symbol.asyncDispose,';
 assert(original.includes(needle));let source=original.replace(needle,'Symbol.matchAll,undefined,undefined,');
 // Only this instance's host symbol table models the missing capability. The
 // compiled bytes and its full runtime/constructor properties stay unchanged.
 for(const relative of['../runtime/unicode-case-profiles.mjs','./managed-source-view.mjs','../../platform/http.mjs'])
  source=source.replaceAll(JSON.stringify(relative),JSON.stringify(pathToFileURL(resolve('tools/backends',relative)).href)).replaceAll("'"+relative+"'",JSON.stringify(pathToFileURL(resolve('tools/backends',relative)).href));
 const {createManagedHostRuntime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,memory={view:()=>new DataView(e.memory.buffer),writeBytes:(offset,bytes)=>new Uint8Array(e.memory.buffer,offset,bytes.length).set(bytes),readBytes:(offset,length)=>new Uint8Array(e.memory.buffer,offset,length).slice()};
 const a=createManagedHostRuntime(e,lowered.descriptor,memory,{initializeModule:false}),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 try{
  a.auto(1);a.initializeModule();
  for(const identifier of[13,14]){
   const index=a.number(identifier),symbol=a.invoke('symbol-static',[index]);
   try{assert.throws(()=>a.toHostValue(symbol),error=>error instanceof TypeError&&error.message==='unknown managed well-known Symbol');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.collect();assert.equal(value(a,'symbol-description',[symbol]),'Symbol.'+wellKnownSymbolNames[identifier]);}
   finally{a.release(index);a.release(symbol);}
  }
  const index=a.number(0),symbol=a.invoke('symbol-static',[index]);
  try{assert.equal(a.toHostValue(symbol),Symbol.iterator);}finally{a.release(index);a.release(symbol);}
 }finally{a.leaveFrame(frame);a.release(held);finish(a);}
});
test('Given first-class standard constructors when reflected then native reads descriptors key order and prototypes match with an explicit standard Error profile',()=>checkWasm(checkBuiltins));
test('Given a standard Error profile when host stack extensions are observed then Node observations stay complete and independent absence and stack refusal remain explicit',()=>checkWasm(checkErrorProfile));
test('Given an ordinary source function when missing own properties are read then absence remains exact and no builtin flag leaks',()=>checkWasm(checkOrdinary));
test('Given cached first-class builtins when reflected and called then identities actual receivers argument effects and getter error order remain intact',()=>checkWasm(checkCalls));
test('Given standard Number and String static methods when borrowed and converted then exact native numbers UTF16 raw getter order and restricted accessors match',()=>checkWasm(checkStandardStatics));
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given the identical source fixture in a true native library when all three property and call contracts run then every WASM check is retained',async()=>{
 const path=resolve(directory,'function-properties.dylib');await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));
 const a=await instantiateNativeManagedRuntime(path,lowered,{initializeModule:false});
 try{a.auto(1);a.initializeModule();checkBuiltins(a);checkErrorProfile(a);checkOrdinary(a);checkCalls(a);checkStandardStatics(a);}finally{try{finish(a);}finally{a.close();}}
},120000);
