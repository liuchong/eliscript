import {
  SET_STATE,
  TRANSIENT_SET_STATE,
  readTransientSetMetrics,
  resetTransientSetMetrics as resetTransientSetMetricsInternal,
} from "../core/set-internals.mjs";
import {
  inspectPersistentMap,
  inspectTransientMap,
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  sharedPersistentMapNodes,
  transientMapMetrics,
} from "./map.mjs";

function mapOf(set) {
  const state = set?.[SET_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript persistent hash set");
  }
  return state.map;
}

export function resetPersistentSetMetrics() {
  resetPersistentMapMetrics();
}

export function persistentSetMetrics() {
  return persistentMapMetrics();
}

export function resetTransientSetMetrics() {
  resetTransientSetMetricsInternal();
  resetTransientMapMetrics();
}

export function transientSetMetrics() {
  const set = readTransientSetMetrics();
  return Object.freeze({
    ...transientMapMetrics(),
    setPersistentCalls: set.persistentCalls,
    setInvalidCalls: set.invalidCalls,
  });
}

export function inspectTransientSet(set) {
  const state = set?.[TRANSIENT_SET_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript transient hash set");
  }
  return inspectTransientMap(state.map);
}

export function inspectPersistentSet(set) {
  return inspectPersistentMap(mapOf(set));
}

export function sharedPersistentSetNodes(left, right) {
  return sharedPersistentMapNodes(mapOf(left), mapOf(right));
}
