import {
  count,
  get,
  isSequenceView,
  nth,
  reduce,
  reduced,
  seq,
} from "../../runtime/core/collection.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const vector = persistentVector(2, 4, 6, 8);
const map = persistentHashMap(["left", 3], ["right", 5]);
const set = persistentHashSet("alpha", "beta");
const mapEntries = [...seq(map)].sort(([left], [right]) => left.localeCompare(right));

console.log(JSON.stringify({
  counts: [count(vector), count(map), count(set), count([1, 2]), count(null)],
  lookup: [get(vector, 2), get(map, "right"), get(set, "alpha"), nth(vector, 9, "missing")],
  sequence: {
    view: isSequenceView(seq(vector)),
    vector: [...seq(vector)],
    map: mapEntries,
    empty: seq([]),
  },
  reductions: {
    vector: reduce(vector, (total, value) => total + value, 0),
    map: reduce(map, (total, entry) => total + entry[1], 0),
    set: reduce(set, (values, value) => [...values, value], []).sort(),
    early: reduce(vector, (total, value) =>
      value === 6 ? reduced(total + value) : total + value, 0),
  },
}));
