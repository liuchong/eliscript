import { afterAll, beforeAll, describe, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";
import { backendModules, buildBackends, root } from "../tools/backends/build.mjs";
import { validateDirectWasmReport } from "../tools/backends/benchmark.mjs";

const browserName = process.env.ELISCRIPT_TEST_BROWSER ?? "chromium";
const browsers = { chromium, firefox, webkit };
assert(Object.hasOwn(browsers, browserName), `unknown ELISCRIPT_TEST_BROWSER: ${browserName}`);
let directory, generations, browserBundle, browserProcess;
const sameNumber = (actual, expected, label) => assert(Object.is(actual, expected), `${label}: ${actual} != ${expected}`);

const optimizationCases = `
  (defun bounded (n) (let ((i 0) (sum 0))
    (while (and (< i n) (< i 3)) (setq sum (+ sum i)) (setq i (1+ i))) (+ sum i)))
  (defun fractional (n) (let ((i 0)) (while (< i n) (setq i (1+ i))) i))
  (defun negative-zero (n) (let ((i -0.0))
    (while (and (< i n) (< i 3)) (setq i (1+ i))) (/ 1 i)))
  (defun mutable-bound (n) (let ((i 0))
    (while (and (< i n) (< i 3)) (setq n (1- n)) (setq i (1+ i))) (+ n i)))
  (defun fractional-step (n) (let ((i 0))
    (while (and (< i n) (< i 3)) (setq i (+ i 0.5))) i))
  (defun conditional-set (n) (let ((i 0) (x n) (sum 0))
    (while (and (< i n) (< i 3))
      (if (< i 1) (setq x 5) x)
      (let ((y (/ 1 n))) (setq sum (+ sum (+ x y))))
      (setq i (1+ i))) (+ sum x)))
  (defun cyclic-truth (n) (let ((i 0) (cycle 0) (sum 0))
    (while (and (< i n) (< i 300))
      (setq sum (+ sum (if cycle 1 999)))
      (setq cycle (if (< cycle 127) (1+ cycle) 0))
      (setq i (1+ i))) (+ sum cycle)))
  (defun non-power-cycle (n) (let ((i 0) (cycle 0) (sum 0))
    (while (and (< i n) (< i 300))
      (setq sum (+ sum cycle))
      (setq cycle (if (< cycle 6) (1+ cycle) 0))
      (setq i (1+ i))) (+ sum cycle)))
  (defun arguments (a b) (+ (* a 10) b))
  (defun effects (x) (let ((value (arguments x (setq x (+ x 1))))) (+ (* x 100) value)))
  (defun mutate (a b) (setq a (+ a b)) (+ a b))
  (defun isolated (x) (+ (* x 100) (mutate x x)))
  (defun squares (x) (let ((i 0) (sum 0))
    (while (and (< i 3) (< (* x x) 1000))
      (setq sum (+ sum (* x x)))
      (setq x (/ x 2))
      (setq sum (+ sum (* x x)))
      (if (< x 0) (setq x (- x)) x)
      (setq sum (+ sum (* x x)))
      (setq i (1+ i))) sum))
  (defun squares-or (x) (let ((i 0) (sum 0))
    (while (and (< i 3) (or (> x 0) (< (* x x) 1000)))
      (setq sum (+ sum (* x x)))
      (setq x (/ x 2)) (setq i (1+ i))) sum))
  (defun condition-effects (n) (let ((i 0) (sum 0))
    (while (and (< i 3) (or (< (setq sum (1+ sum)) n) (not (> i 1))))
      (setq i (1+ i))) (+ (* sum 10) i)))
  (defun negated-condition (n) (let ((i 0))
    (while (not (or (>= i 3) (>= i n))) (setq i (1+ i))) i))
  (export bounded fractional negative-zero mutable-bound fractional-step conditional-set cyclic-truth non-power-cycle effects isolated squares squares-or condition-effects negated-condition)`;

const unsupportedCases = [
    '(defun f (x) "text") (export f)',
    '(defun f (x) [x]) (export f)',
    '(defun f (x) (js* "x")) (export f)',
    '(defun f (x) (lambda (y) y)) (export f)',
    '(defasync f (x) x) (export f)',
    '(defun f (&optional x) x) (export f)',
    '(defun f (x) (let ((a t)) (setq a x) x)) (export f)',
    '(defun f (x) (+ x x x)) (export f)',
    '(defun f (x) (= x 1)) (export f)',
    '(defun f (x) (if false "unreachable" x)) (export f)',
    '(import "host" g) (defun f (x) (g x)) (export f)',
];

const ieeeCases = `
  (defun ieee-add (x y) (+ x y))
  (defun ieee-multiply (x y) (* x y))
  (defun ieee-divide (x y) (/ x y))
  (defun ieee-ordered (x) (+ (+ x 10000000000000000) -10000000000000000))
  (defun ieee-zero (x) (* x -0.0))
  (defun ieee-truth (x) (if x 1 2))
  (export ieee-add ieee-multiply ieee-divide ieee-ordered ieee-zero ieee-truth)`;

const parallelCases = `
  (defun scalar (n seed) (let ((i 0) (x seed) (sum 0))
    (while (< i n) (setq x (* (* 3.8 x) (- 1 x))) (setq sum (+ sum x)) (setq i (1+ i))) sum))
  (defun indexed (n seed) (let ((i 0) (x seed) (sum 0))
    (while (< i n) (setq x (/ (+ x i) 2)) (setq sum (+ sum x)) (setq i (1+ i))) (+ sum i)))
  (defun moving (n seed) (let ((i 0) (x seed) (sum 0))
    (while (< i n) (setq n (1- n)) (setq x (/ (+ x i) 2)) (setq sum (+ sum x)) (setq i (1+ i))) sum))
  ${["scalar", "indexed", "moving"].map(kernel => `
    (defun ${kernel}-batch (n seed calls) (let ((i 0) (cycle 0) (sum 0))
      (while (< i calls) (setq sum (+ sum (${kernel} n (+ seed (* cycle 0.000000001)))))
        (setq cycle (if (< cycle 7) (1+ cycle) 0)) (setq i (1+ i))) sum))`).join("\n")}
  (defun dependent-batch (n seed calls) (let ((i 0) (sum 0))
    (while (< i calls) (setq sum (+ sum (scalar n (+ seed sum)))) (setq i (1+ i))) sum))
  (export scalar-batch indexed-batch moving-batch dependent-batch)`;

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "eliscript-direct-backend-"));
  generations = [await buildBackends({ outputRoot: resolve(directory, "g1"), seed: true })];
  const coreNames = (await readdir(resolve(root, "bootstrap/compiler")))
    .filter(name => name.endsWith(".eli")).sort();
  for (const name of ["g2", "g3"]) {
    const outputRoot = resolve(directory, name);
    const output = resolve(outputRoot, "bootstrap");
    await mkdir(output, { recursive: true });
    const previous = generations.at(-1).compiler;
    for (const file of coreNames) {
      const sourcePath = resolve(root, "bootstrap/compiler", file);
      const generated = file.replace(/\.eli$/, ".mjs");
      const emission = previous.compile_string_with_source_map(
        await readFile(sourcePath, "utf8"), sourcePath, generated, relative(output, sourcePath),
      );
      await writeFile(resolve(output, generated), `${emission.javascript}//# sourceMappingURL=${generated}.map\n`);
      await writeFile(resolve(output, `${generated}.map`), emission.sourceMap);
    }
    const backend = await buildBackends({ outputRoot, frontend: previous });
    backend.compiler = await import(pathToFileURL(resolve(output, "compiler.mjs")).href);
    generations.push(backend);
  }
}, 120_000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function compile(source, name = "direct-test.eli", generation = generations[2]) {
  const program = generation.compiler.compile_ir_string(source, name);
  const bytes = Uint8Array.from(generation.wasm.emit_numeric_wasm(program));
  assert(WebAssembly.validate(bytes));
  const module = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  return { program, bytes, exports: new WebAssembly.Instance(module).exports };
}

async function javascript(source, name = "direct-test.eli", optimized = false) {
  const { compiler, optimizer } = generations[2];
  const program = compiler.compile_ir_string(source, name);
  const code = compiler.emit_ir_string(optimized ? optimizer.optimize_program(program) : program);
  const path = resolve(directory, `oracle-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(path, code);
  // Bun caches directory entries while loading the generations. A data URL
  // avoids that cache for newly written oracle files; Node loads the file.
  return { path, module: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`) };
}

test("Eliscript optimizer and direct WASM emitter reach a three-generation byte fixed point", async () => {
  for (const name of backendModules) for (const suffix of [".mjs", ".mjs.map"]) {
    const artifacts = await Promise.all(generations.map(g => readFile(resolve(g.directory, name + suffix), "utf8")));
    assert.equal(artifacts[0], artifacts[1], name + suffix);
    assert.equal(artifacts[1], artifacts[2], name + suffix);
  }
  const source = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8");
  const artifacts = generations.map(g => compile(source, "kernels.eli", g));
  assert.deepEqual(artifacts[0].bytes, artifacts[1].bytes);
  assert.deepEqual(artifacts[1].bytes, artifacts[2].bytes);
  assert.equal(artifacts[2].exports.recurrence(1000, .123), 641.1641723326824);
  const nativeArtifacts = {};
  for (const format of ["object", "library", "executable"]) {
    const text = source + "\n(defun entry () (recurrence 1000 .123)) (export entry)";
    const outputs = generations.map(g => {
      const program = g.compiler.compile_ir_string(text, "native-fixed-point.eli");
      return Uint8Array.from(format === "executable"
        ? g.native.emit_native_numeric_executable(program, "arm64-macos", "entry")
        : format === "library" ? g.native.emit_native_numeric_library(program, "arm64-macos")
          : g.native.emit_native_numeric_object(program, "arm64-macos"));
    });
    assert.deepEqual(outputs[0], outputs[1], format);
    assert.deepEqual(outputs[1], outputs[2], format);
    nativeArtifacts[format] = Buffer.from(outputs[2]).toString("base64");
  }
  const node = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
    'import{readFile}from"node:fs/promises";const c=await import(process.argv[1]);const w=await import(process.argv[2]);const s=await readFile(process.argv[3],"utf8");const n=await import(process.argv[4]);const p=c.compile_ir_string(s+"\\n(defun entry () (recurrence 1000 .123)) (export entry)","native-fixed-point.eli");console.log(JSON.stringify({wasm:Buffer.from(w.emit_numeric_wasm(c.compile_ir_string(s,"kernels.eli"))).toString("base64"),object:Buffer.from(n.emit_native_numeric_object(p,"arm64-macos")).toString("base64"),library:Buffer.from(n.emit_native_numeric_library(p,"arm64-macos")).toString("base64"),executable:Buffer.from(n.emit_native_numeric_executable(p,"arm64-macos","entry")).toString("base64")}));',
    pathToFileURL(resolve(directory, "g3/bootstrap/compiler.mjs")).href,
    pathToFileURL(resolve(directory, "g3/backends/wasm.mjs")).href,
    resolve(root, "tools/experiments/native-wasm/kernels.eli"),
    pathToFileURL(resolve(directory, "g3/backends/native.mjs")).href], { encoding: "utf8" });
  assert.equal(node.status, 0, node.stderr);
  const fromNode = JSON.parse(node.stdout);
  assert.deepEqual(Buffer.from(fromNode.wasm, "base64"), Buffer.from(artifacts[2].bytes));
  for (const format of ["object", "library", "executable"]) assert.equal(fromNode[format], nativeArtifacts[format], format);
  for (const name of backendModules) {
    const source = await readFile(resolve(root, `bootstrap/backends/${name}.eli`), "utf8");
    const program = generations[2].compiler.compile_ir_string(source, name + ".eli");
    const visit = node => {
      assert.notEqual(node.kind, "raw-javascript", name + " must implement its algorithms in Eliscript");
      node.children.forEach(visit);
    };
    program.body.forEach(visit);
  }
});

test("seed and self-hosted JS emission preserve literal and quoted negative zero", async () => {
  const source = '(defun literal () -0.0) (defun quoted () (quote -0.0)) (export literal quoted)';
  const input = resolve(directory, "negative-zero.eli");
  await writeFile(input, source);
  const seed = spawnSync(resolve(root, "bin/eliscript-seed"), [input], { encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  assert.equal(generations[2].compiler.compile_string(source, input), seed.stdout);
  const module = await import(`data:text/javascript;base64,${Buffer.from(seed.stdout).toString("base64")}`);
  sameNumber(module.literal(), -0, "literal");
  sameNumber(module.quoted(), -0, "quoted");
});

test("shared optimizer preserves IEEE order, Lisp truth, effects, spans and canonical IR", async () => {
  const source = `
    (defun folded (x) (+ x (* (+ 2 3) 4)))
    (defun zero-truth (x) (if 0 (+ x 1) (- x 1)))
    (defun false-truth (x) (if false (- x 1) (+ x 1)))
    (defun signed-zero (x) (* x (* -1 0)))
    (defun infinite (x) (+ x (/ 1 0)))
    (defun ordered (x) (+ (+ x 10000000000000000) -10000000000000000))
    (defun effects (x) (let ((sum x))
      (if (< sum 0) (setq sum (+ sum 10)) (setq sum (- sum 10))) sum))
    (export folded zero-truth false-truth signed-zero infinite ordered effects)`;
  const { compiler, optimizer } = generations[2];
  const program = compiler.compile_ir_string(source, "optimizer.eli");
  const original = compiler.serialize_ir_program(program);
  const optimized = optimizer.optimize_program(program);
  const encoded = compiler.serialize_ir_program(optimized);
  assert.equal(compiler.serialize_ir_program(program), original, "input must remain unchanged");
  assert.equal(compiler.serialize_ir_program(optimizer.optimize_program(optimized)), encoded, "pass must be idempotent");
  assert.deepEqual(compiler.deserialize_ir_program(encoded), optimized);
  const originalLocations = new Set();
  const visit = (node, action) => { action(node); node.children.forEach(n => visit(n, action)); };
  program.body.forEach(node => visit(node, n => originalLocations.add(JSON.stringify(n.span))));
  optimized.body.forEach(node => visit(node, n => assert(originalLocations.has(JSON.stringify(n.span)))));
  assert(compiler.emit_ir_string(optimized).includes("20"));
  const baseline = await javascript(source);
  const optimizedJs = await javascript(source, "optimizer.eli", true);
  const wasm = compile(source);
  for (const name of Object.keys(wasm.exports)) for (const value of [-Infinity, -1e20, -9, -0, 0, .123, 9, 1e20, Infinity, NaN]) {
    const expected = baseline.module[name.replaceAll("-", "_")](value);
    sameNumber(optimizedJs.module[name.replaceAll("-", "_")](value), expected, `optimized ${name}`);
    sameNumber(wasm.exports[name](value), expected, `wasm ${name}`);
  }
});

test("shared optimizer preserves general JS closures, effects, async and finally", async () => {
  const source = `
    (defvar events (js-array))
    (defun record (value) (js-call events :push value) value)
    (defun selected () (if 0 (record "chosen") (record "unselected")))
    (defun captured (x) (let* ((base (+ 2 3)) (f (lambda (y) (+ base y)))) (f x)))
    (defasync deferred (x) (if false (throw "unselected") (await (Promise/resolve (+ x (* 2 3))))))
    (defun cleanup () (try (if t (record "body") (throw "unselected"))
      (finally (if false (record "unselected") (record "finally")))))
    (export selected captured deferred cleanup events)`;
  const original = await javascript(source);
  const optimized = await javascript(source, "dynamic-optimizer.eli", true);
  const evaluate = async module => [module.selected(), module.captured(9),
    await module.deferred(4), module.cleanup(), [...module.events]];
  const expected = ["chosen", 14, 10, "body", ["chosen", "body", "finally"]];
  assert.deepEqual(await evaluate(original.module), expected);
  assert.deepEqual(await evaluate(optimized.module), expected);
});

test("direct WASM preserves bindings, assignment values, short circuit, calls and f64 edges", async () => {
  const source = `
    (defun shadow (x) (let ((x 2) (y x)) (+ x y)))
    (defun sequential (x) (let* ((x 2) (y x)) (+ x y)))
    (defun assignments (x) (let ((a x) (b 3)) (setq a (+ a b) b (* a b))))
    (defun initialization-effects (x) (let ((x (setq x (+ x 1))) (y x)) (+ x y)))
    (defun condition-effects (x) (if (setq x (+ x 1)) x 999))
    (defun condition-number (x) (if x 1 2))
    (defun and-number (x) (and x (+ x 1)))
    (defun or-number (x) (or x (setq x 999)))
    (defun short-circuit (x) (let ((sum x))
      (if (and (< x 0) (> (setq sum (+ sum 1)) 0)) (setq sum (+ sum 2)) sum)
      (if (or (> x 0) (> (setq sum (+ sum 3)) 0)) (setq sum (+ sum 4)) sum) sum))
    (defun bounded (x) (let ((i 0) (sum x)) (while (< i 20) (setq sum (/ (+ sum i) 2) i (1+ i))) sum))
    (defun negative-zero () -0.0)
    (defun unary (x) (- x))
    (defun reciprocal (x) (/ x))
    (defun nested-call (x) (+ (shadow x) (sequential x)))
    (defun recursive (x) (if (< x 1) 1 (* x (recursive (- x 1)))))
    (defun 中文 (x) (+ x 1))
    (export shadow sequential assignments initialization-effects condition-effects
      condition-number and-number or-number short-circuit bounded negative-zero
      unary reciprocal nested-call recursive 中文)`;
  const baseline = await javascript(source);
  const wasm = compile(source);
  for (const name of Object.keys(wasm.exports).filter(n => !["recursive", "中文"].includes(n))) {
    for (const value of [-Infinity, -7, -0, 0, .123, 9, Infinity, NaN]) {
      sameNumber(wasm.exports[name](value), baseline.module[name.replaceAll("-", "_")](value), name);
    }
  }
  assert.equal(wasm.exports.recursive(8), 40320);
  assert.equal(wasm.exports["中文"](9), 10);
  sameNumber(wasm.exports["negative-zero"](), -0, "literal encoding");
  const oracle = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
    'const m=await import(process.argv[1]);console.log(JSON.stringify([m.shadow(9),m.sequential(9),m.recursive(8)]));',
    pathToFileURL(baseline.path).href], { encoding: "utf8" });
  assert.equal(oracle.status, 0, oracle.stderr);
  assert.deepEqual(JSON.parse(oracle.stdout), [wasm.exports.shadow(9), wasm.exports.sequential(9), wasm.exports.recursive(8)]);
});

test("discarded numeric results remove stack traffic while preserving effects and calls", async () => {
  const plain = compile('(defun f (x) x) (export f)');
  const unused = compile('(defun f (x) (* x x) (/ x 0) (< x 0) (not x) x) (export f)');
  assert.deepEqual(unused.bytes, plain.bytes, "unused nontrapping arithmetic and truth results disappear");
  const assigned = compile('(defun f (x) (setq x (- x)) x) (export f)');
  // The sole code body: zero local groups, local.get 0, f64.neg,
  // local.set 0, local.get 0, end. No local.tee followed by drop.
  assert.deepEqual([...assigned.bytes.slice(-9)], [0, 32, 0, 154, 33, 0, 32, 0, 11]);
  const source = `
    (defun g (x) (if (> x 1) (g (- x 1)) x))
    (defun f (x)
      (g x)
      (let ((a x) (b 0) (flag false))
        (/ (setq a (+ a 1)) (setq b (+ b 2)))
        (if (/ (setq b (+ b 3)) 0) (setq a (+ a 4)) (setq a 999))
        (and a (setq b (+ b 5)))
        (or a (setq b 999))
        (and flag (= (setq b 999) 0))
        (or flag (= (setq b (+ b 6)) 0))
        (not (= (setq b (+ b 7)) 0))
        (if (< a 0) (setq a (- a)) (setq a (* a 2)))
        (while (< b 25) (setq b (1+ b)))
        (+ a b)))
    (defun assignment-value (x) (+ (setq x (- x)) x))
    (defun loop-value (x) (if (while false (setq x 999)) 999 x))
    (export f assignment-value loop-value)`;
  const oracle = await javascript(source);
  const wasm = compile(source);
  for (const value of [-Infinity, -7, -0, 0, .123, 9, NaN]) {
    for (const name of Object.keys(wasm.exports)) {
      sameNumber(wasm.exports[name](value), oracle.module[name.replaceAll("-", "_")](value), name);
    }
  }
  const called = compile('(defun g (x) (g x)) (defun f (x) (g x) x) (export f)');
  assert.deepEqual([...called.bytes.slice(-9)], [0, 32, 0, 16, 0, 26, 32, 0, 11],
    "discarded calls remain, including their arguments and possible nontermination");
});

test("direct WASM differentially executes generated numeric programs and multi-byte indices", async () => {
  let state = 0x51a7;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const expression = depth => {
    if (!depth) return random() & 1 ? "x" : String((random() % 19) - 9);
    const op = ["+", "-", "*", "/"][random() % 4];
    return `(${op} ${expression(depth - 1)} ${expression(depth - 1)})`;
  };
  const definitions = Array.from({ length: 140 }, (_, i) => `(defun f${i} (x) ${expression(3)})`);
  const bindings = Array.from({ length: 140 }, (_, i) => `(v${i} ${i})`).join(" ");
  const source = definitions.join("\n") + `\n(defun locals (x) (let (${bindings}) (+ x v139)))\n(export ${definitions.map((_, i) => `f${i}`).join(" ")} locals)`;
  const baseline = await javascript(source);
  const wasm = compile(source);
  for (const name of Object.keys(wasm.exports)) for (const value of [-Infinity, -7, -0, 0, .123, 9, Infinity, NaN]) {
    sameNumber(wasm.exports[name](value), baseline.module[name](value), name);
  }
});

test("typed optimization variants preserve ranges, fractional bounds, scope and IEEE edges", async () => {
  const oracle = await javascript(optimizationCases);
  const { compiler, numeric, wasm } = generations[2];
  const original = numeric.lower_numeric_program(compiler.compile_ir_string(optimizationCases, "typed-cases.eli"));
  const saved = JSON.stringify(original);
  const inputs = [-Infinity, -7, -0, 0, Number.MIN_VALUE, .5, 1, 1.1, 2, 2.5, 3, 9, 129, 257, Infinity, NaN];
  for (let bits = 0; bits < 8; bits++) {
    const options = { inlining: !!(bits & 1), loops: !!(bits & 2), integers: !!(bits & 4) };
    const optimized = numeric.optimize_numeric_program(original, options);
    assert.equal(JSON.stringify(original), saved, "typed input is immutable");
    const bytes = Uint8Array.from(wasm.emit_typed_numeric_wasm(optimized));
    assert(WebAssembly.validate(bytes));
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    for (const name of Object.keys(instance.exports)) for (const value of inputs) {
      if (name === "fractional" && (value === Infinity || value > 100)) continue;
      sameNumber(instance.exports[name](value), oracle.module[name.replaceAll("-", "_")](value), `${bits}/${name}/${value}`);
    }
    // The second conjunct bounds execution while the first exercises both
    // sides of the signed-i32 limit and the original f64 fallback.
    for (const value of [2147483646.5, 2147483647, 2147483647.5, 2147483648, 2 ** 53, Infinity, NaN]) {
      sameNumber(instance.exports.bounded(value), oracle.module.bounded(value), `range/${bits}/${value}`);
    }
    const nodes = function* (node) { yield node; for (const child of node.children) yield* nodes(child); };
    if (options.integers) {
      assert([...nodes(optimized.functions.find(f => f.name === "bounded").body)].some(n => n.kind === "ceil-int"));
      for (const name of ["negative-zero", "mutable-bound", "fractional-step"]) {
        assert(![...nodes(optimized.functions.find(f => f.name === name).body)].some(n => n.kind === "ceil-int"), name);
      }
    }
    if (options.inlining) {
      assert(![...nodes(optimized.functions.find(f => f.name === "effects").body)].some(n => n.kind === "call"));
    }
  }
  const artifacts = generations.map(g => compile(optimizationCases, "typed-cases.eli", g).bytes);
  assert.deepEqual(artifacts[0], artifacts[1]);
  assert.deepEqual(artifacts[1], artifacts[2]);
  const check = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
    'const m=await import(process.argv[1]);const w=new WebAssembly.Instance(new WebAssembly.Module(Buffer.from(process.argv[2],"base64"))).exports;for(const name of Object.keys(w))for(const x of[-Infinity,-7,-0,0,.5,1,1.1,9,Infinity,NaN]){if(name==="fractional"&&x===Infinity)continue;if(!Object.is(w[name](x),m[name.replaceAll("-","_")](x)))throw Error(name+":"+x)}',
    pathToFileURL(oracle.path).href, Buffer.from(artifacts[2]).toString("base64")], { encoding: "utf8", timeout: 30_000 });
  assert.equal(check.status, 0, check.stderr);
});

test("independent call-loop pipelining preserves lane state and ordered reductions", async () => {
  const { compiler, numeric, wasm } = generations[2];
  const program = numeric.lower_numeric_program(compiler.compile_ir_string(parallelCases, "parallel-cases.eli"));
  const saved = JSON.stringify(program);
  const oracle = await javascript(parallelCases);
  let enabled;
  for (const parallel of [false, true]) {
    const optimized = numeric.optimize_numeric_program(program, { parallel });
    assert.equal(JSON.stringify(program), saved);
    const bytes = Uint8Array.from(wasm.emit_typed_numeric_wasm(optimized));
    assert(WebAssembly.validate(bytes));
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    for (const name of Object.keys(instance.exports)) {
      for (const n of [-Infinity, -0, 0, .5, 1, 1.1, 2, 2.5, 3, 9, 17, NaN]) {
        for (const seed of [-Infinity, -0, 0, .123, Infinity, NaN]) {
          for (const calls of [-Infinity, -0, 0, .5, 1, 1.1, 2, 2.1, 3, 3.7, 5, 9, NaN]) {
            sameNumber(instance.exports[name](n, seed, calls), oracle.module[name.replaceAll("-", "_")](n, seed, calls), `${parallel}/${name}/${n}/${seed}/${calls}`);
          }
        }
      }
    }
    if (parallel) {
      enabled = bytes;
      // A >= 2 guard is the observable pipeline selection. Both dependent
      // arguments and a mutable callee limit must reject this transformation.
      for (const name of ["scalar-batch", "indexed-batch", "moving-batch", "dependent-batch"]) {
        const body = optimized.functions.find(f => f.name === name).body;
        const guard = body.kind === "if" && body.children[0].kind === "and" &&
          body.children[0].children[0].kind === "compare" && body.children[0].children[0].value === ">=" &&
          body.children[0].children[0].children[1].value === 2;
        assert.equal(guard, ["scalar-batch", "indexed-batch"].includes(name), name);
      }
    }
  }
  const outputs = generations.map(g => compile(parallelCases, "parallel-cases.eli", g).bytes);
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[1], outputs[2]);
  const check = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
    'const m=await import(process.argv[1]);const w=new WebAssembly.Instance(new WebAssembly.Module(Buffer.from(process.argv[2],"base64"))).exports;for(const name of Object.keys(w))for(const n of[0,.5,1,1.1,2,2.5,9,NaN])for(const seed of[-0,.123,NaN])for(const calls of[.5,1,2,2.1,3,5,NaN])if(!Object.is(w[name](n,seed,calls),m[name.replaceAll("-","_")](n,seed,calls)))throw Error(name+":"+n+":"+calls);',
    pathToFileURL(oracle.path).href, Buffer.from(enabled).toString("base64")], { encoding: "utf8", timeout: 30_000 });
  assert.equal(check.status, 0, check.stderr);
});

test("nested grid optimization preserves fractional dimensions and escape limits", async () => {
  const source = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8") + "\n" + await readFile(resolve(root, "tools/backends/batches.eli"), "utf8");
  const oracle = await javascript(source);
  const wasm = compile(source);
  for (const width of [-Infinity, -3, -0, 0, .5, 1, 1.5, 2, 2.1, 3, NaN]) {
    for (const limit of [-Infinity, -3, -0, 0, .5, 1, 1.5, 2, 2.1, 3, 17, 64, NaN]) {
      sameNumber(wasm.exports["escape-grid"](width, limit), oracle.module.escape_grid(width, limit), `${width}/${limit}`);
      for (const calls of [0, .5, 1, 2, 2.1, 3]) {
        sameNumber(wasm.exports["escape-grid-batch"](width, limit, calls), oracle.module.escape_grid_batch(width, limit, calls), `${width}/${limit}/${calls}`);
      }
    }
  }
  // This one-cell coordinate escapes after one step, so an infinite limit
  // terminates and exercises the original f64 fallback without hanging.
  sameNumber(wasm.exports["escape-grid"](1, Infinity), oracle.module.escape_grid(1, Infinity), "infinite escape limit");
});

test("compound loop expansion preserves each guard, effect and exact IEEE result", async () => {
  const source = `
    (defun compound (n x) (let ((i 0) (sum 0))
      (while (and (< i n) (< (* x x) 100))
        (setq x (+ (* x 1.25) 0.1)) (setq sum (+ sum x)) (setq i (1+ i))) sum))
    (defun guarded-effect (n) (let ((i 0) (checks 0))
      (while (and (< (setq checks (1+ checks)) n) (< i 5)) (setq i (1+ i))) (+ (* checks 10) i)))
    (defun named-cache (n) (let ((i 0) (cached-square 0))
      (while (and (< (setq cached-square (1+ cached-square)) n) (< i 5)) (setq i (1+ i))) cached-square))
    (defun nested-guards (n) (let ((i 0) (sum 0))
      (while (and (< i n) (< i 2))
        (let ((j 0)) (while (and (< j n) (< j 3)) (setq sum (+ sum j)) (setq j (1+ j))))
        (setq i (1+ i))) sum))
    (export compound guarded-effect named-cache nested-guards)`;
  const {compiler,numeric,wasm} = generations[2];
  const typed = numeric.lower_numeric_program(compiler.compile_ir_string(source,"compound.eli"));
  const saved = JSON.stringify(typed);
  const oracle = await javascript(source);
  const nodes = function* (node) { yield node; for (const child of node.children) yield* nodes(child); };
  for (const guardedUnroll of [false,true]) {
    const optimized = numeric.optimize_numeric_program(typed,{guardedUnroll});
    assert.equal(JSON.stringify(typed),saved);
    assert.equal([...nodes(optimized.functions.find(f=>f.name==="compound").body)].some(n=>n.kind==="guarded-while"),guardedUnroll);
    assert(![...nodes(optimized.functions.find(f=>f.name==="guarded-effect").body)].some(n=>n.kind==="guarded-while"),"effectful guard stays unchanged");
    assert(![...nodes(optimized.functions.find(f=>f.name==="named-cache").body)].some(n=>n.kind==="guarded-while"),"a user local name does not confer compiler-owned cache status");
    for (const loop of nodes(optimized.functions.find(f=>f.name==="nested-guards").body)) if(loop.kind==="guarded-while") {
      assert(![...nodes(loop.children[1])].some(n=>["while","remainder-while","guarded-while"].includes(n.kind)),"a guarded expansion must contain no nested loop");
    }
    const instance = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(wasm.emit_typed_numeric_wasm(optimized))));
    for (const n of [-Infinity,-0,0,.5,1,1.1,2,2.5,3,3.5,4,5,9,NaN]) {
      sameNumber(instance.exports["guarded-effect"](n),oracle.module.guarded_effect(n),"condition effects");
      sameNumber(instance.exports["named-cache"](n),oracle.module.named_cache(n),"private cache ownership");
      sameNumber(instance.exports["nested-guards"](n),oracle.module.nested_guards(n),"nested loop guards");
      for (const x of [-Infinity,-10,-1,-0,0,Number.MIN_VALUE,.123,1,9,10,Infinity,NaN]) {
        sameNumber(instance.exports.compound(n,x),oracle.module.compound(n,x),`${guardedUnroll}/${n}/${x}`);
      }
    }
  }
});

test("direct WASM rejects unsupported dynamic capabilities before optimization", () => {
  assert.throws(() => generations[2].numeric.optimize_numeric_program({ abi: "unknown" }),
    error => error.eliscriptDiagnostic.code === "ELI-B0001");
  assert.throws(() => generations[2].wasm.emit_numeric_wasm(
    generations[2].compiler.compile_ir_string("", "empty.eli")), error => {
    assert.equal(error.eliscriptDiagnostic.code, "ELI-B0001");
    assert.equal(error.eliscriptDiagnostic.location.file, "empty.eli");
    return true;
  });
  for (const source of unsupportedCases) {
    const program = generations[2].compiler.compile_ir_string(source, "unsupported.eli");
    assert.throws(() => generations[2].wasm.emit_numeric_wasm(program), error => {
      assert.equal(error.eliscriptDiagnostic.code, "ELI-B0001");
      assert.equal(error.eliscriptDiagnostic.location.file, "unsupported.eli");
      return true;
    });
  }
});

test("explicit ABI CLI writes executable JS and directly encoded WASM", async () => {
  const source = resolve(root, "tools/experiments/native-wasm/kernels.eli");
  for (const target of ["js", "wasm"]) {
    const output = resolve(directory, `cli-kernels.${target === "js" ? "mjs" : "wasm"}`);
    const command = spawnSync(process.execPath, [resolve(root, "tools/backends/compile.mjs"),
      "--abi", "numeric-f64", "--target", target, "-o", output, source], { encoding: "utf8" });
    assert.equal(command.status, 0, command.stderr);
    if (target === "wasm") {
      const bytes = await readFile(output);
      const module = new WebAssembly.Module(bytes);
      assert.deepEqual(WebAssembly.Module.imports(module), []);
      assert.equal(new WebAssembly.Instance(module).exports.recurrence(1000, .123), 641.1641723326824);
    } else {
      const oracle = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
        'const m=await import(process.argv[1]);console.log(m.recurrence(1000,.123));',
        pathToFileURL(output).href], { encoding: "utf8" });
      assert.equal(oracle.status, 0, oracle.stderr);
      assert.equal(Number(oracle.stdout), 641.1641723326824);
    }
  }
}, 60_000);

test("direct WASM performance report preserves budgets and blocks failed promotion", async () => {
  const report = JSON.parse(await readFile(resolve(root, "tools/backends/results/direct-wasm-macos-arm64.json"), "utf8"));
  await validateDirectWasmReport(report);
  const first = JSON.parse(await readFile(resolve(root, "tools/backends/results/direct-wasm-native-recheck-first-macos-arm64.json"), "utf8"));
  // Historical failures keep their original source identity and all samples.
  await validateDirectWasmReport(first, { verifySources: false });
  assert.equal(first.decision.productionPassed, false);
  const forgedFirst = structuredClone(first);forgedFirst.decision.productionPassed = true;
  await assert.rejects(validateDirectWasmReport(forgedFirst, { verifySources: false }));
  const memoryFirst = JSON.parse(await readFile(resolve(root, "tools/backends/results/direct-wasm-memory-recheck-first-macos-arm64.json"), "utf8"));
  await validateDirectWasmReport(memoryFirst, {verifySources:false});
  assert.equal(memoryFirst.decision.productionPassed,false);
  const memoryConfirmation = JSON.parse(await readFile(resolve(root, "tools/backends/results/direct-wasm-memory-recheck-confirmation-macos-arm64.json"), "utf8"));
  await validateDirectWasmReport(memoryConfirmation, {verifySources:false});
  assert.equal(memoryConfirmation.decision.productionPassed,true);
  assert.deepEqual(memoryFirst.artifacts,memoryConfirmation.artifacts);
  const forgedMemory = structuredClone(memoryFirst); forgedMemory.decision.productionPassed = true;
  await assert.rejects(validateDirectWasmReport(forgedMemory,{verifySources:false}));
  const forgedBudget = structuredClone(report);
  forgedBudget.parameters.minimumSpeedup = .5;
  await assert.rejects(validateDirectWasmReport(forgedBudget));
  const forgedSamples = structuredClone(report);
  forgedSamples.sessions[0].results[0].measurements.wasm.checksums[0] += 1;
  await assert.rejects(validateDirectWasmReport(forgedSamples));
  const failed = structuredClone(report);
  for (const session of failed.sessions) for (const result of session.results) {
    result.measurements.wasm.samplesMs = result.measurements.js.samplesMs.map(ms => ms * 2);
  }
  failed.summary = failed.summary.map(item => ({ ...item, wasmMs: item.jsMs * 2, speedup: .5 }));
  failed.decision.productionPassed = false;
  await validateDirectWasmReport(failed);
  failed.decision.productionPassed = true;
  await assert.rejects(validateDirectWasmReport(failed));
  const promotion = spawnSync("bun", [resolve(root, "tools/backends/benchmark.mjs"), "--require-production"], { encoding: "utf8" });
  assert.equal(promotion.status, report.decision.productionPassed ? 0 : 1, promotion.stderr);
});

test("memory runtime emits identical IR and WASM through three compiler generations", async () => {
  const filename = "memory-runtime.eli", source = await readFile(resolve(root, "bootstrap/runtime/memory.eli"), "utf8");
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename));
  assert.deepEqual(programs[0], programs[1]); assert.deepEqual(programs[1], programs[2]);
  const bytes = generations.map((g, i) => Uint8Array.from(g.wasm.emit_memory_wasm(programs[i])));
  assert.deepEqual(bytes[0], bytes[1]); assert.deepEqual(bytes[1], bytes[2]);
  const saved = JSON.stringify(programs[2]); generations[2].wasm.emit_memory_wasm(programs[2]);
  assert.equal(JSON.stringify(programs[2]), saved);
  const seed = resolve(directory, "memory-seed.mjs"), input = resolve(root, "bootstrap/runtime/memory.eli");
  const child = spawnSync(resolve(root, "bin/eliscript-seed"), ["--output", seed, input], {encoding: "utf8", timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(await readFile(seed, "utf8"), generations[2].compiler.compile_string(source, input));
});

const rootPressureSource = `
(defun root-pressure (heap rounds)
  (let* ((frame (frame-new heap 1)) (i 0) (one (value-number heap 0 1072693248)))
    (frame-set heap frame 0 one)
    (while (< i rounds)
      (let* ((inner (frame-new heap 2)) (two (value-number heap 0 1073741824)))
        (frame-set heap inner 0 two)
        (let ((sum (value-number-binary heap (frame-get heap frame 0) two 0)))
          (frame-set heap inner 1 sum)
          (let ((output (frame-return heap inner sum)))
            (frame-set heap frame 0 output) (heap-release heap output))))
      (setq i (1+ i)))
    (frame-return heap frame (frame-get heap frame 0))))
(defun root-pressure-trap (heap)
  (let* ((frame (frame-new heap 1)) (one (value-number heap 0 1072693248)))
    (frame-set heap frame 0 one) (load-u32 4294967295) 0))
(defun root-recursive (heap depth)
  (let* ((frame (frame-new heap 2)) (one (value-number heap 0 1072693248)))
    (frame-set heap frame 0 one)
    (if (= depth 0) (frame-return heap frame one)
      (let ((child (root-recursive heap (1- depth))))
        (frame-set heap frame 1 child) (heap-release heap child)
        (let ((sum (value-number-binary heap one child 0)))
          (frame-set heap frame 0 sum) (frame-return heap frame sum))))))
(export root-pressure root-pressure-trap root-recursive)`;
test("managed runtime has seed and three-generation IR and WASM fixed points", async () => {
  const source=(await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8"))+rootPressureSource+await readFile(resolve(root,"tests/fixtures/wasm-managed-text.eli"),"utf8")+await readFile(resolve(root,"tests/fixtures/wasm-managed-tables.eli"),"utf8");
  const filename="managed-runtime.eli",programs=generations.map(g=>g.compiler.compile_ir_string(source,filename));
  assert.deepEqual(programs[0],programs[1]);assert.deepEqual(programs[1],programs[2]);
  const bytes=generations.map((g,i)=>g.wasm.emit_memory_wasm(programs[i]));
  assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
  for (const artifact of bytes) {
    const e=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(artifact))).exports,h=e["heap-new"](12,768,768);
    e["heap-auto"](h,1);const p=e["root-pressure"](h,1000)>>>0;assert(p>0);
    assert.equal(new DataView(e.memory.buffer).getFloat64(e["value-data"](h,p,4)>>>0,true),2001);
    assert.equal(e["frame-depth"](h),0);e["heap-release"](h,p);e["heap-collect"](h);assert.equal(e["heap-live"](h),0);
    const h2=e["heap-new"](192,8192,32768);e["heap-auto"](h2,1);const recursive=e["root-recursive"](h2,64)>>>0;
    assert(recursive>0);assert.equal(new DataView(e.memory.buffer).getFloat64(e["value-data"](h2,recursive,4)>>>0,true),65);
    assert.equal(e["frame-depth"](h2),0);e["heap-release"](h2,recursive);e["heap-collect"](h2);assert.equal(e["heap-live"](h2),0);
    const h3=e["heap-new"](24,2048,2048),units=[0xfeff,0x4e2d,0xd83d,0xde00,0,0xd800,97];
    const input=e["value-string"](h3,units.length)>>>0;assert(input>0);
    for(let i=0;i<units.length;i++)assert.equal(e["value-unit-set"](h3,input,i,units[i]),1);
    e["value-seal"](h3,input);e["heap-auto"](h3,1);const output=e["text-pipeline"](h3,input,1000)>>>0;assert(output>0);
    assert.deepEqual(Array.from({length:7},(_,i)=>e["value-unit-get"](h3,output,i)),[0xfeff,0x4e2d,0xd83d,0xde00,0,0xfffd,97]);
    assert.equal(e["frame-depth"](h3),0);assert(e["heap-collections"](h3)>5000);
    e["heap-release"](h3,output);e["heap-collect"](h3);assert.equal(e["heap-live"](h3),0);
    const h4=e["heap-new"](12,768,768);e["heap-auto"](h4,1);const key=e["key-pressure"](h4,1000)>>>0;assert(key>0);
    assert.equal(e["value-key-hash"](h4,key)>>>0,1490037359);assert.equal(e["frame-depth"](h4),0);assert(e["heap-collections"](h4)>=2000);
    e["heap-release"](h4,key);e["heap-collect"](h4);assert.equal(e["heap-live"](h4),0);
    const h5=e["heap-new"](96,8192,8192);e["heap-auto"](h5,1);const table=e["table-pressure"](h5,1000)>>>0;assert(table>0);
    assert.equal(e["value-table-size"](h5,table),32);assert.equal(e["frame-depth"](h5),0);assert(e["heap-collections"](h5)>=1000);
    e["heap-release"](h5,table);e["heap-collect"](h5);assert.equal(e["heap-live"](h5),0);
  }
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(bytes[2]))),[]);
  const saved=JSON.stringify(programs[2]);generations[2].wasm.emit_memory_wasm(programs[2]);assert.equal(JSON.stringify(programs[2]),saved);
  const input=resolve(directory,filename),output=resolve(directory,"managed-seed.mjs");await writeFile(input,source);
  const child=spawnSync(resolve(root,"bin/eliscript-seed"),["--output",output,input],{encoding:"utf8",timeout:30000});
  assert.equal(child.status,0,child.stderr);assert.equal(await readFile(output,"utf8"),generations[2].compiler.compile_string(source,input));
});

test("ordinary managed control has Seed and three-generation IR, descriptor and WASM fixed points",async()=>{
  const source=await readFile(resolve(root,"tests/fixtures/wasm-managed-control.eli"),"utf8"),runtime=await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8");
  const programs=generations.map(g=>g.compiler.compile_ir_string(source,"ordinary-control.eli")),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,"runtime.eli"));
  assert.deepEqual(programs[0],programs[1]);assert.deepEqual(programs[1],programs[2]);assert.deepEqual(runtimes[0],runtimes[2]);
  const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
  const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
  const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
  for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const x=a.string('中😀\ud800');for(let i=0;i<100;i++){const result=a.invoke('call-choose',[x,x]);assert.equal(a.readString(result),'中😀\ud800');a.release(result);}a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});

describe("browser compiler backends", () => {
  beforeAll(async () => {
    // Compiler bundling and browser process startup are fixture preparation.
    // Keep every semantic test's existing timeout and use a fresh context for
    // each evaluation; performance benchmarks retain their separate policy.
    const entry = resolve(directory, "browser-entry.mjs");
    await writeFile(entry, `export {compile_ir_string,emit_ir_string} from ${JSON.stringify(resolve(directory, "g3/bootstrap/compiler.mjs"))};\nexport {emit_numeric_wasm,emit_memory_wasm} from ${JSON.stringify(resolve(directory, "g3/backends/wasm.mjs"))};\nexport {instantiateMemoryRuntime} from ${JSON.stringify(resolve(root, "tools/backends/memory-runtime.mjs"))};\nexport {instantiateManagedRuntime} from ${JSON.stringify(resolve(root, "tools/backends/managed-runtime.mjs"))};\nexport {emit_native_numeric_object,emit_native_numeric_library,emit_native_numeric_executable} from ${JSON.stringify(resolve(directory, "g3/backends/native.mjs"))};`);
    await writeFile(entry,(await readFile(entry,'utf8'))+`\nexport {emit_managed_wasm} from ${JSON.stringify(resolve(directory,'g3/backends/managed.mjs'))};`);
    const build = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm" });
    assert(build.success);
    browserBundle = await build.outputs[0].text();
    browserProcess = await browsers[browserName].launch();
    // launch establishes the transport before the first renderer is ready.
    // Prepare that host process with no compiler, WASM or benchmark workload;
    // every semantic evaluation still creates its own isolated context and
    // keeps the original test timeout.
    const preparation=await browserProcess.newContext();
    try {
      const page=await preparation.newPage();
      assert.equal(await page.evaluate(()=>{globalThis.eliscriptPreparation=true;return 1;}),1);
      console.log(`browser renderer prepared: ${browserName} ${browserProcess.version()}`);
    } finally {await preparation.close();}
  }, 120_000);
  afterAll(async () => { if (browserProcess) await browserProcess.close(); });

  async function evaluateBrowser(evaluate, data) {
    const context = await browserProcess.newContext();
    try {
      const page = await context.newPage();
      page.on("console", message => {
        if (message.text().startsWith("eliscript browser phase:")) console.log(message.text());
      });
      const result = await page.evaluate(evaluate, { bundle: browserBundle, ...data });
      console.log(`browser engine verified: ${browserName} ${browserProcess.version()}`);
      return result;
    } finally { await context.close(); }
  }

  test("browser evaluations isolate state and recover after rejection", async () => {
    await assert.rejects(evaluateBrowser(() => {
      if(typeof globalThis.eliscriptPreparation!=="undefined")throw Error("preparation state escaped");
      globalThis.eliscriptFixtureMutation = "must not escape";
      throw Error("isolated evaluation failure");
    }, {}), /isolated evaluation failure/);
    assert.equal(await evaluateBrowser(() => typeof globalThis.eliscriptFixtureMutation, {}), "undefined");
  });

  test("browser JS compiler emits the identical WASM bytes without an external backend", async () => {
    const source = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8") + "\n" + optimizationCases + "\n" + parallelCases;
    const result = await evaluateBrowser(async ({ bundle, source }) => {
      const url = URL.createObjectURL(new Blob([bundle], { type: "text/javascript" }));
      try {
        const compiler = await import(url);
        const program = compiler.compile_ir_string(source, "browser.eli");
        // Keep the JS oracle independent of any WASM-side IR transformation,
        // while parsing the source only once.
        const javascript = compiler.emit_ir_string(structuredClone(program));
        const bytes = compiler.emit_numeric_wasm(program);
        const module = new WebAssembly.Module(Uint8Array.from(bytes));
        const instance = new WebAssembly.Instance(module);
        const jsUrl = URL.createObjectURL(new Blob([javascript], { type: "text/javascript" }));
        try {
          const js = await import(jsUrl);
          for (const name of ["bounded", "fractional", "negative-zero", "mutable-bound", "fractional-step", "conditional-set", "cyclic-truth", "non-power-cycle", "effects", "isolated", "squares", "squares-or", "condition-effects", "negated-condition"]) {
            for (const x of [-Infinity, -7, -0, 0, .5, 1, 1.1, 9, 129, 257, Infinity, NaN]) {
              if (name === "fractional" && x === Infinity) continue;
              if (!Object.is(instance.exports[name](x), js[name.replaceAll("-", "_")](x))) throw Error(name + ":" + x);
            }
          }
          for (const name of ["scalar-batch", "indexed-batch", "moving-batch", "dependent-batch"]) {
            for (const n of [0, .5, 1, 1.1, 2, 2.5, 9, NaN]) for (const seed of [-0, .123, NaN]) for (const calls of [.5, 1, 2, 2.1, 3, 5, NaN]) {
              if (!Object.is(instance.exports[name](n, seed, calls), js[name.replaceAll("-", "_")](n, seed, calls))) throw Error(name + ":" + n + ":" + calls);
            }
          }
          for (const width of [-0, 0, .5, 1, 1.5, 2.1, 3, NaN]) for (const limit of [-0, 0, .5, 1, 1.5, 2.1, 17, NaN]) {
            if (!Object.is(instance.exports["escape-grid"](width, limit), js.escape_grid(width, limit))) throw Error("grid:" + width + ":" + limit);
          }
        } finally { URL.revokeObjectURL(jsUrl); }
        return { bytes, result: instance.exports.recurrence(1000, .123), imports: WebAssembly.Module.imports(module) };
      } finally { URL.revokeObjectURL(url); }
    }, { source });
    assert.deepEqual(Uint8Array.from(result.bytes), compile(source, "browser.eli").bytes);
    assert.equal(result.result, 641.1641723326824);
    assert.deepEqual(result.imports, []);
  });

  test("browser WASM preserves subnormals, signed zero, NaN and integer boundaries against JS", async () => {
    const result = await evaluateBrowser(async ({ bundle, source }) => {
      const compilerUrl = URL.createObjectURL(new Blob([bundle], { type: "text/javascript" }));
      let jsUrl;
      try {
        const compiler = await import(compilerUrl);
        const program = compiler.compile_ir_string(source, "browser-ieee.eli");
        const javascript = compiler.emit_ir_string(structuredClone(program));
        const bytes = compiler.emit_numeric_wasm(program);
        const module = new WebAssembly.Module(Uint8Array.from(bytes));
        const wasm = new WebAssembly.Instance(module).exports;
        jsUrl = URL.createObjectURL(new Blob([javascript], { type: "text/javascript" }));
        const js = await import(jsUrl);
        const edges = [-Infinity, -Number.MAX_VALUE, -2147483649, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, .5, 2147483647, 2147483648, 4294967295, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity, NaN];
        let checked = 0;
        for (const name of ["ieee-add", "ieee-multiply", "ieee-divide"]) for (const x of edges) for (const y of edges) {
          if (!Object.is(wasm[name](x, y), js[name.replaceAll("-", "_")](x, y))) throw Error(name + ":" + x + ":" + y);
          checked += 1;
        }
        for (const name of ["ieee-ordered", "ieee-zero", "ieee-truth"]) for (const x of edges) {
          if (!Object.is(wasm[name](x), js[name.replaceAll("-", "_")](x))) throw Error(name + ":" + x);
          checked += 1;
        }
        return { bytes, checked, imports: WebAssembly.Module.imports(module) };
      } finally {
        URL.revokeObjectURL(compilerUrl);
        if (jsUrl) URL.revokeObjectURL(jsUrl);
      }
    }, { source: ieeeCases });
    assert.equal(result.checked, 720);
    assert.deepEqual(Uint8Array.from(result.bytes), compile(ieeeCases, "browser-ieee.eli").bytes);
    assert.deepEqual(result.imports, []);
  });

  test("browser WASM rejects the complete unsupported syntax corpus with identical diagnostics", async () => {
    const diagnostics = await evaluateBrowser(async ({ bundle, unsupportedCases }) => {
      const url = URL.createObjectURL(new Blob([bundle], { type: "text/javascript" }));
      try {
        const compiler = await import(url);
        return unsupportedCases.map(source => {
          try { compiler.emit_numeric_wasm(compiler.compile_ir_string(source, "unsupported.eli")); }
          catch (error) { return error.eliscriptDiagnostic; }
          throw Error("unsupported source was accepted");
        });
      } finally { URL.revokeObjectURL(url); }
    }, { unsupportedCases });
    for (const diagnostic of diagnostics) {
      assert.equal(diagnostic.code, "ELI-B0001");
      assert.equal(diagnostic.location.file, "unsupported.eli");
    }
    assert.deepEqual(diagnostics, unsupportedCases.map(source => {
      try { compile(source, "unsupported.eli"); }
      catch (error) { return error.eliscriptDiagnostic; }
      throw Error("unsupported source was accepted");
    }));
  });

  test("browser engine selection rejects unknown names instead of falling back", () => {
    const child = spawnSync(process.execPath, ["test", fileURLToPath(import.meta.url), "--test-name-pattern", "browser JS compiler"], {
      env: { ...process.env, ELISCRIPT_TEST_BROWSER: "unknown-engine" }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /unknown ELISCRIPT_TEST_BROWSER: unknown-engine/);
  });

  test("browser compiler emits identical signed native images without external tools", async () => {
    const source="(defun 中文 (n) (if (<= n 1) 1 (* n (中文 (- n 1))))) (defun entry () (中文 6)) (export 中文 entry)";
    const result=await evaluateBrowser(async ({bundle,source}) => {
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));
      try {
        const c=await import(url),program=c.compile_ir_string(source,"browser-native.eli");
        return [c.emit_native_numeric_object(program,"arm64-macos"),
          c.emit_native_numeric_library(program,"arm64-macos"),
          c.emit_native_numeric_executable(program,"arm64-macos","entry")];
      } finally {URL.revokeObjectURL(url);}
    },{source});
    const c=generations[2],program=c.compiler.compile_ir_string(source,"browser-native.eli");
    assert.deepEqual(result,[c.native.emit_native_numeric_object(program,"arm64-macos"),
      c.native.emit_native_numeric_library(program,"arm64-macos"),c.native.emit_native_numeric_executable(program,"arm64-macos","entry")]);
  });
  test("browser owned-memory runtime compiles and checks codecs, growth and isolated handles", async () => {
    const source = await readFile(resolve(root, "bootstrap/runtime/memory.eli"), "utf8")+`
      (defun bounds-read8 (p) (load-u8 p)) (defun bounds-read16 (p) (load-u16 p))
      (defun bounds-read32 (p) (load-u32 p)) (defun bounds-read64 (p) (load-f64 p) 1)
      (defun bounds-write8 (p) (store-u8 p 42)) (defun bounds-write16 (p) (store-u16 p 42))
      (defun bounds-write32 (p) (store-u32 p 42)) (defun bounds-write64 (p) (store-f64 p (load-f64 24)))
      (export bounds-read8 bounds-read16 bounds-read32 bounds-read64 bounds-write8 bounds-write16 bounds-write32 bounds-write64)`;
    const result = await evaluateBrowser(async ({bundle, source}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: "text/javascript"}));
      const check = (condition, label) => { if (!condition) throw Error(label); };
      try {
        const c = await import(url), ir = c.compile_ir_string(source, "browser-memory.eli");
        const bytes = Uint8Array.from(c.emit_memory_wasm(ir, {maximumPages: 8}));
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, "imports");
        const raw=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
        for(const [width,suffix] of [[1,8],[2,16],[4,32],[8,64]]) {
          const read=raw[`bounds-read${suffix}`],write=raw[`bounds-write${suffix}`],last=65536-width;
          check(write(last)===0&&read(last)===(width===8?1:42),"last in-bounds access");
          for(const address of [last+1,65536,0xfffffff8,0xfffffffc,0xffffffff])for(const access of [read,write]) {
            try{access(address);throw Error("bounds accepted");}catch(error){check(error instanceof WebAssembly.RuntimeError,"bounds trap class");}
          }
        }
        const a = c.instantiateMemoryRuntime(bytes), b = c.instantiateMemoryRuntime(bytes);
        const text = "中文😀\ud800\0", h = a.string(text), p = a.encode(h);
        check([...a.bytes(p)].join() === [...new TextEncoder().encode(text)].join(), "encode");
        check(a.text(a.decode(p)) === "中文😀�\0", "decode");
        try { b.bytes(p); throw Error("cross-instance accepted"); }
        catch (e) { check(e.eliscriptDiagnostic?.code === "ELI-RT0001", "brand"); }
        const large = Uint8Array.from({length: 70000}, (_,i) => i & 255), buffer = a.buffer(large);
        a.reserve(buffer, 150000); check([...a.bytes(buffer)].join() === [...large].join(), "growth contents");
        const words = a.record([0, 0xffffffff, 42]); check([...a.words(words)].join() === "0,4294967295,42", "words");
        let state = 0x51ea63;
        const next = () => {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0;};
        for (let round = 0; round < 128; round++) {
          const input = Uint8Array.from({length: next() % 64}, () => next() & 255), handle = a.buffer(input);
          for (const preserveBOM of [false,true])
            check(a.text(a.decode(handle,{preserveBOM})) === new TextDecoder("utf-8", {ignoreBOM:preserveBOM}).decode(input), "random decode");
        }
        a.retire(); try {a.bytes(buffer); throw Error("stale accepted");}
        catch(e) {check(e.eliscriptDiagnostic?.code === "ELI-RT0001", "retire");}
        return [...bytes];
      } finally { URL.revokeObjectURL(url); }
    }, {source});
    assert.deepEqual(result, generations[2].wasm.emit_memory_wasm(
      generations[2].compiler.compile_ir_string(source,"browser-memory.eli"),{maximumPages:8}));
  });

  test("browser managed heap reclaims cycles and preserves IEEE values and growth",async()=>{
    const source=await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8");
    const result=await evaluateBrowser(async({bundle,source})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));
      const check=(ok,label)=>{if(!ok)throw Error(label);};
      try {
        const c=await import(url),ir=c.compile_ir_string(source,"browser-managed.eli");
        const bytes=Uint8Array.from(c.emit_memory_wasm(ir,{maximumPages:16}));
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,"imports");
        const a=c.instantiateManagedRuntime(bytes),b=c.instantiateManagedRuntime(bytes);
        for(const x of [0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE])
          for(const y of [0,-0,NaN,Infinity,Number.MIN_VALUE]) {
            const l=a.number(x),r=a.number(y);
            for(const [op,expected]of[[0,x+y],[1,x-y],[2,x*y],[3,x/y]]) {
              const z=a.binary(l,r,op);check(Object.is(a.readNumber(z),expected),"IEEE");a.release(z);
            }
            a.release(l);a.release(r);check(a.collect()===6,"Number reclamation");
          }
        const prefix=a.stats().usedBytes;
        for(let i=0;i<512;i++) {
          const x=a.array([null]),y=a.record([x]);a.set(x,0,y);
          a.release(x);a.release(y);check(a.collect()===2,"cycles");check(a.stats().usedBytes===prefix,"pool reuse");
          try {a.length(x);throw Error("stale accepted");}catch(e){check(e.eliscriptDiagnostic?.code==="ELI-RT0001","generation");}
        }
        const text="\ud800中文😀\udc00",str=a.string(text);check(a.readString(str)===text,"UTF16");
        const buffer=a.bytes([0,255]);a.resize(buffer,70000);check(a.readBytes(buffer)[1]===255,"growth");
        const copy=a.readBytes(buffer);copy[1]=0;check(a.readBytes(buffer)[1]===255,"owned copy");
        try {b.length(str);throw Error("foreign accepted");}catch(e){check(e.eliscriptDiagnostic?.code==="ELI-RT0001","brand");}
        a.release(str);a.release(buffer);check(a.collect()===2,"roots");return [...bytes];
      } finally {URL.revokeObjectURL(url);}
    },{source});
    assert.deepEqual(result,generations[2].wasm.emit_memory_wasm(generations[2].compiler.compile_ir_string(source,"browser-managed.eli"),{maximumPages:16}));
  });

  test("browser root safepoints retain WASM locals, transfer ownership and unwind after traps",async()=>{
    const source=(await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8"))+rootPressureSource;
    const result=await evaluateBrowser(async({bundle,source})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));
      const check=(ok,label)=>{if(!ok)throw Error(label);};
      try {
        const c=await import(url),bytes=Uint8Array.from(c.emit_memory_wasm(c.compile_ir_string(source,"browser-roots.eli"),{maximumPages:8}));
        const module=new WebAssembly.Module(bytes);check(WebAssembly.Module.imports(module).length===0,"imports");
        const e=new WebAssembly.Instance(module).exports,h=e["heap-new"](12,768,768);e["heap-auto"](h,1);
        console.log("eliscript browser phase: root loop");
        const p=e["root-pressure"](h,1000)>>>0;check(p>0,"result");
        check(new DataView(e.memory.buffer).getFloat64(e["value-data"](h,p,4)>>>0,true)===2001,"live Number");
        check(e["frame-depth"](h)===0&&e["heap-collections"](h)>3000,"automatic GC");
        e["heap-release"](h,p);e["heap-collect"](h);check(e["heap-live"](h)===0,"release");
        console.log("eliscript browser phase: root trap");
        try{e["root-pressure-trap"](h);throw Error("trap missing");}catch(error){check(error instanceof WebAssembly.RuntimeError,"trap class");}
        check(e["frame-depth"](h)===1,"trap frame");e["frame-unwind"](h,0);check(e["heap-collect"](h)===2,"unwind");
        console.log("eliscript browser phase: root recursion");
        const h2=e["heap-new"](192,8192,32768);e["heap-auto"](h2,1);const recursive=e["root-recursive"](h2,64)>>>0;
        check(recursive>0,"recursive result");check(new DataView(e.memory.buffer).getFloat64(e["value-data"](h2,recursive,4)>>>0,true)===65,"recursive value");
        check(e["frame-depth"](h2)===0,"recursive frames");e["heap-release"](h2,recursive);e["heap-collect"](h2);check(e["heap-live"](h2)===0,"recursive cleanup");
        console.log("eliscript browser phase: root bridge");
        const a=c.instantiateManagedRuntime(bytes),b=c.instantiateManagedRuntime(bytes);a.auto(1);
        const frame=a.frame(1),n=a.number(NaN);a.frameSet(frame,0,n);a.release(n);
        for(let i=0;i<100;i++){const temporary=a.number(i);a.release(temporary);}
        const value=a.frameGet(frame,0);check(Number.isNaN(a.readNumber(value)),"bridge root");
        const escaped=a.frameReturn(frame,value);a.release(value);a.collect();check(a.live()===1,"return roots");
        try{b.frameGet(frame,0);throw Error("foreign accepted");}catch(error){check(error.eliscriptDiagnostic?.code==="ELI-RT0001","foreign frame");}
        a.release(escaped);check(a.collect()===1&&a.live()===0,"root ownership");
        for(const kind of ["array","record"]) {
          const child=a.number(-0);a.release(child);const input=[child,child];
          Object.defineProperty(input,1,{get(){const temporary=a.number(7);a.release(temporary);return child;}});
          const owner=a[kind](input),output=a.get(owner,1);check(Object.is(a.readNumber(output),-0),"borrowed operand");
          a.release(output);a.release(owner);a.collect();check(a.live()===0,"borrowed roots cleanup");
        }
        return [...bytes];
      }finally{URL.revokeObjectURL(url);}
    },{source});
    assert.deepEqual(result,generations[2].wasm.emit_memory_wasm(generations[2].compiler.compile_ir_string(source,"browser-roots.eli"),{maximumPages:8}));
  });

  test("browser managed text pipelines retain UTF16, codec semantics and roots without host callbacks",async()=>{
    const source=await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8")+await readFile(resolve(root,"tests/fixtures/wasm-managed-text.eli"),"utf8");
    const result=await evaluateBrowser(async({bundle,source})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));
      const check=(ok,label)=>{if(!ok)throw Error(label);};
      try {
        const c=await import(url),bytes=Uint8Array.from(c.emit_memory_wasm(c.compile_ir_string(source,"browser-text.eli"),{maximumPages:8}));
        const module=new WebAssembly.Module(bytes);check(WebAssembly.Module.imports(module).length===0,"imports");
        const e=new WebAssembly.Instance(module).exports,h=e["heap-new"](24,2048,2048),units=[0xfeff,0x4e2d,0xd83d,0xde00,0,0xd800,97];
        const input=e["value-string"](h,units.length)>>>0;check(input>0,"input");
        for(let i=0;i<units.length;i++)check(e["value-unit-set"](h,input,i,units[i])===1,"unit");
        e["value-seal"](h,input);e["heap-auto"](h,1);const output=e["text-pipeline"](h,input,1000)>>>0;
        check(output>0&&e["value-length"](h,output)===7,"result");
        for(const [i,u] of [0xfeff,0x4e2d,0xd83d,0xde00,0,0xfffd,97].entries())check(e["value-unit-get"](h,output,i)===u,"pipeline");
        check(e["frame-depth"](h)===0&&e["heap-collections"](h)>5000,"safepoints");
        e["heap-release"](h,output);e["heap-collect"](h);check(e["heap-live"](h)===0,"cleanup");
        const keyHeap=e["heap-new"](12,768,768);e["heap-auto"](keyHeap,1);const key=e["key-pressure"](keyHeap,1000)>>>0;
        check(key>0&&e["value-key-hash"](keyHeap,key)>>>0===1490037359,"whole key pipeline");
        check(e["frame-depth"](keyHeap)===0&&e["heap-collections"](keyHeap)>=2000,"key safepoints");
        e["heap-release"](keyHeap,key);e["heap-collect"](keyHeap);check(e["heap-live"](keyHeap)===0,"key cleanup");
        const a=c.instantiateManagedRuntime(bytes),b=c.instantiateManagedRuntime(bytes);a.auto(1);
        let state=0x346f195;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
        for(let round=0;round<128;round++) {
          const text=Array.from({length:next()%48},()=>String.fromCharCode(next()&65535)).join(''),value=a.string(text);
          const start=next()%(text.length+1),end=start+next()%(text.length-start+1),slice=a.sliceString(value,start,end),joined=a.concatStrings(value,slice);
          check(a.readString(slice)===text.slice(start,end)&&a.readString(joined)===text+text.slice(start,end),"UTF16");
          check(a.findString(value,slice,start)===text.indexOf(text.slice(start,end),start),"search");
          check(a.compareStrings(value,slice)===(text===text.slice(start,end)?0:text<text.slice(start,end)?-1:1),"ordering");
          for(let i=0;i<text.length;i++)check(a.codePoint(value,i)===text.codePointAt(i),"code point");
          const encoded=a.encodeUtf8(value),expected=new TextEncoder().encode(text);
          check(JSON.stringify([...a.readBytes(encoded)])===JSON.stringify([...expected]),"encoding");
          const decoded=a.decodeUtf8(encoded,{strict:true,preserveBOM:true});check(a.readString(decoded)===new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(expected),"decoding");
          for(const item of [value,slice,joined,encoded,decoded])a.release(item);a.collect();check(a.live()===0,"random roots");
        }
        for(const input of [[0xff],[0xe0,0x80,0x80],[0xf4,0x90,0x80,0x80],[0xe2,0x82],[0xef,0xbb,0xbf,65]]) {
          const value=a.bytes(input);
          for(const preserveBOM of [false,true]) {
            const decoded=a.decodeUtf8(value,{preserveBOM});check(a.readString(decoded)===new TextDecoder('utf-8',{ignoreBOM:preserveBOM}).decode(Uint8Array.from(input)),"replacement and BOM");a.release(decoded);
          }
          if(input[0]!==0xef)try{a.decodeUtf8(value,{strict:true});throw Error("invalid accepted");}catch(error){check(error.eliscriptDiagnostic?.code==="ELI-RT0004","strict");}
          a.release(value);a.collect();check(a.live()===0,"codec roots");
        }
        const lone=a.string('\ud800');try{a.encodeUtf8(lone,{strict:true});throw Error("surrogate accepted");}catch(error){check(error.eliscriptDiagnostic?.code==="ELI-RT0005","surrogate");}
        const copied=a.string('\ud800');check(a.keyEqual(lone,copied)&&a.keyHash(lone)===a.keyHash(copied),"string keys");a.release(copied);
        const minusZero=a.number(-0),zero=a.number(0),nan=a.number(NaN),otherNan=a.number(NaN);
        check(a.keyEqual(minusZero,zero)&&a.keyHash(minusZero)===a.keyHash(zero),"zero keys");
        check(a.keyEqual(nan,otherNan)&&a.keyHash(nan)===1490037359&&a.compare(nan,otherNan,0)===false,"NaN key equality");
        check(!a.keyEqual(null,false)&&!a.keyEqual(undefined,null),"immediate key categories");
        for(const value of [minusZero,zero,nan,otherNan])a.release(value);
        try{b.sliceString(lone,0,1);throw Error("foreign accepted");}catch(error){check(error.eliscriptDiagnostic?.code==="ELI-RT0001","brand");}
        a.release(lone);a.collect();check(a.live()===0,"final roots");return [...bytes];
      }finally{URL.revokeObjectURL(url);}
    },{source});
    assert.deepEqual(result,generations[2].wasm.emit_memory_wasm(generations[2].compiler.compile_ir_string(source,"browser-text.eli"),{maximumPages:8}));
  });

  test("browser managed Map and Set preserve order, live iteration, cycles and bounded WASM pressure",async()=>{
    const source=await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8")+await readFile(resolve(root,"tests/fixtures/wasm-managed-tables.eli"),"utf8");
    const result=await evaluateBrowser(async({bundle,source})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));
      try {
        const c=await import(url),bytes=Uint8Array.from(c.emit_memory_wasm(c.compile_ir_string(source,"browser-tables.eli"),{maximumPages:8}));
        const check=(value,message)=>{if(!value)throw Error(message);},module=new WebAssembly.Module(bytes);check(WebAssembly.Module.imports(module).length===0,"imports");
        const e=new WebAssembly.Instance(module).exports,h=e["heap-new"](96,8192,8192);e["heap-auto"](h,1);
        const table=e["table-pressure"](h,1000)>>>0;check(table>0&&e["value-table-size"](h,table)===32,"whole table pressure");
        check(e["frame-depth"](h)===0&&e["heap-collections"](h)>=1000,"safepoints");e["heap-release"](h,table);e["heap-collect"](h);check(e["heap-live"](h)===0,"whole cleanup");
        const a=c.instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:16384,maxBytes:262144}),b=c.instantiateManagedRuntime(bytes);a.auto(1);
        const map=a.map(),set=a.setTable(),minus=a.number(-0),zero=a.number(0),nan=a.number(NaN),other=a.number(NaN);
        a.tableSet(map,minus,minus);a.tableSet(map,zero,minus);a.tableAdd(set,nan);a.tableAdd(set,other);
        check(a.tableSize(map)===1&&a.tableSize(set)===1,"SameValueZero");const initial=a.tableIterator(map),step=a.iteratorNext(initial);
        check(!step.done&&Object.is(a.readNumber(step.key),0)&&Object.is(a.readNumber(step.value),-0),"zero key and value");a.release(step.key);a.release(step.value);a.closeIterator(initial);a.release(initial);
        a.tableClear(map);a.tableClear(set);
        const keys=Array.from({length:24},(_,i)=>a.string(`中😀\ud800\0${i}`));keys.push(a.string("collision-69051"),a.string("collision-123577"));
        const values=[null,false,true,undefined,minus,zero,nan],plain=[null,false,true,undefined,-0,0,NaN];
        const ref=new Map(),referenceSet=new Set();let state=0x1877af1;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
        for(let i=0;i<384;i++) {
          const k=next()%keys.length,v=next()%values.length,op=next()%5,name=a.readString(keys[k]);
          if(op<3){a.tableSet(map,keys[k],values[v]);a.tableAdd(set,keys[k]);ref.set(name,plain[v]);referenceSet.add(name);}
          else if(op===3){check(a.tableDelete(map,keys[k])===ref.delete(name),"delete");check(a.tableDelete(set,keys[k])===referenceSet.delete(name),"Set delete");}
          else {const got=a.tableGet(map,keys[k]);check(Object.is(got&&typeof got==='object'?a.readNumber(got):got,ref.get(name)),"get");a.release(got);}
          a.collect();check(a.tableSize(map)===ref.size&&a.tableSize(set)===referenceSet.size,"size");
          if(i%16===0) {
            const it=a.tableIterator(map),seen=[];for(;;){const s=a.iteratorNext(it);if(s.done)break;seen.push([a.readString(s.key),s.value&&typeof s.value==='object'?a.readNumber(s.value):s.value]);a.release(s.key);a.release(s.value);}
            a.release(it);const expected=[...ref];check(seen.length===expected.length&&seen.every(([k,v],j)=>k===expected[j][0]&&Object.is(v,expected[j][1])),"order");
          }
        }
        a.tableClear(map);a.tableClear(set);a.tableSet(map,keys[0],false);a.tableSet(map,keys[1],true);
        const iterator=a.tableIterator(map),first=a.iteratorNext(iterator);check(a.keyEqual(first.key,keys[0]),"first");a.release(first.key);a.release(first.value);
        a.tableDelete(map,keys[1]);a.tableSet(map,keys[2],undefined);a.tableClear(map);a.tableSet(map,keys[3],null);
        const second=a.iteratorNext(iterator);check(!second.done&&a.keyEqual(second.key,keys[3])&&second.value===null,"live clear/reinsert");a.release(second.key);a.release(second.value);
        check(a.iteratorNext(iterator).done,"done");a.tableSet(map,keys[4],false);check(a.iteratorNext(iterator).done,"permanent done");a.release(iterator);
        try{b.tableHas(map,keys[0]);throw Error("foreign accepted");}catch(error){check(error.eliscriptDiagnostic?.code==="ELI-RT0001","brands");}
        a.tableClear(map);a.tableSet(map,map,set);a.tableAdd(set,map);const alias=a.tableGet(map,map);check(a.keyEqual(alias,set),"cycles");a.release(alias);
        for(const value of [...keys,minus,zero,nan,other,map,set])a.release(value);a.collect();check(a.live()===0,"cyclic cleanup");return [...bytes];
      }finally{URL.revokeObjectURL(url);}
    },{source});
    assert.deepEqual(result,generations[2].wasm.emit_memory_wasm(generations[2].compiler.compile_ir_string(source,"browser-tables.eli"),{maximumPages:8}));
  });

  test("browser ordinary managed control executes boxed values with automatic roots and source-equivalent semantics",async()=>{
    const source=await readFile(resolve(root,"tests/fixtures/wasm-managed-control.eli"),"utf8"),runtime=await readFile(resolve(root,"bootstrap/runtime/memory.eli"),"utf8");
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:"text/javascript"}));let jsUrl;
      try {
        const c=await import(url),program=c.compile_ir_string(source,"browser-control.eli"),rt=c.compile_ir_string(runtime,"runtime.eli");
        const bytes=Uint8Array.from(c.emit_managed_wasm(program,rt,{maximumPages:16})),module=new WebAssembly.Module(bytes);
        const check=(v,m)=>{if(!v)throw Error(m);};check(WebAssembly.Module.imports(module).length===0,"imports");
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(program)],{type:"text/javascript"}));const ref=await import(jsUrl);
        const a=c.instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:8192,maxBytes:65536});a.auto(1);
        const box=v=>typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v,read=v=>v&&typeof v==='object'?v.kind===4?a.readNumber(v):a.readString(v):v;
        const values=[null,false,true,undefined,0,-0,NaN,Infinity,Number.MIN_VALUE,'','中😀\ud800'];
        for(const value of values){const v=box(value);for(const name of['truth','invert','once','recurse','optional-result','unless-result']){const out=a.invoke(name,[v]);check(Object.is(read(out),ref[name.replaceAll('-','_')](value)),name);a.release(out);}a.release(v);a.collect();check(a.live()===0&&a.stats().frameDepth===0,"cleanup");}
        for(const left of values)for(const right of values){const x=box(left),y=box(right);for(const name of['both','either','parallel','sequential','effects','clauses','call-choose']){const out=a.invoke(name,[x,y]);check(Object.is(read(out),ref[name.replaceAll('-','_')](left,right)),name);a.release(out);}a.release(x);a.release(y);a.collect();check(a.live()===0,"pair roots");}
        const object=a.map(),text=a.string('😀\ud800');for(let i=0;i<1000;i++){const out=a.invoke('call-choose',[object,text]);check(a.keyEqual(out,text),"opaque argument roots");a.release(out);}a.release(object);a.release(text);a.collect();check(a.live()===0&&a.stats().frameDepth===0,"final roots");
        return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,"browser-control.eli"),generations[2].compiler.compile_ir_string(runtime,"runtime.eli"),{maximumPages:16}));
  });
});
