import { expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  BrowserCompileError,
  compileProject,
  compileSource,
  dependencyOrder,
  dirname,
  moduleGraphUrls,
  normalizePath,
  outputPathFor,
  relativePath,
  resolvePath,
} from "../browser/host.mjs";

const ROOT = resolve(import.meta.dir, "..");
const RUNTIME_BASE = "http://127.0.0.1:8787/";
const resolveExternal = (specifier) =>
  specifier.startsWith("eliscript/")
    ? new URL(specifier.slice("eliscript/".length), RUNTIME_BASE).href
    : undefined;

const PROJECT = {
  "main.eli": `(module app.main
  (import "./lib/math.eli" map-square)
  (import "eliscript/runtime/core/order.mjs" sort)
  (print "squares" (sort (map-square [3 1 2]))))`,
  "lib/math.eli": `(module app.lib.math
  (import "eliscript/runtime/core/sequence.mjs" map)
  (export map-square)
  (defun map-square (values) (map (lambda (v) (* v v)) values)))`,
};

/* -------------------------------------------------------------- path rules */

test("virtual paths normalize and resolve like a project tree", () => {
  expect(normalizePath("a/./b/../c.eli")).toBe("a/c.eli");
  expect(() => normalizePath("../outside.eli")).toThrow(/escapes the project root/);
  expect(dirname("lib/deep/text.eli")).toBe("lib/deep");
  expect(dirname("main.eli")).toBe("");
  expect(resolvePath("lib/deep/text.eli", "../shared/value.eli")).toBe("lib/shared/value.eli");
  expect(outputPathFor("lib/text.eli")).toBe("lib/text.mjs");
  expect(() => outputPathFor("lib/text.mjs")).toThrow(/must end with .eli/);
  expect(relativePath("a/main.mjs", "a/lib/text.mjs")).toBe("./lib/text.mjs");
  expect(relativePath("a/b/main.mjs", "a/lib/text.mjs")).toBe("../lib/text.mjs");
});

test("modules execute after their dependencies", () => {
  const order = dependencyOrder([
    { id: "a", dependencies: ["b"] },
    { id: "b", dependencies: ["c"] },
    { id: "c", dependencies: [] },
  ]);
  expect(order).toEqual(["c", "b", "a"]);
  expect(() => dependencyOrder([
    { id: "a", dependencies: ["b"] },
    { id: "b", dependencies: ["a"] },
  ])).toThrow(/import cycle/);
});

/* ----------------------------------------------------------------- compile */

test("single-module compilation resolves the runtime without an import map", () => {
  const result = compileSource(
    '(module m (import "eliscript/runtime/core/order.mjs" sort) (print (sort [2 1])))',
    "m.eli",
    { resolveExternal },
  );
  expect(result.javascript).toContain(`from "${RUNTIME_BASE}runtime/core/order.mjs"`);
  expect(result.javascript).not.toContain("eliscript/runtime/");
  expect(typeof result.sourceMap).toBe("string");
});

test("an unclaimed external specifier is left for an import map", () => {
  const result = compileSource(
    '(module m (import "some-package" thing) (print thing))',
    "m.eli",
    { resolveExternal },
  );
  expect(result.javascript).toContain('from "some-package"');
});

test("a project compiles in dependency order with rewritten local imports", () => {
  const { plan, modules } = compileProject({
    files: PROJECT,
    entry: "main.eli",
    resolveExternal,
  });
  expect(plan.entries).toEqual(["main.eli"]);
  expect(Object.keys(modules)).toEqual(["lib/math.mjs", "main.mjs"]);
  expect(modules["main.mjs"].javascript).toContain('from "./lib/math.mjs"');
  // The runtime is a URL, so the module can run from a blob.
  expect(modules["main.mjs"].javascript).toContain(`${RUNTIME_BASE}runtime/core/order.mjs`);
  expect(modules["lib/math.mjs"].javascript).toContain(`${RUNTIME_BASE}runtime/core/sequence.mjs`);
  // The source map names its source relative to the map beside it.
  const map = JSON.parse(modules["lib/math.mjs"].sourceMap);
  expect(map.sources).toEqual(["math.eli"]);
});

test("a project failure is reported as a structured diagnostic", () => {
  const error = (() => {
    try {
      compileProject({ files: { "main.eli": "(module m (print missing-binding))" }, entry: "main.eli" });
      return null;
    } catch (thrown) {
      return thrown;
    }
  })();
  expect(error).toBeInstanceOf(BrowserCompileError);
  expect(error.diagnostics[0].code).toMatch(/^ELI-/u);
  expect(error.diagnostics[0].location.file).toBe("main.eli");
});

test("a missing entry or import fails with its own code", () => {
  const missingEntry = (() => {
    try { compileProject({ files: {}, entry: "main.eli" }); return null; } catch (e) { return e; }
  })();
  expect(missingEntry.diagnostics[0].code).toBe("ELI-BROWSER-0002");

  const missingImport = (() => {
    try {
      compileProject({
        files: { "main.eli": '(module m (import "./absent.eli" thing))' },
        entry: "main.eli",
      });
      return null;
    } catch (e) { return e; }
  })();
  expect(missingImport.diagnostics[0].code).toBe("ELI-BROWSER-0003");
});

/* ----------------------------------------------------------------- execute */

test("compiled modules become an importable blob graph", async () => {
  const { modules } = compileProject({ files: PROJECT, entry: "main.eli", resolveExternal });
  const graph = moduleGraphUrls(modules, "main.eli");
  try {
    expect(graph.entryUrl.startsWith("blob:")).toBe(true);
    expect(Object.keys(graph.urls)).toEqual(["lib/math.mjs", "main.mjs"]);
    // The importer no longer points at a relative path or at the runtime
    // specifier: one is a blob URL, the other a served URL.
    const main = await (await fetch(graph.urls["main.mjs"])).text();
    expect(main).toContain(graph.urls["lib/math.mjs"]);
    expect(main).not.toContain("./lib/math.mjs");
  } finally {
    graph.release();
  }
});

test("the host stays importable without a document", async () => {
  // A worker has no document and no import map, so the host and the compiler
  // bundle it loads must use relative imports only.
  const source = await Bun.file(resolve(ROOT, "browser/host.mjs")).text();
  for (const match of source.matchAll(/from\s+"([^"]+)"/gu)) {
    expect(match[1].startsWith(".")).toBe(true);
  }
  const worker = await Bun.file(resolve(ROOT, "browser/worker.mjs")).text();
  for (const match of worker.matchAll(/from\s+"([^"]+)"/gu)) {
    expect(match[1].startsWith(".")).toBe(true);
  }
});
