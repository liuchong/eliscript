import {
  DEFAULT_OCCUPANCIES,
  runLayoutHostBenchmark,
} from "../layout-benchmark.mjs";

function positiveParameter(parameters, name, fallback) {
  const text = parameters.get(name);
  if (text === null) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function occupanciesParameter(parameters) {
  const text = parameters.get("occupancies");
  return text === null
    ? DEFAULT_OCCUPANCIES
    : text.split(",").map((value) => Number(value.trim()));
}

const parameters = new URLSearchParams(location.search);
const result = document.querySelector("#result");

try {
  const report = await runLayoutHostBenchmark({
    host: {
      id: "chrome",
      runtime: "browser",
      runtimeVersion: navigator.userAgent,
      engine: "V8",
      platform: navigator.platform,
      architecture: navigator.userAgentData?.architecture ?? "unknown",
    },
    occupancies: occupanciesParameter(parameters),
    lookupIterations: positiveParameter(parameters, "iterations", 250_000),
    mutationIterations: positiveParameter(parameters, "mutationIterations", 50_000),
    timingSamples: positiveParameter(parameters, "timingSamples", 7),
    memoryNodeCount: positiveParameter(parameters, "memoryNodes", 20_000),
    memorySamples: positiveParameter(parameters, "memorySamples", 3),
    collectGarbage: typeof globalThis.gc === "function"
      ? () => globalThis.gc()
      : undefined,
    heapUsed: performance.memory === undefined
      ? undefined
      : () => performance.memory.usedJSHeapSize,
  });
  result.textContent = `ELISCRIPT_LAYOUT_RESULT:${JSON.stringify(report)}`;
} catch (error) {
  result.textContent = `ELISCRIPT_LAYOUT_ERROR:${error.stack ?? error.message}`;
}
