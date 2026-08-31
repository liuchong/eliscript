import { printValue, readValue } from "../../runtime/core/data-text.mjs";
import { keyword } from "../../runtime/core/identifier.mjs";
import {
  EMPTY_LIST,
  persistentList,
} from "../../runtime/core/list.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { meta, withMeta } from "../../runtime/core/metadata.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";

const metadata = persistentHashMap([keyword("source"), "host"]);
const values = persistentList(1, keyword("two"), persistentList(3, 4));
const annotated = withMeta(values, metadata);
const text = printValue(annotated);
const restored = readValue(text);
const keyed = persistentHashMap([values, "found"]);

console.log(JSON.stringify({
  empty: EMPTY_LIST.count,
  values: values.toArray().map((value) =>
    typeof value === "object" && value?.toArray ? value.toArray() : String(value)),
  hash: hashValue(values),
  equal: equalValues(restored, annotated),
  text,
  source: meta(restored).get(keyword("source")),
  keyed: keyed.get(persistentList(1, keyword("two"), persistentList(3, 4))),
}));
