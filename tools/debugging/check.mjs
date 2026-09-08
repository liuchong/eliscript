#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
export const CONTRACT_FILE = "contracts/source-debugging-corpus.json";
const EXPECTED_CASES = [
  "compiler",
  "runtime",
  "browser-event",
  "async-rejection",
  "worker",
];

export class SourceDebuggingCorpusError extends Error {
  constructor(errors) {
    super(`source debugging corpus validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "SourceDebuggingCorpusError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function validPoint(value, offsetRequired = false) {
  return isPlainObject(value) && Number.isInteger(value.line) && value.line > 0 &&
    Number.isInteger(value.column) && value.column > 0 &&
    (!offsetRequired || (Number.isInteger(value.offset) && value.offset >= 0));
}

async function trackedFiles(root) {
  const child = Bun.spawn(["git", "ls-files", "-z"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "git ls-files failed");
  return new Set(stdout.split("\0").filter(Boolean));
}

export async function validateSourceDebuggingCorpus(contract, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-source-debugging-corpus" ||
      contract.version !== 1) {
    throw new SourceDebuggingCorpusError([
      "contract must use eliscript-source-debugging-corpus version 1",
    ]);
  }
  const cases = Array.isArray(contract.cases) ? contract.cases : [];
  if (!equal(cases.map((entry) => entry?.id), EXPECTED_CASES)) {
    errors.push("cases must be exactly compiler runtime browser-event async-rejection worker");
  }
  let tracked = new Set();
  try {
    tracked = await trackedFiles(root);
  } catch (error) {
    errors.push(error.message);
  }
  for (const [index, entry] of cases.entries()) {
    const label = entry?.id ?? `case ${index}`;
    if (!isPlainObject(entry) || !safePath(entry.source) ||
        !entry.source.endsWith(".eli") || !isPlainObject(entry.location) ||
        !isPlainObject(entry.evidence) || !safePath(entry.evidence.file) ||
        typeof entry.evidence.contains !== "string" ||
        entry.evidence.contains.length === 0) {
      errors.push(`${label} must declare source location and evidence`);
      continue;
    }
    if (entry.id === "compiler") {
      if (!validPoint(entry.location.start, true) ||
          !validPoint(entry.location.end, true)) {
        errors.push("compiler must declare a complete start and end source span");
      }
    } else if (!validPoint(entry.location)) {
      errors.push(`${label} must declare an exact source point`);
    }
    for (const file of [entry.source, entry.evidence.file]) {
      if (!tracked.has(file)) errors.push(`${label} file is not tracked: ${file}`);
    }
    try {
      const evidence = await readFile(path.join(root, entry.evidence.file), "utf8");
      if (!evidence.includes(entry.evidence.contains)) {
        errors.push(`${label} evidence locator is absent: ${entry.evidence.contains}`);
      }
    } catch (error) {
      errors.push(`${label} evidence could not be read: ${error.message}`);
    }
  }
  if (errors.length > 0) throw new SourceDebuggingCorpusError(errors);
  return contract;
}

export async function checkSourceDebuggingCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? JSON.parse(
    await readFile(path.join(root, CONTRACT_FILE), "utf8"),
  );
  return validateSourceDebuggingCorpus(contract, { root });
}

if (import.meta.main) {
  checkSourceDebuggingCorpus().then((contract) => {
    process.stdout.write(
      `Source debugging corpus verified (${contract.cases.length} workflows)\n`,
    );
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
