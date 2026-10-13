import {beforeAll,afterAll,test}from'bun:test';
import assert from'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile}from'node:fs/promises';
import {tmpdir}from'node:os';import{resolve}from'node:path';import{spawnSync}from'node:child_process';
import{buildBackends}from'../tools/backends/build.mjs';
import{instantiateManagedRuntime}from'../tools/backends/managed-runtime.mjs';
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
 const text='(defun first (a b) a) (defun order (x y) (first x (setq x y))) (defun assignment-order (x y) (first (setq x y) (setq x nil))) (export order assignment-order)';
 const ir=backend.compiler.compile_ir_string(text,'order.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,runtimeProgram));
 const ref=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(ir)).toString('base64'));
 const a=instantiateManagedRuntime(artifact);a.auto(1);const x=a.number(-0),y=a.string('new');
 for(const name of['order','assignment-order']){const result=a.invoke(name,[x,y]);assert.deepEqual(unpack(a,result),ref[name.replaceAll('-','_')](-0,'new'));a.release(result);}
 a.release(x);a.release(y);a.collect();assert.equal(a.live(),0);
});
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
 const original=await readFile(resolve('bootstrap/runtime/memory.eli'),'utf8'),start=original.indexOf('  (defun value-truth (heap value)'),end=original.indexOf('  (defun value-data',start);assert(start>=0&&end>start);
 const runtimeSource=original.slice(0,start)+'  (defun value-truth (heap value) (load-u32 4294967295))\n'+original.slice(end);
 const injected=backend.compiler.compile_ir_string(runtimeSource,'trap-runtime.eli');
 const ir=backend.compiler.compile_ir_string('(defun crash (x) (if x x nil)) (export crash)','trap.eli');
 const artifact=Uint8Array.from(backend.managed.emit_managed_wasm(ir,injected,{maximumPages:128}));
 const a=instantiateManagedRuntime(artifact),input=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,input);
 assert.throws(()=>a.invoke('crash',[input]),error=>error instanceof WebAssembly.RuntimeError);
 assert.equal(a.stats().frameDepth,1);const alias=a.frameGet(frame,0);assert(Object.is(a.readNumber(alias),-0));a.release(alias);
 a.leaveFrame(frame);a.release(input);a.collect();assert.equal(a.live(),0);
});
test('managed lowering refuses every unsupported node including unreachable code and preserves source locations and IR',()=>{
 const before=JSON.stringify(program),runtimeBefore=JSON.stringify(runtimeProgram);backend.managed.emit_managed_wasm(program,runtimeProgram);assert.equal(JSON.stringify(program),before);assert.equal(JSON.stringify(runtimeProgram),runtimeBefore);
 for(const text of['(defun f (x) (+ x 1)) (export f)','(defun f (x) (if false (lambda () x) x)) (export f)','(defun f () [1 2]) (export f)',
  '(defasync f () 1) (export f)','(defun f (&optional x) x) (export f)','(import "host" f) (export f)','(defun f () (js* "1")) (export f)',
  '(defun f (g) (g)) (export f)','(defun memory () 1) (export memory)','(defun heap-new () 1) (export heap-new)']) {
  const ir=backend.compiler.compile_ir_string(text,'unsupported.eli');assert.throws(()=>backend.managed.emit_managed_wasm(ir,runtimeProgram),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.phase==='managed-backend'&&e.eliscriptDiagnostic.location.file==='unsupported.eli');
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
