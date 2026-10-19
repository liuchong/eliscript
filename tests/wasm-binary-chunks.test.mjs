import {afterAll, beforeAll, spyOn, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
import {definition} from '../tools/compiler/controlled-baseline.mjs';

const encoding = 'u16le-chunks', packedOptions = {binaryEncoding: encoding};
const memory = {initialPages: 1, maximumPages: 1};
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const text = '\0A\ud800\ud83d\ude80\udfff'.repeat(4097) + 'Z';
const span = {filename: 'wasm-binary-chunks.eli', start: 0, end: 7, line: 1, column: 1};
let directory, backend, binary, scratchHelpers, ownedBackend, runtimeProgram;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-wasm-binary-chunks-'));
  backend = await buildBackends({outputRoot: directory});
  binary = await import(pathToFileURL(resolve(backend.directory, 'binary.mjs')).href);
  const source = await readFile('bootstrap/backends/wasm.eli', 'utf8');
  const helpers = ['memory-access-width', 'has-memory-access-p', 'prepare-memory-scratch', 'memory-scratch-entry'];
  const helperSource = '(module wasm.scratch\n' + helpers.map(name => definition(source, name + ' ')).join('\n') +
    '\n(export prepare-memory-scratch memory-scratch-entry))';
  scratchHelpers = await import('data:text/javascript;base64,' +
    Buffer.from(backend.compiler.compile_string(helperSource, 'wasm-scratch.eli')).toString('base64'));
  // Expose the real private entry only in this isolated test module. Resolve
  // its original imports explicitly; production exports stay unchanged.
  const wasmURL = pathToFileURL(resolve(backend.directory, 'wasm.mjs'));
  let implementation = await readFile(wasmURL, 'utf8');
  for (const imported of new Bun.Transpiler({loader: 'js'}).scanImports(implementation)) {
    assert.equal(imported.kind, 'import-statement');
    const resolved = imported.path.startsWith('.') ? new URL(imported.path, wasmURL).href
      : imported.path.startsWith('data:') ? imported.path : import.meta.resolve(imported.path);
    implementation = implementation.replaceAll('from ' + JSON.stringify(imported.path), 'from ' + JSON.stringify(resolved));
  }
  ownedBackend = await import('data:text/javascript;base64,' + Buffer.from(implementation +
    '\nexport {emit_fresh_managed_wasm_product, append_trap_site_section};\n').toString('base64'));
  runtimeProgram = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

const node = (kind, type, value, children = []) => ({kind, type, value, children, span});
const literal = value => node('literal', 'u32', value);
const local = value => node('local', 'u32', value);
const op = (value, ...children) => node('memory-op', value === 'load-f64' ? 'f64' : 'u32', value, children);
function program() {
  const definitions = [
    ['copy', 1, node('memory-data-copy', 'u32', text, [local(0)])],
    ['zero', 1, op('store-f64', local(0), node('literal', 'f64', -0))],
    ['outer', 1, node('sequence', 'u32', null, [node('call', 'u32', 0, [local(0)]), op('store-u8', literal(1), literal(88))])],
    ['read', 1, op('load-u32', local(0))],
    ['copy64', 2, op('store-f64', local(0), op('load-f64', local(1)))],
    ['dispatch', 2, node('call-indirect', 'u32', 1, [local(1), local(0)])],
  ];
  return {abi: 'memory-u32', filename: span.filename, exports: definitions.map(([name]) => name),
    aliases: [{name: 'copy-中😀', function: 'copy'}], table: [0, 1, 3],
    functions: definitions.map(([name, arity, body], index) => ({name, index, arity, span, body,
      locals: Array.from({length: arity}, (_, i) => ({name: 'arg' + i, index: i, type: 'u32'}))}))};
}
function utf16(value) {
  const result = new Uint8Array(value.length * 2), view = new DataView(result.buffer);
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
  return result;
}
// Expected bytes are decoded independently of the production writer/decoder.
function independentDecode(value) {
  assert.equal(value.encoding, encoding);
  assert(Number.isSafeInteger(value.byteLength) && value.byteLength >= 0);
  assert.equal(value.chunks.length, Math.ceil(value.byteLength / 4096));
  const result = new Uint8Array(value.byteLength);
  for (const [index, chunk] of value.chunks.entries()) {
    const remaining = Math.min(4096, value.byteLength - index * 4096);
    assert.equal(typeof chunk, 'string');assert.equal(chunk.length, Math.ceil(remaining / 2));
    for (let i = 0; i < chunk.length; i++) {
      const word = chunk.charCodeAt(i), at = index * 4096 + i * 2;
      result[at] = word & 255;
      if (at + 1 < result.length) result[at + 1] = word >>> 8;
      else assert.equal(word >>> 8, 0, 'odd trailing byte has canonical zero padding');
    }
  }
  return result;
}
function checkPacked(actual, expected) {
  assert.equal(Array.isArray(actual), false);
  const saved = structuredClone(actual);
  assert.deepEqual(independentDecode(actual), expected);
  assert.deepEqual(decodeCompilerBinary(actual), expected);
  const wire = JSON.parse(JSON.stringify(actual));
  assert.deepEqual(wire, actual);assert.deepEqual(decodeCompilerBinary(wire), expected);
  assert.deepEqual(actual, saved);
}
function uleb(bytes, cursor) {
  let value = 0, factor = 1, byte;
  do {assert(cursor.at < bytes.length);byte = bytes[cursor.at++];value += (byte & 127) * factor;factor *= 128;} while (byte & 128);
  return value;
}
function sections(bytes) {
  const result = [], cursor = {at: 8};
  while (cursor.at < bytes.length) {
    const id = bytes[cursor.at++], size = uleb(bytes, cursor), start = cursor.at;
    assert(start + size <= bytes.length);result.push({id, start, end: start + size});cursor.at += size;
  }
  assert.equal(cursor.at, bytes.length);return result;
}

test('trap metadata streams exact legacy JSON and LEB boundaries without serializing a whole trap array', () => {
  const record = (site, address, functionIndex) => ({site, address, offsetBase: 'module', functionIndex, returnAddress: false});
  for (const sites of [[], [record(1, 0, 0)], [record(4294967295, 4294967295, 4294967295)],
    ...[2, 127, 128, 255].map(count => Array.from({length: count}, (_, i) => record(i + 1, 127 + i, i % 7)))]) {
    const saved = structuredClone(sites);
    const expected = Uint8Array.from(backend.wasm.append_metadata_section([], 'eliscript-trap-sites', JSON.stringify(sites)));
    const ordinary = ownedBackend.append_trap_site_section([], sites);
    assert.deepEqual(Uint8Array.from(ordinary), expected);
    const writer = binary.binary_output(packedOptions);
    ownedBackend.append_trap_site_section(writer, sites);
    checkPacked(binary.binary_finish(writer), expected);assert.deepEqual(sites, saved);
  }
  const shared = op('load-u32', local(0));
  const typed = {abi: 'memory-u32', filename: span.filename, exports: ['readMany'], functions: [{
    name: 'readMany', index: 0, arity: 1, span, locals: [{name: 'address', index: 0, type: 'u32'}],
    body: node('sequence', 'u32', null, Array.from({length: 1200}, () => shared)),
  }]};
  const input = structuredClone(typed), plain = backend.wasm.emit_typed_memory_wasm_artifact(typed, memory);
  const stringify = JSON.stringify;let records = 0, packed;
  try {
    JSON.stringify = function (value, ...options) {
      assert.equal(Array.isArray(value), false, 'debug emission must not construct the complete trap JSON string');
      if (value && Object.hasOwn(value, 'offsetBase')) {
        assert.deepEqual(Object.keys(value), ['site', 'address', 'offsetBase', 'functionIndex', 'returnAddress']);
        assert.equal(value.offsetBase, 'module');assert.equal(value.returnAddress, false);
        for (const name of ['site', 'address', 'functionIndex']) assert(Number.isInteger(value[name]));
        records++;
      }
      return Reflect.apply(stringify, JSON, [value, ...options]);
    };
    packed = backend.wasm.emit_typed_memory_wasm_artifact(typed, {...memory, ...packedOptions});
  } finally {JSON.stringify = stringify;}
  assert.equal(packed.debug.trapSites.length, 1200);assert(records >= 1200);
  checkPacked(packed.bytes, Uint8Array.from(plain.bytes));assert.deepEqual(packed.debug, plain.debug);
  assert.deepEqual(typed, input);
  const module = new WebAssembly.Module(decodeCompilerBinary(packed.bytes));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const payload = new Uint8Array(WebAssembly.Module.customSections(module, 'eliscript-trap-sites')[0]);
  const cursor = {at: 0}, length = uleb(payload, cursor);
  const expected = new TextEncoder().encode(JSON.stringify(packed.debug.trapSites));
  assert(length > 65536);assert.equal(length, expected.length);assert.equal(cursor.at + length, payload.length);
  assert.deepEqual(payload.subarray(cursor.at), expected);
  assert.deepEqual(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(payload.subarray(cursor.at))), packed.debug.trapSites);
  const a = new WebAssembly.Instance(module).exports;
  const original = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(plain.bytes))).exports;
  for (const runtime of [original, a]) {
    assert.equal(runtime.readMany(0), 0);
    assert.throws(() => runtime.readMany(65535), WebAssembly.RuntimeError);
    assert.equal(runtime.__eliscript_trap_site.value, 1);
    assert.equal(runtime.readMany(0), 0);
  }
  // Raw exports retain the last site marker. A successful call is executable
  // again; clearing bridge-owned trap state is not part of this raw ABI.
  assert.equal(a.__eliscript_trap_site.value, original.__eliscript_trap_site.value);
  assert.equal(a.__eliscript_trap_site.value, 1);
});

test('function scratch retains two fixed slot records for all accesses while public snapshots preserve later getter failures', () => {
  const load = op('load-u32', local(0)), floating = op('store-f64', local(0), node('literal', 'f64', -0));
  const accesses = Array.from({length: 512}, (_, i) => i % 2 ? op('store-u32', local(0), literal(i)) : load);
  const fn = {arity: 1, locals: [{name: 'address', index: 0, type: 'u32'}, {name: 'existing', index: 1, type: 'f64'}],
    body: node('sequence', 'u32', null, [...accesses, floating])};
  const scratch = scratchHelpers.prepare_memory_scratch(fn);
  assert.deepEqual(scratch, {word: {addressLocal: 2, valueLocal: 3}, floating: {addressLocal: 2, valueLocal: 4}});
  assert.deepEqual(fn.locals.slice(2), [{name: 'memory-address', index: 2, type: 'u32'},
    {name: 'memory-word', index: 3, type: 'u32'}, {name: 'memory-float', index: 4, type: 'f64'}]);
  for (const access of accesses) assert.equal(scratchHelpers.memory_scratch_entry({wasmMemoryScratch: scratch}, access), scratch.word);
  assert.equal(scratchHelpers.memory_scratch_entry({wasmMemoryScratch: scratch}, floating), scratch.floating);
  const other = {arity: 0, locals: [], body: floating};
  assert.deepEqual(scratchHelpers.prepare_memory_scratch(other), {word: {addressLocal: 0, valueLocal: 1}, floating: {addressLocal: 0, valueLocal: 2}});
  const noAccess = {arity: 0, locals: [], body: literal(0)};
  assert(!scratchHelpers.prepare_memory_scratch(noAccess));assert.deepEqual(noAccess.locals, []);
  for (const method of ['emit_typed_memory_wasm', 'emit_typed_memory_wasm_artifact']) for (const packed of [false, true]) {
    const marker = new Error('original later typed getter failure');let reads = 0;
    const repeated = {...literal(0), get value() {if (++reads === 2) throw marker;return 0;}};
    const input = program();input.functions[0].body = node('sequence', 'u32', null, [load, repeated, repeated]);
    assert.throws(() => backend.wasm[method](input, {initialPages: 0, ...(packed ? packedOptions : {})}), error => error === marker);
    assert.equal(reads, 2, 'all public occurrences are snapshotted before memory/options/scratch preparation');
    assert.equal(input.functions[0].locals.length, 1);
  }
});

test('WASM packed intermediate writers append live and finished chunks across odd and surrogate boundaries', () => {
  for (const length of [0, 1, 2, 3, 4095, 4096, 4097, 8191, 8192, 8193]) {
    const expected = Uint8Array.from({length}, (_, i) => (i * 37 + 0xd8) & 255);
    const input = binary.binary_output(packedOptions);
    binary.binary_append(input, [...expected]);
    assert.equal(input.length, length);
    const output = binary.binary_output(packedOptions), marker = {ranges: []}, scratch = new Map();
    output.wasmDebug = marker;output.wasmMemoryScratch = scratch;
    binary.binary_push(output, 17);
    binary.binary_append(output, input);
    const finished = binary.binary_finish(input), saved = structuredClone(finished);
    const ordinary = [];binary.binary_append(ordinary, finished);
    assert.deepEqual(Uint8Array.from(ordinary), expected);
    binary.binary_append(output, finished);binary.binary_push(output, 0, 216, 255);
    assert.equal(output.wasmDebug, marker);assert.equal(output.wasmMemoryScratch, scratch);
    checkPacked(binary.binary_finish(output), Uint8Array.from([17, ...expected, ...expected, 0, 216, 255]));
    const resumed = binary.binary_resume(finished);
    binary.binary_push(resumed, 0, 216, 255, 219, 0, 220, 255, 223, 9);
    checkPacked(binary.binary_finish(resumed), Uint8Array.from([...expected, 0, 216, 255, 219, 0, 220, 255, 223, 9]));
    assert.deepEqual(finished, saved, 'reopening a finished envelope preserves the original bytes');
  }
});

test('owned packed body transfers release their private bytes across every alignment without losing debug state or reusable writers', () => {
  for (const prefixLength of [0, 1, 2, 4095, 4096, 4097])
    for (const length of [0, 1, 2, 4095, 4096, 4097, 8193]) {
      const prefix = Uint8Array.from({length: prefixLength}, (_, index) => (index * 13 + 0xdc) & 255);
      const bytes = Uint8Array.from({length}, (_, index) => (index * 37 + 0xd8) & 255);
      const source = binary.binary_output(packedOptions), output = binary.binary_output(packedOptions);
      const state = {span, ranges: []}, scratch = {word: {addressLocal: 2, valueLocal: 3}};
      source.wasmDebug = state;source.wasmMemoryScratch = scratch;source.span = span;
      output.wasmDebug = state;output.wasmMemoryScratch = scratch;output.span = span;
      binary.binary_append(source, [...bytes]);binary.binary_append(output, [...prefix]);
      if (prefixLength % 2 === 0) {
        const pack = spyOn(String, 'fromCharCode');
        try {
          assert.strictEqual(binary.binary_append_owned(output, source), output);
          const units = Math.floor(length / 2);
          const limit = units === 0 ? 0 : Number(prefixLength % 4096 !== 0) + Number(units % 2048 !== 0);
          assert(pack.mock.calls.length <= limit,
            'any even prefix converts only the initial and source-final numeric tails, never every full block');
        } finally {pack.mockRestore();}
      } else assert.strictEqual(binary.binary_append_owned(output, source), output);
      assert.equal(binary.binary_length(source), 0);assert.equal(source.low, -1);
      assert.deepEqual(source.chunks, []);assert.deepEqual(source.pending, []);
      for (const writer of [source, output]) {
        assert.strictEqual(writer.wasmDebug, state);assert.strictEqual(writer.wasmMemoryScratch, scratch);
        assert.strictEqual(writer.span, span);
      }
      checkPacked(binary.binary_finish(output), Uint8Array.from([...prefix, ...bytes]));
      // The old body writer can be used for a later independent body without
      // changing either bytes or metadata already published by the target.
      binary.binary_push(source, 255, 216, 0, 220, 9);
      checkPacked(binary.binary_finish(source), Uint8Array.of(255, 216, 0, 220, 9));
      checkPacked(binary.binary_finish(output), Uint8Array.from([...prefix, ...bytes]));
    }
});

test('aligned owned blocks transfer without repacking while finished snapshots and public byte inputs remain repeatable', () => {
  const source = binary.binary_output(packedOptions), output = binary.binary_output(packedOptions);
  const sourceBytes = Uint8Array.from({length: 8192}, (_, index) => (index * 43 + 0xdf) & 255);
  const prefix = Uint8Array.from({length: 4096}, (_, index) => index & 255);
  binary.binary_append(source, [...sourceBytes]);binary.binary_append(output, [...prefix]);
  const finishedBeforeTransfer = binary.binary_finish(source), saved = structuredClone(finishedBeforeTransfer);
  const oldStorage = source.chunks;
  const pack = spyOn(String, 'fromCharCode');
  try {
    binary.binary_append_owned(output, source);
    assert.equal(pack.mock.calls.length, 0, 'existing full packed strings must not be expanded and packed a second time');
  } finally {pack.mockRestore();}
  assert.notStrictEqual(source.chunks, oldStorage);
  assert.deepEqual(finishedBeforeTransfer, saved, 'releasing a private writer must not clear an earlier envelope chunk array');
  checkPacked(finishedBeforeTransfer, sourceBytes);
  checkPacked(binary.binary_finish(output), Uint8Array.from([...prefix, ...sourceBytes]));
  const repeated = binary.binary_output(packedOptions);
  binary.binary_append_owned(repeated, finishedBeforeTransfer);
  binary.binary_append_owned(repeated, finishedBeforeTransfer);
  checkPacked(binary.binary_finish(repeated), Uint8Array.from([...sourceBytes, ...sourceBytes]));
  assert.deepEqual(finishedBeforeTransfer, saved);
  const events = [], input = [0, 216, 255];
  Object.defineProperty(input, 1, {enumerable: true, get() {events.push('index1');return 216;}});
  const ordinary = [];
  binary.binary_append_owned(ordinary, input);binary.binary_append_owned(ordinary, input);
  assert.deepEqual(ordinary, [0, 216, 255, 0, 216, 255]);assert.deepEqual(events, ['index1', 'index1']);
  assert.equal(input.length, 3);assert.equal(typeof Object.getOwnPropertyDescriptor(input, '1').get, 'function');
  const packed = binary.binary_output(packedOptions), array = Object.freeze([0, 216, 255]);
  binary.binary_append_owned(packed, array);binary.binary_append_owned(packed, array);
  checkPacked(binary.binary_finish(packed), Uint8Array.of(0, 216, 255, 0, 216, 255));
  assert.deepEqual(array, [0, 216, 255]);
});

test('owned transfer rejects self append and non-writer typed objects before changing any byte storage', () => {
  const writer = binary.binary_output(packedOptions);binary.binary_push(writer, 255, 216, 9);
  const original = structuredClone(writer);
  const rejected = error => error.eliscriptDiagnostic?.code === 'ELI-B0001';
  assert.throws(() => binary.binary_append_owned(writer, writer), rejected);
  assert.deepEqual(writer, original);
  const typed = program(), snapshot = structuredClone(typed);
  assert.throws(() => binary.binary_append_owned(writer, typed), rejected);
  assert.deepEqual(typed, snapshot);assert.deepEqual(writer, original);
  const array = [1, 2, 3];assert.throws(() => binary.binary_append_owned(array, array), rejected);
  assert.deepEqual(array, [1, 2, 3]);
  // The public append still reads each occurrence and retains the first
  // original getter failure instead of consuming or resetting its input.
  const marker = {original: 'byte getter'}, input = [4, 5];let reads = 0;
  Object.defineProperty(input, 1, {get() {reads++;throw marker;}});
  assert.throws(() => binary.binary_append([], input), error => error === marker);
  assert.equal(reads, 1);assert.equal(input.length, 2);assert.equal(input[0], 4);
});

test('all emitted WASM sections, debug ranges, scratch locals and trap metadata are byte-identical in packed output', () => {
  const typed = program(), saved = structuredClone(typed);
  const plain = backend.wasm.emit_typed_memory_wasm_artifact(typed, memory);
  const packed = backend.wasm.emit_typed_memory_wasm_artifact(typed, {...memory, ...packedOptions});
  assert(Array.isArray(plain.bytes));const expected = Uint8Array.from(plain.bytes);
  checkPacked(packed.bytes, expected);assert.deepEqual(packed.debug, plain.debug);
  assert.equal(packed.debug.moduleByteLength, expected.length);
  assert.deepEqual(sections(expected).map(item => item.id), [1, 3, 4, 5, 6, 7, 9, 12, 10, 11, 0]);
  const module = new WebAssembly.Module(decodeCompilerBinary(packed.bytes));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.equal(WebAssembly.Module.customSections(module, 'eliscript-trap-sites').length, 1);
  assert(packed.debug.trapSites.length > 0);
  const code = sections(expected).find(item => item.id === 10);
  for (const site of packed.debug.trapSites) assert(site.address >= code.start && site.address < code.end);
  const a = new WebAssembly.Instance(module).exports;
  const b = new WebAssembly.Instance(new WebAssembly.Module(expected)).exports;
  const sourceBytes = utf16(text);
  for (const at of [0, 3, 65536 - sourceBytes.length]) {
    assert.equal(a.copy(at), b.copy(at));
    assert.deepEqual(new Uint8Array(a.memory.buffer).slice(at, at + sourceBytes.length), sourceBytes);
    assert.equal(a['copy-中😀'](at), a.dispatch(0, at));
  }
  a.zero(3);assert(Object.is(new DataView(a.memory.buffer).getFloat64(3, true), -0));
  new Uint8Array(a.memory.buffer).fill(0, 0, 2);
  assert.throws(() => a.outer(65537 - sourceBytes.length), WebAssembly.RuntimeError);
  assert.deepEqual(new Uint8Array(a.memory.buffer).slice(0, 2), Uint8Array.of(0, 0));
  assert.equal(a.__eliscript_trap_site.value > 0, true);
  assert.equal(a.copy(3), b.copy(3));assert.equal(a.__eliscript_trap_site.value, 0);
  checkPacked(backend.wasm.emit_typed_memory_wasm(typed, {...memory, ...packedOptions}),
    Uint8Array.from(backend.wasm.emit_typed_memory_wasm(typed, memory)));
  assert.deepEqual(typed, saved);
});

test('packed WASM keeps real capability imports and numeric and source-memory public APIs unchanged', () => {
  const typed = program();
  typed.functions[0].body = node('host-call', 'u32', 'console-log', [literal(7), literal(9)]);
  const plain = Uint8Array.from(backend.wasm.emit_typed_memory_wasm(typed, memory));
  const packed = backend.wasm.emit_typed_memory_wasm(typed, {...memory, ...packedOptions});
  checkPacked(packed, plain);assert(sections(plain).some(item => item.id === 2));
  const module = new WebAssembly.Module(decodeCompilerBinary(packed));
  const imports = WebAssembly.Module.imports(module);
  assert.deepEqual(imports.map(({module, name, kind}) => ({module, name, kind})),
    [{module: 'eliscript.host', name: 'console-log', kind: 'function'}]);
  for (const imported of imports) if (Object.hasOwn(imported, 'type'))
    assert.deepEqual(imported.type, {parameters: ['i32', 'i32'], results: ['i32']});
  let observed;
  const a = new WebAssembly.Instance(module, {'eliscript.host': {'console-log': (heap, args) => {observed = [heap, args];return 42;}}}).exports;
  assert.equal(a.copy(123), 42);assert.deepEqual(observed, [7, 9]);
  const numeric = backend.compiler.compile_ir_string('(defun run (value) (+ value 2)) (export run)', 'numeric-chunks.eli');
  for (const [method, input] of [['emit_numeric_wasm', numeric], ['emit_typed_numeric_wasm', backend.numeric.lower_numeric_program(numeric)]]) {
    const ordinary = backend.wasm[method](input), packed = backend.wasm[method](input, packedOptions);
    assert(Array.isArray(ordinary));checkPacked(packed, Uint8Array.from(ordinary));
    assert.equal(new WebAssembly.Instance(new WebAssembly.Module(decodeCompilerBinary(packed))).exports.run(40), 42);
  }
  const source = backend.compiler.compile_ir_string('(import "eliscript:memory32" load-u32) (defun run (address) (load-u32 address)) (export run)', 'source-memory-chunks.eli');
  checkPacked(backend.wasm.emit_memory_wasm(source, {...memory, ...packedOptions}), Uint8Array.from(backend.wasm.emit_memory_wasm(source, memory)));
});

test('packed managed metadata is appended before finalization and public metadata appends resume bounded tails', () => {
  const source = backend.compiler.compile_ir_string('(defconst marker -0.0) (defun run () marker) (export run)', 'managed-chunks.eli');
  const saved = structuredClone(source), runtimeSaved = JSON.stringify(runtimeProgram);
  const plain = backend.wasm.emit_managed_ir_wasm_product(source, runtimeProgram, {abi: 'managed-module-v1'}, () => ({debug: true, memory: {}}));
  const packed = backend.wasm.emit_managed_ir_wasm_product(source, runtimeProgram, {abi: 'managed-module-v1'}, () => ({debug: true, memory: packedOptions}));
  checkPacked(packed.bytes, Uint8Array.from(plain.bytes));assert.deepEqual(packed.debug, plain.debug);
  assert.deepEqual(packed.descriptor, plain.descriptor);
  // The public typed route owns no caller data. Its full snapshot must retain
  // every body even while the private fresh managed route consumes its own.
  const publicLowered = backend.managed.lower_managed_program(source, runtimeProgram, true);
  const publicSnapshot = structuredClone(publicLowered.typed);
  const bodies = publicLowered.typed.functions.map(fn => fn.body);
  const publicArtifact = backend.wasm.emit_typed_memory_wasm_artifact(publicLowered.typed, {...packedOptions, consumeOwnedBodies: true});
  const publicBytes = backend.wasm.append_metadata_section(publicArtifact.bytes,
    'eliscript-managed-control', JSON.stringify(publicLowered.descriptor));
  publicArtifact.debug.moduleByteLength = publicBytes.byteLength;
  checkPacked(publicBytes, Uint8Array.from(plain.bytes));
  assert.deepEqual(publicArtifact.debug, packed.debug);assert.deepEqual(publicLowered.descriptor, packed.descriptor);
  assert.deepEqual(publicLowered.typed, publicSnapshot);
  assert(publicLowered.typed.functions.every((fn, index) => fn.body === bodies[index]));
  const identity = publicLowered.typed.functions.map(fn => ({name: fn.name, index: fn.index, arity: fn.arity,
    source: fn.source, locals: fn.locals.slice()}));
  const owned = ownedBackend.emit_fresh_managed_wasm_product(publicLowered, () => ({debug: true, memory: packedOptions}));
  checkPacked(owned.bytes, Uint8Array.from(plain.bytes));assert.deepEqual(owned.debug, packed.debug);
  assert.deepEqual(owned.descriptor, packed.descriptor);
  for (const [index, fn] of publicLowered.typed.functions.entries()) {
    assert.equal(fn.body, null, 'only the explicitly owned private intermediate is consumed');
    assert.equal(fn.name, identity[index].name);assert.equal(fn.index, identity[index].index);assert.equal(fn.arity, identity[index].arity);
    assert.equal(fn.source, identity[index].source);assert.deepEqual(fn.locals.slice(0, identity[index].locals.length), identity[index].locals);
  }
  const bytes = decodeCompilerBinary(packed.bytes), module = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.equal(WebAssembly.Module.customSections(module, 'eliscript-managed-control').length, 1);
  assert.equal(packed.debug.moduleByteLength, bytes.length);
  const a = instantiateManagedRuntime(bytes, {maxSlots: 64, initialBytes: 4096, maxBytes: 16384});a.auto(1);
  try {
    const result = a.invoke('run');
    try {a.collect();assert(Object.is(a.readNumber(result), -0));assert.equal(a.stats().frameDepth, 0);} finally {a.release(result);}
  } finally {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  let ordinary = [...plain.bytes], compact = packed.bytes;
  for (const value of ['', 'x', '中😀', '']) {
    const input = compact, previous = structuredClone(input);
    ordinary = backend.wasm.append_metadata_section(ordinary, 'x', value);
    compact = backend.wasm.append_metadata_section(input, 'x', value);
    checkPacked(compact, Uint8Array.from(ordinary));assert.deepEqual(input, previous);
  }
  assert.equal(WebAssembly.Module.customSections(new WebAssembly.Module(decodeCompilerBinary(compact)), 'x').length, 4);
  assert.deepEqual(source, saved);assert.equal(JSON.stringify(runtimeProgram), runtimeSaved);
  const invalid = backend.compiler.compile_ir_string('(defun broken () (js* "unavailable")) (export broken)', 'owned-first-error.eli');
  const invalidSnapshot = structuredClone(invalid);let configured = 0;
  assert.throws(() => backend.wasm.emit_managed_ir_wasm_product(invalid, runtimeProgram, {}, () => {
    configured++;throw Error('output configuration must remain after source refusal');
  }), error => error.eliscriptDiagnostic?.code === 'ELI-B0001' && error.eliscriptDiagnostic.location.file === 'owned-first-error.eli');
  assert.equal(configured, 0);assert.deepEqual(invalid, invalidSnapshot);
}, 30000);

test('owned emission releases only completed function bodies and preserves the original first emission failure', () => {
  const input = program();input.functions[1].body = node('unknown-owned-opcode', 'u32', null);
  const saved = structuredClone(input), marker = new Error('original configuration failure');
  assert.throws(() => ownedBackend.emit_fresh_managed_wasm_product({typed: input, descriptor: {}}, () => {throw marker;}), error => error === marker);
  assert.deepEqual(input, saved, 'a configuration failure happens before any intermediate is consumed');
  let expected;
  try {backend.wasm.emit_typed_memory_wasm_artifact(input, packedOptions);} catch (error) {expected = error;}
  assert.equal(expected.eliscriptDiagnostic?.code, 'ELI-B0001');assert.deepEqual(input, saved);
  const remainingBodies = input.functions.map(fn => fn.body);
  assert.throws(() => ownedBackend.emit_fresh_managed_wasm_product({typed: input, descriptor: {}}, () => ({debug: true, memory: packedOptions})), error => {
    assert.equal(error.message, expected.message);assert.deepEqual(error.eliscriptDiagnostic, expected.eliscriptDiagnostic);return true;
  });
  assert.equal(input.functions[0].body, null);
  for (let index = 1; index < input.functions.length; index++) assert.equal(input.functions[index].body, remainingBodies[index]);
});

test('invalid WASM encodings preserve ABI, source and memory validation error precedence', () => {
  const typed = program(), saved = structuredClone(typed);
  const refusal = (message, file = '<ir>') => error => {
    assert.equal(Object.getPrototypeOf(error), Object.prototype);
    assert.equal(error.message, message);
    assert.deepEqual(error.eliscriptDiagnostic, {format: 'eliscript-diagnostic', version: 1,
      code: 'ELI-B0001', severity: 'error', phase: 'numeric-backend', message,
      location: {file, start: {line: 1, column: 1}}});
    return true;
  };
  for (const binaryEncoding of [undefined, null, false, 1, '', 'unknown', 'base64-chunks', {}]) {
    for (const method of ['emit_typed_memory_wasm', 'emit_typed_memory_wasm_artifact'])
      assert.throws(() => backend.wasm[method](typed, {...memory, binaryEncoding}), refusal('unsupported binary output encoding'));
  }
  let reads = 0;
  const options = {initialPages: 0, maximumPages: 1, get binaryEncoding() {reads++;throw Error('encoding observed too early');}};
  assert.throws(() => backend.wasm.emit_typed_memory_wasm(typed, options),
    refusal('memory32 requires 1 <= initialPages <= maximumPages <= 65535', span.filename));assert.equal(reads, 0);
  assert.throws(() => backend.wasm.emit_typed_memory_wasm({...typed, abi: 'numeric-f64'}, options),
    refusal('typed memory emitter requires memory-u32', span.filename));assert.equal(reads, 0);
  const malformed = structuredClone(typed);malformed.functions[0].body = {kind: 'memory-data-copy', type: 'u32', value: false, children: [literal(0)], span};
  assert.throws(() => backend.wasm.emit_typed_memory_wasm(malformed, {binaryEncoding: 'unknown'}),
    refusal('static UTF16 copy requires memory-u32, one word address and string data', span.filename));
  assert.throws(() => decodeCompilerBinary({encoding, byteLength: 1, chunks: [String.fromCharCode(0x1234)]}));
  assert.deepEqual(typed, saved);
});

test.skipIf(!target)('the same binary decoder opens genuine packed native code and executes against packed zero-import WASM', async () => {
  const typed = program(), wasm = backend.wasm.emit_typed_memory_wasm_artifact(typed, {...memory, ...packedOptions});
  const module = new WebAssembly.Module(decodeCompilerBinary(wasm.bytes));assert.deepEqual(WebAssembly.Module.imports(module), []);
  const w = new WebAssembly.Instance(module).exports;
  const native = backend.native.emit_typed_native_memory_artifact(typed, target, packedOptions);
  const path = resolve(directory, 'cross-decoder.' + (target === 'arm64-linux' ? 'so' : 'dylib'));
  await writeFile(path, decodeCompilerBinary(native.bytes));
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  let n;
  try {
    WebAssembly.Module = function () {throw Error('native loader attempted WASM substitution');};
    WebAssembly.Instance = function () {throw Error('native loader attempted WASM substitution');};
    n = await openNativeMemory(path, {copy: 1, zero: 1, outer: 1, read: 1, copy64: 2, dispatch: 2},
      {...memory, nativeTarget: target, debug: native.debug, trapSites: native.debug.trapSites});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
  try {
    assert.equal(n.invoke('dispatch', 0, 3), w.dispatch(0, 3));
    assert.deepEqual(n.read(3, utf16(text).length), utf16(text));
    assert.deepEqual(n.read(3, utf16(text).length), new Uint8Array(w.memory.buffer).slice(3, 3 + utf16(text).length));
    n.invoke('zero', 3);w.zero(3);assert(Object.is(new DataView(n.read(3, 8).buffer).getFloat64(0, true), -0));
    assert.deepEqual(n.read(3, 8), new Uint8Array(w.memory.buffer).slice(3, 11));
    assert.throws(() => n.invoke('read', 65535), WebAssembly.RuntimeError);
    assert.throws(() => w.read(65535), WebAssembly.RuntimeError);
    assert.equal(n.invoke('copy', 3), w.copy(3));
  } finally {n.close();}
}, 30000);
