import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function verifySourceContract(source) {
  const aggregate = [];
  for (const entry of source.files) {
    const bytes = await readFile(path.join(root, entry.file));
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(entry.sha256).toBe(digest);
    aggregate.push(`${entry.file}:${digest}\n`);
  }
  expect(source.digest).toBe(
    createHash("sha256").update(aggregate.join("")).digest("hex"),
  );
}

test("committed Emacs analysis benchmark preserves qualified evidence", async () => {
  const report = await readJson("benchmarks/emacs-analysis-macos-arm64.json");
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-emacs-analysis-benchmark",
    version: 2,
    verified: true,
    selection: {
      selected: ["search-documents", "document-statistics"],
      requiredWarmSpeedup: 2,
      thresholdCharacters: 16_000,
      primaryQualified: true,
    },
  });
  expect(report.primary.corpus).toMatchObject({
    totalTerms: 200_000,
    iterations: 30,
    warmups: 3,
  });
  expect(report.crossover).toHaveLength(6);

  const selected = new Set(report.selection.selected);
  for (const candidate of report.primary.candidates) {
    expect(candidate.correct).toBe(true);
    expect(candidate.samples.reference).toHaveLength(30);
    expect(candidate.samples.accelerated).toHaveLength(30);
    expect(candidate.mediansMs).toEqual(
      expect.objectContaining({
        referenceEndToEnd: expect.any(Number),
        acceleratedEndToEnd: expect.any(Number),
        worker: expect.any(Number),
        execution: expect.any(Number),
        serialization: expect.any(Number),
        transportDecodeAndApplication: expect.any(Number),
      }),
    );
    if (selected.has(candidate.name)) {
      expect(candidate.warmEndToEndSpeedup).toBeGreaterThanOrEqual(2);
    }
    for (const sample of candidate.samples.accelerated) {
      expect(sample.applicationDigest).toBe(
        candidate.samples.reference[0].applicationDigest,
      );
    }
  }

  const belowThreshold = report.crossover.filter(
    (entry) => entry.corpus.totalCharacters < report.selection.thresholdCharacters,
  );
  const qualifyingCrossover = report.crossover.find(
    (entry) => entry.corpus.totalCharacters === 15_754,
  );
  const aboveThreshold = report.crossover.find(
    (entry) => entry.corpus.totalCharacters > 16_000,
  );
  expect(
    belowThreshold.some((entry) =>
      entry.candidates
        .filter(({ name }) => selected.has(name))
        .some(({ warmEndToEndSpeedup }) => warmEndToEndSpeedup < 2),
    ),
  ).toBe(true);
  for (const entry of [qualifyingCrossover, aboveThreshold]) {
    for (const candidate of entry.candidates.filter(({ name }) => selected.has(name))) {
      expect(candidate.warmEndToEndSpeedup).toBeGreaterThanOrEqual(2);
    }
  }
  expect(report.selection.thresholdCharacters).toBeGreaterThan(
    qualifyingCrossover.corpus.totalCharacters,
  );
  expect(report.selection.thresholdCharacters).toBeLessThan(
    aboveThreshold.corpus.totalCharacters,
  );
  await verifySourceContract(report.source);
});

test("committed Emacs analysis soak proves buffer lifecycle safety", async () => {
  const report = await readJson(
    "benchmarks/emacs-analysis-soak-macos-arm64.json",
  );
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-emacs-analysis-soak",
    version: 1,
    verified: true,
    iterations: 200,
    stableApplications: 100,
    staleDiscards: 100,
    applicationCount: 100,
    workerGenerationStable: true,
  });
  expect(report.workerMs.samples).toHaveLength(200);
  expect(report.workerMs.median).toBeGreaterThan(0);
  await verifySourceContract(report.source);
});
