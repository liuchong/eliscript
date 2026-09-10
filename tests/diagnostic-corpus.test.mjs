import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkDiagnosticCorpus,
  DiagnosticCorpusError,
  validateDiagnosticCorpus,
} from "../tools/diagnostics/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function contract() {
  return JSON.parse(
    await readFile(path.join(ROOT, "contracts/diagnostic-corpus.json"), "utf8"),
  );
}

async function validationErrors(value) {
  try {
    await validateDiagnosticCorpus(value, { root: ROOT });
  } catch (error) {
    expect(error).toBeInstanceOf(DiagnosticCorpusError);
    return error.errors;
  }
  throw new Error("expected diagnostic corpus validation to fail");
}

test("complete negative diagnostic corpus is frozen and source-derived", async () => {
  const checked = await checkDiagnosticCorpus({ root: ROOT });

  expect(checked.suites.map((suite) => [
    suite.id,
    suite.validCaseCount,
    suite.negativeCaseCount,
  ])).toEqual([
    ["reader", 21, 16],
    ["expander", 40, 22],
    ["analyzer", 30, 57],
  ]);
  expect(checked.suites.flatMap((suite) => suite.cases)).toHaveLength(95);
  expect(checked.identity).toMatch(/^[0-9a-f]{64}$/u);
});

test("diagnostic corpus rejects missing cases and fixture drift", async () => {
  const value = await contract();
  value.suites[0].cases.pop();

  const errors = await validationErrors(value);
  expect(errors).toContain("suite reader must contain exactly 16 negative cases");
  expect(errors).toContain(
    "suite reader cases must exactly match the ordered invalid fixture cases",
  );
});

test("diagnostic corpus rejects structured and human diagnostic drift", async () => {
  const value = await contract();
  value.suites[0].cases[0].diagnostic.location.start.column = 2;

  const errors = await validationErrors(value);
  expect(errors).toContain(
    "suite reader case 0 human text must render from its structured diagnostic",
  );
  expect(errors).toContain(
    "identity must be the SHA-256 digest of the complete ordered suite payload",
  );
});
