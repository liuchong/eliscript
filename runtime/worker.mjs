#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  decodeWorkerValues,
  encodeWorkerValue,
  workerValueEncoding,
} from "./worker-value-codec.mjs";
import {
  WorkerValueStreamDecoder,
  encodeWorkerValueChunks,
  workerValueFraming,
  workerValueStreamLimits,
} from "./worker-value-stream.mjs";

export const protocolVersion = 1;
const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeSpecifierPrefix = "eliscript/runtime/";

function installRuntimeResolver() {
  Bun.plugin({
    name: "eliscript-worker-runtime",
    setup(build) {
      build.onResolve(
        { filter: /^eliscript\/runtime\// },
        ({ path: specifier }) => {
          const suffix = specifier.slice(runtimeSpecifierPrefix.length);
          const target = resolve(runtimeDirectory, suffix);
          const local = relative(runtimeDirectory, target);
          if (suffix.length === 0 || isAbsolute(local) ||
              local === ".." || local.startsWith(`..${sep}`)) {
            throw new Error(`worker runtime import escapes package runtime: ${specifier}`);
          }
          return { namespace: "file", path: target };
        },
      );
    },
  });
}

installRuntimeResolver();

export const capabilities = [
  "request",
  "progress",
  "cancel",
  "timeout",
  "shutdown",
  "module-cache",
  "module-version",
  "project-manifest",
  "portable-manifest",
  "runtime-resolution",
  "value-codec-v1",
  "value-chunks-v1",
];

const maximumLineBytes = 16 * 1024 * 1024;
const maximumValueChunkLineBytes = workerValueStreamLimits.maxChunkBytes + 4096;
const maximumValueStreamBytes = 768 * 1024 * 1024;
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

function mappedFrames(frames, sourceMaps) {
  if (!sourceMaps || sourceMaps.length === 0) return frames;
  const mapsByFile = new Map(
    sourceMaps.map((sourceMap) => [sourceMap.generatedFile, sourceMap]),
  );
  return frames.map((frame) => {
    const sourceMap = mapsByFile.get(resolve(frame.file));
    if (!sourceMap) return frame;
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

function errorPayload(code, message, error, sourceMaps) {
  const payload = { code, message };
  if (error?.name) payload.name = error.name;
  if (error?.path) payload.path = error.path;
  if (error?.stack) {
    payload.stack = error.stack;
    const frames = mappedFrames(stackFrames(error.stack), sourceMaps);
    if (frames.length > 0) {
      payload.frames = frames;
      payload.location = frames.find((frame) => frame.file.endsWith(".eli")) ??
        frames[0];
    }
  }
  return payload;
}

function encodeMessage(message) {
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
  return `${encoded}\n`;
}

function writeMessage(message) {
  protocolOutput.write(encodeMessage(message));
}

async function writeMessageAsync(message) {
  if (!protocolOutput.write(encodeMessage(message))) {
    await once(protocolOutput, "drain");
  }
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

function requestError(id, code, message, error, timing, sourceMaps) {
  const response = {
    version: protocolVersion,
    type: "response",
    id,
    ok: false,
    error: errorPayload(code, message, error, sourceMaps),
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

function projectManifestError(message) {
  const error = new Error(message);
  error.code = "invalid-project-manifest";
  return error;
}

function projectFile(root, value, label) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    throw projectManifestError(`${label} must be a non-empty relative path`);
  }
  const path = resolve(root, value);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(fromRoot)) {
    throw projectManifestError(`${label} escapes the project output directory`);
  }
  return path;
}

async function fileDigest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function textDigest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readProjectManifest(identity, entryUrl) {
  const url = moduleUrl(identity);
  let path;
  try {
    path = await realpath(fileURLToPath(url));
  } catch (error) {
    throw projectManifestError(`could not resolve project manifest: ${error.message}`);
  }
  const root = dirname(path);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw projectManifestError(`could not read project manifest: ${error.message}`);
  }
  if (manifest.format !== "eliscript-project" || manifest.version !== 1 ||
      typeof manifest.digest !== "string" ||
      !/^[0-9a-f]{64}$/.test(manifest.digest) ||
      !Array.isArray(manifest.modules)) {
    throw projectManifestError("project manifest has an unsupported shape");
  }
  const entry = projectFile(root, manifest.entry, "manifest entry");
  let canonicalEntry;
  let canonicalModule;
  try {
    [canonicalEntry, canonicalModule] = await Promise.all([
      realpath(entry),
      realpath(fileURLToPath(entryUrl)),
    ]);
  } catch (error) {
    throw projectManifestError(`could not resolve project entry: ${error.message}`);
  }
  if (canonicalEntry !== canonicalModule) {
    throw projectManifestError("project manifest entry does not match request module");
  }
  const identityModules = [];
  const modules = manifest.modules.map((module, index) => {
    if (!module || typeof module !== "object" ||
        typeof module.source !== "string" || module.source.length === 0 ||
        isAbsolute(module.source) ||
        module.source.split(/[\\/]/).includes("..") ||
        !/^[0-9a-f]{64}$/.test(module.sourceDigest ?? "") ||
        !/^[0-9a-f]{64}$/.test(module.outputDigest ?? "") ||
        !/^[0-9a-f]{64}$/.test(module.sourceMapDigest ?? "")) {
      throw projectManifestError(`manifest module ${index} has an unsupported shape`);
    }
    identityModules.push({
      source: module.source,
      output: module.output,
      sourceMap: module.sourceMap,
      sourceDigest: module.sourceDigest,
      outputDigest: module.outputDigest,
      sourceMapDigest: module.sourceMapDigest,
    });
    return {
      output: projectFile(root, module.output, `manifest module ${index} output`),
      sourceMap: projectFile(
        root,
        module.sourceMap,
        `manifest module ${index} source map`,
      ),
      outputDigest: module.outputDigest,
      sourceMapDigest: module.sourceMapDigest,
    };
  });
  const graphIdentity = {
    format: manifest.format,
    version: manifest.version,
    entry: manifest.entry,
    modules: identityModules,
  };
  if (textDigest(JSON.stringify(graphIdentity)) !== manifest.digest) {
    throw projectManifestError("project manifest graph digest does not match its records");
  }
  return { digest: manifest.digest, modules };
}

async function loadProjectArtifacts(project) {
  const sourceMaps = await Promise.all(project.modules.map(async (module) => {
    let outputDigest;
    let sourceMapDigest;
    try {
      [outputDigest, sourceMapDigest] = await Promise.all([
        fileDigest(module.output),
        fileDigest(module.sourceMap),
      ]);
    } catch (error) {
      throw projectManifestError(
        `could not verify generated module ${module.output}: ${error.message}`,
      );
    }
    if (outputDigest !== module.outputDigest ||
        sourceMapDigest !== module.sourceMapDigest) {
      throw projectManifestError(
        `generated module does not match project manifest: ${module.output}`,
      );
    }
    return loadSourceMap(pathToFileURL(module.output).href);
  }));
  return sourceMaps.filter(Boolean);
}

async function loadModule(identity, requestedVersion, projectManifest) {
  const url = moduleUrl(identity);
  const projectPromise = projectManifest === undefined
    ? Promise.resolve(undefined)
    : readProjectManifest(projectManifest, url);
  const discoveredProject = projectManifest !== undefined &&
      requestedVersion === undefined
    ? await projectPromise
    : undefined;
  const version = discoveredProject?.digest ?? requestedVersion ??
    await moduleFingerprint(url);
  const cacheKey = `${url}\n${projectManifest === undefined ? "" : moduleUrl(projectManifest)}`;
  const cached = moduleCache.get(cacheKey);
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
    promise: (async () => {
      const project = discoveredProject ?? await projectPromise;
      if (project && version !== project.digest) {
        const error = new Error(
          `requested module version ${version} does not match project manifest ${project.digest}`,
        );
        error.code = "module-version-mismatch";
        throw error;
      }
      const [module, sourceMaps] = await Promise.all([
        import(importUrl.href),
        project
          ? loadProjectArtifacts(project)
          : loadSourceMap(url).then((sourceMap) => sourceMap ? [sourceMap] : []),
      ]);
      return { module, sourceMaps };
    })(),
  };
  moduleCache.set(cacheKey, entry);
  try {
    const loaded = await entry.promise;
    return { ...loaded, cacheHit: false, version };
  } catch (error) {
    if (moduleCache.get(cacheKey) === entry) moduleCache.delete(cacheKey);
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
  const usesValueChunks = message.valueFraming === workerValueFraming;
  if (message.valueFraming !== undefined && !usesValueChunks) {
    throw new Error(`request valueFraming must be ${workerValueFraming}`);
  }
  if (usesValueChunks) {
    if (message.valueEncoding !== workerValueEncoding) {
      throw new Error(
        `chunked requests require valueEncoding ${workerValueEncoding}`,
      );
    }
    if (message.arguments !== undefined) {
      throw new Error("chunked requests must stream arguments after the request header");
    }
  } else if (!Array.isArray(message.arguments)) {
    throw new Error("request arguments must be an array");
  }
  if (message.valueEncoding !== undefined &&
      message.valueEncoding !== workerValueEncoding) {
    throw new Error(
      `request valueEncoding must be ${workerValueEncoding}`,
    );
  }
  if (message.moduleVersion !== undefined &&
      (typeof message.moduleVersion !== "string" ||
       message.moduleVersion.length === 0 || message.moduleVersion.length > 512)) {
    throw new Error("request moduleVersion must be a non-empty string up to 512 characters");
  }
  if (message.projectManifest !== undefined &&
      (typeof message.projectManifest !== "string" ||
       message.projectManifest.length === 0)) {
    throw new Error("request projectManifest must be a non-empty string");
  }
  if (message.timeoutMs !== undefined &&
      (!Number.isInteger(message.timeoutMs) || message.timeoutMs <= 0 ||
       message.timeoutMs > 2_147_483_647)) {
    throw new Error("request timeoutMs must be a positive 32-bit integer");
  }
}

function closeEntry(id, entry) {
  if (entry.timer !== undefined) clearTimeout(entry.timer);
  if (pending.get(id) === entry) pending.delete(id);
}

function receivingError(entry, code, message, error = undefined) {
  requestError(entry.message.id, code, message, error);
  closeEntry(entry.message.id, entry);
}

function createEntry(message, phase) {
  const entry = {
    controller: new AbortController(),
    abortCode: "cancelled",
    timer: undefined,
    phase,
    message,
    startedAt: performance.now(),
    progressIndex: 0,
    progressQueue: Promise.resolve(),
    progressError: undefined,
  };
  pending.set(message.id, entry);
  if (message.timeoutMs !== undefined) {
    entry.timer = setTimeout(() => {
      entry.abortCode = "timeout";
      entry.controller.abort();
      if (entry.phase === "receiving") {
        const error = new Error("request timed out while receiving value chunks");
        error.code = "timeout";
        receivingError(entry, "timeout", error.message, error);
      }
    }, message.timeoutMs);
  }
  return entry;
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

async function writeValueStream({
  id,
  channel,
  stream,
  value,
  signal,
  finalFields,
}) {
  const iterator = encodeWorkerValueChunks(value, { signal })[Symbol.asyncIterator]();
  let sequence = 0;
  let current = await iterator.next();
  if (current.done) {
    throw new Error("value stream encoder produced no events");
  }
  while (!current.done) {
    const next = await iterator.next();
    const final = next.done;
    const message = {
      version: protocolVersion,
      type: "value-chunk",
      id,
      channel,
      sequence,
      final,
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
      events: current.value,
    };
    if (stream !== undefined) message.stream = stream;
    if (final && finalFields) Object.assign(message, finalFields());
    await writeMessageAsync(message);
    current = next;
    sequence += 1;
  }
}

function queueProgress(entry, value) {
  const stream = String(++entry.progressIndex);
  const task = entry.progressQueue.then(() => writeValueStream({
    id: entry.message.id,
    channel: "progress",
    stream,
    value,
    signal: entry.controller.signal,
  }));
  entry.progressQueue = task.catch((error) => {
    if (entry.progressError === undefined) entry.progressError = error;
  });
  return task;
}

async function executeRequest(message, entry, streamedArguments = undefined) {
  const startedAt = entry.startedAt;
  let moduleLoadMs = 0;
  let executionMs = 0;
  let serializationMs = 0;
  let moduleCacheHit = false;
  let moduleVersion;
  let sourceMaps = [];
  let executionStartedAt;
  entry.phase = "executing";

  try {
    const moduleLoadStartedAt = performance.now();
    const loaded = await loadModule(
      message.module,
      message.moduleVersion,
      message.projectManifest,
    );
    const module = loaded.module;
    sourceMaps = loaded.sourceMaps;
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
    const usesValueCodec = message.valueEncoding === workerValueEncoding;
    const usesValueChunks = message.valueFraming === workerValueFraming;
    const arguments_ = streamedArguments !== undefined
      ? streamedArguments
      : usesValueCodec
        ? decodeWorkerValues(message.arguments)
        : message.arguments;
    const context = {
      signal: entry.controller.signal,
      progress(value) {
        if (entry.controller.signal.aborted) return;
        if (usesValueChunks) return queueProgress(entry, value);
        const response = {
          version: protocolVersion,
          type: "progress",
          id: message.id,
          value: usesValueCodec
            ? encodeWorkerValue(value)
            : jsonValue(value, "progress value"),
        };
        if (usesValueCodec) response.valueEncoding = workerValueEncoding;
        writeMessage(response);
      },
    };
    executionStartedAt = performance.now();
    const operationPromise = Promise.resolve(
      operation(...arguments_, context),
    );
    const value = await Promise.race([operationPromise, abortPromise(entry)]);
    executionMs = performance.now() - executionStartedAt;
    await entry.progressQueue;
    if (entry.progressError !== undefined) throw entry.progressError;
    const serializationStartedAt = performance.now();
    if (usesValueChunks) {
      await writeValueStream({
        id: message.id,
        channel: "response",
        value,
        signal: entry.controller.signal,
        finalFields() {
          serializationMs = performance.now() - serializationStartedAt;
          return {
            timing: {
              moduleLoadMs,
              moduleCacheHit,
              moduleVersion,
              sourceMapLoaded: sourceMaps.length > 0,
              sourceMapCount: sourceMaps.length,
              executionMs,
              serializationMs,
              workerMs: performance.now() - startedAt,
            },
          };
        },
      });
      return;
    }
    const serializedValue = usesValueCodec
      ? encodeWorkerValue(value)
      : jsonValue(value, "response value");
    serializationMs = performance.now() - serializationStartedAt;
    const response = {
      version: protocolVersion,
      type: "response",
      id: message.id,
      ok: true,
      value: serializedValue,
      timing: {
        moduleLoadMs,
        moduleCacheHit,
        moduleVersion,
        sourceMapLoaded: sourceMaps.length > 0,
        sourceMapCount: sourceMaps.length,
        executionMs,
        serializationMs,
        workerMs: performance.now() - startedAt,
      },
    };
    if (usesValueCodec) response.valueEncoding = workerValueEncoding;
    writeMessage(response);
  } catch (error) {
    if (executionStartedAt !== undefined && executionMs === 0) {
      executionMs = performance.now() - executionStartedAt;
    }
    const code = entry.controller.signal.aborted
      ? entry.abortCode
      : error.code ?? "runtime";
    requestError(
      message.id,
      code,
      error.message,
      error,
      {
        moduleLoadMs,
        moduleCacheHit,
        moduleVersion,
        sourceMapLoaded: sourceMaps.length > 0,
        sourceMapCount: sourceMaps.length,
        executionMs,
        serializationMs,
        workerMs: performance.now() - startedAt,
      },
      sourceMaps,
    );
  } finally {
    closeEntry(message.id, entry);
  }
}

function valueAck(id, sequence, final = false) {
  writeMessage({
    version: protocolVersion,
    type: "value-ack",
    id,
    channel: "arguments",
    sequence,
    final,
    valueEncoding: workerValueEncoding,
    valueFraming: workerValueFraming,
  });
}

function startRequest(message) {
  validateRequest(message);
  if (pending.has(message.id)) {
    throw new Error(`request id is already pending: ${message.id}`);
  }
  if (message.valueFraming === workerValueFraming) {
    const entry = createEntry(message, "receiving");
    entry.decoder = new WorkerValueStreamDecoder({
      signal: entry.controller.signal,
    });
    entry.sequence = 0;
    entry.framedBytes = 0;
    valueAck(message.id, -1);
    return;
  }
  const entry = createEntry(message, "executing");
  void executeRequest(message, entry);
}

function receiveValueChunk(message, lineBytes) {
  if (typeof message.id !== "string" || message.id.length === 0) {
    protocolError("invalid-message", "value chunk id must be a non-empty string");
    return;
  }
  const entry = pending.get(message.id);
  if (!entry || entry.phase !== "receiving") {
    protocolError(
      "invalid-message",
      `no request is receiving value chunks for id ${message.id}`,
      message.id,
    );
    return;
  }
  try {
    if (lineBytes > maximumValueChunkLineBytes) {
      throw new Error(
        `value chunk exceeds ${maximumValueChunkLineBytes} framed bytes`,
      );
    }
    if (message.channel !== "arguments") {
      throw new Error("incoming value chunk channel must be arguments");
    }
    if (message.valueEncoding !== workerValueEncoding ||
        message.valueFraming !== workerValueFraming) {
      throw new Error("incoming value chunk encoding or framing mismatch");
    }
    if (!Number.isSafeInteger(message.sequence) || message.sequence < 0 ||
        message.sequence !== entry.sequence) {
      throw new Error(
        `value chunk sequence ${String(message.sequence)} does not match ${entry.sequence}`,
      );
    }
    if (typeof message.final !== "boolean") {
      throw new Error("value chunk final must be a boolean");
    }
    if (!Array.isArray(message.events)) {
      throw new Error("value chunk events must be an array");
    }
    entry.framedBytes += lineBytes;
    if (entry.framedBytes > maximumValueStreamBytes) {
      throw new Error(
        `value stream exceeds ${maximumValueStreamBytes} framed bytes`,
      );
    }
    entry.decoder.write(message.events);
    const sequence = entry.sequence;
    entry.sequence += 1;
    if (!message.final) {
      valueAck(message.id, sequence);
      return;
    }
    const arguments_ = entry.decoder.finish();
    if (!Array.isArray(arguments_)) {
      throw new Error("chunked request root must decode to an argument array");
    }
    entry.decoder = undefined;
    entry.phase = "executing";
    valueAck(message.id, sequence, true);
    void executeRequest(entry.message, entry, arguments_);
  } catch (error) {
    entry.controller.abort();
    receivingError(
      entry,
      error.code ?? "invalid-value-chunk",
      error.message,
      error,
    );
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
  if (entry?.phase === "receiving") {
    const error = new Error("request cancelled while receiving value chunks");
    error.code = "cancelled";
    receivingError(entry, "cancelled", error.message, error);
  }
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

function handleMessage(message, lines, lineBytes) {
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
      startRequest(message);
    } catch (error) {
      requestError(message.id, "invalid-request", error.message, error);
    }
  } else if (message.type === "value-chunk") {
    receiveValueChunk(message, lineBytes);
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
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (lineBytes > maximumLineBytes) {
      protocolError("line-too-large", "protocol line exceeds 16 MiB");
      continue;
    }
    if (line.trim().length === 0) continue;
    try {
      handleMessage(JSON.parse(line), lines, lineBytes);
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
