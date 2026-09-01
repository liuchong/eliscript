#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  diagnosticFromError,
  loadCompiler,
  requestedDiagnosticFormat,
} from "./bun.mjs";

const usage = `Usage: eliscript-format [OPTIONS] INPUT

Options:
  --write              Atomically replace INPUT when formatting changes
  --check              Fail without writing when INPUT is not canonical
  --diagnostic-format human|json
                       Select human-readable or JSON failures
  -h, --help           Show this help
`;

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  if (argumentsList[0] === "--") argumentsList.shift();
  let input;
  let write = false;
  let check = false;
  let diagnosticFormat = "human";

  while (argumentsList.length > 0) {
    const argument = argumentsList.shift();
    if (argument === "-h" || argument === "--help") {
      return { help: true };
    }
    if (argument === "--write") {
      write = true;
    } else if (argument === "--check") {
      check = true;
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
    } else if (input !== undefined) {
      throw new Error("multiple input files are not supported");
    } else {
      input = argument;
    }
  }

  if (input === undefined) throw new Error("missing input file");
  if (write && check) throw new Error("--write and --check are mutually exclusive");
  return { input, write, check, diagnosticFormat };
}

function unformattedError(filename) {
  const error = new Error(`${filename} is not formatted`);
  error.eliscriptDiagnostic = {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-F0002",
    severity: "error",
    phase: "formatter",
    message: "file is not formatted",
    location: { file: filename },
  };
  return error;
}

async function atomicWrite(filename, source, mode) {
  const temporary = resolve(
    dirname(filename),
    `.${basename(filename)}.eliscript-format-${process.pid}-${randomUUID()}`,
  );
  try {
    await writeFile(temporary, source, { encoding: "utf8", mode });
    await rename(temporary, filename);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function formatFile(options) {
  if (!options || typeof options !== "object") {
    throw new Error("formatter options must be an object");
  }
  const filename = resolve(options.input);
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
  const [source, attributes] = await Promise.all([
    readFile(filename, "utf8"),
    stat(filename),
  ]);
  const formatted = compiler.format_source(source, filename);
  const changed = formatted !== source;

  if (options.check && changed) throw unformattedError(filename);
  if (options.write && changed) {
    await atomicWrite(filename, formatted, attributes.mode);
  }
  return Object.freeze({ filename, formatted, changed });
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const result = await formatFile(options);
  if (!options.write && !options.check) process.stdout.write(result.formatted);
}

const isMain = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outputFormat = requestedDiagnosticFormat(process.argv.slice(2));
  main().catch((error) => {
    if (outputFormat === "json") {
      console.error(JSON.stringify(diagnosticFromError(error)));
    } else {
      console.error(`eliscript-format: ${error.message}`);
    }
    process.exitCode = 1;
  });
}
