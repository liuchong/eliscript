import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
let directory,backend,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-'));
 backend=await buildBackends({outputRoot:directory});
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8');
 bytes=Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'managed-runtime.eli'),{maximumPages:256}));
 assert(WebAssembly.validate(bytes)); assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
},120000);
afterAll(async()=>{if(directory) await rm(directory,{recursive:true,force:true});});
function runtime(slots=64,initial=4096,max=1048576) {
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
 const r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'? (...args)=>v(...args)>>>0:v]));
 const h=r.heap_new(slots,initial,max); assert(h>0); return {r,h};
}
function number(r,h,x) {const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,x,true);return r.value_number(h,v.getUint32(0,true),v.getUint32(4,true));}
function unbox(r,h,x) {const p=r.value_data(h,x,4);assert(p>0);return new DataView(r.memory.buffer).getFloat64(p,true);}
test('managed heap reclaims cycles, preserves roots and rejects recycled generations',()=>{
 const {r,h}=runtime(); const a=r.value_refs(h,7,2),b=r.value_refs(h,8,1),n=number(r,h,-0);
 assert.equal(r.value_set(h,a,0,b),1);assert.equal(r.value_set(h,b,0,a),1);assert.equal(r.value_set(h,a,1,n),1);
 assert.equal(r.heap_pin(h,a),1);assert.equal(r.heap_collect(h),0);assert(Object.is(unbox(r,h,n),-0));
 assert.equal(r.heap_live(h),3);assert.equal(r.heap_release(h,a),1);assert.equal(r.heap_collect(h),3);
 assert.equal(r.heap_live(h),0);assert.equal(r.value_get(h,a,0),0);assert.equal(r.last_error(),1);
 const c=r.value_refs(h,7,2);assert.notEqual(c,a);assert.notEqual(c,b);
 assert.equal(r.value_set(h,c,0,a),0);assert.equal(r.last_error(),1);assert.equal(r.value_get(h,c,0),0);
});
test('managed slots never wrap a generation and reclaimed bytes stay bounded',()=>{
 const {r,h}=runtime(1,256,256);let old=0;
 for(let i=1;i<=4095;i++) {const n=number(r,h,i);assert(n>0);assert.notEqual(n,old);
  if(old) {assert.equal(r.value_kind(h,old),0);assert.equal(r.last_error(),1);}
  assert.equal(r.heap_collect(h),1);assert.equal(r.heap_used(h),48);old=n;
 }
 assert.equal(number(r,h,1),0);assert.equal(r.last_error(),2);
 assert.equal(r.heap_live(h),0);assert.equal(r.heap_capacity(h),256);
});
test('managed Number arithmetic and truth match IEEE including negative zero and NaN',()=>{
 const {r,h}=runtime(128);const values=[0,-0,1,-1,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,Infinity,-Infinity,NaN];
 for(const a of values) for(const b of values) {
  const left=number(r,h,a),right=number(r,h,b);assert(left&&right);
  for(const [op,f] of [[0,(a,b)=>a+b],[1,(a,b)=>a-b],[2,(a,b)=>a*b],[3,(a,b)=>a/b]]) {
   const output=r.value_number_binary(h,left,right,op);assert(output>0);
   assert(Object.is(unbox(r,h,output),f(a,b)),`${a},${b},${op}`);
  }
  assert.equal(r.value_truth(h,left),1);assert.equal(r.heap_collect(h),6);
 }
 for(const v of [0,1,3]) assert.equal(r.value_truth(h,v),0);assert.equal(r.value_truth(h,2),1);
 const n=number(r,h,1);assert.equal(r.value_number_binary(h,n,2,0),0);assert.equal(r.last_error(),1);
});
test('managed growth retains relative references and resize failures preserve data',()=>{
 const {r,h}=runtime(64,2048,262144);const a=r.value_refs(h,7,1),s=r.value_string(h,35000);
 assert(a&&s);assert.equal(r.value_set(h,a,0,s),1);assert.equal(r.heap_pin(h,a),1);
 for(let i=0;i<35000;i++) assert.equal(r.value_unit_set(h,s,i,i&65535),1);
 assert.equal(r.value_seal(h,s),s);assert.equal(r.value_unit_set(h,s,0,42),0);assert.equal(r.last_error(),6);
 assert.equal(r.value_refs_resize(h,a,64),1);assert.equal(r.value_get(h,a,0),s);assert.equal(r.value_get(h,a,63),0);
 assert.equal(r.value_unit_get(h,s,34999),34999);assert.equal(r.heap_collect(h),0);
 const before=r.heap_used(h);assert.equal(r.value_refs_resize(h,a,0xffffffff),0);assert.equal(r.last_error(),2);
 assert.equal(r.value_length(h,a),64);assert.equal(r.value_get(h,a,0),s);assert.equal(r.heap_used(h),before);
 assert.equal(r.heap_release(h,a),1);assert.equal(r.heap_collect(h),2);
});
test('managed free blocks coalesce and reuse without overwriting surviving objects',()=>{
 const {r,h}=runtime(8,1024,1024);const a=r.value_bytes(h,96),b=r.value_bytes(h,96),c=r.value_bytes(h,96);
 assert(a&&b&&c);r.heap_pin(h,c);for(let i=0;i<96;i++) r.value_byte_set(h,c,i,i);
 const offset=r.value_data(h,a,6);assert.equal(r.heap_collect(h),2);
 const merged=r.value_bytes(h,200);assert(merged>0);assert.equal(r.value_data(h,merged,6),offset);
 for(let i=0;i<96;i++) assert.equal(r.value_byte_get(h,c,i),i);
 assert.equal(r.value_refs(h,6,1),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_byte_set(h,c,96,1),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_byte_set(h,c,0,256),0);assert.equal(r.last_error(),3);
});
test('managed root counts, reference validation and failed construction are transactional',()=>{
 const {r,h}=runtime(4,512,512);const a=r.value_refs(h,8,2);assert(a>0);
 assert.equal(r.heap_pin(h,a),1);assert.equal(r.heap_pin(h,a),1);assert.equal(r.heap_release(h,a),1);
 assert.equal(r.heap_collect(h),0);assert.equal(r.heap_release(h,a),1);assert.equal(r.heap_release(h,a),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_set(h,a,2,2),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_set(h,a,0,0xffffffff),0);assert.equal(r.last_error(),1);
 const used=r.heap_used(h);assert.equal(r.value_string(h,0xffffffff),0);assert.equal(r.last_error(),2);assert.equal(r.heap_used(h),used);
 assert.equal(r.heap_collect(h),1);assert.equal(r.heap_used(h),120);
});
test('managed Number unary and comparisons preserve IEEE order and signed zero',()=>{
 const {r,h}=runtime(64);
 for(const a of [0,-0,1,-1,Infinity,-Infinity,NaN,Number.MIN_VALUE]) {
  const x=number(r,h,a);const neg=r.value_number_negate(h,x);assert(neg>0);assert(Object.is(unbox(r,h,neg),-a));
  for(const b of [0,-0,1,Infinity,NaN]) {
   const y=number(r,h,b);for(const [op,expected] of [[0,a===b],[1,a!==b],[2,a<b],[3,a<=b],[4,a>b],[5,a>=b]])
    assert.equal(r.value_number_compare(h,x,y,op),Number(expected));
  }
  r.heap_collect(h);
 }
});
test('managed byte resize reuses reclaimed blocks and preserves contents transactionally',()=>{
 const {r,h}=runtime(16,1024,4096);const b=r.value_bytes(h,8);for(let i=0;i<8;i++)r.value_byte_set(h,b,i,i+1);
 r.heap_pin(h,b);assert.equal(r.value_bytes_resize(h,b,1800),1);
 for(let i=0;i<8;i++)assert.equal(r.value_byte_get(h,b,i),i+1);assert.equal(r.value_byte_get(h,b,1799),0);
 const used=r.heap_used(h);assert.equal(r.value_bytes_resize(h,b,8000),0);assert.equal(r.last_error(),2);assert.equal(r.heap_used(h),used);
 assert.equal(r.value_bytes_resize(h,b,4),1);assert.equal(r.value_bytes_resize(h,b,8),1);
 for(let i=4;i<8;i++) assert.equal(r.value_byte_get(h,b,i),0);assert.equal(r.heap_collect(h),0);
});
test('managed bridge brands values, keeps explicit roots and bulk transfers values',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes);
 const n=a.number(-0),s=a.string('中文😀\ud800'),v=a.array([n,s,null,false,true,undefined]);
 assert(Object.is(a.readNumber(n),-0));assert.equal(a.readString(s),'中文😀\ud800');assert.equal(a.truth(n),true);
 const r=a.record([v]);a.set(v,0,r);a.release(v);a.release(n);a.release(s);
 assert.equal(a.collect(),1);assert.equal(a.live(),3); // replaced Number is unreferenced
 const child=a.get(r,0);assert.equal(a.length(child),6);assert.equal(a.get(child,2),null);
 assert.throws(()=>b.length(child),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>a.set(child,0,0),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.array({length:2}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 a.release(child);a.release(r);assert.equal(a.collect(),3);
 assert.throws(()=>a.length(child),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>a.release(child),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 const p=a.bytes([0,255]);a.resize(p,70000);assert.deepEqual(a.readBytes(p).slice(0,2),new Uint8Array([0,255]));
 const x=a.number(1),y=a.number(0),z=a.binary(x,y,3);assert.equal(a.readNumber(z),Infinity);
 assert.equal(a.compare(x,y,4),true);assert.equal(a.readNumber(a.negate(y)),-0);
});
test('managed graph collector matches independent reachability across randomized traces',()=>{
 const {r,h}=runtime(128,4096,65536);let state=0x738afe;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 let nodes=[];const dead=[];
 for(let round=0;round<512;round++) {
  for(let i=0;i<12;i++) {const p=r.value_refs(h,7,1+next()%5);assert(p>0);const n={p,edges:Array(r.value_length(h,p)).fill(null),root:next()%4===0};nodes.push(n);if(n.root)assert.equal(r.heap_pin(h,p),1);}
  for(const n of nodes) {for(let i=0;i<n.edges.length;i++) if(next()%3===0) {
   const edge=next()%4===0?null:nodes[next()%nodes.length];n.edges[i]=edge;
   assert.equal(r.value_set(h,n.p,i,edge?.p??(next()%4)),1);
  }
  if(n.root&&next()%3===0) {assert.equal(r.heap_release(h,n.p),1);n.root=false;}}
  const marked=new Set(),queue=nodes.filter(n=>n.root);while(queue.length) {const n=queue.pop();if(marked.has(n))continue;marked.add(n);queue.push(...n.edges.filter(Boolean));}
  assert.equal(r.heap_collect(h),nodes.length-marked.size);assert.equal(r.heap_live(h),marked.size);
  for(const n of nodes) {if(marked.has(n)) {assert.equal(r.value_kind(h,n.p),7);for(let i=0;i<n.edges.length;i++)if(n.edges[i])assert.equal(r.value_get(h,n.p,i),n.edges[i].p);}
   else {assert.equal(r.value_kind(h,n.p),0);assert.equal(r.last_error(),1);dead.push(n.p);}}
  nodes=nodes.filter(n=>marked.has(n));
  if(nodes.length>80) {for(const n of nodes)if(n.root)r.heap_release(h,n.p);assert.equal(r.heap_collect(h),nodes.length);nodes=[];}
  if(dead.length) {assert.equal(r.value_kind(h,dead[next()%dead.length]),0);assert.equal(r.last_error(),1);}
 }
});
test('managed deep cyclic graphs collect iteratively without consuming the WASM call stack',()=>{
 const {r,h}=runtime(12000,400000,2000000);let head=0,last=0;
 for(let i=0;i<10000;i++) {const n=r.value_refs(h,8,1);assert(n>0);r.value_set(h,n,0,head);head=n;if(!last)last=n;}
 r.value_set(h,last,0,head);r.heap_pin(h,head);assert.equal(r.heap_collect(h),0);
 r.heap_release(h,head);assert.equal(r.heap_collect(h),10000);assert.equal(r.heap_used(h),12001*24);
});
test('mixed word and f64 capability lowering refuses implicit conversions and retains traps',()=>{
 const compile=source=>Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'mixed-test.eli')));
 const prefix='(import "eliscript:memory32" load-f64 store-f64 load-u32 store-u32 memory-grow) ';
 for(const fn of ['(defun bad (p) (load-f64 p))','(defun bad (p) (store-f64 p 1))',
  '(defun bad (p) (store-u32 p (load-f64 p)))','(defun bad (p) (store-f64 p (+ (load-f64 p) 1)))',
  '(defun bad (p) (load-f64 (load-f64 p)) 0)'])
  assert.throws(()=>compile(prefix+fn),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.phase==='memory-backend');
 const e=new WebAssembly.Instance(new WebAssembly.Module(compile(prefix+`
 (defun trap (p) (load-f64 p) 1)
 (defun truth (p) (if (load-f64 p) 7 8))
 (defun sequence (p) (store-f64 (progn (store-u32 p 0) p) (- (load-f64 p))) (load-u32 p))
 (export trap truth sequence)`))).exports;
 assert.throws(()=>e.trap(65532),WebAssembly.RuntimeError);
 for(const x of [0,-0,NaN,Infinity,Number.MIN_VALUE]) {new DataView(e.memory.buffer).setFloat64(256,x,true);assert.equal(e.truth(256),7);}
 new DataView(e.memory.buffer).setFloat64(256,1.25,true);assert.equal(e.sequence(256),0);assert.equal(new DataView(e.memory.buffer).getFloat64(256,true),-1.25);
});
test('Node independently executes managed arithmetic, cycles and repeated reclamation',async()=>{
 const {writeFile}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');
 const artifact=resolve(directory,'managed.wasm');await writeFile(artifact,bytes);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
 import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(artifact)}));
 const inputs=[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE];
 for(const x of inputs)for(const y of inputs) {
  const l=a.number(x),r=a.number(y);
  for(const [op,expected]of[[0,x+y],[1,x-y],[2,x*y],[3,x/y]]) {const z=a.binary(l,r,op);assert(Object.is(a.readNumber(z),expected));a.release(z);}
  a.release(l);a.release(r);assert.equal(a.collect(),6);
 }
 const prefix=a.stats().usedBytes;
 for(let i=0;i<1000;i++) {const x=a.array([null]),y=a.record([x]);a.set(x,0,y);a.release(x);a.release(y);assert.equal(a.collect(),2);assert.equal(a.stats().usedBytes,prefix);}
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
test('managed shrink removes edges, regrowth clears slots and records stay fixed',()=>{
 const {r,h}=runtime();const a=r.value_refs(h,7,2),b=number(r,h,1),c=number(r,h,2);
 r.value_set(h,a,0,b);r.value_set(h,a,1,c);r.heap_pin(h,a);
 assert.equal(r.value_refs_resize(h,a,1),1);assert.equal(r.heap_collect(h),1);
 assert.equal(r.value_kind(h,c),0);assert.equal(r.last_error(),1);
 assert.equal(r.value_refs_resize(h,a,2),1);assert.equal(r.value_get(h,a,1),0);assert.equal(r.value_get(h,a,0),b);
 const record=r.value_refs(h,8,1);assert.equal(r.value_refs_resize(h,record,2),0);assert.equal(r.last_error(),1);
 r.heap_release(h,a);assert.equal(r.heap_collect(h),3);
});
test('managed heap checks capacity, retirement, payload bits and invalid arguments',()=>{
 const {r,h}=runtime();
 for(const args of [[0,4096,4096],[1048576,4096,4096],[64,32,4096],[64,4096,1024],[1,256,0xffffffff]]) {
  assert.equal(r.heap_new(...args),0);assert.equal(r.last_error(),3);
 }
 for(const [low,high] of [[1,0],[0,0x80000000],[0x12345678,0x7ff81234],[0,0xfff00000]]) {
  const n=r.value_number(h,low,high),p=r.value_data(h,n,4),v=new DataView(r.memory.buffer);
  assert.equal(v.getUint32(p,true),low);assert.equal(v.getUint32(p+4,true),high);
 }
 const n=number(r,h,1);assert.equal(r.value_number_binary(h,n,n,4),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_number_compare(h,n,n,6),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_truth(h,4),0);assert.equal(r.last_error(),1);
 const string=r.value_string(h,1);assert.equal(r.value_unit_set(h,string,0,65536),0);assert.equal(r.last_error(),3);
 assert.equal(r.retire(),1);assert.equal(r.heap_collect(h),0);assert.equal(r.last_error(),1);
});
test('managed sparse arrays marshal undefined and output copies remain owned',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');const a=instantiateManagedRuntime(bytes);
 const v=a.array(Array(2));assert.equal(a.get(v,0),undefined);assert.equal(a.get(v,1),undefined);
 const b=a.bytes([1,2]);const copy=a.readBytes(b);copy[0]=9;assert.deepEqual(a.readBytes(b),new Uint8Array([1,2]));
 for(const invalid of [-0,-1,1.5,'2',null]) assert.throws(()=>a.resize(b,invalid),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.number('1'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
});
test('managed byte resize never writes into an adjacent live block',()=>{
 const {r,h}=runtime();const b=r.value_bytes(h,8),n=number(r,h,42);
 for(let i=0;i<8;i++)r.value_byte_set(h,b,i,255);
 assert.equal(r.value_bytes_resize(h,b,4),1);assert.equal(r.value_kind(h,n),4);assert.equal(unbox(r,h,n),42);
 assert.equal(r.value_bytes_resize(h,b,8),1);assert.equal(r.value_kind(h,n),4);
 for(let i=4;i<8;i++)assert.equal(r.value_byte_get(h,b,i),0);
});
test('managed byte resize randomized differential keeps adjacent payloads intact',()=>{
 const {r,h}=runtime(64,2048,131072);const sentinel=number(r,h,42);r.heap_pin(h,sentinel);
 let state=0x712891;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const buffers=Array.from({length:16},()=>{const p=r.value_bytes(h,0);r.heap_pin(h,p);return {p,bytes:[]};});
 for(let i=0;i<2048;i++) {
  const b=buffers[next()%buffers.length],length=next()%513;assert.equal(r.value_bytes_resize(h,b.p,length),1);
  b.bytes.length=Math.min(b.bytes.length,length);while(b.bytes.length<length)b.bytes.push(0);
  if(length) {const index=next()%length,value=next()%256;assert.equal(r.value_byte_set(h,b.p,index,value),1);b.bytes[index]=value;}
  assert.equal(r.value_length(h,b.p),length);
  for(let j=0;j<length;j++)assert.equal(r.value_byte_get(h,b.p,j),b.bytes[j]);
  assert.equal(r.value_kind(h,sentinel),4);assert.equal(unbox(r,h,sentinel),42);
  if(i%64===0) {assert.equal(r.heap_collect(h),0);r.heap_release(h,b.p);assert.equal(r.heap_collect(h),1);
   b.p=r.value_bytes(h,0);assert(b.p>0);r.heap_pin(h,b.p);b.bytes=[];}
 }
});
test('managed Number captures operands before moving growth and leaves inputs intact on OOM',()=>{
 for(const maximum of [200,400]) {
  const {r,h}=runtime(4,200,maximum);const x=number(r,h,1.25),y=number(r,h,2.5);
  assert(x&&y);const z=r.value_number_binary(h,x,y,0);
  if(maximum===200) {assert.equal(z,0);assert.equal(r.last_error(),2);assert.equal(r.heap_used(h),200);assert.equal(r.heap_live(h),2);}
  else {assert(z>0);assert.equal(unbox(r,h,z),3.75);assert.equal(r.heap_capacity(h),400);}
  assert.equal(unbox(r,h,x),1.25);assert.equal(unbox(r,h,y),2.5);
 }
});
test('managed actual memory.grow failure leaves slot and block metadata unchanged',async()=>{
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8');
 const artifact=Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'page-exhaustion.eli'),{maximumPages:1}));
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact)).exports;
 const r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'?(...args)=>v(...args)>>>0:v]));
 const h=r.heap_new(64,2048,131072),b=r.value_bytes(h,8);assert(b>0);r.value_byte_set(h,b,0,42);
 const used=r.heap_used(h);assert.equal(r.value_bytes_resize(h,b,70000),0);assert.equal(r.last_error(),2);
 assert.equal(r.heap_used(h),used);assert.equal(r.heap_capacity(h),2048);assert.equal(r.value_byte_get(h,b,0),42);
 assert.equal(r.heap_live(h),1);const next=number(r,h,3);assert(next>0);assert.equal(unbox(r,h,next),3);
});
