import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
test('malformed canonical IR JSON has a stable outer diagnostic and preserves the actual parse error as a non-enumerable cause',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eliscript-ir-json-error-'));
 try{
  const backend=await buildBackends({outputRoot:directory}),reference=await import(pathToFileURL(resolve(directory,'bootstrap/ir.mjs')).href);
  const program=backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/ir.eli','utf8'),'ir.eli'),runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
  const entry=backend.compiler.compile_ir_string('(import "./ir.mjs" deserialize-program) (defun run (source) (deserialize-program source)) (defun describe (error) (Object/getOwnPropertyDescriptor error "cause")) (export run describe)','ir-error-entry.eli');
  const bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm([{id:'ir.mjs',program},{id:'entry.mjs',program:entry}],'entry.mjs',runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
  const a=instantiateManagedRuntime(bytes);a.auto(1);
  for(const input of['{','[1,]','undefined']){
   const text=a.string(input),owned=[text];
   const get=(object,name)=>{const key=a.string(name);try{const value=a.objectGet(object,key);owned.push(value);return value;}finally{a.release(key);}};
   let expected,actual;
   try{reference.deserialize_program(input);}catch(error){expected=error;}
   assert(expected instanceof Error);assert.equal(expected.message,'invalid canonical IR JSON');assert(expected.cause instanceof SyntaxError);assert.equal(Object.getOwnPropertyDescriptor(expected,'cause').enumerable,false);
   try{
    try{a.invoke('run',[text]);assert.fail('expected schema error');}catch(error){assert.equal(error.kind,13);owned.push(error);actual=error;}
    const diagnostic=get(actual,'eliscriptDiagnostic');assert.equal(a.readString(get(actual,'message')),expected.message);assert.equal(a.readString(get(diagnostic,'message')),expected.message);assert.equal(a.readString(get(diagnostic,'code')),expected.eliscriptDiagnostic.code);assert.equal(a.readString(get(diagnostic,'phase')),expected.eliscriptDiagnostic.phase);
    const cause=get(actual,'cause');assert.equal(a.readString(get(cause,'name')),expected.cause.name);assert(a.readString(get(cause,'message')).length>0);
    const descriptor=a.invoke('describe',[actual]);owned.push(descriptor);assert.equal(get(descriptor,'enumerable'),false);assert.equal(get(descriptor,'writable'),true);assert.equal(get(descriptor,'configurable'),true);assert(a.keyEqual(get(descriptor,'value'),cause));
    const keys=a.objectKeys(actual);owned.push(keys);for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i);owned.push(key);assert.notEqual(a.readString(key),'cause');}
   }finally{for(const value of owned)a.release(value);a.collect();assert.equal(a.stats().frameDepth,0);}
  }
  a.closeModule();a.collect();assert.equal(a.live(),0);
 }finally{await rm(directory,{recursive:true,force:true});}
},30000);
