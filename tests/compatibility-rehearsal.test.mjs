import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCompatibilityRehearsal,
  CompatibilityRehearsalError,
  humanCompatibilityReport,
  verifyCompatibilityRun,
} from "../tools/compatibility/rehearse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function contract() {
  return JSON.parse(await readFile(
    path.join(ROOT, "contracts/compatibility-rehearsal.json"),
    "utf8",
  ));
}

async function errorsFor(value) {
  try {
    await checkCompatibilityRehearsal({ root: ROOT, contract: value });
  } catch (error) {
    expect(error).toBeInstanceOf(CompatibilityRehearsalError);
    return error.errors;
  }
  throw new Error("expected compatibility rehearsal validation to fail");
}

async function verificationErrors(report) {
  try {
    await verifyCompatibilityRun({ root: ROOT, report });
  } catch (error) {
    expect(error).toBeInstanceOf(CompatibilityRehearsalError);
    return error.errors;
  }
  throw new Error("expected compatibility rehearsal verification to fail");
}

test("compatibility rehearsal contract freezes local core transitions", async () => {
  const report = await checkCompatibilityRehearsal({ root: ROOT });
  expect(report.stablePrograms).toBe(1);
  expect(report.migrations).toBe(3);
  expect(report.scope).toEqual({
    kind: "migration-rehearsal",
    completesAc02: false,
    applicationEvidence: false,
  });
});

test("compatibility rehearsal rejects missing migration history", async () => {
  const value = await contract();
  value.migrations.pop();
  expect(await errorsFor(value)).toContain(
    "migrations must contain the complete version 1 transition inventory",
  );
});

test("compatibility rehearsal rejects application evidence and AC-02 promotion", async () => {
  const value = await contract();
  value.scope.applicationEvidence = true;
  value.scope.completesAc02 = true;
  expect(await errorsFor(value)).toContain(
    "scope must remain a non-application rehearsal that does not complete AC-02",
  );
});

test("compatibility rehearsal human report preserves evidence boundaries", () => {
  const report = {
    source: { commit: "a".repeat(40), tree: "b".repeat(40) },
    generatedAt: "2026-09-08T00:00:00.000Z",
    environment: {
      operatingSystem: "Darwin test",
      architecture: "arm64",
      bunVersion: "1.4.0",
      nodeVersion: "26.0.0",
      emacsVersion: "31.1",
    },
    cases: [{
      id: "framework-neutral-core",
      kind: "contract-replacement",
      status: "pass",
      durationMs: 0,
      fromSpec: "0010",
      toSpec: "0118",
    }],
    artifacts: [],
    summary: {
      cleanBefore: true,
      cleanAfter: true,
      applicationEvidence: false,
      completesAc02: false,
      validationPass: true,
    },
  };
  const output = humanCompatibilityReport(report);
  expect(output).toContain("Application evidence: no");
  expect(output).toContain("Completes AC-02: no");
  expect(output).toContain("Local rehearsal: pass");
});

test("retained compatibility rehearsal is source-bound local evidence", async () => {
  const report = await verifyCompatibilityRun({
    root: ROOT,
    runFile: "acceptance/runs/m13-03.json",
    markdownFile: "acceptance/runs/m13-03.md",
  });
  expect(report.summary).toMatchObject({
    required: 4,
    passed: 4,
    failed: 0,
    cleanBefore: true,
    cleanAfter: true,
    applicationEvidence: false,
    completesAc02: false,
    validationPass: true,
  });
});

test("retained compatibility rehearsal rejects a forged AC-02 claim", async () => {
  const report = JSON.parse(await readFile(
    path.join(ROOT, "acceptance/runs/m13-03.json"),
    "utf8",
  ));
  report.summary.completesAc02 = true;
  expect(await verificationErrors(report)).toContain(
    "run summary must be a passing non-application rehearsal without AC-02 completion",
  );
});
