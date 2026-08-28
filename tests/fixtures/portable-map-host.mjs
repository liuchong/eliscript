import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const mapModule = await import(pathToFileURL(resolve(process.argv[2])).href);

const {
  empty_persistent_map: emptyPersistentMap,
  persistent_map_QMARK_: isPersistentMap,
  persistent_map_count: persistentMapCount,
  persistent_map_has_QMARK_: persistentMapHas,
  persistent_map_get: persistentMapGet,
  persistent_map_assoc: persistentMapAssoc,
  persistent_map_dissoc: persistentMapDissoc,
  persistent_map_reduce: persistentMapReduce,
  persistent_map_to_entries: persistentMapToEntries,
  persistent_map_from_entries: persistentMapFromEntries,
} = mapModule;

function integerHash(value) {
  let word = value >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  word = Math.imul(word ^ (word >>> 16), 0x45d9f3b);
  return (word ^ (word >>> 16)) >>> 0;
}

const equal = (left, right) => left === right;
let map = emptyPersistentMap(integerHash, equal, equal);
for (let key = 0; key < 100_000; key += 1) {
  map = persistentMapAssoc(map, key, key * 3);
}

const updated = persistentMapAssoc(map, 54_321, "updated");
const removed = persistentMapDissoc(updated, 75_000);
let collision = emptyPersistentMap(() => 7, equal, equal);
for (let key = 0; key < 100; key += 1) {
  collision = persistentMapAssoc(collision, `collision-${key}`, key);
}
collision = persistentMapDissoc(collision, "collision-50");
const sample = persistentMapFromEntries(
  integerHash,
  equal,
  equal,
  [[3, "c"], [1, "a"], [2, "b"]],
);

process.stdout.write(`${JSON.stringify({
  persistent: isPersistentMap(map),
  count: persistentMapCount(map),
  rootKind: map.root.kind,
  probes: [0, 31, 32, 1024, 32768, 99999].map(
    (key) => persistentMapGet(map, key, "missing"),
  ),
  original: persistentMapGet(map, 54_321, "missing"),
  updated: persistentMapGet(updated, 54_321, "missing"),
  removed: persistentMapHas(removed, 75_000),
  sum: persistentMapReduce((total, _key, value) => total + value, 0, map),
  noopAssoc: persistentMapAssoc(map, 54_321, 162_963) === map,
  noopDissoc: persistentMapDissoc(map, -1) === map,
  collision: {
    count: persistentMapCount(collision),
    kind: collision.root.kind,
    removed: persistentMapHas(collision, "collision-50"),
    retained: persistentMapGet(collision, "collision-99", "missing"),
  },
  sample: persistentMapToEntries(sample).sort((left, right) => left[0] - right[0]),
})}\n`);
