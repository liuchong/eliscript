import { expect, test } from "bun:test";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const manifest = JSON.parse(
  await readFile(resolve(ROOT, "package.json"), "utf8"),
);

const COMMANDS = [
  "eliscript",
  "eliscript-build",
  "eliscript-check",
  "eliscript-format",
  "eliscript-eval",
  "eliscript-watch",
];

test("the package declares one executable entry for every command", async () => {
  expect(Object.keys(manifest.bin)).toEqual(COMMANDS);

  const target = resolve(ROOT, manifest.bin.eliscript);
  const source = await readFile(target, "utf8");
  // npm links the same file under every command name and the entry dispatches
  // on the invoked name, so each name must appear in the table.
  expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
  expect((await stat(target)).mode & 0o111).toBeGreaterThan(0);
  for (const command of COMMANDS) {
    expect(manifest.bin[command]).toBe("bin/eliscript-cli.mjs");
    expect(source).toContain(`"${command}":`);
  }
});

test("every exported entry resolves inside the package", async () => {
  for (const [specifier, target] of Object.entries(manifest.exports)) {
    if (specifier.includes("*")) continue;
    expect(target.startsWith("./")).toBe(true);
    await access(resolve(ROOT, target));
  }
  // The compiler is the entry a browser and an npm consumer both use, so it
  // must be addressable without naming a build path.
  expect(manifest.exports["./compiler"]).toBe("./dist/bootstrap/compiler.mjs");
});

test("the published file list carries the compiler and the runtime", async () => {
  for (const entry of [
    "bin/",
    "bootstrap/",
    "compiler/",
    "dist/bootstrap/",
    "editor/",
    "platform/",
    "runtime/",
    "stdlib/",
  ]) {
    expect(manifest.files).toContain(entry);
  }
  // A consumer needs no Emacs or Bun to run the published compiler, so the
  // generated compiler must be part of the tarball.
  await access(resolve(ROOT, "dist/bootstrap/compiler.mjs"));
});

test("the package keeps development trees out of the tarball", () => {
  for (const excluded of [
    "acceptance/",
    "docs/",
    "examples/",
    "node_modules/",
    "specs/",
    "tests/",
    "tools/",
  ]) {
    expect(manifest.files).not.toContain(excluded);
  }
});

test("the release metadata is present and the release latch is set", () => {
  expect(manifest.version).toBe("0.0.1");
  expect(manifest.description).toBeString();
  expect(manifest.repository.url).toContain("github.com/liuchong/eliscript");
  expect(manifest.license).toBe("GPL-3.0-or-later");
  expect(manifest.engines.node).toBeString();
  expect(manifest.publishConfig.access).toBe("public");
  // Nothing may publish by accident: flipping this flag is the release step.
  expect(manifest.private).toBe(true);
});
