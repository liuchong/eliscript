import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';

let directory, backend;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-memory-f64-'));
  backend = await buildBackends({outputRoot: directory});
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function compile(source) {
  const program = backend.compiler.compile_ir_string(source, 'memory-f64.eli');
  const module = new WebAssembly.Module(Uint8Array.from(backend.wasm.emit_memory_wasm(program)));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  return new WebAssembly.Instance(module).exports;
}
const backendFailure = error => error.eliscriptDiagnostic?.code === 'ELI-B0001' && error.eliscriptDiagnostic.phase === 'memory-backend';

test('internal static f64 literals preserve exact IEEE bytes without changing the word ABI', () => {
  const literals = ['0.0', '-0.0', '-1', '-1.25', '0.5', '4294967296', '9007199254740991', '9007199254740992',
    '5e-324', '-5e-324', '2.2250738585072014e-308', '1.7976931348623157e308'];
  const source = '(import "eliscript:memory32" f64-literal store-f64)\n' + literals.map((literal, index) =>
    `(defun write${index} (address) (store-f64 address (f64-literal ${literal})))`).join('\n') +
    '\n(export ' + literals.map((_, index) => 'write' + index).join(' ') + ')';
  const e = compile(source), view = new DataView(e.memory.buffer);
  for (const [index, literal] of literals.entries()) {
    const address = index * 8, expected = new ArrayBuffer(8), number = Number(literal);
    new DataView(expected).setFloat64(0, number, true);
    assert.equal(e['write' + index](address), 0);
    assert.deepEqual(new Uint8Array(e.memory.buffer, address, 8), new Uint8Array(expected), literal);
    assert(Object.is(view.getFloat64(address, true), number), literal);
  }
  const locals = compile(`(import "eliscript:memory32" f64-literal store-f64)
    (defun write () (let ((number (f64-literal -1.25)))
      (setq number (+ number (f64-literal 0.5))) (store-f64 0 number))) (export write)`);
  assert.equal(locals.write(), 0);assert.equal(new DataView(locals.memory.buffer).getFloat64(0, true), -.75);
});

test('the internal f64 capability requires exactly one plain static Number and cannot be shadowed', () => {
  for (const expression of ['(f64-literal)', '(f64-literal 1 2)', '(f64-literal address)', '(f64-literal (+ 1 2))',
    '(f64-literal "1")', '(f64-literal nil)', '(f64-literal t)', '(f64-literal :number)']) {
    assert.throws(() => compile(`(import "eliscript:memory32" f64-literal store-f64)
      (defun bad (address) (store-f64 0 ${expression})) (export bad)`), backendFailure, expression);
  }
  assert.throws(() => compile(`(import "eliscript:memory32" f64-literal store-f64)
    (defun bad (f64-literal) (store-f64 0 (f64-literal 1))) (export bad)`), backendFailure);
});

test('f64 support does not admit invalid bare word literals or change scalar result types', () => {
  for (const literal of ['-1', '-0.0', '1.5', '4294967296', '9007199254740991']) {
    assert.throws(() => compile(`(defun bad () ${literal}) (export bad)`), backendFailure, literal);
  }
  assert.throws(() => compile('(import "eliscript:memory32" f64-literal) (defun bad () (f64-literal 1)) (export bad)'), backendFailure);
  const e = compile('(defun high () 4294967295) (export high)');
  assert.equal(e.high() >>> 0, 0xffffffff);
});
