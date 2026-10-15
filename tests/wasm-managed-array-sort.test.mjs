import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory, b, runtime;
beforeAll(async () => {directory = await mkdtemp(resolve(tmpdir(), 'eliscript-array-sort-'));b = await buildBackends({outputRoot: directory});runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
async function compiled(source, options) {
  const p = b.compiler.compile_ir_string('(defconst marker 1) (defun own (a i) (object-has? a i)) ' + source + ' (export own)', 'array-sort.eli'), before = JSON.stringify(p);
  const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, runtime));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes, options);a.auto(1);return {a, js, bytes};
}
function box(a, v) {return typeof v === 'number' ? a.number(v) : typeof v === 'string' ? a.string(v) : v;}
function array(a, values) {const items = values.map(v => box(a, v)), out = a.sourceArray(items);items.forEach(v => a.release(v));return out;}
function read(a, v) {
  if (v === null || typeof v !== 'object') return v;
  if (v.kind === 4) return a.readNumber(v);if (v.kind === 5) return a.readString(v);
  assert.equal(v.kind, 14);const out = Array(a.length(v));for (let i = 0; i < out.length; i++) {const n = a.number(i), own = a.invoke('own', [v, n]);a.release(n);if (own) {const child = a.get(v, i);try {out[i] = read(a, child);} finally {a.release(child);}}}return out;
}
function finish(a) {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}

test('Given primitive values and sparse arrays, when default sort runs, then UTF16 ordering, undefined, holes and receiver identity match JS', async () => {
  const {a, js} = await compiled('(defun f (items) (js-call items :sort)) (export f)');
  const sparse = Array(8);sparse[1] = undefined;sparse[3] = '2';sparse[6] = '10';
  for (const values of [[], [3, 20, 100, -1], [undefined, false, null, '', '😀', '\ud800', '中', NaN, Infinity], sparse]) {const input = array(a, values), expected = values.slice(), out = a.invoke('f', [input]);assert(a.keyEqual(out, input));assert.equal(js.f(expected), expected);assert.deepEqual(read(a, input), expected);a.release(out);a.release(input);}finish(a);
});

test('Given finite numbers and comparator closures, when ascending and descending sorts run, then exact values and stable duplicates agree', async () => {
  const {a, js} = await compiled('(defun f (items reverse) (js-call items :sort (lambda (a b) (if reverse (- b a) (- a b))))) (export f)');let state = 0x276ab531;
  for (let k = 0; k < 64; k++) {const values = Array.from({length: 37}, () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0;return (state % 31) - 15;});values.push(-0, 0, Number.MIN_VALUE);for (const reverse of [false, true]) {const input = array(a, values), out = a.invoke('f', [input, reverse]);assert.deepEqual(read(a, out), js.f(values.slice(), reverse));a.release(out);a.release(input);}}finish(a);
});

test('Given objects with equal comparison keys, when sort returns ties or NaN, then original relative order remains stable', async () => {
  const {a, js} = await compiled('(defun f (tie) (let ((items (js-array (js-object :rank 2 :id "a") (js-object :rank 1 :id "b") (js-object :rank 2 :id "c") (js-object :rank 1 :id "d")))) (js-call items :sort (lambda (a b) (if tie (/ 0 0) (- (get a :rank) (get b :rank))))) (js-call items :map (lambda (x) (get x :id))))) (export f)');
  for (const tie of [false, true]) {const out = a.invoke('f', [tie]);assert.deepEqual(read(a, out), js.f(tie));a.release(out);}finish(a);
});

test('Given invalid comparators, when sort validates even an empty array, then errors preserve the receiver and later calls recover', async () => {
  const {a, js} = await compiled('(defun f (items compare) (js-call items :sort compare)) (export f)');
  for (const values of [[], [3, 1]]) for (const bad of [null, false, 0, 'wrong']) {const input = array(a, values), compare = box(a, bad);assert.throws(() => js.f(values.slice(), bad), TypeError);assert.throws(() => a.invoke('f', [input, compare]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.deepEqual(read(a, input), values);assert.equal(a.stats().frameDepth, 0);const out = a.invoke('f', [input, undefined]);assert.deepEqual(read(a, out), js.f(values.slice(), undefined));for (const v of [input, compare, out]) a.release(v);}finish(a);
});

test('Given mutations from a comparator, when sorting writes its collected values back, then the original length snapshot and appended elements survive', async () => {
  const {a, js} = await compiled('(defun f (items) (let ((trace (js-object :called false))) (js-call items :sort (lambda (a b) (unless (get trace :called) (put trace :called t) (put items :length 1) (put items 0 99) (js-call items :push 77 88 99 111)) (- a b))))) (export f)');
  const values = [4, 3, 2, 1], input = array(a, values), out = a.invoke('f', [input]);assert.deepEqual(read(a, out), js.f(values.slice()));assert.equal(a.stats().frameDepth, 0);a.release(out);a.release(input);finish(a);
});

test('Given an own sort function, when argument evaluation replaces it, then the captured function executes and extra arguments retain effects', async () => {
  const {a, js} = await compiled('(defun f () (let ((items (js-array)) (trace (js-object :calls 0))) (put items :sort (lambda (x &rest tail) (str "captured:" x ":" (js-length tail)))) (js-array (js-call items :sort (progn (put items :sort (lambda () "wrong")) "key") (progn (put trace :calls 1) "extra")) (get trace :calls)))) (export f)');
  const out = a.invoke('f');assert.deepEqual(read(a, out), js.f());a.release(out);finish(a);
});

test('Given a failing comparison after source mutation, when sorting aborts, then collected values are not prematurely written back and caller roots survive', async () => {
  const {a, js} = await compiled('(defun f (items) (js-call items :sort (lambda (a b) (put items 0 99) (js-call nil :charAt 0)))) (defun recover (items) (js-call items :sort)) (export f recover)');
  const values = [3, 2, 1], input = array(a, values), caller = a.frame(1);a.frameSet(caller, 0, input);assert.throws(() => js.f(values), TypeError);assert.throws(() => a.invoke('f', [input]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.deepEqual(read(a, input), values);assert.equal(a.stats().frameDepth, 1);const out = a.invoke('recover', [input]);assert.deepEqual(read(a, out), js.recover(values));a.release(out);a.leaveFrame(caller);a.release(input);finish(a);
});


test('Given an invalid raw comparator handle, when sort validates it, then the original handle error and caller frame remain intact', async () => {
  const {a, bytes} = await compiled('(defun f (items) (js-call items :sort)) (export f)');finish(a);
  const e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports, heap = e['heap-new'](32, 1024, 65536), items = e['value-array-new'](heap, 0), frame = e['frame-new'](heap, 1);e['frame-set'](heap, frame, 0, items);
  assert.equal(e['value-source-array-sort'](heap, items, 0xffffffff, 0), 0);assert.equal(e['last-error'](), 1);assert.equal(e['frame-depth'](heap), 1);e['frame-pop'](heap, frame);e['heap-collect'](heap);assert.equal(e['heap-live'](heap), 0);
});


test('Given thousands of duplicate keys, when collecting stable sort runs, then all values agree and comparisons stay within the merge bound', async () => {
  const {a, js} = await compiled('(defun f (items) (let ((trace (js-object :calls 0))) (js-call items :sort (lambda (a b) (put trace :calls (1+ (get trace :calls))) (- a b))) (js-array items (get trace :calls)))) (export f)', {maxSlots: 5120, initialBytes: 1048576});let state = 0x48216c91;
  const values = Array.from({length: 4096}, () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0;return (state % 257) - 128;}), input = array(a, values), out = a.invoke('f', [input]), sorted = a.get(out, 0), calls = a.get(out, 1);
  assert.deepEqual(read(a, sorted), js.f(values.slice())[0]);assert(a.readNumber(calls) <= values.length * 12);assert(a.readNumber(calls) > 0);assert(a.stats().collections > 0);for (const v of [input, out, sorted, calls]) a.release(v);finish(a);
});

test('Given a comparator returning numeric text or a convertible object, when its result is consumed, then ordinary numeric conversion decides ordering', async () => {
  const {a, js} = await compiled('(defun f (items object) (js-call items :sort (lambda (a b) (let ((difference (- a b))) (if object (js-object :valueOf (lambda () difference)) (str difference)))))) (export f)');
  for (const object of [false, true]) {const values = [8, -3, 11, 0, -0, 8], input = array(a, values), out = a.invoke('f', [input, object]);assert.deepEqual(read(a, out), js.f(values.slice(), object));a.release(input);a.release(out);}finish(a);
});

test('Given a sparse source array, when toSorted runs, then a distinct dense result owns undefined entries and the source remains unchanged', async () => {
  const {a, js} = await compiled('(defun f (items) (js-call items :toSorted)) (export f)');const values = Array(6);values[1] = 'b';values[3] = undefined;values[5] = 'a';const input = array(a, values), out = a.invoke('f', [input]);assert.equal(a.keyEqual(input, out), false);assert.deepEqual(read(a, out), js.f(values));assert.deepEqual(read(a, input), values);for (let i = 0; i < values.length; i++) assert(Object.hasOwn(read(a, out), i));a.release(out);a.release(input);finish(a);
});

test('Given a copying comparator that mutates its source, when toSorted completes, then the sorted snapshot and the source mutation are separately retained', async () => {
  const {a, js} = await compiled('(defun f (items) (js-call items :toSorted (lambda (a b) (put items 0 99) (- a b)))) (export f)');const values = [3, 1, 2], input = array(a, values), expected = js.f(values), out = a.invoke('f', [input]);assert.deepEqual(read(a, out), expected);assert.deepEqual(read(a, input), values);a.release(out);a.release(input);finish(a);
});

test('Given nested sorts from a comparator, when both comparators allocate and collect, then independent workspaces retain every captured value', async () => {
  const {a, js} = await compiled('(defun f (items) (let ((nested (js-array 9 3 6)) (trace (js-object :called false))) (js-call items :sort (lambda (a b) (put trace :called t) (js-call nested :sort (lambda (x y) (- x y))) (- a b))) (js-array items nested (get trace :called)))) (export f)');
  const values = [7, 2, 5, 2, -0, 0], input = array(a, values), out = a.invoke('f', [input]);assert.deepEqual(read(a, out), js.f(values.slice()));assert(a.stats().collections > 0);a.release(out);a.release(input);finish(a);
});

test('Given a real WASM trap inside a comparator, when invocation unwinds, then the caller frame and source snapshot remain usable', async () => {
  const source = '(defconst marker 1) (defun own (a i) (object-has? a i)) (defun f (items) (js-call items :sort (lambda (a b) (- a b)))) (defun recover (items) (js-call items :sort)) (export own f recover)', p = b.compiler.compile_ir_string(source, 'sort-trap.eli');
  const text = await readFile('bootstrap/runtime/memory.eli', 'utf8'), start = text.indexOf('  (defun value-number-binary '), end = text.indexOf('  (defun heap-number-word ', start);assert(start >= 0 && end > start);
  const injected = b.compiler.compile_ir_string(text.slice(0, start) + '  (defun value-number-binary (heap left right operation) (load-u32 4294967295))\n' + text.slice(end), 'trap-runtime.eli'), a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p, injected)));a.auto(1);
  const input = array(a, [3, 1, 2]), caller = a.frame(1);a.frameSet(caller, 0, input);assert.throws(() => a.invoke('f', [input]), e => e instanceof WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth, 1);assert.deepEqual(read(a, input), [3, 1, 2]);
  const out = a.invoke('recover', [input]);assert.deepEqual(read(a, out), [1, 2, 3]);a.release(out);a.leaveFrame(caller);a.release(input);finish(a);
});

test('Given exhausted capacity, when sort cannot create its workspace, then it preserves inputs and recovers after roots are released', async () => {
  const {a} = await compiled('(defun f (items) (js-call items :sort)) (export f)', {maxSlots: 64, initialBytes: 8192, maxBytes: 8192}), input = array(a, [4, 1, 3, 2]), held = [];
  assert.throws(() => {for (;;) held.push(a.number(19));}, e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.throws(() => a.invoke('f', [input]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.equal(a.stats().frameDepth, 0);
  held.forEach(v => a.release(v));a.collect();assert.deepEqual(read(a, input), [4, 1, 3, 2]);const out = a.invoke('f', [input]);assert.deepEqual(read(a, out), [1, 2, 3, 4]);a.release(out);a.release(input);finish(a);
});
