import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";
import {
  assocBang,
  conjBang,
  dissocBang,
  persistentBang,
  transient,
} from "../../runtime/core/transient.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const vector = transient(persistentVector(1, 2));
conjBang(vector, 3, 4);
assocBang(vector, 0, 9);

const map = transient(persistentHashMap(["left", 1]));
assocBang(map, "right", 2, "left", 3);
dissocBang(map, "missing");

const set = transient(persistentHashSet("left"));
conjBang(set, "right", "left");
dissocBang(set, "left");

console.log(JSON.stringify({
  vector: [...persistentBang(vector)],
  map: [...persistentBang(map)].sort(([left], [right]) =>
    left.localeCompare(right)),
  set: [...persistentBang(set)].sort(),
}));
