import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { definition } from "../tools/compiler/controlled-baseline.mjs";
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
const compilerModuleCount = 13;

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
    const inputs = ["", "abc", "😀token\nnext", "a😀λ;end", "\t \r\nfoo",
      ";😀λ\rcomment\n\nbar", ";trailing 😀", "\f\n;comment\n  :key/value", "foo\uD800bar"];
    for (const source of inputs) {
      for (const initialIndex of [0, Math.min(1, source.length)]) {
        const state = { source, filename: "boundary.eli", index: initialIndex,
          offset: 11, line: 3, column: 7 };
        const fast = { ...state };
        const reference = { ...state };
        expect(reader.skip_space_and_comments(fast)).toBe(
          reader.reference_skip_space_and_comments(reference));
        expect(fast).toEqual(reference);
        const start = { index: fast.index };
        expect(reader.read_token(fast, start)).toBe(
          reader.reference_read_token(reference, start));
        expect(fast).toEqual(reference);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("a failed original Reader performance gate retains every raw sample and the failed decision", async () => {
  const report=JSON.parse(await readFile(reportPath,"utf8"));
  report.measurements.completeCompilerSpeedup=1.079;
  report.decision.passed=false;
  let failure;
  try { validateCompilerReaderCharacterReport(report); } catch (error) { failure=error; }
  expect(failure).toBeInstanceOf(TypeError);
  expect(failure.report).toBe(report);
  expect(failure.report.decision.passed).toBe(false);
  for(const name of["referencePredicates","optimizedPredicates","baselineCompiler","optimizedCompiler"])
    expect(failure.report.measurements[name].samplesMs).toHaveLength(report.parameters.timingSamples);
});

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

test("reader reacceptance rejects weakened thresholds and altered controls", async () => {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const entry of report.baseline.control.inputs) {
    expect(entry.sha256).toBe(hash(await readFile(path.join(projectDirectory, entry.path))));
  }
  const weakened = structuredClone(report);
  weakened.decision.minimumCompleteCompilerSpeedup = 1.01;
  expect(() => validateCompilerReaderCharacterReport(weakened)).toThrow("speedup decision failed");
  const altered = structuredClone(report);
  altered.baseline.control.artifacts[0].control = "0".repeat(64);
  expect(() => validateCompilerReaderCharacterReport(altered)).toThrow("controlled compiler baseline");
  const missing = structuredClone(report);
  missing.baseline.control.restored.pop();
  expect(() => validateCompilerReaderCharacterReport(missing)).toThrow("controlled compiler baseline");
  const form = '(defun sample () ; ) ignored\n (js* "(nested)") (list 1 (list 2)))';
  expect(definition(`${form}\n(defun next () nil)`, "sample")).toBe(form);
  expect(() => definition("(defun unfinished ()", "unfinished")).toThrow("unterminated");
});
