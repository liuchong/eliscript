import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let b, rt, p, js, javascript, directory;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-json-'));
  b = await buildBackends({outputRoot: directory});
  rt = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  p = b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-json.eli', 'utf8'), 'json.eli');
  javascript = b.compiler.emit_ir_string(p); js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function instance(options) {
  const before = JSON.stringify(p), bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, rt)); assert.equal(JSON.stringify(p), before);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes, options); a.auto(1); return {a, bytes};
}
function finish(a, values = []) {for (const x of values) a.release(x); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);}
const valid = ['null', 'true', 'false', '-0', '1.5', '5e-324', '-1e-9999', '1e9999', '9007199254740993',
  '""', '"中😀"', '"\\ud800\\udc00\\ud800"', '"\\b\\f\\n\\r\\t\\/\\\\\\\""', '[]', '{}',
  '[null,true,false,0,-0,1e9999,"x",[1,2],{}]', '{"b":1,"2":2,"1":3,"a":4,"b":5}',
  '{"__proto__":{"x":1},"constructor":7,"prototype":8}', ' \r\n\t {"a":[1,{"b":"😀"}]} \r\n'];
const invalid = ['', ' ', '\ufeffnull', '\u00a0null', '+1', '01', '-01', '1.', '.5', '1e', '1e+', 'NaN', 'Infinity',
  'undefined', 'null false', '/*x*/null', '[1,]', '[,1]', '{"a":1,}', '{a:1}', '{"a" 1}', '"\\x41"', '"\\u12"', '"a\nb"', '"unterminated'];

test('independent Node confirms original source JSON behavior before WASM emission', async () => {
  const file = resolve(directory, 'source.mjs'); await writeFile(file, javascript);
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict'; const m = await import(process.argv[1]);assert(Object.is(m.parse_value('-0'),-0));assert.equal(m.canonical_value('{"b":1,"1":2,"b":3}'),'{"1":2,"b":3}');assert.equal(Object.hasOwn(m.parse_value('{"__proto__":7}'),'__proto__'),true);assert.equal(m.stringify_value(undefined),undefined);`, pathToFileURL(file).href], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
});
test('valid JSON grammar, exact numbers, duplicate keys and surrogate strings round trip inside WASM', () => {
  const {a} = instance();
  for (const text of valid) {const x = a.string(text), out = a.invoke('canonical-value', [x]); assert.equal(a.readString(out), js.canonical_value(text), text); a.release(x); a.release(out); a.collect(); assert.equal(a.stats().frameDepth, 0);}
  const text = a.string('{"__proto__":7}'), out = a.invoke('parse-value', [text]), key = a.string('__proto__');
  assert.equal(a.invoke('own-value', [out, key]), true); const value = a.invoke('key-value', [out, key]); assert.equal(a.readNumber(value), 7);
  finish(a, [text, out, key, value]);
});
test('invalid JSON is rejected without leaking frames or losing an earlier argument effect', () => {
  const {a} = instance(), held = a.number(-0), outer = a.frame(1); a.frameSet(outer, 0, held);
  for (const text of invalid) {assert.throws(() => js.parse_value(text), SyntaxError); const x = a.string(text), trace = a.sourceObject({}); assert.throws(() => a.invoke('parse-extra', [x, trace]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); assert.equal(a.stats().frameDepth, 1); const key = a.string('visited'), visited = a.objectGet(trace, key); assert.equal(a.readNumber(visited), 7); for (const value of [x, trace, key, visited]) a.release(value);}
  assert(Object.is(a.readNumber(held), -0)); a.leaveFrame(outer); finish(a, [held]);
});
test('stringify preserves omission, holes, integer key order, nonfinite numbers, indentation and property lists', () => {
  const {a} = instance(), text = a.string('中😀\ud800\0\n"\\'), nan = a.number(NaN), zero = a.number(-0), space = a.number(2);
  const array = a.sourceArray([undefined, nan, text, zero]); a.resize(array, 6);
  const object = a.sourceObject({'2': text, b: array, a: undefined, nan, zero});
  const reference = {'2': '中😀\ud800\0\n"\\', b: [undefined, NaN, '中😀\ud800\0\n"\\', -0, , ], a: undefined, nan: NaN, zero: -0}; reference.b.length = 6;
  for (const [name, args, expected] of [['stringify-value', [object], JSON.stringify(reference)], ['pretty-value', [object, space], JSON.stringify(reference, null, 2)]]) {const out = a.invoke(name, args); assert.equal(a.readString(out), expected); a.release(out);}
  const bkey = a.string('b'), nkey = a.string('nan'), keys = a.sourceArray([bkey, nkey, bkey]), gap = a.string('😀abcdefghijk');
  const selected = a.invoke('select-value', [object, keys, gap]); assert.equal(a.readString(selected), JSON.stringify(reference, ['b', 'nan', 'b'], '😀abcdefghijk'));
  assert.equal(a.invoke('stringify-value', [undefined]), undefined); assert.equal(a.invoke('same-parser'), true);
  finish(a, [text, nan, zero, space, array, object, bkey, nkey, keys, gap, selected]);
});
test('empty String builtin results are sealed source strings and work in subsequent source methods', async () => {
  const source = '(defun f () (js-call (funcall (js* "String")) :trim)) (export f)', ir = b.compiler.compile_ir_string(source, 'empty-string.eli');
  const ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64')); assert.equal(ref.f(), '');
  const a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(ir, rt))); a.auto(1); const out = a.invoke('f'); assert.equal(a.readString(out), ''); a.release(out); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
});

test('numeric JSON values preserve exact bits and indentation uses the first ten UTF16 units or clamped integer spaces', () => {
  const {a} = instance(), one = a.number(1), object = a.sourceObject({a: one});
  for (const text of ['-0', '-1e-9999', '5e-324', '2.2250738585072014e-308', '1.7976931348623157e308', '1e9999', '9007199254740993']) {
    const x = a.string(text), out = a.invoke('parse-value', [x]); assert(Object.is(a.readNumber(out), JSON.parse(text)), text); a.release(x); a.release(out);
  }
  for (const space of ['', 'x', '\ud800', '123456789😀', '😀abcdefghijk', -0, -Infinity, Infinity, NaN, -2, 1.9, 12]) {
    const gap = typeof space === 'number' ? a.number(space) : a.string(space), out = a.invoke('pretty-value', [object, gap]); assert.equal(a.readString(out), JSON.stringify({a: 1}, null, space)); a.release(gap); a.release(out);
  }
  finish(a, [one, object]);
});

test('deterministic ordinary JSON trees and grammar mutations match independent Node models under collecting GC', async () => {
  const {a} = instance(); let seed = 0x69107df3;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const strings = ['', '中😀', '\ud800', '\udc00', '\0\b\n', '"\\/\u2028', '__proto__'];
  const value = depth => {
    const choice = next() % (depth ? 7 : 5);
    if (choice === 0) return null; if (choice === 1) return !!(next() & 1);
    if (choice === 2) return strings[next() % strings.length];
    if (choice < 5) return (next() - 0x80000000) * 10 ** (next() % 601 - 300);
    if (choice === 5) return Array.from({length: next() % 4}, () => value(depth - 1));
    const entries = []; for (let i = next() % 4; i > 0; i--) entries.push([['a', '2', '1', '__proto__', ''][next() % 5], value(depth - 1)]); return Object.fromEntries(entries);
  };
  const records = []; a.collect(); const baseline = a.live();
  for (let i = 0; i < 256; i++) {
    const text = JSON.stringify(value(4)), x = a.string(text), out = a.invoke('canonical-value', [x]);
    const expected = js.canonical_value(text); assert.equal(a.readString(out), expected, text); records.push({text, expected}); a.release(x); a.release(out); a.collect(); assert.equal(a.live(), baseline); assert.equal(a.stats().frameDepth, 0);
    const bad = a.string(text + '#'); assert.throws(() => a.invoke('parse-value', [bad]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); a.release(bad); a.collect(); assert.equal(a.live(), baseline);
  }
  finish(a); const file = resolve(directory, 'models.json'); await writeFile(file, JSON.stringify(records));
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';for(const r of JSON.parse(readFileSync(process.argv[1],'utf8'))){assert.equal(JSON.stringify(JSON.parse(r.text)),r.expected);assert.throws(()=>JSON.parse(r.text+'#'),SyntaxError)}`, file], {encoding: 'utf8', timeout: 30000}); assert.equal(child.status, 0, child.stderr);
}, 30000);

test('cyclic values are rejected while repeated shared children stringify independently without retained roots', () => {
  const {a} = instance(), key = a.string('self'), cycle = a.sourceObject({}); a.objectSet(cycle, key, cycle);
  const reference = {}; reference.self = reference; assert.throws(() => JSON.stringify(reference), TypeError);
  const held = a.number(-0), outer = a.frame(1); a.frameSet(outer, 0, held);
  assert.throws(() => a.invoke('stringify-value', [cycle]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0)); a.leaveFrame(outer);
  const child = a.sourceObject({x: held}), shared = a.sourceArray([child, child]), out = a.invoke('stringify-value', [shared]); assert.equal(a.readString(out), '[{"x":0},{"x":0}]');
  finish(a, [key, cycle, held, child, shared, out]);
});

test('callback JSON transformations stay explicitly unsupported instead of being silently skipped', async () => {
  const source = '(defconst input "1") (defun f () (js-call (js* "JSON") :parse input (lambda (key value) value))) (defun g () (JSON/stringify 1 (lambda (key value) value))) (defun factory () (lambda (key) 7)) (defun h (x) (JSON/stringify x)) (export f g factory h)';
  const ir = b.compiler.compile_ir_string(source, 'json-callbacks.eli'), ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64'));
  assert.equal(ref.f(), 1); assert.equal(ref.g(), '1'); assert.equal(ref.h({toJSON: ref.factory()}), '7');
  const a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(ir, rt))); a.auto(1);
  for (const name of ['f', 'g']) assert.throws(() => a.invoke(name), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
  const f = a.invoke('factory'), object = a.sourceObject({toJSON: f}); assert.throws(() => a.invoke('h', [object]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); finish(a, [f, object]);
});

test('parsed objects retain ordinary prototype assignment while parsed __proto__ stays an own data property', () => {
  const control = js.parse_value('{}'); js.set_value(control, '__proto__', {inherited: 7}); assert.equal(control.inherited, 7); assert.equal(Object.hasOwn(control, '__proto__'), false);
  const {a} = instance(), text = a.string('{}'), object = a.invoke('parse-value', [text]), n = a.number(7), prototype = a.sourceObject({inherited: n}), key = a.string('__proto__'), field = a.string('inherited');
  const assigned = a.invoke('set-value', [object, key, prototype]); a.release(assigned);
  assert.equal(a.invoke('own-value', [object, key]), false); const out = a.invoke('key-value', [object, field]); assert.equal(a.readNumber(out), 7);
  finish(a, [text, object, n, prototype, key, field, out]);
});

test('large UTF16 JSON output grows actual memory and deep or capacity failures preserve caller roots', () => {
  const {a} = instance({maxSlots: 4096, initialBytes: 131072, maxBytes: 4194304}); a.auto(4096);
  const original = '中😀\ud800\0\n"\\'.repeat(10000), input = a.string(JSON.stringify([original])), out = a.invoke('canonical-value', [input]); assert.equal(a.readString(out), JSON.stringify([original])); assert(a.stats().capacityBytes > 131072); assert(a.stats().collections > 0);
  a.release(input); a.release(out);
  const text = a.string('['.repeat(513) + '0' + ']'.repeat(513)), held = a.number(-0), frame = a.frame(1); a.frameSet(frame, 0, held);
  assert.throws(() => a.invoke('parse-value', [text]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002'); assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0)); a.leaveFrame(frame); finish(a, [text, held]);
  const {a: small} = instance({maxSlots: 128, initialBytes: 4096, maxBytes: 16384}), many = small.string('[' + Array.from({length: 1000}, (_, i) => i).join(',') + ']'), saved = small.number(-0), outer = small.frame(1); small.frameSet(outer, 0, saved);
  assert.throws(() => small.invoke('parse-value', [many]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002'); assert.equal(small.stats().frameDepth, 1); assert(Object.is(small.readNumber(saved), -0)); small.leaveFrame(outer); finish(small, [many, saved]);
}, 30000);

test('actual parser and writer WASM traps release private frames and preserve earlier conversion failures', async () => {
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  for (const [helper, args, entry, input] of [['heap-json-take', 'heap text state', 'parse-value', '1'], ['heap-json-write', 'heap builder unit', 'stringify-value', 'x']]) {
    const start = source.indexOf('  (defun ' + helper + ' '), end = source.indexOf('  (defun ', start + 3); assert(start >= 0 && end > start);
    const injected = b.compiler.compile_ir_string(source.slice(0, start) + `(defun ${helper} (${args}) (load-u32 4294967295))\n` + source.slice(end), 'json-trap.eli');
    const a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p, injected))); a.auto(1);
    const x = a.string(input), held = a.number(-0), frame = a.frame(1); a.frameSet(frame, 0, held);
    assert.throws(() => a.invoke(entry, [x]), WebAssembly.RuntimeError); assert.equal(a.stats().frameDepth, 1); assert.equal(a.readString(x), input); assert(Object.is(a.readNumber(held), -0));
    if (entry === 'parse-value') {const bad = a.sourceObject({}); assert.throws(() => a.invoke(entry, [bad]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); assert.equal(a.stats().frameDepth, 1); a.release(bad);}
    a.leaveFrame(frame); finish(a, [x, held]);
  }
});

test('standalone and linked JSON or Array namespace shadows retain ordinary callable lookup and effects', async () => {
  const source = '(defconst JSON (js-object :parse (lambda (x extra) extra) :stringify (lambda (x) 41))) (defconst Array (js-object :isArray (lambda (x) 43))) (defun f (x trace) (js-call (js* "JSON") :parse x (put trace :visited 37))) (defun g (x) (JSON/stringify x)) (defun a (x) (js-call (js* "Array") :isArray x)) (export f g a)';
  const ir = b.compiler.compile_ir_string(source, 'shadow.eli'), ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64'));
  const trace = {}; assert.equal(ref.f('x', trace), 37); assert.equal(trace.visited, 37); assert.equal(ref.g('x'), 41); assert.equal(ref.a('x'), 43);
  const entry = b.compiler.compile_ir_string('(module main (import "./shadow.mjs" f g a) (export f g a))', 'entry.eli');
  for (const bytes of [b.managed.emit_managed_wasm(ir, rt), b.managed.emit_managed_project_wasm([{id: 'shadow.mjs', program: ir}, {id: 'entry.mjs', program: entry}], 'entry.mjs', rt)]) {
    const a = instantiateManagedRuntime(Uint8Array.from(bytes)); a.auto(1); const x = a.string('x'), seen = a.sourceObject({});
    for (const [name, args, expected] of [['f', [x, seen], 37], ['g', [x], 41], ['a', [x], 43]]) {const out = a.invoke(name, args); assert.equal(a.readNumber(out), expected); a.release(out);}
    const key = a.string('visited'), visited = a.objectGet(seen, key); assert.equal(a.readNumber(visited), 37); finish(a, [x, seen, key, visited]);
  }
});

test('Node executes the identical zero-import JSON WASM against its own JSON grammar and exact output', async () => {
  const {a, bytes} = instance(); finish(a); const wasm = resolve(directory, 'json.wasm'), cases = resolve(directory, 'cases.json'); await writeFile(wasm, bytes); await writeFile(cases, JSON.stringify({valid, invalid}));
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
    const {instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(readFileSync(process.argv[2])),cases=JSON.parse(readFileSync(process.argv[3],'utf8'));a.auto(1);
    for(const text of cases.valid){const input=a.string(text),out=a.invoke('canonical-value',[input]);assert.equal(a.readString(out),JSON.stringify(JSON.parse(text)),text);a.release(input);a.release(out);a.collect();assert.equal(a.stats().frameDepth,0)}
    for(const text of cases.invalid){assert.throws(()=>JSON.parse(text),SyntaxError);const input=a.string(text);assert.throws(()=>a.invoke('parse-value',[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(input)}
    const x=a.string('-0'),out=a.invoke('parse-value',[x]);assert(Object.is(a.readNumber(out),-0));a.release(x);a.release(out);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
  `, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, wasm, cases], {encoding: 'utf8', timeout: 30000}); assert.equal(child.status, 0, child.stderr);
});

test('unsupported RegExp property reflection is refused rather than silently omitted from a JSON property list', async () => {
  const source = '(defconst pattern (js* "/a/")) (defun f () (JSON/stringify pattern (js-array "lastIndex"))) (defun g () (JSON/stringify pattern)) (export f g)';
  const ir = b.compiler.compile_ir_string(source, 'json-regexp.eli'), ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64'));
  assert.equal(ref.f(), '{"lastIndex":0}'); assert.equal(ref.g(), '{}');
  const a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(ir, rt))); a.auto(1); const out = a.invoke('g'); assert.equal(a.readString(out), '{}');
  assert.throws(() => a.invoke('f'), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); finish(a, [out]);
});
