import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm, writeFile, symlink} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const options = {maxSlots:8192, initialBytes:262144, maxBytes:16777216};
const memory = {initialPages:4, maximumPages:1024};
const entry = 'tests/core-entry.mjs';
const aliasId = 'tests/core-aliases.mjs';
const aliasSource = `(module core-aliases
  (import "eliscript/runtime/core/vector.mjs" :as Vector)
  (import "../runtime/core/collection.mjs" :as Collection)
  (import "eliscript/runtime/core/record.mjs" :as Record)
  (import "eliscript/runtime/core/transient.mjs" :as Transient)
  (defun vector-identity (value) (Object/is value (get Vector :PersistentVector)))
  (defun protocol-identity (value) (Object/is value (get Collection :ICounted)))
  (defun record-identity (value) (Object/is value (get Record :defineRecordType)))
  (defun transient-identity (value) (Object/is value (get Transient :persistentBang)))
  (export vector-identity protocol-identity record-identity transient-identity))`;
const patternId='tests/core-patterns.mjs';
const patternProviderId='tests/core-pattern-provider.mjs';
const patternProvider=`(module pattern-provider
  (defconst first 101) (defconst second 202) (defconst name "provider-name")
  (defconst later 303) (defconst remaining 404) (defconst default-trace (js-array))
  (defun fallback (trace) (js-call trace :push "fallback") 18)
  (export first second name later remaining fallback default-trace))`;
const patternSource=`(module pattern-consumer
  (import "./core-pattern-provider.mjs" first second name later remaining fallback default-trace)
  (defun unpack ([first [second nil fourth] &rest tail] &optional [extra])
    (js-array first second fourth tail extra))
  (defun row ({:keys [name age note] :or {age 18 note "missing"} :as whole})
    (js-array name age note (get whole :name)))
  (defun nested ({alias :name {:keys [city]} :profile}) (js-array alias city))
  (defun optional-map (&optional {:keys [name] :or {name "anonymous"}}) name)
  (defun defaults ({:keys [age] :or {age (fallback default-trace)}}) age)
  (defun invalid-forward ({:keys [first later] :or {first later}}) first)
  (defun probe (callback) (try (funcall callback) (catch error (get error :name))))
  (defun make-value (trace label value)
    (js-call trace :push label)
    (let ((array (js-array value)))
      (Object/defineProperty array "0" (js-object :get (lambda () (js-call trace :push (str "read-" label)) value) :configurable t)) array))
  (defun parallel ()
    (let ((trace (js-array)))
      (let (([first] (make-value trace "one" 1)) ([second] (make-value trace "two" 2)))
        (js-array first second trace))))
  (defun sequential ()
    (let* (([first] (js-array 3)) ([second] (js-array (+ first 4)))
           ({:keys [name] :or {name (str first second)}} (js-object)))
      (js-array first second name)))
  (defun map-parallel ()
    (let (({:keys [first] :or {first second}} (js-object)) (second 77)) (js-array first second)))
  (defun map-loop (initial)
    (loop (({:keys [remaining total] :or {total 0}} initial))
      (if (= remaining 0) total
        (recur (js-object :remaining (1- remaining) :total (+ total remaining))))))
  (defun vector-loop ()
    (loop (([first second] (js-array 1 2)) (remaining 3))
      (if (= remaining 0) (js-array first second)
        (recur (js-array second first) (1- remaining)))))
  (defun function-recur ([remaining total])
    (if (= remaining 0) total (recur (js-array (1- remaining) (+ total remaining)))))
  (defun map-captures ({:keys [remaining]} callbacks)
    (if (= remaining 0) (js-call callbacks :map (lambda (callback) (funcall callback)))
      (progn (js-call callbacks :push (lambda () remaining))
        (recur (js-object :remaining (1- remaining)) callbacks))))
  (defun vector-captures ([remaining] callbacks)
    (if (= remaining 0) (js-call callbacks :map (lambda (callback) (funcall callback)))
      (progn (js-call callbacks :push (lambda () remaining))
        (recur (js-array (1- remaining)) callbacks))))
  (defun capture-pattern ([first]) (lambda () first))
  (defun loop-captures ()
    (loop (({:keys [remaining]} (js-object :remaining 3)) (callbacks (js-array)))
      (if (= remaining 0) (js-call callbacks :map (lambda (callback) (funcall callback)))
        (progn (js-call callbacks :push (lambda () remaining))
          (recur (js-object :remaining (1- remaining)) callbacks)))))
  (defun iterator-order ()
    (let* ((trace (js-array)) (marker (js-object)) (inner (js-object))
           (iterator (js-object :next (lambda () (js-call trace :push "next")
             (js-object :done false :value inner))))
           (input (js-object)))
      (Object/defineProperty inner (get globalThis/Symbol :iterator) (js-object :get (lambda () (throw marker)) :configurable t))
      (put iterator :return (lambda () (js-call trace :push "return") (js-object :done t)))
      (put input (get globalThis/Symbol :iterator) (lambda () (js-call trace :push "iterator") iterator))
      (let ((same false))
        (try
          (let (([[first]] input)) first)
          (catch error (setq same (Object/is error marker))))
        (js-array same trace))))
  (defun report ()
    (let ((trace default-trace))
      (put trace :length 0)
      (JSON/stringify (js-array
        (unpack (js-array 1 (js-array 2 3 4) 5 6) (js-array 7))
        (unpack (js-array 1 (js-array 2 3 4)))
        (row (js-object :name "local")) (row (js-object :name "local" :age undefined :note nil))
        (nested (js-object :name "alias" :profile (js-object :city "city")))
        (optional-map) (parallel) (sequential) (map-parallel)
        (defaults (js-object)) trace
        (probe (lambda () (invalid-forward (js-object))))
        (map-loop (js-object :remaining 4)) (vector-loop) (function-recur (js-array 4 0))
        (map-captures (js-object :remaining 3) (js-array))
        (vector-captures (js-array 3) (js-array)) (loop-captures)
        (try (throw (js-object :name "caught")) (catch {:keys [name]} name))
        (js-array first second name later remaining)
        (probe (lambda () (unpack undefined)))
        (iterator-order)))))
  (export report capture-pattern))`;
const cases = ['aliases','records','types','protocols','collections','dynamic-from','class-callback-order','patterns'];
let directory, backend, runtimeIR, literalModules, modules, lowered, bytes, nativePath, expected;

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-core-modules-'));
  backend = await buildBackends({outputRoot:directory});
  runtimeIR = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  ({literalModules} = await backend.loadLiteralModules());
  modules = [
    {id:entry,program:backend.compiler.compile_ir_string((await readFile('tests/fixtures/wasm-managed-core-modules.eli', 'utf8')).replace('  (export aliases', '  (import \"./core-patterns.mjs\" :as Patterns)\n  (defun patterns () (Patterns/report))\n  (defun held-pattern () (Patterns/capture-pattern (js-array 17)))\n  (defun inspect-held-pattern (callback) (funcall callback))\n  (export patterns held-pattern inspect-held-pattern aliases'), 'tests/fixtures/wasm-managed-core-modules.eli')},
    {id:aliasId,program:backend.compiler.compile_ir_string(aliasSource, 'tests/core-aliases.eli')},
    {id:patternId,program:backend.compiler.compile_ir_string(patternSource,'tests/core-patterns.eli')},
    {id:patternProviderId,program:backend.compiler.compile_ir_string(patternProvider,'tests/core-pattern-provider.eli')},
  ];
  const saved = JSON.stringify(modules), savedLibraries = JSON.stringify(literalModules);
  lowered = backend.managed.lower_managed_project(modules, entry, runtimeIR, {...memory,literalModules});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed, memory),
    'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.equal(JSON.stringify(modules), saved);
  assert.equal(JSON.stringify(literalModules), savedLibraries);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  assert.deepEqual([...lowered.modules].sort(), [entry,aliasId,patternId,patternProviderId].sort());
  for (const id of ['runtime/literals.mjs','runtime/core/record.mjs','runtime/core/type.mjs','runtime/core/protocol.mjs','runtime/core/collection.mjs','runtime/core/metadata.mjs','runtime/core/transient.mjs']) {
    assert(lowered.privateModules.some(privateId => privateId.endsWith('/' + id)), 'real private dependency: ' + id);
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    nativePath = resolve(directory, 'core-modules.dylib');
    await writeFile(nativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, 'arm64-macos')));
  }

  // Only the actual user programs are emitted here. Their imports load
  // the repository's original runtime in each independent reference process.
  const reference = resolve(directory, 'reference');
  await mkdir(resolve(reference, 'tests'), {recursive:true});
  await mkdir(resolve(reference, 'node_modules'), {recursive:true});
  await symlink(resolve('runtime'), resolve(reference, 'runtime'), 'dir');
  await symlink(resolve('.'), resolve(reference, 'node_modules/eliscript'), 'dir');
  for (const module of modules) {
    const path = resolve(reference, module.id);await mkdir(dirname(path), {recursive:true});
    await writeFile(path, backend.compiler.emit_ir_string(module.program));
  }
  const script = `const m=await import(process.argv[1]);const out={};for(const name of ${JSON.stringify(cases)})out[name]=m[name.replaceAll('-','_')]();const held=m.held_record();out.held=m.inspect_held(held);console.log(JSON.stringify(out));`;
  const url = pathToFileURL(resolve(reference, entry)).href;
  for (const executable of [process.env.NODE ?? 'node', process.execPath]) {
    const result = spawnSync(executable, ['--input-type=module','--eval',script,url], {encoding:'utf8',timeout:30000});
    assert.equal(result.status, 0, result.stderr);
    const observations = JSON.parse(result.stdout);
    if (expected) assert.deepEqual(observations, expected, 'independent Node and Bun original runtime');
    else expected = observations;
  }
  assert(expected.aliases.every(value => value === true));
  const patterns=JSON.parse(expected.patterns);
  assert.deepEqual(patterns[6],[1,2,['one','two','read-one','read-two']]);
  assert.deepEqual(patterns[7],[3,7,'37']);assert.deepEqual(patterns[8],[77,77]);
  assert.equal(patterns[11],'ReferenceError');assert.equal(patterns[12],10);
  assert.deepEqual(patterns[13],[2,1]);assert.equal(patterns[14],10);
  assert.deepEqual(patterns[15],[3,2,1]);assert.deepEqual(patterns[16],[0,0,0]);
  assert.deepEqual(patterns[17],[3,2,1]);assert.equal(patterns[18],'caught');
  assert.deepEqual(patterns[19],[101,202,'provider-name',303,404]);
  assert.equal(patterns[20],'TypeError');assert.deepEqual(patterns[21],[true,['iterator','next','return']]);
  assert.deepEqual(expected['dynamic-from'], Array.from({length:5}, () => ['override',['arg','get',true,1]]));
  assert.deepEqual(expected['class-callback-order'], [0,1,false,0,'TypeError','TypeError',true,9,true,false,['arg','element','broken','constructor']]);
  assert.deepEqual(expected.held, [true,'Held',7,true,true]);
}, 120000);
afterAll(async () => { if (directory) await rm(directory, {recursive:true,force:true}); });

function read(runtime, value) {
  if (value?.kind === 4) return runtime.readNumber(value);
  if (value?.kind === 5) return runtime.readString(value);
  if (value?.kind === 14) return Array.from({length:runtime.length(value)}, (_, index) => {
    const child = runtime.get(value,index);
    try { return read(runtime,child); } finally { runtime.release(child); }
  });
  return value;
}
function invoke(runtime, name, arguments_ = []) {
  const out = runtime.invoke(name,arguments_);
  try { return read(runtime,out); } finally { runtime.release(out); }
}
function finish(runtime) {
  runtime.closeModule();runtime.collect();
  assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);
}
function checkAll(runtime) {
  for (const name of cases) {
    assert.deepEqual(invoke(runtime,name),expected[name],name);
    runtime.collect();assert.equal(runtime.stats().frameDepth,0);
  }
  const held = runtime.invoke('held-record');
  try {
    for (let round=0;round<3;round++) {
      runtime.collect();assert.deepEqual(invoke(runtime,'inspect-held',[held]),expected.held);
      assert.equal(runtime.stats().frameDepth,0);
    }
  } finally { runtime.release(held); }
  const captured=runtime.invoke('held-pattern');
  try {
    for(let round=0;round<3;round++) {
      runtime.collect();assert.equal(invoke(runtime,'inspect-held-pattern',[captured]),17);
      assert.equal(runtime.stats().frameDepth,0,'pattern closure retains its binding cell');
    }
  } finally {runtime.release(captured);}
}

test('Given original standard module imports when canonical aliases records types protocols collections metadata and transients execute then zero-import WASM agrees with Node and Bun', () => {
  const runtime = instantiateManagedRuntime(bytes,options);runtime.auto(65536);
  try { checkAll(runtime); } finally { finish(runtime); }
},30000);
test('Given collection at every allocation when standard modules capture constructors callbacks aliases and metadata then original identities and error order survive GC', () => {
  const runtime = instantiateManagedRuntime(bytes,options);runtime.auto(1);
  try { checkAll(runtime); } finally { finish(runtime); }
},30000);
test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')('Given native code from the same complete typed standard-module graph when the original semantic cases run then Node and Bun results and root cleanup agree', async () => {
  const runtime = await instantiateNativeManagedRuntime(nativePath,lowered,{...options,...memory});runtime.auto(1);
  try { checkAll(runtime); } finally { try { finish(runtime); } finally { runtime.close(); } }
},120000);
test('Given no actual source library or a different canonical path when standard module imports are lowered then source-bound refusals preserve the original IR', () => {
  const input = [{id:entry,program:backend.compiler.compile_ir_string('(import "eliscript/runtime/core/type.mjs" defineType) (export defineType)','missing-core-library.eli')}];
  const saved = JSON.stringify(input);
  assert.throws(() => backend.managed.lower_managed_project(input,entry,runtimeIR), error => error.eliscriptDiagnostic?.code === 'ELI-B0001');
  assert.equal(JSON.stringify(input),saved);
  const unrelated = [{id:entry,program:backend.compiler.compile_ir_string('(import "../vendor/core/vector.mjs" PersistentVector) (export PersistentVector)','unrelated-core-name.eli')}];
  const before = JSON.stringify(unrelated);
  assert.throws(() => backend.managed.lower_managed_project(unrelated,entry,runtimeIR,{literalModules}), error => error.eliscriptDiagnostic?.code === 'ELI-B0001' && error.eliscriptDiagnostic.phase === 'managed-link');
  assert.equal(JSON.stringify(unrelated),before);
});
