import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
let b,rt,p,bytes,directory,js;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-js-cons-'));b=await buildBackends({outputRoot:directory});rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');p=b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-js-cons.eli','utf8'),'js-cons.eli');js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(runtime=rt){if(runtime!==rt)return Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));if(!bytes){const saved=JSON.stringify(p);bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.equal(JSON.stringify(p),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);}return bytes;}
function instance(options,runtime=rt){const a=instantiateManagedRuntime(artifact(runtime),options);a.auto(1);return a;}
function read(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(read(a,child));}finally{a.release(child);}}return out;}return value;}
function finish(a,values=[]){values.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function box(a,value){if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);if(Array.isArray(value)){const children=value.map(v=>box(a,v));try{return a.sourceArray(children);}finally{children.forEach(v=>a.release(v));}}return value;}
test('Given explicit host prepend when its nullish tail is normalized then js-cons emits zero-import WASM and preserves identity',()=>{
 const a=instance(),head=a.sourceObject({x:true}),tail=a.sourceArray([false,undefined]),out=a.invoke('prepend',[head,tail]),first=a.get(out,0);assert(a.keyEqual(first,head));assert.equal(a.keyEqual(out,tail),false);assert.equal(a.length(out),3);assert.equal(a.get(out,1),false);assert.equal(a.get(out,2),undefined);assert.equal(a.length(tail),2);a.release(out);a.release(first);
 for(const tail of[null,undefined]){const result=a.invoke('prepend',[head,tail]),child=a.get(result,0);assert.equal(a.length(result),1);assert(a.keyEqual(child,head));a.release(result);a.release(child);const raw=a.invoke('raw-nullish',[tail]);assert.equal(a.readString(raw),'TypeError');a.release(raw);}
 finish(a,[head,tail]);
});
test('Given UTF16 strings sparse arrays and invalid tails when prepending then existing JavaScript values and own slots are retained',()=>{
 const a=instance();for(const tail of['','中😀\ud800',[],[0,-0,NaN,undefined],false,1]){const input=box(a,tail),out=a.invoke('safe',[true,input]);assert.equal(a.readString(out),js.safe(true,tail));a.release(input);a.release(out);}
 const tail=a.sourceArray([]);a.resize(tail,3);const out=a.invoke('prepend',[undefined,tail]);assert.deepEqual(read(a,out),[undefined,undefined,undefined,undefined]);for(let i=0;i<4;i++){const index=a.number(i);assert.equal(a.invoke('own',[out,index]),true);a.release(index);}finish(a,[tail,out]);
});
test('Given throwing operands or custom iterators when js-cons runs then argument order cached next and abrupt-step behavior match JS',()=>{
 const a=instance();for(const name of['effects','protocol'])for(let mode=0;mode<8;mode++){const input=a.number(mode),out=a.invoke(name,[input]);assert.equal(a.readString(out),js[name](mode),name+'/'+mode);a.release(input);a.release(out);}finish(a);
});
test('Given frozen inherited indices when constructing a result then own data slots shadow them without changing tail Get',()=>{
 const a=instance(),out=a.invoke('frozen-prototype'),node=spawnSync('node',['--input-type=module','-e','import vm from "node:vm";console.log(vm.runInNewContext(`const cons=(head,tail)=>[head,...(tail??[])],tail=[false];tail.length=2;Array.prototype[1]=9;Object.freeze(Array.prototype);const result=cons(true,tail);JSON.stringify([result,Object.keys(result),Object.hasOwn(result,"1")])`));'],{encoding:'utf8',timeout:10000});assert.equal(node.status,0,node.stderr);assert.equal(a.readString(out),node.stdout.trim());finish(a,[out]);
});
test('Given malformed arity when the existing intrinsic is compiled then source and IR refuse dropped argument effects',()=>{
 for(const source of['(js-cons)','(js-cons 1)','(js-cons 1 2 3)'])assert.throws(()=>b.compiler.compile_string(source,'arity.eli'));
 const source=b.compiler.compile_ir_string('(defun run () (js-cons 1 nil))','arity.eli'),node=source.body[0].children.at(-1);assert.equal(node.value,'js-cons');node.children.push(node.children[0]);assert.throws(()=>b.managed.emit_managed_wasm(source,rt),error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
});

test('Given a changed canonical Array iterator and a shadowed Array name when the tail is nullish then its real empty array is iterated',()=>{
 for(const mode of[0,1]){const a=instance(),input=a.number(mode),saved=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);let expected;
  try{expected=js.nullish_protocol(mode);}finally{Object.defineProperty(Array.prototype,Symbol.iterator,saved);}
  const out=a.invoke('nullish-protocol',[input]);assert.equal(a.readString(out),expected);finish(a,[input,out]);
 }
});


test('Given deterministic random binary64 heads and source arrays when prepended then neither IEEE values nor input arrays change',()=>{
 const a=instance(),pool=[undefined,null,true,false,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'中😀','\ud800'];let seed=0x941725ba;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let round=0;round<128;round++){const head=pool[next()%pool.length],tail=Array.from({length:next()%24},()=>pool[next()%pool.length]),h=box(a,head),t=box(a,tail),out=a.invoke('prepend',[h,t]);assert.deepEqual(read(a,out),[head,...tail]);assert.deepEqual(read(a,t),tail);a.release(h);a.release(t);a.release(out);}finish(a);
});

test('Given raw invalid inputs and each early capacity failure when normalizing a nullish tail then caller roots survive and recovery is exact',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](64,16384,131072),call=(name,...args)=>{const value=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;};
 const head=call('value-number',0,2147483648),unsealed=call('value-string',1),caller=call('frame-new',2);call('frame-set',caller,0,head);call('frame-set',caller,1,unsealed);call('heap-auto',1);
 for(const [a,b,code]of[[0xffffffff,0,1],[head,0xffffffff,1],[caller,0,3],[head,caller,3],[unsealed,0,6],[head,unsealed,6]]){assert.equal(e['value-source-js-cons'](h,a,b),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',caller,0),head);}
 const padding=[];while(call('heap-live')<64){const value=call('value-number',0,0);call('heap-pin',value);padding.push(value);}
 for(let available=0;available<5;available++){assert.equal(e['value-source-js-cons'](h,head,0),0);assert.equal(e['last-error'](),2);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',caller,0),head);call('heap-collect');call('heap-release',padding.pop());call('heap-collect');}
 padding.forEach(value=>call('heap-release',value));call('heap-collect');const result=call('value-source-js-cons',head,0);call('heap-pin',result);assert.equal(call('value-length',result),1);assert.equal(call('value-get',result,0),head);const pointer=call('value-data',head,4);assert(Object.is(new DataView(e.memory.buffer).getFloat64(pointer,true),-0));call('heap-release',result);call('frame-pop',caller);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('Given a real reused-prefix append trap when js-cons runs then source catches cannot swallow it and private frames unwind after argument effects',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun heap-text-array-append '),end=source.indexOf('  (defun ',start+10);assert(start>=0&&end>start);
 const injected=b.compiler.compile_ir_string(source.slice(0,start)+'  (defun heap-text-array-append (heap array child) (load-u32 4294967295))\n'+source.slice(end),'js-cons-trap.eli'),a=instance(undefined,injected),trace=a.sourceArray([]),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 assert.throws(()=>a.invoke('trap-effects',[trace]),WebAssembly.RuntimeError);assert.deepEqual(read(a,trace),['head','tail']);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));const recovered=a.invoke('recover');assert.equal(a.readNumber(recovered),7);a.leaveFrame(caller);finish(a,[trace,held,recovered]);
});

test('Given the same zero-import prepend bytes when Node executes them then nullish UTF16 source errors and dense result slots match its JS oracle',async()=>{
 const path=resolve(directory,'js-cons.wasm');await writeFile(path,artifact());const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);',read.toString(),box.toString(),finish.toString(),"for(const tail of[null,undefined,'中😀\\ud800',[],[0,-0,NaN,undefined],false,1]){const input=box(a,tail);if(tail===false||tail===1){const out=a.invoke('safe',[true,input]);assert.equal(a.readString(out),'TypeError');a.release(out);}else{const out=a.invoke('prepend',[true,input]);assert.deepEqual(read(a,out),[true,...(tail??[])]);a.release(out);}a.release(input);}finish(a);"].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,path],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given a true native prepend library when the same operands and iterator protocols execute then it retains the original JS contract',async()=>{
 const lowered=b.managed.lower_managed_program(p,rt),path=resolve(directory,'js-cons.dylib');await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));const a=await instantiateNativeManagedRuntime(path,lowered);a.auto(1);
 try{
  for(const tail of[null,undefined,'中😀\ud800',[],[0,-0,NaN,undefined],false,1]){const input=box(a,tail),out=a.invoke('safe',[true,input]);assert.equal(a.readString(out),js.safe(true,tail));a.release(input);a.release(out);}
  for(const name of['effects','protocol'])for(let mode=0;mode<8;mode++){const input=a.number(mode),out=a.invoke(name,[input]);assert.equal(a.readString(out),js[name](mode));a.release(input);a.release(out);}
  for(const mode of[0,1]){const input=a.number(mode),saved=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);let expected;try{expected=js.nullish_protocol(mode);}finally{Object.defineProperty(Array.prototype,Symbol.iterator,saved);}const out=a.invoke('nullish-protocol',[input]);assert.equal(a.readString(out),expected);a.release(input);a.release(out);}
 }finally{try{finish(a);}finally{a.close();}}
},30000);
