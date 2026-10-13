import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { backendModules, buildBackends, root } from "../tools/backends/build.mjs";
import { validateDirectWasmReport } from "../tools/backends/benchmark.mjs";

let directory, generations;
const sameNumber = (actual, expected, label) => assert(Object.is(actual, expected), `${label}: ${actual} != ${expected}`);

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
  const node = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e",
    'import{readFile}from"node:fs/promises";const c=await import(process.argv[1]);const w=await import(process.argv[2]);const s=await readFile(process.argv[3],"utf8");console.log(Buffer.from(w.emit_numeric_wasm(c.compile_ir_string(s,"kernels.eli"))).toString("base64"));',
    pathToFileURL(resolve(directory, "g3/bootstrap/compiler.mjs")).href,
    pathToFileURL(resolve(directory, "g3/backends/wasm.mjs")).href,
    resolve(root, "tools/experiments/native-wasm/kernels.eli")], { encoding: "utf8" });
  assert.equal(node.status, 0, node.stderr);
  assert.deepEqual(Buffer.from(node.stdout.trim(), "base64"), Buffer.from(artifacts[2].bytes));
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

test("direct WASM rejects unsupported dynamic capabilities before optimization", () => {
  assert.throws(() => generations[2].wasm.emit_numeric_wasm(
    generations[2].compiler.compile_ir_string("", "empty.eli")), error => {
    assert.equal(error.eliscriptDiagnostic.code, "ELI-B0001");
    assert.equal(error.eliscriptDiagnostic.location.file, "empty.eli");
    return true;
  });
  for (const source of [
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
  ]) {
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

test("browser JS compiler emits the identical WASM bytes without an external backend", async () => {
  const entry = resolve(directory, "browser-entry.mjs");
  await writeFile(entry, `export {compile_ir_string} from ${JSON.stringify(resolve(directory, "g3/bootstrap/compiler.mjs"))};\nexport {emit_numeric_wasm} from ${JSON.stringify(resolve(directory, "g3/backends/wasm.mjs"))};`);
  const build = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm" });
  assert(build.success);
  const bundle = await build.outputs[0].text();
  const source = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ bundle, source }) => {
      const url = URL.createObjectURL(new Blob([bundle], { type: "text/javascript" }));
      try {
        const compiler = await import(url);
        const bytes = compiler.emit_numeric_wasm(compiler.compile_ir_string(source, "browser.eli"));
        const module = new WebAssembly.Module(Uint8Array.from(bytes));
        const instance = new WebAssembly.Instance(module);
        return { bytes, result: instance.exports.recurrence(1000, .123), imports: WebAssembly.Module.imports(module) };
      } finally { URL.revokeObjectURL(url); }
    }, { bundle, source });
    assert.deepEqual(Uint8Array.from(result.bytes), compile(source, "browser.eli").bytes);
    assert.equal(result.result, 641.1641723326824);
    assert.deepEqual(result.imports, []);
  } finally { await browser.close(); }
});
