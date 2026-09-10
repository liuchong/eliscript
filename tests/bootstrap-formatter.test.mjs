import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const node = process.env.NODE ?? "node";

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
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
  return stdout;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (entry.name.endsWith(".eli")) files.push(filename);
  }
  return files.sort();
}

test("self-hosted formatter preserves concrete syntax and core semantics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-formatter-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const compilerUrl = pathToFileURL(resolve(directory, "compiler.mjs")).href;
    const compiler = await import(`${compilerUrl}?formatter-test`);
    expect({
      format: compiler.formatter_format,
      version: compiler.formatter_version,
      width: compiler.formatter_width,
      indent: compiler.formatter_indent,
    }).toEqual({
      format: "eliscript-formatter",
      version: 1,
      width: 88,
      indent: 2,
    });

    const trailing = "   ";
    const source = `; heading${trailing}\n(module   demo.format
(import "./x.mjs"   x) ; import${trailing}
(defun  choose (x) (if (> x 0) #{:a :b} {:x [1 2]}))
(defprotocol   IDescribe   describe)
(extend-category "number"   IDescribe (describe (value) (str value)))
(defun pipeline (value) (-> value (1+) (* 2)))
(defun conditional (value enabled) (cond-> value enabled (1+) t (* 2)))
(defun dispatch (value) (case value (1 2) :small :other))
(defun predicate-dispatch (predicate value) (condp predicate value 1 :one :other))
(defun choose-many
(() :none)
((value) value)
((left right &rest remaining) (+ left right (length remaining))))
(defun local-choice (value)
(letfn ((walk (current) (if (= current 0) value (recur (1- current)))))
(walk 10)))
(defun present-pipeline (value) (some-> value (1+) (* 2)))
(defun present (value) (if-some (item value) item :missing))
\`(a ,x ,@xs))
`;
    const expected = `; heading
(module demo.format
  (import "./x.mjs" x)
  ; import
  (defun choose (x) (if (> x 0) #{:a :b} {:x [1 2]}))
  (defprotocol IDescribe describe)
  (extend-category "number" IDescribe (describe (value) (str value)))
  (defun pipeline (value) (-> value (1+) (* 2)))
  (defun conditional (value enabled) (cond-> value enabled (1+) t (* 2)))
  (defun dispatch (value) (case value (1 2) :small :other))
  (defun predicate-dispatch (predicate value) (condp predicate value 1 :one :other))
  (defun choose-many
    (() :none)
    ((value) value)
    ((left right &rest remaining) (+ left right (length remaining))))
  (defun local-choice
    (value)
    (letfn ((walk (current) (if (= current 0) value (recur (1- current))))) (walk 10)))
  (defun present-pipeline (value) (some-> value (1+) (* 2)))
  (defun present (value) (if-some (item value) item :missing))
  \`(a ,x ,@xs))
`;
    const formatted = compiler.format_source(source, "formatter-case.eli");
    expect(formatted).toBe(expected);
    expect(compiler.format_source(formatted, "formatter-case.eli"))
      .toBe(formatted);
    const semanticSource = `(module demo.semantic
  (defun choose (x) (if (> x 0) #{:a :b} {:x [1 2]})))
`;
    const semanticFormatted = compiler.format_source(
      semanticSource,
      "formatter-semantic.eli",
    );
    expect(compiler.compile_string(semanticSource, "formatter-semantic.eli"))
      .toBe(compiler.compile_string(
        semanticFormatted,
        "formatter-semantic.eli",
      ));

    const nodeOutput = await run([
      node,
      "--input-type=module",
      "--eval",
      "const c = await import(process.env.COMPILER_URL); " +
        "process.stdout.write(c.format_source(process.env.SOURCE, 'node.eli'));",
    ], {
      env: { ...process.env, COMPILER_URL: compilerUrl, SOURCE: source },
    });
    expect(nodeOutput).toBe(formatted);

    const corpus = [
      ...await sourceFiles(resolve(projectDirectory, "bootstrap/compiler")),
      ...await sourceFiles(resolve(projectDirectory, "stdlib")),
    ].sort();
    expect(corpus.length).toBeGreaterThanOrEqual(40);
    for (const filename of corpus) {
      const original = await Bun.file(filename).text();
      const canonical = compiler.format_source(original, filename);
      expect(compiler.format_source(canonical, filename)).toBe(canonical);
      expect(compiler.compile_string(canonical, filename))
        .toBe(compiler.compile_string(original, filename));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("formatter returns stable reader and formatter diagnostics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-formatter-error-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const compiler = await import(
      `${pathToFileURL(resolve(directory, "compiler.mjs")).href}?errors`
    );
    try {
      compiler.format_source("(module broken", "broken.eli");
      throw new Error("expected invalid source rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic).toMatchObject({
        format: "eliscript-diagnostic",
        version: 1,
        code: "ELI-R0001",
        phase: "reader",
        location: { file: "broken.eli" },
      });
    }
    try {
      compiler.format_source(42, "broken.eli");
      throw new Error("expected source type rejection");
    } catch (error) {
      expect(error.eliscriptDiagnostic).toMatchObject({
        code: "ELI-F0001",
        phase: "formatter",
        message: "formatter source must be a string",
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
