import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");

const SPEC_STATUSES = new Set(["draft", "accepted", "stable", "superseded"]);
const IMPLEMENTATION_STATUSES = new Set([
  "pending",
  "in-progress",
  "implemented",
  "superseded",
]);
const FEATURE_STATUSES = new Set(["accepted", "stable"]);
const EVIDENCE_KINDS = new Set(["ert", "bun-test", "shell", "fixture"]);

export class ContractValidationError extends Error {
  constructor(errors) {
    super(`Contract validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "ContractValidationError";
    this.errors = errors;
  }
}

function normalizedStatus(value) {
  return value.trim().toLowerCase().replaceAll(" ", "-");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSortedStrings(values, label, errors) {
  if (!Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || value.length === 0)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return [];
  }
  const expected = [...new Set(values)].sort();
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    errors.push(`${label} must be unique and lexicographically sorted`);
  }
  return values;
}

function compareClassification(actual, expected, label, errors) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((value) => !actual.includes(value));
    const extra = actual.filter((value) => !expected.includes(value));
    if (missing.length > 0) {
      errors.push(`${label} is missing: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      errors.push(`${label} has unexpected entries: ${extra.join(", ")}`);
    }
  }
}

function isSafeRelativePath(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    !relativePath.split(/[\\/]/u).includes("..")
  );
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function makeTargetSource(makefile, name) {
  const lines = makefile.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (start === -1) return "";

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_.-]+:/u.test(line)) break;
    body.push(line);
  }
  return `${lines[start]}\n${body.join("\n")}`;
}

async function readSpecMetadata(filename) {
  const source = await readFile(filename, "utf8");
  const heading = source.match(/^# (\d{4}): (.+)$/mu);
  const status = source.match(/^- Status: (.+)$/mu);
  const implementation = source.match(/^- Implementation: (.+)$/mu);

  return {
    id: heading?.[1],
    title: heading?.[2],
    status: status ? normalizedStatus(status[1]) : undefined,
    implementation: implementation
      ? normalizedStatus(implementation[1])
      : undefined,
  };
}

function validateSpecEntryShape(entry, index, errors) {
  const label = `spec index entry ${index}`;
  if (!isPlainObject(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!/^\d{4}$/u.test(entry.id ?? "")) {
    errors.push(`${label} has invalid id ${JSON.stringify(entry.id)}`);
  }
  if (typeof entry.title !== "string" || entry.title.length === 0) {
    errors.push(`${label} must have a title`);
  }
  if (!isSafeRelativePath(entry.file)) {
    errors.push(`${label} has unsafe file ${JSON.stringify(entry.file)}`);
  }
  if (!SPEC_STATUSES.has(entry.status)) {
    errors.push(`${label} has invalid status ${JSON.stringify(entry.status)}`);
  }
  if (!IMPLEMENTATION_STATUSES.has(entry.implementation)) {
    errors.push(
      `${label} has invalid implementation ${JSON.stringify(entry.implementation)}`,
    );
  }
  if (entry.status === "stable" && entry.implementation !== "implemented") {
    errors.push(`${label} cannot be stable before it is implemented`);
  }
}

async function validateSpecIndex(root, specIndex, errors) {
  if (!isPlainObject(specIndex) || specIndex.schemaVersion !== 1) {
    errors.push("spec index must use schemaVersion 1");
    return new Map();
  }
  if (!Array.isArray(specIndex.specifications)) {
    errors.push("spec index specifications must be an array");
    return new Map();
  }

  const byId = new Map();
  const indexedFiles = new Set();
  let previousId = "";

  for (const [index, entry] of specIndex.specifications.entries()) {
    validateSpecEntryShape(entry, index, errors);
    if (!isPlainObject(entry)) continue;

    if (entry.id < previousId) {
      errors.push(`spec index is not sorted at ${entry.id}`);
    }
    previousId = entry.id;

    if (byId.has(entry.id)) errors.push(`duplicate spec id ${entry.id}`);
    if (indexedFiles.has(entry.file)) errors.push(`duplicate spec file ${entry.file}`);
    byId.set(entry.id, entry);
    indexedFiles.add(entry.file);

    if (!isSafeRelativePath(entry.file)) continue;
    const filename = path.resolve(root, entry.file);
    try {
      const metadata = await readSpecMetadata(filename);
      for (const field of ["id", "title", "status", "implementation"]) {
        if (metadata[field] !== entry[field]) {
          errors.push(
            `${entry.file} ${field} is ${JSON.stringify(metadata[field])}, ` +
              `index declares ${JSON.stringify(entry[field])}`,
          );
        }
      }
    } catch (error) {
      errors.push(`${entry.file} cannot be read: ${error.message}`);
    }
  }

  const specDirectory = path.join(root, "specs");
  const diskFiles = (await readdir(specDirectory))
    .filter((file) => /^\d{4}-.+\.md$/u.test(file))
    .map((file) => `specs/${file}`)
    .sort();
  for (const file of diskFiles) {
    if (!indexedFiles.has(file)) errors.push(`${file} is missing from specs/index.json`);
  }
  for (const file of indexedFiles) {
    if (!diskFiles.includes(file)) errors.push(`${file} is indexed but is not a spec file`);
  }

  return byId;
}

function validateFeatureShape(feature, index, errors) {
  const label = `feature entry ${index}`;
  if (!isPlainObject(feature)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u.test(feature.id ?? "")) {
    errors.push(`${label} has invalid id ${JSON.stringify(feature.id)}`);
  }
  if (typeof feature.title !== "string" || feature.title.length === 0) {
    errors.push(`${label} must have a title`);
  }
  if (!FEATURE_STATUSES.has(feature.status)) {
    errors.push(`${label} has invalid status ${JSON.stringify(feature.status)}`);
  }
  if (!/^\d{4}$/u.test(feature.spec ?? "")) {
    errors.push(`${label} has invalid spec ${JSON.stringify(feature.spec)}`);
  }
  if (
    !Array.isArray(feature.contracts) ||
    feature.contracts.length === 0 ||
    feature.contracts.some((contract) => typeof contract !== "string" || !contract)
  ) {
    errors.push(`${label} must declare at least one contract`);
  }
  if (!Array.isArray(feature.evidence) || feature.evidence.length === 0) {
    errors.push(`${label} must declare at least one evidence item`);
  }
}

async function validateManifest(
  root,
  manifest,
  specsById,
  applicationFeatureIds,
  errors,
) {
  if (!isPlainObject(manifest) || manifest.schemaVersion !== 1) {
    errors.push("conformance manifest must use schemaVersion 1");
    return { features: 0, evidence: 0, coveredSpecs: new Set() };
  }
  if (!Array.isArray(manifest.features)) {
    errors.push("conformance manifest features must be an array");
    return { features: 0, evidence: 0, coveredSpecs: new Set() };
  }

  const featureIds = new Set();
  const coveredSpecs = new Set();
  const sourceCache = new Map();
  const domains = new Map();
  const testDriver = await readFile(path.join(root, "Makefile"), "utf8");
  const coreTestDriver = makeTargetSource(testDriver, "test-core");
  const applicationTestDriver = makeTargetSource(testDriver, "test-applications");
  if (!coreTestDriver) errors.push("Makefile must define test-core");
  if (!applicationTestDriver) errors.push("Makefile must define test-applications");
  let evidenceCount = 0;
  let previousSpec = "";

  for (const [index, feature] of manifest.features.entries()) {
    validateFeatureShape(feature, index, errors);
    if (!isPlainObject(feature)) continue;

    if (featureIds.has(feature.id)) errors.push(`duplicate feature id ${feature.id}`);
    featureIds.add(feature.id);
    const domainName = feature.id.split(".")[0];
    if (!domains.has(domainName)) {
      domains.set(domainName, { features: 0, evidence: 0 });
    }
    domains.get(domainName).features += 1;
    if (feature.spec < previousSpec) {
      errors.push(`features are not sorted by spec at ${feature.id}`);
    }
    previousSpec = feature.spec;

    const spec = specsById.get(feature.spec);
    if (!spec) {
      errors.push(`${feature.id} references unknown spec ${feature.spec}`);
    } else {
      coveredSpecs.add(spec.id);
      if (!new Set(["accepted", "stable"]).has(spec.status)) {
        errors.push(`${feature.id} references non-accepted spec ${spec.id}`);
      }
      if (spec.implementation !== "implemented") {
        errors.push(`${feature.id} references non-implemented spec ${spec.id}`);
      }
      if (feature.status === "stable" && spec.status !== "stable") {
        errors.push(`${feature.id} cannot be stable while spec ${spec.id} is not stable`);
      }
      if (spec.status === "stable" && feature.status !== "stable") {
        errors.push(`${feature.id} must be stable because spec ${spec.id} is stable`);
      }
    }

    for (const [evidenceIndex, evidence] of (feature.evidence ?? []).entries()) {
      evidenceCount += 1;
      domains.get(domainName).evidence += 1;
      const label = `${feature.id} evidence ${evidenceIndex}`;
      if (!isPlainObject(evidence)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      if (!EVIDENCE_KINDS.has(evidence.kind)) {
        errors.push(`${label} has invalid kind ${JSON.stringify(evidence.kind)}`);
      }
      if (!isSafeRelativePath(evidence.file)) {
        errors.push(`${label} has unsafe file ${JSON.stringify(evidence.file)}`);
        continue;
      }
      if (typeof evidence.contains !== "string" || evidence.contains.length === 0) {
        errors.push(`${label} must declare a non-empty contains locator`);
        continue;
      }

      const filename = path.resolve(root, evidence.file);
      try {
        let source = sourceCache.get(filename);
        if (source === undefined) {
          source = await readFile(filename, "utf8");
          sourceCache.set(filename, source);
        }
        if (!source.includes(evidence.contains)) {
          errors.push(
            `${label} locator ${JSON.stringify(evidence.contains)} ` +
              `is absent from ${evidence.file}`,
          );
        }
        if (evidence.kind !== "fixture" && !testDriver.includes(evidence.file)) {
          errors.push(
            `${label} file ${evidence.file} is not executed by the default test target`,
          );
        }
        if (evidence.kind !== "fixture") {
          const applicationEvidence = applicationFeatureIds.has(feature.id);
          const partition = applicationEvidence
            ? applicationTestDriver
            : coreTestDriver;
          const target = applicationEvidence ? "test-applications" : "test-core";
          if (!partition.includes(evidence.file)) {
            errors.push(
              `${label} file ${evidence.file} is not executed by ${target}`,
            );
          }
        }
      } catch (error) {
        errors.push(`${label} cannot read ${evidence.file}: ${error.message}`);
      }
    }
  }

  for (const spec of specsById.values()) {
    if (spec.implementation === "implemented" && !coveredSpecs.has(spec.id)) {
      errors.push(`implemented spec ${spec.id} has no conformance feature`);
    }
  }

  return {
    features: manifest.features.length,
    evidence: evidenceCount,
    coveredSpecs,
    domains: Object.fromEntries([...domains.entries()].sort()),
  };
}

function validateCompatibilityBaseline(baseline, specsById, manifest, errors) {
  if (!isPlainObject(baseline) || baseline.schemaVersion !== 1 ||
      baseline.format !== "eliscript-compatibility-baseline" ||
      baseline.version !== 2) {
    errors.push("compatibility baseline must use eliscript-compatibility-baseline version 2");
    return {
      stableSpecifications: 0,
      provisionalSpecifications: 0,
      planningSpecifications: 0,
      supersededSpecifications: 0,
      stableFeatures: 0,
      provisionalFeatures: 0,
    };
  }
  if (!isPlainObject(baseline.specifications) || !isPlainObject(baseline.features)) {
    errors.push("compatibility baseline must classify specifications and features");
    return {
      stableSpecifications: 0,
      provisionalSpecifications: 0,
      planningSpecifications: 0,
      supersededSpecifications: 0,
      stableFeatures: 0,
      provisionalFeatures: 0,
    };
  }

  const stableSpecifications = validateSortedStrings(
    baseline.specifications.stable,
    "stable specification baseline",
    errors,
  );
  const provisionalSpecifications = validateSortedStrings(
    baseline.specifications.provisional,
    "provisional specification baseline",
    errors,
  );
  const planningSpecifications = validateSortedStrings(
    baseline.specifications.planning,
    "planning specification baseline",
    errors,
  );
  const supersededSpecifications = validateSortedStrings(
    baseline.specifications.superseded,
    "superseded specification baseline",
    errors,
  );
  const stableFeatures = validateSortedStrings(
    baseline.features.stable,
    "stable feature baseline",
    errors,
  );
  const provisionalFeatures = validateSortedStrings(
    baseline.features.provisional,
    "provisional feature baseline",
    errors,
  );

  const specs = [...specsById.values()];
  const expectedStableSpecifications = specs
    .filter((spec) => spec.status === "stable")
    .map((spec) => spec.id)
    .sort();
  const expectedProvisionalSpecifications = specs
    .filter((spec) => spec.status === "accepted" && spec.implementation === "implemented")
    .map((spec) => spec.id)
    .sort();
  const expectedPlanningSpecifications = specs
    .filter((spec) =>
      spec.implementation !== "implemented" &&
      spec.implementation !== "superseded")
    .map((spec) => spec.id)
    .sort();
  const expectedSupersededSpecifications = specs
    .filter((spec) => spec.status === "superseded")
    .map((spec) => spec.id)
    .sort();
  const features = Array.isArray(manifest.features) ? manifest.features : [];
  const expectedStableFeatures = features
    .filter((feature) => feature.status === "stable")
    .map((feature) => feature.id)
    .sort();
  const expectedProvisionalFeatures = features
    .filter((feature) => feature.status === "accepted")
    .map((feature) => feature.id)
    .sort();

  compareClassification(
    stableSpecifications,
    expectedStableSpecifications,
    "stable specification baseline",
    errors,
  );
  compareClassification(
    provisionalSpecifications,
    expectedProvisionalSpecifications,
    "provisional specification baseline",
    errors,
  );
  compareClassification(
    planningSpecifications,
    expectedPlanningSpecifications,
    "planning specification baseline",
    errors,
  );
  compareClassification(
    supersededSpecifications,
    expectedSupersededSpecifications,
    "superseded specification baseline",
    errors,
  );
  compareClassification(
    stableFeatures,
    expectedStableFeatures,
    "stable feature baseline",
    errors,
  );
  compareClassification(
    provisionalFeatures,
    expectedProvisionalFeatures,
    "provisional feature baseline",
    errors,
  );

  const allSpecifications = [
    ...stableSpecifications,
    ...provisionalSpecifications,
    ...planningSpecifications,
    ...supersededSpecifications,
  ];
  if (new Set(allSpecifications).size !== allSpecifications.length) {
    errors.push("compatibility baseline classifies a specification more than once");
  }
  const allFeatures = [...stableFeatures, ...provisionalFeatures];
  if (new Set(allFeatures).size !== allFeatures.length) {
    errors.push("compatibility baseline classifies a feature more than once");
  }

  return {
    stableSpecifications: stableSpecifications.length,
    provisionalSpecifications: provisionalSpecifications.length,
    planningSpecifications: planningSpecifications.length,
    supersededSpecifications: supersededSpecifications.length,
    stableFeatures: stableFeatures.length,
    provisionalFeatures: provisionalFeatures.length,
  };
}

export async function checkContracts(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  const specIndex =
    options.specIndex ?? (await readJson(path.join(root, "specs/index.json")));
  const manifest =
    options.manifest ??
    (await readJson(path.join(root, "tests/conformance/manifest.json")));
  const baseline =
    options.baseline ??
    (await readJson(path.join(root, "contracts/compatibility-baseline.json")));
  const maturity =
    options.maturity ??
    (await readJson(path.join(root, "contracts/maturity-progress.json")));
  const applicationFeatureIds = new Set(validateSortedStrings(
    maturity?.stabilization?.excludedFeatureIds,
    "core conformance application exclusions",
    errors,
  ));

  const specsById = await validateSpecIndex(root, specIndex, errors);
  const manifestReport = await validateManifest(
    root,
    manifest,
    specsById,
    applicationFeatureIds,
    errors,
  );
  const baselineReport = validateCompatibilityBaseline(
    baseline,
    specsById,
    manifest,
    errors,
  );

  if (errors.length > 0) throw new ContractValidationError(errors);

  const specificationStatuses = {};
  const implementationStatuses = {};
  for (const spec of specsById.values()) {
    specificationStatuses[spec.status] =
      (specificationStatuses[spec.status] ?? 0) + 1;
    implementationStatuses[spec.implementation] =
      (implementationStatuses[spec.implementation] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    specifications: {
      total: specsById.size,
      statuses: specificationStatuses,
      implementations: implementationStatuses,
      coveredImplemented: [...specsById.values()].filter(
        (spec) =>
          spec.implementation === "implemented" &&
          manifestReport.coveredSpecs.has(spec.id),
      ).length,
    },
    features: {
      total: manifestReport.features,
      evidence: manifestReport.evidence,
      domains: manifestReport.domains,
    },
    baseline: baselineReport,
  };
}

function humanReport(report) {
  const matrix = Object.entries(report.features.domains).map(
    ([domain, counts]) =>
      `  ${domain.padEnd(14)} ${String(counts.features).padStart(2)} features / ` +
      `${String(counts.evidence).padStart(2)} evidence`,
  );
  return [
    `Contract index: ${report.specifications.total} specifications`,
    `Implemented coverage: ${report.specifications.coveredImplemented}/` +
      `${report.specifications.implementations.implemented ?? 0}`,
    `Conformance features: ${report.features.total}`,
    `Evidence links: ${report.features.evidence}`,
    `Stable baseline: ${report.baseline.stableSpecifications} specs / ` +
      `${report.baseline.stableFeatures} features`,
    `Provisional: ${report.baseline.provisionalSpecifications} specs / ` +
      `${report.baseline.provisionalFeatures} features`,
    "Conformance matrix:",
    ...matrix,
  ].join("\n");
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--json");
  if (unknownArguments.length > 0) {
    console.error(`Unknown argument: ${unknownArguments[0]}`);
    process.exitCode = 2;
  } else {
    try {
      const report = await checkContracts();
      console.log(
        process.argv.includes("--json")
          ? JSON.stringify(report)
          : humanReport(report),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
