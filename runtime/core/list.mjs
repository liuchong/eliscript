import {
  COLLECTION_CONJ,
  COLLECTION_COUNT,
  COLLECTION_EMPTY,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";
import {
  LIST_CONSTRUCTOR_TOKEN,
  LIST_STATE,
  recordListNodeAllocation,
} from "./list-internals.mjs";
import {
  METADATA_READ,
  METADATA_WITH,
} from "./metadata-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  orderedCollectionHash,
} from "./value-internals.mjs";

const MAX_COUNT = 0x7fff_ffff;
const MISSING = Symbol("eliscript.list.missing");
const LIST_HASH_TAG = 0x2f4a_6d19;

function makeList(count, value, rest, metadata = null) {
  recordListNodeAllocation();
  return new PersistentList(
    LIST_CONSTRUCTOR_TOKEN,
    count,
    false,
    value,
    rest,
    metadata,
  );
}

function emptyListWithMetadata(metadata) {
  return metadata === null
    ? EMPTY_LIST
    : new PersistentList(
      LIST_CONSTRUCTOR_TOKEN,
      0,
      true,
      undefined,
      null,
      metadata,
    );
}

export class PersistentList {
  constructor(token, count, empty, value, rest, metadata = null) {
    if (token !== LIST_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentList values must be created with persistentList or PersistentList.from",
      );
    }
    this[LIST_STATE] = Object.freeze({
      count,
      empty,
      value,
      rest,
      metadata,
    });
    Object.freeze(this);
  }

  static empty() {
    return EMPTY_LIST;
  }

  static from(iterable) {
    if (iterable instanceof PersistentList) {
      return iterable;
    }
    const values = Array.from(iterable);
    if (values.length > MAX_COUNT) {
      throw new RangeError(`persistent list cannot exceed ${MAX_COUNT} values`);
    }
    let result = EMPTY_LIST;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      result = makeList(result.count + 1, values[index], result);
    }
    return result;
  }

  get count() {
    return this[LIST_STATE].count;
  }

  get size() {
    return this[LIST_STATE].count;
  }

  get isEmpty() {
    return this[LIST_STATE].empty;
  }

  first(notFound = null) {
    const state = this[LIST_STATE];
    return state.empty ? notFound : state.value;
  }

  rest() {
    const state = this[LIST_STATE];
    return state.empty ? this : state.rest;
  }

  peek(notFound = null) {
    return this.first(notFound);
  }

  pop() {
    if (this[LIST_STATE].empty) {
      throw new RangeError("cannot pop an empty persistent list");
    }
    return this[LIST_STATE].rest;
  }

  conj(value) {
    if (this.count === MAX_COUNT) {
      throw new RangeError(`persistent list cannot exceed ${MAX_COUNT} values`);
    }
    return makeList(this.count + 1, value, this, this[LIST_STATE].metadata);
  }

  cons(value) {
    return this.conj(value);
  }

  nth(index, notFound = MISSING) {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      if (notFound !== MISSING) {
        return notFound;
      }
      throw new RangeError(
        `nth index ${String(index)} is outside [0, ${this.count})`,
      );
    }
    let node = this;
    let remaining = index;
    while (remaining > 0) {
      node = node[LIST_STATE].rest;
      remaining -= 1;
    }
    return node[LIST_STATE].value;
  }

  reduce(reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  toArray() {
    return [...this];
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_EMPTY]() {
    return emptyListWithMetadata(this[LIST_STATE].metadata);
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_SEQ]() {
    return this.isEmpty
      ? null
      : sequenceView(() => this[Symbol.iterator](), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [VALUE_EQUAL](other, equal) {
    if (!(other instanceof PersistentList) || other.count !== this.count) {
      return false;
    }
    const right = other[Symbol.iterator]();
    for (const value of this) {
      if (!equal(value, right.next().value)) {
        return false;
      }
    }
    return true;
  }

  [VALUE_HASH](hash) {
    return orderedCollectionHash(this, hash, LIST_HASH_TAG);
  }

  [METADATA_READ]() {
    return this[LIST_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[LIST_STATE];
    if (metadata === state.metadata) {
      return this;
    }
    return state.empty
      ? emptyListWithMetadata(metadata)
      : makeList(state.count, state.value, state.rest, metadata);
  }

  *[Symbol.iterator]() {
    let node = this;
    while (!node[LIST_STATE].empty) {
      yield node[LIST_STATE].value;
      node = node[LIST_STATE].rest;
    }
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentList";
  }
}

export const EMPTY_LIST = new PersistentList(
  LIST_CONSTRUCTOR_TOKEN,
  0,
  true,
  undefined,
  null,
);

export function persistentList(...values) {
  return PersistentList.from(values);
}

export function isPersistentList(value) {
  return value instanceof PersistentList;
}

function requireList(value, operation) {
  if (!(value instanceof PersistentList)) {
    throw new TypeError(`${operation} expects a persistent List or nil`);
  }
  return value;
}

export function first(value, notFound = null) {
  return value == null
    ? notFound
    : requireList(value, "first").first(notFound);
}

export function rest(value) {
  return value == null
    ? EMPTY_LIST
    : requireList(value, "rest").rest();
}

export function cons(value, list) {
  return (list == null ? EMPTY_LIST : requireList(list, "cons")).cons(value);
}
