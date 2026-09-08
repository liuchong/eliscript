#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { checkContracts } from "../conformance/check.mjs";
import { checkCompatibilityRehearsal } from "./rehearse.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
export const CONTRACT_FILE = "contracts/stable-compatibility-corpus.json";

const EXECUTION = Object.freeze({
  provider: "local",
  command: "make test-core",
  applicationEvidence: false,
});
const DEFERRED_FIXTURES = Object.freeze([
  Object.freeze({
    featureId: "quality.javascript-package-interop",
    prefix: "tests/fixtures/packages/interop-consumer/",
  }),
]);
const IDENTITY_SOURCES = Object.freeze([
  "Makefile",
  "contracts/compatibility-baseline.json",
  "contracts/compatibility-rehearsal.json",
  "contracts/maturity-progress.json",
  "specs/0147-complete-stable-compatibility-corpus.md",
  "specs/index.json",
  "tests/conformance/manifest.json",
  "tests/stable-compatibility-corpus.test.mjs",
  "tools/compatibility/corpus.mjs",
]);

export class StableCompatibilityCorpusError extends Error {
  constructor(errors) {
    super(`stable compatibility corpus validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "StableCompatibilityCorpusError";
    this.errors = errors;
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function safeSourcePath(root, relative) {
  const absolute = path.resolve(root, relative);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(prefix)) {
    throw new Error(`source escapes repository root: ${relative}`);
  }
  return absolute;
}

async function trackedFixtureFiles(root) {
  const child = Bun.spawn(
    ["git", "ls-files", "-z", "--", "tests/fixtures"],
    { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "git ls-files tests/fixtures failed");
  }
  return stdout.split("\0").filter(Boolean).sort();
}

async function sourceDigests(root, files, errors) {
  const result = [];
  for (const relative of files) {
    try {
      result.push({
        file: relative,
        sha256: sha256(await readFile(safeSourcePath(root, relative))),
      });
    } catch (error) {
      errors.push(`identity source ${relative} could not be read: ${error.message}`);
    }
  }
  return result;
}

async function deriveCorpus(root) {
  const errors = [];
  try {
    await checkContracts({ root });
  } catch (error) {
    errors.push(`conformance contracts must pass: ${error.message}`);
  }
  try {
    await checkCompatibilityRehearsal({ root });
  } catch (error) {
    errors.push(`compatibility rehearsal contract must pass: ${error.message}`);
  }

  const baseline = await readJson(root, "contracts/compatibility-baseline.json");
  const rehearsal = await readJson(root, "contracts/compatibility-rehearsal.json");
  const maturity = await readJson(root, "contracts/maturity-progress.json");
  const manifest = await readJson(root, "tests/conformance/manifest.json");
  const specificationIndex = await readJson(root, "specs/index.json");

  const excludedApplicationFeatureIds = [
    ...(maturity.stabilization?.excludedFeatureIds ?? []),
  ];
  const excluded = new Set(excludedApplicationFeatureIds);
  const stableCoreFeatureIds = (baseline.features?.stable ?? [])
    .filter((featureId) => !excluded.has(featureId));
  const provisionalCoreFeatureIds = (baseline.features?.provisional ?? [])
    .filter((featureId) => !excluded.has(featureId));
  const features = new Map(
    (manifest.features ?? []).map((feature) => [feature.id, feature]),
  );
  const specifications = new Map(
    (specificationIndex.specifications ?? []).map((specification) => [
      specification.id,
      specification.file,
    ]),
  );

  const stableCoreSpecificationIds = [];
  const evidence = [];
  for (const featureId of stableCoreFeatureIds) {
    const feature = features.get(featureId);
    if (!feature || feature.status !== "stable") {
      errors.push(`stable core feature ${featureId} must be stable in conformance data`);
      continue;
    }
    stableCoreSpecificationIds.push(feature.spec);
    for (const locator of feature.evidence ?? []) {
      evidence.push({ featureId, ...locator });
    }
  }
  stableCoreSpecificationIds.sort();
  if (new Set(stableCoreSpecificationIds).size !== stableCoreSpecificationIds.length) {
    errors.push("stable core features must have one distinct specification owner each");
  }
  for (const specificationId of stableCoreSpecificationIds) {
    if (!(baseline.specifications?.stable ?? []).includes(specificationId)) {
      errors.push(`core specification ${specificationId} must be stable in the baseline`);
    }
  }

  for (const deferred of DEFERRED_FIXTURES) {
    if (!provisionalCoreFeatureIds.includes(deferred.featureId)) {
      errors.push(`deferred fixture feature ${deferred.featureId} must remain provisional`);
    }
  }
  const trackedFixtures = await trackedFixtureFiles(root);
  const fixtureFiles = trackedFixtures.filter((file) =>
    !DEFERRED_FIXTURES.some((deferred) => file.startsWith(deferred.prefix)));
  for (const deferred of DEFERRED_FIXTURES) {
    if (!trackedFixtures.some((file) => file.startsWith(deferred.prefix))) {
      errors.push(`deferred fixture prefix ${deferred.prefix} must contain tracked files`);
    }
  }

  const migrationIds = (rehearsal.migrations ?? []).map((migration) => migration.id);
  const migratedSpecifications = new Set(
    (rehearsal.migrations ?? []).map((migration) => migration.fromSpec),
  );
  for (const specificationId of baseline.specifications?.superseded ?? []) {
    if (!migratedSpecifications.has(specificationId)) {
      errors.push(`superseded specification ${specificationId} needs migration evidence`);
    }
  }

  const evidenceFiles = [...new Set(evidence.map((locator) => locator.file))].sort();
  const sourceFiles = new Set([
    ...IDENTITY_SOURCES,
    ...(rehearsal.sourceFiles ?? []),
    ...fixtureFiles,
    ...evidenceFiles,
  ]);
  for (const specificationId of stableCoreSpecificationIds) {
    const filename = specifications.get(specificationId);
    if (typeof filename !== "string") {
      errors.push(`stable core specification ${specificationId} has no indexed file`);
    } else {
      sourceFiles.add(filename);
    }
  }
  const orderedSourceFiles = [...sourceFiles].sort();
  const sources = await sourceDigests(root, orderedSourceFiles, errors);
  const readyForAc02 = provisionalCoreFeatureIds.length === 0;
  const derived = {
    baselineVersion: baseline.version,
    stableCoreSpecificationIds,
    stableCoreFeatureIds,
    provisionalCoreFeatureIds,
    excludedApplicationFeatureIds,
    migrationIds,
    fixtureFiles,
    evidenceLocatorCount: evidence.length,
    evidenceFileCount: evidenceFiles.length,
    readyForAc02,
  };
  const identity = sha256(JSON.stringify({
    ...derived,
    execution: EXECUTION,
    deferredFixtures: DEFERRED_FIXTURES,
    evidence,
    sources,
  }));
  return { errors, derived, identity, sourceFiles: orderedSourceFiles.length };
}

async function inspectStableCompatibilityCorpus(contract, root) {
  const state = await deriveCorpus(root);
  const errors = [...state.errors];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-stable-compatibility-corpus" ||
      contract.version !== 1) {
    errors.push("contract must use eliscript-stable-compatibility-corpus version 1");
  }
  if (!equal(contract.execution, EXECUTION)) {
    errors.push("execution must remain direct local make test-core without application evidence");
  }
  if (!equal(contract.deferredFixtures, DEFERRED_FIXTURES)) {
    errors.push("deferredFixtures must match the exact provisional fixture boundary");
  }
  for (const [field, expected] of Object.entries(state.derived)) {
    if (!equal(contract[field], expected)) {
      errors.push(`${field} must match the complete derived stable core inventory`);
    }
  }
  if (!/^[0-9a-f]{64}$/u.test(contract.identity ?? "") ||
      contract.identity !== state.identity) {
    errors.push("identity must bind the complete stable compatibility corpus");
  }
  return {
    errors,
    identity: state.identity,
    report: {
      schemaVersion: 1,
      stableSpecifications: state.derived.stableCoreSpecificationIds.length,
      stableFeatures: state.derived.stableCoreFeatureIds.length,
      provisionalFeatures: state.derived.provisionalCoreFeatureIds.length,
      excludedApplicationFeatures:
        state.derived.excludedApplicationFeatureIds.length,
      migrations: state.derived.migrationIds.length,
      fixtures: state.derived.fixtureFiles.length,
      evidenceLocators: state.derived.evidenceLocatorCount,
      evidenceFiles: state.derived.evidenceFileCount,
      sourceFiles: state.sourceFiles,
      readyForAc02: state.derived.readyForAc02,
      identity: state.identity,
    },
  };
}

export async function validateStableCompatibilityCorpus(contract, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const inspected = await inspectStableCompatibilityCorpus(contract, root);
  if (inspected.errors.length > 0) {
    throw new StableCompatibilityCorpusError(inspected.errors);
  }
  return inspected.report;
}

export async function checkStableCompatibilityCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(root, CONTRACT_FILE);
  return validateStableCompatibilityCorpus(contract, { root });
}

export async function generateStableCompatibilityCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const state = await deriveCorpus(root);
  if (state.errors.length > 0) throw new StableCompatibilityCorpusError(state.errors);
  const contract = {
    schemaVersion: 1,
    format: "eliscript-stable-compatibility-corpus",
    version: 1,
    execution: EXECUTION,
    deferredFixtures: DEFERRED_FIXTURES,
    ...state.derived,
    identity: state.identity,
  };
  await writeFile(
    path.join(root, CONTRACT_FILE),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  return validateStableCompatibilityCorpus(contract, { root });
}

function printReport(report) {
  process.stdout.write(
    `Stable compatibility corpus: ${report.stableFeatures} features / ` +
    `${report.stableSpecifications} specifications\n` +
    `Evidence: ${report.evidenceLocators} locators in ` +
    `${report.evidenceFiles} files; ${report.fixtures} fixtures\n` +
    `Migrations: ${report.migrations}; provisional: ` +
    `${report.provisionalFeatures}; applications excluded: ` +
    `${report.excludedApplicationFeatures}\n` +
    `AC-02 ready: ${report.readyForAc02 ? "yes" : "no"}; ` +
    `${report.sourceFiles} bound files; identity ${report.identity}\n`,
  );
}

if (import.meta.main) {
  const generate = process.argv.slice(2).includes("--generate");
  try {
    printReport(generate ?
      await generateStableCompatibilityCorpus() :
      await checkStableCompatibilityCorpus());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
