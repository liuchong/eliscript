import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';

let directory,backend;
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-word-cond-'));
  backend=await buildBackends({outputRoot:directory});
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function word(source){
  const ir=backend.compiler.compile_ir_string(source,'word-cond.eli');
  const bytes=Uint8Array.from(backend.wasm.emit_memory_wasm(ir));
  const module=new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module),[]);
  return new WebAssembly.Instance(module).exports;
}

test('word cond preserves discarded bodies, nested statements and exhaustive values',()=>{
  const e=word(`(import "eliscript:memory32" load-u32 store-u32)
    (defun run (n)
      (store-u32 0 0)
      (cond
        ((= n 1) (when t (store-u32 0 7)) (store-u32 0 (+ (load-u32 0) 2)))
        (t (unless false (store-u32 0 3))))
      (if (= n 9) (cond (t (when t (store-u32 0 11)))) 0)
      (load-u32 0))
    (defun value (n) (cond ((< n 3) (+ n 1)) ((= n 3) 7) (t 9)))
    (defun unmatched (n) (store-u32 0 5) (cond ((= n 1) (store-u32 0 8))) (load-u32 0))
    (defun empty () (cond) 42)
    (export run value unmatched empty)`);
  assert.equal(e.run(1),9);assert.equal(e.run(2),3);assert.equal(e.run(9),11);
  for(const n of [0,1,2,3,4,0xffffffff])assert.equal(e.value(n),n<3?n+1:n===3?7:9);
  assert.equal(e.unmatched(1),8);assert.equal(e.unmatched(2),5);assert.equal(e.empty(),42);
});

test('word cond evaluates a test-only clause once and preserves its boolean value',()=>{
  const e=word(`(import "eliscript:memory32" load-u32 store-u32)
    (defun run (n)
      (store-u32 0 0)
      (let ((result (if (cond ((progn (store-u32 0 (1+ (load-u32 0))) (= n 1))) (t false)) 7 9)))
        (+ (* (load-u32 0) 100) result)))
    (export run)`);
  assert.equal(e.run(1),107);assert.equal(e.run(2),109);
});

test('cond keeps consumed when and implicit nil outside the numeric result ABI',()=>{
  for(const source of [
    '(defun bad (n) (cond ((= n 1) (when t 7)) (t 9))) (export bad)',
    '(defun bad (n) (let ((x (cond ((= n 1) (unless false 7)) (t 9)))) x)) (export bad)',
    '(defun bad (n) (cond ((= n 1) 7))) (export bad)',
    '(defun bad (n) (cond (t 7) ((= n 1) "dead"))) (export bad)',
  ])assert.throws(()=>word(source),error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
  const ir=backend.compiler.compile_ir_string('(defun bad (n) (cond ((< n 1) 7))) (export bad)','numeric-cond.eli');
  assert.throws(()=>backend.numeric.lower_numeric_program(ir),error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
  const valid=backend.compiler.compile_ir_string('(defun run (n) (cond ((< n 1) 7) (t (+ n 2)))) (export run)','numeric-cond.eli');
  const bytes=Uint8Array.from(backend.wasm.emit_numeric_wasm(valid));
  const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  assert.equal(e.run(0),7);assert.equal(e.run(3),5);
});
