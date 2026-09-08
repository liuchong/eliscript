import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { diagnosticCorpusSuite } from "../tools/diagnostics/check.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-analyzer.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const oraclePath = resolve(
  projectDirectory,
  "tests/bootstrap-analyzer-oracle.el",
);
const emacs = process.env.EMACS ?? "emacs";
const diagnosticCorpus = await Bun.file(resolve(
  projectDirectory,
  "contracts/diagnostic-corpus.json",
)).json();
const diagnosticCases = diagnosticCorpusSuite(diagnosticCorpus, "analyzer").cases;

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

async function caseSource(testCase) {
  if (Object.hasOwn(testCase, "source")) {
    return testCase.source;
  }
  return Bun.file(resolve(projectDirectory, testCase.file)).text();
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
        ELISCRIPT_ANALYZER_FIXTURE: fixturePath,
      },
    },
  );
  return JSON.parse(output);
}

function generatedResult(readString, analyzeModule, testCase, source) {
  try {
    analyzeModule(readString(source, testCase.filename), testCase.filename);
    return { name: testCase.name, status: "ok" };
  } catch (error) {
    return {
      name: testCase.name,
      status: "error",
      message: error.message,
      diagnostic: error.eliscriptDiagnostic,
    };
  }
}

test("bootstrapped analyzer matches seed acceptance and diagnostics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-analyzer-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const reader = await import(
      `${pathToFileURL(resolve(directory, "reader.mjs")).href}?test`
    );
    const analyzer = await import(
      `${pathToFileURL(resolve(directory, "analyzer.mjs")).href}?test`
    );
    const fixture = await Bun.file(fixturePath).json();
    const cases = [...fixture.valid, ...fixture.invalid];
    const generated = [];
    for (const testCase of cases) {
      generated.push(generatedResult(
        reader.read_string,
        analyzer.analyze_module,
        testCase,
        await caseSource(testCase),
      ));
    }

    expect(generated).toEqual(await seedResults());
    expect(generated.slice(fixture.valid.length)).toEqual(
      diagnosticCases.map((entry) => ({
        name: entry.name,
        status: "error",
        message: entry.human,
        diagnostic: entry.diagnostic,
      })),
    );
    expect(await Bun.file(resolve(directory, "analyzer.mjs.map")).text())
      .toContain("bootstrap/compiler/analyzer.eli");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
