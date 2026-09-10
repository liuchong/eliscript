import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const compilationUnits = [
  ["stdlib/core/zipper.eli", "stdlib/core/zipper.eli"],
  ["tests/fixtures/persistent-zipper.eli",
    "tests/fixtures/persistent-zipper.mjs"],
];
const hostFixture = resolve(root, "tests/fixtures/persistent-zipper-host.mjs");
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

test("persistent zippers navigate edit and rebuild stack-safe trees", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-zipper-"));
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

    for (const [, output] of compilationUnits) {
      expect(await Bun.file(resolve(selfHostedDirectory, output)).text())
        .toBe(await Bun.file(resolve(seedDirectory, output)).text());
      expect(await Bun.file(resolve(selfHostedDirectory, `${output}.map`)).text())
        .toBe(await Bun.file(resolve(seedDirectory, `${output}.map`)).text());
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(
        outputRoot,
        "tests/fixtures/persistent-zipper.mjs",
      );
      reports.push(JSON.parse(await runSuccessful([
        "bun", "--preload", bunPreload, hostFixture, modulePath,
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

    expect(reports[0].recognition).toEqual([true, false, true]);
    expect(reports[0].navigation).toEqual([
      1, "vector", 2, 3, 2, 4, 1, 3, 2, 1, 1,
    ]);
    expect(reports[0].enumeration).toEqual(["vector", 1, "vector", 2, 3, 4]);
    expect(reports[0].end).toEqual([true, true, 4, 3, true]);
    expect(reports[0].identity).toEqual([true, true, 3, "zipper-test"]);
    expect(reports[0].edited).toEqual([1, 2, 20, 30, 40, 50, 4]);
    expect(reports[0].prepended).toEqual([0, 2, 3]);
    expect(reports[0].removed).toEqual([2, 1, true, 3]);
    expect(reports[0].generic).toEqual([7, 10]);
    expect(reports[0].list).toEqual([true, true, 5, 6, 8, "list-zipper"]);
    expect(reports[0].nullish).toEqual([true, true, true, true]);
    expect(reports[0].deep).toBe(1);
    expect(reports[0].errors).toEqual([
      "zipper branch predicate must be a function",
      "node requires a zipper location",
      "children requires a branch location",
      "insert-left cannot insert at the root",
      "insert-right cannot insert at the root",
      "remove cannot remove the root",
      "replace cannot modify the end location",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
