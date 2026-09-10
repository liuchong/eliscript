import {
  count as collectionCount,
  IReversible,
  isReduced,
  nth as collectionNth,
  reduce,
  reduced,
  rseq,
  sequenceView,
  unboundedSequenceView,
  unreduced,
} from "./collection.mjs";
import { isPersistentList } from "./list.mjs";
import { implementsProtocolOperation } from "./protocol.mjs";
import {
  deduping,
  distincting,
  dropping,
  droppingWhile,
  filtering,
  into,
  interposing,
  keeping,
  keepingIndexed,
  mapcatting,
  mapping,
  mappingIndexed,
  partitioningAll,
  partitioningBy,
  removing,
  taking,
  takingNth,
  takingWhile,
} from "./transducer.mjs";
import {
  conjBang,
  persistentBang,
  transient,
} from "./transient.mjs";
import { isTruthy } from "./truth.mjs";
import {
  EMPTY_VECTOR,
  isPersistentVector,
  persistentVector,
} from "./vector.mjs";

const NOT_FOUND = Symbol("eliscript.sequence.not-found");
const NO_PARTITION_PAD = Symbol("eliscript.sequence.no-partition-pad");

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function requireNonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requirePositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function materializeSources(collections) {
  const sources = [];
  for (const collection of collections) {
    sources.push(into(EMPTY_VECTOR, collection));
  }
  return sources;
}

function partitionWindows(
  size,
  step,
  collection,
  { includePartial = false, pad = NO_PARTITION_PAD } = {},
) {
  requirePositiveSafeInteger(size, "partition size");
  requirePositiveSafeInteger(step, "partition step");
  const values = into(EMPTY_VECTOR, collection);
  const valueCount = collectionCount(values);
  const result = transient(EMPTY_VECTOR);

  for (let start = 0; start < valueCount; start += step) {
    const group = transient(EMPTY_VECTOR);
    let groupCount = Math.min(size, valueCount - start);
    for (let offset = 0; offset < groupCount; offset += 1) {
      conjBang(group, collectionNth(values, start + offset));
    }

    const partial = groupCount < size;
    if (partial && pad !== NO_PARTITION_PAD) {
      reduce(pad, (builder, value) => {
        conjBang(builder, value);
        groupCount += 1;
        return groupCount >= size ? reduced(builder) : builder;
      }, group);
    }
    const completed = persistentBang(group);
    if (!partial || includePartial || pad !== NO_PARTITION_PAD) {
      conjBang(result, completed);
    }
    if (partial && !includePartial) break;
  }
  return persistentBang(result);
}

function isSequentialBranch(value) {
  return Array.isArray(value) ||
    isPersistentList(value) ||
    isPersistentVector(value);
}

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function rangeCount(start, end, step) {
  const distance = (end - start) / step;
  if (!(distance > 0)) return 0;
  return requireNonNegativeSafeInteger(Math.ceil(distance), "range count");
}

function rangeFactory(start, step, count = null) {
  return () => (function* rangeValues() {
    let index = 0;
    while (count === null || index < count) {
      yield start + index * step;
      index += 1;
    }
  })();
}

export function range(...bounds) {
  if (bounds.length === 0) {
    return unboundedSequenceView(rangeFactory(0, 1));
  }
  if (bounds.length > 3) {
    throw new TypeError("range expects zero to three arguments");
  }

  const start = requireFiniteNumber(
    bounds.length === 1 ? 0 : bounds[0],
    "range start",
  );
  const end = requireFiniteNumber(
    bounds.length === 1 ? bounds[0] : bounds[1],
    "range end",
  );
  const step = requireFiniteNumber(bounds.length === 3 ? bounds[2] : 1, "range step");
  if (step === 0) {
    throw new TypeError("range step must be non-zero");
  }
  const count = rangeCount(start, end, step);
  return sequenceView(rangeFactory(start, step, count), count);
}

function repeatFactory(value, count = null) {
  return () => (function* repeatedValues() {
    let index = 0;
    while (count === null || index < count) {
      yield value;
      index += 1;
    }
  })();
}

export function repeat(...arguments_) {
  if (arguments_.length === 1) {
    return unboundedSequenceView(repeatFactory(arguments_[0]));
  }
  if (arguments_.length === 2) {
    const count = requireNonNegativeSafeInteger(arguments_[0], "repeat count");
    return sequenceView(repeatFactory(arguments_[1], count), count);
  }
  throw new TypeError("repeat expects a value or a count and value");
}

function repeatedlyFactory(producer, count = null) {
  return () => (function* producedValues() {
    let index = 0;
    while (count === null || index < count) {
      yield producer();
      index += 1;
    }
  })();
}

export function repeatedly(...arguments_) {
  if (arguments_.length === 1) {
    const producer = requireFunction(arguments_[0], "repeatedly producer");
    return unboundedSequenceView(repeatedlyFactory(producer));
  }
  if (arguments_.length === 2) {
    const count = requireNonNegativeSafeInteger(arguments_[0], "repeatedly count");
    const producer = requireFunction(arguments_[1], "repeatedly producer");
    return sequenceView(repeatedlyFactory(producer, count), count);
  }
  throw new TypeError("repeatedly expects a producer or a count and producer");
}

export function iterate(transform, seed) {
  requireFunction(transform, "iterate transform");
  return unboundedSequenceView(() => (function* iterationValues() {
    let value = seed;
    while (true) {
      yield value;
      value = transform(value);
    }
  })());
}

export function cycle(collection) {
  const values = into(EMPTY_VECTOR, collection);
  const count = collectionCount(values);
  if (count === 0) return null;
  return unboundedSequenceView(() => (function* cycledValues() {
    let index = 0;
    while (true) {
      yield collectionNth(values, index);
      index = (index + 1) % count;
    }
  })());
}

export function generate(count, producer) {
  requireNonNegativeSafeInteger(count, "generate count");
  requireFunction(producer, "generate producer");
  return sequenceView(() => (function* generatedValues() {
    for (let index = 0; index < count; index += 1) {
      yield producer(index);
    }
  })(), count);
}

export function first(collection, notFound = null) {
  const result = reduce(collection, (missing, value) =>
    reduced({ value }), NOT_FOUND);
  return result === NOT_FOUND ? notFound : result.value;
}

export function sequenceNth(index, collection, notFound = null) {
  requireNonNegativeSafeInteger(index, "sequenceNth index");
  let position = 0;
  const result = reduce(collection, (missing, value) => {
    if (position === index) return reduced({ value });
    position += 1;
    return missing;
  }, NOT_FOUND);
  return result === NOT_FOUND ? notFound : result.value;
}

export function last(collection, notFound = null) {
  if (implementsProtocolOperation(IReversible, "rseq", collection)) {
    return first(rseq(collection), notFound);
  }
  const result = reduce(collection, (missing, value) => ({ value }), NOT_FOUND);
  return result === NOT_FOUND ? notFound : result.value;
}

export function takeLast(limit, collection) {
  requireNonNegativeSafeInteger(limit, "takeLast limit");
  if (limit === 0) return EMPTY_VECTOR;

  const ring = new Array(limit);
  let count = 0;
  let start = 0;
  reduce(collection, (state, value) => {
    if (count < limit) {
      ring[count] = value;
      count += 1;
    } else {
      ring[start] = value;
      start = (start + 1) % limit;
    }
    return state;
  }, null);

  const builder = transient(EMPTY_VECTOR);
  for (let index = 0; index < count; index += 1) {
    conjBang(builder, ring[(start + index) % limit]);
  }
  return persistentBang(builder);
}

export function dropLast(limit, collection) {
  requireNonNegativeSafeInteger(limit, "dropLast limit");
  if (limit === 0) return into(EMPTY_VECTOR, collection);

  const ring = new Array(limit);
  const builder = transient(EMPTY_VECTOR);
  let count = 0;
  let start = 0;
  reduce(collection, (state, value) => {
    if (count < limit) {
      ring[count] = value;
      count += 1;
    } else {
      conjBang(builder, ring[start]);
      ring[start] = value;
      start = (start + 1) % limit;
    }
    return state;
  }, null);
  return persistentBang(builder);
}

export function butlast(collection) {
  return dropLast(1, collection);
}

export function splitAt(limit, collection) {
  requireNonNegativeSafeInteger(limit, "splitAt limit");
  const left = transient(EMPTY_VECTOR);
  const right = transient(EMPTY_VECTOR);
  let index = 0;
  reduce(collection, (state, value) => {
    conjBang(index < limit ? left : right, value);
    index += 1;
    return state;
  }, null);
  return persistentVector(persistentBang(left), persistentBang(right));
}

export function splitWith(predicate, collection) {
  requireFunction(predicate, "splitWith predicate");
  const left = transient(EMPTY_VECTOR);
  const right = transient(EMPTY_VECTOR);
  let prefix = true;
  reduce(collection, (state, value) => {
    if (prefix && isTruthy(predicate(value))) {
      conjBang(left, value);
    } else {
      prefix = false;
      conjBang(right, value);
    }
    return state;
  }, null);
  return persistentVector(persistentBang(left), persistentBang(right));
}

export function reverse(collection) {
  if (implementsProtocolOperation(IReversible, "rseq", collection)) {
    return into(EMPTY_VECTOR, rseq(collection));
  }
  const values = reduce(collection, (result, value) => {
    result.push(value);
    return result;
  }, []);
  values.reverse();
  return into(EMPTY_VECTOR, values);
}

export function map(transform, collection) {
  return into(EMPTY_VECTOR, mapping(transform), collection);
}

export function mapIndexed(transform, collection) {
  return into(EMPTY_VECTOR, mappingIndexed(transform), collection);
}

export function keep(transform, collection) {
  return into(EMPTY_VECTOR, keeping(transform), collection);
}

export function keepIndexed(transform, collection) {
  return into(EMPTY_VECTOR, keepingIndexed(transform), collection);
}

export function filter(predicate, collection) {
  return into(EMPTY_VECTOR, filtering(predicate), collection);
}

export function remove(predicate, collection) {
  return into(EMPTY_VECTOR, removing(predicate), collection);
}

export function take(limit, collection) {
  return into(EMPTY_VECTOR, taking(limit), collection);
}

export function drop(limit, collection) {
  return into(EMPTY_VECTOR, dropping(limit), collection);
}

export function takeWhile(predicate, collection) {
  return into(EMPTY_VECTOR, takingWhile(predicate), collection);
}

export function dropWhile(predicate, collection) {
  return into(EMPTY_VECTOR, droppingWhile(predicate), collection);
}

export function takeNth(interval, collection) {
  return into(EMPTY_VECTOR, takingNth(interval), collection);
}

export function interpose(separator, collection) {
  return into(EMPTY_VECTOR, interposing(separator), collection);
}

export function dedupe(collection) {
  return into(EMPTY_VECTOR, deduping(), collection);
}

export function distinct(collection) {
  return into(EMPTY_VECTOR, distincting(), collection);
}

export function mapcat(transform, collection) {
  return into(EMPTY_VECTOR, mapcatting(transform), collection);
}

export function partition(size, ...arguments_) {
  if (arguments_.length === 1) {
    return partitionWindows(size, size, arguments_[0]);
  }
  if (arguments_.length === 2) {
    return partitionWindows(size, arguments_[0], arguments_[1]);
  }
  if (arguments_.length === 3) {
    return partitionWindows(size, arguments_[0], arguments_[2], {
      pad: arguments_[1],
    });
  }
  throw new TypeError(
    "partition expects size and collection, optional step, or step and pad",
  );
}

export function partitionAll(size, ...arguments_) {
  if (arguments_.length === 1) {
    requirePositiveSafeInteger(size, "partition size");
    return into(EMPTY_VECTOR, partitioningAll(size), arguments_[0]);
  }
  if (arguments_.length === 2) {
    return partitionWindows(size, arguments_[0], arguments_[1], {
      includePartial: true,
    });
  }
  throw new TypeError(
    "partitionAll expects size and collection or size, step, and collection",
  );
}

export function partitionBy(classifier, collection) {
  return into(EMPTY_VECTOR, partitioningBy(classifier), collection);
}

export function concat(...collections) {
  const result = transient(EMPTY_VECTOR);
  for (const collection of collections) {
    reduce(collection, (builder, value) => conjBang(builder, value), result);
  }
  return persistentBang(result);
}

export function interleave(...collections) {
  if (collections.length === 0) return EMPTY_VECTOR;
  const sources = materializeSources(collections);
  let limit = collectionCount(sources[0]);
  for (let index = 1; index < sources.length; index += 1) {
    limit = Math.min(limit, collectionCount(sources[index]));
  }
  const result = transient(EMPTY_VECTOR);
  for (let valueIndex = 0; valueIndex < limit; valueIndex += 1) {
    for (const source of sources) {
      conjBang(result, collectionNth(source, valueIndex));
    }
  }
  return persistentBang(result);
}

export function interleaveAll(...collections) {
  if (collections.length === 0) return EMPTY_VECTOR;
  const sources = materializeSources(collections);
  let limit = 0;
  for (const source of sources) {
    limit = Math.max(limit, collectionCount(source));
  }
  const result = transient(EMPTY_VECTOR);
  for (let valueIndex = 0; valueIndex < limit; valueIndex += 1) {
    for (const source of sources) {
      if (valueIndex < collectionCount(source)) {
        conjBang(result, collectionNth(source, valueIndex));
      }
    }
  }
  return persistentBang(result);
}

export function some(predicate, collection, notFound = null) {
  requireFunction(predicate, "some predicate");
  const result = reduce(collection, (missing, value) => {
    const matched = predicate(value);
    return isTruthy(matched) ? reduced(matched) : missing;
  }, NOT_FOUND);
  return result === NOT_FOUND ? notFound : result;
}

export function every(predicate, collection) {
  requireFunction(predicate, "every predicate");
  return reduce(collection, (result, value) =>
    isTruthy(predicate(value)) ? result : reduced(false), true);
}

export function notAny(predicate, collection) {
  return !isTruthy(some(predicate, collection));
}

export function notEvery(predicate, collection) {
  return !every(predicate, collection);
}

export function find(predicate, collection, notFound = null) {
  requireFunction(predicate, "find predicate");
  const result = reduce(collection, (missing, value) =>
    isTruthy(predicate(value)) ? reduced({ value }) : missing, NOT_FOUND);
  return result === NOT_FOUND ? notFound : result.value;
}

export function reductions(step, initial, collection) {
  requireFunction(step, "reductions step");
  const builder = transient(EMPTY_VECTOR);
  const seed = unreduced(initial);
  conjBang(builder, seed);
  if (!isReduced(initial)) {
    reduce(collection, (current, input) => {
      const next = step(current, input);
      const value = unreduced(next);
      conjBang(builder, value);
      return isReduced(next) ? reduced(value) : value;
    }, seed);
  }
  return persistentBang(builder);
}

export function treeSeq(branchPredicate, childrenFunction, root) {
  requireFunction(branchPredicate, "treeSeq branch predicate");
  requireFunction(childrenFunction, "treeSeq children function");
  const result = transient(EMPTY_VECTOR);
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    conjBang(result, value);
    if (isTruthy(branchPredicate(value))) {
      const children = into(EMPTY_VECTOR, childrenFunction(value));
      for (let index = collectionCount(children) - 1; index >= 0; index -= 1) {
        stack.push(collectionNth(children, index));
      }
    }
  }
  return persistentBang(result);
}

export function flatten(root) {
  const result = transient(EMPTY_VECTOR);
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (isSequentialBranch(value)) {
      const children = into(EMPTY_VECTOR, value);
      for (let index = collectionCount(children) - 1; index >= 0; index -= 1) {
        stack.push(collectionNth(children, index));
      }
    } else {
      conjBang(result, value);
    }
  }
  return persistentBang(result);
}
