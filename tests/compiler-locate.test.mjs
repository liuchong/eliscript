import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compilerLocateSourceDigest,
  validateCompilerLocateReport,
} from "../tools/compiler/locate-benchmark.mjs";

const projectDirectory = path.resolve(import.meta.dir, "..");
const buildPath = path.join(projectDirectory, "bin/eliscript-bootstrap");
const reportPath = path.join(
  projectDirectory,
  "benchmarks/compiler-locate-macos-arm64.json",
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

test("ordered compiler mark location matches its scan and copy reference", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "eliscript-locate-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = (name) => import(
      `${pathToFileURL(path.join(directory, `${name}.mjs`)).href}?locate`
    );
    const [compiler, emitter] = await Promise.all([
      module("compiler"),
      module("emitter"),
    ]);

    let cases = 0;
    for (const name of compilerSources) {
      const relative = `bootstrap/compiler/${name}.eli`;
      const source = await readFile(path.join(projectDirectory, relative), "utf8");
      const program = compiler.compile_ir_string(source, relative);
      const node = program.body[0];
      for (const fragment of artifactFragments(
        emitter.emit_module_artifact(program),
      )) {
        expect(emitter.locate(node, fragment)).toEqual(
          emitter.reference_locate(node, fragment),
        );
        cases += 1;
        if (fragment.text.length > 1 && fragment.marks.length > 1) {
          const shifted = {
            text: fragment.text.slice(1),
            marks: fragment.marks
              .filter((mark) => mark.offset >= 1)
              .map((mark) => ({
                offset: mark.offset - 1,
                span: mark.span,
              })),
          };
          expect(emitter.locate(node, shifted)).toEqual(
            emitter.reference_locate(node, shifted),
          );
          cases += 1;
        }
      }
    }
    expect(cases).toBe(33);

    const node = { span: "parent" };
    const empty = { text: "", marks: [] };
    const located = { text: "x", marks: [{ offset: 0, span: "child" }] };
    const noSpan = { span: null };
    expect(emitter.locate(node, empty)).toBe(empty);
    expect(emitter.locate(node, located)).toBe(located);
    expect(emitter.locate(noSpan, located)).toBe(located);

    const marks = [
      { offset: 2, span: "child-one" },
      { offset: 2, span: "child-two" },
      { offset: 4, span: "child-three" },
    ];
    const fragment = { text: "value", marks };
    const result = emitter.locate(node, fragment);
    expect(result).not.toBe(fragment);
    expect(result.text).toBe(fragment.text);
    expect(result.marks).not.toBe(marks);
    expect(result.marks).toEqual([
      { offset: 0, span: "parent" },
      ...marks,
    ]);
    expect(fragment.marks).toBe(marks);
    expect(marks).toHaveLength(3);
    expect(emitter.locate({ span: null }, fragment)).toBe(fragment);
    expect(emitter.locate({ span: undefined }, fragment)).toBe(fragment);
    expect(emitter.locate({ span: false }, fragment)).toBe(fragment);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("committed compiler location report matches measured sources", async () => {
  const report = validateCompilerLocateReport(
    JSON.parse(await readFile(reportPath, "utf8")),
  );
  expect(report.sourceDigest).toEqual(await compilerLocateSourceDigest());
  expect(report.corpus.files).toHaveLength(compilerSources.length);
  expect(report.corpus.sourceBytes).toBeGreaterThan(200_000);
  expect(report.corpus.artifactFragments).toBe(22);
  expect(report.corpus.shiftedCases).toBe(11);
  expect(report.corpus.cases).toBe(33);
  expect(report.corpus.marks).toBeGreaterThan(30_000);
  expect(report.measurements.speedup).toBeGreaterThanOrEqual(
    report.decision.minimumSpeedup,
  );
});
