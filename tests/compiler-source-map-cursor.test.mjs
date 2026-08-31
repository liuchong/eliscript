import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerSourceMapCursorSourceDigest,
  validateCompilerSourceMapCursorReport,
} from "../tools/compiler/source-map-cursor-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-source-map-cursor-macos-arm64.json",
);
const compilerNames = [
  "symbol", "syntax", "reader", "expander", "transient-analysis",
  "analyzer", "ir", "lower", "source-map", "emitter", "compiler",
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

function identity(generatedMarks, locations) {
  return JSON.stringify({
    generatedMarks,
    locations: [...locations.entries()],
  });
}

test("ordered Source Map cursors match their complete scan references", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "eliscript-source-map-cursor-"),
  );
  try {
    await run([buildPath], {
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory },
    });
    const module = (name) => import(
      `${pathToFileURL(path.join(directory, `${name}.mjs`)).href}?cursor`
    );
    const [compiler, emitter, sourceMap] = await Promise.all([
      module("compiler"), module("emitter"), module("source-map"),
    ]);
    let artifactMarks = 0;
    for (const name of compilerNames) {
      const relative = `bootstrap/compiler/${name}.eli`;
      const source = await readFile(
        path.join(projectDirectory, relative), "utf8",
      );
      const program = compiler.compile_ir_string(source, relative);
      const artifact = emitter.emit_module_artifact(program);
      const referenceMarks = sourceMap.reference_collect_generated_marks(
        artifact.text, artifact.marks,
      );
      const optimizedMarks = sourceMap.collect_generated_marks(
        artifact.text, artifact.marks,
      );
      const referenceLocations = sourceMap.reference_source_locations(
        source, referenceMarks,
      );
      const optimizedLocations = sourceMap.source_locations(
        source, optimizedMarks,
      );
      expect(identity(optimizedMarks, optimizedLocations)).toBe(
        identity(referenceMarks, referenceLocations),
      );
      artifactMarks += artifact.marks.length;
    }
    expect(artifactMarks).toBeGreaterThan(20_000);

    const source = "a\n😀b\tc";
    const generated = "x\nyz";
    const marks = [
      { offset: 0, span: { start: 0 } },
      { offset: 0, span: { start: 1 } },
      { offset: 1, span: { start: 2 } },
      { offset: 2, span: { start: 3 } },
      { offset: generated.length, span: { start: 6 } },
    ];
    const referenceMarks = sourceMap.reference_collect_generated_marks(
      generated, marks,
    );
    const optimizedMarks = sourceMap.collect_generated_marks(generated, marks);
    const referenceLocations = sourceMap.reference_source_locations(
      source, referenceMarks,
    );
    const optimizedLocations = sourceMap.source_locations(
      source, optimizedMarks,
    );
    expect(identity(optimizedMarks, optimizedLocations)).toBe(
      identity(referenceMarks, referenceLocations),
    );
    expect(optimizedMarks).toHaveLength(4);
    expect(optimizedMarks[0][0]).toBe(0);
    expect(optimizedMarks[1][0]).toBe(0);
    expect(optimizedLocations.get(2)).toEqual([1, 0]);
    expect(optimizedLocations.has(6)).toBe(false);

    const emptyMarks = [{ offset: 0, span: { start: 0 } }];
    expect(sourceMap.collect_generated_marks("", emptyMarks)).toEqual([]);
    expect(sourceMap.source_locations("", [[0, 0, { start: 0 }]]).get(0))
      .toEqual([0, 0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed Source Map cursor report matches measured sources", async () => {
  const report = validateCompilerSourceMapCursorReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(
    await compilerSourceMapCursorSourceDigest(),
  );
  expect(report.corpus.files).toHaveLength(11);
  expect(report.corpus.artifactMarks).toBeGreaterThan(20_000);
  expect(report.validation.identicalCompilerOutputs).toBe(11);
  expect(report.measurements.pipelineSpeedup).toBeGreaterThanOrEqual(
    report.decision.minimumPipelineSpeedup,
  );
  expect(report.measurements.completeCompilerSpeedup).toBeGreaterThanOrEqual(
    report.decision.minimumCompleteCompilerSpeedup,
  );
});
