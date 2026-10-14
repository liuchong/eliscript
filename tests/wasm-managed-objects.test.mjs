import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtimeProgram,program,bytes,js;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-objects-'));backend=await buildBackends({outputRoot:directory});runtimeProgram=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-objects.eli','utf8'),'objects.eli');bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram));assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
function read(a,x){if(!x||typeof x!=='object')return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);if(x.kind===14)return Array.from({length:a.length(x)},(_,i)=>{const v=a.get(x,i);try{return read(a,v);}finally{a.release(v);}});throw Error('opaque value requires explicit ownership');}
function invoke(a,name,args){const v=a.invoke(name,args);try{return read(a,v);}finally{a.release(v);}}
function field(a,o,k){const key=box(a,k);try{return invoke(a,'read-value',[o,key]);}finally{a.release(key);}}
function inspect(a,o){return Object.fromEntries(invoke(a,'keys',[o]).map(k=>[k,field(a,o,k)]));}
test('named source objects preserve own values, missing/nullish defaults, duplicate keys, Unicode and identity through GC',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);for(const value of[null,false,true,undefined,0,-0,NaN,Infinity,Number.MIN_VALUE,'','中😀\ud800']){const x=box(a,value),o=a.invoke('make',[x,false]),ref=js.make(value,false);assert.equal(o.kind,13);assert.deepEqual(inspect(a,o),ref);
  for(const k of['x','y','missing','','absent','中😀\ud800']){const key=a.string(k),fallback=a.number(9);assert.deepEqual(invoke(a,'read-value',[o,key]),js.read_value(ref,k));assert.deepEqual(invoke(a,'nth-value',[key,o]),js.nth_value(k,ref));assert.deepEqual(invoke(a,'default-value',[o,key,fallback]),js.default_value(ref,k,9));assert.equal(invoke(a,'has',[o,key]),js.has(ref,k));assert.equal(invoke(a,'default-order',[o,key]),js.default_order(ref,k));a.release(key);a.release(fallback);}
  const duplicate=a.invoke('duplicate',[x,true]);assert.deepEqual(inspect(a,duplicate),js.duplicate(value,true));a.release(duplicate);a.release(x);a.release(o);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});
test('own property order is numeric-first and stable for strings, updates and computed dangerous names',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const o=a.invoke('empty',[]),ref=js.empty();const keys=['z','10','2','01','0','4294967294','4294967295','a','constructor','toString','hasOwnProperty','中😀','',1,-0];
 for(const k of keys){const key=box(a,k),value=a.number(keys.indexOf(k));assert.equal(invoke(a,'write',[o,key,value]),js.write(ref,k,keys.indexOf(k)));assert.deepEqual(invoke(a,'keys',[o]),js.keys(ref));assert.deepEqual(inspect(a,o),ref);a.release(key);a.release(value);}
 const n=a.number(7),data=a.invoke('proto-data',[n]);assert.deepEqual(inspect(a,data),js.proto_data(7));const proto=a.invoke('proto',[data]);assert.equal(a.readNumber(proto),7);a.release(proto);a.release(data);a.release(n);a.release(o);a.collect();assert.equal(a.live(),0);
});
test('object assoc copies before key and RHS effects, defines own proto keys and returns independent shallow objects',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const zero=a.number(0),old=a.string('old'),o=a.invoke('computed',[old,zero]),ref=js.computed('old',0),key=a.string('new');
 const copy=a.invoke('assoc-order',[o,key]),expected=js.assoc_order(ref,'new');assert.deepEqual(inspect(a,copy),expected);assert.deepEqual(inspect(a,o),ref);assert(!a.keyEqual(copy,o));
 const pkey=a.string('__proto__'),p=a.invoke('assoc',[o,pkey,true]);assert.deepEqual(inspect(a,p),js.assoc(ref,'__proto__',true));assert.equal(invoke(a,'has',[p,pkey]),true);
 const returned=a.invoke('write-order',[o,p]);assert(a.keyEqual(returned,p));a.release(returned);const saved=a.string('saved'),alias=a.invoke('read-value',[o,saved]);assert(a.keyEqual(alias,p));a.release(alias);
 for(const v of[zero,old,o,key,copy,pkey,p,saved])a.release(v);a.collect();assert.equal(a.live(),0);
});
test('source object prototype inheritance, null prototypes, own shadows and cycle rejection retain actual semantics',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const x=a.number(-0),parent=a.invoke('make',[x,true]),child=a.invoke('inherit',[parent,false]);assert(Object.is(field(a,child,'x'),-0));assert.equal(field(a,child,'own'),false);const key=a.string('x');assert.equal(invoke(a,'has',[child,key]),false);assert.deepEqual(invoke(a,'keys',[child]),['own']);
 const proto=a.invoke('proto',[child]);assert(a.keyEqual(proto,parent));a.release(proto);assert.throws(()=>a.invoke('set-proto',[parent,child]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert(Object.is(field(a,child,'x'),-0));
 const nil=a.invoke('null-proto',[]),nilRef=js.null_proto();for(const k of['constructor','toString','__proto__'])assert.deepEqual(field(a,nil,k),js.read_value(nilRef,k));const set=a.invoke('set-proto',[nil,parent]);assert(a.keyEqual(set,parent));a.release(set);const ownProto=a.invoke('proto',[nil]);assert(a.keyEqual(ownProto,parent));a.release(ownProto);const protoKey=a.string('__proto__');assert.equal(invoke(a,'has',[nil,protoKey]),true);
 for(const v of[x,parent,child,key,nil,protoKey])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('objects retain cycles and array/table children, grow under GC and release all property edges',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);const text=a.string('x'),array=a.sourceArray([text]),map=a.map();a.tableSet(map,true,text);const cycle=a.invoke('self-cycle',[array]),tableKey=a.string('table'),stored=a.invoke('write',[cycle,tableKey,map]);a.release(stored);a.release(map);const selfKey=a.string('self'),self=a.invoke('read-value',[cycle,selfKey]);assert(a.keyEqual(cycle,self));a.release(self);a.release(text);a.release(array);a.release(selfKey);a.collect();assert.deepEqual(field(a,cycle,'v'),['x']);const table=a.invoke('read-value',[cycle,tableKey]),value=a.tableGet(table,true);assert.equal(a.readString(value),'x');a.release(value);a.release(table);a.release(tableKey);a.release(cycle);a.collect();assert.equal(a.live(),0);
 const n=a.number(128),o=a.invoke('grow-loop',[n]);assert.deepEqual(invoke(a,'keys',[o]),Array.from({length:128},(_,i)=>String(i)));for(let i=0;i<128;i++)assert.equal(field(a,o,i),i);assert(a.stats().collections>128);a.release(n);a.release(o);a.collect();assert.equal(a.live(),0);
});

test('property-key conversions preserve exact signed integer and nonfinite names; object length is an ordinary property read',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const o=a.invoke('empty',[]),ref={};
 for(const key of[null,false,true,undefined,0,-0,1,-1,2**31,2**32-1,-(2**32-1),NaN,Infinity,-Infinity,'0.5','constructor','valueOf','__proto__\0','中😀\ud800']){const k=box(a,key),v=a.number(7);assert.equal(invoke(a,'write',[o,k,v]),js.write(ref,key,7));assert.deepEqual(inspect(a,o),ref);assert.equal(invoke(a,'has',[o,k]),js.has(ref,key));a.release(k);a.release(v);}
 const length=a.string('length'),v=a.string('len');invoke(a,'write',[o,length,v]);assert.equal(invoke(a,'size',[o]),js.size({...ref,length:'len'}));const inherited=a.invoke('inherit',[o,false]);assert.equal(invoke(a,'size',[inherited]),'len');a.release(inherited);
 for(const key of[.5,Number.MIN_VALUE,2**32,Number.MAX_VALUE]){const k=a.number(key);assert.throws(()=>a.invoke('write',[o,k,true]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(k);}
 for(const x of[o,length,v])a.release(x);a.collect();assert.equal(a.live(),0);
});

test('radix key order and shallow assoc agree with deterministic random JS updates under collection',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);let state=0x23417ad;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};const o=a.invoke('empty',[]),ref={};
 const values=[null,false,true,undefined,NaN,-0,Infinity,-Infinity,Number.MIN_VALUE,'中😀\ud800'];
 for(let i=0;i<1024;i++){const name=next()%2?String(next()%256):'k'+next()%128,key=a.string(name),value=values[next()%values.length],v=box(a,value);assert.deepEqual(invoke(a,'write',[o,key,v]),js.write(ref,name,value));assert.deepEqual(invoke(a,'keys',[o]),js.keys(ref));assert.deepEqual(inspect(a,o),ref);
  if(i%16===0){const copy=a.invoke('assoc',[o,key,false]);assert.deepEqual(inspect(a,copy),js.assoc(ref,name,false));a.release(copy);}a.release(key);a.release(v);a.collect();assert.equal(a.stats().frameDepth,0);
 }
 a.release(o);a.collect();assert.equal(a.live(),0);
});
test('object failures and real traps preserve original codes, caller frames, input properties and private-root cleanup',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun heap-object-key-index '),end=source.indexOf('  (defun heap-object-sort-keys ',start);assert(start>=0&&end>start);
 const injected=backend.compiler.compile_ir_string(source.slice(0,start)+'  (defun heap-object-key-index (heap key) (load-u32 4294967295))\n'+source.slice(end),'trap-runtime.eli');const a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,injected)));a.auto(1);
 const o=a.invoke('make',[true,false]),bad=a.number(.5),good=a.string('x'),frame=a.frame(1);a.frameSet(frame,0,o);
 assert.throws(()=>a.invoke('fault',[o,bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);
 assert.throws(()=>a.invoke('fault',[o,good]),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.throws(()=>a.objectKeys(o),e=>e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(field(a,o,'x'),true);assert.equal(field(a,o,'y'),false);
 const retained=a.frameGet(frame,0);assert(a.keyEqual(retained,o));a.release(retained);a.leaveFrame(frame);for(const v of[o,bad,good])a.release(v);a.collect();assert.equal(a.live(),0);
 const bounded=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});bounded.auto(1);const original=bounded.invoke('empty',[]),keys=[];let failed=false;
 for(let i=0;i<128&&!failed;i++){const key=bounded.string('k'+i);try{invoke(bounded,'write',[original,key,true]);keys.push('k'+i);}catch(e){assert.equal(e.eliscriptDiagnostic?.code,'ELI-RT0002');failed=true;assert.equal(bounded.objectHas(original,key),false);}finally{bounded.release(key);}}
 assert(failed);assert.throws(()=>bounded.objectCopy(original),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(bounded.stats().frameDepth,0);for(const name of keys){const key=bounded.string(name);assert.equal(bounded.objectGet(original,key),true);bounded.release(key);}bounded.release(original);bounded.collect();assert.equal(bounded.live(),0);assert.equal(bounded.stats().frameDepth,0);
});
test('unimplemented capabilities are source-bound refusals, supported IR is immutable, and foreign or retired handles cannot cross instances',()=>{
 const before=JSON.stringify(program);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);
 for(const expression of['(new globalThis.Object)','(js-call o :hasOwnProperty k)','(object-keys)','(object-has? o)','(object-assoc o k)','(js-object :__proto__ nil :__proto__ o)']){const ir=backend.compiler.compile_ir_string(`(defun f (o k) (if false ${expression} o)) (export f)`,'unsupported-objects.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='unsupported-objects.eli');}
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),o=a.invoke('empty',[]),foreign=b.string('key');assert.throws(()=>a.invoke('write',[o,foreign,true]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(foreign);b.collect();
 for(const key of['constructor','valueOf','hasOwnProperty','__proto__']){const k=a.string(key);assert.throws(()=>a.invoke('read-value',[o,k]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(k);}const array=a.sourceArray([]),proto=a.invoke('empty',[]);assert.throws(()=>a.invoke('set-proto',[proto,array]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(array);a.release(proto);a.release(o);a.collect();assert.throws(()=>a.invoke('keys',[o]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(a.live(),0);
});
test('nullish object operators retain empty-own fallback semantics and validate keys without suppressing unsupported conversions',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const key=a.string('x'),opaque=a.sourceArray([]);
 for(const receiver of[null,undefined]){assert.deepEqual(invoke(a,'keys',[receiver]),js.keys(receiver));assert.equal(invoke(a,'has',[receiver,key]),js.has(receiver,'x'));const copy=a.invoke('assoc',[receiver,key,true]);assert.deepEqual(inspect(a,copy),js.assoc(receiver,'x',true));a.release(copy);assert.throws(()=>a.invoke('has',[receiver,opaque]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');}
 a.release(key);a.release(opaque);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('malformed named property IR is refused with its source location before child lowering',()=>{
 for(const invalid of[{kind:'object-spread',children:[]},{kind:'object-property',children:[]}]){const copy=structuredClone(program);let object;const visit=value=>{if(!value||typeof value!=='object'||object)return;if(value.kind==='object-literal'&&value.children.length)object=value;else for(const child of Object.values(value))visit(child);};visit(copy);assert(object);Object.assign(object.children[0],invalid);const before=JSON.stringify(copy);assert.throws(()=>backend.managed.emit_managed_wasm(copy,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='objects.eli');assert.equal(JSON.stringify(copy),before);}
});
test('bulk source objects protect earlier values across getters, define own proto data and reject foreign handles without leaking roots',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const first=a.string('中😀'),input=Object.create(null);input.first=first;
 Object.defineProperty(input,'second',{enumerable:true,get(){a.release(first);a.collect();return true;}});
 Object.defineProperty(input,'__proto__',{enumerable:true,value:false});const object=a.sourceObject(input);
 assert.deepEqual(inspect(a,object),{first:'中😀',second:true,['__proto__']:false});const key=a.string('first'),out=a.objectGet(object,key);assert.equal(a.readString(out),'中😀');a.release(out);assert.equal(a.objectHas(object,key),true);a.objectSet(object,key,false);assert.equal(a.objectGet(object,key),false);const copy=a.objectCopy(object),keys=a.objectKeys(copy);assert.deepEqual(read(a,keys),['first','second','__proto__']);
 for(const value of[object,key,copy,keys])a.release(value);a.collect();assert.equal(a.live(),0);
 const value=a.string('held'),bad={first:value};Object.defineProperty(bad,'second',{enumerable:true,get(){a.release(value);a.collect();throw Error('getter failed');}});assert.throws(()=>a.sourceObject(bad),/getter failed/);a.collect();assert.equal(a.live(),0);
 const bounded=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:4096});bounded.auto(1);assert.throws(()=>bounded.sourceObject(Object.fromEntries(Array.from({length:128},(_,i)=>['k'+i,true]))),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');bounded.collect();assert.equal(bounded.live(),0);assert.equal(bounded.stats().frameDepth,0);const empty=bounded.sourceObject({});bounded.release(empty);bounded.collect();assert.equal(bounded.live(),0);
 const b=instantiateManagedRuntime(bytes),foreign=b.string('foreign');assert.throws(()=>a.sourceObject({foreign}),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(foreign);b.collect();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('raw exported object constructors and setters protect borrowed prototype, receiver, key and child across allocating collection',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,65536),call=(name,...args)=>{const out=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const parent=call('value-object-new',0),key=call('value-string',1);new DataView(e.memory.buffer).setUint16(call('value-data',key,5),120,true);call('value-seal',key);const child=call('value-number',0,0x80000000);
 call('heap-auto',1);call('value-object-put',parent,key,child,2);call('heap-pin',parent);call('heap-pin',key);assert.equal(call('value-object-has',parent,key),1);const value=call('value-object-get',parent,key);assert(Object.is(new DataView(e.memory.buffer).getFloat64(call('value-data',value,4),true),-0));
 call('heap-release',parent);const inherited=call('value-object-new',parent);call('heap-pin',inherited);assert.equal(call('value-object-get',inherited,key),child);assert(call('heap-collections')>0);call('heap-release',inherited);call('heap-release',key);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});
test('Node executes identical zero-import named-object bytes, preserves order and inherited properties, and releases all roots',async()=>{
 const path=resolve(directory,'objects.wasm');await writeFile(path,bytes);const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const x=a.number(-0),o=a.invoke('make',[x,true]),child=a.invoke('inherit',[o,false]),key=a.string('x'),read=a.invoke('read-value',[child,key]);assert(Object.is(a.readNumber(read),-0));a.release(read);const has=a.invoke('has',[child,key]);assert.equal(has,false);const n=a.number(128),grown=a.invoke('grow-loop',[n]),keys=a.invoke('keys',[grown]);assert.equal(a.length(keys),128);const first=a.get(keys,0),last=a.get(keys,127);assert.equal(a.readString(first),'0');assert.equal(a.readString(last),'127');for(const v of[first,last,keys,grown,n,key,child,o,x])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
