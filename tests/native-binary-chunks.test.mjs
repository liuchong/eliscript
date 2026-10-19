import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';

const encoding = 'u16le-chunks';
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const text = '\0A\ud800\ud83d\ude80\udfff'.repeat(4097) + 'Z';
const span = {filename: 'binary-chunks.eli', start: 0, end: 7, line: 1, column: 1};
let directory, backend, assembly, elf, binary, capabilities, sessionOptions;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-binary-chunks-'));
  backend = await buildBackends({outputRoot: directory});
  const source = await readFile('bootstrap/backends/native.eli', 'utf8');
  const privateSource = source.slice(0, source.lastIndexOf(')')) +
    '\n(export native-word-buffer native-word-at native-word-set native-word-resize native-word-push native-word-flush ' +
    'patch-jump condition-jumps patch-conditions finish-calls finish-branches emit-call memory-call memory-code macho-object macho-library native-append-words native-memory-container memory-prepare-program memory-prepare-fresh-program))';
  const file = resolve(backend.directory, 'native-word-buffer-unit.mjs');
  await writeFile(file, backend.compiler.compile_string(privateSource, 'native-word-buffer-unit.eli'));
  assembly = await import(pathToFileURL(await realpath(file)).href);
  elf = await import(pathToFileURL(await realpath(resolve(backend.directory, 'elf.mjs'))).href);
  binary = await import(pathToFileURL(await realpath(resolve(backend.directory, 'binary.mjs'))).href);
  capabilities = await import(pathToFileURL(await realpath(resolve(backend.directory, 'capabilities.mjs'))).href);
  const session = await readFile('bootstrap/host/compiler-session.eli', 'utf8');
  const optionsSource = '(module native.observer.options\n' +
    ['session-binary-options', 'session-native-observer'].map(name => definition(session, name + ' ')).join('\n') +
    '\n(export session-binary-options session-native-observer))';
  sessionOptions = await import('data:text/javascript;base64,' +
    Buffer.from(backend.compiler.compile_string(optionsSource, 'native-observer-options.eli')).toString('base64'));
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
  ];
  return {abi: 'memory-u32', filename: span.filename, exports: definitions.map(([name]) => name),
    functions: definitions.map(([name, arity, body], index) => ({name, index, arity, span, body,
      locals: Array.from({length: arity}, (_, i) => ({name: 'arg' + i, index: i, type: 'u32'}))}))};
}
function utf16(value) {
  const bytes = new Uint8Array(value.length * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
  return bytes;
}
// Independent small-vector encoder/decoder: no production writer is used to
// construct its own expected wire data or expected machine image.
function packed(bytes) {
  const chunks = [];
  for (let at = 0; at < bytes.length; at += 4096) {
    let chunk = '';
    for (let i = at; i < Math.min(at + 4096, bytes.length); i += 2)
      chunk += String.fromCharCode(bytes[i] | ((bytes[i + 1] ?? 0) << 8));
    chunks.push(chunk);
  }
  return {encoding, byteLength: bytes.length, chunks};
}
function independentDecode(value) {
  assert.equal(value.encoding, encoding);
  assert(Number.isSafeInteger(value.byteLength) && value.byteLength >= 0);
  assert.equal(value.chunks.length, Math.ceil(value.byteLength / 4096));
  const bytes = new Uint8Array(value.byteLength);
  for (const [i, chunk] of value.chunks.entries()) {
    const length = Math.min(4096, value.byteLength - i * 4096);
    assert.equal(typeof chunk, 'string');assert.equal(chunk.length, Math.ceil(length / 2));
    for (let j = 0; j < chunk.length; j++) {
      const word = chunk.charCodeAt(j), at = i * 4096 + j * 2;
      bytes[at] = word & 255;
      if (at + 1 < bytes.length) bytes[at + 1] = word >>> 8;
      else assert.equal(word >>> 8, 0, 'odd trailing byte has a canonical zero high half');
    }
  }
  return bytes;
}
function checkCompact(value, expected) {
  const saved = structuredClone(value);
  assert.equal(Array.isArray(value), false);
  assert.deepEqual(independentDecode(value), expected);
  assert.deepEqual(decodeCompilerBinary(value), expected);
  const roundTrip = JSON.parse(JSON.stringify(value));
  assert.deepEqual(roundTrip, value, 'JSON transport preserves every UTF16 code unit, including unpaired surrogates');
  assert.deepEqual(decodeCompilerBinary(roundTrip), expected);
  assert.deepEqual(value, saved);
}
function checkMachOPages(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let command = 32, signature = -1, size = -1;
  for (let i = 0; i < view.getUint32(16, true); i++) {
    if (view.getUint32(command, true) === 0x1d) {
      signature = view.getUint32(command + 8, true);size = view.getUint32(command + 12, true);
    }
    command += view.getUint32(command + 4, true);
  }
  assert(signature > 4096);assert.equal(signature + size, bytes.length);
  assert.equal(view.getUint32(signature, false), 0xfade0cc0);
  assert.equal(view.getUint32(signature + 4, false), size);
  assert.equal(view.getUint32(signature + 8, false), 1);
  const directory = signature + view.getUint32(signature + 16, false);
  assert.equal(view.getUint32(directory, false), 0xfade0c02);
  const hashOffset = view.getUint32(directory + 16, false), pages = view.getUint32(directory + 28, false);
  assert.equal(view.getUint32(directory + 32, false), signature);
  assert.equal(view.getUint8(directory + 36), 32);assert.equal(view.getUint8(directory + 37), 2);
  assert.equal(view.getUint8(directory + 39), 12);assert.equal(pages, Math.ceil(signature / 4096));
  for (let page = 0; page < pages; page++) {
    const expected = new Uint8Array(createHash('sha256').update(bytes.subarray(page * 4096, Math.min(signature, (page + 1) * 4096))).digest());
    assert.deepEqual(bytes.subarray(directory + hashOffset + page * 32, directory + hashOffset + (page + 1) * 32), expected,
      'ad-hoc signature page ' + page);
  }
}

const wordValues = length => Array.from({length}, (_, index) =>
  [0, 0xffffffff, 0x80000000, 0x7fffffff, 0xd800dc00, 0xdfffdbff, 0x12345678][index % 7] >>> 0);
function wordBuffer(values) {
  const buffer = assembly.native_word_buffer();
  for (const value of values) assembly.native_word_push(buffer, value);
  return buffer;
}
function readWords(buffer) {
  return Array.from({length: buffer.length}, (_, index) => assembly.native_word_at(buffer, index) >>> 0);
}
function wordBytes(values) {
  const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}
const wordBufferDiagnostic = message => error => {
  assert.equal(error.message, message);
  assert.deepEqual(error.eliscriptDiagnostic, {
    format: 'eliscript-diagnostic', version: 1, code: 'ELI-B0001', severity: 'error', phase: 'numeric-backend', message,
    location: {file: '<ir>', start: {line: 1, column: 1}},
  });
  return true;
};
test('private native word blocks retain exact uint32 data across random patches immutable publication and bounded mutable storage', () => {
  const expected = wordValues(4097), buffer = wordBuffer(expected);
  assembly.native_word_flush(buffer);
  const published = buffer.chunks.slice();
  assert.equal(buffer.chunks.length, 5);
  assert(buffer.chunks.every(chunk => typeof chunk === 'string' && chunk.length <= 2048));
  for (const index of [4096, 0, 1023, 1024, 2047, 2048, 4095, 7, 3072, 1023]) {
    const value = (index * 2654435761) >>> 0;
    assembly.native_word_set(buffer, index, value);expected[index] = value;
    assert.equal(assembly.native_word_at(buffer, index), value);
    assert(buffer.cache.length <= 1024, 'only a single bounded word block is mutable');
  }
  assembly.native_word_flush(buffer);
  assert.deepEqual(readWords(buffer), expected);
  assert.deepEqual(published, wordValues(4097).reduce((chunks, value, index) => {
    if (index % 1024 === 0) chunks.push('');
    chunks[chunks.length - 1] += String.fromCharCode(value & 65535, value >>> 16);return chunks;
  }, []), 'published chunks keep their original immutable contents');
  for (const index of [-1, .5, NaN, Infinity, 4097])
    assert.throws(() => assembly.native_word_at(buffer, index), wordBufferDiagnostic('native word buffer index is out of range'));
});

test('native word truncation discards old tails and uninitialized growth is rejected instead of becoming zero words', () => {
  const values = wordValues(4097);
  for (const length of [0, 1, 1023, 1024, 1025, 4095, 4096]) {
    const buffer = wordBuffer(values);
    assembly.native_word_resize(buffer, length);
    assert.deepEqual(readWords(buffer), values.slice(0, length));
    assembly.native_word_resize(buffer, length + 2);
    for (const index of [length, length + 1])
      assert.throws(() => assembly.native_word_at(buffer, index), wordBufferDiagnostic('native word buffer contains an unwritten word'));
    assembly.native_word_set(buffer, length, 0x80000000);
    assembly.native_word_set(buffer, length + 1, 0xffffffff);
    assembly.native_word_flush(buffer);
    assert.deepEqual(readWords(buffer), [...values.slice(0, length), 0x80000000, 0xffffffff]);
  }
  const buffer = assembly.native_word_buffer();
  assembly.native_word_resize(buffer, 3);assembly.native_word_set(buffer, 2, 7);
  assert.throws(() => assembly.native_word_flush(buffer), wordBufferDiagnostic('native word buffer contains an unwritten word'));
  assembly.native_word_resize(buffer, 0);assembly.native_word_push(buffer, 9);
  assert.deepEqual(readWords(buffer), [9]);
  for (const length of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => assembly.native_word_resize(buffer, length), wordBufferDiagnostic('native word buffer length is invalid'));
});

test('native word blocks reuse bounded numeric scratch across emission patching and shrinking without changing published strings', () => {
  const values = wordValues(8195), words = assembly.native_word_buffer(), cache = words.cache, units = words.units;
  for (const value of values) {
    assembly.native_word_push(words, value);
    assert.strictEqual(words.cache, cache);assert.strictEqual(words.units, units);
    assert(cache.length <= 1024);assert(units.length <= 2048);
  }
  assembly.native_word_flush(words);const published = words.chunks.slice();
  for (const index of [0, 8194, 1024, 4096, 2048, 8192, 1023, 0]) {
    const value = (index * 2246822519) >>> 0;values[index] = value;
    assembly.native_word_set(words, index, value);assembly.native_word_flush(words);
    assert.strictEqual(words.cache, cache);assert.strictEqual(words.units, units);
    assert(cache.length <= 1024);assert(units.length <= 2048);
  }
  assert.deepEqual(readWords(words), values);
  const original = wordBuffer(wordValues(8195));assembly.native_word_flush(original);
  assert.deepEqual(published, original.chunks,
    'previously published immutable blocks never observe scratch reuse');
  assembly.native_word_resize(words, 17);assert.strictEqual(words.cache, cache);
  assembly.native_word_push(words, 0xffffffff);assembly.native_word_flush(words);
  assert.deepEqual(readWords(words), [...values.slice(0, 17), 0xffffffff]);
  assert.strictEqual(words.cache, cache);assert.strictEqual(words.units, units);
});

test('unchanged native branch positions validate every word without republishing the complete image', () => {
  const values = wordValues(3073), words = wordBuffer(values);
  const state = {words, constants: [{uses: [0, 2048]}], tableUses: [1024],
    debugRanges: [{kind: 'function', start: 0, end: values.length * 4}]};
  for (const [at, opcode, target] of [[2, 0x94000000, 3000], [1024, 0x35000000, 1025], [2048, 0x36000000, 2049]]) {
    assembly.native_word_set(words, at, opcode);assembly.patch_jump(state, at, target);
  }
  assembly.native_word_flush(words);
  const expected = readWords(words), published = words.chunks.slice(), offsets = [0, 4096];
  let dirty = false, writes = 0;
  Object.defineProperty(words, 'dirty', {enumerable: true, configurable: true,
    get() {return dirty;}, set(value) {writes++;dirty = value;}});
  assembly.finish_branches(state, offsets);assembly.native_word_flush(words);
  assert.equal(writes, 0, 'unchanged words never dirty and re-encode their packed blocks');
  assert.deepEqual(readWords(words), expected);assert.deepEqual(words.chunks, published);
  assert.deepEqual(offsets, [0, 4096]);assert.deepEqual(state.constants[0].uses, [0, 2048]);
  assert.deepEqual(state.tableUses, [1024]);assert.deepEqual(state.debugRanges, [{kind: 'function', start: 0, end: values.length * 4}]);
  const hole = assembly.native_word_buffer();assembly.native_word_resize(hole, 2);assembly.native_word_set(hole, 1, 7);
  assert.throws(() => assembly.finish_branches({words: hole}, []), wordBufferDiagnostic('native word buffer contains an unwritten word'));
  // B.AL that exceeds imm19 still becomes an ordinary B even though growth is
  // zero; suppressing all branch writes would silently leave the wrong opcode.
  const always = {words: wordBuffer([0x5400000e, 0xd65f03c0])};
  assembly.patch_jump(always, 0, 300000);assembly.finish_branches(always, []);
  assert.equal(assembly.native_word_at(always.words, 0), 0x14000000 | 300000);
});

test('packed native words append exact bytes with bounded prefix carries and independent immutable output chunks', () => {
  const values = wordValues(3077), expectedWords = wordBytes(values);
  for (const prefixSize of [0, 1, 2, 207, 208, 4096]) {
    const output = binary.binary_output({binaryEncoding: encoding}), words = wordBuffer(values);
    const prefix = Uint8Array.from({length: prefixSize}, (_, index) => (index * 31) & 255);
    for (const byte of prefix) binary.binary_byte(output, byte);
    assembly.native_word_flush(words);const sourceChunks = words.chunks.slice();
    assembly.native_append_words(output, words);
    if (prefixSize % 4096 === 0) {
      for (let index = 0; index < 3; index++)
        assert.strictEqual(output.chunks[prefixSize / 4096 + index], sourceChunks[index]);
    }
    const finished = binary.binary_finish(output), expected = new Uint8Array(prefix.length + expectedWords.length);
    expected.set(prefix);expected.set(expectedWords, prefix.length);
    assert.deepEqual(decodeCompilerBinary(finished), expected);assert.deepEqual(readWords(words), values);
    assembly.native_word_set(words, 0, 0xffffffff);assembly.native_word_flush(words);
    assert.deepEqual(decodeCompilerBinary(finished), expected, 'later source patches cannot change the completed byte snapshot');
  }
});

test('private native container releases only its consumed word root and preserves full bytes debug and observer counts', () => {
  const typed = program(), saved = structuredClone(typed), options = {binaryEncoding: encoding};
  const baseline = assembly.memory_code(typed, 'arm64-macos', {debug: true, packedWords: true});
  const expected = assembly.macho_library(typed, baseline, null, options);
  const code = assembly.memory_code(typed, 'arm64-macos', {debug: true, packedWords: true});
  const retained = code.words, words = readWords(retained), ranges = structuredClone(code.debugRanges), phases = [];
  const actual = assembly.native_memory_container(typed, code, 'arm64-macos', 'library', options,
    (phase, counts) => {phases.push({phase, ...counts});});
  assert.deepEqual(actual, expected);assert.equal(code.words, null);
  assert.deepEqual(readWords(retained), words, 'the private root is dropped without clearing another holder of the same immutable data');
  assert.deepEqual(code.debugRanges, ranges);assert.deepEqual(code.section, baseline.section);assert.deepEqual(typed, saved);
  assert.deepEqual(phases.map(item => item.phase), ['native-container-start', 'native-container-complete']);
  assert(phases.every(item => item.words === words.length));
});

test('packed native relocation and reverse branch growth match the original array image offsets debug ranges and identity hash', () => {
  const values = Array(2051).fill(0xd503201f);
  values[0] = 0x14000000;values[1023] = 0x94000000;
  values[1024] = 0x3608000d;values[2050] = 0x35000009;
  const original = {words: values.slice(), constants: [{uses: [0, 1023, 1024, 2051]}], tableUses: [0, 1024, 2051],
    debugRanges: [{kind: 'function', start: 0, end: values.length * 4}, {kind: 'trap-site', start: 4092, end: 4100}]};
  const packedState = structuredClone(original);packedState.words = wordBuffer(values);
  const offsets = [0, 4092, 4096, values.length * 4], packedOffsets = offsets.slice();
  for (const state of [original, packedState]) {
    assembly.patch_jump(state, 0, 33554432);
    assembly.patch_jump(state, 1023, -33554433);
    assembly.patch_jump(state, 1024, 16384);
    assembly.patch_jump(state, 2050, 0);
  }
  assembly.finish_branches(original, offsets);assembly.finish_branches(packedState, packedOffsets);
  const expected = original.words.map(value => value >>> 0);
  assert.deepEqual(readWords(packedState.words), expected);
  assert.deepEqual(packedOffsets, offsets);
  for (const name of ['constants', 'tableUses', 'debugRanges', 'branches']) assert.deepEqual(packedState[name], original[name]);
  const expectedHash = createHash('sha256').update(wordBytes(expected)).digest('hex');
  for (const length of [0, 1, 13, 14, 15, 16, 17, 1023, 1024, 1025, expected.length]) {
    const words = expected.slice(0, length), buffer = wordBuffer(words);
    const digest = backend.sha256.sha256_words_le(buffer, assembly.native_word_at);
    assert.equal(Buffer.from(digest).toString('hex'), createHash('sha256').update(wordBytes(words)).digest('hex'));
    assert.deepEqual(digest, backend.sha256.sha256_words_le(words));
  }
  assert.equal(Buffer.from(backend.sha256.sha256_words_le(packedState.words, assembly.native_word_at)).toString('hex'), expectedHash);
});

test('public memory emitters preserve original array-code bytes and every debug range for both native container formats', () => {
  const typed = program(), saved = structuredClone(typed);
  const freeze = value => {if (value && typeof value === 'object' && !Object.isFrozen(value)) {Object.values(value).forEach(freeze);Object.freeze(value);}};
  freeze(typed);
  for (const platform of ['arm64-macos', 'arm64-linux']) for (const format of ['object', 'library']) {
    const ordinaryCode = assembly.memory_code(typed, platform, {debug: true});
    assert(Array.isArray(ordinaryCode.words), 'the old private array-code path remains an independent baseline');
    const options = {format, binaryEncoding: encoding};
    const baseline = platform === 'arm64-macos'
      ? format === 'object' ? assembly.macho_object(typed, ordinaryCode, options) : assembly.macho_library(typed, ordinaryCode, null, options)
      : format === 'object' ? elf.emit_elf_object(typed, ordinaryCode, options) : elf.emit_elf_library(typed, ordinaryCode, options);
    const actual = backend.native.emit_typed_native_memory_artifact(typed, platform, options);
    assert.deepEqual(decodeCompilerBinary(actual.bytes), decodeCompilerBinary(baseline));
    assert.deepEqual(actual.debug.ranges, ordinaryCode.debugRanges);
    assert.deepEqual(actual.debug.codeSection, ordinaryCode.section);
    const packedCode = assembly.memory_code(typed, platform, {debug: true, packedWords: true});
    assert.equal(Array.isArray(packedCode.words), false);
    assert.deepEqual(readWords(packedCode.words), ordinaryCode.words.map(value => value >>> 0));
    assert.deepEqual(typed, saved, 'neither code storage path changes public typed input');
  }
}, 30000);

const pendingCall = (at, target) => ({at, target});
test('numeric short-circuit relocations retain full word positions beyond byte and UTF16 boundaries', () => {
  const nop = 0xd503201f;
  for (const prefix of [256, 65536]) for (const packedWords of [false, true])
    for (const kind of ['and', 'or']) for (const whenTrue of [false, true]) {
      const prefixWords = Array(prefix).fill(nop);
      const state = {words: packedWords ? wordBuffer(prefixWords) : prefixWords.slice(), compact: true};
      const condition = node(kind, 'i32', null, [node('int-literal', 'i32', 1),
        node('int-literal', 'i32', 0), node('not', 'i32', null, [node('int-literal', 'i32', 1)])]);
      const jumps = assembly.condition_jumps(state, condition, whenTrue);
      const every = kind === 'and' ? !whenTrue : whenTrue;
      const positions = [prefix + 1, prefix + 3, prefix + 5];
      assert.deepEqual(jumps, every ? positions : positions.slice(-1));
      assert.equal(state.words.length, prefix + 6);
      // The short-circuit continuation skips two independent sentinel words.
      // Decode each actual signed imm19 instead of consulting branch metadata.
      const target = prefix + 8;
      assembly.patch_conditions(state, jumps, target);
      for (let i = 0; i < 2; i++) assembly.native_word_push(state.words, nop);
      const offsets = [prefix * 4];assembly.finish_branches(state, offsets);
      const words = readWords(state.words);
      assert.deepEqual(words.slice(0, prefix), prefixWords, 'position concatenation never overwrites the prefix');
      assert.deepEqual(offsets, [prefix * 4]);
      for (const [i, at] of positions.entries()) {
        const word = words[at];
        assert.equal((word & 0x7e000000) >>> 0, 0x34000000);
        const immediate = (word >>> 5) & 0x7ffff;
        const signed = immediate & 0x40000 ? immediate - 0x80000 : immediate;
        assert.equal(at + signed, every || i === 2 ? target : prefix + 6);
        const leafWhenTrue = i === 2 ? !whenTrue : every ? whenTrue : !whenTrue;
        assert.equal(!!(word & 0x01000000), leafWhenTrue, 'NOT reverses only the leaf branch polarity');
      }
      // Execute the small emitted MOVZ/CBZ subset independently. Taking the
      // external continuation skips the two sentinels; fallthrough runs both.
      let pc = prefix, value = 0, steps = 0, sentinels = 0;
      while (pc < words.length && steps++ < 16) {
        const word = words[pc];
        if (((word & 0xffe0001f) >>> 0) === 0xd2800000) {value = (word >>> 5) & 0xffff;pc++;}
        else if (((word & 0x7e000000) >>> 0) === 0x34000000) {
          const immediate = (word >>> 5) & 0x7ffff;
          const distance = immediate & 0x40000 ? immediate - 0x80000 : immediate;
          pc += (!!(word & 0x01000000) ? value !== 0 : value === 0) ? distance : 1;
        } else {assert.equal(word, nop);sentinels++;pc++;}
      }
      assert(steps < 16);
      const expected = kind === 'and' ? Boolean(1 && 0 && !1) : Boolean(1 || 0 || !1);
      assert.equal(sentinels, expected === whenTrue ? 0 : 2);
      assert.deepEqual(words.slice(prefix + 6), [nop, nop]);
    }
});

test('numeric discarded sequence-wrapped branches emit no unused work while calls and selected assignments remain', () => {
  const emit = source => backend.native.emit_native_numeric_object(
    backend.compiler.compile_ir_string(source, 'discarded-branch-wrappers.eli'), 'arm64-macos');
  const prefix = '(defun effect (x) (if (> x 0) (+ 0 (effect (- x 1))) x)) ';
  for (const [source, minimal] of [
    ['(defun f (x) (if (< x 3) (+ x 1) (* x 2)) x) (export f)', '(defun f (x) x) (export f)'],
    ['(defun f (x) (if (< x 3) (progn (+ x 1) (* x 2)) (if (> x 0) (- x 2) (+ x 3))) x) (export f)',
      '(defun f (x) x) (export f)'],
    [prefix + '(defun f (x) (if (< (effect x) 3) (+ x 1) (* x 2)) x) (export f)',
      prefix + '(defun f (x) (effect x) x) (export f)'],
    ['(defun f (x) (if (< x 3) (progn (+ x 7) (setq x (+ x 1))) (progn (* x 9) (setq x (* x 2)))) x) (export f)',
      '(defun f (x) (if (< x 3) (setq x (+ x 1)) (setq x (* x 2))) x) (export f)'],
  ]) assert.deepEqual(emit(source), emit(minimal));
  assert.notDeepEqual(emit(prefix + '(defun f (x) (if (< x 3) (effect x) (* x 2)) x) (export f)'),
    emit(prefix + '(defun f (x) x) (export f)'), 'a call in only the selected branch cannot be discarded or made unconditional');
});

test('private calls transfer one relocation record and retain exact independent forward backward and long branch bytes', () => {
  // Observe the actual numeric and memory emitters before linking: neither
  // pending representation may preallocate the final relocation's fields.
  for (const memory of [false, true]) {
    const state = {words: [], calls: [], compact: false, depth: 0, memoryErrors: []};
    const call = node('call', memory ? 'u32' : 'f64', 1);
    if (memory) assembly.memory_call(state, call);else assembly.emit_call(state, call);
    assert.equal(state.calls.length, 1);
    const pending = state.calls[0];assert.deepEqual(Object.keys(pending), ['at', 'target']);
    const setters = [], descriptors = new Map(['opcode', 'kind', 'size'].map(key => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)]));
    try {
      for (const key of descriptors.keys()) Object.defineProperty(Object.prototype, key,
        {configurable: true, set() {setters.push(key);}});
      assert.equal(assembly.finish_calls(state, [0, 4]), 1);
      assert.strictEqual(state.branches[0], pending);assert.equal(state.calls.length, 0);
      assert.deepEqual(setters, [], 'new relocation fields must not invoke inherited setters');
      for (const [key, value] of [['opcode', 0x94000000], ['kind', 0], ['size', 1]])
        assert.deepEqual(Object.getOwnPropertyDescriptor(pending, key), {value, writable: true, enumerable: true, configurable: true});
      assert.equal(state.words[pending.at] >>> 0, (0x94000000 | ((1 - pending.at) & 0x3ffffff)) >>> 0);
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);else delete Object.prototype[key];
      }
    }
  }
  // BL +1 and BL -2 have independently specified signed imm26 encodings.
  // The intervening CBZ targets the end and must retain its original label.
  for (const packedWords of [false, true]) {
    const values = [0x94000000, 0xb4000000, 0x94000000, 0xd65f03c0];
    const calls = [pendingCall(0, 1), pendingCall(2, 0)], saved = calls.slice();
    for (const call of calls) assert.deepEqual(Object.keys(call), ['at', 'target'], 'pending records retain only their original two fields');
    const state = {words: packedWords ? wordBuffer(values) : values.slice(), calls,
      constants: [{uses: [0, 2]}], tableUses: [1], debugRanges: [{kind: 'function', start: 0, end: 16}]};
    assembly.patch_jump(state, 1, 3);
    assert.equal(assembly.finish_calls(state, [0, 4]), 2);
    assert.equal(calls.length, 0, 'the emitter no longer retains the pending-call queue');
    assert.strictEqual(state.branches[1], saved[0]);assert.strictEqual(state.branches[2], saved[1]);
    const offsets = [0, 4];assembly.finish_branches(state, offsets);
    assert.deepEqual(readWords(state.words), [0x94000001, 0xb4000040, 0x97fffffe, 0xd65f03c0]);
    assert.deepEqual(offsets, [0, 4]);assert.deepEqual(state.constants[0].uses, [0, 2]);
    assert.deepEqual(state.tableUses, [1]);assert.deepEqual(state.debugRanges, [{kind: 'function', start: 0, end: 16}]);
    assert.deepEqual(state.branches, []);
  }
  // Preserve the existing branch relaxer's full image, debug and offsets for a
  // far call that expands and shifts a backward call, a literal and table use.
  const values = [0x94000000, 0x35000000, 0x94000000, 0xd65f03c0];
  const offsets = [0, 33554432 * 4], baselineOffsets = offsets.slice();
  const original = {words: values.slice(), constants: [{uses: [0, 2, 4]}], tableUses: [1, 4],
    debugRanges: [{kind: 'function', start: 0, end: 16}]};
  const transferred = structuredClone(original);transferred.words = wordBuffer(values);
  transferred.calls = [pendingCall(0, 1), pendingCall(2, 0)];
  for (const state of [original, transferred]) assembly.patch_jump(state, 1, 3);
  assembly.patch_jump(original, 0, offsets[1] / 4);assembly.patch_jump(original, 2, 0);
  assert.equal(assembly.finish_calls(transferred, offsets), 2);
  assembly.finish_branches(original, baselineOffsets);assembly.finish_branches(transferred, offsets);
  assert.deepEqual(readWords(transferred.words), original.words.map(word => word >>> 0));
  assert.deepEqual(offsets, baselineOffsets);
  for (const key of ['constants', 'tableUses', 'debugRanges', 'branches']) assert.deepEqual(transferred[key], original[key]);
});

test('private call transfer preserves the first branch rejection and never consumes later targets', () => {
  const first = pendingCall(0, 1), bad = pendingCall(1, 0);
  const later = {at: 2, get target() {assert.fail('later relocation must not be read');}};
  const calls = [first, bad, later], state = {words: [0x94000000, 0xd503201f, 0x94000000], calls};
  assert.throws(() => assembly.finish_calls(state, [0, 4]), wordBufferDiagnostic('unsupported native branch instruction'));
  assert.equal(state.words[0] >>> 0, 0x94000001);
  assert.equal(state.words[1] >>> 0, 0xd503201f);
  assert.equal(calls[0], null);assert.strictEqual(calls[1], bad);assert.strictEqual(calls[2], later);
  assert.equal(state.branches.length, 1);assert.strictEqual(state.branches[0], first);
});

test('native observer retains the original direct-call counts after private relocation ownership transfers', () => {
  const typed = {abi: 'memory-u32', filename: 'calls-observer.eli', exports: ['f0'],
    functions: Array.from({length: 130}, (_, index) => ({name: 'f' + index, index, arity: 0, locals: [], span,
      body: index === 129 ? literal(9) : node('call', 'u32', 129)}))};
  const saved = structuredClone(typed), phases = [];
  const observer = (phase, counts) => {phases.push({phase, ...counts});};
  const plain = backend.native.emit_typed_native_memory_artifact(typed, 'arm64-macos', {binaryEncoding: encoding});
  const observed = backend.native.emit_observed_typed_native_memory_artifact(typed, 'arm64-macos', {binaryEncoding: encoding}, observer);
  assert.deepEqual(observed, plain);assert.deepEqual(typed, saved);
  assert.equal(phases.find(item => item.phase === 'native-code-progress').calls, 128);
  assert.equal(phases.find(item => item.phase === 'native-code-complete').calls, 129);
  assert.equal(phases.find(item => item.phase === 'native-code-complete').branches, 0);
});

test('private native phase observations contain bounded scalars and cannot change image debug or the original failure', () => {
  const typed = {abi: 'memory-u32', filename: 'observer.eli', exports: ['f0'],
    functions: Array.from({length: 257}, (_, index) => ({name: 'f' + index, index, arity: 0, locals: [],
      body: literal(index), span}))};
  const saved = structuredClone(typed), phases = [], observationError = {observer: 'ignored'};
  const observer = (phase, counts) => {
    assert.deepEqual(Object.keys(counts), ['count', 'words', 'branches', 'calls']);
    for (const value of Object.values(counts)) assert(Number.isSafeInteger(value) && value >= 0);
    phases.push({phase, ...counts});
    for (const key of Object.keys(counts)) counts[key] = -100;
    counts.typed = {changed: true};throw observationError;
  };
  for (const method of ['emit_typed_native_memory_object', 'emit_typed_native_memory_library', 'emit_typed_native_memory_artifact']) {
    phases.length = 0;
    // The original optional options parameter has a JS default, so only
    // program and target contribute to the public Function.length.
    assert.equal(backend.native[method].length, 2, 'the original public emitter arity stays unchanged');
    const baseline = backend.native[method](typed, 'arm64-macos', {binaryEncoding: encoding});
    const observedMethod = method.replace('emit_typed_', 'emit_observed_typed_');
    const observed = backend.native[observedMethod](typed, 'arm64-macos', {binaryEncoding: encoding}, observer);
    assert.deepEqual(observed, baseline);
    assert.deepEqual(phases.map(record => record.phase), ['native-prepare-start', 'native-prepare-complete',
      'native-code-start', 'native-code-progress', 'native-code-progress', 'native-code-complete',
      'native-container-start', 'native-container-complete']);
    assert.deepEqual(phases.filter(record => record.phase === 'native-code-progress').map(record => record.count), [128, 256]);
    assert(phases.find(record => record.phase === 'native-code-complete').words > 0);
    assert.deepEqual(typed, saved);
  }
  const bad = structuredClone(typed);bad.functions[0].index = 1;
  const caught = operation => {try {operation();assert.fail('expected the original rejection');} catch (error) {return error;}};
  const before = caught(() => backend.native.emit_typed_native_memory_artifact(bad, 'arm64-macos'));
  const after = caught(() => backend.native.emit_observed_typed_native_memory_artifact(bad, 'arm64-macos', {}, observer));
  assert.deepEqual(after, before);assert.equal(after.eliscriptDiagnostic.code, 'ELI-B0001');
  const original = {container: 'first failure'};
  const options = {get phaseObserver() {throw Error('public options observer must not be read');}, get binaryEncoding() {throw original;}};
  assert.throws(() => backend.native.emit_observed_typed_native_memory_artifact(typed, 'arm64-macos', options, observer), error => error === original);
  assert.throws(() => backend.native.emit_typed_native_memory_artifact(typed, 'arm64-macos',
    {get phaseObserver() {throw observationError;}, get binaryEncoding() {throw original;}}), error => error === original);
});

test('native observation is selected only by private session state and JSON cannot inject an observer', () => {
  const request = JSON.parse('{"binaryEncoding":"u16le-chunks","phaseObserver":{"call":"fake"},"nativePhaseObserver":true}');
  const plain = sessionOptions.session_binary_options(request, 'object');
  assert.deepEqual(plain, {format: 'object', binaryEncoding: encoding});
  assert.equal(sessionOptions.session_native_observer({phaseObserver: null}), null);
  const accessorRequest = {binaryEncoding: encoding, get phaseObserver() {throw Error('request diagnostic field was read');}};
  assert.deepEqual(sessionOptions.session_binary_options(accessorRequest, 'object'), plain);
  let calls = 0;
  const observer = () => {calls++;};
  const local = sessionOptions.session_native_observer({phaseObserver: observer});
  assert.strictEqual(local, observer);
  const typed = program(), saved = structuredClone(typed);
  assert.deepEqual(backend.native.emit_typed_native_memory_object(typed, 'arm64-macos', plain),
    backend.native.emit_observed_typed_native_memory_object(typed, 'arm64-macos', plain, local));
  assert.equal(calls, 6);
  assert.deepEqual(typed, saved);
  assert.equal(sessionOptions.session_native_observer({get phaseObserver() {throw Error('private observer unavailable');}}), null);
});

function validationProgram(body, locals = []) {
  return {abi: 'memory-u32', filename: span.filename, exports: ['f'],
    functions: [{name: 'f', index: 0, arity: 0, locals, body, span}]};
}
function captureFailure(operation) {
  try {operation();} catch (error) {return error;}
  assert.fail('expected the original validation rejection');
}
test('fresh native preparation visits shared typed DAG nodes once in each pass and keeps the original public getter counts', () => {
  const depth = 9;
  let reads = 0, body = {...literal(0), get kind() {reads++;return 'literal';}};
  for (let level = 0; level < depth; level++) {
    const child = body;
    body = {type: 'u32', value: null, children: [child, child], get kind() {reads++;return 'sequence';}};
  }
  const typed = validationProgram(body);
  const original = assembly.memory_prepare_program(typed);
  assert.equal(reads, 2 * (2 ** (depth + 1) - 1), 'both original DFS passes observe every incoming edge');
  reads = 0;
  const fresh = assembly.memory_prepare_fresh_program(typed);
  assert.equal(reads, 2 * (depth + 1), 'the capability scan and typed validation each finish every distinct node once');
  assert.deepEqual(fresh, original);
  assert.strictEqual(fresh.functions[0].body, body, 'the optimization does not clone or discard public typed data');
  typed.functions.push({...typed.functions[0], name: 'g', index: 1});typed.exports.push('g');reads = 0;
  assembly.memory_prepare_fresh_program(typed);
  assert.equal(reads, 4 * (depth + 1), 'memo lifetime is one function, not a whole program or another compilation');
  for (const method of ['emit_typed_native_memory_object', 'emit_typed_native_memory_library', 'emit_typed_native_memory_artifact']) {
    let visits = 0;
    const first = {first: method};
    const leaf = {type: 'u32', value: 0, children: [], get kind() {if (++visits === 2) throw first;return 'literal';}};
    const request = validationProgram(node('sequence', 'u32', null, [leaf, leaf]));
    assert.throws(() => backend.native[method](request, 'arm64-macos', {fresh: true}), error => error === first);
    assert.equal(visits, 2, 'a caller options field cannot select the private fresh path or hide its getter');
  }
});

test('fresh native validation preserves function local context capability first-DFS order and all original first rejections', () => {
  const shared = local(0), body = node('sequence', 'u32', null, [shared, literal(0)]);
  const typed = validationProgram(body, [{name: 'n', index: 0, type: 'u32'}]);
  typed.functions.push({name: 'g', index: 1, arity: 0, body, locals: [{name: 'n', index: 0, type: 'f64'}]});
  const original = captureFailure(() => assembly.memory_prepare_program(typed));
  const fresh = captureFailure(() => assembly.memory_prepare_fresh_program(typed));
  assert.deepEqual(fresh, original);
  assert.equal(fresh.message, 'native typed local index or type is invalid');
  const host = name => node('host-call', 'u32', name, [literal(0), literal(0)]);
  const log = host('console-log'), source = host('source-operation'), captured = host('console-log-capture');
  const common = node('sequence', 'u32', null, [log, source, log]);
  const calls = validationProgram(node('sequence', 'u32', null, [common, captured, common]));
  const definitions = capabilities.prepare_host_capabilities(calls);
  assert.deepEqual(definitions.map(record => record.name), ['console-log', 'source-operation', 'console-log-capture']);
  assert.deepEqual(capabilities.prepare_fresh_host_capabilities(calls), definitions);
  calls.hostCapabilities = structuredClone(definitions);
  assert.deepEqual(assembly.memory_prepare_fresh_program(calls), assembly.memory_prepare_program(calls));
  const malformed = node('sequence', 'u32', null, []);malformed.children = null;
  const invalid = [validationProgram(node('sequence', 'u32', null, [common, malformed, host('unknown-host')])),
    {...calls, hostCapabilities: []}, {...calls, hostCapabilities: [{...definitions[0], arity: 3}, ...definitions.slice(1)]},
    validationProgram(node('host-call', 'u32', 'console-log', [literal(0)])),
    validationProgram(node('memory-data-copy', 'u32', 'x', [node('literal', 'f64', 0)])),
    validationProgram(node('call', 'u32', 9, [])),
    {...calls, table: [99]}, {...calls, aliases: [{name: 'f', function: 'f'}]}];
  for (const input of invalid) {
    const before = captureFailure(() => assembly.memory_prepare_program(input));
    const after = captureFailure(() => assembly.memory_prepare_fresh_program(input));
    assert.deepEqual(after, before, 'shared traversal does not skip validation or replace the first rejection');
    assert.equal(after.eliscriptDiagnostic.code, 'ELI-B0001');
  }
  const repair = validationProgram(malformed);
  assert.equal(captureFailure(() => assembly.memory_prepare_fresh_program(repair)).message,
    'typed capability scan requires a children array');
  malformed.children = [];
  assert.deepEqual(assembly.memory_prepare_fresh_program(repair), assembly.memory_prepare_program(repair));
});

test('session fresh native emitters retain complete typed data and emit exactly the public images debug metadata and failures', () => {
  const typed = program(), saved = structuredClone(typed);
  for (const platform of ['arm64-macos', 'arm64-linux'])
    for (const suffix of ['object', 'library', 'artifact']) {
      const regular = backend.native['emit_observed_typed_native_memory_' + suffix];
      const fresh = backend.native['emit_fresh_observed_typed_native_memory_' + suffix];
      const options = {binaryEncoding: encoding};
      assert.deepEqual(fresh(typed, platform, options, null), regular(typed, platform, options, null));
      assert.deepEqual(typed, saved);
      const bad = structuredClone(typed);bad.functions[0].body.children = null;
      assert.deepEqual(captureFailure(() => fresh(bad, platform, options, null)),
        captureFailure(() => regular(bad, platform, options, null)));
    }
}, 30000);

test('compact native object and library bytes preserve both target images, page signatures and all debug offsets', () => {
  const typed = program(), saved = structuredClone(typed), sourceBytes = utf16(text);
  for (const platform of ['arm64-macos', 'arm64-linux']) for (const format of ['object', 'library']) {
    const ordinary = backend.native.emit_typed_native_memory_artifact(typed, platform, {format});
    const compact = backend.native.emit_typed_native_memory_artifact(typed, platform, {format, binaryEncoding: encoding});
    assert(Array.isArray(ordinary.bytes), 'the existing public byte-array ABI stays unchanged');
    const expected = Uint8Array.from(ordinary.bytes);
    checkCompact(compact.bytes, expected);
    assert.deepEqual(compact.debug, ordinary.debug, 'binary storage does not relabel functions, constants, ranges or traps');
    const ranges = compact.debug.ranges.filter(range => range.kind === 'static-data');
    assert(ranges.length > 1, 'the fixture crosses the actual bounded native static-data blocks');
    const recorded = [];
    for (const range of ranges) recorded.push(...expected.subarray(compact.debug.codeSection.fileOffset + range.start,
      compact.debug.codeSection.fileOffset + range.end));
    assert.deepEqual(Uint8Array.from(recorded).subarray(0, sourceBytes.length), sourceBytes);
    assert(compact.debug.trapSites.some(site => site.code === 1 && site.functionIndex === 0));
    if (platform === 'arm64-macos' && format === 'library') checkMachOPages(expected);
    const emit = format === 'object' ? backend.native.emit_typed_native_memory_object : backend.native.emit_typed_native_memory_library;
    const plainBytes = emit(typed, platform), compactBytes = emit(typed, platform, {binaryEncoding: encoding});
    assert(Array.isArray(plainBytes));checkCompact(compactBytes, Uint8Array.from(plainBytes));
    assert.deepEqual(typed, saved);
  }
}, 30000);

test('compiler binary decoding preserves canonical odd bytes, chunk boundaries and unpaired UTF16 units', () => {
  for (const length of [0, 1, 2, 3, 4095, 4096, 4097, 8191, 8192, 8193]) {
    const bytes = Uint8Array.from({length}, (_, i) => (i * 37 + 0xd8) & 255);
    const wire = packed(bytes);Object.freeze(wire.chunks);Object.freeze(wire);
    checkCompact(wire, bytes);
    assert.deepEqual(decodeCompilerBinary([...bytes]), bytes);
    assert.deepEqual(decodeCompilerBinary(bytes), bytes);
  }
  const bytes = Uint8Array.of(0, 0xd8, 0xff, 0xdb, 0, 0xdc, 0xff, 0xdf, 0, 0, 255, 255);
  const wire = packed(bytes);
  assert.deepEqual([...wire.chunks[0]].map(unit => unit.charCodeAt(0)).slice(0, 2), [0xd800, 0xdbff]);
  checkCompact(wire, bytes);
});

test('native emitters and compiler decoding reject unsupported or noncanonical binary encodings', () => {
  const typed = program(), saved = structuredClone(typed);
  for (const bad of ['base64-chunks', 'unknown', '', 1, false, null, {}]) {
    for (const method of ['emit_typed_native_memory_object', 'emit_typed_native_memory_library', 'emit_typed_native_memory_artifact'])
      assert.throws(() => backend.native[method](typed, 'arm64-macos', {binaryEncoding: bad}));
    assert.deepEqual(typed, saved);
  }
  const cases = [undefined, null, false, 'bytes', {}, {encoding: 'base64-chunks', byteLength: 0, chunks: []},
    ...[-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(byteLength => ({encoding, byteLength, chunks: []})),
    {encoding, byteLength: 0, chunks: ['']}, {encoding, byteLength: 1, chunks: []},
    {encoding, byteLength: 1, chunks: [String.fromCharCode(0x1234)]},
    {encoding, byteLength: 2, chunks: [false]}, {encoding, byteLength: 2, chunks: new Array(1)},
    {encoding, byteLength: 2, chunks: '\0'}, {encoding, byteLength: 2, chunks: ['ab']},
    {encoding, byteLength: 4098, chunks: ['x'.repeat(2047), 'xx']},
    {encoding, byteLength: 4098, chunks: ['x'.repeat(2049)]},
    {encoding, byteLength: 4096, chunks: ['x'.repeat(2048), '']},
    [-1], [256], [1.5], [NaN], new Array(1),
  ];
  for (const value of cases) assert.throws(() => decodeCompilerBinary(value));
});

test.skipIf(!target)('the actual compact native shared library executes exact UTF16, negative zero, payloads and traps against WASM', async () => {
  const typed = program(), saved = structuredClone(typed), memory = {initialPages: 1, maximumPages: 1};
  const wasmModule = new WebAssembly.Module(Uint8Array.from(backend.wasm.emit_typed_memory_wasm(typed, memory)));
  assert.deepEqual(WebAssembly.Module.imports(wasmModule), []);
  const w = new WebAssembly.Instance(wasmModule).exports;
  const compact = backend.native.emit_typed_native_memory_artifact(typed, target, {binaryEncoding: encoding});
  const path = resolve(directory, 'compact.' + (target === 'arm64-linux' ? 'so' : 'dylib'));
  await writeFile(path, decodeCompilerBinary(compact.bytes));
  let n;
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  try {
    WebAssembly.Module = function () {throw Error('native loader attempted WASM substitution');};
    WebAssembly.Instance = function () {throw Error('native loader attempted WASM substitution');};
    n = await openNativeMemory(path, {copy: 1, zero: 1, outer: 1, read: 1, copy64: 2},
      {...memory, nativeTarget: target, debug: compact.debug, trapSites: compact.debug.trapSites});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
  try {
    const expected = utf16(text);
    for (const at of [0, 3, 65536 - expected.length]) {
      assert.equal(n.invoke('copy', at), w.copy(at) >>> 0);
      assert.deepEqual(n.read(at, expected.length), expected);
      assert.deepEqual(n.read(at, expected.length), new Uint8Array(w.memory.buffer).slice(at, at + expected.length));
    }
    for (const at of [3, 65528]) {
      assert.equal(n.invoke('zero', at), w.zero(at) >>> 0);
      assert(Object.is(new DataView(n.read(at, 8).buffer).getFloat64(0, true), -0));
      assert.deepEqual(n.read(at, 8), new Uint8Array(w.memory.buffer).slice(at, at + 8));
    }
    for (const bits of [0x8000000000000000n, 0x7ff8000012345678n, 0x7ff0000012345678n, 0xffffffffffffffffn]) {
      const bytes = new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0, bits, true);
      n.write(bytes, 123);new Uint8Array(w.memory.buffer).set(bytes, 123);
      assert.equal(n.invoke('copy64', 321, 123), w.copy64(321, 123) >>> 0);
      assert.deepEqual(n.read(321, 8), bytes);assert.deepEqual(n.read(321, 8), new Uint8Array(w.memory.buffer).slice(321, 329));
    }
    n.write(Uint8Array.of(0, 0), 0);new Uint8Array(w.memory.buffer).set([0, 0], 0);
    const invalid = 65537 - expected.length;
    assert.throws(() => n.invoke('outer', invalid), WebAssembly.RuntimeError);
    assert.throws(() => w.outer(invalid), WebAssembly.RuntimeError);
    assert.deepEqual(n.read(0, 2), Uint8Array.of(0, 0));
    assert.deepEqual(new Uint8Array(w.memory.buffer).slice(0, 2), Uint8Array.of(0, 0));
    assert.equal(n.invoke('copy', 3), w.copy(3) >>> 0);
    assert.deepEqual(n.read(3, expected.length), expected);
    assert.deepEqual(typed, saved);
  } finally {n.close();}
}, 30000);
