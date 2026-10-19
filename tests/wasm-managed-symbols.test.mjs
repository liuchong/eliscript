import {beforeAll,afterAll,afterEach,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime,family;
// This order is the existing runtime/host identity ABI, not property order.
const wellKnownSymbolNames=['iterator','toPrimitive','match','replace','search','split','species','isConcatSpreadable','toStringTag','hasInstance','asyncIterator','unscopables','matchAll','dispose','asyncDispose'];
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-symbols-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');family=await readFile('tests/fixtures/wasm-managed-symbols.eli','utf8');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
// Each case has already checked its managed roots. Release only unreachable
// compiler IR, emitted modules and engine code retained across completed cases.
afterEach(()=>{Bun.gc(true);});
async function compiled(source=family,options,rt=runtime){const p=b.compiler.compile_ir_string('(defconst symbol-marker 1)\n'+source,'symbols.eli'),before=JSON.stringify(p),bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.equal(JSON.stringify(p),before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return{a,bytes};}
function text(a,v){const result=v?.kind===5?a.readString(v):v;a.release(v);return result;}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const x=a.get(v,i);try{return read(a,x);}finally{a.release(x);}});return v;}
function finish(a,values=[]){values.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function inSymbolCase(a,name,operation){try{return operation();}catch(error){
 try{const stats=a.stats();Object.defineProperty(error,'symbolCase',{value:{name,stats,statsJSON:JSON.stringify(stats)},enumerable:true,configurable:true});}catch{}
 throw error;
}}
function rawSymbolHeapSummary(e,heap){
 const view=new DataView(e.memory.buffer),control=view.getUint32(heap+16,true),pool=view.getUint32(control+4,true),base=view.getUint32(pool+16,true),slots=view.getUint32(control+12,true),kinds=Object.create(null),builtins=Object.create(null);
 for(let slot=1;slot<=slots;slot++){
  const entry=base+slot*24;if(!(view.getUint32(entry+4,true)&1))continue;
  const block=base+view.getUint32(entry+8,true),kind=view.getUint32(block,true);kinds[kind]=(kinds[kind]??0)+1;
  if(kind===18){const info=view.getUint32(block+24,true);if(info>3){const record=base+(info&1048575)*24,p=base+view.getUint32(record+8,true),builtin=view.getUint32(p+20,true);builtins[builtin]=(builtins[builtin]??0)+1;}}
 }
 return{live:view.getUint32(control+28,true),used:view.getUint32(control+20,true),kinds,builtins};
}
test('BigInt parsing handles ordinary decimal and empty strings independently of radix prefixes and preserves roots across invalid input and GC',async()=>{
 const valid=[['','0'],[' ','0'],['0','0'],['1','1'],['-1','-1'],['+1','1'],['-0','0'],['00','0'],['001','1'],['  -42  ','-42'],['0x2a','42'],['0XFF','255'],['0o77','63'],['0b101','5'],['9007199254740993','9007199254740993']];
 const invalid=['+','-','1n','1.0','Infinity','0x','-0x1','+0b1','0b2','12z'];
 // StringIntegerLiteral requires decimal digits after a sign. An independent
 // Node oracle keeps Bun's sign-only acceptance from changing this contract.
 const oracle=spawnSync('node',['--input-type=module','-e',`import{readFileSync}from'node:fs';const data=JSON.parse(readFileSync(0,'utf8'));const parse=text=>{try{return{value:BigInt(text).toString()};}catch(error){return{error:error.name};}};process.stdout.write(JSON.stringify({valid:data.valid.map(parse),invalid:data.invalid.map(parse)}));`],
  {input:JSON.stringify({valid:valid.map(([text])=>text),invalid}),encoding:'utf8',timeout:10000});
 assert.equal(oracle.status,0,oracle.stderr);assert.ifError(oracle.error);
 assert.deepEqual(JSON.parse(oracle.stdout),{valid:valid.map(([,value])=>({value})),invalid:invalid.map(()=>({error:'SyntaxError'}))});
 const hostDifferences=[];
 for(const text of invalid){try{hostDifferences.push({text,value:BigInt(text).toString()});}catch(error){if(!(error instanceof SyntaxError))hostDifferences.push({text,error:error.name});}}
 if(hostDifferences.length)console.info('[BigInt host parser differences]',JSON.stringify(hostDifferences));
 const {a,bytes}=await compiled('(defun identity (value) value) (export identity)');finish(a);
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
 const heap=e['heap-new'](128,16384,1048576);
 const call=(name,...args)=>{const result=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return result;};
 const frame=call('frame-new',4),zero=call('value-number',0,0x80000000);call('frame-set',frame,0,zero);call('heap-auto',1);
 function input(text){
  const value=call('value-string',text.length);call('frame-set',frame,1,value);
  for(let index=0;index<text.length;index++)call('value-unit-set',value,index,text.charCodeAt(index));
  call('value-seal',value);return value;
 }
 function roots(){
  call('heap-collect');assert.equal(call('frame-depth'),1);
  const saved=call('frame-get',frame,0),address=call('value-data',saved,4);
  assert(Object.is(new DataView(e.memory.buffer).getFloat64(address,true),-0));
 }
 try{
  for(const [text,expected] of valid){
   const value=call('value-bigint-parse',input(text));
   assert(value>3,text);assert.equal(call('value-kind',value),34,text);call('frame-set',frame,2,value);
   const rendered=call('value-bigint-to-string',value,10);call('frame-set',frame,3,rendered);
   assert.equal(call('value-length',rendered),expected.length,text);
   for(let index=0;index<expected.length;index++)assert.equal(call('value-unit-get',rendered,index),expected.charCodeAt(index),text);
   roots();call('frame-set',frame,1,0);call('frame-set',frame,2,0);call('frame-set',frame,3,0);
  }
  for(const text of invalid){
   assert.equal(e['value-bigint-parse'](heap,input(text)),0,text);assert.equal(e['last-error'](),3,text);
   roots();call('frame-set',frame,1,0);
  }
  const recovered=call('value-bigint-parse',input('1'));assert.equal(call('value-kind',recovered),34);
  call('frame-set',frame,2,recovered);roots();
 }finally{call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);}
},120000);
test('existing own data writes preserve attributes and refusal semantics while accessors receivers holes lengths and key effects use ordinary Set',async()=>{
 const source=`
 (defun data-slot (array locked)
  (let* ((target (if array (js-array -0.0) (js-object :x -0.0))) (key (if array "0" "x")))
   (Object/defineProperty target key (js-object :value -0.0 :writable (= locked 0) :enumerable false :configurable false))
   (if (= locked 2) (Object/freeze target) (Object/preventExtensions target))
   (let* ((first (Reflect/set target key 7)) (second (Reflect/set target key -0.0))
          (descriptor (Object/getOwnPropertyDescriptor target key)))
    (js-array first second (Object/is (get target key) -0.0) (get descriptor :writable)
     (get descriptor :enumerable) (get descriptor :configurable) (Object/hasOwn target key)))))
 (defun accessor-slot (array)
  (let* ((target (if array (js-array 0) (js-object :x 0))) (key (if array "0" "x"))
         (count 0) (saved nil) (getter (lambda () (throw false)))
         (setter (lambda (value) (setq count (1+ count)) (setq saved value))))
   (Object/defineProperty target key (js-object :get getter :set setter :enumerable false :configurable t))
   (let* ((written (Reflect/set target key 7)) (descriptor (Object/getOwnPropertyDescriptor target key)))
    (js-array written count (Object/is saved 7) (Object/is (get descriptor :get) getter)
     (Object/is (get descriptor :set) setter) (get descriptor :enumerable) (get descriptor :configurable)))))
 (defun receiver-slot ()
  (let ((target (js-object :x -0.0)) (receiver (js-object)))
   (Object/defineProperty target "x" (js-object :value -0.0 :writable t :enumerable false :configurable false))
   (let* ((written (Reflect/set target "x" 7 receiver)) (descriptor (Object/getOwnPropertyDescriptor receiver "x")))
    (js-array written (Object/is (get target :x) -0.0) (get receiver :x)
     (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)))))
 (defun hole-slot ()
  (let* ((target (js-array 0)) (prototype (js-object)) (count 0) (saved nil))
   (Reflect/deleteProperty target "0")
   (Object/defineProperty prototype "0" (js-object :set (lambda (value) (setq count (1+ count)) (setq saved value)) :configurable t))
   (Object/setPrototypeOf target prototype)
   (let ((written (Reflect/set target "0" 7)))
    (js-array written count (Object/is saved 7) (Object/hasOwn target "0") (js-length target)))))
 (defun length-slot ()
  (let ((target (js-array 0 1)))
   (Object/defineProperty target "1" (js-object :configurable false))
   (let ((written (Reflect/set target "length" 0))) (js-array written (js-length target) (get target 1)))))
 (defun key-effects ()
  (let* ((target (js-array 0)) (order 0)
         (key (js-object :toString (lambda () (setq order (+ (* order 10) 2)) "0"))))
   (let ((written (Reflect/set target key (progn (setq order 1) 7))))
    (js-array written order (get target 0)))))
 (export data-slot accessor-slot receiver-slot hole-slot length-slot key-effects)`;
 const program=b.compiler.compile_ir_string(source,'own-data-write.eli');
 const reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));
 const {a}=await compiled(source);const zero=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,zero);
 function check(name,args=[]){
  const owned=args.filter(value=>typeof value==='number').map(value=>a.number(value));let index=0;
  const input=args.map(value=>typeof value==='number'?owned[index++]:value);let result;
  try{result=a.invoke(name,input);assert.deepEqual(read(a,result),reference[name.replaceAll('-','_')](...args));a.collect();
   assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(zero),-0));}
  finally{if(result!==undefined)a.release(result);owned.forEach(value=>a.release(value));}
 }
 try{
  for(const array of [false,true]){for(const locked of [0,1,2])check('data-slot',[array,locked]);check('accessor-slot',[array]);}
  for(const name of ['receiver-slot','hole-slot','length-slot','key-effects'])check(name);
 }finally{a.leaveFrame(frame);finish(a,[zero]);}
},120000);
test('cold Symbol creation defers unobserved members while every first reflection materializes the same complete realm and retries after capacity refusal',async()=>{
 const source=`
 (defun constructor () (js* "Symbol"))
 (defun same (left right) (Object/is left right))
 (defun first-names () (JSON/stringify (Object/getOwnPropertyNames (js* "Symbol"))))
 (defun prototype-links ()
  (let* ((constructor (js* "Symbol")) (prototype (get constructor :prototype)))
   (JSON/stringify (js-array
    (Object/is (Object/getPrototypeOf constructor) (get globalThis/Function :prototype))
    (Object/is (get prototype :constructor) constructor)))))
 (defun description-shape ()
  (let ((descriptor (Object/getOwnPropertyDescriptor (get (js* "Symbol") :prototype) "description")))
   (JSON/stringify (js-array (let ((getter (get descriptor :get))) (js* "typeof getter")) (get descriptor :set)
    (get descriptor :enumerable) (get descriptor :configurable)))))
 (defun description-call ()
  (let* ((constructor (js* "Symbol")) (symbol (funcall constructor "probe"))
         (descriptor (Object/getOwnPropertyDescriptor (get constructor :prototype) "description")))
   (js-call (get descriptor :get) :call symbol)))
 (defun string-call ()
  (let ((constructor (js* "Symbol")))
   (js-call (get (get constructor :prototype) :toString) :call (funcall constructor "probe"))))
 (defun primitive-call ()
  (let* ((constructor (js* "Symbol")) (symbol (funcall constructor "probe")))
   (Object/is (js-call (get (get constructor :prototype) (js* "Symbol.toPrimitive")) :call symbol) symbol)))
 (defun registry-call ()
  (Object/is (funcall (get (js* "Symbol") :for) "shared") (funcall (js* "Symbol.for") "shared")))
 (defun registry-dynamic () (get (funcall (get (js* "Symbol") :for) "shared") :description))
 (defun registry-static () (get (funcall (js* "Symbol.for") "shared") :description))
 (defun observe (mode)
  (let ((constructor (js* "Symbol")))
   (cond ((= mode 0) (Object/getOwnPropertyNames constructor))
         ((= mode 1) (Object/getOwnPropertyDescriptor constructor "dispose"))
         ((= mode 2) (get constructor :prototype))
         ((= mode 3) (get constructor :for))
         (t (Object/hasOwn constructor "asyncDispose")))
   (let* ((prototype (get constructor :prototype)) (symbol (funcall constructor "probe"))
          (descriptor (Object/getOwnPropertyDescriptor prototype "description"))
          (getter (get descriptor :get)))
    (JSON/stringify (js-array (Object/getOwnPropertyNames constructor)
      (Object/is (Object/getPrototypeOf constructor) (get globalThis/Function :prototype))
      (Object/is (get prototype :constructor) constructor)
      (js-call getter :call symbol)
      (js-call (get prototype :toString) :call symbol)
      (Object/is (js-call (get prototype (js* "Symbol.toPrimitive")) :call symbol) symbol)
      (Object/is (funcall (get constructor :for) "shared") (funcall (js* "Symbol.for") "shared")))))))
 (export constructor same first-names prototype-links description-shape description-call string-call primitive-call registry-dynamic registry-static registry-call observe)`;
 const {a:first,bytes}=await compiled(source);finish(first);
 const stages=['first-names','prototype-links','description-shape','description-call','string-call','primitive-call','registry-dynamic','registry-static','registry-call'];
 const program=b.compiler.compile_ir_string(source,'cold-symbol-observation.eli'),javascript=b.compiler.emit_ir_string(program);
 // Symbol own-name order is host-dependent (Bun differs from Node). Keep the
 // same independent Node reference as the complete builtin reflection suite.
 const reference=spawnSync('node',['--input-type=module','-e',`import{readFileSync}from'node:fs';const m=await import('data:text/javascript;base64,'+readFileSync(0).toString('base64'));const names=JSON.parse(process.argv[1]);console.log(JSON.stringify({stages:Object.fromEntries(names.map(name=>[name,m[name.replaceAll('-','_')]()])),observe:[0,1,2,3,4].map(mode=>m.observe(mode))}));`,JSON.stringify(stages)],{input:javascript,encoding:'utf8',timeout:30000});assert.equal(reference.status,0,reference.stderr);const oracle=JSON.parse(reference.stdout);
 {
  const a=instantiateManagedRuntime(bytes,{initializeModule:false});a.auto(1);a.initializeModule();const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
  try{const errors=[];for(const name of stages){
   try{const out=inSymbolCase(a,'cold Symbol stage '+name,()=>a.invoke(name));try{assert.deepEqual(read(a,out),oracle.stages[name],name);}finally{a.release(out);}}catch(error){errors.push(error);}
   a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  }if(errors.length)throw new AggregateError(errors,'cold Symbol independent observation stages');}finally{a.leaveFrame(frame);finish(a,[held]);}
 }
 for(const mode of[0,1,2,3,4]){
  const a=instantiateManagedRuntime(bytes,{initializeModule:false});a.auto(1);a.initializeModule();const input=a.number(mode),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
  try{for(let repeat=0;repeat<2;repeat++){const out=inSymbolCase(a,'cold first observation mode='+mode+' repeat='+repeat,()=>a.invoke('observe',[input]));try{assert.equal(a.readString(out),oracle.observe[mode],mode+'/'+repeat);}finally{a.release(out);}a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));}}
  finally{a.leaveFrame(frame);finish(a,[input,held]);}
 }
 const a=instantiateManagedRuntime(bytes,{initializeModule:false});a.auto(1);a.initializeModule();const constructor=a.invoke('constructor'),key=a.string('dispose'),held=a.number(-0),frame=a.frame(1),fillers=[];a.frameSet(frame,0,held);
 try{
  while(a.live()<1012)fillers.push(a.number(7));
  assert.throws(()=>a.objectHas(constructor,key),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  for(const item of fillers)a.release(item);fillers.length=0;a.collect();
  assert.equal(a.objectHas(constructor,key),true);const current=a.invoke('constructor');try{assert.equal(a.invoke('same',[constructor,current]),true);}finally{a.release(current);}
  const mode=a.number(2),out=a.invoke('observe',[mode]);try{assert.equal(a.readString(out),oracle.observe[2]);}finally{a.release(mode);a.release(out);}
 }finally{for(const item of fillers)a.release(item);a.leaveFrame(frame);finish(a,[constructor,key,held]);}
});
test('Symbol values preserve independent identity, missing and Unicode descriptions, typeof and explicit String conversion',async()=>{const{a}=await compiled(),values=[];for(const desc of[undefined,'','A😀\ud800',false,null,42]){const arg=typeof desc==='string'?a.string(desc):typeof desc==='number'?a.number(desc):desc,x=a.invoke('create',[arg]),y=a.invoke('create',[arg]);values.push(x,y);assert.equal(x.kind,22);assert.equal(a.invoke('equal',[x,x]),true);assert.equal(a.invoke('equal',[x,y]),false);assert.equal(text(a,a.invoke('label',[x])),'symbol');assert.equal(text(a,a.invoke('description',[x])),Symbol(desc).description);assert.equal(text(a,a.invoke('text',[x])),String(Symbol(desc)));a.release(arg);}const missing=a.invoke('create');assert.equal(a.invoke('description',[missing]),undefined);finish(a,[...values,missing]);});
test('Symbol registry and well-known values retain identity while held by properties and closures through collection',async()=>{const{a}=await compiled(),name=a.string('shared😀'),x=a.invoke('registered',[name]),y=a.invoke('registered',[name]),it=a.invoke('iterator'),p=a.invoke('primitive');assert.equal(a.invoke('equal',[x,y]),true);assert.equal(text(a,a.invoke('key',[x])),'shared😀');assert.equal(a.invoke('key',[it]),undefined);assert.equal(a.invoke('equal',[it,p]),false);const object=a.sourceObject({});a.release(a.invoke('write',[object,it,x]));a.release(x);a.release(y);a.release(it);a.collect();const again=a.invoke('iterator'),saved=a.invoke('member',[object,again]),registered=a.invoke('registered',[name]);assert.equal(a.invoke('equal',[saved,registered]),true);assert.equal(text(a,a.invoke('description',[again])),'Symbol.iterator');finish(a,[name,object,p,again,saved,registered]);});
test('symbol property keys are separate from strings and preserve insertion order in own-symbol enumeration and assignment',async()=>{const{a}=await compiled(),object=a.sourceObject({x:true}),target=a.sourceObject({}),d=a.string('x'),first=a.invoke('create',[d]),second=a.invoke('create',[d]);for(const[key,value]of[[first,true],[second,false]]){a.invoke('write',[object,key,value]);assert.equal(a.invoke('own',[object,key]),true);}const keys=a.invoke('keys',[object]);assert.equal(a.length(keys),1);assert.equal(text(a,a.get(keys,0)),'x');const symbols=a.invoke('symbols',[object]);assert.equal(a.length(symbols),2);for(const[i,key]of[first,second].entries()){const got=a.get(symbols,i);assert.equal(a.invoke('equal',[got,key]),true);a.release(got);}const out=a.invoke('assign',[target,object]);assert.equal(a.invoke('equal',[out,target]),true);for(const[key,value]of[[first,true],[second,false]])assert.equal(a.invoke('member',[target,key]),value);assert.equal(text(a,a.invoke('json',[object])),'{"x":true}');finish(a,[object,target,d,first,second,keys,symbols,out]);});
test('JSON omits symbol values in objects and top-level while producing null array elements',async()=>{const{a}=await compiled(),x=a.invoke('create'),object=a.sourceObject({x}),array=a.sourceArray([x]);assert.equal(a.invoke('json',[x]),undefined);assert.equal(text(a,a.invoke('json',[object])),'{}');assert.equal(text(a,a.invoke('json',[array])),'[null]');finish(a,[x,object,array]);});
test('Symbol keyFor rejects non-symbols and Symbol descriptions reject symbols during implicit text conversion',async()=>{const{a}=await compiled(),s=a.invoke('create'),number=a.number(1),bad=a.sourceObject({});for(const value of[null,undefined,true,number,bad])for(const name of['key'])assert.throws(()=>a.invoke(name,[value]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('create',[s]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('registered',[s]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a,[s,number,bad]);});
test('Symbol calls evaluate all arguments before description hooks and ignore extra values exactly once',async()=>{const source=`(defun run () (let ((trace (js-array))) (let ((s (funcall (js* "Symbol") (js-object :toString (lambda () (js-call trace :push "convert") "name")) (js-call trace :push "extra")))) (js-array (get s :description) trace)))) (export run)`,{a}=await compiled(source),out=a.invoke('run'),desc=a.get(out,0),trace=a.get(out,1);assert.equal(text(a,desc),'name');assert.equal(a.length(trace),2);assert.equal(text(a,a.get(trace,0)),'extra');assert.equal(text(a,a.get(trace,1)),'convert');finish(a,[out,trace]);});
test('Symbol.toPrimitive uses the actual symbol key, supplies conversion hints once, and preserves symbol property-key results',async()=>{const source=`(defun run () (let* ((trace (js-array)) (key (funcall (js* "Symbol") "key")) (object (js-object :toString (lambda () (js-call trace :push "wrong") "wrong")))) (put object (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) (if (= hint "string") key 7))) (let ((target (js-object))) (put target key 9) (js-array (Object/hasOwn target object) (funcall (js* "Number") object) (+ object 1) trace)))) (export run)`,{a}=await compiled(source),out=a.invoke('run'),yes=a.get(out,0),number=a.get(out,1),sum=a.get(out,2),trace=a.get(out,3);assert.equal(yes,true);assert.equal(a.readNumber(number),7);assert.equal(a.readNumber(sum),8);assert.equal(a.length(trace),3);for(const[i,hint]of['string','number','default'].entries())assert.equal(text(a,a.get(trace,i)),hint);finish(a,[out,number,sum,trace]);});
test('computed property keys are captured before the RHS and converted afterwards exactly once',async()=>{const source=`(defun run () (let* ((trace (js-array)) (symbol (funcall (js* "Symbol"))) (key (js-object)) (target (js-object))) (put key (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) symbol)) (put target key (progn (js-call trace :push "rhs") 12)) (js-array (get target key) trace (Object/getOwnPropertySymbols target)))) (export run)`,{a}=await compiled(source),out=a.invoke('run'),value=a.get(out,0),trace=a.get(out,1),symbols=a.get(out,2);assert.equal(a.readNumber(value),12);assert.equal(a.length(symbols),1);assert.equal(a.length(trace),3);for(const[i,hint]of['rhs','string','string'].entries())assert.equal(text(a,a.get(trace,i)),hint);finish(a,[out,value,trace,symbols]);});
test('Array.from consumes a custom Symbol.iterator lazily, captures next once and observes per-step mutation',async()=>{const source=`(defun run () (let* ((trace (js-array)) (state (js-object :n 0)) (iterator (js-object)) (source (js-object :length 99))) (put iterator :next (lambda () (let ((n (get state :n))) (put state :n (1+ n)) (put iterator :next false) (js-call trace :push n) (js-object :done (>= n 3) :value n)))) (put source (js* "Symbol.iterator") (lambda () (js-call trace :push "iterator") iterator)) (js-array (Array/from source (lambda (value index) (js-call trace :push (+ value index)) value)) trace))) (export run)`,{a}=await compiled(source),out=a.invoke('run'),array=a.get(out,0),trace=a.get(out,1);assert.equal(a.length(array),3);assert.deepEqual(Array.from({length:3},(_,i)=>{const x=a.get(array,i),v=a.readNumber(x);a.release(x);return v}),[0,1,2]);assert.equal(a.length(trace),8);assert.equal(text(a,a.get(trace,0)),'iterator');finish(a,[out,array,trace]);});
test('nullish iterator overrides select array-like conversion while invalid iterator hooks and results fail before length conversion',async()=>{const source=`(defun from (method trace) (let ((source (js-object :length (js-object :valueOf (lambda () (js-call trace :push "length") 2)) :0 "a" :1 "b"))) (put source (js* "Symbol.iterator") method) (Array/from source))) (defun bad-result () (let ((source (js-object))) (put source (js* "Symbol.iterator") (lambda () 1)) (Array/from source))) (defun no-next () (let ((source (js-object))) (put source (js* "Symbol.iterator") (lambda () (js-object :next false))) (Array/from source))) (export from bad-result no-next)`,{a}=await compiled(source);for(const method of[null,undefined]){const trace=a.sourceArray([]),out=inSymbolCase(a,'nullish iterator override '+String(method),()=>a.invoke('from',[method,trace]));assert.equal(a.length(out),2);assert.equal(text(a,a.get(out,0)),'a');assert.equal(a.length(trace),1);a.release(trace);a.release(out);}for(const method of[true,false,a.number(1)]){const trace=a.sourceArray([]);assert.throws(()=>a.invoke('from',[method,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.length(trace),0);a.release(trace);a.release(method);}for(const name of['bad-result','no-next'])assert.throws(()=>a.invoke(name),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a);});
test('Array.from closes a custom iterator after mapper failure, reads the current return once and preserves the original error',async()=>{const source=`(defun run (trace) (let* ((iterator (js-object :next (lambda () (js-object :done false :value 1)))) (source (js-object))) (put iterator :return false) (put source (js* "Symbol.iterator") (lambda () iterator)) (Array/from source (lambda (value index) (put iterator :return (lambda () (js-call trace :push "close") (funcall (js* "Number") (funcall (js* "Symbol"))))) (js-call value :toString 1))))) (export run)`,{a}=await compiled(source),trace=a.sourceArray([]);assert.throws(()=>a.invoke('run',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0010');assert.equal(a.length(trace),1);assert.equal(text(a,a.get(trace,0)),'close');finish(a,[trace]);});
test('iterator step failures do not call return and mapper validation precedes acquiring Symbol.iterator',async()=>{const source=`(defun run (trace mapper) (let* ((iterator (js-object :next (lambda () (js-call trace :push "next") nil) :return (lambda () (js-call trace :push "return") (js-object)))) (source (js-object))) (put source (js* "Symbol.iterator") (lambda () (js-call trace :push "iterator") iterator)) (Array/from source mapper))) (export run)`,{a}=await compiled(source);for(const [mapper,oracle]of[[undefined,['iterator','next']],[false,[]]]){const trace=a.sourceArray([]);assert.throws(()=>a.invoke('run',[trace,mapper]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.length(trace),oracle.length);for(const[i,item]of oracle.entries())assert.equal(text(a,a.get(trace,i)),item);a.release(trace);}finish(a);});
test('Map, Set and apply consume the same stepwise custom iterable and Map closes on an invalid entry',async()=>{const source=`(defun iterable (values trace) (let* ((state (js-object :index 0)) (source (js-object)) (iterator (js-object))) (put iterator :next (lambda () (let ((i (get state :index))) (put state :index (1+ i)) (js-call trace :push "next") (js-object :done (>= i (js-length values)) :value (js-nth i values))))) (put iterator :return (lambda () (js-call trace :push "close") (js-object))) (put source (js* "Symbol.iterator") (lambda () iterator)) source)) (defun run () (let* ((trace (js-array)) (source (iterable (js-array (js-array "x" 1) (js-array "y" 2)) trace)) (map (new (js* "Map") source)) (set (new (js* "Set") (iterable (js-array 1 2 1) trace)))) (js-array (js-call map :get "x") (get set :size) (apply (lambda (&rest values) values) (iterable (js-array 3 4) trace)) trace))) (defun bad (trace) (new (js* "Map") (iterable (js-array 1) trace))) (export run bad)`,{a}=await compiled(source),out=a.invoke('run'),first=a.get(out,0),size=a.get(out,1),args=a.get(out,2),trace=a.sourceArray([]);assert.equal(a.readNumber(first),1);assert.equal(a.readNumber(size),2);assert.equal(a.length(args),2);assert.throws(()=>a.invoke('bad',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.length(trace),2);assert.equal(text(a,a.get(trace,1)),'close');finish(a,[out,first,size,args,trace]);});
test('the raw iterator close ABI validates return objects, preserves caller frames and leaves shared native iterator positions intact',async()=>{const source=`(defun source (trace returned) (let* ((iterator (js-object :next (lambda () (js-object :done false :value 1)) :return (lambda () (js-call trace :push t) returned))) (object (js-object))) (put object (js* "Symbol.iterator") (lambda () iterator)) object)) (defun native () (js-call (js-array 1 2) :values)) (export source native)`,{a,bytes}=await compiled(source);finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](256,32768,1048576),call=(name,...args)=>{const out=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;},frame=call('frame-new',8),trace=call('value-array-new',0),returned=call('value-object-new',3);call('frame-set',frame,0,trace);call('frame-set',frame,1,returned);e.__eliscript_module_init(heap);assert.equal(e['last-error'](),0);call('heap-auto',1);for(const [value,code]of[[returned,0],[3,3],[2,3]]){const object=e.__eliscript_export_0(heap,trace,value)>>>0;assert.equal(e['last-error'](),0,'source construction '+JSON.stringify({argument:value,live:call('heap-live'),used:call('heap-used'),frameDepth:call('frame-depth')}));call('frame-set',frame,2,object);const iterator=call('value-source-get-iterator',object);call('frame-set',frame,3,iterator);assert.equal(e['value-source-iterator-close'](heap,iterator,0)>>>0,code?0:1);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);}assert.equal(call('value-length',trace),3);const native=e.__eliscript_export_1(heap)>>>0;assert.equal(e['last-error'](),0);call('frame-set',frame,4,native);assert.equal(call('value-source-iterator-advance',native),1);assert.equal(call('value-source-iterator-close',native,0),1);assert.equal(call('value-source-iterator-advance',native),1);assert.equal(call('value-source-iterator-advance',native),0);for(const bad of[0xffffffff,frame,trace]){assert.equal(e['value-source-iterator-close'](heap,bad,0),0);assert.equal(e['last-error'](),1);}call('frame-pop',frame);e.__eliscript_module_close(heap);assert.equal(e['last-error'](),0);call('heap-collect');assert.equal(call('heap-live'),0);});

let generationEvidence;
async function generations(){if(generationEvidence)return generationEvidence;const files=(await readdir('bootstrap/compiler')).filter(f=>f.endsWith('.eli')).sort(),all=[b];let previous=b;for(const generation of[2,3]){const output=resolve(directory,'g'+generation),bootstrap=resolve(output,'bootstrap');await mkdir(bootstrap,{recursive:true});for(const file of files){const path=resolve('bootstrap/compiler',file),name=file.replace(/\.eli$/,'.mjs'),emission=previous.compiler.compile_string_with_source_map(await readFile(path,'utf8'),path,name,relative(bootstrap,path));await writeFile(resolve(bootstrap,name),emission.javascript+'//# sourceMappingURL='+name+'.map\n');await writeFile(resolve(bootstrap,name+'.map'),emission.sourceMap);}const current=await buildBackends({outputRoot:output,frontend:previous.compiler});current.compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);all.push(current);previous=current;}const filename=resolve('tests/fixtures/wasm-managed-symbols.eli'),seedFile=resolve(directory,'symbols-seed.mjs'),seed=spawnSync(resolve('bin/eliscript-seed'),['--output',seedFile,filename],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);const javascript=await readFile(seedFile,'utf8'),bytes=[];for(const current of all){const p=current.compiler.compile_ir_string(family,filename),rt=current.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');assert.equal(current.compiler.emit_ir_string(p),javascript);bytes.push(Uint8Array.from(current.managed.emit_managed_wasm(p,rt)));}assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);generationEvidence={all,bytes:bytes[2],javascript,filename};return generationEvidence;}
test('public Seed and three full compiler generations produce identical Symbol protocol JS and WASM bytes',async()=>{const{bytes,javascript}=await generations(),js=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64')),a=instantiateManagedRuntime(bytes);a.auto(1);const out=a.invoke('exercise');assert.deepEqual(read(a,out),js.exercise());finish(a,[out]);},30000);
test('browser compiler emits identical Symbol protocol bytes and runs the shared fixture without host imports',async()=>{const evidence=await generations(),entry=resolve(directory,'symbols-browser-entry.mjs');await writeFile(entry,`export {compile_ir_string,emit_ir_string} from ${JSON.stringify(resolve(directory,'g3/bootstrap/compiler.mjs'))};export {emit_managed_wasm} from ${JSON.stringify(resolve(directory,'g3/backends/managed.mjs'))};export {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};`);const build=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert(build.success);const require=createRequire(import.meta.url),playwright=require(require.resolve('playwright-core',{paths:[process.cwd(),...(process.env.NODE_PATH??'').split(delimiter).filter(Boolean)]})),name=process.env.ELISCRIPT_TEST_BROWSER??'chromium';assert(['chromium','firefox','webkit'].includes(name));const browser=await playwright[name].launch();try{const page=await browser.newPage();const bytes=await page.evaluate(async({bundle,source,runtime,seed,filename})=>{const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'})),jsUrl=URL.createObjectURL(new Blob([seed],{type:'text/javascript'}));try{const c=await import(url),js=await import(jsUrl),p=c.compile_ir_string(source,filename),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt)),check=(ok,label)=>{if(!ok)throw Error(label)};check(c.emit_ir_string(p)===seed,'public Seed JS');check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');const a=c.instantiateManagedRuntime(bytes);a.auto(1);const read=x=>{if(x?.kind===4)return a.readNumber(x);if(x?.kind===5)return a.readString(x);if(x?.kind===14){const out=[];for(let i=0;i<a.length(x);i++){const item=a.get(x,i);out.push(read(item));a.release(item)}return out}return x};const out=a.invoke('exercise');check(JSON.stringify(read(out))===JSON.stringify(js.exercise()),'Symbol protocol behavior');check(a.invoke('identities')===true,'firstclass');a.release(out);a.closeModule();a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');return[...bytes]}finally{URL.revokeObjectURL(url);URL.revokeObjectURL(jsUrl)}},{bundle:await build.outputs[0].text(),source:family,runtime:await readFile('bootstrap/runtime/memory.eli','utf8'),seed:evidence.javascript,filename:evidence.filename});assert.deepEqual(Uint8Array.from(bytes),evidence.bytes);}finally{await browser.close();}},30000);
test('destructuring holes skip the result value lookup while ordinary advance still performs it',async()=>{const source=`(defun factory () (let* ((source (js-object)) (iterator (js-object :next (lambda () (js-object :done false :value 1))))) (put source (js* "Symbol.iterator") (lambda () iterator)) source)) (export factory)`,text=await readFile('bootstrap/runtime/memory.eli','utf8'),start=text.indexOf('  (defun heap-source-protocol-step '),end=text.indexOf('  (defun value-source-iterator-close ',start),point=text.lastIndexOf('(value-property-get heap step key 0)',end);assert(point>start);const rt=b.compiler.compile_ir_string(text.slice(0,point)+'(load-u32 4294967295)'+text.slice(point+'(value-property-get heap step key 0)'.length),'skip-value-trap.eli'),{a,bytes}=await compiled(source,undefined,rt);finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](128,16384,1048576),call=(name,...args)=>{const value=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;};e.__eliscript_module_init(heap);assert.equal(e['last-error'](),0);call('heap-auto',1);const frame=call('frame-new',2),sourceObject=e.__eliscript_export_0(heap)>>>0;assert.equal(e['last-error'](),0,'source construction '+JSON.stringify(rawSymbolHeapSummary(e,heap)));call('frame-set',frame,0,sourceObject);const iterator=call('value-source-get-iterator',sourceObject);call('frame-set',frame,1,iterator);call('heap-auto',1);assert.equal(call('value-source-iterator-skip',iterator),1);assert.throws(()=>e['value-source-iterator-advance'](heap,iterator),WebAssembly.RuntimeError);call('frame-unwind',frame);assert.equal(call('frame-depth'),1);call('frame-pop',frame);e.__eliscript_module_close(heap);assert.equal(e['last-error'](),0);call('heap-collect');assert.equal(call('heap-live'),0);});
test('symbols held only by collection keys, properties and closures keep registry identity and traced descriptions through GC',async()=>{const source=`(defun holder (value) (lambda () value)) (defun call (fn) (funcall fn)) (defun table (key) (let ((map (new (js* "Map")))) (js-call map :set key key) map)) (defun fetch (map key) (js-call map :get key)) (defun symbol (name) (funcall (js* "Symbol.for") name)) (defun label (x) (get x :description)) (defun same (a b) (Object/is a b)) (export holder call table fetch symbol label same)`,{a}=await compiled(source),name=a.string('retained😀\ud800'),symbol=a.invoke('symbol',[name]),holder=a.invoke('holder',[symbol]),table=a.invoke('table',[symbol]);a.release(symbol);a.release(name);a.collect();const saved=a.invoke('call',[holder]),description=a.invoke('label',[saved]);assert.equal(a.readString(description),'retained😀\ud800');const again=a.invoke('symbol',[description]),fetched=a.invoke('fetch',[table,again]);assert.equal(a.invoke('same',[saved,again]),true);assert.equal(a.invoke('same',[saved,fetched]),true);finish(a,[holder,table,saved,description,again,fetched]);});
test('symbol allocation capacity errors unwind all private roots and recover after unreachable identities are released',async()=>{const{a}=await compiled(undefined,{maxSlots:96,initialBytes:16384,maxBytes:1048576}),values=[];let exhausted=false;for(let i=0;i<128;i++){try{values.push(a.invoke('create'));}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');exhausted=true;break;}}assert(exhausted);assert(values.length>0,'cold Symbol creation must produce values before exhaustion');assert.equal(a.stats().frameDepth,0);values.forEach(value=>a.release(value));a.collect();const value=a.invoke('create');assert.equal(value.kind,22);finish(a,[value]);});
test('symbol builtin raw ABI rejects stale handles, private frames, malformed argv and unsealed descriptions without losing caller roots',async()=>{const{a,bytes}=await compiled();finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](96,16384,1048576),call=(name,...args)=>{const value=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;},frame=call('frame-new',4),argv=call('value-refs',7,1),unsealed=call('value-string',1),raw=call('value-refs',7,0);for(const[i,v]of[argv,unsealed,raw].entries())call('frame-set',frame,i,v);for(const[input,count,operation,code]of[[0xffffffff,1,0,1],[frame,1,0,1],[argv,2,0,3],[argv,1,4,3]]){assert.equal(e['value-symbol-builtin'](heap,input,count,operation),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);}for(const[value,code]of[[0xffffffff,1],[frame,3],[raw,3],[unsealed,6]]){new DataView(e.memory.buffer).setUint32(call('value-data',argv,7),value,true);assert.equal(e['value-symbol-builtin'](heap,argv,1,0),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);}const match=call('value-symbol-well-known',2);call('frame-set',frame,3,match);assert.equal(call('value-kind',match),22);assert.equal(call('value-symbol-well-known',2),match);call('heap-auto',1);const symbols=[];for(const [identifier,name]of wellKnownSymbolNames.entries()){const symbol=call('value-symbol-well-known',identifier);call('heap-pin',symbol);symbols.push(symbol);const offset=call('value-data',symbol,22),view=new DataView(e.memory.buffer);assert.equal(view.getUint32(offset-20,true),2,name);assert.equal(view.getUint32(offset-16,true),identifier,name);const description=view.getUint32(offset,true),expected='Symbol.'+name;assert.equal(call('value-length',description),expected.length,name);for(let i=0;i<expected.length;i++)assert.equal(call('value-unit-get',description,i),expected.charCodeAt(i),name);call('heap-collect');assert.equal(call('value-symbol-well-known',identifier),symbol,name);assert.equal(call('frame-depth'),1);}for(const bad of[-1,15,16,0xffffffff]){assert.equal(e['value-symbol-well-known'](heap,bad),0);assert.equal(e['last-error'](),3);assert.equal(call('frame-depth'),1);}for(const symbol of symbols)call('heap-release',symbol);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);});
test('Node executes the same Symbol and iterable bytes with native JS observations and complete root cleanup',async()=>{const{bytes,javascript}=await generations(),js=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64')),script=`import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{instantiateManagedRuntime}from${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};const a=instantiateManagedRuntime(readFileSync(0));a.auto(1);const read=x=>{if(x?.kind===4)return a.readNumber(x);if(x?.kind===5)return a.readString(x);if(x?.kind===14)return Array.from({length:a.length(x)},(_,i)=>{const y=a.get(x,i);try{return read(y)}finally{a.release(y)}});return x};const out=a.invoke('exercise');assert.deepEqual(read(out),JSON.parse(process.argv[1]));assert.equal(a.invoke('identities'),true);a.release(out);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`,result=spawnSync('node',['--input-type=module','-e',script,JSON.stringify(js.exercise())],{input:Buffer.from(bytes),encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);});
test('WeakRef remains a source-bound refusal while weak collections, Symbol methods and native iterators are real values',async()=>{
 const unsupported='(defun run () (new (js* "WeakRef") (funcall (js* "Symbol.for") "x"))) (export run)',p=b.compiler.compile_ir_string(unsupported,'symbol-unrepresented.eli'),before=JSON.stringify(p);
 assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),error=>error.eliscriptDiagnostic?.code==='ELI-B0001'&&error.eliscriptDiagnostic.location.file==='symbol-unrepresented.eli');assert.equal(JSON.stringify(p),before);
 let source=`
 (defun supported ()
   (let* ((symbol (funcall (js* "Symbol") "local😀"))
          (registered (funcall (js* "Symbol.for") "shared-weak-test"))
          (box (funcall (js* "Object") symbol))
          (prototype (get (js* "Symbol") :prototype))
          (valueOf (get prototype :valueOf)) (toString (get prototype :toString))
          (primitive (get prototype (js* "Symbol.toPrimitive")))
          (description (get (Object/getOwnPropertyDescriptor prototype "description") :get))
          (map (new (js* "WeakMap"))) (set (new (js* "WeakSet")))
          (object (js-object)) (fn (lambda () nil))
          (array (js-array 4 5)) (method (get array (js* "Symbol.iterator")))
          (iterator (js-call method :call array)))
     (js-call map :set symbol box) (js-call map :set object fn) (js-call map :set fn object)
     (js-call set :add symbol) (js-call set :add object) (js-call set :add fn)
     (let ((out (js-array
       (Object/is registered (funcall (js* "Symbol.for") "shared-weak-test"))
       (Object/is (get (js* "Symbol") :for) (js* "Symbol.for"))
       (Object/is valueOf (get box :valueOf))
       (Object/is (js-call valueOf :call box) symbol)
       (js-call toString :call box)
       (js-call description :call box)
       (Object/is (js-call primitive :call box "ignored") symbol)
       (Object/is (js-call map :get symbol) box)
       (Object/is (js-call map :get object) fn)
       (Object/is (js-call map :get fn) object)
       (js-call set :has symbol) (js-call set :has object) (js-call set :has fn)
       (js-call map :has registered) (js-call map :get registered)
       (js-call set :has registered)
       (Object/is method (get array :values))
       (Object/is method (get (js-array) (js* "Symbol.iterator")))
       (get (js-call iterator :next) :value) (get (js-call iterator :next) :value)
       (get (js-call iterator :next) :done))))
       (js-call map :delete symbol) (js-call set :delete symbol)
       (js-call out :push (js-call map :has symbol) (js-call set :has symbol)) out)))
 (defun registered-key () (funcall (js* "Symbol.for") "shared-weak-test"))
 (defun invalid-weak-key (key trace)
   (let ((map (new (js* "WeakMap"))))
     (try (js-call map :set (progn (js-call trace :push "key") key) (progn (js-call trace :push "value") t))
       (catch error (js-array (get error :name) trace)))))
 (defun invalid-weak-set (key trace)
   (let ((set (new (js* "WeakSet"))))
     (try (js-call set :add (progn (js-call trace :push "key") key) (js-call trace :push "extra"))
       (catch error (js-array (get error :name) trace)))))
 (defun invalid-symbol-receiver (receiver trace)
   (js-call (get (get (js* "Symbol") :prototype) :valueOf) :call receiver (js-call trace :push "argument")))
 (export supported registered-key invalid-weak-key invalid-weak-set invalid-symbol-receiver)`;
 // Each prefix executes the exact original binding expressions in order. Its
 // separate instance preserves the complete supported() call's cold realm.
 const setupStart=source.indexOf('(let* ((symbol '),setupEnd=source.indexOf('\n     (js-call map :set symbol box)',setupStart),setup=source.slice(setupStart,setupEnd);
 assert(setupStart>0&&setupEnd>setupStart);
 const phases=[
  ['symbols','\n          (box ',`(Object/is registered (funcall (js* "Symbol.for") "shared-weak-test"))`],
  ['boxed','\n          (prototype ',`(Object/is (funcall (js* "Object") box) box)`],
  ['prototype','\n          (map ',`(js-array (Object/is valueOf (get box :valueOf)) (Object/is (js-call valueOf :call box) symbol) (js-call toString :call box) (js-call description :call box) (Object/is (js-call primitive :call box "ignored") symbol))`],
  ['weak','\n          (array ',`(js-array (js-call map :has symbol) (js-call set :has object) (js-call map :has fn))`],
  ['array-method','\n          (iterator ',`(js* "typeof method")`],
  ['iterator',null,`(js-array (Object/is method (get array :values)) (get (js-call iterator :next) :value) (get (js-call iterator :next) :value) (get (js-call iterator :next) :done))`],
 ];
 const names=phases.map(([name])=>'supported-stage-'+name),definitions=phases.map(([name,marker,expression])=>{
  const end=marker===null?setup.length:setup.indexOf(marker);assert(end>0,name);
  return'(defun supported-stage-'+name+' () '+setup.slice(0,end)+(marker===null?'':')')+' '+expression+'))';
 }).join('\n');
 source=source.replace(' (export supported ',definitions+'\n (export '+names.join(' ')+' supported ');
 const {a,bytes}=await compiled(source),oracleProgram=b.compiler.compile_ir_string(source,'symbol-supported-oracle.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(oracleProgram)).toString('base64')),roots=[];
 try{
  const errors=[];for(const name of names){const stage=instantiateManagedRuntime(bytes,{initializeModule:false});stage.auto(1);stage.initializeModule();
   try{const out=inSymbolCase(stage,name,()=>stage.invoke(name));try{assert.deepEqual(read(stage,out),js[name.replaceAll('-','_')](),name);}finally{stage.release(out);}}
   catch(error){errors.push(error);}finally{finish(stage);}
  }if(errors.length)throw new AggregateError(errors,'weak collection and boxed Symbol setup stages');
  const out=inSymbolCase(a,'weak collections and boxed Symbol prototype methods',()=>a.invoke('supported'));roots.push(out);assert.deepEqual(read(a,out),js.supported());a.collect();assert.equal(a.stats().frameDepth,0);
  const registered=a.invoke('registered-key'),number=a.number(1);roots.push(registered,number);
  for(const name of['invalid-weak-key','invalid-weak-set'])for(const[value,host]of[[registered,js.registered_key()],[null,null],[false,false],[number,1]]){const trace=a.sourceArray([]),expected=[];try{const reference=js[name.replaceAll('-','_')](host,expected),result=a.invoke(name,[value,trace]);try{assert.equal(reference[0],'TypeError');assert.deepEqual(read(a,result),reference);}finally{a.release(result);}assert.deepEqual(read(a,trace),expected);assert.equal(a.stats().frameDepth,0);}finally{a.release(trace);}}
  const object=a.sourceObject({});roots.push(object);
  for(const[value,host]of[[null,null],[number,1],[object,{}]]){const trace=a.sourceArray([]),expected=[];try{assert.throws(()=>js.invalid_symbol_receiver(host,expected),TypeError);assert.throws(()=>a.invoke('invalid-symbol-receiver',[value,trace]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,trace),expected);assert.equal(a.stats().frameDepth,0);}finally{a.release(trace);}}
 }finally{finish(a,roots);}
});
test('all source arithmetic conversions use Symbol.toPrimitive with the original hints and string relational behavior',async()=>{const source=`(defun run () (let* ((trace (js-array)) (a (js-object)) (b (js-object))) (put a (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) "2")) (put b (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) "10")) (js-array (+ a b) (- a b) (int32 a) (< a b) trace))) (export run)`,{a}=await compiled(source),p=b.compiler.compile_ir_string(source,'symbol-arithmetic-oracle.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),out=a.invoke('run');assert.deepEqual(read(a,out),js.run());finish(a,[out]);});
test('fixed-seed symbol key insertion, overwrites and assignment match native object, array, Map and Set own-property operations',async()=>{const source=family.replace('  (export identities','  (defun make (kind) (if (= kind 0) (js-object) (if (= kind 1) (js-array) (if (= kind 2) (new (js* "Map")) (new (js* "Set"))))))\n  (export make identities'),{a}=await compiled(source);let seed=0x751af321;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let trial=0;trial<64;trial++){const kind=trial%4,k=a.number(kind),object=a.invoke('make',[k]),oracle=kind===0?{}:kind===1?[]:kind===2?new Map():new Set(),symbols=[],host=[];a.release(k);for(let i=0;i<8;i++){const name=['x','中😀','\ud800','',String(next()%3)][next()%5],s=a.string(name),symbol=a.invoke('create',[s]);symbols.push(symbol);host.push(Symbol(name));a.release(s);}for(let i=0;i<32;i++){const index=next()%8,key=next()%3?symbols[index]:a.string(String(next()%7)),hostKey=key?.kind===22?host[index]:a.readString(key),value=!!(next()%2);a.invoke('write',[object,key,value]);oracle[hostKey]=value;if(key?.kind!==22)a.release(key);}const keys=a.invoke('keys',[object]),own=a.invoke('symbols',[object]);assert.deepEqual(read(a,keys),Object.keys(oracle));const expected=Object.getOwnPropertySymbols(oracle);assert.equal(a.length(own),expected.length);for(let i=0;i<expected.length;i++){const out=a.get(own,i);assert.equal(a.invoke('equal',[out,symbols[host.indexOf(expected[i])]]),true);assert.equal(a.invoke('member',[object,out]),oracle[expected[i]]);a.release(out);}const copy=a.sourceObject({}),assigned=a.invoke('assign',[copy,object]);for(let i=0;i<8;i++){assert.equal(a.invoke('own',[copy,symbols[i]]),Object.hasOwn(oracle,host[i]));assert.equal(a.invoke('member',[copy,symbols[i]]),oracle[host[i]]);}for(const v of[object,keys,own,copy,assigned,...symbols])a.release(v);}finish(a);});
test('nullish primitive hooks fall back, non-callable hooks fail and object hook results are rejected without calling fallback methods',async()=>{const source=`(defun run (hook trace) (let ((object (js-object :toString (lambda () (js-call trace :push "fallback") "text")))) (put object (js* "Symbol.toPrimitive") hook) (funcall (js* "String") object))) (defun bad (trace) (let ((object (js-object :toString (lambda () (js-call trace :push "wrong") "text")))) (put object (js* "Symbol.toPrimitive") (lambda (hint) (js-object))) (funcall (js* "String") object))) (export run bad)`,{a}=await compiled(source);for(const hook of[null,undefined]){const trace=a.sourceArray([]),out=a.invoke('run',[hook,trace]);assert.equal(text(a,out),'text');assert.deepEqual(read(a,trace),['fallback']);a.release(trace);}for(const hook of[false,true,a.number(0)]){const trace=a.sourceArray([]);assert.throws(()=>a.invoke('run',[hook,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.length(trace),0);a.release(trace);a.release(hook);}const trace=a.sourceArray([]);assert.throws(()=>a.invoke('bad',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.length(trace),0);finish(a,[trace]);});
test('computed literal keys convert before their values while ordinary writes defer conversion and null receivers suppress key hooks after RHS effects',async()=>{const source=`(defun literal () (let* ((trace (js-array)) (key (js-object :toString (lambda () (js-call trace :push "key") "x")))) (js-object (progn key) (progn (js-call trace :push "value") 1)) trace)) (defun null-write (trace) (put nil (js-object :toString (lambda () (js-call trace :push "key") "x")) (progn (js-call trace :push "rhs") 1))) (export literal null-write)`,{a}=await compiled(source),out=a.invoke('literal');assert.deepEqual(read(a,out),['key','value']);const trace=a.sourceArray([]);assert.throws(()=>a.invoke('null-write',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,trace),['rhs']);finish(a,[out,trace]);});
test('numeric operators stop at a left Symbol conversion error while addition and relational comparison first convert both operands',async()=>{const source=`(defun run (mode trace) (let* ((left (funcall (js* "Symbol"))) (right (js-object))) (put right (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) 1)) (if (= mode 0) (- left right) (if (= mode 1) (bit-and left right) (if (= mode 2) (+ left right) (< left right)))))) (export run)`,{a}=await compiled(source),p=b.compiler.compile_ir_string(source,'symbol-order-oracle.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));for(const mode of[0,1,2,3]){const trace=a.sourceArray([]),n=a.number(mode),oracle=[];assert.throws(()=>js.run(mode,oracle),TypeError);assert.throws(()=>a.invoke('run',[n,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,trace),oracle);a.release(trace);a.release(n);}finish(a);});
test('close preserves an existing error even when its own private frame cannot be allocated',async()=>{const{a,bytes}=await compiled();finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](16,8192,65536),roots=[],call=(name,...args)=>{const v=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return v;},array=call('value-array-new',0);call('heap-pin',array);roots.push(array);const iterator=call('value-source-iterator-new',array,2);call('heap-pin',iterator);roots.push(iterator);call('heap-auto',1);while(true){const number=e['value-number'](heap,0,0)>>>0;if(e['last-error']()){assert.equal(e['last-error'](),2);break;}call('heap-pin',number);roots.push(number);}assert.equal(e['value-source-iterator-close'](heap,iterator,10),0);assert.equal(e['last-error'](),10);for(const root of roots)call('heap-release',root);call('heap-collect');assert.equal(call('heap-live'),0);});
test('lexically shadowed Symbol methods capture the ordinary callee before argument mutation and well-known names read the shadow',async()=>{const source=`(defun factory () (lambda (&rest args) args)) (defun run (Symbol trace) (js-call Symbol :for (progn (put Symbol :for false) (js-call trace :push "first") "arg") (js-call trace :push "last"))) (defun read (Symbol) (js* "Symbol.iterator")) (export factory run read)`,{a}=await compiled(source),fn=a.invoke('factory'),object=a.sourceObject({for:fn,iterator:true}),trace=a.sourceArray([]),out=a.invoke('run',[object,trace]);assert.deepEqual(read(a,out),['arg',2]);assert.deepEqual(read(a,trace),['first','last']);assert.equal(a.invoke('read',[object]),true);const later=a.sourceArray([]);const p=b.compiler.compile_ir_string(source,'shadowed-symbol-oracle.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),expected=[];assert.throws(()=>js.run(null,expected),TypeError);assert.deepEqual(expected,[]);assert.throws(()=>a.invoke('run',[null,later]),e=>e instanceof TypeError&&e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(a.length(later),0);finish(a,[fn,object,trace,out,later]);});
test('own Symbol.iterator overrides native Array and Map iteration while nullish Array overrides use dense array-like slots',async()=>{const source=`(defun run () (let* ((array (js-array 1 2)) (map (new (js* "Map")))) (put array (js* "Symbol.iterator") (lambda () (js-call (js-array 7 8) :values))) (put map (js* "Symbol.iterator") (lambda () (js-call (js-array "custom") :values))) (let ((custom (Array/from array)) (mapped (Array/from map))) (put array (js* "Symbol.iterator") nil) (js-array custom mapped (Array/from array))))) (export run)`,{a}=await compiled(source),p=b.compiler.compile_ir_string(source,'native-symbol-iterator.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),out=inSymbolCase(a,'native Array iterator override and nullish fallback',()=>a.invoke('run'));assert.deepEqual(read(a,out),js.run());finish(a,[out]);});
test('Symbol primitives have no own description property, are already frozen, and reject writes after RHS effects',async()=>{const source=`(defun run () (let ((symbol (funcall (js* "Symbol") "x"))) (js-array (Object/keys symbol) (Object/getOwnPropertySymbols symbol) (Object/hasOwn symbol "description") (Object/isFrozen symbol) (Object/is symbol (Object/freeze symbol))))) (defun write (trace) (put (funcall (js* "Symbol")) :description (js-call trace :push "rhs"))) (export run write)`,{a}=await compiled(source),p=b.compiler.compile_ir_string(source,'symbol-properties-oracle.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),out=a.invoke('run'),trace=a.sourceArray([]);assert.deepEqual(read(a,out),js.run());assert.throws(()=>a.invoke('write',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,trace),['rhs']);finish(a,[out,trace]);});
test('source throws cross Symbol conversion and iterator close without replacing nullish, object or Symbol identities',async()=>{const source=`(defun symbol () (funcall (js* "Symbol") "original")) (defun primitive (value) (let ((object (js-object))) (put object (js* "Symbol.toPrimitive") (lambda (hint) (throw value))) (try (funcall (js* "String") object) (catch error (Object/is error value))))) (defun iterator (value trace) (let* ((iterator (js-object :next (lambda () (js-object :done false :value 1)) :return (lambda () (js-call trace :push "close") (throw (funcall (js* "Symbol") "replacement"))))) (source (js-object))) (put source (js* "Symbol.iterator") (lambda () iterator)) (try (Array/from source (lambda (item index) (throw value))) (catch error (Object/is error value))))) (export symbol primitive iterator)`,{a}=await compiled(source),symbol=a.invoke('symbol'),number=a.number(-0),string=a.string('中😀'),object=a.sourceObject({});for(const value of[null,undefined,false,true,symbol,number,string,object]){assert.equal(a.invoke('primitive',[value]),true);const trace=a.sourceArray([]);assert.equal(a.invoke('iterator',[value,trace]),true);assert.deepEqual(read(a,trace),['close']);assert.equal(a.stats().frameDepth,0);a.release(trace);}finish(a,[symbol,number,string,object]);});
