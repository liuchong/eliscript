import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
import {createCompilerDebugMap} from '../tools/backends/compiler-debug.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const nativeTest = test.skipIf(!target), signatures = {safe: 0, crash: 0};
const filename = 'loader/原生输入😀.eli';
let directory, library, bytes, debug, machineFrames;
beforeAll(async () => {
  if (!target) return;
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-debug-options-'));
  const backend = await buildBackends({outputRoot: directory});
  const memory = await import(pathToFileURL(resolve(backend.directory, 'memory.mjs')).href);
  // Two actual memory-u32 functions are sufficient: no managed runtime or
  // compiler binary is needed to exercise native trap and loader boundaries.
  const source = `(import "eliscript:memory32" load-u32)
    (defun safe () 42)
    (defun crash () (load-u32 65536) 3)
    (export safe crash)`;
  const typed = memory.lower_memory_program(backend.compiler.compile_ir_string(source, filename));
  const artifact = backend.native.emit_typed_native_memory_artifact(typed, target, {format: 'library'});
  debug = artifact.debug;
  debug.sources = [{id: filename, filename, macroOrigins: []}];
  const crashed = typed.functions.find(fn => fn.name === 'crash');assert(crashed);
  const sites = debug.trapSites.filter(site => site.functionIndex === crashed.index && site.code === 1);
  assert.equal(sites.length, 1, 'the emitted bounds guard identifies the actual native load');
  assert.equal(sites[0].offsetBase, 'code-section');assert.equal(sites[0].returnAddress, false);
  machineFrames = [{address: sites[0].address, offsetBase: 'code-section',
    functionIndex: crashed.index, returnAddress: false}];
  bytes = Uint8Array.from(artifact.bytes);
  library = resolve(directory, target === 'arm64-linux' ? 'debug-options.so' : 'debug-options.dylib');
  await writeFile(library, bytes);
}, 120000);
afterAll(async () => {
  bytes = undefined;debug = undefined;machineFrames = undefined;
  if (directory) await rm(directory, {recursive: true, force: true});
});

function configuration() {
  return {initialPages: 1, maximumPages: 1, nativeTarget: target, trapSites: debug.trapSites};
}
function trap(runtime) {
  let thrown;
  try {runtime.invoke('crash');} catch (error) {thrown = error;}
  assert(thrown instanceof WebAssembly.RuntimeError, 'the actual native bounds trap must cross the loader');
  assert.equal(thrown.message, 'memory access out of bounds');
  assert.deepEqual(thrown.eliscriptFrames, machineFrames);
  assert(Object.isFrozen(thrown.eliscriptFrames));assert(thrown.eliscriptFrames.every(Object.isFrozen));
  return thrown;
}

nativeTest('native omitted undefined and false debug options retain exact traps without source mapping', async () => {
  for (const option of [{}, {debug: undefined}, {debug: false}]) {
    const runtime = await openNativeMemory(library, signatures, {...configuration(), ...option});
    try {
      assert.equal(runtime.byteLength, 65536);assert.equal(runtime.invoke('safe'), 42);
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.equal(Object.hasOwn(trap(runtime), 'eliscriptSourceFrames'), false);
        assert.equal(runtime.invoke('safe'), 42, 'the native context recovers after each exact trap');
      }
    } finally {runtime.close();}
    assert.throws(() => runtime.invoke('safe'), /closed/);
  }
  assert.deepEqual(new Uint8Array(await readFile(library)), bytes, 'debug options do not rewrite the library');
});

nativeTest('native valid debug documents map exact traps using independent snapshots', async () => {
  const supplied = structuredClone(debug), saved = structuredClone(supplied);
  const expected = createCompilerDebugMap(saved).mapFrames(machineFrames);
  assert.equal(expected.length, 1);assert.equal(expected[0].source.function, 'crash');
  assert.equal(expected[0].source.span.filename, filename);assert.equal(expected[0].source.source, filename);
  const options = {...configuration(), debug: supplied};
  const runtime = await openNativeMemory(library, signatures, options);
  assert.deepEqual(supplied, saved);
  supplied.functions.length = 0;supplied.ranges.length = 0;supplied.sources.length = 0;
  supplied.codeSection.size = 0;options.debug = false;
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(trap(runtime).eliscriptSourceFrames, expected);
      assert.equal(runtime.invoke('safe'), 42);
    }
  } finally {runtime.close();}
  assert.deepEqual(debug, saved);
});

nativeTest('native false debug support preserves rejection of all other unsupported documents', async () => {
  for (const value of [null, true, 0, 'false', [], {}]) {
    await assert.rejects(openNativeMemory(library, signatures, {...configuration(), debug: value}), error => {
      assert(error instanceof TypeError);assert.equal(error.message, 'unsupported compiler instruction map');return true;
    });
  }
  const runtime = await openNativeMemory(library, signatures, {...configuration(), debug: false});
  try {
    assert.equal(Object.hasOwn(trap(runtime), 'eliscriptSourceFrames'), false);
    assert.equal(runtime.invoke('safe'), 42);
  } finally {runtime.close();}
});

nativeTest('real Node to Bun native transport preserves false debug exact frames mapping snapshots and recovery', async () => {
  const script = resolve(directory, 'node-debug-options.mjs');
  await writeFile(script, `
import assert from 'node:assert/strict';
import {openNativeMemory} from ${JSON.stringify(new URL('../tools/backends/native-memory.mjs', import.meta.url).href)};
import {createCompilerDebugMap} from ${JSON.stringify(new URL('../tools/backends/compiler-debug.mjs', import.meta.url).href)};
assert.equal(process.versions.bun, undefined);assert.equal(typeof process.versions.v8, 'string');
const library = ${JSON.stringify(library)}, signatures = ${JSON.stringify(signatures)};
const original = ${JSON.stringify(debug)}, machineFrames = ${JSON.stringify(machineFrames)};
const configuration = {initialPages: 1, maximumPages: 1, nativeTarget: ${JSON.stringify(target)},
  trapSites: original.trapSites, bunExecutable: ${JSON.stringify(process.execPath)}};
const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
WebAssembly.Module = function () {throw Error('native debug fixture substituted WASM');};
WebAssembly.Instance = function () {throw Error('native debug fixture substituted WASM');};
function trap(runtime) {
  let thrown;try {runtime.invoke('crash');} catch (error) {thrown = error;}
  assert(thrown instanceof WebAssembly.RuntimeError);assert.equal(thrown.message, 'memory access out of bounds');
  assert.deepEqual(thrown.eliscriptFrames, machineFrames);return thrown;
}
try {
  for (const option of [{}, {debug: undefined}, {debug: false}]) {
    const runtime = await openNativeMemory(library, signatures, {...configuration, ...option});
    try {
      assert.equal(runtime.byteLength, 65536);
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.equal(Object.hasOwn(trap(runtime), 'eliscriptSourceFrames'), false);
        assert.equal(runtime.invoke('safe'), 42);
      }
    } finally {runtime.close();}
    assert.throws(() => runtime.invoke('safe'), /closed/);
  }
  const supplied = structuredClone(original), saved = structuredClone(supplied);
  const expected = createCompilerDebugMap(saved).mapFrames(machineFrames);
  assert.equal(expected[0].source.function, 'crash');
  assert.equal(expected[0].source.span.filename, ${JSON.stringify(filename)});
  const runtime = await openNativeMemory(library, signatures, {...configuration, debug: supplied});
  assert.deepEqual(supplied, saved);
  supplied.functions.length = 0;supplied.ranges.length = 0;supplied.sources.length = 0;supplied.codeSection.size = 0;
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(trap(runtime).eliscriptSourceFrames, expected);
      assert.equal(runtime.invoke('safe'), 42);
    }
  } finally {runtime.close();}
  for (const value of [null, true, 0, 'false', [], {}])
    await assert.rejects(openNativeMemory(library, signatures, {...configuration, debug: value}), error => {
      assert(error instanceof TypeError);assert.equal(error.message, 'unsupported compiler instruction map');return true;
    });
} finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
process.stdout.write('native-debug-options-node-verified\\n');
`);
  const result = spawnSync(process.env.NODE ?? 'node', [script], {cwd: directory, encoding: 'utf8', timeout: 30000,
    env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''}});
  assert.equal(result.error, undefined, result.stderr);assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.stdout, 'native-debug-options-node-verified\n');
}, 30000);
