import{beforeAll,afterAll,test}from'bun:test';import assert from'node:assert/strict';import{readFile,mkdtemp,rm,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{tmpdir}from'node:os';import{pathToFileURL}from'node:url';import{spawnSync}from'node:child_process';import{buildBackends}from'../tools/backends/build.mjs';import{instantiateManagedRuntime}from'../tools/backends/managed-runtime.mjs';import{instantiateNativeManagedRuntime}from'../tools/backends/native-managed-runtime.mjs';
const source=`(defun fixed () 7) (defun function-value () fixed) (defun closure () (lambda () 9))
 (defun member (value key) (aref value key)) (defun own (value key) (object-has? value key))
 (defun fallback (value key trace) (get value key (progn (js-call trace :push "default") 19)))
 (defun install (key value) (put (js* "Object.prototype") key value))
 (defun converted (value trace own)
  (let ((key (js-object))) (put key (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) "missing"))
   (if own (object-has? value key) (aref value key))))
 (defun abrupt (value trace) (let ((key (js-object))) (put key (js* "Symbol.toPrimitive") (lambda (hint) (throw trace)))
  (try (aref value key) (catch error (Object/is error trace)))))
 (defun object-own (value key) (Object/hasOwn value key))
 (defun describe (value key) (Object/getOwnPropertyDescriptor value key))
 (defun names (value) (Object/getOwnPropertyNames value))
 (defun proto (value) (Object/getPrototypeOf value))
 (defun convert-install (value field replacement trace)
  (let ((key (js-object)))
   (put key (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) (put (js* "Object.prototype") field replacement) field))
   (aref value key)))
 (defun normalized (value owner)
  (cond ((= value undefined) (js-array "undefined")) ((= value nil) (js-array "null"))
   ((= (value-type value) "function") (js-array "function" (get value :name) (get value :length)
     (Object/hasOwn value "prototype") (Object/is value (get globalThis/Function :prototype))))
   ((= (value-type value) "object") (js-array "object" (Object/is value (get owner :prototype))))
   ((= (value-type value) "symbol") (js-array "symbol" (globalThis/String value))) (t (js-array "value" value))))
 (defun reflection (value key)
  (let ((descriptor (Object/getOwnPropertyDescriptor value key)))
   (JSON/stringify (js-array
    (try (js-array "value" (normalized (aref value key) value)) (catch error (js-array "throw" (get error :name))))
    (object-has? value key) (Object/hasOwn value key)
    (if (= descriptor undefined) (js-array "undefined")
     (js-array "descriptor" (Object/hasOwn descriptor "value") (normalized (get descriptor :value) value)
      (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)
      (normalized (get descriptor :get) value) (normalized (get descriptor :set) value)))))))
 (defun reflection-shape (value)
  (let ((symbols (js-array)) (symbol-keys (Object/getOwnPropertySymbols value)) (symbol-index 0))
   (while (< symbol-index (js-length symbol-keys))
    (js-call symbols :push (globalThis/String (aref symbol-keys symbol-index)))
    (setq symbol-index (1+ symbol-index)))
   (JSON/stringify (js-array (Object/keys value) (Object/getOwnPropertyNames value) symbols
    (Object/is (Object/getPrototypeOf value) (get globalThis/Function :prototype))
    (normalized (Object/getPrototypeOf value) value)))))
 (defun function-constructor () globalThis/Function)
 (defun native-shadow (value)
  (let ((method (get value :toString)))
   (js-array (value-type method) (Object/is method (get (get globalThis/Function :prototype) :toString)))))
 (export function-value closure member own object-own describe names proto fallback install converted abrupt convert-install reflection reflection-shape function-constructor native-shadow)`;
let directory,b,rt,p,bytes,js,oracle,nativeLowered,nativePath;
const reflectedKeys=['name','length','prototype','caller','arguments','call','apply','bind','constructor','toString','__proto__','kind','missing'];
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-function-properties-'));b=await buildBackends({outputRoot:directory});rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');p=b.compiler.compile_ir_string(source,'functions.eli');bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const javascript=b.compiler.emit_ir_string(p),reference=resolve(directory,'functions-reference.mjs');await writeFile(reference,javascript);js=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
 const script=`import assert from 'node:assert/strict';const m=await import(process.argv[1]);
 function norm(value,owner){if(value===undefined)return['undefined'];if(value===null)return['null'];if(typeof value==='function')return['function',value.name,value.length,Object.hasOwn(value,'prototype'),value===Function.prototype];if(typeof value==='object')return['object',value===owner.prototype];if(typeof value==='symbol')return['symbol',String(value)];return['value',value];}
 const output=[];
 assert.equal(m.function_constructor(),Function);
 const constructorPrototype=Object.getOwnPropertyDescriptor(Function,'prototype');
 assert.equal(constructorPrototype.value,Function.prototype);assert.equal(constructorPrototype.writable,false);assert.equal(constructorPrototype.enumerable,false);assert.equal(constructorPrototype.configurable,false);
 for(const f of[m.function_value(),m.closure(),Function]){
  const fields=Object.create(null);for(const key of ${JSON.stringify(reflectedKeys)}){
   let reading;try{reading=['value',norm(f[key],f)];}catch(error){reading=['throw',error.name];}
   const d=Object.getOwnPropertyDescriptor(f,key),descriptor=d===undefined?['undefined']:['descriptor',Object.hasOwn(d,'value'),norm(d.value,f),d.writable,d.enumerable,d.configurable,norm(d.get,f),norm(d.set,f)];
   fields[key]=JSON.stringify([reading,Object.hasOwn(f,key),Object.hasOwn(f,key),descriptor]);assert.equal(m.reflection(f,key),fields[key],key);
  }
  const shape=JSON.stringify([Object.keys(f),Object.getOwnPropertyNames(f),Object.getOwnPropertySymbols(f).map(String),Object.getPrototypeOf(f)===Function.prototype,norm(Object.getPrototypeOf(f),f)]);
  assert.equal(m.reflection_shape(f),shape);assert.deepEqual(m.native_shadow(f),['function',true]);output.push({fields,shape});
 }
 assert.throws(()=>m.function_value().caller,TypeError);assert.throws(()=>m.function_value().arguments,TypeError);
 assert.equal(Object.hasOwn(m.function_value(),'prototype'),true);assert.equal(Object.hasOwn(m.closure(),'prototype'),false);
 console.log(JSON.stringify(output));`;
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(reference).href],{encoding:'utf8',timeout:30000});assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr||child.stdout);oracle=JSON.parse(child.stdout);
 if(process.platform==='darwin'&&process.arch==='arm64'){nativeLowered=b.managed.lower_managed_program(p,rt);nativePath=resolve(directory,'functions.dylib');await writeFile(nativePath,Uint8Array.from(b.native.emit_typed_native_memory_library(nativeLowered.typed,'arm64-macos')));}
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function read(a,value){if(value?.kind===5)return a.readString(value);if(value?.kind===4)return a.readNumber(value);if(value?.kind===14)return Array.from({length:a.length(value)},(_,i)=>{const v=a.get(value,i);try{return read(a,v);}finally{a.release(v);}});return value;}
function finish(a,roots){for(const v of roots)a.release(v);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function family(a){a.auto(1);const f=a.invoke('function-value'),g=a.invoke('closure'),trace=a.sourceArray([]),reference=()=>7;for(const value of[f,g]){for(const name of['kind','missing','0','']){const key=a.string(name);assert.equal(a.invoke('member',[value,key]),js.member(reference,name));assert.equal(a.invoke('own',[value,key]),js.own(reference,name));a.release(key);}for(const own of[false,true]){const expected=[];assert.equal(a.invoke('converted',[value,trace,own]),js.converted(reference,expected,own));assert.deepEqual(read(a,trace),expected);a.resize(trace,0);}assert.equal(a.invoke('abrupt',[value,trace]),true);const key=a.string('absent'),out=a.invoke('fallback',[value,key,trace]);assert.equal(a.readNumber(out),19);assert.deepEqual(read(a,trace),['default']);a.resize(trace,0);a.release(key);a.release(out);}finish(a,[f,g,trace]);}
test('live named and closure functions preserve ordinary missing reads own predicates key hints and defaults under collecting GC',()=>family(instantiateManagedRuntime(bytes)));

function reflectionFamily(a){
 a.auto(1);const functions=[a.invoke('function-value'),a.invoke('closure'),a.invoke('function-constructor')];
 try{for(let index=0;index<functions.length;index++){
  const f=functions[index];
  for(const name of reflectedKeys){const key=a.string(name);let out;
   try{out=a.invoke('reflection',[f,key]);assert.equal(a.readString(out),oracle[index].fields[name],index+'/'+name);}
   finally{if(out)a.release(out);a.release(key);}}
  const shape=a.invoke('reflection-shape',[f]);try{assert.equal(a.readString(shape),oracle[index].shape);}finally{a.release(shape);}
  const shadow=a.invoke('native-shadow',[f]);try{assert.deepEqual(read(a,shadow),['function',true]);}finally{a.release(shadow);}
  a.collect();assert.equal(a.stats().frameDepth,0);
 }}finally{for(const f of functions)a.release(f);}
}
test('source named and closure functions expose exact native reads descriptors key order prototypes and strict caller errors',()=>{
 const a=instantiateManagedRuntime(bytes);try{reflectionFamily(a);}finally{finish(a,[]);}
});
test('real Object prototype data participates after key conversion while canonical Function methods shadow deeper data',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const f=a.invoke('function-value'),value=a.number(-0),key=a.string('__function_inherited'),valueOf=a.string('valueOf'),toString=a.string('toString');
 for(const property of[key,valueOf,toString]){const out=a.invoke('install',[property,value]);a.release(out);}a.collect();for(const property of[key,valueOf]){const out=a.invoke('member',[f,property]);assert(Object.is(a.readNumber(out),-0));a.release(out);assert.equal(a.invoke('own',[f,property]),false);assert.equal(a.invoke('object-own',[f,property]),false);}const native=a.invoke('native-shadow',[f]);assert.deepEqual(read(a,native),['function',true]);a.release(native);
 const property='__function_inherited',saved=Object.getOwnPropertyDescriptor(Object.prototype,property);let expected;try{Object.defineProperty(Object.prototype,property,{value:-0,configurable:true});expected=js.member(()=>0,property);assert.equal(js.own(()=>0,property),false);}finally{if(saved)Object.defineProperty(Object.prototype,property,saved);else delete Object.prototype[property];}const result=a.invoke('member',[f,key]);assert(Object.is(a.readNumber(result),expected));a.release(result);finish(a,[f,value,key,valueOf,toString]);
});
test('raw ABI builtin marking is allocation-free and idempotent while values with no function metadata remain explicitly invalid for reflection',async()=>{
 const runtimeSource=await readFile('bootstrap/runtime/memory.eli','utf8'),raw=b.compiler.compile_ir_string(runtimeSource+'\n(export value-function-new)','function-abi.eli'),binary=Uint8Array.from(b.wasm.emit_memory_wasm(raw)),e=new WebAssembly.Instance(new WebAssembly.Module(binary)).exports,h=e['heap-new'](64,8192,65536),call=(name,...args)=>e[name](h,...args)>>>0;
 const fn=call('value-function-new',7,0);assert(fn);call('heap-pin',fn);const args=call('value-refs',7,2);call('heap-pin',args);call('value-set',args,0,fn);const before=[call('heap-live'),call('heap-used')];assert.equal(call('value-function-mark-builtin',fn),fn);assert.equal(call('value-function-mark-builtin',fn),fn);assert.deepEqual([call('heap-live'),call('heap-used')],before);call('heap-auto',1);
 for(const text of['missing','kind','isFinite','name']){const key=call('value-string',text.length);call('heap-pin',key);for(let i=0;i<text.length;i++)call('value-unit-set',key,i,text.charCodeAt(i));call('value-seal',key);call('value-set',args,1,key);for(const [name,params]of[['value-property-get',[fn,key,0]],['value-object-has',[fn,key]],['value-object-properties',[args,2,1]],['value-object-reflection',[args,2,2]]]){assert.equal(call(name,...params),0);assert.equal(e['last-error'](),3,name+':'+text);assert.equal(call('frame-depth'),0);}call('heap-release',key);}
 assert.equal(call('value-function-mark-builtin',0xffffffff),0);assert.equal(e['last-error'](),1);call('heap-release',fn);call('heap-release',args);call('heap-collect');assert.equal(call('heap-live'),0);
});
test('capacity errors and stale handles preserve a live function and caller roots and permit a successful retry',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:8192,maxBytes:65536}),f=a.invoke('function-value'),key=a.string('missing'),held=a.number(-0),frame=a.frame(1),fillers=[];a.frameSet(frame,0,held);a.auto(1);while(a.live()<64)fillers.push(a.number(7));assert.throws(()=>a.invoke('member',[f,key]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));for(const v of fillers)a.release(v);a.collect();assert.equal(a.invoke('member',[f,key]),undefined);const stale=a.invoke('closure');a.release(stale);a.collect();assert.throws(()=>a.invoke('member',[stale,key]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');a.leaveFrame(frame);finish(a,[f,key,held]);
});
test('a real property-helper trap unwinds callee roots and preserves a live function for retry',async()=>{
 // The fixture's one-shot flag uses reserved low memory, not random-seed word20.
 const original=await readFile('bootstrap/runtime/memory.eli','utf8'),signature='(defun heap-function-property (heap function key nullish own)',modified=original.replace(signature,signature+' (when (and (= own 0) (= (load-u32 64) 0)) (store-u32 64 1) (load-u32 4294967295))');assert.notEqual(modified,original);const trap=b.compiler.compile_ir_string(modified,'function-trap.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,trap)));a.auto(1);const f=a.invoke('function-value'),key=a.string('missing'),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);assert.throws(()=>a.invoke('member',[f,key]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert.equal(a.invoke('member',[f,key]),undefined);a.leaveFrame(frame);finish(a,[f,key,held]);
});
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('the same ordinary-function property and complete reflection families execute through actual native machine code',async()=>{const a=await instantiateNativeManagedRuntime(nativePath,nativeLowered,{maxSlots:8192,initialBytes:262144,maxBytes:16777216});try{reflectionFamily(a);family(a);}finally{a.close();}});

test('ToPropertyKey hooks update inherited fields before the function read observes them exactly once',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const f=a.invoke('function-value'),field=a.string('__function_converted'),replacement=a.number(23),trace=a.sourceArray([]),out=a.invoke('convert-install',[f,field,replacement,trace]);assert.equal(a.readNumber(out),23);assert.deepEqual(read(a,trace),['string']);const property='__function_converted',saved=Object.getOwnPropertyDescriptor(Object.prototype,property),expectedTrace=[];let expected;try{expected=js.convert_install(()=>0,property,23,expectedTrace);}finally{if(saved)Object.defineProperty(Object.prototype,property,saved);else delete Object.prototype[property];}assert.equal(a.readNumber(out),expected);assert.deepEqual(read(a,trace),expectedTrace);finish(a,[f,field,replacement,trace,out]);
});
test('an abrupt key conversion wins over a real inherited-read trap with caller ownership preserved',async()=>{
 const original=await readFile('bootstrap/runtime/memory.eli','utf8'),signature='(defun heap-object-read-data (heap object key)';
 // Fault only the actual represented inherited field read, after conversion.
 // Installation and unrelated native metadata must retain their normal path.
 const modified=original.replace(signature,signature+' (when (and (> object 3) (= (load-u32 (heap-block heap object)) 13) (/= (word-and (load-u32 (+ (heap-block heap object) 24)) 4096) 0) (= (heap-key-is heap key 7 6881389 7536755 7209065 103 0 0 0 0 0 0) 1) (= (load-u32 64) 0)) (store-u32 64 1) (load-u32 4294967295))');assert.notEqual(modified,original);
 const trap=b.compiler.compile_ir_string(modified,'function-inherited-trap.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,trap)));a.auto(1);const f=a.invoke('function-value'),key=a.string('missing'),trace=a.sourceArray([]),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);const set=a.invoke('install',[key,true]);a.release(set);assert.equal(a.invoke('abrupt',[f,trace]),true);assert.equal(a.stats().frameDepth,1);assert.throws(()=>a.invoke('member',[f,key]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert.equal(a.invoke('member',[f,key]),true);assert.equal(a.stats().frameDepth,1);a.leaveFrame(frame);finish(a,[f,key,trace,held]);
});
