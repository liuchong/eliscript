#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  diagnosticFromError,
  loadCompiler,
  requestedDiagnosticFormat,
} from "./bun.mjs";
import { checkProject } from "./project.mjs";
import { readProjectConfiguration } from "./project-cli.mjs";

const usage = `Usage: eliscript-check [OPTIONS] [ENTRY ...]

Options:
  --config FILE     Read entries and root from a versioned project request
  --root DIR        Contain local source imports below DIR
  --portable NAME   Check NAME and its transitive portable closure
  --stdin-file FILE Use standard input as the current contents of FILE
  --json            Print the versioned project check report
  --diagnostic-format human|json
                     Select human-readable or JSON failures
  -h, --help         Show this help
`;

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  if (argumentsList[0] === "--") argumentsList.shift();
  const entries = [];
  const portableEntries = [];
  let configuration;
  let root;
  let stdinFile;
  let jsonReport = false;
  let diagnosticFormat = "human";

  while (argumentsList.length > 0) {
    const argument = argumentsList.shift();
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--config") {
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

  if (configuration === undefined && entries.length === 0) {
    throw new Error("missing entry file");
  }
  return {
    entry: entries.length === 1 ? entries[0] : undefined,
    entries: entries.length > 1 ? entries : undefined,
    root,
    portableEntries,
    configuration,
    stdinFile,
    jsonReport,
    diagnosticFormat,
  };
}

export async function execute(arguments_, options = {}) {
  const parsed = parseArguments(arguments_);
  if (parsed.help) return { help: true };
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
  let request;
  if (parsed.configuration !== undefined) {
    const configured = await readProjectConfiguration(parsed.configuration, compiler);
    request = {
      entry: configured.entry,
      entries: configured.entries,
      root: configured.root,
      portableEntries: configured.portableEntries,
    };
    if (parsed.entries !== undefined) {
      request.entries = parsed.entries;
      delete request.entry;
    } else if (parsed.entry !== undefined) {
      request.entry = parsed.entry;
      delete request.entries;
    }
    if (parsed.root !== undefined) request.root = parsed.root;
    if (parsed.portableEntries.length > 0) {
      request.portableEntries = parsed.portableEntries;
    }
  } else {
    request = {
      entry: parsed.entry,
      entries: parsed.entries,
      root: parsed.root,
      portableEntries: parsed.portableEntries,
    };
  }
  let sourceOverrides;
  if (parsed.stdinFile !== undefined) {
    const sourceText = options.stdinSource ?? await readFile(0, "utf8");
    sourceOverrides = { [resolve(parsed.stdinFile)]: sourceText };
  }
  const result = await checkProject({
    ...request,
    sourceOverrides,
    compiler,
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
    : `Checked ${execution.result.report.counts.modules} modules.\n`);
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
      console.error(`eliscript-check: ${diagnostic.message}`);
    }
    process.exitCode = 1;
  });
}
