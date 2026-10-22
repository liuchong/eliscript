import { expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  BrowserCompileError,
  compileProject,
  compileSource,
  dependencyOrder,
  dirname,
  moduleGraphUrls,
  mountEliscriptScripts,
  normalizePath,
  optimizeJavaScript,
  optimizeProgramIr,
  outputPathFor,
  relativePath,
  resolvePath,
  runSource,
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

test("runSource compiles and executes an in-memory Eliscript module via a Blob URL", async () => {
  const result = await runSource(
    "(module live.demo (defun double (x) (* x 2)) (export double))",
    "live-demo.eli",
  );
  expect(typeof result.javascript).toBe("string");
  expect(typeof result.sourceMap).toBe("string");
  expect(result.module.double(21)).toBe(42);
});

test("mountEliscriptScripts compiles and executes inline and external text/eliscript scripts in order", async () => {
  const inlineScript = {
    src: "",
    textContent: "(module inline.demo (defun greet () \"inline-ok\") (export greet))",
    dataset: {},
    getAttribute(name) {
      return name === "data-filename" ? "inline-demo.eli" : null;
    },
  };
  const externalScript = {
    src: "https://example.test/scripts/remote.eli",
    textContent: "",
    dataset: {},
    getAttribute() {
      return null;
    },
  };
  const root = {
    querySelectorAll(selector) {
      expect(selector).toBe('script[type="text/eliscript"]');
      return [inlineScript, externalScript];
    },
  };
  const mounted = await mountEliscriptScripts(root, {
    async fetch(url) {
      expect(url).toBe("https://example.test/scripts/remote.eli");
      return {
        ok: true,
        status: 200,
        async text() {
          return "(module remote.demo (defun compute () (+ 40 2)) (export compute))";
        },
      };
    },
  });
  expect(mounted.length).toBe(2);
  expect(mounted[0].filename).toBe("inline-demo.eli");
  expect(mounted[0].module.greet()).toBe("inline-ok");
  expect(inlineScript.dataset.eliscriptMounted).toBe("true");
  expect(mounted[1].filename).toBe("remote.eli");
  expect(mounted[1].module.compute()).toBe(42);
  expect(externalScript.dataset.eliscriptMounted).toBe("true");

  // Re-running mountEliscriptScripts skips already mounted script tags.
  const secondPass = await mountEliscriptScripts(root);
  expect(secondPass).toEqual([]);
});

test("optimizeProgramIr folds constant expressions and eliminates dead conditional branches", () => {
  const optimized = compileSource(
    '(module opt.demo (defun calc () (if t (+ 20 22) (throw "dead"))) (export calc))',
    "opt-demo.eli",
  );
  expect(optimized.javascript).toContain("42");
  expect(optimized.javascript).not.toContain("dead");

  const unoptimized = compileSource(
    '(module opt.demo (defun calc () (if t (+ 20 22) (throw "dead"))) (export calc))',
    "opt-demo.eli",
    { optimize: false },
  );
  expect(unoptimized.javascript).toContain("dead");
  expect(typeof optimizeProgramIr).toBe("function");
});

test("optimizeProgramIr propagates immutable let and defconst constants and folds comparisons, predicates, and algebraic identities", async () => {
  const source = `(module opt.advanced
    (defconst base-factor 6)
    (defun compute (x)
      (let ((step (+ base-factor 1))
            (enabled (and (< 2 3) (not (nil? :ready)))))
        (if enabled
          (+ (* x 1) (* base-factor step) 0)
          (throw "unreachable-branch"))))
    (export compute))`;
  const compiled = compileSource(source, "opt-advanced.eli");
  expect(compiled.javascript).toContain("42");
  expect(compiled.javascript).not.toContain("unreachable-branch");

  const executed = await runSource(source, "opt-advanced.eli");
  expect(executed.module.compute(8)).toBe(50);
});

test("optimizeJavaScript and compileSource minify option strip comments and compact whitespace while preserving string literals", async () => {
  const sample = `// leading comment\nexport const greeting = "hello // not a comment /* either */";\n/* block comment */\nexport const answer = 40 + 2;\n`;
  const compacted = optimizeJavaScript(sample);
  expect(compacted).not.toContain("leading comment");
  expect(compacted).not.toContain("block comment");
  expect(compacted).toContain('"hello // not a comment /* either */"');
  expect(compacted).toContain("export const answer=40+2;");
  expect(compacted.length).toBeLessThan(sample.length);

  const executed = await runSource(
    '(module compact.demo (defun message () (str "url: https://example.test/a//b " (+ 19 23))) (export message))',
    "compact-demo.eli",
    { minify: true },
  );
  expect(executed.module.message()).toBe("url: https://example.test/a//b 42");
});

test("compileSource and compileProject support an external or custom closureCompiler hook", () => {
  const calls = [];
  const closureCompiler = (javascript, meta) => {
    calls.push(meta.filename);
    return `${ optimizeJavaScript(javascript) }// closure-optimized:${meta.filename}\n`;
  };
  const single = compileSource(
    "(module hook.demo (defun value () (+ 20 22)) (export value))",
    "hook-demo.eli",
    { closureCompiler },
  );
  expect(calls).toEqual(["hook-demo.eli"]);
  expect(single.javascript).toContain("// closure-optimized:hook-demo.eli");

  const project = compileProject({
    files: {
      "main.eli": '(module p.main (import "./sub.eli" v) (export v))',
      "sub.eli": "(module p.sub (defconst v (+ 10 32)) (export v))",
    },
    entry: "main.eli",
    closureCompiler,
  });
  expect(project.modules["sub.mjs"].javascript).toContain("// closure-optimized:sub.eli");
  expect(project.modules["main.mjs"].javascript).toContain("// closure-optimized:main.eli");
});

test("compileSource and runSource support both extensionless and .mjs eliscript package imports", async () => {
  const withoutExtension = compileSource(
    '(module ext.demo (import "eliscript/runtime/core/order" sort) (import "eliscript/runtime/core/sequence" map) (export sort map))',
    "ext-demo.eli",
    { resolveExternal },
  );
  expect(withoutExtension.javascript).toContain(`from "${RUNTIME_BASE}runtime/core/order.mjs"`);
  expect(withoutExtension.javascript).toContain(`from "${RUNTIME_BASE}runtime/core/sequence.mjs"`);

  const executed = await runSource(
    '(module ext.run (import "eliscript/runtime/core/order" sort) (defun ordered () (sort [3 1 2])) (export ordered))',
    "ext-run.eli",
  );
  expect([...executed.module.ordered()]).toEqual([1, 2, 3]);
});


