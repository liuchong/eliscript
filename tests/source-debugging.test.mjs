import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadCompiler } from "../bootstrap/host/bun.mjs";
import { EvaluationSession } from "../bootstrap/host/evaluation.mjs";
import {
  SourceMappingError,
  mapSourceFrames,
  parseJavaScriptStack,
  sourceMapDescriptor,
} from "../runtime/source-mapping.mjs";
import {
  checkSourceDebuggingCorpus,
  SourceDebuggingCorpusError,
  validateSourceDebuggingCorpus,
} from "../tools/debugging/check.mjs";

const ROOT = resolve(import.meta.dir, "..");
const CONTRACT_FILE = resolve(ROOT, "contracts/source-debugging-corpus.json");
const HOST_FIXTURE = resolve(ROOT, "tests/fixtures/source-debugging-host.mjs");
const SOURCE_FIXTURE = resolve(ROOT, "tests/fixtures/source-debugging.eli");
const RUNTIME_FIXTURE = resolve(ROOT, "tests/fixtures/evaluation-session/main.eli");
const compiler = await loadCompiler();

async function contract() {
  return JSON.parse(await readFile(CONTRACT_FILE, "utf8"));
}

function acceptanceCase(value, id) {
  const entry = value.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`missing source debugging case ${id}`);
  return entry;
}

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

test("source mapping decodes V8 and browser stack dialects without a host API", () => {
  const descriptor = sourceMapDescriptor({
    generatedFile: "https://example.test/program.mjs",
    sources: ["https://example.test/program.eli"],
    mappings: "AAAA",
  });
  const frames = parseJavaScriptStack([
    "Error: broken",
    "    at run (https://example.test/program.mjs?rev=1:1:1)",
    "event@https://example.test/program.mjs#loaded:1:1",
  ].join("\n"));
  expect(mapSourceFrames(frames, [descriptor])).toEqual([
    {
      function: "run",
      file: "https://example.test/program.eli",
      line: 1,
      column: 1,
      generated: {
        file: "https://example.test/program.mjs?rev=1",
        line: 1,
        column: 1,
      },
    },
    {
      function: "event",
      file: "https://example.test/program.eli",
      line: 1,
      column: 1,
      generated: {
        file: "https://example.test/program.mjs#loaded",
        line: 1,
        column: 1,
      },
    },
  ]);
  expect(() => sourceMapDescriptor({
    generatedFile: "broken.mjs",
    sources: ["broken.eli"],
    mappings: "!",
  })).toThrow(SourceMappingError);
});

test("compiler failure preserves its complete Eliscript source span", async () => {
  const value = await contract();
  const entry = acceptanceCase(value, "compiler");
  const result = await run([
    "./bin/eliscript",
    "--diagnostic-format",
    "json",
    entry.source,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  const diagnostic = JSON.parse(result.stderr);
  expect(diagnostic.location.file).toBe(resolve(ROOT, entry.source));
  expect(diagnostic.location.start).toEqual(entry.location.start);
  expect(diagnostic.location.end).toEqual(entry.location.end);
});

test("runtime failure maps through persistent evaluation", async () => {
  const value = await contract();
  const entry = acceptanceCase(value, "runtime");
  const session = await EvaluationSession.create({ compiler });
  try {
    const source = await readFile(RUNTIME_FIXTURE, "utf8");
    expect((await session.execute({
      id: 1,
      operation: "load",
      source,
      filename: RUNTIME_FIXTURE,
      root: ROOT,
    })).status).toBe("ok");
    const failure = await session.execute({
      id: 2,
      operation: "evaluate",
      source: "(explode)",
      filename: RUNTIME_FIXTURE,
    });
    expect(failure.status).toBe("error");
    expect(failure.diagnostic.location).toEqual({
      file: resolve(ROOT, entry.source),
      ...entry.location,
    });
    expect(failure.diagnostic.location.file.endsWith(".mjs")).toBeFalse();
  } finally {
    session.close();
  }
});

test("browser event and async rejection map under Bun and Node", async () => {
  const value = await contract();
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-source-debugging-"));
  try {
    const moduleFile = resolve(directory, "source-debugging.mjs");
    const built = await run([
      "./bin/eliscript",
      "--source-map",
      "--output",
      moduleFile,
      SOURCE_FIXTURE,
    ]);
    expect(built.exitCode).toBe(0);
    expect(built.stderr).toBe("");
    const environment = {
      ...process.env,
      ELISCRIPT_DEBUG_MODULE: moduleFile,
      ELISCRIPT_DEBUG_SOURCE_MAP: `${moduleFile}.map`,
    };
    const [bunResult, nodeResult] = await Promise.all([
      run([process.execPath, HOST_FIXTURE], { env: environment }),
      run(["node", HOST_FIXTURE], { env: environment }),
    ]);
    expect(bunResult.exitCode).toBe(0);
    expect(nodeResult.exitCode).toBe(0);
    expect(bunResult.stderr).toBe("");
    expect(nodeResult.stderr).toBe("");
    const bunFailures = JSON.parse(bunResult.stdout);
    const nodeFailures = JSON.parse(nodeResult.stdout);
    for (const failures of [bunFailures, nodeFailures]) {
      expect(failures.map((entry) => entry.kind)).toEqual([
        "browser-event", "async-rejection",
      ]);
      for (const { kind, failure } of failures) {
        const entry = acceptanceCase(value, kind);
        expect(failure.location).toMatchObject({
          file: resolve(ROOT, entry.source),
          ...entry.location,
        });
        expect(failure.location.generated.file).toContain(".mjs");
        expect(failure.location.file.endsWith(".eli")).toBeTrue();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source debugging corpus is complete and rejects evidence drift", async () => {
  const checked = await checkSourceDebuggingCorpus({ root: ROOT });
  expect(checked.cases.map((entry) => entry.id)).toEqual([
    "compiler", "runtime", "browser-event", "async-rejection", "worker",
  ]);

  const changed = await contract();
  changed.cases.pop();
  await expect(validateSourceDebuggingCorpus(changed, { root: ROOT }))
    .rejects.toBeInstanceOf(SourceDebuggingCorpusError);
});
