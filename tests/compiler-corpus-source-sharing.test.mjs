import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {cloneCompilerCorpusData, cloneCompilerCorpusModules, compilerCorpusRequest,
  createOriginalCorpusSourceReader} from '../tools/backends/compiler-corpus.mjs';
import {addOriginalStdlibRuntimeAdapters, originalRuntimeCaseLocators,
  originalRuntimeOnlyCase} from '../tools/backends/compiler-corpus-runtime-adapters.mjs';

function plainCloneGraph() {
  const shared = {source: '\uFEFF; 中😀\ud800\r\n(defconst value -0)', number: -0, huge: 2n,
    undefinedValue: undefined, nan: NaN, infinity: Infinity};
  const array = new Array(5);array[1] = shared;array[3] = shared;
  array.label = 'retained enumerable array property';
  const dictionary = Object.create(null);
  dictionary['9'] = 'nine';dictionary['2'] = 'two';dictionary.after = shared;
  Object.defineProperty(dictionary, '__proto__', {value: shared, enumerable: true});
  Object.defineProperty(dictionary, 'hidden', {value: {ignored: true}, enumerable: false});
  Object.defineProperty(dictionary, Symbol('ignored getter'), {get() {throw new Error('symbol getter must not run');}, enumerable: true});
  const graph = {array, shared, dictionary};graph.self = graph;array[4] = graph;
  return graph;
}

test('complete plain corpus snapshots match this host native clone including cross-object cycles and all mutable boundaries', () => {
  const source = plainCloneGraph(), expected = structuredClone(source), actual = cloneCompilerCorpusData(source);
  assert.deepEqual(actual, expected);assert.deepEqual(Object.keys(actual.dictionary), Object.keys(expected.dictionary));
  assert.deepEqual(Object.keys(actual.array), Object.keys(expected.array));
  assert.equal(actual.self, actual);assert.equal(actual.array[4], actual);
  assert.equal(actual.array[1], actual.array[3]);assert.equal(actual.shared, actual.dictionary.__proto__);
  assert.equal(actual.shared, actual.array[1]);assert(!Object.hasOwn(actual.array, 0));assert(!Object.hasOwn(actual.array, 2));
  assert(!Object.hasOwn(actual.dictionary, 'hidden'));assert.equal(Object.getPrototypeOf(actual.dictionary), Object.prototype);
  assert(Object.is(actual.shared.number, -0));assert.equal(actual.shared.huge, 2n);
  assert(Object.hasOwn(actual.shared, 'undefinedValue'));assert.equal(actual.shared.undefinedValue, undefined);
  actual.shared.source = 'changed';actual.dictionary.extra = 1;actual.array.push('new');
  assert.equal(source.shared.source, '\uFEFF; 中😀\ud800\r\n(defconst value -0)');
  assert(!Object.hasOwn(source.dictionary, 'extra'));assert.equal(source.array.length, 5);
});

test('complete graph fallback invokes original getters once and preserves native first-error order and special aliases', () => {
  const trace = [], sentinel = new Error('original getter error');
  const earlyGetter = {get first() {trace.push('first');throw sentinel;}, later: () => 1};
  assert.throws(() => cloneCompilerCorpusData(earlyGetter), error => error === sentinel);
  assert.deepEqual(trace, ['first']);
  const earlyUnsupported = {first: () => 1, get later() {trace.push('later');throw sentinel;}};
  assert.throws(() => cloneCompilerCorpusData(earlyUnsupported), error => error.name === 'DataCloneError');
  assert.deepEqual(trace, ['first']);
  let getters = 0;
  const getterGraph = {get read() {getters++;return {source: 'once'};}};
  assert.deepEqual(cloneCompilerCorpusData(getterGraph), {read: {source: 'once'}});assert.equal(getters, 1);
  const shared = {source: 'shared'}, graph = {shared, map: new Map([['shared', shared]]), set: new Set([shared]),
    date: new Date(17), regexp: /source/giu, bytes: new Uint8Array([0, 255])};
  const actual = cloneCompilerCorpusData(graph);
  assert.deepEqual(actual, structuredClone(graph));assert.equal(actual.map.get('shared'), actual.shared);
  assert.equal([...actual.set][0], actual.shared);actual.bytes[0] = 42;assert.equal(graph.bytes[0], 0);
  class Metadata {constructor() {this.source = 'class instance';}}
  assert.deepEqual(cloneCompilerCorpusData({value: new Metadata()}), structuredClone({value: new Metadata()}));
  for (const value of [Symbol('value'), {nested: {symbol: Symbol('value')}}, {nested: {call() {}}}])
    assert.throws(() => cloneCompilerCorpusData(value), error => error.name === 'DataCloneError');
});

test('Node native structuredClone independently checks the same cyclic corpus snapshot and getter fallback', () => {
  const module = new URL('../tools/backends/compiler-corpus.mjs', import.meta.url).href;
  const source = `import assert from 'node:assert/strict';import{cloneCompilerCorpusData}from ${JSON.stringify(module)};
const value=(${plainCloneGraph.toString()})();const copy=cloneCompilerCorpusData(value);assert.deepEqual(copy,structuredClone(value));
assert.equal(copy.self,copy);assert.equal(copy.array[4],copy);assert.equal(copy.shared,copy.dictionary.__proto__);
assert.equal(copy.shared,copy.array[1]);assert.equal(copy.array[1],copy.array[3]);assert(Object.is(copy.shared.number,-0));
copy.shared.source='changed';assert.notEqual(copy.shared.source,value.shared.source);
let visits=0;const getter={get source(){visits++;return 'source'}};assert.deepEqual(cloneCompilerCorpusData(getter),{source:'source'});assert.equal(visits,1);
const shared={text:'source'},special={shared,map:new Map([['same',shared]])};const fallback=cloneCompilerCorpusData(special);assert.deepEqual(fallback,structuredClone(special));assert.equal(fallback.shared,fallback.map.get('same'));
console.log('native Node clone oracle passed');`;
  const child = spawnSync('node', ['--max-old-space-size=64', '--input-type=module', '--eval', source],
    {encoding: 'utf8', timeout: 10000, maxBuffer: 65536});
  assert.ifError(child.error);assert.equal(child.status, 0, child.stderr);assert.equal(child.signal, null);
  assert.equal(child.stdout, 'native Node clone oracle passed\n');
}, 15000);

test('a shared source reused by every complete corpus record retains bytes without sharing mutable containers', () => {
  const source = '\uFEFF; 中😀\ud800\r\n'.repeat(4096), records = [];
  const shared = {id: 'shared.mjs', filename: 'shared.eli', source};
  for (let index = 0; index < 128; index++) records.push({id: String(index),
    modules: [{id: 'entry.mjs', filename: 'entry.eli', source}, shared],
    request: {entries: ['entry.mjs', 'shared.mjs']}});
  const graph = {records, shared}, actual = cloneCompilerCorpusData(graph);
  assert.deepEqual(actual, structuredClone(graph));assert.equal(actual.records.length, 128);
  const expected = createHash('sha256').update(Buffer.from(source, 'utf16le')).digest('hex');
  for (let index = 0; index < actual.records.length; index++) {
    assert.equal(actual.records[index].modules[1], actual.shared);
    assert.equal(createHash('sha256').update(Buffer.from(actual.records[index].modules[0].source, 'utf16le')).digest('hex'), expected);
    assert.notEqual(actual.records[index].modules, records[index].modules);
    assert.notEqual(actual.records[index].modules[0], records[index].modules[0]);
  }
  actual.records[0].modules[0].source = 'edit';actual.records[1].request.entries.push('new');
  assert.equal(records[0].modules[0].source, source);assert.equal(actual.records[2].modules[0].source, source);
  assert.deepEqual(records[1].request.entries, ['entry.mjs', 'shared.mjs']);
});

test('repeated and concurrent original source edges share one read and UTF8 decode without changing archived bytes', async () => {
  const bytes = Buffer.from('\uFEFF; 中😀e\u0301\r\n(defconst value -0)\n');
  let reads = 0, decodes = 0, release;
  const hold = new Promise(resolve => {release = resolve;});
  const reader = createOriginalCorpusSourceReader({sourceRoot: resolve('.'),
    async read(filename) {reads++;assert.equal(filename, resolve('shared.eli'));await hold;return bytes;},
    decode(input) {decodes++;return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(input);}});
  const first = reader.text('shared.eli'), second = reader.text('shared.eli'), asset = reader.file('shared.eli');
  release();
  const [left, right, archived] = await Promise.all([first, second, asset]);
  assert.equal(left, bytes.toString('utf8'));assert.equal(right, left);
  for (let index = 0; index < 32; index++) assert.equal(await reader.text('shared.eli'), left);
  assert.equal(reads, 1);assert.equal(decodes, 1);
  assert.deepEqual(archived, {file: 'shared.eli', encoding: 'base64', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), content: bytes.toString('base64')});
  assert.deepEqual(reader.evidence(), [archived]);
});

test('source text caching preserves fatal UTF8 rejection, raw evidence, distinct filenames and path rejection', async () => {
  const inputs = new Map([['one.eli', Buffer.from('same')], ['two.eli', Buffer.from('same')],
    ['bad.eli', Buffer.from([0xc0, 0xaf])]]);
  const reader = createOriginalCorpusSourceReader({sourceRoot: resolve('.'),
    async read(filename) {return inputs.get(filename.split('/').at(-1));}});
  assert.equal(await reader.text('one.eli'), 'same');assert.equal(await reader.text('two.eli'), 'same');
  await assert.rejects(reader.text('bad.eli'), TypeError);
  assert.equal((await reader.file('bad.eli')).content, Buffer.from([0xc0, 0xaf]).toString('base64'));
  assert.deepEqual(reader.evidence().map(item => item.file), ['one.eli', 'two.eli', 'bad.eli']);
  for (const filename of ['../escape.eli', '/absolute.eli', 'back\\slash.eli'])
    await assert.rejects(reader.file(filename), TypeError);
});

test('source graph copies retain native values key order holes aliases and independent mutable records', () => {
  const record = {filename: '中😀.eli', source: '; \uFEFF\ud800\udc00\ud800\n(defconst value -0)', id: 'entry.mjs',
    sign: -0, missing: undefined, large: 2n};
  Object.defineProperty(record, '__proto__', {value: 'own data', enumerable: true});
  const modules = new Array(3);modules[0] = record;modules[2] = record;
  const native = structuredClone(modules), actual = cloneCompilerCorpusModules(modules);
  assert.deepEqual(actual, native);assert.deepEqual(Object.keys(actual[0]), Object.keys(native[0]));
  assert.equal(actual.length, 3);assert(!Object.hasOwn(actual, 1));assert.equal(actual[0], actual[2]);
  assert.notEqual(actual[0], record);assert(Object.is(actual[0].sign, -0));
  actual[0].source = 'edited';actual.push({id: 'other'});
  assert.equal(record.source, '; \uFEFF\ud800\udc00\ud800\n(defconst value -0)');assert.equal(modules.length, 3);
});

test('source graph accessors errors proxies and nested metadata retain native clone boundaries', () => {
  let visits = 0;
  const module = {id: 'entry.mjs', get source() {visits++;return String(visits);}, filename: 'entry.eli'};
  assert.equal(cloneCompilerCorpusModules([module])[0].source, '1');assert.equal(visits, 1);
  const failure = new Error('source getter failed');
  assert.throws(() => cloneCompilerCorpusModules([{get source() {throw failure;}}]), error => error === failure);
  let traps = 0;
  const proxy = new Proxy({}, {ownKeys() {traps++;throw new Error('must not enumerate a proxy');}});
  assert.throws(() => cloneCompilerCorpusModules([proxy]), error => error.name === 'DataCloneError');assert.equal(traps, 0);
  assert.throws(() => cloneCompilerCorpusModules([{source() {}}]), error => error.name === 'DataCloneError');
  const metadata = {shared: {count: 1}}, rich = [{id: 'entry.mjs', source: '(value)', metadata}, metadata];
  const copy = cloneCompilerCorpusModules(rich);
  assert.deepEqual(copy, structuredClone(rich));assert.equal(copy[0].metadata, copy[1]);
  copy[0].metadata.shared.count = 2;assert.equal(metadata.shared.count, 1);
});

test('public project request copies retain source graph isolation and complete request fields', () => {
  const module = {id: 'entry.mjs', filename: 'entry.eli', source: '\uFEFF; 中😀\n(defconst value -0)'};
  const record = {kind: 'project', request: {operation: 'project', resolveImports: true, phased: true,
    entries: ['entry.mjs'], sourceMap: true}, entry: 'entry.mjs', modules: [module, module],
    memory: {initialPages: 4, maximumPages: 256}};
  const request = compilerCorpusRequest(record, 'wasm');
  assert.equal(request.target, 'wasm');assert.equal(request.resolveImports, true);assert.equal(request.phased, true);
  assert.deepEqual(request.entries, ['entry.mjs']);assert.equal(request.sourceMap, true);
  assert.equal(request.modules[0], request.modules[1]);assert.notEqual(request.modules[0], module);
  request.modules[0].source = '(edited)';assert.equal(module.source, '\uFEFF; 中😀\n(defconst value -0)');
});

test('complete core protocol adapters execute every original assertion and map check with the selected source graph', async () => {
  const cache = new Map();
  const text = async filename => {
    if (!cache.has(filename)) cache.set(filename, await readFile(filename, 'utf8'));
    return cache.get(filename);
  };
  const file = async filename => ({file: filename, sha256: createHash('sha256').update(await text(filename)).digest('hex')});
  const region = (source, begin, end, from = 0) => {
    const start = source.indexOf(begin, from), finish = start < 0 ? -1 : source.indexOf(end, start + begin.length);
    assert(start >= 0 && finish >= start, begin);
    const text = source.slice(start, finish);
    return {text, start, end: finish, byteStart: Buffer.byteLength(source.slice(0, start)),
      byteEnd: Buffer.byteLength(source.slice(0, finish)), sha256: createHash('sha256').update(text).digest('hex')};
  };
  const manifest = JSON.parse(await text('tests/conformance/manifest.json'));
  const suites = ['tests/core-stdlib.test.mjs', 'tests/core-set.test.mjs'];
  const locators = [];
  for (const feature of manifest.features) for (const [index, locator] of (feature.evidence ?? []).entries())
    if (suites.includes(locator.file)) locators.push({id: 'stable-compatibility:evidence:' + feature.id + ':' + index, ...locator});
  for (const suite of suites) locators.push(...originalRuntimeCaseLocators(suite, await text(suite)));
  const coreNames = ['protocol', 'identifier', 'data-text', 'metadata', 'collection', 'transient', 'transducer', 'seq', 'data'];
  const modules = [];
  for (const [id, filename] of [
    ['core-stdlib-usage.mjs', 'tests/fixtures/core-stdlib-usage.eli'],
    ['core-language-api-usage.mjs', 'tests/fixtures/core-language-api-usage.eli'],
    ...coreNames.map(name => ['stdlib/core/' + name + '.mjs', 'stdlib/core/' + name + '.eli']),
  ]) modules.push({id, filename, source: await text(filename)});
  const request = {operation: 'project', resolveImports: true, phased: true, sourceMap: true,
    entries: modules.map(module => module.id)};
  const records = [{id: 'stable-compatibility:program:tests/fixtures/core-stdlib-usage.eli',
    modules, entry: modules[0].id, request},
    {id: 'stable-compatibility:program:tests/fixtures/core-set-usage.eli', entry: 'core-set-usage.mjs',
      modules: [{id: 'core-set-usage.mjs', filename: 'tests/fixtures/core-set-usage.eli', source: await text('tests/fixtures/core-set-usage.eli')},
        {id: 'stdlib/core/set.mjs', filename: 'stdlib/core/set.eli', source: await text('stdlib/core/set.eli')}],
      request: {operation: 'project', resolveImports: true, sourceMap: true}},
    {id: 'stable-compatibility:program:stdlib/core/text.eli', request: {operation: 'project', sourceMap: true}}];
  const saved = structuredClone(records), output = [];
  const parity = JSON.parse(await text('contracts/compiler-parity-corpus.json'));
  await addOriginalStdlibRuntimeAdapters({add: record => output.push(record), records, locators, text, file, region,
    data() {assert.fail('these original core bodies must not be evaluated during corpus collection');},
    bootstrapSources: parity.bootstrapSources});
  const core = output.find(record => record.id === 'original-program:core-stdlib-complete-protocols');
  const set = output.find(record => record.id === 'original-program:core-set-source-map');
  assert(core);assert(set);
  const required = [
    ['language.canonical-runtime-data-text', 3], ['language.immutable-metadata', 3], ['language.keyword-symbol-values', 2],
    ['stdlib.collection-capability-predicates', 1], ['stdlib.eliscript-core-protocol-algorithms', 1],
    ['stdlib.eliscript-protocol-dispatch-policy', 1], ['stdlib.key-value-reduction-protocol', 2],
    ['stdlib.map-set-stack-capability-protocols', 2], ['stdlib.persistent-collection-classification', 1],
    ['stdlib.persistent-subvector-views', 4], ['stdlib.protocol-driven-core-algorithms', 6],
    ['stdlib.replayable-reducible-transducer-pipelines', 2], ['stdlib.replayable-sequence-head-tail-views', 1],
    ['stdlib.reversible-collection-traversal', 2],
  ];
  for (const [feature, index] of required) assert(core.coverage.includes('stable-compatibility:evidence:' + feature + ':' + index), feature);
  assert(set.coverage.includes('stable-compatibility:evidence:stdlib.eliscript-core-protocol-algorithms:5'));
  const coreSource = await text(suites[0]), setSource = await text(suites[1]);
  const coreBody = region(coreSource, '    const usage = await import(pathToFileURL(usageModule).href);', '\n  } finally {',
    coreSource.indexOf('test("Eliscript core modules compile and execute against runtime protocols",'));
  const setBody = region(setSource, '    const expected = {', '\n  } finally {',
    setSource.indexOf('test("Eliscript-authored set algebra compiles and agrees across local hosts",'));
  assert(core.execution.hostSource.includes(coreBody.text));assert(set.execution.hostSource.includes(setBody.text));
  for (const record of [core, set]) {
    assert.equal(record.execution.compilerSourceMaps, true);
    assert.equal(record.execution.childProcesses, 'inherit-selected-artifact');
    assert.equal(record.expected.oracleRequired, true);assert.equal(record.expected.kind, 'seed-program');
    assert(!record.execution.hostSource.includes('if(process.env.ELISCRIPT_ORIGINAL_TARGET'));
    const original = record === core ? coreSource : setSource;
    for (const bound of record.original.regions) {
      const content = original.slice(bound.start, bound.end);
      assert.equal(createHash('sha256').update(content).digest('hex'), bound.sha256);
      assert(record.execution.hostSource.includes(content));
    }
    const locator = locators.find(item => item.originalExecution?.record === record.id);
    assert.equal(record.execution.timeoutMs, locator.originalCase.timeoutMs);
  }
  assert(core.execution.hostSource.includes('Array.from({ length: 50_000 }'));
  assert(core.execution.hostSource.includes('new SourceRange(100,'));
  assert(core.execution.hostSource.includes('await runSuccessful(["node", "--input-type=module", "--eval", nodeCheck]);'));
  assert(set.execution.hostSource.includes('runUsageHost(process.execPath, usageModule)'));
  assert(set.execution.hostSource.includes('runUsageHost(process.env.NODE ?? "node", usageModule)'));
  assert.deepEqual(core.modules, modules);assert.deepEqual(core.request, request);assert.deepEqual(records, saved);
  core.modules[0].source = 'changed after collection';assert.equal(records[0].modules[0].source, saved[0].modules[0].source);
});

test('core compiler cases cannot be relabelled as host-only and their exact source region fails closed', async () => {
  const file = 'tests/core-stdlib.test.mjs', source = await readFile(file, 'utf8');
  const title = 'Eliscript core modules compile and execute against runtime protocols';
  assert.equal(originalRuntimeOnlyCase(file, source, title), null);
  const locator = originalRuntimeCaseLocators(file, source).find(item => item.originalExecution.record === 'original-program:core-stdlib-complete-protocols');
  assert(locator.originalCase.span.start <= locator.originalExecution.span.start);
  assert(locator.originalCase.span.end >= locator.originalExecution.span.end);
  for (const removed of ['    const usage = await import(pathToFileURL(usageModule).href);', title])
    assert.throws(() => originalRuntimeCaseLocators(file, source.replace(removed, 'changed original boundary')), TypeError);
});
