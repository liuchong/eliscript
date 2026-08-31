import { eliscriptSymbol } from "../../runtime/core/identifier.mjs";
import { meta, withMeta } from "../../runtime/core/metadata.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const metadata = persistentHashMap(["source", "host"]);
const symbol = eliscriptSymbol("eliscript/metadata");
const annotatedSymbol = withMeta(symbol, metadata);
const vector = withMeta(persistentVector(1, 2, 3), metadata).conj(4);
const map = withMeta(persistentHashMap(["a", 1]), metadata).assoc("b", 2);
const set = withMeta(persistentHashSet("a", "b"), metadata).conj("c");

console.log(JSON.stringify({
  symbol: {
    equal: equalValues(symbol, annotatedSymbol),
    hashEqual: hashValue(symbol) === hashValue(annotatedSymbol),
    source: meta(annotatedSymbol).get("source"),
  },
  vector: { count: vector.count, source: meta(vector).get("source") },
  map: { count: map.count, source: meta(map).get("source") },
  set: { count: set.count, source: meta(set).get("source") },
}));
