import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  assoc,
  conj,
  contains,
  count,
  disj,
  dissoc,
  empty,
  get,
  isCollection,
  isMap,
  isSet,
  reduceKV,
  rseq,
} from "../runtime/core/collection.mjs";
import { printValue } from "../runtime/core/data-text.mjs";
import { keyword } from "../runtime/core/identifier.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import {
  EMPTY_SORTED_MAP,
  EMPTY_SORTED_SET,
  PersistentSortedMap,
  PersistentSortedSet,
  emptySortedMapBy,
  emptySortedSetBy,
  isPersistentSortedCollection,
  isPersistentSortedMap,
  isPersistentSortedSet,
  persistentSortedMap,
  persistentSortedMapBy,
  persistentSortedSet,
  persistentSortedSetBy,
  reverseSubsequence,
  sortedComparator,
  sortedSequence,
  sortedSequenceFrom,
  subsequence,
} from "../runtime/core/sorted.mjs";
import {
  inspectPersistentSortedCollection,
  resetSortedMetrics,
  sharedPersistentSortedNodes,
  sortedMetrics,
} from "../runtime/testing/sorted.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const hostFixture = resolve(root, "tests/fixtures/persistent-sorted-host.mjs");
const bunPreload = resolve(root, "tests/fixtures/compiled-eli-bun-preload.mjs");
const nodeLoader = resolve(root, "tests/fixtures/compiled-eli-node-loader.mjs");
const emacs = process.env.EMACS ?? "emacs";
const compilationUnits = [
  ["stdlib/core/sorted.eli", "stdlib/core/sorted.eli"],
  ["tests/fixtures/persistent-sorted.eli", "tests/fixtures/persistent-sorted.mjs"],
];

function numericOrder(left, right) {
  return left - right;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
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

async function compile(command, source, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function compileFamily(command, outputRoot, environment = {}) {
  await mkdir(outputRoot, { recursive: true });
  await symlink(resolve(root, "runtime"), resolve(outputRoot, "runtime"), "dir");
  for (const [source, output] of compilationUnits) {
    await compile(
      command,
      resolve(root, source),
      resolve(outputRoot, output),
      environment,
    );
  }
}

test("persistent sorted maps preserve order immutability and comparator identity", () => {
  expect(PersistentSortedMap.empty()).toBe(EMPTY_SORTED_MAP);
  expect(EMPTY_SORTED_MAP.count).toBe(0);
  expect(() => new PersistentSortedMap()).toThrow(TypeError);
  expect(() => persistentSortedMap(1)).toThrow(
    "persistentSortedMap expects an even number of key/value forms",
  );

  const source = persistentSortedMap(5, "e", 1, "a", 3, "c", 2, "b", 4, "d");
  const updated = source.assoc(3, "C").assoc(6, undefined)
    .assoc(7, null).assoc(8, false);
  expect([...source]).toEqual([[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"]]);
  expect([...updated.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(updated.get(6, "missing")).toBeUndefined();
  expect(updated.get(7, "missing")).toBeNull();
  expect(updated.get(8, "missing")).toBe(false);
  expect(updated.assoc(3, "C")).toBe(updated);
  expect(updated.dissoc(99)).toBe(updated);
  expect(updated.dissoc(3).has(3)).toBe(false);
  expect(source.get(3)).toBe("c");
  expect(Object.isFrozen(source)).toBe(true);

  const nullishSet = persistentSortedSet(null, undefined);
  expect(get(nullishSet, null, "missing")).toBeNull();
  expect(get(nullishSet, undefined, "missing")).toBeUndefined();

  const reverse = persistentSortedMapBy((left, right) => right - left,
    1, "a", 3, "c", 2, "b");
  expect([...reverse.keys()]).toEqual([3, 2, 1]);
  expect([...reverse.keys(false)]).toEqual([1, 2, 3]);
  expect(empty(reverse).count).toBe(0);
  expect(sortedComparator(empty(reverse))).toBe(sortedComparator(reverse));
});

test("persistent sorted sets retain canonical comparator-equivalent values", () => {
  const insensitive = (left, right) =>
    left.toLowerCase().localeCompare(right.toLowerCase());
  const source = persistentSortedSetBy(insensitive, "Beta", "alpha", "ALPHA");
  expect(PersistentSortedSet.empty()).toBe(EMPTY_SORTED_SET);
  expect(() => new PersistentSortedSet()).toThrow(TypeError);
  expect(source.count).toBe(2);
  expect([...source]).toEqual(["alpha", "Beta"]);
  expect(get(source, "ALPHA")).toBe("alpha");
  expect(source.conj("beta")).toBe(source);
  expect(source.disj("BETA").has("Beta")).toBe(false);
  expect([...rseq(source)]).toEqual(["Beta", "alpha"]);
  expect(empty(source).count).toBe(0);
  expect(sortedComparator(empty(source))).toBe(sortedComparator(source));
});

test("sorted collections implement collection value metadata and text protocols", () => {
  const map = persistentSortedMap(2, "b", 1, "a");
  const set = persistentSortedSet(2, 1);
  expect(isPersistentSortedMap(map)).toBe(true);
  expect(isPersistentSortedSet(set)).toBe(true);
  expect(isPersistentSortedCollection(map)).toBe(true);
  expect(isCollection(map)).toBe(true);
  expect(isCollection(set)).toBe(true);
  expect(isMap(map)).toBe(true);
  expect(isSet(set)).toBe(true);
  expect(count(map)).toBe(2);
  expect(contains(map, 1)).toBe(true);
  expect(get(map, 1)).toBe("a");
  expect([...assoc(map, 3, "c")]).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  expect([...dissoc(map, 1)]).toEqual([[2, "b"]]);
  expect([...conj(set, 3)]).toEqual([1, 2, 3]);
  expect([...disj(set, 1)]).toEqual([2]);
  expect(reduceKV(map, (result, key, value) => `${result}${key}${value}`, ""))
    .toBe("1a2b");

  const metadata = persistentHashMap([keyword("source"), "sorted"]);
  const located = withMeta(map, metadata);
  expect(meta(located)).toBe(metadata);
  expect(meta(assoc(located, 3, "c"))).toBe(metadata);
  expect(meta(empty(located))).toBe(metadata);
  expect(printValue(located)).toBe("^{:source \"sorted\"} {1 \"a\" 2 \"b\"}");
  expect(printValue(set)).toBe("#{1 2}");
});

test("hash and sorted collections share exact logical value semantics", () => {
  const hashMap = persistentHashMap([1, "a"], [2, undefined]);
  const sortedMap = persistentSortedMap(2, undefined, 1, "a");
  expect(equalValues(hashMap, sortedMap)).toBe(true);
  expect(equalValues(sortedMap, hashMap)).toBe(true);
  expect(hashValue(hashMap)).toBe(hashValue(sortedMap));

  const hashSet = persistentHashSet(1, 2, 3);
  const sortedSet = persistentSortedSet(3, 1, 2);
  expect(equalValues(hashSet, sortedSet)).toBe(true);
  expect(equalValues(sortedSet, hashSet)).toBe(true);
  expect(hashValue(hashSet)).toBe(hashValue(sortedSet));

  const insensitive = emptySortedMapBy((left, right) =>
    left.toLowerCase().localeCompare(right.toLowerCase())).assoc("A", 1);
  expect(insensitive.assoc("a", 1)).toBe(insensitive);
  expect(equalValues(insensitive, persistentHashMap(["a", 1]))).toBe(false);
  expect(equalValues(persistentHashMap(["a", 1]), insensitive)).toBe(false);
});

test("sorted range queries honor inclusive bounds and direction", () => {
  const map = persistentSortedMap(1, "a", 2, "b", 3, "c", 4, "d", 5, "e");
  const set = persistentSortedSet(1, 2, 3, 4, 5);
  expect([...sortedSequence(map)]).toEqual([...map]);
  expect([...sortedSequence(map, false)]).toEqual([...map.entries(false)]);
  expect([...sortedSequenceFrom(map, 3)]).toEqual([[3, "c"], [4, "d"], [5, "e"]]);
  expect([...sortedSequenceFrom(map, 3, true, false)])
    .toEqual([[4, "d"], [5, "e"]]);
  expect([...sortedSequenceFrom(set, 3, false)]).toEqual([3, 2, 1]);
  expect([...subsequence(map, keyword(">="), 2, keyword("<"), 5)])
    .toEqual([[2, "b"], [3, "c"], [4, "d"]]);
  expect([...subsequence(set, ">", 2)]).toEqual([3, 4, 5]);
  expect([...subsequence(set, "<=", 3)]).toEqual([1, 2, 3]);
  expect([...reverseSubsequence(set, ">", 1, "<=", 4)]).toEqual([4, 3, 2]);
  expect(subsequence(set, ">", 9)).toBeNull();
  expect(() => subsequence(set, ">", 1, ">=", 2)).toThrow(
    /requires a lower/u,
  );
  expect(() => subsequence(set, keyword("bad"), 1)).toThrow(/bound test/u);
  expect(() => sortedSequence(set, "yes")).toThrow(/boolean/u);
});

test("persistent sorted trees agree with a randomized mutable model", () => {
  const random = { value: 0x5eed1234 };
  let map = EMPTY_SORTED_MAP;
  const model = new Map();
  for (let step = 0; step < 20_000; step += 1) {
    const key = nextRandom(random) % 4096;
    if (nextRandom(random) % 10 < 7) {
      const value = nextRandom(random);
      map = map.assoc(key, value);
      model.set(key, value);
    } else {
      map = map.dissoc(key);
      model.delete(key);
    }
    if (step % 251 === 0) {
      const expected = [...model].sort(([left], [right]) => left - right);
      expect([...map]).toEqual(expected);
      expect(inspectPersistentSortedCollection(map).maxBalance).toBeLessThanOrEqual(1);
    }
  }
  expect([...map]).toEqual([...model].sort(([left], [right]) => left - right));
});

test("persistent sorted trees keep height work and copying logarithmic", () => {
  let map = EMPTY_SORTED_MAP;
  for (let key = 0; key < 100_000; key += 1) map = map.assoc(key, key);
  const inspected = inspectPersistentSortedCollection(map);
  expect(inspected).toEqual({
    count: 100_000,
    height: expect.any(Number),
    nodes: 100_000,
    maxBalance: 1,
  });
  expect(inspected.height).toBeLessThanOrEqual(24);

  resetSortedMetrics();
  const updated = map.assoc(50_000, "updated");
  const work = sortedMetrics();
  expect(work.comparisons).toBeLessThanOrEqual(inspected.height);
  expect(work.nodeAllocations).toBeLessThanOrEqual(inspected.height);
  expect(work.rotations).toBe(0);
  expect(sharedPersistentSortedNodes(map, updated))
    .toBeGreaterThan(100_000 - inspected.height - 1);
  expect(map.get(50_000)).toBe(50_000);
  expect(updated.get(50_000)).toBe("updated");

  resetSortedMetrics();
  const removed = map.dissoc(50_000);
  const removalWork = sortedMetrics();
  expect(removalWork.comparisons).toBeLessThanOrEqual(inspected.height);
  expect(removalWork.nodeAllocations).toBeLessThanOrEqual(inspected.height * 2);
  expect(removalWork.rotations).toBeLessThanOrEqual(inspected.height);
  expect(inspectPersistentSortedCollection(removed).maxBalance)
    .toBeLessThanOrEqual(1);
  expect(sharedPersistentSortedNodes(map, removed))
    .toBeGreaterThan(100_000 - inspected.height * 2 - 1);
  expect(removed.has(50_000)).toBe(false);
  expect(map.has(50_000)).toBe(true);
});

test("Eliscript sorted API agrees across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-sorted-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  try {
    await compileFamily(seedCompiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const [, output] of compilationUnits) {
      expect(await Bun.file(resolve(selfHostedDirectory, output)).text())
        .toBe(await Bun.file(resolve(seedDirectory, output)).text());
      expect(await Bun.file(resolve(selfHostedDirectory, `${output}.map`)).text())
        .toBe(await Bun.file(resolve(seedDirectory, `${output}.map`)).text());
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(outputRoot, "tests/fixtures/persistent-sorted.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun", "--preload", bunPreload, hostFixture, modulePath,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        modulePath,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0].map).toEqual([[1, "a"], [2, "b"], [3, "c"], [4, "d"]]);
    expect(reports[0].reverseMap).toEqual([[3, "c"], [2, "b"], [1, "a"]]);
    expect(reports[0].set).toEqual([1, 2, 3, 4]);
    expect(reports[0].reverse).toEqual([4, 3, 2, 1]);
    expect(reports[0].from).toEqual([[4, "d"]]);
    expect(reports[0].subseq).toEqual([[2, "b"], [3, "c"]]);
    expect(reports[0].rsubseq).toEqual([4, 3, 2]);
    expect(reports[0].folded).toBe("1a2b3c4d");
    expect(reports[0].classification).toEqual([true, true, true, true, true, true]);
    expect(reports[0].value).toEqual([true, true, true]);
    expect(reports[0].empty).toEqual([true, true]);
    expect(reports[0].errors).toEqual([
      "persistentSortedMap expects an even number of key/value forms",
      "two-bound subsequence requires a lower :>/:>= bound then an upper :</:<= bound",
      "sortedSequence ascending must be a boolean",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
