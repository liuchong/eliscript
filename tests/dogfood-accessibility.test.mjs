import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const DEMO = resolve(ROOT, "examples/dogfood/_demo");

let staging;
let program;
let bundle;
let output;
let css;
let page;
let article;

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
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-a11y-"));

  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  program = join(staging, "build/src/builder/main.mjs");

  const browser = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "browser-source"), "examples/dogfood/src/renderer/browser.eli",
  ]);
  if (browser.exitCode !== 0) throw new Error(browser.stderr.trim() || browser.stdout.trim());
  bundle = join(staging, "browser.js");
  const bundled = await run([
    "bun", "build", join(staging, "browser-source/src/renderer/browser.mjs"),
    "--target=browser", "--format=iife", "--outfile", bundle,
  ]);
  if (bundled.exitCode !== 0) throw new Error(bundled.stderr.trim() || bundled.stdout.trim());

  // An external channel mounts in one region and needs a fallback, so the
  // fixture enables one that has no builder-side record.
  const project = join(staging, "project");
  await cp(DEMO, project, { recursive: true });
  const configPath = join(project, "dogfood.config.eli");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config.replace(
      ":channels []",
      ":channels [{:id :giscus :kind :giscus :enabled t :mode :embed}]",
    ),
    "utf8",
  );
  output = join(project, "site");
  const site = await run([
    process.execPath, program, "--root", project, "--output", "site",
    "--browser-bundle", bundle,
  ]);
  if (site.exitCode !== 0) throw new Error(site.stderr.trim() || site.stdout.trim());

  css = await readFile(join(output, "assets/site.css"), "utf8");
  page = await readFile(join(output, "index.html"), "utf8");
  // Comment channels belong to an article, not to the home page.
  article = await readFile(join(output, "posts/welcome/index.html"), "utf8");
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("every page carries the document contract", async () => {
  const pages = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".html")) pages.push(path);
    }
  }
  await walk(output);
  expect(pages.length).toBeGreaterThan(5);

  for (const path of pages) {
    const source = await readFile(path, "utf8");
    expect(source).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(source).toContain('<a class="skip" href="#main">');
    expect(source).toContain("<header");
    expect(source).toContain('<main id="main">');
    expect(source).toContain("<footer>");
    expect(source).toContain('<nav aria-label="site">');
    // One page, one first-level heading.
    expect(source.match(/<h1[ >]/gu)).toHaveLength(1);
  }
});

test("narrow screens get the navigation as a disclosure, wide ones inline", () => {
  // The disclosure ships open so that a browser which hides closed disclosure
  // content cannot hide the navigation from a wide layout.
  expect(page).toContain(
    '<details class="menu" open><summary>Menu</summary><nav aria-label="site">',
  );
  // The wordmark is a sibling of the disclosure, so the publication identity is
  // never hidden behind it.
  const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
  expect(header.indexOf("wordmark")).toBeLessThan(header.indexOf("<details"));
  // Above the breakpoint the disclosure is not rendered at all.
  expect(css).toContain("@media (min-width:601px){.menu{display:contents}.menu>summary{display:none}");
  expect(css).toContain("@media (max-width:600px)");
  expect(css).toContain(".menu>summary{display:block");
  // Below it the document element carries the decision, recorded before the
  // header is parsed, so the links are never shown and then hidden.
  expect(css).toContain("html[data-menu=collapsed] .menu>nav{display:none}");
});

test("the bundle decides the menu state before the header is parsed", async () => {
  const bundle = await readFile(join(staging, "browser.js"), "utf8");
  expect(bundle).toContain("data-menu");
  expect(bundle).toContain("collapsed");
  // The element exists only after parsing, so the pre-paint decision is
  // recorded on the document element and the element follows it afterwards.
  expect(bundle).toContain("mark_menu_state");
  expect(bundle).toContain("bind_menu");
});

test("keyboard focus is visible and motion can be reduced", () => {
  expect(css).toContain(":focus-visible{outline:2px solid var(--accent);outline-offset:2px");
  expect(css).toContain("@media (prefers-reduced-motion:reduce)");
  expect(css).toContain("transition-duration:0.01ms !important");
});

test("long labels and source names cannot overflow their containers", () => {
  expect(css).toContain("overflow-wrap:anywhere");
  expect(css).toContain(".masthead>*{min-width:0}");
});

test("article measure is constrained independently of the viewport", () => {
  // A fixed rem measure rather than a percentage, so a wide window does not
  // stretch the text.
  expect(css).toContain(".article{max-width:44rem}");
  expect(css).not.toContain(".article{max-width:100%");
});

test("the theme control carries a name and a tooltip", () => {
  expect(page).toContain('title="Switch the colour theme"');
  expect(page).toContain('type="button"');
});

test("an external channel mounts in one isolated region with a fallback", () => {
  expect(article).toContain('class="embed-region"');
  // The mount names the provider by the configured kind.
  expect(article).toContain('data-comment-mount="giscus"');
  // The region reserves its space and contains its own layout, so a provider
  // that never loads cannot move the article.
  expect(css).toContain(".embed-region{min-height:180px");
  expect(css).toContain("contain:layout style");
  expect(article).toContain("The browser loads that provider");

  // The channel is declared in the configuration rather than fetched, so the
  // build carries no provider content and no provider request.
  expect(article).toContain("this build does not");
});

test("a declared channel reaches every published article once", async () => {
  const posts = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "index.html" && path.includes("/posts/")) posts.push(path);
    }
  }
  await walk(output);
  expect(posts.length).toBeGreaterThan(1);
  for (const path of posts) {
    const source = await readFile(path, "utf8");
    expect(source.split('data-comment-mount="giscus"').length - 1).toBe(1);
  }
});
