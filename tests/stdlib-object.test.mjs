import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
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

test("portable object library preserves immutable own-property semantics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-object-"));
  const objectSource = resolve(projectDirectory, "stdlib/object.eli");
  const usageSource = resolve(projectDirectory, "tests/fixtures/object-usage.eli");
  const objectModule = resolve(directory, "object.mjs");
  const usageModule = resolve(directory, "object-usage.mjs");

  try {
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      objectModule,
      objectSource,
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
      keys: ["name", "count", "ready", "empty"],
      "nil-keys": [],
      "has-name": true,
      "has-missing": false,
      "nil-has": false,
      "from-nil": { created: true },
      associated: { name: "Eliscript", count: 3, ready: false, empty: null },
      dissociated: { count: 2, ready: false, empty: null },
      "dissociated-empty": {},
      merged: {
        name: "Eliscript",
        count: 7,
        ready: false,
        empty: null,
        extra: "new",
      },
      "merged-empty": {},
      mapped: { first: 4, second: 8 },
      filtered: { name: "Eliscript", count: 2, ready: false },
      picked: { ready: false, name: "Eliscript" },
      "picked-empty": {},
      omitted: { name: "Eliscript", ready: false },
      updated: { name: "Eliscript", count: 7, ready: false, empty: null },
      "source-unchanged": true,
      "source-has-no-extra": true,
    });

    const objectLibrary = await import(pathToFileURL(objectModule).href);
    const portable = objectLibrary.__eliscript_portable__;
    const inherited = Object.create({ inherited: 1 });
    inherited.own = 2;
    expect(portable["has?"](inherited, "inherited")).toBe(false);
    expect(portable["has?"](inherited, "own")).toBe(true);
    expect(portable.keys(inherited)).toEqual(["own"]);
    const changed = portable.assoc(inherited, "own", 3);
    expect(inherited.own).toBe(2);
    expect(changed.own).toBe(3);

    const map = await Bun.file(`${objectModule}.map`).json();
    expect(map.sourcesContent).toHaveLength(1);
    expect(map.sourcesContent[0]).toContain("(defportable assoc");
    expect(map.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
