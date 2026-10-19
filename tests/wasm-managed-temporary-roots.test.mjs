import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {temporaryRootSource, temporaryRootOptions, initializeTemporaryRootRuntime,
  exerciseTemporaryRootPressure, exerciseTemporaryRootValues, closeTemporaryRootRuntime} from './helpers/managed-temporary-roots.mjs';

let directory, bytes, reference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-wasm-temporary-roots-'));
  const backend = await buildBackends({outputRoot: directory});
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  const program = backend.compiler.compile_ir_string(temporaryRootSource, 'temporary-roots.eli');
  const lowered = backend.managed.lower_managed_program(program, runtime);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 8});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

test('WASM clears completed initializer and assignment temporaries under the original small capacity and recovers', () => {
  const a = instantiateManagedRuntime(bytes, temporaryRootOptions);
  try {initializeTemporaryRootRuntime(a);exerciseTemporaryRootPressure(a, reference);}
  finally {closeTemporaryRootRuntime(a);}
}, 30000);
test('WASM keeps returned assignment aliases captured cells user temporary bindings and first errors alive through GC', () => {
  const a = instantiateManagedRuntime(bytes, temporaryRootOptions);
  try {initializeTemporaryRootRuntime(a);exerciseTemporaryRootValues(a, reference);}
  finally {closeTemporaryRootRuntime(a);}
}, 30000);
