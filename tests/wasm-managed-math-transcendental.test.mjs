import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const fixture = 'tests/fixtures/wasm-managed-math-transcendental.eli';
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const names = ['acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'cbrt', 'expm1', 'cos', 'cosh',
  'exp', 'hypot', 'log', 'log1p', 'log2', 'log10', 'pow', 'random', 'sin', 'sinh', 'tan', 'tanh'];
const options = {maxSlots: 1024, initialBytes: 65536, maxBytes: 16777216};
let directory, backend, lowered, bytes, wasmFile, nativeFile, referenceFile, reference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-math-transcendental-'));
  backend = await buildBackends({outputRoot: directory});
  const program = backend.compiler.compile_ir_string(await readFile(fixture, 'utf8'), fixture), saved = JSON.stringify(program);
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime, true);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 256});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  wasmFile = resolve(directory, 'math.wasm');await writeFile(wasmFile, bytes);
  if (target) {
    nativeFile = resolve(directory, target === 'arm64-linux' ? 'math.so' : 'math.dylib');
    await writeFile(nativeFile, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, target)));
  }
  const javascript = backend.compiler.emit_ir_string(program);
  referenceFile = resolve(directory, 'math.mjs');await writeFile(referenceFile, javascript);
  // Validate the real emitted file before changing how Bun loads that same
  // text. The independently executing Node case below also keeps this file
  // as its complete oracle; a malformed emission cannot be hidden by a URL.
  const validation = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval',
    `import assert from 'node:assert/strict';const m=await import(process.argv[1]);
assert.equal(m.direct('sin',0,1,0),0);assert.equal(m.direct('exp',0,1,0),1);
assert.equal(m.scalar_call(),8);process.stdout.write('emitted Math module parsed and executed');`,
    pathToFileURL(referenceFile).href], {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(validation.error, undefined);assert.equal(validation.signal, null);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(validation.stdout, 'emitted Math module parsed and executed');
  // On macOS tmpdir may use /var while its actual path starts /private/var.
  // Bun's module resolver needs the real path for a new file in this already
  // loaded directory. Keep file resolution, including normal import bases.
  reference = await import(pathToFileURL(await realpath(referenceFile)).href);
  assert.equal(JSON.stringify(program), saved);
}, 120000);
afterAll(async () => {lowered = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

function bits(value) {if (Number.isNaN(value)) return 'NaN';const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);return view.getBigUint64(0, false).toString(16).padStart(16, '0');}
function exact(actual, expected, label) {assert.equal(bits(actual), bits(expected), label);}
function hex(value) {
  const match = /^(-?)0x([0-9a-f]+)(?:[.]([0-9a-f]+))?p([+-]?[0-9]+)$/.exec(value);assert(match);
  const fraction = match[3] ?? '', significand = BigInt('0x' + match[2] + fraction);
  return (match[1] ? -1 : 1) * Number(significand) * 2 ** (Number(match[4]) - 4 * fraction.length);
}
// FDLIBM golden binary64 pairs, independently published by OpenJDK StrictMath
// TrigTests, Expm1Tests, ExpTests, Log1pTests, Log10Tests and HyperbolicTests.
// These are algorithm identities, not an assertion that a host's
// implementation-approximated Math has the same tail.
// https://github.com/openjdk/jdk/tree/master/test/jdk/java/lang/StrictMath
const golden = [
  ['sin', '0x1.00000006eeeefp-12', '0x1.ffffffb888889p-13'],
  ['sin', '0x1.0000000000174p50', '-0x1.54cd5e7e9e3d2p-1'],
  ['sin', '0x1.00000000001afp1023', '0x1.d1c804ef2eeccp-1'],
  ['cos', '0x1.0000000000174p0', '0x1.14a280fb50419p-1'],
  ['cos', '0x1.00000000000b8p95', '0x1.8315138968a66p-1'],
  ['cos', '0x1.000000000015fp1023', '-0x1.2f2596c42735cp-1'],
  ['tan', '0x1.00000002221fep-13', '0x1.0000001777753p-13'],
  ['tan', '0x1.0000000000013p500', '-0x1.c4e46751be12cp-1'],
  ['tan', '0x1.00000000000ep1023', '-0x1.d52c4ec04f108p-2'],
  ['expm1', '-0x1.580000008c619p3', '-0x1.fffd3069586f6p-1'],
  ['expm1', '0x1.ffffffdccfeb7p-3', '0x1.22d78ef909144p-2'],
  ['exp', '0x1.2e8f20cf3cbe7p8', '0x1.6a2a59cc78bf8p436'],
  ['exp', '-0x1.49f33ad2c1c58p9', '0x1.f3ccc815431b6p-953'],
  ['log1p', '0x1.fffffffffffffp-2', '0x1.9f323ecbf984bp-2'],
  ['log1p', '0x1.ffffffffffffdp-1', '0x1.62e42fefa39eep-1'],
  ['log10', '0x1.3fffffffffec1p-297', '-0x1.653c6a27ae2f8p6'],
  ['log10', '0x1.4p-297', '-0x1.653c6a27ae2f7p6'],
  ['sinh', '0x1.9fcba01feb507p-2', '0x1.ab50d8e4d8c56p-2'],
  ['sinh', '-0x1.633c654fee2bap9', '-0x1.fdf25fc26e7cp1023'],
  ['cosh', '0x1.0p0', '0x1.8b07551d9f551p0'],
  ['cosh', '-0x1.633c654fee2bap9', '0x1.fdf25fc26e7cp1023'],
  ['tanh', '0x1.0108b83c4bbc8p-1', '0x1.dad53a45da5b0p-2'],
  ['tanh', '-0x1.c41e527b70f43p-3', '-0x1.bcea047cc736cp-3'],
  ['asinh', '0x1.ffffffffffffep-26', '0x1.ffffffffffffdp-26'],
  ['acosh', '0x1.0001ff6afc4bap0', '0x1.ffb5238940116p-8'],
  ['atanh', '0x1.ffffffffffffep-26', '0x1p-25'],
];
function fixedCases() {
  const cases = [], add = (name, args, expected) => cases.push([name, args, expected]);
  for (const name of ['asin', 'asinh', 'atan', 'atanh', 'cbrt', 'expm1', 'log1p', 'sin', 'sinh', 'tan', 'tanh'])
    for (const value of [0, -0]) add(name, [value], value);
  for (const name of names.filter(name => !['random', 'hypot', 'atan2', 'pow'].includes(name))) add(name, [NaN], NaN);
  for (const name of ['cos', 'sin', 'tan', 'acos', 'asin', 'atanh'])
    for (const value of [Infinity, -Infinity]) add(name, [value], NaN);
  for (const [name, args, expected] of [
    ['acos', [1], 0], ['acos', [-1], Math.PI], ['acos', [0], Math.PI / 2], ['acosh', [1], 0],
    ['acosh', [0], NaN], ['acosh', [Infinity], Infinity], ['asin', [1], Math.PI / 2],
    ['asin', [-1], -Math.PI / 2], ['atan', [Infinity], Math.PI / 2], ['atan', [-Infinity], -Math.PI / 2],
    ['asinh', [Infinity], Infinity], ['asinh', [-Infinity], -Infinity],
    ['atanh', [1], Infinity], ['atanh', [-1], -Infinity], ['atanh', [2], NaN],
    ['cbrt', [8], 2], ['cbrt', [-8], -2], ['cbrt', [Infinity], Infinity], ['cbrt', [-Infinity], -Infinity],
    ['cbrt', [Number.MIN_VALUE], 2 ** -358], ['expm1', [Infinity], Infinity], ['expm1', [-Infinity], -1],
    ['cos', [0], 1], ['cos', [-0], 1], ['cosh', [0], 1], ['cosh', [-0], 1],
    ['cosh', [Infinity], Infinity], ['cosh', [-Infinity], Infinity],
    ['exp', [0], 1], ['exp', [-0], 1], ['exp', [Infinity], Infinity], ['exp', [-Infinity], 0],
    ['sinh', [Infinity], Infinity], ['sinh', [-Infinity], -Infinity], ['tanh', [Infinity], 1], ['tanh', [-Infinity], -1],
  ]) add(name, args, expected);
  for (const name of ['asinh', 'atan', 'atanh', 'expm1', 'log1p', 'sin', 'sinh', 'tan', 'tanh'])
    for (const value of [Number.MIN_VALUE, -Number.MIN_VALUE]) add(name, [value], value);
  for (const name of ['log', 'log2', 'log10']) for (const [input, output] of [[1, 0], [0, -Infinity],
    [-0, -Infinity], [-1, NaN], [Infinity, Infinity]]) add(name, [input], output);
  add('log1p', [-1], -Infinity);add('log1p', [-2], NaN);add('log1p', [Infinity], Infinity);
  for (const power of [-1074, -1022, -500, -1, 0, 1, 53, 500, 1023]) add('log2', [2 ** power], power);
  for (const exponent of [0, -0, 1, -1, 2, 3, .5, -.5, 9007199254740991, 9007199254740992,
    Infinity, -Infinity, NaN]) for (const base of [-Infinity, -2, -1, -0, 0, .5, 1, 2, Infinity, NaN])
    add('pow', [base, exponent], Math.pow(base, exponent));
  for (const y of [-Infinity, -1, -0, 0, 1, Infinity, NaN])
    for (const x of [-Infinity, -1, -0, 0, 1, Infinity, NaN]) add('atan2', [y, x], Math.atan2(y, x));
  for (const args of [[], [-0], [0, -0], [3, 4], [3, 4, 12], [NaN, Infinity], [Infinity, NaN],
    [Number.MIN_VALUE, 0], [3 * 2 ** 500, 4 * 2 ** 500], [3 * 2 ** -500, 4 * 2 ** -500],
    [2 ** 26, 1, 1, 1, 1], [1, 1, 1, 1, 2 ** 26], [Number.MAX_VALUE, 0],
    [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE]])
    add('hypot', args, Math.hypot(...args));
  return cases;
}
function box(a, values) {
  const handles = values.map(value => value === undefined ? undefined : a.number(value));
  try {return a.sourceArray(handles);} finally {for (const handle of handles) a.release(handle);}
}
function invoke(a, name, values = []) {
  const owned = [], args = values.map(value => {
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const handle = typeof value === 'string' ? a.string(value) : a.number(value);owned.push(handle);return handle;
  });
  try {return a.invoke(name, args);} finally {for (const value of owned) a.release(value);}
}
function number(a, name, values = []) {
  const value = invoke(a, name, values);try {return a.readNumber(value);} finally {a.release(value);}
}
function text(a, name, values = []) {
  const value = invoke(a, name, values);try {return a.readString(value);} finally {a.release(value);}
}
async function instance(kind, extra = {}) {
  return kind === 'wasm' ? instantiateManagedRuntime(bytes, {...options, ...extra})
    : instantiateNativeManagedRuntime(nativeFile, lowered, {...options, ...extra, nativeTarget: target});
}
function finish(a) {try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);} finally {a.close?.();}}
async function each(run) {
  for (const kind of target ? ['wasm', 'native'] : ['wasm']) {
    const a = await instance(kind);a.auto(1);try {await run(a, kind);} finally {finish(a);}
  }
}
function checkNumbers(a, records, goldens) {
  for (const [name, inputs, expected] of records) {
    const values = box(a, inputs);
    try {exact(number(a, 'route', [name, 2, values]), expected, name + '/' + inputs.map(bits).join(','));}
    catch(error){if(error&&typeof error==='object')error.mathCase={name,inputs:inputs.map(bits),stage:'fixed'};throw error;}
    finally {a.release(values);}
  }
  for (const [name, input, output] of goldens) {
    const values = box(a, [hex(input)]);
    try {exact(number(a, 'route', [name, 2, values]), hex(output), name + '/fixed ' + input);}
    catch(error){if(error&&typeof error==='object')error.mathCase={name,input,stage:'golden'};throw error;}
    finally {a.release(values);}
  }
  a.collect();assert.equal(a.stats().frameDepth, 0);
}
function checkRoutes(a, js) {
  // Qualified direct entry executes before any ordinary namespace lookup in
  // this fresh instance; all family members retain that cold call route.
  for (const name of names) {
    let actual;try{actual=number(a, 'direct', [name, 0, 1, 0]);}
    catch(error){if(error&&typeof error==='object')error.mathCase={name,stage:'cold-direct'};throw error;}
    if (name === 'random') assert(actual >= 0 && actual < 1);
    else exact(actual, js.direct(name, 0, 1, 0), name + '/cold direct');
  }
  for (const name of names) {
    const args = name === 'hypot' ? [3, 4, 12] : ['pow', 'atan2'].includes(name) ? [0, 1] : [0];
    const values = box(a, args), method = invoke(a, 'method', [name]);
    try {
      assert.equal(text(a, 'describe', [name]), js.describe(name));
      const description = JSON.parse(js.describe(name));
      assert.deepEqual(description.slice(2, 5), [true, false, true]);
      assert.equal(description[5], name);assert.equal(description[6], name === 'random' ? 0 : ['hypot', 'pow', 'atan2'].includes(name) ? 2 : 1);
      assert.equal(description[7], false);assert.equal(description[14], 'TypeError');
      for (let mode = 0; mode < 10; mode++) {
        const actual = number(a, 'route', [name, mode, values]);
        if (name === 'random') assert(actual >= 0 && actual < 1);
        else exact(actual, js.route(name, mode, args), name + '/route ' + mode);
      }
      const held = number(a, 'held', [method, values]);
      if (name === 'random') assert(held >= 0 && held < 1);else exact(held, Math[name](...args), name + '/held');
      assert.equal(text(a, 'mutation-report', [name]), js.mutation_report(name));
      assert.equal(text(a, 'method-mutation', [name]), js.method_mutation(name));
      for (let mode = 0; mode < 11; mode++) assert.equal(text(a, 'conversion-report', [name, mode]), js.conversion_report(name, mode));
      for (const omitted of [[], [undefined], [undefined, undefined]]) {
        const missing = box(a, omitted);
        try {const actual = number(a, 'held', [method, missing]);
          if (name === 'random') assert(actual >= 0 && actual < 1);else exact(actual, Math[name](...omitted), name + '/missing');}
        finally {a.release(missing);}
      }
    } finally {a.release(values);a.release(method);}
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
}
function sequence(a, count = 48) {
  const result = invoke(a, 'random-values', [count]);
  try {const values = [];for (let index = 0; index < a.length(result); index++) {
    const value = a.get(result, index);try {const number = a.readNumber(value);assert(number >= 0 && number < 1);values.push(number);} finally {a.release(value);}
  }assert.equal(values.length, count);assert.equal(new Set(values.map(bits)).size, count);return values;} finally {a.release(result);}
}
function crossBackendBits(a) {
  let state = 0x761cb4a9;const next = () => {state ^= state << 13;state ^= state >>> 17;state ^= state << 5;return state >>> 0;};
  const view = new DataView(new ArrayBuffer(8)), inputs = [Number.MAX_VALUE, -Number.MAX_VALUE,
    2 ** -1022, -(2 ** -1022), Number.MIN_VALUE, -Number.MIN_VALUE, -0, 0];
  for (let index = 0; index < 32; index++) {view.setUint32(0, next());view.setUint32(4, next());inputs.push(view.getFloat64(0));}
  const output = [];
  for (const name of names.filter(name => name !== 'random')) for (let index = 0; index < inputs.length; index++) {
    const args = ['atan2', 'pow', 'hypot'].includes(name) ? [inputs[index], inputs[(index + 7) % inputs.length]] : [inputs[index]];
    const values = box(a, args);
    try {output.push(bits(number(a, 'route', [name, 2, values])));} finally {a.release(values);}
  }
  return output;
}
function checkScratchLifetime(a, js) {
  assert.equal(text(a, 'reentrant-power'), js.reentrant_power());
  assert.deepEqual(JSON.parse(text(a, 'reentrant-power')), [8, ['base', 0, 'exponent', 1, true]]);
  exact(number(a, 'scalar-call'), 8, 'warm scalar kernel');a.collect();
  const before = a.stats(), count = 64;a.auto(1);
  try {
    for (let index = 0; index < count; index++) exact(number(a, 'scalar-call'), 8, 'scalar kernel without automatic collection');
    const after = a.stats();
    assert.equal(after.frameDepth, before.frameDepth);
    // Ordinary frames and scalar results need collection in this 1024-slot
    // heap even though each returned scalar is immediately released. The
    // retained warm workspace must not accumulate with those calls.
    assert(after.usedBytes - before.usedBytes <= count * 1024,
      '64 released scalar results must not retain a workspace per call');
    a.collect();assert.equal(a.stats().usedBytes,before.usedBytes,
      'collection after 64 calls retains exactly the original warm state');
  } finally {a.auto(1);a.collect();}
  exact(number(a, 'scalar-call'), 8, 'after explicit collection');
}

test('Given all transcendental Math families When IEEE domains powers subnormals and fixed mature range-reduction vectors execute Then exact binary64 results survive GC', async () => {
  let referenceBits;
  await each(a => {checkNumbers(a, fixedCases(), golden);const actual = crossBackendBits(a);
    if (referenceBits) assert.deepEqual(actual, referenceBits, 'all implementation-approximated kernels remain bit-identical across real WASM and native');
    else referenceBits = actual;});
}, 30000);
test('Given cold held borrowed bound callback and Reflect Math routes When coerced overridden reflected or constructed Then every original call boundary is preserved', async () => {
  await each(a => checkRoutes(a, reference));
}, 30000);
test('Given falsy source conversion errors and a full default heap When calls fail Then caller roots first errors and later exact calls recover', async () => {
  await each(a => {
    checkScratchLifetime(a, reference);
    const zero = a.number(-0), frame = a.frame(1), fillers = [];a.frameSet(frame, 0, zero);
    try {
      for (const name of names.filter(name => name !== 'random')) for (const thrown of [false, undefined]) {
        let caught = false;try {invoke(a, 'abrupt', [name, thrown]);} catch (error) {caught = true;assert.strictEqual(error, thrown);}
        assert(caught);assert.equal(a.stats().frameDepth, 1);exact(a.readNumber(zero), -0, 'original caller value');
      }
      let failed = false;
      try {for (let index = 0; index < 2048; index++) fillers.push(a.string('temporary ' + index));}
      catch (error) {failed = true;assert.equal(error.eliscriptDiagnostic?.code, 'ELI-RT0002');}
      assert(failed, 'the unchanged default 1024-slot hard limit must reject retained allocations');
      for (const handle of fillers) a.release(handle);fillers.length = 0;a.collect();
      const values = box(a, [0]);try {exact(number(a, 'route', ['exp', 2, values]), 1, 'after capacity recovery');} finally {a.release(values);}
      exact(a.readNumber(zero), -0, 'after capacity recovery');assert.equal(a.stats().frameDepth, 1);
    } finally {for (const handle of fillers) a.release(handle);a.leaveFrame(frame);a.release(zero);}
  });
}, 30000);
test('Given reproducible random seeds When independent WASM and native heaps generate sequences Then exact replay coexists with ordinary fresh-instance randomness', async () => {
  const seed = [0x12345678, 0x9abcdef0, 0x10203040, 0x55667788], sequences = [];
  for (const kind of target ? ['wasm', 'native'] : ['wasm']) {
    const first = await instance(kind, {randomSeed: seed.slice()}), second = await instance(kind, {randomSeed: seed.slice()});
    first.auto(1);second.auto(1);
    try {const a = sequence(first), b = sequence(second);assert.deepEqual(a.map(bits), b.map(bits));sequences.push(a.map(bits));}
    finally {finish(first);finish(second);}
    const source = seed.slice(), pending = instance(kind, {randomSeed: source});source.fill(0);
    const snapshot = await pending;
    snapshot.auto(1);try {assert.deepEqual(sequence(snapshot).map(bits), sequences.at(-1));} finally {finish(snapshot);}
    const typedSeed = new Uint32Array(seed), typedPending = instance(kind, {randomSeed: typedSeed});typedSeed.fill(0);
    const typedSnapshot = await typedPending;
    typedSnapshot.auto(1);try {assert.deepEqual(sequence(typedSnapshot).map(bits), sequences.at(-1));} finally {finish(typedSnapshot);}
  }
  for (const value of sequences.slice(1)) assert.deepEqual(value, sequences[0]);
  const first = await instance('wasm'), second = await instance('wasm');
  first.auto(1);second.auto(1);
  try {assert.notDeepEqual(sequence(first).map(bits), sequence(second).map(bits));} finally {finish(first);finish(second);}
  for (const randomSeed of [null, [], [1], [1, 2, 3, 4, 5], [0, 0, 0, 0], [1, 2, 3, -1],
    [1, 2, 3, 2 ** 32], [1, 2, 3, .5], [1, 2, 3, NaN], [1, 2, 3, Infinity], new Uint32Array(3), new Uint32Array(4)])
    assert.throws(() => instantiateManagedRuntime(bytes, {...options, randomSeed}), error => error.eliscriptDiagnostic?.code === 'ELI-RT0003');
}, 30000);
test('Given the same permanent Math fixture When independent Node executes real JS and WASM Then exact stable native oracles callbacks and fixed kernel vectors agree', () => {
  const script = `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const{options,names,golden}=JSON.parse(readFileSync(0,'utf8'));
const js=await import(process.argv[1]);const{instantiateManagedRuntime}=await import(process.argv[2]);
const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
${bits.toString()}
${exact.toString()}
${hex.toString()}
${fixedCases.toString()}
${box.toString()}
${invoke.toString()}
${number.toString()}
${text.toString()}
${finish.toString()}
${checkNumbers.toString()}
${checkRoutes.toString()}
${sequence.toString()}
${checkScratchLifetime.toString()}
const a=instantiateManagedRuntime(bytes,options);a.auto(1);
try{checkNumbers(a,fixedCases(),golden);checkRoutes(a,js);sequence(a);checkScratchLifetime(a,js);}finally{finish(a);}
process.stdout.write('complete Math source and fixed binary64 vectors preserved');`;
  const child = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval', script,
    pathToFileURL(referenceFile).href, new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href, wasmFile],
  {encoding: 'utf8', input: JSON.stringify({options, names, golden}), timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'complete Math source and fixed binary64 vectors preserved');
}, 30000);
