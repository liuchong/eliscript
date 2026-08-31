import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [moduleDirectory, collection] = process.argv.slice(2);
const valueCount = 1_000_000;
const probeIndexes = [0, 31, 32, 1_024, 32_768, 500_000, 999_999];

if (moduleDirectory == null || collection == null) {
  throw new Error("expected MODULE_DIRECTORY and COLLECTION");
}

function moduleUrl(name) {
  return pathToFileURL(resolve(moduleDirectory, `${name}.mjs`)).href;
}

function vectorNodeCount(node, level) {
  if (node == null) return 0;
  let count = 1;
  if (level > 0) {
    for (const child of node.slots) {
      count += vectorNodeCount(child, level - 5);
    }
  }
  return count;
}

function sharedVectorNodeCount(left, right, level) {
  if (left == null || right == null) return 0;
  if (left === right) return vectorNodeCount(left, level);
  if (level === 0) return 0;
  let count = 0;
  const width = Math.max(left.slots.length, right.slots.length);
  for (let index = 0; index < width; index += 1) {
    count += sharedVectorNodeCount(
      left.slots[index],
      right.slots[index],
      level - 5,
    );
  }
  return count;
}

function hamtItemCount(item) {
  if (item == null) return 0;
  if (item.kind === "entry") return 1;
  const children = item.kind === "bitmap"
    ? item.items
    : item.kind === "array"
      ? item.children
      : item.entries;
  let count = 1;
  for (const child of children) count += hamtItemCount(child);
  return count;
}

function sharedHamtItemCount(left, right) {
  if (left == null || right == null) return 0;
  if (left === right) return hamtItemCount(left);
  if (left.kind !== right.kind || left.kind === "entry") return 0;
  const leftChildren = left.kind === "bitmap"
    ? left.items
    : left.kind === "array"
      ? left.children
      : left.entries;
  const rightChildren = right.kind === "bitmap"
    ? right.items
    : right.kind === "array"
      ? right.children
      : right.entries;
  let count = 0;
  const width = Math.max(leftChildren.length, rightChildren.length);
  for (let index = 0; index < width; index += 1) {
    count += sharedHamtItemCount(leftChildren[index], rightChildren[index]);
  }
  return count;
}

function hamtLookupPathLength(item, hash) {
  let current = item;
  let shift = 0;
  let length = 0;
  while (current != null) {
    length += 1;
    if (current.kind === "entry" || current.kind === "collision") return length;
    const index = (hash >>> shift) & 31;
    if (current.kind === "array") {
      current = current.children[index];
    } else {
      const bit = (1 << index) >>> 0;
      let packed = 0;
      for (let branch = 0; branch < index; branch += 1) {
        if ((current.bitmap & ((1 << branch) >>> 0)) !== 0) packed += 1;
      }
      current = (current.bitmap & bit) === 0 ? null : current.items[packed];
    }
    shift += 5;
  }
  return length;
}

async function auditVector() {
  const vectorModule = await import(moduleUrl("persistent-vector"));
  const {
    empty_persistent_vector: emptyPersistentVector,
    persistent_vector_count: persistentVectorCount,
    persistent_vector_nth: persistentVectorNth,
    persistent_vector_conj: persistentVectorConj,
    persistent_vector_assoc: persistentVectorAssoc,
  } = vectorModule;
  let vector = emptyPersistentVector();
  for (let value = 0; value < valueCount; value += 1) {
    vector = persistentVectorConj(vector, value);
  }
  const updated = persistentVectorAssoc(vector, 500_000, -1);
  const nodeCount = vectorNodeCount(vector.root, vector.shift);
  const changedPath = 1 + vector.shift / 5;
  return {
    collection,
    count: persistentVectorCount(vector),
    shift: vector.shift,
    tailLength: vector.tail.length,
    probes: probeIndexes.map(
      (index) => persistentVectorNth(vector, index, "missing"),
    ),
    original: persistentVectorNth(vector, 500_000, "missing"),
    updated: persistentVectorNth(updated, 500_000, "missing"),
    nodeCount,
    changedPath,
    sharedNodes: sharedVectorNodeCount(vector.root, updated.root, vector.shift),
  };
}

async function auditMap() {
  const mapModule = await import(moduleUrl("persistent-map"));
  const {
    empty_persistent_map: emptyPersistentMap,
    persistent_map_count: persistentMapCount,
    persistent_map_get: persistentMapGet,
    persistent_map_assoc: persistentMapAssoc,
    persistent_map_dissoc: persistentMapDissoc,
  } = mapModule;
  const equal = (left, right) => left === right;
  let map = emptyPersistentMap((value) => value, equal, equal);
  for (let key = 0; key < valueCount; key += 1) {
    map = persistentMapAssoc(map, key, key);
  }
  const updated = persistentMapAssoc(map, 500_000, -1);
  const removed = persistentMapDissoc(updated, 750_000);
  const itemCount = hamtItemCount(map.root);
  const changedPath = hamtLookupPathLength(map.root, 500_000);
  return {
    collection,
    count: persistentMapCount(map),
    rootKind: map.root.kind,
    probes: probeIndexes.map(
      (key) => persistentMapGet(map, key, "missing"),
    ),
    original: persistentMapGet(map, 500_000, "missing"),
    updated: persistentMapGet(updated, 500_000, "missing"),
    removedCount: persistentMapCount(removed),
    removed: persistentMapGet(removed, 750_000, "missing"),
    originalRetained: persistentMapGet(map, 750_000, "missing"),
    itemCount,
    changedPath,
    sharedItems: sharedHamtItemCount(map.root, updated.root),
  };
}

async function auditSet() {
  const setModule = await import(moduleUrl("persistent-set"));
  const {
    empty_persistent_set: emptyPersistentSet,
    persistent_set_count: persistentSetCount,
    persistent_set_has_QMARK_: persistentSetHas,
    persistent_set_conj: persistentSetConj,
    persistent_set_disj: persistentSetDisj,
  } = setModule;
  const hash = (value) => typeof value === "number" ? value : value.id;
  const equal = (left, right) => left === right;
  let set = emptyPersistentSet(hash, equal);
  for (let value = 0; value < valueCount; value += 1) {
    set = persistentSetConj(set, value);
  }
  const colliding = { id: 500_000 };
  const added = persistentSetConj(set, colliding);
  const removed = persistentSetDisj(added, colliding);
  const itemCount = hamtItemCount(set.map.root);
  const changedPath = hamtLookupPathLength(set.map.root, 500_000);
  return {
    collection,
    count: persistentSetCount(set),
    rootKind: set.map.root.kind,
    probes: probeIndexes.map((value) => persistentSetHas(set, value)),
    noopConj: persistentSetConj(set, 500_000) === set,
    addedCount: persistentSetCount(added),
    originalCollisionAbsent: !persistentSetHas(set, colliding),
    collisionPresent: persistentSetHas(added, colliding),
    removedCount: persistentSetCount(removed),
    collisionRemoved: !persistentSetHas(removed, colliding),
    originalRetained: persistentSetHas(set, 500_000),
    itemCount,
    changedPath,
    sharedItems: sharedHamtItemCount(set.map.root, added.map.root),
  };
}

const audits = {
  vector: auditVector,
  map: auditMap,
  set: auditSet,
};
const audit = audits[collection];
if (audit == null) throw new Error(`unknown collection: ${collection}`);
process.stdout.write(`${JSON.stringify(await audit())}\n`);
