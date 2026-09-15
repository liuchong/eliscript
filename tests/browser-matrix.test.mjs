import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ENGINES, VIEWPORTS, contrastRatio, parseColor, runMatrix } from "../tools/browser/matrix.mjs";

const ROOT = resolve(import.meta.dir, "..");
const SITE = resolve(ROOT, "examples/dogfood/_site");

let staging;
let available = true;
let report;

async function ensureSite() {
  try {
    await stat(join(SITE, "index.html"));
    return;
  } catch {
    // Build below.
  }
  const child = Bun.spawn(["bun", "run", "dogfood"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, , stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "the demo site build failed");
}

beforeAll(async () => {
  await ensureSite();
  staging = await mkdtemp(resolve(ROOT, ".eliscript-browser-matrix-"));
  try {
    const probe = await chromium.launch();
    await probe.close();
  } catch {
    available = false;
    return;
  }
  const result = await runMatrix({ site: SITE, engines: ["chromium"], port: 8901 });
  report = result.report;
  report.failures = result.failures;
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the matrix names the engines and viewports it requires", () => {
  expect([...ENGINES]).toEqual(["chromium", "firefox", "webkit"]);
  expect(VIEWPORTS.map((entry) => entry.name)).toEqual(["narrow", "mobile", "desktop"]);
  expect(VIEWPORTS[0].viewport.width).toBe(320);
});

test("colour parsing and contrast follow the WCAG definition", () => {
  expect(parseColor("rgb(22, 24, 29)")).toEqual([22, 24, 29]);
  expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0]);
  expect(parseColor("currentColor")).toBeNull();
  // Black on white is the definition's maximum, and a colour with itself is 1.
  expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  expect(contrastRatio([90, 90, 90], [90, 90, 90])).toBeCloseTo(1, 5);
});

test("a real engine passes every viewport", async () => {
  if (!available) {
    // A machine without the engine records the gap rather than claiming a pass.
    expect(available).toBe(false);
    return;
  }
  expect(report.failures).toEqual([]);
  expect(report.engines.length).toBe(1);
  const [engine] = report.engines;
  expect(engine.error).toBeUndefined();
  expect(engine.viewports.map((entry) => entry.name)).toEqual(["narrow", "mobile", "desktop"]);
});

test("every viewport stays inside its width and keeps its text legible", async () => {
  if (!available) return;
  for (const viewport of report.engines[0].viewports) {
    const { measured, failures } = viewport;
    expect(failures).toEqual([]);
    expect(measured.overflow.scrollWidth).toBeLessThanOrEqual(measured.overflow.innerWidth + 1);
    expect(measured.contrast).toBeGreaterThanOrEqual(4.5);
    expect(measured.title).toBeTruthy();
    // The navigation is a disclosure on a narrow screen and inline on a wide
    // one, and the narrow one opens.
    if (viewport.name === "desktop") {
      expect(measured.navigation.linksVisible).toBe(true);
    } else {
      expect(measured.navigation.summaryVisible).toBe(true);
      expect(measured.navigation.linksVisible).toBe(false);
    }
  }
});

test("the article is complete without scripts", async () => {
  if (!available) return;
  for (const viewport of report.engines[0].viewports) {
    // A static article is the product: the browser must be able to read it with
    // scripting disabled.
    expect(viewport.measured.withoutScripts.articleCharacters).toBeGreaterThan(200);
  }
});

test("the report binds the tree it describes", async () => {
  if (!available) return;
  expect(report.format).toBe("dogfood-browser-matrix");
  expect(report.version).toBe(1);
  expect(report.siteFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  // A report written to disk is the same report the run produced.
  const { stdout } = await (async () => {
    const child = Bun.spawn([
      "bun", "tools/browser/matrix.mjs", "--site", "examples/dogfood/_site",
      "--engines", "chromium", "--port", "8902",
      "--out", join(staging, "report.json"),
    ], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const [exitCode, out, err] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(err).toBe("");
    return { stdout: out };
  })();
  expect(stdout).toContain("narrow 320px: ok");
  const written = JSON.parse(await readFile(join(staging, "report.json"), "utf8"));
  expect(written.siteFingerprint).toBe(report.siteFingerprint);
  expect(written.failures).toEqual([]);
});
