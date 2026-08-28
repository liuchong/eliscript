import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const setModule = await import(pathToFileURL(modulePath).href);

const {
  empty_persistent_set: emptyPersistentSet,
  persistent_set_QMARK_: persistentSet,
  persistent_set_count: persistentSetCount,
  persistent_set_has_QMARK_: persistentSetHas,
  persistent_set_conj: persistentSetConj,
  persistent_set_disj: persistentSetDisj,
  persistent_set_reduce: persistentSetReduce,
  persistent_set_from_array: persistentSetFromArray,
  persistent_set_to_array: persistentSetToArray,
  persistent_set_union: persistentSetUnion,
  persistent_set_intersection: persistentSetIntersection,
  persistent_set_difference: persistentSetDifference,
  persistent_set_subset_QMARK_: persistentSetSubset,
  persistent_set_superset_QMARK_: persistentSetSuperset,
  persistent_set_disjoint_QMARK_: persistentSetDisjoint,
  persistent_set_equal_QMARK_: persistentSetEqual,
} = setModule;

function integerHash(value) {
  let word = value >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  return (word ^ (word >>> 16)) >>> 0;
}

const equal = (left, right) => left === right;
let values = emptyPersistentSet(integerHash, equal);
for (let value = 0; value < 100_000; value += 1) {
  values = persistentSetConj(values, value);
}
const original = values;
const noopConj = persistentSetConj(values, 54_321);
values = persistentSetConj(values, 100_000);
values = persistentSetDisj(values, 75_000);

let collision = emptyPersistentSet(() => 7, equal);
for (let value = 0; value < 100; value += 1) {
  collision = persistentSetConj(collision, `key-${value}`);
}
collision = persistentSetDisj(collision, "key-50");

const left = persistentSetFromArray(
  integerHash,
  equal,
  Array.from({ length: 1_000 }, (_unused, index) => index),
);
const right = persistentSetFromArray(
  integerHash,
  equal,
  Array.from({ length: 1_000 }, (_unused, index) => index + 500),
);
const intersection = persistentSetIntersection(left, right);
const difference = persistentSetDifference(left, right);
const union = persistentSetUnion(left, right);
const sample = persistentSetToArray(
  persistentSetFromArray(integerHash, equal, [3, 1, 2, 3, 1]),
).sort((a, b) => a - b);

console.log(JSON.stringify({
  persistent: persistentSet(values),
  count: persistentSetCount(values),
  rootKind: values.map.root.kind,
  probes: [
    persistentSetHas(values, 0),
    persistentSetHas(values, 75_000),
    persistentSetHas(values, 99_999),
    persistentSetHas(values, 100_000),
  ],
  originalCount: persistentSetCount(original),
  originalRetained: persistentSetHas(original, 75_000),
  sum: persistentSetReduce((result, value) => result + value, 0, original),
  noopConj: noopConj === original,
  noopDisj: persistentSetDisj(original, -1) === original,
  collision: {
    count: persistentSetCount(collision),
    kind: collision.map.root.kind,
    removed: persistentSetHas(collision, "key-50"),
    retained: persistentSetHas(collision, "key-99"),
  },
  algebra: {
    union: persistentSetCount(union),
    intersection: persistentSetCount(intersection),
    difference: persistentSetCount(difference),
    subset: persistentSetSubset(intersection, left),
    superset: persistentSetSuperset(left, intersection),
    disjoint: persistentSetDisjoint(intersection, difference),
    equal: persistentSetEqual(
      union,
      persistentSetFromArray(
        integerHash,
        equal,
        Array.from({ length: 1_500 }, (_unused, index) => index),
      ),
    ),
  },
  sample,
}));
