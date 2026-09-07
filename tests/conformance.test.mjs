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
      total: 136,
      statuses: { draft: 1, accepted: 104, stable: 30, superseded: 1 },
      implementations: {
        "in-progress": 3,
        implemented: 132,
        superseded: 1,
      },
      coveredImplemented: 132,
    },
    features: {
      total: 132,
      evidence: 450,
      domains: {
        acceleration: { features: 1, evidence: 1 },
        bootstrap: { features: 13, evidence: 30 },
        compiler: { features: 15, evidence: 41 },
        editor: { features: 4, evidence: 22 },
        language: { features: 21, evidence: 77 },
        macro: { features: 3, evidence: 9 },
        portable: { features: 3, evidence: 5 },
        platform: { features: 1, evidence: 7 },
        project: { features: 5, evidence: 7 },
        publishing: { features: 1, evidence: 2 },
        quality: { features: 15, evidence: 38 },
        runtime: { features: 15, evidence: 93 },
        stdlib: { features: 21, evidence: 65 },
        toolchain: { features: 5, evidence: 20 },
        tooling: { features: 1, evidence: 2 },
        worker: { features: 8, evidence: 31 },
      },
    },
    baseline: {
      stableSpecifications: 30,
      provisionalSpecifications: 102,
      planningSpecifications: 3,
      supersededSpecifications: 1,
      stableFeatures: 30,
      provisionalFeatures: 102,
    },
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

test("contract checker rejects incomplete stable baselines", async () => {
  const baseline = await readJson("contracts/compatibility-baseline.json");
  baseline.specifications.stable.shift();

  const errors = await validationErrors({ baseline });
  expect(errors).toContain("stable specification baseline is missing: 0004");
});

test("contract checker rejects partially promoted stable contracts", async () => {
  const manifest = await readJson("tests/conformance/manifest.json");
  manifest.features.find((feature) => feature.spec === "0004").status = "accepted";

  const errors = await validationErrors({ manifest });
  expect(errors).toContain(
    "compiler.lexical-analysis must be stable because spec 0004 is stable",
  );
});
