import {
  LIST_STATE,
  readListMetrics,
  resetListMetrics,
} from "../core/list-internals.mjs";

function stateOf(list) {
  const state = list?.[LIST_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript persistent list");
  }
  return state;
}

function collectNodes(list) {
  const nodes = new Set();
  let node = list;
  while (!stateOf(node).empty) {
    nodes.add(node);
    node = stateOf(node).rest;
  }
  return nodes;
}

export function resetPersistentListMetrics() {
  resetListMetrics();
}

export function persistentListMetrics() {
  return readListMetrics();
}

export function inspectPersistentList(list) {
  const state = stateOf(list);
  return Object.freeze({
    count: state.count,
    empty: state.empty,
    nodeCount: collectNodes(list).size,
  });
}

export function sharedPersistentListNodes(left, right) {
  const leftNodes = collectNodes(left);
  const rightNodes = collectNodes(right);
  let shared = 0;
  for (const node of leftNodes) {
    if (rightNodes.has(node)) {
      shared += 1;
    }
  }
  return shared;
}
