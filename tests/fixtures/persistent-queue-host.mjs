import { keyword } from "../../runtime/core/identifier.mjs";
import { persistentHashMap } from "../../runtime/core/map.mjs";
import { meta, withMeta } from "../../runtime/core/metadata.mjs";
import { persistentQueue } from "../../runtime/core/queue.mjs";
import { equalValues, hashValue } from "../../runtime/core/value.mjs";

let values = persistentQueue(1, keyword("two"), 3);
values = values.conj(4).pop();
const annotated = withMeta(values, persistentHashMap(["source", "host"]));

console.log(JSON.stringify({
  values: values.toArray().map(String),
  count: values.count,
  front: String(values.peek()),
  hash: hashValue(values),
  equal: equalValues(values, persistentQueue(keyword("two"), 3, 4)),
  source: meta(annotated).get("source"),
}));
