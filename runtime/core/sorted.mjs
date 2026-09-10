import {
  COLLECTION_ASSOC,
  COLLECTION_CONJ,
  COLLECTION_CONTAINS,
  COLLECTION_COUNT,
  COLLECTION_DISSOC,
  COLLECTION_DISJ,
  COLLECTION_EMPTY,
  COLLECTION_GET,
  COLLECTION_REDUCE,
  COLLECTION_REDUCE_KV,
  COLLECTION_RSEQ,
  COLLECTION_SEQ,
  isReducedValue,
  readCollectionEntry,
  reduceIterable,
  sequenceView,
  unreducedValue,
} from "./collection-internals.mjs";
import { identifierName, identifierNamespace, isKeyword } from "./identifier.mjs";
import { METADATA_READ, METADATA_WITH } from "./metadata-internals.mjs";
import { comparator, compareValues } from "./order.mjs";
import {
  PERSISTENT_MAP_HAS_VALUE_KEY,
  PERSISTENT_MAP_KIND,
  PERSISTENT_SET_HAS_VALUE,
  PERSISTENT_SET_KIND,
  persistentMapValueEqual,
  persistentSetValueEqual,
} from "./persistent-kind.mjs";
import {
  SORTED_MAP_STATE,
  SORTED_SET_STATE,
  sortedAssoc,
  sortedDissoc,
  sortedEntries,
  sortedFind,
} from "./sorted-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  finishHash,
  mixHash,
  unorderedCollectionHash,
} from "./value-internals.mjs";
import { equalValues } from "./value.mjs";

const SORTED_MAP_TOKEN = Symbol("eliscript.sorted-map.constructor-token");
const SORTED_SET_TOKEN = Symbol("eliscript.sorted-set.constructor-token");
const NOT_FOUND = Symbol("eliscript.sorted.not-found");
const PRESENT = Object.freeze({});
const MAP_HASH_TAG = 0x6c8e_9cf5;
const MAP_ENTRY_HASH_TAG = 0x3a91_72eb;
const SET_HASH_TAG = 0x51e7_b32d;
const BOUND_TESTS = new Set(["<", "<=", ">", ">="]);
const DEFAULT_COMPARATOR = comparator(compareValues);

function normalizeComparator(comparison) {
  return comparison === compareValues || comparison === DEFAULT_COMPARATOR
    ? DEFAULT_COMPARATOR
    : comparator(comparison);
}

function makeMap(root, comparison, metadata = null) {
  return new PersistentSortedMap(
    SORTED_MAP_TOKEN,
    root,
    comparison,
    metadata,
  );
}

function makeSet(map, metadata = null) {
  return new PersistentSortedSet(SORTED_SET_TOKEN, map, metadata);
}

function mapPairHash(entry, hash) {
  return finishHash(
    mixHash(mixHash(MAP_ENTRY_HASH_TAG, hash(entry[0])), hash(entry[1])),
    2,
  );
}

function mapIterator(root, comparison, ascending, start = null, end = null) {
  const nodes = sortedEntries(root, comparison, ascending, start, end);
  return (function* entries() {
    for (const item of nodes) {
      yield Object.freeze([item.key, item.value]);
    }
  })();
}

function setIterator(root, comparison, ascending, start = null, end = null) {
  const nodes = sortedEntries(root, comparison, ascending, start, end);
  return (function* values() {
    for (const item of nodes) yield item.key;
  })();
}

function sequenceOrNull(factory) {
  const probe = factory();
  try {
    if (probe.next().done) return null;
  } finally {
    if (typeof probe.return === "function") probe.return();
  }
  return sequenceView(factory);
}

export class PersistentSortedMap {
  constructor(token, root, comparison, metadata = null) {
    if (token !== SORTED_MAP_TOKEN || typeof comparison !== "function") {
      throw new TypeError(
        "PersistentSortedMap values must be created with persistentSortedMap or persistentSortedMapBy",
      );
    }
    this[SORTED_MAP_STATE] = Object.freeze({ root, comparison, metadata });
    Object.freeze(this);
  }

  static empty(comparison = compareValues) {
    return emptySortedMapBy(comparison);
  }

  static from(entries, comparison = compareValues) {
    if (entries instanceof PersistentSortedMap && arguments.length === 1) {
      return entries;
    }
    let result = emptySortedMapBy(comparison);
    for (const entry of entries) {
      const [key, value] = readCollectionEntry(entry);
      result = result.assoc(key, value);
    }
    return result;
  }

  get count() {
    return this[SORTED_MAP_STATE].root?.size ?? 0;
  }

  get size() {
    return this.count;
  }

  get comparator() {
    return this[SORTED_MAP_STATE].comparison;
  }

  get(key, notFound = null) {
    const state = this[SORTED_MAP_STATE];
    const found = sortedFind(state.root, key, state.comparison);
    return found === null ? notFound : found.value;
  }

  has(key) {
    const state = this[SORTED_MAP_STATE];
    return sortedFind(state.root, key, state.comparison) !== null;
  }

  assoc(key, value) {
    const state = this[SORTED_MAP_STATE];
    const result = sortedAssoc(state.root, key, value, state.comparison);
    return result.changed
      ? makeMap(result.root, state.comparison, state.metadata)
      : this;
  }

  dissoc(key) {
    const state = this[SORTED_MAP_STATE];
    const result = sortedDissoc(state.root, key, state.comparison);
    return result.removed
      ? makeMap(result.root, state.comparison, state.metadata)
      : this;
  }

  entries(ascending = true) {
    const state = this[SORTED_MAP_STATE];
    return mapIterator(state.root, state.comparison, ascending);
  }

  keys(ascending = true) {
    const entries = this.entries(ascending);
    return (function* keys() {
      for (const entry of entries) yield entry[0];
    })();
  }

  values(ascending = true) {
    const entries = this.entries(ascending);
    return (function* values() {
      for (const entry of entries) yield entry[1];
    })();
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_EMPTY]() {
    const state = this[SORTED_MAP_STATE];
    return makeMap(null, state.comparison, state.metadata);
  }

  [COLLECTION_CONJ](entry) {
    const [key, value] = readCollectionEntry(entry);
    return this.assoc(key, value);
  }

  [COLLECTION_GET](key, notFound = null) {
    return this.get(key, notFound);
  }

  [COLLECTION_ASSOC](key, value) {
    return this.assoc(key, value);
  }

  [COLLECTION_CONTAINS](key) {
    return this.has(key);
  }

  [COLLECTION_DISSOC](key) {
    return this.dissoc(key);
  }

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.entries(), this.count);
  }

  [COLLECTION_RSEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.entries(false), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [COLLECTION_REDUCE_KV](reducer, initial) {
    let result = initial;
    for (const [key, value] of this) {
      result = reducer(result, key, value);
      if (isReducedValue(result)) return unreducedValue(result);
    }
    return result;
  }

  [PERSISTENT_MAP_HAS_VALUE_KEY](key) {
    const state = this[SORTED_MAP_STATE];
    const found = sortedFind(state.root, key, state.comparison);
    return found !== null && equalValues(found.key, key);
  }

  get [PERSISTENT_MAP_KIND]() {
    return true;
  }

  [VALUE_EQUAL](other, equal) {
    return persistentMapValueEqual(this, other, equal);
  }

  [VALUE_HASH](hash) {
    return unorderedCollectionHash(this, (entry) => mapPairHash(entry, hash), MAP_HASH_TAG);
  }

  [METADATA_READ]() {
    return this[SORTED_MAP_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[SORTED_MAP_STATE];
    return metadata === state.metadata
      ? this
      : makeMap(state.root, state.comparison, metadata);
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentSortedMap";
  }
}

export class PersistentSortedSet {
  constructor(token, map, metadata = null) {
    if (token !== SORTED_SET_TOKEN || !(map instanceof PersistentSortedMap)) {
      throw new TypeError(
        "PersistentSortedSet values must be created with persistentSortedSet or persistentSortedSetBy",
      );
    }
    this[SORTED_SET_STATE] = Object.freeze({ map, metadata });
    Object.freeze(this);
  }

  static empty(comparison = compareValues) {
    return emptySortedSetBy(comparison);
  }

  static from(values, comparison = compareValues) {
    if (values instanceof PersistentSortedSet && arguments.length === 1) {
      return values;
    }
    let result = emptySortedSetBy(comparison);
    for (const value of values) result = result.conj(value);
    return result;
  }

  get count() {
    return this[SORTED_SET_STATE].map.count;
  }

  get size() {
    return this.count;
  }

  get comparator() {
    return this[SORTED_SET_STATE].map.comparator;
  }

  has(value) {
    return this[SORTED_SET_STATE].map.has(value);
  }

  conj(value) {
    const state = this[SORTED_SET_STATE];
    const map = state.map.assoc(value, PRESENT);
    return map === state.map ? this : makeSet(map, state.metadata);
  }

  disj(value) {
    const state = this[SORTED_SET_STATE];
    const map = state.map.dissoc(value);
    return map === state.map ? this : makeSet(map, state.metadata);
  }

  values(ascending = true) {
    const state = this[SORTED_SET_STATE].map[SORTED_MAP_STATE];
    return setIterator(state.root, state.comparison, ascending);
  }

  keys(ascending = true) {
    return this.values(ascending);
  }

  *entries(ascending = true) {
    for (const value of this.values(ascending)) {
      yield Object.freeze([value, value]);
    }
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_EMPTY]() {
    const state = this[SORTED_SET_STATE];
    return makeSet(state.map[COLLECTION_EMPTY](), state.metadata);
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_DISJ](value) {
    return this.disj(value);
  }

  [COLLECTION_GET](value, notFound = null) {
    const state = this[SORTED_SET_STATE].map[SORTED_MAP_STATE];
    const found = sortedFind(state.root, value, state.comparison);
    return found === null ? notFound : found.key;
  }

  [COLLECTION_CONTAINS](value) {
    return this.has(value);
  }

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.values(), this.count);
  }

  [COLLECTION_RSEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.values(false), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [PERSISTENT_SET_HAS_VALUE](value, equal) {
    const state = this[SORTED_SET_STATE].map[SORTED_MAP_STATE];
    const found = sortedFind(state.root, value, state.comparison);
    return found !== null && equal(found.key, value);
  }

  get [PERSISTENT_SET_KIND]() {
    return true;
  }

  [VALUE_EQUAL](other, equal) {
    return persistentSetValueEqual(this, other, equal);
  }

  [VALUE_HASH](hash) {
    return unorderedCollectionHash(this, hash, SET_HASH_TAG);
  }

  [METADATA_READ]() {
    return this[SORTED_SET_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[SORTED_SET_STATE];
    return metadata === state.metadata
      ? this
      : makeSet(state.map, metadata);
  }

  [Symbol.iterator]() {
    return this.values();
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentSortedSet";
  }
}

export const EMPTY_SORTED_MAP = makeMap(null, DEFAULT_COMPARATOR);
export const EMPTY_SORTED_SET = makeSet(EMPTY_SORTED_MAP);

export function emptySortedMapBy(comparison) {
  const normalized = normalizeComparator(comparison);
  return normalized === DEFAULT_COMPARATOR
    ? EMPTY_SORTED_MAP
    : makeMap(null, normalized);
}

export function emptySortedSetBy(comparison) {
  const map = emptySortedMapBy(comparison);
  return map === EMPTY_SORTED_MAP ? EMPTY_SORTED_SET : makeSet(map);
}

function requireEvenKeyValues(keyValues, label) {
  if (keyValues.length % 2 !== 0) {
    throw new TypeError(`${label} expects an even number of key/value forms`);
  }
}

function populateMap(map, keyValues) {
  let result = map;
  for (let index = 0; index < keyValues.length; index += 2) {
    result = result.assoc(keyValues[index], keyValues[index + 1]);
  }
  return result;
}

export function persistentSortedMap(...keyValues) {
  requireEvenKeyValues(keyValues, "persistentSortedMap");
  return populateMap(EMPTY_SORTED_MAP, keyValues);
}

export function persistentSortedMapBy(comparison, ...keyValues) {
  requireEvenKeyValues(keyValues, "persistentSortedMapBy");
  return populateMap(emptySortedMapBy(comparison), keyValues);
}

export function persistentSortedSet(...values) {
  let result = EMPTY_SORTED_SET;
  for (const value of values) result = result.conj(value);
  return result;
}

export function persistentSortedSetBy(comparison, ...values) {
  let result = emptySortedSetBy(comparison);
  for (const value of values) result = result.conj(value);
  return result;
}

export function isPersistentSortedMap(value) {
  return value instanceof PersistentSortedMap;
}

export function isPersistentSortedSet(value) {
  return value instanceof PersistentSortedSet;
}

export function isPersistentSortedCollection(value) {
  return isPersistentSortedMap(value) || isPersistentSortedSet(value);
}

function sortedState(collection) {
  if (collection instanceof PersistentSortedMap) {
    const state = collection[SORTED_MAP_STATE];
    return {
      root: state.root,
      comparison: state.comparison,
      factory: (ascending, start, end) =>
        mapIterator(state.root, state.comparison, ascending, start, end),
    };
  }
  if (collection instanceof PersistentSortedSet) {
    const state = collection[SORTED_SET_STATE].map[SORTED_MAP_STATE];
    return {
      root: state.root,
      comparison: state.comparison,
      factory: (ascending, start, end) =>
        setIterator(state.root, state.comparison, ascending, start, end),
    };
  }
  throw new TypeError("operation requires a persistent sorted collection");
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

export function sortedComparator(collection) {
  return sortedState(collection).comparison;
}

export function sortedSequence(collection, ascending = true) {
  requireBoolean(ascending, "sortedSequence ascending");
  const state = sortedState(collection);
  return state.root === null
    ? null
    : sequenceView(() => state.factory(ascending, null, null), state.root.size);
}

export function sortedSequenceFrom(
  collection,
  key,
  ascending = true,
  inclusive = true,
) {
  requireBoolean(ascending, "sortedSequenceFrom ascending");
  requireBoolean(inclusive, "sortedSequenceFrom inclusive");
  const state = sortedState(collection);
  const start = { key, inclusive };
  return sequenceOrNull(() => state.factory(ascending, start, null));
}

function boundTestName(test) {
  const name = isKeyword(test) && identifierNamespace(test) === null
    ? identifierName(test)
    : test;
  if (typeof name !== "string" || !BOUND_TESTS.has(name)) {
    throw new TypeError("sorted bound test must be one of :<, :<=, :>, or :>=");
  }
  return name;
}

function rangeBounds(bounds) {
  if (bounds.length !== 2 && bounds.length !== 4) {
    throw new TypeError("subsequence expects one or two test/key bounds");
  }
  const firstTest = boundTestName(bounds[0]);
  const first = { key: bounds[1], inclusive: firstTest.includes("=") };
  if (bounds.length === 2) {
    return firstTest.startsWith(">")
      ? { lower: first, upper: null }
      : { lower: null, upper: first };
  }
  const secondTest = boundTestName(bounds[2]);
  if (!firstTest.startsWith(">") || !secondTest.startsWith("<")) {
    throw new TypeError(
      "two-bound subsequence requires a lower :>/:>= bound then an upper :</:<= bound",
    );
  }
  return {
    lower: first,
    upper: { key: bounds[3], inclusive: secondTest.includes("=") },
  };
}

function rangeSequence(collection, ascending, bounds) {
  const state = sortedState(collection);
  const normalized = rangeBounds(bounds);
  const start = ascending ? normalized.lower : normalized.upper;
  const end = ascending ? normalized.upper : normalized.lower;
  return sequenceOrNull(() => state.factory(ascending, start, end));
}

export function subsequence(collection, ...bounds) {
  return rangeSequence(collection, true, bounds);
}

export function reverseSubsequence(collection, ...bounds) {
  return rangeSequence(collection, false, bounds);
}
