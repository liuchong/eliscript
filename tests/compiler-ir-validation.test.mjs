import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

let directory, ir, compiler;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-ir-validation-'));
  const child = spawnSync(resolve('bin/eliscript-bootstrap'), [], {encoding: 'utf8', timeout: 30000,
    env: {...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory}});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  ir = await import(pathToFileURL(resolve(directory, 'ir.mjs')).href);
  compiler = await import(pathToFileURL(resolve(directory, 'compiler.mjs')).href);
}, 30000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

const span = () => ({filename: 'validation.eli', start: 0, end: 1, line: 1, column: 1, endLine: 1, endColumn: 2});
const node = () => ({kind: 'literal', span: span(), value: 0, children: [], properties: {}});
const program = () => ({filename: 'validation.eli', body: [node()]});
function withValue(value) {const p = program();p.body[0].value = value;return p;}
function withProperties(properties) {const p = program();p.body[0].properties = properties;return p;}
function nested(count) {let value = 0;while (count--) value = [value];return value;}
function failure(action) {
  try {action();assert.fail('expected malformed IR rejection');}
  catch (error) {
    assert.equal(error.eliscriptDiagnostic?.code, 'ELI-I0001');
    assert.equal(error.eliscriptDiagnostic.message, error.message);
    return {name: error.name, message: error.message, diagnostic: error.eliscriptDiagnostic};
  }
}
function sameFailure(factory, expected) {
  const serialized = failure(() => ir.serialize_program(factory()));
  const validated = failure(() => ir.validate_serializable_program(factory()));
  assert.deepEqual(validated, serialized);
  if (expected !== undefined) assert.equal(validated.message, expected);
}
// Independent spelling of the original formatter, used only after validation.
function originalCanonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(originalCanonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + originalCanonical(value[key])).join(',') + '}';
}

test('validation-only IR keeps the complete original fixture corpus and canonical formatter bytes', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/bootstrap-ir.json', 'utf8'));
  for (const item of fixture.valid) {
    const source = Object.hasOwn(item, 'source') ? item.source : await readFile(item.file, 'utf8');
    const p = compiler.compile_ir_string(source, item.filename), saved = structuredClone(p);
    const expected = originalCanonical({format: 'eliscript-ir', program: p, version: 1});
    assert.equal(ir.serialize_program(p), expected);
    assert.equal(ir.validate_serializable_program(p), p);
    assert.deepEqual(p, saved);
    assert.equal(ir.serialize_program(p), expected);
    assert.deepEqual(ir.deserialize_program(expected), p);
  }
});

test('both validation passes preserve finite values signed zero UTF16 and shared JSON data without producing output', () => {
  const shared = {text: '\0\ufeff中😀\ud800\udfff', values: [false, true, null, -0, Number.MIN_VALUE, Number.MAX_VALUE]};
  const value = Object.assign(Object.create(null), {z: shared, a: shared});
  const p = withValue(value), saved = Object.getOwnPropertyDescriptors(value), serialized = ir.serialize_program(p);
  const stringify = JSON.stringify;
  // A validation-only pass must not call the formatter on keys or primitives.
  // This also catches accidentally constructing and discarding its final text.
  JSON.stringify = () => {throw new Error('validation must not format JSON');};
  try {assert.equal(ir.validate_serializable_program(p), p);} finally {JSON.stringify = stringify;}
  assert.equal(p.body[0].value, value);
  assert.deepEqual(Object.getOwnPropertyDescriptors(value), saved);
  assert(Object.is(p.body[0].value.a.values[3], -0));
  assert.equal(p.body[0].value.a, p.body[0].value.z);
  assert.equal(serialized, originalCanonical({format: 'eliscript-ir', program: p, version: 1}));
  assert.equal(ir.serialize_program(p), serialized);
  const absent = program();delete absent.body[0].properties;
  assert.equal(ir.validate_serializable_program(absent), absent);
  assert.equal(ir.serialize_program(absent), originalCanonical({format: 'eliscript-ir', program: absent, version: 1}));
});

test('schema rejections precede arbitrary JSON payload checks with the original exact diagnostics', () => {
  const cases = [
    () => null, () => [], () => ({filename: 'x'}), () => ({...program(), extra: true}),
    () => ({...program(), filename: 1}), () => ({...program(), body: new Array(1)}),
    () => ({...program(), body: [null]}),
    () => {const p = program();p.body[0].kind = 'unknown';return p;},
    () => {const p = program();delete p.body[0].value;return p;},
    () => {const p = program();p.body[0].extra = true;return p;},
    () => {const p = program();p.body[0].span.start = -1;return p;},
    () => {const p = program();p.body[0].span.end = -1;return p;},
    () => {const p = program();p.body[0].span.line = 0;return p;},
    () => {const p = program();p.body[0].span.endColumn = .5;return p;},
    () => {const p = program();p.body[0].span.filename = undefined;return p;},
    () => {const p = program();p.body[0].span.start = 2;return p;},
    () => {const p = program();p.body[0].children = [undefined];return p;},
    () => {const p = program();p.body[0].children.push(p.body[0]);return p;},
    ...[null, undefined, false, 0, 'x', 1n, Symbol('x'), () => 1, [], new Date(0)]
      .map(value => () => withProperties(value)),
    () => {const p = withValue(NaN);const bad = node();bad.kind = 'later-unknown';p.body.push(bad);return p;},
  ];
  for (const factory of cases) sameFailure(factory);
  sameFailure(cases.at(-1), 'unknown Eliscript IR node kind: later-unknown');
  sameFailure(() => {const p = program();let current = p.body[0];for (let i = 0; i < 513; i++) {
    const child = node();current.children = [child];current = child;
  }return p;}, 'IR node exceeds nesting depth 512');
});

test('JSON data rejections preserve original sorted paths unsupported types dense arrays plain records and cycle detection', () => {
  for (const value of [NaN, Infinity, -Infinity]) sameFailure(() => withValue(value),
    '$.program.body[0].value must contain only finite numbers');
  for (const [value, type] of [[undefined, 'undefined'], [1n, 'bigint'], [Symbol('x'), 'symbol'], [() => 1, 'function']])
    sameFailure(() => withValue(value), '$.program.body[0].value contains unsupported JSON type ' + type);
  for (const value of [new Date(0), new Map(), new Set(), new Number(1), new Uint8Array(2), Object.create({x: 1})])
    sameFailure(() => withValue(value), '$.program.body[0].value must be a plain data object');
  const arrays = [() => new Array(1), () => {const a = [];a.extra = 1;return a;},
    () => {const a = [1];Object.defineProperty(a, '0', {enumerable: false});return a;},
    () => {const a = [];a[Symbol('x')] = 1;return a;},
    () => {const a = [];Object.setPrototypeOf(a, null);return a;}];
  for (const make of arrays) sameFailure(() => withValue(make()), '$.program.body[0].value must be a dense plain array');
  sameFailure(() => {const a = [];a.push(a);return withValue(a);},
    '$.program.body[0].value[0] contains a cyclic JSON value');
  sameFailure(() => {const a = {};a.self = a;return withValue(a);},
    '$.program.body[0].value.self contains a cyclic JSON value');
  sameFailure(() => withProperties({z: Infinity, a: {z: undefined, a: 1n}}),
    '$.program.body[0].properties.a.a contains unsupported JSON type bigint');
  sameFailure(() => withValue(nested(509)),
    '$.program.body[0].value' + '[0]'.repeat(509) + ' exceeds IR nesting depth 512');
  const boundary = withValue(nested(508));
  assert.equal(ir.validate_serializable_program(boundary), boundary);
  assert.equal(ir.serialize_program(boundary), originalCanonical({format: 'eliscript-ir', program: boundary, version: 1}));
});

test('original accessor and descriptor rejection does not invoke getters or conversion hooks in either pass', () => {
  let calls = 0;
  const getter = () => {calls++;throw new Error('must not evaluate getter');};
  const factories = [
    () => {const p = program();Object.defineProperty(p.body[0], 'properties', {enumerable: true, get: getter});return p;},
    () => {const a = [1];Object.defineProperty(a, '0', {enumerable: true, get: getter});return withValue(a);},
    () => withValue(Object.defineProperty({}, 'x', {enumerable: true, get: getter})),
    () => withValue(Object.defineProperty({}, 'hidden', {value: 1})),
    () => withValue({[Symbol('x')]: 1}),
    () => withValue({toJSON: () => {calls++;return 1;}}),
  ];
  for (const factory of factories) sameFailure(factory);
  assert.equal(calls, 0);
});

test('shared canonical token output preserves exact wide and deep long UTF16 payloads without changing input data', () => {
  const shared = {z: -0, a: '\0\ufeff中😀\ud800\udfff'};
  const wide = withValue(Array.from({length: 4096}, (_, index) => ({
    ['键"\\\n' + index]: index, shared, text: 'Unicode 😀\ud800 boundary '.repeat(8),
  })));
  let deepValue = '\0\ufeff中😀\ud800\udfff"\\\n'.repeat(16384);
  for (let depth = 0; depth < 360; depth++) {
    deepValue = depth % 2 ? [deepValue] : {['层"\\' + depth]: deepValue};
  }
  for (const p of [wide, withValue(deepValue)]) {
    const snapshot = structuredClone(p);
    const expected = originalCanonical({format: 'eliscript-ir', program: p, version: 1});
    assert(expected.length > 65536, 'the original output crosses the shared token flush boundary');
    assert.equal(ir.serialize_program(p), expected);
    assert.equal(ir.validate_serializable_program(p), p);
    assert.equal(ir.serialize_program(p), expected);
    assert.deepEqual(ir.deserialize_program(expected), p);
    assert.deepEqual(p, snapshot);
  }
  assert.equal(wide.body[0].value[0].shared, wide.body[0].value.at(-1).shared);
  assert(Object.is(shared.z, -0));
});

test('canonical token flushing preserves primitive formatting order original first errors and recovery after partial output', () => {
  const p = withValue({z: [1, -0, false, '\ud800😀'], a: {z: true, a: 'first'}});
  const stringify = JSON.stringify, expectedCalls = [], actualCalls = [];
  const recording = calls => value => {
    if (typeof value === 'string' || typeof value === 'number') calls.push(value);
    return stringify(value);
  };
  let expected, actual;
  try {
    JSON.stringify = recording(expectedCalls);
    expected = originalCanonical({format: 'eliscript-ir', program: p, version: 1});
    JSON.stringify = recording(actualCalls);
    actual = ir.serialize_program(p);
  } finally {JSON.stringify = stringify;}
  assert.equal(actual, expected);
  assert.deepEqual(actualCalls, expectedCalls, 'keys and primitive values retain their original sorted left-to-right order');

  const prefix = Array.from({length: 2048}, (_, index) => 'payload '.repeat(8) + index);
  sameFailure(() => withValue([...prefix, {z: undefined, a: 1n}]),
    '$.program.body[0].value[2048].a contains unsupported JSON type bigint');
  const marker = new Error('original formatter exception after complete chunks');
  const partial = withValue([...prefix, 'throw after flushing']);
  JSON.stringify = value => {
    if (value === 'throw after flushing') throw marker;
    return stringify(value);
  };
  try {assert.throws(() => ir.serialize_program(partial), error => error === marker);}
  finally {JSON.stringify = stringify;}
  assert.equal(ir.serialize_program(p), expected, 'a failed formatter leaves no shared token state for the next call');
  JSON.stringify = () => {throw new Error('validation-only must never format a token');};
  try {assert.equal(ir.validate_serializable_program(partial), partial);}
  finally {JSON.stringify = stringify;}
});
