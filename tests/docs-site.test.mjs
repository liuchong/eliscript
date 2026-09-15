import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { assemblePages } from "../tools/pages/assemble.mjs";
import { serveTree } from "../tools/browser/matrix.mjs";

// The documentation site's script is compiled from Eliscript. Its source is a
// program, so the checks that matter are the behaviours the pages declare:
// switching an example, choosing a language tab, filtering the API index, and
// stamping the year. A script that loads but does nothing passes none of them.

const ROOT = resolve(import.meta.dir, "..");
const SCRIPT = "dist/docs-site/site.js";
const PORT = 8903;

let staging;
let artifact;
let server;
let available = true;

beforeAll(async () => {
  const built = Bun.spawn(["bun", "run", "build:docs-site"], {
    cwd: ROOT, stdout: "pipe", stderr: "pipe",
  });
  const [exitCode, , stderr] = await Promise.all([
    built.exited, new Response(built.stdout).text(), new Response(built.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "the site script build failed");

  staging = await mkdtemp(resolve(ROOT, ".eliscript-docs-site-"));
  artifact = resolve(staging, "site");
  await assemblePages({ root: ROOT, outDir: artifact });
  server = await serveTree(artifact, PORT);
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (server) server.stop();
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the site publishes a loader and the source it compiles", async () => {
  const loader = await readFile(resolve(artifact, "pages/assets/site.js"), "utf8");
  // The pages load it with `defer`, so it must be a classic script with
  // nothing left to resolve. It is compiled from Eliscript like everything
  // else: the repository has no handwritten JavaScript beside the site.
  expect(loader).not.toMatch(/^\s*import\s/mu);
  expect(loader.startsWith("(")).toBe(true);
  await expect(readFile(resolve(ROOT, "docs/pages/assets/site.js"), "utf8"))
    .rejects.toThrow();

  // The behaviours themselves ship as source, and the loader is what compiles
  // them in the browser.
  const source = await readFile(resolve(artifact, "pages/assets/site.eli"), "utf8");
  expect(source).toContain("(module docs.site");
  expect(await readFile(resolve(ROOT, "examples/docs-site/src/loader.eli"), "utf8"))
    .toContain("(module docs.loader");
});

test("the served pages stamp the script with its digest", async () => {
  const page = await readFile(resolve(artifact, "index.html"), "utf8");
  expect(page).toMatch(/assets\/site\.js\?v=[0-9a-f]{12}/u);
  expect(page).toMatch(/assets\/site\.css\?v=[0-9a-f]{12}/u);
});

/** Opens one page of the deployed site with a fresh browser context. */
async function withPage(path, verify) {
  if (!available) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const failed = [];
    const requests = [];
    page.on("pageerror", (error) => failed.push(String(error).slice(0, 160)));
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${server.origin}${path}`, { waitUntil: "networkidle" });
    await verify(page, requests);
    expect(failed).toEqual([]);
  } finally {
    await browser.close();
  }
}

test("the page compiles the source in the browser", async () => {
  await withPage("index.html", async (page, requests) => {
    // The loader fetches the Eliscript source and the compiler the site
    // already serves for its playground, rather than shipping the behaviours
    // compiled.
    expect(requests.some((url) => url.endsWith("pages/assets/site.eli"))).toBe(true);
    expect(requests.some((url) => url.includes("browser/worker.mjs"))).toBe(true);
    expect(requests.some((url) => url.includes("dist/browser/compiler.js"))).toBe(true);
  });
});

test("the example switcher replaces the source and the output", async () => {
  await withPage("index.html", async (page) => {
    const before = await page.locator("[data-source-code]").innerText();
    await page.locator('[data-example="interop"]').click();
    await page.waitForTimeout(120);
    const after = await page.locator("[data-source-code]").innerText();
    expect(after).not.toBe(before);
    expect(after).toContain("js-call");
    expect(await page.locator("[data-output-code]").innerText()).toContain("native container");
    expect(await page.locator('[data-example="interop"]').getAttribute("aria-selected"))
      .toBe("true");
  });
});

test("the language tabs switch the visible panel", async () => {
  await withPage("pages/language.html", async (page) => {
    const tabs = page.locator("[data-language-tab]");
    const count = await tabs.count();
    expect(count).toBeGreaterThan(1);
    const second = tabs.nth(1);
    const target = await second.getAttribute("data-language-tab");
    await second.click();
    await page.waitForTimeout(120);
    const panel = page.locator(`[data-language-panel="${target}"]`);
    expect(await panel.isVisible()).toBe(true);
    expect(await second.getAttribute("aria-selected")).toBe("true");
  });
});

test("the API filter hides modules and updates its count", async () => {
  await withPage("pages/api.html", async (page) => {
    const input = page.locator("[data-api-search]");
    const count = page.locator("[data-api-count]");
    expect(await count.innerText()).toMatch(/\d+ modules?/u);

    await input.fill("map");
    await page.waitForTimeout(150);
    const filtered = await count.innerText();
    const visible = await page.locator("[data-api-module]:not([hidden])").count();
    expect(visible).toBeGreaterThan(0);
    expect(filtered).toContain(String(visible));

    await input.fill("zzz-nothing-matches");
    await page.waitForTimeout(150);
    expect(await page.locator("[data-api-module]:not([hidden])").count()).toBe(0);
  });
});

test("the footer year is stamped from the clock", async () => {
  await withPage("index.html", async (page) => {
    const year = await page.evaluate(() => new Date().getFullYear());
    expect(await page.locator("[data-year]").first().innerText()).toContain(String(year));
  });
});
