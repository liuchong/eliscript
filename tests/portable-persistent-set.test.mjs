import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
const projectBuilder = resolve(projectDirectory, "bin/eliscript-build");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const mapSource = resolve(projectDirectory, "stdlib/persistent-map.eli");
const setSource = resolve(projectDirectory, "stdlib/persistent-set.eli");
const generatedModule = resolve(
  projectDirectory,
  "dist/stdlib/persistent-set.mjs",
);
const emacs = process.env.EMACS ?? "emacs";
let generatedModuleBuild;

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
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

async function importGeneratedModule(label) {
  generatedModuleBuild ??= runSuccessful([
    projectBuilder,
    "--root",
    resolve(projectDirectory, "stdlib"),
    "--out-dir",
    resolve(projectDirectory, "dist/stdlib"),
    setSource,
  ]);
  await generatedModuleBuild;
  return import(`${pathToFileURL(generatedModule).href}?${label}=${Date.now()}`);
}

function integerHash(value) {
  let word = value >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  return (word ^ (word >>> 16)) >>> 0;
}

function objectHash(value) {
  return integerHash(value.id);
}

const sameObjectKey = (left, right) => left.id === right.id;

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

function countItems(item) {
  if (item == null) return 0;
  if (item.kind === "entry") return 1;
  const children = item.kind === "bitmap"
    ? item.items
    : item.kind === "array"
      ? item.children
      : item.entries;
  let count = 1;
  for (const child of children) count += countItems(child);
  return count;
}

function sharedItems(left, right) {
  if (left == null || right == null) return 0;
  if (left === right) return countItems(left);
  if (left.kind !== right.kind || left.kind === "entry") return 0;
  const leftChildren = left.kind === "bitmap"
    ? left.items
    : left.kind === "array"
      ? left.children
      : left.entries;
  const rightChildren = right.kind === "bitmap"
    ? right.items
    : right.kind === "array"
      ? right.children
      : right.entries;
  let count = 0;
  const width = Math.max(leftChildren.length, rightChildren.length);
  for (let index = 0; index < width; index += 1) {
    count += sharedItems(leftChildren[index], rightChildren[index]);
  }
  return count;
}

function lookupPathLength(item, hash, shift = 0) {
  let current = item;
  let currentShift = shift;
  let length = 0;
  while (current != null) {
    length += 1;
    if (current.kind === "entry" || current.kind === "collision") return length;
    const index = (hash >>> currentShift) & 31;
    if (current.kind === "array") {
      current = current.children[index];
    } else {
      const bit = (1 << index) >>> 0;
      let packed = 0;
      for (let branch = 0; branch < index; branch += 1) {
        if ((current.bitmap & ((1 << branch) >>> 0)) !== 0) packed += 1;
      }
      current = (current.bitmap & bit) === 0 ? null : current.items[packed];
    }
    currentShift += 5;
  }
  return length;
}

test("Eliscript-authored persistent Set compiles and agrees across hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-portable-set-"));
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-set-host.mjs",
  );
  const bunPreload = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const bootstrapDirectory = resolve(directory, "bootstrap");

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    const seedMap = resolve(seedDirectory, "persistent-map.eli");
    const seedSet = resolve(seedDirectory, "persistent-set.mjs");
    const selfHostedMap = resolve(selfHostedDirectory, "persistent-map.eli");
    const selfHostedSet = resolve(selfHostedDirectory, "persistent-set.mjs");

    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      seedMap,
      mapSource,
    ]);
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      seedSet,
      setSource,
    ]);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    for (const [source, output] of [
      [mapSource, selfHostedMap],
      [setSource, selfHostedSet],
    ]) {
      await runSuccessful([
        portableCompiler,
        "--source-map",
        "--output",
        output,
        source,
      ], {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
      });
    }

    for (const [seed, selfHosted] of [
      [seedMap, selfHostedMap],
      [seedSet, selfHostedSet],
    ]) {
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const compiledSet of [seedSet, selfHostedSet]) {
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        compiledSet,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        compiledSet,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      persistent: true,
      count: 100_000,
      rootKind: "array",
      probes: [true, false, true, true],
      originalCount: 100_000,
      originalRetained: true,
      sum: 4_999_950_000,
      noopConj: true,
      noopDisj: true,
      collision: {
        count: 99,
        kind: "collision",
        removed: false,
        retained: true,
      },
      algebra: {
        union: 1_500,
        intersection: 500,
        difference: 500,
        subset: true,
        superset: true,
        disjoint: true,
        equal: true,
      },
      sample: [1, 2, 3],
    });

    const sourceMap = await Bun.file(`${seedSet}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0])
      .toContain("(defportable persistent-set-union");
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("Eliscript-authored persistent Set preserves generated value-key histories", async () => {
  const setModule = await importGeneratedModule("history");
  const {
    empty_persistent_set: emptyPersistentSet,
    persistent_set_count: persistentSetCount,
    persistent_set_has_QMARK_: persistentSetHas,
    persistent_set_conj: persistentSetConj,
    persistent_set_disj: persistentSetDisj,
    persistent_set_reduce: persistentSetReduce,
    persistent_set_to_array: persistentSetToArray,
  } = setModule;
  const random = { value: 0x53455431 };
  let set = emptyPersistentSet(objectHash, sameObjectKey);
  let model = new Set();

  for (let step = 0; step < 20_000; step += 1) {
    const previousSet = set;
    const previousModel = model;
    const id = nextRandom(random) % 5_000;
    const choice = nextRandom(random) % 10;
    if (choice < 6) {
      const existed = model.has(id);
      set = persistentSetConj(set, { id });
      if (existed) expect(set).toBe(previousSet);
      model = new Set(model);
      model.add(id);
    } else if (choice < 8) {
      const existed = model.has(id);
      set = persistentSetDisj(set, { id });
      if (!existed) expect(set).toBe(previousSet);
      model = new Set(model);
      model.delete(id);
    } else {
      expect(persistentSetHas(set, { id })).toBe(model.has(id));
    }

    expect(persistentSetCount(set)).toBe(model.size);
    expect(persistentSetCount(previousSet)).toBe(previousModel.size);
    if (previousModel.size > 0) {
      const previousId = previousModel.values().next().value;
      expect(persistentSetHas(previousSet, { id: previousId })).toBe(true);
    }
    if (step % 500 === 0) {
      expect(persistentSetReduce((count) => count + 1, 0, set))
        .toBe(model.size);
    }
  }

  const values = persistentSetToArray(set)
    .map(({ id }) => id)
    .sort((left, right) => left - right);
  expect(values).toEqual([...model].sort((left, right) => left - right));
}, 60_000);

test("Eliscript-authored persistent Set preserves algebra and HAMT layouts", async () => {
  const setModule = await importGeneratedModule("algebra");
  const {
    empty_persistent_set: emptyPersistentSet,
    persistent_set_count: persistentSetCount,
    persistent_set_has_QMARK_: persistentSetHas,
    persistent_set_conj: persistentSetConj,
    persistent_set_disj: persistentSetDisj,
    persistent_set_from_array: persistentSetFromArray,
    persistent_set_to_array: persistentSetToArray,
    persistent_set_union: persistentSetUnion,
    persistent_set_intersection: persistentSetIntersection,
    persistent_set_difference: persistentSetDifference,
    persistent_set_subset_QMARK_: persistentSetSubset,
    persistent_set_superset_QMARK_: persistentSetSuperset,
    persistent_set_disjoint_QMARK_: persistentSetDisjoint,
    persistent_set_equal_QMARK_: persistentSetEqual,
  } = setModule;
  const hash = (value) => value;
  const equal = (left, right) => left === right;
  const left = persistentSetFromArray(hash, equal, [1, 2, 3, 4]);
  const subset = persistentSetFromArray(hash, equal, [2, 4]);
  const disjoint = persistentSetFromArray(hash, equal, [8, 9]);
  expect(persistentSetUnion(left, subset)).toBe(left);
  expect(persistentSetIntersection(subset, left)).toBe(subset);
  expect(persistentSetDifference(left, disjoint)).toBe(left);
  expect(persistentSetSubset(subset, left)).toBe(true);
  expect(persistentSetSuperset(left, subset)).toBe(true);
  expect(persistentSetDisjoint(left, disjoint)).toBe(true);
  expect(persistentSetEqual(
    left,
    persistentSetFromArray(hash, equal, [4, 3, 2, 1]),
  )).toBe(true);
  expect(persistentSetToArray(persistentSetUnion(subset, disjoint)).sort())
    .toEqual([2, 4, 8, 9]);

  const incompatible = emptyPersistentSet((value) => value, equal);
  expect(persistentSetUnion(left, incompatible)).toBeNull();
  expect(persistentSetIntersection(left, incompatible)).toBeNull();
  expect(persistentSetDifference(left, incompatible)).toBeNull();
  expect(persistentSetSubset(left, incompatible)).toBe(false);
  expect(persistentSetDisjoint(left, incompatible)).toBe(false);

  let layout = emptyPersistentSet(hash, equal);
  for (let value = 0; value < 31; value += 1) {
    layout = persistentSetConj(layout, value);
  }
  expect(layout.map.root).toMatchObject({ kind: "bitmap" });
  layout = persistentSetConj(layout, 31);
  expect(layout.map.root).toMatchObject({ kind: "array", count: 32 });
  for (let value = 0; value < 8; value += 1) {
    layout = persistentSetDisj(layout, value);
  }
  expect(layout.map.root).toMatchObject({ kind: "bitmap" });
  expect(layout.map.root.items).toHaveLength(24);

  let collision = emptyPersistentSet(() => 17, equal);
  for (let value = 0; value < 100; value += 1) {
    collision = persistentSetConj(collision, `collision-${value}`);
  }
  expect(collision.map.root).toMatchObject({ kind: "collision" });
  collision = persistentSetDisj(collision, "collision-50");
  expect(persistentSetCount(collision)).toBe(99);
  expect(persistentSetHas(collision, "collision-50")).toBe(false);
  expect(persistentSetHas(collision, "collision-99")).toBe(true);
}, 30_000);

test("Eliscript-authored persistent Set shares the million-member update path", async () => {
  const setModule = await importGeneratedModule("million");
  const {
    empty_persistent_set: emptyPersistentSet,
    persistent_set_count: persistentSetCount,
    persistent_set_has_QMARK_: persistentSetHas,
    persistent_set_conj: persistentSetConj,
    persistent_set_disj: persistentSetDisj,
  } = setModule;
  const hash = (value) => typeof value === "number" ? value : value.id;
  const equal = (left, right) => typeof left === typeof right &&
    (typeof left === "number" ? left === right : left.id === right.id);
  let set = emptyPersistentSet(hash, equal);
  for (let value = 0; value < 1_000_000; value += 1) {
    set = persistentSetConj(set, value);
  }

  expect(persistentSetConj(set, 500_000)).toBe(set);
  const colliding = { id: 500_000 };
  const added = persistentSetConj(set, colliding);
  const itemCount = countItems(set.map.root);
  const changedPath = lookupPathLength(set.map.root, 500_000);
  expect(persistentSetCount(set)).toBe(1_000_000);
  expect(persistentSetCount(added)).toBe(1_000_001);
  expect(persistentSetHas(set, colliding)).toBe(false);
  expect(persistentSetHas(added, colliding)).toBe(true);
  expect(sharedItems(set.map.root, added.map.root))
    .toBe(itemCount - changedPath);

  const removed = persistentSetDisj(added, colliding);
  expect(persistentSetCount(removed)).toBe(1_000_000);
  expect(persistentSetHas(removed, colliding)).toBe(false);
  expect(persistentSetHas(set, 500_000)).toBe(true);
}, 60_000);
