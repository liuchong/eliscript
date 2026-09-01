import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerReaderCharacterSourceDigest,
  validateCompilerReaderCharacterReport,
} from "../tools/compiler/reader-character-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-reader-character-macos-arm64.json",
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
}

test("reader character predicates match their Eliscript references", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "eliscript-reader-character-"),
  );
  try {
    await run([buildPath], {
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory },
    });
    const reader = await import(
      `${pathToFileURL(path.join(directory, "reader.mjs")).href}?characters`
    );
    const hostBoundaries = [undefined, null, false, true, -1, NaN, Infinity];
    let checked = 0;
    for (const code of hostBoundaries) {
      expect(reader.whitespace_code_p(code)).toBe(
        reader.reference_whitespace_code_p(code),
      );
      expect(reader.delimiter_code_p(code)).toBe(
        reader.reference_delimiter_code_p(code),
      );
      checked += 1;
    }
    for (let code = 0; code <= 0x10FFFF; code += 1) {
      if (reader.whitespace_code_p(code) !==
            reader.reference_whitespace_code_p(code) ||
          reader.delimiter_code_p(code) !==
            reader.reference_delimiter_code_p(code)) {
        throw new Error(`reader character decision differs for ${code}`);
      }
      checked += 1;
    }
    expect(checked).toBe(0x110000 + hostBoundaries.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed reader character report matches measured sources", async () => {
  const report = validateCompilerReaderCharacterReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(
    await compilerReaderCharacterSourceDigest(),
  );
  expect(report.corpus.files).toHaveLength(compilerModuleCount);
  expect(report.corpus.files).toContain("bootstrap/compiler/project.eli");
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.validation.identicalCompilerOutputs).toBe(compilerModuleCount);
  expect(report.measurements.completeCompilerSpeedup).toBeGreaterThanOrEqual(
    report.decision.minimumCompleteCompilerSpeedup,
  );
});
