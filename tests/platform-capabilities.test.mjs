import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BrowserCapabilityError,
  browserCapabilities,
  browserCapabilityDescriptor,
  browserClearTimeout,
  browserDocument,
  browserFetch,
  browserNow,
  browserRandomValues,
  browserSetTimeout,
  hasBrowserCapability,
  isBrowserCapabilities,
} from "../platform/browser.mjs";
import {
  WorkerCapabilityError,
  decodeWorkerValue,
  encodeWorkerValue,
  hasWorkerCapability,
  isWorkerCapabilities,
  throwIfWorkerCancelled,
  workerCapabilities,
  workerCancelled,
  workerCapabilityDescriptor,
  workerProgress,
  workerSignal,
} from "../platform/worker.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST_FIXTURE = path.join(ROOT, "tests/fixtures/platform-capabilities.mjs");

async function runHost(command) {
  const child = Bun.spawn([command, HOST_FIXTURE], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${command} exited with ${exitCode}`);
  }
  return JSON.parse(stdout);
}

test("browser capabilities expose only explicitly granted host authority", async () => {
  const document = { title: "Eliscript" };
  const calls = [];
  const scope = {
    document,
    fetch(input, init) {
      calls.push(["fetch", this === scope, input, init]);
      return Promise.resolve({ ok: true, input });
    },
    performance: {
      now() {
        calls.push(["now", this === scope.performance]);
        return 17.25;
      },
    },
    crypto: {
      getRandomValues(values) {
        calls.push(["random", this === scope.crypto]);
        values.fill(7);
        return values;
      },
    },
    setTimeout(callback, delay, ...arguments_) {
      calls.push(["set-timeout", this === scope, delay]);
      callback(...arguments_);
      return 41;
    },
    clearTimeout(handle) {
      calls.push(["clear-timeout", this === scope, handle]);
    },
  };
  const capabilities = browserCapabilities(
    scope,
    ["timers", "network", "document", "randomness", "clock"],
  );

  expect(isBrowserCapabilities(capabilities)).toBe(true);
  expect(Object.isFrozen(capabilities)).toBe(true);
  const descriptor = browserCapabilityDescriptor(capabilities);
  expect(Object.isFrozen(descriptor)).toBe(true);
  expect(Object.isFrozen(descriptor.grants)).toBe(true);
  expect(descriptor).toEqual({
    format: "eliscript-browser-capabilities",
    version: 1,
    grants: ["clock", "document", "network", "randomness", "timers"],
  });
  expect(hasBrowserCapability(capabilities, "network")).toBe(true);
  scope.document = { title: "replacement" };
  scope.fetch = () => ({ ok: false });
  expect(browserDocument(capabilities)).toBe(document);
  expect(await browserFetch(capabilities, "/index", { method: "GET" }))
    .toEqual({ ok: true, input: "/index" });
  expect(browserNow(capabilities)).toBe(17.25);
  const values = new Uint8Array(3);
  expect(browserRandomValues(capabilities, values)).toBe(values);
  expect([...values]).toEqual([7, 7, 7]);
  let delivered;
  const handle = browserSetTimeout(
    capabilities,
    (value) => { delivered = value; },
    25,
    "ready",
  );
  expect(handle).toBe(41);
  browserClearTimeout(capabilities, handle);
  expect(delivered).toBe("ready");
  expect(calls).toEqual([
    ["fetch", true, "/index", { method: "GET" }],
    ["now", true],
    ["random", true],
    ["set-timeout", true, 25],
    ["clear-timeout", true, 41],
  ]);
});

test("browser capabilities reject ambient unavailable and forged authority", () => {
  const empty = browserCapabilities({}, []);
  expect(browserCapabilityDescriptor(empty).grants).toEqual([]);
  expect(hasBrowserCapability(empty, "network")).toBe(false);
  expect(() => browserFetch(empty, "/hidden")).toThrow(BrowserCapabilityError);
  try {
    browserFetch(empty, "/hidden");
  } catch (error) {
    expect(error).toMatchObject({
      code: "missing-capability",
      capability: "network",
    });
  }
  expect(() => browserCapabilities({}, ["network"]))
    .toThrow("browser host does not provide network");
  expect(() => browserCapabilities({ setTimeout() {} }, ["timers"]))
    .toThrow("browser host does not provide timers");
  expect(() => browserCapabilities({}, ["unknown"]))
    .toThrow("unknown browser capability unknown");
  expect(() => browserCapabilities({}, ["clock", "clock"]))
    .toThrow("browser grants must not contain duplicates");
  expect(() => browserCapabilityDescriptor({
    format: "eliscript-browser-capabilities",
    version: 1,
    grants: [],
  })).toThrow("expected Eliscript browser capabilities");
  expect(() => browserFetch({ ...browserCapabilityDescriptor(empty) }, "/copied"))
    .toThrow("expected Eliscript browser capabilities");
});

test("worker capabilities preserve progress cancellation and codec boundaries", () => {
  const controller = new AbortController();
  const progress = [];
  const context = {
    signal: controller.signal,
    progress(value) {
      progress.push([this === context, value]);
      return progress.length;
    },
  };
  const capabilities = workerCapabilities(
    context,
    ["progress", "cancellation"],
  );

  expect(isWorkerCapabilities(capabilities)).toBe(true);
  expect(Object.isFrozen(capabilities)).toBe(true);
  const descriptor = workerCapabilityDescriptor(capabilities);
  expect(Object.isFrozen(descriptor)).toBe(true);
  expect(Object.isFrozen(descriptor.grants)).toBe(true);
  expect(descriptor).toEqual({
    format: "eliscript-worker-capabilities",
    version: 1,
    grants: ["cancellation", "progress"],
  });
  expect(hasWorkerCapability(capabilities, "progress")).toBe(true);
  expect(workerSignal(capabilities)).toBe(controller.signal);
  expect(workerCancelled(capabilities)).toBe(false);
  expect(workerProgress(capabilities, { stage: "scan" })).toBe(1);
  expect(progress).toEqual([[true, { stage: "scan" }]]);
  expect(decodeWorkerValue(encodeWorkerValue([1, undefined, -0])))
    .toEqual([1, undefined, -0]);

  controller.abort();
  expect(workerCancelled(capabilities)).toBe(true);
  expect(() => throwIfWorkerCancelled(capabilities)).toThrow(WorkerCapabilityError);
  try {
    throwIfWorkerCancelled(capabilities);
  } catch (error) {
    expect(error).toMatchObject({
      code: "worker-cancelled",
      capability: "cancellation",
    });
  }
});

test("worker capabilities reject undeclared unavailable and forged operations", () => {
  const progressOnly = workerCapabilities(
    { progress() {} },
    ["progress"],
  );
  expect(workerCapabilityDescriptor(progressOnly).grants).toEqual(["progress"]);
  expect(hasWorkerCapability(progressOnly, "cancellation")).toBe(false);
  expect(() => workerSignal(progressOnly)).toThrow("was not granted");
  expect(() => workerCapabilities({}, ["progress"]))
    .toThrow("worker context does not provide progress");
  expect(() => workerCapabilities({}, ["cancellation"]))
    .toThrow("worker context does not provide an AbortSignal");
  expect(() => workerCapabilities({}, ["process"]))
    .toThrow("unknown worker capability process");
  expect(() => workerCapabilities({}, ["progress", "progress"]))
    .toThrow("worker grants must not contain duplicates");
  expect(() => workerCapabilityDescriptor({
    format: "eliscript-worker-capabilities",
    version: 1,
    grants: [],
  })).toThrow("expected Eliscript worker capabilities");
  expect(() => workerProgress({ ...workerCapabilityDescriptor(progressOnly) }))
    .toThrow("expected Eliscript worker capabilities");
});

test("platform capability behavior is identical under Bun and Node", async () => {
  const [bun, node] = await Promise.all([
    runHost(process.execPath),
    runHost("node"),
  ]);
  expect(node).toEqual(bun);
  expect(bun).toEqual({
    browser: {
      format: "eliscript-browser-capabilities",
      version: 1,
      grants: ["clock", "network"],
    },
    fetch: { ok: true, input: "/articles" },
    now: 42.5,
    worker: {
      format: "eliscript-worker-capabilities",
      version: 1,
      grants: ["cancellation", "progress"],
    },
    progress: ["indexed"],
  });
});

test("platform packages have no ambient global or application dependency", async () => {
  for (const relativePath of ["platform/browser.mjs", "platform/worker.mjs"]) {
    const source = await readFile(path.join(ROOT, relativePath), "utf8");
    expect(source).not.toMatch(/\b(?:globalThis|window|self)\b/u);
    expect(source).not.toMatch(/\b(?:react|vite)\b/iu);
  }
});
