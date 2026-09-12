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
    stableSpecifications: 173,
    stableFeatures: 173,
    provisionalFeatures: 0,
    excludedApplicationFeatures: 2,
    migrations: 3,
    fixtures: 101,
    evidenceLocators: 679,
    evidenceFiles: 134,
    sourceFiles: 410,
    readyForAc02: true,
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

test("stable compatibility corpus rejects false AC-02 readiness and fixture drift", async () => {
  const value = await contract();
  value.readyForAc02 = false;
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
