import {
  defineProtocol,
  protocolMethod,
  protocolSlot,
} from "./protocol.mjs";

export const I_COUNTED = defineProtocol("ICounted", ["count"]);
export const I_LOOKUP = defineProtocol("ILookup", ["get"]);
export const I_INDEXED = defineProtocol("IIndexed", ["nth"]);
export const I_SEQABLE = defineProtocol("ISeqable", ["seq"]);
export const I_REDUCE = defineProtocol("IReduce", ["reduce"]);

export const COLLECTION_COUNT = protocolSlot(I_COUNTED, "count");
export const COLLECTION_GET = protocolSlot(I_LOOKUP, "get");
export const COLLECTION_NTH = protocolSlot(I_INDEXED, "nth");
export const COLLECTION_SEQ = protocolSlot(I_SEQABLE, "seq");
export const COLLECTION_REDUCE = protocolSlot(I_REDUCE, "reduce");

export const dispatchCollectionCount = protocolMethod(I_COUNTED, "count");
export const dispatchCollectionGet = protocolMethod(I_LOOKUP, "get");
export const dispatchCollectionNth = protocolMethod(I_INDEXED, "nth");
export const dispatchCollectionSeq = protocolMethod(I_SEQABLE, "seq");
export const dispatchCollectionReduce = protocolMethod(I_REDUCE, "reduce");

const NO_INITIAL = Symbol("eliscript.collection.no-initial");
const REDUCED_STATE = Symbol("eliscript.collection.reduced-state");
const SEQUENCE_STATE = Symbol("eliscript.collection.sequence-state");
const SEQUENCE_TOKEN = Symbol("eliscript.collection.sequence-token");

function checkedCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("collection count must be a non-negative safe integer");
  }
  return value;
}

function iteratorFromFactory(factory) {
  const iterator = factory();
  if (iterator === null || typeof iterator !== "object" ||
      typeof iterator.next !== "function") {
    throw new TypeError("sequence view factory must return an iterator");
  }
  return iterator;
}

function sequenceCount(state) {
  if (typeof state.count === "function") {
    return checkedCount(state.count());
  }
  if (state.count !== null) {
    return state.count;
  }
  const iterator = iteratorFromFactory(state.factory);
  let count = 0;
  while (!iterator.next().done) {
    count += 1;
    checkedCount(count);
  }
  return count;
}

export class SequenceView {
  constructor(token, factory, count) {
    if (token !== SEQUENCE_TOKEN || typeof factory !== "function") {
      throw new TypeError("SequenceView values must be created by seq");
    }
    this[SEQUENCE_STATE] = Object.freeze({ factory, count });
    Object.freeze(this);
  }

  [COLLECTION_COUNT]() {
    return sequenceCount(this[SEQUENCE_STATE]);
  }

  [COLLECTION_SEQ]() {
    return this[COLLECTION_COUNT]() === 0 ? null : this;
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [Symbol.iterator]() {
    return iteratorFromFactory(this[SEQUENCE_STATE].factory);
  }

  get [Symbol.toStringTag]() {
    return "EliscriptSequenceView";
  }
}

export function sequenceView(factory, count = null) {
  if (typeof factory !== "function") {
    throw new TypeError("sequence view factory must be a function");
  }
  if (count !== null && typeof count !== "function") {
    checkedCount(count);
    if (count === 0) {
      return null;
    }
  }
  return new SequenceView(SEQUENCE_TOKEN, factory, count);
}

export function reducedValue(value) {
  if (isReducedValue(value)) {
    return value;
  }
  const result = Object.create(null);
  Object.defineProperty(result, REDUCED_STATE, { value });
  return Object.freeze(result);
}

export function isReducedValue(value) {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    Object.prototype.hasOwnProperty.call(value, REDUCED_STATE);
}

export function unreducedValue(value) {
  return isReducedValue(value) ? value[REDUCED_STATE] : value;
}

export function reduceIterable(iterable, reducer, ...initial) {
  if (typeof reducer !== "function") {
    throw new TypeError("collection reducer must be a function");
  }
  let accumulator = initial.length === 0 ? NO_INITIAL : initial[0];
  for (const value of iterable) {
    if (accumulator === NO_INITIAL) {
      accumulator = value;
      continue;
    }
    accumulator = reducer(accumulator, value);
    if (isReducedValue(accumulator)) {
      return unreducedValue(accumulator);
    }
  }
  if (accumulator === NO_INITIAL) {
    throw new TypeError("cannot reduce an empty collection without an initial value");
  }
  return accumulator;
}

export function validateCollectionCount(value) {
  return checkedCount(value);
}
