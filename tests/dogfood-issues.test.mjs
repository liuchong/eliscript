import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword, vector } from "../runtime/literals.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let issues;

// Configuration values reach the provider as persistent maps with keyword
// keys, so the tests build the same shape the configuration loader produces.
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

function publisher(login, id) {
  return id === undefined ? mapOf([["login", login]]) : mapOf([["login", login], ["id", id]]);
}

function issue(number, options = {}) {
  return {
    number,
    html_url: `https://github.com/owner/repository/issues/${number}`,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    labels: [],
    // The owner is pinned to an immutable provider id in the fixture
    // configuration, so the fetched account must carry the same id.
    user: { login: "owner", id: "U_owner", type: "User" },
    ...options,
  };
}

function body(fields, markdown = "Body text.") {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return ["```dogfood", ...lines, "```", "", markdown, ""].join("\n");
}

function transportOf(pages) {
  const requested = [];
  return {
    requested,
    transport: (url) => {
      requested.push(url);
      const index = Number(new URL(url).searchParams.get("page") ?? "1");
      const page = pages[index - 1];
      if (page === undefined) return { status: 404, headers: {}, body: [] };
      return {
        status: 200,
        headers: page.next ? { link: `<${page.next}>; rel="next"` } : {},
        body: page.records,
      };
    },
  };
}

const utterances = () => mapOf([
  ["id", k("utterances")],
  ["carrier-kind", k("issue")],
  ["principal", "utterances-bot"],
  ["marker", "This issue was created from "],
]);

// Provider failures carry a stable code beside the message, so assertions
// check the code rather than matching prose.
function thrownBy(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}

async function rejectedBy(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const source = (label = "blog") => mapOf([
  ["repository", "owner/repository"],
  ["label", label],
]);
const publishing = () => mapOf([
  ["owner", publisher("owner", "U_owner")],
  ["coauthors", vector(publisher("writer-one"))],
]);

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-issues-"));
  const built = await run([
    COMPILER, "--no-cache",
    "--root", "examples/dogfood",
    "--out-dir", staging,
    "examples/dogfood/src/builder/issues.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  issues = await import(resolve(staging, "src/builder/issues.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the provider module compiles from the dogfood project", async () => {
  const module = await readFile(resolve(staging, "src/builder/issues.mjs"), "utf8");
  expect(module).toContain("eliscript/runtime/core/collection.mjs");
});

test("only the configured publisher set may publish", () => {
  const publishers = issues.publisher_set(publishing());
  expect([...publishers].length).toBe(2);
  const allowed = (author) => issues.authorized_author_QMARK_(publishers, author);

  expect(allowed({ login: "owner", id: "U_owner", type: "User" })).toBe(true);
  // Logins compare case-insensitively.
  expect(allowed({ login: "OWNER", id: "U_owner", type: "User" })).toBe(true);
  // A coauthor publishes without a pinned id.
  expect(allowed({ login: "writer-one", id: 7, type: "User" })).toBe(true);
  // An unlisted collaborator never publishes.
  expect(allowed({ login: "collaborator", id: 9, type: "User" })).toBe(false);
  // A pinned immutable id must agree with the fetched account.
  expect(allowed({ login: "owner", id: "U_other", type: "User" })).toBe(false);
  // Bots, applications, and deleted identities are denied.
  expect(allowed({ login: "owner", id: "U_owner", type: "Bot" })).toBe(false);
  expect(allowed({ login: "ghost", id: 1, type: "User" })).toBe(false);
});

test("a carrier needs principal, kind, and a known explicit identity", () => {
  const adapters = vector(utterances());
  const identities = vector("https://example.github.io/dogfood/posts/hello-dogfood/");
  const marker = "This issue was created from https://example.github.io/dogfood/posts/hello-dogfood/";
  const carrierBody = body({ id: "notes/carrier" }, marker);

  expect(issues.carrier_adapter(adapters, { login: "utterances-bot" }, carrierBody, identities))
    .toBe(k("utterances"));
  // The same marker from another author is not a binding.
  expect(issues.carrier_adapter(adapters, { login: "visitor" }, carrierBody, identities)).toBeNull();
  // The right principal with an unknown identity is not a binding.
  expect(issues.carrier_adapter(adapters, { login: "utterances-bot" }, carrierBody, vector("https://elsewhere/")))
    .toBeNull();
  // An article-shaped body alone never binds.
  expect(issues.carrier_adapter(adapters, { login: "utterances-bot" }, body({ id: "notes/x" }), identities))
    .toBeNull();
});

test("pagination follows the next relation to exhaustion", async () => {
  const { transport, requested } = transportOf([
    { records: [issue(1)], next: "https://api.github.com/repos/owner/repository/issues?page=2" },
    { records: [issue(2)] },
  ]);
  const records = await issues.fetch_issues(transport, "https://api.github.com/x?page=1");
  expect([...records].map((record) => record.number)).toEqual([1, 2]);
  expect(requested.length).toBe(2);
});

test("a failed page fails the provider", async () => {
  const { transport } = transportOf([{ records: [issue(1)], next: "https://api.github.com/x?page=2" }]);
  const error = await rejectedBy(issues.fetch_issues(transport, "https://api.github.com/x?page=1"));
  expect(error.code).toBe("DOGFOOD-GITHUB-001");
});

test("an article-shaped issue without metadata fails closed", async () => {
  const { transport } = transportOf([{ records: [issue(5, { body: "No metadata here." })] }]);
  const records = await issues.fetch_issues(transport, "https://api.github.com/x?page=1");
  const error = thrownBy(() => issues.normalize_issue(source(), [...records][0], vector()));
  expect(error.code).toBe("DOGFOOD-ISSUES-001");
  expect(error.message).toContain("owner/repository#5");
});

test("an authorized issue becomes a canonical post", async () => {
  const record = issue(12, {
    body: body({
      id: "notes/issued-article",
      title: "Issued article",
      date: "2026-09-12",
      tags: "[design, issues]",
      pinned: "2",
    }, "## Heading\n\nSome **bold** text."),
  });
  const post = issues.normalize_issue(source(), record, vector());
  expect(getOf(post, "id")).toBe("notes/issued-article");
  expect(getOf(post, "slug")).toBe("issued-article");
  expect([...getOf(post, "tags")]).toEqual(["design", "issues"]);
  expect(getOf(post, "pinned-weight")).toBe(2);
  expect(getOf(post, "published-at")).toBe("2026-09-12");
  const bodyHtml = getOf(post, "body");
  expect(bodyHtml).toContain("<h2>Heading</h2>");
  expect(bodyHtml).toContain("<strong>bold</strong>");
  expect(bodyHtml).not.toContain("```dogfood");
  const provenance = getOf(post, "provenance");
  expect(getOf(provenance, "provider")).toBe("issues");
  expect(getOf(provenance, "path")).toBe("owner/repository#12");
  expect(getOf(provenance, "url")).toBe("https://github.com/owner/repository/issues/12");
});

test("the collection separates carriers, unauthorized records, and posts", async () => {
  const { transport } = transportOf([{
    records: [
      issue(1, { body: body({ id: "notes/one", title: "One" }) }),
      issue(2, { user: { login: "visitor", id: 5, type: "User" }, body: body({ id: "notes/two", title: "Two" }) }),
      issue(3, {
        user: { login: "utterances-bot", id: 6, type: "Bot" },
        body: body({ id: "notes/carrier" },
          "This issue was created from https://example.github.io/dogfood/posts/hello-dogfood/"),
      }),
      issue(4, { pull_request: {}, body: body({ id: "notes/pr", title: "PR" }) }),
    ],
  }]);
  const result = await issues.collect_issues(mapOf([
    ["source", source()],
    ["publishing", publishing()],
    ["adapters", vector(utterances())],
    ["identities", vector("https://example.github.io/dogfood/posts/hello-dogfood/")],
    ["transport", transport],
  ]));
  expect([...getOf(result, "posts")].map((post) => getOf(post, "id"))).toEqual(["notes/one"]);
  expect(getOf(result, "records")).toBe(4);
  expect(getOf(result, "unauthorized")).toBe(1);
  expect(getOf(result, "carriers")).toBe(1);
});

test("a carrier with an article label is still a carrier", async () => {
  const adapters = vector(mapOf([
    ["id", k("giscus")],
    ["carrier-kind", k("issue")],
    ["principal", "giscus"],
    ["marker", "Canonical post: "],
  ]));
  const { transport } = transportOf([{
    records: [issue(9, {
      labels: [{ name: "blog" }],
      // The provisioned record belongs to the adapter principal, carries the
      // publication label, and still must not become an article.
      user: { login: "giscus", id: 7, type: "Bot" },
      body: body({ id: "notes/bound", title: "Looks like an article" }, "Canonical post: notes/bound"),
    })],
  }]);
  const result = await issues.collect_issues(mapOf([
    ["source", source()],
    ["publishing", publishing()],
    ["adapters", adapters],
    ["identities", vector("notes/bound")],
    ["transport", transport],
  ]));
  expect([...getOf(result, "posts")]).toEqual([]);
  expect(getOf(result, "carriers")).toBe(1);
});
