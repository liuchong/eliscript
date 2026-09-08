import {
  isReduced,
  reduce,
  reduced,
  unreduced,
} from "./collection.mjs";
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
import { EMPTY_VECTOR } from "./vector.mjs";

const NOT_FOUND = Symbol("eliscript.sequence.not-found");

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

export function reverse(collection) {
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
