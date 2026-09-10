import { equalValues } from "./value.mjs";

export const SORTED_MAP_STATE = Symbol("eliscript.sorted-map.state");
export const SORTED_SET_STATE = Symbol("eliscript.sorted-set.state");

const metrics = {
  nodeAllocations: 0,
  comparisons: 0,
  rotations: 0,
};

function height(node) {
  return node === null ? 0 : node.height;
}

function size(node) {
  return node === null ? 0 : node.size;
}

export class SortedNode {
  constructor(key, value, left = null, right = null) {
    this.key = key;
    this.value = value;
    this.left = left;
    this.right = right;
    this.height = Math.max(height(left), height(right)) + 1;
    this.size = size(left) + size(right) + 1;
    metrics.nodeAllocations += 1;
    Object.freeze(this);
  }
}

function node(key, value, left, right) {
  return new SortedNode(key, value, left, right);
}

function rotateLeft(root) {
  const promoted = root.right;
  const retained = node(root.key, root.value, root.left, promoted.left);
  metrics.rotations += 1;
  return node(promoted.key, promoted.value, retained, promoted.right);
}

function rotateRight(root) {
  const promoted = root.left;
  const retained = node(root.key, root.value, promoted.right, root.right);
  metrics.rotations += 1;
  return node(promoted.key, promoted.value, promoted.left, retained);
}

function balance(root) {
  const delta = height(root.left) - height(root.right);
  if (delta > 1) {
    const left = root.left;
    const prepared = height(left.left) < height(left.right)
      ? node(root.key, root.value, rotateLeft(left), root.right)
      : root;
    return rotateRight(prepared);
  }
  if (delta < -1) {
    const right = root.right;
    const prepared = height(right.right) < height(right.left)
      ? node(root.key, root.value, root.left, rotateRight(right))
      : root;
    return rotateLeft(prepared);
  }
  return root;
}

export function compareSortedKeys(comparison, left, right) {
  metrics.comparisons += 1;
  return comparison(left, right);
}

export function sortedFind(root, key, comparison) {
  let current = root;
  while (current !== null) {
    const order = compareSortedKeys(comparison, key, current.key);
    if (order === 0) return current;
    current = order < 0 ? current.left : current.right;
  }
  return null;
}

export function sortedAssoc(root, key, value, comparison) {
  if (root === null) {
    return { root: node(key, value, null, null), added: true, changed: true };
  }
  const order = compareSortedKeys(comparison, key, root.key);
  if (order === 0) {
    if (equalValues(root.value, value)) {
      return { root, added: false, changed: false };
    }
    return {
      root: node(root.key, value, root.left, root.right),
      added: false,
      changed: true,
    };
  }
  const side = order < 0 ? "left" : "right";
  const result = sortedAssoc(root[side], key, value, comparison);
  if (!result.changed) return { root, added: result.added, changed: false };
  const updated = side === "left"
    ? node(root.key, root.value, result.root, root.right)
    : node(root.key, root.value, root.left, result.root);
  return { root: balance(updated), added: result.added, changed: true };
}

function minimum(root) {
  let current = root;
  while (current.left !== null) current = current.left;
  return current;
}

function removeMinimum(root) {
  if (root.left === null) return root.right;
  return balance(node(
    root.key,
    root.value,
    removeMinimum(root.left),
    root.right,
  ));
}

export function sortedDissoc(root, key, comparison) {
  if (root === null) return { root, removed: false };
  const order = compareSortedKeys(comparison, key, root.key);
  if (order === 0) {
    if (root.left === null) return { root: root.right, removed: true };
    if (root.right === null) return { root: root.left, removed: true };
    const successor = minimum(root.right);
    return {
      root: balance(node(
        successor.key,
        successor.value,
        root.left,
        removeMinimum(root.right),
      )),
      removed: true,
    };
  }
  const side = order < 0 ? "left" : "right";
  const result = sortedDissoc(root[side], key, comparison);
  if (!result.removed) return { root, removed: false };
  const updated = side === "left"
    ? node(root.key, root.value, result.root, root.right)
    : node(root.key, root.value, root.left, result.root);
  return { root: balance(updated), removed: true };
}

function eligibleStart(order, ascending, inclusive) {
  return ascending
    ? order > 0 || (inclusive && order === 0)
    : order < 0 || (inclusive && order === 0);
}

function pushStart(stack, root, comparison, ascending, start) {
  let current = root;
  while (current !== null) {
    if (start === null) {
      stack.push(current);
      current = ascending ? current.left : current.right;
      continue;
    }
    const order = compareSortedKeys(comparison, current.key, start.key);
    if (eligibleStart(order, ascending, start.inclusive)) {
      stack.push(current);
      current = ascending ? current.left : current.right;
    } else {
      current = ascending ? current.right : current.left;
    }
  }
}

function beyondEnd(order, ascending, inclusive) {
  return ascending
    ? order > 0 || (!inclusive && order === 0)
    : order < 0 || (!inclusive && order === 0);
}

export function* sortedEntries(
  root,
  comparison,
  ascending = true,
  start = null,
  end = null,
) {
  const stack = [];
  pushStart(stack, root, comparison, ascending, start);
  while (stack.length > 0) {
    const current = stack.pop();
    if (end !== null) {
      const order = compareSortedKeys(comparison, current.key, end.key);
      if (beyondEnd(order, ascending, end.inclusive)) return;
    }
    yield current;
    pushStart(
      stack,
      ascending ? current.right : current.left,
      comparison,
      ascending,
      null,
    );
  }
}

export function resetSortedMetrics() {
  metrics.nodeAllocations = 0;
  metrics.comparisons = 0;
  metrics.rotations = 0;
}

export function readSortedMetrics() {
  return Object.freeze({ ...metrics });
}
