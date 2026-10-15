import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {resolve, relative, win32} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const cases = [
  ['compiler', 'evaluation-object-p', value => value !== null && typeof value === 'object' && !Array.isArray(value)],
  ['compiler', 'evaluation-id-p', value => value === null || (typeof value === 'string' && value.length > 0) || (Number.isSafeInteger(value) && value >= 0)],
  ['compiler', 'evaluation-positive-integer-p', value => Number.isSafeInteger(value) && value >= 1],
  ['ir', 'non-negative-integer-p', value => Number.isSafeInteger(value) && value >= 0],
  ['ir', 'positive-integer-p', value => Number.isSafeInteger(value) && value >= 1],
  ['project', 'object-p', value => value !== null && typeof value === 'object' && !Array.isArray(value)],
  ['project', 'nonnegative-number-p', value => typeof value === 'number' && Number.isFinite(value) && value >= 0],
  ['project', 'boolean-p', value => typeof value === 'boolean'],
  ['project', 'safe-relative-path-p', value => typeof value === 'string' && value.length > 0 && !/^(?:[\\/]|[A-Za-z]:[\\/])/.test(value) && !value.split(/[\\/]+/u).includes('..')],
  ['transient-analysis', 'canonical-transient-family', value => typeof value !== 'string' || !/(^|\/)(stdlib|runtime)\/core\/transient\.(mjs|eli)$/.test(value) ? null : /(^|\/)runtime\/core\//.test(value) ? 'runtime' : 'stdlib'],
  ['transient-analysis', 'trusted-core-source-p', value => typeof value === 'string' && ['stdlib/core/data.eli', 'stdlib/core/seq.eli', 'stdlib/core/set.eli', 'stdlib/core/transient.eli'].some(suffix => value === suffix || value.endsWith('/' + suffix))],
];
let directory, backend, runtime;const units = new Map();
const flatten = nodes => nodes.flatMap(node => node.kind === 'module-declaration' ? flatten(node.children) : [node]);
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-portable-predicates-'));
  backend = await buildBackends({outputRoot: directory});
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  for (const [file, name] of cases) {
    const program = backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/' + file + '.eli', 'utf8'), file + '.eli');
    const node = flatten(program.body).find(node => node.value === name && ['function-declaration', 'variable-declaration'].includes(node.kind));assert(node, name);
    // Deliberately isolated unit evidence; full compiler generations are checked
    // separately and this subset never stands in for a compiler host artifact.
    const effectSource = '(defun ' + name + ' (&rest ignored) nil) (defun invoke-helper (&rest args) (apply ' + name + ' args)) (defun predicate-effects (trace) (js-array (funcall ' + name + ' (progn (js-call trace :push 0) undefined) (progn (js-call trace :push 1) false)) trace)) (export predicate-effects)';
    const support = flatten(backend.compiler.compile_ir_string(effectSource, 'predicate-effects.eli').body);
    const effect = support.find(n => n.kind === 'function-declaration' && n.value === 'predicate-effects'), adapter = support.find(n => n.kind === 'function-declaration' && n.value === 'invoke-helper');
    const unit = {...program, body: [structuredClone(node), adapter, effect, {kind: 'export-declaration', span: null, value: null, children: [name, 'invoke-helper', 'predicate-effects'].map(value => ({kind: 'reference', span: null, value, children: []}))}]};
    const javascript = backend.compiler.emit_ir_string(unit), reference = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
    units.set(name, {program: unit, javascript, fn: reference[name.replaceAll('-', '_')], effects: reference.predicate_effects, source: program});
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
for (const [file, name, oracle] of cases) test('Given original ' + file + ' helper ' + name + ', when compiled as an independent predicate unit, then managed WASM needs no raw JavaScript function', () => {
  const unit = units.get(name), before = JSON.stringify(unit.program), bytes = Uint8Array.from(backend.managed.emit_managed_wasm(unit.program, runtime));assert.equal(JSON.stringify(unit.program), before);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes);a.auto(1);
  for (const value of [undefined, null, false, true, -0, 0, 1, -1, .5, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, '', 'a', '中😀', '../x', 'a/../b', 'a\\..\\b', resolve('predicate-input'), win32.resolve('C:', 'predicate-input'), 'stdlib/core/transient.eli', 'runtime/core/transient.mjs', 'x/stdlib/core/data.eli']) {
    const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value;
    const out = a.invoke(name, [input]);try {assert.deepEqual(out && typeof out === 'object' ? a.readString(out) : out, oracle(value), name + ': ' + String(value));assert.deepEqual(unit.fn(value), oracle(value));} finally {a.release(out);a.release(input);}
  }
  a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
});
test('Given host objects functions prototypes brands and proxies, when compiler predicates run as JS, then the original expressions remain the independent oracle', () => {
  let hooks = 0;const hostile = {valueOf() {hooks++;throw Error('unexpected conversion');}, toString() {hooks++;throw Error('unexpected conversion');}};
  Object.defineProperty(hostile, 'kind', {get() {hooks++;throw Error('unexpected brand read');}});
  const revoked = Proxy.revocable([], {});revoked.revoke();
  const values = [{}, Object.create(null), Object.create({inherited: true}), [], Array(3), Object.setPrototypeOf([], null), {kind: 'eliscript/keyword'}, hostile, new Map(), new Set(), new Date(0), /x/u, new Number(1), new String('x'), new Boolean(false), () => 1, function two(a, b) {}, Symbol('x'), 1n, new Proxy({}, {}), revoked.proxy];
  for (const [, name, oracle] of cases) for (const value of values) {
    let expected, failed;try {expected = oracle(value);} catch (error) {failed = error.constructor;}
    if (failed) assert.throws(() => units.get(name).fn(value), failed, name);else assert.deepEqual(units.get(name).fn(value), expected, name);
  }
  assert.equal(hooks, 0);
});
test('Given missing explicit undefined and extra arguments, when migrated predicates are invoked, then raw-arrow argument semantics and each effect are preserved', () => {
  for (const [, name, oracle] of cases) {
    const unit = units.get(name), bytes = Uint8Array.from(backend.managed.emit_managed_wasm(unit.program, runtime)), a = instantiateManagedRuntime(bytes);a.auto(1);
    assert.equal(unit.fn.length, oracle.length, 'original helper arity: ' + name);
    assert.equal(Object.hasOwn(unit.fn, 'prototype'), false, 'original arrow has no own prototype: ' + name);
    assert.throws(() => Reflect.construct(function () {}, [], unit.fn), TypeError, 'original arrow is not a newTarget: ' + name);
    for (const args of [[], [undefined], [null], [true, false, null, undefined], [undefined, true]]) {
      const out = a.invoke('invoke-helper', args);try {assert.deepEqual(out && typeof out === 'object' ? a.readString(out) : out, oracle(...args), name);assert.deepEqual(unit.fn(...args), oracle(...args), name);} finally {a.release(out);}
    }
    let count = 0;const args = [() => {count++;return undefined;}, () => {count++;return true;}, () => {count++;return false;}];assert.deepEqual(unit.fn(...args.map(fn => fn())), oracle(undefined));assert.equal(count, 3);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test('Given represented arrays objects inherited prototypes and functions, when zero-import predicates run under GC, then brands do not replace raw typeof', () => {
  for (const [, name, oracle] of cases) {
    const unit = units.get(name), support = flatten(backend.compiler.compile_ir_string('(defun predicate-function () (lambda (&rest ignored) nil)) (defun predicate-object (prototype) (let ((item (js-object))) (put item :__proto__ prototype) item)) (export predicate-function predicate-object)', 'predicate-support.eli').body);
    const input = {...unit.program, body: [...unit.program.body.filter(n => n.kind !== 'export-declaration'), ...support.filter(n => n.kind !== 'export-declaration'), {kind: 'export-declaration', span: null, value: null, children: [name, 'predicate-function', 'predicate-object'].map(value => ({kind: 'reference', span: null, value, children: []}))}]};
    const a = instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(input, runtime)));a.auto(1);const brand = a.string('eliscript/keyword'), plain = a.sourceObject({}), branded = a.sourceObject({kind: brand}), array = a.sourceArray([undefined]), fn = a.invoke('predicate-function'), inherited = a.invoke('predicate-object', [plain]), nullPrototype = a.invoke('predicate-object', [null]);
    for (const [value, reference] of [[plain, {}], [branded, {kind: 'eliscript/keyword'}], [array, [undefined]], [fn, () => null], [inherited, Object.create({})], [nullPrototype, Object.create(null)]]) {const out = a.invoke(name, [value]);try {assert.deepEqual(out && typeof out === 'object' ? a.readString(out) : out, oracle(reference), name);} finally {a.release(out);}}
    for (const value of [brand, plain, branded, array, fn, inherited, nullPrototype]) a.release(value);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test('Given effectful source arguments, when a predicate consumes its first value and ignores extras, then each argument executes exactly once in order', () => {
  for (const [, name, oracle] of cases) {
    const unit = units.get(name), a = instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(unit.program, runtime)));a.auto(1);const trace = a.sourceArray([]), out = a.invoke('predicate-effects', [trace]), answer = a.get(out, 0), log = a.get(out, 1);
    assert.deepEqual(answer && typeof answer === 'object' ? a.readString(answer) : answer, oracle(undefined));assert(a.keyEqual(trace, log));assert.equal(a.length(log), 2);for (let i = 0; i < 2; i++) {const value = a.get(log, i);assert.equal(a.readNumber(value), i);a.release(value);}assert.deepEqual(unit.effects([]), [oracle(undefined), [0, 1]]);
    for (const value of [trace, out, answer, log]) a.release(value);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test('Given exact path boundaries and fixed random UTF16 names, when path and trust predicates execute, then JS and WASM preserve every original string decision', () => {
  let state = 0x413db27a;const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const values = ['.', '..', '...', 'a..', '..a', 'a//..//b', 'a\\\\..\\b', win32.resolve(win32.sep, 'server', 'file'), 'C:relative', win32.resolve('c:', 'absolute'), win32.resolve('Z:', 'absolute'), ':relative', 'x/stdlib/core/transient.eli', 'x/runtime/core/transient.mjs', 'x/runtime/core/transient.elix', 'x/stdlib/core/data.eli\n', 'stdlib/core/transient.eli\r\n', 'stdlib/core/transient.eli\u2028', '\ud800/stdlib/core/transient.eli', '😀/runtime/core/transient.mjs'];
  for (let i = 0; i < 256; i++) {let text = '';for (let j = 0; j < next() % 40; j++) text += String.fromCharCode(next() % 65536);values.push(text, text + '/' + ['stdlib/core/data.eli', 'runtime/core/transient.mjs', '..', 'stdlib/core/transient.eli'][next() % 4]);}
  for (const name of ['safe-relative-path-p', 'canonical-transient-family', 'trusted-core-source-p']) {const unit = units.get(name), oracle = cases.find(row => row[1] === name)[2], a = instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(unit.program, runtime)));a.auto(1);
    for (const value of values) {const input = a.string(value), out = a.invoke(name, [input]);try {assert.deepEqual(out && typeof out === 'object' ? a.readString(out) : out, oracle(value), name + ': ' + JSON.stringify(value));assert.deepEqual(unit.fn(value), oracle(value));} finally {a.release(input);a.release(out);}}
    a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test('Given all thirteen compiler sources, when public Seed and three full JS generations compile them, then the complete source artifacts reach a fixed point', async () => {
  const files = (await readdir('bootstrap/compiler')).filter(file => file.endsWith('.eli')).sort();assert.equal(files.length, 13);let compiler = backend.compiler;const previous = new Map();
  const seedOutput = resolve(directory, 'public-seed');await mkdir(seedOutput);
  for (const file of files) previous.set(file, await readFile(resolve(directory, 'bootstrap', file.replace(/\.eli$/, '.mjs')), 'utf8'));
  for (const name of ['compiler', 'ir', 'project', 'transient-analysis']) {const output = resolve(seedOutput, name + '.mjs'), result = spawnSync(resolve('bin/eliscript-seed'), ['--source-map', '--output', output, resolve('bootstrap/compiler/' + name + '.eli')], {encoding: 'utf8', timeout: 30000});assert.equal(result.status, 0, result.stderr);assert.equal(await readFile(output, 'utf8'), previous.get(name + '.eli'));}
  for (let generation = 2; generation <= 3; generation++) {
    const output = resolve(directory, 'g' + generation);await mkdir(output);
    for (const file of files) {const path = resolve('bootstrap/compiler/' + file), source = await readFile(path, 'utf8'), program = compiler.compile_ir_string(source, path), frozen = JSON.stringify(program), generated = file.replace(/\.eli$/, '.mjs'), emitted = compiler.emit_ir_string_with_source_map(program, source, generated, relative(output, path)), javascript = emitted.javascript + '//# sourceMappingURL=' + generated + '.map\n';assert.equal(JSON.stringify(program), frozen);assert.equal(javascript, previous.get(file), 'full generation ' + generation + ': ' + file);await writeFile(resolve(output, generated), javascript);await writeFile(resolve(output, generated + '.map'), emitted.sourceMap);}
    compiler = await import(pathToFileURL(resolve(output, 'compiler.mjs')).href);
  }
}, 30000);
