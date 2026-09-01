#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  EvaluationSession,
  evaluationResultFormat,
  evaluationResultVersion,
  readEvaluationFile,
} from "./evaluation.mjs";

process.setSourceMapsEnabled?.(true);

const usage = `Usage: eliscript-eval [OPTIONS]

Options:
  --stdio           Read and write one JSON record per line
  --eval SOURCE     Evaluate one form
  --file FILE       Load one complete Eliscript source file
  --root DIRECTORY  Set the project root for --eval or --file
  --json            Print the one-shot result as JSON
  --help            Show this help
`;

function cliError(message) {
  const error = new Error(message);
  error.code = "ELI-C0001";
  return error;
}

function parseArguments(argv) {
  const options = { json: false, mode: null, root: null, source: null, file: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--stdio":
        if (options.mode !== null) throw cliError("choose exactly one evaluation mode");
        options.mode = "stdio";
        break;
      case "--eval":
        if (options.mode !== null) throw cliError("choose exactly one evaluation mode");
        options.mode = "evaluate";
        options.source = argv[++index];
        if (options.source === undefined) throw cliError("--eval requires SOURCE");
        break;
      case "--file":
        if (options.mode !== null) throw cliError("choose exactly one evaluation mode");
        options.mode = "load";
        options.file = argv[++index];
        if (options.file === undefined) throw cliError("--file requires FILE");
        break;
      case "--root":
        options.root = argv[++index];
        if (options.root === undefined) throw cliError("--root requires DIRECTORY");
        break;
      case "--json": options.json = true; break;
      case "--help": options.mode = "help"; break;
      default: throw cliError(`unknown option: ${argument}`);
    }
  }
  if (options.mode === null) throw cliError("an evaluation mode is required");
  if (options.mode === "stdio" && (options.json || options.root !== null)) {
    throw cliError("--stdio accepts complete request records and no presentation options");
  }
  return options;
}

function protocolFailure(message, revision) {
  return {
    format: evaluationResultFormat,
    version: evaluationResultVersion,
    id: null,
    operation: "unknown",
    revision,
    status: "error",
    diagnostic: {
      format: "eliscript-diagnostic",
      version: 1,
      code: "ELI-E0001",
      severity: "error",
      phase: "evaluation-request",
      message,
    },
  };
}

async function runStdio() {
  const session = await EvaluationSession.create();
  const close = () => session.close();
  process.once("exit", close);
  process.once("SIGINT", () => {
    close();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    close();
    process.exit(143);
  });
  try {
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      if (line.trim() === "") continue;
      let result;
      try {
        result = await session.execute(JSON.parse(line));
      } catch (error) {
        result = protocolFailure(
          error instanceof Error ? error.message : String(error),
          session.revision,
        );
      }
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    process.removeListener("exit", close);
    close();
  }
}

function renderHuman(result) {
  if (result.status === "error") {
    const location = result.diagnostic.location;
    const prefix = location
      ? `${location.file}:${location.line ?? 1}:${location.column ?? 1}: `
      : "";
    throw cliError(`${prefix}${result.diagnostic.message}`);
  }
  if (result.kind === "expression" || result.kind === "definition") {
    return result.hasValue ? result.value : result.binding;
  }
  return `loaded ${result.bindings.length} bindings`;
}

async function runOneShot(options) {
  const session = await EvaluationSession.create();
  try {
    let request;
    if (options.mode === "load") {
      const file = readEvaluationFile(options.file);
      request = {
        id: 0,
        operation: "load",
        source: file.source,
        filename: file.filename,
        root: options.root,
      };
    } else {
      request = {
        id: 0,
        operation: "evaluate",
        source: options.source,
        filename: "<command-line>.eli",
        root: options.root,
      };
    }
    const result = await session.execute(request);
    process.stdout.write(`${options.json ? JSON.stringify(result) : renderHuman(result)}\n`);
  } finally {
    session.close();
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "help") process.stdout.write(usage);
  else if (options.mode === "stdio") await runStdio();
  else await runOneShot(options);
} catch (error) {
  process.stderr.write(`eliscript-eval: ${error.message}\n`);
  process.exitCode = 1;
}
