import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerIrKindSourceDigest,
  validateCompilerIrKindReport,
} from "../tools/compiler/ir-kind-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-ir-kind-macos-arm64.json",
);
const compilerSources = [
  "symbol",
  "syntax",
  "reader",
  "expander",
  "transient-analysis",
  "analyzer",
  "ir",
  "lower",
  "source-map",
  "emitter",
  "project",
  "compiler",
];

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
}

function collectProgramNodes(program) {
  const nodes = [];
  const stack = [...program.body];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    stack.push(...(node.children ?? []));
  }
  return nodes;
}

test("optimized IR node-kind decisions match the linear reference", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "eliscript-ir-kind-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = (name) => import(
      `${pathToFileURL(path.join(directory, `${name}.mjs`)).href}?ir-kind`
    );
    const [compiler, ir] = await Promise.all([
      module("compiler"),
      module("ir"),
    ]);

    expect(Object.isFrozen(ir.node_kinds)).toBe(true);
    for (const kind of ir.node_kinds) {
      expect(ir.node_kind_p(kind)).toBe(true);
      expect(ir.reference_node_kind_p(kind)).toBe(true);
    }

    let nodeCount = 0;
    for (const name of compilerSources) {
      const relative = `bootstrap/compiler/${name}.eli`;
      const source = await readFile(path.join(projectDirectory, relative), "utf8");
      const program = compiler.compile_ir_string(source, relative);
      for (const node of collectProgramNodes(program)) {
        expect(ir.node_p(node)).toBe(true);
        expect(ir.node_p(node)).toBe(ir.reference_node_p(node));
        nodeCount += 1;
      }
    }
    expect(nodeCount).toBeGreaterThan(20_000);

    const boundaries = [
      null,
      undefined,
      false,
      true,
      0,
      "literal",
      Symbol("literal"),
      () => "literal",
      [],
      {},
      { kind: "unknown" },
      { kind: null },
      { kind: Symbol("literal") },
      Object.create({ kind: "literal" }),
      Object.freeze({ kind: "literal" }),
    ];
    for (const value of boundaries) {
      expect(ir.node_p(value)).toBe(ir.reference_node_p(value));
    }
    expect(ir.node_p(Object.create({ kind: "literal" }))).toBe(true);
    expect(ir.node_p({ kind: "unknown" })).toBe(false);
    expect(() => ir.make_node("unknown", null, null, [], null)).toThrow(
      "unknown Eliscript IR node kind: unknown",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed compiler IR kind report matches measured sources", async () => {
  const report = validateCompilerIrKindReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(await compilerIrKindSourceDigest());
  expect(report.corpus.files).toHaveLength(compilerSources.length);
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.corpus.irNodes).toBeGreaterThan(20_000);
  expect(report.validation.values).toBe(
    report.corpus.irNodes + report.corpus.boundaryValues,
  );
  expect(report.measurements.speedup).toBeGreaterThanOrEqual(
    report.decision.minimumSpeedup,
  );
});
