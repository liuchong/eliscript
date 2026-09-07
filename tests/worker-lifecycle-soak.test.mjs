import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const soakPath = resolve(root, "tools/worker/lifecycle-soak.el");
const emacs = process.env.EMACS ?? "emacs";

async function verifySourceContract(source) {
  const aggregate = [];
  for (const entry of source.files) {
    const bytes = await readFile(resolve(root, entry.file));
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(entry.sha256).toBe(digest);
    aggregate.push(`${entry.file}:${digest}\n`);
  }
  expect(source.digest).toBe(
    createHash("sha256").update(aggregate.join("")).digest("hex"),
  );
}

async function runSoak(requests = 100_000, environment = {}) {
  const child = Bun.spawn(
    [emacs, "--batch", "-Q", "--script", soakPath],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BUN: process.execPath,
        ELISCRIPT_WORKER_SOAK_REQUESTS: String(requests),
        ELISCRIPT_WORKER_SOAK_BATCH_SIZE: "64",
        ELISCRIPT_WORKER_SOAK_CHECKPOINT_EVERY: "2500",
        ELISCRIPT_WORKER_SOAK_TIMEOUT_SECONDS: "180",
        ...environment,
      },
    },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, 210_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error("worker lifecycle soak exceeded 210000 ms");
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `soak exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

async function runRejectedSoak(environment) {
  const child = Bun.spawn(
    [emacs, "--batch", "-Q", "--script", soakPath],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BUN: process.execPath,
        ELISCRIPT_WORKER_SOAK_REQUESTS: "1000",
        ELISCRIPT_WORKER_SOAK_BATCH_SIZE: "16",
        ELISCRIPT_WORKER_SOAK_CHECKPOINT_EVERY: "25",
        ELISCRIPT_WORKER_SOAK_TIMEOUT_SECONDS: "60",
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

function verifyReport(report) {
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-worker-lifecycle-soak",
    version: 1,
    verified: true,
    acceptanceQualified: true,
    limits: {
      runTimeoutSeconds: 180,
      requestTimeoutMs: 5_000,
      blockingTimeoutMs: 25,
    },
    workload: {
      successfulRequests: 100_000,
      responseCount: 100_000,
      uniqueResponses: 100_000,
      duplicateResponses: 0,
      lostResponses: 0,
      batchSize: 64,
      peakInFlight: 64,
      checkpointEvery: 2_500,
    },
    recovery: {
      faultCallbacks: 3,
      initialGeneration: 1,
      finalGeneration: 5,
      restartCount: 4,
      events: [
        {
          name: "cooperative-cancellation",
          errorCode: "cancelled",
          callbackCount: 1,
          pendingAfter: 0,
        },
        {
          name: "explicit-restart",
          fromGeneration: 1,
          toGeneration: 2,
          pendingAfter: 0,
        },
        {
          name: "module-replacement",
          fromGeneration: 2,
          toGeneration: 3,
          revision: 2,
          pendingAfter: 0,
        },
        {
          name: "blocking-timeout",
          fromGeneration: 3,
          errorCode: "timeout",
          callbackCount: 1,
          workerStopped: true,
          pendingAfter: 0,
        },
        {
          name: "process-death",
          fromGeneration: 4,
          errorCode: "worker-exit",
          callbackCount: 1,
          pendingAfter: 0,
        },
      ],
    },
    memory: {
      unit: "KiB",
      withinBudget: true,
      boundedTrend: true,
      budgetKiB: {
        emacs: 512 * 1024,
        worker: 512 * 1024,
        combined: 768 * 1024,
      },
      steadyState: {
        fromGeneration: 1,
        toGeneration: 5,
        allowanceKiB: 16 * 1024,
        bounded: true,
      },
    },
    lifecycle: {
      cleanShutdown: true,
      temporaryDirectoryRemoved: true,
      reclaimedProcessCount: 5,
      pendingAfterCorpus: 0,
      ownedProcessCount: 5,
    },
  });

  expect(report.workload.resultChecksum).toBe(report.workload.expectedChecksum);
  expect(report.workload.resultChecksum).toBe(2_409_405);
  expect(report.memory.checkpoints).toHaveLength(40);
  expect(report.memory.generations.map(({ checkpointCount }) => checkpointCount))
    .toEqual([8, 8, 8, 8, 8]);
  expect(report.memory.generations.map(({ generation }) => generation))
    .toEqual([1, 2, 3, 4, 5]);
  expect(new Set(report.lifecycle.ownedPids).size).toBe(5);
  expect(report.memory.peakKiB.emacs).toBeGreaterThan(0);
  expect(report.memory.peakKiB.worker).toBeGreaterThan(0);
  expect(report.memory.peakKiB.combined).toBeGreaterThan(0);
  expect(report.memory.peakKiB.emacs).toBeLessThanOrEqual(
    report.memory.budgetKiB.emacs,
  );
  expect(report.memory.peakKiB.worker).toBeLessThanOrEqual(
    report.memory.budgetKiB.worker,
  );
  expect(report.memory.peakKiB.combined).toBeLessThanOrEqual(
    report.memory.budgetKiB.combined,
  );
  for (const generation of report.memory.generations) {
    expect(generation.steadyState.bounded).toBe(true);
    expect(generation.steadyState.checkpoints).toBe(generation.checkpointCount);
    expect(generation.steadyState.warmupCheckpoints).toBe(4);
  }
}

test("100000 real Emacs worker requests survive bounded lifecycle recovery", async () => {
  const report = await runSoak();
  verifyReport(report);
  await verifySourceContract(report.source);
}, 220_000);

test("smaller diagnostic worker runs cannot claim acceptance", async () => {
  const report = await runSoak(1_000, {
    ELISCRIPT_WORKER_SOAK_BATCH_SIZE: "16",
    ELISCRIPT_WORKER_SOAK_CHECKPOINT_EVERY: "25",
    ELISCRIPT_WORKER_SOAK_TIMEOUT_SECONDS: "60",
  });
  expect(report.verified).toBe(true);
  expect(report.acceptanceQualified).toBe(false);
  expect(report.workload.successfulRequests).toBe(1_000);
  expect(report.lifecycle.cleanShutdown).toBe(true);
});

test("rejected worker runs verify failure-path cleanup", async () => {
  const result = await runRejectedSoak({
    ELISCRIPT_WORKER_SOAK_EMACS_BUDGET_MIB: "1",
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("memory exceeded an absolute budget");
  expect(result.stderr).not.toContain("remained after cleanup");
});

test("committed worker lifecycle soak report matches its measured sources", async () => {
  const report = JSON.parse(
    await readFile(resolve(root, "benchmarks/worker-lifecycle-soak-macos-arm64.json")),
  );
  verifyReport(report);
  await verifySourceContract(report.source);
});
