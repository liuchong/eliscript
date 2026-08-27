import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-expander.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const oraclePath = resolve(
  projectDirectory,
  "tests/bootstrap-expander-oracle.el",
);
const emacs = process.env.EMACS ?? "emacs";

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
        ELISCRIPT_EXPANDER_FIXTURE: fixturePath,
      },
    },
  );
  return JSON.parse(output);
}

function generatedResult(reader, expander, testCase, source) {
  try {
    return {
      name: testCase.name,
      status: "ok",
      forms: expander.expand_module(
        reader.read_string(source, testCase.filename),
        testCase.filename,
      ),
    };
  } catch (error) {
    return {
      name: testCase.name,
      status: "error",
      message: error.message,
    };
  }
}

test("bootstrapped expander matches seed syntax, spans, and diagnostics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-expander-"));
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
    const expander = await import(
      `${pathToFileURL(resolve(directory, "expander.mjs")).href}?test`
    );
    const analyzer = await import(
      `${pathToFileURL(resolve(directory, "analyzer.mjs")).href}?test`
    );
    const fixture = await Bun.file(fixturePath).json();
    const cases = [...fixture.valid, ...fixture.invalid];
    const generated = [];
    for (const testCase of cases) {
      generated.push(generatedResult(
        reader,
        expander,
        testCase,
        await caseSource(testCase),
      ));
    }

    expect(generated).toEqual(await seedResults());
    for (const result of generated.slice(0, fixture.valid.length)) {
      expect(() => analyzer.analyze_module(result.forms, result.name))
        .not.toThrow();
    }
    expect(await Bun.file(resolve(directory, "expander.mjs.map")).text())
      .toContain("bootstrap/compiler/expander.eli");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
