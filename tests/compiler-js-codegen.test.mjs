import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "..");
async function run(command, env = {}) {
  const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (status !== 0) throw new Error(stderr || stdout);
  return stdout;
}

const source = `
(defvar events (js-array))
(defun record (v) (js-call events :push v) v)
(defun scope ()
  (let ((x 9))
    (js-array
      (let ((x 2) (y x)) (js-array x y))
      (let* ((x (1+ x)) (next (1+ x))) next)
      (let ((a (record 1)) (b (record 2))) (record 3) (+ a b))
      (let (missing) missing)
      x)))
(defun captures ()
  (let ((i 0) (fns (js-array)))
    (while (< i 3)
      (let ((snapshot i)) (js-call fns :push (lambda () snapshot)))
      (setq i (1+ i)))
    (js-call fns :map (lambda (f) (f)))))
(defun statements ()
  (let ((x 7))
    (let ((x 4)) (setq x 5))
    (progn (record 4) (record 5))
    x))
(defun while-value () (while false (record 99)))
(defun value-context () (+ 10 (let ((v 2)) (record 6) v)))
(defun boolean-order ()
  (js-array (and (< (record 3) 2) (= (record 99) 99))
            (or (= (record 4) 4) (> (record 99) 0))
            (if (not (< 1 2)) 8 9)))
(defun choose (value) (if value 1 0))
(defun negate (value) (not value))
(defun value-and (value) (and value "end"))
(defun value-or (value) (or value "end"))
(defasync async-run ()
  (let ((v (await (Promise/resolve 3))))
    (progn (record 7) (await (Promise/resolve (+ v 1))))))
(defun cleanup ()
  (try (let ((v 8)) (record v) v)
    (finally (let ((v 9)) (record v)))))
(export scope captures statements while-value value-context boolean-order
        choose negate value-and value-or async-run cleanup events)
`;
const evaluator = `
const m = await import(process.argv[1]);
const results = [m.scope(), m.captures(), m.statements(), m.while_value(), m.value_context(), m.boolean_order(), await m.async_run(), m.cleanup(), [...m.events]];
const values = [null, false, undefined, 0, -0, "", NaN, Infinity, [], {}];
const truth = values.map(v => {
  const expected = v !== false && v != null;
  if (m.choose(v) !== Number(expected) || m.negate(v) !== !expected || !Object.is(m.value_and(v), expected ? "end" : v) || !Object.is(m.value_or(v), expected ? v : "end")) throw new Error("truth/value parity");
  return m.choose(v);
});
console.log(JSON.stringify({ results, truth }));
`;

test("JS context lowering preserves scopes, effects, captures, truth values, and async", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-js-codegen-"));
  try {
    const input = resolve(directory, "contexts.eli");
    const output = resolve(directory, "contexts.mjs");
    await writeFile(input, source);
    await run([resolve(root, "bin/eliscript-bootstrap")], { ELISCRIPT_BOOTSTRAP_OUT_DIR: resolve(directory, "compiler") });
    const compiler = await import(pathToFileURL(resolve(directory, "compiler/compiler.mjs")).href);
    const report = JSON.parse(await readFile(resolve(root, "tools/experiments/native-wasm/results/js-codegen-probe-macos-arm64.json"), "utf8"));
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    for (const [file, digest] of Object.entries(report.sourceHashes)) {
      const current = file.startsWith("generated-compiler/")
        ? resolve(directory, "compiler", file.slice("generated-compiler/".length))
        : resolve(root, file);
      expect(hash(await readFile(current))).toBe(digest);
    }
    const original = await readFile(resolve(root, "tools/experiments/native-wasm/results/native-wasm-probe-macos-arm64.json"));
    expect(report.baseline.reportSha256).toBe(hash(original));
    expect(report.baseline.artifactSha256).toBe(JSON.parse(original).artifactHashes["kernels.mjs"]);
    expect(report.baseline.scalarParityChecks).toBe(13);
    expect(report.measurements).toHaveLength(9);
    for (const measurement of report.measurements) {
      expect(measurement.cases).toHaveLength(3);
      for (const row of measurement.cases) expect(row.samplesMs).toHaveLength(27);
    }
    await run([resolve(root, "bin/eliscript-seed"), "--output", output, input]);
    const emitted = compiler.compile_string(source, input);
    expect(emitted).toBe(await readFile(output, "utf8"));
    expect(emitted).toContain('while (__eliscript_numeric_relation("<", i, 3)) {');
    expect(emitted).not.toContain("((snapshot) =>");
    expect(emitted).toContain("return (await (async (v) =>");
    for (const host of [process.env.NODE ?? "node", process.env.BUN ?? "bun"]) {
      const actual = JSON.parse(await run([host, "--input-type=module", "-e", evaluator, pathToFileURL(output).href]));
      expect(actual).toEqual({ results: [[[2, 9], 11, 3, null, 9], [0, 1, 2], 7, null, 12, [false, true, 9], 4, 8, [1, 2, 3, 4, 5, 6, 3, 4, 7, 8, 9]], truth: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1] });
    }
    const kernels = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8");
    const numeric = compiler.compile_string(kernels, "kernels.eli");
    // These pure scalar kernels need no generated closures or truth conversions.
    // Shared primitive helpers are defined once at module scope. The actual
    // kernels still allocate no per-call closures or expression IIFEs.
    const kernelsOnly = numeric.slice(numeric.indexOf("\nfunction recurrence("));
    expect(kernelsOnly).toContain("function escape_grid(");
    expect(kernelsOnly).not.toContain("=>");
    expect(kernelsOnly).not.toContain("function (");
    expect(numeric).not.toContain("__eliscript_truthy(");
    expect(numeric).toContain(" && ");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
