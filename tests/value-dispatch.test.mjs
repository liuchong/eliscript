import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const source = resolve(root, "tests/fixtures/value-dispatch.eli");
const output = "tests/fixtures/value-dispatch.mjs";
const hostFixture = resolve(root, "tests/fixtures/value-dispatch-host.mjs");
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

test("case and condp agree across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-dispatch-"));
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
        grouped: "small",
        symbol: "symbol",
        vector: "vector",
        caseDefault: "fallback",
        caseNil: null,
        caseObservations: 2,
        redirected: "matched:hit-3",
        condpDefault: "fallback",
        condpObservations: 1,
        predicateCreations: 1,
        predicateCalls: 2,
      },
      failure: {
        name: "TypeError",
        message: "condp found no matching clause",
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
