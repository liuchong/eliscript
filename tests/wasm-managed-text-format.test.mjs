import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory, b, runtime;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-text-format-'));b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
async function compiled(source) {
  const p = b.compiler.compile_ir_string('(defconst marker 1) ' + source, 'text-format.eli'), before = JSON.stringify(p);
  const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, runtime));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes);a.auto(1);return {a, js, bytes};
}
function finish(a) {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
const box = (a, x) => typeof x === 'number' ? a.number(x) : typeof x === 'string' ? a.string(x) : x;
function strings(a, array) {return Array.from({length: a.length(array)}, (_, i) => {const value = a.get(array, i);try {return value === undefined ? undefined : a.readString(value);} finally {a.release(value);}});}

test('Given Unicode strings, when default upper and lower casing runs, then expansions, context and UTF16 agree with JS', async () => {
  const {a, js} = await compiled('(defun upper (value) (js-call value :toUpperCase)) (defun lower (value) (js-call value :toLowerCase)) (export upper lower)');
  const values = ['', '0123_ascii_Z', 'ßﬃİıſ', 'ΑΣ', 'ΑΣΑ', 'AΣ\u0301', 'AΣ\u0301B', 'AΣ\u0345', 'A\u0345Σ', 'Σ', 'ΣA', 'ΣΣ', '\u0345Σ', 'ᾀᾈΐῒῗ', 'ქართულიႠᲐ', '𐐀𐐨😀中', '\ud800A\udfffΣ'];
  let state = 0x51c34a27;
  for (let i = 0; i < 256; i++) {let s = '';for (let j = 0; j < 12; j++) {state = (Math.imul(state, 1664525) + 1013904223) >>> 0;s += String.fromCharCode(state >>> 16);}values.push(s);}
  for (const value of values) {const input = a.string(value);for (const name of ['upper', 'lower']) {const out = a.invoke(name, [input]);assert.equal(a.readString(out), js[name](value));assert.equal(a.readString(input), value);a.release(out);}a.release(input);}
  finish(a);
});

test('Given UTF16 strings and primitive arguments, when start and end padding run, then exact code units and default rules agree', async () => {
  const {a, js} = await compiled('(defun start (value length fill) (js-call value :padStart length fill)) (defun end (value length fill) (js-call value :padEnd length fill)) (export start end)');
  for (const value of ['', 'x', '中😀', '\ud800']) for (const length of [undefined, null, false, true, NaN, -0, -5, 0.9, 1.9, 6, ' 7 ']) for (const fill of [undefined, null, false, 0, '', '0', 'ab', '😀', '\udfff']) {
    const input = a.string(value), count = box(a, length), filler = box(a, fill);
    for (const name of ['start', 'end']) {const out = a.invoke(name, [input, count, filler]);assert.equal(a.readString(out), js[name](value, length, fill));a.release(out);}
    for (const x of [input, count, filler]) a.release(x);
  }
  finish(a);
});

test('Given the entire Unicode scalar range, when both case mappings run in bounded chunks, then every exact JS result agrees', async () => {
  const {a, js} = await compiled('(defun upper (value) (js-call value :toUpperCase)) (defun lower (value) (js-call value :toLowerCase)) (export upper lower)');
  let checked = 0;
  for (let start = 0; start < 0x110000; start += 512) {
    const points = [];for (let point = start; point < Math.min(start + 512, 0x110000); point++) if (point < 0xd800 || point > 0xdfff) points.push(point);
    const text = String.fromCodePoint(...points), input = a.string(text);checked += points.length;
    for (const name of ['upper', 'lower']) {const out = a.invoke(name, [input]);assert.equal(a.readString(out), js[name](text), name + ' scalar block ' + start);a.release(out);}a.release(input);
  }
  assert.equal(checked, 0x110000 - 0x800);finish(a);
});

test('Given effectful arguments and conversion hooks, when padding is unnecessary, then arguments run but filler conversion is skipped', async () => {
  const {a, js} = await compiled('(defun f (size) (let* ((trace (js-object :calls 0)) (fill (js-object :toString (lambda () (put trace :calls (+ (get trace :calls) 100)) "ab")))) (js-array (js-call "x" :padStart (progn (put trace :calls (1+ (get trace :calls))) size) (progn (put trace :calls (+ (get trace :calls) 10)) fill)) (get trace :calls)))) (export f)');
  for (const size of [0, 1, 2, 6]) {const n = a.number(size), out = a.invoke('f', [n]), text = a.get(out, 0), calls = a.get(out, 1);assert.deepEqual([a.readString(text), a.readNumber(calls)], js.f(size));for (const x of [n, out, text, calls]) a.release(x);assert.equal(a.stats().frameDepth, 0);}
  finish(a);
});

test('Given invalid receivers, when a text method is looked up, then failure precedes argument effects and releases its frame', async () => {
  const {a, js} = await compiled('(defun f (value trace) (js-call value :padStart (progn (put trace :calls 1) 7) "0")) (export f)');
  for (const value of [null, undefined]) {const trace = a.sourceObject({});assert.throws(() => js.f(value, {}), TypeError);assert.throws(() => a.invoke('f', [value, trace]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');const key = a.string('calls'), calls = a.objectGet(trace, key);assert.equal(calls, undefined);assert.equal(a.stats().frameDepth, 0);for (const x of [trace, key, calls]) a.release(x);}
  finish(a);
});

test('Given object length arguments, when padding converts them, then valueOf precedes toString and each hook runs once', async () => {
  const {a, js} = await compiled('(defun f (fallback) (let* ((trace (js-object :calls 0)) (length (js-object :valueOf (lambda () (put trace :calls (1+ (get trace :calls))) (if fallback (js-object) 4)) :toString (lambda () (put trace :calls (+ (get trace :calls) 10)) "5")))) (js-array (js-call "x" :padEnd length "ab") (get trace :calls)))) (export f)');
  for (const fallback of [false, true]) {const out = a.invoke('f', [fallback]), text = a.get(out, 0), count = a.get(out, 1);assert.deepEqual([a.readString(text), a.readNumber(count)], js.f(fallback));for (const x of [out, text, count]) a.release(x);}
  finish(a);
});

test('Given noncallable or object-returning hooks, when padding converts arguments, then fallback and failure preserve source order', async () => {
  const {a, js} = await compiled('(defun f (fail) (let* ((trace (js-object :calls 0)) (length (js-object :valueOf false :toString (lambda () (put trace :calls (1+ (get trace :calls))) "4"))) (fill (js-object :toString (lambda () (put trace :calls (+ (get trace :calls) 10)) (js-object)) :valueOf (lambda () (put trace :calls (+ (get trace :calls) 100)) (if fail (js-object) 7))))) (js-array (js-call "x" :padStart length fill) (get trace :calls)))) (export f)');
  const out = a.invoke('f', [false]), text = a.get(out, 0), count = a.get(out, 1);assert.deepEqual([a.readString(text), a.readNumber(count)], js.f(false));for (const x of [out, text, count]) a.release(x);
  assert.throws(() => js.f(true), TypeError);assert.throws(() => a.invoke('f', [true]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 0);finish(a);
});

test('Given case mapping with an ignored argument, when the method executes, then that argument still has its single effect', async () => {
  const {a, js} = await compiled('(defun f () (let ((trace (js-object :calls 0))) (js-array (js-call "ßΣ" :toUpperCase (progn (put trace :calls (1+ (get trace :calls))) nil)) (js-call "AΣ" :toLowerCase (progn (put trace :calls (1+ (get trace :calls))) nil)) (get trace :calls)))) (export f)');
  const out = a.invoke('f'), upper = a.get(out, 0), lower = a.get(out, 1), count = a.get(out, 2);assert.deepEqual([a.readString(upper), a.readString(lower), a.readNumber(count)], js.f());for (const x of [out, upper, lower, count]) a.release(x);finish(a);
});

test('Given identical WASM bytes in independent Node, when every scalar is cased, then Node JS agrees and all roots are released', async () => {
  const {a, bytes} = await compiled('(defun upper (value) (js-call value :toUpperCase)) (defun lower (value) (js-call value :toLowerCase)) (export upper lower)');finish(a);
  const file = resolve(directory, 'unicode-case.wasm');await writeFile(file, bytes);
  const script = `import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const{instantiateManagedRuntime}=await import(process.argv[1]),bytes=readFileSync(process.argv[2]);assert.equal(createHash('sha256').update(bytes).digest('hex'),process.argv[3]);const a=instantiateManagedRuntime(bytes);a.auto(1);let checked=0;for(let start=0;start<0x110000;start+=512){const points=[];for(let p=start;p<Math.min(start+512,0x110000);p++)if(p<0xd800||p>0xdfff)points.push(p);checked+=points.length;const text=String.fromCodePoint(...points),input=a.string(text);for(const[name,method]of[['upper','toUpperCase'],['lower','toLowerCase']]){const out=a.invoke(name,[input]);assert.equal(a.readString(out),text[method](),name+' block '+start);a.release(out);}a.release(input);}assert.equal(checked,0x110000-0x800);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`;
  const child = spawnSync('node', ['--input-type=module', '-e', script, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, file, createHash('sha256').update(bytes).digest('hex')], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr || child.error?.message);
});

test('Given exhausted case-output storage, when allocation fails, then the caller frame and original UTF16 survive recovery', async () => {
  const {a, bytes} = await compiled('(defun upper (value) (js-call value :toUpperCase)) (export upper)');finish(a);
  const small = instantiateManagedRuntime(bytes, {maxSlots: 64, initialBytes: 8192, maxBytes: 8192});small.auto(1);
  const input = small.string('ß😀\ud800'), outer = small.frame(1), held = [];small.frameSet(outer, 0, input);let exhausted = false;
  for (let i = 0; i < 128; i++) {try {held.push(small.number(i));} catch (e) {assert.equal(e.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;}}
  assert(exhausted);assert.throws(() => small.invoke('upper', [input]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.equal(small.stats().frameDepth, 1);assert.equal(small.readString(input), 'ß😀\ud800');
  for (const value of held) small.release(value);small.collect();const out = small.invoke('upper', [input]);assert.equal(small.readString(out), 'SS😀\ud800');small.release(out);small.leaveFrame(outer);small.release(input);finish(small);
});

test('Given literal search text, when replaceAll runs, then all nonoverlapping UTF16 matches and substitution tokens agree with JS', async () => {
  const {a, js} = await compiled('(defun f (text search replacement) (js-call text :replaceAll search replacement)) (export f)');
  for (const text of ['', 'aaaaa', 'a😀a\ud800', 'a/b/c', 'a.$b']) for (const search of ['', 'aa', 'a', '/', '\ud83d', null, undefined]) for (const replacement of ['', 'X', '$&', '$$-$1-$0', '$`|$\'', '中😀']) {
    const input = a.string(text), key = box(a, search), insert = a.string(replacement), out = a.invoke('f', [input, key, insert]);assert.equal(a.readString(out), js.f(text, search, replacement));for (const x of [input, key, insert, out]) a.release(x);
  }
  finish(a);
});

test('Given a replacement callback, when every literal match runs, then offsets use UTF16 and every callback sees the original text', async () => {
  const {a, js} = await compiled('(defun f (text search) (let ((trace (js-object :calls 0))) (js-array (js-call text :replaceAll search (lambda (match index original) (put trace :calls (1+ (get trace :calls))) (str "<" match ":" index ":" original ">"))) (get trace :calls)))) (export f)');
  for (const text of ['', 'aaaa', 'a😀a']) for (const search of ['', 'a', 'aa', 'no']) {const input = a.string(text), key = a.string(search), out = a.invoke('f', [input, key]), result = a.get(out, 0), calls = a.get(out, 1);assert.deepEqual([a.readString(result), a.readNumber(calls)], js.f(text, search));for (const x of [input, key, out, result, calls]) a.release(x);assert.equal(a.stats().frameDepth, 0);}
  finish(a);
});

test('Given effectful search and replacement conversions, when replaceAll finds no match or many matches, then each conversion runs once', async () => {
  const {a, js} = await compiled('(defun f (text) (let* ((trace (js-object :calls 0)) (search (js-object :toString (lambda () (put trace :calls (1+ (get trace :calls))) "a"))) (replacement (js-object :toString (lambda () (put trace :calls (+ (get trace :calls) 10)) "X")))) (js-array (js-call text :replaceAll search replacement) (get trace :calls)))) (export f)');
  for (const text of ['', 'none', 'aaaa']) {const input = a.string(text), out = a.invoke('f', [input]), result = a.get(out, 0), calls = a.get(out, 1);assert.deepEqual([a.readString(result), a.readNumber(calls)], js.f(text));for (const x of [input, out, result, calls]) a.release(x);}
  finish(a);
});

test('Given literal separators and uint32 limits, when split runs, then empty boundaries and UTF16 slices match JS exactly', async () => {
  const {a, js} = await compiled('(defun f (text separator limit) (js-call text :split separator limit)) (export f)');
  for (const text of ['', 'aaa', 'a/b/c/', 'a😀b', '\ud800x\udfff']) for (const separator of [undefined, null, '', '/', 'aa', '\ud83d', 'x']) for (const limit of [undefined, null, -1, -0, 0, 1, 2.9, 4294967297, '2', NaN, Infinity]) {
    const input = a.string(text), sep = box(a, separator), count = box(a, limit), out = a.invoke('f', [input, sep, count]);assert.deepEqual(strings(a, out), js.f(text, separator, limit));for (const x of [input, sep, count, out]) a.release(x);
  }
  finish(a);
});

test('Given represented regular expressions, when split runs, then captures, anchors and Unicode empty matches retain exact JS meaning', async () => {
  for (const expression of ['/a*/', '/(a)?b/', '/(a)|(b)/', '/(?:)/', '/(?:)/u', '/^|$/m', '/[,\\u2028]/u', '/(😀)?/u']) {
    const {a, js} = await compiled('(defun f (text limit) (js-call text :split (js* ' + JSON.stringify(expression) + ') limit)) (export f)');
    for (const text of ['', 'a', 'abbb', 'a😀b', 'x\nx', '\ud800\udfff,x']) for (const limit of [undefined, 0, 1, 2, 8]) {const input = a.string(text), count = box(a, limit), out = a.invoke('f', [input, count]);assert.deepEqual(strings(a, out), js.f(text, limit), expression + ' ' + JSON.stringify(text));for (const x of [input, count, out]) a.release(x);}
    finish(a);
  }
});

test('Given conversion hooks, when split has any limit including zero, then limit conversion precedes separator text conversion', async () => {
  const {a, js} = await compiled('(defun f (size) (let* ((trace (js-object :calls 0)) (limit (js-object :valueOf (lambda () (put trace :calls (1+ (get trace :calls))) size))) (separator (js-object :toString (lambda () (put trace :calls (+ (get trace :calls) 10)) "/")))) (js-array (js-call "a/b/c" :split separator limit) (get trace :calls)))) (export f)');
  for (const size of [0, 1, 2, -1]) {const count = a.number(size), out = a.invoke('f', [count]), parts = a.get(out, 0), calls = a.get(out, 1);assert.deepEqual([strings(a, parts), a.readNumber(calls)], js.f(size));for (const x of [count, out, parts, calls]) a.release(x);}
  finish(a);
});

test('Given an unmatched capture, when split inserts undefined, then the result owns that array position instead of creating a hole', async () => {
  const {a, js} = await compiled('(defun f () (let ((parts (js-call "b" :split (js* "/(a)?b/")))) (js-array (object-has? parts 1) (js* \"typeof parts[1]\")))) (export f)');
  const out = a.invoke('f'), first = a.get(out, 0), second = a.get(out, 1);assert.deepEqual([first, a.readString(second)], js.f());a.release(second);a.release(out);finish(a);
});

test('Given a captured own replaceAll method, when arguments replace that method, then the captured function runs with all arguments', async () => {
  const {a, js} = await compiled('(defun f () (let ((value (js-object :replaceAll (lambda (a b) (str a ":" b))))) (js-call value :replaceAll (progn (put value :replaceAll (lambda () "wrong")) "first") "second"))) (export f)');
  const out = a.invoke('f');assert.equal(a.readString(out), js.f());a.release(out);finish(a);
});

test('Given a nonglobal regular expression, when replaceAll rejects it, then replacement conversion never runs and later calls recover', async () => {
  const {a, js} = await compiled('(defun f (trace) (js-call "a" :replaceAll (js* "/a/") (js-object :toString (lambda () (put trace :called 1) "x")))) (defun recover () (js-call "aaa" :replaceAll "a" "b")) (export f recover)');
  const trace = a.sourceObject({});assert.throws(() => js.f({}), TypeError);assert.throws(() => a.invoke('f', [trace]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');const key = a.string('called');assert.equal(a.objectGet(trace, key), undefined);assert.equal(a.stats().frameDepth, 0);const out = a.invoke('recover');assert.equal(a.readString(out), 'bbb');for (const x of [trace, key, out]) a.release(x);finish(a);
});

test('Given fixed random UTF16 strings, when literal split and replacement run under GC, then every exact JS result and input survives', async () => {
  const {a, js} = await compiled('(defun parts (text sep limit) (js-call text :split sep limit)) (defun replace (text sep insert) (js-call text :replaceAll sep insert)) (export parts replace)');let state = 0x42716ab3;
  const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < 256; i++) {let text = '';for (let j = 0; j < 24; j++) text += String.fromCharCode([97, 98, 0, 0xd800, 0xdc00, 0x4e2d][next() % 6]);const sep = text.slice(next() % 20, next() % 24), limit = next() % 12, insert = ['$&', '$`-$\'', '$$', '😀'][next() % 4], input = a.string(text), key = a.string(sep), count = a.number(limit), value = a.string(insert), parts = a.invoke('parts', [input, key, count]), out = a.invoke('replace', [input, key, value]);assert.deepEqual(strings(a, parts), js.parts(text, sep, limit));assert.equal(a.readString(out), js.replace(text, sep, insert));assert.equal(a.readString(input), text);for (const x of [input, key, count, value, parts, out]) a.release(x);}
  finish(a);
});
