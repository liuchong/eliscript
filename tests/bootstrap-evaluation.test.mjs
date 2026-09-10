import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { EvaluationSession } from "../bootstrap/host/evaluation.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const bootstrapPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const evaluationPath = resolve(projectDirectory, "bin/eliscript-eval");
const evaluationOracle = resolve(
  projectDirectory,
  "tests/bootstrap-evaluation-oracle.el",
);
const fixture = resolve(
  projectDirectory,
  "tests/fixtures/evaluation-session/main.eli",
);
const node = process.env.NODE ?? "node";
const bun = process.execPath;

let directory;
let compilerDirectory;
let compiler;

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: options.env ?? process.env,
  });
  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin);
    child.stdin.end();
  }
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function protocol(runtime, lines) {
  const result = await run([evaluationPath, "--stdio"], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: runtime,
    },
    stdin: `${lines.join("\n")}\n`,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout.trim().split("\n").map((line) => JSON.parse(line));
}

async function terminal(
  runtime,
  lines,
  options = ["--repl", "--no-prompt", "--root", projectDirectory],
) {
  return run([evaluationPath, ...options], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: runtime,
    },
    stdin: lines.join("\n"),
  });
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "eliscript-evaluation-test-"));
  compilerDirectory = resolve(directory, "compiler");
  const built = await run([bootstrapPath], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
    },
  });
  expect(built.exitCode).toBe(0);
  compiler = await import(
    `${pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href}?evaluation`
  );
}, 30_000);

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

test("self-hosted evaluation descriptors are closed and framework neutral", () => {
  expect(compiler.evaluation_operation_format)
    .toBe("eliscript-evaluation-operation");
  expect(compiler.evaluation_operation_version).toBe(1);
  expect(compiler.evaluation_operation_request({
    id: 7,
    operation: "evaluate",
    source: "(+ 1 2)",
    filename: "repl.eli",
  })).toEqual({
    format: "eliscript-evaluation-operation",
    version: 1,
    id: 7,
    operation: "evaluate",
    source: "(+ 1 2)",
    filename: "repl.eli",
    root: null,
    line: 1,
    column: 1,
  });
  expect(() => compiler.evaluation_operation_request({
    operation: "reset",
    source: "(+ 1 2)",
  })).toThrow("reset evaluation operation does not accept source fields");
  expect(() => compiler.evaluation_operation_request({
    operation: "describe",
    framework: "anything",
  })).toThrow("unknown evaluation operation key: framework");

  expect(compiler.evaluation_input_format).toBe("eliscript-evaluation-input");
  expect(compiler.evaluation_input_version).toBe(1);
  expect(compiler.evaluation_input_description("(+ 1", "repl.eli")).toEqual({
    format: "eliscript-evaluation-input",
    version: 1,
    status: "incomplete",
    filename: "repl.eli",
  });

  expect(compiler.evaluation_form_description(
    "(defun value () 42)",
    "repl.eli",
  )).toEqual({
    format: "eliscript-evaluation-form",
    version: 1,
    kind: "definition",
    head: "defun",
    name: "value",
    runtimeBinding: true,
    filename: "repl.eli",
  });
  expect(compiler.evaluation_form_description(
    "(defmacro twice (value) `(+ ,value ,value))",
    "repl.eli",
  ).runtimeBinding).toBeFalse();
  expect(compiler.evaluation_form_description(
    "(defmulti render (lambda (value) value))",
    "repl.eli",
  )).toMatchObject({
    kind: "definition",
    name: "render",
    runtimeBinding: true,
  });
  expect(compiler.evaluation_form_description(
    "(defmethod render :text (value) value)",
    "repl.eli",
  ).kind).toBe("expression");
  for (const name of ["jsx", "fragment", "defcomponent"]) {
    expect(compiler.evaluation_form_description(
      `(${name} 1)`,
      "repl.eli",
    ).kind).toBe("expression");
  }
  expect(compiler.evaluation_form_description(
    "(import \"./value.mjs\" value)",
    "repl.eli",
  ).kind).toBe("module");

  const description = compiler.evaluation_module_description(`
    (module sample
      (import "./value.mjs" imported)
      (defmacro twice (value) \`(+ ,value ,value))
      (defvar private-value 1)
      (defun public-value () private-value)
      (export public-value))
  `, "sample.eli");
  expect(description).toEqual({
    format: "eliscript-evaluation-module",
    version: 1,
    filename: "sample.eli",
    bindings: ["imported", "private-value", "public-value"],
    exports: ["public-value"],
    macroSources: ["(defmacro twice (value) `(+ ,value ,value))"],
  });
  expect(Object.isFrozen(description)).toBeTrue();
  expect(Object.isFrozen(description.bindings)).toBeTrue();
});

test("seed and self-hosted evaluation descriptors agree", async () => {
  const moduleSource = `
    (module sample
      (import "./value.mjs" imported)
      (defmacro twice (value) \`(+ ,value ,value))
      (defvar private-value 1)
      (defun public-value () private-value)
      (export public-value))
  `;
  const cases = [
    {
      kind: "operation",
      input: {
        id: "request-1",
        operation: "evaluate",
        source: "(+ 1 2)",
        filename: "repl.eli",
        root: "/project",
        line: 9,
        column: 4,
      },
    },
    { kind: "operation", input: { id: 2, operation: "reset" } },
    {
      kind: "operation",
      input: { id: 9007199254740992, operation: "describe" },
    },
    { kind: "input", source: "", filename: "repl.eli" },
    { kind: "input", source: "; comment\n", filename: "repl.eli" },
    { kind: "input", source: "(+ 1", filename: "repl.eli" },
    { kind: "input", source: "\"unfinished", filename: "repl.eli" },
    { kind: "input", source: "'", filename: "repl.eli" },
    { kind: "input", source: "#{1 2}", filename: "repl.eli" },
    { kind: "input", source: "(+ 1 ])", filename: "repl.eli" },
    { kind: "input", source: "1 2", filename: "repl.eli" },
    {
      kind: "operation",
      input: { operation: "describe", unknown: true },
    },
    {
      kind: "form",
      source: "(defmacro twice (value) `(+ ,value ,value))",
      filename: "repl.eli",
    },
    {
      kind: "form",
      source: "(defmulti render (lambda (value) value))",
      filename: "repl.eli",
    },
    {
      kind: "form",
      source: "(defmethod render :text (value) value)",
      filename: "repl.eli",
    },
    {
      kind: "form",
      source: "(+ 1 2) (+ 3 4)",
      filename: "repl.eli",
    },
    { kind: "module", source: moduleSource, filename: "sample.eli" },
  ];
  const seed = await run([
    "emacs",
    "--batch",
    "-Q",
    "-L",
    resolve(projectDirectory, "compiler"),
    "--script",
    evaluationOracle,
  ], { stdin: JSON.stringify(cases) });
  expect(seed.exitCode).toBe(0);
  expect(seed.stderr).toBe("");

  const selfHosted = cases.map((entry) => {
    try {
      const value = entry.kind === "operation"
        ? compiler.evaluation_operation_request(entry.input)
        : entry.kind === "input"
          ? compiler.evaluation_input_description(entry.source, entry.filename)
        : entry.kind === "form"
          ? compiler.evaluation_form_description(entry.source, entry.filename)
          : compiler.evaluation_module_description(entry.source, entry.filename);
      return { status: "ok", value };
    } catch (error) {
      return { status: "error", diagnostic: error.eliscriptDiagnostic };
    }
  });
  expect(JSON.parse(seed.stdout)).toEqual(selfHosted);
});

test("persistent evaluation commits atomically and preserves live state", async () => {
  const session = await EvaluationSession.create({ compiler });
  const ownedDirectory = session.directory;
  try {
    expect((await session.execute({ id: 1, operation: "describe" })).capabilities)
      .toEqual({
        operations: ["describe", "evaluate", "load", "reset"],
        persistentSession: true,
        sourceMaps: true,
        valuePrinter: "eliscript-data-text",
      });

    expect(await session.execute({
      id: 2,
      operation: "evaluate",
      source: "(defvar x 40)",
      filename: "repl.eli",
    })).toMatchObject({
      status: "ok",
      revision: 1,
      kind: "definition",
      binding: "x",
      value: "40",
    });
    expect((await session.execute({
      id: 3,
      operation: "evaluate",
      source: "(+ x 2)",
      filename: "repl.eli",
    })).value).toBe("42");

    const failedReplacement = await session.execute({
      id: 4,
      operation: "evaluate",
      source: "(defvar x missing)",
      filename: "repl.eli",
    });
    expect(failedReplacement.status).toBe("error");
    expect(failedReplacement.revision).toBe(1);
    expect((await session.execute({
      id: 5,
      operation: "evaluate",
      source: "x",
      filename: "repl.eli",
    })).value).toBe("40");

    await session.execute({
      id: 6,
      operation: "evaluate",
      source: "(defvar x 41)",
      filename: "repl.eli",
    });
    await session.execute({
      id: 7,
      operation: "evaluate",
      source: "(defmacro twice (value) `(+ ,value ,value))",
      filename: "repl.eli",
    });
    expect((await session.execute({
      id: 8,
      operation: "evaluate",
      source: "(twice x)",
      filename: "repl.eli",
    })).value).toBe("82");

    const source = readFileSync(fixture, "utf8");
    const loaded = await session.execute({
      id: 9,
      operation: "load",
      source,
      filename: fixture,
      root: projectDirectory,
    });
    expect(loaded).toMatchObject({
      status: "ok",
      revision: 4,
      kind: "module",
      stdout: "evaluation fixture loaded\n",
    });
    expect((await session.execute({
      id: 10,
      operation: "evaluate",
      source: "(current)",
      filename: fixture,
    })).value).toBe("[1 1]");
    expect((await session.execute({
      id: 11,
      operation: "evaluate",
      source: "(bump)",
      filename: fixture,
    })).value).toBe("2");
    expect((await session.execute({
      id: 12,
      operation: "evaluate",
      source: "(current)",
      filename: fixture,
    })).value).toBe("[2 1]");

    const runtimeFailure = await session.execute({
      id: 13,
      operation: "evaluate",
      source: "(explode)",
      filename: fixture,
    });
    expect(runtimeFailure.status).toBe("error");
    expect(runtimeFailure.diagnostic.phase).toBe("evaluation-runtime");
    expect(runtimeFailure.diagnostic.location.file).toBe(fixture);
    expect(runtimeFailure.diagnostic.location.line).toBe(8);
    expect(runtimeFailure.diagnostic.location.column).toBe(30);
    expect((await session.execute({
      id: 14,
      operation: "evaluate",
      source: "(current)",
      filename: fixture,
    })).value).toBe("[2 1]");

    const reloaded = await session.execute({
      id: 15,
      operation: "load",
      source,
      filename: fixture,
      root: projectDirectory,
    });
    expect(reloaded.revision).toBe(5);
    expect((await session.execute({
      id: 16,
      operation: "evaluate",
      source: "(current)",
      filename: fixture,
    })).value).toBe("[1 1]");
  } finally {
    session.close();
  }
  expect(existsSync(ownedDirectory)).toBeFalse();
});

test("Node and Bun preserve NDJSON framing and source locations", async () => {
  const records = [
    JSON.stringify({
      id: 1,
      operation: "evaluate",
      source: "(defvar x 40)",
      filename: "repl.eli",
    }),
    "{ malformed",
    JSON.stringify({
      id: 2,
      operation: "evaluate",
      source: "(+ x 2)",
      filename: "repl.eli",
    }),
    JSON.stringify({
      id: 3,
      operation: "evaluate",
      source: "(js-call nil :missing)",
      filename: "/tmp/evaluation-source.eli",
      line: 7,
      column: 3,
    }),
    JSON.stringify({
      id: 4,
      operation: "evaluate",
      source: "(+ x 3)",
      filename: "repl.eli",
    }),
  ];
  const [nodeResults, bunResults] = await Promise.all([
    protocol(node, records),
    protocol(bun, records),
  ]);
  for (const results of [nodeResults, bunResults]) {
    expect(results).toHaveLength(5);
    expect(results.map(({ status }) => status))
      .toEqual(["ok", "error", "ok", "error", "ok"]);
    expect(results[0]).toMatchObject({ id: 1, revision: 1, value: "40" });
    expect(results[1].diagnostic.phase).toBe("evaluation-request");
    expect(results[1].revision).toBe(1);
    expect(results[2]).toMatchObject({ id: 2, revision: 1, value: "42" });
    expect(results[3].diagnostic.location).toEqual({
      file: "/tmp/evaluation-source.eli",
      line: 7,
      column: 12,
    });
    expect(results[4]).toMatchObject({ id: 4, revision: 1, value: "43" });
  }
});

test("Node and Bun terminal REPLs preserve multiline state and recover", async () => {
  const lines = [
    ":reload",
    ":unknown",
    "; an empty submission",
    "(defvar x 40)",
    "(+",
    " x",
    " 2)",
    "(defmacro twice (value) `(+ ,value ,value))",
    "(twice 21)",
    "(+ x ]",
    "(+ x 3)",
    ":load tests/fixtures/evaluation-session/main.eli",
    "(explode)",
    "(current)",
    ":load tests/fixtures/evaluation-session/missing.eli",
    ":reload",
    "(current)",
    ":reset",
    "(defvar done 7)",
    "done",
    ":quit",
    "(+ 1 1000)",
  ];
  const [nodeResult, bunResult] = await Promise.all([
    terminal(node, lines),
    terminal(bun, lines),
  ]);
  for (const result of [nodeResult, bunResult]) {
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  }
  const runtimePrefix = `eliscript-eval: ${fixture}:8:30: `;
  const normalizeRuntimeMessage = (output) => output
    .split("\n")
    .map((line) => line.startsWith(runtimePrefix)
      ? `${runtimePrefix}<host-runtime-message>`
      : line)
    .join("\n");
  expect(normalizeRuntimeMessage(nodeResult.stdout))
    .toBe(normalizeRuntimeMessage(bunResult.stdout));
  expect(nodeResult.stdout).toContain(
    "eliscript-eval: :reload requires a prior successful :load\n",
  );
  expect(nodeResult.stdout).toContain(
    "eliscript-eval: unknown REPL command: :unknown\n",
  );
  expect(nodeResult.stdout).toContain("40\n42\ntwice\n42\n");
  expect(nodeResult.stdout).toContain(
    'eliscript-eval: <repl>.eli:1:1: Invalid read syntax: "]"\n43\n',
  );
  expect(nodeResult.stdout.match(/evaluation fixture loaded\n/g)).toHaveLength(2);
  for (const result of [nodeResult, bunResult]) {
    expect(result.stdout).toContain(runtimePrefix);
    expect(result.stdout).toContain("\n[1 1]\n");
  }
  expect(nodeResult.stdout).toContain("missing.eli");
  expect(nodeResult.stdout).toEndWith("session reset\n7\n7\n");
  expect(nodeResult.stdout).not.toContain("1001");
});

test("terminal prompt policy and incomplete EOF are deterministic", async () => {
  const promptedLines = ["(+", " 20", " 22)", ":help", ":quit"];
  const [nodePrompted, bunPrompted] = await Promise.all([
    terminal(node, promptedLines, ["--repl", "--prompt"]),
    terminal(bun, promptedLines, ["--repl", "--prompt"]),
  ]);
  expect(nodePrompted).toEqual(bunPrompted);
  expect(nodePrompted.exitCode).toBe(0);
  expect(nodePrompted.stdout).toStartWith(
    "Eliscript REPL. Type :help for commands.\neliscript=> ",
  );
  expect(nodePrompted.stdout).toContain("      ...       ... 42\n");
  expect(nodePrompted.stdout).toContain("Commands:\n");

  const [nodeDefault, bunDefault] = await Promise.all([
    terminal(node, ["(+ 20 22)", ":quit"], ["--no-prompt"]),
    terminal(bun, ["(+ 20 22)", ":quit"], ["--no-prompt"]),
  ]);
  expect(nodeDefault.stdout).toBe("42\n");
  expect(bunDefault.stdout).toBe(nodeDefault.stdout);

  const [nodeIncomplete, bunIncomplete] = await Promise.all([
    terminal(node, ["(+", " 1"]),
    terminal(bun, ["(+", " 1"]),
  ]);
  expect(nodeIncomplete.stdout).toBe(bunIncomplete.stdout);
  expect(nodeIncomplete.stdout).toContain(
    "eliscript-eval: <repl>.eli:1:1: unexpected end of input\n",
  );
  expect(nodeIncomplete.exitCode).toBe(0);
});
