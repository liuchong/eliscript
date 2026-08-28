import {
  EMPTY_MAP,
  PersistentHashMap,
} from "./map.mjs";
import {
  SET_CONSTRUCTOR_TOKEN,
  SET_PRESENT,
  SET_STATE,
} from "./set-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  unorderedCollectionHash,
} from "./value-internals.mjs";
import {
  COLLECTION_COUNT,
  COLLECTION_EMPTY,
  COLLECTION_CONJ,
  COLLECTION_GET,
  COLLECTION_CONTAINS,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";

const SET_HASH_TAG = 0x51e7_b32d;

function makeSet(map) {
  return new PersistentHashSet(SET_CONSTRUCTOR_TOKEN, map);
}

function asPersistentSet(values) {
  return values instanceof PersistentHashSet
    ? values
    : PersistentHashSet.from(values);
}

export class PersistentHashSet {
  constructor(token, map) {
    if (token !== SET_CONSTRUCTOR_TOKEN || !(map instanceof PersistentHashMap)) {
      throw new TypeError(
        "PersistentHashSet values must be created with persistentHashSet or PersistentHashSet.from",
      );
    }
    this[SET_STATE] = Object.freeze({ map });
    Object.freeze(this);
  }

  static empty() {
    return EMPTY_SET;
  }

  static from(values) {
    if (values instanceof PersistentHashSet) {
      return values;
    }
    let result = EMPTY_SET;
    for (const value of values) {
      result = result.conj(value);
    }
    return result;
  }

  get count() {
    return this[SET_STATE].map.count;
  }

  get size() {
    return this[SET_STATE].map.count;
  }

  has(value) {
    return this[SET_STATE].map.has(value);
  }

  conj(value) {
    const state = this[SET_STATE];
    const map = state.map.assoc(value, SET_PRESENT);
    return map === state.map ? this : makeSet(map);
  }

  disj(value) {
    const state = this[SET_STATE];
    const map = state.map.dissoc(value);
    if (map === state.map) {
      return this;
    }
    return map === EMPTY_MAP ? EMPTY_SET : makeSet(map);
  }

  union(...collections) {
    let result = this;
    for (const collection of collections) {
      for (const value of collection) {
        result = result.conj(value);
      }
    }
    return result;
  }

  intersection(...collections) {
    let result = this;
    for (const collection of collections) {
      const other = asPersistentSet(collection);
      if (result.count === 0) {
        return result;
      }
      const candidates = result.count <= other.count ? result : other;
      const membership = candidates === result ? other : result;
      let retained = EMPTY_SET;
      for (const value of candidates) {
        if (membership.has(value)) {
          retained = retained.conj(value);
        }
      }
      result = retained.count === result.count ? result : retained;
    }
    return result;
  }

  difference(...collections) {
    let result = this;
    for (const collection of collections) {
      for (const value of collection) {
        result = result.disj(value);
      }
      if (result.count === 0) {
        return result;
      }
    }
    return result;
  }

  isSubsetOf(collection) {
    const other = asPersistentSet(collection);
    if (this.count > other.count) {
      return false;
    }
    for (const value of this) {
      if (!other.has(value)) {
        return false;
      }
    }
    return true;
  }

  isSupersetOf(collection) {
    return asPersistentSet(collection).isSubsetOf(this);
  }

  isDisjointFrom(collection) {
    const other = asPersistentSet(collection);
    const candidates = this.count <= other.count ? this : other;
    const membership = candidates === this ? other : this;
    for (const value of candidates) {
      if (membership.has(value)) {
        return false;
      }
    }
    return true;
  }

  values() {
    return this[SET_STATE].map.keys();
  }

  keys() {
    return this.values();
  }

  *entries() {
    for (const value of this) {
      yield Object.freeze([value, value]);
    }
  }

  reduce(reducer, initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent hash set reducer must be a function");
    }
    if (arguments.length < 2) {
      throw new TypeError("persistent hash set reduce requires an initial value");
    }
    let result = initial;
    for (const value of this) {
      result = reducer(result, value, this);
    }
    return result;
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_EMPTY]() {
    return EMPTY_SET;
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_GET](value, notFound = null) {
    return this.has(value) ? value : notFound;
  }

  [COLLECTION_CONTAINS](value) {
    return this.has(value);
  }

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.values(), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  toSet() {
    return new Set(this);
  }

  [VALUE_EQUAL](other) {
    if (!(other instanceof PersistentHashSet) || other.count !== this.count) {
      return false;
    }
    for (const value of this) {
      if (!other.has(value)) {
        return false;
      }
    }
    return true;
  }

  [VALUE_HASH](hash) {
    return unorderedCollectionHash(this, hash, SET_HASH_TAG);
  }

  [Symbol.iterator]() {
    return this.values();
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentHashSet";
  }
}

export const EMPTY_SET = makeSet(EMPTY_MAP);

export function persistentHashSet(...values) {
  return PersistentHashSet.from(values);
}

export function isPersistentHashSet(value) {
  return value instanceof PersistentHashSet;
}
