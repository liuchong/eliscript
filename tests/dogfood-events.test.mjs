import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { get as cget } from "../runtime/core/collection.mjs";
import { hashMap, keyword } from "../runtime/literals.mjs";

// Compiled Eliscript returns persistent maps, whose members are read through
// the collection protocol rather than as JavaScript properties.
const fieldOf = (value, name, fallback = null) => cget(value, keyword(name), fallback);

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");
const DEMO = resolve(ROOT, "examples/dogfood/_demo");

let staging;
let program;
let project;
let bundle;
let events;

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

// A run reacts to an event and reports through the Action output file.
async function react(eventName, payload, extra = []) {
  const eventFile = join(staging, `event-${eventName}.json`);
  const outputFile = join(staging, `outputs-${eventName}-${extra.length}.txt`);
  await writeFile(eventFile, JSON.stringify(payload), "utf8");
  await writeFile(outputFile, "", "utf8");
  const result = await run([
    process.execPath, program, "--root", project,
    "--output", "site", "--browser-bundle", bundle,
    "--event-file", eventFile, ...extra,
  ], {
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_OUTPUT: outputFile,
      INPUT_PREVIEW: extra.includes("--preview") ? "true" : "",
    },
  });
  const outputs = await readFile(outputFile, "utf8");
  return { ...result, outputs };
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
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-events-"));
  project = join(staging, "project");
  await cp(DEMO, project, { recursive: true });

  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  program = join(staging, "build/src/builder/main.mjs");
  events = await import(join(staging, "build/src/builder/events.mjs"));

  // The browser entry is compiled separately from the builder, as the project
  // build does, and bundled into the asset the run requires.
  const browserSource = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    join(staging, "browser-source"), "examples/dogfood/src/renderer/browser.eli",
  ]);
  if (browserSource.exitCode !== 0) {
    throw new Error(browserSource.stderr.trim() || browserSource.stdout.trim());
  }
  const bundled = await run([
    "bun", "build", join(staging, "browser-source/src/renderer/browser.mjs"),
    "--target=browser", "--format=iife", "--outfile", join(staging, "browser.js"),
  ]);
  if (bundled.exitCode !== 0) throw new Error(bundled.stderr.trim() || bundled.stdout.trim());
  bundle = join(staging, "browser.js");
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("events are classified by their subject", () => {
  for (const name of ["push", "schedule", "workflow_dispatch", "issues", "release"]) {
    expect(fieldOf(events.classify_event(name, { action: "opened" }), "subject"))
      .toEqual(keyword("articles"));
  }
  for (const name of ["issue_comment", "discussion_comment", "discussions"]) {
    expect(fieldOf(events.classify_event(name, { action: "created" }), "subject"))
      .toEqual(keyword("comments"));
  }
  // An unrelated event cannot be assumed to have changed anything.
  expect(fieldOf(events.classify_event("star", {}), "subject")).toEqual(keyword("unknown"));
  expect(fieldOf(events.classify_event("star", {}), "action", "")).toBe("");
});

test("the article policy decides which events rebuild the site", () => {
  const builds = (policy, event) => events.article_builds_QMARK_(keyword(policy), event);
  // Repository content only.
  expect(builds("push", "push")).toBe(true);
  expect(builds("push", "schedule")).toBe(false);
  expect(builds("push", "issues")).toBe(false);
  // Eligible content events only.
  expect(builds("event", "issues")).toBe(true);
  expect(builds("event", "push")).toBe(false);
  // Bounded polling.
  expect(builds("scheduled", "schedule")).toBe(true);
  expect(builds("scheduled", "push")).toBe(false);
  // Dispatch only.
  expect(builds("manual", "push")).toBe(false);
  expect(builds("manual", "schedule")).toBe(false);
  // Push, content events, and scheduled reconciliation.
  for (const event of ["push", "issues", "release", "schedule"]) {
    expect(builds("hybrid", event)).toBe(true);
  }
  // A dispatched run is a request, whatever the policy says.
  for (const policy of ["push", "event", "scheduled", "manual", "hybrid"]) {
    expect(builds(policy, "workflow_dispatch")).toBe(true);
  }
});

test("the policy decides a real classification, not just the helper", () => {
  const decide = (policy, eventName) => {
    const config = hashMap(keyword("refresh"), hashMap(keyword("articles"), keyword(policy)));
    return fieldOf(events.build_decision(config, events.classify_event(eventName, {}), false), "build", null);
  };
  expect(decide("push", "push")).toBe(true);
  expect(decide("push", "schedule")).toBe(false);
  expect(decide("scheduled", "schedule")).toBe(true);
  expect(decide("manual", "push")).toBe(false);
  expect(decide("hybrid", "release")).toBe(true);
});

test("only the opt-in comment policy builds on a comment event", () => {
  const decide = (policy) => {
    const config = hashMap(keyword("refresh"), hashMap(keyword("comments"), keyword(policy)));
    return fieldOf(
      events.build_decision(config, events.classify_event("issue_comment", {}), false),
      "build", null,
    );
  };
  for (const policy of ["runtime", "external", "scheduled", "manual", "hybrid"]) {
    expect(decide(policy)).toBe(false);
  }
  // `:event` is the documented opt-in that lets a comment start a build.
  expect(decide("event")).toBe(true);
});

test("a comment subject defers for both runtime and snapshot channels", () => {
  // The classification is a persistent map, so a plain object would silently
  // read as the default and defer for the wrong reason.
  // A classification carries the event it came from: the policy is a function
  // of both.
  const classified = (subject, eventName = "push") => hashMap(
    keyword("subject"), keyword(subject), keyword("event"), eventName,
  );
  const comments = classified("comments");
  const runtime = events.build_decision({ refresh: {} }, comments, false);
  expect(fieldOf(runtime, "build", null)).toBe(false);
  expect(fieldOf(runtime, "reason")).toBe("deferred");

  const snapshot = events.build_decision(
    { refresh: { comments: "snapshot" } }, comments, false,
  );
  expect(fieldOf(snapshot, "build", null)).toBe(false);
  expect(fieldOf(snapshot, "reason")).toBe("deferred");

  // A forced run overrides the classification.
  expect(fieldOf(events.build_decision({ refresh: {} }, comments, true), "reason")).toBe("forced");

  // An article subject builds, and no event file at all is a requested build.
  expect(fieldOf(
    events.build_decision({ refresh: {} }, classified("articles"), false), "build", null,
  )).toBe(true);
  expect(fieldOf(events.classify_event("workflow_dispatch", {}), "subject"))
    .toEqual(keyword("articles"));
});

test("a comment event defers instead of building", async () => {
  const result = await react("issue_comment", { action: "created" });
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("built=false");
  expect(result.outputs).toContain("reason=deferred");
  expect(result.outputs).toContain("subject=comments");
  // Nothing was written: a comment cannot change the tree.
  expect(await exists(join(project, "site"))).toBe(false);
});

test("a push builds and reports the fingerprint as its cache key", async () => {
  const result = await react("push", { ref: "refs/heads/master" });
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("built=true");
  expect(result.outputs).toContain("reason=changed");
  expect(result.outputs).toMatch(/cache-key=dogfood-[0-9a-f]{64}/u);
  expect(await exists(join(project, "site/index.html"))).toBe(true);
});

test("a forced run builds even when the event cannot change the site", async () => {
  const result = await react("issue_comment", { action: "created" }, ["--force"]);
  expect(result.exitCode).toBe(0);
  expect(result.outputs).toContain("built=true");
  expect(result.outputs).toContain("reason=forced");
});

test("production output excludes drafts", async () => {
  const files = (await run(["ls", join(project, "site/posts")])).stdout;
  expect(files).not.toContain("demo-draft");
  expect(files).toContain("welcome");
});

test("preview output includes drafts, unindexable and unadvertised", async () => {
  const result = await react("workflow_dispatch", {}, ["--preview"]);
  expect(result.exitCode).toBe(0);
  const output = join(project, "site");

  const draft = await readFile(join(output, "posts/demo-draft/index.html"), "utf8");
  expect(draft).toContain('<meta name="robots" content="noindex">');
  expect(draft).toContain("preview-banner");
  expect(draft).toContain("must not be indexed");

  // A preview tree is a review surface: no feed, no sitemap, and robots asks
  // for nothing to be crawled.
  expect(await exists(join(output, "feed.xml"))).toBe(false);
  expect(await exists(join(output, "sitemap.xml"))).toBe(false);
  expect(await readFile(join(output, "robots.txt"), "utf8"))
    .toBe("User-agent: *\nDisallow: /\n");

  // The published tree still carries the feed, the sitemap, and an allowing
  // robots file.
  const published = await react("workflow_dispatch", {});
  expect(published.exitCode).toBe(0);
  expect(await exists(join(output, "feed.xml"))).toBe(true);
  expect(await exists(join(output, "sitemap.xml"))).toBe(true);
  expect(await readFile(join(output, "robots.txt"), "utf8")).toContain("Allow: /");
});

test("a previous manifest that disagrees stops the run before it replaces output", async () => {
  const manifest = join(project, "site/_dogfood/build.json");
  const recorded = JSON.parse(await readFile(manifest, "utf8"));
  const wrong = join(staging, "wrong-manifest.json");
  await writeFile(wrong, JSON.stringify({ ...recorded, contentFingerprint: "0".repeat(64) }));

  const result = await react("push", { ref: "refs/heads/master" }, [
    "--previous-manifest", wrong,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("DOGFOOD-BUILD-004");
  expect(result.outputs).toContain("reason=failed");
  // The existing tree is untouched.
  expect(await readFile(join(project, "robots.txt").replace("project/robots.txt", "project/site/robots.txt"), "utf8"))
    .toContain("Allow: /");
  expect(await exists(join(project, "site.staging"))).toBe(false);

  const honest = await react("push", { ref: "refs/heads/master" }, [
    "--previous-manifest", manifest,
  ]);
  expect(honest.exitCode).toBe(0);
  expect(honest.outputs).toContain("built=true");
});

test("a missing previous manifest is reported rather than ignored", async () => {
  const result = await react("push", { ref: "refs/heads/master" }, [
    "--previous-manifest", join(staging, "absent.json"),
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("DOGFOOD-BUILD-005");
});
