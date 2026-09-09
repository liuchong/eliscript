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

test("portable function combinators compile and agree across local hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-function-"));
  const outputRoot = resolve(directory, "stdlib");
  const usageModule = resolve(directory, "function-usage.mjs");
  try {
    const report = JSON.parse(await runSuccessful([
      BUILD,
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      resolve(ROOT, "stdlib/function.eli"),
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 1,
      counts: { modules: 2, compiled: 2, reused: 0 },
      entry: "function.eli",
      entryOutput: "function.mjs",
    });
    await runSuccessful([
      COMPILER,
      "--source-map",
      "--output",
      usageModule,
      resolve(ROOT, "tests/fixtures/function-usage.eli"),
    ]);

    const expected = {
      identity: 7,
      constant: "fixed",
      complement: true,
      composition: 14,
      partial: 10,
      juxt: [6, 4],
      fnil: [10, true, 3],
      every: true,
      some: 0,
      trampoline: 100000,
    };
    for (const host of [process.execPath, process.env.NODE_BINARY ?? "node"]) {
      expect(JSON.parse(await runSuccessful([host, usageModule]))).toEqual(expected);
    }

    const module = await import(
      `${pathToFileURL(resolve(outputRoot, "function.mjs")).href}?direct`
    );
    const function_ = (...values) => values;
    expect(module.comp()).toBe(module.identity);
    expect(module.comp(function_)).toBe(function_);
    expect(module.partial(function_)).toBe(function_);
    expect(module.fnil(function_, 10, 20)(null, undefined, 3))
      .toEqual([10, undefined, 3]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("predicate combinators preserve Lisp truth and short-circuit order", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-function-"));
  const outputRoot = resolve(directory, "stdlib");
  try {
    await runSuccessful([
      BUILD,
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      resolve(ROOT, "stdlib/function.eli"),
    ]);
    const module = await import(
      `${pathToFileURL(resolve(outputRoot, "function.mjs")).href}?predicates`
    );
    const calls = [];
    const all = module.every_pred(
      (value) => {
        calls.push(`first:${value}`);
        return value < 3 ? 0 : false;
      },
      (value) => {
        calls.push(`second:${value}`);
        return true;
      },
    );
    expect(all(1, 2, 3, 4)).toBe(false);
    expect(calls).toEqual(["first:1", "first:2", "first:3"]);

    calls.length = 0;
    const any = module.some_fn(
      (value) => {
        calls.push(`first:${value}`);
        return value === 2 ? "" : null;
      },
      (value) => {
        calls.push(`second:${value}`);
        return "late";
      },
    );
    expect(any(1, 2, 3)).toBe("");
    expect(calls).toEqual(["first:1", "first:2"]);
    expect(module.every_pred()()).toBe(true);
    expect(module.some_fn()()).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
