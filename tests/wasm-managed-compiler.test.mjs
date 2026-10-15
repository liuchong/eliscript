import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {compilerBudget,compilerMemory,readCompilerValue,finishCompiler} from './whole-compiler-rig.mjs';

let directory,backend,bytes;
const entry='backends/managed.mjs';
const flatten=nodes=>nodes.flatMap(node=>node.kind==='module-declaration'?flatten(node.children):[node]);
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-compiler-'));
 backend=await buildBackends({outputRoot:directory});
 const modules=new Map();
 async function visit(id){
  if(modules.has(id))return;
  const path=(id.startsWith('backends/')?'bootstrap/backends/':'bootstrap/compiler/')+posix.basename(id,'.mjs')+'.eli';
  const program=backend.compiler.compile_ir_string(await readFile(path,'utf8'),path);
  modules.set(id,{id,program});
  for(const node of flatten(program.body))if(node.kind==='import-declaration'){
   assert(node.value.startsWith('.'));
   await visit(posix.normalize(posix.join(posix.dirname(id),node.value)));
  }
 }
 await visit(entry);
 const graph=[...modules.values()],snapshot=JSON.stringify(graph);
 const runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 try{bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(graph,entry,runtime,compilerMemory));}
 catch(error){error.message+=' '+JSON.stringify(error.eliscriptDiagnostic);throw error;}
 assert.equal(JSON.stringify(graph),snapshot);
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function box(a,value){
 if(typeof value==='number')return a.number(value);
 if(typeof value==='string')return a.string(value);
 if(value&&typeof value==='object'){
  const children=Array.isArray(value)?value.map(child=>box(a,child)):Object.fromEntries(Object.entries(value).map(([key,child])=>[key,box(a,child)]));
  try{return Array.isArray(value)?a.sourceArray(children):a.sourceObject(children);}
  finally{Object.values(children).forEach(child=>a.release(child));}
 }
 return value;
}
function invoke(a,modules,id){
 const input=box(a,modules),name=a.string(id);let result;
 try{result=a.invoke('link_managed_project',[input,name]);return readCompilerValue(a,result);}
 finally{a.release(result);a.release(name);a.release(input);}
}
function sourceError(a,error){
 if(error?.kind!==13)throw error;
 const result={};
 try{for(const name of['name','message','eliscriptDiagnostic']){
  const key=a.string(name);let value;
  try{value=a.objectGet(error,key);result[name]=readCompilerValue(a,value);}
  finally{a.release(value);a.release(key);}
 }}finally{a.release(error);}
 return result;
}
function oracleError(error){return{name:error.name,message:error.message,eliscriptDiagnostic:error.eliscriptDiagnostic};}
function module(id,source){return{id,program:backend.compiler.compile_ir_string(source,id.replace(/[.]mjs$/,'.eli'))};}
const cases=()=>[
 [module('main.mjs','(defun run (x) (js-array x (+ x 1))) (export run)')],
 [module('dep.mjs','(defconst base 7) (defun add (x) (+ base x)) (export base add)'),module('main.mjs','(import "./dep.mjs" base add) (defun run (x) (js-array base (add x))) (export run)')],
 [module('main.mjs','(import "./dep.mjs" add) (defun run (x) (let ((base 100)) (+ base (add x)))) (export run)'),module('dep.mjs','(defconst base 3) (defun add (x) (+ base x)) (export add)')],
];
function runtime(){const a=instantiateManagedRuntime(bytes,{...compilerBudget,initializeModule:false});a.auto(65536);a.initializeModule();return a;}
test('the complete managed output backend and its real import graph run under zero-import WASM and link actual compiler IR',()=>{
 const a=runtime();
 try{for(const modules of cases()){
  const before=structuredClone(modules),expected=backend.managed.link_managed_project(modules,'main.mjs');
  assert.deepEqual(invoke(a,modules,'main.mjs'),expected);
  assert.deepEqual(modules,before);
  a.collect();assert.equal(a.stats().frameDepth,0);
 }}finally{finishCompiler(a);}
},30000);
test('the complete WASM managed linker retains missing dependency and export diagnostics and recovers before the next project',()=>{
 const a=runtime();
 try{
  const broken=[
   {modules:cases()[0],entry:'absent.mjs'},
   {modules:[module('main.mjs','(import "./absent.mjs" value) (export value)')],entry:'main.mjs'},
   {modules:[module('dep.mjs','(defconst hidden 1)'),module('main.mjs','(import "./dep.mjs" hidden) (export hidden)')],entry:'main.mjs'},
  ];
  for(const{modules,entry:id}of broken){
   let expected;try{backend.managed.link_managed_project(modules,id);assert.fail('fixture must reject');}catch(error){if(error.code==='ERR_ASSERTION')throw error;expected=oracleError(error);}
   let actual;try{invoke(a,modules,id);assert.fail('WASM must reject');}catch(error){actual=sourceError(a,error);}
   assert.deepEqual(actual,expected);assert.equal(a.stats().frameDepth,0);
   const recovered=cases()[0];assert.deepEqual(invoke(a,recovered,'main.mjs'),backend.managed.link_managed_project(recovered,'main.mjs'));
  }
 }finally{finishCompiler(a);}
},30000);
