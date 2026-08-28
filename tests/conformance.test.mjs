import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkContracts,
  ContractValidationError,
} from "../tools/conformance/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function validationErrors(options) {
  try {
    await checkContracts({ root: ROOT, ...options });
  } catch (error) {
    expect(error).toBeInstanceOf(ContractValidationError);
    return error.errors;
  }
  throw new Error("expected contract validation to fail");
}

test("repository specifications have complete conformance evidence", async () => {
  const report = await checkContracts({ root: ROOT });

  expect(report).toEqual({
    schemaVersion: 1,
    specifications: {
      total: 42,
      statuses: { draft: 1, accepted: 41 },
      implementations: {
        "in-progress": 2,
        implemented: 39,
        pending: 1,
      },
      coveredImplemented: 39,
    },
    features: { total: 39, evidence: 67 },
  });
});

test("contract checker rejects specification metadata drift", async () => {
  const specIndex = await readJson("specs/index.json");
  specIndex.specifications[0].title = "Outdated title";

  const errors = await validationErrors({ specIndex });
  expect(errors).toContain(
    'specs/0001-language-and-toolchain.md title is "Language and Toolchain Boundary", index declares "Outdated title"',
  );
});

test("contract checker rejects missing evidence locators", async () => {
  const manifest = await readJson("tests/conformance/manifest.json");
  manifest.features[0].evidence[0].contains = "missing-test-name";

  const errors = await validationErrors({ manifest });
  expect(errors[0]).toContain('locator "missing-test-name" is absent');
});

test("contract checker rejects evidence outside the default test suite", async () => {
  const manifest = await readJson("tests/conformance/manifest.json");
  manifest.features[0].evidence[0] = {
    kind: "bun-test",
    file: "README.md",
    contains: "# Eliscript",
  };

  const errors = await validationErrors({ manifest });
  expect(errors).toContain(
    "acceleration.measurement-probe evidence 0 file README.md is not executed by the default test target",
  );
});

test("contract checker rejects uncovered implemented specifications", async () => {
  const manifest = await readJson("tests/conformance/manifest.json");
  manifest.features = manifest.features.filter(
    (feature) => feature.spec !== "0039",
  );

  const errors = await validationErrors({ manifest });
  expect(errors).toContain("implemented spec 0039 has no conformance feature");
});
