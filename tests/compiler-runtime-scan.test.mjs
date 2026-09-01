import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerRuntimeScanSourceDigest,
  validateCompilerRuntimeScanReport,
} from "../tools/compiler/runtime-scan-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-runtime-scan-macos-arm64.json",
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

function irNode(kind, value = null, children = [], properties = undefined) {
  return {
    kind,
    span: null,
    value,
    children,
    ...(properties === undefined ? {} : { properties }),
  };
}

function expression(node) {
  return irNode("expression-statement", null, [node]);
}

test("optimized compiler runtime scan matches its readable reference", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "eliscript-runtime-scan-"),
  );
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = (name) => import(
      `${pathToFileURL(path.join(directory, `${name}.mjs`)).href}?runtime-scan`
    );
    const [compiler, emitter] = await Promise.all([
      module("compiler"),
      module("emitter"),
    ]);

    const programs = [];
    for (const name of compilerSources) {
      const relative = `bootstrap/compiler/${name}.eli`;
      const source = await readFile(path.join(projectDirectory, relative), "utf8");
      programs.push(compiler.compile_ir_string(source, relative));
    }

    const literal = (value, literalKind = undefined) => irNode(
      "literal",
      value,
      [],
      literalKind === undefined ? undefined : { literalKind },
    );
    const allRequirements = {
      filename: "all-runtime-requirements.eli",
      body: [
        expression(irNode("react-element", null, [
          literal("section"),
          literal(null),
        ])),
        expression(irNode("persistent-vector-literal", null, [literal(1)])),
        expression(irNode("intrinsic", "host-identity-token", [
          irNode("object-literal", null),
        ])),
        expression(irNode("intrinsic", "length", [
          irNode("array-literal", null),
        ])),
        expression(irNode("intrinsic", "car", [
          irNode("persistent-list-literal", null),
        ])),
      ],
    };
    const staticKeywordProperty = {
      filename: "static-keyword-property.eli",
      body: [
        expression(irNode("property-read", "get", [
          irNode("reference", "value"),
          irNode("literal", "static-key", [
            irNode("persistent-vector-literal", null, [literal(1)]),
          ], { literalKind: "keyword" }),
        ])),
      ],
    };
    programs.push(allRequirements, staticKeywordProperty);

    for (const program of programs) {
      expect(emitter.runtime_requirements(program)).toEqual(
        emitter.reference_runtime_requirements(program),
      );
    }
    expect(emitter.runtime_requirements(allRequirements)).toEqual({
      react: true,
      hostIdentityToken: true,
      literal: true,
      collection: true,
      list: true,
    });
    expect(emitter.runtime_requirements(staticKeywordProperty)).toEqual({
      react: false,
      hostIdentityToken: false,
      literal: false,
      collection: false,
      list: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed compiler runtime scan report matches measured sources", async () => {
  const report = validateCompilerRuntimeScanReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(await compilerRuntimeScanSourceDigest());
  expect(report.corpus.files).toHaveLength(compilerSources.length);
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.corpus.irNodes).toBeGreaterThan(10_000);
  expect(report.measurements.speedup).toBeGreaterThanOrEqual(
    report.decision.minimumSpeedup,
  );
});
