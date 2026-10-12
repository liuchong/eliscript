import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cases, samples, warmups } from "./cases.mjs";

const [mode, modulePath, manifestPath] = process.argv.slice(2);
const loadStart = performance.now();
let functions;
if (mode === "js" || mode === "reference-js") {
  functions = await import(pathToFileURL(modulePath).href);
} else if (mode === "wasm") {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bytes = readFileSync(modulePath);
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module);
  functions = Object.fromEntries(manifest.map((fn) => [fn.name.replaceAll("-", "_"), instance.exports[fn.symbol]]));
} else {
  throw new Error("expected js or wasm");
}
const loadMs = performance.now() - loadStart;
const result = { engine: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`, mode, loadMs, cases: [] };
for (const testCase of cases) {
  const fn = functions[testCase.fn.replaceAll("-", "_")];
  const checksum = [];
  const times = [];
  const run = () => {
    let sum = 0;
    for (let index = 0; index < testCase.calls; index++) {
      // A varying runtime input and consumed result prevent loop elimination.
      sum += fn(testCase.args[0], testCase.args[1] + (index & 7) * 1e-9);
    }
    return sum;
  };
  for (let index = 0; index < warmups; index++) run();
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    checksum.push(run());
    times.push(performance.now() - start);
  }
  result.cases.push({ name: testCase.name, samplesMs: times, checksum });
}
process.stdout.write(JSON.stringify(result));
