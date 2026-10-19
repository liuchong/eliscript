import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { fuzzCases } from "../tools/fuzz/reader-program-fuzz.mjs";

const root = resolve(import.meta.dir, "..");
const fuzzPath = resolve(root, "tools/fuzz/reader-program-fuzz.mjs");

async function runAcceptanceFuzz() {
  const child = Bun.spawn([
    process.execPath,
    fuzzPath,
    "--cases",
    "100000",
    "--seed",
    "0x454c4931",
  ], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 300_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error("reader/program fuzz exceeded 300000 ms");
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `fuzz exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

async function runFuzzProofCommand(command, environment = {}) {
  const child = Bun.spawn(command, {cwd: root, env: {...process.env, ...environment},
    stdout: "pipe", stderr: "pipe"});
  let expired = false, forceKill;
  const timer = setTimeout(() => {
    expired = true;child.kill("SIGTERM");
    forceKill = setTimeout(() => child.kill("SIGKILL"), 1000);
  }, 30_000);
  const [status, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]).finally(() => {clearTimeout(timer);clearTimeout(forceKill);});
  if (expired) throw new Error("fuzz semantic proof command exceeded 30000 ms");
  if (status !== 0) throw new Error(stderr.trim() || stdout.trim() || "fuzz proof command exited with " + status);
  return stdout;
}

async function proveFuzzProgramEmission(selectedCompilerDirectory) {
  const selected = new Map();
  for (const item of fuzzCases(100_000, 0x454c4931)) {
    if (item.kind !== "program") continue;
    // Select the two actual legal generator structures; their original source,
    // filename and random value are compiled unchanged below.
    const scalar = /^\(module fuzz\.case-([a-z0-9]+)\n  \(defconst base-\1 ([0-9]+)\)\n  \(defun compute-\1 \(value\)\n    \(\+ value base-\1\)\)\n  \(export compute-\1\)\)$/.exec(item.source);
    const vector = /^\(module fuzz\.case-([a-z0-9]+)\n  \(defconst base-\1 \[([0-9]+) :ok\]\)\n  \(defun compute-\1 \(value\) value\)\n  \(export compute-\1\)\)$/.exec(item.source);
    const kind = scalar ? "scalar" : vector ? "vector" : null, matched = scalar ?? vector;
    if (kind !== null && !selected.has(kind)) selected.set(kind, {...item, name: "fuzz-proof-" + kind,
      shape: kind, suffix: matched[1], value: Number(matched[2]), exportName: "compute_" + matched[1]});
    if (selected.size === 2) break;
  }
  expect([...selected.keys()].sort()).toEqual(["scalar", "vector"]);
  const scalar = selected.get("scalar"), constant = "base-" + scalar.suffix;
  const readBeforeInitialization = {...scalar, name: "fuzz-proof-tdz", filename: "fuzz-proof-tdz.eli",
    shape: "tdz", source: scalar.source.replace("  (defconst " + constant,
      "  (defconst before " + constant + ")\n  (defconst " + constant)};
  const constantWrite = {...scalar, name: "fuzz-proof-const-write", filename: "fuzz-proof-const-write.eli",
    shape: "const-write", source: scalar.source
      .replace("(+ value " + constant + ")", "(setq " + constant + " value)")
      .replace("  (export compute-" + scalar.suffix + "))",
        "  (defun current () " + constant + ")\n  (export compute-" + scalar.suffix + " current))")};
  // A writer parameter named `value` captures this module binding and turns
  // its assignment into a self-assignment. Keep this executable mutation next
  // to the two original legal shapes whose private writer bytes are hashed.
  const mutableValue = {...scalar, name: "fuzz-proof-mutable-value", filename: "fuzz-proof-mutable-value.eli",
    shape: "mutable-value", source: scalar.source
      .replace("(defconst " + constant + " " + scalar.value + ")", "(defvar value -0.0)")
      .replace("(value)\n    (+ value " + constant + "))", "(next)\n    (setq value next))")
      .replace("  (export compute-" + scalar.suffix + "))",
        "  (defun current () value)\n  (export value compute-" + scalar.suffix + " current))")};
  const cases = [...selected.values(), readBeforeInitialization, mutableValue];
  // Source assignment to defconst is an analysis error in both compilers.
  // Keep this original mutation as a negative case rather than incorrectly
  // treating it as an executable program with a runtime assignment error.
  const assignmentOffset = constantWrite.source.indexOf("(setq " + constant + " value)") + "(setq ".length;
  expect(assignmentOffset).toBeGreaterThanOrEqual("(setq ".length);
  const preceding = constantWrite.source.slice(0, assignmentOffset);
  const assignmentLine = preceding.split("\n").length;
  const assignmentColumn = assignmentOffset - preceding.lastIndexOf("\n");
  const assignmentMessage = "cannot assign to immutable binding: " + constant;
  const assignmentDiagnostic = {format: "eliscript-diagnostic", version: 1,
    code: "ELI-A0001", severity: "error", phase: "analysis", message: assignmentMessage,
    location: {file: constantWrite.filename,
      start: {offset: assignmentOffset, line: assignmentLine, column: assignmentColumn},
      end: {offset: assignmentOffset + constant.length, line: assignmentLine,
        column: assignmentColumn + constant.length}}};
  const renderedAssignmentMessage = constantWrite.filename + ":" + assignmentLine + ":" +
    assignmentColumn + ": " + assignmentMessage;
  const directory = await mkdtemp(resolve(root, ".eliscript-fuzz-semantic-proof-"));
  try {
    if (selectedCompilerDirectory !== undefined &&
        (typeof selectedCompilerDirectory !== "string" || selectedCompilerDirectory.length === 0)) {
      throw new TypeError("fuzz proof requires an explicit selected compiler module directory");
    }
    const compilerDirectory = selectedCompilerDirectory ?? resolve(directory, "compiler");
    if (selectedCompilerDirectory === undefined) {
      await runFuzzProofCommand([resolve(root, "bin/eliscript-bootstrap")], {
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      });
    }
    const compiler = await import(pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href);
    const fixture = resolve(directory, "emitter-proof.json");
    await writeFile(fixture, JSON.stringify({valid: cases.map(({name, source, filename}) => ({name, source, filename})),
      invalid: [{name: constantWrite.name, source: constantWrite.source, filename: constantWrite.filename}]}));
    // A single independent Emacs process emits the entire proof batch.
    const seeded = JSON.parse(await runFuzzProofCommand([
      process.env.EMACS ?? "emacs", "--batch", "-Q", "-L", "compiler", "-L", "tests",
      "--script", resolve(root, "tests/bootstrap-emitter-oracle.el"),
    ], {ELISCRIPT_EMITTER_FIXTURE: fixture}));
    expect(seeded.map(item => item.name)).toEqual(cases.map(item => item.name));
    const analyzed = JSON.parse(await runFuzzProofCommand([
      process.env.EMACS ?? "emacs", "--batch", "-Q", "-L", "compiler", "-L", "tests",
      "--script", resolve(root, "tests/bootstrap-analyzer-oracle.el"),
    ], {ELISCRIPT_ANALYZER_FIXTURE: fixture}));
    expect(analyzed.map(item => item.name)).toEqual([...cases, constantWrite].map(item => item.name));
    expect(analyzed.slice(0, cases.length).map(item => item.status)).toEqual(cases.map(() => "ok"));
    expect(analyzed.at(-1)).toEqual({name: constantWrite.name, status: "error",
      message: renderedAssignmentMessage, diagnostic: assignmentDiagnostic});
    for (const compile of [
      () => compiler.compile_string(constantWrite.source, constantWrite.filename),
      () => compiler.compile_string_with_source_map(constantWrite.source, constantWrite.filename, "fixture.mjs", constantWrite.filename),
    ]) {
      let rejected = false;
      try {compile();} catch (error) {
        rejected = true;
        expect(error.message).toBe(renderedAssignmentMessage);
        expect(error.eliscriptDiagnostic).toEqual(assignmentDiagnostic);
      }
      expect(rejected).toBe(true);
    }
    const observations = [];
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index], oracle = seeded[index];
      expect(oracle.status).toBe("ok");
      const javascript = compiler.compile_string(item.source, item.filename);
      const mapped = compiler.compile_string_with_source_map(item.source, item.filename, "fixture.mjs", item.filename);
      expect(javascript).toBe(oracle.javascript);
      expect(mapped.javascript).toBe(oracle.javascript);
      expect(JSON.parse(mapped.sourceMap)).toEqual(oracle.sourceMap);
      expect(javascript).toContain("function __eliscript_tdz_write_0(__eliscript_tdz_value_0)");
      expect(javascript).not.toContain("function __eliscript_tdz_write_0(value)");
      if (item.shape === "mutable-value") {
        expect(javascript).toContain("return (value = __eliscript_tdz_value_0);");
      }
      const seedPath = resolve(directory, item.name + "-seed.mjs");
      const selfPath = resolve(directory, item.name + "-self.mjs");
      await writeFile(seedPath, oracle.javascript);
      await writeFile(selfPath, javascript);
      observations.push({shape: item.shape, value: item.value, exportName: item.exportName,
        artifacts: [pathToFileURL(seedPath).href, pathToFileURL(selfPath).href]});
    }
    const nodeSource = [
      'import assert from "node:assert/strict";',
      "const observations=" + JSON.stringify(observations) + ";",
      "for(const item of observations)for(const path of item.artifacts){",
      '  if(item.shape==="tdz"){await assert.rejects(import(path),ReferenceError);continue;}',
      "  const module=await import(path),call=module[item.exportName];",
      '  assert.equal(typeof call,"function");',
      '  if(item.shape==="scalar"){',
      "    for(const input of[-3,0,-0,2,42,NaN,Infinity])assert(Object.is(call(input),input+item.value));",
      '  }else if(item.shape==="vector"){',
      "    for(const input of[undefined,null,false,0,-0,NaN,\"\",[],{}])assert(Object.is(call(input),input));",
      '  }else if(item.shape==="mutable-value"){',
      '    assert(Object.is(module.value,-0));assert(Object.is(module.current(),-0));',
      '    const object={marker:7};',
      '    for(const input of[undefined,null,false,true,-0,0,NaN,Infinity,"updated",object]){',
      '      assert(Object.is(call(input),input));assert(Object.is(module.value,input));',
      '      assert(Object.is(module.current(),input));',
      '    }',
      '  }else assert.fail("unrecognized original fuzz structure");',
      "}",
    ].join("\n");
    const nodePath = resolve(directory, "execute-proof.mjs");
    await writeFile(nodePath, nodeSource);
    await runFuzzProofCommand([process.env.NODE ?? "node", nodePath]);
  } finally {await rm(directory, {recursive: true, force: true});}
}

test("100000 deterministic reader and program mutations preserve every invariant", async () => {
  await proveFuzzProgramEmission();
  const report = await runAcceptanceFuzz();
  expect(report).toMatchObject({
    schemaVersion: 1,
    format: "eliscript-reader-program-fuzz",
    version: 1,
    verified: true,
    seed: "0x454c4931",
    inputs: 100_000,
    readerInputs: 50_000,
    programInputs: 50_000,
    maximumSourceCharacters: 4_096,
    maximumCorpusBytes: 67_108_864,
    corpusReplayed: true,
    reader: {
      accepted: 46_889,
      rejected: 53_111,
      deterministicResults: 100_000,
      structuredDiagnostics: 53_111,
      spanValidated: 46_889,
      roundTrips: 46_889,
      seedAgreements: 100_000,
      resultDigest: "31961b6ffb8ce276a67db1b7cce2b723cf512b6c1518f8023985606535c69e7e",
    },
    compiler: {
      accepted: 10_171,
      rejected: 39_829,
      structuredDiagnostics: 39_829,
      // Relative to 021e30774036a6eede19977235375e1fe3ebf04a881ef04a126b642868aca701,
      // the private TDZ writer formal changes from value to
      // __eliscript_tdz_value_0 in all 10171 legal programs. Reversing only that
      // rename reproduces the old digest, with every rejection unchanged.
      // Independent Seed bytes and Node execution above also cover a mutable
      // module named value, where the old formal captured the module binding.
      resultDigest: "b31c1f4546e42b3501fcc8a97403b171a6d3bb0ba8976bbe8bf305a235db7024",
    },
    corpusDigest: "4b49f0e21a825e41344fc29387b5298462d17cd1140b2f1f06076a18fe1f8cab",
  });
  expect(report.corpusBytes).toBeGreaterThan(1_000_000);
  expect(report.corpusBytes).toBeLessThanOrEqual(report.maximumCorpusBytes);
  expect(report.reader.accepted + report.reader.rejected).toBe(100_000);
  expect(report.reader.accepted).toBeGreaterThan(10_000);
  expect(report.reader.rejected).toBeGreaterThan(10_000);
  expect(report.reader.spanValidated).toBe(report.reader.accepted);
  expect(report.reader.roundTrips).toBe(report.reader.accepted);
  expect(report.reader.structuredDiagnostics).toBe(report.reader.rejected);
  expect(report.compiler.accepted + report.compiler.rejected).toBe(50_000);
  expect(report.compiler.accepted).toBeGreaterThan(5_000);
  expect(report.compiler.rejected).toBeGreaterThan(20_000);
  expect(report.compiler.structuredDiagnostics).toBe(report.compiler.rejected);
  for (const digest of [
    report.corpusDigest,
    report.reader.resultDigest,
    report.compiler.resultDigest,
  ]) {
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  }
}, 320_000);
