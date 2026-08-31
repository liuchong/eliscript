import { isPersistentHashMap } from "./map.mjs";
import {
  I_META,
  I_WITH_META,
  dispatchMetadataRead,
  dispatchMetadataWith,
} from "./metadata-internals.mjs";
import { implementsProtocolOperation } from "./protocol.mjs";

export const IMeta = I_META;
export const IWithMeta = I_WITH_META;

function validateMetadata(metadata) {
  if (metadata !== null && !isPersistentHashMap(metadata)) {
    throw new TypeError("metadata must be null or a persistent hash map");
  }
  return metadata;
}

export function supportsMetadata(value) {
  return implementsProtocolOperation(IMeta, "meta", value) &&
    implementsProtocolOperation(IWithMeta, "withMeta", value);
}

export function meta(value) {
  return implementsProtocolOperation(IMeta, "meta", value)
    ? dispatchMetadataRead(value)
    : null;
}

export function withMeta(value, metadata) {
  validateMetadata(metadata);
  if (!implementsProtocolOperation(IWithMeta, "withMeta", value)) {
    throw new TypeError("value does not support metadata");
  }
  return dispatchMetadataWith(value, metadata);
}

export function varyMeta(value, transform, ...arguments_) {
  if (typeof transform !== "function") {
    throw new TypeError("metadata transform must be a function");
  }
  return withMeta(value, transform(meta(value), ...arguments_));
}
