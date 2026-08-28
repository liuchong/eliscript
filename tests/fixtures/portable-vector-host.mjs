import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const modulePath = resolve(process.argv[2]);
const vectorModule = await import(pathToFileURL(modulePath).href);

const {
  empty_persistent_vector: emptyPersistentVector,
  persistent_vector_QMARK_: isPersistentVector,
  persistent_vector_count: persistentVectorCount,
  persistent_vector_nth: persistentVectorNth,
  persistent_vector_conj: persistentVectorConj,
  persistent_vector_assoc: persistentVectorAssoc,
  persistent_vector_pop: persistentVectorPop,
  persistent_vector_peek: persistentVectorPeek,
  persistent_vector_reduce: persistentVectorReduce,
} = vectorModule;

function nodeCount(node, level) {
  if (node == null) return 0;
  let count = 1;
  if (level > 0) {
    for (const child of node.slots) {
      count += nodeCount(child, level - 5);
    }
  }
  return count;
}

function sharedNodeCount(left, right, level) {
  if (left == null || right == null) return 0;
  if (left === right) return nodeCount(left, level);
  if (level === 0) return 0;
  let count = 0;
  const width = Math.max(left.slots.length, right.slots.length);
  for (let index = 0; index < width; index += 1) {
    count += sharedNodeCount(
      left.slots[index],
      right.slots[index],
      level - 5,
    );
  }
  return count;
}

let vector = emptyPersistentVector();
for (let value = 0; value < 100_000; value += 1) {
  vector = persistentVectorConj(vector, value);
}

const updated = persistentVectorAssoc(vector, 54_321, "updated");
const appended = persistentVectorAssoc(updated, persistentVectorCount(updated), 100_000);
const popped = persistentVectorPop(appended);
const depth = 1 + vector.shift / 5;
const nodes = nodeCount(vector.root, vector.shift);

process.stdout.write(`${JSON.stringify({
  persistent: isPersistentVector(vector),
  count: persistentVectorCount(vector),
  probes: [0, 31, 32, 1024, 32768, 99999].map(
    (index) => persistentVectorNth(vector, index, "missing"),
  ),
  original: persistentVectorNth(vector, 54_321, "missing"),
  updated: persistentVectorNth(updated, 54_321, "missing"),
  popped: persistentVectorPeek(popped, "empty"),
  sum: persistentVectorReduce((sum, value) => sum + value, 0, vector),
  shape: {
    shift: vector.shift,
    depth,
    tailLength: vector.tail.length,
    nodeCount: nodes,
  },
  sharedNodes: sharedNodeCount(vector.root, updated.root, vector.shift),
  expectedSharedNodes: nodes - depth,
})}\n`);
