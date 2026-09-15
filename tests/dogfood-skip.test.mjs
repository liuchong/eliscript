import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { hashMap, keyword, vector } from "../runtime/literals.mjs";
import { get as cget } from "../runtime/core/collection.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const DEMO = resolve(ROOT, "examples/dogfood/_demo");

let staging;
let program;
let preflight;
let events;
let project;
let bundle;

const k = (name) => keyword(name);
const mapOf = (entries) => hashMap(...entries.flatMap(([key, value]) => [k(key), value]));

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...options.env },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** Runs the builder as an Action would, and reads what it reported. */
async function react(eventName, payload, extra = []) {
  const eventFile = join(staging, `event-${eventName}-${extra.join("")}.json`);
  const outputFile = join(staging, `outputs-${eventName}-${extra.join("")}.txt`);
  await writeFile(eventFile, JSON.stringify(payload), "utf8");
  await writeFile(outputFile, "", "utf8");
  const result = await run([
    process.execPath, program, "--root", project, "--output", "site",
    "--browser-bundle", bundle, "--event-file", eventFile, ...extra,
  ], { env: { GITHUB_EVENT_NAME: eventName, GITHUB_OUTPUT: outputFile } });
  return { ...result, outputs: await readFile(outputFile, "utf8") };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function mtime(path) {
  return (await stat(path)).mtimeMs;
}

// The pre-flight cases need the remote source enabled, because that is what
// makes an issue payload selectable; the render cases use Markdown only, so a
// build never reaches the network.
const MARKDOWN_SOURCE = '{:id :posts :kind :markdown :enabled t :directory "content/posts"}';
const REMOTE_SOURCE = '{:id :notes :kind :issues :enabled t'
  + ' :repository "owner/repository" :label "published"}';

async function useSources(sources) {
  await writeFile(join(project, "dogfood.config.eli"), config(sources), "utf8");
}

const config = (sources
  = `[${MARKDOWN_SOURCE} ${REMOTE_SOURCE}]`) => `(module dogfood.config
  (defconst config
    {:schema-version 1
     :site {:title "T" :base-url "https://example.github.io/t/" :language "en"}
     :sources ${sources}
     :publishing {:owner {:login "owner" :id "U_owner"} :coauthors []}
     :adapters
     [{:id :utterances :carrier-kind :issue
       :principal "utterances-bot" :marker "Canonical post: "}]
     :identity {:conflict :fail :projections []}
     :comments {:presentation :tabs :channels []}
     :refresh {:articles :hybrid :comments :runtime :no-change :skip}
     :output {:directory "site"}})
  (export config))
`;

const issuePayload = (over = {}) => ({
  repository: { full_name: "owner/repository" },
  issue: Object.assign({
    number: 42,
    labels: [{ name: "published" }],
    user: { login: "owner", id: "U_owner", type: "User" },
    body: "An article body.",
  }, over),
});

const decide = (eventName, payload) => {
  const decision = preflight.skip_decision(configForDecision, events.classify_event(eventName, payload));
  return { skip: cget(decision, k("skip"), null), detail: cget(decision, k("detail"), "") };
};

const configForDecision = mapOf([
  ["sources", vector(mapOf([
    ["id", k("notes")], ["kind", k("issues")], ["enabled", true],
    ["repository", "owner/repository"], ["label", "published"],
  ]))],
  ["publishing", mapOf([
    ["owner", mapOf([["login", "owner"], ["id", "U_owner"]])],
    ["coauthors", vector(mapOf([["login", "writer"]]))],
  ])],
  ["adapters", vector(mapOf([
    ["id", k("utterances")], ["carrier-kind", k("issue")],
    ["principal", "utterances-bot"], ["marker", "Canonical post: "],
  ]))],
]);

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-skip-"));
  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  program = join(staging, "build/src/builder/main.mjs");
  preflight = await import(join(staging, "build/src/builder/preflight.mjs"));
  events = await import(join(staging, "build/src/builder/events.mjs"));

  bundle = join(staging, "browser.js");
  await writeFile(bundle, "(() => {})();\n", "utf8");

  project = join(staging, "project");
  await cp(DEMO, project, { recursive: true });
  await useSources(`[${MARKDOWN_SOURCE} ${REMOTE_SOURCE}]`);
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a publishable record is not skipped", () => {
  expect(decide("issues", issuePayload()).skip).toBe(false);
  // A coauthor publishes without a pinned id.
  expect(decide("issues", issuePayload({ user: { login: "writer", id: 7 } })).skip).toBe(false);
  // Events that carry no article record are ordinary builds.
  expect(decide("push", { repository: { full_name: "owner/repository" } }).skip).toBe(false);
  expect(decide("schedule", {}).skip).toBe(false);
});

test("a record that cannot be published is skipped with its reason", () => {
  const cases = [
    [issuePayload({ pull_request: {} }), "pull request"],
    [issuePayload({ labels: [] }), "not labelled"],
    [issuePayload({ user: { login: "stranger", id: 9 } }), "not a publisher"],
    [issuePayload({ user: { login: "owner", id: "U_other" } }), "not a publisher"],
    [issuePayload({ user: { login: "utterances-bot", id: 5 }, body: "Canonical post: notes/x" }), "comment carrier"],
  ];
  for (const [payload, expected] of cases) {
    const decision = decide("issues", payload);
    expect(decision.skip).toBe(true);
    expect(decision.detail).toContain(expected);
  }
  // A record from a repository no enabled source selects.
  const other = decide("issues", { repository: { full_name: "other/repo" }, issue: issuePayload().issue });
  expect(other.skip).toBe(true);
  expect(other.detail).toContain("no enabled issues source");
});

test("an unauthorized article event ends the run without building", async () => {
  const result = await react("issues", issuePayload({ user: { login: "stranger", id: 9 } }));
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("built=false");
  expect(result.outputs).toContain("reason=skipped");
  expect(result.stdout).toContain("skipped");
  // Nothing was fetched and nothing was written: the decision is made from the
  // payload before the build.
  expect(await exists(join(project, "site"))).toBe(false);
  expect(await exists(join(project, "site.staging"))).toBe(false);
});

test("a pull request event ends the run the same way", async () => {
  const result = await react("issues", issuePayload({ pull_request: { url: "x" } }));
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("reason=skipped");
  expect(await exists(join(project, "site"))).toBe(false);
});

test("an unchanged build is reported without rendering or writing", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  // Publish first, from a plain push.
  const first = await react("push", { repository: { full_name: "owner/repository" } });
  expect(first.exitCode).toBe(0);
  expect(first.outputs).toContain("built=true");
  const page = join(project, "site/index.html");
  const manifest = join(project, "site/_dogfood/build.json");
  const pageTime = await mtime(page);
  const manifestTime = await mtime(manifest);

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await react("push", { repository: { full_name: "owner/repository" } });
  expect(second.exitCode).toBe(0);
  expect(second.outputs).toContain("built=false");
  expect(second.outputs).toContain("reason=no-change");
  expect(second.stdout).toContain("no change");
  // Layer 3 says no render: neither the page nor the manifest was touched.
  expect(await mtime(page)).toBe(pageTime);
  expect(await mtime(manifest)).toBe(manifestTime);
});

test("a forced run renders even when the inputs are unchanged", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  const forced = await react("push", { repository: { full_name: "owner/repository" } }, ["--force"]);
  expect(forced.exitCode).toBe(0);
  expect(forced.outputs).toContain("built=true");
  expect(forced.outputs).toContain("reason=forced");
});

test("a changed input is rendered", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  const before = await readFile(join(project, "site/_dogfood/build.json"), "utf8");
  await writeFile(
    join(project, "content/posts/0001-welcome.md"),
    `${await readFile(join(project, "content/posts/0001-welcome.md"), "utf8")}\nA new line.\n`,
    "utf8",
  );
  const result = await react("push", { repository: { full_name: "owner/repository" } });
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("built=true");
  expect(result.outputs).toContain("reason=changed");
  const after = await readFile(join(project, "site/_dogfood/build.json"), "utf8");
  expect(after).not.toBe(before);
});

test("the fingerprint decides, not the clock", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  // The first run may publish or find nothing to publish, depending on what an
  // earlier test left behind. From then on every run must agree: the digest is
  // a property of the inputs, not of when the run happened.
  const runs = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await react("push", { repository: { full_name: "owner/repository" } });
    expect(result.exitCode).toBe(0);
    runs.push(result.outputs);
  }
  expect(runs[1]).toContain("reason=no-change");
  expect(runs[2]).toContain("reason=no-change");
  const fingerprints = runs.map((outputs) =>
    /content-fingerprint=([0-9a-f]{64})/u.exec(outputs)[1]);
  expect(new Set(fingerprints).size).toBe(1);
});

test("the manifest records the digest that decided the run", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  const manifest = JSON.parse(await readFile(join(project, "site/_dogfood/build.json"), "utf8"));
  expect(manifest.inputDigest).toMatch(/^[0-9a-f]{64}$/u);
  expect(manifest.contentFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  // The two answer different questions: inputs may be unchanged while a forced
  // render still produces a fresh document digest.
  expect(manifest.inputDigest).not.toBe(undefined);
});

test("the files a build publishes are the ones it listed", async () => {
  await useSources(`[${MARKDOWN_SOURCE}]`);
  const entries = await readdir(join(project, "site"));
  expect(entries).toContain("index.html");
  expect(entries).toContain("_dogfood");
  expect(entries).not.toContain("site.staging");
});
