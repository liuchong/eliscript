import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_READER_CHARACTER_FORMAT =
  "eliscript-compiler-reader-character-benchmark";
export const COMPILER_READER_CHARACTER_VERSION = 1;
export const COMPILER_READER_CHARACTER_BASELINE =
  "d6822134a187d4247611db56822ef47164a76a61";

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
  "tools/compiler/reader-character-benchmark.mjs",
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
        "Usage: bun tools/compiler/reader-character-benchmark.mjs " +
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

export async function compilerReaderCharacterSourceDigest() {
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

async function loadGenerated(root, file, identity) {
  const location = path.join(root, "dist/bootstrap", `${file}.mjs`);
  return import(`${pathToFileURL(location).href}?reader-character=${identity}`);
}

function median(samples) {
  const values = [...samples].sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function sourceCodePoints(corpus) {
  const values = [undefined];
  for (const item of corpus) {
    for (let index = 0; index < item.source.length;) {
      const code = item.source.codePointAt(index);
      values.push(code);
      index += code > 0xFFFF ? 2 : 1;
    }
  }
  return values;
}

function measurePredicates(reader, values, iterations, optimized) {
  const whitespace = optimized
    ? reader.whitespace_code_p
    : reader.reference_whitespace_code_p;
  const delimiter = optimized
    ? reader.delimiter_code_p
    : reader.reference_delimiter_code_p;
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const value of values) {
      checksum += whitespace(value) ? 1 : 0;
      checksum += delimiter(value) ? 1 : 0;
    }
  }
  return { milliseconds: performance.now() - start, checksum };
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

export function validateCompilerReaderCharacterReport(report) {
  if (report?.format !== COMPILER_READER_CHARACTER_FORMAT ||
      report?.version !== COMPILER_READER_CHARACTER_VERSION ||
      report?.baseline?.revision !== COMPILER_READER_CHARACTER_BASELINE) {
    throw new TypeError("invalid compiler reader character report identity");
  }
  const samples = report.parameters?.timingSamples;
  for (const measurement of ["referencePredicates", "optimizedPredicates",
    "baselineCompiler", "optimizedCompiler"]) {
    if (!Array.isArray(report.measurements?.[measurement]?.samplesMs) ||
        report.measurements[measurement].samplesMs.length !== samples) {
      throw new TypeError("compiler reader character samples are incomplete");
    }
  }
  if (report.validation?.equivalentCodePoints !==
        report.corpus?.predicateCodePoints ||
      report.validation?.identicalCompilerOutputs !==
        report.corpus?.files?.length ||
      report.validation?.validSourceMaps !== report.corpus?.files?.length ||
      report.validation?.predicateChecksum <= 0 ||
      report.validation?.baselineCompilerChecksum <= 0 ||
      report.validation?.baselineCompilerChecksum !==
        report.validation?.optimizedCompilerChecksum) {
    throw new TypeError("compiler reader character validation failed");
  }
  if (report.decision?.passed !== true ||
      report.measurements.completeCompilerSpeedup <
        report.decision.minimumCompleteCompilerSpeedup) {
    throw new TypeError("compiler reader character speedup decision failed");
  }
  return report;
}

export async function runCompilerReaderCharacterBenchmark(options) {
  const warmupRounds = positiveInteger(
    options.warmupRounds ??
      process.env.ELISCRIPT_COMPILER_READER_WARMUP_ROUNDS ?? 2,
    "warmup rounds",
  );
  const predicateIterations = positiveInteger(
    options.predicateIterations ??
      process.env.ELISCRIPT_COMPILER_READER_PREDICATE_ITERATIONS ?? 20,
    "predicate iterations",
  );
  const compilerRounds = positiveInteger(
    options.compilerRounds ??
      process.env.ELISCRIPT_COMPILER_READER_COMPILER_ROUNDS ?? 8,
    "compiler rounds",
  );
  const timingSamples = positiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_COMPILER_READER_TIMING_SAMPLES ?? 15,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumCompleteCompilerSpeedup = Number(
    options.minimumCompleteCompilerSpeedup ??
      process.env.ELISCRIPT_COMPILER_READER_MINIMUM_SPEEDUP ?? 1.08,
  );
  if (!Number.isFinite(minimumCompleteCompilerSpeedup) ||
      minimumCompleteCompilerSpeedup <= 1) {
    throw new TypeError("minimum complete compiler speedup must exceed 1");
  }

  const baselineRoot = path.resolve(options.baselineRoot);
  const revision = gitRevision(baselineRoot);
  if (revision !== COMPILER_READER_CHARACTER_BASELINE) {
    throw new TypeError(
      `baseline must be ${COMPILER_READER_CHARACTER_BASELINE}, got ${revision}`,
    );
  }
  const corpus = await Promise.all(compilerSources.map(async (relative) => ({
    relative,
    source: await readFile(path.join(projectDirectory, relative), "utf8"),
  })));
  const sourceBytes = corpus.reduce(
    (total, item) => total + Buffer.byteLength(item.source),
    0,
  );
  const [baselineCompiler, optimizedCompiler, reader] = await Promise.all([
    loadGenerated(baselineRoot, "compiler", "baseline"),
    loadGenerated(projectDirectory, "compiler", "optimized"),
    loadGenerated(projectDirectory, "reader", "predicates"),
  ]);

  const predicateValues = sourceCodePoints(corpus);
  let equivalentCodePoints = 0;
  for (const value of predicateValues) {
    if (reader.whitespace_code_p(value) !==
          reader.reference_whitespace_code_p(value) ||
        reader.delimiter_code_p(value) !==
          reader.reference_delimiter_code_p(value)) {
      throw new Error(`reader character decision differs for ${String(value)}`);
    }
    equivalentCodePoints += 1;
  }

  let identicalCompilerOutputs = 0;
  let validSourceMaps = 0;
  let generatedBytes = 0;
  for (const item of corpus) {
    const baseline = baselineCompiler.compile_string_with_source_map(
      item.source, item.relative, "module.mjs", item.relative,
    );
    const optimized = optimizedCompiler.compile_string_with_source_map(
      item.source, item.relative, "module.mjs", item.relative,
    );
    if (baseline.javascript !== optimized.javascript ||
        baseline.sourceMap !== optimized.sourceMap) {
      throw new Error(`compiler output differs for ${item.relative}`);
    }
    JSON.parse(optimized.sourceMap);
    identicalCompilerOutputs += 1;
    validSourceMaps += 1;
    generatedBytes += Buffer.byteLength(optimized.javascript);
  }

  for (let index = 0; index < warmupRounds; index += 1) {
    measurePredicates(reader, predicateValues, 1, false);
    measurePredicates(reader, predicateValues, 1, true);
    compileCorpus(baselineCompiler, corpus, 1);
    compileCorpus(optimizedCompiler, corpus, 1);
  }
  const referencePredicateSamples = [];
  const optimizedPredicateSamples = [];
  const baselineCompilerSamples = [];
  const optimizedCompilerSamples = [];
  let predicateChecksum = 0;
  let baselineCompilerChecksum = 0;
  let optimizedCompilerChecksum = 0;
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const optimizedFirst = sample % 2 === 1;
    const predicateOrder = optimizedFirst
      ? [[true, optimizedPredicateSamples], [false, referencePredicateSamples]]
      : [[false, referencePredicateSamples], [true, optimizedPredicateSamples]];
    for (const [optimized, samples] of predicateOrder) {
      const result = measurePredicates(
        reader, predicateValues, predicateIterations, optimized,
      );
      samples.push(result.milliseconds);
      predicateChecksum = result.checksum;
    }
    const compilerOrder = optimizedFirst
      ? [[optimizedCompiler, optimizedCompilerSamples, true],
        [baselineCompiler, baselineCompilerSamples, false]]
      : [[baselineCompiler, baselineCompilerSamples, false],
        [optimizedCompiler, optimizedCompilerSamples, true]];
    for (const [compiler, samples, optimized] of compilerOrder) {
      const result = compileCorpus(compiler, corpus, compilerRounds);
      samples.push(result.milliseconds);
      if (optimized) optimizedCompilerChecksum = result.checksum;
      else baselineCompilerChecksum = result.checksum;
    }
  }

  const referencePredicateMedian = median(referencePredicateSamples);
  const optimizedPredicateMedian = median(optimizedPredicateSamples);
  const baselineCompilerMedian = median(baselineCompilerSamples);
  const optimizedCompilerMedian = median(optimizedCompilerSamples);
  const completeCompilerSpeedup =
    baselineCompilerMedian / optimizedCompilerMedian;
  return validateCompilerReaderCharacterReport({
    format: COMPILER_READER_CHARACTER_FORMAT,
    version: COMPILER_READER_CHARACTER_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerReaderCharacterSourceDigest(),
    host: {
      runtime: "bun",
      runtimeVersion: Bun.version,
      engine: "JavaScriptCore",
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: `${os.type()} ${os.release()}`,
    },
    baseline: { revision, root: path.basename(baselineRoot) },
    corpus: {
      files: compilerSources,
      sourceBytes,
      generatedBytes,
      predicateCodePoints: predicateValues.length,
    },
    parameters: {
      warmupRounds,
      predicateIterations,
      compilerRounds,
      timingSamples,
    },
    validation: {
      equivalentCodePoints,
      identicalCompilerOutputs,
      validSourceMaps,
      predicateChecksum,
      baselineCompilerChecksum,
      optimizedCompilerChecksum,
    },
    measurements: {
      referencePredicates: {
        samplesMs: referencePredicateSamples,
        medianMs: referencePredicateMedian,
      },
      optimizedPredicates: {
        samplesMs: optimizedPredicateSamples,
        medianMs: optimizedPredicateMedian,
      },
      predicateSpeedup: referencePredicateMedian / optimizedPredicateMedian,
      baselineCompiler: {
        samplesMs: baselineCompilerSamples,
        medianMs: baselineCompilerMedian,
      },
      optimizedCompiler: {
        samplesMs: optimizedCompilerSamples,
        medianMs: optimizedCompilerMedian,
      },
      completeCompilerSpeedup,
    },
    decision: {
      minimumCompleteCompilerSpeedup,
      passed: completeCompilerSpeedup >= minimumCompleteCompilerSpeedup,
    },
  });
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const report = await runCompilerReaderCharacterBenchmark(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(options.output), json);
  else process.stdout.write(json);
}
