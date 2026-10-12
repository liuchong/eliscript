import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { assemblePages } from "../tools/pages/assemble.mjs";
import { buildPagesInputs } from "./helpers/pages-build.mjs";
import { serveTree } from "../tools/browser/matrix.mjs";

// Resolving a page's references proves where a link points; it does not prove
// that the page works. This test drives the assembled tree the way a reader
// does, because a reference that resolves can still be resolved to the wrong
// place: the playground once reached one level above the deployment root and
// reported its own entry as unbuilt.

const ROOT = resolve(import.meta.dir, "..");
const PORT = 8902;

let staging;
let artifact;
let server;
let available = true;

async function browserAvailable() {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await buildPagesInputs();

  staging = await mkdtemp(resolve(ROOT, ".eliscript-pages-runtime-"));
  artifact = resolve(staging, "site");
  await assemblePages({ root: ROOT, outDir: artifact });
  server = await serveTree(artifact, PORT);
  available = await browserAvailable();
});

afterAll(async () => {
  if (server) server.stop();
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the deployed playground compiles and runs in a real browser", async () => {
  if (!available) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const failed = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    page.on("pageerror", (error) => failed.push(String(error).slice(0, 160)));

    await page.goto(`${server.origin}pages/playground.html`, { waitUntil: "networkidle" });
    await page.locator("#run").click();
    // The page reports through `#stdout` and `#diagnostics` rather than one
    // output element, so a failure is visible instead of silent.
    await page.waitForFunction(
      () => {
        const stdout = document.querySelector("#stdout");
        const diagnostics = document.querySelector("#diagnostics");
        return (stdout?.textContent.trim().length ?? 0) > 0 ||
          (diagnostics?.textContent.trim().length ?? 0) > 0;
      },
      { timeout: 20000 },
    ).catch(() => {});

    const output = await page.evaluate(() => ({
      stdout: document.querySelector("#stdout")?.textContent.trim() ?? "",
      diagnostics: document.querySelector("#diagnostics")?.textContent.trim() ?? "",
    }));

    // Nothing may fail to load, and the page must produce a result rather than
    // a message about its own entry being missing.
    expect(failed).toEqual([]);
    expect(output.diagnostics).not.toContain("is not built");
    expect(output.diagnostics).toBe("");
    expect(output.stdout.length).toBeGreaterThan(0);
  } finally {
    await browser.close();
  }
});

test("the deployed documentation index is the site root", async () => {
  const response = await fetch(`${server.origin}`);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("<!doctype html>");
  expect(html).toContain("pages/");
});
