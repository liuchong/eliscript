import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPublicSurface,
  extractLibraryExports,
  SurfaceValidationError,
} from "../tools/surface/check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function surfaceDocument() {
  return JSON.parse(
    await readFile(path.join(ROOT, "contracts/public-surface.json"), "utf8"),
  );
}

async function validationErrors(surface) {
  try {
    await checkPublicSurface({ root: ROOT, surface });
  } catch (error) {
    expect(error).toBeInstanceOf(SurfaceValidationError);
    return error.errors;
  }
  throw new Error("expected public surface validation to fail");
}

test("repository public surface matches every tracked implementation", async () => {
  expect(await checkPublicSurface({ root: ROOT })).toEqual({
    schemaVersion: 1,
    language: { groups: 12, entries: 171 },
    ir: { nodeKinds: 57 },
    commands: { commands: 9, options: 47 },
    schemas: { total: 30 },
    adapters: { adapters: 9, exports: 32 },
    platformPackages: { packages: 2, exports: 37 },
    runtimeModules: { modules: 30, exports: 259, public: 21, internal: 9 },
    standardLibrary: { modules: 29, exports: 338 },
    emacs: {
      functions: 158,
      records: 47,
      publicRecords: 28,
      internalRecords: 19,
    },
  });
});

test("standard library export scanner accepts formatted multiline forms", () => {
  expect(extractLibraryExports(`(module example
    (defun value () 1)
    (export
      value
      other-value))`)).toEqual(["other-value", "value"]);
  expect(extractLibraryExports("(module example (export value")).toEqual([]);
});

test("public surface checker rejects IR node drift", async () => {
  const surface = await surfaceDocument();
  surface.ir.nodeKinds.shift();
  expect(await validationErrors(surface)).toContain(
    "IR node kind inventory is missing current entries: apply-call",
  );
});

test("public surface checker rejects standard library export drift", async () => {
  const surface = await surfaceDocument();
  surface.standardLibrary.find(({ module }) => module === "object")
    .exports.shift();
  expect(await validationErrors(surface)).toContain(
    "object export inventory is missing current entries: assoc",
  );
});

test("public surface checker rejects CLI option drift", async () => {
  const surface = await surfaceDocument();
  surface.commands[0].options.push("--watch");
  surface.commands[0].options.sort();
  expect(await validationErrors(surface)).toContain(
    "eliscript option inventory declares absent entries: --watch",
  );
});

test("public surface checker rejects adapter export drift", async () => {
  const surface = await surfaceDocument();
  surface.adapters.find(({ id }) => id === "vite").namedExports.shift();
  expect(await validationErrors(surface)).toContain(
    "vite export inventory is missing current entries: compileEliscript",
  );
});

test("public surface checker rejects platform classification and export drift", async () => {
  const surface = await surfaceDocument();
  const package_ = surface.platformPackages.find(
    ({ id }) => id === "browser-capabilities",
  );
  package_.host = "ambient";
  package_.stability = "accepted";
  package_.namedExports.shift();
  const errors = await validationErrors(surface);
  expect(errors).toContain(
    'browser-capabilities has invalid platform host "ambient"',
  );
  expect(errors).toContain(
    "browser-capabilities stability must match specification 0126 status stable",
  );
  expect(errors).toContain(
    "browser-capabilities export inventory is missing current entries: BrowserCapabilityError",
  );
});

test("public surface checker rejects runtime visibility and export drift", async () => {
  const surface = await surfaceDocument();
  const module = surface.runtimeModules.find(
    ({ id }) => id === "persistent-hash-map",
  );
  module.visibility = "accidental";
  module.namedExports.shift();
  const errors = await validationErrors(surface);
  expect(errors).toContain(
    'persistent-hash-map has invalid visibility "accidental"',
  );
  expect(errors).toContain(
    "persistent-hash-map export inventory is missing current entries: EMPTY_MAP",
  );
});

test("public surface checker follows aliased runtime re-exports", async () => {
  const surface = await surfaceDocument();
  const module = surface.runtimeModules.find(
    ({ id }) => id === "protocol-dispatch",
  );
  module.namedExports = module.namedExports.filter(
    (name) => name !== "defineProtocol",
  );
  expect(await validationErrors(surface)).toContain(
    "protocol-dispatch export inventory is missing current entries: defineProtocol",
  );
});

test("public surface checker rejects unclassified Emacs APIs", async () => {
  const surface = await surfaceDocument();
  surface.emacs.publicFunctions.shift();
  expect(await validationErrors(surface)).toContain(
    "Emacs public function inventory is missing current entries: eliscript-analysis-frequencies-sync",
  );
});

test("public surface checker rejects documented contradictions", async () => {
  const surface = await surfaceDocument();
  surface.documentation[0].mustNotContain = ["# Eliscript"];
  expect(await validationErrors(surface)).toContain(
    "README.md retains stale text \"# Eliscript\"",
  );
});
