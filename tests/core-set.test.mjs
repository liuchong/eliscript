import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  IReduce,
  isReduced,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  difference,
  disjoint,
  intersection,
  set,
  subset,
  superset,
  union,
} from "../runtime/core/set-algebra.mjs";
import { EMPTY_MAP } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";
import {
  EMPTY_SET,
  PersistentHashSet,
  persistentHashSet,
} from "../runtime/core/set.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";

const ROOT = resolve(import.meta.dir, "..");
const EMACS = process.env.EMACS ??
  "/opt/homebrew/Cellar/emacs-plus@30/30.2/bin/emacs";
const COMPILER = resolve(ROOT, "bin/eliscript");
const USAGE_SOURCE = resolve(ROOT, "tests/fixtures/core-set-usage.eli");

class Values {
  constructor(values) {
    this.values = Object.freeze([...values]);
    Object.freeze(this);
  }
}

extendProtocolType(IReduce, Values, {
  reduce: (source, reducer, initial) => {
    let result = initial;
    for (const value of source.values) {
      result = reducer(result, value);
      if (isReduced(result)) return unreduced(result);
    }
    return result;
  },
});

const values = (...items) => new Values(items);
const ordered = (collection) => [...collection].sort((left, right) =>
  left - right);

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

async function compile(source, output) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([COMPILER, "--source-map", "--output", output, source]);
}

async function runUsageHost(command, module) {
  const source = [
    `const usage = await import(${JSON.stringify(pathToFileURL(module).href)});`,
    "const ordered = (value) => [...value].sort((a, b) => a - b);",
    "console.log(JSON.stringify({",
    "  converted: ordered(usage.converted),",
    "  united: ordered(usage.united),",
    "  intersected: ordered(usage.intersected),",
    "  subtracted: ordered(usage.subtracted),",
    "  subset: usage.subset_result,",
    "  superset: usage.superset_result,",
    "  disjoint: usage.disjoint_result,",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

test("set conversion and union accept protocol sources with value semantics", () => {
  const firstKey = persistentVector("same");
  const equalKey = persistentVector("same");
  const converted = set(values(1, 2, 2, firstKey, equalKey));

  expect(converted).toBeInstanceOf(PersistentHashSet);
  expect(converted.count).toBe(3);
  expect(converted.has(persistentVector("same"))).toBe(true);
  expect(set(converted)).toBe(converted);
  expect(set(null)).toBe(EMPTY_SET);

  const native = new Set([2, 3]);
  const combined = union(converted, native, values(4, 4));
  expect(combined.count).toBe(5);
  expect(combined.has(1)).toBe(true);
  expect(combined.has(4)).toBe(true);
  expect(native).toEqual(new Set([2, 3]));
  expect(union(converted)).toBe(converted);
  expect(union()).toBe(EMPTY_SET);
});

test("intersection and difference preserve left metadata and immutable inputs", () => {
  const metadata = EMPTY_MAP.assoc("owner", "left");
  const left = withMeta(persistentHashSet(1, 2, 3, 4), metadata);
  const native = new Set([3, 4, 5]);

  const common = intersection(left, native, values(4, 5));
  expect(ordered(common)).toEqual([4]);
  expect(meta(common)).toBe(metadata);

  const remaining = difference(left, [2], values(4, 9));
  expect(ordered(remaining)).toEqual([1, 3]);
  expect(meta(remaining)).toBe(metadata);
  expect(ordered(left)).toEqual([1, 2, 3, 4]);
  expect(native).toEqual(new Set([3, 4, 5]));
});

test("set relations are value-semantic and enforce complete arity", () => {
  expect(subset([1, 2], values(3, 2, 1))).toBe(true);
  expect(subset([1, 4], [1, 2, 3])).toBe(false);
  expect(subset([], null)).toBe(true);
  expect(superset(new Set([1, 2, 3]), [2, 3])).toBe(true);
  expect(superset([1], [1, 2])).toBe(false);
  expect(disjoint(values(1, 2), new Set([3, 4]))).toBe(true);
  expect(disjoint([1, 2], [2, 3])).toBe(false);

  expect(() => set()).toThrow("set expects 1 collection");
  expect(() => set([], [])).toThrow("set expects 1 collection");
  expect(() => intersection()).toThrow(
    "intersection expects at least one collection",
  );
  expect(() => difference()).toThrow(
    "difference expects at least one collection",
  );
  expect(() => subset([1])).toThrow("subset expects 2 collections");
  expect(() => superset([1], [2], [3])).toThrow(
    "superset expects 2 collections",
  );
  expect(() => disjoint()).toThrow("disjoint expects 2 collections");
});

test("Eliscript-authored set algebra compiles and agrees across local hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-core-set-"));
  const runtimeLink = resolve(directory, "runtime");
  const setModule = resolve(directory, "stdlib/core/set.mjs");
  const usageModule = resolve(directory, "core-set-usage.mjs");
  try {
    await symlink(resolve(ROOT, "runtime"), runtimeLink, "dir");
    await compile(resolve(ROOT, "stdlib/core/set.eli"), setModule);
    await compile(USAGE_SOURCE, usageModule);

    const expected = {
      converted: [1, 2, 3],
      united: [1, 2, 3, 4, 5],
      intersected: [2, 3],
      subtracted: [1, 3],
      subset: true,
      superset: true,
      disjoint: true,
    };
    expect(await runUsageHost(process.execPath, usageModule)).toEqual(expected);
    expect(await runUsageHost(process.env.NODE ?? "node", usageModule))
      .toEqual(expected);

    const sourceMap = JSON.parse(await readFile(`${setModule}.map`, "utf8"));
    expect(sourceMap.sourcesContent[0]).toContain("(defun union");
    expect(sourceMap.sourcesContent[0]).toContain("(defun subset?");
    expect(sourceMap.sourcesContent[0]).not.toContain(
      "runtime/core/set-algebra.mjs",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
