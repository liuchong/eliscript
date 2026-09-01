import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { SourceMap } from "node:module";
import { format } from "node:util";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { printValue } from "../../runtime/core/data-text.mjs";
import { loadCompiler } from "./bun.mjs";
import { buildProject } from "./project.mjs";

export const evaluationResultFormat = "eliscript-evaluation-result";
export const evaluationResultVersion = 1;

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evaluationCompilerDigest = createHash("sha256")
  .update("eliscript-evaluation-session-v1")
  .digest("hex");

function frozen(value) {
  return Object.freeze(value);
}

function diagnosticError(message, filename = undefined) {
  const error = new Error(message);
  error.eliscriptDiagnostic = {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-E0001",
    severity: "error",
    phase: "evaluation-request",
    message,
    ...(filename ? { location: { file: filename } } : {}),
  };
  return error;
}

function containedPath(path, root) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot));
}

function nearestProjectRoot(filename) {
  let directory = dirname(filename);
  while (true) {
    if (existsSync(join(directory, "eliscript.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return dirname(filename);
    directory = parent;
  }
}

function requestFilename(filename) {
  return isAbsolute(filename) ? resolve(filename) : resolve(process.cwd(), filename);
}

function runtimeCategory(value) {
  if (value === null) return "nil";
  if (value === undefined) return "undefined";
  return typeof value;
}

function stackLocation(stack) {
  if (typeof stack !== "string") return null;
  const match = stack.match(
    /(?:at\s+)?(?:file:\/\/)?([^\s()]+\.eli):(\d+):(\d+)/u,
  );
  if (!match) return null;
  return {
    file: match[1].trim(),
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

function generatedStackLocation(stack) {
  if (typeof stack !== "string") return null;
  const match = stack.match(
    /(?:at\s+)?(?:file:\/\/)?([^\s()?]+\.mjs)(?:[?#][^\s():]*)?:(\d+):(\d+)/u,
  );
  if (!match) return null;
  const generatedFile = decodeURIComponent(match[1].trim());
  const mapFile = `${generatedFile}.map`;
  if (!existsSync(mapFile)) return null;
  try {
    const sourceMap = new SourceMap(JSON.parse(readFileSync(mapFile, "utf8")));
    const entry = sourceMap.findEntry(Number(match[2]) - 1, Number(match[3]) - 1);
    if (!entry?.originalSource) return null;
    const originalSource = entry.originalSource.startsWith("file://")
      ? fileURLToPath(entry.originalSource)
      : entry.originalSource;
    return {
      file: isAbsolute(originalSource)
        ? originalSource
        : resolve(dirname(mapFile), originalSource),
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
    };
  } catch {
    return null;
  }
}

function remapPoint(point, adjustment) {
  const relativeLine = point.line - adjustment.expressionLine + 1;
  if (relativeLine < 1) return point;
  return {
    ...point,
    line: adjustment.line + relativeLine - 1,
    column: relativeLine === 1
      ? adjustment.column + Math.max(0, point.column - adjustment.expressionColumn)
      : point.column,
  };
}

function remapLocation(location, adjustment) {
  if (!location || !adjustment || location.file !== adjustment.syntheticFilename) {
    return location;
  }
  if (location.start && typeof location.start === "object") {
    return {
      ...location,
      file: adjustment.filename,
      start: remapPoint(location.start, adjustment),
      ...(location.end
        ? { end: remapPoint(location.end, adjustment) }
        : {}),
    };
  }
  return { ...remapPoint(location, adjustment), file: adjustment.filename };
}

function normalizeDiagnostic(error, adjustment = undefined) {
  const existing = error?.eliscriptDiagnostic;
  if (existing && typeof existing === "object") {
    const location = remapLocation(existing.location, adjustment);
    return frozen({
      ...existing,
      ...(location ? { location: frozen({ ...location }) } : {}),
    });
  }
  const location = remapLocation(
    stackLocation(error?.stack) ?? generatedStackLocation(error?.stack),
    adjustment,
  );
  return frozen({
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-E0002",
    severity: "error",
    phase: "evaluation-runtime",
    message: error instanceof Error ? error.message : String(error),
    ...(location ? { location: frozen(location) } : {}),
  });
}

function resultBase(request, revision) {
  return {
    format: evaluationResultFormat,
    version: evaluationResultVersion,
    id: request?.id ?? null,
    operation: request?.operation ?? "unknown",
    revision,
  };
}

function success(request, revision, details) {
  return frozen({
    ...resultBase(request, revision),
    status: "ok",
    ...details,
  });
}

function appendCapturedOutput(result, stdout) {
  if (stdout === "") return result;
  return frozen({ ...result, stdout });
}

async function captureStandardOutput(action) {
  const write = process.stdout.write;
  const consoleMethods = new Map();
  let stdout = "";
  process.stdout.write = function capture(chunk, encoding, callback) {
    stdout += Buffer.isBuffer(chunk)
      ? chunk.toString(typeof encoding === "string" ? encoding : "utf8")
      : String(chunk);
    const done = typeof encoding === "function" ? encoding : callback;
    if (typeof done === "function") queueMicrotask(done);
    return true;
  };
  for (const name of ["debug", "info", "log"]) {
    consoleMethods.set(name, console[name]);
    console[name] = (...values) => {
      stdout += `${format(...values)}\n`;
    };
  }
  try {
    return { value: await action(), stdout };
  } catch (error) {
    error.eliscriptCapturedStdout = stdout;
    throw error;
  } finally {
    process.stdout.write = write;
    for (const [name, method] of consoleMethods) console[name] = method;
  }
}

function failure(rawRequest, request, revision, error, adjustment = undefined) {
  const rawId = rawRequest && typeof rawRequest === "object" ? rawRequest.id : null;
  const id = request?.id ?? (
    (typeof rawId === "string" && rawId.length > 0) ||
    (Number.isSafeInteger(rawId) && rawId >= 0)
      ? rawId
      : null
  );
  return frozen({
    ...resultBase({
      id,
      operation: request?.operation ?? (
        typeof rawRequest?.operation === "string" ? rawRequest.operation : "unknown"
      ),
    }, revision),
    status: "error",
    diagnostic: normalizeDiagnostic(error, adjustment),
  });
}

function namespaceSource(source, description) {
  const exported = new Set(description.exports);
  const missing = description.bindings.filter((name) => !exported.has(name));
  if (missing.length === 0) return source;
  return `${source}\n(export ${missing.join(" ")})\n`;
}

function expressionSource(request, namespace) {
  const prelude = [...(namespace?.macroSources ?? [])];
  if (namespace?.bindings.length > 0) {
    prelude.push(`(import ${JSON.stringify(namespace.url)} ${
      namespace.bindings.join(" ")})`);
  }
  const prefix = "(export-default ";
  const expressionLine = prelude.reduce(
    (lines, source) => lines + source.split("\n").length,
    1,
  );
  const syntheticFilename = `${requestFilename(request.filename)}.eval.eli`;
  return {
    source: `${prelude.length > 0 ? `${prelude.join("\n")}\n` : ""}${
      prefix}${request.source}\n)`,
    adjustment: {
      syntheticFilename,
      filename: request.filename,
      line: request.line,
      column: request.column,
      expressionLine,
      expressionColumn: prefix.length + 1,
    },
  };
}

export class EvaluationSession {
  constructor(options) {
    this.compiler = options.compiler;
    this.directory = options.directory;
    this.revision = 0;
    this.artifact = 0;
    this.namespace = null;
    this.mode = "empty";
    this.definitions = new Map();
    this.definitionFilename = null;
    this.closed = false;
  }

  static async create(options = {}) {
    const compiler = options.compiler ?? await loadCompiler(options.moduleDirectory);
    const directory = mkdtempSync(join(tmpdir(), "eliscript-evaluation-"));
    try {
      mkdirSync(join(directory, "node_modules"), { recursive: true });
      symlinkSync(projectDirectory, join(directory, "node_modules", "eliscript"),
        "dir");
      return new EvaluationSession({ compiler, directory });
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }

  ensureOpen() {
    if (this.closed) throw diagnosticError("evaluation session is closed");
  }

  nextArtifactDirectory(label) {
    this.artifact += 1;
    const directory = join(this.directory, `${String(this.artifact).padStart(6, "0")}-${label}`);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  async compileSingle(source, filename, label) {
    const directory = this.nextArtifactDirectory(label);
    const generatedName = `${label}.mjs`;
    const modulePath = join(directory, generatedName);
    const emission = this.compiler.compile_string_with_source_map(
      source,
      filename,
      generatedName,
      filename,
    );
    writeFileSync(
      modulePath,
      `${emission.javascript}\n`,
      "utf8",
    );
    writeFileSync(`${modulePath}.map`, emission.sourceMap, "utf8");
    const url = `${pathToFileURL(modulePath).href}?artifact=${this.artifact}`;
    return { module: await import(url), modulePath, url };
  }

  async compileProject(source, filename, root, label) {
    const directory = this.nextArtifactDirectory(label);
    const result = await buildProject({
      entry: filename,
      outDir: directory,
      root,
      portableEntries: [],
      useCache: false,
      sourceOverrides: new Map([[filename, source]]),
      compiler: this.compiler,
      compilerDigest: evaluationCompilerDigest,
      sourceMapReference: false,
    });
    const modulePath = result.entryOutput;
    const url = `${pathToFileURL(modulePath).href}?artifact=${this.artifact}`;
    return { module: await import(url), modulePath, url };
  }

  async buildNamespace(source, filename, root, label) {
    const description = this.compiler.evaluation_module_description(source, filename);
    const compiledSource = namespaceSource(source, description);
    const absoluteFilename = requestFilename(filename);
    let artifact;
    if (existsSync(absoluteFilename) && absoluteFilename.endsWith(".eli")) {
      const canonicalFilename = realpathSync(absoluteFilename);
      const requestedRoot = root === null ? nearestProjectRoot(canonicalFilename) : resolve(root);
      const canonicalRoot = realpathSync(requestedRoot);
      if (!containedPath(canonicalFilename, canonicalRoot)) {
        throw diagnosticError("evaluation file escapes project root", filename);
      }
      artifact = await this.compileProject(
        compiledSource,
        canonicalFilename,
        canonicalRoot,
        label,
      );
    } else {
      artifact = await this.compileSingle(compiledSource, filename, label);
    }
    return frozen({
      ...artifact,
      filename,
      source,
      bindings: description.bindings,
      exports: description.exports,
      macroSources: description.macroSources,
    });
  }

  commitNamespace(namespace, mode) {
    this.namespace = namespace;
    this.mode = mode;
    this.revision += 1;
  }

  async describe(request) {
    return success(request, this.revision, {
      kind: "capabilities",
      capabilities: frozen({
        operations: frozen(["describe", "evaluate", "load", "reset"]),
        persistentSession: true,
        sourceMaps: true,
        valuePrinter: "eliscript-data-text",
      }),
    });
  }

  async load(request) {
    const namespace = await this.buildNamespace(
      request.source,
      request.filename,
      request.root,
      `namespace-${this.revision + 1}`,
    );
    this.definitions = new Map();
    this.definitionFilename = null;
    this.commitNamespace(namespace, "loaded");
    return success(request, this.revision, {
      kind: "module",
      bindings: namespace.bindings,
      value: null,
      valueCategory: "module",
    });
  }

  async evaluateDefinition(request, description) {
    if (this.mode === "loaded") {
      throw diagnosticError(
        "evaluate a complete updated source to replace definitions from a loaded module",
        request.filename,
      );
    }
    if (this.definitionFilename !== null &&
        this.definitionFilename !== request.filename) {
      throw diagnosticError(
        "one definition journal cannot mix logical filenames",
        request.filename,
      );
    }
    const definitions = new Map(this.definitions);
    definitions.set(description.name, request.source);
    const source = [...definitions.values()].join("\n");
    const namespace = await this.buildNamespace(
      source,
      request.filename,
      request.root,
      `namespace-${this.revision + 1}`,
    );
    this.definitions = definitions;
    this.definitionFilename = request.filename;
    this.commitNamespace(namespace, "journal");
    const hasValue = description.runtimeBinding &&
      Object.hasOwn(namespace.module, description.name);
    const value = hasValue ? namespace.module[description.name] : undefined;
    return success(request, this.revision, {
      kind: "definition",
      binding: description.name,
      hasValue,
      value: hasValue ? printValue(value) : null,
      valueCategory: hasValue ? runtimeCategory(value) : "macro",
    });
  }

  async evaluateExpression(request) {
    const prepared = expressionSource(request, this.namespace);
    let artifact;
    try {
      artifact = await this.compileSingle(
        prepared.source,
        prepared.adjustment.syntheticFilename,
        `expression-${this.artifact + 1}`,
      );
    } catch (error) {
      error.eliscriptEvaluationAdjustment = prepared.adjustment;
      throw error;
    }
    const value = await artifact.module.default;
    return success(request, this.revision, {
      kind: "expression",
      hasValue: true,
      value: printValue(value),
      valueCategory: runtimeCategory(value),
    });
  }

  async evaluate(request) {
    const description = this.compiler.evaluation_form_description(
      request.source,
      request.filename,
    );
    if (description.kind === "module") {
      throw diagnosticError(
        "module forms require a complete-source load operation",
        request.filename,
      );
    }
    return description.kind === "definition"
      ? this.evaluateDefinition(request, description)
      : this.evaluateExpression(request);
  }

  async reset(request) {
    this.namespace = null;
    this.mode = "empty";
    this.definitions = new Map();
    this.definitionFilename = null;
    this.revision += 1;
    return success(request, this.revision, {
      kind: "reset",
      hasValue: false,
      value: null,
      valueCategory: "none",
    });
  }

  async execute(rawRequest) {
    this.ensureOpen();
    let request;
    try {
      request = this.compiler.evaluation_operation_request(rawRequest);
      const executed = await captureStandardOutput(async () => {
        switch (request.operation) {
          case "describe": return this.describe(request);
          case "evaluate": return this.evaluate(request);
          case "load": return this.load(request);
          case "reset": return this.reset(request);
          default: throw diagnosticError("unsupported evaluation operation");
        }
      });
      return appendCapturedOutput(executed.value, executed.stdout);
    } catch (error) {
      return appendCapturedOutput(failure(
        rawRequest,
        request,
        this.revision,
        error,
        error?.eliscriptEvaluationAdjustment,
      ), error?.eliscriptCapturedStdout ?? "");
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export async function evaluateOnce(request, options = {}) {
  const session = await EvaluationSession.create(options);
  try {
    return await session.execute(request);
  } finally {
    session.close();
  }
}

export function readEvaluationFile(filename) {
  const absolute = requestFilename(filename);
  return { filename: absolute, source: readFileSync(absolute, "utf8") };
}
