import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import{readFile,mkdtemp,rm,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
import{buildBackends}from'../tools/backends/build.mjs';import{instantiateManagedRuntime}from'../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-arrays-'));backend=await buildBackends({outputRoot:directory});runtimeProgram=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-arrays.eli','utf8'),'arrays.eli');bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
function read(a,x){if(!x||typeof x!=='object')return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);if(x.kind===14)return Array.from({length:a.length(x)},(_,i)=>{const v=a.get(x,i);try{return read(a,v);}finally{a.release(v);}});return x;}
function invoke(a,name,args){const result=a.invoke(name,args);try{return read(a,result);}finally{a.release(result);}}
test('ordinary source arrays construct and access exact values, nullish nth and defaults with JS-equivalent evaluation order',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const inputs=[null,false,true,undefined,0,-0,NaN,Infinity,'','中😀\ud800'];
 for(const value of inputs){const v=box(a,value),arr=a.invoke('make',[v,null,undefined]),ref=js.make(value,null,undefined);assert.deepEqual(read(a,arr),ref);
  for(const i of[0,1,2,3,-0,-1,1.5,NaN,Infinity,'0','01','3','length']){const key=box(a,i);assert.deepEqual(invoke(a,'nth-value',[key,arr]),js.nth_value(i,ref));assert.deepEqual(invoke(a,'at',[arr,key]),js.at(ref,i));a.release(key);}
  const zero=a.number(0),fallback=a.string('fallback');assert.deepEqual(invoke(a,'get-value',[arr,zero,fallback]),js.get_value(ref,0,'fallback'));assert.equal(invoke(a,'fallback-order',[arr]),js.fallback_order(ref));assert.deepEqual(invoke(a,'key-order',[arr]),js.key_order(ref));
  for(const x of[v,arr,zero,fallback])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
 const empty=a.invoke('empty',[]);assert.equal(invoke(a,'size',[empty]),0);a.release(empty);a.collect();assert.equal(a.live(),0);
});
test('array index assignment, length changes, append/pop and slices preserve identity and every stored value',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const x=a.number(-0),y=a.string('😀'),arr=a.invoke('make',[x,null,y]),ref=js.make(-0,null,'😀');
 for(const [i,value]of[[5,false],[1,undefined],[0,NaN]]){const key=box(a,i),v=box(a,value);assert.deepEqual(invoke(a,'write',[arr,key,v]),js.write(ref,i,value));assert.deepEqual(read(a,arr),Array.from(ref));a.release(key);a.release(v);}
 for(const length of[8,2,0,3,-0,4]){const n=a.number(length);assert(Object.is(invoke(a,'truncate',[arr,n]),js.truncate(ref,length)));assert.deepEqual(read(a,arr),Array.from(ref));a.release(n);}
 assert.equal(invoke(a,'append',[arr,x,y]),js.append(ref,-0,'😀'));assert.equal(invoke(a,'append-none',[arr]),js.append_none(ref));assert.deepEqual(read(a,arr),Array.from(ref));
 for(const [s,e]of[[0,undefined],[-2,undefined],[1,3],[1.5,3.8],[-Infinity,Infinity],[NaN,NaN],[0,-0],[2**40,2**41]]){const start=box(a,s),end=box(a,e);assert.deepEqual(invoke(a,'interval',[arr,start,end]),Array.from(js.interval(ref,s,e)));a.release(start);a.release(end);}
 assert.deepEqual(invoke(a,'copy',[arr]),Array.from(js.copy(ref)));for(let i=0;i<8;i++){assert.deepEqual(invoke(a,'remove-last',[arr]),js.remove_last(ref));assert.deepEqual(read(a,arr),Array.from(ref));}
 for(const v of[arr,x,y])a.release(v);a.collect();assert.equal(a.live(),0);
});
test('cyclic arrays, assignment references and growing arrays retain edges through GC and release them on shrink',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);const x=a.string('x'),y=a.map(),cycle=a.invoke('nested',[x,y]);const self=a.get(cycle,0);assert(a.keyEqual(cycle,self));a.release(self);a.release(x);a.release(y);a.collect();assert.equal(a.length(cycle),2);a.release(cycle);a.collect();assert.equal(a.live(),0);
 const count=a.number(128),arr=a.invoke('grow-loop',[count]);assert.deepEqual(read(a,arr),Array.from({length:128},(_,i)=>i));assert(a.stats().collections>128);
 const other=a.invoke('empty',[]),returned=a.invoke('write-order',[arr,other]);assert(a.keyEqual(returned,other));const alias=a.get(arr,0);assert(a.keyEqual(alias,other));a.release(alias);a.release(returned);a.release(other);
 const zero=a.number(0);invoke(a,'truncate',[arr,zero]);a.release(zero);a.release(arr);a.release(count);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('array operations refuse invalid lengths, missing capabilities and stale/foreign handles without weakening input identity',()=>{
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),arr=a.invoke('empty',[]),foreign=b.number(1);
 for(const value of[-1,.5,NaN,Infinity,2**32]){const n=a.number(value);assert.throws(()=>a.invoke('truncate',[arr,n]));assert.equal(a.length(arr),0);a.release(n);}
 assert.throws(()=>a.invoke('append',[arr,foreign,false]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(foreign);b.collect();
 const before=JSON.stringify(program);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);
 for(const expr of['(js-call x :map (lambda (a) a))','(js-call x k)','(js-object :x x)','(js-nth :length x)']){const ir=backend.compiler.compile_ir_string(`(defun f (x k) (if false ${expr} x)) (export f)`,'unsupported-container.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='unsupported-container.eli');}
 a.release(arr);a.collect();assert.throws(()=>a.invoke('size',[arr]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(a.live(),0);
});

test('deterministic random array edits and slices match the independent JS control through collection and geometric growth',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),ref=[];let state=0x2134a37;
 const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;},values=[null,false,true,undefined,NaN,Infinity,-Infinity,-0,'中😀\ud800',Number.MIN_VALUE];
 for(let i=0;i<1024;i++){
  const op=next()%5,x=values[next()%values.length],y=values[next()%values.length],b=box(a,x),c=box(a,y),n=a.number(next()%80);
  if(op===0)assert.equal(invoke(a,'append',[arr,b,c]),js.append(ref,x,y));
  else if(op===1)assert.deepEqual(invoke(a,'remove-last',[arr]),js.remove_last(ref));
  else if(op===2){assert.deepEqual(invoke(a,'write',[arr,n,b]),js.write(ref,a.readNumber(n),x));}
  else if(op===3){assert.equal(invoke(a,'truncate',[arr,n]),js.truncate(ref,a.readNumber(n)));}
  else {const start=a.number((next()%160)-80+.5),end=a.number((next()%160)-80+.5);assert.deepEqual(invoke(a,'interval',[arr,start,end]),Array.from(js.interval(ref,a.readNumber(start),a.readNumber(end))));a.release(start);a.release(end);}
  assert.deepEqual(read(a,arr),Array.from(ref));for(const v of[b,c,n])a.release(v);a.collect();assert.equal(a.stats().frameDepth,0);
 }
 a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('array calls capture their receiver and operands once, observe argument mutation, and still evaluate ignored method arguments',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),other=a.invoke('empty',[]),ref=[],refOther=[];
 assert.equal(invoke(a,'append-order',[arr,other]),js.append_order(ref,refOther));const first=a.get(arr,0);assert(a.keyEqual(first,other));a.release(first);const saved=a.get(arr,1);assert.equal(a.readNumber(saved),ref[1]);a.release(saved);
 const zero=a.number(0),marker=a.invoke('make',[zero,null,undefined]),refMarker=js.make(0,null,undefined);
 // Avoid recursively reading the alias-containing array; pop removes its last scalar.
 assert.equal(invoke(a,'pop-extra',[arr,marker]),js.pop_extra(ref,refMarker));assert.deepEqual(read(a,marker),refMarker);
 const n=a.number(0);assert.deepEqual(invoke(a,'slice-extra',[other,n,undefined,marker]),js.slice_extra(refOther,0,undefined,refMarker));assert.deepEqual(read(a,marker),refMarker);
 for(const receiver of[null,undefined]){assert.throws(()=>a.invoke('null-write',[receiver,marker]));assert.throws(()=>js.null_write(receiver,refMarker));assert.deepEqual(read(a,marker),refMarker);assert.equal(invoke(a,'nth-value',[n,receiver]),js.nth_value(0,receiver));assert.equal(invoke(a,'size',[receiver]),js.size(receiver));}
 for(const v of[arr,other,zero,marker,n])a.release(v);a.collect();assert.equal(a.live(),0);
});
test('exact index boundaries, absent numeric keys and primitive length semantics agree without truncating or wrapping',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('make',[true,false,undefined]),ref=js.make(true,false,undefined);
 for(const i of[Number.MIN_VALUE,-Number.MIN_VALUE,2**31,2**32-2,2**32-1,2**32,Number.MAX_VALUE,-1,.9999999999999999,1.0000000000000002,'','00','00000000000','4294967294','4294967295','99999999999999']){const key=box(a,i);assert.deepEqual(invoke(a,'at',[arr,key]),js.at(ref,i));assert.deepEqual(invoke(a,'nth-value',[key,arr]),js.nth_value(i,ref));a.release(key);}
 for(const value of[null,undefined,false,true,0,-0,NaN,'中😀\ud800']){const v=box(a,value);assert.deepEqual(invoke(a,'size',[v]),js.size(value));a.release(v);}
 for(const key of['push','toLocaleString','constructor','__proto__','foo']){const k=a.string(key);assert.throws(()=>a.invoke('at',[arr,k]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>a.invoke('write',[arr,k,true]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(k);}
 const raw=a.array([true]);a.resize(raw,3);assert.equal(a.get(raw,1),null);assert.throws(()=>a.get(raw,3),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(raw);a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('capacity failure and original errors leave arrays unchanged, suppress later traps and unwind only owned frames',async()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});a.auto(1);const arr=a.invoke('make',[true,false,undefined]),n=a.number(2000),huge=a.number(2**32-1),ref=[true,false,undefined];
 for(const value of[n,huge])assert.throws(()=>a.invoke('truncate',[arr,value]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.deepEqual(read(a,arr),ref);assert.equal(a.stats().frameDepth,0);a.resize(arr,500);const saved=read(a,arr);assert.throws(()=>a.invoke('append',[arr,true,false]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.deepEqual(read(a,arr),saved);a.release(n);a.release(huge);a.release(arr);a.collect();assert.equal(a.live(),0);
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-truth (heap value)'),end=source.indexOf('  (defun value-data',start);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+source.slice(end),'trap-runtime.eli');
 const rt=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,injected))),target=rt.invoke('make',[true,false,undefined]),marker=rt.invoke('make',[false,null,undefined]),bad=rt.number(.5),good=rt.number(3),frame=rt.frame(1);rt.frameSet(frame,0,target);
 assert.throws(()=>rt.invoke('error-then-truth',[target,bad,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(rt.get(marker,0),false);assert.equal(rt.stats().frameDepth,1);assert.equal(rt.length(target),3);
 assert.throws(()=>rt.invoke('error-then-truth',[target,good,marker]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(rt.stats().frameDepth,1);const changed=rt.get(marker,0);assert.equal(rt.readNumber(changed),9);rt.release(changed);rt.leaveFrame(frame);for(const v of[target,marker,bad,good])rt.release(v);rt.collect();assert.equal(rt.live(),0);
});
test('Node executes the identical zero-import source-array artifact with growth, Unicode and exact cleanup',async()=>{
 const path=resolve(directory,'arrays.wasm');await writeFile(path,bytes);const child=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const x=a.number(-0),y=a.string('中😀'),arr=a.invoke('make',[x,null,y]);const first=a.get(arr,0);assert(Object.is(a.readNumber(first),-0));a.release(first);const i=a.number(9),assigned=a.invoke('write',[arr,i,y]);assert(a.keyEqual(assigned,y));a.release(assigned);assert.equal(a.length(arr),10);assert.equal(a.get(arr,5),undefined);const pop=a.invoke('remove-last',[arr]);assert.equal(a.readString(pop),'中😀');a.release(pop);const count=a.number(128),grown=a.invoke('grow-loop',[count]);assert.equal(a.length(grown),128);for(const v of[x,y,arr,i,count,grown])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('the exported array setter protects a borrowed child across allocating growth without relying on generated frames',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,65536);e['heap-auto'](heap,1);
 const arr=e['value-array-new'](heap,1);e['heap-pin'](heap,arr);const key=e['value-number'](heap,0,0x40140000);e['heap-pin'](heap,key);
 const child=e['value-number'](heap,0,0x40450000);assert.equal(e['value-array-put'](heap,arr,key,child),1);assert.equal(e['last-error'](),0);assert.equal(e['value-get'](heap,arr,5),child);e['heap-collect'](heap);assert.equal(e['value-get'](heap,arr,5),child);
 e['heap-release'](heap,arr);e['heap-release'](heap,key);e['heap-collect'](heap);assert.equal(e['heap-live'](heap),0);
});

test('bulk source-array construction keeps earlier getter operands alive and refuses foreign operands without changing the raw-array ABI',()=>{
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes);a.auto(1);const x=a.number(-0),y=a.string('中😀'),input=[x];Object.defineProperty(input,1,{get(){a.release(x);a.collect();return y;},enumerable:true});input[2]=undefined;
 const arr=a.sourceArray(input);assert.equal(arr.kind,14);assert.deepEqual(read(a,arr),[-0,'中😀',undefined]);const zero=a.number(0);assert.equal(invoke(a,'append',[arr,zero,true]),5);const copied=a.invoke('copy',[arr]);assert.deepEqual(read(a,copied),[-0,'中😀',undefined,0,true]);a.release(copied);a.release(zero);a.release(y);a.release(arr);a.collect();assert.equal(a.live(),0);
 const foreign=b.number(1);assert.throws(()=>a.sourceArray([foreign]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(foreign);b.collect();assert.equal(a.live(),0);assert.throws(()=>a.sourceArray({}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 const raw=a.array([true]);assert.equal(raw.kind,7);a.release(raw);a.collect();assert.equal(a.live(),0);
});

test('nullish nth receivers preserve empty-array length and reject unsupported object key conversions',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const length=a.string('length'),zero=a.number(0),arrayKey=a.sourceArray([length]),mapKey=a.map();
 for(const receiver of[null,undefined]){assert.equal(invoke(a,'nth-value',[length,receiver]),js.nth_value('length',receiver));assert.equal(invoke(a,'nth-value',[zero,receiver]),js.nth_value(0,receiver));for(const key of[arrayKey,mapKey])assert.throws(()=>a.invoke('nth-value',[key,receiver]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');}
 for(const x of[length,zero,arrayKey,mapKey])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
