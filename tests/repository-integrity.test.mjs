import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { seedCompilerFixture } from "./helpers/seed-compiler.mjs";

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
let compiler, compilerDirectory;
// All cases inspect the same source snapshot. Build its compiler once per file;
// each integrity invocation still scans dependencies and regenerates artifacts.
beforeAll(async () => {
  compilerDirectory = await mkdtemp(path.join(tmpdir(), "eliscript-integrity-tests-"));
  await seedCompilerFixture(compilerDirectory);
  compiler = await import(pathToFileURL(path.join(compilerDirectory, "compiler.mjs")).href);
}, 15_000);
afterAll(async () => {
  if (compilerDirectory) await rm(compilerDirectory, { recursive: true, force: true });
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("repository dependencies and generated artifacts satisfy declared boundaries", async () => {
  const deferred = process.env.ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE === "1";
  const report = await checkRepositoryIntegrity({ root: ROOT, compiler, deferPerformanceAcceptance: deferred });
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
      derivedArtifacts: 4,
      benchmarkArtifacts: 14,
      benchmarkSources: deferred ? 0 : 291,
    },
  });
  expect(report.dependency.scannedJavaScript).toBeGreaterThan(0);
  expect(report.dependency.scannedEliscript).toBeGreaterThan(0);
  expect(report.dependency.totalImports).toBeGreaterThan(0);
  if (deferred) expect(report.artifacts.deferredBenchmarkSources).toEqual(contract.artifacts.benchmarkReports);
}, 15_000);

test("performance deferral is explicit and does not suppress dependency or artifact checks", async () => {
  const contract = await readJson("contracts/repository-integrity.json");
  const trackedFiles = await repositoryTrackedFiles(ROOT);
  const broken = structuredClone(contract);
  broken.artifacts.benchmarkReports = [];
  await expect(checkRepositoryIntegrity({ root: ROOT, compiler, contract: broken,
    trackedFiles, deferPerformanceAcceptance: true })).rejects.toThrow("benchmark");
  const badWorkflow = structuredClone(contract);
  badWorkflow.artifacts.derived.find(entry => entry.id === "browser-compatibility-workflow").outputs = ["wrong.yml"];
  await expect(checkRepositoryIntegrity({ root: ROOT, compiler, contract: badWorkflow,
    trackedFiles, deferPerformanceAcceptance: true })).rejects.toThrow("browser workflow");
}, 15000);

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

test("native FFI builtin is confined to its explicit measurement and test adapters", async () => {
  const contract=await readJson("contracts/repository-integrity.json");
  const record={file:"tests/native-backend.test.mjs",specifier:"bun:ffi",kind:"import-statement",language:"javascript"};
  expect(()=>validateImportRecords([record],contract)).not.toThrow();
  expect(()=>validateImportRecords([{...record,file:"tests/native-memory-long-branches.test.mjs"}],contract)).not.toThrow();
  expect(()=>validateImportRecords([{...record,file:"tests/compiler-producer-rig.mjs"}],contract)).not.toThrow();
  expect(()=>validateImportRecords([{...record,file:"tools/backends/native-benchmark.mjs"}],contract)).not.toThrow();
  for(const file of ["bootstrap/backends/native.mjs","runtime/core/value.mjs","tools/unrelated.mjs","tests/unrelated.test.mjs"])
    expect(()=>validateImportRecords([{...record,file}],contract)).toThrow("outside its allowed boundary");
  expect(()=>validateImportRecords([{...record,specifier:"bun:unlisted"}],contract)).toThrow("imports undeclared package");
});
