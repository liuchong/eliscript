import { expect, test } from "bun:test";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const benchmarkPath = resolve(
  projectDirectory,
  "tools/worker/benchmark.el",
);
const emacs = process.env.EMACS ?? "emacs";

test("worker benchmark reports equivalent cold and warm measurements", async () => {
  const child = Bun.spawn(
    [emacs, "--batch", "-Q", "--script", benchmarkPath],
    {
      cwd: projectDirectory,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BUN: process.execPath,
        ELISCRIPT_BENCHMARK_SIZE: "200",
        ELISCRIPT_BENCHMARK_ROUNDS: "2",
        ELISCRIPT_BENCHMARK_ITERATIONS: "3",
      },
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim());

  const report = JSON.parse(stdout);
  expect(report.protocolVersion).toBe(1);
  expect(report.workload).toMatchObject({
    name: "score-values",
    size: 200,
    rounds: 2,
    iterations: 3,
  });
  expect(report.workload.checksum).toBeNumber();
  for (const value of Object.values(report.timingsMs)) {
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(report.samples.emacs).toHaveLength(3);
  expect(report.samples.worker).toHaveLength(3);
  expect(report.samples.worker[0].timing.executionMs)
    .toBeGreaterThanOrEqual(0);
}, 20_000);
