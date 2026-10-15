import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory, b, runtime, program, js, javascript;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-empty-bindings-'));
  b = await buildBackends({outputRoot: directory});
  runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-empty-bindings.eli', 'utf8'), 'empty-bindings.eli');
  javascript = b.compiler.emit_ir_string(program); js = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function bytes(p = program, rt = runtime) {const before = JSON.stringify(p), out = Uint8Array.from(b.managed.emit_managed_wasm(p, rt)); assert.equal(JSON.stringify(p), before); assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)), []); return out;}
const box = (a, x) => typeof x === 'number' ? a.number(x) : typeof x === 'string' ? a.string(x) : x;
const read = (a, x) => x && typeof x === 'object' ? x.kind === 4 ? a.readNumber(x) : x.kind === 5 ? a.readString(x) : x : x;
function finish(a, values = []) {for (const value of values) a.release(value); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);}
test('independent Node proves existing nil defaults, parallel and sequential scope, closure mutation and initializer effects', async () => {
  const file = resolve(directory, 'source.mjs'), seed = spawnSync(resolve('bin/eliscript-seed'), ['--output', file, resolve('tests/fixtures/wasm-managed-empty-bindings.eli')], {encoding: 'utf8', timeout: 30000});
  assert.equal(seed.status, 0, seed.stderr); assert.equal(await readFile(file, 'utf8'), javascript);
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';const m=await import(process.argv[1]);assert.equal(m.default_value(),null);assert(Object.is(m.parallel_value(-0),-0));assert.equal(m.sequential_value(9),7);assert(Object.is(m.capture_value(NaN),NaN));const f=m.escape_value();assert.equal(f(null),null);assert.equal(f('😀'),'😀');assert.equal(f(null),'😀');const trace={};assert.deepEqual(m.effect_value(trace),[null,1,2]);assert.deepEqual(trace,{first:1,second:2});`, pathToFileURL(file).href], {encoding: 'utf8', timeout: 30000}); assert.equal(child.status, 0, child.stderr);
});
test('zero-initializer bindings retain nil and scope while exact primitive values survive shared closure cells and collecting GC', () => {
  const a = instantiateManagedRuntime(bytes()); a.auto(1); assert.equal(a.invoke('default-value'), null);
  for (const value of [null, undefined, false, true, 0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE, '', '中😀\ud800']) {
    const input = box(a, value);
    for (const name of ['parallel-value', 'sequential-value', 'capture-value']) {const out = a.invoke(name, [input]); assert(Object.is(read(a, out), js[name.replaceAll('-', '_')](value)), name); a.release(out);}
    a.release(input); a.collect(); assert.equal(a.stats().frameDepth, 0);
  }
  for (const limit of [-1, -0, 0, 1, 2, 17, 31.5]) {const input = a.number(limit), out = a.invoke('loop-value', [input]); assert(Object.is(read(a, out), js.loop_value(limit))); a.release(input); a.release(out);}
  finish(a);
});
test('escaped uninitialized cells are fresh per invocation, preserve aliases and outlive their declaring frames', () => {
  const c = b.compiler.compile_ir_string('(defconst marker 1) (defun factory () (let (x) (lambda (v) (if (eq v nil) x (progn (setq x v) x))))) (defun invoke (f v) (funcall f v)) (export factory invoke)', 'escaped-bindings.eli'), a = instantiateManagedRuntime(bytes(c)); a.auto(1);
  const first = a.invoke('factory'), second = a.invoke('factory'), text = a.string('中😀\ud800'); assert.equal(a.invoke('invoke', [first, null]), null); assert.equal(a.invoke('invoke', [second, null]), null);
  const written = a.invoke('invoke', [first, text]); a.release(written); a.release(text); a.collect();
  const out = a.invoke('invoke', [first, null]); assert.equal(a.readString(out), '中😀\ud800'); assert.equal(a.invoke('invoke', [second, null]), null); finish(a, [first, second, out]);
});
test('empty bindings do not skip, duplicate or reorder initialized siblings', () => {
  const a = instantiateManagedRuntime(bytes()); a.auto(1); const trace = a.sourceObject({}), out = a.invoke('effect-value', [trace]); assert.equal(a.length(out), 3); assert.equal(a.get(out, 0), null);
  for (const [index, key, expected] of [[1, 'first', 1], [2, 'second', 2]]) {const item = a.get(out, index), name = a.string(key), value = a.objectGet(trace, name); assert.equal(a.readNumber(item), expected); assert.equal(a.readNumber(value), expected); for (const x of [item, name, value]) a.release(x);}
  finish(a, [trace, out]);
});
test('malformed binding shape is refused before child lowering with exact Unicode source position and immutable input IR', () => {
  for (const change of [n => n.children = [null], n => n.children.push(n.children[0]), n => n.value = null, n => n.properties = {pattern: {kind: 'unsupported'}}, n => n.kind = 'literal']) {
    const p = b.compiler.compile_ir_string(';中😀\n(defun f () (let ((x 1)) x)) (export f)', 'unicode-bindings.eli'); let binding;
    const walk = n => {if (n && typeof n === 'object') {if (n.kind === 'lexical-binding') binding = n; for (const value of Object.values(n)) walk(value);}}; walk(p); assert(binding); const span = binding.span; change(binding); const before = JSON.stringify(p);
    assert.throws(() => b.managed.emit_managed_wasm(p, runtime), e => e.eliscriptDiagnostic?.code === 'ELI-B0001' && e.eliscriptDiagnostic.phase === 'managed-backend' && e.eliscriptDiagnostic.location.file === 'unicode-bindings.eli' && e.eliscriptDiagnostic.location.start.line === span.line && e.eliscriptDiagnostic.location.start.column === span.column); assert.equal(JSON.stringify(p), before);
  }
});

test('deterministic nested empty bindings preserve observable control and closure semantics during collecting GC', async () => {
  let state = 0x6e0ab137; const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const leaf = ['a', 'b', 'nil', 'false', 't', '0', '-0.0', '"中😀\\ud800"'];
  const expr = depth => {
    if (!depth) return leaf[next() % leaf.length];
    switch (next() % 7) {
      case 0: return `(if ${expr(depth - 1)} ${expr(depth - 1)} ${expr(depth - 1)})`;
      case 1: return `(and ${expr(depth - 1)} ${expr(depth - 1)})`;
      case 2: return `(or ${expr(depth - 1)} ${expr(depth - 1)})`;
      case 3: return `(let (a (b a)) ${expr(depth - 1)})`;
      case 4: return `(let* (a (b a)) ${expr(depth - 1)})`;
      case 5: return `(let (unused) ${expr(depth - 1)})`;
      default: return `(let* (slot (read (lambda () slot))) (setq slot ${expr(depth - 1)}) (funcall read))`;
    }
  };
  const names = Array.from({length: 64}, (_, i) => 'random-' + i), source = names.map(name => `(defun ${name} (a b) ${expr(3)})`).join('\n') + ` (export ${names.join(' ')})`;
  const p = b.compiler.compile_ir_string(source, 'random-empty-bindings.eli'), ref = await import('data:text/javascript;base64,' + Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')), a = instantiateManagedRuntime(bytes(p)); a.auto(1);
  const values = [null, undefined, false, true, -0, 0, NaN, Infinity, -Infinity, Number.MIN_VALUE, '', '中😀\ud800'];
  for (let i = 0; i < 128; i++) {
    const x = values[next() % values.length], y = values[next() % values.length], args = [box(a, x), box(a, y)];
    for (const name of names) {const out = a.invoke(name, args); assert(Object.is(read(a, out), ref[name.replaceAll('-', '_')](x, y)), name); a.release(out); assert.equal(a.stats().frameDepth, 0);}
    for (const value of args) a.release(value); a.collect(); assert.equal(a.live(), 0);
  }
});

test('closure capacity failure preserves outer frames, exact retained values and earlier escaping cells', () => {
  const p = b.compiler.compile_ir_string('(defconst marker 1) (defun factory () (let (x) (lambda (v) (if (eq v nil) x (progn (setq x v) x))))) (defun invoke (f v) (funcall f v)) (export factory invoke)', 'capacity-bindings.eli');
  const a = instantiateManagedRuntime(bytes(p), {maxSlots: 64, initialBytes: 8192, maxBytes: 8192}); a.auto(1);
  const held = a.number(-0), outer = a.frame(1), closures = []; a.frameSet(outer, 0, held); let exhausted = false;
  for (let i = 0; i < 64; i++) {try {closures.push(a.invoke('factory'));} catch (e) {assert.equal(e.eliscriptDiagnostic?.code, 'ELI-RT0002'); exhausted = true; break;} assert.equal(a.stats().frameDepth, 1);}
  assert(exhausted); assert(closures.length > 1); assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  for (const value of closures.slice(1)) a.release(value); a.collect(); assert.equal(a.invoke('invoke', [closures[0], null]), null); a.leaveFrame(outer); finish(a, [held, closures[0]]);
});

test('a true captured-cell allocation trap unwinds only private binding frames and keeps an earlier conversion failure', async () => {
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8'), start = source.indexOf('  (defun value-cell-new '), end = source.indexOf('  (defun ', start + 3); assert(start >= 0 && end > start);
  const injected = b.compiler.compile_ir_string(source.slice(0, start) + '  (defun value-cell-new (heap value) (load-u32 4294967295))\n' + source.slice(end), 'binding-trap.eli');
  const p = b.compiler.compile_ir_string('(defun f (x) (+ x 1) (let* (next (read (lambda () next))) (setq next x) (funcall read))) (export f)', 'captured-bindings.eli'), a = instantiateManagedRuntime(bytes(p, injected)); a.auto(1);
  const held = a.number(-0), bad = a.sourceObject({valueOf: false, toString: false}), outer = a.frame(1); a.frameSet(outer, 0, held);
  assert.throws(() => a.invoke('f', [bad]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003'); assert.equal(a.stats().frameDepth, 1);
  assert.throws(() => a.invoke('f', [held]), WebAssembly.RuntimeError); assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0)); a.leaveFrame(outer); a.release(held); a.release(bad); a.collect(); assert.equal(a.live(), 0);
});

test('Node executes the identical zero-import empty-binding WASM with nil, scope, closures and exact number bits', async () => {
  const file = resolve(directory, 'empty-bindings.wasm'); await writeFile(file, bytes());
  const child = spawnSync('node', ['--input-type=module', '-e', `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const{instantiateManagedRuntime}=await import(process.argv[1]),a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);assert.equal(a.invoke('default-value'),null);for(const x of[-0,NaN,Infinity,-Infinity,Number.MIN_VALUE]){const n=a.number(x);for(const name of['parallel-value','capture-value']){const out=a.invoke(name,[n]);assert(Object.is(a.readNumber(out),x));a.release(out)}const sequential=a.invoke('sequential-value',[n]);assert.equal(a.readNumber(sequential),7);a.release(n);a.release(sequential)}a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`, pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href, file], {encoding: 'utf8', timeout: 30000}); assert.equal(child.status, 0, child.stderr);
});
