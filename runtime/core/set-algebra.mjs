import {
  contains,
  count,
  empty,
  reduce,
  reduced,
} from "./collection.mjs";
import {
  EMPTY_SET,
  isPersistentHashSet,
} from "./set.mjs";
import {
  conjBang,
  dissocBang,
  persistentBang,
  transient,
} from "./transient.mjs";

function requireArity(actual, expected, label) {
  if (actual !== expected) {
    throw new TypeError(`${label} expects ${expected} collection${expected === 1 ? "" : "s"}`);
  }
}

function requireNonEmpty(actual, label) {
  if (actual === 0) {
    throw new TypeError(`${label} expects at least one collection`);
  }
}

export function set(collection) {
  requireArity(arguments.length, 1, "set");
  if (isPersistentHashSet(collection)) return collection;

  const result = transient(EMPTY_SET);
  reduce(collection, (builder, value) => {
    conjBang(builder, value);
    return builder;
  }, result);
  return persistentBang(result);
}

export function union(...collections) {
  if (collections.length === 0) return EMPTY_SET;

  const result = transient(set(collections[0]));
  for (let index = 1; index < collections.length; index += 1) {
    reduce(collections[index], (builder, value) => {
      conjBang(builder, value);
      return builder;
    }, result);
  }
  return persistentBang(result);
}

function intersectPair(left, right) {
  const leftSet = set(left);
  const rightSet = set(right);
  const candidates = count(leftSet) <= count(rightSet) ? leftSet : rightSet;
  const membership = candidates === leftSet ? rightSet : leftSet;
  const builder = transient(empty(leftSet));
  reduce(candidates, (result, value) => {
    if (contains(membership, value)) conjBang(result, value);
    return result;
  }, builder);
  const retained = persistentBang(builder);
  return count(retained) === count(leftSet) ? leftSet : retained;
}

export function intersection(...collections) {
  requireNonEmpty(collections.length, "intersection");
  let result = set(collections[0]);
  for (let index = 1;
    index < collections.length && count(result) > 0;
    index += 1) {
    result = intersectPair(result, collections[index]);
  }
  return result;
}

export function difference(...collections) {
  requireNonEmpty(collections.length, "difference");
  const result = transient(set(collections[0]));
  for (let index = 1; index < collections.length; index += 1) {
    reduce(collections[index], (builder, value) => {
      dissocBang(builder, value);
      return builder;
    }, result);
  }
  return persistentBang(result);
}

export function subset(left, right) {
  requireArity(arguments.length, 2, "subset");
  const candidates = set(left);
  const membership = set(right);
  if (count(candidates) > count(membership)) return false;
  return reduce(candidates, (result, value) =>
    contains(membership, value) ? result : reduced(false), true);
}

export function superset(left, right) {
  requireArity(arguments.length, 2, "superset");
  return subset(right, left);
}

export function disjoint(left, right) {
  requireArity(arguments.length, 2, "disjoint");
  const leftSet = set(left);
  const rightSet = set(right);
  const candidates = count(leftSet) <= count(rightSet) ? leftSet : rightSet;
  const membership = candidates === leftSet ? rightSet : leftSet;
  return reduce(candidates, (result, value) =>
    contains(membership, value) ? reduced(false) : result, true);
}
