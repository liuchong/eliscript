import {
  MAP_CONSTRUCTOR_TOKEN,
  MAP_NOT_FOUND,
  MAP_STATE,
  EMPTY_BITMAP_NODE,
  mapAssoc,
  mapDissoc,
  mapEntries,
  mapFind,
  mapHash,
} from "./map-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  finishHash,
  mixHash,
  unorderedCollectionHash,
} from "./value-internals.mjs";
import {
  COLLECTION_COUNT,
  COLLECTION_GET,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";

const MAP_HASH_TAG = 0x6c8e_9cf5;
const MAP_ENTRY_HASH_TAG = 0x3a91_72eb;

function makeMap(count, root) {
  return new PersistentHashMap(MAP_CONSTRUCTOR_TOKEN, count, root);
}

function pairHash(entry, hash) {
  return finishHash(
    mixHash(mixHash(MAP_ENTRY_HASH_TAG, hash(entry.key)), hash(entry.value)),
    2,
  );
}

function readEntryPair(entry) {
  if (entry === null || entry === undefined ||
      typeof entry[Symbol.iterator] !== "function") {
    throw new TypeError("persistent hash map entries must be iterable key/value pairs");
  }
  const values = [...entry];
  if (values.length !== 2) {
    throw new TypeError("persistent hash map entries must contain exactly two values");
  }
  return values;
}

export class PersistentHashMap {
  constructor(token, count, root) {
    if (token !== MAP_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentHashMap values must be created with persistentHashMap or PersistentHashMap.from",
      );
    }
    this[MAP_STATE] = Object.freeze({ count, root });
    Object.freeze(this);
  }

  static empty() {
    return EMPTY_MAP;
  }

  static from(entries) {
    if (entries instanceof PersistentHashMap) {
      return entries;
    }
    let result = EMPTY_MAP;
    for (const entry of entries) {
      const [key, value] = readEntryPair(entry);
      result = result.assoc(key, value);
    }
    return result;
  }

  get count() {
    return this[MAP_STATE].count;
  }

  get size() {
    return this[MAP_STATE].count;
  }

  get(key, notFound = null) {
    return mapFind(
      this[MAP_STATE].root,
      mapHash(key),
      key,
      notFound,
    );
  }

  has(key) {
    return this.get(key, MAP_NOT_FOUND) !== MAP_NOT_FOUND;
  }

  assoc(key, value) {
    const state = this[MAP_STATE];
    const result = mapAssoc(state.root, mapHash(key), key, value);
    if (!result.changed) {
      return this;
    }
    return makeMap(state.count + (result.added ? 1 : 0), result.item);
  }

  dissoc(key) {
    const state = this[MAP_STATE];
    const result = mapDissoc(state.root, mapHash(key), key);
    if (!result.removed) {
      return this;
    }
    if (state.count === 1) {
      return EMPTY_MAP;
    }
    return makeMap(state.count - 1, result.item ?? EMPTY_BITMAP_NODE);
  }

  *entries() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield Object.freeze([entry.key, entry.value]);
    }
  }

  *keys() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield entry.key;
    }
  }

  *values() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield entry.value;
    }
  }

  reduce(reducer, initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent hash map reducer must be a function");
    }
    if (arguments.length < 2) {
      throw new TypeError("persistent hash map reduce requires an initial value");
    }
    let result = initial;
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      result = reducer(result, entry.value, entry.key, this);
    }
    return result;
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_GET](key, notFound = null) {
    return this.get(key, notFound);
  }

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.entries(), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  toMap() {
    return new Map(this.entries());
  }

  [VALUE_EQUAL](other, equal) {
    if (!(other instanceof PersistentHashMap) || other.count !== this.count) {
      return false;
    }
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      const value = other.get(entry.key, MAP_NOT_FOUND);
      if (value === MAP_NOT_FOUND || !equal(entry.value, value)) {
        return false;
      }
    }
    return true;
  }

  [VALUE_HASH](hash) {
    return unorderedCollectionHash(
      mapEntries(this[MAP_STATE].root),
      (entry) => pairHash(entry, hash),
      MAP_HASH_TAG,
    );
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentHashMap";
  }
}

export const EMPTY_MAP = makeMap(0, EMPTY_BITMAP_NODE);

export function persistentHashMap(...entries) {
  return PersistentHashMap.from(entries);
}

export function isPersistentHashMap(value) {
  return value instanceof PersistentHashMap;
}
