import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript");
const SOURCE = resolve(ROOT, "examples/dogfood/tools/spec-check.eli");
const PROJECT = resolve(ROOT, "examples/dogfood");

let staging;
let program;

async function run(command) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

// Copy the maintained project and apply one text mutation so a single rule
// fails in isolation.
async function fixture(mutate) {
  const parent = await mkdtemp(resolve(staging, "case-"));
  const directory = join(parent, "dogfood");
  await cp(PROJECT, directory, { recursive: true });
  if (mutate) {
    await mutate({
      read: (relative) => readFile(join(directory, relative), "utf8"),
      write: (relative, text) => writeFile(join(directory, relative), text),
      copy: (from, to) => cp(join(directory, from), join(directory, to)),
    });
  }
  return directory;
}

async function check(directory, extra = []) {
  const { exitCode, stdout, stderr } = await run([
    process.execPath,
    program,
    "--root",
    directory,
    "--json",
    ...extra,
  ]);
  if (stderr.trim() !== "" && stdout.trim() === "") {
    throw new Error(stderr.trim());
  }
  return { exitCode, report: JSON.parse(stdout) };
}

function codes(report) {
  return report.issues.map((issue) => issue.code);
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-dogfood-specs-"));
  program = resolve(staging, "spec-check.mjs");
  const build = await run([COMPILER, "--output", program, SOURCE]);
  if (build.exitCode !== 0) {
    throw new Error(build.stderr.trim() || build.stdout.trim());
  }
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the maintained dogfood design passes every rule", async () => {
  const directory = await fixture();
  const { exitCode, report } = await check(directory);
  const specCount = (await readdir(join(PROJECT, "specs")))
    .filter((name) => /^\d{4}-.+[.]md$/.test(name)).length;
  expect(report.ok).toBe(true);
  expect(report.issueCount).toBe(0);
  expect(report.specCount).toBe(specCount);
  expect(exitCode).toBe(0);
});

test("a missing metadata field is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/0001-product-contract.md";
    const text = await read(relative);
    await write(relative, text.replace("- Status: Accepted design\n", ""));
  });
  const { exitCode, report } = await check(directory);
  expect(codes(report)).toContain("DF-METADATA");
  expect(exitCode).toBe(1);
});

test("a heading identifier that disagrees with the file name is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/0001-product-contract.md";
    const text = await read(relative);
    await write(relative, text.replace("# 0001: Product Contract", "# 0099: Product Contract"));
  });
  expect(codes((await check(directory)).report)).toContain("DF-ID");
});

test("a prose criterion count that disagrees with the table is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/0009-delivery-and-acceptance.md";
    const text = await read(relative);
    await write(relative, text.replace("All 13 criteria must pass", "All twelve criteria must pass"));
  });
  expect(codes((await check(directory)).report)).toContain("DF-CRITERIA-PROSE");
});

test("a README acceptance denominator that disagrees with the table is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "README.md";
    const text = await read(relative);
    await write(relative, text.replace(
      "| Final application acceptance | 0/13 (0%)",
      "| Final application acceptance | 0/12 (0%)",
    ));
  });
  expect(codes((await check(directory)).report)).toContain("DF-README");
});

test("a relative link that escapes the project root is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "README.md";
    const text = await read(relative);
    await write(relative, `${text}\n[Parent](../README.md)\n`);
  });
  expect(codes((await check(directory)).report)).toContain("DF-LINK-ESCAPE");
});

test("a relative link with no target is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/README.md";
    const text = await read(relative);
    await write(relative, `${text}\n[Missing](0099-absent.md)\n`);
  });
  expect(codes((await check(directory)).report)).toContain("DF-LINK-MISSING");
});

test("a specification absent from the index is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/README.md";
    const text = await read(relative);
    await write(relative, text.replace(
      "| [0001](0001-product-contract.md) | Product Contract | Accepted design |\n",
      "",
    ));
  });
  expect(codes((await check(directory)).report)).toContain("DF-INDEX-MISSING");
});

test("an index entry for an absent specification is reported", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/README.md";
    const text = await read(relative);
    await write(relative, `${text}\n| [0099](0099-absent.md) | Absent | Accepted design |\n`);
  });
  expect(codes((await check(directory)).report)).toContain("DF-INDEX-STALE");
});

test("a duplicated specification identifier is reported", async () => {
  const directory = await fixture(async ({ copy }) => {
    await copy("specs/0001-product-contract.md", "specs/0001-duplicate.md");
  });
  expect(codes((await check(directory)).report)).toContain("DF-DUPLICATE");
});

test("a root that is not a directory fails without a stack trace", async () => {
  const { exitCode, report } = await check(join(PROJECT, "absent"));
  expect(exitCode).toBe(1);
  expect(report.ok).toBe(false);
  expect(report.error).toBe("root is not a directory");
});

test("the human report and exit status agree with the JSON report", async () => {
  const directory = await fixture(async ({ read, write }) => {
    const relative = "specs/0001-product-contract.md";
    const text = await read(relative);
    await write(relative, text.replace("- Status: Accepted design\n", ""));
  });
  const { exitCode, stdout } = await run([process.execPath, program, "--root", directory]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("DF-METADATA");
  expect(stdout).toContain("issues: 1");
});
