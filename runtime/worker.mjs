#!/usr/bin/env bun

import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const protocolVersion = 1;
export const capabilities = [
  "request",
  "progress",
  "cancel",
  "timeout",
  "shutdown",
  "module-cache",
  "portable-manifest",
];

const maximumLineBytes = 16 * 1024 * 1024;
const moduleCache = new Map();
const pending = new Map();
const protocolOutput = process.stdout;
let shuttingDown = false;

for (const method of ["log", "info", "debug"]) {
  console[method] = (...values) => console.error(...values);
}

function errorPayload(code, message, error) {
  const payload = { code, message };
  if (error?.name) payload.name = error.name;
  if (error?.stack) payload.stack = error.stack;
  return payload;
}

function writeMessage(message) {
  let encoded;
  try {
    encoded = JSON.stringify(message);
  } catch (error) {
    encoded = JSON.stringify({
      version: protocolVersion,
      type: "protocol-error",
      error: errorPayload(
        "serialization",
        `worker could not serialize a protocol message: ${error.message}`,
        error,
      ),
    });
  }
  protocolOutput.write(`${encoded}\n`);
}

function jsonValue(value, label) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    const wrapped = new Error(`${label} is not JSON-serializable: ${error.message}`);
    wrapped.code = "serialization";
    throw wrapped;
  }
  if (encoded === undefined) {
    const error = new Error(`${label} is not JSON-serializable`);
    error.code = "serialization";
    throw error;
  }
  return JSON.parse(encoded);
}

function requestError(id, code, message, error, timing) {
  const response = {
    version: protocolVersion,
    type: "response",
    id,
    ok: false,
    error: errorPayload(code, message, error),
  };
  if (timing) response.timing = timing;
  writeMessage(response);
}

function protocolError(code, message, id) {
  const response = {
    version: protocolVersion,
    type: "protocol-error",
    error: errorPayload(code, message),
  };
  if (id !== undefined) response.id = id;
  writeMessage(response);
}

function moduleUrl(identity) {
  let url;
  try {
    url = new URL(identity);
  } catch {
    url = pathToFileURL(resolve(identity));
  }
  if (url.protocol !== "file:") {
    throw new Error(`worker modules must use local file URLs: ${identity}`);
  }
  return url.href;
}

function loadModule(identity) {
  const url = moduleUrl(identity);
  if (!moduleCache.has(url)) moduleCache.set(url, import(url));
  return moduleCache.get(url);
}

function validateRequest(message) {
  if (typeof message.id !== "string" || message.id.length === 0) {
    throw new Error("request id must be a non-empty string");
  }
  if (typeof message.module !== "string" || message.module.length === 0) {
    throw new Error("request module must be a non-empty string");
  }
  const hasExport = typeof message.export === "string" && message.export.length > 0;
  const hasOperation = typeof message.operation === "string" &&
    message.operation.length > 0;
  if (hasExport === hasOperation) {
    throw new Error(
      "request must contain exactly one non-empty export or operation",
    );
  }
  if (!Array.isArray(message.arguments)) {
    throw new Error("request arguments must be an array");
  }
  if (message.timeoutMs !== undefined &&
      (!Number.isInteger(message.timeoutMs) || message.timeoutMs <= 0 ||
       message.timeoutMs > 2_147_483_647)) {
    throw new Error("request timeoutMs must be a positive 32-bit integer");
  }
}

function abortPromise(entry) {
  return new Promise((_, reject) => {
    entry.controller.signal.addEventListener("abort", () => {
      const error = new Error(
        entry.abortCode === "timeout" ? "request timed out" : "request cancelled",
      );
      error.code = entry.abortCode;
      reject(error);
    }, { once: true });
  });
}

async function executeRequest(message) {
  const startedAt = performance.now();
  let moduleLoadMs = 0;
  let executionMs = 0;
  let serializationMs = 0;
  let executionStartedAt;
  const entry = {
    controller: new AbortController(),
    abortCode: "cancelled",
    timer: undefined,
  };
  pending.set(message.id, entry);
  if (message.timeoutMs !== undefined) {
    entry.timer = setTimeout(() => {
      entry.abortCode = "timeout";
      entry.controller.abort();
    }, message.timeoutMs);
  }

  try {
    const moduleLoadStartedAt = performance.now();
    const module = await loadModule(message.module);
    moduleLoadMs = performance.now() - moduleLoadStartedAt;
    const manifest = module.__eliscript_portable__;
    const operation = message.operation === undefined
      ? module[message.export]
      : manifest && Object.hasOwn(manifest, message.operation)
        ? manifest[message.operation]
        : undefined;
    if (typeof operation !== "function") {
      const operationName = message.operation ?? message.export;
      const error = new Error(
        message.operation === undefined
          ? `module does not export a function named ${operationName}`
          : `module does not declare a portable function named ${operationName}`,
      );
      error.code = message.operation === undefined
        ? "missing-export"
        : "missing-portable";
      throw error;
    }
    const context = {
      signal: entry.controller.signal,
      progress(value) {
        if (entry.controller.signal.aborted) return;
        writeMessage({
          version: protocolVersion,
          type: "progress",
          id: message.id,
          value: jsonValue(value, "progress value"),
        });
      },
    };
    executionStartedAt = performance.now();
    const operationPromise = Promise.resolve(
      operation(...message.arguments, context),
    );
    const value = await Promise.race([operationPromise, abortPromise(entry)]);
    executionMs = performance.now() - executionStartedAt;
    const serializationStartedAt = performance.now();
    const serializedValue = jsonValue(value, "response value");
    serializationMs = performance.now() - serializationStartedAt;
    writeMessage({
      version: protocolVersion,
      type: "response",
      id: message.id,
      ok: true,
      value: serializedValue,
      timing: {
        moduleLoadMs,
        executionMs,
        serializationMs,
        workerMs: performance.now() - startedAt,
      },
    });
  } catch (error) {
    if (executionStartedAt !== undefined && executionMs === 0) {
      executionMs = performance.now() - executionStartedAt;
    }
    const code = error.code ??
      (entry.controller.signal.aborted ? entry.abortCode : "runtime");
    requestError(message.id, code, error.message, error, {
      moduleLoadMs,
      executionMs,
      serializationMs,
      workerMs: performance.now() - startedAt,
    });
  } finally {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    pending.delete(message.id);
  }
}

function cancelRequest(message) {
  if (typeof message.id !== "string" || message.id.length === 0) {
    protocolError("invalid-message", "cancel id must be a non-empty string");
    return;
  }
  const entry = pending.get(message.id);
  const accepted = Boolean(entry);
  if (entry) {
    entry.abortCode = "cancelled";
    entry.controller.abort();
  }
  writeMessage({
    version: protocolVersion,
    type: "cancel",
    id: message.id,
    accepted,
  });
}

function shutdown(lines) {
  shuttingDown = true;
  for (const entry of pending.values()) {
    entry.abortCode = "shutdown";
    entry.controller.abort();
  }
  writeMessage({
    version: protocolVersion,
    type: "shutdown",
    ok: true,
  });
  lines.close();
  setTimeout(() => process.exit(0), 0);
}

function handleMessage(message, lines) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    protocolError("invalid-message", "protocol message must be an object");
    return;
  }
  if (message.version !== protocolVersion) {
    protocolError(
      "version-mismatch",
      `worker protocol version ${protocolVersion} required`,
      message.id,
    );
    return;
  }
  if (message.type === "request") {
    try {
      validateRequest(message);
      if (pending.has(message.id)) {
        throw new Error(`request id is already pending: ${message.id}`);
      }
      void executeRequest(message);
    } catch (error) {
      requestError(message.id, "invalid-request", error.message, error);
    }
  } else if (message.type === "cancel") {
    cancelRequest(message);
  } else if (message.type === "shutdown") {
    shutdown(lines);
  } else {
    protocolError(
      "invalid-message",
      `unknown protocol message type: ${message.type}`,
      message.id,
    );
  }
}

export async function runWorker() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  writeMessage({
    version: protocolVersion,
    type: "ready",
    capabilities,
    pid: process.pid,
  });
  lines.on("close", () => {
    if (shuttingDown) return;
    for (const entry of pending.values()) {
      entry.abortCode = "shutdown";
      entry.controller.abort();
    }
  });
  for await (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > maximumLineBytes) {
      protocolError("line-too-large", "protocol line exceeds 16 MiB");
      continue;
    }
    if (line.trim().length === 0) continue;
    try {
      handleMessage(JSON.parse(line), lines);
    } catch (error) {
      protocolError("invalid-json", `invalid JSON: ${error.message}`);
    }
  }
}

if (import.meta.main) {
  runWorker().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
