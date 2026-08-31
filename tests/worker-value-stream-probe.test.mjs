import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const probePath = resolve(
  projectDirectory,
  "tools/worker/value-stream-probe.el",
);
const emacs = process.env.EMACS ?? "emacs";

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(projectDirectory, relativePath), "utf8"));
}

async function sha256(relativePath) {
  return createHash("sha256")
    .update(await readFile(resolve(projectDirectory, relativePath)))
    .digest("hex");
}

async function runProbe(environment) {
  const child = Bun.spawn(
    [emacs, "--batch", "-Q", "--script", probePath],
    {
      cwd: projectDirectory,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BUN: process.execPath,
        ...environment,
      },
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test("real Emacs and Bun processes report bounded chunked value memory", async () => {
  const { exitCode, stdout, stderr } = await runProbe({
    ELISCRIPT_VALUE_STREAM_PROBE_MIB: "1",
    ELISCRIPT_VALUE_STREAM_PROBE_TIMEOUT_SECONDS: "30",
  });
  if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim());

  const report = JSON.parse(stdout);
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-worker-value-stream-probe",
    version: 1,
    verified: true,
    withinBudget: true,
    dataset: {
      kind: "ascii-string-round-trip",
      logicalMiB: 1,
      logicalBytes: 1024 * 1024,
    },
    transport: {
      encoding: "eliscript-value-v1",
      framing: "eliscript-value-chunks-v1",
      maxChunkBytes: 256 * 1024,
      maxEventsPerChunk: 512,
      maxTextPartUnits: 8192,
    },
    memory: { unit: "KiB" },
  });
  expect(report.transport.argumentChunks > 1).toBe(true);
  expect(report.transport.responseChunks > 1).toBe(true);
  expect(report.memory.emacs.peak >= report.memory.emacs.baseline).toBe(true);
  expect(report.memory.worker.peak >= report.memory.worker.baseline).toBe(true);
  expect(report.memory.combinedPeak > 0).toBe(true);
  expect(report.source.digest).toHaveLength(64);
}, 40_000);

test("value-stream probe cancels and fails when a memory budget is exceeded", async () => {
  const { exitCode, stdout } = await runProbe({
    ELISCRIPT_VALUE_STREAM_PROBE_MIB: "1",
    ELISCRIPT_VALUE_STREAM_PROBE_EMACS_BUDGET_MIB: "1",
    ELISCRIPT_VALUE_STREAM_PROBE_TIMEOUT_SECONDS: "30",
  });
  expect(exitCode).not.toBe(0);
  const report = JSON.parse(stdout);
  expect(report.verified).toBe(false);
  expect(report.withinBudget).toBe(false);
  expect(report.memory.emacs.peak > 1024).toBe(true);
  expect(report.error.code).toBe("cancelled");
}, 40_000);

test("committed 256 MiB value-stream report matches its measured sources", async () => {
  const report = await readJson("benchmarks/worker-value-stream-macos-arm64.json");
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-worker-value-stream-probe",
    version: 1,
    verified: true,
    withinBudget: true,
    dataset: {
      kind: "ascii-string-round-trip",
      logicalMiB: 256,
      logicalBytes: 256 * 1024 * 1024,
      sha256: "8531f9720e3f5ce15fde831a4c677c501b3ef320d4f156c1248299cd9955392d",
    },
    transport: {
      encoding: "eliscript-value-v1",
      framing: "eliscript-value-chunks-v1",
      maxChunkBytes: 256 * 1024,
      maxEventsPerChunk: 512,
      maxTextPartUnits: 8192,
    },
    budgetsMiB: {
      emacsPeak: 2048,
      workerPeak: 1024,
      combinedPeak: 2560,
    },
  });
  expect(report.transport.argumentChunks > 1000).toBe(true);
  expect(report.transport.responseChunks > 1000).toBe(true);
  expect(report.memory.emacs.peak <= report.budgetsMiB.emacsPeak * 1024)
    .toBe(true);
  expect(report.memory.worker.peak <= report.budgetsMiB.workerPeak * 1024)
    .toBe(true);
  expect(report.memory.combinedPeak <= report.budgetsMiB.combinedPeak * 1024)
    .toBe(true);

  const measuredFiles = [];
  for (const entry of report.source.files) {
    const digest = await sha256(entry.file);
    expect(digest).toBe(entry.sha256);
    measuredFiles.push(`${entry.file}:${digest}\n`);
  }
  expect(createHash("sha256").update(measuredFiles.join("")).digest("hex"))
    .toBe(report.source.digest);
});
