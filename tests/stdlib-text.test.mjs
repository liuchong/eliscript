import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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

test("portable text library compiles and executes as an ESM module", async () => {
  const directory = await mkdtemp(resolve(projectDirectory, ".eliscript-text-"));
  const textSource = resolve(projectDirectory, "stdlib/text.eli");
  const usageSource = resolve(projectDirectory, "tests/fixtures/text-usage.eli");
  const textModule = resolve(directory, "text.mjs");
  const usageModule = resolve(directory, "text-usage.mjs");

  try {
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      textModule,
      textSource,
    ]);
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      usageModule,
      usageSource,
    ]);

    const executed = await runSuccessful(["bun", "run", usageModule]);
    expect(JSON.parse(executed)).toEqual({
      empty: true,
      "not-empty": false,
      slice: "bcd",
      "slice-clamped": "abc",
      "slice-reversed": "",
      "starts-at": true,
      "starts-at-negative": false,
      starts: true,
      "starts-missing": false,
      ends: true,
      "ends-too-long": false,
      contains: true,
      "contains-empty": true,
      "contains-missing": false,
      "stripped-prefix": "article",
      "kept-prefix": "article",
      "stripped-suffix": "text",
      "kept-suffix": "text.mjs",
      space: true,
      "letter-space": false,
      trimmed: "Eliscript",
      "trimmed-empty": "",
      blank: true,
      "not-blank": false,
      joined: "a/2/false",
      "joined-empty": "",
      repeated: "ababab",
      "repeat-negative": "",
    });

    const map = await Bun.file(`${textModule}.map`).json();
    expect(map.sourcesContent).toHaveLength(1);
    expect(map.sourcesContent[0]).toContain("(defportable trim");
    expect(map.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
