import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import{resolve}from'node:path';import{tmpdir}from'node:os';
import {buildBackends}from'../tools/backends/build.mjs';
let directory,bytes;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-gc-batch-'));const b=await buildBackends({outputRoot:directory});const source=await readFile('bootstrap/runtime/memory.eli','utf8')+'\n(export heap-base heap-control)';bytes=Uint8Array.from(b.wasm.emit_memory_wasm(b.compiler.compile_ir_string(source,'gc-batch.eli'),{maximumPages:128}));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function runtime(slots=128,capacity=16384){const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'? (...a)=>v(...a)>>>0:v]));const heap=r.heap_new(slots,capacity,capacity);assert(heap);return{r,h:heap};}
function layout(r,h){const view=new DataView(r.memory.buffer),base=r.heap_base(h),out=[];let off=r.heap_control(h,6),last=0;while(off){assert(off>last);const size=view.getUint32(base+off,true);assert(size>=32);if(last)assert(out.at(-1)[0]+out.at(-1)[1]<off);out.push([off,size]);last=off;off=view.getUint32(base+off+4,true);assert(out.length<1000);}return out;}
function merge(intervals){const out=[];for(const [start,size]of intervals.sort((a,b)=>a[0]-b[0])){if(out.length&&out.at(-1)[0]+out.at(-1)[1]===start)out.at(-1)[1]+=size;else out.push([start,size]);}return out;}
test('fragmented sweep preserves exact free intervals, survivor locations and full tail reclamation',()=>{
 const{r,h}=runtime(),blocks=[];for(let i=0;i<80;i++){const length=8+(i%9)*8,x=r.value_bytes(h,length);assert(x);blocks.push({x,start:r.value_data(h,x,6)-32-r.heap_base(h),size:(length+39)&~7});if(i%3===0)r.heap_pin(h,x);}
 let used=r.heap_used(h);const holes=merge(blocks.filter((_,i)=>i%3!==0).map(b=>[b.start,b.size]));if(holes.length&&holes.at(-1)[0]+holes.at(-1)[1]===used)used=holes.pop()[0];
 assert.equal(r.heap_collect(h),53);assert.equal(r.heap_used(h),used);assert.deepEqual(layout(r,h),holes);for(let i=0;i<80;i++)if(i%3===0){assert.equal(r.value_data(h,blocks[i].x,6)-32-r.heap_base(h),blocks[i].start);r.heap_release(h,blocks[i].x);}assert.equal(r.heap_collect(h),27);assert.equal(r.heap_used(h),(128+1)*24);assert.deepEqual(layout(r,h),[]);
});
test('random fragmented collections match an independent interval union and exact address-first-fit model',()=>{
 const{r,h}=runtime();let cursor=(128+1)*24,free=[],live=[],seed=0x7a93c12d;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let round=0;round<48;round++){
  for(let i=0;i<12;i++){const length=next()%160,size=(length+39)&~7;let expected=cursor,actual=size,index=free.findIndex(([,n])=>n>=size);if(index>=0){const[start,n]=free[index];expected=start;if(n-size>=32)free.splice(index,1,[start+size,n-size]);else{actual=n;free.splice(index,1);}}else cursor+=size;
   const x=r.value_bytes(h,length);assert(x,'bounded model allocation');assert.equal(r.value_data(h,x,6)-32-r.heap_base(h),expected);r.heap_pin(h,x);if(length)r.value_byte_set(h,x,length-1,round);live.push({x,start:expected,size:actual,length,mark:round});
  }
  const dead=[],kept=[];for(const item of live){if(next()%4!==0){r.heap_release(h,item.x);dead.push(item);}else kept.push(item);}free=merge([...free,...dead.map(x=>[x.start,x.size])]);if(free.length&&free.at(-1)[0]+free.at(-1)[1]===cursor)cursor=free.pop()[0];assert.equal(r.heap_collect(h),dead.length);assert.equal(r.heap_used(h),cursor);assert.deepEqual(layout(r,h),free);for(const item of dead){assert.equal(r.value_kind(h,item.x),0);assert.equal(r.last_error(),1);}for(const item of kept){assert.equal(r.value_data(h,item.x,6)-32-r.heap_base(h),item.start);if(item.length)assert.equal(r.value_byte_get(h,item.x,item.length-1),item.mark);}live=kept;
 }
 for(const x of live)r.heap_release(h,x.x);assert.equal(r.heap_collect(h),live.length);assert.equal(r.heap_live(h),0);assert.equal(r.heap_used(h),(128+1)*24);
});
test('existing and newly dead holes coalesce through the tail and restore capacity without relocating a survivor',()=>{
 const{r,h}=runtime(8,512),a=r.value_bytes(h,64),b=r.value_bytes(h,64),c=r.value_bytes(h,64);assert(a&&b&&c);r.heap_pin(h,a);r.heap_pin(h,a);r.heap_pin(h,c);r.value_byte_set(h,a,63,197);const address=r.value_data(h,a,6);r.heap_release(h,a);
 assert.equal(r.value_bytes(h,100),0);assert.equal(r.last_error(),2);assert.equal(r.heap_collect(h),1);assert.deepEqual(layout(r,h),[[216+96,96]]);assert.equal(r.value_bytes(h,80),0);assert.equal(r.last_error(),2);
 r.heap_release(h,c);assert.equal(r.heap_collect(h),1);assert.equal(r.heap_used(h),216+96);assert.deepEqual(layout(r,h),[]);const replacement=r.value_bytes(h,100);assert(replacement);assert.notEqual(replacement,b);assert.notEqual(replacement,c);assert.equal(r.value_data(h,a,6),address);assert.equal(r.value_byte_get(h,a,63),197);
 for(const stale of[b,c]){assert.equal(r.value_kind(h,stale),0);assert.equal(r.last_error(),1);}r.heap_release(h,a);assert.equal(r.heap_collect(h),2);assert.equal(r.heap_live(h),0);assert.equal(r.heap_used(h),216);
});
test('automatic full collections preserve frame roots, cycles, signed-number bits and a peer heap',()=>{
 const{r,h}=runtime(),peer=r.heap_new(64,4096,4096);assert(peer);const foreign=r.value_bytes(peer,16);r.heap_pin(peer,foreign);r.value_byte_set(peer,foreign,15,93);
 const frame=r.frame_new(h,2),root=r.value_refs(h,7,2),n=r.value_number(h,0,0x80000000);r.frame_set(h,frame,0,root);r.value_set(h,root,0,root);r.value_set(h,root,1,n);const address=r.value_data(h,root,7);r.heap_auto(h,1);
 for(let i=0;i<80;i++){const garbage=r.value_bytes(h,8+(i%9)*8);assert(garbage);assert.equal(r.value_get(h,root,0),root);assert.equal(r.value_data(h,root,7),address);const number=r.value_get(h,root,1),data=r.value_data(h,number,4);assert(Object.is(new DataView(r.memory.buffer).getFloat64(data,true),-0));assert.equal(r.frame_depth(h),1);assert.equal(r.value_byte_get(peer,foreign,15),93);}
 assert(r.heap_collections(h)>=80);r.heap_auto(h,0);assert.equal(r.heap_collect(h),1);r.frame_pop(h,frame);assert.equal(r.heap_collect(h),3);assert.equal(r.heap_live(h),0);assert.equal(r.heap_used(h),(128+1)*24);assert.equal(r.heap_live(peer),1);r.heap_release(peer,foreign);assert.equal(r.heap_collect(peer),1);
});
test('ordinary resize preserves its free intervals and GC subsequently merges those holes',()=>{
 const{r,h}=runtime(),a=r.value_bytes(h,16),barrier=r.value_bytes(h,16);r.heap_pin(h,a);r.heap_pin(h,barrier);const first=r.value_data(h,a,6)-32-r.heap_base(h);assert.equal(r.value_bytes_resize(h,a,128),1);assert.deepEqual(layout(r,h),[[first,48]]);r.heap_release(h,barrier);assert.equal(r.heap_collect(h),1);assert.deepEqual(layout(r,h),[[first,96]]);r.heap_release(h,a);assert.equal(r.heap_collect(h),1);assert.deepEqual(layout(r,h),[]);assert.equal(r.heap_used(h),(128+1)*24);
});
