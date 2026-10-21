import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtime,program,reference,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-array-callbacks-'));backend=await buildBackends({outputRoot:directory});
 runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=backend.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-array-callbacks.eli','utf8'),'callbacks.eli');
 reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function instance(options={}){bytes??=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return a;}
function box(a,x){if(typeof x==='number')return a.number(x);if(typeof x==='string')return a.string(x);return x;}
function read(a,x){if(x===null||typeof x==='boolean'||x===undefined)return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);assert.equal(x.kind,14);const out=[];for(let i=0;i<a.length(x);i++){const key=a.number(i);let own;try{own=a.invoke('has-index',[x,key]);}finally{a.release(key);}if(own){const v=a.get(x,i);try{out[i]=read(a,v);}finally{a.release(v);}}}out.length=a.length(x);return out;}
function invoke(a,name,args=[]){const x=a.invoke(name,args);try{return read(a,x);}finally{a.release(x);}}
function finish(a,values=[]){for(const v of values)a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function array(a,xs){const values=xs.map(x=>box(a,x));const out=a.sourceArray(values);for(const v of values)a.release(v);return out;}
const methods=[['map','map'],['filter','filter'],['for-each','forEach'],['some','some'],['every','every'],['find','find'],['find-index','findIndex'],['find-last','findLast'],['find-last-index','findLastIndex']];

test('array callbacks execute dynamic WASM functions and use JavaScript predicate truth',()=>{
 const a=instance(),f=a.invoke('identity');
 const values=[0,-0,NaN,'',null,undefined,false,Number.MIN_VALUE,'中😀',true,Infinity];const items=array(a,values);
 for(const [name,method]of methods)assert.deepEqual(invoke(a,name+'-with',[items,f]),values[method](x=>x),name);
 finish(a,[f,items]);
});

test('callback map preserves holes while filter is dense and find visits holes in both directions',()=>{
 const a=instance(),f=a.invoke('identity'),values=[];values.length=6;values[1]=false;values[3]=3;values[5]=undefined;const items=array(a,values);
 for(const [name,method]of methods)assert.deepEqual(invoke(a,name+'-with',[items,f]),values[method](x=>x),name);
 assert.deepEqual(invoke(a,'map-indices',[items]),reference.map_indices(values));finish(a,[f,items]);
});

test('all callbacks receive element index and original receiver with exact early-exit order',()=>{
 const a=instance();
 for(const [name,method]of methods){
  const values=[false,true,false],items=array(a,values),log=a.sourceArray([]),f=a.invoke('collect-arguments',[log]);
  const refLog=[];values[method]((...args)=>{refLog.push(args);return args[0];});const returned=a.invoke(name+'-with',[items,f]);a.release(returned);
  assert.equal(a.length(log),refLog.length,name);
  for(let i=0;i<refLog.length;i++){const args=a.get(log,i),v=a.get(args,0),n=a.get(args,1),receiver=a.get(args,2);assert.equal(a.length(args),3);assert.deepEqual(read(a,v),refLog[i][0]);assert.equal(a.readNumber(n),refLog[i][1]);assert(a.keyEqual(receiver,items));for(const x of[args,v,n,receiver])a.release(x);}
  for(const x of[items,log,f])a.release(x);a.collect();
 }
 finish(a);
});

test('reduce and reduceRight select the first present value and preserve exact accumulation order',()=>{
 const a=instance(),sum=a.invoke('sum-callback');
 for(const values of[[],[undefined],[1],[1,2,3],[-0],[-0,Number.MIN_VALUE,Infinity],Array(5)]){
  const items=array(a,values);
  for(const [name,method]of[['reduce','reduce'],['reduce-right','reduceRight']]){
   let expected,error=false;try{expected=values[method]((acc,x)=>acc+x);}catch{error=true;}
   if(error)assert.throws(()=>a.invoke(name+'-with',[items,sum]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');else assert.deepEqual(invoke(a,name+'-with',[items,sum]),expected);
   const initial=a.number(-0);assert.deepEqual(invoke(a,name==='reduce'?'reduce-initial':'reduce-right-initial',[items,sum,initial]),values[method]((acc,x)=>acc+x,-0));a.release(initial);
  }a.release(items);a.collect();
 }finish(a,[sum]);
});

test('reduce callbacks receive accumulator element index and receiver and run in the correct direction',()=>{
 const a=instance(),values=[1,2,3],items=array(a,values),initial=a.number(0);
 for(const [name,method]of[['reduce-initial','reduce'],['reduce-right-initial','reduceRight']]){
  const log=a.sourceArray([]),f=a.invoke('ordered-callback',[log]),refLog=[],expected=values[method]((acc,x,i,arr)=>{refLog.push([x,i,arr]);return acc*10+x;},0);
  assert.equal(invoke(a,name,[items,f,initial]),expected);assert.equal(a.length(log),3);
  for(let i=0;i<3;i++){const row=a.get(log,i),value=a.get(row,0),index=a.get(row,1),receiver=a.get(row,2);assert.equal(a.readNumber(value),refLog[i][0]);assert.equal(a.readNumber(index),refLog[i][1]);assert(a.keyEqual(receiver,items));for(const x of[row,value,index,receiver])a.release(x);}
  a.release(log);a.release(f);a.collect();
 }finish(a,[items,initial]);
});

test('callbacks snapshot length but observe deleted added and overwritten entries during iteration',()=>{
 const a=instance();
 for(const [name,method]of methods){const values=[1,2,3,4],items=array(a,values),f=a.invoke('mutation-callback',[items]),control=values.slice();
  const expected=control[method]((x,i,arr)=>{if(i===0){arr.length=1;arr.length=4;arr[2]=99;arr.push(123);}return[x,i,arr===control];});assert.deepEqual(invoke(a,name+'-with',[items,f]),expected,name);assert.deepEqual(read(a,items),control);a.release(items);a.release(f);a.collect();
 }finish(a);
});

test('receiver and method are captured before all arguments and a nullish lookup suppresses them',()=>{
 const a=instance(),items=array(a,[1,2]),other=array(a,[8]),marker=array(a,[false]);
 assert.deepEqual(invoke(a,'evaluation-order',[items,other,marker]),[1,2]);const mark=a.get(marker,0);assert.equal(a.readNumber(mark),3);a.release(mark);
 for(const receiver of[null,undefined]){a.set(marker,0,false);assert.throws(()=>a.invoke('nullish-order',[receiver,marker]));assert.equal(a.get(marker,0),false);}
 const callback=a.invoke('identity');assert.deepEqual(invoke(a,'map-replaced',[items,callback]),[1,2]);assert.throws(()=>a.invoke('map-with',[items,callback]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a,[items,other,marker,callback]);
});

test('own callable methods execute the captured function rather than the inherited builtin',()=>{
 const a=instance(),items=array(a,[1,2]),f=a.invoke('shadow-value');assert.equal(invoke(a,'map-shadow',[items,f]),15);finish(a,[items,f]);
});

test('nested callback calls and exact operand bits survive automatic collection',()=>{
 const a=instance(),values=[0,1,2,-0,Number.MIN_VALUE],items=array(a,values);assert.deepEqual(invoke(a,'map-recursive',[items]),reference.map_recursive(values));assert(a.stats().collections>10);finish(a,[items]);
});

test('invalid callbacks are checked for empty arrays and failures preserve caller roots and the first error',()=>{
 const a=instance(),empty=a.sourceArray([]),items=array(a,[1,2]),marker=array(a,[false]),frame=a.frame(1);a.frameSet(frame,0,marker);
 for(const [name]of[...methods,['reduce'],['reduce-right']])for(const bad of[null,undefined,false,true])assert.throws(()=>a.invoke(name+'-with',[empty,bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.invoke('first-error',[items,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.get(marker,0),false);assert.equal(a.stats().frameDepth,1);a.leaveFrame(frame);finish(a,[empty,items,marker]);
});


test('find methods still visit vanished indices after a callback shrinks its receiver',()=>{
 const a=instance();
 for(const [name,method]of methods){
  const values=[1,2,3,4],items=array(a,values),log=a.sourceArray([]),f=a.invoke('shrink-callback',[log]);let first=true;const expectedLog=[];
  const expected=values[method]((x,i,arr)=>{if(first){first=false;arr.length=0;}expectedLog.push([x,i]);return false;});
  assert.deepEqual(invoke(a,name+'-with',[items,f]),expected,name);assert.deepEqual(read(a,log),expectedLog,name);for(const x of[items,log,f])a.release(x);a.collect();
 }finish(a);
});

test('missing methods on primitive receivers evaluate every argument before noncallable failure',()=>{
 const a=instance(),marker=array(a,[false]);
 for(const v of[false,true,0,NaN,'text']){const receiver=box(a,v);a.set(marker,0,false);assert.throws(()=>a.invoke('nullish-order',[receiver,marker]));const changed=a.get(marker,0);assert.equal(a.readNumber(changed),1);a.release(changed);a.release(receiver);}
 const items=array(a,[]);
 // Use the same source property assignment through the existing map-shadow entry.
 assert.throws(()=>a.invoke('map-shadow',[items,false]));a.set(marker,0,false);assert.throws(()=>a.invoke('nullish-order',[items,marker]));const changed=a.get(marker,0);assert.equal(a.readNumber(changed),1);a.release(changed);finish(a,[marker,items]);
});


test('deterministic sparse argument models match independent Array controls for every callback method',()=>{
 const a=instance(),f=a.invoke('identity'),sum=a.invoke('sum-callback');let seed=0x742ae19;
 const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const pool=[undefined,null,false,true,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'','中😀'];
 for(let run=0;run<96;run++){
  const values=Array(next()%13);for(let i=0;i<values.length;i++)if(next()%3)values[i]=pool[next()%pool.length];const items=array(a,values);
  for(const[name,method]of methods)assert.deepEqual(invoke(a,name+'-with',[items,f]),values[method](x=>x),name+' model '+run);
  const initial=a.number(-0);assert.deepEqual(invoke(a,'reduce-initial',[items,sum,initial]),values.reduce((acc,x)=>acc+x,-0));assert.deepEqual(invoke(a,'reduce-right-initial',[items,sum,initial]),values.reduceRight((acc,x)=>acc+x,-0));
  for(const x of[items,initial])a.release(x);a.collect();
 }finish(a,[f,sum]);
});

test('source method lookup also captures callable properties on ordinary objects',()=>{
 const a=instance(),object=a.sourceObject({}),f=a.invoke('shadow-value');assert.equal(invoke(a,'map-shadow',[object,f]),15);finish(a,[object,f]);
});

test('actual callback capacity failure preserves earlier effects and unwinds only the entered frames',()=>{
 const a=instance({maxSlots:64,initialBytes:8192,maxBytes:32768}),items=array(a,Array(128).fill(true)),log=a.sourceArray([]),f=a.invoke('collect-arguments',[log]),keep=a.number(7),frame=a.frame(1);a.frameSet(frame,0,keep);
 assert.throws(()=>a.invoke('map-with',[items,f]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert(a.length(log)>0&&a.length(log)<128);assert.equal(a.length(items),128);assert.equal(a.stats().frameDepth,1);
 const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),7);a.release(saved);a.leaveFrame(frame);finish(a,[items,log,f,keep]);
});

test('actual callback predicate traps restore the caller frame and original failures suppress later traps',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-js-truth (heap value)'),end=source.indexOf('  (defun ',start+10);assert(start>=0&&end>start);
 const faulty=source.slice(0,start)+'  (defun value-js-truth (heap value) (load-u32 4294967295))\n'+source.slice(end),rt=backend.compiler.compile_ir_string(faulty,'callback-trap.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program,rt)));a.auto(1);const items=array(a,[true]),f=a.invoke('identity'),marker=array(a,[false]),frame=a.frame(1);a.frameSet(frame,0,marker);
 assert.throws(()=>a.invoke('some-with',[items,f]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);
 assert.throws(()=>a.invoke('first-error',[items,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.get(marker,0),false);assert.equal(a.stats().frameDepth,1);a.leaveFrame(frame);finish(a,[items,f,marker]);
});

test('raw WASM JavaScript truth handles payload NaNs signed zero subnormals strings and opaque identity',()=>{
 const ir=structuredClone(runtime);ir.body.push({kind:'export-declaration',value:null,children:[{kind:'reference',value:'value-js-truth',children:[]}]});
 const bytes=Uint8Array.from(backend.wasm.emit_memory_wasm(ir)),e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,32768);
 const cases=[[0,0,false],[0,0x80000000,false],[0x12345678,0x7ff80000,false],[1,0x7ff00000,false],[0,0xfff80000,false],[1,0,true],[0,0x7ff00000,true],[0,0xfff00000,true],[0xffffffff,0x7fefffff,true]];
 for(const[low,high,expected]of cases){const value=e['value-number'](heap,low,high);assert.equal(e['last-error'](),0);assert.equal(e['value-js-truth'](heap,value),expected?1:0);assert.equal(e['last-error'](),0);assert.equal(e['value-truth'](heap,value),1);e['heap-collect'](heap);}
 for(const[value,expected]of[[0,0],[1,0],[2,1],[3,0]])assert.equal(e['value-js-truth'](heap,value),expected);
 const empty=e['value-string'](heap,0);e['value-seal'](heap,empty);assert.equal(e['value-js-truth'](heap,empty),0);assert.equal(e['value-truth'](heap,empty),1);e['heap-collect'](heap);
 const array=e['value-array-new'](heap,0);assert.equal(e['value-js-truth'](heap,array),1);e['heap-collect'](heap);assert.equal(e['heap-live'](heap),0);assert.equal(e['frame-depth'](heap),0);
});

test('Node executes the identical callback artifact with sparse arrays exact truth and owned root cleanup',async()=>{
 const artifact=resolve(directory,'callbacks.wasm'),runner=resolve(directory,'node-callbacks.mjs');await writeFile(artifact,Uint8Array.from(backend.managed.emit_managed_wasm(program,runtime)));
 await writeFile(runner,`import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{instantiateManagedRuntime}from${JSON.stringify(pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href)};
 const a=instantiateManagedRuntime(await readFile(new URL('./callbacks.wasm',import.meta.url)));a.auto(1);const f=a.invoke('identity'),zero=a.number(-0),nan=a.number(NaN),tiny=a.number(Number.MIN_VALUE),empty=a.string(''),values=a.sourceArray([zero,nan,tiny,empty,true]);
 const out=a.invoke('filter-with',[values,f]);assert.equal(a.length(out),2);const first=a.get(out,0);assert.equal(a.readNumber(first),Number.MIN_VALUE);assert.equal(a.get(out,1),true);a.release(first);
 const sparse=[];sparse.length=5;sparse[2]=tiny;const input=a.sourceArray(sparse),mapped=a.invoke('map-with',[input,f]);assert.equal(a.length(mapped),5);for(const i of[0,1,3,4]){const key=a.number(i);assert.equal(a.invoke('has-index',[mapped,key]),false);a.release(key);}
 const key=a.number(2);assert.equal(a.invoke('has-index',[mapped,key]),true);a.release(key);for(const x of[f,zero,nan,tiny,empty,values,out,input,mapped])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);console.log('independent Node callback semantics passed');`);
 const result=spawnSync('node',[runner],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/independent Node callback semantics passed/);
});


test('map and filter retain the existing source-array constructor species refusal semantics',()=>{
 const a=instance(),items=array(a,[true,false]),f=a.invoke('identity'),object=a.sourceObject({});
 for(const name of['map-constructor','filter-constructor']){
  for(const value of[null,false,true,0,NaN,'']){const ctor=box(a,value);assert.throws(()=>reference[name.replaceAll('-','_')]([true,false],x=>x,value),TypeError);assert.throws(()=>a.invoke(name,[items,f,ctor]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(ctor);}
  for(const ctor of[undefined,object,f])assert.deepEqual(invoke(a,name,[items,f,ctor]),name==='map-constructor'?[true,false]:[true]);
 }finish(a,[items,f,object]);
});
