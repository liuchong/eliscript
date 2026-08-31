import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const stdlibDirectory = resolve(projectDirectory, "stdlib");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const projectBuilder = resolve(projectDirectory, "bin/eliscript-build");
const sources = [
  "bit",
  "identifier",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
  "metadata",
  "data-text",
  "result",
];
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
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

test("portable Result values are byte-identical and short-circuit at scale", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-result-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const prunedDirectory = resolve(directory, "pruned");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-result-host.mjs",
  );
  const bunPreload = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    for (const name of sources) {
      const extension = name === "result" ? "mjs" : "eli";
      await runSuccessful([
        compiler,
        "--source-map",
        "--output",
        resolve(seedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ]);
    }
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    for (const name of sources) {
      const extension = name === "result" ? "mjs" : "eli";
      await runSuccessful([
        portableCompiler,
        "--source-map",
        "--output",
        resolve(selfHostedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ], {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
      });
    }

    for (const name of sources) {
      const extension = name === "result" ? "mjs" : "eli";
      const seed = resolve(seedDirectory, `${name}.${extension}`);
      const selfHosted = resolve(selfHostedDirectory, `${name}.${extension}`);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const resultModule = resolve(outputDirectory, "result.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        resultModule,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        resultModule,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      constructors: {
        ok: true,
        error: true,
        result: true,
        ordinaryMap: false,
        crossStatus: true,
      },
      payloads: { false: true, nil: true, undefined: true, error: "failed" },
      combinators: {
        mappedOk: 42,
        mappedError: "failed!",
        untouchedError: true,
        untouchedOk: true,
        okCalls: 1,
        errorCalls: 1,
        andThen: 10,
        andThenErrorIdentity: true,
        orElse: 6,
        orElseOkIdentity: true,
        foldOk: 5,
        foldError: 6,
        unwrapOk: true,
        unwrapError: 9,
        unwrapElse: 6,
      },
      collection: {
        values: [1, 2, 3],
        failureIdentity: true,
        invalidSource: null,
      },
      traversal: {
        ok: true,
        count: 50_000,
        first: 0,
        last: 99_998,
        calls: 50_000,
        earlyIdentity: true,
        earlyCalls: 12_346,
        invalidResult: true,
        invalidCalls: 6,
      },
      valueSemantics: {
        equal: true,
        hashEqual: true,
        mapLookup: "present",
        generatedInvariant: true,
      },
      dataText: { decodedResult: true, equal: true, stable: true },
    });

    await runSuccessful([
      projectBuilder,
      "--root",
      stdlibDirectory,
      "--portable",
      "unwrap-or",
      "--out-dir",
      prunedDirectory,
      resolve(stdlibDirectory, "result.eli"),
    ]);
    const pruned = await Bun.file(resolve(prunedDirectory, "result.mjs")).text();
    expect(pruned).toContain("function unwrap_or(");
    expect(pruned).toContain("function ok_QMARK_(");
    expect(pruned).not.toContain("function collect_results(");
    expect(pruned).not.toContain("function traverse_results(");
    expect(pruned).not.toContain("function map_err(");

    const sourceMap = await Bun.file(resolve(seedDirectory, "result.mjs.map"))
      .json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable collect-results");
    expect(sourceMap.sourcesContent[0]).toContain("(defportable traverse-results");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
