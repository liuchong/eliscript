import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";

import { PUBLISHED_TREES, assemblePages } from "../tools/pages/assemble.mjs";

const ROOT = resolve(import.meta.dir, "..");
const SITE_PAGE = "docs/pages/playground.html";

let staging;
let artifact;

// The proving-ground site is generated rather than checked in, so the test
// produces it when it is absent instead of depending on a previous run.
async function ensureDemoSite() {
  try {
    await stat(resolve(ROOT, "examples/dogfood/_site/index.html"));
    return;
  } catch {
    // Build it below.
  }
  const child = Bun.spawn(["bun", "run", "dogfood"], {
    cwd: ROOT, stdout: "pipe", stderr: "pipe",
  });
  const [exitCode, , stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "the demo site build failed");
}

beforeAll(async () => {
  await ensureDemoSite();
  staging = await mkdtemp(resolve(ROOT, ".eliscript-pages-"));
  artifact = resolve(staging, "pages");
  await assemblePages({ root: ROOT, outDir: artifact });
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

async function exists(path) {
  try {
    await stat(resolve(artifact, path));
    return true;
  } catch {
    return false;
  }
}

test("the artifact carries the site and every tree it loads", async () => {
  for (const tree of [...PUBLISHED_TREES, "LICENSE"]) {
    expect(await exists(tree)).toBe(true);
  }
  // The site's own entry cannot move: the published root keeps the repository
  // shape so the playground's relative references stay valid.
  expect(await exists("docs/index.html")).toBe(true);
  expect(await exists("docs/pages/playground.html")).toBe(true);
  // The proving-ground site is part of the published tree, with the assets its
  // pages load.
  expect(await exists("examples/dogfood/_site/index.html")).toBe(true);
  expect(await exists("examples/dogfood/_site/assets/browser.js")).toBe(true);
});

test("the published root answers instead of 404", async () => {
  // The artifact keeps the repository shape, and the repository has no root
  // index, so the assembler writes one.
  const landing = await readFile(resolve(artifact, "index.html"), "utf8");
  expect(landing).toContain("<!doctype html>");
  // Every link it offers must resolve inside the artifact, or point outward.
  for (const [, href] of landing.matchAll(/href="([^"]+)"/gu)) {
    if (/^https?:/u.test(href)) continue;
    expect(await exists(href.replace(/\/$/u, "/index.html"))).toBe(true);
  }
});

test("every reference the playground page carries resolves in the artifact", async () => {
  const page = await readFile(resolve(artifact, SITE_PAGE), "utf8");

  // The import map maps `eliscript/` two levels above the page, so that
  // directory must be the published root.
  const importMap = JSON.parse(
    page.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/u)[1],
  );
  const prefix = importMap.imports["eliscript/"];
  expect(prefix).toBe("../../");
  // The page sits two levels below the published root, so the prefix lands on
  // that root, which is where the package trees are.
  const base = posix.resolve("/", posix.dirname(SITE_PAGE), prefix);
  expect(base).toBe("/");

  // The bare specifiers this page's own module graph uses.
  for (const specifier of ["platform/browser.mjs", "runtime/core/data-text.mjs"]) {
    expect(await exists(specifier)).toBe(true);
  }

  // The worker, its host, and the bundle the host loads.
  expect(await exists("browser/worker.mjs")).toBe(true);
  expect(await exists("browser/host.mjs")).toBe(true);
  expect(await exists("dist/browser/compiler.js")).toBe(true);
  const host = await readFile(resolve(artifact, "browser/host.mjs"), "utf8");
  const compilerImport = host.match(/from\s+"([^"]+)"/gu)
    .map((match) => match.replace(/from\s+"|"/gu, ""))
    .find((specifier) => specifier.includes("compiler"));
  expect(await exists(posix.join("browser", compilerImport))).toBe(true);

  // The compiled playground application the page imports at run time.
  expect(page).toContain("../../dist/browser-playground/playground.mjs");
  expect(await exists("dist/browser-playground/playground.mjs")).toBe(true);
  expect(await exists("dist/browser-playground/highlight.mjs")).toBe(true);
});

test("the compiled playground loads its runtime from the published root", async () => {
  const app = await readFile(resolve(artifact, "dist/browser-playground/playground.mjs"), "utf8");
  // The application resolves the package root two levels above itself, which
  // lands on the published root, and hands that base to the worker so compiled
  // code can import the runtime without an import map.
  expect(app).toContain("new URL('../../', import.meta.url)");
  expect(app).toContain("browser/worker.mjs");
  expect(await exists("runtime/core/data-text.mjs")).toBe(true);
  expect(await exists("runtime/core/sequence.mjs")).toBe(true);
  expect(await exists("runtime/literals.mjs")).toBe(true);
});

test("the assembler refuses to write into its own source tree", async () => {
  await expect(assemblePages({ root: ROOT, outDir: ROOT }))
    .rejects.toThrow(/refusing to assemble into the source tree/u);
});
