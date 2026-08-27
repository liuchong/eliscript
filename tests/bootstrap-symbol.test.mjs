import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-symbols.json",
);
const sourcePath = resolve(
  projectDirectory,
  "bootstrap/compiler/symbol.eli",
);
const compilerPath = resolve(projectDirectory, "bin/eliscript");

async function compileBootstrapModule(outputPath) {
  const child = Bun.spawn(
    [compilerPath, "--source-map", "--output", outputPath, sourcePath],
    {
      cwd: projectDirectory,
      env: process.env,
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `compiler exited with ${exitCode}`);
  }
}

function runCase(operation, implementation, testCase) {
  try {
    return { input: testCase.input, output: implementation(testCase.input) };
  } catch (error) {
    return { input: testCase.input, error: error.message };
  }
}

test("bootstrapped symbol mapping matches the seed conformance fixture", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-bootstrap-"));
  try {
    const outputPath = resolve(directory, "symbol.mjs");
    await compileBootstrapModule(outputPath);
    const firstCode = await Bun.file(outputPath).text();
    const firstMap = await Bun.file(`${outputPath}.map`).text();
    await compileBootstrapModule(outputPath);
    expect(await Bun.file(outputPath).text()).toBe(firstCode);
    expect(await Bun.file(`${outputPath}.map`).text()).toBe(firstMap);
    const generated = await import(pathToFileURL(outputPath).href);
    const fixture = await Bun.file(fixturePath).json();
    const implementations = {
      segment: generated.munge_segment,
      binding: generated.binding_name,
      reference: generated.reference_name,
    };

    for (const [operation, cases] of Object.entries(fixture)) {
      for (const testCase of cases) {
        expect(runCase(operation, implementations[operation], testCase))
          .toEqual(testCase);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
