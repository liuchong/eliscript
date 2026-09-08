import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  IReduce,
  isReduced,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  countBy,
  frequencies,
  groupBy,
  indexBy,
} from "../runtime/core/data.mjs";
import { EMPTY_MAP } from "../runtime/core/map.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";
import {
  concat,
  drop,
  every,
  filter,
  find,
  map,
  remove,
  reverse,
  some,
  take,
} from "../runtime/core/sequence.mjs";
import {
  composeTransducers,
  dropping,
  filtering,
  into,
  mapping,
  removing,
} from "../runtime/core/transducer.mjs";
import {
  EMPTY_VECTOR,
  persistentVector,
} from "../runtime/core/vector.mjs";
import {
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  transientMapMetrics,
} from "../runtime/testing/map.mjs";

const ROOT = resolve(import.meta.dir, "..");
const EMACS = process.env.EMACS ??
  "/opt/homebrew/Cellar/emacs-plus@30/30.2/bin/emacs";
const COMPILER = resolve(ROOT, "bin/eliscript");
const USAGE_SOURCE = resolve(ROOT, "tests/fixtures/core-stdlib-usage.eli");
const API_USAGE_SOURCE = resolve(
  ROOT,
  "tests/fixtures/core-language-api-usage.eli",
);
const HOST_FIXTURE = resolve(ROOT, "tests/fixtures/core-stdlib-host.mjs");

async function runSuccessful(command) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, EMACS },
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

async function compile(source, output) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([COMPILER, "--source-map", "--output", output, source]);
}

async function runHost(command) {
  return JSON.parse(await runSuccessful([command, HOST_FIXTURE]));
}

async function runBuiltCoreProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `core/${name}.mjs`),
  ).href);
  const runtimeUrl = JSON.stringify(pathToFileURL(
    resolve(ROOT, "runtime/core/vector.mjs"),
  ).href);
  const source = [
    `const protocol = await import(${moduleUrl("protocol")});`,
    `const collection = await import(${moduleUrl("collection")});`,
    `const transient = await import(${moduleUrl("transient")});`,
    `const transducer = await import(${moduleUrl("transducer")});`,
    `const sequence = await import(${moduleUrl("seq")});`,
    `const data = await import(${moduleUrl("data")});`,
    `const vector = await import(${runtimeUrl});`,
    "const named = protocol.define_protocol('Named', ['name']);",
    "protocol.extend_protocol_category(named, 'number',",
    "  { name: (value) => `n:${value}` });",
    "const name = protocol.protocol_method(named, 'name');",
    "const sourceValues = vector.persistentVector(1, 2, 3, 2);",
    "const builder = transient.transient(vector.EMPTY_VECTOR);",
    "transient.conj_BANG_(builder, 4, 5);",
    "const built = transient.persistent_BANG_(builder);",
    "const transformed = transducer.into(",
    "  vector.EMPTY_VECTOR,",
    "  transducer.compose_transducers(",
    "    transducer.mapping((value) => value * 2),",
    "    transducer.filtering((value) => value > 3)),",
    "  sourceValues);",
    "const mapped = sequence.map((value) => value + 1, sourceValues);",
    "const counts = data.frequencies(sourceValues);",
    "console.log(JSON.stringify({",
    "  protocol: name(7),",
    "  count: collection.collection_count(sourceValues),",
    "  built: [...built],",
    "  transformed: [...transformed],",
    "  mapped: [...mapped],",
    "  frequencies: [counts.get(1), counts.get(2), counts.get(3)],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

test("sequence algorithms use protocols and Eliscript truthiness", () => {
  class Range {
    constructor(start, end, observe = () => {}) {
      this.start = start;
      this.end = end;
      this.observe = observe;
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, Range, {
    reduce: (range, reducer, initial) => {
      let result = initial;
      for (let value = range.start; value < range.end; value += 1) {
        range.observe(value);
        result = reducer(result, value);
        if (isReduced(result)) {
          return unreduced(result);
        }
      }
      return result;
    },
  });

  const values = new Range(0, 6);
  expect([...reverse(values)]).toEqual([5, 4, 3, 2, 1, 0]);
  expect([...map((value) => value * 2, values)]).toEqual([0, 2, 4, 6, 8, 10]);
  expect([...filter((value) => value === 0 ? 0 : value % 2 === 0, values)])
    .toEqual([0, 2, 4]);
  expect([...remove((value) => value === 2, values)]).toEqual([0, 1, 3, 4, 5]);
  expect([...take(3, values)]).toEqual([0, 1, 2]);
  const takenValues = [];
  expect([...take(3, new Range(0, 100, (value) => takenValues.push(value)))])
    .toEqual([0, 1, 2]);
  expect(takenValues).toEqual([0, 1, 2]);
  expect([...drop(3, values)]).toEqual([3, 4, 5]);
  expect([...concat([0], persistentVector(1, 2), null, new Set([3, 4]))])
    .toEqual([0, 1, 2, 3, 4]);
  expect(some((value) => value === 2 ? 0 : null, values)).toBe(0);
  expect(some(() => null, values, "missing")).toBe("missing");
  expect(every(() => "", values)).toBe(true);
  expect(every((value) => value < 4, values)).toBe(false);
  expect(find((value) => value === 0, values, "missing")).toBe(0);
  const foundValues = [];
  expect(find(
    (value) => value === 0,
    new Range(0, 100, (value) => foundValues.push(value)),
    "missing",
  )).toBe(0);
  expect(foundValues).toEqual([0]);
  expect(find(() => false, values, "missing")).toBe("missing");
});

test("removing and dropping compose with fresh reduction state", () => {
  const pipeline = composeTransducers(
    dropping(2),
    removing((value) => value === 4),
    mapping((value) => value * 10),
    filtering((value) => value === 0 ? 0 : true),
  );
  expect([...into(EMPTY_VECTOR, pipeline, [0, 1, 2, 3, 4, 5])])
    .toEqual([20, 30, 50]);
  expect([...into(EMPTY_VECTOR, pipeline, [0, 1, 2, 3, 4, 5])])
    .toEqual([20, 30, 50]);
  expect(() => dropping(-1)).toThrow(
    "dropping limit must be a non-negative safe integer",
  );
  expect(() => removing(null)).toThrow("removing predicate must be a function");
});

test("data algorithms return persistent value-semantic maps and vectors", () => {
  const equalKey = () => persistentVector("same");
  const values = persistentVector(
    { id: 1, kind: "note" },
    { id: 2, kind: "guide" },
    { id: 3, kind: "note" },
  );
  const calls = [];
  const indexed = indexBy((value) => {
    calls.push(value.id);
    return value.kind;
  }, values);
  expect(calls).toEqual([1, 2, 3]);
  expect(indexed.get("note").id).toBe(3);
  expect(indexed.get("guide").id).toBe(2);

  const grouped = groupBy((value) => value.kind, values);
  expect([...grouped.get("note")].map(({ id }) => id)).toEqual([1, 3]);
  expect([...grouped.get("guide")].map(({ id }) => id)).toEqual([2]);
  const counted = countBy((value) => value.kind, values);
  expect(counted.get("note")).toBe(2);
  expect(counted.get("guide")).toBe(1);

  const valueKeys = groupBy(equalKey, values);
  expect(valueKeys.count).toBe(1);
  expect([...valueKeys.get(equalKey())].map(({ id }) => id)).toEqual([1, 2, 3]);
  const counts = frequencies(persistentVector("a", "b", "a", "c", "b", "a"));
  expect(counts.get("a")).toBe(3);
  expect(counts.get("b")).toBe(2);
  expect(counts.get("c")).toBe(1);
  expect(indexBy((value) => value, null)).toBe(EMPTY_MAP);
  expect(groupBy((value) => value, null)).toBe(EMPTY_MAP);
  expect(countBy((value) => value, null)).toBe(EMPTY_MAP);
});

test("indexBy uses a transient HAMT builder at scale", () => {
  const size = 50_000;
  const values = Array.from({ length: size }, (_, value) => value);
  resetPersistentMapMetrics();
  let reference = EMPTY_MAP;
  for (const value of values) {
    reference = reference.assoc(value, value);
  }
  const persistentAllocations = persistentMapMetrics().nodeAllocations;

  resetPersistentMapMetrics();
  resetTransientMapMetrics();
  const result = indexBy((value) => value, values);
  expect(result.count).toBe(size);
  expect(result.get(size - 1)).toBe(size - 1);
  expect(persistentMapMetrics().nodeAllocations)
    .toBeLessThan(persistentAllocations / 3);
  expect(transientMapMetrics()).toMatchObject({
    persistentCalls: 1,
    invalidCalls: 0,
  });
});

test("Eliscript core modules compile and execute against runtime protocols", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-core-stdlib-"));
  const runtimeLink = resolve(directory, "runtime");
  const protocolModule = resolve(directory, "stdlib/core/protocol.mjs");
  const identifierModule = resolve(directory, "stdlib/core/identifier.mjs");
  const dataTextModule = resolve(directory, "stdlib/core/data-text.mjs");
  const metadataModule = resolve(directory, "stdlib/core/metadata.mjs");
  const collectionModule = resolve(directory, "stdlib/core/collection.mjs");
  const transientModule = resolve(directory, "stdlib/core/transient.mjs");
  const transducerModule = resolve(directory, "stdlib/core/transducer.mjs");
  const seqModule = resolve(directory, "stdlib/core/seq.mjs");
  const dataModule = resolve(directory, "stdlib/core/data.mjs");
  const usageModule = resolve(directory, "core-stdlib-usage.mjs");
  const apiUsageModule = resolve(directory, "core-language-api-usage.mjs");
  try {
    await symlink(resolve(ROOT, "runtime"), runtimeLink, "dir");
    await compile(resolve(ROOT, "stdlib/core/protocol.eli"), protocolModule);
    await compile(resolve(ROOT, "stdlib/core/identifier.eli"), identifierModule);
    await compile(resolve(ROOT, "stdlib/core/data-text.eli"), dataTextModule);
    await compile(resolve(ROOT, "stdlib/core/metadata.eli"), metadataModule);
    await compile(resolve(ROOT, "stdlib/core/collection.eli"), collectionModule);
    await compile(resolve(ROOT, "stdlib/core/transient.eli"), transientModule);
    await compile(resolve(ROOT, "stdlib/core/transducer.eli"), transducerModule);
    await compile(resolve(ROOT, "stdlib/core/seq.eli"), seqModule);
    await compile(resolve(ROOT, "stdlib/core/data.eli"), dataModule);
    await compile(USAGE_SOURCE, usageModule);
    await compile(API_USAGE_SOURCE, apiUsageModule);

    const usage = await import(pathToFileURL(usageModule).href);
    expect([...usage.mapped]).toEqual([0, 2, 4, 6, 8]);
    expect([...usage.filtered]).toEqual([0, 2, 4]);
    expect([...usage.removed]).toEqual([0, 1, 3, 4]);
    expect([...usage.taken]).toEqual([0, 1, 2]);
    expect([...usage.dropped]).toEqual([2, 3, 4]);
    expect([...usage.reversed]).toEqual([4, 3, 2, 1, 0]);
    expect([...usage.concatenated]).toEqual([0, 1, 2, 3, 4]);
    expect(usage.first_even).toBe(4);
    expect(usage.zero_truth).toBe(0);
    expect(usage.all_truth).toBe(true);
    expect(usage.indexed.get(0)).toBe(3);
    expect([...usage.grouped.get(0)]).toEqual([0, 2, 4]);
    expect(usage.counted.get(1)).toBe(2);
    expect(usage.frequencies_result.get(1)).toBe(3);

    const generatedUsage = await readFile(usageModule, "utf8");
    expect(generatedUsage).toContain("first_even");

    const seqMap = await Bun.file(`${seqModule}.map`).json();
    expect(seqMap.sourcesContent[0]).toContain("(defun reverse (collection)");
    expect(seqMap.sourcesContent[0]).toContain("(defun some");
    expect(seqMap.sourcesContent[0]).not.toContain("runtime/core/sequence.mjs");
    const dataMap = await Bun.file(`${dataModule}.map`).json();
    expect(dataMap.sourcesContent[0]).toContain("(defun collect-buckets");
    expect(dataMap.sourcesContent[0]).toContain("(defun index-by");
    expect(dataMap.sourcesContent[0]).not.toContain("runtime/core/data.mjs");

    const api = await import(pathToFileURL(apiUsageModule).href);
    expect(api.report).toMatchObject({
      "number-description": "number:7",
      "default-description": "default",
      "number-category": "number",
      "method-slot-type": "symbol",
      "implements-number": true,
      "implements-operation": true,
      "vector-count": 3,
      "vector-second": 2,
      "vector-has-two": true,
      "vector-seq-count": 3,
      "map-left": 10,
      "map-missing": "fallback",
      "map-has-right": true,
      "metadata-support": true,
      "keyword-metadata-support": false,
      "metadata-left": 10,
      "metadata-varied-left": 30,
      "metadata-preserved": true,
      "printed-annotated-vector": '^{"left" 10 "right" 20} [1 2 3]',
      "read-metadata-left": 10,
      "bounded-sum": 6,
      "observed": [1, 2, 3],
      "reduced-state": true,
      "unreduced-value": 9,
      "keyword-string": ":article/title",
      "symbol-name": "article/title",
      "identifier-name": "title",
      "identifier-namespace": "article",
      "keyword-state": true,
      "symbol-state": true,
      "identifier-state": true,
    });
    expect([...api.report["vector-appended"]]).toEqual([1, 2, 3, 4]);
    expect([...api.report["vector-empty"]]).toEqual([]);
    expect([...api.report.transformed]).toEqual([6, 8]);

    class SourceRange {
      constructor(end, observe) {
        this.end = end;
        this.observe = observe;
        Object.freeze(this);
      }
    }
    extendProtocolType(IReduce, SourceRange, {
      reduce: (range, reducer, initial) => {
        let result = initial;
        for (let value = 0; value < range.end; value += 1) {
          range.observe(value);
          result = reducer(result, value);
          if (isReduced(result)) {
            return unreduced(result);
          }
        }
        return result;
      },
    });
    const generatedSeq = await import(pathToFileURL(seqModule).href);
    const observed = [];
    expect(generatedSeq.find(
      (value) => value === 4,
      new SourceRange(100, (value) => observed.push(value)),
      "missing",
    )).toBe(4);
    expect(observed).toEqual([0, 1, 2, 3, 4]);
    expect(() => generatedSeq.some(null, [], "missing"))
      .toThrow("some predicate must be a function");

    const generatedData = await import(pathToFileURL(dataModule).href);
    resetPersistentMapMetrics();
    resetTransientMapMetrics();
    const indexed = generatedData.index_by(
      (value) => value,
      Array.from({ length: 50_000 }, (_, value) => value),
    );
    expect(indexed.count).toBe(50_000);
    expect(transientMapMetrics()).toMatchObject({
      persistentCalls: 1,
      invalidCalls: 0,
    });

    const nodeCheck = [
      `const api = await import(${JSON.stringify(pathToFileURL(apiUsageModule).href)});`,
      `const seq = await import(${JSON.stringify(pathToFileURL(seqModule).href)});`,
      `const identifier = await import(${JSON.stringify(pathToFileURL(identifierModule).href)});`,
      `const metadata = await import(${JSON.stringify(pathToFileURL(metadataModule).href)});`,
      "if (api.report['number-description'] !== 'number:7') process.exit(1);",
      "if (JSON.stringify([...api.report['vector-appended']]) !== '[1,2,3,4]') process.exit(1);",
      "if (JSON.stringify([...seq.map((value) => value * 3, [1,2,3])]) !== '[3,6,9]') process.exit(1);",
      "if (String(identifier.keyword('article/title')) !== ':article/title') process.exit(1);",
      "if (metadata.meta(api.report['vector-appended']) !== null) process.exit(1);",
    ].join("");
    await runSuccessful(["node", "--input-type=module", "--eval", nodeCheck]);

    const protocolMap = await Bun.file(`${protocolModule}.map`).json();
    expect(protocolMap.sourcesContent[0]).toContain("(defun define-protocol");
    const identifierMap = await Bun.file(`${identifierModule}.map`).json();
    expect(identifierMap.sourcesContent[0]).toContain("(defun keyword");
    const dataTextMap = await Bun.file(`${dataTextModule}.map`).json();
    expect(dataTextMap.sourcesContent[0]).toContain("(defun print-value");
    const metadataMap = await Bun.file(`${metadataModule}.map`).json();
    expect(metadataMap.sourcesContent[0]).toContain("(defun with-meta");
    const collectionMap = await Bun.file(`${collectionModule}.map`).json();
    expect(collectionMap.sourcesContent[0]).toContain("(defun reduce");
    const transientMap = await Bun.file(`${transientModule}.map`).json();
    expect(transientMap.sourcesContent[0]).toContain("(defun persistent!");
    const transducerMap = await Bun.file(`${transducerModule}.map`).json();
    expect(transducerMap.sourcesContent[0])
      .toContain("(defun compose-transducers");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protocol standard-library algorithms agree under Bun and Node", async () => {
  const expected = {
    reverse: [4, 3, 2, 1, 0],
    map: [0, 2, 4, 6, 8],
    filter: [0, 2, 4],
    remove: [0, 1, 3, 4],
    take: [0, 1, 2],
    drop: [2, 3, 4],
    concat: [0, 1, 2, 3, 4],
    some: 0,
    every: true,
    find: 3,
    indexed: [3, 4, 2],
    grouped: [[0, 2, 4], [1, 3]],
    counted: [3, 2],
    frequencies: [3, 2, 1],
  };
  expect(await runHost(process.execPath)).toEqual(expected);
  expect(await runHost(process.env.NODE_BINARY ?? "node")).toEqual(expected);
});

test("stable core protocol library builds as one project and executes under Bun and Node", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-core-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const sources = [
    "protocol",
    "collection",
    "transient",
    "transducer",
    "seq",
    "data",
  ].map((name) => resolve(ROOT, `stdlib/core/${name}.eli`));
  try {
    await symlink(resolve(ROOT, "runtime"), resolve(directory, "runtime"), "dir");
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...sources,
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: [
        "core/collection.eli",
        "core/data.eli",
        "core/protocol.eli",
        "core/seq.eli",
        "core/transducer.eli",
        "core/transient.eli",
      ],
      counts: { modules: 6, compiled: 6, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    const expected = {
      protocol: "n:7",
      count: 4,
      built: [4, 5],
      transformed: [4, 6, 4],
      mapped: [2, 3, 4, 3],
      frequencies: [1, 2, 1],
    };
    expect(await runBuiltCoreProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltCoreProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
