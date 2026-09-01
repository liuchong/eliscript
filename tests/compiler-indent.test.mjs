import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerIndentSourceDigest,
  validateCompilerIndentReport,
} from "../tools/compiler/indent-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-indent-macos-arm64.json",
);
const compilerSources = [
  "symbol",
  "syntax",
  "reader",
  "formatter",
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

function artifactFragments(artifact) {
  const fragments = [];
  let blockStart = 0;
  while (blockStart < artifact.text.length) {
    const separator = artifact.text.indexOf("\n\n", blockStart);
    const blockEnd = separator === -1 ? artifact.text.length : separator;
    if (blockEnd > blockStart) {
      fragments.push({
        text: artifact.text.slice(blockStart, blockEnd),
        marks: artifact.marks
          .filter((mark) => mark.offset >= blockStart && mark.offset < blockEnd)
          .map((mark) => ({
            offset: mark.offset - blockStart,
            span: mark.span,
          })),
      });
    }
    if (separator === -1) break;
    blockStart = blockEnd + 2;
  }
  return fragments;
}

test("chunked compiler indentation matches its character reference", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "eliscript-indent-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = (name) => import(
      `${pathToFileURL(path.join(directory, `${name}.mjs`)).href}?indent`
    );
    const [compiler, emitter] = await Promise.all([
      module("compiler"),
      module("emitter"),
    ]);

    let fragmentCount = 0;
    for (const name of compilerSources) {
      const relative = `bootstrap/compiler/${name}.eli`;
      const source = await readFile(path.join(projectDirectory, relative), "utf8");
      const program = compiler.compile_ir_string(source, relative);
      const artifact = emitter.emit_module_artifact(program);
      for (const fragment of artifactFragments(artifact)) {
        expect(emitter.indent(fragment)).toEqual(
          emitter.reference_indent(fragment),
        );
        fragmentCount += 1;
      }
    }
    expect(fragmentCount).toBeGreaterThan(compilerSources.length);

    const spans = ["first", "newline", "blank", "last", "tail"];
    const boundary = {
      text: "a\n\nb",
      marks: [0, 1, 2, 3, 4].map((offset, index) => ({
        offset,
        span: spans[index],
      })),
    };
    expect(emitter.indent(boundary)).toEqual({
      text: "  a\n\n  b",
      marks: [
        { offset: 2, span: "first" },
        { offset: 3, span: "newline" },
        { offset: 4, span: "blank" },
        { offset: 7, span: "last" },
      ],
    });
    expect(emitter.indent(boundary)).toEqual(
      emitter.reference_indent(boundary),
    );
    expect(emitter.indent("\n\n")).toEqual({ text: "\n\n", marks: [] });
    expect(emitter.indent("\u{1F642}\n\u03BB")).toEqual({
      text: "  \u{1F642}\n  \u03BB",
      marks: [],
    });
    expect(emitter.indent({
      text: "x",
      marks: [
        { offset: 0, span: "one" },
        { offset: 0, span: "two" },
      ],
    })).toEqual({
      text: "  x",
      marks: [
        { offset: 2, span: "one" },
        { offset: 2, span: "two" },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed compiler indentation report matches measured sources", async () => {
  const report = validateCompilerIndentReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(await compilerIndentSourceDigest());
  expect(report.corpus.files).toHaveLength(compilerSources.length);
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.corpus.generatedBytes).toBeGreaterThan(300_000);
  expect(report.corpus.marks).toBeGreaterThan(3_000);
  expect(report.validation.fragments).toBe(
    report.corpus.fragments + report.corpus.boundaryFragments,
  );
  expect(report.measurements.speedup).toBeGreaterThanOrEqual(
    report.decision.minimumSpeedup,
  );
});
