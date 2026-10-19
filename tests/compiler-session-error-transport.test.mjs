import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {independentCompilerResources} from '../tools/backends/compiler-build.mjs';
import {createCompilerSession} from '../tools/backends/compiler-session.mjs';

// This source is a small session-protocol fixture, not a compiler. The complete
// compiler-session-tools suite remains responsible for actual compiler behavior.
const source = `(defconst ArrayConstructor (js* "Array"))
 (defun compiler_session_new () (js-object :requests 0 :stackReads 0 :closed false))
 (defun compiler_session_close (state) (put state :closed t) nil)
 (defun compiler_session_request (state request-json)
  (let* ((request (JSON/parse request-json)) (operation (get request :operation)))
   (put state :requests (1+ (get state :requests)))
   (cond
    ((= operation "aggregate")
     (let* ((diagnostic (js-object :code "ELI-H0001" :phase "compiler-session" :message "aggregate boundary"))
            (child (new globalThis.TypeError "shared child" (js-object :cause -0.0)))
            (inner (new globalThis.AggregateError (js-array child) "inner" (js-object :cause child)))
            (failure (new globalThis.AggregateError (js-array child child inner undefined false) "outer" (js-object :cause child))))
      (put child :stack "TypeError: shared child\\n    at original.eli:3:7")
      (put child :eliscriptDiagnostic diagnostic) (put child :code "ELI-H0001")
      (put child :diagnostics (js-array diagnostic))
      (put child :macroOrigins (js-array (js-object :macroName "twice" :file "macro.eli")))
      (put child :eliscriptFrames (js-array (js-object :function "compile" :instruction 7)))
      (put child :eliscriptSourceFrames (js-array (js-object :file "original.eli" :line 3 :column 7)))
      (when (= (get request :undefinedCause false) t) (put child :cause undefined))
      (throw failure)))
    ((= operation "false") (throw false))
    ((= operation "undefined") (throw undefined))
    ((= operation "stack-getter")
     (let ((error (new globalThis.TypeError "stack getter boundary")))
      (put error :stack "")
      (Object/defineProperty error "stack" (js-object :configurable t :get (lambda ()
       (put state :stackReads (1+ (get state :stackReads)))
       (cond ((= (get request :mode) "false") (throw false))
             ((= (get request :mode) "undefined") (throw undefined))
             ((= (get request :mode) "error") (throw (new globalThis.RangeError "secondary stack getter")))
             (t "TypeError: supplied getter stack")))))
      (throw error)))
    ((= operation "recover")
     ;; Cross the unchanged session collection threshold with short-lived
     ;; source arrays; the previous thrown graph already belongs to its caller.
     (let ((index 0)) (while (< index 12) (new ArrayConstructor 2048) (setq index (1+ index))))
     (JSON/stringify (js-object :ok t :value (+ (get request :value) 1))))
    (t (JSON/stringify (js-object :requests (get state :requests) :stackReads (get state :stackReads)))))))
 (export compiler_session_new compiler_session_request compiler_session_close)`;

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const resources = independentCompilerResources();
let directory, compiler, wasm, lowered, library, nativeDebug;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-session-error-transport-'));
  const backend = await buildBackends({outputRoot: directory});
  const program = backend.compiler.compile_ir_string(source, 'session-error-protocol.eli');
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  compiler = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
  lowered = backend.managed.lower_managed_program(program, runtime, true);
  const bytes = backend.wasm.emit_typed_memory_wasm(lowered.typed, resources.memory);
  wasm = Uint8Array.from(backend.wasm.append_metadata_section(bytes, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)), []);
  if (target) {
    const artifact = backend.native.emit_typed_native_memory_artifact(lowered.typed, target, {format: 'library'});
    nativeDebug = artifact.debug;
    library = resolve(directory, 'session-error-protocol.' + (target === 'arm64-linux' ? 'so' : 'dylib'));
    await writeFile(library, Uint8Array.from(artifact.bytes));
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

async function open(host) {
  const options = {...resources.budget, auto: resources.auto};
  if (host === 'wasm') return createCompilerSession({host, bytes: wasm, memory: resources.memory, options});
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  try {
    WebAssembly.Module = function () {throw Error('native session constructed a WASM module');};
    WebAssembly.Instance = function () {throw Error('native session constructed a WASM instance');};
    return await createCompilerSession({host, path: library, descriptor: {...lowered, debug: nativeDebug},
      memory: resources.memory, options: {...options, nativeTarget: target, debug: nativeDebug, trapSites: nativeDebug.trapSites}});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
}
function caught(run) {
  try {run();} catch (error) {return error;}
  assert.fail('expected a source error from the real session driver');
}
function compareGraph(actual, expected) {
  assert(actual instanceof AggregateError, 'aggregate transport must produce an Error graph, not a raw managed handle');
  assert.equal(actual.name, expected.name);assert.equal(actual.message, expected.message);
  assert.equal(actual.errors.length, 5);assert(actual.cause instanceof TypeError);
  assert(actual.errors[2] instanceof AggregateError);assert.equal(actual.errors[2].message, 'inner');
  assert.equal(actual.errors[0], actual.cause);assert.equal(actual.errors[1], actual.cause);
  assert.equal(actual.errors[2].cause, actual.cause);assert.equal(actual.errors[2].errors[0], actual.cause);
  assert.equal(actual.errors[3], undefined);assert.equal(actual.errors[4], false);
  for (const key of ['cause', 'errors']) {
    const descriptor = Object.getOwnPropertyDescriptor(actual, key), reference = Object.getOwnPropertyDescriptor(expected, key);
    assert.equal(descriptor.writable, reference.writable);assert.equal(descriptor.enumerable, reference.enumerable);assert.equal(descriptor.configurable, reference.configurable);
  }
  assert.equal(Object.hasOwn(actual.cause, 'cause'), true);assert(Object.is(actual.cause.cause, expected.cause.cause));
  assert.equal(actual.cause.stack, expected.cause.stack);
  for (const key of ['code', 'eliscriptDiagnostic', 'diagnostics', 'macroOrigins', 'eliscriptFrames', 'eliscriptSourceFrames'])
    assert.deepEqual(actual.cause[key], expected.cause[key], key);
  assert.equal(actual.cause.diagnostics[0], actual.cause.eliscriptDiagnostic);
  // The outer/inner source errors have no represented generated stack. Their
  // engine-specific host stack text is deliberately not an equality oracle.
}
async function withPair(host, run) {
  const reference = await createCompilerSession({host: 'javascript', compiler});
  let session;
  try {session = await open(host);await run(session, reference);}
  finally {try {session?.close();} finally {reference.close();}}
  assert.equal(session.closed, true);session.close();
  assert.throws(() => session.request({operation: 'status'}), /closed/);
}

for (const host of ['wasm', 'native']) {
  const hostTest = test.skipIf(host === 'native' && !target);
  hostTest(host + ' real session transports original AggregateError graphs and primitive throws and recovers after collection', () => withPair(host, (session, reference) => {
    const retained = [];
    for (const undefinedCause of [false, true, false]) {
      const request = {operation: 'aggregate', undefinedCause};
      const expected = caught(() => reference.request(request)), actual = caught(() => session.request(request));
      compareGraph(actual, expected);retained.push([actual, expected]);
      const recovery = {operation: 'recover', value: 7};assert.deepEqual(session.request(recovery), reference.request(recovery));
      for (const [previous, oracle] of retained) compareGraph(previous, oracle);
    }
    assert.notEqual(retained[0][0], retained[2][0]);assert.notEqual(retained[0][0].cause, retained[2][0].cause);
    for (const [operation, value] of [['false', false], ['undefined', undefined]]) {
      assert.equal(caught(() => reference.request({operation})), value);
      assert.equal(caught(() => session.request({operation})), value);
      const recovery = {operation: 'recover', value: 9};assert.deepEqual(session.request(recovery), reference.request(recovery));
    }
    assert.deepEqual(session.request({operation: 'status'}), reference.request({operation: 'status'}));
  }), 30000);

  hostTest(host + ' real session observes represented stack getters without replacing the first source throw on getter failure', () => withPair(host, (session, reference) => {
    const request = {operation: 'stack-getter', mode: 'text'};
    const expected = caught(() => reference.request(request)), actual = caught(() => session.request(request));
    assert(expected instanceof TypeError);assert(actual instanceof TypeError);
    assert.equal(actual.message, expected.message);assert.equal(actual.stack, expected.stack);
    assert.deepEqual(session.request({operation: 'status'}), reference.request({operation: 'status'}));
    for (const mode of ['false', 'undefined', 'error']) {
      const expected = caught(() => reference.request({operation: 'stack-getter', mode}));
      const secondary = caught(() => expected.stack);
      if (mode === 'error') {assert(secondary instanceof RangeError);assert.equal(secondary.message, 'secondary stack getter');}
      else assert.equal(secondary, mode === 'false' ? false : undefined);
      const actual = caught(() => session.request({operation: 'stack-getter', mode}));
      // A failed metadata conversion retains the original source throw under
      // the existing fallback contract; it must never turn into success or the
      // secondary getter throw. Do not read this stack getter a second time.
      assert(actual !== null && typeof actual === 'object');
      if (actual.kind !== 13) {assert.equal(actual.name, 'TypeError');assert.equal(actual.message, expected.message);}
      assert.deepEqual(session.request({operation: 'status'}), reference.request({operation: 'status'}));
      const recovery = {operation: 'recover', value: 11};assert.deepEqual(session.request(recovery), reference.request(recovery));
    }
  }), 30000);
}
