export const LIST_CONSTRUCTOR_TOKEN = Symbol("eliscript.list.constructor");
export const LIST_STATE = Symbol("eliscript.list.state");

const metrics = {
  nodeAllocations: 0,
};

export function recordListNodeAllocation() {
  metrics.nodeAllocations += 1;
}

export function resetListMetrics() {
  metrics.nodeAllocations = 0;
}

export function readListMetrics() {
  return Object.freeze({ ...metrics });
}
