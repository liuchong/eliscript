import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const boxedSteps = [];
const progressExports = ['boxed-progress-low', 'boxed-progress-middle', 'boxed-progress-high'];
const immediateSource = ['nil', 'false', 't', 'undefined'];
function boxedProgress(label) {
  const code = boxedSteps.length;
  if (code >= 64) throw new Error('boxed progress exceeds the immediate-only diagnostic code space');
  const marker = '; boxed operation: ' + label;
  boxedSteps.push({label, marker});
  return `(setq boxed-progress-low ${immediateSource[code & 3]}
    boxed-progress-middle ${immediateSource[(code >>> 2) & 3]}
    boxed-progress-high ${immediateSource[(code >>> 4) & 3]}) ${marker}\n`;
}
function boxedStep(label, expression) {
  return `(progn ${boxedProgress(label)}${expression})`;
}
function boxedAfter(label, expression) {
  return `(let ((boxed-observation ${expression})) ${boxedProgress(label)}boxed-observation)`;
}
const boxedFinalElement = boxedAfter('allocate the original observation array',
  boxedStep('catch the deliberate Number.valueOf wrong-brand call',
    '(try (js-call (get np :valueOf) :call string) (catch error (get error :name)))'));
const boxedObservations = boxedAfter('call the captured JSON.stringify with the original observation array',
  `(js-array
    ${boxedStep('Number.prototype.valueOf.call(number)', '(js-call (get np :valueOf) :call number)')}
    ${boxedStep('Number.prototype.toString.call(number,16)', '(js-call (get np :toString) :call number 16)')}
    ${boxedStep('Boolean.prototype.valueOf.call(boolean)', '(js-call (get bp :valueOf) :call boolean)')}
    ${boxedStep('String.prototype.valueOf.call(string)', '(js-call (get sp :valueOf) :call string)')}
    ${boxedStep('Object.keys of the boxed UTF16 string', '(Object/keys string)')}
    ${boxedStep('read boxed string length descriptor value', '(get length :value)')}
    ${boxedStep('read boxed string length descriptor writable', '(get length :writable)')}
    ${boxedStep('read boxed string length descriptor configurable', '(get length :configurable)')}
    ${boxedStep('read boxed string index descriptor value', '(get index :value)')}
    ${boxedStep('read boxed string index descriptor writable', '(get index :writable)')}
    ${boxedStep('read boxed string index descriptor enumerable', '(get index :enumerable)')}
    ${boxedStep('read boxed string index descriptor configurable', '(get index :configurable)')}
    ${boxedStep('BigInt.prototype.toString.call(bigint)', '(js-call (get ip :toString) :call bigint)')}
    ${boxedStep('Symbol.prototype.description getter.call(symbol)', '(js-call description :call symbol)')}
    ${boxedStep('Symbol.prototype.toString.call(symbol)', '(js-call (get yp :toString) :call symbol)')}
    ${boxedFinalElement})`);

const source = `
(defvar boxed-progress-low nil)
(defvar boxed-progress-middle nil)
(defvar boxed-progress-high nil)
(defun plus-offset (value index receiver) (+ value (get (js* "this") :offset)))
(defun visit-collection (value key receiver)
  (js-call (get (js* "this") :trace) :push (js-array value key (Object/is receiver (get (js* "this") :owner)))))
(defun array-callables ()
  (let* ((prototype (get globalThis/Array :prototype))
         (map (get prototype :map)) (slice (get prototype :slice))
         (object (js-object :0 3 :2 7 :length 4))
         (out (js-call map :call object plus-offset (js-object :offset 10)))
         (descriptor (Object/getOwnPropertyDescriptor prototype "map")))
    (JSON/stringify (js-array out (Object/hasOwn out "1")
      (js-call slice :call "A😀Z" 1 3)
      (Object/is (get prototype (get globalThis/Symbol :iterator)) (get prototype :values))
      (get map :name) (get map :length) (get descriptor :writable)
      (get descriptor :enumerable) (get descriptor :configurable)))))
(defun collections ()
  (let* ((map (new globalThis/Map (js-array (js-array "a" 1) (js-array "b" 2))))
         (set (new globalThis/Set (js-array 1 2 1)))
         (mp (get globalThis/Map :prototype)) (sp (get globalThis/Set :prototype))
         (trace (js-array)) (context (js-object :trace trace :owner map))
         (foreach (get mp :forEach)) (has (get mp :has))
         (size (get (Object/getOwnPropertyDescriptor mp "size") :get)))
    (js-call foreach :call map visit-collection context)
    (JSON/stringify (js-array (js-call has :call map "a") (js-call size :call map)
      (get set :size) trace (Object/is (get sp :keys) (get sp :values))
      (Object/is (get sp (get globalThis/Symbol :iterator)) (get sp :values))
      (try (js-call (get sp :add) :call map 9) (catch error (get error :name)))
      (js-call (get (get globalThis/Object :prototype) :toString) :call map)))))
(defun weak-collections ()
  (let* ((key (js-object)) (map (new globalThis/WeakMap (js-array (js-array key 9))))
         (set (new globalThis/WeakSet (js-array key)))
         (get (get (get globalThis/WeakMap :prototype) :get))
         (has (get (get globalThis/WeakSet :prototype) :has)))
    (JSON/stringify (js-array (js-call get :call map key) (js-call has :call set key)
      (js-call has :call set 1) (js-call (get (get globalThis/WeakMap :prototype) :delete) :call map key)
      (js-call get :call map key)))))
(defun iterators ()
  (let* ((map (new globalThis/Map (js-array (js-array "a" 1))))
         (iterator (js-call map :entries)) (next (get iterator :next))
         (first (js-call next :call iterator)))
    (js-call map :set "b" 2)
    (let ((second (js-call next :call iterator)) (done (js-call next :call iterator)))
      (js-call map :set "c" 3)
      (JSON/stringify (js-array first second done (js-call next :call iterator)
        (Object/is (js-call (get iterator (get globalThis/Symbol :iterator)) :call iterator) iterator)
        (js-call (get (get globalThis/Object :prototype) :toString) :call iterator)
        (try (js-call next :call (js-array)) (catch error (get error :name))))))))
(defun boxed-primitives ()
  (let* ((number ${boxedStep('construct new Number(255)', '(new globalThis/Number 255)')})
         (string ${boxedStep('construct new String with supplementary-plane text', '(new globalThis/String "😀")')})
         (boolean ${boxedStep('construct new Boolean(0)', '(new globalThis/Boolean 0)')})
         (bigint ${boxedStep('convert decimal text with BigInt', '(funcall globalThis/BigInt "12345678901234567890")')})
         (symbol ${boxedStep('create Symbol(label)', '(funcall globalThis/Symbol "label")')})
         (np ${boxedStep('read Number.prototype', '(get globalThis/Number :prototype)')})
         (sp ${boxedStep('read String.prototype', '(get globalThis/String :prototype)')})
         (bp ${boxedStep('read Boolean.prototype', '(get globalThis/Boolean :prototype)')})
         (ip ${boxedStep('read BigInt.prototype', '(get globalThis/BigInt :prototype)')})
         (yp ${boxedStep('read Symbol.prototype', '(get globalThis/Symbol :prototype)')})
         (description ${boxedStep('reflect Symbol.prototype.description and read its getter', '(get (Object/getOwnPropertyDescriptor yp "description") :get)')})
         (length ${boxedStep('reflect boxed string length descriptor', '(Object/getOwnPropertyDescriptor string "length")')})
         (index ${boxedStep('reflect boxed string UTF16 index zero descriptor', '(Object/getOwnPropertyDescriptor string "0")')}))
    ${boxedStep('capture JSON.stringify before evaluating its argument', `(JSON/stringify ${boxedObservations})`)}))
(defun array-string-iterators ()
  (let* ((object (js-object :0 "a" :1 "b" :length 2))
         (iterator (js-call (get (get globalThis/Array :prototype) :values) :call object))
         (next (get iterator :next)) (first (js-call next :call iterator))
         (string (js-call (get (get globalThis/String :prototype) (get globalThis/Symbol :iterator)) :call "A😀Z"))
         (string-next (get string :next)))
    (put object :1 "changed")
    (let ((second (js-call next :call iterator)))
      (put object :length 1)
      (let ((done (js-call next :call iterator)))
        (put object :length 3)
        (JSON/stringify (js-array first second done (js-call next :call iterator)
          (js-call string-next :call string) (js-call string-next :call string)
          (js-call string-next :call string) (js-call string-next :call string)))))))
(defun bigint-call-path (mode)
  (let* ((value (funcall globalThis/BigInt "12345678901234567890"))
         (prototype (get globalThis/BigInt :prototype))
         (method (get prototype :toString)) (call (get method :call))
         (trace (js-array))
         (radix (js-object :valueOf (lambda () (js-call trace :push "radix") 16)))
         (sentinel (js-object :reason "radix")))
    (JSON/stringify
      (cond
        ((= mode 0)
          (js-array (Object/is method (get prototype :toString))
            (Object/is call (get (get globalThis/Function :prototype) :call))
            (js-call method :call value) (js-call method :call value undefined)
            (js-call method :call value 2) (js-call method :call value 36)
            (get method :name) (get method :length)))
        ((= mode 1)
          (js-array (js-call method :call (funcall globalThis/Object value))
            (js-call method :apply value (js-array 16))))
        ((= mode 2)
          (js-array (try (js-call method :call 7 radix) (catch error (get error :name))) trace))
        ((= mode 3) (js-array (js-call method :call value radix) trace))
        ((= mode 4)
          (put radix :valueOf (lambda () (js-call trace :push "throw") (throw sentinel)))
          (js-array (try (js-call method :call value radix) (catch error (Object/is error sentinel))) trace))
        ((= mode 5)
          (js-array (js-call method :call
            (progn (js-call trace :push "receiver") value)
            (progn (js-call trace :push "argument") radix)
            (progn (js-call trace :push "extra") 99)) trace))
        ((= mode 6)
          (try
            (js-array
              (js-call (get prototype :toString) :call
                (progn (put prototype :toString (lambda () "replacement")) value) 16)
              (js-call (get prototype :toString) :call value))
            (finally (put prototype :toString method))))
        ((= mode 7)
          (js-array (try (js-call method :call prototype radix) (catch error (get error :name))) trace))
        (t
          (js-array
            (try (js-call method :call value nil) (catch error (get error :name)))
            (try (js-call method :call value (js* "NaN")) (catch error (get error :name)))
            (try (js-call method :call value 1) (catch error (get error :name)))
            (try (js-call method :call value 37) (catch error (get error :name)))
            (try (js-call method :call value (funcall globalThis/BigInt "16")) (catch error (get error :name)))))))))
(defun Custom (executor)
  (let ((receiver (js* "this")))
    (funcall executor (lambda (value) (put receiver :value value))
      (lambda (reason) (put receiver :reason reason)))))
(defun InvalidCapability (executor) (funcall executor 1 2))
(defun RetryCapability (executor)
  (funcall executor undefined undefined)
  (let ((receiver (js* "this")))
    (funcall executor (lambda (value) (put receiver :value value))
      (lambda (reason) (put receiver :reason reason)))))
(defun promise-validation ()
  (let* ((promise (Promise/resolve 7)) (constructor (js-object)) (trace (js-array)))
    (put promise :constructor 1)
    (js-call trace :push
      (try (js-call (get globalThis/Promise :resolve) :call 1 promise) (catch error (get error :name)))
      (try (js-call promise :then) (catch error (get error :name)))
      (try (js-call (get globalThis/Promise :resolve) :call InvalidCapability 9) (catch error (get error :name))))
    (put constructor (get globalThis/Symbol :species) (lambda (executor) (funcall executor (lambda (v) v) (lambda (v) v))))
    (put promise :constructor constructor)
    (js-call trace :push
      (try (js-call promise :then) (catch error (get error :name)))
      (get (js-call (get globalThis/Promise :resolve) :call RetryCapability 11) :value))
    (JSON/stringify trace)))
(defun immediate-thenable (value)
  (js-object :then (lambda (resolve reject) (funcall resolve value))))
(defun custom-capability (operation)
  (put Custom :resolve immediate-thenable)
  (let* ((method (get globalThis/Promise operation))
         (value (if (= operation "resolve") 17 (js-array 3 5 8)))
         (result (js-call method :call Custom value)))
    (JSON/stringify (get result :value))))
(defun promise-suite (mode)
  (cond
    ((= mode 0) (js-call (Promise/all (js-array 1 (Promise/resolve 2) 3)) :then JSON/stringify))
    ((= mode 1) (js-call (Promise/allSettled (js-array (Promise/resolve 1) (Promise/reject "bad"))) :then JSON/stringify))
    ((= mode 2) (js-call (Promise/any (js-array)) :catch
      (lambda (error) (JSON/stringify (js-array (get error :name) (get error :errors))))))
    ((= mode 3)
      (let ((trace (js-array)))
        (js-call (js-call (Promise/resolve 7) :finally (lambda () (js-call trace :push "finally") (Promise/resolve 99)))
          :then (lambda (value) (JSON/stringify (js-array value trace))))))
    ((= mode 4)
      (let ((marker (js-object :identity 7)))
        (js-call (js-call (Promise/resolve 1) :finally (lambda () (throw marker))) :catch
          (lambda (error) (JSON/stringify (js-array (Object/is error marker) (get error :identity)))))))
    (t (js-call (Promise/race (js-array (Promise/resolve (not t)) (Promise/resolve 9))) :then JSON/stringify))))
(defun foreign-then (promise)
  (js-call (get (get globalThis/Promise :prototype) :then) :call promise (lambda (value) (+ value 3))))
(defun recover () 42)
(export array-callables collections weak-collections iterators promise-validation boxed-primitives array-string-iterators bigint-call-path custom-capability promise-suite foreign-then recover)
(export boxed-progress-low boxed-progress-middle boxed-progress-high)
`;
let directory, backend, runtime, program, bytes, hostBytes, reference, referencePath, bigintLowered, bigintNativePath;
const bigintNativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
const bigintNativeSupported = process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform);
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-prototype-callables-'));
  backend = await buildBackends({outputRoot: directory});
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = backend.compiler.compile_ir_string(source, 'native-prototype-callables.eli');
  const frozen = JSON.stringify(program), javascript = backend.compiler.emit_ir_string(program);
  reference = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  referencePath = resolve(directory, 'reference.mjs');await writeFile(referencePath, javascript);
  bytes = Uint8Array.from(backend.managed.emit_managed_wasm(program, runtime));
  assert.equal(JSON.stringify(program), frozen);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  if (bigintNativeSupported) {
    bigintLowered = backend.managed.lower_managed_program(program, runtime);
    bigintNativePath = resolve(directory, process.platform === 'linux' ? 'bigint-call-path.so' : 'bigint-call-path.dylib');
    await writeFile(bigintNativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(bigintLowered.typed, bigintNativeTarget)));
  }

}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function finish(a, values = []) {
  try {
    for (const value of values) a.release(value);
    a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  } finally {a.close?.();}
}
function boxedFailureContext(a, error) {
  try {
    const immediateCode = value => value === null ? 0 : value === false ? 1 : value === true ? 2 : value === undefined ? 3 : -1;
    const parts = progressExports.map(name => immediateCode(a.getExport(name)));
    if (parts.some(part => part < 0)) throw new Error('boxed progress must contain only immediate values');
    const code = parts[0] | (parts[1] << 2) | (parts[2] << 4), step = boxedSteps[code];
    if (!step) throw new Error('boxed progress does not name a registered source operation');
    const marker = source.indexOf(step.marker);
    if (marker < 0) throw new Error('boxed operation has no original source marker');
    const start = marker + step.marker.length + 1, before = source.slice(0, start);
    const location = {filename: 'native-prototype-callables.eli',
      line: before.split('\n').length, column: Array.from(before.slice(before.lastIndexOf('\n') + 1)).length + 1,
      offset: Array.from(before).length, offsetUnit: 'Unicode scalar'};
    const context = {operation: step.label, location, budget: {maxSlots: 1024, auto: 1},
      stats: a.stats(), diagnostic: error?.eliscriptDiagnostic,
      frames: error?.eliscriptFrames, sourceFrames: error?.eliscriptSourceFrames};
    const heading = 'boxed-primitives: ' + step.label + ' at ' + location.filename + ':' + location.line + ':' + location.column;
    // Print explicitly: the host's default Error formatter previously omitted
    // attached managedStats. Retain the same error object and its actual frames.
    console.error(heading, context);
    if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
      Object.defineProperty(error, 'boxedPrimitiveContext', {value: context, enumerable: true, configurable: true});
      if (typeof error.message === 'string') error.message = heading + ': ' + error.message;
    }
  } catch (contextError) {
    // A diagnostic-read failure must never replace the original source failure.
    console.error('boxed-primitives progress could not be read; original failure is retained', contextError);
  }
}
for (const name of ['array-callables', 'collections', 'weak-collections', 'iterators', 'boxed-primitives', 'array-string-iterators', 'promise-validation']) {
  test('real native prototype '+name+' supports borrowed callables, descriptors, brands and live state', () => {
    const a = instantiateManagedRuntime(bytes);a.auto(1);let result, failed = false;
    try {result = a.invoke(name);assert.equal(a.readString(result), reference[name.replaceAll('-', '_')]());}
    catch (error) {
      failed = true;
      Object.defineProperty(error, 'managedStats', {value:a.stats(),enumerable:true,configurable:true});
      if (name === 'boxed-primitives') boxedFailureContext(a, error);
      throw error;
    }
    finally {
      try {finish(a, result ? [result] : []);}
      catch (cleanupError) {
        if (!failed) throw cleanupError;
        console.error('native prototype cleanup also failed; the original failure is retained', cleanupError);
      }
    }
  });
}
test('Array callable oracle preserves holes, UTF16 indices and actual callback this', () => {
  const result = JSON.parse(reference.array_callables());
  assert.deepEqual(result, [[13, null, 17, null], false, ['\ud83d', '\ude00'], true, 'map', 1, true, false, true]);
});
function checkBigIntCallPath(a, mode) {
  const input = a.number(mode);let result;
  try {
    result = a.invoke('bigint-call-path', [input]);
    assert.equal(a.readString(result), reference.bigint_call_path(mode), 'BigInt borrowed call mode ' + mode);
  } finally {a.release(input);if (result) a.release(result);}
  a.collect();assert.equal(a.stats().frameDepth, 0);
}
for (let mode = 0; mode < 9; mode++) {
  test('Given the canonical BigInt toString when borrowed through Function.call then receiver radix effects and exceptions remain exact in mode '+mode, () => {
    const a = instantiateManagedRuntime(bytes);a.auto(1);
    try {checkBigIntCallPath(a, mode);} finally {finish(a);}
  });
}
test.skipIf(!bigintNativeSupported)('Given the same BigInt borrowed-call source in a true native library then every receiver and radix contract survives collection', async () => {
  const a = await instantiateNativeManagedRuntime(bigintNativePath, bigintLowered, {nativeTarget: bigintNativeTarget});a.auto(1);
  try {for (let mode = 0; mode < 9; mode++) checkBigIntCallPath(a, mode);} finally {finish(a);}
}, 120000);
for (const operation of ['resolve', 'all', 'allSettled', 'any']) {
  test('Promise.'+operation+' uses the actual constructor and its resolve capability', () => {
    const a = instantiateManagedRuntime(bytes);a.auto(1);const input = a.string(operation);let result;
    try {result = a.invoke('custom-capability', [input]);assert.equal(a.readString(result), reference.custom_capability(operation));}
    finally {finish(a, [input, ...(result ? [result] : [])]);}
  });
}
for (let mode = 0; mode < 6; mode++) {
  test('Promise native capability, aggregate and finally jobs preserve completion '+mode, async () => {
    const a = instantiateManagedRuntime(bytes);a.auto(1);const input = a.number(mode);let result;
    try {result = await a.invokeAsync('promise-suite', [input]);assert.equal(a.readString(result), await reference.promise_suite(mode));}
    finally {finish(a, [input, ...(result ? [result] : [])]);}
  });
}
test('foreign Promise.then uses actual host Promise internal slots without accepting an ordinary thenable', async () => {
  hostBytes = Uint8Array.from(backend.managed.emit_managed_project_wasm(
    [{id:'prototype-callables.mjs',program}], 'prototype-callables.mjs', runtime, {phased:true}));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(hostBytes))
    .map(({module,name,kind}) => ({module,name,kind})),
    [{module:'eliscript.host',name:'source-operation',kind:'function'}]);

  const a = instantiateManagedRuntime(hostBytes);a.auto(1);
  const input = a.fromHostValue(Promise.resolve(8)), wrong = a.fromHostValue({then() {return 99;}});let output;
  try {
    output = a.invoke('foreign_then', [input]);
    assert.equal(await a.toHostValue(output), 11);
    assert.throws(() => a.invoke('foreign_then', [wrong]), error => {
      if (error instanceof TypeError) return true;
      if (error?.kind === 35) {try {return a.toHostValue(error) instanceof TypeError;} finally {a.release(error);}}
      return false;
    });
  } finally {finish(a, [input, wrong, ...(output ? [output] : [])]);}
});
test('Node executes the independent JavaScript prototype and Promise oracle', () => {
  const script = `import assert from 'node:assert/strict';const m=await import(process.argv[1]);
  assert.deepEqual(JSON.parse(m.collections()).slice(0,4),[true,2,2,[[1,'a',true],[2,'b',true]]]);
  assert.deepEqual(JSON.parse(m.iterators()).slice(0,4),[{value:['a',1],done:false},{value:['b',2],done:false},{done:true},{done:true}]);
  assert.equal(await m.promise_suite(0),'[1,2,3]');assert.equal(await m.promise_suite(2),'["AggregateError",[]]');
  assert.equal(await m.promise_suite(4),'[true,7]');assert.equal(await m.foreign_then(Promise.resolve(8)),11);
  const bigint=12345678901234567890n,hex=bigint.toString(16);
  const expected=[
    [true,true,bigint.toString(),bigint.toString(),bigint.toString(2),bigint.toString(36),'toString',1],
    [bigint.toString(),hex],['TypeError',[]],[hex,['radix']],[true,['throw']],
    [hex,['receiver','argument','extra','radix']],[hex,'replacement'],['TypeError',[]],
    ['RangeError','RangeError','RangeError','RangeError','TypeError']
  ];
  for(let mode=0;mode<expected.length;mode++)assert.deepEqual(JSON.parse(m.bigint_call_path(mode)),expected[mode],'independent BigInt borrowed call mode '+mode);`;
  const child = spawnSync('node', ['--input-type=module', '-e', script, pathToFileURL(referencePath).href], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr || child.stdout);
});
