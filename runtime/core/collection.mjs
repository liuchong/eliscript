import {
  extendProtocolCategory,
  extendProtocolType,
} from "./protocol.mjs";
import {
  I_COUNTED,
  I_INDEXED,
  I_LOOKUP,
  I_REDUCE,
  I_SEQABLE,
  SequenceView as InternalSequenceView,
  dispatchCollectionCount,
  dispatchCollectionGet,
  dispatchCollectionNth,
  dispatchCollectionReduce,
  dispatchCollectionSeq,
  isReducedValue,
  reduceIterable,
  reducedValue,
  sequenceView as createSequenceView,
  unreducedValue,
  validateCollectionCount,
} from "./collection-internals.mjs";

const MISSING = Symbol("eliscript.collection.missing");

function indexedValue(values, index, notFound = MISSING) {
  if (Number.isInteger(index) && index >= 0 && index < values.length) {
    return values[index];
  }
  if (notFound !== MISSING) {
    return notFound;
  }
  throw new RangeError(`nth index ${String(index)} is outside collection bounds`);
}

function arraySequence(values) {
  return values.length === 0
    ? null
    : createSequenceView(() => values[Symbol.iterator](), () => values.length);
}

function mapSequence(values) {
  if (values.size === 0) {
    return null;
  }
  return createSequenceView(
    () => (function* entries() {
      for (const entry of values) {
        yield Object.freeze([entry[0], entry[1]]);
      }
    })(),
    () => values.size,
  );
}

function setSequence(values) {
  return values.size === 0
    ? null
    : createSequenceView(() => values[Symbol.iterator](), () => values.size);
}

extendProtocolType(I_COUNTED, Array, { count: (values) => values.length });
extendProtocolType(I_LOOKUP, Array, {
  get: (values, index, notFound = null) => indexedValue(values, index, notFound),
});
extendProtocolType(I_INDEXED, Array, { nth: indexedValue });
extendProtocolType(I_SEQABLE, Array, { seq: arraySequence });
extendProtocolType(I_REDUCE, Array, { reduce: reduceIterable });

extendProtocolType(I_COUNTED, Map, { count: (values) => values.size });
extendProtocolType(I_LOOKUP, Map, {
  get: (values, key, notFound = null) =>
    values.has(key) ? values.get(key) : notFound,
});
extendProtocolType(I_SEQABLE, Map, { seq: mapSequence });
extendProtocolType(I_REDUCE, Map, {
  reduce: (values, reducer, ...initial) =>
    reduceIterable(mapSequence(values) ?? [], reducer, ...initial),
});

extendProtocolType(I_COUNTED, Set, { count: (values) => values.size });
extendProtocolType(I_LOOKUP, Set, {
  get: (values, key, notFound = null) => values.has(key) ? key : notFound,
});
extendProtocolType(I_SEQABLE, Set, { seq: setSequence });
extendProtocolType(I_REDUCE, Set, { reduce: reduceIterable });

extendProtocolCategory(I_COUNTED, "null", { count: () => 0 });
extendProtocolCategory(I_SEQABLE, "null", { seq: () => null });
extendProtocolCategory(I_REDUCE, "null", {
  reduce: (_value, reducer, ...initial) => reduceIterable([], reducer, ...initial),
});

export const ICounted = I_COUNTED;
export const ILookup = I_LOOKUP;
export const IIndexed = I_INDEXED;
export const ISeqable = I_SEQABLE;
export const IReduce = I_REDUCE;

export const SequenceView = InternalSequenceView;

export function sequenceView(factory, count = null) {
  return createSequenceView(factory, count);
}

export function count(collection) {
  return validateCollectionCount(dispatchCollectionCount(collection));
}

export function get(collection, key, notFound = null) {
  return dispatchCollectionGet(collection, key, notFound);
}

export function nth(collection, index, ...notFound) {
  return notFound.length === 0
    ? dispatchCollectionNth(collection, index)
    : dispatchCollectionNth(collection, index, notFound[0]);
}

export function seq(collection) {
  const result = dispatchCollectionSeq(collection);
  if (result === null) {
    return null;
  }
  if (result === undefined || typeof result[Symbol.iterator] !== "function") {
    throw new TypeError("ISeqable/seq must return null or an iterable sequence view");
  }
  return result;
}

export function reduce(collection, reducer, ...initial) {
  if (typeof reducer !== "function") {
    throw new TypeError("collection reducer must be a function");
  }
  return unreducedValue(
    initial.length === 0
      ? dispatchCollectionReduce(collection, reducer)
      : dispatchCollectionReduce(collection, reducer, initial[0]),
  );
}

export function reduced(value) {
  return reducedValue(value);
}

export function isReduced(value) {
  return isReducedValue(value);
}

export function unreduced(value) {
  return unreducedValue(value);
}

export function isSequenceView(value) {
  return value instanceof InternalSequenceView;
}
