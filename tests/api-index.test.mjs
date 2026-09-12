import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApiIndexValidationError,
  buildApiIndex,
  generateApiArtifacts,
  renderApiHtml,
  renderApiJson,
} from "../tools/surface/generate-api.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

async function validationErrors(metadata) {
  try {
    await buildApiIndex({ root: ROOT, metadata });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiIndexValidationError);
    return error.errors;
  }
  throw new Error("expected library API metadata validation to fail");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

test("generated library API index matches every declared module and export", async () => {
  const index = await buildApiIndex({ root: ROOT });
  expect(index.moduleCount).toBe(42);
  expect(index.exportCount).toBe(576);
  expect(index.modules.find(({ module }) => module === "deferred")).toEqual({
    module: "deferred",
    source: "stdlib/deferred.eli",
    spec: "0161",
    specFile: "specs/0161-deferred-and-memoized-computation.md",
    stability: "stable",
    role: "state",
    summary: "Synchronous delayed computation and value-semantic function memoization.",
    exports: ["delay", "delay?", "force", "memoize", "realized?"],
  });
  expect(index.modules.find(({ module }) => module === "core-walk")).toEqual({
    module: "core-walk",
    source: "stdlib/core/walk.eli",
    spec: "0173",
    specFile: "specs/0173-persistent-tree-walk.md",
    stability: "stable",
    role: "runtime-core",
    summary: "Stack-safe pre-order and post-order traversal and rewriting of nested persistent values.",
    exports: [
      "postwalk",
      "postwalk-replace",
      "prewalk",
      "prewalk-replace",
      "walk",
    ],
  });
  expect(index.modules.find(({ module }) => module === "core-zipper")).toEqual({
    module: "core-zipper",
    source: "stdlib/core/zipper.eli",
    spec: "0174",
    specFile: "specs/0174-persistent-zipper-navigation.md",
    stability: "stable",
    role: "runtime-core",
    summary: "Immutable tree locations for stack-safe navigation, editing, and persistent root reconstruction.",
    exports: [
      "append-child",
      "branch?",
      "children",
      "down",
      "edit",
      "end?",
      "insert-child",
      "insert-left",
      "insert-right",
      "left",
      "leftmost",
      "lefts",
      "list-zipper",
      "make-node",
      "next",
      "node",
      "path",
      "prev",
      "remove",
      "replace",
      "right",
      "rightmost",
      "rights",
      "root",
      "up",
      "vector-zipper",
      "zipper",
      "zipper?",
    ],
  });
  expect(index.modules.find(({ module }) => module === "core-sorted")).toEqual({
    module: "core-sorted",
    source: "stdlib/core/sorted.eli",
    spec: "0175",
    specFile: "specs/0175-persistent-sorted-collections.md",
    stability: "stable",
    role: "runtime-core",
    summary: "Persistent AVL Maps and Sets with custom comparators, reversible traversal, and bounded range queries.",
    exports: [
      "comparator",
      "empty-sorted-map",
      "empty-sorted-map-by",
      "empty-sorted-set",
      "empty-sorted-set-by",
      "rsubseq",
      "sorted-map",
      "sorted-map-by",
      "sorted-map?",
      "sorted-seq",
      "sorted-seq-from",
      "sorted-set",
      "sorted-set-by",
      "sorted-set?",
      "sorted?",
      "subseq",
    ],
  });
  expect(index.modules.find(({ module }) => module === "core-lazy-sequence"))
    .toEqual({
      module: "core-lazy-sequence",
      source: "stdlib/core/lazy-sequence.eli",
      spec: "0176",
      specFile: "specs/0176-memoized-lazy-sequences.md",
      stability: "stable",
      role: "runtime-core",
      summary: "Demand-driven memoized sequences, deferred recursive tails, direct lazy transformations, and realization inspection.",
      exports: [
        "lazy-cons",
        "lazy-dedupe",
        "lazy-distinct",
        "lazy-drop",
        "lazy-drop-while",
        "lazy-filter",
        "lazy-interpose",
        "lazy-keep",
        "lazy-keep-indexed",
        "lazy-map",
        "lazy-map-indexed",
        "lazy-mapcat",
        "lazy-partition-all",
        "lazy-partition-by",
        "lazy-remove",
        "lazy-seq",
        "lazy-seq?",
        "lazy-take",
        "lazy-take-nth",
        "lazy-take-while",
        "realize",
        "realized-count",
        "realized?",
      ],
    });
  expect(index.modules.find(({ module }) => module === "persistent-vector")).toEqual({
    module: "persistent-vector",
    source: "stdlib/persistent-vector.eli",
    spec: "0053",
    specFile: "specs/0053-eliscript-persistent-vector.md",
    stability: "stable",
    role: "portable",
    summary: "Persistent 32-way vectors with tail optimization and structural sharing.",
    exports: [
      "empty-persistent-vector",
      "persistent-vector-assoc",
      "persistent-vector-conj",
      "persistent-vector-count",
      "persistent-vector-from-array",
      "persistent-vector-meta",
      "persistent-vector-nth",
      "persistent-vector-peek",
      "persistent-vector-pop",
      "persistent-vector-reduce",
      "persistent-vector-to-array",
      "persistent-vector-with-meta",
      "persistent-vector?",
    ],
  });
  expect(index.modules.find(({ module }) => module === "persistent-queue")).toEqual({
    module: "persistent-queue",
    source: "stdlib/persistent-queue.eli",
    spec: "0166",
    specFile: "specs/0166-persistent-queue.md",
    stability: "stable",
    role: "runtime-core",
    summary: "Persistent FIFO queues with shared Vector views, constant-time dequeue, and amortized constant-time enqueue.",
    exports: [
      "empty-persistent-queue",
      "persistent-queue",
      "persistent-queue-conj",
      "persistent-queue-count",
      "persistent-queue-empty?",
      "persistent-queue-meta",
      "persistent-queue-peek",
      "persistent-queue-pop",
      "persistent-queue-reduce",
      "persistent-queue-to-array",
      "persistent-queue-with-meta",
      "persistent-queue?",
    ],
  });
  expect(await readFile(path.join(ROOT, "docs/pages/api-index.json"), "utf8"))
    .toBe(renderApiJson(index));
  expect(await readFile(path.join(ROOT, "docs/pages/api.html"), "utf8"))
    .toBe(renderApiHtml(index));
});

test("library API metadata must cover the exact standard-library surface", async () => {
  const metadata = await readJson("contracts/library-api.json");
  metadata.modules.shift();
  expect(await validationErrors(metadata)).toContain(
    "library API module inventory is missing current entries: bit",
  );
});

test("library API metadata requires an explicit normalized module name", async () => {
  const metadata = await readJson("contracts/library-api.json");
  metadata.modules[0].module = " ";
  expect(await validationErrors(metadata)).toContain(
    "library API module 0 must have a non-empty trimmed module name",
  );
});

test("library API metadata must match specification stability", async () => {
  const metadata = await readJson("contracts/library-api.json");
  metadata.modules.find(({ module }) => module === "sequence")
    .stability = "accepted";
  expect(await validationErrors(metadata)).toContain(
    "sequence stability must match specification 0023 status stable",
  );
});

test("library API metadata rejects an unknown owning specification", async () => {
  const metadata = await readJson("contracts/library-api.json");
  metadata.modules.find(({ module }) => module === "persistent-vector")
    .spec = "9999";
  const errors = await validationErrors(metadata);
  expect(errors).toContain(
    "persistent-vector specification must match 0053",
  );
  expect(errors).toContain(
    "persistent-vector references unknown specification 9999",
  );
});

test("generated API page exposes deterministic search and machine-readable hooks", async () => {
  const index = await buildApiIndex({ root: ROOT });
  const html = renderApiHtml(index);
  expect(html).toContain("data-api-search");
  expect(html).toContain("data-api-module");
  expect(html).toContain('href="api-index.json"');
  expect(html).not.toContain("Generated on");

  const articles = html.match(/<article class="api-module"[\s\S]*?<\/article>/g);
  expect(articles).toHaveLength(index.moduleCount);
  const articlesByModule = new Map(articles.map((article) => [
    article.match(/<h3>(.*?)<\/h3>/)?.[1],
    article,
  ]));
  expect([...articlesByModule.keys()].sort()).toEqual(
    index.modules.map(({ module }) => escapeHtml(module)).sort(),
  );
  for (const module of index.modules) {
    const article = articlesByModule.get(escapeHtml(module.module));
    expect(article).toContain(`data-spec-link="${module.spec}"`);
    expect([...article.matchAll(/<li><code>(.*?)<\/code><\/li>/g)]
      .map((match) => match[1])).toEqual(module.exports.map(escapeHtml));
  }
});

test("API artifact check rejects missing and byte-stale generated files", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "eliscript-api-index-"));
  try {
    await expect(generateApiArtifacts({ root: ROOT, outputRoot, check: true }))
      .rejects.toThrow(
        "generated API artifacts are stale: docs/pages/api-index.json, docs/pages/api.html",
      );
    await generateApiArtifacts({ root: ROOT, outputRoot });
    await writeFile(path.join(outputRoot, "docs/pages/api.html"), "stale\n", "utf8");
    await expect(generateApiArtifacts({ root: ROOT, outputRoot, check: true }))
      .rejects.toThrow("generated API artifacts are stale: docs/pages/api.html");
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
