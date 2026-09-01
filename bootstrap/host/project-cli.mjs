#!/usr/bin/env node

import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  diagnosticFromError,
  loadCompiler,
  renderDiagnostic,
  requestedDiagnosticFormat,
} from "./bun.mjs";
import { executeBuild } from "./build.mjs";

const usage = `Usage: eliscript-build [OPTIONS] [ENTRY ...]

Options:
  --out-dir DIR     Write the generated module tree to DIR
  --config FILE     Read a versioned project request from FILE
  --root DIR        Contain local source imports below DIR
  --portable NAME   Emit NAME and its transitive portable closure
  --stdin-file FILE Use standard input as the current contents of FILE
  --no-cache        Disable cache reads for this build
  --json            Print the versioned build decision report
  --diagnostic-format human|json
                     Select human-readable or JSON failures
  -h, --help         Show this help
`;

function configurationError(message, filename) {
  const error = new Error(message);
  error.eliscriptDiagnostic = {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-B0002",
    severity: "error",
    phase: "project-config",
    message,
    ...(filename ? { location: { file: filename } } : {}),
  };
  throw error;
}

function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && /[\t\n\r ]/u.test(source[index])) index += 1;
  return index;
}

function scanString(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === '"') {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function scanValue(source, start) {
  const index = skipWhitespace(source, start);
  if (source[index] === "{") return scanObject(source, index);
  if (source[index] === "[") return scanArray(source, index);
  if (source[index] === '"') return scanString(source, index);
  let end = index;
  while (end < source.length && !/[\s,\]}]/u.test(source[end])) end += 1;
  return end;
}

function scanObject(source, start) {
  const keys = new Set();
  let index = skipWhitespace(source, start + 1);
  if (source[index] === "}") return index + 1;
  while (index < source.length) {
    const keyEnd = scanString(source, index);
    const key = JSON.parse(source.slice(index, keyEnd));
    if (keys.has(key)) configurationError(`duplicate configuration key: ${key}`);
    keys.add(key);
    index = skipWhitespace(source, keyEnd);
    index = scanValue(source, skipWhitespace(source, index + 1));
    index = skipWhitespace(source, index);
    if (source[index] === "}") return index + 1;
    index = skipWhitespace(source, index + 1);
  }
  return index;
}

function scanArray(source, start) {
  let index = skipWhitespace(source, start + 1);
  if (source[index] === "]") return index + 1;
  while (index < source.length) {
    index = scanValue(source, index);
    index = skipWhitespace(source, index);
    if (source[index] === "]") return index + 1;
    index = skipWhitespace(source, index + 1);
  }
  return index;
}

export function parseConfigurationJson(source, filename) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    configurationError(`invalid JSON: ${error.message}`, filename);
  }
  try {
    scanValue(source, 0);
  } catch (error) {
    if (error?.eliscriptDiagnostic) {
      if (filename) error.eliscriptDiagnostic.location = { file: filename };
      throw error;
    }
    throw error;
  }
  return value;
}

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  if (argumentsList[0] === "--") argumentsList.shift();
  const portableEntries = [];
  const entries = [];
  let outDir;
  let root;
  let configuration;
  let stdinFile;
  let useCache = true;
  let jsonReport = false;
  let diagnosticFormat = "human";

  while (argumentsList.length > 0) {
    const argument = argumentsList.shift();
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--out-dir") {
      if (argumentsList.length === 0) throw new Error(`${argument} requires a directory`);
      outDir = argumentsList.shift();
    } else if (argument === "--config") {
      if (argumentsList.length === 0) throw new Error(`${argument} requires a file`);
      if (configuration !== undefined) {
        throw new Error("multiple --config files are not supported");
      }
      configuration = argumentsList.shift();
    } else if (argument === "--root") {
      if (argumentsList.length === 0) throw new Error(`${argument} requires a directory`);
      root = argumentsList.shift();
    } else if (argument === "--portable") {
      if (argumentsList.length === 0) throw new Error(`${argument} requires an entry name`);
      portableEntries.push(argumentsList.shift());
    } else if (argument === "--stdin-file") {
      if (argumentsList.length === 0) throw new Error(`${argument} requires a file`);
      if (stdinFile !== undefined) {
        throw new Error("multiple --stdin-file values are not supported");
      }
      stdinFile = argumentsList.shift();
    } else if (argument === "--no-cache") {
      useCache = false;
    } else if (argument === "--json") {
      jsonReport = true;
    } else if (argument === "--diagnostic-format") {
      if (argumentsList.length === 0) {
        throw new Error(`${argument} requires human or json`);
      }
      diagnosticFormat = argumentsList.shift();
      if (diagnosticFormat !== "human" && diagnosticFormat !== "json") {
        throw new Error(`unsupported diagnostic format: ${diagnosticFormat}`);
      }
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      entries.push(argument);
    }
  }

  if (configuration === undefined) {
    if (entries.length === 0) throw new Error("missing entry file");
    if (outDir === undefined) throw new Error("missing --out-dir");
  }
  return {
    entry: entries.length === 1 ? entries[0] : undefined,
    entries: entries.length > 1 ? entries : undefined,
    outDir,
    root,
    portableEntries,
    useCache,
    jsonReport,
    diagnosticFormat,
    configuration,
    stdinFile,
  };
}

export async function readProjectConfiguration(filename, compiler) {
  const expanded = resolve(filename);
  let canonical;
  try {
    if (!(await stat(expanded)).isFile()) throw new Error("not a file");
    canonical = await realpath(expanded);
  } catch {
    configurationError("configuration file does not exist", expanded);
  }
  const source = await readFile(canonical, "utf8");
  const parsed = parseConfigurationJson(source, canonical);
  const configuration = compiler.project_configuration(parsed, canonical);
  const directory = dirname(canonical);
  const root = resolve(directory, configuration.sourceRoot);
  return {
    ...(configuration.version === 2
      ? { entries: configuration.entries.map((entry) => resolve(root, entry)) }
      : { entry: resolve(root, configuration.entry) }),
    outDir: resolve(directory, configuration.outDir),
    root,
    portableEntries: [...configuration.portableEntries],
    useCache: configuration.cache,
    configuration: canonical,
  };
}

export async function execute(arguments_, options = {}) {
  const parsed = parseArguments(arguments_);
  if (parsed.help) return { help: true };
  let request;
  if (parsed.configuration !== undefined) {
    const compiler = await loadCompiler(options.moduleDirectory);
    request = await readProjectConfiguration(parsed.configuration, compiler);
    if (parsed.entries !== undefined) {
      request.entries = parsed.entries;
      delete request.entry;
    } else if (parsed.entry !== undefined) {
      request.entry = parsed.entry;
      delete request.entries;
    }
    if (parsed.outDir !== undefined) request.outDir = parsed.outDir;
    if (parsed.root !== undefined) request.root = parsed.root;
    if (parsed.portableEntries.length > 0) {
      request.portableEntries = parsed.portableEntries;
    }
    if (!parsed.useCache) request.useCache = false;
  } else {
    request = {
      entry: parsed.entry,
      entries: parsed.entries,
      outDir: parsed.outDir,
      root: parsed.root,
      portableEntries: parsed.portableEntries,
      useCache: parsed.useCache,
    };
  }
  let sourceOverrides;
  if (parsed.stdinFile !== undefined) {
    const sourceText = options.stdinSource ?? await readFile(0, "utf8");
    sourceOverrides = { [resolve(parsed.stdinFile)]: sourceText };
  }
  const result = await executeBuild({
    mode: "project",
    ...request,
    sourceOverrides,
    moduleDirectory: options.moduleDirectory,
  });
  return { result, jsonReport: parsed.jsonReport };
}

export async function main(arguments_ = process.argv.slice(2)) {
  const execution = await execute(arguments_);
  if (execution.help) {
    process.stdout.write(usage);
    return;
  }
  process.stdout.write(execution.jsonReport
    ? `${JSON.stringify(execution.result.report)}\n`
    : `${execution.result.entryOutputs.join("\n")}\n`);
}

const isMain = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outputFormat = requestedDiagnosticFormat(process.argv.slice(2));
  main().catch((error) => {
    const diagnostic = diagnosticFromError(error);
    if (outputFormat === "json") {
      console.error(JSON.stringify(diagnostic));
    } else {
      console.error(`eliscript-build: ${renderDiagnostic(diagnostic)}`);
    }
    process.exitCode = 1;
  });
}
