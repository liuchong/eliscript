import {
  EMPTY_VECTOR,
  isPersistentVector,
  subvec,
} from "../../runtime/core/vector.mjs";
import {
  inspectPersistentVector,
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
  sharedPersistentVectorNodes,
} from "../../runtime/testing/vector.mjs";

let values = EMPTY_VECTOR;
for (let value = 0; value < 100_000; value += 1) {
  values = values.conj(value);
}

const shape = inspectPersistentVector(values);
resetPersistentVectorMetrics();
const updated = values.assoc(54_321, "updated");
const metrics = persistentVectorMetrics();
const slice = subvec(values, 32_767, 32_770);
const nestedSlice = subvec(slice, 1);

console.log(JSON.stringify({
  persistent: isPersistentVector(values),
  shape,
  probes: [0, 31, 32, 1024, 32768, 99999].map((index) => values.nth(index)),
  original: values.nth(54_321),
  updated: updated.nth(54_321),
  sharedNodes: sharedPersistentVectorNodes(values, updated),
  metrics,
  slice: slice.toArray(),
  nestedSlice: nestedSlice.toArray(),
  slicePersistent: isPersistentVector(slice),
  sliceSharedNodes: sharedPersistentVectorNodes(values, slice),
  sum: values.reduce((total, value) => total + value, 0),
}));
