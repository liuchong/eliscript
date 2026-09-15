import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPublicSurface } from "./check.mjs";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");
const METADATA_FILE = "contracts/library-api.json";
const SURFACE_FILE = "contracts/public-surface.json";
const SPEC_INDEX_FILE = "specs/index.json";
const JSON_OUTPUT = "docs/pages/api-index.json";
const HTML_OUTPUT = "docs/pages/api.html";
const ROLES = new Map([
  ["portable", "Portable libraries"],
  ["runtime-core", "Runtime core"],
  ["host-interop", "Host interoperation"],
  ["state", "State"],
]);

export class ApiIndexValidationError extends Error {
  constructor(errors) {
    super(`Library API metadata validation failed:\n${errors
      .map((error) => `- ${error}`)
      .join("\n")}`);
    this.name = "ApiIndexValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function exactSortedNames(values) {
  return [...new Set(values)].sort();
}

function compareNames(label, expected, actual, errors) {
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

export async function buildApiIndex(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const metadata = options.metadata ??
    await readJson(path.join(root, METADATA_FILE));
  const surface = options.surface ??
    await readJson(path.join(root, SURFACE_FILE));
  const specIndex = options.specIndex ??
    await readJson(path.join(root, SPEC_INDEX_FILE));
  const errors = [];

  await checkPublicSurface({ root, surface, specIndex });
  if (!isPlainObject(metadata) || metadata.schemaVersion !== 1 ||
      metadata.format !== "eliscript-library-api-metadata" ||
      metadata.version !== 1) {
    errors.push("library API metadata must use eliscript-library-api-metadata version 1");
  }
  const modules = Array.isArray(metadata?.modules) ? metadata.modules : [];
  if (!Array.isArray(metadata?.modules)) {
    errors.push("library API modules must be an array");
  }
  const surfaceModules = new Map(
    surface.standardLibrary.map((module) => [module.module, module]),
  );
  const specs = new Map(
    specIndex.specifications.map((spec) => [spec.id, spec]),
  );
  const names = modules.map((module) => module?.module);
  const validNames = names.filter(
    (name) => typeof name === "string" && name.length > 0 && name.trim() === name,
  );
  if (JSON.stringify(validNames) !== JSON.stringify(exactSortedNames(validNames))) {
    errors.push("library API modules must be unique and sorted by module name");
  }
  compareNames(
    "library API module inventory",
    exactSortedNames(names.filter((name) => typeof name === "string")),
    [...surfaceModules.keys()].sort(),
    errors,
  );

  const generatedModules = [];
  for (const [index, module] of modules.entries()) {
    const label = `library API module ${index}`;
    if (!isPlainObject(module)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof module.module !== "string" || module.module.length === 0 ||
        module.module.trim() !== module.module) {
      errors.push(`${label} must have a non-empty trimmed module name`);
      continue;
    }
    const surfaceModule = surfaceModules.get(module.module);
    const spec = specs.get(module.spec);
    if (!surfaceModule) continue;
    if (module.source !== surfaceModule.file) {
      errors.push(`${module.module} source must match ${surfaceModule.file}`);
    }
    if (module.spec !== surfaceModule.spec) {
      errors.push(`${module.module} specification must match ${surfaceModule.spec}`);
    }
    if (!spec) {
      errors.push(`${module.module} references unknown specification ${module.spec}`);
    } else {
      if (spec.implementation !== "implemented") {
        errors.push(`${module.module} references non-implemented specification ${module.spec}`);
      }
      if (module.stability !== spec.status) {
        errors.push(
          `${module.module} stability must match specification ${module.spec} status ${spec.status}`,
        );
      }
    }
    if (!ROLES.has(module.role)) {
      errors.push(`${module.module} has invalid role ${JSON.stringify(module.role)}`);
    }
    if (typeof module.summary !== "string" || module.summary.trim() !== module.summary ||
        module.summary.length === 0) {
      errors.push(`${module.module} must have a non-empty trimmed summary`);
    }
    generatedModules.push({
      module: module.module,
      source: module.source,
      spec: module.spec,
      specFile: spec?.file ?? "",
      stability: module.stability,
      role: module.role,
      summary: module.summary,
      exports: [...surfaceModule.exports],
    });
  }

  if (errors.length > 0) throw new ApiIndexValidationError(errors);
  return {
    format: "eliscript-library-api-index",
    version: 1,
    moduleCount: generatedModules.length,
    exportCount: generatedModules.reduce(
      (count, module) => count + module.exports.length,
      0,
    ),
    modules: generatedModules,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderApiJson(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function renderModule(module) {
  const searchable = [
    module.module,
    module.summary,
    module.role,
    ...module.exports,
  ].join(" ").toLowerCase();
  return `            <article class="api-module" data-api-module data-api-searchable="${escapeHtml(searchable)}">
              <header class="api-module-header">
                <div><p class="api-module-path">${escapeHtml(module.source)}</p><h3>${escapeHtml(module.module)}</h3></div>
                <span class="status status-next">${escapeHtml(module.stability)}</span>
              </header>
              <p>${escapeHtml(module.summary)}</p>
              <p class="api-module-meta"><a href="https://github.com/liuchong/eliscript/blob/master/${escapeHtml(module.source)}">Source</a><a href="https://github.com/liuchong/eliscript/blob/master/${escapeHtml(module.specFile)}" data-spec-link="${escapeHtml(module.spec)}">Specification ${escapeHtml(module.spec)}</a></p>
              <ul class="api-export-list" aria-label="${escapeHtml(module.module)} exports">${module.exports
                .map((name) => `<li><code>${escapeHtml(name)}</code></li>`)
                .join("")}</ul>
            </article>`;
}

function renderSection(role, title, modules) {
  return `          <section id="${escapeHtml(role)}" data-api-section>
            <h2>${escapeHtml(title)}</h2>
            <p>${modules.length} modules, ${modules.reduce((count, module) => count + module.exports.length, 0)} exports.</p>
${modules.map(renderModule).join("\n")}
          </section>`;
}

export function renderApiHtml(index) {
  const sections = [...ROLES].map(([role, title]) =>
    renderSection(
      role,
      title,
      index.modules.filter((module) => module.role === role),
    ));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="The generated Eliscript standard-library module and export index.">
    <meta name="theme-color" content="#f2f0e8">
    <title>Library API · Eliscript</title>
    <link rel="icon" type="image/png" href="assets/favicon.png">
    <link rel="apple-touch-icon" href="assets/eliscript-logo.png">
    <link rel="stylesheet" href="assets/site.css">
    <!-- The page's behaviours are Eliscript: this loader compiles the source
         it names and runs the result. Nothing here is handwritten JavaScript. -->
    <script defer src="assets/eliscript-loader.js"
            data-eliscript="site.eli"></script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <nav class="nav-shell" aria-label="Primary navigation">
        <a class="brand" href="../index.html"><img class="brand-mark" src="assets/eliscript-logo.png" alt=""><span>Eliscript</span></a>
        <div class="nav-links">
          <a href="getting-started.html">Start</a>
          <a href="language.html">Language</a>
          <a href="api.html" aria-current="page">API</a>
          <a class="nav-optional" href="specifications.html">Specs</a>
          <a class="nav-optional" href="roadmap.html">Roadmap</a>
          <a class="nav-optional" href="playground.html">Playground</a>
          <a href="https://github.com/liuchong/eliscript">GitHub</a>
        </div>
      </nav>
    </header>

    <main id="main">
      <header class="doc-hero">
        <div class="doc-hero-inner">
          <p class="eyebrow">Library API</p>
          <h1>One exact index for every library export.</h1>
          <p class="doc-lede">${index.moduleCount} modules and ${index.exportCount} exports, generated from reviewed module metadata and the checked public surface.</p>
        </div>
      </header>

      <div class="doc-shell">
        <nav class="doc-nav" aria-label="On this page">
          <p class="doc-nav-title">Library groups</p>
          ${[...ROLES].map(([role, title]) => `<a href="#${role}">${escapeHtml(title)}</a>`).join("\n          ")}
          <a href="api-index.json">Machine-readable index</a>
        </nav>

        <article class="doc-content">
          <div class="api-toolbar">
            <input class="api-search" type="search" data-api-search aria-label="Search modules and exports" placeholder="Search modules and exports">
            <p class="api-search-count" aria-live="polite" data-api-count>${index.moduleCount} modules</p>
          </div>
${sections.join("\n")}
          <p class="api-empty" data-api-empty hidden>No matching modules.</p>
        </article>
      </div>
    </main>

    <footer class="site-footer"><div class="footer-shell"><p>Eliscript · Library API</p><div class="footer-links"><a href="language.html">Language</a><a href="https://github.com/liuchong/eliscript/blob/master/LICENSE">GPL-3.0+</a><a href="https://github.com/liuchong/eliscript">GitHub</a><span>© <span data-year>2026</span></span></div></div></footer>
  </body>
</html>
`;
}

export async function generateApiArtifacts(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const outputRoot = path.resolve(options.outputRoot ?? root);
  const index = await buildApiIndex({ ...options, root });
  const artifacts = new Map([
    [JSON_OUTPUT, renderApiJson(index)],
    [HTML_OUTPUT, renderApiHtml(index)],
  ]);
  const stale = [];
  for (const [relativePath, content] of artifacts) {
    const filename = path.join(outputRoot, relativePath);
    if (options.check) {
      let existing;
      try {
        existing = await readFile(filename, "utf8");
      } catch {
        existing = undefined;
      }
      if (existing !== content) stale.push(relativePath);
    } else {
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, content, "utf8");
    }
  }
  if (stale.length > 0) {
    throw new ApiIndexValidationError([
      `generated API artifacts are stale: ${stale.join(", ")}`,
    ]);
  }
  return { index, files: [...artifacts.keys()] };
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  const unknown = arguments_.filter((argument) => argument !== "--check");
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}`);
    process.exitCode = 2;
  } else {
    try {
      const result = await generateApiArtifacts({
        check: arguments_.includes("--check"),
      });
      console.log(
        `${result.index.moduleCount} modules / ${result.index.exportCount} exports; ` +
        `${arguments_.includes("--check") ? "verified" : "generated"} ${result.files.join(", ")}`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
