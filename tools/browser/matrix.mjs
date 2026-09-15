// Browser acceptance matrix for the generated site.
//
// Specification 0009 requires desktop and mobile viewports in Chromium,
// Firefox, and WebKit, because a static page that only one engine lays out
// correctly is not a static page. This tool drives real engines against a real
// build and records what each one measured.
//
// It serves the built tree itself and stops the server before it exits, so a
// run leaves no listener behind.

import { chromium, firefox, webkit } from "playwright-core";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** The engines the matrix requires, in report order. */
export const ENGINES = Object.freeze(["chromium", "firefox", "webkit"]);

/**
 * The narrowest width the experience specification allows, a phone viewport,
 * and a desktop viewport.
 */
export const VIEWPORTS = Object.freeze([
  { name: "narrow", viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
]);

const DRIVERS = { chromium, firefox, webkit };

/** Parses an `rgb(...)`/`rgba(...)` value into channels. */
export function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/u.exec(value ?? "");
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/u).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return parts.slice(0, 3);
}

function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

// --------------------------------------------------------------- the checks

async function visible(page, selector) {
  return page.locator(selector).first().isVisible();
}

/** The checks that need scripts enabled. */
async function scriptedChecks(page, base, viewport) {
  const failures = [];
  const measured = {};

  await page.goto(base, { waitUntil: "load" });
  measured.title = await page.title();
  if (!measured.title.trim()) failures.push("the home page has no title");
  if (!(await visible(page, "h1"))) failures.push("the home page has no visible first-level heading");
  if (!(await visible(page, ".wordmark"))) failures.push("the publication identity is not visible");

  measured.overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (measured.overflow.scrollWidth > measured.overflow.innerWidth + 1) {
    failures.push(
      `the page is ${measured.overflow.scrollWidth}px wide in a ` +
      `${measured.overflow.innerWidth}px viewport`,
    );
  }

  // The secondary navigation: inline on a wide screen, a disclosure on a
  // narrow one that opens when the reader asks for it.
  const summaryVisible = await visible(page, ".menu > summary");
  const linksVisible = await visible(page, ".menu > nav a");
  measured.navigation = { summaryVisible, linksVisible };
  if (viewport.isMobile) {
    if (!summaryVisible) failures.push("the narrow layout hides the navigation control");
    if (linksVisible) failures.push("the narrow layout shows the links before they are asked for");
    await page.locator(".menu > summary").first().click();
    await page.waitForTimeout(120);
    if (!(await visible(page, ".menu > nav a"))) {
      failures.push("opening the navigation control does not reveal the links");
    }
  } else if (!linksVisible) {
    failures.push("the wide layout hides the navigation links");
  }

  // The theme control, and the fact that the choice survives a reload.
  const toggle = page.locator("#theme-toggle").first();
  if (await toggle.count() === 0) {
    failures.push("there is no theme control");
  } else {
    await toggle.click();
    await page.waitForTimeout(80);
    measured.theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (!measured.theme) failures.push("the theme control does not select a theme");
    await page.reload({ waitUntil: "load" });
    const afterReload = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (afterReload !== measured.theme) {
      failures.push("the selected theme is not restored after a reload");
    }
  }

  // Text must stay legible: the article colour against the page colour.
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { foreground: body.color, background: body.backgroundColor };
  });
  const foreground = parseColor(colors.foreground);
  const background = parseColor(colors.background);
  measured.contrast = foreground && background ? contrastRatio(foreground, background) : null;
  if (measured.contrast === null) {
    failures.push("the text or page colour could not be read");
  } else if (measured.contrast < 4.5) {
    failures.push(`body contrast is ${measured.contrast.toFixed(2)}, below 4.5`);
  }

  // Search runs in the page, so it is part of what a browser must prove.
  const search = `${base}search/`;
  await page.goto(search, { waitUntil: "load" });
  const input = page.locator("#search-input").first();
  if (await input.count() === 0) {
    failures.push("the search page has no input");
  } else {
    await input.fill("a");
    await page.waitForTimeout(600);
    measured.searchResults = await page.locator("#search-results li").count();
    if (measured.searchResults < 1) failures.push("a search for a common letter returns nothing");
  }

  return { failures, measured };
}

/** An article must stay readable with scripts disabled. */
async function scriptlessChecks(page, base) {
  const failures = [];
  const measured = {};
  // An article is reached the way a reader reaches it, from the archive.
  await page.goto(`${base}archive/`, { waitUntil: "load" });
  const href = await page.locator(".list a.title").first().getAttribute("href");
  if (!href) {
    failures.push("the archive lists no article to read");
    return { failures, measured };
  }
  await page.goto(new URL(href, `${base}archive/`).href, { waitUntil: "load" });
  measured.articleCharacters = (await page.locator("article").first().innerText()).trim().length;
  if (measured.articleCharacters < 200) {
    failures.push(`the article is ${measured.articleCharacters} characters without scripts`);
  }
  if (!(await visible(page, "article h1"))) failures.push("the article heading is not visible without scripts");
  measured.scriptCount = await page.locator("script").count();
  return { failures, measured };
}

// ------------------------------------------------------------------ the run

/** Serves `directory` on a fixed loopback port until the returned stop runs. */
export async function serveTree(directory, port) {
  const root = resolve(directory);
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      let path = join(root, decodeURIComponent(url.pathname));
      if (path.endsWith("/")) path = join(path, "index.html");
      try {
        const info = await stat(path);
        if (info.isDirectory()) path = join(path, "index.html");
        const body = await readFile(path);
        return new Response(body, {
          headers: { "content-type": contentType(path) },
        });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  });
  return { origin: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

/** Fingerprints the tree so a report can be tied to the bytes it describes. */
export async function fingerprintTree(directory) {
  const digest = createHash("sha256");
  const walk = async (path, relative) => {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const child = join(path, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(child, name);
      else {
        digest.update(name);
        digest.update(await readFile(child));
      }
    }
  };
  await walk(resolve(directory), "");
  return digest.digest("hex");
}

/**
 * Runs every requested engine against a served copy of `site`.
 *
 * @returns {Promise<{ report: object, failures: string[] }>}
 */
export async function runMatrix({ site, engines = ENGINES, port = 8899 }) {
  const origin = `http://127.0.0.1:${port}/`;
  const server = await serveTree(site, port);
  const failures = [];
  const report = {
    format: "dogfood-browser-matrix",
    version: 1,
    viewports: VIEWPORTS.map((entry) => entry.name),
    siteFingerprint: await fingerprintTree(site),
    engines: [],
  };
  try {
    for (const name of engines) {
      const driver = DRIVERS[name];
      if (!driver) throw new Error(`unknown engine ${name}`);
      const entry = { name, version: null, viewports: [] };
      let browser;
      try {
        browser = await driver.launch();
        entry.version = browser.version();
        for (const spec of VIEWPORTS) {
          // The scripted pass, then the same page with scripts disabled.
          const context = await browser.newContext({
            viewport: spec.viewport,
            isMobile: Boolean(spec.isMobile),
            hasTouch: Boolean(spec.hasTouch),
            deviceScaleFactor: spec.deviceScaleFactor ?? 1,
          });
          const page = await context.newPage();
          const scripted = await scriptedChecks(page, origin, spec);
          await context.close();

          const plainContext = await browser.newContext({
            viewport: spec.viewport,
            isMobile: Boolean(spec.isMobile),
            hasTouch: Boolean(spec.hasTouch),
            deviceScaleFactor: spec.deviceScaleFactor ?? 1,
            javaScriptEnabled: false,
          });
          const plainPage = await plainContext.newPage();
          const plain = await scriptlessChecks(plainPage, origin);
          await plainContext.close();

          const viewportFailures = [...scripted.failures, ...plain.failures];
          entry.viewports.push({
            name: spec.name,
            width: spec.viewport.width,
            measured: { ...scripted.measured, withoutScripts: plain.measured },
            failures: viewportFailures,
          });
          for (const failure of viewportFailures) {
            failures.push(`${name}/${spec.name}: ${failure}`);
          }
        }
      } catch (error) {
        entry.error = String(error).split("\n")[0];
        failures.push(`${name}: ${entry.error}`);
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
      report.engines.push(entry);
    }
  } finally {
    server.stop();
  }
  return { report, failures };
}

function parseArguments(argv) {
  const options = { site: "examples/dogfood/_site", out: null, engines: [...ENGINES], port: 8899 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--site" || argument === "--out" || argument === "--port") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = argument === "--port" ? Number(value) : value;
      index += 1;
    } else if (argument === "--engines") {
      options.engines = argv[index + 1].split(",");
      index += 1;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  return options;
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const { report, failures } = await runMatrix({
      site: options.site, engines: options.engines, port: options.port,
    });
    for (const entry of report.engines) {
      if (entry.error) {
        process.stdout.write(`${entry.name}: unavailable (${entry.error})\n`);
        continue;
      }
      for (const viewport of entry.viewports) {
        const verdict = viewport.failures.length === 0 ? "ok" : `${viewport.failures.length} failed`;
        process.stdout.write(
          `${entry.name} ${entry.version} ${viewport.name} ${viewport.width}px: ${verdict}\n`,
        );
        for (const failure of viewport.failures) process.stdout.write(`  - ${failure}\n`);
      }
    }
    report.failures = failures;
    if (options.out) {
      await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`report ${options.out}\n`);
    }
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`browser matrix: ${error.message}\n`);
    process.exitCode = 1;
  }
}
