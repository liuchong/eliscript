import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const defaultCompiler = resolve(pluginDirectory, "../../bin/eliscript");

function cleanModuleId(id) {
  const queryIndex = id.search(/[?#]/);
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

function matchesInclude(id, include) {
  if (typeof include === "function") {
    return include(id);
  }

  include.lastIndex = 0;
  return include.test(id);
}

function runCompiler(command, arguments_, options) {
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
        resolvePromise({ stdout, stderr });
        return;
      }

      const reason = stderr.trim() || stdout.trim() ||
        `compiler exited with ${signal ? `signal ${signal}` : `code ${code}`}`;
      rejectPromise(new Error(reason));
    });
  });
}

export async function compileEliscript(inputFile, options = {}) {
  const sourceFile = resolve(inputFile);
  const compiler = resolve(options.compiler ?? defaultCompiler);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "eliscript-vite-"));
  const outputFile = join(temporaryDirectory, `${basename(sourceFile)}.mjs`);
  const environment = {
    ...process.env,
    ...(options.emacs ? { EMACS: options.emacs } : {}),
  };

  try {
    await runCompiler(
      compiler,
      ["--source-map", "--output", outputFile, sourceFile],
      { cwd: dirname(sourceFile), env: environment },
    );

    const [source, generated, encodedMap] = await Promise.all([
      readFile(sourceFile, "utf8"),
      readFile(outputFile, "utf8"),
      readFile(`${outputFile}.map`, "utf8"),
    ]);
    const map = JSON.parse(encodedMap);
    map.file = basename(sourceFile);
    map.sources = [sourceFile];
    map.sourcesContent = [source];

    return {
      code: generated.replace(
        /\n?\/\/# sourceMappingURL=[^\n]*\n?$/,
        "\n",
      ),
      map,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function eliscript(options = {}) {
  const include = options.include ?? /\.eli$/;

  return {
    name: "eliscript",
    enforce: "pre",

    async transform(_source, id) {
      const sourceFile = cleanModuleId(id);
      if (!matchesInclude(sourceFile, include)) {
        return null;
      }

      this.addWatchFile(sourceFile);
      return compileEliscript(sourceFile, options);
    },
  };
}

export default eliscript;
