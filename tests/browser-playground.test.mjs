import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { printValue } from "../runtime/core/data-text.mjs";

const ROOT = resolve(import.meta.dir, "..");
const COMPILER = resolve(ROOT, "bin/eliscript");
const PLAYGROUND = resolve(ROOT, "examples/browser-playground/src/playground.eli");
const PAGE = resolve(ROOT, "examples/browser-playground/index.html");

let staging;

async function run(command) {
  const child = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function compile(source, output) {
  await writeFile(output.replace(/[^/]+$/u, "input.eli"), source);
  const input = output.replace(/[^/]+$/u, "input.eli");
  const result = await run([COMPILER, "--output", output, input]);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || result.stdout.trim());
  return readFile(output, "utf8");
}

// Compiles one source string and executes the result, capturing printed lines
// with the same canonical value formatting the playground installs.
async function compileAndRun(name, source) {
  const output = resolve(staging, `${name}.mjs`);
  const javascript = await compile(source, output);
  const lines = [];
  const original = console.log;
  console.log = (...values) => {
    lines.push(values.map((value) => (
      value !== null && typeof value === "object" ? printValue(value) : String(value)
    )).join(" "));
  };
  try {
    await import(`${output}?run=${name}`);
  } finally {
    console.log = original;
  }
  return { javascript, lines };
}

beforeAll(async () => {
  staging = await mkdtemp(resolve(ROOT, ".eliscript-browser-playground-"));
});

afterAll(async () => {
  if (staging) await rm(staging, { recursive: true, force: true });
});

test("the playground application compiles to ESM", async () => {
  const output = resolve(staging, "playground.mjs");
  const result = await run([
    COMPILER, "--source-map", "--output", output, PLAYGROUND,
  ]);
  expect(result.stderr.trim()).toBe("");
  expect(result.exitCode).toBe(0);
  const javascript = await readFile(output, "utf8");
  // The page and the compiler must agree on one resolution scheme, so the
  // playground imports the compiler and the platform by package specifier.
  expect(javascript).toContain('from "eliscript/dist/bootstrap/compiler.mjs"');
  expect(javascript).toContain('from "eliscript/platform/browser.mjs"');
  expect(javascript).toContain('from "eliscript/runtime/core/data-text.mjs"');
});

test("the compiler emits only package-relative runtime imports", async () => {
  const { javascript } = await compileAndRun("probe", `(module probe
  (import "eliscript/runtime/core/sequence.mjs" map filter)
  (import "eliscript/runtime/core/order.mjs" sort)
  (defconst values [4 1 3 2])
  (print "sorted" (sort values))
  (print "squares" (map (lambda (value) (* value value)) values))
  (print "even" (filter (lambda (value) (= (% value 2) 0)) values)))
`);
  const specifiers = [...javascript.matchAll(/from "([^"]+)"/gu)].map((m) => m[1]);
  expect(specifiers.length).toBeGreaterThan(0);
  for (const specifier of specifiers) {
    // Every emitted import is a bare `eliscript/` specifier, which is exactly
    // what a single import-map prefix resolves in the browser.
    expect(specifier.startsWith("eliscript/")).toBe(true);
  }
});

test("compiled output executes against the public runtime", async () => {
  const { lines } = await compileAndRun("execute", `(module execute
  (import "eliscript/runtime/core/order.mjs" sort)
  (import "eliscript/runtime/core/collection.mjs" conj)
  (defconst values (conj (conj [] 3) 1))
  (print "sorted" (sort values))
  (print "length" (length values)))
`);
  expect(lines).toEqual(["sorted [1 3]", "length 2"]);
});

test("every emitted specifier resolves to a served file", async () => {
  const { javascript } = await compileAndRun("exports", `(module exports
  (import "eliscript/runtime/core/sequence.mjs" map)
  (print "mapped" (map (lambda (value) value) [1 2])))
`);
  // The page maps the `eliscript/` prefix to the served root, so each
  // specifier must name a file below that root.
  const seen = new Set();
  for (const match of javascript.matchAll(/from "([^"]+)"/gu)) {
    const specifier = match[1];
    expect(specifier.startsWith("eliscript/")).toBe(true);
    const relative = specifier.slice("eliscript/".length);
    expect(await Bun.file(resolve(ROOT, relative)).exists()).toBe(true);
    seen.add(specifier);
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
});

test("the page declares the import map and loads the compiled entry", async () => {
  const page = await readFile(PAGE, "utf8");
  expect(page).toContain('type="importmap"');
  expect(page).toContain('"eliscript/": "/"');
  expect(page).toContain('src="./playground.mjs"');
  expect(page).toContain('id="source"');
  expect(page).toContain('id="stdout"');
  expect(page).toContain('id="diagnostics"');
});

test("a compile failure carries a structured diagnostic", async () => {
  const output = resolve(staging, "broken.mjs");
  const input = resolve(staging, "broken.eli");
  await writeFile(input, "(module broken\n  (defun f (x) (not-a-binding x)))\n");
  const result = await run([COMPILER, "--diagnostic-format", "json", "--output", output, input]);
  expect(result.exitCode).toBe(1);
  const diagnostic = JSON.parse(result.stderr.trim().split("\n").at(-1));
  expect(diagnostic.format).toBe("eliscript-diagnostic");
  expect(diagnostic.code).toMatch(/^ELI-/u);
  expect(diagnostic.phase).toBe("analysis");
  expect(diagnostic.location.start.line).toBe(2);
});
