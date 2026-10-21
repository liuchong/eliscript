import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {types as utilTypes} from 'node:util';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

let directory, b, runtime;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-number-text-'));b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
async function compiled(source) {
  const p = b.compiler.compile_ir_string('(defconst marker 1) ' + source, 'number-text.eli'), before = JSON.stringify(p);
  const javascript = b.compiler.emit_ir_string(p);
  const js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  const bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, runtime));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes);a.auto(1);return {a, js, javascript};
}
function finish(a) {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
function box(a, x) {return typeof x === 'number' ? a.number(x) : typeof x === 'string' ? a.string(x) : x;}

test('Given exact integer Numbers, when toString uses every radix 2 through 36, then WASM equals the existing JS result', async () => {
  const {a, js} = await compiled('(defun f (value radix) (js-call value :toString radix)) (export f)');
  for (const value of [-0, 0, -1, 1, 15, 16, 255, 65535, 4294967295, Number.MAX_SAFE_INTEGER, 2 ** 53, -(2 ** 100), 2 ** 1023, Number.MAX_VALUE]) {
    const input = a.number(value);
    for (let radix = 2; radix <= 36; radix++) {const base = a.number(radix), out = a.invoke('f', [input, base]);assert.equal(a.readString(out), js.f(value, radix), value + ' base ' + radix);assert(Object.is(a.readNumber(input), value));a.release(base);a.release(out);}
    a.release(input);
  }
  finish(a);
});

test('Given fractional and boundary IEEE values, when radix text is produced, then exact text and input bits are preserved', async () => {
  const {a, js} = await compiled('(defun f (value radix) (js-call value :toString radix)) (export f)');
  const values = [Number.MIN_VALUE, -(Number.MIN_VALUE), 2 ** -1022, 0.1, -0.1, 0.5, 1 / 3, 1.0000000000000002, 0.9999999999999999, 1e-7, 1e21, NaN, Infinity, -Infinity];
  for (const value of values) {
    const input = a.number(value);
    for (let radix = 2; radix <= 36; radix++) {const base = a.number(radix), out = a.invoke('f', [input, base]);assert.equal(a.readString(out), js.f(value, radix), value + ' base ' + radix);assert(Object.is(a.readNumber(input), value));a.release(base);a.release(out);}
    a.release(input);
  }
  finish(a);
});

test('Given omitted, undefined and coercible radix values, when Number.toString executes, then existing defaults and integer conversion apply', async () => {
  const {a, js} = await compiled('(defun f (value radix) (js-call value :toString radix)) (defun plain (value) (js-call value :toString)) (export f plain)');
  const value = 65535.5, input = a.number(value), plain = a.invoke('plain', [input]);assert.equal(a.readString(plain), js.plain(value));a.release(plain);
  for (const radix of [undefined, '16', ' 2 ', '0x10', 2.9, 35.9, 36.9]) {const base = box(a, radix), out = a.invoke('f', [input, base]);assert.equal(a.readString(out), js.f(value, radix));a.release(base);a.release(out);}
  a.release(input);finish(a);
});

test('Given invalid radix values, when conversion fails, then RangeError and caller roots survive and a later call recovers', async () => {
  const {a, js} = await compiled('(defun f (value radix) (js-call value :toString radix)) (export f)'), input = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, input);
  for (const radix of [null, false, true, 0, 1, 37, -2, NaN, Infinity, -Infinity, 'bad']) {
    const base = box(a, radix);assert.throws(() => js.f(-0, radix), RangeError);assert.throws(() => a.invoke('f', [input, base]), error => error.name === 'RangeError');assert.equal(a.stats().frameDepth, 1);assert(Object.is(a.readNumber(input), -0));a.release(base);
  }
  const base = a.number(16), out = a.invoke('f', [input, base]);assert.equal(a.readString(out), '0');for (const x of [base, out]) a.release(x);a.leaveFrame(frame);a.release(input);finish(a);
});

test('Given a source radix conversion with effects, when toString runs, then arguments and conversion execute exactly once in order', async () => {
  const {a, js} = await compiled('(defun f () (let* ((trace (js-object :calls 0)) (radix (js-object :valueOf (lambda () (put trace :calls (+ (get trace :calls) 10)) 16))) (value 255)) (js-array (js-call value :toString (progn (put trace :calls (1+ (get trace :calls))) radix)) (get trace :calls)))) (export f)');
  const out = a.invoke('f'), text = a.get(out, 0), count = a.get(out, 1);assert.deepEqual([a.readString(text), a.readNumber(count)], js.f());for (const x of [out, text, count]) a.release(x);finish(a);
});

test('fixed random binary64 values preserve exact radix strings and original IEEE bits through collecting GC', async () => {
  const {a, js} = await compiled('(defun f (value radix) (js-call value :toString radix)) (export f)'), bits = new DataView(new ArrayBuffer(8));let state = 0x617d4293;
  const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < 256; i++) {
    bits.setUint32(0, next());bits.setUint32(4, next());const value = bits.getFloat64(0), input = a.number(value);
    for (let radix = 2; radix <= 36; radix++) {const base = a.number(radix), out = a.invoke('f', [input, base]);assert.equal(a.readString(out), js.f(value, radix), 'case ' + i + ' value ' + value + ' base ' + radix);assert(Object.is(a.readNumber(input), value));a.release(base);a.release(out);}
    a.release(input);
  }
  finish(a);
});

test('the same generated Number method calls keep managed radix text and exact input bits in Bun and independent Node', async () => {
  const {a, js, javascript} = await compiled('(defun f (value radix) (js-call value :toString radix)) (defun dynamic (value key radix) (js-call value key radix)) (export f dynamic)');
  const view = new DataView(new ArrayBuffer(8)), samples = [], key = a.string('toString');
  const values = [-0, 0, -1, 1, .1, -.1, .5, 1 / 3, 1.0000000000000002, .9999999999999999,
    Number.MIN_VALUE, -Number.MIN_VALUE, 2 ** -1022, Number.MAX_VALUE, -Number.MAX_VALUE, NaN, Infinity, -Infinity];
  let state = 0x711c4a39;
  const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  for (let index = 0; index < 64; index++) {
    view.setUint32(0, next());view.setUint32(4, next());values.push(view.getFloat64(0));
  }
  try {
    for (const number of values) {
      view.setFloat64(0, number);const words = [view.getUint32(0), view.getUint32(4)], texts = [];
      const input = a.number(number);
      try {
        for (let radix = 2; radix <= 36; radix++) {
          const base = a.number(radix);let result;
          try {
            result = a.invoke('f', [input, base]);const expected = a.readString(result);
            assert.equal(js.f(number, radix), expected);assert.equal(js.dynamic(number, 'toString', radix), expected);
            if (Number.isInteger(number)) assert.equal(expected, BigInt(number).toString(radix), 'exact integer digits have an independent BigInt oracle');
            const dynamic = a.invoke('dynamic', [input, key, base]);
            try {assert.equal(a.readString(dynamic), expected);} finally {a.release(dynamic);}
            assert(Object.is(a.readNumber(input), number));texts.push(expected);
          } finally {if (result !== undefined) a.release(result);a.release(base);}
        }
      } finally {a.release(input);}
      samples.push({words, texts});
    }
  } finally {a.release(key);finish(a);}
  const script = `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {javascript, samples} = JSON.parse(readFileSync(0, 'utf8'));
const m = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const view = new DataView(new ArrayBuffer(8));
for (const {words, texts} of samples) {
  view.setUint32(0, words[0]);view.setUint32(4, words[1]);const number = view.getFloat64(0);
  for (let radix = 2; radix <= 36; radix++) {
    assert.equal(m.f(number, radix), texts[radix - 2]);
    assert.equal(m.dynamic(number, 'toString', radix), texts[radix - 2]);
  }
}
console.log(JSON.stringify({samples: samples.length, radices: 35}));
`;
  const child = spawnSync('node', ['--input-type=module', '--eval', script], {
    encoding: 'utf8', input: JSON.stringify({javascript, samples}), timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {samples: values.length, radices: 35});
}, 120000);

function verifyNumberMethodBoundary(m) {
  const builtin = Number.prototype.toString, boxed = new Number(255.5), trace = [];
  assert.strictEqual(boxed.toString, builtin, 'the emitted helper never replaces the real function identity');
  boxed.valueOf = () => {throw Error('receiver coercion must not replace NumberData');};
  assert.equal(m.f(boxed, 16), 'ff.8');assert.equal(m.f(-0, 2), '0');
  const key = {[Symbol.toPrimitive](hint) {trace.push('key', hint);return 'toString';}};
  Object.defineProperty(boxed, 'toString', {configurable: true, get() {trace.push('get');return builtin;}});
  const radix = {valueOf() {trace.push('convert');return 16;}};
  const output = m.effects(boxed, key, () => {
    trace.push('argument');Object.defineProperty(boxed, 'toString', {configurable: true, value() {throw Error('late method');}});
    return radix;
  });
  assert.equal(output, 'ff.8');assert.deepEqual(trace, ['key', 'string', 'get', 'argument', 'convert']);
  const marker = {}, receiver = Object.create({toString(...args) {
    trace.push('custom', this === receiver, args.length);return marker;
  }});
  trace.length = 0;
  assert.strictEqual(m.extras(receiver, 'toString', () => {trace.push('first');return 1;}, () => {trace.push('second');return 2;}), marker);
  assert.deepEqual(trace, ['first', 'second', 'custom', true, 2]);
  for (const value of [null, undefined]) {
    trace.length = 0;
    assert.throws(() => m.effects(value, key, () => {trace.push('argument');return radix;}), TypeError);
    assert.deepEqual(trace, []);
  }
  trace.length = 0;
  assert.throws(() => m.effects({get toString() {trace.push('get');throw false;}}, 'toString',
    () => {trace.push('argument');return radix;}), error => error === false);
  assert.deepEqual(trace, ['get']);
  const wrong = Object.create(Number.prototype);let original;
  try {Reflect.apply(builtin, wrong, [16]);} catch (error) {original = error;}
  assert(original instanceof TypeError);trace.length = 0;
  assert.throws(() => m.effects(wrong, 'toString', () => {trace.push('argument');return radix;}), error => {
    assert(error instanceof TypeError);assert.equal(error.message, original.message);return true;
  });
  assert.deepEqual(trace, ['argument'], 'bad receivers fail before the radix conversion hook');
  const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, 'toString');
  try {
    Object.defineProperty(Number.prototype, 'toString', {configurable: true, get() {
      trace.push('prototype');return function (argument) {trace.push('override', typeof this, argument);return marker;};
    }});
    trace.length = 0;
    assert.strictEqual(m.effects(7, 'toString', () => {trace.push('argument');return 16;}), marker);
    assert.deepEqual(trace, ['prototype', 'argument', 'override', 'number', 16]);
  } finally {Object.defineProperty(Number.prototype, 'toString', descriptor);}
  const NumberClass = globalThis.Number;
  try {
    const mutate = {valueOf() {globalThis.Number = () => {throw marker;};return 2;}};
    assert.equal(m.f(.5, mutate), '0.1');
  } finally {globalThis.Number = NumberClass;}
  assert.equal(m.f(255n, 16), 'ff');assert.equal(m.f('text', 16), 'text');
  const nullPrototype = new Number(1);Object.setPrototypeOf(nullPrototype, null);
  assert.throws(() => m.f(nullPrototype, 16), TypeError);
  assert.strictEqual(Number.prototype.toString, builtin);
  // Native identities remain exposed. Borrowed and bound method entries have
  // their own regression below; raw external calls of the original stay native.
}

test('Seed and self-hosted Number method helpers preserve boxed brands lookup arguments overrides and unrelated methods', async () => {
  const source = '(defun f (value radix) (js-call value :toString radix)) ' +
    '(defun effects (value key argument) (js-call value key (funcall argument))) ' +
    '(defun extras (value key first second) (js-call value key (funcall first) (funcall second))) (export f effects extras)';
  const input = resolve(directory, 'number-method-boundary.eli'), output = resolve(directory, 'number-method-boundary.mjs');
  await writeFile(input, source);
  const child = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, input], {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  const javascript = b.compiler.compile_string(source, input);
  assert.equal(await readFile(output, 'utf8'), javascript);
  const m = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  verifyNumberMethodBoundary(m);
  const script = `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const javascript = readFileSync(0, 'utf8');
const m = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
${verifyNumberMethodBoundary.toString()}
verifyNumberMethodBoundary(m);
`;
  const node = spawnSync('node', ['--input-type=module', '--eval', script], {encoding: 'utf8', input: javascript, timeout: 30000, maxBuffer: 65536});
  assert.equal(node.error, undefined);assert.equal(node.signal, null);assert.equal(node.status, 0, node.stderr);
}, 120000);

function verifyBorrowedNumberBoundary(m, samples) {
  const builtin = Number.prototype.toString, call = Function.prototype.call, apply = Function.prototype.apply;
  const view = new DataView(new ArrayBuffer(8));
  for (const {words, texts} of samples) {
    view.setUint32(0, words[0]);view.setUint32(4, words[1]);const value = view.getFloat64(0);
    for (let radix = 2; radix <= 36; radix++) {
      const expected = texts[radix - 2], argumentsList = [radix, 'ignored'];
      assert.equal(m.via_call(builtin, value, radix), expected);
      assert.equal(m.via_apply(builtin, value, argumentsList), expected);
      assert.equal(m.dynamic(builtin, 'call', new Number(value), radix), expected);
      assert.equal(m.dynamic(builtin, 'apply', new Number(value), argumentsList), expected);
      assert.equal(m.call_saved(value, radix), expected);assert.equal(m.apply_saved(value, radix), expected);
      assert.deepEqual(argumentsList, [radix, 'ignored']);
    }
  }
  assert.equal(m.literal_call(), samples[1].texts[1], 'literal actuals use the same exact direct-call dispatch');
  for (const empty of [null, undefined]) assert.equal(m.via_apply(builtin, .1, empty), '0.1');
  const trace = [], receiver = new Number(255.5), marker = {};
  const radix = {valueOf() {trace.push('radix');return 16;}};
  const argumentPrototype = {get 0() {trace.push('0');return radix;}};
  const argumentsList = Object.create(argumentPrototype, {
    length: {get() {trace.push('length');return {valueOf() {trace.push('length.valueOf');return 3;}};}},
    1: {get() {trace.push('1');return {valueOf() {throw marker;}};}},
    2: {get() {trace.push('2');return undefined;}},
    [Symbol.iterator]: {get() {throw Error('apply must not use an iterator');}},
  });
  assert.equal(m.via_apply(builtin, receiver, argumentsList), 'ff.8');
  assert.deepEqual(trace, ['length', 'length.valueOf', '0', '1', '2', 'radix']);
  trace.length = 0;
  const fractional = new Proxy({length: 1.9, 0: 16}, {get(target, key, self) {
    trace.push(key);if (key !== 'length' && key !== '0') throw marker;return Reflect.get(target, key, self);
  }});
  assert.equal(m.via_apply(builtin, receiver, fractional), 'ff.8');assert.deepEqual(trace, ['length', '0']);
  trace.length = 0;
  assert.equal(m.extra_call(builtin, () => {trace.push('receiver');return receiver;},
    () => {trace.push('argument');return radix;}, () => {trace.push('extra');return marker;}), 'ff.8');
  assert.deepEqual(trace, ['receiver', 'argument', 'extra', 'radix']);
  const wrong = Object.create(Number.prototype);
  trace.length = 0;
  const broken = {get length() {trace.push('length');return 2;},
    get 0() {trace.push('0');return radix;}, get 1() {trace.push('1');throw false;}};
  assert.throws(() => m.via_apply(builtin, wrong, broken), error => error === false);
  assert.deepEqual(trace, ['length', '0', '1'], 'all apply element reads precede receiver and radix validation');
  for (const invalid of [false, 1, '16', 1n, Symbol('arguments')]) {
    let original;try {Reflect.apply(apply, builtin, [wrong, invalid]);} catch (error) {original = error;}
    assert(original instanceof TypeError);
    assert.throws(() => m.via_apply(builtin, wrong, invalid), error => {
      assert(error instanceof TypeError);assert.equal(error.message, original.message);return true;
    });
  }
  trace.length = 0;
  assert.throws(() => m.via_apply(builtin, wrong, [radix]), error => error instanceof TypeError);
  assert.deepEqual(trace, [], 'receiver brand validation precedes conversion once the list is complete');
  for (const operation of ['call', 'apply']) {
    const saved = Object.getOwnPropertyDescriptor(builtin, operation);
    try {
      Object.defineProperty(builtin, operation, {configurable: true, get() {trace.push('get');return operation === 'call' ? call : apply;}});
      trace.length = 0;
      const key = {[Symbol.toPrimitive](hint) {trace.push('key', hint);return operation;}};
      assert.equal(m.effects(builtin, key, () => {trace.push('receiver');return receiver;}, () => {
        trace.push('argument');Object.defineProperty(builtin, operation, {configurable: true, value() {throw marker;}});
        return operation === 'call' ? radix : argumentsList;
      }), 'ff.8');
      assert.deepEqual(trace, operation === 'call' ? ['key', 'string', 'get', 'receiver', 'argument', 'radix']
        : ['key', 'string', 'get', 'receiver', 'argument', 'length', 'length.valueOf', '0', '1', '2', 'radix']);
    } finally {if (saved) Object.defineProperty(builtin, operation, saved);else delete builtin[operation];}
  }
  for (const key of ['call', 'apply']) {
    const saved = Object.getOwnPropertyDescriptor(builtin, key);
    try {
      Object.defineProperty(builtin, key, {configurable: true, value(...args) {
        assert.strictEqual(this, builtin);assert.strictEqual(args[0], wrong);assert.strictEqual(args[1], broken);return marker;
      }});
      trace.length = 0;
      assert.strictEqual(m.dynamic(builtin, key, wrong, broken), marker);assert.deepEqual(trace, []);
    } finally {if (saved) Object.defineProperty(builtin, key, saved);else delete builtin[key];}
  }
  const other = function (...args) {assert.strictEqual(this, receiver);assert.deepEqual(args, [16, 'extra']);return marker;};
  assert.strictEqual(m.via_apply(other, receiver, [16, 'extra']), marker);
  assert.strictEqual(Number.prototype.toString, builtin);assert.strictEqual(Function.prototype.call, call);
  assert.strictEqual(Function.prototype.apply, apply);
  // Binding and nested method entries are checked by the same source fixture
  // below without substituting the original native function value.
}

function verifyNumberCallFamily(m, samples) {
  const builtin = Number.prototype.toString, bind = Function.prototype.bind, call = Function.prototype.call;
  const apply = Function.prototype.apply, reflect = Reflect.apply, view = new DataView(new ArrayBuffer(8));
  for (const {words, texts} of samples) {
    view.setUint32(0, words[0]);view.setUint32(4, words[1]);const value = view.getFloat64(0);
    for (const radix of [2, 3, 5, 10, 16, 36]) {
      const expected = texts[radix - 2];
      assert.equal(m.nested_call(builtin, value, radix), expected);
      assert.equal(m.nested_apply(builtin, value, [radix]), expected);
      assert.equal(m.call_via_apply(builtin, value, radix), expected);
      assert.equal(m.reflect_apply(builtin, value, [radix]), expected);
      assert.equal(m.reflect_nested(builtin, value, [radix]), expected);
      assert.equal(m.reflect_dynamic({apply: reflect}, 'apply', builtin, value, [radix]), expected);
      const fixed = m.bind_radix(builtin, value, radix), unfixed = m.make_bound(builtin, value);
      assert.equal(fixed(2), expected);assert.equal(unfixed(radix), expected);
      assert.equal(m.invoke(unfixed, radix), expected, 'actual funcall invokes the real bound result');
      const rebound = m.bind_radix(unfixed, 'ignored receiver', radix);
      assert.equal(rebound(36), expected);
      assert.equal(m.bind_radix(fixed, 'ignored receiver', 36)(2), expected);
      assert.equal(m.dynamic(call, 'bind', builtin, value)(radix), expected);
      assert.equal(m.dynamic(apply, 'bind', builtin, value)([radix]), expected);
      assert.equal(m.bind_radix(reflect, null, builtin)(value, [radix]), expected);
      assert.equal(m.bind_radix(bind, builtin, value)(radix)(), expected);
      assert.deepEqual([1, 2].map(fixed), [expected, expected], 'a genuine external Array.map reaches the bound call');
      assert.equal(reflect(fixed, null, [36]), expected, 'external callbacks can invoke the returned bound object');
    }
  }
  const decimal = m.bind_radix(builtin, .1, undefined);
  assert.equal(decimal(3), '0.1', 'an explicit bound undefined radix suppresses the later radix argument');
  const byArgument = m.make_bound(builtin, .1);
  assert.deepEqual([3, 5, 16].map(byArgument), [samples[1].texts[1], samples[1].texts[3], samples[1].texts[14]]);
  const real = reflect(bind, builtin, [.1, 3]), actual = m.bind_radix(builtin, .1, 3);
  assert.equal(typeof actual, typeof real);assert.strictEqual(Object.getPrototypeOf(actual), Object.getPrototypeOf(real));
  assert.deepEqual(Reflect.ownKeys(actual), Reflect.ownKeys(real));
  assert.deepEqual(Object.getOwnPropertyDescriptors(actual), Object.getOwnPropertyDescriptors(real));
  assert.equal(utilTypes.isProxy(actual), false);assert.equal(utilTypes.isProxy(real), false);
  assert.equal(reflect(Function.prototype.toString, actual, []), reflect(Function.prototype.toString, real, []));
  assert.throws(() => new actual(), TypeError);assert.throws(() => new real(), TypeError);
  assert.throws(() => ({} instanceof actual), TypeError);assert.throws(() => ({} instanceof real), TypeError);
  const nativeHasInstance = Function.prototype[Symbol.hasInstance];
  const oldPrototype = Object.getOwnPropertyDescriptor(builtin, 'prototype');
  const oldHasInstance = Object.getOwnPropertyDescriptor(builtin, Symbol.hasInstance);
  try {
    const firstPrototype = {}, secondPrototype = {}, unrelated = {};
    Object.defineProperty(builtin, 'prototype', {configurable: true, writable: true, value: firstPrototype});
    const firstInstance = Object.create(firstPrototype), secondInstance = Object.create(secondPrototype);
    for (const instance of [firstInstance, secondInstance, unrelated]) {
      assert.equal(instance instanceof actual, instance instanceof real);
      assert.equal(reflect(nativeHasInstance, actual, [instance]), reflect(nativeHasInstance, real, [instance]));
    }
    builtin.prototype = secondPrototype;
    for (const instance of [firstInstance, secondInstance]) {
      assert.equal(instance instanceof actual, instance instanceof real, 'bound targets observe later prototype changes');
      assert.equal(reflect(nativeHasInstance, actual, [instance]), reflect(nativeHasInstance, real, [instance]));
    }
    const observed = [], has = function (value) {observed.push('call');assert.strictEqual(this, builtin);return value === unrelated;};
    Object.defineProperty(builtin, Symbol.hasInstance, {configurable: true, get() {observed.push('get');return has;}});
    for (const instance of [firstInstance, unrelated]) {
      const expected = instance instanceof real, nativeTrace = observed.splice(0);
      assert.equal(instance instanceof actual, expected);assert.deepEqual(observed.splice(0), nativeTrace);
      const expectedByIntrinsic = reflect(nativeHasInstance, real, [instance]), intrinsicTrace = observed.splice(0);
      assert.equal(reflect(nativeHasInstance, actual, [instance]), expectedByIntrinsic);
      assert.deepEqual(observed.splice(0), intrinsicTrace);
    }
    Object.defineProperty(builtin, Symbol.hasInstance, {configurable: true, get() {throw false;}});
    assert.throws(() => (unrelated instanceof real), error => error === false);
    assert.throws(() => (unrelated instanceof actual), error => error === false);
  } finally {
    if (oldPrototype) Object.defineProperty(builtin, 'prototype', oldPrototype);else delete builtin.prototype;
    if (oldHasInstance) Object.defineProperty(builtin, Symbol.hasInstance, oldHasInstance);else delete builtin[Symbol.hasInstance];
  }
  const trace = [], marker = {}, descriptors = ['name', 'length'].map(key => Object.getOwnPropertyDescriptor(builtin, key));
  try {
    Object.defineProperty(builtin, 'length', {configurable: true, get() {trace.push('length');return 5;}});
    Object.defineProperty(builtin, 'name', {configurable: true, get() {trace.push('name');return 'observed';}});
    const bound = m.bind_radix(builtin, .1, 3);assert.deepEqual(trace, ['length', 'name']);trace.length = 0;
    const native = reflect(bind, builtin, [.1, 3]);assert.deepEqual(trace, ['length', 'name']);
    assert.deepEqual(Object.getOwnPropertyDescriptors(bound), Object.getOwnPropertyDescriptors(native));
    Object.defineProperty(builtin, 'length', {configurable: true, get() {throw false;}});
    trace.length = 0;assert.throws(() => m.make_bound(builtin, .1), error => error === false);assert.deepEqual(trace, []);
  } finally {
    Object.defineProperty(builtin, 'name', descriptors[0]);Object.defineProperty(builtin, 'length', descriptors[1]);
  }
  const poison = {get length() {trace.push('length');throw marker;}};
  for (const invoke of [() => m.via_apply(1, null, poison), () => m.reflect_apply(1, null, poison)]) {
    trace.length = 0;assert.throws(invoke, TypeError);assert.deepEqual(trace, [], 'callability precedes any source list read');
  }
  class Constructor {}
  trace.length = 0;assert.throws(() => m.reflect_apply(Constructor, null, poison), error => error === marker);
  assert.deepEqual(trace, ['length'], 'class invocation is refused only after its argument list has been evaluated');
  const revoked = Proxy.revocable(() => 1, {});revoked.revoke();
  trace.length = 0;assert.throws(() => m.reflect_apply(revoked.proxy, null, poison), error => error === marker);
  assert.deepEqual(trace, ['length']);assert.throws(() => m.reflect_apply(revoked.proxy, null, []), TypeError);
  for (const empty of [null, undefined]) {
    assert.equal(m.via_apply(builtin, .1, empty), '0.1');assert.throws(() => m.reflect_apply(builtin, .1, empty), TypeError);
  }
  const list = {get length() {trace.push('length');return 2;},
    get 0() {trace.push('0');return {valueOf() {trace.push('radix');return 3;}};},
    get 1() {trace.push('1');return marker;}};
  trace.length = 0;assert.equal(m.reflect_apply(builtin, .1, list), samples[1].texts[1]);
  assert.deepEqual(trace, ['length', '0', '1', 'radix']);
  trace.length = 0;
  const delayedApply = m.dynamic(apply, 'bind', builtin, .1);
  const delayedReflect = m.bind_radix(reflect, null, builtin);
  assert.deepEqual(trace, [], 'binding apply does not inspect its later argument list');
  assert.equal(delayedApply(list), samples[1].texts[1]);assert.deepEqual(trace, ['length', '0', '1', 'radix']);
  trace.length = 0;assert.equal(delayedReflect(.1, list), samples[1].texts[1]);
  assert.deepEqual(trace, ['length', '0', '1', 'radix']);
  const owner = {apply(...args) {assert.strictEqual(this, owner);assert.deepEqual(args, [1, null, poison]);return marker;}};
  trace.length = 0;assert.strictEqual(m.reflect_dynamic(owner, 'apply', 1, null, poison), marker);assert.deepEqual(trace, []);
  const oldBind = Object.getOwnPropertyDescriptor(builtin, 'bind');
  try {
    Object.defineProperty(builtin, 'bind', {configurable: true, get() {trace.push('bind.get');return bind;}});
    trace.length = 0;
    const radix = {valueOf() {trace.push('radix');return 3;}};
    const bound = m.effects(builtin, 'bind', () => {trace.push('receiver');return .1;}, () => {
      trace.push('argument');Object.defineProperty(builtin, 'bind', {configurable: true, value() {throw marker;}});return radix;
    });
    assert.deepEqual(trace, ['bind.get', 'receiver', 'argument'], 'binding captures arguments without coercing the receiver or radix');
    assert.equal(bound(), samples[1].texts[1]);assert.deepEqual(trace, ['bind.get', 'receiver', 'argument', 'radix']);
  } finally {if (oldBind) Object.defineProperty(builtin, 'bind', oldBind);else delete builtin.bind;}
  const species = Object.getOwnPropertyDescriptor(Array, Symbol.species), slice = Object.getOwnPropertyDescriptor(Array.prototype, 'slice');
  const first = Object.getOwnPropertyDescriptor(Array.prototype, '0');let speciesReads = 0, setters = 0, nested, boundResult;
  try {
    Object.defineProperty(Array, Symbol.species, {configurable: true, get() {speciesReads++;throw marker;}});
    Object.defineProperty(Array.prototype, 'slice', {configurable: true, value() {throw marker;}});
    Object.defineProperty(Array.prototype, '0', {configurable: true, get() {throw marker;}, set() {setters++;}});
    nested = m.nested_call(builtin, .1, 3);boundResult = m.bind_radix(builtin, .1, 3)();
  } finally {
    Object.defineProperty(Array, Symbol.species, species);Object.defineProperty(Array.prototype, 'slice', slice);
    if (first) Object.defineProperty(Array.prototype, '0', first);else delete Array.prototype[0];
  }
  assert.equal(nested, samples[1].texts[1]);assert.equal(boundResult, samples[1].texts[1]);assert.equal(speciesReads, 0);assert.equal(setters, 0);
  assert.strictEqual(Number.prototype.toString, builtin);assert.strictEqual(Function.prototype.bind, bind);
  assert.strictEqual(Function.prototype.call, call);assert.strictEqual(Function.prototype.apply, apply);assert.strictEqual(Reflect.apply, reflect);
  // External uncompiled calls of the original unbound function or a bare
  // Reflect.apply alias are not rewritten here; returned bound values work in
  // real host callbacks without replacing that original function identity.
}

test('borrowed and bound Number method families preserve native reflection complete array-like reads and exact managed text in Bun and Node', async () => {
  const source = '(defun via_call (method value radix) (js-call method :call value radix)) ' +
    '(defun via_apply (method value values) (js-call method :apply value values)) ' +
    '(defun dynamic (method key value values) (js-call method key value values)) ' +
    '(defun effects (method key receiver values) (js-call method key (funcall receiver) (funcall values))) ' +
    '(defun extra_call (method receiver radix extra) (js-call method :call (funcall receiver) (funcall radix) (funcall extra))) ' +
    '(defun call_saved (value radix) (let ((method (get (js* "Number.prototype") :toString))) (js-call method :call value radix))) ' +
    '(defun apply_saved (value radix) (let ((method (get (js* "Number.prototype") :toString))) (js-call method :apply value (js-array radix)))) ' +
    '(defun literal_call () (let ((method (get (js* "Number.prototype") :toString))) (js-call method :call 0.1 3))) ' +
    '(defun nested_call (method value radix) (js-call (get method :call) :call method value radix)) ' +
    '(defun nested_apply (method value values) (js-call (get method :apply) :call method value values)) ' +
    '(defun call_via_apply (method value radix) (js-call (get method :call) :apply method (js-array value radix))) ' +
    '(defun reflect_apply (method value values) (js-call (js* "Reflect") :apply method value values)) ' +
    '(defun reflect_nested (method value values) (js-call (get (js* "Reflect") :apply) :call nil method value values)) ' +
    '(defun reflect_dynamic (owner key method value values) (js-call owner key method value values)) ' +
    '(defun make_bound (method value) (js-call method :bind value)) ' +
    '(defun bind_radix (method value radix) (js-call method :bind value radix)) ' +
    '(defun invoke (callback argument) (funcall callback argument)) ' +
    '(export via_call via_apply dynamic effects extra_call call_saved apply_saved literal_call nested_call nested_apply call_via_apply reflect_apply reflect_nested reflect_dynamic make_bound bind_radix invoke)';
  const {a} = await compiled('(defun f (value radix) (js-call value :toString radix)) (export f)');
  const view = new DataView(new ArrayBuffer(8)), samples = [];
  try {
    for (const value of [-0, .1, -.1, .5, 1 / 3, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity]) {
      view.setFloat64(0, value);const words = [view.getUint32(0), view.getUint32(4)], texts = [], input = a.number(value);
      try {
        for (let radix = 2; radix <= 36; radix++) {
          const base = a.number(radix);let result;
          try {result = a.invoke('f', [input, base]);texts.push(a.readString(result));}
          finally {if (result !== undefined) a.release(result);a.release(base);}
        }
      } finally {a.release(input);}
      samples.push({words, texts});
    }
  } finally {finish(a);}
  const input = resolve(directory, 'number-borrowed-boundary.eli'), output = resolve(directory, 'number-borrowed-boundary.mjs');
  await writeFile(input, source);
  const seed = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, input], {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(seed.error, undefined);assert.equal(seed.signal, null);assert.equal(seed.status, 0, seed.stderr);
  const javascript = b.compiler.compile_string(source, input);assert.equal(await readFile(output, 'utf8'), javascript);
  const m = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  verifyBorrowedNumberBoundary(m, samples);verifyNumberCallFamily(m, samples);
  const script = `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {types as utilTypes} from 'node:util';
const {javascript, samples} = JSON.parse(readFileSync(0, 'utf8'));
const m = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
${verifyBorrowedNumberBoundary.toString()}
${verifyNumberCallFamily.toString()}
verifyBorrowedNumberBoundary(m, samples);verifyNumberCallFamily(m, samples);
`;
  const node = spawnSync('node', ['--input-type=module', '--eval', script], {encoding: 'utf8',
    input: JSON.stringify({javascript, samples}), timeout: 30000, maxBuffer: 65536});
  assert.equal(node.error, undefined);assert.equal(node.signal, null);assert.equal(node.status, 0, node.stderr);
}, 120000);
