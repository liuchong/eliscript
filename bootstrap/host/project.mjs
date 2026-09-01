import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
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
import { fileURLToPath } from "node:url";

import { loadCompiler } from "./bun.mjs";

const manifestFilename = "eliscript-project.json";
const cacheFormat = "eliscript-project-cache";
const cacheVersion = 2;
const hostDirectory = dirname(fileURLToPath(import.meta.url));

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

function regularFile(filename) {
  try {
    return statSync(filename).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function compilerModuleDirectory(moduleDirectory) {
  return resolve(
    moduleDirectory ??
      process.env.ELISCRIPT_BOOTSTRAP_MODULE_DIR ??
      resolve(hostDirectory, "../../dist/bootstrap"),
  );
}

function compilerDirectoryDigest(directory) {
  const filenames = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() &&
      (entry.name.endsWith(".mjs") || entry.name.endsWith(".mjs.map")))
    .map((entry) => entry.name)
    .sort();
  if (!filenames.includes("compiler.mjs")) {
    projectError("generated compiler directory is incomplete", directory);
  }
  const hash = createHash("sha256");
  for (const filename of filenames) {
    hash.update(filename);
    hash.update("\0");
    hash.update(readFileSync(resolve(directory, filename)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function compilerDigestOption(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    projectError("injected compiler requires a lowercase SHA-256 compilerDigest");
  }
  return value;
}

function writeModule({
  compiler,
  program,
  source,
  sourceText,
  root,
  outDir,
  dependencies,
  portableEntries,
  reason,
}) {
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
    dependencies,
    portableEntries,
    reused: false,
    reason,
  };
}

function reportModule(module, root, outDir) {
  return {
    source: relative(root, module.source),
    output: relative(outDir, module.output),
    sourceMap: relative(outDir, module.sourceMap),
    status: module.reused ? "reused" : "compiled",
    reason: module.reason,
    dependencies: module.dependencies.map((dependency) => relative(root, dependency)),
    portableEntries: [...module.portableEntries],
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

function cacheMetadataRecord(module, root) {
  return {
    source: relative(root, module.source),
    dependencies: module.dependencies.map((dependency) => relative(root, dependency)),
    portableEntries: [...module.portableEntries],
  };
}

function cacheIdentityModule(record) {
  return {
    source: record.source,
    dependencies: record.dependencies,
    portableEntries: record.portableEntries,
  };
}

function cacheIdentity(value) {
  if (!value || !Array.isArray(value.modules)) return undefined;
  const modules = value.modules.map(cacheIdentityModule);
  if (value.format === undefined && value.version === 1) {
    return {
      version: 1,
      compilerDigest: value.compilerDigest,
      mode: value.mode,
      portableEntries: value.portableEntries,
      modules,
    };
  }
  return {
    format: value.format,
    version: value.version,
    compilerDigest: value.compilerDigest,
    mode: value.mode,
    portableEntries: value.portableEntries,
    modules,
  };
}

function writeManifest(
  entryOutput,
  modules,
  root,
  outDir,
  mode,
  portableEntries,
  compilerDigest,
) {
  const identity = {
    format: "eliscript-project",
    version: 1,
    entry: relative(outDir, entryOutput),
    modules: modules.map((module) => manifestRecord(module, root, outDir)),
  };
  const digest = digestBytes(JSON.stringify(identity));
  const cache = {
    format: cacheFormat,
    version: cacheVersion,
    compilerDigest,
    mode,
    portableEntries,
    modules: modules.map((module) => cacheMetadataRecord(module, root)),
  };
  const cacheDigest = digestBytes(JSON.stringify(cache));
  const manifest = resolve(outDir, manifestFilename);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(manifest, `${JSON.stringify({
    ...identity,
    digest,
    cache: { ...cache, digest: cacheDigest },
  })}\n`);
  return { manifest: realpathSync(manifest), digest };
}

function readCache({
  compiler,
  enabled,
  outDir,
  entryOutput,
  mode,
  portableEntries,
  compilerDigest,
}) {
  const manifestPath = resolve(outDir, manifestFilename);
  if (!enabled) {
    return compiler.project_cache_lookup({
      enabled: false,
      manifestStatus: "missing",
    });
  }
  if (!regularFile(manifestPath)) {
    return compiler.project_cache_lookup({
      enabled: true,
      manifestStatus: "missing",
    });
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const graphIdentity = {
      format: manifest?.format,
      version: manifest?.version,
      entry: manifest?.entry,
      modules: manifest?.modules,
    };
    const privateIdentity = cacheIdentity(manifest?.cache);
    return compiler.project_cache_lookup({
      enabled: true,
      manifestStatus: "readable",
      manifest,
      expectedEntry: relative(outDir, entryOutput),
      graphDigestValid: manifest?.digest ===
        digestBytes(JSON.stringify(graphIdentity)),
      cacheDigestValid: privateIdentity !== undefined &&
        manifest.cache?.digest === digestBytes(JSON.stringify(privateIdentity)),
      compilerDigest,
      mode,
      portableEntries,
    });
  } catch {
    return compiler.project_cache_lookup({
      enabled: true,
      manifestStatus: "unreadable",
    });
  }
}

function cachedRecords(lookup) {
  return new Map((lookup.cache?.records ?? []).map((record) =>
    [record.source, record]));
}

function cachedModule({
  compiler,
  source,
  root,
  outDir,
  record,
  expectedPortableEntries,
}) {
  const output = outputFor(source, root, outDir);
  const sourceMap = `${output}.map`;
  let sourceDigest;
  let outputDigest;
  let sourceMapDigest;
  let outputExists = false;
  let sourceMapExists = false;
  let artifactFailure;
  try {
    sourceDigest = digestFile(source);
    outputExists = regularFile(output);
    sourceMapExists = regularFile(sourceMap);
    if (outputExists) outputDigest = digestFile(output);
    if (sourceMapExists) sourceMapDigest = digestFile(sourceMap);
  } catch {
    artifactFailure = "artifact-unreadable";
  }
  let dependencies = [];
  let dependenciesValid = true;
  try {
    if (!Array.isArray(record?.metadata?.dependencies) ||
        !Array.isArray(record?.metadata?.portableEntries)) {
      throw new TypeError("cache module metadata is invalid");
    }
    dependencies = record.metadata.dependencies.map((dependency) =>
      canonicalSource(resolve(root, dependency), root, source));
  } catch {
    dependenciesValid = false;
  }
  const decision = compiler.project_cache_decision({
    record,
    output: relative(outDir, output),
    sourceMap: relative(outDir, sourceMap),
    expectedPortableEntries,
    sourceDigest,
    outputExists,
    sourceMapExists,
    outputDigest,
    sourceMapDigest,
    dependenciesValid,
    artifactFailure,
  });
  return {
    decision,
    module: decision.reused
      ? {
          source,
          output,
          sourceMap,
          sourceDigest,
          outputDigest,
          sourceMapDigest,
          dependencies,
          portableEntries: [...record.metadata.portableEntries],
          reused: true,
          reason: "verified",
        }
      : undefined,
  };
}

function standardPlan(
  compiler,
  entry,
  root,
  outDir,
  sourceCache,
  programCache,
  records,
  decisions,
) {
  return compiler.project_plan([entry], (source) => {
    const cached = cachedModule({
      compiler,
      source,
      root,
      outDir,
      record: records.get(relative(root, source)),
      expectedPortableEntries: [],
    });
    decisions.set(source, cached);
    if (cached.module !== undefined) return cached.module.dependencies;
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
  const startedAt = performance.now();
  if (!options || typeof options !== "object") {
    projectError("project build options must be an object");
  }
  if (options.entry === undefined || options.outDir === undefined) {
    projectError("project build requires entry and outDir");
  }
  const moduleDirectory = compilerModuleDirectory(options.moduleDirectory);
  const compiler = options.compiler ?? await loadCompiler(moduleDirectory);
  const request = compiler.build_operation_request({
    mode: "project",
    entry: options.entry,
    outDir: options.outDir,
    root: options.root ?? null,
    portableEntries: options.portableEntries ?? [],
    useCache: options.useCache === undefined ? true : options.useCache,
  });
  const entryPath = resolve(pathOption(request.entry, "entry"));
  const root = canonicalDirectory(
    request.root === null
      ? dirname(entryPath)
      : pathOption(request.root, "project root"),
    "project root",
  );
  const entry = canonicalSource(entryPath, root, entryPath);
  if (!entry.endsWith(".eli")) {
    projectError("entry file must use the .eli extension", entry);
  }
  const requestedOutDir = resolve(pathOption(request.outDir, "output"));
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
  const useCache = request.useCache;
  const compilerDigest = options.compiler === undefined
    ? compilerDirectoryDigest(moduleDirectory)
    : compilerDigestOption(options.compilerDigest);
  const requestedPortableEntries = [...request.portableEntries];
  const mode = requestedPortableEntries.length > 0 ? "portable" : "standard";
  const entryOutput = outputFor(entry, root, outDir);
  const cacheStartedAt = performance.now();
  const cacheLookup = readCache({
    compiler,
    enabled: useCache,
    outDir,
    entryOutput,
    mode,
    portableEntries: requestedPortableEntries,
    compilerDigest,
  });
  const cacheReadMs = performance.now() - cacheStartedAt;
  const records = cachedRecords(cacheLookup);
  const sourceCache = new Map();
  const programCache = new Map();
  const decisions = new Map();
  const plan = mode === "portable"
    ? portablePlan(
      compiler,
      entry,
      requestedPortableEntries,
      root,
      sourceCache,
      programCache,
    )
    : standardPlan(
      compiler,
      entry,
      root,
      outDir,
      sourceCache,
      programCache,
      records,
      decisions,
    );
  const normalizedPortableEntries = plan.mode === "portable"
    ? [...plan.entries[0].entries]
    : [];
  const modules = plan.modules.map((record) => {
    const dependencies = record.dependencies.map((dependency) =>
      typeof dependency === "string" ? dependency : dependency.id);
    const modulePortableEntries = record.entries === undefined
      ? []
      : [...record.entries];
    const cached = plan.mode === "standard"
      ? decisions.get(record.id)
      : cachedModule({
        compiler,
        source: record.id,
        root,
        outDir,
        record: records.get(relative(root, record.id)),
        expectedPortableEntries: modulePortableEntries,
      });
    if (cached?.module !== undefined) return cached.module;
    return writeModule({
      compiler,
      program: programCache.get(record.id),
      source: record.id,
      sourceText: sourceCache.get(record.id),
      root,
      outDir,
      dependencies,
      portableEntries: modulePortableEntries,
      reason: cacheLookup.cache === null
        ? cacheLookup.reason
        : cached.decision.reason,
    });
  });
  const workFinishedAt = performance.now();
  const manifestData = writeManifest(
    entryOutput,
    modules,
    root,
    outDir,
    plan.mode,
    normalizedPortableEntries,
    compilerDigest,
  );
  const manifestFinishedAt = performance.now();
  const report = compiler.project_build_report({
    mode: plan.mode,
    root,
    outDir,
    entry: relative(root, entry),
    entryOutput: relative(outDir, entryOutput),
    manifest: relative(outDir, manifestData.manifest),
    digest: manifestData.digest,
    portableEntries: normalizedPortableEntries,
    cache: { enabled: useCache, reason: cacheLookup.reason },
    timings: {
      cacheReadMs,
      workMs: Math.max(0, workFinishedAt - startedAt - cacheReadMs),
      manifestWriteMs: manifestFinishedAt - workFinishedAt,
      totalMs: manifestFinishedAt - startedAt,
    },
    modules: modules.map((module) => reportModule(module, root, outDir)),
  });
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
    report,
    plan,
  });
}
