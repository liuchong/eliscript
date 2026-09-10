import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const source = resolve(root, "tests/fixtures/core-expression-forms.eli");
const hostFixture = resolve(
  root,
  "tests/fixtures/core-expression-forms-host.mjs",
);
const bunPreload = resolve(
  root,
  "tests/fixtures/compiled-eli-bun-preload.mjs",
);
const nodeLoader = resolve(
  root,
  "tests/fixtures/compiled-eli-node-loader.mjs",
);

async function runSuccessful(command, environment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, ...environment },
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

async function compile(command, output, environment = {}) {
  await mkdir(resolve(output, "tests/fixtures"), { recursive: true });
  const modulePath = resolve(
    output,
    "tests/fixtures/core-expression-forms.mjs",
  );
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    modulePath,
    source,
  ], environment);
  return modulePath;
}

async function runHost(host, modulePath) {
  const command = host === "bun"
    ? ["bun", "--preload", bunPreload, hostFixture, pathToFileURL(modulePath).href]
    : [
      process.env.NODE ?? "node",
      "--experimental-loader",
      nodeLoader,
      hostFixture,
      pathToFileURL(modulePath).href,
    ];
  return JSON.parse(await runSuccessful(command));
}

test("core expression forms preserve threading and single-evaluation semantics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-core-forms-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  try {
    const seedModule = await compile(seedCompiler, resolve(directory, "seed"));
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    const selfHostedModule = await compile(
      portableCompiler,
      resolve(directory, "self-hosted"),
      { ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory },
    );

    expect(await Bun.file(selfHostedModule).text())
      .toBe(await Bun.file(seedModule).text());
    expect(await Bun.file(`${selfHostedModule}.map`).text())
      .toBe(await Bun.file(`${seedModule}.map`).text());

    const reports = [];
    for (const modulePath of [seedModule, selfHostedModule]) {
      reports.push(await runHost("bun", modulePath));
      reports.push(await runHost("node", modulePath));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      threadFirst: 8,
      threadLast: 8,
      named: 8,
      ifLetFalse: "missing",
      ifLetValue: 8,
      ifSomeFalse: false,
      ifSomeUndefined: "present",
      ifSomeNil: "missing",
      whenLetValue: 15,
      whenSomeFalse: "missing",
      calls: 7,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
