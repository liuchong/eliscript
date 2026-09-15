import { expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The site's script is a build artifact rather than a source file.
const GENERATED_ASSETS = Object.freeze(["assets/eliscript-loader.js", "pages/assets/eliscript-loader.js"]);
const SITE_FILES = [
  "docs/index.html",
  "docs/pages/api.html",
  "docs/pages/getting-started.html",
  "docs/pages/language.html",
  "docs/pages/playground.html",
  "docs/pages/publishing.html",
  "docs/pages/roadmap.html",
  "docs/pages/specifications.html",
];

function attributes(source, name) {
  const pattern = new RegExp(`\\s${name}="([^"]+)"`, "gu");
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function localReference(value) {
  return !value.startsWith("#") &&
    !value.startsWith("data:") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(value);
}

test("Pages site has complete local navigation and assets", async () => {
  const sources = new Map();
  for (const file of SITE_FILES) {
    sources.set(file, await readFile(path.join(ROOT, file), "utf8"));
  }

  for (const [file, source] of sources) {
    const ids = new Set(attributes(source, "id"));
    expect(source).toContain("<meta name=\"viewport\"");
    expect(source).toContain("specifications.html");
    expect(source).toContain("data-year");

    for (const reference of [
      ...attributes(source, "href"),
      ...attributes(source, "src"),
    ]) {
      if (reference.startsWith("#")) {
        expect(ids.has(reference.slice(1))).toBe(true);
        continue;
      }
      if (!localReference(reference)) continue;
      const target = reference.split(/[?#]/u, 1)[0];
      if (GENERATED_ASSETS.includes(target)) {
        // The loader is compiled from Eliscript by `bun run build:docs-site`
        // and published by the assembler, so it is not a file in the source
        // tree. The page names the source it compiles, and that file is
        // checked below.
        const declared = attributes(source, "data-eliscript");
        expect(declared.length).toBeGreaterThan(0);
        for (const candidate of declared) {
          await access(path.resolve(ROOT, path.dirname(file), candidate));
        }
        continue;
      }
      await access(path.resolve(ROOT, path.dirname(file), target));
    }
  }
});

test("Pages site presents the current core status", async () => {
  const combined = (await Promise.all(SITE_FILES.map((file) =>
    readFile(path.join(ROOT, file), "utf8")))).join("\n");

  expect(combined).toContain("35/35");
  expect(combined).toContain("584");
  expect(combined).toContain("Persistent collections");
  expect(combined).toContain("General automatic tail-call optimization");
  expect(combined).not.toContain("M0 through M5 are complete");
  expect(combined).not.toContain("Lists and vectors currently share an array representation");
  expect(combined).not.toContain("29-module API index");
  expect(combined).not.toContain("M13</span><div><h3>Real-world proof</h3>");
});
