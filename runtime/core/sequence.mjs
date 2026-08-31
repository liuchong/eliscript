import {
  reduce,
  reduced,
} from "./collection.mjs";
import {
  dropping,
  filtering,
  into,
  mapping,
  removing,
  taking,
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
