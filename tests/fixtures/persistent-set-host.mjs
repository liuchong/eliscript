import {
  EMPTY_SET,
  persistentHashSet,
} from "../../runtime/core/set.mjs";
import {
  inspectPersistentSet,
  persistentSetMetrics,
  resetPersistentSetMetrics,
  sharedPersistentSetNodes,
} from "../../runtime/testing/set.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

let values = EMPTY_SET;
for (let value = 0; value < 100_000; value += 1) {
  values = values.conj(value);
}

const shape = inspectPersistentSet(values);
resetPersistentSetMetrics();
const updated = values.disj(54_321);
const metrics = persistentSetMetrics();

const collision = persistentHashSet("key-50691", "key-194634");
const ordered = persistentHashSet(
  "alpha",
  persistentVector(1, 2),
  "omega",
);
const reversed = persistentHashSet(
  "omega",
  persistentVector(1, 2),
  "alpha",
);

console.log(JSON.stringify({
  shape,
  probes: [0, 31, 32, 1024, 32768, 99_999].map((value) => values.has(value)),
  missing: values.has("missing"),
  original: values.has(54_321),
  updated: updated.has(54_321),
  sharedNodes: sharedPersistentSetNodes(values, updated),
  metrics,
  sum: values.reduce((total, value) => total + value, 0),
  collision: {
    count: collision.count,
    left: collision.has("key-50691"),
    right: collision.has("key-194634"),
    shape: inspectPersistentSet(collision),
  },
  algebra: {
    union: [...persistentHashSet(1, 2).union([2, 3])].sort((left, right) => left - right),
    intersection: [...persistentHashSet(1, 2, 3).intersection([2, 3, 4])]
      .sort((left, right) => left - right),
    difference: [...persistentHashSet(1, 2, 3).difference([2])]
      .sort((left, right) => left - right),
  },
  unordered: {
    equal: equalValues(ordered, reversed),
    leftHash: hashValue(ordered),
    rightHash: hashValue(reversed),
  },
}));
