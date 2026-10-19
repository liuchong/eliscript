import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const platform = process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform)
  ? process.platform === 'darwin' ? 'arm64-macos' : 'arm64-linux' : null;
const padding = 'description-source-\ud800-\udfff-'.repeat(256);
const source = `
 (defconst marker -0)
 (defun target (x) ${JSON.stringify(padding)})
 (defun reference () target)
 (defun closure (x) (lambda (step) (+ x step)))
 (defun call (f x) (funcall f x))
 (defun text (f) (js-call (get (js* "Function.prototype") :toString) :call f))
 (defun native-reference () (get (js* "Number") :isFinite))
 (defun mutate (f mode)
  (if mode
   (progn (Reflect/deleteProperty f "name") (Reflect/deleteProperty f "length"))
   (progn
    (Object/defineProperty f "name" (js-object :value "renamed" :writable false :enumerable false :configurable t))
    (Object/defineProperty f "length" (js-object :value 7 :writable false :enumerable false :configurable t))))
  f)
 (defun change-prototype (f value) (put f :prototype value) f)
 (defun prototype-value (f) (get f :prototype))
 (defun snapshot (f)
  (JSON/stringify (js-array (get f :name) (get f :length)
   (Object/hasOwn f "name") (Object/hasOwn f "length") (Object/hasOwn f "prototype")
   (Object/getOwnPropertyNames f))))
 (export reference closure call text native-reference mutate change-prototype prototype-value snapshot)`;
let directory, bytes, module, native, oracle;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-function-description-'));
  const b = await buildBackends({outputRoot: directory});
  const runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  const program = b.compiler.compile_ir_string(source, 'description.eli');
  const lowered = b.managed.lower_managed_program(program, runtime);
  // The raw state-query regression uses this same compiled runtime image.
  // These extra exports belong only to the fixture, not the production ABI.
  for (const name of ['heap-new', 'heap-pin', 'heap-release', 'heap-collect', 'heap-used', 'heap-live',
    'heap-auto', 'heap-collections', 'value-function-new', 'value-function-describe',
    'value-function-description-state', 'value-function-source-text', 'value-string', 'value-unit-set',
    'value-seal', 'value-number', 'frame-new', 'frame-set', 'frame-pop', 'frame-get', 'frame-depth', 'last-error'])
    if (!lowered.typed.exports.includes(name)) lowered.typed.exports.push(name);
  const output = b.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32});
  bytes = Uint8Array.from(b.wasm.append_metadata_section(output, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  module = new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module), []);
  // Bun's .mjs loader reprints string escapes in Function#toString. The
  // independent Node oracle loads these exact emitted bytes without rewriting
  // their source spelling; every source assertion below remains exact.
  const javascript = b.compiler.emit_ir_string(program);
  const referenceFile = resolve(await realpath(directory), 'description-reference.mjs');
  await writeFile(referenceFile, javascript);
  const script = `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    const m = await import(process.argv[1]), emitted = await readFile(new URL(process.argv[1]), 'utf8');
    const f = m.reference(), text = m.text(f), mutations = [];
    assert(emitted.includes(text), 'Node must preserve the original function source bytes');
    for (const mode of [false, true]) {
      assert.equal(m.mutate(f, mode), f);
      const repetitions = [];
      for (let repeat = 0; repeat < 4; repeat++) {
        const again = m.reference();assert.equal(again, f);
        const source = m.text(again);assert.equal(source, text);
        repetitions.push({snapshot: m.snapshot(again), text: source});
      }
      mutations.push(repetitions);
    }
    const prototype = {};assert.equal(m.change_prototype(f, prototype), f);
    const prototypeIdentity = m.prototype_value(m.reference()) === prototype;assert.equal(prototypeIdentity, true);
    const first = m.closure(1), second = m.closure(2);assert.notEqual(first, second);
    const closures = [first, second].map((closure, index) => {
      const value = m.call(closure, 4);assert.equal(value, index + 5);
      return {value, text: m.text(closure)};
    });
    const builtin = m.native_reference(), nativeText = m.text(builtin);
    const name = Object.getOwnPropertyDescriptor(builtin, 'name'), length = Object.getOwnPropertyDescriptor(builtin, 'length');
    let nativeSnapshot, nativeAfter;
    try {
      assert.equal(m.mutate(builtin, true), builtin);assert.equal(m.native_reference(), builtin);
      nativeSnapshot = m.snapshot(builtin);nativeAfter = m.text(m.native_reference());
      assert.equal(nativeAfter, nativeText);
    } finally {Object.defineProperty(builtin, 'name', name);Object.defineProperty(builtin, 'length', length);}
    process.stdout.write(JSON.stringify({text, mutations, prototypeIdentity, closures,
      native: {text: nativeText, snapshot: nativeSnapshot, after: nativeAfter}}));
  `;
  const child = spawnSync('node', ['--input-type=module', '-e', script, pathToFileURL(referenceFile).href],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024});
  assert.equal(child.error, undefined);assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr || child.stdout);oracle = JSON.parse(child.stdout);
  if (platform) {
    const path = resolve(directory, 'description.' + (platform === 'arm64-macos' ? 'dylib' : 'so'));
    await writeFile(path, decodeCompilerBinary(b.native.emit_typed_native_memory_library(lowered.typed, platform,
      {binaryEncoding: 'u16le-chunks'})));
    native = {path, descriptor: {typed: lowered.typed, descriptor: lowered.descriptor}};
  }
}, 120000);
afterAll(async () => {module = undefined;native = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

const options = {maxSlots: 256, initialBytes: 8192, maxBytes: 65536, maximumPages: 32, initializeModule: false};
async function open(nativeHost, extra = {}) {
  const a = nativeHost ? await instantiateNativeManagedRuntime(native.path, native.descriptor,
    {...options, ...extra, nativeTarget: platform}) : instantiateManagedRuntime(bytes, {...options, ...extra});
  a.auto(1);a.initializeModule();return a;
}
function finish(a, values) {
  for (const value of values) a.release(value);
  a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);a.close?.();
}
async function pressure(nativeHost) {
  const a = await open(nativeHost), f = a.invoke('reference'), held = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, held);a.collect();
  const room = 4096, count = Math.floor((options.maxBytes - a.stats().usedBytes - room - 32) / 8) * 8;
  assert(count > 0);
  const filler = a.bytes(new Uint8Array(count));
  try {
    const before = a.stats();assert(options.maxBytes - before.usedBytes <= room + 8);
    for (let index = 0; index < 128; index++) {
      const again = a.invoke('reference');
      assert(a.keyEqual(again, f));a.release(again);
      assert.equal(a.stats().frameDepth, 1);assert(Object.is(a.readNumber(held), -0));
    }
    assert.equal(a.stats().capacityBytes, options.maxBytes);
    assert.throws(() => a.string(padding.repeat(16)), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
    assert.equal(a.stats().frameDepth, 1);assert(Object.is(a.readNumber(held), -0));
    const recovered = a.invoke('reference');assert(a.keyEqual(recovered, f));a.release(recovered);
  } finally {a.leaveFrame(frame);finish(a, [filler, f, held]);}
}
test('WASM repeated described function references fit the original small heap with a live caller root and strict capacity recovery', () => pressure(false));
test.skipIf(!platform)('native repeated described function references retain identity under identical collecting capacity pressure', () => pressure(true));

async function reflection(nativeHost) {
  const a = await open(nativeHost, {maxSlots: 1024, initialBytes: 32768, maxBytes: 262144});
  const f = a.invoke('reference'), roots = [f];
  const text = a.invoke('text', [f]);roots.push(text);
  assert.equal(a.readString(text), oracle.text);
  for (const mode of [false, true]) {
    const changed = a.invoke('mutate', [f, mode]);a.release(changed);
    for (let repeat = 0; repeat < 4; repeat++) {
      const again = a.invoke('reference');assert(a.keyEqual(again, f));
      const expected = oracle.mutations[Number(mode)][repeat];
      const shape = a.invoke('snapshot', [again]);assert.equal(a.readString(shape), expected.snapshot);a.release(shape);
      const sourceText = a.invoke('text', [again]);assert.equal(a.readString(sourceText), expected.text);
      assert(a.keyEqual(sourceText, text));a.release(sourceText);a.release(again);a.collect();
    }
  }
  const prototype = a.sourceObject({});
  roots.push(prototype);const changed = a.invoke('change-prototype', [f, prototype]);a.release(changed);
  const again = a.invoke('reference');
  const actualPrototype = a.invoke('prototype-value', [again]);assert.equal(a.keyEqual(actualPrototype, prototype), oracle.prototypeIdentity);a.release(actualPrototype);a.release(again);
  const one = a.number(1), two = a.number(2), step = a.number(4);roots.push(one, two, step);
  const first = a.invoke('closure', [one]), second = a.invoke('closure', [two]);roots.push(first, second);
  assert(!a.keyEqual(first, second));
  for (const [closure, expected] of [[first, 5], [second, 6]]) {
    const result = a.invoke('call', [closure, step]);assert.equal(a.readNumber(result), expected);
    assert.equal(a.readNumber(result), oracle.closures[expected - 5].value);a.release(result);
    const original = a.invoke('text', [closure]);assert.equal(a.readString(original), oracle.closures[expected - 5].text);a.release(original);
  }
  // Native names use the existing lazy native-source flag, never a false
  // "source installed" marker. Public name deletion must survive rereads.
  const builtin = a.invoke('native-reference');roots.push(builtin);
  const nativeText = a.invoke('text', [builtin]);roots.push(nativeText);
  assert.equal(a.readString(nativeText), oracle.native.text);
  const mutated = a.invoke('mutate', [builtin, true]);a.release(mutated);
  const repeated = a.invoke('native-reference');assert(a.keyEqual(repeated, builtin));
  const names = a.invoke('snapshot', [repeated]);
  assert.equal(a.readString(names), oracle.native.snapshot);
  a.release(names);a.release(repeated);
  const after = a.invoke('text', [builtin]);assert.equal(a.readString(after), a.readString(nativeText));
  assert.equal(a.readString(after), oracle.native.after);a.release(after);
  finish(a, roots);
}
test('WASM description guards preserve name length prototype mutation exact source native metadata and closure isolation', () => reflection(false));
test.skipIf(!platform)('native description guards preserve the same public reflection source and independent captured functions', () => reflection(true));

test('validated description queries allocate nothing and distinguish completed info from failed or uninstalled source', () => {
  const exports = new WebAssembly.Instance(module).exports;
  const r = Object.fromEntries(Object.entries(exports).map(([name, value]) => [name.replaceAll('-', '_'),
    typeof value === 'function' ? (...args) => value(...args) >>> 0 : value]));
  const heap = r.heap_new(64, 8192, 65536), f = r.value_function_new(heap, 0, 0);assert(f > 3);r.heap_pin(heap, f);
  const query = mode => r.value_function_description_state(heap, f, mode);
  assert.equal(query(0), 0);assert.equal(query(1), 0);
  const string = text => {const value = r.value_string(heap, text.length);assert(value > 3);r.heap_pin(heap, value);
    for (let index = 0; index < text.length; index++) assert.equal(r.value_unit_set(heap, value, index, text.charCodeAt(index)), 1);
    assert.equal(r.value_seal(heap, value), value);return value;};
  const name = string('named');assert.equal(r.value_function_describe(heap, f, name, 1, 0, 0, 1), f);
  assert.equal(query(0), 1);assert.equal(query(1), 0);
  assert.equal(r.value_string(heap, 65536), 0);assert.equal(r.last_error(), 2);
  assert.equal(query(0), 1);assert.equal(query(1), 0, 'description success is not source success');
  const text = r.value_string(heap, 3);assert(text > 3);r.heap_pin(heap, text);
  assert.equal(r.value_function_source_text(heap, f, text), 0);assert.equal(r.last_error(), 6);
  assert.equal(query(1), 0);
  for (const [index, unit] of [0xd800, 65, 0xdfff].entries()) r.value_unit_set(heap, text, index, unit);
  r.value_seal(heap, text);assert.equal(r.value_function_source_text(heap, f, text), f);assert.equal(query(1), 1);
  r.heap_auto(heap, 1);
  const before = [r.heap_used(heap), r.heap_live(heap), r.heap_collections(heap), r.frame_depth(heap)];
  for (let index = 0; index < 1024; index++) {assert.equal(query(0), 1);assert.equal(query(1), 1);}
  assert.deepEqual([r.heap_used(heap), r.heap_live(heap), r.heap_collections(heap), r.frame_depth(heap)], before);
  assert.equal(query(2), 0);assert.equal(r.last_error(), 3);
  assert.equal(r.value_function_description_state(0, f, 0), 0);assert.equal(r.last_error(), 1);
  const wrong = r.value_number(heap, 0, 0x80000000);assert(wrong > 3);r.heap_pin(heap, wrong);
  assert.equal(r.value_function_description_state(heap, wrong, 0), 0);assert.equal(r.last_error(), 1);
  for (const value of [f, name, text, wrong]) r.heap_release(heap, value);
  r.heap_collect(heap);assert.equal(r.value_function_description_state(heap, f, 0), 0);assert.equal(r.last_error(), 1);
  assert.equal(r.frame_depth(heap), 0);assert.equal(r.heap_live(heap), 0);
});
