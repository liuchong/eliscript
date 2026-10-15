import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

const helpers = [
  ['symbol', 'fail'], ['source-map', 'fail'], ['ir', 'fail'],
  ['emitter', 'fail'], ['lower', 'fail'], ['expander', 'raise-error'],
];
const flatten = nodes => nodes.flatMap(node => node.kind === 'module-declaration' ? flatten(node.children) : [node]);
const original = message => { throw new Error(message); };
let directory, backend, runtime;
const programs = [];

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-portable-errors-'));
  backend = await buildBackends({ outputRoot: directory });
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  for (const [file, name] of helpers) {
    const ir = backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/' + file + '.eli', 'utf8'), file + '.eli');
    const helper = flatten(ir.body).find(node => node.kind === 'variable-declaration' && node.value === name);
    assert(helper, file);
    const support = flatten(backend.compiler.compile_ir_string(
      '(defconst ' + name + ' nil) ' +
      '(defun invoke-error (&rest args) (apply ' + name + ' args)) ' +
      '(export ' + name + ' invoke-error)', 'error-adapter.eli').body);
    const program = { ...ir, body: [structuredClone(helper), ...support.filter(node => node.value !== name)] };
    const javascript = backend.compiler.emit_ir_string(program);
    const reference = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
    await writeFile(resolve(directory, file + '.mjs'), javascript);
    programs.push({ file, name, program, javascript, reference });
  }
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function capture(fn, args) {
  try { fn(...args); assert.fail('the helper must throw'); }
  catch (error) { return error; }
}

test('compiler error helpers retain the original arrow function identity and Error message contract', () => {
  for (const { name, reference } of programs) {
    const fn = reference[name.replaceAll('-', '_')];
    assert.equal(fn.length, 1);
    assert.equal(Object.hasOwn(fn, 'prototype'), false);
    assert.throws(() => Reflect.construct(String, [], fn), TypeError);
    for (const args of [[], [undefined], [null], [false], [0], [-0], [NaN], [Infinity], [''], ['中😀\ud800'], [1n], [Symbol('x')], ['message', 'ignored']]) {
      const expected = capture(original, args), actual = capture(fn, args);
      assert.equal(Object.getPrototypeOf(actual), Object.getPrototypeOf(expected));
      assert.equal(actual.message, expected.message);
      assert.equal(Object.hasOwn(actual, 'message'), Object.hasOwn(expected, 'message'));
      assert.deepEqual(Object.keys(actual), Object.keys(expected));
      assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'message'), Object.getOwnPropertyDescriptor(expected, 'message'));
    }
  }
});

test('compiler error helpers preserve string-hint conversion, abrupt completion, and live constructor lookup', () => {
  for (const { name, reference } of programs) {
    const fn = reference[name.replaceAll('-', '_')];
    for (const mode of ['primitive', 'ordinary', 'throws', 'invalid']) {
      const observe = operation => {
        const events = [], sentinel = {};
        const value = mode === 'ordinary'
          ? { toString() { events.push('toString'); return 'text'; }, valueOf() { events.push('valueOf'); return 7; } }
          : { [Symbol.toPrimitive](hint) { events.push(hint); if (mode === 'throws') throw sentinel; return mode === 'invalid' ? {} : 'text'; } };
        const result = capture(operation, [value]);
        return { events, thrown: result === sentinel ? 'sentinel' : result.constructor.name, message: result.message };
      };
      assert.deepEqual(observe(fn), observe(original));
    }
    const saved = globalThis.Error, value = {}, calls = [];
    try {
      globalThis.Error = function (...args) { calls.push({ target: new.target, args }); return value; };
      assert.equal(capture(original, ['message', 'ignored']), value);
      const expected = calls.splice(0);
      assert.equal(capture(fn, ['message', 'ignored']), value);
      assert.deepEqual(calls, expected);
      assert.equal(calls.length, 1);
    } finally { globalThis.Error = saved; }
  }
});

test('compiler error helpers lower as existing Eliscript functions instead of host JavaScript algorithms', () => {
  for (const { file, program } of programs) {
    const saved = JSON.stringify(program);
    const bytes = Uint8Array.from(backend.managed.emit_managed_wasm(program, runtime));
    assert.equal(JSON.stringify(program), saved, file);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), [], file);
    const a = instantiateManagedRuntime(bytes);
    a.auto(1);
    for (const input of [undefined, null, false, 0, -0, NaN, Infinity, '', '中😀\ud800']) {
      const value = typeof input === 'number' ? a.number(input) : typeof input === 'string' ? a.string(input) : input;
      let error;
      try { a.invoke('invoke-error', [value]); assert.fail('must throw'); }
      catch (caught) { error = caught; }
      const expected = capture(original, [input]);
      const message = a.string('message'), actual = a.objectGet(error, message);
      assert.equal(actual === undefined ? '' : a.readString(actual), expected.message, file);
      const name = a.string('name'), actualName = a.objectGet(error, name), keys = a.objectKeys(error);
      assert.equal(a.readString(actualName), 'Error');
      assert.equal(a.length(keys), 0, 'Error message stays nonenumerable');
      a.collect();
      if (actual !== undefined) assert.equal(a.readString(actual), expected.message);
      for (const root of [value, error, message, actual, name, actualName, keys]) a.release(root);
      assert.equal(a.stats().frameDepth, 0);
    }
    a.closeModule(); a.collect();
    assert.equal(a.live(), 0, file);
  }
});

test('an independent Node engine executes the same compiler error helpers with original message conversion', () => {
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const helpers = ${JSON.stringify(helpers)};
    const original = ${original.toString()};
    const capture = ${capture.toString()};
    for (const [file, name] of helpers) {
      const module = await import(new URL(file + '.mjs', process.argv[1]));
      const fn = module[name.replaceAll('-', '_')];
      assert.equal(fn.length, 1);
      assert.equal(Object.hasOwn(fn, 'prototype'), false);
      for (const args of [[], [undefined], [null], [false], [-0], [NaN], ['中😀'], [Symbol('x')], [1n], ['text', 'ignored']]) {
        const actual = capture(fn, args), expected = capture(original, args);
        assert.equal(Object.getPrototypeOf(actual), Object.getPrototypeOf(expected));
        assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'message'), Object.getOwnPropertyDescriptor(expected, 'message'));
      }
      let hint;
      const value = { [Symbol.toPrimitive](value) { hint = value; return 'converted'; } };
      assert.equal(capture(fn, [value]).message, 'converted');
      assert.equal(hint, 'string');
    }
  `, pathToFileURL(directory + '/').href], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
});
