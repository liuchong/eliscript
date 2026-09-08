import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import {
  humanRepeatedDeterminismReport,
  REQUIRED_ITERATIONS,
  validateRepeatedDeterminismReport,
} from "../tools/acceptance/repeat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

function combinedDigest(compilerSha256, acceptanceSha256) {
  return createHash("sha256").update(JSON.stringify({
    acceptanceSha256,
    compilerSha256,
  })).digest("hex");
}

function reportFixture(iterations = REQUIRED_ITERATIONS) {
  const identitySha256 = combinedDigest(HEX_A, HEX_B);
  const source = {
    commit: "1".repeat(40),
    tree: "2".repeat(40),
  };
  const runs = Array.from({ length: iterations }, (_, index) => ({
    iteration: index + 1,
    source: {
      ...source,
      cleanBefore: true,
      cleanAfter: true,
    },
    compiler: { artifactCount: 26, sha256: HEX_A },
    acceptance: {
      criterionCount: 35,
      artifactCount: 7,
      corpusComplete: true,
      operationalSuccess: true,
      acceptancePass: false,
      sha256: HEX_B,
    },
    identitySha256,
    observations: {
      generatedAt: `2026-09-08T00:00:${String(index).padStart(2, "0")}.000Z`,
      commands: [],
    },
  }));
  return {
    schemaVersion: 1,
    format: "eliscript-repeated-determinism-run",
    version: 1,
    generatedAt: "2026-09-08T00:01:00.000Z",
    source,
    parameters: {
      iterations,
      requiredIterations: REQUIRED_ITERATIONS,
    },
    identityProjection: {
      format: "eliscript-repeated-determinism-identity",
      version: 1,
      excludedObservations: [
        "acceptance.generatedAt",
        "acceptance.commands[].durationMs",
        "acceptance.commands[].outputSha256",
        "acceptance.commands[].summary",
        "compiler.temporaryDirectory",
      ],
    },
    identity: {
      sha256: identitySha256,
      compilerSha256: HEX_A,
      acceptanceSha256: HEX_B,
      compilerArtifactCount: 26,
      acceptanceArtifactCount: 7,
      criterionCount: 35,
    },
    runs,
    summary: {
      allIdentical: true,
      allOperational: true,
      acceptanceQualified: iterations === REQUIRED_ITERATIONS,
    },
  };
}

describe("repeated core determinism evidence", () => {
  test("twenty identical clean runs satisfy the versioned local contract", () => {
    const report = reportFixture();
    expect(validateRepeatedDeterminismReport(report)).toEqual(report);
    expect(humanRepeatedDeterminismReport(report)).toContain(
      "Acceptance qualified: yes",
    );
  });

  test("short diagnostic runs cannot claim AC-07 qualification", () => {
    const report = reportFixture(2);
    expect(validateRepeatedDeterminismReport(report)).toEqual(report);
    expect(report.summary.acceptanceQualified).toBe(false);
  });

  test("identity, cleanliness, and projection drift are rejected", () => {
    const changedIdentity = structuredClone(reportFixture());
    changedIdentity.runs[7].identitySha256 = "c".repeat(64);
    expect(() => validateRepeatedDeterminismReport(changedIdentity)).toThrow(
      "run 8 does not match the declared identity",
    );

    const dirty = structuredClone(reportFixture());
    dirty.runs[3].source.cleanAfter = false;
    expect(() => validateRepeatedDeterminismReport(dirty)).toThrow(
      "run 4 has invalid source identity or cleanliness",
    );

    const changedProjection = structuredClone(reportFixture());
    changedProjection.identityProjection.excludedObservations.pop();
    expect(() => validateRepeatedDeterminismReport(changedProjection)).toThrow(
      "identity projection does not declare the exact observations",
    );
  });

  test("retained repeated-determinism evidence verifies when present", async () => {
    const reportPath = path.join(ROOT, "acceptance/runs/m13-04.json");
    if (!existsSync(reportPath)) return;
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(validateRepeatedDeterminismReport(report).summary.acceptanceQualified)
      .toBe(true);
  });
});
