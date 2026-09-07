import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-reader.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const oraclePath = resolve(
  projectDirectory,
  "tests/bootstrap-reader-oracle.el",
);
const emacs = process.env.EMACS ?? "emacs";
const artifactNames = [
  "symbol.mjs",
  "symbol.mjs.map",
  "syntax.mjs",
  "syntax.mjs.map",
  "reader.mjs",
  "reader.mjs.map",
  "formatter.mjs",
  "formatter.mjs.map",
  "expander.mjs",
  "expander.mjs.map",
  "transient-analysis.mjs",
  "transient-analysis.mjs.map",
  "analyzer.mjs",
  "analyzer.mjs.map",
  "ir.mjs",
  "ir.mjs.map",
  "lower.mjs",
  "lower.mjs.map",
  "source-map.mjs",
  "source-map.mjs.map",
  "emitter.mjs",
  "emitter.mjs.map",
  "compiler.mjs",
  "compiler.mjs.map",
];

async function run(command, options) {
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
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

async function buildBootstrap(outputDirectory) {
  await run([buildPath], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_OUT_DIR: outputDirectory,
    },
  });
}

async function seedResults() {
  const output = await run(
    [
      emacs,
      "--batch",
      "-Q",
      "-L",
      "compiler",
      "-L",
      "tests",
      "--script",
      oraclePath,
    ],
    {
      env: {
        ...process.env,
        ELISCRIPT_READER_FIXTURE: fixturePath,
      },
    },
  );
  return JSON.parse(output);
}

function generatedResult(readString, testCase, source) {
  try {
    return {
      name: testCase.name,
      status: "ok",
      forms: readString(source, testCase.filename),
    };
  } catch (error) {
    return {
      name: testCase.name,
      status: "error",
      message: error.message,
      diagnostic: error.eliscriptDiagnostic,
    };
  }
}

function expectDiagnostic(testCase, result) {
  const match = /^(.*):(\d+):(\d+): (.*)$/s.exec(testCase.error);
  expect(match).not.toBeNull();
  expect(result).toMatchObject({
    status: "error",
    message: testCase.error,
    diagnostic: {
      format: "eliscript-diagnostic",
      version: 1,
      code: "ELI-R0001",
      severity: "error",
      phase: "reader",
      message: match[4],
      location: {
        file: match[1],
        start: {
          line: Number(match[2]),
          column: Number(match[3]),
        },
      },
    },
  });
}

async function caseSource(testCase) {
  if (Object.hasOwn(testCase, "source")) {
    return testCase.source;
  }
  return Bun.file(resolve(projectDirectory, testCase.file)).text();
}

test("bootstrapped reader matches normalized seed syntax and diagnostics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-reader-"));
  try {
    await buildBootstrap(directory);
    const firstArtifacts = new Map();
    for (const name of artifactNames) {
      firstArtifacts.set(name, await Bun.file(resolve(directory, name)).text());
    }

    await buildBootstrap(directory);
    for (const name of artifactNames) {
      expect(await Bun.file(resolve(directory, name)).text())
        .toBe(firstArtifacts.get(name));
    }

    const reader = await import(
      `${pathToFileURL(resolve(directory, "reader.mjs")).href}?test`
    );
    const fixture = await Bun.file(fixturePath).json();
    const cases = [...fixture.valid, ...fixture.invalid];
    const generated = [];
    for (const testCase of cases) {
      generated.push(generatedResult(
        reader.read_string,
        testCase,
        await caseSource(testCase),
      ));
    }

    expect(generated).toEqual(await seedResults());
    fixture.invalid.forEach((testCase, index) => {
      expectDiagnostic(testCase, generated[fixture.valid.length + index]);
    });
    expect(firstArtifacts.get("reader.mjs.map"))
      .toContain("bootstrap/compiler/reader.eli");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
