import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = resolve(import.meta.dir, "..");
const buildPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const projectBuildPath = resolve(projectDirectory, "bin/eliscript-build");
const seedBuildPath = resolve(projectDirectory, "bin/eliscript-seed-build");

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

test("self-hosted macros read only declared context files", async () => {
  const directory = await mkdtemp(resolve(projectDirectory, ".eliscript-macro-files-"));
  try {
    await run([buildPath], {
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: directory },
    });
    const compiler = await import(
      `${pathToFileURL(resolve(directory, "compiler.mjs")).href}?macro-files`
    );
    const source = `(defmacro configured-value ()
  (macro-read-file "build-value.txt"))
(defconst value (configured-value))
(export value)`;
    const context = {
      capabilities: new Set(["read-file"]),
      files: new Map([["build-value.txt", "forty-two"]]),
    };
    const program = compiler.compile_ir_string(
      source,
      "macro-context.eli",
      context,
    );
    expect(compiler.emit_ir_string(program)).toContain(
      'const value = "forty-two";',
    );
    expect(() => compiler.compile_ir_string(source, "macro-context.eli"))
      .toThrow("macro capability is not enabled: read-file");
    expect(() => compiler.compile_ir_string(source, "macro-context.eli", {
      capabilities: new Set(["read-file"]),
      files: new Map(),
    })).toThrow("macro file dependency is not declared: build-value.txt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("declared macro files drive deterministic project builds and cache invalidation", async () => {
  const directory = await mkdtemp(resolve(projectDirectory, ".eliscript-macro-project-"));
  try {
    const compilerDirectory = resolve(directory, "compiler");
    const sourceRoot = resolve(directory, "src");
    const entry = resolve(sourceRoot, "main.eli");
    const dependency = resolve(sourceRoot, "build-value.txt");
    const unusedDependency = resolve(sourceRoot, "unused.txt");
    const directOutput = resolve(directory, "direct");
    await mkdir(sourceRoot);
    await writeFile(entry, `(defmacro configured-value ()
  (macro-read-file "build-value.txt"))
(defconst value (configured-value))
(export value)\n`);
    await writeFile(dependency, "first-value");
    await writeFile(unusedDependency, "declared-but-unused");
    await run([buildPath], {
      env: { ...process.env, ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory },
    });
    const { buildProject } = await import("../bootstrap/host/project.mjs");
    const options = {
      entry,
      root: sourceRoot,
      outDir: directOutput,
      moduleDirectory: compilerDirectory,
      macroCapabilities: ["read-file"],
      macroFileDependencies: ["unused.txt", "build-value.txt"],
    };
    const first = await buildProject(options);
    expect(first.report.counts).toEqual({ modules: 1, compiled: 1, reused: 0 });
    expect(first.report.modules[0].macroDependencies).toEqual([
      {
        path: "build-value.txt",
        digest: createHash("sha256").update("first-value").digest("hex"),
      },
      {
        path: "unused.txt",
        digest: createHash("sha256").update("declared-but-unused").digest("hex"),
      },
    ]);
    const firstValue = await run([
      process.execPath,
      "--eval",
      `import(${JSON.stringify(pathToFileURL(resolve(directOutput, "main.mjs")).href)})` +
        ".then((module) => console.log(module.value))",
    ]);
    expect(firstValue.trim()).toBe("first-value");

    const second = await buildProject(options);
    expect(second.report.counts).toEqual({ modules: 1, compiled: 0, reused: 1 });
    await writeFile(dependency, "second-value");
    const third = await buildProject(options);
    expect(third.report.counts).toEqual({ modules: 1, compiled: 1, reused: 0 });
    expect(third.report.modules[0].reason).toBe("macro-dependencies-changed");
    expect(await readFile(resolve(directOutput, "main.mjs"), "utf8"))
      .toContain('const value = "second-value";');
    const thirdValue = await run([
      process.execPath,
      "--eval",
      `import(${JSON.stringify(pathToFileURL(resolve(directOutput, "main.mjs")).href)})` +
        ".then((module) => console.log(module.value))",
    ]);
    expect(thirdValue.trim()).toBe("second-value");

    const outside = resolve(directory, "outside.txt");
    const linked = resolve(sourceRoot, "linked.txt");
    await writeFile(outside, "outside");
    await symlink(outside, linked);
    await expect(buildProject({
      ...options,
      outDir: resolve(directory, "escape"),
      macroFileDependencies: ["linked.txt"],
    })).rejects.toThrow("macro file dependency escapes project root");

    const invalidUtf8 = resolve(sourceRoot, "invalid.txt");
    await writeFile(invalidUtf8, new Uint8Array([0xff]));
    await expect(buildProject({
      ...options,
      outDir: resolve(directory, "invalid-utf8"),
      macroFileDependencies: ["invalid.txt"],
    })).rejects.toThrow("macro file dependency is not valid UTF-8");

    const configuration = resolve(directory, "eliscript.json");
    await writeFile(configuration, `${JSON.stringify({
      schemaVersion: 1,
      sourceRoot: "src",
      entry: "main.eli",
      outDir: "self-hosted",
      portableEntries: [],
      macroCapabilities: ["read-file"],
      macroFileDependencies: ["unused.txt", "build-value.txt"],
      cache: false,
    })}\n`);
    const selfHostedOutput = resolve(directory, "self-hosted");
    const seedOutput = resolve(directory, "seed");
    await run([projectBuildPath, "--config", configuration], {
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      },
    });
    await run([
      seedBuildPath,
      "--config",
      configuration,
      "--out-dir",
      seedOutput,
    ]);
    for (const filename of ["main.mjs", "main.mjs.map"]) {
      expect(await readFile(resolve(seedOutput, filename)))
        .toEqual(await readFile(resolve(selfHostedOutput, filename)));
    }
    const selfManifest = JSON.parse(await readFile(
      resolve(selfHostedOutput, "eliscript-project.json"),
      "utf8",
    ));
    const seedManifest = JSON.parse(await readFile(
      resolve(seedOutput, "eliscript-project.json"),
      "utf8",
    ));
    const publicIdentity = ({ format, version, entry, modules, digest }) =>
      ({ format, version, entry, modules, digest });
    expect(publicIdentity(seedManifest)).toEqual(publicIdentity(selfManifest));
    expect(seedManifest.modules[0].macroDependencies).toEqual([
      {
        path: "build-value.txt",
        digest: createHash("sha256").update("second-value").digest("hex"),
      },
      {
        path: "unused.txt",
        digest: createHash("sha256").update("declared-but-unused").digest("hex"),
      },
    ]);
    const nodeValue = await run([
      "node",
      "--input-type=module",
      "--eval",
      `import(${JSON.stringify(pathToFileURL(resolve(seedOutput, "main.mjs")).href)})` +
        ".then((module) => console.log(module.value))",
    ]);
    expect(nodeValue.trim()).toBe("second-value");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
