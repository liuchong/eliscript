import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {createCompilerDebugMap} from '../tools/backends/compiler-debug.mjs';

let directory, bytes, debug, machineFrames;
const filename = 'loader/输入😀.eli';
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-wasm-debug-options-'));
  const backend = await buildBackends({outputRoot: directory});
  const memory = await import(pathToFileURL(resolve(backend.directory, 'memory.mjs')).href);
  // Only the loader's minimal ABI is needed here. The actual memory32 load
  // and trap-site transport are emitted by the production WASM backend; this
  // fixture does not build a compiler binary or claim managed-heap coverage.
  const source = `(import "eliscript:memory32" load-u32)
    (defun heap-new (slots initial maximum) 256)
    (defun last-error () 0)
    (defun frame-current (heap) 0)
    (defun frame-unwind (heap target) 1)
    (defun value-standard-prototypes-close (heap) 1)
    (defun safe (heap) 2)
    (defun crash (heap) (load-u32 65536) 3)
    (export heap-new last-error frame-current frame-unwind
      value-standard-prototypes-close safe crash)`;
  const typed = memory.lower_memory_program(backend.compiler.compile_ir_string(source, filename));
  const artifact = backend.wasm.emit_typed_memory_wasm_artifact(typed, {initialPages: 1, maximumPages: 1});
  debug = artifact.debug;
  debug.sources = [{id: filename, filename, macroOrigins: []}];
  const crashed = typed.functions.find(fn => fn.name === 'crash');
  assert(crashed);
  const sites = debug.trapSites.filter(site => site.functionIndex === crashed.index);
  assert.equal(sites.length, 1, 'the real out-of-bounds load has one exact guard trap');
  machineFrames = [{address: sites[0].address, offsetBase: 'module',
    functionIndex: crashed.index, returnAddress: false}];
  const descriptor = {format: 'eliscript-managed-control', version: 1, abi: 'managed-control-v1',
    functions: [{name: 'safe', arity: 0}, {name: 'crash', arity: 0}]};
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(artifact.bytes,
    'eliscript-managed-control', JSON.stringify(descriptor)));
  assert(WebAssembly.validate(bytes));
  const module = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.equal(WebAssembly.Module.customSections(module, 'eliscript-trap-sites').length, 1);
}, 120000);
afterAll(async () => {
  bytes = undefined;debug = undefined;machineFrames = undefined;
  if (directory) await rm(directory, {recursive: true, force: true});
});

function trap(runtime) {
  let thrown;
  try {runtime.invoke('crash');} catch (error) {thrown = error;}
  assert(thrown instanceof WebAssembly.RuntimeError, 'actual WASM bounds trap must cross the loader');
  assert.deepEqual(thrown.eliscriptFrames, machineFrames);
  assert(Object.isFrozen(thrown.eliscriptFrames));
  assert(thrown.eliscriptFrames.every(Object.isFrozen));
  return thrown;
}

test('omitted, undefined and false input debug options retain exact machine frames without source mapping', () => {
  const original = bytes.slice();
  for (const options of [{}, {debug: undefined}, {debug: false}]) {
    const runtime = instantiateManagedRuntime(bytes, options);
    try {
      assert.equal(runtime.invoke('safe'), true);
      for (let repeat = 0; repeat < 2; repeat++) {
        const error = trap(runtime);
        assert.equal(Object.hasOwn(error, 'eliscriptSourceFrames'), false);
        assert.equal(runtime.invoke('safe'), true, 'trap transport restores subsequent calls');
      }
    } finally {runtime.closeModule();}
  }
  assert.deepEqual(bytes, original, 'runtime debug options do not alter the input binary');
});

test('a valid input debug document maps the same exact traps using an isolated snapshot', () => {
  const supplied = structuredClone(debug), saved = structuredClone(supplied);
  const expected = createCompilerDebugMap(saved).mapFrames(machineFrames);
  assert.equal(expected.length, 1);
  assert.equal(expected[0].source.function, 'crash');
  assert.equal(expected[0].source.span.filename, filename);
  assert.equal(expected[0].source.source, filename);
  const options = {debug: supplied}, runtime = instantiateManagedRuntime(bytes, options);
  assert.deepEqual(supplied, saved, 'loader construction does not consume a public debug document');
  supplied.functions.length = 0;supplied.ranges.length = 0;supplied.sources.length = 0;
  supplied.codeSection.payloadStart = supplied.codeSection.end;
  options.debug = false;
  try {
    assert.equal(runtime.invoke('safe'), true);
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(trap(runtime).eliscriptSourceFrames, expected);
      assert.equal(runtime.invoke('safe'), true);
    }
  } finally {runtime.closeModule();}
  assert.deepEqual(debug, saved, 'another instance retains the complete original debug document');
});

test('null, true and other unsupported input debug documents keep their original rejection', () => {
  for (const value of [null, true, 0, 'false', [], {}]) {
    assert.throws(() => instantiateManagedRuntime(bytes, {debug: value}), error => {
      assert(error instanceof TypeError);
      assert.equal(error.message, 'unsupported compiler instruction map');
      return true;
    });
  }
  const runtime = instantiateManagedRuntime(bytes, {debug: false});
  try {
    assert.equal(runtime.invoke('safe'), true);
    assert.equal(Object.hasOwn(trap(runtime), 'eliscriptSourceFrames'), false);
  } finally {runtime.closeModule();}
});
