import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFinalAcceptance,
  FinalAcceptanceError,
  humanFinalAcceptanceReport,
  validateFinalManifest,
  verifyFinalAcceptance,
} from "../tools/acceptance/finalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retainedFinalTest = process.env.ELISCRIPT_SKIP_RETAINED_ACCEPTANCE === "1"
  ? test.skip
  : test;

async function readJson(file) {
  return JSON.parse(await readFile(path.join(ROOT, file), "utf8"));
}

retainedFinalTest("canonical final artifacts derive every gate from the retained local run", async () => {
  const manifest = await buildFinalAcceptance({ root: ROOT });

  expect(manifest).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-1.0-acceptance-manifest",
    version: 1,
    summary: {
      criteria: { pass: 22, incomplete: 13, fail: 0, total: 35 },
      corpusComplete: true,
      operationalSuccess: true,
      evidenceComplete: true,
      blockingDefects: 0,
      acceptancePass: false,
    },
  });
  expect(manifest.evidence.map((group) => group.id)).toEqual([
    "benchmark", "fuzz", "scale", "soak", "test",
  ]);
  expect(manifest.evidence.every((group) => group.complete)).toBe(true);
  expect(manifest.applications.every((application) =>
    application.result === "not-run" &&
      application.contributesToCore === false)).toBe(true);
  expect(humanFinalAcceptanceReport(manifest)).toContain(
    "This is the canonical candidate report.",
  );
});

retainedFinalTest("blocking defects cannot be hidden by otherwise valid artifacts", async () => {
  const defects = await readJson("acceptance/defects.json");
  defects.unresolved.push({
    id: "DEFECT-0001",
    severity: 1,
    class: "correctness",
    title: "Acceptance test defect",
    evidence: ["README.md"],
  });
  const manifest = await buildFinalAcceptance({ root: ROOT, defects });

  expect(manifest.defects.blockingCount).toBe(1);
  expect(manifest.summary.blockingDefects).toBe(1);
  expect(manifest.summary.acceptancePass).toBe(false);
});

retainedFinalTest("final artifact contract rejects evidence absent from the source run", async () => {
  const contract = await readJson("contracts/final-acceptance.json");
  contract.evidenceGroups[0].artifacts = ["README.md"];

  await expect(buildFinalAcceptance({ root: ROOT, contract })).rejects.toMatchObject({
    errors: ["benchmark artifact is not bound by the source run: README.md"],
  });
});

retainedFinalTest("final acceptance rejects a forged pass result", async () => {
  const expected = await buildFinalAcceptance({ root: ROOT });
  const forged = structuredClone(expected);
  forged.summary.acceptancePass = true;

  expect(() => validateFinalManifest(forged, expected)).toThrow(
    FinalAcceptanceError,
  );
});

retainedFinalTest("canonical final manifest and report remain byte exact", async () => {
  const manifest = await verifyFinalAcceptance({ root: ROOT });
  expect(manifest.summary.acceptancePass).toBe(false);

  await expect(verifyFinalAcceptance({
    root: ROOT,
    requirePass: true,
  })).rejects.toMatchObject({
    errors: [
      "the canonical artifacts are valid, but final acceptance has not been reached",
    ],
  });
});
