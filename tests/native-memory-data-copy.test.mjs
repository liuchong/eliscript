import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
import {createCompilerDebugMap} from '../tools/backends/compiler-debug.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const nativeTest = test.skipIf(!target);
const span = {filename: 'static-copy.eli', start: 12, end: 31, line: 1, column: 13};
let directory, backend, serial = 0;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-data-copy-'));
  backend = await buildBackends({outputRoot: directory});
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

const literal = value => ({kind: 'literal', type: 'u32', value, children: []});
const local = () => ({kind: 'local', type: 'u32', value: 0, children: []});
const sequence = children => ({kind: 'sequence', type: 'u32', value: null, children});
const operation = (value, ...children) => ({kind: 'memory-op', type: 'u32', value, children});
function program(text, address = local()) {
  return {abi: 'memory-u32', filename: span.filename, exports: ['copy', 'outer'], functions: [
    {name: 'copy', index: 0, arity: 1, locals: [{name: 'p', index: 0, type: 'u32'}], span,
      body: {kind: 'memory-data-copy', type: 'u32', value: text, children: [address], span}},
    {name: 'outer', index: 1, arity: 1, locals: [{name: 'p', index: 0, type: 'u32'}], span,
      body: sequence([{kind: 'call', type: 'u32', value: 0, children: [local()]},
        operation('store-u8', literal(1), literal(88))])},
  ]};
}
function utf16(text) {
  const bytes = new Uint8Array(text.length * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return bytes;
}
async function pair(typed, options = {initialPages: 1, maximumPages: 2}, {nativeOnly = false} = {}) {
  const saved = structuredClone(typed);
  const emission = backend.native.emit_typed_native_memory_artifact(typed, target);
  assert.deepEqual(typed, saved, 'native emission preserves the public typed input');
  const file = resolve(directory, `copy-${serial++}.${target === 'arm64-linux' ? 'so' : 'dylib'}`);
  await writeFile(file, Uint8Array.from(emission.bytes));
  const n = await openNativeMemory(file, {copy: 1, outer: 1}, {
    ...options, nativeTarget: target, debug: emission.debug, trapSites: emission.debug.trapSites,
  });
  try {
    const runtimes = [
      {invoke: (name, ...args) => n.invoke(name, ...args), read: (at, length) => n.read(at, length),
        write: (bytes, at = 0) => n.write(bytes, at)},
    ];
    if (!nativeOnly) {
      const bytes = backend.wasm.emit_typed_memory_wasm(typed, options);
      assert.deepEqual(typed, saved, 'WASM emission preserves the public typed input');
      const module = new WebAssembly.Module(Uint8Array.from(bytes));
      assert.deepEqual(WebAssembly.Module.imports(module), []);
      const w = new WebAssembly.Instance(module).exports;
      runtimes.push({invoke: (name, ...args) => w[name](...args) >>> 0,
        read: (at, length) => new Uint8Array(w.memory.buffer).slice(at, at + length),
        write: (bytes, at = 0) => new Uint8Array(w.memory.buffer).set(bytes, at)});
    }
    assert.deepEqual(typed, saved);
    return {n, debug: emission.debug, runtimes};
  } catch (error) {n.close(); throw error;}
}

nativeTest('native memory kernel copies a packed literal from actual source without expanding it into stores', async () => {
  const text = 'table\0😀\ud800\udfff\uffff'.repeat(4096);
  const source = '(import "eliscript:memory32" copy-static-u16 load-u32 store-u32)\n' +
    '(defun copy (address) (copy-static-u16 (progn (store-u32 0 (+ (load-u32 0) 1)) address) ' +
    JSON.stringify(text) + '))\n(export copy)';
  const ir = backend.compiler.compile_ir_string(source, 'native-static-kernel.eli'), saved = JSON.stringify(ir);
  const bytes = Uint8Array.from(backend.native.emit_native_memory_library(ir, target));
  assert.equal(JSON.stringify(ir), saved);
  assert(bytes.length < text.length * 2 + 65536, 'packed data remains data in a source-generated native library');
  const file = resolve(directory, 'kernel-' + serial++ + (target === 'arm64-linux' ? '.so' : '.dylib'));
  await writeFile(file, bytes);
  const runtime = await openNativeMemory(file, {copy: 1}, {initialPages: 4, maximumPages: 4, nativeTarget: target});
  try {
    const expected = utf16(text), counter = () => {
      const bytes = runtime.read(0, 4);return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    };
    assert.equal(runtime.invoke('copy', 64), 0);assert.deepEqual(runtime.read(64, expected.length), expected);
    assert.equal(counter(), 1);
    runtime.write(new Uint8Array(expected.length).fill(0x97), 64);
    assert.equal(runtime.invoke('copy', 64), 0);assert.deepEqual(runtime.read(64, expected.length), expected);
    assert.equal(counter(), 2);
    const end = 4 * 65536 - 4;runtime.write(Uint8Array.of(0x91, 0x91, 0x91, 0x91), end);
    assert.throws(() => runtime.invoke('copy', end));
    assert.deepEqual([...runtime.read(end, 4)], [0x91, 0x91, 0x91, 0x91]);assert.equal(counter(), 3);
    assert.equal(runtime.invoke('copy', 64), 0);assert.deepEqual(runtime.read(64, expected.length), expected);
  } finally {runtime.close();}
});

test('native static UTF16 data retains exact source units, deterministic images and input on both targets', () => {
  const text = '\0A\ud800B\udfff\ud83d\ude80\uffff', typed = program(text), saved = structuredClone(typed);
  for (const platform of ['arm64-macos', 'arm64-linux']) {
    const artifact = backend.native.emit_typed_native_memory_artifact(typed, platform, {format: 'object'});
    assert.deepEqual(artifact.bytes,
      backend.native.emit_typed_native_memory_artifact(typed, platform, {format: 'object'}).bytes);
    const ranges = artifact.debug.ranges.filter(range => range.kind === 'static-data');
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].dataKind, 'utf16le');
    const bytes = Uint8Array.from(artifact.bytes), start = artifact.debug.codeSection.fileOffset + ranges[0].start;
    assert.deepEqual(bytes.slice(start, start + text.length * 2), utf16(text));
    const copy = artifact.debug.ranges.find(range => range.kind === 'memory-data-copy');
    assert.deepEqual(copy.span, span);
    assert(copy.start < ranges[0].start && copy.end > ranges[0].end);
    assert(artifact.debug.trapSites.some(site => site.code === 1 && site.functionIndex === 0));
    const map = createCompilerDebugMap(artifact.debug);
    assert.deepEqual(map.lookup(copy.start).span, span);
    assert.deepEqual(typed, saved);
  }
});

test('native static copy rejects malformed typed data and addresses without rewriting input', () => {
  const changes = [node => {node.value = 42;}, node => {node.type = 'i32';},
    node => {node.children = [];}, node => {node.children.push(local());},
    node => {node.children[0] = {...literal(0), type: 'f64'};},
    node => {node.children[0] = {...local(), type: 'i32'};}];
  for (const change of changes) for (const platform of ['arm64-macos', 'arm64-linux']) {
    const typed = program('x'); change(typed.functions[0].body); const saved = structuredClone(typed);
    assert.throws(() => backend.native.emit_typed_native_memory_object(typed, platform),
      error => error.eliscriptDiagnostic?.code === 'ELI-B0001');
    assert.deepEqual(typed, saved);
  }
});

nativeTest('static UTF16 copy is exact, unaligned, bounded and reusable after destination mutation', async () => {
  for (const text of ['', 'A', '\0\ud800\udfff\ud83d\ude80\uffff']) {
    const {n, runtimes} = await pair(program(text));
    try {
      const bytes = utf16(text);
      for (const runtime of runtimes) {
        for (const at of [0, 1, 3, 65536 - bytes.length]) {
          assert.equal(runtime.invoke('copy', at), 0);
          assert.deepEqual(runtime.read(at, bytes.length), bytes);
          runtime.write(new Uint8Array(bytes.length).fill(0xa5), at);
          assert.equal(runtime.invoke('copy', at), 0);
          assert.deepEqual(runtime.read(at, bytes.length), bytes);
        }
        runtime.write(Uint8Array.of(21, 22, 23, 24), 65532);
        for (const at of [65537 - bytes.length, 65537, 0xfffffffe, 0xffffffff]) {
          assert.throws(() => runtime.invoke('copy', at), WebAssembly.RuntimeError);
          assert.deepEqual(runtime.read(65532, 4), Uint8Array.of(21, 22, 23, 24));
        }
        runtime.write(Uint8Array.of(0), 1);
        assert.throws(() => runtime.invoke('outer', 65537), WebAssembly.RuntimeError);
        assert.equal(runtime.read(1, 1)[0], 0);
      }
    } finally {n.close();}
  }
});

nativeTest('copy destination effects occur once and use current memory after growth, with original trap propagation', async () => {
  const address = sequence([operation('store-u32', literal(8),
    {kind: 'word-arithmetic', type: 'u32', value: '+', children: [operation('load-u32', literal(8)), literal(1)]}), local()]);
  const single = await pair(program('ab', address));
  try {
    for (const runtime of single.runtimes) {
      assert.equal(runtime.invoke('copy', 33), 0);
      assert.equal(new DataView(runtime.read(8, 4).buffer).getUint32(0, true), 1);
      assert.deepEqual(runtime.read(33, 4), utf16('ab'));
      assert.throws(() => runtime.invoke('copy', 65535), WebAssembly.RuntimeError);
      assert.equal(new DataView(runtime.read(8, 4).buffer).getUint32(0, true), 2);
    }
  } finally {single.n.close();}
  const grown = await pair(program('grown', sequence([operation('memory-grow', literal(1)), literal(65537)])));
  try {
    for (const runtime of grown.runtimes) {
      assert.equal(runtime.invoke('copy', 0), 0);
      assert.deepEqual(runtime.read(65537, 10), utf16('grown'));
    }
  } finally {grown.n.close();}
  const trapped = await pair(program('ab', sequence([operation('load-u8', literal(65536)), local()])));
  try {
    for (const runtime of trapped.runtimes) {
      runtime.write(Uint8Array.of(9, 8, 7, 6), 33);
      assert.throws(() => runtime.invoke('copy', 33), WebAssembly.RuntimeError);
      assert.deepEqual(runtime.read(33, 4), Uint8Array.of(9, 8, 7, 6));
    }
  } finally {trapped.n.close();}
});

nativeTest('native empty static data validates zero-page bounds while WASM retains its declared page minimum', async () => {
  const typed = program(''), options = {initialPages: 0, maximumPages: 0}, saved = structuredClone(typed);
  // The WASM backend's existing configuration contract starts at one page.
  // Its exact empty-copy end boundary is exercised in the paired test above.
  assert.throws(() => backend.wasm.emit_typed_memory_wasm(typed, options),
    error => error.eliscriptDiagnostic?.code === 'ELI-B0001' &&
      error.message === 'memory32 requires 1 <= initialPages <= maximumPages <= 65535');
  assert.deepEqual(typed, saved);
  const {n, runtimes, debug} = await pair(typed, options, {nativeOnly: true});
  try {
    assert.equal(debug.ranges.filter(range => range.kind === 'static-data').length, 0);
    for (const runtime of runtimes) {
      assert.equal(runtime.invoke('copy', 0), 0);
      for (const at of [1, 65536, 0xffffffff])
        assert.throws(() => runtime.invoke('copy', at), WebAssembly.RuntimeError);
    }
  } finally {n.close();}
});

nativeTest('large static sources cross ADR range through bounded read-only blocks without expanding typed IR', async () => {
  const text = ('ab\ud800\0\udfff\ud83d\ude80').repeat(80000) + 'z';
  const typed = program(text), byteLength = text.length * 2, pages = Math.ceil((byteLength + 8) / 65536);
  const copy = typed.functions[0].body;
  // The true arm exceeds a conditional branch's direct displacement. Its
  // relaxation must not change any local ADR-to-constant distance inside it.
  typed.functions[0].body = {kind: 'if', type: 'u32', value: null, children: [
    {kind: 'word-compare', type: 'i32', value: '/=', children: [local(), literal(0)]}, copy, literal(7),
  ]};
  const {n, runtimes, debug} = await pair(typed, {initialPages: pages, maximumPages: pages});
  try {
    const blocks = debug.ranges.filter(range => range.kind === 'static-data');
    assert(blocks.length > 32);
    assert(blocks.every(range => range.end - range.start <= 32768));
    assert(debug.codeSection.size < byteLength + blocks.length * 128 + 4096);
    assert.equal(copy.children.length, 1);
    const expected = utf16(text);
    for (const runtime of runtimes) {
      assert.equal(runtime.invoke('copy', 0), 7);
      assert.equal(runtime.invoke('copy', 3), 0);
      assert.deepEqual(runtime.read(3, expected.length), expected);
      runtime.write(Uint8Array.of(1, 2, 3, 4), 3);
      assert.equal(runtime.invoke('copy', 3), 0);
      assert.deepEqual(runtime.read(3, expected.length), expected);
    }
  } finally {n.close();}
}, 30000);
