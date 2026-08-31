import { pathToFileURL } from "node:url";

import { persistentHashMap } from "../../runtime/core/map.mjs";
import { persistentVector } from "../../runtime/core/vector.mjs";

const [textModule, objectModule] = process.argv.slice(2);
if (textModule === undefined || objectModule === undefined) {
  throw new TypeError("core text/object host requires two module paths");
}

const Text = await import(pathToFileURL(textModule).href);
const ObjectCore = await import(pathToFileURL(objectModule).href);

const text = {
  blank: Text.blank ?? Text.blank_QMARK_,
  contains: Text.contains ?? Text.contains_QMARK_,
  empty: Text.empty ?? Text.empty_QMARK_,
  endsWith: Text.endsWith ?? Text.ends_with_QMARK_,
  join: Text.join,
  repeat: Text.repeat,
  slice: Text.slice,
  startsAt: Text.startsAt ?? Text.starts_at_QMARK_,
  stripPrefix: Text.stripPrefix ?? Text.strip_prefix,
  trim: Text.trim,
};
const objectCore = {
  assoc: ObjectCore.assoc,
  dissoc: ObjectCore.dissoc,
  filterValues: ObjectCore.filterValues ?? ObjectCore.filter_values,
  has: ObjectCore.has ?? ObjectCore.has_QMARK_,
  keyIn: ObjectCore.keyIn ?? ObjectCore.key_in_QMARK_,
  keys: ObjectCore.keys,
  mapValues: ObjectCore.mapValues ?? ObjectCore.map_values,
  merge: ObjectCore.merge,
  omit: ObjectCore.omit,
  pick: ObjectCore.pick,
  update: ObjectCore.update,
};

const source = { zero: 0, right: 2, absent: undefined };
const associated = objectCore.assoc(source, "next", 3, "__proto__", 7);
const valueKey = persistentVector("same");
const persistent = persistentHashMap(
  [persistentVector("same"), 1],
  ["right", 2],
);

function sortedEntries(value) {
  return [...value].sort(([left], [right]) =>
    String(left).localeCompare(String(right)));
}

console.log(JSON.stringify({
  text: {
    empty: text.empty(""),
    slice: text.slice(0, 3, "A😀"),
    surrogate: text.slice(1, 2, "A😀").charCodeAt(0),
    starts: text.startsAt("😀", 1, "A😀"),
    ends: text.endsWith("😀", "A😀"),
    contains: text.contains("😀", "A😀B"),
    stripped: text.stripPrefix("#", "#article"),
    trimmed: text.trim(" \tEliscript\n"),
    blank: text.blank(" \r\n"),
    joined: text.join("/", new Set(["a", 2, false])),
    repeated: text.repeat(3, "ab"),
  },
  object: {
    keys: [...objectCore.keys(source)],
    sourceUnchanged: Object.keys(source).length === 3 && !Object.hasOwn(source, "next"),
    associated: [associated.zero, associated.right, associated.next],
    safePrototype: Object.getPrototypeOf(associated) === Object.prototype &&
      Object.hasOwn(associated, "__proto__") && associated.__proto__ === 7,
    missingPreserved: objectCore.has(source, "absent") &&
      objectCore.pick(source, ["absent"]).absent === undefined,
    dissociated: objectCore.dissoc(source, "right"),
    absentIdentity: objectCore.dissoc(source, "missing") === source,
    merged: objectCore.merge(source, { right: 9, extra: 4 }),
    mapped: objectCore.mapValues((value) => value ?? "nil", source),
    filtered: objectCore.filterValues(
      (value) => value === 0 ? 0 : typeof value === "number" && value > 1,
      source,
    ),
    picked: objectCore.pick(source, ["absent", "zero", "missing"]),
    omitted: objectCore.omit(source, ["right"]),
    updated: objectCore.update(source, "right", (value) => value + 5),
    valueKey: objectCore.keyIn(valueKey, [persistentVector("same")]),
    persistent: sortedEntries(objectCore.mapValues(
      (value) => value + 10,
      persistent,
    )).map(([key, value]) => [String(key), value]),
  },
}));
