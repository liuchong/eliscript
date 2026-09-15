import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword, vector } from "../runtime/literals.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let discussions;
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

function author(login, id, kind = "User") {
  return { login, databaseId: id, __typename: kind };
}

function commentNode(id, login, body, replies = []) {
  return {
    id,
    author: author(login, id),
    body,
    createdAt: "2026-09-14T09:00:00Z",
    updatedAt: "2026-09-14T09:00:00Z",
    url: `https://github.com/owner/repository/discussions/17#discussioncomment-${id}`,
    replies: { nodes: replies, pageInfo: { hasNextPage: false, endCursor: null } },
  };
}

function discussionNode(number, options = {}) {
  return {
    number,
    title: "Discussion title",
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
    url: `https://github.com/owner/repository/discussions/${number}`,
    category: { name: "Blog" },
    answerChosenAt: null,
    author: author("owner", "U_owner"),
    comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    ...options,
  };
}

function metadata(fields, body = "Body text.") {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return ["```dogfood", ...lines, "```", "", body, ""].join("\n");
}

function graphqlTransport(pages) {
  const calls = [];
  return {
    calls,
    transport: (request) => {
      const payload = JSON.parse(request.body);
      calls.push(payload);
      const cursor = payload.variables.cursor;
      const page = cursor === null || cursor === undefined ? 0 : Number(cursor);
      const record = pages[page];
      if (record === undefined) return { status: 200, headers: {}, body: { data: null } };
      return {
        status: 200,
        headers: {},
        body: { data: { repository: { discussions: record } } },
      };
    },
  };
}

const source = (extra = []) => mapOf([
  ["repository", "owner/repository"],
  ["category", "Blog"],
  ...extra,
]);

const publishing = () => mapOf([
  ["owner", mapOf([["login", "owner"], ["id", "U_owner"]])],
  ["coauthors", vector()],
]);

const discussionDeclaration = (mode = "snapshot") => mapOf([["channels", vector(
  mapOf([["id", k("discussion-native")], ["kind", k("discussion")],
         ["enabled", true], ["mode", k(mode)]]),
)]]);

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-discussions-"));
  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir", staging,
    "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  discussions = await import(resolve(staging, "src/builder/discussions.mjs"));
  renderer = await import(resolve(staging, "src/renderer/server.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a repository reference splits into owner and name", () => {
  expect([...discussions.repository_parts("owner/repository")]).toEqual(["owner", "repository"]);
  const error = (() => {
    try { discussions.repository_parts("repository"); return null; } catch (thrown) { return thrown; }
  })();
  expect(error.code).toBe("DOGFOOD-DISCUSSIONS-001");
});

test("the query omits comments unless a snapshot asks for them", () => {
  const withComments = discussions.discussions_query(true);
  const withoutComments = discussions.discussions_query(false);
  expect(withComments).toContain("comments(first:");
  expect(withComments).toContain("replies(first:");
  // A live channel is never fetched during a build.
  expect(withoutComments).not.toContain("comments(first:");
  // Category and author are needed either way.
  expect(withoutComments).toContain("category { name }");
  expect(withoutComments).toContain("databaseId");
});

test("discussions paginate by cursor to exhaustion", async () => {
  const { transport, calls } = graphqlTransport([
    { pageInfo: { hasNextPage: true, endCursor: "1" }, nodes: [discussionNode(1)] },
    { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [discussionNode(2)] },
  ]);
  const nodes = await discussions.fetch_discussions(transport, source(), true);
  expect([...nodes].map((node) => node.number)).toEqual([1, 2]);
  expect(calls.length).toBe(2);
  expect(calls[0].variables.owner).toBe("owner");
  expect(calls[1].variables.cursor).toBe("1");
});

test("a GraphQL error payload fails the provider", async () => {
  const transport = () => ({ status: 200, headers: {}, body: { errors: [{ message: "nope" }] } });
  const error = await (async () => {
    try { await discussions.fetch_discussions(transport, source(), true); return null; }
    catch (thrown) { return thrown; }
  })();
  expect(error.code).toBe("DOGFOOD-DISCUSSIONS-003");
});

test("a reply tree stays a tree", () => {
  const tree = discussions.reply_tree([
    commentNode("c1", "reader", "Top", [
      commentNode("c2", "owner", "Reply", [commentNode("c3", "reader", "Nested")]),
    ]),
  ]);
  expect([...tree].length).toBe(1);
  const replies = [...getOf([...tree][0], "replies")];
  expect(replies.length).toBe(1);
  expect(getOf([...getOf(replies[0], "replies")][0], "id")).toBe("c3");
});

test("a comment page that overflows fails rather than truncating", () => {
  const record = discussionNode(17, {
    comments: { pageInfo: { hasNextPage: true, endCursor: "x" }, nodes: [] },
  });
  const error = (() => {
    try { discussions.comment_tree(record); return null; } catch (thrown) { return thrown; }
  })();
  expect(error.code).toBe("DOGFOOD-DISCUSSIONS-007");
});

test("the category is an article selector and never publication authority", () => {
  const blog = discussionNode(1);
  const other = discussionNode(2, { category: { name: "General" } });
  expect(discussions.allowed_category_QMARK_(source(), blog)).toBe(true);
  expect(discussions.allowed_category_QMARK_(source(), other)).toBe(false);
});

test("only the publisher set publishes, and carriers never become articles", async () => {
  const { transport } = graphqlTransport([{
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [
      discussionNode(1, { body: metadata({ id: "notes/one", title: "One" }) }),
      discussionNode(2, {
        author: author("visitor", 9),
        body: metadata({ id: "notes/two", title: "Two" }),
      }),
      discussionNode(3, { category: { name: "General" } }),
    ],
  }]);
  const result = await discussions.collect_discussions(mapOf([
    ["source", source()],
    ["publishing", publishing()],
    ["adapters", vector()],
    ["identities", vector()],
    ["comments", discussionDeclaration()],
    ["transport", transport],
  ]));
  expect([...getOf(result, "posts")].map((post) => getOf(post, "id"))).toEqual(["notes/one"]);
  expect(getOf(result, "records")).toBe(3);
  expect(getOf(result, "unauthorized")).toBe(1);
});

test("a collected discussion carries a nested comment channel", async () => {
  const { transport } = graphqlTransport([{
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [discussionNode(17, {
      body: metadata({ id: "notes/threaded", title: "Threaded" }, "Body."),
      comments: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [commentNode("c1", "reader", "First", [commentNode("c2", "owner", "Second")])],
      },
    })],
  }]);
  const result = await discussions.collect_discussions(mapOf([
    ["source", source()],
    ["publishing", publishing()],
    ["adapters", vector()],
    ["identities", vector()],
    ["comments", discussionDeclaration("snapshot")],
    ["transport", transport],
  ]));
  const post = [...getOf(result, "posts")][0];
  const channels = [...getOf(post, "comment-channels")];
  expect(channels.length).toBe(1);
  expect(getOf(channels[0], "kind")).toBe(k("discussion"));
  expect(getOf(channels[0], "count")).toBe(1);
  const items = [...getOf(channels[0], "items")];
  expect([...getOf(items[0], "replies")].length).toBe(1);
});

test("a live discussion channel is declared and no comments are requested", async () => {
  const { transport, calls } = graphqlTransport([{
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [discussionNode(17, { body: metadata({ id: "notes/live", title: "Live" }) })],
  }]);
  const result = await discussions.collect_discussions(mapOf([
    ["source", source()],
    ["publishing", publishing()],
    ["adapters", vector()],
    ["identities", vector()],
    ["comments", discussionDeclaration("live")],
    ["transport", transport],
  ]));
  const post = [...getOf(result, "posts")][0];
  const channels = [...getOf(post, "comment-channels")];
  expect(getOf(channels[0], "mode")).toBe(k("live"));
  expect([...getOf(channels[0], "items")]).toEqual([]);
  expect(calls[0].query).not.toContain("comments(first:");
});

test("the renderer nests discussion replies instead of flattening them", () => {
  const comment = (id, body, replies = []) => mapOf([
    ["id", id],
    ["body", body],
    ["author", mapOf([["login", "reader"]])],
    ["created-at", "2026-09-14T09:00:00Z"],
    ["updated-at", "2026-09-14T09:00:00Z"],
    ["url", null],
    ["replies", vector(...replies)],
  ]);
  const channel = mapOf([
    ["id", k("discussion-native")],
    ["kind", k("discussion")],
    ["mode", k("snapshot")],
    ["count", 1],
    ["updated-at", "2026-09-14T09:00:00Z"],
    ["items", vector(comment("c1", "<p>First</p>", [comment("c2", "<p>Second</p>")]))],
  ]);
  const markup = renderer.render_comment_channels(
    mapOf([["comment-channels", vector(channel)]]),
  );
  expect(markup).toContain('data-comment-provider="GitHub Discussions"');
  expect(markup).toContain("comment-replies");
  expect(markup).toContain("<p>Second</p>");
  // The reply is nested inside its parent list item, not beside it.
  const parent = markup.indexOf("<p>First</p>");
  const reply = markup.indexOf("<p>Second</p>");
  const parentEnd = markup.indexOf("</li>", parent);
  expect(reply).toBeGreaterThan(parent);
  expect(reply).toBeLessThan(parentEnd);
});
