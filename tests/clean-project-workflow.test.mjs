import { expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const EXAMPLE = path.join(ROOT, "examples/getting-started");

async function exists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function run(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let forceKillTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, options.timeoutMs ?? 20_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (timedOut) throw new Error(`${command[0]} exceeded its deadline`);
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() ||
        `${command[0]} exited with ${exitCode}`);
    }
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
    clearTimeout(forceKillTimer);
  }
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
            () => reject(new Error("configured watch event timed out")),
            10_000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      if (result.done) throw new Error("configured watch event stream closed");
      buffered += decoder.decode(result.value, { stream: true });
    }
    const end = buffered.indexOf("\n");
    const line = buffered.slice(0, end);
    buffered = buffered.slice(end + 1);
    return line;
  };
}

async function stopWatch(child) {
  child.kill("SIGTERM");
  const forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  try {
    return await child.exited;
  } finally {
    clearTimeout(forceKillTimer);
  }
}

test("clean configured project runs the complete public workflow", async () => {
  const temporaryRoot = await realpath(await mkdtemp(
    path.join(tmpdir(), "eliscript-clean-workflow-"),
  ));
  const project = path.join(temporaryRoot, "project");
  const sourceRoot = path.join(project, "src");
  const configFile = path.join(project, "eliscript.json");
  const command = (name) => path.join(ROOT, "bin", name);
  try {
    await cp(EXAMPLE, project, { recursive: true });
    const originals = new Map(await Promise.all([
      "eliscript.json",
      "src/main.eli",
      "src/math.eli",
    ].map(async (filename) => [
      filename,
      await readFile(path.join(project, filename), "utf8"),
    ])));

    for (const source of ["src/math.eli", "src/main.eli"]) {
      const formatted = await run([
        command("eliscript-format"), "--check", source,
      ], { cwd: project });
      expect(formatted).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    }

    const checked = JSON.parse((await run([
      command("eliscript-check"), "--json", "--config", "eliscript.json",
    ], { cwd: project })).stdout);
    expect(checked).toMatchObject({
      format: "eliscript-check-report",
      version: 1,
      status: "ok",
      counts: { modules: 2 },
    });
    expect(checked.modules.map((module) => module.source)).toEqual([
      "main.eli",
      "math.eli",
    ]);
    expect(await exists(path.join(project, "dist"))).toBe(false);

    const built = JSON.parse((await run([
      command("eliscript-build"), "--json", "--config", "eliscript.json",
    ], { cwd: project })).stdout);
    expect(built).toMatchObject({
      format: "eliscript-build-report",
      mode: "standard",
      root: await realpath(sourceRoot),
      outDir: path.join(project, "dist"),
      entry: "main.eli",
      entryOutput: "main.mjs",
      counts: { modules: 2, compiled: 2, reused: 0 },
    });
    expect((await run([process.execPath, "run", "dist/main.mjs"], {
      cwd: project,
    })).stdout).toBe("42\n");

    const watcher = Bun.spawn([
      command("eliscript-watch"),
      "--config", configFile,
      "--interval", "25",
      "--json",
    ], {
      cwd: project,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const watcherStderr = new Response(watcher.stderr).text();
    let watchExit;
    try {
      const nextLine = lineReader(watcher.stdout);
      expect(JSON.parse(await nextLine())).toMatchObject({
        format: "eliscript-watch-event",
        version: 1,
        sequence: 0,
        event: "ready",
        root: await realpath(sourceRoot),
        changes: [],
      });
      await writeFile(
        path.join(sourceRoot, "math.eli"),
        "(module hello.math (defconst answer (+ 20 23)) (export answer))\n",
      );
      expect(JSON.parse(await nextLine())).toMatchObject({
        sequence: 1,
        event: "change",
        changes: [{ path: "math.eli", kind: "modify" }],
      });
      await writeFile(
        path.join(sourceRoot, "math.eli"),
        originals.get("src/math.eli"),
      );
    } finally {
      watchExit = await stopWatch(watcher);
    }
    expect(watchExit).toBe(0);
    expect(await watcherStderr).toBe("");

    await writeFile(
      path.join(sourceRoot, "override.eli"),
      "(module hello.override (print 84))\n",
    );
    await mkdir(path.join(project, "configured-src"));
    await writeFile(
      path.join(project, "configured-src/configured.eli"),
      "(module hello.configured (print 7))\n",
    );
    await writeFile(configFile, `${JSON.stringify({
      schemaVersion: 2,
      sourceRoot: "configured-src",
      entries: ["configured.eli"],
      outDir: "configured-dist",
      portableEntries: [],
      cache: true,
    })}\n`);
    const overrideCheck = JSON.parse((await run([
      command("eliscript-check"),
      "--json",
      "--config", "eliscript.json",
      "--root", "src",
      "src/override.eli",
    ], { cwd: project })).stdout);
    expect(overrideCheck).toMatchObject({
      root: await realpath(sourceRoot),
      counts: { modules: 1 },
    });
    expect(overrideCheck.modules.map((module) => module.source)).toEqual([
      "override.eli",
    ]);

    const overrideBuild = JSON.parse((await run([
      command("eliscript-build"),
      "--json",
      "--config", "eliscript.json",
      "--root", "src",
      "--out-dir", "cli-dist",
      "--no-cache",
      "src/override.eli",
    ], { cwd: project })).stdout);
    expect(overrideBuild).toMatchObject({
      root: await realpath(sourceRoot),
      outDir: path.join(project, "cli-dist"),
      entry: "override.eli",
      entryOutput: "override.mjs",
      cache: {
        enabled: false,
        status: "disabled",
        reason: "cache-disabled",
      },
      counts: { modules: 1, compiled: 1, reused: 0 },
    });
    expect(await exists(path.join(project, "configured-dist"))).toBe(false);
    expect((await run([process.execPath, "run", "cli-dist/override.mjs"], {
      cwd: project,
    })).stdout).toBe("84\n");

    await writeFile(configFile, originals.get("eliscript.json"));
    for (const [filename, source] of originals) {
      expect(await readFile(path.join(project, filename), "utf8")).toBe(source);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 60_000);
