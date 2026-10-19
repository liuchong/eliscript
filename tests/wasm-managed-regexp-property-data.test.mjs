import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const fixture = 'tests/fixtures/wasm-managed-regexp-property-data.eli';
const options = {maxSlots: 2048, initialBytes: 65536, maxBytes: 1048576, maximumPages: 32};
let directory, backend, rows, aliases, runtimeIR, typed, rawModule, rawNative, managedBytes, managedNative, reference, staticAliases;
const rawSignatures = Object.create(null);
const rowName = id => 'heap-regexp-property-ranges-' + id;
const contains = (ranges, point) => ranges.some(([lo, hi]) => lo <= point && point <= hi);
function points(ranges) {
  const result = new Set([0, 0x10ffff, 0x110000, 0xffffffff]);
  let previous = -1;
  for (const [lo, hi] of ranges) {
    result.add(lo);result.add(hi);
    if (lo) result.add(lo - 1);
    if (hi < 0x10ffff) result.add(hi + 1);
    if (lo > previous + 1) result.add(Math.floor((previous + 1 + lo - 1) / 2));
    previous = hi;
  }
  if (previous < 0x10ffff) result.add(Math.floor((previous + 1 + 0x10ffff) / 2));
  return result;
}
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-property-data-'));
  const declaration = JSON.parse(await readFile('tools/runtime/unicode-property-ranges.json', 'utf8'));
  rows = declaration.rows;
  aliases = JSON.parse(await readFile('tools/runtime/unicode-property-aliases.json', 'utf8')).records;
  assert.equal(rows.length, 519);
  backend = await buildBackends({outputRoot: directory});
  const regexp = await readFile('bootstrap/backends/regexp.eli', 'utf8');
  const aliasStart = regexp.indexOf(';; BEGIN GENERATED UNICODE PROPERTY ALIASES');
  const aliasEnd = regexp.indexOf(';; END GENERATED UNICODE PROPERTY ALIASES', aliasStart);
  assert(aliasStart >= 0 && aliasEnd > aliasStart);
  // The lookup is private in the production backend. Compile its exact real
  // region with a test-only export instead of expanding that public API.
  const aliasProgram = '(module regexp.property-data\n' + regexp.slice(aliasStart, aliasEnd) +
    '\n(export regexp-property-id-base))';
  const aliasJavascript = backend.compiler.emit_ir_string(backend.compiler.compile_ir_string(aliasProgram, 'property-static.eli'));
  staticAliases = await import('data:text/javascript;base64,' + Buffer.from(aliasJavascript).toString('base64'));
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const appended = '\n(defun property-data-alias (heap text start length) (begin-operation) (heap-regexp-property-id-base heap text start length))' +
    '\n(export property-data-alias ' + rows.map(row => rowName(row.id)).join(' ') + ')';
  runtimeIR = backend.compiler.compile_ir_string(source + appended, 'property-runtime.eli');
  const raw = Uint8Array.from(backend.wasm.emit_memory_wasm(runtimeIR, {initialPages: 1, maximumPages: 32}));
  rawModule = new WebAssembly.Module(raw);assert.deepEqual(WebAssembly.Module.imports(rawModule), []);
  for (const name of ['last-error', 'retire', 'runtime-case-version', 'heap-live', 'heap-collect', 'heap-release',
    'heap-pin', 'frame-pop', 'frame-depth', 'buffer-new']) rawSignatures[name] = 1;
  Object.assign(rawSignatures, {'last-error': 0, retire: 0, 'runtime-case-version': 1, 'heap-new': 3,
    'value-number': 3, 'value-data': 3, 'value-string': 2, 'value-unit-set': 4, 'value-seal': 2,
    'heap-pin': 2, 'heap-release': 2, 'frame-new': 2, 'frame-set': 4, 'frame-get': 3, 'frame-pop': 2,
    'property-data-alias': 4});
  for (const row of rows) rawSignatures[rowName(row.id)] = 1;
  const program = backend.compiler.compile_ir_string(await readFile(fixture, 'utf8'), fixture);
  reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
  const lowered = backend.managed.lower_managed_program(program, runtimeIR, true);
  typed = lowered;
  managedBytes = Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32}),
    'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(managedBytes)), []);
  if (target) {
    rawNative = resolve(directory, target === 'arm64-macos' ? 'property-raw.dylib' : 'property-raw.so');
    await writeFile(rawNative, Uint8Array.from(backend.native.emit_native_memory_library(runtimeIR, target)));
    managedNative = resolve(directory, target === 'arm64-macos' ? 'property-managed.dylib' : 'property-managed.so');
    await writeFile(managedNative, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, target)));
  }
}, 120000);
afterAll(async () => {
  typed = runtimeIR = rawModule = undefined;
  if (directory) await rm(directory, {recursive: true, force: true});
});
function rawWasm(module = rawModule) {
  const exports = new WebAssembly.Instance(module).exports;
  return {invoke: (name, ...args) => exports[name](...args) >>> 0,
    read: (at, length) => new Uint8Array(exports.memory.buffer).slice(at, at + length),
    size: () => exports.memory.buffer.byteLength, close() {}};
}
async function rawRuntime(native = false, configuration = {initialPages: 1, maximumPages: 32}) {
  if (!native) return rawWasm();
  const r = await openNativeMemory(rawNative, rawSignatures, {...configuration, nativeTarget: target});
  return {invoke: (name, ...args) => r.invoke(name, ...args) >>> 0,
    read: (at, length) => r.read(at, length), size: () => r.byteLength, close: () => r.close()};
}
function word(r, at) {
  const bytes = r.read(at, 4);return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
}
function string(r, heap, text) {
  const value = r.invoke('value-string', heap, text.length);assert(value > 3);
  for (let i = 0; i < text.length; i++) assert.equal(r.invoke('value-unit-set', heap, value, i, text.charCodeAt(i)), 1);
  assert.equal(r.invoke('value-seal', heap, value), value);return value;
}
async function allRows(native) {
  const r = await rawRuntime(native);
  try {
    r.invoke('runtime-case-version', 0);
    for (const row of rows) {
      assert.match(row.sourceSha256, /^[a-f0-9]{64}$/);
      for (const point of points(row.ranges)) {
        assert.equal(r.invoke(rowName(row.id), point), Number(contains(row.ranges, point)), row.id + '/' + point);
        assert.equal(r.invoke('last-error'), 0);
      }
    }
    const pointer = word(r, 44), cursor = word(r, 0), size = r.size();assert(pointer > 0);
    // Every row has already been observed; changing rows must reuse the same
    // instance-wide buffer, not allocate a table or an object per query/heap.
    const first = r.invoke('heap-new', 16, 2048, 8192), second = r.invoke('heap-new', 16, 2048, 8192);
    assert(first && second);
    const afterHeaps = word(r, 0), afterHeapPages = r.size();
    for (let round = 0; round < 3; round++) for (const row of rows) {
      const point = row.ranges[0]?.[0] ?? 0;
      assert.equal(r.invoke(rowName(row.id), point), Number(contains(row.ranges, point)));
    }
    assert.equal(word(r, 44), pointer);assert.equal(word(r, 0), afterHeaps);assert.equal(r.size(), afterHeapPages);
    assert(r.size() >= size);assert(afterHeaps > cursor);
    assert.equal(r.invoke('heap-live', first), 0);assert.equal(r.invoke('heap-live', second), 0);
    const cacheBefore = [44, 48, 52].map(at => word(r, at)), cursorBefore = word(r, 0);
    assert.equal(r.invoke('retire'), 1);
    assert.deepEqual([44, 48, 52].map(at => word(r, at)), cacheBefore, 'raw immutable-data caches are not heap handles and survive retirement');
    assert.equal(word(r, 0), cursorBefore);
    const row = rows.find(row => row.ranges.length), point = row.ranges[0][0];
    assert.equal(r.invoke(rowName(row.id), point), 1);assert.equal(word(r, 44), pointer);
    assert.equal(word(r, 0), cursorBefore, 'retirement must not allocate another property buffer');
  } finally {r.close();}
}
test('all 519 packed Unicode rows preserve every inclusive endpoint gap scalar limit and alternating cache on WASM', async () => {
  await allRows(false);
}, 120000);
test.skipIf(!target)('all declared property rows retain exact values cache isolation retirement and fixed growth in actual native memory', async () => {
  await allRows(true);
}, 120000);

test('actual complete-runtime lowering stores property intervals as data and keeps every row function below the original engine local limit', () => {
  assert.deepEqual(rows.map(row => row.id), Array.from({length: 519}, (_, index) => index));
  let dataNodes = 0;
  for (const row of rows) {
    const fn = typed.typed.functions.find(fn => fn.name === rowName(row.id));assert(fn, rowName(row.id));
    assert(fn.locals.length <= 20000, fn.name + ' retains the original local-count engine protection');
    const pending = [fn.body], seen = new Set();let count = 0;
    while (pending.length) {
      const node = pending.pop();if (seen.has(node)) continue;seen.add(node);count++;
      if (node.kind === 'memory-data-copy') dataNodes++;
      pending.push(...node.children);
    }
    assert(count < 1000, fn.name + ' must not recreate an interval-sized executable decision tree');
  }
  assert.equal(dataNodes, 519, 'each complete row is a packed data node, never a truncated property table');
});

test('small physical memory rejects first raw-cache allocation without losing caller roots and fresh same-budget execution recovers', async () => {
  const limitedModule = new WebAssembly.Module(Uint8Array.from(backend.wasm.emit_memory_wasm(runtimeIR,
    {initialPages: 1, maximumPages: 1})));
  const largest = rows.reduce((left, right) => left.ranges.length >= right.ranges.length ? left : right);
  for (const native of target ? [false, true] : [false]) {
    const open = () => native ? rawRuntime(true, {initialPages: 1, maximumPages: 1}) : Promise.resolve(rawWasm(limitedModule));
    const r = await open();
    try {
      r.invoke('runtime-case-version', 0);
      const heap = r.invoke('heap-new', 32, 2048, 2048);assert(heap);
      const held = r.invoke('value-number', heap, 0, 0x80000000);assert(held > 3);
      assert.equal(r.invoke('heap-pin', heap, held), 1);
      const frame = r.invoke('frame-new', heap, 1);assert(frame);
      assert.equal(r.invoke('frame-set', heap, frame, 0, held), 1);
      for (let filled = 0; filled < 128; filled++) {
        if (!r.invoke('buffer-new', 1024)) break;
      }
      assert.equal(r.invoke('last-error'), 2);const cursor = word(r, 0);
      assert.equal(word(r, 44), 0);
      assert.equal(r.invoke(rowName(largest.id), largest.ranges[0]?.[0] ?? 0), 0);
      assert.equal(r.invoke('last-error'), 2);assert.equal(word(r, 44), 0);assert.equal(word(r, 0), cursor);
      assert.equal(r.invoke('frame-get', heap, frame, 0), held);
      r.invoke('heap-collect', heap);
      const address = r.invoke('value-data', heap, held, 4), bytes = r.read(address, 8);
      assert(Object.is(new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true), -0));
      assert.equal(r.invoke('frame-depth', heap), 1);
      assert.equal(r.invoke('frame-pop', heap, frame), 1);assert.equal(r.invoke('heap-release', heap, held), 1);
      r.invoke('heap-collect', heap);assert.equal(r.invoke('heap-live', heap), 0);assert.equal(r.invoke('frame-depth', heap), 0);
    } finally {r.close();}
    const recovered = await open();
    try {
      recovered.invoke('runtime-case-version', 0);
      const point = largest.ranges[0]?.[0] ?? 0;
      assert.equal(recovered.invoke(rowName(largest.id), point), Number(contains(largest.ranges, point)));
      assert.equal(recovered.invoke('last-error'), 0);assert(word(recovered, 44) > 0);
    } finally {recovered.close();}
  }
}, 30000);

async function allAliases(native) {
  const r = await rawRuntime(native);r.invoke('runtime-case-version', 0);
  const heap = r.invoke('heap-new', 32, 4096, 1048576);assert(heap);
  const expected = text => {
    const found = aliases.filter(([name, , exact]) => exact ? text === name : text.startsWith(name));
    assert(found.length <= 1, 'declaration has no ambiguous accepted prefix');return found[0]?.[1] ?? 0;
  };
  try {
    for (const [name, id] of aliases) {
      for (const text of new Set([name, name.toLowerCase(), name.toUpperCase(), name + 'x', name.slice(0, -1), '\ud800' + name, name + '\udfff'])) {
        const want = expected(text);
        assert.equal(staticAliases.regexp_property_id_base(text, 0, text.length), want, text);
        const value = string(r, heap, text);
        try {assert.equal(r.invoke('property-data-alias', heap, value, 0, text.length), want, text);}
        finally {r.invoke('heap-collect', heap);}
      }
      assert.equal(expected(name), id);
      for (const [text, start] of [['!' + name + '?', 1], ['😀' + name + '\udfff', 2]]) {
        const value = string(r, heap, text);
        assert.equal(staticAliases.regexp_property_id_base(text, start, name.length), id);
        assert.equal(r.invoke('property-data-alias', heap, value, start, name.length), id);
        r.invoke('heap-collect', heap);
      }
    }
    assert(word(r, 52) > 0);const pointer = word(r, 52);
    const value = string(r, heap, 'ASCII');
    const cursor = word(r, 0);
    for (let repeat = 0; repeat < 64; repeat++) assert.equal(r.invoke('property-data-alias', heap, value, 0, 5), expected('ASCII'));
    assert.equal(word(r, 52), pointer);assert.equal(word(r, 0), cursor, 'repeat lookup allocates no raw table');
    r.invoke('heap-collect', heap);assert.equal(r.invoke('heap-live', heap), 0);
    const peer = r.invoke('heap-new', 32, 4096, 1048576), peerText = string(r, peer, 'ASCII');
    const afterPeer = word(r, 0);
    assert.equal(r.invoke('property-data-alias', peer, peerText, 0, 5), expected('ASCII'));
    assert.equal(word(r, 52), pointer);assert.equal(word(r, 0), afterPeer);
    r.invoke('heap-collect', peer);assert.equal(r.invoke('heap-live', peer), 0);
    assert.equal(r.invoke('retire'), 1);assert.equal(word(r, 52), pointer);
    const fresh = r.invoke('heap-new', 32, 4096, 1048576), freshText = string(r, fresh, 'ASCII');
    const afterFresh = word(r, 0);
    assert.equal(r.invoke('property-data-alias', fresh, freshText, 0, 5), expected('ASCII'));
    assert.equal(word(r, 52), pointer);assert.equal(word(r, 0), afterFresh);
    r.invoke('heap-collect', fresh);assert.equal(r.invoke('heap-live', fresh), 0);
  } finally {r.close();}
}
test('static and dynamic packed aliases retain all IDs offsets UTF16 rejection and case-sensitive prefix boundaries in WASM and native', async () => {
  await allAliases(false);if (target) await allAliases(true);
}, 30000);

function invoke(a, name, values = []) {
  const owned = [], args = values.map(value => {
    if (typeof value !== 'string') return value;
    const handle = a.string(value);owned.push(handle);return handle;
  });
  try {return a.invoke(name, args);} finally {for (const handle of owned) a.release(handle);}
}
function finish(a) {
  try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  finally {a.close?.();}
}
const vectors = [
  ['ASCII', 'u', 'A', true], ['ASCII', 'u', 'Ω', false],
  ['Script=Greek', 'u', 'α', true], ['Script=Greek', 'u', 'A', false],
  ['Lowercase_Letter', 'iu', 'a', true], ['Lowercase_Letter', 'iv', 'a', false],
  ['Letter', 'u', 'K', true], ['ASCII', 'u', '\ud800', false],
];
function pattern(name, flags) {return '^\\' + (flags.includes('i') && name === 'Lowercase_Letter' ? 'P' : 'p') + '{' + name + '}$';}
test('packed data retains static dynamic p/P fold differences selected Unicode profiles roots first errors and recovery in WASM and native', async () => {
  for (const native of target ? [false, true] : [false]) for (const unicodeVersion of [15.1, 16, 17]) {
    const configuration = {...options, unicodeVersion};
    const a = native ? await instantiateNativeManagedRuntime(managedNative, typed, {...configuration, nativeTarget: target})
      : instantiateManagedRuntime(managedBytes, configuration);
    a.auto(1);
    try {
      for (const [name, flags, input, expected] of vectors) {
        const regex = invoke(a, 'make', [pattern(name, flags), flags]);
        try {assert.equal(invoke(a, 'test-value', [regex, input]), expected, name + '/' + flags + '/' + unicodeVersion);}
        finally {a.release(regex);}
      }
      for (const [input, expected] of [['\u1c89', unicodeVersion >= 16], ['\u{1faea}', unicodeVersion >= 17]]) {
        const regex = invoke(a, 'make', ['^\\p{Assigned}$', 'u']);
        try {assert.equal(invoke(a, 'test-value', [regex, input]), expected);}
        finally {a.release(regex);}
      }
      for (const [name, input, expected] of [['literal-ascii', 'A', true], ['literal-greek', 'α', true],
        ['literal-negative', 'a', true], ['literal-negative-v', 'a', false]]) {
        const regex = a.invoke(name);
        try {
          const zero = a.number(-0), frame = a.frame(2);a.frameSet(frame, 0, zero);a.frameSet(frame, 1, regex);
          try {
            a.collect();assert.equal(invoke(a, 'test-value', [regex, input]), expected);
            assert.throws(() => reference.throwing(reference[name.replaceAll('-', '_')]()), error => error === false);
            assert.throws(() => a.invoke('throwing', [regex]), error => error === false);
            assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
            assert.equal(a.invoke('recover'), true);
          } finally {a.leaveFrame(frame);a.release(zero);}
        } finally {a.release(regex);}
      }
      for (const name of ['ascii', 'script=Greek', 'Script=greek', 'Unknown', 'General_Category=unknown'])
        assert.throws(() => invoke(a, 'make', ['\\p{' + name + '}', 'u']), SyntaxError);
    } finally {finish(a);}
  }
}, 120000);

test('independent Node accepts the original complete property alias and literal inputs with exact fold results', () => {
  const inputs = vectors.map(([name, flags, input, expected]) => [pattern(name, flags), flags, input, expected]);
  const child = spawnSync('node', ['--input-type=module', '-e',
    'import assert from "node:assert/strict";for(const[p,f,s,w]of JSON.parse(process.argv[1]))assert.equal(new RegExp(p,f).test(s),w);', JSON.stringify(inputs)],
    {encoding: 'utf8', timeout: 30000});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  for (const [name, flags, input, expected] of vectors) assert.equal(reference.test_value(reference.make(pattern(name, flags), flags), input), expected);
});
