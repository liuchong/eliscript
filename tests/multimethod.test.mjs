import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const stdlib = resolve(root, "stdlib");
const compiler = resolve(root, "bin/eliscript");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const dependencies = [
  "bit",
  "identifier",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
];
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

async function compileFamily(command, outputDirectory, environment = {}) {
  await mkdir(outputDirectory, { recursive: true });
  for (const name of dependencies) {
    await runSuccessful([
      command,
      "--source-map",
      "--output",
      resolve(outputDirectory, `${name}.eli`),
      resolve(stdlib, `${name}.eli`),
    ], environment);
  }
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    resolve(outputDirectory, "multimethod.mjs"),
    resolve(stdlib, "multimethod.eli"),
  ], environment);
}

test("Eliscript multimethods dispatch on values with persistent method snapshots", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-multimethod-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const hostFixture = resolve(root, "tests/fixtures/multimethod-host.mjs");
  const bunPreload = resolve(
    root,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    root,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );

  try {
    await compileFamily(compiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const relative of [
      ...dependencies.map((name) => `${name}.eli`),
      "multimethod.mjs",
    ]) {
      const seed = resolve(seedDirectory, relative);
      const selfHosted = resolve(selfHostedDirectory, relative);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(outputDirectory, "multimethod.mjs");
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
        multiFn: true,
        ordinaryFunction: false,
        forged: false,
        callable: true,
        name: "render",
        dispatchFunction: "number",
        customDefault: "fallback",
      },
      dispatch: {
        textResult: "text:hello",
        numberResult: 42,
        fallbackResult: "unknown:9",
        dispatchOnly: "text",
        calls: 8,
        textLookup: true,
        fallbackLookup: true,
        hasText: true,
        hasAbsentThroughDefault: true,
      },
      mutation: {
        addReturnsIdentity: true,
        removeReturnsIdentity: true,
        clearReturnsIdentity: true,
        initialCount: 0,
        populatedCount: 3,
        snapshotRetainsText: true,
        replacementResult: "replacement:hello",
        removedFallsBack: "text:hello",
        beforeClearCount: 2,
        afterClearCount: 0,
      },
      valueDispatch: {
        compositeResult: "number/2",
        customDefaultResult: "default:missing",
        nilDefaultResult: "nil:missing",
        undefinedDefaultResult: "undefined:missing",
        identityMatch: "identity-match",
        identityMiss: {
          code: "ELI-MULTI-FN-NO-METHOD",
          name: "identity",
          dispatchValue: {},
        },
      },
      callbacks: {
        dispatchMarkerPreserved: true,
        methodMarkerPreserved: true,
        firstSelfReplacement: "first",
        secondSelfReplacement: "second",
      },
      errors: {
        noMethod: {
          code: "ELI-MULTI-FN-NO-METHOD",
          name: "empty",
          dispatchValue: "missing",
        },
        invalidDispatch: {
          code: "ELI-MULTI-FN-INVALID-DISPATCH",
          name: "bad",
          dispatchValue: null,
        },
        invalidArity: {
          code: "ELI-MULTI-FN-INVALID-ARITY",
          name: "bad",
          dispatchValue: null,
        },
        invalidMethod: {
          code: "ELI-MULTI-FN-INVALID-METHOD",
          name: "empty",
          dispatchValue: "bad",
        },
        invalidReference: {
          code: "ELI-MULTI-FN-INVALID-REFERENCE",
          name: null,
          dispatchValue: null,
        },
        clearedError: {
          code: "ELI-MULTI-FN-NO-METHOD",
          name: "render",
          dispatchValue: "text",
        },
      },
      scale: {
        calls: 100_000,
        total: -50_000,
      },
    });

    const sourceMap = await Bun.file(
      resolve(seedDirectory, "multimethod.mjs.map"),
    ).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defun multi-fn\n");
    expect(sourceMap.sourcesContent[0]).toContain("(defun add-method!\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
