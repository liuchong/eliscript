import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildProject } from "../../bootstrap/host/project.mjs";
import { frequencies } from "../../runtime/core/data.mjs";
import { into } from "../../runtime/core/transducer.mjs";
import { hashValue } from "../../runtime/core/value.mjs";
import { EMPTY_VECTOR } from "../../runtime/core/vector.mjs";

export const CORE_BENCHMARK_FORMAT = "eliscript-core-performance-benchmark";
export const CORE_BENCHMARK_VERSION = 1;

const toolPath = fileURLToPath(import.meta.url);
const projectDirectory = path.resolve(path.dirname(toolPath), "../..");
const bootstrapCommand = path.join(projectDirectory, "bin/eliscript-bootstrap");
const compilerDirectory = path.join(projectDirectory, "dist/bootstrap");
const compilerModule = path.join(compilerDirectory, "compiler.mjs");
const workerBenchmark = path.join(projectDirectory, "tools/worker/benchmark.el");
const buildBenchmarkSources = Object.freeze([
  "examples/stdlib-cli/main.eli",
  "stdlib/object.eli",
  "stdlib/sequence.eli",
  "stdlib/text.eli",
]);

export const CORE_BENCHMARK_PARAMETERS = Object.freeze({
  baselineRuns: 3,
  warmupRounds: 2,
  timingSamples: 7,
  workerSize: 10_000,
  workerRounds: 10,
  workloadSize: 100_000,
  workloadKeyCount: 1_000,
});

export const CORE_BENCHMARK_THRESHOLDS = Object.freeze({
  "compiler.moduleLoad": Object.freeze({
    maximumMedianMs: 8,
    maximumRunMs: 15,
    maximumSpreadRatio: 2,
  }),
  "compiler.coldCorpus": Object.freeze({
    maximumMedianMs: 200,
    maximumRunMs: 300,
    maximumSpreadRatio: 1.5,
  }),
  "compiler.warmCorpus": Object.freeze({
    maximumMedianMs: 125,
    maximumRunMs: 180,
    maximumSpreadRatio: 1.5,
  }),
  "build.clean": Object.freeze({
    maximumMedianMs: 25,
    maximumRunMs: 40,
    maximumSpreadRatio: 2,
  }),
  "build.noOp": Object.freeze({
    maximumMedianMs: 4,
    maximumRunMs: 8,
    maximumSpreadRatio: 2.5,
  }),
  "build.incremental": Object.freeze({
    maximumMedianMs: 5,
    maximumRunMs: 10,
    maximumSpreadRatio: 2.5,
  }),
  "worker.startup": Object.freeze({
    maximumMedianMs: 35,
    maximumRunMs: 60,
    maximumSpreadRatio: 2,
  }),
  "worker.coldEndToEnd": Object.freeze({
    maximumMedianMs: 20,
    maximumRunMs: 35,
    maximumSpreadRatio: 2,
  }),
  "worker.warmEndToEnd": Object.freeze({
    maximumMedianMs: 6,
    maximumRunMs: 10,
    maximumSpreadRatio: 2,
  }),
  "workload.cold": Object.freeze({
    maximumMedianMs: 35,
    maximumRunMs: 60,
    maximumSpreadRatio: 1.75,
  }),
  "workload.warm": Object.freeze({
    maximumMedianMs: 25,
    maximumRunMs: 40,
    maximumSpreadRatio: 1.75,
  }),
});

const metricReaders = Object.freeze({
  "compiler.moduleLoad": (run) => run.compiler.moduleLoadMs,
  "compiler.coldCorpus": (run) => run.compiler.coldCorpusMs,
  "compiler.warmCorpus": (run) => run.compiler.warmMedianMs,
  "build.clean": (run) => run.build.cleanMs,
  "build.noOp": (run) => run.build.noOpMedianMs,
  "build.incremental": (run) => run.build.incrementalMedianMs,
  "worker.startup": (run) => run.worker.startupMs,
  "worker.coldEndToEnd": (run) => run.worker.coldEndToEndMs,
  "worker.warmEndToEnd": (run) => run.worker.warmEndToEndMedianMs,
  "workload.cold": (run) => run.workload.coldMs,
  "workload.warm": (run) => run.workload.warmMedianMs,
});

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function parametersFrom(options = {}) {
  const parameters = {};
  for (const [name, defaultValue] of Object.entries(CORE_BENCHMARK_PARAMETERS)) {
    parameters[name] = positiveInteger(options[name] ?? defaultValue, name);
  }
  if (parameters.baselineRuns < 3) {
    throw new TypeError("core benchmark requires at least three baseline runs");
  }
  if (parameters.timingSamples % 2 === 0) {
    throw new TypeError("core benchmark timing samples must be odd");
  }
  if (parameters.workloadSize % parameters.workloadKeyCount !== 0) {
    throw new TypeError("workload size must be divisible by workload key count");
  }
  return Object.freeze(parameters);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function validTimingSamples(values, count) {
  return Array.isArray(values) && values.length === count &&
    values.every(positiveFinite);
}

function timed(operation) {
  const startedAt = performance.now();
  const value = operation();
  return { value, milliseconds: performance.now() - startedAt };
}

async function timedAsync(operation) {
  const startedAt = performance.now();
  const value = await operation();
  return { value, milliseconds: performance.now() - startedAt };
}

async function capture(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return { stdout, stderr };
}

async function filesIn(directory, extension) {
  const entries = await readdir(path.join(projectDirectory, directory), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
}

export async function coreBenchmarkSourceDigest() {
  const files = [...new Set([
    ...await filesIn("compiler", ".el"),
    ...await filesIn("bootstrap/compiler", ".eli"),
    ...await filesIn("runtime/core", ".mjs"),
    ...buildBenchmarkSources,
    "bootstrap/host/build.mjs",
    "bootstrap/host/bun.mjs",
    "bootstrap/host/project.mjs",
    "platform/worker.mjs",
    "runtime/worker-value-codec.mjs",
    "runtime/worker-value-stream.mjs",
    "runtime/worker.mjs",
    "tests/fixtures/worker.eli",
    "tools/performance/core-benchmark.mjs",
    "tools/worker/benchmark.el",
    "tools/worker/eliscript-value-codec.el",
    "tools/worker/eliscript-value-stream.el",
    "tools/worker/eliscript-worker.el",
  ])].sort();
  const aggregate = createHash("sha256");
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(path.join(projectDirectory, file));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    entries.push({ file, sha256 });
    aggregate.update(file);
    aggregate.update("\0");
    aggregate.update(bytes);
    aggregate.update("\0");
  }
  return {
    algorithm: "sha256",
    digest: aggregate.digest("hex"),
    files: entries,
  };
}

async function compilerSample(parameters) {
  const sources = [];
  for (const file of await filesIn("bootstrap/compiler", ".eli")) {
    sources.push({
      file,
      source: await readFile(path.join(projectDirectory, file), "utf8"),
    });
  }
  const load = await timedAsync(() => import(
    `${pathToFileURL(compilerModule).href}?core-benchmark=${process.pid}`
  ));
  const compiler = load.value;

  function compileCorpus() {
    const digest = createHash("sha256");
    let outputBytes = 0;
    for (const { file, source } of sources) {
      const emission = compiler.compile_string_with_source_map(
        source,
        path.join(projectDirectory, file),
        `${path.basename(file, ".eli")}.mjs`,
        file,
      );
      digest.update(emission.javascript);
      digest.update("\0");
      digest.update(emission.sourceMap);
      digest.update("\0");
      outputBytes += emission.javascript.length + emission.sourceMap.length;
    }
    return { digest: digest.digest("hex"), outputBytes };
  }

  const cold = timed(compileCorpus);
  for (let index = 0; index < parameters.warmupRounds; index += 1) {
    const warmup = compileCorpus();
    if (warmup.digest !== cold.value.digest) {
      throw new Error("compiler corpus changed during warmup");
    }
  }
  const warmSamplesMs = [];
  for (let index = 0; index < parameters.timingSamples; index += 1) {
    const sample = timed(compileCorpus);
    if (sample.value.digest !== cold.value.digest ||
        sample.value.outputBytes !== cold.value.outputBytes) {
      throw new Error("compiler corpus output is not deterministic");
    }
    warmSamplesMs.push(sample.milliseconds);
  }
  return {
    sourceCount: sources.length,
    outputBytes: cold.value.outputBytes,
    outputDigest: cold.value.digest,
    moduleLoadMs: load.milliseconds,
    coldCorpusMs: cold.milliseconds,
    warmSamplesMs,
    warmMedianMs: median(warmSamplesMs),
    deterministic: true,
  };
}

function requireBuildCounts(result, compiled, reused) {
  const counts = result.report?.counts;
  if (counts?.compiled !== compiled || counts?.reused !== reused ||
      counts?.modules !== compiled + reused) {
    throw new Error(
      `unexpected build counts: ${JSON.stringify(counts)}`,
    );
  }
  return counts.modules;
}

async function buildSample(parameters) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eliscript-core-build-"));
  const sourceRoot = path.join(directory, "source");
  const outDir = path.join(directory, "output");
  const entry = path.join(sourceRoot, buildBenchmarkSources[0]);
  try {
    for (const file of buildBenchmarkSources) {
      const destination = path.join(sourceRoot, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(projectDirectory, file), destination);
    }
    const options = {
      root: sourceRoot,
      entry,
      outDir,
      moduleDirectory: compilerDirectory,
      useCache: true,
    };
    const clean = await timedAsync(() => buildProject(options));
    const moduleCount = clean.value.report.counts.modules;
    requireBuildCounts(clean.value, moduleCount, 0);

    const noOpSamplesMs = [];
    for (let index = 0; index < parameters.timingSamples; index += 1) {
      const sample = await timedAsync(() => buildProject(options));
      requireBuildCounts(sample.value, 0, moduleCount);
      noOpSamplesMs.push(sample.milliseconds);
    }

    const originalEntry = await readFile(entry, "utf8");
    const incrementalSamplesMs = [];
    for (let index = 0; index < parameters.timingSamples; index += 1) {
      await writeFile(entry, `${originalEntry}\n; benchmark revision ${index}\n`);
      const sample = await timedAsync(() => buildProject(options));
      requireBuildCounts(sample.value, 1, moduleCount - 1);
      incrementalSamplesMs.push(sample.milliseconds);
    }
    return {
      moduleCount,
      cleanMs: clean.milliseconds,
      noOpSamplesMs,
      noOpMedianMs: median(noOpSamplesMs),
      incrementalSamplesMs,
      incrementalMedianMs: median(incrementalSamplesMs),
      exactDecisions: true,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function workerSample(parameters) {
  const result = await capture([
    process.env.EMACS ?? "emacs",
    "--batch",
    "-Q",
    "--script",
    workerBenchmark,
  ], {
    env: {
      ...process.env,
      BUN: process.execPath,
      ELISCRIPT_BENCHMARK_SIZE: String(parameters.workerSize),
      ELISCRIPT_BENCHMARK_ROUNDS: String(parameters.workerRounds),
      ELISCRIPT_BENCHMARK_ITERATIONS: String(parameters.timingSamples),
    },
  });
  const report = JSON.parse(result.stdout);
  if (report.protocolVersion !== 1 ||
      report.workload?.name !== "score-values" ||
      report.workload?.size !== parameters.workerSize ||
      report.workload?.rounds !== parameters.workerRounds ||
      report.workload?.iterations !== parameters.timingSamples ||
      report.samples?.emacs?.length !== parameters.timingSamples ||
      report.samples?.worker?.length !== parameters.timingSamples ||
      !Number.isSafeInteger(report.workload?.checksum)) {
    throw new Error("worker benchmark returned invalid evidence");
  }
  return {
    checksum: report.workload.checksum,
    compileMs: report.timingsMs.compile,
    startupMs: report.timingsMs.workerStartup,
    emacsSamplesMs: report.samples.emacs,
    emacsMedianMs: report.timingsMs.emacsMedian,
    coldEndToEndMs: report.timingsMs.coldEndToEnd,
    coldWorkerMs: report.timingsMs.coldWorker,
    coldModuleLoadMs: report.timingsMs.coldModuleLoad,
    coldExecutionMs: report.timingsMs.coldExecution,
    warmEndToEndSamplesMs: report.samples.worker.map((sample) =>
      sample.endToEndMs),
    warmEndToEndMedianMs: report.timingsMs.warmEndToEndMedian,
    warmWorkerMedianMs: report.timingsMs.warmWorkerMedian,
    warmExecutionMedianMs: report.timingsMs.warmExecutionMedian,
    warmTransportAndClientMedianMs:
      report.timingsMs.warmTransportAndClientMedian,
    warmSerializationMedianMs: report.timingsMs.warmSerializationMedian,
    warmExecutionSpeedup: report.ratios.warmExecutionSpeedup,
    warmEndToEndSpeedup: report.ratios.warmEndToEndSpeedup,
    equivalentToEmacs: true,
  };
}

function workloadSample(parameters) {
  const values = Array.from(
    { length: parameters.workloadSize },
    (_, index) => index % parameters.workloadKeyCount,
  );
  const input = into(EMPTY_VECTOR, values);
  const expectedCount = parameters.workloadSize / parameters.workloadKeyCount;

  function runWorkload() {
    const result = frequencies(input);
    if (result.count !== parameters.workloadKeyCount ||
        result.get(0) !== expectedCount ||
        result.get(parameters.workloadKeyCount - 1) !== expectedCount) {
      throw new Error("core frequencies workload produced an invalid result");
    }
    return hashValue(result);
  }

  const cold = timed(runWorkload);
  for (let index = 0; index < parameters.warmupRounds; index += 1) {
    if (runWorkload() !== cold.value) {
      throw new Error("core frequencies workload changed during warmup");
    }
  }
  const warmSamplesMs = [];
  for (let index = 0; index < parameters.timingSamples; index += 1) {
    const sample = timed(runWorkload);
    if (sample.value !== cold.value) {
      throw new Error("core frequencies workload is not deterministic");
    }
    warmSamplesMs.push(sample.milliseconds);
  }
  return {
    name: "persistent-frequencies",
    inputCount: parameters.workloadSize,
    keyCount: parameters.workloadKeyCount,
    countPerKey: expectedCount,
    resultHash: cold.value,
    coldMs: cold.milliseconds,
    warmSamplesMs,
    warmMedianMs: median(warmSamplesMs),
    deterministic: true,
  };
}

export async function runCoreBenchmarkSample(parameters) {
  const normalized = parametersFrom(parameters);
  return {
    compiler: await compilerSample(normalized),
    build: await buildSample(normalized),
    worker: await workerSample(normalized),
    workload: workloadSample(normalized),
  };
}

function summarize(runs) {
  const summary = {};
  for (const [name, read] of Object.entries(metricReaders)) {
    const samplesMs = runs.map(read);
    const medianMs = median(samplesMs);
    const minimumMs = Math.min(...samplesMs);
    const maximumMs = Math.max(...samplesMs);
    const spreadRatio = maximumMs / minimumMs;
    const threshold = CORE_BENCHMARK_THRESHOLDS[name];
    summary[name] = {
      samplesMs,
      medianMs,
      minimumMs,
      maximumMs,
      spreadRatio,
      passed: medianMs <= threshold.maximumMedianMs &&
        maximumMs <= threshold.maximumRunMs &&
        spreadRatio <= threshold.maximumSpreadRatio,
    };
  }
  return summary;
}

function validateSample(run, parameters) {
  return run?.compiler?.deterministic === true &&
    run.compiler.sourceCount >= 10 &&
    Number.isSafeInteger(run.compiler.outputBytes) &&
    run.compiler.outputBytes > 0 &&
    /^[0-9a-f]{64}$/.test(run.compiler.outputDigest) &&
    positiveFinite(run.compiler.moduleLoadMs) &&
    positiveFinite(run.compiler.coldCorpusMs) &&
    validTimingSamples(
      run.compiler.warmSamplesMs,
      parameters.timingSamples,
    ) &&
    positiveFinite(run.compiler.warmMedianMs) &&
    run.compiler.warmMedianMs === median(run.compiler.warmSamplesMs) &&
    run.build?.exactDecisions === true &&
    run.build.moduleCount === buildBenchmarkSources.length &&
    positiveFinite(run.build.cleanMs) &&
    validTimingSamples(run.build.noOpSamplesMs, parameters.timingSamples) &&
    positiveFinite(run.build.noOpMedianMs) &&
    run.build.noOpMedianMs === median(run.build.noOpSamplesMs) &&
    validTimingSamples(
      run.build.incrementalSamplesMs,
      parameters.timingSamples,
    ) &&
    positiveFinite(run.build.incrementalMedianMs) &&
    run.build.incrementalMedianMs ===
      median(run.build.incrementalSamplesMs) &&
    run.worker?.equivalentToEmacs === true &&
    Number.isSafeInteger(run.worker.checksum) &&
    positiveFinite(run.worker.compileMs) &&
    positiveFinite(run.worker.startupMs) &&
    validTimingSamples(run.worker.emacsSamplesMs, parameters.timingSamples) &&
    positiveFinite(run.worker.emacsMedianMs) &&
    run.worker.emacsMedianMs === median(run.worker.emacsSamplesMs) &&
    positiveFinite(run.worker.coldEndToEndMs) &&
    positiveFinite(run.worker.coldWorkerMs) &&
    positiveFinite(run.worker.coldModuleLoadMs) &&
    positiveFinite(run.worker.coldExecutionMs) &&
    validTimingSamples(
      run.worker.warmEndToEndSamplesMs,
      parameters.timingSamples,
    ) &&
    positiveFinite(run.worker.warmEndToEndMedianMs) &&
    run.worker.warmEndToEndMedianMs ===
      median(run.worker.warmEndToEndSamplesMs) &&
    positiveFinite(run.worker.warmWorkerMedianMs) &&
    positiveFinite(run.worker.warmExecutionMedianMs) &&
    positiveFinite(run.worker.warmTransportAndClientMedianMs) &&
    positiveFinite(run.worker.warmSerializationMedianMs) &&
    positiveFinite(run.worker.warmExecutionSpeedup) &&
    positiveFinite(run.worker.warmEndToEndSpeedup) &&
    run.workload?.deterministic === true &&
    run.workload.name === "persistent-frequencies" &&
    run.workload.inputCount === parameters.workloadSize &&
    run.workload.keyCount === parameters.workloadKeyCount &&
    run.workload.countPerKey ===
      parameters.workloadSize / parameters.workloadKeyCount &&
    Number.isSafeInteger(run.workload.resultHash) &&
    positiveFinite(run.workload.coldMs) &&
    validTimingSamples(
      run.workload.warmSamplesMs,
      parameters.timingSamples,
    ) &&
    positiveFinite(run.workload.warmMedianMs) &&
    run.workload.warmMedianMs === median(run.workload.warmSamplesMs);
}

function runCorrectnessIdentity(run) {
  return JSON.stringify({
    compiler: {
      sourceCount: run.compiler.sourceCount,
      outputBytes: run.compiler.outputBytes,
      outputDigest: run.compiler.outputDigest,
    },
    build: { moduleCount: run.build.moduleCount },
    worker: { checksum: run.worker.checksum },
    workload: {
      name: run.workload.name,
      inputCount: run.workload.inputCount,
      keyCount: run.workload.keyCount,
      countPerKey: run.workload.countPerKey,
      resultHash: run.workload.resultHash,
    },
  });
}

function validateSourceDigest(source) {
  if (source?.algorithm !== "sha256" ||
      !/^[0-9a-f]{64}$/.test(source.digest) ||
      !Array.isArray(source.files) || source.files.length === 0) {
    return false;
  }
  const filenames = source.files.map((entry) => entry.file);
  return JSON.stringify(filenames) ===
      JSON.stringify([...new Set(filenames)].sort()) &&
    source.files.every((entry) =>
      typeof entry.file === "string" &&
      /^[0-9a-f]{64}$/.test(entry.sha256));
}

export function validateCoreBenchmarkReport(report) {
  if (report?.format !== CORE_BENCHMARK_FORMAT ||
      report?.version !== CORE_BENCHMARK_VERSION) {
    throw new TypeError("invalid core performance benchmark identity");
  }
  if (typeof report.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(report.generatedAt)) ||
      typeof report.host?.platform !== "string" ||
      typeof report.host?.architecture !== "string" ||
      typeof report.host?.operatingSystem !== "string" ||
      typeof report.host?.bunVersion !== "string" ||
      typeof report.host?.emacsVersion !== "string") {
    throw new TypeError("invalid core performance benchmark host");
  }
  const parameters = parametersFrom(report.parameters);
  if (JSON.stringify(parameters) !== JSON.stringify(report.parameters) ||
      !Array.isArray(report.runs) ||
      report.runs.length !== parameters.baselineRuns ||
      !report.runs.every((run) => validateSample(run, parameters))) {
    throw new TypeError("invalid core performance benchmark runs");
  }
  if (new Set(report.runs.map(runCorrectnessIdentity)).size !== 1) {
    throw new TypeError("core performance correctness changed across runs");
  }
  if (JSON.stringify(report.thresholds) !==
        JSON.stringify(CORE_BENCHMARK_THRESHOLDS)) {
    throw new TypeError("core performance thresholds do not match the contract");
  }
  if (!validateSourceDigest(report.source)) {
    throw new TypeError("invalid core performance source digest");
  }
  const expectedSummary = summarize(report.runs);
  if (JSON.stringify(report.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError("core performance summary does not match its runs");
  }
  const passed = Object.values(expectedSummary).every((metric) => metric.passed);
  if (report.decision?.baselineRuns !== parameters.baselineRuns ||
      report.decision?.correct !== true ||
      report.decision?.stable !== true ||
      report.decision?.withinRegressionBudgets !== true ||
      report.decision?.passed !== true || !passed) {
    throw new TypeError("core performance benchmark decision failed");
  }
  return report;
}

export async function validateCoreBenchmarkSource(report) {
  validateCoreBenchmarkReport(report);
  const current = await coreBenchmarkSourceDigest();
  if (JSON.stringify(report.source) !== JSON.stringify(current)) {
    throw new TypeError("core performance report does not match current sources");
  }
  return report;
}

async function emacsVersion() {
  const result = await capture([
    process.env.EMACS ?? "emacs",
    "--batch",
    "-Q",
    "--eval",
    "(princ emacs-version)",
  ]);
  return result.stdout.trim();
}

export async function runCorePerformanceBenchmark(options = {}) {
  const parameters = parametersFrom(options);
  const source = await coreBenchmarkSourceDigest();
  await capture([bootstrapCommand], { env: { ...process.env } });
  const runs = [];
  for (let index = 0; index < parameters.baselineRuns; index += 1) {
    const result = await capture([
      process.execPath,
      toolPath,
      "--single-run",
    ], {
      env: {
        ...process.env,
        ELISCRIPT_CORE_BENCHMARK_PARAMETERS: JSON.stringify(parameters),
      },
    });
    runs.push(JSON.parse(result.stdout));
  }
  const summary = summarize(runs);
  const correct = runs.every((run) => validateSample(run, parameters));
  const stable = Object.entries(summary).every(([name, metric]) =>
    metric.spreadRatio <=
      CORE_BENCHMARK_THRESHOLDS[name].maximumSpreadRatio);
  const withinRegressionBudgets = Object.values(summary).every((metric) =>
    metric.passed);
  const finalSource = await coreBenchmarkSourceDigest();
  if (JSON.stringify(source) !== JSON.stringify(finalSource)) {
    throw new Error("core performance sources changed during measurement");
  }
  const report = {
    format: CORE_BENCHMARK_FORMAT,
    version: CORE_BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: `${os.type()} ${os.release()}`,
      bunVersion: Bun.version,
      emacsVersion: await emacsVersion(),
    },
    parameters,
    thresholds: CORE_BENCHMARK_THRESHOLDS,
    runs,
    summary,
    decision: {
      baselineRuns: parameters.baselineRuns,
      correct,
      stable,
      withinRegressionBudgets,
      passed: correct && stable && withinRegressionBudgets,
    },
    source,
  };
  return validateCoreBenchmarkSource(report);
}

function parseArguments(arguments_) {
  let output;
  let singleRun = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") {
      output = arguments_[++index];
      if (output === undefined) throw new TypeError("--output requires a file");
    } else if (argument === "--single-run") {
      singleRun = true;
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: bun tools/performance/core-benchmark.mjs [--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output, singleRun };
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const report = options.singleRun
    ? await runCoreBenchmarkSample(parametersFrom(JSON.parse(
      process.env.ELISCRIPT_CORE_BENCHMARK_PARAMETERS ?? "{}",
    )))
    : await runCorePerformanceBenchmark();
  const json = `${JSON.stringify(report, null, options.singleRun ? 0 : 2)}\n`;
  if (options.output) await writeFile(path.resolve(options.output), json);
  else process.stdout.write(json);
}
