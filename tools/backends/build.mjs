import { mkdir, readFile, readdir, writeFile, symlink, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const backendModules = Object.freeze((await readdir(resolve(root, "bootstrap/backends")))
  .filter(name => /^[a-z][a-z0-9-]*[.]eli$/.test(name)).sort().map(name => name.slice(0, -4)));

export async function loadLiteralSources({sourceRoot = root} = {}) {
  const records = [];
  const inputs = ['bit', 'persistent-list', 'persistent-vector', 'persistent-map', 'persistent-set', 'value',
    'managed-queue-state', 'managed-vector-view-state', 'managed-transient-state', 'managed-sorted-state',
    'managed-value-state'].map(name => ({
      id: 'stdlib/' + name + '.mjs', filename: 'stdlib/' + name + '.eli',
    }));
  inputs.push(
    {id: 'runtime/core/protocol-error.mjs', filename: 'stdlib/managed-protocol-error.eli'},
    {id: 'stdlib/core/protocol.mjs', filename: 'stdlib/core/protocol.eli'},
    {id: 'stdlib/core/text.mjs', filename: 'stdlib/core/text.eli'},
    {id: 'stdlib/core/object.mjs', filename: 'stdlib/core/object.eli'},
    {id: 'stdlib/core/set.mjs', filename: 'stdlib/core/set.eli'},
    {id: 'stdlib/core/data.mjs', filename: 'stdlib/core/data.eli'},
    {id: 'stdlib/managed-literal-protocols.mjs', filename: 'stdlib/managed-literal-protocols.eli'},
    {id: 'stdlib/managed-literals.mjs', filename: 'stdlib/managed-literals.eli'},
  );
  for (const name of ['list', 'vector', 'map', 'set', 'queue', 'identifier', 'record', 'value', 'metadata', 'collection', 'transient', 'protocol', 'type',
    'order', 'sorted', 'regex', 'transducer', 'lazy-sequence', 'truth', 'text', 'object', 'sequence',
    'set-algebra', 'collection-internals', 'metadata-internals', 'persistent-kind', 'data', 'data-text', 'value-internals']) {
    inputs.push({id: 'runtime/core/' + name + '.mjs', filename: 'stdlib/managed-runtime-' + name + '.eli'});
  }
  inputs.push({id: 'runtime/literals.mjs', filename: 'stdlib/managed-runtime-literals.eli'});
  inputs.push(
    {id: 'runtime/wire/markdown.mjs', filename: 'stdlib/managed-wire-markdown.eli'},
    {id: 'runtime/wire/schema.mjs', filename: 'stdlib/managed-wire-schema.eli'},
    {id: 'runtime/wire/http-rpc.mjs', filename: 'stdlib/managed-wire-http-rpc.eli'},
    {id: 'runtime/testing/value.mjs', filename: 'stdlib/managed-testing-value.eli'},
  );
  for (const {id, filename} of inputs) {
    const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})
      .decode(await readFile(resolve(sourceRoot, filename)));
    records.push({id, filename, source});
  }
  return records;
}

// This adapter only loads files and runs the bootstrap seed when requested.
// Optimization, typed lowering, WASM and native encoding live in the .eli modules.
export async function buildBackends({ outputRoot = resolve(root, "dist"), seed = false, frontend } = {}) {
  const compilerDirectory = resolve(outputRoot, "bootstrap");
  const directory = resolve(outputRoot, "backends");
  // Seed-produced modules may import the public persistent-literal runtime.
  // An out-of-tree bootstrap needs the same actual package as in-tree output.
  const packageDirectory = resolve(outputRoot, "node_modules");
  const packageLink = resolve(packageDirectory, "eliscript");
  await mkdir(packageDirectory, { recursive: true });
  try {await symlink(root, packageLink, "dir");}
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (await realpath(packageLink) !== await realpath(root)) {
      throw new Error("backend bootstrap resolves a different Eliscript runtime package");
    }
  }
  const modules = (await readdir(resolve(root, "bootstrap/compiler")))
    .filter(name => /^[a-z][a-z0-9-]*[.]eli$/.test(name)).sort()
    .map(name => name.slice(0, -4));
  if (!modules.includes("compiler")) throw new Error("bootstrap compiler module is missing");
  await mkdir(compilerDirectory, { recursive: true });
  if (!frontend) {
    const result = spawnSync(process.env.EMACS ?? "emacs", [
      "--batch", "-Q", "--script", resolve(root, "tools/bootstrap-seed.el"),
      "--", root, compilerDirectory, ...modules,
    ], {
      cwd: root, encoding: "utf8", timeout: 120_000,
      env: { ...process.env },
    });
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  } else {
    // Backends import sibling bootstrap modules (including IR validation).
    // Emit the complete dependency graph with the caller's compiler itself;
    // a supplied frontend must never silently select a seed for these files.
    for (const name of modules) {
      const sourcePath = resolve(root, `bootstrap/compiler/${name}.eli`);
      const source = await readFile(sourcePath, "utf8");
      const emission = frontend.compile_string_with_source_map(source, sourcePath,
        `${name}.mjs`, relative(compilerDirectory, sourcePath));
      await writeFile(resolve(compilerDirectory, `${name}.mjs`),
        `${emission.javascript}//# sourceMappingURL=${name}.mjs.map\n`);
      await writeFile(resolve(compilerDirectory, `${name}.mjs.map`), emission.sourceMap);
    }
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
      if (child.status !== 0) {
        const failure = new Error(`Seed backend ${name} (${sourcePath}): ${child.stderr || String(child.error)}`,
          {cause: child.error});
        failure.compilerModule = name;failure.sourcePath = sourcePath;
        failure.exitCode = child.status;failure.signal = child.signal;
        throw failure;
      }
    } else {
      const source = await readFile(sourcePath, "utf8");
      const emission = compiler.compile_string_with_source_map(source, sourcePath, `${name}.mjs`, relative(directory, sourcePath));
      await writeFile(outputPath, `${emission.javascript}//# sourceMappingURL=${name}.mjs.map\n`);
      await writeFile(`${outputPath}.map`, emission.sourceMap);
    }
  }
  return {
    compiler, directory,
    async loadLiteralModules() {
      const literalSources = await loadLiteralSources();
      return {literalSources, literalModules: literalSources.map(record => ({id: record.id,
        program: compiler.compile_ir_string(record.source, record.filename)}))};
    },
    optimizer: await import(pathToFileURL(resolve(directory, "optimize.mjs")).href),
    numeric: await import(pathToFileURL(resolve(directory, "numeric.mjs")).href),
    wasm: await import(pathToFileURL(resolve(directory, "wasm.mjs")).href),
    native: await import(pathToFileURL(resolve(directory, "native.mjs")).href),
    sha256: await import(pathToFileURL(resolve(directory, "sha256.mjs")).href),
    regexp: await import(pathToFileURL(resolve(directory, "regexp.mjs")).href),
    managed: await import(pathToFileURL(resolve(directory, "managed.mjs")).href),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildBackends();
  process.stdout.write(`${result.directory}\n`);
}
