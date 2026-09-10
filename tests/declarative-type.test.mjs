import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const compilationUnits = [
  ["stdlib/core/protocol.eli", "stdlib/core/protocol.eli"],
  ["stdlib/core/type.eli", "stdlib/core/type.eli"],
  ["tests/fixtures/declarative-type.eli", "tests/fixtures/declarative-type.mjs"],
];
const hostFixture = resolve(root, "tests/fixtures/declarative-type-host.mjs");
const bunPreload = resolve(root, "tests/fixtures/compiled-eli-bun-preload.mjs");
const nodeLoader = resolve(root, "tests/fixtures/compiled-eli-node-loader.mjs");
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
    stdout: "pipe",
    stderr: "pipe",
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

async function compile(command, source, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function compileFamily(command, outputRoot, environment = {}) {
  await mkdir(outputRoot, { recursive: true });
  await symlink(resolve(root, "runtime"), resolve(outputRoot, "runtime"), "dir");
  for (const [source, output] of compilationUnits) {
    await compile(
      command,
      resolve(root, source),
      resolve(outputRoot, output),
      environment,
    );
  }
}

test("deftype and reify agree across compilers and hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-deftype-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");

  try {
    await compileFamily(seedCompiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const [, relative] of compilationUnits) {
      expect(await Bun.file(resolve(selfHostedDirectory, relative)).text())
        .toBe(await Bun.file(resolve(seedDirectory, relative)).text());
      expect(await Bun.file(resolve(selfHostedDirectory, `${relative}.map`)).text())
        .toBe(await Bun.file(resolve(seedDirectory, `${relative}.map`)).text());
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(
        outputRoot,
        "tests/fixtures/declarative-type.mjs",
      );
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        modulePath,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        modulePath,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      type: {
        name: "Box",
        valueName: "Box",
        definition: true,
        instance: true,
        predicate: true,
        sameType: true,
        fields: ["value"],
        field: 7,
        description: "box:7",
        measurement: 21,
      },
      reify: {
        description: "captured:ok",
        measurement: 15,
        frozen: true,
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
