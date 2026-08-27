import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
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

test("portable sequence library compiles and executes as an ESM module", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-sequence-"));
  const sequenceSource = resolve(projectDirectory, "stdlib/sequence.eli");
  const usageSource = resolve(
    projectDirectory,
    "tests/fixtures/sequence-usage.eli",
  );
  const sequenceModule = resolve(directory, "sequence.mjs");
  const usageModule = resolve(directory, "sequence-usage.mjs");

  try {
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      sequenceModule,
      sequenceSource,
    ]);
    const output = await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      usageModule,
      usageSource,
    ]);
    expect(output).toBe("");

    const executed = await runSuccessful(["bun", "run", usageModule]);
    expect(JSON.parse(executed)).toEqual({
      values: [1, 2, 3, 4, 5],
      reversed: [5, 4, 3, 2, 1],
      mapped: [2, 4, 6, 8, 10],
      filtered: [2, 4],
      reduced: 15,
      concatenated: [1, 2, 3, 4],
      descending: [5, 3, 1],
      "zero-step": [],
      taken: [1, 2, 3],
      dropped: [4, 5],
      "take-many": [1, 2, 3, 4, 5],
      "take-negative": [],
      "drop-negative": [1, 2, 3, 4, 5],
      some: true,
      every: true,
      found: 4,
      "empty-map": [],
      "empty-filter": [],
      "empty-reduce": 7,
      "empty-some": false,
      "empty-every": true,
      missing: null,
    });

    const map = await Bun.file(`${sequenceModule}.map`).json();
    expect(map.sourcesContent).toHaveLength(1);
    expect(map.sourcesContent[0]).toContain("(defportable map");
    expect(map.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
