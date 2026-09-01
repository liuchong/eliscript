import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_BINARY_COMPARISON_FORMAT =
  "eliscript-compiler-binary-comparison-benchmark";
export const COMPILER_BINARY_COMPARISON_VERSION = 1;
export const COMPILER_BINARY_COMPARISON_BASELINE =
  "a123937b275d89e833434e84064e4e120cf5495b";

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
  "compiler/eliscript-emitter.el",
  "compiler/eliscript-ir-emitter.el",
  "tools/compiler/binary-comparison-benchmark.mjs",
]);

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  let baselineRoot;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--baseline-root") {
      baselineRoot = arguments_[++index];
    } else if (argument === "--output") {
      output = arguments_[++index];
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: bun tools/compiler/binary-comparison-benchmark.mjs " +
          "--baseline-root DIR [--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  if (!baselineRoot) throw new TypeError("--baseline-root is required");
  return { baselineRoot: path.resolve(baselineRoot), output };
}

export async function compilerBinaryComparisonSourceDigest() {
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

function gitRevision(root) {
  const result = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]);
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim());
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function loadCompiler(root, identity) {
  const location = path.join(root, "dist/bootstrap/compiler.mjs");
  return import(`${pathToFileURL(location).href}?benchmark=${identity}`);
}

function median(samples) {
  const values = [...samples].sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function compileCorpus(compiler, corpus, rounds) {
  let checksum = 0;
  const start = performance.now();
  for (let round = 0; round < rounds; round += 1) {
    for (const item of corpus) {
      const result = compiler.compile_string_with_source_map(
        item.source,
        item.relative,
        `${path.basename(item.relative, ".eli")}.mjs`,
        item.relative,
      );
      checksum += result.javascript.length + result.sourceMap.length;
    }
  }
  return { milliseconds: performance.now() - start, checksum };
}

export function validateCompilerBinaryComparisonReport(report) {
  if (report?.format !== COMPILER_BINARY_COMPARISON_FORMAT ||
      report?.version !== COMPILER_BINARY_COMPARISON_VERSION ||
      report?.baseline?.revision !== COMPILER_BINARY_COMPARISON_BASELINE) {
    throw new TypeError("invalid compiler binary comparison report identity");
  }
  const samples = report.parameters?.timingSamples;
  if (!Array.isArray(report.measurements?.baseline?.samplesMs) ||
      !Array.isArray(report.measurements?.optimized?.samplesMs) ||
      report.measurements.baseline.samplesMs.length !== samples ||
      report.measurements.optimized.samplesMs.length !== samples) {
    throw new TypeError("compiler binary comparison samples are incomplete");
  }
  if (report.validation?.compiledModules !== report.corpus?.files?.length ||
      report.validation?.validSourceMaps !== report.corpus?.files?.length ||
      report.validation?.baselineChecksum <= 0 ||
      report.validation?.optimizedChecksum <= 0 ||
      report.validation?.optimizedBytes >= report.validation?.baselineBytes) {
    throw new TypeError("compiler binary comparison validation failed");
  }
  if (report.decision?.passed !== true ||
      report.measurements.speedup < report.decision.minimumSpeedup) {
    throw new TypeError("compiler binary comparison speedup decision failed");
  }
  return report;
}

export async function runCompilerBinaryComparisonBenchmark(options) {
  const warmupRounds = positiveInteger(
    options.warmupRounds ??
      process.env.ELISCRIPT_COMPILER_COMPARISON_WARMUP_ROUNDS ?? 2,
    "warmup rounds",
  );
  const timingRounds = positiveInteger(
    options.timingRounds ??
      process.env.ELISCRIPT_COMPILER_COMPARISON_TIMING_ROUNDS ?? 6,
    "timing rounds",
  );
  const timingSamples = positiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_COMPARISON_TIMING_SAMPLES ?? 11,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumSpeedup = Number(
    options.minimumSpeedup ??
      process.env.ELISCRIPT_COMPILER_COMPARISON_MINIMUM_SPEEDUP ?? 1.15,
  );
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new TypeError("minimum speedup must be greater than 1");
  }
  const baselineRoot = path.resolve(options.baselineRoot);
  const revision = gitRevision(baselineRoot);
  if (revision !== COMPILER_BINARY_COMPARISON_BASELINE) {
    throw new TypeError(
      `baseline must be ${COMPILER_BINARY_COMPARISON_BASELINE}, got ${revision}`,
    );
  }

  const corpus = await Promise.all(compilerSources.map(async (relative) => {
    const source = await readFile(path.join(projectDirectory, relative), "utf8");
    return { relative, source };
  }));
  const sourceBytes = corpus.reduce(
    (total, item) => total + Buffer.byteLength(item.source),
    0,
  );
  const [baseline, optimized] = await Promise.all([
    loadCompiler(baselineRoot, "baseline"),
    loadCompiler(projectDirectory, "optimized"),
  ]);

  let baselineBytes = 0;
  let optimizedBytes = 0;
  let validSourceMaps = 0;
  for (const item of corpus) {
    const baselineResult = baseline.compile_string_with_source_map(
      item.source, item.relative, "module.mjs", item.relative,
    );
    const optimizedResult = optimized.compile_string_with_source_map(
      item.source, item.relative, "module.mjs", item.relative,
    );
    JSON.parse(baselineResult.sourceMap);
    JSON.parse(optimizedResult.sourceMap);
    validSourceMaps += 1;
    baselineBytes += Buffer.byteLength(baselineResult.javascript);
    optimizedBytes += Buffer.byteLength(optimizedResult.javascript);
  }

  for (let round = 0; round < warmupRounds; round += 1) {
    compileCorpus(baseline, corpus, 1);
    compileCorpus(optimized, corpus, 1);
  }
  const baselineSamples = [];
  const optimizedSamples = [];
  let baselineChecksum = 0;
  let optimizedChecksum = 0;
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const order = sample % 2 === 0
      ? [[baseline, baselineSamples, "baseline"],
        [optimized, optimizedSamples, "optimized"]]
      : [[optimized, optimizedSamples, "optimized"],
        [baseline, baselineSamples, "baseline"]];
    for (const [compiler, samples, identity] of order) {
      const result = compileCorpus(compiler, corpus, timingRounds);
      samples.push(result.milliseconds);
      if (identity === "baseline") baselineChecksum = result.checksum;
      else optimizedChecksum = result.checksum;
    }
  }
  const baselineMedian = median(baselineSamples);
  const optimizedMedian = median(optimizedSamples);
  const speedup = baselineMedian / optimizedMedian;
  return validateCompilerBinaryComparisonReport({
    format: COMPILER_BINARY_COMPARISON_FORMAT,
    version: COMPILER_BINARY_COMPARISON_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerBinaryComparisonSourceDigest(),
    host: {
      runtime: "bun",
      runtimeVersion: Bun.version,
      engine: "JavaScriptCore",
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: `${os.type()} ${os.release()}`,
    },
    baseline: { revision, root: path.basename(baselineRoot) },
    corpus: { files: compilerSources, sourceBytes },
    parameters: { warmupRounds, timingRounds, timingSamples },
    validation: {
      compiledModules: corpus.length,
      validSourceMaps,
      baselineBytes,
      optimizedBytes,
      baselineChecksum,
      optimizedChecksum,
    },
    measurements: {
      baseline: { samplesMs: baselineSamples, medianMs: baselineMedian },
      optimized: { samplesMs: optimizedSamples, medianMs: optimizedMedian },
      speedup,
    },
    decision: { minimumSpeedup, passed: speedup >= minimumSpeedup },
  });
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const report = await runCompilerBinaryComparisonBenchmark(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(options.output), json);
  else process.stdout.write(json);
}
