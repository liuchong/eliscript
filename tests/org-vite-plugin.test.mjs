import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  compileOrgDirectory,
  eliscriptOrg,
  orgModuleId,
} from "../tools/org/vite-plugin.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const contentDirectory = resolve(
  projectDirectory,
  "examples/org-site/content",
);

test("Org Vite adapter emits deterministic published content", async () => {
  const first = await compileOrgDirectory(contentDirectory);
  const second = await compileOrgDirectory(contentDirectory);

  expect(first).toBe(second);
  expect(first).toContain("Emacs is the compiler host");
  expect(first).toContain("emacs-compiler-host-section-1");
  expect(first).toContain("A Lisp-shaped publishing pipeline");
  expect(first).not.toContain("An unpublished note");
});

test("Org Vite adapter resolves, watches, and reloads its virtual module", async () => {
  const plugin = eliscriptOrg({ contentDirectory });
  const watchedFiles = [];
  await plugin.buildStart.call({
    addWatchFile(file) {
      watchedFiles.push(file);
    },
  });

  const resolvedId = plugin.resolveId(orgModuleId);
  const code = await plugin.load.call(
    {
      addWatchFile(file) {
        watchedFiles.push(file);
      },
    },
    resolvedId,
  );
  const virtualModule = { id: resolvedId };
  let invalidatedModule;
  const hotModules = plugin.handleHotUpdate({
    file: resolve(contentDirectory, "compiler-host.org"),
    server: {
      moduleGraph: {
        getModuleById(id) {
          return id === resolvedId ? virtualModule : undefined;
        },
        invalidateModule(module) {
          invalidatedModule = module;
        },
      },
    },
  });

  expect(resolvedId).toBe(`\0${orgModuleId}`);
  expect(code).toContain("export default articles");
  expect(watchedFiles).toContain(contentDirectory);
  expect(watchedFiles).toContain(
    resolve(contentDirectory, "compiler-host.org"),
  );
  expect(invalidatedModule).toBe(virtualModule);
  expect(hotModules).toEqual([virtualModule]);
  expect(
    plugin.handleHotUpdate({
      file: resolve(projectDirectory, "README.md"),
      server: {},
    }),
  ).toBeUndefined();
});

test("Org Vite adapter requires a content directory", () => {
  expect(() => eliscriptOrg()).toThrow("requires contentDirectory");
});
