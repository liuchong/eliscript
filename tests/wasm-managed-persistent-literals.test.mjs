import {afterAll, beforeAll, expect, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {createManagedModuleGraph, createManagedProjectFacades, loadManagedProjectGraph} from '../tools/backends/managed-module-graph.mjs';
import {PersistentList, persistentList} from '../runtime/core/list.mjs';
import {PersistentVector, persistentVector} from '../runtime/core/vector.mjs';
import {PersistentHashMap, persistentHashMap} from '../runtime/core/map.mjs';
import {PersistentHashSet, persistentHashSet} from '../runtime/core/set.mjs';
import {PersistentQueue, persistentQueue} from '../runtime/core/queue.mjs';
import {EliscriptSymbol, eliscriptSymbol, keyword} from '../runtime/core/identifier.mjs';
import {meta, withMeta} from '../runtime/core/metadata.mjs';
import {compileRegex, isRegexPattern, regexSource, regexFlags} from '../runtime/core/regex.mjs';
import {PersistentSortedMap, PersistentSortedSet, persistentSortedMap, defaultSortedComparator} from '../runtime/core/sorted.mjs';
import {hashValue} from '../runtime/core/value.mjs';
import {isProtocol, protocolMethod, protocolSlot} from '../runtime/core/protocol.mjs';
import {isType, isTypeValue, typeFieldNames} from '../runtime/core/type.mjs';
import {isRecord, isRecordType, recordFieldNames} from '../runtime/core/record.mjs';

const root = resolve(import.meta.dir, '..');
const nativeSupported = process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform);
const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
const memory = Object.freeze({initialPages: 128, maximumPages: 4096});
// Keep the existing managed host defaults, rather than masking allocation bugs
// by enlarging the literal fixture's heap.
const budget = Object.freeze({maxSlots: 1024, initialBytes: 65536, maxBytes: 16777216});
const exported = `vector-value map-value map-literal set-value set-literal macro-set
set-evaluation-order queue-value queue-literal queue-evaluation-order keyword-value keyword-map
macro-keyword quoted-keyword quoted-data quoted-map quoted-set quoted-queue
list-value list-first list-rest list-cons empty-list-rest array-value prepended-array object-value
vector-first vector-count array-second array-count`.trim().split(/\s+/);
const boundarySource = `(import "./literal-runtime.mjs" ${exported.join(' ')})
(import "eliscript/runtime/core/regex" compileRegex regexFind regexSource regexFlags isRegexPattern)
(import "eliscript/runtime/core/sorted" persistentSortedMapBy persistentSortedSetBy isPersistentSortedCollection)
(import "eliscript/runtime/core/metadata" withMeta)
(import "eliscript/runtime/core/value" hashValue)
(import "eliscript/runtime/core/value-internals" cachedProtocolHash resetValueMetrics clearValueCaches readValueMetrics)
(import "eliscript/runtime/core/protocol" defineProtocol protocolMethod protocolSlot)
(import "eliscript/runtime/core/type" defineType reifyProtocols)
(import "eliscript/runtime/core/record" defineRecordType)
(defun boundary-echo (value) value)
(defun boundary-same (left right) (eq left right))
(defun boundary-vector-update (value) (js-call value :assoc 0 -0.0))
(defun boundary-map-update (value) (js-call value :assoc :updated 42))
(defun boundary-set-update (value) (js-call value :conj 42))
(defun boundary-queue-update (value) (js-call value :conj 42))
(defun boundary-list-update (value) (cons 42 value))
(defun boundary-aliases ()
  (let ((shared [1 undefined -0.0]))
    (js-array shared shared (hash-map :child shared) (list shared shared))))
(defun boundary-identifiers ()
  (let ((name 'same)) (js-array :same :same name name 'same)))
(defun boundary-fake () (Object/freeze (js-object :kind "vector" :count 2 :values (js-array 1 2))))
(defun boundary-regex-value ()
  (let ((pattern (compileRegex "a+" "ui")))
    (js-array pattern pattern (regexFind pattern "BAAA"))))
(defun boundary-regex-observe (pattern)
  (js-array (regexSource pattern) (regexFlags pattern) (regexFind pattern "BAAA")))
(defun boundary-regex-pattern? (pattern) (isRegexPattern pattern))
(defun boundary-sorted-values ()
  (let* ((calls 0)
         (comparison (lambda (left right) (setq calls (1+ calls)) (- left right)))
         (values (persistentSortedMapBy comparison 2 "b" 1 "a"))
         (map (withMeta values (hash-map :origin "target")))
         (set (persistentSortedSetBy comparison 3 1)))
    (js-array map (get map :comparator) map set (get set :comparator) (lambda () calls) calls)))
(defun boundary-sorted-default-update (value) (js-call value :assoc 3 "c"))
(defun boundary-sorted? (value) (isPersistentSortedCollection value))
(defun boundary-hash-cache ()
  (clearValueCaches)
  (let* ((value [1 2]) (computations 0)
         (direct (cachedProtocolHash value (lambda () (setq computations (1+ computations)) -1)))
         (public (hashValue value)) (first (readValueMetrics)))
    (resetValueMetrics)
    (let* ((retained (hashValue value)) (after-reset (readValueMetrics)))
      (clearValueCaches)
      (let* ((empty (readValueMetrics)) (recomputed (hashValue value)) (after-clear (readValueMetrics)))
        (js-array direct public retained computations first after-reset empty recomputed after-clear)))))
(defun boundary-type-identities ()
  (let* ((protocol (defineProtocol "Boundary" (js-array "read")))
         (shared (js-object :zero -0.0))
         (type (defineType "Same" (js-array "value")
           (js-array (js-array protocol (js-object :read (lambda (self) (get self :value)))))))
         (value (js-call type :create shared))
         (record-type (defineRecordType "Same" (js-array "value")))
         (other-record-type (defineRecordType "Same" (js-array "value")))
         (record (js-call record-type :create shared))
         (reified (reifyProtocols (js-array (js-array protocol (js-object :read (lambda (self) 7)))))))
    (js-array (protocolSlot protocol "read") (protocolMethod protocol "read") (get protocol :operations) protocol
      (get type :typeFields) type value shared (get record-type :recordFields) record-type other-record-type record reified)))
(export ${exported.join(' ')} boundary-echo boundary-same boundary-vector-update boundary-map-update
 boundary-set-update boundary-queue-update boundary-list-update boundary-aliases boundary-identifiers boundary-fake
 boundary-regex-value boundary-regex-observe boundary-regex-pattern?
 boundary-sorted-values boundary-sorted-default-update boundary-sorted? boundary-hash-cache boundary-type-identities)`;
let directory, backend, lowered, wasmBytes, nativePath, oraclePath, assertOriginalReport, serial = 0;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-persistent-literals-'));
  backend = await buildBackends({outputRoot: resolve(directory, 'backend')});
  const fixtureSource = await readFile(resolve(root, 'tests/fixtures/literal-runtime.eli'), 'utf8');
  const {literalSources, literalModules} = await backend.loadLiteralModules();
  assert.deepEqual(literalSources.map(item => item.id).sort(), [
    'bit', 'persistent-list', 'persistent-vector', 'persistent-map', 'persistent-set', 'value', 'managed-queue-state', 'managed-literals',
    'managed-transient-state', 'managed-vector-view-state', 'managed-literal-protocols', 'managed-sorted-state',
    'managed-value-state', 'core/protocol', 'core/text', 'core/object', 'core/set', 'core/data',
  ].map(name => 'stdlib/' + name + '.mjs').concat(
    ['protocol-error', 'list', 'vector', 'map', 'set', 'queue', 'identifier', 'record', 'value',
      'metadata', 'collection', 'transient', 'protocol', 'type', 'order', 'sorted', 'regex',
      'transducer', 'lazy-sequence', 'text', 'object', 'truth', 'sequence', 'set-algebra',
      'collection-internals', 'metadata-internals', 'persistent-kind', 'data', 'data-text', 'value-internals'].map(name => 'runtime/core/' + name + '.mjs'),
    'runtime/literals.mjs',
    'runtime/wire/markdown.mjs', 'runtime/wire/schema.mjs', 'runtime/wire/http-rpc.mjs',
    'runtime/testing/value.mjs',
  ).sort());
  assert.equal(literalModules.length, literalSources.length);
  for (let index = 0; index < literalModules.length; index++) {
    assert.equal(literalModules[index].id, literalSources[index].id);
    assert.equal(literalSources[index].source, await readFile(resolve(root, literalSources[index].filename), 'utf8'));
  }
  const modules = [
    {id: 'literal-runtime.mjs', program: backend.compiler.compile_ir_string(fixtureSource, 'tests/fixtures/literal-runtime.eli')},
    {id: 'boundary.mjs', program: backend.compiler.compile_ir_string(boundarySource, 'persistent-boundary.eli')},
  ];
  const runtime = backend.compiler.compile_ir_string(await readFile(resolve(root, 'bootstrap/runtime/memory.eli'), 'utf8'), 'runtime.eli');
  const originalModules = structuredClone(modules), originalLibrary = structuredClone(literalModules);
  lowered = backend.managed.lower_managed_project(modules, 'boundary.mjs', runtime, {literalModules, phased: true});
  assert.deepEqual(modules, originalModules);assert.deepEqual(literalModules, originalLibrary);
  assert.deepEqual(lowered.descriptor.hostCapabilities ?? [], []);
  assert.equal(lowered.descriptor.literalRuntime.version, 1);
  wasmBytes = Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed, memory), 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes)), []);
  await writeFile(resolve(directory, 'literal-runtime.wasm'), wasmBytes);
  await writeFile(resolve(directory, 'literal-runtime.lowered.json'), JSON.stringify(lowered));
  if (nativeSupported) {
    nativePath = resolve(directory, process.platform === 'linux' ? 'literal-runtime.so' : 'literal-runtime.dylib');
    await writeFile(nativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, nativeTarget)));
  }
  // Reuse the complete original assertion body. This is the original literal
  // host's data oracle, not a reduced fixture or a replacement compiler.
  const originalTest = await readFile(resolve(root, 'tests/literal-runtime.test.mjs'), 'utf8');
  const start = originalTest.indexOf('expect(bunReport).toEqual({');
  assert(start >= 0);const end = originalTest.indexOf('\n    });', start);assert(end > start);
  assert.equal(originalTest.indexOf('expect(bunReport).toEqual({', start + 1), -1);
  assertOriginalReport = new Function('expect', 'bunReport', originalTest.slice(start, end + '\n    });'.length));
  const oracleDirectory = resolve(directory, 'oracle');await mkdir(oracleDirectory);
  await mkdir(resolve(directory, 'node_modules'));await symlink(root, resolve(directory, 'node_modules/eliscript'), 'dir');
  oraclePath = resolve(oracleDirectory, 'literal-runtime.mjs');
  await writeFile(oraclePath, backend.compiler.compile_string(fixtureSource, 'tests/fixtures/literal-runtime.eli'));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

async function facadesAt(path) {
  const facades = createManagedProjectFacades(lowered.descriptor, {entry: 'boundary.mjs'});
  for (const file of facades.files) {const output = resolve(path, file.id);await mkdir(dirname(output), {recursive: true});await writeFile(output, file.source);}
  return facades;
}
async function openRuntime(host, {hostModules} = {}) {
  const deployment = resolve(directory, 'live-' + host + '-' + (++serial));await mkdir(deployment);
  await facadesAt(deployment);
  const moduleGraph = createManagedModuleGraph(lowered.descriptor);
  let runtime;
  try {
    if (host === 'wasm') runtime = instantiateManagedRuntime(wasmBytes, {...budget, initializeModule: false, moduleGraph, hostModules});
    else runtime = await instantiateNativeManagedRuntime(nativePath, lowered, {...memory, ...budget, initializeModule: false, moduleGraph, nativeTarget, hostModules});
    runtime.auto(65536);
    const project = await loadManagedProjectGraph(runtime, lowered.descriptor, {moduleGraph,
      projectEntry: 'boundary.mjs', projectModuleBaseURL: pathToFileURL(deployment + '/').href});
    return {runtime, namespace: project.namespace};
  } catch (error) {try {runtime?.closeModule();} catch {}try {runtime?.close?.();} catch {}moduleGraph.close();throw error;}
}
function finish(runtime) {
  try {
    runtime.closeModule();runtime.collect();assert.equal(runtime.stats().frameDepth, 0);assert.equal(runtime.live(), 0);
    runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);
  } finally {runtime.close?.();}
}
function invokeHost(runtime, name, value) {
  const input = runtime.fromHostValue(value);
  try {const output = runtime.invoke(name, [input]);try {return runtime.toHostValue(output);} finally {runtime.release(output);}}
  finally {runtime.release(input);}
}
function hostScript(engine, script, args, timeout = 60000) {
  const result = spawnSync(engine === 'bun' ? process.execPath : process.env.NODE_BINARY ?? 'node', [script, ...args], {
    cwd: root, encoding: 'utf8', timeout, env: {...process.env, BUN: process.execPath},
  });
  assert.equal(result.error, undefined);assert.equal(result.status, 0, result.stderr + result.stdout);
  return JSON.parse(result.stdout.trim());
}

for (const host of ['wasm', 'native']) {
  const hostTest = test.skipIf(host === 'native' && !nativeSupported);
  for (const engine of ['bun', 'node']) {
    hostTest('the complete original persistent literal host executes real ' + host + ' with ' + engine, async () => {
      const deployment = resolve(directory, 'original-' + host + '-' + engine);await mkdir(deployment);
      await facadesAt(deployment);
      const script = resolve(deployment, 'host.mjs');
      const source = `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {instantiateManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/managed-runtime.mjs')).href)};
import {instantiateNativeManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/native-managed-runtime.mjs')).href)};
import {createManagedModuleGraph,loadManagedProjectGraph} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/managed-module-graph.mjs')).href)};
const lowered=JSON.parse(await readFile(${JSON.stringify(resolve(directory, 'literal-runtime.lowered.json'))},'utf8'));
const moduleGraph=createManagedModuleGraph(lowered.descriptor);
const options={...${JSON.stringify({...memory, ...budget, initializeModule: false, nativeTarget})},moduleGraph};
let runtime;const oldModule=WebAssembly.Module,oldInstance=WebAssembly.Instance;
try{
 ${host === 'native' ? `WebAssembly.Module=function(){throw new Error('native literals must not execute WASM');};WebAssembly.Instance=function(){throw new Error('native literals must not execute WASM');};` : ''}
 runtime=${host === 'wasm' ? `instantiateManagedRuntime(new Uint8Array(await readFile(${JSON.stringify(resolve(directory, 'literal-runtime.wasm'))})),options)` : `await instantiateNativeManagedRuntime(${JSON.stringify(nativePath)},lowered,options)`};
 runtime.auto(65536);
 await loadManagedProjectGraph(runtime,lowered.descriptor,{moduleGraph,projectEntry:'boundary.mjs',projectModuleBaseURL:${JSON.stringify(pathToFileURL(deployment + '/').href)}});
 process.argv[2]=${JSON.stringify(resolve(deployment, 'boundary.mjs'))};
 await import(${JSON.stringify(pathToFileURL(resolve(root, 'tests/fixtures/literal-runtime-host.mjs')).href)});
 assert.equal(runtime.stats().frameDepth,0);
}finally{WebAssembly.Module=oldModule;WebAssembly.Instance=oldInstance;if(runtime){try{runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);}finally{runtime.close?.();}}else moduleGraph.close();}
`;
      await writeFile(script, source);
      const report = hostScript(engine, script, []);
      assertOriginalReport(expect, report);
      const oracle = hostScript(engine, resolve(root, 'tests/fixtures/literal-runtime-host.mjs'), [oraclePath]);
      assertOriginalReport(expect, oracle);assert.deepEqual(report, oracle);
    }, 60000);
  }

  hostTest(host + ' persistent boundaries preserve actual classes, immutable structure and nested aliases', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    try {
      for (const [value, Class] of [[m.vector_value, PersistentVector], [m.map_value, PersistentHashMap],
        [m.set_value, PersistentHashSet], [m.queue_value, PersistentQueue], [m.list_value, PersistentList]]) {
        assert(value instanceof Class);assert.equal(Object.isFrozen(value), true);assert.equal(Object.isExtensible(value), false);
        assert.equal(Reflect.set(value, 'added', 1), false);
        assert.throws(() => Object.defineProperty(value, 'added', {value: 1}), TypeError);
      }
      const aliases = m.boundary_aliases(), shared = aliases[0];
      assert(shared instanceof PersistentVector);assert.equal(aliases[1], shared);
      assert.equal(aliases[2].get(keyword('child')), shared);
      assert.equal(aliases[3].first(), shared);assert.equal(aliases[3].rest().first(), shared);
      assert.equal(shared.nth(1), undefined);assert(Object.is(shared.nth(2), -0));
      const raw = a.fromHostValue(shared);
      try {
        const same = a.invoke('boundary_same', [raw, raw]);assert.equal(same, true);
        const echoed = a.invoke('boundary_echo', [raw]);
        try {assert.equal(a.toHostValue(echoed), shared);} finally {a.release(echoed);}
      } finally {a.release(raw);}
      const ids = m.boundary_identifiers();
      assert.equal(ids[0], keyword('same'));assert.equal(ids[0], ids[1]);
      assert(ids[2] instanceof EliscriptSymbol);assert.equal(ids[2], ids[3]);assert.notEqual(ids[2], ids[4]);
      assert.equal(ids[2].qualifiedName, ids[4].qualifiedName);
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' imported persistent metadata and updates use target algorithms and preserve the original input', async () => {
    const {runtime: a} = await openRuntime(host);
    try {
      const metadata = persistentHashMap([keyword('source'), 'host']);
      const shared = persistentVector(7, 8);
      const cases = [
        ['boundary_vector_update', withMeta(persistentVector(shared, shared), metadata), PersistentVector],
        ['boundary_map_update', withMeta(persistentHashMap([keyword('child'), shared]), metadata), PersistentHashMap],
        ['boundary_set_update', withMeta(persistentHashSet(shared), metadata), PersistentHashSet],
        ['boundary_queue_update', withMeta(persistentQueue(shared), metadata), PersistentQueue],
        ['boundary_list_update', withMeta(persistentList(shared), metadata), PersistentList],
      ];
      for (const [name, input, Class] of cases) {
        const original = [...input], raw = a.fromHostValue(input);
        const blocked = [PersistentVector, PersistentHashMap, PersistentHashSet, PersistentQueue, PersistentList]
          .flatMap(Constructor => ['assoc', 'conj', 'cons'].filter(method => typeof Constructor.prototype[method] === 'function')
            .map(method => [Constructor.prototype, method, Object.getOwnPropertyDescriptor(Constructor.prototype, method)]));
        let output;
        try {
          for (const [prototype, method, descriptor] of blocked) Object.defineProperty(prototype, method, {...descriptor,
            value() {throw new Error('target persistent algorithms cannot execute a host collection method');}});
          output = a.invoke(name, [raw]);
        } finally {for (const [prototype, method, descriptor] of blocked) Object.defineProperty(prototype, method, descriptor);a.release(raw);}
        try {
          const result = a.toHostValue(output);assert(result instanceof Class);assert.equal(Object.isFrozen(result), true);
          assert.notEqual(result, input);assert.equal(meta(result), metadata);assert.deepEqual([...input], original);
          assert.equal(invokeHost(a, 'boundary_echo', input), input);
          if(name==='boundary_vector_update'){assert(Object.is(result.nth(0), -0));assert.equal(result.nth(1), shared);}
          else if(name==='boundary_map_update'){assert.equal(result.get(keyword('updated')), 42);assert.equal(result.get(keyword('child')), shared);}
          else if(name==='boundary_set_update')assert.equal(result.has(42), true);
          else if(name==='boundary_queue_update')assert.deepEqual([...result], [shared, 42]);
          else assert.deepEqual([...result], [42, shared]);
        } finally {a.release(output);}
      }
      const symbol = eliscriptSymbol('same');assert.equal(invokeHost(a, 'boundary_echo', symbol), symbol);
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' persistent branding rejects ordinary lookalikes and close releases boundary roots', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    let closed = false;
    try {
      const fake = m.boundary_fake();
      assert.equal(fake instanceof PersistentVector, false);assert.equal(fake.kind, 'vector');
      for (const Class of [PersistentList, PersistentVector, PersistentHashMap, PersistentHashSet, PersistentQueue]) assert.equal(fake instanceof Class, false);
      const hostFake = Object.freeze({kind: 'vector', count: 2, values: [1, 2]});
      assert.equal(invokeHost(a, 'boundary_echo', hostFake), hostFake);
      const retained = m.vector_value, imported = persistentList(m.map_value, retained);
      assert.equal(invokeHost(a, 'boundary_echo', imported), imported);
      assert(a.live() > 0);a.closeModule();a.collect();
      assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
      // A materialized immutable host value remains a normal value after the
      // VM releases its roots; its implementation is the original host class.
      assert.deepEqual([...retained].slice(0, 2), [1, 2]);
      a.close?.();a.close?.();closed = true;assert.throws(() => a.fromHostValue(imported), /closed/);
    } finally {if (!closed) finish(a);}
  }, 60000);

  hostTest(host + ' regex patterns keep the actual private brand and identity while matching in the target', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    try {
      const [pattern, alias, match] = m.boundary_regex_value();
      assert.equal(pattern, alias);assert.equal(isRegexPattern(pattern), true);
      assert.equal(Object.isFrozen(pattern), true);assert.equal(regexSource(pattern), 'a+');assert.equal(regexFlags(pattern), 'iu');
      assert.equal(match, 'AAA');assert.equal(invokeHost(a, 'boundary_echo', pattern), pattern);
      const original = compileRegex('a+', 'iu'), raw = a.fromHostValue(original);
      const HostRegExp = globalThis.RegExp;let result;
      try {
        globalThis.RegExp = function () {throw new Error('target regex matching must not call the host RegExp constructor');};
        result = a.invoke('boundary_regex_observe', [raw]);
      } finally {globalThis.RegExp = HostRegExp;a.release(raw);}
      try {assert.deepEqual(Array.from(a.toHostValue(result)), ['a+', 'iu', 'AAA']);} finally {a.release(result);}
      assert.equal(invokeHost(a, 'boundary_echo', original), original);
      for (const fake of [Object.freeze({}), Object.freeze({source: 'a+', flags: 'iu'})]) {
        assert.equal(invokeHost(a, 'boundary_regex_pattern_QMARK_', fake), false);
        assert.equal(invokeHost(a, 'boundary_echo', fake), fake);
      }
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' regex boundaries use the declared host provider private registry', async () => {
    const alternative = await import(pathToFileURL(resolve(root, 'runtime/core/regex.mjs')).href + '?persistent-boundary=' + (++serial));
    const original = alternative.compileRegex('a+', 'iu');
    assert.equal(alternative.isRegexPattern(original), true);assert.equal(isRegexPattern(original), false);
    const {runtime: a} = await openRuntime(host, {hostModules: new Map([['eliscript/runtime/core/regex', alternative]])});
    try {
      assert.equal(invokeHost(a, 'boundary_echo', original), original);
      const raw = a.fromHostValue(original);let output;
      try {output = a.invoke('boundary_regex_value', []);} finally {a.release(raw);}
      try {
        const result = a.toHostValue(output);
        assert.equal(result[0], result[1]);assert.equal(alternative.isRegexPattern(result[0]), true);
        assert.equal(isRegexPattern(result[0]), false);assert.equal(result[2], 'AAA');
      } finally {a.release(output);}
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' sorted boundaries keep normalized comparator identity without calling it again', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    try {
      const [map, comparison, alias, set, setComparison, calls, before] = m.boundary_sorted_values();
      assert(map instanceof PersistentSortedMap);assert(set instanceof PersistentSortedSet);
      assert.equal(alias, map);assert.equal(map.comparator, comparison);assert.equal(set.comparator, setComparison);
      assert.equal(calls(), before);assert.deepEqual(Array.from(map), [[1, 'a'], [2, 'b']]);assert.deepEqual(Array.from(set), [1, 3]);
      assert.equal(calls(), before);assert.equal(meta(map).get(keyword('origin')), 'target');
      assert.equal(Object.isFrozen(map), true);assert.equal(Object.isFrozen(set), true);
      assert.equal(comparison(2, 1), 1);assert.equal(calls(), before + 1);
      assert.equal(invokeHost(a, 'boundary_echo', map), map);assert.equal(invokeHost(a, 'boundary_echo', set), set);
      const original = persistentSortedMap(1, 'a', 2, 'b'), raw = a.fromHostValue(original);
      const descriptor = Object.getOwnPropertyDescriptor(PersistentSortedMap.prototype, 'assoc');let result;
      try {
        Object.defineProperty(PersistentSortedMap.prototype, 'assoc', {...descriptor, value() {
          throw new Error('target sorted updates must not execute a host collection algorithm');
        }});
        result = a.invoke('boundary_sorted_default_update', [raw]);
      } finally {Object.defineProperty(PersistentSortedMap.prototype, 'assoc', descriptor);a.release(raw);}
      try {
        const updated = a.toHostValue(result);
        assert(updated instanceof PersistentSortedMap);assert.equal(updated.comparator, defaultSortedComparator());
        assert.deepEqual(Array.from(updated), [[1, 'a'], [2, 'b'], [3, 'c']]);
        assert.deepEqual(Array.from(original), [[1, 'a'], [2, 'b']]);
      } finally {a.release(result);}
      const fake = Object.freeze({kind: 'sorted-map', entries: [[1, 'a']], comparison: (left, right) => left - right});
      assert.equal(invokeHost(a, 'boundary_sorted_QMARK_', fake), false);
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' public and internal value hashing share actual caches and resettable metrics', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    try {
      const [direct, publicHash, retained, computations, first, reset, empty, recomputed, cleared] = m.boundary_hash_cache();
      assert.equal(direct, 0xffffffff);assert.equal(publicHash, direct);assert.equal(retained, direct);assert.equal(computations, 1);
      assert.deepEqual({...first}, {hashValueCalls: 1, protocolHashComputations: 1, protocolHashCacheHits: 1, hostIdentityAssignments: 0});
      assert.deepEqual({...reset}, {hashValueCalls: 1, protocolHashComputations: 0, protocolHashCacheHits: 1, hostIdentityAssignments: 0});
      assert.deepEqual({...empty}, {hashValueCalls: 0, protocolHashComputations: 0, protocolHashCacheHits: 0, hostIdentityAssignments: 0});
      assert.equal(recomputed, hashValue(persistentVector(1, 2)));
      assert.deepEqual({...cleared}, {hashValueCalls: 3, protocolHashComputations: 1, protocolHashCacheHits: 0, hostIdentityAssignments: 0});
      for (const snapshot of [first, reset, empty, cleared]) assert.equal(Object.isFrozen(snapshot), true);
    } finally {finish(a);}
  }, 60000);

  hostTest(host + ' protocol members and declarations preserve aliases regardless of graph order', async () => {
    const {runtime: a, namespace: m} = await openRuntime(host);
    try {
      const [slot, method, operations, protocol, fields, Type, value, shared,
        recordFields, Record, OtherRecord, record, reified] = m.boundary_type_identities();
      assert.equal(isProtocol(protocol), true);assert.equal(operations, protocol.operations);
      assert.equal(method, protocolMethod(protocol, 'read'));assert.equal(method.slot, slot);
      assert.equal(protocolSlot(protocol, 'read'), slot);assert.equal(method.protocol, protocol);
      assert.equal(isType(Type), true);assert.equal(isTypeValue(value), true);assert.equal(value.constructor, Type);
      assert.equal(Type.typeFields, fields);assert.equal(typeFieldNames(Type), fields);
      assert.equal(value.value, shared);assert(Object.is(shared.zero, -0));assert.equal(method(value), shared);
      assert.equal(isRecordType(Record), true);assert.equal(isRecordType(OtherRecord), true);assert.notEqual(Record, OtherRecord);
      assert.equal(Record.recordName, OtherRecord.recordName);assert.deepEqual(Array.from(Record.recordFields), Array.from(OtherRecord.recordFields));
      assert.equal(Record.recordFields, recordFields);assert.equal(recordFieldNames(Record), recordFields);
      assert.equal(isRecord(record), true);assert.equal(record.constructor, Record);assert.equal(record.value, shared);
      assert.equal(method(reified), 7);assert.equal(Object.getPrototypeOf(reified), null);
      for (const item of [Type, value, Record, OtherRecord, record, reified, fields, recordFields]) assert.equal(Object.isFrozen(item), true);
      for (const item of [Type, value, Record, record, protocol, method, operations, fields, recordFields, reified]) {
        assert.equal(invokeHost(a, 'boundary_echo', item), item);
      }
    } finally {finish(a);}
  }, 60000);
}
