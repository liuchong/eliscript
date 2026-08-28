import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  EMPTY_SET,
  PersistentHashSet,
  isPersistentHashSet,
  persistentHashSet,
} from "../runtime/core/set.mjs";
import {
  inspectPersistentSet,
  persistentSetMetrics,
  resetPersistentSetMetrics,
  sharedPersistentSetNodes,
} from "../runtime/testing/set.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  clearValueHashCaches,
  resetValueHashMetrics,
  valueHashMetrics,
} from "../runtime/testing/value.mjs";

function setRange(count) {
  let result = EMPTY_SET;
  for (let value = 0; value < count; value += 1) {
    result = result.conj(value);
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

function distinctRootValues(count) {
  const values = new Map();
  for (let candidate = 0; values.size < count; candidate += 1) {
    const branch = hashValue(candidate) & 31;
    if (!values.has(branch)) {
      values.set(branch, candidate);
    }
  }
  return [...values.values()];
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

test("persistent hash set preserves old values and value-equal members", () => {
  expect(PersistentHashSet.empty()).toBe(EMPTY_SET);
  expect(EMPTY_SET.count).toBe(0);
  expect(EMPTY_SET.size).toBe(0);
  expect(() => new PersistentHashSet()).toThrow(TypeError);

  const member = persistentVector(1, 2, 3);
  const equalMember = persistentVector(1, 2, 3);
  const original = persistentHashSet("alpha", member, undefined);
  const duplicate = original.conj(equalMember);
  const updated = duplicate.conj("omega");

  expect(isPersistentHashSet(original)).toBe(true);
  expect(Object.isFrozen(original)).toBe(true);
  expect(PersistentHashSet.from(original)).toBe(original);
  expect(duplicate).toBe(original);
  expect(original.count).toBe(3);
  expect(original.has(equalMember)).toBe(true);
  expect(updated.count).toBe(4);
  expect(updated.has("omega")).toBe(true);
  expect(updated.disj("missing")).toBe(updated);
  expect(original.has("omega")).toBe(false);
  expect(persistentHashSet("only").disj("only")).toBe(EMPTY_SET);

  const hostMember = { identity: true };
  const scalarMembers = persistentHashSet(null, undefined, Number.NaN, -0, hostMember);
  expect(scalarMembers.count).toBe(5);
  expect(scalarMembers.has(Number.NaN)).toBe(true);
  expect(scalarMembers.has(0)).toBe(true);
  expect(scalarMembers.has(hostMember)).toBe(true);
  expect(scalarMembers.has({ identity: true })).toBe(false);

  const entries = [...persistentHashSet("a").entries()];
  expect(entries).toEqual([["a", "a"]]);
  expect(Object.isFrozen(entries[0])).toBe(true);
  expect([...updated.keys()]).toEqual([...updated.values()]);
  expect(updated.toSet()).toEqual(new Set(updated));
  expect(updated.reduce((count) => count + 1, 0)).toBe(4);
  expect(() => updated.reduce(() => 0)).toThrow(TypeError);
  expect(() => updated.reduce(null, 0)).toThrow(TypeError);
});

test("persistent hash set handles complete hash collisions", () => {
  const left = "key-50691";
  const right = "key-194634";
  expect(hashValue(left)).toBe(hashValue(right));

  const set = persistentHashSet(left, right);
  expect(set.count).toBe(2);
  expect(set.has(left)).toBe(true);
  expect(set.has(right)).toBe(true);
  expect(inspectPersistentSet(set).collisionNodes).toBe(1);
  expect(set.conj(left)).toBe(set);
  expect(set.disj(left).has(right)).toBe(true);
  expect(set.disj(right).has(left)).toBe(true);
});

test("persistent hash set inherits sparse and dense HAMT transitions", () => {
  const values = distinctRootValues(32);
  let set = EMPTY_SET;
  for (const value of values.slice(0, 31)) {
    set = set.conj(value);
  }
  expect(inspectPersistentSet(set).arrayNodes).toBe(0);

  resetPersistentSetMetrics();
  set = set.conj(values[31]);
  expect(persistentSetMetrics().promotions).toBe(1);
  expect(inspectPersistentSet(set).arrayNodes).toBe(1);

  for (const value of values.slice(0, 7)) {
    set = set.disj(value);
  }
  expect(inspectPersistentSet(set).arrayNodes).toBe(1);

  resetPersistentSetMetrics();
  set = set.disj(values[7]);
  expect(persistentSetMetrics().demotions).toBe(1);
  expect(inspectPersistentSet(set).arrayNodes).toBe(0);
});

test("persistent hash set equality and hash ignore insertion order", () => {
  const left = persistentHashSet(
    "alpha",
    persistentVector(1, 2),
    Number.NaN,
  );
  const right = persistentHashSet(
    Number.NaN,
    persistentVector(1, 2),
    "alpha",
  );

  expect(equalValues(left, right)).toBe(true);
  expect(hashValue(left)).toBe(hashValue(right));
  expect(equalValues(left, right.conj("changed"))).toBe(false);
  expect(equalValues(left, right.disj("alpha"))).toBe(false);
  expect(equalValues(left, new Set(left))).toBe(false);
  expect(persistentHashSet(left).has(right)).toBe(true);
});

test("persistent hash set implements value-semantic set algebra", () => {
  const vector = persistentVector("value");
  const equalVector = persistentVector("value");
  const base = persistentHashSet(1, 2, vector);

  const union = base.union([2, 3], persistentHashSet(4));
  expect(union.count).toBe(5);
  for (const value of [1, 2, 3, 4, equalVector]) {
    expect(union.has(value)).toBe(true);
  }
  expect(equalValues(base.union([2, equalVector]), base)).toBe(true);
  expect(base.union([2, equalVector])).toBe(base);

  const intersection = base.intersection([2, equalVector, 9]);
  expect(intersection.count).toBe(2);
  expect(intersection.has(2)).toBe(true);
  expect(intersection.has(vector)).toBe(true);
  expect(base.intersection(base)).toBe(base);

  const difference = base.difference([2], persistentHashSet(equalVector));
  expect([...difference]).toEqual([1]);
  expect(base.difference([9])).toBe(base);
  expect(persistentHashSet(1, vector).isSubsetOf(base)).toBe(true);
  expect(base.isSupersetOf([1, equalVector])).toBe(true);
  expect(base.isDisjointFrom([8, 9])).toBe(true);
  expect(base.isDisjointFrom([8, equalVector])).toBe(false);
});

test("persistent hash set hashes every member once and caches the result", () => {
  clearValueHashCaches();
  const set = setRange(100_000);
  resetValueHashMetrics();
  const first = hashValue(set);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 100_001,
    protocolHashComputations: 1,
    protocolHashCacheHits: 0,
    hostIdentityAssignments: 0,
  });

  resetValueHashMetrics();
  expect(hashValue(set)).toBe(first);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 1,
    protocolHashComputations: 0,
    protocolHashCacheHits: 1,
    hostIdentityAssignments: 0,
  });
});

test("persistent hash set agrees with a mutable reference model", () => {
  const random = { value: 0x51e75eed };
  let set = EMPTY_SET;
  const model = new Set();

  for (let step = 0; step < 20_000; step += 1) {
    const value = nextRandom(random) % 4096;
    const insert = (nextRandom(random) % 10) < 7;
    const previous = set;
    const previouslyPresent = model.has(value);

    if (insert) {
      set = set.conj(value);
      model.add(value);
    } else {
      set = set.disj(value);
      model.delete(value);
    }

    expect(set.count).toBe(model.size);
    expect(set.has(value)).toBe(model.has(value));
    expect(previous.has(value)).toBe(previouslyPresent);
    if (step % 250 === 0) {
      for (const modelValue of model) {
        expect(set.has(modelValue)).toBe(true);
      }
    }
  }
});

test("persistent hash set removal copies only the selected node path", () => {
  const set = setRange(100_000);
  const shape = inspectPersistentSet(set);

  resetPersistentSetMetrics();
  const updated = set.disj(54_321);
  const metrics = persistentSetMetrics();
  expect(metrics.nodeVisits).toBeLessThanOrEqual(9);
  expect(metrics.nodeAllocations).toBe(metrics.nodeVisits);
  expect(sharedPersistentSetNodes(set, updated)).toBe(
    shape.nodeCount - metrics.nodeVisits,
  );
  expect(set.has(54_321)).toBe(true);
  expect(updated.has(54_321)).toBe(false);
});

test("persistent hash set stays within HAMT bounds at one million members", () => {
  const set = setRange(1_000_000);
  const shape = inspectPersistentSet(set);
  expect(shape.count).toBe(1_000_000);
  expect(shape.entries).toBe(1_000_000);
  expect(shape.maxDepth).toBeLessThanOrEqual(9);

  for (const value of [0, 31, 32, 1024, 32768, 500_000, 999_999, "missing"]) {
    resetPersistentSetMetrics();
    expect(set.has(value)).toBe(typeof value === "number");
    expect(persistentSetMetrics().nodeVisits).toBeLessThanOrEqual(9);
  }

  resetPersistentSetMetrics();
  const added = set.conj(1_000_000);
  expect(persistentSetMetrics().nodeVisits).toBeLessThanOrEqual(9);
  expect(set.has(1_000_000)).toBe(false);
  expect(added.has(1_000_000)).toBe(true);

  resetPersistentSetMetrics();
  const removed = set.disj(500_000);
  expect(persistentSetMetrics().nodeVisits).toBeLessThanOrEqual(9);
  expect(removed.has(500_000)).toBe(false);
  expect(set.has(500_000)).toBe(true);
}, 60_000);

test("persistent hash set has equivalent behavior under Bun and Node", async () => {
  const fixture = fileURLToPath(
    new URL("fixtures/persistent-set-host.mjs", import.meta.url),
  );
  const [bunResult, nodeResult] = await Promise.all([
    runHost("bun", fixture),
    runHost(process.env.NODE ?? "node", fixture),
  ]);

  expect(nodeResult).toEqual(bunResult);
  expect(bunResult).toMatchObject({
    probes: [true, true, true, true, true, true],
    missing: false,
    original: true,
    updated: false,
    sum: 4_999_950_000,
    collision: {
      count: 2,
      left: true,
      right: true,
    },
    algebra: {
      union: [1, 2, 3],
      intersection: [2, 3],
      difference: [1, 3],
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
