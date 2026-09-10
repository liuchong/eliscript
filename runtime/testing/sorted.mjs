import {
  SORTED_MAP_STATE,
  SORTED_SET_STATE,
  SortedNode,
  readSortedMetrics,
  resetSortedMetrics as resetMetrics,
} from "../core/sorted-internals.mjs";

function mapState(value) {
  if (value?.[SORTED_MAP_STATE] !== undefined) {
    return value[SORTED_MAP_STATE];
  }
  if (value?.[SORTED_SET_STATE] !== undefined) {
    return value[SORTED_SET_STATE].map[SORTED_MAP_STATE];
  }
  throw new TypeError("expected an Eliscript persistent sorted collection");
}

function inspectNode(node, comparison, minimum, maximum, nodes, result) {
  if (node === null) return { height: 0, size: 0 };
  if (!(node instanceof SortedNode) || nodes.has(node)) {
    throw new TypeError("persistent sorted collection contains an invalid tree");
  }
  nodes.add(node);
  if (minimum !== null && comparison(node.key, minimum) <= 0) {
    throw new TypeError("persistent sorted collection violates lower ordering");
  }
  if (maximum !== null && comparison(node.key, maximum) >= 0) {
    throw new TypeError("persistent sorted collection violates upper ordering");
  }
  const left = inspectNode(
    node.left,
    comparison,
    minimum,
    node.key,
    nodes,
    result,
  );
  const right = inspectNode(
    node.right,
    comparison,
    node.key,
    maximum,
    nodes,
    result,
  );
  const height = Math.max(left.height, right.height) + 1;
  const size = left.size + right.size + 1;
  if (node.height !== height || node.size !== size ||
      Math.abs(left.height - right.height) > 1) {
    throw new TypeError("persistent sorted collection violates AVL balance");
  }
  result.maxBalance = Math.max(
    result.maxBalance,
    Math.abs(left.height - right.height),
  );
  return { height, size };
}

function collectNodes(node, result) {
  if (node === null || result.has(node)) return;
  result.add(node);
  collectNodes(node.left, result);
  collectNodes(node.right, result);
}

export function inspectPersistentSortedCollection(value) {
  const state = mapState(value);
  const nodes = new Set();
  const result = { maxBalance: 0 };
  const tree = inspectNode(
    state.root,
    state.comparison,
    null,
    null,
    nodes,
    result,
  );
  return Object.freeze({
    count: tree.size,
    height: tree.height,
    nodes: nodes.size,
    maxBalance: result.maxBalance,
  });
}

export function sharedPersistentSortedNodes(left, right) {
  const leftNodes = new Set();
  const rightNodes = new Set();
  collectNodes(mapState(left).root, leftNodes);
  collectNodes(mapState(right).root, rightNodes);
  let shared = 0;
  for (const node of leftNodes) {
    if (rightNodes.has(node)) shared += 1;
  }
  return shared;
}

export function resetSortedMetrics() {
  resetMetrics();
}

export function sortedMetrics() {
  return readSortedMetrics();
}
