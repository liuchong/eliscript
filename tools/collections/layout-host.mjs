import process from "node:process";

import {
  DEFAULT_OCCUPANCIES,
  runLayoutHostBenchmark,
} from "./layout-benchmark.mjs";

function positiveEnvironment(name, fallback) {
  const text = process.env[name];
  if (text === undefined) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function occupanciesFromEnvironment() {
  const text = process.env.ELISCRIPT_LAYOUT_OCCUPANCIES;
  return text === undefined
    ? DEFAULT_OCCUPANCIES
    : text.split(",").map((value) => Number(value.trim()));
}

function garbageCollector() {
  if (typeof globalThis.Bun?.gc === "function") {
    return () => globalThis.Bun.gc(true);
  }
  if (typeof globalThis.gc === "function") {
    return () => globalThis.gc();
  }
  return undefined;
}

const runtime = typeof globalThis.Bun === "object" ? "bun" : "node";
const runtimeVersion = runtime === "bun" ? Bun.version : process.versions.node;

const report = await runLayoutHostBenchmark({
  host: {
    id: runtime,
    runtime,
    runtimeVersion,
    engine: runtime === "bun" ? "JavaScriptCore" : "V8",
    platform: process.platform,
    architecture: process.arch,
  },
  occupancies: occupanciesFromEnvironment(),
  lookupIterations: positiveEnvironment("ELISCRIPT_LAYOUT_ITERATIONS", 250_000),
  mutationIterations: positiveEnvironment(
    "ELISCRIPT_LAYOUT_MUTATION_ITERATIONS",
    50_000,
  ),
  timingSamples: positiveEnvironment("ELISCRIPT_LAYOUT_TIMING_SAMPLES", 7),
  memoryNodeCount: positiveEnvironment("ELISCRIPT_LAYOUT_MEMORY_NODES", 20_000),
  memorySamples: positiveEnvironment("ELISCRIPT_LAYOUT_MEMORY_SAMPLES", 3),
  collectGarbage: garbageCollector(),
  heapUsed: runtime === "bun" ? undefined : () => process.memoryUsage().heapUsed,
});

process.stdout.write(`${JSON.stringify(report)}\n`);
