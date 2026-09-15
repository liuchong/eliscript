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
  const run = await readJson("acceptance/runs/m13-01.json");

  // The manifest is a projection of the retained run, so its counts are the
  // run's counts. A hard-coded number here would become a claim about the
  // project's state rather than a check of the projection.
  const tally = { pass: 0, incomplete: 0, fail: 0, total: run.criteria.length };
  for (const criterion of run.criteria) tally[criterion.result] += 1;

  expect(manifest).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-1.0-acceptance-manifest",
    version: 1,
    summary: {
      criteria: tally,
      corpusComplete: true,
      operationalSuccess: true,
      evidenceComplete: true,
      blockingDefects: 0,
      // Acceptance is all-or-nothing: a manifest claims it only when no
      // mandatory criterion is incomplete or failed.
      acceptancePass: tally.incomplete === 0 && tally.fail === 0,
    },
  });
  expect(manifest.evidence.map((group) => group.id)).toEqual([
    "benchmark", "fuzz", "scale", "soak", "test",
  ]);
  expect(manifest.evidence.every((group) => group.complete)).toBe(true);
  expect(manifest.applications.every((application) =>
    application.result === "not-run" &&
      application.contributesToCore === false)).toBe(true);
  // The report is prose about the same numbers, and it may only claim
  // acceptance when the manifest does.
  const report = humanFinalAcceptanceReport(manifest);
  expect(report).toContain(
    `Results: ${tally.pass} pass, ${tally.incomplete} incomplete, ` +
    `${tally.fail} fail, ${tally.total} total.`,
  );
  if (manifest.summary.acceptancePass) {
    expect(report).toContain("Final acceptance: pass");
    expect(report).not.toContain("This is the canonical candidate report.");
  } else {
    expect(report).toContain("This is the canonical candidate report.");
    expect(report).not.toContain("Final acceptance: pass");
  }
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
  forged.summary.acceptancePass = !expected.summary.acceptancePass;

  expect(() => validateFinalManifest(forged, expected)).toThrow(
    FinalAcceptanceError,
  );
});

retainedFinalTest("canonical final manifest and report remain byte exact", async () => {
  const derived = await buildFinalAcceptance({ root: ROOT });
  const manifest = await verifyFinalAcceptance({ root: ROOT });

  // Byte exact means the retained artifacts are exactly what the derivation
  // produces from the retained run.
  expect(manifest).toEqual(derived);

  // `--require-pass` is a gate on that derivation, not a second opinion.
  const gate = verifyFinalAcceptance({ root: ROOT, requirePass: true });
  if (derived.summary.acceptancePass) {
    await expect(gate).resolves.toEqual(derived);
  } else {
    await expect(gate).rejects.toMatchObject({
      errors: [
        "the canonical artifacts are valid, but final acceptance has not been reached",
      ],
    });
  }
});
