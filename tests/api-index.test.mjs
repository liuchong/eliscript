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
  expect(index.moduleCount).toBe(31);
  expect(index.exportCount).toBe(356);
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
