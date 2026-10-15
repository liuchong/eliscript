import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory, b, runtime, program, javascript, js;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-typeof-'));b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-typeof.eli', 'utf8'), 'typeof.eli');
  javascript = b.compiler.emit_ir_string(program);js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function artifact(p = program, rt = runtime) {const before = JSON.stringify(p), out = Uint8Array.from(b.managed.emit_managed_wasm(p, rt));assert.equal(JSON.stringify(p), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)), []);return out;}
const box = (a, v) => typeof v === 'number' ? a.number(v) : typeof v === 'string' ? a.string(v) : v;
function finish(a, values = []) {for (const v of values) a.release(v);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
test('independent Node confirms existing typeof primitive distinctions, captured lexical bindings and member failures', async () => {
  const file = resolve(directory, 'source.mjs');await writeFile(file, javascript);
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';const m=await import(process.argv[1]);for(const x of[undefined,null,false,true,-0,NaN,Infinity,Number.MIN_VALUE,'中😀\\ud800',{},[],()=>1]){assert.equal(m.type_value(x),typeof x);assert.equal(m.type_member({item:x}),typeof x);assert.equal(m.invoke(m.capture(x)),typeof x);assert.equal(m.type_underscore(x),typeof x);}assert.equal(m.type_member({}),'undefined');assert.throws(()=>m.type_member(null),TypeError);assert.throws(()=>m.type_deep({}),TypeError);`, pathToFileURL(file).href], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
});
test('typeof values and member paths execute in owned WASM without coercing objects or conflating null and undefined', () => {
  const a = instantiateManagedRuntime(artifact());a.auto(1);const owned = [];
  for (const x of [undefined, null, false, true, 0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE, '', '中😀\ud800']) {
    const v = box(a, x), object = a.invoke('make-box', [v]), child = a.invoke('make-child', [object]);owned.push(v, object, child);
    for (const [name, input, expected] of [['type-value', v, typeof x], ['type-underscore', v, typeof x], ['type-member', object, typeof x], ['type-deep', child, typeof x], ['type-shadow', v, 'boolean']]) {const out = a.invoke(name, [input]);owned.push(out);assert.equal(a.readString(out), expected);}
    const closure = a.invoke('capture', [v]);owned.push(closure);a.collect();const out = a.invoke('invoke', [closure]);owned.push(out);assert.equal(a.readString(out), typeof x);assert.equal(a.stats().frameDepth, 0);
    if (x !== null && x !== undefined) {const member = a.invoke('type-member', [v]);owned.push(member);assert.equal(a.readString(member), typeof x.item);}
  }
  const object = a.sourceObject({}), array = a.sourceArray([]), fn = a.getExport('type-value');owned.push(object, array, fn);
  for (const [v, expected] of [[object, 'object'], [array, 'object'], [fn, 'function']]) {const out = a.invoke('type-value', [v]);owned.push(out);assert.equal(a.readString(out), expected);}
  const missing = a.invoke('type-member', [object]);owned.push(missing);assert.equal(a.readString(missing), 'undefined');
  for (const [name, value] of [['type-member', null], ['type-member', undefined], ['type-deep', object]]) {assert.throws(() => a.invoke(name, [value]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 0);}
  finish(a, owned);
});
test('typeof lexical and imported module bindings survive project renaming and writes without changing canonical IR', () => {
  const entry = b.compiler.compile_ir_string('(module entry (import "./typeof.mjs" type-value type-global write-global) (defun imported-type () (js* "typeof type_value")) (export type-value type-global write-global imported-type))', 'entry.eli'), modules = [{id: 'typeof.mjs', program}, {id: 'entry.mjs', program: entry}], before = JSON.stringify(modules);
  const bytes = Uint8Array.from(b.managed.emit_managed_project_wasm(modules, 'entry.mjs', runtime));assert.equal(JSON.stringify(modules), before);const a = instantiateManagedRuntime(bytes);a.auto(1);
  const first = a.invoke('type_global'), imported = a.invoke('imported_type');assert.equal(a.readString(first), 'object');assert.equal(a.readString(imported), 'function');const owned = [first, imported];
  for (const x of [undefined, null, false, -0, NaN, '中😀\ud800']) {const v = box(a, x), out = a.invoke('write_global', [v]), read = a.invoke('type_global');owned.push(v, out, read);assert.equal(a.readString(out), typeof x);assert.equal(a.readString(read), typeof x);}
  finish(a, owned);
});

test('type queries never stringify objects and random IEEE values retain their original bits through collecting GC', () => {
  const p = b.compiler.compile_ir_string('(defconst marker 1) (defun f (value) (js* "typeof value")) (defun factory (trace) (js-object :toString (lambda () (put trace :called t) "wrong") :valueOf (lambda () (put trace :called t) 7))) (export f factory)', 'type-hooks.eli'), a = instantiateManagedRuntime(artifact(p));a.auto(1);
  const trace = a.sourceObject({}), object = a.invoke('factory', [trace]), label = a.invoke('f', [object]), key = a.string('called');assert.equal(a.readString(label), 'object');assert.equal(a.objectGet(trace, key), undefined);
  const data = new DataView(new ArrayBuffer(8));let state = 0x294f61d7;const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < 1024; i++) {data.setUint32(0, next());data.setUint32(4, next());const x = data.getFloat64(0), input = a.number(x), out = a.invoke('f', [input]);assert.equal(a.readString(out), 'number');assert(Object.is(a.readNumber(input), x));a.release(input);a.release(out);}
  finish(a, [trace, object, label, key]);
});

test('unrepresented globals unsupported expressions and malformed typeof IR remain exact source-bound refusals even in dead code', () => {
  for (const expression of ['typeof unknown', 'typeof value()', 'typeof (value)', 'typeof value[key]']) {
    const p = b.compiler.compile_ir_string(';中😀\n(defun f (value) (if nil (js* ' + JSON.stringify(expression) + ') 1)) (export f)', 'type-refusal.eli'), before = JSON.stringify(p);
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001' && e.eliscriptDiagnostic.location.file === 'type-refusal.eli' && e.eliscriptDiagnostic.location.start.line === 2);assert.equal(JSON.stringify(p), before);
  }
  for (const change of [n => n.children.push(n.children[0]), n => n.children[0].value = null, n => n.children[0].children.push({kind: 'literal', value: 7, children: []})]) {
    const p = b.compiler.compile_ir_string('(defun f (value) (js* "typeof value")) (export f)', 'malformed-type.eli');let raw;
    const walk = n => {if (n && typeof n === 'object') {if (n.kind === 'raw-javascript') raw = n;for (const value of Object.values(n)) walk(value);}};walk(p);assert(raw);change(raw);
    const before = JSON.stringify(p);assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001');assert.equal(JSON.stringify(p), before);
  }
});

test('unimplemented primitive prototype values are refused rather than mislabeled as undefined', () => {
  for (const [key, values] of [['toString', [true, 1, 'x']], ['toFixed', [1]], ['toExponential', [1]], ['toPrecision', [1]], ['split', ['x']], ['toUpperCase', ['x']]]) {
    const p = b.compiler.compile_ir_string(`(defconst marker 1) (defun f (value) (js* "typeof value.${key}")) (export f)`, 'type-prototype.eli'), a = instantiateManagedRuntime(artifact(p));a.auto(1);
    for (const x of values) {const v = box(a, x);assert.throws(() => a.invoke('f', [v]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 0);a.release(v);}finish(a);
  }
});

test('type allocation and real WASM traps preserve outer roots and earlier member lookup errors', async () => {
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8'), start = source.indexOf('  (defun value-source-typeof '), end = source.indexOf('  (defun ', start + 3);assert(start >= 0 && end > start);
  const rt = b.compiler.compile_ir_string(source.slice(0, start) + '  (defun value-source-typeof (heap value) (load-u32 4294967295))\n' + source.slice(end), 'type-trap.eli');
  const a = instantiateManagedRuntime(artifact(program, rt));a.auto(1);const held = a.number(-0), outer = a.frame(1);a.frameSet(outer, 0, held);
  assert.throws(() => a.invoke('type-member', [null]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');assert.equal(a.stats().frameDepth, 1);
  assert.throws(() => a.invoke('type-value', [held]), WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth, 1);assert(Object.is(a.readNumber(held), -0));a.leaveFrame(outer);finish(a, [held]);
  const small = instantiateManagedRuntime(artifact(), {maxSlots: 64, initialBytes: 8192, maxBytes: 8192});small.auto(1);const retained = small.number(-0), frame = small.frame(1), keep = [];small.frameSet(frame, 0, retained);
  for (let i = 0; i < 128; i++) {try {keep.push(small.number(i));} catch (error) {assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');break;}}
  assert.throws(() => small.invoke('type-value', [retained]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0002');assert.equal(small.stats().frameDepth, 1);assert(Object.is(small.readNumber(retained), -0));for (const v of keep) small.release(v);small.collect();const out = small.invoke('type-value', [retained]);assert.equal(small.readString(out), 'number');small.leaveFrame(frame);finish(small, [retained, out]);
});

test('Node executes identical zero-import typeof bytes with captured functions members and module state', async () => {
  const file = resolve(directory, 'typeof.wasm');await writeFile(file, artifact());
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from'node:assert/strict';import{readFileSync}from'node:fs';const{instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);const n=a.number(-0),box=a.invoke('make-box',[n]),label=a.invoke('type-member',[box]),fn=a.getExport('type-value'),callable=a.invoke('type-value',[fn]),captured=a.invoke('capture',[n]),result=a.invoke('invoke',[captured]);assert.equal(a.readString(label),'number');assert.equal(a.readString(callable),'function');assert.equal(a.readString(result),'number');assert(Object.is(a.readNumber(n),-0));for(const x of[n,box,label,fn,callable,captured,result])a.release(x);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, file], {encoding: 'utf8', timeout: 30000});assert.equal(child.status, 0, child.stderr);
});

test('existing nil undefined and nullish predicates preserve distinct meanings and evaluate operands once', async () => {
  const source = '(defconst marker 1) (defun is-nil (value) (nil? value)) (defun is-undefined (value) (undefined? value)) (defun is-null (value) (null value)) (defun is-nullish (value) (nullish? value)) (defun once (value trace) (null (progn (put trace :calls (1+ (get trace :calls 0))) value))) (export is-nil is-undefined is-null is-nullish once)', p = b.compiler.compile_ir_string(source, 'null-predicates.eli'), ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')), a = instantiateManagedRuntime(artifact(p));a.auto(1);
  const values = [undefined, null, false, true, -0, NaN, Infinity, Number.MIN_VALUE, '', '中😀\ud800'];
  for (const x of values) {const v = box(a, x);for (const name of ['is-nil', 'is-undefined', 'is-null', 'is-nullish']) assert.equal(a.invoke(name, [v]), ref[name.replaceAll('-', '_')](x));const trace = a.sourceObject({});assert.equal(a.invoke('once', [v, trace]), ref.once(x, {}));const key = a.string('calls'), calls = a.objectGet(trace, key);assert.equal(a.readNumber(calls), 1);for (const item of [v, trace, key, calls]) a.release(item);a.collect();assert.equal(a.stats().frameDepth, 0);}
  const object = a.sourceObject({}), array = a.sourceArray([]), fn = a.getExport('is-null');for (const v of [object, array, fn]) for (const name of ['is-nil', 'is-undefined', 'is-null', 'is-nullish']) assert.equal(a.invoke(name, [v]), false);finish(a, [object, array, fn]);
});

test('null predicate arity and malformed operands are diagnosed before lowering children with immutable source locations', () => {
  for (const name of ['nil?', 'undefined?', 'null', 'nullish?']) for (const change of [n => n.children = [], n => n.children.push(n.children[0]), n => n.children = [null]]) {
    const p = b.compiler.compile_ir_string(';中😀\n(defun f (value) (' + name + ' value)) (export f)', 'null-shape.eli');let predicate;
    const walk = n => {if (n && typeof n === 'object') {if (n.kind === 'intrinsic' && n.value === name) predicate = n;for (const value of Object.values(n)) walk(value);}};walk(p);assert(predicate);const span = predicate.span;change(predicate);const before = JSON.stringify(p);
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001' && e.eliscriptDiagnostic.location.file === 'null-shape.eli' && e.eliscriptDiagnostic.location.start.line === span.line && e.eliscriptDiagnostic.location.start.column === span.column);assert.equal(JSON.stringify(p), before);
  }
});
