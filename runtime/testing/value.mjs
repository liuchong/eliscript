import {
  clearValueCaches,
  readValueMetrics,
  resetValueMetrics,
} from "../core/value-internals.mjs";

export function resetValueHashMetrics() {
  resetValueMetrics();
}

export function clearValueHashCaches() {
  clearValueCaches();
}

export function valueHashMetrics() {
  return readValueMetrics();
}
