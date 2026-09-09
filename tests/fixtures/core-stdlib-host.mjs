import {
  butlast,
  concat,
  dedupe,
  distinct,
  drop,
  dropLast,
  dropWhile,
  every,
  filter,
  find,
  first,
  interpose,
  keep,
  keepIndexed,
  last,
  map,
  mapIndexed,
  mapcat,
  sequenceNth,
  partitionAll,
  partitionBy,
  reductions,
  remove,
  reverse,
  some,
  splitAt,
  splitWith,
  take,
  takeLast,
  takeNth,
  takeWhile,
} from "../../runtime/core/sequence.mjs";
import {
  assocIn,
  countBy,
  frequencies,
  getIn,
  groupBy,
  indexBy,
  merge,
  mergeWith,
  selectKeys,
  updateIn,
  zipmap,
} from "../../runtime/core/data.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const values = persistentVector(0, 1, 2, 3, 4);
const indexed = indexBy((value) => value % 3, values);
const grouped = groupBy((value) => value % 2, values);
const counted = countBy((value) => value % 2, values);
const counts = frequencies(persistentVector(1, 2, 1, 3, 2, 1));
const nested = updateIn(
  assocIn(null, ["profile", "visits"], 1),
  ["profile", "visits"],
  (value, amount) => value + amount,
  4,
);
const selected = selectKeys({ left: 1, right: 2 }, ["right"]);
const merged = merge({ left: 1 }, { left: 3, right: 2 });
const combined = mergeWith(
  (left, right) => left + right,
  { hits: 2 },
  { hits: 5 },
);
const zipped = zipmap(["a", "b", "unused"], [10, 20]);

console.log(JSON.stringify({
  reverse: [...reverse(values)],
  map: [...map((value) => value * 2, values)],
  filter: [...filter((value) => value % 2 === 0, values)],
  remove: [...remove((value) => value === 2, values)],
  take: [...take(3, values)],
  drop: [...drop(2, values)],
  mapIndexed: [...mapIndexed((index, value) => index + value, values)],
  keep: [...keep((value) => value % 2 === 0 ? value : null, values)],
  keepIndexed: [...keepIndexed((index, value) => value % 2 === 0
    ? index + value
    : null, values)],
  takeWhile: [...takeWhile((value) => value < 3, values)],
  dropWhile: [...dropWhile((value) => value < 3, values)],
  takeNth: [...takeNth(2, values)],
  interpose: [...interpose("x", [1, 2, 3])],
  dedupe: [...dedupe([1, 1, 2, 1])],
  distinct: [...distinct([1, 2, 1, 3, 2])],
  mapcat: [...mapcat((value) => [value, value * 10], [1, 2])],
  partitionAll: [...partitionAll(2, values)].map((value) => [...value]),
  partitionBy: [...partitionBy((value) => value % 2, [1, 3, 2, 4, 5])]
    .map((value) => [...value]),
  reductions: [...reductions((sum, value) => sum + value, 0, [1, 2, 3])],
  concat: [...concat([0, 1], persistentVector(2), null, new Set([3, 4]))],
  some: some((value) => value === 2 ? 0 : null, values),
  every: every(() => "", values),
  find: find((value) => value > 2, values),
  selection: [
    first(values),
    last(values),
    sequenceNth(2, values),
    [...takeLast(2, values)],
    [...dropLast(2, values)],
    [...butlast(values)],
    [...splitAt(2, values)].map((part) => [...part]),
    [...splitWith((value) => value < 3, values)].map((part) => [...part]),
  ],
  indexed: [indexed.get(0), indexed.get(1), indexed.get(2)],
  grouped: [[...grouped.get(0)], [...grouped.get(1)]],
  counted: [counted.get(0), counted.get(1)],
  frequencies: [counts.get(1), counts.get(2), counts.get(3)],
  associative: [
    getIn(nested, ["profile", "visits"]),
    selected.get("right"),
    merged.get("left"),
    merged.get("right"),
    combined.get("hits"),
    zipped.get("a"),
    zipped.get("b"),
    zipped.count,
  ],
}));
