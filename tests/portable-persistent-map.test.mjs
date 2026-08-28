import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const compiler = resolve(projectDirectory, "bin/eliscript");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const source = resolve(projectDirectory, "stdlib/persistent-map.eli");
const generatedModule = resolve(
  projectDirectory,
  "dist/stdlib/persistent-map.mjs",
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
    compiler,
    "--output",
    generatedModule,
    source,
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
const sameValue = (left, right) => Object.is(left, right);

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

test("Eliscript-authored HAMT Map compiles and agrees across hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-portable-map-"));
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-map-host.mjs",
  );
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedModule = resolve(seedDirectory, "persistent-map.mjs");
  const selfHostedModule = resolve(selfHostedDirectory, "persistent-map.mjs");

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      seedModule,
      source,
    ]);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await runSuccessful([
      portableCompiler,
      "--source-map",
      "--output",
      selfHostedModule,
      source,
    ], {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    expect(await Bun.file(selfHostedModule).text())
      .toBe(await Bun.file(seedModule).text());
    expect(await Bun.file(`${selfHostedModule}.map`).text())
      .toBe(await Bun.file(`${seedModule}.map`).text());

    const reports = [];
    for (const host of ["bun", process.env.NODE ?? "node"]) {
      for (const compiledModule of [seedModule, selfHostedModule]) {
        reports.push(JSON.parse(await runSuccessful([
          host,
          hostFixture,
          compiledModule,
        ])));
      }
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      persistent: true,
      count: 100_000,
      rootKind: "array",
      probes: [0, 93, 96, 3072, 98304, 299997],
      original: 162_963,
      updated: "updated",
      removed: false,
      sum: 14_999_850_000,
      noopAssoc: true,
      noopDissoc: true,
      collision: {
        count: 99,
        kind: "collision",
        removed: false,
        retained: 99,
      },
      sample: [[1, "a"], [2, "b"], [3, "c"]],
    });

    const sourceMap = await Bun.file(`${seedModule}.map`).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0])
      .toContain("(defportable persistent-map-assoc-item");
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("Eliscript-authored HAMT Map preserves generated value-key histories", async () => {
  const mapModule = await importGeneratedModule("history");
  const {
    empty_persistent_map: emptyPersistentMap,
    persistent_map_count: persistentMapCount,
    persistent_map_get: persistentMapGet,
    persistent_map_assoc: persistentMapAssoc,
    persistent_map_dissoc: persistentMapDissoc,
    persistent_map_reduce: persistentMapReduce,
    persistent_map_to_entries: persistentMapToEntries,
  } = mapModule;
  const random = { value: 0x4d415031 };
  let map = emptyPersistentMap(objectHash, sameObjectKey, sameValue);
  let model = new Map();

  for (let step = 0; step < 20_000; step += 1) {
    const previousMap = map;
    const previousModel = model;
    const id = nextRandom(random) % 5_000;
    const choice = nextRandom(random) % 10;
    if (choice < 6) {
      const value = nextRandom(random);
      const existing = model.get(id);
      map = persistentMapAssoc(map, { id }, value);
      if (existing === value) expect(map).toBe(previousMap);
      model = new Map(model);
      model.set(id, value);
    } else if (choice < 8) {
      const existed = model.has(id);
      map = persistentMapDissoc(map, { id });
      if (!existed) expect(map).toBe(previousMap);
      model = new Map(model);
      model.delete(id);
    } else {
      expect(persistentMapGet(map, { id }, "missing"))
        .toBe(model.has(id) ? model.get(id) : "missing");
    }

    expect(persistentMapCount(map)).toBe(model.size);
    expect(persistentMapCount(previousMap)).toBe(previousModel.size);
    if (previousModel.size > 0) {
      const previousId = previousModel.keys().next().value;
      expect(persistentMapGet(previousMap, { id: previousId }, "missing"))
        .toBe(previousModel.get(previousId));
    }
    if (step % 500 === 0) {
      expect(persistentMapReduce((count) => count + 1, 0, map))
        .toBe(model.size);
    }
  }

  const entries = persistentMapToEntries(map)
    .map(([key, value]) => [key.id, value])
    .sort((left, right) => left[0] - right[0]);
  expect(entries).toEqual([...model.entries()].sort((left, right) => left[0] - right[0]));
}, 60_000);

test("Eliscript-authored HAMT Map promotes and demotes measured layouts", async () => {
  const mapModule = await importGeneratedModule("layouts");
  const {
    empty_persistent_map: emptyPersistentMap,
    persistent_map_assoc: persistentMapAssoc,
    persistent_map_dissoc: persistentMapDissoc,
    persistent_map_get: persistentMapGet,
  } = mapModule;
  const equal = (left, right) => left === right;
  let map = emptyPersistentMap((value) => value, equal, equal);
  for (let key = 0; key < 31; key += 1) map = persistentMapAssoc(map, key, key);
  expect(map.root).toMatchObject({ kind: "bitmap" });
  expect(map.root.items).toHaveLength(31);

  map = persistentMapAssoc(map, 31, 31);
  expect(map.root).toMatchObject({ kind: "array", count: 32 });
  expect(map.root.children).toHaveLength(32);

  for (let key = 0; key < 7; key += 1) map = persistentMapDissoc(map, key);
  expect(map.root).toMatchObject({ kind: "array", count: 25 });
  map = persistentMapDissoc(map, 7);
  expect(map.root).toMatchObject({ kind: "bitmap" });
  expect(map.root.items).toHaveLength(24);
  expect(persistentMapGet(map, 31, "missing")).toBe(31);
}, 30_000);

test("Eliscript-authored HAMT Map shares the million-key update path", async () => {
  const mapModule = await importGeneratedModule("million");
  const {
    empty_persistent_map: emptyPersistentMap,
    persistent_map_count: persistentMapCount,
    persistent_map_get: persistentMapGet,
    persistent_map_assoc: persistentMapAssoc,
    persistent_map_dissoc: persistentMapDissoc,
  } = mapModule;
  const equal = (left, right) => left === right;
  let map = emptyPersistentMap((value) => value, equal, equal);
  for (let key = 0; key < 1_000_000; key += 1) {
    map = persistentMapAssoc(map, key, key);
  }

  const updated = persistentMapAssoc(map, 500_000, -1);
  const hash = 500_000 >>> 0;
  const itemCount = countItems(map.root);
  const changedPath = lookupPathLength(map.root, hash);
  expect(persistentMapCount(map)).toBe(1_000_000);
  expect(persistentMapGet(map, 500_000, "missing")).toBe(500_000);
  expect(persistentMapGet(updated, 500_000, "missing")).toBe(-1);
  expect(sharedItems(map.root, updated.root)).toBe(itemCount - changedPath);

  const removed = persistentMapDissoc(updated, 750_000);
  expect(persistentMapCount(removed)).toBe(999_999);
  expect(persistentMapGet(removed, 750_000, "missing")).toBe("missing");
  expect(persistentMapGet(map, 750_000, "missing")).toBe(750_000);
}, 60_000);
