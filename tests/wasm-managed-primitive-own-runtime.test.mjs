import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

const source = `
 (defun own (value key) (object-has? value key))
 (defun standard-own (value key) (Object/hasOwn value key))
 (defun descriptor (value key) (Object/getOwnPropertyDescriptor value key))
 (defun symbol-value () (funcall (js* "Symbol") "opaque"))
 (defun converted (value field trace standard)
   (let ((key (js-object)))
     (put key (js* "Symbol.toPrimitive")
       (lambda (hint) (js-call trace :push hint) field))
     (if standard (Object/hasOwn value key) (object-has? value key))))
 (defun abrupt (value trace)
   (let ((key (js-object)))
     (put key (js* "Symbol.toPrimitive") (lambda (hint) (throw trace)))
     (try (object-has? value key) (catch error (Object/is error trace)))))
 (defun install (key) (put (js* "Object.prototype") key 41))
 (export own standard-own descriptor symbol-value converted abrupt install)`;
let directory, backends, runtime, program, bytes, reference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-primitive-own-'));
  backends = await buildBackends({outputRoot: directory});
  runtime = backends.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = backends.compiler.compile_ir_string(source, 'primitive-own.eli');
  bytes = Uint8Array.from(backends.managed.emit_managed_wasm(program, runtime));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  reference = await import('data:text/javascript;base64,' + Buffer.from(backends.compiler.emit_ir_string(program)).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function input(a, value) {
  return typeof value === 'string' ? a.string(value) : typeof value === 'number' ? a.number(value) : value;
}
function finish(a, roots = []) {
  for (const root of roots) a.release(root);
  a.closeModule(); a.collect();
  assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
}
function strings(a, array) {
  return Array.from({length: a.length(array)}, (_, i) => {
    const value = a.get(array, i);
    try {return a.readString(value);} finally {a.release(value);}
  });
}
test('String Boolean Number and Symbol missing own fields agree with the independent JavaScript contract', () => {
  const a = instantiateManagedRuntime(bytes); a.auto(1);
  const symbol = a.invoke('symbol-value'), key = a.string('kind');
  for (const value of ['', 'key-50691', 'key-194634', false, true, 0, -0, 1, NaN, Infinity]) {
    const receiver = input(a, value);
    assert.equal(a.invoke('own', [receiver, key]), reference.own(value, 'kind'));
    assert.equal(a.invoke('standard-own', [receiver, key]), Object.hasOwn(value, 'kind'));
    a.release(receiver);
  }
  assert.equal(a.invoke('own', [symbol, key]), reference.own(Symbol('opaque'), 'kind'));
  finish(a, [symbol, key]);
});
test('String own UTF16 indices length and canonical key spellings reuse the ordinary own predicate', () => {
  const a = instantiateManagedRuntime(bytes); a.auto(1);
  for (const value of ['', 'A😀\ud800\udfff']) {
    const receiver = a.string(value);
    for (const keyValue of ['length', '0', '1', '2', '3', '4', '5', '-0', '00', '01', '1.0', '-1', '4294967295', '', 0, -0, 1, 1.5, NaN, Infinity]) {
      const key = input(a, keyValue), expected = Object.hasOwn(value, keyValue);
      for (const method of ['own', 'standard-own']) assert.equal(a.invoke(method, [receiver, key]), expected, `${method}:${String(keyValue)}`);
      a.release(key);
    }
    a.release(receiver);
  }
  finish(a);
});

test('all primitive own queries convert keys once with a string hint and keep nullish source and Object API boundaries', () => {
  const a = instantiateManagedRuntime(bytes); a.auto(1);
  const symbol = a.invoke('symbol-value'), field = a.string('kind'), index = a.string('1'), trace = a.sourceArray([]);
  for (const value of [false, true, null, undefined, 7, '😀']) {
    const receiver = input(a, value);
    for (const standard of [false, true]) {
      const expected = [];
      if (standard && value == null) {
        assert.throws(() => reference.converted(value, 'kind', expected, true), TypeError);
        assert.throws(() => a.invoke('converted', [receiver, field, trace, true]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
      } else {
        assert.equal(a.invoke('converted', [receiver, field, trace, standard]), reference.converted(value, 'kind', expected, standard));
      }
      assert.deepEqual(strings(a, trace), expected);
      a.resize(trace, 0);
    }
    assert.equal(a.invoke('abrupt', [receiver, trace]), true);
    a.release(receiver);
  }
  assert.equal(a.invoke('converted', [symbol, field, trace, false]), false);
  assert.deepEqual(strings(a, trace), ['string']); a.resize(trace, 0);
  const string = a.string('😀');
  assert.equal(a.invoke('converted', [string, index, trace, false]), true);
  assert.deepEqual(strings(a, trace), ['string']);
  assert.equal(a.invoke('own', [string, symbol]), Object.hasOwn('😀', Symbol('opaque')));
  finish(a, [symbol, field, index, trace, string]);
});

test('inherited fields and native prototype names stay non-own without widening any reflection admission', () => {
  const a = instantiateManagedRuntime(bytes); a.auto(1);
  const field = a.string('__primitive_own_inherited'), symbol = a.invoke('symbol-value');
  a.release(a.invoke('install', [field]));
  for (const value of [false, 1, 'abc']) {
    const receiver = input(a, value);
    for (const keyValue of ['__primitive_own_inherited', 'constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      const key = a.string(keyValue);
      assert.equal(a.invoke('own', [receiver, key]), Object.hasOwn(value, keyValue));
      assert.equal(a.invoke('standard-own', [receiver, key]), Object.hasOwn(value, keyValue));
      assert.equal(a.invoke('descriptor', [receiver, key]), undefined);
      a.release(key);
    }
    a.release(receiver);
  }
  assert.equal(a.invoke('own', [symbol, field]), false);
  finish(a, [field, symbol]);
});

test('deterministic randomized string own checks match Node for canonical and noncanonical UTF16 keys', () => {
  let state = 0x13917;
  const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const cases = [];
  for (let i = 0; i < 160; i++) {
    const text = Array.from({length: next() % 12}, () => String.fromCharCode(next() & 65535)).join('');
    const index = (next() % 18) - 3;
    const key = [String(index), '0' + index, index + '.0', 'length', String.fromCharCode(next() & 65535)][next() % 5];
    cases.push([text, key]);
  }
  const node = spawnSync('node', ['--input-type=module', '-e', 'let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(([v,k])=>Object.hasOwn(v,k))));'], {input: JSON.stringify(cases), encoding: 'utf8'});
  assert.equal(node.status, 0, node.stderr);
  const expected = JSON.parse(node.stdout), a = instantiateManagedRuntime(bytes); a.auto(1);
  for (let i = 0; i < cases.length; i++) {
    const [text, key] = cases[i], receiver = a.string(text), name = a.string(key);
    assert.equal(a.invoke('own', [receiver, name]), expected[i]);
    a.release(receiver); a.release(name);
  }
  finish(a);
});

test('slot exhaustion preserves caller roots and own checks recover without accepting stale foreign or private handles', () => {
  const a = instantiateManagedRuntime(bytes, {maxSlots: 64, initialBytes: 8192, maxBytes: 65536}), other = instantiateManagedRuntime(bytes);
  a.auto(1);
  const receiver = a.string('abc'), key = a.string('1'), held = a.number(-0), frame = a.frame(1), fillers = [];
  a.frameSet(frame, 0, held);
  while (a.live() < 64) fillers.push(a.number(7));
  assert.throws(() => a.invoke('own', [receiver, key]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');
  assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  fillers.forEach(value => a.release(value)); a.collect();
  assert.equal(a.invoke('own', [receiver, key]), true);
  const stale = a.number(2), foreign = other.number(2);
  a.release(stale); a.collect();
  for (const value of [stale, foreign]) assert.throws(() => a.invoke('own', [value, key]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0001');
  a.leaveFrame(frame); finish(a, [receiver, key, held]); finish(other, [foreign]);
  const e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports, h = e['heap-new'](64, 8192, 65536);
  const call = (name, ...args) => e[name](h, ...args) >>> 0;
  const unfinished = call('value-string', 1); call('heap-pin', unfinished);
  for (const [value, name, error] of [[unfinished, 3, 6], [1, unfinished, 6], [1, 0xffffffff, 1], [0xffffffff, 3, 1]]) {
    assert.equal(call('value-object-has', value, name), 0); assert.equal(e['last-error'](), error); assert.equal(call('frame-depth'), 0);
  }
  const raw = call('value-refs', 7, 0); call('heap-pin', raw);
  assert.equal(call('value-object-has', 1, raw), 0); assert.equal(e['last-error'](), 3);
  call('heap-release', raw); call('heap-release', unfinished); call('heap-collect'); assert.equal(call('heap-live'), 0);
});

test('real own-predicate traps occur after one conversion and unwind only callee roots', async () => {
  const original = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const signature = '(defun heap-object-properties-own (heap value key)';
  const modified = original.replace(signature, signature + ' (when (and (= value 2) (= (load-u32 20) 0)) (store-u32 20 1) (load-u32 4294967295))');
  assert.notEqual(modified, original);
  const trapRuntime = backends.compiler.compile_ir_string(modified, 'primitive-own-trap.eli');
  const a = instantiateManagedRuntime(Uint8Array.from(backends.managed.emit_managed_wasm(program, trapRuntime))); a.auto(1);
  const field = a.string('kind'), trace = a.sourceArray([]), held = a.number(-0), frame = a.frame(1); a.frameSet(frame, 0, held);
  assert.equal(a.invoke('abrupt', [true, trace]), true);
  assert.throws(() => a.invoke('converted', [true, field, trace, false]), WebAssembly.RuntimeError);
  assert.deepEqual(strings(a, trace), ['string']); assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  assert.equal(a.invoke('own', [true, field]), false);
  a.leaveFrame(frame); finish(a, [field, trace, held]);
});
