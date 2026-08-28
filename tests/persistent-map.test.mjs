import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  EMPTY_MAP,
  PersistentHashMap,
  isPersistentHashMap,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import {
  inspectPersistentMap,
  persistentMapMetrics,
  resetPersistentMapMetrics,
  sharedPersistentMapNodes,
} from "../runtime/testing/map.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  clearValueHashCaches,
  resetValueHashMetrics,
  valueHashMetrics,
} from "../runtime/testing/value.mjs";

function mapRange(count) {
  let result = EMPTY_MAP;
  for (let key = 0; key < count; key += 1) {
    result = result.assoc(key, key * 2);
  }
  return result;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

function distinctRootKeys(count) {
  const keys = new Map();
  for (let candidate = 0; keys.size < count; candidate += 1) {
    const branch = hashValue(candidate) & 31;
    if (!keys.has(branch)) {
      keys.set(branch, candidate);
    }
  }
  return [...keys.values()];
}

async function runHost(command, source) {
  const child = Bun.spawn([command, source], {
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

test("persistent hash map preserves old values and value-equal keys", () => {
  expect(PersistentHashMap.empty()).toBe(EMPTY_MAP);
  expect(EMPTY_MAP.count).toBe(0);
  expect(EMPTY_MAP.size).toBe(0);
  expect(EMPTY_MAP.get("missing")).toBeNull();
  expect(EMPTY_MAP.get("missing", "fallback")).toBe("fallback");
  expect(EMPTY_MAP.has("missing")).toBe(false);
  expect(() => new PersistentHashMap()).toThrow(TypeError);

  const key = persistentVector(1, 2, 3);
  const equalKey = persistentVector(1, 2, 3);
  const original = persistentHashMap(["name", "Eliscript"], [key, 1]);
  const updated = original.assoc(equalKey, 2).assoc("new", undefined);

  expect(isPersistentHashMap(original)).toBe(true);
  expect(Object.isFrozen(original)).toBe(true);
  expect(original.count).toBe(2);
  expect(original.get(equalKey)).toBe(1);
  expect(updated.count).toBe(3);
  expect(updated.get(key)).toBe(2);
  expect(updated.has("new")).toBe(true);
  expect(updated.get("new", "fallback")).toBeUndefined();
  expect(updated.assoc(equalKey, 2)).toBe(updated);
  expect(updated.dissoc("missing")).toBe(updated);
  expect(updated.dissoc("new").count).toBe(2);
  expect(original.has("new")).toBe(false);
  expect([...updated.keys()].some((stored) => stored === key)).toBe(true);
  expect(() => PersistentHashMap.from([[1]])).toThrow(TypeError);
  expect(() => PersistentHashMap.from([null])).toThrow(TypeError);

  const hostKey = { identity: true };
  const scalarKeys = persistentHashMap(
    [null, "null"],
    [undefined, "undefined"],
    [Number.NaN, "nan"],
    [-0, "zero"],
    [hostKey, "host"],
  );
  expect(scalarKeys.count).toBe(5);
  expect(scalarKeys.get(Number.NaN)).toBe("nan");
  expect(scalarKeys.get(0)).toBe("zero");
  expect(scalarKeys.get(hostKey)).toBe("host");
  expect(scalarKeys.has({ identity: true })).toBe(false);
});

test("persistent hash map handles full 32-bit hash collisions", () => {
  const left = "key-50691";
  const right = "key-194634";
  expect(hashValue(left)).toBe(hashValue(right));

  const map = persistentHashMap([left, 1], [right, 2]);
  expect(map.count).toBe(2);
  expect(map.get(left)).toBe(1);
  expect(map.get(right)).toBe(2);
  expect(inspectPersistentMap(map).collisionNodes).toBe(1);

  const updated = map.assoc(right, 3);
  expect(updated.count).toBe(2);
  expect(updated.get(left)).toBe(1);
  expect(updated.get(right)).toBe(3);
  expect(map.get(right)).toBe(2);
  expect(updated.dissoc(left).get(right)).toBe(3);
  expect(updated.dissoc(right).get(left)).toBe(1);

  let third = "";
  for (let candidate = 0; ; candidate += 1) {
    const key = `third-${candidate}`;
    if (hashValue(key) !== hashValue(left) &&
        (hashValue(key) & 31) === (hashValue(left) & 31)) {
      third = key;
      break;
    }
  }
  const branched = map.assoc(third, 4);
  expect(branched.get(left)).toBe(1);
  expect(branched.get(right)).toBe(2);
  expect(branched.get(third)).toBe(4);
  expect(branched.dissoc(third).get(right)).toBe(2);
});

test("persistent hash map promotes and demotes measured branch thresholds", () => {
  const keys = distinctRootKeys(16);
  let map = EMPTY_MAP;
  for (const key of keys.slice(0, 15)) {
    map = map.assoc(key, key);
  }
  expect(inspectPersistentMap(map).arrayNodes).toBe(0);

  resetPersistentMapMetrics();
  map = map.assoc(keys[15], keys[15]);
  expect(persistentMapMetrics().promotions).toBe(1);
  expect(inspectPersistentMap(map).arrayNodes).toBe(1);

  for (const key of keys.slice(0, 7)) {
    map = map.dissoc(key);
  }
  expect(map.count).toBe(9);
  expect(inspectPersistentMap(map).arrayNodes).toBe(1);

  resetPersistentMapMetrics();
  map = map.dissoc(keys[7]);
  expect(map.count).toBe(8);
  expect(persistentMapMetrics().demotions).toBe(1);
  expect(inspectPersistentMap(map).arrayNodes).toBe(0);
  for (const key of keys.slice(8)) {
    expect(map.get(key)).toBe(key);
  }
});

test("persistent hash map equality and hash ignore insertion order", () => {
  const left = persistentHashMap(
    ["alpha", persistentVector(1, 2)],
    [persistentVector("key"), "value"],
    ["omega", Number.NaN],
  );
  const right = persistentHashMap(
    ["omega", Number.NaN],
    [persistentVector("key"), "value"],
    ["alpha", persistentVector(1, 2)],
  );

  expect(equalValues(left, right)).toBe(true);
  expect(hashValue(left)).toBe(hashValue(right));
  expect(equalValues(left, right.assoc("alpha", persistentVector(2, 1)))).toBe(false);
  expect(equalValues(left, right.dissoc("omega"))).toBe(false);
  expect(equalValues(left, new Map(left))).toBe(false);
  expect(left.reduce((total, value) => total + (typeof value === "string"), 0)).toBe(1);
  expect(() => left.reduce(() => 0)).toThrow(TypeError);
});

test("persistent hash map hashes each key/value pair once and caches the result", () => {
  clearValueHashCaches();
  const map = mapRange(100_000);
  resetValueHashMetrics();
  const first = hashValue(map);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 200_001,
    protocolHashComputations: 1,
    protocolHashCacheHits: 0,
    hostIdentityAssignments: 0,
  });

  resetValueHashMetrics();
  expect(hashValue(map)).toBe(first);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 1,
    protocolHashComputations: 0,
    protocolHashCacheHits: 1,
    hostIdentityAssignments: 0,
  });
});

test("persistent hash map agrees with a mutable reference model", () => {
  const random = { value: 0x5eed1234 };
  let map = EMPTY_MAP;
  const model = new Map();

  for (let step = 0; step < 20000; step += 1) {
    const key = nextRandom(random) % 4096;
    const choice = nextRandom(random) % 10;
    const previous = map;
    const previousHadKey = model.has(key);
    const previousValue = model.get(key);

    if (choice < 7) {
      const value = nextRandom(random);
      map = map.assoc(key, value);
      model.set(key, value);
    } else {
      map = map.dissoc(key);
      model.delete(key);
    }

    expect(map.count).toBe(model.size);
    expect(map.has(key)).toBe(model.has(key));
    expect(map.get(key, "missing")).toBe(
      model.has(key) ? model.get(key) : "missing",
    );
    expect(previous.has(key)).toBe(previousHadKey);
    expect(previous.get(key, "missing")).toBe(
      previousHadKey ? previousValue : "missing",
    );
    if (step % 250 === 0) {
      for (const [modelKey, modelValue] of model) {
        expect(map.get(modelKey, "missing")).toBe(modelValue);
      }
    }
  }
});

test("persistent hash map updates copy only the selected node path", () => {
  const map = mapRange(100_000);
  const shape = inspectPersistentMap(map);

  resetPersistentMapMetrics();
  const updated = map.assoc(54_321, -1);
  const metrics = persistentMapMetrics();
  expect(metrics.nodeVisits).toBeLessThanOrEqual(9);
  expect(metrics.nodeAllocations).toBe(metrics.nodeVisits);
  expect(metrics.entryAllocations).toBe(1);
  expect(sharedPersistentMapNodes(map, updated)).toBe(
    shape.nodeCount - metrics.nodeVisits,
  );
  expect(map.get(54_321)).toBe(108_642);
  expect(updated.get(54_321)).toBe(-1);
});

test("persistent hash map stays within HAMT bounds at one million keys", () => {
  const map = mapRange(1_000_000);
  const shape = inspectPersistentMap(map);
  expect(shape.count).toBe(1_000_000);
  expect(shape.entries).toBe(1_000_000);
  expect(shape.maxDepth).toBeLessThanOrEqual(9);

  for (const key of [0, 31, 32, 1024, 32768, 500000, 999999, "missing"]) {
    resetPersistentMapMetrics();
    const expected = typeof key === "number" ? key * 2 : "not-found";
    expect(map.get(key, "not-found")).toBe(expected);
    expect(persistentMapMetrics().nodeVisits).toBeLessThanOrEqual(9);
  }

  resetPersistentMapMetrics();
  const updated = map.assoc(500000, -1);
  expect(persistentMapMetrics().nodeVisits).toBeLessThanOrEqual(9);
  expect(map.get(500000)).toBe(1_000_000);
  expect(updated.get(500000)).toBe(-1);

  resetPersistentMapMetrics();
  const removed = map.dissoc(500000);
  expect(persistentMapMetrics().nodeVisits).toBeLessThanOrEqual(9);
  expect(removed.has(500000)).toBe(false);
  expect(map.has(500000)).toBe(true);
}, 60000);

test("persistent hash map has equivalent behavior under Bun and Node", async () => {
  const fixture = fileURLToPath(
    new URL("fixtures/persistent-map-host.mjs", import.meta.url),
  );
  const [bunResult, nodeResult] = await Promise.all([
    runHost("bun", fixture),
    runHost(process.env.NODE ?? "node", fixture),
  ]);

  expect(nodeResult).toEqual(bunResult);
  expect(bunResult).toMatchObject({
    probes: [0, 62, 64, 2048, 65536, 199998],
    missing: "not-found",
    original: 108642,
    updated: "updated",
    sum: 9_999_900_000,
    collision: {
      count: 2,
      left: "left",
      right: "right",
    },
    unordered: {
      equal: true,
    },
  });
  expect(bunResult.unordered.leftHash).toBe(bunResult.unordered.rightHash);
  expect(bunResult.metrics.nodeAllocations).toBe(bunResult.metrics.nodeVisits);
  expect(bunResult.sharedNodes).toBe(
    bunResult.shape.nodeCount - bunResult.metrics.nodeVisits,
  );
});
