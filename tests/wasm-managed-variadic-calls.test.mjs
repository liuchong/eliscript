import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backends,runtime,program,reference,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-variadic-'));
 backends=await buildBackends({outputRoot:directory});
 runtime=backends.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=backends.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-variadic-calls.eli','utf8'),'variadic.eli');
 reference=await import('data:text/javascript;base64,'+Buffer.from(backends.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function instance(options={}){bytes??=Uint8Array.from(backends.managed.emit_managed_wasm(program,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return a;}
function value(a,x){if(x===null||typeof x==='boolean'||x===undefined)return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);assert.equal(x.kind,14);const result=[];for(let i=0;i<a.length(x);i++){const c=a.get(x,i);try{result.push(value(a,c));}finally{a.release(c);}}return result;}
function result(a,name,args=[]){const out=a.invoke(name,args);try{return value(a,out);}finally{a.release(out);}}
function finish(a,values=[]){for(const x of values)a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}

test('optional and rest exports preserve omitted, undefined, nil and exact IEEE values',()=>{
 const a=instance();
 for(const xs of [[],[undefined],[null],[false],[1],[1,undefined],[1,null,2,false,undefined],[-0,NaN,Infinity,-Infinity,Number.MIN_VALUE]]){
  const args=xs.map(x=>typeof x==='number'?a.number(x):x);
  assert.deepEqual(result(a,'mixed',args),reference.mixed(...xs));for(const x of args)a.release(x);
 }
 assert.equal(a.invoke('optional-one'),null);assert.equal(a.invoke('optional-one',[undefined]),null);
 assert.equal(a.invoke('optional-one',[false]),false);
 assert.deepEqual(result(a,'pack'),[]);assert.equal(a.invoke('fresh-rest'),false);finish(a);
});

test('named and lifted variadic functions retain source call and dynamic function semantics',()=>{
 const a=instance(),f=a.invoke('mixed-value'),one=a.number(1),two=a.number(2);
 assert.deepEqual(result(a,'source-calls'),reference.source_calls());
 assert.deepEqual(result(a,'call-none',[f]),reference.call_none(reference.mixed_value()));
 assert.deepEqual(result(a,'call-three',[f,one,undefined,two]),reference.call_three(reference.mixed_value(),1,undefined,2));
 const capture=a.invoke('make-capture',[one,two]),fn=reference.make_capture(1,2);
 for(const x of [undefined,null,two,false]){
  assert.deepEqual(result(a,'call-capture',[capture,x,one]),reference.call_capture(fn,x===two?2:x,1));a.collect();
 }
 finish(a,[f,one,two,capture]);
});

test('rest arrays are fresh and argument snapshots survive captured writes',()=>{
 const a=instance(),one=a.number(1),items=a.sourceArray([one]);
 assert.deepEqual(result(a,'rest-snapshots',[items]),reference.rest_snapshots([1]));
 const last=a.get(items,0);assert.equal(a.readNumber(last),99);finish(a,[one,items,last]);
});

test('apply-call is executable on its own and snapshots the callee before its iterable',()=>{
 const ir=backends.compiler.compile_ir_string('(defun id (x) x) (defun run (values) (apply id values)) (export run)','apply-only.eli');
 const a=instantiateManagedRuntime(Uint8Array.from(backends.managed.emit_managed_wasm(ir,runtime)));a.auto(1);
 const n=a.number(-0),args=a.sourceArray([n]);assert(Object.is(result(a,'run',[args]),-0));finish(a,[n,args]);
 const b=instance(),items=b.sourceArray([]);assert.equal(result(b,'apply-callee-order',[items]),reference.apply_callee_order([]));finish(b,[items]);
});

test('apply exhausts arrays, holes and Unicode strings with ordinary spread semantics',()=>{
 const a=instance(),f=a.invoke('pack-value'),text=a.string('A\ud83d\ude00\ud800Z'),sparse=[];sparse.length=4;
 const holes=a.sourceArray(sparse);assert.deepEqual(result(a,'apply-values',[f,holes]),reference.apply_values(reference.pack_value(),sparse));
 assert.deepEqual(result(a,'apply-values',[f,text]),reference.apply_values(reference.pack_value(),'A\ud83d\ude00\ud800Z'));
 for(const x of [null,undefined,false,true,a.number(1),a.sourceObject({})]){
  assert.throws(()=>a.invoke('apply-values',[f,x]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');if(typeof x==='object'&&x)a.release(x);
 }
 finish(a,[f,text,holes]);
});

test('apply supports owned Set, Map and partially consumed iterators and consumes before noncallable failure',()=>{
 const a=instance(),f=a.invoke('pack-value'),one=a.number(1),two=a.number(2),items=a.sourceArray([one,two]);
 const set=a.invoke('as-set',[items]);assert.deepEqual(result(a,'apply-values',[f,set]),[1,2]);
 const pair=a.sourceArray([one,two]),pairs=a.sourceArray([pair]),map=a.invoke('as-map',[pairs]);assert.deepEqual(result(a,'apply-values',[f,map]),[[1,2]]);
 const iter=a.invoke('values-iterator',[items]);assert.equal(a.invoke('iterator-done',[iter]),false);assert.deepEqual(result(a,'apply-values',[f,iter]),[2]);assert.equal(a.invoke('iterator-done',[iter]),true);
 const consumed=a.invoke('values-iterator',[items]);assert.throws(()=>a.invoke('apply-values',[false,consumed]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.invoke('iterator-done',[consumed]),true);
 finish(a,[f,one,two,items,set,pair,pairs,map,iter,consumed]);
});

test('variadic host entry protects arguments before later getters and keeps caller frames on failure',()=>{
 const a=instance(),n=a.number(7),keep=a.number(9),frame=a.frame(1);a.frameSet(frame,0,keep);
 const args=[n,undefined];Object.defineProperty(args,1,{get(){a.release(n);a.collect();return true;}});
 assert.deepEqual(result(a,'pack',args),[7,true]);assert.equal(a.stats().frameDepth,1);
 const marker=a.sourceArray([false]);assert.throws(()=>a.invoke('first-error',[false,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.get(marker,0),false);
 const broken=[true];Object.defineProperty(broken,1,{get(){throw Error('variadic getter');}});assert.throws(()=>a.invoke('pack',broken),/variadic getter/);assert.equal(a.stats().frameDepth,1);
 a.leaveFrame(frame);finish(a,[keep,marker]);
});

test('rest and spread capacity failures release temporary argument lists and preserve existing roots',()=>{
 const a=instance({maxSlots:64,initialBytes:4096,maxBytes:8192}),n=a.number(7),frame=a.frame(1);a.frameSet(frame,0,n);let failed=false,passed=false;
 for(const count of [0,8,64,256,512,1024,2048]){
  try{const out=a.invoke('pack',Array(count).fill(true));assert.equal(a.length(out),count);a.release(out);passed=true;}
  catch(e){assert.equal(e.eliscriptDiagnostic?.code,'ELI-RT0002');failed=true;}
  assert.equal(a.stats().frameDepth,1);a.collect();const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),7);a.release(saved);
 }
 assert(passed&&failed);a.leaveFrame(frame);finish(a,[n]);
});

test('variadic lowering refuses invalid parameter modes, hidden children and malformed apply shapes immutably',()=>{
 for(const mutate of [p=>p.body[0].children[0].properties.parameterKind='unknown',p=>p.body[0].children[1].properties.parameterKind='required',p=>p.body[0].children[0].properties.parameterKind='rest',p=>p.body[0].children[0].children.push({kind:'raw-javascript',children:[],value:'hidden'})]){
  const ir=backends.compiler.compile_ir_string('(defun f (&optional a b) (js-array a b)) (export f)','bad-variadic.eli');mutate(ir);const saved=JSON.stringify(ir);assert.throws(()=>backends.managed.emit_managed_wasm(ir,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');assert.equal(JSON.stringify(ir),saved);
 }
 const ir=backends.compiler.compile_ir_string('(defun f (g values) (apply g values)) (export f)','bad-apply.eli');ir.body[0].children.at(-1).children.push({kind:'literal',value:7,children:[]});const saved=JSON.stringify(ir);assert.throws(()=>backends.managed.emit_managed_wasm(ir,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');assert.equal(JSON.stringify(ir),saved);
});

test('argument-list descriptors validate parameter modes and the actual exported ABI',()=>{
 const lowered=backends.managed.lower_managed_program(program,runtime),raw=backends.wasm.emit_typed_memory_wasm(lowered.typed);
 const mixed=lowered.descriptor.functions.find(f=>f.name==='mixed');assert.deepEqual(mixed,{name:'mixed',arity:null,callingConvention:'argument-list',parameterKinds:['required','optional','rest']});
 for(const mutate of [d=>{delete d.functions.find(f=>f.name==='mixed').parameterKinds;},d=>{d.functions.find(f=>f.name==='mixed').arity++;},d=>{d.functions.find(f=>f.name==='mixed').callingConvention='other';},d=>{delete d.functions.find(f=>f.name==='mixed').callingConvention;},d=>{d.functions.find(f=>f.name==='mixed').parameterKinds=['required','rest','optional'];},d=>{d.functions.find(f=>f.name==='mixed').parameterKinds=['required','optional','unknown'];},d=>{d.functions.find(f=>f.name==='mixed').parameterKinds=['required','required','required'];},d=>{d.functions.find(f=>f.name==='call-none').arity=3;}]){
  const d=structuredClone(lowered.descriptor);mutate(d);const invalid=Uint8Array.from(backends.wasm.append_metadata_section(raw,'eliscript-managed-control',JSON.stringify(d)));
  assert.throws(()=>instantiateManagedRuntime(invalid),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 }
 const a=instance();assert.throws(()=>a.invoke('call-none'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a);
});

function rawHeap(){
 const ir=structuredClone(runtime);ir.body.push({kind:'export-declaration',value:null,children:['value-call-arguments-check','value-call-rest','value-call-expand'].map(value=>({kind:'reference',value,children:[]}))});
 const raw=Uint8Array.from(backends.wasm.emit_memory_wasm(ir));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(raw)),[]);const e=new WebAssembly.Instance(new WebAssembly.Module(raw)).exports,heap=e['heap-new'](128,4096,32768);
 const call=(name,...args)=>{const result=e[name](heap,...args)>>>0;assert.equal(e['last-error'](),0,name);return result;};call('heap-auto',1);return {e,heap,call};
}

test('raw argument helpers borrow unrooted inputs and preserve exact tail bits through GC',()=>{
 const {e,heap,call}=rawHeap(),args=call('value-refs',7,5);call('heap-pin',args);
 const patterns=[[0,0x80000000],[1,0],[0xabcdef01,0x7ff80000],[0,0x7ff00000],[0xffffffff,0x7fefffff]];
 for(let i=0;i<patterns.length;i++){const n=call('value-number',...patterns[i]);call('value-set',args,i,n);}
 call('heap-release',args);const tail=call('value-call-rest',args,1,5);call('heap-pin',tail);
 for(let i=0;i<60;i++)call('value-number',i,0);call('heap-collect');assert.equal(call('value-length',tail),4);
 for(let i=0;i<4;i++){const child=call('value-get',tail,i),offset=call('value-data',child,4),view=new DataView(e.memory.buffer);assert.deepEqual([view.getUint32(offset,true),view.getUint32(offset+4,true)],patterns[i+1]);}
 call('heap-release',tail);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});

test('raw spread growth fills holes and rejects malformed argument words or counts',()=>{
 const {e,heap,call}=rawHeap(),items=call('value-array-new',513);call('heap-pin',items);
 for(let i=0;i<513;i+=3)call('value-set',items,i,2);
 const expanded=call('value-call-expand',items);call('heap-pin',expanded);assert.equal(call('value-length',expanded),513);
 for(let i=0;i<513;i++)assert.equal(call('value-get',expanded,i),i%3===0?2:3);
 assert.equal(call('value-call-arguments-check',expanded,513),1);e['value-call-arguments-check'](heap,expanded,512);assert.equal(e['last-error'](),3);
 const data=call('value-data',expanded,7);new DataView(e.memory.buffer).setUint32(data+4,4,true);
 e['value-call-arguments-check'](heap,expanded,513);assert.equal(e['last-error'](),1);
 call('heap-release',expanded);call('heap-release',items);call('heap-collect');assert.equal(call('heap-live'),0);assert.equal(call('frame-depth'),0);
});

test('a real trap in rest allocation or spread expansion unwinds host and source callers',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8');
 for(const [helper,signature,entry,args]of [['value-call-rest','heap arguments start count','pack',[true]],['value-call-expand','heap input','apply-values',[false,undefined]]]){
  const start=source.indexOf('  (defun '+helper+' ('),end=source.indexOf('  (defun ',start+10);assert(start>=0&&end>start);
  const faulty=source.slice(0,start)+`  (defun ${helper} (${signature}) (load-u32 4294967295))\n`+source.slice(end);
  const ir=backends.compiler.compile_ir_string(faulty,'trap-arguments.eli'),a=instantiateManagedRuntime(Uint8Array.from(backends.managed.emit_managed_wasm(program,ir)));a.auto(1);
  const n=a.number(7),frame=a.frame(1);a.frameSet(frame,0,n);assert.throws(()=>a.invoke(entry,args),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const saved=a.frameGet(frame,0);assert.equal(a.readNumber(saved),7);a.release(saved);a.leaveFrame(frame);finish(a,[n]);
 }
});

test('generated argument shapes match an independent optional and rest model with exact Number bits',()=>{
 const a=instance(),f=a.invoke('mixed-value');let seed=0x1f34ac81;
 const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let i=0;i<96;i++){
  const count=random()%13,values=[],args=[];
  for(let j=0;j<count;j++){const tag=random()%7;let x;if(tag===0)x=undefined;else if(tag===1)x=null;else if(tag===2)x=false;else{const bits=new DataView(new ArrayBuffer(8));bits.setUint32(0,random(),true);bits.setUint32(4,random(),true);x=bits.getFloat64(0,true);}values.push(x);args.push(typeof x==='number'?a.number(x):x);}
  const expected=[values[0],values[1]===undefined?null:values[1],values.slice(2)];assert.deepEqual(result(a,'mixed',args),expected);
  const list=a.sourceArray(args);assert.deepEqual(result(a,'apply-values',[f,list]),expected);a.release(list);for(const x of args)a.release(x);a.collect();
 }
 finish(a,[f]);
});

test('large argument lists preserve every operand while required-only public ABI stays exact',()=>{
 const a=instance();
 for(const count of [127,128,255,256,1025]){
  const out=a.invoke('pack',Array(count).fill(true));assert.equal(a.length(out),count);
  for(let i=0;i<count;i++)assert.equal(a.get(out,i),true);a.release(out);a.collect();
 }
 assert.equal(a.invoke('optional-one',Array(1025).fill(false)),false);
 assert.throws(()=>a.invoke('call-none',[]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');finish(a);
});

test('Node executes the same variadic and iterable artifact against standalone generated JavaScript',async()=>{
 const artifact=resolve(directory,'variadic.wasm'),js=resolve(directory,'reference.mjs'),runner=resolve(directory,'node.mjs');
 await writeFile(artifact,Uint8Array.from(backends.managed.emit_managed_wasm(program,runtime)));await writeFile(js,backends.compiler.emit_ir_string(program));
 const adapter=pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href;
 await writeFile(runner,`import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{instantiateManagedRuntime}from${JSON.stringify(adapter)};import*as ref from'./reference.mjs';
 const a=instantiateManagedRuntime(await readFile(new URL('./variadic.wasm',import.meta.url)));a.auto(1);
 const value=x=>{if(x===null||typeof x==='boolean'||x===undefined)return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);const result=[];for(let i=0;i<a.length(x);i++){const c=a.get(x,i);try{result.push(value(c));}finally{a.release(c)}}return result};
 const get=(name,args=[])=>{const x=a.invoke(name,args);try{return value(x)}finally{a.release(x)}};
 assert.deepEqual(get('mixed'),ref.mixed());
 const n=a.number(-0),seed=a.number(Number.MIN_VALUE),f=a.invoke('mixed-value'),list=a.sourceArray([n,undefined,seed]);assert.deepEqual(get('apply-values',[f,list]),ref.apply_values(ref.mixed_value(),[-0,undefined,Number.MIN_VALUE]));
 const text=a.string('A😀Z'),pack=a.invoke('pack-value');assert.deepEqual(get('apply-values',[pack,text]),ref.pack(...'A😀Z'));
 const captured=a.invoke('make-capture',[n,seed]),reference=ref.make_capture(-0,Number.MIN_VALUE);assert.deepEqual(get('call-capture',[captured,true]),ref.call_capture(reference,true));
 const iter=a.invoke('values-iterator',[list]);assert.throws(()=>a.invoke('apply-values',[false,iter]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.invoke('iterator-done',[iter]),true);
 for(const x of[n,seed,f,list,text,pack,captured,iter])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);console.log('independent Node variadic source semantics passed');`);
 const result=spawnSync('node',[runner],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/independent Node variadic source semantics passed/);
});
