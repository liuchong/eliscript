#!/usr/bin/env bun

import { resolve } from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

export const protocolVersion = 1;
export const capabilities = [
  "request",
  "progress",
  "cancel",
  "timeout",
  "shutdown",
  "module-cache",
  "module-version",
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

function stackFrames(stack) {
  if (typeof stack !== "string") return [];
  const frames = [];
  for (const line of stack.split("\n")) {
    const match = line.match(/^\s*at (?:(.*?) \()?(.+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    let file = match[2];
    if (file.startsWith("file:")) {
      try {
        file = fileURLToPath(file);
      } catch {
        // Preserve an unrecognized URL as reported by the runtime.
      }
    }
    frames.push({
      function: match[1] || undefined,
      file,
      line: Number(match[3]),
      column: Number(match[4]),
    });
  }
  return frames;
}

function mappedFrames(frames, sourceMap) {
  if (!sourceMap) return frames;
  return frames.map((frame) => {
    if (resolve(frame.file) !== sourceMap.generatedFile) return frame;
    const mapping = sourceMap.lines[frame.line - 1];
    if (!mapping) return frame;
    const generatedColumn = Math.max(0, frame.column - 1);
    let segment;
    for (const candidate of mapping) {
      if (candidate.generatedColumn > generatedColumn) break;
      segment = candidate;
    }
    if (!segment || segment.source === undefined) return frame;
    return {
      ...frame,
      generated: {
        file: frame.file,
        line: frame.line,
        column: frame.column,
      },
      file: sourceMap.sources[segment.source],
      line: segment.originalLine + 1,
      column: segment.originalColumn + 1,
    };
  });
}

function errorPayload(code, message, error, sourceMap) {
  const payload = { code, message };
  if (error?.name) payload.name = error.name;
  if (error?.stack) {
    payload.stack = error.stack;
    const frames = mappedFrames(stackFrames(error.stack), sourceMap);
    if (frames.length > 0) {
      payload.frames = frames;
      payload.location = frames.find((frame) => frame.file.endsWith(".eli")) ??
        frames[0];
    }
  }
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

function requestError(id, code, message, error, timing, sourceMap) {
  const response = {
    version: protocolVersion,
    type: "response",
    id,
    ok: false,
    error: errorPayload(code, message, error, sourceMap),
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

const base64Vlq = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeVlq(segment) {
  const values = [];
  let index = 0;
  while (index < segment.length) {
    let value = 0;
    let shift = 0;
    let continuation;
    do {
      const digit = base64Vlq.indexOf(segment[index]);
      if (digit === -1) throw new Error("invalid Base64 VLQ digit");
      index += 1;
      value |= (digit & 31) << shift;
      continuation = (digit & 32) !== 0;
      shift += 5;
    } while (continuation);
    const negative = (value & 1) === 1;
    value >>= 1;
    values.push(negative ? -value : value);
  }
  return values;
}

function decodeMappings(mappings) {
  let source = 0;
  let originalLine = 0;
  let originalColumn = 0;
  return mappings.split(";").map((encodedLine) => {
    let generatedColumn = 0;
    const line = [];
    for (const encoded of encodedLine.split(",")) {
      if (!encoded) continue;
      const values = decodeVlq(encoded);
      generatedColumn += values[0];
      const decoded = { generatedColumn };
      if (values.length >= 4) {
        source += values[1];
        originalLine += values[2];
        originalColumn += values[3];
        decoded.source = source;
        decoded.originalLine = originalLine;
        decoded.originalColumn = originalColumn;
      }
      line.push(decoded);
    }
    return line;
  });
}

export async function loadSourceMap(moduleUrl_) {
  try {
    const cleanUrl = new URL(moduleUrl_);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    const javascript = await readFile(fileURLToPath(cleanUrl), "utf8");
    const match = javascript.match(/\/\/# sourceMappingURL=([^\s]+)\s*$/);
    if (!match || match[1].startsWith("data:")) return undefined;
    const mapUrl = new URL(match[1], cleanUrl);
    const map = JSON.parse(await readFile(fileURLToPath(mapUrl), "utf8"));
    if (map.version !== 3 || typeof map.mappings !== "string" ||
        !Array.isArray(map.sources)) return undefined;
    return {
      generatedFile: resolve(await realpath(fileURLToPath(cleanUrl))),
      sources: map.sources.map((source) => {
        const sourceUrl = new URL(source, mapUrl);
        return sourceUrl.protocol === "file:"
          ? resolve(fileURLToPath(sourceUrl))
          : sourceUrl.href;
      }),
      lines: decodeMappings(map.mappings),
    };
  } catch (error) {
    console.error(`could not load source map for ${moduleUrl_}: ${error.message}`);
    return undefined;
  }
}

async function moduleFingerprint(url) {
  const fileUrl = new URL(url);
  fileUrl.search = "";
  fileUrl.hash = "";
  const metadata = await stat(fileURLToPath(fileUrl), { bigint: true });
  return `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeNs}`;
}

async function loadModule(identity, requestedVersion) {
  const url = moduleUrl(identity);
  const version = requestedVersion ?? await moduleFingerprint(url);
  const cached = moduleCache.get(url);
  if (cached?.version === version) {
    const loaded = await cached.promise;
    return { ...loaded, cacheHit: true, version };
  }
  if (cached) {
    const error = new Error(
      `module version changed from ${cached.version} to ${version}; restart the worker before loading it`,
    );
    error.code = "module-version-changed";
    throw error;
  }
  const importUrl = new URL(url);
  importUrl.searchParams.set("__eliscript_worker_version", version);
  const entry = {
    version,
    promise: Promise.all([
      import(importUrl.href),
      loadSourceMap(url),
    ]).then(([module, sourceMap]) => ({ module, sourceMap })),
  };
  moduleCache.set(url, entry);
  try {
    const loaded = await entry.promise;
    return { ...loaded, cacheHit: false, version };
  } catch (error) {
    if (moduleCache.get(url) === entry) moduleCache.delete(url);
    throw error;
  }
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
  if (message.moduleVersion !== undefined &&
      (typeof message.moduleVersion !== "string" ||
       message.moduleVersion.length === 0 || message.moduleVersion.length > 512)) {
    throw new Error("request moduleVersion must be a non-empty string up to 512 characters");
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
  let moduleCacheHit = false;
  let moduleVersion;
  let sourceMap;
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
    const loaded = await loadModule(message.module, message.moduleVersion);
    const module = loaded.module;
    sourceMap = loaded.sourceMap;
    moduleCacheHit = loaded.cacheHit;
    moduleVersion = loaded.version;
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
        moduleCacheHit,
        moduleVersion,
        sourceMapLoaded: Boolean(sourceMap),
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
    requestError(
      message.id,
      code,
      error.message,
      error,
      {
        moduleLoadMs,
        moduleCacheHit,
        moduleVersion,
        sourceMapLoaded: Boolean(sourceMap),
        executionMs,
        serializationMs,
        workerMs: performance.now() - startedAt,
      },
      sourceMap,
    );
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
