import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { emitNumericC } from "./emit-c.mjs";

const root = resolve(import.meta.dir, "../../..");
let directory, compiler;
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120_000, ...extra });
  assert.equal(result.status, 0, `${result.error ?? result.stderr}`);
  return result.stdout;
}
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "eliscript-numeric-backend-test-"));
  run(resolve(root, "bin/eliscript-bootstrap"), [], { env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory } });
  compiler = await import(pathToFileURL(resolve(directory, "compiler.mjs")).href);
}, 120_000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test("numeric IR backend preserves binding, assignment, branch, and IEEE f64 behavior", async () => {
  const source = `
    (defun shadow (x) (let ((x 2) (y x)) (+ x y)))
    (defun sequential (x) (let* ((x 2) (y x)) (+ x y)))
    (defun assignment (x) (let ((a x) (b 3)) (setq a (+ a b) b (* a b)) (+ a b)))
    (defun bounded (x) (let ((i 0) (sum x)) (while (< i 20) (setq sum (/ (+ sum i) 2) i (1+ i))) sum))
    (defun signed-zero (x) (* x 0))
    (defun division (x) (/ x 0))
    (defun branch (x) (if (< x 0) (- 0 x) x))
    (defun large-constant (x) (+ x 100000000000000000000))
    (export shadow sequential assignment bounded signed-zero division branch large-constant)`;
  const ir = compiler.compile_ir_string(source, "numeric-test.eli");
  const { code, functions } = emitNumericC(ir);
  await writeFile(resolve(directory, "test.c"), code);
  await writeFile(resolve(directory, "compiled-numeric.mjs"), compiler.compile_string(source, "numeric-test.eli"));
  run(process.env.ZIG ?? "zig", ["cc", "-target", "wasm32-freestanding", "-O3", "-ffp-contract=off", "-fno-fast-math", "-nostdlib", "-Wl,--no-entry", ...functions.map((fn) => `-Wl,--export=${fn.symbol}`), resolve(directory, "test.c"), "-o", resolve(directory, "test.wasm")]);
  const wasm = new WebAssembly.Instance(new WebAssembly.Module(await readFile(resolve(directory, "test.wasm"))));
  const compiledPath = resolve(directory, "compiled-numeric.mjs");
  // Run the JS oracle in a fresh Node process; it also exercises another engine.
  const oracleCode = `const js = await import(process.argv[1]);
    const values = [-Infinity, -7, -0, 0, 0.123, 9, Infinity, NaN];
    const encode = (value) => Object.is(value, -0) ? "-0" : String(value);
    console.log(JSON.stringify(Object.fromEntries(Object.entries(js).map(([name, fn]) => [name, values.map(value => encode(fn(value)))]))));`;
  const oracle = JSON.parse(run(process.env.NODE ?? "node", ["--input-type=module", "-e", oracleCode, pathToFileURL(compiledPath).href]));
  for (const fn of functions) {
    const values = [-Infinity, -7, -0, 0, 0.123, 9, Infinity, NaN];
    for (const [index, value] of values.entries()) {
      const result = wasm.exports[fn.symbol](value);
      const encoded = Object.is(result, -0) ? "-0" : String(result);
      assert.equal(encoded, oracle[fn.name.replaceAll("-", "_")][index], `${fn.name}(${value})`);
    }
  }
  assert.equal(wasm.exports[functions[0].symbol](9), 11);
  assert.equal(wasm.exports[functions[1].symbol](9), 4);
});

test("probe rejects unsupported language features and unsafe scalar assumptions", () => {
  const sources = [
    '(defun f (x) "text")',
    '(defun f (x) [x])',
    '(defun f (x) (js* "x"))',
    '(defun f (x) (lambda (y) y))',
    '(defun f (x) (g x))',
    '(defun f (x) missing)',
    '(defasync f (x) x)',
    '(defun f (&optional x) x)',
    '(defun f (x) (if 0 x x))',
    '(defun f (x) (while 0 (setq x 1)) x)',
    '(defun f (x) (let ((a t)) (setq a x) x))',
    '(defun f (x) (+ x x x))',
    '(import "host" g) (defun f (x) x)',
    '(defun f (x) (= x 1))',
  ];
  for (const source of sources) {
    assert.throws(() => emitNumericC(compiler.compile_ir_string(source, "rejected.eli")), undefined, source);
  }
});
