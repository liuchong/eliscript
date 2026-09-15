import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const PROJECT = resolve(ROOT, "examples/dogfood");

let staging;
let program;
let workspace;

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

// The compiled builder resolves `eliscript/runtime/...` through the package,
// so it lives inside the repository while the project copy is the build root.
async function buildSite(directory, output) {
  const { exitCode, stdout, stderr } = await run([
    process.execPath,
    program,
    "--root",
    directory,
    "--output",
    output,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim());
  return stdout;
}

async function tree(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix === "" ? entry.name : join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await tree(root, relative));
    } else {
      files.push(relative.split("\\").join("/"));
    }
  }
  return files.sort();
}

async function readText(root, relative) {
  return readFile(join(root, relative), "utf8");
}

// Every relative link must resolve to a file or to a directory index.
async function brokenLinks(root) {
  const files = new Set(await tree(root));
  const broken = [];
  for (const relative of files) {
    if (!relative.endsWith(".html")) continue;
    const text = await readText(root, relative);
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
  return broken;
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-site-"));
  const build = await run([
    COMPILER,
    "--no-cache",
    "--root",
    "examples/dogfood",
    "--out-dir",
    staging,
    "examples/dogfood/src/builder/main.eli",
  ]);
  if (build.exitCode !== 0) {
    throw new Error(build.stderr.trim() || build.stdout.trim());
  }
  program = resolve(staging, "src/builder/main.mjs");

  // A copy of the project proves it works as a standalone project root.
  const parent = await mkdtemp(resolve(staging, "project-"));
  workspace = join(parent, "dogfood");
  await cp(PROJECT, workspace, {
    recursive: true,
    filter: (entry) => {
      const name = basename(entry);
      return name !== "dist" && name !== "_site";
    },
  });
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the Markdown slice publishes the documented route set", async () => {
  const output = await buildSite(workspace, "_site");
  const files = await tree(join(workspace, "_site"));
  expect(output).toContain("routes");
  for (const expected of [
    "index.html",
    "404.html",
    "archive/index.html",
    "tags/index.html",
    "feed.xml",
    "sitemap.xml",
    "robots.txt",
    "search.json",
    "assets/site.css",
    "_dogfood/build.json",
    "_dogfood/posts.json",
    "posts/hello-dogfood/index.html",
    "posts/persistent-values/index.html",
    "posts/comment-channels/index.html",
    "tags/design/index.html",
  ]) {
    expect(files).toContain(expected);
  }
});

test("a draft is absent from production output", async () => {
  const root = join(workspace, "_site");
  const files = await tree(root);
  expect(files).not.toContain("posts/publication-policy/index.html");
  const search = await readText(root, "search.json");
  expect(search).not.toContain("Drafts are invisible");
  const feed = await readText(root, "feed.xml");
  expect(feed).not.toContain("Drafts are invisible");
});

test("a former slug redirects without JavaScript", async () => {
  const root = join(workspace, "_site");
  const redirect = await readText(root, "posts/one-lossy-list/index.html");
  expect(redirect).toContain("http-equiv=\"refresh\"");
  expect(redirect).toContain("../comment-channels/");
  expect(redirect).toContain("rel=\"canonical\"");
});

test("article bodies are sanitized and self-contained", async () => {
  const body = await readText(join(workspace, "_site"), "posts/hello-dogfood/index.html");
  expect(body).toContain("<strong>executable slice</strong>");
  expect(body).toContain("<pre><code class=\"language-elisp\">");
  expect(body).toContain("<code>content/posts/</code>");
  // Raw HTML in content is escaped rather than interpreted.
  expect(body).not.toContain("<script");
});

test("every relative link resolves", async () => {
  expect(await brokenLinks(join(workspace, "_site"))).toEqual([]);
});

test("the published manifests follow the documented shape", async () => {
  const root = join(workspace, "_site");
  const manifest = JSON.parse(await readText(root, "_dogfood/build.json"));
  expect(manifest.format).toBe("dogfood-build");
  expect(manifest.version).toBe(1);
  expect(manifest.postCount).toBe(3);
  expect(manifest.routeCount).toBe(17);
  expect(manifest.contentFingerprint).toMatch(/^[0-9a-f]{64}$/u);

  const posts = JSON.parse(await readText(root, "_dogfood/posts.json"));
  expect(posts.posts).toHaveLength(3);
  // Canonical order: pinned weight, then publication date, then id.
  expect(posts.posts.map((post) => post.id)).toEqual([
    "notes/hello-dogfood",
    "notes/comment-channels",
    "notes/persistent-values",
  ]);

  const search = JSON.parse(await readText(root, "search.json"));
  expect(search.entries).toHaveLength(3);
  expect(search.entries[0].authors).toEqual(["dogfood"]);
  expect(search.entries[0].text).toContain("executable slice");
});

test("two clean builds are byte-identical", async () => {
  await buildSite(workspace, "_site-a");
  await buildSite(workspace, "_site-b");
  const first = await tree(join(workspace, "_site-a"));
  const second = await tree(join(workspace, "_site-b"));
  expect(first).toEqual(second);
  for (const relative of first) {
    const left = await readText(join(workspace, "_site-a"), relative);
    const right = await readText(join(workspace, "_site-b"), relative);
    expect(left).toBe(right);
  }
});

test("a failed build leaves the previous output in place", async () => {
  const source = join(workspace, "content/posts/0001-hello-dogfood.md");
  const original = await readFile(source, "utf8");
  const before = await readText(join(workspace, "_site"), "_dogfood/build.json");
  await writeFile(source, original.replace("id: notes/hello-dogfood\n", ""));
  try {
    const result = await run([
      process.execPath,
      program,
      "--root",
      workspace,
      "--output",
      "_site",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("DOGFOOD-CONTENT-001");
    expect(result.stdout).not.toContain("routes");
    const after = await readText(join(workspace, "_site"), "_dogfood/build.json");
    expect(after).toBe(before);
    expect((await stat(join(workspace, "_site", "index.html"))).isFile()).toBe(true);
  } finally {
    await writeFile(source, original);
  }
});
