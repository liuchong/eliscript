import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { eliscript } from "../tools/vite/index.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const componentFile = resolve(
  projectDirectory,
  "examples/react-counter/main.eli",
);

test("Vite remains an application adapter outside language core", async () => {
  const forbiddenImport = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:vite|@vitejs\/|react(?:-dom)?(?:\/[^"']*)?)["']/;
  const forbiddenCoreSyntax = /\b(?:defcomponent|jsx|react-element|react-fragment)\b/iu;
  for (const root of ["bootstrap/compiler", "compiler", "runtime", "stdlib"]) {
    const glob = new Bun.Glob("**/*.{el,eli,mjs}");
    for await (const file of glob.scan({
      cwd: resolve(projectDirectory, root),
      onlyFiles: true,
    })) {
      const source = await readFile(resolve(projectDirectory, root, file), "utf8");
      expect(source).not.toMatch(forbiddenImport);
      expect(source).not.toMatch(forbiddenCoreSyntax);
    }
  }

  const packageJson = JSON.parse(await readFile(
    resolve(projectDirectory, "package.json"),
    "utf8",
  ));
  expect(packageJson.dependencies?.vite).toBeUndefined();
  expect(packageJson.dependencies?.["@vitejs/plugin-react"]).toBeUndefined();
  expect(packageJson.dependencies?.react).toBeUndefined();
  expect(packageJson.dependencies?.["react-dom"]).toBeUndefined();
  expect(packageJson.devDependencies?.react).toBeDefined();
  expect(packageJson.devDependencies?.["react-dom"]).toBeDefined();
  expect(packageJson.devDependencies?.vite).toBeDefined();
});

test("Vite adapter compiles .eli modules with source maps", async () => {
  const source = await readFile(componentFile, "utf8");
  const watchedFiles = [];
  const plugin = eliscript();
  const result = await plugin.transform.call(
    {
      addWatchFile(file) {
        watchedFiles.push(file);
      },
    },
    source,
    `${componentFile}?direct`,
  );

  expect(result.code).toContain('from "react/jsx-runtime"');
  expect(result.code).not.toContain("__eliscript_react");
  expect(result.code).toContain("function Counter(props)");
  expect(result.code).not.toContain("sourceMappingURL");
  expect(result.map.version).toBe(3);
  expect(result.map.sources).toEqual([componentFile]);
  expect(result.map.sourcesContent).toEqual([source]);
  expect(result.map.mappings.length).toBeGreaterThan(0);
  expect(watchedFiles).toEqual([componentFile]);
});

test("Vite adapter ignores non-Eliscript modules", async () => {
  const plugin = eliscript();
  const result = await plugin.transform.call(
    { addWatchFile() {} },
    "export const answer = 42;",
    resolve(projectDirectory, "answer.js"),
  );

  expect(result).toBeNull();
});

test(
  "Vite development transform adds a React Refresh boundary",
  async () => {
    const server = await createServer({
      configFile: resolve(
        projectDirectory,
        "examples/react-counter/vite.config.mjs",
      ),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
    });

    try {
      const result = await server.transformRequest("/main.eli");
      expect(result.code).toContain("$RefreshSig$");
      expect(result.code).toContain("$RefreshReg$");
      expect(result.code).toContain("import.meta.hot.accept");
      expect(result.code).toContain("function Counter(props)");
    } finally {
      await server.close();
    }
  },
  15_000,
);
