import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  assoc,
  conj,
  count,
  sequenceView,
} from "../runtime/core/collection.mjs";
import {
  EMPTY_MAP,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import {
  EMPTY_SET,
  persistentHashSet,
} from "../runtime/core/set.mjs";
import {
  IEditable,
  ITransientCollection,
  assocBang,
  conjBang,
  dissocBang,
  persistentBang,
  transient,
} from "../runtime/core/transient.mjs";
import { into } from "../runtime/core/transducer.mjs";
import {
  EMPTY_VECTOR,
  PersistentVector,
  persistentVector,
} from "../runtime/core/vector.mjs";
import {
  implementsProtocolOperation,
} from "../runtime/core/protocol.mjs";
import { hashValue } from "../runtime/core/value.mjs";
import {
  inspectPersistentMap,
  inspectTransientMap,
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  transientMapMetrics,
} from "../runtime/testing/map.mjs";
import {
  inspectTransientSet,
  resetPersistentSetMetrics,
  resetTransientSetMetrics,
  transientSetMetrics,
} from "../runtime/testing/set.mjs";
import {
  inspectTransientVector,
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
  resetTransientVectorMetrics,
  transientVectorMetrics,
} from "../runtime/testing/vector.mjs";

const HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/transient-host.mjs", import.meta.url),
);

function vectorRange(size) {
  let result = EMPTY_VECTOR;
  for (let value = 0; value < size; value += 1) {
    result = result.conj(value);
  }
  return result;
}

function mapRange(size) {
  let result = EMPTY_MAP;
  for (let key = 0; key < size; key += 1) {
    result = result.assoc(key, key * 2);
  }
  return result;
}

function rangeSequence(size, transform = (value) => value) {
  return sequenceView(() => (function* values() {
    for (let value = 0; value < size; value += 1) {
      yield transform(value);
    }
  })(), size);
}

function distinctRootKeys(size) {
  const keys = new Map();
  for (let candidate = 0; keys.size < size; candidate += 1) {
    const branch = hashValue(candidate) & 31;
    if (!keys.has(branch)) {
      keys.set(branch, candidate);
    }
  }
  return [...keys.values()];
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

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

test("transient protocols expose only each collection's editable capabilities", () => {
  expect(Object.isFrozen(IEditable)).toBe(true);
  expect(Object.isFrozen(ITransientCollection)).toBe(true);
  expect(() => transient([])).toThrow();

  const vector = transient(EMPTY_VECTOR);
  const map = transient(EMPTY_MAP);
  const set = transient(EMPTY_SET);

  for (const value of [EMPTY_VECTOR, EMPTY_MAP, EMPTY_SET]) {
    expect(implementsProtocolOperation(IEditable, "transient", value)).toBe(true);
  }
  expect(implementsProtocolOperation(ITransientCollection, "conj!", vector))
    .toBe(true);
  expect(implementsProtocolOperation(ITransientCollection, "assoc!", vector))
    .toBe(true);
  expect(implementsProtocolOperation(ITransientCollection, "dissoc!", vector))
    .toBe(false);
  expect(implementsProtocolOperation(ITransientCollection, "assoc!", map))
    .toBe(true);
  expect(implementsProtocolOperation(ITransientCollection, "dissoc!", map))
    .toBe(true);
  expect(implementsProtocolOperation(ITransientCollection, "assoc!", set))
    .toBe(false);
  expect(implementsProtocolOperation(ITransientCollection, "dissoc!", set))
    .toBe(true);

  expect(() => dissocBang(vector, 0)).toThrow();
  expect(() => assocBang(set, "value", true)).toThrow();
  expect(() => assocBang(map, "safe", 1, "dangling")).toThrow(
    "assocBang requires a transient collection followed by one or more key/value pairs",
  );
  expect([...persistentBang(map)]).toEqual([]);
  persistentBang(vector);
  persistentBang(set);
});

test("transient vectors convert in O(1), own touched paths, and invalidate exactly", () => {
  const source = vectorRange(4096);
  resetPersistentVectorMetrics();
  resetTransientVectorMetrics();

  const editable = transient(source);
  expect(inspectTransientVector(editable)).toMatchObject({
    active: true,
    count: 4096,
    ownedNodeCount: 0,
    sharesSourceRoot: true,
    sharesSourceTail: true,
  });
  expect(persistentVectorMetrics()).toMatchObject({
    nodeAllocations: 0,
    tailAllocations: 0,
  });

  assocBang(editable, 1000, "first");
  const first = transientVectorMetrics();
  expect(first.nodeClones).toBeGreaterThan(0);
  expect(inspectTransientVector(editable).ownedNodeCount).toBe(first.nodeClones);
  assocBang(editable, 1000, "second");
  expect(transientVectorMetrics().nodeClones).toBe(first.nodeClones);
  conjBang(editable, "tail-a", "tail-b");
  expect(transientVectorMetrics().tailCopies).toBe(1);
  expect(source.nth(1000)).toBe(1000);
  expect(source.count).toBe(4096);

  const result = persistentBang(editable);
  expect(result).toBeInstanceOf(PersistentVector);
  expect(result.nth(1000)).toBe("second");
  expect(result.nth(4096)).toBe("tail-a");
  expect(result.nth(4097)).toBe("tail-b");
  expect(transientVectorMetrics().persistentCalls).toBe(1);
  for (const operation of [
    () => conjBang(editable, 1),
    () => assocBang(editable, 0, 1),
    () => persistentBang(editable),
  ]) {
    expect(operation).toThrow("transient vector is no longer editable");
  }
  expect(transientVectorMetrics().invalidCalls).toBe(3);

  const unchanged = transient(source);
  expect(persistentBang(unchanged)).toBe(source);
});

test("transient maps preserve HAMT collisions and dense/sparse transitions", () => {
  const source = mapRange(4096);
  resetPersistentMapMetrics();
  resetTransientMapMetrics();
  const editable = transient(source);
  expect(inspectTransientMap(editable)).toMatchObject({
    active: true,
    count: 4096,
    ownedNodeCount: 0,
    sharesSourceRoot: true,
  });
  expect(persistentMapMetrics().nodeAllocations).toBe(0);

  assocBang(editable, 1000, 2000);
  expect(transientMapMetrics().nodeClones).toBe(0);
  assocBang(editable, 1000, "first");
  const clones = transientMapMetrics().nodeClones;
  expect(clones).toBeGreaterThan(0);
  assocBang(editable, 1000, "second");
  expect(transientMapMetrics().nodeClones).toBe(clones);
  dissocBang(editable, 2000, "missing");
  expect(source.get(1000)).toBe(2000);
  expect(source.has(2000)).toBe(true);
  const result = persistentBang(editable);
  expect(result.get(1000)).toBe("second");
  expect(result.has(2000)).toBe(false);

  const left = "key-50691";
  const right = "key-194634";
  expect(hashValue(left)).toBe(hashValue(right));
  const collision = transient(persistentHashMap([left, 1], [right, 2]));
  assocBang(collision, right, 3);
  dissocBang(collision, left);
  const collisionResult = persistentBang(collision);
  expect(collisionResult.count).toBe(1);
  expect(collisionResult.get(right)).toBe(3);

  const keys = distinctRootKeys(32);
  const dense = transient(EMPTY_MAP);
  for (const key of keys) {
    assocBang(dense, key, key);
  }
  for (const key of keys.slice(0, 8)) {
    dissocBang(dense, key);
  }
  const sparse = persistentBang(dense);
  expect(sparse.count).toBe(24);
  expect(inspectPersistentMap(sparse)).toMatchObject({
    arrayNodes: 0,
    bitmapNodes: 1,
  });

  const emptied = transient(persistentHashMap(["only", 1]));
  dissocBang(emptied, "only");
  expect(persistentBang(emptied)).toBe(EMPTY_MAP);
});

test("transient sets reuse the map owner path and retain source values", () => {
  const source = persistentHashSet(...Array.from({ length: 2048 }, (_, value) => value));
  resetPersistentSetMetrics();
  resetTransientSetMetrics();
  const editable = transient(source);
  expect(inspectTransientSet(editable)).toMatchObject({
    active: true,
    count: 2048,
    ownedNodeCount: 0,
    sharesSourceRoot: true,
  });
  conjBang(editable, 2048, 2049, 1000);
  dissocBang(editable, 0, "missing");
  expect(source.has(0)).toBe(true);
  expect(source.has(2048)).toBe(false);
  const result = persistentBang(editable);
  expect(result.count).toBe(2049);
  expect(result.has(0)).toBe(false);
  expect(result.has(2049)).toBe(true);
  expect(transientSetMetrics()).toMatchObject({
    persistentCalls: 1,
    setPersistentCalls: 1,
  });
  expect(() => conjBang(editable, 1)).toThrow(
    "transient hash set is no longer editable",
  );
  expect(transientSetMetrics().setInvalidCalls).toBe(1);

  const unchanged = transient(source);
  conjBang(unchanged, 1000);
  dissocBang(unchanged, "missing");
  expect(persistentBang(unchanged)).toBe(source);

  const emptied = transient(persistentHashSet("only"));
  dissocBang(emptied, "only");
  expect(persistentBang(emptied)).toBe(EMPTY_SET);
});

test("successive transient owners preserve every committed generation", () => {
  const random = { value: 0x24ac_91f7 };
  let map = EMPTY_MAP;
  let set = EMPTY_SET;
  const referenceMap = new Map();
  const referenceSet = new Set();
  const generations = [];

  for (let batch = 0; batch < 20; batch += 1) {
    const editableMap = transient(map);
    const editableSet = transient(set);
    for (let operation = 0; operation < 1000; operation += 1) {
      const key = nextRandom(random) % 4096;
      if ((nextRandom(random) & 3) === 0) {
        dissocBang(editableMap, key);
        dissocBang(editableSet, key);
        referenceMap.delete(key);
        referenceSet.delete(key);
      } else {
        const value = nextRandom(random) >>> 0;
        assocBang(editableMap, key, value);
        conjBang(editableSet, key);
        referenceMap.set(key, value);
        referenceSet.add(key);
      }
    }
    const previousMap = map;
    const previousSet = set;
    map = persistentBang(editableMap);
    set = persistentBang(editableSet);
    generations.push({
      map: previousMap,
      mapEntries: [...previousMap],
      set: previousSet,
      setValues: [...previousSet],
    });
  }

  expect(new Map(map)).toEqual(referenceMap);
  expect(new Set(set)).toEqual(referenceSet);
  for (const generation of generations) {
    expect([...generation.map]).toEqual(generation.mapEntries);
    expect([...generation.set]).toEqual(generation.setValues);
  }
});

test("transients reject persistent APIs, serialization, and use after completion", () => {
  for (const editable of [
    transient(EMPTY_VECTOR),
    transient(EMPTY_MAP),
    transient(EMPTY_SET),
  ]) {
    expect(() => count(editable)).toThrow();
    expect(() => conj(editable, 1)).toThrow();
    expect(() => assoc(editable, 0, 1)).toThrow();
    expect(() => JSON.stringify(editable)).toThrow("cannot be serialized");
    expect(() => structuredClone(editable)).toThrow();
    persistentBang(editable);
  }
});

test("into selects transient builders and reduces persistent allocation volume", () => {
  const vectorSize = 100_000;
  resetPersistentVectorMetrics();
  vectorRange(vectorSize);
  const persistentVectorAllocations = persistentVectorMetrics().nodeAllocations;
  resetPersistentVectorMetrics();
  resetTransientVectorMetrics();
  const vector = into(EMPTY_VECTOR, rangeSequence(vectorSize));
  expect(vector.count).toBe(vectorSize);
  expect(vector.nth(vectorSize - 1)).toBe(vectorSize - 1);
  expect(persistentVectorMetrics().nodeAllocations)
    .toBeLessThan(persistentVectorAllocations / 3);
  expect(transientVectorMetrics().persistentCalls).toBe(1);

  const associativeSize = 50_000;
  resetPersistentMapMetrics();
  mapRange(associativeSize);
  const persistentMapAllocations = persistentMapMetrics().nodeAllocations;
  resetPersistentMapMetrics();
  resetTransientMapMetrics();
  const map = into(
    EMPTY_MAP,
    rangeSequence(associativeSize, (key) => [key, key * 2]),
  );
  expect(map.count).toBe(associativeSize);
  expect(map.get(associativeSize - 1)).toBe((associativeSize - 1) * 2);
  expect(persistentMapMetrics().nodeAllocations)
    .toBeLessThan(persistentMapAllocations / 3);
  expect(transientMapMetrics().persistentCalls).toBe(1);

  resetPersistentSetMetrics();
  for (let value = 0, set = EMPTY_SET; value < associativeSize; value += 1) {
    set = set.conj(value);
  }
  const persistentSetAllocations = persistentMapMetrics().nodeAllocations;
  resetPersistentSetMetrics();
  resetTransientSetMetrics();
  const set = into(EMPTY_SET, rangeSequence(associativeSize));
  expect(set.count).toBe(associativeSize);
  expect(set.has(associativeSize - 1)).toBe(true);
  expect(persistentMapMetrics().nodeAllocations)
    .toBeLessThan(persistentSetAllocations / 3);
  expect(transientSetMetrics().setPersistentCalls).toBe(1);
});

test("transient vector construction remains bounded at one million values", () => {
  resetPersistentVectorMetrics();
  resetTransientVectorMetrics();
  const size = 1_000_000;
  const vector = into(EMPTY_VECTOR, rangeSequence(size));
  expect(vector.count).toBe(size);
  expect(vector.nth(0)).toBe(0);
  expect(vector.nth(size - 1)).toBe(size - 1);
  expect(persistentVectorMetrics().nodeAllocations).toBeLessThan(40_000);
  expect(transientVectorMetrics().nodeClones).toBe(1);
  expect(transientVectorMetrics().persistentCalls).toBe(1);
});

test("transient behavior agrees under Bun and Node", async () => {
  const expected = {
    vector: [9, 2, 3, 4],
    map: [["left", 3], ["right", 2]],
    set: ["right"],
  };
  expect(await runHost(process.execPath)).toEqual(expected);
  expect(await runHost(process.env.NODE_BINARY ?? "node")).toEqual(expected);
});
