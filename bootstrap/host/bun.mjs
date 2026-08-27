#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const usage = `Usage: eliscript-portable [OPTIONS] INPUT

Options:
  -o, --output FILE  Write the generated ECMAScript module to FILE
  --source-map       Write FILE.map and add a sourceMappingURL comment
  --portable NAME    Emit a worker entry and its transitive dependencies
  -h, --help         Show this help
`;

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  if (argumentsList[0] === "--") argumentsList.shift();
  let input;
  let output;
  let sourceMap = false;
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
  if (sourceMap && portableEntries.length > 0) {
    throw new Error("--source-map is not supported with --portable yet");
  }
  return { input, output, sourceMap, portableEntries };
}

export async function loadCompiler(moduleDirectory) {
  const directory = resolve(
    moduleDirectory ??
      process.env.ELISCRIPT_BOOTSTRAP_MODULE_DIR ??
      resolve(import.meta.dir, "../../dist/bootstrap"),
  );
  return import(pathToFileURL(resolve(directory, "compiler.mjs")).href);
}

export async function compileFile(options) {
  const inputPath = resolve(options.input);
  const outputPath = options.output ? resolve(options.output) : undefined;
  const source = await readFile(inputPath, "utf8");
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);

  if (!options.sourceMap) {
    const javascript = options.portableEntries?.length > 0
      ? compiler.compile_portable_string(
        source,
        options.portableEntries,
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
  const emission = compiler.compile_string_with_source_map(
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
  const result = await compileFile(options);
  if (!options.output) process.stdout.write(result.javascript);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`eliscript: ${error.message}`);
    process.exitCode = 1;
  });
}
