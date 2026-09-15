import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const DEMO = resolve(ROOT, "examples/dogfood/_demo");

let staging;
let program;
let bundle;
let project;
let configText;

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function build(output = "site") {
  return run([
    process.execPath, program, "--root", project, "--output", output,
    "--browser-bundle", bundle,
  ]);
}

/** A digest of the published tree, so "unchanged" is a fact rather than a hope. */
async function digestOf(directory) {
  const digest = createHash("sha256");
  const walk = async (path, relative) => {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
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
  await walk(directory, "");
  return digest.digest("hex");
}

/** Replaces the configured sources with the given declaration text. */
function withSources(text, declaration) {
  const replaced = text.replace(/:sources\n\s*\[[\s\S]*?\]\n/u, `:sources\n     ${declaration}\n`);
  if (replaced === text) throw new Error("the configuration sources were not replaced");
  return replaced;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-resilience-"));
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

  project = join(staging, "project");
  await cp(DEMO, project, { recursive: true });
  configText = await readFile(join(project, "dogfood.config.eli"), "utf8");
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a source that returns nothing produces a site without it", async () => {
  // The demo project has one Markdown source; an empty directory is still a
  // source, and a build must not invent articles for it.
  await writeFile(
    join(project, "dogfood.config.eli"),
    withSources(
      configText,
      '[{:id :local :kind :markdown :enabled t :directory "empty/posts"}\n'
      + '      {:id :more-posts :kind :markdown :enabled t :directory "content/posts"}]',
    ),
    "utf8",
  );
  await run(["mkdir", "-p", join(project, "empty/posts")]);
  const result = await build();
  expect(result.exitCode).toBe(0);
  const archive = await readFile(join(project, "site/archive/index.html"), "utf8");
  expect(archive).toContain("posts/");
});

// These two cases cross the real network boundary on purpose: the point is
// that a failing provider is reported rather than crashing, and a substituted
// transport would not prove that. A slow or unavailable network is therefore
// part of the fixture, so they get more room than the default timeout.
const NETWORK_TIMEOUT = 30_000;

test("a provider failure ends the build without touching the published tree", { timeout: NETWORK_TIMEOUT }, async () => {
  await writeFile(join(project, "dogfood.config.eli"), configText, "utf8");
  const first = await build();
  expect(first.exitCode).toBe(0);
  const published = await digestOf(join(project, "site"));
  expect(published).toMatch(/^[0-9a-f]{64}$/u);

  // The remote source cannot answer: there is no token and no such repository.
  await writeFile(
    join(project, "dogfood.config.eli"),
    withSources(
      configText,
      '[{:id :local :kind :markdown :enabled t :directory "content/posts"}\n'
      + '      {:id :notes :kind :issues :enabled t'
      + ' :repository "owner/a-repository-that-does-not-exist" :label "published"}]',
    ),
    "utf8",
  );
  const failed = await build();
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout).toMatch(/DOGFOOD-GITHUB-\d+/u);

  // The previous publication is intact and no half-written tree is left.
  expect(await digestOf(join(project, "site"))).toBe(published);
  expect(await exists(join(project, "site.staging"))).toBe(false);
  expect(await exists(join(project, "site.backup"))).toBe(false);
});

test("a Discussion provider failure is reported with its own code", { timeout: NETWORK_TIMEOUT }, async () => {
  await writeFile(
    join(project, "dogfood.config.eli"),
    withSources(
      configText,
      '[{:id :local :kind :markdown :enabled t :directory "content/posts"}\n'
      + '      {:id :talks :kind :discussions :enabled t'
      + ' :repository "owner/a-repository-that-does-not-exist" :category "Blog"}]',
    ),
    "utf8",
  );
  const failed = await build();
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout).toMatch(/DOGFOOD-GITHUB-\d+|DOGFOOD-DISCUSSIONS-\d+/u);
  expect(await exists(join(project, "site.staging"))).toBe(false);
});

test("a failed configuration leaves the published tree alone as well", async () => {
  const before = await digestOf(join(project, "site"));
  await writeFile(
    join(project, "dogfood.config.eli"),
    configText.replace(":schema-version 1", ":schema-version 1 :mystery t"),
    "utf8",
  );
  const failed = await build();
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout).toContain("DOGFOOD-CONFIG-006");
  expect(await digestOf(join(project, "site"))).toBe(before);
});
