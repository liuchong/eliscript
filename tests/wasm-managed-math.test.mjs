import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const methods=['round','floor','ceil','trunc'];let directory,b,runtime;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-math-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function compiled(source,options){const p=b.compiler.compile_ir_string(source,'math.eli'),saved=JSON.stringify(p),bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));assert.equal(JSON.stringify(p),saved);assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),a=instantiateManagedRuntime(bytes,options);a.auto(1);return{a,js,bytes};}
const box=(a,v)=>typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;
function check(a,name,v,expected){const input=box(a,v),out=a.invoke(name,[input]);assert(Object.is(a.readNumber(out),expected),name+': '+String(v));a.release(out);a.release(input);assert.equal(a.stats().frameDepth,0);}
function finish(a,values=[]){values.forEach(v=>a.release(v));a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
const family=methods.map(m=>`(defun ${m} (x) (js-call globalThis.Math :${m} x)) (defun ${m}-alias (x) (let ((f Math/${m})) (f x))) (defun ${m}-empty () (Math/${m}))`).join(' ')+' (export '+methods.flatMap(m=>[m,m+'-alias',m+'-empty']).join(' ')+')';

test('Math integer rounding preserves primitive conversion, missing arguments and all IEEE boundaries inside zero-import WASM',async()=>{
 const {a,js}=await compiled(family),values=[undefined,null,false,true,'',' ','-0','0.5','-0.5','2.25','0x10','x','\ud800',NaN,Infinity,-Infinity,-0,0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,.49999999999999994,.5,.5000000000000001,-.49999999999999994,-.5,-.5000000000000001,1.5,-1.5,2.5,-2.5,2**31-.5,-(2**31)-.5,2**32-.5,-(2**32)-.5,2**52-.5,-(2**52)+.5,2**52,2**53,Number.MAX_SAFE_INTEGER];
 for(const m of methods){for(const v of values)for(const name of[m,m+'-alias'])check(a,name,v,js[name.replaceAll('-','_')](v));const out=a.invoke(m+'-empty');assert(Number.isNaN(a.readNumber(out)));a.release(out);}finish(a);
});

test('Math integer rounding matches exact random binary64 inputs across both fractional words',async()=>{
 const {a}=await compiled(family),buffer=new ArrayBuffer(8),view=new DataView(buffer);let state=0x297c61ad;
 for(let i=0;i<4096;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;view.setUint32(0,state,true);state=(Math.imul(state,1664525)+1013904223)>>>0;view.setUint32(4,i<2048?state:((state&0x800fffff)|((1022+i%54)<<20))>>>0,true);const value=view.getFloat64(0,true);for(const m of methods)check(a,m,value,Math[m](value));}finish(a);
});

test('raw Math operations preserve exact nonfinite payloads and reject invalid handles, private frames and unfinished strings without losing roots',async()=>{
 const {a,bytes}=await compiled(family);finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](32,8192,8192),call=(name,...args)=>{const out=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 for(const [low,high]of[[0,0],[0,0x80000000],[0,0x7ff00000],[0,0xfff00000],[0x12345678,0x7ff12345],[0x9abcdef0,0xfff81234]]){const value=call('value-number',low,high),before=call('heap-used');for(let op=0;op<4;op++){assert.equal(call('value-math-integer',value,op),value);const p=call('value-data',value,4),v=new DataView(e.memory.buffer);assert.equal(v.getUint32(p,true),low);assert.equal(v.getUint32(p+4,true),high);assert.equal(call('heap-used'),before);}}
 call('heap-collect');const input=call('value-number',0,0x3ff80000),unsealed=call('value-string',1),frame=call('frame-new',2);call('frame-set',frame,0,input);call('frame-set',frame,1,unsealed);call('heap-auto',1);
 for(const [value,op,code]of[[0xffffffff,0,1],[frame,0,3],[input,4,3],[unsealed,0,6]]){assert.equal(e['value-math-integer'](heap,value,op),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',frame,0),input);}assert.equal(new DataView(e.memory.buffer).getFloat64(call('value-data',input,4),true),1.5);call('frame-pop',frame);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('Math capacity failure preserves borrowed Numbers and supports allocation-free integral results before recovery',async()=>{
 const {a,bytes}=await compiled(family);finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](32,8192,8192),call=(name,...args)=>{const out=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;},input=call('value-number',0,0x3ff80000),integer=call('value-number',0,0x40370000),held=[];call('heap-pin',input);call('heap-pin',integer);call('heap-auto',1);
 for(let i=0;i<64;i++){const n=e['value-number'](heap,0,0);if(!n){assert.equal(e['last-error'](),2);break;}call('heap-pin',n);held.push(n);}assert.equal(held.length,30);for(let op=0;op<4;op++)assert.equal(call('value-math-integer',integer,op),integer);assert.equal(e['value-math-integer'](heap,input,0),0);assert.equal(e['last-error'](),2);assert.equal(call('frame-depth'),0);assert.equal(new DataView(e.memory.buffer).getFloat64(call('value-data',input,4),true),1.5);
 held.forEach(n=>call('heap-release',n));call('heap-collect');const rounded=call('value-math-integer',input,0);assert.equal(new DataView(e.memory.buffer).getFloat64(call('value-data',rounded,4),true),2);call('heap-release',input);call('heap-release',integer);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('real WASM Math traps unwind conversion frames and retain preexisting caller roots and callback effects',async()=>{
 const source='(defun f (trace) (Math/round (js-object :valueOf (lambda () (put trace :called t) 1.5)))) (export f)',p=b.compiler.compile_ir_string(source,'math-trap.eli'),text=await readFile('bootstrap/runtime/memory.eli','utf8'),start=text.indexOf('  (defun heap-number-integer '),end=text.indexOf('  (defun value-math-integer ',start);assert(start>=0&&end>start);
 const injected=b.compiler.compile_ir_string(text.slice(0,start)+'  (defun heap-number-integer (heap value operation) (load-u32 4294967295))\n'+text.slice(end),'trap-runtime.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,injected)));a.auto(1);const trace=a.sourceObject({called:false}),frame=a.frame(1);a.frameSet(frame,0,trace);assert.throws(()=>a.invoke('f',[trace]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const key=a.string('called');assert.equal(a.objectGet(trace,key),true);a.leaveFrame(frame);finish(a,[trace,key]);
});

test('Node independently executes identical zero-import Math bytes and exact random results against its own Math implementation',async()=>{
 const {a,bytes}=await compiled(family);finish(a);const file=resolve(directory,'math.wasm');await writeFile(file,bytes);const result=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';const{instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(await readFile(process.argv[2]));a.auto(1);let state=0x712a9c31;const view=new DataView(new ArrayBuffer(8));for(let k=0;k<4096;k++){state=(Math.imul(state,1664525)+1013904223)>>>0;view.setUint32(0,state,true);state=(Math.imul(state,1664525)+1013904223)>>>0;view.setUint32(4,k<2048?state:((state&0x800fffff)|((1022+k%54)<<20))>>>0,true);const x=view.getFloat64(0,true),input=a.number(x);for(const name of['round','floor','ceil','trunc']){const out=a.invoke(name,[input]);assert(Object.is(a.readNumber(out),Math[name](x)),name+':'+x);a.release(out);}a.release(input);}a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});

test('Math first-class functions preserve identity, shadows, extra argument effects and number-hint callback order',async()=>{
 const source=`(defun identity () (js-array (= Math/round Math/round) (= Math/round Math/floor)))
 (defun shadows () (let ((Math (js-object :round (lambda (x) (+ x 10)) :floor (lambda (x) (- x 10))))) (js-array (Math/round 3) (js-call Math :floor 3))))
 (defun order () (let ((trace (js-object :events ""))) (let ((value (js-call globalThis.Math :round (js-object :valueOf (lambda () (put trace :events (str (get trace :events) "v")) (js-object)) :toString (lambda () (put trace :events (str (get trace :events) "s")) "-1.5")) (put trace :events "e")))) (str value ":" (get trace :events)))))
 (defun failure (trace) (Math/ceil (js-object :valueOf (lambda () (put trace :called t) (js-object)) :toString (lambda () (js-object))))) (export identity shadows order failure)`;
 const {a,js}=await compiled(source);for(const name of['identity','shadows']){const out=a.invoke(name),expected=js[name]();for(let i=0;i<expected.length;i++){const child=a.get(out,i);assert(Object.is(child?.kind===4?a.readNumber(child):child,expected[i]));a.release(child);}a.release(out);}const out=a.invoke('order');assert.equal(a.readString(out),js.order());a.release(out);
 const trace=a.sourceObject({called:false});assert.throws(()=>a.invoke('failure',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,0);const key=a.string('called');assert.equal(a.objectGet(trace,key),true);finish(a,[trace,key]);
});

test('Math number conversion follows inherited valueOf, noncallable fallback and ordinary array text conversion',async()=>{
 const source='(defun f () (let* ((parent (js-object :valueOf (lambda () "-2.5"))) (child (js-object :__proto__ parent))) (js-array (Math/round child) (Math/floor (js-array)) (Math/ceil (js-array "-1.25")) (Math/trunc (js-array nil)) (Math/round (js-array 2 1)) (Math/round (js-object :valueOf 7 :toString (lambda () "2.5")))))) (export f)',{a,js}=await compiled(source),out=a.invoke('f'),expected=js.f();
 for(let i=0;i<expected.length;i++){const value=a.get(out,i);assert(Object.is(a.readNumber(value),expected[i]),String(i));a.release(value);}finish(a,[out]);
});
