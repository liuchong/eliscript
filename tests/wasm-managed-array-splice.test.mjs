import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-splice-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const own=' (defun own (items key) (object-has? items key)) ';
const basic=`(defconst marker 1)
 (defun zero (items) (js-call items :splice))
 (defun one (items start) (js-call items :splice start))
 (defun two (items start count) (js-call items :splice start count))
 (defun many (items start count first second) (js-call items :splice start count first second))
 (defun observed (items start count) (js-array (js-call items :splice start count) items))
 ${own} (export zero one two many observed own)`;
async function compiled(source=basic,options,rt=runtime){const p=b.compiler.compile_ir_string(source+' (defun properties (items) (object-keys items)) (defun property (items key) (aref items key)) (export properties property)','array-splice.eli'),saved=JSON.stringify(p),bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.equal(JSON.stringify(p),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return{a,bytes,p,js:await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'))};}
function box(a,v){if(typeof v==='number')return a.number(v);if(typeof v==='string')return a.string(v);if(Array.isArray(v)){const values=v.map(x=>box(a,x));try{return a.sourceArray(values);}finally{values.forEach(x=>a.release(x));}}return v;}
function read(a,v){if(!v||typeof v!=='object')return v;if(v.kind===4)return a.readNumber(v);if(v.kind===5)return a.readString(v);assert.equal(v.kind,14);const out=Array(a.length(v));for(let i=0;i<out.length;i++){const key=a.number(i);let present;try{present=a.invoke('own',[v,key]);}finally{a.release(key);}if(present){const value=a.get(v,i);try{out[i]=read(a,value);}finally{a.release(value);}}}const keys=a.invoke('properties',[v]);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i);try{const name=a.readString(key);if(String(Number(name)>>>0)!==name||Number(name)>=4294967295){const child=a.invoke('property',[v,key]);try{Object.defineProperty(out,name,{value:read(a,child),writable:true,enumerable:true,configurable:true});}finally{a.release(child);}}}finally{a.release(key);}}}finally{a.release(keys);}return out;}
function finish(a,roots=[]){roots.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function exercise(a,js,name,values,args){const input=box(a,values),boxed=args.map(v=>box(a,v)),reference=values.slice();let result;try{result=a.invoke(name,[input,...boxed]);assert.deepEqual(read(a,result),js[name](reference,...args));assert.deepEqual(read(a,input),reference);assert.equal(a.keyEqual(result,input),false);}finally{a.release(result);a.release(input);boxed.forEach(v=>a.release(v));}}
test('ordinary Array splice preserves zero one two and inserted argument semantics sparse ownership and exact integer coercion',async()=>{
 const {a,js}=await compiled(),sparse=Array(5);sparse[1]=undefined;sparse[3]=-0;
 for(const values of[[],[0,-0,NaN,'中😀',false,null,undefined],sparse]){
  exercise(a,js,'zero',values,[]);
  for(const start of[undefined,null,false,true,NaN,-Infinity,Infinity,-0,.9,-.9,1.9,-1.9,99,-99,'2','-2','bad']){exercise(a,js,'one',values,[start]);for(const count of[undefined,null,false,NaN,-Infinity,Infinity,-1,0,1.9,99,'2']){exercise(a,js,'two',values,[start,count]);exercise(a,js,'many',values,[start,count,'insert',undefined]);}}
 }
 finish(a);
},30000);

test('splice snapshots length before start then deleteCount conversions and observes their live mutations',async()=>{
 const text=`(defconst marker 1)
 (defun mutate (mode)
   (let* ((items (js-array 1 2 3 4)) (trace (js-array))
     (start (js-object :valueOf (lambda () (js-call trace :push "start")
       (cond ((= mode 0) (put items :length 1)) ((= mode 1) (js-call items :push 9 10)) (t (put items 2 8))) -2.9)))
     (count (js-object :valueOf (lambda () (js-call trace :push "count") 1.9))))
     (js-array (js-call items :splice start count (progn (js-call trace :push "arg0") 7)
       (progn (js-call trace :push "arg1") undefined)) items trace)))
 (defun thrown (trace)
   (let ((items (js-array 1 2)) (start (js-object :valueOf (lambda () (js-call trace :push "start") (throw trace)))))
     (try (js-call items :splice start (progn (js-call trace :push "arg") 1))
       (catch error (Object/is error trace)))))
 ${own} (export mutate thrown own)`;
 const{a,js}=await compiled(text);for(const mode of[0,1,2]){const value=a.number(mode),out=a.invoke('mutate',[value]);assert.deepEqual(read(a,out),js.mutate(mode));a.release(out);a.release(value);}const trace=a.sourceArray([]),expected=[];assert.equal(a.invoke('thrown',[trace]),js.thrown(expected));assert.deepEqual(read(a,trace),expected);finish(a,[trace]);
});

test('splice captures own and inherited methods before all arguments and ordinary objects keep their callable receivers',async()=>{
 const text=`(defconst marker 1)
 (defun captured () (let ((items (js-array 1)) (trace (js-array)))
   (put items :splice (lambda (&rest args) (js-array "captured" (js-length args))))
   (js-array (js-call items :splice (progn (put items :splice false) (js-call trace :push "arg0") 0)
       (progn (js-call trace :push "arg1") 1) (progn (js-call trace :push "arg2") 7)) trace items)))
 (defun ordinary () (let ((item (js-object :splice (lambda (&rest args) (js-length args))))) (js-call item :splice 1 2 3)))
 (defun bad (items trace) (put items :splice false) (js-call items :splice (js-call trace :push "argument")))
 (defun nullish (items trace) (js-call items :splice (js-call trace :push "argument")))
 (defun inherited () (put (js* "Array.prototype") :splice (lambda (&rest args) (js-array "inherited" (js-length args)))) (js-call (js-array 1 2) :splice 0 1 7))
 ${own} (export captured ordinary bad nullish inherited own)`;
 const{a,js}=await compiled(text);for(const name of['captured','ordinary']){const out=a.invoke(name);assert.deepEqual(read(a,out),js[name]());a.release(out);}const input=box(a,[1]),trace=a.sourceArray([]),expected=[];assert.throws(()=>a.invoke('bad',[input,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>js.bad([1],expected),TypeError);assert.deepEqual(read(a,trace),expected);a.release(input);a.release(trace);
 for(const value of[null,undefined,false,1]){const receiver=box(a,value),events=a.sourceArray([]),expected=[];assert.throws(()=>a.invoke('nullish',[receiver,events]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>js.nullish(value,expected),TypeError);assert.deepEqual(read(a,events),expected);a.release(receiver);a.release(events);}
 const saved=Object.getOwnPropertyDescriptor(Array.prototype,'splice');let wanted;try{wanted=js.inherited();}finally{Object.defineProperty(Array.prototype,'splice',saved);}const out=a.invoke('inherited');assert.deepEqual(read(a,out),wanted);a.release(out);finish(a);
});

test('splice preserves inherited indexed Get and HasProperty when copying shifting and deleting sparse positions',async()=>{
 const text=`(defconst marker 1)
 (defun inherited (mode)
   (put (js* "Array.prototype") 1 "prototype")
   (let ((items (js-array))) (put items :length 5) (put items 3 "own")
     (js-array (if (= mode 0) (js-call items :splice 0 2) (js-call items :splice 1 0 "new")) items)))
 ${own} (export inherited own)`;
 const{a,js}=await compiled(text),saved=Object.getOwnPropertyDescriptor(Array.prototype,'1');
 for(const mode of[0,1]){let wanted;try{wanted=js.inherited(mode);}finally{if(saved)Object.defineProperty(Array.prototype,'1',saved);else delete Array.prototype[1];}const input=a.number(mode),out=a.invoke('inherited',[input]);assert.deepEqual(read(a,out),wanted);a.release(input);a.release(out);}finish(a);
});

test('splice checks frozen arrays and unsupported species only after numeric conversion and leaves ordinary inputs intact on rejection',async()=>{
 const text=`(defconst marker 1)
 (defun rejected (mode trace)
   (let ((items (js-array 1 2 3)))
     (if (= mode 0) (Object/freeze items) (put items :constructor 7))
     (try (js-call items :splice
       (js-object :valueOf (lambda () (js-call trace :push "start") 0))
       (js-object :valueOf (lambda () (js-call trace :push "count") 1))
       (progn (js-call trace :push "arg") 7))
       (catch error (js-array (get error :name) items)))))
 ${own} (export rejected own)`;
 const{a,js}=await compiled(text);for(const mode of[0,1]){const value=a.number(mode),trace=a.sourceArray([]),expected=[],out=a.invoke('rejected',[value,trace]);assert.deepEqual(read(a,out),js.rejected(mode,expected));assert.deepEqual(read(a,trace),expected);for(const v of[value,trace,out])a.release(v);}finish(a);
 for(const source of['(defun f (items ctor) (put ctor (js* "Symbol.species") (lambda () (js-array))) (put items :constructor ctor) (js-call items :splice 0 1)) (export f)','(defun f (items) (Object/defineProperty items "0" (js-object :get (lambda () 7))) (js-call items :splice 0 1)) (export f)']){const p=b.compiler.compile_ir_string(source,'splice-unsupported.eli');assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');}
});

test('deterministic random sparse splice inputs exactly match JS values holes result identity and surviving source elements',async()=>{
 const{a,js}=await compiled();let seed=0x416bc913;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,pool=[undefined,null,false,true,-0,NaN,1,2,'中😀','\ud800'];
 for(let i=0;i<128;i++){const values=Array(next()%32);for(let j=0;j<values.length;j++)if(next()%4)values[j]=pool[next()%pool.length];const start=(next()%96-48)/3,count=(next()%96-16)/3;exercise(a,js,'many',values,[start,count,pool[next()%pool.length],pool[next()%pool.length]]);a.collect();assert.equal(a.stats().frameDepth,0);}finish(a);
});

test('splice rejects inherited frozen numeric data at the original Set point after preserving earlier writes',async()=>{
 const text=`(defconst marker 1) (defun run ()
   (put (js* "Array.prototype") 1 7) (Object/freeze (js* "Array.prototype"))
   (let ((items (js-array))) (put items :length 3) (put items 2 2)
     (try (js-call items :splice 0 1) (catch error (js-array (get error :name) items)))))
 ${own} (export run own)`;
 const{a}=await compiled(text),parent=Object.create(Array.prototype);Object.defineProperty(parent,'1',{value:7,writable:false,enumerable:true,configurable:false});const values=Array(3);values[2]=2;Object.setPrototypeOf(values,parent);let error;try{values.splice(0,1);}catch(e){error=e;}
 const expected=Array(values.length);for(let i=0;i<values.length;i++)if(Object.hasOwn(values,i))expected[i]=values[i];const out=a.invoke('run');assert.deepEqual(read(a,out),[error.name,expected]);finish(a,[out]);
});

test('raw splice ABI rejects illegal private and malformed arguments while retaining caller roots and recovering from exhausted slots',async()=>{
 const{a,bytes}=await compiled();finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](64,16384,131072),call=(name,...args)=>{const out=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const items=call('value-array-new',3),args=call('value-refs',7,2),zero=call('value-number',0,0),one=call('value-number',0,1072693248),frame=call('frame-new',4);call('frame-set',frame,0,items);call('frame-set',frame,1,args);call('frame-set',frame,2,zero);call('frame-set',frame,3,one);call('value-set',items,0,2);call('value-set',items,2,1);call('value-set',args,0,zero);call('value-set',args,1,one);call('heap-auto',1);
 for(const[receiver,argv,code]of[[0xffffffff,args,1],[frame,args,1],[items,0xffffffff,1],[items,items,1],[items,frame,1]]){assert.equal(e['value-array-splice'](h,receiver,argv),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',frame,0),items);}
 const data=call('value-data',args,7),view=new DataView(e.memory.buffer);view.setUint32(data,0xffffffff,true);assert.equal(e['value-array-splice'](h,items,args),0);assert.equal(e['last-error'](),1);view.setUint32(data,frame,true);assert.equal(e['value-array-splice'](h,items,args),0);assert.equal(e['last-error'](),3);view.setUint32(data,zero,true);
 const held=[];while(call('heap-live')<64){const value=call('value-number',0,0);call('heap-pin',value);held.push(value);}assert.equal(e['value-array-splice'](h,items,args),0);assert.equal(e['last-error'](),2);assert.equal(call('frame-depth'),1);assert.equal(call('value-length',items),3);held.forEach(value=>call('heap-release',value));call('heap-collect');const out=call('value-array-splice',items,args);assert.equal(call('value-length',out),1);assert.equal(call('value-get',out,0),2);assert.equal(call('value-length',items),2);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('a real splice move trap escapes source catches and only unwinds private frames after already-evaluated argument effects',async()=>{
 const text=`(defconst marker 1) (defun run (items trace)
   (try (js-call items :splice (progn (js-call trace :push "argument") 0) 1)
     (catch error "incorrectly-caught"))) ${own} (export run own)`,raw=await readFile('bootstrap/runtime/memory.eli','utf8'),start=raw.indexOf('  (defun heap-array-splice-move '),end=raw.indexOf('  (defun ',start+10);assert(start>=0&&end>start);
 const rt=b.compiler.compile_ir_string(raw.slice(0,start)+'  (defun heap-array-splice-move (heap value from to frame) (load-u32 4294967295))\n'+raw.slice(end),'splice-trap.eli'),{a}=await compiled(text,undefined,rt),items=box(a,[1,2,3]),trace=a.sourceArray([]),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 assert.throws(()=>a.invoke('run',[items,trace]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));assert.deepEqual(read(a,trace),['argument']);assert.deepEqual(read(a,items),[1,2,3]);a.leaveFrame(caller);finish(a,[items,trace,held]);
});

test('Node independently executes identical zero-import splice bytes and sparse native JavaScript mutation semantics',async()=>{
 const{a,bytes}=await compiled();finish(a);const file=resolve(directory,'splice.wasm');await writeFile(file,bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const bytes=readFileSync(process.argv[2]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',box.toString(),read.toString(),finish.toString(),exercise.toString(),"const js={zero:items=>items.splice(),one:(items,start)=>items.splice(start),two:(items,start,count)=>items.splice(start,count),many:(items,start,count,a,b)=>items.splice(start,count,a,b)};const a=instantiateManagedRuntime(bytes);a.auto(1);let seed=0x735a192b;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let i=0;i<64;i++){const values=Array(next()%16);for(let j=0;j<values.length;j++)if(next()%4)values[j]=[undefined,null,false,NaN,-0,'中😀'][next()%6];exercise(a,js,'zero',values,[]);for(const start of[undefined,NaN,Infinity,-Infinity,-1.9,0,1.9])exercise(a,js,'many',values,[start,next()%24-4,undefined,'x']);}finish(a);"].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('splice observes represented inherited constructor overrides after conversions and an own undefined constructor shadows them',async()=>{
 const text=`(defconst marker 1) (defun run (shadow trace)
   (put (js* "Array.prototype") :constructor 7)
   (let ((items (js-array 1 2)))
     (when shadow (put items :constructor undefined))
     (try (js-array "ok" (js-call items :splice
       (js-object :valueOf (lambda () (js-call trace :push "start") 0))
       (js-object :valueOf (lambda () (js-call trace :push "count") 1))))
       (catch error (js-array (get error :name))))))
 ${own} (export run own)`;
 const{a,js}=await compiled(text),saved=Object.getOwnPropertyDescriptor(Array.prototype,'constructor');
 for(const shadow of[false,true]){const trace=a.sourceArray([]),expected=[];let wanted;try{wanted=js.run(shadow,expected);}finally{Object.defineProperty(Array.prototype,'constructor',saved);}const out=a.invoke('run',[shadow,trace]);assert.deepEqual(read(a,out),wanted);assert.deepEqual(read(a,trace),expected);a.release(trace);a.release(out);}finish(a);
});
