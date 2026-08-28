import {
  MAP_STATE,
  TRANSIENT_MAP_STATE,
  ArrayNode,
  BitmapIndexedNode,
  HashCollisionNode,
  MapEntry,
  readMapMetrics,
  readTransientMapMetrics,
  resetMapMetrics,
  resetTransientMapMetrics as resetTransientMapMetricsInternal,
} from "../core/map-internals.mjs";

function stateOf(map) {
  const state = map?.[MAP_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript persistent hash map");
  }
  return state;
}

function transientStateOf(map) {
  const state = map?.[TRANSIENT_MAP_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript transient hash map");
  }
  return state;
}

function inspectItem(item, depth, result, nodes) {
  if (item instanceof MapEntry) {
    result.entries += 1;
    result.maxDepth = Math.max(result.maxDepth, depth);
    return;
  }
  if (nodes.has(item)) {
    return;
  }
  nodes.add(item);
  result.maxDepth = Math.max(result.maxDepth, depth);
  if (item instanceof BitmapIndexedNode) {
    result.bitmapNodes += 1;
    for (const child of item.items) {
      inspectItem(child, depth + 1, result, nodes);
    }
    return;
  }
  if (item instanceof ArrayNode) {
    result.arrayNodes += 1;
    for (const child of item.children) {
      if (child !== undefined) {
        inspectItem(child, depth + 1, result, nodes);
      }
    }
    return;
  }
  if (item instanceof HashCollisionNode) {
    result.collisionNodes += 1;
    for (const entry of item.entries) {
      inspectItem(entry, depth + 1, result, nodes);
    }
  }
}

function collectNodes(item, nodes) {
  if (item instanceof MapEntry || nodes.has(item)) {
    return;
  }
  nodes.add(item);
  const children = item instanceof BitmapIndexedNode
    ? item.items
    : item instanceof ArrayNode
      ? item.children
      : item.entries;
  for (const child of children) {
    if (child !== undefined) {
      collectNodes(child, nodes);
    }
  }
}

export function resetPersistentMapMetrics() {
  resetMapMetrics();
}

export function persistentMapMetrics() {
  return readMapMetrics();
}

export function resetTransientMapMetrics() {
  resetTransientMapMetricsInternal();
}

export function transientMapMetrics() {
  return readTransientMapMetrics();
}

export function inspectTransientMap(map) {
  const state = transientStateOf(map);
  const nodes = new Set();
  collectNodes(state.root, nodes);
  let ownedNodeCount = 0;
  for (const node of nodes) {
    if (node.owner === state.owner) {
      ownedNodeCount += 1;
    }
  }
  return Object.freeze({
    active: state.active,
    count: state.count,
    nodeCount: nodes.size,
    ownedNodeCount,
    sharesSourceRoot: state.root === state.source?.[MAP_STATE].root,
  });
}

export function inspectPersistentMap(map) {
  const result = {
    count: stateOf(map).count,
    bitmapNodes: 0,
    arrayNodes: 0,
    collisionNodes: 0,
    entries: 0,
    nodeCount: 0,
    maxDepth: 0,
  };
  const nodes = new Set();
  inspectItem(stateOf(map).root, 1, result, nodes);
  result.nodeCount = nodes.size;
  return Object.freeze(result);
}

export function sharedPersistentMapNodes(left, right) {
  const leftNodes = new Set();
  const rightNodes = new Set();
  collectNodes(stateOf(left).root, leftNodes);
  collectNodes(stateOf(right).root, rightNodes);
  let shared = 0;
  for (const node of leftNodes) {
    if (rightNodes.has(node)) {
      shared += 1;
    }
  }
  return shared;
}
