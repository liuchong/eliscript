import { afterAll, beforeAll, describe, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";
import { backendModules, buildBackends, root } from "../tools/backends/build.mjs";
import { validateDirectWasmReport } from "../tools/backends/benchmark.mjs";

const browserName = process.env.ELISCRIPT_TEST_BROWSER ?? "chromium";
const browsers = { chromium, firefox, webkit };
assert(Object.hasOwn(browsers, browserName), `unknown ELISCRIPT_TEST_BROWSER: ${browserName}`);
let directory, generations, runtimeSeeds, browserBundle, browserProcess;
const execFileAsync = promisify(execFile);
async function seedJavascript(input, output) {
  // Seed fixtures use the public CLI and retain the original child deadline.
  // A nonzero exit rejects fixture preparation or the calling test.
  await execFileAsync(resolve(root, "bin/eliscript-seed"), ["--output", output, input], {
    encoding: "utf8", timeout: 30_000,
  });
  return readFile(output, "utf8");
}
const sameNumber = (actual, expected, label) => assert(Object.is(actual, expected), `${label}: ${actual} != ${expected}`);
function scalarFunctionInstructions(bytes) {
 let cursor=8;const leb=()=>{let value=0,shift=0,byte;do{byte=bytes[cursor++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);return value;};
 while(cursor<bytes.length){const id=bytes[cursor++],length=leb(),end=cursor+length;if(id!==10){cursor=end;continue;}const functions=leb(),result=[];
  for(let i=0;i<functions;i++){const size=leb(),finish=cursor+size,groups=leb();for(let j=0;j<groups;j++){leb();assert([124,127].includes(bytes[cursor++]));}result.push(bytes.slice(cursor,finish));cursor=finish;}
  return result;
 }throw Error('WASM code section missing');
}

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
  const source = await readFile(resolve(root, "bootstrap/runtime/memory.eli"), "utf8");
  const managedSource = source + rootPressureSource +
    await readFile(resolve(root, "tests/fixtures/wasm-managed-text.eli"), "utf8") +
    await readFile(resolve(root, "tests/fixtures/wasm-managed-tables.eli"), "utf8");
  const managedInput = resolve(directory, "managed-runtime.eli");
  await writeFile(managedInput, managedSource);
  const callableInput = resolve(root, "tests/fixtures/wasm-managed-callables.eli");
  const callableSource = await readFile(callableInput, "utf8");
  const variadicInput = resolve(root, "tests/fixtures/wasm-managed-variadic-calls.eli");
  const variadicSource = await readFile(variadicInput, "utf8");
  const callbackInput = resolve(root, "tests/fixtures/wasm-managed-array-callbacks.eli");
  const callbackSource = await readFile(callbackInput, "utf8");
  const regexpInput = resolve(root, "tests/fixtures/wasm-managed-regexp.eli");
  const regexpSource = await readFile(regexpInput, "utf8");
  const builtinsInput = resolve(root, "tests/fixtures/wasm-managed-builtins.eli");
  const builtinsSource = await readFile(builtinsInput, "utf8");
  const jsonInput = resolve(root, "tests/fixtures/wasm-managed-json.eli");
  const jsonSource = await readFile(jsonInput, "utf8");
  const stringsInput = resolve(root, "tests/fixtures/wasm-managed-strings.eli");
  const stringsSource = await readFile(stringsInput, "utf8");
  const moduleInput = resolve(root, "tests/fixtures/wasm-managed-module-bindings.eli");
  const moduleSource = await readFile(moduleInput, "utf8");
  const projectStateInput = resolve(root, "tests/fixtures/wasm-managed-project-state.eli");
  const projectEntryInput = resolve(root, "tests/fixtures/wasm-managed-project-entry.eli");
  const projectStateSource = await readFile(projectStateInput, "utf8");
  const projectEntrySource = await readFile(projectEntryInput, "utf8");
  const [memorySeed, managedSeed, callableSeed, variadicSeed, callbackSeed, moduleSeed, projectStateSeed, projectEntrySeed, stringsSeed, regexpSeed, builtinsSeed, jsonSeed] = await Promise.all([
    seedJavascript(resolve(root, "bootstrap/runtime/memory.eli"), resolve(directory, "memory-seed.mjs")),
    seedJavascript(managedInput, resolve(directory, "managed-seed.mjs")),
    seedJavascript(callableInput, resolve(directory, "callables-seed.mjs")),
    seedJavascript(variadicInput, resolve(directory, "variadic-seed.mjs")),
    seedJavascript(callbackInput, resolve(directory, "callback-seed.mjs")),
    seedJavascript(moduleInput, resolve(directory, "module-seed.mjs")),
    seedJavascript(projectStateInput, resolve(directory, "project-state-seed.mjs")),
    seedJavascript(projectEntryInput, resolve(directory, "project-entry-seed.mjs")),
    seedJavascript(stringsInput, resolve(directory, "strings-seed.mjs")),
    seedJavascript(regexpInput, resolve(directory, "regexp-seed.mjs")),
    seedJavascript(builtinsInput, resolve(directory, "builtins-seed.mjs")),
    seedJavascript(jsonInput, resolve(directory, "json-seed.mjs")),
  ]);
  runtimeSeeds = {
    memory: { source, javascript: memorySeed },
    strings: { source: stringsSource, javascript: stringsSeed, filename: stringsInput },
    regexp: { source: regexpSource, javascript: regexpSeed, filename: regexpInput },
    builtins: { source: builtinsSource, javascript: builtinsSeed, filename: builtinsInput },
    json: { source: jsonSource, javascript: jsonSeed, filename: jsonInput },
    managed: { source: managedSource, javascript: managedSeed },
    callables: { source: callableSource, javascript: callableSeed, filename: callableInput },
    variadic: { source: variadicSource, javascript: variadicSeed, filename: variadicInput },
    callbacks: { source: callbackSource, javascript: callbackSeed, filename: callbackInput },
    moduleBindings: { source: moduleSource, javascript: moduleSeed, filename: moduleInput },
    project: { entry: "wasm-managed-project-entry.mjs", modules: [
      {id:"wasm-managed-project-state.mjs", source:projectStateSource, javascript:projectStateSeed, filename:projectStateInput},
      {id:"wasm-managed-project-entry.mjs", source:projectEntrySource, javascript:projectEntrySeed, filename:projectEntryInput},
    ]},
  };
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

test("Seed and three generations group lambda and async expressions in operator contexts", async () => {
  const source = `
    (defun fresh-eq () (eq (lambda () 1) (lambda () 1)))
    (defun fresh-compare () (= (lambda () 1) (lambda () 1)))
    (defun right-lambda () (eq nil (lambda () 1)))
    (defun nil-lambda () (nil? (lambda () 1)))
    (defun undefined-lambda () (undefined? (lambda () 1)))
    (defun lambda-type () (value-type (lambda () 1)))
    (defun async-type () (value-type (async () 1)))
    (defun negate-lambda () (- (lambda () 1)))
    (defun increment-lambda () (1+ (lambda () 1)))
    (defun call-lambda () ((lambda (x) (+ x 1)) 2))
    (export fresh-eq fresh-compare right-lambda nil-lambda undefined-lambda
      lambda-type async-type negate-lambda increment-lambda call-lambda)`;
  const input = resolve(directory, "arrow-operands.eli"), output = resolve(directory, "arrow-operands.mjs");
  await writeFile(input, source);
  const seed = await seedJavascript(input, output);
  for (const generation of generations) assert.equal(generation.compiler.compile_string(source, input), seed);
  const syntax = spawnSync(process.env.NODE ?? "node", ["--check", output], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const legacy = spawnSync(process.env.EMACS ?? "emacs", ["--batch", "-Q", "-L", resolve(root, "compiler"), "--eval",
    "(progn (require 'eliscript-emitter) (princ (eliscript-emitter-emit-expression '(eq (lambda () 1) (lambda () 1)))))"], { encoding: "utf8" });
  assert.equal(legacy.status, 0, legacy.stderr);
  const legacyModule = await import(`data:text/javascript;base64,${Buffer.from("export default " + legacy.stdout + ";").toString("base64")}`);
  assert.equal(legacyModule.default, false);
  const module = await import(`data:text/javascript;base64,${Buffer.from(seed).toString("base64")}`);
  for (const name of ["fresh_eq", "fresh_compare", "right_lambda", "nil_lambda", "undefined_lambda"]) assert.equal(module[name](), false, name);
  assert.equal(module.lambda_type(), "function"); assert.equal(module.async_type(), "function");
  assert(Number.isNaN(module.negate_lambda()));
  assert.equal(typeof module.increment_lambda(), "string"); assert(module.increment_lambda().endsWith("1"));
  assert.equal(module.call_lambda(), 3);
  const node = spawnSync(process.env.NODE ?? "node", ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';const m=await import(process.argv[1]);
    for(const name of ['fresh_eq','fresh_compare','right_lambda','nil_lambda','undefined_lambda'])assert.equal(m[name](),false);
    assert.equal(m.lambda_type(),'function');assert.equal(m.async_type(),'function');
    assert(Number.isNaN(m.negate_lambda()));assert.equal(typeof m.increment_lambda(),'string');
    assert(m.increment_lambda().endsWith('1'));assert.equal(m.call_lambda(),3);
  `, pathToFileURL(output).href], { encoding: "utf8" });
  assert.equal(node.status, 0, node.stderr);
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

test("compound loop backedges use direct exits and preserve every short-circuit guard and IEEE boundary",async()=>{
 const source=`(defun step (n x) (let ((i 0) (sum 0)) (while (and (< i n) (< (* x x) 100)) (setq x (+ (* x 1.25) 0.1)) (setq sum (+ sum x)) (setq i (1+ i))) sum)) (export step)`;
 const {compiler,numeric,wasm}=generations[2],program=compiler.compile_ir_string(source,'backedge.eli'),typed=numeric.lower_numeric_program(program),saved=JSON.stringify(typed);
 const lowered=numeric.optimize_numeric_program(typed,{loops:false,integers:false,inlining:false,guardedUnroll:true});
 const bytes=Uint8Array.from(wasm.emit_typed_numeric_wasm(lowered));assert(WebAssembly.validate(bytes));assert.equal(JSON.stringify(typed),saved);
 const bodies=scalarFunctionInstructions(bytes);assert.equal(bodies.length,1);const body=bodies[0],directExitAndBackedge=[13,1,12,0,11,11];
 assert([...body].some((_,i)=>directExitAndBackedge.every((byte,j)=>body[i+j]===byte)),'last guard exits the loop directly, without a nested conjunction block');
 const instance=new WebAssembly.Instance(new WebAssembly.Module(bytes)),ref=await javascript(source);
 for(const n of[-Infinity,-0,0,.5,1,1.1,2,3,3.5,4,7,NaN])for(const x of[-Infinity,-10,-1,-0,0,Number.MIN_VALUE,.123,1,9,10,Infinity,NaN])sameNumber(instance.exports.step(n,x),ref.module.step(n,x),`${n}/${x}`);
});
test("integer guard inversions and negated compound guards avoid Boolean materialization without narrowing Numbers",async()=>{
 const source=`(defun bounded (start limit) (let ((x start) (i 0)) (while (and (< x limit) (< i 3)) (setq x (1+ x)) (setq i (1+ i))) x))
 (defun negated (start limit) (let ((x start) (i 0)) (while (not (or (>= x limit) (>= i 3))) (setq x (1+ x)) (setq i (1+ i))) x)) (export bounded negated)`;
 const {compiler,wasm}=generations[2],ir=compiler.compile_ir_string(source,'integer-guards.eli'),saved=JSON.stringify(ir),bytes=Uint8Array.from(wasm.emit_memory_wasm(ir));assert.equal(JSON.stringify(ir),saved);assert(WebAssembly.validate(bytes));
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
 // A direct unsigned >= exit is exact for integer words, including the sign bit.
 const bodies=scalarFunctionInstructions(bytes);assert(bodies.some(body=>[...body].some((x,i)=>x===79&&body[i+1]===13)),'unsigned compare branches directly without eqz');
 const hasOrValueBlock=[4,127];assert(!bodies.some(body=>[...body].some((_,i)=>hasOrValueBlock.every((x,j)=>body[i+j]===x))),'a negated guard uses branches instead of a Boolean-valued if');
 for(const start of[0,1,3,0x7fffffff,0x80000000,0xfffffffd,0xffffffff])for(const limit of[0,1,4,0x7fffffff,0x80000000,0xffffffff]){let expected=start,i=0;while(expected<limit&&i<3){expected=(expected+1)>>>0;i++;}assert.equal(e.bounded(start,limit)>>>0,expected);assert.equal(e.negated(start,limit)>>>0,expected);}
 const operators=['=','/=','<','<=','>','>='],predicates=[(a,b)=>a===b,(a,b)=>a!==b,(a,b)=>a<b,(a,b)=>a<=b,(a,b)=>a>b,(a,b)=>a>=b];
 const comparisons=operators.map((op,i)=>`(defun c${i} (x y) (let ((i 0)) (while (and (< i 3) (${op} x y)) (setq i (1+ i))) i))`).join('\n')+' (export c0 c1 c2 c3 c4 c5)';
 const pairs=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(wasm.emit_memory_wasm(compiler.compile_ir_string(comparisons,'word-comparisons.eli'))))).exports;
 for(const a of[0,1,0x7fffffff,0x80000000,0xffffffff])for(const b of[0,1,0x7fffffff,0x80000000,0xffffffff])for(let i=0;i<operators.length;i++)assert.equal(pairs[`c${i}`](a,b),predicates[i](a,b)?3:0,operators[i]);
 const numeric='(defun truth (n) (let ((i 0)) (while (not n) (setq i (1+ i))) i)) (export truth)',ref=await javascript(numeric),program=compiler.compile_ir_string(numeric,'numeric-truth.eli');
 const n=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(wasm.emit_numeric_wasm(program)))).exports;
 for(const value of[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,1])sameNumber(n.truth(value),ref.module.truth(value),'Number truth is retained');
 const effects='(defun effects (n) (let ((i 0) (checks 0)) (while (not (or (>= (setq checks (1+ checks)) n) (>= i 5))) (setq i (1+ i))) (+ (* checks 10) i))) (export effects)',effectRef=await javascript(effects);
 const effectModule=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(wasm.emit_numeric_wasm(compiler.compile_ir_string(effects,'negated-effects.eli'))))).exports;
 for(const value of[-Infinity,-0,0,.5,1,2,5,NaN,Infinity])sameNumber(effectModule.effects(value),effectRef.module.effects(value),'negated guard effect counts');
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
  const collectionFirst = JSON.parse(await readFile(resolve(root, "tools/backends/results/direct-wasm-source-collections-first-macos-arm64.json"), "utf8"));
  await validateDirectWasmReport(collectionFirst, { verifySources: false });
  assert.equal(collectionFirst.decision.productionPassed, false);
  assert.deepEqual(collectionFirst.artifacts, report.artifacts);
  const forgedCollection = structuredClone(collectionFirst);
  forgedCollection.decision.productionPassed = true;
  await assert.rejects(validateDirectWasmReport(forgedCollection, { verifySources: false }));
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
  const wordFailures=await Promise.all(['direct-wasm-word-recheck-first-macos-arm64.json','direct-wasm-word-recheck-confirmation-macos-arm64.json'].map(async file=>JSON.parse(await readFile(resolve(root,'tools/backends/results',file),'utf8'))));
  for(const failedWord of wordFailures){await validateDirectWasmReport(failedWord,{verifySources:false});assert.equal(failedWord.decision.productionPassed,false);const forged=structuredClone(failedWord);forged.decision.productionPassed=true;await assert.rejects(validateDirectWasmReport(forged,{verifySources:false}));}
  assert.deepEqual(wordFailures[0].artifacts,wordFailures[1].artifacts);
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

test("runtime fixed-point Seed failures cannot become successful comparisons", async () => {
  const input = resolve(directory, "invalid-runtime.eli");
  await writeFile(input, "(defun broken (");
  await assert.rejects(seedJavascript(input, resolve(directory, "invalid-runtime.mjs")), error =>
    Number.isInteger(error.code) && error.code !== 0 && error.stderr.includes("eliscript"));
});

test("memory runtime emits identical IR and WASM through three compiler generations", async () => {
  const filename = "memory-runtime.eli", { source, javascript: seed } = runtimeSeeds.memory;
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename));
  assert.deepEqual(programs[0], programs[1]); assert.deepEqual(programs[1], programs[2]);
  const saved = programs.map(program => JSON.stringify(program));
  const bytes = generations.map((g, i) => Uint8Array.from(g.wasm.emit_memory_wasm(programs[i])));
  assert.deepEqual(bytes[0], bytes[1]); assert.deepEqual(bytes[1], bytes[2]);
  for (let i = 0; i < programs.length; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed);
    assert.equal(JSON.stringify(programs[i]), saved[i]);
  }
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
  const {source,javascript:seed}=runtimeSeeds.managed;
  const filename="managed-runtime.eli",programs=generations.map(g=>g.compiler.compile_ir_string(source,filename));
  assert.deepEqual(programs[0],programs[1]);assert.deepEqual(programs[1],programs[2]);
  const saved=programs.map(program=>JSON.stringify(program));
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
  for(let i=0;i<programs.length;i++){
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);
    assert.equal(JSON.stringify(programs[i]),saved[i]);
  }
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

test("ordinary managed arithmetic has Seed and three-generation IR and byte fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-arithmetic.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'arithmetic.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lower=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[2]);assert.deepEqual(lower[0],lower[1]);assert.deepEqual(lower[1],lower[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const n=a.number(32),sum=a.invoke('recursive-sum',[n]);sameNumber(a.readNumber(sum),528,'managed recursion');a.release(sum);a.release(n);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("ordinary managed word operations have Seed and three-generation IR and byte fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-word.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'word.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const x=a.number(Number.MAX_VALUE),y=a.number(3),out=a.invoke('remainder',[x,y]);sameNumber(a.readNumber(out),Number.MAX_VALUE%3,'word remainder');a.release(out);a.release(x);a.release(y);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("ordinary source arrays have Seed and three-generation IR, descriptor and WASM fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-arrays.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'arrays.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const n=a.number(128),arr=a.invoke('grow-loop',[n]);assert.equal(a.length(arr),128);const last=a.invoke('remove-last',[arr]);sameNumber(a.readNumber(last),127,'array pop');a.release(last);
  const name=a.string('name'),assigned=a.invoke('write',[arr,name,n]);a.release(assigned);assert.equal(a.invoke('has',[arr,name]),true);const keys=a.invoke('keys',[arr]),tail=a.get(keys,127);assert.equal(a.readString(tail),'name');a.release(tail);assert.equal(a.length(keys),128);
  const copy=a.invoke('copy',[arr]);assert.equal(a.invoke('has',[copy,name]),false);for(const x of[copy,keys,name,arr,n])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("named source objects have Seed and three-generation IR, descriptor and WASM fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-objects.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'objects.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const n=a.number(128),object=a.invoke('grow-loop',[n]),keys=a.invoke('keys',[object]);assert.equal(a.length(keys),128);const first=a.get(keys,0),last=a.get(keys,127);assert.equal(a.readString(first),'0');assert.equal(a.readString(last),'127');for(const v of[first,last,keys,object,n])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("ordinary source text has Seed and three-generation IR, descriptor and WASM fixed points",async()=>{
 const {source,javascript:seed,filename}=runtimeSeeds.strings,runtime=runtimeSeeds.memory.source;
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 for(let i=0;i<3;i++)assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const s=a.string('中😀\ud800'),p=a.number(1),point=a.invoke('code-point',[s,p]);assert.equal(a.readNumber(point),0x1f600);a.release(point);const fixed=a.invoke('repair',[s]);assert.equal(a.readString(fixed),'中😀�');const needle=a.string('😀'),last=a.invoke('last',[s,needle,undefined]);assert.equal(a.readNumber(last),1);const pointInput=a.number(0x1f600),constructed=a.invoke('from-point',[pointInput]);assert.equal(a.readString(constructed),'😀');const invalid=a.number(.5);assert.throws(()=>a.invoke('from-point',[invalid]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');for(const v of[s,p,fixed,needle,last,pointInput,constructed,invalid])a.release(v);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("RegExp literals preserve public Seed and three-generation programs, typed IR, descriptors and executable bytes",async()=>{
 const {source,javascript:seed,filename}=runtimeSeeds.regexp;
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtimeSeeds.memory.source,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i])),bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i]));
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(let i=0;i<3;i++){assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);assert.deepEqual(programs[i],programs[0]);assert.deepEqual(lowered[i],lowered[0]);assert.deepEqual(bytes[i],bytes[0]);const a=instantiateManagedRuntime(Uint8Array.from(bytes[i]));a.auto(1);
  const text=a.string('😀abc42'),out=a.invoke('groups',[text]);assert.equal(a.length(out),3);const whole=a.get(out,0),digits=a.get(out,2);assert.equal(a.readString(whole),'abc42');assert.equal(a.readString(digits),'42');const key=a.string('index'),index=a.invoke('meta',[out,key]);assert.equal(a.readNumber(index),2);assert.equal(a.invoke('own',[out,key]),true);const number=a.string('1.e-2');assert.equal(a.invoke('numeric',[number]),true);for(const x of[text,out,whole,digits,key,index,number])a.release(x);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});
test("ordinary source collections have Seed and three-generation IR, descriptor and WASM fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-source-collections.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'source-collections.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));assert.deepEqual(programs[0],programs[1]);assert.deepEqual(programs[1],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
 const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const n=a.number(64),map=a.invoke('map-loop',[n]),size=a.invoke('size',[map]);assert.equal(a.readNumber(size),64);a.release(size);const it=a.invoke('entries',[map]),step=a.invoke('next',[it]),key=a.string('value'),pair=a.objectGet(step,key),first=a.get(pair,0);assert.equal(a.readNumber(first),0);for(const x of[first,pair,key,step,it,map,n])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("first-class builtins retain public Seed and three-generation IR, descriptors, table slots and executable bytes", async () => {
  const {source, javascript: seed, filename} = runtimeSeeds.builtins;
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename));
  const runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i]));
  const bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed); assert.deepEqual(programs[i], programs[0]);
    assert.deepEqual(lowered[i], lowered[0]); assert.deepEqual(bytes[i], bytes[0]);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i])); a.auto(1);
    const text = a.string('-0'), out = a.invoke('number-call', [text]); assert(Object.is(a.readNumber(out), -0));
    const unsafe = a.number(2 ** 53); assert.equal(a.invoke('integer-call', [unsafe]), true); assert.equal(a.invoke('safe-call', [unsafe]), false);
    assert.equal(a.invoke('same-number'), true); assert.equal(a.invoke('same-finite'), true);
    for (const x of [text, out, unsafe]) a.release(x); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
  }
});
test("ordinary JSON retains public Seed and three-generation source IR, descriptors, tables and executable bytes", async () => {
  const {source, javascript: seed, filename} = runtimeSeeds.json;
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename));
  const runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i]));
  const bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed); assert.deepEqual(programs[i], programs[0]); assert.deepEqual(lowered[i], lowered[0]); assert.deepEqual(bytes[i], bytes[0]);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i])); a.auto(1);
    const text = a.string('{"b":-0,"1":"😀","__proto__":7}'), out = a.invoke('canonical-value', [text]); assert.equal(a.readString(out), '{"1":"😀","b":0,"__proto__":7}'); assert.equal(a.invoke('same-parser'), true);
    for (const value of [text, out]) a.release(value); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
  }
});
test("ordinary replacement retains public Seed and three-generation IR, descriptors, callback tables and executable bytes", async () => {
  const filename = resolve(root, 'tests/fixtures/wasm-managed-replacement.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'replacement-seed.mjs'));
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename));
  const runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i]));
  const bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed); assert.deepEqual(programs[i], programs[0]); assert.deepEqual(lowered[i], lowered[0]); assert.deepEqual(bytes[i], bytes[0]);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i])); a.auto(1);
    const text = a.string(';中😀 \t'), out = a.invoke('trim-comment', [text]), callback = a.invoke('replace-callback', [text]);
    assert.equal(a.readString(out), ';中😀'); assert.equal(a.readString(callback), ';中😀< \t:4:;中😀 \t>');
    for (const value of [text, out, callback]) a.release(value); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
  }
});
test("array text retains public Seed and three-generation IR, conversion tables, cycle errors and executable bytes", async () => {
  const filename = resolve(root, 'tests/fixtures/wasm-managed-array-text.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'array-text-seed.mjs'));
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename)), runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i])), bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed);assert.deepEqual(programs[i], programs[0]);assert.deepEqual(lowered[i], lowered[0]);assert.deepEqual(bytes[i], bytes[0]);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(bytes[i]))), []);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i]));a.auto(1);const text = a.string('中😀\ud800'), trace = a.sourceObject({}), object = a.invoke('custom-value', [trace, text]), values = a.sourceArray([object, null, undefined, text]), separator = a.string('|'), out = a.invoke('join-value', [values, separator]);
    assert.equal(a.readString(out), '中😀\ud800|||中😀\ud800');
    const cyclic = a.sourceArray([text, null]);a.set(cyclic, 1, cyclic);
    assert.throws(() => a.invoke('default-value', [cyclic]), e => e instanceof TypeError && e.eliscriptDiagnostic?.code === 'ELI-RT0009');assert.equal(a.stats().frameDepth, 0);
    a.set(cyclic, 1, text);const recovered = a.invoke('default-value', [cyclic]);assert.equal(a.readString(recovered), '中😀\ud800,中😀\ud800');
    for (const value of [text, trace, object, values, separator, out, cyclic, recovered]) a.release(value);a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test("represented type queries retain public Seed and three-generation IR, closure tables, exact values and executable bytes", async () => {
  const filename = resolve(root, 'tests/fixtures/wasm-managed-typeof.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'typeof-seed.mjs'));
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename)), runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i])), bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const js = await import('data:text/javascript;base64,' + Buffer.from(seed).toString('base64'));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed);assert.deepEqual(programs[i], programs[0]);assert.deepEqual(lowered[i], lowered[0]);assert.deepEqual(bytes[i], bytes[0]);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(bytes[i]))), []);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i]));a.auto(1);
    for (const value of [undefined, null, false, true, -0, NaN, Infinity, Number.MIN_VALUE, '', '中😀\ud800']) {
      const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value, box = a.invoke('make-box', [input]), closure = a.invoke('capture', [input]), indexedBox = a.sourceObject({item: input, 'a.b': input}), indexedArray = a.sourceArray([indexedBox]), indexedClosure = a.invoke('capture-index', [indexedArray]);
      for (const [name, argument] of [['type-value', input], ['type-intrinsic', input], ['type-underscore', input], ['type-member', box], ['invoke', closure], ['type-index', indexedArray], ['type-index-key', indexedArray], ['invoke', indexedClosure]]) {const out = a.invoke(name, [argument]);assert.equal(a.readString(out), name === 'type-intrinsic' ? js.type_intrinsic(value) : typeof value);a.release(out);}
      for (const name of ['is-nil', 'is-undefined', 'is-null', 'is-nullish']) assert.equal(a.invoke(name, [input]), js[name.replaceAll('-', '_')](value));
      for (const item of [input, box, closure, indexedBox, indexedArray, indexedClosure]) a.release(item);a.collect();assert.equal(a.stats().frameDepth, 0);
    }
    for (const marker of ['eliscript/keyword', 'eliscript/symbol', 'keyword', 'other']) {const input = a.string(marker), out = a.invoke('type-branded', [input]);assert.equal(a.readString(out), js.type_branded(marker));a.release(input);a.release(out);}
    assert.throws(() => a.invoke('type-member', [null]), e => e.eliscriptDiagnostic?.code === 'ELI-RT0003');
    a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  }
});
test("empty bindings retain public Seed and three-generation IR, descriptors, closure tables and executable bytes", async () => {
  const filename = resolve(root, 'tests/fixtures/wasm-managed-empty-bindings.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'empty-bindings-seed.mjs'));
  const programs = generations.map(g => g.compiler.compile_ir_string(source, filename)), runtimes = generations.map(g => g.compiler.compile_ir_string(runtimeSeeds.memory.source, 'runtime.eli'));
  const lowered = generations.map((g, i) => g.managed.lower_managed_program(programs[i], runtimes[i])), bytes = generations.map((g, i) => g.managed.emit_managed_wasm(programs[i], runtimes[i]));
  const {instantiateManagedRuntime} = await import('../tools/backends/managed-runtime.mjs');
  for (let i = 0; i < 3; i++) {
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]), seed); assert.deepEqual(programs[i], programs[0]); assert.deepEqual(lowered[i], lowered[0]); assert.deepEqual(bytes[i], bytes[0]);
    const a = instantiateManagedRuntime(Uint8Array.from(bytes[i])); a.auto(1); assert.equal(a.invoke('default-value'), null);
    const number = a.number(-0), text = a.string('中😀\ud800'), parallel = a.invoke('parallel-value', [number]), captured = a.invoke('capture-value', [text]);
    assert(Object.is(a.readNumber(parallel), -0)); assert.equal(a.readString(captured), '中😀\ud800');
    for (const value of [number, text, parallel, captured]) a.release(value); a.closeModule(); a.collect(); assert.equal(a.live(), 0); assert.equal(a.stats().frameDepth, 0);
  }
});
test("primitive Number and text conversions have Seed and three-generation IR, descriptor and WASM fixed points", async () => {
  const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-number-conversion.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
  const programs=generations.map(g=>g.compiler.compile_ir_string(source,'number-conversion.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
  const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));
  assert.deepEqual(programs[0],programs[1]);assert.deepEqual(programs[1],programs[2]);assert.deepEqual(lowered[0],lowered[1]);assert.deepEqual(lowered[1],lowered[2]);
  const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));assert.deepEqual(bytes[0],bytes[1]);assert.deepEqual(bytes[1],bytes[2]);
  const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
  for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const source=a.string('-0'),parsed=a.invoke('parse',[source]);assert(Object.is(a.readNumber(parsed),-0));const number=a.number(1000000000000000100),text=a.invoke('text',[number]);assert.equal(a.readString(text),'1000000000000000100');for(const value of[source,parsed,number,text])a.release(value);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("mixed primitive operators have three-generation canonical IR, numeric JS, descriptor and WASM fixed points",async()=>{
 const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-primitive-operators.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,'primitive-operators.eli')),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,'runtime.eli'));
 const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i])),bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));
 for(let i=1;i<3;i++){assert.deepEqual(programs[0],programs[i]);assert.equal(generations[0].compiler.serialize_ir_program(programs[0]),generations[i].compiler.serialize_ir_program(programs[i]));assert.deepEqual(lowered[0],lowered[i]);assert.deepEqual(bytes[0],bytes[i]);assert.equal(generations[0].compiler.emit_ir_string(programs[0]),generations[i].compiler.emit_ir_string(programs[i]));}
 const numericSource='(defun f (x y) (* (- x y) (/ x y))) (export f)',numeric=generations.map(g=>g.numeric.emit_numeric_javascript(g.compiler.compile_ir_string(numericSource,'typed-js.eli')));assert.equal(numeric[0],numeric[1]);assert.equal(numeric[1],numeric[2]);
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(const artifact of bytes){const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);const s=a.string('1.5'),n=a.number(2),sum=a.invoke('add',[s,n]),product=a.invoke('multiply',[s,n]);assert.equal(a.readString(sum),'1.52');assert.equal(a.readNumber(product),3);for(const x of[s,n,sum,product])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test("array callback families retain Seed and three-generation IR, descriptors and executable bytes",async()=>{
 const {source,javascript:seed,filename}=runtimeSeeds.callbacks;
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtimeSeeds.memory.source,'runtime.eli'));
 const frozen=programs.map(JSON.stringify),frozenRuntime=runtimes.map(JSON.stringify),lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));
 const artifacts=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(let i=0;i<3;i++){
  assert.deepEqual(programs[i],programs[0]);assert.deepEqual(lowered[i],lowered[0]);assert.deepEqual(artifacts[i],artifacts[0]);assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);
  assert.equal(JSON.stringify(programs[i]),frozen[i]);assert.equal(JSON.stringify(runtimes[i]),frozenRuntime[i]);
  const bytes=Uint8Array.from(artifacts[i]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);
  const zero=a.number(-0),nan=a.number(NaN),tiny=a.number(Number.MIN_VALUE),f=a.invoke('identity'),values=a.sourceArray([zero,nan,tiny,true]),out=a.invoke('filter-with',[values,f]);
  assert.equal(a.length(out),2);const first=a.get(out,0);assert.equal(a.readNumber(first),Number.MIN_VALUE);assert.equal(a.get(out,1),true);
  for(const x of[zero,nan,tiny,f,values,out,first])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});

test("module bindings preserve public Seed and three-generation IR, descriptor and executable fixed points",async()=>{
 const {source,javascript:seed,filename}=runtimeSeeds.moduleBindings;
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtimeSeeds.memory.source,'runtime.eli'));
 const saved=programs.map(JSON.stringify),savedRuntime=runtimes.map(JSON.stringify),lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));
 const artifacts=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(let i=0;i<3;i++){
  assert.deepEqual(programs[i],programs[0]);assert.equal(generations[i].compiler.serialize_ir_program(programs[i]),generations[0].compiler.serialize_ir_program(programs[0]));
  assert.deepEqual(lowered[i],lowered[0]);assert.deepEqual(artifacts[i],artifacts[0]);assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);
  assert.equal(JSON.stringify(programs[i]),saved[i]);assert.equal(JSON.stringify(runtimes[i]),savedRuntime[i]);
  const bytes=Uint8Array.from(artifacts[i]),module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  assert.deepEqual(WebAssembly.Module.customSections(module,'eliscript-managed-control'),WebAssembly.Module.customSections(new WebAssembly.Module(Uint8Array.from(artifacts[0])),'eliscript-managed-control'));
  const reference=await import('data:text/javascript;base64,'+Buffer.from(seed+'\n// fresh module '+i).toString('base64')),a=instantiateManagedRuntime(bytes);a.auto(1);
  const num=(name,args=[])=>{const out=a.invoke(name,args);try{return a.readNumber(out)}finally{a.release(out)}};
  assert.equal(num('tick'),reference.tick());assert.equal(num('tick'),reference.tick());a.initializeModule();assert.equal(num('read-counter'),reference.read_counter());
  const state=a.getExport('state'),alias=a.invoke('read-state'),key=a.string('label'),label=a.objectGet(state,key);assert(a.keyEqual(state,alias));assert.equal(a.readString(label),reference.state.label);
  const capture=a.invoke('captured-global'),one=a.number(1);assert.equal(num('emitted-alias',[one]),reference.emitted_alias(1));const assigned=a.invoke('set-current',[capture]);a.release(assigned);const result=a.invoke('call-current',[one]);assert.equal(a.readNumber(result),reference.captured_global()(1));
  const zero=a.getExport('negative-zero');assert(Object.is(a.readNumber(zero),reference.negative_zero));assert.equal(a.getExport('missing'),null);
  for(const value of[state,alias,key,label,capture,one,result,zero])a.release(value);a.collect();assert(a.live()>0);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});

test("linked projects preserve public Seed, three-generation module IR, descriptors and executable fixed points",async()=>{
 const fixture=runtimeSeeds.project,programs=generations.map(g=>fixture.modules.map(m=>({id:m.id,program:g.compiler.compile_ir_string(m.source,m.filename)}))),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtimeSeeds.memory.source,'runtime.eli'));
 const saved=programs.map(p=>p.map(m=>generations[0].compiler.serialize_ir_program(m.program))),savedRuntime=runtimes.map(JSON.stringify),linked=generations.map((g,i)=>g.managed.link_managed_project(programs[i],fixture.entry)),lowered=generations.map((g,i)=>g.managed.lower_managed_project(programs[i],fixture.entry,runtimes[i])),artifacts=generations.map((g,i)=>g.managed.emit_managed_project_wasm(programs[i],fixture.entry,runtimes[i],{maximumPages:16}));
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(let i=0;i<3;i++){
  assert.deepEqual(programs[i],programs[0]);assert.deepEqual(linked[i],linked[0]);assert.deepEqual(lowered[i],lowered[0]);assert.deepEqual(artifacts[i],artifacts[0]);assert.deepEqual(programs[i].map(m=>generations[i].compiler.serialize_ir_program(m.program)),saved[i]);assert.equal(JSON.stringify(runtimes[i]),savedRuntime[i]);
  const referenceDirectory=resolve(directory,'project-reference-'+i);await mkdir(referenceDirectory);
  for(let j=0;j<fixture.modules.length;j++){const module=fixture.modules[j],code=generations[i].compiler.emit_ir_string(programs[i][j].program);assert.equal(code,module.javascript);await writeFile(resolve(referenceDirectory,module.id),code)}
  const reference=await import(pathToFileURL(resolve(referenceDirectory,fixture.entry)).href),bytes=Uint8Array.from(artifacts[i]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);
  const num=(name,args=[])=>{const out=a.invoke(name,args);try{return a.readNumber(out)}finally{a.release(out)}};assert.equal(num('current'),reference.current());a.initializeModule();assert.equal(num('current'),reference.current());
  const initial=a.getExport('initial'),api=a.getExport('api'),defaultKey=a.string('default'),fromNamespace=a.objectGet(api,defaultKey);assert(a.keyEqual(initial,fromNamespace));assert.equal(reference.initial,reference.api.default);
  const getter=a.invoke('read'),key=a.string('read_counter'),named=a.objectGet(api,key);assert(a.keyEqual(getter,named));assert.equal(reference.read(),reference.api.read_counter);
  const input=a.number(7);assert.equal(num('alias',[input]),reference.alias(7));const out=a.invoke('increment',[input]);assert.equal(a.readNumber(out),reference.increment(7));const exported=a.getExport('counter');assert.equal(a.readNumber(exported),reference.counter);
  const valuesKey=a.string('values'),values=a.objectGet(initial,valuesKey);for(let j=0;j<3;j++){const value=a.get(values,j);assert(Object.is(a.readNumber(value),reference.initial.values[j]));a.release(value)}
  for(const value of[initial,api,defaultKey,fromNamespace,getter,key,named,input,out,exported,valuesKey,values])a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});

test("variadic calls preserve Seed and three-generation IR, descriptors and executable WASM bytes",async()=>{
 const {source,javascript:seed,filename}=runtimeSeeds.variadic;
 const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)),runtimes=generations.map(g=>g.compiler.compile_ir_string(runtimeSeeds.memory.source,'runtime.eli'));
 const saved=programs.map(JSON.stringify),savedRuntime=runtimes.map(JSON.stringify),lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));
 const artifacts=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));
 const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
 for(let i=0;i<3;i++){
  assert.deepEqual(programs[i],programs[0]);assert.deepEqual(lowered[i],lowered[0]);assert.deepEqual(artifacts[i],artifacts[0]);assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);
  assert.equal(JSON.stringify(programs[i]),saved[i]);assert.equal(JSON.stringify(runtimes[i]),savedRuntime[i]);
  const bytes=Uint8Array.from(artifacts[i]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);
  assert.equal(a.invoke('optional-one'),null);const n=a.number(-0),f=a.invoke('mixed-value'),args=a.sourceArray([n,undefined,true]);const out=a.invoke('apply-values',[f,args]);
  const first=a.get(out,0),second=a.get(out,1),tail=a.get(out,2);assert(Object.is(a.readNumber(first),-0));assert.equal(second,null);assert.equal(a.get(tail,0),true);
  for(const x of[n,f,args,out,first,second,tail])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 }
});

test("source callables preserve Seed semantics and three-generation IR, descriptor and WASM fixed points", async () => {
  const {source,javascript:seed,filename}=runtimeSeeds.callables, runtime=runtimeSeeds.memory.source;
  const programs=generations.map(g=>g.compiler.compile_ir_string(source,filename)), runtimes=generations.map(g=>g.compiler.compile_ir_string(runtime,"runtime.eli"));
  const saved=programs.map(p=>JSON.stringify(p)), runtimeSaved=runtimes.map(p=>JSON.stringify(p));
  const lowered=generations.map((g,i)=>g.managed.lower_managed_program(programs[i],runtimes[i]));
  const bytes=generations.map((g,i)=>g.managed.emit_managed_wasm(programs[i],runtimes[i],{maximumPages:16}));
  for(let i=0;i<3;i++){
    assert.deepEqual(programs[0],programs[i]);assert.equal(generations[0].compiler.serialize_ir_program(programs[0]),generations[i].compiler.serialize_ir_program(programs[i]));
    assert.equal(generations[i].compiler.emit_ir_string(programs[i]),seed);assert.deepEqual(lowered[0],lowered[i]);assert.deepEqual(bytes[0],bytes[i]);
    assert.equal(JSON.stringify(programs[i]),saved[i]);assert.equal(JSON.stringify(runtimes[i]),runtimeSaved[i]);
  }
  const reference=await import('data:text/javascript;base64,'+Buffer.from(seed).toString('base64'));
  const {instantiateManagedRuntime}=await import('../tools/backends/managed-runtime.mjs');
  for(const artifact of bytes){
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(artifact))),[]);
    const a=instantiateManagedRuntime(Uint8Array.from(artifact));a.auto(1);
    const num=(name,args=[])=>{const r=a.invoke(name,args);try{return a.readNumber(r);}finally{a.release(r);}};
    const x=a.number(4),y=a.number(5),f=a.invoke('make-adder',[x]);assert.equal(num('apply-one',[f,y]),reference.make_adder(4)(5));
    const pair=a.invoke('make-box',[x]),write=a.get(pair,0),read=a.get(pair,1),box=reference.make_box(4);
    for(const value of[-0,NaN,Infinity,Number.MIN_VALUE]){const n=a.number(value),out=a.invoke('apply-one',[write,n]);assert(Object.is(a.readNumber(out),box[0](value)));a.release(n);a.release(out);a.collect();assert(Object.is(num('apply-zero',[read]),box[1]()));}
    assert.equal(a.invoke('named-same'),true);assert.equal(a.invoke('fresh-same'),false);assert.equal(num('callee-order'),reference.callee_order());
    for(const value of[x,y,f,pair,write,read])a.release(value);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
  }
});

describe("browser compiler backends", () => {
  beforeAll(async () => {
    // Compiler bundling and browser process startup are fixture preparation.
    // Keep every semantic test's existing timeout and use a fresh context for
    // each evaluation; performance benchmarks retain their separate policy.
    const entry = resolve(directory, "browser-entry.mjs");
    await writeFile(entry, `export {compile_ir_string,emit_ir_string} from ${JSON.stringify(resolve(directory, "g3/bootstrap/compiler.mjs"))};\nexport {emit_numeric_wasm,emit_memory_wasm} from ${JSON.stringify(resolve(directory, "g3/backends/wasm.mjs"))};\nexport {instantiateMemoryRuntime} from ${JSON.stringify(resolve(root, "tools/backends/memory-runtime.mjs"))};\nexport {instantiateManagedRuntime} from ${JSON.stringify(resolve(root, "tools/backends/managed-runtime.mjs"))};\nexport {emit_native_numeric_object,emit_native_numeric_library,emit_native_numeric_executable} from ${JSON.stringify(resolve(directory, "g3/backends/native.mjs"))};`);
    await writeFile(entry,(await readFile(entry,'utf8'))+`\nexport {emit_managed_wasm,emit_managed_project_wasm} from ${JSON.stringify(resolve(directory,'g3/backends/managed.mjs'))};`);
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

  test("browser source arrays preserve growth, nullish reads, order, aliases and shallow slices without host callbacks",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-arrays.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,'browser-arrays.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(v,m)=>{if(!v)throw Error(m);};
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);
        const box=x=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
        const read=x=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):x.kind===5?a.readString(x):Array.from({length:a.length(x)},(_,i)=>{const v=a.get(x,i);try{return read(v);}finally{a.release(v);}}):x;
        const verify=(actual,expected,label)=>{if(typeof expected==='number')check(Object.is(actual,expected),label);else if(Array.isArray(expected)){check(Array.isArray(actual)&&actual.length===expected.length,label);for(let i=0;i<expected.length;i++)verify(actual[i],expected[i],label);}else check(actual===expected,label);};
        const call=(name,args)=>{const r=a.invoke(name,args);try{return read(r);}finally{a.release(r);}};
        const values=[null,false,true,undefined,0,-0,NaN,Infinity,Number.MIN_VALUE,'中😀\ud800'];
        for(const value of values){const v=box(value),arr=a.invoke('make',[v,null,undefined]),ref=js.make(value,null,undefined);verify(read(arr),ref,'construct');
          for(const i of[0,1,2,3,-0,-1,.5,NaN,Infinity,'0','01','length']){const key=box(i);verify(call('at',[arr,key]),js.at(ref,i),'aref');verify(call('nth-value',[key,arr]),js.nth_value(i,ref),'nth');a.release(key);}
          const index=a.number(9);verify(call('write',[arr,index,v]),js.write(ref,9,value),'write');verify(read(arr),Array.from(ref),'grow');verify(call('copy',[arr]),Array.from(js.copy(ref)),'slice');verify(call('remove-last',[arr]),js.remove_last(ref),'pop');
          const zero=a.number(0);verify(call('truncate',[arr,zero]),js.truncate(ref,0),'length');a.release(zero);for(const h of[v,arr,index])a.release(h);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'cleanup');
        }
        const key=a.string('length'),objectKey=a.sourceArray([key]);for(const receiver of[null,undefined]){verify(call('nth-value',[key,receiver]),js.nth_value('length',receiver),'empty fallback length');let refused=false;try{a.invoke('nth-value',[objectKey,receiver]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0001';}check(refused,'object key capability');}a.release(objectKey);a.release(key);
        const bulk=a.sourceArray([true,false,undefined]);verify(call('copy',[bulk]),[true,false,undefined],'bulk source array');check(bulk.kind===14,'source kind');a.release(bulk);a.collect();
        const sparse=a.sourceArray([true,,undefined]),ref=[true,,undefined],name=a.string('name'),named=a.string('中😀'),index=a.number(1),count=a.number(8);
        verify(call('keys',[sparse]),Object.keys(ref),'hole keys');verify(call('has',[sparse,index]),false,'hole presence');verify(call('write',[sparse,name,named]),js.write(ref,'name','中😀'),'named assignment');verify(call('truncate',[sparse,count]),js.truncate(ref,8),'sparse growth');verify(call('keys',[sparse]),Object.keys(ref),'named enumeration');
        const sparseCopy=a.invoke('copy',[sparse]);verify(call('keys',[sparseCopy]),Object.keys(ref.slice()),'slice preserves holes and omits names');
        const loText=a.string('1'),hiText=a.string('5'),interval=a.invoke('interval',[sparse,loText,hiText]);verify(call('keys',[interval]),Object.keys(ref.slice('1','5')),'primitive positions');
        const object=a.invoke('assoc',[sparse,name,false]);check(object.kind===13,'spread object kind');verify(call('keys',[object]),Object.keys(js.assoc(ref,'name',false)),'array shallow spread');verify(call('at',[object,name]),false,'spread value');
        for(const method of['push','pop','slice']){const target=a.sourceArray([]),marker=a.sourceArray([false]),property=a.string(method),targetRef=[],markerRef=[false],entry=method==='push'?'append':method;call('write',[target,property,false]);targetRef[method]=false;let refused=false;try{a.invoke(entry+'-shadow',[target,marker]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused,'noncallable method');try{js[entry+'_shadow'](targetRef,markerRef);}catch{}verify(read(marker),markerRef,'method argument effects');for(const v of[target,marker,property])a.release(v);}
        const snapshot=[];snapshot.length=4;snapshot[2]=undefined;snapshot.label=false;Object.defineProperty(snapshot,'__proto__',{value:false,enumerable:true});snapshot[Symbol.iterator]=()=>{throw Error('source iterator invoked');};const bridged=a.sourceArray(snapshot);verify(call('keys',[bridged]),Object.keys(snapshot),'bulk sparse own snapshot');
        for(const v of[sparse,sparseCopy,name,named,index,count,loText,hiText,interval,object,bridged])a.release(v);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'sparse cleanup');
        const n=a.number(128),arr=a.invoke('grow-loop',[n]);verify(read(arr),Array.from({length:128},(_,i)=>i),'loop');const lo=a.number(-3.5),hi=a.number(Infinity);verify(call('interval',[arr,lo,hi]),[125,126,127],'relative');
        const cycle=a.invoke('nested',[arr,null]),self=a.get(cycle,0);check(a.keyEqual(cycle,self),'cycle');a.release(self);for(const h of[cycle,arr,n,lo,hi])a.release(h);a.collect();check(a.live()===0&&a.stats().frameDepth===0&&a.stats().collections>128,'GC');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-arrays.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser named source objects preserve own order, inheritance, copy effects and cycles without host callbacks",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-objects.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,'browser-objects.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(v,m)=>{if(!v)throw Error(m);};
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);
        const read=x=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):x.kind===5?a.readString(x):Array.from({length:a.length(x)},(_,i)=>{const v=a.get(x,i);try{return read(v);}finally{a.release(v);}}):x;
        const call=(name,args)=>{const r=a.invoke(name,args);try{return read(r);}finally{a.release(r);}};
        const verify=(x,y,label)=>{if(Array.isArray(y)){check(Array.isArray(x)&&x.length===y.length,label);for(let i=0;i<y.length;i++)verify(x[i],y[i],label);}else check(Object.is(x,y),label);};
        const value=a.number(-0),parent=a.invoke('make',[value,true]),child=a.invoke('inherit',[parent,false]),key=a.string('x');verify(call('read-value',[child,key]),-0,'inherited signed zero');verify(call('has',[child,key]),false,'own only');verify(call('keys',[child]),['own'],'own order');
        const proto=a.invoke('proto',[child]);check(a.keyEqual(proto,parent),'prototype identity');a.release(proto);const before=a.stats();for(let i=0;i<1024;i++)verify(call('read-value',[child,key]),-0,'direct borrowed result');check(a.stats().collections===before.collections&&a.stats().usedBytes===before.usedBytes,'direct reader allocation');let refused=false;try{a.invoke('set-proto',[parent,child]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused,'prototype cycle');
        const object=a.invoke('empty',[]),ref={};for(const name of['z','10','2','01','4294967294','4294967295','constructor','中😀','']){const k=a.string(name);verify(call('write',[object,k,false]),js.write(ref,name,false),'write');verify(call('keys',[object]),js.keys(ref),'ordered keys');a.release(k);}
        const old=a.string('old'),newKey=a.string('new'),zero=a.number(0),original=a.invoke('computed',[old,zero]),originalRef=js.computed('old',0),copy=a.invoke('assoc-order',[original,newKey]),copyRef=js.assoc_order(originalRef,'new');verify(call('keys',[copy]),js.keys(copyRef),'copy order');verify(call('read-value',[original,old]),3,'RHS effects');verify(call('read-value',[copy,old]),0,'copy before effects');
        const bulk=a.sourceObject({['__proto__']:true,empty:undefined}),protoKey=a.string('__proto__');verify(a.objectGet(bulk,protoKey),true,'bulk own proto data');verify(a.objectHas(bulk,protoKey),true,'bulk has');
        const n=a.number(128),grown=a.invoke('grow-loop',[n]);verify(call('keys',[grown]),Array.from({length:128},(_,i)=>String(i)),'growth order');const cycle=a.invoke('self-cycle',[grown]),selfKey=a.string('self'),self=a.invoke('read-value',[cycle,selfKey]);check(a.keyEqual(cycle,self),'cycle identity');a.release(self);
        for(const v of[value,parent,child,key,object,old,newKey,zero,original,copy,bulk,protoKey,n,grown,cycle,selfKey])a.release(v);a.collect();check(a.live()===0&&a.stats().frameDepth===0&&a.stats().collections>128,'GC cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-objects.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser source String methods preserve UTF16, positions, searches, primitive conversions, order and well-formed repair without host callbacks",async()=>{
    const {source,javascript:seed,filename}=runtimeSeeds.strings,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,runtime,seed,filename})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,filename),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(v,m)=>{if(!v)throw Error(m);};
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');check(c.emit_ir_string(p)===seed,'public Seed JS identity');jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);
        const read=x=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):a.readString(x):x;
        const call=(name,args)=>{const r=a.invoke(name,args);try{return read(r);}finally{a.release(r);}};
        const verify=(name,values)=>{const args=values.map(x=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x);try{check(Object.is(call(name,args),js[name.replaceAll('-','_')](...values)),name);}finally{args.forEach(x=>a.release(x));}a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');};
        for(const text of['','中😀\ud800x\udfff','ababa','\ufeff x \u2000']){
          for(const position of[undefined,null,false,true,-0,-1,.5,-.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE]){
            for(const name of['at','char-at','char-code','code-point'])verify(name,[text,position]);
            for(const name of['slice','substring','substr'])verify(name,[text,position,2.5]);
            for(const name of['find','last','includes','starts','ends'])for(const needle of['','a','😀','\ud800',undefined,-1,NaN])verify(name,[text,needle,position]);
          }
          for(const name of['identity','value','trim','trim-start','trim-end','well-formed','repair'])verify(name,[text]);verify('concat',[text,true,undefined,-1]);verify('repeat',[text,3.5]);verify('size',[text]);for(const key of[0,'1','01','length'])verify('read-value',[text,key]);verify('scan',[text]);
        }
        for(const name of['empty-units','empty-points'])verify(name,[]);
        for(const x of[undefined,null,false,true,-0,-1,.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,65535,65536,0x1f600,0x10ffff,2**32,'65'])for(const name of['from-unit','global-unit','constructor-capture'])verify(name,[x]);
        for(const x of[-0,0,65,0xd800,0xdfff,0x1f600,0x10ffff,'65'])for(const name of['from-point','global-point'])verify(name,[x]);verify('from-points',[65,0x1f600,0xd800]);verify('from-units',[NaN,-1,0x1f600]);
        for(const invalid of[-1,.5,NaN,Infinity,undefined]){const x=typeof invalid==='number'?a.number(invalid):invalid;let jsFailed=false,wasmFailed=false;try{js.from_point(invalid)}catch(e){jsFailed=e instanceof RangeError}try{a.invoke('from-point',[x])}catch(e){wasmFailed=e.eliscriptDiagnostic?.code==='ELI-RT0003'}a.release(x);a.collect();check(jsFailed&&wasmFailed&&a.live()===0&&a.stats().frameDepth===0,'range cleanup');}
        verify('capture',['abcdef',1,'xy']);verify('concat-capture',['base','old','new']);
        const value=a.string('中😀'),trace=a.sourceObject({});check(call('ignored',[value,trace])==='中','ignored result');for(const [name,expected]of[['first',1],['second',2]]){const key=a.string(name),v=a.objectGet(trace,key);check(a.readNumber(v)===expected,'ignored effects');a.release(v);a.release(key);}a.release(value);a.release(trace);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime,seed,filename});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,filename),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser RegExp test and exec preserve capture priority, Unicode offsets, metadata and source effect order without imports",async()=>{
    const {source,javascript:seed,filename}=runtimeSeeds.regexp,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,seed,filename,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{const c=await import(url),p=c.compile_ir_string(source,filename),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt)),check=(ok,message)=>{if(!ok)throw Error(message)};check(c.emit_ir_string(p)===seed,'public Seed');check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');jsUrl=URL.createObjectURL(new Blob([seed],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes);a.auto(1);
       for(const text of['','a','aa','😀abc42','x12','😀😀a','b','a\nb','\ud800']){const input=a.string(text);for(const name of['numeric','line'])check(a.invoke(name,[input])===js[name](text),name);for(const name of['groups','nullable','unicode']){const out=a.invoke(name,[input]),expected=js[name](text);if(expected===null)check(out===null,'missing');else{check(a.length(out)===expected.length,'capture count');for(let i=0;i<expected.length;i++){const value=a.get(out,i);check((value===undefined?undefined:a.readString(value))===expected[i],'capture');a.release(value)}for(const name of['index','input','groups']){const key=a.string(name),value=a.invoke('meta',[out,key]);check((value===undefined?undefined:value.kind===4?a.readNumber(value):a.readString(value))===expected[name],'metadata');check(a.invoke('own',[out,key])===true,'own metadata');a.release(key);a.release(value)}}a.release(out)}a.release(input)}
       const text=a.string('1.e2'),trace=a.sourceObject({});check(a.invoke('capture',[text,trace])===true,'snapshot');const key=a.string('visited'),value=a.objectGet(trace,key);check(a.readNumber(value)===7,'ignored argument');for(const x of[text,trace,key,value])a.release(x);a.closeModule();a.collect();check(a.live()===0&&a.stats().frameDepth===0,'root cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl)}
    },{source,seed,filename,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,filename),generations[2].compiler.compile_ir_string(runtime,'runtime.eli')));
  });
  test("browser JSON parses and serializes ordinary source values with exact text, metadata, indentation and roots", async () => {
    const {source, javascript: seed, filename} = runtimeSeeds.json, runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'})); let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename), bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli')));
        const check = (ok, label) => {if (!ok) throw Error(label);}; check(c.emit_ir_string(p) === seed, 'Seed'); check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'})); const js = await import(jsUrl), a = c.instantiateManagedRuntime(bytes); a.auto(1);
        for (const text of ['null', 'true', '-0', '5e-324', '1e9999', '"\\ud800😀"', '[null,0,{},[]]', '{"b":1,"2":2,"1":3,"b":4,"__proto__":7}']) {
          const input = a.string(text), out = a.invoke('canonical-value', [input]); check(a.readString(out) === js.canonical_value(text), 'canonical');
          const parsed = a.invoke('parse-value', [input]), gap = a.string('😀x'), pretty = a.invoke('pretty-value', [parsed, gap]); check(a.readString(pretty) === JSON.stringify(JSON.parse(text), null, '😀x'), 'pretty');
          for (const value of [input, out, parsed, gap, pretty]) a.release(value); a.collect(); check(a.stats().frameDepth === 0, 'frame');
        }
        for (const text of ['[1,]', '01', '"\\x00"']) {const input = a.string(text); let caught = false; try {a.invoke('parse-value', [input]);} catch (error) {check(error.eliscriptDiagnostic?.code === 'ELI-RT0003', 'syntax'); caught = true;} check(caught, 'invalid accepted'); a.release(input);}
        check(a.invoke('same-parser') === true, 'identity'); a.closeModule(); a.collect(); check(a.live() === 0 && a.stats().frameDepth === 0, 'cleanup'); return [...bytes];
      } finally {URL.revokeObjectURL(url); if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser replacement preserves templates, captured callbacks and UTF16 text entirely in zero-import WASM", async () => {
    const filename = resolve(root, 'tests/fixtures/wasm-managed-replacement.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'browser-replacement-seed.mjs')), runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'})); let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename), bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli')));
        const check = (ok, label) => {if (!ok) throw Error(label);}; check(c.emit_ir_string(p) === seed, 'Seed'); check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'})); const js = await import(jsUrl), a = c.instantiateManagedRuntime(bytes); a.auto(1);
        for (const text of ['', ';中😀 \t', 'ababa', '😀b\ud800', 'x\n']) {
          const input = a.string(text);
          for (const name of ['trim-comment', 'replace-callback']) {const out = a.invoke(name, [input]); check(a.readString(out) === js[name.replaceAll('-', '_')](text), name); a.release(out);}
          const template = a.string("$&:$1:$2:$01:$20:$`:$':$$"), out = a.invoke('replace-captures', [input, template]); check(a.readString(out) === js.replace_captures(text, "$&:$1:$2:$01:$20:$`:$':$$"), 'captures');
          const search = a.string(''), inserted = a.invoke('replace-value', [input, search, template]); check(a.readString(inserted) === js.replace_value(text, '', "$&:$1:$2:$01:$20:$`:$':$$"), 'empty');
          for (const value of [input, template, out, search, inserted]) a.release(value); a.collect(); check(a.stats().frameDepth === 0, 'frame');
        }
        a.closeModule(); a.collect(); check(a.live() === 0 && a.stats().frameDepth === 0, 'cleanup'); return [...bytes];
      } finally {URL.revokeObjectURL(url); if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser array text preserves sparse entries, conversion callbacks, cycle errors and owned UTF16 output without imports", async () => {
    const filename = resolve(root, 'tests/fixtures/wasm-managed-array-text.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'browser-array-text-seed.mjs')), runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'}));let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename), bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli')));
        const check = (ok, label) => {if (!ok) throw Error(label);};check(c.emit_ir_string(p) === seed, 'Seed');check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'}));const js = await import(jsUrl), a = c.instantiateManagedRuntime(bytes);a.auto(1);
        for (const value of [null, undefined, false, true, -0, NaN, Infinity, Number.MIN_VALUE, '', '中😀\ud800']) {
          const x = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value, trace = a.sourceObject({}), object = a.invoke('fallback-value', [trace, x]), values = a.sourceArray([null, object, undefined]), out = a.invoke('default-value', [values]);
          check(a.readString(out) === [null, js.fallback_value({}, value), undefined].join(), 'conversion');
          a.resize(values, 5);const sparse = a.invoke('default-value', [values]);const reference = [null, js.fallback_value({}, value), undefined];reference.length = 5;check(a.readString(sparse) === reference.join(), 'holes');
          for (const v of [x, trace, object, values, out, sparse]) a.release(v);a.collect();check(a.stats().frameDepth === 0, 'frame');
        }
        const cyclic = a.sourceArray([null]);a.set(cyclic, 0, cyclic);const reference = [];reference.push(reference);
        for (const name of ['default-value', 'text-value']) {
          let jsError, wasmError;try {js[name.replaceAll('-', '_')](reference);} catch (error) {jsError = error;}try {a.invoke(name, [cyclic]);} catch (error) {wasmError = error;}
          check(jsError instanceof TypeError && wasmError instanceof TypeError && jsError.eliscriptDiagnostic?.code === 'ELI-RT0009' && wasmError.eliscriptDiagnostic?.code === 'ELI-RT0009', 'cycle error');check(a.stats().frameDepth === 0, 'cycle cleanup');
        }
        a.set(cyclic, 0, null);const recovered = a.invoke('default-value', [cyclic]);check(a.readString(recovered) === '', 'cycle recovery');a.release(cyclic);a.release(recovered);
        // The legacy browser value has typeof undefined but remains an object
        // (and a callable). Guarded JS conversion must use its actual identity.
        const outcome = f => {try {return ['value', f()];} catch (error) {return ['error', error.name];}};
        for (const value of [document.all, {toString: () => document.all, valueOf: () => 7}, {toString: document.all, valueOf: () => 7}, {[Symbol.toPrimitive]: () => document.all}]) {
          const actual = outcome(() => js.join_value([value], '|')), expected = outcome(() => [value].join('|'));
          check(actual[0] === expected[0] && actual[1] === expected[1], 'legacy browser conversion');
        }
        a.closeModule();a.collect();check(a.live() === 0 && a.stats().frameDepth === 0, 'cleanup');return [...bytes];
      } finally {URL.revokeObjectURL(url);if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser represented type queries preserve primitives, captured values, member errors and null predicates without imports", async () => {
    const filename = resolve(root, 'tests/fixtures/wasm-managed-typeof.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'browser-typeof-seed.mjs')), runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'}));let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename), bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli'))), check = (ok, label) => {if (!ok) throw Error(label);};
        check(c.emit_ir_string(p) === seed, 'Seed');check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'}));const js = await import(jsUrl), a = c.instantiateManagedRuntime(bytes);a.auto(1);
        for (const value of [undefined, null, false, true, -0, NaN, Infinity, Number.MIN_VALUE, '', '中😀\ud800']) {
          const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value, box = a.invoke('make-box', [input]), closure = a.invoke('capture', [input]), indexedBox = a.sourceObject({item: input, 'a.b': input}), indexedArray = a.sourceArray([indexedBox]), indexedClosure = a.invoke('capture-index', [indexedArray]);
          for (const [name, argument] of [['type-value', input], ['type-intrinsic', input], ['type-underscore', input], ['type-member', box], ['invoke', closure], ['type-index', indexedArray], ['type-index-key', indexedArray], ['invoke', indexedClosure]]) {const out = a.invoke(name, [argument]);check(a.readString(out) === (name === 'type-intrinsic' ? js.type_intrinsic(value) : typeof value), name);a.release(out);}
          for (const name of ['is-nil', 'is-undefined', 'is-null', 'is-nullish']) check(a.invoke(name, [input]) === js[name.replaceAll('-', '_')](value), name);
          for (const item of [input, box, closure, indexedBox, indexedArray, indexedClosure]) a.release(item);a.collect();check(a.stats().frameDepth === 0, 'frame');
        }
        for (const marker of ['eliscript/keyword', 'eliscript/symbol', 'keyword', 'other']) {const input = a.string(marker), out = a.invoke('type-branded', [input]);check(a.readString(out) === js.type_branded(marker), 'own data brand');a.release(input);a.release(out);}
        let error;try {a.invoke('type-member', [null]);} catch (e) {error = e;}check(error?.eliscriptDiagnostic?.code === 'ELI-RT0003', 'member error');
        const fn = a.getExport('type-value'), label = a.invoke('type-value', [fn]);check(a.readString(label) === 'function', 'function type');a.release(fn);a.release(label);
        a.closeModule();a.collect();check(a.live() === 0 && a.stats().frameDepth === 0, 'cleanup');return [...bytes];
      } finally {URL.revokeObjectURL(url);if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser empty bindings preserve nil defaults, sequential scope and captured mutable cells without imports", async () => {
    const filename = resolve(root, 'tests/fixtures/wasm-managed-empty-bindings.eli'), source = await readFile(filename, 'utf8'), seed = await seedJavascript(filename, resolve(directory, 'browser-empty-bindings-seed.mjs')), runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'})); let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename), bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli')));
        const check = (ok, label) => {if (!ok) throw Error(label);}; check(c.emit_ir_string(p) === seed, 'Seed'); check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'})); const js = await import(jsUrl), a = c.instantiateManagedRuntime(bytes); a.auto(1); check(a.invoke('default-value') === null, 'nil');
        for (const value of [null, undefined, false, true, -0, NaN, Infinity, Number.MIN_VALUE, '', '中😀\ud800']) {
          const input = typeof value === 'number' ? a.number(value) : typeof value === 'string' ? a.string(value) : value;
          for (const name of ['parallel-value', 'sequential-value', 'capture-value']) {const out = a.invoke(name, [input]), read = out && typeof out === 'object' ? out.kind === 4 ? a.readNumber(out) : a.readString(out) : out; check(Object.is(read, js[name.replaceAll('-', '_')](value)), name); a.release(out);}
          a.release(input); a.collect(); check(a.stats().frameDepth === 0, 'frame');
        }
        a.closeModule(); a.collect(); check(a.live() === 0 && a.stats().frameDepth === 0, 'cleanup'); return [...bytes];
      } finally {URL.revokeObjectURL(url); if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser first-class builtins preserve conversion, predicates, identity, callbacks and roots without imports", async () => {
    const {source, javascript: seed, filename} = runtimeSeeds.builtins, runtime = runtimeSeeds.memory.source;
    const bytes = await evaluateBrowser(async ({bundle, source, seed, filename, runtime}) => {
      const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'})); let jsUrl;
      try {
        const c = await import(url), p = c.compile_ir_string(source, filename);
        const bytes = Uint8Array.from(c.emit_managed_wasm(p, c.compile_ir_string(runtime, 'runtime.eli')));
        const check = (ok, label) => {if (!ok) throw Error(label);};
        check(c.emit_ir_string(p) === seed, 'Seed'); check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0, 'imports');
        jsUrl = URL.createObjectURL(new Blob([seed], {type: 'text/javascript'})); const js = await import(jsUrl);
        const a = c.instantiateManagedRuntime(bytes); a.auto(1);
        for (const x of [null, undefined, true, false, '', '-0', '0x10', '中😀', 0, -0, NaN, Infinity, 5e-324, 2 ** 53, 1.5]) {
          const value = typeof x === 'number' ? a.number(x) : typeof x === 'string' ? a.string(x) : x;
          for (const name of ['number-call', 'string-call', 'boolean-call', 'finite-call', 'nan-call', 'integer-call', 'safe-call', 'coercive-finite', 'coercive-nan']) {
            const out = a.invoke(name, [value]), actual = out?.kind === 4 ? a.readNumber(out) : out?.kind === 5 ? a.readString(out) : out;
            check(Object.is(actual, js[name.replaceAll('-', '_')](x)), name); a.release(out);
          }
          a.release(value); a.collect();
        }
        check(a.invoke('same-number') === true && a.invoke('same-finite') === true, 'identity');
        const x = a.string('-0'), values = a.sourceArray([x, true, null]), out = a.invoke('number-map', [values]);
        for (const [index, expected] of [-0, 1, 0].entries()) {const value = a.get(out, index); check(Object.is(a.readNumber(value), expected), 'callback'); a.release(value);}
        check(a.invoke('array-call', [values]) === true, 'array');
        for (const value of [x, values, out]) a.release(value); a.closeModule(); a.collect();
        check(a.live() === 0 && a.stats().frameDepth === 0, 'roots'); return [...bytes];
      } finally {URL.revokeObjectURL(url); if (jsUrl) URL.revokeObjectURL(jsUrl);}
    }, {source, seed, filename, runtime});
    assert.deepEqual(bytes, generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source, filename), generations[2].compiler.compile_ir_string(runtime, 'runtime.eli')));
  });
  test("browser primitive Number conversions match exact IEEE rounding, shortest text and corrected JS primitives without host callbacks", async () => {
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-number-conversion.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,'browser-number-conversion.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16}));
        const check=(value,message)=>{if(!value)throw Error(message);};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:8192,maxBytes:1048576});a.auto(1);
        const box=value=>typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;
        const read=value=>value&&typeof value==='object'?value.kind===4?a.readNumber(value):a.readString(value):value;
        const verify=(name,values,expected)=>{const args=values.map(box),out=a.invoke(name,args);check(Object.is(read(out),expected),name+' WASM');check(Object.is(js[name.replaceAll('-','_')](...values),expected),name+' JS');a.release(out);args.forEach(value=>a.release(value));a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');};
        const hex='0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38';verify('parse',[hex],Number(BigInt(hex)));
        for(const value of[null,false,true,undefined,-0,NaN,Infinity,Number.MIN_VALUE,'','-0','5e-324','2e-324','2.2250738585072012e-308','1.7976931348623157e308','1.7976931348623159e308','0b101','0o777','0x1000000000000001','invalid','１'])verify('parse',[value],typeof value==='string'&&/^0[box]/i.test(value)?Number(BigInt(value)):Number(value));
        for(const value of[null,false,true,undefined,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,1e-7,1e-6,1e20,1e21,.1,1000000000000000100]){verify('text',[value],String(value));verify('named-key',[value],'ok');}
        for(const value of['1','-1','0x2','1.9','NaN','Infinity'])verify('position',[value],'abcdef'.at(value));
        verify('join',[.5,1e21],String(.5)+String(1e21)+String(1e21));
        let seed=0x93f7a281;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},bits=new DataView(new ArrayBuffer(8));
        for(let i=0;i<512;i++){bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);const value=bits.getFloat64(0,true);verify('text',[value],String(value));verify('parse',[String(value)],Number(String(value)));}
        return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-number-conversion.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser mixed primitive operators agree across WASM and JS including exact radix rounding and observable coercion order",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-primitive-operators.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-primitive-operators.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16}));
        const check=(value,message)=>{if(!value)throw Error(message);};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:16384,maxBytes:1048576});a.auto(1);
        const box=x=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x,read=x=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):a.readString(x):x;
        const verify=(name,inputs,expected)=>{const args=inputs.map(box),out=a.invoke(name,args);check(Object.is(read(out),expected),name+' WASM');check(Object.is(js[name.replaceAll('-','_')](...inputs),expected),name+' JS');a.release(out);args.forEach(x=>a.release(x));a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');};
        const values=[null,false,true,undefined,-0,1,NaN,Infinity,'','-0','1.5','0x10','invalid','中😀\ud800'];
        for(const x of values){verify('negate',[x],-Number(x));verify('signed',[x],Number(x)|0);for(const y of values){verify('add',[x,y],x+y);verify('multiply',[x,y],Number(x)*Number(y));verify('less',[x,y],x<y);verify('product-word',[x,y],Math.imul(Number(x),Number(y)));}}
        const hex='0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38',n=Number(BigInt(hex));verify('subtract',[hex,n],0);verify('less-equal',[hex,n],true);verify('negate',[hex],-n);
        for(const limit of[0,1,3,'3'])for(const seed of[-0,.123,'0.123',hex]){let x=seed,total=0;for(let i=0;i<limit;i++){x=(3.8*(typeof x==='string'&&x.startsWith('0x')?Number(BigInt(x)):Number(x)))*(1-(typeof x==='string'&&x.startsWith('0x')?Number(BigInt(x)):Number(x)));total+=x;}verify('scalar-loop',[limit,seed],total);}
        let called=0;const right={valueOf(){called++;return 2;}};try{js.less(Symbol('left'),right);}catch(error){check(error instanceof TypeError,'relational Symbol');}check(called===1,'both relational primitives before numeric error');called=0;try{js.subtract(Symbol('left'),right);}catch(error){check(error instanceof TypeError,'arithmetic Symbol');}check(called===0,'arithmetic left numeric error');
        check(js.subtract({[Symbol.toPrimitive](hint){check(hint==='number','hint');return hex;}},n)===0,'object exact radix');check(js.subtract(5n,2n)===3n,'BigInt');check(js.less('10','2')===true&&js.less('10',2n)===false,'relational categories');
        const shadow=c.emit_ir_string(c.compile_ir_string('(defvar globalThis 7) (defun raw () (js* "globalThis")) (defun change (x) (setq globalThis x)) (defun subtract (x y) (- x y)) (defun word (x y) (imul32 x y)) (export globalThis raw change subtract word)','browser-global-root.eli'));
        const shadowUrl=URL.createObjectURL(new Blob([shadow],{type:'text/javascript'}));try{const m=await import(shadowUrl);check(m.globalThis===7&&m.raw()===7,'lexical globalThis');check(m.subtract(hex,n)===0&&m.word(3,5)===15,'independent intrinsic scope');m.change(9);check(m.globalThis===9&&m.raw()===9,'live globalThis');}finally{URL.revokeObjectURL(shadowUrl);}
        return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-primitive-operators.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser ordinary managed word operations preserve exact remainder, conversions and bit semantics",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-word.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,'browser-word.eli'),rt=c.compile_ir_string(runtime,'runtime.eli');
        const bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),module=new WebAssembly.Module(bytes),check=(v,m)=>{if(!v)throw Error(m);};check(WebAssembly.Module.imports(module).length===0,'imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const ref=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:8192,maxBytes:1048576});a.auto(1);
        const verify=(name,inputs)=>{const args=inputs.map(x=>a.number(x)),out=a.invoke(name,args);check(Object.is(a.readNumber(out),ref[name.replaceAll('-','_')](...inputs)),name);a.release(out);args.forEach(x=>a.release(x));a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');};
        const numbers=[0,-0,.1,-3.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,0xffffffff,0x80000001,2**53+2,2**84];
        for(const x of numbers){for(const name of['signed','unsigned','invert'])verify(name,[x]);for(const y of numbers)for(const name of['remainder','modulo','mask','union','exclusive','shift-left','shift-right','logical-right','multiply','snapshot','remainder-snapshot'])verify(name,[x,y]);}
        for(const x of[-1,0x80000001,0xffffffff])for(const y of[-33,-32,-1,0,1,31,32,33,64])for(const name of['shift-left','shift-right','logical-right'])verify(name,[x,y]);
        for(let e=-1074;e<=1023;e+=17)for(const x of[2**e,-(2**e)])for(const name of['signed','unsigned'])verify(name,[x]);
        for(const inputs of[[1,.1],[Number.MAX_VALUE,3],[Number.MAX_VALUE,Number.MIN_VALUE],[Number.MIN_VALUE*3,Number.MIN_VALUE*2],[-4,2],[0xffffffff,0xffffffff]])for(const name of['remainder','multiply'])verify(name,inputs);
        for(const inputs of[[17,5,2],[-17,5,2],[Number.MAX_VALUE,3,.1]])verify('remainder-many',inputs);
        verify('loop-mix',[128,0xfffffffd]);check(a.stats().collections>1000,'GC');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-word.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser ordinary managed arithmetic preserves IEEE bits, strict equality, order and automatic GC",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-arithmetic.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try {
        const c=await import(url),p=c.compile_ir_string(source,'browser-arithmetic.eli'),rt=c.compile_ir_string(runtime,'runtime.eli');
        const bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),module=new WebAssembly.Module(bytes),check=(v,m)=>{if(!v)throw Error(m);};check(WebAssembly.Module.imports(module).length===0,'imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const ref=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:256,initialBytes:8192,maxBytes:1048576});a.auto(1);
        const box=x=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x,read=x=>x&&typeof x==='object'?x.kind===4?a.readNumber(x):a.readString(x):x;
        const verify=(name,inputs)=>{const handles=inputs.map(box),out=a.invoke(name,handles);check(Object.is(read(out),ref[name.replaceAll('-','_')](...inputs)),name);a.release(out);handles.forEach(x=>a.release(x));a.collect();check(a.live()===0&&a.stats().frameDepth===0,'roots');};
        const numbers=[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,1,-.25];
        for(const x of numbers){for(const name of['negate','reciprocal','increment','decrement'])verify(name,[x]);for(const y of numbers)for(const name of['add','subtract','multiply','divide','equal','distinct','less','less-equal','greater','greater-equal','snapshot'])verify(name,[x,y]);}
        const values=[null,false,true,undefined,...numbers,'','中😀\ud800'];for(const x of values)for(const y of values)for(const name of['equal','identical','distinct'])verify(name,[x,y]);
        for(const x of['','a','aa','\0','中','😀','\ud800'])for(const y of['','a','中','😀','\ud800'])for(const name of['less','less-equal','greater','greater-equal'])verify(name,[x,y]);
        for(const triple of[[1,1e16,-1e16],[1e16,-1e16,1],[Number.MAX_VALUE,2,.5],[1,2,1],[-0,0,-0],[NaN,1,2]])for(const name of['ordered-sum','ordered-product','ordered-subtract','ordered-divide','equal-three','distinct-three','less-three','compare-snapshot'])verify(name,triple);
        for(let i=0;i<20;i++)verify('sum-to',[32]);verify('recursive-sum',[32]);verify('comparison-effects',[2,1]);check(a.stats().collections>1000,'automatic GC');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-arithmetic.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser ordinary Map and Set constructors and live iterators match source JS without host callbacks",async()=>{
    const source=await readFile(resolve(root,'tests/fixtures/wasm-managed-source-collections.eli'),'utf8'),runtime=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-source-collections.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(value,label)=>{if(!value)throw Error(label);};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const js=await import(jsUrl),a=c.instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:32768,maxBytes:1048576});a.auto(1);
        const box=value=>typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value;
        const read=value=>{if(!value||typeof value!=='object')return value;if(value.kind===4)return a.readNumber(value);if(value.kind===5)return a.readString(value);if(value.kind===14)return Array.from({length:a.length(value)},(_,i)=>{const x=a.get(value,i);try{return read(x);}finally{a.release(x);}});if(value.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),x=a.objectGet(value,key);try{Object.defineProperty(out,a.readString(key),{value:read(x),enumerable:true});}finally{a.release(key);a.release(x);}}}finally{a.release(keys);}return out;}throw Error('unexpected source value');};
        const verify=(actual,expected,label)=>{if(expected&&typeof expected==='object'){check(actual&&typeof actual==='object',label);const keys=Object.keys(expected);check(Object.keys(actual).length===keys.length,label+' shape');for(const key of keys)verify(actual[key],expected[key],label);}else check(Object.is(actual,expected),label);};
        const call=(name,args=[])=>{const out=a.invoke(name,args);try{return read(out);}finally{a.release(out);}},list=(value,method='entries')=>{const it=a.invoke(method,[value]),out=[];try{for(;;){const step=call('next',[it]);if(step.done)break;out.push(step.value);}}finally{a.release(it);}return out;};
        const map=a.invoke('empty-map'),set=a.invoke('empty-set'),reference=js.empty_map(),referenceSet=js.empty_set();
        for(const[k,v]of[[null,undefined],[false,null],[true,false],[undefined,true],[-0,-0],[NaN,Infinity],['中😀\ud800','text']]){const key=box(k),value=box(v),written=a.invoke('set-value',[map,key,value]),added=a.invoke('add-value',[set,key]);check(a.keyEqual(map,written)&&a.keyEqual(set,added),'receiver result');a.release(written);a.release(added);js.set_value(reference,k,v);js.add_value(referenceSet,k);verify(call('lookup',[map,key]),js.lookup(reference,k),'get');a.release(key);a.release(value);}
        verify(list(map),[...reference],'entries');verify(list(set,'values'),[...referenceSet],'Set values');verify(call('own-keys',[map]),[],'entries are not own fields');const size=a.string('size');verify(call('own',[map,size]),false,'inherited size');a.release(size);
        const it=a.invoke('entries',[map]),rit=js.entries(reference);verify(call('next',[it]),js.next(rit),'live first');call('clear',[map]);js.clear(reference);const late=a.string('late'),written=a.invoke('set-value',[map,late,true]);a.release(written);js.set_value(reference,'late',true);verify(call('next',[it]),js.next(rit),'live clear/reinsert');verify(call('next',[it]),js.next(rit),'done');
        const word=a.string('a😀a\ud800'),unicode=a.invoke('from-set',[word]);verify(list(unicode,'values'),[...js.from_set('a😀a\ud800')],'code points');const one=a.number(1),two=a.number(2),pair=a.sourceArray([one,two]),input=a.sourceArray([pair]),constructed=a.invoke('from-map',[input]);verify(list(constructed),[...js.from_map([[1,2]])],'entry constructor');
        const holes=a.sourceArray([true,,undefined]),arrayIterator=a.invoke('entries',[holes]),arrayReference=[true,,undefined].entries();for(let i=0;i<4;i++)verify(call('next',[arrayIterator]),arrayReference.next(),'array iteration');
        const marker=a.sourceArray([false]),referenceMarker=[false],get=a.string('get');call('write',[map,get,false]);reference.get=false;let refused=false;try{a.invoke('method-shadow',[map,marker]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused,'method shadow');try{js.method_shadow(reference,referenceMarker);}catch{}verify(read(marker),referenceMarker,'argument effect');const absent=a.string('next');verify(call('read-value',[map,absent]),js.read_value(reference,'next'),'missing member');
        for(const value of[map,set,it,late,word,unicode,one,two,pair,input,constructed,holes,arrayIterator,marker,get,absent])a.release(value);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-source-collections.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser linked projects preserve namespaces, default identity, live imports, cycles and failure ownership",async()=>{
    const fixture=runtimeSeeds.project,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,fixture,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'})),urls=[];
      try{
        const c=await import(url),rt=c.compile_ir_string(runtime,'runtime.eli'),modules=fixture.modules.map(m=>({id:m.id,program:c.compile_ir_string(m.source,m.id)})),bytes=Uint8Array.from(c.emit_managed_project_wasm(modules,fixture.entry,rt,{maximumPages:16}));
        const check=(value,label)=>{if(!value)throw Error(label)},reject=(action,code)=>{let actual;try{action()}catch(e){actual=e.eliscriptDiagnostic?.code}check(actual===code,code)};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'zero imports');
        const stateUrl=URL.createObjectURL(new Blob([c.emit_ir_string(modules[0].program)],{type:'text/javascript'}));urls.push(stateUrl);const entryIR=structuredClone(modules[1].program),rewrite=node=>{if(node.kind==='import-declaration')node.value=stateUrl;for(const child of node.children??[])rewrite(child)};for(const node of entryIR.body)rewrite(node);const entryUrl=URL.createObjectURL(new Blob([c.emit_ir_string(entryIR)],{type:'text/javascript'}));urls.push(entryUrl);const reference=await import(entryUrl);
        const a=c.instantiateManagedRuntime(bytes);a.auto(1);const num=(name,args=[])=>{const out=a.invoke(name,args);try{return a.readNumber(out)}finally{a.release(out)}};check(num('current')===reference.current(),'initial dependency effects');a.initializeModule();check(num('current')===reference.current(),'once');
        const api=a.getExport('api'),initial=a.getExport('initial'),defaultKey=a.string('default'),fromNamespace=a.objectGet(api,defaultKey);check(a.keyEqual(initial,fromNamespace)&&reference.api.default===reference.initial,'default identity');
        const names=a.invoke('names'),actual=[];for(let i=0;i<a.length(names);i++){const name=a.get(names,i);actual.push(a.readString(name));a.release(name)}check(JSON.stringify(actual)===JSON.stringify(reference.names()),'namespace names');
        const aliasInput=a.number(7);check(num('alias',[aliasInput])===reference.alias(7),'emitted-name shadowing');a.release(aliasInput);const copy=a.invoke('snapshot'),expectedCopy=reference.snapshot(),counterKey=a.string('counter'),before=a.objectGet(copy,counterKey);check(a.readNumber(before)===expectedCopy.counter,'snapshot');
        for(const value of[-0,7,Number.MIN_VALUE]){const input=a.number(value),out=a.invoke('increment',[input]);check(Object.is(a.readNumber(out),reference.increment(value)),'live updates');a.release(input);a.release(out);a.collect();const current=a.getExport('counter');check(Object.is(a.readNumber(current),reference.counter),'live reexport');a.release(current)}
        reject(()=>a.invoke('forbidden'),'ELI-RT0003');const snapshot=a.objectGet(copy,counterKey);check(a.readNumber(snapshot)===expectedCopy.counter,'copy is independent');const labelKey=a.string('label'),label=a.objectGet(initial,labelKey);check(a.readString(label)===reference.initial.label,'Unicode');
        for(const value of[api,initial,defaultKey,fromNamespace,names,copy,counterKey,before,snapshot,labelKey,label])a.release(value);a.closeModule();a.collect();check(a.live()===0&&a.stats().frameDepth===0,'all project roots reclaimed');
        const cyclic=[{id:'main.mjs',program:c.compile_ir_string('(import "./other.mjs" result) (defconst value 7) (export value)','main.eli')},{id:'other.mjs',program:c.compile_ir_string('(import "./main.mjs" :as ns) (defconst result (object-keys ns)) (export result)','other.eli')}],failed=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_project_wasm(cyclic,'main.mjs',rt)),{initializeModule:false});failed.auto(1);const keep=failed.number(-0),frame=failed.frame(1);failed.frameSet(frame,0,keep);reject(()=>failed.initializeModule(),'ELI-RT0008');failed.collect();check(failed.stats().frameDepth===1&&failed.live()===2,'cyclic TDZ cleanup');failed.leaveFrame(frame);failed.release(keep);failed.collect();check(failed.live()===0,'caller release');
        const start=runtime.indexOf('  (defun value-module-namespace-bind (heap object key kind index)'),end=runtime.indexOf('  (defun ',start+10);check(start>=0&&end>start,'fault location');const faulty=runtime.slice(0,start)+'  (defun value-module-namespace-bind (heap object key kind index) (load-u32 4294967295))'+String.fromCharCode(10)+runtime.slice(end),broken=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_project_wasm(modules,fixture.entry,c.compile_ir_string(faulty,'project-trap.eli'))),{initializeModule:false}),saved=broken.number(7),caller=broken.frame(1);broken.frameSet(caller,0,saved);let trapped=false;try{broken.initializeModule()}catch(e){trapped=e instanceof WebAssembly.RuntimeError}check(trapped&&broken.stats().frameDepth===1,'actual namespace trap');broken.collect();check(broken.live()===2,'trap graph reclaimed');broken.leaveFrame(caller);broken.release(saved);broken.collect();check(broken.live()===0,'trap caller release');
        return [...bytes];
      }finally{URL.revokeObjectURL(url);for(const value of urls)URL.revokeObjectURL(value)}
    },{fixture,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_project_wasm(fixture.modules.map(m=>({id:m.id,program:generations[2].compiler.compile_ir_string(m.source,m.id)})),fixture.entry,generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });

  test("browser module initialization preserves live exports, isolation, TDZ, GC and failure ownership",async()=>{
    const source=runtimeSeeds.moduleBindings.source,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-module.eli'),rt=c.compile_ir_string(runtime,'runtime.eli'),bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16}));
        const check=(ok,label)=>{if(!ok)throw Error(label)},error=(action,code)=>{let actual;try{action()}catch(e){actual=e.eliscriptDiagnostic?.code}check(actual===code,code)};
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'zero imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const reference=await import(jsUrl);
        const a=c.instantiateManagedRuntime(bytes,{initializeModule:false});a.auto(1);const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
        error(()=>a.getExport('counter'),'ELI-RT0008');error(()=>a.invoke('tick'),'ELI-RT0008');check(a.stats().frameDepth===1,'caller frame before initialization');a.initializeModule();a.initializeModule();
        const num=(name,args=[])=>{const x=a.invoke(name,args);try{return a.readNumber(x)}finally{a.release(x)}};
        check(num('tick')===reference.tick(),'tick');a.initializeModule();check(num('read-counter')===reference.read_counter(),'once');
        const log=a.getExport('initialization-log');check(a.length(log)===3,'source order length');for(let i=0;i<3;i++){const x=a.get(log,i);check(a.readNumber(x)===reference.initialization_log[i],'source order');a.release(x)}
        const state=a.getExport('state'),alias=a.invoke('read-state'),labelKey=a.string('label'),label=a.objectGet(state,labelKey),selfKey=a.string('self'),self=a.objectGet(state,selfKey),valuesKey=a.string('values'),values=a.objectGet(state,valuesKey);
        check(a.keyEqual(state,alias)&&a.keyEqual(state,self),'identity and cycle');check(a.readString(label)===reference.state.label,'UTF16');for(let i=0;i<3;i++){const x=a.get(values,i);check(Object.is(a.readNumber(x),reference.state.values[i]),'binary64');a.release(x)}
        const capture=a.invoke('captured-global'),delta=a.number(7);check(num('emitted-alias',[delta])===reference.emitted_alias(7),'emitted-name shadowing');const assigned=a.invoke('set-current',[capture]);a.release(assigned);const changed=a.invoke('call-current',[delta]);check(a.readNumber(changed)===reference.captured_global()(7),'capture');
        for(let i=0;i<32;i++){const x=a.invoke('allocate');a.release(x);a.collect()}check(num('read-counter')===reference.counter,'global GC root');
        const other=c.instantiateManagedRuntime(bytes),first=other.invoke('tick');check(other.readNumber(first)===1,'heap isolation');other.release(first);other.closeModule();other.collect();check(other.live()===0,'second heap cleanup');
        for(const x of[log,alias,labelKey,label,selfKey,self,valuesKey,values,capture,delta,changed])a.release(x);a.closeModule();a.collect();check(a.stats().frameDepth===1,'close keeps caller frame');const held=a.frameGet(frame,0);check(Object.is(a.readNumber(held),-0),'caller bits');a.release(held);check(state.kind===13,'caller-owned state');a.release(state);a.leaveFrame(frame);a.release(keep);a.collect();check(a.live()===0,'closed module graph reclaimed');error(()=>a.getExport('state'),'ELI-RT0003');
        const tdz='(defconst first (read-later)) (defconst later 7) (defun read-later () later) (export first read-later)',tdzIR=c.compile_ir_string(tdz,'browser-module-tdz.eli');
        const tdzUrl=URL.createObjectURL(new Blob([c.emit_ir_string(tdzIR)],{type:'text/javascript'}));try{let refused=false;try{await import(tdzUrl)}catch(e){refused=e instanceof ReferenceError}check(refused,'independent JS TDZ')}finally{URL.revokeObjectURL(tdzUrl)}
        error(()=>c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_wasm(tdzIR,rt))),'ELI-RT0008');
        const small=c.instantiateManagedRuntime(bytes,{maxSlots:8,initialBytes:4096,maxBytes:8192,initializeModule:false});small.auto(1);const kept=small.number(7),sf=small.frame(1);small.frameSet(sf,0,kept);
        for(let i=0;i<2;i++){error(()=>small.initializeModule(),'ELI-RT0002');small.collect();check(small.stats().frameDepth===1&&small.live()===2,'failed declaration cleanup')}small.leaveFrame(sf);small.release(kept);small.collect();check(small.live()===0,'capacity caller release');
        const start=runtime.indexOf('  (defun value-module-init (heap index value)'),end=runtime.indexOf('  (defun ',start+10);check(start>=0&&end>start,'trap injection location');
        const faulty=runtime.slice(0,start)+'  (defun value-module-init (heap index value) (load-u32 4294967295))'+String.fromCharCode(10)+runtime.slice(end),broken=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_wasm(p,c.compile_ir_string(faulty,'browser-module-trap.eli'))),{initializeModule:false});broken.auto(1);
        const bk=broken.number(9),bf=broken.frame(1);broken.frameSet(bf,0,bk);let trapped=false;try{broken.initializeModule()}catch(e){trapped=e instanceof WebAssembly.RuntimeError}check(trapped&&broken.stats().frameDepth===1,'actual initialization trap');broken.collect();const saved=broken.frameGet(bf,0);check(broken.readNumber(saved)===9&&broken.live()===2,'trap preserves caller');broken.release(saved);broken.leaveFrame(bf);broken.release(bk);broken.collect();check(broken.live()===0,'trap graph cleanup');
        return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl)}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-module.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });

  test("browser array callbacks preserve JS truth, holes, reductions, mutation and actual trap cleanup",async()=>{
    const source=runtimeSeeds.callbacks.source,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-callbacks.eli'),rt=c.compile_ir_string(runtime,'runtime.eli');
        const bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(ok,label)=>{if(!ok)throw Error(label);};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'zero imports');
        const a=c.instantiateManagedRuntime(bytes);a.auto(1);
        const read=x=>{if(x===null||typeof x==='boolean'||x===undefined)return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);const out=[];for(let i=0;i<a.length(x);i++){const key=a.number(i);let own;try{own=a.invoke('has-index',[x,key])}finally{a.release(key)}if(own){const v=a.get(x,i);try{out[i]=read(v)}finally{a.release(v)}}}out.length=a.length(x);return out};
        const same=(x,y)=>Array.isArray(x)&&Array.isArray(y)?x.length===y.length&&Array.from({length:x.length},(_,i)=>(i in x)===(i in y)&&(!(i in x)||same(x[i],y[i]))).every(Boolean):Object.is(x,y);
        const get=(name,args=[])=>{const out=a.invoke(name,args);try{return read(out)}finally{a.release(out)}};
        const f=a.invoke('identity'),zero=a.number(-0),nan=a.number(NaN),tiny=a.number(Number.MIN_VALUE),empty=a.string(''),values=[false,0,-0,NaN,'',Number.MIN_VALUE,true],positiveZero=a.number(0),items=a.sourceArray([false,positiveZero,zero,nan,empty,tiny,true]);
        for(const[name,method]of[['map','map'],['filter','filter'],['for-each','forEach'],['some','some'],['every','every'],['find','find'],['find-index','findIndex'],['find-last','findLast'],['find-last-index','findLastIndex']])check(same(get(name+'-with',[items,f]),values[method](x=>x)),method);
        const sparse=[];sparse.length=5;sparse[2]=tiny;const input=a.sourceArray(sparse),mapped=a.invoke('map-with',[input,f]);const expected=[];expected.length=5;expected[2]=Number.MIN_VALUE;check(same(read(mapped),expected),'map holes');
        const sum=a.invoke('sum-callback'),numbers=a.sourceArray([tiny,zero]),initial=a.number(-0);check(Object.is(get('reduce-initial',[numbers,sum,initial]),Number.MIN_VALUE),'reduce bits');check(Object.is(get('reduce-right-initial',[numbers,sum,initial]),Number.MIN_VALUE),'reduceRight bits');
        const changing=a.sourceArray([true,false,true]),log=a.sourceArray([]),shrinker=a.invoke('shrink-callback',[log]);check(get('find-with',[changing,shrinker])===undefined,'find after shrink');check(same(read(log),[[true,0],[undefined,1],[undefined,2]]),'visit vanished indices');
        const object=a.sourceObject({}),own=a.invoke('shadow-value');check(get('map-shadow',[object,own])===15,'own callable method');let refused=false;try{a.invoke('map-constructor',[items,f,null])}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003'}check(refused,'species refusal');
        for(const x of[f,zero,nan,tiny,empty,positiveZero,items,input,mapped,sum,numbers,initial,changing,log,shrinker,object,own])a.release(x);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'all roots reclaimed');
        const start=runtime.indexOf('  (defun value-js-truth (heap value)'),end=runtime.indexOf('  (defun ',start+10);check(start>=0&&end>start,'fault location');const faulty=runtime.slice(0,start)+'  (defun value-js-truth (heap value) (load-u32 4294967295))'+String.fromCharCode(10)+runtime.slice(end);
        const broken=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_wasm(p,c.compile_ir_string(faulty,'browser-callback-trap.eli'),{maximumPages:16}))),keep=broken.number(7),frame=broken.frame(1),callback=broken.invoke('identity'),target=broken.sourceArray([true]);broken.frameSet(frame,0,keep);let trapped=false;
        try{broken.invoke('some-with',[target,callback])}catch(e){trapped=e instanceof WebAssembly.RuntimeError}check(trapped&&broken.stats().frameDepth===1,'actual callback trap');const saved=broken.frameGet(frame,0);check(broken.readNumber(saved)===7,'caller root');broken.release(saved);broken.leaveFrame(frame);for(const x of[keep,callback,target])broken.release(x);broken.collect();check(broken.live()===0,'trap roots reclaimed');return [...bytes];
      }finally{URL.revokeObjectURL(url);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-callbacks.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser variadic calls and apply preserve defaults, iterable order, captures and failure cleanup",async()=>{
    const source=runtimeSeeds.variadic.source,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-variadic.eli'),rt=c.compile_ir_string(runtime,'runtime.eli');
        const bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(ok,label)=>{if(!ok)throw Error(label);};check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'zero imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const ref=await import(jsUrl),a=c.instantiateManagedRuntime(bytes);a.auto(1);
        const read=x=>{if(x===null||typeof x==='boolean'||x===undefined)return x;if(x.kind===4)return a.readNumber(x);if(x.kind===5)return a.readString(x);const result=[];for(let i=0;i<a.length(x);i++){const v=a.get(x,i);try{result.push(read(v));}finally{a.release(v)}}return result};
        const same=(x,y)=>Array.isArray(x)&&Array.isArray(y)?x.length===y.length&&x.every((v,i)=>same(v,y[i])):Object.is(x,y);
        const get=(name,args=[])=>{const out=a.invoke(name,args);try{return read(out)}finally{a.release(out)}};
        for(const values of[[],[undefined],[false],[null],[-0,undefined,NaN,Infinity,Number.MIN_VALUE]]){const args=values.map(v=>typeof v==='number'?a.number(v):v);check(same(get('mixed',args),ref.mixed(...values)),'defaults and exact bits');for(const x of args)a.release(x);a.collect();}
        const n=a.number(-0),f=a.invoke('mixed-value'),pack=a.invoke('pack-value'),items=a.sourceArray([n,undefined,true]),text=a.string('A😀\ud800Z');
        check(same(get('apply-values',[f,items]),ref.mixed(-0,undefined,true)),'apply arrays');check(same(get('apply-values',[pack,text]),ref.pack(...'A😀\ud800Z')),'code points');
        const holes=[];holes.length=3;const sparse=a.sourceArray(holes);check(same(get('apply-values',[pack,sparse]),[undefined,undefined,undefined]),'holes');
        const set=a.invoke('as-set',[items]);check(same(get('apply-values',[pack,set]),ref.pack(...new Set([-0,undefined,true]))),'Set iteration');
        const pair=a.sourceArray([n,true]),pairs=a.sourceArray([pair]),map=a.invoke('as-map',[pairs]);check(same(get('apply-values',[pack,map]),[[0,true]]),'Map iteration');
        const iter=a.invoke('values-iterator',[items]);let failed=false;try{a.invoke('apply-values',[false,iter])}catch(e){failed=e.eliscriptDiagnostic?.code==='ELI-RT0003'}check(failed&&a.invoke('iterator-done',[iter])===true,'consume before noncallable');
        const capture=a.invoke('make-capture',[n,true]),reference=ref.make_capture(-0,true);for(const x of[undefined,null,false,true]){check(same(get('call-capture',[capture,x]),ref.call_capture(reference,x)),'shared variadic capture');a.collect();}
        for(const size of[127,128,513]){const out=a.invoke('pack',Array(size).fill(true));check(a.length(out)===size&&a.get(out,size-1)===true,'large rest');a.release(out);}
        check(a.invoke('fresh-rest')===false,'fresh identity');for(const x of[n,f,pack,items,text,sparse,set,pair,pairs,map,iter,capture])a.release(x);a.collect();check(a.live()===0&&a.stats().frameDepth===0,'all roots reclaimed');
        const start=runtime.indexOf('  (defun value-call-rest (heap arguments start count)'),end=runtime.indexOf('  (defun ',start+10);check(start>=0&&end>start,'fault location');const faulty=runtime.slice(0,start)+'  (defun value-call-rest (heap arguments start count) (load-u32 4294967295))'+String.fromCharCode(10)+runtime.slice(end);
        const broken=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_wasm(p,c.compile_ir_string(faulty,'browser-variadic-trap.eli'),{maximumPages:16}))),keep=broken.number(7),frame=broken.frame(1);broken.frameSet(frame,0,keep);let trapped=false;
        try{broken.invoke('pack',[true])}catch(e){trapped=e instanceof WebAssembly.RuntimeError}check(trapped&&broken.stats().frameDepth===1,'actual rest trap');const saved=broken.frameGet(frame,0);check(broken.readNumber(saved)===7,'caller root');broken.release(saved);broken.leaveFrame(frame);broken.release(keep);broken.collect();check(broken.live()===0,'trap cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-variadic.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
  });
  test("browser source closures share mutable captures, preserve dynamic effects and reclaim complete graphs",async()=>{
    const source=runtimeSeeds.callables.source,runtime=runtimeSeeds.memory.source;
    const result=await evaluateBrowser(async({bundle,source,runtime})=>{
      const url=URL.createObjectURL(new Blob([bundle],{type:'text/javascript'}));let jsUrl;
      try{
        const c=await import(url),p=c.compile_ir_string(source,'browser-callables.eli'),rt=c.compile_ir_string(runtime,'runtime.eli');
        const bytes=Uint8Array.from(c.emit_managed_wasm(p,rt,{maximumPages:16})),check=(value,label)=>{if(!value)throw Error(label);};
        check(WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length===0,'zero imports');
        jsUrl=URL.createObjectURL(new Blob([c.emit_ir_string(p)],{type:'text/javascript'}));const ref=await import(jsUrl),a=c.instantiateManagedRuntime(bytes);a.auto(1);
        const num=(name,args=[])=>{const v=a.invoke(name,args);try{return a.readNumber(v);}finally{a.release(v);}};
        const four=a.number(4),five=a.number(5),adder=a.invoke('make-adder',[four]);check(num('apply-one',[adder,five])===ref.make_adder(4)(5),'escape');check(num('funcall-one',[adder,five])===9,'funcall');
        const pair=a.invoke('make-box',[four]),write=a.get(pair,0),read=a.get(pair,1),reference=ref.make_box(4);
        for(const value of[-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE]){const n=a.number(value),out=a.invoke('apply-one',[write,n]);check(Object.is(a.readNumber(out),reference[0](value)),'write');a.release(out);a.release(n);a.collect();check(Object.is(num('apply-zero',[read]),reference[1]()),'shared read');}
        const first=a.invoke('nested',[four]),second=a.invoke('apply-one',[first,five]);check(num('apply-one',[second,four])===ref.nested(4)(5)(4),'transitive captures');
        const recursive=a.invoke('recursive'),count=a.number(24);check(num('apply-one',[recursive,count])===ref.recursive()(24),'recursive closure');
        const items=a.invoke('capture-each',[four]);for(let i=0;i<4;i++){const f=a.get(items,i);check(num('apply-zero',[f])===i,'iteration cell');a.release(f);}
        check(a.invoke('named-same')===true&&a.invoke('fresh-same')===false&&a.invoke('repeated-same')===false,'identity');check(num('callee-order')===1,'callee snapshot');
        const marker=a.sourceArray([false]),identity=a.invoke('named-value'),frame=a.frame(1);a.frameSet(frame,0,marker);let refused=false;
        try{a.invoke('invoke-order',[false,marker]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused,'noncallable error');
        const effect=a.get(marker,0);check(a.readNumber(effect)===2,'argument order');a.release(effect);check(a.stats().frameDepth===1,'caller frame');
        check(a.invoke('apply-zero',[identity])===undefined,'omitted required');a.leaveFrame(frame);
        check(a.invoke('direct-missing')===undefined,'direct omission');check(num('direct-extra',[marker])===7,'direct extra');
        const emptyMap=a.invoke('ignored-constructor',[marker]);a.release(emptyMap);const ignored=a.get(marker,0);check(num('apply-zero',[ignored])===7,'ignored operand evaluation');a.release(ignored);
        const many=a.invoke('many-value'),manyLambda=a.invoke('many-lambda');for(const f of[many,manyLambda]){check(num('many-extra',[f,marker])===ref.many_extra(ref.many,[false]),'uniform many arguments');check(Number.isNaN(num('apply-zero',[f])),'omitted many');}
        const parity=a.invoke('parity-functions'),even=a.get(parity,0),odd=a.get(parity,1),parityRef=ref.parity_functions();for(let i=0;i<17;i++){const n=a.number(i);check(a.invoke('apply-one',[even,n])===parityRef[0](i),'even');check(a.invoke('apply-one',[odd,n])===parityRef[1](i),'odd');a.release(n);a.collect();}
        const parallel=a.invoke('parallel-capture',[four]),sequential=a.invoke('sequential-captures',[four]),old=a.get(sequential,0),next=a.get(sequential,1),hygienic=a.invoke('hygienic-capture',[four,five,four,five,four]);
        check(num('apply-zero',[parallel])===4&&num('apply-zero',[old])===4&&num('apply-zero',[next])===9,'capture shadowing');check(num('apply-zero',[hygienic])===22,'ABI hygiene');
        const keys=a.invoke('function-keys'),seven=a.get(keys,0);check(a.readNumber(seven)===7&&a.get(keys,1)===false&&a.get(keys,2)===true,'function keys');a.release(seven);
        const guarded=a.invoke('guarded-box',[four]),badWrite=a.get(guarded,0),goodRead=a.get(guarded,1);refused=false;try{a.invoke('apply-two',[badWrite,false,marker]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused&&num('apply-zero',[goodRead])===4,'failed assignment retains cell');
        const untouched=a.sourceArray([false]);refused=false;try{a.invoke('earlier-failure',[identity,untouched]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0003';}check(refused&&a.get(untouched,0)===false,'first error order');
        const box=a.invoke('make-box',[false]),setter=a.get(box,0),getter=a.get(box,1),self=a.invoke('apply-one',[setter,box]);a.release(self);a.collect();const alias=a.invoke('apply-zero',[getter]);check(a.keyEqual(alias,box),'capture cycle');a.release(alias);
        for(const value of[four,five,adder,pair,write,read,first,second,recursive,count,items,marker,identity,many,manyLambda,parity,even,odd,parallel,sequential,old,next,hygienic,keys,guarded,badWrite,goodRead,untouched,box,setter,getter])a.release(value);
        a.collect();check(a.live()===0&&a.stats().frameDepth===0,'complete cleanup');
        const small=c.instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:4096,maxBytes:16384});small.auto(1);const pressure=small.sourceArray([false]),limit=small.number(10000),caller=small.frame(1);small.frameSet(caller,0,pressure);refused=false;
        try{small.invoke('retain-closures',[pressure,limit]);}catch(e){refused=e.eliscriptDiagnostic?.code==='ELI-RT0002';}check(refused&&small.stats().frameDepth===1,'capacity error and caller frame');small.collect();const last=small.get(pressure,0);check(Number.isInteger(small.readNumber(last))&&small.readNumber(last)<10000,'capacity effects');small.release(last);small.leaveFrame(caller);small.release(pressure);small.release(limit);small.collect();check(small.live()===0,'partial environments reclaimed');
        const start=runtime.indexOf('  (defun value-cell-get (heap cell)'),end=runtime.indexOf('  (defun value-cell-set',start);check(start>=0&&end>start,'fault location');const faulty=runtime.slice(0,start)+'  (defun value-cell-get (heap cell) (load-u32 4294967295))'+String.fromCharCode(10)+runtime.slice(end);
        const broken=c.instantiateManagedRuntime(Uint8Array.from(c.emit_managed_wasm(p,c.compile_ir_string(faulty,'browser-cell-trap.eli'),{maximumPages:16})));broken.auto(1);const bx=broken.number(4),by=broken.number(5),bf=broken.invoke('make-adder',[bx]),bfFrame=broken.frame(1);broken.frameSet(bfFrame,0,bx);let trapped=false;
        try{broken.invoke('apply-one',[bf,by]);}catch(e){trapped=e instanceof WebAssembly.RuntimeError;}check(trapped&&broken.stats().frameDepth===1,'actual indirect trap cleanup');const saved=broken.frameGet(bfFrame,0);check(broken.readNumber(saved)===4,'caller root');broken.release(saved);broken.leaveFrame(bfFrame);for(const v of[bx,by,bf])broken.release(v);broken.collect();check(broken.live()===0,'trap graph cleanup');return [...bytes];
      }finally{URL.revokeObjectURL(url);if(jsUrl)URL.revokeObjectURL(jsUrl);}
    },{source,runtime});
    assert.deepEqual(result,generations[2].managed.emit_managed_wasm(generations[2].compiler.compile_ir_string(source,'browser-callables.eli'),generations[2].compiler.compile_ir_string(runtime,'runtime.eli'),{maximumPages:16}));
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
