import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBackends } from "./build.mjs";

// An explicit ABI prevents the partial backend from masquerading as a full
// dynamic-language compiler. This host has no C/LLVM emission or subprocess
// optimization path.
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: bun tools/backends/compile.mjs --abi numeric-f64 --target js|wasm|native -o OUTPUT INPUT\nManaged control: --abi managed-control-v1|managed-module-v1 --target wasm -o OUTPUT INPUT\nManaged project: --abi managed-module-v1 --target wasm --project -o OUTPUT REQUEST.json\nNative: --platform arm64-macos|arm64-linux --native-format object|library\nNative executable: --platform arm64-macos --native-format executable --entry FUNCTION");
  process.exit(0);
}
let abi, target, output, input, platform, nativeFormat, entry, project = false;
let buildDirectory;
try {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--project") { if (project) throw new Error("duplicate --project"); project = true; }
    else if (["--abi", "--target", "-o", "--output", "--platform", "--native-format", "--entry"].includes(argument)) {
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
  if (!["numeric-f64", "managed-control-v1", "managed-module-v1"].includes(abi) || !["js", "wasm", "native"].includes(target) || !input || !output) {
    throw new Error("require --abi numeric-f64 --target js|wasm|native -o OUTPUT INPUT");
  }
  if (abi !== "numeric-f64" && target !== "wasm") throw new Error(`${abi} currently requires --target wasm`);
  if (project && (abi !== "managed-module-v1" || target !== "wasm")) throw new Error("managed projects require --abi managed-module-v1 --target wasm");
  if (target === "native") {
    if (!["arm64-macos", "arm64-linux"].includes(platform) || !["object", "library", "executable"].includes(nativeFormat) ||
        (nativeFormat === "executable" ? !entry : entry !== undefined)) {
      throw new Error("native requires --platform arm64-macos|arm64-linux --native-format object|library|executable; --entry is required only for executable");
    }
    if (nativeFormat === 'executable' && platform !== 'arm64-macos') throw new Error('native executable requires --platform arm64-macos');
  } else if (platform !== undefined || nativeFormat !== undefined || entry !== undefined) {
    throw new Error("native options require --target native");
  }
  // Standalone invocations must not race with each other or with packaging
  // over the checkout's bootstrap cache. Only the requested output is shared.
  buildDirectory = await mkdtemp(resolve(tmpdir(), "eliscript-backend-cli-"));
  const { compiler, numeric, wasm, native, managed, loadLiteralModules } = await buildBackends({outputRoot: buildDirectory});
  const filename = resolve(input);
  const decodeSource = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  const source = decodeSource(await readFile(filename));
  const program = project ? null : compiler.compile_ir_string(source, filename);
  // Validate the same ABI for all three targets, before any optimization removes
  // unreachable code or unsupported constructs.
  let bytes;
  if (abi !== "numeric-f64") {
    const runtimePath=fileURLToPath(new URL("../../bootstrap/runtime/memory.eli",import.meta.url));
    const runtimeProgram=compiler.compile_ir_string(decodeSource(await readFile(runtimePath)),runtimePath);
    const {literalModules} = await loadLiteralModules();
    if (project) {
      const request = JSON.parse(source);
      if (!request || request.mode !== "project" || typeof request.entry !== "string" ||
          !request.files || typeof request.files !== "object" || Array.isArray(request.files)) {
        throw new Error("managed project input requires mode project, entry and files");
      }
      const modules = Object.keys(request.files).sort().map(id => {
        if (typeof request.files[id] !== "string") throw new Error("managed project sources must be strings");
        return {id, program: compiler.compile_ir_string(request.files[id], id)};
      });
      bytes=Uint8Array.from(managed.emit_managed_project_wasm(modules,request.entry,runtimeProgram,{abi,literalModules}));
    } else bytes=Uint8Array.from(managed.emit_managed_wasm(program,runtimeProgram,{abi,literalModules}));
  } else {
    numeric.lower_numeric_program(program);
    bytes = target === "wasm"
      ? Uint8Array.from(wasm.emit_numeric_wasm(program))
      : target === "native"
        ? Uint8Array.from(nativeFormat === "executable" ? native.emit_native_numeric_executable(program, platform, entry)
          : nativeFormat === "library" ? native.emit_native_numeric_library(program, platform) : native.emit_native_numeric_object(program, platform))
        : numeric.emit_numeric_javascript(program);
  }
  await writeFile(resolve(output), bytes);
  if (target === "native" && nativeFormat === "executable") await chmod(resolve(output), 0o755);
} catch (error) {
  const diagnostic = error?.eliscriptDiagnostic;
  const location = diagnostic?.location;
  console.error(location
    ? `${location.file}:${location.start.line}:${location.start.column}: ${diagnostic.code}: ${diagnostic.message}`
    : error?.message ?? String(error));
  process.exitCode = 1;
} finally {
  if (buildDirectory) await rm(buildDirectory, {recursive: true, force: true});
}
