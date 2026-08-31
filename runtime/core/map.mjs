import {
  MAP_CONSTRUCTOR_TOKEN,
  MAP_NOT_FOUND,
  MAP_STATE,
  TRANSIENT_MAP_CONSTRUCTOR_TOKEN,
  TRANSIENT_MAP_STATE,
  EMPTY_BITMAP_NODE,
  mapAssoc,
  mapAssocTransient,
  mapDissoc,
  mapDissocTransient,
  mapEntries,
  mapFind,
  mapHash,
  recordInvalidTransientMapCall,
  recordTransientMapPersistent,
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
  COLLECTION_EMPTY,
  COLLECTION_CONJ,
  COLLECTION_GET,
  COLLECTION_ASSOC,
  COLLECTION_CONTAINS,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  readCollectionEntry,
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

const MAP_HASH_TAG = 0x6c8e_9cf5;
const MAP_ENTRY_HASH_TAG = 0x3a91_72eb;

function makeMap(count, root, metadata = null) {
  return new PersistentHashMap(MAP_CONSTRUCTOR_TOKEN, count, root, metadata);
}

function emptyMapWithMetadata(metadata) {
  return metadata === null
    ? EMPTY_MAP
    : makeMap(0, EMPTY_BITMAP_NODE, metadata);
}

function makeTransientMap(map) {
  return new TransientHashMap(TRANSIENT_MAP_CONSTRUCTOR_TOKEN, map);
}

function activeTransientMapState(map) {
  const state = map[TRANSIENT_MAP_STATE];
  if (!state.active) {
    recordInvalidTransientMapCall();
    throw new TypeError("transient hash map is no longer editable");
  }
  return state;
}

function pairHash(entry, hash) {
  return finishHash(
    mixHash(mixHash(MAP_ENTRY_HASH_TAG, hash(entry.key)), hash(entry.value)),
    2,
  );
}

class TransientHashMap {
  constructor(token, map) {
    if (token !== TRANSIENT_MAP_CONSTRUCTOR_TOKEN ||
        !(map instanceof PersistentHashMap)) {
      throw new TypeError(
        "transient hash maps must be created from a persistent hash map",
      );
    }
    const source = map[MAP_STATE];
    this[TRANSIENT_MAP_STATE] = {
      active: true,
      changed: false,
      owner: Object.freeze({}),
      source: map,
      count: source.count,
      root: source.root,
      metadata: source.metadata,
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient hash maps cannot be serialized");
      },
    });
    Object.freeze(this);
  }

  [TRANSIENT_CONJ](entry) {
    const [key, value] = readCollectionEntry(entry);
    return this[TRANSIENT_ASSOC](key, value);
  }

  [TRANSIENT_ASSOC](key, value) {
    const state = activeTransientMapState(this);
    const result = mapAssocTransient(
      state.root,
      state.owner,
      mapHash(key),
      key,
      value,
    );
    if (result.changed) {
      state.root = result.item;
      state.count += result.added ? 1 : 0;
      state.changed = true;
    }
    return this;
  }

  [TRANSIENT_DISSOC](key) {
    const state = activeTransientMapState(this);
    const result = mapDissocTransient(
      state.root,
      state.owner,
      mapHash(key),
      key,
    );
    if (result.removed) {
      state.count -= 1;
      state.root = state.count === 0
        ? EMPTY_BITMAP_NODE
        : (result.item ?? EMPTY_BITMAP_NODE);
      state.changed = true;
    }
    return this;
  }

  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientMapState(this);
    const result = !state.changed
      ? state.source
      : state.count === 0
        ? emptyMapWithMetadata(state.metadata)
        : makeMap(state.count, state.root, state.metadata);
    state.active = false;
    state.owner = null;
    recordTransientMapPersistent();
    return result;
  }

  toJSON() {
    throw new TypeError("transient hash maps cannot be serialized");
  }

  get [Symbol.toStringTag]() {
    return "EliscriptTransientHashMap";
  }
}

export class PersistentHashMap {
  constructor(token, count, root, metadata = null) {
    if (token !== MAP_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentHashMap values must be created with persistentHashMap or PersistentHashMap.from",
      );
    }
    this[MAP_STATE] = Object.freeze({ count, root, metadata });
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
      const [key, value] = readCollectionEntry(entry);
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
    return makeMap(
      state.count + (result.added ? 1 : 0),
      result.item,
      state.metadata,
    );
  }

  dissoc(key) {
    const state = this[MAP_STATE];
    const result = mapDissoc(state.root, mapHash(key), key);
    if (!result.removed) {
      return this;
    }
    if (state.count === 1) {
      return emptyMapWithMetadata(state.metadata);
    }
    return makeMap(
      state.count - 1,
      result.item ?? EMPTY_BITMAP_NODE,
      state.metadata,
    );
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

  [COLLECTION_EMPTY]() {
    return emptyMapWithMetadata(this[MAP_STATE].metadata);
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

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this.entries(), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [EDITABLE_TRANSIENT]() {
    return makeTransientMap(this);
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

  [METADATA_READ]() {
    return this[MAP_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[MAP_STATE];
    return metadata === state.metadata
      ? this
      : makeMap(state.count, state.root, metadata);
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
