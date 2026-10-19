import {beforeAll,afterAll,test}from'bun:test';
import assert from'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile}from'node:fs/promises';
import {tmpdir}from'node:os';import{resolve}from'node:path';import{spawnSync}from'node:child_process';
import{buildBackends}from'../tools/backends/build.mjs';
import{instantiateManagedRuntime}from'../tools/backends/managed-runtime.mjs';
import{createManagedHostRuntime}from'../tools/backends/managed-host.mjs';
let directory,backend,runtimeProgram,source,program,bytes,js;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-control-'));backend=await buildBackends({outputRoot:directory});
 runtimeProgram=backend.compiler.compile_ir_string(await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');
 source=await readFile(resolve('tests/fixtures/wasm-managed-control.eli'),'utf8');program=backend.compiler.compile_ir_string(source,'control.eli');
 bytes=Uint8Array.from(backend.managed.emit_managed_wasm(program,runtimeProgram,{maximumPages:128}));
 assert(WebAssembly.validate(bytes));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function box(a,value){return typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;}
function unpack(a,value){return value&&typeof value==='object'?value.kind===4?a.readNumber(value):value.kind===5?a.readString(value):value:value;}
// Faults at the bulk ABI boundary isolate cleanup ordering and thrown-value
// identity; the real-WASM capacity, trap and GC cases below remain required.
function cleanupFaultRuntime({uniform=false,primary,throws=true,releaseFailure=true,pinFailure=false,result=2}={}){
 const released=[],unwound=[],cleared=[],secondary=new Error('cleanup fault');let next=4;
 const e={
  'heap-new':()=>1,'last-error':()=>0,'value-kind':()=>4,
  'value-number':()=>++next,'frame-current':()=>7,
  'heap-pin':(_heap,value)=>{if(pinFailure&&value===8)throw secondary;return value;},
  'heap-release':(_heap,value)=>{released.push(value);if(releaseFailure)throw secondary;return 1;},
  'frame-unwind':(_heap,target)=>{unwound.push(target);throw secondary;},
  'value-exception-clear':()=>{cleared.push(true);throw secondary;},
  'value-call-reset':()=>{throw secondary;},
  'value-refs':()=>8,'value-data':()=>0,
  entry:uniform?function(_heap,_callee,_arguments,_count){if(throws)throw primary;return result;}
   :function(_heap,_left,_right){if(throws)throw primary;return result;},
 };
 const descriptor={format:'eliscript-managed-control',version:1,abi:'managed-control-v1',functions:[uniform?
  {name:'entry',arity:null,callingConvention:'argument-list',parameterKinds:['required','optional']}:{name:'entry',arity:2}]};
 const buffer=new ArrayBuffer(16),api=createManagedHostRuntime(e,descriptor,{view:()=>new DataView(buffer)});
 return{api,released,unwound,cleared,secondary};
}
test('bulk entry cleanup preserves every original thrown value and attempts all owned root releases',()=>{
 for(const uniform of[false,true])for(const primary of[undefined,null,false,-0,NaN,Symbol('source'),Object.freeze(new Error('source'))]){
  const {api,released,unwound,cleared}=cleanupFaultRuntime({uniform,primary});
  const args=[api.number(1),api.number(2)];let caught=false;
  try{api.invoke('entry',args);}catch(error){caught=true;assert(Object.is(error,primary));}
  assert(caught);assert.deepEqual(released,uniform?[8,5,6]:[5,6]);
  assert(unwound.length>=1);assert(unwound.every(target=>target===7));assert.equal(cleared.length,1);
 }
});
test('bulk entry cleanup failures remain visible after success and unowned allocations are never released',()=>{
 for(const uniform of[false,true]){
  const {api,released,secondary}=cleanupFaultRuntime({uniform,throws:false});
  assert.throws(()=>api.invoke('entry',[api.number(1),api.number(2)]),error=>error===secondary);
  assert.deepEqual(released,uniform?[8,5,6]:[5,6]);
 }
 const {api,released,secondary}=cleanupFaultRuntime({uniform:true,pinFailure:true,releaseFailure:false});
 assert.throws(()=>api.invoke('entry',[api.number(1),api.number(2)]),error=>error===secondary);
 assert.deepEqual(released,[5,6]);
 for(const uniform of[false,true]){
  const {api,released,secondary}=cleanupFaultRuntime({uniform,throws:false,result:5});
  assert.throws(()=>api.invoke('entry',[api.number(1),api.number(2)]),error=>error===secondary);
  assert.deepEqual(released,uniform?[8,5,6,5]:[5,6,5],'a result rejected by cleanup never transfers its extra root');
 }
});
test('ordinary control source executes in managed WASM with Lisp truth and exact primitive results',()=>{
 const a=instantiateManagedRuntime(bytes);const values=[null,false,true,undefined,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'','中😀\ud800'];
 for(const value of values){const handle=box(a,value);
  for(const name of['truth','invert','once','optional-result','unless-result','recurse']){const result=a.invoke(name,[handle]);assert.deepEqual(unpack(a,result),js[name.replaceAll('-','_')](value),name);a.release(result);}
  const result=a.invoke('identity',[handle]);assert(a.keyEqual(result,handle));a.release(result);a.release(handle);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
 for(const name of['unicode','negative-zero','finite-number','undefined-result','empty-and','empty-or']){const result=a.invoke(name,[]);assert(Object.is(unpack(a,result),js[name.replaceAll('-','_')]()));a.release(result);a.collect();assert.equal(a.live(),0);}
});
test('managed lowering preserves short-circuit values, shadowing, assignment effects and direct call order',()=>{
 const a=instantiateManagedRuntime(bytes);const values=[null,false,true,undefined,0,-0,NaN,'','x'];
 for(const left of values)for(const right of values){const x=box(a,left),y=box(a,right);
  for(const name of['both','either','parallel','sequential','effects','clauses','call-choose']){const result=a.invoke(name,[x,y]);assert.deepEqual(unpack(a,result),js[name.replaceAll('-','_')](left,right),name);a.release(result);}
  a.release(x);a.release(y);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});
test('managed calls snapshot earlier argument values before later assignment and allocation effects',async()=>{
 const text='(defun first (a b) a) (defun order (x y) (first x (setq x y))) (defun assignment-order (x y) (first (setq x y) (setq x nil))) (defun throw-input (x) (throw x)) (defun catch-input (x) (try (throw-input x) (catch error error))) (defun call-this () (js* "this")) (defun direct-this () (call-this)) (export order assignment-order catch-input direct-this)';
 const ir=backend.compiler.compile_ir_string(text,'order.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));
 const ref=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
 const a=instantiateManagedRuntime(artifact);a.auto(1);const x=a.number(-0),y=a.string('new');
 for(const name of['order','assignment-order']){const result=a.invoke(name,[x,y]);assert.deepEqual(unpack(a,result),ref[name.replaceAll('-','_')](-0,'new'));a.release(result);}
 const caught=a.invoke('catch-input',[y]);assert(a.keyEqual(caught,y));a.release(caught);
 assert.equal(a.invoke('direct-this',[]),ref.direct_this());
 a.release(x);a.release(y);a.collect();assert.equal(a.live(),0);
});
test('two-arm if preserves omitted nil branches evaluation order identity throws and caller roots under GC',async()=>{
 const text=`
 (defun omitted (condition value) (if condition value))
 (defun explicit (condition value) (if condition value nil))
 (defun nested (outer inner value) (if outer (if inner value)))
 (defun once-if (condition)
   (let ((hits 0))
     (js-array (if (progn (setq hits (1+ hits)) condition)
                 (progn (setq hits (+ hits 10)) hits)) hits)))
 (defun assign-if (condition value)
   (let ((current value)) (if condition (setq current -0.0)) current))
 (defun throw-if (condition value) (if condition (throw value)))
 (export omitted explicit nested once-if assign-if throw-if)`;
 const ir=backend.compiler.compile_ir_string(text,'two-arm-if.eli'),before=JSON.stringify(ir);
 const pending=[...ir.body];let twoArm=0;
 while(pending.length){const node=pending.pop();if(node.kind==='conditional'&&node.children.length===2)twoArm++;pending.push(...node.children);}
 assert(twoArm>=6,'the original IR must contain omitted children rather than a fixture-synthesized else');
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));
 assert.equal(JSON.stringify(ir),before);assert(WebAssembly.validate(artifact));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
 const a=instantiateManagedRuntime(artifact,{maxSlots:256,initialBytes:16384,maxBytes:1048576});a.auto(1);
 const value=a.string('same\ud800😀'),caller=a.frame(1);a.frameSet(caller,0,value);
 try{
  for(const condition of[null,false,undefined,true,0,-0,NaN,'']){
   const input=box(a,condition),depth=a.stats().frameDepth;
   try{
    for(const name of['omitted','explicit']){
     const result=a.invoke(name,[input,value]);
     try{assert.deepEqual(unpack(a,result),reference[name](condition,'same\ud800😀'),name);
      if(result!==null)assert(a.keyEqual(result,value));}
     finally{a.release(result);}
    }
    const once=a.invoke('once-if',[input]);
    try{
     const actual=[];
     for(let index=0;index<a.length(once);index++){
      const item=a.get(once,index);try{actual.push(unpack(a,item));}finally{a.release(item);}
     }
     assert.deepEqual(actual,reference.once_if(condition));
    }finally{a.release(once);}
    const assigned=a.invoke('assign-if',[input,value]);
    try{assert(Object.is(unpack(a,assigned),reference.assign_if(condition,'same\ud800😀')));}
    finally{a.release(assigned);}
    for(const inner of[false,true]){
     const result=a.invoke('nested',[input,inner,value]);
     try{assert.deepEqual(unpack(a,result),reference.nested(condition,inner,'same\ud800😀'));}
     finally{a.release(result);}
    }
    let threw=false,expected;
    try{reference.throw_if(condition,'same\ud800😀');}catch(error){threw=true;expected=error;}
    if(threw)assert.throws(()=>a.invoke('throw-if',[input,value]),error=>{
     assert.equal(a.readString(error),expected);assert(a.keyEqual(error,value));a.release(error);return true;
    });else assert.equal(a.invoke('throw-if',[input,value]),null);
    assert.equal(a.stats().frameDepth,depth);a.collect();
    const kept=a.frameGet(caller,0);try{assert(a.keyEqual(kept,value));}finally{a.release(kept);}
   }finally{a.release(input);}
  }
 }finally{a.leaveFrame(caller);a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
},30000);
test('managed root names remain hygienic and randomized control programs match independent JS under GC',async()=>{
 let state=0x5d77a1;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 const leaf=['a','b','nil','false','t','0','-0.0','"中😀\\ud800"'];
 const expression=depth=>{if(!depth)return leaf[next()%leaf.length];switch(next()%7){
  case 0:return `(if ${expression(depth-1)} ${expression(depth-1)} ${expression(depth-1)})`;
  case 1:return `(and ${expression(depth-1)} ${expression(depth-1)})`;
  case 2:return `(or ${expression(depth-1)} ${expression(depth-1)})`;
  case 3:return `(let ((a b) (b a)) ${expression(depth-1)})`;
  case 4:return `(let* ((a b) (b a)) ${expression(depth-1)})`;
  case 5:return `(first ${expression(depth-1)} (setq a ${expression(depth-1)}))`;
  default:return `(progn (setq b ${expression(depth-1)}) ${expression(depth-1)})`;
 }};
 const names=Array.from({length:32},(_,i)=>`random-${i}`);
 const text='(defun first (a b) a) (defun internals (heap error frame temporary result) (let ((result error)) frame)) '+names.map(name=>`(defun ${name} (a b) ${expression(3)})`).join('\n')+` (export internals ${names.join(' ')})`;
 const ir=backend.compiler.compile_ir_string(text,'random-control.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));
 const ref=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
 const a=instantiateManagedRuntime(artifact,{maxSlots:256,initialBytes:16384,maxBytes:1048576});a.auto(1);
 const values=[null,false,true,undefined,0,-0,NaN,'','中😀\ud800'],handles=values.map(v=>box(a,v));
 const hygienic=a.invoke('internals',handles.slice(0,5));assert.equal(hygienic,true);a.release(hygienic);
 for(const name of names)for(let i=0;i<values.length;i++)for(let j=0;j<values.length;j++){
  const result=a.invoke(name,[handles[i],handles[j]]);assert.deepEqual(unpack(a,result),ref[name.replaceAll('-','_')](values[i],values[j]),`${name}/${i}/${j}`);a.release(result);a.collect();assert.equal(a.stats().frameDepth,0);
 }
 for(const value of handles)a.release(value);a.collect();assert.equal(a.live(),0);
});
test('automatically rooted arguments and temporaries survive first-frame allocation, repeated GC and opaque identity',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:4096,maxBytes:65536});a.auto(1);
 const object=a.map(),set=a.setTable(),str=a.string('😀\ud800');a.tableSet(object,str,set);a.tableAdd(set,object);
 for(let i=0;i<1000;i++) {const result=a.invoke('call-choose',[object,str]);assert(a.keyEqual(result,str));a.release(result);assert.equal(a.stats().frameDepth,0);}
 assert(a.stats().collections>1000);for(const value of[object,set,str])a.release(value);a.collect();assert.equal(a.live(),0);
});
test('managed entry failure restores caller frames, argument roots and the original capacity error',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:8,initialBytes:512,maxBytes:512});a.auto(1);const input=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,input);
 const padding=[a.array(),a.array()];const before=a.stats().frameDepth;assert.throws(()=>a.invoke('call-choose',[input,input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');
 assert.equal(a.stats().frameDepth,before);const alias=a.frameGet(frame,0);assert(Object.is(a.readNumber(alias),-0));a.release(alias);a.leaveFrame(frame);for(const value of padding)a.release(value);a.release(input);a.collect();assert.equal(a.live(),0);
});
test('managed descriptor limits entry access and rejects wrong arity, foreign handles and numeric coercion',()=>{
 const a=instantiateManagedRuntime(bytes),b=instantiateManagedRuntime(bytes),value=b.string('x');
 assert.throws(()=>a.invoke('heap-new',[]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.invoke('identity',[]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.invoke('identity',[0]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
 assert.throws(()=>a.invoke('identity',[value]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');b.release(value);b.collect();assert.equal(a.stats().frameDepth,0);
});
test('the checked entry roots earlier arguments across later getters and restores those roots if a getter throws',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.string('borrowed😀'),args=[input];
 Object.defineProperty(args,1,{get(){a.release(input);a.collect();return false;}});
 const result=a.invoke('either',args);assert.equal(a.readString(result),'borrowed😀');a.release(result);a.collect();assert.equal(a.live(),0);
 const next=a.string('failure'),bad=[next];Object.defineProperty(bad,1,{get(){throw Error('getter failed');}});
 assert.throws(()=>a.invoke('either',bad),/getter failed/);a.release(next);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
});
test('a true WASM runtime trap restores the caller frame and does not leak transient argument roots',async()=>{
 // Fault injection uses the original out-of-bounds address and real WASM trap;
 // it never substitutes a host-thrown error for cleanup acceptance.
 const original=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8'),start=original.indexOf('  (defun value-truth (heap value)'),end=original.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
 const runtimeSource=original.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+original.slice(end);
 const injected=backend.compiler.compile_ir_string(runtimeSource,'trap-runtime.eli');
 const ir=backend.compiler.compile_ir_string('(defun crash (x) (if x x nil)) (export crash)','trap.eli');
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,injected,{maximumPages:128}));
 const a=instantiateManagedRuntime(artifact),input=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,input);
 assert.throws(()=>a.invoke('crash',[input]),error=>error instanceof WebAssembly.RuntimeError);
 assert.equal(a.stats().frameDepth,1);const alias=a.frameGet(frame,0);assert(Object.is(a.readNumber(alias),-0));a.release(alias);
 a.leaveFrame(frame);a.release(input);a.collect();assert.equal(a.live(),0);
});
test('managed async functions suspend once, preserve thrown values and recover after rejection',async()=>{
 const text='(defasync settle (x) (+ (await x) 1)) (defasync reject-value (x) (throw (await x))) (defasync recover (x) (try (throw (await x)) (catch error error))) (defun choose (x) (if false (async () x) x)) (defasync hygiene (eliscript-async-0) (await eliscript-async-0)) (export settle reject-value recover choose hygiene)';
 const ir=backend.compiler.compile_ir_string(text,'async-control.eli'),before=JSON.stringify(ir);
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));assert.equal(JSON.stringify(ir),before);
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const ref=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
 const a=instantiateManagedRuntime(artifact);a.auto(1);const input=a.number(4),message=a.string('rejected');
 try {
  const result=await a.invokeAsync('settle',[input]);assert.equal(unpack(a,result),await ref.settle(4));a.release(result);
  await assert.rejects(()=>a.invokeAsync('reject-value',[message]),error=>{assert(a.keyEqual(error,message));a.release(error);return true;});
  const recovered=await a.invokeAsync('recover',[message]);assert.equal(unpack(a,recovered),await ref.recover('rejected'));a.release(recovered);
  const hygienic=await a.invokeAsync('hygiene',[input]);assert.equal(unpack(a,hygienic),await ref.hygiene(4));a.release(hygienic);
  const chosen=a.invoke('choose',[input]);assert.equal(unpack(a,chosen),ref.choose(4));a.release(chosen);
 } finally {a.release(input);a.release(message);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test('managed lowering refuses every unsupported node including unreachable code and preserves source locations and IR',()=>{
 const before=JSON.stringify(program),runtimeBefore=JSON.stringify(runtimeProgram);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);assert.equal(JSON.stringify(runtimeProgram),runtimeBefore);
 for(const text of['(defun f (x) (string-to-bigint x)) (export f)','(defun f () [1 2]) (export f)',
  '(import "host" f) (export f)','(defun f () (js* "1")) (export f)',
  '(defun memory () 1) (export memory)','(defun heap-new () 1) (export heap-new)']) {
  const ir=backend.compiler.compile_ir_string(text,'unsupported.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.phase==='managed-backend'&&e.eliscriptDiagnostic.location.file==='unsupported.eli',text);
 }
});
test('implemented required and optional parameter patterns execute the former rejection inputs and preserve captured values under GC',async()=>{
 for(const [text,entry]of[
  ['(defun f ([x]) x) (export f)','(defun run () (f (js-array -0))) (export run)'],
  ['(defun f (g) (lambda (&optional [x]) (g))) (export f)',
   '(defun run () (let ((value -0)) (funcall (f (lambda () value)) (js-array 17)))) (export run)'],
 ]){
  const ir=backend.compiler.compile_ir_string(text+'\n'+entry,'parameter-patterns.eli'),before=JSON.stringify(ir);
  const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
  const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));assert.equal(JSON.stringify(ir),before);
  const runtime=instantiateManagedRuntime(artifact);runtime.auto(1);
  try{for(let index=0;index<16;index++){
   const value=runtime.invoke('run');try{assert(Object.is(runtime.readNumber(value),reference.run()));assert(Object.is(runtime.readNumber(value),-0));}
   finally{runtime.release(value);}runtime.collect();assert.equal(runtime.stats().frameDepth,0);
  }}finally{runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}
 }
});
test('Node and Bun load the same ordinary managed artifact and release returned roots',async()=>{
 const path=resolve(directory,'control.wasm');await writeFile(path,bytes);
 const result=spawnSync('node',['--input-type=module','-e',`
 import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{instantiateManagedRuntime}from${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);const x=a.string('中😀\ud800');const y=a.invoke('call-choose',[x,x]);assert.equal(a.readString(y),'中😀\ud800');a.release(y);a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
test('the explicit managed control CLI emits executable WASM and refuses other targets without publishing output',async()=>{
 const output=resolve(directory,'cli-control.wasm'),fixture=resolve('tests/fixtures/wasm-managed-control.eli'),cli=resolve('tools/backends/compile.mjs');
 const result=spawnSync(process.execPath,[cli,'--abi','managed-control-v1','--target','wasm','-o',output,fixture],{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);
 const a=instantiateManagedRuntime(await readFile(output));const value=a.invoke('unicode',[]);assert.equal(a.readString(value),js.unicode());a.release(value);a.collect();assert.equal(a.live(),0);
 for(const target of['js','native']){const path=resolve(directory,`bad-${target}`),bad=spawnSync(process.execPath,[cli,'--abi','managed-control-v1','--target',target,'-o',path,fixture],{encoding:'utf8',timeout:30000});assert.notEqual(bad.status,0);assert(!(await Bun.file(path).exists()));}
},120000);
