import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  conj,
  count,
  empty,
  nth,
  reduce,
  seq,
} from "../runtime/core/collection.mjs";
import { keyword } from "../runtime/core/identifier.mjs";
import {
  EMPTY_LIST,
  PersistentList,
  isPersistentList,
  persistentList,
} from "../runtime/core/list.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { equalValues, hashValue } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  inspectPersistentList,
  persistentListMetrics,
  resetPersistentListMetrics,
  sharedPersistentListNodes,
} from "../runtime/testing/list.mjs";

const HOST_FIXTURE = fileURLToPath(
  new URL("./fixtures/persistent-list-host.mjs", import.meta.url),
);

async function runHost(command) {
  const child = Bun.spawn([command, HOST_FIXTURE], {
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

test("persistent list preserves order and constant-time front operations", () => {
  expect(PersistentList.empty()).toBe(EMPTY_LIST);
  expect(EMPTY_LIST.count).toBe(0);
  expect(EMPTY_LIST.size).toBe(0);
  expect(EMPTY_LIST.isEmpty).toBe(true);
  expect(EMPTY_LIST.first()).toBeNull();
  expect(EMPTY_LIST.first("missing")).toBe("missing");
  expect(EMPTY_LIST.rest()).toBe(EMPTY_LIST);
  expect(EMPTY_LIST.nth(0, "missing")).toBe("missing");
  expect(() => EMPTY_LIST.nth(0)).toThrow(RangeError);
  expect(() => EMPTY_LIST.pop()).toThrow(RangeError);
  expect(() => new PersistentList()).toThrow(TypeError);

  const values = persistentList("a", "b", "c");
  const extended = values.conj("front");
  const consed = values.cons("first");

  expect(isPersistentList(values)).toBe(true);
  expect(Array.isArray(values)).toBe(false);
  expect(Object.isFrozen(values)).toBe(true);
  expect(values.isEmpty).toBe(false);
  expect(values.toArray()).toEqual(["a", "b", "c"]);
  expect(values.first()).toBe("a");
  expect(values.peek()).toBe("a");
  expect(values.nth(2)).toBe("c");
  expect(values.nth(3, "missing")).toBe("missing");
  expect(extended.toArray()).toEqual(["front", "a", "b", "c"]);
  expect(extended.rest()).toBe(values);
  expect(extended.pop()).toBe(values);
  expect(consed.rest()).toBe(values);
  expect(values.reduce((left, right) => left + right)).toBe("abc");
  expect(EMPTY_LIST.reduce((value) => value, "initial")).toBe("initial");
  expect(() => EMPTY_LIST.reduce((left, right) => left + right)).toThrow(
    TypeError,
  );
});

test("persistent list implements collection, value, and metadata protocols", () => {
  const values = persistentList(1, persistentList(2, 3), keyword("ready"));
  const equal = persistentList(1, persistentList(2, 3), keyword("ready"));
  const metadata = persistentHashMap([keyword("line"), 7]);
  const annotated = withMeta(values, metadata);
  const sequence = seq(values);

  expect(count(values)).toBe(3);
  expect(sequence).not.toBe(values);
  expect([...sequence]).toEqual(values.toArray());
  expect(reduce(values, (total, value) => total + (typeof value === "number" ? value : 0), 0))
    .toBe(1);
  expect(conj(values, 0).rest()).toBe(values);
  expect(empty(values)).toBe(EMPTY_LIST);
  expect(() => nth(values, 0)).toThrow(/IIndexed/);
  expect(equalValues(values, equal)).toBe(true);
  expect(hashValue(values)).toBe(hashValue(equal));
  expect(equalValues(values, persistentVector(...values))).toBe(false);
  expect(meta(annotated)).toBe(metadata);
  expect(hashValue(annotated)).toBe(hashValue(values));
  expect(equalValues(annotated, values)).toBe(true);
  expect(annotated.rest()).toBe(values.rest());
  expect(meta(empty(annotated))).toBe(metadata);
  expect(persistentHashMap([values, "found"]).get(equal)).toBe("found");
});

test("persistent list allocates one front node and shares its complete suffix", () => {
  const values = persistentList(...Array.from({ length: 1000 }, (_, index) => index));
  expect(inspectPersistentList(values)).toEqual({
    count: 1000,
    empty: false,
    nodeCount: 1000,
  });

  resetPersistentListMetrics();
  const extended = values.conj(-1);
  expect(persistentListMetrics()).toEqual({ nodeAllocations: 1 });
  expect(sharedPersistentListNodes(values, extended)).toBe(1000);
  expect(extended.rest()).toBe(values);

  resetPersistentListMetrics();
  const annotated = withMeta(values, persistentHashMap([keyword("tag"), true]));
  expect(persistentListMetrics()).toEqual({ nodeAllocations: 1 });
  expect(sharedPersistentListNodes(values, annotated)).toBe(999);
  expect(annotated.rest()).toBe(values.rest());
  expect(inspectPersistentList(EMPTY_LIST).nodeCount).toBe(0);
});

test("persistent list traverses one million nodes without stack growth", () => {
  const size = 1_000_000;
  let values = EMPTY_LIST;
  for (let value = size - 1; value >= 0; value -= 1) {
    values = values.conj(value);
  }

  expect(values.count).toBe(size);
  expect(values.first()).toBe(0);
  expect(values.nth(size - 1)).toBe(size - 1);
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(499_999_500_000);
  expect(values.conj(-1).rest()).toBe(values);
});

test("persistent list behavior and data text agree under Bun and Node", async () => {
  const bunReport = await runHost(process.execPath);
  const nodeReport = await runHost(process.env.NODE_BINARY ?? "node");
  expect(nodeReport).toEqual(bunReport);
  expect(bunReport).toEqual({
    empty: 0,
    values: ["1", ":two", [3, 4]],
    hash: 2922258686,
    equal: true,
    text: '^{:source "host"} (1 :two (3 4))',
    source: "host",
    keyed: "found",
  });
});
