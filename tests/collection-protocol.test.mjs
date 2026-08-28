import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import {
  ICounted,
  IIndexed,
  ILookup,
  IReduce,
  ISeqable,
  count,
  get,
  isReduced,
  isSequenceView,
  nth,
  reduce,
  reduced,
  seq,
  sequenceView,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  ProtocolDispatchError,
  extendProtocolType,
  implementsProtocol,
  protocolSlot,
} from "../runtime/core/protocol.mjs";
import {
  EMPTY_MAP,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import {
  EMPTY_SET,
  persistentHashSet,
} from "../runtime/core/set.mjs";
import {
  EMPTY_VECTOR,
  persistentVector,
} from "../runtime/core/vector.mjs";

async function runHost(command, fixture) {
  const child = Bun.spawn([command, fixture], {
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

test("collection protocols are frozen capabilities with direct persistent methods", () => {
  const vector = persistentVector(10, 20);
  const map = persistentHashMap(["answer", 42]);
  const set = persistentHashSet("ready");

  for (const protocol of [ICounted, ILookup, IIndexed, ISeqable, IReduce]) {
    expect(Object.isFrozen(protocol)).toBe(true);
  }
  expect(implementsProtocol(ICounted, vector)).toBe(true);
  expect(implementsProtocol(ILookup, vector)).toBe(true);
  expect(implementsProtocol(IIndexed, vector)).toBe(true);
  expect(implementsProtocol(ISeqable, vector)).toBe(true);
  expect(implementsProtocol(IReduce, vector)).toBe(true);
  expect(implementsProtocol(IIndexed, map)).toBe(false);
  expect(implementsProtocol(IIndexed, set)).toBe(false);

  expect(vector[protocolSlot(ICounted, "count")]()).toBe(2);
  expect(map[protocolSlot(ILookup, "get")]("answer", null)).toBe(42);
  expect(set[protocolSlot(ILookup, "get")]("ready", null)).toBe("ready");
});

test("generic count, lookup, and indexed access cover persistent and native values", () => {
  const vector = persistentVector(undefined, "value");
  const map = persistentHashMap(["present", undefined]);
  const set = persistentHashSet(undefined, "member");
  const nativeMap = new Map([["present", undefined]]);
  const nativeSet = new Set([undefined, "member"]);

  expect([
    count(vector), count(map), count(set),
    count([1, 2, 3]), count(nativeMap), count(nativeSet), count(null),
  ]).toEqual([2, 1, 2, 3, 1, 2, 0]);
  expect(get(vector, 0, "missing")).toBeUndefined();
  expect(get(vector, 7, "missing")).toBe("missing");
  expect(get(map, "present", "missing")).toBeUndefined();
  expect(get(nativeMap, "present", "missing")).toBeUndefined();
  expect(get(set, undefined, "missing")).toBeUndefined();
  expect(get(nativeSet, "absent", "missing")).toBe("missing");
  expect(nth(vector, 1)).toBe("value");
  expect(nth([3, 5, 8], 2)).toBe(8);
  expect(nth([], 0, "missing")).toBe("missing");
  expect(() => nth(vector, 8)).toThrow(RangeError);
  expect(() => count({ length: 3 })).toThrow(ProtocolDispatchError);

  class InvalidCount {}
  extendProtocolType(ICounted, InvalidCount, { count: () => -1 });
  expect(() => count(new InvalidCount())).toThrow(
    "collection count must be a non-negative safe integer",
  );
});

test("seq returns replayable immutable logical views and immutable map entries", () => {
  const vector = persistentVector(1, 2, 3);
  const map = persistentHashMap(["left", 1], ["right", 2]);
  const native = [4, 5];
  const vectorView = seq(vector);
  const nativeView = seq(native);

  expect(vectorView).not.toBe(vector);
  expect(Object.isFrozen(vectorView)).toBe(true);
  expect(isSequenceView(vectorView)).toBe(true);
  expect([...vectorView]).toEqual([1, 2, 3]);
  expect([...vectorView]).toEqual([1, 2, 3]);
  expect(count(vectorView)).toBe(3);
  expect(seq(vectorView)).toBe(vectorView);
  expect(seq(EMPTY_VECTOR)).toBeNull();
  expect(seq(EMPTY_MAP)).toBeNull();
  expect(seq(EMPTY_SET)).toBeNull();
  expect(seq(null)).toBeNull();

  const entries = [...seq(map)];
  expect(entries.every(Object.isFrozen)).toBe(true);
  expect(new Map(entries)).toEqual(new Map([["left", 1], ["right", 2]]));

  native.push(6);
  expect([...nativeView]).toEqual([4, 5, 6]);
  expect(count(nativeView)).toBe(3);
  expect(() => new (vectorView.constructor)()).toThrow(
    "SequenceView values must be created by seq",
  );
});

test("reduce follows logical sequence elements and supports explicit early termination", () => {
  const vector = persistentVector(2, 4, 6, 8);
  const map = persistentHashMap(["left", 3], ["right", 5]);
  const set = persistentHashSet(2, 4, 6);

  expect(reduce(vector, (left, right) => left + right)).toBe(20);
  expect(reduce(vector, (left, right) => left + right, 10)).toBe(30);
  expect(reduce(map, (total, entry) => total + entry[1], 0)).toBe(8);
  expect(reduce(set, (total, value) => total + value, 0)).toBe(12);
  expect(reduce(new Map([["x", 7]]), (_total, entry) => {
    expect(Object.isFrozen(entry)).toBe(true);
    return entry[1];
  }, 0)).toBe(7);
  expect(reduce(null, (total) => total + 1, 11)).toBe(11);
  expect(() => reduce([], (left, right) => left + right)).toThrow(
    "cannot reduce an empty collection without an initial value",
  );

  let calls = 0;
  expect(reduce(vector, (total, value) => {
    calls += 1;
    return value === 6 ? reduced(total + value) : total + value;
  }, 0)).toBe(12);
  expect(calls).toBe(3);
  const stopped = reduced(19);
  expect(reduced(stopped)).toBe(stopped);
  expect(Object.isFrozen(stopped)).toBe(true);
  expect(isReduced(stopped)).toBe(true);
  expect(isReduced(19)).toBe(false);
  expect(unreduced(stopped)).toBe(19);
  expect(unreduced(19)).toBe(19);

  let closed = false;
  const closable = sequenceView(() => (function* values() {
    try {
      yield 1;
      yield 2;
      yield 3;
    } finally {
      closed = true;
    }
  })(), 3);
  expect(reduce(closable, (total, value) =>
    value === 2 ? reduced(total + value) : total + value, 0)).toBe(3);
  expect(closed).toBe(true);
});

test("external immutable collections can implement the complete capability set", () => {
  class Pair {
    constructor(left, right) {
      this.values = Object.freeze([left, right]);
      Object.freeze(this);
    }
  }

  extendProtocolType(ICounted, Pair, { count: () => 2 });
  extendProtocolType(ILookup, Pair, {
    get: (pair, index, notFound) =>
      Number.isInteger(index) && index >= 0 && index < 2
        ? pair.values[index]
        : notFound,
  });
  extendProtocolType(IIndexed, Pair, {
    nth: (pair, index, ...notFound) => {
      if (Number.isInteger(index) && index >= 0 && index < 2) {
        return pair.values[index];
      }
      if (notFound.length > 0) {
        return notFound[0];
      }
      throw new RangeError("pair index outside bounds");
    },
  });
  extendProtocolType(ISeqable, Pair, {
    seq: (pair) => sequenceView(() => pair.values[Symbol.iterator](), 2),
  });
  extendProtocolType(IReduce, Pair, {
    reduce: (pair, reducer, ...initial) =>
      reduce(pair.values, reducer, ...initial),
  });

  const pair = new Pair("left", "right");
  expect(count(pair)).toBe(2);
  expect(get(pair, 1)).toBe("right");
  expect(nth(pair, 8, "missing")).toBe("missing");
  expect([...seq(pair)]).toEqual(["left", "right"]);
  expect(reduce(pair, (result, value) => `${result}:${value}`, "pair"))
    .toBe("pair:left:right");
});

test("native adapters are exact, realm-explicit, and prototype preserving", async () => {
  const arrayPrototypeKeys = Reflect.ownKeys(Array.prototype);
  const mapPrototypeKeys = Reflect.ownKeys(Map.prototype);
  const setPrototypeKeys = Reflect.ownKeys(Set.prototype);
  const remote = runInNewContext("[3, 5, 8]");

  expect(() => count(remote)).toThrow(ProtocolDispatchError);
  extendProtocolType(ICounted, remote.constructor, {
    count: (values) => values.length,
  });
  expect(count(remote)).toBe(3);
  expect(Reflect.ownKeys(Array.prototype)).toEqual(arrayPrototypeKeys);
  expect(Reflect.ownKeys(Map.prototype)).toEqual(mapPrototypeKeys);
  expect(Reflect.ownKeys(Set.prototype)).toEqual(setPrototypeKeys);

  const fixture = fileURLToPath(
    new URL("./fixtures/collection-adapter-isolation.mjs", import.meta.url),
  );
  const bun = await runHost(process.execPath, fixture);
  const node = await runHost("node", fixture);
  expect(bun).toEqual(node);
  expect(bun).toEqual({
    unchanged: [true, true, true],
    protocolSlotsAbsent: [true, true, true],
  });
});

test("collection capabilities agree under Bun and Node and reduce at million scale", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/collection-protocol-host.mjs", import.meta.url),
  );
  const bun = await runHost(process.execPath, fixture);
  const node = await runHost("node", fixture);
  expect(bun).toEqual(node);
  expect(bun).toEqual({
    counts: [4, 2, 2, 2, 0],
    lookup: [6, 5, "alpha", "missing"],
    sequence: {
      view: true,
      vector: [2, 4, 6, 8],
      map: [["left", 3], ["right", 5]],
      empty: null,
    },
    reductions: {
      vector: 20,
      map: 8,
      set: ["alpha", "beta"],
      early: 12,
    },
  });

  const values = Array.from({ length: 1_000_000 }, (_value, index) => index);
  expect(reduce(values, (total, value) => total + value, 0))
    .toBe(499_999_500_000);
}, 30_000);
