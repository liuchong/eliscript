import {
  EMPTY_MAP,
  PersistentHashMap,
} from "./map.mjs";
import {
  SET_CONSTRUCTOR_TOKEN,
  SET_PRESENT,
  SET_STATE,
  TRANSIENT_SET_CONSTRUCTOR_TOKEN,
  TRANSIENT_SET_STATE,
  recordInvalidTransientSetCall,
  recordTransientSetPersistent,
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
  COLLECTION_DISJ,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";
import {
  EDITABLE_TRANSIENT,
  TRANSIENT_ASSOC,
  TRANSIENT_CONJ,
  TRANSIENT_DISSOC,
  TRANSIENT_PERSISTENT,
} from "./transient-internals.mjs";
import {
  METADATA_READ,
  METADATA_WITH,
} from "./metadata-internals.mjs";
import {
  PERSISTENT_SET_HAS_VALUE,
  PERSISTENT_SET_KIND,
  persistentSetValueEqual,
} from "./persistent-kind.mjs";

const SET_HASH_TAG = 0x51e7_b32d;

function makeSet(map, metadata = null) {
  return new PersistentHashSet(SET_CONSTRUCTOR_TOKEN, map, metadata);
}

function emptySetWithMetadata(metadata) {
  return metadata === null ? EMPTY_SET : makeSet(EMPTY_MAP, metadata);
}

function makeTransientSet(set) {
  return new TransientHashSet(TRANSIENT_SET_CONSTRUCTOR_TOKEN, set);
}

function activeTransientSetState(set) {
  const state = set[TRANSIENT_SET_STATE];
  if (!state.active) {
    recordInvalidTransientSetCall();
    throw new TypeError("transient hash set is no longer editable");
  }
  return state;
}

function asPersistentSet(values) {
  return values instanceof PersistentHashSet
    ? values
    : PersistentHashSet.from(values);
}

class TransientHashSet {
  constructor(token, set) {
    if (token !== TRANSIENT_SET_CONSTRUCTOR_TOKEN ||
        !(set instanceof PersistentHashSet)) {
      throw new TypeError(
        "transient hash sets must be created from a persistent hash set",
      );
    }
    const sourceMap = set[SET_STATE].map;
    const metadata = set[SET_STATE].metadata;
    this[TRANSIENT_SET_STATE] = {
      active: true,
      source: set,
      sourceMap,
      map: sourceMap[EDITABLE_TRANSIENT](),
      metadata,
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient hash sets cannot be serialized");
      },
    });
    Object.freeze(this);
  }

  [TRANSIENT_CONJ](value) {
    const state = activeTransientSetState(this);
    state.map[TRANSIENT_ASSOC](value, SET_PRESENT);
    return this;
  }

  [TRANSIENT_DISSOC](value) {
    const state = activeTransientSetState(this);
    state.map[TRANSIENT_DISSOC](value);
    return this;
  }

  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientSetState(this);
    const map = state.map[TRANSIENT_PERSISTENT]();
    const result = map === state.sourceMap
      ? state.source
      : (map === EMPTY_MAP
        ? emptySetWithMetadata(state.metadata)
        : makeSet(map, state.metadata));
    state.active = false;
    recordTransientSetPersistent();
    return result;
  }

  toJSON() {
    throw new TypeError("transient hash sets cannot be serialized");
  }

  get [Symbol.toStringTag]() {
    return "EliscriptTransientHashSet";
  }
}

export class PersistentHashSet {
  constructor(token, map, metadata = null) {
    if (token !== SET_CONSTRUCTOR_TOKEN || !(map instanceof PersistentHashMap)) {
      throw new TypeError(
        "PersistentHashSet values must be created with persistentHashSet or PersistentHashSet.from",
      );
    }
    this[SET_STATE] = Object.freeze({ map, metadata });
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
    return map === state.map ? this : makeSet(map, state.metadata);
  }

  disj(value) {
    const state = this[SET_STATE];
    const map = state.map.dissoc(value);
    if (map === state.map) {
      return this;
    }
    return map === EMPTY_MAP
      ? emptySetWithMetadata(state.metadata)
      : makeSet(map, state.metadata);
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
      let retained = emptySetWithMetadata(this[SET_STATE].metadata);
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
    return emptySetWithMetadata(this[SET_STATE].metadata);
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_DISJ](value) {
    return this.disj(value);
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

  [EDITABLE_TRANSIENT]() {
    return makeTransientSet(this);
  }

  toSet() {
    return new Set(this);
  }

  [PERSISTENT_SET_HAS_VALUE](value) {
    return this.has(value);
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
    return this[SET_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[SET_STATE];
    return metadata === state.metadata
      ? this
      : makeSet(state.map, metadata);
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
