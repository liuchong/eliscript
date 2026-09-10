import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  compileFile,
  loadCompiler,
  parseArguments,
} from "../bootstrap/host/bun.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const publicCliPath = resolve(projectDirectory, "bin/eliscript");
const seedCliPath = resolve(projectDirectory, "bin/eliscript-seed");
const portableCliPath = resolve(projectDirectory, "bin/eliscript-portable");
const emacs = process.env.EMACS ?? "emacs";
const moduleNames = [
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
  return { exitCode, stdout, stderr };
}

async function runSuccessful(command, options) {
  const result = await run(command, options);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() ||
      `${command[0]} exited with ${result.exitCode}`);
  }
  return result.stdout;
}

async function buildWithPortableCompiler(compilerDirectory, outputDirectory) {
  const compiler = await loadCompiler(compilerDirectory);
  for (const name of moduleNames) {
    await compileFile({
      compiler,
      input: resolve(projectDirectory, `bootstrap/compiler/${name}.eli`),
      output: resolve(outputDirectory, `${name}.mjs`),
      sourceMap: true,
    });
  }
}

async function expectArtifactDirectoriesEqual(left, right) {
  for (const name of moduleNames) {
    for (const suffix of [".mjs", ".mjs.map"]) {
      const filename = `${name}${suffix}`;
      expect(await Bun.file(resolve(right, filename)).text())
        .toBe(await Bun.file(resolve(left, filename)).text());
    }
  }
}

test("portable compiler driver reaches a reproducible fixed point", async () => {
  expect(parseArguments(["--", "-o", "out.mjs", "input.eli"]))
    .toEqual({
      input: "input.eli",
      output: "out.mjs",
      sourceMap: false,
      portableEntries: [],
      diagnosticFormat: "human",
    });
  expect(parseArguments([
    "--portable",
    "work",
    "--portable",
    "index",
    "input.eli",
  ])).toEqual({
    input: "input.eli",
    output: undefined,
    sourceMap: false,
    portableEntries: ["work", "index"],
    diagnosticFormat: "human",
  });
  expect(parseArguments([
    "--diagnostic-format",
    "json",
    "input.eli",
  ])).toEqual({
    input: "input.eli",
    output: undefined,
    sourceMap: false,
    portableEntries: [],
    diagnosticFormat: "json",
  });
  expect(parseArguments(["--help"])).toEqual({ help: true });
  expect(() => parseArguments(["--source-map", "input.eli"]))
    .toThrow("--source-map requires --output");
  expect(() => parseArguments(["one.eli", "two.eli"]))
    .toThrow("multiple input files are not supported yet");

  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-compiler-"));
  try {
    const generationOne = resolve(directory, "generation-one");
    const generationTwo = resolve(directory, "generation-two");
    const generationThree = resolve(directory, "generation-three");
    await runSuccessful([buildPath], {
      env: {
        ...process.env,
        EMACS: emacs,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: generationOne,
      },
    });

    await buildWithPortableCompiler(generationOne, generationTwo);
    await buildWithPortableCompiler(generationTwo, generationThree);
    await expectArtifactDirectoriesEqual(generationOne, generationTwo);
    await expectArtifactDirectoriesEqual(generationTwo, generationThree);

    const coreSource = resolve(projectDirectory, "tests/fixtures/core.eli");
    const seedOutput = await runSuccessful([seedCliPath, coreSource], {
      env: { ...process.env, EMACS: emacs },
    });
    const portableOutput = await runSuccessful([portableCliPath, coreSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    expect(portableOutput).toBe(seedOutput);
    const publicBunOutput = await runSuccessful([publicCliPath, coreSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    const publicNodeOutput = await runSuccessful([publicCliPath, coreSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        ELISCRIPT_JS_RUNTIME: "node",
      },
    });
    expect(publicBunOutput).toBe(seedOutput);
    expect(publicNodeOutput).toBe(seedOutput);

    const automaticCompiler = resolve(directory, "automatic-compiler");
    const automaticOutput = await runSuccessful([publicCliPath, coreSource], {
      env: {
        ...process.env,
        EMACS: emacs,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: automaticCompiler,
        ELISCRIPT_JS_RUNTIME: "node",
      },
    });
    expect(automaticOutput).toBe(seedOutput);
    expect(await Bun.file(resolve(automaticCompiler, "compiler.mjs")).exists())
      .toBeTrue();

    const diagnosticSource = resolve(directory, "diagnostic.eli");
    await writeFile(diagnosticSource, "(defun broken ()\n  missing)\n");
    const diagnosticFailure = await run([
      portableCliPath,
      "--diagnostic-format",
      "json",
      diagnosticSource,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    expect(diagnosticFailure.exitCode).toBe(1);
    expect(diagnosticFailure.stdout).toBe("");
    expect(JSON.parse(diagnosticFailure.stderr)).toEqual({
      format: "eliscript-diagnostic",
      version: 1,
      code: "ELI-A0001",
      severity: "error",
      phase: "analysis",
      message: "unbound symbol: missing",
      location: {
        file: diagnosticSource,
        start: { offset: 19, line: 2, column: 3 },
        end: { offset: 26, line: 2, column: 10 },
      },
    });
    const publicNodeDiagnostic = await run([
      publicCliPath,
      "--diagnostic-format",
      "json",
      diagnosticSource,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        ELISCRIPT_JS_RUNTIME: "node",
      },
    });
    expect(publicNodeDiagnostic.exitCode).toBe(1);
    expect(publicNodeDiagnostic.stdout).toBe("");
    expect(JSON.parse(publicNodeDiagnostic.stderr))
      .toEqual(JSON.parse(diagnosticFailure.stderr));

    for (const [sourcePath, expectedFunctions] of [
      ["stdlib/sequence.eli", [
        "function map(function$, values)",
        "function range_by(start, end, step)",
      ]],
      ["stdlib/text.eli", [
        "function slice(start, end, text)",
        "function trim(text)",
      ]],
      ["stdlib/object.eli", [
        "function assoc(object, key, value)",
        "function omit(object, omitted_keys)",
      ]],
      ["stdlib/data.eli", [
        "import {assoc} from \"./object.eli\";",
        "import {has_QMARK_} from \"./object.eli\";",
        "function group_by(key_function, values)",
      ]],
      ["stdlib/function.eli", [
        "import {empty_persistent_vector, persistent_vector_conj} from \"./persistent-vector.eli\";",
        "function identity(value)",
        "function comp(...functions)",
        "function partial(function$, ...bound_arguments)",
        "function juxt(...functions)",
        "function fnil(function$, ...defaults)",
        "function every_pred(...predicates)",
        "function some_fn(...predicates)",
        "function trampoline(function$, ...arguments$)",
      ]],
      ["stdlib/core/protocol.eli", [
        "function define_protocol(name, operations)",
        "function extend_protocol_type(protocol, constructor, implementations)",
      ]],
      ["stdlib/core/identifier.eli", [
        "function keyword(...arguments$)",
        "function symbol(...arguments$)",
        "function qualified_name(value)",
      ]],
      ["stdlib/core/data-text.eli", [
        "function print_value(value, options = null)",
        "function read_value(source, options = null)",
        "function read_values(source, options = null)",
      ]],
      ["stdlib/core/metadata.eli", [
        "function meta(value)",
        "function with_meta(value, metadata)",
        "function vary_meta(value, transform, ...arguments$)",
      ]],
      ["stdlib/core/collection.eli", [
        "function assoc(collection, key, value, ...key_values)",
        "function collection_count(collection)",
        "function disj(collection, ...values)",
        "function dissoc(collection, ...keys)",
        "function peek(collection)",
        "function pop(collection)",
        "function rseq(collection)",
        "function reduce(collection, reducer, ...initial)",
        "function reduce_kv(collection, reducer, initial)",
        "function reduction_view(reduce_function)",
        "function reduction_view_QMARK_(value)",
        "function unbounded_sequence_view(factory)",
      ]],
      ["stdlib/core/transient.eli", [
        "function assoc_BANG_(collection, key, value, ...key_values)",
        "function persistent_BANG_(collection)",
      ]],
      ["stdlib/core/transducer.eli", [
        "function catting()",
        "function compose_transducers(...transducers)",
        "function deduping()",
        "function distincting()",
        "function eduction(...arguments$)",
        "function interposing(separator)",
        "function keeping_indexed(transform)",
        "function mapping_indexed(transform)",
        "function mapcatting(transform)",
        "function partitioning_all(size)",
        "function partitioning_by(classifier)",
        "function run_BANG_(procedure, collection)",
        "function taking_nth(interval)",
        "function taking_while(predicate)",
        "function transduce(transducer, reducer, initial, collection)",
      ]],
      ["stdlib/core/seq.eli", [
        "function range(...bounds)",
        "function repeat(...arguments$)",
        "function repeatedly(...arguments$)",
        "function iterate(transform, seed)",
        "function cycle(collection)",
        "function generate(limit, producer)",
        "function first(collection, not_found_value = null)",
        "function sequence_nth(index, collection, not_found_value = null)",
        "function last(collection, not_found_value = null)",
        "function take_last(limit, collection)",
        "function drop_last(limit, collection)",
        "function butlast(collection)",
        "function split_at(limit, collection)",
        "function split_with(predicate, collection)",
        "function reverse(collection)",
        "implementsProtocolOperation(IReversible, \"rseq\", collection)",
        "function map(transform, collection)",
        "function map_indexed(transform, collection)",
        "function distinct(collection)",
        "function mapcat(transform, collection)",
        "function partition(size, ...arguments$)",
        "function partition_all(size, ...arguments$)",
        "function interleave(...collections)",
        "function interleave_all(...collections)",
        "function not_any_QMARK_(predicate, collection)",
        "function not_every_QMARK_(predicate, collection)",
        "function reductions(step, initial, collection)",
        "function tree_seq(branch_predicate, children_function, root)",
        "function flatten(root)",
        "function concat(...collections)",
      ]],
      ["stdlib/core/data.eli", [
        "function collect_buckets(key_function, collection, create_bucket, update_bucket)",
        "function index_by(key_function, collection)",
        "function get_in(collection, path, not_found = null)",
        "function assoc_in(collection, path, value)",
        "function update(collection, key, transform, ...arguments$)",
        "function update_in(collection, path, transform, ...arguments$)",
        "function select_keys(collection, keys)",
        "function merge(...collections)",
        "function merge_with(combine, ...collections)",
        "function zipmap(keys, values)",
      ]],
      ["stdlib/core/set.eli", [
        "function set(...arguments$)",
        "function union(...collections)",
        "function intersection(...collections)",
        "function difference(...collections)",
        "function subset_QMARK_(...arguments$)",
        "function superset_QMARK_(...arguments$)",
        "function disjoint_QMARK_(...arguments$)",
        "function select(...arguments$)",
        "function project(...arguments$)",
        "function rename_keys(...arguments$)",
        "function rename(...arguments$)",
        "function index(...arguments$)",
        "function map_invert(...arguments$)",
        "function join(...arguments$)",
      ]],
      ["stdlib/core/order.eli", [
        "function compare_values(left, right)",
        "function comparator(comparison)",
        "function reverse_comparator(...arguments$)",
        "function sort(...arguments$)",
        "function sort_by(key_function, ...arguments$)",
        "function min_key(key_function, ...values)",
        "function max_key(key_function, ...values)",
      ]],
      ["examples/emacs-index/index.eli", [
        "import {count_by} from \"../../stdlib/data.eli\";",
        "function score_document(id, terms, query_terms)",
      ]],
    ]) {
      const source = resolve(projectDirectory, sourcePath);
      const seedLibraryOutput = await runSuccessful([seedCliPath, source], {
        env: { ...process.env, EMACS: emacs },
      });
      const selfHostedLibraryOutput = await runSuccessful(
        [portableCliPath, source],
        {
          env: {
            ...process.env,
            ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
          },
        },
      );
      expect(selfHostedLibraryOutput).toBe(seedLibraryOutput);
      for (const expectedFunction of expectedFunctions) {
        expect(seedLibraryOutput).toContain(expectedFunction);
      }
    }

    const portableSource = resolve(directory, "portable.eli");
    await writeFile(
      portableSource,
      `(defconst step 2)
(defportable helper (value) (* value step))
(defportable work (value) (helper value))
(defportable unused () 99)
(defun ordinary () 1)\n`,
    );
    const seedPortableOutput = await runSuccessful(
      [seedCliPath, "--portable", "work", portableSource],
      { env: { ...process.env, EMACS: emacs } },
    );
    const selfHostedPortableOutput = await runSuccessful(
      [portableCliPath, "--portable", "work", portableSource],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    expect(selfHostedPortableOutput).toBe(seedPortableOutput);
    expect(seedPortableOutput).toContain("function helper(value)");
    expect(seedPortableOutput).toContain("function work(value)");
    expect(seedPortableOutput).not.toContain("function unused");
    expect(seedPortableOutput).not.toContain("function ordinary");

    const importedPortableSource = resolve(directory, "portable-import.eli");
    await writeFile(
      importedPortableSource,
      `(import-portable "./helper.eli" helper)
(defportable imported-work (value) (helper value))\n`,
    );
    const seedImportFailure = await run([
      seedCliPath,
      "--portable",
      "imported-work",
      importedPortableSource,
    ], { env: { ...process.env, EMACS: emacs } });
    const portableImportFailure = await run([
      portableCliPath,
      "--portable",
      "imported-work",
      importedPortableSource,
    ], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    expect(seedImportFailure.exitCode).toBe(1);
    expect(portableImportFailure.exitCode).toBe(1);
    expect(seedImportFailure.stderr)
      .toContain("portable import helper requires a project build");
    expect(portableImportFailure.stderr)
      .toContain("portable import helper requires a project build");

    const seedPortableMapped = resolve(directory, "seed-cli/portable.mjs");
    const selfHostedPortableMapped = resolve(
      directory,
      "portable-cli/portable.mjs",
    );
    await runSuccessful(
      [
        seedCliPath,
        "--source-map",
        "--portable",
        "work",
        "--output",
        seedPortableMapped,
        portableSource,
      ],
      { env: { ...process.env, EMACS: emacs } },
    );
    await runSuccessful(
      [
        portableCliPath,
        "--source-map",
        "--portable",
        "work",
        "--output",
        selfHostedPortableMapped,
        portableSource,
      ],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    expect(await Bun.file(selfHostedPortableMapped).text())
      .toBe(await Bun.file(seedPortableMapped).text());
    expect(await Bun.file(`${selfHostedPortableMapped}.map`).text())
      .toBe(await Bun.file(`${seedPortableMapped}.map`).text());

    const seedMapped = resolve(directory, "seed-cli/core.mjs");
    const portableMapped = resolve(directory, "portable-cli/core.mjs");
    const publicNodeMapped = resolve(directory, "public-node/core.mjs");
    await runSuccessful(
      [seedCliPath, "--source-map", "--output", seedMapped, coreSource],
      { env: { ...process.env, EMACS: emacs } },
    );
    await runSuccessful(
      [portableCliPath, "--source-map", "--output", portableMapped, coreSource],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
        },
      },
    );
    await runSuccessful(
      [publicCliPath, "--source-map", "--output", publicNodeMapped, coreSource],
      {
        env: {
          ...process.env,
          ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
          ELISCRIPT_JS_RUNTIME: "node",
        },
      },
    );
    expect(await Bun.file(portableMapped).text())
      .toBe(await Bun.file(seedMapped).text());
    expect(await Bun.file(`${portableMapped}.map`).text())
      .toBe(await Bun.file(`${seedMapped}.map`).text());
    expect(await Bun.file(publicNodeMapped).text())
      .toBe(await Bun.file(seedMapped).text());
    expect(await Bun.file(`${publicNodeMapped}.map`).text())
      .toBe(await Bun.file(`${seedMapped}.map`).text());

    const brokenSource = resolve(directory, "broken.eli");
    await writeFile(brokenSource, "(defun broken () missing)\n");
    const seedFailure = await run([seedCliPath, brokenSource], {
      env: { ...process.env, EMACS: emacs },
    });
    const portableFailure = await run([portableCliPath, brokenSource], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: generationTwo,
      },
    });
    const diagnostic = `${brokenSource}:1:18: unbound symbol: missing`;
    expect(seedFailure.exitCode).toBe(1);
    expect(portableFailure.exitCode).toBe(1);
    expect(portableFailure.stdout).toBe(seedFailure.stdout);
    expect(seedFailure.stderr).toContain(diagnostic);
    expect(portableFailure.stderr).toContain(diagnostic);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
