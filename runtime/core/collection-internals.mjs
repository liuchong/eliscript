import {
  defineProtocol,
  protocolMethod,
  protocolSlot,
} from "./protocol.mjs";

export const I_COUNTED = defineProtocol("ICounted", ["count"]);
export const I_EMPTYABLE = defineProtocol("IEmptyable", ["empty"]);
export const I_CONJ = defineProtocol("IConj", ["conj"]);
export const I_LOOKUP = defineProtocol("ILookup", ["get"]);
export const I_ASSOCIATIVE = defineProtocol("IAssociative", [
  "assoc",
  "contains",
]);
export const I_INDEXED = defineProtocol("IIndexed", ["nth"]);
export const I_SEQABLE = defineProtocol("ISeqable", ["seq"]);
export const I_REDUCE = defineProtocol("IReduce", ["reduce"]);
export const I_KV_REDUCE = defineProtocol("IKVReduce", ["reduceKV"]);
export const I_MAP = defineProtocol("IMap", ["dissoc"]);
export const I_SET = defineProtocol("ISet", ["disj"]);
export const I_STACK = defineProtocol("IStack", ["peek", "pop"]);
export const I_REVERSIBLE = defineProtocol("IReversible", ["rseq"]);

export const COLLECTION_COUNT = protocolSlot(I_COUNTED, "count");
export const COLLECTION_EMPTY = protocolSlot(I_EMPTYABLE, "empty");
export const COLLECTION_CONJ = protocolSlot(I_CONJ, "conj");
export const COLLECTION_GET = protocolSlot(I_LOOKUP, "get");
export const COLLECTION_ASSOC = protocolSlot(I_ASSOCIATIVE, "assoc");
export const COLLECTION_CONTAINS = protocolSlot(I_ASSOCIATIVE, "contains");
export const COLLECTION_NTH = protocolSlot(I_INDEXED, "nth");
export const COLLECTION_SEQ = protocolSlot(I_SEQABLE, "seq");
export const COLLECTION_REDUCE = protocolSlot(I_REDUCE, "reduce");
export const COLLECTION_REDUCE_KV = protocolSlot(I_KV_REDUCE, "reduceKV");
export const COLLECTION_DISSOC = protocolSlot(I_MAP, "dissoc");
export const COLLECTION_DISJ = protocolSlot(I_SET, "disj");
export const COLLECTION_PEEK = protocolSlot(I_STACK, "peek");
export const COLLECTION_POP = protocolSlot(I_STACK, "pop");
export const COLLECTION_RSEQ = protocolSlot(I_REVERSIBLE, "rseq");

export const dispatchCollectionCount = protocolMethod(I_COUNTED, "count");
export const dispatchCollectionEmpty = protocolMethod(I_EMPTYABLE, "empty");
export const dispatchCollectionConj = protocolMethod(I_CONJ, "conj");
export const dispatchCollectionGet = protocolMethod(I_LOOKUP, "get");
export const dispatchCollectionAssoc = protocolMethod(I_ASSOCIATIVE, "assoc");
export const dispatchCollectionContains = protocolMethod(
  I_ASSOCIATIVE,
  "contains",
);
export const dispatchCollectionNth = protocolMethod(I_INDEXED, "nth");
export const dispatchCollectionSeq = protocolMethod(I_SEQABLE, "seq");
export const dispatchCollectionReduce = protocolMethod(I_REDUCE, "reduce");
export const dispatchCollectionReduceKV = protocolMethod(I_KV_REDUCE, "reduceKV");
export const dispatchCollectionDissoc = protocolMethod(I_MAP, "dissoc");
export const dispatchCollectionDisj = protocolMethod(I_SET, "disj");
export const dispatchCollectionPeek = protocolMethod(I_STACK, "peek");
export const dispatchCollectionPop = protocolMethod(I_STACK, "pop");
export const dispatchCollectionRseq = protocolMethod(I_REVERSIBLE, "rseq");

const NO_INITIAL = Symbol("eliscript.collection.no-initial");
const REDUCED_STATE = Symbol("eliscript.collection.reduced-state");
const REDUCTION_STATE = Symbol("eliscript.collection.reduction-state");
const REDUCTION_TOKEN = Symbol("eliscript.collection.reduction-token");
const MEMOIZED_SEQUENCE_STATE = Symbol(
  "eliscript.collection.memoized-sequence-state",
);
const MEMOIZED_SEQUENCE_TOKEN = Symbol(
  "eliscript.collection.memoized-sequence-token",
);
const NO_MEMOIZED_SEQUENCE_FAILURE = Symbol(
  "eliscript.collection.no-memoized-sequence-failure",
);
const SEQUENCE_STATE = Symbol("eliscript.collection.sequence-state");
const SEQUENCE_TOKEN = Symbol("eliscript.collection.sequence-token");
const UNBOUNDED_SEQUENCE = Symbol("eliscript.collection.unbounded-sequence");

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

class MemoizedSequenceSource {
  constructor(factory) {
    this.factory = factory;
    this.source = null;
    this.values = [];
    this.started = false;
    this.complete = false;
    this.failure = NO_MEMOIZED_SEQUENCE_FAILURE;
  }

  read(index) {
    if (index < this.values.length) {
      return { value: this.values[index], done: false };
    }
    if (this.failure !== NO_MEMOIZED_SEQUENCE_FAILURE) throw this.failure;
    if (this.complete) return { value: undefined, done: true };
    if (!this.started) {
      this.started = true;
      try {
        this.source = iteratorFromFactory(this.factory);
        this.factory = null;
      } catch (error) {
        this.failure = error;
        throw error;
      }
    }
    try {
      const result = this.source.next();
      if (result === null || typeof result !== "object" ||
          typeof result.done !== "boolean") {
        throw new TypeError("sequence iterator must return an iterator result");
      }
      if (result.done) {
        this.complete = true;
        this.source = null;
        return { value: undefined, done: true };
      }
      this.values.push(result.value);
      return { value: result.value, done: false };
    } catch (error) {
      const source = this.source;
      this.failure = error;
      this.source = null;
      if (source !== null && typeof source.return === "function") {
        try {
          source.return();
        } catch {
          // Preserve the original realization failure as the stable result.
        }
      }
      throw error;
    }
  }

  iterator() {
    const source = this;
    let index = 0;
    let closed = false;
    return {
      next() {
        if (closed) return { value: undefined, done: true };
        const result = source.read(index);
        if (!result.done) index += 1;
        return result;
      },
      return(value) {
        closed = true;
        return { value, done: true };
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }
}

export function readCollectionEntry(entry) {
  if (entry === null || entry === undefined ||
      typeof entry[Symbol.iterator] !== "function") {
    throw new TypeError(
      "persistent hash map entries must be iterable key/value pairs",
    );
  }
  const iterator = iteratorFromFactory(() => entry[Symbol.iterator]());
  let complete = false;
  try {
    const first = iterator.next();
    if (first.done) {
      throw new TypeError(
        "persistent hash map entries must contain exactly two values",
      );
    }
    const second = iterator.next();
    if (second.done) {
      throw new TypeError(
        "persistent hash map entries must contain exactly two values",
      );
    }
    const third = iterator.next();
    if (!third.done) {
      throw new TypeError(
        "persistent hash map entries must contain exactly two values",
      );
    }
    complete = true;
    return [first.value, second.value];
  } finally {
    if (!complete && typeof iterator.return === "function") {
      iterator.return();
    }
  }
}

function sequenceCount(state) {
  if (state.count === UNBOUNDED_SEQUENCE) {
    throw new RangeError("unbounded sequence does not have a finite count");
  }
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

function slicedSequenceCount(state, offset) {
  if (state.count === UNBOUNDED_SEQUENCE) {
    return UNBOUNDED_SEQUENCE;
  }
  if (typeof state.count === "function") {
    return () => Math.max(0, sequenceCount(state) - offset);
  }
  if (state.count === null) {
    return null;
  }
  return Math.max(0, state.count - offset);
}

function prependedSequenceCount(state) {
  if (state.count === UNBOUNDED_SEQUENCE) {
    return UNBOUNDED_SEQUENCE;
  }
  if (typeof state.count === "function") {
    return () => checkedCount(sequenceCount(state) + 1);
  }
  if (state.count === null) {
    return null;
  }
  return checkedCount(state.count + 1);
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
    const state = this[SEQUENCE_STATE];
    if (state.count === UNBOUNDED_SEQUENCE) {
      return this;
    }
    if (state.count === null) {
      const iterator = iteratorFromFactory(state.factory);
      try {
        return iterator.next().done ? null : this;
      } finally {
        if (typeof iterator.return === "function") {
          iterator.return();
        }
      }
    }
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

export class MemoizedSequenceView {
  constructor(token, factory, count) {
    if (token !== MEMOIZED_SEQUENCE_TOKEN || typeof factory !== "function") {
      throw new TypeError(
        "MemoizedSequenceView values must be created by memoizedSequenceView",
      );
    }
    this[MEMOIZED_SEQUENCE_STATE] = Object.freeze({
      source: new MemoizedSequenceSource(factory),
      count,
    });
    Object.freeze(this);
  }

  [COLLECTION_COUNT]() {
    return sequenceCount({
      factory: () => this[Symbol.iterator](),
      count: this[MEMOIZED_SEQUENCE_STATE].count,
    });
  }

  [COLLECTION_SEQ]() {
    const iterator = this[Symbol.iterator]();
    try {
      return iterator.next().done ? null : this;
    } finally {
      iterator.return();
    }
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [Symbol.iterator]() {
    return this[MEMOIZED_SEQUENCE_STATE].source.iterator();
  }

  get [Symbol.toStringTag]() {
    return "EliscriptMemoizedSequenceView";
  }
}

export class ReductionView {
  constructor(token, reduceFunction) {
    if (token !== REDUCTION_TOKEN || typeof reduceFunction !== "function") {
      throw new TypeError("ReductionView values must be created by reductionView");
    }
    this[REDUCTION_STATE] = reduceFunction;
    Object.freeze(this);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return this[REDUCTION_STATE](reducer, ...initial);
  }

  get [Symbol.toStringTag]() {
    return "EliscriptReductionView";
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

export function unboundedSequenceView(factory) {
  if (typeof factory !== "function") {
    throw new TypeError("unbounded sequence view factory must be a function");
  }
  return new SequenceView(SEQUENCE_TOKEN, factory, UNBOUNDED_SEQUENCE);
}

export function memoizedSequenceView(factory, count = null) {
  if (typeof factory !== "function") {
    throw new TypeError("memoized sequence view factory must be a function");
  }
  if (count !== null) {
    checkedCount(count);
    if (count === 0) return null;
  }
  return new MemoizedSequenceView(MEMOIZED_SEQUENCE_TOKEN, factory, count);
}

export function memoizedSequenceStatus(value) {
  if (!(value instanceof MemoizedSequenceView)) {
    throw new TypeError("expected a memoized sequence view");
  }
  const source = value[MEMOIZED_SEQUENCE_STATE].source;
  return Object.freeze({
    started: source.started,
    complete: source.complete,
    failed: source.failure !== NO_MEMOIZED_SEQUENCE_FAILURE,
    realizedCount: source.values.length,
  });
}

export function sliceSequenceView(sequence, offset) {
  if (sequence === null) {
    return null;
  }
  if (!(sequence instanceof SequenceView) &&
      !(sequence instanceof MemoizedSequenceView)) {
    throw new TypeError("sequence slice expects a SequenceView or nil");
  }
  checkedCount(offset);
  if (offset === 0) {
    return sequence;
  }

  const state = sequence instanceof SequenceView
    ? sequence[SEQUENCE_STATE]
    : {
        factory: () => sequence[Symbol.iterator](),
        count: sequence[MEMOIZED_SEQUENCE_STATE].count,
      };
  const factory = () => {
    const iterator = sequence[Symbol.iterator]();
    let remaining = offset;
    while (remaining > 0) {
      if (iterator.next().done) {
        return iterator;
      }
      remaining -= 1;
    }
    return iterator;
  };
  const count = slicedSequenceCount(state, offset);
  return count === UNBOUNDED_SEQUENCE
    ? unboundedSequenceView(factory)
    : sequenceView(factory, count);
}

export function prependSequenceView(value, sequence) {
  if (sequence !== null && !(sequence instanceof SequenceView) &&
      !(sequence instanceof MemoizedSequenceView)) {
    throw new TypeError("sequence prepend expects a SequenceView or nil");
  }

  const factory = () => (function* prependedValues() {
    yield value;
    if (sequence !== null) {
      yield* sequence;
    }
  })();
  if (sequence === null) {
    return sequenceView(factory, 1);
  }

  const state = sequence instanceof SequenceView
    ? sequence[SEQUENCE_STATE]
    : {
        factory: () => sequence[Symbol.iterator](),
        count: sequence[MEMOIZED_SEQUENCE_STATE].count,
      };
  const count = prependedSequenceCount(state);
  return count === UNBOUNDED_SEQUENCE
    ? unboundedSequenceView(factory)
    : sequenceView(factory, count);
}

export function reductionView(reduceFunction) {
  if (typeof reduceFunction !== "function") {
    throw new TypeError("reduction view function must be a function");
  }
  return new ReductionView(REDUCTION_TOKEN, reduceFunction);
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
