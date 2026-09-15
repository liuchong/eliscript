import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword, vector } from "../runtime/literals.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let comments;
let issuesModule;
let renderer;

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

async function build(entry, outDir) {
  const result = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir", outDir, entry,
  ]);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || result.stdout.trim());
}

function commentRecord(id, options = {}) {
  return {
    id,
    body: "A **bold** comment.",
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T10:00:00Z",
    html_url: `https://github.com/owner/repository/issues/12#issuecomment-${id}`,
    user: { login: "reader", html_url: "https://github.com/reader" },
    ...options,
  };
}

function transportOf(pages) {
  const requested = [];
  return {
    requested,
    transport: (url) => {
      requested.push(url);
      const page = pages[Number(new URL(url).searchParams.get("page") ?? "1") - 1];
      if (page === undefined) return { status: 404, headers: {}, body: [] };
      return {
        status: 200,
        headers: page.next ? { link: `<${page.next}>; rel="next"` } : {},
        body: page.records,
      };
    },
  };
}

const declaration = (entries) => mapOf(entries);

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-comments-"));
  // One build of the project entry emits the whole graph, so both modules come
  // from the same tree.
  await build("examples/dogfood/src/builder/main.eli", staging);
  comments = await import(resolve(staging, "src/builder/comments.mjs"));
  issuesModule = await import(resolve(staging, "src/builder/issues.mjs"));
  renderer = await import(resolve(staging, "src/renderer/server.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a comment normalizes to the canonical flat shape", () => {
  const normalized = comments.normalize_comment(commentRecord(1, {
    body: "A **bold** comment with <script>alert(1)</script> markup.",
  }));
  expect(getOf(normalized, "id")).toBe(1);
  expect(getOf(getOf(normalized, "author"), "login")).toBe("reader");
  expect(getOf(normalized, "body")).toContain("<strong>bold</strong>");
  // The body is untrusted: markup is escaped rather than interpreted.
  expect(getOf(normalized, "body")).not.toContain("<script>");
  expect([...getOf(normalized, "replies")]).toEqual([]);
});

test("an enabled declaration is found and a disabled one is not", () => {
  const config = mapOf([
    ["channels", vector(
      declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", false], ["mode", k("snapshot")]]),
      declaration([["id", k("utterances")], ["kind", k("utterances")], ["enabled", true], ["mode", k("embed")]]),
    )],
  ]);
  expect(comments.channel_declaration(config, k("utterances"))).not.toBeNull();
  expect(comments.channel_declaration(config, k("issue"))).toBeNull();
  expect(comments.channel_declaration(config, k("giscus"))).toBeNull();
});

test("a live channel is declared but never fetched", async () => {
  const { transport, requested } = transportOf([]);
  const channel = await comments.native_channel(mapOf([
    ["comments", mapOf([["channels", vector(
      declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", true], ["mode", k("live")]]),
    )]])],
    ["kind", k("issue")],
    ["repository", "owner/repository"],
    ["number", 12],
    ["transport", transport],
  ]));
  expect(getOf(channel, "mode")).toBe(k("live"));
  expect([...getOf(channel, "items")]).toEqual([]);
  // A comment event must never become a build, so a build never asks.
  expect(requested.length).toBe(0);
});

test("a snapshot channel fetches, normalizes, and reports freshness", async () => {
  const { transport, requested } = transportOf([{
    records: [
      commentRecord(1),
      commentRecord(2, { updated_at: "2026-09-14T08:30:00Z" }),
    ],
  }]);
  const channel = await comments.native_channel(mapOf([
    ["comments", mapOf([["channels", vector(
      declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", true], ["mode", k("snapshot")]]),
    )]])],
    ["kind", k("issue")],
    ["repository", "owner/repository"],
    ["number", 12],
    ["transport", transport],
  ]));
  expect(getOf(channel, "mode")).toBe(k("snapshot"));
  expect(getOf(channel, "count")).toBe(2);
  expect(getOf(channel, "updated-at")).toBe("2026-09-14T08:30:00Z");
  expect(requested[0]).toContain("/issues/12/comments");
  // Issue comments are a flat ordered stream.
  const items = getOf(channel, "items");
  expect([...items].map((item) => getOf(item, "id"))).toEqual([1, 2]);
});

test("comment pagination completes or fails", async () => {
  const twoPages = transportOf([
    { records: [commentRecord(1)], next: "https://api.github.com/x?page=2" },
    { records: [commentRecord(2)] },
  ]);
  const channel = await comments.native_channel(mapOf([
    ["comments", mapOf([["channels", vector(
      declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", true], ["mode", k("snapshot")]]),
    )]])],
    ["kind", k("issue")],
    ["repository", "owner/repository"],
    ["number", 12],
    ["transport", twoPages.transport],
  ]));
  expect(getOf(channel, "count")).toBe(2);

  const failing = transportOf([{ records: [commentRecord(1)], next: "https://api.github.com/x?page=2" }]);
  const error = await (async () => {
    try {
      await comments.native_channel(mapOf([
        ["comments", mapOf([["channels", vector(
          declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", true], ["mode", k("snapshot")]]),
        )]])],
        ["kind", k("issue")],
        ["repository", "owner/repository"],
        ["number", 12],
        ["transport", failing.transport],
      ]));
      return null;
    } catch (thrown) { return thrown; }
  })();
  expect(error.code).toBe("DOGFOOD-GITHUB-001");
});

test("a collected issue carries its comment channel", async () => {
  const metadata = [
    "```dogfood", "id: notes/issued", "title: Issued", "date: 2026-09-12",
    "```", "", "Body.", "",
  ].join("\n");
  const listing = [{
    number: 12,
    html_url: "https://github.com/owner/repository/issues/12",
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    user: { login: "owner", id: "U_owner", type: "User" },
    body: metadata,
  }];
  const commentTransport = transportOf([{ records: [commentRecord(1)] }]);
  const routed = (url) => {
    if (url.includes("/comments")) return commentTransport.transport(url);
    return { status: 200, headers: {}, body: listing };
  };
  const result = await issuesModule.collect_issues(mapOf([
    ["source", mapOf([["repository", "owner/repository"], ["label", "blog"]])],
    ["publishing", mapOf([
      ["owner", mapOf([["login", "owner"], ["id", "U_owner"]])],
      ["coauthors", vector()],
    ])],
    ["adapters", vector()],
    ["identities", vector()],
    ["comments", mapOf([["channels", vector(
      declaration([["id", k("issue-native")], ["kind", k("issue")], ["enabled", true], ["mode", k("snapshot")]]),
    )]])],
    ["transport", routed],
  ]));
  const posts = [...getOf(result, "posts")];
  expect(posts.length).toBe(1);
  const channels = [...getOf(posts[0], "comment-channels")];
  expect(channels.length).toBe(1);
  expect(getOf(channels[0], "mode")).toBe(k("snapshot"));
  expect(getOf(channels[0], "count")).toBe(1);
});

/* --------------------------------------------------------------- rendering */

const channel = (entries) => mapOf(entries);
const post = (channels) => mapOf([["comment-channels", vector(...channels)]]);

test("a snapshot renders its comments", () => {
  const markup = renderer.render_comment_channels(post([
    channel([
      ["id", k("issue-native")], ["kind", k("issue")], ["mode", k("snapshot")],
      ["count", 2], ["updated-at", "2026-09-14T08:30:00Z"],
      ["items", vector(
        channel([["id", 1], ["body", "<p>First</p>"],
                 ["author", mapOf([["login", "reader"]])],
                 ["created-at", "2026-09-13T10:00:00Z"],
                 ["updated-at", "2026-09-13T10:00:00Z"],
                 ["url", "https://github.com/owner/repository/issues/12#issuecomment-1"]]),
        channel([["id", 2], ["body", "<p>Second</p>"],
                 ["author", mapOf([["login", "owner"]])],
                 ["created-at", "2026-09-14T08:30:00Z"],
                 ["updated-at", "2026-09-14T08:30:00Z"],
                 ["url", null]]),
      )],
    ]),
  ]));
  expect(markup).toContain('data-comment-provider="issue"');
  expect(markup).toContain("Comments (2)");
  expect(markup).toContain("Snapshot from 2026-09-14T08:30:00Z");
  expect(markup).toContain("<p>First</p>");
  expect(markup).toContain("reader");
  // No fabricated reply structure for a flat provider.
  expect(markup).not.toContain("<ul");
});

test("a live channel explains itself without pretending to have comments", () => {
  const markup = renderer.render_comment_channels(post([
    channel([
      ["id", k("issue-native")], ["kind", k("issue")], ["mode", k("live")],
      ["binding", mapOf([["repository", "owner/repository"], ["number", 12]])],
      ["count", null], ["updated-at", null], ["items", vector()],
    ]),
  ]));
  expect(markup).toContain('data-comments-binding="owner/repository#12"');
  expect(markup).toContain("served live");
  expect(markup).toContain("never triggers a build");
  expect(markup).not.toContain("comments-list");
});

test("an external adapter declares its mount region and nothing else", () => {
  const markup = renderer.render_comment_channels(post([
    channel([
      ["id", k("utterances")], ["kind", k("utterances")], ["mode", k("embed")],
      ["binding", mapOf([["repository", "owner/repository"], ["number", 12]])],
      ["items", vector()],
    ]),
  ]));
  expect(markup).toContain('data-comment-provider="utterances"');
  expect(markup).toContain("browser loads that provider");
  // The build does not script a third-party origin.
  expect(markup).not.toContain("<script");
});

test("a channel with no comments says so", () => {
  const markup = renderer.render_comment_channels(post([
    channel([
      ["id", k("issue-native")], ["kind", k("issue")], ["mode", k("snapshot")],
      ["count", 0], ["updated-at", ""], ["items", vector()],
    ]),
  ]));
  expect(markup).toContain("No comments in this snapshot.");
});

test("a post without channels renders nothing", () => {
  expect(renderer.render_comment_channels(post([]))).toBe("");
});
