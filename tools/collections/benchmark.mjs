import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateLayoutHostReport } from "./layout-benchmark.mjs";

export const LAYOUT_SUITE_FORMAT = "eliscript-hamt-layout-benchmark";
export const LAYOUT_SUITE_VERSION = 1;
export const BROWSER_PORT = 8740;
export const BROWSER_DEBUG_PORT = 8741;

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(directory, "../..");
const hostRunner = path.join(directory, "layout-host.mjs");
const browserModuleFiles = Object.freeze([
  "runtime/core/map-internals.mjs",
  "runtime/core/protocol-error.mjs",
  "runtime/core/protocol-impl.mjs",
  "runtime/core/protocol.mjs",
  "runtime/core/value-internals.mjs",
  "runtime/core/value.mjs",
  "tools/collections/browser/index.html",
  "tools/collections/browser/main.mjs",
  "tools/collections/layout-benchmark.mjs",
]);
const digestFiles = Object.freeze([
  "runtime/core/map-internals.mjs",
  "runtime/core/protocol-error.mjs",
  "runtime/core/protocol-impl.mjs",
  "runtime/core/protocol.mjs",
  "runtime/core/value.mjs",
  "runtime/core/value-internals.mjs",
  "tools/collections/benchmark.mjs",
  "tools/collections/browser/index.html",
  "tools/collections/browser/main.mjs",
  "tools/collections/layout-benchmark.mjs",
]);

function parseArguments(arguments_) {
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") {
      output = arguments_[index + 1];
      if (output === undefined) {
        throw new TypeError("--output requires a path");
      }
      index += 1;
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: bun tools/collections/benchmark.mjs [--output REPORT.json]\n",
      );
      process.exit(0);
    } else {
      throw new TypeError(`unknown argument ${argument}`);
    }
  }
  return { output };
}

function benchmarkEnvironment() {
  return {
    ...process.env,
    ELISCRIPT_LAYOUT_OCCUPANCIES:
      process.env.ELISCRIPT_LAYOUT_OCCUPANCIES ?? "4,8,12,15,16,20,24,28,32",
    ELISCRIPT_LAYOUT_ITERATIONS:
      process.env.ELISCRIPT_LAYOUT_ITERATIONS ?? "250000",
    ELISCRIPT_LAYOUT_MUTATION_ITERATIONS:
      process.env.ELISCRIPT_LAYOUT_MUTATION_ITERATIONS ?? "50000",
    ELISCRIPT_LAYOUT_TIMING_SAMPLES:
      process.env.ELISCRIPT_LAYOUT_TIMING_SAMPLES ?? "7",
    ELISCRIPT_LAYOUT_MEMORY_NODES:
      process.env.ELISCRIPT_LAYOUT_MEMORY_NODES ?? "20000",
    ELISCRIPT_LAYOUT_MEMORY_SAMPLES:
      process.env.ELISCRIPT_LAYOUT_MEMORY_SAMPLES ?? "3",
  };
}

export async function benchmarkSourceDigest() {
  const hash = createHash("sha256");
  for (const relative of digestFiles) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(projectDirectory, relative)));
    hash.update("\0");
  }
  return {
    algorithm: "sha256",
    files: digestFiles,
    value: hash.digest("hex"),
  };
}

function runCommand(command, arguments_, { env, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: projectDirectory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 2_000).unref();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (timedOut || code !== 0) {
        reject(new Error(
          timedOut
            ? `${command} timed out after ${timeoutMs}ms`
            : `${command} exited with ${code ?? signal}: ${errorOutput || output}`,
        ));
        return;
      }
      resolve({ stdout: output, stderr: errorOutput });
    });
  });
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const metadata = await stat(candidate);
      if (metadata.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next known executable path.
    }
  }
  throw new Error("Chrome or Chromium executable not found; set CHROME explicitly");
}

function contentType(file) {
  switch (path.extname(file)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    default: return "application/octet-stream";
  }
}

async function prepareBrowserRoot(temporaryDirectory) {
  const root = path.join(temporaryDirectory, "browser-root");
  for (const relative of browserModuleFiles) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(projectDirectory, relative), destination);
  }
  return root;
}

function startStaticServer(root) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${BROWSER_PORT}`);
      const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.resolve(root, `.${relative}`);
      if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const metadata = await stat(file);
      if (!metadata.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentType(file),
        "content-length": metadata.size,
        "cache-control": "no-store",
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(BROWSER_PORT, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections?.();
  });
}

async function assertPortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await closeServer(server);
}

function launchProcess(command, arguments_) {
  const child = spawn(command, arguments_, {
    cwd: projectDirectory,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
  return { child, closed };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDebuggerTarget(processHandle, pageUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null ||
        processHandle.child.signalCode !== null) {
      const result = await processHandle.closed;
      throw new Error(
        `Chrome exited before exposing its benchmark page: ${result.stderr || result.stdout}`,
      );
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${BROWSER_DEBUG_PORT}/json/list`,
      );
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((candidate) =>
          candidate.type === "page" && candidate.url.startsWith(pageUrl));
        if (target?.webSocketDebuggerUrl !== undefined) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Chrome has not opened the debugger socket yet.
    }
    await delay(100);
  }
  throw new Error(`Chrome debugger did not become ready within ${timeoutMs}ms`);
}

async function connectDebugger(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) {
      return;
    }
    const request = pending.get(message.id);
    if (request === undefined) {
      return;
    }
    pending.delete(message.id);
    if (message.error !== undefined) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      request.reject(new Error("Chrome debugger connection closed"));
    }
    pending.clear();
  });
  return {
    call(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function waitForBrowserReport(debuggerClient, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const evaluation = await debuggerClient.call("Runtime.evaluate", {
      expression: "document.querySelector('#result')?.textContent ?? ''",
      returnByValue: true,
    });
    const text = evaluation.result?.value ?? "";
    if (text.startsWith("ELISCRIPT_LAYOUT_RESULT:")) {
      return validateLayoutHostReport(JSON.parse(
        text.slice("ELISCRIPT_LAYOUT_RESULT:".length),
      ));
    }
    if (text.startsWith("ELISCRIPT_LAYOUT_ERROR:")) {
      throw new Error(text.slice("ELISCRIPT_LAYOUT_ERROR:".length));
    }
    await delay(100);
  }
  throw new Error(`Chrome benchmark did not finish within ${timeoutMs}ms`);
}

async function stopChrome(processHandle, debuggerClient) {
  try {
    await debuggerClient?.call("Browser.close");
  } catch {
    // The debugger socket can close before acknowledging Browser.close.
  }
  debuggerClient?.close();
  const graceful = await Promise.race([
    processHandle.closed.then(() => true),
    delay(2_000).then(() => false),
  ]);
  if (!graceful && processHandle.child.exitCode === null) {
    processHandle.child.kill("SIGTERM");
    const terminated = await Promise.race([
      processHandle.closed.then(() => true),
      delay(2_000).then(() => false),
    ]);
    if (!terminated && processHandle.child.exitCode === null) {
      processHandle.child.kill("SIGKILL");
      await processHandle.closed;
    }
  }
}

function browserQuery(environment) {
  const parameters = new URLSearchParams({
    occupancies: environment.ELISCRIPT_LAYOUT_OCCUPANCIES,
    iterations: environment.ELISCRIPT_LAYOUT_ITERATIONS,
    mutationIterations: environment.ELISCRIPT_LAYOUT_MUTATION_ITERATIONS,
    timingSamples: environment.ELISCRIPT_LAYOUT_TIMING_SAMPLES,
    memoryNodes: environment.ELISCRIPT_LAYOUT_MEMORY_NODES,
    memorySamples: environment.ELISCRIPT_LAYOUT_MEMORY_SAMPLES,
  });
  return parameters.toString();
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function analyzeLayoutSuite(hosts) {
  const occupancies = hosts[0].parameters.occupancies;
  const candidates = occupancies.map((occupancy) => {
    const measurements = hosts.map((host) =>
      host.measurements.find((entry) => entry.occupancy === occupancy));
    const mixedRatios = measurements.map((entry) =>
      entry.ratios.arrayToBitmapMixed);
    const memoryRatios = measurements
      .map((entry) => entry.ratios.arrayToBitmapBytes)
      .filter((value) => value !== null);
    return {
      occupancy,
      arrayMixedWins: mixedRatios.filter((value) => value <= 1).length,
      medianArrayToBitmapMixed: median(mixedRatios),
      measuredMemoryHosts: memoryRatios.length,
      medianArrayToBitmapBytes: memoryRatios.length === 0
        ? null
        : median(memoryRatios),
    };
  });
  const promotionCandidate = candidates.find((candidate) =>
    candidate.arrayMixedWins >= 2 &&
    candidate.measuredMemoryHosts >= 2 &&
    candidate.medianArrayToBitmapBytes <= 1.5);
  const demotionCandidates = candidates.filter((candidate) =>
    promotionCandidate !== undefined &&
    candidate.occupancy < promotionCandidate.occupancy &&
    candidate.medianArrayToBitmapMixed >= 1.15 &&
    candidate.measuredMemoryHosts >= 2 &&
    candidate.medianArrayToBitmapBytes >= 1.15);
  const demotionCandidate = demotionCandidates.at(-1);
  return {
    policy: {
      workload: { lookup: 0.8, assoc: 0.1, dissoc: 0.1 },
      minimumArrayWinningHosts: 2,
      minimumPreciseMemoryHosts: 2,
      maximumMedianArrayToBitmapBytes: 1.5,
      minimumBitmapMixedAdvantageAtDemotion: 1.15,
      minimumBitmapMemoryAdvantageAtDemotion: 1.15,
    },
    candidates,
    promotionCandidate: promotionCandidate?.occupancy ?? null,
    demotionCandidate: demotionCandidate?.occupancy ?? null,
  };
}

async function runBrowserBenchmark(environment, temporaryDirectory) {
  const browserRoot = await prepareBrowserRoot(temporaryDirectory);
  const chrome = await findChromeExecutable();
  const userDataDirectory = path.join(temporaryDirectory, "chrome-profile");
  let server;
  let processHandle;
  let debuggerClient;
  try {
    await assertPortAvailable(BROWSER_DEBUG_PORT);
    server = await startStaticServer(browserRoot);
    const url =
      `http://127.0.0.1:${BROWSER_PORT}/tools/collections/browser/index.html?` +
      browserQuery(environment);
    processHandle = launchProcess(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--enable-precise-memory-info",
      "--js-flags=--expose-gc",
      `--remote-debugging-port=${BROWSER_DEBUG_PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${userDataDirectory}`,
      url,
    ]);
    const debuggerUrl = await waitForDebuggerTarget(processHandle, url, 15_000);
    debuggerClient = await connectDebugger(debuggerUrl);
    return await waitForBrowserReport(debuggerClient, 180_000);
  } finally {
    if (processHandle !== undefined) {
      await stopChrome(processHandle, debuggerClient);
    }
    if (server !== undefined) {
      await closeServer(server);
    }
  }
}

export function validateLayoutSuiteReport(report) {
  if (report?.format !== LAYOUT_SUITE_FORMAT ||
      report?.version !== LAYOUT_SUITE_VERSION) {
    throw new TypeError("invalid HAMT layout benchmark suite format or version");
  }
  if (!Array.isArray(report.hosts) || report.hosts.length !== 3) {
    throw new TypeError("HAMT layout benchmark requires exactly three host reports");
  }
  const ids = new Set();
  const parameters = JSON.stringify(report.hosts[0].parameters);
  for (const host of report.hosts) {
    validateLayoutHostReport(host);
    if (JSON.stringify(host.parameters) !== parameters) {
      throw new TypeError("HAMT layout benchmark host parameters differ");
    }
    ids.add(host.host.id);
  }
  for (const required of ["bun", "node", "chrome"]) {
    if (!ids.has(required)) {
      throw new TypeError(`HAMT layout benchmark is missing ${required}`);
    }
  }
  if (report.sourceDigest?.algorithm !== "sha256" ||
      !/^[0-9a-f]{64}$/.test(report.sourceDigest?.value ?? "")) {
    throw new TypeError("HAMT layout benchmark source digest is invalid");
  }
  const analysis = analyzeLayoutSuite(report.hosts);
  if (JSON.stringify(report.analysis) !== JSON.stringify(analysis)) {
    throw new TypeError("HAMT layout benchmark analysis does not match raw samples");
  }
  if (report.runtimeThresholds?.promotion !== analysis.promotionCandidate ||
      report.runtimeThresholds?.demotion !== analysis.demotionCandidate) {
    const declared =
      `${report.runtimeThresholds?.promotion ?? "none"}/` +
      `${report.runtimeThresholds?.demotion ?? "none"}`;
    const measured =
      `${analysis.promotionCandidate ?? "none"}/` +
      `${analysis.demotionCandidate ?? "none"}`;
    throw new TypeError(
      `HAMT runtime thresholds ${declared} do not match measured candidates ${measured}`,
    );
  }
  return report;
}

export async function runLayoutSuiteBenchmark() {
  const environment = benchmarkEnvironment();
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "eliscript-layout-benchmark-"),
  );
  try {
    const bun = process.env.BUN ?? (typeof Bun === "object" ? process.execPath : "bun");
    const node = process.env.NODE ?? "node";
    const bunResult = await runCommand(bun, [hostRunner], { env: environment });
    const nodeResult = await runCommand(node, ["--expose-gc", hostRunner], {
      env: environment,
    });
    const hosts = [
      validateLayoutHostReport(JSON.parse(bunResult.stdout)),
      validateLayoutHostReport(JSON.parse(nodeResult.stdout)),
      await runBrowserBenchmark(environment, temporaryDirectory),
    ];
    return validateLayoutSuiteReport({
      format: LAYOUT_SUITE_FORMAT,
      version: LAYOUT_SUITE_VERSION,
      generatedAt: new Date().toISOString(),
      sourceDigest: await benchmarkSourceDigest(),
      runtimeThresholds: { promotion: 32, demotion: 24 },
      hosts,
      analysis: analyzeLayoutSuite(hosts),
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await runLayoutSuiteBenchmark();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) {
    process.stdout.write(json);
  } else {
    const resolved = path.resolve(projectDirectory, output);
    await writeFile(resolved, json, "utf8");
    process.stdout.write(`${pathToFileURL(resolved).href}\n`);
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
