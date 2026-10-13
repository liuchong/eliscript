import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBackends } from "./build.mjs";

// An explicit ABI prevents the partial backend from masquerading as a full
// dynamic-language compiler. This host has no C/LLVM emission or subprocess
// optimization path.
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: bun tools/backends/compile.mjs --abi numeric-f64 --target js|wasm|native -o OUTPUT INPUT\nNative: --platform arm64-macos --native-format object|library|executable [--entry FUNCTION]");
  process.exit(0);
}
let abi, target, output, input, platform, nativeFormat, entry;
try {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (["--abi", "--target", "-o", "--output", "--platform", "--native-format", "--entry"].includes(argument)) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--abi") abi = value;
      else if (argument === "--target") target = value;
      else if (argument === "--platform") platform = value;
      else if (argument === "--native-format") nativeFormat = value;
      else if (argument === "--entry") entry = value;
      else output = value;
    } else if (argument.startsWith("-") || input) throw new Error(`unexpected argument: ${argument}`);
    else input = argument;
  }
  if (abi !== "numeric-f64" || !["js", "wasm", "native"].includes(target) || !input || !output) {
    throw new Error("require --abi numeric-f64 --target js|wasm|native -o OUTPUT INPUT");
  }
  if (target === "native") {
    if (platform !== "arm64-macos" || !["object", "library", "executable"].includes(nativeFormat) ||
        (nativeFormat === "executable" ? !entry : entry !== undefined)) {
      throw new Error("native requires --platform arm64-macos --native-format object|library|executable; --entry is required only for executable");
    }
  } else if (platform !== undefined || nativeFormat !== undefined || entry !== undefined) {
    throw new Error("native options require --target native");
  }
  const { compiler, optimizer, numeric, wasm, native } = await buildBackends();
  const filename = resolve(input);
  const program = compiler.compile_ir_string(await readFile(filename, "utf8"), filename);
  // Validate the same ABI for all three targets, before any optimization removes
  // unreachable code or unsupported constructs.
  numeric.lower_numeric_program(program);
  const optimized = optimizer.optimize_program(program);
  const bytes = target === "wasm"
    ? Uint8Array.from(wasm.emit_numeric_wasm(program))
    : target === "native"
      ? Uint8Array.from(nativeFormat === "executable" ? native.emit_native_numeric_executable(program, platform, entry)
        : nativeFormat === "library" ? native.emit_native_numeric_library(program, platform) : native.emit_native_numeric_object(program, platform))
      : compiler.emit_ir_string(optimized);
  await writeFile(resolve(output), bytes);
  if (target === "native" && nativeFormat === "executable") await chmod(resolve(output), 0o755);
} catch (error) {
  const diagnostic = error?.eliscriptDiagnostic;
  const location = diagnostic?.location;
  console.error(location
    ? `${location.file}:${location.start.line}:${location.start.column}: ${diagnostic.code}: ${diagnostic.message}`
    : error?.message ?? String(error));
  process.exitCode = 1;
}
