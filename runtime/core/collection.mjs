import {
  extendProtocolCategory,
  extendProtocolType,
  implementsProtocol,
} from "./protocol.mjs";
import {
  I_COUNTED,
  I_EMPTYABLE,
  I_CONJ,
  I_INDEXED,
  I_LOOKUP,
  I_ASSOCIATIVE,
  I_REDUCE,
  I_KV_REDUCE,
  I_MAP,
  I_SET,
  I_STACK,
  I_REVERSIBLE,
  I_SEQABLE,
  ReductionView as InternalReductionView,
  SequenceView as InternalSequenceView,
  dispatchCollectionCount,
  dispatchCollectionEmpty,
  dispatchCollectionConj,
  dispatchCollectionGet,
  dispatchCollectionAssoc,
  dispatchCollectionContains,
  dispatchCollectionNth,
  dispatchCollectionReduce,
  dispatchCollectionReduceKV,
  dispatchCollectionDissoc,
  dispatchCollectionDisj,
  dispatchCollectionPeek,
  dispatchCollectionPop,
  dispatchCollectionRseq,
  dispatchCollectionSeq,
  isReducedValue,
  readCollectionEntry,
  reduceIterable,
  reducedValue,
  reductionView as createReductionView,
  sequenceView as createSequenceView,
  unboundedSequenceView as createUnboundedSequenceView,
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

function indexedAssoc(values, index, value) {
  if (!Number.isInteger(index) || index < 0 || index > values.length) {
    throw new RangeError(
      `assoc index ${String(index)} is outside collection bounds`,
    );
  }
  const result = values.slice();
  result[index] = value;
  return result;
}

function indexedContains(values, index) {
  return Number.isInteger(index) && index >= 0 && index < values.length;
}

function mapConj(values, entry) {
  const [key, value] = readCollectionEntry(entry);
  const result = new Map(values);
  result.set(key, value);
  return result;
}

function mapAssoc(values, key, value) {
  const result = new Map(values);
  result.set(key, value);
  return result;
}

function mapDissoc(values, key) {
  const result = new Map(values);
  result.delete(key);
  return result;
}

function setConj(values, value) {
  const result = new Set(values);
  result.add(value);
  return result;
}

function setDisj(values, value) {
  const result = new Set(values);
  result.delete(value);
  return result;
}

function objectAssoc(values, key, value) {
  if (typeof key !== "string") {
    throw new TypeError("plain object association keys must be strings");
  }
  return { ...values, [key]: value };
}

function objectConj(values, entry) {
  const [key, value] = readCollectionEntry(entry);
  return objectAssoc(values, key, value);
}

function objectDissoc(values, key) {
  if (typeof key !== "string") {
    throw new TypeError("plain object dissociation keys must be strings");
  }
  const result = { ...values };
  delete result[key];
  return result;
}

function arrayPeek(values) {
  return values.length === 0 ? null : values[values.length - 1];
}

function arrayPop(values) {
  if (values.length === 0) {
    throw new RangeError("cannot pop an empty array");
  }
  return values.slice(0, -1);
}

function indexedReverseSequence(values) {
  return values.length === 0
    ? null
    : createSequenceView(
      () => {
        let index = values.length;
        return {
          next() {
            if (index === 0) return { value: undefined, done: true };
            index -= 1;
            return { value: values[index], done: false };
          },
        };
      },
      () => values.length,
    );
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

function stringSequence(value) {
  return value.length === 0
    ? null
    : createSequenceView(
      () => (function* codeUnits() {
        for (let index = 0; index < value.length; index += 1) {
          yield value[index];
        }
      })(),
      () => value.length,
    );
}

function objectSequence(value) {
  const keys = Object.keys(value);
  return keys.length === 0
    ? null
    : createSequenceView(
      () => (function* entries() {
        for (const key of Object.keys(value)) {
          yield Object.freeze([key, value[key]]);
        }
      })(),
      () => Object.keys(value).length,
    );
}

function reduceIndexedValues(values, reducer, initial) {
  let result = initial;
  for (let index = 0; index < values.length; index += 1) {
    result = reducer(result, index, values[index]);
    if (isReducedValue(result)) return unreducedValue(result);
  }
  return result;
}

function reduceMapValues(values, reducer, initial) {
  let result = initial;
  for (const [key, value] of values) {
    result = reducer(result, key, value);
    if (isReducedValue(result)) return unreducedValue(result);
  }
  return result;
}

function reduceObjectValues(value, reducer, initial) {
  let result = initial;
  for (const key of Object.keys(value)) {
    result = reducer(result, key, value[key]);
    if (isReducedValue(result)) return unreducedValue(result);
  }
  return result;
}

extendProtocolCategory(I_COUNTED, "string", {
  count: (value) => value.length,
});
extendProtocolCategory(I_EMPTYABLE, "string", { empty: () => "" });
extendProtocolCategory(I_LOOKUP, "string", {
  get: (value, index, notFound = null) => indexedValue(value, index, notFound),
});
extendProtocolCategory(I_INDEXED, "string", { nth: indexedValue });
extendProtocolCategory(I_SEQABLE, "string", { seq: stringSequence });
extendProtocolCategory(I_REDUCE, "string", {
  reduce: (value, reducer, ...initial) =>
    reduceIterable(stringSequence(value) ?? [], reducer, ...initial),
});
extendProtocolCategory(I_REVERSIBLE, "string", {
  rseq: indexedReverseSequence,
});

extendProtocolType(I_COUNTED, Object, {
  count: (value) => Object.keys(value).length,
});
extendProtocolType(I_EMPTYABLE, Object, { empty: () => ({}) });
extendProtocolType(I_CONJ, Object, { conj: objectConj });
extendProtocolType(I_LOOKUP, Object, {
  get: (value, key, notFound = null) =>
    typeof key === "string" && Object.hasOwn(value, key)
      ? value[key]
      : notFound,
});
extendProtocolType(I_ASSOCIATIVE, Object, {
  assoc: objectAssoc,
  contains: (value, key) =>
    typeof key === "string" && Object.hasOwn(value, key),
});
extendProtocolType(I_SEQABLE, Object, { seq: objectSequence });
extendProtocolType(I_REDUCE, Object, {
  reduce: (value, reducer, ...initial) =>
    reduceIterable(objectSequence(value) ?? [], reducer, ...initial),
});
extendProtocolType(I_KV_REDUCE, Object, { reduceKV: reduceObjectValues });
extendProtocolType(I_MAP, Object, { dissoc: objectDissoc });

extendProtocolType(I_COUNTED, Array, { count: (values) => values.length });
extendProtocolType(I_EMPTYABLE, Array, { empty: () => [] });
extendProtocolType(I_CONJ, Array, {
  conj: (values, value) => [...values, value],
});
extendProtocolType(I_LOOKUP, Array, {
  get: (values, index, notFound = null) => indexedValue(values, index, notFound),
});
extendProtocolType(I_ASSOCIATIVE, Array, {
  assoc: indexedAssoc,
  contains: indexedContains,
});
extendProtocolType(I_INDEXED, Array, { nth: indexedValue });
extendProtocolType(I_SEQABLE, Array, { seq: arraySequence });
extendProtocolType(I_REDUCE, Array, { reduce: reduceIterable });
extendProtocolType(I_KV_REDUCE, Array, { reduceKV: reduceIndexedValues });
extendProtocolType(I_STACK, Array, { peek: arrayPeek, pop: arrayPop });
extendProtocolType(I_REVERSIBLE, Array, { rseq: indexedReverseSequence });

extendProtocolType(I_COUNTED, Map, { count: (values) => values.size });
extendProtocolType(I_EMPTYABLE, Map, { empty: () => new Map() });
extendProtocolType(I_CONJ, Map, { conj: mapConj });
extendProtocolType(I_LOOKUP, Map, {
  get: (values, key, notFound = null) =>
    values.has(key) ? values.get(key) : notFound,
});
extendProtocolType(I_ASSOCIATIVE, Map, {
  assoc: mapAssoc,
  contains: (values, key) => values.has(key),
});
extendProtocolType(I_SEQABLE, Map, { seq: mapSequence });
extendProtocolType(I_REDUCE, Map, {
  reduce: (values, reducer, ...initial) =>
    reduceIterable(mapSequence(values) ?? [], reducer, ...initial),
});
extendProtocolType(I_KV_REDUCE, Map, { reduceKV: reduceMapValues });
extendProtocolType(I_MAP, Map, { dissoc: mapDissoc });

extendProtocolType(I_COUNTED, Set, { count: (values) => values.size });
extendProtocolType(I_EMPTYABLE, Set, { empty: () => new Set() });
extendProtocolType(I_CONJ, Set, { conj: setConj });
extendProtocolType(I_LOOKUP, Set, {
  get: (values, key, notFound = null) => values.has(key) ? key : notFound,
});
extendProtocolType(I_ASSOCIATIVE, Set, {
  contains: (values, key) => values.has(key),
});
extendProtocolType(I_SEQABLE, Set, { seq: setSequence });
extendProtocolType(I_REDUCE, Set, { reduce: reduceIterable });
extendProtocolType(I_SET, Set, { disj: setDisj });

extendProtocolCategory(I_COUNTED, "null", { count: () => 0 });
extendProtocolCategory(I_EMPTYABLE, "null", { empty: () => null });
extendProtocolCategory(I_SEQABLE, "null", { seq: () => null });
extendProtocolCategory(I_REDUCE, "null", {
  reduce: (_value, reducer, ...initial) => reduceIterable([], reducer, ...initial),
});
extendProtocolCategory(I_KV_REDUCE, "null", {
  reduceKV: (_value, _reducer, initial) => initial,
});
extendProtocolCategory(I_MAP, "null", { dissoc: () => null });
extendProtocolCategory(I_SET, "null", { disj: () => null });
extendProtocolCategory(I_STACK, "null", { peek: () => null, pop: () => null });
extendProtocolCategory(I_REVERSIBLE, "null", { rseq: () => null });

export const ICounted = I_COUNTED;
export const IEmptyable = I_EMPTYABLE;
export const IConj = I_CONJ;
export const ILookup = I_LOOKUP;
export const IAssociative = I_ASSOCIATIVE;
export const IIndexed = I_INDEXED;
export const ISeqable = I_SEQABLE;
export const IReduce = I_REDUCE;
export const IKVReduce = I_KV_REDUCE;
export const IMap = I_MAP;
export const ISet = I_SET;
export const IStack = I_STACK;
export const IReversible = I_REVERSIBLE;

export const ReductionView = InternalReductionView;
export const SequenceView = InternalSequenceView;

export function reductionView(reduceFunction) {
  return createReductionView(reduceFunction);
}

export function sequenceView(factory, count = null) {
  return createSequenceView(factory, count);
}

export function unboundedSequenceView(factory) {
  return createUnboundedSequenceView(factory);
}

export function count(collection) {
  return validateCollectionCount(dispatchCollectionCount(collection));
}

export function isCounted(collection) {
  return implementsProtocol(ICounted, collection);
}

export function isIndexed(collection) {
  return implementsProtocol(IIndexed, collection);
}

export function isSeqable(collection) {
  return implementsProtocol(ISeqable, collection);
}

export function isReducible(collection) {
  return implementsProtocol(IReduce, collection);
}

export function isReversible(collection) {
  return implementsProtocol(IReversible, collection);
}

export function isAssociative(collection) {
  return implementsProtocol(IAssociative, collection);
}

export function empty(collection) {
  return dispatchCollectionEmpty(collection);
}

export function conj(collection, ...values) {
  let result = collection;
  for (const value of values) {
    result = dispatchCollectionConj(result, value);
  }
  return result;
}

export function get(collection, key, notFound = null) {
  return dispatchCollectionGet(collection, key, notFound);
}

export function assoc(collection, key, value, ...keyValues) {
  if (arguments.length < 3 || keyValues.length % 2 !== 0) {
    throw new TypeError(
      "assoc requires a collection followed by one or more key/value pairs",
    );
  }
  let result = dispatchCollectionAssoc(collection, key, value);
  for (let index = 0; index < keyValues.length; index += 2) {
    result = dispatchCollectionAssoc(
      result,
      keyValues[index],
      keyValues[index + 1],
    );
  }
  return result;
}

export function contains(collection, key) {
  const result = dispatchCollectionContains(collection, key);
  if (typeof result !== "boolean") {
    throw new TypeError("IAssociative/contains must return a boolean");
  }
  return result;
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

export function isEmpty(collection) {
  return seq(collection) === null;
}

export function notEmpty(collection) {
  return isEmpty(collection) ? null : collection;
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

export function reduceKV(collection, reducer, initial) {
  if (arguments.length !== 3) {
    throw new TypeError("reduceKV requires a collection, reducer, and initial value");
  }
  if (typeof reducer !== "function") {
    throw new TypeError("key/value reducer must be a function");
  }
  return unreducedValue(dispatchCollectionReduceKV(collection, reducer, initial));
}

export function dissoc(collection, ...keys) {
  let result = collection;
  for (const key of keys) {
    result = dispatchCollectionDissoc(result, key);
  }
  return result;
}

export function disj(collection, ...values) {
  let result = collection;
  for (const value of values) {
    result = dispatchCollectionDisj(result, value);
  }
  return result;
}

export function peek(collection) {
  if (arguments.length !== 1) {
    throw new TypeError("peek requires exactly one collection");
  }
  return dispatchCollectionPeek(collection);
}

export function pop(collection) {
  if (arguments.length !== 1) {
    throw new TypeError("pop requires exactly one collection");
  }
  return dispatchCollectionPop(collection);
}

export function rseq(collection) {
  if (arguments.length !== 1) {
    throw new TypeError("rseq requires exactly one collection");
  }
  const result = dispatchCollectionRseq(collection);
  if (result === null) {
    return null;
  }
  if (result === undefined || typeof result[Symbol.iterator] !== "function") {
    throw new TypeError(
      "IReversible/rseq must return null or an iterable sequence view",
    );
  }
  return result;
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

export function isReductionView(value) {
  return value instanceof InternalReductionView;
}
