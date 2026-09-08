import {
  assoc,
  contains,
  count,
  get,
  nth,
  reduce,
} from "./collection.mjs";
import {
  EMPTY_MAP,
} from "./map.mjs";
import {
  assocBang,
  persistentBang,
  transient,
} from "./transient.mjs";
import { into } from "./transducer.mjs";
import { EMPTY_VECTOR } from "./vector.mjs";

const MISSING = Symbol("eliscript.data.missing");

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function pathVector(path) {
  return into(EMPTY_VECTOR, path);
}

function readEntry(entry) {
  if (count(entry) !== 2) {
    throw new TypeError("data entries must contain exactly one key/value pair");
  }
  return [nth(entry, 0), nth(entry, 1)];
}

function collectBuckets(keyFunction, collection, createBucket, updateBucket) {
  requireFunction(keyFunction, "data key function");
  let bucketIndex = EMPTY_MAP;
  const keys = [];
  const buckets = [];
  reduce(collection, (result, value) => {
    const key = keyFunction(value);
    let index = bucketIndex.get(key, MISSING);
    if (index === MISSING) {
      index = keys.length;
      bucketIndex = bucketIndex.assoc(key, index);
      keys.push(key);
      buckets.push(createBucket(value));
    } else {
      updateBucket(buckets, index, value);
    }
    return result;
  }, null);
  return { keys, buckets };
}

function persistentMapFromBuckets(keys, buckets, finishBucket) {
  const result = transient(EMPTY_MAP);
  for (let index = 0; index < keys.length; index += 1) {
    assocBang(result, keys[index], finishBucket(buckets[index]));
  }
  return persistentBang(result);
}

export function indexBy(keyFunction, collection) {
  requireFunction(keyFunction, "indexBy key function");
  const result = transient(EMPTY_MAP);
  reduce(collection, (builder, value) => {
    assocBang(builder, keyFunction(value), value);
    return builder;
  }, result);
  return persistentBang(result);
}

export function groupBy(keyFunction, collection) {
  const { keys, buckets } = collectBuckets(
    keyFunction,
    collection,
    (value) => [value],
    (values, index, value) => values[index].push(value),
  );
  return persistentMapFromBuckets(
    keys,
    buckets,
    (values) => into(EMPTY_VECTOR, values),
  );
}

export function countBy(keyFunction, collection) {
  const { keys, buckets } = collectBuckets(
    keyFunction,
    collection,
    () => 1,
    (counts, index) => {
      counts[index] += 1;
    },
  );
  return persistentMapFromBuckets(keys, buckets, (count) => count);
}

export function frequencies(collection) {
  return countBy((value) => value, collection);
}

export function getIn(collection, path, notFound = null) {
  const keys = pathVector(path);
  let current = collection;
  for (let index = 0; index < count(keys); index += 1) {
    if (current == null) return notFound;
    current = get(current, nth(keys, index), MISSING);
    if (current === MISSING) return notFound;
  }
  return current;
}

export function assocIn(collection, path, value) {
  const keys = pathVector(path);
  const size = count(keys);
  if (size === 0) return value;

  const parents = [];
  let current = collection;
  for (let index = 0; index < size - 1; index += 1) {
    parents.push(current);
    if (current == null) {
      current = EMPTY_MAP;
      continue;
    }
    const child = get(current, nth(keys, index), MISSING);
    current = child === MISSING || child == null ? EMPTY_MAP : child;
  }

  let result = assoc(
    current == null ? EMPTY_MAP : current,
    nth(keys, size - 1),
    value,
  );
  for (let index = size - 2; index >= 0; index -= 1) {
    const parent = parents[index];
    result = assoc(
      parent == null ? EMPTY_MAP : parent,
      nth(keys, index),
      result,
    );
  }
  return result;
}

export function update(collection, key, transform, ...arguments_) {
  requireFunction(transform, "update transform");
  const target = collection == null ? EMPTY_MAP : collection;
  return assoc(target, key, transform(get(target, key), ...arguments_));
}

export function updateIn(collection, path, transform, ...arguments_) {
  requireFunction(transform, "updateIn transform");
  return assocIn(
    collection,
    path,
    transform(getIn(collection, path), ...arguments_),
  );
}

export function selectKeys(collection, keys) {
  const result = transient(EMPTY_MAP);
  reduce(keys, (builder, key) => {
    if (collection != null && contains(collection, key)) {
      assocBang(builder, key, get(collection, key));
    }
    return builder;
  }, result);
  return persistentBang(result);
}

export function merge(...collections) {
  const result = transient(EMPTY_MAP);
  for (const collection of collections) {
    reduce(collection, (builder, entry) => {
      const [key, value] = readEntry(entry);
      assocBang(builder, key, value);
      return builder;
    }, result);
  }
  return persistentBang(result);
}

export function mergeWith(combine, ...collections) {
  requireFunction(combine, "mergeWith combine function");
  let result = EMPTY_MAP;
  for (const collection of collections) {
    result = reduce(collection, (current, entry) => {
      const [key, value] = readEntry(entry);
      return assoc(
        current,
        key,
        contains(current, key) ? combine(get(current, key), value) : value,
      );
    }, result);
  }
  return result;
}

export function zipmap(keys, values) {
  const keyVector = pathVector(keys);
  const valueVector = pathVector(values);
  const size = Math.min(count(keyVector), count(valueVector));
  const result = transient(EMPTY_MAP);
  for (let index = 0; index < size; index += 1) {
    assocBang(result, nth(keyVector, index), nth(valueVector, index));
  }
  return persistentBang(result);
}
