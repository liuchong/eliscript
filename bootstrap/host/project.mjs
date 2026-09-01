import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { loadCompiler } from "./bun.mjs";

const manifestFilename = "eliscript-project.json";

function projectError(message, filename) {
  const error = new Error(message);
  error.eliscriptDiagnostic = {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-B0001",
    severity: "error",
    phase: "project-build",
    message,
    ...(filename ? { location: { file: filename } } : {}),
  };
  throw error;
}

function canonicalDirectory(path, label) {
  const expanded = resolve(path);
  let attributes;
  try {
    attributes = statSync(expanded);
  } catch {
    projectError(`${label} is not a directory`, expanded);
  }
  if (!attributes.isDirectory()) {
    projectError(`${label} is not a directory`, expanded);
  }
  return realpathSync(expanded);
}

function pathOption(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    projectError(`${label} must be a non-empty path`);
  }
  return value;
}

function insideRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!isAbsolute(path) && path !== ".." &&
    !path.startsWith(`..${sep}`));
}

function canonicalSource(path, root, importer) {
  const expanded = resolve(path);
  let attributes;
  try {
    attributes = statSync(expanded);
  } catch {
    projectError(`local Eliscript module does not exist: ${path}`, importer);
  }
  if (!attributes.isFile()) {
    projectError(`local Eliscript module does not exist: ${path}`, importer);
  }
  const canonical = realpathSync(expanded);
  if (!insideRoot(root, canonical)) {
    projectError(`local Eliscript module escapes project root: ${path}`, importer);
  }
  return canonical;
}

function outputFor(source, root, outDir) {
  const sourcePath = relative(root, source);
  return resolve(outDir, `${sourcePath.slice(0, -4)}.mjs`);
}

function localSourceImport(specifier) {
  return specifier.endsWith(".eli") &&
    (specifier.startsWith("./") || specifier.startsWith("../"));
}

function relativeImport(target, importer) {
  const path = relative(dirname(importer), target);
  return path.startsWith("./") || path.startsWith("../") ? path : `./${path}`;
}

function walkProgram(program, visit) {
  const pending = [...program.body];
  while (pending.length > 0) {
    const node = pending.pop();
    visit(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
}

function projectImports(program, source, root, portable) {
  const imports = [];
  walkProgram(program, (node) => {
    if (node.kind !== "import-declaration") return;
    const specifier = node.value;
    if (portable && node.properties?.portable !== true) {
      projectError("portable project contains a non-portable import", source);
    }
    if (!localSourceImport(specifier)) {
      if (portable || specifier.endsWith(".eli")) {
        const kind = portable ? "portable import" : "Eliscript source import";
        projectError(`${kind} must be a relative .eli module: ${specifier}`, source);
      }
      return;
    }
    const dependency = canonicalSource(
      resolve(dirname(source), specifier),
      root,
      source,
    );
    imports.push({
      dependency,
      entries: node.children
        .filter((child) => child.kind === "import-named")
        .map((child) => child.value),
      node,
    });
  });
  return imports;
}

function rewriteLocalImports(program, source, root, outDir) {
  const outputPath = outputFor(source, root, outDir);
  walkProgram(program, (node) => {
    if (node.kind !== "import-declaration" || !localSourceImport(node.value)) {
      return;
    }
    const dependency = canonicalSource(
      resolve(dirname(source), node.value),
      root,
      source,
    );
    node.value = relativeImport(outputFor(dependency, root, outDir), outputPath);
  });
}

function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestFile(filename) {
  return digestBytes(readFileSync(filename));
}

function writeModule({ compiler, program, source, sourceText, root, outDir }) {
  const output = outputFor(source, root, outDir);
  const sourceMap = `${output}.map`;
  rewriteLocalImports(program, source, root, outDir);
  const emission = compiler.emit_ir_string_with_source_map(
    program,
    sourceText,
    basename(output),
    relative(dirname(sourceMap), source),
  );
  const javascript = `${emission.javascript}//# sourceMappingURL=${basename(sourceMap)}\n`;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(sourceMap, emission.sourceMap);
  writeFileSync(output, javascript);
  return {
    source,
    output,
    sourceMap,
    sourceDigest: digestFile(source),
    outputDigest: digestFile(output),
    sourceMapDigest: digestFile(sourceMap),
  };
}

function manifestRecord(module, root, outDir) {
  return {
    source: relative(root, module.source),
    output: relative(outDir, module.output),
    sourceMap: relative(outDir, module.sourceMap),
    sourceDigest: module.sourceDigest,
    outputDigest: module.outputDigest,
    sourceMapDigest: module.sourceMapDigest,
  };
}

function writeManifest(entryOutput, modules, root, outDir) {
  const identity = {
    format: "eliscript-project",
    version: 1,
    entry: relative(outDir, entryOutput),
    modules: modules.map((module) => manifestRecord(module, root, outDir)),
  };
  const digest = digestBytes(JSON.stringify(identity));
  const manifest = resolve(outDir, manifestFilename);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(manifest, `${JSON.stringify({ ...identity, digest })}\n`);
  return { manifest: realpathSync(manifest), digest };
}

function standardPlan(compiler, entry, root, sourceCache, programCache) {
  return compiler.project_plan([entry], (source) => {
    const sourceText = readFileSync(source, "utf8");
    const program = compiler.compile_ir_string(sourceText, source);
    sourceCache.set(source, sourceText);
    programCache.set(source, program);
    return projectImports(program, source, root, false)
      .map(({ dependency }) => dependency);
  });
}

function portablePlan(
  compiler,
  entry,
  entries,
  root,
  sourceCache,
  programCache,
) {
  return compiler.portable_project_plan([{ id: entry, entries }],
    (source, requestedEntries) => {
      const sourceText = readFileSync(source, "utf8");
      const program = compiler.compile_project_portable_ir_string(
        sourceText,
        requestedEntries,
        source,
      );
      sourceCache.set(source, sourceText);
      programCache.set(source, program);
      return projectImports(program, source, root, true).map((dependency) => ({
        id: dependency.dependency,
        entries: dependency.entries,
      }));
    });
}

export async function buildProject(options) {
  if (!options || typeof options !== "object") {
    projectError("project build options must be an object");
  }
  if (options.entry === undefined || options.outDir === undefined) {
    projectError("project build requires entry and outDir");
  }
  const entryPath = resolve(pathOption(options.entry, "entry"));
  const root = canonicalDirectory(
    options.root === undefined
      ? dirname(entryPath)
      : pathOption(options.root, "project root"),
    "project root",
  );
  const entry = canonicalSource(entryPath, root, entryPath);
  if (!entry.endsWith(".eli")) {
    projectError("entry file must use the .eli extension", entry);
  }
  const requestedOutDir = resolve(pathOption(options.outDir, "output"));
  try {
    const attributes = statSync(requestedOutDir);
    if (!attributes.isDirectory()) {
      projectError("output path is not a directory", requestedOutDir);
    }
  } catch (error) {
    if (error?.eliscriptDiagnostic) throw error;
    mkdirSync(requestedOutDir, { recursive: true });
  }
  const outDir = realpathSync(requestedOutDir);
  const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
  const portableEntries = options.portableEntries ?? [];
  const sourceCache = new Map();
  const programCache = new Map();
  const plan = portableEntries.length > 0
    ? portablePlan(
      compiler,
      entry,
      portableEntries,
      root,
      sourceCache,
      programCache,
    )
    : standardPlan(compiler, entry, root, sourceCache, programCache);
  const normalizedPortableEntries = plan.mode === "portable"
    ? [...plan.entries[0].entries]
    : [];
  const modules = plan.modules.map((record) => writeModule({
    compiler,
    program: programCache.get(record.id),
    source: record.id,
    sourceText: sourceCache.get(record.id),
    root,
    outDir,
  }));
  const entryOutput = outputFor(entry, root, outDir);
  const manifestData = writeManifest(entryOutput, modules, root, outDir);
  return Object.freeze({
    format: "eliscript-project-build",
    version: 1,
    root,
    outDir,
    entry,
    entryOutput,
    mode: plan.mode,
    portableEntries: Object.freeze(normalizedPortableEntries),
    modules: Object.freeze(modules.map((module) => Object.freeze(module))),
    manifest: manifestData.manifest,
    digest: manifestData.digest,
    plan,
  });
}
