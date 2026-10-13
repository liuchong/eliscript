import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm, mkdir, readdir } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { buildBackends, backendModules, root } from "./build.mjs";

const reportPath = resolve(root, "tools/backends/results/direct-wasm-macos-arm64.json");
const inputs = [
  { name: "recurrence-batch", fn: "recurrence_batch", wasmFn: "recurrence-batch", args: [1_000_000, .123, 2] },
  { name: "escape-grid-batch", fn: "escape_grid_batch", wasmFn: "escape-grid-batch", args: [160, 64, 2] },
  { name: "recurrence-tiny-batch", fn: "recurrence_batch", wasmFn: "recurrence-batch", args: [1, .123, 2_000_000] },
];
const parameters = { sessions: 3, warmups: 5, samples: 9, minimumSpeedup: 1 };
const sourceFiles = [
  ...backendModules.map(name => `bootstrap/backends/${name}.eli`),
  ...(await readdir(resolve(root, "bootstrap/compiler"))).filter(f => f.endsWith(".eli")).sort().map(f => `bootstrap/compiler/${f}`),
  "tools/experiments/native-wasm/kernels.eli", "tools/backends/batches.eli",
  "tools/backends/build.mjs", "tools/backends/benchmark.mjs",
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(resolve(root, file)))])));
}

// Shared measurement code executes in fresh Node/Bun processes and pages.
// Samples include only hot execution, not startup, download or instantiation.
function measure(js, wasm, session, inputs, parameters, now) {
  const results = [];
  const order = session & 1 ? ["wasm", "js"] : ["js", "wasm"];
  for (const input of inputs) {
    const measurements = {};
    const expected = js[input.fn](...input.args);
    for (const mode of order) {
      const fn = mode === "js" ? js[input.fn] : wasm[input.wasmFn];
      for (let i = 0; i < parameters.warmups; i++) fn(...input.args);
      const samplesMs = [], checksums = [];
      for (let i = 0; i < parameters.samples; i++) {
        const start = now();
        const checksum = fn(...input.args);
        samplesMs.push(now() - start);
        if (!Object.is(checksum, expected)) throw new Error(`${mode} checksum mismatch: ${input.name}`);
        checksums.push(checksum);
      }
      measurements[mode] = { samplesMs, checksums };
    }
    results.push({ name: input.name, measurements });
  }
  return results;
}

export async function validateDirectWasmReport(report, { verifySources = true } = {}) {
  assert.equal(report.format, "eliscript-direct-wasm-performance");
  assert.equal(report.scope, "numeric-f64 whole-program hot execution; not complete compiler performance");
  assert.deepEqual(report.parameters, parameters, "budgets and sample policy are fixed before measurement");
  assert.deepEqual(report.inputs, inputs);
  if (verifySources) assert.deepEqual(report.sourceHashes, await sourceHashes());
  for (const engine of ["node", "bun", "chromium"]) {
    const sessions = report.sessions.filter(s => s.engine === engine);
    assert.equal(sessions.length, parameters.sessions);
    assert.deepEqual(sessions.map(s => s.session).sort(), [0, 1, 2]);
    for (const session of sessions) {
      assert.equal(session.results.length, inputs.length);
      for (const input of inputs) {
        const result = session.results.find(r => r.name === input.name);
        for (const mode of ["js", "wasm"]) {
          const value = result.measurements[mode];
          assert.equal(value.samplesMs.length, parameters.samples);
          assert.equal(value.checksums.length, parameters.samples);
          assert(value.samplesMs.every(n => Number.isFinite(n) && n > 0));
          assert(value.checksums.every(n => Object.is(n, report.expected[input.name])));
        }
      }
    }
  }
  const expectedSummary = summarize(report.sessions);
  assert.deepEqual(report.summary, expectedSummary);
  assert.deepEqual(report.decision, {
    productionPassed: expectedSummary.every(item => item.speedup >= parameters.minimumSpeedup),
    minimumSpeedup: parameters.minimumSpeedup,
  });
  assert.equal(report.artifacts.wasmImports, 0);
  assert.equal(report.artifacts.externalBackend, false);
  for (const key of ["javascriptSha256", "wasmSha256"]) assert.match(report.artifacts[key], /^[a-f0-9]{64}$/);
  return report;
}

function summarize(sessions) {
  return ["node", "bun", "chromium"].flatMap(engine => inputs.map(input => {
    const samples = mode => sessions.filter(s => s.engine === engine)
      .flatMap(s => s.results.find(r => r.name === input.name).measurements[mode].samplesMs);
    const jsMs = median(samples("js")), wasmMs = median(samples("wasm"));
    return { engine, name: input.name, jsMs, wasmMs, speedup: jsMs / wasmMs };
  }));
}

export async function runDirectWasmBenchmark() {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-direct-wasm-perf-"));
  let server;
  try {
    const { compiler, optimizer, wasm } = await buildBackends({ outputRoot: directory });
    const source = await readFile(resolve(root, "tools/experiments/native-wasm/kernels.eli"), "utf8") + "\n" + await readFile(resolve(root, "tools/backends/batches.eli"), "utf8");
    const program = compiler.compile_ir_string(source, "direct-batches.eli");
    const javascript = compiler.emit_ir_string(optimizer.optimize_program(program));
    const bytes = Uint8Array.from(wasm.emit_numeric_wasm(program));
    const jsPath = resolve(directory, "batches.mjs"), wasmPath = resolve(directory, "batches.wasm");
    await writeFile(jsPath, javascript); await writeFile(wasmPath, bytes);
    const runner = resolve(directory, "run.mjs");
    await writeFile(runner, `import{readFile}from'node:fs/promises';const js=await import(process.argv[2]);const wasm=(await WebAssembly.instantiate(await readFile(process.argv[3]))).instance.exports;const results=(${measure.toString()})(js,wasm,Number(process.argv[4]),${JSON.stringify(inputs)},${JSON.stringify(parameters)},()=>performance.now());console.log(JSON.stringify({version:process.version,results}));`);
    server = createServer((request, response) => {
      response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      response.setHeader("Content-Type", request.url === "/batches.mjs" ? "text/javascript" : request.url === "/batches.wasm" ? "application/wasm" : "text/html");
      response.end(request.url === "/batches.mjs" ? javascript : request.url === "/batches.wasm" ? bytes : "<!doctype html><title>Direct WASM benchmark</title>");
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const sessions = [];
    for (let session = 0; session < parameters.sessions; session++) {
      for (const engine of session & 1 ? ["bun", "node"] : ["node", "bun"]) {
        const result = spawnSync(engine, [runner, pathToFileURL(jsPath).href, wasmPath, String(session)], { encoding: "utf8", timeout: 120_000 });
        assert.equal(result.status, 0, result.stderr);
        sessions.push({ engine, session, ...JSON.parse(result.stdout) });
      }
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const results = await page.evaluate(async ({ code, session, inputs, parameters }) => {
          const js = await import("/batches.mjs");
          const wasm = (await WebAssembly.instantiate(await (await fetch("/batches.wasm")).arrayBuffer())).instance.exports;
          return (0, eval)(`(${code})`)(js, wasm, session, inputs, parameters, () => performance.now());
        }, { code: measure.toString(), session, inputs, parameters });
        sessions.push({ engine: "chromium", session, version: browser.version(), results });
      } finally { await browser.close(); }
    }
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    const report = {
      format: "eliscript-direct-wasm-performance", generatedAt: new Date().toISOString(),
      scope: "numeric-f64 whole-program hot execution; not complete compiler performance",
      environment: { platform: platform(), arch: arch(), cpu: cpus()[0].model },
      parameters, inputs, sourceHashes: await sourceHashes(),
      artifacts: { javascriptSha256: hash(javascript), wasmSha256: hash(bytes), wasmBytes: bytes.length,
        wasmImports: WebAssembly.Module.imports(module).length, externalBackend: false },
      expected: Object.fromEntries(inputs.map(input => [input.name, instance.exports[input.wasmFn](...input.args)])),
      sessions, summary: summarize(sessions),
    };
    report.decision = { productionPassed: report.summary.every(s => s.speedup >= parameters.minimumSpeedup), minimumSpeedup: parameters.minimumSpeedup };
    return await validateDirectWasmReport(report);
  } finally {
    if (server) await new Promise(r => server.close(r));
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.every(a => ["--verify", "--require-production"].includes(a)), "unknown benchmark argument");
  const report = args.length
    ? await validateDirectWasmReport(JSON.parse(await readFile(reportPath, "utf8")))
    : await runDirectWasmBenchmark();
  if (!args.length) {
    await mkdir(resolve(root, "tools/backends/results"), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ summary: report.summary, decision: report.decision }, null, 2));
  if (args.includes("--require-production") && !report.decision.productionPassed) process.exitCode = 1;
}
