import { printValue, readValue } from "../../runtime/core/data-text.mjs";
import { eliscriptSymbol, keyword } from "../../runtime/core/identifier.mjs";
import { persistentList } from "../../runtime/core/list.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { meta, withMeta } from "../../runtime/core/metadata.mjs";
import { persistentQueue } from "../../runtime/core/queue.mjs";
import { persistentHashSet } from "../../runtime/core/set.mjs";
import { equalValues } from "../../runtime/core/value.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const metadata = persistentHashMap([keyword("source"), "host"]);
const value = withMeta(persistentHashMap(
  [keyword("vector"), persistentVector(1, eliscriptSymbol("two"))],
  [keyword("list"), persistentList(1, keyword("two"))],
  [keyword("set"), persistentHashSet(3, 1, 2)],
  [keyword("map"), persistentHashMap([keyword("b"), 2], [keyword("a"), 1])],
  [keyword("queue"), persistentQueue(1, keyword("two"), persistentVector(3))],
), metadata);
const text = printValue(value);
const restored = readValue(text);

console.log(JSON.stringify({
  text,
  stable: printValue(restored) === text,
  equal: equalValues(restored, value),
  source: meta(restored).get(keyword("source")),
}));
