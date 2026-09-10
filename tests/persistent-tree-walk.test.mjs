import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const compilationUnits = [
  ["stdlib/core/walk.eli", "stdlib/core/walk.eli"],
  ["tests/fixtures/persistent-tree-walk.eli",
    "tests/fixtures/persistent-tree-walk.mjs"],
];
const hostFixture = resolve(root, "tests/fixtures/persistent-tree-walk-host.mjs");
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

test("persistent tree walk is stack safe and agrees across compilers and hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-tree-walk-"));
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
        "tests/fixtures/persistent-tree-walk.mjs",
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

    expect(reports[0].identityPreserved).toBeTrue();
    expect(reports[0].oneLevel).toEqual([2, 2, true]);
    expect(reports[0].post).toEqual([2, 3, 4, 5, 6, true, true, 8]);
    expect(reports[0].metadata).toBe("walk-test");
    expect(reports[0].types).toEqual([true, true, true, true, true, true]);
    expect(reports[0].map).toEqual([true, 3]);
    expect(reports[0].record).toEqual([true, 41, false, 40]);
    expect(reports[0].preorder).toEqual(["vector", 1, "vector", 2]);
    expect(reports[0].postorder).toEqual([1, 2, "vector", "vector"]);
    expect(reports[0].preReplace).toBe("c");
    expect(reports[0].postReplace).toBe("b");
    expect(reports[0].nullishReplace).toEqual([
      true,
      true,
      true,
      "missing",
    ]);
    expect(reports[0].errors).toEqual([
      "walk inner must be a function",
      "prewalk transform must be a function",
      "postwalk transform must be a function",
      "prewalk-replace replacements must be a map",
      "postwalk-replace replacements must be a map",
    ]);
    expect(reports[0].deep).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
