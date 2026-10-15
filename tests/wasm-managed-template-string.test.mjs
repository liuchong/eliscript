import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

let directory, backend, runtime;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-template-string-'));
  backend = await buildBackends({ outputRoot: directory });
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
function artifact(source) {
  const program = backend.compiler.compile_ir_string(source, 'template.eli'), saved = JSON.stringify(program);
  const bytes = Uint8Array.from(backend.managed.emit_managed_wasm(program, runtime));
  assert.equal(JSON.stringify(program), saved);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  return bytes;
}
const source = '(defun convert (value) (js* "`${value}`")) (export convert)';
function finish(a) { a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0); }

test('an exact single lexical template substitution implements implicit ToString in zero-import WASM', () => {
  const a = instantiateManagedRuntime(artifact(source)); a.auto(1);
  for (const value of [undefined, null, false, true, -0, NaN, Infinity, -Infinity, 1e-7, 1e21, '', '😀\ud800']) {
    const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value;
    const result = a.invoke('convert', [input]);
    assert.equal(a.readString(result), `${value}`);
    a.release(input); a.release(result);
  }
  finish(a);
});

test('template lowering refuses unbound names and expressions beyond its represented lexical substitution', () => {
  for (const expression of ['`${missing}`', '`${value.x}`', '`${value + 1}`', '`${value}${value}`', '`prefix${value}`']) {
    assert.throws(() => artifact('(defun convert (value) (js* ' + JSON.stringify(expression) + ')) (export convert)'));
  }
});

function read(a, value) {
  if (value?.kind === 4) return a.readNumber(value);
  if (value?.kind === 5) return a.readString(value);
  if (value?.kind === 14) return Array.from({ length: a.length(value) }, (_, i) => {
    const child = a.get(value, i); try { return read(a, child); } finally { a.release(child); }
  });
  return value;
}
const family = `
  (defun hooked (mode)
    (let* ((events (js-array)) (value (js-object)))
      (put value :toString (lambda () (js-call events :push "toString") (if (= mode 1) (js-object) "ordinary")))
      (put value :valueOf (lambda () (js-call events :push "valueOf") 7))
      (when (= mode 0)
        (put value (js* "Symbol.toPrimitive")
          (lambda (hint) (js-call events :push hint) "special")))
      (let ((text (js* "\u0060\u0024{value}\u0060"))) (js-array text events))))
  (defun array-text ()
    (let* ((events (js-array)) (value (js-array undefined nil 1)))
      (put value :join (lambda () (js-call events :push "join") "custom"))
      (js-array (js* "\u0060\u0024{value}\u0060") events)))
  (defun symbol-value () (funcall (js* "Symbol") "x"))
  (defun fail-convert (value trace)
    (put value (js* "Symbol.toPrimitive")
      (lambda (hint) (put trace :visited t) (throw trace)))
    (try (js* "\u0060\u0024{value}\u0060") (catch error (Object/is error trace))))
  (defun shadow (value)
    (let ((value "inner")) (js* "\u0060\u0024{value}\u0060")))
  (export hooked array-text symbol-value fail-convert shadow)`;

test('template conversion preserves string-hint protocol callbacks ordinary fallback custom array join and lexical shadowing under per-allocation GC', () => {
  const a = instantiateManagedRuntime(artifact(source.replace('(export convert)', '') + family)); a.auto(1);
  for (const [mode, expected] of [[0, ['special', ['string']]], [1, ['7', ['toString', 'valueOf']]], [2, ['ordinary', ['toString']]]]) {
    const input = a.number(mode), out = a.invoke('hooked', [input]);
    assert.deepEqual(read(a, out), expected); a.release(input); a.release(out);
  }
  const joined = a.invoke('array-text'); assert.deepEqual(read(a, joined), ['custom', ['join']]); a.release(joined);
  const shadow = a.invoke('shadow', [undefined]); assert.equal(a.readString(shadow), 'inner'); a.release(shadow);
  const trace = a.sourceObject({}), object = a.sourceObject({});
  assert.equal(a.invoke('fail-convert', [object, trace]), true);
  const key = a.string('visited'); assert.equal(a.objectGet(trace, key), true);
  const symbol = a.invoke('symbol-value');
  assert.throws(() => a.invoke('convert', [symbol]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0003');
  for (const value of [trace, object, key, symbol]) a.release(value);
  assert.equal(a.stats().frameDepth, 0); finish(a);
});

test('template ToString ABI rejects invalid heaps and handles before allocation and recovers after collection', () => {
  const bytes = artifact(source), e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const heap = e['heap-new'](64, 4096, 16384);
  assert.equal(e['last-error'](), 0);
  assert.equal(e['value-source-to-string'](0, 3), 0); assert.equal(e['last-error'](), 1);
  assert.equal(e['value-source-to-string'](heap, 0xffffffff), 0); assert.equal(e['last-error'](), 1);
  const output = e['value-source-to-string'](heap, 3); assert(output > 3); assert.equal(e['last-error'](), 0);
  assert.equal(e['value-length'](heap, output), 9);
  e['heap-collect'](heap); assert.equal(e['last-error'](), 0); assert.equal(e['heap-live'](heap), 0);
});
