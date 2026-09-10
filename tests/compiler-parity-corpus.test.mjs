import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCompilerParityCorpus,
  CompilerParityCorpusError,
  validateCompilerParityCorpus,
} from "../tools/parity/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function contract() {
  return JSON.parse(
    await readFile(path.join(ROOT, "contracts/compiler-parity-corpus.json"), "utf8"),
  );
}

async function validationErrors(value) {
  try {
    await validateCompilerParityCorpus(value, { root: ROOT });
  } catch (error) {
    expect(error).toBeInstanceOf(CompilerParityCorpusError);
    return error.errors;
  }
  throw new Error("expected compiler parity corpus validation to fail");
}

test("complete compiler parity corpus closes every local parity dimension", async () => {
  expect(await checkCompilerParityCorpus({ root: ROOT })).toEqual({
    schemaVersion: 1,
    stableFeatures: 67,
    fixtures: 4,
    validCases: 122,
    diagnosticCases: 96,
    bootstrapSources: 13,
    irKinds: 58,
    dimensions: 7,
    evidence: 11,
    sourceFiles: 140,
    identity: expect.stringMatching(/^[0-9a-f]{64}$/u),
  });
});

test("compiler parity corpus rejects omitted features and dimensions", async () => {
  const value = await contract();
  value.featureIds.pop();
  value.dimensions.pop();

  const errors = await validationErrors(value);
  expect(errors).toContain(
    "featureIds must match every stable compiler-relevant conformance feature",
  );
  expect(errors).toContain(
    "dimensions must contain the exact seven compiler parity boundaries",
  );
  expect(errors).toContain(
    "dimension project-graphs must contain executable evidence",
  );
});

test("compiler parity corpus rejects fixture source and evidence drift", async () => {
  const value = await contract();
  value.fixtures[0].valid += 1;
  value.dimensions[0].evidence[0].contains = "missing parity test";

  const errors = await validationErrors(value);
  expect(errors).toContain("fixture reader counts must match its source file");
  expect(errors).toContain(
    "dimension acceptance evidence 0 locator is absent from " +
    "tests/bootstrap-reader.test.mjs",
  );
  expect(errors).toContain(
    "identity must bind the complete parity inventory and source files",
  );
});
