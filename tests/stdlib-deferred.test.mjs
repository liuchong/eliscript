import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dir, "..");
const BUILD = resolve(ROOT, "bin/eliscript-build");
const COMPILER = resolve(ROOT, "bin/eliscript");
const EMACS = process.env.EMACS ?? "emacs";

async function runSuccessful(command) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, EMACS },
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

test("deferred computations compile and agree across local hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-deferred-"));
  const outputRoot = resolve(directory, "stdlib");
  const usageModule = resolve(directory, "deferred-usage.mjs");
  try {
    const report = JSON.parse(await runSuccessful([
      BUILD,
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      resolve(ROOT, "stdlib/deferred.eli"),
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 1,
      counts: { modules: 7, compiled: 7, reused: 0 },
      entry: "deferred.eli",
      entryOutput: "deferred.mjs",
    });
    await runSuccessful([
      COMPILER,
      "--source-map",
      "--output",
      usageModule,
      resolve(ROOT, "tests/fixtures/deferred-usage.eli"),
    ]);

    const expected = {
      delay: {
        recognized: true,
        before: false,
        after: true,
        same: true,
        value: [20, 22],
        calls: 1,
        passthrough: 9,
      },
      memo: {
        first: 42,
        second: 42,
        undefined: true,
        calls: 2,
      },
    };
    for (const host of [process.execPath, process.env.NODE_BINARY ?? "node"]) {
      expect(JSON.parse(await runSuccessful([host, usageModule]))).toEqual(expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("delay and memoize retry failures without caching partial state", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-deferred-"));
  const outputRoot = resolve(directory, "stdlib");
  try {
    await runSuccessful([
      BUILD,
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      resolve(ROOT, "stdlib/deferred.eli"),
    ]);
    const module = await import(
      `${pathToFileURL(resolve(outputRoot, "deferred.mjs")).href}?failures`
    );

    const forged = {
      kind: "eliscript/delay",
      realized: () => true,
      force: () => 42,
    };
    expect(module.delay_QMARK_(forged)).toBe(false);
    expect(module.realized_QMARK_(forged)).toBe(false);
    expect(module.realized_QMARK_(9)).toBe(false);
    expect(module.force(forged)).toBe(forged);

    let attempts = 0;
    const retried = module.delay(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("retry");
      return false;
    });
    expect(Object.isFrozen(retried)).toBe(true);
    expect(() => module.force(retried)).toThrow("retry");
    expect(module.realized_QMARK_(retried)).toBe(false);
    expect(module.force(retried)).toBe(false);
    expect(module.force(retried)).toBe(false);
    expect(attempts).toBe(2);

    let undefinedCalls = 0;
    const undefinedDelay = module.delay(() => {
      undefinedCalls += 1;
      return undefined;
    });
    expect(module.force(undefinedDelay)).toBeUndefined();
    expect(module.force(undefinedDelay)).toBeUndefined();
    expect(module.realized_QMARK_(undefinedDelay)).toBe(true);
    expect(undefinedCalls).toBe(1);

    let recursive;
    recursive = module.delay(() => module.force(recursive));
    try {
      module.force(recursive);
      throw new Error("expected recursive force to fail");
    } catch (error) {
      expect(error.code).toBe("ELI-DEFERRED-REENTRANT-FORCE");
    }
    expect(module.realized_QMARK_(recursive)).toBe(false);

    let memoAttempts = 0;
    const cached = module.memoize((value) => {
      memoAttempts += 1;
      if (memoAttempts === 1) throw new Error("memo retry");
      return value;
    });
    expect(() => cached(null)).toThrow("memo retry");
    expect(cached(null)).toBeNull();
    expect(cached(null)).toBeNull();
    expect(memoAttempts).toBe(2);

    for (const [operation, code] of [
      [() => module.delay(1), "ELI-DEFERRED-INVALID-PRODUCER"],
      [() => module.memoize(null), "ELI-DEFERRED-INVALID-FUNCTION"],
    ]) {
      try {
        operation();
        throw new Error("expected invalid deferred operation to fail");
      } catch (error) {
        expect(error.code).toBe(code);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
