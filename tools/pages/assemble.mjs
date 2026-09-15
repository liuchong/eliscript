// Assembles the published documentation site.
//
// The site lives under `docs/`, and the browser playground in it loads the
// compiler, the runtime, and the compile host from the repository root two
// levels above the page. Publishing only `docs/` would therefore ship a page
// whose imports cannot resolve, so the artifact keeps the repository shape for
// exactly the trees the site needs.
//
// The layout is a test-verified contract rather than a deployment detail:
// `tests/pages-assembly.test.mjs` assembles the artifact and resolves every
// reference the playground page carries.

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Trees the published site needs, relative to the repository root.
 *
 * - the documentation site is the artifact root.
 * - `runtime` and `platform` are what the playground page and compiled output
 *   import.
 * - `browser` is the compile host and its worker.
 * - `dist/browser` is the bundled compiler the worker loads.
 * - `dist/browser-playground` is the compiled playground application.
 * - `examples/dogfood/_site` is the generated proving-ground site.
 */
export const SITE_SOURCE = "docs";

export const PUBLISHED_TREES = Object.freeze([
  "runtime",
  "platform",
  "browser",
  "dist/browser",
  "dist/browser-playground",
  "examples/dogfood/_site",
]);

/**
 * References a page uses to reach the repository root. The site's pages move
 * one level up when they are published, so each of these loses one `../`.
 * Only attribute and import-map positions are rewritten: a shell command in
 * prose that happens to contain `../../` is not a reference.
 */
export const ROOT_REFERENCES = Object.freeze([
  ['"eliscript/": "../../"', '"eliscript/": "../"'],
  ['src="../../', 'src="../'],
  ['href="../../', 'href="../'],
  // A page may also reach the root from a dynamic import, which is neither an
  // attribute nor the import map. `language.html` shows `(import "../../…")`
  // inside code samples, which is source text rather than a reference, so the
  // pattern names the call.
  ['import("../../', 'import("../'],
]);

/**
 * Rewrites the page references that pointed at the repository root, and stamps
 * the site's own assets with their content digest. GitHub Pages serves a
 * stylesheet with a ten-minute lifetime, so without the stamp a reader can
 * keep seeing the previous sheet long after a deployment replaced it, which
 * looks exactly like a layout that was never fixed.
 */
export function rebasePage(html, assetVersions = new Map()) {
  let result = html;
  for (const [from, to] of ROOT_REFERENCES) result = result.split(from).join(to);
  for (const [asset, version] of assetVersions) {
    result = result.split(`assets/${asset}`).join(`assets/${asset}?v=${version}`);
  }
  return result;
}

/** The script the site runs, compiled from Eliscript rather than written by hand. */
export const SITE_SCRIPT = "dist/docs-site/site.js";

/** The digests that stamp the site's own stylesheet and script. */
export async function assetVersions({ root, siteDirectory }) {
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const versions = new Map();
  versions.set("site.css", digest(await readFile(resolve(siteDirectory, "pages/assets/site.css"))));
  versions.set("site.js", digest(await readFile(resolve(root, SITE_SCRIPT))));
  return versions;
}

/**
 * Single files the published site carries. The playground page links to the
 * playground's own README, so the file it names has to be there.
 */
export const PUBLISHED_FILES = Object.freeze([
  "LICENSE",
  "examples/browser-playground/README.md",
]);

/**
 * Copies the documentation site to the artifact root and the trees it loads
 * beside it, replacing whatever was there.
 *
 * @returns {Promise<{ trees: string[], files: string[] }>}
 */
export async function assemblePages({ root, outDir }) {
  const source = resolve(root);
  const target = resolve(outDir);
  if (target === source || source.startsWith(`${target}/`)) {
    throw new Error(`refusing to assemble into the source tree: ${outDir}`);
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  // The site's script is a build artifact: the repository keeps its Eliscript
  // source and publishes the compiled script, so the site cannot drift from
  // the language it documents.
  const script = resolve(source, SITE_SCRIPT);
  if (!(await exists(script))) {
    throw new Error(
      `the site script is not built: run \`bun run build:docs-site\` (${SITE_SCRIPT})`,
    );
  }
  const versions = await assetVersions({ root: source, siteDirectory: resolve(source, SITE_SOURCE) });
  await copySite(resolve(source, SITE_SOURCE), target, versions);
  await mkdir(resolve(target, "pages/assets"), { recursive: true });
  await writeFile(resolve(target, "pages/assets/site.js"), await readFile(script));
  // The supporting trees are copied into the same directory, so a site entry
  // that shares a name with one of them would be silently replaced.
  for (const entry of PUBLISHED_TREES) {
    if (await exists(resolve(target, entry))) {
      throw new Error(`site entry collides with published tree: ${entry}`);
    }
  }
  for (const entry of PUBLISHED_TREES) {
    const destination = resolve(target, entry);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(source, entry), destination, { recursive: true });
  }
  for (const entry of PUBLISHED_FILES) {
    await mkdir(dirname(resolve(target, entry)), { recursive: true });
    await cp(resolve(source, entry), resolve(target, entry));
  }
  return { trees: [SITE_SOURCE, ...PUBLISHED_TREES], files: [...PUBLISHED_FILES] };
}

/** Copies one directory into another, rebasing the HTML it contains. */
async function copySite(from, to, versions) {
  const { readdir } = await import("node:fs/promises");
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const child = resolve(from, entry.name);
    const destination = resolve(to, entry.name);
    if (entry.isDirectory()) {
      await copySite(child, destination, versions);
    } else if (entry.name.endsWith(".html")) {
      await writeFile(destination, rebasePage(await readFile(child, "utf8"), versions));
    } else {
      await cp(child, destination, { recursive: true });
    }
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  const options = { root: ".", out: "dist/pages" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root" || argument === "--out") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a path`);
      options[argument === "--root" ? "root" : "out"] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  return options;
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await assemblePages({ root: options.root, outDir: options.out });
    process.stdout.write(
      `Pages artifact: ${result.trees.length} trees, ${result.files.length} files ` +
      `into ${resolve(options.out)}\n`,
    );
  } catch (error) {
    process.stderr.write(`assemble: ${error.message}\n`);
    process.exitCode = 1;
  }
}
