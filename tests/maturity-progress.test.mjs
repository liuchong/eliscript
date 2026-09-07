import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkMaturityProgress,
  humanReport,
  MaturityProgressValidationError,
} from "../tools/progress/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function validationErrors(contract) {
  try {
    await checkMaturityProgress({ root: ROOT, contract });
  } catch (error) {
    expect(error).toBeInstanceOf(MaturityProgressValidationError);
    return error.errors;
  }
  throw new Error("expected maturity progress validation to fail");
}

test("maturity progress is derived from explicit core acceptance units", async () => {
  const report = await checkMaturityProgress({ root: ROOT });

  expect(report).toEqual({
    schemaVersion: 1,
    format: "eliscript-maturity-progress-report",
    version: 1,
    implementation: {
      completed: 36,
      total: 42,
      completedPercent: 85.7,
      remaining: 6,
      remainingPercent: 14.3,
      milestones: {
        M7: { completed: 6, total: 6, completedPercent: 100, remaining: 0, remainingPercent: 0 },
        M8: { completed: 7, total: 7, completedPercent: 100, remaining: 0, remainingPercent: 0 },
        M9: { completed: 6, total: 6, completedPercent: 100, remaining: 0, remainingPercent: 0 },
        M10: { completed: 5, total: 6, completedPercent: 83.3, remaining: 1, remainingPercent: 16.7 },
        M11: { completed: 6, total: 6, completedPercent: 100, remaining: 0, remainingPercent: 0 },
        M12: { completed: 6, total: 6, completedPercent: 100, remaining: 0, remainingPercent: 0 },
        M13: { completed: 0, total: 5, completedPercent: 0, remaining: 5, remainingPercent: 100 },
      },
      incomplete: [
        "M10-06",
        "M13-01", "M13-02", "M13-03", "M13-04", "M13-05",
      ],
      blocked: [],
    },
    verification: {
      completed: 17,
      total: 35,
      completedPercent: 48.6,
      remaining: 18,
      remainingPercent: 51.4,
      incomplete: [
        "AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-07", "AC-08",
        "AC-10", "AC-12", "AC-13", "AC-14", "AC-15",
        "AC-21", "AC-22", "AC-23", "AC-24", "PD-01",
        "PD-07",
      ],
      blocked: [],
    },
    stabilization: {
      completed: 28,
      total: 126,
      completedPercent: 22.2,
      remaining: 98,
      remainingPercent: 77.8,
      provisional: 98,
      excludedFeatureIds: ["publishing.org-adapter", "tooling.vite-adapter"],
    },
    applications: {
      contributesToCore: false,
      excludedCriteria: ["AV-01", "AV-02"],
      excludedFeatureIds: ["publishing.org-adapter", "tooling.vite-adapter"],
    },
  });
  expect(humanReport(report)).toContain(
    "Verification: 17/35 (48.6% complete, 51.4% remaining)",
  );
  expect(humanReport(report)).not.toContain("overall");
});

test("maturity progress rejects a missing mandatory criterion", async () => {
  const contract = await readJson("contracts/maturity-progress.json");
  contract.verification.criteria.pop();
  const errors = await validationErrors(contract);
  expect(errors).toContain(
    "verification criteria must be exactly AC-01..AC-24 then PD-01..PD-11",
  );
});

test("maturity progress rejects unsupported completion claims", async () => {
  const contract = await readJson("contracts/maturity-progress.json");
  const criterion = contract.verification.criteria.find(
    (candidate) => candidate.id === "AC-22",
  );
  criterion.status = "complete";
  delete criterion.remaining;
  const errors = await validationErrors(contract);
  expect(errors).toContain(
    "verification criterion AC-22 complete status requires core feature evidence",
  );
});

test("maturity progress rejects unknown evidence", async () => {
  const contract = await readJson("contracts/maturity-progress.json");
  contract.implementation.milestones[0].units[0].features = ["quality.missing"];
  const errors = await validationErrors(contract);
  expect(errors).toContain(
    "implementation unit M7-01 references unknown conformance feature quality.missing",
  );
});

test("maturity progress rejects application evidence in core units", async () => {
  const contract = await readJson("contracts/maturity-progress.json");
  contract.implementation.milestones[0].units[0].features = [
    "tooling.vite-adapter",
  ];
  const errors = await validationErrors(contract);
  expect(errors).toContain(
    "implementation unit M7-01 uses excluded application feature tooling.vite-adapter",
  );
});

test("maturity progress rejects milestone denominator drift", async () => {
  const contract = await readJson("contracts/maturity-progress.json");
  contract.implementation.milestones[6].units.pop();
  const errors = await validationErrors(contract);
  expect(errors).toContain("milestone M13 must contain 5 units");
});
