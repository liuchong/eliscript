import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { empty } from "../runtime/core/collection.mjs";
import {
  eliscriptSymbol,
  keyword,
} from "../runtime/core/identifier.mjs";
import {
  IMeta,
  IWithMeta,
  meta,
  supportsMetadata,
  varyMeta,
  withMeta,
} from "../runtime/core/metadata.mjs";
import {
  EMPTY_MAP,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import {
  assocBang,
  conjBang,
  persistentBang,
  transient,
} from "../runtime/core/transient.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  inspectPersistentMap,
  sharedPersistentMapNodes,
} from "../runtime/testing/map.mjs";
import {
  inspectPersistentSet,
  sharedPersistentSetNodes,
} from "../runtime/testing/set.mjs";
import {
  inspectPersistentVector,
  sharedPersistentVectorNodes,
} from "../runtime/testing/vector.mjs";

const HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/metadata-host.mjs", import.meta.url),
);

async function runHost(command) {
  const child = Bun.spawn([command, HOST_FIXTURE], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

function mapRange(size) {
  let result = EMPTY_MAP;
  for (let key = 0; key < size; key += 1) {
    result = result.assoc(key, key * 2);
  }
  return result;
}

test("metadata protocols cover symbols and persistent runtime collections", () => {
  const metadata = persistentHashMap(["doc", "root"], ["line", 7]);
  const values = [
    eliscriptSymbol("blog/post"),
    persistentVector("a", "b"),
    persistentHashMap(["a", 1]),
    persistentHashSet("a", "b"),
  ];

  expect(IMeta.name).toBe("IMeta");
  expect(IWithMeta.name).toBe("IWithMeta");
  for (const value of values) {
    expect(supportsMetadata(value)).toBe(true);
    expect(meta(value)).toBeNull();
    const annotated = withMeta(value, metadata);
    expect(annotated).not.toBe(value);
    expect(meta(annotated)).toBe(metadata);
    expect(withMeta(annotated, metadata)).toBe(annotated);
    expect(equalValues(annotated, value)).toBe(true);
    expect(hashValue(annotated)).toBe(hashValue(value));
  }

  expect(supportsMetadata(keyword("blog/post"))).toBe(false);
  expect(supportsMetadata({})).toBe(false);
  expect(meta(keyword("blog/post"))).toBeNull();
  expect(meta(null)).toBeNull();
  expect(() => withMeta(keyword("blog/post"), metadata))
    .toThrow("value does not support metadata");
  expect(() => withMeta(values[0], new Map()))
    .toThrow("metadata must be null or a persistent hash map");
});

test("metadata changes only collection roots and stays out of host values", () => {
  const metadata = persistentHashMap(["source", "metadata.test.mjs"]);
  const vector = persistentVector(...Array.from({ length: 96 }, (_, index) => index));
  const map = mapRange(96);
  const set = persistentHashSet(...Array.from({ length: 96 }, (_, index) => index));
  const annotatedVector = withMeta(vector, metadata);
  const annotatedMap = withMeta(map, metadata);
  const annotatedSet = withMeta(set, metadata);

  expect(sharedPersistentVectorNodes(vector, annotatedVector))
    .toBe(inspectPersistentVector(vector).nodeCount);
  expect(sharedPersistentMapNodes(map, annotatedMap))
    .toBe(inspectPersistentMap(map).nodeCount);
  expect(sharedPersistentSetNodes(set, annotatedSet))
    .toBe(inspectPersistentSet(set).nodeCount);

  expect(annotatedVector.toArray()).toEqual(vector.toArray());
  expect([...annotatedMap.toMap()]).toEqual([...map.toMap()]);
  expect([...annotatedSet.toSet()]).toEqual([...set.toSet()]);
  expect(JSON.stringify(annotatedVector)).toBe(JSON.stringify(vector));
  expect(JSON.stringify(annotatedMap)).toBe(JSON.stringify(map));
  expect(JSON.stringify(annotatedSet)).toBe(JSON.stringify(set));
});

test("persistent updates, empty values, and transients preserve root metadata", () => {
  const metadata = persistentHashMap(["owner", "compiler"]);
  const vector = withMeta(persistentVector(1, 2, 3), metadata);
  const map = withMeta(persistentHashMap(["a", 1], ["b", 2]), metadata);
  const set = withMeta(persistentHashSet("a", "b"), metadata);

  for (const value of [
    vector.assoc(1, 20),
    vector.conj(4),
    vector.pop(),
    empty(vector),
    map.assoc("c", 3),
    map.dissoc("a"),
    empty(map),
    set.conj("c"),
    set.disj("a"),
    empty(set),
  ]) {
    expect(meta(value)).toBe(metadata);
  }

  const editableVector = transient(vector);
  conjBang(editableVector, 4);
  expect(meta(persistentBang(editableVector))).toBe(metadata);

  const editableMap = transient(map);
  assocBang(editableMap, "c", 3);
  expect(meta(persistentBang(editableMap))).toBe(metadata);

  const editableSet = transient(set);
  conjBang(editableSet, "c");
  expect(meta(persistentBang(editableSet))).toBe(metadata);
});

test("varyMeta computes a validated replacement map", () => {
  const original = persistentHashMap(["line", 7]);
  const value = withMeta(eliscriptSymbol("blog/post"), original);
  const changed = varyMeta(
    value,
    (current, key, next) => current.assoc(key, next),
    "line",
    9,
  );

  expect(meta(changed).get("line")).toBe(9);
  expect(meta(value)).toBe(original);
  expect(() => varyMeta(value, null)).toThrow(
    "metadata transform must be a function",
  );
  expect(() => varyMeta(value, () => ({ line: 10 }))).toThrow(
    "metadata must be null or a persistent hash map",
  );
});

test("metadata behavior agrees under Bun and Node", async () => {
  const [bunReport, nodeReport] = await Promise.all([
    runHost("bun"),
    runHost(process.env.NODE ?? "node"),
  ]);
  expect(nodeReport).toEqual(bunReport);
  expect(bunReport).toEqual({
    symbol: { equal: true, hashEqual: true, source: "host" },
    vector: { count: 4, source: "host" },
    map: { count: 2, source: "host" },
    set: { count: 3, source: "host" },
  });
});
