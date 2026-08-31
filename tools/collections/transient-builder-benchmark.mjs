import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { EMPTY_MAP } from "../../runtime/core/map.mjs";
import { EMPTY_SET } from "../../runtime/core/set.mjs";
import { into } from "../../runtime/core/transducer.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";
import { EMPTY_VECTOR } from "../../runtime/core/vector.mjs";
import {
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  transientMapMetrics,
} from "../../runtime/testing/map.mjs";
import {
  persistentSetMetrics,
  resetPersistentSetMetrics,
  resetTransientSetMetrics,
  transientSetMetrics,
} from "../../runtime/testing/set.mjs";
import {
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
  resetTransientVectorMetrics,
  transientVectorMetrics,
} from "../../runtime/testing/vector.mjs";

export const TRANSIENT_BUILDER_BENCHMARK_FORMAT =
  "eliscript-transient-builder-benchmark";
export const TRANSIENT_BUILDER_BENCHMARK_VERSION = 1;

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(directory, "../..");
const toolFile = "tools/collections/transient-builder-benchmark.mjs";
const testingFiles = [
  "runtime/testing/map.mjs",
  "runtime/testing/set.mjs",
  "runtime/testing/vector.mjs",
];

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") {
      output = arguments_[++index];
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: bun tools/collections/transient-builder-benchmark.mjs " +
          "[--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

async function sourceFiles() {
  const coreDirectory = path.join(projectDirectory, "runtime/core");
  const coreFiles = (await readdir(coreDirectory))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => `runtime/core/${name}`)
    .sort();
  return [...coreFiles, ...testingFiles, toolFile];
}

export async function transientBuilderSourceDigest() {
  const files = await sourceFiles();
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(projectDirectory, relative)));
    hash.update("\0");
  }
  return { algorithm: "sha256", files, value: hash.digest("hex") };
}

function median(samples) {
  const values = [...samples].sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function measure(run, observe) {
  const start = performance.now();
  const value = run();
  const milliseconds = performance.now() - start;
  const observation = observe(value);
  if (observation.valid !== true) {
    throw new Error("transient builder produced an invalid result");
  }
  return { milliseconds, observation };
}

function makeCases(parameters) {
  const vectorValues = Array.from(
    { length: parameters.vectorSize },
    (_, index) => index,
  );
  const mapEntries = Array.from(
    { length: parameters.mapSize },
    (_, index) => Object.freeze([index, index * 2]),
  );
  const setValues = Array.from(
    { length: parameters.setSize },
    (_, index) => index,
  );
  return [
    {
      name: "vector",
      size: parameters.vectorSize,
      persistent() {
        let value = EMPTY_VECTOR;
        for (const item of vectorValues) value = value.conj(item);
        return value;
      },
      transient() { return into(EMPTY_VECTOR, vectorValues); },
      observe(value) {
        return {
          valid: value.count === vectorValues.length &&
            value.nth(0) === 0 &&
            value.nth(vectorValues.length - 1) === vectorValues.length - 1,
          count: value.count,
          first: value.nth(0),
          last: value.nth(vectorValues.length - 1),
        };
      },
      resetPersistent: resetPersistentVectorMetrics,
      persistentMetrics: persistentVectorMetrics,
      resetTransient: resetTransientVectorMetrics,
      transientMetrics: transientVectorMetrics,
      persistentCallField: "persistentCalls",
    },
    {
      name: "map",
      size: parameters.mapSize,
      persistent() {
        let value = EMPTY_MAP;
        for (const [key, item] of mapEntries) value = value.assoc(key, item);
        return value;
      },
      transient() { return into(EMPTY_MAP, mapEntries); },
      observe(value) {
        return {
          valid: value.count === mapEntries.length &&
            value.get(0) === 0 &&
            value.get(mapEntries.length - 1) === (mapEntries.length - 1) * 2,
          count: value.count,
          first: value.get(0),
          last: value.get(mapEntries.length - 1),
        };
      },
      resetPersistent: resetPersistentMapMetrics,
      persistentMetrics: persistentMapMetrics,
      resetTransient: resetTransientMapMetrics,
      transientMetrics: transientMapMetrics,
      persistentCallField: "persistentCalls",
    },
    {
      name: "set",
      size: parameters.setSize,
      persistent() {
        let value = EMPTY_SET;
        for (const item of setValues) value = value.conj(item);
        return value;
      },
      transient() { return into(EMPTY_SET, setValues); },
      observe(value) {
        return {
          valid: value.count === setValues.length &&
            value.has(0) && value.has(setValues.length - 1),
          count: value.count,
          first: value.has(0),
          last: value.has(setValues.length - 1),
        };
      },
      resetPersistent: resetPersistentSetMetrics,
      persistentMetrics: persistentSetMetrics,
      resetTransient: resetTransientSetMetrics,
      transientMetrics: transientSetMetrics,
      persistentCallField: "setPersistentCalls",
    },
  ];
}

function correctnessEvidence(item) {
  const persistent = item.persistent();
  const transient = item.transient();
  const persistentObservation = item.observe(persistent);
  const transientObservation = item.observe(transient);
  const persistentHash = hashValue(persistent);
  const transientHash = hashValue(transient);
  return {
    equivalent: equalValues(persistent, transient),
    sameHash: persistentHash === transientHash,
    persistentHash,
    transientHash,
    persistentObservation,
    transientObservation,
  };
}

function allocationEvidence(item) {
  item.resetPersistent();
  item.persistent();
  const persistent = item.persistentMetrics();
  item.resetPersistent();
  item.resetTransient();
  item.transient();
  const productionPersistent = item.persistentMetrics();
  const productionTransient = item.transientMetrics();
  return {
    persistentNodeAllocations: persistent.nodeAllocations,
    transientNodeAllocations: productionPersistent.nodeAllocations,
    allocationRatio:
      productionPersistent.nodeAllocations / persistent.nodeAllocations,
    transientMetrics: productionTransient,
    completionCalls: productionTransient[item.persistentCallField],
  };
}

function timingEvidence(item, parameters) {
  for (let index = 0; index < parameters.warmupRounds; index += 1) {
    measure(item.persistent, item.observe);
    measure(item.transient, item.observe);
  }
  const persistentSamplesMs = [];
  const transientSamplesMs = [];
  for (let sample = 0; sample < parameters.timingSamples; sample += 1) {
    const transientFirst = sample % 2 === 1;
    const order = transientFirst
      ? [[item.transient, transientSamplesMs],
        [item.persistent, persistentSamplesMs]]
      : [[item.persistent, persistentSamplesMs],
        [item.transient, transientSamplesMs]];
    for (const [run, samples] of order) {
      samples.push(measure(run, item.observe).milliseconds);
    }
  }
  const persistentMedianMs = median(persistentSamplesMs);
  const transientMedianMs = median(transientSamplesMs);
  return {
    persistentSamplesMs,
    transientSamplesMs,
    persistentMedianMs,
    transientMedianMs,
    speedup: persistentMedianMs / transientMedianMs,
  };
}

export function validateTransientBuilderReport(report) {
  if (report?.format !== TRANSIENT_BUILDER_BENCHMARK_FORMAT ||
      report?.version !== TRANSIENT_BUILDER_BENCHMARK_VERSION) {
    throw new TypeError("invalid transient builder benchmark identity");
  }
  const samples = report.parameters?.timingSamples;
  for (const name of ["vector", "map", "set"]) {
    const result = report.results?.[name];
    if (!Array.isArray(result?.timing?.persistentSamplesMs) ||
        !Array.isArray(result?.timing?.transientSamplesMs) ||
        result.timing.persistentSamplesMs.length !== samples ||
        result.timing.transientSamplesMs.length !== samples ||
        result.correctness?.equivalent !== true ||
        result.correctness?.sameHash !== true ||
        result.correctness?.persistentObservation?.valid !== true ||
        result.correctness?.transientObservation?.valid !== true ||
        result.allocation?.persistentNodeAllocations <= 0 ||
        result.allocation?.transientNodeAllocations < 0 ||
        result.allocation?.allocationRatio >
          report.decision.maximumAllocationRatio ||
        result.allocation?.completionCalls !== 1 ||
        result.timing?.speedup < report.decision.minimumSpeedup) {
      throw new TypeError(`transient ${name} builder evidence failed`);
    }
  }
  if (report.decision?.passed !== true) {
    throw new TypeError("transient builder benchmark decision failed");
  }
  return report;
}

export async function runTransientBuilderBenchmark(options = {}) {
  const parameters = {
    vectorSize: positiveInteger(
      options.vectorSize ?? process.env.ELISCRIPT_TRANSIENT_VECTOR_SIZE ??
        200_000,
      "vector size",
    ),
    mapSize: positiveInteger(
      options.mapSize ?? process.env.ELISCRIPT_TRANSIENT_MAP_SIZE ?? 100_000,
      "map size",
    ),
    setSize: positiveInteger(
      options.setSize ?? process.env.ELISCRIPT_TRANSIENT_SET_SIZE ?? 100_000,
      "set size",
    ),
    warmupRounds: positiveInteger(
      options.warmupRounds ??
        process.env.ELISCRIPT_TRANSIENT_BUILDER_WARMUP_ROUNDS ?? 2,
      "warmup rounds",
    ),
    timingSamples: positiveInteger(
      options.timingSamples ??
        process.env.ELISCRIPT_TRANSIENT_BUILDER_TIMING_SAMPLES ?? 11,
      "timing samples",
    ),
  };
  if (parameters.timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_TRANSIENT_BUILDER_MINIMUM_SPEEDUP ?? 1.5,
  );
  const maximumAllocationRatio = Number(
    options.maximumAllocationRatio ??
      process.env.ELISCRIPT_TRANSIENT_BUILDER_MAXIMUM_ALLOCATION_RATIO ??
        (1 / 3),
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1 ||
      !Number.isFinite(maximumAllocationRatio) ||
      maximumAllocationRatio <= 0 || maximumAllocationRatio >= 1) {
    throw new TypeError("invalid transient builder decision thresholds");
  }

  const results = {};
  for (const item of makeCases(parameters)) {
    results[item.name] = {
      size: item.size,
      correctness: correctnessEvidence(item),
      allocation: allocationEvidence(item),
      timing: timingEvidence(item, parameters),
    };
  }
  const passed = Object.values(results).every((result) =>
    result.correctness.equivalent && result.correctness.sameHash &&
    result.allocation.allocationRatio <= maximumAllocationRatio &&
    result.allocation.completionCalls === 1 &&
    result.timing.speedup >= minimumSpeedup
  );
  return validateTransientBuilderReport({
    format: TRANSIENT_BUILDER_BENCHMARK_FORMAT,
    version: TRANSIENT_BUILDER_BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await transientBuilderSourceDigest(),
    host: {
      runtime: "bun",
      runtimeVersion: Bun.version,
      engine: "JavaScriptCore",
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: `${os.type()} ${os.release()}`,
    },
    parameters,
    results,
    decision: { minimumSpeedup, maximumAllocationRatio, passed },
  });
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const report = await runTransientBuilderBenchmark();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(options.output), json);
  else process.stdout.write(json);
}
