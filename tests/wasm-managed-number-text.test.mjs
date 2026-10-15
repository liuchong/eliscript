import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
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
  const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, runtime));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes);a.auto(1);return {a, js};
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
