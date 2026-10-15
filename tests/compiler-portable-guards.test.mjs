import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

const original = (operation, onError) => { try { return operation(); } catch (error) { return onError(error.message); } };
const flatten = nodes => nodes.flatMap(node => node.kind === 'module-declaration' ? flatten(node.children) : [node]);
let directory, backend, runtime;
const programs = [];
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-portable-guards-'));
  backend = await buildBackends({ outputRoot: directory });
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  for (const file of ['analyzer', 'expander']) {
    const ir = backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/' + file + '.eli', 'utf8'), file + '.eli');
    const helper = flatten(ir.body).find(node => node.kind === 'variable-declaration' && node.value === 'guard');
    assert(helper);
    const support = flatten(backend.compiler.compile_ir_string(`
      (defconst guard nil)
      (defun guard-value (value) (lambda () value))
      (defun guard-throw (value) (lambda () (throw value)))
      (defun guard-handler (trace answer throws)
        (lambda (message) (js-call trace :push message) (if throws (throw answer) answer)))
      (export guard guard-value guard-throw guard-handler)`, 'guard-adapter.eli').body);
    const program = { ...ir, body: [structuredClone(helper), ...support.filter(node => node.value !== 'guard')] };
    const reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
    programs.push({ file, program, reference });
  }
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('compiler guards retain arrow identity, call this, exact values and synchronous return behavior', async () => {
  for (const { reference: { guard } } of programs) {
    assert.equal(guard.length, 2);
    assert.equal(Object.hasOwn(guard, 'prototype'), false);
    assert.throws(() => Reflect.construct(String, [], guard), TypeError);
    for (const value of [undefined, null, false, true, -0, NaN, '', {}, [], Symbol('value')]) {
      let calls = 0;
      assert(Object.is(guard(function () { assert.equal(this, undefined); calls++; return value; }, () => assert.fail('handler must not run')), value));
      assert.equal(calls, 1);
    }
    const promise = Promise.resolve('value');
    assert.equal(guard(() => promise, () => assert.fail()), promise);
    const rejection = {}, pending = Promise.reject(rejection);
    assert.equal(guard(() => pending, () => assert.fail('async rejection stays asynchronous')), pending);
    await assert.rejects(pending, error => error === rejection);
  }
});

test('compiler guards preserve one message read and do not recatch handler or getter failures', () => {
  const observe = (guard, mode) => {
    const trace = [], sentinel = {}, answer = {};
    const error = { get message() { trace.push('message'); if (mode === 'getter') throw sentinel; return answer; } };
    let result, thrown;
    try {
      result = guard(function () { trace.push('operation'); assert.equal(this, undefined); throw error; }, function (message) {
        trace.push('handler'); assert.equal(this, undefined); assert.equal(message, answer);
        if (mode === 'handler') throw sentinel;
        return answer;
      });
    } catch (value) { thrown = value === sentinel ? 'sentinel' : 'unexpected'; }
    return { trace, returnedAnswer: result === answer, thrown };
  };
  for (const { reference: { guard } } of programs) {
    for (const mode of ['normal', 'getter', 'handler']) assert.deepEqual(observe(guard, mode), observe(original, mode));
    for (const value of [null, undefined]) assert.throws(() => guard(() => { throw value; }, () => assert.fail()), TypeError);
    for (const value of [false, true, 3, '', Symbol('x')]) assert.equal(guard(() => { throw value; }, message => message), undefined);
  }
});

test('compiler guards catch source exceptions inside zero-import WASM while preserving returned and thrown identity', () => {
  for (const { file, program } of programs) {
    const saved = JSON.stringify(program), bytes = Uint8Array.from(backend.managed.emit_managed_wasm(program, runtime));
    assert.equal(JSON.stringify(program), saved);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
    const a = instantiateManagedRuntime(bytes); a.auto(1);
    const trace = a.sourceArray([]), answer = a.sourceObject({}), message = a.string('text'), error = a.sourceObject({ message });
    const returns = a.invoke('guard-value', [answer]), throws = a.invoke('guard-throw', [error]);
    const handles = [trace, answer, message, error, returns, throws];
    for (const throwsAgain of [false, true]) {
      const handler = a.invoke('guard-handler', [trace, answer, throwsAgain]); handles.push(handler);
      const normal = a.invoke('guard', [returns, handler]); handles.push(normal);
      assert(a.keyEqual(normal, answer));
      assert.equal(a.length(trace), throwsAgain ? 1 : 0, file);
      let result;
      try { result = a.invoke('guard', [throws, handler]); assert.equal(throwsAgain, false); }
      catch (value) { assert.equal(throwsAgain, true); result = value; }
      handles.push(result); assert(a.keyEqual(result, answer));
      const recorded = a.get(trace, throwsAgain ? 1 : 0); handles.push(recorded);
      assert(a.keyEqual(recorded, message));
      assert.equal(a.stats().frameDepth, 0);
    }
    handles.forEach(value => a.release(value)); a.closeModule(); a.collect();
    assert.equal(a.live(), 0, file);
  }
});
