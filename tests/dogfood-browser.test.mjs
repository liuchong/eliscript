import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const PROJECT = resolve(ROOT, "examples/dogfood");

let staging;
let bundle;
let size;

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-browser-"));
  const compiled = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir", staging,
    "examples/dogfood/src/renderer/browser.eli",
  ]);
  if (compiled.exitCode !== 0) {
    throw new Error(compiled.stderr.trim() || compiled.stdout.trim());
  }
  bundle = resolve(staging, "browser.js");
  const built = await run([
    "bun", "build", resolve(staging, "src/renderer/browser.mjs"),
    "--target=browser", "--format=iife", "--outfile", bundle,
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  size = (await stat(bundle)).size;
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the browser entry bundles to one classic script", async () => {
  const source = await readFile(bundle, "utf8");
  // The shell loads it from the document head before the first paint, so it
  // must be a classic script with nothing left to resolve.
  expect(source).not.toMatch(/^\s*import\s/mu);
  expect(source).not.toContain("eliscript/");
  expect(source).toContain("data-theme");
  expect(source).toContain("dogfood-search-index");
  expect(source.startsWith("(")).toBe(true);
});

test("the bundle stays free of the portable collection runtime", async () => {
  const source = await readFile(bundle, "utf8");
  // The search index arrives as JSON, so native arrays are enough; importing
  // the text facade would pull the whole protocol stack in behind it.
  expect(source).not.toContain("literals.mjs");
  expect(source).not.toContain("HAMT");
  expect(size).toBeLessThan(64 * 1024);
});

test("the shell emits the search configuration and the theme control", async () => {
  // The rendered result is covered by the site suite; this reads the contract
  // from the renderer source that emits it.
  const theme = await readFile(resolve(PROJECT, "src/renderer/theme.eli"), "utf8");
  expect(theme).toContain('name=\\"dogfood-search-index\\"');
  expect(theme).toContain('name=\\"dogfood-root\\"');
  expect(theme).toContain('id=\\"theme-toggle\\"');
  expect(theme).toContain('<script src=\\"" root "assets/browser.js\\">');
  // System default, explicit override, and no flash: the head script runs
  // before paint and the stylesheet allows both states.
  expect(theme).toContain(":root:not([data-theme=light])");
  expect(theme).toContain(":root[data-theme=dark]");
});

test("the search page declares its island and a no-script fallback", async () => {
  const server = await readFile(resolve(PROJECT, "src/renderer/server.eli"), "utf8");
  expect(server).toContain('id=\\"search-input\\"');
  expect(server).toContain('id=\\"search-results\\"');
  expect(server).toContain("<noscript>");
  expect(server).toContain("render-search-page");
});

test("the site build requires the browser asset instead of shipping a broken page", async () => {
  const builder = await readFile(resolve(PROJECT, "src/builder/main.eli"), "utf8");
  expect(builder).toContain("DOGFOOD-BUILD-003");
  expect(builder).toContain("browser-bundle");
  // The asset participates in the content fingerprint, so a change to it is a
  // change to the published site.
  expect(builder).toContain(':path "assets/browser.js"');
});

test("the browser module reaches the host through explicit boundaries", async () => {
  const source = await readFile(
    resolve(PROJECT, "src/renderer/browser.eli"), "utf8",
  );
  // Capability grants are explicit, and storage, which specification 0126 does
  // not cover, is an annotated interop boundary rather than an ambient read.
  expect(source).toContain('browserCapabilities (js* "globalThis")');
  expect(source).toContain('(js-array "document" "network" "timers")');
  expect(source).toContain("localStorage");
});
