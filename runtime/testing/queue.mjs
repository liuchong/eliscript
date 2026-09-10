import {
  QUEUE_STATE,
  readQueueMetrics,
  resetQueueMetrics,
} from "../core/queue-internals.mjs";
import { sharedPersistentVectorNodes } from "./vector.mjs";

function stateOf(queue) {
  const state = queue?.[QUEUE_STATE];
  if (state === undefined) {
    throw new TypeError("expected an Eliscript persistent queue");
  }
  return state;
}

export function resetPersistentQueueMetrics() {
  resetQueueMetrics();
}

export function persistentQueueMetrics() {
  return readQueueMetrics();
}

export function inspectPersistentQueue(queue) {
  const state = stateOf(queue);
  return Object.freeze({
    count: state.count,
    frontCount: state.front.count,
    rearCount: state.rear.count,
  });
}

export function sharedPersistentQueueParts(left, right) {
  const leftState = stateOf(left);
  const rightState = stateOf(right);
  return Object.freeze({
    frontIdentity: leftState.front === rightState.front,
    rearIdentity: leftState.rear === rightState.rear,
    rearPromotedToFront: leftState.rear === rightState.front,
    sharedFrontNodes: sharedPersistentVectorNodes(
      leftState.front,
      rightState.front,
    ),
    sharedRearNodes: sharedPersistentVectorNodes(
      leftState.rear,
      rightState.rear,
    ),
  });
}
