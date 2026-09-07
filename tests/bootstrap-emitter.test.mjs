import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-ir.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const oraclePath = resolve(
  projectDirectory,
  "tests/bootstrap-emitter-oracle.el",
);
const emacs = process.env.EMACS ?? "emacs";

async function run(command, options) {
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

async function caseSource(testCase) {
  if (Object.hasOwn(testCase, "source")) {
    return testCase.source;
  }
  return Bun.file(resolve(projectDirectory, testCase.file)).text();
}

async function seedResults() {
  const output = await run(
    [
      emacs,
      "--batch",
      "-Q",
      "-L",
      "compiler",
      "-L",
      "tests",
      "--script",
      oraclePath,
    ],
    {
      env: {
        ...process.env,
        ELISCRIPT_EMITTER_FIXTURE: fixturePath,
      },
    },
  );
  return JSON.parse(output);
}

test("bootstrapped emitter matches seed ESM and Source Map output", async () => {
  const directory = await mkdtemp(
    resolve(projectDirectory, ".eliscript-emitter-"),
  );
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = async (name) => import(
      `${pathToFileURL(resolve(directory, `${name}.mjs`)).href}?test`
    );
    const [reader, expander, analyzer, ir, lower, emitter, sourceMap] =
      await Promise.all([
        module("reader"),
        module("expander"),
        module("analyzer"),
        module("ir"),
        module("lower"),
        module("emitter"),
        module("source-map"),
      ]);
    const fixture = await Bun.file(fixturePath).json();
    const generated = [];
    for (const testCase of fixture.valid) {
      const source = await caseSource(testCase);
      const forms = expander.expand_module(
        reader.read_string(source, testCase.filename),
        testCase.filename,
      );
      analyzer.analyze_module(forms, testCase.filename);
      const program = lower.lower_module(forms, testCase.filename);
      const emission = emitter.emit_module_with_source_map(
        program,
        source,
        "fixture.mjs",
        testCase.filename,
      );
      generated.push({
        name: testCase.name,
        status: "ok",
        javascript: emission.javascript,
        sourceMap: JSON.parse(emission.sourceMap),
      });
    }

    expect(generated).toEqual(await seedResults());
    const invalidImport = ir.make_node(
      "import-declaration",
      null,
      "invalid",
      [
        ir.make_node("import-namespace", null, "Namespace", [], null),
        ir.make_node("import-named", null, "named", [], null),
      ],
      null,
    );
    expect(() => emitter.emit_module(
      ir.make_program("invalid-import.eli", [invalidImport]),
    )).toThrow("namespace and named imports cannot be combined");
    expect([
      sourceMap.encode_vlq(0),
      sourceMap.encode_vlq(1),
      sourceMap.encode_vlq(-1),
      sourceMap.encode_vlq(16),
      sourceMap.encode_vlq(-16),
    ]).toEqual(["A", "C", "D", "gB", "hB"]);

    const basic = generated.find(
      (result) => result.name === "executable-basic-module",
    );
    const executablePath = resolve(directory, "executable-basic.mjs");
    await writeFile(executablePath, basic.javascript);
    const runtimeOutput = await run(
      [
        process.execPath,
        "--eval",
        "const m = await import(process.env.ELISCRIPT_TEST_MODULE); " +
          "console.log(JSON.stringify({factorial: m.factorial(5), " +
          "sum: m.sum_to(5), message: m.result.message}));",
      ],
      {
        env: {
          ...process.env,
          ELISCRIPT_TEST_MODULE: pathToFileURL(executablePath).href,
        },
      },
    );
    const runtime = JSON.parse(runtimeOutput.trim().split("\n").at(-1));
    expect(runtime).toEqual({
      factorial: 120,
      sum: 15,
      message: "hello from Eliscript",
    });

    expect(await Bun.file(resolve(directory, "emitter.mjs.map")).text())
      .toContain("bootstrap/compiler/emitter.eli");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
