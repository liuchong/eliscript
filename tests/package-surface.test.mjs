import { beforeAll, expect, test } from "bun:test";
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

// Exercise the same build as npm packaging before checking published paths.
// A clean CI checkout must not depend on browser assets from earlier suites.
beforeAll(async () => {
  const child = Bun.spawn(["bun", "run", "prepack"], {
    cwd: ROOT, stdout: "pipe", stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim());
}, 30_000);

test("the package declares one executable entry for every command", async () => {
  expect(Object.keys(manifest.bin)).toEqual(COMMANDS);

  const target = resolve(ROOT, manifest.bin.eliscript);
  const source = await readFile(target, "utf8");
  // npm links the same file under every command name and the entry dispatches
  // on the invoked name, so each name must appear in the table. The entry is a
  // host, not a bin wrapper, because it reads the process environment.
  expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
  expect((await stat(target)).mode & 0o111).toBeGreaterThan(0);
  for (const command of COMMANDS) {
    expect(manifest.bin[command]).toBe("bootstrap/host/eliscript-cli.mjs");
    expect(source).toContain(`"${command}":`);
  }
});

test("every exported entry resolves inside the package", async () => {
  for (const [specifier, target] of Object.entries(manifest.exports)) {
    if (specifier.includes("*")) continue;
    expect(target.startsWith("./")).toBe(true);
    await access(resolve(ROOT, target));
  }
  // The compiler is the entry an npm consumer uses, so it must be addressable
  // without naming a build path, and the browser host is a second public entry.
  expect(manifest.exports["./compiler"]).toBe("./dist/bootstrap/compiler.mjs");
  expect(manifest.exports["./browser"]).toBe("./browser/host.mjs");
  expect(manifest.exports["./browser/worker.mjs"]).toBe("./browser/worker.mjs");
  expect(manifest.exports["./browser/compiler"]).toBe("./dist/browser/compiler.js");
});

test("the published file list carries the browser host", async () => {
  for (const entry of ["browser/", "dist/browser/"]) {
    expect(manifest.files).toContain(entry);
  }
  await access(resolve(ROOT, "browser/host.mjs"));
  await access(resolve(ROOT, "browser/worker.mjs"));
});

test("the browser bundle is one file and needs no Node built-in", async () => {
  const child = Bun.spawn([
    "bun", "build", "dist/bootstrap/compiler.mjs",
    "--target=browser", "--format=esm", "--outfile", "dist/browser/compiler.js",
  ], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(exitCode.toString(), stderr).toBe("0");

  const bundle = await readFile(resolve(ROOT, "dist/browser/compiler.js"), "utf8");
  // One self-contained file: no Node built-in import and nothing left to
  // resolve. The compiler's own diagnostics mention "node:" as prose, so the
  // check is about imports, not about the substring.
  expect(bundle).not.toMatch(/from\s+"node:/u);
  expect(bundle).not.toMatch(/import\s+"node:/u);
  expect(bundle).not.toContain("require(");
  for (const match of bundle.matchAll(/^\s*import\s/gmu)) expect(match).toBeNull();
  expect(bundle.length).toBeGreaterThan(100_000);
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

test("the released package keeps its metadata and manual publication gates", async () => {
  expect(manifest.version).toBe("0.0.1");
  expect(manifest.description).toBeString();
  expect(manifest.repository.url).toContain("github.com/liuchong/eliscript");
  expect(manifest.license).toBe("GPL-3.0-or-later");
  expect(manifest.engines.node).toBeString();
  expect(manifest.publishConfig.access).toBe("public");
  // 0.0.1 deliberately removed the development latch. Publication is now
  // guarded by manual dispatch, a signed release tag, and reviewed tarball bytes.
  expect(Object.hasOwn(manifest, "private")).toBe(false);
  expect(manifest.publishConfig.registry).toBe("https://registry.npmjs.org/");
  const workflow = await readFile(resolve(ROOT, ".github/workflows/release.yml"), "utf8");
  const triggers = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
  expect(triggers).toContain("workflow_dispatch:");
  expect(triggers).not.toMatch(/^  (?:push|pull_request|schedule|workflow_run):/mu);
  expect(triggers).toMatch(/publish:[\s\S]*default: false/u);
  expect(workflow).toContain(".verification.verified");
  expect(workflow).toContain("grep -qx true");
  expect(workflow).toContain('if [ "$packed" != "$VERSION" ]');
  expect(workflow).toContain("if: ${{ !inputs.publish }}");
  expect(workflow).toContain('npm stage publish "eliscript-$VERSION.tgz"');
  expect(workflow).toContain("if: ${{ inputs.publish }}");
  expect(workflow).toContain('npm publish "eliscript-$VERSION.tgz"');
});
