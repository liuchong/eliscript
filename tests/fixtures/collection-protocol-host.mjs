import {
  assoc,
  conj,
  contains,
  count,
  disj,
  dissoc,
  empty,
  get,
  isSequenceView,
  nth,
  peek,
  pop,
  reduce,
  reduceKV,
  reduced,
  rseq,
  seq,
} from "../../runtime/core/collection.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentList } from "../../runtime/core/list.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const vector = persistentVector(2, 4, 6, 8);
const map = persistentHashMap(["left", 3], ["right", 5]);
const set = persistentHashSet("alpha", "beta");
const list = persistentList(2, 4, 6, 8);
const mapEntries = [...seq(map)].sort(([left], [right]) => left.localeCompare(right));
const constructedMap = [...conj(map, ["third", 7])]
  .sort(([left], [right]) => left.localeCompare(right));

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
    indexed: reduceKV(vector, (total, index, value) => total + index + value, 0),
    keyed: reduceKV(map, (total, key, value) => total + key.length + value, 0),
  },
  construction: {
    vector: [...conj(vector, 10)],
    map: constructedMap,
    set: [...conj(set, "gamma")].sort(),
    associated: [...assoc(vector, 1, 9)],
    contains: [contains(vector, 3), contains(map, "missing"), contains(set, "beta")],
    emptied: [count(empty(vector)), count(empty(map)), count(empty(set))],
  },
  removal: {
    map: [...dissoc(map, "left")],
    set: [...disj(set, "alpha")],
    object: dissoc({ left: 3, right: 5 }, "left"),
  },
  stack: {
    list: [peek(list), [...pop(list)]],
    vector: [peek(vector), [...pop(vector)]],
    array: [peek([2, 4, 6]), pop([2, 4, 6])],
    nil: [peek(null), pop(null)],
  },
  reversible: {
    vector: [...rseq(vector)],
    array: [...rseq([2, 4, 6])],
    string: [...rseq("abc")],
    nil: rseq(null),
  },
}));
