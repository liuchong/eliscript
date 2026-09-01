import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_LOCATE_FORMAT = "eliscript-compiler-locate-benchmark";
export const COMPILER_LOCATE_VERSION = 1;

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
  "tools/compiler/locate-benchmark.mjs",
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
        "Usage: bun tools/compiler/locate-benchmark.mjs " +
          "[--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

export async function compilerLocateSourceDigest() {
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

function artifactFragments(artifact) {
  const fragments = [];
  let blockStart = 0;
  while (blockStart < artifact.text.length) {
    const separator = artifact.text.indexOf("\n\n", blockStart);
    const blockEnd = separator === -1 ? artifact.text.length : separator;
    if (blockEnd > blockStart) {
      fragments.push({
        text: artifact.text.slice(blockStart, blockEnd),
        marks: artifact.marks
          .filter((mark) => mark.offset >= blockStart && mark.offset < blockEnd)
          .map((mark) => ({
            offset: mark.offset - blockStart,
            span: mark.span,
          })),
      });
    }
    if (separator === -1) break;
    blockStart = blockEnd + 2;
  }
  return fragments;
}

function shiftedFragment(fragment) {
  if (fragment.text.length <= 1 || fragment.marks.length <= 1) return null;
  return {
    text: fragment.text.slice(1),
    marks: fragment.marks
      .filter((mark) => mark.offset >= 1)
      .map((mark) => ({
        offset: mark.offset - 1,
        span: mark.span,
      })),
  };
}

function resultChecksum(fragment) {
  let checksum = fragment.text.length * 31 + fragment.marks.length;
  for (const mark of fragment.marks) checksum += mark.offset;
  return checksum;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(locate, cases, iterations) {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const item of cases) {
      checksum += resultChecksum(locate(item.node, item.fragment));
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

export function validateCompilerLocateReport(report) {
  if (report?.format !== COMPILER_LOCATE_FORMAT ||
      report?.version !== COMPILER_LOCATE_VERSION) {
    throw new TypeError("invalid compiler locate report identity");
  }
  if (report.validation?.equivalent !== true ||
      report.validation?.cases !== report.corpus?.cases ||
      report.validation?.checksum <= 0) {
    throw new TypeError("compiler locate equivalence was not proven");
  }
  if (!Array.isArray(report.measurements?.optimized?.samplesMs) ||
      !Array.isArray(report.measurements?.reference?.samplesMs) ||
      report.measurements.optimized.samplesMs.length !==
        report.parameters?.timingSamples ||
      report.measurements.reference.samplesMs.length !==
        report.parameters?.timingSamples) {
    throw new TypeError("compiler locate timing samples are incomplete");
  }
  if (report.decision?.passed !== true ||
      report.measurements.speedup < report.decision.minimumSpeedup) {
    throw new TypeError("compiler locate speedup decision did not pass");
  }
  return report;
}

export async function runCompilerLocateBenchmark(options = {}) {
  const warmupIterations = parsePositiveInteger(
    options.warmupIterations ??
      process.env.ELISCRIPT_COMPILER_LOCATE_WARMUP_ITERATIONS ?? 50,
    "warmup iterations",
  );
  const timingIterations = parsePositiveInteger(
    options.timingIterations ??
      process.env.ELISCRIPT_COMPILER_LOCATE_TIMING_ITERATIONS ?? 500,
    "timing iterations",
  );
  const timingSamples = parsePositiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_LOCATE_TIMING_SAMPLES ?? 9,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_COMPILER_LOCATE_MINIMUM_SPEEDUP ?? 1.75,
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new TypeError("minimum speedup must be greater than 1");
  }

  const { compiler, emitter } = await loadGeneratedCompiler();
  const cases = [];
  let sourceBytes = 0;
  let artifactFragmentsCount = 0;
  let shiftedCases = 0;
  for (const relative of compilerSources) {
    const source = await readFile(path.join(projectDirectory, relative), "utf8");
    sourceBytes += Buffer.byteLength(source);
    const program = compiler.compile_ir_string(source, relative);
    const node = program.body[0];
    const fragments = artifactFragments(emitter.emit_module_artifact(program));
    artifactFragmentsCount += fragments.length;
    for (const fragment of fragments) {
      cases.push({ node, fragment });
      const shifted = shiftedFragment(fragment);
      if (shifted !== null) {
        cases.push({ node, fragment: shifted });
        shiftedCases += 1;
      }
    }
  }

  let validationChecksum = 0;
  for (const item of cases) {
    const optimized = emitter.locate(item.node, item.fragment);
    const reference = emitter.reference_locate(item.node, item.fragment);
    if (JSON.stringify(optimized) !== JSON.stringify(reference)) {
      throw new Error("optimized and reference compiler location differ");
    }
    validationChecksum += resultChecksum(optimized);
  }

  measure(emitter.locate, cases, warmupIterations);
  measure(emitter.reference_locate, cases, warmupIterations);
  const optimizedSamples = [];
  const referenceSamples = [];
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const order = sample % 2 === 0
      ? [
        [emitter.locate, optimizedSamples],
        [emitter.reference_locate, referenceSamples],
      ]
      : [
        [emitter.reference_locate, referenceSamples],
        [emitter.locate, optimizedSamples],
      ];
    let expectedChecksum;
    for (const [locate, samples] of order) {
      const measured = measure(locate, cases, timingIterations);
      samples.push(measured.milliseconds);
      expectedChecksum ??= measured.checksum;
      if (measured.checksum !== expectedChecksum) {
        throw new Error("compiler locate benchmark checksum drifted");
      }
    }
  }

  const optimizedMedian = median(optimizedSamples);
  const referenceMedian = median(referenceSamples);
  const speedup = referenceMedian / optimizedMedian;
  const report = {
    format: COMPILER_LOCATE_FORMAT,
    version: COMPILER_LOCATE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerLocateSourceDigest(),
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
      programs: compilerSources.length,
      artifactFragments: artifactFragmentsCount,
      shiftedCases,
      cases: cases.length,
      textBytes: cases.reduce(
        (total, item) => total + Buffer.byteLength(item.fragment.text),
        0,
      ),
      marks: cases.reduce(
        (total, item) => total + item.fragment.marks.length,
        0,
      ),
    },
    parameters: { warmupIterations, timingIterations, timingSamples },
    validation: {
      equivalent: true,
      cases: cases.length,
      checksum: validationChecksum,
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
  return validateCompilerLocateReport(report);
}

if (import.meta.main) {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await runCompilerLocateBenchmark();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(serialized);
  } else {
    await writeFile(path.resolve(output), serialized);
    process.stdout.write(`${path.resolve(output)}\n`);
  }
}
