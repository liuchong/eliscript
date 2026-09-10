import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import {
  IAssociative,
  IConj,
  ICounted,
  IEmptyable,
  IIndexed,
  IKVReduce,
  ILookup,
  IMap,
  IReduce,
  IReversible,
  ISet,
  ISeqable,
  IStack,
  ReductionView,
  SequenceView,
  assoc,
  conj,
  contains,
  count,
  disj,
  dissoc,
  empty,
  get,
  isAssociative,
  isCounted,
  isEmpty,
  isIndexed,
  isReducible,
  isReduced,
  isReversible,
  isReductionView,
  isSeqable,
  isSequenceView,
  notEmpty,
  nth,
  peek,
  pop,
  reduce,
  reduceKV,
  reductionView,
  reduced,
  rseq,
  seq,
  sequenceView,
  unboundedSequenceView,
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
  EMPTY_LIST,
  persistentList,
} from "../runtime/core/list.mjs";
import {
  EMPTY_MAP,
  persistentHashMap,
} from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import {
  EMPTY_SET,
  persistentHashSet,
} from "../runtime/core/set.mjs";
import {
  EMPTY_VECTOR,
  persistentVector,
} from "../runtime/core/vector.mjs";
import { last, reverse } from "../runtime/core/sequence.mjs";

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

  for (const protocol of [ICounted, ILookup, IIndexed, ISeqable, IReduce, IKVReduce]) {
    expect(Object.isFrozen(protocol)).toBe(true);
  }
  expect(implementsProtocol(ICounted, vector)).toBe(true);
  expect(implementsProtocol(ILookup, vector)).toBe(true);
  expect(implementsProtocol(IIndexed, vector)).toBe(true);
  expect(implementsProtocol(ISeqable, vector)).toBe(true);
  expect(implementsProtocol(IReduce, vector)).toBe(true);
  expect(implementsProtocol(IIndexed, map)).toBe(false);
  expect(implementsProtocol(IIndexed, set)).toBe(false);
  expect(implementsProtocol(IKVReduce, vector)).toBe(true);
  expect(implementsProtocol(IKVReduce, map)).toBe(true);
  expect(implementsProtocol(IKVReduce, set)).toBe(false);

  expect(vector[protocolSlot(ICounted, "count")]()).toBe(2);
  expect(map[protocolSlot(ILookup, "get")]("answer", null)).toBe(42);
  expect(set[protocolSlot(ILookup, "get")]("ready", null)).toBe("ready");
  expect(map[protocolSlot(IKVReduce, "reduceKV")]((sum, _key, value) =>
    sum + value, 0)).toBe(42);
});

test("collection capability predicates and emptiness preserve protocol boundaries", () => {
  const vector = persistentVector(10, 20);
  const emptyVector = EMPTY_VECTOR;
  const map = persistentHashMap(["answer", 42]);
  const set = persistentHashSet("ready");

  expect(isCounted(vector)).toBe(true);
  expect(isIndexed(vector)).toBe(true);
  expect(isSeqable(vector)).toBe(true);
  expect(isReducible(vector)).toBe(true);
  expect(isReversible(vector)).toBe(true);
  expect(isAssociative(vector)).toBe(true);
  expect(isIndexed(map)).toBe(false);
  expect(isReversible(map)).toBe(false);
  expect(isAssociative(map)).toBe(true);
  expect(isAssociative(set)).toBe(false);

  expect(isEmpty(emptyVector)).toBe(true);
  expect(isEmpty(vector)).toBe(false);
  expect(isEmpty("")).toBe(true);
  expect(isEmpty(new Map())).toBe(true);
  expect(isEmpty(new Set([1]))).toBe(false);
  expect(isEmpty(null)).toBe(true);
  expect(notEmpty(emptyVector)).toBeNull();
  expect(notEmpty(vector)).toBe(vector);

  for (const value of [42, false, undefined, () => null]) {
    expect(isCounted(value)).toBe(false);
    expect(isIndexed(value)).toBe(false);
    expect(isSeqable(value)).toBe(false);
    expect(isReducible(value)).toBe(false);
    expect(isReversible(value)).toBe(false);
    expect(isAssociative(value)).toBe(false);
  }
  expect(() => isEmpty(42)).toThrow(ProtocolDispatchError);
  expect(() => notEmpty(false)).toThrow(ProtocolDispatchError);

  let countCalls = 0;
  class ExternalCounted {}
  extendProtocolType(ICounted, ExternalCounted, {
    count: () => {
      countCalls += 1;
      return 0;
    },
  });
  const externalCounted = new ExternalCounted();
  expect(isCounted(externalCounted)).toBe(true);
  expect(isSeqable(externalCounted)).toBe(false);
  expect(countCalls).toBe(0);

  let seqCalls = 0;
  class ExternalEmpty {}
  extendProtocolType(ISeqable, ExternalEmpty, {
    seq: () => {
      seqCalls += 1;
      return null;
    },
  });
  const externalEmpty = new ExternalEmpty();
  expect(isSeqable(externalEmpty)).toBe(true);
  expect(seqCalls).toBe(0);
  expect(isEmpty(externalEmpty)).toBe(true);
  expect(seqCalls).toBe(1);
});

test("key/value reduction is allocation-light, extensible, and terminates exactly", () => {
  const vector = persistentVector(2, 4, 6);
  const map = persistentHashMap(["left", 3], ["right", 5]);
  expect(reduceKV(vector, (result, index, value) =>
    [...result, [index, value]], [])).toEqual([[0, 2], [1, 4], [2, 6]]);
  expect(reduceKV(map, (sum, _key, value) => sum + value, 0)).toBe(8);
  expect(reduceKV([3, 5], (sum, index, value) => sum + index + value, 0)).toBe(9);
  expect(reduceKV(new Map([["a", 2], ["b", 4]]),
    (sum, key, value) => sum + key.length + value, 0)).toBe(8);
  expect(reduceKV({ left: 3, right: 5 }, (keys, key) => [...keys, key], []))
    .toEqual(["left", "right"]);
  expect(reduceKV(null, () => "unreachable", "initial")).toBe("initial");

  let calls = 0;
  expect(reduceKV(vector, (sum, _index, value) => {
    calls += 1;
    return value === 4 ? reduced(sum + value) : sum + value;
  }, 0)).toBe(6);
  expect(calls).toBe(2);

  class ExternalKeyValues {
    constructor(entries) {
      this.entries = Object.freeze(entries.map((entry) => Object.freeze(entry)));
      Object.freeze(this);
    }
  }
  extendProtocolType(IKVReduce, ExternalKeyValues, {
    reduceKV: (source, reducer, initial) => {
      let result = initial;
      for (const [key, value] of source.entries) {
        result = reducer(result, key, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  const external = new ExternalKeyValues([["x", 7], ["y", 9]]);
  expect(reduceKV(external, (sum, _key, value) => sum + value, 0)).toBe(16);
  expect(implementsProtocol(IReduce, external)).toBe(false);
  expect(() => reduceKV(vector, null, 0)).toThrow(
    "key/value reducer must be a function",
  );
  expect(() => reduceKV(vector, () => null)).toThrow(
    "reduceKV requires a collection, reducer, and initial value",
  );
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

test("removal and stack protocols preserve immutable collection categories", () => {
  const map = persistentHashMap(["left", 1], ["right", 2]);
  const set = persistentHashSet("left", "right");
  const tail = persistentList(2, 3);
  const list = tail.conj(1);
  const vector = persistentVector(1, 2, 3);

  for (const protocol of [IMap, ISet, IStack]) {
    expect(Object.isFrozen(protocol)).toBe(true);
  }
  expect(implementsProtocol(IMap, map)).toBe(true);
  expect(implementsProtocol(ISet, set)).toBe(true);
  expect(implementsProtocol(IStack, list)).toBe(true);
  expect(implementsProtocol(IStack, vector)).toBe(true);
  expect(implementsProtocol(IMap, vector)).toBe(false);
  expect(implementsProtocol(ISet, map)).toBe(false);

  expect(map[protocolSlot(IMap, "dissoc")]("left").has("left")).toBe(false);
  expect(set[protocolSlot(ISet, "disj")]("left").has("left")).toBe(false);
  expect(list[protocolSlot(IStack, "peek")]()).toBe(1);
  expect(vector[protocolSlot(IStack, "pop")]()).toEqual(persistentVector(1, 2));

  const removedMap = dissoc(map, "left", "missing");
  expect([...removedMap]).toEqual([["right", 2]]);
  expect([...map]).toEqual(expect.arrayContaining([["left", 1], ["right", 2]]));
  expect(dissoc(map)).toBe(map);
  expect(dissoc(map, "missing")).toBe(map);

  const removedSet = disj(set, "left", "missing");
  expect([...removedSet]).toEqual(["right"]);
  expect([...set]).toEqual(expect.arrayContaining(["left", "right"]));
  expect(disj(set)).toBe(set);
  expect(disj(set, "missing")).toBe(set);

  const storedKey = persistentVector("value", 7);
  const equalKey = persistentVector("value", 7);
  expect(count(dissoc(persistentHashMap([storedKey, "mapped"]), equalKey))).toBe(0);
  expect(count(disj(persistentHashSet(storedKey), equalKey))).toBe(0);

  expect(peek(list)).toBe(1);
  expect(pop(list)).toBe(tail);
  expect(peek(vector)).toBe(3);
  expect(pop(vector)).toEqual(persistentVector(1, 2));
  expect(peek(EMPTY_LIST)).toBe(null);
  expect(peek(EMPTY_VECTOR)).toBe(null);
  expect(() => pop(EMPTY_LIST)).toThrow("cannot pop an empty persistent list");
  expect(() => pop(EMPTY_VECTOR)).toThrow("cannot pop an empty persistent vector");

  const metadata = persistentHashMap(["source", "test"]);
  const annotatedMap = withMeta(map, metadata);
  const annotatedSet = withMeta(set, metadata);
  expect(meta(dissoc(annotatedMap, "left"))).toBe(metadata);
  expect(meta(disj(annotatedSet, "left"))).toBe(metadata);
  expect(dissoc(annotatedMap, "missing")).toBe(annotatedMap);
  expect(disj(annotatedSet, "missing")).toBe(annotatedSet);
  expect(meta(pop(withMeta(list, metadata)))).toBe(null);
  expect(meta(pop(withMeta(vector, metadata)))).toBe(metadata);
  expect(meta(pop(withMeta(persistentVector(1), metadata)))).toBe(metadata);

  const nativeMap = new Map([["left", 1], ["right", 2]]);
  const nativeSet = new Set(["left", "right"]);
  const nativeObject = { left: 1, right: 2 };
  const nativeArray = [1, 2, 3];
  expect([...dissoc(nativeMap, "left")]).toEqual([["right", 2]]);
  expect([...disj(nativeSet, "left")]).toEqual(["right"]);
  expect(dissoc(nativeObject, "left")).toEqual({ right: 2 });
  expect(peek(nativeArray)).toBe(3);
  expect(pop(nativeArray)).toEqual([1, 2]);
  expect([...nativeMap]).toEqual([["left", 1], ["right", 2]]);
  expect([...nativeSet]).toEqual(["left", "right"]);
  expect(nativeObject).toEqual({ left: 1, right: 2 });
  expect(nativeArray).toEqual([1, 2, 3]);
  expect(peek([])).toBe(null);
  expect(() => pop([])).toThrow("cannot pop an empty array");

  expect(dissoc(null, "left")).toBe(null);
  expect(disj(null, "left")).toBe(null);
  expect(peek(null)).toBe(null);
  expect(pop(null)).toBe(null);
  expect(() => dissoc(nativeObject, 1)).toThrow(
    "plain object dissociation keys must be strings",
  );
  expect(() => disj(map, "left")).toThrow(ProtocolDispatchError);
  expect(() => peek(set)).toThrow(ProtocolDispatchError);
  expect(() => peek()).toThrow("peek requires exactly one collection");
  expect(() => pop(vector, 1)).toThrow("pop requires exactly one collection");
});

test("external values can implement removal and stack capabilities independently", () => {
  class ExternalMap {
    constructor(entries) {
      this.entries = Object.freeze(entries);
      Object.freeze(this);
    }
  }
  class ExternalSet {
    constructor(values) {
      this.values = Object.freeze(values);
      Object.freeze(this);
    }
  }
  class ExternalStack {
    constructor(values) {
      this.values = Object.freeze(values);
      Object.freeze(this);
    }
  }
  extendProtocolType(IMap, ExternalMap, {
    dissoc: (source, key) => new ExternalMap(
      source.entries.filter(([entryKey]) => entryKey !== key),
    ),
  });
  extendProtocolType(ISet, ExternalSet, {
    disj: (source, value) => new ExternalSet(
      source.values.filter((entry) => entry !== value),
    ),
  });
  extendProtocolType(IStack, ExternalStack, {
    peek: (source) => source.values.at(-1) ?? null,
    pop: (source) => new ExternalStack(source.values.slice(0, -1)),
  });

  expect(dissoc(new ExternalMap([["left", 1], ["right", 2]]), "left").entries)
    .toEqual([["right", 2]]);
  expect(disj(new ExternalSet([1, 2, 3]), 2).values).toEqual([1, 3]);
  const stack = new ExternalStack([1, 2, 3]);
  expect(peek(stack)).toBe(3);
  expect(pop(stack).values).toEqual([1, 2]);
  expect(implementsProtocol(IConj, stack)).toBe(false);
  expect(implementsProtocol(IIndexed, stack)).toBe(false);
});

test("reversible collections expose replayable reverse traversal without copying roots", () => {
  const vector = persistentVector(1, 2, 3, 4);
  const reversed = rseq(vector);

  expect(Object.isFrozen(IReversible)).toBe(true);
  expect(implementsProtocol(IReversible, vector)).toBe(true);
  expect(implementsProtocol(IReversible, [1, 2])).toBe(true);
  expect(implementsProtocol(IReversible, "ab")).toBe(true);
  expect(implementsProtocol(IReversible, persistentList(1, 2))).toBe(false);
  expect(vector[protocolSlot(IReversible, "rseq")]()).toBeInstanceOf(
    SequenceView,
  );
  expect(isSequenceView(reversed)).toBe(true);
  expect(count(reversed)).toBe(4);
  expect([...reversed]).toEqual([4, 3, 2, 1]);
  expect([...reversed]).toEqual([4, 3, 2, 1]);
  expect([...vector]).toEqual([1, 2, 3, 4]);

  expect([...rseq([1, 2, 3])]).toEqual([3, 2, 1]);
  expect([...rseq("\ud83d\ude00A")]).toEqual(["A", "\ude00", "\ud83d"]);
  expect(rseq(EMPTY_VECTOR)).toBe(null);
  expect(rseq([])).toBe(null);
  expect(rseq("")).toBe(null);
  expect(rseq(null)).toBe(null);
  expect(() => rseq(persistentList(1))).toThrow(ProtocolDispatchError);
  expect(() => rseq()).toThrow("rseq requires exactly one collection");
  expect(() => rseq(vector, 1)).toThrow("rseq requires exactly one collection");

  let reversePulls = 0;
  class ReverseOnly {
    constructor(values) {
      this.values = Object.freeze(values);
      Object.freeze(this);
    }
  }
  extendProtocolType(IReversible, ReverseOnly, {
    rseq: (source) => sequenceView(
      () => {
        let index = source.values.length;
        return {
          next() {
            if (index === 0) return { value: undefined, done: true };
            index -= 1;
            reversePulls += 1;
            return { value: source.values[index], done: false };
          },
        };
      },
      source.values.length,
    ),
  });
  const external = new ReverseOnly([2, 4, 6]);
  expect(implementsProtocol(IReversible, external)).toBe(true);
  expect(implementsProtocol(IReduce, external)).toBe(false);
  expect(last(external, "missing")).toBe(6);
  expect(reversePulls).toBe(1);
  expect([...reverse(external)]).toEqual([6, 4, 2]);
  expect(reversePulls).toBe(4);

  class InvalidReverse {}
  extendProtocolType(IReversible, InvalidReverse, { rseq: () => 42 });
  expect(() => rseq(new InvalidReverse())).toThrow(
    "IReversible/rseq must return null or an iterable sequence view",
  );
});

test("empty preserves logical collection categories and canonical persistent values", () => {
  const vector = persistentVector(1, 2);
  const map = persistentHashMap(["value", 1]);
  const set = persistentHashSet("value");
  const nativeArray = [1, 2];
  const nativeMap = new Map([["value", 1]]);
  const nativeSet = new Set(["value"]);
  const nativeObject = { value: 1 };

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
  expect(empty("value")).toBe("");
  expect(empty(nativeObject)).toEqual({});
  expect(empty(nativeObject)).not.toBe(nativeObject);
  expect(nativeArray).toEqual([1, 2]);
  expect(nativeMap).toEqual(new Map([["value", 1]]));
  expect(nativeSet).toEqual(new Set(["value"]));
  expect(nativeObject).toEqual({ value: 1 });
});

test("conj builds persistent and native collections without mutating inputs", () => {
  const vector = persistentVector(1);
  const map = persistentHashMap(["old", 1]);
  const set = persistentHashSet("old");
  const nativeArray = [1];
  const nativeMap = new Map([["old", 1]]);
  const nativeSet = new Set(["old"]);
  const nativeObject = { old: 1 };

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
  expect(conj(nativeObject, ["next", 2])).toEqual({ old: 1, next: 2 });
  expect(nativeObject).toEqual({ old: 1 });

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
  const nativeObject = { present: undefined };

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
  const changedObject = assoc(nativeObject, "next", 2, "__proto__", 3);
  expect(changedObject).toMatchObject({ present: undefined, next: 2 });
  expect(Object.hasOwn(changedObject, "__proto__")).toBe(true);
  expect(changedObject.__proto__).toBe(3);
  expect(Object.getPrototypeOf(changedObject)).toBe(Object.prototype);
  expect(contains(nativeObject, "present")).toBe(true);
  expect(contains(nativeObject, "toString")).toBe(false);
  expect(contains(nativeObject, Symbol("present"))).toBe(false);
  expect(() => assoc(nativeObject, Symbol("next"), 2)).toThrow(
    "plain object association keys must be strings",
  );
  expect(nativeObject).toEqual({ present: undefined });
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
  const nativeObject = { present: undefined, value: 7 };

  expect([
    count(vector), count(map), count(set),
    count([1, 2, 3]), count(nativeMap), count(nativeSet), count(null),
    count("A😀"), count(nativeObject),
  ]).toEqual([2, 1, 2, 3, 1, 2, 0, 3, 2]);
  expect(get(vector, 0, "missing")).toBeUndefined();
  expect(get(vector, 7, "missing")).toBe("missing");
  expect(get(map, "present", "missing")).toBeUndefined();
  expect(get(nativeMap, "present", "missing")).toBeUndefined();
  expect(get(set, undefined, "missing")).toBeUndefined();
  expect(get(nativeSet, "absent", "missing")).toBe("missing");
  expect(get("A😀", 1)).toBe("\ud83d");
  expect(get(nativeObject, "present", "missing")).toBeUndefined();
  expect(get(nativeObject, "toString", "missing")).toBe("missing");
  expect(nth(vector, 1)).toBe("value");
  expect(nth([3, 5, 8], 2)).toBe(8);
  expect(nth([], 0, "missing")).toBe("missing");
  expect(() => nth(vector, 8)).toThrow(RangeError);
  expect(count({ length: 3 })).toBe(1);

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
  const stringView = seq("A😀");
  const objectView = seq({ left: 1, right: undefined });
  const mutableObject = { left: 1 };
  const mutableObjectView = seq(mutableObject);

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
  expect([...stringView]).toEqual(["A", "\ud83d", "\ude00"]);
  expect(count(stringView)).toBe(3);
  expect([...objectView]).toEqual([["left", 1], ["right", undefined]]);
  expect([...objectView].every(Object.isFrozen)).toBe(true);
  mutableObject.right = 2;
  expect([...mutableObjectView]).toEqual([["left", 1], ["right", 2]]);
  expect(count(mutableObjectView)).toBe(2);
  expect(() => new (vectorView.constructor)()).toThrow(
    "SequenceView values must be created by seq",
  );
});

test("reduction views are immutable replayable IReduce-only values", () => {
  let traversals = 0;
  const view = reductionView((reducer, ...initial) => {
    traversals += 1;
    return reduce([1, 2, 3], reducer, ...initial);
  });

  expect(view).toBeInstanceOf(ReductionView);
  expect(isReductionView(view)).toBe(true);
  expect(isSequenceView(view)).toBe(false);
  expect(Object.isFrozen(view)).toBe(true);
  expect(Object.prototype.toString.call(view)).toBe("[object EliscriptReductionView]");
  expect(implementsProtocol(IReduce, view)).toBe(true);
  expect(implementsProtocol(ISeqable, view)).toBe(false);
  expect(implementsProtocol(ICounted, view)).toBe(false);
  expect(reduce(view, (sum, value) => sum + value, 0)).toBe(6);
  expect(reduce(view, (sum, value) => sum + value)).toBe(6);
  expect(traversals).toBe(2);
  expect(() => count(view)).toThrow(ProtocolDispatchError);
  expect(() => seq(view)).toThrow(ProtocolDispatchError);
  expect(() => reductionView(null)).toThrow(
    "reduction view function must be a function",
  );
  expect(() => new ReductionView()).toThrow(
    "ReductionView values must be created by reductionView",
  );
});

test("unbounded sequence views are replayable without speculative traversal", () => {
  let factories = 0;
  const values = unboundedSequenceView(() => {
    factories += 1;
    let value = 0;
    return {
      next: () => ({ value: value++, done: false }),
    };
  });

  expect(Object.isFrozen(values)).toBe(true);
  expect(isSequenceView(values)).toBe(true);
  expect(seq(values)).toBe(values);
  expect(factories).toBe(0);
  expect(reduce(values, (result, value) =>
    value === 2 ? reduced([...result, value]) : [...result, value], [])).toEqual(
    [0, 1, 2],
  );
  expect(factories).toBe(1);
  expect(() => count(values)).toThrow(
    "unbounded sequence does not have a finite count",
  );
  expect(factories).toBe(1);
  expect(() => unboundedSequenceView(null)).toThrow(
    "unbounded sequence view factory must be a function",
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
  expect(reduce("A😀", (result, unit) => result + unit, "")).toBe("A😀");
  expect(reduce(
    { left: 3, right: 5 },
    (total, entry) => total + entry[1],
    0,
  )).toBe(8);
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
  const objectPrototypeKeys = Reflect.ownKeys(Object.prototype);
  const remote = runInNewContext("[3, 5, 8]");

  expect(() => count(remote)).toThrow(ProtocolDispatchError);
  expect(() => empty(remote)).toThrow(ProtocolDispatchError);
  expect(() => peek(remote)).toThrow(ProtocolDispatchError);
  expect(() => rseq(remote)).toThrow(ProtocolDispatchError);
  extendProtocolType(ICounted, remote.constructor, {
    count: (values) => values.length,
  });
  extendProtocolType(IEmptyable, remote.constructor, {
    empty: (values) => values.slice(0, 0),
  });
  extendProtocolType(IStack, remote.constructor, {
    peek: (values) => values.at(-1) ?? null,
    pop: (values) => values.slice(0, -1),
  });
  extendProtocolType(IReversible, remote.constructor, {
    rseq: (values) => sequenceView(
      () => values.slice().reverse()[Symbol.iterator](),
      values.length,
    ),
  });
  expect(count(remote)).toBe(3);
  expect(empty(remote)).toEqual([]);
  expect(peek(remote)).toBe(8);
  expect(pop(remote)).toEqual([3, 5]);
  expect([...rseq(remote)]).toEqual([8, 5, 3]);
  expect(Reflect.ownKeys(Array.prototype)).toEqual(arrayPrototypeKeys);
  expect(Reflect.ownKeys(Map.prototype)).toEqual(mapPrototypeKeys);
  expect(Reflect.ownKeys(Set.prototype)).toEqual(setPrototypeKeys);
  expect(Reflect.ownKeys(Object.prototype)).toEqual(objectPrototypeKeys);

  class RecordLike {
    constructor() {
      this.value = 1;
    }
  }
  expect(() => count(new RecordLike())).toThrow(ProtocolDispatchError);

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
      indexed: 26,
      keyed: 17,
    },
    construction: {
      vector: [2, 4, 6, 8, 10],
      map: [["left", 3], ["right", 5], ["third", 7]],
      set: ["alpha", "beta", "gamma"],
      associated: [2, 9, 6, 8],
      contains: [true, false, true],
      emptied: [0, 0, 0],
    },
    removal: {
      map: [["right", 5]],
      set: ["beta"],
      object: { right: 5 },
    },
    stack: {
      list: [2, [4, 6, 8]],
      vector: [8, [2, 4, 6]],
      array: [6, [2, 4]],
      nil: [null, null],
    },
    reversible: {
      vector: [8, 6, 4, 2],
      array: [6, 4, 2],
      string: ["c", "b", "a"],
      nil: null,
    },
  });

  const values = Array.from({ length: 1_000_000 }, (_value, index) => index);
  expect(reduce(values, (total, value) => total + value, 0))
    .toBe(499_999_500_000);
  expect(reduceKV(values, (total, index, value) => total + index + value, 0))
    .toBe(999_999_000_000);
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
  const shortened = pop(vector);
  expect(count(shortened)).toBe(999_999);
  expect(peek(shortened)).toBe(999_998);
  expect(peek(vector)).toBe(999_999);
  const reverseReport = reduce(rseq(vector), (report, value) => {
    if (report.count === 0) report.first = value;
    report.last = value;
    report.count += 1;
    report.sum += value;
    return report;
  }, { count: 0, first: null, last: null, sum: 0 });
  expect(reverseReport).toEqual({
    count: 1_000_000,
    first: 999_999,
    last: 0,
    sum: 499_999_500_000,
  });
}, 30_000);
