import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildProject } from "../bootstrap/host/project.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const bootstrapPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const seedBuildPath = resolve(projectDirectory, "bin/eliscript-build");
const node = process.env.NODE ?? "node";

async function run(command, options = {}) {
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
  return stdout;
}

async function expectFilesEqual(left, right, filenames) {
  for (const filename of filenames) {
    expect(await readFile(resolve(right, filename)))
      .toEqual(await readFile(resolve(left, filename)));
  }
}

async function manifest(directory) {
  return JSON.parse(await readFile(
    resolve(directory, "eliscript-project.json"),
    "utf8",
  ));
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicManifestIdentity(value) {
  return {
    format: value.format,
    version: value.version,
    entry: value.entry,
    modules: value.modules,
    digest: value.digest,
  };
}

function stableReportIdentity(report) {
  const { outDir: _outDir, timings: _timings, ...stable } = report;
  return stable;
}

function expectValidTimings(report) {
  expect(Object.keys(report.timings).sort()).toEqual([
    "cacheReadMs",
    "manifestWriteMs",
    "totalMs",
    "workMs",
  ]);
  for (const milliseconds of Object.values(report.timings)) {
    expect(Number.isFinite(milliseconds)).toBeTrue();
    expect(milliseconds).toBeGreaterThanOrEqual(0);
  }
  expect(report.timings.totalMs).toBeGreaterThanOrEqual(
    report.timings.cacheReadMs,
  );
  expect(report.timings.totalMs).toBeGreaterThanOrEqual(
    report.timings.manifestWriteMs,
  );
}

async function nodeBuild(options) {
  const source = `
    const { buildProject } = await import(process.env.ELISCRIPT_PROJECT_HOST);
    const result = await buildProject(JSON.parse(process.env.ELISCRIPT_OPTIONS));
    console.log(JSON.stringify({
      digest: result.digest,
      mode: result.mode,
      report: result.report,
    }));
  `;
  return JSON.parse(await run([node, "--input-type=module", "--eval", source], {
    env: {
      ...process.env,
      ELISCRIPT_PROJECT_HOST: pathToFileURL(resolve(
        projectDirectory,
        "bootstrap/host/project.mjs",
      )).href,
      ELISCRIPT_OPTIONS: JSON.stringify(options),
    },
  }));
}

test("self-hosted project planning reaches deterministic graph fixed points", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-project-plan-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    await run([bootstrapPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      },
    });
    const compiler = await import(
      `${pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href}?plan`
    );

    expect(compiler.project_plan(["b", "a", "a"], (id) =>
      id === "a" ? ["b"] : ["a"])).toEqual({
      format: "eliscript-project-plan",
      version: 1,
      mode: "standard",
      entries: ["a", "b"],
      modules: [
        { id: "a", dependencies: ["b"] },
        { id: "b", dependencies: ["a"] },
      ],
    });

    const calls = [];
    const portable = compiler.portable_project_plan([
      { id: "a", entries: ["x"] },
    ], (id, entries) => {
      calls.push([id, [...entries]]);
      if (id === "a") {
        return entries.includes("z")
          ? [{ id: "c", entries: ["q"] }]
          : [{ id: "b", entries: ["y"] }];
      }
      return id === "b" ? [{ id: "a", entries: ["z"] }] : [];
    });
    expect(calls).toEqual([
      ["a", ["x"]],
      ["b", ["y"]],
      ["a", ["x", "z"]],
      ["c", ["q"]],
    ]);
    expect(portable.modules.map(({ id, entries }) => ({ id, entries })))
      .toEqual([
        { id: "a", entries: ["x", "z"] },
        { id: "b", entries: ["y"] },
        { id: "c", entries: ["q"] },
      ]);
    expect(portable.modules[0].dependencies).toEqual([
      { id: "b", entries: ["y"] },
      { id: "c", entries: ["q"] },
    ]);

    expect(compiler.project_build_report_format).toBe("eliscript-build-report");
    expect(compiler.project_build_report_version).toBe(1);
    expect(compiler.project_cache_format).toBe("eliscript-project-cache");
    expect(compiler.project_cache_version).toBe(2);
    const cacheModules = [{
      source: "src/main.eli",
      output: "src/main.mjs",
      sourceMap: "src/main.mjs.map",
      sourceDigest: "source",
      outputDigest: "output",
      sourceMapDigest: "map",
    }];
    const metadataModules = [{
      source: "src/main.eli",
      dependencies: [],
      portableEntries: [],
    }];
    const cacheLookupInput = {
      enabled: true,
      manifestStatus: "readable",
      expectedEntry: "src/main.mjs",
      graphDigestValid: true,
      cacheDigestValid: true,
      compilerDigest: "compiler",
      mode: "standard",
      portableEntries: [],
    };
    const currentLookup = compiler.project_cache_lookup({
      ...cacheLookupInput,
      manifest: {
        format: "eliscript-project",
        version: 1,
        entry: "src/main.mjs",
        digest: "manifest",
        modules: cacheModules,
        cache: {
          format: "eliscript-project-cache",
          version: 2,
          compilerDigest: "compiler",
          mode: "standard",
          portableEntries: [],
          modules: metadataModules,
        },
      },
    });
    expect(currentLookup.reason).toBe("verified");
    expect(currentLookup.cache.sourceVersion).toBe(2);
    const legacyLookup = compiler.project_cache_lookup({
      ...cacheLookupInput,
      manifest: {
        format: "eliscript-project",
        version: 1,
        entry: "src/main.mjs",
        digest: "manifest",
        modules: cacheModules,
        cache: {
          version: 1,
          compilerDigest: "compiler",
          mode: "standard",
          portableEntries: [],
          modules: metadataModules,
        },
      },
    });
    expect(legacyLookup.reason).toBe("verified");
    expect(legacyLookup.cache.sourceVersion).toBe(1);
    expect(compiler.project_cache_decision({
      record: currentLookup.cache.records[0],
      output: "src/main.mjs",
      sourceMap: "src/main.mjs.map",
      expectedPortableEntries: [],
      sourceDigest: "changed",
      outputExists: true,
      sourceMapExists: true,
      outputDigest: "output",
      sourceMapDigest: "map",
      dependenciesValid: true,
      artifactFailure: "artifact-unreadable",
    })).toEqual({ reused: false, reason: "artifact-unreadable" });
    const reportInput = {
      mode: "standard",
      root: "/project",
      outDir: "/project/dist",
      entry: "src/main.eli",
      entryOutput: "src/main.mjs",
      manifest: "eliscript-project.json",
      digest: "abc123",
      portableEntries: [],
      cache: { enabled: true, reason: "verified" },
      timings: {
        cacheReadMs: 0.1236,
        workMs: 1.2344,
        manifestWriteMs: 0.3456,
        totalMs: 1.7036,
      },
      modules: [
        {
          source: "src/value.eli",
          output: "src/value.mjs",
          sourceMap: "src/value.mjs.map",
          status: "compiled",
          reason: "source-changed",
          dependencies: [],
          portableEntries: [],
        },
        {
          source: "src/main.eli",
          output: "src/main.mjs",
          sourceMap: "src/main.mjs.map",
          status: "reused",
          reason: "verified",
          dependencies: ["src/value.eli", "src/value.eli"],
          portableEntries: [],
        },
      ],
    };
    const report = compiler.project_build_report(reportInput);
    expect(report.cache).toEqual({
      enabled: true,
      status: "partial",
      reason: "dirty-modules",
    });
    expect(report.counts).toEqual({ modules: 2, compiled: 1, reused: 1 });
    expect(report.timings).toEqual({
      cacheReadMs: 0.124,
      workMs: 1.234,
      manifestWriteMs: 0.346,
      totalMs: 1.704,
    });
    expect(report.modules.map((module) => module.source)).toEqual([
      "src/main.eli",
      "src/value.eli",
    ]);
    expect(report.modules[0].dependencies).toEqual(["src/value.eli"]);
    expect(Object.isFrozen(report)).toBeTrue();
    expect(Object.isFrozen(report.modules)).toBeTrue();
    expect(() => compiler.project_build_report({
      ...reportInput,
      cache: { enabled: "yes", reason: "verified" },
    })).toThrow("build report cache enabled must be a boolean");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("self-hosted project service matches seed output under Bun and Node", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-project-build-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    await run([bootstrapPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      },
    });

    const standardSeed = resolve(directory, "standard-seed");
    const standardBun = resolve(directory, "standard-bun");
    const standardNode = resolve(directory, "standard-node");
    const standardOptions = {
      root: projectDirectory,
      entry: resolve(projectDirectory, "examples/stdlib-cli/main.eli"),
      moduleDirectory: compilerDirectory,
    };
    const standardSeedReport = JSON.parse(await run([
      seedBuildPath,
      "--json",
      "--no-cache",
      "--root",
      projectDirectory,
      "--out-dir",
      standardSeed,
      standardOptions.entry,
    ]));
    const bunResult = await buildProject({
      ...standardOptions,
      outDir: standardBun,
      useCache: false,
    });
    const nodeResult = await nodeBuild({
      ...standardOptions,
      outDir: standardNode,
      useCache: false,
    });
    const standardFiles = [
      "examples/stdlib-cli/main.mjs",
      "examples/stdlib-cli/main.mjs.map",
      "stdlib/object.mjs",
      "stdlib/object.mjs.map",
      "stdlib/sequence.mjs",
      "stdlib/sequence.mjs.map",
      "stdlib/text.mjs",
      "stdlib/text.mjs.map",
    ];
    await expectFilesEqual(standardSeed, standardBun, standardFiles);
    await expectFilesEqual(standardSeed, standardNode, standardFiles);
    const standardManifest = await manifest(standardSeed);
    expect(publicManifestIdentity(await manifest(standardBun)))
      .toEqual(publicManifestIdentity(standardManifest));
    expect(publicManifestIdentity(await manifest(standardNode)))
      .toEqual(publicManifestIdentity(standardManifest));
    expect(bunResult.digest).toBe(standardManifest.digest);
    expect(stableReportIdentity(bunResult.report))
      .toEqual(stableReportIdentity(standardSeedReport));
    expect(stableReportIdentity(nodeResult.report))
      .toEqual(stableReportIdentity(standardSeedReport));
    expectValidTimings(bunResult.report);
    expectValidTimings(nodeResult.report);
    expect(nodeResult.digest).toBe(standardManifest.digest);
    expect(nodeResult.mode).toBe("standard");

    const standardNodeHit = await nodeBuild({
      ...standardOptions,
      outDir: standardBun,
    });
    expect(standardNodeHit.report.cache).toEqual({
      enabled: true,
      status: "hit",
      reason: "verified",
    });
    expect(standardNodeHit.report.counts).toEqual({
      modules: 4,
      compiled: 0,
      reused: 4,
    });
    expect(standardNodeHit.report.modules.every((module) =>
      module.reason === "verified")).toBeTrue();

    const legacyManifest = await manifest(standardBun);
    const {
      format: _cacheFormat,
      digest: _cacheDigest,
      ...legacyCacheIdentity
    } = legacyManifest.cache;
    legacyCacheIdentity.version = 1;
    legacyManifest.cache = {
      ...legacyCacheIdentity,
      digest: digestJson(legacyCacheIdentity),
    };
    await writeFile(
      resolve(standardBun, "eliscript-project.json"),
      `${JSON.stringify(legacyManifest)}\n`,
    );
    const migratedHit = await nodeBuild({
      ...standardOptions,
      outDir: standardBun,
    });
    expect(migratedHit.report.cache.status).toBe("hit");
    expect(migratedHit.report.counts).toEqual({
      modules: 4,
      compiled: 0,
      reused: 4,
    });
    const migratedManifest = await manifest(standardBun);
    expect(migratedManifest.cache.format).toBe("eliscript-project-cache");
    expect(migratedManifest.cache.version).toBe(2);

    await writeFile(resolve(standardBun, "stdlib/text.mjs"), "// tampered\n");
    const standardPartial = await buildProject({
      ...standardOptions,
      outDir: standardBun,
    });
    expect(standardPartial.report.cache).toEqual({
      enabled: true,
      status: "partial",
      reason: "dirty-modules",
    });
    expect(standardPartial.report.counts).toEqual({
      modules: 4,
      compiled: 1,
      reused: 3,
    });
    expect(standardPartial.report.modules.find((module) =>
      module.source === "stdlib/text.eli")).toMatchObject({
      status: "compiled",
      reason: "output-digest-changed",
    });
    await expectFilesEqual(standardSeed, standardBun, standardFiles);

    const portableSeed = resolve(directory, "portable-seed");
    const portableBun = resolve(directory, "portable-bun");
    const portableNode = resolve(directory, "portable-node");
    const portableRoot = resolve(projectDirectory, "stdlib");
    const portableEntry = resolve(portableRoot, "data.eli");
    const portableOptions = {
      root: portableRoot,
      entry: portableEntry,
      portableEntries: ["group-by"],
      moduleDirectory: compilerDirectory,
    };
    const portableSeedReport = JSON.parse(await run([
      seedBuildPath,
      "--json",
      "--no-cache",
      "--root",
      portableRoot,
      "--portable",
      "group-by",
      "--out-dir",
      portableSeed,
      portableEntry,
    ]));
    const portableBunResult = await buildProject({
      ...portableOptions,
      outDir: portableBun,
      useCache: false,
    });
    const portableNodeResult = await nodeBuild({
      ...portableOptions,
      outDir: portableNode,
      useCache: false,
    });
    const portableFiles = [
      "data.mjs",
      "data.mjs.map",
      "object.mjs",
      "object.mjs.map",
    ];
    await expectFilesEqual(portableSeed, portableBun, portableFiles);
    await expectFilesEqual(portableSeed, portableNode, portableFiles);
    const portableManifest = await manifest(portableSeed);
    expect(publicManifestIdentity(await manifest(portableBun)))
      .toEqual(publicManifestIdentity(portableManifest));
    expect(publicManifestIdentity(await manifest(portableNode)))
      .toEqual(publicManifestIdentity(portableManifest));
    expect(portableBunResult.digest).toBe(portableManifest.digest);
    expect(portableBunResult.plan.modules.map((record) =>
      [record.id, record.entries])).toEqual([
      [portableEntry, ["group-by"]],
      [resolve(portableRoot, "object.eli"), ["assoc", "has?"]],
    ]);
    expect(stableReportIdentity(portableBunResult.report))
      .toEqual(stableReportIdentity(portableSeedReport));
    expect(stableReportIdentity(portableNodeResult.report))
      .toEqual(stableReportIdentity(portableSeedReport));
    expectValidTimings(portableBunResult.report);
    expectValidTimings(portableNodeResult.report);
    expect(portableNodeResult.digest).toBe(portableManifest.digest);
    expect(portableNodeResult.mode).toBe("portable");

    const portableNodeHit = await nodeBuild({
      ...portableOptions,
      outDir: portableBun,
    });
    expect(portableNodeHit.report.cache).toEqual({
      enabled: true,
      status: "hit",
      reason: "verified",
    });
    expect(portableNodeHit.report.counts).toEqual({
      modules: 2,
      compiled: 0,
      reused: 2,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
