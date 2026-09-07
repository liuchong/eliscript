#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dir, "../..");
const buildCommand = resolve(repositoryRoot, "bin/eliscript-build");
const moduleCount = 1_000;
const chainStart = 1;
const chainEnd = 399;
const diamondStart = 400;
const diamondCount = 50;
const cycleStart = 600;
const cycleCount = 10;
const cycleSize = 10;
const sharedModule = 700;
const fanoutStart = 701;
const fanoutEnd = 999;
const leafModule = chainEnd;
const leafDelta = 100_000;
const sharedDelta = 200_000;
const maximumSourceBytes = 8 * 1024 * 1024;
const maximumArtifactBytes = 64 * 1024 * 1024;
const maximumTemporaryBytes = maximumSourceBytes + (2 * maximumArtifactBytes);
const maximumBuildRssBytes = 512 * 1024 * 1024;
const maximumCapturedBytes = 16 * 1024 * 1024;
const commandTimeoutMs = 120_000;
const activeChildren = new Set();

function fail(message) {
  const error = new Error(message);
  error.eliscriptProjectScaleInvariant = true;
  throw error;
}

function invariant(condition, message) {
  if (!condition) fail(message);
}

function moduleId(index) {
  return `m${String(index).padStart(4, "0")}`;
}

function sourceName(index) {
  return `${moduleId(index)}.eli`;
}

function valueName(index) {
  return `value-${moduleId(index)}`;
}

function isCycleModule(index) {
  return index >= cycleStart && index < cycleStart + (cycleCount * cycleSize);
}

function projectGraph() {
  const dependencies = Array.from({ length: moduleCount }, () => []);

  dependencies[0].push(chainStart);
  for (let index = chainStart; index < chainEnd; index += 1) {
    dependencies[index].push(index + 1);
  }

  for (let diamond = 0; diamond < diamondCount; diamond += 1) {
    const top = diamondStart + (diamond * 4);
    const left = top + 1;
    const right = top + 2;
    const bottom = top + 3;
    dependencies[0].push(top);
    dependencies[top].push(left, right);
    dependencies[left].push(bottom);
    dependencies[right].push(bottom);
  }

  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    const start = cycleStart + (cycle * cycleSize);
    dependencies[0].push(start);
    for (let offset = 0; offset < cycleSize; offset += 1) {
      dependencies[start + offset].push(start + ((offset + 1) % cycleSize));
    }
  }

  for (let index = fanoutStart; index <= fanoutEnd; index += 1) {
    dependencies[0].push(index);
    dependencies[index].push(sharedModule);
  }

  const edges = dependencies.reduce((total, items) => total + items.length, 0);
  const topology = dependencies.map((items, index) => ({
    source: sourceName(index),
    dependencies: items.map(sourceName),
  }));
  const topologyDigest = createHash("sha256")
    .update(JSON.stringify(topology))
    .digest("hex");
  return { dependencies, edges, topology, topologyDigest };
}

function moduleSource(index, dependencies, revision = 0) {
  const imports = dependencies.map((dependency) => {
    const specifier = JSON.stringify(`./${sourceName(dependency)}`);
    if (isCycleModule(index) || isCycleModule(dependency)) {
      return `  (import ${specifier})`;
    }
    return `  (import ${specifier} ${valueName(dependency)})`;
  });
  const baseValue = index + revision;
  const expression = index === 0 || isCycleModule(index)
    ? String(baseValue)
    : dependencies.reduce(
      (result, dependency) => `(+ ${result} ${valueName(dependency)})`,
      String(baseValue),
    );
  return [
    `(module scale.${moduleId(index)}`,
    ...imports,
    `  (defconst ${valueName(index)} ${expression})`,
    `  (export ${valueName(index)}))`,
    "",
  ].join("\n");
}

async function writeProject(directory, graph) {
  await mkdir(directory, { recursive: true });
  const batchSize = 32;
  for (let start = 0; start < moduleCount; start += batchSize) {
    const writes = [];
    for (let index = start; index < Math.min(start + batchSize, moduleCount); index += 1) {
      writes.push(writeFile(
        resolve(directory, sourceName(index)),
        moduleSource(index, graph.dependencies[index]),
      ));
    }
    await Promise.all(writes);
  }
}

async function readBounded(stream, maximum, label) {
  const reader = stream.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) fail(`${label} exceeded ${maximum} bytes`);
    chunks.push(value);
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

async function runCommand(command, arguments_, label) {
  const child = Bun.spawn([command, ...arguments_], {
    cwd: repositoryRoot,
    env: { ...process.env, ELISCRIPT_JS_RUNTIME: "bun" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  activeChildren.add(child);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, commandTimeoutMs);
  const startedAt = performance.now();
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBounded(child.stdout, maximumCapturedBytes, `${label} stdout`),
      readBounded(child.stderr, maximumCapturedBytes, `${label} stderr`),
    ]);
    const wallMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
    if (timedOut) fail(`${label} exceeded ${commandTimeoutMs} ms`);
    if (exitCode !== 0) {
      fail(stderr.trim() || stdout.trim() || `${label} exited with ${exitCode}`);
    }
    return { stdout, stderr, wallMs, resourceUsage: child.resourceUsage() };
  } finally {
    clearTimeout(timer);
    activeChildren.delete(child);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await child.exited;
    }
  }
}

function reasonCounts(modules) {
  const result = {};
  for (const module of modules) {
    result[module.reason] = (result[module.reason] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function sourceSetDigest(sources) {
  return createHash("sha256").update(JSON.stringify(sources)).digest("hex");
}

function verifyReportGraph(report, graph, phase) {
  invariant(report.format === "eliscript-build-report", `${phase} report format changed`);
  invariant(report.version === 1, `${phase} report version changed`);
  invariant(
    report.counts?.modules === moduleCount,
    `${phase} did not report ${moduleCount} modules`,
  );
  invariant(Array.isArray(report.modules) && report.modules.length === moduleCount,
    `${phase} module records are incomplete`);
  const bySource = new Map(report.modules.map((module) => [module.source, module]));
  invariant(bySource.size === moduleCount, `${phase} contains duplicate module records`);
  for (const expected of graph.topology) {
    const actual = bySource.get(expected.source);
    invariant(actual !== undefined, `${phase} omitted ${expected.source}`);
    invariant(JSON.stringify(actual.dependencies) === JSON.stringify(expected.dependencies),
      `${phase} dependency graph changed for ${expected.source}`);
  }
  invariant(/^[0-9a-f]{64}$/u.test(report.digest), `${phase} graph digest is invalid`);
}

function buildSummary(report, execution) {
  const compiledSources = report.modules
    .filter((module) => module.status === "compiled")
    .map((module) => module.source)
    .sort();
  const reusedSources = report.modules
    .filter((module) => module.status === "reused")
    .map((module) => module.source)
    .sort();
  const maxRssBytes = Number(execution.resourceUsage.maxRSS ?? 0);
  invariant(maxRssBytes > 0, "build process did not report maximum RSS");
  invariant(maxRssBytes <= maximumBuildRssBytes,
    `build maximum RSS ${maxRssBytes} exceeded ${maximumBuildRssBytes}`);
  invariant(execution.wallMs <= commandTimeoutMs,
    `build wall time ${execution.wallMs} exceeded ${commandTimeoutMs}`);
  return {
    cache: report.cache,
    counts: report.counts,
    timings: report.timings,
    wallMs: execution.wallMs,
    maxRssBytes,
    graphDigest: report.digest,
    compiledSetDigest: sourceSetDigest(compiledSources),
    reusedSetDigest: sourceSetDigest(reusedSources),
    ...(compiledSources.length <= 16 ? { compiledSources } : {}),
    ...(reusedSources.length <= 16 ? { reusedSources } : {}),
    reasons: reasonCounts(report.modules),
  };
}

async function runBuild(projectRoot, outDir, graph, phase, noCache = false) {
  const arguments_ = [
    "--json",
    ...(noCache ? ["--no-cache"] : []),
    "--root",
    projectRoot,
    "--out-dir",
    outDir,
    resolve(projectRoot, sourceName(0)),
  ];
  const execution = await runCommand(buildCommand, arguments_, `${phase} build`);
  let report;
  try {
    report = JSON.parse(execution.stdout);
  } catch (error) {
    fail(`${phase} returned invalid JSON: ${error.message}`);
  }
  verifyReportGraph(report, graph, phase);
  return { report, summary: buildSummary(report, execution) };
}

async function treeFiles(directory, prefix = "") {
  const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await treeFiles(directory, name));
    } else if (entry.isFile()) {
      files.push(name);
    } else {
      fail(`unexpected non-file artifact ${name}`);
    }
  }
  return files;
}

async function treeIdentity(directory, maximumBytes) {
  const files = await treeFiles(directory);
  const digest = createHash("sha256");
  let bytes = 0;
  for (const filename of files) {
    const contents = await readFile(resolve(directory, filename));
    bytes += contents.byteLength;
    invariant(bytes <= maximumBytes, `${directory} exceeded ${maximumBytes} bytes`);
    digest.update(filename);
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return { files: files.length, bytes, digest: digest.digest("hex") };
}

async function evaluateModules(evaluator, outputs) {
  const execution = await runCommand(
    process.execPath,
    [evaluator, ...outputs.map((output) => pathToFileURL(output).href)],
    `evaluate ${outputs.length} project modules`,
  );
  let values;
  try {
    values = JSON.parse(execution.stdout);
  } catch (error) {
    fail(`project evaluation returned invalid JSON: ${error.message}`);
  }
  invariant(Array.isArray(values) && values.length === outputs.length,
    "project evaluation returned the wrong value count");
  invariant(values.every(Number.isSafeInteger),
    "project evaluation returned a non-integer module value");
  return values;
}

async function semanticValues(evaluator, outDir, expectedLeafDelta, expectedSharedDelta) {
  const fanoutOutputs = Array.from(
    { length: fanoutEnd - fanoutStart + 1 },
    (_, offset) => resolve(outDir, `${moduleId(fanoutStart + offset)}.mjs`),
  );
  const values = await evaluateModules(evaluator, [
    resolve(outDir, `${moduleId(chainStart)}.mjs`),
    ...fanoutOutputs,
  ]);
  const chainHead = values[0];
  const fanout = values.slice(1);
  const expectedChainHead = ((chainStart + chainEnd) *
    (chainEnd - chainStart + 1) / 2) + expectedLeafDelta;
  invariant(chainHead === expectedChainHead,
    `chain head ${chainHead} did not equal ${expectedChainHead}`);
  for (let offset = 0; offset < fanout.length; offset += 1) {
    const index = fanoutStart + offset;
    const expected = index + sharedModule + expectedSharedDelta;
    invariant(fanout[offset] === expected,
      `fan-out importer ${sourceName(index)} produced ${fanout[offset]} instead of ${expected}`);
  }
  return {
    chainHead,
    fanout: {
      count: fanout.length,
      first: fanout[0],
      last: fanout.at(-1),
      digest: createHash("sha256").update(JSON.stringify(fanout)).digest("hex"),
    },
  };
}

function verifyPhase(summary, expected) {
  invariant(summary.counts.compiled === expected.compiled,
    `${expected.name} compiled ${summary.counts.compiled}, expected ${expected.compiled}`);
  invariant(summary.counts.reused === expected.reused,
    `${expected.name} reused ${summary.counts.reused}, expected ${expected.reused}`);
  invariant(summary.cache.enabled === expected.cacheEnabled,
    `${expected.name} cache enabled state changed`);
  if (expected.cacheStatus !== undefined) {
    invariant(summary.cache.status === expected.cacheStatus,
      `${expected.name} cache status ${summary.cache.status}, expected ${expected.cacheStatus}`);
  }
  if (expected.compiledSources !== undefined) {
    invariant(JSON.stringify(summary.compiledSources) === JSON.stringify(expected.compiledSources),
      `${expected.name} compiled the wrong source set`);
  }
}

export async function runProjectScaleInvalidation() {
  const graph = projectGraph();
  invariant(graph.edges === 1_357, `graph has ${graph.edges} edges instead of 1357`);
  invariant(graph.dependencies[0].length === 360, "root fan-out changed");
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-project-scale-"));
  const projectRoot = resolve(directory, "source");
  const incrementalOut = resolve(directory, "incremental");
  const cleanOut = resolve(directory, "clean");
  const evaluator = resolve(directory, "evaluate.mjs");
  try {
    await writeProject(projectRoot, graph);
    await writeFile(evaluator, [
      "const modules = await Promise.all(",
      "  process.argv.slice(2).map((specifier) => import(specifier)),",
      ");",
      "const values = modules.map((loaded) => Object.values(loaded));",
      "if (values.some((items) => items.length !== 1 || !Number.isSafeInteger(items[0]))) {",
      "  throw new Error('expected one safe integer export per module');",
      "}",
      "process.stdout.write(JSON.stringify(values.map((items) => items[0])));",
      "",
    ].join("\n"));
    const sources = await treeIdentity(projectRoot, maximumSourceBytes);
    invariant(sources.files === moduleCount, "generated source file count changed");

    const initial = await runBuild(projectRoot, incrementalOut, graph, "initial");
    verifyPhase(initial.summary, {
      name: "initial",
      compiled: moduleCount,
      reused: 0,
      cacheEnabled: true,
      cacheStatus: "miss",
    });
    const initialArtifacts = await treeIdentity(incrementalOut, maximumArtifactBytes);
    const baselineSemantics = await semanticValues(evaluator, incrementalOut, 0, 0);

    const noOp = await runBuild(projectRoot, incrementalOut, graph, "no-op");
    verifyPhase(noOp.summary, {
      name: "no-op",
      compiled: 0,
      reused: moduleCount,
      cacheEnabled: true,
      cacheStatus: "hit",
      compiledSources: [],
    });
    invariant(noOp.report.modules.every((module) => module.reason === "verified"),
      "no-op rebuild did not verify every reused module");
    const noOpArtifacts = await treeIdentity(incrementalOut, maximumArtifactBytes);
    invariant(JSON.stringify(noOpArtifacts) === JSON.stringify(initialArtifacts),
      "no-op rebuild changed artifact bytes");

    await writeFile(
      resolve(projectRoot, sourceName(leafModule)),
      moduleSource(leafModule, graph.dependencies[leafModule], leafDelta),
    );
    const leafSources = await treeIdentity(projectRoot, maximumSourceBytes);
    const leaf = await runBuild(projectRoot, incrementalOut, graph, "leaf change");
    verifyPhase(leaf.summary, {
      name: "leaf change",
      compiled: 1,
      reused: moduleCount - 1,
      cacheEnabled: true,
      cacheStatus: "partial",
      compiledSources: [sourceName(leafModule)],
    });
    const leafRecord = leaf.report.modules.find(
      (module) => module.source === sourceName(leafModule),
    );
    invariant(leafRecord?.reason === "source-changed",
      "leaf change did not report source-changed");
    const leafArtifacts = await treeIdentity(incrementalOut, maximumArtifactBytes);
    const leafSemantics = await semanticValues(evaluator, incrementalOut, leafDelta, 0);
    invariant(leafSemantics.chainHead === baselineSemantics.chainHead + leafDelta,
      "leaf semantic change did not propagate through the chain");
    invariant(leafSemantics.fanout.digest === baselineSemantics.fanout.digest,
      "leaf change affected an unrelated fan-out module");

    await rm(cleanOut, { recursive: true, force: true });
    const leafClean = await runBuild(projectRoot, cleanOut, graph, "leaf clean", true);
    verifyPhase(leafClean.summary, {
      name: "leaf clean",
      compiled: moduleCount,
      reused: 0,
      cacheEnabled: false,
    });
    const leafCleanArtifacts = await treeIdentity(cleanOut, maximumArtifactBytes);
    const leafCleanSemantics = await semanticValues(evaluator, cleanOut, leafDelta, 0);
    invariant(JSON.stringify(leafArtifacts) === JSON.stringify(leafCleanArtifacts),
      "leaf incremental artifacts differ from a forced clean build");
    invariant(leaf.report.digest === leafClean.report.digest,
      "leaf incremental graph digest differs from a forced clean build");
    invariant(JSON.stringify(leafSemantics) === JSON.stringify(leafCleanSemantics),
      "leaf incremental behavior differs from a forced clean build");

    await writeFile(
      resolve(projectRoot, sourceName(sharedModule)),
      moduleSource(sharedModule, graph.dependencies[sharedModule], sharedDelta),
    );
    const shared = await runBuild(projectRoot, incrementalOut, graph, "shared dependency change");
    verifyPhase(shared.summary, {
      name: "shared dependency change",
      compiled: 1,
      reused: moduleCount - 1,
      cacheEnabled: true,
      cacheStatus: "partial",
      compiledSources: [sourceName(sharedModule)],
    });
    const sharedRecord = shared.report.modules.find(
      (module) => module.source === sourceName(sharedModule),
    );
    invariant(sharedRecord?.reason === "source-changed",
      "shared dependency change did not report source-changed");
    const sharedArtifacts = await treeIdentity(incrementalOut, maximumArtifactBytes);
    const sharedSemantics = await semanticValues(
      evaluator,
      incrementalOut,
      leafDelta,
      sharedDelta,
    );
    invariant(sharedSemantics.fanout.first === baselineSemantics.fanout.first + sharedDelta,
      "shared dependency change did not reach the first importer");
    invariant(sharedSemantics.fanout.last === baselineSemantics.fanout.last + sharedDelta,
      "shared dependency change did not reach the last importer");
    invariant(sharedSemantics.chainHead === leafSemantics.chainHead,
      "shared dependency change affected the unrelated chain");

    await rm(cleanOut, { recursive: true, force: true });
    const sharedClean = await runBuild(projectRoot, cleanOut, graph, "shared clean", true);
    verifyPhase(sharedClean.summary, {
      name: "shared clean",
      compiled: moduleCount,
      reused: 0,
      cacheEnabled: false,
    });
    const sharedCleanArtifacts = await treeIdentity(cleanOut, maximumArtifactBytes);
    const sharedCleanSemantics = await semanticValues(
      evaluator,
      cleanOut,
      leafDelta,
      sharedDelta,
    );
    invariant(JSON.stringify(sharedArtifacts) === JSON.stringify(sharedCleanArtifacts),
      "shared incremental artifacts differ from a forced clean build");
    invariant(shared.report.digest === sharedClean.report.digest,
      "shared incremental graph digest differs from a forced clean build");
    invariant(JSON.stringify(sharedSemantics) === JSON.stringify(sharedCleanSemantics),
      "shared incremental behavior differs from a forced clean build");

    const finalSources = await treeIdentity(projectRoot, maximumSourceBytes);
    const temporary = await treeIdentity(directory, maximumTemporaryBytes);

    return {
      schemaVersion: 1,
      format: "eliscript-project-scale-invalidation",
      version: 1,
      verified: true,
      graph: {
        modules: moduleCount,
        edges: graph.edges,
        rootFanout: graph.dependencies[0].length,
        chainModules: chainEnd - chainStart + 1,
        diamonds: diamondCount,
        diamondModules: diamondCount * 4,
        cycles: cycleCount,
        cycleModules: cycleCount * cycleSize,
        sharedImporters: fanoutEnd - fanoutStart + 1,
        leaf: sourceName(leafModule),
        sharedDependency: sourceName(sharedModule),
        topologyDigest: graph.topologyDigest,
      },
      limits: {
        commandTimeoutMs,
        maximumCapturedBytes,
        maximumSourceBytes,
        maximumArtifactBytes,
        maximumTemporaryBytes,
        maximumBuildRssBytes,
      },
      sources: {
        initial: sources,
        leaf: leafSources,
        shared: finalSources,
      },
      temporary,
      phases: {
        initial: initial.summary,
        noOp: noOp.summary,
        leaf: leaf.summary,
        leafClean: leafClean.summary,
        shared: shared.summary,
        sharedClean: sharedClean.summary,
      },
      semantics: {
        baseline: baselineSemantics,
        leaf: leafSemantics,
        shared: sharedSemantics,
      },
      equivalence: {
        noOpArtifacts: true,
        leafArtifacts: true,
        leafGraph: true,
        leafBehavior: true,
        sharedArtifacts: true,
        sharedGraph: true,
        sharedBehavior: true,
      },
      artifacts: {
        initial: initialArtifacts,
        leaf: leafArtifacts,
        shared: sharedArtifacts,
      },
    };
  } finally {
    for (const child of activeChildren) child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  }
}

function stopChildren(signal) {
  for (const child of activeChildren) child.kill("SIGTERM");
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}

if (import.meta.main) {
  process.once("SIGINT", () => stopChildren("SIGINT"));
  process.once("SIGTERM", () => stopChildren("SIGTERM"));
  try {
    const report = await runProjectScaleInvalidation();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
