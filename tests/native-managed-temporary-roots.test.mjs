import {beforeAll, afterAll, test} from 'bun:test';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {temporaryRootSource, temporaryRootOptions, initializeTemporaryRootRuntime,
  exerciseTemporaryRootPressure, exerciseTemporaryRootValues, closeTemporaryRootRuntime} from './helpers/managed-temporary-roots.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const nativeTest = test.skipIf(!target);
let directory, path, lowered, reference;
beforeAll(async () => {
  if (!target) return;
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-temporary-roots-'));
  const backend = await buildBackends({outputRoot: directory});
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  const program = backend.compiler.compile_ir_string(temporaryRootSource, 'temporary-roots.eli');
  lowered = backend.managed.lower_managed_program(program, runtime);
  const bytes = backend.native.emit_typed_native_memory_library(lowered.typed, target);
  path = resolve(directory, target === 'arm64-linux' ? 'temporary-roots.so' : 'temporary-roots.dylib');
  await writeFile(path, Uint8Array.from(bytes));
  reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
async function instance() {
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  try {
    WebAssembly.Module = function () {throw Error('native temporary-root test substituted WASM');};
    WebAssembly.Instance = function () {throw Error('native temporary-root test substituted WASM');};
    return await instantiateNativeManagedRuntime(path, lowered,
      {...temporaryRootOptions, initialPages: 1, maximumPages: 8, nativeTarget: target});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
}
nativeTest('native clears completed initializer and assignment temporaries under the original small capacity and recovers', async () => {
  const a = await instance();
  try {initializeTemporaryRootRuntime(a);exerciseTemporaryRootPressure(a, reference);}
  finally {closeTemporaryRootRuntime(a);}
}, 30000);
nativeTest('native keeps returned assignment aliases captured cells user temporary bindings and first errors alive through GC', async () => {
  const a = await instance();
  try {initializeTemporaryRootRuntime(a);exerciseTemporaryRootValues(a, reference);}
  finally {closeTemporaryRootRuntime(a);}
}, 30000);
