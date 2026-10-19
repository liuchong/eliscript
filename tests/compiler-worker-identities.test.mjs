import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compilerRequestIdentity, compilerSourceIdentity} from '../tools/backends/compiler-worker.mjs';

const reference = text => createHash('sha256').update(Buffer.from(text, 'utf16le')).digest('hex');

test('worker request identities retain exact UTF16LE bytes across fixed buffer boundaries and concurrent requests', async () => {
  const texts = ['', '\0', '\ufeff', '\ud800', '\udfff', '😀', '中文\0😀\ud800x\udc00'];
  for (const length of [32765, 32766, 32767, 32768, 32769, 65535, 65536, 65537, 131075])
    texts.push('x'.repeat(length) + '😀\ud800\0\udc00中文');
  const actual = await Promise.all(texts.map(text => compilerRequestIdentity(text)));
  assert.deepEqual(actual, texts.map(reference));
  const object = {operation: 'compile', source: texts.at(-1), filename: '原文😀\ud800.eli',
    values: [-0, Number.MIN_VALUE, Infinity, undefined], ignored: undefined};
  const text = JSON.stringify(object);
  assert.equal(await compilerRequestIdentity(object), reference(text));
  assert.equal(await compilerRequestIdentity(text), reference(text));
  let reads = 0;
  const input = {operation: 'compile', get source() {reads++;return texts.at(-1);}};
  const expected = reference(JSON.stringify(input));reads = 0;
  const pending = compilerRequestIdentity(input);assert.equal(reads, 1);
  input.operation = 'edited-after-dispatch';
  assert.equal(await pending, expected);assert.equal(reads, 1);
});

test('worker source identities preserve canonical field selection explicit library inputs and edit preview source rules', async () => {
  const source = 'x'.repeat(32767) + '😀\ud800\0\udc00', filename = 'source/中文😀.eli';
  const macroContext = {capabilities: ['files'], files: [{specifier: './macro.eli', content: source}]};
  const expected = reference(JSON.stringify({filename, source, macroContext}));
  const base = {source, filename, macroContext};
  for (const operation of ['compile', 'compile-ir', 'analyze', 'query', 'edit-preview', 'format', 'stage']) {
    const request = {...base, operation, literalSources: [{id: 'unused', filename: 'unused.eli', source: 'ignored'}],
      target: 'native', nativeTarget: 'arm64-linux', debug: true};
    assert.equal(await compilerSourceIdentity(request), expected, operation);
    assert.equal(await compilerSourceIdentity(JSON.stringify(request)), expected, operation + ' encoded');
  }
  const libraries = [{id: 'runtime/a.mjs', filename: 'library.eli', source}];
  const runtime = {...base, operation: 'runtime', literalSources: libraries};
  const runtimeExpected = reference(JSON.stringify({filename, source, macroContext, literalSources: libraries}));
  assert.equal(await compilerSourceIdentity(runtime), runtimeExpected);
  assert.notEqual(runtimeExpected, expected);
  assert.notEqual(await compilerSourceIdentity({...runtime, literalSources: []}), runtimeExpected);
  const project = {operation: 'project', entry: 'entry.mjs', modules: [{id: 'entry.mjs', source}]};
  const projectExpected = reference(JSON.stringify({entry: 'entry.mjs', modules: [
    {id: 'entry.mjs', filename: 'entry.mjs', source, macroContext: {capabilities: [], files: []}},
  ], hostSources: [], hostModules: []}));
  assert.equal(await compilerSourceIdentity(project), projectExpected);
});

test('worker identity hashing avoids whole-message WebCrypto while retaining unavailable-host and original input error contracts', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const restore = () => {if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);else delete globalThis.crypto;};
  try {
    let calls = 0;
    Object.defineProperty(globalThis, 'crypto', {configurable: true, value: {subtle: {digest() {
      calls++;throw new Error('worker identity must not submit a whole-message byte snapshot');
    }}}});
    const text = '中文😀\ud800'.repeat(12000);
    assert.equal(await compilerRequestIdentity(text), reference(text));assert.equal(calls, 0);
    const source = {operation: 'compile', source: text, filename: 'input.eli'};
    assert.equal(await compilerSourceIdentity(source), reference(JSON.stringify({filename: 'input.eli', source: text,
      macroContext: {capabilities: [], files: []}})));
    assert.equal(calls, 0);
    for (const crypto of [undefined, null, {}, {subtle: undefined}, {subtle: null}, {subtle: false}]) {
      Object.defineProperty(globalThis, 'crypto', {configurable: true, value: crypto});
      for (const request of [() => compilerRequestIdentity(''), () => compilerSourceIdentity(source)])
        await assert.rejects(request, error => error.name === 'CompilerWorkerError' && error.code === 'unavailable-identity' &&
          error.message === 'SHA-256 is unavailable in this host');
    }
    for (const reason of [undefined, false, {original: true}, new Error('original input')]) {
      let caught = false;
      try {await compilerRequestIdentity({toJSON() {throw reason;}});} catch (error) {
        caught = true;assert.strictEqual(error, reason);
      }
      assert(caught, 'input encoding failures retain priority over unavailable crypto');
      caught = false;
      try {await compilerSourceIdentity({get source() {throw reason;}});} catch (error) {
        caught = true;assert.strictEqual(error, reason);
      }
      assert(caught);
    }
  } finally {restore();}
});
