import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
let directory,backend;
beforeAll(async()=>{ directory=await mkdtemp(resolve(tmpdir(),'eliscript-memory-')); backend=await buildBackends({outputRoot:directory}); },120000);
afterAll(async()=>{ if(directory) await rm(directory,{recursive:true,force:true}); });
function compile(source,options={}) {
 const ir=backend.compiler.compile_ir_string(source,'memory-test.eli');
 const bytes=Uint8Array.from(backend.wasm.emit_memory_wasm(ir,options));
 assert(WebAssembly.validate(bytes));
 const module=new WebAssembly.Module(bytes);
 assert.deepEqual(WebAssembly.Module.imports(module),[]);
 return {bytes,exports:new WebAssembly.Instance(module).exports};
}
test('memory32 emits owned memory, full u32 literals and unsigned comparisons',()=>{
 const {exports:e}=compile('(defun high () 4294967295) (defun less (a b) (if (< a b) 1 0)) (defun truth (x) (if x 7 8)) (export high less truth)');
 assert(e.memory instanceof WebAssembly.Memory);
 assert.equal(e.high()>>>0,0xffffffff); assert.equal(e.less(0xffffffff,1),0);
 assert.equal(e.less(1,0xffffffff),1); assert.equal(e.truth(0),7);
});
test('memory32 preserves stores, traps, growth and operand order without host imports',()=>{
 const {exports:e}=compile(`(import "eliscript:memory32" load-u8 store-u8 memory-size memory-grow word-div)
 (defun set (p x) (store-u8 p x) (load-u8 p))
 (defun effects (p) (store-u8 (progn (store-u8 p 9) p) (load-u8 p)) (load-u8 p))
 (defun trap (p) (load-u8 p) 1)
 (defun divide (x) (word-div 1 x) 1)
 (defun grow (n) (memory-grow n)) (defun size () (memory-size))
 (export set effects trap divide grow size)`,{initialPages:1,maximumPages:2});
 assert.equal(e.set(8,255),255); assert.equal(e.effects(8),9);
 assert.throws(()=>e.trap(65536),WebAssembly.RuntimeError);
 assert.throws(()=>e.divide(0),WebAssembly.RuntimeError);
 const old=e.memory.buffer; assert.equal(e.grow(1),1); assert.equal(old.byteLength,0);
 assert.equal(e.size(),2); assert.equal(e.grow(1)>>>0,0xffffffff); assert.equal(e.set(65536,42),42);
});
test('memory32 checks every access width before host faults and preserves nested store and growth effects',()=>{
 const {exports:e}=compile(`(import "eliscript:memory32" load-u8 load-u16 load-u32 load-f64 store-u8 store-u16 store-u32 store-f64 memory-grow)
 (defun read8 (p) (load-u8 p)) (defun read16 (p) (load-u16 p)) (defun read32 (p) (load-u32 p))
 (defun read64 (p) (load-f64 p) 1)
 (defun write8 (p) (store-u8 p (progn (store-u8 16 7) 42)))
 (defun write16 (p) (store-u16 p (progn (store-u8 16 7) 42)))
 (defun write32 (p) (store-u32 p (progn (store-u8 16 7) 42)))
 (defun write64 (p) (store-f64 p (progn (store-u8 16 7) (load-f64 24))))
 (defun after-growth (p) (store-u32 p (progn (memory-grow 1) 123)))
 (export read8 read16 read32 read64 write8 write16 write32 write64 after-growth)`,{initialPages:1,maximumPages:2});
 for(const [width,read,write] of [[1,e.read8,e.write8],[2,e.read16,e.write16],[4,e.read32,e.write32],[8,e.read64,e.write64]]) {
  const last=65536-width;assert.equal(write(last),0);assert.equal(read(last),width===8?1:42);
  for(const address of [last+1,65536,0xfffffff8,0xfffffffc,0xffffffff]) {
   assert.throws(()=>read(address),WebAssembly.RuntimeError);assert.throws(()=>write(address),WebAssembly.RuntimeError);
   assert.equal(e.read8(16),7); // RHS effects survive the subsequent bounds trap.
  }
 }
 assert.equal(e['after-growth'](65536),0);assert.equal(e.read32(65536),123);
});

async function runtime(options={}) {
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8');
 const {exports:e,bytes}=compile(source,options);
 const r=Object.fromEntries(Object.entries(e).map(([key,value])=>[key.replaceAll('-','_'),typeof value==='function' ? (...args)=>value(...args)>>>0 : value]));
 return {r,bytes};
}
test('runtime buffers grow in WASM, keep handles stable and reject stale lifetime',async()=>{
 const {r}=await runtime({maximumPages:8});
 const p=r.buffer_new(0); assert(p>0);
 for(let i=0;i<70000;i++) assert.equal(r.buffer_push(p,i&255),1);
 assert.equal(r.buffer_length(p),70000);
 for(let i=0;i<70000;i++) assert.equal(r.buffer_get(p,i),i&255);
 assert.equal(r.buffer_get(p,70000),0); assert.equal(r.last_error(),3);
 const oldLength=r.buffer_length(p); assert.equal(r.buffer_reserve(p,0xffffffff),0);
 assert.equal(r.last_error(),2); assert.equal(r.buffer_length(p),oldLength);
 assert.equal(r.retire(),1); assert.equal(r.buffer_length(p),0); assert.equal(r.last_error(),1);
 const next=r.buffer_new(0); assert(next>p); assert.equal(r.buffer_length(p),0); assert.equal(r.last_error(),1);
});
test('runtime records preserve word slots, isolation and checked boundaries',async()=>{
 const {r}=await runtime(); const q=r.record_new(3); assert(q>0);
 assert.equal(r.record_get(q,0),0); assert.equal(r.record_set(q,2,0xffffffff),1);
 assert.equal(r.record_get(q,2),0xffffffff); assert.equal(r.record_set(q,3,1),0); assert.equal(r.last_error(),3);
 assert.equal(r.record_get(q,2),0xffffffff);
 assert.equal(r.buffer_get(q,0),0); assert.equal(r.last_error(),1);
 const other=(await runtime()).r; assert.equal(other.record_get(q,2),0); assert.equal(other.last_error(),1);
});
function putString(r,text) {
 const p=r.string_new(text.length); assert(p>0);
 for(let i=0;i<text.length;i++) assert.equal(r.string_set(p,i,text.charCodeAt(i)),1);
 assert.equal(r.string_seal(p),p); return p;
}
function getString(r,p) {
 assert(p>0); let result=''; const n=r.string_length(p);
 for(let i=0;i<n;i++) result+=String.fromCharCode(r.string_get(p,i));
 return result;
}
function putBytes(r,bytes) {const p=r.buffer_new(bytes.length); assert(p>0); for(const b of bytes) assert.equal(r.buffer_push(p,b),1); return p;}
function getBytes(r,p) {assert(p>0); return Uint8Array.from({length:r.buffer_length(p)},(_,i)=>r.buffer_get(p,i));}
test('runtime UTF16 builders seal, encode surrogates, reject invalid strict input',async()=>{
 const {r}=await runtime();
 for(const text of ['', 'ASCII\0', '中文😀', '\ud800x\udc00','\ufeffhi','\udbff\udfff','\ud800\ud800\udc00']) {
  const p=putString(r,text); assert.equal(getString(r,p),text);
  assert.deepEqual(getBytes(r,r.utf8_encode(p,0)),new TextEncoder().encode(text));
  const valid=!/\p{Surrogate}/u.test(text);
  const strict=r.utf8_encode(p,1); if(valid) assert.deepEqual(getBytes(r,strict),new TextEncoder().encode(text));
  else {assert.equal(strict,0); assert.equal(r.last_error(),5);}
  assert.equal(r.string_set(p,0,1),0); assert.equal(r.last_error(),6);
 }
 const p=r.string_new(1); assert.equal(r.utf8_encode(p,0),0); assert.equal(r.last_error(),6);
 assert.equal(r.string_set(p,1,32),0); assert.equal(r.last_error(),3);
 assert.equal(r.string_set(p,0,65536),0); assert.equal(r.last_error(),3);
});
test('runtime UTF8 decoding matches maximal-subpart replacement, strict errors and BOM',async()=>{
 const {r}=await runtime();
 const vectors=[[],[0],[0xff],[0x80],[0xc0,0xaf],[0xe0,0x80,0x80],[0xed,0xa0,0x80],
 [0xf4,0x90,0x80,0x80],[0xf0,0x9f],[0xe2,0x82,0x22],[0xe2,0x28,0xa1],
 [0xef,0xbb,0xbf,65],[0xef,0xbb,0xbf,0xef,0xbb,0xbf],[0xf4,0x8f,0xbf,0xbf]];
 for(const bytes of vectors) for(const bom of [0,1]) {
  const p=putBytes(r,bytes); const input=Uint8Array.from(bytes);
  assert.equal(getString(r,r.utf8_decode(p,0,bom)),new TextDecoder('utf-8',{ignoreBOM:!!bom}).decode(input));
  let expected; try {expected=new TextDecoder('utf-8',{fatal:true,ignoreBOM:!!bom}).decode(input);} catch {}
  const strict=r.utf8_decode(p,1,bom);
  if(expected===undefined) {assert.equal(strict,0); assert.equal(r.last_error(),4);} else assert.equal(getString(r,strict),expected);
 }
});
test('runtime rejects aligned byte data masquerading as an object header',async()=>{
 const {r}=await runtime(); const p=r.buffer_new(32);
 const data=new DataView(r.memory.buffer).getUint32(p+16,true);
 const forged=new Uint8Array(32); const v=new DataView(forged.buffer);
 v.setUint32(0,3,true); v.setUint32(4,1,true); v.setUint32(8,1,true); v.setUint32(12,1,true); v.setUint32(16,data,true);
 for(const b of forged) r.buffer_push(p,b);
 assert.equal(r.record_get(data,0),0); assert.equal(r.last_error(),1);
});
test('memory32 refuses unsupported literals, imports, shadowing and dead branches before emission',()=>{
 const cases=[
  '(defun f () -0.0) (export f)', '(defun f () 1.5) (export f)', '(defun f () -1) (export f)',
  '(defun f () 4294967296) (export f)', '(defun f (x) (if false "dead" x)) (export f)',
  '(defun f (x) (/ x 2)) (export f)', '(defun f (x) (if x t 1)) (export f)',
  '(import "host" load-u8) (defun f (x) (load-u8 x)) (export f)',
  '(import "eliscript:memory32" unknown) (defun f (x) x) (export f)',
  '(import "eliscript:memory32" :as host) (defun f (x) x) (export f)',
  '(import "eliscript:memory32" load-u8 load-u8) (defun f (x) x) (export f)',
  '(import "eliscript:memory32" load-u8) (defun load-u8 (x) x) (export load-u8)',
  '(import "eliscript:memory32" load-u8) (defun f (load-u8) (load-u8 0)) (export f)',
  '(import "eliscript:memory32" store-u8) (defun f (x) (store-u8 x)) (export f)',
  '(defun memory () 0) (export memory)'
 ];
 for(const source of cases) assert.throws(()=>compile(source),e=>{
  assert(e.eliscriptDiagnostic); assert.equal(e.eliscriptDiagnostic.code,source.includes('load-u8 load-u8') || source.includes('(defun load-u8 ') ? 'ELI-A0001' : 'ELI-B0001',source);
  assert.equal(e.eliscriptDiagnostic.location.file,'memory-test.eli'); return true;
 });
 for(const options of [{initialPages:0},{maximumPages:0},{initialPages:3,maximumPages:2},{maximumPages:65536},{initialPages:1.5}])
  assert.throws(()=>compile('(defun f () 0) (export f)',options),e=>!!e.eliscriptDiagnostic);
});
test('memory32 word arithmetic wraps exactly and preserves Lisp short-circuit effects',()=>{
 const {exports:e}=compile(`(import "eliscript:memory32" load-u32 store-u32 word-div word-shr word-shl word-and word-or)
 (defun add (x y) (+ x y)) (defun mul (x y) (* x y))
 (defun sub (x y) (- x y)) (defun neg (x) (- x))
 (defun inc (x) (1+ x)) (defun dec (x) (1- x))
 (defun bits (x n) (word-or (word-shr x n) (word-shl x n)))
 (defun div (x y) (word-div x y))
 (defun effects () (store-u32 0 0) (or (store-u32 0 1) (store-u32 0 2)) (load-u32 0))
 (defun and-effects () (and (store-u32 0 1) (store-u32 0 2)) (load-u32 0))
 (export add mul sub neg inc dec bits div effects and-effects)`);
 for(const x of [0,1,0x7fffffff,0x80000000,0xffffffff]) for(const y of [0,1,0x7fffffff,0xffffffff]) {
  assert.equal(e.add(x,y)>>>0,(x+y)>>>0); assert.equal(e.mul(x,y)>>>0,Math.imul(x,y)>>>0);
  assert.equal(e.sub(x,y)>>>0,(x-y)>>>0); if(y) assert.equal(e.div(x,y)>>>0,Math.floor(x/y));
 }
 for(const x of [0,1,0x80000000,0xffffffff]) for(const n of [0,1,31,32,33,0xffffffff])
  assert.equal(e.bits(x,n)>>>0,((x>>>n)|(x<<n))>>>0);
 for(const x of [0,1,0x80000000,0xffffffff]) {
  assert.equal(e.neg(x)>>>0,(-x)>>>0); assert.equal(e.inc(x)>>>0,(x+1)>>>0); assert.equal(e.dec(x)>>>0,(x-1)>>>0);
 }
 assert.equal(e.effects(),1); assert.equal(e['and-effects'](),2);
});
test('runtime codec deterministic random differential covers arbitrary bytes and UTF16 units',async()=>{
 const {r}=await runtime(); let state=0x73219cab;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let round=0;round<512;round++) {
  const bytes=Uint8Array.from({length:next()%96},()=>next()&255); const p=putBytes(r,bytes);
  for(const bom of [0,1]) assert.equal(getString(r,r.utf8_decode(p,0,bom)),new TextDecoder('utf-8',{ignoreBOM:!!bom}).decode(bytes));
  const text=String.fromCharCode(...Array.from({length:next()%64},()=>next()&65535));
  assert.deepEqual(getBytes(r,r.utf8_encode(putString(r,text),0)),new TextEncoder().encode(text));
  assert.equal(r.retire(),1);
 }
});
test('bulk memory bridge brands handles, rejects coercions and reports checked runtime errors',async()=>{
 const {instantiateMemoryRuntime}=await import('../tools/backends/memory-runtime.mjs');
 const {bytes}=await runtime(); const a=instantiateMemoryRuntime(bytes),b=instantiateMemoryRuntime(bytes);
 const text=a.string('😀\ud800'),encoded=a.encode(text);
 assert.deepEqual(a.bytes(encoded),new TextEncoder().encode('😀\ud800'));
 assert.equal(a.text(a.decode(encoded)),'😀�');
 const record=a.record([0,0xffffffff,42]); assert.deepEqual(a.words(record),Uint32Array.of(0,0xffffffff,42));
 assert.throws(()=>b.bytes(encoded),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>a.encode(a.buffer([1])),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 for(const value of [-1,1.5,NaN,Infinity,0x100000000]) assert.throws(()=>a.reserve(encoded,value),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.encode(text,{strict:true}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0005');
 a.retire(); assert.throws(()=>a.bytes(encoded),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 const fresh=a.buffer([1,2]); a.push(fresh,3); assert.deepEqual(a.bytes(fresh),Uint8Array.of(1,2,3));
});
test('runtime allocation failure rolls back unpublished storage and preserves existing buffers',async()=>{
 const {r}=await runtime({maximumPages:1});
 assert.equal(r.buffer_new(65256),0); assert.equal(r.last_error(),2);
 const p=r.buffer_new(8); assert(p>0);
 for(let i=0;i<8;i++) assert.equal(r.buffer_push(p,i),1);
 assert.equal(r.buffer_reserve(p,65536),0); assert.equal(r.last_error(),2);
 assert.deepEqual(getBytes(r,p),Uint8Array.of(0,1,2,3,4,5,6,7));
 for(const call of [()=>r.record_new(0xffffffff),()=>r.string_new(0xffffffff)]) {
  assert.equal(call(),0); assert.equal(r.last_error(),2);
 }
 const v=new DataView(r.memory.buffer); v.setUint32(4,0xffffffff,true);
 assert.equal(r.retire(),0); assert.equal(r.last_error(),7); assert.equal(v.getUint32(4,true),0xffffffff);
});
test('memory32 refuses value-position when and unless rather than changing their truth',()=>{
 for(const source of ['(defun f () (if (when t 0) 1 2)) (export f)',
 '(defun f () (if (unless false 0) 1 2)) (export f)',
 '(defun f () (let ((x (when t 0))) 1)) (export f)'])
  assert.throws(()=>compile(source),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});
test('Node executes the same standalone memory bytes and bulk bridge against independent codecs',async()=>{
 const {spawnSync}=await import('node:child_process');
 const {pathToFileURL}=await import('node:url');
 const {bytes}=await runtime();
 const script=`import assert from 'node:assert/strict';
 const {instantiateMemoryRuntime}=await import(process.argv[1]);
 const a=instantiateMemoryRuntime(Buffer.from(process.argv[2],'base64'));
 let state=0x1765abcd; const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let round=0;round<512;round++) {
  const text=String.fromCharCode(...Array.from({length:next()%64},()=>next()&65535));
  assert.deepEqual(a.bytes(a.encode(a.string(text))),new TextEncoder().encode(text));
  const input=Uint8Array.from({length:next()%96},()=>next()&255),p=a.buffer(input);
  for(const preserveBOM of [false,true]) {
   assert.equal(a.text(a.decode(p,{preserveBOM})),new TextDecoder('utf-8',{ignoreBOM:preserveBOM}).decode(input));
   let expected; try {expected=new TextDecoder('utf-8',{fatal:true,ignoreBOM:preserveBOM}).decode(input);} catch {}
   if(expected===undefined) assert.throws(()=>a.decode(p,{strict:true,preserveBOM}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0004');
   else assert.equal(a.text(a.decode(p,{strict:true,preserveBOM})),expected);
  }
  a.retire();
 }`;
 const child=spawnSync(process.env.NODE??'node',['--input-type=module','-e',script,
 pathToFileURL(resolve('tools/backends/memory-runtime.mjs')).href,Buffer.from(bytes).toString('base64')],{encoding:'utf8',timeout:30000});
 assert.equal(child.status,0,child.stderr);
});

test('memory32 handles recursion and multi-byte function and local indices',()=>{
 const definitions=Array.from({length:140},(_,i)=>`(defun f${i} (x) (+ x ${i}))`).join('\n');
 const bindings=Array.from({length:140},(_,i)=>`(v${i} ${i})`).join(' ');
 const {exports:e}=compile(`${definitions}
 (defun locals (x) (let (${bindings}) (+ x v139)))
 (defun rec (n) (if (= n 0) 1 (* n (rec (1- n))))) (export f139 locals rec)`);
 assert.equal(e.f139(0xffffffff)>>>0,138); assert.equal(e.locals(0xffffffff)>>>0,138);
 let expected=1; for(let n=0;n<20;n++){if(n) expected=Math.imul(expected,n)>>>0; assert.equal(e.rec(n)>>>0,expected);}
});
