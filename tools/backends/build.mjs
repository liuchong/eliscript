import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const backendModules = ["optimize", "numeric", "wasm", "sha256", "native"];

// This adapter only loads files and runs the bootstrap seed when requested.
// Optimization, typed lowering, WASM and native encoding live in the .eli modules.
export async function buildBackends({ outputRoot = resolve(root, "dist"), seed = false, frontend } = {}) {
  const compilerDirectory = resolve(outputRoot, "bootstrap");
  const directory = resolve(outputRoot, "backends");
  if (!frontend) {
    const result = spawnSync(resolve(root, "bin/eliscript-bootstrap"), [], {
      cwd: root, encoding: "utf8", timeout: 120_000,
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory },
    });
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  }
  const compiler = frontend ?? await import(pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href);
  await mkdir(directory, { recursive: true });
  for (const name of backendModules) {
    const sourcePath = resolve(root, `bootstrap/backends/${name}.eli`);
    const outputPath = resolve(directory, `${name}.mjs`);
    if (seed) {
      const child = spawnSync(resolve(root, "bin/eliscript-seed"), ["--source-map", "--output", outputPath, sourcePath], {
        cwd: root, encoding: "utf8", timeout: 120_000,
      });
      if (child.status !== 0) throw new Error(child.stderr || String(child.error));
    } else {
      const source = await readFile(sourcePath, "utf8");
      const emission = compiler.compile_string_with_source_map(source, sourcePath, `${name}.mjs`, relative(directory, sourcePath));
      await writeFile(outputPath, `${emission.javascript}//# sourceMappingURL=${name}.mjs.map\n`);
      await writeFile(`${outputPath}.map`, emission.sourceMap);
    }
  }
  return {
    compiler, directory,
    optimizer: await import(pathToFileURL(resolve(directory, "optimize.mjs")).href),
    numeric: await import(pathToFileURL(resolve(directory, "numeric.mjs")).href),
    wasm: await import(pathToFileURL(resolve(directory, "wasm.mjs")).href),
    native: await import(pathToFileURL(resolve(directory, "native.mjs")).href),
    sha256: await import(pathToFileURL(resolve(directory, "sha256.mjs")).href),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildBackends();
  process.stdout.write(`${result.directory}\n`);
}
