#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "../..");
const buildPath = resolve(root, "bin/eliscript-bootstrap");
const oraclePath = resolve(root, "tools/fuzz/reader-oracle.el");
const defaultCases = 100_000;
const defaultSeed = 0x454c4931;
const maximumCases = 1_000_000;
const maximumSourceCharacters = 4_096;
const maximumCorpusBytes = 64 * 1024 * 1024;
const commandTimeoutMs = 120_000;
const oracleTimeoutMs = 240_000;
const activeChildren = new Set();

function fail(message, testCase) {
  const suffix = testCase === undefined
    ? ""
    : `\ncase ${testCase.index} (${testCase.kind}) ${testCase.filename}\n${testCase.source}`;
  const error = new Error(`${message}${suffix}`);
  error.eliscriptFuzzInvariant = true;
  throw error;
}

function parsePositiveInteger(text, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!/^[1-9]\d*$/u.test(text)) fail(`${name} must be a positive integer`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > maximum) {
    fail(`${name} must not exceed ${maximum}`);
  }
  return value;
}

function parseSeed(text) {
  if (!/^(?:0x[\da-f]+|\d+)$/iu.test(text)) {
    fail("seed must be an unsigned 32-bit integer");
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    fail("seed must be an unsigned 32-bit integer");
  }
  return value >>> 0;
}

export function parseArguments(arguments_) {
  const result = { cases: defaultCases, seed: defaultSeed };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--cases") {
      const value = arguments_[index + 1];
      if (value === undefined) fail("--cases requires a value");
      result.cases = parsePositiveInteger(value, "cases", maximumCases);
      index += 1;
    } else if (argument === "--seed") {
      const value = arguments_[index + 1];
      if (value === undefined) fail("--seed requires a value");
      result.seed = parseSeed(value);
      index += 1;
    } else {
      fail(`unknown argument ${argument}`);
    }
  }
  return result;
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function randomInteger(random, maximum) {
  return random() % maximum;
}

function choose(random, values) {
  return values[randomInteger(random, values.length)];
}

const atoms = Object.freeze([
  "nil", "t", "false", "undefined", "0", "17", "-42", "3.5", "1e3",
  ":tag", ":ns/name", "alpha", "ready?", "value-name", "ns/item", "+",
  JSON.stringify(""), JSON.stringify("line\nbreak"), JSON.stringify("quote\"slash\\"),
  JSON.stringify("你好"), JSON.stringify("😀"),
]);
const separators = Object.freeze([" ", "\n", "\t", " ; fuzz\n", " \f "]);

function generatedForm(random, depth) {
  if (depth <= 0 || randomInteger(random, 5) === 0) return choose(random, atoms);
  const child = () => generatedForm(random, depth - 1);
  const join = (values) => values.join(choose(random, separators));
  switch (randomInteger(random, 7)) {
    case 0: {
      const values = Array.from({ length: randomInteger(random, 4) }, child);
      return `(${join(values)})`;
    }
    case 1: {
      const values = Array.from({ length: randomInteger(random, 4) }, child);
      return `[${join(values)}]`;
    }
    case 2: {
      const pairs = randomInteger(random, 3);
      const values = Array.from({ length: pairs * 2 }, child);
      return `{${join(values)}}`;
    }
    case 3: {
      const values = Array.from({ length: randomInteger(random, 4) }, child);
      return `#{${join(values)}}`;
    }
    case 4:
      return `'${child()}`;
    case 5:
      return `#'${child()}`;
    default:
      return `\`${child()}`;
  }
}

function readerCase(random, index) {
  const count = 1 + randomInteger(random, 3);
  const base = Array.from(
    { length: count },
    () => generatedForm(random, 3),
  ).join(choose(random, separators));
  let source;
  switch (randomInteger(random, 12)) {
    case 0:
      source = base;
      break;
    case 1:
      source = `(${base})`;
      break;
    case 2:
      source = `'${base}`;
      break;
    case 3:
      source = `${base}\n; deterministic tail`;
      break;
    case 4:
      source = `(${base}`;
      break;
    case 5:
      source = `${base})`;
      break;
    case 6:
      source = `[${base})`;
      break;
    case 7:
      source = `{${generatedForm(random, 0)}}`;
      break;
    case 8:
      source = ":";
      break;
    case 9:
      source = "'";
      break;
    case 10:
      source = "#x";
      break;
    default:
      source = `"unterminated-${index}`;
      break;
  }
  return {
    index,
    kind: "reader",
    filename: `fuzz-reader-${index}.eli`,
    source,
  };
}

function programCase(random, index) {
  const suffix = index.toString(36);
  const moduleName = `fuzz.case-${suffix}`;
  const constant = `base-${suffix}`;
  const functionName = `compute-${suffix}`;
  const value = randomInteger(random, 10_000);
  const valid = `(module ${moduleName}\n  (defconst ${constant} ${value})\n  (defun ${functionName} (value)\n    (+ value ${constant}))\n  (export ${functionName}))`;
  let source;
  switch (randomInteger(random, 10)) {
    case 0:
      source = valid;
      break;
    case 1:
      source = `(module ${moduleName}\n  (defconst ${constant} [${value} :ok])\n  (defun ${functionName} (value) value)\n  (export ${functionName}))`;
      break;
    case 2:
      source = valid.replace(`(+ value ${constant})`, `(+ value missing-${suffix})`);
      break;
    case 3:
      source = valid.slice(0, -1);
      break;
    case 4:
      source = `)${valid}`;
      break;
    case 5:
      source = `(module ${moduleName}\n  (defun ${functionName} (value value) value)\n  (export ${functionName}))`;
      break;
    case 6:
      source = `(module ${moduleName}\n  (defconst ${constant} {:only})\n  (export ${constant}))`;
      break;
    case 7:
      source = `(module ${moduleName}\n  (defconst ${constant} ${value})\n  (export absent-${suffix}))`;
      break;
    case 8:
      source = `(module ${moduleName}\n  (defun ${functionName} ()\n    (let ((item 1) (item 2)) item))\n  (export ${functionName}))`;
      break;
    default:
      source = `(module ${moduleName}\n  (defconst ${constant} #x)\n  (export ${constant}))`;
      break;
  }
  return {
    index,
    kind: "program",
    filename: `fuzz-program-${index}.eli`,
    source,
  };
}

export function* fuzzCases(total, seed) {
  const random = randomSource(seed);
  const readerInputs = Math.floor(total / 2);
  for (let index = 0; index < total; index += 1) {
    const testCase = index < readerInputs
      ? readerCase(random, index)
      : programCase(random, index);
    if (Array.from(testCase.source).length > maximumSourceCharacters) {
      fail(`generated source exceeds ${maximumSourceCharacters} characters`, testCase);
    }
    yield testCase;
  }
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
  ).join(",")}}`;
}

function semanticNode(node) {
  const result = { kind: node.kind };
  if (Object.hasOwn(node, "value")) result.value = node.value;
  if (Object.hasOwn(node, "name")) result.name = node.name;
  if (Object.hasOwn(node, "items")) {
    result.items = node.items.map(semanticNode);
  }
  return result;
}

function positionTable(source) {
  const result = [{ line: 1, column: 1 }];
  let line = 1;
  let column = 1;
  for (const character of source) {
    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    result.push({ line, column });
  }
  return result;
}

function validateNodeSpan(node, positions, filename, testCase, parent) {
  const span = node?.span;
  if (span === null || typeof span !== "object" ||
      !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) ||
      span.start < 0 || span.end < span.start || span.end >= positions.length ||
      span.filename !== filename) {
    fail(`invalid source span ${JSON.stringify(span)}`, testCase);
  }
  const start = positions[span.start];
  const end = positions[span.end];
  if (span.line !== start.line || span.column !== start.column ||
      span.endLine !== end.line || span.endColumn !== end.column) {
    fail(`source span position disagrees with offsets ${JSON.stringify(span)}`, testCase);
  }
  if (parent !== undefined &&
      (span.start < parent.start || span.end > parent.end)) {
    fail(`child source span escapes parent ${JSON.stringify(span)}`, testCase);
  }
  if (Object.hasOwn(node, "items")) {
    if (!Array.isArray(node.items)) fail("node items must be an array", testCase);
    for (const item of node.items) {
      validateNodeSpan(item, positions, filename, testCase, span);
    }
  }
}

function validateDiagnostic(error, positions, testCase) {
  const diagnostic = error?.eliscriptDiagnostic;
  if (diagnostic === null || typeof diagnostic !== "object" ||
      diagnostic.format !== "eliscript-diagnostic" || diagnostic.version !== 1 ||
      typeof diagnostic.code !== "string" || !/^ELI-[A-Z]\d{4}$/u.test(diagnostic.code) ||
      diagnostic.severity !== "error" || typeof diagnostic.phase !== "string" ||
      typeof diagnostic.message !== "string" || diagnostic.message.length === 0) {
    fail(`uncontrolled host exception: ${error?.stack ?? error}`, testCase);
  }
  const location = diagnostic.location;
  if (location === null || typeof location !== "object" ||
      location.file !== testCase.filename) {
    fail(`diagnostic has no exact source location ${canonical(diagnostic)}`, testCase);
  }
  for (const edge of ["start", "end"]) {
    const point = location[edge];
    if (point === null || typeof point !== "object" ||
        !Number.isSafeInteger(point.offset) || point.offset < 0 ||
        point.offset >= positions.length ||
        point.line !== positions[point.offset].line ||
        point.column !== positions[point.offset].column) {
      fail(`diagnostic has invalid ${edge} position ${canonical(diagnostic)}`, testCase);
    }
  }
  if (location.end.offset < location.start.offset) {
    fail(`diagnostic end precedes start ${canonical(diagnostic)}`, testCase);
  }
  return diagnostic;
}

function readGenerated(reader, testCase) {
  const positions = positionTable(testCase.source);
  try {
    const forms = reader.read_string(testCase.source, testCase.filename);
    if (!Array.isArray(forms)) fail("reader result must be an array", testCase);
    let previousEnd = 0;
    for (const form of forms) {
      validateNodeSpan(form, positions, testCase.filename, testCase);
      if (form.span.start < previousEnd) {
        fail("top-level source spans overlap or move backwards", testCase);
      }
      previousEnd = form.span.end;
    }
    return { comparable: { status: "ok", forms }, forms, positions };
  } catch (error) {
    if (error.eliscriptFuzzInvariant === true) throw error;
    validateDiagnostic(error, positions, testCase);
    return {
      comparable: { status: "error", message: error.message },
      diagnostic: error.eliscriptDiagnostic,
      positions,
    };
  }
}

function verifyRoundTrip(reader, formatter, testCase, forms) {
  const formatted = formatter.format_source(testCase.source, testCase.filename);
  if (formatter.format_source(formatted, testCase.filename) !== formatted) {
    fail("formatter round trip is not byte-idempotent", testCase);
  }
  const formattedForms = reader.read_string(formatted, testCase.filename);
  const before = canonical(forms.map(semanticNode));
  const after = canonical(formattedForms.map(semanticNode));
  if (before !== after) fail("formatter round trip changed reader values", testCase);
  return formatted;
}

function spawnTracked(command, arguments_, options) {
  const child = spawn(command, arguments_, options);
  activeChildren.add(child);
  child.once("close", () => activeChildren.delete(child));
  return child;
}

function boundedText(stream, maximumBytes = 1024 * 1024) {
  let text = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    if (text.length < maximumBytes) text += chunk.slice(0, maximumBytes - text.length);
  });
  return () => text;
}

async function runSuccessful(command, arguments_, options = {}) {
  const child = spawnTracked(command, arguments_, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  const stdout = boundedText(child.stdout);
  const stderr = boundedText(child.stderr);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, commandTimeoutMs);
  const result = await childResult(child).finally(() => clearTimeout(timer));
  if (timedOut) fail(`${command} exceeded ${commandTimeoutMs} ms`);
  if (result.error !== undefined || result.code !== 0) {
    fail(stderr().trim() || stdout().trim() || result.error?.message ||
      `${command} exited with ${result.code ?? result.signal}`);
  }
  return stdout();
}

async function writeCorpus(filename, total, seed) {
  const handle = await open(filename, "w", 0o600);
  const digest = createHash("sha256");
  let block = "";
  let bytes = 0;
  try {
    for (const testCase of fuzzCases(total, seed)) {
      const line = `${JSON.stringify({
        filename: testCase.filename,
        source: testCase.source,
      })}\n`;
      bytes += Buffer.byteLength(line, "utf8");
      if (bytes > maximumCorpusBytes) {
        fail(`corpus exceeds ${maximumCorpusBytes} bytes`, testCase);
      }
      digest.update(line);
      block += line;
      if (block.length >= 1024 * 1024) {
        await handle.writeFile(block, "utf8");
        block = "";
      }
    }
    if (block.length > 0) await handle.writeFile(block, "utf8");
  } finally {
    await handle.close();
  }
  return { bytes, digest: digest.digest("hex") };
}

function compileProgram(compiler, testCase, formatted, positions, digest, counts) {
  let output;
  try {
    output = compiler.compile_string(testCase.source, testCase.filename);
  } catch (error) {
    const diagnostic = validateDiagnostic(error, positions, testCase);
    counts.rejected += 1;
    counts.structuredDiagnostics += 1;
    digest.update(`error:${canonical(diagnostic)}\n`);
    return;
  }
  if (typeof output !== "string") fail("compiler output must be a string", testCase);
  const formattedOutput = compiler.compile_string(formatted, testCase.filename);
  if (formattedOutput !== output) {
    fail("formatted program changed generated JavaScript", testCase);
  }
  counts.accepted += 1;
  digest.update(`ok:${createHash("sha256").update(output).digest("hex")}\n`);
}

function childResult(child) {
  return new Promise((resolve_) => {
    let spawnError;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => resolve_({
      code,
      signal,
      error: spawnError,
    }));
  });
}

export async function runReaderProgramFuzz(options = {}) {
  const total = options.cases ?? defaultCases;
  const seed = options.seed ?? defaultSeed;
  if (!Number.isSafeInteger(total) || total <= 0 || total > maximumCases) {
    fail(`cases must be between 1 and ${maximumCases}`);
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    fail("seed must be an unsigned 32-bit integer");
  }

  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-fuzz-"));
  const compilerDirectory = resolve(directory, "compiler");
  const corpusPath = resolve(directory, "corpus.ndjson");
  let oracle;
  try {
    const corpus = await writeCorpus(corpusPath, total, seed);
    await runSuccessful(buildPath, [], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
      },
    });
    const nonce = `${process.pid}-${Date.now()}`;
    const reader = await import(
      `${pathToFileURL(resolve(compilerDirectory, "reader.mjs")).href}?${nonce}`
    );
    const formatter = await import(
      `${pathToFileURL(resolve(compilerDirectory, "formatter.mjs")).href}?${nonce}`
    );
    const compiler = await import(
      `${pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href}?${nonce}`
    );

    oracle = spawnTracked(process.env.EMACS ?? "emacs", [
      "--batch", "-Q", "--script", oraclePath,
    ], {
      cwd: root,
      env: { ...process.env, ELISCRIPT_FUZZ_CORPUS: corpusPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const oracleStderr = boundedText(oracle.stderr);
    const completed = childResult(oracle);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      oracle.kill("SIGTERM");
    }, oracleTimeoutMs);

    const cases = fuzzCases(total, seed)[Symbol.iterator]();
    const replayDigest = createHash("sha256");
    const readerDigest = createHash("sha256");
    const compilerDigest = createHash("sha256");
    const readerCounts = {
      accepted: 0,
      rejected: 0,
      deterministicResults: 0,
      structuredDiagnostics: 0,
      spanValidated: 0,
      roundTrips: 0,
      seedAgreements: 0,
    };
    const compilerCounts = { accepted: 0, rejected: 0, structuredDiagnostics: 0 };
    let received = 0;

    try {
      const lines = createInterface({ input: oracle.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        const next = cases.next();
        if (next.done) fail("seed oracle returned more results than inputs");
        const testCase = next.value;
        const corpusLine = `${JSON.stringify({
          filename: testCase.filename,
          source: testCase.source,
        })}\n`;
        replayDigest.update(corpusLine);
        const generated = readGenerated(reader, testCase);
        let seedResult;
        try {
          seedResult = JSON.parse(line);
        } catch {
          const stderr = oracleStderr().trim();
          fail(
            `seed oracle returned invalid JSON: ${line}${stderr === "" ? "" : `\n${stderr}`}`,
            testCase,
          );
        }
        const generatedCanonical = canonical(generated.comparable);
        const repeated = readGenerated(reader, testCase);
        if (canonical(repeated.comparable) !== generatedCanonical) {
          fail("self-hosted reader result is not deterministic", testCase);
        }
        readerCounts.deterministicResults += 1;

        if (seedResult?.status !== generated.comparable.status ||
            (seedResult.status === "ok" &&
             canonical(seedResult.forms) !== canonical(generated.comparable.forms))) {
          fail(
            `seed and self-hosted readers disagree\nseed ${canonical(seedResult)}\nself ${generatedCanonical}`,
            testCase,
          );
        }
        readerCounts.seedAgreements += 1;
        readerDigest.update(`${generatedCanonical}\n`);

        let formatted;
        if (generated.forms === undefined) {
          readerCounts.rejected += 1;
          readerCounts.structuredDiagnostics += 1;
        } else {
          readerCounts.accepted += 1;
          readerCounts.spanValidated += 1;
          formatted = verifyRoundTrip(reader, formatter, testCase, generated.forms);
          readerCounts.roundTrips += 1;
        }

        if (testCase.kind === "program") {
          if (formatted === undefined) {
            let compilerError;
            try {
              compiler.compile_string(testCase.source, testCase.filename);
            } catch (error) {
              compilerError = error;
            }
            if (compilerError === undefined) {
              fail("compiler accepted a source rejected by its reader", testCase);
            }
            const diagnostic = validateDiagnostic(
              compilerError,
              generated.positions,
              testCase,
            );
            compilerCounts.rejected += 1;
            compilerCounts.structuredDiagnostics += 1;
            compilerDigest.update(`error:${canonical(diagnostic)}\n`);
          } else {
            compileProgram(
              compiler,
              testCase,
              formatted,
              generated.positions,
              compilerDigest,
              compilerCounts,
            );
          }
        }
        received += 1;
      }
    } finally {
      clearTimeout(timer);
      if (oracle.exitCode === null && oracle.signalCode === null) {
        oracle.kill("SIGTERM");
      }
    }

    const oracleResult = await completed;
    if (timedOut) fail(`seed oracle exceeded ${oracleTimeoutMs} ms`);
    if (oracleResult.error !== undefined || oracleResult.code !== 0) {
      fail(oracleStderr().trim() ||
        oracleResult.error?.message ||
        `seed oracle exited with ${oracleResult.code ?? oracleResult.signal}`);
    }
    if (received !== total || !cases.next().done) {
      fail(`seed oracle returned ${received} results for ${total} inputs`);
    }
    const replayedDigest = replayDigest.digest("hex");
    if (replayedDigest !== corpus.digest) fail("deterministic corpus replay changed");

    const readerInputs = Math.floor(total / 2);
    return {
      schemaVersion: 1,
      format: "eliscript-reader-program-fuzz",
      version: 1,
      verified: true,
      seed: `0x${seed.toString(16).padStart(8, "0")}`,
      inputs: total,
      readerInputs,
      programInputs: total - readerInputs,
      maximumSourceCharacters,
      maximumCorpusBytes,
      corpusBytes: corpus.bytes,
      corpusDigest: corpus.digest,
      corpusReplayed: true,
      reader: { ...readerCounts, resultDigest: readerDigest.digest("hex") },
      compiler: { ...compilerCounts, resultDigest: compilerDigest.digest("hex") },
    };
  } finally {
    if (oracle && oracle.exitCode === null && oracle.signalCode === null) {
      oracle.kill("SIGTERM");
      await childResult(oracle);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function stopChildren(signal) {
  for (const child of activeChildren) child.kill("SIGTERM");
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}

if (import.meta.main) {
  process.once("SIGINT", () => stopChildren("SIGINT"));
  process.once("SIGTERM", () => stopChildren("SIGTERM"));
  try {
    const report = await runReaderProgramFuzz(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
