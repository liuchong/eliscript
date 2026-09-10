export const QUEUE_CONSTRUCTOR_TOKEN = Symbol("eliscript.queue.constructor");
export const QUEUE_STATE = Symbol("eliscript.queue.state");

const metrics = {
  queueAllocations: 0,
  frontPromotions: 0,
  promotedValues: 0,
};

export function recordQueueAllocation() {
  metrics.queueAllocations += 1;
}

export function recordQueueFrontPromotion(count) {
  metrics.frontPromotions += 1;
  metrics.promotedValues += count;
}

export function resetQueueMetrics() {
  metrics.queueAllocations = 0;
  metrics.frontPromotions = 0;
  metrics.promotedValues = 0;
}

export function readQueueMetrics() {
  return Object.freeze({ ...metrics });
}
