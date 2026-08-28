import {
  EMPTY_MAP,
  persistentHashMap,
} from "../../runtime/core/map.mjs";
import {
  inspectPersistentMap,
  persistentMapMetrics,
  resetPersistentMapMetrics,
  sharedPersistentMapNodes,
} from "../../runtime/testing/map.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

let values = EMPTY_MAP;
for (let key = 0; key < 100_000; key += 1) {
  values = values.assoc(key, key * 2);
}

const shape = inspectPersistentMap(values);
resetPersistentMapMetrics();
const updated = values.assoc(54_321, "updated");
const metrics = persistentMapMetrics();

const collision = persistentHashMap(
  ["key-50691", "left"],
  ["key-194634", "right"],
);
const ordered = persistentHashMap(
  ["alpha", 1],
  [persistentVector(1, 2), persistentVector("value")],
  ["omega", 3],
);
const reversed = persistentHashMap(
  ["omega", 3],
  [persistentVector(1, 2), persistentVector("value")],
  ["alpha", 1],
);

console.log(JSON.stringify({
  shape,
  probes: [0, 31, 32, 1024, 32768, 99999].map((key) => values.get(key)),
  missing: values.get("missing", "not-found"),
  original: values.get(54_321),
  updated: updated.get(54_321),
  sharedNodes: sharedPersistentMapNodes(values, updated),
  metrics,
  sum: values.reduce((total, value) => total + value, 0),
  collision: {
    count: collision.count,
    left: collision.get("key-50691"),
    right: collision.get("key-194634"),
    shape: inspectPersistentMap(collision),
  },
  unordered: {
    equal: equalValues(ordered, reversed),
    leftHash: hashValue(ordered),
    rightHash: hashValue(reversed),
  },
}));
