#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const commandName = process.env.ELISCRIPT_COMMAND_NAME ?? "eliscript-portable";
const usage = `Usage: ${commandName} [OPTIONS] INPUT

Options:
  -o, --output FILE  Write the generated ECMAScript module to FILE
  --source-map       Write FILE.map and add a sourceMappingURL comment
  --portable NAME    Emit a worker entry and its transitive dependencies
  --diagnostic-format human|json
                     Select human-readable or JSON failures
  -h, --help         Show this help
`;

const diagnosticFormat = "eliscript-diagnostic";
const diagnosticVersion = 1;

export function requestedDiagnosticFormat(arguments_) {
  for (let index = 0; index < arguments_.length - 1; index += 1) {
    if (arguments_[index] === "--diagnostic-format" &&
        arguments_[index + 1] === "json") {
      return "json";
    }
  }
  return "human";
}

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  if (argumentsList[0] === "--") argumentsList.shift();
  let input;
  let output;
  let sourceMap = false;
  let diagnosticOutput = "human";
  const portableEntries = [];

  while (argumentsList.length > 0) {
    const argument = argumentsList.shift();
    if (argument === "-h" || argument === "--help") {
      return { help: true };
    }
    if (argument === "-o" || argument === "--output") {
      if (argumentsList.length === 0) {
        throw new Error(`${argument} requires a file`);
      }
      output = argumentsList.shift();
    } else if (argument === "--source-map") {
      sourceMap = true;
    } else if (argument === "--portable") {
      if (argumentsList.length === 0) {
        throw new Error(`${argument} requires a function name`);
      }
      portableEntries.push(argumentsList.shift());
    } else if (argument === "--diagnostic-format") {
      if (argumentsList.length === 0) {
        throw new Error(`${argument} requires human or json`);
      }
      diagnosticOutput = argumentsList.shift();
      if (diagnosticOutput !== "human" && diagnosticOutput !== "json") {
        throw new Error(`unsupported diagnostic format: ${diagnosticOutput}`);
      }
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (input) {
      throw new Error("multiple input files are not supported yet");
    } else {
      input = argument;
    }
  }

  if (!input) throw new Error("missing input file");
  if (sourceMap && !output) {
    throw new Error("--source-map requires --output");
  }
  return {
    input,
    output,
    sourceMap,
    portableEntries,
    diagnosticFormat: diagnosticOutput,
  };
}

export function diagnosticFromError(error) {
  if (error?.eliscriptDiagnostic?.format === diagnosticFormat &&
      error.eliscriptDiagnostic.version === diagnosticVersion) {
    return error.eliscriptDiagnostic;
  }
  return {
    format: diagnosticFormat,
    version: diagnosticVersion,
    code: "ELI-C0001",
    severity: "error",
    phase: "cli",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function renderDiagnostic(diagnostic) {
  const location = diagnostic?.location;
  const start = location?.start;
  if (typeof location?.file === "string" &&
      Number.isSafeInteger(start?.line) &&
      Number.isSafeInteger(start?.column)) {
    return `${location.file}:${start.line}:${start.column}: ${diagnostic.message}`;
  }
  return diagnostic.message;
}

export async function loadCompiler(moduleDirectory) {
  const hostDirectory = dirname(fileURLToPath(import.meta.url));
  const directory = resolve(
    moduleDirectory ??
      process.env.ELISCRIPT_BOOTSTRAP_MODULE_DIR ??
      resolve(hostDirectory, "../../dist/bootstrap"),
  );
  return import(pathToFileURL(resolve(directory, "compiler.mjs")).href);
}

export async function compileFile(options) {
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
  const request = compiler.build_operation_request({
    mode: "single",
    input: options.input,
    output: options.output ?? null,
    sourceMap: options.sourceMap === undefined ? false : options.sourceMap,
    portableEntries: options.portableEntries ?? [],
  });
  const inputPath = resolve(request.input);
  const outputPath = request.output ? resolve(request.output) : undefined;
  const source = await readFile(inputPath, "utf8");

  if (!request.sourceMap) {
    const javascript = request.portableEntries.length > 0
      ? compiler.compile_portable_string(
        source,
        request.portableEntries,
        inputPath,
      )
      : compiler.compile_string(source, inputPath);
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, javascript);
    }
    return { javascript };
  }

  if (!outputPath) throw new Error("--source-map requires --output");
  const mapPath = `${outputPath}.map`;
  const mapDirectory = dirname(mapPath);
  const generatedName = relative(mapDirectory, outputPath);
  const sourceName = relative(mapDirectory, inputPath);
  const emission = request.portableEntries.length > 0
    ? compiler.compile_portable_string_with_source_map(
      source,
      request.portableEntries,
      inputPath,
      generatedName,
      sourceName,
    )
    : compiler.compile_string_with_source_map(
      source,
      inputPath,
      generatedName,
      sourceName,
    );
  const mapUrl = relative(dirname(outputPath), mapPath);
  const javascript = `${emission.javascript}//# sourceMappingURL=${mapUrl}\n`;

  await mkdir(mapDirectory, { recursive: true });
  await writeFile(mapPath, emission.sourceMap);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, javascript);
  return { javascript, sourceMap: emission.sourceMap };
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const { executeBuild } = await import("./build.mjs");
  const result = await executeBuild({ mode: "single", ...options });
  if (!options.output) process.stdout.write(result.javascript);
}

const isMain = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outputFormat = requestedDiagnosticFormat(process.argv.slice(2));
  main().catch((error) => {
    if (outputFormat === "json") {
      console.error(JSON.stringify(diagnosticFromError(error)));
    } else {
      console.error(`eliscript: ${error.message}`);
    }
    process.exitCode = 1;
  });
}
