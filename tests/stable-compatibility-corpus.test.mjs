import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkStableCompatibilityCorpus,
  StableCompatibilityCorpusError,
  validateStableCompatibilityCorpus,
} from "../tools/compatibility/corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function contract() {
  return JSON.parse(await readFile(
    path.join(ROOT, "contracts/stable-compatibility-corpus.json"),
    "utf8",
  ));
}

async function validationErrors(value) {
  try {
    await validateStableCompatibilityCorpus(value, { root: ROOT });
  } catch (error) {
    expect(error).toBeInstanceOf(StableCompatibilityCorpusError);
    return error.errors;
  }
  throw new Error("expected stable compatibility corpus validation to fail");
}

test("stable compatibility corpus covers every frozen core behavior", async () => {
  expect(await checkStableCompatibilityCorpus({ root: ROOT })).toEqual({
    schemaVersion: 1,
    stableSpecifications: 141,
    stableFeatures: 141,
    provisionalFeatures: 1,
    excludedApplicationFeatures: 2,
    migrations: 3,
    fixtures: 68,
    evidenceLocators: 542,
    evidenceFiles: 109,
    sourceFiles: 324,
    readyForAc02: false,
    identity: expect.stringMatching(/^[0-9a-f]{64}$/u),
  });
});

test("stable compatibility corpus rejects omitted behavior and migrations", async () => {
  const value = await contract();
  value.stableCoreFeatureIds.pop();
  value.migrationIds.pop();

  const errors = await validationErrors(value);
  expect(errors).toContain(
    "stableCoreFeatureIds must match the complete derived stable core inventory",
  );
  expect(errors).toContain(
    "migrationIds must match the complete derived stable core inventory",
  );
});

test("stable compatibility corpus rejects premature AC-02 and fixture drift", async () => {
  const value = await contract();
  value.readyForAc02 = true;
  value.fixtureFiles.pop();
  value.identity = "0".repeat(64);

  const errors = await validationErrors(value);
  expect(errors).toContain(
    "readyForAc02 must match the complete derived stable core inventory",
  );
  expect(errors).toContain(
    "fixtureFiles must match the complete derived stable core inventory",
  );
  expect(errors).toContain(
    "identity must bind the complete stable compatibility corpus",
  );
});
