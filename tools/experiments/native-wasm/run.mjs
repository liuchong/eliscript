#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emitNumericC } from "./emit-c.mjs";
import { cases, samples, summarize, warmups } from "./cases.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!["--out", "--compiler-dir"].includes(key) || !process.argv[index + 1]) throw new Error("usage: node run.mjs [--out DIR] [--compiler-dir DIR]");
  options.set(key, process.argv[index + 1]);
}
const out = resolve(options.get("--out") ?? resolve(root, "dist/native-wasm-probe"));
const compilerDirectory = resolve(options.get("--compiler-dir") ?? resolve(out, "compiler"));
await mkdir(out, { recursive: true });
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024, ...extra });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
}
if (!options.has("--compiler-dir")) {
  run(resolve(root, "bin/eliscript-bootstrap"), [], { env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory } });
}
const compiler = await import(pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href);
const sourcePath = resolve(here, "kernels.eli");
const filename = "tools/experiments/native-wasm/kernels.eli";
const source = await readFile(sourcePath, "utf8");
const start = performance.now();
const ir = compiler.compile_ir_string(source, filename);
const { code, functions } = emitNumericC(ir);
const frontendAndCEmissionMs = performance.now() - start;
const irPath = resolve(out, "kernels.ir.json");
await writeFile(irPath, compiler.serialize_ir_program(ir));
await writeFile(resolve(out, "kernels.c"), code);
await writeFile(resolve(out, "functions.json"), JSON.stringify(functions));
await writeFile(resolve(out, "kernels.mjs"), compiler.compile_string(source, filename));
// An independent frontend path must produce the same JavaScript artifact.
run(resolve(root, "bin/eliscript-seed"), ["--output", resolve(out, "seed.mjs"), sourcePath]);
assert.equal(await readFile(resolve(out, "seed.mjs"), "utf8"), await readFile(resolve(out, "kernels.mjs"), "utf8"));

const prototypes = functions.map((fn) => `extern double ${fn.symbol}(${Array(fn.arity).fill("double").join(", ")});`).join("\n");
const nativeCases = cases.map((testCase) => {
  const fn = functions.find((entry) => entry.name === testCase.fn);
  return `{"${testCase.name}", ${fn.symbol}, ${testCase.args[0]}, ${testCase.args[1]}, ${testCase.calls}}`;
});
const evaluator = functions.map((fn) => `if (strcmp(argv[2], "${fn.name}") == 0) { printf("%.17g\\n", ${fn.symbol}(strtod(argv[3], NULL), strtod(argv[4], NULL))); return 0; }`).join("\n");
await writeFile(resolve(out, "main.c"), `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
${prototypes}
typedef double (*kernel)(double, double);
struct bench { const char *name; kernel fn; double a, b; int calls; };
static double now_ms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
static double execute(struct bench b) { double sum = 0; for (int i = 0; i < b.calls; i++) sum += b.fn(b.a, b.b + (i & 7) * 1e-9); return sum; }
int main(int argc, char **argv) {
  if (argc == 5 && strcmp(argv[1], "--eval") == 0) { ${evaluator} return 2; }
  struct bench cases[] = {${nativeCases.join(",\n")}};
  volatile double warm_checksum = 0;
  printf("{\\"cases\\":[");
  for (unsigned c = 0; c < sizeof(cases)/sizeof(cases[0]); c++) {
    if (c) printf(",");
    for (int w = 0; w < ${warmups}; w++) warm_checksum += execute(cases[c]);
    double times[${samples}], sums[${samples}];
    for (int s = 0; s < ${samples}; s++) { double t = now_ms(); sums[s] = execute(cases[c]); times[s] = now_ms() - t; }
    printf("{\\"name\\":\\"%s\\",\\"samplesMs\\":[", cases[c].name);
    for (int s = 0; s < ${samples}; s++) printf("%s%.9g", s ? "," : "", times[s]);
    printf("],\\"checksum\\":[");
    for (int s = 0; s < ${samples}; s++) printf("%s%.17g", s ? "," : "", sums[s]);
    printf("]}");
  }
  printf("]}\\n"); return 0;
}
`);
const native = resolve(out, "kernels-native");
const wasm = resolve(out, "kernels.wasm");
const cc = process.env.CC ?? "clang";
const zig = process.env.ZIG ?? "zig";
const buildTimes = {};
let buildStart = performance.now();
run(cc, ["-O3", "-ffp-contract=off", "-fno-fast-math", resolve(out, "kernels.c"), resolve(out, "main.c"), "-o", native]);
buildTimes.nativeMs = performance.now() - buildStart;
buildStart = performance.now();
run(zig, ["cc", "-target", "wasm32-freestanding", "-O3", "-ffp-contract=off", "-fno-fast-math", "-nostdlib", "-Wl,--no-entry", ...functions.map((fn) => `-Wl,--export=${fn.symbol}`), resolve(out, "kernels.c"), "-o", wasm]);
buildTimes.wasmMs = performance.now() - buildStart;

const bytes = await readFile(wasm);
const wasmModule = new WebAssembly.Module(bytes);
assert.deepEqual(WebAssembly.Module.imports(wasmModule), []);
const wasmInstance = new WebAssembly.Instance(wasmModule);
const js = await import(pathToFileURL(resolve(out, "kernels.mjs")).href);
const referenceJsPath = resolve(here, "reference-js.mjs");
const referenceJs = await import(pathToFileURL(referenceJsPath).href);
let parityChecks = 0;
for (const fn of functions) {
  const inputs = fn.name === "recurrence"
    ? [[0, 0.123], [1, 0.123], [17, 0.71], [1000, 0.31], [1_000_000, 0.123], [0, -0], [1, NaN], [1, Infinity]]
    : [[0, 64], [1, 1], [8, 10], [32, 64], [160, 64]];
  for (const args of inputs) {
    const expected = js[fn.name.replaceAll("-", "_")](...args);
    assert(Object.is(referenceJs[fn.name.replaceAll("-", "_")](...args), expected), `reference JS parity: ${fn.name} ${args}`);
    assert(Object.is(wasmInstance.exports[fn.symbol](...args), expected), `WASM parity: ${fn.name} ${args}`);
    const text = run(native, ["--eval", fn.name, ...args.map(String)]);
    const actual = /^-?inf$/i.test(text) ? (text[0] === "-" ? -Infinity : Infinity) : Number(text);
    assert(Object.is(actual, expected), `native parity: ${fn.name} ${args}: ${text} vs ${expected}`);
    parityChecks += 2;
  }
}

const engines = [process.env.NODE ?? "node", process.env.BUN ?? "bun"];
const worker = resolve(here, "measure-js.mjs");
const measurements = [];
// Rotate variants between fresh processes rather than measuring only one order.
const variants = engines.flatMap((engine) => ["js", "reference-js", "wasm"].map((mode) => ({ engine, mode })));
variants.push({ engine: native, mode: "native" });
const sessions = new Map(variants.map((variant) => [`${variant.engine}:${variant.mode}`, []]));
for (let round = 0; round < 3; round++) {
  const order = [...variants.slice(round), ...variants.slice(0, round)];
  for (const variant of order) {
    const args = variant.mode === "native" ? [] : [worker, variant.mode, variant.mode === "js" ? resolve(out, "kernels.mjs") : variant.mode === "reference-js" ? referenceJsPath : wasm, resolve(out, "functions.json")];
    sessions.get(`${variant.engine}:${variant.mode}`).push(JSON.parse(run(variant.engine, args)));
  }
}
const reference = sessions.get(`${engines[0]}:js`)[0];
for (const variant of variants) {
  const records = sessions.get(`${variant.engine}:${variant.mode}`);
  const record = { engine: variant.mode === "native" ? "native" : records[0].engine, mode: variant.mode, cases: [] };
  if (variant.mode !== "native") record.loadMs = records.map((entry) => entry.loadMs);
  for (const testCase of cases) {
    const rows = records.map((entry) => entry.cases.find((row) => row.name === testCase.name));
    const expected = reference.cases.find((row) => row.name === testCase.name).checksum[0];
    for (const row of rows) for (const sum of row.checksum) assert.equal(sum, expected, `${record.engine} ${record.mode}: checksum`);
    record.cases.push({ ...testCase, ...summarize(rows.flatMap((row) => row.samplesMs)), checksum: expected, sessionMediansMs: rows.map((row) => summarize(row.samplesMs).medianMs) });
  }
  // Fresh process + one minimal result, OS caches warm; includes parent spawn overhead.
  const firstResult = [];
  for (let index = 0; index < samples; index++) {
    const begin = performance.now();
    if (variant.mode === "native") {
      assert.equal(Number(run(native, ["--eval", "recurrence", "1", "0.123"])), js.recurrence(1, 0.123));
    } else {
      const evalCode = variant.mode !== "wasm"
        ? "const m=await import(process.argv[1]); console.log(m.recurrence(1,0.123));"
        : "const fs=await import('node:fs'); const m=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(process.argv[1]))); console.log(m.exports.eli_0(1,0.123));";
      const input = variant.mode === "js" ? pathToFileURL(resolve(out, "kernels.mjs")).href : variant.mode === "reference-js" ? pathToFileURL(referenceJsPath).href : wasm;
      assert.equal(Number(run(variant.engine, ["--input-type=module", "-e", evalCode, input])), js.recurrence(1, 0.123));
    }
    firstResult.push(performance.now() - begin);
  }
  record.freshProcessFirstResult = summarize(firstResult);
  measurements.push(record);
}
const boundPaths = ["kernels.eli", "emit-c.mjs", "cases.mjs", "measure-js.mjs", "reference-js.mjs", "run.mjs"];
const hashes = {};
for (const file of boundPaths) hashes[`tools/experiments/native-wasm/${file}`] = createHash("sha256").update(await readFile(resolve(here, file))).digest("hex");
for (const file of (await readdir(compilerDirectory)).filter((file) => file.endsWith(".mjs")).sort()) hashes[`generated-compiler/${file}`] = createHash("sha256").update(await readFile(resolve(compilerDirectory, file))).digest("hex");
const artifactNames = ["kernels.ir.json", "kernels.mjs", "kernels.c", "kernels.wasm", "kernels-native"];
const artifactHashes = {};
for (const file of artifactNames) artifactHashes[file] = createHash("sha256").update(await readFile(resolve(out, file))).digest("hex");
const report = {
  format: "eliscript-native-wasm-probe", version: 1, measuredAt: new Date().toISOString(),
  gitBase: run("git", ["rev-parse", "HEAD"]), sourceHashes: hashes, artifactHashes,
  host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0].model },
  toolchain: { node: run(engines[0], ["--version"]), bun: run(engines[1], ["--version"]), cc: run(cc, ["--version"]).split("\n")[0], zig: run(zig, ["version"]) },
  scope: "Experimental f64-only IR backend; not full Eliscript native/WASM support or a browser benchmark",
  methodology: { warmups, samplesPerSession: samples, sessions: 3, noFastMath: true, fpContract: "off", freshProcess: "OS caches warm, parent spawn + load + one result; not cold boot", nativeBoundary: "in-process C call, not JS FFI", wasmBoundary: "scalar JS/WASM calls; no array serialization" },
  validation: { seedSelfHostedJsEqual: true, scalarParityChecks: parityChecks, referenceJsChecks: parityChecks / 2, measuredChecksumsEqual: true, wasmImports: [] },
  compilation: { frontendAndCEmissionMs, ...buildTimes },
  artifactBytes: Object.fromEntries(await Promise.all(artifactNames.map(async (file) => [file, (await stat(resolve(out, file))).size]))),
  measurements,
};
await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: resolve(out, "report.json"), validation: report.validation, results: measurements.map((entry) => ({ engine: entry.engine, mode: entry.mode, medianMs: entry.cases.map((row) => [row.name, row.medianMs]), firstResultMs: entry.freshProcessFirstResult.medianMs })) }, null, 2));
