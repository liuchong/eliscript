import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-ir.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const oraclePath = resolve(projectDirectory, "tests/bootstrap-ir-oracle.el");
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
        ELISCRIPT_IR_FIXTURE: fixturePath,
      },
    },
  );
  return JSON.parse(output);
}

function collectKinds(programs) {
  const result = new Set();
  const visit = (node) => {
    result.add(node.kind);
    node.children.forEach(visit);
  };
  programs.forEach((program) => program.body.forEach(visit));
  return [...result].sort();
}

test("bootstrapped lowerer matches complete seed IR trees and spans", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-ir-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = async (name) => import(
      `${pathToFileURL(resolve(directory, `${name}.mjs`)).href}?test`
    );
    const [reader, expander, analyzer, ir, lower] = await Promise.all([
      module("reader"),
      module("expander"),
      module("analyzer"),
      module("ir"),
      module("lower"),
    ]);
    const fixture = await Bun.file(fixturePath).json();
    const generated = [];
    for (const testCase of fixture.valid) {
      const source = await caseSource(testCase);
      const forms = expander.expand_module(
        reader.read_string(source, testCase.filename),
        testCase.filename,
      );
      analyzer.analyze_module(forms, testCase.filename);
      generated.push({
        name: testCase.name,
        status: "ok",
        program: lower.lower_module(forms, testCase.filename),
      });
    }

    expect(generated).toEqual(await seedResults());
    expect(collectKinds(generated.map((result) => result.program)))
      .toEqual([...ir.node_kinds].sort());
    expect(await Bun.file(resolve(directory, "lower.mjs.map")).text())
      .toContain("bootstrap/compiler/lower.eli");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
