import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildBackends } from "../tools/backends/build.mjs";
import { instantiateManagedRuntime } from "../tools/backends/managed-runtime.mjs";

let directory, backends, runtime, program, javascript;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "eliscript-callables-"));
  backends = await buildBackends({ outputRoot: directory });
  runtime = backends.compiler.compile_ir_string(await readFile("bootstrap/runtime/memory.eli", "utf8"), "runtime.eli");
  program = backends.compiler.compile_ir_string(await readFile("tests/fixtures/wasm-managed-callables.eli", "utf8"), "callables.eli");
  javascript = await import("data:text/javascript;base64," + Buffer.from(backends.compiler.emit_ir_string(program)).toString("base64"));
}, 120_000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function instance() {
  const bytes = Uint8Array.from(backends.managed.emit_managed_wasm(program, runtime));
  assert(WebAssembly.validate(bytes));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const heap = instantiateManagedRuntime(bytes);
  heap.auto(1);
  return heap;
}
function number(heap, name, args = []) {
  const result = heap.invoke(name, args);
  try { return heap.readNumber(result); } finally { heap.release(result); }
}
function finish(heap, values) {
  for (const value of values) heap.release(value);
  heap.collect();
  assert.equal(heap.live(), 0);
  assert.equal(heap.stats().frameDepth, 0);
}

test("escaping, nested and recursive closures execute inside WASM with exact shared captures", () => {
  assert.equal(javascript.make_adder(4)(5), 9);
  assert.equal(javascript.nested(4)(5)(6), 15);
  assert.equal(javascript.recursive()(24), 24);
  const heap = instance(), four = heap.number(4), five = heap.number(5), six = heap.number(6), count = heap.number(24);
  const adder = heap.invoke("make-adder", [four]);
  heap.collect();
  assert.equal(number(heap, "apply-one", [adder, five]), javascript.make_adder(4)(5));
  const first = heap.invoke("nested", [four]), second = heap.invoke("apply-one", [first, five]);
  assert.equal(number(heap, "apply-one", [second, six]), javascript.nested(4)(5)(6));
  const recursive = heap.invoke("recursive");
  assert.equal(number(heap, "apply-one", [recursive, count]), javascript.recursive()(24));
  const written = heap.invoke("outer-write", [four]), shadow = heap.invoke("shadow", [four]);
  assert.equal(number(heap, "apply-zero", [written]), javascript.outer_write(4)());
  assert.equal(number(heap, "apply-zero", [shadow]), javascript.shadow(4)());
  finish(heap, [four, five, six, count, adder, first, second, recursive, written, shadow]);
});

test("sibling closures share mutable cells while loop bindings and function identities stay distinct", () => {
  const reference = javascript.make_pair(4);
  assert.equal(reference[0](), 5);
  assert.equal(reference[1](), 5);
  assert.deepEqual(javascript.capture_each(4).map(f => f()), [0, 1, 2, 3]);
  assert.equal(javascript.named_same(), true);
  assert.equal(javascript.fresh_same(), false);
  const heap = instance(), four = heap.number(4), pair = heap.invoke("make-pair", [four]);
  const increment = heap.get(pair, 0), current = heap.get(pair, 1);
  for (let i = 0; i < 32; i++) {
    assert.equal(number(heap, "apply-zero", [increment]), 5 + i);
    heap.collect();
    assert.equal(number(heap, "apply-zero", [current]), 5 + i);
  }
  const items = heap.invoke("capture-each", [four]);
  for (let i = 0; i < 4; i++) {
    const f = heap.get(items, i);
    try { assert.equal(number(heap, "apply-zero", [f]), i); } finally { heap.release(f); }
  }
  assert.equal(heap.invoke("named-same"), true);
  assert.equal(heap.invoke("fresh-same"), false);
  assert.equal(heap.invoke("repeated-same"), false);
  const freshA = heap.invoke("fresh-function"), freshB = heap.invoke("fresh-function");
  assert(!heap.keyEqual(freshA, freshB)); heap.release(freshA); heap.release(freshB);
  const named = heap.invoke("named-value"), another = heap.invoke("named-value");
  assert(heap.keyEqual(named, another));
  assert.equal(number(heap, "apply-one", [named, four]), 4);
  assert.equal(number(heap, "from-slot", [pair]), 37);
  finish(heap, [four, pair, increment, current, items, named, another]);
});

test("dynamic calls capture callees before arguments and evaluate extras before noncallable failure", () => {
  assert.equal(javascript.callee_order(), 1);
  const referenceMarker = [false];
  assert.throws(() => javascript.invoke_order(false, referenceMarker), TypeError);
  assert.deepEqual(referenceMarker, [2]);
  const heap = instance(), identity = heap.invoke("named-value"), marker = heap.sourceArray([false]);
  assert.equal(number(heap, "callee-order"), 1);
  assert.equal(number(heap, "apply-extra", [identity, marker]), 7);
  const effect = heap.get(marker, 0);
  try { assert.equal(heap.readNumber(effect), 9); } finally { heap.release(effect); }
  const missing = heap.invoke("apply-zero", [identity]);
  assert.equal(missing, undefined);
  assert.throws(() => heap.invoke("invoke-order", [false, marker]), error => error.eliscriptDiagnostic?.code === "ELI-RT0003");
  const failedEffect = heap.get(marker, 0);
  try { assert.equal(heap.readNumber(failedEffect), 2); } finally { heap.release(failedEffect); }
  finish(heap, [identity, marker]);
});

function indirectProgram() {
  const local = index => ({ kind: "local", type: "u32", children: [], value: index });
  const literal = value => ({ kind: "literal", type: "u32", children: [], value });
  const function_ = (name, index, arity, body) => ({ name, index, arity, locals: Array.from({ length: arity }, (_, index) => ({ name: `p${index}`, index, type: "u32" })), body });
  return { abi: "memory-u32", filename: "indirect.eli", exports: ["dispatch", "mismatch"], table: [1, 0], functions: [
    function_("identity", 0, 1, local(0)),
    function_("increment", 1, 1, { kind: "int-add", type: "u32", value: null, children: [local(0), literal(1)] }),
    function_("dispatch", 2, 2, { kind: "call-indirect", type: "u32", value: 1, children: [local(1), local(0)] }),
    function_("mismatch", 3, 1, { kind: "call-indirect", type: "u32", value: 2, children: [literal(11), literal(22), local(0)] }),
  ] };
}

test("typed WASM indirect calls select actual table entries and retain engine type and bounds traps", () => {
  const program = indirectProgram();
  const bytes = Uint8Array.from(backends.wasm.emit_typed_memory_wasm(program));
  assert(WebAssembly.validate(bytes));
  const module = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const e = new WebAssembly.Instance(module).exports;
  assert.equal(e.dispatch(0, 41), 42);
  assert.equal(e.dispatch(1, 41), 41);
  assert.equal(e.dispatch(0, 0xffffffff), 0);
  assert.throws(() => e.dispatch(2, 0), WebAssembly.RuntimeError);
  assert.throws(() => e.dispatch(0xffffffff, 0), WebAssembly.RuntimeError);
  assert.throws(() => e.mismatch(0), WebAssembly.RuntimeError);
});

test("typed WASM indirect calls reject missing tables, invalid entries and inconsistent call shapes", () => {
  for (const mutate of [p => { delete p.table; }, p => { p.table = [-1]; }, p => { p.table = [999]; },
    p => { p.functions[2].body.children.pop(); }, p => { p.functions[2].body.value = 7; }]) {
    const program = indirectProgram(); mutate(program);
    assert.throws(() => backends.wasm.emit_typed_memory_wasm(program), e => e.eliscriptDiagnostic?.code === "ELI-B0001");
  }
});

function rawCallableHeap(options = {}) {
  const names = ["value-cell-new", "value-cell-get", "value-cell-set", "value-function-new", "value-function-named", "value-function-code", "value-function-capture-get", "value-function-capture-set"];
  const program = structuredClone(runtime);
  program.body.push({ kind: "export-declaration", value: null, children: names.map(value => ({ kind: "reference", value, children: [] })) });
  const bytes = Uint8Array.from(backends.wasm.emit_memory_wasm(program));
  const module = new WebAssembly.Module(bytes); assert.deepEqual(WebAssembly.Module.imports(module), []);
  const e = new WebAssembly.Instance(module).exports;
  const heap = e["heap-new"](128, 4096, options.maxBytes ?? 32768);
  const call = (name, ...args) => { const result = e[name](heap, ...args) >>> 0; assert.equal(e["last-error"](), 0, name); return result; };
  call("heap-auto", 1);
  return { e, heap, call, bytes };
}

test("callable heap cells retain cycles and exact captures through forced GC and pool growth", () => {
  const { e, heap, call } = rawCallableHeap();
  const cell = call("value-cell-new", 2); call("heap-pin", cell);
  const closure = call("value-function-new", 7, 1); call("heap-pin", closure);
  call("value-function-capture-set", closure, 0, cell);
  call("value-cell-set", cell, closure);
  call("heap-release", cell); call("heap-collect");
  assert.equal(call("value-function-code", closure), 7);
  const keep = [];
  for (let i = 0; i < 50; i++) { const n = call("value-number", i, 0); call("heap-pin", n); keep.push(n); }
  assert(call("heap-capacity") > 4096);
  assert.equal(call("value-function-capture-get", closure, 0), cell);
  assert.equal(call("value-cell-get", cell), closure);
  call("value-cell-set", cell, 1); assert.equal(call("value-cell-get", cell), 1);
  for (const n of keep) call("heap-release", n);
  call("heap-release", closure); call("heap-collect");
  assert.equal(call("heap-live"), 0); assert.equal(call("frame-depth"), 0);
  e["value-function-code"](heap, closure); assert.equal(e["last-error"](), 1);
  e["value-cell-get"](heap, cell); assert.equal(e["last-error"](), 1);
  e["value-function-code"](heap, 1); assert.equal(e["last-error"](), 3);
});

test("named callable identities are shared only while alive and fresh functions stay distinct", () => {
  const { call } = rawCallableHeap();
  const a = call("value-function-named", 11); call("heap-pin", a);
  assert.equal(call("value-function-named", 11), a);
  const b = call("value-function-new", 11, 0); call("heap-pin", b);
  assert.notEqual(a, b); assert.equal(call("value-key-equal", a, b), 0);
  assert.equal(call("value-key-equal", a, a), 1);
  const hash = call("value-key-hash", a); call("heap-collect"); assert.equal(call("value-key-hash", a), hash);
  call("heap-release", a); call("heap-release", b); call("heap-collect");
  assert.equal(call("heap-live"), 0);
  const c = call("value-function-named", 11); call("heap-pin", c); assert.notEqual(c, a);
  call("heap-release", c); call("heap-collect"); assert.equal(call("heap-live"), 0);
});

test("callable heap capacity failure preserves captures and returns temporary borrowed roots", () => {
  const { e, heap, call } = rawCallableHeap({ maxBytes: 4096 });
  const cell = call("value-cell-new", 0); call("heap-pin", cell);
  const closure = call("value-function-new", 3, 1); call("heap-pin", closure);
  call("value-function-capture-set", closure, 0, cell); call("value-cell-set", cell, closure);
  call("heap-release", cell);
  const keep = []; let exhausted = false;
  for (let i = 0; i < 128; i++) {
    const n = e["value-number"](heap, i, 0) >>> 0;
    if (!n) { assert.equal(e["last-error"](), 2); exhausted = true; break; }
    call("heap-pin", n); keep.push(n);
  }
  assert(exhausted);
  assert.equal(e["value-cell-new"](heap, closure), 0); assert.equal(e["last-error"](), 2);
  assert.equal(call("value-function-capture-get", closure, 0), cell);
  assert.equal(call("value-cell-get", cell), closure);
  e["value-function-capture-get"](heap, closure, 1); assert.equal(e["last-error"](), 3);
  e["value-function-capture-set"](heap, closure, 0, closure); assert.equal(e["last-error"](), 1);
  assert.equal(call("value-function-capture-get", closure, 0), cell);
  for (const n of keep) call("heap-release", n);
  call("heap-release", closure); call("heap-collect");
  assert.equal(call("heap-live"), 0); assert.equal(call("frame-depth"), 0);
});

test("Node executes the same indirect-call and callable-heap artifacts with exact cleanup", async () => {
  const { bytes } = rawCallableHeap();
  const heapFile = resolve(directory, "callable-heap.wasm"), tableFile = resolve(directory, "callable-table.wasm");
  await writeFile(heapFile, bytes);
  await writeFile(tableFile, Uint8Array.from(backends.wasm.emit_typed_memory_wasm(indirectProgram())));
  const node = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e", `
    import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
    const instances=[];
    for(const path of process.argv.slice(1)){const m=new WebAssembly.Module(await readFile(path));assert.deepEqual(WebAssembly.Module.imports(m),[]);instances.push(new WebAssembly.Instance(m).exports);}
    const[e,t]=instances;assert.equal(t.dispatch(0,41),42);assert.equal(t.dispatch(1,41),41);
    assert.throws(()=>t.dispatch(2,0),WebAssembly.RuntimeError);assert.throws(()=>t.mismatch(0),WebAssembly.RuntimeError);
    const h=e['heap-new'](128,4096,32768), c=(name,...args)=>{const r=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return r;};
    c('heap-auto',1);const cell=c('value-cell-new',2);c('heap-pin',cell);
    const f=c('value-function-new',7,1);c('heap-pin',f);c('value-function-capture-set',f,0,cell);c('value-cell-set',cell,f);c('heap-release',cell);
    const keep=[];for(let i=0;i<50;i++){const n=c('value-number',i,0);c('heap-pin',n);keep.push(n);}
    c('heap-collect');assert(c('heap-capacity')>4096);assert.equal(c('value-function-code',f),7);assert.equal(c('value-cell-get',c('value-function-capture-get',f,0)),f);
    for(const n of keep)c('heap-release',n);c('heap-release',f);c('heap-collect');assert.equal(c('heap-live'),0);assert.equal(c('frame-depth'),0);
  `, heapFile, tableFile], { encoding: "utf8", timeout: 30_000 });
  assert.equal(node.status, 0, node.stderr || String(node.error));
});

test("discarded indirect results retain call traps and programs without indirect calls need no table", () => {
  const program = indirectProgram(), original = program.functions[2].body;
  program.functions[2].body = { kind: "sequence", type: "u32", value: null, children: [original, { kind: "literal", type: "u32", children: [], value: 99 }] };
  const e = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(backends.wasm.emit_typed_memory_wasm(program)))).exports;
  assert.equal(e.dispatch(0, 41), 99);
  assert.throws(() => e.dispatch(2, 41), WebAssembly.RuntimeError);
  const plain = indirectProgram(); delete plain.table; plain.functions.splice(2); plain.exports = ["identity"];
  const bytes = Uint8Array.from(backends.wasm.emit_typed_memory_wasm(plain)), sections = [];
  let cursor = 8;
  while (cursor < bytes.length) {
    const id = bytes[cursor++]; let length = 0, shift = 0, byte;
    do { byte = bytes[cursor++]; length += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
    sections.push(id); cursor += length;
  }
  assert(!sections.includes(4)); assert(!sections.includes(9));
  assert.equal(new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.identity(17), 17);
});

test("captured unrooted Numbers preserve IEEE words across allocation safepoints and pool movement", () => {
  const { e, call } = rawCallableHeap();
  const patterns = [[0, 0], [0, 0x80000000], [0, 0x7ff00000], [0, 0xfff00000], [1, 0x7ff80000],
    [1, 0], [0xffffffff, 0x000fffff], [0, 0x00100000], [0xffffffff, 0x7fefffff]];
  let seed = 0x63a791ef;
  const word = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 32; i++) patterns.push([word(), word()]);
  const cells = [];
  for (const [low, high] of patterns) {
    const value = call("value-number", low, high);
    // The Number has no host pin. Cell construction must protect this borrowed
    // operand before its own allocation triggers collection.
    const cell = call("value-cell-new", value); call("heap-pin", cell); cells.push(cell);
  }
  assert(call("heap-capacity") > 4096); call("heap-collect");
  for (let i = 0; i < cells.length; i++) {
    const value = call("value-cell-get", cells[i]), offset = call("value-data", value, 4), view = new DataView(e.memory.buffer);
    assert.equal(view.getUint32(offset, true), patterns[i][0]);
    assert.equal(view.getUint32(offset + 4, true), patterns[i][1]);
  }
  for (const cell of cells) call("heap-release", cell);
  call("heap-collect"); assert.equal(call("heap-live"), 0); assert.equal(call("frame-depth"), 0);
});

test("source shared cells preserve exact Numbers under repeated writes, alias reads and collection", () => {
  const heap = instance(), initial = heap.number(4), pair = heap.invoke("make-box", [initial]);
  const write = heap.get(pair, 0), read = heap.get(pair, 1), reference = javascript.make_box(4);
  const values = [-0, 0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE];
  let seed = 0x415f930d; const bits = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 192; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; bits.setUint32(0, seed, true);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; bits.setUint32(4, seed, true); values.push(bits.getFloat64(0, true));
  }
  for (const value of values) {
    const input = heap.number(value), output = heap.invoke("apply-one", [write, input]);
    assert(Object.is(heap.readNumber(output), reference[0](value))); assert(heap.keyEqual(input, output));
    heap.release(input); heap.release(output); heap.collect();
    assert(Object.is(number(heap, "apply-zero", [read]), reference[1]()));
  }
  finish(heap, [initial, pair, write, read]);
});

test("failed closure calls preserve shared state, first-error order and caller-owned frames", () => {
  const markerReference = [false], reference = javascript.guarded_box(4);
  assert.throws(() => reference[0](false, markerReference), TypeError); assert.equal(reference[1](), 4); assert.equal(markerReference[0], 7);
  const heap = instance(), four = heap.number(4), pair = heap.invoke("guarded-box", [four]);
  const write = heap.get(pair, 0), read = heap.get(pair, 1), marker = heap.sourceArray([false]);
  const frame = heap.frame(1); heap.frameSet(frame, 0, marker);
  assert.throws(() => heap.invoke("apply-two", [write, false, marker]), e => e.eliscriptDiagnostic?.code === "ELI-RT0003");
  assert.equal(heap.stats().frameDepth, 1); assert.equal(number(heap, "apply-zero", [read]), 4);
  const changed = heap.get(marker, 0); assert.equal(heap.readNumber(changed), 7); heap.release(changed);
  const identity = heap.invoke("named-value"), untouched = heap.sourceArray([false]);
  assert.throws(() => javascript.earlier_failure(x => x, [false]), TypeError);
  assert.throws(() => heap.invoke("earlier-failure", [identity, untouched]), e => e.eliscriptDiagnostic?.code === "ELI-RT0003");
  assert.equal(heap.get(untouched, 0), false); assert.equal(heap.stats().frameDepth, 1);
  const alias = heap.frameGet(frame, 0); assert(heap.keyEqual(alias, marker)); heap.release(alias);
  heap.leaveFrame(frame); finish(heap, [four, pair, write, read, marker, identity, untouched]);
});

test("direct and indirect calls preserve omitted arguments and effects of extras and ignored constructor operands", () => {
  const heap = instance(), marker = heap.sourceArray([false]), f = heap.invoke("lambda-identity");
  assert.equal(javascript.direct_missing(), undefined); assert.equal(heap.invoke("direct-missing"), undefined);
  assert.equal(heap.invoke("apply-zero", [f]), undefined);
  assert.equal(number(heap, "direct-extra", [marker]), 7);
  let changed = heap.get(marker, 0); assert.equal(heap.readNumber(changed), 12); heap.release(changed);
  assert.equal(number(heap, "apply-extra", [f, marker]), 7);
  const map = heap.invoke("ignored-constructor", [marker]); heap.release(map);
  const callback = heap.get(marker, 0); assert.equal(number(heap, "apply-zero", [callback]), 7);
  const reference = [false]; assert(javascript.ignored_constructor(reference) instanceof Map); assert.equal(reference[0](), 7);
  finish(heap, [marker, f, callback]);
});

test("mutually recursive local functions and source Map function keys retain identity through GC", () => {
  const heap = instance(), pair = heap.invoke("parity-functions"), even = heap.get(pair, 0), odd = heap.get(pair, 1);
  const reference = javascript.parity_functions();
  for (let i = 0; i < 33; i++) {
    const n = heap.number(i); assert.equal(heap.invoke("apply-one", [even, n]), reference[0](i));
    assert.equal(heap.invoke("apply-one", [odd, n]), reference[1](i)); heap.release(n); heap.collect();
  }
  const keys = heap.invoke("function-keys"), seven = heap.get(keys, 0);
  assert.equal(heap.readNumber(seven), javascript.function_keys()[0]);
  assert.equal(heap.get(keys, 1), false); assert.equal(heap.get(keys, 2), true);
  finish(heap, [pair, even, odd, keys, seven]);
});

test("source closure allocation failure releases partial environments and preserves caller frames", () => {
  const bytes = Uint8Array.from(backends.managed.emit_managed_wasm(program, runtime));
  const heap = instantiateManagedRuntime(bytes, { maxSlots: 128, initialBytes: 4096, maxBytes: 16384 }); heap.auto(1);
  const marker = heap.sourceArray([false]), n = heap.number(10000), four = heap.number(4), five = heap.number(5);
  const adder = heap.invoke("make-adder", [four]), frame = heap.frame(1); heap.frameSet(frame, 0, marker);
  assert.throws(() => heap.invoke("retain-closures", [marker, n]), e => e.eliscriptDiagnostic?.code === "ELI-RT0002");
  assert.equal(heap.stats().frameDepth, 1); heap.collect();
  const last = heap.get(marker, 0); assert(Number.isInteger(heap.readNumber(last))); assert(heap.readNumber(last) < 10000); heap.release(last);
  assert.equal(number(heap, "apply-one", [adder, five]), 9);
  heap.leaveFrame(frame); finish(heap, [marker, n, four, five, adder]);
});

test("a real trap inside a captured read unwinds dynamic callers and retains preexisting roots", async () => {
  const source = await readFile("bootstrap/runtime/memory.eli", "utf8"), start = source.indexOf("  (defun value-cell-get (heap cell)"), end = source.indexOf("  (defun value-cell-set", start);
  assert(start >= 0 && end > start);
  const faulty = source.slice(0, start) + "  (defun value-cell-get (heap cell) (load-u32 4294967295))\n" + source.slice(end);
  const injected = backends.compiler.compile_ir_string(faulty, "trap-cell-runtime.eli");
  const bytes = Uint8Array.from(backends.managed.emit_managed_wasm(program, injected));
  const heap = instantiateManagedRuntime(bytes); heap.auto(1);
  const four = heap.number(4), five = heap.number(5), f = heap.invoke("make-adder", [four]);
  const frame = heap.frame(1); heap.frameSet(frame, 0, four);
  assert.throws(() => heap.invoke("apply-one", [f, five]), WebAssembly.RuntimeError);
  assert.equal(heap.stats().frameDepth, 1);
  const alias = heap.frameGet(frame, 0); assert.equal(heap.readNumber(alias), 4); heap.release(alias);
  heap.leaveFrame(frame); finish(heap, [four, five, f]);
});

test("unsupported callable forms are source-bound refusals even in dead code and leave input IR untouched", () => {
  const before = JSON.stringify(program), runtimeBefore = JSON.stringify(runtime);
  const dead = backends.compiler.compile_ir_string("(defun f (x) (if false (lambda () x) x)) (export f)", "dead-supported-lambda.eli");
  const heap = instantiateManagedRuntime(Uint8Array.from(backends.managed.emit_managed_wasm(dead, runtime)));
  const input = heap.number(4), output = heap.invoke("f", [input]); assert.equal(heap.readNumber(output), 4); finish(heap, [input, output]);
  backends.managed.emit_managed_wasm(program, runtime);
  assert.equal(JSON.stringify(program), before); assert.equal(JSON.stringify(runtime), runtimeBefore);
  for (const source of ["(defun f () (if false (async () 1) 0))", "(defun f () (lambda ([x]) x))", "(defun f () (lambda (&optional [x]) x))",
    "(defun f (g) (apply g (js* \"[]\")))",
    "(defun f () (let ((globalThis nil)) (lambda () (new globalThis.Map))))"]) {
    const ir = backends.compiler.compile_ir_string(source + " (export f)", "unsupported-callable.eli"), saved = JSON.stringify(ir);
    assert.throws(() => backends.managed.emit_managed_wasm(ir, runtime), e => e.eliscriptDiagnostic?.code === "ELI-B0001" && e.eliscriptDiagnostic.location.file === "unsupported-callable.eli");
    assert.equal(JSON.stringify(ir), saved);
  }
});

test("parallel and sequential captures preserve shadowing and hygiene of internal ABI names", () => {
  const heap = instance(), four = heap.number(4), five = heap.number(5), f = heap.invoke("parallel-capture", [four]);
  assert.equal(number(heap, "apply-zero", [f]), javascript.parallel_capture(4)());
  const pair = heap.invoke("sequential-captures", [four]), old = heap.get(pair, 0), next = heap.get(pair, 1), reference = javascript.sequential_captures(4);
  assert.equal(number(heap, "apply-zero", [old]), reference[0]()); assert.equal(number(heap, "apply-zero", [next]), reference[1]());
  const hygienic = heap.invoke("hygienic-capture", [four, five, four, five, four]);
  assert.equal(number(heap, "apply-zero", [hygienic]), javascript.hygienic_capture(4, 5, 4, 5, 4)());
  finish(heap, [four, five, f, pair, old, next, hygienic]);
});

test("uniform dynamic ABI preserves many required parameters for both named and lifted functions", () => {
  const heap = instance(), named = heap.invoke("many-value"), lambda = heap.invoke("many-lambda"), marker = heap.sourceArray([false]);
  for (const f of [named, lambda]) {
    assert.equal(number(heap, "many-extra", [f, marker]), javascript.many_extra(javascript.many, [false]));
    assert(Number.isNaN(number(heap, "apply-zero", [f])));
    const effect = heap.get(marker, 0); assert.equal(heap.readNumber(effect), 123); heap.release(effect); heap.collect();
  }
  finish(heap, [named, lambda, marker]);
});

test("Node executes source closures, shared writes and failure cleanup against independent generated JS", async () => {
  const wasm = resolve(directory, "source-callables.wasm"), js = resolve(directory, "source-callables.mjs");
  await writeFile(wasm, Uint8Array.from(backends.managed.emit_managed_wasm(program, runtime)));
  await writeFile(js, backends.compiler.emit_ir_string(program));
  const result = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
    const{instantiateManagedRuntime}=await import(process.argv[3]),ref=await import(process.argv[2]);
    const bytes=await readFile(process.argv[1]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
    const a=instantiateManagedRuntime(bytes);a.auto(1);
    const num=(name,args=[])=>{const r=a.invoke(name,args);try{return a.readNumber(r);}finally{a.release(r);}};
    const four=a.number(4),five=a.number(5),adder=a.invoke('make-adder',[four]);assert.equal(num('apply-one',[adder,five]),ref.make_adder(4)(5));
    const pair=a.invoke('make-box',[four]),write=a.get(pair,0),read=a.get(pair,1),reference=ref.make_box(4);
    for(const value of[-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE]){const n=a.number(value),out=a.invoke('apply-one',[write,n]);assert(Object.is(a.readNumber(out),reference[0](value)));a.release(n);a.release(out);a.collect();assert(Object.is(num('apply-zero',[read]),reference[1]()));}
    const nested=a.invoke('nested',[four]),inner=a.invoke('apply-one',[nested,five]);assert.equal(num('apply-one',[inner,four]),ref.nested(4)(5)(4));
    const recursive=a.invoke('recursive'),count=a.number(24);assert.equal(num('apply-one',[recursive,count]),ref.recursive()(24));
    const marker=a.sourceArray([false]),identity=a.invoke('named-value');assert.throws(()=>a.invoke('invoke-order',[false,marker]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');
    const changed=a.get(marker,0);assert.equal(a.readNumber(changed),2);a.release(changed);assert.equal(a.invoke('apply-zero',[identity]),undefined);
    assert.equal(a.invoke('named-same'),true);assert.equal(a.invoke('fresh-same'),false);assert.equal(a.invoke('repeated-same'),false);assert.equal(num('callee-order'),1);assert.equal(num('funcall-one',[adder,five]),9);assert.equal(a.invoke('funcall-zero',[identity]),undefined);
    const items=a.invoke('capture-each',[four]);for(let i=0;i<4;i++){const f=a.get(items,i);assert.equal(num('apply-zero',[f]),i);a.release(f);}
    for(const v of[four,five,adder,pair,write,read,nested,inner,recursive,count,marker,identity,items])a.release(v);
    a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
  `, wasm, pathToFileURL(js).href, pathToFileURL(resolve("tools/backends/managed-runtime.mjs")).href], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

test("captured opaque values retain alias identity and source cycles collect without permanent roots", () => {
  const heap = instance(), pair = heap.invoke("make-box", [false]), write = heap.get(pair, 0), read = heap.get(pair, 1);
  const text = heap.string("中😀\ud800"), bytes = heap.bytes(new Uint8Array([0, 255])), array = heap.sourceArray([text]);
  const object = heap.sourceObject({ value: array }), fn = heap.invoke("named-value");
  for (const value of [null, false, true, undefined, text, bytes, array, object, fn, pair]) {
    const out = heap.invoke("apply-one", [write, value]); assert(heap.keyEqual(out, value)); heap.release(out); heap.collect();
    const alias = heap.invoke("apply-zero", [read]); assert(heap.keyEqual(alias, value)); heap.release(alias);
  }
  finish(heap, [pair, write, read, text, bytes, array, object, fn]);
});

test("foreign, forged and collected function handles cannot enter a dynamic call or disturb caller roots", () => {
  const heap = instance(), other = instance(), foreign = other.invoke("named-value"), four = heap.number(4);
  const frame = heap.frame(1); heap.frameSet(frame, 0, four);
  for (const f of [foreign, Object.freeze({ kind: 18 })]) assert.throws(() => heap.invoke("apply-one", [f, four]), e => e.eliscriptDiagnostic?.code === "ELI-RT0001");
  const stale = heap.invoke("named-value"); heap.release(stale); heap.collect();
  assert.throws(() => heap.invoke("apply-one", [stale, four]), e => e.eliscriptDiagnostic?.code === "ELI-RT0001");
  assert.equal(heap.stats().frameDepth, 1); const alias = heap.frameGet(frame, 0); assert.equal(heap.readNumber(alias), 4); heap.release(alias);
  heap.leaveFrame(frame); finish(heap, [four]); finish(other, [foreign]);
});

test("funcall shares dynamic callee ordering, omitted arguments and required ABI with ordinary calls", () => {
  const heap = instance(), four = heap.number(4), five = heap.number(5), adder = heap.invoke("make-adder", [four]);
  assert.equal(number(heap, "funcall-one", [adder, five]), javascript.funcall_one(javascript.make_adder(4), 5));
  const identity = heap.invoke("named-value"), marker = heap.sourceArray([false]);
  assert.equal(heap.invoke("funcall-zero", [identity]), undefined);
  assert.throws(() => heap.invoke("funcall-order", [false, marker]), e => e.eliscriptDiagnostic?.code === "ELI-RT0003");
  const last = heap.get(marker, 0); assert.equal(heap.readNumber(last), 2); heap.release(last);
  finish(heap, [four, five, adder, identity, marker]);
});

test("malformed callable parameters cannot hide unsupported IR, duplicate bindings or invalid counts", () => {
  const find = nodes => { for (const n of nodes) { if (n.kind === "function-expression") return n; const child = find(n.children ?? []); if (child) return child; } };
  for (const mutate of [n => { n.properties.parameterCount = -1; }, n => { n.properties.parameterCount = "2"; },
    n => { n.children[0].children = [{ kind: "raw-javascript", value: "js*", children: [] }]; },
    n => { n.children[1].value = n.children[0].value; }, n => { n.children[0].value = ""; }]) {
    const ir = backends.compiler.compile_ir_string("(defun f () (lambda (x y) 7)) (export f)", "malformed-callable.eli");
    mutate(find(ir.body)); const saved = JSON.stringify(ir);
    assert.throws(() => backends.managed.emit_managed_wasm(ir, runtime), e => e.eliscriptDiagnostic?.code === "ELI-B0001" && e.eliscriptDiagnostic.location.file === "malformed-callable.eli");
    assert.equal(JSON.stringify(ir), saved);
  }
});

test("captured arguments are snapshotted before later writes replace their shared cell", () => {
  const heap = instance(), four = heap.number(4), result = heap.invoke("captured-arguments", [four]);
  const first = heap.get(result, 0), second = heap.get(result, 1), reference = javascript.captured_arguments(4);
  assert.equal(heap.readNumber(first), reference[0]); assert.equal(heap.readNumber(first), 45);
  assert.equal(heap.readNumber(second), reference[1]); assert.equal(heap.readNumber(second), 5);
  finish(heap, [four, result, first, second]);
});

test("generated closure programs match an independent lexical and IEEE model across shadowing and updates", () => {
  const names = ["x", "heap", "frame", "error", "arguments", "function"], operators = ["+", "-", "*", "/"];
  let seed = 0x3fd8a157; const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const update = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b };
  let count = 0;
  for (const name of names) for (const sequential of [false, true]) for (const op of operators) {
    const salt = ((random() % 2001) - 1000) / 16, outer = count % 3 === 0 ? -0 : count % 3 === 1 ? NaN : 7.25;
    const bindings = sequential ? `((${name} ${salt}) (before (lambda () ${name})))` : `((before (lambda () ${name})) (${name} ${salt}))`;
    const source = `(defun make (${name}) (${sequential ? "let*" : "let"} ${bindings}
      (js-array (lambda (delta) (setq ${name} (${op} ${name} delta)) ${name}) (lambda () ${name}) before)))
      (defun update (f delta) (funcall f delta)) (defun read (f) (funcall f)) (export make update read)`;
    const ir = backends.compiler.compile_ir_string(source, `generated-capture-${count++}.eli`);
    const heap = instantiateManagedRuntime(Uint8Array.from(backends.managed.emit_managed_wasm(ir, runtime))); heap.auto(1);
    const input = heap.number(outer), pair = heap.invoke("make", [input]), writer = heap.get(pair, 0), reader = heap.get(pair, 1), before = heap.get(pair, 2);
    let expected = salt;
    for (const delta of [0.5, -0, 3.25, -2, Infinity, Number.MIN_VALUE, NaN]) {
      const argument = heap.number(delta), result = heap.invoke("update", [writer, argument]); expected = update[op](expected, delta);
      assert(Object.is(heap.readNumber(result), expected), `${name} ${sequential} ${op} write`); heap.release(result); heap.release(argument); heap.collect();
      for (const [f, value] of [[reader, expected], [before, sequential ? expected : outer]]) {
        const out = heap.invoke("read", [f]); assert(Object.is(heap.readNumber(out), value), `${name} ${sequential} ${op} read`); heap.release(out);
      }
    }
    finish(heap, [input, pair, writer, reader, before]);
  }
  assert.equal(count, 48);
});
