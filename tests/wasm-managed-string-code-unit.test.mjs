import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime;
const source=`(defconst marker 1)
 (defun read (text index) (string-code-unit-at text index))
 (defun missing (text) (read text))
 (defun extra (trace) (read (progn (js-call trace :push "text") "ab")
   (progn (js-call trace :push "index") 1) (js-call trace :push "extra")))
 (defun converted (trace mode)
   (string-code-unit-at "A😀\\uD800x"
     (js-object :valueOf (lambda () (js-call trace :push "valueOf") (if (= mode 0) 1.9 (js-object)))
       :toString (lambda () (js-call trace :push "toString") "2.9"))))
 (defun primitive (trace)
   (let ((index (js-object)))
     (put index (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) -0))
     (string-code-unit-at "xy" index)))
 (defun abrupt (trace)
   (let ((index (js-object)))
     (put index (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) (throw trace)))
     (try (string-code-unit-at "xy" index) (catch error (Object/is error trace)))))
 (defun receiver-order (text trace) (string-code-unit-at text (progn (js-call trace :push "index") 0)))
 (defun captured (trace)
   (let ((receiver (js-object :charCodeAt (lambda (index) (js-array "captured" index)))))
     (string-code-unit-at receiver (progn (put receiver :charCodeAt false) (js-call trace :push "argument") 7))))
 (defun invalid (trace)
   (string-code-unit-at "x" (js-object :valueOf (lambda () (js-call trace :push "valueOf") (js-object))
     :toString (lambda () (js-call trace :push "toString") (js-object)))))
 (defun methods (index) (js-array (js-call "abc" :at index) (js-call "abc" :charAt index)
   (js-call "abc" :charCodeAt index) (js-call "abc" :codePointAt index)))
 (defun family-effects (trace)
   (let ((index (js-object :valueOf (lambda () (js-call trace :push "convert") "-1.9"))))
     (methods index)))
 (export read missing extra converted primitive abrupt receiver-order captured invalid methods family-effects)`;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-code-unit-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function compiled(rt=runtime,options){const p=b.compiler.compile_ir_string(source,'code-unit.eli'),snapshot=JSON.stringify(p),bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.equal(JSON.stringify(p),snapshot);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return{a,p,bytes,js:await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'))};}
function box(a,v){return typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;}
function decode(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14){const out=[];for(let i=0;i<a.length(v);i++){const child=a.get(v,i);try{out.push(decode(a,child));}finally{a.release(child);}}return out;}return v;}
function run(a,name,args=[]){const out=a.invoke(name,args);try{return decode(a,out);}finally{a.release(out);}}
function finish(a,roots=[]){roots.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('UTF16 code unit intrinsic emits zero-import WASM and matches exact charCodeAt integer boundary and surrogate semantics',async()=>{
 const{a,js}=await compiled();for(const text of['','x','A😀\ud800x','\udfff中','\ud800\ud800']){const value=a.string(text);for(const index of[undefined,null,false,true,NaN,Infinity,-Infinity,-0,0,Number.MIN_VALUE,-Number.MIN_VALUE,-.9,.9,1.9,-1.9,-1,2,3,4,5,2**32,2**53,-(2**53),'','-0','2.9','bad']){const input=box(a,index),actual=run(a,'read',[value,input]);assert(Object.is(actual,text.charCodeAt(index)));assert(Object.is(actual,js.read(text,index)));a.release(input);}a.release(value);}finish(a);
});
test('intrinsic index conversion captures number hint once after argument effects while ordinary own methods retain their original argument and identity',async()=>{
 const{a,js}=await compiled();for(const mode of[0,1]){const value=a.number(mode),trace=a.sourceArray([]),expected=[];assert.deepEqual(run(a,'converted',[trace,value]),js.converted(expected,mode));assert.deepEqual(decode(a,trace),expected);a.release(value);a.release(trace);}
 for(const name of['primitive','extra','abrupt','captured']){const trace=a.sourceArray([]),expected=[];assert.deepEqual(run(a,name,[trace]),js[name](expected));assert.deepEqual(decode(a,trace),expected);a.release(trace);}
 const trace=a.sourceArray([]),expected=[];assert.throws(()=>a.invoke('invalid',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>js.invalid(expected),TypeError);assert.deepEqual(decode(a,trace),expected);const text=a.string('abc');assert.equal(run(a,'missing',[text]),js.missing('abc'));finish(a,[trace,text]);
});
test('nullish receiver lookup precedes index evaluation and other missing noncallable methods fail only after evaluating it',async()=>{
 const{a,js}=await compiled();for(const value of[null,undefined,false,true,0]){const input=box(a,value),trace=a.sourceArray([]),expected=[];assert.throws(()=>a.invoke('receiver-order',[input,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>js.receiver_order(value,expected),TypeError);assert.deepEqual(decode(a,trace),expected);a.release(input);a.release(trace);}finish(a);
});

test('the existing indexed String method family applies object ToNumber once at each original call point',async()=>{
 const{a,js}=await compiled(),trace=a.sourceArray([]),expected=[];assert.deepEqual(run(a,'family-effects',[trace]),js.family_effects(expected));assert.deepEqual(decode(a,trace),expected);assert.deepEqual(expected,['convert','convert','convert','convert']);finish(a,[trace]);
});

test('random full UTF16 unit strings retain exact lone surrogate and indexed NaN results under collecting GC',async()=>{
 const{a}=await compiled();let seed=0x16539abc;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let i=0;i<128;i++){let text='';for(let j=0,length=next()%32;j<length;j++)text+=String.fromCharCode(next()&65535);const value=a.string(text);for(const index of[undefined,-.9,-1.9,NaN,Infinity,-Infinity,next()%48,(next()%96-48)/3]){const input=box(a,index);assert(Object.is(run(a,'read',[value,input]),text.charCodeAt(index)));a.release(input);}a.release(value);a.collect();assert.equal(a.stats().frameDepth,0);}finish(a);
});

test('strict intrinsic arity and malformed IR refuse extra or missing operands before lowering effects',async()=>{
 for(const input of['(string-code-unit-at)','(string-code-unit-at "x")','(string-code-unit-at "x" 0 1)'])assert.throws(()=>b.compiler.compile_string(input,'unit-arity.eli'));
 const{a,p}=await compiled();finish(a);const find=nodes=>{for(const n of nodes){if(n.kind==='intrinsic'&&n.value==='string-code-unit-at')return n;const child=find(n.children??[]);if(child)return child;}};
 for(const count of[0,1,3]){const copy=structuredClone(p),node=find(copy.body);assert(node);node.children=count<2?node.children.slice(0,count):[...node.children,node.children[0]];assert.throws(()=>b.managed.emit_managed_wasm(copy,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');}
});

test('UTF16 raw method validation preserves unsealed stale private and illegal arguments and recovers from allocation failure without dropping caller roots',async()=>{
 const{a,bytes}=await compiled();finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](64,16384,131072),call=(name,...args)=>{const out=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const text=call('value-string',1);call('heap-pin',text);call('value-unit-set',text,0,55296);call('value-seal',text);
 const zero=call('value-number',0,2147483648),unsealed=call('value-string',1),stale=call('value-number',0,0),caller=call('frame-new',3);call('frame-set',caller,0,text);call('frame-set',caller,1,zero);call('frame-set',caller,2,unsealed);call('heap-collect');call('heap-auto',1);
 for(const[value,index,mode,code]of[[0xffffffff,zero,2,1],[caller,zero,2,1],[unsealed,zero,2,6],[text,0xffffffff,2,1],[text,stale,2,1],[text,caller,2,3],[text,unsealed,2,6],[text,zero,24,3]]){assert.equal(e['value-source-text-method'](h,value,index,3,mode),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',caller,0),text);}
 const held=[];while(call('heap-live')<64){const n=call('value-number',0,0);call('heap-pin',n);held.push(n);}assert.equal(e['value-source-text-method'](h,text,zero,3,2),0);assert.equal(e['last-error'](),2);assert.equal(call('frame-depth'),1);held.forEach(n=>call('heap-release',n));call('heap-collect');const out=call('value-source-text-method',text,zero,3,2),p=call('value-data',out,4);assert.equal(new DataView(e.memory.buffer).getFloat64(p,true),55296);const heldBits=call('value-data',zero,4);assert(Object.is(new DataView(e.memory.buffer).getFloat64(heldBits,true),-0));call('heap-release',text);call('frame-pop',caller);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('a real UTF16 code unit load trap retains completed index conversion effects and the outer caller frame',async()=>{
 const raw=await readFile('bootstrap/runtime/memory.eli','utf8'),start=raw.indexOf('  (defun value-source-text-method '),needle='(load-u16 (+ (+ (heap-block heap value) 32) (* index 2)))',point=raw.indexOf(needle,start);assert(point>start);const injected=b.compiler.compile_ir_string(raw.slice(0,point)+'(load-u16 4294967295)'+raw.slice(point+needle.length),'unit-trap.eli'),{a}=await compiled(injected),trace=a.sourceArray([]),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);assert.throws(()=>a.invoke('primitive',[trace]),WebAssembly.RuntimeError);assert.deepEqual(decode(a,trace),['number']);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.leaveFrame(caller);finish(a,[trace,held]);
});

test('Node independently executes the exact code unit WASM bytes with native UTF16 and object conversion oracles',async()=>{
 const{a,bytes}=await compiled();finish(a);const file=resolve(directory,'code-unit.wasm');await writeFile(file,bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const bytes=readFileSync(process.argv[2]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',box.toString(),decode.toString(),run.toString(),finish.toString(),"const a=instantiateManagedRuntime(bytes);a.auto(1);for(const text of['','A😀\\ud800x','\\udfff中']){const value=a.string(text);for(const index of[undefined,null,false,true,-0,NaN,Infinity,-Infinity,-.9,-1.9,0,1.9,2,4,2**53,'2.9']){const input=box(a,index);assert(Object.is(run(a,'read',[value,input]),text.charCodeAt(index)));a.release(input);}a.release(value);}const trace=a.sourceArray([]);assert.equal(run(a,'primitive',[trace]),120);assert.deepEqual(decode(a,trace),['number']);a.release(trace);finish(a);"].join('\n');const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('public Seed and bootstrap preserve the original charCodeAt property lookup contract and JS getter order',async()=>{
 const input=resolve(directory,'unit.eli'),output=resolve(directory,'unit.mjs');await writeFile(input,'(defun read (text index) (string-code-unit-at text index)) (export read)');const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);const javascript=await readFile(output,'utf8');assert.equal(javascript,b.compiler.compile_string(await readFile(input,'utf8'),input));const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
 for(const index of[undefined,-0,NaN,Infinity,-Infinity,1.9,2.9])assert(Object.is(reference.read('A😀\ud800',index),'A😀\ud800'.charCodeAt(index)));
 const events=[],receiver={get charCodeAt(){events.push('get-method');return function(index){assert.equal(this,receiver);events.push(index);return 7;};}};assert.equal(reference.read(receiver,19),7);assert.deepEqual(events,['get-method',19]);
});
