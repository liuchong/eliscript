import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime;
const source=`(defconst marker 1)
 (defun words (value) (number-float64-words value))
 (defun missing () (words))
 (defun extra (trace) (words (progn (js-call trace :push "value") 1) (js-call trace :push "extra")))
 (defun converted (trace mode)
   (number-float64-words (js-object :valueOf (lambda () (js-call trace :push "valueOf")
     (if (= mode 0) -0 (js-object))) :toString (lambda () (js-call trace :push "toString") "-0"))))
 (defun primitive (trace)
   (let ((value (js-object)))
     (put value (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) -0))
     (number-float64-words value)))
 (defun throwing (trace)
   (let ((value (js-object)))
     (put value (js* "Symbol.toPrimitive") (lambda (hint) (js-call trace :push hint) (throw trace)))
     (try (number-float64-words value) (catch error (Object/is error trace)))))
 (defun invalid (trace)
   (number-float64-words (js-object :valueOf (lambda () (js-call trace :push "valueOf") (js-object))
     :toString (lambda () (js-call trace :push "toString") (js-object)))))
 (export words missing extra converted primitive throwing invalid)`;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-f64words-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function compiled(rt=runtime,options){const p=b.compiler.compile_ir_string(source,'float64-words.eli'),saved=JSON.stringify(p),bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.equal(JSON.stringify(p),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,options);a.auto(1);return{a,bytes,p,js:await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'))};}
function box(a,value){return typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14){const out=[];for(let i=0;i<a.length(v);i++){const child=a.get(v,i);try{out.push(read(a,child));}finally{a.release(child);}}return out;}return v;}
function run(a,name,args=[]){const out=a.invoke(name,args);try{return read(a,out);}finally{a.release(out);}}
function finish(a,roots=[]){roots.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
// Independent oracle preserves the original pre-ToNumber zero test.
function oracle(value){const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,value===0?0:value,true);return[bytes.getUint32(0,true),bytes.getUint32(4,true)];}
test('float64 word intrinsic executes zero-import WASM with exact low/high IEEE words and primitive zero canonicalization',async()=>{
 const{a,js}=await compiled();for(const value of[undefined,null,false,true,0,-0,1,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,2**52,2**53,1.5,'','-0','1.5','NaN','Infinity','0xFFFFFFFF']){const input=box(a,value);assert.deepEqual(run(a,'words',[input]),oracle(value));assert.deepEqual(js.words(value),oracle(value));a.release(input);}const zero=a.number(-0);assert.deepEqual(run(a,'words',[zero]),[0,0]);finish(a,[zero]);
});
test('ToNumber uses number-hint conversion once and preserves converted negative zero while missing and extra call arguments retain their effects',async()=>{
 const{a,js}=await compiled();assert.deepEqual(run(a,'missing'),oracle(undefined));
 for(const mode of[0,1]){const trace=a.sourceArray([]),expected=[],value=a.number(mode);assert.deepEqual(run(a,'converted',[trace,value]),js.converted(expected,mode));assert.deepEqual(read(a,trace),expected);a.release(trace);a.release(value);}
 for(const name of['primitive','extra','throwing']){const trace=a.sourceArray([]),expected=[];assert.deepEqual(run(a,name,[trace]),js[name](expected));assert.deepEqual(read(a,trace),expected);a.release(trace);}
 const trace=a.sourceArray([]),expected=[];assert.throws(()=>a.invoke('invalid',[trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.throws(()=>js.invalid(expected),TypeError);assert.deepEqual(read(a,trace),expected);assert.deepEqual(run(a,'words',[true]),oracle(true));finish(a,[trace]);
});
test('random complete binary64 payloads including NaN payload sign and subnormals retain exactly the original DataView words',async()=>{
 const{a}=await compiled(),view=new DataView(new ArrayBuffer(8));let seed=0x2849ad37;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const samples=[[1,0],[1,2147483648],[1,2146435072],[1,4293918720],[42,2146959360],[42,4294443008]];for(let i=0;i<256;i++)samples.push([next(),next()]);
 for(const[low,high]of samples){view.setUint32(0,low,true);view.setUint32(4,high,true);const value=view.getFloat64(0,true),input=a.number(value);assert.deepEqual(run(a,'words',[input]),oracle(value));a.release(input);}assert(a.stats().collections>256);finish(a);
});
test('intrinsic arity remains strict in source and in malformed IR and no argument effect is silently discarded',async()=>{
 for(const input of['(number-float64-words)','(number-float64-words 1 2)'])assert.throws(()=>b.compiler.compile_string(input,'float64-arity.eli'));
 const{a,p}=await compiled();finish(a);const find=nodes=>{for(const n of nodes){if(n.kind==='intrinsic'&&n.value==='number-float64-words')return n;const child=find(n.children??[]);if(child)return child;}};
 for(const count of[0,2]){const copy=JSON.parse(JSON.stringify(p)),node=find(copy.body);assert(node);node.children=count===0?[]:[node.children[0],node.children[0]];assert.throws(()=>b.managed.emit_managed_wasm(copy,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');}
});

test('raw IEEE word reads preserve malformed handle refusals private caller roots and recover at every partial allocation failure',async()=>{
 const{a,bytes}=await compiled();finish(a);const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](64,16384,131072),call=(name,...args)=>{const out=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return out;};
 const input=call('value-number',0,2147483648),unsealed=call('value-string',1),symbol=call('value-symbol-well-known',0),privateRefs=call('value-refs',7,0),caller=call('frame-new',4);for(const[i,v]of[input,unsealed,symbol,privateRefs].entries())call('frame-set',caller,i,v);call('heap-auto',1);
 for(const[value,code]of[[0xffffffff,1],[caller,3],[unsealed,6],[symbol,3],[privateRefs,3]]){assert.equal(e['value-number-float64-words'](h,value),0);assert.equal(e['last-error'](),code);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',caller,0),input);}
 const fillers=[];while(call('heap-live')<64){const value=call('value-number',0,0);call('heap-pin',value);fillers.push(value);}
 for(let available=0;available<4;available++){assert.equal(e['value-number-float64-words'](h,input),0);assert.equal(e['last-error'](),2);assert.equal(call('frame-depth'),1);assert.equal(call('frame-get',caller,0),input);call('heap-collect');call('heap-release',fillers.pop());call('heap-collect');}
 const result=call('value-number-float64-words',input);call('heap-pin',result);assert.equal(call('value-length',result),2);for(let i=0;i<2;i++){const word=call('value-get',result,i),p=call('value-data',word,4);assert.equal(new DataView(e.memory.buffer).getFloat64(p,true),0);}const p=call('value-data',input,4);assert(Object.is(new DataView(e.memory.buffer).getFloat64(p,true),-0));
 call('heap-release',result);fillers.forEach(v=>call('heap-release',v));call('frame-pop',caller);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('a real IEEE word result allocation trap retains completed ToNumber effects and only unwinds private frames',async()=>{
 const raw=await readFile('bootstrap/runtime/memory.eli','utf8'),start=raw.indexOf('  (defun value-number-float64-words '),point=raw.indexOf('(setq result (value-array-new heap 2))',start);assert(start>=0&&point>start);const needle='(setq result (value-array-new heap 2))',injected=b.compiler.compile_ir_string(raw.slice(0,point)+'(setq result (load-u32 4294967295))'+raw.slice(point+needle.length),'float64-trap.eli'),{a}=await compiled(injected),trace=a.sourceArray([]),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 assert.throws(()=>a.invoke('primitive',[trace]),WebAssembly.RuntimeError);assert.deepEqual(read(a,trace),['number']);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.leaveFrame(caller);finish(a,[trace,held]);
});

test('Node independently executes identical IEEE word WASM bytes including payloads converted zero and argument effects',async()=>{
 const{a,bytes}=await compiled();finish(a);const file=resolve(directory,'float64-words.wasm');await writeFile(file,bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const bytes=readFileSync(process.argv[2]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',box.toString(),read.toString(),run.toString(),finish.toString(),oracle.toString(),"const a=instantiateManagedRuntime(bytes);a.auto(1);const view=new DataView(new ArrayBuffer(8));let seed=0x1362b749;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let i=0;i<128;i++){view.setUint32(0,next(),true);view.setUint32(4,next(),true);const value=view.getFloat64(0,true),input=a.number(value);assert.deepEqual(run(a,'words',[input]),oracle(value));a.release(input);}for(const value of[-0,'-0',undefined,null,true,NaN,Infinity]){const input=box(a,value);assert.deepEqual(run(a,'words',[input]),oracle(value));a.release(input);}const trace=a.sourceArray([]);assert.deepEqual(run(a,'primitive',[trace]),oracle({valueOf:()=>-0}));assert.deepEqual(read(a,trace),['number']);a.release(trace);assert.deepEqual(run(a,'missing'),oracle(undefined));finish(a);"].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('public Seed emits the same intrinsic JavaScript contract while its result remains ordinary unsigned Number words',async()=>{
 const file=resolve(directory,'words.eli'),output=resolve(directory,'words.mjs');await writeFile(file,'(defun words (value) (number-float64-words value)) (export words)');const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,file],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);
 const actual=await readFile(output,'utf8');assert.equal(actual,b.compiler.compile_string(await readFile(file,'utf8'),file));const js=await import('data:text/javascript;base64,'+Buffer.from(actual).toString('base64'));
 for(const value of[-0,'-0',{valueOf:()=>-0},NaN,Infinity,-Infinity,Number.MIN_VALUE,2**53])assert.deepEqual(js.words(value),oracle(value));
 for(const value of[Symbol('word'),1n])assert.throws(()=>js.words(value),TypeError);
});
