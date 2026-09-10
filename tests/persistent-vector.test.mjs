import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  EMPTY_VECTOR,
  PersistentVector,
  isPersistentVector,
  persistentVector,
  subvec,
} from "../runtime/core/vector.mjs";
import {
  assoc,
  conj,
  count,
  empty,
  isCollection,
  isSequential,
  isVector,
  nth,
  peek,
  pop,
  reduceKV,
  rseq,
  seq,
} from "../runtime/core/collection.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { hashValue, equalValues } from "../runtime/core/value.mjs";
import {
  conjBang,
  persistentBang,
  transient,
} from "../runtime/core/transient.mjs";
import {
  inspectPersistentVector,
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
  sharedPersistentVectorNodes,
} from "../runtime/testing/vector.mjs";

function vectorRange(count) {
  let result = EMPTY_VECTOR;
  for (let value = 0; value < count; value += 1) {
    result = result.conj(value);
  }
  return result;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

async function runHost(command, source) {
  const child = Bun.spawn([command, source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("persistent vector construction and indexed operations preserve old values", () => {
  const empty = PersistentVector.empty();
  expect(empty).toBe(EMPTY_VECTOR);
  expect(empty.count).toBe(0);
  expect(empty.size).toBe(0);
  expect(empty.peek()).toBeNull();
  expect(empty.peek("empty")).toBe("empty");
  expect(empty.nth(0, "missing")).toBe("missing");
  expect(() => empty.nth(0)).toThrow(RangeError);
  expect(() => empty.pop()).toThrow(RangeError);
  expect(() => new PersistentVector()).toThrow(TypeError);

  const original = persistentVector("a", "b", "c");
  const updated = original.assoc(1, "changed");
  const appended = updated.assoc(updated.count, "d");

  expect(isPersistentVector(original)).toBe(true);
  expect(Array.isArray(original)).toBe(false);
  expect(Object.isFrozen(original)).toBe(true);
  expect(original.toArray()).toEqual(["a", "b", "c"]);
  expect(updated.toArray()).toEqual(["a", "changed", "c"]);
  expect(appended.toArray()).toEqual(["a", "changed", "c", "d"]);
  expect(appended.peek()).toBe("d");
  expect(appended.pop().toArray()).toEqual(updated.toArray());
  expect(() => original.assoc(-1, "x")).toThrow(RangeError);
  expect(() => original.assoc(4, "x")).toThrow(RangeError);
  expect(() => original.nth(1.5)).toThrow(RangeError);
  expect(EMPTY_VECTOR.reduce((value) => value, "initial")).toBe("initial");

  const hostValue = { slots: ["ordinary", "host", "data"] };
  const withHostValue = vectorRange(33).assoc(0, hostValue);
  expect(withHostValue.nth(0)).toBe(hostValue);
  expect(inspectPersistentVector(withHostValue).nodeCount).toBe(2);
});

test("persistent vector crosses tail and trie depth boundaries", () => {
  const values = vectorRange(1057);
  const shape = inspectPersistentVector(values);

  expect(shape).toEqual({
    count: 1057,
    shift: 10,
    depth: 3,
    tailLength: 1,
    nodeCount: 36,
  });
  for (const index of [0, 31, 32, 63, 64, 1023, 1024, 1055, 1056]) {
    expect(values.nth(index)).toBe(index);
  }

  const collapsed = values.pop();
  expect(collapsed.count).toBe(1056);
  expect(collapsed.peek()).toBe(1055);
  expect(inspectPersistentVector(collapsed).shift).toBe(5);
  expect(values.count).toBe(1057);
  expect(values.peek()).toBe(1056);
});

test("persistent subvector is an O(1) structurally shared vector view", () => {
  const source = vectorRange(4096);
  const shape = inspectPersistentVector(source);

  resetPersistentVectorMetrics();
  const slice = subvec(source, 31, 2050);
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 0,
    rootGrowths: 0,
  });
  expect(sharedPersistentVectorNodes(source, slice)).toBe(shape.nodeCount);
  expect(Object.isFrozen(slice)).toBe(true);
  expect(isPersistentVector(slice)).toBe(true);
  expect(isCollection(slice)).toBe(true);
  expect(isVector(slice)).toBe(true);
  expect(isSequential(slice)).toBe(true);
  expect(slice.count).toBe(2019);
  expect(slice.size).toBe(2019);
  expect(slice.nth(0)).toBe(31);
  expect(slice.nth(2018)).toBe(2049);
  expect(slice.peek()).toBe(2049);
  expect(subvec(slice, 1, 4).toArray()).toEqual([32, 33, 34]);
  expect(subvec(slice, 2016).toArray()).toEqual([2047, 2048, 2049]);

  expect(() => subvec([], 0)).toThrow("subvec expects a persistent vector");
  for (const range of [[-1, 2], [3, 2], [0, 4097], [1.5, 2]]) {
    expect(() => subvec(source, range[0], range[1])).toThrow(RangeError);
  }
  expect(() => slice.nth(-1)).toThrow(RangeError);
  expect(slice.nth(2019, "missing")).toBe("missing");
});

test("persistent subvector supports immutable vector operations and protocols", () => {
  const source = vectorRange(10);
  const slice = subvec(source, 2, 5);
  const updated = assoc(slice, 1, 30);
  const appended = conj(slice, 50);

  expect(slice.toArray()).toEqual([2, 3, 4]);
  expect(updated.toArray()).toEqual([2, 30, 4]);
  expect(appended.toArray()).toEqual([2, 3, 4, 50]);
  expect(source.toArray()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(count(slice)).toBe(3);
  expect(nth(slice, 1)).toBe(3);
  expect(peek(slice)).toBe(4);
  expect(pop(slice).toArray()).toEqual([2, 3]);
  expect([...seq(slice)]).toEqual([2, 3, 4]);
  expect([...rseq(slice)]).toEqual([4, 3, 2]);
  expect(reduceKV(slice, (result, index, value) =>
    result + index + value, 0)).toBe(12);
  expect(slice.reduce((result, value, index) =>
    result + index + value, 0)).toBe(12);
  expect(subvec(source, 4, 4).reduce((value) => value, 7)).toBe(7);
  expect(() => subvec(source, 4, 4).reduce((value) => value)).toThrow(
    "cannot reduce an empty persistent subvector without an initial value",
  );

  const metadata = persistentHashMap(["source", "slice"]);
  const annotated = withMeta(slice, metadata);
  expect(meta(annotated)).toBe(metadata);
  expect(meta(assoc(annotated, 0, 20))).toBe(metadata);
  expect(meta(empty(annotated))).toBe(metadata);

  expect(equalValues(slice, persistentVector(2, 3, 4))).toBe(true);
  expect(hashValue(slice)).toBe(hashValue(persistentVector(2, 3, 4)));

  const builder = transient(annotated);
  conjBang(builder, 5);
  const committed = persistentBang(builder);
  expect(committed.toArray()).toEqual([2, 3, 4, 5]);
  expect(meta(committed)).toBe(metadata);

  const emptySlice = subvec(source, 3, 3);
  expect(emptySlice.peek("missing")).toBe("missing");
  expect(() => emptySlice.pop()).toThrow(
    "cannot pop an empty persistent subvector",
  );
});

test("persistent vector updates copy only the selected trie path", () => {
  const values = vectorRange(4096);
  const before = inspectPersistentVector(values);

  resetPersistentVectorMetrics();
  const updated = values.assoc(2048, "changed");
  const metrics = persistentVectorMetrics();

  expect(metrics.nodeVisits).toBe(before.depth);
  expect(metrics.nodeAllocations).toBe(before.depth);
  expect(metrics.tailAllocations).toBe(0);
  expect(sharedPersistentVectorNodes(values, updated)).toBe(
    before.nodeCount - before.depth,
  );
  expect(values.nth(2048)).toBe(2048);
  expect(updated.nth(2048)).toBe("changed");
  expect(updated.nth(2047)).toBe(2047);
  expect(updated.nth(2049)).toBe(2049);

  resetPersistentVectorMetrics();
  const tailUpdated = values.assoc(4095, "tail");
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 1,
    rootGrowths: 0,
  });
  expect(sharedPersistentVectorNodes(values, tailUpdated)).toBe(before.nodeCount);
});

test("persistent vector records bounded root growth and collapse", () => {
  const shallow = vectorRange(1056);

  resetPersistentVectorMetrics();
  const deep = shallow.conj(1056);
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 3,
    nodeVisits: 0,
    tailAllocations: 1,
    rootGrowths: 1,
  });
  expect(inspectPersistentVector(deep).shift).toBe(10);

  resetPersistentVectorMetrics();
  const collapsed = deep.pop();
  const popMetrics = persistentVectorMetrics();
  expect(popMetrics.nodeAllocations).toBe(1);
  expect(popMetrics.nodeVisits).toBeLessThanOrEqual(5);
  expect(inspectPersistentVector(collapsed).shift).toBe(5);
  expect(collapsed.toArray()).toEqual(shallow.toArray());
});

test("persistent vector reduction and iteration traverse leaf chunks", () => {
  const values = vectorRange(1000);

  resetPersistentVectorMetrics();
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(499500);
  const reductionMetrics = persistentVectorMetrics();
  expect(reductionMetrics.nodeVisits).toBeLessThanOrEqual(96);
  expect(reductionMetrics.nodeAllocations).toBe(0);
  expect([...values]).toEqual(values.toArray());
  expect(persistentVector(2, 3, 4).reduce((left, right) => left + right)).toBe(9);
  expect(() => EMPTY_VECTOR.reduce((left, right) => left + right)).toThrow(
    TypeError,
  );
  expect(() => values.reduce(null, 0)).toThrow(TypeError);
});

test("persistent vector agrees with a mutable reference model", () => {
  const random = { value: 0x51f15e };
  let vector = EMPTY_VECTOR;
  let model = [];

  for (let step = 0; step < 20000; step += 1) {
    const previousVector = vector;
    const previousModel = model;
    const choice = nextRandom(random) % 10;

    if (choice < 5 || model.length === 0) {
      const value = nextRandom(random);
      vector = vector.conj(value);
      model = [...model, value];
    } else if (choice < 8) {
      const index = nextRandom(random) % model.length;
      const value = nextRandom(random);
      vector = vector.assoc(index, value);
      model = model.slice();
      model[index] = value;
    } else if (choice === 8) {
      const value = nextRandom(random);
      vector = vector.assoc(vector.count, value);
      model = [...model, value];
    } else {
      vector = vector.pop();
      model = model.slice(0, -1);
    }

    expect(vector.count).toBe(model.length);
    expect(previousVector.count).toBe(previousModel.length);
    if (model.length > 0) {
      const probe = nextRandom(random) % model.length;
      expect(vector.nth(probe)).toBe(model[probe]);
    }
    if (previousModel.length > 0) {
      const probe = nextRandom(random) % previousModel.length;
      expect(previousVector.nth(probe)).toBe(previousModel[probe]);
    }
    if (step % 250 === 0) {
      expect(vector.toArray()).toEqual(model);
    }
  }
  expect(vector.toArray()).toEqual(model);
});

test("persistent vector keeps trie work bounded at one million values", () => {
  const values = vectorRange(1_000_000);
  const shape = inspectPersistentVector(values);
  expect(shape.count).toBe(1_000_000);
  expect(shape.depth).toBe(4);
  expect(shape.tailLength).toBe(32);

  for (const index of [0, 31, 32, 1024, 32768, 500000, 999999]) {
    resetPersistentVectorMetrics();
    expect(values.nth(index)).toBe(index);
    expect(persistentVectorMetrics().nodeVisits).toBeLessThanOrEqual(shape.depth);
  }

  resetPersistentVectorMetrics();
  const updated = values.assoc(500000, -1);
  const metrics = persistentVectorMetrics();
  expect(metrics.nodeVisits).toBe(shape.depth);
  expect(metrics.nodeAllocations).toBe(shape.depth);
  expect(sharedPersistentVectorNodes(values, updated)).toBe(
    shape.nodeCount - shape.depth,
  );
  expect(values.nth(500000)).toBe(500000);
  expect(updated.nth(500000)).toBe(-1);

  resetPersistentVectorMetrics();
  const slice = subvec(values, 499_999, 500_002);
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 0,
    rootGrowths: 0,
  });
  expect(slice.toArray()).toEqual([499_999, 500_000, 500_001]);
  expect(sharedPersistentVectorNodes(values, slice)).toBe(shape.nodeCount);

  resetPersistentVectorMetrics();
  const sliceUpdated = slice.assoc(1, "slice");
  expect(persistentVectorMetrics().nodeAllocations).toBe(shape.depth);
  expect(sharedPersistentVectorNodes(values, sliceUpdated)).toBe(
    shape.nodeCount - shape.depth,
  );
  expect(values.nth(500_000)).toBe(500_000);
  expect(sliceUpdated.toArray()).toEqual([499_999, "slice", 500_001]);
}, 30000);

test("persistent vector has equivalent behavior under Bun and Node", async () => {
  const fixture = fileURLToPath(
    new URL("fixtures/persistent-vector-host.mjs", import.meta.url),
  );
  const [bunResult, nodeResult] = await Promise.all([
    runHost("bun", fixture),
    runHost(process.env.NODE ?? "node", fixture),
  ]);

  expect(nodeResult).toEqual(bunResult);
  expect(bunResult).toMatchObject({
    persistent: true,
    probes: [0, 31, 32, 1024, 32768, 99999],
    original: 54321,
    updated: "updated",
    sum: 4_999_950_000,
  });
  expect(bunResult.metrics.nodeAllocations).toBe(bunResult.shape.depth);
  expect(bunResult.sharedNodes).toBe(
    bunResult.shape.nodeCount - bunResult.shape.depth,
  );
});
