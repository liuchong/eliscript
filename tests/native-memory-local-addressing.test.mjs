import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const slots = [3, 31, 32, 510, 511];
const words = [0, 1, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xfedcba98, 0xffffffff];
const signedWords = [-1, -2147483648, 2147483647];
const payloads = [0n, 0x8000000000000000n, 0x7ff8000012345678n,
  0x7ff0000012345678n, 0xfff0000000000000n, 1n];
const span = {filename: 'local-addressing.eli', start: 0, end: 1, line: 1, column: 1};
const node = (kind, type, value, children = []) => ({kind, type, value, children, span});
const literal = value => node('literal', 'u32', value);
const local = (index, type = 'u32') => node('local', type, index);
const set = (index, type, value) => node('set', type, index, [value]);
const operation = (name, ...children) => node('memory-op', name === 'load-f64' ? 'f64' : 'u32', name, children);
const add = (left, right) => node('word-arithmetic', 'u32', '+', [left, right]);
const address = (parameter, offset) => add(local(parameter), literal(offset));
const sequence = children => node('sequence', 'u32', null, children);
let directory, backend;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-locals-'));
  backend = await buildBackends({outputRoot: directory});
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

test('native word SHA256 hashes exact little-endian words without copying or changing input', () => {
  for (const length of [0, 1, 13, 14, 15, 16, 17, 31, 32, 33, 4096]) {
    const input = Object.freeze(Array.from({length}, (_, i) =>
      (words[i % words.length] ^ Math.imul(i, 0x9e3779b9)) >>> 0));
    const saved = [...input], bytes = Buffer.alloc(length * 4), reads = [];
    for (const [i, value] of input.entries()) bytes.writeUInt32LE(value, i * 4);
    const observed = new Proxy(input, {get(target, key, receiver) {
      if (key === 'slice' || key === 'map' || key === 'flatMap')
        throw new Error('word hashing must not make a whole-input copy');
      if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) reads.push(Number(key));
      return Reflect.get(target, key, receiver);
    }});
    const expected = new Uint8Array(createHash('sha256').update(bytes).digest());
    assert.deepEqual(Uint8Array.from(backend.sha256.sha256_words_le(observed)), expected, 'word count ' + length);
    assert.deepEqual(reads, Array.from({length}, (_, i) => i), 'each original word is observed once in order');
    assert.deepEqual(input, saved);
    const originalBytes = [...bytes], byteSnapshot = [...originalBytes];
    assert.deepEqual(Uint8Array.from(backend.sha256.sha256_bytes(originalBytes)), expected);
    assert.deepEqual(originalBytes, byteSnapshot, 'existing byte hashing still owns its slice snapshot');
  }
});

function program() {
  // These are actual public typed slots, not large generated source fixtures.
  // In particular 31/32 and 510/511 straddle the signed unscaled and SUB-immediate limits.
  const functions = ['u32', 'i32', 'f64'].map((type, index) => {
    const width = type === 'f64' ? 8 : 4;
    const locals = Array.from({length: 512}, (_, slot) => ({name: 'slot' + slot, index: slot,
      type: slots.includes(slot) ? type : 'u32'}));
    const call = indirect => node(indirect ? 'call-indirect' : 'call', 'u32', indirect ? 9 : 3,
      [local(0), local(1), ...[0xffffffff, 0x80000000, 0x10000, 0xffff, 7, 8, 9].map(literal),
        ...(indirect ? [literal(0)] : [])]);
    return {name: 'transfer_' + type, index, arity: 2, locals, span, body: sequence([
      ...slots.map((slot, i) => set(slot, type, operation(type === 'f64' ? 'load-f64' : 'load-u32', address(0, i * width)))),
      call(false),
      operation(type === 'f64' ? 'store-f64' : 'store-u32', local(1), local(3, type)),
      set(3, type, local(31, type)), set(31, type, local(511, type)),
      set(511, type, local(32, type)), set(32, type, local(510, type)), set(510, type, local(3, type)),
      call(true),
      ...slots.map((slot, i) => operation(type === 'f64' ? 'store-f64' : 'store-u32',
        address(1, (i + 1) * width), local(slot, type))),
      // A nontrivial RHS must retain the normal expression-stack fallback.
      add(operation('load-u32', literal(64)), operation('load-u32', literal(64))),
    ])};
  });
  const locals = Array.from({length: 512}, (_, index) => ({name: 'scratch' + index, index, type: 'u32'}));
  functions.push({name: 'clobber', index: 3, arity: 9, locals, span, body: sequence([
    ...slots.map((slot, i) => set(slot, 'u32', literal(words[i + 3]))),
    operation('store-u32', literal(64), add(operation('load-u32', literal(64)), literal(1))),
    add(local(7), local(8)),
  ])});
  functions.push({name: 'constants', index: 4, arity: 1,
    locals: [{name: 'out', index: 0, type: 'u32'}, {name: 'boolean', index: 1, type: 'i32'}], span,
    body: sequence([
      ...words.map((value, i) => operation('store-u32', address(0, i * 4), literal(value))),
      ...[0, 1].flatMap((value, i) => [set(1, 'i32', node('literal', 'i32', value)),
        operation('store-u32', address(0, (words.length + i) * 4), local(1, 'i32'))]),
      ...[-0, NaN, Infinity, -Infinity, Number.MIN_VALUE].map((value, i) =>
        operation('store-f64', address(0, 48 + i * 8), node('literal', 'f64', value))),
      ...['literal', 'int-literal'].flatMap((kind, row) => signedWords.flatMap((value, i) => [
        set(1, 'i32', node(kind, 'i32', value)),
        operation('store-u32', address(0, 88 + row * 12 + i * 4), local(1, 'i32'))])),
      literal(0),
    ])});
  const trace = digit => node('call', 'u32', 6, [literal(digit)]);
  functions.push({name: 'effects', index: 5, arity: 2,
    locals: [{name: 'address', index: 0, type: 'u32'}, {name: 'branch', index: 1, type: 'u32'},
      {name: 'counter', index: 2, type: 'u32'}], span, body: sequence([
      operation('store-u32', literal(4096), literal(0)), set(2, 'u32', literal(0)),
      node('if', 'u32', null, [node('word-compare', 'i32', '/=', [local(1), literal(0)]),
        sequence([trace(1), literal(0xffffffff)]), sequence([trace(2), literal(0x80000000)])]),
      add(trace(3), trace(4)),
      // A discarded read can trap; subsequent loop/call writes must not run.
      operation('load-u32', local(0)),
      node('while', 'u32', null, [node('word-compare', 'i32', '<', [local(2), literal(3)]),
        sequence([set(2, 'u32', add(local(2), literal(1))), trace(6),
          add(literal(0xffffffff), literal(2))])]),
      trace(7), local(2),
    ])});
  functions.push({name: 'record_trace', index: 6, arity: 1,
    locals: [{name: 'digit', index: 0, type: 'u32'}], span, body: sequence([
      operation('store-u32', literal(4096), add(
        node('word-arithmetic', 'u32', '*', [operation('load-u32', literal(4096)), literal(10)]), local(0))),
      local(0),
    ])});
  return {abi: 'memory-u32', filename: span.filename, exports: functions.map(f => f.name),
    table: [3], indirectArities: [9], functions};
}

test.skipIf(!target)('native FP-slot boundaries preserve words, IEEE payloads and caller values against real WASM', async () => {
  const typed = program(), saved = structuredClone(typed), options = {initialPages: 1, maximumPages: 1};
  const wasmBytes = backend.wasm.emit_typed_memory_wasm(typed, options);
  const wasmModule = new WebAssembly.Module(Uint8Array.from(wasmBytes));
  assert.deepEqual(WebAssembly.Module.imports(wasmModule), []);
  const w = new WebAssembly.Instance(wasmModule).exports;
  // Both native object targets also exercise fixed-width indirect-table patching.
  for (const platform of ['arm64-macos', 'arm64-linux']) {
    const first = backend.native.emit_typed_native_memory_artifact(typed, platform, {format: 'object'});
    assert.deepEqual(first.bytes, backend.native.emit_typed_native_memory_artifact(typed, platform, {format: 'object'}).bytes);
    assert.deepEqual(typed, saved);
  }
  const emission = backend.native.emit_typed_native_memory_artifact(typed, target);
  const path = resolve(directory, 'locals.' + (target === 'arm64-linux' ? 'so' : 'dylib'));
  await writeFile(path, Uint8Array.from(emission.bytes));
  const signatures = Object.fromEntries(typed.functions.map(f => [f.name, f.arity]));
  const n = await openNativeMemory(path, signatures, {...options, nativeTarget: target,
    debug: emission.debug, trapSites: emission.debug.trapSites});
  try {
    const runtimes = [
      {invoke: (name, ...args) => n.invoke(name, ...args), write: (bytes, at) => n.write(bytes, at), read: (at, length) => n.read(at, length)},
      {invoke: (name, ...args) => w[name](...args) >>> 0,
        write: (bytes, at) => new Uint8Array(w.memory.buffer).set(bytes, at),
        read: (at, length) => new Uint8Array(w.memory.buffer).slice(at, at + length)},
    ];
    for (const type of ['u32', 'i32', 'f64']) {
      const width = type === 'f64' ? 8 : 4, source = new Uint8Array(5 * width), view = new DataView(source.buffer);
      for (let i = 0; i < 5; i++) {
        if (type === 'f64') view.setBigUint64(i * width, payloads[i + 1], true);
        else view.setUint32(i * width, words[i + 3], true);
      }
      const expected = new Uint8Array(6 * width);
      for (const [i, from] of [0, 1, 4, 3, 1, 2].entries()) expected.set(source.subarray(from * width, (from + 1) * width), i * width);
      for (const [from, to] of [[128, 512], [128, 128 + width], [65536 - source.length, 65536 - expected.length]]) {
        for (const runtime of runtimes) {
          runtime.write(new Uint8Array(65536).fill(0xa5), 0);
          runtime.write(new Uint8Array(4), 64);runtime.write(source, from);
          const unrelated = runtime.read(4096, 32);
          assert.equal(runtime.invoke('transfer_' + type, from, to), 4, type + '/call count');
          assert.deepEqual(runtime.read(to, expected.length), expected, type + '/exact local payloads');
          assert.deepEqual(runtime.read(4096, 32), unrelated, type + '/unrelated heap survives calls');
          assert.equal(new DataView(runtime.read(64, 4).buffer).getUint32(0, true), 2);
        }
        assert.deepEqual(n.read(to, expected.length), new Uint8Array(w.memory.buffer).slice(to, to + expected.length));
      }
      for (const runtime of runtimes) {
        runtime.write(new Uint8Array(4), 64);
        const before = runtime.read(4096, 32);
        assert.throws(() => runtime.invoke('transfer_' + type, 65536 - source.length + 1, 512), WebAssembly.RuntimeError);
        assert.equal(new DataView(runtime.read(64, 4).buffer).getUint32(0, true), 0, 'invalid source traps before calls');
        assert.deepEqual(runtime.read(4096, 32), before);
        runtime.write(source, 128);
        assert.throws(() => runtime.invoke('transfer_' + type, 128, 65536 - expected.length + 1), WebAssembly.RuntimeError);
        assert.equal(new DataView(runtime.read(64, 4).buffer).getUint32(0, true), 2, 'invalid final store preserves both prior calls');
        assert.deepEqual(runtime.read(4096, 32), before);
        runtime.write(new Uint8Array(4), 64);
        assert.equal(runtime.invoke('transfer_' + type, 128, 512), 4, 'same instance recovers after trap');
        assert.deepEqual(runtime.read(512, expected.length), expected);
      }
    }
    for (const runtime of runtimes) {
      assert.equal(runtime.invoke('constants', 1024), 0);
      const view = new DataView(runtime.read(1024, 112).buffer);
      for (const [i, value] of [...words, 0, 1].entries()) assert.equal(view.getUint32(i * 4, true), value);
      for (const [i, value] of [-0, NaN, Infinity, -Infinity, Number.MIN_VALUE].entries())
        assert(Object.is(view.getFloat64(48 + i * 8, true), value), 'literal ' + i);
      for (const offset of [88, 100]) for (const [i, value] of signedWords.entries()) {
        assert.equal(view.getInt32(offset + i * 4, true), value, 'signed literal ' + value);
        assert.equal(view.getUint32(offset + i * 4, true), [0xffffffff, 0x80000000, 0x7fffffff][i]);
      }
      for (const offset of [1112, 1124]) assert.deepEqual(runtime.read(offset, 12), Uint8Array.of(
        0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0x80, 0xff, 0xff, 0xff, 0x7f));
    }
    assert.deepEqual(n.read(1024, 112), new Uint8Array(w.memory.buffer).slice(1024, 1136));
    for (const runtime of runtimes) {
      const traceValue = () => new DataView(runtime.read(4096, 4).buffer).getUint32(0, true);
      for (const branch of [0, 1]) {
        const firstDigit = branch ? 1 : 2;
        assert.equal(runtime.invoke('effects', 0, branch), 3, 'discarded loop still updates its local');
        assert.equal(traceValue(), firstDigit * 1000000 + 346667,
          'discarded branch, both operands and each loop call retain source order');
        assert.throws(() => runtime.invoke('effects', 65535, branch), WebAssembly.RuntimeError,
          'discarded load still checks bounds');
        assert.equal(traceValue(), firstDigit * 100 + 34, 'trap prevents every following write');
        assert.equal(runtime.invoke('effects', 0, branch), 3, 'same instance recovers after discarded-load trap');
        assert.equal(traceValue(), firstDigit * 1000000 + 346667);
      }
    }
    assert.deepEqual(n.read(4096, 4), new Uint8Array(w.memory.buffer).slice(4096, 4100));
    assert.deepEqual(typed, saved);
  } finally {n.close();}
});
