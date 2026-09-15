import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { hashMap, keyword, vector } from "../runtime/literals.mjs";
import { serveTree } from "../tools/browser/matrix.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const SITE = resolve(ROOT, "examples/dogfood/_site");

let staging;
let server;
let origin;
let renderer;
let channels;
let chromiumAvailable = true;

const k = (name) => keyword(name);
const mapOf = (entries) => hashMap(...entries.flatMap(([key, value]) => [k(key), value]));

function comment(id, login, body, createdAt) {
  return mapOf([
    ["id", id],
    ["author", mapOf([["login", login], ["url", null]])],
    ["body", body],
    ["created-at", createdAt],
    ["updated-at", createdAt],
    ["url", `https://github.com/owner/repository/issues/42#issuecomment-${id}`],
    ["replies", vector()],
  ]);
}

function hybridChannel(overrides = []) {
  return mapOf([
    ["id", k("issue-native")],
    ["kind", k("issue")],
    ["mode", k("hybrid")],
    ["count", 2],
    ["updated-at", "2026-09-10T00:00:00Z"],
    ["binding", mapOf([["repository", "owner/repository"], ["number", 42]])],
    ["items", vector(
      comment(1, "writer", "<p>First.</p>", "2026-09-09T00:00:00Z"),
      comment(2, "writer", "<p>Second.</p>", "2026-09-10T00:00:00Z"),
    )],
    ...overrides,
  ]);
}

function snapshotChannel() {
  return mapOf([
    ["id", k("issue-native")],
    ["kind", k("issue")],
    ["mode", k("snapshot")],
    ["count", 1],
    ["updated-at", "2026-09-10T00:00:00Z"],
    ["binding", mapOf([["repository", "owner/repository"], ["number", 42]])],
    ["items", vector(comment(1, "writer", "<p>Only.</p>", "2026-09-09T00:00:00Z"))],
  ]);
}

function externalChannel() {
  return mapOf([
    ["id", k("giscus")],
    ["kind", k("giscus")],
    ["mode", k("embed")],
    ["items", vector()],
    ["count", 0],
    ["provider-url", "https://giscus.app/"],
  ]);
}

/** The channel markup comes from the real renderer, not from the test. */
function markupFor(channel) {
  return renderer.render_comment_channels(
    mapOf([["id", "notes/x"], ["comment-channels", vector(channel)]]),
  );
}

/** A page in the built site, so it carries the real stylesheet and bundle. */
async function pageWith(name, body) {
  const source = await readFile(join(SITE, "index.html"), "utf8");
  const page = source.replace("</main>", `<article class="article">${body}</article></main>`);
  await writeFile(join(staging, "site", name), page, "utf8");
  return `${origin}${name}`;
}

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
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-hybrid-"));
  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  renderer = await import(join(staging, "build/src/renderer/server.mjs"));
  channels = await import(join(staging, "build/src/builder/channels.mjs"));

  // The built site is the page the browser actually sees.
  try {
    await cp(SITE, join(staging, "site"), { recursive: true });
  } catch {
    const demo = await run(["bun", "run", "dogfood"]);
    if (demo.exitCode !== 0) throw new Error(demo.stderr.trim() || "the demo build failed");
    await cp(SITE, join(staging, "site"), { recursive: true });
  }
  server = await serveTree(join(staging, "site"), 8903);
  origin = server.origin;

  try {
    const probe = await chromium.launch();
    await probe.close();
  } catch {
    chromiumAvailable = false;
  }
});

afterAll(async () => {
  if (server) server.stop();
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a hybrid channel serves its snapshot and asks for freshness", () => {
  const markup = markupFor(hybridChannel());
  expect(markup).toContain('data-comment-provider="GitHub Issues"');
  expect(markup).toContain("First.");
  expect(markup).toContain("Second.");
  expect(markup).toContain('data-comment-refresh="1"');
  expect(markup).toContain('data-comment-binding="owner/repository#42"');
  expect(markup).toContain('data-comment-count="2"');
  expect(markup).toContain('data-comment-kind="issue"');
  expect(markup).toContain("Snapshot");
  expect(markup).toContain("2026-09-10T00:00:00Z");
  // The reader is given the provider thread and an empty verdict the browser
  // fills, so the page claims nothing it has not checked.
  expect(markup).toContain("https://github.com/owner/repository/issues/42");
  expect(markup).toContain('<span class="refresh-verdict"></span>');
});

test("a snapshot-only channel makes no freshness claim", () => {
  const markup = markupFor(snapshotChannel());
  expect(markup).toContain("Only.");
  expect(markup).not.toContain("data-comment-refresh");
  expect(markup).not.toContain("refresh-verdict");
});

test("an empty hybrid snapshot still offers the check", () => {
  const markup = markupFor(hybridChannel([["items", vector()], ["count", 0]]));
  expect(markup).toContain("No comments in this snapshot yet.");
  expect(markup).toContain('data-comment-refresh="1"');
});

test("the browser reports how much has changed since the snapshot", async () => {
  if (!chromiumAvailable) return;
  const url = await pageWith("hybrid-more.html", markupFor(hybridChannel()));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("https://api.github.com/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, body: "First.", user: { login: "writer" }, created_at: "2026-09-09T00:00:00Z" },
        { id: 2, body: "Second.", user: { login: "writer" }, created_at: "2026-09-10T00:00:00Z" },
        { id: 3, body: "Third.", user: { login: "writer" }, created_at: "2026-09-11T00:00:00Z" },
      ]),
    }));
    await page.goto(url, { waitUntil: "networkidle" });
    const verdict = await page.locator(".refresh-verdict").first().innerText();
    expect(verdict).toContain("3 comments now");
    expect(verdict).toContain("2 when this snapshot was taken");
  } finally {
    await browser.close();
  }
});

test("a snapshot that is still current says so", async () => {
  if (!chromiumAvailable) return;
  const url = await pageWith("hybrid-same.html", markupFor(hybridChannel()));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("https://api.github.com/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, body: "First.", user: { login: "writer" }, created_at: "2026-09-09T00:00:00Z" },
        { id: 2, body: "Second.", user: { login: "writer" }, created_at: "2026-09-10T00:00:00Z" },
      ]),
    }));
    await page.goto(url, { waitUntil: "networkidle" });
    expect(await page.locator(".refresh-verdict").first().innerText())
      .toContain("this snapshot is current");
  } finally {
    await browser.close();
  }
});

test("a provider that cannot be reached leaves the snapshot standing", async () => {
  if (!chromiumAvailable) return;
  const url = await pageWith("hybrid-fail.html", markupFor(hybridChannel()));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("https://api.github.com/**", (route) => route.abort());
    await page.goto(url, { waitUntil: "networkidle" });
    expect(await page.locator(".refresh-verdict").first().innerText())
      .toContain("could not be checked");
    // The snapshot is still on the page: a failed check is not a failed page.
    expect(await page.locator(".comments").first().innerText()).toContain("First.");
  } finally {
    await browser.close();
  }
});

test("a native channel and an external channel render together, in order", () => {
  // The required matrix names native and external channels together: one is
  // fetched into the build, the other only mounts in the browser.
  const markup = renderer.render_comment_channels(mapOf([
    ["id", "notes/x"],
    ["comment-channels", vector(snapshotChannel(), externalChannel())],
  ]));
  const native = markup.indexOf('data-comment-provider="GitHub Issues"');
  const external = markup.indexOf('data-comment-mount="giscus"');
  expect(native).toBeGreaterThan(-1);
  expect(external).toBeGreaterThan(native);
  expect(markup).toContain("comments-list");
  expect(markup).toContain("embed-region");
  expect(markup).toContain("https://giscus.app/");
});

test("the reported snapshot count is the build's, not a constant", () => {
  const post = (list) => mapOf([["id", "notes/x"], ["comment-channels", vector(...list)]]);
  expect(channels.snapshot_count(vector())).toBe(0);
  // A snapshot and a hybrid channel are captured; an embed is not.
  expect(channels.snapshot_count(vector(
    post([snapshotChannel()]),
    post([hybridChannel(), externalChannel()]),
  ))).toBe(2);
  expect(channels.snapshot_count(vector(post([externalChannel()])))).toBe(0);
});

test("an old snapshot is still labelled with its date", () => {
  // A stale snapshot is not hidden and not presented as live: the reader sees
  // when it was taken, and a hybrid channel adds how much has changed since.
  const stale = snapshotChannel();
  const markup = markupFor(stale);
  expect(markup).toContain("2026-09-10T00:00:00Z");
  expect(markup).toContain("Snapshot from");

  const hybrid = markupFor(hybridChannel([["updated-at", "2020-01-01T00:00:00Z"]]));
  expect(hybrid).toContain("2020-01-01T00:00:00Z");
  expect(hybrid).toContain('data-comment-refresh="1"');
});

test("the configured mode must be one the specification names", async () => {
  const config = resolve(ROOT, "examples/dogfood/src/support/config.eli");
  const source = await readFile(config, "utf8");
  expect(source).toContain("DOGFOOD-CONFIG-014");
  expect(source).toContain("must be snapshot, live, hybrid, or embed");
});
