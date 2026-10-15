import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {renderArrayTextImport} from '../tools/compiler/array-text-capsule.mjs';
let directory, b, memoryBackend, runtime, p, js, javascript;
beforeAll(async () => {directory = await mkdtemp(resolve(tmpdir(), 'eliscript-array-text-'));b = await buildBackends({outputRoot: directory});memoryBackend = await import(pathToFileURL(resolve(b.directory, 'memory.mjs')).href);runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');p = b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-array-text.eli', 'utf8'), 'array-text.eli');javascript = b.compiler.emit_ir_string(p);js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function artifact(program = p, rt = runtime) {const before = JSON.stringify(program), bytes = Uint8Array.from(b.managed.emit_managed_wasm(program, rt));assert.equal(JSON.stringify(program), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);return bytes;}
const box = (a, x, owned) => {const value = typeof x === 'number' ? a.number(x) : typeof x === 'string' ? a.string(x) : x;if (value && typeof value === 'object') owned.push(value);return value;};
function graph(a, value, owned, seen = new Map()) {
  if (!value || typeof value !== 'object') return box(a, value, owned);if (seen.has(value)) return seen.get(value);
  const out = Array.isArray(value) ? a.sourceArray([]) : a.sourceObject({});owned.push(out);seen.set(value, out);
  if (Array.isArray(value)) {a.resize(out, value.length);for (let i = 0; i < value.length; i++) if (Object.hasOwn(value, i)) a.set(out, i, graph(a, value[i], owned, seen));}return out;
}
const read = (a, value) => value && typeof value === 'object' ? value.kind === 4 ? a.readNumber(value) : value.kind === 5 ? a.readString(value) : value : value;
function release(a, owned) {for (const value of owned) a.release(value);a.collect();assert.equal(a.stats().frameDepth, 0);}
function finish(a, owned = []) {release(a, owned);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
async function compileCase(source) {
  const p = b.compiler.compile_ir_string('(defconst marker 1) ' + source, 'array-conversion.eli');
  return {p, js: await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'))};
}
test('independent Node confirms ordinary join, the selected cycle error and conversion callback mutation', async () => {
  const file = resolve(directory, 'source.mjs');await writeFile(file, javascript);
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';const m=await import(process.argv[1]);assert.equal(m.join_value(Array(3),undefined),',,');assert.equal(m.join_value([null,undefined,-0,NaN,'😀'],'|'),'||0|NaN|😀');const cycle=[1];cycle.push(cycle,3);assert.throws(()=>m.join_value(cycle,':'),e=>e instanceof TypeError&&e.eliscriptDiagnostic?.code==='ELI-RT0009');const a=['x'],trace={};assert.equal(m.join_value(a,m.growing_separator(a,trace)),'x');assert.deepEqual(a,['x','late']);const live=[null,'old'];live[0]=m.live_element(live);assert.equal(m.join_value(live,'|'),'first|changed');`, pathToFileURL(file).href], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
});
test('arrays join exact primitives, holes, nested shared values and path cycles inside collecting WASM', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const shared = [1, null, '中😀\ud800'], cycle = [1];cycle.push(cycle, 3);const mutual = [2], child = [mutual];mutual.push(child);
  for (const value of [[], Array(4), [null, undefined, false, true, -0, .5, NaN, Infinity, -Infinity, Number.MIN_VALUE, '中😀\ud800'], [shared, shared]])
    for (const sep of [undefined, null, false, -0, .5, '', ',', '😀\ud800']) {const owned = [], input = graph(a, value, owned), separator = box(a, sep, owned), out = a.invoke('join-value', [input, separator]), expected = value.join(sep);assert.equal(js.join_value(value, sep), expected);assert.equal(a.readString(out), expected);owned.push(out);release(a, owned);}
  for (const value of [cycle, mutual]) {
    const owned = [], input = graph(a, value, owned), separator = box(a, ':', owned);
    assert.throws(() => js.join_value(value, ':'), e => e instanceof TypeError && e.eliscriptDiagnostic?.code === 'ELI-RT0009');
    assert.throws(() => a.invoke('join-value', [input, separator]), e => e instanceof TypeError && e.eliscriptDiagnostic?.code === 'ELI-RT0009');release(a, owned);
  }
  finish(a);
});
test('source conversion callbacks execute through WASM tables with exact return coercion and fallback order', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);
  for (const value of [undefined, null, false, -0, NaN, Number.MIN_VALUE, '中😀\ud800']) for (const factory of ['custom-value', 'fallback-value']) {
    const owned = [], trace = a.sourceObject({});owned.push(trace);const input = box(a, value, owned), object = a.invoke(factory, [trace, input]);owned.push(object);const values = a.sourceArray([object]);owned.push(values);const out = a.invoke('default-value', [values]);owned.push(out);assert.equal(a.readString(out), [js[factory.replaceAll('-', '_')]({}, value)].join());
    for (const [key, expected] of factory === 'custom-value' ? [['calls', 1]] : [['to', 1], ['value', 2]]) {const name = a.string(key), got = a.objectGet(trace, name);assert.equal(a.readNumber(got), expected);owned.push(name, got);}release(a, owned);
  }
  finish(a);
});
test('join snapshots length before separator conversion but reads later elements after earlier conversion effects', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const owned = [], text = box(a, 'x', owned), values = a.sourceArray([text]), trace = a.sourceObject({});owned.push(values, trace);const separator = a.invoke('growing-separator', [values, trace]);owned.push(separator);const out = a.invoke('join-value', [values, separator]);owned.push(out);assert.equal(a.readString(out), 'x');assert.equal(a.length(values), 2);
  const live = a.sourceArray([null, text]);owned.push(live);const element = a.invoke('live-element', [live]);owned.push(element);a.set(live, 0, element);const bar = box(a, '|', owned), joined = a.invoke('join-value', [live, bar]);owned.push(joined);assert.equal(a.readString(joined), 'first|changed');finish(a, owned);
});
test('empty joins still convert separators and shrinking element callbacks leave captured-length separators in place', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const owned = [], values = a.sourceArray([]), trace = a.sourceObject({});owned.push(values, trace);
  const separator = a.invoke('growing-separator', [values, trace]);owned.push(separator);const out = a.invoke('join-value', [values, separator]);owned.push(out);assert.equal(a.readString(out), '');assert.equal(a.length(values), 1);
  const k = a.string('separator'), calls = a.objectGet(trace, k);owned.push(k, calls);assert.equal(a.readNumber(calls), 1);
  const input = a.sourceArray([null, null, null]), element = a.invoke('shrinking-element', [input]), bar = a.string('|');owned.push(input, element, bar);a.set(input, 0, element);
  const joined = a.invoke('join-value', [input, bar]);owned.push(joined);const ref = [null, null, null];ref[0] = js.shrinking_element(ref);assert.equal(a.readString(joined), js.join_value(ref, '|'));assert.equal(a.readString(joined), 'first||');assert.equal(a.length(input), 0);finish(a, owned);
});
test('array toString looks up join after ignored argument effects and preserves custom nonprimitive return identity', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const input = a.sourceArray([]), returned = a.sourceObject({}), trace = a.sourceObject({}), out = a.invoke('text-order', [input, returned, trace]);assert(a.keyEqual(out, returned));
  const ref = {}, refTrace = {};assert.equal(js.text_order([], ref, refTrace), ref);assert.deepEqual(refTrace, {argument: 1, body: 2});const owned = [input, returned, trace, out];
  for (const [key, expected] of Object.entries(refTrace)) {const k = a.string(key), v = a.objectGet(trace, k);owned.push(k, v);assert.equal(a.readNumber(v), expected);}finish(a, owned);
});
test('reentrant joins reject cycles and clear owned active-array guards after errors', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const values = a.sourceArray([null]), trace = a.sourceObject({}), element = a.invoke('reentrant-element', [values, trace]);a.set(values, 0, element);
  assert.throws(() => a.invoke('default-value', [values]), e => e instanceof TypeError && e.eliscriptDiagnostic?.code === 'ELI-RT0009');assert.equal(a.stats().frameDepth, 0);
  a.resize(values, 0);const again = a.invoke('default-value', [values]);assert.equal(a.readString(again), '');finish(a, [values, trace, element, again]);
});
test('the internal memory32 source-call capability emits checked zero-import four-word indirect calls', () => {
  const source = '(module calls (import "eliscript:memory32" call-source) (defun target (heap function args count) (+ heap 7)) (defun invoke (heap) (call-source heap 0 0 0 0)) (export invoke))';
  const program = b.compiler.compile_ir_string(source, 'source-call.eli'), before = JSON.stringify(program), typed = memoryBackend.lower_memory_program(program);
  typed.table = [typed.functions.findIndex(x => x.name === 'target')];const bytes = Uint8Array.from(b.wasm.emit_typed_memory_wasm(typed));assert.equal(JSON.stringify(program), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);assert.equal(new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.invoke(3), 10);
});
test('a source-call capability with an empty table emits independently and traps on a missing target', () => {
  const program = b.compiler.compile_ir_string('(module calls (import "eliscript:memory32" call-source) (defun invoke (heap) (call-source heap 0 0 0 0)) (export invoke))', 'empty-source-table.eli');
  const before = JSON.stringify(program), typed = memoryBackend.lower_memory_program(program), module = new WebAssembly.Module(Uint8Array.from(b.wasm.emit_typed_memory_wasm(typed)));
  assert.equal(JSON.stringify(program), before);assert.deepEqual(WebAssembly.Module.imports(module), []);const e = new WebAssembly.Instance(module).exports;
  assert.throws(() => e.invoke(3), WebAssembly.RuntimeError);
});
test('source-call signatures reject malformed declarations and wrong source arities without changing canonical input', () => {
  const source = '(module calls (import "eliscript:memory32" call-source) (defun invoke (heap) (call-source heap 0 0 0 0)) (export invoke))';
  for (const declaration of [null, {}, '4', [-1], [1.5], [NaN], [Infinity], [65536], ['4']]) {
    const p = b.compiler.compile_ir_string(source, 'source-signatures.eli'), typed = memoryBackend.lower_memory_program(p);typed.indirectArities = declaration;
    assert.throws(() => b.wasm.emit_typed_memory_wasm(typed), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');
  }
  const p = b.compiler.compile_ir_string(source, 'source-signatures.eli'), typed = memoryBackend.lower_memory_program(p);delete typed.table;
  assert.throws(() => b.wasm.emit_typed_memory_wasm(typed), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');
  for (const args of ['heap 0 0 0', 'heap 0 0 0 0 0']) {
    const ir = b.compiler.compile_ir_string(source.replace('(call-source heap 0 0 0 0)', `(call-source ${args})`), 'source-arity.eli'), before = JSON.stringify(ir);
    assert.throws(() => memoryBackend.lower_memory_program(ir), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');assert.equal(JSON.stringify(ir), before);
  }
});
test('the shared source invoker preserves omitted optional and rest arguments exact numbers and checked argument counts', async () => {
  const c = await compileCase('(defun fixed (x y) y) (defun optional (x &optional y) y) (defun rest-value (x &rest values) (js-length values)) (export fixed optional rest-value)'), lowered = b.managed.lower_managed_program(c.p, runtime);
  const e = new WebAssembly.Instance(new WebAssembly.Module(artifact(c.p))).exports, heap = e['heap-new'](512, 32768, 1048576);
  const call = (name, ...args) => {const out = e[name](heap, ...args) >>> 0;assert.equal(e['last-error'](), 0, name);return out;};
  call('heap-auto', 1);call('__eliscript_module_init');const negativeZero = call('value-number', 0, 0x80000000);call('heap-pin', negativeZero);
  const args = call('value-refs', 7, 3);call('heap-pin', args);for (const [i, x] of [2, negativeZero, 1].entries()) call('value-set', args, i, x);
  const entries = lowered.descriptor.module.exports;
  for (const name of ['fixed', 'optional', 'rest-value']) {
    const entry = entries.find(x => x.name === name), fn = call('__eliscript_module_get', entry.kind, entry.index);call('heap-pin', fn);
    for (const count of [0, 1, 2, 3]) {
      const packet = call('value-refs', 7, count);call('heap-pin', packet);for (let i = 0; i < count; i++) call('value-set', packet, i, call('value-get', args, i));
      const out = call('value-source-invoke', fn, packet, count), expected = c.js[name.replaceAll('-', '_')](...[true, -0, false].slice(0, count));
      if (expected === undefined) assert.equal(out, 3);
      else if (expected === null) assert.equal(out, 0);
      else assert(Object.is(new DataView(e.memory.buffer).getFloat64(call('value-data', out, 4), true), expected));
      assert.equal(call('frame-depth'), 0);call('heap-release', packet);
    }
    assert.equal(e['value-source-invoke'](heap, fn, args, 4), 0);assert.equal(e['last-error'](), 3);assert.equal(call('frame-depth'), 0);call('heap-release', fn);
  }
  assert.equal(e['value-source-invoke'](heap, 1, args, 0), 0);assert.equal(e['last-error'](), 3);assert.equal(call('frame-depth'), 0);
  call('heap-release', args);call('heap-release', negativeZero);call('__eliscript_module_close');call('heap-collect');assert.equal(call('heap-live'), 0);
});

test('array text methods capture the original method before argument mutations and evaluate ignored arguments exactly once', async () => {
  const c = await compileCase('(defun factory () (js-object :join (lambda (separator ignored) separator))) (defun f (object trace) (js-call object :join (progn (put object :join (lambda (a b) 99)) (put trace :first 1) "captured") (put trace :second 2))) (defun g (object trace) (js-call object :join (put trace :visited 7))) (export factory f g)');
  const a = instantiateManagedRuntime(artifact(c.p));a.auto(1);
  const object = a.invoke('factory'), trace = a.sourceObject({}), out = a.invoke('f', [object, trace]);
  const reference = {};assert.equal(a.readString(out), c.js.f(c.js.factory(), reference));assert.deepEqual(reference, {first: 1, second: 2});
  const owned = [object, trace, out];
  for (const [key, expected] of Object.entries(reference)) {const k = a.string(key), v = a.objectGet(trace, k);owned.push(k, v);assert.equal(a.readNumber(v), expected);}
  for (const input of [null, undefined, true, false, 1, {}]) {
    const x = input && typeof input === 'object' ? a.sourceObject({}) : box(a, input, owned), seen = a.sourceObject({});if (input && typeof input === 'object') owned.push(x);owned.push(seen);
    assert.throws(() => c.js.g(input, {}), TypeError);
    assert.throws(() => a.invoke('g', [x, seen]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
    const k = a.string('visited'), v = a.objectGet(seen, k);owned.push(k, v);assert.equal(read(a, v), input === null || input === undefined ? undefined : 7);assert.equal(a.stats().frameDepth, 0);
  }
  finish(a, owned);
});

test('array toString observes own join methods and ordinary object conversion preserves defaults inheritance and fallback failures', async () => {
  const c = await compileCase('(defun own-join (values value) (put values :join (lambda () value)) values) (defun set-join (values value) (put values :join value)) (defun custom-value (trace value) (js-object :toString (lambda () value))) (defun default-value (values) (js-call values :join)) (defun text-value (value) (js-call value :toString)) (defun text (x) (js-call x :toString)) (defun plain () (js-object)) (defun null-proto () (js-object :__proto__ nil)) (defun inherit (p) (js-object :__proto__ p)) (defun fallback (trace value) (js-object :toString 7 :valueOf (lambda () (put trace :called 1) value))) (defun failed (trace) (js-object :toString (lambda () (put trace :first 1) (js-object)) :valueOf (lambda () (put trace :second 2) (js-object)))) (export text plain null-proto inherit fallback failed own-join set-join custom-value default-value text-value)');
  const a = instantiateManagedRuntime(artifact(c.p));a.auto(1);const owned = [];
  for (const value of [undefined, null, false, -0, NaN, '中😀\ud800']) {
    const trace = a.sourceObject({}), x = box(a, value, owned), array = a.sourceArray([]);owned.push(trace, array);
    const custom = a.invoke('own-join', [array, x]);owned.push(custom);const out = a.invoke('text-value', [array]);owned.push(out);assert(Object.is(read(a, out), js.text_value(js.own_join([], value))));
    const fallback = a.invoke('fallback', [trace, x]), values = a.sourceArray([fallback]);owned.push(fallback, values);const joined = a.invoke('default-value', [values]);owned.push(joined);assert.equal(a.readString(joined), [c.js.fallback({}, value)].join());
  }
  const parentTrace = a.sourceObject({}), parentText = a.string('inherited'), plain = a.invoke('plain'), parent = a.invoke('custom-value', [parentTrace, parentText]);owned.push(parentTrace, parentText);
  // The inherited method must be found without changing the receiver's own table.
  const inherited = a.invoke('inherit', [parent]), nullProto = a.invoke('null-proto'), trace = a.sourceObject({}), failed = a.invoke('failed', [trace]);owned.push(plain, parent, inherited, nullProto, trace, failed);
  for (const [value, expected] of [[plain, '[object Object]'], [inherited, 'inherited']]) {const array = a.sourceArray([value]), out = a.invoke('default-value', [array]);owned.push(array, out);assert.equal(a.readString(out), expected);}
  for (const value of [nullProto, failed]) {const array = a.sourceArray([value]);owned.push(array);assert.throws(() => a.invoke('default-value', [array]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 0);}
  for (const [key, expected] of [['first', 1], ['second', 2]]) {const k = a.string(key), v = a.objectGet(trace, k);owned.push(k, v);assert.equal(a.readNumber(v), expected);}
  const array = a.sourceArray([]);owned.push(array);assert.equal(a.invoke('set-join', [array, false]), false);const label = a.invoke('text', [array]);owned.push(label);assert.equal(a.readString(label), '[object Array]');
  finish(a, owned);
});

test('deterministic acyclic sparse nested arrays and arbitrary binary64 values match unchanged JavaScript under collecting GC', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);let state = 0x2bf6d713;
  const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0, data = new DataView(new ArrayBuffer(8));
  const value = depth => {
    const kind = next() % (depth ? 8 : 7);
    if (kind < 4) return [null, undefined, false, true][kind];
    if (kind === 4) {data.setUint32(0, next());data.setUint32(4, next());return data.getFloat64(0);}
    if (kind === 5) return String.fromCharCode(...Array.from({length: next() % 13}, () => next() >>> 16));
    if (kind === 6) return [-0, Infinity, -Infinity, NaN, Number.MIN_VALUE, Number.MAX_VALUE][next() % 6];
    return array(depth - 1);
  };
  const array = depth => {const out = Array(next() % 17);for (let i = 0; i < out.length; i++) if (next() % 4) out[i] = value(depth);return out;};
  for (let i = 0; i < 512; i++) {const input = array(3), separator = value(0), owned = [], values = graph(a, input, owned), sep = box(a, separator, owned), out = a.invoke('join-value', [values, sep]), expected = input.join(separator);owned.push(out);assert.equal(js.join_value(input, separator), expected);assert.equal(a.readString(out), expected);release(a, owned);}
  finish(a);
});

test('join grows owned memory and reports capacity failures without losing the caller frame or active-array cleanup', () => {
  const a = instantiateManagedRuntime(artifact(), {maxSlots: 4096, initialBytes: 131072, maxBytes: 4194304});a.auto(1);const text = a.string('中😀\ud800'.repeat(10000)), values = a.sourceArray([text, text, text]), before = a.stats().capacityBytes;
  const out = a.invoke('default-value', [values]);assert.equal(a.readString(out), Array(3).fill('中😀\ud800'.repeat(10000)).join());assert(a.stats().capacityBytes > before);assert(a.stats().collections > 0);finish(a, [text, values, out]);
  const small = instantiateManagedRuntime(artifact(), {maxSlots: 256, initialBytes: 32768, maxBytes: 32768});small.auto(1);const held = small.number(-0), s = small.string('x'.repeat(10000)), input = small.sourceArray(Array(8).fill(s)), outer = small.frame(1);small.frameSet(outer, 0, held);
  assert.throws(() => small.invoke('default-value', [input]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.equal(small.stats().frameDepth, 1);assert(Object.is(small.readNumber(held), -0));
  small.resize(input, 0);const again = small.invoke('default-value', [input]);assert.equal(small.readString(again), '');small.leaveFrame(outer);finish(small, [held, s, input, again]);
});

test('real WASM output traps unwind join guards and preserve preceding conversion errors and outer roots', async () => {
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8'), start = source.indexOf('  (defun heap-join-result '), end = source.indexOf('  (defun ', start + 3);assert(start >= 0 && end > start);
  const rt = b.compiler.compile_ir_string(source.slice(0, start) + '  (defun heap-join-result (heap builder) (load-u32 4294967295))\n' + source.slice(end), 'array-text-trap.eli');
  const a = instantiateManagedRuntime(artifact(p, rt));a.auto(1);const trace = a.sourceObject({}), returned = a.sourceObject({}), bad = a.invoke('fallback-value', [trace, returned]), input = a.sourceArray([null]), held = a.number(-0), outer = a.frame(1);a.frameSet(outer, 0, held);
  assert.throws(() => a.invoke('join-value', [input, bad]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 1);
  for (let i = 0; i < 2; i++) {assert.throws(() => a.invoke('default-value', [input]), WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth, 1);assert(Object.is(a.readNumber(held), -0));}
  a.leaveFrame(outer);finish(a, [trace, returned, bad, input, held]);
});

test('Node executes the identical zero-import array text WASM with closure conversions sparse arrays exact text and root cleanup', async () => {
  const file = resolve(directory, 'array-text.wasm');await writeFile(file, artifact());
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const{instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);const text=a.string('中😀\\ud800'),trace=a.sourceObject({}),object=a.invoke('fallback-value',[trace,text]),values=a.sourceArray([object,null,undefined]),bar=a.string('|'),out=a.invoke('join-value',[values,bar]);assert.equal(a.readString(out),'中😀\\ud800||');a.resize(values,5);const sparse=a.invoke('default-value',[values]);assert.equal(a.readString(sparse),'中😀\\ud800,,,,');const custom=a.invoke('own-join',[values,text]),direct=a.invoke('text-value',[values]);assert.equal(a.readString(direct),'中😀\\ud800');for(const value of[text,trace,object,values,bar,out,sparse,custom,direct])a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, file], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
});

test('native Emacs string joining rejects the selected self-containing list and vector instead of skipping an item', () => {
  const form = '(progn (require (quote subr-x)) (let ((items (vector "apple" nil "banana")) (listed (list "apple" nil "banana"))) (aset items 1 items) (setcar (cdr listed) listed) (dolist (value (list items listed)) (let ((caught nil)) (condition-case nil (string-join value ",") (wrong-type-argument (setq caught t))) (unless caught (kill-emacs 1)))) (princ "native cycle rejection verified")))';
  const child = spawnSync(process.env.EMACS ?? 'emacs', ['--batch', '-Q', '--eval', form], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);assert.match(child.stdout, /native cycle rejection verified/);
});

test('JS array text modules share cycle guards and preserve primitive hooks getters and cleanup without prototype changes', async () => {
  const c = await compileCase('(defun second (values) (js-call values :join)) (export second)'), nativeJoin = Array.prototype.join, nativeText = Array.prototype.toString;
  const values = [null];let entered = 0;values[0] = {toString() {entered++;return c.js.second(values);}};
  assert.throws(() => js.default_value(values), e => e instanceof TypeError && e.eliscriptDiagnostic?.code === 'ELI-RT0009');assert.equal(entered, 1);values.length = 0;assert.equal(js.default_value(values), '');assert.equal(c.js.second(values), '');assert.equal(Array.prototype.join, nativeJoin);assert.equal(Array.prototype.toString, nativeText);
  const source = '(defun f (values key separator trace) (js-call values key separator (put trace :argument 1))) (export f)', p = b.compiler.compile_ir_string(source, 'computed-join.eli'), module = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const observe = operation => {const trace = [], base = [null, 'old'], value = new Proxy(base, {get(target, key, receiver) {trace.push(String(key));return Reflect.get(target, key, receiver);}});base[0] = {[Symbol.toPrimitive](hint) {trace.push(hint);base[1] = 'changed';return 'first';}};const separator = {[Symbol.toPrimitive](hint) {trace.push('separator:' + hint);return '|';}};return {value: operation(value, separator), trace};};
  assert.deepEqual(observe((value, sep) => js.join_value(value, sep)), observe((value, sep) => value.join(sep)));
  const trace = {}, array = ['a', 'b'];assert.equal(module.f(array, 'join', '|', trace), 'a|b');assert.deepEqual(trace, {argument: 1});
  for (const value of [[1n, -1n, null], [Symbol('x')]]) {if (typeof value[0] === 'symbol') assert.throws(() => js.default_value(value), TypeError);else assert.equal(js.default_value(value), nativeJoin.call(value));}
});

test('the emitted shared capsule matches its maintained source and literal method keys retain public Seed parity', async () => {
  assert(javascript.includes(await renderArrayTextImport()));
  const source = '(defun f (object key) (js-call object :join) (js-call object "toString") (js-call object false) (js-call object t) (js-call object nil) (js-call object undefined) (js-call object 7) (js-call object key)) (export f)', input = resolve(directory, 'literal-keys.eli'), output = resolve(directory, 'literal-keys.mjs');await writeFile(input, source);
  const seed = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, input], {encoding: 'utf8', timeout: 30000});assert.equal(seed.status, 0, seed.stderr);assert.equal(await readFile(output, 'utf8'), b.compiler.compile_string(source, input));
});
