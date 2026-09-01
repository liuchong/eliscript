import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMPILER_SOURCE_MAP_CURSOR_FORMAT =
  "eliscript-compiler-source-map-cursor-benchmark";
export const COMPILER_SOURCE_MAP_CURSOR_VERSION = 1;
export const COMPILER_SOURCE_MAP_CURSOR_BASELINE =
  "a6013833226af047622aceca42d687b6e33e3701";

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
  "tools/compiler/source-map-cursor-benchmark.mjs",
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
        "Usage: bun tools/compiler/source-map-cursor-benchmark.mjs " +
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

export async function compilerSourceMapCursorSourceDigest() {
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
  return import(`${pathToFileURL(location).href}?source-map-cursor=${identity}`);
}

function median(samples) {
  const values = [...samples].sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function mapEntries(map) {
  return [...map.entries()];
}

function pipeline(sourceMap, item, reference) {
  const generatedMarks = reference
    ? sourceMap.reference_collect_generated_marks(item.generated, item.marks)
    : sourceMap.collect_generated_marks(item.generated, item.marks);
  const locations = reference
    ? sourceMap.reference_source_locations(item.source, generatedMarks)
    : sourceMap.source_locations(item.source, generatedMarks);
  return { generatedMarks, locations };
}

function pipelineIdentity(result) {
  return JSON.stringify({
    generatedMarks: result.generatedMarks,
    locations: mapEntries(result.locations),
  });
}

function measurePipeline(sourceMap, cases, iterations, reference) {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const item of cases) {
      const result = pipeline(sourceMap, item, reference);
      checksum += result.generatedMarks.length + result.locations.size;
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

export function validateCompilerSourceMapCursorReport(report) {
  if (report?.format !== COMPILER_SOURCE_MAP_CURSOR_FORMAT ||
      report?.version !== COMPILER_SOURCE_MAP_CURSOR_VERSION ||
      report?.baseline?.revision !== COMPILER_SOURCE_MAP_CURSOR_BASELINE) {
    throw new TypeError("invalid compiler Source Map cursor report identity");
  }
  const samples = report.parameters?.timingSamples;
  for (const measurement of ["referencePipeline", "optimizedPipeline",
    "baselineCompiler", "optimizedCompiler"]) {
    if (!Array.isArray(report.measurements?.[measurement]?.samplesMs) ||
        report.measurements[measurement].samplesMs.length !== samples) {
      throw new TypeError("compiler Source Map cursor samples are incomplete");
    }
  }
  if (report.validation?.equivalentCases !== report.corpus?.pipelineCases ||
      report.validation?.identicalCompilerOutputs !==
        report.corpus?.files?.length ||
      report.validation?.validSourceMaps !== report.corpus?.files?.length ||
      report.validation?.referencePipelineChecksum <= 0 ||
      report.validation?.referencePipelineChecksum !==
        report.validation?.optimizedPipelineChecksum ||
      report.validation?.baselineCompilerChecksum <= 0 ||
      report.validation?.baselineCompilerChecksum !==
        report.validation?.optimizedCompilerChecksum) {
    throw new TypeError("compiler Source Map cursor validation failed");
  }
  if (report.decision?.passed !== true ||
      report.measurements.pipelineSpeedup <
        report.decision.minimumPipelineSpeedup ||
      report.measurements.completeCompilerSpeedup <
        report.decision.minimumCompleteCompilerSpeedup) {
    throw new TypeError("compiler Source Map cursor speedup decision failed");
  }
  return report;
}

export async function runCompilerSourceMapCursorBenchmark(options) {
  const warmupRounds = positiveInteger(
    options.warmupRounds ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_WARMUP_ROUNDS ?? 2,
    "warmup rounds",
  );
  const pipelineIterations = positiveInteger(
    options.pipelineIterations ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_PIPELINE_ITERATIONS ?? 20,
    "pipeline iterations",
  );
  const compilerRounds = positiveInteger(
    options.compilerRounds ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_COMPILER_ROUNDS ?? 8,
    "compiler rounds",
  );
  const timingSamples = positiveInteger(
    options.timingSamples ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_TIMING_SAMPLES ?? 15,
    "timing samples",
  );
  if (timingSamples % 2 === 0) {
    throw new TypeError("timing samples must be odd");
  }
  const minimumPipelineSpeedup = Number(
    options.minimumPipelineSpeedup ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_MINIMUM_PIPELINE_SPEEDUP ?? 1.5,
  );
  const minimumCompleteCompilerSpeedup = Number(
    options.minimumCompleteCompilerSpeedup ??
      process.env.ELISCRIPT_SOURCE_MAP_CURSOR_MINIMUM_COMPILER_SPEEDUP ?? 1.08,
  );
  if (!Number.isFinite(minimumPipelineSpeedup) ||
      minimumPipelineSpeedup <= 1 ||
      !Number.isFinite(minimumCompleteCompilerSpeedup) ||
      minimumCompleteCompilerSpeedup <= 1) {
    throw new TypeError("Source Map cursor speedup thresholds must exceed 1");
  }

  const baselineRoot = path.resolve(options.baselineRoot);
  const revision = gitRevision(baselineRoot);
  if (revision !== COMPILER_SOURCE_MAP_CURSOR_BASELINE) {
    throw new TypeError(
      `baseline must be ${COMPILER_SOURCE_MAP_CURSOR_BASELINE}, got ${revision}`,
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
  const [baselineCompiler, optimizedCompiler, emitter, sourceMap] =
    await Promise.all([
      loadGenerated(baselineRoot, "compiler", "baseline"),
      loadGenerated(projectDirectory, "compiler", "optimized"),
      loadGenerated(projectDirectory, "emitter", "emitter"),
      loadGenerated(projectDirectory, "source-map", "source-map"),
    ]);

  const cases = [];
  let artifactMarks = 0;
  let generatedBytes = 0;
  for (const item of corpus) {
    const program = optimizedCompiler.compile_ir_string(
      item.source, item.relative,
    );
    const artifact = emitter.emit_module_artifact(program);
    cases.push({
      source: item.source,
      generated: artifact.text,
      marks: artifact.marks,
    });
    artifactMarks += artifact.marks.length;
    generatedBytes += Buffer.byteLength(artifact.text);
  }
  cases.push({
    source: "",
    generated: "",
    marks: [{ offset: 0, span: { start: 0 } }],
  });
  cases.push({
    source: "a\n😀b\tc",
    generated: "x\nyz",
    marks: [
      { offset: 0, span: { start: 0 } },
      { offset: 0, span: { start: 1 } },
      { offset: 1, span: { start: 2 } },
      { offset: 2, span: { start: 3 } },
      { offset: 4, span: { start: 6 } },
    ],
  });

  let equivalentCases = 0;
  for (const item of cases) {
    const reference = pipeline(sourceMap, item, true);
    const optimized = pipeline(sourceMap, item, false);
    if (pipelineIdentity(reference) !== pipelineIdentity(optimized)) {
      throw new Error("optimized and reference Source Map cursors differ");
    }
    equivalentCases += 1;
  }

  let identicalCompilerOutputs = 0;
  let validSourceMaps = 0;
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
  }

  for (let index = 0; index < warmupRounds; index += 1) {
    measurePipeline(sourceMap, cases, 1, true);
    measurePipeline(sourceMap, cases, 1, false);
    compileCorpus(baselineCompiler, corpus, 1);
    compileCorpus(optimizedCompiler, corpus, 1);
  }
  const referencePipelineSamples = [];
  const optimizedPipelineSamples = [];
  const baselineCompilerSamples = [];
  const optimizedCompilerSamples = [];
  let referencePipelineChecksum = 0;
  let optimizedPipelineChecksum = 0;
  let baselineCompilerChecksum = 0;
  let optimizedCompilerChecksum = 0;
  for (let sample = 0; sample < timingSamples; sample += 1) {
    const optimizedFirst = sample % 2 === 1;
    const pipelineOrder = optimizedFirst
      ? [[false, optimizedPipelineSamples], [true, referencePipelineSamples]]
      : [[true, referencePipelineSamples], [false, optimizedPipelineSamples]];
    for (const [reference, samples] of pipelineOrder) {
      const result = measurePipeline(
        sourceMap, cases, pipelineIterations, reference,
      );
      samples.push(result.milliseconds);
      if (reference) referencePipelineChecksum = result.checksum;
      else optimizedPipelineChecksum = result.checksum;
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

  const referencePipelineMedian = median(referencePipelineSamples);
  const optimizedPipelineMedian = median(optimizedPipelineSamples);
  const baselineCompilerMedian = median(baselineCompilerSamples);
  const optimizedCompilerMedian = median(optimizedCompilerSamples);
  const pipelineSpeedup = referencePipelineMedian / optimizedPipelineMedian;
  const completeCompilerSpeedup =
    baselineCompilerMedian / optimizedCompilerMedian;
  return validateCompilerSourceMapCursorReport({
    format: COMPILER_SOURCE_MAP_CURSOR_FORMAT,
    version: COMPILER_SOURCE_MAP_CURSOR_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDigest: await compilerSourceMapCursorSourceDigest(),
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
      artifactMarks,
      pipelineCases: cases.length,
    },
    parameters: {
      warmupRounds,
      pipelineIterations,
      compilerRounds,
      timingSamples,
    },
    validation: {
      equivalentCases,
      identicalCompilerOutputs,
      validSourceMaps,
      referencePipelineChecksum,
      optimizedPipelineChecksum,
      baselineCompilerChecksum,
      optimizedCompilerChecksum,
    },
    measurements: {
      referencePipeline: {
        samplesMs: referencePipelineSamples,
        medianMs: referencePipelineMedian,
      },
      optimizedPipeline: {
        samplesMs: optimizedPipelineSamples,
        medianMs: optimizedPipelineMedian,
      },
      pipelineSpeedup,
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
      minimumPipelineSpeedup,
      minimumCompleteCompilerSpeedup,
      passed: pipelineSpeedup >= minimumPipelineSpeedup &&
        completeCompilerSpeedup >= minimumCompleteCompilerSpeedup,
    },
  });
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const report = await runCompilerSourceMapCursorBenchmark(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(options.output), json);
  else process.stdout.write(json);
}
