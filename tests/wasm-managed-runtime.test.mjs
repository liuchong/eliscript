import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
import {hashValue,equalValues} from '../runtime/core/value.mjs';
let directory,backend,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-'));
 backend=await buildBackends({outputRoot:directory});
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8')+'\n(defun gc-named (heap code) (value-function-named heap code)) (export gc-named)';
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
function managedString(r,h,text) {
 const value=r.value_string(h,text.length);assert(value>0);
 for(let i=0;i<text.length;i++)assert.equal(r.value_unit_set(h,value,i,text.charCodeAt(i)),1);
 assert.equal(r.value_seal(h,value),value);return value;
}
function readManagedString(r,h,value) {
 const length=r.value_length(h,value),p=r.value_data(h,value,5);assert(p>0);const view=new DataView(r.memory.buffer),parts=[];
 for(let i=0;i<length;i+=8192){const units=[];for(let j=i;j<Math.min(i+8192,length);j++)units.push(view.getUint16(p+2*j,true));parts.push(String.fromCharCode(...units));}
 return parts.join('');
}
function managedBytes(r,h,input) {
 const value=r.value_bytes(h,input.length);assert(value>0);for(let i=0;i<input.length;i++)assert.equal(r.value_byte_set(h,value,i,input[i]),1);return value;
}
function readManagedBytes(r,h,value) {
 const length=r.value_length(h,value),p=r.value_data(h,value,6);assert(p>0);return new Uint8Array(r.memory.buffer,p,length).slice();
}
test('Number word operations reject invalid arguments and keep original inputs and capacity transactional',()=>{
 const {r,h}=runtime(2,384,384),x=number(r,h,-0),y=number(r,h,3);r.heap_pin(h,x);r.heap_pin(h,y);r.heap_auto(h,1);
 const used=r.heap_used(h);
 for(const run of[()=>r.value_number_word(h,x,0),()=>r.value_number_bitwise(h,x,y,6),()=>r.value_number_remainder(h,x,y)]){assert.equal(run(),0);assert.equal(r.last_error(),2);assert.equal(r.heap_live(h),2);assert.equal(r.heap_used(h),used);assert(Object.is(unbox(r,h,x),-0));assert.equal(unbox(r,h,y),3);}
 for(const [run,code]of[[()=>r.value_number_word(h,x,3),3],[()=>r.value_number_bitwise(h,x,y,7),3],[()=>r.value_number_remainder(h,x,0),1],[()=>r.value_number_word(h,0xffffffff,0),1]]){assert.equal(run(),0);assert.equal(r.last_error(),code);assert.equal(r.heap_live(h),2);}
 r.heap_release(h,x);r.heap_release(h,y);assert.equal(r.heap_collect(h),2);assert.equal(r.value_number_word(h,x,0),0);assert.equal(r.last_error(),1);
 const grown=runtime(16,512,65536),a=number(grown.r,grown.h,Number.MAX_VALUE),b=number(grown.r,grown.h,3);grown.r.heap_pin(grown.h,a);grown.r.heap_pin(grown.h,b);
 const block=grown.r.value_bytes(grown.h,30000);assert(block>0);const result=grown.r.value_number_remainder(grown.h,a,b);assert(Object.is(unbox(grown.r,grown.h,result),Number.MAX_VALUE%3));assert(Object.is(unbox(grown.r,grown.h,a),Number.MAX_VALUE));
});
test('ordinary comparison rejects private frames, unfinished strings and stale values and keeps NaN non-reflexive',()=>{
 const {r,h}=runtime();const nan=number(r,h,NaN),zero=number(r,h,-0),positive=number(r,h,0),text=managedString(r,h,'中\ud800'),same=managedString(r,h,'中\ud800');
 const object=r.value_refs(h,7,0),other=r.value_refs(h,7,0),frame=r.frame_new(h,0),builder=r.value_string(h,0);
 const before=r.heap_live(h),used=r.heap_used(h);assert.equal(r.value_compare(h,nan,nan,0),0);assert.equal(r.last_error(),0);assert.equal(r.value_compare(h,nan,nan,1),1);assert.equal(r.value_compare(h,zero,positive,0),1);
 assert.equal(r.value_compare(h,text,same,0),1);assert.equal(r.value_compare(h,object,object,0),1);assert.equal(r.value_compare(h,object,other,0),0);
 assert.equal(r.value_compare(h,0,0,0),1);assert.equal(r.value_compare(h,0,3,0),0);assert.equal(r.value_compare(h,zero,0,0),0);
 for(const [left,right,op,code]of[[frame,frame,0,3],[builder,builder,0,6],[zero,positive,6,3],[text,zero,2,3],[2,positive,2,3]]){assert.equal(r.value_compare(h,left,right,op),0);assert.equal(r.last_error(),code);}
 assert.equal(r.heap_live(h),before);assert.equal(r.heap_used(h),used);assert.equal(r.heap_collections(h),0);r.frame_pop(h,frame);r.heap_collect(h);
 assert.equal(r.value_compare(h,object,object,0),0);assert.equal(r.last_error(),1);
});
test('managed heap reclaims cycles, preserves roots and rejects recycled generations',()=>{
 const {r,h}=runtime(); const a=r.value_refs(h,7,2),b=r.value_refs(h,8,1),n=number(r,h,-0);
 assert.equal(r.value_set(h,a,0,b),1);assert.equal(r.value_set(h,b,0,a),1);assert.equal(r.value_set(h,a,1,n),1);
 assert.equal(r.heap_pin(h,a),1);assert.equal(r.heap_collect(h),0);assert(Object.is(unbox(r,h,n),-0));
 assert.equal(r.heap_live(h),3);assert.equal(r.heap_release(h,a),1);assert.equal(r.heap_collect(h),3);
 assert.equal(r.heap_live(h),0);assert.equal(r.value_get(h,a,0),0);assert.equal(r.last_error(),1);
 const c=r.value_refs(h,7,2);assert.notEqual(c,a);assert.notEqual(c,b);
 assert.equal(r.value_set(h,c,0,a),0);assert.equal(r.last_error(),1);assert.equal(r.value_get(h,c,0),0);
});
test('repeated full collections retain weak named identity and changed roots independently across growing heaps',()=>{
 const {r,h}=runtime(64,4096,131072),other=r.heap_new(64,4096,131072);assert(other>0);
 const root=r.value_refs(h,7,2),n=number(r,h,-0),named=r.gc_named(h,77);r.value_set(h,root,0,root);r.value_set(h,root,1,n);r.heap_pin(h,root);r.heap_pin(h,named);
 const peer=r.value_refs(other,8,1),peerValue=number(r,other,42);r.value_set(other,peer,0,peerValue);r.heap_pin(other,peer);
 const buffer=r.value_bytes(h,30000);assert(buffer>0);r.heap_pin(h,buffer);r.value_byte_set(h,buffer,29999,197);assert(r.heap_capacity(h)>4096);const baseCount=r.heap_collections(h),peerCount=r.heap_collections(other);
 for(let cycle=0;cycle<64;cycle++){
  const garbage=number(r,h,cycle);assert(garbage>0);assert.equal(r.heap_collect(h),1);assert.equal(r.last_error(),0);assert.equal(r.value_kind(h,garbage),0);assert.equal(r.last_error(),1);
  assert.equal(r.gc_named(h,77),named);assert.equal(r.value_get(h,root,0),root);assert(Object.is(unbox(r,h,n),-0));assert.equal(r.value_byte_get(h,buffer,29999),197);assert.equal(r.heap_collect(h),0);assert.equal(r.gc_named(h,77),named);
  if(cycle%3===0){assert.equal(r.heap_collect(other),0);assert.equal(r.value_get(other,peer,0),peerValue);assert.equal(unbox(r,other,peerValue),42);}
 }
 assert.equal(r.heap_collections(h)-baseCount,128);assert.equal(r.heap_collections(other)-peerCount,22);assert.equal(r.value_set(h,root,1,0),1);assert.equal(r.heap_collect(h),1);assert.equal(r.value_kind(h,n),0);assert.equal(r.last_error(),1);assert.equal(r.gc_named(h,77),named);
 r.heap_release(h,root);r.heap_release(h,named);r.heap_release(h,buffer);assert.equal(r.heap_collect(h),3);assert.equal(r.heap_live(h),0);const replacement=r.gc_named(h,77);assert(replacement>0);assert.notEqual(replacement,named);assert.equal(r.heap_collect(h),1);
 assert.equal(r.value_get(other,peer,0),peerValue);r.heap_release(other,peer);assert.equal(r.heap_collect(other),2);assert.equal(r.heap_live(other),0);
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
test('root frames retain ancestor locals, enforce LIFO and expire immediately on pop',()=>{
 const {r,h}=runtime();const outer=r.frame_new(h,2),a=number(r,h,-0);assert(outer>0);
 assert.equal(r.frame_set(h,outer,0,a),1);const inner=r.frame_new(h,1);assert(inner>0);
 const b=r.value_refs(h,7,1);r.value_set(h,b,0,a);assert.equal(r.frame_set(h,inner,0,b),1);
 assert.equal(r.frame_depth(h),2);assert.equal(r.heap_collect(h),0);
 assert.equal(r.frame_get(h,outer,0),a);assert(Object.is(unbox(r,h,a),-0));
 assert.equal(r.frame_pop(h,outer),0);assert.equal(r.last_error(),3);assert.equal(r.frame_depth(h),2);
 assert.equal(r.frame_get(h,inner,1),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_set(h,b,0,inner),0);assert.equal(r.last_error(),3);
 assert.equal(r.heap_pin(h,inner),0);assert.equal(r.last_error(),3);
 assert.equal(r.frame_pop(h,inner),1);assert.equal(r.frame_get(h,inner,0),0);assert.equal(r.last_error(),1);
 assert.equal(r.heap_collect(h),2);assert.equal(r.frame_get(h,outer,0),a);
 assert.equal(r.frame_pop(h,outer),1);assert.equal(r.heap_collect(h),2);assert.equal(r.frame_depth(h),0);
});
test('frame return transfers one rooted cyclic result and unwind preserves its target',()=>{
 const {r,h}=runtime();const parent=r.frame_new(h,1),child=r.frame_new(h,1);
 const a=r.value_refs(h,7,1),b=r.value_refs(h,8,1);r.value_set(h,a,0,b);r.value_set(h,b,0,a);r.frame_set(h,child,0,a);
 assert.equal(r.frame_return(h,parent,a),0);assert.equal(r.last_error(),3);assert.equal(r.frame_depth(h),2);
 assert.equal(r.frame_return(h,child,child),0);assert.equal(r.last_error(),3);assert.equal(r.frame_depth(h),2);
 assert.equal(r.frame_return(h,child,a),a);assert.equal(r.frame_depth(h),1);
 assert.equal(r.heap_collect(h),1);assert.equal(r.value_get(h,a,0),b);
 r.frame_set(h,parent,0,a);assert.equal(r.heap_release(h,a),1);const top=r.frame_new(h,0);
 assert.equal(r.frame_unwind(h,child),0);assert.equal(r.last_error(),1);assert.equal(r.frame_depth(h),2);
 assert.equal(r.frame_unwind(h,parent),1);assert.equal(r.frame_depth(h),1);
 assert.equal(r.frame_pop(h,top),0);assert.equal(r.last_error(),1);
 assert.equal(r.heap_collect(h),1);assert.equal(r.frame_unwind(h,0),1);assert.equal(r.heap_collect(h),3);
});
test('automatic collection respects frames, reuses slots and retries capacity once',()=>{
 const {r,h}=runtime(6,512,512);assert.equal(r.heap_auto(h,1),1);const f=r.frame_new(h,2);
 const a=number(r,h,42);r.frame_set(h,f,0,a);
 for(let i=0;i<1000;i++) {const n=number(r,h,i);assert(n>0);r.frame_set(h,f,1,n);assert.equal(unbox(r,h,a),42);}
 assert(r.heap_collections(h)>1000);assert.equal(r.heap_capacity(h),512);
 assert.equal(r.heap_auto(h,0xffffffff),1); // only capacity pressure now
 for(let i=0;i<100;i++) assert(number(r,h,i)>0);
 assert.equal(r.frame_pop(h,f),1);r.heap_collect(h);assert.equal(r.heap_live(h),0);
 assert.equal(r.heap_auto(h,0),1);const old=r.heap_collections(h);number(r,h,1);number(r,h,2);assert.equal(r.heap_collections(h),old);
});
test('automatic resize temporarily roots its operand and preserves data on growth or failure',()=>{
 const {r,h}=runtime(16,1024,8192);const b=r.value_bytes(h,8);for(let i=0;i<8;i++)r.value_byte_set(h,b,i,i+1);
 assert.equal(r.heap_auto(h,1),1);assert.equal(r.value_bytes_resize(h,b,4000),1);
 for(let i=0;i<8;i++)assert.equal(r.value_byte_get(h,b,i),i+1);
 assert.equal(r.value_bytes_resize(h,b,12000),0);assert.equal(r.last_error(),2);
 assert.equal(r.value_length(h,b),4000);assert.equal(r.value_byte_get(h,b,7),8);
 assert.equal(r.heap_collect(h),1);assert.equal(r.heap_live(h),0);
});
test('managed bridge frames transfer root ownership, reject foreign tokens and unwind cleanup',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes);
 a.auto(1);const parent=a.frame(1),n=a.number(-0);a.frameSet(parent,0,n);a.release(n);
 const child=a.frame(1),loaded=a.frameGet(parent,0);assert(Object.is(a.readNumber(loaded),-0));
 a.frameSet(child,0,loaded);const escaped=a.frameReturn(child,loaded);a.release(loaded);
 assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(escaped),-0));
 assert.throws(()=>a.frameGet(child,0),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>b.frameGet(parent,0),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 a.unwindFrames();assert.equal(a.stats().frameDepth,0);a.collect();assert.equal(a.live(),1);
 a.release(escaped);assert.equal(a.collect(),1); // return must not leave an extra hidden root
 assert.throws(()=>a.frameSet(parent,0,true),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>a.auto(-0),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
});
test('automatic bridge construction protects borrowed operands and releases temporary roots on failure',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const kind of ['array','record']) {
  const a=instantiateManagedRuntime(bytes,{maxSlots:16,initialBytes:2048,maxBytes:2048});a.auto(1);
  const n=a.number(-0);a.release(n);
  const input=[n,n,null];Object.defineProperty(input,1,{get(){
   const temporary=a.number(42);a.release(temporary);return n;
  }});
  const result=a[kind](input),child=a.get(result,0);assert(Object.is(a.readNumber(child),-0));a.release(child);
  const second=a.get(result,1);assert(Object.is(a.readNumber(second),-0));a.release(second);
  a.release(result);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
 const a=instantiateManagedRuntime(bytes,{maxSlots:1,initialBytes:256,maxBytes:256});
 const n=a.number(7);a.release(n);a.auto(1);
 assert.throws(()=>a.array([n]),e=>e.eliscriptDiagnostic.code==='ELI-RT0002');
 assert.equal(a.readNumber(n),7);assert.equal(a.collect(),1);assert.equal(a.live(),0);
});
async function rootProgram() {
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8');
 const program=source+`
 (defun root-loop (heap rounds)
   (let* ((frame (frame-new heap 1)) (i 0) (initial (value-number heap 0 1072693248)))
     (frame-set heap frame 0 initial)
     (while (< i rounds)
       (let* ((inner (frame-new heap 2)) (two (value-number heap 0 1073741824)))
         (frame-set heap inner 0 two)
         (let ((sum (value-number-binary heap (frame-get heap frame 0) two 0)))
           (frame-set heap inner 1 sum)
           (let ((output (frame-return heap inner sum)))
             (frame-set heap frame 0 output) (heap-release heap output))))
       (setq i (1+ i)))
     (frame-return heap frame (frame-get heap frame 0))))
 (defun root-trap (heap)
   (let* ((frame (frame-new heap 1)) (value (value-number heap 0 1072693248)))
     (frame-set heap frame 0 value) (load-u32 4294967295) 0))
 (defun root-recursive (heap depth)
   (let* ((frame (frame-new heap 2)) (one (value-number heap 0 1072693248)))
     (frame-set heap frame 0 one)
     (if (= depth 0) (frame-return heap frame one)
       (let ((child (root-recursive heap (1- depth))))
         (frame-set heap frame 1 child) (heap-release heap child)
         (let ((sum (value-number-binary heap one child 0)))
           (frame-set heap frame 0 sum) (frame-return heap frame sum))))))
 (export root-loop root-trap root-recursive)`;
 const artifact=Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(program,'root-workload.eli'),{maximumPages:4}));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);return artifact;
}
test('WASM internal root loops collect under pressure and trap cleanup removes every frame',async()=>{
 const artifact=await rootProgram(),e=new WebAssembly.Instance(new WebAssembly.Module(artifact)).exports;
 const r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'?(...args)=>v(...args)>>>0:v]));
 const h=r.heap_new(12,768,768);r.heap_auto(h,1);const output=r.root_loop(h,1000);assert(output>0);
 assert.equal(unbox(r,h,output),2001);assert.equal(r.frame_depth(h),0);assert(r.heap_collections(h)>3000);
 r.heap_collect(h);assert.equal(r.heap_live(h),1);r.heap_release(h,output);r.heap_collect(h);assert.equal(r.heap_live(h),0);
 assert.throws(()=>r.root_trap(h),WebAssembly.RuntimeError);assert.equal(r.frame_depth(h),1);
 assert.equal(r.frame_unwind(h,0),1);assert.equal(r.heap_collect(h),2);assert.equal(r.heap_live(h),0);
 assert.equal(r.heap_capacity(h),768);
 const recursiveHeap=r.heap_new(192,8192,32768);r.heap_auto(recursiveHeap,1);
 const recursive=r.root_recursive(recursiveHeap,64);assert(recursive>0);assert.equal(unbox(r,recursiveHeap,recursive),65);
 assert.equal(r.frame_depth(recursiveHeap),0);r.heap_collect(recursiveHeap);assert.equal(r.heap_live(recursiveHeap),1);
 r.heap_release(recursiveHeap,recursive);assert.equal(r.heap_collect(recursiveHeap),1);assert.equal(r.heap_used(recursiveHeap),193*24);
});
test('Node runs the same root-managed WASM allocation workload without host callbacks',async()=>{
 const {writeFile}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');
 const artifact=resolve(directory,'roots.wasm');await writeFile(artifact,await rootProgram());
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
 const module=new WebAssembly.Module(readFileSync(${JSON.stringify(artifact)}));assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const e=new WebAssembly.Instance(module).exports,h=e['heap-new'](12,768,768);e['heap-auto'](h,1);
 const p=e['root-loop'](h,1000)>>>0;assert(p>0);assert.equal(new DataView(e.memory.buffer).getFloat64(e['value-data'](h,p,4)>>>0,true),2001);
 assert.equal(e['frame-depth'](h),0);assert(e['heap-collections'](h)>3000);e['heap-release'](h,p);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
 assert.throws(()=>e['root-trap'](h),WebAssembly.RuntimeError);assert.equal(e['frame-unwind'](h,0),1);assert.equal(e['heap-collect'](h),2);
 const h2=e['heap-new'](192,8192,32768);e['heap-auto'](h2,1);const p2=e['root-recursive'](h2,64)>>>0;assert(p2>0);
 assert.equal(new DataView(e.memory.buffer).getFloat64(e['value-data'](h2,p2,4)>>>0,true),65);
 assert.equal(e['frame-depth'](h2),0);e['heap-release'](h2,p2);e['heap-collect'](h2);assert.equal(e['heap-live'](h2),0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
test('automatic capacity retry reselects the free-slot head without losing older free slots',()=>{
 const {r,h}=runtime(2,320,320);const a=r.value_bytes(h,80),b=r.value_bytes(h,80);assert(a&&b);
 r.heap_pin(h,b);assert.equal(r.heap_collect(h),1);r.heap_release(h,b);r.heap_auto(h,0xffffffff);
 const big=r.value_bytes(h,130);assert(big>0);assert.equal(big&0xfffff,2);r.heap_pin(h,big);
 const small=r.value_bytes(h,8);assert(small>0);assert.equal(small&0xfffff,1);
 assert.equal(r.heap_collections(h),2);assert.equal(r.heap_live(h),2);
});
test('automatic failed frame allocation preserves its stack and private lifetime',()=>{
 const {r,h}=runtime(1,256,256);r.heap_auto(h,1);const frame=r.frame_new(h,0);assert(frame>0);
 assert.equal(r.frame_new(h,0),0);assert.equal(r.last_error(),2);assert.equal(r.frame_depth(h),1);
 assert.equal(r.frame_set(h,frame,0,2),0);assert.equal(r.last_error(),3);
 assert.equal(r.frame_return(h,frame,0xffffffff),0);assert.equal(r.last_error(),1);assert.equal(r.frame_depth(h),1);
 assert.equal(r.frame_unwind(h,0),1);assert.equal(r.heap_collect(h),1);const n=number(r,h,1);assert(n>0);
 assert.equal(r.frame_get(h,frame,0),0);assert.equal(r.last_error(),1);
});
test('automatic framed Number operations preserve every IEEE edge case during collection',()=>{
 const {r,h}=runtime(8,512,512);r.heap_auto(h,1);
 const values=[0,-0,1,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE];
 for(const x of values)for(const y of values)for(const [op,f]of[[0,(a,b)=>a+b],[1,(a,b)=>a-b],[2,(a,b)=>a*b],[3,(a,b)=>a/b]]) {
  const frame=r.frame_new(h,3),a=number(r,h,x);r.frame_set(h,frame,0,a);
  const b=number(r,h,y);r.frame_set(h,frame,1,b);const c=r.value_number_binary(h,a,b,op);assert(c>0);r.frame_set(h,frame,2,c);
  assert(Object.is(unbox(r,h,c),f(x,y)));assert(Object.is(unbox(r,h,a),x));assert(Object.is(unbox(r,h,b),y));
  r.frame_pop(h,frame);r.heap_collect(h);
 }
});
test('automatic frames match an independent random graph and nested-stack reference',()=>{
 const {r,h}=runtime(128,4096,32768);r.heap_auto(h,1);let state=0x51af291;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const frames=[{p:r.frame_new(h,3),slots:Array(3).fill(null)}];let nodes=[],inactive=0;
 function prune() {
  const marked=new Set(),queue=frames.flatMap(f=>f.slots.filter(Boolean));
  while(queue.length) {const n=queue.pop();if(marked.has(n))continue;marked.add(n);queue.push(...n.edges.filter(Boolean));}
  const dead=nodes.filter(n=>!marked.has(n));nodes=nodes.filter(n=>marked.has(n));return dead;
 }
 function checkDead(dead) {for(const n of dead){assert.equal(r.value_kind(h,n.p),0);assert.equal(r.last_error(),1);}}
 for(let round=0;round<512;round++) {
  const action=next()%6;
  if(action===0||nodes.length===0) {
   if(nodes.length>80)for(const f of frames)for(let i=0;i<3;i++){r.frame_set(h,f.p,i,0);f.slots[i]=null;}
   const dead=prune(),count=1+next()%3,p=r.value_refs(h,7,count);assert(p>0);inactive=0;checkDead(dead);
   nodes.push({p,edges:Array(count).fill(null)});assert.equal(r.heap_live(h),nodes.length+frames.length);
  } else if(action===1&&frames.length<8) {
   const dead=prune(),p=r.frame_new(h,3);assert(p>0);frames.push({p,slots:Array(3).fill(null)});inactive=0;checkDead(dead);
   assert.equal(r.heap_live(h),nodes.length+frames.length);
  } else if(action===2&&frames.length>1) {
   const f=frames.pop();assert.equal(r.frame_pop(h,f.p),1);inactive++;
   assert.equal(r.frame_get(h,f.p,0),0);assert.equal(r.last_error(),1);
  } else if(action===3) {
   const f=frames[next()%frames.length],index=next()%3,n=next()%4===0?null:nodes[next()%nodes.length];
   assert.equal(r.frame_set(h,f.p,index,n?.p??0),1);f.slots[index]=n;
  } else if(action===4) {
   const n=nodes[next()%nodes.length],index=next()%n.edges.length,child=next()%4===0?null:nodes[next()%nodes.length];
   assert.equal(r.value_set(h,n.p,index,child?.p??0),1);n.edges[index]=child;
  } else {
   const dead=prune();assert.equal(r.heap_collect(h),dead.length+inactive);inactive=0;checkDead(dead);
   assert.equal(r.heap_live(h),nodes.length+frames.length);
  }
  assert.equal(r.frame_depth(h),frames.length);
  for(const f of frames)for(let i=0;i<3;i++)assert.equal(r.frame_get(h,f.p,i),f.slots[i]?.p??0);
 }
 const deadCount=nodes.length+frames.length+inactive;assert.equal(r.frame_unwind(h,0),1);
 assert.equal(r.heap_collect(h),deadCount);assert.equal(r.heap_live(h),0);assert.equal(r.heap_used(h),129*24);
});
test('managed text primitives preserve UTF16 code units, lexicographic order and checked intervals',()=>{
 const {r,h}=runtime();const left=managedString(r,h,'a\0😀\ud800'),right=managedString(r,h,'\udc00z');
 const joined=r.value_string_concat(h,left,right);assert(joined>0);assert.equal(readManagedString(r,h,joined),'a\0😀\ud800\udc00z');
 const slice=r.value_string_slice(h,joined,3,6);assert(slice>0);assert.equal(readManagedString(r,h,slice),'\ude00\ud800\udc00');
 assert.equal(r.value_string_code_point(h,joined,2),0x1f600);assert.equal(r.value_string_code_point(h,left,4),0xd800);
 assert.equal(r.value_string_compare(h,left,left),0);assert.equal(r.value_string_compare(h,left,right),1);assert.equal(r.value_string_compare(h,right,left),2);
 const empty=managedString(r,h,''),needle=managedString(r,h,'\ud800\udc00');
 assert.equal(r.value_string_find(h,joined,needle,0),4);assert.equal(r.value_string_find(h,joined,needle,5),0xffffffff);
 assert.equal(r.value_string_find(h,joined,empty,7),7);assert.equal(r.value_string_find(h,empty,needle,0),0xffffffff);
 const before=r.heap_live(h);assert.equal(r.value_string_slice(h,left,4,2),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_string_slice(h,left,0,6),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_string_code_point(h,left,5),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_string_find(h,left,empty,6),0);assert.equal(r.last_error(),3);assert.equal(r.heap_live(h),before);
 const builder=r.value_string(h,1);assert.equal(r.value_string_concat(h,left,builder),0);assert.equal(r.last_error(),6);
 assert.equal(r.value_string_compare(h,left,0),0);assert.equal(r.last_error(),1);
});
test('managed UTF8 codecs match replacement, strict errors, maximal subparts and BOM',()=>{
 const {r,h}=runtime();
 for(const text of ['', 'ASCII\0','中文😀','\ufeffx','\ud800x\udc00','\udbff\udfff','\ud800\ud800\udc00']) {
  const source=managedString(r,h,text),encoded=r.value_utf8_encode(h,source,0);assert(encoded>0);
  assert.deepEqual(readManagedBytes(r,h,encoded),new TextEncoder().encode(text));
  const live=r.heap_live(h),strict=r.value_utf8_encode(h,source,1);
  if(/\p{Surrogate}/u.test(text)){assert.equal(strict,0);assert.equal(r.last_error(),5);assert.equal(r.heap_live(h),live);}
  else{assert(strict>0);assert.deepEqual(readManagedBytes(r,h,strict),new TextEncoder().encode(text));}
  r.heap_collect(h);
 }
 for(const input of [[],[0],[0xff],[0xc0,0xaf],[0xe0,0x80,0x80],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xf0,0x9f],[0xe2,0x82,0x22],[0xe2,0x28,0xa1],[0xef,0xbb,0xbf,65],[0xef,0xbb,0xbf,0xef,0xbb,0xbf],[0xf4,0x8f,0xbf,0xbf]]) {
  const source=managedBytes(r,h,input);
  for(const preserve of [0,1]){const output=r.value_utf8_decode(h,source,0,preserve);assert(output>0);
   assert.equal(readManagedString(r,h,output),new TextDecoder('utf-8',{ignoreBOM:!!preserve}).decode(Uint8Array.from(input)));}
  let expected;try{expected=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(input));}catch{}
  const live=r.heap_live(h),strict=r.value_utf8_decode(h,source,1,0);
  if(expected===undefined){assert.equal(strict,0);assert.equal(r.last_error(),4);assert.equal(r.heap_live(h),live);}
  else{assert(strict>0);assert.equal(readManagedString(r,h,strict),expected);}
  r.heap_collect(h);
 }
 const builder=r.value_string(h,0);assert.equal(r.value_utf8_encode(h,builder,0),0);assert.equal(r.last_error(),6);
 const source=managedBytes(r,h,[65]);assert.equal(r.value_utf8_decode(h,source,2,0),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_utf8_decode(h,source,0,2),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_utf8_encode(h,source,0),0);assert.equal(r.last_error(),1);
});
test('managed text allocation protects unrooted operands during moving GC and capacity failure',()=>{
 const {r,h}=runtime(32,2048,1048576),left=managedString(r,h,'x'.repeat(20000)),right=managedString(r,h,'😀'.repeat(10000));
 r.heap_auto(h,1);const joined=r.value_string_concat(h,left,right);assert(joined>0);
 assert.equal(readManagedString(r,h,joined),'x'.repeat(20000)+'😀'.repeat(10000));assert.equal(readManagedString(r,h,left),'x'.repeat(20000));
 assert.equal(readManagedString(r,h,right),'😀'.repeat(10000));r.heap_pin(h,joined);
 const encoded=r.value_utf8_encode(h,joined,1);assert(encoded>0);assert.deepEqual(readManagedBytes(r,h,encoded),new TextEncoder().encode(readManagedString(r,h,joined)));
 const decoded=r.value_utf8_decode(h,encoded,1,1);assert(decoded>0);assert.equal(readManagedString(r,h,decoded),readManagedString(r,h,joined));
 r.heap_release(h,joined);r.heap_collect(h);assert.equal(r.heap_live(h),0);
 const tiny=runtime(2,512,512),source=managedString(tiny.r,tiny.h,'a'.repeat(100));tiny.r.heap_auto(tiny.h,1);
 assert.equal(tiny.r.value_string_concat(tiny.h,source,source),0);assert.equal(tiny.r.last_error(),2);
 assert.equal(readManagedString(tiny.r,tiny.h,source),'a'.repeat(100));assert.equal(tiny.r.heap_collect(tiny.h),1);assert.equal(tiny.r.heap_live(tiny.h),0);
});
test('managed text search agrees exhaustively with an independent small-alphabet oracle without allocation',()=>{
 const {r,h}=runtime(256,32768,1048576),texts=[''];
 for(let length=1;length<=6;length++)for(let bits=0;bits<2**length;bits++)texts.push(Array.from({length},(_,i)=>(bits>>i)&1?'b':'a').join(''));
 const values=texts.map(text=>managedString(r,h,text)),before=r.heap_used(h),live=r.heap_live(h);
 for(let i=0;i<texts.length;i++)for(let j=0;j<texts.length;j++)for(let start=0;start<=texts[i].length;start++) {
  const result=r.value_string_find(h,values[i],values[j],start),expected=texts[i].indexOf(texts[j],start);
  assert.equal(result,expected===-1?0xffffffff:expected,`${JSON.stringify(texts[i])},${JSON.stringify(texts[j])},${start}`);assert.equal(r.last_error(),0);
 }
 assert.equal(r.heap_used(h),before);assert.equal(r.heap_live(h),live);
});
test('managed text random Unicode slices, search, ordering and code points preserve every code unit',()=>{
 const {r,h}=runtime();let state=0x693fec1;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const randomText=()=>Array.from({length:next()%64},()=>String.fromCharCode(next()%4?next()&65535:0xd800+next()%2048)).join('');
 for(let round=0;round<1024;round++) {
  const text=randomText(),needle=round%2?randomText():text.slice(next()%(text.length+1)),a=managedString(r,h,text),b=managedString(r,h,needle);
  const start=next()%(text.length+1),end=start+next()%(text.length-start+1);
  const sliced=r.value_string_slice(h,a,start,end);assert(sliced>0);assert.equal(readManagedString(r,h,sliced),text.slice(start,end));
  const joined=r.value_string_concat(h,a,b);assert(joined>0);assert.equal(readManagedString(r,h,joined),text+needle);
  const found=text.indexOf(needle,start);assert.equal(r.value_string_find(h,a,b,start),found===-1?0xffffffff:found);
  assert.equal(r.value_string_compare(h,a,b),text===needle?0:text<needle?1:2);
  for(let index=0;index<text.length;index++)assert.equal(r.value_string_code_point(h,a,index),text.codePointAt(index));
  assert.equal(r.heap_collect(h),4);
 }
});
test('managed text search handles long periodic and nonperiodic prefixes in bounded space',()=>{
 const {r,h}=runtime(16,4096,1048576),text='a'.repeat(250000)+'b',a=managedString(r,h,text);
 for(const needle of ['a'.repeat(8192)+'c','a'.repeat(8192)+'b','abab'.repeat(2000),'a'.repeat(8192)]) {
  const b=managedString(r,h,needle),before=r.heap_used(h),live=r.heap_live(h);
  for(const start of [0,1,100000,text.length]){const expected=text.indexOf(needle,start);assert.equal(r.value_string_find(h,a,b,start),expected===-1?0xffffffff:expected);}
  assert.equal(r.heap_used(h),before);assert.equal(r.heap_live(h),live);r.heap_pin(h,a);r.heap_collect(h);r.heap_release(h,a);
 }
});
test('managed UTF8 random differentials survive per-allocation collection and reject before allocation',()=>{
 const {r,h}=runtime(16,4096,32768);r.heap_auto(h,1);let state=0x84601b3;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let round=0;round<2048;round++) {
  const text=Array.from({length:next()%64},()=>String.fromCharCode(next()&65535)).join(''),source=managedString(r,h,text);r.heap_pin(h,source);
  const encoded=r.value_utf8_encode(h,source,0);assert(encoded>0);assert.deepEqual(readManagedBytes(r,h,encoded),new TextEncoder().encode(text));
  const before=r.heap_live(h),collections=r.heap_collections(h),strict=r.value_utf8_encode(h,source,1);
  if(/\p{Surrogate}/u.test(text)){assert.equal(strict,0);assert.equal(r.last_error(),5);assert.equal(r.heap_live(h),before);assert.equal(r.heap_collections(h),collections);}
  else{assert(strict>0);assert.deepEqual(readManagedBytes(r,h,strict),new TextEncoder().encode(text));}
  r.heap_release(h,source);r.heap_collect(h);
  const input=Uint8Array.from({length:next()%64},()=>next()&255),value=managedBytes(r,h,input);r.heap_pin(h,value);
  for(const preserve of [0,1]) {
   const decoded=r.value_utf8_decode(h,value,0,preserve);assert(decoded>0);assert.equal(readManagedString(r,h,decoded),new TextDecoder('utf-8',{ignoreBOM:!!preserve}).decode(input));
   let expected;try{expected=new TextDecoder('utf-8',{ignoreBOM:!!preserve,fatal:true}).decode(input);}catch{}
   const live=r.heap_live(h),collections=r.heap_collections(h),strict=r.value_utf8_decode(h,value,1,preserve);
   if(expected===undefined){assert.equal(strict,0);assert.equal(r.last_error(),4);assert.equal(r.heap_live(h),live);assert.equal(r.heap_collections(h),collections);}
   else{assert(strict>0);assert.equal(readManagedString(r,h,strict),expected);}
  }
  r.heap_release(h,value);r.heap_collect(h);assert.equal(r.heap_live(h),0);
 }
});
test('managed text bridge executes operations in WASM, preserves brands and transfers owned codec results',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes);a.auto(1);
 const text=a.string('a\0😀\ud800'),tail=a.string('\udc00z'),joined=a.concatStrings(text,tail);a.release(text);a.release(tail);
 assert.equal(a.readString(joined),'a\0😀\ud800\udc00z');assert.equal(a.codePoint(joined,2),0x1f600);
 const sliced=a.sliceString(joined,3,6);assert.equal(a.readString(sliced),'\ude00\ud800\udc00');a.release(sliced);
 const needle=a.string('\ud800\udc00');assert.equal(a.findString(joined,needle),4);assert.equal(a.findString(joined,needle,5),-1);assert.equal(a.compareStrings(joined,needle),-1);a.release(needle);
 const encoded=a.encodeUtf8(joined,{strict:true});assert.deepEqual(a.readBytes(encoded),new TextEncoder().encode(a.readString(joined)));
 const decoded=a.decodeUtf8(encoded,{strict:true,preserveBOM:true});assert.equal(a.readString(decoded),a.readString(joined));
 const invalid=a.bytes([0xc0,0xaf]);assert.throws(()=>a.decodeUtf8(invalid,{strict:true}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0004');a.release(invalid);
 assert.throws(()=>b.sliceString(joined,0,1),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 for(const operation of [()=>a.sliceString(joined,-0),()=>a.encodeUtf8(joined,{strict:1}),()=>a.decodeUtf8(encoded,{preserveBOM:'true'})])
  assert.throws(operation,e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 a.release(decoded);a.release(encoded);a.release(joined);a.collect();assert.equal(a.live(),0);
});
test('managed text OOM and invalid encoding leave input data and temporary roots transactional',()=>{
 for(const operation of ['slice','encode','decode']) {
  const {r,h}=runtime(2,512,512),text='中'.repeat(100);
  const source=operation==='decode'?managedBytes(r,h,Array(150).fill(65)):managedString(r,h,text);
  r.heap_auto(h,1);
  const result=operation==='slice'?r.value_string_slice(h,source,0,100):operation==='encode'?r.value_utf8_encode(h,source,1):r.value_utf8_decode(h,source,1,0);
  assert.equal(result,0,operation);assert.equal(r.last_error(),2);
  if(operation==='decode')assert.deepEqual(readManagedBytes(r,h,source),new Uint8Array(150).fill(65));
  else assert.equal(readManagedString(r,h,source),text);
  assert.equal(r.heap_live(h),1);assert.equal(r.heap_collect(h),1);assert.equal(r.heap_live(h),0);
 }
 const {r,h}=runtime(),bad=managedBytes(r,h,[0xff]),lone=managedString(r,h,'\ud800');
 const used=r.heap_used(h),live=r.heap_live(h);
 assert.equal(r.value_utf8_decode(h,bad,1,0),0);assert.equal(r.last_error(),4);
 assert.equal(r.value_utf8_encode(h,lone,1),0);assert.equal(r.last_error(),5);
 assert.equal(r.heap_used(h),used);assert.equal(r.heap_live(h),live);assert.equal(r.heap_collect(h),2);
});
test('Node and Bun execute a whole managed text pipeline inside zero-import WASM under GC pressure',async()=>{
 const {writeFile}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8')+await readFile(resolve('tests/fixtures/wasm-managed-text.eli'),'utf8');
 const artifact=Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'text-pipeline.eli'),{maximumPages:8}));
 const module=new WebAssembly.Module(artifact);assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const e=new WebAssembly.Instance(module).exports,r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'?(...args)=>v(...args)>>>0:v]));
 const h=r.heap_new(24,2048,2048),input=managedString(r,h,'\ufeff中😀\0\ud800a');r.heap_auto(h,1);
 const output=r.text_pipeline(h,input,1000);assert(output>0);assert.equal(readManagedString(r,h,output),'\ufeff中😀\0\ufffda');
 assert.equal(r.frame_depth(h),0);assert(r.heap_collections(h)>5000);r.heap_release(h,output);r.heap_collect(h);assert.equal(r.heap_live(h),0);
 const path=resolve(directory,'text-pipeline.wasm');await writeFile(path,artifact);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
 const module=new WebAssembly.Module(readFileSync(${JSON.stringify(path)}));assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const e=new WebAssembly.Instance(module).exports,h=e['heap-new'](24,2048,2048),units=[0xfeff,0x4e2d,0xd83d,0xde00,0,0xd800,97];
 const input=e['value-string'](h,units.length)>>>0;for(let i=0;i<units.length;i++)assert.equal(e['value-unit-set'](h,input,i,units[i]),1);e['value-seal'](h,input);e['heap-auto'](h,1);
 const output=e['text-pipeline'](h,input,1000)>>>0;assert(output>0);assert.equal(e['value-length'](h,output),7);
 assert.deepEqual(Array.from({length:7},(_,i)=>e['value-unit-get'](h,output,i)),[0xfeff,0x4e2d,0xd83d,0xde00,0,0xfffd,97]);
 assert.equal(e['frame-depth'](h),0);assert(e['heap-collections'](h)>5000);e['heap-release'](h,output);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
test('managed keys use SameValueZero, exact scalar hashes and distinct immediate categories without allocation',()=>{
 const {r,h}=runtime(128),values=[null,false,true,undefined,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,1,-1,'','a\0😀\ud800','\udc00'];
 const handles=values.map(value=>typeof value==='number'?number(r,h,value):typeof value==='string'?managedString(r,h,value):[null,false,true,undefined].indexOf(value));
 const used=r.heap_used(h),live=r.heap_live(h),collections=r.heap_collections(h);
 for(let i=0;i<values.length;i++) {
  assert.equal(r.value_key_hash(h,handles[i]),hashValue(values[i]));assert.equal(r.last_error(),0);
  for(let j=0;j<values.length;j++)assert.equal(r.value_key_equal(h,handles[i],handles[j]),Number(equalValues(values[i],values[j])));
 }
 const duplicate=managedString(r,h,'a\0😀\ud800');assert.equal(r.value_key_equal(h,handles[14],duplicate),1);
 assert.equal(r.value_key_hash(h,handles[14]),r.value_key_hash(h,duplicate));
 assert.equal(r.heap_live(h),live+1);assert.equal(r.heap_collections(h),collections);assert(r.heap_used(h)>used);
 const before=r.heap_used(h);for(let i=0;i<1000;i++)assert.equal(r.value_key_hash(h,duplicate),hashValue(values[14]));assert.equal(r.heap_used(h),before);
});
test('managed key hashing canonicalizes every NaN payload and signed zero while arithmetic equality stays IEEE',()=>{
 const {r,h}=runtime(),zero=number(r,h,0),minusZero=number(r,h,-0);assert.equal(r.value_key_hash(h,zero),r.value_key_hash(h,minusZero));
 for(const [low,high] of [[1,0x7ff00000],[0,0x7ff80000],[0x12345678,0x7ff12345],[0,0xfff80000],[1,0xfff00000]]) {
  const x=r.value_number(h,low,high),y=number(r,h,NaN);assert(x&&y);
  assert.equal(r.value_key_equal(h,x,y),1);assert.equal(r.value_number_compare(h,x,y,0),0);
  assert.equal(r.value_key_hash(h,x),hashValue(NaN));assert.equal(r.value_key_hash(h,y),hashValue(NaN));
  const p=r.value_data(h,x,4),view=new DataView(r.memory.buffer);assert.equal(view.getUint32(p,true),low);assert.equal(view.getUint32(p+4,true),high);
 }
 assert.equal(r.value_key_equal(h,zero,minusZero),1);assert.equal(r.value_number_compare(h,zero,minusZero,0),1);
});
test('managed key hashes and equality match independent JS for randomized Number bits and Unicode units',()=>{
 const {r,h}=runtime(16,4096,32768);let state=0x4934fa1;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const bits=new DataView(new ArrayBuffer(8));
 for(let i=0;i<4096;i++) {
  const low=next(),high=next();bits.setUint32(0,low,true);bits.setUint32(4,high,true);const value=bits.getFloat64(0,true),a=r.value_number(h,low,high),b=number(r,h,value);
  assert(a&&b);assert.equal(r.value_key_equal(h,a,b),1);assert.equal(r.value_key_hash(h,a),hashValue(value));
  const other=number(r,h,i);assert.equal(r.value_key_equal(h,a,other),Number(equalValues(value,i)));
  const text=Array.from({length:next()%64},()=>String.fromCharCode(next()&65535)).join(''),x=managedString(r,h,text),y=managedString(r,h,text);
  assert.equal(r.value_key_equal(h,x,y),1);assert.equal(r.value_key_hash(h,x),hashValue(text));assert.equal(r.value_key_hash(h,y),hashValue(text));
  assert.equal(r.heap_collect(h),5);
 }
});
test('managed opaque keys retain identity through mutation, growth and collection and reject invalid lifetime',()=>{
 const {r,h}=runtime(32,2048,1048576);r.heap_auto(h,1);
 for(const kind of [6,7,8]) {
  const a=kind===6?r.value_bytes(h,8):r.value_refs(h,kind,1);assert(a>0);r.heap_pin(h,a);
  const b=kind===6?r.value_bytes(h,8):r.value_refs(h,kind,1);assert(b>0);r.heap_pin(h,b);
  const hash=r.value_key_hash(h,a);assert.equal(r.value_key_equal(h,a,a),1);assert.equal(r.value_key_equal(h,a,b),0);
  if(kind===6)assert.equal(r.value_bytes_resize(h,a,70000),1);
  else {assert.equal(r.value_set(h,a,0,b),1);if(kind===7)assert.equal(r.value_refs_resize(h,a,10000),1);}
  assert.equal(r.value_key_hash(h,a),hash);assert.equal(r.value_key_equal(h,a,b),0);assert.equal(r.heap_collect(h),0);
  r.heap_release(h,a);r.heap_release(h,b);assert.equal(r.heap_collect(h),2);
  assert.equal(r.value_key_hash(h,a),0);assert.equal(r.last_error(),1);
  assert.equal(r.value_key_equal(h,a,a),0);assert.equal(r.last_error(),1);
 }
 const builder=r.value_string(h,1);r.heap_pin(h,builder);assert.equal(r.value_key_hash(h,builder),0);assert.equal(r.last_error(),6);
 assert.equal(r.value_key_equal(h,builder,builder),0);assert.equal(r.last_error(),6);
 const frame=r.frame_new(h,0);assert(frame>0);assert.equal(r.value_key_hash(h,frame),0);assert.equal(r.last_error(),3);
 assert.equal(r.value_key_equal(h,frame,frame),0);assert.equal(r.last_error(),3);r.frame_pop(h,frame);r.heap_release(h,builder);r.heap_collect(h);
});
test('managed key bridge preserves brands and SameValueZero and performs no allocation',async()=>{
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes);a.auto(1);
 const x=a.number(-0),y=a.number(0),n=a.number(NaN),m=a.number(NaN),text=a.string('中😀\ud800'),copy=a.string('中😀\ud800'),array=a.array(),other=a.array();
 const before=a.stats();assert(a.keyEqual(x,y));assert(a.keyEqual(n,m));assert(a.keyEqual(text,copy));assert(!a.keyEqual(array,other));assert(a.keyEqual(array,array));
 for(const [handle,value]of[[x,-0],[y,0],[n,NaN],[text,'中😀\ud800'],[null,null],[false,false],[true,true],[undefined,undefined]])assert.equal(a.keyHash(handle),hashValue(value));
 assert.equal(a.keyHash(array),a.keyHash(array));assert.deepEqual(a.stats(),before);
 const owner=a.array([array]),alias=a.get(owner,0);assert.notEqual(array,alias);assert(a.keyEqual(array,alias));assert.equal(a.keyHash(array),a.keyHash(alias));
 a.release(alias);a.release(owner);
 assert.throws(()=>b.keyHash(text),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
 assert.throws(()=>a.keyEqual(0,x),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 for(const handle of [x,y,n,m,text,copy,array,other])a.release(handle);a.collect();assert.equal(a.live(),0);
});
test('Node and Bun execute the same whole key pipeline through repeated WASM allocation safepoints',async()=>{
 const {writeFile}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');
 const source=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8')+await readFile(resolve('tests/fixtures/wasm-managed-text.eli'),'utf8');
 const artifact=Uint8Array.from(backend.wasm.emit_memory_wasm(backend.compiler.compile_ir_string(source,'key-pipeline.eli'),{maximumPages:8}));
 const module=new WebAssembly.Module(artifact);assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const e=new WebAssembly.Instance(module).exports,h=e['heap-new'](12,768,768);e['heap-auto'](h,1);
 const value=e['key-pressure'](h,1000)>>>0;assert(value>0);assert.equal(e['value-key-hash'](h,value)>>>0,hashValue(NaN));
 assert.equal(e['frame-depth'](h),0);assert(e['heap-collections'](h)>=2000);e['heap-release'](h,value);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
 const path=resolve(directory,'key-pipeline.wasm');await writeFile(path,artifact);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
 const module=new WebAssembly.Module(readFileSync(${JSON.stringify(path)}));assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const e=new WebAssembly.Instance(module).exports,h=e['heap-new'](12,768,768);e['heap-auto'](h,1);
 const value=e['key-pressure'](h,1000)>>>0;assert(value>0);assert.equal(e['value-key-hash'](h,value)>>>0,1490037359);
 const point=e['value-data'](h,value,4)>>>0,view=new DataView(e.memory.buffer);assert.equal(view.getUint32(point,true),999);assert.equal(view.getUint32(point+4,true),2146959360);
 assert.equal(e['frame-depth'](h),0);assert(e['heap-collections'](h)>=2000);e['heap-release'](h,value);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
