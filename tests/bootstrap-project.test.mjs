import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildProject, checkProject } from "../bootstrap/host/project.mjs";
import { parseConfigurationJson } from "../bootstrap/host/project-cli.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const bootstrapPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const seedBuildPath = resolve(projectDirectory, "bin/eliscript-seed-build");
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
  const identity = {
    format: value.format,
    version: value.version,
    modules: value.modules,
    digest: value.digest,
  };
  if (value.version === 2) identity.entries = value.entries;
  else identity.entry = value.entry;
  return identity;
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
    expect(compiler.project_request_format).toBe("eliscript-project-request");
    expect(compiler.project_request_version).toBe(1);
    expect(compiler.build_operation_format).toBe("eliscript-build-operation");
    expect(compiler.build_operation_version).toBe(1);
    const singleOperation = compiler.build_operation_request({
      mode: "single",
      input: "src/main.eli",
      output: null,
      sourceMap: false,
      portableEntries: ["zeta", "alpha", "zeta"],
    });
    expect(singleOperation).toEqual({
      format: "eliscript-build-operation",
      version: 1,
      mode: "single",
      input: "src/main.eli",
      output: null,
      sourceMap: false,
      portableEntries: ["alpha", "zeta"],
    });
    expect(Object.isFrozen(singleOperation)).toBeTrue();
    expect(Object.isFrozen(singleOperation.portableEntries)).toBeTrue();
    expect(compiler.build_operation_request({
      mode: "single",
      input: "src/defaults.eli",
    })).toEqual({
      format: "eliscript-build-operation",
      version: 1,
      mode: "single",
      input: "src/defaults.eli",
      output: null,
      sourceMap: false,
      portableEntries: [],
    });
    const request = compiler.project_request({
      entry: "/project/src/main.eli",
      outDir: "/project/dist",
      root: null,
      portableEntries: ["zeta", "alpha", "zeta"],
      useCache: true,
    });
    expect(request).toEqual({
      format: "eliscript-project-request",
      version: 1,
      entry: "/project/src/main.eli",
      outDir: "/project/dist",
      root: null,
      portableEntries: ["alpha", "zeta"],
      macroCapabilities: [],
      macroFileDependencies: [],
      useCache: true,
    });
    expect(Object.isFrozen(request)).toBeTrue();
    expect(Object.isFrozen(request.portableEntries)).toBeTrue();
    const projectOperation = compiler.build_operation_request({
      mode: "project",
      entry: request.entry,
      outDir: request.outDir,
      root: request.root,
      portableEntries: request.portableEntries,
      macroCapabilities: request.macroCapabilities,
      macroFileDependencies: request.macroFileDependencies,
      useCache: request.useCache,
    });
    expect(projectOperation).toEqual({
      format: "eliscript-build-operation",
      version: 1,
      mode: "project",
      entry: request.entry,
      outDir: request.outDir,
      root: request.root,
      portableEntries: request.portableEntries,
      macroCapabilities: request.macroCapabilities,
      macroFileDependencies: request.macroFileDependencies,
      useCache: request.useCache,
    });
    expect(Object.isFrozen(projectOperation)).toBeTrue();
    const multiRequest = compiler.project_request({
      entries: ["/project/src/z.eli", "/project/src/a.eli"],
      outDir: "/project/dist",
      root: "/project",
      portableEntries: [],
      macroCapabilities: [],
      macroFileDependencies: [],
      useCache: true,
    });
    expect(multiRequest).toEqual({
      format: "eliscript-project-request",
      version: 2,
      entries: ["/project/src/a.eli", "/project/src/z.eli"],
      outDir: "/project/dist",
      root: "/project",
      portableEntries: [],
      macroCapabilities: [],
      macroFileDependencies: [],
      useCache: true,
    });
    expect(Object.isFrozen(multiRequest.entries)).toBeTrue();
    expect(compiler.build_operation_request({
      mode: "project",
      ...multiRequest,
    })).toMatchObject({
      format: "eliscript-build-operation",
      version: 2,
      mode: "project",
      entries: multiRequest.entries,
    });
    expect(compiler.check_operation_request({
      entries: ["/project/src/z.eli", "/project/src/a.eli"],
      root: "/project",
      portableEntries: [],
    })).toEqual({
      format: "eliscript-check-operation",
      version: 1,
      mode: "project",
      entries: ["/project/src/a.eli", "/project/src/z.eli"],
      root: "/project",
      portableEntries: [],
      macroCapabilities: [],
      macroFileDependencies: [],
    });
    expect(compiler.project_check_report({
      mode: "standard",
      root: "/project",
      entries: ["src/z.eli", "src/a.eli"],
      portableEntries: [],
      modules: [
        {
          source: "src/z.eli",
          dependencies: [],
          portableEntries: [],
        },
        {
          source: "src/a.eli",
          dependencies: ["src/z.eli"],
          portableEntries: [],
        },
      ],
    })).toEqual({
      format: "eliscript-check-report",
      version: 1,
      status: "ok",
      mode: "standard",
      root: "/project",
      entries: ["src/a.eli", "src/z.eli"],
      portableEntries: [],
      counts: { modules: 2 },
      modules: [
        {
          source: "src/a.eli",
          dependencies: ["src/z.eli"],
          portableEntries: [],
        },
        {
          source: "src/z.eli",
          dependencies: [],
          portableEntries: [],
        },
      ],
    });
    expect(() => compiler.check_operation_request({
      entries: ["/project/src/a.eli", "/project/src/z.eli"],
      root: "/project",
      portableEntries: ["main"],
    })).toThrow("multi-entry portable project requests are not supported");
    try {
      compiler.project_request({
        entries: [],
        outDir: "/project/dist",
        root: "/project",
        portableEntries: [],
        useCache: true,
      });
      throw new Error("expected empty multi-entry request rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic?.code).toBe("ELI-B0001");
      expect(error.eliscriptDiagnostic?.phase).toBe("project-build");
    }
    try {
      compiler.build_operation_request({
        mode: "single",
        input: "main.eli",
        output: null,
        sourceMap: true,
        portableEntries: [],
      });
      throw new Error("expected single-file request rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic?.code).toBe("ELI-B0001");
      expect(error.eliscriptDiagnostic?.phase).toBe("project-build");
    }
    const configuration = compiler.project_configuration({
      schemaVersion: 1,
      entry: "src/main.eli",
      outDir: "dist",
    }, "/project/eliscript.json");
    expect(configuration).toEqual({
      format: "eliscript-project-request",
      version: 1,
      sourceRoot: ".",
      entry: "src/main.eli",
      outDir: "dist",
      portableEntries: [],
      macroCapabilities: [],
      macroFileDependencies: [],
      cache: true,
    });
    expect(Object.isFrozen(configuration)).toBeTrue();
    expect(Object.isFrozen(configuration.portableEntries)).toBeTrue();
    const multiConfiguration = compiler.project_configuration({
      schemaVersion: 2,
      sourceRoot: "src",
      entries: ["z.eli", "a.eli"],
      outDir: "dist",
    }, "/project/eliscript.json");
    expect(multiConfiguration).toEqual({
      format: "eliscript-project-request",
      version: 2,
      sourceRoot: "src",
      entries: ["a.eli", "z.eli"],
      outDir: "dist",
      portableEntries: [],
      macroCapabilities: [],
      macroFileDependencies: [],
      cache: true,
    });
    const macroConfiguration = compiler.project_configuration({
      schemaVersion: 1,
      sourceRoot: "src",
      entry: "main.eli",
      outDir: "dist",
      macroCapabilities: ["read-file"],
      macroFileDependencies: ["z.txt", "a.txt"],
    }, "/project/eliscript.json");
    expect(macroConfiguration.macroCapabilities).toEqual(["read-file"]);
    expect(macroConfiguration.macroFileDependencies).toEqual(["a.txt", "z.txt"]);
    expect(Object.isFrozen(macroConfiguration.macroCapabilities)).toBeTrue();
    expect(Object.isFrozen(macroConfiguration.macroFileDependencies)).toBeTrue();
    for (const invalid of [
      { ...configuration, schemaVersion: 1, undeclared: true },
      { schemaVersion: 1, entry: "../main.eli", outDir: "dist" },
      { schemaVersion: 1, entry: "main.eli", outDir: "dist", cache: "yes" },
      { schemaVersion: 2, entries: [], outDir: "dist" },
      {
        schemaVersion: 1,
        entry: "main.eli",
        outDir: "dist",
        macroCapabilities: ["network"],
      },
      {
        schemaVersion: 1,
        entry: "main.eli",
        outDir: "dist",
        macroFileDependencies: ["build.txt"],
      },
      {
        schemaVersion: 1,
        entry: "main.eli",
        outDir: "dist",
        macroCapabilities: ["read-file"],
        macroFileDependencies: ["../build.txt"],
      },
    ]) {
      try {
        compiler.project_configuration(invalid, "/project/eliscript.json");
        throw new Error("expected project configuration rejection");
      } catch (error) {
        expect(error.eliscriptDiagnostic?.code).toBe("ELI-B0002");
        expect(error.eliscriptDiagnostic?.phase).toBe("project-config");
      }
    }
    try {
      compiler.project_request({
        entry: "main.eli",
        outDir: "dist",
        root: null,
        portableEntries: [42],
        useCache: true,
      });
      throw new Error("expected project request rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic?.code).toBe("ELI-B0001");
      expect(error.eliscriptDiagnostic?.phase).toBe("project-build");
    }
    try {
      parseConfigurationJson(
        '{"schemaVersion":1,"entry":"main.eli","\\u0065ntry":"other.eli"}',
        "/project/eliscript.json",
      );
      throw new Error("expected duplicate configuration key rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic).toMatchObject({
        code: "ELI-B0002",
        phase: "project-config",
        message: "duplicate configuration key: entry",
        location: { file: "/project/eliscript.json" },
      });
    }
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
    const multiLookup = compiler.project_cache_lookup({
      ...cacheLookupInput,
      expectedEntry: undefined,
      expectedEntries: ["src/a.mjs", "src/main.mjs"],
      manifest: {
        format: "eliscript-project",
        version: 2,
        entries: ["src/a.mjs", "src/main.mjs"],
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
    expect(multiLookup.reason).toBe("verified");
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
    const multiReport = compiler.project_build_report({
      ...reportInput,
      entry: undefined,
      entryOutput: undefined,
      entries: ["src/z.eli", "src/a.eli"],
      entryOutputs: ["src/z.mjs", "src/a.mjs"],
    });
    expect(multiReport).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      entries: ["src/a.eli", "src/z.eli"],
      entryOutputs: ["src/a.mjs", "src/z.mjs"],
    });
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

    const checkRoot = resolve(directory, "check-source");
    const checkEntry = resolve(checkRoot, "main.eli");
    const checkDependency = resolve(checkRoot, "helper.eli");
    await mkdir(checkRoot);
    await writeFile(
      checkEntry,
      '(import "./helper.eli" answer)\n(print answer)\n',
    );
    await writeFile(checkDependency, "(defconst answer 42)\n(export answer)\n");
    const canonicalCheckRoot = await realpath(checkRoot);
    const canonicalCheckEntry = await realpath(checkEntry);
    const checked = await checkProject({
      root: canonicalCheckRoot,
      entry: checkEntry,
      moduleDirectory: compilerDirectory,
    });
    expect(checked.report).toEqual({
      format: "eliscript-check-report",
      version: 1,
      status: "ok",
      mode: "standard",
      root: canonicalCheckRoot,
      entries: ["main.eli"],
      portableEntries: [],
      counts: { modules: 2 },
      modules: [
        {
          source: "helper.eli",
          dependencies: [],
          portableEntries: [],
        },
        {
          source: "main.eli",
          dependencies: ["helper.eli"],
          portableEntries: [],
        },
      ],
    });
    expect((await readdir(checkRoot)).sort()).toEqual(["helper.eli", "main.eli"]);
    await expect(checkProject({
      root: checkRoot,
      entry: checkEntry,
      moduleDirectory: compilerDirectory,
      sourceOverrides: {
        [checkEntry]: "(print missing)\n",
      },
    })).rejects.toMatchObject({
      eliscriptDiagnostic: {
        code: "ELI-A0001",
        phase: "analysis",
        location: { file: canonicalCheckEntry },
      },
    });
    const detachedSource = resolve(checkRoot, "detached.eli");
    await writeFile(detachedSource, "(print 1)\n");
    await expect(checkProject({
      root: checkRoot,
      entry: checkEntry,
      moduleDirectory: compilerDirectory,
      sourceOverrides: {
        [detachedSource]: "(print 2)\n",
      },
    })).rejects.toThrow(
      "project source override is outside the project graph",
    );

    const virtualSource =
      '(import "./helper.eli" answer)\n(print (+ answer 1))\n';
    const virtualBun = resolve(directory, "virtual-bun");
    const virtualNode = resolve(directory, "virtual-node");
    const virtualOptions = {
      root: checkRoot,
      entry: checkEntry,
      moduleDirectory: compilerDirectory,
      useCache: true,
      sourceOverrides: { [checkEntry]: virtualSource },
    };
    const virtualBunResult = await buildProject({
      ...virtualOptions,
      outDir: virtualBun,
    });
    const virtualNodeResult = await nodeBuild({
      ...virtualOptions,
      outDir: virtualNode,
    });
    expect(virtualBunResult.report.cache).toEqual({
      enabled: false,
      status: "disabled",
      reason: "cache-disabled",
    });
    expect(stableReportIdentity(virtualNodeResult.report))
      .toEqual(stableReportIdentity(virtualBunResult.report));
    await expectFilesEqual(virtualBun, virtualNode, [
      "helper.mjs", "helper.mjs.map", "main.mjs", "main.mjs.map",
    ]);
    expect((await run([process.execPath, resolve(virtualBun, "main.mjs")])).trim())
      .toBe("43");
    expect(await readFile(checkEntry, "utf8")).toBe(
      '(import "./helper.eli" answer)\n(print answer)\n',
    );
    const virtualMap = JSON.parse(await readFile(
      resolve(virtualBun, "main.mjs.map"),
      "utf8",
    ));
    expect(virtualMap.sourcesContent).toEqual([virtualSource]);
    expect(virtualBunResult.modules.find((module) =>
      module.source === canonicalCheckEntry)?.sourceDigest).toBe(
      createHash("sha256").update(virtualSource).digest("hex"),
    );
    const diskRebuild = await buildProject({
      root: checkRoot,
      entry: checkEntry,
      outDir: virtualBun,
      moduleDirectory: compilerDirectory,
      useCache: true,
    });
    expect(diskRebuild.report.cache.status).toBe("partial");
    expect(diskRebuild.report.counts).toEqual({
      modules: 2,
      compiled: 1,
      reused: 1,
    });
    expect((await run([process.execPath, resolve(virtualBun, "main.mjs")])).trim())
      .toBe("42");

    const virtualPortableSource = resolve(checkRoot, "portable.eli");
    const virtualPortableOut = resolve(directory, "virtual-portable");
    await writeFile(
      virtualPortableSource,
      "(defportable answer () 42)\n(export answer)\n",
    );
    const portableVirtualText =
      "(defportable answer () 43)\n(export answer)\n";
    const virtualPortableResult = await buildProject({
      root: checkRoot,
      entry: virtualPortableSource,
      outDir: virtualPortableOut,
      portableEntries: ["answer"],
      sourceOverrides: { [virtualPortableSource]: portableVirtualText },
      moduleDirectory: compilerDirectory,
      useCache: true,
    });
    expect(virtualPortableResult.mode).toBe("portable");
    expect(virtualPortableResult.report.cache.enabled).toBeFalse();
    const virtualPortableModule = await import(
      `${pathToFileURL(resolve(virtualPortableOut, "portable.mjs")).href}?virtual`
    );
    expect(virtualPortableModule.answer()).toBe(43);
    expect(await readFile(virtualPortableSource, "utf8")).toBe(
      "(defportable answer () 42)\n(export answer)\n",
    );

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

    const multiRoot = resolve(directory, "multi-source");
    await mkdir(multiRoot);
    const multiFirst = resolve(multiRoot, "first.eli");
    const multiSecond = resolve(multiRoot, "second.eli");
    await writeFile(multiFirst, "(print 41)\n");
    await writeFile(multiSecond, "(print 42)\n");
    const multiSeed = resolve(directory, "multi-seed");
    const multiBun = resolve(directory, "multi-bun");
    const multiNode = resolve(directory, "multi-node");
    const multiEntries = [multiSecond, multiFirst];
    const multiSeedOutput = await run([
      seedBuildPath,
      "--no-cache",
      "--root",
      multiRoot,
      "--out-dir",
      multiSeed,
      ...multiEntries,
    ]);
    const canonicalMultiSeed = await realpath(multiSeed);
    expect(multiSeedOutput.trim().split("\n")).toEqual([
      resolve(canonicalMultiSeed, "first.mjs"),
      resolve(canonicalMultiSeed, "second.mjs"),
    ]);
    const multiOptions = {
      root: multiRoot,
      entries: multiEntries,
      moduleDirectory: compilerDirectory,
      useCache: false,
    };
    const multiBunResult = await buildProject({
      ...multiOptions,
      outDir: multiBun,
    });
    const multiNodeResult = await nodeBuild({
      ...multiOptions,
      outDir: multiNode,
    });
    await expectFilesEqual(multiSeed, multiBun, [
      "first.mjs", "first.mjs.map", "second.mjs", "second.mjs.map",
    ]);
    await expectFilesEqual(multiSeed, multiNode, [
      "first.mjs", "first.mjs.map", "second.mjs", "second.mjs.map",
    ]);
    const multiManifest = await manifest(multiSeed);
    expect(multiManifest).toMatchObject({
      format: "eliscript-project",
      version: 2,
      entries: ["first.mjs", "second.mjs"],
    });
    expect(publicManifestIdentity(await manifest(multiBun)))
      .toEqual(publicManifestIdentity(multiManifest));
    expect(publicManifestIdentity(await manifest(multiNode)))
      .toEqual(publicManifestIdentity(multiManifest));
    expect(multiBunResult.report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      entries: ["first.eli", "second.eli"],
      entryOutputs: ["first.mjs", "second.mjs"],
    });
    expect(multiNodeResult.report.version).toBe(2);
    const multiHit = await buildProject({
      ...multiOptions,
      outDir: multiBun,
      useCache: true,
    });
    expect(multiHit.report.cache.status).toBe("hit");
    expect(multiHit.report.counts).toEqual({
      modules: 2,
      compiled: 0,
      reused: 2,
    });
    const multiAlias = resolve(multiRoot, "first-alias.eli");
    await symlink(multiFirst, multiAlias);
    const duplicateEntries = [multiFirst, multiAlias];
    await expect(buildProject({
      ...multiOptions,
      entries: duplicateEntries,
      outDir: resolve(directory, "multi-duplicate-bun"),
    })).rejects.toThrow("project entries resolve to duplicate sources");
    await expect(nodeBuild({
      ...multiOptions,
      entries: duplicateEntries,
      outDir: resolve(directory, "multi-duplicate-node"),
    })).rejects.toThrow("project entries resolve to duplicate sources");
    await expect(run([
      seedBuildPath,
      "--no-cache",
      "--root",
      multiRoot,
      "--out-dir",
      resolve(directory, "multi-duplicate-seed"),
      ...duplicateEntries,
    ])).rejects.toThrow("project entries resolve to duplicate sources");

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
    const portableChecked = await checkProject(portableOptions);
    expect(portableChecked.report).toMatchObject({
      format: "eliscript-check-report",
      version: 1,
      status: "ok",
      mode: "portable",
      entries: ["data.eli"],
      portableEntries: ["group-by"],
      counts: { modules: 2 },
    });
    expect(portableChecked.report.modules.map((module) =>
      [module.source, module.portableEntries])).toEqual([
      ["data.eli", ["group-by"]],
      ["object.eli", ["assoc", "has?"]],
    ]);
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
