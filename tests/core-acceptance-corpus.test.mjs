import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AcceptanceCorpusError,
  checkAcceptanceCorpus,
  humanCorpusReport,
  validateAcceptanceCorpus,
  verifyAcceptanceRun,
} from "../tools/acceptance/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retainedReportTest = process.env.ELISCRIPT_SKIP_RETAINED_ACCEPTANCE === "1"
  ? test.skip
  : test;

async function contract() {
  return JSON.parse(
    await readFile(path.join(ROOT, "contracts/core-acceptance-corpus.json"), "utf8"),
  );
}

async function validationErrors(value) {
  try {
    await validateAcceptanceCorpus(value, { root: ROOT });
  } catch (error) {
    expect(error).toBeInstanceOf(AcceptanceCorpusError);
    return error.errors;
  }
  throw new Error("expected acceptance corpus validation to fail");
}

test("core acceptance corpus is complete and specification-derived", async () => {
  const checked = await checkAcceptanceCorpus({ root: ROOT });

  expect(checked.criteria).toHaveLength(35);
  expect(checked.criteria[0]).toEqual({
    id: "AC-01",
    title: "Stable specification coverage",
  });
  expect(checked.criteria.at(-1)).toEqual({
    id: "PD-11",
    title: "State Discipline",
  });
  expect(checked.contract.commands[0].argv).toEqual(["make", "test-core"]);
  expect(checked.applications.map((entry) => entry.id)).toEqual(["AV-01", "AV-02"]);
  expect(humanCorpusReport(checked)).toContain("35 mandatory criteria");
});

test("core acceptance corpus rejects a missing criterion", async () => {
  const value = await contract();
  value.criteria.pop();

  const errors = await validationErrors(value);
  expect(errors).toContain(
    "criteria must exactly match the ordered AC and PD headings in the normative specifications",
  );
  expect(errors).toContain(
    "corpus and maturity progress criteria must have identical ids and order",
  );
});

test("core acceptance corpus rejects title drift from the normative spec", async () => {
  const value = await contract();
  value.criteria[0].title = "Almost stable specification coverage";

  expect(await validationErrors(value)).toContain(
    "criteria must exactly match the ordered AC and PD headings in the normative specifications",
  );
});

test("core acceptance corpus rejects unknown probes and untracked evidence", async () => {
  const value = await contract();
  value.criteria[0].probes = ["missing-probe"];
  value.criteria[0].evidence = ["tests/fixtures/not-acceptance-evidence.txt"];

  const errors = await validationErrors(value);
  expect(errors).toContain("AC-01 references unknown command missing-probe");
  expect(errors).toContain(
    "AC-01 evidence is not tracked: tests/fixtures/not-acceptance-evidence.txt",
  );
});

test("core acceptance corpus keeps applications outside core evidence", async () => {
  const value = await contract();
  value.applications[0].contributesToCore = true;

  expect(await validationErrors(value)).toContain(
    "applications must match AV headings and contribute no core evidence",
  );
});

retainedReportTest(
  "retained M13 audit is complete operational evidence without a final claim",
  async () => {
    const report = await verifyAcceptanceRun("acceptance/runs/m13-01.json", {
      root: ROOT,
      markdownFile: "acceptance/runs/m13-01.md",
    });

    expect(report.summary).toEqual({
      criteria: { pass: 24, incomplete: 11, fail: 0, total: 35 },
      corpusComplete: true,
      operationalSuccess: true,
      acceptancePass: false,
    });
    expect(report.source).toMatchObject({ cleanBefore: true, cleanAfter: true });
    expect(report.applications.every((entry) =>
      entry.result === "not-run" && entry.contributesToCore === false)).toBe(true);
  },
);

retainedReportTest(
  "retained M13 audit rejects a forged final acceptance result",
  async () => {
    const report = JSON.parse(
      await readFile(path.join(ROOT, "acceptance/runs/m13-01.json"), "utf8"),
    );
    report.summary.acceptancePass = true;

    await expect(verifyAcceptanceRun("unused.json", {
      root: ROOT,
      report,
    })).rejects.toMatchObject({
      errors: ["run summary is not derived from recorded results"],
    });
  },
);
