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

function isPlainLiteralNode(node) {
  return (
    node !== null &&
    typeof node === "object" &&
    node.kind === "literal" &&
    node.properties?.literalKind === undefined
  );
}

function isConstantLiteralNode(node) {
  if (node === null || typeof node !== "object" || node.kind !== "literal") {
    return false;
  }
  const literalKind = node.properties?.literalKind;
  return (
    literalKind === undefined ||
    literalKind === "undefined" ||
    literalKind === "keyword"
  );
}

function cloneLiteralNode(literal, span) {
  return {
    kind: "literal",
    span: span ?? literal.span,
    value: literal.value,
    children: [],
    ...(literal.properties ? { properties: { ...literal.properties } } : {}),
  };
}

function literalRuntimeValue(node) {
  const literalKind = node.properties?.literalKind;
  if (literalKind === "undefined") return undefined;
  if (literalKind === "keyword") return `:${node.value}`;
  return node.value;
}

function literalTruthiness(node) {
  if (!isConstantLiteralNode(node)) {
    return null;
  }
  const literalKind = node.properties?.literalKind;
  if (literalKind === "undefined") return false;
  if (literalKind === "keyword") return true;
  return node.value !== false && node.value !== null && node.value !== undefined;
}

function collectMutatedNames(program) {
  const mutated = new Set();
  walkProgram(program, (node) => {
    if (node.kind === "assignment") {
      for (const pair of node.children ?? []) {
        if (typeof pair?.value === "string") mutated.add(pair.value);
      }
    } else if (
      node.kind === "variable-declaration" &&
      node.properties?.mutable === true &&
      typeof node.value === "string"
    ) {
      mutated.add(node.value);
    }
  });
  return mutated;
}

function foldIrNode(node, env = new Map(), mutated = new Set()) {
  if (node === null || typeof node !== "object") return node;
  if (node.kind === "export-declaration" || node.kind === "import-declaration") {
    return node;
  }

  if (node.kind === "reference" && typeof node.value === "string") {
    if (!mutated.has(node.value) && env.has(node.value)) {
      return cloneLiteralNode(env.get(node.value), node.span);
    }
    return node;
  }

  if (node.kind === "module-declaration" && Array.isArray(node.children)) {
    const scope = new Map(env);
    let changed = false;
    const nextChildren = node.children.map((child) => {
      const next = foldIrNode(child, scope, mutated);
      if (next !== child) changed = true;
      if (
        next.kind === "variable-declaration" &&
        next.properties?.mutable !== true &&
        typeof next.value === "string" &&
        !mutated.has(next.value) &&
        Array.isArray(next.children) &&
        next.children.length === 1 &&
        isConstantLiteralNode(next.children[0])
      ) {
        scope.set(next.value, next.children[0]);
      }
      return next;
    });
    return changed ? { ...node, children: nextChildren } : node;
  }

  if (
    (node.kind === "function-declaration" || node.kind === "function-expression") &&
    Array.isArray(node.children)
  ) {
    const paramCount = node.properties?.parameterCount ?? 0;
    const scope = new Map(env);
    for (let index = 0; index < paramCount; index += 1) {
      const param = node.children[index];
      if (typeof param?.value === "string") scope.delete(param.value);
    }
    let changed = false;
    const nextChildren = node.children.map((child, index) => {
      if (index < paramCount) return child;
      const next = foldIrNode(child, scope, mutated);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children: nextChildren } : node;
  }

  if (node.kind === "lexical-bindings" && Array.isArray(node.children)) {
    const bindingCount = node.properties?.bindingCount ?? 0;
    const sequential = node.properties?.sequential === true;
    const outerScope = new Map(env);
    const bodyScope = new Map(env);
    let changed = false;
    const nextChildren = node.children.map((child, index) => {
      if (index < bindingCount && child.kind === "lexical-binding") {
        const initScope = sequential ? bodyScope : outerScope;
        let nextBinding = child;
        if (Array.isArray(child.children) && child.children.length > 0) {
          let bindingChanged = false;
          const nextBindingChildren = child.children.map((expr) => {
            const folded = foldIrNode(expr, initScope, mutated);
            if (folded !== expr) bindingChanged = true;
            return folded;
          });
          if (bindingChanged) {
            changed = true;
            nextBinding = { ...child, children: nextBindingChildren };
          }
        }
        if (
          typeof nextBinding.value === "string" &&
          nextBinding.properties?.pattern !== true
        ) {
          if (
            !mutated.has(nextBinding.value) &&
            Array.isArray(nextBinding.children) &&
            nextBinding.children.length === 1 &&
            isConstantLiteralNode(nextBinding.children[0])
          ) {
            bodyScope.set(nextBinding.value, nextBinding.children[0]);
          } else {
            bodyScope.delete(nextBinding.value);
          }
        }
        return nextBinding;
      }
      const next = foldIrNode(child, bodyScope, mutated);
      if (next !== child) changed = true;
      return next;
    });
    const updated = changed ? { ...node, children: nextChildren } : node;
    const bodyNodes = updated.children.slice(bindingCount);
    if (bodyNodes.length === 1 && isConstantLiteralNode(bodyNodes[0])) {
      const allBindingsPureConstants = updated.children
        .slice(0, bindingCount)
        .every(
          (binding) =>
            binding.kind === "lexical-binding" &&
            binding.properties?.pattern !== true &&
            Array.isArray(binding.children) &&
            binding.children.length === 1 &&
            isConstantLiteralNode(binding.children[0]),
        );
      if (allBindingsPureConstants) {
        return bodyNodes[0];
      }
    }
    return updated;
  }

  if (Array.isArray(node.children) && node.children.length > 0) {
    let changed = false;
    const optimizedChildren = node.children.map((child) => {
      const next = foldIrNode(child, env, mutated);
      if (next !== child) changed = true;
      return next;
    });
    if (changed) {
      node = { ...node, children: optimizedChildren };
    }
  }

  const children = node.children ?? [];
  if (node.kind === "conditional" && children.length >= 2) {
    const truthy = literalTruthiness(children[0]);
    if (truthy === true) return children[1];
    if (truthy === false) {
      return (
        children[2] ?? {
          kind: "literal",
          span: node.span,
          value: null,
          children: [],
        }
      );
    }
  }

  if (node.kind === "short-circuit" && children.length > 0) {
    if (node.value === "and") {
      const remaining = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const truthy = literalTruthiness(child);
        if (truthy === false && remaining.length === 0) {
          return child;
        }
        if (truthy === true && index < children.length - 1) {
          continue;
        }
        remaining.push(child);
      }
      if (remaining.length === 1) return remaining[0];
      if (remaining.length !== children.length) {
        return { ...node, children: remaining };
      }
    } else if (node.value === "or") {
      const remaining = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const truthy = literalTruthiness(child);
        if (truthy === true && remaining.length === 0) {
          return child;
        }
        if (truthy === false && index < children.length - 1) {
          continue;
        }
        remaining.push(child);
      }
      if (remaining.length === 1) return remaining[0];
      if (remaining.length !== children.length) {
        return { ...node, children: remaining };
      }
    }
  }

  if (node.kind === "intrinsic") {
    if (node.value === "not" && children.length === 1) {
      const truthy = literalTruthiness(children[0]);
      if (truthy !== null) {
        return {
          kind: "literal",
          span: node.span,
          value: !truthy,
          children: [],
        };
      }
    }

    if (
      (node.value === "null" ||
        node.value === "nil?" ||
        node.value === "undefined?" ||
        node.value === "nullish?") &&
      children.length === 1 &&
      isConstantLiteralNode(children[0])
    ) {
      const raw = literalRuntimeValue(children[0]);
      const result =
        node.value === "undefined?"
          ? raw === undefined
          : node.value === "nullish?"
            ? raw === null || raw === undefined
            : raw === null;
      return {
        kind: "literal",
        span: node.span,
        value: result,
        children: [],
      };
    }

    if (
      (node.value === "=" ||
        node.value === "/=" ||
        node.value === "not=" ||
        node.value === "eq" ||
        node.value === "equal") &&
      children.length === 2 &&
      isConstantLiteralNode(children[0]) &&
      isConstantLiteralNode(children[1])
    ) {
      const left = literalRuntimeValue(children[0]);
      const right = literalRuntimeValue(children[1]);
      const same = left === right;
      return {
        kind: "literal",
        span: node.span,
        value: node.value === "/=" || node.value === "not=" ? !same : same,
        children: [],
      };
    }

    if (
      (node.value === "<" ||
        node.value === "<=" ||
        node.value === ">" ||
        node.value === ">=") &&
      children.length === 2 &&
      isPlainLiteralNode(children[0]) &&
      isPlainLiteralNode(children[1]) &&
      typeof children[0].value === "number" &&
      typeof children[1].value === "number"
    ) {
      const left = children[0].value;
      const right = children[1].value;
      const compared =
        node.value === "<"
          ? left < right
          : node.value === "<="
            ? left <= right
            : node.value === ">"
              ? left > right
              : left >= right;
      return {
        kind: "literal",
        span: node.span,
        value: compared,
        children: [],
      };
    }

    if (
      children.every(
        (child) => isPlainLiteralNode(child) && typeof child.value === "number",
      )
    ) {
      const values = children.map((child) => child.value);
      let folded;
      switch (node.value) {
        case "+":
          folded = values.reduce((sum, item) => sum + item, 0);
          break;
        case "*":
          folded = values.reduce((product, item) => product * item, 1);
          break;
        case "-":
          if (values.length === 1) folded = -values[0];
          else if (values.length >= 2) {
            folded = values.slice(1).reduce((acc, item) => acc - item, values[0]);
          }
          break;
        case "/":
          if (values.length === 2 && values[1] !== 0) {
            folded = values[0] / values[1];
          }
          break;
        case "%":
          if (values.length === 2 && values[1] !== 0) {
            folded = values[0] % values[1];
          }
          break;
        case "1+":
          if (values.length === 1) folded = values[0] + 1;
          break;
        case "1-":
          if (values.length === 1) folded = values[0] - 1;
          break;
        default:
          break;
      }
      if (typeof folded === "number" && Number.isFinite(folded)) {
        return {
          kind: "literal",
          span: node.span,
          value: folded,
          children: [],
        };
      }
    }

    if (node.value === "+" && children.length >= 2) {
      const nonZero = children.filter(
        (child) => !(isPlainLiteralNode(child) && child.value === 0),
      );
      if (nonZero.length > 0 && nonZero.length < children.length) {
        return nonZero.length === 1
          ? nonZero[0]
          : { ...node, children: nonZero };
      }
    }

    if (node.value === "*" && children.length >= 2) {
      const nonOne = children.filter(
        (child) => !(isPlainLiteralNode(child) && child.value === 1),
      );
      if (nonOne.length > 0 && nonOne.length < children.length) {
        return nonOne.length === 1 ? nonOne[0] : { ...node, children: nonOne };
      }
    }
  }

  if (
    node.kind === "string-concat" &&
    children.every(
      (child) =>
        isPlainLiteralNode(child) &&
        (typeof child.value === "string" ||
          typeof child.value === "number" ||
          typeof child.value === "boolean" ||
          child.value === null),
    )
  ) {
    return {
      kind: "literal",
      span: node.span,
      value: children
        .map((child) => (child.value === null ? "" : String(child.value)))
        .join(""),
      children: [],
    };
  }

  return node;
}

/**
 * Performs a Closure-style IR optimization pass (constant propagation,
 * constant folding, algebraic identity simplification, and dead conditional
 * branch elimination) over a compiled Eliscript IR program.
 */
export function optimizeProgramIr(program) {
  if (program === null || typeof program !== "object" || !Array.isArray(program.body)) {
    return program;
  }
  const mutated = collectMutatedNames(program);
  const topScope = new Map();
  program.body = program.body.map((node) => {
    const next = foldIrNode(node, topScope, mutated);
    if (
      next.kind === "variable-declaration" &&
      next.properties?.mutable !== true &&
      typeof next.value === "string" &&
      !mutated.has(next.value) &&
      Array.isArray(next.children) &&
      next.children.length === 1 &&
      isConstantLiteralNode(next.children[0])
    ) {
      topScope.set(next.value, next.children[0]);
    }
    return next;
  });
  return program;
}

function isIdentifierChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95 ||
    code > 127
  );
}

function compactLineWhitespace(line) {
  if (line.startsWith("//# sourceMappingURL=")) return line;
  let result = "";
  let index = 0;
  const length = line.length;
  while (index < length) {
    const ch = line[index];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result += ch;
      index += 1;
      while (index < length) {
        const cur = line[index];
        result += cur;
        index += 1;
        if (cur === "\\" && index < length) {
          result += line[index];
          index += 1;
          continue;
        }
        if (cur === quote) break;
      }
      continue;
    }
    if (ch === " " || ch === "\t") {
      while (index < length && (line[index] === " " || line[index] === "\t")) {
        index += 1;
      }
      const prev = result[result.length - 1] ?? "";
      const next = line[index] ?? "";
      if (
        (isIdentifierChar(prev) && isIdentifierChar(next)) ||
        (prev === "+" && next === "+") ||
        (prev === "-" && next === "-") ||
        (prev === "/" && (next === "/" || next === "*"))
      ) {
        result += " ";
      }
      continue;
    }
    result += ch;
    index += 1;
  }
  return result;
}

/**
 * Strips comments and compacts whitespace in emitted JavaScript while
 * preserving string/template literals and sourceMappingURL directives.
 */
export function optimizeJavaScript(code) {
  if (typeof code !== "string" || code.length === 0) return code;
  let out = "";
  let index = 0;
  const length = code.length;

  while (index < length) {
    const ch = code[index];
    const next = code[index + 1];

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      index += 1;
      while (index < length) {
        const current = code[index];
        out += current;
        index += 1;
        if (current === "\\" && index < length) {
          out += code[index];
          index += 1;
          continue;
        }
        if (current === quote) break;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      const lineEnd = code.indexOf("\n", index + 2);
      const comment = lineEnd < 0 ? code.slice(index) : code.slice(index, lineEnd);
      if (comment.startsWith("//# sourceMappingURL=")) {
        out += comment;
      }
      index = lineEnd < 0 ? length : lineEnd;
      continue;
    }

    if (ch === "/" && next === "*") {
      const closeIndex = code.indexOf("*/", index + 2);
      if (closeIndex < 0) break;
      const block = code.slice(index + 2, closeIndex);
      out += block.includes("\n") ? "\n" : " ";
      index = closeIndex + 2;
      continue;
    }

    out += ch;
    index += 1;
  }

  const lines = out
    .split("\n")
    .map((line) => compactLineWhitespace(line.trim()))
    .filter((line) => line.length > 0);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function applyPostCompileOptimization(javascript, sourceMap, meta, options = {}) {
  let code =
    options.minify === true || options.optimize === "compact"
      ? optimizeJavaScript(javascript)
      : javascript;
  let map = sourceMap;
  if (typeof options.closureCompiler === "function") {
    const transformed = options.closureCompiler(code, {
      ...meta,
      sourceMap: map,
    });
    if (typeof transformed === "string") {
      code = transformed;
    } else if (transformed !== null && typeof transformed === "object") {
      if (typeof transformed.javascript === "string") code = transformed.javascript;
      if (typeof transformed.sourceMap === "string") map = transformed.sourceMap;
    }
  }
  return { javascript: code, sourceMap: map };
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
function normalizePackageSubpath(specifier) {
  if (
    /^eliscript\/(?:runtime|platform|dist\/stdlib|stdlib)\//u.test(specifier) &&
    !/\.[a-z0-9]+$/iu.test(specifier)
  ) {
    return `${specifier}${OUTPUT_EXTENSION}`;
  }
  return specifier;
}

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
    const normalized = normalizePackageSubpath(specifier);
    node.value = normalized;
    const external = resolveExternal?.(normalized, source);
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
  if (options.optimize !== false) {
    optimizeProgramIr(program);
  }
  rewriteSpecifiers(program, filename, options.resolveExternal);
  const output = outputPathFor(filename);
  const emission = emit_ir_string_with_source_map(
    program,
    source,
    output,
    mapSourcePath(output, filename),
  );
  const rewritten = rewriteEmittedExternals(
    emission.javascript,
    filename,
    options.resolveExternal,
  );
  return applyPostCompileOptimization(
    rewritten,
    emission.sourceMap,
    { filename, output },
    options,
  );
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
  optimize = true,
  minify = false,
  closureCompiler,
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
      if (optimize !== false) {
        optimizeProgramIr(program);
      }
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
    const rewritten = rewriteEmittedExternals(emission.javascript, id, resolveExternal);
    const optimized = applyPostCompileOptimization(
      rewritten,
      emission.sourceMap,
      { filename: id, output },
      { optimize, minify, closureCompiler },
    );
    modules[output] = {
      id,
      source: files[id],
      javascript: optimized.javascript,
      sourceMap: optimized.sourceMap,
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

/**
 * Compiles one Eliscript module in memory and executes it immediately via a
 * temporary Blob URL.
 *
 * @param {string} source Eliscript source text
 * @param {string} [filename="module.eli"] virtual filename for diagnostics/maps
 * @param {object} [options={}] compilation options (e.g., resolveExternal)
 * @returns {Promise<{ module: object, javascript: string, sourceMap: string }>}
 */
export async function runSource(
  source,
  filename = `module${SOURCE_EXTENSION}`,
  options = {},
) {
  const compiled = compileSource(source, filename, options);
  const url = URL.createObjectURL(
    new Blob([compiled.javascript], { type: "text/javascript" }),
  );
  try {
    const module = await import(url);
    return {
      module,
      javascript: compiled.javascript,
      sourceMap: compiled.sourceMap,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scriptFilename(script, index) {
  const explicit = script?.getAttribute?.("data-filename") || script?.dataset?.filename;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    const name = explicit.trim();
    return name.endsWith(SOURCE_EXTENSION) ? name : `${name}${SOURCE_EXTENSION}`;
  }
  if (typeof script?.src === "string" && script.src.length > 0) {
    try {
      const url = new URL(script.src, globalThis.location?.href ?? "http://localhost/");
      const tail = url.pathname.split("/").filter(Boolean).pop();
      if (tail && tail.endsWith(SOURCE_EXTENSION)) return tail;
    } catch {}
  }
  return `inline-${index + 1}${SOURCE_EXTENSION}`;
}

/**
 * Scans a DOM root for `<script type="text/eliscript">` elements (both inline
 * and external `src="..."`) and compiles + executes each one in document order.
 *
 * @param {ParentNode} [root=globalThis.document]
 * @param {object} [options={}]
 * @returns {Promise<Array<{ script: Element, filename: string, module: object, javascript: string, sourceMap: string }>>}
 */
export async function mountEliscriptScripts(
  root = globalThis.document,
  options = {},
) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const scripts = Array.from(root.querySelectorAll('script[type="text/eliscript"]'));
  const mounted = [];
  for (let index = 0; index < scripts.length; index += 1) {
    const script = scripts[index];
    if (script.dataset?.eliscriptMounted === "true") continue;
    if (script.dataset) script.dataset.eliscriptMounted = "true";
    const filename = scriptFilename(script, index);
    let source = script.textContent ?? "";
    if (typeof script.src === "string" && script.src.length > 0) {
      const response = await fetchImpl(script.src);
      if (!response.ok) {
        throw failure(
          "ELI-BROWSER-0005",
          `failed to fetch ${script.src}: ${response.status}`,
          filename,
        );
      }
      source = await response.text();
    }
    const executed = await runSource(source, filename, options);
    mounted.push({
      script,
      filename,
      ...executed,
    });
  }
  return mounted;
}

export const browserHostSurface = Object.freeze({
  sourceExtension: SOURCE_EXTENSION,
  outputExtension: OUTPUT_EXTENSION,
});
