import { equalValues, hashValue } from "./value.mjs";

export const MAP_STATE = Symbol("eliscript.map.state");
export const MAP_CONSTRUCTOR_TOKEN = Symbol("eliscript.map.constructor");
export const MAP_NOT_FOUND = Symbol("eliscript.map.not-found");

export const ARRAY_NODE_THRESHOLD = 16;
export const BITMAP_NODE_THRESHOLD = 8;

const BRANCH_MASK = 31;

const metrics = {
  nodeAllocations: 0,
  nodeVisits: 0,
  entryAllocations: 0,
  keyEqualityChecks: 0,
  promotions: 0,
  demotions: 0,
};

export class MapEntry {
  constructor(key, value, hash) {
    metrics.entryAllocations += 1;
    this.key = key;
    this.value = value;
    this.hash = hash >>> 0;
    Object.freeze(this);
  }
}

export class BitmapIndexedNode {
  constructor(bitmap = 0, items = []) {
    metrics.nodeAllocations += 1;
    this.bitmap = bitmap >>> 0;
    this.items = Object.freeze(items);
    Object.freeze(this);
  }
}

export class ArrayNode {
  constructor(count, children) {
    metrics.nodeAllocations += 1;
    this.count = count;
    this.children = Object.freeze(children);
    Object.freeze(this);
  }
}

export class HashCollisionNode {
  constructor(hash, entries) {
    metrics.nodeAllocations += 1;
    this.hash = hash >>> 0;
    this.entries = Object.freeze(entries);
    Object.freeze(this);
  }
}

function visitNode(node) {
  metrics.nodeVisits += 1;
  return node;
}

function keysEqual(left, right) {
  metrics.keyEqualityChecks += 1;
  return equalValues(left, right);
}

function branchIndex(hash, shift) {
  return (hash >>> shift) & BRANCH_MASK;
}

function bitPosition(hash, shift) {
  return (1 << branchIndex(hash, shift)) >>> 0;
}

function popcount(value) {
  let bits = value >>> 0;
  bits -= (bits >>> 1) & 0x5555_5555;
  bits = (bits & 0x3333_3333) + ((bits >>> 2) & 0x3333_3333);
  return Math.imul((bits + (bits >>> 4)) & 0x0f0f_0f0f, 0x0101_0101) >>> 24;
}

function packedIndex(bitmap, bit) {
  return popcount((bitmap & ((bit - 1) >>> 0)) >>> 0);
}

function sameEntry(entry, hash, key) {
  return entry.hash === hash && keysEqual(entry.key, key);
}

function mergeEntries(shift, left, right) {
  if (left.hash === right.hash) {
    return new HashCollisionNode(left.hash, [left, right]);
  }
  const leftIndex = branchIndex(left.hash, shift);
  const rightIndex = branchIndex(right.hash, shift);
  if (leftIndex === rightIndex) {
    return new BitmapIndexedNode(
      (1 << leftIndex) >>> 0,
      [mergeEntries(shift + 5, left, right)],
    );
  }
  const bitmap = ((1 << leftIndex) | (1 << rightIndex)) >>> 0;
  return new BitmapIndexedNode(
    bitmap,
    leftIndex < rightIndex ? [left, right] : [right, left],
  );
}

function mergeCollisionAndEntry(shift, node, entry) {
  const nodeIndex = branchIndex(node.hash, shift);
  const entryIndex = branchIndex(entry.hash, shift);
  if (nodeIndex === entryIndex) {
    return new BitmapIndexedNode(
      (1 << nodeIndex) >>> 0,
      [mergeCollisionAndEntry(shift + 5, node, entry)],
    );
  }
  const bitmap = ((1 << nodeIndex) | (1 << entryIndex)) >>> 0;
  return new BitmapIndexedNode(
    bitmap,
    nodeIndex < entryIndex ? [node, entry] : [entry, node],
  );
}

function assocEntry(entry, shift, hash, key, value) {
  if (sameEntry(entry, hash, key)) {
    if (equalValues(entry.value, value)) {
      return { item: entry, added: false, changed: false };
    }
    return {
      item: new MapEntry(entry.key, value, entry.hash),
      added: false,
      changed: true,
    };
  }
  return {
    item: mergeEntries(shift, entry, new MapEntry(key, value, hash)),
    added: true,
    changed: true,
  };
}

function findEntry(entry, hash, key, notFound) {
  return sameEntry(entry, hash, key) ? entry.value : notFound;
}

function promoteBitmapNode(node, shift, hash, key, value) {
  const children = Array(32).fill(undefined);
  let packed = 0;
  for (let index = 0; index < 32; index += 1) {
    const bit = (1 << index) >>> 0;
    if ((node.bitmap & bit) !== 0) {
      children[index] = node.items[packed];
      packed += 1;
    }
  }
  children[branchIndex(hash, shift)] = new MapEntry(key, value, hash);
  metrics.promotions += 1;
  return new ArrayNode(node.items.length + 1, children);
}

function packArrayNode(node) {
  let bitmap = 0;
  const items = [];
  for (let index = 0; index < 32; index += 1) {
    const child = node.children[index];
    if (child !== undefined) {
      bitmap = (bitmap | (1 << index)) >>> 0;
      items.push(child);
    }
  }
  metrics.demotions += 1;
  return new BitmapIndexedNode(bitmap, items);
}

function findInNode(node, shift, hash, key, notFound) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    if ((node.bitmap & bit) === 0) {
      return notFound;
    }
    const item = node.items[packedIndex(node.bitmap, bit)];
    return item instanceof MapEntry
      ? findEntry(item, hash, key, notFound)
      : findInNode(item, shift + 5, hash, key, notFound);
  }
  if (node instanceof ArrayNode) {
    const item = node.children[branchIndex(hash, shift)];
    if (item === undefined) {
      return notFound;
    }
    return item instanceof MapEntry
      ? findEntry(item, hash, key, notFound)
      : findInNode(item, shift + 5, hash, key, notFound);
  }
  if (node.hash !== hash) {
    return notFound;
  }
  for (const entry of node.entries) {
    if (keysEqual(entry.key, key)) {
      return entry.value;
    }
  }
  return notFound;
}

function assocNode(node, shift, hash, key, value) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    const index = packedIndex(node.bitmap, bit);
    if ((node.bitmap & bit) === 0) {
      if (node.items.length + 1 >= ARRAY_NODE_THRESHOLD) {
        return {
          item: promoteBitmapNode(node, shift, hash, key, value),
          added: true,
          changed: true,
        };
      }
      const items = node.items.slice();
      items.splice(index, 0, new MapEntry(key, value, hash));
      return {
        item: new BitmapIndexedNode((node.bitmap | bit) >>> 0, items),
        added: true,
        changed: true,
      };
    }

    const existing = node.items[index];
    const result = existing instanceof MapEntry
      ? assocEntry(existing, shift + 5, hash, key, value)
      : assocNode(existing, shift + 5, hash, key, value);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const items = node.items.slice();
    items[index] = result.item;
    return {
      item: new BitmapIndexedNode(node.bitmap, items),
      added: result.added,
      changed: true,
    };
  }

  if (node instanceof ArrayNode) {
    const index = branchIndex(hash, shift);
    const existing = node.children[index];
    if (existing === undefined) {
      const children = node.children.slice();
      children[index] = new MapEntry(key, value, hash);
      return {
        item: new ArrayNode(node.count + 1, children),
        added: true,
        changed: true,
      };
    }
    const result = existing instanceof MapEntry
      ? assocEntry(existing, shift + 5, hash, key, value)
      : assocNode(existing, shift + 5, hash, key, value);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const children = node.children.slice();
    children[index] = result.item;
    return {
      item: new ArrayNode(node.count, children),
      added: result.added,
      changed: true,
    };
  }

  if (node.hash !== hash) {
    return {
      item: mergeCollisionAndEntry(
        shift,
        node,
        new MapEntry(key, value, hash),
      ),
      added: true,
      changed: true,
    };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index >= 0) {
    const existing = node.entries[index];
    if (equalValues(existing.value, value)) {
      return { item: node, added: false, changed: false };
    }
    const entries = node.entries.slice();
    entries[index] = new MapEntry(existing.key, value, hash);
    return {
      item: new HashCollisionNode(hash, entries),
      added: false,
      changed: true,
    };
  }
  return {
    item: new HashCollisionNode(
      hash,
      [...node.entries, new MapEntry(key, value, hash)],
    ),
    added: true,
    changed: true,
  };
}

function removePackedItem(node, bit, index) {
  if (node.items.length === 1) {
    return undefined;
  }
  const items = node.items.slice();
  items.splice(index, 1);
  return new BitmapIndexedNode((node.bitmap ^ bit) >>> 0, items);
}

function dissocNode(node, shift, hash, key) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    if ((node.bitmap & bit) === 0) {
      return { item: node, removed: false };
    }
    const index = packedIndex(node.bitmap, bit);
    const existing = node.items[index];
    if (existing instanceof MapEntry) {
      if (!sameEntry(existing, hash, key)) {
        return { item: node, removed: false };
      }
      return {
        item: removePackedItem(node, bit, index),
        removed: true,
      };
    }
    const result = dissocNode(existing, shift + 5, hash, key);
    if (!result.removed) {
      return { item: node, removed: false };
    }
    if (result.item === undefined) {
      return {
        item: removePackedItem(node, bit, index),
        removed: true,
      };
    }
    const items = node.items.slice();
    items[index] = result.item;
    return {
      item: new BitmapIndexedNode(node.bitmap, items),
      removed: true,
    };
  }

  if (node instanceof ArrayNode) {
    const index = branchIndex(hash, shift);
    const existing = node.children[index];
    if (existing === undefined) {
      return { item: node, removed: false };
    }
    let result;
    if (existing instanceof MapEntry) {
      result = sameEntry(existing, hash, key)
        ? { item: undefined, removed: true }
        : { item: existing, removed: false };
    } else {
      result = dissocNode(existing, shift + 5, hash, key);
    }
    if (!result.removed) {
      return { item: node, removed: false };
    }
    const children = node.children.slice();
    children[index] = result.item;
    const count = result.item === undefined ? node.count - 1 : node.count;
    const updated = new ArrayNode(count, children);
    return {
      item: count <= BITMAP_NODE_THRESHOLD ? packArrayNode(updated) : updated,
      removed: true,
    };
  }

  if (node.hash !== hash) {
    return { item: node, removed: false };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index < 0) {
    return { item: node, removed: false };
  }
  if (node.entries.length === 2) {
    return { item: node.entries[index === 0 ? 1 : 0], removed: true };
  }
  const entries = node.entries.slice();
  entries.splice(index, 1);
  return {
    item: new HashCollisionNode(hash, entries),
    removed: true,
  };
}

export function mapFind(root, hash, key, notFound) {
  return findInNode(root, 0, hash >>> 0, key, notFound);
}

export function mapAssoc(root, hash, key, value) {
  return assocNode(root, 0, hash >>> 0, key, value);
}

export function mapDissoc(root, hash, key) {
  return dissocNode(root, 0, hash >>> 0, key);
}

export function* mapEntries(item) {
  if (item instanceof MapEntry) {
    yield item;
    return;
  }
  if (item instanceof BitmapIndexedNode) {
    for (const child of item.items) {
      yield* mapEntries(child);
    }
    return;
  }
  if (item instanceof ArrayNode) {
    for (const child of item.children) {
      if (child !== undefined) {
        yield* mapEntries(child);
      }
    }
    return;
  }
  for (const entry of item.entries) {
    yield entry;
  }
}

export function mapHash(key) {
  return hashValue(key);
}

export function resetMapMetrics() {
  for (const key of Object.keys(metrics)) {
    metrics[key] = 0;
  }
}

export function readMapMetrics() {
  return Object.freeze({ ...metrics });
}

export const EMPTY_BITMAP_NODE = new BitmapIndexedNode();
