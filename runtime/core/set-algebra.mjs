import {
  assoc,
  conj,
  contains,
  count,
  empty,
  get,
  reduce,
  reduceKV,
  reduced,
} from "./collection.mjs";
import {
  keys,
  merge,
  selectKeys,
  vals,
} from "./data.mjs";
import { EMPTY_MAP } from "./map.mjs";
import { meta, withMeta } from "./metadata.mjs";
import {
  EMPTY_SET,
  isPersistentHashSet,
} from "./set.mjs";
import {
  assocBang,
  conjBang,
  dissocBang,
  persistentBang,
  transient,
} from "./transient.mjs";
import { isTruthy } from "./truth.mjs";

const NOT_FOUND = Object.freeze({});

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

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function requireJoinArity(actual) {
  if (actual !== 2 && actual !== 3) {
    throw new TypeError("join expects 2 or 3 relations");
  }
}

function persistentMap(collection) {
  return withMeta(merge(collection), meta(collection));
}

function firstValue(collection) {
  return reduce(collection, (_missing, value) =>
    reduced({ value }), NOT_FOUND);
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

export function select(predicate, collection) {
  requireArity(arguments.length, 2, "select");
  requireFunction(predicate, "select predicate");
  const source = set(collection);
  const builder = transient(source);
  reduce(source, (result, value) => {
    if (!isTruthy(predicate(value))) dissocBang(result, value);
    return result;
  }, builder);
  const selected = persistentBang(builder);
  return count(selected) === count(source) ? source : selected;
}

export function project(relation, selectedKeys) {
  requireArity(arguments.length, 2, "project");
  const source = set(relation);
  const keySet = set(selectedKeys);
  const builder = transient(empty(source));
  reduce(source, (result, row) => {
    conjBang(result, selectKeys(row, keySet));
    return result;
  }, builder);
  return persistentBang(builder);
}

export function renameKeys(collection, keyMap) {
  requireArity(arguments.length, 2, "renameKeys");
  const source = persistentMap(collection);
  const mappings = persistentMap(keyMap);
  const builder = transient(source);
  reduceKV(mappings, (result, oldKey) => {
    dissocBang(result, oldKey);
    return result;
  }, builder);
  reduceKV(mappings, (result, oldKey, newKey) => {
    if (contains(source, oldKey)) {
      assocBang(result, newKey, get(source, oldKey));
    }
    return result;
  }, builder);
  return persistentBang(builder);
}

export function rename(relation, keyMap) {
  requireArity(arguments.length, 2, "rename");
  const source = set(relation);
  const mappings = persistentMap(keyMap);
  const builder = transient(empty(source));
  reduce(source, (result, row) => {
    conjBang(result, renameKeys(row, mappings));
    return result;
  }, builder);
  return persistentBang(builder);
}

export function index(relation, selectedKeys) {
  requireArity(arguments.length, 2, "index");
  const source = set(relation);
  const keySet = set(selectedKeys);
  return reduce(source, (result, row) => {
    const indexedKey = selectKeys(row, keySet);
    const group = get(result, indexedKey, EMPTY_SET);
    return assoc(result, indexedKey, conj(group, row));
  }, EMPTY_MAP);
}

export function mapInvert(collection) {
  requireArity(arguments.length, 1, "mapInvert");
  const builder = transient(EMPTY_MAP);
  reduceKV(collection, (result, key, value) => {
    assocBang(result, value, key);
    return result;
  }, builder);
  return withMeta(persistentBang(builder), meta(collection));
}

function joinIndexed(probe, indexed, probeKeys, keyMap, builder) {
  return reduce(probe, (result, row) => {
    const selected = selectKeys(row, probeKeys);
    const indexedKey = keyMap === null
      ? selected
      : renameKeys(selected, keyMap);
    const matches = get(indexed, indexedKey, EMPTY_SET);
    reduce(matches, (output, matched) => {
      conjBang(output, merge(matched, row));
      return output;
    }, result);
    return result;
  }, builder);
}

export function join(left, right, keyMap) {
  requireJoinArity(arguments.length);
  const leftSet = set(left);
  const rightSet = set(right);
  const builder = transient(empty(leftSet));
  if (count(leftSet) === 0 || count(rightSet) === 0) {
    return persistentBang(builder);
  }

  if (arguments.length === 2) {
    const leftRow = firstValue(leftSet).value;
    const rightRow = firstValue(rightSet).value;
    const joinKeys = intersection(set(keys(leftRow)), set(keys(rightRow)));
    const indexedRelation = count(leftSet) <= count(rightSet)
      ? leftSet
      : rightSet;
    const probeRelation = indexedRelation === leftSet ? rightSet : leftSet;
    return persistentBang(joinIndexed(
      probeRelation,
      index(indexedRelation, joinKeys),
      joinKeys,
      null,
      builder,
    ));
  }

  const mappings = persistentMap(keyMap);
  const effectiveMap = count(leftSet) <= count(rightSet)
    ? mapInvert(mappings)
    : mappings;
  const indexedRelation = count(leftSet) <= count(rightSet)
    ? leftSet
    : rightSet;
  const probeRelation = indexedRelation === leftSet ? rightSet : leftSet;
  return persistentBang(joinIndexed(
    probeRelation,
    index(indexedRelation, vals(effectiveMap)),
    keys(effectiveMap),
    effectiveMap,
    builder,
  ));
}
