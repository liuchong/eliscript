import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript");
const BUILD = resolve(ROOT, "bin/eliscript-build");
const PROJECT = resolve(ROOT, "examples/dogfood");
const PACKAGE_TOOL = resolve(PROJECT, "tools/package.eli");
const ENTRY = resolve(PROJECT, "dist/action/index.js");
const ACTION = resolve(PROJECT, "dist/action");
const ARTIFACT = resolve(ACTION, "artifact.json");

let staging;
let tool;
let artifact;

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

const CONFIG = `(module demo.config
  (defconst config
    {:schema-version 1
     :site {:title "Action Demo" :description "Packaged build." :base-url "https://example.github.io/demo/" :language "en"}
     :publishing {:owner {:login "owner"} :coauthors []}
     :sources [{:id :local :kind :markdown :enabled t :directory "content/posts"}]
     :identity {:conflict :fail :projections []}
     :comments {:presentation :tabs :channels []}
     :refresh {:articles :push :comments :runtime :no-change :skip}
     :output {:directory "_site"}})
  (export config))
`;

function post(id, slug, title, extra = "") {
  return `---
id: ${id}
title: ${title}
date: 2026-09-15
description: Demo summary for ${slug}.
tags: [demo]
slug: ${slug}
${extra}---

Body of **${title}**.

## Section

- one
- two
`;
}

async function consumer(files) {
  const directory = await mkdtemp(resolve(staging, "consumer-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = join(directory, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return directory;
}

function demoFiles(overrides = {}) {
  return {
    "dogfood.config.eli": CONFIG,
    "content/posts/0001-alpha.md": post("notes/alpha", "alpha", "Alpha"),
    "content/posts/0002-beta.md": post("notes/beta", "beta", "Beta"),
    "content/posts/0003-draft.md": post("notes/draft", "draft", "Draft", "draft: true\n"),
    ...overrides,
  };
}

async function tree(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix === "" ? entry.name : join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await tree(root, relative));
    else files.push(relative.split("\\").join("/"));
  }
  return files.sort();
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-action-"));
  tool = resolve(staging, "package.mjs");
  const compiled = await run([COMPILER, "--output", tool, PACKAGE_TOOL]);
  if (compiled.exitCode !== 0) {
    throw new Error(compiled.stderr.trim() || compiled.stdout.trim());
  }
  // The package carries the generated site's browser asset, so it must exist
  // before packaging.
  const browser = await run([
    "bun", "run", "build:dogfood-browser",
  ]);
  if (browser.exitCode !== 0) {
    throw new Error(browser.stderr.trim() || browser.stdout.trim());
  }
  const packaged = await run(["node", tool, "--root", ROOT]);
  if (packaged.exitCode !== 0) {
    throw new Error(packaged.stderr.trim() || packaged.stdout.trim());
  }
  artifact = JSON.parse(await readFile(ARTIFACT, "utf8"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the packaging tool emits one CommonJS Node entry", async () => {
  const bundle = await readFile(ENTRY, "utf8");
  // CommonJS entry: the Actions runner requires `main` as a Node script, so
  // no top-level ESM import or export may remain after bundling.
  expect(/^import\s/m.test(bundle)).toBe(false);
  expect(/^export\s/m.test(bundle)).toBe(false);
  expect(bundle).toContain("require(");
  expect(bundle.length).toBeGreaterThan(50_000);
});

test("action.yml declares the documented Action contract", async () => {
  // Bun parses YAML natively, so validating the Action metadata adds no
  // package dependency to the repository.
  const metadata = Bun.YAML.parse(
    await readFile(resolve(PROJECT, "action.yml"), "utf8"),
  );
  expect(metadata.name).toBe("dogfood");
  expect(metadata.runs).toEqual({ using: "node24", main: "dist/action/index.js" });
  expect(Object.keys(metadata.inputs)).toEqual([
    "config-file",
    "output-directory",
    "force",
    "github-token",
    "event-file",
    "preview",
    "previous-manifest",
  ]);
  expect(Object.keys(metadata.outputs)).toEqual([
    "built",
    "reason",
    "content-fingerprint",
    "output-directory",
    "post-count",
    "comment-snapshot-count",
    "manifest",
    "subject",
    "cache-key",
  ]);
  // The declared entry must exist relative to the project root.
  await expect(
    readFile(resolve(PROJECT, metadata.runs.main), "utf8"),
  ).resolves.toContain("require(");
});

test("the artifact manifest binds every source and the bundle", async () => {
  expect(artifact.format).toBe("dogfood-action-artifact");
  expect(artifact.version).toBe(1);
  expect(artifact.runtime).toBe("node24");
  expect(artifact.sources.length).toBeGreaterThanOrEqual(10);
  for (const source of artifact.sources) {
    expect(source.path).toMatch(/^src\/.*[.]eli$/u);
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);
  }
  expect(artifact.entrySha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(artifact.entryBytes).toBeGreaterThan(50_000);
  // The generated site loads this asset, so the package binds its digest too.
  expect(artifact.browserEntry).toContain("dist/site/browser.js");
  expect(artifact.browserSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(artifact.browserBytes).toBeGreaterThan(5_000);
  // The package carries the map that names the .eli sources and the workflow
  // template a consumer copies.
  expect(artifact.workflow).toBe("workflow.yml");
  expect(artifact.sourceMap).toBe("index.js.map");
  expect(artifact.eliscriptSourceMap).toBe("index.eli.map");
  const eliMap = JSON.parse(
    await readFile(join(ACTION, "index.eli.map"), "utf8"),
  );
  expect(eliMap.sources.some((source) => source.endsWith(".eli"))).toBe(true);
  expect(eliMap.sources.every((source) => !source.startsWith("/"))).toBe(true);
});

test("the bundle carries no credential shape or host path", async () => {
  const bundle = await readFile(ENTRY, "utf8");
  for (const pattern of ["/Users/", "/home/", "ghp_", "github_pat_", "-----BEGIN"]) {
    expect(bundle.includes(pattern)).toBe(false);
  }
});

test("rebuilding the bundle is byte-identical", async () => {
  const before = await readFile(ENTRY);
  const rebuilt = await run(["node", tool, "--root", ROOT]);
  expect(rebuilt.exitCode).toBe(0);
  const after = await readFile(ENTRY);
  expect(after.equals(before)).toBe(true);
});

test("the packaged Action builds a consumer project on Node", async () => {
  const directory = await consumer(demoFiles());
  const outputFile = join(directory, "github-output.txt");
  const result = await run([process.execPath, ENTRY], {
    cwd: directory,
    env: { ...process.env, GITHUB_OUTPUT: outputFile },
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("routes");

  const files = await tree(join(directory, "_site"));
  for (const expected of [
    "index.html",
    "archive/index.html",
    "tags/index.html",
    "posts/alpha/index.html",
    "posts/beta/index.html",
    "search.json",
    "feed.xml",
    "sitemap.xml",
    "robots.txt",
    "search/index.html",
    "assets/site.css",
    "assets/browser.js",
    "_dogfood/build.json",
  ]) {
    expect(files).toContain(expected);
  }
  expect(files).not.toContain("posts/draft/index.html");

  const index = await readFile(join(directory, "_site/index.html"), "utf8");
  expect(index).toContain("Action Demo");

  const outputs = await readFile(outputFile, "utf8");
  expect(outputs).toContain("built=true");
  expect(outputs).toContain("reason=changed");
  expect(outputs).toContain("post-count=2");
  expect(outputs).toContain("comment-snapshot-count=0");
  expect(outputs).toMatch(/content-fingerprint=[0-9a-f]{64}/u);
});

test("every relative link in the packaged output resolves", async () => {
  const directory = await consumer(demoFiles());
  const result = await run([process.execPath, ENTRY], { cwd: directory });
  expect(result.exitCode).toBe(0);
  const root = join(directory, "_site");
  const files = new Set(await tree(root));
  const broken = [];
  for (const relative of files) {
    if (!relative.endsWith(".html")) continue;
    const text = await readFile(join(root, relative), "utf8");
    for (const match of text.matchAll(/(?:href|src)="([^"]+)"/gu)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#|data:)/u.test(target)) continue;
      const base = posix.dirname(relative);
      const resolved = target.endsWith("/")
        ? posix.normalize(posix.join(base, target, "index.html"))
        : posix.normalize(posix.join(base, target));
      if (!files.has(resolved)) broken.push(`${relative} -> ${target}`);
    }
  }
  expect(broken).toEqual([]);
});

test("configuration that is not closed data is rejected", async () => {
  const directory = await consumer(demoFiles({
    "dogfood.config.eli": `(module demo.config
  (defconst config
    {:schema-version 1
     :site {:title "T" :base-url "https://example.github.io/d/"
            :description (js* "process.env.SECRET")}
     :sources [{:id :local :kind :markdown :enabled t :directory "content/posts"}]
     :output {:directory "_site"}})
  (export config))
`,
  }));
  const result = await run([process.execPath, ENTRY], { cwd: directory });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("DOGFOOD-CONFIG-005");
});

test("an unknown configuration key is rejected", async () => {
  const directory = await consumer(demoFiles({
    "dogfood.config.eli": CONFIG.replace(":schema-version 1",
      ":schema-version 1\n     :unexpected t"),
  }));
  const result = await run([process.execPath, ENTRY], { cwd: directory });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("DOGFOOD-CONFIG-006");
});

test("a missing config file is reported, not crashed", async () => {
  const directory = await consumer({
    "content/posts/0001-alpha.md": post("notes/alpha", "alpha", "Alpha"),
  });
  const result = await run([process.execPath, ENTRY], { cwd: directory });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("dogfood:");
});
