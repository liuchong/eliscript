// In-memory compile host for browsers and workers.
//
// The command-line host in `bootstrap/host/project.mjs` answers the project
// planner from the filesystem. This host answers the same questions from a map
// of sources, so a project compiles without a server process, and it rewrites
// every specifier the emitted modules carry so they can run from blob URLs.
//
// Every import in this file is relative. A worker has no document and therefore
// no import map, so this module and the compiler bundle it loads must never
// depend on one.

import {
  compile_ir_string,
  emit_ir_string_with_source_map,
  project_plan,
} from "../dist/browser/compiler.js";

const SOURCE_EXTENSION = ".eli";
const OUTPUT_EXTENSION = ".mjs";

/* ------------------------------------------------------------------ paths */

function splitPath(path) {
  return path.split("/").filter((part) => part !== "" && part !== ".");
}

export function normalizePath(path) {
  const parts = [];
  for (const part of splitPath(path)) {
    if (part === "..") {
      if (parts.length === 0) {
        throw new Error(`path escapes the project root: ${path}`);
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

export function dirname(path) {
  const parts = splitPath(path);
  parts.pop();
  return parts.join("/");
}

export function resolvePath(importer, specifier) {
  const base = dirname(importer);
  return normalizePath(base === "" ? specifier : `${base}/${specifier}`);
}

export function outputPathFor(source) {
  if (!source.endsWith(SOURCE_EXTENSION)) {
    throw new Error(`source module must end with ${SOURCE_EXTENSION}: ${source}`);
  }
  return `${source.slice(0, -SOURCE_EXTENSION.length)}${OUTPUT_EXTENSION}`;
}

export function relativePath(from, to) {
  const fromParts = splitPath(dirname(from));
  const toParts = splitPath(to);
  let common = 0;
  while (common < fromParts.length && common < toParts.length &&
         fromParts[common] === toParts[common]) {
    common += 1;
  }
  const parts = [
    ...fromParts.slice(common).map(() => ".."),
    ...toParts.slice(common),
  ];
  const joined = parts.join("/");
  return joined.startsWith(".") ? joined : `./${joined}`;
}

/* ------------------------------------------------------------------ graph */

// The planner hands back discovery order, but a module's imports must exist
// before it does, so execution needs a dependency-first order.
export function dependencyOrder(modules) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const order = [];
  const state = new Map();
  for (const module of modules) visit(module.id);
  return order;

  function visit(id) {
    const seen = state.get(id);
    if (seen === "done") return;
    if (seen === "visiting") throw new Error(`import cycle through ${id}`);
    state.set(id, "visiting");
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    state.set(id, "done");
    order.push(id);
  }
}

function walkProgram(program, visit) {
  const pending = [...program.body];
  while (pending.length > 0) {
    const node = pending.pop();
    visit(node);
    const children = node.children;
    if (children === undefined || children === null) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
}

function localSourceSpecifier(specifier) {
  return specifier.startsWith(".") && specifier.endsWith(SOURCE_EXTENSION);
}

function importSpecifiers(program) {
  const specifiers = [];
  walkProgram(program, (node) => {
    if (node.kind === "import-declaration") specifiers.push(node);
  });
  return specifiers;
}

// A source map names its source relative to the map beside it, which is a bare
// relative path rather than an import specifier.
function mapSourcePath(output, source) {
  const path = relativePath(`${output}.map`, source);
  return path.startsWith("./") ? path.slice(2) : path;
}

// The emitter injects runtime imports of its own for literals, collection
// helpers, list operations, and value equality. Those are not import nodes in
// the program, so they survive the IR rewrite above and must be resolved in the
// emitted text or every module that uses a vector keeps a bare specifier.
function rewriteEmittedExternals(code, source, resolveExternal) {
  if (resolveExternal === undefined) return code;
  const rewrite = (whole, prefix, quoted) => {
    const specifier = quoted.slice(1, -1);
    if (specifier.startsWith(".") || specifier.startsWith("/") ||
        specifier.includes("://")) {
      return whole;
    }
    const external = resolveExternal(specifier, source);
    return typeof external === "string" && external.length > 0
      ? `${prefix}"${external}"`
      : whole;
  };
  return code
    .replace(/(\bfrom\s+)("[^"]+")/gu, rewrite)
    .replace(/(\bimport\s+)("[^"]+")/gu, rewrite);
}

function diagnosticOf(error, filename) {
  return error?.eliscriptDiagnostic ?? {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-BROWSER-0001",
    severity: "error",
    phase: "browser-host",
    message: error?.message ?? String(error),
    location: { file: filename },
  };
}

export class BrowserCompileError extends Error {
  constructor(diagnostics) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
    this.name = "BrowserCompileError";
    this.diagnostics = diagnostics;
  }
}

function failure(code, message, filename) {
  return new BrowserCompileError([{
    format: "eliscript-diagnostic",
    version: 1,
    code,
    severity: "error",
    phase: "browser-host",
    message,
    location: { file: filename },
  }]);
}

/* ---------------------------------------------------------------- compile */

// Rewrites every specifier an emitted module carries:
//   - a local `.eli` import becomes the relative path of its emitted module;
//   - a bare specifier is offered to `resolveExternal`, so an application can
//     point the runtime at a served directory without an import map;
//   - anything `resolveExternal` declines stays as written, which is what a
//     third-party package import needs.
function rewriteSpecifiers(program, source, resolveExternal) {
  for (const node of importSpecifiers(program)) {
    const specifier = node.value;
    if (localSourceSpecifier(specifier)) {
      node.value = relativePath(
        outputPathFor(source),
        outputPathFor(resolvePath(source, specifier)),
      );
      continue;
    }
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    const external = resolveExternal?.(specifier, source);
    if (typeof external === "string" && external.length > 0) node.value = external;
  }
}

/**
 * Compiles one module.
 *
 * @returns {{ javascript: string, sourceMap: object }}
 */
export function compileSource(
  source,
  filename = `module${SOURCE_EXTENSION}`,
  options = {},
) {
  const program = compile_ir_string(source, filename, options.macroContext ?? null);
  rewriteSpecifiers(program, filename, options.resolveExternal);
  const output = outputPathFor(filename);
  const emission = emit_ir_string_with_source_map(
    program,
    source,
    output,
    mapSourcePath(output, filename),
  );
  return {
    javascript: rewriteEmittedExternals(
      emission.javascript,
      filename,
      options.resolveExternal,
    ),
    sourceMap: emission.sourceMap,
  };
}

/**
 * Compiles a whole project from a map of sources.
 *
 * @param {object} request
 * @param {Record<string, string>} request.files relative `.eli` path to source
 * @param {string} request.entry relative `.eli` path to compile from
 * @returns {{ plan: object, modules: Record<string, object> }}
 */
export function compileProject({
  files,
  entry,
  macroContext = null,
  resolveExternal,
}) {
  for (const path of Object.keys(files)) outputPathFor(path);
  if (files[entry] === undefined) {
    throw failure("ELI-BROWSER-0002", `entry is not in the project: ${entry}`, entry);
  }

  const programs = new Map();
  const programFor = (id) => {
    if (programs.has(id)) return programs.get(id);
    if (files[id] === undefined) {
      throw failure("ELI-BROWSER-0003", `missing source for import: ${id}`, id);
    }
    let program;
    try {
      program = compile_ir_string(files[id], id, macroContext);
    } catch (error) {
      throw new BrowserCompileError([diagnosticOf(error, id)]);
    }
    programs.set(id, program);
    return program;
  };

  const plan = project_plan([entry], (id) => importSpecifiers(programFor(id))
    .filter((node) => localSourceSpecifier(node.value))
    .map((node) => resolvePath(id, node.value)));

  const modules = {};
  for (const id of dependencyOrder(plan.modules)) {
    const output = outputPathFor(id);
    const program = programFor(id);
    rewriteSpecifiers(program, id, resolveExternal);
    const emission = emit_ir_string_with_source_map(
      program,
      files[id],
      output,
      mapSourcePath(output, id),
    );
    modules[output] = {
      id,
      source: files[id],
      javascript: rewriteEmittedExternals(emission.javascript, id, resolveExternal),
      sourceMap: emission.sourceMap,
    };
  }
  return { plan, modules };
}

/* ---------------------------------------------------------------- execute */

/**
 * Turns compiled modules into importable blob URLs, dependencies first.
 *
 * A blob module has no directory, so its relative imports cannot resolve. Each
 * local specifier was therefore rewritten to a relative path during compilation
 * and is replaced here by the blob URL of the module it names. Only import
 * specifiers are touched, never a string literal that resembles one.
 *
 * @returns {{ entryUrl: string, urls: Record<string, string>, release: () => void }}
 */
export function moduleGraphUrls(modules, entry) {
  const urls = {};
  const created = [];
  const outputs = Object.keys(modules);

  const targetOf = (from, specifier) => {
    const parts = splitPath(dirname(from));
    for (const part of specifier.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return parts.join("/");
  };
  const rewritePattern = (code, from, pattern) => code.replace(
    pattern,
    (whole, prefix, quoted) => {
      const specifier = quoted.slice(1, -1);
      if (!specifier.startsWith(".")) return whole;
      const url = urls[targetOf(from, specifier)];
      return url === undefined ? whole : `${prefix}"${url}"`;
    },
  );

  for (const outputPath of outputs) {
    let code = modules[outputPath].javascript;
    code = rewritePattern(code, outputPath, /(\bfrom\s+)("[^"]+")/gu);
    code = rewritePattern(code, outputPath, /(\bimport\s+)("[^"]+")/gu);
    urls[outputPath] = URL.createObjectURL(
      new Blob([code], { type: "text/javascript" }),
    );
    created.push(urls[outputPath]);
  }

  const entryUrl = urls[outputPathFor(entry)];
  if (entryUrl === undefined) {
    for (const url of created) URL.revokeObjectURL(url);
    throw failure("ELI-BROWSER-0004", `compiled entry is missing: ${entry}`, entry);
  }
  const release = () => {
    for (const url of created) URL.revokeObjectURL(url);
  };
  return { entryUrl, urls, release };
}

export const browserHostSurface = Object.freeze({
  sourceExtension: SOURCE_EXTENSION,
  outputExtension: OUTPUT_EXTENSION,
});
