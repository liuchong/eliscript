import {
  VECTOR_STATE,
  VectorNode,
  readVectorMetrics,
  resetVectorMetrics,
} from "../core/vector-internals.mjs";

function stateOf(vector) {
  const state = vector?.[VECTOR_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript persistent vector");
  }
  return state;
}

function collectNodes(node, nodes) {
  if (nodes.has(node)) {
    return;
  }
  nodes.add(node);
  for (const child of node.slots) {
    if (child instanceof VectorNode) {
      collectNodes(child, nodes);
    }
  }
}

export function resetPersistentVectorMetrics() {
  resetVectorMetrics();
}

export function persistentVectorMetrics() {
  return readVectorMetrics();
}

export function inspectPersistentVector(vector) {
  const state = stateOf(vector);
  const nodes = new Set();
  collectNodes(state.root, nodes);
  return Object.freeze({
    count: state.count,
    shift: state.shift,
    depth: state.shift / 5 + 1,
    tailLength: state.tail.length,
    nodeCount: nodes.size,
  });
}

export function sharedPersistentVectorNodes(left, right) {
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
