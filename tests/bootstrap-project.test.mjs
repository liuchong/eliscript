import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

function publicManifestIdentity(value) {
  return {
    format: value.format,
    version: value.version,
    entry: value.entry,
    modules: value.modules,
    digest: value.digest,
  };
}

async function nodeBuild(options) {
  const source = `
    const { buildProject } = await import(process.env.ELISCRIPT_PROJECT_HOST);
    const result = await buildProject(JSON.parse(process.env.ELISCRIPT_OPTIONS));
    console.log(JSON.stringify({ digest: result.digest, mode: result.mode }));
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
    await run([
      seedBuildPath,
      "--no-cache",
      "--root",
      projectDirectory,
      "--out-dir",
      standardSeed,
      standardOptions.entry,
    ]);
    const bunResult = await buildProject({
      ...standardOptions,
      outDir: standardBun,
    });
    const nodeResult = await nodeBuild({
      ...standardOptions,
      outDir: standardNode,
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
    expect(nodeResult).toEqual({
      digest: standardManifest.digest,
      mode: "standard",
    });

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
    await run([
      seedBuildPath,
      "--no-cache",
      "--root",
      portableRoot,
      "--portable",
      "group-by",
      "--out-dir",
      portableSeed,
      portableEntry,
    ]);
    const portableBunResult = await buildProject({
      ...portableOptions,
      outDir: portableBun,
    });
    const portableNodeResult = await nodeBuild({
      ...portableOptions,
      outDir: portableNode,
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
    expect(portableNodeResult).toEqual({
      digest: portableManifest.digest,
      mode: "portable",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
