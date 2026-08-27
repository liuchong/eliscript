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
