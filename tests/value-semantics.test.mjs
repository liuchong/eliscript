import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  equalValues,
  hashValue,
} from "../runtime/core/value.mjs";
import {
  EMPTY_VECTOR,
  persistentVector,
} from "../runtime/core/vector.mjs";
import {
  clearValueHashCaches,
  resetValueHashMetrics,
  valueHashMetrics,
} from "../runtime/testing/value.mjs";

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

test("value equality and hashing freeze scalar edge semantics", () => {
  const equalPairs = [
    [null, null],
    [undefined, undefined],
    [false, false],
    [0, -0],
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ["值语义🙂", "值语义🙂"],
    [12345678901234567890n, 12345678901234567890n],
    [Symbol.for("eliscript/value"), Symbol.for("eliscript/value")],
  ];
  for (const [left, right] of equalPairs) {
    expect(equalValues(left, right)).toBe(true);
    expect(hashValue(left)).toBe(hashValue(right));
    expect(hashValue(left)).toBeGreaterThanOrEqual(0);
    expect(hashValue(left)).toBeLessThanOrEqual(0xffff_ffff);
  }

  for (const [left, right] of [
    [null, undefined],
    [false, 0],
    [1, 1n],
    ["1", 1],
    [Number.NaN, 0],
    [Symbol("same"), Symbol("same")],
  ]) {
    expect(equalValues(left, right)).toBe(false);
  }
});

test("hash collisions never imply value equality", () => {
  const left = "key-50691";
  const right = "key-194634";
  expect(hashValue(left)).toBe(2357254775);
  expect(hashValue(right)).toBe(2357254775);
  expect(equalValues(left, right)).toBe(false);
});

test("host objects retain identity equality and process-local hashes", () => {
  clearValueHashCaches();
  const left = { value: 1 };
  const right = { value: 1 };
  const array = [1, 2, 3];
  const localSymbol = Symbol("local");
  const callable = () => 1;

  expect(equalValues(left, left)).toBe(true);
  expect(equalValues(left, right)).toBe(false);
  expect(equalValues(array, [1, 2, 3])).toBe(false);
  expect(hashValue(left)).toBe(hashValue(left));
  expect(hashValue(left)).not.toBe(hashValue(right));
  expect(hashValue(localSymbol)).toBe(hashValue(localSymbol));
  expect(hashValue(callable)).toBe(hashValue(callable));
  expect(valueHashMetrics().hostIdentityAssignments).toBe(4);
});

test("persistent vectors use recursive value equality and ordered hashes", () => {
  const sharedHost = { opaque: true };
  const left = persistentVector(
    1,
    "two",
    Number.NaN,
    persistentVector(null, undefined, -0),
    sharedHost,
  );
  const right = persistentVector(
    1,
    "two",
    Number.NaN,
    persistentVector(null, undefined, 0),
    sharedHost,
  );

  expect(equalValues(left, right)).toBe(true);
  expect(hashValue(left)).toBe(hashValue(right));
  expect(equalValues(left, right.assoc(1, "changed"))).toBe(false);
  expect(equalValues(left, left.pop())).toBe(false);
  expect(equalValues(left, left.toArray())).toBe(false);
  expect(equalValues(
    left,
    right.assoc(4, { opaque: true }),
  )).toBe(false);
});

test("equal generated vectors always have equal hashes", () => {
  const random = { value: 0x00c0ffee };
  for (let sample = 0; sample < 1000; sample += 1) {
    const count = nextRandom(random) % 96;
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const value = nextRandom(random);
      values.push(index % 11 === 0
        ? persistentVector(value, value % 17, `v${value % 31}`)
        : value);
    }
    const left = persistentVector(...values);
    const right = persistentVector(...values.map((value) =>
      value?.toArray === undefined
        ? value
        : persistentVector(...value.toArray())));
    expect(equalValues(left, right)).toBe(true);
    expect(hashValue(left)).toBe(hashValue(right));
  }
});

test("persistent vector hashes are cached without changing values", () => {
  clearValueHashCaches();
  const values = vectorRange(10000);
  const first = hashValue(values);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 10001,
    protocolHashComputations: 1,
    protocolHashCacheHits: 0,
    hostIdentityAssignments: 0,
  });

  resetValueHashMetrics();
  expect(hashValue(values)).toBe(first);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 1,
    protocolHashComputations: 0,
    protocolHashCacheHits: 1,
    hostIdentityAssignments: 0,
  });

  const updated = values.assoc(5000, -1);
  expect(hashValue(updated)).not.toBe(first);
  expect(values.nth(5000)).toBe(5000);
});

test("persistent vector hashing remains linear and cached at one million values", () => {
  clearValueHashCaches();
  const values = vectorRange(1_000_000);
  const first = hashValue(values);
  expect(Number.isInteger(first)).toBe(true);
  expect(valueHashMetrics().hashValueCalls).toBe(1_000_001);
  expect(valueHashMetrics().protocolHashComputations).toBe(1);

  resetValueHashMetrics();
  expect(hashValue(values)).toBe(first);
  expect(valueHashMetrics()).toEqual({
    hashValueCalls: 1,
    protocolHashComputations: 0,
    protocolHashCacheHits: 1,
    hostIdentityAssignments: 0,
  });
}, 30000);

test("value hashes match the frozen Bun and Node fixture", async () => {
  const source = fileURLToPath(
    new URL("fixtures/value-hash-host.mjs", import.meta.url),
  );
  const expectedFile = fileURLToPath(
    new URL("fixtures/value-hashes.json", import.meta.url),
  );
  const expected = JSON.parse(await readFile(expectedFile, "utf8"));
  const [bunResult, nodeResult] = await Promise.all([
    runHost("bun", source),
    runHost(process.env.NODE ?? "node", source),
  ]);

  expect(bunResult).toEqual(expected);
  expect(nodeResult).toEqual(expected);
});
