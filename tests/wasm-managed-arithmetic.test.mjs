import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-arithmetic-'));
 backend=await buildBackends({outputRoot:directory});
 runtimeProgram=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-arithmetic.eli','utf8'),'arithmetic.eli');
 bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));
 assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const numbers=[0,-0,1,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,2**53,1e16,.1,-.25];
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
const read=(a,x)=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):x.kind===5?a.readString(x):x:x;
function check(a,name,inputs){const handles=inputs.map(x=>box(a,x));let result;try{result=a.invoke(name,handles);assert(Object.is(read(a,result),js[name.replaceAll('-','_')](...inputs)),name);}finally{a.release(result);for(const h of handles)a.release(h);}a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('ordinary Number arithmetic, unary operations and relations exactly match JS IEEE semantics under GC',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:8192,maxBytes:65536});a.auto(1);
 for(const x of numbers){for(const name of['negate','reciprocal','increment','decrement','unary-add','unary-multiply'])check(a,name,[x]);
  for(const y of numbers)for(const name of['add','subtract','multiply','divide','equal','distinct','not-equal','less','less-equal','greater','greater-equal','snapshot'])check(a,name,[x,y]);}
 check(a,'zero',[]);check(a,'one',[]);assert(a.stats().collections>1000);
});
test('variadic arithmetic keeps left association and comparisons capture every argument before comparing',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 const triples=[[1,1e16,-1e16],[1e16,-1e16,1],[Number.MAX_VALUE,2,.5],[-0,0,-0],[NaN,1,2],[1,NaN,2],[1,1,2],[1,2,1],[3,2,1],[0,1,1],[Infinity,-Infinity,Number.MIN_VALUE]];
 for(const inputs of triples)for(const name of['ordered-sum','ordered-product','ordered-subtract','ordered-divide','equal-three','distinct-three','less-three','compare-snapshot'])check(a,name,inputs);
 check(a,'comparison-effects',[2,1]);check(a,'comparison-effects',[NaN,NaN]);
});
test('strict equality preserves primitive types, NaN and opaque identity independently of Map key equivalence',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 const values=[null,false,true,undefined,...numbers,'','x','中😀\ud800'];
 for(const left of values)for(const right of values)for(const name of['equal','identical','distinct','not-equal'])check(a,name,[left,right]);
 const object=a.map(),alias=a.invoke('unary-add',[object]),other=a.map(),array=a.array();
 for(const [x,y,expected]of[[object,alias,true],[object,other,false],[object,array,false],[array,array,true],[object,null,false]]){
  assert.equal(a.invoke('equal',[x,y]),expected);assert.equal(a.invoke('identical',[x,y]),expected);assert.equal(a.invoke('distinct',[x,y]),!expected);
 }
 const nan=a.number(NaN);assert(a.keyEqual(nan,nan));assert.equal(a.invoke('equal',[nan,nan]),false);
 for(const x of[nan,object,alias,other,array])a.release(x);a.collect();assert.equal(a.live(),0);
});
test('UTF16 relational comparisons use code unit order including NUL and unpaired surrogates',()=>{
 const a=instantiateManagedRuntime(bytes),values=['','a','aa','\0','中','😀','\ud800','\udfff','\ud800x'];a.auto(1);
 for(const x of values)for(const y of values)for(const name of['less','less-equal','greater','greater-equal'])check(a,name,[x,y]);
 for(const x of values)check(a,'unary-multiply',[x]);
});
test('ordinary numeric loops and recursive calls reclaim expression temporaries and retain caller roots',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:8192,maxBytes:1048576});a.auto(1);
 for(const name of['sum-to','recursive-sum'])for(const n of[0,1,8,32])check(a,name,[n]);
 for(let i=0;i<100;i++)check(a,'sum-to',[32]);assert(a.stats().collections>1000);
});
test('arithmetic type or capacity failures unwind their frames without evaluating a later trapping expression',async()=>{
 const runtimeSource=await readFile('bootstrap/runtime/memory.eli','utf8'),start=runtimeSource.indexOf('  (defun value-truth (heap value)'),end=runtimeSource.indexOf('  (defun value-data',start);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(runtimeSource.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+runtimeSource.slice(end),'later-trap.eli');
 const original=backend.compiler.compile_ir_string('(defun first-error (x y) (+ (+ x y) (if x 1 2))) (export first-error)','first-error.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(original,injected)));const text=a.string('x'),n=a.number(2),frame=a.frame(1);a.frameSet(frame,0,n);
 assert.throws(()=>a.invoke('first-error',[text,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(a.stats().frameDepth,1);
 assert.throws(()=>a.invoke('first-error',[n,n]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);
 const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),2);a.release(saved);a.leaveFrame(frame);a.release(text);a.release(n);a.collect();assert.equal(a.live(),0);
 const small=instantiateManagedRuntime(bytes,{maxSlots:8,initialBytes:512,maxBytes:512});small.auto(1);const input=small.number(-0),caller=small.frame(1);small.frameSet(caller,0,input);const padding=[small.array(),small.array()];
 assert.throws(()=>small.invoke('sum-to',[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(small.stats().frameDepth,1);
 const retained=small.frameGet(caller,0);assert(Object.is(small.readNumber(retained),-0));small.release(retained);small.leaveFrame(caller);for(const p of padding)small.release(p);small.release(input);small.collect();assert.equal(small.live(),0);
});
test('independent random float64 bit patterns preserve exact arithmetic results and strict relations',()=>{
 let state=0x6239c71;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},view=new DataView(new ArrayBuffer(8));
 const random=()=>{view.setUint32(0,next(),true);view.setUint32(4,next(),true);return view.getFloat64(0,true);};
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(let i=0;i<512;i++){const pair=[random(),random()];for(const name of['add','subtract','multiply','divide','equal','distinct','less','less-equal','greater','greater-equal'])check(a,name,pair);}
});
test('mixed coercion, invalid arithmetic types and foreign or stale operands fail explicitly without losing caller roots',()=>{
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),n=a.number(1),s=a.string('1'),foreign=b.number(1);
 for(const [name,args,code]of[['add',[s,n],'ELI-RT0001'],['negate',[null],'ELI-RT0001'],['less',[s,n],'ELI-RT0003'],['greater',[true,n],'ELI-RT0003'],['equal',[foreign,n],'ELI-RT0001']]){
  assert.throws(()=>a.invoke(name,args),e=>e.eliscriptDiagnostic?.code===code);assert.equal(a.stats().frameDepth,0);assert.equal(a.readNumber(n),1);
 }
 const stale=a.number(3);a.release(stale);a.collect();assert.throws(()=>a.invoke('equal',[stale,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 b.release(foreign);b.collect();a.release(n);a.release(s);a.collect();assert.equal(a.live(),0);
});
test('Node independently executes the ordinary numeric artifact with exact signed zeros and strict NaN equality',async()=>{
 const path=resolve(directory,'arithmetic.wasm');await writeFile(path,bytes);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const zero=a.number(-0),nan=a.number(NaN),one=a.number(1);const negative=a.invoke('multiply',[zero,one]);assert(Object.is(a.readNumber(negative),-0));assert.equal(a.invoke('equal',[nan,nan]),false);assert.equal(a.invoke('less',[nan,zero]),false);
 a.release(negative);a.release(nan);a.release(zero);a.release(one);const n=a.number(32),sum=a.invoke('sum-to',[n]);assert.equal(a.readNumber(sum),496);a.release(sum);a.release(n);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
test('unsupported numeric operations remain rejected in dead branches and input IR stays immutable',()=>{
 const before=JSON.stringify(program);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);
 for(const expression of['(% x 2)','(mod x 2)','(int32 x)','(bit-and x 1)']){const ir=backend.compiler.compile_ir_string(`(defun f (x) (if false ${expression} x)) (export f)`,'unsupported-number.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='unsupported-number.eli');}
});
