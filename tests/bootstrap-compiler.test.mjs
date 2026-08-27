import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  compileFile,
  loadCompiler,
  parseArguments,
} from "../bootstrap/host/bun.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const seedCliPath = resolve(projectDirectory, "bin/eliscript");
const portableCliPath = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";
const moduleNames = [
  "symbol",
  "syntax",
  "reader",
  "expander",
  "analyzer",
  "ir",
  "lower",
  "source-map",
  "emitter",
  "compiler",
];

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function runSuccessful(command, options) {
  const result = await run(command, options);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() ||
      `${command[0]} exited with ${result.exitCode}`);
  }
  return result.stdout;
}

async function buildWithPortableCompiler(compilerDirectory, outputDirectory) {
  const compiler = await loadCompiler(compilerDirectory);
  for (const name of moduleNames) {
    await compileFile({
      compiler,
      input: resolve(projectDirectory, `bootstrap/compiler/${name}.eli`),
      output: resolve(outputDirectory, `${name}.mjs`),
      sourceMap: true,
    });
  }
}

async function expectArtifactDirectoriesEqual(left, right) {
  for (const name of moduleNames) {
    for (const suffix of [".mjs", ".mjs.map"]) {
      const filename = `${name}${suffix}`;
      expect(await Bun.file(resolve(right, filename)).text())
        .toBe(await Bun.file(resolve(left, filename)).text());
    }
  }
}

test("portable compiler driver reaches a reproducible fixed point", async () => {
  expect(parseArguments(["--", "-o", "out.mjs", "input.eli"]))
    .toEqual({
      input: "input.eli",
      output: "out.mjs",
      sourceMap: false,
      portableEntries: [],
    });
  expect(parseArguments([
    "--portable",
    "work",
    "--portable",
    "index",
    "input.eli",
  ])).toEqual({
    input: "input.eli",
    output: undefined,
    sourceMap: false,
    portableEntries: ["work", "index"],
  });
  expect(parseArguments(["--help"])).toEqual({ help: true });
  expect(() => parseArguments(["--source-map", "input.eli"]))
    .toThrow("--source-map requires --output");
  expect(() => parseArguments(["one.eli", "two.eli"]))
    .toThrow("multiple input files are not supported yet");

  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-compiler-"));
  try {
    const generationOne = resolve(directory, "generation-one");
    const generationTwo = resolve(directory, "generation-two");
    const generationThree = resolve(directory, "generation-three");
    await runSuccessful([buildPath], {
      env: {
        ...process.env,
        EMACS: emacs,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: generationOne,
      },
    });

    await buildWithPortableCompiler(generationOne, generationTwo);
    await buildWithPortableCompiler(generationTwo, generationThree);
    await expectArtifactDirectoriesEqual(generationOne, generationTwo);
    await expectArtifactDirectoriesEqual(generationTwo, generationThree);

    const coreSource = resolve(projectDirectory, "tests/fixtures/core.eli");
    const seedOutput = await runSuccessful([seedCliPath, coreSource], {
      env: { ...process.env, EMACS: emacs },
    });
    const portableOutput = await runSuccessful([portableCliPath, coreSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    expect(portableOutput).toBe(seedOutput);

    for (const [sourceName, expectedFunctions] of [
      ["sequence.eli", [
        "function map(function$, values)",
        "function range_by(start, end, step)",
      ]],
      ["text.eli", [
        "function slice(start, end, text)",
        "function trim(text)",
      ]],
      ["object.eli", [
        "function assoc(object, key, value)",
        "function omit(object, omitted_keys)",
      ]],
      ["data.eli", [
        "import {assoc} from \"./object.eli\";",
        "import {has_QMARK_} from \"./object.eli\";",
        "function group_by(key_function, values)",
      ]],
    ]) {
      const source = resolve(projectDirectory, "stdlib", sourceName);
      const seedLibraryOutput = await runSuccessful([seedCliPath, source], {
        env: { ...process.env, EMACS: emacs },
      });
      const selfHostedLibraryOutput = await runSuccessful(
        [portableCliPath, source],
        {
          env: {
            ...process.env,
            ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
          },
        },
      );
      expect(selfHostedLibraryOutput).toBe(seedLibraryOutput);
      for (const expectedFunction of expectedFunctions) {
        expect(seedLibraryOutput).toContain(expectedFunction);
      }
    }

    const portableSource = resolve(directory, "portable.eli");
    await writeFile(
      portableSource,
      `(defconst step 2)
(defportable helper (value) (* value step))
(defportable work (value) (helper value))
(defportable unused () 99)
(defun ordinary () 1)\n`,
    );
    const seedPortableOutput = await runSuccessful(
      [seedCliPath, "--portable", "work", portableSource],
      { env: { ...process.env, EMACS: emacs } },
    );
    const selfHostedPortableOutput = await runSuccessful(
      [portableCliPath, "--portable", "work", portableSource],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    expect(selfHostedPortableOutput).toBe(seedPortableOutput);
    expect(seedPortableOutput).toContain("function helper(value)");
    expect(seedPortableOutput).toContain("function work(value)");
    expect(seedPortableOutput).not.toContain("function unused");
    expect(seedPortableOutput).not.toContain("function ordinary");

    const importedPortableSource = resolve(directory, "portable-import.eli");
    await writeFile(
      importedPortableSource,
      `(import-portable "./helper.eli" helper)
(defportable imported-work (value) (helper value))\n`,
    );
    const seedImportFailure = await run([
      seedCliPath,
      "--portable",
      "imported-work",
      importedPortableSource,
    ], { env: { ...process.env, EMACS: emacs } });
    const portableImportFailure = await run([
      portableCliPath,
      "--portable",
      "imported-work",
      importedPortableSource,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    expect(seedImportFailure.exitCode).toBe(1);
    expect(portableImportFailure.exitCode).toBe(1);
    expect(seedImportFailure.stderr)
      .toContain("portable import helper requires a project build");
    expect(portableImportFailure.stderr)
      .toContain("portable import helper requires a project build");

    const seedPortableMapped = resolve(directory, "seed-cli/portable.mjs");
    const selfHostedPortableMapped = resolve(
      directory,
      "portable-cli/portable.mjs",
    );
    await runSuccessful(
      [
        seedCliPath,
        "--source-map",
        "--portable",
        "work",
        "--output",
        seedPortableMapped,
        portableSource,
      ],
      { env: { ...process.env, EMACS: emacs } },
    );
    await runSuccessful(
      [
        portableCliPath,
        "--source-map",
        "--portable",
        "work",
        "--output",
        selfHostedPortableMapped,
        portableSource,
      ],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    expect(await Bun.file(selfHostedPortableMapped).text())
      .toBe(await Bun.file(seedPortableMapped).text());
    expect(await Bun.file(`${selfHostedPortableMapped}.map`).text())
      .toBe(await Bun.file(`${seedPortableMapped}.map`).text());

    const seedMapped = resolve(directory, "seed-cli/core.mjs");
    const portableMapped = resolve(directory, "portable-cli/core.mjs");
    await runSuccessful(
      [seedCliPath, "--source-map", "--output", seedMapped, coreSource],
      { env: { ...process.env, EMACS: emacs } },
    );
    await runSuccessful(
      [portableCliPath, "--source-map", "--output", portableMapped, coreSource],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    expect(await Bun.file(portableMapped).text())
      .toBe(await Bun.file(seedMapped).text());
    expect(await Bun.file(`${portableMapped}.map`).text())
      .toBe(await Bun.file(`${seedMapped}.map`).text());

    const brokenSource = resolve(directory, "broken.eli");
    await writeFile(brokenSource, "(defun broken () missing)\n");
    const seedFailure = await run([seedCliPath, brokenSource], {
      env: { ...process.env, EMACS: emacs },
    });
    const portableFailure = await run([portableCliPath, brokenSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    const diagnostic = `${brokenSource}:1:18: unbound symbol: missing`;
    expect(seedFailure.exitCode).toBe(1);
    expect(portableFailure.exitCode).toBe(1);
    expect(portableFailure.stdout).toBe(seedFailure.stdout);
    expect(seedFailure.stderr).toContain(diagnostic);
    expect(portableFailure.stderr).toContain(diagnostic);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
