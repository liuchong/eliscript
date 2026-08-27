import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eliscriptOrg } from "../../tools/org/vite-plugin.mjs";
import { eliscript } from "../../tools/vite/index.mjs";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const contentDirectory = resolve(exampleDirectory, "content");
const outputDirectory = process.env.ELISCRIPT_BUILD_OUT_DIR
  ? resolve(process.env.ELISCRIPT_BUILD_OUT_DIR)
  : resolve(repositoryDirectory, "dist/org-site");

export default defineConfig({
  root: exampleDirectory,
  plugins: [
    eliscript(),
    eliscriptOrg({ contentDirectory }),
    react({ include: /\.(?:[jt]sx?|eli)$/ }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repositoryDirectory],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    sourcemap: true,
  },
});
