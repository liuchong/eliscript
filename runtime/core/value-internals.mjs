import {
  defineProtocol,
  protocolMethod,
  protocolSlot,
} from "./protocol.mjs";

export const I_EQUIV = defineProtocol("IEquiv", ["equal"]);
export const I_HASH = defineProtocol("IHash", ["hash"]);
export const VALUE_EQUAL = protocolSlot(I_EQUIV, "equal");
export const VALUE_HASH = protocolSlot(I_HASH, "hash");
export const dispatchValueEqual = protocolMethod(I_EQUIV, "equal");
export const dispatchValueHash = protocolMethod(I_HASH, "hash");

const BOOLEAN_TAG = 0x4b1d_9f73;
const BIGINT_TAG = 0x7845_9ad1;
const GLOBAL_SYMBOL_TAG = 0x9e65_8cab;
const HOST_IDENTITY_TAG = 0x2d6f_5a8d;
const NUMBER_TAG = 0x1656_67b1;
const STRING_TAG = 0x6d2b_79f5;

const FALSE_HASH = 0x193a_7c41;
const TRUE_HASH = 0x71f4_9d0b;
const NULL_HASH = 0x4210_8421;
const UNDEFINED_HASH = 0x7f4a_7c15;
const NAN_HASH = 0x58d0_2a6f;

const floatBytes = new DataView(new ArrayBuffer(8));

let protocolHashes = new WeakMap();
let hostObjectHashes = new WeakMap();
let hostSymbolHashes = new Map();
let nextHostIdentity = 1;

const metrics = {
  hashValueCalls: 0,
  protocolHashComputations: 0,
  protocolHashCacheHits: 0,
  hostIdentityAssignments: 0,
};

export function avalancheHash(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85eb_ca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2_ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function mixHash(hash, value) {
  let mixed = (hash ^ value) >>> 0;
  mixed = Math.imul(mixed, 0x5bd1_e995);
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}

export function finishHash(hash, count) {
  return avalancheHash(mixHash(hash, count >>> 0));
}

export function hashString(value, tag = STRING_TAG) {
  let hash = mixHash(tag, value.length);
  for (let index = 0; index < value.length; index += 1) {
    hash = mixHash(hash, value.charCodeAt(index));
  }
  return finishHash(hash, value.length);
}

export function hashNumber(value) {
  if (Number.isNaN(value)) {
    return NAN_HASH;
  }
  const normalized = value === 0 ? 0 : value;
  floatBytes.setFloat64(0, normalized, true);
  const low = floatBytes.getUint32(0, true);
  const high = floatBytes.getUint32(4, true);
  return finishHash(mixHash(mixHash(NUMBER_TAG, low), high), 2);
}

export function hashBigInt(value) {
  let magnitude = value < 0n ? -value : value;
  let hash = mixHash(BIGINT_TAG, value < 0n ? 1 : 0);
  let limbs = 0;
  do {
    hash = mixHash(hash, Number(magnitude & 0xffff_ffffn));
    magnitude >>= 32n;
    limbs += 1;
  } while (magnitude !== 0n);
  return finishHash(hash, limbs);
}

export function hashBoolean(value) {
  return mixHash(BOOLEAN_TAG, value ? TRUE_HASH : FALSE_HASH);
}

export function hashNull() {
  return NULL_HASH;
}

export function hashUndefined() {
  return UNDEFINED_HASH;
}

export function hashGlobalSymbol(key) {
  return hashString(key, GLOBAL_SYMBOL_TAG);
}

export function orderedCollectionHash(iterable, hashValue, tag) {
  let hash = tag >>> 0;
  let count = 0;
  for (const value of iterable) {
    hash = mixHash(hash, hashValue(value));
    count += 1;
  }
  return finishHash(hash, count);
}

function rotateLeft(value, distance) {
  const shift = distance & 31;
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function unorderedCollectionHash(iterable, hashElement, tag) {
  let sum = 0;
  let xor = 0;
  let product = 1;
  let count = 0;
  for (const element of iterable) {
    const hash = hashElement(element) >>> 0;
    sum = (sum + hash) >>> 0;
    xor = (xor ^ rotateLeft(hash, hash & 31)) >>> 0;
    product = Math.imul(product, hash | 1) >>> 0;
    count += 1;
  }
  return finishHash(
    mixHash(mixHash(mixHash(tag, sum), xor), product),
    count,
  );
}

export function cachedProtocolHash(value, compute) {
  const cached = protocolHashes.get(value);
  if (cached !== undefined) {
    metrics.protocolHashCacheHits += 1;
    return cached;
  }
  metrics.protocolHashComputations += 1;
  const hash = compute() >>> 0;
  protocolHashes.set(value, hash);
  return hash;
}

export function recordHashValueCall() {
  metrics.hashValueCalls += 1;
}

export function hostIdentityHash(value) {
  const hashes = typeof value === "symbol" ? hostSymbolHashes : hostObjectHashes;
  const cached = hashes.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const hash = finishHash(HOST_IDENTITY_TAG, nextHostIdentity);
  nextHostIdentity += 1;
  metrics.hostIdentityAssignments += 1;
  hashes.set(value, hash);
  return hash;
}

export function resetValueMetrics() {
  metrics.hashValueCalls = 0;
  metrics.protocolHashComputations = 0;
  metrics.protocolHashCacheHits = 0;
  metrics.hostIdentityAssignments = 0;
}

export function clearValueCaches() {
  protocolHashes = new WeakMap();
  hostObjectHashes = new WeakMap();
  hostSymbolHashes = new Map();
  nextHostIdentity = 1;
  resetValueMetrics();
}

export function readValueMetrics() {
  return Object.freeze({ ...metrics });
}
