import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword, vector } from "../runtime/literals.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let identity;
let content;

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

function post(overrides = {}) {
  const base = {
    id: "notes/shared",
    slug: "shared",
    title: "Shared",
    summary: "",
    body: "<p>body</p>",
    publishedAt: "2026-09-12",
    updatedAt: "2026-09-12",
    authors: ["owner"],
    tags: [],
    cover: null,
    draft: false,
    pinnedWeight: 0,
    provenance: mapOf([["provider", "markdown"], ["path", "content/posts/shared.md"]]),
    aliases: [],
    commentChannels: [],
    ...overrides,
  };
  return content.__GT_Post(
    base.id, base.slug, base.title, base.summary, base.body,
    base.publishedAt, base.updatedAt,
    vector(...base.authors), vector(...base.tags), base.cover, base.draft,
    base.pinnedWeight, base.provenance,
    vector(...base.aliases), vector(...base.commentChannels),
  );
}

const issuePost = (overrides = {}) => post({
  slug: "shared",
  provenance: mapOf([["provider", "issues"], ["path", "owner/repository#42"]]),
  ...overrides,
});

const config = (projections) => mapOf([["identity", mapOf([["conflict", k("fail")], ["projections", vector(...projections)]])]]);

const projection = (entries) => mapOf([["id", "notes/shared"], ...entries]);

function thrownBy(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-identity-"));
  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir", staging,
    "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  identity = await import(resolve(staging, "src/builder/identity.mjs"));
  content = await import(resolve(staging, "src/builder/content.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("distinct ids pass through unchanged", () => {
  const resolved = identity.resolve_identity(
    config([]),
    [post({ id: "notes/a" }), post({ id: "notes/b" })],
  );
  expect([...resolved].map((entry) => getOf(entry, "id"))).toEqual(["notes/a", "notes/b"]);
});

test("a repeated id without a declaration fails", () => {
  const error = thrownBy(() => identity.resolve_identity(
    config([]),
    [post(), issuePost()],
  ));
  expect(error.code).toBe("DOGFOOD-IDENTITY-001");
  expect(error.message).toContain("notes/shared");
});

test("a declaration resolves the conflict with the authority's article fields", () => {
  const resolved = identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ title: "Shared" })],
  );
  expect([...resolved].length).toBe(1);
  expect(getOf([...resolved][0], "title")).toBe("Shared");
  expect(getOf([...resolved][0], "slug")).toBe("shared");
});

test("a projection contributes its comment channels and aliases", () => {
  const channel = mapOf([["id", k("issue-native")], ["kind", k("issue")]]);
  const resolved = identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ commentChannels: [channel], aliases: ["old-shared"] })],
  );
  const merged = [...resolved][0];
  expect([...getOf(merged, "comment-channels")].length).toBe(1);
  expect([...getOf(merged, "aliases")]).toEqual(["old-shared"]);
});

test("an undeclared disagreement fails", () => {
  const error = thrownBy(() => identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ title: "Different title" })],
  ));
  expect(error.code).toBe("DOGFOOD-IDENTITY-004");
  expect(error.message).toContain("title");
});

test("a declared field is allowed to differ", () => {
  const resolved = identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["fields", vector(k("title"))],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ title: "Issued title" })],
  );
  expect(getOf([...resolved][0], "title")).toBe("Issued title");
});

test("a differing slug needs an alias or a declaration", () => {
  const error = thrownBy(() => identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ slug: "renamed" })],
  ));
  expect(error.code).toBe("DOGFOOD-IDENTITY-005");

  const withAlias = identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost({ slug: "renamed", aliases: ["renamed"] })],
  );
  expect(getOf([...withAlias][0], "slug")).toBe("shared");
});

test("a projection that names an uncollected record fails", () => {
  const error = thrownBy(() => identity.resolve_identity(
    config([projection([
      ["authority", k("markdown")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 99],
      ]))],
    ])]),
    [post(), issuePost()],
  ));
  expect(error.code).toBe("DOGFOOD-IDENTITY-007");
});

test("an authority that does not carry the id fails", () => {
  const error = thrownBy(() => identity.resolve_identity(
    config([projection([
      ["authority", k("discussion")],
      ["projections", vector(mapOf([
        ["source", k("issue")],
        ["repository", "owner/repository"],
        ["number", 42],
      ]))],
    ])]),
    [post(), issuePost()],
  ));
  expect(error.code).toBe("DOGFOOD-IDENTITY-006");
});
