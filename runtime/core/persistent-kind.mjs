export const PERSISTENT_MAP_KIND = Symbol("eliscript.persistent-map.kind");
export const PERSISTENT_MAP_HAS_VALUE_KEY = Symbol(
  "eliscript.persistent-map.has-value-key",
);
export const PERSISTENT_SET_KIND = Symbol("eliscript.persistent-set.kind");
export const PERSISTENT_SET_HAS_VALUE = Symbol(
  "eliscript.persistent-set.has-value",
);

export function isPersistentMapValue(value) {
  return value?.[PERSISTENT_MAP_KIND] === true &&
    typeof value?.[PERSISTENT_MAP_HAS_VALUE_KEY] === "function";
}

export function isPersistentSetValue(value) {
  return value?.[PERSISTENT_SET_KIND] === true &&
    typeof value?.[PERSISTENT_SET_HAS_VALUE] === "function";
}

export function persistentMapValueEqual(left, right, equal) {
  if (!isPersistentMapValue(right) || right.count !== left.count) {
    return false;
  }
  for (const [key, value] of left) {
    if (!right[PERSISTENT_MAP_HAS_VALUE_KEY](key) ||
        !equal(value, right.get(key))) {
      return false;
    }
  }
  return true;
}

export function persistentSetValueEqual(left, right, equal) {
  if (!isPersistentSetValue(right) || right.count !== left.count) {
    return false;
  }
  for (const value of left) {
    if (!right[PERSISTENT_SET_HAS_VALUE](value, equal)) {
      return false;
    }
  }
  return true;
}
