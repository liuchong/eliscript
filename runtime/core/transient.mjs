import {
  I_EDITABLE,
  I_TRANSIENT_COLLECTION,
  dispatchEditableTransient,
  dispatchTransientAssoc,
  dispatchTransientConj,
  dispatchTransientDissoc,
  dispatchTransientPersistent,
} from "./transient-internals.mjs";

export const IEditable = I_EDITABLE;
export const ITransientCollection = I_TRANSIENT_COLLECTION;

export function transient(collection) {
  return dispatchEditableTransient(collection);
}

export function conjBang(collection, ...values) {
  let result = collection;
  for (const value of values) {
    result = dispatchTransientConj(result, value);
  }
  return result;
}

export function assocBang(collection, key, value, ...keyValues) {
  if (arguments.length < 3 || keyValues.length % 2 !== 0) {
    throw new TypeError(
      "assocBang requires a transient collection followed by one or more key/value pairs",
    );
  }
  let result = dispatchTransientAssoc(collection, key, value);
  for (let index = 0; index < keyValues.length; index += 2) {
    result = dispatchTransientAssoc(
      result,
      keyValues[index],
      keyValues[index + 1],
    );
  }
  return result;
}

export function dissocBang(collection, ...keys) {
  let result = collection;
  for (const key of keys) {
    result = dispatchTransientDissoc(result, key);
  }
  return result;
}

export function persistentBang(collection) {
  return dispatchTransientPersistent(collection);
}
