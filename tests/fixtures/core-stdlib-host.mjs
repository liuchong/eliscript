import {
  concat,
  drop,
  every,
  filter,
  find,
  map,
  remove,
  reverse,
  some,
  take,
} from "../../runtime/core/sequence.mjs";
import {
  countBy,
  frequencies,
  groupBy,
  indexBy,
} from "../../runtime/core/data.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const values = persistentVector(0, 1, 2, 3, 4);
const indexed = indexBy((value) => value % 3, values);
const grouped = groupBy((value) => value % 2, values);
const counted = countBy((value) => value % 2, values);
const counts = frequencies(persistentVector(1, 2, 1, 3, 2, 1));

console.log(JSON.stringify({
  reverse: [...reverse(values)],
  map: [...map((value) => value * 2, values)],
  filter: [...filter((value) => value % 2 === 0, values)],
  remove: [...remove((value) => value === 2, values)],
  take: [...take(3, values)],
  drop: [...drop(2, values)],
  concat: [...concat([0, 1], persistentVector(2), null, new Set([3, 4]))],
  some: some((value) => value === 2 ? 0 : null, values),
  every: every(() => "", values),
  find: find((value) => value > 2, values),
  indexed: [indexed.get(0), indexed.get(1), indexed.get(2)],
  grouped: [[...grouped.get(0)], [...grouped.get(1)]],
  counted: [counted.get(0), counted.get(1)],
  frequencies: [counts.get(1), counts.get(2), counts.get(3)],
}));
