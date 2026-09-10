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
  index,
  intersection,
  join,
  mapInvert,
  project,
  rename,
  renameKeys,
  select,
  set,
  subset,
  superset,
  union,
} from "../runtime/core/set-algebra.mjs";
import {
  EMPTY_MAP,
  persistentHashMap,
} from "../runtime/core/map.mjs";
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
    "const rows = (value) => [...value].map((row) => Object.fromEntries(row)).sort((a, b) => a.id !== undefined && b.id !== undefined ? a.id - b.id : JSON.stringify(a).localeCompare(JSON.stringify(b)));",
    "const entries = (value) => [...value].map((entry) => [...entry]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));",
    "console.log(JSON.stringify({",
    "  converted: ordered(usage.converted),",
    "  united: ordered(usage.united),",
    "  intersected: ordered(usage.intersected),",
    "  subtracted: ordered(usage.subtracted),",
    "  subset: usage.subset_result,",
    "  superset: usage.superset_result,",
    "  disjoint: usage.disjoint_result,",
    "  selected: rows(usage.selected),",
    "  projected: rows(usage.projected),",
    "  renamed: rows(usage.renamed),",
    "  renamedKeys: Object.fromEntries(usage.renamed_keys),",
    "  indexSizes: [...usage.indexed].map((entry) => entry[1].count).sort(),",
    "  inverted: entries(usage.inverted),",
    "  joined: rows(usage.joined),",
    "  mappedJoined: rows(usage.mapped_joined),",
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

test("relational projection and selection preserve value semantics and metadata", () => {
  const metadata = EMPTY_MAP.assoc("source", "people");
  const ada = persistentHashMap(
    ["id", 1],
    ["name", "Ada"],
    ["team", "compiler"],
  );
  const lin = persistentHashMap(
    ["id", 2],
    ["name", "Lin"],
    ["team", "runtime"],
  );
  const source = withMeta(persistentHashSet(ada, lin), metadata);

  const selected = select((row) => row.get("team") === "compiler", source);
  expect(selected.count).toBe(1);
  expect(selected.has(ada)).toBe(true);
  expect(meta(selected)).toBe(metadata);
  expect(select(() => true, source)).toBe(source);

  const projected = project(source, values("team"));
  expect(projected.count).toBe(2);
  expect(projected.has(persistentHashMap(["team", "compiler"]))).toBe(true);
  expect(projected.has(persistentHashMap(["team", "runtime"]))).toBe(true);
  expect(meta(projected)).toBe(metadata);
});

test("relational rename and inversion handle swaps and traversal collisions", () => {
  const metadata = EMPTY_MAP.assoc("source", "mapping");
  const source = withMeta(persistentHashMap(
    ["left", 1],
    ["right", 2],
    ["stable", 3],
  ), metadata);
  const swapped = renameKeys(source, persistentHashMap(
    ["left", "right"],
    ["right", "left"],
    ["missing", "new"],
  ));
  expect(swapped.get("left")).toBe(2);
  expect(swapped.get("right")).toBe(1);
  expect(swapped.get("stable")).toBe(3);
  expect(swapped.has("missing")).toBe(false);
  expect(meta(swapped)).toBe(metadata);

  const relation = persistentHashSet(source);
  const renamed = rename(relation, persistentHashMap(["stable", "kept"]));
  expect(renamed.has(persistentHashMap(
    ["left", 1],
    ["right", 2],
    ["kept", 3],
  ))).toBe(true);

  const collisionSource = persistentHashMap(
    ["first", "shared"],
    ["second", "shared"],
  );
  let lastKey;
  for (const [key] of collisionSource) lastKey = key;
  const inverted = mapInvert(collisionSource);
  expect(inverted.count).toBe(1);
  expect(inverted.get("shared")).toBe(lastKey);
});

test("relational indexing drives natural and mapped joins", () => {
  const ada = persistentHashMap(
    ["id", 1],
    ["name", "Ada"],
    ["team", "compiler"],
  );
  const lin = persistentHashMap(
    ["id", 2],
    ["name", "Lin"],
    ["team", "runtime"],
  );
  const people = persistentHashSet(ada, lin);
  const grouped = index(people, ["team"]);
  expect(grouped.count).toBe(2);
  expect(grouped.get(persistentHashMap(["team", "compiler"])).has(ada))
    .toBe(true);

  const roles = persistentHashSet(
    persistentHashMap(["id", 1], ["role", "admin"]),
    persistentHashMap(["id", 4], ["role", "guest"]),
  );
  const natural = join(people, roles);
  expect(natural.count).toBe(1);
  expect(natural.has(persistentHashMap(
    ["id", 1],
    ["name", "Ada"],
    ["team", "compiler"],
    ["role", "admin"],
  ))).toBe(true);

  const memberships = persistentHashSet(
    persistentHashMap(["user-id", 2], ["role", "maintainer"]),
  );
  const mapped = join(
    people,
    memberships,
    persistentHashMap(["id", "user-id"]),
  );
  expect(mapped.count).toBe(1);
  expect([...mapped][0].get("name")).toBe("Lin");
  expect([...mapped][0].get("role")).toBe("maintainer");

  const leftSmaller = join(
    persistentHashSet(lin),
    persistentHashSet(
      ...memberships,
      persistentHashMap(["user-id", 9], ["role", "observer"]),
    ),
    persistentHashMap(["id", "user-id"]),
  );
  expect(leftSmaller.count).toBe(1);
  expect([...leftSmaller][0].get("role")).toBe("maintainer");
  expect(join(people, EMPTY_SET).count).toBe(0);
});

test("relational set operations enforce arity and predicate contracts", () => {
  expect(() => select(null, [])).toThrow("select predicate must be a function");
  expect(() => project([])).toThrow("project expects 2 collections");
  expect(() => renameKeys({})).toThrow("renameKeys expects 2 collections");
  expect(() => rename([])).toThrow("rename expects 2 collections");
  expect(() => index([])).toThrow("index expects 2 collections");
  expect(() => mapInvert({}, {})).toThrow("mapInvert expects 1 collection");
  expect(() => join()).toThrow("join expects 2 or 3 relations");
  expect(() => join([], [], {}, {})).toThrow("join expects 2 or 3 relations");
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
      selected: [
        { id: 1, name: "Ada", team: "compiler" },
        { id: 3, name: "Mira", team: "compiler" },
      ],
      projected: [{ team: "compiler" }, { team: "runtime" }],
      renamed: [
        { id: 1, display: "Ada", team: "compiler" },
        { id: 2, display: "Lin", team: "runtime" },
        { id: 3, display: "Mira", team: "compiler" },
      ],
      renamedKeys: { left: 2, right: 1 },
      indexSizes: [1, 2],
      inverted: [[1, "left"], [2, "right"]],
      joined: [{ id: 1, name: "Ada", role: "admin", team: "compiler" }],
      mappedJoined: [{
        id: 2,
        name: "Lin",
        role: "maintainer",
        team: "runtime",
        "user-id": 2,
      }],
    };
    expect(await runUsageHost(process.execPath, usageModule)).toEqual(expected);
    expect(await runUsageHost(process.env.NODE ?? "node", usageModule))
      .toEqual(expected);

    const sourceMap = JSON.parse(await readFile(`${setModule}.map`, "utf8"));
    expect(sourceMap.sourcesContent[0]).toContain("(defun union");
    expect(sourceMap.sourcesContent[0]).toContain("(defun subset?");
    expect(sourceMap.sourcesContent[0]).toContain("(defun join");
    expect(sourceMap.sourcesContent[0]).not.toContain(
      "runtime/core/set-algebra.mjs",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
