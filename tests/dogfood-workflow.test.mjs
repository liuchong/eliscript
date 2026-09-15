import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PROJECT = resolve(ROOT, "examples/dogfood");
const TEMPLATE = resolve(PROJECT, "templates/workflows/dogfood.yml");
const CONFIG = resolve(PROJECT, "dogfood.config.eli");

let template;
let packaged;

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

let staging;

beforeAll(async () => {
  template = await readFile(TEMPLATE, "utf8");
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-workflow-"));
  // The shipped copy is the one a consumer receives, so it is the one the
  // requirements are checked against.
  const result = await run(["bun", "run", "package:dogfood"]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim());
  }
  packaged = await readFile(resolve(PROJECT, "dist/action/workflow.yml"), "utf8");
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the template checks out the consumer repository and invokes the action", () => {
  expect(packaged).toMatch(/uses: actions\/checkout@[0-9a-f]{40}\n/u);
  // The package is published from its own repository, so that is the
  // reference a consumer resolves.
  expect(packaged).toMatch(/uses: liuchong\/dogfood@[0-9a-f]{40}\n/u);
});

test("the shipped copy pins the action to a real commit digest", () => {
  // The placeholder is packaging input, not an artifact: a consumer must never
  // receive a reference that cannot resolve.
  expect(packaged).not.toContain("PLACEHOLDER");
  expect(template).toContain("PLACEHOLDER_ACTION_DIGEST");
});

test("uploads are skipped when the build produced nothing", () => {
  expect(packaged).toContain("if: steps.build.outputs.built == 'true'");
  expect(packaged).toContain("needs.build.outputs.built == 'true'");
});

test("the artifact upload and the deployment use separate jobs", () => {
  expect(packaged).toContain("uses: actions/upload-pages-artifact@");
  expect(packaged).toContain("uses: actions/deploy-pages@");
  const jobs = packaged.slice(packaged.indexOf("\njobs:"));
  const deployAt = jobs.indexOf("\n  deploy:");
  const buildAt = jobs.indexOf("\n  build:");
  expect(buildAt).toBeGreaterThan(-1);
  expect(deployAt).toBeGreaterThan(buildAt);
  // Deployment is the only place a deployment token exists, and it is
  // protected by the environment.
  expect(jobs.slice(deployAt)).toContain("name: github-pages");
  expect(jobs.slice(buildAt, deployAt)).not.toContain("name: github-pages");
});

test("permissions are the documented minimum", () => {
  const permissions = packaged.slice(
    packaged.indexOf("\npermissions:"), packaged.indexOf("\nconcurrency:"),
  );
  for (const granted of [
    "contents: read", "issues: read", "discussions: read",
    "pages: write", "id-token: write",
  ]) {
    expect(permissions).toContain(granted);
  }
  expect(permissions).not.toContain("write-all");
  expect(permissions).not.toContain("contents: write");
});

test("a build may be cancelled but a deployment may not", () => {
  // Specification 0005 Layer 5: concurrency protects the queue during a build,
  // and a deployment that has started must not be interrupted.
  const buildGroup = /^      group: dogfood-build-\$\{\{ github\.ref \}\}\n      cancel-in-progress: true$/mu;
  const deployGroup = /^      group: dogfood-pages\n      cancel-in-progress: false$/mu;
  expect(packaged).toMatch(buildGroup);
  expect(packaged).toMatch(deployGroup);

  // One build group and one deployment environment, per specification 0007.
  expect((packaged.match(/^      group: /gmu) ?? []).length).toBe(2);
  expect((packaged.match(/^    environment:/gmu) ?? []).length).toBe(1);
  expect((packaged.match(/^      name: github-pages$/gmu) ?? []).length).toBe(1);
});

test("each job holds only the permissions it needs", () => {
  const workflow = packaged.slice(packaged.indexOf("\njobs:"));
  const build = workflow.slice(workflow.indexOf("\n  build:"), workflow.indexOf("\n  deploy:"));
  const deploy = workflow.slice(workflow.indexOf("\n  deploy:"));
  // The build reads records and can never write a deployment.
  expect(build).toContain("contents: read");
  expect(build).toContain("issues: read");
  expect(build).toContain("discussions: read");
  expect(build).not.toContain("pages: write");
  expect(build).not.toContain("id-token: write");
  // The deployment writes pages and holds the token, and reads nothing else.
  expect(deploy).toContain("pages: write");
  expect(deploy).toContain("id-token: write");
  expect(deploy).not.toContain("discussions: read");
});

test("the jobs are bounded and the checkout is shallow", () => {
  expect(packaged).toMatch(/timeout-minutes: \d+/u);
  expect((packaged.match(/timeout-minutes: /gu) ?? []).length).toBe(2);
  expect(packaged).toContain("fetch-depth: 1");
  // Only the manifest is cached: a few hundred bytes decide the next run,
  // while the artifact upload still ships the whole tree.
  const cache = packaged.slice(packaged.indexOf("- id: restore"), packaged.indexOf("- id: build"));
  expect(cache).toContain("path: _site/_dogfood");
  expect(cache).not.toMatch(/path: _site$/mu);
  const upload = packaged.slice(packaged.indexOf("upload-pages-artifact"));
  expect(upload).toMatch(/path: _site$/mu);
});

test("a dispatch can ask for a rebuild", () => {
  expect(packaged).toContain("force:");
  expect(packaged).toContain("type: boolean");
  expect(packaged).toContain("force: ${{ inputs.force || 'false' }}");
});

test("creation events are not in the default template", () => {
  // Neither can be author-filtered before a runner starts, so the default
  // policy leaves them out and says how a new record still reaches the site.
  const triggers = packaged.slice(0, packaged.indexOf("\npermissions:"));
  const issueTypes = /^  issues:\n    types: \[([^\]]+)\]$/mu.exec(triggers);
  const discussionTypes = /^  discussion:\n    types: \[([^\]]+)\]$/mu.exec(triggers);
  expect(issueTypes).not.toBeNull();
  expect(discussionTypes).not.toBeNull();
  // Types are compared as whole words: "reopened" contains "opened".
  const issueList = issueTypes[1].split(",").map((type) => type.trim());
  const discussionList = discussionTypes[1].split(",").map((type) => type.trim());
  expect(issueList).not.toContain("opened");
  expect(discussionList).not.toContain("created");

  // The policy the template implements is spelled out where a consumer reads
  // it, including how a new record still reaches the site.
  expect(triggers).toContain("issues.opened");
  expect(triggers).toContain("the schedule above picks it up");

  // The article types the policy names are present.
  for (const type of ["labeled", "unlabeled", "edited", "closed", "reopened", "transferred"]) {
    expect(issueList).toContain(type);
  }
  for (const type of ["edited", "labeled", "unlabeled", "closed", "reopened", "answered", "unanswered"]) {
    expect(discussionList).toContain(type);
  }
});

test("the default template never triggers per comment", () => {
  // A new comment cannot change the site, so triggering on one would spend a
  // runner to decide it has nothing to do.
  const triggers = packaged.slice(0, packaged.indexOf("\npermissions:"));
  expect(triggers).not.toContain("issue_comment:");
  expect(triggers).not.toContain("discussion_comment:");
  // The reasoning is part of the template rather than an omission.
  expect(triggers).toContain("no issue_comment or discussion_comment trigger");
});

test("the schedule is a real cron and matches any configured snapshot schedule", async () => {
  const cron = packaged.match(/^    - cron: "([^"]+)"$/mu);
  expect(cron).not.toBeNull();
  expect(cron[1].split(" ").length).toBe(5);
  // The template has to say that the schedule and the configuration are two
  // halves of one rule, because the configuration cannot add triggers.
  expect(template).toContain("must match `refresh.snapshot-schedule`");

  // This configuration reads comments at runtime, so it declares no snapshot
  // schedule. A repository that snapshots must mirror its schedule here.
  const config = await readFile(CONFIG, "utf8");
  const configured = config.match(/:snapshot-schedule "([^"]+)"/u);
  if (configured) {
    expect(packaged).toContain(`cron: "${configured[1]}"`);
  } else {
    expect(config).toContain(":comments :runtime");
  }
});
