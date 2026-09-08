#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
export const CONTRACT_FILE = "contracts/compiler-parity-corpus.json";

const FEATURE_DOMAINS = Object.freeze([
  "bootstrap",
  "compiler",
  "language",
  "macro",
  "portable",
  "project",
]);
const DIMENSION_IDS = Object.freeze([
  "acceptance",
  "diagnostics",
  "canonical-ir",
  "emitted-esm",
  "source-maps",
  "portable-closures",
  "project-graphs",
]);
const FIXTURES = Object.freeze([
  { id: "reader", file: "tests/fixtures/bootstrap-reader.json" },
  { id: "expander", file: "tests/fixtures/bootstrap-expander.json" },
  { id: "analyzer", file: "tests/fixtures/bootstrap-analyzer.json" },
  { id: "ir", file: "tests/fixtures/bootstrap-ir.json" },
]);
const IDENTITY_SOURCES = Object.freeze([
  "Makefile",
  "contracts/core-acceptance-corpus.json",
  "contracts/maturity-progress.json",
  "contracts/public-surface.json",
  "specs/0146-complete-compiler-parity-corpus.md",
  "specs/index.json",
  "tests/conformance/manifest.json",
  "tests/compiler-parity-corpus.test.mjs",
  "tools/parity/check.mjs",
]);

export class CompilerParityCorpusError extends Error {
  constructor(errors) {
    super(`compiler parity corpus validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "CompilerParityCorpusError";
    this.errors = errors;
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function stableFeatureIds(manifest) {
  return manifest.features
    .filter((feature) => feature.status === "stable" &&
      FEATURE_DOMAINS.includes(feature.id.split(".", 1)[0]))
    .map((feature) => feature.id);
}

async function bootstrapSources(root) {
  const entries = await readdir(path.join(root, "bootstrap/compiler"), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".eli"))
    .map((entry) => `bootstrap/compiler/${entry.name}`)
    .sort();
}

function safeSourcePath(root, relative) {
  const absolute = path.resolve(root, relative);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(prefix)) {
    throw new Error(`source escapes repository root: ${relative}`);
  }
  return absolute;
}

function identitySourceFiles(contract, manifest, specificationIndex, featureIds) {
  const files = new Set(IDENTITY_SOURCES);
  for (const fixture of Array.isArray(contract.fixtures) ? contract.fixtures : []) {
    if (typeof fixture?.file === "string") files.add(fixture.file);
  }
  for (const source of Array.isArray(contract.bootstrapSources) ?
    contract.bootstrapSources : []) {
    if (typeof source === "string") files.add(source);
  }
  for (const dimension of Array.isArray(contract.dimensions) ?
    contract.dimensions : []) {
    for (const evidence of Array.isArray(dimension?.evidence) ?
      dimension.evidence : []) {
      if (typeof evidence?.file === "string") files.add(evidence.file);
    }
  }
  const specifications = new Map(
    (specificationIndex.specifications ?? []).map((specification) => [
      specification.id,
      specification.file,
    ]),
  );
  for (const feature of manifest.features ?? []) {
    if (!featureIds.includes(feature.id)) continue;
    const specificationFile = specifications.get(feature.spec);
    if (typeof specificationFile === "string") files.add(specificationFile);
    for (const evidence of feature.evidence ?? []) {
      if (typeof evidence?.file === "string") files.add(evidence.file);
    }
  }
  return [...files].sort();
}

async function sourceDigests(root, files, errors) {
  const result = [];
  for (const relative of files) {
    try {
      const bytes = await readFile(safeSourcePath(root, relative));
      result.push({
        file: relative,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } catch (error) {
      errors.push(`identity source ${relative} could not be read: ${error.message}`);
    }
  }
  return result;
}

function corpusIdentity(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function inspectCompilerParityCorpus(contract, root) {
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-compiler-parity-corpus" ||
      contract.version !== 1) {
    throw new CompilerParityCorpusError([
      "contract must use eliscript-compiler-parity-corpus version 1",
    ]);
  }

  const manifest = await readJson(root, "tests/conformance/manifest.json");
  const surface = await readJson(root, "contracts/public-surface.json");
  const specificationIndex = await readJson(root, "specs/index.json");
  const makefile = await readFile(path.join(root, "Makefile"), "utf8");
  const actualFeatures = stableFeatureIds(manifest);
  const actualBootstrapSources = await bootstrapSources(root);

  if (!equal(contract.featureDomains, FEATURE_DOMAINS)) {
    errors.push("featureDomains must contain the exact compiler-relevant domain order");
  }
  if (!equal(contract.featureIds, actualFeatures)) {
    errors.push("featureIds must match every stable compiler-relevant conformance feature");
  }
  if (!equal(contract.bootstrapSources, actualBootstrapSources)) {
    errors.push("bootstrapSources must match every maintained Eliscript compiler module");
  }

  const fixtureState = [];
  if (!Array.isArray(contract.fixtures) || contract.fixtures.length !== FIXTURES.length) {
    errors.push("fixtures must contain the exact reader expander analyzer and IR inventory");
  }
  for (const [index, expected] of FIXTURES.entries()) {
    const declared = contract.fixtures?.[index];
    if (!isPlainObject(declared) || declared.id !== expected.id ||
        declared.file !== expected.file) {
      errors.push(`fixture ${expected.id} metadata must match the maintained inventory`);
      continue;
    }
    try {
      const fixture = await readJson(root, expected.file);
      const valid = Array.isArray(fixture.valid) ? fixture.valid.length : -1;
      const invalid = Array.isArray(fixture.invalid) ? fixture.invalid.length : 0;
      fixtureState.push({ id: expected.id, file: expected.file, valid, invalid });
      if (declared.valid !== valid || declared.invalid !== invalid) {
        errors.push(`fixture ${expected.id} counts must match its source file`);
      }
    } catch (error) {
      errors.push(`fixture ${expected.id} could not be read: ${error.message}`);
    }
  }

  const irKinds = surface.ir?.nodeKinds;
  if (!Array.isArray(irKinds) || contract.irKindCount !== irKinds.length) {
    errors.push("irKindCount must match the complete public IR inventory");
  }
  const diagnosticCaseCount = fixtureState
    .filter(({ id }) => id !== "ir")
    .reduce((total, fixture) => total + fixture.invalid, 0);
  if (contract.diagnosticCaseCount !== diagnosticCaseCount) {
    errors.push("diagnosticCaseCount must match all shared negative fixtures");
  }

  const dimensions = Array.isArray(contract.dimensions) ? contract.dimensions : [];
  if (!equal(dimensions.map((dimension) => dimension?.id), DIMENSION_IDS)) {
    errors.push("dimensions must contain the exact seven compiler parity boundaries");
  }
  const evidenceLocators = new Set();
  for (const dimensionId of DIMENSION_IDS) {
    const dimension = dimensions.find((candidate) => candidate?.id === dimensionId);
    if (!dimension || !Array.isArray(dimension.evidence) ||
        dimension.evidence.length === 0) {
      errors.push(`dimension ${dimensionId} must contain executable evidence`);
      continue;
    }
    for (const [index, evidence] of dimension.evidence.entries()) {
      const label = `dimension ${dimensionId} evidence ${index}`;
      if (!isPlainObject(evidence) || typeof evidence.file !== "string" ||
          typeof evidence.contains !== "string" || evidence.contains.length === 0) {
        errors.push(`${label} must contain file and contains strings`);
        continue;
      }
      if (!evidence.file.startsWith("tests/") ||
          !evidence.file.endsWith(".test.mjs")) {
        errors.push(`${label} must point to a Bun core test file`);
      }
      try {
        const source = await readFile(safeSourcePath(root, evidence.file), "utf8");
        if (!source.includes(evidence.contains)) {
          errors.push(`${label} locator is absent from ${evidence.file}`);
        }
      } catch (error) {
        errors.push(`${label} could not be read: ${error.message}`);
      }
      if (!makefile.includes(evidence.file)) {
        errors.push(`${label} file is not executed by test-core`);
      }
      evidenceLocators.add(`${evidence.file}\0${evidence.contains}`);
    }
  }

  const files = identitySourceFiles(
    contract,
    manifest,
    specificationIndex,
    actualFeatures,
  );
  const digests = await sourceDigests(root, files, errors);
  const identityPayload = {
    featureDomains: FEATURE_DOMAINS,
    featureIds: actualFeatures,
    fixtures: fixtureState,
    bootstrapSources: actualBootstrapSources,
    irKinds: Array.isArray(irKinds) ? irKinds : [],
    diagnosticCaseCount,
    dimensions,
    sources: digests,
  };
  const expectedIdentity = corpusIdentity(identityPayload);
  if (!/^[0-9a-f]{64}$/u.test(contract.identity ?? "") ||
      contract.identity !== expectedIdentity) {
    errors.push("identity must bind the complete parity inventory and source files");
  }

  return {
    errors,
    expectedIdentity,
    report: {
      schemaVersion: 1,
      stableFeatures: actualFeatures.length,
      fixtures: fixtureState.length,
      validCases: fixtureState.reduce((total, fixture) => total + fixture.valid, 0),
      diagnosticCases: diagnosticCaseCount,
      bootstrapSources: actualBootstrapSources.length,
      irKinds: Array.isArray(irKinds) ? irKinds.length : 0,
      dimensions: dimensions.length,
      evidence: evidenceLocators.size,
      sourceFiles: files.length,
      identity: expectedIdentity,
    },
  };
}

export async function validateCompilerParityCorpus(contract, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const inspected = await inspectCompilerParityCorpus(contract, root);
  if (inspected.errors.length > 0) {
    throw new CompilerParityCorpusError(inspected.errors);
  }
  return inspected.report;
}

export async function checkCompilerParityCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(root, CONTRACT_FILE);
  return validateCompilerParityCorpus(contract, { root });
}

export async function generateCompilerParityIdentity(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const filename = path.join(root, CONTRACT_FILE);
  const contract = await readJson(root, CONTRACT_FILE);
  const inspected = await inspectCompilerParityCorpus(
    { ...contract, identity: "0".repeat(64) },
    root,
  );
  const structuralErrors = inspected.errors.filter((error) =>
    !error.startsWith("identity must bind"));
  if (structuralErrors.length > 0) {
    throw new CompilerParityCorpusError(structuralErrors);
  }
  contract.identity = inspected.expectedIdentity;
  await writeFile(filename, `${JSON.stringify(contract, null, 2)}\n`);
  return validateCompilerParityCorpus(contract, { root });
}

function printReport(report) {
  process.stdout.write(
    `Compiler parity corpus: ${report.dimensions}/7 dimensions, ` +
    `${report.stableFeatures} stable features\n` +
    `Shared inputs: ${report.validCases} valid cases, ` +
    `${report.diagnosticCases} diagnostics, ${report.bootstrapSources} modules, ` +
    `${report.irKinds} IR kinds\n` +
    `Evidence: ${report.evidence} locators, ${report.sourceFiles} bound files; ` +
    `identity ${report.identity}\n`,
  );
}

if (import.meta.main) {
  const generate = process.argv.slice(2).includes("--generate");
  try {
    printReport(generate ?
      await generateCompilerParityIdentity() :
      await checkCompilerParityCorpus());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
