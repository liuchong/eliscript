import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtime;
const flatten=nodes=>nodes.flatMap(node=>node.kind==='module-declaration'?flatten(node.children):[node]);
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-wasm-backends-'));backend=await buildBackends({outputRoot:directory});runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function actualGraph(entry){
 const found=new Map();
 async function visit(id){if(found.has(id))return;const filename=id.startsWith('backends/')?'bootstrap/backends/'+posix.basename(id,'.mjs')+'.eli':'bootstrap/compiler/'+posix.basename(id,'.mjs')+'.eli';
  const program=backend.compiler.compile_ir_string(await readFile(filename,'utf8'),filename);found.set(id,{id,program});
  for(const node of flatten(program.body))if(node.kind==='import-declaration'){assert(node.value.startsWith('.'));await visit(posix.normalize(posix.join(posix.dirname(id),node.value)));}
 }
 await visit(entry);return [...found.values()];
}
function emitGraph(modules,entry){const before=JSON.stringify(modules);let bytes;try{bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,entry,runtime,{initialPages:128,maximumPages:4096}));}catch(error){error.message+=' '+JSON.stringify(error.eliscriptDiagnostic);throw error;}assert.equal(JSON.stringify(modules),before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return bytes;}
function read(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(read(a,child));}finally{a.release(child);}}return out;}if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=read(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return value;}
function box(a,value){if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);if(value&&typeof value==='object'){const children=Array.isArray(value)?value.map(child=>box(a,child)):Object.fromEntries(Object.entries(value).map(([key,child])=>[key,box(a,child)]));try{return Array.isArray(value)?a.sourceArray(children):a.sourceObject(children);}finally{Object.values(children).forEach(child=>a.release(child));}}return value;}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('the complete WASM output backend and its actual import graph execute under zero-import WASM and emit a real numeric WASM product',async()=>{
 const entry='backends/wasm.mjs',modules=await actualGraph(entry),bytes=emitGraph(modules,entry),a=instantiateManagedRuntime(bytes,{maxSlots:131072,initialBytes:8388608,maxBytes:67108864,initializeModule:false});a.auto(65536);a.initializeModule();
 const program=backend.compiler.compile_ir_string('(defun add (x y) (+ x y)) (export add)','add.eli'),input=box(a,program);let out;
 try{out=a.invoke('emit_numeric_wasm',[input]);const product=Uint8Array.from(read(a,out)),expected=Uint8Array.from(backend.wasm.emit_numeric_wasm(program));assert.deepEqual(product,expected);const compiled=new WebAssembly.Instance(new WebAssembly.Module(product));for(const[x,y]of[[1,2],[-0,-0],[NaN,1],[Infinity,-Infinity],[Number.MIN_VALUE,Number.MIN_VALUE]])assert(Object.is(compiled.exports.add(x,y),x+y));}finally{a.release(out);a.release(input);finish(a);}
},30000);

test('the complete shared optimizer graph runs under WASM with unchanged real IR outputs and inputs',async()=>{
 const entry='backends/optimize.mjs',modules=await actualGraph(entry),bytes=emitGraph(modules,entry),a=instantiateManagedRuntime(bytes,{maxSlots:32768,initialBytes:2097152,maxBytes:16777216,initializeModule:false});a.auto(65536);a.initializeModule();
 for(const source of['(defun add (x y) (+ x y)) (export add)','(defun negative-zero () -0) (export negative-zero)','(defun run (n) (let ((i 0) (sum 0)) (while (< i n) (setq sum (+ sum i)) (setq i (1+ i))) sum)) (export run)','(defun decide (flag) (if flag 1 2)) (export decide)','(defun order (x) (progn (+ x 1) (* x 2))) (export order)']){
  const program=backend.compiler.compile_ir_string(source,'optimizer.eli'),snapshot=JSON.stringify(program),input=box(a,program);let result;
  try{result=a.invoke('optimize_program',[input]);assert.deepEqual(read(a,result),backend.optimizer.optimize_program(program));assert.deepEqual(read(a,input),program);assert.equal(JSON.stringify(program),snapshot);const again=a.invoke('optimize_program',[result]);try{assert.deepEqual(read(a,again),read(a,result));}finally{a.release(again);}}finally{a.release(result);a.release(input);}a.collect();assert.equal(a.stats().frameDepth,0);
 }
 finish(a);
},30000);

test('the complete native output backend graph runs under WASM and emits byte-identical arm64 Mach-O',async()=>{
 const entry='backends/native.mjs',modules=await actualGraph(entry),bytes=emitGraph(modules,entry),a=instantiateManagedRuntime(bytes,{maxSlots:131072,initialBytes:8388608,maxBytes:67108864,initializeModule:false});a.auto(65536);a.initializeModule();
 const program=backend.compiler.compile_ir_string('(defun add (x y) (+ x y)) (export add)','native-add.eli'),input=box(a,program),target=a.string('arm64-macos');let out;
 try{out=a.invoke('emit_native_numeric_object',[input,target]);const product=Uint8Array.from(read(a,out));assert.deepEqual(product,Uint8Array.from(backend.native.emit_native_numeric_object(program,'arm64-macos')));assert.deepEqual([...product.subarray(0,4)],[207,250,237,254]);}finally{a.release(out);a.release(input);a.release(target);finish(a);}
},30000);
