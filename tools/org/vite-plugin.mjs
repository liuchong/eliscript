import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const orgModuleId = "virtual:eliscript-org";
const resolvedOrgModuleId = `\0${orgModuleId}`;
const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPublisher = resolve(pluginDirectory, "../../bin/eliscript-org");

function runPublisher(command, arguments_, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }

      const reason = stderr.trim() || stdout.trim() ||
        `publisher exited with ${signal ? `signal ${signal}` : `code ${code}`}`;
      rejectPromise(new Error(reason));
    });
  });
}

async function listOrgFiles(directory) {
  const files = [];

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && extname(entry.name) === ".org") {
        files.push(path);
      }
    }
  }

  await visit(directory);
  return files;
}

function isContentFile(file, contentDirectory) {
  const path = relative(contentDirectory, resolve(file));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) &&
    extname(path) === ".org";
}

export async function compileOrgDirectory(contentDirectory, options = {}) {
  const directory = resolve(contentDirectory);
  const publisher = resolve(options.publisher ?? defaultPublisher);
  const arguments_ = [
    ...(options.includeDrafts ? ["--include-drafts"] : []),
    directory,
  ];
  const environment = {
    ...process.env,
    ...(options.emacs ? { EMACS: options.emacs } : {}),
  };

  return runPublisher(publisher, arguments_, {
    cwd: directory,
    env: environment,
  });
}

export function eliscriptOrg(options = {}) {
  if (!options.contentDirectory) {
    throw new Error("eliscriptOrg requires contentDirectory");
  }

  const contentDirectory = resolve(options.contentDirectory);

  return {
    name: "eliscript-org",

    configureServer(server) {
      server.watcher.add(contentDirectory);
    },

    async buildStart() {
      this.addWatchFile(contentDirectory);
      for (const file of await listOrgFiles(contentDirectory)) {
        this.addWatchFile(file);
      }
    },

    resolveId(id) {
      return id === orgModuleId ? resolvedOrgModuleId : null;
    },

    async load(id) {
      if (id !== resolvedOrgModuleId) {
        return null;
      }

      for (const file of await listOrgFiles(contentDirectory)) {
        this.addWatchFile(file);
      }
      return compileOrgDirectory(contentDirectory, options);
    },

    handleHotUpdate(context) {
      if (!isContentFile(context.file, contentDirectory)) {
        return undefined;
      }

      const module = context.server.moduleGraph.getModuleById(
        resolvedOrgModuleId,
      );
      if (!module) {
        return [];
      }

      context.server.moduleGraph.invalidateModule(module);
      return [module];
    },
  };
}

export default eliscriptOrg;
