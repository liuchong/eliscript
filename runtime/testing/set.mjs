import { SET_STATE } from "../core/set-internals.mjs";
import {
  inspectPersistentMap,
  persistentMapMetrics,
  resetPersistentMapMetrics,
  sharedPersistentMapNodes,
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

export function inspectPersistentSet(set) {
  return inspectPersistentMap(mapOf(set));
}

export function sharedPersistentSetNodes(left, right) {
  return sharedPersistentMapNodes(mapOf(left), mapOf(right));
}
