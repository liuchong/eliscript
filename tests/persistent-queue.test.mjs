import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  conj,
  count,
  empty,
  isCollection,
  isQueue,
  isSequence,
  isSequential,
  peek,
  pop,
  reduce,
  seq,
} from "../runtime/core/collection.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import {
  EMPTY_QUEUE,
  PersistentQueue,
  isPersistentQueue,
  persistentQueue,
} from "../runtime/core/queue.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";
import {
  inspectPersistentQueue,
  persistentQueueMetrics,
  resetPersistentQueueMetrics,
  sharedPersistentQueueParts,
} from "../runtime/testing/queue.mjs";
import {
  persistentVectorMetrics,
  resetPersistentVectorMetrics,
} from "../runtime/testing/vector.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript");
const HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/persistent-queue-host.mjs", import.meta.url),
);
const LIBRARY_HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/persistent-queue-library-host.mjs", import.meta.url),
);

async function runSuccessful(command) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, EMACS: process.env.EMACS ?? "emacs" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

test("persistent queue preserves FIFO order and immutable front operations", () => {
  expect(PersistentQueue.empty()).toBe(EMPTY_QUEUE);
  expect(PersistentQueue.from(EMPTY_QUEUE)).toBe(EMPTY_QUEUE);
  expect(EMPTY_QUEUE.count).toBe(0);
  expect(EMPTY_QUEUE.size).toBe(0);
  expect(EMPTY_QUEUE.isEmpty).toBe(true);
  expect(EMPTY_QUEUE.peek()).toBeNull();
  expect(EMPTY_QUEUE.peek("empty")).toBe("empty");
  expect(() => EMPTY_QUEUE.pop()).toThrow(
    "cannot pop an empty persistent queue",
  );
  expect(() => new PersistentQueue()).toThrow(TypeError);

  const source = persistentQueue("a", "b", "c");
  const appended = source.conj("d");
  const popped = appended.pop();

  expect(isPersistentQueue(source)).toBe(true);
  expect(Array.isArray(source)).toBe(false);
  expect(Object.isFrozen(source)).toBe(true);
  expect(source.toArray()).toEqual(["a", "b", "c"]);
  expect(appended.toArray()).toEqual(["a", "b", "c", "d"]);
  expect(popped.toArray()).toEqual(["b", "c", "d"]);
  expect(source.toArray()).toEqual(["a", "b", "c"]);
  expect(popped.peek()).toBe("b");
  expect(popped.reduce((left, right) => left + right)).toBe("bcd");
  expect(EMPTY_QUEUE.reduce((value) => value, "initial")).toBe("initial");
  expect(() => EMPTY_QUEUE.reduce((left, right) => left + right)).toThrow(
    TypeError,
  );
});

test("persistent queue implements collection value and metadata protocols", () => {
  const source = persistentQueue(1, persistentQueue(2, 3), 4);
  const equal = persistentQueue(1, persistentQueue(2, 3), 4);
  const metadata = persistentHashMap(["kind", "work"]);
  const annotated = withMeta(source, metadata);

  expect(isCollection(source)).toBe(true);
  expect(isQueue(source)).toBe(true);
  expect(isSequential(source)).toBe(true);
  expect(isSequence(source)).toBe(false);
  expect(count(source)).toBe(3);
  expect(peek(source)).toBe(1);
  expect(conj(source, 5).toArray()).toEqual([1, persistentQueue(2, 3), 4, 5]);
  expect(pop(source).toArray()).toEqual([persistentQueue(2, 3), 4]);
  expect([...seq(source)]).toEqual(source.toArray());
  expect(reduce(source, (total, value) =>
    total + (typeof value === "number" ? value : 0), 0)).toBe(5);
  expect(empty(source)).toBe(EMPTY_QUEUE);
  expect(equalValues(source, equal)).toBe(true);
  expect(hashValue(source)).toBe(hashValue(equal));
  expect(meta(annotated)).toBe(metadata);
  expect(meta(conj(annotated, 5))).toBe(metadata);
  expect(meta(pop(annotated))).toBe(metadata);
  expect(meta(empty(annotated))).toBe(metadata);
  expect(equalValues(annotated, source)).toBe(true);
});

test("persistent queue promotes its rear without traversal or node allocation", () => {
  const source = PersistentQueue.from(
    Array.from({ length: 4096 }, (_, index) => index),
  );
  expect(inspectPersistentQueue(source)).toEqual({
    count: 4096,
    frontCount: 1,
    rearCount: 4095,
  });

  resetPersistentQueueMetrics();
  const appended = source.conj(4096);
  expect(persistentQueueMetrics()).toEqual({
    queueAllocations: 1,
    frontPromotions: 0,
    promotedValues: 0,
  });
  const sharing = sharedPersistentQueueParts(source, appended);
  expect(sharing.frontIdentity).toBe(true);
  expect(sharing.sharedFrontNodes).toBe(1);
  expect(sharing.sharedRearNodes).toBeGreaterThan(0);

  resetPersistentQueueMetrics();
  resetPersistentVectorMetrics();
  const promoted = source.pop();
  expect(persistentQueueMetrics()).toEqual({
    queueAllocations: 1,
    frontPromotions: 1,
    promotedValues: 4095,
  });
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 0,
    rootGrowths: 0,
  });
  expect(promoted.peek()).toBe(1);
  expect(inspectPersistentQueue(promoted)).toEqual({
    count: 4095,
    frontCount: 4095,
    rearCount: 0,
  });
  expect(sharedPersistentQueueParts(source, promoted).rearPromotedToFront)
    .toBe(true);

  resetPersistentQueueMetrics();
  resetPersistentVectorMetrics();
  const advanced = promoted.pop();
  expect(persistentQueueMetrics()).toEqual({
    queueAllocations: 1,
    frontPromotions: 0,
    promotedValues: 0,
  });
  expect(persistentVectorMetrics()).toEqual({
    nodeAllocations: 0,
    nodeVisits: 0,
    tailAllocations: 0,
    rootGrowths: 0,
  });
  expect(advanced.peek()).toBe(2);
});

test("persistent queue agrees with a mutable FIFO reference model", () => {
  const random = { value: 0x51a7_2026 };
  const retained = [];
  let queue = EMPTY_QUEUE;
  let model = [];

  for (let step = 0; step < 20_000; step += 1) {
    if (model.length === 0 || (nextRandom(random) & 3) !== 0) {
      const value = nextRandom(random) % 10_000;
      queue = queue.conj(value);
      model.push(value);
    } else {
      queue = queue.pop();
      model.shift();
    }
    if (step % 997 === 0) retained.push([queue, [...model]]);
    expect(queue.count).toBe(model.length);
    expect(queue.peek("empty")).toBe(model[0] ?? "empty");
  }

  expect(queue.toArray()).toEqual(model);
  for (const [value, expected] of retained) {
    expect(value.toArray()).toEqual(expected);
  }
});

test("persistent queue stays iterative at one million values", () => {
  const size = 1_000_000;
  let queue = EMPTY_QUEUE;
  for (let value = 0; value < size; value += 1) queue = queue.conj(value);

  resetPersistentQueueMetrics();
  const rotated = queue.pop();
  expect(rotated.count).toBe(size - 1);
  expect(rotated.peek()).toBe(1);
  expect(rotated.reduce((sum, value) => sum + value, 0))
    .toBe(499_999_500_000);
  expect(persistentQueueMetrics()).toEqual({
    queueAllocations: 1,
    frontPromotions: 1,
    promotedValues: size - 1,
  });
}, 30_000);

test("persistent queue runtime agrees under Bun and Node", async () => {
  const reports = [];
  for (const host of [process.execPath, process.env.NODE_BINARY ?? "node"]) {
    reports.push(JSON.parse(await runSuccessful([host, HOST_FIXTURE])));
  }
  expect(reports[1]).toEqual(reports[0]);
  expect(reports[0]).toMatchObject({
    values: [":two", "3", "4"],
    count: 3,
    front: ":two",
    hash: expect.any(Number),
    equal: true,
    source: "host",
  });
});

test("Eliscript persistent queue API compiles and runs on both hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-queue-"));
  const output = resolve(directory, "persistent-queue.mjs");
  try {
    await runSuccessful([
      COMPILER,
      "--source-map",
      "--output",
      output,
      resolve(ROOT, "stdlib/persistent-queue.eli"),
    ]);
    const reports = [];
    for (const host of [process.execPath, process.env.NODE_BINARY ?? "node"]) {
      reports.push(JSON.parse(await runSuccessful([
        host,
        LIBRARY_HOST_FIXTURE,
        output,
      ])));
    }
    expect(reports[1]).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      persistent: true,
      empty: false,
      count: 3,
      front: 2,
      values: [2, 3, 4],
      sum: 9,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
