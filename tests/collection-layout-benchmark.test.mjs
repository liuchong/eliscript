import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  runLayoutHostBenchmark,
  validateLayoutHostReport,
} from "../tools/collections/layout-benchmark.mjs";
import {
  analyzeLayoutSuite,
  benchmarkSourceDigest,
  validateLayoutSuiteReport,
} from "../tools/collections/benchmark.mjs";

async function runHost(command, arguments_) {
  const source = fileURLToPath(
    new URL("../tools/collections/layout-host.mjs", import.meta.url),
  );
  const child = Bun.spawn([command, ...arguments_, source], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ELISCRIPT_LAYOUT_OCCUPANCIES: "8,16",
      ELISCRIPT_LAYOUT_ITERATIONS: "5000",
      ELISCRIPT_LAYOUT_MUTATION_ITERATIONS: "1000",
      ELISCRIPT_LAYOUT_TIMING_SAMPLES: "2",
      ELISCRIPT_LAYOUT_MEMORY_NODES: "1000",
      ELISCRIPT_LAYOUT_MEMORY_SAMPLES: "2",
    },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return validateLayoutHostReport(JSON.parse(stdout));
}

test("HAMT layout core validates equivalent real node operations", async () => {
  const report = await runLayoutHostBenchmark({
    host: { id: "test", runtime: "test" },
    occupancies: [4, 8],
    lookupIterations: 2_000,
    mutationIterations: 500,
    timingSamples: 2,
    memoryNodeCount: 100,
    memorySamples: 2,
  });

  expect(validateLayoutHostReport(report)).toBe(report);
  expect(report.validation).toMatchObject({
    passed: true,
    lookupPath: "runtime/core/map-internals.mjs#mapFind",
  });
  expect(report.measurements).toHaveLength(2);
  for (const measurement of report.measurements) {
    expect(measurement.bitmap.lookup.checksum).toBe(
      measurement.array.lookup.checksum,
    );
    expect(measurement.bitmap.assoc.checksum).toBe(
      measurement.array.assoc.checksum,
    );
    expect(measurement.bitmap.dissoc.checksum).toBe(
      measurement.array.dissoc.checksum,
    );
    expect(measurement.bitmap.bytesPerNode.median).toBeNull();
    expect(measurement.array.bytesPerNode.median).toBeNull();
  }

  await expect(runLayoutHostBenchmark({
    host: { id: "test" },
    occupancies: [8, 8],
  })).rejects.toThrow("strictly increasing");
});

test("HAMT layout host adapters agree under Bun and Node", async () => {
  const [bunReport, nodeReport] = await Promise.all([
    runHost(process.execPath, []),
    runHost(process.env.NODE ?? "node", ["--expose-gc"]),
  ]);

  expect(bunReport.host.id).toBe("bun");
  expect(nodeReport.host.id).toBe("node");
  expect(bunReport.parameters).toEqual(nodeReport.parameters);
  expect(bunReport.measurements.map((entry) => entry.checksum)).toEqual(
    nodeReport.measurements.map((entry) => entry.checksum),
  );
  expect(bunReport.measurements.every((entry) =>
    entry.bitmap.bytesPerNode.median === null &&
    entry.array.bytesPerNode.median === null)).toBe(true);
  expect(nodeReport.measurements.every((entry) =>
    entry.bitmap.bytesPerNode.median > 0 &&
    entry.array.bytesPerNode.median > 0)).toBe(true);
});

test("HAMT browser benchmark uses copied native ESM without a bundler", async () => {
  const benchmarkFile = fileURLToPath(
    new URL("../tools/collections/benchmark.mjs", import.meta.url),
  );
  const source = await readFile(benchmarkFile, "utf8");

  expect(source).not.toContain('from "vite"');
  expect(source).toContain('case ".mjs": return "text/javascript; charset=utf-8"');
  expect(source).toContain('"tools/collections/browser/main.mjs"');
  expect(source).toContain("await copyFile(path.join(projectDirectory, relative), destination)");
  expect(source).toContain("/tools/collections/browser/index.html?");
});

test("committed HAMT layout baseline proves the 32/24 threshold decision", async () => {
  const baselineFile = fileURLToPath(
    new URL("../benchmarks/hamt-layout-macos-arm64.json", import.meta.url),
  );
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));

  expect(validateLayoutSuiteReport(baseline)).toBe(baseline);
  expect(baseline.sourceDigest).toEqual(await benchmarkSourceDigest());
  expect(baseline.runtimeThresholds).toEqual({ promotion: 32, demotion: 24 });
  expect(baseline.analysis).toEqual(analyzeLayoutSuite(baseline.hosts));
  expect(baseline.analysis).toMatchObject({
    promotionCandidate: 32,
    demotionCandidate: 24,
  });
  const mismatched = structuredClone(baseline);
  mismatched.runtimeThresholds = { promotion: 28, demotion: 20 };
  expect(() => validateLayoutSuiteReport(mismatched)).toThrow(
    "HAMT runtime thresholds 28/20 do not match measured candidates 32/24",
  );
  expect(baseline.hosts.map((host) => host.host.id)).toEqual([
    "bun",
    "node",
    "chrome",
  ]);
  expect(baseline.hosts.every((host) =>
    host.measurements.every((measurement) =>
      measurement.bitmap.lookup.samplesMs.length === 7 &&
      measurement.array.lookup.samplesMs.length === 7))).toBe(true);
  expect(baseline.hosts[0].measurements.every((measurement) =>
    measurement.ratios.arrayToBitmapBytes === null)).toBe(true);
  for (const host of baseline.hosts.slice(1)) {
    expect(host.measurements.every((measurement) =>
      measurement.ratios.arrayToBitmapBytes > 0)).toBe(true);
  }
});
