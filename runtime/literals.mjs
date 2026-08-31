import { persistentList } from "./core/list.mjs";
import { persistentHashMap } from "./core/map.mjs";
import { persistentVector } from "./core/vector.mjs";

export { eliscriptSymbol as symbol, keyword } from "./core/identifier.mjs";

export function list(...values) {
  return persistentList(...values);
}

export function vector(...values) {
  return persistentVector(...values);
}

export function hashMap(...keyValues) {
  if (keyValues.length % 2 !== 0) {
    throw new TypeError("hash-map expects complete key/value pairs");
  }
  const entries = [];
  for (let index = 0; index < keyValues.length; index += 2) {
    entries.push([keyValues[index], keyValues[index + 1]]);
  }
  return persistentHashMap(...entries);
}
