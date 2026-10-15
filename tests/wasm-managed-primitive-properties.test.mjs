import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
// Number/Boolean boxes expose missing ordinary fields and represented inherited
// data. Their own unrepresented native prototype functions remain rejected.
const source=`
 (defconst marker 1)
 (defun member (receiver key) (aref receiver key))
 (defun fallback (receiver key trace)
   (get receiver key (progn (js-call trace :push "default") 7)))
 (defun converted (receiver trace)
   (let ((key (js-object)))
     (put key (js* "Symbol.toPrimitive")
       (lambda (hint) (js-call trace :push hint) "absent"))
     (aref receiver key)))
 (defun abrupt (receiver trace)
   (let ((key (js-object)))
     (put key (js* "Symbol.toPrimitive") (lambda (hint) (throw trace)))
     (try (aref receiver key) (catch error (Object/is error trace)))))
 (defun expression (receiver trace)
   (let ((key (js-object)))
     (put key (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) "absent"))
     (aref receiver (progn (js-call trace :push "key-expression") key))))
 (export member fallback converted abrupt expression)`;
let directory,b,runtime,program,js;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-primitive-properties-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(source,'primitive-properties.eli');js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(rt=runtime){const bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,rt));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return bytes;}
function read(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14)return Array.from({length:a.length(value)},(_,i)=>{const item=a.get(value,i);try{return read(a,item);}finally{a.release(item);}});return value;}
function finish(a,roots=[]){roots.forEach(root=>a.release(root));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('represented Boolean and Number primitives retain ordinary missing property results default effects and string-hint key conversion',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const value of[false,true,0,-0,1,NaN,Infinity]){const input=typeof value==='number'?a.number(value):value,key=a.string('absent'),trace=a.sourceArray([]);assert.equal(a.invoke('member',[input,key]),value.absent);assert.equal(a.invoke('converted',[input,trace]),undefined);assert.deepEqual(read(a,trace),['string']);const result=a.invoke('fallback',[input,key,trace]);assert.equal(a.readNumber(result),7);assert.deepEqual(read(a,trace),['string','default']);assert.equal(a.invoke('abrupt',[input,trace]),true);for(const root of[input,key,trace,result])a.release(root);a.collect();}finish(a);
});
test('nullish reads retain their source errors and unrepresented primitive prototype methods are explicitly rejected',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);const key=a.string('absent'),trace=a.sourceArray([]);
 for(const value of[null,undefined]){assert.throws(()=>a.invoke('member',[value,key]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0001');assert.throws(()=>a.invoke('converted',[value,trace]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0001');assert.deepEqual(read(a,trace),[]);}
 const number=a.number(1);for(const value of[false,true,number])for(const name of['constructor','toString','valueOf','toLocaleString','__proto__']){const property=a.string(name);assert.throws(()=>a.invoke('member',[value,property]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(property);}finish(a,[key,trace,number]);
});

test('computed nullish reads execute the key expression but suppress ToPropertyKey just as independent native JavaScript',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const receiver of[null,undefined]){const trace=a.sourceArray([]),expected=[];assert.throws(()=>js.expression(receiver,expected),TypeError);assert.deepEqual(expected,['key-expression']);assert.throws(()=>a.invoke('expression',[receiver,trace]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0001');assert.deepEqual(read(a,trace),expected);a.release(trace);}finish(a);
});

test('primitive property reads preserve invalid stale and foreign handle rejection and private array ABI admission',()=>{
 const bytes=artifact(),a=instantiateManagedRuntime(bytes),other=instantiateManagedRuntime(bytes),key=a.string('missing'),foreign=other.number(3),stale=a.number(9);assert.throws(()=>a.invoke('member',[foreign,key]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0001');a.release(stale);a.collect();assert.throws(()=>a.invoke('member',[stale,key]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0001');
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,8192,65536),number=e['value-number'](heap,0,0);e['value-property-get'](heap,0xffffffff,3,0);assert.equal(e['last-error'](),1);e['value-array-get'](heap,number,3,0);assert.equal(e['last-error'](),1);finish(a,[key]);finish(other,[foreign]);
});

test('primitive read allocation failures retain caller roots and later missing-property reads recover',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:64,initialBytes:8192,maxBytes:65536});a.auto(1);const key=a.string('missing'),held=a.number(-0),frame=a.frame(1),fillers=[];a.frameSet(frame,0,held);while(a.live()<64)fillers.push(a.number(7));assert.throws(()=>a.invoke('member',[true,key]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));fillers.forEach(value=>a.release(value));a.collect();assert.equal(a.invoke('member',[true,key]),undefined);a.leaveFrame(frame);finish(a,[key,held]);
});

test('primitive reads observe represented Object prototype data across collection and realm close without inventing native methods',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](128,16384,131072);e['heap-auto'](h,1);
 const call=(name,...args)=>{const result=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return result;};
 const text=value=>{const result=call('value-string',value.length);call('heap-pin',result);for(let i=0;i<value.length;i++)call('value-unit-set',result,i,value.charCodeAt(i));call('value-seal',result);return result;};
 const key=text('visible'),missing=text('missing'),standard=text('hasOwnProperty'),number=call('value-number',0,0);call('heap-pin',number);
 assert.equal(call('value-standard-prototype-existing',0),0);
 const root=call('value-standard-prototype',0),object=call('value-object-new',3);call('heap-pin',object);
 call('value-object-put',root,key,2,2);assert.equal(call('value-property-get',1,key,0),2);assert.equal(call('value-property-get',number,key,0),2);assert.equal(call('value-property-get',2,missing,0),3);
 call('value-object-put',root,standard,1,2);assert.equal(call('value-property-get',2,standard,0),1);
 call('heap-collect');assert.equal(call('value-property-get',1,key,0),2);
 call('value-standard-prototypes-close');call('heap-collect');assert.equal(call('value-standard-prototype-existing',0),root);assert.equal(call('value-property-get',number,key,0),2);
 call('heap-release',object);call('heap-collect');assert.equal(call('value-standard-prototype-existing',0),0);assert.equal(call('value-property-get',1,key,0),3);
 for(const value of[key,missing,standard,number])call('heap-release',value);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});

test('real WASM primitive-read traps propagate and unwind private frames while preserving caller roots',async()=>{
 const text=await readFile('bootstrap/runtime/memory.eli','utf8'),start=text.indexOf('  (defun heap-primitive-property-get '),end=text.indexOf('  (defun value-property-get ',start);assert(start>=0&&end>start);
 const rt=b.compiler.compile_ir_string(text.slice(0,start)+'  (defun heap-primitive-property-get (heap receiver key nullish) (load-u32 4294967295))\n'+text.slice(end),'primitive-trap.eli'),a=instantiateManagedRuntime(artifact(rt));a.auto(1);
 const key=a.string('absent'),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);assert.throws(()=>a.invoke('member',[true,key]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.leaveFrame(frame);finish(a,[key,held]);
});


const inheritedIteratorSource=`
 (defconst iterate (js* "(iterable, visit) => { for (const item of iterable) visit(item); }"))
 (defun install (method) (put (js* "Object.prototype") (js* "Symbol.iterator") method))
 (defun install-good (trace)
   (install (lambda ()
     (js-call trace :push "iterator")
     (let ((index 0) (iterator (js-object)))
       (put iterator :next (lambda ()
         (js-call trace :push "next")
         (if (= index 0) (progn (setq index 1) (js-object :done false :value 7))
           (js-object :done t))))
       iterator))))
 (defun run (value trace) (funcall iterate value (lambda (item) (js-call trace :push item))))
 (defun spread (value) (funcall (js* "(iterable) => [...iterable]") value))
 (defun from (value) (Array/from value))
 (defun member (value) (aref value (js* "Symbol.iterator")))
 (defun primitive-key (value)
   (put (js* "Object.prototype") (js* "Symbol.toPrimitive") (lambda (hint) (throw "unexpected-boxing")))
   (aref value 1))
 (export install install-good run spread from member primitive-key)`;
async function inheritedIteratorFamily(){
 const p=b.compiler.compile_ir_string(inheritedIteratorSource,'primitive-inherited-iterator.eli');
 const bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
 return {a:instantiateManagedRuntime(bytes),reference};
}
function restorePrototype(key,descriptor){if(descriptor)Object.defineProperty(Object.prototype,key,descriptor);else delete Object.prototype[key];}
function primitiveInput(a,value){if(Array.isArray(value)){const items=value.map(item=>primitiveInput(a,item));try{return a.sourceArray(items);}finally{items.forEach(item=>a.release(item));}}return typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;}

test('Boolean and Number inherited Symbol.iterator is shared by property Get required for-of spread and optional Array.from',async()=>{
 const {a,reference}=await inheritedIteratorFamily();a.auto(1);
 const old=Object.getOwnPropertyDescriptor(Object.prototype,Symbol.iterator);
 const native=(expected,work)=>{try{reference.install_good(expected);return work();}finally{restorePrototype(Symbol.iterator,old);}};
 try{
  for(const value of[false,true,0,-0,3,NaN,Infinity]){
   const input=primitiveInput(a,value),trace=a.sourceArray([]),expected=[];
   try{
    a.release(a.invoke('install-good',[trace]));
    const member=a.invoke('member',[input]);assert.equal(member.kind,18);a.release(member);
    const result=native(expected,()=>reference.run(value,expected));
    assert.equal(a.invoke('run',[input,trace]),result);assert.deepEqual(read(a,trace),expected);
    for(const name of['spread','from']){const wanted=native(expected,()=>reference[name](value)),out=a.invoke(name,[input]);try{assert.deepEqual(read(a,out),wanted);assert.deepEqual(read(a,trace),expected);}finally{a.release(out);}}
   }finally{a.release(input);a.release(trace);a.collect();}
  }
 }finally{restorePrototype(Symbol.iterator,old);finish(a);}
});

test('primitive inherited iteration keeps native String Array precedence nullish and noncallable errors and primitive conversion boundaries',async()=>{
 const {a,reference}=await inheritedIteratorFamily();a.auto(1);
 const old=Object.getOwnPropertyDescriptor(Object.prototype,Symbol.iterator),oldPrimitive=Object.getOwnPropertyDescriptor(Object.prototype,Symbol.toPrimitive);
 const native=(method,work)=>{try{reference.install(method);return work();}finally{restorePrototype(Symbol.iterator,old);}};
 try{
  for(const method of[false,null,undefined]){
   a.release(a.invoke('install',[method]));
   for(const value of[false,3,null,undefined]){
    const input=primitiveInput(a,value),trace=a.sourceArray([]);
    try{for(const name of['run','spread','from']){
     if(name==='from'&&value!=null&&method!==false){const wanted=native(method,()=>reference.from(value)),out=a.invoke(name,[input]);try{assert.deepEqual(read(a,out),wanted);}finally{a.release(out);}}
     else{assert.throws(()=>native(method,()=>reference[name](value,[])),TypeError);assert.throws(()=>a.invoke(name,name==='run'?[input,trace]:[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');}
    }}finally{a.release(input);a.release(trace);}
   }
  }
  const trace=a.sourceArray([]),expected=[];a.release(a.invoke('install-good',[trace]));
  try{
   for(const value of['A😀',[1,2]]){
    const input=primitiveInput(a,value);
    try{
     let result;try{reference.install_good(expected);result=reference.run(value,expected);}finally{restorePrototype(Symbol.iterator,old);}
     assert.equal(a.invoke('run',[input,trace]),result);
     for(const name of['spread','from']){let wanted;try{reference.install_good(expected);wanted=reference[name](value);}finally{restorePrototype(Symbol.iterator,old);}const out=a.invoke(name,[input]);try{assert.deepEqual(read(a,out),wanted);}finally{a.release(out);}}
    }finally{a.release(input);}
   }
   assert.deepEqual(read(a,trace),expected);assert.deepEqual(expected,['A','😀',1,2]);
   const number=a.number(3);try{assert.equal(a.invoke('primitive-key',[number]),undefined);let result;try{result=reference.primitive_key(3);}finally{restorePrototype(Symbol.toPrimitive,oldPrimitive);}assert.equal(result,undefined);}finally{a.release(number);}
  }finally{a.release(trace);}
 }finally{restorePrototype(Symbol.iterator,old);restorePrototype(Symbol.toPrimitive,oldPrimitive);finish(a);}
});

test('sealed String and Symbol access keys return without allocation even when every heap slot is occupied',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](64,16384,131072);
 const call=(name,...args)=>{const value=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;};
 const receiver=call('value-object-new',0);call('heap-pin',receiver);
 const text=call('value-string',21);call('heap-pin',text);for(let i=0;i<21;i++)call('value-unit-set',text,i,120);call('value-seal',text);
 const symbol=call('value-symbol-well-known',0);call('heap-pin',symbol);
 const held=call('value-number',0,2147483648),frame=call('frame-new',1);call('frame-set',frame,0,held);call('heap-auto',1);
 const snapshot=()=>[call('heap-used'),call('heap-live'),call('heap-collections'),call('frame-depth')];
 const check=()=>{const before=snapshot();for(const owner of[1,2,receiver,held])for(const key of[text,symbol])assert.equal(call('value-source-access-key',owner,key),key);assert.deepEqual(snapshot(),before);assert.equal(call('frame-get',frame,0),held);};
 check();const fillers=[];while(call('heap-live')<64){const value=call('value-number',0,0);call('heap-pin',value);fillers.push(value);}check();
 for(const value of[text,symbol,receiver,...fillers])call('heap-release',value);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});

test('allocation-free access-key validation rejects unsealed stale invalid and private handles without disturbing caller roots',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](64,16384,131072);
 const call=(name,...args)=>{const value=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;};
 const receiver=call('value-object-new',0);call('heap-pin',receiver);
 const good=call('value-string',1),unsealed=call('value-string',1),stale=call('value-string',1);call('heap-pin',good);call('heap-pin',unsealed);call('value-unit-set',good,0,120);call('value-seal',good);call('heap-collect');
 const frame=call('frame-new',1);call('frame-set',frame,0,receiver);call('heap-auto',1);
 const fillers=[];while(call('heap-live')<64){const value=call('value-number',0,0);call('heap-pin',value);fillers.push(value);}
 const before=[call('heap-used'),call('heap-live'),call('heap-collections')];
 for(const [owner,key,code]of[[receiver,unsealed,6],[receiver,stale,1],[receiver,0xffffffff,1],[receiver,frame,3],[0xffffffff,good,1],[frame,good,3]]){assert.equal(e['value-source-access-key'](h,owner,key),0);assert.equal(e['last-error'](),code);assert.deepEqual([call('heap-used'),call('heap-live'),call('heap-collections')],before);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',frame,0),receiver);}
 for(const value of[good,unsealed,receiver,...fillers])call('heap-release',value);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});
