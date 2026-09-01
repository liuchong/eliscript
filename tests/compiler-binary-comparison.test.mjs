import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerBinaryComparisonSourceDigest,
  validateCompilerBinaryComparisonReport,
} from "../tools/compiler/binary-comparison-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-binary-comparison-macos-arm64.json",
);
const compilerModuleCount = 12;

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
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

test("binary comparison emission preserves strict argument evaluation", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "eliscript-binary-comparison-"),
  );
  try {
    await run([buildPath], {
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory },
    });
    const compiler = await import(
      `${pathToFileURL(path.join(directory, "compiler.mjs")).href}?comparison`
    );
    const source = `
(defvar calls (js-array))
(defun record (value) (progn (js-call calls :push value) value))
(defun run ()
  (progn
    (put calls :length 0)
    (let ((binary (= (record 1) (record 1)))
          (nary (= (record 1) (record 2) (record 3))))
      (js-object :binary binary :nary nary :calls calls))))
(export run)`;
    const javascript = compiler.compile_string(source, "comparison.eli");
    expect(javascript).toContain("(record(1) === record(1))");
    const executable = path.join(directory, "comparison.mjs");
    await writeFile(executable, javascript);
    const result = JSON.parse((await run(
      [process.execPath, "--eval",
        "const m = await import(process.env.ELISCRIPT_TEST_MODULE); " +
          "console.log(JSON.stringify(m.run()));"],
      {
        env: {
          ...process.env,
          ELISCRIPT_TEST_MODULE: pathToFileURL(executable).href,
        },
      },
    )).trim());
    expect(result).toEqual({
      binary: true,
      nary: false,
      calls: [1, 1, 1, 2, 3],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed binary comparison report matches measured sources", async () => {
  const report = validateCompilerBinaryComparisonReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(
    await compilerBinaryComparisonSourceDigest(),
  );
  expect(report.corpus.files).toHaveLength(compilerModuleCount);
  expect(report.corpus.files).toContain("bootstrap/compiler/project.eli");
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.measurements.speedup).toBeGreaterThanOrEqual(
    report.decision.minimumSpeedup,
  );
});
