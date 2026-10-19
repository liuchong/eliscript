import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createOriginalCorpusSourceReader} from '../tools/backends/compiler-corpus.mjs';
import {addOriginalManagedFixtureAdapters} from '../tools/backends/compiler-corpus-managed-fixtures.mjs';
import {originalSourceCaseLocators} from '../tools/backends/compiler-corpus-managed-cases.mjs';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const unary = 'tests/wasm-memory-f64-unary.test.mjs';
const literal = 'tests/wasm-memory-f64-literal.test.mjs';
const indices = 'tests/wasm-managed-regexp-indices.test.mjs';
const unicodeSets = 'tests/wasm-managed-regexp-unicode-sets.test.mjs';
const propertyData = 'tests/wasm-managed-regexp-property-data.test.mjs';
const staticData = 'tests/wasm-memory-static-data.test.mjs';
const nativeData = 'tests/native-memory-data-copy.test.mjs';
const transcendental = 'tests/wasm-managed-math-transcendental.test.mjs';
const unretained = 'tests/wasm-memory-f64-unretained.test.mjs';
// These are the pre-existing mandatory original suites. The additional f64
// replay must preserve each complete suite, including its raw ABI cases.
const originalSuites = [
  'wasm-managed-arithmetic', 'wasm-managed-word', 'wasm-managed-array-callbacks',
  'wasm-managed-arrays', 'wasm-managed-array-text', 'wasm-managed-callables',
  'wasm-managed-control', 'wasm-managed-empty-bindings', 'wasm-managed-exceptions',
  'wasm-managed-catch-destructuring', 'wasm-managed-function-properties',
  'wasm-managed-json', 'wasm-managed-math', 'wasm-managed-module-bindings',
  'wasm-managed-number-conversion', 'wasm-managed-objects', 'wasm-managed-primitive-operators',
  'wasm-managed-regexp', 'wasm-managed-regexp-indices', 'wasm-managed-replacement', 'wasm-managed-source-collections',
  'wasm-managed-strings', 'wasm-managed-variadic-calls', 'wasm-managed-tables',
  'wasm-managed-runtime', 'wasm-managed-js-cons', 'managed-persistent-vector',
  'wasm-managed-array-construction', 'wasm-managed-array-search', 'wasm-managed-object-properties',
  'wasm-managed-symbols', 'wasm-managed-builtins', 'wasm-managed-typeof',
  'wasm-managed-project-linking', 'direct-wasm-backend',
].map(name => 'tests/' + name + '.test.mjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function replay(includeUnaryLocators) {
  const records = [];let unretainedReads = 0;
  const reader = createOriginalCorpusSourceReader({sourceRoot, async read(filename) {
    // This available source is deliberately absent from the frozen locator
    // inventory. File-name resemblance must not admit it to actual replay.
    if (filename === resolve(sourceRoot, unretained)) {
      unretainedReads++;return Buffer.from("test('unretained case', () => { throw Error('must not enter replay'); });\n");
    }
    return readFile(filename);
  }});
  const locators = originalSourceCaseLocators(literal, await reader.text(literal));
  locators.push(...originalSourceCaseLocators(indices, await reader.text(indices)));
  for (const filename of [unicodeSets, propertyData, staticData, nativeData, transcendental])
    locators.push(...originalSourceCaseLocators(filename, await reader.text(filename)));
  if (includeUnaryLocators) locators.push(...originalSourceCaseLocators(unary, await reader.text(unary)));
  assert.deepEqual(await addOriginalManagedFixtureAdapters({sourceRoot, locators,
    stableFiles: new Set(), file: reader.file, text: reader.text, add: record => records.push(record)}), []);
  assert.equal(records.length, 1, 'the complete selected compiler replay is one real product record');
  const record = records[0];assert.equal(record.id, 'original-managed-suite:complete-fixture-suites');
  assert.equal(record.kind, 'project');assert.equal(record.request.operation, 'project');
  assert.equal(record.request.phased, true);assert.equal(record.request.resolveImports, true);
  assert.deepEqual(record.request.entries, record.modules.map(module => module.id));
  assert(record.modules.length > 0);assert(record.modules.every(module => typeof module.source === 'string'));
  assert.equal(record.execution.kind, 'original-program');assert.equal(record.execution.hostRuntime, 'bun');
  assert.equal(record.execution.referenceArtifact, true);assert.equal(record.execution.zeroImports, true);
  assert.equal(record.execution.timeoutMs, 1800000);assert.equal(record.original.testSource, 'unmodified');
  const bindings = record.original.suites, files = bindings.map(binding => binding.file);
  assert.equal(new Set(files).size, files.length);assert.deepEqual(files, [...files].sort());
  for (const filename of [...originalSuites, unary, literal, unicodeSets, propertyData, staticData, nativeData, transcendental])
    assert(files.includes(filename), filename + ' keeps its complete original source');
  assert(!files.includes(unretained));assert.equal(unretainedReads, 0);
  assert(!reader.evidence().some(item => item.file === unretained));
  const schedule = /for\s*\(\s*const\s+suite\s+of\s+(\[[^\n]*\])\s*\)\s*await\s+run\s*\(/.exec(record.execution.hostSource);
  assert(schedule, 'the actual host must sequentially invoke every complete original suite');
  assert.deepEqual(JSON.parse(schedule[1]), files, 'hash bindings and the real selected-host execution list must match');
  assert.match(record.execution.hostSource, /spawn\s*\(\s*process[.]env[.]BUN\s*\?\?\s*['"]bun['"]\s*,\s*args\s*,/);
  assert.match(record.execution.hostSource, /args\s*[.]\s*push\s*\(\s*['"]--preload['"]\s*,\s*plugin\s*,\s*['"]test['"]\s*,\s*suite\s*,?\s*\)/);
  assert.match(record.execution.hostSource, /assert[.]equal\s*\(\s*result[.]code\s*,\s*0\s*,/);
  for (const binding of bindings) {
    const bytes = await readFile(resolve(sourceRoot, binding.file)), evidence = await reader.file(binding.file);
    assert.equal(binding.sourceSha256, digest(bytes));assert.equal(binding.sourceSha256, evidence.sha256);
    assert.equal(evidence.bytes, bytes.length);assert.deepEqual(Buffer.from(evidence.content, 'base64'), bytes);
  }
  assert.deepEqual([...record.coverage].sort(), locators.map(locator => locator.id).sort());
  for (const locator of locators) {
    const binding = bindings.find(item => item.file === locator.file);
    assert(binding.coverage.includes(locator.id), locator.contains + ' must retain its own complete-case coverage');
    assert.equal(binding.sourceSha256, locator.originalCase.sourceSha256);
    assert((await reader.text(locator.file)).includes(locator.contains));
  }
  return {record, locators};
}

test('the original f64 unary suite is mandatory even without retained unary locators and preserves every prior complete suite', async () => {
  const {record, locators} = await replay(false);
  assert(locators.some(locator => locator.file === literal));
  assert(locators.some(locator => locator.file === indices));
  assert(locators.every(locator => [literal, indices, unicodeSets, propertyData, staticData, nativeData, transcendental].includes(locator.file)));
  assert.deepEqual(record.original.suites.find(binding => binding.file === unary).coverage, []);
});

test('retained f64 literal and unary registrations all bind their actual source hashes and selected-host execution without omissions', async () => {
  const {record, locators} = await replay(true);
  for (const filename of [literal, unary, indices, unicodeSets, propertyData, staticData, nativeData, transcendental]) {
    const cases = locators.filter(locator => locator.file === filename);
    assert(cases.length > 0);
    assert.deepEqual(record.original.suites.find(binding => binding.file === filename).coverage,
      cases.map(locator => locator.id));
  }
});
