#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
export const CONTRACT_FILE = "contracts/diagnostic-corpus.json";

const SUITES = [
  {
    id: "reader",
    fixture: "tests/fixtures/bootstrap-reader.json",
    oracle: "tests/bootstrap-reader-oracle.el",
    environment: "ELISCRIPT_READER_FIXTURE",
    validCaseCount: 23,
    negativeCaseCount: 17,
  },
  {
    id: "expander",
    fixture: "tests/fixtures/bootstrap-expander.json",
    oracle: "tests/bootstrap-expander-oracle.el",
    environment: "ELISCRIPT_EXPANDER_FIXTURE",
    validCaseCount: 40,
    negativeCaseCount: 30,
  },
  {
    id: "analyzer",
    fixture: "tests/fixtures/bootstrap-analyzer.json",
    oracle: "tests/bootstrap-analyzer-oracle.el",
    environment: "ELISCRIPT_ANALYZER_FIXTURE",
    validCaseCount: 30,
    negativeCaseCount: 57,
  },
];

export class DiagnosticCorpusError extends Error {
  constructor(errors) {
    super(`diagnostic corpus validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "DiagnosticCorpusError";
    this.errors = errors;
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function expectedSuiteHeader(suite) {
  return {
    id: suite.id,
    fixture: suite.fixture,
    oracle: suite.oracle,
    validCaseCount: suite.validCaseCount,
    negativeCaseCount: suite.negativeCaseCount,
  };
}

function validatePosition(position, label, errors) {
  if (!isPlainObject(position) ||
      !Number.isInteger(position.offset) || position.offset < 0 ||
      !Number.isInteger(position.line) || position.line < 1 ||
      !Number.isInteger(position.column) || position.column < 1) {
    errors.push(`${label} must contain non-negative offset and one-based line and column`);
  }
}

function validateCase(testCase, suite, label, errors) {
  if (!isPlainObject(testCase) || typeof testCase.name !== "string" ||
      testCase.name.length === 0 || typeof testCase.human !== "string" ||
      !isPlainObject(testCase.diagnostic)) {
    errors.push(`${label} must contain name human and diagnostic fields`);
    return;
  }
  const diagnostic = testCase.diagnostic;
  if (diagnostic.format !== "eliscript-diagnostic" || diagnostic.version !== 1 ||
      typeof diagnostic.code !== "string" || !/^ELI-[A-Z][0-9]{4}$/u.test(diagnostic.code) ||
      diagnostic.severity !== "error" || typeof diagnostic.phase !== "string" ||
      typeof diagnostic.message !== "string" || !isPlainObject(diagnostic.location) ||
      typeof diagnostic.location.file !== "string") {
    errors.push(`${label} must contain one complete version 1 error diagnostic`);
    return;
  }
  validatePosition(diagnostic.location.start, `${label} start`, errors);
  validatePosition(diagnostic.location.end, `${label} end`, errors);
  const rendered = `${diagnostic.location.file}:${diagnostic.location.start.line}:` +
    `${diagnostic.location.start.column}: ${diagnostic.message}`;
  if (testCase.human !== rendered) {
    errors.push(`${label} human text must render from its structured diagnostic`);
  }
  if (suite.id === "reader" && diagnostic.code !== "ELI-R0001") {
    errors.push(`${label} reader diagnostic must use ELI-R0001`);
  }
  if (suite.id === "expander" && diagnostic.code !== "ELI-X0001") {
    errors.push(`${label} expander diagnostic must use ELI-X0001`);
  }
  if (suite.id === "analyzer" &&
      !["ELI-A0001", "ELI-P0001"].includes(diagnostic.code)) {
    errors.push(`${label} analyzer diagnostic must use ELI-A0001 or ELI-P0001`);
  }
}

export async function validateDiagnosticCorpus(contract, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-diagnostic-corpus" || contract.version !== 1) {
    throw new DiagnosticCorpusError([
      "contract must use eliscript-diagnostic-corpus version 1",
    ]);
  }
  if (!Array.isArray(contract.suites) || contract.suites.length !== SUITES.length) {
    errors.push("suites must contain the exact reader expander and analyzer inventory");
  }

  const seenNames = new Set();
  for (const [index, suiteDefinition] of SUITES.entries()) {
    const suite = contract.suites?.[index];
    const label = `suite ${suiteDefinition.id}`;
    if (!isPlainObject(suite)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const actualHeader = {
      id: suite.id,
      fixture: suite.fixture,
      oracle: suite.oracle,
      validCaseCount: suite.validCaseCount,
      negativeCaseCount: suite.negativeCaseCount,
    };
    if (!equal(actualHeader, expectedSuiteHeader(suiteDefinition))) {
      errors.push(`${label} metadata must match the maintained suite inventory`);
    }
    let fixture = {};
    try {
      fixture = await readJson(path.join(root, suiteDefinition.fixture));
    } catch (error) {
      errors.push(`${label} fixture could not be read: ${error.message}`);
    }
    if (!Array.isArray(fixture.valid) ||
        fixture.valid.length !== suiteDefinition.validCaseCount) {
      errors.push(`${label} valid fixture count must be ${suiteDefinition.validCaseCount}`);
    }
    const fixtureInvalid = Array.isArray(fixture.invalid) ? fixture.invalid : [];
    const cases = Array.isArray(suite.cases) ? suite.cases : [];
    if (fixtureInvalid.length !== suiteDefinition.negativeCaseCount ||
        cases.length !== suiteDefinition.negativeCaseCount) {
      errors.push(`${label} must contain exactly ${suiteDefinition.negativeCaseCount} negative cases`);
    }
    if (!equal(
      cases.map((entry) => [entry?.name, entry?.human]),
      fixtureInvalid.map((entry) => [entry?.name, entry?.error]),
    )) {
      errors.push(`${label} cases must exactly match the ordered invalid fixture cases`);
    }
    for (const [caseIndex, testCase] of cases.entries()) {
      const caseLabel = `${label} case ${caseIndex}`;
      validateCase(testCase, suiteDefinition, caseLabel, errors);
      const qualifiedName = `${suiteDefinition.id}/${testCase?.name}`;
      if (seenNames.has(qualifiedName)) {
        errors.push(`${caseLabel} duplicates ${qualifiedName}`);
      }
      seenNames.add(qualifiedName);
    }
  }

  if (seenNames.size !== 104) {
    errors.push("corpus must contain exactly 104 uniquely named negative cases");
  }
  if (!/^[0-9a-f]{64}$/u.test(contract.identity ?? "") ||
      contract.identity !== digest(contract.suites)) {
    errors.push("identity must be the SHA-256 digest of the complete ordered suite payload");
  }
  if (errors.length > 0) throw new DiagnosticCorpusError(errors);
  return contract;
}

async function runOracle(root, suite) {
  const fixture = path.join(root, suite.fixture);
  const child = Bun.spawn([
    process.env.EMACS ?? "emacs",
    "--batch",
    "-Q",
    "-L",
    "compiler",
    "-L",
    "tests",
    "--script",
    suite.oracle,
  ], {
    cwd: root,
    env: { ...process.env, [suite.environment]: fixture },
    stdout: "pipe",
    stderr: "pipe",
  });
  let forceKillTimer;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, 30_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  clearTimeout(forceKillTimer);
  if (exitCode !== 0) {
    throw new Error(`${suite.id} oracle failed: ${stderr.trim() || stdout.trim()}`);
  }
  return JSON.parse(stdout);
}

export async function generateDiagnosticCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const suites = [];
  for (const suite of SUITES) {
    const [fixture, results] = await Promise.all([
      readJson(path.join(root, suite.fixture)),
      runOracle(root, suite),
    ]);
    const byName = new Map(results.map((result) => [result.name, result]));
    const cases = fixture.invalid.map((entry) => {
      const result = byName.get(entry.name);
      if (result?.status !== "error") {
        throw new Error(`${suite.id}/${entry.name} did not produce an oracle error`);
      }
      return {
        name: entry.name,
        human: result.message,
        diagnostic: result.diagnostic,
      };
    });
    suites.push({ ...expectedSuiteHeader(suite), cases });
  }
  const contract = {
    schemaVersion: 1,
    format: "eliscript-diagnostic-corpus",
    version: 1,
    identity: digest(suites),
    suites,
  };
  await validateDiagnosticCorpus(contract, { root });
  return contract;
}

export async function checkDiagnosticCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(path.join(root, CONTRACT_FILE));
  return validateDiagnosticCorpus(contract, { root });
}

export function diagnosticCorpusSuite(contract, id) {
  const suite = contract.suites.find((entry) => entry.id === id);
  if (!suite) throw new Error(`unknown diagnostic corpus suite: ${id}`);
  return suite;
}

async function main() {
  const generate = process.argv.slice(2).includes("--generate");
  if (generate) {
    const contract = await generateDiagnosticCorpus();
    await writeFile(
      path.join(DEFAULT_ROOT, CONTRACT_FILE),
      `${JSON.stringify(contract, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `Generated ${CONTRACT_FILE} (${contract.suites.reduce((sum, suite) => sum + suite.cases.length, 0)} cases)\n`,
    );
    return;
  }
  const contract = await checkDiagnosticCorpus();
  process.stdout.write(
    `Diagnostic corpus verified (${contract.suites.reduce((sum, suite) => sum + suite.cases.length, 0)} cases, ${contract.identity})\n`,
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
