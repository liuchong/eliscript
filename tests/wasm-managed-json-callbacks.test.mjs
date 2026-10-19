import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const fixture = 'tests/fixtures/wasm-managed-json-callbacks.eli';
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const options = {maxSlots: 4096, initialBytes: 131072, maxBytes: 4194304, maximumPages: 128};
const parseCases = [
  ['null', 0], ['false', 0], ['-0', 0], ['9007199254740993', 0], ['1e9999', 0], ['-1e-9999', 0],
  ['"\\u0041\\ud800\\udc00\\ud800中😀"', 0],
  ['{"b":0,"a":9007199254740993,"b":-0,"__proto__":1,"nested":[true,null,"\\u0041"]}', 0],
  ['{"a":1,"nested":{"z":2}}', 6], ['1', 3], ['{"value":1}', 7],
];
const mutationCases = [['{"a":1,"b":2,"gone":3}', 1], ['[1,2,3]', 1], ['{"a":1,"locked":2}', 2]];
const rawTexts = ['null', 'false', 'true', '0', '-0', '1.2', '1e+2', '1e-2', '1e400',
  '1.2300e+02', '90071992547409931234567890', '1e9999', '-1e-9999',
  '""', '"\\u0000"', '"\\ud800"', '"\\udc00"', '"\\u0041\\ud800\\udc00\\ud800"',
  '"中😀"', '"\\/\\\\\\\""', '"\\b\\f\\n\\r\\t"'];
const invalidRaw = ['', ' ', '\t', ' null', 'null ', '\tnull', 'null\n', '\ufeffnull', 'null\ufeff',
  '[]', '{}', '[1]', '{"a":1}', '01', '-01', '+1', '-', '.1', '1.', '1e', '1e+', '1e-',
  'NaN', 'Infinity', '-Infinity', 'undefined', 'true false', 'null0', '1true', '1 2',
  'tru', 'True', 'fals', 'nul', '"unterminated', '"\\x20"', '"\\u12"', '"\\u12X4"',
  '"a\nb"', '"a\tb"', '"\0"'];
let directory, backend, lowered, bytes, wasmFile, nativeFile, referenceFile, reference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-json-callbacks-'));
  backend = await buildBackends({outputRoot: directory});
  const program = backend.compiler.compile_ir_string(await readFile(fixture, 'utf8'), fixture), saved = JSON.stringify(program);
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime, true);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 2, maximumPages: 128});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  wasmFile = resolve(directory, 'callbacks.wasm');await writeFile(wasmFile, bytes);
  if (target) {
    nativeFile = resolve(directory, target === 'arm64-linux' ? 'callbacks.so' : 'callbacks.dylib');
    await writeFile(nativeFile, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, target)));
  }
  referenceFile = resolve(directory, 'callbacks.mjs');await writeFile(referenceFile, backend.compiler.emit_ir_string(program));
  referenceFile = await realpath(referenceFile);
  reference = await import(pathToFileURL(referenceFile).href);assert.equal(JSON.stringify(program), saved);
}, 120000);
afterAll(async () => {lowered = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

function invoke(a, name, values = []) {
  const owned = [], args = values.map(value => {
    if (typeof value !== 'number' && typeof value !== 'string') return value;
    const handle = typeof value === 'number' ? a.number(value) : a.string(value);owned.push(handle);return handle;
  });
  try {return a.invoke(name, args);} catch (error) {
    if (error instanceof Error && error.constructor === Error && name !== 'failure-phase') {
      try {
        const phase = a.invoke('failure-phase', []);
        try {console.error('JSON callback failure', name, values.filter(value => typeof value === 'number'), a.readNumber(phase));}
        finally {a.release(phase);}
      } catch {}
    }
    throw error;
  } finally {for (const value of owned) a.release(value);}
}
function report(a, name, values = []) {
  const value = invoke(a, name, values);try {return a.readString(value);} finally {a.release(value);}
}
function finish(a) {
  try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  finally {a.close?.();}
}
async function each(run) {
  for (const kind of target ? ['wasm', 'native'] : ['wasm']) {
    const a = kind === 'wasm' ? instantiateManagedRuntime(bytes, {...options, initialPages: 2})
      : await instantiateNativeManagedRuntime(nativeFile, lowered, {...options, initialPages: 2, nativeTarget: target});
    a.auto(1);try {await run(a, kind);} finally {finish(a);}
  }
}
function parseContract(a, js, records) {
  for (const args of records) {
    const actual = report(a, 'parse-probe', args), expected = js.parse_probe(...args);
    assert.equal(actual, expected, JSON.stringify(args));
    const output = JSON.parse(actual);assert.equal(output[3], true, 'each represented primitive source context is fresh');
    for (const event of output[2]) if (event[0] === 'reviver' && event[6])
      assert.deepEqual(event[8], [true, true, true, true]);
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
}
function stringifyContract(a, js) {
  for (const mode of [0, 1, 2, 3, 6]) {
    const actual = report(a, 'stringify-probe', [mode]);assert.equal(actual, js.stringify_probe(mode));
    const output = JSON.parse(actual);
    if (mode === 2) assert.equal(output[0], true);
    if (mode === 1) assert.equal(output[2][0], 'space valueOf', 'space conversion precedes the root replacer');
    if (mode === 3) assert(output[1].includes('9007199254740993'), 'raw replacement retains the full original integer');
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
  assert.equal(report(a, 'property-list-probe'), js.property_list_probe());
}
function rawContract(a, js, texts) {
  for (const text of texts) for (const mode of [0, 1]) {
    const actual = report(a, 'raw-probe', [text, mode]);assert.equal(actual, js.raw_probe(text, mode), text);
    const value = JSON.parse(actual);
    assert.equal(value[0], text);assert.equal(value[1], true);assert.equal(value[2], true);
    assert.deepEqual(value[3], ['rawJSON']);assert.deepEqual(value[4], [true, false, true, false]);
    assert.deepEqual(value.slice(5, 11), [true, false, false, false, false, false]);
    assert(value[11].includes('"raw":' + text));assert(value[11].includes('"also":' + text));
    assert(value[11].includes('"hook":1.2300e+02'));
    assert.equal(value[12].filter(event => event === 'ToString').length, mode);
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
}
function errorsAndRecovery(a, js, rejected) {
  const held = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, held);
  try {
    for (const [name, args, expected] of [
      ['parse-probe', ['{"a":1}', 4], false], ['parse-probe', ['{"a":1}', 5], undefined],
      ['stringify-probe', [8], false], ['stringify-probe', [9], undefined],
      ['raw-throw', [false], false], ['raw-throw', [undefined], undefined],
    ]) {
      let sourceThrew = false, managedThrew = false;
      try {js[name.replaceAll('-', '_')](...args);} catch (error) {sourceThrew = true;assert.strictEqual(error, expected);}
      try {invoke(a, name, args);} catch (error) {managedThrew = true;assert.strictEqual(error, expected);}
      assert.equal(sourceThrew, true);assert.equal(managedThrew, true);
      assert(Object.is(a.readNumber(held), -0));assert.equal(a.stats().frameDepth, 1);
      assert.equal(report(a, 'recover'), js.recover());
    }
    for (const text of rejected) {
      assert.throws(() => js.raw_probe(text, 0), SyntaxError);
      assert.throws(() => invoke(a, 'raw-probe', [text, 0]), SyntaxError);
      assert.equal(a.stats().frameDepth, 1);
    }
    for (const mode of [4, 7]) {
      assert.throws(() => js.stringify_probe(mode), TypeError);
      assert.throws(() => invoke(a, 'stringify-probe', [mode]), TypeError);
      assert.equal(a.stats().frameDepth, 1);
    }
    assert.equal(report(a, 'recover'), js.recover());assert(Object.is(a.readNumber(held), -0));
  } finally {a.leaveFrame(frame);a.release(held);}
}

test('Given JSON source tokens When a three-argument reviver traverses postorder Then holder keys exact primitive contexts and nested calls match JS', async () => {
  await each(a => parseContract(a, reference, parseCases));
}, 30000);
test('Given reviver mutations When pending properties change disappear or become nonconfigurable Then source contexts invalidate without adding visits or throwing', async () => {
  await each(a => parseContract(a, reference, mutationCases));
}, 30000);
test('Given toJSON replacer boxed values holes property lists and space When stringified Then exact callback order keys snapshots and raw BigInt replacement survive GC', async () => {
  await each(a => stringifyContract(a, reference));
}, 30000);
test('Given raw JSON primitives When wrapped cloned inherited frozen and stringified Then only the genuine brand injects its unchanged source text', async () => {
  await each(a => rawContract(a, reference, rawTexts));
}, 30000);
test('Given invalid raw text cycles BigInts and falsy callback throws When execution fails Then the first source value caller roots and later JSON operations survive', async () => {
  await each(a => errorsAndRecovery(a, reference, invalidRaw));
}, 30000);
test('Given the identical callback fixture When run by independent Node and real WASM Then complete parse stringify raw brands and cleanup match', () => {
  const script = `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const{options,parseCases,mutationCases,rawTexts,invalidRaw}=JSON.parse(readFileSync(0,'utf8'));
const js=await import(process.argv[1]);const{instantiateManagedRuntime}=await import(process.argv[2]);
const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
${invoke.toString()}
${report.toString()}
${finish.toString()}
${parseContract.toString()}
${stringifyContract.toString()}
${rawContract.toString()}
${errorsAndRecovery.toString()}
const a=instantiateManagedRuntime(bytes,{...options,initialPages:2});a.auto(1);
try{parseContract(a,js,parseCases);parseContract(a,js,mutationCases);stringifyContract(a,js);
rawContract(a,js,rawTexts);errorsAndRecovery(a,js,invalidRaw);}finally{finish(a);}
process.stdout.write('complete JSON callback source contracts preserved');`;
  const child = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval', script,
    pathToFileURL(referenceFile).href, new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href, wasmFile],
  {encoding: 'utf8', input: JSON.stringify({options, parseCases, mutationCases, rawTexts, invalidRaw}), timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'complete JSON callback source contracts preserved');
}, 30000);
