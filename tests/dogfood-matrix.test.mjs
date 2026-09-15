import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword, vector } from "../runtime/literals.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let project;
let sources;

const k = (name) => keyword(name);
const mapOf = (entries) => hashMap(...entries.flatMap(([key, value]) => [k(key), value]));
const getOf = (value, name, fallback = null) => cget(value, k(name), fallback);

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

// Every provider answers on its own repository, so a request names the source
// that made it and a disabled provider is provably silent.
const REPOSITORY = {
  markdown: "owner/markdown-repository",
  issues: "owner/issues-repository",
  discussions: "owner/discussions-repository",
};

const SUBJECT = ["markdown", "issues", "discussions"];

/** The seven non-empty subsets, in a stable order. */
const SUBSETS = Array.from(
  { length: (1 << SUBJECT.length) - 1 },
  (_, mask) => SUBJECT.filter((_, index) => (mask + 1) & (1 << index)),
);

function markdownBody(id) {
  return [
    "---",
    `id: ${id}`,
    "title: From Markdown",
    "date: 2026-09-12",
    "description: A markdown record.",
    "tags: [design]",
    "slug: from-markdown",
    "---",
    "",
    "Body text.",
    "",
  ].join("\n");
}

function metadata(fields) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return ["```dogfood", ...lines, "```", "", "Body text.", ""].join("\n");
}

function issue(number, id) {
  return {
    number,
    html_url: `https://github.com/owner/issues-repository/issues/${number}`,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    labels: [],
    user: { login: "owner", id: "U_owner", type: "User" },
    body: metadata({ id, title: "From Issues", slug: "from-issues" }),
  };
}

function discussion(number, id) {
  return {
    number,
    id: `D_${number}`,
    title: "Discussion carrier",
    url: `https://github.com/owner/discussions-repository/discussions/${number}`,
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-11T00:00:00Z",
    category: { name: "Blog" },
    labels: { nodes: [] },
    author: { login: "owner", databaseId: "U_owner", __typename: "User" },
    body: metadata({ id, title: "From Discussions", slug: "from-discussions" }),
    answer: null,
    comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    commentsCount: { totalCount: 0 },
  };
}

/** A transport that records which repository each request named. */
function recordingTransport(calls) {
  return (request) => {
    const url = typeof request === "string" ? request : request.url;
    // A GraphQL request names its repository in the body rather than the URL,
    // so the recorded text carries both.
    calls.push(typeof request === "string"
      ? request
      : `${request.url} ${JSON.stringify(request.body ?? "")}`);
    if (url.includes("/graphql")) {
      return {
        status: 200,
        headers: {},
        body: {
          data: {
            repository: {
              discussions: {
                nodes: [discussion(17, "notes/from-discussions")],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    }
    return {
      status: 200,
      headers: {},
      body: [issue(42, "notes/from-issues")],
    };
  };
}

function sourceOf(subject, enabled) {
  if (subject === "markdown") {
    return mapOf([
      ["id", k("markdown-posts")],
      ["kind", k("markdown")],
      ["enabled", enabled],
      ["directory", "content/posts"],
    ]);
  }
  if (subject === "issues") {
    return mapOf([
      ["id", k("issues")],
      ["kind", k("issues")],
      ["enabled", enabled],
      ["repository", REPOSITORY.issues],
      ["label", "published"],
    ]);
  }
  return mapOf([
    ["id", k("discussions")],
    ["kind", k("discussions")],
    ["enabled", enabled],
    ["repository", REPOSITORY.discussions],
    ["category", "Blog"],
  ]);
}

// The configuration always lists all three providers; the subset only decides
// which of them are enabled, which is what the builder must act on.
function configFor(subset) {
  return mapOf([
    ["sources", vector(...SUBJECT.map((subject) => sourceOf(subject, subset.includes(subject))))],
    ["publishing", mapOf([
      ["owner", mapOf([["login", "owner"], ["id", "U_owner"]])],
      ["coauthors", vector()],
    ])],
    ["adapters", vector()],
    ["comments", mapOf([
      ["presentation", k("tabs")],
      ["channels", vector()],
    ])],
    ["identity", mapOf([["conflict", k("fail")], ["projections", vector()]])],
    ["output", mapOf([["directory", "_site"]])],
  ]);
}

async function collect(subset) {
  const config = configFor(subset);
  const enabled = sources.enabled_sources(config);
  const ids = [...enabled].map((source) => getOf(source, "id").name);
  const calls = [];
  const transport = recordingTransport(calls);
  const posts = [];
  for (const source of enabled) {
    const result = await sources.source_posts(project, config, source, transport, vector());
    posts.push(...[...getOf(result, "posts")]);
  }
  return { ids, calls, posts: posts.map((post) => getOf(post, "id")) };
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-matrix-"));
  project = resolve(staging, "project");
  await mkdir(resolve(project, "content/posts"), { recursive: true });
  await writeFile(
    resolve(project, "content/posts/0001-from-markdown.md"),
    markdownBody("notes/from-markdown"),
    "utf8",
  );

  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    resolve(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  sources = await import(resolve(staging, "build/src/builder/sources.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the matrix enumerates all seven non-empty subsets", () => {
  expect(SUBSETS.length).toBe(7);
});

for (const subset of SUBSETS) {
  const label = subset.join("+");

  test(`the ${label} subset reads exactly its providers`, async () => {
    const result = await collect(subset);

    // Only the enabled providers are dispatched, in configuration order.
    expect(result.ids).toEqual(subset.map((subject) => ({
      markdown: "markdown-posts", issues: "issues", discussions: "discussions",
    })[subject]));

    // Each enabled provider contributes its own record...
    const expected = subset.map((subject) => `notes/from-${subject}`);
    expect([...result.posts].sort()).toEqual([...expected].sort());

    // ...and a disabled provider never reaches the network at all. Markdown is
    // read from the filesystem, so it is not part of the network check.
    // The repository name appears in a REST URL and in a GraphQL variable, so
    // it identifies the provider under either protocol.
    for (const subject of ["issues", "discussions"]) {
      const name = REPOSITORY[subject].split("/")[1];
      const touched = result.calls.some((call) => call.includes(name));
      expect(touched).toBe(subset.includes(subject));
    }
    if (!subset.includes("markdown")) {
      expect(result.posts).not.toContain("notes/from-markdown");
    }
  });
}

test("all three providers together keep every record distinct", async () => {
  const result = await collect(["markdown", "issues", "discussions"]);
  expect([...result.posts].sort()).toEqual([
    "notes/from-discussions", "notes/from-issues", "notes/from-markdown",
  ]);
  expect(result.calls.length).toBeGreaterThanOrEqual(2);
});

test("a configuration with nothing enabled dispatches nothing", async () => {
  const result = await collect([]);
  expect(result.ids).toEqual([]);
  expect(result.posts).toEqual([]);
  expect(result.calls).toEqual([]);
});
