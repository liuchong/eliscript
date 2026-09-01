import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_RUNTIME_SCAN_FORMAT =
  "eliscript-compiler-runtime-scan-benchmark";
export const COMPILER_RUNTIME_SCAN_VERSION = 1;

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(directory, "../..");
const compilerSources = Object.freeze([
  "bootstrap/compiler/symbol.eli",
  "bootstrap/compiler/syntax.eli",
  "bootstrap/compiler/reader.eli",
  "bootstrap/compiler/formatter.eli",
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
  "tools/compiler/runtime-scan-benchmark.mjs",
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
        "Usage: bun tools/compiler/runtime-scan-benchmark.mjs " +
          "[--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

export async function compilerRuntimeScanSourceDigest() {
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

function irNode(kind, value = null, children = [], properties = undefined) {
  return {
    kind,
    span: null,
    value,
    children,
    ...(properties === undefined ? {} : { properties }),
  };
}

function requirementExerciseProgram() {
  const literal = (value, literalKind = undefined) => irNode(
    "literal",
    value,
    [],
    literalKind === undefined ? undefined : { literalKind },
  );
  const expression = (node) => irNode("expression-statement", null, [node]);
  return {
    filename: "<runtime-requirement-exercise>",
    body: [
      expression(irNode("react-element", null, [literal("section"), literal(null)])),
      expression(irNode("persistent-vector-literal", null, [literal(1)])),
      expression(irNode("intrinsic", "host-identity-token", [
        irNode("object-literal", null),
      ])),
      expression(irNode("intrinsic", "length", [
        irNode("array-literal", null),
      ])),
      expression(irNode("intrinsic", "car", [
        irNode("persistent-list-literal", null),
      ])),
      expression(irNode("property-read", "get", [
        irNode("reference", "value"),
        literal("static-key", "keyword"),
      ])),
    ],
  };
}

function requirementChecksum(requirements) {
  return Number(requirements.react) +
    Number(requirements.hostIdentityToken) * 2 +
    Number(requirements.literal) * 4 +
    Number(requirements.collection) * 8 +
    Number(requirements.list) * 16;
}

function countProgramNodes(program) {
  let count = 0;
  const stack = [...program.body];
  while (stack.length > 0) {
    const node = stack.pop();
    count += 1;
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
  return count;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(scan, programs, iterations) {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const program of programs) {
      checksum += requirementChecksum(scan(program));
    }
  }
  return { milliseconds: performance.now() - start, checksum };
}

async function loadGeneratedCompiler() {
  const moduleDirectory = path.join(projectDirectory, "dist/bootstrap");
  try {
    const [compiler, emitter] = await Promise.all([
      import(pathToFileURL(path.join(moduleDirectory, "compiler.mjs")).href),
      import(pathToFileURL(path.join(moduleDirectory, "emitter.mjs")).href),
    ]);
    return { compiler, emitter };
  } catch (error) {
    throw new Error(
      "generated compiler is unavailable; run bun run build:bootstrap first",
      { cause: error },
    );
  }
}

export function validateCompilerRuntimeScanReport(report) {
  if (report?.format !== COMPILER_RUNTIME_SCAN_FORMAT ||
      report?.version !== COMPILER_RUNTIME_SCAN_VERSION) {
    throw new TypeError("invalid compiler runtime scan report identity");
  }
  if (report.validation?.equivalent !== true ||
      report.validation?.programs < compilerSources.length + 1 ||
      report.validation?.checksum <= 0) {
    throw new TypeError("compiler runtime scan equivalence was not proven");
  }
  if (!Array.isArray(report.measurements?.optimized?.samplesMs) ||
      !Array.isArray(report.measurements?.reference?.samplesMs) ||
      report.measurements.optimized.samplesMs.length !==
        report.parameters.timingSamples ||
      report.measurements.reference.samplesMs.length !==
        report.parameters.timingSamples) {
    throw new TypeError("compiler runtime scan timing samples are incomplete");
  }
  if (report.decision?.passed !== true ||
      report.measurements.speedup < report.decision.minimumSpeedup) {
    throw new TypeError("compiler runtime scan speedup decision did not pass");
  }
  return report;
}

export async function runCompilerRuntimeScanBenchmark(options = {}) {
  const warmupIterations = parsePositiveInteger(
    options.warmupIterations ??
      process.env.ELISCRIPT_COMPILER_SCAN_WARMUP_ITERATIONS ?? 20,
    "warmup iterations",
  );
  const timingIterations = parsePositiveInteger(
    options.timingIterations ??
      process.env.ELISCRIPT_COMPILER_SCAN_TIMING_ITERATIONS ?? 80,
    "timing iterations",
  );
  const timingSamples = parsePositiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_SCAN_TIMING_SAMPLES ?? 9,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_COMPILER_SCAN_MINIMUM_SPEEDUP ?? 1.25,
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new TypeError("minimum speedup must be greater than 1");
  }

  const { compiler, emitter } = await loadGeneratedCompiler();
  const programs = [];
  let sourceBytes = 0;
  for (const relative of compilerSources) {
    const source = await readFile(path.join(projectDirectory, relative), "utf8");
    sourceBytes += Buffer.byteLength(source);
    programs.push(compiler.compile_ir_string(source, relative));
  }
  programs.push(requirementExerciseProgram());

  let checksum = 0;
  for (const program of programs) {
    const optimized = emitter.runtime_requirements(program);
    const reference = emitter.reference_runtime_requirements(program);
    if (JSON.stringify(optimized) !== JSON.stringify(reference)) {
      throw new Error(
        `runtime requirement mismatch for ${program.filename}: ` +
          `${JSON.stringify(optimized)} != ${JSON.stringify(reference)}`,
      );
    }
    checksum += requirementChecksum(optimized);
  }

  measure(emitter.runtime_requirements, programs, warmupIterations);
  measure(emitter.reference_runtime_requirements, programs, warmupIterations);
  const optimizedSamples = [];
  const referenceSamples = [];
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const order = sample % 2 === 0
      ? [
        [emitter.runtime_requirements, optimizedSamples],
        [emitter.reference_runtime_requirements, referenceSamples],
      ]
      : [
        [emitter.reference_runtime_requirements, referenceSamples],
        [emitter.runtime_requirements, optimizedSamples],
      ];
    let expectedChecksum;
    for (const [scan, samples] of order) {
      const measured = measure(scan, programs, timingIterations);
      samples.push(measured.milliseconds);
      expectedChecksum ??= measured.checksum;
      if (measured.checksum !== expectedChecksum) {
        throw new Error("runtime requirement benchmark checksum drifted");
      }
    }
  }

  const optimizedMedian = median(optimizedSamples);
  const referenceMedian = median(referenceSamples);
  const speedup = referenceMedian / optimizedMedian;
  const report = {
    format: COMPILER_RUNTIME_SCAN_FORMAT,
    version: COMPILER_RUNTIME_SCAN_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerRuntimeScanSourceDigest(),
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
      irNodes: programs.reduce(
        (total, program) => total + countProgramNodes(program),
        0,
      ),
    },
    parameters: { warmupIterations, timingIterations, timingSamples },
    validation: { equivalent: true, programs: programs.length, checksum },
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
  return validateCompilerRuntimeScanReport(report);
}

if (import.meta.main) {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await runCompilerRuntimeScanBenchmark();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(serialized);
  } else {
    await writeFile(path.resolve(output), serialized);
    process.stdout.write(`${path.resolve(output)}\n`);
  }
}
