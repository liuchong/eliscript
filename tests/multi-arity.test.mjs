import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const source = resolve(root, "tests/fixtures/multi-arity.eli");
const output = "tests/fixtures/multi-arity.mjs";
const hostFixture = resolve(root, "tests/fixtures/multi-arity-host.mjs");
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

async function compile(command, outputRoot, environment = {}) {
  const outputPath = resolve(outputRoot, output);
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(resolve(outputRoot, "node_modules"), { recursive: true });
  await symlink(root, resolve(outputRoot, "node_modules/eliscript"), "dir");
  await symlink(resolve(root, "runtime"), resolve(outputRoot, "runtime"), "dir");
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    outputPath,
    source,
  ], environment);
  return outputPath;
}

test("multi-arity functions agree across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-multi-arity-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");

  try {
    const seedOutput = await compile(seedCompiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    const selfHostedOutput = await compile(
      portableCompiler,
      selfHostedDirectory,
      { ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory },
    );

    expect(await Bun.file(selfHostedOutput).text())
      .toBe(await Bun.file(seedOutput).text());
    expect(await Bun.file(`${selfHostedOutput}.map`).text())
      .toBe(await Bun.file(`${seedOutput}.map`).text());

    const reports = [];
    for (const modulePath of [seedOutput, selfHostedOutput]) {
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
    expect(reports[0]).toEqual({
      report: {
        zero: "zero",
        one: "one:7",
        variadic: 9,
        recursive: "done",
        destructuredVector: 17,
        destructuredMap: "10!",
        anonymousZero: "anonymous-zero",
        anonymousOne: "anonymous:11",
        portableZero: "portable-zero",
        portableOne: "portable:12",
      },
      asyncReport: {
        zero: "async-zero",
        one: "async:13",
      },
      failure: {
        name: "TypeError",
        message: "countdown received unsupported arity: 0",
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
