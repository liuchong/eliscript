import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  ProjectWatcher,
  watchEventFormat,
  watchEventVersion,
} from "../bootstrap/host/watch.mjs";
import { parseArguments } from "../bootstrap/host/watch-cli.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const bootstrapPath = resolve(projectDirectory, "bin/eliscript-bootstrap");
const watchPath = resolve(projectDirectory, "bin/eliscript-watch");
const node = process.env.NODE ?? "node";
const bun = process.execPath;

let directory;
let compilerDirectory;

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    env: options.env ?? process.env,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function lineReader(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  return async function nextLine() {
    while (!buffered.includes("\n")) {
      let timer;
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("watch event timed out")),
            10_000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      if (result.done) throw new Error("watch event stream closed");
      buffered += decoder.decode(result.value, { stream: true });
    }
    const end = buffered.indexOf("\n");
    const line = buffered.slice(0, end);
    buffered = buffered.slice(end + 1);
    return line;
  };
}

async function cliTranscript(runtime, root, signal) {
  const child = Bun.spawn([
    watchPath,
    "--root",
    root,
    "--interval",
    "25",
    "--json",
  ], {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: runtime,
    },
  });
  const stderrPromise = new Response(child.stderr).text();
  let ready;
  let change;
  let exitCode;
  let stderr;
  try {
    const nextLine = lineReader(child.stdout);
    ready = JSON.parse(await nextLine());
    await writeFile(resolve(root, "main.eli"), "(print 2)\n");
    change = JSON.parse(await nextLine());
  } finally {
    child.kill(signal);
    [exitCode, stderr] = await Promise.all([child.exited, stderrPromise]);
  }
  return { ready, change, exitCode, stderr };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "eliscript-watch-test-"));
  compilerDirectory = resolve(directory, "compiler");
  const built = await run([bootstrapPath], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_OUT_DIR: compilerDirectory,
    },
  });
  expect(built.exitCode).toBe(0);
  expect(built.stderr).toBe("");
}, 30_000);

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("project snapshots normalize source creation modification and deletion", async () => {
  const root = resolve(directory, "snapshot");
  await mkdir(resolve(root, "nested"), { recursive: true });
  await writeFile(resolve(root, "main.eli"), "(print 1)\n");
  await writeFile(resolve(root, "ignored.txt"), "one\n");
  await symlink(resolve(root, "main.eli"), resolve(root, "linked.eli"));
  await symlink(resolve(root, "nested"), resolve(root, "linked-directory"));

  const watcher = await ProjectWatcher.create({ root, interval: 25 });
  try {
    const canonicalRoot = await realpath(root);
    expect(watcher.ready()).toMatchObject({
      format: watchEventFormat,
      version: watchEventVersion,
      sequence: 0,
      event: "ready",
      root: canonicalRoot,
      changes: [],
    });

    await writeFile(resolve(root, "main.eli"), "(print 2)\n");
    await writeFile(resolve(root, "nested/new.eli"), "(print 3)\n");
    await writeFile(resolve(root, "ignored.txt"), "two\n");
    const changed = await watcher.scan();
    expect(changed.sequence).toBe(1);
    expect(changed.changes).toEqual([
      {
        file: resolve(canonicalRoot, "main.eli"),
        path: "main.eli",
        kind: "modify",
      },
      {
        file: resolve(canonicalRoot, "nested/new.eli"),
        path: "nested/new.eli",
        kind: "create",
      },
    ]);

    await rm(resolve(root, "main.eli"));
    const removed = await watcher.scan();
    expect(removed).toMatchObject({ sequence: 2, event: "change" });
    expect(removed.changes).toEqual([{
      file: resolve(canonicalRoot, "main.eli"),
      path: "main.eli",
      kind: "delete",
    }]);
    expect(await watcher.scan()).toBeNull();
  } finally {
    await watcher.close();
  }
});

test("configured snapshots retain configuration identity outside the source root", async () => {
  const project = resolve(directory, "configured");
  const root = resolve(project, "src");
  const configuration = resolve(project, "eliscript.json");
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "main.eli"), "(print 1)\n");
  await writeFile(configuration, "{\"version\":1}\n");
  const watcher = await ProjectWatcher.create({ root, configuration });
  try {
    const canonicalConfiguration = await realpath(configuration);
    await writeFile(configuration, "{\"version\":2}\n");
    const event = await watcher.scan();
    expect(event.changes).toEqual([{
      file: canonicalConfiguration,
      kind: "modify",
    }]);
  } finally {
    await watcher.close();
  }
});

test("watch sessions frame recoverable scan errors and reject use after close", async () => {
  const root = resolve(directory, "error-event");
  await mkdir(root, { recursive: true });
  const watcher = await ProjectWatcher.create({ root });
  const event = watcher.error(new Error("scan failed"));
  expect(event).toMatchObject({
    format: watchEventFormat,
    version: watchEventVersion,
    sequence: 1,
    event: "error",
    root: await realpath(root),
    diagnostic: {
      code: "ELI-W0002",
      phase: "project-watch",
      message: "scan failed",
    },
  });
  await watcher.close();
  await expect(watcher.scan()).rejects.toThrow("watch session is closed");
});

test("Node and Bun emit equivalent project watch events and stop cleanly", async () => {
  const root = resolve(directory, "cross-host");
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "main.eli"), "(print 1)\n");
  const nodeResult = await cliTranscript(node, root, "SIGINT");
  await writeFile(resolve(root, "main.eli"), "(print 1)\n");
  const bunResult = await cliTranscript(bun, root, "SIGTERM");
  expect(bunResult).toEqual(nodeResult);
  expect(nodeResult.exitCode).toBe(0);
  expect(nodeResult.stderr).toBe("");
  expect(nodeResult.change).toMatchObject({
    sequence: 1,
    event: "change",
    changes: [{ path: "main.eli", kind: "modify" }],
  });
});

test("configured command resolves the project request and watches its file", async () => {
  const project = resolve(directory, "configured-cli");
  const root = resolve(project, "src");
  const configuration = resolve(project, "eliscript.json");
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "main.eli"), "(print 1)\n");
  const config = (cache) => JSON.stringify({
    schemaVersion: 1,
    sourceRoot: "src",
    entry: "main.eli",
    outDir: "build",
    portableEntries: [],
    cache,
  });
  await writeFile(configuration, `${config(true)}\n`);
  const child = Bun.spawn([
    watchPath,
    "--config",
    configuration,
    "--interval",
    "25",
    "--json",
  ], {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: bun,
    },
  });
  const stderrPromise = new Response(child.stderr).text();
  let exitCode;
  let stderr;
  try {
    const nextLine = lineReader(child.stdout);
    const ready = JSON.parse(await nextLine());
    expect(ready.root).toBe(await realpath(root));
    await writeFile(configuration, `${config(false)}\n`);
    const change = JSON.parse(await nextLine());
    expect(change.changes).toEqual([{
      file: await realpath(configuration),
      kind: "modify",
    }]);
  } finally {
    child.kill("SIGTERM");
    [exitCode, stderr] = await Promise.all([child.exited, stderrPromise]);
  }
  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
});

test("watch command rejects ambiguous selectors and unsafe intervals", async () => {
  expect(() => parseArguments([])).toThrow(
    "choose exactly one of --root or --config",
  );
  expect(() => parseArguments([
    "--root", ".", "--config", "eliscript.json",
  ])).toThrow("choose exactly one of --root or --config");
  const result = await run([
    watchPath,
    "--root",
    projectDirectory,
    "--interval",
    "1",
    "--json",
  ], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: bun,
    },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("watch interval must be an integer between 25");
  const missing = await run([
    watchPath,
    "--root",
    resolve(directory, "missing-root"),
    "--json",
  ], {
    env: {
      ...process.env,
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: compilerDirectory,
      ELISCRIPT_JS_RUNTIME: node,
    },
  });
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain("watch root does not exist");
});
