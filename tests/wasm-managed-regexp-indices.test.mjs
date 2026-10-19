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

const fixture = 'tests/fixtures/wasm-managed-regexp-indices.eli';
const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const options = {maxSlots: 2048, initialBytes: 65536, maxBytes: 1048576, maximumPages: 32};
const cases = [
  ['(a)(b)?', 'd', 'za'], ['(a)(b)?', '', 'za'], ['()', 'd', '😀'],
  ['((a)|(b))+', 'd', 'zab'], ['((a)?b){2}', 'd', 'abb'],
  ['(?=(a+))a', 'd', 'zaaa'], ['(?!b)(a)', 'd', 'za'],
  ['(?<=(a))b', 'd', 'zab'], ['(?<!b)(a)', 'd', 'za'],
  ['(?<head>a)(?<tail>b)?', 'd', 'za'], ['(?<x>a)|(?<x>b)', 'd', 'b'],
  ['(?<__proto__>a)(?<constructor>b)?', 'd', 'a'],
  ['(😀)(.)?', 'du', 'x😀\ud800'], ['(.)', 'd', '😀'], ['(.)', 'du', '😀'],
  ['(\ud800)', 'du', 'x\ud800'], ['(a)?', 'd', ''], ['a', 'd', 'no match'],
];
let directory, backend, lowered, bytes, wasmFile, library, reference, referenceFile;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-regexp-indices-'));
  backend = await buildBackends({outputRoot: directory});
  const source = await readFile(fixture, 'utf8');
  const program = backend.compiler.compile_ir_string(source, fixture);
  const saved = JSON.stringify(program);
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime, true);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  wasmFile = resolve(directory, 'indices.wasm');await writeFile(wasmFile, bytes);
  if (target) {
    library = resolve(directory, target === 'arm64-linux' ? 'indices.so' : 'indices.dylib');
    await writeFile(library, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, target)));
  }
  referenceFile = resolve(directory, 'indices.mjs');await writeFile(referenceFile, backend.compiler.emit_ir_string(program));
  referenceFile = await realpath(referenceFile);
  reference = await import(pathToFileURL(referenceFile).href);
  assert.equal(JSON.stringify(program), saved);
}, 120000);
afterAll(async () => {lowered = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

function call(a, name, values = []) {
  const owned = [], args = values.map(value => {
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const boxed = typeof value === 'string' ? a.string(value) : a.number(value);owned.push(boxed);return boxed;
  });
  try {return a.invoke(name, args);} finally {for (const value of owned) a.release(value);}
}
function textCall(a, name, values = []) {
  const value = call(a, name, values);try {return a.readString(value);} finally {a.release(value);}
}
function discard(a, name, values = []) {a.release(call(a, name, values));}
function finish(a) {
  try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  finally {a.close?.();}
}
async function each(run, configuration = options) {
  for (const kind of target ? ['wasm', 'native'] : ['wasm']) {
    const a = kind === 'wasm' ? instantiateManagedRuntime(bytes, configuration)
      : await instantiateNativeManagedRuntime(library, lowered, {...configuration, nativeTarget: target});
    a.auto(1);try {await run(a, kind);} finally {finish(a);}
  }
}
function matching(a, js, records) {
  for (const [pattern, flags, input] of records) {
    const regex = call(a, 'make', [pattern, flags]);let result;
    try {
      result = call(a, 'exec', [regex, input]);
      const original = js.exec(js.make(pattern, flags), input), expected = js.report(original);
      assert.equal(textCall(a, 'report', [result]), expected, JSON.stringify([pattern, flags, input]));
      if (original?.indices) {
        assert(Object.hasOwn(original, 'indices'));assert.equal(Object.getPrototypeOf(original.indices), Array.prototype);
        for (let index = 0; index < original.length; index++) assert(Object.hasOwn(original.indices, index));
        if (original.indices.groups) assert.strictEqual(Object.getPrototypeOf(original.indices.groups), null);
      } else if (original) assert.equal(Object.hasOwn(original, 'indices'), false);
    } finally {a.release(result);a.release(regex);a.collect();assert.equal(a.stats().frameDepth, 0);}
  }
}
function flagsAndAccessor(a, js) {
  const literal = call(a, 'literal'), original = js.literal(), plain = call(a, 'plain');
  let clone;
  try {
    assert.equal(textCall(a, 'meta', [literal]), js.meta(original));
    assert.equal(call(a, 'accessor', [literal]), true);assert.equal(call(a, 'accessor', [plain]), false);
    discard(a, 'last', [literal, 7]);js.last(original, 7);
    clone = call(a, 'clone', [literal, undefined]);const expectedClone = js.clone(original, undefined);
    assert.equal(a.keyEqual(literal, clone), false);assert.equal(textCall(a, 'meta', [clone]), js.meta(expectedClone));
    for (const flags of ['dygimu', '', 'd']) {
      const changed = call(a, 'clone', [literal, flags]);
      try {assert.equal(textCall(a, 'meta', [changed]), js.meta(js.clone(original, flags)));} finally {a.release(changed);}
    }
    discard(a, 'clear');js.clear();
    assert.equal(textCall(a, 'accessor-report', [literal]), js.accessor_report(original));
    assert.equal(textCall(a, 'trace'), '[]');assert.equal(js.trace(), '[]');
    for (const invalid of [null, false, undefined]) assert.throws(() => call(a, 'accessor', [invalid]), TypeError);
    for (const flags of ['dd', 'dvx']) assert.throws(() => call(a, 'make', ['a', flags]), SyntaxError);
  } finally {a.release(literal);a.release(plain);a.release(clone);}
}
function stateful(a, js) {
  for (const flags of ['dg', 'dy', 'dgy']) {
    const pattern = '(a)?', regex = call(a, 'make', [pattern, flags]), oracle = js.make(pattern, flags);
    try {
      for (const start of [-0, 1, 2, 4]) {
        discard(a, 'last', [regex, start]);js.last(oracle, start);
        for (let count = 0; count < 2; count++) {
          const result = call(a, 'exec', [regex, 'ba']);
          try {assert.equal(textCall(a, 'report', [result]), js.report(js.exec(oracle, 'ba')));} finally {a.release(result);}
          assert.equal(textCall(a, 'meta', [regex]), js.meta(oracle));
        }
      }
    } finally {a.release(regex);}
  }
  for (const [pattern, flags, input] of [['(?<x>a)?', 'dg', 'a'], ['(.)', 'dgu', '😀a'], ['(a)', 'dg', 'aa']]) {
    const regex = call(a, 'make', [pattern, flags]), oracle = js.make(pattern, flags);
    try {
      assert.equal(textCall(a, 'all', [regex, input]), js.all(oracle, input));
      assert.equal(textCall(a, 'all', [regex, input]), js.all(oracle, input));
      assert.equal(textCall(a, 'meta', [regex]), js.meta(oracle), 'matchAll owns an independent lastIndex');
    } finally {a.release(regex);}
  }
  const regex = call(a, 'make', ['(a)', 'dg']), oracle = js.make('(a)', 'dg');
  try {assert.equal(textCall(a, 'independent', [regex, 'aa']), js.independent(oracle, 'aa'));}
  finally {a.release(regex);}
}
function retention(a, js) {
  const regex = call(a, 'make', ['(?<head>a)(b)?', 'd']), oracle = js.make('(?<head>a)(b)?', 'd');
  const first = call(a, 'exec', [regex, 'a']), expectedFirst = js.exec(oracle, 'a');
  const frame = a.frame(2);a.frameSet(frame, 0, regex);a.frameSet(frame, 1, first);
  let second;
  try {
    const saved = textCall(a, 'report', [first]);a.collect();
    second = call(a, 'exec', [regex, 'ab']);const expectedSecond = js.exec(oracle, 'ab');
    assert.equal(textCall(a, 'report', [first]), saved);assert.equal(a.keyEqual(first, second), false);
    const changed = call(a, 'change', [first, 17]);a.release(changed);js.change(expectedFirst, 17);
    a.collect();assert.equal(textCall(a, 'report', [first]), js.report(expectedFirst));
    assert.equal(textCall(a, 'report', [second]), js.report(expectedSecond), 'later captures do not share mutable index pairs');
    assert.equal(a.stats().frameDepth, 1);
  } finally {a.leaveFrame(frame);a.release(first);a.release(second);a.release(regex);}
}
function failureRecovery(a, js) {
  const regex = call(a, 'make', ['(a)', 'dg']), oracle = js.make('(a)', 'dg'), zero = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, zero);
  try {
    discard(a, 'last', [regex, 1]);js.last(oracle, 1);discard(a, 'clear');js.clear();
    assert.throws(() => call(a, 'throwing', [regex]), error => error === false);
    assert.throws(() => js.throwing(oracle), error => error === false);
    assert.equal(textCall(a, 'trace'), js.trace());assert.equal(textCall(a, 'meta', [regex]), js.meta(oracle));
    assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
    assert.equal(textCall(a, 'recover'), js.recover());
  } finally {a.leaveFrame(frame);a.release(zero);a.release(regex);}
}

test('d literals dynamic constructors flags clones and hasIndices accessors preserve native descriptors and first errors', async () => {
  await each(a => flagsAndAccessor(a, reference));
}, 30000);
test('exec indices preserve exact captures own undefined UTF16 offsets named aliases descriptors and property order in WASM and native', async () => {
  await each(a => matching(a, reference, cases));
}, 30000);
test('global sticky and matchAll indices own independent result pairs and preserve lastIndex across calls and instances', async () => {
  await each(a => stateful(a, reference));await each(a => stateful(a, reference));
}, 30000);
test('retained index pairs and named aliases survive collecting GC while later input and result mutations stay isolated', async () => {
  await each(a => retention(a, reference));
}, 30000);
test('exec defines all result and index properties without invoking inherited setters or obeying inherited readonly blockers', async () => {
  await each(a => {
    for (let mode = 0; mode < 4; mode++) {
      const expected = reference.poisoned(mode), actual = textCall(a, 'poisoned', [mode]);
      assert.equal(actual, expected);assert.equal(JSON.parse(actual)[0], 0);
      const report = JSON.parse(JSON.parse(actual)[1]);
      assert.deepEqual(report[5], [true, true, true, true]);
      for (const pair of report[7]) assert.deepEqual(pair[3], [true, true, true, true]);
      for (const group of report[10]) assert.deepEqual(group[5], [true, true, true, true]);
      a.collect();assert.equal(a.stats().frameDepth, 0);
    }
  });
}, 30000);
test('indices allocation capacity and input-conversion throws preserve caller roots and permit later execution', async () => {
  await each(a => failureRecovery(a, reference));
  const rejectedOptions = {maxSlots: 128, initialBytes: 4096, maxBytes: 16384, maximumPages: 32};
  // The complete cold reflection/JSON report cannot fit this 128-slot heap:
  // Object's twenty statics and seven prototype functions alone retain at
  // least 135 values (callable, info, property bag, table and name per function).
  // this rejection must also occur without any prior failed matching request.
  // each() still requires close/collect to leave zero live values and frames.
  await each(a => {
    assert.throws(() => textCall(a, 'recover'), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.equal(a.stats().frameDepth, 0);a.collect();
  }, rejectedOptions);
  await each(a => {
    const baseline = a.stats();let input = a.string('a'.repeat(4096) + 'b');
    const zero = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, zero);
    try {
      assert.throws(() => a.invoke('capacity', [input]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
      assert.equal(a.readString(input), 'a'.repeat(4096) + 'b');
      assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
      a.release(input);input = undefined;a.collect();
      assert.equal(a.stats().usedBytes, baseline.usedBytes);
      assert.equal(a.stats().liveValues, baseline.liveValues);
      assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
    } finally {a.leaveFrame(frame);a.release(zero);a.release(input);}
  }, rejectedOptions);
  // Reuse the existing successful full-report configuration. Keep a private
  // padding string alive only during matching so this is still a capacity
  // failure, rather than asking the full reflection/JSON result to fit 128 slots.
  // Lower bound: slot directory 49176 + padding 901152 + input 8232 +
  // matching stack 98336 = 1056896 bytes > maxBytes 1048576. The greedy
  // repeat leaves at least 4096 choices, each with >=4 capture registers plus
  // pc/position (24 bytes); heap-object adds its aligned 32-byte header.
  const capacityOptions = options;
  await each(async (a, kind) => {
    const baseline = a.stats(), stages = [{stage: 'initialized', ...baseline}];
    let input, padding;const zero = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, zero);
    try {
      padding = a.string('\0'.repeat(450560));
      input = a.string('a'.repeat(4096) + 'b');
      assert.throws(() => a.invoke('capacity', [input]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
      stages.push({stage: 'capacity-rejected', ...a.stats()});
      assert.equal(a.stats().frameDepth, 1);assert.equal(a.readString(input), 'a'.repeat(4096) + 'b');
      assert(Object.is(a.readNumber(zero), -0));
      a.release(input);input = undefined;a.release(padding);padding = undefined;
      a.collect();stages.push({stage: 'released-and-collected', ...a.stats()});
      assert.equal(textCall(a, 'recover'), reference.recover());
      assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
    } catch(error) {
      // Keep the original failed assertion/error. A bounded same-input fresh
      // control distinguishes a capacity requirement of report() itself from
      // objects incorrectly retained by the rejected matching request.
      stages.push({stage: 'recovery-failed', ...a.stats(), code: error?.eliscriptDiagnostic?.code});
      let fresh;
      try {
        fresh = kind === 'wasm' ? instantiateManagedRuntime(bytes, capacityOptions)
          : await instantiateNativeManagedRuntime(library, lowered, {...capacityOptions, nativeTarget: target});
        fresh.auto(1);stages.push({stage: 'fresh-initialized', ...fresh.stats()});
        assert.equal(textCall(fresh, 'recover'), reference.recover());
        stages.push({stage: 'fresh-recovered', ...fresh.stats()});
      } catch(controlError) {
        stages.push({stage: 'fresh-recovery-failed', ...(fresh?.stats() ?? {}),
          code: controlError?.eliscriptDiagnostic?.code, name: controlError?.name});
      } finally {
        if(fresh)try{finish(fresh);}catch(cleanupError){stages.push({stage:'fresh-cleanup-failed',code:cleanupError?.eliscriptDiagnostic?.code});}
      }
      console.error('[indices-capacity-recovery]', JSON.stringify({kind, options: capacityOptions, stages}));
      throw error;
    } finally {a.leaveFrame(frame);a.release(zero);a.release(input);a.release(padding);}
  }, capacityOptions);
  await each(a => {
    assert.equal(textCall(a, 'recover'), reference.recover(), 'the same full report succeeds in the existing full-report configuration');
    assert.equal(a.stats().frameDepth, 0);
  }, capacityOptions);
}, 30000);
test('independent Node executes the same generated JS and actual zero-import WASM index capture and lifecycle contracts', () => {
  const script = `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const {cases,options}=JSON.parse(readFileSync(0,'utf8'));
const js=await import(process.argv[1]);const{instantiateManagedRuntime}=await import(process.argv[2]);
const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
${call.toString()}
${textCall.toString()}
${discard.toString()}
${finish.toString()}
${matching.toString()}
${flagsAndAccessor.toString()}
${stateful.toString()}
${retention.toString()}
${failureRecovery.toString()}
const a=instantiateManagedRuntime(bytes,options);a.auto(1);
try{flagsAndAccessor(a,js);matching(a,js,cases);stateful(a,js);retention(a,js);failureRecovery(a,js);
for(let mode=0;mode<4;mode++){const actual=textCall(a,'poisoned',[mode]);assert.equal(actual,js.poisoned(mode));assert.equal(JSON.parse(actual)[0],0);}}
finally{finish(a);}
process.stdout.write(JSON.stringify({cases:cases.length,complete:true}));`;
  const child = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval', script,
    pathToFileURL(referenceFile).href, new URL('../tools/backends/managed-runtime.mjs', import.meta.url).href, wasmFile],
  {encoding: 'utf8', input: JSON.stringify({cases, options}), timeout: 30000, maxBuffer: 65536});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {cases: cases.length, complete: true});
}, 30000);
