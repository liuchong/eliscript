import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript-build");

let staging;
let config;

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

// The configuration is closed data, so a case is a file rather than an object.
const BASE = (sources, publishing = '{:owner {:login "owner" :id "U_owner"} :coauthors []}',
  extra = "") => `(module dogfood.config
  (defconst config
    {:schema-version 1
     :site {:title "T" :base-url "https://example.github.io/t/" :language "en"}
     :sources
     ${sources}
     :publishing
     ${publishing}
     :identity {:conflict :fail :projections []}
     :comments
     {:presentation :tabs
      :channels
      [{:id :issue-native :kind :issue :enabled t :mode :live}]}
     :refresh {:articles :push :comments :runtime :no-change :skip}
     ${extra}
     :output {:directory "_site"}})
  (export config))
`;

const MARKDOWN = '{:id :posts :kind :markdown :enabled t :directory "content/posts"}';
const ISSUES = '{:id :issues :kind :issues :enabled t :repository "owner/repository" :label "published"}';

let caseNumber = 0;

/** Loads a configuration file and returns either its value or its failure. */
async function load(text) {
  caseNumber += 1;
  const path = join(staging, `config-${caseNumber}.eli`);
  await writeFile(path, text, "utf8");
  try {
    return { value: config.load_config(path) };
  } catch (error) {
    return { failure: error };
  }
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-config-"));
  const built = await run([
    COMPILER, "--no-cache", "--root", "examples/dogfood", "--out-dir",
    resolve(staging, "build"), "examples/dogfood/src/builder/main.eli",
  ]);
  if (built.exitCode !== 0) throw new Error(built.stderr.trim() || built.stdout.trim());
  config = await import(resolve(staging, "build/src/support/config.mjs"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("a valid Markdown configuration loads", async () => {
  const { value, failure } = await load(BASE(`[${MARKDOWN}]`));
  expect(failure).toBeUndefined();
  expect(value).toBeDefined();
});

test("an Issues-only configuration loads", async () => {
  // Each source kind carries its own addressing: only Markdown names a
  // directory, so requiring one of every source rejected this configuration.
  const { failure } = await load(BASE(`[${ISSUES}]`));
  expect(failure).toBeUndefined();
});

test("a Discussions-only configuration loads", async () => {
  const { failure } = await load(BASE(
    '[{:id :talks :kind :discussions :enabled t'
    + ' :repository "owner/repository" :category "Blog"}]',
  ));
  expect(failure).toBeUndefined();
});

test("all three kinds load together", async () => {
  const { failure } = await load(BASE(
    `[${MARKDOWN} ${ISSUES}`
    + ' {:id :talks :kind :discussions :enabled t'
    + ' :repository "owner/repository" :category "Blog"}]',
  ));
  expect(failure).toBeUndefined();
});

test("a Markdown source without a directory fails", async () => {
  const { failure } = await load(BASE('[{:id :posts :kind :markdown :enabled t}]'));
  expect(failure.code).toBe("DOGFOOD-CONFIG-003");
  expect(failure.message).toContain("markdown");
});

test("an unknown source kind fails", async () => {
  const { failure } = await load(BASE(
    '[{:id :x :kind :telepathy :enabled t :repository "owner/repository"}]',
  ));
  expect(failure.code).toBe("DOGFOOD-CONFIG-009");
});

test("a repository that is not owner/name fails", async () => {
  const { failure } = await load(BASE(
    '[{:id :issues :kind :issues :enabled t :repository "repository"}]',
  ));
  expect(failure.code).toBe("DOGFOOD-CONFIG-010");
});

test("a Discussions source needs a category", async () => {
  const { failure } = await load(BASE(
    '[{:id :talks :kind :discussions :enabled t :repository "owner/repository"}]',
  ));
  expect(failure.code).toBe("DOGFOOD-CONFIG-003");
});

test("two providers cannot share an id", async () => {
  const { failure } = await load(BASE(`[${MARKDOWN} ${ISSUES.replace(":id :issues", ":id :posts")}]`));
  expect(failure.code).toBe("DOGFOOD-CONFIG-011");
  expect(failure.message).toContain("provider id");
});

test("two channels cannot share an id", async () => {
  const { failure } = await load(BASE(`[${MARKDOWN}]`, undefined, "").replace(
    '[{:id :issue-native :kind :issue :enabled t :mode :live}]',
    '[{:id :issue-native :kind :issue :enabled t :mode :live}'
    + ' {:id :issue-native :kind :issue :enabled t :mode :snapshot}]',
  ));
  expect(failure.code).toBe("DOGFOOD-CONFIG-011");
  expect(failure.message).toContain("channel id");
});

test("publisher logins compare case-insensitively", async () => {
  const { failure } = await load(BASE(
    `[${MARKDOWN}]`,
    '{:owner {:login "owner" :id "U_owner"} :coauthors [{:login "Owner"}]}',
  ));
  expect(failure.code).toBe("DOGFOOD-CONFIG-011");
  expect(failure.message).toContain("publisher login");
});

test("distinct publisher logins are accepted", async () => {
  const { failure } = await load(BASE(
    `[${MARKDOWN}]`,
    '{:owner {:login "owner" :id "U_owner"} :coauthors [{:login "writer"}]}',
  ));
  expect(failure).toBeUndefined();
});

test("a source that is not enabled anywhere fails", async () => {
  const { failure } = await load(BASE(`[${MARKDOWN.replace(":enabled t", ":enabled false")}]`));
  expect(failure.code).toBe("DOGFOOD-CONFIG-003");
  expect(failure.message).toContain("enabled");
});

test("an absolute output directory fails", async () => {
  const { failure } = await load(
    BASE(`[${MARKDOWN}]`).replace(':directory "_site"', ':directory "/tmp/site"'),
  );
  expect(failure.code).toBe("DOGFOOD-CONFIG-004");
});

test("a non-https base URL fails", async () => {
  const { failure } = await load(
    BASE(`[${MARKDOWN}]`).replace(
      '"https://example.github.io/t/"', '"http://example.github.io/t/"',
    ),
  );
  expect(failure.code).toBe("DOGFOOD-CONFIG-008");
});

test("an unknown configuration key fails", async () => {
  const { failure } = await load(
    BASE(`[${MARKDOWN}]`).replace(":schema-version 1", ":schema-version 1 :mystery t"),
  );
  expect(failure.code).toBe("DOGFOOD-CONFIG-006");
});

test("a configuration that is not data fails", async () => {
  const { failure } = await load(
    BASE(`[${MARKDOWN}]`).replace(":title \"T\"", ':title (str "T")'),
  );
  expect(failure.code).toBe("DOGFOOD-CONFIG-005");
});

test("an unsupported schema version fails", async () => {
  const { failure } = await load(
    BASE(`[${MARKDOWN}]`).replace(":schema-version 1", ":schema-version 2"),
  );
  expect(failure.code).toBe("DOGFOOD-CONFIG-007");
});
