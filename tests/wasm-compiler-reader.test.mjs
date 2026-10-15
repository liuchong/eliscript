import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

let directory, backend, modules, runtime, reference, bytes, diagnosticFailure;
const readerExports = ['read-string', 'read-token', 'reference-read-token', 'skip-space-and-comments',
  'reference-skip-space-and-comments', 'whitespace-code-p', 'reference-whitespace-code-p',
  'delimiter-code-p', 'reference-delimiter-code-p'];
const originalFailure = diagnostic => {
  const p = diagnostic.location.start;
  const error = new Error(`${diagnostic.location.file}:${p.line}:${p.column}: ${diagnostic.message}`);
  error.eliscriptDiagnostic = diagnostic;
  throw error;
};
const flatten = nodes => nodes.flatMap(node => node.kind === 'module-declaration' ? flatten(node.children) : [node]);
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-whole-reader-'));
  backend = await buildBackends({ outputRoot: directory });
  modules = await Promise.all(['syntax', 'reader'].map(async name => ({
    id: name + '.mjs',
    program: backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/' + name + '.eli', 'utf8'), name + '.eli'),
  })));
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  reference = await import(pathToFileURL(resolve(directory, 'bootstrap/reader.mjs')).href);
  modules.push({ id: 'entry.mjs', program: backend.compiler.compile_ir_string(`
    (import "./reader.mjs" ${readerExports.join(' ')})
    (defun read-observed (source filename)
      (try (js-array t (read-string source filename))
        (catch error (js-array false error))))
    (export ${readerExports.join(' ')} read-observed)`, 'reader-entry.eli') });
  const reader = modules.find(module => module.id === 'reader.mjs').program;
  const fail = flatten(reader.body).find(node => node.kind === 'variable-declaration' && node.value === 'fail');
  assert(fail);
  const exported = flatten(backend.compiler.compile_ir_string('(defconst fail nil) (export fail)', 'diagnostic-export.eli').body).filter(node => node.kind === 'export-declaration');
  const helper = { ...reader, body: [fail, ...exported] };
  diagnosticFailure = (await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(helper)).toString('base64'))).fail;
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function artifact() {
  if (bytes) return bytes;
  const snapshot = JSON.stringify(modules);
  bytes = Uint8Array.from(backend.managed.emit_managed_project_wasm(modules, 'entry.mjs', runtime));
  assert.equal(JSON.stringify(modules), snapshot);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  return bytes;
}
function decode(a, value) {
  if (value?.kind === 4) return a.readNumber(value);
  if (value?.kind === 5) return a.readString(value);
  if (value?.kind === 14) {
    const out = [];
    for (let i = 0; i < a.length(value); i++) {
      const child = a.get(value, i);
      try { out.push(decode(a, child)); } finally { a.release(child); }
    }
    return out;
  }
  if (value?.kind === 13) {
    const out = {}, keys = a.objectKeys(value);
    try {
      for (let i = 0; i < a.length(keys); i++) {
        const key = a.get(keys, i), child = a.objectGet(value, key);
        try { out[a.readString(key)] = decode(a, child); } finally { a.release(key); a.release(child); }
      }
    } finally { a.release(keys); }
    return out;
  }
  return value;
}
function property(a, object, name) {
  const key = a.string(name);
  try { return a.objectGet(object, key); } finally { a.release(key); }
}
function invoke(a, source, filename) {
  const input = a.string(source), file = typeof filename === 'string' ? a.string(filename) : filename;
  try {
    const observed = a.invoke('read_observed', [input, file]);
    const passed = a.get(observed, 0), value = a.get(observed, 1);
    try {
      if (passed) return { forms: decode(a, value) };
      const message = property(a, value, 'message'), diagnostic = property(a, value, 'eliscriptDiagnostic');
      try { return { message: a.readString(message), diagnostic: decode(a, diagnostic) }; }
      finally { a.release(message); a.release(diagnostic); }
    } finally { a.release(value); a.release(observed); }
  } finally { a.release(input); a.release(file); }
}
function expected(source, filename) {
  try { return { forms: reference.read_string(source, filename) }; }
  catch (error) { return { message: error.message, diagnostic: error.eliscriptDiagnostic }; }
}
function finish(a) { a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0); }

test('reader diagnostics preserve original template ToString hint and ordered reads independently of mutable Array.join', () => {
  function observe(fn, mode) {
    const events = [], sentinel = {}, point = {};
    const convert = (name, value) => ({ [Symbol.toPrimitive](hint) {
      events.push(name + ':' + hint);
      if (mode === 'throw-' + name) throw sentinel;
      return mode === 'symbol-' + name ? Symbol(name) : value;
    } });
    for (const [name, value] of [['line', 3], ['column', 4]]) Object.defineProperty(point, name, {
      get() { events.push('read.' + name); return convert(name, value); },
    });
    const location = {};
    Object.defineProperties(location, {
      start: { get() { events.push('read.start'); return point; } },
      file: { get() { events.push('read.file'); return convert('file', 'a.eli'); } },
    });
    const diagnostic = {};
    Object.defineProperties(diagnostic, {
      location: { get() { events.push('read.location'); return location; } },
      message: { get() { events.push('read.message'); return convert('message', 'bad'); } },
    });
    let caught;
    try { fn(diagnostic); } catch (error) { caught = error; }
    return { events, result: caught === sentinel ? 'sentinel' : caught.constructor.name,
      message: caught.message, attached: caught.eliscriptDiagnostic === diagnostic };
  }
  assert.equal(diagnosticFailure.length, 1);
  assert.equal(Object.hasOwn(diagnosticFailure, 'prototype'), false);
  for (const mode of ['normal', ...['file', 'line', 'column', 'message'].flatMap(field => ['throw-' + field, 'symbol-' + field])]) {
    assert.deepEqual(observe(diagnosticFailure, mode), observe(originalFailure, mode), mode);
  }
  for (const file of [undefined, null, false, -0, NaN, Infinity, 1n, '', '\ud800😀']) {
    const diagnostic = { location: { file, start: { line: 1, column: 2 } }, message: undefined };
    let expected, actual;
    try { originalFailure(diagnostic); } catch (error) { expected = error; }
    try { diagnosticFailure(diagnostic); } catch (error) { actual = error; }
    assert.equal(actual.message, expected.message);
    assert.equal(actual.eliscriptDiagnostic, diagnostic);
  }
  const saved = Array.prototype.join;
  try {
    Array.prototype.join = () => { throw new Error('join must not format primitive diagnostic fields'); };
    const diagnostic = { location: { file: null, start: { line: undefined, column: false } }, message: undefined };
    let expected, actual;
    try { originalFailure(diagnostic); } catch (error) { expected = error; }
    try { diagnosticFailure(diagnostic); } catch (error) { actual = error; }
    assert.equal(actual.message, expected.message);
    assert.equal(actual.message, 'null:undefined:false: undefined');
  } finally { Array.prototype.join = saved; }
});

test('reader diagnostics capture the live Error constructor before converting message fields and preserve thrown identity', () => {
  function observe(fn) {
    const events = [], thrown = {}, diagnostic = { location: { start: { line: 1, column: 2 } }, message: 'bad' };
    Object.defineProperty(diagnostic.location, 'file', { get() { events.push('file'); return 'input.eli'; } });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Error');
    function Constructor(message) { events.push(['construct', new.target === Constructor, message]); return thrown; }
    Object.defineProperty(globalThis, 'Error', { configurable: true, get() { events.push('Error'); return Constructor; } });
    let actual;
    try { fn(diagnostic); } catch (error) { actual = error; }
    finally { Object.defineProperty(globalThis, 'Error', descriptor); }
    assert.equal(actual, thrown);
    assert.equal(thrown.eliscriptDiagnostic, diagnostic);
    return events;
  }
  assert.deepEqual(observe(diagnosticFailure), observe(originalFailure));
  const events = observe(diagnosticFailure);
  assert.deepEqual(events.slice(0, 2), ['Error', 'file']);
  assert.equal(events[2][0], 'construct');
  assert.equal(events[2][2], 'input.eli:1:2: bad');
});

test('complete unchanged reader and syntax modules compile together into zero-import WASM and parse actual source', () => {
  const a = instantiateManagedRuntime(artifact(), { maxSlots: 8192, initialBytes: 1048576 }); a.auto(1);
  for (const source of ['', ' ;😀 comment\n', 'nil t false undefined', '0 -0 1.25 -2e3 +.5 1e-2',
    'foo :bar :ns/name 😀 \ud800x', '() (a [1 2] {:x 3} #{a b})', '#queue ;comment\n [1 2]',
    "'x `x ,x ,@x #'fn", '"a\\n😀\\uD800"', '(module demo (defun square (x) (* x x)) (export square))']) {
    assert.deepEqual(invoke(a, source, '输入😀.eli'), expected(source, '输入😀.eli'), source);
    a.collect(); assert.equal(a.stats().frameDepth, 0);
  }
  finish(a);
});

test('whole reader preserves original structured source diagnostics and recovers after malformed input under GC', () => {
  const a = instantiateManagedRuntime(artifact(), { maxSlots: 8192, initialBytes: 1048576 }); a.auto(1);
  for (const source of ['(', '[1)', '{:x}', '#x', '#', ':', ':a/', ':a/b/c', "'", ',@', '"unterminated', '\n😀\n)']) {
    for (const filename of [undefined, null, '', 'bad.eli']) assert.deepEqual(invoke(a, source, filename), expected(source, filename), source);
  }
  assert.deepEqual(invoke(a, '(ok 1)', 'recovered.eli'), expected('(ok 1)', 'recovered.eli'));
  finish(a);
});

test('whole reader retains JSON SyntaxError identity inside the language while engine-specific native message wording remains observable', () => {
  const a = instantiateManagedRuntime(artifact(), { maxSlots: 8192, initialBytes: 1048576 }); a.auto(1);
  for (const source of ['"\\uZZZZ"', '"\\x41"', '"a\nb"', '"\\u12"']) {
    let original;
    try { reference.read_string(source, 'bad-json.eli'); } catch (error) { original = error; }
    assert(original instanceof SyntaxError);
    const input = a.string(source), file = a.string('bad-json.eli'), out = a.invoke('read_observed', [input, file]);
    assert.equal(a.get(out, 0), false);
    const error = a.get(out, 1), name = property(a, error, 'name'), message = property(a, error, 'message');
    const diagnostic = property(a, error, 'eliscriptDiagnostic');
    assert.equal(a.readString(name), original.name);
    assert.equal(typeof original.message, 'string'); assert(original.message.length > 0);
    assert(a.readString(message).length > 0);
    assert.equal(original.eliscriptDiagnostic, undefined);
    assert.equal(decode(a, diagnostic).code, 'ELI-RT0003');
    assert.equal(decode(a, diagnostic).phase, 'runtime');
    for (const root of [input, file, out, error, name, message, diagnostic]) a.release(root);
    a.collect(); assert.equal(a.stats().frameDepth, 0);
  }
  finish(a);
});

test('uncaught exported JSON failures retain the existing host bridge diagnostic rather than being reported as native host SyntaxError', () => {
  const a = instantiateManagedRuntime(artifact());
  const source = a.string('"\\uZZZZ"'), file = a.string('bad-json.eli');
  assert.throws(() => a.invoke('read_string', [source, file]), error =>
    error instanceof Error && !(error instanceof SyntaxError) && error.eliscriptDiagnostic?.code === 'ELI-RT0003');
  assert.equal(a.stats().frameDepth, 0);
  a.release(source); a.release(file);
  assert.deepEqual(invoke(a, 'ok', 'after-error.eli'), expected('ok', 'after-error.eli'));
  finish(a);
});

function state(a, source, fields = {}) {
  const input = { source, index: 0, offset: 0, line: 1, column: 1, ...fields };
  const boxed = Object.fromEntries(Object.entries(input).map(([name, value]) => [name,
    typeof value === 'string' ? a.string(value) : a.number(value)]));
  try { return a.sourceObject(boxed); } finally { Object.values(boxed).forEach(value => a.release(value)); }
}
test('all nine original reader exports execute unchanged through the complete linked modules', () => {
  const a = instantiateManagedRuntime(artifact()); a.auto(1);
  for (const name of readerExports.filter(name => name.endsWith('-code-p'))) {
    for (const code of [undefined, null, false, 0, 9, 10, 12, 13, 32, 34, 35, 39, 40, 41, 44, 59, 91, 93, 96, 123, 125, 128512]) {
      const input = typeof code === 'number' ? a.number(code) : code;
      assert.equal(a.invoke(name.replaceAll('-', '_'), [input]), reference[name.replaceAll('-', '_')](code));
      a.release(input);
    }
  }
  for (const name of ['read-token', 'reference-read-token', 'skip-space-and-comments', 'reference-skip-space-and-comments']) {
    for (const source of ['', 'abc ', '😀中\ud800 ', ' \t;😀\nabc', ';end']) {
      const input = state(a, source), before = { source, index: 0, offset: 0, line: 1, column: 1 };
      const startIndex = a.number(0), start = a.sourceObject({ index: startIndex }); a.release(startIndex);
      const isToken = name.includes('token'), expectedValue = reference[name.replaceAll('-', '_')](before, { index: 0 });
      const result = a.invoke(name.replaceAll('-', '_'), isToken ? [input, start] : [input]);
      assert.deepEqual(decode(a, result), expectedValue);
      assert.deepEqual(decode(a, input), before);
      for (const value of [input, start, result]) a.release(value);
    }
  }
  finish(a);
});

test('whole reader preserves deterministic nested syntax trees and codepoint spans across random UTF16 source', () => {
  const a = instantiateManagedRuntime(artifact(), { maxSlots: 16384, initialBytes: 1048576 }); a.auto(1);
  let seed = 0x631e902a;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const atoms = ['nil', 'false', 'undefined', '-0', '1e-9', ':ns/key', 'x', '中😀', '\ud800x', '"\\uD800😀"'];
  function form(depth) {
    if (!depth || next() % 3 === 0) return atoms[next() % atoms.length];
    const left = form(depth - 1), right = form(depth - 1);
    switch (next() % 6) {
      case 0: return '(' + left + ' ;😀\n' + right + ')';
      case 1: return '[' + left + '\t' + right + ']';
      case 2: return '{:key ' + left + ' :other ' + right + '}';
      case 3: return '#{' + left + ' ' + right + '}';
      case 4: return '#queue [' + left + ' ' + right + ']';
      default: return "'" + left;
    }
  }
  for (let i = 0; i < 48; i++) {
    const source = '; seed ' + i + '\n' + form(3) + '\n' + form(2);
    assert.deepEqual(invoke(a, source, '随机😀.eli'), expected(source, '随机😀.eli'), source);
    a.collect(); assert.equal(a.stats().frameDepth, 0);
  }
  assert(a.stats().collections > 100);
  finish(a);
});

test('whole reader capacity failures preserve caller roots and frames and permit later successful reads', () => {
  const a = instantiateManagedRuntime(artifact(), { maxSlots: 256, initialBytes: 32768, maxBytes: 262144 }); a.auto(1);
  const input = a.string('(' + 'x '.repeat(256) + ')'), file = a.string('capacity.eli'), held = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, held);
  assert.throws(() => a.invoke('read_string', [input, file]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
  assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  a.release(input); a.release(file); a.collect();
  assert.deepEqual(invoke(a, '(ok)', 'recovered.eli'), expected('(ok)', 'recovered.eli'));
  a.leaveFrame(frame); a.release(held); finish(a);
});

test('public Seed and three complete compiler generations retain byte-identical JavaScript and maps after the reader diagnostic migration', async () => {
  const files = (await readdir('bootstrap/compiler')).filter(name => name.endsWith('.eli')).sort();
  assert.equal(files.length, 13);
  const seedDirectory = resolve(directory, 'seed'); await mkdir(seedDirectory);
  const seedFile = resolve(seedDirectory, 'reader.mjs');
  const seed = spawnSync(resolve('bin/eliscript-seed'), ['--source-map', '--output', seedFile, resolve('bootstrap/compiler/reader.eli')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(seed.status, 0, seed.stderr);
  assert.equal(await readFile(seedFile, 'utf8'), await readFile(resolve(directory, 'bootstrap/reader.mjs'), 'utf8'));
  let compiler = backend.compiler, previous;
  for (let generation = 1; generation <= 3; generation++) {
    const output = resolve(directory, 'generation-' + generation); await mkdir(output);
    const emitted = new Map();
    for (const name of files) {
      const path = resolve('bootstrap/compiler', name), source = await readFile(path, 'utf8'), filename = name.replace(/\.eli$/, '.mjs');
      // A fixed source-map coordinate isolates compiler identity from output-directory spelling.
      const program = compiler.compile_ir_string(source, path), snapshot = JSON.stringify(program);
      const result = compiler.emit_ir_string_with_source_map(program, source, filename, relative(resolve(directory, 'fixed'), path));
      assert.equal(JSON.stringify(program), snapshot);
      const javascript = result.javascript + '//# sourceMappingURL=' + filename + '.map\n';
      emitted.set(name, { javascript, map: result.sourceMap });
      if (previous) assert.deepEqual(emitted.get(name), previous.get(name), 'generation ' + generation + ': ' + name);
      await writeFile(resolve(output, filename), javascript); await writeFile(resolve(output, filename + '.map'), result.sourceMap);
    }
    previous = emitted; compiler = await import(pathToFileURL(resolve(output, 'compiler.mjs')).href);
  }
}, 30000);

test('independent Node executes identical zero-import whole Reader bytes against its native JS compiler module', async () => {
  const file = resolve(directory, 'whole-reader.wasm'); await writeFile(file, artifact());
  const corpus = ['', 'nil t false undefined', '(a [1 -0] {:x "😀\\ud800"} #{x y})', '#queue [1 2]', ';😀\nx', '(', '{:x}', '#x', ':a/', '\n😀\n)'];
  const script = [
    "import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';",
    'const {instantiateManagedRuntime}=await import(process.argv[1]);',
    'const reference=await import(process.argv[2]);const bytes=readFileSync(process.argv[3]);',
    'assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',
    decode.toString(), property.toString(), invoke.toString(), expected.toString(),
    'const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:1048576});a.auto(1);',
    'for(const source of '+JSON.stringify(corpus)+'){assert.deepEqual(invoke(a,source,"node😀.eli"),expected(source,"node😀.eli"),source);a.collect();assert.equal(a.stats().frameDepth,0);}',
    'a.closeModule();a.collect();assert.equal(a.live(),0);',
  ].join('\n');
  const child = spawnSync('node', ['--input-type=module', '-e', script,
    pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,
    pathToFileURL(resolve(directory, 'bootstrap/reader.mjs')).href, file], {encoding:'utf8',timeout:30000});
  assert.equal(child.status, 0, child.stderr);
});

test('actual template conversion traps unwind complete Reader frames without swallowing traps as source errors', async () => {
  const text = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const first = text.indexOf('  (defun value-source-to-string '), last = text.indexOf('  (defun heap-source-primitive ', first);
  assert(first >= 0 && last > first);
  const injected = backend.compiler.compile_ir_string(text.slice(0, first) +
    '  (defun value-source-to-string (heap value) (load-u32 4294967295))\n' + text.slice(last), 'reader-trap.eli');
  const bytes = Uint8Array.from(backend.managed.emit_managed_project_wasm(modules, 'entry.mjs', injected));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const a = instantiateManagedRuntime(bytes), input = a.string(')'), file = a.string('trap.eli'), held = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, held);
  assert.throws(() => a.invoke('read_observed', [input, file]), WebAssembly.RuntimeError);
  assert.equal(a.stats().frameDepth, 1); assert(Object.is(a.readNumber(held), -0));
  a.leaveFrame(frame); for (const value of [input, file, held]) a.release(value);
  assert.deepEqual(invoke(a, 'ok', 'after-trap.eli'), expected('ok', 'after-trap.eli'));
  finish(a);
});
