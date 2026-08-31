import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  transientBuilderSourceDigest,
  validateTransientBuilderReport,
} from "../tools/collections/transient-builder-benchmark.mjs";

const reportPath = path.resolve(
  import.meta.dir,
  "../benchmarks/transient-builder-macos-arm64.json",
);

async function readReport() {
  return JSON.parse(await readFile(reportPath, "utf8"));
}

test("committed transient builder report matches core runtime sources", async () => {
  const report = validateTransientBuilderReport(await readReport());
  expect(report.sourceDigest).toEqual(await transientBuilderSourceDigest());
  expect(report.parameters).toMatchObject({
    vectorSize: 200_000,
    mapSize: 100_000,
    setSize: 100_000,
    warmupRounds: 2,
    timingSamples: 11,
  });
  for (const name of ["vector", "map", "set"]) {
    const result = report.results[name];
    expect(result.correctness.equivalent).toBe(true);
    expect(result.correctness.sameHash).toBe(true);
    expect(result.allocation.completionCalls).toBe(1);
    expect(result.allocation.allocationRatio).toBeLessThanOrEqual(1 / 3);
    expect(result.timing.speedup).toBeGreaterThanOrEqual(1.5);
  }
});

test("transient builder report validator rejects incomplete evidence", async () => {
  const report = await readReport();
  report.results.vector.timing.transientSamplesMs.pop();
  expect(() => validateTransientBuilderReport(report)).toThrow(
    "transient vector builder evidence failed",
  );
});
