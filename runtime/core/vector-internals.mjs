export const BRANCH_BITS = 5;
export const BRANCH_WIDTH = 1 << BRANCH_BITS;
export const BRANCH_MASK = BRANCH_WIDTH - 1;

export const VECTOR_STATE = Symbol("eliscript.vector.state");
export const VECTOR_CONSTRUCTOR_TOKEN = Symbol("eliscript.vector.constructor");

const metrics = {
  nodeAllocations: 0,
  nodeVisits: 0,
  tailAllocations: 0,
  rootGrowths: 0,
};

export class VectorNode {
  constructor(slots = []) {
    metrics.nodeAllocations += 1;
    this.slots = Object.freeze(slots);
    Object.freeze(this);
  }
}

export function allocateTail(values) {
  metrics.tailAllocations += 1;
  return Object.freeze(values);
}

export function visitNode(node) {
  metrics.nodeVisits += 1;
  return node;
}

export function recordRootGrowth() {
  metrics.rootGrowths += 1;
}

export function resetVectorMetrics() {
  for (const key of Object.keys(metrics)) {
    metrics[key] = 0;
  }
}

export function readVectorMetrics() {
  return Object.freeze({ ...metrics });
}

export const EMPTY_ROOT = new VectorNode();
export const EMPTY_TAIL = allocateTail([]);
