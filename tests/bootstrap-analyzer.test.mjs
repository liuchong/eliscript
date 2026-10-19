import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function seedResults(inputFixture = fixturePath) {
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
        ELISCRIPT_ANALYZER_FIXTURE: inputFixture,
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

    // Reuse this actual frontend build and the independent Seed analyzer.
    // Repeated names are successful-cache hits; their declarations, lexical
    // mutability, nearest async context and first-error locations stay live.
    const validSources = [
      '(defconst shared 7) (defun f (value) (let ((local value)) (let ((nested local)) (+ shared shared local nested))))',
      '(defconst shared 7) (defun f () (let* ((before shared) (shared 1) (after shared)) (setq shared (+ shared 1)) [before shared after]))',
      '(defun f (value) (let ((x-y value)) (let ((x_y x-y)) (+ x-y x_y))))',
      '(defasync f (promise) (let ((value (await promise))) (let ((next value)) (await next))))',
      '(defasync f (promise) (let ((value promise)) (async () (let ((next value)) (await next)))))',
      '(defun f (value) (let* ((a (+ value value)) (b (+ a a))) (if value (recur b) value)))',
      '(defun f (value) (let ((a value) (b value)) (lambda () (+ a b value))))',
      '(defun f () [console/log console/log globalThis/Math globalThis/Math])',
      '(defun f (value) (loop ((step value)) (if step (recur false) step)))',
      '(defun f () (let () (lambda () (let* () 1))))',
      "(defconst data '(defportable fake () missing)) (defun f () data)",
      '(module outer (defconst base 2) (module inner (defportable f (value) (+ value base))))',
      '(defun helper (value) value) (defun f (value) (helper (helper value)))',
    ];
    const invalidSources = [
      '(defconst shared 7) (defun f () (let ((local shared)) shared shared (setq shared local)))',
      '(defun f (x-y x_y) [x-y x_y])',
      '(defasync f (promise) (lambda () (let ((next promise)) (await next))))',
      '(defun f (value) (+ (recur value) value))',
      '(defun f (value) (try (recur value) (finally nil)))',
      '(defun f () (let ((first missing) (second 1 2)) first))',
      '(defun f () [console/log console/log __eliscript_private/value])',
      '(defun f () (let ((value 1)) value missing missing))',
      '(defun f () (let () missing))',
      '(defun f () (defun nested () 1))',
      '(module outer (defportable f (value) (print value)))',
      '(defun helper (value) value) (defportable f (value) (helper value))',
    ];
    const extra = {valid: validSources.map((source, index) => ({name: 'environment-valid-' + index,
      filename: 'environment😀-' + index + '.eli', source})),
      invalid: invalidSources.map((source, index) => ({name: 'environment-invalid-' + index,
        filename: 'environment错误-' + index + '.eli', source}))};
    const extraPath = resolve(directory, 'environment-cases.json');
    await writeFile(extraPath, JSON.stringify(extra));
    const expectedEnvironment = await seedResults(extraPath);
    expect(expectedEnvironment.map(item => item.status)).toEqual([
      ...extra.valid.map(() => 'ok'), ...extra.invalid.map(() => 'error'),
    ]);
    for (let iteration = 0; iteration < 2; iteration++) {
      const actual = [...extra.valid, ...extra.invalid].map(item => {
        const forms = reader.read_string(item.source, item.filename), saved = structuredClone(forms);
        let result;
        try {
          expect(analyzer.analyze_module(forms, item.filename)).toBe(forms);
          result = {name: item.name, status: 'ok'};
        } catch (error) {
          result = {name: item.name, status: 'error', message: error.message,
            diagnostic: error.eliscriptDiagnostic};
        }
        expect(forms).toEqual(saved);
        return result;
      });
      expect(actual).toEqual(expectedEnvironment);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
