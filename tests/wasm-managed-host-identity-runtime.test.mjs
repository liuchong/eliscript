import{beforeAll,afterAll,test}from'bun:test';import assert from'node:assert/strict';
import{readFile,mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{resolve}from'node:path';
import{buildBackends}from'../tools/backends/build.mjs';
let directory,b,source,bytes;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-host-identity-'));b=await buildBackends({outputRoot:directory});source=await readFile('bootstrap/runtime/memory.eli','utf8')+'\n(export value-function-new)';bytes=Uint8Array.from(b.wasm.emit_memory_wasm(b.compiler.compile_ir_string(source,'identity-runtime.eli'),{maximumPages:256}));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function runtime(slots=256,initial=16384,max=1048576,data=bytes){const e=new WebAssembly.Instance(new WebAssembly.Module(data)).exports,r=Object.fromEntries(Object.entries(e).map(([k,v])=>[k.replaceAll('-','_'),typeof v==='function'? (...a)=>v(...a)>>>0:v]));const h=r.heap_new(slots,initial,max);assert(h);assert.equal(typeof r.value_host_identity_state_new,'function');assert.equal(typeof r.value_host_identity_token,'function');return{r,h};}
function read(r,h,value){assert(value);assert.equal(r.last_error(),0);return new DataView(r.memory.buffer).getFloat64(r.value_data(h,value,4),true);}
function token(r,h,state,value){const out=r.value_host_identity_token(h,state,value);return read(r,h,out);}
test('module-owned identity state assigns stable independent monotonic tokens rather than exposing reusable heap handles',()=>{const{r,h}=runtime(),state=r.value_host_identity_state_new(h);assert(state);r.heap_pin(h,state);const a=r.value_array_new(h,0),c=r.value_array_new(h,0),f=r.value_function_new(h,7,0);for(const v of[a,c,f])r.heap_pin(h,v);r.heap_auto(h,1);assert.equal(token(r,h,state,a),1);assert.equal(token(r,h,state,a),1);assert.equal(token(r,h,state,c),2);assert.equal(token(r,h,state,f),3);const other=r.value_host_identity_state_new(h);assert(other);r.heap_pin(h,other);assert.equal(token(r,h,other,c),1);assert.equal(token(r,h,other,a),2);assert.equal(token(r,h,state,a),1);for(const v of[state,other,a,c,f])r.heap_release(h,v);r.heap_collect(h);assert.equal(r.heap_live(h),0);assert.equal(r.frame_depth(h),0);});
function text(r,h,s){const out=r.value_string(h,s.length);assert(out);for(let i=0;i<s.length;i++)r.value_unit_set(h,out,i,s.charCodeAt(i));r.value_seal(h,out);return out;}
function readText(r,h,value){const p=r.value_data(h,value,5),n=r.value_length(h,value),v=new DataView(r.memory.buffer);return Array.from({length:n},(_,i)=>String.fromCharCode(v.getUint16(p+i*2,true))).join('');}
function thrown(r,h){assert.equal(r.last_error(),11);const error=r.value_exception_take(h);assert(error);r.heap_pin(h,error);const fields={};for(const name of['name','message']){const key=text(r,h,name),value=r.value_object_get(h,error,key);assert(value);fields[name]=readText(r,h,value);}r.heap_release(h,error);return fields;}
function pinned(r,h,handle){assert(handle);assert.equal(r.heap_pin(h,handle),1);return handle;}
function clear(r,h,roots){for(const x of roots)r.heap_release(h,x);r.heap_collect(h);assert.equal(r.heap_live(h),0);assert.equal(r.frame_depth(h),0);}
test('invalid scalar types throw the exact native TypeError without losing frames, while stale and private ABI inputs stay rejected',()=>{
 const{r,h}=runtime(),state=pinned(r,h,r.value_host_identity_state_new(h)),number=pinned(r,h,r.value_number(h,0,0x7ff80000)),s=pinned(r,h,text(r,h,'中\ud800')),held=pinned(r,h,r.value_number(h,0,0x80000000)),frame=r.frame_new(h,1);r.frame_set(h,frame,0,held);r.heap_auto(h,1);
 for(const value of[0,1,2,3,number,s]){assert.equal(r.value_host_identity_token(h,state,value),0);assert.deepEqual(thrown(r,h),{name:'TypeError',message:'host-identity-token expects an object, function, or symbol'});assert.equal(r.frame_depth(h),1);assert(Object.is(read(r,h,held),-0));}
 for(const [stateArg,value,code]of[[state,frame,3],[state,0xffffffff,1],[0xffffffff,s,1],[s,number,1],[state,state,3]]){assert.equal(r.value_host_identity_token(h,stateArg,value),0);assert.equal(r.last_error(),code);assert.equal(r.frame_depth(h),1);}
 const stale=r.value_array_new(h,0);r.heap_collect(h);assert.equal(r.value_host_identity_token(h,state,stale),0);assert.equal(r.last_error(),1);r.frame_pop(h,frame);clear(r,h,[state,number,s,held]);
});
test('weak object and function entries release their keys and never alias a recycled slot or counter',()=>{
 const{r,h}=runtime(32,4096,65536),state=pinned(r,h,r.value_host_identity_state_new(h));r.heap_auto(h,1);let reused=false,previous=0;
 for(let i=0;i<120;i++){const value=i%2?r.value_function_new(h,7,0):r.value_array_new(h,0);assert(value);assert.equal(token(r,h,state,value),i+1);if(previous&&(previous&0xfffff)===(value&0xfffff))reused=true;previous=value;r.heap_collect(h);assert.equal(r.heap_live(h),4);assert.equal(r.value_kind(h,value),0);assert.equal(r.last_error(),1);}
 assert(reused,'the fixture must actually recycle an earlier slot');clear(r,h,[state]);
});
test('Symbol entries hold their keys strongly for the state lifetime while weak keys remain collectable',()=>{
 const{r,h}=runtime(),state=pinned(r,h,r.value_host_identity_state_new(h)),symbol=r.value_symbol_well_known(h,0);assert(symbol);assert.equal(token(r,h,state,symbol),1);r.heap_collect(h);assert.equal(r.value_kind(h,symbol),22);assert.equal(token(r,h,state,symbol),1);r.heap_collect(h);assert.equal(r.heap_live(h),7);const object=r.value_array_new(h,0);assert.equal(token(r,h,state,object),2);r.heap_collect(h);assert.equal(r.value_kind(h,object),0);assert.equal(r.last_error(),1);clear(r,h,[state]);
});
test('rehashing preserves all live identities, cleans stale collisions and survives actual pool growth',()=>{
 const{r,h}=runtime(1024,32768,1048576),state=pinned(r,h,r.value_host_identity_state_new(h)),kept=[];r.heap_auto(h,1);
 for(let i=0;i<192;i++){const object=pinned(r,h,r.value_array_new(h,0));assert.equal(token(r,h,state,object),i+1);if(i%3===0)kept.push([object,i+1]);else r.heap_release(h,object);if(i%7===0)r.heap_collect(h);}
 for(const [object,value]of kept.reverse())assert.equal(token(r,h,state,object),value);
 const grow=pinned(r,h,r.value_bytes(h,70000));assert(r.heap_capacity(h)>32768);for(const [object,value]of kept)assert.equal(token(r,h,state,object),value);clear(r,h,[state,grow,...kept.map(([x])=>x)]);
});
test('tokens cross 2^32 exactly, exhaust only after MAX_SAFE_INTEGER and still return older cached identities',()=>{
 const{r,h}=runtime(),state=pinned(r,h,r.value_host_identity_state_new(h)),objects=Array.from({length:6},()=>pinned(r,h,r.value_array_new(h,0))),counter=r.value_get(h,state,0);r.heap_auto(h,1);
 const set=value=>new DataView(r.memory.buffer).setFloat64(r.value_data(h,counter,6),value,true);
 set(2**32-1);for(let i=0;i<3;i++)assert.equal(token(r,h,state,objects[i]),2**32-1+i);
 set(Number.MAX_SAFE_INTEGER-1);assert.equal(token(r,h,state,objects[3]),Number.MAX_SAFE_INTEGER-1);assert.equal(token(r,h,state,objects[4]),Number.MAX_SAFE_INTEGER);assert.equal(r.value_host_identity_token(h,state,objects[5]),0);assert.deepEqual(thrown(r,h),{name:'RangeError',message:'host identity token space exhausted'});for(let i=0;i<5;i++)assert.equal(token(r,h,state,objects[i]),i<3?2**32-1+i:Number.MAX_SAFE_INTEGER-4+i);clear(r,h,[state,...objects]);
});
test('genuine state and result-slot OOM preserve counters, cached values and caller roots for retry',()=>{
 const small=runtime(4,4096,4096);small.r.heap_auto(small.h,1);assert.equal(small.r.value_host_identity_state_new(small.h),0);assert.equal(small.r.last_error(),2);small.r.heap_collect(small.h);assert.equal(small.r.heap_live(small.h),0);assert.equal(small.r.frame_depth(small.h),0);
 const{r,h}=runtime(8,4096,4096),state=pinned(r,h,r.value_host_identity_state_new(h)),object=pinned(r,h,r.value_array_new(h,0)),a=pinned(r,h,r.value_bytes(h,0)),c=pinned(r,h,r.value_bytes(h,0));r.heap_auto(h,1);assert.equal(r.value_host_identity_token(h,state,object),0);assert.equal(r.last_error(),2);assert.equal(r.frame_depth(h),0);r.heap_release(h,a);r.heap_collect(h);assert.equal(token(r,h,state,object),1);assert.equal(token(r,h,state,object),1);clear(r,h,[state,object,c]);
});
test('independent heaps and retained states keep identity counters and weak lifetimes isolated',()=>{
 const{r,h}=runtime(),other=r.heap_new(256,16384,1048576),peerBuffer=pinned(r,other,r.value_bytes(other,0)),left=pinned(r,h,r.value_host_identity_state_new(h)),right=pinned(r,other,r.value_host_identity_state_new(other)),a=pinned(r,h,r.value_array_new(h,0)),c=pinned(r,other,r.value_array_new(other,0));assert.equal(token(r,h,left,a),1);assert.equal(token(r,other,right,c),1);assert.equal(r.value_host_identity_token(other,left,c),0);assert.equal(r.last_error(),1);r.heap_release(h,a);r.heap_collect(h);assert.equal(token(r,other,right,c),1);clear(r,h,[left]);clear(r,other,[right,c,peerBuffer]);
});

async function injectedRuntime(from,replacement){const start=source.indexOf('  (defun '+from+' '),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);const modified=source.slice(0,start)+replacement+'\n'+source.slice(end),ir=b.compiler.compile_ir_string(modified,'identity-trap.eli'),artifact=Uint8Array.from(b.wasm.emit_memory_wasm(ir,{maximumPages:256}));return runtime(256,16384,1048576,artifact);}
test('identity lookup never reads object fields, brands, prototypes or conversion hooks',async()=>{
 const signature='(defun heap-source-primitive (heap value hint)',modified=source.replace(signature,signature+' (load-u32 4294967295)'),ir=b.compiler.compile_ir_string(modified,'identity-nohooks.eli'),artifact=Uint8Array.from(b.wasm.emit_memory_wasm(ir,{maximumPages:256})),{r,h}=runtime(256,16384,1048576,artifact),state=pinned(r,h,r.value_host_identity_state_new(h)),object=pinned(r,h,r.value_object_new(h,3));r.heap_auto(h,1);
 for(const name of['toString','valueOf','kind']){const key=text(r,h,name);r.heap_pin(h,key);assert.equal(r.value_object_put(h,object,key,1,2),1);r.heap_release(h,key);}assert.equal(token(r,h,state,object),1);assert.equal(token(r,h,state,object),1);
 const trace=[],key=new Proxy(function(){},{get(){trace.push('get');throw Error('must not read');},getPrototypeOf(){trace.push('prototype');throw Error('must not inspect');}}),weak=new WeakMap();weak.set(key,1);assert.equal(weak.get(key),1);assert.deepEqual(trace,[]);clear(r,h,[state,object]);
});
test('true weak-table rebuild OOM leaves the old cache valid and can recover after capacity is released',()=>{
 const{r,h}=runtime(128,8192,8192),state=pinned(r,h,r.value_host_identity_state_new(h)),objects=Array.from({length:7},()=>pinned(r,h,r.value_array_new(h,0)));r.heap_auto(h,1);for(let i=0;i<6;i++)assert.equal(token(r,h,state,objects[i]),i+1);r.heap_collect(h);const available=8192-r.heap_used(h),filler=pinned(r,h,r.value_bytes(h,available-32));assert.equal(r.value_host_identity_token(h,state,objects[6]),0);assert.equal(r.last_error(),2);assert.equal(r.frame_depth(h),0);r.heap_release(h,filler);r.heap_collect(h);for(let i=0;i<6;i++)assert.equal(token(r,h,state,objects[i]),i+1);assert.equal(token(r,h,state,objects[6]),7);clear(r,h,[state,...objects]);
});
test('actual weak and strong cache-growth traps need only normal frame unwind, never leaked borrowed pins',async()=>{
 for(const strong of[false,true]){const{r,h}=await injectedRuntime(strong?'heap-table-grow':'heap-host-identity-rebuild',strong?'  (defun heap-table-grow (heap table) (load-u32 4294967295))':'  (defun heap-host-identity-rebuild (heap state) (load-u32 4294967295))'),state=pinned(r,h,r.value_host_identity_state_new(h)),args=pinned(r,h,r.value_refs(h,7,0)),count=strong?5:7,keys=[];r.heap_auto(h,1);
  for(let i=0;i<count;i++)keys.push(pinned(r,h,strong?r.value_symbol_builtin(h,args,0,0):r.value_array_new(h,0)));
  for(let i=0;i<count-1;i++)assert.equal(token(r,h,state,keys[i]),i+1);const caller=r.frame_new(h,1);r.frame_set(h,caller,0,state);assert.throws(()=>r.value_host_identity_token(h,state,keys.at(-1)),WebAssembly.RuntimeError);assert(r.frame_depth(h)>1);r.frame_unwind(h,caller);assert.equal(r.frame_depth(h),1);for(let i=0;i<count-1;i++)assert.equal(token(r,h,state,keys[i]),i+1);r.frame_pop(h,caller);clear(r,h,[state,args,...keys]);
 }
});
test('result boxing trap leaves its counter unconsumed and recovers after the documented caller unwind',async()=>{
 const signature='(defun value-number (heap low high)',modified=source.replace(signature,signature+' (when (and (= high 1072693248) (= (load-u32 20) 0)) (store-u32 20 1) (load-u32 4294967295))'),artifact=Uint8Array.from(b.wasm.emit_memory_wasm(b.compiler.compile_ir_string(modified,'identity-result-trap.eli'),{maximumPages:256})),{r,h}=runtime(256,16384,1048576,artifact),state=pinned(r,h,r.value_host_identity_state_new(h)),value=pinned(r,h,r.value_array_new(h,0)),caller=r.frame_new(h,1);r.frame_set(h,caller,0,state);r.heap_auto(h,1);assert.throws(()=>r.value_host_identity_token(h,state,value),WebAssembly.RuntimeError);r.frame_unwind(h,caller);assert.equal(r.frame_depth(h),1);assert.equal(token(r,h,state,value),1);r.frame_pop(h,caller);clear(r,h,[state,value]);
});
test('weak-cache load hysteresis amortizes cleanup with a permanently live three-quarter boundary and short-lived keys',async()=>{
 const signature='(defun heap-host-identity-rebuild (heap state)',modified=source.replace(signature,signature+' (store-u32 20 (1+ (load-u32 20)))')+'\n(defun identity-rebuild-count () (load-u32 20)) (defun identity-rebuild-reset () (store-u32 20 0)) (export identity-rebuild-count identity-rebuild-reset)',artifact=Uint8Array.from(b.wasm.emit_memory_wasm(b.compiler.compile_ir_string(modified,'identity-hysteresis.eli'),{maximumPages:256})),{r,h}=runtime(512,32768,1048576,artifact),state=pinned(r,h,r.value_host_identity_state_new(h)),keys=[];r.heap_auto(h,1);
 for(let i=0;i<95;i++){const key=pinned(r,h,r.value_array_new(h,0));keys.push(key);assert.equal(token(r,h,state,key),i+1);}
 r.heap_collect(h);r.identity_rebuild_reset();
 for(let i=0;i<32;i++){const key=r.value_array_new(h,0);assert.equal(token(r,h,state,key),96+i);r.heap_collect(h);assert.equal(r.heap_live(h),99);}
 assert(r.identity_rebuild_count()<=1,'one growth must provide linear headroom, rather than rebuilding each short-lived insertion: '+r.identity_rebuild_count());
 for(let i=0;i<keys.length;i++)assert.equal(token(r,h,state,keys[i]),i+1);clear(r,h,[state,...keys]);
});
