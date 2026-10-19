import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, posix, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {createManagedProjectFacades} from '../tools/backends/managed-module-graph.mjs';

const root = resolve(import.meta.dir, '..');
const nativeSupported = process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform);
const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
const memory = Object.freeze({initialPages: 128, maximumPages: 4096});
const budget = Object.freeze({maxSlots: 1024, initialBytes: 65536, maxBytes: 16777216});
const entry = 'sequence-data.mjs';
const observations = ['bounded_consumption', 'cached_realization', 'successful_cache', 'early_stop_and_partitions',
  'paths_aliases_and_collisions', 'shared_hash_state', 'ieee_arithmetic', 'rejection_order'];
const originalHosts = ['transducer', 'core-stdlib', 'data-text', 'value-hash'];
let directory, backend, lowered, nativePath, wasmPath, oracleDirectory;
const originalSources = new Map();
const publicModules = new Map();

// These tags only transport IEEE/undefined observations. They perform no
// standard-library operation and do not derive any expected target result.
function observationJSON(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item === undefined) return {$number: 'undefined'};
    if (typeof item === 'bigint') return {$bigint: String(item)};
    if (typeof item !== 'number') return item;
    if (Object.is(item, -0)) return {$number: '-0'};
    if (Number.isNaN(item)) return {$number: 'NaN'};
    if (item === Infinity) return {$number: '+Infinity'};
    if (item === -Infinity) return {$number: '-Infinity'};
    return item;
  });
}
function successful(engine, script, args = [], timeout = 60000) {
  const command = engine === 'bun' ? process.execPath : process.env.NODE_BINARY ?? 'node';
  const flags = engine === 'bun' ? ['--preload', resolve(root, 'tests/fixtures/compiled-eli-bun-preload.mjs')]
    : ['--experimental-loader', resolve(root, 'tests/fixtures/compiled-eli-node-loader.mjs')];
  const child = spawnSync(command, [...flags, script, ...args], {
    cwd: root, encoding: 'utf8', timeout, env: {...process.env, BUN: process.execPath},
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr + '\n' + child.stdout);
  return child.stdout.trim();
}
function dependencies(program) {
  const result = [];
  function walk(nodes) {for (const node of nodes) {if (node.kind === 'import-declaration') result.push(node.value);walk(node.children ?? []);}}
  walk(program.body);return result;
}
function exportedNames(program) {
  const names = [];
  function declarations(nodes) {
    for (const node of nodes) {
      if (node.kind === 'module-declaration') declarations(node.children);
      else if (node.kind === 'export-declaration') names.push(...node.children.map(child => child.value));
    }
  }
  declarations(program.body);
  return names;
}
async function write(path, source) {await mkdir(dirname(path), {recursive: true});await writeFile(path, source);}

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-sequence-data-'));
  backend = await buildBackends({outputRoot: resolve(directory, 'backend')});
  const {literalSources, literalModules} = await backend.loadLiteralModules();
  assert.equal(literalSources.length, literalModules.length);
  for (let index = 0; index < literalSources.length; index++) {
    assert.equal(literalSources[index].id, literalModules[index].id);
    assert.equal(literalSources[index].source, await readFile(resolve(root, literalSources[index].filename), 'utf8'));
  }
  const modules = new Map();
  oracleDirectory = resolve(directory, 'oracle');
  await mkdir(resolve(directory, 'node_modules'), {recursive: true});
  await symlink(root, resolve(directory, 'node_modules/eliscript'), 'dir');
  async function add(id, filename, source) {
    if (modules.has(id)) return;
    source ??= await readFile(resolve(root, filename), 'utf8');
    const program = backend.compiler.compile_ir_string(source, filename);
    modules.set(id, {id, program});
    await write(resolve(oracleDirectory, id), backend.compiler.emit_ir_string(program));
    for (const specifier of dependencies(program)) {
      if (!specifier.startsWith('.')) continue;
      const target = posix.normalize(posix.join(posix.dirname(id), specifier));
      // Actual canonical runtime imports are resolved by the literal IR graph.
      if (target.startsWith('runtime/')) continue;
      assert(!target.startsWith('../'), 'fixture dependency escapes its source root: ' + target);
      const sourcePath = target.endsWith('.mjs') ? target.slice(0, -4) + '.eli' : target;
      await add(target, sourcePath);
    }
  }
  // Export the actual canonical .eli bindings as ordinary project cells. These
  // modules contain imports/re-exports only, and no host implementation.
  for (const record of literalModules.filter(item => /^runtime\/(?:core|testing)\/.+\.mjs$/.test(item.id))) {
    const names = exportedNames(record.program);
    assert(names.length > 0, record.id + ' must expose its actual public contract');
    const specifier = 'eliscript/' + record.id;
    const id = 'public/' + record.id;
    await add(id, 'sequence-data-public/' + record.id, `(import ${JSON.stringify(specifier)} ${names.join(' ')})\n(export ${names.join(' ')})\n`);
    publicModules.set(record.id, id);
  }
  await add(entry, 'tests/fixtures/wasm-managed-sequence-data.eli');
  await add('tests/fixtures/lazy-sequence.mjs', 'tests/fixtures/lazy-sequence.eli');
  await add('core-set-usage.mjs', 'tests/fixtures/core-set-usage.eli');
  for (const family of ['sequence', 'text', 'object']) {
    await add(family + '.mjs', 'stdlib/' + family + '.eli');
    if (family === 'object') await add('data.mjs', 'stdlib/data.eli');
    await add(family + '-usage.mjs', 'tests/fixtures/' + family + '-usage.eli');
  }
  for (const name of originalHosts.concat(['lazy-sequence', 'core-text-object']))
    originalSources.set(name, await readFile(resolve(root, 'tests/fixtures/' + name + '-host.mjs'), 'utf8'));
  const runtime = backend.compiler.compile_ir_string(await readFile(resolve(root, 'bootstrap/runtime/memory.eli'), 'utf8'), 'runtime.eli');
  const input = [...modules.values()], saved = structuredClone(input), library = structuredClone(literalModules);
  lowered = backend.managed.lower_managed_project(input, entry, runtime, {literalModules, phased: true});
  assert.deepEqual(input, saved);assert.deepEqual(literalModules, library);
  const bytes = Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed, memory), 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  wasmPath = resolve(directory, 'sequence-data.wasm');await writeFile(wasmPath, bytes);
  await writeFile(resolve(directory, 'lowered.json'), JSON.stringify(lowered));
  if (nativeSupported) {
    nativePath = resolve(directory, process.platform === 'linux' ? 'sequence-data.so' : 'sequence-data.dylib');
    await writeFile(nativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, nativeTarget)));
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function selectedImports(source, deployment) {
  return source.replace(/from (["'])(?:\.\.\/)+runtime\/(core|testing)\/([^"']+)\1/g, (_all, _quote, family, filename) => {
    const id = publicModules.get('runtime/' + family + '/' + filename);
    assert(id, 'the complete original host requires an actual target module: ' + filename);
    return 'from ' + JSON.stringify(pathToFileURL(resolve(deployment, id)).href);
  });
}
async function prepare(host, label) {
  const deployment = resolve(directory, host + '-' + label);await mkdir(deployment, {recursive: true});
  for (const file of createManagedProjectFacades(lowered.descriptor, {entry}).files)
    await write(resolve(deployment, file.id), file.source);
  return deployment;
}
function lifecycle(host, deployment, body, args = []) {
  return `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instantiateManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/managed-runtime.mjs')).href)};
import {instantiateNativeManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/native-managed-runtime.mjs')).href)};
import {createManagedModuleGraph,loadManagedProjectGraph} from ${JSON.stringify(pathToFileURL(resolve(root, 'tools/backends/managed-module-graph.mjs')).href)};
const lowered=JSON.parse(await readFile(${JSON.stringify(resolve(directory, 'lowered.json'))},'utf8'));
const moduleGraph=createManagedModuleGraph(lowered.descriptor);
const oldModule=WebAssembly.Module,oldInstance=WebAssembly.Instance;
let runtime;
try {
 ${host === 'native' ? `WebAssembly.Module=function(){throw new Error('native sequence/data must not execute WASM');};WebAssembly.Instance=function(){throw new Error('native sequence/data must not execute WASM');};` : ''}
 const options={...${JSON.stringify({...memory, ...budget, initializeModule: false, nativeTarget})},moduleGraph};
 runtime=${host === 'wasm' ? `instantiateManagedRuntime(new Uint8Array(await readFile(${JSON.stringify(wasmPath)})),options)` : `await instantiateNativeManagedRuntime(${JSON.stringify(nativePath)},lowered,options)`};
 runtime.auto(65536);
 await loadManagedProjectGraph(runtime,lowered.descriptor,{moduleGraph,projectEntry:${JSON.stringify(entry)},projectModuleBaseURL:${JSON.stringify(pathToFileURL(deployment + '/').href)}});
 process.argv.splice(2,process.argv.length-2,...${JSON.stringify(args)});
 ${body}
 assert.equal(runtime.stats().frameDepth,0);
}finally{
 WebAssembly.Module=oldModule;WebAssembly.Instance=oldInstance;
 if(runtime){try{runtime.closeModule();runtime.collect();assert.equal(runtime.stats().frameDepth,0);assert.equal(runtime.live(),0);runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);}finally{runtime.close?.();}}
 else moduleGraph.close();
}
`;
}
async function runSelected(host, engine, label, source, args = []) {
  const deployment = await prepare(host, label + '-' + engine);
  const bodyPath = resolve(deployment, 'original-host.mjs');
  await writeFile(bodyPath, selectedImports(source, deployment));
  const script = resolve(deployment, 'run.mjs');
  const resolvedArgs = args.map(id => resolve(deployment, id));
  await writeFile(script, lifecycle(host, deployment, 'await import(' + JSON.stringify(pathToFileURL(bodyPath).href) + ');', resolvedArgs));
  return successful(engine, script);
}
async function runReference(engine, label, source, args = []) {
  const script = resolve(directory, 'reference-' + label + '-' + engine + '.mjs');
  // Only original relative imports acquire absolute URLs when relocated.
  source = source.replace(/from (["'])(\.\.\/\.\.\/runtime\/[^"']+)\1/g,
    (_all, _quote, relative) => 'from ' + JSON.stringify(pathToFileURL(resolve(root, 'tests/fixtures', relative)).href));
  await writeFile(script, source);
  return successful(engine, script, args.map(id => resolve(oracleDirectory, id)));
}

for (const host of ['wasm', 'native']) {
  const actualTest = test.skipIf(host === 'native' && !nativeSupported);
  for (const engine of ['bun', 'node']) {
    for (const name of originalHosts) actualTest(`${host}/${engine}: complete original ${name} host corpus`, async () => {
      const source = originalSources.get(name);
      const reference = await runReference(engine, name, source);
      const actual = await runSelected(host, engine, name, source);
      assert.deepEqual(JSON.parse(actual), JSON.parse(reference));
      // All original fixed scalar, collision and nested hash vectors remain
      // independent of both the reference implementation and selected target.
      if (name === 'value-hash') assert.deepEqual(JSON.parse(actual), JSON.parse(await readFile(resolve(root, 'tests/fixtures/value-hashes.json'), 'utf8')));
    }, 60000);
    actualTest(`${host}/${engine}: complete original compiled lazy-sequence fixture`, async () => {
      const source = originalSources.get('lazy-sequence');
      const args = ['tests/fixtures/lazy-sequence.mjs'];
      assert.deepEqual(JSON.parse(await runSelected(host, engine, 'lazy', source, args)),
        JSON.parse(await runReference(engine, 'lazy', source, args)));
    }, 60000);
    actualTest(`${host}/${engine}: complete original core text/object host corpus`, async () => {
      const source = originalSources.get('core-text-object');
      const args = ['public/runtime/core/text.mjs', 'public/runtime/core/object.mjs'];
      assert.deepEqual(JSON.parse(await runSelected(host, engine, 'text-object', source, args)),
        JSON.parse(await runReference(engine, 'text-object', source, args)));
    }, 60000);
    for (const family of ['sequence', 'text', 'object']) actualTest(`${host}/${engine}: entire original portable ${family} usage`, async () => {
      const id = family + '-usage.mjs';
      const reference = successful(engine, resolve(oracleDirectory, id));
      const deployment = await prepare(host, 'portable-' + family + '-' + engine);
      const script = resolve(deployment, 'run.mjs');
      await writeFile(script, lifecycle(host, deployment,
        'await import(' + JSON.stringify(pathToFileURL(resolve(deployment, id)).href) + ');'));
      assert.deepEqual(JSON.parse(successful(engine, script)), JSON.parse(reference));
    }, 60000);
    actualTest(`${host}/${engine}: original relational set complete usage and host observations`, async () => {
      const suite = await readFile(resolve(root, 'tests/core-set.test.mjs'), 'utf8');
      const start = suite.indexOf('  const source = [', suite.indexOf('async function runUsageHost'));
      const end = suite.indexOf('  return JSON.parse', start);
      assert(start >= 0 && end > start);
      const originalHost = new Function('pathToFileURL', 'module', suite.slice(start, end) + '\nreturn source;');
      const id = 'core-set-usage.mjs';
      const reference = await runReference(engine, 'set', originalHost(pathToFileURL, resolve(oracleDirectory, id)));
      const deployment = await prepare(host, 'set-' + engine);
      const body = resolve(deployment, 'set-host.mjs');
      await writeFile(body, originalHost(pathToFileURL, resolve(deployment, id)));
      const script = resolve(deployment, 'run.mjs');
      await writeFile(script, lifecycle(host, deployment, 'await import(' + JSON.stringify(pathToFileURL(body).href) + ');'));
      assert.deepEqual(JSON.parse(successful(engine, script)), JSON.parse(reference));
    }, 60000);
    actualTest(`${host}/${engine}: internal infinite, cache, close, metadata, paths, metrics and IEEE observations`, async () => {
      const source = `const m=await import(process.argv[2]);\n${observationJSON.toString()}\nconst out={};\nfor(const name of ${JSON.stringify(observations)})out[name]=m[name]();\nconsole.log(observationJSON(out));`;
      const reference = JSON.parse(await runReference(engine, 'boundaries', source, [entry]));
      const actual = JSON.parse(await runSelected(host, engine, 'boundaries', source, [entry]));
      assert.deepEqual(actual, reference);
      assert.deepEqual(actual.bounded_consumption, [[1, 2, 3], {pulls: 3, closes: 1}, 7, {pulls: 0, closes: 0}, [0, 1, 2, 3, 4]]);
      assert.deepEqual(actual.cached_realization, [1, 2, [1, 2], 1, {pulls: 3, closes: 1}, true, true, true, 2]);
      assert.deepEqual(actual.successful_cache, [[false, 0], [20, 40, 60], [20, 40, 60], 1, 3, true, true, 3]);
      assert.equal(actual.rejection_order[0], true);
      assert.deepEqual(actual.rejection_order[1], [1]);
      assert.deepEqual(actual.rejection_order[2], {pulls: 1, closes: 1});
      assert.deepEqual(actual.ieee_arithmetic.slice(0, 5), [{$number: '-0'}, {$number: '-Infinity'}, {$number: 'NaN'}, {$number: '+Infinity'}, {$number: 'NaN'}]);
    }, 60000);
    actualTest(`${host}/${engine}: standard print/compare slots keep identity in both boundary directions`, async () => {
      const source = `import assert from 'node:assert/strict';
import {IPrint,printValue} from ${JSON.stringify(pathToFileURL(resolve(root, 'runtime/core/data-text.mjs')).href)};
import {IComparable,compareValues} from ${JSON.stringify(pathToFileURL(resolve(root, 'runtime/core/order.mjs')).href)};
import {protocolSlot,protocolMethod,isProtocol} from ${JSON.stringify(pathToFileURL(resolve(root, 'runtime/core/protocol.mjs')).href)};
const m=await import(process.argv[2]);
const input={ [protocolSlot(IPrint,'print')](){return 'host-print';},[protocolSlot(IComparable,'compare')](){return 0;} };
assert.deepEqual(Array.from(m.read_standard_input(input)),['host-print',0]);
const values=m.standard_protocol_identities();
assert.equal(values[0],protocolSlot(IPrint,'print'));
assert.equal(values[1],protocolMethod(IPrint,'print'));
assert.equal(values[2],IPrint.operations);assert.equal(values[3],IPrint);
assert.equal(values[4],protocolSlot(IComparable,'compare'));assert.equal(values[5],IComparable);
assert.equal(printValue(values[6]),'target-print');assert.equal(compareValues(values[6],values[6]),0);
assert.equal(isProtocol(values[7]),true);assert.notEqual(values[7],IPrint);
assert.notEqual(protocolSlot(values[7],'print'),protocolSlot(IPrint,'print'));
console.log('standard identities preserved');`;
      assert.equal(await runSelected(host, engine, 'standard-protocols', source, [entry]), 'standard identities preserved');
    }, 60000);
  }
}
