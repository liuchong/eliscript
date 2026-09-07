import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildProject } from "../bootstrap/host/project.mjs";
import { parseConfigurationJson } from "../bootstrap/host/project-cli.mjs";
import {
  workerCapabilities,
  workerCapabilityDescriptor,
  workerProgress,
} from "../platform/worker.mjs";

const ROOT = resolve(import.meta.dir, "..");
const BOOTSTRAP = resolve(ROOT, "bin/eliscript-bootstrap");
const COMPILER = resolve(ROOT, "bin/eliscript");
const SEED_BUILD = resolve(ROOT, "bin/eliscript-seed-build");
const PROJECT_HOST = pathToFileURL(resolve(ROOT, "bootstrap/host/project.mjs")).href;
const WORKER = resolve(ROOT, "runtime/worker.mjs");
const NODE = process.env.NODE ?? "node";

let directory;
let compilerDirectory;
let compiler;

async function runResult(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function runSuccessful(command, options = {}) {
  const result = await runResult(command, options);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() ||
      `${command[0]} exited with ${result.exitCode}`);
  }
  return result.stdout;
}

async function nodeProjectResult(options) {
  const source = [
    "const { buildProject } = await import(process.env.ELISCRIPT_PROJECT_HOST);",
    "await buildProject(JSON.parse(process.env.ELISCRIPT_OPTIONS));",
  ].join("\n");
  return runResult([NODE, "--input-type=module", "--eval", source], {
    env: {
      ...process.env,
      ELISCRIPT_PROJECT_HOST: PROJECT_HOST,
      ELISCRIPT_OPTIONS: JSON.stringify(options),
    },
  });
}

async function expectProjectRejection(options, message, seedArguments) {
  await expect(buildProject(options)).rejects.toThrow(message);
  const node = await nodeProjectResult(options);
  expect(node.exitCode).not.toBe(0);
  expect(node.stderr).toContain(message);
  if (seedArguments) {
    const seed = await runResult([SEED_BUILD, ...seedArguments]);
    expect(seed.exitCode).not.toBe(0);
    expect(seed.stderr).toContain(message);
  }
}

function createWorkerClient(command) {
  const child = Bun.spawn([command, WORKER], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const messages = [];
  const waiters = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;

  function deliver(message) {
    const index = waiters.findIndex(({ predicate }) => predicate(message));
    if (index === -1) {
      messages.push(message);
      return;
    }
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  const outputTask = (async () => {
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) deliver(JSON.parse(line));
      }
    }
    closed = true;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("worker output closed"));
    }
  })();
  const stderrTask = new Response(child.stderr).text();

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.flush();
  }

  function next(predicate, timeoutMs = 5_000) {
    const index = messages.findIndex(predicate);
    if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
    if (closed) return Promise.reject(new Error("worker output closed"));
    return new Promise((resolve_, reject) => {
      const waiter = { predicate, resolve: resolve_, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        const waiterIndex = waiters.indexOf(waiter);
        if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
        reject(new Error("timed out waiting for worker message"));
      }, timeoutMs);
      waiters.push(waiter);
    });
  }

  async function close() {
    if (!closed) {
      send({ version: 1, type: "shutdown" });
      await next((message) => message.type === "shutdown");
      child.stdin.end();
    }
    const exitCode = await child.exited;
    await outputTask;
    return { exitCode, stderr: await stderrTask };
  }

  return { child, send, next, close };
}

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "eliscript-boundary-security-"));
  compilerDirectory = resolve(directory, "compiler");
  await runSuccessful([BOOTSTRAP], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
    },
  });
  compiler = await import(
    `${pathToFileURL(resolve(compilerDirectory, "compiler.mjs")).href}?security`
  );
}, 30_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("boundary matrix rejects direct and symbolic project-root escapes", async () => {
  const parent = resolve(directory, "root-containment");
  const root = resolve(parent, "project");
  const outside = resolve(parent, "outside.eli");
  const entry = resolve(root, "main.eli");
  await mkdir(root, { recursive: true });
  await writeFile(outside, "(defconst value 42)\n(export value)\n");
  await writeFile(entry, "(print 1)\n");

  const directOut = resolve(parent, "direct-out");
  await expectProjectRejection({
    root,
    entry: outside,
    outDir: directOut,
    moduleDirectory: compilerDirectory,
    useCache: false,
  }, "escapes project root", [
    "--no-cache", "--root", root, "--out-dir", directOut, outside,
  ]);

  const linkedEntry = resolve(root, "linked.eli");
  await symlink(outside, linkedEntry);
  const linkedOut = resolve(parent, "linked-out");
  await expectProjectRejection({
    root,
    entry: linkedEntry,
    outDir: linkedOut,
    moduleDirectory: compilerDirectory,
    useCache: false,
  }, "escapes project root", [
    "--no-cache", "--root", root, "--out-dir", linkedOut, linkedEntry,
  ]);

  await writeFile(entry, '(import "../outside.eli" value)\n(print value)\n');
  const importOut = resolve(parent, "import-out");
  await expectProjectRejection({
    root,
    entry,
    outDir: importOut,
    moduleDirectory: compilerDirectory,
    useCache: false,
  }, "escapes project root", [
    "--no-cache", "--root", root, "--out-dir", importOut, entry,
  ]);

  await writeFile(entry, '(import "./linked.eli" value)\n(print value)\n');
  const importLinkOut = resolve(parent, "import-link-out");
  await expectProjectRejection({
    root,
    entry,
    outDir: importLinkOut,
    moduleDirectory: compilerDirectory,
    useCache: false,
  }, "escapes project root", [
    "--no-cache", "--root", root, "--out-dir", importLinkOut, entry,
  ]);

  const macroOutside = resolve(parent, "outside.txt");
  await writeFile(macroOutside, "outside");
  await expect(buildProject({
    root,
    entry,
    outDir: resolve(parent, "macro-direct-out"),
    moduleDirectory: compilerDirectory,
    macroCapabilities: ["read-file"],
    macroFileDependencies: ["../outside.txt"],
  })).rejects.toThrow("project request macro file dependencies are invalid");

  const linkedMacro = resolve(root, "linked-macro.txt");
  await symlink(macroOutside, linkedMacro);
  await expect(buildProject({
    root,
    entry,
    outDir: resolve(parent, "macro-link-out"),
    moduleDirectory: compilerDirectory,
    macroCapabilities: ["read-file"],
    macroFileDependencies: ["linked-macro.txt"],
  })).rejects.toThrow("macro file dependency escapes project root");
});

test("boundary matrix denies undeclared macro and worker capabilities", () => {
  const source = `(defmacro configured-value ()
  (macro-read-file "build-value.txt"))
(defconst value (configured-value))`;
  expect(() => compiler.compile_ir_string(source, "capability.eli"))
    .toThrow("macro capability is not enabled: read-file");
  expect(() => compiler.compile_ir_string(source, "capability.eli", {
    capabilities: new Set(["read-file"]),
    files: new Map(),
  })).toThrow("macro file dependency is not declared: build-value.txt");
  expect(() => compiler.project_configuration({
    schemaVersion: 1,
    entry: "main.eli",
    outDir: "dist",
    macroCapabilities: ["network"],
  }, "eliscript.json")).toThrow("unsupported macro capability: network");

  const progressOnly = workerCapabilities({ progress() {} }, ["progress"]);
  expect(workerCapabilityDescriptor(progressOnly).grants).toEqual(["progress"]);
  expect(() => workerCapabilities({}, ["process"]))
    .toThrow("unknown worker capability process");
  expect(() => workerProgress({ ...workerCapabilityDescriptor(progressOnly) }))
    .toThrow("expected Eliscript worker capabilities");
});

test("boundary matrix rejects configuration and worker protocol mismatches", async () => {
  for (const invalid of [
    { schemaVersion: 3, entry: "main.eli", outDir: "dist" },
    { schemaVersion: 1, entry: "../main.eli", outDir: "dist" },
    { schemaVersion: 1, entry: "main.eli", outDir: "dist", extra: true },
    { schemaVersion: 2, entries: [], outDir: "dist" },
  ]) {
    expect(() => compiler.project_configuration(invalid, "eliscript.json"))
      .toThrow();
  }
  expect(() => parseConfigurationJson(
    '{"schemaVersion":1,"entry":"main.eli","\\u0065ntry":"other.eli","outDir":"dist"}',
    "eliscript.json",
  )).toThrow("duplicate configuration key: entry");

  const client = createWorkerClient(process.execPath);
  try {
    await client.next((message) => message.type === "ready");
    client.send({ version: 2, type: "request", id: "wrong-version" });
    expect(await client.next((message) => message.id === "wrong-version"))
      .toMatchObject({
        type: "protocol-error",
        error: { code: "version-mismatch" },
      });
    client.send({
      version: 1,
      type: "request",
      id: "ambiguous-operation",
      module: "/tmp/never-loaded.mjs",
      export: "run",
      operation: "run",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "ambiguous-operation"))
      .toMatchObject({ ok: false, error: { code: "invalid-request" } });
    client.send({
      version: 1,
      type: "request",
      id: "remote-module",
      module: "https://example.invalid/module.mjs",
      export: "run",
      arguments: [],
    });
    const remote = await client.next((message) => message.id === "remote-module");
    expect(remote.ok).toBeFalse();
    expect(remote.error.message).toContain("worker modules must use local file URLs");
    client.send({ version: 1, type: "future-message", id: "unknown-type" });
    expect(await client.next((message) => message.id === "unknown-type"))
      .toMatchObject({
        type: "protocol-error",
        error: { code: "invalid-message" },
      });
    expect((await client.close()).exitCode).toBe(0);
  } finally {
    if (client.child.exitCode === null) {
      client.child.kill();
      await client.child.exited;
    }
  }
});

test("boundary matrix prevents generated artifacts from overwriting inputs", async () => {
  const direct = resolve(directory, "direct-output");
  const directSource = resolve(direct, "main.eli");
  const sourceText = "(defportable answer () 42)\n(export answer)\n";
  await mkdir(direct, { recursive: true });
  await writeFile(directSource, sourceText);

  for (const arguments_ of [
    ["--output", directSource, directSource],
    ["--portable", "answer", "--output", directSource, directSource],
  ]) {
    const result = await runResult([COMPILER, ...arguments_]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("must not overwrite input file");
    expect(await readFile(directSource, "utf8")).toBe(sourceText);
  }

  const linkedOutput = resolve(direct, "linked.mjs");
  await symlink(directSource, linkedOutput);
  const linked = await runResult([COMPILER, "--output", linkedOutput, directSource]);
  expect(linked.exitCode).not.toBe(0);
  expect(linked.stderr).toContain("must not overwrite input file");
  expect(await readFile(directSource, "utf8")).toBe(sourceText);

  const mappedOutput = resolve(direct, "mapped.mjs");
  await symlink(directSource, `${mappedOutput}.map`);
  const mapped = await runResult([
    COMPILER, "--source-map", "--output", mappedOutput, directSource,
  ]);
  expect(mapped.exitCode).not.toBe(0);
  expect(mapped.stderr).toContain("must not overwrite input file");
  expect(await readFile(directSource, "utf8")).toBe(sourceText);

  const aliasOutput = resolve(direct, "alias.mjs");
  await writeFile(aliasOutput, "existing output\n");
  await link(aliasOutput, `${aliasOutput}.map`);
  const aliased = await runResult([
    COMPILER, "--source-map", "--output", aliasOutput, directSource,
  ]);
  expect(aliased.exitCode).not.toBe(0);
  expect(aliased.stderr).toContain("must be physically distinct");

  async function projectAttack(name, setup, expected) {
    const parent = resolve(directory, `project-output-${name}`);
    const root = resolve(parent, "source");
    const outDir = resolve(parent, "output");
    const entry = resolve(root, "main.eli");
    await mkdir(root, { recursive: true });
    await mkdir(outDir, { recursive: true });
    await writeFile(entry, "(print 42)\n");
    const options = {
      root,
      entry,
      outDir,
      moduleDirectory: compilerDirectory,
      useCache: false,
    };
    await setup({ parent, root, outDir, entry, options });
    await expectProjectRejection(options, expected, [
      "--no-cache", "--root", root, "--out-dir", outDir, entry,
    ]);
    expect(await readFile(entry, "utf8")).toBe("(print 42)\n");
  }

  await projectAttack("output-link", async ({ outDir, entry }) => {
    await symlink(entry, resolve(outDir, "main.mjs"));
  }, "generated artifact escapes output directory");

  await projectAttack("map-hard-link", async ({ outDir, entry }) => {
    await link(entry, resolve(outDir, "main.mjs.map"));
  }, "generated artifact would overwrite an input");

  await projectAttack("manifest-link", async ({ outDir, entry }) => {
    await symlink(entry, resolve(outDir, "eliscript-project.json"));
  }, "generated artifact escapes output directory");

  const escapedParent = resolve(directory, "project-output-directory-link");
  const escapedRoot = resolve(escapedParent, "source");
  const escapedOut = resolve(escapedParent, "output");
  const outsideOut = resolve(escapedParent, "outside-output");
  const nestedEntry = resolve(escapedRoot, "nested/main.eli");
  await mkdir(dirname(nestedEntry), { recursive: true });
  await mkdir(escapedOut, { recursive: true });
  await mkdir(outsideOut, { recursive: true });
  await writeFile(nestedEntry, "(print 42)\n");
  await symlink(outsideOut, resolve(escapedOut, "nested"), "dir");
  const escapedOptions = {
    root: escapedRoot,
    entry: nestedEntry,
    outDir: escapedOut,
    moduleDirectory: compilerDirectory,
    useCache: false,
  };
  await expectProjectRejection(
    escapedOptions,
    "generated artifact escapes output directory",
    [
      "--no-cache", "--root", escapedRoot,
      "--out-dir", escapedOut, nestedEntry,
    ],
  );

  const macroParent = resolve(directory, "project-output-macro-input");
  const macroRoot = resolve(macroParent, "source");
  const macroEntry = resolve(macroRoot, "main.eli");
  const macroInput = resolve(macroRoot, "main.mjs");
  await mkdir(macroRoot, { recursive: true });
  await writeFile(macroEntry, "(print 42)\n");
  await writeFile(macroInput, "protected macro input\n");
  const macroOptions = {
    root: macroRoot,
    entry: macroEntry,
    outDir: macroRoot,
    moduleDirectory: compilerDirectory,
    macroCapabilities: ["read-file"],
    macroFileDependencies: ["main.mjs"],
    useCache: false,
  };
  await expect(buildProject(macroOptions)).rejects.toThrow(
    "generated artifact would overwrite an input",
  );
  const macroNode = await nodeProjectResult(macroOptions);
  expect(macroNode.exitCode).not.toBe(0);
  expect(macroNode.stderr).toContain("generated artifact would overwrite an input");
  const configuration = resolve(macroParent, "eliscript.json");
  await writeFile(configuration, `${JSON.stringify({
    schemaVersion: 1,
    sourceRoot: relative(macroParent, macroRoot),
    entry: "main.eli",
    outDir: relative(macroParent, macroRoot),
    macroCapabilities: ["read-file"],
    macroFileDependencies: ["main.mjs"],
    cache: false,
  })}\n`);
  const macroSeed = await runResult([SEED_BUILD, "--config", configuration]);
  expect(macroSeed.exitCode).not.toBe(0);
  expect(macroSeed.stderr).toContain("generated artifact would overwrite an input");
  expect(await readFile(macroInput, "utf8")).toBe("protected macro input\n");
}, 60_000);
