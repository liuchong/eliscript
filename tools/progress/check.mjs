import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");

const UNIT_STATUSES = new Set(["complete", "partial", "open", "blocked"]);
const MILESTONE_UNIT_COUNTS = new Map([
  ["M7", 6],
  ["M8", 7],
  ["M9", 6],
  ["M10", 6],
  ["M11", 6],
  ["M12", 6],
  ["M13", 5],
]);
const EXPECTED_MILESTONES = [...MILESTONE_UNIT_COUNTS.keys()];
const EXPECTED_CRITERIA = [
  ...Array.from({ length: 24 }, (_, index) =>
    `AC-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 11 }, (_, index) =>
    `PD-${String(index + 1).padStart(2, "0")}`),
];
const EXPECTED_APPLICATION_CRITERIA = ["AV-01", "AV-02"];
const EXPECTED_APPLICATION_FEATURES = [
  "publishing.org-adapter",
  "tooling.vite-adapter",
];

export class MaturityProgressValidationError extends Error {
  constructor(errors) {
    super(
      `Maturity progress validation failed:\n${errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
    this.name = "MaturityProgressValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equalArrays(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function percentage(completed, total) {
  return Math.round((completed / total) * 1_000) / 10;
}

function progressRecord(completed, total, fields = {}) {
  const completedPercent = percentage(completed, total);
  return {
    completed,
    total,
    completedPercent,
    remaining: total - completed,
    remainingPercent: Math.round((100 - completedPercent) * 10) / 10,
    ...fields,
  };
}

function validateStringArray(values, label, errors) {
  if (!Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || value.length === 0)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return [];
  }
  const sorted = [...new Set(values)].sort();
  if (!equalArrays(values, sorted)) {
    errors.push(`${label} must be unique and lexicographically sorted`);
  }
  return values;
}

function validateFeatureEvidence(
  unit,
  label,
  featureIds,
  applicationFeatures,
  errors,
) {
  const features = unit.features === undefined
    ? []
    : validateStringArray(unit.features, `${label} features`, errors);
  for (const feature of features) {
    if (!featureIds.has(feature)) {
      errors.push(`${label} references unknown conformance feature ${feature}`);
    }
    if (applicationFeatures.has(feature)) {
      errors.push(`${label} uses excluded application feature ${feature}`);
    }
  }
  if ((unit.status === "complete" || unit.status === "partial") &&
      features.length === 0) {
    errors.push(`${label} ${unit.status} status requires core feature evidence`);
  }
}

function validateUnit(
  unit,
  expectedId,
  label,
  featureIds,
  applicationFeatures,
  errors,
  requiresTitle = true,
) {
  if (!isPlainObject(unit)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (unit.id !== expectedId) {
    errors.push(`${label} id must be ${expectedId}, received ${JSON.stringify(unit.id)}`);
  }
  if (requiresTitle &&
      (typeof unit.title !== "string" || unit.title.length === 0)) {
    errors.push(`${label} must have a title`);
  }
  if (!UNIT_STATUSES.has(unit.status)) {
    errors.push(`${label} has invalid status ${JSON.stringify(unit.status)}`);
    return;
  }
  validateFeatureEvidence(
    unit,
    label,
    featureIds,
    applicationFeatures,
    errors,
  );
  if (unit.status !== "complete" &&
      (typeof unit.remaining !== "string" || unit.remaining.length === 0)) {
    errors.push(`${label} ${unit.status} status requires remaining work`);
  }
  if (unit.status === "blocked" &&
      (typeof unit.blocker !== "string" || unit.blocker.length === 0)) {
    errors.push(`${label} blocked status requires a blocker`);
  }
}

function validateMilestones(
  milestones,
  featureIds,
  applicationFeatures,
  errors,
) {
  if (!Array.isArray(milestones)) {
    errors.push("implementation milestones must be an array");
    return { completed: 0, total: 42, milestones: {}, incomplete: [], blocked: [] };
  }
  const actualIds = milestones.map((milestone) => milestone?.id);
  if (!equalArrays(actualIds, EXPECTED_MILESTONES)) {
    errors.push(`implementation milestones must be exactly ${EXPECTED_MILESTONES.join(", ")}`);
  }

  let completed = 0;
  let total = 0;
  const report = {};
  const incomplete = [];
  const blocked = [];
  for (const [milestoneIndex, expectedMilestone] of EXPECTED_MILESTONES.entries()) {
    const milestone = milestones[milestoneIndex];
    const expectedCount = MILESTONE_UNIT_COUNTS.get(expectedMilestone);
    const units = Array.isArray(milestone?.units) ? milestone.units : [];
    if (!isPlainObject(milestone)) {
      errors.push(`milestone ${expectedMilestone} must be an object`);
    }
    if (units.length !== expectedCount) {
      errors.push(`milestone ${expectedMilestone} must contain ${expectedCount} units`);
    }
    let milestoneCompleted = 0;
    for (let unitIndex = 0; unitIndex < expectedCount; unitIndex += 1) {
      const expectedId = `${expectedMilestone}-${String(unitIndex + 1).padStart(2, "0")}`;
      const unit = units[unitIndex];
      validateUnit(
        unit,
        expectedId,
        `implementation unit ${expectedId}`,
        featureIds,
        applicationFeatures,
        errors,
      );
      if (unit?.status === "complete") {
        completed += 1;
        milestoneCompleted += 1;
      } else {
        incomplete.push(expectedId);
        if (unit?.status === "blocked") blocked.push(expectedId);
      }
    }
    total += expectedCount;
    report[expectedMilestone] = progressRecord(milestoneCompleted, expectedCount);
  }
  return { completed, total, milestones: report, incomplete, blocked };
}

function validateCriteria(
  criteria,
  featureIds,
  applicationFeatures,
  errors,
) {
  if (!Array.isArray(criteria)) {
    errors.push("verification criteria must be an array");
    return { completed: 0, total: EXPECTED_CRITERIA.length, incomplete: [], blocked: [] };
  }
  const actualIds = criteria.map((criterion) => criterion?.id);
  if (!equalArrays(actualIds, EXPECTED_CRITERIA)) {
    errors.push("verification criteria must be exactly AC-01..AC-24 then PD-01..PD-11");
  }

  let completed = 0;
  const incomplete = [];
  const blocked = [];
  for (const [index, expectedId] of EXPECTED_CRITERIA.entries()) {
    const criterion = criteria[index];
    validateUnit(
      criterion,
      expectedId,
      `verification criterion ${expectedId}`,
      featureIds,
      applicationFeatures,
      errors,
      false,
    );
    const expectedSpec = expectedId.startsWith("AC-") ? "0040" : "0041";
    if (criterion?.sourceSpec !== expectedSpec) {
      errors.push(`verification criterion ${expectedId} sourceSpec must be ${expectedSpec}`);
    }
    if (criterion?.status === "complete") {
      completed += 1;
    } else {
      incomplete.push(expectedId);
      if (criterion?.status === "blocked") blocked.push(expectedId);
    }
  }
  return {
    completed,
    total: EXPECTED_CRITERIA.length,
    incomplete,
    blocked,
  };
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

export async function checkMaturityProgress(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ??
    await readJson(path.join(root, "contracts/maturity-progress.json"));
  const manifest = options.manifest ??
    await readJson(path.join(root, "tests/conformance/manifest.json"));
  const errors = [];

  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-maturity-progress" || contract.version !== 1) {
    errors.push("maturity progress contract must use eliscript-maturity-progress version 1");
  }
  const manifestFeatures = Array.isArray(manifest?.features) ? manifest.features : [];
  const featureIds = new Set(manifestFeatures.map((feature) => feature.id));
  const excludedFeatureIds = validateStringArray(
    contract?.stabilization?.excludedFeatureIds,
    "stabilization excludedFeatureIds",
    errors,
  );
  if (!equalArrays(excludedFeatureIds, EXPECTED_APPLICATION_FEATURES)) {
    errors.push(
      `application feature exclusions must be exactly ${EXPECTED_APPLICATION_FEATURES.join(", ")}`,
    );
  }
  for (const feature of excludedFeatureIds) {
    if (!featureIds.has(feature)) {
      errors.push(`excluded application feature ${feature} is absent from conformance manifest`);
    }
  }
  if (contract?.applications?.contributesToCore !== false) {
    errors.push("application validation must contribute zero to core progress");
  }
  const excludedCriteria = validateStringArray(
    contract?.applications?.excludedCriteria,
    "application excludedCriteria",
    errors,
  );
  if (!equalArrays(excludedCriteria, EXPECTED_APPLICATION_CRITERIA)) {
    errors.push(
      `application criteria exclusions must be exactly ${EXPECTED_APPLICATION_CRITERIA.join(", ")}`,
    );
  }

  const applicationFeatures = new Set(excludedFeatureIds);
  const implementation = validateMilestones(
    contract?.implementation?.milestones,
    featureIds,
    applicationFeatures,
    errors,
  );
  const verification = validateCriteria(
    contract?.verification?.criteria,
    featureIds,
    applicationFeatures,
    errors,
  );
  const coreFeatures = manifestFeatures.filter(
    (feature) => !applicationFeatures.has(feature.id),
  );
  const stableFeatures = coreFeatures.filter(
    (feature) => feature.status === "stable",
  );

  if (errors.length > 0) throw new MaturityProgressValidationError(errors);

  return {
    schemaVersion: 1,
    format: "eliscript-maturity-progress-report",
    version: 1,
    implementation: progressRecord(
      implementation.completed,
      implementation.total,
      {
        milestones: implementation.milestones,
        incomplete: implementation.incomplete,
        blocked: implementation.blocked,
      },
    ),
    verification: progressRecord(
      verification.completed,
      verification.total,
      {
        incomplete: verification.incomplete,
        blocked: verification.blocked,
      },
    ),
    stabilization: progressRecord(stableFeatures.length, coreFeatures.length, {
      provisional: coreFeatures.length - stableFeatures.length,
      excludedFeatureIds,
    }),
    applications: {
      contributesToCore: false,
      excludedCriteria,
      excludedFeatureIds,
    },
  };
}

function humanLine(label, progress) {
  return `${label}: ${progress.completed}/${progress.total} ` +
    `(${progress.completedPercent}% complete, ${progress.remainingPercent}% remaining)`;
}

export function humanReport(report) {
  return [
    "Eliscript core maturity progress",
    humanLine("Implementation", report.implementation),
    humanLine("Verification", report.verification),
    humanLine("Stabilization", report.stabilization),
    `Incomplete implementation units: ${report.implementation.incomplete.join(", ") || "none"}`,
    `Incomplete verification criteria: ${report.verification.incomplete.join(", ") || "none"}`,
    `Blocked units: ${[
      ...report.implementation.blocked,
      ...report.verification.blocked,
    ].join(", ") || "none"}`,
    `Application validation excluded: ${report.applications.excludedCriteria.join(", ")}`,
  ].join("\n");
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  const unknownArguments = process.argv.slice(2).filter(
    (argument) => argument !== "--json",
  );
  if (unknownArguments.length > 0) {
    console.error(`Unknown argument: ${unknownArguments[0]}`);
    process.exitCode = 2;
  } else {
    try {
      const report = await checkMaturityProgress();
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
