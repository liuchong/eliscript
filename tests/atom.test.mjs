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
  await mkdir(resolve(outputDirectory, "state"), { recursive: true });
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
    resolve(outputDirectory, "state/atom.mjs"),
    resolve(stdlib, "state/atom.eli"),
  ], environment);
}

test("Eliscript Atom preserves ordered single-transition state semantics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-atom-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const hostFixture = resolve(root, "tests/fixtures/atom-host.mjs");
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
      "state/atom.mjs",
    ]) {
      const seed = resolve(seedDirectory, relative);
      const selfHosted = resolve(selfHostedDirectory, relative);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const atomModule = resolve(outputDirectory, "state/atom.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        atomModule,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        atomModule,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);

    expect(reports[0]).toEqual({
      basic: {
        atom: true,
        hostObject: false,
        forgedAtom: false,
        hostileAtom: false,
        resetResult: 2,
        swapResult: 9,
        resetValues: [9, 10],
        swapValues: [10, 15],
        compareMismatch: false,
        compareSuccess: true,
        value: 20,
        valueEqualCompare: true,
        valueEqualState: [3, 4],
        opaqueMismatch: false,
        opaqueSuccess: true,
        opaqueState: { value: 3 },
        invalidReference: "ELI-ATOM-INVALID-REFERENCE",
        invalidTransform: "ELI-ATOM-INVALID-TRANSFORM",
      },
      validation: {
        calls: [2, 5, -1],
        compareRejected: false,
        compareMismatchWatchCalls: 0,
        guardedWatchCalls: 2,
        acceptedValue: 5,
        rejectedCode: "ELI-ATOM-VALIDATION",
        rejectedState: 5,
        rejectedReplacement: "ELI-ATOM-VALIDATION",
        validatorUnchanged: true,
        clearedValidator: null,
        unguardedValue: -1,
        initialRejection: "ELI-ATOM-VALIDATION",
        invalidValidator: "ELI-ATOM-INVALID-VALIDATOR",
        invalidOptions: "ELI-ATOM-INVALID-OPTIONS",
        inheritedValidatorCalls: 0,
        inheritedValue: 1,
        validatorMarkerPreserved: true,
        stateAfterThrownValidator: 1,
        stateAfterRecovery: 3,
      },
      reentrancy: {
        swap: "ELI-ATOM-REENTRANT",
        swapState: 1,
        validator: "ELI-ATOM-REENTRANT",
        validatorState: 1,
        validatorInstalled: false,
        compare: "ELI-ATOM-REENTRANT",
        compareState: 1,
      },
      watches: {
        outerResetResult: 1,
        finalValue: 2,
        outerEvents: ["control", "observer"],
        nestedEvents: ["late"],
        ordered: true,
        replacementEvents: ["new"],
        watchMarkerPreserved: true,
        committedAfterFailure: 2,
        healthyWatchCalls: 2,
        watchRecoveryValue: 2,
      },
      model: {
        agreement: true,
        transitions: 17_687,
        value: 2_764,
      },
      scale: { value: 100_000 },
    });

    const sourceMap = await Bun.file(
      resolve(seedDirectory, "state/atom.mjs.map"),
    ).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defun atom (initial");
    expect(sourceMap.sourcesContent[0]).toContain("(defun swap!");
    expect(sourceMap.sourcesContent[0]).toContain("(defun compare-and-set!");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
