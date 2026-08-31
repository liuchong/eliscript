import { expect, test } from "bun:test";

import { eliscriptSymbol, keyword } from "../runtime/core/identifier.mjs";
import { persistentList } from "../runtime/core/list.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { meta, withMeta } from "../runtime/core/metadata.mjs";
import { persistentHashSet } from "../runtime/core/set.mjs";
import { equalValues } from "../runtime/core/value.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import {
  WorkerValueStreamDecoder,
  WorkerValueStreamError,
  decodeWorkerValueChunks,
  encodeWorkerValueChunks,
  workerValueFraming,
} from "../runtime/worker-value-stream.mjs";

async function chunksFor(value, options) {
  const chunks = [];
  for await (const chunk of encodeWorkerValueChunks(value, options)) {
    chunks.push(chunk);
  }
  return chunks;
}

async function roundTrip(value, options) {
  return decodeWorkerValueChunks(await chunksFor(value, options), options);
}

test("chunked value stream preserves every persistent and host category", async () => {
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
    [1, { ready: false }],
  ), metadata);

  const decoded = await roundTrip(value, {
    maxChunkBytes: 256,
    maxEventsPerChunk: 5,
    maxTextPartUnits: 3,
  });

  expect(workerValueFraming).toBe("eliscript-value-chunks-v1");
  expect(equalValues(
    persistentList(...Array.from(decoded).slice(0, 5)),
    persistentList(...Array.from(value).slice(0, 5)),
  )).toBe(true);
  expect(equalValues(meta(decoded), metadata)).toBe(true);
  expect(equalValues(meta(decoded.nth(1)), metadata)).toBe(true);
  expect(decoded.nth(2).nth(0)).toBeUndefined();
  expect(Object.is(decoded.nth(2).nth(1), -0)).toBe(true);
  expect(Number.isNaN(decoded.nth(2).nth(2))).toBe(true);
  expect(decoded.nth(2).nth(3)).toBe(Number.POSITIVE_INFINITY);
  expect(decoded.nth(5)).toEqual([1, { ready: false }]);
});

test("chunked value stream bounds frames and splits long Unicode text", async () => {
  const value = `${"ab😀\n".repeat(20_000)}done`;
  const options = {
    maxChunkBytes: 512,
    maxEventsPerChunk: 4,
    maxTextPartUnits: 17,
  };
  const chunks = await chunksFor(value, options);
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    expect(Buffer.byteLength(JSON.stringify(chunk), "utf8")).toBeLessThanOrEqual(512);
    expect(chunk.length).toBeLessThanOrEqual(4);
  }
  expect(await decodeWorkerValueChunks(chunks, options)).toBe(value);
});

test("stream decoder rejects malformed, duplicate, truncated, and oversized input", () => {
  const duplicateMap = new WorkerValueStreamDecoder();
  expect(() => duplicateMap.write([
    ["open", "map", 2],
    ["open", "keyword", 2], ["value", null], ["text", 1], ["text-part", "x"],
    ["value", 1],
    ["open", "keyword", 2], ["value", null], ["text", 1], ["text-part", "x"],
    ["value", 2],
    ["value", null],
  ])).toThrow(/equivalent duplicate key/);

  const truncated = new WorkerValueStreamDecoder();
  truncated.write([["text", 4], ["text-part", "ab"]]);
  expect(() => truncated.finish()).toThrow(/ended inside a string/);

  const extraRoot = new WorkerValueStreamDecoder();
  expect(() => extraRoot.write([["value", 1], ["value", 2]]))
    .toThrow(/multiple roots/);

  const deep = new WorkerValueStreamDecoder({ maxDepth: 1 });
  expect(() => deep.write([
    ["open", "array", 1],
    ["open", "array", 1],
    ["open", "array", 0],
  ])).toThrow(/exceeds depth 1/);

  const longText = new WorkerValueStreamDecoder({
    maxStringUnits: 2,
    maxTextPartUnits: 2,
  });
  expect(() => longText.write([["text", 3]])).toThrow(/string exceeds 2/);

  const wideChunk = new WorkerValueStreamDecoder({ maxChunkBytes: 32 });
  expect(() => wideChunk.write([["text", 20], ["text-part", "x".repeat(20)]]))
    .toThrow(/chunk exceeds 32 bytes/);
});

test("stream encoder rejects cycles, unsupported values, limits, and cancellation", async () => {
  const cycle = [];
  cycle.push(cycle);
  await expect(chunksFor(cycle)).rejects.toBeInstanceOf(WorkerValueStreamError);
  await expect(chunksFor(() => 1)).rejects.toThrow(/unsupported function value/);
  await expect(chunksFor([1, 2, 3], { maxCollectionLength: 2 }))
    .rejects.toThrow(/collection exceeds 2 values/);

  const controller = new AbortController();
  controller.abort();
  await expect(chunksFor([1], { signal: controller.signal }))
    .rejects.toThrow(/traversal was cancelled/);
});
