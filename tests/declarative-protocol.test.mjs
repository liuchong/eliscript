import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const protocolSource = resolve(root, "stdlib/core/protocol.eli");
const declarationSource = resolve(
  root,
  "tests/fixtures/declarative-protocol.eli",
);
const hostFixture = resolve(
  root,
  "tests/fixtures/declarative-protocol-host.mjs",
);
const bunPreload = resolve(
  root,
  "tests/fixtures/compiled-eli-bun-preload.mjs",
);
const nodeLoader = resolve(
  root,
  "tests/fixtures/compiled-eli-node-loader.mjs",
);
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
  await compile(
    command,
    protocolSource,
    resolve(outputRoot, "stdlib/core/protocol.eli"),
    environment,
  );
  await compile(
    command,
    declarationSource,
    resolve(outputRoot, "tests/fixtures/declarative-protocol.mjs"),
    environment,
  );
}

test("declarative protocols preserve protocol identity and host dispatch", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-protocol-decls-"));
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

    for (const relative of [
      "stdlib/core/protocol.eli",
      "tests/fixtures/declarative-protocol.mjs",
    ]) {
      const seed = resolve(seedDirectory, relative);
      const selfHosted = resolve(selfHostedDirectory, relative);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(
        outputRoot,
        "tests/fixtures/declarative-protocol.mjs",
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
      identity: {
        protocol: true,
        operation: "describe",
        slot: "symbol",
        operations: ["describe", "measure"],
      },
      type: { description: "box:7", measurement: 21 },
      category: { description: "number:5", measurement: 20 },
      fallback: { description: "default", measurement: 0 },
    });

    const sourceMap = await Bun.file(resolve(
      seedDirectory,
      "tests/fixtures/declarative-protocol.mjs.map",
    )).json();
    expect(sourceMap.sourcesContent[0]).toContain(
      "(defprotocol IDescribe describe measure)",
    );
    expect(sourceMap.sourcesContent[0]).toContain(
      "(extend-type Box IDescribe",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
