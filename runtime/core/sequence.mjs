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
import { EMPTY_VECTOR, persistentVector } from "./vector.mjs";

const NOT_FOUND = Symbol("eliscript.sequence.not-found");

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

export function partitionAll(size, collection) {
  return into(EMPTY_VECTOR, partitioningAll(size), collection);
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
