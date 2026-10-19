import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

// All products, including the native library, are prepared once. Test bodies
// execute the original fixture; they never rebuild a compiler or runtime.
let directory, backend, bytes, lowered, reference, referencePath, wasmPath, nativePath, frozenReference;
let coldBytes, coldLowered, coldReference, coldNativePath;
let numberBytes, numberLowered, numberOracle, numberNativePath;
let sqrtBytes, sqrtLowered, sqrtReference, sqrtReferencePath, sqrtWasmPath, sqrtNativePath;
const nativeTarget = process.arch === 'arm64'
  ? process.platform === 'darwin' ? 'arm64-macos' : process.platform === 'linux' ? 'arm64-linux' : null
  : null;
const unaryNames = ['abs', 'sign', 'clz32', 'fround'];
const constants = ['E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2'];
const methodLengths = {
  abs: 1, sign: 1, clz32: 1, fround: 1, imul: 2,
  round: 1, floor: 1, ceil: 1, trunc: 1, min: 2, max: 2,
};
const primitives = [undefined, null, false, true, '', ' ', '-0', '0x10', '0b11', '0o17',
  '\u2028-1.5\ufeff', 'not a number', '\ud800', NaN, Infinity, -Infinity, 0, -0,
  Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
  0.49999999999999994, 0.5, -0.5, 1.5, -1.5, 2 ** 31 - 1, 2 ** 31,
  2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1, -(2 ** 32) - 1, 2 ** 53 - 1, 2 ** 53 + 2];
const sqrtSource = `
(defun sqrt-method (mode)
 (cond ((= mode 0) Math/sqrt) ((= mode 1) globalThis/Math.sqrt) (t (get (js* "Math") "sqrt"))))
(defun sqrt-callback (method value) (funcall method value))
(defun sqrt-call (mode value)
 (cond ((= mode 0) (Math/sqrt value)) ((= mode 1) (globalThis/Math.sqrt value))
  ((= mode 2) (js-call (js* "Math") "sqrt" value))
  ((= mode 3) (funcall Math/sqrt value))
  ((= mode 4) (js-call Math/sqrt :call nil value))
  ((= mode 5) (js-call Math/sqrt :apply nil (js-array value)))
  ((= mode 6) (funcall (js-call Math/sqrt :bind nil) value))
  ((= mode 7) (funcall sqrt-callback Math/sqrt value))
  ((= mode 8) (funcall (js-call (js-call Math/sqrt :bind nil) :bind (js-object)) value))
  (t (get (js-call (js-array value) :map (js-call Math/sqrt :bind nil)) 0))))
(defun sqrt-held (method &rest args) (apply method args))
(defun sqrt-arity (missing)
 (let ((trace (js-array)))
  (js-array (if missing (Math/sqrt)
    (Math/sqrt
     (progn (js-call trace :push "argument")
      (js-object :valueOf (lambda () (js-call trace :push "convert") 81)))
     (progn (js-call trace :push "extra")
      (js-object :valueOf (lambda () (throw "ignored extra converted")))))) trace)))
(defun sqrt-convert (mode)
 (let* ((trace (js-array)) (marker (js-object))
        (input (cond ((= mode 0) (new globalThis/Number 81))
          ((= mode 1) (new globalThis/String "81")) ((= mode 2) (new globalThis/Boolean t))
          ((= mode 7) (funcall globalThis/Symbol "sqrt"))
          ((= mode 8) (funcall globalThis/BigInt "81"))
          ((= mode 9) (funcall globalThis/Object (funcall globalThis/BigInt "81")))
          ((= mode 10) (funcall globalThis/Object (funcall globalThis/Symbol "sqrt")))
          ((= mode 11) (new globalThis/Number -0.0)) (t (js-object)))))
  (when (= mode 3)
   (Object/defineProperty input "valueOf" (js-object :get (lambda ()
    (js-call trace :push "valueOf.get")
    (lambda () (js-call trace :push "valueOf.call") (js-object)))))
   (Object/defineProperty input "toString" (js-object :get (lambda ()
    (js-call trace :push "toString.get") (lambda () (js-call trace :push "toString.call") "81")))))
  (when (or (= mode 4) (= mode 5) (= mode 6))
   (Object/defineProperty input (js* "Symbol.toPrimitive") (js-object :get (lambda ()
    (js-call trace :push "primitive.get")
    (lambda (hint) (js-call trace :push hint (eq (js* "this") input))
     (cond ((= mode 5) (throw marker)) ((= mode 6) (js-object)) (t "81")))))))
  (js-array (try (Math/sqrt input)
   (catch error (if (eq error marker) "marker" (get error :name)))) trace)))
(defun sqrt-throw (marker) (Math/sqrt (js-object :valueOf (lambda () (throw marker)))))
(defun sqrt-description (held)
 (let* ((namespace (js* "Math")) (method (get namespace "sqrt"))
        (descriptor (Object/getOwnPropertyDescriptor namespace "sqrt"))
        (name (Object/getOwnPropertyDescriptor method "name"))
        (length (Object/getOwnPropertyDescriptor method "length")))
  (js-array (eq held method) (eq Math/sqrt method) (eq globalThis/Math.sqrt method)
   (get method :name) (get method :length) (Object/hasOwn method "prototype")
   (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)
   (get name :writable) (get name :enumerable) (get name :configurable)
   (get length :writable) (get length :enumerable) (get length :configurable))))
(defun sqrt-mutations ()
 (let* ((namespace (js* "Math")) (saved (Object/getOwnPropertyDescriptor namespace "sqrt"))
        (held Math/sqrt) (replacement (lambda (value) 99)))
  (try (put namespace :sqrt replacement)
   (let ((same (eq Math/sqrt replacement)) (called (Math/sqrt 81)))
    (Reflect/deleteProperty namespace "sqrt")
    (js-array same called (eq Math/sqrt undefined)
     (try (globalThis/Math.sqrt 81) (catch error (get error :name)))
     (funcall held 9)))
   (finally (Object/defineProperty namespace "sqrt" saved)))))
(defun sqrt-metadata-mutation ()
 (let* ((method Math/sqrt) (name (Object/getOwnPropertyDescriptor method "name"))
        (length (Object/getOwnPropertyDescriptor method "length")))
  (try
   (Object/defineProperty method "name" (js-object :value "changed"))
   (Object/defineProperty method "length" (js-object :value 4))
   (js-array (get method :name) (get method :length) (funcall method 81))
   (finally (Object/defineProperty method "name" name) (Object/defineProperty method "length" length)))))
(defun sqrt-order (mode)
 (let* ((namespace (js* "Math")) (saved (Object/getOwnPropertyDescriptor namespace "sqrt"))
        (method (get saved :value)) (trace (js-array))
        (key (js-object)) (input (js-object :valueOf (lambda ()
         (js-call trace :push "number") (if (= mode 3) (throw false) 81)))))
  (put key (js* "Symbol.toPrimitive") (lambda (hint)
   (js-call trace :push hint) (if (= mode 1) (throw false) "sqrt")))
  (try
   (Object/defineProperty namespace "sqrt" (js-object :configurable t :get (lambda ()
    (js-call trace :push "method") (if (= mode 2) (throw false) method))))
   (js-array (try (js-call namespace key
      (progn (js-call trace :push "argument") input)
      (progn (js-call trace :push "extra") (js-object :valueOf (lambda () (throw "ignored")))))
     (catch error (if (eq error false) "marker" (throw error)))) trace)
   (finally (Object/defineProperty namespace "sqrt" saved)))))
(defun sqrt-construct (mode)
 (let ((method Math/sqrt) (trace (js-array)))
  (js-array (try
   (cond ((= mode 0) (new method (progn (js-call trace :push "argument") 81)))
    ((= mode 1) (Reflect/construct method (js-array 81)))
    (t (new (js-call method :bind nil) 81)))
   (catch error (get error :name))) trace)))
(defun sqrt-shadow ()
 (let ((Math (js-object :sqrt (lambda (value) (+ value 10))))) (Math/sqrt 2)))
(export sqrt-method sqrt-callback sqrt-call sqrt-held sqrt-arity sqrt-convert sqrt-throw
 sqrt-description sqrt-mutations sqrt-metadata-mutation sqrt-order sqrt-construct sqrt-shadow)
`;
const coldIntegerSource = `
(defun cold-integer-key (mode) (cond ((= mode 0) "round") ((= mode 1) "floor") ((= mode 2) "ceil") (t "trunc")))
(defun cold-integer-method (mode)
 (cond ((= mode 0) Math/round) ((= mode 1) globalThis/Math.floor)
  ((= mode 2) (js* "Math.ceil")) (t Math/trunc)))
(defun cold-integer-call (mode value)
 (cond ((= mode 0) (Math/round value)) ((= mode 1) (globalThis/Math.floor value))
  ((= mode 2) (js-call (js* "Math") :ceil value)) (t (Math/trunc value))))
(defun cold-held-call (method value) (funcall method value))
(defun cold-integer-description (method) (js-array (get method :name) (get method :length)))
(defun cold-integer-abrupt (mode marker)
 (cold-integer-call mode (js-object :valueOf (lambda () (throw marker)))))
(defun cold-integer-replacement (value) (js-array (eq (js* "this") (js* "Math")) value))
(defun cold-integer-relations (mode captured)
 (let* ((namespace (js* "Math")) (key (cold-integer-key mode))
        (descriptor (Object/getOwnPropertyDescriptor namespace key)))
  (js-array (eq captured (get namespace key)) (eq captured (cold-integer-method mode))
   (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable)
   (get captured :name) (get captured :length))))
(defun cold-integer-mutations (mode)
 (let* ((namespace (js* "Math")) (key (cold-integer-key mode))
        (descriptor (Object/getOwnPropertyDescriptor namespace key)) (original (get descriptor :value))
        (replacement cold-integer-replacement))
  (try (put namespace key replacement)
   (let ((same (eq (cold-integer-method mode) replacement)) (called (cold-integer-call mode -0.0)))
    (Reflect/deleteProperty namespace key)
    (js-array same called (eq (cold-integer-method mode) undefined)
     (try (cold-integer-call mode 1) (catch error (get error :name)))
     (cold-held-call original -0.0)))
   (finally (Object/defineProperty namespace key descriptor)))))
(defun cold-integer-order (mode abrupt)
 (let* ((namespace (js* "Math")) (key (cold-integer-key mode))
        (descriptor (Object/getOwnPropertyDescriptor namespace key)) (original (get descriptor :value))
        (replacement (lambda (value) 99)) (trace (js-object :step 0 :gets 0)))
  (try
   (Object/defineProperty namespace key (js-object :configurable t :get (lambda ()
    (put trace :step 1) (put trace :gets (+ (get trace :gets) 1))
    (if abrupt (throw false) original))))
   (let* ((argument (lambda () (put trace :step 2)
            (Object/defineProperty namespace key (js-object :value replacement :writable t :configurable t)) 7))
          (result (try (cond ((= mode 0) (Math/round (funcall argument)))
                        ((= mode 1) (globalThis/Math.floor (funcall argument)))
                        ((= mode 2) (js-call (js* "Math") :ceil (funcall argument)))
                        (t (Math/trunc (funcall argument))))
     (catch error (if (eq error false) "marker" (throw error))))))
    (js-array result (get trace :step) (get trace :gets)))
   (finally (Object/defineProperty namespace key descriptor)))))
(defun cold-integer-shadow ()
 (let ((Math (js-object :round (lambda (value) (+ value 10))))) (Math/round 2)))
(export cold-integer-method cold-integer-call cold-held-call cold-integer-description cold-integer-abrupt
 cold-integer-relations cold-integer-mutations cold-integer-order cold-integer-shadow)
`;
const coldNumberSource = `
(defun cold-number-value () (js* "Number"))
(defun cold-number-box (value) (new (js* "Number") value))
(defun cold-number-unbox (value) (js-call value :valueOf))
(defun cold-number-normalize (value constructor)
 (cond ((= (value-type value) "function")
         (js-array "function" (get value :name) (get value :length) (Object/hasOwn value "prototype")))
       ((= (value-type value) "object") (js-array "object" (Object/is value (get constructor :prototype))))
       ((= (value-type value) "number")
        (js-array "number" (cond ((Object/is value (/ 0 0)) "NaN")
          ((Object/is value -0.0) "-0") ((= value (/ 1 0)) "+Infinity")
          ((= value (/ -1 0)) "-Infinity") (t value))))
       (t (js-array (value-type value) value))))
(defun cold-number-first (constructor key mode)
 (cond ((= mode 0) (cold-number-normalize (get constructor key) constructor))
       ((= mode 1) (Object/hasOwn constructor key))
       ((= mode 2) (Reflect/has constructor key))
       ((= mode 3) (let ((descriptor (Object/getOwnPropertyDescriptor constructor key)))
         (js-array (cold-number-normalize (get descriptor :value) constructor)
          (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable))))
       ((= mode 4) (Object/getOwnPropertyNames constructor))
       ((= mode 5) (Object/keys constructor))
       (t (Reflect/ownKeys constructor))))
(defun cold-number-snapshot (constructor boxed)
 (let* ((names (Object/getOwnPropertyNames constructor)) (fields (js-array)) (index 0))
  (while (< index (get names :length))
   (let* ((key (aref names index)) (descriptor (Object/getOwnPropertyDescriptor constructor key)))
    (js-call fields :push (js-array key (cold-number-normalize (get descriptor :value) constructor)
      (get descriptor :writable) (get descriptor :enumerable) (get descriptor :configurable))))
   (setq index (1+ index)))
  (js-array names (Object/keys constructor) fields
   (Object/is (Object/getPrototypeOf constructor) (get globalThis/Function :prototype))
   (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))
   (Object/is (get (Object/getPrototypeOf boxed) :constructor) constructor)
   (Object/is (get constructor :parseInt) (js* "globalThis.parseInt"))
   (Object/is (get constructor :parseFloat) (js* "globalThis.parseFloat"))
   (Object/is (cold-number-unbox boxed) -0.0))))
(defun cold-number-key-error (constructor trace)
 (let ((key (js-object)))
  (put key (get globalThis/Symbol :toPrimitive) (lambda (hint) (js-call trace :push hint) (throw false)))
  (get constructor key)))
(defun cold-number-target () nil)
(defun cold-number-newtarget (value)
 (let* ((target cold-number-target) (saved (get target :prototype)) (prototype (js-object :marker 7)))
  (try
   (put target :prototype prototype)
   (let ((boxed (Reflect/construct (js* "Number") (js-array value) target)))
    (js-array (Object/is (Object/getPrototypeOf boxed) prototype)
     (Object/is (js-call (get (get (js* "Number") :prototype) :valueOf) :call boxed) -0.0)))
   (finally (put target :prototype saved)))))
(defun cold-number-descriptor-cycle (kind writable-mode)
 (let* ((target (cond ((= kind 0) (js-object)) ((= kind 1) (js-array)) (t cold-number-target)))
        (key (if (= kind 1) "0" "__number_descriptor_case__")))
  (try
   (Object/defineProperty target key (js-object :value 1 :writable t :enumerable t :configurable t))
   (let ((saved (Object/getOwnPropertyDescriptor target key)))
    (Object/defineProperty target key (js-object :get (lambda () 2)))
    (Object/defineProperty target key
     (cond ((= writable-mode 0) (js-object :value 3 :writable t))
           ((= writable-mode 1) (js-object :value 3 :writable false)) (t (js-object :value 3))))
    (let* ((descriptor (Object/getOwnPropertyDescriptor target key))
           (written (Reflect/set target key 4)) (after (get target key)))
     (Object/defineProperty target key (js-object :get (lambda () 2)))
     (Object/defineProperty target key saved)
     (put target key 5)
     (let ((restored (Object/getOwnPropertyDescriptor target key)))
      (js-array (get descriptor :value) (get descriptor :writable) (get descriptor :enumerable)
       (get descriptor :configurable) written after (get restored :value) (get restored :writable)
       (get restored :enumerable) (get restored :configurable)))))
   (finally (Reflect/deleteProperty target key)))))
(defun cold-number-order (constructor abrupt)
 (let* ((trace (js-array)) (key (js-object))
        (saved (Object/getOwnPropertyDescriptor constructor "isFinite")) (original (get saved :value)))
  (put key (get globalThis/Symbol :toPrimitive)
   (lambda (hint) (js-call trace :push hint) (if abrupt (throw false) "isFinite")))
  (try
   (Object/defineProperty constructor "isFinite" (js-object :configurable t :get
    (lambda () (js-call trace :push "get") original)))
   (js-array (try (js-call constructor key
     (progn (js-call trace :push "argument")
      (Object/defineProperty constructor "isFinite" (js-object :value (lambda (value) 77) :writable t :configurable t)) 7))
     (catch error (if (Object/is error false) "marker" (throw error)))) trace)
   (finally (Object/defineProperty constructor "isFinite" saved)))))
(defun cold-number-mutations (constructor &optional trace)
 (let* ((saved (Object/getOwnPropertyDescriptor constructor "isFinite"))
        (parser (Object/getOwnPropertyDescriptor constructor "parseInt"))
        (original (get saved :value)))
  (try
   (when trace (js-call trace :push "set isFinite"))
   (put constructor :isFinite (lambda (value) 77))
   (when trace (js-call trace :push "call replacement"))
   (let ((replacement (js-call constructor :isFinite "input")))
    (when trace (js-call trace :push "delete isFinite"))
    (Reflect/deleteProperty constructor "isFinite")
    (when trace (js-call trace :push "set parseInt"))
    (put constructor :parseInt (lambda (input radix) 88))
    (let* ((present (progn (when trace (js-call trace :push "has deleted isFinite")) (Object/hasOwn constructor "isFinite")))
           (missing (progn (when trace (js-call trace :push "read deleted isFinite")) (get constructor :isFinite)))
           (held (progn (when trace (js-call trace :push "call held isFinite")) (funcall original 7)))
           (replaced-parser (progn (when trace (js-call trace :push "call replacement parseInt")) (js-call constructor :parseInt "10" 10)))
           (global-parser (progn (when trace (js-call trace :push "call original parseInt")) (funcall (js* "globalThis.parseInt") "10" 10)))
           (reflected (progn (when trace (js-call trace :push "Reflect.set EPSILON")) (Reflect/set constructor "EPSILON" 7)))
           (strict (progn (when trace (js-call trace :push "strict set EPSILON"))
             (try (put constructor :EPSILON 7) (catch error (get error :name))))))
     (js-array replacement present missing held replaced-parser global-parser reflected strict)))
   (finally
    (when trace (js-call trace :push "restore isFinite"))
    (Object/defineProperty constructor "isFinite" saved)
    (when trace (js-call trace :push "restore parseInt"))
    (Object/defineProperty constructor "parseInt" parser)
    (when trace (js-call trace :push "restored"))))))
(export cold-number-value cold-number-box cold-number-unbox cold-number-first cold-number-snapshot
 cold-number-key-error cold-number-newtarget cold-number-descriptor-cycle cold-number-order cold-number-mutations)
`;

function managedBytes(product) {
  // This is emit-managed-wasm's exact typed emission and descriptor envelope,
  // reusing the lowering already needed by the native emitter.
  return Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(product.typed),
    'eliscript-managed-control', JSON.stringify(product.descriptor)));
}
function nativeBinding(product) {
  // Match the native loader's consumed ABI metadata. Executable bodies live
  // in the emitted library; do not retain two complete runtime typed graphs.
  return {descriptor: product.descriptor, ...(product.debug ? {debug: product.debug} : {}), typed: {
    abi: product.typed.abi,
    functions: product.typed.functions.map(({name, arity}) => ({name, arity})),
    exports: product.typed.exports.slice(),
    ...(product.typed.aliases === undefined ? {} : {
      aliases: product.typed.aliases.map(({name, function: target}) => ({name, function: target})),
    }),
  }};
}

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-math-'));
  backend = await buildBackends({outputRoot: directory});
  const runtime = backend.compiler.compile_ir_string(
    await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  const program = backend.compiler.compile_ir_string(
    await readFile('tests/fixtures/wasm-managed-math.eli', 'utf8'), 'math.eli');
  const saved = JSON.stringify(program);
  const javascript = backend.compiler.emit_ir_string(program);
  referencePath = resolve(directory, 'math-reference.mjs');
  wasmPath = resolve(directory, 'math.wasm');
  await writeFile(referencePath, javascript);
  // Freezing the actual JS Math object cannot be undone. Its independent oracle
  // therefore runs in its own process and never touches the Bun test realm.
  const child = spawnSync('node', ['--input-type=module', '-e', `
    const reference = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(reference.freeze_namespace()));
  `, pathToFileURL(referencePath).href], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
  frozenReference = JSON.parse(child.stdout);
  const referenceBytes = await readFile(referencePath);
  assert.equal(referenceBytes.toString('utf8'), javascript, 'the Bun oracle must execute the exact file bytes verified by Node');
  for (const dependency of new Bun.Transpiler({loader: 'js'}).scanImports(javascript)) {
    assert.equal(dependency.kind, 'import-statement', 'the standalone Math oracle permits only static capsule dependencies');
    assert.match(dependency.path, /^data:text\/javascript;base64,[A-Za-z0-9+/]+={0,2}$/,
      'the standalone Math oracle must not hide relative, package or other URL dependencies');
  }
  // Absolute embedded capsules resolve identically from a file or data URL.
  // Node above still exercises the actual file and its dependency resolution.
  try {reference = await import('data:text/javascript;base64,' + referenceBytes.toString('base64'));}
  catch (cause) {
    throw new Error('Math JS oracle import failed: ' + referencePath + ' (' + referenceBytes.length +
      ' written bytes, ' + Buffer.byteLength(javascript) + ' emitted bytes): ' + (cause?.stack ?? String(cause)), {cause});
  }
  lowered = backend.managed.lower_managed_program(program, runtime);
  bytes = managedBytes(lowered);
  assert.equal(JSON.stringify(program), saved, 'lowering must not mutate source IR');
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  await writeFile(wasmPath, bytes);
  if (nativeTarget) {
    nativePath = resolve(directory, nativeTarget === 'arm64-macos' ? 'math.dylib' : 'math.so');
    await writeFile(nativePath, Uint8Array.from(
      backend.native.emit_typed_native_memory_library(lowered.typed, nativeTarget)));
    assert.equal(JSON.stringify(program), saved, 'native preparation must preserve source IR');
    lowered = nativeBinding(lowered);
  } else {
    lowered = undefined;
  }
  // Cold-call regressions own a separate module and heap. Appending their
  // exported functions to the original fixture would permanently consume its
  // unchanged 1024-slot budget, including in the native/Node composite cases.
  // Reuse the same frontend, backends and compiled runtime for both products.
  const coldProgram = backend.compiler.compile_ir_string(coldIntegerSource, 'cold-math.eli');
  const savedCold = JSON.stringify(coldProgram);
  const coldJavascript = backend.compiler.emit_ir_string(coldProgram);
  const coldReferencePath = resolve(directory, 'cold-math-reference.mjs');
  await writeFile(coldReferencePath, coldJavascript);
  const coldReferenceBytes = await readFile(coldReferencePath);
  assert.equal(coldReferenceBytes.toString('utf8'), coldJavascript,
    'the cold Math oracle must execute the exact emitted file bytes');
  for (const dependency of new Bun.Transpiler({loader: 'js'}).scanImports(coldJavascript)) {
    assert.equal(dependency.kind, 'import-statement', 'the cold Math oracle permits only static capsule dependencies');
    assert.match(dependency.path, /^data:text\/javascript;base64,[A-Za-z0-9+/]+={0,2}$/,
      'the cold Math oracle must not hide relative, package or other URL dependencies');
  }
  coldReference = await import('data:text/javascript;base64,' + coldReferenceBytes.toString('base64'));
  coldLowered = backend.managed.lower_managed_program(coldProgram, runtime);
  coldBytes = managedBytes(coldLowered);
  assert.equal(JSON.stringify(coldProgram), savedCold, 'cold lowering must not mutate source IR');
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(coldBytes)), []);
  if (nativeTarget) {
    coldNativePath = resolve(directory, nativeTarget === 'arm64-macos' ? 'cold-math.dylib' : 'cold-math.so');
    await writeFile(coldNativePath, Uint8Array.from(
      backend.native.emit_typed_native_memory_library(coldLowered.typed, nativeTarget)));
    assert.equal(JSON.stringify(coldProgram), savedCold, 'cold native preparation must preserve source IR');
    coldLowered = nativeBinding(coldLowered);
  } else {
    coldLowered = undefined;
  }
  const numberProgram = backend.compiler.compile_ir_string(coldNumberSource, 'cold-number.eli');
  const savedNumber = JSON.stringify(numberProgram), numberJavascript = backend.compiler.emit_ir_string(numberProgram);
  const numberReferencePath = resolve(directory, 'cold-number-reference.mjs');
  await writeFile(numberReferencePath, numberJavascript);
  const numberReferenceBytes = await readFile(numberReferencePath);
  assert.equal(numberReferenceBytes.toString('utf8'), numberJavascript);
  for (const dependency of new Bun.Transpiler({loader: 'js'}).scanImports(numberJavascript)) {
    assert.equal(dependency.kind, 'import-statement');
    assert.match(dependency.path, /^data:text\/javascript;base64,[A-Za-z0-9+/]+={0,2}$/);
  }
  // This oracle deletes/reinserts constructor properties. Run those exact
  // generated bytes in Node so it cannot reorder the Bun test realm's Number.
  const numberChild = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const m=await import(process.argv[1]),constructor=m.cold_number_value(),boxed=m.cold_number_box(-0);
    const first=Array.from({length:7},(_,mode)=>m.cold_number_first(constructor,'isFinite',mode));
    const snapshot=m.cold_number_snapshot(constructor,boxed),trace=[];
    let thrown=false;try{m.cold_number_key_error(constructor,trace);}catch(error){thrown=true;assert.strictEqual(error,false);}
    assert(thrown);assert.deepEqual(trace,['string']);
    const newTarget=m.cold_number_newtarget(-0);assert.deepEqual(newTarget,[true,true]);
    const descriptorCycles=Array.from({length:3},(_,kind)=>Array.from({length:3},(_,mode)=>m.cold_number_descriptor_cycle(kind,mode)));
    const order=[false,true].map(abrupt=>m.cold_number_order(constructor,abrupt));
    const mutationTrace=[],mutations=m.cold_number_mutations(constructor,mutationTrace);
    process.stdout.write(JSON.stringify({first,snapshot,newTarget,descriptorCycles,order,mutations,mutationTrace},(_,value)=>value===undefined?{undefined:true}:value));
  `, pathToFileURL(numberReferencePath).href], {encoding: 'utf8', timeout: 30000});
  assert.equal(numberChild.error, undefined);assert.equal(numberChild.signal, null);
  assert.equal(numberChild.status, 0, numberChild.stderr);
  const numberDocument = JSON.parse(numberChild.stdout);
  const decodeNumberOracle = value => Array.isArray(value) ? value.map(decodeNumberOracle)
    : value?.undefined === true ? undefined : value;
  numberOracle = Object.fromEntries(Object.entries(numberDocument).map(([key, value]) => [key, decodeNumberOracle(value)]));
  numberLowered = backend.managed.lower_managed_program(numberProgram, runtime);
  numberBytes = managedBytes(numberLowered);
  assert.equal(JSON.stringify(numberProgram), savedNumber, 'cold Number lowering must preserve source IR');
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(numberBytes)), []);
  if (nativeTarget) {
    numberNativePath = resolve(directory, nativeTarget === 'arm64-macos' ? 'cold-number.dylib' : 'cold-number.so');
    await writeFile(numberNativePath, Uint8Array.from(
      backend.native.emit_typed_native_memory_library(numberLowered.typed, nativeTarget)));
    assert.equal(JSON.stringify(numberProgram), savedNumber, 'cold Number native emission must preserve source IR');
    numberLowered = nativeBinding(numberLowered);
  } else {
    numberLowered = undefined;
  }
  const sqrtProgram = backend.compiler.compile_ir_string(sqrtSource, 'sqrt-math.eli');
  const savedSqrt = JSON.stringify(sqrtProgram), sqrtJavascript = backend.compiler.emit_ir_string(sqrtProgram);
  sqrtReferencePath = resolve(directory, 'sqrt-math-reference.mjs');
  sqrtWasmPath = resolve(directory, 'sqrt-math.wasm');
  await writeFile(sqrtReferencePath, sqrtJavascript);
  const sqrtReferenceBytes = await readFile(sqrtReferencePath);
  assert.equal(sqrtReferenceBytes.toString('utf8'), sqrtJavascript);
  for (const dependency of new Bun.Transpiler({loader: 'js'}).scanImports(sqrtJavascript)) {
    assert.equal(dependency.kind, 'import-statement');
    assert.match(dependency.path, /^data:text\/javascript;base64,[A-Za-z0-9+/]+={0,2}$/);
  }
  sqrtReference = await import('data:text/javascript;base64,' + sqrtReferenceBytes.toString('base64'));
  sqrtLowered = backend.managed.lower_managed_program(sqrtProgram, runtime);
  sqrtBytes = managedBytes(sqrtLowered);
  assert.equal(JSON.stringify(sqrtProgram), savedSqrt, 'sqrt lowering must preserve source IR');
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(sqrtBytes)), []);
  await writeFile(sqrtWasmPath, sqrtBytes);
  if (nativeTarget) {
    sqrtNativePath = resolve(directory, nativeTarget === 'arm64-macos' ? 'sqrt-math.dylib' : 'sqrt-math.so');
    await writeFile(sqrtNativePath, Uint8Array.from(
      backend.native.emit_typed_native_memory_library(sqrtLowered.typed, nativeTarget)));
    assert.equal(JSON.stringify(sqrtProgram), savedSqrt, 'sqrt native emission must preserve source IR');
    sqrtLowered = nativeBinding(sqrtLowered);
  } else {
    sqrtLowered = undefined;
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function read(a, value) {
  if (value?.kind === 4) return a.readNumber(value);
  if (value?.kind === 5) return a.readString(value);
  if (value?.kind === 14) {
    const output = [];
    for (let index = 0; index < a.length(value); index++) {
      const child = a.get(value, index);
      try {output.push(read(a, child));} finally {a.release(child);}
    }
    return output;
  }
  return value;
}
function value(a, name, argumentsList = []) {
  const result = a.invoke(name, argumentsList);
  try {return read(a, result);} finally {a.release(result);}
}
function box(a, input) {
  return typeof input === 'number' ? a.number(input) : typeof input === 'string' ? a.string(input) : input;
}
function invoke(a, name, inputs = []) {
  const roots = [];
  try {
    for (const input of inputs) roots.push(box(a, input));
    return value(a, name, roots);
  } finally {for (const root of roots) a.release(root);}
}
function exact(actual, expected, label) {
  assert(Object.is(actual, expected), `${label}: got ${String(actual)}, expected ${String(expected)}`);
}
function finish(a) {
  try {
    a.closeModule();
    a.collect();
    assert.equal(a.stats().frameDepth, 0);
    assert.equal(a.live(), 0);
  } finally {a.close?.();}
}
function withWasm(check, product = bytes) {
  const a = instantiateManagedRuntime(product);
  a.auto(1);
  try {check(a);} finally {finish(a);}
}
function compareFixture(a, name, inputs = []) {
  const jsName = name.replaceAll('-', '_');
  assert.deepEqual(invoke(a, name, inputs), reference[jsName](...inputs), name + '/' + inputs.join(','));
  assert.equal(a.stats().frameDepth, 0, name + ' must restore all frames');
}
function checkNamespace(a) {
  compareFixture(a, 'namespace-summary');
  compareFixture(a, 'namespace-tag-description');
  compareFixture(a, 'lexical-shadow');
  assert.deepEqual(reference.lexical_shadow(), [10, 11, 23]);
  const namespace = a.invoke('namespace-value');
  const global = a.invoke('namespace-via-global');
  const raw = a.invoke('namespace-via-raw');
  const absKey = a.string('abs');
  const abs = a.invoke('namespace-pass', [namespace, absKey]);
  const qualified = a.invoke('qualified-abs-value');
  try {
    assert.equal(namespace.kind, 13, 'Math is an ordinary namespace object');
    assert(a.keyEqual(namespace, global));
    assert(a.keyEqual(namespace, raw));
    assert(a.keyEqual(abs, qualified));
    for (const name of Object.keys(methodLengths)) compareFixture(a, 'method-description', [name]);
    for (const name of constants) compareFixture(a, 'constant-description', [name]);
    compareFixture(a, 'method-description', ['sqrt']);
    for (const input of [1, -0, Number.MIN_VALUE, Number.MAX_VALUE, -1])
      exact(invoke(a, 'math-invoke', ['sqrt', input]), Math.sqrt(input), 'namespace sqrt receiver');
    for (const name of ['acos', 'random']) {
      compareFixture(a, 'method-description', [name]);
      const actual = invoke(a, 'math-invoke', [name, 1]);
      if (name === 'acos') exact(actual, Math.acos(1), 'the original acos input now executes exactly');
      else assert(actual >= 0 && actual < 1, 'the original random input executes while its extra argument remains ignored');
    }
    const names = value(a, 'namespace-names');
    for (const key of [...constants, ...Object.keys(methodLengths), 'acos', 'sqrt', 'random']) assert(names.includes(key));
    assert(names.every(key => typeof key === 'string' && !key.startsWith('__eliscript')),
      'private holder and cache keys must not become visible own properties');
    a.collect();
    const again = a.invoke('namespace-value'), againAbs = a.invoke('qualified-abs-value');
    try {assert(a.keyEqual(namespace, again));assert(a.keyEqual(abs, againAbs));}
    finally {a.release(again);a.release(againAbs);}
  } finally {for (const root of [namespace, global, raw, absKey, abs, qualified]) a.release(root);}
}
function checkMutations(a) {
  for (const name of ['namespace-mutation', 'namespace-extension', 'namespace-constant-errors']) compareFixture(a, name);
  assert.deepEqual(reference.namespace_mutation(), [17, true, 7, false, undefined, undefined]);
  for (const dynamic of [false, true]) for (const abrupt of [false, true]) {
    compareFixture(a, 'callee-order', [dynamic, abrupt]);
    assert.deepEqual(reference.callee_order(dynamic, abrupt), abrupt ? [true, ['get']] : [107, ['get', 'arg']]);
  }
  for (const abrupt of [false, true]) {
    compareFixture(a, 'key-order', [abrupt]);
    assert.deepEqual(reference.key_order(abrupt), abrupt ? [true, ['string']] : [3, ['string', 'arg']]);
  }
  // A source mutation must survive after every temporary namespace handle dies.
  // The default realm cache itself must not be mistaken for a permanent root.
  const negativeZero = a.number(-0), namespace = a.invoke('namespace-value');
  const froundKey = a.string('fround'), fround = a.invoke('namespace-pass', [namespace, froundKey]);
  try {
    exact(value(a, 'set-namespace-state', [negativeZero]), -0, 'namespace mutation');
    a.collect();
    exact(value(a, 'read-namespace-state'), -0, 'namespace mutation after GC');
    const captured = value(a, 'invoke-held', [fround, negativeZero]);
    exact(captured, Math.fround(-0), 'method held through namespace back-edge');
  } finally {
    a.release(negativeZero);a.release(namespace);a.release(froundKey);a.release(fround);
  }
  a.collect();
  exact(value(a, 'read-namespace-state'), -0, 'public mutation without caller roots');
  assert.equal(value(a, 'delete-namespace-state'), true);
}
function checkUnary(a) {
  for (const name of unaryNames) {
    for (const input of primitives) {
      const expected = Math[name](input);
      exact(invoke(a, 'direct-' + name, [input]), expected, 'direct ' + name + '/' + String(input));
      exact(invoke(a, 'math-invoke', [name, input]), expected, 'dynamic ' + name + '/' + String(input));
    }
    for (const args of [[], [undefined], [null], [-0, 99, 'ignored']])
      exact(invoke(a, 'math-invoke', [name, ...args]), Math[name](...args), name + ' logical arity');
  }
  for (let bit = 0; bit < 32; bit++) {
    for (const input of [2 ** bit, 2 ** bit - 1, 2 ** bit + 1, -(2 ** bit)])
      exact(invoke(a, 'direct-clz32', [input]), Math.clz32(input), 'clz32 bit ' + bit);
  }
}
function checkImul(a) {
  const pairs = [[0, -0], [NaN, 7], [Infinity, -Infinity], [-1, 5], [0xffffffff, 5],
    [0x80000000, 2], [0x7fffffff, 0x7fffffff], [0xffffffff, 0xffffffff],
    [2 ** 53 - 1, -(2 ** 32) - 1], ['0xffffffff', '-1'], [undefined, true], [null, '3']];
  let seed = 0x1c7a6e39;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let index = 0; index < 64; index++) pairs.push([next(), next()]);
  for (const [left, right] of pairs) {
    exact(invoke(a, 'direct-imul', [left, right]), Math.imul(left, right), 'direct imul');
    exact(invoke(a, 'math-invoke', ['imul', left, right]), Math.imul(left, right), 'dynamic imul');
  }
  for (const args of [[], [7], [undefined, 7], [7, undefined], [3, 5, 99]])
    exact(invoke(a, 'math-invoke', ['imul', ...args]), Math.imul(...args), 'imul logical arity');
}
function checkConversions(a) {
  for (const name of [...unaryNames, 'imul']) {
    compareFixture(a, 'conversion-order', [name]);
    const expectedTrace = ['arg-a', 'arg-b', 'arg-extra', 'a.valueOf', 'a.toString'];
    if (name === 'imul') expectedTrace.push('b.valueOf');
    assert.deepEqual(reference.conversion_order(name)[1], expectedTrace);
    compareFixture(a, 'conversion-hint', [name]);
    assert.deepEqual(reference.conversion_hint(name)[1], ['number', true]);
    compareFixture(a, 'primitive-rejections', [name]);
    assert.deepEqual(reference.primitive_rejections(name), ['TypeError', 'TypeError', 'TypeError']);
    for (const mode of [0, 1, 2]) compareFixture(a, 'conversion-abrupt', [name, mode]);
    assert.deepEqual(reference.conversion_abrupt(name, 0), ['marker', ['arg-a', 'arg-b', 'a.valueOf'], 9]);
    assert.deepEqual(reference.conversion_abrupt(name, 2), ['TypeError', ['arg-a', 'arg-b', 'a.valueOf', 'a.toString'], 9]);
    assert.equal(reference.conversion_abrupt(name, 1)[0], name === 'imul' ? 'marker' : name === 'clz32' ? 32 : NaN);
  }
  for (const name of ['min', 'max']) {
    compareFixture(a, 'extreme-order', [name]);
    assert.deepEqual(reference.extreme_order(name), [true, ['arg-a', 'arg-b', 'arg-c', 'arg-d', 'a', 'b', 'c']]);
    for (const args of [[], [-0], [0, -0], [-0, 0], [NaN, 4], [4, NaN], [undefined], [1, 9, -7, 2]])
      exact(invoke(a, 'math-invoke', [name, ...args]), Math[name](...args), name + ' extremes');
  }
}

// Neighboring binary64 values make midpoint tests distinguish ties-to-even from
// truncation, ties-away, and an inaccurate intermediate decimal conversion.
function adjacent(value, upward) {
  if (Number.isNaN(value)) return value;
  if (value === 0) return upward ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, true);
  let word = bits.getBigUint64(0, true);
  word += (value > 0) === upward ? 1n : -1n;
  bits.setBigUint64(0, word, true);
  return bits.getFloat64(0, true);
}
function froundBoundaries() {
  const midpoints = [1 + 2 ** -24, 1 + 3 * 2 ** -24,
    2 ** -150, 3 * 2 ** -150, 2 ** -126 - 2 ** -150,
    2 ** -126 + 2 ** -150, 2 ** 128 - 2 ** 103];
  const out = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE,
    Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** -149, 2 ** -126,
    (2 - 2 ** -23) * 2 ** 127, 2 ** 128];
  for (const midpoint of midpoints) for (const value of [adjacent(midpoint, false), midpoint, adjacent(midpoint, true)])
    out.push(value, -value);
  return out;
}
function froundRandom() {
  const out = [], bits = new DataView(new ArrayBuffer(8));
  let seed = 0x6d2b79f5;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let index = 0; index < 128; index++) {
    bits.setUint32(0, next(), true);bits.setUint32(4, next(), true);
    out.push(bits.getFloat64(0, true));
  }
  // Include representative binary32 exponent classes and both signs as exact f64 inputs.
  for (let exponent = 0; exponent < 256; exponent += 7) {
    const fraction = next() & 0x7fffff;
    bits.setUint32(0, (exponent << 23) | fraction, true);
    const value = bits.getFloat32(0, true);out.push(value, -value);
  }
  for (const [low, high] of [[1, 0x7ff00000], [0xffffffff, 0x7fffffff], [17, 0xfff80000]]) {
    bits.setUint32(0, low, true);bits.setUint32(4, high, true);out.push(bits.getFloat64(0, true));
  }
  return out;
}
function checkFround(a, inputs) {
  const key = a.string('fround'), method = a.invoke('namespace-get', [key]);
  try {
    for (const [index, input] of inputs.entries()) {
      const expected = Math.fround(input);
      exact(invoke(a, 'direct-fround', [input]), expected, 'direct fround case ' + index);
      exact(invoke(a, 'math-invoke', ['fround', input]), expected, 'dynamic fround case ' + index);
      const argument = a.number(input);
      try {exact(value(a, 'invoke-held', [method, argument]), expected, 'held fround case ' + index);}
      finally {a.release(argument);}
    }
    assert.equal(a.stats().frameDepth, 0);
  } finally {a.release(key);a.release(method);}
}

// Independent integer model. Every finite binary64 value is an integer
// multiple of 2^-1074; no intermediate floating addition is used here.
function numberWord(number) {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, number, true);
  return bits.getBigUint64(0, true);
}
function wordNumber(word) {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setBigUint64(0, word, true);
  return bits.getFloat64(0, true);
}
function finiteUnits(number) {
  const word = numberWord(number), exponent = Number((word >> 52n) & 2047n);
  const fraction = word & ((1n << 52n) - 1n);
  const magnitude = exponent === 0 ? fraction : ((1n << 52n) | fraction) << BigInt(exponent - 1);
  return (word >> 63n) === 0n ? magnitude : -magnitude;
}
function roundIntegerEven(magnitude, shift) {
  if (shift === 0) return magnitude;
  const distance = BigInt(shift), quotient = magnitude >> distance;
  const remainder = magnitude - (quotient << distance), half = 1n << (distance - 1n);
  return quotient + (remainder > half || (remainder === half && (quotient & 1n) !== 0n) ? 1n : 0n);
}
function unitsNumber(units, negativeZero = false) {
  if (units === 0n) return negativeZero ? -0 : 0;
  const sign = units < 0n ? 1n << 63n : 0n, magnitude = units < 0n ? -units : units;
  if (magnitude < (1n << 52n)) return wordNumber(sign | magnitude);
  let shift = Math.max(0, magnitude.toString(2).length - 53);
  let significand = roundIntegerEven(magnitude, shift);
  if (significand === (1n << 53n)) {significand >>= 1n;shift++;}
  const exponent = shift + 1;
  if (exponent >= 2047) return sign === 0n ? Infinity : -Infinity;
  return wordNumber(sign | (BigInt(exponent) << 52n) | (significand - (1n << 52n)));
}
function f16Model(input) {
  const number = +input;
  if (!Number.isFinite(number) || number === 0) return number;
  const units = finiteUnits(number), magnitude = units < 0n ? -units : units;
  // binary16 has ten fraction bits and the subnormal quantum is 2^-24.
  const shift = Math.max(1050, magnitude.toString(2).length - 11);
  const rounded = roundIntegerEven(magnitude, shift) << BigInt(shift);
  if (rounded >= (1n << 1090n)) return units < 0n ? -Infinity : Infinity;
  return unitsNumber(units < 0n ? -rounded : rounded, units < 0n);
}
function exactBits(actual, expected, label) {
  if (Number.isNaN(expected)) assert(Number.isNaN(actual), label + ': NaN');
  else assert.equal(numberWord(actual), numberWord(expected), label + ': binary64 result bits');
}
function f16Boundaries() {
  const inputs = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE,
    Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** -24, 2 ** -14, 65504, 65536];
  const midpoints = [2 ** -25, 3 * 2 ** -25, 2 ** -14 - 2 ** -25,
    2 ** -14 + 2 ** -25, 1 + 2 ** -11, 1 + 3 * 2 ** -11, 65520];
  for (const midpoint of midpoints)
    for (const number of [adjacent(midpoint, false), midpoint, adjacent(midpoint, true)])
      inputs.push(number, -number);
  // A binary32 intermediate erases which side of this binary16 tie was used.
  const doubleRound = adjacent(1 + 2 ** -11, true);
  assert.equal(f16Model(doubleRound), 1 + 2 ** -10);
  assert.equal(f16Model(Math.fround(doubleRound)), 1);
  return inputs;
}
function checkF16(a) {
  const key = a.string('f16round'), method = a.invoke('namespace-get', [key]);
  try {
    assert.deepEqual(invoke(a, 'method-description', ['f16round']), [true, true, true, false, true, 'f16round', 1, false]);
    const inputs = [...f16Boundaries(), ...froundRandom().slice(0, 48)];
    for (const [index, input] of inputs.entries()) {
      const expected = f16Model(input);
      if (typeof Math.f16round === 'function') exactBits(Math.f16round(input), expected, 'host f16 oracle ' + index);
      exactBits(invoke(a, 'direct-f16round', [input]), expected, 'direct f16 case ' + index);
      exactBits(invoke(a, 'math-invoke', ['f16round', input]), expected, 'dynamic f16 case ' + index);
      const argument = a.number(input);
      try {exactBits(value(a, 'invoke-held', [method, argument]), expected, 'held f16 case ' + index);}
      finally {a.release(argument);}
    }
    for (const input of primitives)
      exactBits(invoke(a, 'direct-f16round', [input]), f16Model(input), 'f16 primitive ' + String(input));
    exactBits(invoke(a, 'math-invoke', ['f16round']), NaN, 'f16 omitted argument');
    exactBits(invoke(a, 'math-invoke', ['f16round', -0, 19]), -0, 'f16 ignored extra argument');
    assert.deepEqual(invoke(a, 'conversion-order', ['f16round']), [-1.5,
      ['arg-a', 'arg-b', 'arg-extra', 'a.valueOf', 'a.toString']]);
    assert.deepEqual(invoke(a, 'conversion-hint', ['f16round']), [-0, ['number', true]]);
    assert.deepEqual(invoke(a, 'primitive-rejections', ['f16round']), ['TypeError', 'TypeError', 'TypeError']);
    assert.deepEqual(invoke(a, 'conversion-abrupt', ['f16round', 0]), ['marker', ['arg-a', 'arg-b', 'a.valueOf'], 9]);
    assert.deepEqual(invoke(a, 'conversion-abrupt', ['f16round', 2]), ['TypeError', ['arg-a', 'arg-b', 'a.valueOf', 'a.toString'], 9]);
    assert.equal(a.stats().frameDepth, 0);
  } finally {a.release(method);a.release(key);}
}
function sumPreciseModel(iterable) {
  const method = iterable[Symbol.iterator];
  if (typeof method !== 'function') throw new TypeError('not iterable');
  const iterator = Reflect.apply(method, iterable, []);
  const isObject = value => (typeof value === 'object' && value !== null) || typeof value === 'function';
  if (!isObject(iterator)) throw new TypeError('iterator must be an object');
  const next = iterator.next;
  let units = 0n, allMinusZero = true, nan = false, positiveInfinity = false, negativeInfinity = false;
  for (;;) {
    // IteratorStepValue's own failures do not call IteratorClose.
    const result = Reflect.apply(next, iterator, []);
    if (!isObject(result)) throw new TypeError('iterator result must be an object');
    if (result.done) break;
    const item = result.value;
    if (typeof item !== 'number') {
      const original = new TypeError('sumPrecise requires Number elements');
      try {
        const close = iterator.return;
        if (close !== undefined && close !== null) {
          const closed = Reflect.apply(close, iterator, []);
          if (!isObject(closed)) throw new TypeError('iterator return must be an object');
        }
      } catch { /* The original abrupt completion takes precedence. */ }
      throw original;
    }
    allMinusZero &&= Object.is(item, -0);
    if (Number.isNaN(item)) nan = true;
    else if (item === Infinity) positiveInfinity = true;
    else if (item === -Infinity) negativeInfinity = true;
    else units += finiteUnits(item);
  }
  if (nan || (positiveInfinity && negativeInfinity)) return NaN;
  if (positiveInfinity) return Infinity;
  if (negativeInfinity) return -Infinity;
  return unitsNumber(units, allMinusZero);
}
function sumSamples() {
  const maximum = Number.MAX_VALUE, tiny = Number.MIN_VALUE;
  const samples = [[], [-0], [-0, -0], [0], [-0, 0], [1, -1],
    [1e16, 1, -1e16], [1e16, -1e16, 1], [maximum, maximum, -maximum],
    [-maximum, -maximum, maximum], [maximum, maximum, -maximum, -maximum, tiny],
    [maximum, maximum], [-maximum, -maximum], [tiny, tiny, -tiny], [tiny, -tiny],
    [2 ** -1022, -(2 ** -1022), tiny], [1, 2 ** -53], [1, 2 ** -53, tiny],
    [1, 2 ** -52, 2 ** -53], [1, 2 ** -52, 2 ** -53, -tiny],
    [Infinity], [-Infinity], [Infinity, -Infinity], [NaN], [NaN, Infinity],
    [Infinity, maximum, -maximum], [-Infinity, maximum, -maximum]];
  const random = froundRandom().filter(Number.isFinite);
  for (let index = 0; index < 24; index++) {
    const x = random[index], y = random[index + 24], z = random[index + 48];
    samples.push([x, y, -x, z, -y], [-x, -y, x, -z, y]);
  }
  return samples;
}
function sumIteratorObservation(mode, sum = sumPreciseModel) {
  const trace = [], marker = {}, bad = {
    valueOf() {trace.push('bad.valueOf');throw marker;},
    toString() {trace.push('bad.toString');throw marker;}
  };
  const values = mode === 6 ? [1n] : mode === 7 ? [new Number(1)] : mode === 19 ? [NaN, bad]
    : mode === 20 ? [Infinity, bad] : mode === 17 ? [5]
    : mode === 25 ? [Symbol('sum element')] : mode === 26 ? ['1'] : mode === 27 ? [false]
    : mode === 28 ? [null] : mode === 29 ? [undefined]
    : [5, 8, 9, 10, 11, 22, 23].includes(mode) ? [bad] : [1e16, 1, -1e16];
  const iterator = {position: 0};
  Object.defineProperty(iterator, 'next', {configurable: true, get() {
    trace.push('next.get');if (mode === 1) throw marker;
    if (mode === 21) return false;
    return function (...args) {
      trace.push('next.call', args.length, this === iterator);
      if (mode === 2) throw marker;
      if (mode === 14) throw new RangeError('next failure');
      if (mode === 15) return 7;
      const position = iterator.position++;
      return {get done() {
        trace.push('done.get');if (mode === 3) throw marker;
        if (mode === 24 && position === 0)
          Object.defineProperty(iterator, 'next', {configurable: true, get() {trace.push('replacement.next.get');throw marker;}});
        return mode === 16 ? 'finished' : mode === 17 ? (position === 0 ? NaN : true)
          : mode === 18 ? {} : position >= values.length;
      }, get value() {trace.push('value.get');if (mode === 4) throw marker;return values[position];}};
    };
  }});
  Object.defineProperty(iterator, 'return', {get() {
    trace.push('return.get');if (mode === 8) throw marker;
    if (mode === 10) return 1;
    if (mode === 22) return null;if (mode === 23) return undefined;
    return function (...args) {
      trace.push('return.call', args.length, this === iterator);
      if (mode === 9) throw marker;
      return mode === 11 ? 7 : {};
    };
  }});
  const iterable = {get [Symbol.iterator]() {
    trace.push('iterator.get');
    if (mode === 12) return null;if (mode === 13) return false;
    return function (...args) {trace.push('iterator.call', args.length, this === iterable);return iterator;};
  }};
  let out;
  try {out = sum(iterable);} catch (error) {out = error === marker ? 'marker' : error.name;}
  return [out, trace, sum([1, 2])];
}
function sumArray(a, numbers) {
  const roots = [];
  try {
    for (const number of numbers) roots.push(a.number(number));
    return a.sourceArray(roots);
  } finally {for (const root of roots) a.release(root);}
}
function checkHostSumOracle() {
  if (typeof Math.sumPrecise !== 'function') return;
  for (const [index, numbers] of sumSamples().entries()) {
    const expected = sumPreciseModel(numbers);
    exactBits(Math.sumPrecise(numbers), expected, 'host sum oracle ' + index);
  }
  for (let mode = 0; mode <= 29; mode++) {
    const expected = sumIteratorObservation(mode);
    assert.deepEqual(sumIteratorObservation(mode, Math.sumPrecise), expected, 'native sum iterator oracle mode ' + mode);
  }
}
function checkSumPrecise(a, recordStage) {
  exactBits(sumPreciseModel([]), -0, 'model empty sum');
  exactBits(sumPreciseModel([-0, -0]), -0, 'model all minus zero');
  exactBits(sumPreciseModel([-0, 0]), 0, 'model plus zero participates');
  exactBits(sumPreciseModel([1e16, 1, -1e16]), 1, 'model exact cancellation');
  exactBits(sumPreciseModel([Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]), Number.MAX_VALUE, 'model cancels intermediate overflow');
  exactBits(sumPreciseModel([Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE]), Number.MIN_VALUE, 'model recovers subnormal after cancellation');
  exactBits(sumPreciseModel([1, 2 ** -53, Number.MIN_VALUE]), adjacent(1, true), 'model rounds only after complete exact sum');
  assert.deepEqual(invoke(a, 'method-description', ['sumPrecise']), [true, true, true, false, true, 'sumPrecise', 1, false]);
  const key = a.string('sumPrecise'), method = a.invoke('namespace-get', [key]);
  try {
    for (const [index, numbers] of sumSamples().entries()) {
      const expected = sumPreciseModel(numbers), array = sumArray(a, numbers);
      try {
        exactBits(value(a, 'sum-direct', [array]), expected, 'direct precise sum ' + index);
        exactBits(value(a, 'sum-dynamic', [array]), expected, 'dynamic precise sum ' + index);
        a.collect();
        exactBits(value(a, 'invoke-held', [method, array]), expected, 'held precise sum after GC ' + index);
        assert.equal(a.length(array), numbers.length, 'sum leaves its source array unchanged');
        for (let at = 0; at < numbers.length; at++) {
          const item = a.get(array, at);
          try {exactBits(a.readNumber(item), numbers[at], 'unchanged sum item ' + at);}
          finally {a.release(item);}
        }
      } finally {a.release(array);}
      assert.equal(a.stats().frameDepth, 0);
    }
    recordStage?.('sum/samples-complete');
    for (let mode = 0; mode <= 29; mode++) {
      recordStage?.('sum/iterator/' + mode + '/before');
      const expected = sumIteratorObservation(mode);
      assert.deepEqual(invoke(a, 'sum-iterator-case', [mode]), expected, 'sum iterator mode ' + mode);
      assert(!expected[1].some(item => item === 'bad.valueOf' || item === 'bad.toString'), 'non-Numbers are never converted');
      if ([1, 2, 3, 4, 12, 13, 14, 15, 21].includes(mode))
        assert(!expected[1].includes('return.get'), 'IteratorStepValue failures must not close');
      if ([5, 6, 7, 8, 9, 10, 11, 19, 20, 22, 23, 25, 26, 27, 28, 29].includes(mode)) {
        assert.equal(expected[0], 'TypeError', 'bad element remains the first error even if closing fails');
        assert(expected[1].includes('return.get'), 'bad elements must close their iterator');
      }
      assert.equal(a.stats().frameDepth, 0);
      recordStage?.('sum/iterator/' + mode + '/complete');
    }
    recordStage?.('sum/iterators-complete');
    recordStage?.('sum/extra-order-before');
    assert.deepEqual(value(a, 'sum-extra-order'), [3, ['get', 'values', 'extra']]);
    recordStage?.('sum/extra-order-complete');
    assert.equal(value(a, 'sum-array-like-rejection'), 'TypeError');
    exactBits(invoke(a, 'sum-direct', ['']), -0, 'an empty String is a real empty iterable');
    for (const input of [undefined, null, false, 1, '12'])
      assert.throws(() => invoke(a, 'sum-direct', [input]), TypeError, 'sum rejects a noniterable or non-Number element');
    const empty = a.sourceArray([]);
    try {exactBits(value(a, 'sum-direct', [empty]), -0, 'recovery after iterator errors');}
    finally {a.release(empty);}
  } finally {a.release(method);a.release(key);}
}
function checkPressure(a) {
  const namespace = a.invoke('namespace-value'), saved = a.number(-0), sumInput = a.sourceArray([saved]), frame = a.frame(1), fillers = [];
  a.frameSet(frame, 0, saved);
  let exhausted = false;
  try {
    for (let index = 0; index <= 1024; index++) {
      try {fillers.push(a.number(index + 0.25));}
      catch (error) {
        assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;
      }
    }
    assert(exhausted, 'the unchanged default 1024-slot budget must be exhausted');
    assert.throws(() => a.invoke('direct-fround', [saved]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.throws(() => a.invoke('direct-f16round', [saved]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.throws(() => a.invoke('sum-direct', [sumInput]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.equal(a.stats().frameDepth, 1);
    exact(a.readNumber(saved), -0, 'caller root after capacity failure');
    const item = a.get(sumInput, 0);
    try {exactBits(a.readNumber(item), -0, 'sum source root after capacity failure');}
    finally {a.release(item);}
  } finally {
    for (const root of fillers) a.release(root);
    a.leaveFrame(frame);
    a.release(namespace);
  }
  try {
    a.collect();
    exact(value(a, 'direct-fround', [saved]), -0, 'fround recovers after OOM');
    exactBits(value(a, 'direct-f16round', [saved]), -0, 'f16round recovers after OOM');
    exactBits(value(a, 'sum-direct', [sumInput]), -0, 'sumPrecise recovers after OOM');
    exact(value(a, 'direct-abs', [saved]), 0, 'abs recovers after OOM');
    assert.equal(a.stats().frameDepth, 0);
  } finally {a.release(sumInput);a.release(saved);}
}
function checkFreeze(a) {
  assert.deepEqual(value(a, 'freeze-namespace'), frozenReference);
  assert.deepEqual(frozenReference, [true, false, false, false, 'TypeError', false, 3]);
  a.collect();
  exact(invoke(a, 'direct-abs', [-7]), 7, 'freezing Math preserves calls');
}

function checkMathComposite(a, target) {
  // Capture only fixed-size scalar snapshots, without a collection or another
  // source call. Successful runs remain silent; failures keep the exact value
  // originally thrown, even if observing stats or writing diagnostics fails.
  const snapshots = [], iteratorSnapshots = [];
  let stage = 'start', truncated = false;
  const recordStage = label => {
    stage = label;
    let snapshot;
    try {
      const stats = a.stats();
      snapshot = {stage, liveValues: stats.liveValues, usedBytes: stats.usedBytes,
        capacityBytes: stats.capacityBytes, frameDepth: stats.frameDepth, collections: stats.collections};
    } catch {
      snapshot = {stage, statsUnavailable: true};
    }
    const history = label.startsWith('sum/iterator/') ? iteratorSnapshots : snapshots;
    const limit = history === iteratorSnapshots ? 12 : 24;
    if (history.length === limit) {history.shift();truncated = true;}
    history.push(snapshot);
  };
  const group = (name, check) => {
    recordStage(name + '/before');
    check(a);
    recordStage(name + '/complete');
  };
  try {
    group('namespace', checkNamespace);
    group('mutations', checkMutations);
    group('unary', checkUnary);
    group('imul', checkImul);
    group('conversions', checkConversions);
    group('fround-boundaries', runtime => checkFround(runtime, froundBoundaries()));
    group('fround-random', runtime => checkFround(runtime, froundRandom()));
    group('f16', checkF16);
    group('sum', runtime => checkSumPrecise(runtime, recordStage));
    group('pressure', checkPressure);
    group('freeze', checkFreeze);
  } catch (error) {
    const failedStage = stage;
    recordStage(failedStage + '/failure');
    try {process.stderr.write('[math-composite-failure] ' + JSON.stringify({target, stage: failedStage, snapshots, iteratorSnapshots, truncated}) + '\n');}
    catch { /* Diagnostic output must never replace the original throw. */ }
    throw error;
  }
}

function checkColdIntegers(a) {
  a.auto(1);
  const saved = a.number(-0), frame = a.frame(1), methods = [], fillers = [];
  a.frameSet(frame, 0, saved);
  try {
    for (const [index, name] of ['round', 'floor', 'ceil', 'trunc'].entries()) {
      const mode = a.number(index);
      try {
        const method = a.invoke('cold-integer-method', [mode]);methods.push(method);
        assert.equal(method.kind, 18);
        assert.deepEqual(value(a, 'cold-integer-description', [method]),
          coldReference.cold_integer_description(coldReference.cold_integer_method(index)));
        for (const input of [-0, -1.5, -0.5, 0.5, NaN]) {
          const argument = Object.is(input, -0) ? saved : a.number(input);
          try {
            exact(value(a, 'cold-held-call', [method, argument]), Math[name](input), 'cold held ' + name);
            exact(value(a, 'cold-integer-call', [mode, argument]), coldReference.cold_integer_call(index, input), 'cold direct ' + name);
          } finally {if (argument !== saved) a.release(argument);}
        }
        let thrown = false;
        try {a.invoke('cold-integer-abrupt', [mode, false]);}
        catch (error) {thrown = true;assert.strictEqual(error, false);}
        assert(thrown);a.collect();assert.equal(a.stats().frameDepth, 1);
        exact(a.readNumber(saved), -0, 'cold caller root ' + name);
      } finally {a.release(mode);}
    }
    let exhausted = false;
    for (let index = 0; index <= 256; index++) {
      try {fillers.push(a.number(index + 0.25));}
      catch (error) {assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;}
    }
    assert(exhausted, 'the cold 256-slot budget must remain a hard limit');
    assert.throws(() => a.invoke('cold-held-call', [methods[0], saved]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.equal(a.stats().frameDepth, 1);exact(a.readNumber(saved), -0, 'cold capacity failure caller root');
    for (const root of fillers) a.release(root);fillers.length = 0;a.collect();
    exact(value(a, 'cold-held-call', [methods[0], saved]), -0, 'cold capacity recovery');
    const againMode = a.number(0);
    try {
      const again = a.invoke('cold-integer-method', [againMode]);
      try {assert(a.keyEqual(again, methods[0]));} finally {a.release(again);}
    } finally {a.release(againMode);}
    const caller = a.frameGet(frame, 0);try {exact(a.readNumber(caller), -0, 'retained cold caller frame');} finally {a.release(caller);}
  } finally {
    for (const root of fillers) a.release(root);
    a.leaveFrame(frame);for (const method of methods) a.release(method);a.release(saved);
  }
}

function checkColdIntegerNamespace(a) {
  a.auto(1);
  const modes = [], methods = [];
  try {
    for (let index = 0; index < 4; index++) {
      const mode = a.number(index);modes.push(mode);methods.push(a.invoke('cold-integer-method', [mode]));
    }
    a.collect();
    for (const [index, name] of ['round', 'floor', 'ceil', 'trunc'].entries()) {
      const expected = coldReference.cold_integer_relations(index, coldReference.cold_integer_method(index));
      assert.deepEqual(expected, [true, true, true, false, true, name, 1]);
      assert.deepEqual(value(a, 'cold-integer-relations', [modes[index], methods[index]]), expected);
      assert.deepEqual(value(a, 'cold-integer-mutations', [modes[index]]), coldReference.cold_integer_mutations(index));
      assert.deepEqual(coldReference.cold_integer_mutations(index), [true, [true, -0], true, 'TypeError', -0]);
      for (const abrupt of [false, true]) {
        const order = coldReference.cold_integer_order(index, abrupt);
        assert.deepEqual(order, abrupt ? ['marker', 1, 1] : [7, 2, 1]);
        assert.deepEqual(value(a, 'cold-integer-order', [modes[index], abrupt]), order);
      }
      a.collect();
      const again = a.invoke('cold-integer-method', [modes[index]]);
      try {assert(a.keyEqual(again, methods[index]));} finally {a.release(again);}
      assert.equal(a.stats().frameDepth, 0);
    }
    assert.equal(value(a, 'cold-integer-shadow'), coldReference.cold_integer_shadow());
    assert.equal(coldReference.cold_integer_shadow(), 12);
  } finally {for (const root of [...modes, ...methods]) a.release(root);}
}

test('cold exact integer Math references and calls retain their metadata aliases errors and caller roots within 256 slots', () => {
  const a = instantiateManagedRuntime(coldBytes, {maxSlots: 256, initialBytes: 16384, maxBytes: 1048576});
  try {checkColdIntegers(a);} finally {finish(a);}
});
test('cold integer Math callables keep identity when the same realm materializes reflects overrides deletes and restores its namespace', () => withWasm(checkColdIntegerNamespace, coldBytes));
test.skipIf(!nativeTarget)('actual native cold integer Math callables retain the same 256-slot and namespace mutation contracts', async () => {
  for (const [configuration, check] of [[{maxSlots: 256, initialBytes: 16384, maxBytes: 1048576}, checkColdIntegers], [{}, checkColdIntegerNamespace]]) {
    const a = await instantiateNativeManagedRuntime(coldNativePath, coldLowered, {nativeTarget, ...configuration});
    try {check(a);} finally {finish(a);}
  }
}, 30000);

async function checkColdNumbers(create) {
  assert.deepEqual(numberOracle.order, [[true, ['string', 'get', 'argument']], ['marker', ['string']]]);
  assert.deepEqual(numberOracle.mutations, [77, false, undefined, true, 88, 10, false, 'TypeError']);
  for (let mode = 0; mode < 7; mode++) {
    const a = await create();a.auto(1);
    const roots = [], fillers = [];
    let frame;
    try {
      const saved = a.number(-0);roots.push(saved);frame = a.frame(1);a.frameSet(frame, 0, saved);
      const constructor = a.invoke('cold-number-value');roots.push(constructor);
      const boxed = a.invoke('cold-number-box', [saved]);roots.push(boxed);
      assert.equal(constructor.kind, 18);assert.equal(boxed.kind, 36);
      exact(value(a, 'cold-number-unbox', [boxed]), -0, 'cold Number boxing before static observation');
      const trace = a.sourceArray([]);roots.push(trace);
      let thrown = false;
      try {a.invoke('cold-number-key-error', [constructor, trace]);}
      catch (error) {thrown = true;assert.strictEqual(error, false);}
      assert(thrown);assert.deepEqual(read(a, trace), ['string']);
      assert.equal(a.stats().frameDepth, 1);
      const key = a.string('isFinite'), modeValue = a.number(mode);roots.push(key, modeValue);
      if (mode === 0) {
        let exhausted = false;
        for (let index = 0; index <= 1024; index++) {
          try {fillers.push(a.number(index + 0.25));}
          catch (error) {assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;}
        }
        assert(exhausted, 'cold Number retains the default 1024-slot hard limit');
        assert.throws(() => a.invoke('cold-number-first', [constructor, key, modeValue]),
          error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
        assert.equal(a.stats().frameDepth, 1);
        exact(a.readNumber(saved), -0, 'Number failed observation preserves caller root');
        for (const root of fillers) a.release(root);fillers.length = 0;a.collect();
        exact(value(a, 'cold-number-unbox', [boxed]), -0, 'Number boxing survives capacity recovery');
      }
      assert.deepEqual(value(a, 'cold-number-first', [constructor, key, modeValue]), numberOracle.first[mode], 'first Number observation ' + mode);
      assert.deepEqual(value(a, 'cold-number-snapshot', [constructor, boxed]), numberOracle.snapshot,
        'complete Number names order descriptors constants prototypes and parser aliases ' + mode);
      assert.deepEqual(value(a, 'cold-number-newtarget', [saved]), numberOracle.newTarget,
        'a distinct newTarget retains its actual prototype lookup');
      if (mode === 0) for (let kind = 0; kind < 3; kind++) for (let writable = 0; writable < 3; writable++) {
        const expected = [3, writable === 0, true, true, writable === 0, writable === 0 ? 4 : 3, 5, true, true, true];
        assert.deepEqual(numberOracle.descriptorCycles[kind][writable], expected);
        assert.deepEqual(invoke(a, 'cold-number-descriptor-cycle', [kind, writable]), expected,
          'object/array/function accessor-to-data conversion and saved-descriptor restoration ' + kind + '/' + writable);
      }
      for (const [index, abrupt] of [false, true].entries()) {
        assert.deepEqual(value(a, 'cold-number-order', [constructor, abrupt]), numberOracle.order[index]);
        assert.deepEqual(value(a, 'cold-number-snapshot', [constructor, boxed]), numberOracle.snapshot,
          'getter conversion restores all original Number attributes after abrupt=' + abrupt);
      }
      a.resize(trace, 0);
      try {
        assert.deepEqual(value(a, 'cold-number-mutations', [constructor, trace]), numberOracle.mutations);
        assert.deepEqual(read(a, trace), numberOracle.mutationTrace);
      } catch (error) {
        let mutationTrace = 'unavailable', stats;
        try {mutationTrace = read(a, trace);stats = a.stats();} catch {}
        try {process.stderr.write('[cold-number-mutation-failure] ' + JSON.stringify({mode, mutationTrace, stats}) + '\n');} catch {}
        throw error;
      }
      a.collect();
      const again = a.invoke('cold-number-value');
      try {assert(a.keyEqual(again, constructor));} finally {a.release(again);}
      exact(value(a, 'cold-number-unbox', [boxed]), -0, 'Number constructor mutation and GC preserve existing boxes');
      const caller = a.frameGet(frame, 0);
      try {exact(a.readNumber(caller), -0, 'Number first observation preserves caller frame');}
      finally {a.release(caller);}
      assert.equal(a.stats().frameDepth, 1);
    } finally {
      for (const root of fillers) a.release(root);
      if (frame) a.leaveFrame(frame);
      for (const root of roots) a.release(root);
      finish(a);
    }
  }
}
test('cold Number boxing defers unrelated statics while every first observation publishes the complete native property contract',
  () => checkColdNumbers(() => instantiateManagedRuntime(numberBytes)), 30000);
test.skipIf(!nativeTarget)('actual native cold Number boxing and first static reflection preserve descriptors aliases errors and collecting roots',
  () => checkColdNumbers(() => instantiateNativeManagedRuntime(numberNativePath, numberLowered, {nativeTarget})), 30000);

test('Given Math as an ordinary value when passed read and reflected then globals aliases descriptors and canonical methods agree', () => withWasm(checkNamespace));
test('Given a mutable Math namespace when members are overridden deleted or captured before arguments then original lookup and GC semantics remain observable', () => withWasm(checkMutations));
test('Given primitive IEEE and string inputs when abs sign and clz32 execute then direct dynamic and missing-argument semantics match native Math', () => withWasm(checkUnary));
test('Given signed and unsigned word boundaries when imul converts two operands then exact low-32 multiplication and missing arguments match Math.imul', () => withWasm(checkImul));
test('Given effectful conversions and throws when Math methods run then argument effects precede number-hint conversion and first errors preserve identity', () => withWasm(checkConversions));
test('Given binary32 midpoints overflow and subnormal boundaries when fround runs then every result exactly matches Object.is with Math.fround', () => withWasm(a => checkFround(a, froundBoundaries())));
test('Given fixed seeded binary64 and binary32 bit samples when direct dynamic and held fround run then each result is exact through collecting GC', () => withWasm(a => checkFround(a, froundRandom())));
test('Given binary16 ties subnormals overflow and double-rounding counterexamples when f16round executes then exact bits agree with an independent integer model without a host API fallback', () => withWasm(checkF16));
test('Given the host Math.sumPrecise API when exact cancellation and observable iterators run then the host independently conforms to the precise integer model', checkHostSumOracle);
test('Given precise finite cancellation and observable iterators when sumPrecise executes then single-round results Number-only rejection closing and first errors preserve the original default-budget contract', () => withWasm(checkSumPrecise));
test('Given default-budget exhaustion during a Math call when caller roots survive then frames unwind and later numeric calls recover', () => withWasm(checkPressure));
test('Given a frozen Math namespace when reflected and called then descriptor failures and numeric results match an isolated JS realm', () => withWasm(checkFreeze));

test.skipIf(!nativeTarget)('Given the same complete Math fixture in actual native machine code when all semantic groups execute then the WASM contracts and original default budget remain intact', async () => {
  const a = await instantiateNativeManagedRuntime(nativePath, lowered, {nativeTarget});
  a.auto(1);
  try {checkMathComposite(a, 'actual-native/' + nativeTarget);} finally {finish(a);}
}, 120000);

test('Given the identical zero-import WASM in independent Node when the complete Math semantic groups execute then JS and WASM agree without a compiler fallback', () => {
  const declarations = [read, value, box, invoke, exact, compareFixture, checkNamespace,
    checkMutations, checkUnary, checkImul, checkConversions, adjacent, froundBoundaries,
    froundRandom, checkFround, numberWord, wordNumber, finiteUnits, roundIntegerEven,
    unitsNumber, f16Model, exactBits, f16Boundaries, checkF16, sumPreciseModel,
    sumSamples, sumIteratorObservation, sumArray, checkHostSumOracle, checkSumPrecise,
    checkPressure, checkFreeze, checkMathComposite, finish].map(fn => fn.toString()).join('\n');
  const script = `
    import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
    const {instantiateManagedRuntime} = await import(process.argv[1]);
    const reference = await import(process.argv[2]);
    const unaryNames = ${JSON.stringify(unaryNames)};
    const constants = ${JSON.stringify(constants)};
    const methodLengths = ${JSON.stringify(methodLengths)};
    const primitives = [undefined,null,false,true,'',' ','-0','0x10','0b11','0o17',
      '\\u2028-1.5\\ufeff','not a number','\\ud800',NaN,Infinity,-Infinity,0,-0,
      Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,
      0.49999999999999994,0.5,-0.5,1.5,-1.5,2**31-1,2**31,2**32-1,2**32,
      2**32+1,-(2**32)-1,2**53-1,2**53+2];
    const frozenReference = ${JSON.stringify(frozenReference)};
    ${declarations}
    const bytes = readFileSync(process.argv[3]);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
    const a = instantiateManagedRuntime(bytes);a.auto(1);
    try {checkMathComposite(a, 'node-wasm');} finally {finish(a);}
    checkHostSumOracle();
  `;
  const child = spawnSync('node', ['--input-type=module', '-e', script,
    pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,
    pathToFileURL(referencePath).href, wasmPath], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
}, 30000);

function sqrtInputs() {
  const inputs = [...primitives, 4 * Number.MIN_VALUE, 2 ** -1022,
    2 ** -1022 - Number.MIN_VALUE, 2 ** -1022 + Number.MIN_VALUE,
    1 - 2 ** -53, 1 + 2 ** -52, 4 - 2 ** -51, 4 + 2 ** -50,
    2 ** 1022, 2 ** -1000, 2, 3, 4, 9, 81];
  const bits = new DataView(new ArrayBuffer(8));
  let seed = 0x5f3759df;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let index = 0; index < 96; index++) {
    bits.setUint32(0, next(), true);bits.setUint32(4, next(), true);
    inputs.push(bits.getFloat64(0, true));
  }
  return inputs;
}

function checkSqrtAccess(a, firstMode = 0) {
  a.auto(1);
  const first = a.number(firstMode);
  let held;
  try {held = a.invoke('sqrt-method', [first]);} finally {a.release(first);}
  try {
    assert.equal(held.kind, 18);
    const description = [true, true, true, 'sqrt', 1, false, true, false, true,
      false, false, true, false, false, true];
    assert.deepEqual(sqrtReference.sqrt_description(sqrtReference.sqrt_method(firstMode)), description);
    assert.deepEqual(value(a, 'sqrt-description', [held]), description);
    for (let mode = 0; mode < 3; mode++) {
      const modeValue = a.number(mode);
      try {
        const again = a.invoke('sqrt-method', [modeValue]);
        try {assert(a.keyEqual(again, held), 'all sqrt reads must return the held callable');}
        finally {a.release(again);}
      } finally {a.release(modeValue);}
    }
    for (const input of [-0, 0, -1, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity, '81']) {
      for (let mode = 0; mode < 10; mode++) {
        const expected = sqrtReference.sqrt_call(mode, input);
        exact(expected, Math.sqrt(input), 'JS sqrt route ' + mode);
        exact(invoke(a, 'sqrt-call', [mode, input]), expected, 'managed sqrt route ' + mode);
      }
    }
    for (const input of sqrtInputs()) {
      exact(invoke(a, 'sqrt-call', [0, input]), Math.sqrt(input), 'static sqrt/' + String(input));
      exact(invoke(a, 'sqrt-call', [2, input]), sqrtReference.sqrt_call(2, input), 'computed sqrt/' + String(input));
    }
    for (const args of [[], [undefined], [null], [-0, 99, 'ignored']]) {
      const roots = args.map(input => box(a, input));
      try {exact(value(a, 'sqrt-held', [held, ...roots]), Math.sqrt(...args), 'held sqrt logical arity');}
      finally {for (const root of roots) a.release(root);}
    }
    a.collect();
    const againMode = a.number(firstMode);
    try {
      const again = a.invoke('sqrt-method', [againMode]);
      try {assert(a.keyEqual(held, again), 'sqrt identity must survive a forced collection');}
      finally {a.release(again);}
    } finally {a.release(againMode);}
    assert.equal(a.stats().frameDepth, 0);
  } finally {a.release(held);}
}

function checkSqrtSemantics(a) {
  a.auto(1);
  const compare = (name, inputs = []) => {
    const expected = sqrtReference[name.replaceAll('-', '_')](...inputs);
    assert.deepEqual(invoke(a, name, inputs), expected, name + '/' + inputs.join(','));
    assert.equal(a.stats().frameDepth, 0, name + ' must restore frames');
    return expected;
  };
  assert.deepEqual(compare('sqrt-arity', [true]), [NaN, []]);
  assert.deepEqual(compare('sqrt-arity', [false]), [9, ['argument', 'extra', 'convert']]);
  for (let mode = 0; mode < 12; mode++) {
    const result = compare('sqrt-convert', [mode]);
    if (mode === 3) assert.deepEqual(result, [9, ['valueOf.get', 'valueOf.call', 'toString.get', 'toString.call']]);
    if (mode === 4) assert.deepEqual(result, [9, ['primitive.get', 'number', true]]);
    if (mode === 5) assert.deepEqual(result, ['marker', ['primitive.get', 'number', true]]);
    if (mode === 6) assert.deepEqual(result, ['TypeError', ['primitive.get', 'number', true]]);
    if (mode >= 7 && mode <= 10) assert.deepEqual(result, ['TypeError', []]);
    if (mode === 11) exact(result[0], -0, 'boxed negative zero sqrt');
    a.collect();
  }
  assert.deepEqual(compare('sqrt-mutations'), [true, 99, true, 'TypeError', 3]);
  assert.deepEqual(compare('sqrt-metadata-mutation'), ['changed', 4, 9]);
  const mode = a.number(0), held = a.invoke('sqrt-method', [mode]);
  try {
    assert.deepEqual(value(a, 'sqrt-description', [held]),
      [true, true, true, 'sqrt', 1, false, true, false, true, false, false, true, false, false, true]);
  } finally {a.release(held);a.release(mode);}
  for (let mode = 0; mode < 4; mode++) {
    const trace = ['string', 'method', 'argument', 'extra', 'number'];
    assert.deepEqual(compare('sqrt-order', [mode]), mode === 0 ? [9, trace]
      : ['marker', mode === 1 ? ['string'] : mode === 2 ? ['string', 'method'] : trace]);
    exact(invoke(a, 'sqrt-call', [0, 81]), 9, 'sqrt recovery after conversion/callee error');
  }
  for (let mode = 0; mode < 3; mode++)
    assert.deepEqual(compare('sqrt-construct', [mode]), ['TypeError', mode === 0 ? ['argument'] : []]);
  assert.equal(compare('sqrt-shadow'), 12);
  let threw = false;
  try {a.invoke('sqrt-throw', [false]);}
  catch (error) {threw = true;assert.strictEqual(error, false);}
  assert(threw, 'sqrt must propagate the original false thrown by ToNumber');
  a.collect();assert.equal(a.stats().frameDepth, 0);
  exact(invoke(a, 'sqrt-call', [1, -0]), -0, 'sqrt recovery preserves negative zero');
}

function checkSqrtPressure(a) {
  a.auto(1);
  const saved = a.number(-0), mode = a.number(0), held = a.invoke('sqrt-method', [mode]);
  const frame = a.frame(1), fillers = [];
  a.frameSet(frame, 0, saved);
  try {
    exact(value(a, 'sqrt-held', [held, saved]), -0, 'sqrt before pressure');
    const marker = a.sourceArray([saved]);
    try {
      let threw = false;
      try {a.invoke('sqrt-throw', [marker]);}
      catch (error) {
        threw = true;
        try {assert(a.keyEqual(error, marker), 'sqrt must preserve the original object thrown by conversion');}
        finally {a.release(error);}
      }
      assert(threw);
    } finally {a.release(marker);}
    a.collect();assert.equal(a.stats().frameDepth, 1);
    let exhausted = false;
    for (let index = 0; index <= 1024; index++) {
      try {fillers.push(a.number(index + 0.25));}
      catch (error) {assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');exhausted = true;break;}
    }
    assert(exhausted, 'sqrt must retain the default 1024-slot hard capacity');
    assert.throws(() => a.invoke('sqrt-held', [held, saved]),
      error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.equal(a.stats().frameDepth, 1);
    exact(a.readNumber(saved), -0, 'sqrt capacity failure preserves the caller value');
    for (const root of fillers) a.release(root);fillers.length = 0;a.collect();
    exact(value(a, 'sqrt-held', [held, saved]), -0, 'sqrt recovers with the same arguments');
    const again = a.invoke('sqrt-method', [mode]);
    try {assert(a.keyEqual(held, again));} finally {a.release(again);}
    const caller = a.frameGet(frame, 0);
    try {exact(a.readNumber(caller), -0, 'sqrt recovery retains the caller frame');}
    finally {a.release(caller);}
  } finally {
    for (const root of fillers) a.release(root);
    a.leaveFrame(frame);a.release(held);a.release(mode);a.release(saved);
  }
}

test('sqrt supports cold static global computed and held reads and exact binary64 results in real WASM', () => {
  for (let first = 0; first < 3; first++) {
    const a = instantiateManagedRuntime(sqrtBytes);
    try {checkSqrtAccess(a, first);} finally {finish(a);}
  }
}, 30000);
test('sqrt conversions call apply bind callbacks descriptors mutations and nonconstruction match the original JS', () => {
  const a = instantiateManagedRuntime(sqrtBytes);
  try {checkSqrtSemantics(a);} finally {finish(a);}
}, 30000);
test('sqrt preserves caller roots thrown identity and exact recovery at the original default capacity', () => {
  const a = instantiateManagedRuntime(sqrtBytes);
  try {checkSqrtPressure(a);} finally {finish(a);}
}, 30000);
test.skipIf(!nativeTarget)('actual native sqrt shares exact f64 access conversion and capacity semantics', async () => {
  for (const check of [a => checkSqrtAccess(a, 0), a => checkSqrtAccess(a, 1),
    a => checkSqrtAccess(a, 2), checkSqrtSemantics, checkSqrtPressure]) {
    const a = await instantiateNativeManagedRuntime(sqrtNativePath, sqrtLowered, {nativeTarget});
    try {check(a);} finally {finish(a);}
  }
}, 30000);
test('independent Node compares every sqrt family assertion with the same generated JS and real WASM bytes', () => {
  const runtimeUrl = new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href;
  const declarations = [read, value, box, invoke, exact, finish, sqrtInputs,
    checkSqrtAccess, checkSqrtSemantics, checkSqrtPressure].map(fn => fn.toString()).join('\n');
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    const {instantiateManagedRuntime}=await import(process.argv[1]);
    const sqrtReference=await import(process.argv[2]);
    const primitives=[undefined,null,false,true,'',' ','-0','0x10','0b11','0o17',
      '\\u2028-1.5\\ufeff','not a number','\\ud800',NaN,Infinity,-Infinity,0,-0,
      Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,
      0.49999999999999994,0.5,-0.5,1.5,-1.5,2**31-1,2**31,2**32-1,2**32,2**32+1,-(2**32)-1,2**53-1,2**53+2];
    ${declarations}
    const bytes=await readFile(process.argv[3]);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
    for(const check of [a=>checkSqrtAccess(a,0),a=>checkSqrtAccess(a,1),a=>checkSqrtAccess(a,2),checkSqrtSemantics,checkSqrtPressure]){
      const a=instantiateManagedRuntime(bytes);
      try{check(a);}finally{finish(a);}
    }
    process.stdout.write(JSON.stringify({sqrt:true}));
  `, runtimeUrl, pathToFileURL(sqrtReferencePath).href, sqrtWasmPath], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {sqrt: true});
}, 30000);
