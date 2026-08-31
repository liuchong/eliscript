import { reduce } from "./collection.mjs";
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
