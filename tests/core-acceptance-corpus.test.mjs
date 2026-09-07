import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AcceptanceCorpusError,
  checkAcceptanceCorpus,
  humanCorpusReport,
  validateAcceptanceCorpus,
} from "../tools/acceptance/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
