import { expect, test } from "bun:test";
import {
  eliscriptSymbol,
  keyword,
} from "../runtime/core/identifier.mjs";
import { persistentList } from "../runtime/core/list.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import {
  defineProtocol,
  defineProtocolFromDefinition,
  protocolDefinition,
  protocolSlot,
} from "../runtime/core/protocol.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import { transient } from "../runtime/core/transient.mjs";
import { equalValues } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  WorkerValueCodecError,
  decodeWorkerValue,
  decodeWorkerValues,
  encodeWorkerValue,
  encodeWorkerValues,
  workerValueEncoding,
} from "../runtime/worker-value-codec.mjs";

test("worker value codec preserves persistent categories and metadata", () => {
  const metadata = persistentHashMap([keyword("source"), "emacs"]);
  const value = withMeta(persistentList(
    keyword("app", "ready"),
    withMeta(eliscriptSymbol("model", "item"), metadata),
    persistentVector(undefined, -0, Number.NaN, Number.POSITIVE_INFINITY),
    persistentHashMap(
      [keyword("enabled"), true],
      [eliscriptSymbol("count"), 3],
    ),
    persistentHashSet("alpha", keyword("beta")),
  ), metadata);

  const encoded = encodeWorkerValue(value);
  const decoded = decodeWorkerValue(encoded);

  expect(workerValueEncoding).toBe("eliscript-value-v1");
  expect(equalValues(decoded, value)).toBe(true);
  expect(equalValues(meta(decoded), metadata)).toBe(true);
  expect(equalValues(meta(decoded.nth(1)), metadata)).toBe(true);
  expect(decoded.nth(2).nth(0)).toBeUndefined();
  expect(Object.is(decoded.nth(2).nth(1), -0)).toBe(true);
  expect(Number.isNaN(decoded.nth(2).nth(2))).toBe(true);
  expect(decoded.nth(2).nth(3)).toBe(Number.POSITIVE_INFINITY);
  expect(encodeWorkerValue(decoded)).toEqual(encoded);

  const hostValue = [1, { ready: false }];
  expect(decodeWorkerValue(encodeWorkerValue(hostValue))).toEqual(hostValue);
  const sparse = Array(1);
  const sparseWire = encodeWorkerValue(sparse);
  expect(sparseWire).toEqual(["array", [["undefined"]]]);
  expect(decodeWorkerValue(JSON.parse(JSON.stringify(sparseWire))))
    .toEqual([undefined]);
});

test("worker value codec emits deterministic Map, Set, and object order", () => {
  const left = persistentHashMap(
    [keyword("z"), 1],
    [keyword("a"), 2],
  );
  const right = persistentHashMap(
    [keyword("a"), 2],
    [keyword("z"), 1],
  );
  expect(encodeWorkerValue(left)).toEqual(encodeWorkerValue(right));
  expect(encodeWorkerValue(persistentHashSet("z", "a"))).toEqual(
    encodeWorkerValue(persistentHashSet("a", "z")),
  );
  expect(encodeWorkerValue({ z: 1, a: 2 })).toEqual(
    encodeWorkerValue({ a: 2, z: 1 }),
  );
  expect(encodeWorkerValue(persistentHashSet("😀", "\uE000"))).toEqual(
    ["set", ["\uE000", "😀"], null],
  );
});

test("worker value codec transports protocol definitions without runtime identity", () => {
  const original = defineProtocol("WorkerReadable", ["read", "close"]);
  const originalDefinition = protocolDefinition(original);
  const transported = decodeWorkerValue(encodeWorkerValue(originalDefinition));
  const restored = defineProtocolFromDefinition(transported);

  expect(transported).toEqual(originalDefinition);
  expect(protocolDefinition(restored)).toEqual(originalDefinition);
  expect(protocolSlot(restored, "read"))
    .not.toBe(protocolSlot(original, "read"));
  expect(() => encodeWorkerValue(original)).toThrow(
    /unsupported function value/,
  );
});

test("worker value codec rejects unsupported, cyclic, duplicate, and oversized values", () => {
  const cycle = [];
  cycle.push(cycle);
  expect(() => encodeWorkerValue(cycle)).toThrow(WorkerValueCodecError);
  expect(() => encodeWorkerValue(() => 1)).toThrow(
    /unsupported function value at \$/,
  );
  expect(() => encodeWorkerValue(transient(persistentVector(1)))).toThrow(
    /unsupported object/,
  );
  expect(() => encodeWorkerValue([1, 2, 3], {
    maxCollectionLength: 2,
  })).toThrow(/collection exceeds 2 values/);
  expect(() => decodeWorkerValue(
    ["map", [[["keyword", null, "x"], 1], [["keyword", null, "x"], 2]], null],
  )).toThrow(/equivalent duplicate key/);
  expect(() => decodeWorkerValue(["unknown"])).toThrow(/unknown value tag/);
  expect(() => decodeWorkerValue(["array", [["array", [1]]]], {
    maxDepth: 1,
  })).toThrow(/value exceeds depth 1/);
});

test("worker value codec shares one resource budget across argument vectors", () => {
  const encoded = encodeWorkerValues([
    persistentVector(1, 2),
    persistentList(3, 4),
  ]);
  const decoded = decodeWorkerValues(encoded);
  expect(equalValues(decoded[0], persistentVector(1, 2))).toBe(true);
  expect(equalValues(decoded[1], persistentList(3, 4))).toBe(true);
  expect(() => decodeWorkerValues(encoded, { maxNodes: 3 })).toThrow(
    /value exceeds 3 nodes/,
  );
});
