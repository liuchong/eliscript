import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  compileRegex,
  isRegexPattern,
  regexFind,
  regexFlags,
  regexMatches,
  regexReplace,
  regexSequence,
  regexSource,
} from "../runtime/core/regex.mjs";
import {
  isLazySequence,
  realizedLazySequenceCount,
} from "../runtime/core/lazy-sequence.mjs";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const hostFixture = resolve(root, "tests/fixtures/regex-host.mjs");
const bunPreload = resolve(root, "tests/fixtures/compiled-eli-bun-preload.mjs");
const nodeLoader = resolve(root, "tests/fixtures/compiled-eli-node-loader.mjs");
const emacs = process.env.EMACS ?? "emacs";
const compilationUnits = [
  ["stdlib/core/regex.eli", "stdlib/core/regex.eli"],
  ["tests/fixtures/regex.eli", "tests/fixtures/regex.mjs"],
];

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout.trim();
}

async function compileFamily(compiler, directory, environment = {}) {
  await mkdir(directory, { recursive: true });
  await symlink(resolve(root, "runtime"), resolve(directory, "runtime"), "dir");
  for (const [source, output] of compilationUnits) {
    const outputPath = resolve(directory, output);
    await mkdir(dirname(outputPath), { recursive: true });
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      outputPath,
      resolve(root, source),
    ], environment);
  }
}

test("regex patterns are immutable deterministic values", () => {
  const pattern = compileRegex("[a-z]+", "umi");
  expect(Object.isFrozen(pattern)).toBe(true);
  expect(isRegexPattern(pattern)).toBe(true);
  expect(isRegexPattern(/[a-z]+/u)).toBe(false);
  expect(regexSource(pattern)).toBe("[a-z]+");
  expect(regexFlags(pattern)).toBe("imu");
  expect(() => compileRegex("(")).toThrow("regex source is invalid");
  expect(() => compileRegex("x", "gg")).toThrow("unsupported flag: g");
  expect(() => compileRegex("x", "ii")).toThrow("duplicate flag: i");
});

test("regex matching preserves captures absence and start offsets", () => {
  const pattern = compileRegex("(a)(b)?");
  expect([...regexMatches(pattern, "ab")]).toEqual(["ab", "a", "b"]);
  expect([...regexMatches(pattern, "a")]).toEqual(["a", "a", null]);
  expect(regexMatches(pattern, "za")).toBeNull();
  expect([...regexFind(pattern, "zza yyab")]).toEqual(["a", "a", null]);
  expect([...regexFind(pattern, "zza yyab", 4)]).toEqual(["ab", "a", "b"]);
  expect(regexFind(pattern, "none")).toBeNull();
});

test("regex sequences are memoized and advance zero-width Unicode matches", () => {
  const matches = regexSequence(compileRegex("(?=.)", "u"), "😀a");
  expect(isLazySequence(matches)).toBe(true);
  expect(realizedLazySequenceCount(matches)).toBe(0);
  expect([...matches]).toEqual(["", ""]);
  expect(realizedLazySequenceCount(matches)).toBe(2);
  expect([...matches]).toEqual(["", ""]);
  expect(realizedLazySequenceCount(matches)).toBe(2);
});

test("regex replacement is global literal and callback driven", () => {
  const digits = compileRegex("(\\d+)");
  expect(regexReplace(digits, "$&", "a12b3")).toBe("a$&b$&");
  expect(regexReplace(digits, (match, index, text) => {
    expect(text).toBe("a12b3");
    return `${index}:${match.nth(1)}`;
  }, "a12b3")).toBe("a1:12b4:3");
  expect(() => regexReplace(digits, () => 42, "1"))
    .toThrow("must return a string");
});

test("regex APIs reject mutable host patterns and malformed calls", () => {
  const pattern = compileRegex("x");
  expect(() => regexFind(/x/, "x")).toThrow("Eliscript regex pattern");
  expect(() => regexFind(pattern)).toThrow("optional start");
  expect(() => regexFind(pattern, "x", -1)).toThrow("non-negative safe integer");
  expect(() => regexSequence(pattern, 42)).toThrow("input must be a string");
  expect(() => regexReplace(pattern, 42, "x")).toThrow("string or function");
});

test("Eliscript regex APIs agree across compilers and local hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-regex-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  try {
    await compileFamily(seedCompiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const [, output] of compilationUnits) {
      expect(await readFile(resolve(selfHostedDirectory, output), "utf8"))
        .toBe(await readFile(resolve(seedDirectory, output), "utf8"));
      expect(await readFile(resolve(selfHostedDirectory, `${output}.map`), "utf8"))
        .toBe(await readFile(resolve(seedDirectory, `${output}.map`), "utf8"));
    }

    const reports = [];
    for (const outputRoot of [seedDirectory, selfHostedDirectory]) {
      const modulePath = resolve(outputRoot, "tests/fixtures/regex.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun", "--preload", bunPreload, hostFixture, modulePath,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        modulePath,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      pattern: true,
      source: "[a-z]+",
      flags: "im",
      matches: "Alpha",
      find: "beta",
      from: "SECOND",
      sequence: ["one", "THREE"],
      replaced: "a#b#",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
