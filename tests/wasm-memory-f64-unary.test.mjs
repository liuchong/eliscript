import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';

const names = ['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt'];
const nativeTarget = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const options = {initialPages: 1, maximumPages: 1};
const increment = digit => `(store-u32 0 (+ (* (load-u32 0) 10) ${digit}))`;
const source = '(import "eliscript:memory32" load-u32 store-u32 load-f64 store-f64 ' +
  names.map(name => 'f64-' + name).join(' ') + ')\n' +
  '(defun write_word (address value) (store-u32 address value))\n' +
  '(defun read_word (address) (load-u32 address))\n' +
  names.map(name => `(defun ${name} (to from) (store-f64 to (f64-${name} (load-f64 from))))\n` +
    `(defun effect_${name} (to from) (store-f64 (progn ${increment(1)} to) ` +
    `(f64-${name} (progn ${increment(2)} (load-f64 from)))))`).join('\n') +
  '\n(export write_word read_word ' + names.flatMap(name => [name, 'effect_' + name]).join(' ') + ')';
let directory, backend, module, wasmFile, native;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-f64-unary-'));
  backend = await buildBackends({outputRoot: directory});
  const ir = backend.compiler.compile_ir_string(source, 'f64-unary.eli'), saved = JSON.stringify(ir);
  const bytes = Uint8Array.from(backend.wasm.emit_memory_wasm(ir, options));
  module = new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module), []);
  wasmFile = resolve(directory, 'unary.wasm');await writeFile(wasmFile, bytes);
  if (nativeTarget) {
    const library = resolve(directory, nativeTarget === 'arm64-macos' ? 'unary.dylib' : 'unary.so');
    await writeFile(library, Uint8Array.from(backend.native.emit_native_memory_library(ir, nativeTarget)));
    native = await openNativeMemory(library, {write_word: 2, read_word: 1,
      ...Object.fromEntries(names.flatMap(name => [[name, 2], ['effect_' + name, 2]]))},
    {...options, nativeTarget});
  }
  assert.equal(JSON.stringify(ir), saved, 'both real emitters preserve the complete source IR');
}, 120000);
afterAll(async () => {try {native?.close();} finally {if (directory) await rm(directory, {recursive: true, force: true});}});

function nearestEven(value) {
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) >= 2 ** 52) return value;
  const magnitude = Math.abs(value), lower = Math.floor(magnitude), fraction = magnitude - lower;
  const rounded = fraction > .5 || (fraction === .5 && lower % 2 !== 0) ? lower + 1 : lower;
  return value < 0 ? -rounded : rounded;
}
function expectedUnary(name, value) {
  if (name === 'neg') return -value;
  if (name === 'nearest') return nearestEven(value);
  return Math[name](value);
}
function samples() {
  const words = [], bytes = new DataView(new ArrayBuffer(8));
  for (const bits of [0n, 0x8000000000000000n, 1n, 0x8000000000000001n,
    0x000fffffffffffffn, 0x800fffffffffffffn, 0x0010000000000000n, 0x8010000000000000n,
    0x7fefffffffffffffn, 0xffefffffffffffffn, 0x7ff0000000000000n, 0xfff0000000000000n,
    0x7ff8000012345678n, 0xfff80000abcdef01n, 0x7ff0000012345678n, 0xfff0000000000001n]) {
    bytes.setBigUint64(0, bits, true);words.push([bytes.getUint32(0, true), bytes.getUint32(4, true)]);
  }
  for (const value of [-4.5, -3.5, -2.5, -1.5, -.5, .5, 1.5, 2.5, 3.5, 4.5,
    2 ** 52 - .5, -(2 ** 52 - .5), 2 ** 52, -(2 ** 52), 1, 2, 4, .1]) {
    bytes.setFloat64(0, value, true);const bits = bytes.getBigUint64(0, true);
    for (const neighbor of [bits - 1n, bits, bits + 1n]) {
      bytes.setBigUint64(0, neighbor, true);words.push([bytes.getUint32(0, true), bytes.getUint32(4, true)]);
    }
  }
  let state = 0x716a3f29;
  const next = () => {state ^= state << 13;state ^= state >>> 17;state ^= state << 5;return state >>> 0;};
  for (let index = 0; index < 512; index++) words.push([next(), next()]);
  return words;
}
function wasmRuntime(module) {
  const exports = new WebAssembly.Instance(module).exports;
  return {invoke(name, ...args) {return exports[name](...args) >>> 0;}};
}
function readFloat(runtime, address) {
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, runtime.invoke('read_word', address), true);
  view.setUint32(4, runtime.invoke('read_word', address + 4), true);
  return view.getFloat64(0, true);
}
function checkUnary(runtime, cases) {
  const view = new DataView(new ArrayBuffer(8));
  for (const [low, high] of cases) {
    runtime.invoke('write_word', 64, low);runtime.invoke('write_word', 68, high);
    view.setUint32(0, low, true);view.setUint32(4, high, true);const input = view.getFloat64(0, true);
    for (const name of names) {
      assert.equal(runtime.invoke(name, 128, 64), 0);
      const actual = readFloat(runtime, 128), expected = expectedUnary(name, input);
      assert(Number.isNaN(expected) ? Number.isNaN(actual) : Object.is(actual, expected),
        name + ' input words ' + low.toString(16) + ':' + high.toString(16));
      assert.equal(runtime.invoke('read_word', 64), low);
      assert.equal(runtime.invoke('read_word', 68), high, 'input NaN payloads and all IEEE bits remain untouched');
    }
  }
}
function checkEffects(runtime) {
  // 1.5 is passed only as two linear-memory words, never as a host f64 ABI argument.
  runtime.invoke('write_word', 64, 0);runtime.invoke('write_word', 68, 0x3ff80000);
  for (const name of names) {
    runtime.invoke('write_word', 0, 0);
    runtime.invoke('write_word', 24, 0xcafebabe);
    assert.equal(runtime.invoke('effect_' + name, 128, 64), 0);
    assert.equal(runtime.invoke('read_word', 0), 12, 'destination then exactly one unary operand');
    assert(Object.is(readFloat(runtime, 128), expectedUnary(name, 1.5)));
    assert.equal(runtime.invoke('read_word', 24), 0xcafebabe);
    for (const [to, from] of [[128, 65532], [65532, 64]]) {
      runtime.invoke('write_word', 0, 0);
      runtime.invoke('write_word', 128, 0x11223344);runtime.invoke('write_word', 132, 0x55667788);
      assert.throws(() => runtime.invoke('effect_' + name, to, from), WebAssembly.RuntimeError);
      assert.equal(runtime.invoke('read_word', 0), 12);
      assert.equal(runtime.invoke('read_word', 128), 0x11223344);
      assert.equal(runtime.invoke('read_word', 132), 0x55667788);
      runtime.invoke('write_word', 0, 0);
      assert.equal(runtime.invoke('effect_' + name, 128, 64), 0);
      assert.equal(runtime.invoke('read_word', 0), 12);
      assert(Object.is(readFloat(runtime, 128), expectedUnary(name, 1.5)), 'the same instance recovers after a trap');
    }
  }
}

test('all seven memory32 f64 unary operations preserve IEEE results and source words in real zero-import WASM', () => {
  checkUnary(wasmRuntime(module), samples());
});
test.skipIf(!nativeTarget)('all seven f64 unary operations execute actual native code against the independent IEEE oracle', () => {
  checkUnary(native, samples());
});
test('unary operands execute once after the destination and preserve traps effects and recovery in both backends', () => {
  checkEffects(wasmRuntime(module));if (native) checkEffects(native);
});
test('every f64 unary family member rejects missing extra word operands and word destinations before emission', () => {
  for (const name of names) for (const expression of [`(f64-${name})`,
    `(f64-${name} (load-f64 0) (load-f64 8))`, `(f64-${name} 1)`]) {
    const text = `(import "eliscript:memory32" load-f64 store-f64 f64-${name}) ` +
      `(defun bad () (store-f64 0 ${expression})) (export bad)`;
    const ir = backend.compiler.compile_ir_string(text, 'f64-unary-invalid.eli'), saved = JSON.stringify(ir);
    for (const emit of [value => backend.wasm.emit_memory_wasm(value, options),
      value => backend.native.emit_native_memory_object(value, 'arm64-macos')]) {
      assert.throws(() => emit(ir), error => {
        assert.equal(error.eliscriptDiagnostic?.code, 'ELI-B0001');
        assert.equal(error.eliscriptDiagnostic?.phase, 'memory-backend');
        assert.equal(error.eliscriptDiagnostic?.location.file, 'f64-unary-invalid.eli');return true;
      });
      assert.equal(JSON.stringify(ir), saved);
    }
  }
  for (const name of names) {
    const ir = backend.compiler.compile_ir_string(`(import "eliscript:memory32" load-f64 store-u32 f64-${name}) ` +
      `(defun bad () (store-u32 0 (f64-${name} (load-f64 8)))) (export bad)`, 'f64-unary-invalid.eli');
    for (const emit of [value => backend.wasm.emit_memory_wasm(value, options),
      value => backend.native.emit_native_memory_object(value, 'arm64-macos')])
      assert.throws(() => emit(ir), error => error.eliscriptDiagnostic?.code === 'ELI-B0001' &&
        error.eliscriptDiagnostic?.phase === 'memory-backend');
  }
});
test('independent Node executes the same WASM bytes with ties-even IEEE random payload and trap-order assertions', () => {
  const script = `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {names,cases}=JSON.parse(readFileSync(0,'utf8'));
const module=new WebAssembly.Module(readFileSync(process.argv[1]));
assert.deepEqual(WebAssembly.Module.imports(module),[]);
${nearestEven.toString()}
${expectedUnary.toString()}
${wasmRuntime.toString()}
${readFloat.toString()}
${checkUnary.toString()}
${checkEffects.toString()}
const runtime=wasmRuntime(module);checkUnary(runtime,cases);checkEffects(runtime);
process.stdout.write(JSON.stringify({cases:cases.length,operations:names.length}));`;
  const cases = samples(), child = spawnSync(process.env.NODE ?? 'node',
    ['--input-type=module', '--eval', script, wasmFile], {
      encoding: 'utf8', input: JSON.stringify({names, cases}), timeout: 30000, maxBuffer: 65536,
    });
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {cases: cases.length, operations: names.length});
}, 30000);
