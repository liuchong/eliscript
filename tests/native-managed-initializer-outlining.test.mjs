import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {sharedRealmDeclarations, assertSharedRealmOutlining, exerciseSharedRealm} from './helpers/shared-realm-initialization.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const nativeTest = test.skipIf(!target);
const options = {maxSlots: 256, initialBytes: 16384, maxBytes: 1048576, maximumPages: 32, initializeModule: false};
let directory, backend, runtime, fixtureSource, successful;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-initializers-'));
  backend = await buildBackends({outputRoot: directory});
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  fixtureSource = await readFile('tests/fixtures/wasm-managed-module-bindings.eli', 'utf8');
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

async function artifact(name, source, minimumParts = 2) {
  const program = backend.compiler.compile_ir_string(source, name + '.eli');
  const lowered = backend.managed.lower_managed_program(program, runtime, true);
  assert.equal(Object.hasOwn(lowered.descriptor, 'project'), false);
  const parts = lowered.typed.functions.filter(fn => /^__eliscript_module_part_\d+$/.test(fn.name));
  assert(parts.length >= minimumParts, 'ordinary module initializers use private parts');
  assert(parts.every(fn => fn.arity === 1));
  assert(lowered.typed.functions.some(fn => fn.name === '__eliscript_module_body'));
  assert(lowered.descriptor.functions.every(fn => !fn.name.startsWith('__eliscript_module_part_')));
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32});
  const wasm = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)), []);
  const emission = backend.native.emit_typed_native_memory_artifact(lowered.typed, target, {format: 'library'});
  const path = resolve(directory, name + (target === 'arm64-linux' ? '.so' : '.dylib'));
  await writeFile(path, Uint8Array.from(emission.bytes));
  const javascript = backend.compiler.emit_ir_string(program);
  return {lowered, wasm, path, debug: emission.debug,
    reference: 'data:text/javascript;base64,' + Buffer.from(javascript).toString('base64')};
}
async function native(artifact, configuration = options) {
  // Loading the actual shared library must not substitute WASM execution.
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  try {
    WebAssembly.Module = function () {throw Error('native loader constructed a WASM module');};
    WebAssembly.Instance = function () {throw Error('native loader constructed a WASM instance');};
    return await instantiateNativeManagedRuntime(artifact.path, artifact.lowered,
      {...configuration, nativeTarget: target, debug: artifact.debug, trapSites: artifact.debug.trapSites});
  } finally {WebAssembly.Module = Module;WebAssembly.Instance = Instance;}
}
async function eachRuntime(artifact, run, configuration = options) {
  for (const kind of ['wasm', 'native']) {
    const a = kind === 'wasm' ? instantiateManagedRuntime(artifact.wasm, configuration) : await native(artifact, configuration);
    try {await run(a, kind);} finally {try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);} finally {a.close?.();}}
  }
}
function numeric(a, name, args = []) {
  const value = a.invoke(name, args);
  try {return a.readNumber(value);} finally {a.release(value);}
}
function numbers(a, value) {
  return Array.from({length: a.length(value)}, (_, index) => {
    const item = a.get(value, index);
    try {return a.readNumber(item);} finally {a.release(item);}
  });
}
async function rejection(promise) {
  try {await promise;} catch (error) {return error;}
  assert.fail('expected original module initialization failure');
}
function thrown(run) {
  try {run();} catch (error) {return error;}
  assert.fail('expected original module initialization failure');
}

nativeTest('outlined ordinary initializers preserve real JS WASM and native order globals negative zero and GC', async () => {
  successful = await artifact('ordinary-initializers', fixtureSource);
  const reference = await import(successful.reference);
  assert.deepEqual(reference.initialization_log, [1, 2, 3]);
  const ticks = [reference.tick(), reference.tick(), reference.tick()];
  await eachRuntime(successful, async a => {
    a.auto(1);
    const keep = a.number(-0), frame = a.frame(1), held = [];
    a.frameSet(frame, 0, keep);
    try {
      assert.equal(thrown(() => a.getExport('counter')).eliscriptDiagnostic?.code, 'ELI-RT0008');
      a.initializeModule();a.initializeModule();
      const log = a.getExport('initialization-log');held.push(log);
      assert.deepEqual(numbers(a, log), reference.initialization_log);
      assert.deepEqual(ticks.map(() => numeric(a, 'tick')), ticks);
      a.initializeModule();assert.equal(numeric(a, 'read-counter'), reference.counter);
      const zero = a.getExport('negative-zero'), state = a.getExport('state'), same = a.invoke('read-state');
      held.push(zero, state, same);assert(Object.is(a.readNumber(zero), reference.negative_zero));assert(Object.is(reference.negative_zero, -0));
      assert(a.keyEqual(state, same));
      const key = a.string('self'), self = a.objectGet(state, key);held.push(key, self);assert(a.keyEqual(state, self));
      for (let index = 0; index < 24; index++) {const value = a.invoke('allocate');a.release(value);a.collect();}
      const again = a.invoke('read-state');held.push(again);assert(a.keyEqual(state, again));
      assert.deepEqual(numbers(a, log), [1, 2, 3]);
      const retained = a.frameGet(frame, 0);held.push(retained);assert(Object.is(a.readNumber(retained), -0));
      assert.equal(a.stats().frameDepth, 1);
    } finally {for (const value of held) a.release(value);a.leaveFrame(frame);a.release(keep);}
  });
}, 30000);

nativeTest('outlined native and WASM initializers cache the original JS false throw and never run later parts', async () => {
  try {
    const failed = await artifact('failed-initializers', '(defconst saved (js-array 1 2 3)) (defconst bad (throw false)) (throw "later initializer ran") (defun entry () saved) (export entry)');
    assert.equal(await rejection(import(failed.reference)), false);
    assert.equal(await rejection(import(failed.reference)), false);
    await eachRuntime(failed, a => {
      a.auto(1);const keep = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, keep);
      try {
        for (let index = 0; index < 3; index++) {
          assert.equal(thrown(() => a.initializeModule()), false);
          a.collect();assert.equal(a.stats().frameDepth, 1);assert.equal(a.live(), 2);
          const value = a.frameGet(frame, 0);try {assert(Object.is(a.readNumber(value), -0));} finally {a.release(value);}
        }
      } finally {a.leaveFrame(frame);a.release(keep);}
    });
    // Failed initialization is isolated from a fresh instance of the same real
    // successful library, rather than a reset or substitute backend.
    successful ??= await artifact('ordinary-initializers', fixtureSource);
    await eachRuntime(successful, a => {a.auto(1);a.initializeModule();assert.equal(numeric(a, 'tick'), 1);});
  } finally {successful = undefined;}
}, 30000);

nativeTest('outlined native and WASM parts retain JS TDZ refusal and discard partial module roots', async () => {
  const failed = await artifact('tdz-initializers', '(defconst saved (js-array 1 2 3)) (defconst first (read-later)) (defconst later 7) (defun read-later () later) (export read-later)');
  assert(await rejection(import(failed.reference)) instanceof ReferenceError);
  await eachRuntime(failed, a => {
    for (let index = 0; index < 2; index++) {
      const error = thrown(() => a.initializeModule());
      assert(error instanceof ReferenceError);assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0008');
      a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
    }
    assert.equal(thrown(() => a.getExport('read-later')).eliscriptDiagnostic?.code, 'ELI-RT0008');
  });
}, 30000);

nativeTest('top-level Array constructor registration completes in JS WASM and native and preserves cached prototype callables', async () => {
  const source = `(defconst constructor (js* "Array"))
    (defconst prototype (get constructor :prototype))
    (defconst slice (get prototype :slice))
    (defconst at (get prototype :at))
    (defconst saved (js-array -0.0 7))
    (defun inspect ()
      (let* ((slice-descriptor (Object/getOwnPropertyDescriptor prototype "slice"))
             (at-descriptor (Object/getOwnPropertyDescriptor prototype "at"))
             (constructor-descriptor (Object/getOwnPropertyDescriptor prototype "constructor")))
       (JSON/stringify (js-array
        (Object/is constructor (js* "Array"))
        (Object/is (get prototype :constructor) constructor)
        (Object/is slice (get prototype :slice))
        (Object/is at (get prototype :at))
        (Object/is (get prototype (get globalThis/Symbol :iterator)) (get prototype :values))
        (get slice :name) (get slice :length) (get at :name) (get at :length)
        (js-call slice :call saved 1) (Array/isArray saved)
        (js-array (get slice-descriptor :writable) (get slice-descriptor :enumerable) (get slice-descriptor :configurable))
        (js-array (get at-descriptor :writable) (get at-descriptor :enumerable) (get at-descriptor :configurable))
        (js-array (get constructor-descriptor :writable) (get constructor-descriptor :enumerable) (get constructor-descriptor :configurable))))))
    (defun zero () (js-call at :call saved 0))
    ${sharedRealmDeclarations}
    (export constructor slice at inspect zero realm-read realm-shared-observation realm-clean realm-first-error)`;
  const built = await artifact('array-constructor-initializers', source);
  assertSharedRealmOutlining(built.lowered);
  const reference = await import(built.reference), expected = reference.inspect();
  assert.deepEqual(JSON.parse(expected), [true, true, true, true, true, 'slice', 2, 'at', 1, [7], true,
    [true, false, true], [true, false, true], [true, false, true]]);
  assert(Object.is(reference.zero(), -0));
  await eachRuntime(built, a => {
    a.auto(1);a.initializeModule();
    const constructor = a.getExport('constructor'), slice = a.getExport('slice'), at = a.getExport('at');
    try {
      assert.equal(constructor.kind, 18);assert.equal(slice.kind, 18);assert.equal(at.kind, 18);
      for (let index = 0; index < 2; index++) {
        a.initializeModule();
        const observed = a.invoke('inspect');
        try {assert.equal(a.readString(observed), expected);} finally {a.release(observed);}
        assert(Object.is(numeric(a, 'zero'), reference.zero()));a.collect();
        for (const [name, original] of [['constructor', constructor], ['slice', slice], ['at', at]]) {
          const current = a.getExport(name);try {assert(a.keyEqual(current, original));} finally {a.release(current);}
        }
        assert.equal(a.stats().frameDepth, 0);
      }
      exerciseSharedRealm(a, reference);
    } finally {a.release(constructor);a.release(slice);a.release(at);}
  }, {...options, maxSlots: 1024, initialBytes: 65536});
}, 30000);

nativeTest('Array-first realms preserve original nested AggregateError construction throws aliases and recovery in JS WASM and native', async () => {
  const source = `(defconst ArrayConstructor (js* "Array")) (defconst marker 1)
    (defun construct-child () (new globalThis.TypeError "shared child" (js-object :cause -0.0)))
    (defun construct-inner (child) (new globalThis.AggregateError (js-array child) "inner" (js-object :cause child)))
    (defun construct-outer (child inner)
      (new globalThis.AggregateError (js-array child child inner undefined false) "outer" (js-object :cause child)))
    (defun iterator-observation (child)
      (let* ((method (get (get ArrayConstructor :prototype) (get globalThis/Symbol :iterator)))
             (iterator (js-call method :call (js-array child)))
             (first (js-call iterator :next)) (last (js-call iterator :next)))
        (JSON/stringify (js-array (Object/is (get first :value) child) (get first :done) (get last :done)))))
    (defun throw-aggregate (undefined-cause)
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
        (when (= undefined-cause t) (put child :cause undefined)) (throw failure)))
    (defun inspect-error (failure)
      (let* ((child (get failure :cause)) (errors (get failure :errors)) (inner (aref errors 2))
             (errors-descriptor (Object/getOwnPropertyDescriptor failure "errors"))
             (cause-descriptor (Object/getOwnPropertyDescriptor failure "cause")))
        (JSON/stringify (js-array
          (get failure :name) (get failure :message) (js-length errors)
          (get child :name) (get child :message) (get inner :name) (get inner :message)
          (Object/is (aref errors 0) child) (Object/is (aref errors 1) child)
          (Object/is (aref (get inner :errors) 0) child) (Object/is (get inner :cause) child)
          (Object/is (aref errors 3) undefined) (Object/is (aref errors 4) false)
          (Object/hasOwn child "cause") (Object/is (get child :cause) -0.0) (Object/is (get child :cause) undefined)
          (get errors-descriptor :writable) (get errors-descriptor :enumerable) (get errors-descriptor :configurable)
          (get cause-descriptor :writable) (get cause-descriptor :enumerable) (get cause-descriptor :configurable)
          (get child :stack) (get child :code) (get child :eliscriptDiagnostic) (get child :diagnostics)
          (Object/is (get child :eliscriptDiagnostic) (aref (get child :diagnostics) 0))
          (get child :macroOrigins) (get child :eliscriptFrames) (get child :eliscriptSourceFrames)))))
    (defun recover (value) (+ value marker))
    (export construct-child construct-inner construct-outer iterator-observation throw-aggregate inspect-error recover)`;
  const built = await artifact('array-first-aggregate-errors', source), reference = await import(built.reference);
  // Include space for the independent JSON/reflection oracle's intrinsics.
  // The dedicated exhaustion regression below keeps its original 64 slots.
  const aggregateOptions = {...options, maxSlots: 2048, initialBytes: 65536};
  const expectedIterator = reference.iterator_observation(reference.construct_child());
  assert.deepEqual(JSON.parse(expectedIterator), [true, false, true]);
  await eachRuntime(built, a => {
    a.auto(1);a.initializeModule();
    const held = [];
    try {
      const child = a.invoke('construct-child');held.push(child);
      const iterator = a.invoke('iterator-observation', [child]);
      try {assert.equal(a.readString(iterator), expectedIterator);} finally {a.release(iterator);}
      const inner = a.invoke('construct-inner', [child]);held.push(inner);
      const outer = a.invoke('construct-outer', [child, inner]);held.push(outer);
    } finally {for (const value of held) a.release(value);}
  }, aggregateOptions);
  // Observe the original throw in its own Array-initialized realm. The
  // independent iterator probe must not prepopulate this realm's intrinsics.
  await eachRuntime(built, a => {
    a.auto(1);a.initializeModule();
    const held = [];
    try {
      for (const undefinedCause of [false, true]) {
        const expected = thrown(() => reference.throw_aggregate(undefinedCause));
        assert(expected instanceof AggregateError);assert(expected.cause instanceof TypeError);
        assert.equal(expected.errors[0], expected.errors[1]);assert.equal(expected.errors[0], expected.cause);
        assert(Object.is(expected.cause.cause, undefinedCause ? undefined : -0));
        const error = thrown(() => a.invoke('throw-aggregate', [undefinedCause]));
        if (error?.eliscriptDiagnostic) {
          console.error('[aggregate-runtime-failure]', JSON.stringify({code: error.eliscriptDiagnostic.code, stats: a.stats()}));
          throw error;
        }
        assert.equal(error?.kind, 13, 'source AggregateError must cross as its owned error value');held.push(error);
        a.collect();assert.equal(a.stats().frameDepth, 0);
        const actual = a.invoke('inspect-error', [error]);
        try {assert.equal(a.readString(actual), reference.inspect_error(expected));} finally {a.release(actual);}
        const input = a.number(7);try {assert.equal(numeric(a, 'recover', [input]), reference.recover(7));} finally {a.release(input);}
        a.release(error);held.pop();a.collect();
      }
    } finally {for (const value of held) a.release(value);}
  }, aggregateOptions);
}, 30000);

nativeTest('cold Error construction exhausts the original 64-slot heap and recovers with the same caller input in WASM and native', async () => {
  const source = '(defconst marker 1) (defun make (message) (new (js* "Error") message)) (export make)';
  // Keep the original capacity source intact: its one marker initializer is
  // sufficient to require the ordinary module's private initializer part.
  const built = await artifact('cold-error-capacity-recovery', source, 1);
  const reference = await import(built.reference), expected = reference.make('x');
  assert(expected instanceof Error);assert.equal(expected.message, 'x');
  await eachRuntime(built, a => {
    a.auto(1);a.initializeModule();
    const message = a.string('x'), frame = a.frame(1), retained = [], held = [message];
    a.frameSet(frame, 0, message);
    try {
      let failure;
      for (let index = 0; index < 100; index++) {
        try {retained.push(a.invoke('make', [message]));}
        catch (error) {failure = error;break;}
      }
      assert(retained.length > 0, 'the cold constructor must produce actual Errors before exhausting retained capacity');
      assert.equal(failure?.eliscriptDiagnostic?.code, 'ELI-RT0002');
      assert.equal(a.stats().frameDepth, 1);
      for (const error of retained) a.release(error);
      retained.length = 0;a.collect();
      assert.equal(a.stats().frameDepth, 1);assert.equal(a.readString(message), 'x');
      const recovered = a.invoke('make', [message]);held.push(recovered);
      const key = a.string('message');held.push(key);
      const text = a.objectGet(recovered, key);held.push(text);
      assert.equal(a.readString(text), expected.message);
      const callerValue = a.frameGet(frame, 0);held.push(callerValue);
      assert(a.keyEqual(callerValue, message));assert.equal(a.readString(callerValue), expected.message);
      assert.equal(a.stats().frameDepth, 1);
    } finally {
      for (const error of retained) a.release(error);
      a.leaveFrame(frame);for (const value of held) a.release(value);
    }
  }, {...options, maxSlots: 64, initialBytes: 4096, maxBytes: 16384});
}, 30000);

const coldArraySource = `(defconst marker 1) (defconst spare 2)
 (defun cold-host (array)
  (let* ((method (get array (js* "Symbol.iterator"))) (iterator (js-call method :call array))
         (first (js-call iterator :next)) (second (js-call iterator :next)) (last (js-call iterator :next)))
   (js-array (get first :value) (get first :done) (get second :value) (get second :done) (get last :done))))
 (defun cold-literal () (cold-host (js-array -0.0 7)))
 (defun cold-own () (let* ((array (js-array)) (replacement (lambda () 9)))
  (put array (js* "Symbol.iterator") replacement) (eq (get array (js* "Symbol.iterator")) replacement)))
 (defun cold-own-delete () (let* ((array (js-array -0.0 7)) (replacement (lambda () 9)))
  (put array (js* "Symbol.iterator") replacement)
  (let ((same (eq (get array (js* "Symbol.iterator")) replacement)))
   (Reflect/deleteProperty array (js* "Symbol.iterator")) (js-array same (cold-host array)))))
 (defun cold-null () (let ((array (js-array)))
  (Object/setPrototypeOf array nil) (js-array (get array (js* "Symbol.iterator")) (get array :map))))
 (defun cold-custom () (let ((array (js-array)) (prototype (js-object)))
  (put prototype (js* "Symbol.iterator") 9) (Object/setPrototypeOf array prototype)
  (js-array (get array (js* "Symbol.iterator")) (get array :map))))
 (defun cold-delete () (let* ((array (js-array)) (method (get array (js* "Symbol.iterator")))
  (prototype (Object/getPrototypeOf array)) (descriptor (Object/getOwnPropertyDescriptor prototype (js* "Symbol.iterator"))))
  (try (Reflect/deleteProperty prototype (js* "Symbol.iterator"))
   (js-array (eq (get array (js* "Symbol.iterator")) undefined) (eq (get prototype (js* "Symbol.iterator")) undefined))
   (finally (Object/defineProperty prototype (js* "Symbol.iterator") descriptor)))))
 (defun cold-key-error (trace) (let* ((array (js-array))
  (key (js-object :toString (lambda () (put trace 0 1) (throw false)))))
  (get array key) (put trace 0 2)))
 (defun cold-key-primitive-error (trace) (let ((array (js-array)) (key (js-object)))
  (put key (js* "Symbol.toPrimitive") (lambda () (put trace 0 1) (throw false)))
  (get array key) (put trace 0 2)))
 (defun cold-boxed (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))
     (Object/is (get boxed :valueOf) (get (get constructor :prototype) :valueOf))
     (Object/is (js-call boxed :valueOf) value)))))
 (defun cold-boxed-symbol (brand object-first)
  (cold-boxed (funcall globalThis/Symbol "cold") brand object-first))
 (defun cold-boxed-length (value)
  (get (funcall globalThis/Object value) :length))
 (defun cold-boxed-slice (value)
  (let ((method (get (js-array) :slice)) (boxed (funcall globalThis/Object value)))
   (js-call method :call boxed)))
 (defun cold-boxed-first (value object-first)
  (let ((method (get (js-array) :slice)))
   (if object-first (funcall globalThis/Object value) (js-call method :call value)) 1))
 (defun cold-boxed-pair (value object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value)))) 2))
 (defun cold-boxed-proto (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))))))
 (defun cold-boxed-valueof-read (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))
     (Object/is (get boxed :valueOf) (get (get constructor :prototype) :valueOf))))))
 (defun cold-boxed-symbol-stage (brand object-first stage)
  (let ((value (funcall globalThis/Symbol "cold")))
   (cond ((= stage 0) (cold-boxed-first value object-first))
    ((= stage 1) (cold-boxed-pair value object-first))
    ((= stage 2) (cold-boxed-proto value brand object-first))
    (t (cold-boxed-valueof-read value brand object-first)))))
 (defun cold-recover (value) (+ value marker))
 (defun argv-lifetime (value)
  (let* ((identity (lambda (entry) entry))
         (capture (funcall (lambda (entry) (lambda () entry)) value))
         (rest (funcall (lambda (&rest entries) entries) value))
         (applied (js-call identity :apply nil (js-array value)))
         (caught (try (funcall (lambda (entry) (throw false)) value)
                   (catch failure (if (eq failure false) value (throw failure))))))
   (js-array (eq (funcall identity value) value) (eq (funcall capture) value)
     (eq (aref rest 0) value) (eq applied value) (eq caught value))))
 (export cold-host cold-literal cold-own cold-own-delete cold-null cold-custom cold-delete cold-key-error cold-key-primitive-error cold-boxed cold-boxed-symbol cold-boxed-length cold-boxed-slice cold-boxed-first cold-boxed-pair cold-boxed-proto cold-boxed-valueof-read cold-boxed-symbol-stage cold-recover argv-lifetime)`;

function readColdArrayValue(a, value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.kind === 4) return a.readNumber(value);
  assert.equal(value.kind, 14);
  return Array.from({length: a.length(value)}, (_, index) => {
    const child = a.get(value, index);
    try {return readColdArrayValue(a, child);} finally {a.release(child);}
  });
}
function checkColdArray(a, reference, name, runtime = 'wasm') {
  a.auto(1);a.initializeModule();
  const keep = a.number(-0), caller = a.frame(1), held = [keep];a.frameSet(caller, 0, keep);
  try {
    if (name.startsWith('cold-boxed-')) {
      const [base, phase] = name.split(':'), [, , label, first] = base.split('-');
      const labels = ['number', 'string', 'boolean', 'symbol', 'bigint'];
      const phases = ['first', 'pair', 'proto', 'valueof-read'], phaseIndex = phases.indexOf(phase);
      const brand = a.number(labels.indexOf(label)), objectFirst = first === 'object';held.push(brand);
      const expectedInput = label === 'number' ? -0 : label === 'string' ? 'ab' : label === 'boolean' ? false : 1n;
      const input = label === 'number' ? keep : label === 'string' ? a.string(expectedInput)
        : label === 'boolean' ? false : label === 'bigint' ? a.bigint(expectedInput) : undefined;
      if (input !== keep) held.push(input);
      if (label === 'bigint') {assert.equal(input?.kind,34,'BigInt input must be an actual managed primitive');assert.equal(a.readBigInt(input),expectedInput);}
      const operation = phase ? `cold-boxed-${phase}` : 'cold-boxed';
      const boxedPrefix = phase === 'length' || phase === 'slice';
      const ordinary = boxedPrefix ? [expectedInput] : phaseIndex === 0 || phaseIndex === 1 ? [expectedInput, objectFirst]
        : [expectedInput, labels.indexOf(label), objectFirst];
      const expected = label === 'symbol' ? (phase ? reference.cold_boxed_symbol_stage(3, objectFirst, phaseIndex)
        : reference.cold_boxed_symbol(3, objectFirst)) : reference[operation.replaceAll('-', '_')](...ordinary);
      const complete = [label === 'string' ? 2 : 0, true, true, true, true];
      assert.deepEqual(expected, phase === 'length' ? undefined : phase === 'slice' ? [] : phaseIndex === 0 ? 1 : phaseIndex === 1 ? 2
        : phaseIndex === 2 ? complete.slice(0, 3) : phaseIndex === 3 ? complete.slice(0, 4) : complete);
      const stage = phase ? a.number(phaseIndex) : undefined;if (phase) held.push(stage);
      const result = label === 'symbol' ? a.invoke(phase ? 'cold-boxed-symbol-stage' : 'cold-boxed-symbol', phase ? [brand, objectFirst, stage] : [brand, objectFirst])
        : a.invoke(operation, boxedPrefix ? [input] : phaseIndex === 0 || phaseIndex === 1 ? [input, objectFirst] : [input, brand, objectFirst]);held.push(result);
      assert.deepEqual(readColdArrayValue(a, result), expected);a.collect();
    } else if (name === 'cold-key-error' || name === 'cold-key-primitive-error') {
      const zero = a.number(0), trace = a.sourceArray([zero]);held.push(zero, trace);
      const expected = [0];let expectedThrew = false, actualThrew = false;
      try {reference[name.replaceAll('-', '_')](expected);} catch (error) {expectedThrew = true;assert.strictEqual(error, false);}
      try {a.invoke(name, [trace]);} catch (error) {
        actualThrew = true;
        if (error !== false) {
          let observation;
          try {
            const first = a.get(trace, 0);
            try {observation = {length: a.length(trace), first: a.readNumber(first), frameDepth: a.stats().frameDepth};}
            finally {a.release(first);}
          } catch (inspectionError) {observation = {unavailable: String(inspectionError)};}
          console.error('[cold-array-key-failure]', JSON.stringify({name, runtime, observation}));
        }
        assert.strictEqual(error, false);
      }
      assert(expectedThrew);assert(actualThrew);assert.deepEqual(expected, [1]);
      assert.deepEqual(readColdArrayValue(a, trace), expected);a.collect();
      const input = a.number(7);held.push(input);
      assert.equal(numeric(a, 'cold-recover', [input]), reference.cold_recover(7));
    } else {
      const args = [];
      if (name === 'cold-host' || name === 'argv-lifetime') {const seven = a.number(7), input = a.sourceArray([keep, seven]);held.push(seven, input);args.push(input);}
      const expected = reference[name.replaceAll('-', '_')](...(['cold-host', 'argv-lifetime'].includes(name) ? [[-0, 7]] : []));
      const result = a.invoke(name, args);held.push(result);
      assert.deepEqual(readColdArrayValue(a, result), expected);a.collect();
    }
    assert.equal(a.stats().frameDepth, 1);
    const saved = a.frameGet(caller, 0);try {assert(Object.is(a.readNumber(saved), -0));} finally {a.release(saved);}
  } catch (error) {
    console.error('[cold-array-case-failure]', JSON.stringify({name, runtime, stats: a.stats()}));throw error;
  } finally {a.leaveFrame(caller);for (const value of held) a.release(value);}
}

nativeTest('cold literal and host Arrays observe native methods lazily while own keys custom chains deletion and first errors retain JS semantics', async () => {
  // One image, fresh actual instances per cold entry: no constructor read can
  // prewarm another scenario, and native() still forbids a WASM substitute.
  const built = await artifact('cold-array-observation', coldArraySource), reference = await import(built.reference);
  assert.deepEqual(reference.cold_literal(), [-0, false, 7, false, true]);
  const boxed = ['number', 'string', 'boolean', 'symbol', 'bigint'].flatMap(brand => ['array', 'object'].flatMap(first => {
    const name = `cold-boxed-${brand}-${first}`;
    const phases = ['first', 'pair', 'proto', 'valueof-read'].concat(brand === 'bigint' ? ['length', 'slice'] : []);
    return phases.map(phase => `${name}:${phase}`).concat(name);
  }));
  const failures = [], failedCases = [];
  for (const name of ['cold-literal', 'cold-host', 'cold-own', 'cold-own-delete', 'cold-null', 'cold-custom', 'cold-delete', 'argv-lifetime', ...boxed, 'cold-key-primitive-error', 'cold-key-error']) {
    const configuration = ['cold-own', 'cold-key-error', 'cold-key-primitive-error'].includes(name)
      ? {...options, maxSlots: 64, initialBytes: 4096, maxBytes: 16384}
      : {...options, maxSlots: 1024, initialBytes: 65536};
    await eachRuntime(built, (a, kind) => {
      try {checkColdArray(a, reference, name, kind);}
      catch (error) {failures.push(error);failedCases.push(`${kind}/${name}`);}
    }, configuration);
  }
  if (failures.length) throw new AggregateError(failures, `cold Array failures: ${failedCases.join(', ')}`);
}, 30000);
