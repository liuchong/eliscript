export const BRANCH_BITS = 5;
export const BRANCH_WIDTH = 1 << BRANCH_BITS;
export const BRANCH_MASK = BRANCH_WIDTH - 1;

export const VECTOR_STATE = Symbol("eliscript.vector.state");
export const VECTOR_CONSTRUCTOR_TOKEN = Symbol("eliscript.vector.constructor");
export const TRANSIENT_VECTOR_STATE = Symbol("eliscript.vector.transient-state");
export const TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN = Symbol(
  "eliscript.vector.transient-constructor",
);

const metrics = {
  nodeAllocations: 0,
  nodeVisits: 0,
  tailAllocations: 0,
  rootGrowths: 0,
};

const transientMetrics = {
  nodeClones: 0,
  nodeMutations: 0,
  tailCopies: 0,
  tailMutations: 0,
  persistentCalls: 0,
  invalidCalls: 0,
};

export class VectorNode {
  constructor(slots = [], owner = null) {
    metrics.nodeAllocations += 1;
    this.owner = owner;
    this.slots = owner === null ? Object.freeze(slots) : slots;
    if (owner === null) {
      Object.freeze(this);
    }
  }
}

export function editableVectorNode(node, owner) {
  if (node.owner === owner) {
    return node;
  }
  transientMetrics.nodeClones += 1;
  return new VectorNode(node.slots.slice(), owner);
}

export function recordTransientVectorNodeMutation() {
  transientMetrics.nodeMutations += 1;
}

export function recordTransientVectorTailCopy() {
  transientMetrics.tailCopies += 1;
}

export function recordTransientVectorTailMutation() {
  transientMetrics.tailMutations += 1;
}

export function recordTransientVectorPersistent() {
  transientMetrics.persistentCalls += 1;
}

export function recordInvalidTransientVectorCall() {
  transientMetrics.invalidCalls += 1;
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

export function resetTransientVectorMetrics() {
  for (const key of Object.keys(transientMetrics)) {
    transientMetrics[key] = 0;
  }
}

export function readTransientVectorMetrics() {
  return Object.freeze({ ...transientMetrics });
}

export const EMPTY_ROOT = new VectorNode();
export const EMPTY_TAIL = allocateTail([]);
