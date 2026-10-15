import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime,program,bytes,js;
const source=String.raw`(defconst marker 1)
(defun truth (value) (js* "!!value"))
(defun branch (value) (if (js* "!!value") 1 0))
(defun shadow (value) (let ((answer value)) (js-array (js* "!!answer") (let ((answer 0)) (js* "!!answer")) (js* "!!answer"))))
(defun once (object) (let ((answer (aref object "answer"))) (js* "!!answer")))
(defun capture (value-name) (lambda () (js* "!!value_name")))
(defun invoke (callback) (funcall callback))
(defun opaque () (let ((answer (js-object :valueOf (lambda () (js-call nil :charAt 0)) :toString (lambda () (js-call nil :charAt 0))))) (js* "!!answer")))
(export truth branch shadow once capture invoke opaque)`;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-js-truth-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(source,'js-truth.eli');bytes=emit(program);js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function emit(p){const saved=JSON.stringify(p),out=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));assert.equal(JSON.stringify(p),saved);assert(WebAssembly.validate(out));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)),[]);return out;}
const box=(a,v)=>typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;
function finish(a,owned=[]){owned.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}

test('exact identifier ToBoolean agrees with native JS primitives and never coerces opaque objects under per-allocation GC',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 for(const value of[undefined,null,false,true,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,1,-1,'','0','中😀','\ud800']){const v=box(a,value);assert.equal(a.invoke('truth',[v]),!!value);const branch=a.invoke('branch',[v]);assert.equal(a.readNumber(branch),!!value?1:0);a.release(branch);const out=a.invoke('shadow',[v]);for(let i=0;i<3;i++){const result=a.get(out,i);assert.equal(result,i===1?false:!!value);a.release(result);}a.release(out);const fn=a.invoke('capture',[v]);assert.equal(a.invoke('invoke',[fn]),!!value);a.release(fn);a.release(v);}
 assert.equal(a.invoke('opaque'),true);
 for(const value of[0n,1n,-1n,Symbol(),()=>1,{},[],new Proxy({},{get(){throw Error('must not read');}})])assert.equal(js.truth(value),!!value);
 const object=a.sourceObject({}),array=a.sourceArray([]);assert.equal(a.invoke('truth',[object]),true);assert.equal(a.invoke('truth',[array]),true);finish(a,[object,array]);
});

test('operand getters run once, Boolean shadows are ignored, and only the complete primitive bypasses Lisp truth checks',async()=>{
 for(const value of[false,0,'',NaN,undefined,null,true,{},1n]){let reads=0;assert.equal(js.once({get answer(){reads++;return value;}}),!!value);assert.equal(reads,1);}
 const p=b.compiler.compile_ir_string('(defconst Boolean (lambda () false)) (defun f (value) (if (js* "!!value") 1 0)) (defun suffix (value) (if (js* "!!value || \\\"\\\"") 1 0)) (export f suffix)','truth-shadow.eli');
 const code=b.compiler.emit_ir_string(p),m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));assert.equal(m.f(''),0);assert.equal(m.f({}),1);assert.equal(m.suffix(false),1);assert(code.includes('if (!!value)'));assert(code.includes('__eliscript_truthy(!!value || "")'));
 const a=instantiateManagedRuntime(bytes);a.auto(1);const answer=a.string(''),object=a.sourceObject({answer});assert.equal(a.invoke('once',[object]),false);finish(a,[answer,object]);
});

test('project binding renaming preserves module globals, imported aliases and lexical captures in exact truth primitives',()=>{
 const library=b.compiler.compile_ir_string('(module lib (defvar answer 0) (defun f () (js* "!!answer")) (defun change () (setq answer "x")) (defun make (input-value) (lambda () (js* "!!input_value"))) (defun invoke (f) (funcall f)) (export f change make invoke))','truth-lib.eli'),entry=b.compiler.compile_ir_string('(module entry (import "./lib.mjs" f change make invoke) (export f change make invoke))','truth-entry.eli');
 const modules=[{id:'lib.mjs',program:library},{id:'entry.mjs',program:entry}],saved=JSON.stringify(modules),out=Uint8Array.from(b.managed.emit_managed_project_wasm(modules,'entry.mjs',runtime));assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)),[]);const a=instantiateManagedRuntime(out);a.auto(1);assert.equal(a.invoke('f'),false);const change=a.invoke('change');a.release(change);assert.equal(a.invoke('f'),true);const value=a.string(''),callback=a.invoke('make',[value]);assert.equal(a.invoke('invoke',[callback]),false);finish(a,[value,callback]);
});

test('unbound names and every unsupported raw expression remain source-bound refusals without mutable IR',()=>{
 for(const expression of['!!unknown','!!globalThis','!value','!!!value','!!value.x','!!value[0]','!!value()','!!value || ""','!!value; true','!!0value','!!value + 1','!!value/*x*/','!!值','!!value\ntrue']){const p=b.compiler.compile_ir_string('(defun f (value) (js* '+JSON.stringify(expression)+')) (export f)','truth-refusal.eli'),saved=JSON.stringify(p);assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='truth-refusal.eli');assert.equal(JSON.stringify(p),saved);}
 const a=instantiateManagedRuntime(bytes);a.auto(1);const value=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,value);assert.throws(()=>a.invoke('truth',[{}]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.throws(()=>a.invoke('truth',[1n]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(value),-0));a.leaveFrame(frame);finish(a,[value]);
});

test('public Seed, three compiler generations and Node retain exact code, zero-import bytes and Boolean-independent results',async()=>{
 const input=resolve(directory,'truth.eli'),output=resolve(directory,'truth.mjs');await writeFile(input,source);const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),b.compiler.emit_ir_string(program));
 const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort();assert.equal(files.length,13);let compiler=b.compiler;
 for(let generation=0;generation<3;generation++){const p=compiler.compile_ir_string(source,'js-truth.eli');assert.deepEqual(p,program);assert.deepEqual(emit(p),bytes);const out=resolve(directory,'g'+generation);await mkdir(out);for(const file of files){const filename=resolve('bootstrap/compiler',file);await writeFile(resolve(out,file.replace(/\.eli$/,'.mjs')),compiler.compile_string(await readFile(filename,'utf8'),filename));}compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);}
 const wasm=resolve(directory,'truth.wasm');await writeFile(wasm,bytes);const child=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const js=await import(process.argv[1]),{instantiateManagedRuntime}=await import(process.argv[2]),a=instantiateManagedRuntime(readFileSync(process.argv[3]));a.auto(1);const original=globalThis.Boolean;try{globalThis.Boolean=()=>false;for(const value of[undefined,null,false,true,0,-0,NaN,1,'','中😀']){const v=typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;assert.equal(a.invoke('truth',[v]),!!value);assert.equal(js.truth(value),!!value);a.release(v);}}finally{globalThis.Boolean=original;}a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`,pathToFileURL(output).href,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,wasm],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},30000);
