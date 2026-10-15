import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-word-'));backend=await buildBackends({outputRoot:directory});
 runtimeProgram=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-word.eli','utf8'),'word.eli');
 bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const numbers=[0,-0,1,-1,.1,-.1,3.5,-3.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**31-1,2**31,2**32-1,2**32+1,-(2**32)-1,2**52+1,2**53-1,2**53+2,2**83,2**84];
function check(a,name,inputs){const args=inputs.map(x=>a.number(x));let result;try{result=a.invoke(name,args);assert(Object.is(a.readNumber(result),js[name.replaceAll('-','_')](...inputs)),`${name}(${inputs.join(',')})`);}finally{a.release(result);args.forEach(x=>a.release(x));}a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('ordinary Number word conversions and operators preserve all IEEE boundaries under GC',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const x of numbers){for(const name of['signed','unsigned','invert'])check(a,name,[x]);for(const y of numbers)for(const name of['remainder','modulo','mask','union','exclusive','shift-left','shift-right','logical-right','multiply','snapshot','remainder-snapshot'])check(a,name,[x,y]);}
});
test('remainder retains exact subnormal results and dividend zero sign without rounded quotient multiplication',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const pair of[[1,.1],[1e16,3],[Number.MAX_VALUE,3],[Number.MAX_VALUE,Number.MIN_VALUE],[Number.MIN_VALUE*3,Number.MIN_VALUE*2],[1,Number.MIN_VALUE*3],[-4,2],[-0,3],[3,-0],[1,Infinity],[Infinity,1]])check(a,'remainder',pair);
 for(const triple of[[17,5,2],[-17,5,2],[Number.MAX_VALUE,3,.1],[NaN,1,2],[17,0,2]])check(a,'remainder-many',triple);
});
test('conversion handles every exponent boundary and fractional truncation before modulo 2^32',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(let e=-1074;e<=1023;e++)for(const x of[2**e,-(2**e)])for(const name of['signed','unsigned','invert'])check(a,name,[x]);
 for(let e=0;e<85;e++)for(const x of[2**e+1,2**e+.5,-(2**e+1),-(2**e+.5)])for(const name of['signed','unsigned'])check(a,name,[x]);
});
test('shift counts are converted and masked, signed and logical right shift remain distinct, imul wraps exactly',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const x of[-1,-2,2**31,2**32-1,0x7fffffff,0x80000001,0xfffffffd])for(const count of[-65,-33,-32,-31,-1,0,1,20,31,32,33,63,64,65,2**32+1,NaN,Infinity])for(const name of['shift-left','shift-right','logical-right'])check(a,name,[x,count]);
 for(const pair of[[0xffffffff,0xffffffff],[0xffffffff,0xfffffffd],[0x80000001,0x80000001],[0x7fffffff,0x7fffffff]])check(a,'multiply',pair);
});
test('random float64 pairs and integer words agree with independent JS arithmetic without approximation',()=>{
 let state=0x4e69537;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},v=new DataView(new ArrayBuffer(8));
 const random=()=>{v.setUint32(0,next(),true);v.setUint32(4,next(),true);return v.getFloat64(0,true);};const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(let i=0;i<2048;i++){const x=random(),y=random();for(const name of['remainder','signed','unsigned','mask','exclusive','multiply','logical-right'])check(a,name,name==='signed'||name==='unsigned'?[x]:[x,y]);check(a,'multiply',[next(),next()]);}
});
test('ordinary word loops preserve evaluation order and automatically reclaim boxed results',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:8192,maxBytes:1048576});a.auto(1);
 for(const seed of[0,-0,NaN,Infinity,Number.MAX_VALUE,0x80000001])check(a,'loop-mix',[128,seed]);assert(a.stats().collections>1000);
});
test('exact subnormal remainder is exhaustive across small integer significands and signs',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(let x=0;x<64;x++)for(let y=1;y<32;y++)for(const sign of[1,-1])check(a,'remainder',[sign*x*Number.MIN_VALUE,y*Number.MIN_VALUE]);
});
test('a word-operation error suppresses a later genuine trap and unwinds only its own frames',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-truth (heap value)'),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+source.slice(end),'trap-runtime.eli');
 const ir=backend.compiler.compile_ir_string('(defun crash (x y) (progn (bit-xor x y) (if x 1 2))) (export crash)','word-error.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(ir,injected))),text=a.sourceObject({}),n=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,n);
 assert.throws(()=>a.invoke('crash',[text,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);
 assert.throws(()=>a.invoke('crash',[n,n]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);
 const retained=a.frameGet(caller,0);assert(Object.is(a.readNumber(retained),-0));a.release(retained);a.leaveFrame(caller);a.release(text);a.release(n);a.collect();assert.equal(a.live(),0);
});
test('unsupported coercion and invalid word IR are explicit, source-bound and do not mutate input IR',()=>{
 const saved=JSON.stringify(program);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),saved);
 const supported=backend.compiler.compile_ir_string('(defun f (x) (if false (string-to-number x) x)) (export f)','supported-word.eli'),original=JSON.stringify(supported);assert(WebAssembly.validate(Uint8Array.from(backend.managed.emit_managed_wasm(supported,runtimeProgram))));assert.equal(JSON.stringify(supported),original);
 for(const expression of['(string-to-bigint x)','(imul32 x)','(bit-or x 1 2)','(int32 x x)']){const ir=backend.compiler.compile_ir_string(`(defun f (x) (if false ${expression} x)) (export f)`,'unsupported-word.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='unsupported-word.eli');}
 const a=instantiateManagedRuntime(bytes),n=a.number(1),text=a.string('1'),opaque=a.sourceObject({});for(const name of['remainder','multiply','exclusive']){const out=a.invoke(name,[text,n]);assert(Object.is(a.readNumber(out),js[name](1,1)));a.release(out);assert.throws(()=>a.invoke(name,[opaque,n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');}a.release(n);a.release(text);a.release(opaque);a.collect();assert.equal(a.live(),0);
});
test('Node independently executes the identical ordinary word artifact and collects every result',async()=>{
 const path=resolve(directory,'word.wasm');await writeFile(path,bytes);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const x=a.number(Number.MAX_VALUE),y=a.number(3),out=a.invoke('remainder',[x,y]);assert(Object.is(a.readNumber(out),Number.MAX_VALUE%3));a.release(out);a.release(x);a.release(y);const n=a.number(128),seed=a.number(0xfffffffd),mixed=a.invoke('loop-mix',[n,seed]);let expected=0xfffffffd;for(let i=0;i<128;i++)expected=Math.imul(expected,1664525)^(i>>>0);assert.equal(a.readNumber(mixed),expected);a.release(mixed);a.release(n);a.release(seed);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
