import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {encodeCompilerIR, encodeCompilerMetadata, forEachCompilerMetadataChunk} from '../tools/backends/compiler-session.mjs';
import {saveCompilerMetadata} from '../tools/backends/compiler-bootstrap.mjs';
import {compilerMetadataDigest, independentCompilerProductIdentity, writeCompilerMetadata} from '../tools/backends/compiler-build.mjs';
import {archiveProduct} from '../tools/backends/compiler-matrix.mjs';
import {createCompilerMetadataDecoder, readCompilerMetadata, decodeCompilerMetadataBytes} from '../tools/backends/compiler-metadata.mjs';
import {createCompilerDebugMap, ownCompilerDebugDocument} from '../tools/backends/compiler-debug.mjs';

test('fresh authenticated debug documents avoid a second graph while public maps retain their snapshot and exact frames', () => {
  function document() {
    const span = {filename: '中😀\\ud800.eli', start: 0, end: 9, line: 1, column: 1, endLine: 1, endColumn: 10};
    return {format: 'eliscript-wasm-source-map', version: 1, target: 'wasm', offsetUnit: 'byte', offsetBase: 'module',
      codeSection: {payloadStart: 10, end: 100},
      functions: [{name: 'run', index: 0, body: {start: 12, end: 95}, instructions: {start: 20, end: 90}, span}],
      ranges: [{start: 20, end: 40, functionIndex: 0, depth: 1, span}],
      sources: [{id: 'entry.mjs', filename: span.filename, macroOrigins: [{callSpan: span, expansion: 'complete'}]}]};
  }
  const clone = globalThis.structuredClone;let clones = 0;
  globalThis.structuredClone = value => {clones++;return clone(value);};
  try {
    const caller = document(), publicMap = createCompilerDebugMap(caller), expected = publicMap.lookup(20, {functionIndex: 0});
    assert.equal(clones, 1);assert.notStrictEqual(expected.span, caller.ranges[0].span);
    caller.ranges[0].span.line = 99;caller.ranges[0].start = 21;caller.sources[0].macroOrigins.length = 0;
    assert.deepEqual(publicMap.lookup(20, {functionIndex: 0}), expected);
    const fresh = document();
    // Index construction may sort private indices, never the source graph.
    for (const value of [fresh.ranges[0].span, fresh.ranges[0], fresh.ranges, fresh.functions[0],
      fresh.functions, fresh.sources[0].macroOrigins, fresh.sources[0], fresh.sources, fresh]) Object.freeze(value);
    const owned = createCompilerDebugMap(ownCompilerDebugDocument(fresh));
    assert.equal(clones, 1);assert.deepEqual(owned.lookup(20, {functionIndex: 0}), expected);
    assert.strictEqual(owned.lookup(20).span, fresh.ranges[0].span);
    const frames = [{address: 0, offsetBase: 'function-instructions', functionIndex: 0}];
    assert.deepEqual(owned.mapFrames(frames), publicMap.mapFrames(frames));
    assert.equal(owned.lookup(100), null);assert.equal(owned.lookup(20, {functionIndex: 1}), null);
    for (const invalid of [null, false, {}, {...document(), offsetBase: 'guessed'}])
      assert.throws(() => createCompilerDebugMap(ownCompilerDebugDocument(invalid)), TypeError);
  } finally {globalThis.structuredClone = clone;}
});

test('compact debug indices retain every overlapping record exact endpoints depth and stable input order', () => {
  const span = {filename: 'ranges.eli', start: 0, end: 1, line: 1, column: 1, endLine: 1, endColumn: 2};
  const ranges = Array.from({length: 4096}, (_, index) => {
    const start = 10 + index * 73 % 2970;
    return {start, end: Math.min(2990, start + index % 61), depth: index % 7 - 3,
      functionIndex: 0, span, completeRecord: index};
  });
  // Equal starts/ends/depths must preserve source order, including zero ranges.
  ranges.push({...ranges[11], completeRecord: 4096}, {...ranges[11], completeRecord: 4097});
  const doc = {format: 'eliscript-wasm-source-map', version: 1, target: 'wasm', offsetUnit: 'byte', offsetBase: 'module',
    codeSection: {payloadStart: 10, end: 2990},
    functions: [{name: 'run', index: 0, body: {start: 0, end: 2990}, instructions: {start: 10, end: 2990}, span}],
    ranges, sources: [{id: 'entry.mjs', filename: span.filename, macroOrigins: []}]};
  const originalOrder = ranges.slice(), map = createCompilerDebugMap(ownCompilerDebugDocument(doc));
  for (let byte = 10; byte < 2990; byte += 13) {
    const expected = ranges.map((entry, order) => ({entry, order}))
      .filter(({entry}) => entry.start <= byte && entry.end > byte)
      .sort((a, b) => b.entry.depth - a.entry.depth ||
        (a.entry.end - a.entry.start) - (b.entry.end - b.entry.start) || a.order - b.order)
      .map(({entry}) => entry);
    assert.deepEqual(map.lookup(byte).ranges, expected);
    assert.deepEqual(map.lookup(BigInt(byte - 10), {offsetBase: 'function-instructions', functionIndex: 0}).ranges, expected);
  }
  assert.equal(map.lookup(9), null);assert.equal(map.lookup(2990), null);
  assert.deepEqual(ranges, originalOrder);assert.strictEqual(ranges[11], originalOrder[11]);
});

test('metadata decoding preserves ordinary JSON values signed zero duplicate keys and prototype data across every text boundary', () => {
  const documents = ['null', 'false', 'true', '-0', '1e999', '-1e999', '2.2250738585072014e-308',
    '"中😀\\ud800\\udfff\\n\\\\\\\""', '[]', '{}',
    '{"__proto__":{"polluted":true},"constructor":0,"same":1,"same":-0,"list":[true,false,null,-0,1e-300,"中😀"]}',
    '\t\r\n {"length":0,"nested":[[],{},[{"a":"\\u0061"}]]} \r\n'];
  for (const text of documents) {
    const expected = JSON.parse(text);
    for (let boundary = 0; boundary <= text.length; boundary++) {
      const decoder = createCompilerMetadataDecoder();
      decoder.write(text.slice(0, boundary));decoder.write('');decoder.write(text.slice(boundary));
      const actual = decoder.finish();assert.deepEqual(actual, expected);
      if (actual && !Array.isArray(actual) && typeof actual === 'object') {
        assert.equal(Object.getPrototypeOf(actual), Object.prototype);
        if (Object.hasOwn(actual, '__proto__')) assert.equal({}.polluted, undefined);
      }
      assert.throws(() => decoder.write(' '), TypeError);assert.throws(() => decoder.finish(), TypeError);
    }
    const decoder = createCompilerMetadataDecoder();for (const unit of text.split('')) decoder.write(unit);
    assert.deepEqual(decoder.finish(), expected);
  }
  assert.throws(() => createCompilerMetadataDecoder().write(new Uint8Array()), TypeError);
});

test('metadata decoding rejects malformed incomplete and multiple JSON values without accepting trailing commas or inherited setters', () => {
  const documents = ['', ' ', '01', '-01', '+1', '1.', '1e', '--1', 'NaN', 'Infinity', 'undefined', 'nul',
    'truefalse', '"unfinished', '"\\x20"', '"\\u12X4"', '"a\nb"', '[]{}', 'null true',
    '[', '{', '[1,]', '[,1]', '[1 2]', '{"x"}', '{"x":}', '{"x":1,}', '{"x" 1}',
    '{x:1}', '{true:1}', '{"x":1 "y":2}', '}', ']', ':', ',', '\ufeff{}', '{}\u00a0'];
  for (const text of documents) for (const size of [1, 2, 7]) {
    assert.throws(() => {
      const decoder = createCompilerMetadataDecoder();
      for (let index = 0; index < text.length; index += size) decoder.write(text.slice(index, index + size));
      decoder.finish();
    }, SyntaxError, JSON.stringify(text));
  }
});

test('long metadata strings and keys decode every escape across arbitrary chunks with exact native JSON values and own prototype data', () => {
  const controls = Array.from({length: 32}, (_, index) => String.fromCharCode(index)).join('');
  const unit = 'ASCII / \\"\uFEFF中😀\ud800A\udfff' + controls;
  const key = 'key😀\ud800'.repeat(5000), value = unit.repeat(1200);
  const input = JSON.stringify({[key]: value, same: value, zero: 0, nested: [value]})
    .replace('"zero":0', '"zero":-0').replace(/}$/, ',"__proto__":{"safe":true},"constructor":"own","same":' + JSON.stringify(value) + '}');
  const expected = JSON.parse(input);
  for (const size of [1, 2, 3, 5, 4095, 4096, 8191, 65535]) {
    const decoder = createCompilerMetadataDecoder();
    for (let index = 0; index < input.length; index += size) decoder.write(input.slice(index, index + size));
    const actual = decoder.finish();assert.deepEqual(actual, expected);
    assert.equal(actual[key], value);assert(Object.is(actual.zero, -0));
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, '__proto__'),
      {value: {safe: true}, writable: true, enumerable: true, configurable: true});
    assert.equal({}.safe, undefined);assert.deepEqual(Object.keys(actual), Object.keys(expected));
    assert.throws(() => decoder.write(''), TypeError);assert.throws(() => decoder.finish(), TypeError);
  }
  const escapes = ['\\"', '\\\\', '\\/', '\\b', '\\f', '\\n', '\\r', '\\t', '\\u0000', '\\uFEFF',
    '\\ud800', '\\udfff', '\\ud83d\\ude00', '\\uD83D\\uDE00'];
  for (const escape of escapes) for (let cut = 0; cut <= escape.length; cut++) {
    const prefix = 'x'.repeat(4095), decoder = createCompilerMetadataDecoder();
    decoder.write('"' + prefix + escape.slice(0, cut));decoder.write('');decoder.write(escape.slice(cut) + '"');
    assert.equal(decoder.finish(), JSON.parse('"' + prefix + escape + '"'));
  }
});

test('invalid long string escapes retain closing quote error timing and finish closes an incomplete decoder without masking the original boundary', () => {
  for (const bad of ['\\x20', '\\u12X4', '\\u000g', '\\u123z', '\\v', '\\0', '\0', '\n', '\r', '\u001f']) {
    const body = 'a'.repeat(4095) + bad + 'b'.repeat(4097), decoder = createCompilerMetadataDecoder();
    assert.doesNotThrow(() => {decoder.write('"');for (const unit of body) decoder.write(unit);});
    assert.throws(() => JSON.parse('"' + body + '"'), SyntaxError);
    assert.throws(() => decoder.write('"'), SyntaxError, 'invalid text is rejected at the closing quote');
    assert.throws(() => decoder.finish(), SyntaxError);
    assert.throws(() => decoder.write('"valid"'), TypeError);assert.throws(() => decoder.finish(), TypeError);
  }
  for (const suffix of ['', '\\', '\\u', '\\u1', '\\u12', '\\u123', '\\"']) {
    const decoder = createCompilerMetadataDecoder();decoder.write('"' + 'x'.repeat(8192) + suffix);
    assert.throws(() => decoder.finish(), SyntaxError);
    assert.throws(() => decoder.write('"'), TypeError);assert.throws(() => decoder.finish(), TypeError);
  }
  const decoder = createCompilerMetadataDecoder();
  assert.throws(() => decoder.write({toString() {throw false;}}), TypeError);
  decoder.write('"recovered\\ud800"');assert.equal(decoder.finish(), 'recovered\ud800');
});

test('one escape-heavy long string and key decode under a small Node heap without materializing a second escaped token', () => {
  const codec = new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href;
  const script = `import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{createCompilerMetadataDecoder}from ${JSON.stringify(codec)};
const parser=createCompilerMetadataDecoder(),parse=JSON.parse,block='\\\\u0000'.repeat(1024);
let largestParse=0;JSON.parse=function(text,...args){largestParse=Math.max(largestParse,text.length);
assert(text.length<=32768,'no whole escaped long token may reach JSON.parse');return Reflect.apply(parse,this,[text,...args]);};
let value;try{parser.write('{"');for(let i=0;i<512;i++)parser.write(block);parser.write('":"');
for(let i=0;i<10240;i++)parser.write(block);parser.write('","zero":-0}');value=parser.finish();}finally{JSON.parse=parse;}
const keys=Object.keys(value),key=keys[0];assert.equal(key.length,512*1024);assert.equal(keys[1],'zero');
const actual=value[key];assert.equal(actual.length,10*1024*1024);assert(Object.is(value.zero,-0));
assert.equal(Object.getPrototypeOf(value),Object.prototype);assert(largestParse<=32768);
for(let i=0;i<key.length;i++)assert.equal(key.charCodeAt(i),0);
const expected=createHash('sha256'),zeros=Buffer.alloc(1024);for(let i=0;i<10240;i++)expected.update(zeros);
assert.equal(createHash('sha256').update(actual).digest('hex'),expected.digest('hex'));
process.stdout.write('long escaped metadata decoded once with complete UTF16 content');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'long escaped metadata decoded once with complete UTF16 content');
}, 30000);

test('long UTF8 metadata file decoding retains complete bytes and the original read parse versus close error on every exit', async () => {
  const file = await readFile(new URL('../tools/backends/compiler-metadata.mjs', import.meta.url), 'utf8');
  const start = file.indexOf('export async function readCompilerMetadata(path) {');
  const end = file.indexOf('\n// Resource identity', start);assert(start >= 0 && end > start);
  const body = file.slice(start, end).replace("const {open} = await import('node:fs/promises');", 'const open = openFile;');
  const unit = await import('data:text/javascript;base64,' + Buffer.from(`
import{createCompilerMetadataDecoder}from ${JSON.stringify(new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href)};
export function make(openFile){${body.replace(/^export /gm, '')};return readCompilerMetadata;}`).toString('base64'));
  async function run(chunks, closeError, readError, failAt = -1) {
    let index = 0, closes = 0;
    const read = unit.make(async () => ({
      async read(buffer) {if (index === failAt) throw readError;const chunk = chunks[index++];
        if (!chunk) return {bytesRead: 0};buffer.set(chunk);return {bytesRead: chunk.length};},
      async close() {closes++;if (closeError !== undefined) throw closeError;},
    }));
    try {return await read('owned.json');} finally {assert.equal(closes, 1);}
  }
  const expected = {['key\ud800'.repeat(6000)]: 'A中😀\udfff\0'.repeat(12000), zero: -0};
  const wire = Buffer.from(JSON.stringify(expected).replace('"zero":0', '"zero":-0'));
  const chunks = [];for (let index = 0; index < wire.length; index += 4093) chunks.push(wire.subarray(index, index + 4093));
  assert.deepEqual(await run(chunks), expected);
  const closeError = {stage: 'close'};await rejectsOriginal(() => run(chunks, closeError), closeError);
  await rejectsOriginal(() => run(chunks, closeError, false, 1), false);
  await rejectsOriginal(() => run(chunks, closeError, undefined, 0), undefined);
  await assert.rejects(() => run([Buffer.from('"\\u12X4"')], closeError), SyntaxError);
  for (const invalid of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]])
    await assert.rejects(() => run([Buffer.from('"'), Buffer.from(invalid), Buffer.from('"')], closeError), TypeError);
  assert.deepEqual(await run(chunks), expected, 'a failed reader must not poison the next independent decoder');
});

test('metadata file decoding streams UTF8 across scalar boundaries rejects corrupt bytes and keeps deeply nested IR off the call stack', async () => {
  await withArchive(async directory => {
    const path = join(directory, 'metadata.json');
    for (const padding of [65524, 65525, 65526, 65527]) {
      const input = {text: 'x'.repeat(padding) + '中😀\ud800', offset: -0, values: [null, true]};
      await saveCompilerMetadata(path, input);assert.deepEqual(await readCompilerMetadata(path), input);
      assert.deepEqual(decodeCompilerMetadataBytes(await readFile(path)), input);
    }
    const depth = 20000, decoder = createCompilerMetadataDecoder();
    for (let index = 0; index < depth; index++) decoder.write(index % 2 ? '{"child":' : '[');
    decoder.write('-0');
    for (let index = depth - 1; index >= 0; index--) decoder.write(index % 2 ? '}' : ']');
    let value = decoder.finish();
    for (let index = 0; index < depth; index++) value = index % 2 ? value.child : value[0];
    assert(Object.is(value, -0));
    for (const corrupt of [Buffer.from([123, 34, 120, 34, 58, 34, 0xc3, 34, 125]),
      Buffer.from([0xef, 0xbb, 0xbf, 123, 125]), Buffer.from('{"incomplete":')]) {
      await writeFile(path, corrupt);await assert.rejects(() => readCompilerMetadata(path));
      assert.throws(() => decodeCompilerMetadataBytes(corrupt));
    }
    for (const input of [null, undefined, '[]', [], new Uint16Array(2)])
      assert.throws(() => decodeCompilerMetadataBytes(input), TypeError);
    for (const [file, code] of [[join(directory, '不存在😀.json'), 'ENOENT'], [directory, 'EISDIR']]) {
      await assert.rejects(() => readCompilerMetadata(file), error => {
        assert.equal(error.code, code);assert.equal(typeof error.message, 'string');
        assert.equal(typeof error.stack, 'string');return true;
      });
    }
    await saveCompilerMetadata(path, {recovered: -0});
    assert(Object.is((await readCompilerMetadata(path)).recovered, -0));
  });
});

test('metadata larger than the host single string limit decodes incrementally in independent Node under a small heap', () => {
  const codec = new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
import{createCompilerMetadataDecoder}from ${JSON.stringify(codec)};
const decoder=createCompilerMetadataDecoder(),space=' '.repeat(65536),count=8193;
assert(space.length*count>2**29);decoder.write('{"zero":');
for(let i=0;i<count;i++)decoder.write(space);
decoder.write('-0,"text":"中😀\\\\ud800","values":[null,true]}');
const value=decoder.finish();assert(Object.is(value.zero,-0));
assert.equal(value.text,'中😀\\ud800');assert.deepEqual(value.values,[null,true]);
process.stdout.write('bounded metadata decode preserved');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);assert.equal(child.stdout, 'bounded metadata decode preserved');
}, 30000);

test('complete repeated debug records decode under a small heap while all container identities and primitive values stay exact', () => {
  const codec = new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
import{createCompilerMetadataDecoder}from ${JSON.stringify(codec)};
const filename='shared-debug-中😀\\ud800'.repeat(6),count=400000,parser=createCompilerMetadataDecoder();
const record=JSON.stringify({filename,phase:'expression',kind:'trap-site',zero:0}).replace('"zero":0','"zero":-0');
const block=Array(1024).fill(record).join(',');parser.write('[');
for(let start=0;start<count;start+=1024){if(start)parser.write(',');
parser.write(start+1024<=count?block:Array(count-start).fill(record).join(','));}
parser.write(']');const values=parser.finish();assert.equal(values.length,count);
for(const value of values){assert.equal(value.filename,filename);assert.equal(value.phase,'expression');
assert.equal(value.kind,'trap-site');assert(Object.is(value.zero,-0));}
assert.notStrictEqual(values[0],values[1]);values[0].filename='changed';assert.equal(values[1].filename,filename);
assert.deepEqual(Object.keys(values[count-1]),['filename','phase','kind','zero']);
process.stdout.write('complete debug records preserved with independent containers');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'complete debug records preserved with independent containers');
}, 30000);

async function withArchive(run) {
  const directory = await mkdtemp(join(tmpdir(), 'eliscript-metadata-codec-'));
  try {
    const archive = join(directory, 'archive');await mkdir(archive);
    return await run(archive);
  } finally {await rm(directory, {recursive: true, force: true});}
}

function throwsOriginal(run, reason) {
  let threw = false;
  try {run();} catch (error) {threw = true;assert.equal(error, reason);}
  assert.equal(threw, true, 'encoding must propagate the original thrown value');
}
async function rejectsOriginal(run, reason) {
  let threw = false;
  try {await run();} catch (error) {threw = true;assert.equal(error, reason);}
  assert.equal(threw, true, 'saving must propagate the original thrown value');
}

let boundedIOUnit;
async function metadataIOUnit() {
  if (!boundedIOUnit) boundedIOUnit = (async () => {
    // Private writer/short-I/O fixtures use the exact production functions,
    // without adding a public injection API or building a compiler/runtime.
    const text = await readFile(new URL('../tools/backends/compiler-build.mjs', import.meta.url), 'utf8');
    const start = text.indexOf('function compilerMetadataUtf8Block(');
    const end = text.indexOf('\nexport function independentCompilerProductIdentity(', start);
    assert(start >= 0 && end > start);
    const code = `import {open as fileOpen} from 'node:fs/promises';
import {writeSync as fileWriteSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {forEachCompilerMetadataChunk} from ${JSON.stringify(new URL('../tools/backends/compiler-session.mjs', import.meta.url).href)};
export function makeUnit(open = fileOpen, writeSync = fileWriteSync) {
${text.slice(start, end).replace(/^export /gm, '')}
return {compilerMetadataUtf8Block, compilerMetadataDigest, compilerFileIdentity, writeCompilerMetadata, writeOwnedCompilerMetadata};
}
export const real = makeUnit();`;
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  })();
  return boundedIOUnit;
}

test('fixed UTF8 buffers preserve per-chunk surrogate rules and real public owned files digests and concurrent snapshots', async () => {
  const {real} = await metadataIOUnit();
  const rawChunks = ['', '\ud800', '\udc00', '\0', '😀中', 'a'.repeat(65535) + '😀',
    '中'.repeat(21845) + '😀', '😀'.repeat(32769) + '\ud800Z\udc00'];
  const encoder = new TextEncoder(), buffer = new Uint8Array(65536), encoded = [];
  for (const chunk of rawChunks) {
    assert.deepEqual(real.compilerMetadataUtf8Block(encoder, buffer, '', 0), {read: 0, written: 0});
    for (let start = 0; start < chunk.length;) {
      const {read, written} = real.compilerMetadataUtf8Block(encoder, buffer, chunk, start);
      assert(read > 0 && written > 0 && written <= 65536);
      encoded.push(Buffer.from(buffer.subarray(0, written)));start += read;
    }
  }
  assert.deepEqual(Buffer.concat(encoded), Buffer.concat(rawChunks.map(chunk => Buffer.from(chunk, 'utf8'))),
    'separate high/low surrogate chunks must not be silently joined into an astral scalar');
  for (const size of [4, 7]) {
    const bytes = new Uint8Array(size), text = 'A😀中\ud800Z\udc00\0'.repeat(19), chunks = [];
    for (let start = 0; start < text.length;) {
      const {read, written} = real.compilerMetadataUtf8Block(encoder, bytes, text, start);
      chunks.push(Buffer.from(bytes.subarray(0, written)));start += read;
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(text, 'utf8'));
  }
  await withArchive(async directory => {
    for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
      const text = 'a'.repeat(65536 + offset) + '😀' + '中'.repeat(22000) + '\ud800\0\udc00😀';
      const value = {empty: '', text, zero: -0, values: [text, undefined, 7n, NaN]};
      const wire = encodeCompilerMetadata(value), expected = Buffer.from(wire + '\n', 'utf8');
      const hash = createHash('sha256').update(wire, 'utf8').digest('hex');
      assert.equal(compilerMetadataDigest(value), hash);
      const publicPath = join(directory, 'public-' + offset + '.json'), ownedPath = join(directory, 'owned-' + offset + '.json');
      await Promise.all([writeCompilerMetadata(publicPath, value), real.writeOwnedCompilerMetadata(ownedPath, value)]);
      assert.deepEqual(await readFile(publicPath), expected);assert.deepEqual(await readFile(ownedPath), expected);
      const identity = await real.compilerFileIdentity(publicPath, new Uint8Array(65536));
      assert.deepEqual(identity, {bytes: expected.length, sha256: createHash('sha256').update(expected).digest('hex')});
    }
    const trace = [], shared = {text: rawChunks.join('|'), zero: -0};
    const value = {get first() {trace.push('first');return shared;}, get second() {
      trace.push('second');assert.equal(compilerMetadataDigest({nested: shared.text}),
        createHash('sha256').update(encodeCompilerMetadata({nested: shared.text})).digest('hex'));
      return shared;
    }};
    const expected = Buffer.from(encodeCompilerMetadata({first: {...shared}, second: {...shared}}) + '\n');
    const path = join(directory, 'concurrent-snapshot.json'), other = join(directory, 'independent.json');
    const pending = writeCompilerMetadata(path, value);
    assert.deepEqual(trace, ['first', 'second']);
    shared.text = 'changed';shared.zero = 0;
    await Promise.all([pending, writeCompilerMetadata(other, {text: 'different😀'.repeat(20000)})]);
    assert.deepEqual(await readFile(path), expected);assert.deepEqual(trace, ['first', 'second']);
    assert.equal((await readCompilerMetadata(other)).text, 'different😀'.repeat(20000));
  });
});

test('fixed metadata write buffers await partial writes before reuse and preserve original write close and snapshot errors', async () => {
  const {makeUnit} = await metadataIOUnit();
  const value = {text: '中😀'.repeat(22000) + '\ud800\0', zero: -0};
  const expected = Buffer.from(encodeCompilerMetadata(value) + '\n');
  for (const owned of [false, true]) {
    const output = [], stores = new Set();let calls = 0, closes = 0;
    function write(bytes, offset, length) {
      assert(bytes.byteLength <= 65536);stores.add(bytes.buffer);
      const count = Math.min(length, [1, 7, 65536][calls++ % 3]);
      output.push(Buffer.from(bytes.subarray(offset, offset + count)));return count;
    }
    const file = {fd: 7, async write(bytes, offset, length) {
      await Promise.resolve();return {bytesWritten: write(bytes, offset, length)};
    }, async close() {closes++;}};
    const unit = makeUnit(async () => file, (fd, bytes, offset, length) => {
      assert.equal(fd, 7);return write(bytes, offset, length);
    });
    await (owned ? unit.writeOwnedCompilerMetadata : unit.writeCompilerMetadata)('unused', value);
    assert(calls > 3);assert.equal(stores.size, 1, 'one backing allocation serves every block and partial write');
    assert.equal(closes, 1);assert.deepEqual(Buffer.concat(output), expected);
    const first = {write: 'original'}, secondary = {close: 'secondary'};
    const failing = makeUnit(async () => ({fd: 9, async write() {throw first;}, async close() {throw secondary;}}),
      () => {throw first;});
    await rejectsOriginal(() => (owned ? failing.writeOwnedCompilerMetadata : failing.writeCompilerMetadata)('unused', value), first);
    const closeOnly = makeUnit(async () => ({fd: 9, async write(bytes, offset, length) {return {bytesWritten: length};},
      async close() {throw secondary;}}), (fd, bytes, offset, length) => length);
    await rejectsOriginal(() => (owned ? closeOnly.writeOwnedCompilerMetadata : closeOnly.writeCompilerMetadata)('unused', value), secondary);
    for (const count of [0, -1, 0.5, 65537]) {
      const invalid = makeUnit(async () => ({fd: 9, async write() {return {bytesWritten: count};}, async close() {}}), () => count);
      await assert.rejects((owned ? invalid.writeOwnedCompilerMetadata : invalid.writeCompilerMetadata)('unused', {value: 1}),
        /compiler metadata write did not advance/);
    }
  }
  let opened = 0;const original = {getter: 'before open'};
  const unit = makeUnit(async () => {opened++;throw Error('must not replace getter failure');});
  await rejectsOriginal(() => unit.writeCompilerMetadata('unused', {get first() {throw original;}}), original);
  assert.equal(opened, 0);
});

test('fixed file identity buffers preserve short reads exact bytes and first read versus close errors', async () => {
  const {makeUnit} = await metadataIOUnit();
  const input = Buffer.from('中😀\0\ud800'.repeat(30000)), stores = new Set();
  let position = 0, calls = 0, closes = 0;
  const unit = makeUnit(async () => ({async read(buffer, offset, length, at) {
    assert.equal(offset, 0);assert.equal(at, null);assert.equal(length, 65536);stores.add(buffer.buffer);
    const count = Math.min(length, [1, 7, 65536][calls++ % 3], input.length - position);
    buffer.set(input.subarray(position, position + count), offset);position += count;
    return {bytesRead: count};
  }, async close() {closes++;}}));
  assert.deepEqual(await unit.compilerFileIdentity('unused', new Uint8Array(65536)),
    {bytes: input.length, sha256: createHash('sha256').update(input).digest('hex')});
  assert(calls > 3);assert.equal(stores.size, 1);assert.equal(closes, 1);
  const first = {read: 'original'}, secondary = {close: 'secondary'};
  const failing = makeUnit(async () => ({async read() {throw first;}, async close() {throw secondary;}}));
  await rejectsOriginal(() => failing.compilerFileIdentity('unused', new Uint8Array(65536)), first);
  const closing = makeUnit(async () => ({async read() {return {bytesRead: 0};}, async close() {throw secondary;}}));
  await rejectsOriginal(() => closing.compilerFileIdentity('unused', new Uint8Array(65536)), secondary);
  for (const count of [-1, 0.5, 65537, undefined]) {
    const invalid = makeUnit(async () => ({async read() {return {bytesRead: count};}, async close() {}}));
    await assert.rejects(invalid.compilerFileIdentity('unused', new Uint8Array(65536)), /invalid byte count/);
  }
});

// The fixture is metadata, not an executable substitute for a compiler. Its
// typed payload retains the exact native f64 immediate values during archiving.
function numericMetadata() {
  const values = [-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
    NaN, Infinity, -Infinity];
  return {format: 'eliscript-compiler-artifact', version: 1,
    typed: {abi: 'memory-u32', functions: [{name: 'constants', arity: 0,
      body: {kind: 'sequence', children: values.map(value => ({kind: 'constant', type: 'f64', value, children: []}))}}]},
    request: {offset: -0, bounds: [Number.MIN_VALUE, Number.MAX_VALUE]},
    execution: {threshold: -0}, counter: 90071992547409931234567890n, negative: -90071992547409931234567890n};
}

test('metadata chunk consumption preserves exact wire bytes getter order shared visits and original failures', () => {
  function fixture() {
    const trace = [], source = '\ufeff中😀\ud800"\\\n'.repeat(256);
    const shared = {get source() {trace.push('source');return source;},
      get zero() {trace.push('zero');return -0;}};
    return {trace, value: {first: shared, second: shared, bigint: 17n, missing: undefined,
      values: [undefined, NaN, Infinity, -0, Number.MIN_VALUE]}};
  }
  const actual = fixture(), reference = fixture(), chunks = [];
  forEachCompilerMetadataChunk(actual.value, chunk => {assert.equal(typeof chunk, 'string');chunks.push(chunk);});
  assert.equal(chunks.join(''), encodeCompilerMetadata(reference.value));
  assert.deepEqual(actual.trace, reference.trace);
  assert.deepEqual(actual.trace, ['source', 'zero', 'source', 'zero']);
  const cyclic = {};cyclic.self = cyclic;
  assert.throws(() => forEachCompilerMetadataChunk(cyclic, () => {}), /compiler IR cannot contain cycles/);
  for (const reason of [undefined, false, {original: true}, new Error('sink failed')]) {
    let first = 0, later = 0;
    const value = {get first() {first++;return 'x'.repeat(2048);}, get later() {later++;return 1;}};
    throwsOriginal(() => forEachCompilerMetadataChunk(value, () => {throw reason;}), reason);
    assert.equal(first, 1);assert.equal(later, 0);
  }
  let reads = 0;
  assert.throws(() => forEachCompilerMetadataChunk({get value() {reads++;return 1;}}, null), TypeError);
  assert.equal(reads, 0);
});

test('metadata file chunks snapshot getters synchronously and preserve the original bytes during caller mutation', async () => {
  await withArchive(async directory => {
    const path = join(directory, 'snapshot.json'), shared = {zero: -0, source: '中😀\ud800'.repeat(1024)};
    let reads = 0;
    const value = {get first() {reads++;return shared;}, second: shared, items: [undefined, 17n, Number.MIN_VALUE]};
    const expected = encodeCompilerMetadata(value) + '\n';reads = 0;
    const pending = saveCompilerMetadata(path, value);
    assert.equal(reads, 1, 'all getter reads finish before dispatch returns');
    shared.zero = 0;shared.source = 'edited';value.second = null;value.items.length = 0;
    await pending;
    assert((await readFile(path, 'utf8')) === expected, 'metadata file must preserve every original wire byte');assert.equal(reads, 1);
    assert.deepEqual(await readdir(directory), ['snapshot.json']);
  });
});

test('native product identity hashes metadata beyond a single string limit under a small heap with the original wire digest', () => {
  const builder = new URL('../tools/backends/compiler-build.mjs', import.meta.url).href;
  const unit = '\ufeff中😀\ud800"\\\n\0';
  const script = `import assert from 'node:assert/strict';
import{createHash}from'node:crypto';
import{independentCompilerProductIdentity}from ${JSON.stringify(builder)};
const source=${JSON.stringify(unit)}.repeat(8192),record=JSON.stringify({source});
const count=Math.ceil((2**29+65536)/(record.length+1));
assert(record.length*count+count+1>2**29);
const value=Object.freeze({source}),typed=Array.from({length:count},()=>value),hash=createHash('sha256');
hash.update('[');for(let i=0;i<count;i++){if(i)hash.update(',');hash.update(record);}hash.update(']');
const product=independentCompilerProductIdentity({host:'native',nativeTarget:'arm64-macos',files:[],typed});
assert.equal(product.typed,hash.digest('hex'));assert.equal(typed[0],typed[count-1]);
process.stdout.write('bounded metadata hash preserved');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);assert.equal(child.stdout, 'bounded metadata hash preserved');
}, 30000);

function checkNumericMetadata(value) {
  const constants = value.typed.functions[0].body.children;
  const finite = [-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE];
  for (let index = 0; index < finite.length; index++) assert(Object.is(constants[index].value, finite[index]), 'f64 immediate ' + index);
  for (let index = finite.length; index < constants.length; index++) assert.equal(constants[index].value, null);
  assert(Object.is(value.request.offset, -0));assert(Object.is(value.execution.threshold, -0));
  assert(Object.is(value.request.bounds[0], Number.MIN_VALUE));assert(Object.is(value.request.bounds[1], Number.MAX_VALUE));
  assert.equal(value.counter, '90071992547409931234567890');assert.equal(value.negative, '-90071992547409931234567890');
}

test('Given native typed f64 immediates and request metadata when encoded and saved then signed zero exact finite numbers and original JSON scalar rules survive', async () => {
  const input = numericMetadata();
  checkNumericMetadata(JSON.parse(encodeCompilerMetadata(input)));
  await withArchive(async directory => {
    const path = join(directory, 'artifact.json');await saveCompilerMetadata(path, input);
    const bytes = await readFile(path), text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    assert.equal(text.endsWith('\n'), true);
    checkNumericMetadata(JSON.parse(text));
    const typed = join(directory, 'typed.json');await saveCompilerMetadata(typed, input.typed);
    const restored = JSON.parse(await readFile(typed, 'utf8'));
    assert(Object.is(restored.functions[0].body.children[0].value, -0));
    assert(Object.is(input.typed.functions[0].body.children[0].value, -0));
    assert.equal(typeof input.counter, 'bigint');
    assert.deepEqual((await readdir(directory)).sort(), ['artifact.json', 'typed.json']);
  });
});

test('Given metadata BigInts and unsupported fields when encoded then decimal strings and omission rules do not change the stricter IR codec', () => {
  const omitted = () => 7, symbol = Symbol('metadata');
  const input = {big: 123456789012345678901234567890n, zero: 0n, negative: -1n,
    missing: undefined, function: omitted, symbol,
    array: [undefined, , omitted, symbol, 0n, -0, NaN, Infinity, -Infinity]};
  const actual = JSON.parse(encodeCompilerMetadata(input));
  assert.deepEqual(Object.keys(actual), ['big', 'zero', 'negative', 'array']);
  assert.equal(actual.big, '123456789012345678901234567890');assert.equal(actual.zero, '0');assert.equal(actual.negative, '-1');
  assert.deepEqual(actual.array, [null, null, null, null, '0', -0, null, null, null]);
  assert(Object.is(actual.array[5], -0));
  assert.equal(encodeCompilerMetadata(0n), '"0"');
  assert.equal(encodeCompilerMetadata(-1n), '"-1"');
  assert.throws(() => encodeCompilerIR({value: 1n}), TypeError);
  assert.throws(() => encodeCompilerIR([0n]), TypeError);
  assert(Object.is(JSON.parse(encodeCompilerIR({value: -0})).value, -0));
  assert.throws(() => encodeCompilerMetadata(undefined), TypeError);
  assert.throws(() => encodeCompilerMetadata(omitted), TypeError);
  assert.throws(() => encodeCompilerMetadata(symbol), TypeError);
});

test('Given Unicode BOM and isolated UTF16 surrogates in metadata keys and values when written as UTF8 JSON then every original code unit is restored', async () => {
  const text = '\ufeff中😀\\"\r\n\t\u0000\ud800x\udc00', key = '\ufeff😀\ud800';
  const input = {[key]: text, source: text, list: [text, '\udc00', '\ud800'], position: -0};
  const encoded = encodeCompilerMetadata(input), expected = JSON.parse(encoded);
  assert.equal(expected[key], text);assert.equal(expected.source, text);
  assert.deepEqual(expected.list, input.list);assert(Object.is(expected.position, -0));
  assert.equal(encoded.charCodeAt(0), 123, 'BOM belongs to source strings rather than the JSON transport prefix');
  await withArchive(async directory => {
    const path = join(directory, 'unicode.json');await saveCompilerMetadata(path, input);
    const bytes = await readFile(path), serialized = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
    const actual = JSON.parse(serialized);
    assert.deepEqual(actual, expected);assert.equal(actual[key].length, text.length);
    for (let index = 0; index < text.length; index++) assert.equal(actual[key].charCodeAt(index), text.charCodeAt(index), 'UTF16 unit ' + index);
  });
});

test('Given repeated shared metadata subtrees when saved then each traversal is legal while actual object and array cycles are rejected without replacing an archive', async () => {
  const shared = {number: -0, text: '共享😀', nested: [1n, Number.MIN_VALUE]};
  const input = {first: shared, second: shared, array: [shared, shared]};
  const actual = JSON.parse(encodeCompilerMetadata(input));
  assert.deepEqual(actual.first, actual.second);assert.deepEqual(actual.array[0], actual.first);
  assert.notEqual(actual.first, actual.second);assert.notEqual(actual.array[0], actual.array[1]);
  assert(Object.is(actual.array[1].number, -0));assert.equal(input.first, input.second);
  const objectCycle = {shared};objectCycle.self = objectCycle;
  const arrayCycle = [shared];arrayCycle.push(arrayCycle);
  const mixed = {items: []};mixed.items.push(mixed);
  await withArchive(async directory => {
    const path = join(directory, 'artifact.json');await saveCompilerMetadata(path, input);
    const before = await readFile(path);
    for (const cyclic of [objectCycle, arrayCycle, mixed]) {
      assert.throws(() => encodeCompilerMetadata(cyclic), TypeError);
      await assert.rejects(() => saveCompilerMetadata(path, cyclic), TypeError);
      assert.deepEqual(await readFile(path), before);
      assert.deepEqual(await readdir(directory), ['artifact.json']);
    }
    await saveCompilerMetadata(path, {again: shared});
    assert(Object.is(JSON.parse(await readFile(path, 'utf8')).again.number, -0));
  });
});

for (const kind of ['object', 'array']) {
  test('Given twenty thousand nested '+kind+' metadata containers when encoded saved and read then traversal never relies on the JavaScript call stack', async () => {
    const depth = 20000, leaf = {value: -0, text: '底😀', count: 1n};
    let input = leaf;
    for (let index = 0; index < depth; index++) input = kind === 'array' ? [input] : {child: input};
    function check(value) {
      for (let index = 0; index < depth; index++) {
        if (kind === 'array') {assert(Array.isArray(value));assert.equal(value.length, 1);value = value[0];}
        else {assert.deepEqual(Object.keys(value), ['child']);value = value.child;}
      }
      assert(Object.is(value.value, -0));assert.equal(value.text, '底😀');assert.equal(value.count, '1');
    }
    check(JSON.parse(encodeCompilerMetadata(input)));
    await withArchive(async directory => {
      const path = join(directory, 'deep-'+kind+'.json');await saveCompilerMetadata(path, input);
      check(JSON.parse(await readFile(path, 'utf8')));
      assert.deepEqual(await readdir(directory), ['deep-'+kind+'.json']);
    });
    assert(Object.is(leaf.value, -0));assert.equal(leaf.count, 1n);
  });
}

test('Given metadata getters and own-key traps that throw when encoded or saved then the exact first thrown value escapes and the old file remains intact', async () => {
  const reasons = [new Error('metadata getter'), new TypeError('metadata trap'), {original: true}, undefined];
  await withArchive(async directory => {
    const path = join(directory, 'artifact.json');await saveCompilerMetadata(path, {stable: -0});
    const before = await readFile(path);
    for (const reason of reasons) {
      let reads = 0;
      const object = {first: 1};
      Object.defineProperty(object, 'failure', {enumerable: true, get() {reads++;throw reason;}});
      Object.defineProperty(object, 'later', {enumerable: true, get() {assert.fail('later getter ran after the first error');}});
      throwsOriginal(() => encodeCompilerMetadata(object), reason);assert.equal(reads, 1);
      await rejectsOriginal(() => saveCompilerMetadata(path, object), reason);assert.equal(reads, 2);
      const proxy = new Proxy({}, {ownKeys() {throw reason;}});
      throwsOriginal(() => encodeCompilerMetadata(proxy), reason);
      await rejectsOriginal(() => saveCompilerMetadata(path, proxy), reason);
      assert.deepEqual(await readFile(path), before);assert.deepEqual(await readdir(directory), ['artifact.json']);
    }
    let reads = 0;
    const metadata = {get value() {reads++;return -0;}, get counter() {reads++;return 17n;}};
    await saveCompilerMetadata(path, metadata);assert.equal(reads, 2);
    const result = JSON.parse(await readFile(path, 'utf8'));assert(Object.is(result.value, -0));assert.equal(result.counter, '17');
  });
});

test('Given identical emitted-file declarations when only a typed native f64 immediate changes from negative zero to positive zero then the compiler product identity changes', () => {
  const negative = {abi: 'memory-u32', functions: [{name: 'constant', arity: 0,
    body: {kind: 'constant', type: 'f64', value: -0, children: []}}]};
  const positive = structuredClone(negative);positive.functions[0].body.value = 0;
  const descriptor = {module: {offset: -0}};
  const common = {host: 'native', nativeTarget: 'arm64-macos', files: [], descriptor};
  const a = independentCompilerProductIdentity({...common, typed: negative});
  const b = independentCompilerProductIdentity({...common, typed: positive});
  assert.notEqual(a.typed, b.typed);assert.notEqual(a.sha256, b.sha256);
  assert.equal(a.descriptor, b.descriptor);
  assert.deepEqual(independentCompilerProductIdentity({...common, typed: structuredClone(negative)}), a);
  const changedDescriptor = structuredClone(descriptor);changedDescriptor.module.offset = 0;
  const c = independentCompilerProductIdentity({...common, descriptor: changedDescriptor, typed: negative});
  assert.equal(a.typed, c.typed);assert.notEqual(a.descriptor, c.descriptor);assert.notEqual(a.sha256, c.sha256);
  assert(Object.is(negative.functions[0].body.value, -0));assert(Object.is(descriptor.module.offset, -0));
});

test('Given a real product archive request when its caller edits bytes typed values and descriptor immediately after dispatch then archived metadata keeps the pre-await snapshot and signed zero', async () => {
  await withArchive(async directory => {
    // The standard empty WASM header is a byte transport fixture. This case
    // tests actual product packaging, without claiming to compile or execute it.
    const response = {target: 'wasm', entry: 'metadata.mjs', bytes: Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0),
      descriptor: {format: 'eliscript-managed-control', offsets: [-0, Number.MIN_VALUE, Number.MAX_VALUE]},
      typed: numericMetadata().typed,
      debug: {source: '\ufeff😀\ud800', offset: -0, thresholds: [NaN, Infinity, -Infinity]}};
    const original = structuredClone(response), path = join(directory, 'product');
    const pending = archiveProduct(response, 'wasm', path);
    // These edits happen before awaiting the archive's first asynchronous step.
    response.bytes.fill(255);response.descriptor.offsets[0] = 0;
    response.typed.functions[0].body.children[0].value = 0;
    response.typed.functions[0].body.children.push({kind: 'constant', type: 'f64', value: 99, children: []});
    response.debug.offset = 0;response.debug.source = 'edited';
    const artifact = await pending;
    assert.deepEqual(await readFile(artifact.path), Buffer.from(original.bytes));
    const typed = JSON.parse(await readFile(join(path, 'typed.json'), 'utf8'));
    const descriptor = JSON.parse(await readFile(join(path, 'descriptor.json'), 'utf8'));
    const debug = JSON.parse(await readFile(join(path, 'debug.json'), 'utf8'));
    const metadata = JSON.parse(await readFile(join(path, 'product.json'), 'utf8'));
    assert(Object.is(typed.functions[0].body.children[0].value, -0));
    assert.equal(typed.functions[0].body.children.length, original.typed.functions[0].body.children.length);
    assert(Object.is(typed.functions[0].body.children[2].value, Number.MIN_VALUE));
    assert(Object.is(typed.functions[0].body.children[4].value, Number.MAX_VALUE));
    assert(Object.is(descriptor.offsets[0], -0));assert(Object.is(metadata.descriptor.offsets[0], -0));
    assert(Object.is(artifact.typed.functions[0].body.children[0].value, -0));
    assert(Object.is(debug.offset, -0));assert.equal(debug.source, original.debug.source);
    assert.deepEqual(debug.thresholds, [null, null, null]);
    const hash = value => createHash('sha256').update(encodeCompilerMetadata(value)).digest('hex');
    assert.equal(artifact.typedSha256, hash(original.typed));assert.equal(metadata.typedSha256, artifact.typedSha256);
    assert.equal(artifact.descriptorSha256, hash(original.descriptor));assert.equal(metadata.descriptorSha256, artifact.descriptorSha256);
    assert.equal(artifact.debugSha256, hash(original.debug));assert.equal(metadata.debugSha256, artifact.debugSha256);
    assert.notEqual(artifact.typedSha256, hash(response.typed));assert.notEqual(artifact.descriptorSha256, hash(response.descriptor));
  });
});


test('Given a complete million-word metadata sequence When encoded under a small heap Then exact bytes do not retain one allocation per token',()=>{
  const codec=new URL('../tools/backends/compiler-session.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';
    import {encodeCompilerMetadata} from ${JSON.stringify(codec)};
    const values=Array.from({length:1000000},(_,index)=>index);
    const expected=JSON.stringify(values);
    const actual=encodeCompilerMetadata(values);
    assert.equal(actual,expected);
    process.stdout.write(String(actual.length));`;
  const child=spawnSync('node',['--max-old-space-size=64','--input-type=module','--eval',script],{
    encoding:'utf8',timeout:30000,maxBuffer:65536,
  });
  assert.equal(child.error,undefined);assert.equal(child.signal,null);
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'6888891');
},30000);

test('Given repeated long source keys and values When encoded Then native JSON bytes and every getter visit remain exact', () => {
  const source = '\uFEFF; 中😀"\\\r\n\u0000\ud800x\udc00'.repeat(128);
  function fixture() {
    const trace = [];let index = 0;
    const shared = {get source() {trace.push('source:' + index);return source;},
      get index() {trace.push('index:' + index);return index++;}};
    return {trace, value: {first: shared, second: shared, [source]: [source, source, true, null, 7]}};
  }
  for (const encode of [encodeCompilerIR, encodeCompilerMetadata]) {
    const actual = fixture(), expected = fixture();
    assert.equal(encode(actual.value), JSON.stringify(expected.value));
    assert.deepEqual(actual.trace, ['source:0', 'index:0', 'source:1', 'index:1']);
    assert.deepEqual(actual.trace, expected.trace);
    assert.equal(encode({source: source + 'edited'}), JSON.stringify({source: source + 'edited'}));
    assert.equal(encode({source}), JSON.stringify({source}), 'a later request owns a new cache');
  }
  const failure = new Error('error after a cached source');let late = 0;
  const input = {first: source, second: source, get failure() {throw failure;}, get late() {late++;return source;}};
  throwsOriginal(() => encodeCompilerMetadata(input), failure);assert.equal(late, 0);
  const cycle = {first: source, second: source};cycle.self = cycle;
  assert.throws(() => encodeCompilerMetadata(cycle), /compiler IR cannot contain cycles/);
});

test('Given hundreds of complete records sharing long Unicode source When encoded under a small heap Then one exact output is materialized', () => {
  const codec = new URL('../tools/backends/compiler-session.mjs', import.meta.url).href;
  const unit = ';中😀"\\\r\n\ufeff\ud800x\udc00';
  const script = `import assert from 'node:assert/strict';
import{createHash}from'node:crypto';
import{encodeCompilerMetadata}from ${JSON.stringify(codec)};
const source=${JSON.stringify(unit)}.repeat(2048);
const count=256,records=Array.from({length:count},()=>({source}));
const record=JSON.stringify({source}),hash=createHash('sha256');hash.update('[');
for(let index=0;index<count;index++){if(index)hash.update(',');hash.update(record);}hash.update(']');
const actual=encodeCompilerMetadata(records);
assert.equal(actual.length,record.length*count+count+1);
assert.equal(createHash('sha256').update(actual).digest('hex'),hash.digest('hex'));
assert.equal(actual.slice(1,record.length+1),record);
assert.equal(actual.slice(-record.length-1,-1),record);
process.stdout.write('shared source bytes preserved');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);assert.equal(child.stdout, 'shared source bytes preserved');
}, 30000);

test('streaming metadata hashes bound distinct long getter strings while preserving every original visit and exact wire byte', () => {
  const builder = new URL('../tools/backends/compiler-build.mjs', import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compilerMetadataDigest} from ${JSON.stringify(builder)};
const count=8192,padding='x'.repeat(4096);
const source=index=>'中😀'+index+padding+'\\ud800';
const expected=createHash('sha256');expected.update('[');
for(let index=0;index<count;index++){
  if(index)expected.update(',');
  expected.update(JSON.stringify({source:source(index),zero:0}).replace('"zero":0','"zero":-0'));
}
expected.update(']');let visits=0;
const records=Array.from({length:count},(_,index)=>({
  get source(){assert.equal(visits++,index);return source(index);},zero:-0
}));
assert.equal(compilerMetadataDigest(records),expected.digest('hex'));
assert.equal(visits,count);
// Distinct getter results have no owner other than this one traversal. The
// serializer must not retain their complete raw and quoted forms as a cache.
process.stdout.write('bounded distinct metadata strings preserved');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'bounded distinct metadata strings preserved');
}, 30000);

test('long metadata keys and values stream exact native JSON spelling across control and UTF16 slice boundaries', () => {
  const controls = String.fromCharCode(...Array.from({length: 32}, (_, index) => index));
  const values = [
    'a'.repeat(32767), 'b'.repeat(32768), 'c'.repeat(32769),
    (controls + '"\\\ufeff中\u2028\u2029').repeat(1100),
    '😀'.repeat(20000), '\ud800x\udc00'.repeat(12000),
    ...[8191, 8192, 8193, 16383, 16384, 16385, 32767, 32768, 32769].map(offset =>
      'x'.repeat(offset) + '😀\ud800Z\udc00' + 'y'.repeat(32769)),
  ];
  for (const text of values) {
    const input = {[text]: text, nested: [text, text, null, true]}, expected = JSON.stringify(input);
    const nativeStringify = JSON.stringify, pieces = [];let stringCalls = 0, largest = 0;
    try {
      JSON.stringify = function (value, ...args) {
        if (typeof value === 'string') {
          stringCalls++;largest = Math.max(largest, value.length);
          assert(value.length <= (text.length > 32768 ? 8192 : 32768),
            'large key/value quoting must not materialize its complete escaped token');
        }
        return Reflect.apply(nativeStringify, this, [value, ...args]);
      };
      forEachCompilerMetadataChunk(input, piece => pieces.push(piece));
    } finally {JSON.stringify = nativeStringify;}
    assert(stringCalls > 0);assert(largest > 0);
    const actual = pieces.join('');assert.equal(actual, expected);
    assert.deepEqual(Buffer.from(actual), Buffer.from(expected));
    assert.deepEqual(JSON.parse(actual), input);
    assert.equal(encodeCompilerIR(input), expected);assert.equal(encodeCompilerMetadata(input), expected);
    assert.equal(Object.keys(input)[0], text);assert.equal(input[text], text);
  }
});

test('repeated long quote caches stay bounded by complete raw and escaped units and remain private to one traversal', () => {
  const medium = 'cache-middle-中😀"\\\n'.repeat(128), long = 'cache-long-\ufeff😀\ud800"\\\n'.repeat(4096);
  const trace = [], shared = {get text() {trace.push('text');return long;}};
  const repeated = {first: shared, second: shared, [medium]: [medium, medium]}, expected = JSON.stringify(repeated);
  trace.length = 0;
  const nativeStringify = JSON.stringify;let quotedMedium = 0, longUnits = 0;
  try {
    JSON.stringify = function (value, ...args) {
      if (value === medium) quotedMedium++;
      // Long input pieces use this unique prefix, while all medium tokens and
      // property names are smaller. Sum raw piece units without retaining them.
      if (typeof value === 'string' && value !== medium && value.length > 1024) longUnits += value.length;
      return Reflect.apply(nativeStringify, this, [value, ...args]);
    };
    const pieces = [];forEachCompilerMetadataChunk(repeated, piece => pieces.push(piece));
    assert.equal(pieces.join(''), expected);assert.equal(quotedMedium, 1);assert.equal(longUnits, long.length);
    assert.deepEqual(trace, ['text', 'text']);
    encodeCompilerMetadata({source: medium});assert.equal(quotedMedium, 2, 'a later call must own a fresh quote cache');
  } finally {JSON.stringify = nativeStringify;}
  const nativeSet = Map.prototype.set, nativeClear = Map.prototype.clear, caches = new WeakMap();
  let clears = 0, observed = 0;
  try {
    Map.prototype.set = function (key, value) {
      if (typeof key !== 'string' || !(typeof value === 'string' || Array.isArray(value)))
        return Reflect.apply(nativeSet, this, [key, value]);
      let state = caches.get(this);
      if (!state) {state = {units: 0, entries: new Map()};caches.set(this, state);}
      const escapedUnits = typeof value === 'string' ? value.length : 2 + value.reduce((sum, piece) => sum + piece.length, 0);
      const units = key.length + escapedUnits;
      state.units += units - (state.entries.get(key) ?? 0);
      Reflect.apply(nativeSet, state.entries, [key, units]);
      const result = Reflect.apply(nativeSet, this, [key, value]);
      assert(this.size <= 1024);assert(state.units <= 4194304);observed++;return result;
    };
    Map.prototype.clear = function () {
      const state = caches.get(this);
      if (state) {state.units = 0;Reflect.apply(nativeClear, state.entries, []);clears++;}
      return Reflect.apply(nativeClear, this, []);
    };
    for (const [count, length] of [[1100, 1024], [300, 9000]]) {
      const records = Array.from({length: count}, (_, index) => String(index).padStart(8, '0') + 'x'.repeat(length));
      const hash = createHash('sha256');
      forEachCompilerMetadataChunk(records, piece => hash.update(piece));
      assert.equal(hash.digest('hex'), createHash('sha256').update(JSON.stringify(records)).digest('hex'));
    }
  } finally {Map.prototype.set = nativeSet;Map.prototype.clear = nativeClear;}
  assert(observed > 1024);assert(clears >= 2, 'both entry count and raw plus quoted-unit pressure discard old cache entries');
});

test('a consumer failure inside a split metadata key or value preserves its exact thrown value and stops later getters', () => {
  const text = 'x'.repeat(8191) + '😀\ud800\0' + 'x'.repeat(40000);
  for (const key of ['first', text]) for (const reason of [undefined, false, {original: true}, new Error('split sink')]) {
    let first = 0, later = 0, chunks = 0;
    const input = {get [key]() {first++;return text;}, get later() {later++;throw Error('later getter must not run');}};
    throwsOriginal(() => forEachCompilerMetadataChunk(input, piece => {
      chunks++;if (piece.includes('x'.repeat(32))) throw reason;
    }), reason);
    assert(chunks > 0);assert.equal(first, 1);assert.equal(later, 0);
  }
  const reason = {getter: 'after split value'};let later = 0;
  throwsOriginal(() => forEachCompilerMetadataChunk({first: text, get failure() {throw reason;},
    get later() {later++;return text;}}, () => {}), reason);
  assert.equal(later, 0);assert.equal(encodeCompilerMetadata({recovered: text}), JSON.stringify({recovered: text}));
});

test('one long primitive streams its original complete JSON digest under a small independent Node heap without whole-token quoting', () => {
  const codec = new URL('../tools/backends/compiler-session.mjs', import.meta.url).href;
  const unit = '\0\u0001\b\f\n\r\t"\\\ufeff中😀\ud800Z\udc00';
  const script = `import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {forEachCompilerMetadataChunk} from ${JSON.stringify(codec)};
const text=${JSON.stringify(unit)}.repeat(65537),count=9,native=JSON.stringify;
const expected=createHash('sha256');expected.update('[');
for(let index=0;index<count;index++){if(index)expected.update(',');expected.update(native(text));}expected.update(']');
const expectedDigest=expected.digest('hex'),actual=createHash('sha256');let largest=0,quoted=0,chunks=0;
JSON.stringify=function(value,...args){if(typeof value==='string'){
  assert(value.length<=8192);largest=Math.max(largest,value.length);quoted++;}
  return Reflect.apply(native,this,[value,...args]);};
try{forEachCompilerMetadataChunk(Array(count).fill(text),piece=>{chunks++;actual.update(piece);});}
finally{JSON.stringify=native;}
assert.equal(actual.digest('hex'),expectedDigest);assert(quoted>1);assert(chunks>count);assert(largest<=8192);
assert.equal(text.length,${unit.length}*65537);
process.stdout.write('single long primitive digest preserved with bounded quoting');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', script],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'single long primitive digest preserved with bounded quoting');
}, 30000);
