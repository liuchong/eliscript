import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";

import { PUBLISHED_TREES, assemblePages } from "../tools/pages/assemble.mjs";

const ROOT = resolve(import.meta.dir, "..");
const SITE_PAGE = "pages/playground.html";

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
  expect(await exists("index.html")).toBe(true);
  expect(await exists("pages/playground.html")).toBe(true);
  // The proving-ground site is part of the published tree, with the assets its
  // pages load.
  expect(await exists("examples/dogfood/_site/index.html")).toBe(true);
  expect(await exists("examples/dogfood/_site/assets/browser.js")).toBe(true);
});

test("the published root is the documentation site", async () => {
  const index = await readFile(resolve(artifact, "index.html"), "utf8");
  expect(index).toContain("<!doctype html>");
  // The site's own pages moved with it, so its relative links still resolve.
  expect(index).toContain("pages/");
  expect(await exists("pages/api.html")).toBe(true);
  expect(await exists("pages/language.html")).toBe(true);
  // A page that reached the repository root has been rebased, and no reference
  // is left pointing one level above the site.
  for (const page of ["pages/playground.html", "pages/language.html"]) {
    const source = await readFile(resolve(artifact, page), "utf8");
    expect(source).not.toContain('src="../../');
    expect(source).not.toContain('href="../../');
  }
});

test("every local reference in every published page resolves", async () => {
  const { readdir } = await import("node:fs/promises");
  const pages = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".html")) pages.push(path);
    }
  }
  await walk(artifact);
  expect(pages.length).toBeGreaterThan(5);
  // Collect rather than fail on the first: the useful output is the list.
  const unresolved = [];
  for (const path of pages) {
    const source = await readFile(path, "utf8");
    const directory = posix.dirname(path.replace(`${artifact}/`, ""));
    for (const [, reference] of source.matchAll(/(?:href|src)="([^"]+)"/gu)) {
      if (/^[a-z]+:/iu.test(reference) || reference.startsWith("#")) continue;
      // A fragment names a place inside the target document, and a query
      // string is a cache stamp rather than part of the file name.
      const [withoutFragment] = reference.split("#");
      const [path_] = withoutFragment.split("?");
      if (path_ === "") continue;
      const target = path_.startsWith("/")
        ? path_.slice(1)
        : posix.normalize(posix.join(directory, path_));
      const candidate = target.endsWith("/") ? `${target}index.html` : target;
      if (!(await exists(candidate))) {
        unresolved.push(`${posix.dirname(path.replace(`${artifact}/`, ""))} -> ${reference}`);
      }
    }
  }
  expect(unresolved).toEqual([]);
});

test("every reference the playground page carries resolves in the artifact", async () => {
  const page = await readFile(resolve(artifact, SITE_PAGE), "utf8");

  // The import map maps `eliscript/` one level above the page, which is the
  // published root: the documentation site *is* the artifact root.
  const importMap = JSON.parse(
    page.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/u)[1],
  );
  const prefix = importMap.imports["eliscript/"];
  expect(prefix).toBe("../");
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
  expect(page).toContain("../dist/browser-playground/playground.mjs");
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
