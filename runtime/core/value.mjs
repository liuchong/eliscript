import {
  I_EQUIV,
  I_HASH,
  cachedProtocolHash,
  dispatchValueEqual,
  dispatchValueHash,
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
import {
  extendProtocolType,
  implementsProtocolOperation,
} from "./protocol.mjs";

export const IEquiv = I_EQUIV;
export const IHash = I_HASH;

export function extendValueType(constructor, implementations) {
  if (implementations === null || typeof implementations !== "object" ||
      typeof implementations.equal !== "function" ||
      typeof implementations.hash !== "function") {
    throw new TypeError(
      "value type extension requires equal and hash functions",
    );
  }
  extendProtocolType(IEquiv, constructor, { equal: implementations.equal });
  extendProtocolType(IHash, constructor, { hash: implementations.hash });
  return constructor;
}

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

  if (!implementsProtocolOperation(IEquiv, "equal", left) ||
      !implementsProtocolOperation(IEquiv, "equal", right)) {
    return false;
  }
  return dispatchValueEqual(left, right, equalValues) === true;
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
      if (implementsProtocolOperation(IHash, "hash", value)) {
        return cachedProtocolHash(
          value,
          () => dispatchValueHash(value, hashValue),
        );
      }
      return hostIdentityHash(value);
    }
    default:
      throw new TypeError(`cannot hash JavaScript value of type ${typeof value}`);
  }
}
