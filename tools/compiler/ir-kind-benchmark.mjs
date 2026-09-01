import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_IR_KIND_FORMAT = "eliscript-compiler-ir-kind-benchmark";
export const COMPILER_IR_KIND_VERSION = 1;

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(directory, "../..");
const compilerSources = Object.freeze([
  "bootstrap/compiler/symbol.eli",
  "bootstrap/compiler/syntax.eli",
  "bootstrap/compiler/reader.eli",
  "bootstrap/compiler/expander.eli",
  "bootstrap/compiler/transient-analysis.eli",
  "bootstrap/compiler/analyzer.eli",
  "bootstrap/compiler/ir.eli",
  "bootstrap/compiler/lower.eli",
  "bootstrap/compiler/source-map.eli",
  "bootstrap/compiler/emitter.eli",
  "bootstrap/compiler/project.eli",
  "bootstrap/compiler/compiler.eli",
]);
const digestFiles = Object.freeze([
  ...compilerSources,
  "tools/compiler/ir-kind-benchmark.mjs",
]);

function parsePositiveInteger(value, name) {
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
      output = arguments_[index + 1];
      if (output === undefined) {
        throw new TypeError("--output requires a path");
      }
      index += 1;
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: bun tools/compiler/ir-kind-benchmark.mjs " +
          "[--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

export async function compilerIrKindSourceDigest() {
  const hash = createHash("sha256");
  for (const relative of digestFiles) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(projectDirectory, relative)));
    hash.update("\0");
  }
  return {
    algorithm: "sha256",
    files: digestFiles,
    value: hash.digest("hex"),
  };
}

function collectProgramNodes(program) {
  const nodes = [];
  const stack = [...program.body];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
  return nodes;
}

function boundaryValues() {
  return [
    null,
    undefined,
    false,
    true,
    0,
    1,
    "",
    "literal",
    Symbol("literal"),
    () => "literal",
    [],
    {},
    { kind: "unknown" },
    { kind: null },
    { kind: Symbol("literal") },
    Object.create({ kind: "literal" }),
    Object.freeze({ kind: "literal" }),
  ];
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(predicate, values, iterations) {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const value of values) {
      checksum += predicate(value) ? 1 : 0;
    }
  }
  return { milliseconds: performance.now() - start, checksum };
}

async function loadGeneratedCompiler() {
  const moduleDirectory = path.join(projectDirectory, "dist/bootstrap");
  try {
    const [compiler, ir] = await Promise.all([
      import(pathToFileURL(path.join(moduleDirectory, "compiler.mjs")).href),
      import(pathToFileURL(path.join(moduleDirectory, "ir.mjs")).href),
    ]);
    return { compiler, ir };
  } catch (error) {
    throw new Error(
      "generated compiler is unavailable; run bun run build:bootstrap first",
      { cause: error },
    );
  }
}

export function validateCompilerIrKindReport(report) {
  if (report?.format !== COMPILER_IR_KIND_FORMAT ||
      report?.version !== COMPILER_IR_KIND_VERSION) {
    throw new TypeError("invalid compiler IR kind report identity");
  }
  if (report.validation?.equivalent !== true ||
      report.validation?.values !==
        report.corpus?.irNodes + report.corpus?.boundaryValues ||
      report.validation?.accepted < report.corpus?.irNodes ||
      report.validation?.checksum <= 0) {
    throw new TypeError("compiler IR kind equivalence was not proven");
  }
  if (!Array.isArray(report.measurements?.optimized?.samplesMs) ||
      !Array.isArray(report.measurements?.reference?.samplesMs) ||
      report.measurements.optimized.samplesMs.length !==
        report.parameters?.timingSamples ||
      report.measurements.reference.samplesMs.length !==
        report.parameters?.timingSamples) {
    throw new TypeError("compiler IR kind timing samples are incomplete");
  }
  if (report.decision?.passed !== true ||
      report.measurements.speedup < report.decision.minimumSpeedup) {
    throw new TypeError("compiler IR kind speedup decision did not pass");
  }
  return report;
}

export async function runCompilerIrKindBenchmark(options = {}) {
  const warmupIterations = parsePositiveInteger(
    options.warmupIterations ??
      process.env.ELISCRIPT_COMPILER_IR_KIND_WARMUP_ITERATIONS ?? 25,
    "warmup iterations",
  );
  const timingIterations = parsePositiveInteger(
    options.timingIterations ??
      process.env.ELISCRIPT_COMPILER_IR_KIND_TIMING_ITERATIONS ?? 100,
    "timing iterations",
  );
  const timingSamples = parsePositiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_IR_KIND_TIMING_SAMPLES ?? 9,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_COMPILER_IR_KIND_MINIMUM_SPEEDUP ?? 1.5,
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new TypeError("minimum speedup must be greater than 1");
  }

  const { compiler, ir } = await loadGeneratedCompiler();
  const programs = [];
  const nodes = [];
  let sourceBytes = 0;
  for (const relative of compilerSources) {
    const source = await readFile(path.join(projectDirectory, relative), "utf8");
    sourceBytes += Buffer.byteLength(source);
    const program = compiler.compile_ir_string(source, relative);
    programs.push(program);
    nodes.push(...collectProgramNodes(program));
  }
  const boundaries = boundaryValues();
  const values = [...nodes, ...boundaries];

  let accepted = 0;
  for (const value of values) {
    const optimized = ir.node_p(value);
    const reference = ir.reference_node_p(value);
    if (!Object.is(optimized, reference)) {
      throw new Error("optimized and reference IR kind decisions differ");
    }
    accepted += optimized ? 1 : 0;
  }

  measure(ir.node_p, values, warmupIterations);
  measure(ir.reference_node_p, values, warmupIterations);
  const optimizedSamples = [];
  const referenceSamples = [];
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const order = sample % 2 === 0
      ? [
        [ir.node_p, optimizedSamples],
        [ir.reference_node_p, referenceSamples],
      ]
      : [
        [ir.reference_node_p, referenceSamples],
        [ir.node_p, optimizedSamples],
      ];
    let expectedChecksum;
    for (const [predicate, samples] of order) {
      const measured = measure(predicate, values, timingIterations);
      samples.push(measured.milliseconds);
      expectedChecksum ??= measured.checksum;
      if (measured.checksum !== expectedChecksum) {
        throw new Error("compiler IR kind benchmark checksum drifted");
      }
    }
  }

  const optimizedMedian = median(optimizedSamples);
  const referenceMedian = median(referenceSamples);
  const speedup = referenceMedian / optimizedMedian;
  const report = {
    format: COMPILER_IR_KIND_FORMAT,
    version: COMPILER_IR_KIND_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerIrKindSourceDigest(),
    host: {
      runtime: "bun",
      runtimeVersion: Bun.version,
      engine: "JavaScriptCore",
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: `${os.type()} ${os.release()}`,
    },
    corpus: {
      files: compilerSources,
      sourceBytes,
      programs: programs.length,
      irNodes: nodes.length,
      boundaryValues: boundaries.length,
    },
    parameters: { warmupIterations, timingIterations, timingSamples },
    validation: {
      equivalent: true,
      values: values.length,
      accepted,
      checksum: accepted * timingIterations,
    },
    measurements: {
      optimized: {
        samplesMs: optimizedSamples,
        medianMs: optimizedMedian,
      },
      reference: {
        samplesMs: referenceSamples,
        medianMs: referenceMedian,
      },
      speedup,
    },
    decision: {
      minimumSpeedup,
      passed: speedup >= minimumSpeedup,
    },
  };
  return validateCompilerIrKindReport(report);
}

if (import.meta.main) {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await runCompilerIrKindBenchmark();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(serialized);
  } else {
    await writeFile(path.resolve(output), serialized);
    process.stdout.write(`${path.resolve(output)}\n`);
  }
}
