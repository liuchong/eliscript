import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import {
  IAssociative,
  IConj,
  ICounted,
  IEmptyable,
  IIndexed,
  ILookup,
  IReduce,
  ISeqable,
  assoc,
  conj,
  contains,
  count,
  empty,
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
  implementsProtocolOperation,
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

test("construction protocols are frozen capabilities with direct persistent methods", () => {
  const vector = persistentVector(10, 20);
  const map = persistentHashMap(["answer", 42]);
  const set = persistentHashSet("ready");

  for (const protocol of [IEmptyable, IConj, IAssociative]) {
    expect(Object.isFrozen(protocol)).toBe(true);
  }
  expect(implementsProtocol(IEmptyable, vector)).toBe(true);
  expect(implementsProtocol(IConj, vector)).toBe(true);
  expect(implementsProtocol(IAssociative, vector)).toBe(true);
  expect(implementsProtocol(IEmptyable, map)).toBe(true);
  expect(implementsProtocol(IConj, map)).toBe(true);
  expect(implementsProtocol(IAssociative, map)).toBe(true);
  expect(implementsProtocol(IEmptyable, set)).toBe(true);
  expect(implementsProtocol(IConj, set)).toBe(true);
  expect(implementsProtocol(IAssociative, set)).toBe(false);
  expect(implementsProtocolOperation(IAssociative, "contains", set)).toBe(true);
  expect(implementsProtocolOperation(IAssociative, "assoc", set)).toBe(false);

  expect(vector[protocolSlot(IEmptyable, "empty")]()).toBe(EMPTY_VECTOR);
  expect([...map[protocolSlot(IConj, "conj")](Object.freeze(["next", 7]))])
    .toEqual(expect.arrayContaining([["answer", 42], ["next", 7]]));
  expect(set[protocolSlot(IAssociative, "contains")]("ready")).toBe(true);
});

test("empty preserves logical collection categories and canonical persistent values", () => {
  const vector = persistentVector(1, 2);
  const map = persistentHashMap(["value", 1]);
  const set = persistentHashSet("value");
  const nativeArray = [1, 2];
  const nativeMap = new Map([["value", 1]]);
  const nativeSet = new Set(["value"]);

  expect(empty(vector)).toBe(EMPTY_VECTOR);
  expect(empty(map)).toBe(EMPTY_MAP);
  expect(empty(set)).toBe(EMPTY_SET);
  expect(empty(null)).toBeNull();
  expect(empty(nativeArray)).toEqual([]);
  expect(empty(nativeArray)).not.toBe(nativeArray);
  expect(empty(nativeMap)).toEqual(new Map());
  expect(empty(nativeMap)).not.toBe(nativeMap);
  expect(empty(nativeSet)).toEqual(new Set());
  expect(empty(nativeSet)).not.toBe(nativeSet);
  expect(nativeArray).toEqual([1, 2]);
  expect(nativeMap).toEqual(new Map([["value", 1]]));
  expect(nativeSet).toEqual(new Set(["value"]));
  expect(() => empty({})).toThrow(ProtocolDispatchError);
});

test("conj builds persistent and native collections without mutating inputs", () => {
  const vector = persistentVector(1);
  const map = persistentHashMap(["old", 1]);
  const set = persistentHashSet("old");
  const nativeArray = [1];
  const nativeMap = new Map([["old", 1]]);
  const nativeSet = new Set(["old"]);

  expect([...conj(vector, 2, 3)]).toEqual([1, 2, 3]);
  expect([...vector]).toEqual([1]);
  expect(new Map(conj(map, ["next", 2], ["last", 3]).entries()))
    .toEqual(new Map([["old", 1], ["next", 2], ["last", 3]]));
  expect(conj(map, ["old", 1])).toBe(map);
  expect(conj(set, "next", "last").toSet())
    .toEqual(new Set(["old", "next", "last"]));
  expect(conj(set, "old")).toBe(set);
  expect(conj(vector)).toBe(vector);

  expect(conj(nativeArray, 2)).toEqual([1, 2]);
  expect(nativeArray).toEqual([1]);
  expect(conj(nativeMap, ["next", 2]))
    .toEqual(new Map([["old", 1], ["next", 2]]));
  expect(nativeMap).toEqual(new Map([["old", 1]]));
  expect(conj(nativeSet, "next")).toEqual(new Set(["old", "next"]));
  expect(nativeSet).toEqual(new Set(["old"]));

  let pulls = 0;
  let closed = false;
  const unbounded = {
    *[Symbol.iterator]() {
      try {
        while (true) {
          pulls += 1;
          yield pulls;
        }
      } finally {
        closed = true;
      }
    },
  };
  expect(() => conj(map, unbounded)).toThrow(
    "persistent hash map entries must contain exactly two values",
  );
  expect(pulls).toBe(3);
  expect(closed).toBe(true);
  expect(new Map(map.entries())).toEqual(new Map([["old", 1]]));
});

test("assoc and contains preserve key semantics and validate complete updates", () => {
  const vector = persistentVector("left", "right");
  const map = persistentHashMap(["present", undefined]);
  const set = persistentHashSet("member");
  const nativeArray = ["left", "right"];
  const nativeMap = new Map([["present", undefined]]);

  expect([...assoc(vector, 1, "changed", 2, "appended")])
    .toEqual(["left", "changed", "appended"]);
  expect([...vector]).toEqual(["left", "right"]);
  expect(contains(vector, 0)).toBe(true);
  expect(contains(vector, 2)).toBe(false);
  expect(contains(vector, "left")).toBe(false);
  expect(get(assoc(map, "next", 2, "last", 3), "last")).toBe(3);
  expect(contains(map, "present")).toBe(true);
  expect(contains(map, "missing")).toBe(false);
  expect(contains(set, "member")).toBe(true);
  expect(contains(set, "missing")).toBe(false);
  expect(() => assoc(set, "member", 1)).toThrow(ProtocolDispatchError);

  expect(assoc(nativeArray, 2, "appended"))
    .toEqual(["left", "right", "appended"]);
  expect(nativeArray).toEqual(["left", "right"]);
  expect(contains(nativeArray, 1)).toBe(true);
  expect(assoc(nativeMap, "next", 2))
    .toEqual(new Map([["present", undefined], ["next", 2]]));
  expect(contains(nativeMap, "present")).toBe(true);
  expect(nativeMap).toEqual(new Map([["present", undefined]]));
  expect(() => assoc(vector, 0, "changed", 1)).toThrow(
    "assoc requires a collection followed by one or more key/value pairs",
  );
  expect([...vector]).toEqual(["left", "right"]);
  expect(() => assoc(vector, 3, "outside")).toThrow(RangeError);

  class InvalidContains {}
  extendProtocolType(IAssociative, InvalidContains, {
    contains: () => "yes",
  });
  expect(() => contains(new InvalidContains(), "key")).toThrow(
    "IAssociative/contains must return a boolean",
  );
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
  extendProtocolType(IEmptyable, Pair, { empty: () => new Pair(null, null) });
  extendProtocolType(IConj, Pair, {
    conj: (pair, value) => new Pair(pair.values[1], value),
  });
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
  extendProtocolType(IAssociative, Pair, {
    assoc: (pair, index, value) => {
      if (index === 0) {
        return new Pair(value, pair.values[1]);
      }
      if (index === 1) {
        return new Pair(pair.values[0], value);
      }
      throw new RangeError("pair index outside bounds");
    },
    contains: (_pair, index) => index === 0 || index === 1,
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
  expect(empty(pair).values).toEqual([null, null]);
  expect(conj(pair, "tail").values).toEqual(["right", "tail"]);
  expect(get(pair, 1)).toBe("right");
  expect(assoc(pair, 0, "changed").values).toEqual(["changed", "right"]);
  expect(contains(pair, 1)).toBe(true);
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
  expect(() => empty(remote)).toThrow(ProtocolDispatchError);
  extendProtocolType(ICounted, remote.constructor, {
    count: (values) => values.length,
  });
  extendProtocolType(IEmptyable, remote.constructor, {
    empty: (values) => values.slice(0, 0),
  });
  expect(count(remote)).toBe(3);
  expect(empty(remote)).toEqual([]);
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
    construction: {
      vector: [2, 4, 6, 8, 10],
      map: [["left", 3], ["right", 5], ["third", 7]],
      set: ["alpha", "beta", "gamma"],
      associated: [2, 9, 6, 8],
      contains: [true, false, true],
      emptied: [0, 0, 0],
    },
  });

  const values = Array.from({ length: 1_000_000 }, (_value, index) => index);
  expect(reduce(values, (total, value) => total + value, 0))
    .toBe(499_999_500_000);
}, 30_000);

test("generic construction reaches one million values without stack growth", () => {
  let vector = EMPTY_VECTOR;
  for (let value = 0; value < 1_000_000; value += 1) {
    vector = conj(vector, value);
  }
  expect(count(vector)).toBe(1_000_000);
  expect(nth(vector, 0)).toBe(0);
  expect(nth(vector, 999_999)).toBe(999_999);

  const changed = assoc(vector, 500_000, "changed");
  expect(nth(changed, 500_000)).toBe("changed");
  expect(nth(vector, 500_000)).toBe(500_000);
}, 30_000);
