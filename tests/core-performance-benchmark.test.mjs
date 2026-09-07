import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CORE_BENCHMARK_PARAMETERS,
  CORE_BENCHMARK_THRESHOLDS,
  validateCoreBenchmarkReport,
  validateCoreBenchmarkSource,
} from "../tools/performance/core-benchmark.mjs";

const reportPath = path.resolve(
  import.meta.dir,
  "../benchmarks/core-performance-macos-arm64.json",
);

async function readReport() {
  return JSON.parse(await readFile(reportPath, "utf8"));
}

test("committed core performance report matches current sources and budgets", async () => {
  const report = await validateCoreBenchmarkSource(await readReport());

  expect(report.host).toMatchObject({
    platform: "darwin",
    architecture: "arm64",
  });
  expect(report.parameters).toEqual(CORE_BENCHMARK_PARAMETERS);
  expect(report.thresholds).toEqual(CORE_BENCHMARK_THRESHOLDS);
  expect(report.runs).toHaveLength(3);
  expect(Object.keys(report.summary)).toEqual(
    Object.keys(CORE_BENCHMARK_THRESHOLDS),
  );
  expect(report.decision).toEqual({
    baselineRuns: 3,
    correct: true,
    stable: true,
    withinRegressionBudgets: true,
    passed: true,
  });

  for (const run of report.runs) {
    expect(run.compiler).toMatchObject({
      sourceCount: 13,
      deterministic: true,
    });
    expect(run.build).toMatchObject({
      moduleCount: 4,
      exactDecisions: true,
    });
    expect(run.worker.equivalentToEmacs).toBe(true);
    expect(run.worker.emacsSamplesMs).toHaveLength(7);
    expect(run.worker.warmEndToEndSamplesMs).toHaveLength(7);
    expect(run.worker.warmExecutionSpeedup).toBeGreaterThan(0);
    expect(run.worker.warmEndToEndSpeedup).toBeGreaterThan(0);
    expect(run.workload).toMatchObject({
      name: "persistent-frequencies",
      inputCount: 100_000,
      keyCount: 1_000,
      countPerKey: 100,
      deterministic: true,
    });
  }
  for (const metric of Object.values(report.summary)) {
    expect(metric.samplesMs).toHaveLength(3);
    expect(metric.passed).toBe(true);
  }
  expect(report.source.files.map((entry) => entry.file)).toContain(
    "tools/performance/core-benchmark.mjs",
  );
});

test("core performance report validator rejects incomplete or stale evidence", async () => {
  const original = await readReport();

  const incomplete = structuredClone(original);
  incomplete.runs.pop();
  expect(() => validateCoreBenchmarkReport(incomplete)).toThrow(
    "invalid core performance benchmark runs",
  );

  const changedThreshold = structuredClone(original);
  changedThreshold.thresholds["compiler.warmCorpus"].maximumMedianMs += 1;
  expect(() => validateCoreBenchmarkReport(changedThreshold)).toThrow(
    "core performance thresholds do not match the contract",
  );

  const changedSummary = structuredClone(original);
  changedSummary.summary["worker.warmEndToEnd"].medianMs += 1;
  expect(() => validateCoreBenchmarkReport(changedSummary)).toThrow(
    "core performance summary does not match its runs",
  );

  const staleSource = structuredClone(original);
  staleSource.source.digest = "0".repeat(64);
  await expect(validateCoreBenchmarkSource(staleSource)).rejects.toThrow(
    "core performance report does not match current sources",
  );
});
