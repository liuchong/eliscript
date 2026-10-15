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
 for(const expr of['(js-call x :flatMap (lambda (a) a))','(js-call x k)','(new globalThis.Object)','(js-nth :length x)']){const ir=backend.compiler.compile_ir_string(`(defun f (x k) (if false ${expr} x)) (export f)`,'unsupported-container.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='unsupported-container.eli');}
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
 for(const key of['push','toLocaleString','constructor','__proto__']){const k=a.string(key);assert.throws(()=>a.invoke('at',[arr,k]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
  if(key==='__proto__')assert.throws(()=>a.invoke('write',[arr,k,true]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');else{assert.equal(invoke(a,'write',[arr,k,true]),true);assert.equal(invoke(a,'at',[arr,k]),true);}a.release(k);}
 const absent=a.string('foo');assert.equal(invoke(a,'at',[arr,absent]),js.at(ref,'foo'));assert.equal(invoke(a,'write',[arr,absent,true]),js.write(ref,'foo',true));a.release(absent);
 const raw=a.array([true]);a.resize(raw,3);assert.equal(a.get(raw,1),null);assert.throws(()=>a.get(raw,3),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(raw);a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('capacity failure and original errors leave arrays unchanged, suppress later traps and unwind only owned frames',async()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});a.auto(1);const arr=a.invoke('make',[true,false,undefined]),n=a.number(2000),huge=a.number(2**32-1),ref=[true,false,undefined];
 for(const value of[n,huge])assert.throws(()=>a.invoke('truncate',[arr,value]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.deepEqual(read(a,arr),ref);assert.equal(a.stats().frameDepth,0);a.resize(arr,500);const saved=read(a,arr);assert.throws(()=>a.invoke('append',[arr,true,false]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.deepEqual(read(a,arr),saved);a.release(n);a.release(huge);a.release(arr);a.collect();assert.equal(a.live(),0);
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-truth (heap value)'),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+source.slice(end),'trap-runtime.eli');
 const rt=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,injected))),target=rt.invoke('make',[true,false,undefined]),marker=rt.invoke('make',[false,null,undefined]),bad=rt.number(.5),good=rt.number(3),frame=rt.frame(1);rt.frameSet(frame,0,target);
 assert.throws(()=>rt.invoke('error-then-truth',[target,bad,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(rt.get(marker,0),false);assert.equal(rt.stats().frameDepth,1);assert.equal(rt.length(target),3);
 assert.throws(()=>rt.invoke('error-then-truth',[target,good,marker]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(rt.stats().frameDepth,1);const changed=rt.get(marker,0);assert.equal(rt.readNumber(changed),9);rt.release(changed);rt.leaveFrame(frame);for(const v of[target,marker,bad,good])rt.release(v);rt.collect();assert.equal(rt.live(),0);
});
test('Node executes the identical zero-import source-array artifact with growth, Unicode and exact cleanup',async()=>{
 const path=resolve(directory,'arrays.wasm');await writeFile(path,bytes);const child=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const x=a.number(-0),y=a.string('中😀'),arr=a.invoke('make',[x,null,y]);const first=a.get(arr,0);assert(Object.is(a.readNumber(first),-0));a.release(first);const i=a.number(9),assigned=a.invoke('write',[arr,i,y]);assert(a.keyEqual(assigned,y));a.release(assigned);assert.equal(a.length(arr),10);assert.equal(a.get(arr,5),undefined);const pop=a.invoke('remove-last',[arr]);assert.equal(a.readString(pop),'中😀');a.release(pop);const count=a.number(128),grown=a.invoke('grow-loop',[count]);assert.equal(a.length(grown),128);const key=a.string('01'),set=a.invoke('write',[grown,key,y]);a.release(set);assert.equal(a.invoke('has',[grown,key]),true);const names=a.invoke('keys',[grown]),last=a.get(names,128);assert.equal(a.readString(last),'01');a.release(last);const copied=a.invoke('copy',[grown]);assert.equal(a.invoke('has',[copied,key]),false);for(const v of[x,y,arr,i,count,grown,key,names,copied])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
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

const keysOf=(a,value)=>invoke(a,'keys',[value]);
const hasOwn=(a,value,key)=>{const k=box(a,key);try{return invoke(a,'has',[value,k]);}finally{a.release(k);}};
test('sparse array presence distinguishes holes from undefined and survives slices, truncation, regrowth and pop',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),ref=[];
 const resize=n=>{const v=a.number(n);try{invoke(a,'truncate',[arr,v]);js.truncate(ref,n);}finally{a.release(v);}};
 resize(6);const key=a.number(3);invoke(a,'write',[arr,key,undefined]);js.write(ref,3,undefined);a.release(key);
 assert.deepEqual(keysOf(a,arr),Object.keys(ref));
 for(let i=0;i<8;i++)assert.equal(hasOwn(a,arr,i),Object.hasOwn(ref,i));
 assert.equal(hasOwn(a,arr,'length'),true);
 const copy=a.invoke('copy',[arr]);assert.deepEqual(keysOf(a,copy),Object.keys(ref.slice()));assert.equal(a.length(copy),6);a.release(copy);
 const start=a.number(2),end=a.number(6),slice=a.invoke('interval',[arr,start,end]);assert.deepEqual(keysOf(a,slice),Object.keys(ref.slice(2,6)));a.release(start);a.release(end);a.release(slice);
 assert.equal(invoke(a,'remove-last',[arr]),ref.pop());resize(2);resize(6);assert.deepEqual(keysOf(a,arr),Object.keys(ref));
 const again=a.number(3);invoke(a,'write',[arr,again,undefined]);ref[3]=undefined;a.release(again);assert.deepEqual(keysOf(a,arr),Object.keys(ref));
 a.release(arr);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('array named properties use exact primitive property keys, preserve insertion order and remain separate from length',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),ref=[];
 const pairs=[['z','中😀'],['01',undefined],[-1,true],[1.5,false],[NaN,'nan'],[Infinity,'inf'],[null,'nil'],[false,'bool'],[undefined,'missing'],['4294967295','named'],[2,'two'],[-0,'zero'],['a','last'],['z','updated']];
 for(const[k,v]of pairs){const key=box(a,k),value=box(a,v);assert.deepEqual(invoke(a,'write',[arr,key,value]),js.write(ref,k,v));assert.deepEqual(invoke(a,'at',[arr,key]),js.at(ref,k));assert.equal(hasOwn(a,arr,k),Object.hasOwn(ref,k));assert.deepEqual(keysOf(a,arr),Object.keys(ref));a.release(key);a.release(value);a.collect();}
 assert.equal(a.length(arr),ref.length);const n=a.number(1);invoke(a,'truncate',[arr,n]);ref.length=1;a.release(n);assert.deepEqual(keysOf(a,arr),Object.keys(ref));
 const sparseCopy=a.invoke('copy',[arr]);assert.deepEqual(keysOf(a,sparseCopy),Object.keys(ref.slice()));a.release(sparseCopy);
 for(const k of['not-present','00',Number.MAX_VALUE,Number.MIN_VALUE]){const key=box(a,k);assert.deepEqual(invoke(a,'at',[arr,key]),js.at(ref,k));a.release(key);}
 const grow=a.number(128);invoke(a,'truncate',[arr,grow]);ref.length=128;a.release(grow);assert.deepEqual(keysOf(a,arr),Object.keys(ref));a.collect();assert.deepEqual(keysOf(a,arr),Object.keys(ref));
 a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('array object-assoc copies enumerable present slots and names into an ordinary object in JS order',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),ref=[];
 for(const[k,v]of[[4,undefined],['name','😀'],[1,true]]){const key=box(a,k),value=box(a,v);invoke(a,'write',[arr,key,value]);ref[k]=v;a.release(key);a.release(value);}
 const key=a.string('__proto__'),value=a.number(-0),copy=a.invoke('assoc',[arr,key,value]),expected=js.assoc(ref,'__proto__',-0);
 assert.equal(copy.kind,13);assert.deepEqual(keysOf(a,copy),Object.keys(expected));
 for(const k of Object.keys(expected)){const name=a.string(k);assert.deepEqual(invoke(a,'at',[copy,name]),expected[k]);a.release(name);}
 assert.deepEqual(keysOf(a,arr),Object.keys(ref));assert.equal(hasOwn(a,copy,'length'),false);a.release(copy);a.release(key);a.release(value);a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('primitive array length conversion matches exact JS values and rejects invalid lengths without mutation',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('make',[true,false,undefined]),ref=[true,false,undefined];
 for(const n of['6','0x4',true,false,null,undefined,'1.5','4294967296',-1,NaN,Infinity]){const v=box(a,n);let error;try{js.truncate(ref,n);}catch(e){error=e;}
  if(error)assert.throws(()=>a.invoke('truncate',[arr,v]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');else assert.deepEqual(invoke(a,'truncate',[arr,v]),n);
  assert.equal(a.length(arr),ref.length);assert.deepEqual(keysOf(a,arr),Object.keys(ref));a.release(v);
 }
 a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('shadowed array methods evaluate arguments before noncallable failure and capture the original builtin before mutation',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const method of['push','pop','slice']){const arr=a.invoke('empty',[]),marker=a.invoke('make',[false,null,undefined]),ref=[],refMarker=[false,null,undefined],key=a.string(method);invoke(a,'write',[arr,key,false]);ref[method]=false;
  const entry=method==='push'?'append':method;assert.equal(invoke(a,'at',[arr,key]),false);assert.throws(()=>js[entry+'_shadow'](ref,refMarker));assert.throws(()=>a.invoke(entry+'-shadow',[arr,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.deepEqual(read(a,marker),refMarker);assert.equal(a.stats().frameDepth,0);for(const x of[arr,marker,key])a.release(x);a.collect();assert.equal(a.live(),0);
 }
 const arr=a.invoke('empty',[]),ref=[];assert.equal(invoke(a,'append-replace',[arr]),js.append_replace(ref));assert.deepEqual(read(a,arr),Array.from(ref));assert.deepEqual(keysOf(a,arr),Object.keys(ref));a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('bulk source-array bridging preserves own holes, named values and getter roots without invoking an overridden iterator',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const input=[];input.length=5;const x=a.string('x'),y=a.string('中😀');input[1]=x;
 Object.defineProperty(input,3,{get(){a.release(x);a.collect();return y;},enumerable:true});input.label=y;Object.defineProperty(input,'__proto__',{value:false,writable:true,enumerable:true});input[Symbol.iterator]=()=>{throw Error('iterator must not control a source array snapshot');};
 const arr=a.sourceArray(input);assert.deepEqual(keysOf(a,arr),Object.keys(input));assert.equal(a.length(arr),5);assert.equal(hasOwn(a,arr,0),false);assert.equal(hasOwn(a,arr,1),true);const first=a.get(arr,1);assert.equal(a.readString(first),'x');a.release(first);const key=a.string('label');assert.equal(invoke(a,'at',[arr,key]),'中😀');a.release(key);a.release(y);a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('random sparse and named array edits preserve exact own keys, independent slices and shallow objects through GC',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),ref=[];let seed=0x71b32a9;
 const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},keys=['a','z','00','-0','4294967295',null,false,undefined,NaN,-1,.5],values=[undefined,null,true,false,-0,NaN,Infinity,'中😀\ud800'];
 for(let i=0;i<512;i++){
  const op=next()%5;
  if(op<2){const key=op===0?next()%80:keys[next()%keys.length],value=values[next()%values.length],k=box(a,key),v=box(a,value);assert.deepEqual(invoke(a,'write',[arr,k,v]),js.write(ref,key,value));a.release(k);a.release(v);}
  else if(op===2){const n=next()%96,v=a.number(n);invoke(a,'truncate',[arr,v]);ref.length=n;a.release(v);}
  else if(op===3)assert.deepEqual(invoke(a,'remove-last',[arr]),ref.pop());
  else {const start=(next()%160)-80,end=(next()%160)-80,s=a.number(start),e=a.number(end),copy=a.invoke('interval',[arr,s,e]),expected=ref.slice(start,end);assert.deepEqual(keysOf(a,copy),Object.keys(expected));assert.deepEqual(read(a,copy),Array.from(expected));a.release(copy);a.release(s);a.release(e);}
  assert.deepEqual(keysOf(a,arr),Object.keys(ref));assert.deepEqual(read(a,arr),Array.from(ref));for(const k of[0,1,79,'length','00','a','not-present'])assert.equal(hasOwn(a,arr,k),Object.hasOwn(ref,k));a.collect();assert.equal(a.stats().frameDepth,0);
 }
 a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('named array references survive resize and cycles while holes never retain an unrelated heap slot',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.invoke('empty',[]),key=a.string('saved'),value=a.string('retained');invoke(a,'write',[arr,key,value]);a.release(value);const n=a.number(256);invoke(a,'truncate',[arr,n]);a.release(n);a.collect();assert.equal(invoke(a,'at',[arr,key]),'retained');
 const self=a.string('self');const returned=a.invoke('write',[arr,self,arr]);assert(a.keyEqual(returned,arr));a.release(returned);a.release(self);a.release(key);a.release(arr);a.collect();assert.equal(a.live(),0);
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](32,4096,16384),sparse=e['value-array-new'](h,16);e['heap-pin'](h,sparse);
 for(let i=0;i<5;i++)e['value-number'](h,0,0x3ff00000+i);assert.equal(e['heap-live'](h),6);e['heap-collect'](h);assert.equal(e['heap-live'](h),1);assert.equal(e['value-get'](h,sparse,0),3);assert.equal(e['heap-pin'](h,4),0);assert.equal(e['last-error'](),1);e['heap-release'](h,sparse);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
});
test('array named-property capacity failure is atomic and raw allocating setters protect all borrowed operands',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});const arr=a.sourceArray(new Array(550)),key=a.string('new'),value=a.number(7);
 assert.throws(()=>a.invoke('write',[arr,key,value]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(invoke(a,'has',[arr,key]),false);assert.equal(a.length(arr),550);assert.equal(a.get(arr,0),undefined);assert.equal(a.stats().frameDepth,0);for(const x of[arr,key,value])a.release(x);a.collect();assert.equal(a.live(),0);
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](64,4096,65536),target=e['value-array-new'](h,0),name=e['value-string'](h,1);e['value-unit-set'](h,name,0,120);e['value-seal'](h,name);const child=e['value-number'](h,0,0x40450000);e['heap-auto'](h,1);
 assert.equal(e['value-array-put'](h,target,name,child),1);assert.equal(e['last-error'](),0);e['heap-pin'](h,target);e['heap-pin'](h,name);e['heap-collect'](h);assert.equal(e['value-array-get'](h,target,name,0),child);for(const v of[target,name])e['heap-release'](h,v);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
});
test('source-array slice converts primitive positions before exact clamping and preserves holes',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const arr=a.sourceArray([true,,undefined,false,,true]),ref=[true,,undefined,false,,true];
 for(const[start,end]of[['1','5'],['0x2','Infinity'],['-2',undefined],['not-number','4'],[true,false],[null,'3.5'],['0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38',undefined]]){
  const s=box(a,start),e=box(a,end),copy=a.invoke('interval',[arr,s,e]),expected=ref.slice(start,end);assert.deepEqual(keysOf(a,copy),Object.keys(expected));assert.deepEqual(read(a,copy),Array.from(expected));a.release(copy);a.release(s);a.release(e);
 }
 a.release(arr);a.collect();assert.equal(a.live(),0);
});
test('indexed source-array reads and existing string-key presence queries allocate no frames, text or collections',()=>{
 const a=instantiateManagedRuntime(bytes);const arr=a.sourceArray([true,,undefined]),number=a.number(0),text=a.string('0'),missing=a.string('absent'),length=a.string('length');a.auto(1);const before=a.stats();
 for(let i=0;i<128;i++){assert.equal(invoke(a,'at',[arr,number]),true);assert.equal(invoke(a,'at',[arr,text]),true);assert.equal(invoke(a,'at',[arr,missing]),undefined);assert.equal(invoke(a,'has',[arr,number]),true);assert.equal(invoke(a,'has',[arr,length]),true);assert.equal(invoke(a,'has',[arr,missing]),false);}
 const after=a.stats();assert.equal(after.usedBytes,before.usedBytes);assert.equal(after.collections,before.collections);assert.equal(after.frameDepth,0);for(const v of[arr,number,text,missing,length])a.release(v);a.collect();assert.equal(a.live(),0);
});
test('real array lookup and argument traps retain caller frames and precede shadowed-method callability failure',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8');
 for(const[name,parameters]of[['value-array-method-check','heap value method'],['value-property-put','heap object key child']]){
  const start=source.indexOf('  (defun '+name+' '),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
  const injected=backend.compiler.compile_ir_string(source.slice(0,start)+`  (defun ${name} (${parameters}) (load-u32 4294967295))\n`+source.slice(end),'array-trap-runtime.eli');
  const a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,injected)));a.auto(1);const input=[];input.push=false;const target=a.sourceArray(input),marker=a.sourceArray([false]),frame=a.frame(1);a.frameSet(frame,0,target);
  assert.throws(()=>a.invoke('append-shadow',[target,marker]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.get(marker,0),false);a.leaveFrame(frame);a.release(target);a.release(marker);a.collect();assert.equal(a.live(),0);
 }
});
