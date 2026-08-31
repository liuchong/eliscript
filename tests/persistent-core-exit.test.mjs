import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const projectBuilder = resolve(projectDirectory, "bin/eliscript-build");
const fixture = resolve(
  projectDirectory,
  "tests/fixtures/persistent-core-exit-host.mjs",
);
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    env: { ...process.env, EMACS: emacs },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

test("persistent collection core closes its all-host million-value exit gate", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-p1-exit-"));
  try {
    await runSuccessful([
      projectBuilder,
      "--root",
      resolve(projectDirectory, "stdlib"),
      "--out-dir",
      directory,
      resolve(projectDirectory, "stdlib/value.eli"),
    ]);

    for (const collection of ["vector", "map", "set"]) {
      const reports = [];
      for (const host of [process.execPath, process.env.NODE ?? "node"]) {
        reports.push(JSON.parse(await runSuccessful([
          host,
          fixture,
          directory,
          collection,
        ])));
      }
      expect(reports[1]).toEqual(reports[0]);

      const report = reports[0];
      expect(report.count).toBe(1_000_000);
      expect(report.probes).toEqual(collection === "set"
        ? [true, true, true, true, true, true, true]
        : [0, 31, 32, 1_024, 32_768, 500_000, 999_999]);
      expect(report.changedPath).toBeLessThanOrEqual(8);
      expect(report.sharedNodes ?? report.sharedItems)
        .toBe((report.nodeCount ?? report.itemCount) - report.changedPath);

      if (collection === "vector") {
        expect(report).toMatchObject({
          shift: 15,
          tailLength: 32,
          changedPath: 4,
          original: 500_000,
          updated: -1,
        });
      } else if (collection === "map") {
        expect(report).toMatchObject({
          rootKind: "array",
          original: 500_000,
          updated: -1,
          removedCount: 999_999,
          removed: "missing",
          originalRetained: 750_000,
        });
      } else {
        expect(report).toMatchObject({
          rootKind: "array",
          noopConj: true,
          addedCount: 1_000_001,
          originalCollisionAbsent: true,
          collisionPresent: true,
          removedCount: 1_000_000,
          collisionRemoved: true,
          originalRetained: true,
        });
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
