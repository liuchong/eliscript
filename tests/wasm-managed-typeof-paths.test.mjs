import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let b, runtime, directory;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-typeof-paths-'));b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function program(expression, argument = 'value') {return b.compiler.compile_ir_string(';中😀\n(defconst marker 1)\n(defun f (' + argument + ') (js* ' + JSON.stringify(expression) + ')) (export f)', 'type-path.eli');}
function artifact(p) {const before = JSON.stringify(p), bytes = Uint8Array.from(b.managed.emit_managed_wasm(p, runtime));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);return bytes;}
function finish(a, owned) {for (const value of owned) a.release(value);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}

test('static numeric and JSON string member paths preserve exact JS property keys and collecting roots', async () => {
  for (const token of ['0', '-0', '+0', '1', '-1', '+17', '4294967294', '4294967295', '9007199254740991', '-9007199254740991', ...['item', '', 'a.b', '[]', '中😀', '\ud800', 'line\nquote"slash\\', '0', '01'].map(value => JSON.stringify(value))]) {
    const expression = 'typeof value[' + token + ']', p = program(expression), js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
    const key = token.startsWith('"') ? JSON.parse(token) : String(Number(token));
    const a = instantiateManagedRuntime(artifact(p));a.auto(1);
    const text = a.string('中😀\ud800'), object = a.sourceObject({[key]: text}), label = a.invoke('f', [object]);
    assert.equal(a.readString(label), js.f({[key]: '中😀\ud800'}));assert.equal(a.readString(label), 'string');
    finish(a, [text, object, label]);
  }
});

test('nested indexed queries preserve missing final members, failing intermediate access and exact UTF16 strings', () => {
  for (const expression of ['typeof value[0].item', 'typeof value [ 0 ] . item', 'typeof value["child"][1]["item"]']) {
    const p = program(expression), a = instantiateManagedRuntime(artifact(p));a.auto(1);
    const number = a.number(-0), item = a.sourceObject({item: number}), pair = a.sourceArray([null, item]), object = a.sourceObject({child: pair}), array = a.sourceArray([item]), receiver = expression.includes('child') ? object : array;
    const label = a.invoke('f', [receiver]);assert.equal(a.readString(label), 'number');assert(Object.is(a.readNumber(number), -0));
    assert.throws(() => a.invoke('f', [null]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 0);
    finish(a, [number, item, pair, object, array, label]);
  }
  const a = instantiateManagedRuntime(artifact(program('typeof value[0]')));a.auto(1);const empty = a.sourceArray([]), missing = a.invoke('f', [empty]), text = a.string('😀\ud800'), unit = a.invoke('f', [text]);
  assert.equal(a.readString(missing), 'undefined');assert.equal(a.readString(unit), 'string');finish(a, [empty, missing, text, unit]);
});

test('indexed query roots survive underscore aliases, lexical captures and project binding renaming', () => {
  const library = b.compiler.compile_ir_string('(module lib (defvar values (js-array (js-object :item 1))) (defun label () (js* "typeof values[0].item")) (defun make (value-name) (lambda () (js* "typeof value_name[0].item"))) (defun invoke (f) (funcall f)) (export label make invoke))', 'paths-lib.eli');
  const entry = b.compiler.compile_ir_string('(module entry (import "./lib.mjs" label make invoke) (export label make invoke))', 'paths-entry.eli'), modules = [{id: 'lib.mjs', program: library}, {id: 'entry.mjs', program: entry}], before = JSON.stringify(modules);
  const bytes = Uint8Array.from(b.managed.emit_managed_project_wasm(modules, 'entry.mjs', runtime));assert.equal(JSON.stringify(modules), before);const a = instantiateManagedRuntime(bytes);a.auto(1);
  const first = a.invoke('label'), object = a.sourceObject({item: undefined}), array = a.sourceArray([object]), closure = a.invoke('make', [array]), result = a.invoke('invoke', [closure]);assert.equal(a.readString(first), 'number');assert.equal(a.readString(result), 'undefined');
  finish(a, [first, object, array, closure, result]);
});

test('unsupported computed keys and malformed indexed syntax remain precise source-bound refusals', () => {
  for (const expression of ['typeof unknown[0]', 'typeof value[key]', 'typeof value[1+1]', 'typeof value[0x1]', 'typeof value[01]', 'typeof value[9007199254740992]', 'typeof value[-9007199254740992]', 'typeof value[1.5]', 'typeof value[]', 'typeof value[0', 'typeof value["x"', 'typeof value["\\x41"]', 'typeof value["x"]()', 'typeof value[0] trailing']) {
    const p = program(expression), before = JSON.stringify(p);
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001' && e.eliscriptDiagnostic.location.file === 'type-path.eli' && e.eliscriptDiagnostic.location.start.line === 3);assert.equal(JSON.stringify(p), before);
  }
});

test('independent Node and the identical zero-import WASM agree on nested indexed type queries', async () => {
  const p = program('typeof value[0]["item"]'), jsFile = resolve(directory, 'source.mjs'), wasmFile = resolve(directory, 'paths.wasm');await writeFile(jsFile, b.compiler.emit_ir_string(p));await writeFile(wasmFile, artifact(p));
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from'node:assert/strict';import{readFileSync}from'node:fs';const js=await import(process.argv[1]),{instantiateManagedRuntime}=await import(process.argv[2]),a=instantiateManagedRuntime(readFileSync(process.argv[3]));a.auto(1);for(const value of[null,undefined,false,-0,NaN,Number.MIN_VALUE,'中😀\\ud800']){const v=typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value,object=a.sourceObject({item:v}),array=a.sourceArray([object]),out=a.invoke('f',[array]);assert.equal(a.readString(out),js.f([{item:value}]));for(const x of[v,object,array,out])a.release(x);}a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`, pathToFileURL(jsFile).href, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, wasmFile], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
});

test('value-type intrinsic agrees with typeof and evaluates source operands once under collecting GC', async () => {
  const p = b.compiler.compile_ir_string('(defconst marker 1) (defun f (value trace) (value-type (progn (put trace :calls (1+ (get trace :calls 0))) value))) (export f)', 'value-type.eli');
  const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
  const a = instantiateManagedRuntime(artifact(p));a.auto(1);const objects = [a.sourceObject({}), a.sourceArray([]), a.getExport('f')];
  for (const value of [null, undefined, false, true, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, '', '中😀\ud800', ...objects]) {
    const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value, trace = a.sourceObject({}), label = a.invoke('f', [input, trace]), key = a.string('calls'), calls = a.objectGet(trace, key), modelTrace = {};
    assert.equal(a.readString(label), js.f(value === objects[2] ? (() => {}) : value, modelTrace));assert.equal(a.readNumber(calls), 1);assert.equal(modelTrace.calls, 1);
    if (typeof value === 'number') assert(Object.is(a.readNumber(input), value));
    for (const item of [trace, label, key, calls]) a.release(item);if (!objects.includes(input)) a.release(input);assert.equal(a.stats().frameDepth, 0);
  }
  finish(a, objects);
});

test('malformed value-type operands retain exact source-bound diagnostics and canonical IR', () => {
  for (const mutate of [n => n.children = [], n => n.children.push(n.children[0]), n => n.children = [null]]) {
    const p = b.compiler.compile_ir_string(';中😀\n(defun f (value) (value-type value)) (export f)', 'value-type-shape.eli');let intrinsic;
    const walk = n => {if (n && typeof n === 'object') {if (n.kind === 'intrinsic' && n.value === 'value-type') intrinsic = n;for (const value of Object.values(n)) walk(value);}};walk(p);assert(intrinsic);const span = intrinsic.span;mutate(intrinsic);const before = JSON.stringify(p);
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001' && e.eliscriptDiagnostic.location.file === 'value-type-shape.eli' && e.eliscriptDiagnostic.location.start.line === span.line && e.eliscriptDiagnostic.location.start.column === span.column);assert.equal(JSON.stringify(p), before);
  }
});

test('static paths accept JS whitespace and escaped delimiters but reject incomplete tokens without mutating input', async () => {
  for (const space of [' ', '\t', '\r', '\n', '\v', '\f', '\u00a0', '\ufeff', '\u2028', '\u2029']) {
    const expression = 'typeof' + space + 'value' + space + '[' + space + '"a\\\"].b"' + space + ']' + space, p = program(expression), js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));
    const a = instantiateManagedRuntime(artifact(p));a.auto(1);const object = a.sourceObject({'a"].b': false}), out = a.invoke('f', [object]);assert.equal(a.readString(out), js.f({'a"].b': false}));finish(a, [object, out]);
  }
  for (const expression of ['typeofvalue', 'typeof ', 'typeof 0value', 'typeof value.', 'typeof value.0', 'typeof value[+]', 'typeof value[-]', 'typeof value[+01]', 'typeof value[-00]', 'typeof value[  ]', 'typeof value["x\\"]', 'typeof value["x\n"]', 'typeof value["x" 0]', 'typeof value[0][', 'typeof value/*x*/[0]']) {
    const p = program(expression), before = JSON.stringify(p);assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');assert.equal(JSON.stringify(p), before);
  }
});

test('value-type reads live own namespace descriptors and preserves callers roots on allocation failure', () => {
  const lib = b.compiler.compile_ir_string('(module lib (defvar kind "eliscript/symbol") (defun update () (setq kind "eliscript/keyword")) (export kind update))', 'brand-lib.eli'), entry = b.compiler.compile_ir_string('(module entry (import "./lib.mjs" :as lib) (defun label () (value-type lib)) (defun change () (lib/update)) (export label change))', 'brand-entry.eli');
  const bytes = Uint8Array.from(b.managed.emit_managed_project_wasm([{id: 'lib.mjs', program: lib}, {id: 'entry.mjs', program: entry}], 'entry.mjs', runtime)), a = instantiateManagedRuntime(bytes);a.auto(1);
  const first = a.invoke('label');assert.equal(a.readString(first), 'symbol');a.release(first);const change = a.invoke('change');a.release(change);const next = a.invoke('label');assert.equal(a.readString(next), 'keyword');finish(a, [next]);
  const small = instantiateManagedRuntime(artifact(b.compiler.compile_ir_string('(defconst marker 1) (defun f (value) (value-type value)) (export f)', 'type-oom.eli')), {maxSlots: 64, initialBytes: 8192, maxBytes: 8192});small.auto(1);
  const retained = small.number(-0), outer = small.frame(1), held = [];small.frameSet(outer, 0, retained);let exhausted = false;
  for (let i = 0; i < 128; i++) {try {held.push(small.number(i));} catch (e) {assert.equal(e.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;}}
  assert(exhausted);assert.throws(() => small.invoke('f', [retained]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.equal(small.stats().frameDepth, 1);assert(Object.is(small.readNumber(retained), -0));
  for (const value of held) small.release(value);small.collect();const out = small.invoke('f', [retained]);assert.equal(small.readString(out), 'number');small.leaveFrame(outer);finish(small, [retained, out]);
});

test('value-type falls back to object when a cyclic namespace brand is still uninitialized', async () => {
  const sources = {
    'main.mjs': '(import "./other.mjs" early) (defvar kind "eliscript/keyword") (defun read () early) (export kind read)',
    'other.mjs': '(import "./main.mjs" :as namespace) (defconst early (value-type namespace)) (export early)',
  }, modules = [];
  const base = resolve(directory, 'cyclic-brand');await mkdir(base);
  for (const [id, source] of Object.entries(sources)) {const p = b.compiler.compile_ir_string(source, id);modules.push({id, program: p});await writeFile(resolve(base, id), b.compiler.emit_ir_string(p));}
  const reference = await import(pathToFileURL(resolve(base, 'main.mjs')).href);assert.equal(reference.read(), 'object');
  const before = JSON.stringify(modules), a = instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_project_wasm(modules, 'main.mjs', runtime)));assert.equal(JSON.stringify(modules), before);a.auto(1);const out = a.invoke('read');assert.equal(a.readString(out), reference.read());finish(a, [out]);
});

test('value-type preserves null and own data brands while typeof and inherited or unrelated kind fields stay ordinary', async () => {
  const p = b.compiler.compile_ir_string('(defconst marker 1) (defun f (value) (js-array (value-type value) (js* "typeof value"))) (defun inherit (parent) (let ((child (js-object))) (put child :__proto__ parent) child)) (defun array (marker) (let ((value (js-array))) (put value :kind marker) value)) (defun map (marker) (let ((value (new globalThis.Map))) (put value :kind marker) value)) (defun set (marker) (let ((value (new globalThis.Set))) (put value :kind marker) value)) (export f inherit array map set)', 'type-brands.eli');
  const js = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')), a = instantiateManagedRuntime(artifact(p));a.auto(1);
  for (const marker of ['eliscript/keyword', 'eliscript/symbol', 'keyword', 'symbol', '', 'eliscript/keywordx', null, false, 7]) {
    const input = typeof marker === 'string' ? a.string(marker) : typeof marker === 'number' ? a.number(marker) : marker, object = a.sourceObject({kind: input}), inherited = a.invoke('inherit', [object]), array = a.invoke('array', [input]), map = a.invoke('map', [input]), set = a.invoke('set', [input]);
    for (const [value, reference] of [[object, {kind: marker}], [inherited, Object.create({kind: marker})], [array, js.array(marker)], [map, js.map(marker)], [set, js.set(marker)]]) {
      const out = a.invoke('f', [value]), type = a.get(out, 0), host = a.get(out, 1);assert.deepEqual([a.readString(type), a.readString(host)], js.f(reference));for (const x of [out, type, host]) a.release(x);
    }
    for (const x of [input, object, inherited, array, map, set]) a.release(x);a.collect();assert.equal(a.stats().frameDepth, 0);
  }
  finish(a, []);
});
