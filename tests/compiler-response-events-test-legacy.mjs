import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createCompilerSession, decodeCompilerSourceAsset, encodeCompilerIR, requestCompilerBuildProduct, isOwnedCompilerBuildProduct} from '../tools/backends/compiler-session.mjs';
import {buildIndependentCompiler, decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {readCompilerMetadata} from '../tools/backends/compiler-metadata.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

const responseMode = 'events-v1';
const graphResponseMode = 'graph-events-v1';
const packet = (events, done = false, token = 1) => ({format: 'eliscript-compiler-response-events', version: 1, token, events, done});
const graphPacket = (events, done = false, token = 1) => ({...packet(events, done, token), version: 2});
let directory, artifact, serializer;
beforeAll(async () => {
  const started = Date.now();
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-response-events-'));
  try {
    // The original complete generation and private serializer compilation use
    // the same artifact. End their VM before the parent loads it, so their
    // source IR and JIT pages do not remain beside later native products.
    const source = `
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildIndependentCompiler} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs', import.meta.url).href)};
const directory = ${JSON.stringify(directory)};
const artifact = await buildIndependentCompiler({host: 'javascript', outputRoot: directory});
const frontend = await import(pathToFileURL(resolve(directory, 'bootstrap/compiler.mjs')).href);
const source = await readFile(new URL(${JSON.stringify(new URL('../bootstrap/host/compiler-session.eli', import.meta.url).href)}), 'utf8');
const exported = source.slice(0, source.lastIndexOf(')')) +
  '\\n(export session-response-start session-response-control session-response-clear session-response-identities session-ir-wire))';
await writeFile(resolve(directory, 'host/response-events-serializer-unit.mjs'),
  frontend.compile_string(exported, 'response-events-serializer-unit.eli'));
console.log(JSON.stringify({host: artifact.host, metadataPath: artifact.metadataPath}));
`;
    const remaining = 120000 - (Date.now() - started);
    assert(remaining > 0, 'the original response fixture setup deadline must remain available');
    const args = process.versions.bun ? ['--smol', '--eval', source] : ['--input-type=module', '--eval', source];
    const child = spawnSync(process.execPath, args, {cwd: process.cwd(), encoding: 'utf8',
      timeout: remaining, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'inherit']});
    assert.equal(child.error, undefined, 'owned response fixture child: ' + (child.error?.message ?? ''));
    assert.equal(child.signal, null, 'owned response fixture child signal: ' + child.signal);
    assert.equal(child.status, 0, 'owned response fixture child exit: ' + child.status + '; see inherited stderr');
    const result = JSON.parse(child.stdout.trim());
    assert.deepEqual(Object.keys(result), ['host', 'metadataPath']);assert.equal(result.host, 'javascript');
    assert.equal(result.metadataPath, resolve(directory, 'compiler-artifact.json'));
    const metadata = await readCompilerMetadata(result.metadataPath);
    assert.equal(metadata.host, 'javascript');
    artifact = {...metadata, directory, metadataPath: result.metadataPath,
      path: resolve(directory, metadata.path), runtimePath: resolve(directory, metadata.runtimePath),
      load: () => import(pathToFileURL(resolve(directory, metadata.path)).href)};
    assert(Date.now() - started <= 120000, 'the original complete response fixture deadline remains 120 seconds');
  } catch (error) {
    try {await rm(directory, {recursive: true, force: true});directory = undefined;} catch {}
    throw error;
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function fakeDriver(respond) {
  const messages = [];
  return {messages, compiler_session_new: () => ({}), compiler_session_close: () => true,
    compiler_session_request(state, text) {
      const request = JSON.parse(text);messages.push(request);
      return encodeCompilerIR(respond(request, state));
    }};
}

test('literal cache preserves exact source filenames ordering revisions and atomic recovery across project reuse', async () => {
  const compiler = await artifact.load(), state = compiler.compiler_session_new();
  const request = value => JSON.parse(compiler.compiler_session_request(state, JSON.stringify(value)));
  const runtime = {operation: 'runtime', source: '(defun memory-probe () 0) (export memory-probe)', filename: 'memory.eli'};
  const libraries = [
    {id: 'one.mjs', filename: 'one.eli', source: '; 中文😀\ud800\n(defun one () -0.0) (export one)'},
    {id: 'two.mjs', filename: 'two.eli', source: '(defun two () 2) (export two)'},
  ];
  const project = {operation: 'project', target: 'javascript', entry: 'entry.mjs',
    modules: [{id: 'entry.mjs', filename: 'entry.eli', source: '(defun answer () 42) (export answer)'}]};
  try {
    const first = request({...runtime, literalSources: libraries});
    const one = state.literalCache.get('one.mjs').program, two = state.literalCache.get('two.mjs').program;
    const originalCache = state.literalCache, originalModules = state.literalModules;
    const oneEntry = originalCache.get('one.mjs'), twoEntry = originalCache.get('two.mjs');
    const originalEntries = [structuredClone(oneEntry), structuredClone(twoEntry)];
    const originalIR = request({operation: 'cached-ir', kind: 'literal', id: 'one.mjs', revision: first.literalRevision});
    const initialProject = request(project);
    const repeated = request({...runtime, literalSources: libraries.map(value => ({...value}))});
    assert.equal(repeated.revision, first.revision);assert.equal(repeated.literalRevision, first.literalRevision);
    assert.strictEqual(state.literalCache, originalCache, 'a whole-graph hit retains the existing cache');
    assert.strictEqual(state.literalModules, originalModules, 'a hit does not build a second module list');
    assert.equal(request(project).revision, initialProject.revision);
    assert.equal(state.literalCache.get('one.mjs').program, one);
    assert.equal(state.literalCache.get('two.mjs').program, two);
    assert.deepEqual(request({operation: 'cached-ir', kind: 'literal', id: 'one.mjs', revision: first.literalRevision}), originalIR);

    const reversed = request({...runtime, literalSources: [...libraries].reverse()});
    assert.equal(reversed.literalRevision, first.literalRevision + 1);
    assert.deepEqual(state.literalModules.map(value => value.id), ['two.mjs', 'one.mjs']);
    assert.notStrictEqual(state.literalCache, originalCache, 'a changed graph owns a private replacement transaction');
    assert.strictEqual(state.literalCache.get('one.mjs'), oneEntry, 'unchanged immutable entries need no copy');
    assert.strictEqual(state.literalCache.get('two.mjs'), twoEntry);
    assert.deepEqual([oneEntry, twoEntry], originalEntries);
    assert.equal(state.literalCache.get('one.mjs').program, one);
    assert.equal(state.literalCache.get('two.mjs').program, two);
    const reorderedProject = request(project);assert.equal(reorderedProject.revision, initialProject.revision + 1);
    assert.equal(request(project).revision, reorderedProject.revision);
    assert.throws(() => request({operation: 'cached-ir', kind: 'literal', id: 'one.mjs', revision: first.literalRevision}),
      error => error.eliscriptDiagnostic?.code === 'ELI-H0001');

    assert.throws(() => request({...project, entry: 'missing.mjs',
      literalSources: [{...libraries[0], filename: 'unpublished.eli'}]}),
      error => error.eliscriptDiagnostic?.code === 'ELI-H0001');
    assert.equal(state.literalRevision, reversed.literalRevision);
    assert.deepEqual(state.literalModules.map(value => value.id), ['two.mjs', 'one.mjs']);
    assert.equal(state.literalCache.get('one.mjs').program, one);
    assert.equal(state.literalCache.get('two.mjs').program, two);
    assert.equal(request(project).revision, reorderedProject.revision);

    const invalid = [{...libraries[0], source: '(defun broken ('}, libraries[1]];
    assert.throws(() => request({...runtime, literalSources: invalid}));
    assert.equal(state.literalRevision, reversed.literalRevision);
    assert.equal(state.literalCache.get('one.mjs').program, one);
    assert.equal(request(project).revision, reorderedProject.revision);
    const published = {cache: state.literalCache, modules: state.literalModules,
      sources: state.literalSources, key: state.literalKey, runtime: state.runtime};
    // The first replacement can finish compilation before a later source
    // fails.  Neither that partial transaction nor a failed runtime may
    // publish, mutate a reused entry, or invalidate the preceding project.
    for (const replacement of [
      {...runtime, literalSources: [{...libraries[0], source: '(defun one () 9) (export one)'},
        {...libraries[1], source: '(defun broken ('}]},
      {...runtime, source: '(defun broken (', literalSources: libraries},
    ]) {
      assert.throws(() => request(replacement));
      assert.strictEqual(state.literalCache, published.cache);
      assert.strictEqual(state.literalModules, published.modules);
      assert.strictEqual(state.literalSources, published.sources);
      assert.strictEqual(state.runtime, published.runtime);
      assert.equal(state.literalKey, published.key);
      assert.equal(state.literalRevision, reversed.literalRevision);
      assert.deepEqual([oneEntry, twoEntry], originalEntries);
      assert.equal(request(project).revision, reorderedProject.revision);
    }
    const omitted = request(runtime);
    assert.equal(omitted.revision, reversed.revision);
    assert.equal(omitted.literalRevision, reversed.literalRevision);
    assert.strictEqual(state.literalCache, published.cache);
    assert.strictEqual(state.literalModules, published.modules);
    const renamed = request({...runtime, literalSources: [{...libraries[0], filename: 'renamed😀.eli'}, libraries[1]]});
    assert.equal(renamed.literalRevision, reversed.literalRevision + 1);
    assert.notEqual(state.literalCache.get('one.mjs').program, one);
    assert.equal(state.literalCache.get('two.mjs').program, two);
    assert.equal(request({operation: 'cached-ir', kind: 'literal', id: 'one.mjs', revision: renamed.literalRevision}).filename, 'renamed😀.eli');
    const edited = request({...runtime, literalSources: [{...libraries[0], source: libraries[0].source.replace('-0.0', '3')}]});
    assert.equal(edited.literalRevision, renamed.literalRevision + 1);
    assert.deepEqual(state.literalModules.map(value => value.id), ['one.mjs']);
    assert.equal(state.literalCache.has('two.mjs'), false);
    const empty = request({...runtime, literalSources: []});
    // The established public response omits literalRevision for an empty
    // graph; its private revision must still invalidate the previous graph.
    assert.equal(Object.hasOwn(empty, 'literalRevision'), false);
    assert.equal(state.literalRevision, edited.literalRevision + 1);
    assert.equal(state.literalCache.size, 0);
    assert.equal(Object.hasOwn(request({...runtime, literalSources: []}), 'literalRevision'), false);
    assert.equal(state.literalRevision, edited.literalRevision + 1);
  } finally {compiler.compiler_session_close(state);}
}, 30000);

async function serializerUnit() {
  // Expose the actual private serializer only in a separate test module. The
  // authenticated compiler artifact and its original session module stay intact.
  if (serializer) return serializer;
  const path = resolve(artifact.directory, 'host/response-events-serializer-unit.mjs');
  serializer = await import(pathToFileURL(path).href);return serializer;
}

function collectResponseEvents(unit, value, mode = responseMode, stringChunks = false) {
  const state = unit.compiler_session_new(), batches = [];
  try {
    let part = unit.session_response_start(state, value, mode, undefined, stringChunks);
    for (;;) {
      assert.equal(part.version, mode === graphResponseMode ? 2 : 1);
      assert(part.events.length > 0 && part.events.length <= 256);
      const units = part.events.reduce((sum, event) => sum + (typeof event[1] === 'string' ? event[1].length : 0), 0);
      assert(units <= 32768 || part.events.length === 1);
      // Exercise the real envelope serializer too: JSON text must preserve -0.
      part = JSON.parse(unit.session_ir_wire(part, new Set()));batches.push(part);
      if (part.done) break;
      part = unit.session_response_control(state, {token: part.token}, 'response-next');
    }
    assert.equal(state.responseCursor, null);
    return batches;
  } finally {unit.compiler_session_close(state);}
}

async function reconstructBatches(batches, mode = responseMode, stringChunks = false) {
  let index = 0;
  const session = await createCompilerSession({host: 'javascript', compiler: fakeDriver(request =>
    request.operation === 'capabilities' ? {responseStringChunks: true} : batches[index++])});
  try {
    const result = session.request({operation: 'serializer-fixture'}, {responseMode: mode,
      ...(stringChunks ? {responseStringChunks: true} : {})});
    assert.equal(index, batches.length);return result;
  } finally {session.close();}
}

// Run all child-only full products before any test imports the compiler or
// serializer into this VM: ESM/JIT cache pages cannot be unloaded afterwards.
// The function declarations below retain the complete original test bodies.
test('independent binary builds negotiate actual event responses while legacy and JavaScript producers retain their original mode', childOnlyBinaryNegotiation, 120000);
test('authenticated JS artifact owned WASM projects retain complete bytes debug files and public cache isolation', childOnlyOwnedWasmProducts, 120000);
test('real owned native builds preserve complete wire metadata identities cache isolation and native execution', childOnlyOwnedNativeProducts, 120000);

test('declared string events bound UTF16 values and retain complete snapshot getters and graph identities', async () => {
  const unit = await serializerUnit();
  const text = 'x'.repeat(8191) + '😀\ud800\udfff' + '"\\\0\r\n中'.repeat(12000);
  for (const mode of [responseMode, graphResponseMode]) {
    const log = [], shared = {zero: -0};
    const value = {get ir() {log.push('ir');return text;},
      get canonicalIR() {log.push('canonicalIR');return '\udfff' + text + '😀';},
      empty: '', first: shared, second: shared};
    const batches = collectResponseEvents(unit, value, mode, true);
    assert.deepEqual(log, ['ir', 'canonicalIR']);assert(batches.length > 2);
    const events = batches.flatMap(part => part.events);
    assert.deepEqual(events.filter(event => event[0] === 'string').map(event => event[1]),
      [text.length, text.length + 3]);
    for (const event of events) if (event[0] === 'string-chunk')
      assert(event[1].length > 0 && event[1].length <= 8192);
    assert(!events.some(event => event[0] === 'value' && typeof event[1] === 'string' && event[1].length > 8192));
    const actual = await reconstructBatches(batches, mode, true);
    assert.deepEqual(actual, {ir: text, canonicalIR: '\udfff' + text + '😀', empty: '',
      first: {zero: -0}, second: {zero: -0}});
    assert.equal(actual.first === actual.second, mode === graphResponseMode);
    assert(Object.is(actual.first.zero, -0));
    const second = await reconstructBatches(batches, mode, true);
    assert.notStrictEqual(second, actual);assert.notStrictEqual(second.first, actual.first);
    actual.ir = 'caller edit';assert.equal(second.ir, text);
  }
  // Legacy event consumers keep the original single value token unless the
  // extension was explicitly requested; no capability means no protocol change.
  assert(collectResponseEvents(unit, {text}).flatMap(part => part.events)
    .some(event => event[0] === 'value' && event[1] === text));
});

test('string events reject malformed lengths ordering and undeclared drivers without retries', async () => {
  const malformed = [
    [['string', 0]], [['string', -1]], [['string', 1.5]], [['string', '1']],
    [['string-chunk', 'x']], [['string', 1], ['string-chunk', '']],
    [['string', 1], ['string-chunk', 'xx']], [['string', 2], ['string-chunk', 'x'], ['end']],
    [['string', 8193], ['string-chunk', 'x'.repeat(8193)]],
    [['string', 1], ['value', 'x']], [['string', 1], ['key', 'x']],
    [['string', 1], ['object']], [['string', 1], ['string', 1]],
    [['string', 1], ['string-chunk', 'x'], ['string-chunk', 'y']],
  ];
  for (const events of malformed) await assert.rejects(
    () => reconstructBatches([packet(events, true)], responseMode, true),
    error => error instanceof TypeError && /response events/.test(error.message));
  for (const claim of [undefined, false, 1, 'true']) {
    const driver = fakeDriver(request => {
      assert.equal(request.operation, 'capabilities');return {responseStringChunks: claim};
    });
    const session = await createCompilerSession({host: 'javascript', compiler: driver});
    try {
      assert.throws(() => session.request({operation: 'cached-ir'},
        {responseMode, responseStringChunks: true}), /does not support response string chunks/);
      assert.deepEqual(driver.messages, [{operation: 'capabilities'}]);
    } finally {session.close();}
  }
  const driver = fakeDriver(() => ({legacy: true}));
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    assert.deepEqual(session.request({operation: 'cached-ir'}), {legacy: true});
    assert.deepEqual(driver.messages, [{operation: 'cached-ir'}]);
    for (const invalid of [null, 1, 'true']) assert.throws(
      () => session.request({}, {responseMode, responseStringChunks: invalid}), /must be a boolean/);
    assert.throws(() => session.request({}, {responseStringChunks: true}), /require an event/);
    assert.equal(driver.messages.length, 1);
    const marker = {requestGetter: true};
    assert.throws(() => session.request({get operation() {throw marker;}},
      {responseMode, responseStringChunks: true}), error => error === marker);
    assert.equal(driver.messages.length, 1, 'request snapshot failures precede capability dispatch');
  } finally {session.close();}
  const unit = await serializerUnit(), state = unit.compiler_session_new();
  try {
    for (const invalid of [null, 1, 'true']) assert.throws(() => unit.compiler_session_request(state,
      JSON.stringify({operation: 'capabilities', responseMode, responseStringChunks: invalid})),
    error => error.eliscriptDiagnostic?.code === 'ELI-H0001' && /must be a boolean/.test(error.message));
    assert.throws(() => unit.compiler_session_request(state,
      JSON.stringify({operation: 'capabilities', responseStringChunks: true})),
    error => error.eliscriptDiagnostic?.code === 'ELI-H0001' && /requires an event/.test(error.message));
    assert.equal(JSON.parse(unit.compiler_session_request(state, '{"operation":"capabilities"}')).responseStringChunks, true);
  } finally {unit.compiler_session_close(state);}
});

test('string cursor close cancellation and late getter errors preserve first failure and never reread a field', async () => {
  const unit = await serializerUnit(), text = 'x'.repeat(100000), marker = {first: 'getter failure'};
  for (const action of ['close', 'throw']) {
    const state = unit.compiler_session_new(), reads = [];
    const value = {get ir() {reads.push('ir');return text;},
      get canonicalIR() {reads.push('canonicalIR');throw marker;}};
    try {
      let part = unit.session_response_start(state, value, responseMode, undefined, true);
      assert.deepEqual(reads, ['ir']);
      if (action === 'close') {
        const cursor = state.responseCursor;
        unit.session_response_control(state, {token: part.token}, 'response-close');
        assert.equal(state.responseCursor, null);assert.equal(cursor.root, null);assert.equal(cursor.frames, null);
        assert.deepEqual(reads, ['ir']);
      } else {
        let thrown;
        try {while (!part.done) part = unit.session_response_control(state, {token: part.token}, 'response-next');}
        catch (error) {thrown = error;}
        assert.strictEqual(thrown, marker);assert.deepEqual(reads, ['ir', 'canonicalIR']);
        unit.session_response_clear(state);assert.equal(state.responseCursor, null);
      }
    } finally {unit.compiler_session_close(state);}
  }
  const reason = {cancelled: true}, controller = new AbortController(), messages = [];
  const driver = fakeDriver(request => {
    messages.push(request.operation);
    if (request.operation === 'capabilities') return {responseStringChunks: true};
    if (request.operation === 'response-close') throw new Error('secondary close failure');
    controller.abort(reason);return packet([['string', text.length], ['string-chunk', text.slice(0, 8192)]], false);
  });
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    assert.throws(() => session.request({operation: 'cached-ir'},
      {signal: controller.signal, responseMode, responseStringChunks: true}), error => error === reason);
    assert.deepEqual(messages, ['capabilities', 'cached-ir', 'response-close']);
  } finally {session.close();}
});

test('actual cached IR chunk responses equal the complete ordinary snapshot and retain revision error recovery', async () => {
  const compiler = await artifact.load(), session = await createCompilerSession({host: 'javascript', compiler});
  const text = 'a'.repeat(8191) + '😀\ud800中\udfff' + 'z'.repeat(17000);
  const source = '(defconst text ' + JSON.stringify(text) + ') (defun zero () -0.0) (export text zero)';
  const options = {responseMode, responseStringChunks: true};
  try {
    assert.equal(session.request({operation: 'capabilities'}).responseStringChunks, true);
    const ready = session.request({operation: 'runtime', source, filename: 'cached😀.eli'});
    const request = {operation: 'cached-ir', kind: 'runtime', revision: ready.revision};
    const ordinary = session.request(request), first = session.request(request, options);
    assert.deepEqual(first, ordinary);assert.equal(typeof first.ir, 'string');assert.equal(typeof first.canonicalIR, 'string');
    assert.notStrictEqual(first, ordinary);first.ir = 'caller edit';
    assert.deepEqual(session.request(request, options), ordinary);
    assert.throws(() => session.request({...request, revision: ready.revision + 1}, options),
      error => error.eliscriptDiagnostic?.code === 'ELI-H0001');
    assert.deepEqual(session.request(request, options), ordinary);
  } finally {session.close();}
}, 30000);

test('real numeric response runs retain every array element getter order and JSON traversal boundary', async () => {
  const unit = await serializerUnit();
  for (const length of [0, 1, 255, 256, 257, 65537]) {
    const input = Array.from({length}, (_, index) => index === length - 1 ? -0 : index);
    const batches = collectResponseEvents(unit, input), events = batches.flatMap(part => part.events);
    const runs = events.filter(event => event[0] === 'array-values');
    assert.equal(runs.length, Math.ceil(length / 256));
    assert.deepEqual(runs.map(event => event[1].length),
      Array.from({length: Math.ceil(length / 256)}, (_, index) => Math.min(256, length - index * 256)));
    assert.deepEqual(events.filter(event => event[0] !== 'array-values'), [['array'], ['end']]);
    assert.deepEqual(await reconstructBatches(batches), input);
    if (length === 65537) {
      assert.equal(batches[0].events.length, 256);
      assert.equal(batches[0].events.slice(1).reduce((sum, event) => sum + event[1].length, 0), 255 * 256);
      assert(batches.length > 1, 'the packet limit counts run events, not their scalar values');
    }
  }
  function fixture(log) {
    const shared = {get nested() {log.push('nested');return [9, -0];}};
    const source = [1, 2, shared, undefined, , NaN, -0, Infinity, null, false, () => {}, Symbol('omitted'), 3, shared, 4];
    const input = new Array(source.length);
    for (let index = 0; index < source.length; index++) if (Object.hasOwn(source, index))
      Object.defineProperty(input, index, {get() {log.push(index);return source[index];}});
    return input;
  }
  const normalLog = [], eventLog = [];
  const expected = JSON.parse(unit.session_ir_wire(fixture(normalLog), new Set()));
  const parts = collectResponseEvents(unit, fixture(eventLog));
  const actual = await reconstructBatches(parts);
  assert.deepEqual(actual, expected);assert.deepEqual(eventLog, normalLog);
  assert(Object.is(actual[6], -0));assert.deepEqual(actual.slice(3, 6), [null, null, null]);
  assert.notStrictEqual(actual[2], actual[13], 'a shared DAG is serialized twice, never memoized');
  assert(parts.flatMap(part => part.events).some(event => event[0] === 'array-values' && event[1].some(value => value === null)));
  for (const tail of [undefined, null, {last: 1}, [2], false]) {
    const input = [1, tail], batches = collectResponseEvents(unit, input);
    assert.deepEqual(await reconstructBatches(batches), JSON.parse(unit.session_ir_wire(input, new Set())));
  }
  for (const input of [[1, 2n], (() => {const value = [1];value.push(value);return value;})()]) {
    const state = unit.compiler_session_new();
    try {assert.throws(() => unit.session_response_start(state, input), TypeError);}
    finally {unit.compiler_session_close(state);}
  }
  const reason = {original: true}, read = [], input = [1];
  Object.defineProperty(input, 1, {get() {read.push(1);throw reason;}});
  Object.defineProperty(input, 2, {get() {read.push(2);return 3;}});
  const state = unit.compiler_session_new();
  try {
    let thrown;try {unit.session_response_start(state, input);} catch (error) {thrown = error;}
    assert.strictEqual(thrown, reason);assert.deepEqual(read, [1]);
  } finally {unit.compiler_session_close(state);}
}, 30000);

test('numeric runs reconstruct across batches including null and signed zero without a scalar-count packet limit', async () => {
  const runs = Array.from({length: 255}, (_, index) => ['array-values',
    Array.from({length: 256}, (_, offset) => offset === 255 ? -0 : index * 256 + offset)]);
  const batches = [packet([['array'], ...runs]), packet([['array-values', [null, -0, Number.MAX_VALUE]], ['end']], true)];
  const actual = await reconstructBatches(batches);
  assert.equal(actual.length, 255 * 256 + 3);
  for (let index = 0; index < 255 * 256; index++)
    assert(Object.is(actual[index], index % 256 === 255 ? -0 : index));
  assert.equal(actual.at(-3), null);assert(Object.is(actual.at(-2), -0));assert.equal(actual.at(-1), Number.MAX_VALUE);
});

test('graph responses name physical objects in DFS order and preserve shared identity without changing legacy getter traversal', async () => {
  const unit = await serializerUnit();
  function fixture(log) {
    const leaf = {get zero() {log.push('zero');return -0;}, text: '\ud800中😀\udfff'};
    const shared = {get child() {log.push('child');return leaf;}};
    return {first: shared, second: shared, list: [leaf, shared, -0, NaN, undefined],
      distinct: {child: {zero: -0, text: leaf.text}}};
  }
  const normalLog = [], oldLog = [], graphLog = [];
  const normal = JSON.parse(unit.session_ir_wire(fixture(normalLog), new Set()));
  const old = await reconstructBatches(collectResponseEvents(unit, fixture(oldLog)));
  assert.deepEqual(old, normal);assert.deepEqual(oldLog, normalLog);
  const batches = collectResponseEvents(unit, fixture(graphLog), graphResponseMode);
  const events = batches.flatMap(batch => batch.events);
  const actual = await reconstructBatches(batches, graphResponseMode);
  assert.deepEqual(actual, normal);assert.deepEqual(graphLog, ['child', 'zero']);
  assert.strictEqual(actual.first, actual.second);assert.strictEqual(actual.first.child, actual.list[0]);
  assert.strictEqual(actual.first, actual.list[1]);assert.notStrictEqual(actual.first, actual.distinct);
  assert.notStrictEqual(actual.first.child, actual.distinct.child);
  assert(Object.is(actual.list[2], -0));assert.deepEqual(actual.list.slice(3), [null, null]);
  assert.deepEqual(events.filter(event => event[0] === 'object' || event[0] === 'array'),
    [['object', 1], ['object', 2], ['object', 3], ['array', 4], ['object', 5], ['object', 6]]);
  assert.deepEqual(events.filter(event => event[0] === 'reference'), [['reference', 2], ['reference', 3], ['reference', 2]]);
  assert(!collectResponseEvents(unit, fixture([])).flatMap(batch => batch.events).some(event => event[0] === 'reference'));
  const dangerous = Object.create(null);dangerous.__proto__ = actual.first.child;
  const withKeys = await reconstructBatches(collectResponseEvents(unit, dangerous, graphResponseMode), graphResponseMode);
  assert.equal(Object.getPrototypeOf(withKeys), Object.prototype);assert(Object.hasOwn(withKeys, '__proto__'));
  assert.equal(withKeys.__proto__.text, '\ud800中😀\udfff');assert(Object.is(withKeys.__proto__.zero, -0));
  const across = {zero: -0}, many = [across, ...Array.from({length: 300}, (_, index) => ({index})), across];
  const split = collectResponseEvents(unit, many, graphResponseMode);
  assert(split.length > 1);
  const joined = await reconstructBatches(split, graphResponseMode);
  assert.strictEqual(joined[0], joined.at(-1));assert(Object.is(joined.at(-1).zero, -0));
}, 30000);

test('graph cursors retain bounded packets at depth twenty thousand and clear identity ownership on errors and cancellation', async () => {
  const unit = await serializerUnit(), depth = 20000;
  let source = [-0];for (let index = 1; index < depth; index++) source = [source];
  const batches = collectResponseEvents(unit, source, graphResponseMode);
  assert(batches.length > 100);
  let nextIdentity = 1;
  for (const batch of batches) for (const event of batch.events) if (event[0] === 'array') assert.equal(event[1], nextIdentity++);
  assert.equal(nextIdentity, depth + 1);
  let actual = await reconstructBatches(batches, graphResponseMode);
  for (let index = 0; index < depth; index++) {assert.equal(actual.length, 1);actual = actual[0];}
  assert(Object.is(actual, -0));
  const request = (state, input) => JSON.parse(unit.compiler_session_request(state, JSON.stringify(input)));
  function assertCleared(state, cursor) {
    assert.equal(state.responseCursor, null);
    for (const key of ['root', 'frames', 'ancestors', 'pendingEvent', 'identities']) assert.equal(cursor[key], null);
    assert.equal(cursor.nextIdentity, 0);
  }
  for (const action of ['cancel', 'close', 'interleave', 'stale', 'getter', 'cycle']) {
    const state = unit.compiler_session_new(), value = Array.from({length: 300}, (_, index) => ({index}));
    const reason = {first: action};let reads = 0;
    if (action === 'getter') Object.defineProperty(value, 299, {get() {reads++;throw reason;}});
    if (action === 'cycle') value[299] = value;
    const first = unit.session_response_start(state, value, graphResponseMode), cursor = state.responseCursor;
    assert.equal(first.version, 2);assert.equal(first.done, false);assert(cursor.identities.segments.every(segment => segment instanceof Map));
    try {
      if (action === 'cancel') {
        const cancelled = request(state, {operation: 'response-close', token: first.token});
        assert.equal(cancelled.version, 2);assert.equal(cancelled.done, true);assert.deepEqual(cancelled.events, []);
      } else if (action === 'close') unit.compiler_session_close(state);
      else if (action === 'interleave') assert.throws(() => request(state, {operation: 'capabilities'}), /pending/);
      else if (action === 'stale') assert.throws(() => request(state, {operation: 'response-next', token: first.token + 1}), /token/);
      else {
        let threw = false;
        try {while (!request(state, {operation: 'response-next', token: first.token}).done) {}}
        catch (error) {threw = true;if (action === 'getter') assert.strictEqual(error, reason);else assert(error instanceof TypeError);}
        assert(threw);if (action === 'getter') assert.equal(reads, 1);
      }
      assertCleared(state, cursor);
      if (action !== 'close') {
        const resumed = request(state, {operation: 'capabilities', responseMode: graphResponseMode});
        assert.equal(resumed.version, 2);assert.equal(resumed.done, true);
        assert.deepEqual(resumed.events[0], ['object', 1]);
        assert.equal(state.responseCursor, null);
      }
    } finally {if (!state.closed) unit.compiler_session_close(state);}
  }
}, 30000);

test('graph identity segments preserve cross-segment aliases exact IDs cycles and cleanup with small private limits', async () => {
  const unit = await serializerUnit();
  assert.equal(unit.session_response_identities(8388608).limit, 8388608);
  const defaultState = unit.compiler_session_new();
  try {
    const first = unit.session_response_start(defaultState, Array.from({length: 300}, (_, index) => ({index})), graphResponseMode);
    assert.equal(first.done, false);assert.equal(defaultState.responseCursor.identities.limit, 8388608);
  } finally {unit.compiler_session_close(defaultState);}
  for (const limit of [2, 3]) {
    let reads = 0;
    const shared = {get zero() {reads++;return -0;}}, state = unit.compiler_session_new();
    const source = [shared, ...Array.from({length: 300}, (_, index) => ({index})), shared, {zero: -0}];
    let part = unit.session_response_start(state, source, graphResponseMode, limit);
    const cursor = state.responseCursor, identities = cursor.identities, parts = [];
    try {
      for (;;) {
        const segments = identities.segments;
        assert(segments.length > 1);
        assert(segments.every(segment => segment.size > 0 && segment.size <= limit));
        assert.deepEqual(segments.flatMap(segment => [...segment.values()]),
          Array.from({length: cursor.nextIdentity - 1}, (_, index) => index + 1));
        parts.push(JSON.parse(unit.session_ir_wire(part, new Set())));
        if (part.done) break;
        part = unit.session_response_control(state, {token: part.token}, 'response-next');
        if (part.done) {parts.push(JSON.parse(unit.session_ir_wire(part, new Set())));break;}
      }
      assert.equal(reads, 1);assert.equal(state.responseCursor, null);assert.equal(identities.segments, null);
      assert.equal(cursor.identities, null);assert.equal(cursor.nextIdentity, 0);
      globalThis.Bun?.gc?.(true);
      const result = await reconstructBatches(parts, graphResponseMode);
      assert.strictEqual(result[0], result[301]);assert.notStrictEqual(result[0], result[302]);
      assert(Object.is(result[301].zero, -0));
      const constructors = parts.flatMap(batch => batch.events).filter(event => event[0] === 'array' || event[0] === 'object');
      assert.deepEqual(constructors.map(event => event[1]), Array.from({length: 303}, (_, index) => index + 1));
    } finally {unit.compiler_session_close(state);}
    for (const failure of ['cycle', 'getter', 'cancel']) {
      const state = unit.compiler_session_new(), input = Array.from({length: 300}, (_, index) => ({index}));
      const reason = {first: failure};let hits = 0;
      if (failure === 'cycle') input[299] = input;
      if (failure === 'getter') Object.defineProperty(input, 299, {get() {hits++;throw reason;}});
      const first = unit.session_response_start(state, input, graphResponseMode, limit), cursor = state.responseCursor;
      const index = cursor.identities;
      assert(index.segments.length > 1);
      try {
        if (failure === 'cancel') {
          const result = JSON.parse(unit.compiler_session_request(state, JSON.stringify({operation: 'response-close', token: first.token})));
          assert.equal(result.done, true);assert.equal(result.version, 2);
        } else {
          let threw = false;
          try {while (!JSON.parse(unit.compiler_session_request(state, JSON.stringify({operation: 'response-next', token: first.token}))).done) {}}
          catch (error) {threw = true;if (failure === 'getter') assert.strictEqual(error, reason);else assert(error instanceof TypeError);}
          assert(threw);if (failure === 'getter') assert.equal(hits, 1);
        }
        assert.equal(state.responseCursor, null);assert.equal(index.segments, null);assert.equal(cursor.identities, null);
      } finally {unit.compiler_session_close(state);}
    }
  }
  for (const size of [undefined, 0, -1, 1.5, null, NaN, Infinity, 8388609]) assert.throws(() => unit.session_response_identities(size));
});

test('graph reconstruction refuses unknown active duplicate unsafe or out of order identities without accepting graph events in legacy mode', async () => {
  const malformed = [
    graphPacket([['reference', 1]], true), graphPacket([['object', 1], ['key', 'cycle'], ['reference', 1], ['end']], true),
    graphPacket([['array', 1], ['object', 2], ['end'], ['object', 2], ['end'], ['end']], true),
    graphPacket([['array', 2], ['end']], true), graphPacket([['object', 0], ['end']], true),
    graphPacket([['object', -1], ['end']], true), graphPacket([['array', 1.5], ['end']], true),
    graphPacket([['array', Number.MAX_SAFE_INTEGER + 1], ['end']], true),
    graphPacket([['array', 1], ['reference', 2], ['end']], true),
    graphPacket([['object'], ['end']], true), graphPacket([['array', 1, 2], ['end']], true),
    graphPacket([['array', 1], ['object', 3], ['end'], ['end']], true),
    graphPacket([['array', 1], ['reference', 1, 'extra'], ['end']], true),
    packet([['array', 1], ['end']], true),
  ];
  for (const part of malformed) {
    const a = await createCompilerSession({host: 'javascript', compiler: fakeDriver(request => request.operation === 'normal' ? {okay: true} : part)});
    try {
      assert.throws(() => a.request({operation: 'bad'}, {responseMode: graphResponseMode}), TypeError);
      assert.deepEqual(a.request({operation: 'normal'}), {okay: true});
    } finally {a.close();}
  }
  const a = await createCompilerSession({host: 'javascript', compiler: fakeDriver(() => graphPacket([['array', 1], ['end']], true))});
  try {assert.throws(() => a.request({operation: 'bad'}, {responseMode}), TypeError);} finally {a.close();}
  const old = await createCompilerSession({host: 'javascript', compiler: fakeDriver(request => request.operation === 'normal' ? {okay: true}
    : packet([['array'], ['object'], ['end'], ['reference', 1], ['end']], true))});
  try {
    assert.throws(() => old.request({operation: 'bad'}, {responseMode}), TypeError);
    assert.deepEqual(old.request({operation: 'normal'}), {okay: true});
  } finally {old.close();}
});

test('independent JS compiler response events retain complete IR native bytes debug metadata and exact floating values', async () => {
  const a = await openCompilerArtifact(artifact);
  try {
    const source = Array.from({length: 200}, (_, i) => `(defun item-${i} (value) (if value -0.0 ${i}))`).join('\n');
    const request = {operation: 'compile-ir', source, filename: 'event-source.eli'};
    assert.deepEqual(a.request(request, {responseMode}), a.request(request));
    const literal = {kind: 'literal', type: 'f64', value: -0, children: []};
    const typed = {abi: 'memory-u32', exports: ['zero'], functions: [{name: 'zero', index: 0, arity: 1,
      locals: [{name: 'address', index: 0, type: 'u32'}], body: {kind: 'memory-op', type: 'u32', value: 'store-f64', children: [
        {kind: 'local', type: 'u32', value: 0, children: []}, literal]}}]};
    const original = typed.functions[0];
    typed.functions = Array.from({length: 48}, (_, index) => ({...structuredClone(original), index, name: 'zero' + index}));
    typed.exports = typed.functions.map(fn => fn.name);
    for (const nativeTarget of ['arm64-macos', 'arm64-linux']) {
      const input = {operation: 'emit-typed-memory', target: 'native', nativeTarget, nativeFormat: 'library',
        ir: encodeCompilerIR(typed), debug: true, binaryEncoding: 'u16le-chunks'};
      const normal = a.request(input), streamed = a.request(input, {responseMode});
      assert.deepEqual(streamed, normal);assert(Object.is(streamed.typed.functions[0].body.children[1].value, -0));
      assert.deepEqual(decodeCompilerBinary(streamed.bytes), decodeCompilerBinary(normal.bytes));
      const graph = a.request(input, {responseMode: graphResponseMode});
      assert.deepEqual(graph, normal);assert(Object.is(graph.typed.functions[0].body.children[1].value, -0));
      assert.deepEqual(decodeCompilerBinary(graph.bytes), decodeCompilerBinary(normal.bytes));
    }
    const wasmInput = {operation: 'emit-typed-memory', target: 'wasm', ir: encodeCompilerIR(typed), debug: true};
    const plainWasm = a.request(wasmInput);
    assert(Array.isArray(plainWasm.bytes), 'the default public WASM byte-array contract remains intact');
    const packedWasm = a.request({...wasmInput, binaryEncoding: 'u16le-chunks'}, {responseMode});
    assert.equal(packedWasm.bytes.encoding, 'u16le-chunks');
    assert.deepEqual(decodeCompilerBinary(packedWasm.bytes), decodeCompilerBinary(plainWasm.bytes));
    assert.deepEqual(packedWasm.debug, plainWasm.debug);assert.deepEqual(packedWasm.typed, plainWasm.typed);
    assert(Object.is(packedWasm.typed.functions[0].body.children[1].value, -0));
    for (const binaryEncoding of [null, false, '', 'unknown', 'base64-chunks'])
      assert.throws(() => a.request({...wasmInput, binaryEncoding}), error => {
        const message = 'unsupported binary output encoding';
        // Backend refusals are the original structured thrown records. The
        // session must preserve that contract rather than invent an Error.
        assert.equal(Object.getPrototypeOf(error), Object.prototype);
        assert.deepEqual(error, {message, eliscriptDiagnostic: {format: 'eliscript-diagnostic', version: 1,
          code: 'ELI-B0001', severity: 'error', phase: 'numeric-backend', message,
          location: {file: '<ir>', start: {line: 1, column: 1}}}});
        return true;
      });
    assert.deepEqual(decodeCompilerBinary(a.request(wasmInput).bytes), decodeCompilerBinary(plainWasm.bytes));
    assert.equal(a.request({operation: 'capabilities'}, {responseMode}).format, 'eliscript-compiler-capabilities');
  } finally {a.close();}
}, 30000);

test('real small WASM debug graph responses preserve exact bytes every debug range shared spans and cursor recovery', async () => {
  const actual = await artifact.load(), messages = [], reason = {cancelled: true}, failure = {original: true};
  const controller = new AbortController();let state, lastCursor, abort = false, failNext = false;
  const session = await createCompilerSession({host: 'javascript', compiler: {
    ...actual,
    compiler_session_new() {
      state = actual.compiler_session_new();
      state.phaseObserver = phase => {
        if (phase === 'response-events-start') {lastCursor = state.responseCursor;if (abort) controller.abort(reason);}
      };
      return state;
    },
    compiler_session_request(owned, text) {
      const operation = JSON.parse(text).operation;
      if (messages.length < 64) messages.push(operation);
      if (failNext && operation === 'response-next') {failNext = false;throw failure;}
      return actual.compiler_session_request(owned, text);
    },
  }});
  const span = {filename: 'debug-shared.eli', start: 0, end: 16, line: 1, column: 1, endLine: 1, endColumn: 17};
  const node = (kind, type, value, children = []) => ({kind, type, value, children, span});
  const local = () => node('local', 'u32', 0);
  const typed = {abi: 'memory-u32', exports: ['probe'], functions: [{name: 'probe', index: 0, arity: 1, span,
    locals: [{name: 'address', index: 0, type: 'u32'}], body: node('sequence', 'u32', null, [
      node('memory-op', 'u32', 'store-f64', [local(), node('literal', 'f64', -0)]),
      node('memory-op', 'u32', 'load-u32', [local()]),
    ])}]};
  const request = {operation: 'emit-typed-memory', target: 'wasm', ir: encodeCompilerIR(typed), debug: true};
  try {
    const normal = session.request(request);
    const graph = session.request({...request, binaryEncoding: 'u16le-chunks'}, {responseMode: graphResponseMode});
    assert.deepEqual(decodeCompilerBinary(graph.bytes), decodeCompilerBinary(normal.bytes));
    assert.deepEqual(graph.debug, normal.debug);assert.deepEqual(graph.typed, normal.typed);
    assert.equal(graph.debug.ranges.length, normal.debug.ranges.length);
    assert.equal(graph.debug.trapSites.length, normal.debug.trapSites.length);
    assert(graph.debug.trapSites[0]);
    // trapSites contains mapped address records. The source span identity
    // belongs to the original trap-site and expression records in ranges.
    const trapIndex = graph.debug.ranges.findIndex(range => range.kind === 'trap-site');
    assert(trapIndex >= 0);const trap = graph.debug.ranges[trapIndex];
    const expressionIndex = graph.debug.ranges.findIndex(range => range.emission === 'expression' && range.span === trap.span);
    assert(expressionIndex >= 0, 'the real trap-site and its expression retain their shared source span');
    assert.notStrictEqual(graph.debug.ranges[expressionIndex], trap);
    assert.notStrictEqual(normal.debug.ranges[trapIndex].span, normal.debug.ranges[expressionIndex].span,
      'the default JSON response retains its original copy semantics');
    assert.equal(lastCursor.identities, null);assert.equal(state.responseCursor, null);
    const module = new WebAssembly.Module(decodeCompilerBinary(graph.bytes));
    assert.deepEqual(WebAssembly.Module.imports(module), []);
    const runtime = new WebAssembly.Instance(module).exports;
    assert.equal(runtime.probe(8), 0);assert(Object.is(new DataView(runtime.memory.buffer).getFloat64(8, true), -0));
    assert.throws(() => runtime.probe(65535), WebAssembly.RuntimeError);assert.equal(runtime.probe(8), 0);
    for (const mode of ['failure', 'cancel']) {
      messages.length = 0;failNext = mode === 'failure';abort = mode === 'cancel';
      let threw = false;
      try {session.request({...request, binaryEncoding: 'u16le-chunks'},
        {responseMode: graphResponseMode, ...(abort ? {signal: controller.signal} : {})});}
      catch (error) {threw = true;assert.strictEqual(error, abort ? reason : failure);}
      assert(threw);assert.equal(messages.at(-1), 'response-close');
      assert.equal(state.responseCursor, null);assert.equal(lastCursor.identities, null);assert.equal(lastCursor.root, null);
      abort = false;
      assert.equal(session.request({operation: 'capabilities'}, {responseMode: graphResponseMode}).format, 'eliscript-compiler-capabilities');
    }
  } finally {session.close();}
  assert.equal(state.phaseObserver, null);assert.equal(state.responseCursor, null);
}, 30000);

test('real response cursors bound every batch and reject stale tokens interleaving and invalid modes while allowing recovery', async () => {
  const driver = await artifact.load(), state = driver.compiler_session_new();
  const phases = [], observerFailure = {observer: true};let phaseOverflow = false;
  state.phaseObserver = (phase, scalars) => {
    if (phases.length < 32) phases.push({phase, scalars});else phaseOverflow = true;
    throw observerFailure;
  };
  const invoke = request => JSON.parse(driver.compiler_session_request(state, JSON.stringify(request)));
  const typed = {abi: 'memory-u32', exports: [], functions: Array.from({length: 200}, (_, index) => ({
    name: 'item' + index, index, arity: 0, locals: [],
    body: {kind: 'literal', type: 'u32', value: index, children: []},
  }))};
  typed.exports = typed.functions.map(fn => fn.name);
  const request = {operation: 'emit-typed-memory', target: 'native', nativeTarget: 'arm64-linux',
    nativeFormat: 'object', ir: encodeCompilerIR(typed), debug: true, binaryEncoding: 'u16le-chunks', responseMode};
  try {
    let part = invoke(request), batches = 0;
    const firstToken = part.token;
    assert.equal(part.done, false);
    for (;;) {
      assert.equal(part.format, 'eliscript-compiler-response-events');assert.equal(part.version, 1);
      assert.equal(part.token, firstToken);assert(part.events.length > 0 && part.events.length <= 256);
      const units = part.events.reduce((sum, event) => sum + (typeof event[1] === 'string' ? event[1].length : 0), 0);
      assert(units <= 32768 || part.events.length === 1);batches++;
      if (part.done) break;
      part = invoke({operation: 'response-next', token: firstToken});
    }
    assert(batches > 10);
    assert.deepEqual(phases.map(record => record.phase), ['response-events-start', 'response-serialize-start',
      'response-serialize-complete', 'response-events-complete'], 'response-next observes only completion, not every packet');
    assert.throws(() => invoke({operation: 'response-next', token: firstToken}), error => {
      assert.notStrictEqual(error, observerFailure);assert.match(error.message, /token/);
      assert.equal(error.eliscriptDiagnostic?.code, 'ELI-H0001');return true;
    });
    for (const mode of [null, false, '', 'unknown']) assert.throws(() => invoke({operation: 'capabilities', responseMode: mode}));
    const next = invoke(request);assert(next.token > firstToken);assert.equal(next.done, false);
    assert.throws(() => invoke({operation: 'capabilities'}), /pending/);
    assert.equal(invoke({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
    const cancelled = invoke(request);
    assert.equal(invoke({operation: 'response-close', token: cancelled.token}).done, true);
    assert.throws(() => invoke({operation: 'response-next', token: cancelled.token}));
    assert.equal(invoke({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
  } finally {driver.compiler_session_close(state);}
  // These assertions cannot be swallowed by the deliberately throwing hook.
  assert.equal(state.phaseObserver, null);assert.equal(phaseOverflow, false);assert(phases.length <= 32);
  for (const {phase, scalars} of phases) {
    assert(['response-events-start', 'response-events-complete', 'response-serialize-start', 'response-serialize-complete'].includes(phase));
    assert.deepEqual(Object.keys(scalars), ['count']);assert(Number.isSafeInteger(scalars.count) && scalars.count >= 0);
  }
}, 30000);

test('event reconstruction preserves signed zero UTF16 dangerous property names and deep containers across batch boundaries', async () => {
  const depth = 20000;let position = 0;
  const driver = fakeDriver(request => {
    if (request.operation === 'response-close') return {closed: true};
    const events = [];
    while (events.length < 256 && position < depth * 2 + 1) {
      events.push(position < depth ? ['array'] : position === depth ? ['value', -0] : ['end']);position++;
    }
    return packet(events, position === depth * 2 + 1);
  });
  const a = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    let value = a.request({operation: 'deep'}, {responseMode});
    for (let i = 0; i < depth; i++) {assert.equal(value.length, 1);value = value[0];}
    assert(Object.is(value, -0));assert(driver.messages.length > 100);
  } finally {a.close();}
  let index = 0;
  const frames = [[['object'], ['key', '__proto__']], [['value', '\ud800中😀\udfff'], ['key', 'zero']], [['value', -0], ['end']]];
  const b = await createCompilerSession({host: 'javascript', compiler: fakeDriver(() => packet(frames[index++], index === frames.length))});
  try {
    const value = b.request({operation: 'keys'}, {responseMode});
    assert.equal(Object.getPrototypeOf(value), Object.prototype);assert(Object.hasOwn(value, '__proto__'));
    assert.equal(value.__proto__, '\ud800中😀\udfff');assert(Object.is(value.zero, -0));
  } finally {b.close();}
});

test('malformed event batches are refused and pending output is cancelled before the next request', async () => {
  const cases = [packet([], false), packet([['end']], false), packet([['key', 'x']], false),
    packet([['object'], ['key', 'x'], ['end']], true), packet([['value', 1]], false),
    packet([['array']], true), packet([['value', {}]], true), packet([['array', 1]], true),
    packet([['array-values', [1]]], true),
    packet([['object'], ['key', 'not-an-array'], ['array-values', [1]], ['end']], true),
    ...[[], Array(257).fill(1), false, 'numbers', {}, [true], ['1'], [{}], [[1]]]
      .map(values => packet([['array'], ['array-values', values], ['end']], true)),
    packet([['array'], ['array-values']], true),
    packet([['array'], ['array-values', [1], 'extra'], ['end']], true),
    packet([['array'], ['end'], ['array-values', [1]]], true),
    packet(Array.from({length: 257}, () => ['array']), false),
    {...packet([['value', 1]], true), version: 2},
    {...packet([['value', 1]], true), token: 0}];
  for (const malformed of cases) {
    const driver = fakeDriver(request => request.operation === 'response-close' ? {closed: true}
      : request.operation === 'normal' ? {okay: true} : malformed);
    const a = await createCompilerSession({host: 'javascript', compiler: driver});
    try {
      assert.throws(() => a.request({operation: 'bad'}, {responseMode}), TypeError);
      if (malformed.done === false && malformed.token === 1 && malformed.version === 1)
        assert.equal(driver.messages.at(-1).operation, 'response-close');
      assert.deepEqual(a.request({operation: 'normal'}), {okay: true});
    } finally {a.close();}
  }
  // A valid JSON numeric token can overflow to Infinity in the host parser.
  // Send it as raw wire text so the normal test encoder cannot turn it to null.
  for (const token of ['1e999', '-1e999']) {
    const driver = fakeDriver(request => request.operation === 'normal' ? {okay: true} : {closed: true});
    const original = driver.compiler_session_request;
    driver.compiler_session_request = (state, text) => JSON.parse(text).operation === 'bad'
      ? `{"format":"eliscript-compiler-response-events","version":1,"token":1,"events":[["array"],["array-values",[${token}]],["end"]],"done":true}`
      : original(state, text);
    const a = await createCompilerSession({host: 'javascript', compiler: driver});
    try {
      assert.throws(() => a.request({operation: 'bad'}, {responseMode}), TypeError);
      assert.deepEqual(a.request({operation: 'normal'}), {okay: true});
    } finally {a.close();}
  }
});

test('event transport preserves the first thrown value cancellation cleanup and busy protection', async () => {
  for (const reason of [undefined, false, new Error('original driver failure')]) {
    const driver = fakeDriver(request => {
      if (request.operation === 'response-close') throw Error('later cleanup');
      if (request.operation === 'response-next') throw reason;
      return packet([['array']]);
    });
    const a = await createCompilerSession({host: 'javascript', compiler: driver});
    try {
      let threw = false;
      try {a.request({operation: 'fail'}, {responseMode});} catch (error) {threw = true;assert.strictEqual(error, reason);}
      assert(threw);assert.equal(driver.messages.at(-1).operation, 'response-close');
    } finally {a.close();}
  }
  const controller = new AbortController(), reason = {cancelled: true};let a;
  const driver = fakeDriver(request => {
    if (request.operation === 'response-close') return {closed: true};
    assert.throws(() => a.request({operation: 'reenter'}), /busy/);
    assert.throws(() => a.close(), /cannot close a compiler session during a request/);
    controller.abort(reason);return packet([['array']]);
  });
  a = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    let threw = false;
    try {a.request({operation: 'cancel'}, {responseMode, signal: controller.signal});}
    catch (error) {threw = true;assert.strictEqual(error, reason);}
    assert(threw);assert.equal(driver.messages.at(-1).operation, 'response-close');
  } finally {a.close();}
});

async function producerGraph() {
  // The complete independent compiler above remains the real producer. This
  // one-module product is a protocol fixture, not another complete compiler.
  return {entry: 'entry.mjs', modules: [{id: 'entry.mjs', filename: 'event-producer-entry.eli',
    source: '(defconst offset 1) (defun answer (value) (+ value offset)) (export answer)'}], literalSources: [],
    runtime: {filename: artifact.sourceIdentity.runtime.filename,
      source: decodeCompilerSourceAsset(await readFile(artifact.runtimePath), artifact.runtimeEncoding)}};
}
async function observedProducer() {
  const actual = await artifact.load();
  const observed = {legacy: false, failure: undefined, requests: [], wire: [], eventStarts: 0, nextBatches: 0};
  const driver = {
    compiler_session_new: (...args) => Reflect.apply(actual.compiler_session_new, actual, args),
    compiler_session_close: (...args) => Reflect.apply(actual.compiler_session_close, actual, args),
    compiler_session_request(state, text) {
      const request = JSON.parse(text);
      // Record bounded protocol metadata, never another full runtime/source/IR.
      if (request.operation === 'response-next') observed.nextBatches++;
      else observed.wire.push({operation: request.operation, target: request.target,
        hasMode: Object.hasOwn(request, 'responseMode'), mode: request.responseMode});
      const result = actual.compiler_session_request(state, text);
      if (request.operation === 'capabilities' && observed.legacy) {
        const capabilities = JSON.parse(result);
        if (observed.legacy === true) delete capabilities.responseModes;
        else capabilities.responseModes = [observed.legacy === 'graph-only' ? graphResponseMode : responseMode];
        return encodeCompilerIR(capabilities);
      }
      if (request.operation === 'project' && [responseMode, graphResponseMode].includes(request.responseMode)) {
        const part = JSON.parse(result);
        assert.equal(part.format, 'eliscript-compiler-response-events');
        assert.equal(part.version, request.responseMode === graphResponseMode ? 2 : 1);observed.eventStarts++;
      }
      return result;
    },
  };
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  observed.session = session;
  observed.producer = {host: 'javascript', request(request, options) {
    observed.requests.push({operation: request.operation, target: request.target,
      binaryEncoding: request.binaryEncoding, debug: request.debug,
      hasMode: Object.hasOwn(options ?? {}, 'responseMode'), mode: options?.responseMode});
    if (observed.failure?.operation === request.operation) throw observed.failure.value;
    const result = session.request(request, options);
    if (request.operation === 'project' && request.target === 'wasm') {
      assert.equal(result.bytes.encoding, 'u16le-chunks');
      observed.wasmWireBytes = decodeCompilerBinary(result.bytes);
    }
    return result;
  }};
  return observed;
}

async function buildNegotiatedNativeProduct(observed, sources, nativeTarget, legacy) {
      observed.legacy = legacy;observed.requests.length = 0;observed.wire.length = 0;
      const expectedMode = legacy === true ? undefined : legacy === 'events-only' ? responseMode : graphResponseMode;
      const starts = observed.eventStarts, batches = observed.nextBatches;
      const built = await buildIndependentCompiler({host: 'native', nativeTarget, sources,
        session: observed.producer, outputRoot: nativeProductDirectory(legacy)});
      assert.deepEqual(observed.requests.map(request => request.operation), ['runtime', 'capabilities', 'project']);
      assert(observed.requests.slice(0, 2).every(request => !request.hasMode));
      const project = observed.requests[2];assert.equal(project.target, 'native');
      assert.equal(project.binaryEncoding, 'u16le-chunks');assert.equal(project.hasMode, expectedMode !== undefined);
      assert.equal(project.mode, expectedMode);
      assert.deepEqual(observed.wire.map(request => request.operation), ['runtime', 'capabilities', 'project']);
      assert(observed.wire.slice(0, 2).every(request => !request.hasMode));
      assert.equal(observed.wire[2].mode, expectedMode);
      assert.equal(observed.eventStarts - starts, expectedMode === undefined ? 0 : 1);
      if (expectedMode !== undefined) assert(observed.nextBatches > batches, 'a genuine native project consumes multiple real event batches');
      else assert.equal(observed.nextBatches, batches);
      assert.equal(built.provenance.mode, 'session');assert.equal(built.provenance.producerHost, 'javascript');
      assert.deepEqual(new Uint8Array(await readFile(built.path)), built.bytes);
      assert.deepEqual([...built.bytes.subarray(0, 4)], nativeTarget === 'arm64-linux' ? [127, 69, 76, 70] : [207, 250, 237, 254]);
      if (process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform)) {
        const Module = WebAssembly.Module, Instance = WebAssembly.Instance;let runtime;
        try {
          WebAssembly.Module = function () {throw Error('native product substituted WASM');};
          WebAssembly.Instance = function () {throw Error('native product substituted WASM');};
          runtime = await instantiateNativeManagedRuntime(built.path, built.lowered,
            {...built.budget, initialPages: built.memory.initialPages, maximumPages: built.memory.maximumPages, nativeTarget});
        } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
        try {
          const input = runtime.number(41);let result;
          try {result = runtime.invoke('answer', [input]);assert.equal(runtime.readNumber(result), 42);}
          finally {if (result !== undefined) runtime.release(result);runtime.release(input);}
          runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
        } finally {runtime.close();}
      }
      return built.bytes;
}

function nativeProductDirectory(legacy) {
  return resolve(directory, legacy === true ? 'legacy-native-product' : legacy === 'events-only' ? 'events-native-product'
    : legacy === 'graph-only' ? 'graph-native-product' : 'modern-native-product');
}

async function buildOrdinaryProduct(observed, sources, host) {
  const productDirectory = resolve(directory, 'ordinary-' + host + '-product');
  return withOwnedProductCleanup([productDirectory], async () => {
      observed.requests.length = 0;observed.wire.length = 0;
      const starts = observed.eventStarts, batches = observed.nextBatches;
      const built = await buildIndependentCompiler({host, sources, session: observed.producer,
        outputRoot: productDirectory});
      if (host === 'javascript') {
        assert.deepEqual(observed.requests.map(request => request.operation), ['runtime', 'project']);
        assert(observed.requests.every(request => !request.hasMode && request.binaryEncoding === undefined));
        assert.deepEqual(observed.wire.map(request => request.operation), ['runtime', 'project']);
        assert(observed.wire.every(request => !request.hasMode));
        assert.equal(observed.eventStarts, starts);assert.equal(observed.nextBatches, batches);
        assert.equal((await built.load()).answer(41), 42);
      } else {
        assert.equal(host, 'wasm');
        assert.deepEqual(observed.requests.map(request => request.operation), ['runtime', 'capabilities', 'project']);
        assert(observed.requests.slice(0, 2).every(request => !request.hasMode));
        assert.equal(observed.requests[2].mode, responseMode);assert.equal(observed.requests[2].binaryEncoding, 'u16le-chunks');
        assert.deepEqual(observed.wire.map(request => request.operation), ['runtime', 'capabilities', 'project']);
        assert(observed.wire.slice(0, 2).every(request => !request.hasMode));assert.equal(observed.wire[2].mode, responseMode);
        assert.equal(observed.eventStarts, starts + 1);assert(observed.nextBatches > batches);
        assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(built.bytes)), []);
        assert.deepEqual(built.bytes, observed.wasmWireBytes);
        observed.wasmWireBytes = undefined;
        assert.deepEqual(new Uint8Array(await readFile(built.path)), built.bytes);
        const runtime = instantiateManagedRuntime(built.bytes, built.budget);runtime.auto(built.auto);
        const input = runtime.number(41);let result;
        try {result = runtime.invoke('answer', [input]);assert.equal(runtime.readNumber(result), 42);}
        finally {
          if (result !== undefined) runtime.release(result);runtime.release(input);
          runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
        }
      }
  });
}

async function negotiatedProductInChild(legacy, nativeTarget, started) {
  // A settled helper has no explicit owner of its typed result, but one engine
  // can retain allocation high-water marks across these full-runtime products.
  // Each owned child loads the SAME already built, authenticated compiler and
  // runs the original helper/assertions. Its exit ends that heap's lifetime.
  globalThis.Bun?.gc?.(true);
  const mode = legacy === false ? 'modern' : legacy === true ? 'legacy' : legacy;
  const childSource = `
import assert from 'node:assert/strict';
import {readFile, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCompilerSession, decodeCompilerSourceAsset, encodeCompilerIR} from ${JSON.stringify(new URL('../tools/backends/compiler-session.mjs', import.meta.url).href)};
import {buildIndependentCompiler, decodeCompilerBinary} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs', import.meta.url).href)};
import {openCompilerArtifact} from ${JSON.stringify(new URL('../tools/backends/compiler-bootstrap.mjs', import.meta.url).href)};
import {instantiateNativeManagedRuntime} from ${JSON.stringify(new URL('../tools/backends/native-managed-runtime.mjs', import.meta.url).href)};
import {instantiateManagedRuntime} from ${JSON.stringify(new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href)};
const responseMode = 'events-v1', graphResponseMode = 'graph-events-v1';
const legacy = ${JSON.stringify(legacy)}, nativeTarget = ${JSON.stringify(nativeTarget)}, mode = ${JSON.stringify(mode)};
function phaseMemory(phase, exitCode) {
  const usage = process.memoryUsage();
  console.error(JSON.stringify({phase: 'negotiation-child-' + phase, mode, rss: usage.rss,
    heapUsed: usage.heapUsed, heapTotal: usage.heapTotal, ...(exitCode === undefined ? {} : {exitCode})}));
}
phaseMemory('start');
process.on('exit', exitCode => phaseMemory('end', exitCode));
const metadataPath = ${JSON.stringify(artifact.metadataPath)};
const directory = dirname(metadataPath), metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const artifact = {...metadata, directory, metadataPath, runtimePath: resolve(directory, metadata.runtimePath),
  load: () => import(pathToFileURL(resolve(directory, metadata.path)).href)};
const authenticated = await openCompilerArtifact(artifact);
try {assert.equal(authenticated.host, 'javascript');} finally {authenticated.close();}
${producerGraph.toString()}
${observedProducer.toString()}
${nativeProductDirectory.toString()}
${withOwnedProductCleanup.toString()}
${buildNegotiatedNativeProduct.toString()}
${buildOrdinaryProduct.toString()}
const observed = await observedProducer(), sources = await producerGraph();
try {
  const bytes = await buildNegotiatedNativeProduct(observed, sources, nativeTarget, legacy);
  if (legacy === true) {
    observed.legacy = false;
    for (const host of ['javascript', 'wasm']) {
      globalThis.Bun?.gc?.(true);
      await buildOrdinaryProduct(observed, sources, host);
    }
  }
  const path = resolve(nativeProductDirectory(legacy), nativeTarget === 'arm64-linux' ? 'compiler.so' : 'compiler.dylib');
  console.log(JSON.stringify({path, byteLength: bytes.byteLength, legacy, nativeTarget}));
} finally {await observed.session.close();}
`;
  const productDirectory = nativeProductDirectory(legacy);
  const cleanupPaths = [productDirectory];
  if (legacy === true) cleanupPaths.push(resolve(directory, 'ordinary-javascript-product'), resolve(directory, 'ordinary-wasm-product'));
  return withOwnedProductCleanup(cleanupPaths, async () => {
  const remaining = 120000 - (Date.now() - started);
  assert(remaining > 0, `owned producer ${mode}: the original total negotiation deadline must remain available`);
  const args = process.versions.bun ? ['--smol', '--eval', childSource] : ['--input-type=module', '--eval', childSource];
  const child = spawnSync(process.execPath, args, {cwd: process.cwd(), encoding: 'utf8',
    timeout: remaining, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'inherit']});
  assert.equal(child.error, undefined, `owned producer ${mode} child error: ${child.error?.message ?? ''}`);
  assert.equal(child.signal, null, `owned producer ${mode} child signal: ${child.signal}`);
  assert.equal(child.status, 0, `owned producer ${mode} child exited ${child.status}`);
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.legacy, legacy, `owned producer ${mode} protocol identity`);
  assert.equal(result.nativeTarget, nativeTarget, `owned producer ${mode} native target`);
  assert.equal(result.path, resolve(productDirectory, nativeTarget === 'arm64-linux' ? 'compiler.so' : 'compiler.dylib'),
    `owned producer ${mode} exact owned product path`);
  const bytes = new Uint8Array(await readFile(result.path));
  assert.equal(bytes.byteLength, result.byteLength, `owned producer ${mode} emitted byte length`);
  return bytes;
  });
}

async function childOnlyBinaryNegotiation() {
  const started = Date.now();
  const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
  const modernBytes = await negotiatedProductInChild(false, nativeTarget, started);
  const eventsBytes = await negotiatedProductInChild('events-only', nativeTarget, started);
  assert.deepEqual(eventsBytes, modernBytes, 'events-only producers keep the exact native image');
  const graphBytes = await negotiatedProductInChild('graph-only', nativeTarget, started);
  assert.deepEqual(graphBytes, modernBytes, 'graph-only producers keep the exact native image');
  const legacyBytes = await negotiatedProductInChild(true, nativeTarget, started);
  assert.deepEqual(legacyBytes, modernBytes, 'negotiation does not change a single native product byte');
}

test('debug binary negotiation prefers supported graph responses and preserves the first producer refusal', async () => {
  const observed = await observedProducer();
  // This real producer compiles the runtime, then deliberately refuses the
  // project. It proves negotiation and first-error handling, not a successful
  // compiler artifact; the original complete-product cases remain above.
  const sources = {entry: 'entry.mjs', modules: [{id: 'entry.mjs', filename: 'debug-policy.eli',
    source: '(defun answer () 42) (export answer)'}], literalSources: [],
    runtime: {filename: 'debug-policy-runtime.eli', source: '(defun unused-runtime () 0)'}};
  let seedReads = 0;
  const frontend = new Proxy({}, {get() {seedReads++;throw Error('debug negotiation must not consult a seed');}});
  try {
    for (const host of ['native', 'wasm', 'javascript']) {
      for (const legacy of host === 'javascript' ? [false] : [false, 'events-only', 'graph-only', true]) {
        observed.legacy = legacy;observed.requests.length = 0;observed.wire.length = 0;
        const original = {host, legacy, refused: true};observed.failure = {operation: 'project', value: original};
        await assert.rejects(buildIndependentCompiler({host, debug: true, sources, session: observed.producer, frontend,
          sourceRoot: resolve(directory, 'absent-debug-seed'),
          outputRoot: resolve(directory, 'debug-refused-' + host + '-' + String(legacy))}), error => error === original);
        const binary = host !== 'javascript';
        assert.deepEqual(observed.requests.map(request => request.operation), binary
          ? ['runtime', 'capabilities', 'project'] : ['runtime', 'project']);
        assert(observed.requests.slice(0, -1).every(request => !request.hasMode));
        const project = observed.requests.at(-1);
        const expectedMode = !binary || legacy === true ? undefined : legacy === 'events-only' ? responseMode : graphResponseMode;
        assert.equal(project.target, host);assert.equal(project.debug, true);
        assert.equal(project.binaryEncoding, binary ? 'u16le-chunks' : undefined);
        assert.equal(project.hasMode, expectedMode !== undefined);assert.equal(project.mode, expectedMode);
        assert.deepEqual(observed.wire.map(request => request.operation), binary ? ['runtime', 'capabilities'] : ['runtime']);
        assert(observed.wire.every(request => !request.hasMode));assert.equal(seedReads, 0);
        observed.failure = undefined;
        assert.equal(observed.session.request({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
      }
      if (host !== 'javascript') {
        const original = new Error('debug capability refusal');observed.failure = {operation: 'capabilities', value: original};
        observed.requests.length = 0;
        await assert.rejects(buildIndependentCompiler({host, debug: true, sources, session: observed.producer, frontend,
          outputRoot: resolve(directory, 'debug-capability-refused-' + host)}), error => error === original);
        assert.deepEqual(observed.requests.map(request => request.operation), ['runtime', 'capabilities']);
        assert.equal(seedReads, 0);observed.failure = undefined;
      }
    }
  } finally {observed.failure = undefined;await observed.session.close();}
}, 30000);

test('the internal owned build boundary preserves public snapshots fallback first errors and session lifetime checks', async () => {
  const request = {operation: 'project', target: 'wasm'}, debug = {ranges: []};
  const product = {target: 'wasm', bytes: [], descriptor: {zero: -0, absent: undefined, finite: Infinity}, debug};
  let ownedCalls = 0, wireCalls = 0, action = () => ({format: 'eliscript-compiler-owned-project', version: 1, value: product});
  const driver = {compiler_session_new: () => ({}), compiler_session_close: () => true,
    compiler_session_request() {wireCalls++;return encodeCompilerIR(product);},
    compiler_session_project_owned(wire, state, text) {
      ownedCalls++;assert.strictEqual(wire, driver.compiler_session_request);assert.deepEqual(JSON.parse(text), request);
      return action();
    }};
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    const snapshot = session.request(request);assert.equal(ownedCalls, 0);assert.notStrictEqual(snapshot.debug, debug);
    assert.equal(isOwnedCompilerBuildProduct(snapshot), false);assert.equal(isOwnedCompilerBuildProduct(product), false);
    const owned = requestCompilerBuildProduct(session, request, {responseMode: graphResponseMode});
    assert.strictEqual(owned.debug, debug);assert.strictEqual(owned.bytes, product.bytes);
    assert.equal(isOwnedCompilerBuildProduct(owned), true);
    assert.notStrictEqual(owned.descriptor, product.descriptor);
    assert.deepEqual(owned.descriptor, {zero: -0, finite: null});assert.equal(wireCalls, 1);
    action = () => null;
    const fallback = requestCompilerBuildProduct(session, request);
    assert.deepEqual(fallback, snapshot);assert.equal(isOwnedCompilerBuildProduct(fallback), false);assert.equal(wireCalls, 2);
    const calls = ownedCalls;
    for (const input of [{operation: 'project', target: 'javascript'}, {operation: 'capabilities'},
      {...request, responseMode: undefined}, {...request, responseMode: null}]) {
      // JSON omits an undefined mode, so that request is eligible after the
      // same request encoding as the real public wire boundary.
      requestCompilerBuildProduct(session, input);
    }
    assert.equal(ownedCalls, calls + 1);
    for (const envelope of [undefined, false, {}, {format: 'eliscript-compiler-owned-project', version: 2, value: product},
      {format: 'eliscript-compiler-owned-project', version: 1, value: {...product, target: 'native'}},
      {format: 'eliscript-compiler-owned-project', version: 1, value: {...product, typed: {functions: []}}}]) {
      action = () => envelope;const before = wireCalls;
      assert.throws(() => requestCompilerBuildProduct(session, request), TypeError);assert.equal(wireCalls, before);
    }
    for (const original of [false, undefined, new Error('original owned failure')]) {
      action = () => {throw original;};const before = wireCalls;let threw = false;
      try {requestCompilerBuildProduct(session, request);} catch (error) {threw = true;assert.strictEqual(error, original);}
      assert(threw);assert.equal(wireCalls, before);
    }
    const controller = new AbortController(), reason = {cancelled: true};
    action = () => {
      assert.throws(() => session.request(request), /busy/);
      assert.throws(() => requestCompilerBuildProduct(session, request), /busy/);
      assert.throws(() => session.close(), /during a request/);
      controller.abort(reason);return {format: 'eliscript-compiler-owned-project', version: 1, value: product};
    };
    let cancelled = false;
    try {requestCompilerBuildProduct(session, request, {signal: controller.signal});}
    catch (error) {cancelled = true;assert.strictEqual(error, reason);}
    assert(cancelled);
    action = () => null;
    const before = ownedCalls, invalid = {toJSON() {throw reason;}};
    assert.throws(() => requestCompilerBuildProduct(session, invalid), error => error === reason);
    assert.equal(ownedCalls, before);
    assert.deepEqual(requestCompilerBuildProduct(session, request), snapshot);
    let customCalls = 0;
    const wrapper = {request(...args) {customCalls++;return session.request(...args);}};
    assert.deepEqual(requestCompilerBuildProduct(wrapper, request), snapshot);assert.equal(customCalls, 1);
  } finally {session.close();}
  assert.throws(() => requestCompilerBuildProduct(session, request), /closed/);
  const legacy = await createCompilerSession({host: 'javascript', compiler: {
    compiler_session_new: driver.compiler_session_new, compiler_session_request: driver.compiler_session_request,
    compiler_session_close: driver.compiler_session_close,
  }});
  try {assert.deepEqual(requestCompilerBuildProduct(legacy, request), JSON.parse(encodeCompilerIR(product)));}
  finally {legacy.close();}
});

test('owned normalization memo segments and completion cache rollover preserve DAG isolation exact values and first errors', async () => {
  // Load only these private functions, without adding a public tuning API or
  // exporting the normalizer from the production module. Small limits drive
  // the same segment and cache boundaries used by complete native products.
  const text = await readFile(new URL('../tools/backends/compiler-session.mjs', import.meta.url), 'utf8');
  const start = text.indexOf('function compilerOwnedDataMemo('), end = text.indexOf('\nfunction withRoots(', start);
  assert(start >= 0 && end > start);
  const unit = await import('data:text/javascript;base64,' + Buffer.from(text.slice(start, end) +
    '\nexport {compilerOwnedDataMemo, ownedCompilerDataNormalizer};').toString('base64'));
  for (const limit of [1, 2, 4]) {
    const memo = unit.compilerOwnedDataMemo(limit), keys = Array.from({length: 19}, (_, value) => ({value}));
    for (const key of keys) memo.set(key, {key});
    assert.equal(memo.segments.length, Math.ceil(keys.length / limit));
    assert(memo.segments.every(segment => segment.size > 0 && segment.size <= limit));
    for (const key of keys) assert.strictEqual(memo.get(key).key, key);
    assert.equal(memo.has({value: 0}), false);
    const count = memo.segments.length, replacement = {updated: true};
    memo.set(keys[0], replacement);assert.strictEqual(memo.get(keys[0]), replacement);
    assert.equal(memo.segments.length, count, 'updates find keys in earlier segments');
    assert.equal(memo.segments.reduce((sum, segment) => sum + segment.size, 0), keys.length);

    const span = Object.freeze({line: 1, column: 1, absent: undefined});
    const source = Object.freeze({kind: 'function-declaration', span,
      children: Object.freeze(Array.from({length: 23}, (_, value) => Object.freeze({value, span})))});
    const detached = {span, kind: 'literal', value: -0};
    const changed = {positive: Infinity, nan: NaN, absent: undefined, list: [undefined, , -0]};
    const canonical = {value: 7}, noise = Array.from({length: 41}, (_, value) => ({value}));
    const root = {source, body: [detached, changed, canonical, ...noise, detached, changed, canonical]};
    const expected = JSON.parse(encodeCompilerIR(root));
    const normalize = unit.ownedCompilerDataNormalizer({segmentSize: limit, completeLimit: limit});
    const result = normalize(root), tail = result.body.length;
    assert.deepEqual(result, expected);
    assert.strictEqual(result.body[0], result.body[tail - 3], 'detached fresh edges survive completion cache eviction');
    assert.strictEqual(result.body[1], result.body[tail - 2], 'changed COW results survive completion cache eviction');
    assert.strictEqual(result.body[2], canonical);assert.strictEqual(result.body[tail - 1], canonical);
    assert(Object.is(result.body[0].value, -0));assert(Object.is(result.body[1].list[2], -0));
    assert.notStrictEqual(result.source, source);assert.notStrictEqual(result.source.children, source.children);
    assert.notStrictEqual(result.source.span, span);
    assert.strictEqual(result.body[0].span, result.source.span);
    for (const child of result.source.children) assert.strictEqual(child.span, result.source.span);
    const debug = normalize({ranges: [{span}, ...noise, {span}], sources: [{macroOrigins: [source]}]});
    assert.strictEqual(debug.ranges[0].span, result.source.span);
    assert.strictEqual(debug.ranges.at(-1).span, result.source.span);
    assert.strictEqual(debug.sources[0].macroOrigins[0], result.source, 'borrowed identities span both output roots');
    result.source.span.line = 99;result.source.children[0].value = 100;
    assert.equal(span.line, 1);assert.equal(source.children[0].value, 0);
    assert.equal(Object.hasOwn(span, 'absent'), true);
    assert.equal(Object.hasOwn(changed, 'absent'), true);assert.equal(changed.positive, Infinity);

    const cycle = {};cycle.again = cycle;
    for (const [payload, expectedError] of [
      [{noise, bad: 1n, cycle}, /BigInt/], [{noise, cycle, bad: 1n}, /cycles/],
      [{noise, source: cycle}, /cycles/],
    ]) assert.throws(() => unit.ownedCompilerDataNormalizer({segmentSize: limit, completeLimit: limit})(payload), expectedError);
    const failure = {original: true}, getters = {};
    Object.defineProperty(getters, 'first', {enumerable: true, get() {throw failure;}});
    getters.later = 1n;
    assert.throws(() => unit.ownedCompilerDataNormalizer({segmentSize: limit, completeLimit: limit})({noise, getters}),
      error => error === failure);
  }
  for (const invalid of [0, -1, 1.5, null, NaN, Infinity, 1048577])
    assert.throws(() => unit.compilerOwnedDataMemo(invalid), TypeError);
  for (const invalid of [0, -1, 1.5, null, NaN, Infinity, 65537])
    assert.throws(() => unit.ownedCompilerDataNormalizer({completeLimit: invalid}), TypeError);
});

test('owned native products normalize complete typed data without mutating cached borrowed IR or public wire snapshots', async () => {
  const span = Object.freeze({start: 0, end: 1, line: 1, column: 1, omitted: undefined});
  const source = Object.freeze({kind: 'function-declaration', span,
    children: Object.freeze([{kind: 'literal', value: -0, span}])});
  const canonical = {kind: 'literal', type: 'u32', value: 0, children: []};
  const typed = {abi: 'memory-u32', exports: ['run'], functions: [{name: 'run', index: 0, arity: 0,
    locals: [], source, body: {kind: 'sequence', type: 'u32', value: null, children: [canonical,
      {kind: 'literal', type: 'f64', value: -0, children: [], span}]}}],
    metadata: {absent: undefined, positive: Infinity, negative: -Infinity, nan: NaN,
      list: [undefined, , -0, Infinity], shared: canonical}};
  Object.defineProperty(typed.metadata, '__proto__', {value: 'data', enumerable: true});
  const debug = {ranges: [{span}, {span}], sources: [{macroOrigins: [{span}]}]};
  const product = {target: 'native', nativeTarget: 'arm64-linux', nativeFormat: 'library', bytes: [],
    descriptor: {abi: 'managed-control-v1', zero: -0, absent: undefined, finite: Infinity}, typed, debug};
  const request = {operation: 'project', target: 'native', nativeTarget: 'arm64-linux'};
  let action = () => ({format: 'eliscript-compiler-owned-project', version: 1, value: product});
  let calls = 0, wires = 0;
  const driver = {compiler_session_new: () => ({}), compiler_session_close: () => true,
    compiler_session_request() {wires++;return encodeCompilerIR(product);},
    compiler_session_project_owned(wire, state, text) {
      calls++;assert.strictEqual(wire, driver.compiler_session_request);assert.deepEqual(JSON.parse(text), request);return action();
    }};
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    const wire = session.request(request), expectedTyped = encodeCompilerIR(wire.typed);
    const owned = requestCompilerBuildProduct(session, request, {responseMode: graphResponseMode});
    assert(isOwnedCompilerBuildProduct(owned));assert.equal(wires, 1);
    assert.deepEqual(owned, wire);assert.equal(encodeCompilerIR(owned.typed), expectedTyped);
    assert.strictEqual(owned.typed.functions[0].body.children[0], canonical, 'canonical typed subtree is not copied');
    assert.notStrictEqual(owned.typed.functions[0].source, source, 'cache-owned source graph is detached');
    const privateSpan = owned.typed.functions[0].source.span;
    assert.notStrictEqual(privateSpan, span);assert.strictEqual(privateSpan, owned.debug.ranges[0].span);
    assert.strictEqual(privateSpan, owned.debug.ranges[1].span);
    assert.strictEqual(privateSpan, owned.typed.functions[0].source.children[0].span);
    assert.strictEqual(privateSpan, owned.debug.sources[0].macroOrigins[0].span);
    assert.equal(Object.hasOwn(privateSpan, 'omitted'), false);assert.equal(Object.hasOwn(span, 'omitted'), true);
    assert.equal(Object.hasOwn(owned.typed.metadata, 'absent'), false);assert.equal(Object.hasOwn(typed.metadata, 'absent'), true);
    assert.equal(typed.metadata.positive, Infinity);assert(Number.isNaN(typed.metadata.nan));
    assert.deepEqual(owned.typed.metadata.list, [null, null, -0, null]);assert(Object.is(owned.typed.metadata.list[2], -0));
    assert.equal(Object.hasOwn(owned.typed.metadata, '__proto__'), true);assert.equal(owned.typed.metadata.__proto__, 'data');
    privateSpan.start = 99;owned.typed.functions[0].source.children[0].value = 17;
    assert.equal(span.start, 0);assert(Object.is(source.children[0].value, -0));
    wire.typed.functions[0].source.span.start = 77;assert.equal(privateSpan.start, 99);
    assert.equal(span.start, 0);
    const original = new Error('native private source getter');
    for (const broken of [
      {target: 'wasm', typed}, {...product, typed: null}, {...product, typed: {abi: 'other', functions: [], exports: []}},
      {...product, typed: {abi: 'memory-u32', functions: {}, exports: []}},
      {...product, typed: {abi: 'memory-u32', functions: [], exports: {}}},
      {...product, nativeTarget: 'arm64-macos'}, {...product, nativeFormat: 'object'},
    ]) {
      action = () => ({format: 'eliscript-compiler-owned-project', version: 1, value: broken});
      const before = wires;assert.throws(() => requestCompilerBuildProduct(session, request), TypeError);assert.equal(wires, before);
    }
    for (const [extra, message] of [[{bad: 1n}, /BigInt/], [(() => {const cycle = {};cycle.self = cycle;return cycle;})(), /cycles/]]) {
      action = () => ({format: 'eliscript-compiler-owned-project', version: 1, value: {...product, typed: {...typed, extra}}});
      const before = wires;assert.throws(() => requestCompilerBuildProduct(session, request), message);assert.equal(wires, before);
    }
    const throwing = {};
    Object.defineProperty(throwing, 'first', {enumerable: true, get() {throw original;}});
    throwing.later = 1n;
    action = () => ({format: 'eliscript-compiler-owned-project', version: 1, value: {...product, typed: {...typed, extra: throwing}}});
    assert.throws(() => requestCompilerBuildProduct(session, request), error => error === original);
    action = () => null;
    const before = calls;assert.deepEqual(requestCompilerBuildProduct(session, request), session.request(request));
    assert.equal(calls, before + 1);assert.equal(session.closed, false);
    const controller = new AbortController(), cancelled = {nativeCancelled: true};
    action = () => {
      assert.throws(() => session.close(), /during a request/);
      controller.abort(cancelled);return {format: 'eliscript-compiler-owned-project', version: 1, value: product};
    };
    assert.throws(() => requestCompilerBuildProduct(session, request, {signal: controller.signal}), error => error === cancelled);
  } finally {session.close();}
  assert.throws(() => requestCompilerBuildProduct(session, request), /closed/);
});

async function withOwnedProductCleanup(paths, operation) {
  // Every caller supplies exact direct children created by this fixture.
  // Never accept the shared compiler root or a path returned by a child.
  for (const path of paths) assert.equal(resolve(path, '..'), resolve(directory),
    'product cleanup must stay inside this fixture directory');
  let result, failed = false, failure;
  try {result = await operation();} catch (error) {failed = true;failure = error;}
  finally {
    for (const path of paths) {
      try {await rm(path, {recursive: true, force: true});}
      catch (error) {if (!failed) {failed = true;failure = error;}}
    }
  }
  if (failed) throw failure;
  return result;
}

function runOwnedProductChild(source, started, label) {
  const remaining = 120000 - (Date.now() - started);
  assert(remaining > 0, label + ': the original complete product deadline must remain available');
  const args = process.versions.bun ? ['--smol', '--eval', source] : ['--input-type=module', '--eval', source];
  const child = spawnSync(process.execPath, args, {cwd: process.cwd(), encoding: 'utf8', timeout: remaining,
    killSignal: 'SIGKILL', maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'inherit']});
  assert.equal(child.error, undefined, label + ': ' + (child.error?.message ?? ''));
  assert.equal(child.signal, null, label + ': owned child signal');
  assert.equal(child.status, 0, label + ': owned child exit; see inherited stderr');
  return JSON.parse(child.stdout.trim());
}

async function assertCompleteProductFiles(left, right, terminalNewline = false) {
  const files = [];let failed = false, failure, byteLength = 0, lastByte;
  const leftBuffer = Buffer.allocUnsafe(65536), rightBuffer = Buffer.allocUnsafe(65536);
  async function readBlock(file, buffer) {
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await file.read(buffer, length, buffer.length - length, null);
      assert(Number.isInteger(bytesRead) && bytesRead >= 0 && bytesRead <= buffer.length - length,
        'bounded product file reads must remain within their buffer');
      if (!bytesRead) break;
      length += bytesRead;
    }
    return length;
  }
  try {
    files.push(await open(left, 'r'));files.push(await open(right, 'r'));
    for (;;) {
      const leftLength = await readBlock(files[0], leftBuffer), rightLength = await readBlock(files[1], rightBuffer);
      assert.equal(leftLength, rightLength, 'both complete product files must end at the same byte');
      if (!leftLength) break;
      assert.equal(leftBuffer.subarray(0, leftLength).equals(rightBuffer.subarray(0, rightLength)), true,
        'complete product file bytes at offset ' + byteLength);
      lastByte = leftBuffer[leftLength - 1];byteLength += leftLength;
    }
  } catch (error) {failed = true;failure = error;}
  finally {
    for (const file of files) {
      try {await file.close();} catch (error) {if (!failed) {failed = true;failure = error;}}
    }
  }
  if (failed) throw failure;
  if (terminalNewline) assert.equal(lastByte, 10, 'the original terminal newline remains part of the exact file');
  return byteLength;
}

async function assertCompleteProductBytes(path, bytes) {
  const file = await open(path, 'r'), buffer = Buffer.allocUnsafe(65536);let offset = 0, failed = false;
  try {
    for (;;) {
      const {bytesRead} = await file.read(buffer, 0, buffer.length, null);
      assert(Number.isInteger(bytesRead) && bytesRead >= 0 && bytesRead <= buffer.length);
      if (!bytesRead) break;
      assert(offset + bytesRead <= bytes.byteLength, 'the complete binary has no trailing bytes');
      assert.equal(buffer.subarray(0, bytesRead).equals(bytes.subarray(offset, offset + bytesRead)), true,
        'complete product memory and file bytes at offset ' + offset);
      offset += bytesRead;
    }
    assert.equal(offset, bytes.byteLength, 'every product byte must be read and compared');
  } catch (error) {failed = true;throw error;}
  finally {try {await file.close();} catch (error) {if (!failed) throw error;}}
}

async function childOnlyOwnedWasmProducts() {
  const started = Date.now();
  // The same three original products use successive owned VMs. Ending the
  // snapshot VM releases its compiler graph and allocator high-water pages
  // before the builder, and the builder exits before complete debug decoding.
  const source = (stage, reference) => `
import assert from 'node:assert/strict';
import {open, readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCompilerSession, decodeCompilerSourceAsset, encodeCompilerIR, requestCompilerBuildProduct} from ${JSON.stringify(new URL('../tools/backends/compiler-session.mjs', import.meta.url).href)};
import {buildIndependentCompiler, decodeCompilerBinary, compilerMetadataDigest, writeCompilerMetadata} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs', import.meta.url).href)};
import {readCompilerMetadata} from ${JSON.stringify(new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href)};
import {openCompilerArtifact} from ${JSON.stringify(new URL('../tools/backends/compiler-bootstrap.mjs', import.meta.url).href)};
import {instantiateManagedRuntime} from ${JSON.stringify(new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href)};
const stage = ${JSON.stringify(stage)}, reference = JSON.parse(${JSON.stringify(encodeCompilerIR(reference ?? null))});
let phaseCount = 0;
function phaseMemory(phase, byteLength = 0) {
  if (phaseCount++ >= 12) return;
  const usage = process.memoryUsage();
  console.error(JSON.stringify({phase: 'owned-wasm-' + phase, stage, byteLength,
    rss: usage.rss, heapUsed: usage.heapUsed, heapTotal: usage.heapTotal}));
}
${assertCompleteProductFiles.toString()}
${assertCompleteProductBytes.toString()}
phaseMemory('start');
const metadataPath = ${JSON.stringify(artifact.metadataPath)}, directory = dirname(metadataPath);
const publicDebugPath = resolve(directory, 'owned-debug-public-writer.json');
if (stage === 'debug') {
  await (async () => {
    phaseMemory('debug-read-start');
    const savedDebug = await readCompilerMetadata(reference.debugPath);
    assert.equal(compilerMetadataDigest(savedDebug), reference.debugDigest, 'the entire saved debug value remains exact');
    assert.equal(savedDebug.moduleByteLength, reference.byteLength);
    phaseMemory('debug-digest-complete', savedDebug.moduleByteLength);
    // Reuse the original public-writer path, replacing its temporary binary
    // reference only after the builder has compared every reference byte.
    await writeCompilerMetadata(publicDebugPath, savedDebug);
    phaseMemory('public-debug-write-complete');
  })();
  phaseMemory('debug-record-scope-ended');
  const debugByteLength = await assertCompleteProductFiles(reference.debugPath, publicDebugPath, true);
  phaseMemory('debug-files-comparison-complete', debugByteLength);
  console.log(JSON.stringify({host: 'wasm', complete: true}));
} else {
const metadata = await readCompilerMetadata(metadataPath);
const artifact = {...metadata, directory, metadataPath, path: resolve(directory, metadata.path),
  runtimePath: resolve(directory, metadata.runtimePath)};
const sources = ${producerGraph.toString()};
const graph = await sources();
// The first astral pair crosses the private writer's UTF-16 slice boundary.
// Virtual filenames also retain isolated surrogate code units in JSON.
graph.modules[0].filename = 'a'.repeat(16382) + '😀\\ud800x\\udc00.eli';
const actual = await import(pathToFileURL(artifact.path).href);
assert.equal(typeof actual.compiler_session_project_owned, 'function');
const wire = (...args) => Reflect.apply(actual.compiler_session_request, actual, args);
assert.equal(actual.compiler_session_project_owned(wire, null, ''), null, 'wrapped wire identity opts out before inspecting state or JSON');
const producer = await openCompilerArtifact(artifact);
let phaseResult;
try {
  // Runtime assets still go through the authenticated adapter's original
  // injection path. Project ownership alone forwards to the raw session.
  await producer.request({operation: 'runtime', literalSources: []});
  phaseMemory('runtime-ready');
  const memory = {initialPages: 128, maximumPages: 4096};
  const request = {operation: 'project', target: 'wasm', modules: graph.modules, entry: graph.entry,
    memory, nativeTarget: process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos',
    nativeFormat: 'library', binaryEncoding: 'u16le-chunks', debug: true};
  async function compareSnapshots() {
    const owned = requestCompilerBuildProduct(producer, request);
    assert.equal(owned.target, 'wasm');assert.equal(owned.typed, undefined);
    const trap = owned.debug.ranges.find(range => range.kind === 'trap-site');assert(trap);
    assert(owned.debug.ranges.some(range => range.emission === 'expression' && range.span === trap.span),
      'the real artifact adapter forwards the fresh debug graph rather than a JSON copy');
    const normal = await producer.request(request);
    assert.deepEqual(decodeCompilerBinary(owned.bytes), decodeCompilerBinary(normal.bytes));
    assert.deepEqual(owned.debug, normal.debug);assert.deepEqual(owned.descriptor, normal.descriptor);
    const cachedRequest = {operation: 'cached-ir', kind: 'module', id: graph.entry, revision: normal.revision};
    const before = await producer.request(cachedRequest);
    normal.descriptor.publicSnapshotMutation = true;
    const range = normal.debug.ranges.find(range => range.span);assert(range);range.span.publicSnapshotMutation = true;
    assert.equal(owned.descriptor.publicSnapshotMutation, undefined);
    assert(owned.debug.ranges.every(range => range.span?.publicSnapshotMutation === undefined));
    assert.deepEqual(await producer.request(cachedRequest), before);
    return {bytes: decodeCompilerBinary(owned.bytes), descriptor: owned.descriptor,
      debugDigest: compilerMetadataDigest(owned.debug)};
  }
  if (stage === 'snapshot') {
    phaseMemory('snapshot-comparison-start');
    const expected = await compareSnapshots();
    phaseMemory('snapshot-comparison-complete', expected.bytes.byteLength);
    await writeFile(publicDebugPath, expected.bytes);
    phaseResult = {host: 'wasm', complete: true, byteLength: expected.bytes.byteLength,
      descriptor: expected.descriptor, debugDigest: expected.debugDigest};
  } else {
  assert.equal(stage, 'build');
  phaseMemory('build-start');
  const built = await buildIndependentCompiler({host: 'wasm', sources: graph, session: producer, debug: true,
    outputRoot: resolve(directory, 'owned-debug-wasm-product')});
  phaseMemory('build-complete', built.bytes.byteLength);
  assert.equal(built.provenance.mode, 'session');assert.equal(built.provenance.producerHost, 'javascript');
  assert.equal(built.bytes.byteLength, reference.byteLength);assert.deepEqual(built.descriptor, reference.descriptor);
  await assertCompleteProductBytes(built.path, built.bytes);
  await assertCompleteProductFiles(built.path, publicDebugPath);
  phaseMemory('binary-files-comparison-complete', built.bytes.byteLength);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(built.bytes)), []);
  phaseMemory('execution-start');
  const runtime = instantiateManagedRuntime(built.bytes, built.budget);runtime.auto(built.auto);
  const input = runtime.number(41);let result;
  try {result = runtime.invoke('answer', [input]);assert.equal(runtime.readNumber(result), 42);}
  finally {
    if (result !== undefined) runtime.release(result);runtime.release(input);
    runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
  }
  phaseMemory('execution-complete');
  let wrappedCalls = 0;
  const wrapped = await createCompilerSession({host: 'javascript', compiler: {...actual,
    compiler_session_request(...args) {wrappedCalls++;return Reflect.apply(actual.compiler_session_request, actual, args);}}});
  const invalid = {...request, modules: [{...graph.modules[0], source: '(defun broken ('}]};
  try {
    let original;
    try {wrapped.request(invalid);} catch (error) {original = error;}
    assert(original);const before = wrappedCalls;
    assert.throws(() => requestCompilerBuildProduct(wrapped, invalid), error => {
      assert.equal(error.message, original.message);assert.deepEqual(error.eliscriptDiagnostic, original.eliscriptDiagnostic);return true;
    });
    assert.equal(wrappedCalls, before + 1, 'a wrapped real wire still observes the project failure');
    assert.equal(wrapped.request({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
  } finally {wrapped.close();}
  phaseMemory('wrapped-failure-recovery-complete');
  assert.equal((await producer.request({operation: 'capabilities'})).format, 'eliscript-compiler-capabilities');
  phaseResult = {host: 'wasm', complete: true, debugPath: built.debugPath, byteLength: built.bytes.byteLength};
  }
} finally {await producer.close();}
assert.equal(producer.closed, true);
assert.throws(() => requestCompilerBuildProduct(producer, {operation: 'project', target: 'wasm'}), /closed/);
phaseMemory('closed');
console.log(encodeCompilerIR(phaseResult));
}
`;
  await withOwnedProductCleanup([resolve(directory, 'owned-debug-wasm-product'),
    resolve(directory, 'owned-debug-public-writer.json')], async () => {
    const expected = runOwnedProductChild(source('snapshot'), started, 'owned WASM snapshot');
    assert.equal(expected.host, 'wasm');assert.equal(expected.complete, true);
    const built = runOwnedProductChild(source('build', expected), started, 'owned WASM build');
    assert.equal(built.host, 'wasm');assert.equal(built.complete, true);
    assert.deepEqual(runOwnedProductChild(source('debug', {...built, debugDigest: expected.debugDigest}),
      started, 'owned WASM complete debug files'), {host: 'wasm', complete: true});
  });
}

async function childOnlyOwnedNativeProducts() {
  const started = Date.now();
  // The reference and owned builds still compile and execute the same full
  // products; their separate owned VM lifetimes do not overlap allocator pages.
  const source = (stage, reference) => `
import assert from 'node:assert/strict';
import {open} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCompilerSession, decodeCompilerSourceAsset, encodeCompilerIR, requestCompilerBuildProduct} from ${JSON.stringify(new URL('../tools/backends/compiler-session.mjs', import.meta.url).href)};
import {buildIndependentCompiler, compilerMetadataDigest} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs', import.meta.url).href)};
import {instantiateNativeManagedRuntime} from ${JSON.stringify(new URL('../tools/backends/native-managed-runtime.mjs', import.meta.url).href)};
import {readFile} from 'node:fs/promises';
const stage = ${JSON.stringify(stage)}, reference = JSON.parse(${JSON.stringify(encodeCompilerIR(reference ?? null))});
let phaseCount = 0;
function phaseMemory(phase, byteLength = 0) {
  if (phaseCount++ >= 24) return;
  try {
    const usage = process.memoryUsage();
    console.error(JSON.stringify({phase: 'owned-native-' + phase, stage, byteLength,
      rss: usage.rss, heapUsed: usage.heapUsed, heapTotal: usage.heapTotal}));
  } catch {} // Diagnostic I/O must never replace a compiler or assertion error.
}
phaseMemory('start');
const artifact = ${JSON.stringify({path: artifact?.path, runtimePath: artifact?.runtimePath, runtimeEncoding: artifact?.runtimeEncoding,
    sourceIdentity: artifact?.sourceIdentity})};
const directory = ${JSON.stringify(directory)}, graph = await (${producerGraph.toString()})();
const actual = await import(pathToFileURL(artifact.path).href);
let state;
const driver = {...actual, compiler_session_new(...args) {
  state = Reflect.apply(actual.compiler_session_new, actual, args);
  // Observe the existing private JS phases only. Nothing is added to request
  // JSON, source identities, emitted products or managed host capabilities.
  const observed = new Set(['managed-lower-start', 'managed-lower-complete',
    'response-events-start', 'response-events-complete']);
  state.phaseObserver = phase => {if (observed.has(phase)) phaseMemory('compiler-' + phase);};
  return state;
}};
const producer = await createCompilerSession({host: 'javascript', compiler: driver});
const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
${assertCompleteProductFiles.toString()}
async function execute(built) {
  if (process.arch !== 'arm64' || !['darwin', 'linux'].includes(process.platform)) return;
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;let runtime;
  try {
    WebAssembly.Module = function () {throw Error('native product substituted WASM');};
    WebAssembly.Instance = function () {throw Error('native product substituted WASM');};
    runtime = await instantiateNativeManagedRuntime(built.path, built.lowered,
      {...built.budget, initialPages: built.memory.initialPages, maximumPages: built.memory.maximumPages, nativeTarget});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
  try {
    runtime.auto(built.auto);const input = runtime.number(41);let result;
    try {result = runtime.invoke('answer', [input]);assert.equal(runtime.readNumber(result), 42);}
    finally {if (result !== undefined) runtime.release(result);runtime.release(input);}
    runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
  } finally {runtime.close();}
}
let phaseResult;
try {
  if (stage === 'reference') {
  const wire = {host: producer.host, request(...args) {
    const operation = ['runtime', 'capabilities', 'project', 'cached-ir'].includes(args[0]?.operation)
      ? args[0].operation : 'other';
    phaseMemory('wire-' + operation + '-start');
    try {
      const result = producer.request(...args);
      phaseMemory('wire-' + operation + '-end');return result;
    } catch (error) {phaseMemory('wire-' + operation + '-throw');throw error;}
  }};
  const observedBuildPhases = new Set(['project-start', 'project-complete', 'retained-ir-start', 'retained-ir-complete',
    'file-identities-start', 'file-identities-complete', 'product-identity-start', 'product-identity-complete',
    'debug-file-start', 'debug-file-complete', 'artifact-metadata-start', 'artifact-metadata-complete']);
  const onPhase = (phase, counts) => {
    if (observedBuildPhases.has(phase)) phaseMemory('builder-' + phase,
      Number.isSafeInteger(counts?.byteLength) ? counts.byteLength : 0);
  };
  phaseMemory('reference-build-start');
  phaseResult = await (async () => {
    const built = await buildIndependentCompiler({host: 'native', nativeTarget, sources: graph, session: wire,
      debug: true, onPhase, outputRoot: resolve(directory, 'wire-native-debug-product')});
    phaseMemory('reference-build-complete', built.bytes.byteLength);
    await execute(built);
    phaseMemory('reference-execution-complete', built.bytes.byteLength);
    const cachedRequest = {operation: 'cached-ir', kind: 'module', id: graph.entry, revision: state.projectRevision};
    return {path: built.path, metadataPath: built.metadataPath, debugPath: built.debugPath,
      typedDigest: compilerMetadataDigest(built.typed), descriptorDigest: compilerMetadataDigest(built.descriptor),
      productIdentity: built.productIdentity, fileIdentity: built.artifactIdentity,
      functions: built.typed.functions.length, cached: producer.request(cachedRequest)};
  })();
  phaseMemory('reference-identities-complete');
  } else {
  assert.equal(stage, 'owned');
  phaseMemory('owned-build-start');
  const built = await buildIndependentCompiler({host: 'native', nativeTarget, sources: graph, session: producer,
    debug: true, outputRoot: resolve(directory, 'owned-native-debug-product')});
  phaseMemory('owned-build-complete', built.bytes.byteLength);
  const cachedRequest = {operation: 'cached-ir', kind: 'module', id: graph.entry, revision: state.projectRevision};
  const cached = reference.cached;
  assert.deepEqual(producer.request(cachedRequest), cached, 'both real complete builds publish the same cached module record');
  assert.equal(built.typed.functions.length, reference.functions);
  assert.equal(compilerMetadataDigest(built.typed), reference.typedDigest, 'all typed nodes and IEEE values');
  assert.equal(compilerMetadataDigest(built.descriptor), reference.descriptorDigest);
  assert.deepEqual(built.productIdentity, reference.productIdentity);
  assert.deepEqual(built.artifactIdentity, reference.fileIdentity);
  phaseMemory('complete-files-comparison-start');
  await assertCompleteProductFiles(built.path, reference.path);await assertCompleteProductFiles(built.debugPath, reference.debugPath);
  await assertCompleteProductFiles(built.metadataPath, reference.metadataPath);
  phaseMemory('complete-files-comparison-complete');
  await execute(built);
  phaseMemory('owned-execution-complete', built.bytes.byteLength);
  const fn = built.typed.functions.find(fn => fn.source);assert(fn, 'complete native metadata retains original source records');
  const pending = [...state.runtime.body];let original;
  while (pending.length) {
    const node = pending.pop();
    if (node.kind === 'function-declaration' && node.value === fn.source.value) {original = node;break;}
    if (node.kind === 'module-declaration') pending.push(...node.children);
  }
  assert(original);assert.notStrictEqual(fn.source, original);
  const name = original.value, line = original.span?.line;
  fn.source.value = 'private-returned-source-mutation';
  if (fn.source.span) fn.source.span.line = 999;
  assert.equal(original.value, name);assert.equal(original.span?.line, line);
  assert.deepEqual(producer.request(cachedRequest), cached);
  phaseMemory('source-cache-isolation-complete');
  const wrapped = await createCompilerSession({host: 'javascript', compiler: {...actual,
    compiler_session_request(...args) {return Reflect.apply(actual.compiler_session_request, actual, args);}}});
  try {
    const invalid = {operation: 'project', target: 'native', nativeTarget,
      modules: [{id: 'broken.mjs', source: '(defun broken ('}], entry: 'broken.mjs'};
    let first;try {wrapped.request(invalid);} catch (error) {first = error;}
    assert(first);assert.throws(() => requestCompilerBuildProduct(wrapped, invalid), error => {
      assert.equal(error.message, first.message);assert.deepEqual(error.eliscriptDiagnostic, first.eliscriptDiagnostic);return true;
    });
  } finally {wrapped.close();}
  phaseMemory('wrapped-failure-recovery-complete');
  phaseResult = {host: 'native', complete: true};
  }
} finally {producer.close();}
assert.equal(producer.closed, true);
phaseMemory('closed');
console.log(encodeCompilerIR(phaseResult));
`;
  await withOwnedProductCleanup([resolve(directory, 'wire-native-debug-product'),
    resolve(directory, 'owned-native-debug-product')], async () => {
    const reference = runOwnedProductChild(source('reference'), started, 'real native wire reference');
    assert.deepEqual(runOwnedProductChild(source('owned', reference), started, 'real native owned product'),
      {host: 'native', complete: true});
  });
}

test('binary response negotiation and project failures preserve the producer error without consulting the seed', async () => {
  const observed = await observedProducer(), sources = await producerGraph();
  let seedReads = 0;
  const frontend = new Proxy({}, {get() {seedReads++;throw Error('independent failure must not call a seed frontend');}});
  try {
    for (const host of ['native', 'wasm']) for (const operation of ['capabilities', 'project']) {
      const original = new Error('original producer ' + operation + ' failure');
      observed.failure = {operation, value: original};observed.requests.length = 0;
      await assert.rejects(buildIndependentCompiler({host, sources, session: observed.producer, frontend,
        sourceRoot: resolve(directory, 'absent-seed-root'), outputRoot: resolve(directory, 'failed-' + host + '-' + operation)}), error => error === original);
      assert.deepEqual(observed.requests.map(request => request.operation), operation === 'capabilities'
        ? ['runtime', 'capabilities'] : ['runtime', 'capabilities', 'project']);
      assert.equal(seedReads, 0);
      if (operation === 'project') assert.equal(observed.requests.at(-1).mode,
        host === 'native' ? graphResponseMode : responseMode);
      observed.failure = undefined;
      assert.equal(observed.session.request({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
    }
    // Reuse this already initialized real runtime. A bad encoding cannot
    // replace the earlier precise managed-lowering error or invoke a seed.
    const compiler = await import(pathToFileURL(resolve(artifact.directory, 'bootstrap/compiler.mjs')).href);
    const program = compiler.compile_ir_string('(defun token (x) (host-identity-token x)) (export token)', 'binary-config-order.eli');
    const pending = [...program.body];let intrinsic;
    while (pending.length) {
      const node = pending.pop();if (node.kind === 'intrinsic' && node.value === 'host-identity-token') intrinsic = node;
      pending.push(...node.children);
    }
    assert(intrinsic);intrinsic.children = [];
    for (const binaryEncoding of [null, false, 'unknown'])
      assert.throws(() => observed.session.request({operation: 'emit-ir', target: 'wasm',
        ir: encodeCompilerIR(program), binaryEncoding}), error => {
          assert.equal(error.message, 'host-identity-token expects 1 argument, got 0');
          assert.equal(error.eliscriptDiagnostic?.phase, 'managed-backend');return true;
        });
    assert.equal(seedReads, 0);
    assert.equal(observed.session.request({operation: 'capabilities'}).format, 'eliscript-compiler-capabilities');
  } finally {await observed.session.close();}
}, 30000);
