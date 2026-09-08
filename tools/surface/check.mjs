import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");

export class SurfaceValidationError extends Error {
  constructor(errors) {
    super(`Public surface validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "SurfaceValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split(/[\\/]/u).includes("..");
}

function sortedUniqueStrings(values, label, errors) {
  if (!Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || value.length === 0)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return [];
  }
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length) errors.push(`${label} contains duplicates`);
  if (JSON.stringify(sorted) !== JSON.stringify(values)) {
    errors.push(`${label} must be sorted`);
  }
  return sorted;
}

function compareInventory(label, expected, actual, errors) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = actual.filter((value) => !expectedSet.has(value));
  const stale = expected.filter((value) => !actualSet.has(value));
  if (missing.length > 0) {
    errors.push(`${label} is missing current entries: ${missing.join(", ")}`);
  }
  if (stale.length > 0) {
    errors.push(`${label} declares absent entries: ${stale.join(", ")}`);
  }
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function readSurfaceFile(root, relativePath, cache, errors) {
  if (!safeRelativePath(relativePath)) {
    errors.push(`unsafe surface path ${JSON.stringify(relativePath)}`);
    return "";
  }
  const filename = path.resolve(root, relativePath);
  try {
    if (!cache.has(filename)) cache.set(filename, await readFile(filename, "utf8"));
    return cache.get(filename);
  } catch (error) {
    errors.push(`${relativePath} cannot be read: ${error.message}`);
    return "";
  }
}

function validateSpec(specs, specId, label, errors) {
  const spec = specs.get(specId);
  if (!spec) {
    errors.push(`${label} references unknown specification ${specId}`);
  } else if (spec.implementation !== "implemented") {
    errors.push(`${label} references non-implemented specification ${specId}`);
  }
}

async function validateLanguage(root, language, specs, cache, errors) {
  if (!isPlainObject(language) || !Array.isArray(language.groups)) {
    errors.push("language groups must be an array");
    return { groups: 0, entries: 0 };
  }
  const ids = new Set();
  let entries = 0;
  for (const [index, group] of language.groups.entries()) {
    const label = `language group ${index}`;
    if (!isPlainObject(group)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (!/^[a-z][a-z0-9-]*$/u.test(group.id ?? "")) {
      errors.push(`${label} has invalid id ${JSON.stringify(group.id)}`);
    } else if (ids.has(group.id)) {
      errors.push(`duplicate language group ${group.id}`);
    }
    ids.add(group.id);
    validateSpec(specs, group.spec, group.id, errors);
    const names = sortedUniqueStrings(group.names, `${group.id} names`, errors);
    entries += names.length;
    const sources = sortedUniqueStrings(group.sources, `${group.id} sources`, errors);
    let combined = "";
    for (const source of sources) {
      combined += await readSurfaceFile(root, source, cache, errors);
    }
    if (group.verifyNames === true) {
      for (const name of names) {
        if (!combined.includes(name)) {
          errors.push(`${group.id} form ${JSON.stringify(name)} is absent from its sources`);
        }
      }
    } else if (group.verifyNames !== false) {
      errors.push(`${group.id} verifyNames must be true or false`);
    }
  }
  return { groups: language.groups.length, entries };
}

function extractIrKinds(source) {
  const match = source.match(
    /\(defconst eliscript-ir-node-kinds\s+'\(([\s\S]*?)\)\s+"Public/u,
  );
  return match?.[1].match(/[a-z][a-z0-9-]*/gu)?.sort() ?? [];
}

async function validateIr(root, ir, cache, errors) {
  if (!isPlainObject(ir)) {
    errors.push("ir surface must be an object");
    return 0;
  }
  const expected = sortedUniqueStrings(ir.nodeKinds, "IR node kinds", errors);
  const source = await readSurfaceFile(root, ir.source, cache, errors);
  compareInventory("IR node kind inventory", expected, extractIrKinds(source), errors);
  return expected.length;
}

function extractLongOptions(source) {
  return [...new Set(
    [...source.matchAll(/"(--[a-z][a-z-]*)"/gu)].map((match) => match[1]),
  )].sort();
}

async function validateCommands(root, commands, cache, errors) {
  if (!Array.isArray(commands)) {
    errors.push("commands must be an array");
    return { commands: 0, options: 0 };
  }
  const names = [];
  let optionCount = 0;
  for (const [index, command] of commands.entries()) {
    const label = `command ${index}`;
    if (!isPlainObject(command)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    names.push(command.name);
    const options = sortedUniqueStrings(command.options, `${command.name} options`, errors);
    optionCount += options.length;
    await readSurfaceFile(root, command.entry, cache, errors);
    const implementation = await readSurfaceFile(
      root, command.implementation, cache, errors,
    );
    compareInventory(
      `${command.name} option inventory`, options,
      extractLongOptions(implementation), errors,
    );
  }
  sortedUniqueStrings(names, "command names", errors);
  return { commands: commands.length, options: optionCount };
}

function extractJsExports(source) {
  const declarations = [...source.matchAll(
    /^export\s+(?:async\s+)?(?:function\s*\*?|const|class)\s+([A-Za-z_$][\w$]*)/gmu,
  )].map((match) => match[1]);
  const lists = [...source.matchAll(
    /^export\s*\{([^}]*)\}\s*(?:from\s*["'][^"']+["'])?\s*;?/gmu,
  )].flatMap((match) => match[1].split(",").map((entry) => {
    const parts = entry.trim().split(/\s+as\s+/u);
    return parts.at(-1)?.trim();
  }).filter(Boolean));
  const named = [...new Set([...declarations, ...lists])].sort();
  return { named, defaultExport: /^export\s+default\s+/mu.test(source) };
}

async function validateAdapters(root, adapters, specs, cache, errors) {
  if (!Array.isArray(adapters)) {
    errors.push("adapters must be an array");
    return { adapters: 0, exports: 0 };
  }
  const ids = [];
  let exportCount = 0;
  for (const [index, adapter] of adapters.entries()) {
    const label = `adapter ${index}`;
    if (!isPlainObject(adapter)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    ids.push(adapter.id);
    validateSpec(specs, adapter.spec, adapter.id, errors);
    const expected = sortedUniqueStrings(
      adapter.namedExports, `${adapter.id} named exports`, errors,
    );
    const source = await readSurfaceFile(root, adapter.file, cache, errors);
    const actual = extractJsExports(source);
    compareInventory(`${adapter.id} export inventory`, expected, actual.named, errors);
    if (adapter.defaultExport !== actual.defaultExport) {
      errors.push(`${adapter.id} default export does not match its implementation`);
    }
    exportCount += expected.length + (adapter.defaultExport ? 1 : 0);
  }
  sortedUniqueStrings(ids, "adapter ids", errors);
  return { adapters: adapters.length, exports: exportCount };
}

async function validatePlatformPackages(root, packages, specs, cache, errors) {
  if (!Array.isArray(packages)) {
    errors.push("platformPackages must be an array");
    return { packages: 0, exports: 0 };
  }
  const ids = [];
  let exportCount = 0;
  for (const [index, package_] of packages.entries()) {
    const label = `platform package ${index}`;
    if (!isPlainObject(package_)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    ids.push(package_.id);
    validateSpec(specs, package_.spec, package_.id, errors);
    if (package_.host !== "browser" && package_.host !== "worker") {
      errors.push(`${package_.id} has invalid platform host ${JSON.stringify(package_.host)}`);
    }
    const spec = specs.get(package_.spec);
    if (spec && package_.stability !== spec.status) {
      errors.push(
        `${package_.id} stability must match specification ${package_.spec} status ${spec.status}`,
      );
    }
    const expected = sortedUniqueStrings(
      package_.namedExports, `${package_.id} named exports`, errors,
    );
    const source = await readSurfaceFile(root, package_.file, cache, errors);
    const actual = extractJsExports(source);
    compareInventory(
      `${package_.id} export inventory`, expected, actual.named, errors,
    );
    if (package_.defaultExport !== actual.defaultExport) {
      errors.push(`${package_.id} default export does not match its implementation`);
    }
    exportCount += expected.length + (package_.defaultExport ? 1 : 0);
  }
  sortedUniqueStrings(ids, "platform package ids", errors);
  return { packages: packages.length, exports: exportCount };
}

async function validateRuntimeModules(root, modules, specs, cache, errors) {
  if (!Array.isArray(modules)) {
    errors.push("runtimeModules must be an array");
    return { modules: 0, exports: 0, public: 0, internal: 0 };
  }
  const ids = [];
  let exportCount = 0;
  let publicCount = 0;
  let internalCount = 0;
  for (const [index, module] of modules.entries()) {
    const label = `runtime module ${index}`;
    if (!isPlainObject(module)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    ids.push(module.id);
    validateSpec(specs, module.spec, module.id, errors);
    if (module.visibility === "public") {
      publicCount += 1;
    } else if (module.visibility === "internal") {
      internalCount += 1;
    } else {
      errors.push(`${module.id} has invalid visibility ${JSON.stringify(module.visibility)}`);
    }
    const expected = sortedUniqueStrings(
      module.namedExports, `${module.id} named exports`, errors,
    );
    const source = await readSurfaceFile(root, module.file, cache, errors);
    const actual = extractJsExports(source);
    compareInventory(`${module.id} export inventory`, expected, actual.named, errors);
    if (module.defaultExport !== actual.defaultExport) {
      errors.push(`${module.id} default export does not match its implementation`);
    }
    exportCount += expected.length + (module.defaultExport ? 1 : 0);
  }
  sortedUniqueStrings(ids, "runtime module ids", errors);
  return {
    modules: modules.length,
    exports: exportCount,
    public: publicCount,
    internal: internalCount,
  };
}

export function extractLibraryExports(source) {
  const start = source.lastIndexOf("(export");
  if (start < 0 || !/[\s)]/u.test(source[start + 7] ?? "")) return [];

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] !== ")") continue;
    depth -= 1;
    if (depth === 0) {
      return (source.slice(start + 7, index).match(/[^\s()]+/gu) ?? []).sort();
    }
  }
  return [];
}

async function validateStandardLibrary(root, modules, specs, cache, errors) {
  if (!Array.isArray(modules)) {
    errors.push("standardLibrary must be an array");
    return { modules: 0, exports: 0 };
  }
  const names = [];
  let exportCount = 0;
  for (const [index, module] of modules.entries()) {
    const label = `standard library module ${index}`;
    if (!isPlainObject(module)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    names.push(module.module);
    validateSpec(specs, module.spec, module.module, errors);
    const expected = sortedUniqueStrings(
      module.exports, `${module.module} exports`, errors,
    );
    const source = await readSurfaceFile(root, module.file, cache, errors);
    compareInventory(
      `${module.module} export inventory`, expected,
      extractLibraryExports(source), errors,
    );
    exportCount += expected.length;
  }
  sortedUniqueStrings(names, "standard library modules", errors);
  return { modules: modules.length, exports: exportCount };
}

async function elispFiles(root, relativeRoots, errors) {
  const files = [];
  for (const relativeRoot of relativeRoots) {
    if (!safeRelativePath(relativeRoot)) {
      errors.push(`unsafe Emacs root ${JSON.stringify(relativeRoot)}`);
      continue;
    }
    try {
      for (const entry of await readdir(path.resolve(root, relativeRoot))) {
        if (entry.endsWith(".el")) files.push(`${relativeRoot}/${entry}`);
      }
    } catch (error) {
      errors.push(`${relativeRoot} cannot be listed: ${error.message}`);
    }
  }
  return files.sort();
}

async function validateEmacs(root, emacs, cache, errors) {
  if (!isPlainObject(emacs)) {
    errors.push("emacs surface must be an object");
    return { functions: 0, records: 0 };
  }
  const roots = sortedUniqueStrings(emacs.roots, "Emacs roots", errors);
  const expectedFunctions = sortedUniqueStrings(
    emacs.publicFunctions, "Emacs public functions", errors,
  );
  const publicRecords = sortedUniqueStrings(
    emacs.records?.public, "Emacs public records", errors,
  );
  const internalRecords = sortedUniqueStrings(
    emacs.records?.internal, "Emacs internal records", errors,
  );
  const files = await elispFiles(root, roots, errors);
  const actualFunctions = [];
  const actualRecords = [];
  for (const file of files) {
    const source = await readSurfaceFile(root, file, cache, errors);
    for (const match of source.matchAll(
      /^\((?:cl-)?defun\s+(eliscript-[^\s()]+)/gmu,
    )) {
      if (!match[1].includes("--")) actualFunctions.push(match[1]);
    }
    for (const match of source.matchAll(
      /^\(define-(?:derived|compilation)-mode\s+(eliscript-[^\s()]+)/gmu,
    )) {
      if (!match[1].includes("--")) actualFunctions.push(match[1]);
    }
    for (const match of source.matchAll(
      /^\(cl-defstruct\s+\((eliscript-[^\s()]+)/gmu,
    )) {
      actualRecords.push(match[1]);
    }
  }
  compareInventory(
    "Emacs public function inventory", expectedFunctions,
    [...new Set(actualFunctions)].sort(), errors,
  );
  compareInventory(
    "Emacs record inventory", [...publicRecords, ...internalRecords].sort(),
    [...new Set(actualRecords)].sort(), errors,
  );
  const overlap = publicRecords.filter((name) => internalRecords.includes(name));
  if (overlap.length > 0) {
    errors.push(`Emacs records have conflicting visibility: ${overlap.join(", ")}`);
  }
  return {
    functions: expectedFunctions.length,
    records: publicRecords.length + internalRecords.length,
    publicRecords: publicRecords.length,
    internalRecords: internalRecords.length,
  };
}

async function validateSchemas(root, schemas, specs, cache, errors) {
  if (!Array.isArray(schemas)) {
    errors.push("schemas must be an array");
    return 0;
  }
  const ids = [];
  for (const [index, schema] of schemas.entries()) {
    const label = `schema ${index}`;
    if (!isPlainObject(schema)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    ids.push(schema.id);
    validateSpec(specs, schema.spec, schema.id, errors);
    if (typeof schema.format !== "string" || !Number.isInteger(schema.version)) {
      errors.push(`${schema.id} must declare a format and integer version`);
    }
    for (const evidence of schema.evidence ?? []) {
      const source = await readSurfaceFile(root, evidence.file, cache, errors);
      for (const locator of evidence.contains ?? []) {
        if (!source.includes(locator)) {
          errors.push(
            `${schema.id} locator ${JSON.stringify(locator)} is absent from ${evidence.file}`,
          );
        }
      }
    }
  }
  sortedUniqueStrings(ids, "schema ids", errors);
  return schemas.length;
}

async function validateDocumentation(root, documents, cache, errors) {
  if (!Array.isArray(documents)) {
    errors.push("documentation assertions must be an array");
    return;
  }
  for (const document of documents) {
    const source = await readSurfaceFile(root, document.file, cache, errors);
    for (const locator of document.mustContain ?? []) {
      if (!source.includes(locator)) {
        errors.push(`${document.file} is missing required text ${JSON.stringify(locator)}`);
      }
    }
    for (const locator of document.mustNotContain ?? []) {
      if (source.includes(locator)) {
        errors.push(`${document.file} retains stale text ${JSON.stringify(locator)}`);
      }
    }
  }
}

export async function checkPublicSurface(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  const cache = new Map();
  const surface = options.surface ??
    await readJson(path.join(root, "contracts/public-surface.json"));
  const specIndex = options.specIndex ??
    await readJson(path.join(root, "specs/index.json"));
  const specs = new Map(
    (specIndex.specifications ?? []).map((spec) => [spec.id, spec]),
  );

  if (!isPlainObject(surface) || surface.schemaVersion !== 1) {
    throw new SurfaceValidationError(["public surface must use schemaVersion 1"]);
  }

  const language = await validateLanguage(
    root, surface.language, specs, cache, errors,
  );
  const irNodeKinds = await validateIr(root, surface.ir, cache, errors);
  const commands = await validateCommands(root, surface.commands, cache, errors);
  const schemas = await validateSchemas(
    root, surface.schemas, specs, cache, errors,
  );
  const adapters = await validateAdapters(
    root, surface.adapters, specs, cache, errors,
  );
  const platformPackages = await validatePlatformPackages(
    root, surface.platformPackages, specs, cache, errors,
  );
  const runtimeModules = await validateRuntimeModules(
    root, surface.runtimeModules, specs, cache, errors,
  );
  const standardLibrary = await validateStandardLibrary(
    root, surface.standardLibrary, specs, cache, errors,
  );
  const emacs = await validateEmacs(root, surface.emacs, cache, errors);
  await validateDocumentation(root, surface.documentation, cache, errors);

  if (errors.length > 0) throw new SurfaceValidationError(errors);

  return {
    schemaVersion: 1,
    language,
    ir: { nodeKinds: irNodeKinds },
    commands,
    schemas: { total: schemas },
    adapters,
    platformPackages,
    runtimeModules,
    standardLibrary,
    emacs,
  };
}

export function humanSurfaceReport(report) {
  return [
    "Public surface matrix:",
    `  Language       ${report.language.groups} groups / ${report.language.entries} entries`,
    `  IR             ${report.ir.nodeKinds} node kinds`,
    `  Commands       ${report.commands.commands} commands / ${report.commands.options} options`,
    `  Schemas        ${report.schemas.total} versioned schemas`,
    `  Adapters       ${report.adapters.adapters} adapters / ${report.adapters.exports} exports`,
    `  Platform       ${report.platformPackages.packages} packages / ${report.platformPackages.exports} exports`,
    `  Runtime        ${report.runtimeModules.modules} modules / ${report.runtimeModules.exports} exports`,
    `  Standard lib   ${report.standardLibrary.modules} modules / ${report.standardLibrary.exports} exports`,
    `  Emacs API      ${report.emacs.functions} functions / ${report.emacs.records} records`,
  ].join("\n");
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--json");
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}`);
    process.exitCode = 2;
  } else {
    try {
      const report = await checkPublicSurface();
      console.log(
        process.argv.includes("--json")
          ? JSON.stringify(report)
          : humanSurfaceReport(report),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
