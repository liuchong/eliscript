import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBackends } from "./build.mjs";

// An explicit ABI prevents the partial backend from masquerading as a full
// dynamic-language compiler. This host has no C/LLVM emission or subprocess
// optimization path.
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: bun tools/backends/compile.mjs --abi numeric-f64 --target js|wasm -o OUTPUT INPUT");
  process.exit(0);
}
let abi, target, output, input;
try {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (["--abi", "--target", "-o", "--output"].includes(argument)) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--abi") abi = value;
      else if (argument === "--target") target = value;
      else output = value;
    } else if (argument.startsWith("-") || input) throw new Error(`unexpected argument: ${argument}`);
    else input = argument;
  }
  if (abi !== "numeric-f64" || !["js", "wasm"].includes(target) || !input || !output) {
    throw new Error("require --abi numeric-f64 --target js|wasm -o OUTPUT INPUT");
  }
  const { compiler, optimizer, numeric, wasm } = await buildBackends();
  const filename = resolve(input);
  const program = compiler.compile_ir_string(await readFile(filename, "utf8"), filename);
  // Validate the same ABI for both targets, before any optimization removes
  // unreachable code or unsupported constructs.
  numeric.lower_numeric_program(program);
  const optimized = optimizer.optimize_program(program);
  const bytes = target === "wasm"
    ? Uint8Array.from(wasm.emit_numeric_wasm(program))
    : compiler.emit_ir_string(optimized);
  await writeFile(resolve(output), bytes);
} catch (error) {
  const diagnostic = error?.eliscriptDiagnostic;
  const location = diagnostic?.location;
  console.error(location
    ? `${location.file}:${location.start.line}:${location.start.column}: ${diagnostic.code}: ${diagnostic.message}`
    : error?.message ?? String(error));
  process.exitCode = 1;
}
