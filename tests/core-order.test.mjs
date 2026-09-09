import { expect, test } from "bun:test";

import { IReduce } from "../runtime/core/collection.mjs";
import {
  eliscriptSymbol,
  keyword,
} from "../runtime/core/identifier.mjs";
import { PersistentList } from "../runtime/core/list.mjs";
import {
  comparator,
  compareValues,
  IComparable,
  maxKey,
  minKey,
  reverseComparator,
  sort,
  sortBy,
} from "../runtime/core/order.mjs";
import {
  extendProtocolType,
  ProtocolDispatchError,
} from "../runtime/core/protocol.mjs";
import {
  PersistentVector,
  persistentVector,
} from "../runtime/core/vector.mjs";

test("natural comparison defines deterministic scalar and sequential order", () => {
  expect(compareValues(null, undefined)).toBe(-1);
  expect(compareValues(undefined, false)).toBe(-1);
  expect(compareValues(false, true)).toBe(-1);
  expect(compareValues(-Infinity, 0)).toBe(-1);
  expect(compareValues(Infinity, NaN)).toBe(-1);
  expect(compareValues(NaN, NaN)).toBe(0);
  expect(compareValues(10n, 2n)).toBe(1);
  expect(compareValues("alpha", "beta")).toBe(-1);
  expect(compareValues(keyword("a/item"), keyword("b/item"))).toBe(-1);
  expect(compareValues(
    eliscriptSymbol("a/item"),
    eliscriptSymbol("a/item"),
  )).toBe(0);
  expect(compareValues(
    persistentVector(1, 2),
    persistentVector(1, 2, 0),
  )).toBe(-1);
  expect(compareValues(
    PersistentList.from([1, persistentVector(2, 4)]),
    PersistentList.from([1, persistentVector(3)]),
  )).toBe(-1);

  expect(() => compareValues(1, "1")).toThrow(
    "cannot compare number to string",
  );
  expect(() => compareValues(keyword("item"), eliscriptSymbol("item")))
    .toThrow("cannot compare keyword to symbol");
  expect(() => compareValues(new Map(), new Map()))
    .toThrow(ProtocolDispatchError);
});

test("IComparable remains open to user-defined value types", () => {
  class Ranked {
    constructor(rank, label) {
      this.rank = rank;
      this.label = label;
      Object.freeze(this);
    }
  }
  extendProtocolType(IComparable, Ranked, {
    compare: (left, right) => left.rank - right.rank,
  });

  const low = new Ranked(1, "low");
  const high = new Ranked(9, "high");
  expect(compareValues(low, high)).toBe(-1);
  expect([...sort([high, low])]).toEqual([low, high]);

  class InvalidComparable {}
  extendProtocolType(IComparable, InvalidComparable, {
    compare: () => Infinity,
  });
  expect(() => compareValues(new InvalidComparable(), new InvalidComparable()))
    .toThrow("IComparable/compare must return a finite number");
});

test("comparator adapts numeric and truth-predicate comparisons", () => {
  expect(comparator((left, right) => left - right)(1, 2)).toBe(-1);
  expect(comparator((left, right) => left < right)(2, 1)).toBe(1);
  expect([...sort((left, right) => left > right, [1, 3, 2])])
    .toEqual([3, 2, 1]);
  expect([...sort(reverseComparator(), [1, 3, 2])]).toEqual([3, 2, 1]);
  expect([...sort(reverseComparator((left, right) => left.length - right.length),
    ["a", "bbb", "cc"])]).toEqual(["bbb", "cc", "a"]);

  expect(() => comparator(null)).toThrow("comparator comparison must be a function");
  expect(() => comparator(() => NaN)(1, 2))
    .toThrow("comparator comparison must return a finite number");
  expect(() => reverseComparator(compareValues, compareValues))
    .toThrow("reverseComparator expects zero or one comparator");
});

test("sort is stable, protocol-driven, persistent, and non-mutating", () => {
  class Values {
    constructor(values) {
      this.values = values;
    }
  }
  extendProtocolType(IReduce, Values, {
    reduce: (source, reducer, initial) => {
      let result = initial;
      for (const value of source.values) result = reducer(result, value);
      return result;
    },
  });

  const original = [3, 1, 2, 1];
  const sorted = sort(new Values(original));
  expect(sorted).toBeInstanceOf(PersistentVector);
  expect([...sorted]).toEqual([1, 1, 2, 3]);
  expect(original).toEqual([3, 1, 2, 1]);
  expect(sort(null)).toBe(PersistentVector.empty());

  const records = [
    { group: 2, id: "first" },
    { group: 1, id: "middle" },
    { group: 2, id: "last" },
  ];
  let keyCalls = 0;
  const ordered = sortBy((value) => {
    keyCalls += 1;
    return value.group;
  }, records);
  expect([...ordered].map(({ id }) => id)).toEqual(["middle", "first", "last"]);
  expect(keyCalls).toBe(records.length);
});

test("minKey and maxKey evaluate each key once and choose the last tie", () => {
  const values = [
    { score: 2, id: "first-high" },
    { score: 1, id: "low" },
    { score: 2, id: "last-high" },
  ];
  let minCalls = 0;
  let maxCalls = 0;
  expect(minKey((value) => {
    minCalls += 1;
    return value.score;
  }, ...values).id).toBe("low");
  expect(maxKey((value) => {
    maxCalls += 1;
    return value.score;
  }, ...values).id).toBe("last-high");
  expect(minCalls).toBe(values.length);
  expect(maxCalls).toBe(values.length);
  expect(() => minKey((value) => value)).toThrow(
    "minKey expects a key function and at least one value",
  );
  expect(() => maxKey(null, 1)).toThrow("maxKey key function must be a function");
});

test("sorting APIs enforce their complete arity and callback contracts", () => {
  expect(() => sort()).toThrow(
    "sort expects a collection or comparator and collection",
  );
  expect(() => sort(compareValues, [], [])).toThrow(
    "sort expects a collection or comparator and collection",
  );
  expect(() => sortBy(null, [])).toThrow("sortBy key function must be a function");
  expect(() => sortBy((value) => value)).toThrow(
    "sortBy expects a key function, optional comparator, and collection",
  );
  expect(() => sortBy((value) => value, compareValues, [], [])).toThrow(
    "sortBy expects a key function, optional comparator, and collection",
  );
});
