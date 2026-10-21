import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

let directory, b, runtime, program, js, javascript;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-builtins-'));
  b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-builtins.eli', 'utf8'), 'builtins.eli');
  javascript = b.compiler.emit_ir_string(program);
  js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
const box = (a, value) => typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value;
const read = (a, value) => value?.kind === 4 ? a.readNumber(value) : value?.kind === 5 ? a.readString(value) : value;
function instance(options) {
  const before = JSON.stringify(program), bytes = Uint8Array.from(b.managed.emit_managed_wasm(program, runtime));
  assert.equal(JSON.stringify(program), before);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes, options); a.auto(1); return {a, bytes};
}
function finish(a, values = [], module = true) {
  for (const value of values) a.release(value);
  if (module) a.closeModule();
  a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
}
function check(a, name, value, expected) {
  const input = box(a, value), out = a.invoke(name, [input]);
  assert(Object.is(read(a, out), expected), name + ': ' + String(value));
  a.release(input); a.release(out); a.collect(); assert.equal(a.stats().frameDepth, 0);
}
const primitives = [undefined, null, false, true, '', ' ', '-0', '0x10', '1.e2', 'x', '\ud800',
  '\u2028.5\ufeff', NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE, -Number.MIN_VALUE,
  Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 1.5, -1.5];

test('independent Node confirms the original global calls before WASM lowering', async () => {
  const file = resolve(directory, 'source.mjs'); await writeFile(file, javascript);
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'; const m = await import(process.argv[1]);
    assert(Object.is(m.number_call('-0'), -0)); assert.equal(m.number_empty(), 0);
    assert.equal(m.string_empty(), ''); assert.equal(m.boolean_call(0), false);
    assert.equal(m.finite_call('1'), false); assert.equal(m.integer_call(-0), true);
    assert.equal(m.same_number(), true); assert.equal(m.same_finite(), true);
  `, pathToFileURL(file).href], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
});

test('raw Number and primitive constructors retain missing arguments, ignored effects and exact conversions', () => {
  const {a} = instance();
  for (const x of primitives) {
    check(a, 'number-call', x, js.number_call(x));
    check(a, 'string-call', x, js.string_call(x));
    check(a, 'boolean-call', x, js.boolean_call(x));
  }
  for (const name of ['number-empty', 'string-empty', 'boolean-empty']) {
    const out = a.invoke(name); assert(Object.is(read(a, out), js[name.replaceAll('-', '_')]())); a.release(out);
  }
  const text = a.string('42'), trace = a.sourceObject({}), out = a.invoke('number-extra', [text, trace]);
  assert.equal(a.readNumber(out), 42); const key = a.string('visited'), visited = a.objectGet(trace, key);
  assert.equal(a.readNumber(visited), 7); finish(a, [text, trace, out, key, visited]);
});

test('Number predicates never coerce while global isFinite and isNaN do, including IEEE boundaries', () => {
  const {a} = instance();
  const methods = ['finite-call', 'nan-call', 'integer-call', 'safe-call', 'coercive-finite', 'coercive-nan'];
  const bits = new DataView(new ArrayBuffer(8)); let seed = 0x7c1203a5;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const inputs = [...primitives, 2 ** 31, 2 ** 32, 2 ** 52, 2 ** 53, -(2 ** 53), 1 - 2 ** -53, 2 ** -52];
  for (let i = 0; i < 2048; i++) {bits.setUint32(0, next(), true); bits.setUint32(4, next(), true); inputs.push(bits.getFloat64(0, true));}
  for (const x of inputs) for (const name of methods) check(a, name, x, js[name.replaceAll('-', '_')](x));
  const array = a.sourceArray([]), object = a.sourceObject({}), f = a.getExport('number-value');
  for (const value of [array, object, f]) {
    for (const name of ['finite-call', 'nan-call', 'integer-call', 'safe-call']) assert.equal(a.invoke(name, [value]), false);
    assert.equal(a.invoke('boolean-call', [value]), true);
  }
  finish(a, [array, object, f]);
});

test('first-class builtins preserve identity, captures, apply and callback extra arguments through GC', () => {
  const {a} = instance(), closure = a.invoke('held-number'), text = a.string('-0');
  assert.equal(a.invoke('same-number'), true); assert.equal(a.invoke('same-finite'), true);
  a.collect(); const converted = a.invoke('invoke-one', [closure, text]); assert(Object.is(a.readNumber(converted), -0));
  const values = a.sourceArray([text, true, null]), mapped = a.invoke('number-map', [values]);
  for (const [index, expected] of [-0, 1, 0].entries()) {const x = a.get(mapped, index); assert(Object.is(a.readNumber(x), expected)); a.release(x);}
  const finite = a.invoke('finite-map', [values]); for (let i = 0; i < 3; i++) assert.equal(a.get(finite, i), false);
  const empty = a.sourceArray([]), zero = a.invoke('number-apply', [empty]); assert.equal(a.readNumber(zero), 0);
  const args = a.sourceArray([undefined]), nan = a.invoke('number-apply', [args]); assert(Number.isNaN(a.readNumber(nan)));
  assert.equal(a.invoke('array-call', [values]), true); assert.equal(a.invoke('array-call', [text]), false);
  finish(a, [closure, text, converted, values, mapped, finite, empty, zero, args, nan]);
});

test('lexical and project shadows retain the original bindings instead of invoking global builtins', async () => {
  const source = '(defconst Number (lambda (x) 17)) (defun f (x) (funcall (js* "Number") x)) (defun local (x) (let ((Number (lambda (x) 23))) (funcall (js* "Number") x))) (defun predicate (Number x) (funcall (js* "Number.isFinite") x)) (export f local predicate)';
  const p = b.compiler.compile_ir_string(source, 'shadow.eli');
  const reference = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  assert.equal(reference.f('x'), 17); assert.equal(reference.local('x'), 23); assert.equal(reference.predicate({isFinite: () => 31}, 'x'), 31);
  const entry = b.compiler.compile_ir_string('(module main (import "./shadow.mjs" f local predicate) (export f local predicate))', 'entry.eli');
  for (const bytes of [b.managed.emit_managed_wasm(p, runtime), b.managed.emit_managed_project_wasm([{id: 'shadow.mjs', program: p}, {id: 'entry.mjs', program: entry}], 'entry.mjs', runtime)]) {
    const a = instantiateManagedRuntime(Uint8Array.from(bytes)); a.auto(1); const x = a.string('x');
    for (const [name, expected] of [['f', 17], ['local', 23]]) {const out = a.invoke(name, [x]); assert.equal(a.readNumber(out), expected); a.release(out);}
    finish(a, [x]);
  }
});

test('shadowed static methods capture lookup before argument effects and preserve nullish failure order', async () => {
  const source = '(defun factory () (lambda (x extra) extra)) (defun method (Number x trace) (js-call Number :isFinite x (progn (put trace :visited 7) (put Number :isFinite false)))) (defun missing (Number trace) (js-call Number :isFinite (put trace :visited 9))) (defun raw (Number trace) (funcall (js* "Number.isFinite") (put trace :visited 11))) (export factory method missing raw)';
  const p = b.compiler.compile_ir_string(source, 'order.eli');
  const ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const target = {isFinite: ref.factory()}, effects = {}; assert.equal(ref.method(target, 0, effects), false);
  for (const name of ['missing', 'raw']) for (const receiver of [false, null]) {
    const trace = {}; assert.throws(() => ref[name](receiver, trace), TypeError);
    assert.equal(trace.visited, receiver === null ? undefined : name === 'missing' ? 9 : 11);
  }
  const entry = b.compiler.compile_ir_string('(module entry (import "./order.mjs" factory method missing raw) (export factory method missing raw))', 'entry.eli');
  for (const [index, bytes] of [b.managed.emit_managed_wasm(p, runtime), b.managed.emit_managed_project_wasm([{id: 'order.mjs', program: p}, {id: 'entry.mjs', program: entry}], 'entry.mjs', runtime)].entries()) {
    const a = instantiateManagedRuntime(Uint8Array.from(bytes)); a.auto(1);
    const f = a.invoke('factory'), object = a.sourceObject({isFinite: f}), x = a.number(0), trace = a.sourceObject({});
    assert.equal(a.invoke('method', [object, x, trace]), false);
    const key = a.string('visited');
    for (const name of ['missing', 'raw']) for (const receiver of [false, null]) {
      const seen = a.sourceObject({}); assert.throws(() => a.invoke(name, [receiver, seen]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
      const out = a.objectGet(seen, key); assert.equal(read(a, out), receiver === null ? undefined : name === 'missing' ? 9 : 11);
      a.release(seen); a.release(out);
    }
    finish(a, [f, object, x, trace, key], index === 1);
  }
});

test('boxed primitive tests do not confuse source arrays, objects, functions and the Lisp truth rule', () => {
  const {a} = instance(), object = a.sourceObject({}), array = a.sourceArray([]), f = a.getExport('number-value');
  for (const value of [null, undefined, true, false, object, f]) assert.equal(a.invoke('array-call', [value]), false);
  assert.equal(a.invoke('array-call', [array]), true);
  const zero = a.number(0), text = a.string('');
  assert.equal(a.truth(zero), true); assert.equal(a.truth(text), true);
  assert.equal(a.invoke('boolean-call', [zero]), false); assert.equal(a.invoke('boolean-call', [text]), false);
  for (const value of [array, object, f]) assert.equal(a.invoke('boolean-call', [value]), true);
  finish(a, [object, array, f, zero, text]);
});

test('unsupported object conversion and actual builtin traps preserve effects, caller roots and original failures', async () => {
  const {a} = instance(), object = a.sourceObject({toString:false,valueOf:false}), trace = a.sourceObject({}), held = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, held);
  const plain = a.sourceObject({}), plainTrace = a.sourceObject({}), ordinary = a.invoke('number-extra', [plain, plainTrace]), control = {};
  assert(Object.is(a.readNumber(ordinary), js.number_extra({}, control)));assert.equal(control.visited, 7);
  const ordinaryKey = a.string('visited'), ordinarySeen = a.objectGet(plainTrace, ordinaryKey);assert.equal(a.readNumber(ordinarySeen), control.visited);
  for (const value of [ordinary, plain, plainTrace, ordinaryKey, ordinarySeen]) a.release(value);
  assert.throws(() => js.number_extra({toString:false,valueOf:false}, {}), TypeError);
  assert.throws(() => a.invoke('number-extra', [object, trace]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
  assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  const key = a.string('visited'), seen = a.objectGet(trace, key); assert.equal(a.readNumber(seen), 7);
  a.leaveFrame(frame); finish(a, [object, trace, held, key, seen]);

  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const start = source.indexOf('  (defun value-builtin-primitive '), end = source.indexOf('  ;; Shortest decimal generation', start);
  assert(start >= 0 && end > start);
  const injected = b.compiler.compile_ir_string(source.slice(0, start) + '  (defun value-builtin-primitive (heap input count operation) (load-u32 4294967295))\n' + source.slice(end), 'trap.eli');
  const t = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(program, injected))); t.auto(1);
  const x = t.string('42'), saved = t.number(-0), outer = t.frame(1); t.frameSet(outer, 0, saved);
  assert.throws(() => t.invoke('number-call', [x]), WebAssembly.RuntimeError);
  assert.equal(t.stats().frameDepth, 1); assert.equal(t.readString(x), '42'); assert(Object.is(t.readNumber(saved), -0));
  t.leaveFrame(outer); finish(t, [x, saved]);
});

test('capacity failures during builtin conversion leave the module and caller frame usable', () => {
  const {a} = instance({maxSlots: 128, initialBytes: 4096, maxBytes: 16384});
  const input = '1.' + '0'.repeat(2000) + '1', text = a.string(input), saved = a.number(-0), frame = a.frame(1); a.frameSet(frame, 0, saved);
  const remaining = 16384 - a.stats().usedBytes - 512; assert(remaining > 0);
  const pressure = a.bytes(new Uint8Array(remaining));
  assert.throws(() => a.invoke('number-call', [text]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');
  assert.equal(a.stats().frameDepth, 1); assert.equal(a.readString(text), input); assert(Object.is(a.readNumber(saved), -0));
  a.leaveFrame(frame); a.release(text); a.release(pressure); a.collect();
  const out = a.invoke('number-empty'); assert.equal(a.readNumber(out), 0); finish(a, [saved, out]);
});

test('Node executes the identical independent builtin WASM including aliases and predicate boundaries', async () => {
  const {a, bytes} = instance(); finish(a); const file = resolve(directory, 'builtins.wasm'); await writeFile(file, bytes);
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
    const {instantiateManagedRuntime} = await import(process.argv[1]);
    const a = instantiateManagedRuntime(readFileSync(process.argv[2])); a.auto(1);
    const text = a.string('-0'), out = a.invoke('number-call', [text]); assert(Object.is(a.readNumber(out), -0));
    const unsafe = a.number(2 ** 53); assert.equal(a.invoke('integer-call', [unsafe]), true); assert.equal(a.invoke('safe-call', [unsafe]), false);
    const nil = a.sourceArray([]); assert.equal(a.invoke('array-call', [nil]), true); assert.equal(a.invoke('same-number'), true);
    for (const x of [text, out, unsafe, nil]) a.release(x); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
  `, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, file], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
});

test('unimplemented constructors, mutable builtin properties and malformed raw IR stay explicitly refused', () => {
  for (const source of ['(defun f (x) (new (js* "Number") x))', '(defun f () (js* "Number.parseInt"))',
    '(defun f () (put (js* "Number") :isFinite false))', '(defun f () (js* "Number /* comment */"))']) {
    const p = b.compiler.compile_ir_string(source, 'unsupported-builtins.eli');
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');
  }
  const p = b.compiler.compile_ir_string('(defun f () (js* "Number"))', 'bad-builtins.eli');
  p.body[0].children[0].children = [null];
  assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');
});

test('explicit globalThis paths respect shadowed host objects in standalone and linked projects', async () => {
  const source = '(defun factory () (lambda (x) 37)) (defun f (globalThis x) (funcall (js* "globalThis.Number") x)) (defun g (globalThis x) (js-call globalThis.Number :isFinite x)) (export factory f g)';
  const p = b.compiler.compile_ir_string(source, 'host-shadow.eli');
  const reference = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  assert.equal(reference.f({Number: reference.factory()}, 'x'), 37);
  assert.equal(reference.g({Number: {isFinite: reference.factory()}}, 'x'), 37);
  const entry = b.compiler.compile_ir_string('(module main (import "./host.mjs" factory f g) (export factory f g))', 'entry.eli');
  for (const [index, bytes] of [b.managed.emit_managed_wasm(p, runtime), b.managed.emit_managed_project_wasm([{id: 'host.mjs', program: p}, {id: 'entry.mjs', program: entry}], 'entry.mjs', runtime)].entries()) {
    const a = instantiateManagedRuntime(Uint8Array.from(bytes)); a.auto(1);
    const f = a.invoke('factory'), Number = a.sourceObject({isFinite: f}), host = a.sourceObject({Number: f}), nested = a.sourceObject({Number}), x = a.string('x');
    for (const [name, receiver] of [['f', host], ['g', nested]]) {const out = a.invoke(name, [receiver, x]); assert.equal(a.readNumber(out), 37); a.release(out);}
    finish(a, [f, Number, host, nested, x], index === 1);
  }
});
