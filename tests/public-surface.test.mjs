import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPublicSurface,
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
    language: { groups: 6, entries: 149 },
    ir: { nodeKinds: 51 },
    commands: { commands: 5, options: 20 },
    schemas: { total: 6 },
    adapters: { adapters: 4, exports: 17 },
    runtimeModules: { modules: 6, exports: 21, public: 3, internal: 3 },
    standardLibrary: { modules: 4, exports: 39 },
    emacs: {
      functions: 91,
      records: 22,
      publicRecords: 12,
      internalRecords: 10,
    },
  });
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
  surface.standardLibrary[1].exports.shift();
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
  surface.adapters[2].namedExports.shift();
  expect(await validationErrors(surface)).toContain(
    "vite export inventory is missing current entries: compileEliscript",
  );
});

test("public surface checker rejects runtime visibility and export drift", async () => {
  const surface = await surfaceDocument();
  surface.runtimeModules[0].visibility = "accidental";
  surface.runtimeModules[0].namedExports.shift();
  const errors = await validationErrors(surface);
  expect(errors).toContain(
    'persistent-hash-map has invalid visibility "accidental"',
  );
  expect(errors).toContain(
    "persistent-hash-map export inventory is missing current entries: EMPTY_MAP",
  );
});

test("public surface checker rejects unclassified Emacs APIs", async () => {
  const surface = await surfaceDocument();
  surface.emacs.publicFunctions.shift();
  expect(await validationErrors(surface)).toContain(
    "Emacs public function inventory is missing current entries: eliscript-analyze-module",
  );
});

test("public surface checker rejects documented contradictions", async () => {
  const surface = await surfaceDocument();
  surface.documentation[0].mustNotContain = ["# Eliscript"];
  expect(await validationErrors(surface)).toContain(
    "README.md retains stale text \"# Eliscript\"",
  );
});
