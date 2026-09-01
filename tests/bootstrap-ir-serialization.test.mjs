import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const fixturePath = resolve(
  projectDirectory,
  "tests/fixtures/bootstrap-ir.json",
);
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");

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

async function caseSource(testCase) {
  if (Object.hasOwn(testCase, "source")) {
    return testCase.source;
  }
  return Bun.file(resolve(projectDirectory, testCase.file)).text();
}

function expectSchemaFailure(callback, message) {
  try {
    callback();
    throw new Error("expected IR schema failure");
  } catch (error) {
    if (error.message === "expected IR schema failure") throw error;
    expect(error.message).toContain(message);
    expect(error.eliscriptDiagnostic).toEqual({
      format: "eliscript-diagnostic",
      version: 1,
      code: "ELI-I0001",
      severity: "error",
      phase: "ir-schema",
      message: error.message,
    });
  }
}

test("canonical IR v1 is lossless, strict, and host reproducible", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-ir-schema-"));
  try {
    await run([buildPath], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    const module = async (name) => import(
      `${pathToFileURL(resolve(directory, `${name}.mjs`)).href}?serialization`
    );
    const [reader, expander, analyzer, ir, lower, compiler] =
      await Promise.all([
        module("reader"),
        module("expander"),
        module("analyzer"),
        module("ir"),
        module("lower"),
        module("compiler"),
      ]);

    expect(ir.ir_format).toBe("eliscript-ir");
    expect(ir.ir_version).toBe(1);
    expect(compiler.ir_format).toBe(ir.ir_format);
    expect(compiler.ir_version).toBe(ir.ir_version);

    const fixture = await Bun.file(fixturePath).json();
    const programs = [];
    for (const testCase of fixture.valid) {
      const source = await caseSource(testCase);
      const forms = expander.expand_module(
        reader.read_string(source, testCase.filename),
        testCase.filename,
      );
      analyzer.analyze_module(forms, testCase.filename);
      const program = lower.lower_module(forms, testCase.filename);
      const serialized = compiler.serialize_ir_program(program);
      expect(serialized.startsWith(
        '{"format":"eliscript-ir","program":{"body":',
      )).toBeTrue();
      expect(serialized.endsWith('},"version":1}')).toBeTrue();
      expect(compiler.deserialize_ir_program(serialized)).toEqual(program);
      expect(compiler.serialize_ir_program(
        compiler.deserialize_ir_program(serialized),
      )).toBe(serialized);
      programs.push({ program, serialized });
    }

    const kinds = new Set();
    const visit = (node) => {
      kinds.add(node.kind);
      node.children.forEach(visit);
    };
    programs.forEach(({ program }) => program.body.forEach(visit));
    expect([...kinds].sort()).toEqual([...ir.node_kinds].sort());

    const portablePath = resolve(directory, "portable-ir.json");
    await writeFile(portablePath, programs.at(-1).serialized, "utf8");
    const nodeOutput = await run([
      process.env.NODE ?? "node",
      "--input-type=module",
      "--eval",
      "import { readFile } from 'node:fs/promises'; const compiler = await import(process.argv[1]); const source = await readFile(process.argv[2], 'utf8'); process.stdout.write(compiler.serialize_ir_program(compiler.deserialize_ir_program(source)));",
      pathToFileURL(resolve(directory, "compiler.mjs")).href,
      portablePath,
    ]);
    expect(nodeOutput).toBe(programs.at(-1).serialized);

    const sample = programs[0];
    const document = JSON.parse(sample.serialized);
    expectSchemaFailure(
      () => compiler.deserialize_ir_program(` ${sample.serialized}`),
      "not canonical",
    );
    expectSchemaFailure(
      () => compiler.deserialize_ir_program(
        '{"format":"eliscript-ir","format":"eliscript-ir","program":{"body":[],"filename":"x.eli"},"version":1}',
      ),
      "not canonical",
    );
    expectSchemaFailure(
      () => compiler.deserialize_ir_program("{"),
      "invalid canonical IR JSON",
    );
    expectSchemaFailure(
      () => compiler.deserialize_ir_program(42),
      "must be a string",
    );

    expectSchemaFailure(
      () => compiler.deserialize_ir_program(JSON.stringify({
        ...document,
        extra: true,
      })),
      "unknown or missing fields",
    );
    expectSchemaFailure(
      () => compiler.deserialize_ir_program(
        sample.serialized.replace('"version":1}', '"version":2}'),
      ),
      "unsupported IR version",
    );

    const unknownKind = structuredClone(document);
    unknownKind.program.body[0].kind = "future-node";
    expectSchemaFailure(
      () => compiler.serialize_ir_program(unknownKind.program),
      "unknown Eliscript IR node kind",
    );

    const badSpan = structuredClone(document.program);
    badSpan.body[0].span.start = -1;
    expectSchemaFailure(
      () => compiler.serialize_ir_program(badSpan),
      "must be a non-negative integer",
    );

    const nonFinite = structuredClone(document.program);
    nonFinite.body[0].value = Number.NaN;
    expectSchemaFailure(
      () => compiler.serialize_ir_program(nonFinite),
      "finite numbers",
    );

    const negativeZero = structuredClone(document.program);
    negativeZero.body[0].value = -0;
    const negativeZeroSource = compiler.serialize_ir_program(negativeZero);
    expect(negativeZeroSource).toContain('"value":-0');
    expect(Object.is(
      compiler.deserialize_ir_program(negativeZeroSource).body[0].value,
      -0,
    )).toBeTrue();

    const sparse = structuredClone(document.program);
    sparse.body = new Array(1);
    expectSchemaFailure(
      () => compiler.serialize_ir_program(sparse),
      "dense plain array",
    );

    const nullChild = structuredClone(document.program);
    nullChild.body[0].children.push(null);
    expectSchemaFailure(
      () => compiler.serialize_ir_program(nullChild),
      "plain data object",
    );

    const accessor = structuredClone(document.program);
    Object.defineProperty(accessor.body[0], "properties", {
      enumerable: true,
      get: () => ({}),
    });
    expectSchemaFailure(
      () => compiler.serialize_ir_program(accessor),
      "plain data object",
    );

    const cyclic = structuredClone(document.program);
    cyclic.body[0].children.push(cyclic.body[0]);
    expectSchemaFailure(
      () => compiler.serialize_ir_program(cyclic),
      "must not contain a cycle",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
