import {
  VALUE_EQUAL,
  VALUE_HASH,
  cachedProtocolHash,
  hashBigInt,
  hashBoolean,
  hashGlobalSymbol,
  hashNull,
  hashNumber,
  hashString,
  hashUndefined,
  hostIdentityHash,
  recordHashValueCall,
} from "./value-internals.mjs";

export function equalValues(left, right) {
  if (left === right) {
    return true;
  }
  if (typeof left === "number" && typeof right === "number") {
    return Number.isNaN(left) && Number.isNaN(right);
  }
  if (left === null || right === null ||
      (typeof left !== "object" && typeof left !== "function") ||
      (typeof right !== "object" && typeof right !== "function")) {
    return false;
  }

  const leftEqual = left[VALUE_EQUAL];
  const rightEqual = right[VALUE_EQUAL];
  if (typeof leftEqual !== "function" || typeof rightEqual !== "function") {
    return false;
  }
  return leftEqual.call(left, right, equalValues) === true;
}

export function hashValue(value) {
  recordHashValueCall();
  if (value === null) {
    return hashNull();
  }
  switch (typeof value) {
    case "undefined":
      return hashUndefined();
    case "boolean":
      return hashBoolean(value);
    case "number":
      return hashNumber(value);
    case "bigint":
      return hashBigInt(value);
    case "string":
      return hashString(value);
    case "symbol": {
      const globalKey = Symbol.keyFor(value);
      return globalKey === undefined
        ? hostIdentityHash(value)
        : hashGlobalSymbol(globalKey);
    }
    case "function":
    case "object": {
      const protocol = value[VALUE_HASH];
      if (typeof protocol === "function") {
        return cachedProtocolHash(
          value,
          () => protocol.call(value, hashValue),
        );
      }
      return hostIdentityHash(value);
    }
    default:
      throw new TypeError(`cannot hash JavaScript value of type ${typeof value}`);
  }
}
