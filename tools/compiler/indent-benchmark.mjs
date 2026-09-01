import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_INDENT_FORMAT = "eliscript-compiler-indent-benchmark";
export const COMPILER_INDENT_VERSION = 1;

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
  "tools/compiler/indent-benchmark.mjs",
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
        "Usage: bun tools/compiler/indent-benchmark.mjs " +
          "[--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

export async function compilerIndentSourceDigest() {
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

function span(filename, offset, line = 1) {
  return { filename, start: offset, end: offset + 1, line, column: offset };
}

function sourceBoundFragments(artifact) {
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

function boundaryFragments() {
  return [
    { text: "", marks: [] },
    { text: "", marks: [{ offset: 0, span: span("empty", 0) }] },
    { text: "\n", marks: [{ offset: 0, span: span("blank", 0) }] },
    { text: "\n\n", marks: [
      { offset: 0, span: span("blank-lines", 0) },
      { offset: 1, span: span("blank-lines", 1, 2) },
    ] },
    { text: "a", marks: [
      { offset: 0, span: span("single", 0) },
      { offset: 0, span: span("single-duplicate", 0) },
      { offset: 1, span: span("single-tail", 1) },
    ] },
    { text: "a\n", marks: [
      { offset: 0, span: span("trailing-newline", 0) },
      { offset: 1, span: span("trailing-newline", 1) },
      { offset: 2, span: span("trailing-newline-tail", 2) },
    ] },
    { text: "\na", marks: [
      { offset: 0, span: span("leading-newline", 0) },
      { offset: 1, span: span("leading-newline", 1, 2) },
    ] },
    { text: "a\n\nb", marks: [
      { offset: 0, span: span("mixed-lines", 0) },
      { offset: 1, span: span("mixed-lines", 1) },
      { offset: 2, span: span("mixed-lines", 2, 2) },
      { offset: 3, span: span("mixed-lines", 3, 3) },
      { offset: 4, span: span("mixed-lines-tail", 4, 3) },
    ] },
    { text: "\r\nx", marks: [
      { offset: 0, span: span("crlf", 0) },
      { offset: 2, span: span("crlf", 2, 2) },
    ] },
    { text: "\u{1F642}\n\u03BB", marks: [
      { offset: 0, span: span("unicode", 0) },
      { offset: 2, span: span("unicode", 2) },
      { offset: 3, span: span("unicode", 3, 2) },
    ] },
  ];
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function fragmentChecksum(fragment) {
  let checksum = fragment.text.length * 31 + fragment.marks.length;
  for (const mark of fragment.marks) checksum += mark.offset;
  return checksum;
}

function measure(indent, fragments, iterations) {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const fragment of fragments) {
      checksum += fragmentChecksum(indent(fragment));
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

export function validateCompilerIndentReport(report) {
  if (report?.format !== COMPILER_INDENT_FORMAT ||
      report?.version !== COMPILER_INDENT_VERSION) {
    throw new TypeError("invalid compiler indent report identity");
  }
  if (report.validation?.equivalent !== true ||
      report.validation?.fragments !==
        report.corpus?.fragments + report.corpus?.boundaryFragments ||
      report.validation?.checksum <= 0) {
    throw new TypeError("compiler indent equivalence was not proven");
  }
  if (!Array.isArray(report.measurements?.optimized?.samplesMs) ||
      !Array.isArray(report.measurements?.reference?.samplesMs) ||
      report.measurements.optimized.samplesMs.length !==
        report.parameters?.timingSamples ||
      report.measurements.reference.samplesMs.length !==
        report.parameters?.timingSamples) {
    throw new TypeError("compiler indent timing samples are incomplete");
  }
  if (report.decision?.passed !== true ||
      report.measurements.speedup < report.decision.minimumSpeedup) {
    throw new TypeError("compiler indent speedup decision did not pass");
  }
  return report;
}

export async function runCompilerIndentBenchmark(options = {}) {
  const warmupIterations = parsePositiveInteger(
    options.warmupIterations ??
      process.env.ELISCRIPT_COMPILER_INDENT_WARMUP_ITERATIONS ?? 5,
    "warmup iterations",
  );
  const timingIterations = parsePositiveInteger(
    options.timingIterations ??
      process.env.ELISCRIPT_COMPILER_INDENT_TIMING_ITERATIONS ?? 20,
    "timing iterations",
  );
  const timingSamples = parsePositiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_INDENT_TIMING_SAMPLES ?? 9,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_COMPILER_INDENT_MINIMUM_SPEEDUP ?? 10,
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new TypeError("minimum speedup must be greater than 1");
  }

  const { compiler, emitter } = await loadGeneratedCompiler();
  const fragments = [];
  let sourceBytes = 0;
  for (const relative of compilerSources) {
    const source = await readFile(path.join(projectDirectory, relative), "utf8");
    sourceBytes += Buffer.byteLength(source);
    const program = compiler.compile_ir_string(source, relative);
    fragments.push(...sourceBoundFragments(emitter.emit_module_artifact(program)));
  }
  const boundaries = boundaryFragments();
  const allFragments = [...fragments, ...boundaries];

  let validationChecksum = 0;
  for (const fragment of allFragments) {
    const optimized = emitter.indent(fragment);
    const reference = emitter.reference_indent(fragment);
    if (JSON.stringify(optimized) !== JSON.stringify(reference)) {
      throw new Error("optimized and reference compiler indentation differ");
    }
    validationChecksum += fragmentChecksum(optimized);
  }

  measure(emitter.indent, allFragments, warmupIterations);
  measure(emitter.reference_indent, allFragments, warmupIterations);
  const optimizedSamples = [];
  const referenceSamples = [];
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const order = sample % 2 === 0
      ? [
        [emitter.indent, optimizedSamples],
        [emitter.reference_indent, referenceSamples],
      ]
      : [
        [emitter.reference_indent, referenceSamples],
        [emitter.indent, optimizedSamples],
      ];
    let expectedChecksum;
    for (const [indent, samples] of order) {
      const measured = measure(indent, allFragments, timingIterations);
      samples.push(measured.milliseconds);
      expectedChecksum ??= measured.checksum;
      if (measured.checksum !== expectedChecksum) {
        throw new Error("compiler indent benchmark checksum drifted");
      }
    }
  }

  const optimizedMedian = median(optimizedSamples);
  const referenceMedian = median(referenceSamples);
  const speedup = referenceMedian / optimizedMedian;
  const report = {
    format: COMPILER_INDENT_FORMAT,
    version: COMPILER_INDENT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerIndentSourceDigest(),
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
      fragments: fragments.length,
      boundaryFragments: boundaries.length,
      generatedBytes: fragments.reduce(
        (total, fragment) => total + Buffer.byteLength(fragment.text),
        0,
      ),
      marks: fragments.reduce(
        (total, fragment) => total + fragment.marks.length,
        0,
      ),
    },
    parameters: { warmupIterations, timingIterations, timingSamples },
    validation: {
      equivalent: true,
      fragments: allFragments.length,
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
  return validateCompilerIndentReport(report);
}

if (import.meta.main) {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await runCompilerIndentBenchmark();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(serialized);
  } else {
    await writeFile(path.resolve(output), serialized);
    process.stdout.write(`${path.resolve(output)}\n`);
  }
}
