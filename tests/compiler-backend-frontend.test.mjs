import {afterAll, beforeAll, spyOn, test} from 'bun:test';
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import {access, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {backendModules, buildBackends, root} from '../tools/backends/build.mjs';
import {buildIndependentCompiler, compilerMetadataDigest} from '../tools/backends/compiler-build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

let directory, original, compilerModules, runtimeSource;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-supplied-frontend-'));
  original = await buildBackends({outputRoot: resolve(directory, 'original')});
  compilerModules = (await readdir(resolve(root, 'bootstrap/compiler')))
    .filter(name => /^[a-z][a-z0-9-]*[.]eli$/.test(name)).sort().map(name => name.slice(0, -4));
  runtimeSource = await readFile(resolve(root, 'bootstrap/runtime/memory.eli'), 'utf8');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function refuseSeed() {
  return spyOn(childProcess, 'spawnSync').mockImplementation(() => {
    throw new Error('a supplied frontend must not invoke any seed process');
  });
}

async function executeAnswer(runtime) {
  runtime.auto(1);
  const input = runtime.number(41), held = runtime.number(-0), frame = runtime.frame(1);
  runtime.frameSet(frame, 0, held);
  try {
    const value = runtime.invoke('answer', [input]);
    try {assert.equal(runtime.readNumber(value), 42);} finally {runtime.release(value);}
    const negative = runtime.invoke('answer', [false]);
    try {assert(Object.is(runtime.readNumber(negative), -0));} finally {runtime.release(negative);}
    runtime.collect();assert.equal(runtime.stats().frameDepth, 1);assert(Object.is(runtime.readNumber(held), -0));
  } finally {
    runtime.leaveFrame(frame);runtime.release(input);runtime.release(held);
    runtime.closeModule();runtime.collect();
    try {assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);} finally {runtime.close?.();}
  }
}

test('a real supplied frontend emits its closed bootstrap graph and builds isolated out of tree WASM and native products without a seed', async () => {
  const source = '(defvar base 1) (defun answer (value) (if value (+ value base) -0.0)) (export answer)';
  const sources = {entry: 'entry.mjs', modules: [{id: 'entry.mjs', filename: 'virtual/原😀\ud800.eli', source}],
    literalSources: [], runtime: {filename: 'bootstrap/runtime/memory.eli', source: runtimeSource}};
  const inputDigest = compilerMetadataDigest(sources), bootstrapIR = [];
  const guard = refuseSeed();
  try {
    for (const host of ['wasm', 'native']) {
      const calls = [], outputRoot = resolve(directory, 'product-' + host), seedRoot = resolve(outputRoot, 'seed');
      const frontend = {...original.compiler, compile_string_with_source_map(...args) {
        const emission = Reflect.apply(original.compiler.compile_string_with_source_map, original.compiler, args);
        calls.push({args, emission});return emission;
      }};
      const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
      const built = await buildIndependentCompiler({host, frontend, sources, nativeTarget, outputRoot});
      assert.equal(built.provenance.mode, 'seed');assert.equal(built.host, host);
      assert.equal(compilerMetadataDigest(sources), inputDigest, 'the original complete runtime and project stay unchanged');
      const expected = [...compilerModules.map(name => resolve(root, 'bootstrap/compiler', name + '.eli')),
        ...backendModules.map(name => resolve(root, 'bootstrap/backends', name + '.eli'))];
      assert.deepEqual(calls.map(call => call.args[1]), expected, 'every bootstrap dependency precedes every backend in stable order');
      for (let index = 0; index < calls.length; index++) {
        const {args, emission} = calls[index], bootstrap = index < compilerModules.length;
        const name = bootstrap ? compilerModules[index] : backendModules[index - compilerModules.length];
        const output = resolve(seedRoot, bootstrap ? 'bootstrap' : 'backends');
        assert.equal(args[0], await readFile(expected[index], 'utf8'));
        assert.equal(args[2], name + '.mjs');assert.equal(args[3], relative(output, expected[index]));
        assert.equal(await readFile(resolve(output, name + '.mjs'), 'utf8'),
          emission.javascript + '//# sourceMappingURL=' + name + '.mjs.map\n');
        assert.equal(await readFile(resolve(output, name + '.mjs.map'), 'utf8'), emission.sourceMap);
      }
      const ir = await import(pathToFileURL(resolve(seedRoot, 'bootstrap/ir.mjs')).href);
      bootstrapIR.push(ir);
      assert.equal(typeof ir.validate_serializable_program, 'function');
      assert.notStrictEqual(ir, await import(pathToFileURL(resolve(directory, 'original/bootstrap/ir.mjs')).href));
      assert.deepEqual(new Uint8Array(await readFile(built.path)), built.bytes);
      if (host === 'wasm') {
        assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(built.bytes)), []);
        await executeAnswer(instantiateManagedRuntime(built.bytes, {...built.budget,
          initialPages: built.memory.initialPages, maximumPages: built.memory.maximumPages}));
      } else if (process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform)) {
        const Module = WebAssembly.Module, Instance = WebAssembly.Instance;let runtime;
        try {
          WebAssembly.Module = function () {throw Error('native supplied frontend must not substitute WASM');};
          WebAssembly.Instance = function () {throw Error('native supplied frontend must not substitute WASM');};
          runtime = await instantiateNativeManagedRuntime(built.path, built.lowered, {...built.budget,
            initialPages: built.memory.initialPages, maximumPages: built.memory.maximumPages, nativeTarget});
        } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
        await executeAnswer(runtime);
      }
    }
    assert.notStrictEqual(bootstrapIR[0], bootstrapIR[1], 'separate output roots own separate real dependency modules');
    assert.equal(guard.mock.calls.length, 0);
  } finally {guard.mockRestore();}
}, 120000);

test('supplied frontend failures preserve original thrown values and stop at the first ordered compiler or backend file', async () => {
  // These small scheduler emissions are deliberately not a working compiler;
  // the real frontend and complete dependency closure are exercised above.
  const expected = [...compilerModules.map(name => resolve(root, 'bootstrap/compiler', name + '.eli')),
    ...backendModules.map(name => resolve(root, 'bootstrap/backends', name + '.eli'))];
  const guard = refuseSeed();
  try {
    for (const [failureIndex, failure] of [[0, undefined], [2, false], [compilerModules.length + 1, new Error('original compiler failure')]]) {
      const calls = [], outputRoot = resolve(directory, 'failure-' + failureIndex);
      const frontend = {compile_string_with_source_map(source, filename) {
        calls.push(filename);if (calls.length - 1 === failureIndex) throw failure;
        return {javascript: 'export {};\n', sourceMap: '{"version":3}'};
      }};
      await assert.rejects(buildBackends({outputRoot, frontend}), error => error === failure);
      assert.deepEqual(calls, expected.slice(0, failureIndex + 1));
      const failedName = expected[failureIndex].slice(expected[failureIndex].lastIndexOf('/') + 1, -4);
      const failedOutput = resolve(outputRoot, failureIndex < compilerModules.length ? 'bootstrap' : 'backends', failedName + '.mjs');
      await assert.rejects(access(failedOutput), error => error.code === 'ENOENT');
    }
    assert.equal(guard.mock.calls.length, 0);
  } finally {guard.mockRestore();}
});
