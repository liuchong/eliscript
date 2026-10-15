import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

let directory, backend, program, runtime, reference, bytes, syntaxProgram, syntaxReference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-symbol-module-'));
  backend = await buildBackends({ outputRoot: directory });
  const source = await readFile('bootstrap/compiler/symbol.eli', 'utf8');
  program = backend.compiler.compile_ir_string(source, 'symbol.eli');
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
  syntaxProgram = backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/syntax.eli', 'utf8'), 'syntax.eli');
  syntaxReference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(syntaxProgram)).toString('base64'));
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function artifact() {
  if (bytes) return bytes;
  const saved = JSON.stringify(program);
  bytes = Uint8Array.from(backend.managed.emit_managed_wasm(program, runtime));
  assert.equal(JSON.stringify(program), saved);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  return bytes;
}
function finish(a) { a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0); }
function invoke(a, name, value) {
  const input = a.string(value);
  try {
    const out = a.invoke(name, [input]);
    try { return { value: a.readString(out) }; } finally { a.release(out); }
  } catch (error) {
    const key = a.string('message');
    try {
      const message = a.objectGet(error, key);
      try { return { error: a.readString(message) }; } finally { a.release(message); }
    } finally { a.release(key); a.release(error); }
  } finally { a.release(input); }
}
function expected(name, value) {
  try { return { value: reference[name.replaceAll('-', '_')](value) }; }
  catch (error) { return { error: error.message }; }
}

test('the complete unchanged symbol compiler module compiles and runs in WASM without extracting individual helpers', () => {
  const a = instantiateManagedRuntime(artifact()); a.auto(1);
  for (const name of ['munge-segment', 'binding-name', 'reference-name']) {
    for (const value of ['', 'a', '9lives', 'await', 'arguments', 'eval', 'nil', 'undefined', 'false', '&rest',
      '__eliscript_private', 'name?', 'set!', '*value*', '+', '<=', 'a/b', 'a.b', '/a//b/', '.a..b.',
      '中😀', '\ud800x\udfff', 'a\u0000b', 'line\nname']) {
      assert.deepEqual(invoke(a, name, value), expected(name, value), name + ': ' + JSON.stringify(value));
    }
  }
  finish(a);
});

test('the complete compiler module preserves deterministic random Unicode naming and recovers after source errors under per-allocation collection', () => {
  const a = instantiateManagedRuntime(artifact()); a.auto(1);
  let seed = 0x318ac927;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let n = 0; n < 192; n++) {
    let value = '';
    for (let i = 0, length = next() % 12; i < length; i++) value += String.fromCharCode(next() % 65536);
    for (const name of ['munge-segment', 'binding-name', 'reference-name']) assert.deepEqual(invoke(a, name, value), expected(name, value));
  }
  assert.deepEqual(invoke(a, 'binding-name', 'recovered'), { value: 'recovered' });
  assert(a.stats().collections > 100);
  finish(a);
});

function property(a, object, name) {
  const key = a.string(name);
  try { return a.objectGet(object, key); } finally { a.release(key); }
}
test('complete syntax and symbol compiler modules link and execute together in WASM with their real imports and exports', () => {
  const entry = backend.compiler.compile_ir_string(`
    (import "./syntax.mjs" make-span symbol-node node-name node-span node-kind)
    (import "./symbol.mjs" binding-name)
    (defun compile-name (name)
      (symbol-node (binding-name name) (make-span "source.eli" 0 (get name :length) 1 1 1 (1+ (get name :length)))))
    (export compile-name node-name node-span node-kind)`, 'entry.eli');
  const modules = [{ id: 'syntax.mjs', program: syntaxProgram }, { id: 'symbol.mjs', program }, { id: 'entry.mjs', program: entry }];
  const saved = JSON.stringify(modules);
  const bytes = Uint8Array.from(backend.managed.emit_managed_project_wasm(modules, 'entry.mjs', runtime));
  assert.equal(JSON.stringify(modules), saved);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes); a.auto(1);
  for (const name of ['foo-bar', 'value?', 'await', 'arguments', '中😀', '\ud800x\udfff']) {
    const input = a.string(name), out = a.invoke('compile_name', [input]);
    const expected = syntaxReference.symbol_node(reference.binding_name(name), syntaxReference.make_span('source.eli', 0, name.length, 1, 1, 1, name.length + 1));
    const kind = a.invoke('node_kind', [out]), value = a.invoke('node_name', [out]), span = a.invoke('node_span', [out]);
    assert.equal(a.readString(kind), expected.kind);
    assert.equal(a.readString(value), expected.name);
    for (const [key, expectedValue] of Object.entries(expected.span)) {
      const field = property(a, span, key);
      assert.deepEqual(field.kind === 4 ? a.readNumber(field) : a.readString(field), expectedValue);
      a.release(field);
    }
    for (const handle of [input, out, kind, value, span]) a.release(handle);
    a.collect(); assert.equal(a.stats().frameDepth, 0);
  }
  for (const name of ['', 'nil', '&rest', '__eliscript_private', 'a.b']) {
    const input = a.string(name); let expected;
    try { reference.binding_name(name); } catch (error) { expected = error.message; }
    assert(expected);
    let failure; try { a.invoke('compile_name', [input]); } catch (error) { failure = error; }
    const message = property(a, failure, 'message');
    assert.equal(a.readString(message), expected);
    for (const handle of [input, failure, message]) a.release(handle);
  }
  finish(a);
});
