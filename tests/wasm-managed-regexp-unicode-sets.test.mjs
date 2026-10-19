import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const fixture = 'tests/fixtures/wasm-managed-regexp-unicode-sets.eli';
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const options = {maxSlots: 2048, initialBytes: 65536, maxBytes: 1048576, maximumPages: 32};
// Each independent expectation is a full match, not merely agreement with the
// generated JS. The v/u folding contrast is deliberately kept as two cases.
const vectors = [
  [String.raw`[[a-c][x-z]]+`, 'v', 'xbaz!', 'xbaz', 0],
  [String.raw`[\p{ASCII}&&\p{Letter}]+`, 'v', '1AzΩ', 'Az', 1],
  [String.raw`[[a-z]--[aeiou]]+`, 'v', 'abcde', 'bcd', 1],
  [String.raw`[\d&&[0-5]]+`, 'v', '9a01256', '0125', 2],
  [String.raw`[\p{Script=Greek}&&\p{Letter}]+`, 'v', 'aαβ1', 'αβ', 1],
  [String.raw`[\p{ASCII}--\p{Number}]+`, 'v', '123A_Ω', 'A_', 3],
  [String.raw`[\u{1F600}-\u{1F601}]`, 'v', 'x😁', '😁', 1],
  [String.raw`\P{Lowercase_Letter}`, 'iu', 'a', 'a', 0],
  [String.raw`\P{Lowercase_Letter}`, 'iv', 'a', null, null],
  [String.raw`[a-z]`, 'iv', 'K', 'K', 0],
  [String.raw`^([\q{ab|a|}])$`, 'dv', 'ab', 'ab', 0],
  [String.raw`^([\q{ab|a|}])$`, 'dv', '', '', 0],
  [String.raw`^([\q{ab|a}])b$`, 'dv', 'ab', 'ab', 0],
  [String.raw`(?<=([\q{ab|b}]))c`, 'dv', 'abc', 'c', 2],
  [String.raw`(?<=([\q{ab|b}]))c`, 'dv', 'bc', 'c', 1],
  [String.raw`[[\q{ab|abc|x}]&&[\q{abc|x}]]`, 'v', 'abc', 'abc', 0],
  [String.raw`[[\q{ab|abc|x}]--[\q{ab}]]`, 'v', 'abc', 'abc', 0],
  [String.raw`^[\(\)\[\]\{\}\/\-\|]$`, 'v', '(', '(', 0],
  [String.raw`^[\!\#\$\%\&\*\+\,\.\:\;\<\=\>\?\@\^\x60\~]$`, 'v', '&', '&', 0],
  [String.raw`(.)`, 'dv', '😀', '😀', 0], [String.raw`(\uD800)`, 'dv', '\ud800', '\ud800', 0],
];
const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const stringProperties = [
  ['Basic_Emoji', '😀', true], ['Basic_Emoji', '©️', true], ['Basic_Emoji', '©', false],
  ['Emoji_Keycap_Sequence', '1️⃣', true], ['Emoji_Keycap_Sequence', '1', false],
  ['RGI_Emoji_Modifier_Sequence', '👍🏽', true], ['RGI_Emoji_Modifier_Sequence', '🏽', false],
  ['RGI_Emoji_Flag_Sequence', '🇨🇳', true], ['RGI_Emoji_Flag_Sequence', '🇨', false],
  ['RGI_Emoji_Tag_Sequence', england, true], ['RGI_Emoji_Tag_Sequence', '🏴', false],
  ['RGI_Emoji_ZWJ_Sequence', '👩‍💻', true], ['RGI_Emoji_ZWJ_Sequence', '👨‍👩‍👧‍👦', true],
  ['RGI_Emoji_ZWJ_Sequence', '👩', false], ['RGI_Emoji', england, true],
  ['RGI_Emoji', '1️⃣', true], ['RGI_Emoji', '👍🏽', true], ['RGI_Emoji', 'a', false],
];
const invalid = [
  ['a', 'uv'], ['a', 'vv'], ['a', 'vx'], [String.raw`\p{RGI_Emoji}`, 'u'],
  ...[String.raw`[a&&]`, String.raw`[&&a]`, String.raw`[a--]`, String.raw`[--a]`,
    String.raw`[a&&b--c]`, String.raw`[ab&&c]`, String.raw`[a-b-c]`,
    String.raw`[\d-a]`, String.raw`[a-\d]`, String.raw`[\p{ASCII}-z]`,
    String.raw`[a(b]`, String.raw`[a{b]`, String.raw`[a/b]`,
    String.raw`[\q{a|b]`, String.raw`\q{ab}`, String.raw`[^\q{ab}]`, String.raw`[^\q{}]`,
    String.raw`\P{RGI_Emoji}`, String.raw`[^\p{Basic_Emoji}]`,
    String.raw`[^[[\q{ab}]&&[\q{ab}]]]`, String.raw`[\u{110000}]`,
    ...['!!', '##', '$$', '%%', '**', '++', ',,', '..', '::', ';;', '<<', '==', '>>', '??', '@@', '^^', '``', '~~']
      .map(punctuation => '[a' + punctuation + 'b]')].map(pattern => [pattern, 'v']),
];
let directory, backend, lowered, bytes, wasmFile, nativeFile, referenceFile, reference, rawProgram;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-regexp-v-'));
  backend = await buildBackends({outputRoot: directory});
  const program = backend.compiler.compile_ir_string(await readFile(fixture, 'utf8'), fixture), saved = JSON.stringify(program);
  const pending = [program];let rawNode;
  while (pending.length) {
    const item = pending.pop();if (!item || typeof item !== 'object') continue;
    if (item.kind === 'raw-javascript' && item.children?.[0]?.value?.includes('xy|')) {rawNode = item;break;}
    pending.push(...Object.values(item));
  }
  assert(rawNode);rawProgram = backend.regexp.compile_regexp_literal(rawNode);
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime, true);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  wasmFile = resolve(directory, 'unicode-sets.wasm');await writeFile(wasmFile, bytes);
  if (target) {
    nativeFile = resolve(directory, target === 'arm64-linux' ? 'unicode-sets.so' : 'unicode-sets.dylib');
    await writeFile(nativeFile, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, target)));
  }
  referenceFile = resolve(directory, 'unicode-sets.mjs');await writeFile(referenceFile, backend.compiler.emit_ir_string(program));
  // Import the exact real file through its canonical URL: Bun's module cache
  // can reject a just-created file reached through the macOS /var alias.
  referenceFile = await realpath(referenceFile);
  reference = await import(pathToFileURL(referenceFile).href);assert.equal(JSON.stringify(program), saved);
}, 120000);
afterAll(async () => {lowered = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

function invoke(a, name, values = []) {
  const owned = [], args = values.map(value => {
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const handle = typeof value === 'string' ? a.string(value) : a.number(value);owned.push(handle);return handle;
  });
  try {return a.invoke(name, args);} finally {for (const value of owned) a.release(value);}
}
function text(a, name, values = []) {
  const value = invoke(a, name, values);try {return a.readString(value);} finally {a.release(value);}
}
function finish(a) {
  try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  finally {a.close?.();}
}
async function each(run, extra = {}) {
  for (const kind of target ? ['wasm', 'native'] : ['wasm']) {
    const configuration = {...options, ...extra};
    const a = kind === 'wasm' ? instantiateManagedRuntime(bytes, configuration)
      : await instantiateNativeManagedRuntime(nativeFile, lowered, {...configuration, nativeTarget: target});
    a.auto(1);try {await run(a, kind);} finally {finish(a);}
  }
}
function matches(a, js, records) {
  for (const [pattern, flags, input, expected, offset] of records) {
    const regex = invoke(a, 'make', [pattern, flags]), oracle = js.make(pattern, flags);let actual;
    try {
      actual = invoke(a, 'exec', [regex, input]);const result = js.exec(oracle, input);
      assert.equal(result?.[0] ?? null, expected);assert.equal(result?.index ?? null, offset);
      assert.equal(text(a, 'report', [actual]), js.report(result), JSON.stringify([pattern, flags, input]));
      assert.equal(text(a, 'meta', [regex]), js.meta(oracle));
    } finally {a.release(actual);a.release(regex);a.collect();assert.equal(a.stats().frameDepth, 0);}
  }
}
function properties(a, js, records) {
  for (const [property, input, expected] of records) {
    const pattern = '^\\p{' + property + '}$', regex = invoke(a, 'make', [pattern, 'v']);
    try {assert.equal(js.test_value(js.make(pattern, 'v'), input), expected, property + '/' + input);
      assert.equal(invoke(a, 'test-value', [regex, input]), expected, property + '/' + input);}
    finally {a.release(regex);a.collect();}
  }
}
function lifecycle(a, js, rejected) {
  const literal = invoke(a, 'literal'), original = js.literal(), zero = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, zero);
  try {
    assert.equal(text(a, 'meta', [literal]), js.meta(original));
    assert.equal(invoke(a, 'accessor', [literal]), true);
    for (const flags of [undefined, 'iv', 'v']) {
      const clone = invoke(a, 'clone', [literal, flags]);
      try {assert.equal(a.keyEqual(literal, clone), false);assert.equal(text(a, 'meta', [clone]), js.meta(js.clone(original, flags)));}
      finally {a.release(clone);}
    }
    const simple = invoke(a, 'make', ['a', 'v']), simpleClone = invoke(a, 'clone', [simple, 'u']);
    try {assert.equal(text(a, 'meta', [simpleClone]), js.meta(js.clone(js.make('a', 'v'), 'u')));}
    finally {a.release(simpleClone);a.release(simple);}
    assert.equal(text(a, 'override-report'), js.override_report());
    for (const receiver of [null, undefined, false]) assert.throws(() => invoke(a, 'accessor', [receiver]), TypeError);
    for (const [pattern, flags] of rejected) {
      assert.throws(() => js.make(pattern, flags), SyntaxError, pattern + '/' + flags);
      assert.throws(() => invoke(a, 'make', [pattern, flags]), SyntaxError, pattern + '/' + flags);
      assert.equal(a.stats().frameDepth, 1);
    }
    assert.throws(() => invoke(a, 'throwing', [literal]), error => error === false);
    assert.throws(() => js.throwing(original), error => error === false);
    assert(Object.is(a.readNumber(zero), -0));assert.equal(text(a, 'recover'), js.recover());
  } finally {a.leaveFrame(frame);a.release(zero);a.release(literal);}
}
function progress(a, js) {
  for (const [pattern, flags, input] of [[String.raw`[\q{ab|a|}]`, 'dgv', 'ab😀'],
    [String.raw`[\q{|😀}]`, 'dgv', '😀'], [String.raw`[\q{ab|a}]`, 'dgyv', 'abaa']]) {
    const regex = invoke(a, 'make', [pattern, flags]), oracle = js.make(pattern, flags);let held;
    try {
      assert.equal(text(a, 'all', [regex, input]), js.all(oracle, input));
      assert.equal(text(a, 'all', [regex, input]), js.all(oracle, input));
      for (const start of [0, 1, input.length + 1]) {
        a.release(invoke(a, 'last', [regex, start]));js.last(oracle, start);
        held = invoke(a, 'exec', [regex, input]);const saved = js.exec(oracle, input), savedReport = js.report(saved);
        assert.equal(text(a, 'report', [held]), savedReport);a.collect();
        const next = invoke(a, 'exec', [regex, 'other']);js.exec(oracle, 'other');a.release(next);
        assert.equal(text(a, 'report', [held]), savedReport);
        assert.equal(text(a, 'meta', [regex]), js.meta(oracle));a.release(held);held = undefined;
      }
    } finally {a.release(held);a.release(regex);}
  }
}

test('Given nested v sets When union intersection subtraction ranges escapes and case complements execute Then full captures and UTF16 offsets match independent expectations', async () => {
  await each(a => matches(a, reference, vectors));
}, 30000);
test('Given all seven Unicode string properties When emoji sequences match Then ZWJ variation modifier flag tag and keycap boundaries stay exact', async () => {
  await each(a => properties(a, reference, stringProperties));
}, 30000);
test('Given static dynamic cloned and overridden v regexes When accessed or rejected Then original prototype flags first errors and GC recovery survive', async () => {
  await each(a => lifecycle(a, reference, invalid));
}, 30000);
test('Given nullable v strings with global sticky matching When matchAll advances Then codepoint progress saved results and separate instances retain independent state', async () => {
  await each(a => progress(a, reference));await each(a => progress(a, reference));
}, 30000);
test('Given explicit Unicode profiles When stable and newly assigned codepoints match Then versioned expectations are separate from host JS data', async () => {
  for (const unicodeVersion of [15.1, 16, 17]) await each(a => {
    assert.equal(a.unicodeVersion, unicodeVersion);
    properties(a, reference, stringProperties);
    for (const [input, expected] of [['\u1c89', unicodeVersion >= 16], ['\u{1faea}', unicodeVersion >= 17]]) {
      const regex = invoke(a, 'make', [String.raw`^\p{Assigned}$`, 'v']);
      try {assert.equal(invoke(a, 'test-value', [regex, input]), expected, unicodeVersion + '/' + input);}
      finally {a.release(regex);}
    }
  }, {unicodeVersion});
}, 30000);
test('Given a cold emoji data cache When ordinary and string-property regexes collect Then only the necessary shared data survives until module close', async () => {
  await each(a => {
    const check = (pattern, input) => {
      const regex = invoke(a, 'make', [pattern, 'v']);
      try {assert.equal(invoke(a, 'test-value', [regex, input]), true);} finally {a.release(regex);}
      a.collect();assert.equal(a.stats().frameDepth, 0);return a.stats().usedBytes;
    };
    check('^a$', 'a');const plain = check('^a$', 'a');
    assert.equal(check('^a$', 'a'), plain, 'ordinary matching does not initialize an unrelated emoji table');
    const cached = check(String.raw`^\p{Basic_Emoji}$`, '😀');
    assert(cached > plain, 'the actual fixed emoji data becomes live only when requested');
    for (let round = 0; round < 3; round++)
      assert.equal(check(String.raw`^\p{Basic_Emoji}$`, '😀'), cached, 'GC retains one reusable cache rather than one per match');
    // each() closes the real module and requires both heap live count and
    // frame depth to become zero, including this necessary cache root.
  });
}, 30000);

test('Given v expression bytecode When checker boundaries are corrupted Then malformed references metadata scalars and jumps fail before VM execution', () => {
  const e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const heap = e['heap-new'](256, 16384, 1048576), saved = JSON.stringify(rawProgram);
  const call = (name, ...args) => {
    const value = e[name](heap, ...args) >>> 0, error = e['last-error']();
    if(error!==0)assert.fail(name+': '+JSON.stringify({error,usedBytes:e['heap-used'](heap),capacityBytes:e['heap-capacity'](heap),
      liveValues:e['heap-live'](heap),frameDepth:e['frame-depth'](heap),linearBytes:e.memory.buffer.byteLength}));
    return value;
  };
  const string = value => {const handle = call('value-string', value.length);call('heap-pin', handle);
    for (let index = 0; index < value.length; index++) call('value-unit-set', handle, index, value.charCodeAt(index));
    call('value-seal', handle);return handle;};
  const code = rows => {const handle = call('value-bytes', rows.length * 16);call('heap-pin', handle);
    for (let row = 0; row < rows.length; row++) for (let field = 0; field < 4; field++)
      call('value-regexp-code-word', handle, row * 4 + field, rows[row][field]);return handle;};
  const source = string(rawProgram.source), input = string('a');
  const valid = code(rawProgram.code), regex = call('value-regexp-new', valid, source, rawProgram.flags, rawProgram.groups, rawProgram.guards);
  call('heap-pin', regex);
  for (let index = 0; index < rawProgram.code.length * 16; index++) call('value-byte-set', valid, index, 255);
  call('heap-release', valid);call('heap-collect');
  // The raw API starts in manual-GC mode. Matching this complete set visits
  // the emoji alternatives and exhausts 256 slots before reclaiming temporary
  // values; the byte budget is still available. Keep that refusal and prove
  // the identical input recovers with collection under the identical limits.
  e['value-regexp-run'](heap, regex, input, 0);
  assert.equal(e['last-error'](), 2);assert.equal(e['heap-live'](heap), 256);
  assert.equal(e['frame-depth'](heap), 0);
  call('heap-collect');assert(call('heap-live') < 256);
  call('heap-auto', 1);
  const result = call('value-regexp-run', regex, input, 0);assert.equal(result, 2); // Runtime true immediate, not a host matcher.
  const indices = new Map();rawProgram.code.forEach((row, index) => {if (!indices.has(row[0])) indices.set(row[0], index);});
  for (const op of [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34]) assert(indices.has(op), 'real compiled set must retain checker opcode ' + op);
  const header = indices.get(23), metadata = header + 1, data = indices.get(32), union = rawProgram.code[header][1], literal = indices.get(31);
  assert.equal(rawProgram.code[metadata][0], 34);
  assert.equal(rawProgram.code[union][0], 24);
  const mutations = [
    ['root metadata', rows => {rows[header][1] = metadata;}],
    ['block end outside', rows => {rows[header][3] = rows.length + 1;}],
    ['scope outside', rows => {rows[header][2] = 512;}],
    ['maximum outside', rows => {rows[metadata][1] = 65536;}],
    ['maximum too small', rows => {rows[metadata][1] = 0;}],
    ['nonboolean string marker', rows => {rows[metadata][2] = 2;}],
    ['reserved metadata', rows => {rows[metadata][3] = 1;}],
    ['self reference', rows => {rows[union][1] = union;}],
    ['forward reference', rows => {rows[union][2] = union + 1;}],
    ['metadata reference', rows => {rows[union][1] = metadata;}],
    ['string data reference', rows => {rows[union][1] = data;}],
    ['bad string length', rows => {rows[literal][1] = rows.length + 1;}],
    ['outside string data', rows => {rows[literal][2] = 0;}],
    ['point outside Unicode', rows => {rows[data][1] = 1114112;}],
    ['unknown string property', rows => {rows[indices.get(33)][1] = 8;}],
    ['unknown point property', rows => {rows[indices.get(30)][1] = 0;}],
    ['invalid complement marker', rows => {rows[indices.get(30)][2] = 2;}],
    ['unknown opcode', rows => {rows[union][0] = 35;}],
    ['jump into block', rows => {rows[0] = [6, header + 2, 0, 0];}],
    ['negated strings', rows => {const root = rows[header][1];rows[root] = [27, literal, 0, 0];rows[metadata][2] = 0;}],
  ];
  for (const [label, change] of mutations) {
    const rows = rawProgram.code.map(row => row.slice());change(rows);const value = code(rows);
    try {e['value-regexp-new'](heap, value, source, rawProgram.flags, rawProgram.groups, rawProgram.guards);
      assert.equal(e['last-error'](), 3, label);} finally {call('heap-release', value);}
  }
  const value = code(rawProgram.code);
  e['value-regexp-new'](heap, value, source, rawProgram.flags | 4, rawProgram.groups, rawProgram.guards);
  assert.equal(e['last-error'](), 3, 'u and v are mutually exclusive even for raw programs');
  e['value-regexp-new'](heap, value, source, rawProgram.flags | 256, rawProgram.groups, rawProgram.guards);
  assert.equal(e['last-error'](), 3, 'raw programs reject flags outside the complete public mask');
  for (const handle of [value, regex, source, input]) call('heap-release', handle);
  call(lowered.descriptor.module.close);call('heap-collect');assert.equal(call('heap-live'), 0);assert.equal(call('frame-depth'), 0);
  assert.equal(JSON.stringify(rawProgram), saved);
});

test('Given the identical v fixture When independent Node executes its real WASM Then source semantics emoji profiles and recovery match without host matcher substitution', () => {
  const script = `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const{options,vectors,stringProperties,invalid}=JSON.parse(readFileSync(0,'utf8'));
const js=await import(process.argv[1]);const{instantiateManagedRuntime}=await import(process.argv[2]);
const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
${invoke.toString()}
${text.toString()}
${finish.toString()}
${matches.toString()}
${properties.toString()}
${lifecycle.toString()}
${progress.toString()}
const a=instantiateManagedRuntime(bytes,options);a.auto(1);
try{matches(a,js,vectors);properties(a,js,stringProperties);lifecycle(a,js,invalid);progress(a,js);}finally{finish(a);}
process.stdout.write('complete Unicode set source contracts preserved');`;
  const child = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval', script,
    pathToFileURL(referenceFile).href, new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href, wasmFile],
  {encoding: 'utf8', input: JSON.stringify({options, vectors, stringProperties, invalid}), timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'complete Unicode set source contracts preserved');
}, 30000);
