import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkGeneratedMarkerCoverage,
  checkRepositoryIntegrity,
  RepositoryIntegrityError,
  repositoryTrackedFiles,
  validateBenchmarkInventory,
  validateBenchmarkSource,
  validateImportRecords,
} from "../tools/integrity/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("repository dependencies and generated artifacts satisfy declared boundaries", async () => {
  const report = await checkRepositoryIntegrity({ root: ROOT });
  // The count comes from the contract, so declaring a dependency updates the
  // contract rather than this expectation.
  const contract = await readJson("contracts/repository-integrity.json");

  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-repository-integrity-report",
    version: 1,
    dependency: {
      packages: contract.packages.length,
      localPackages: 2,
      lockfile: "frozen",
      coreExternalImports: 0,
    },
    artifacts: {
      deterministicArtifacts: 4,
      deterministicOutputs: 7,
      derivedArtifacts: 3,
      benchmarkArtifacts: 14,
      benchmarkSources: 289,
    },
  });
  expect(report.dependency.scannedJavaScript).toBeGreaterThan(0);
  expect(report.dependency.scannedEliscript).toBeGreaterThan(0);
  expect(report.dependency.totalImports).toBeGreaterThan(0);
}, 15_000);

test("repository integrity rejects undeclared and boundary-crossing imports", async () => {
  const contract = await readJson("contracts/repository-integrity.json");

  expect(() => validateImportRecords([
    {
      file: "runtime/core/value.mjs",
      specifier: "react",
      kind: "import-statement",
      language: "javascript",
    },
    {
      file: "tools/example.mjs",
      specifier: "unlisted-package",
      kind: "import-statement",
      language: "javascript",
    },
  ], contract)).toThrow(RepositoryIntegrityError);
  expect(() => validateImportRecords([
    {
      file: "runtime/core/value.mjs",
      specifier: "react",
      kind: "import-statement",
      language: "javascript",
    },
  ], contract)).toThrow("outside its allowed boundary");
  expect(() => validateImportRecords([
    {
      file: "tools/example.mjs",
      specifier: "unlisted-package",
      kind: "import-statement",
      language: "javascript",
    },
  ], contract)).toThrow("imports undeclared package");
});

test("repository integrity isolates declared dependencies at the nearest package boundary", async () => {
  const contract = await readJson("contracts/repository-integrity.json");
  const scopes = [{
    directory: "tests/fixtures/packages/interop-consumer",
    manifest: "tests/fixtures/packages/interop-consumer/package.json",
    name: "@eliscript-fixtures/interop-consumer",
    packages: [
      "@eliscript-fixtures/interop-consumer",
      "@eliscript-fixtures/native-container-consumer",
      "eliscript",
    ],
  }];
  const declared = {
    file: "tests/fixtures/packages/interop-consumer/index.mjs",
    specifier: "@eliscript-fixtures/native-container-consumer",
    kind: "import-statement",
    language: "javascript",
  };

  expect(validateImportRecords([declared], contract, scopes)).toMatchObject({
    externalImports: 1,
  });
  expect(() => validateImportRecords([
    { ...declared, specifier: "undeclared-package" },
  ], contract, scopes)).toThrow(
    "in tests/fixtures/packages/interop-consumer/package.json",
  );
  expect(() => validateImportRecords([
    { ...declared, file: "tests/outside-package.mjs" },
  ], contract, scopes)).toThrow("imports undeclared package");
});

test("repository integrity rejects stale benchmark source evidence", async () => {
  const trackedFiles = await repositoryTrackedFiles(ROOT);
  const filename = "benchmarks/compiler-runtime-scan-macos-arm64.json";
  const report = await readJson(filename);
  report.sourceDigest.value = "0".repeat(64);

  await expect(validateBenchmarkSource(
    ROOT,
    trackedFiles,
    filename,
    report,
  )).rejects.toThrow("sourceDigest is stale");
});

test("repository integrity rejects incomplete artifact registries", async () => {
  const trackedFiles = await repositoryTrackedFiles(ROOT);
  const contract = await readJson("contracts/repository-integrity.json");
  const missingGenerated = structuredClone(contract);
  missingGenerated.artifacts.deterministic.shift();
  const missingBenchmark = structuredClone(contract);
  missingBenchmark.artifacts.benchmarkReports.shift();

  await expect(checkGeneratedMarkerCoverage(
    ROOT,
    trackedFiles,
    missingGenerated,
  )).rejects.toThrow("markers differ from the artifact registry");
  expect(() => validateBenchmarkInventory(
    trackedFiles,
    missingBenchmark,
  )).toThrow("benchmark reports differ from the artifact registry");
});
