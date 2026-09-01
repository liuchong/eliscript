#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  EvaluationSession,
  evaluationResultFormat,
  evaluationResultVersion,
  readEvaluationFile,
} from "./evaluation.mjs";

const usage = `Usage: eliscript-eval [OPTIONS]

Options:
  --repl            Run the persistent terminal REPL (default mode)
  --stdio           Read and write one JSON record per line
  --eval SOURCE     Evaluate one form
  --file FILE       Load one complete Eliscript source file
  --root DIRECTORY  Set the project root for REPL, --eval, or --file
  --json            Print the one-shot result as JSON
  --prompt          Always print the REPL banner and prompts
  --no-prompt       Never print the REPL banner or prompts
  --help            Show this help
`;

const replHelp = `Commands:
  :help             Show this command summary
  :load FILE        Load one complete source file
  :reload           Reload the last successfully loaded file
  :reset            Discard the current namespace
  :quit             Close the session
`;

const replFilename = "<repl>.eli";

function cliError(message) {
  const error = new Error(message);
  error.code = "ELI-C0001";
  return error;
}

function parseArguments(argv) {
  const options = {
    json: false,
    mode: null,
    root: null,
    source: null,
    file: null,
    prompt: "auto",
  };
  const chooseMode = (mode) => {
    if (options.mode !== null) throw cliError("choose exactly one evaluation mode");
    options.mode = mode;
  };
  const choosePrompt = (prompt) => {
    if (options.prompt !== "auto") throw cliError("choose at most one prompt mode");
    options.prompt = prompt;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--repl":
        chooseMode("repl");
        break;
      case "--stdio":
        chooseMode("stdio");
        break;
      case "--eval":
        chooseMode("evaluate");
        options.source = argv[++index];
        if (options.source === undefined) throw cliError("--eval requires SOURCE");
        break;
      case "--file":
        chooseMode("load");
        options.file = argv[++index];
        if (options.file === undefined) throw cliError("--file requires FILE");
        break;
      case "--root":
        options.root = argv[++index];
        if (options.root === undefined) throw cliError("--root requires DIRECTORY");
        break;
      case "--json": options.json = true; break;
      case "--prompt": choosePrompt("always"); break;
      case "--no-prompt": choosePrompt("never"); break;
      case "--help": chooseMode("help"); break;
      default: throw cliError(`unknown option: ${argument}`);
    }
  }
  if (options.mode === null) options.mode = "repl";
  if (options.mode === "stdio" &&
      (options.json || options.root !== null || options.prompt !== "auto")) {
    throw cliError("--stdio accepts complete request records and no presentation options");
  }
  if (options.mode === "repl" && options.json) {
    throw cliError("--json is available only for one-shot evaluation");
  }
  if (options.mode !== "repl" && options.prompt !== "auto") {
    throw cliError("prompt options are available only in REPL mode");
  }
  if (options.mode === "help" &&
      (options.json || options.root !== null || options.prompt !== "auto")) {
    throw cliError("--help does not accept evaluation or presentation options");
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

function diagnosticText(diagnostic) {
  const location = diagnostic?.location;
  const start = location?.start;
  const prefix = location?.file
    ? `${location.file}:${start?.line ?? location.line ?? 1}:` +
      `${start?.column ?? location.column ?? 1}: `
    : "";
  return `${prefix}${diagnostic?.message ?? "evaluation failed"}`;
}

function renderHuman(result) {
  if (result.status === "error") throw cliError(diagnosticText(result.diagnostic));
  if (result.kind === "expression" || result.kind === "definition") {
    return result.hasValue ? result.value : result.binding;
  }
  if (result.kind === "module") return `loaded ${result.bindings.length} bindings`;
  if (result.kind === "reset") return "session reset";
  if (result.kind === "capabilities") return "session ready";
  throw cliError(`unsupported evaluation result kind: ${result.kind}`);
}

function writeHumanResult(result, recoverable = false) {
  if (result.stdout) process.stdout.write(result.stdout);
  try {
    process.stdout.write(`${renderHuman(result)}\n`);
    return true;
  } catch (error) {
    if (!recoverable) throw error;
    process.stdout.write(`eliscript-eval: ${error.message}\n`);
    return false;
  }
}

function writeRecoverableError(error) {
  const message = error?.eliscriptDiagnostic
    ? diagnosticText(error.eliscriptDiagnostic)
    : error instanceof Error ? error.message : String(error);
  process.stdout.write(`eliscript-eval: ${message}\n`);
}

function replCommand(line) {
  const match = line.trim().match(/^:([^\s]+)(?:\s+(.*))?$/u);
  return match ? { name: match[1], argument: match[2]?.trim() ?? "" } : null;
}

function showPrompt(_input, visible, continuation) {
  if (!visible) return;
  process.stdout.write(continuation ? "      ... " : "eliscript=> ");
}

async function runTerminalCommand(command, context) {
  const { session, options } = context;
  switch (command.name) {
    case "help":
      if (command.argument !== "") throw cliError(":help does not accept arguments");
      process.stdout.write(replHelp);
      return false;
    case "load": {
      if (command.argument === "") throw cliError(":load requires FILE");
      const file = readEvaluationFile(command.argument);
      const result = await session.execute({
        id: ++context.nextId,
        operation: "load",
        source: file.source,
        filename: file.filename,
        root: options.root,
      });
      if (writeHumanResult(result, true)) context.lastFile = file.filename;
      return false;
    }
    case "reload": {
      if (command.argument !== "") throw cliError(":reload does not accept arguments");
      if (context.lastFile === null) throw cliError(":reload requires a prior successful :load");
      const file = readEvaluationFile(context.lastFile);
      const result = await session.execute({
        id: ++context.nextId,
        operation: "load",
        source: file.source,
        filename: file.filename,
        root: options.root,
      });
      if (writeHumanResult(result, true)) context.lastFile = file.filename;
      return false;
    }
    case "reset": {
      if (command.argument !== "") throw cliError(":reset does not accept arguments");
      writeHumanResult(await session.execute({
        id: ++context.nextId,
        operation: "reset",
      }), true);
      context.lastFile = null;
      return false;
    }
    case "quit":
      if (command.argument !== "") throw cliError(":quit does not accept arguments");
      return true;
    default:
      throw cliError(`unknown REPL command: :${command.name}`);
  }
}

async function runRepl(options) {
  const session = await EvaluationSession.create();
  const promptVisible = options.prompt === "always" ||
    (options.prompt === "auto" && process.stdin.isTTY && process.stdout.isTTY);
  const input = createInterface({
    input: process.stdin,
    ...(promptVisible ? { output: process.stdout } : {}),
    terminal: promptVisible && Boolean(process.stdin.isTTY),
    crlfDelay: Infinity,
  });
  const context = { session, options, nextId: 0, lastFile: null };
  let source = "";
  let interrupted = false;
  const close = () => session.close();
  const terminate = () => {
    close();
    process.exit(143);
  };
  process.once("exit", close);
  process.once("SIGTERM", terminate);
  input.on("SIGINT", () => {
    if (source !== "") {
      source = "";
      process.stdout.write("^C\n");
      showPrompt(input, promptVisible, false);
    } else {
      interrupted = true;
      input.close();
    }
  });
  try {
    if (promptVisible) {
      process.stdout.write("Eliscript REPL. Type :help for commands.\n");
      showPrompt(input, true, false);
    }
    for await (const line of input) {
      if (source === "") {
        const command = replCommand(line);
        if (command) {
          try {
            if (await runTerminalCommand(command, context)) break;
          } catch (error) {
            writeRecoverableError(error);
          }
          showPrompt(input, promptVisible, false);
          continue;
        }
      }
      source = source === "" ? line : `${source}\n${line}`;
      let description;
      try {
        description = session.compiler.evaluation_input_description(
          source,
          replFilename,
        );
      } catch (error) {
        writeRecoverableError(error);
        source = "";
        showPrompt(input, promptVisible, false);
        continue;
      }
      if (description.status === "incomplete") {
        showPrompt(input, promptVisible, true);
        continue;
      }
      if (description.status === "complete") {
        writeHumanResult(await session.execute({
          id: ++context.nextId,
          operation: "evaluate",
          source,
          filename: replFilename,
          root: options.root,
        }), true);
      }
      source = "";
      showPrompt(input, promptVisible, false);
    }
    if (!interrupted && source !== "") {
      writeHumanResult(await session.execute({
        id: ++context.nextId,
        operation: "evaluate",
        source,
        filename: replFilename,
        root: options.root,
      }), true);
    }
  } finally {
    process.removeListener("exit", close);
    process.removeListener("SIGTERM", terminate);
    input.close();
    close();
  }
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
    if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else writeHumanResult(result);
  } finally {
    session.close();
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "help") process.stdout.write(usage);
  else if (options.mode === "stdio") await runStdio();
  else if (options.mode === "repl") await runRepl(options);
  else await runOneShot(options);
} catch (error) {
  process.stderr.write(`eliscript-eval: ${error.message}\n`);
  process.exitCode = 1;
}
