import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import {
  eliscriptSymbol,
  isEliscriptSymbol,
  isKeyword,
  keyword,
} from "./core/identifier.mjs";
import { EMPTY_LIST, isPersistentList } from "./core/list.mjs";
import {
  isPersistentHashMap,
  persistentHashMap,
} from "./core/map.mjs";
import { meta, withMeta } from "./core/metadata.mjs";
import {
  isPersistentHashSet,
  persistentHashSet,
} from "./core/set.mjs";
import {
  assocBang,
  conjBang,
  persistentBang,
  transient,
} from "./core/transient.mjs";
import {
  isPersistentVector,
  persistentVector,
} from "./core/vector.mjs";

export const workerValueFraming = "eliscript-value-chunks-v1";

export const workerValueStreamLimits = Object.freeze({
  maxDepth: 64,
  maxNodes: 8_000_000,
  maxCollectionLength: 4_000_000,
  maxStringUnits: 268_435_456,
  maxTotalStringUnits: 536_870_912,
  maxChunkBytes: 256 * 1024,
  maxEventsPerChunk: 512,
  maxTextPartUnits: 8_192,
});

const SPECIAL_NUMBERS = new Map([
  ["nan", Number.NaN],
  ["positive-infinity", Number.POSITIVE_INFINITY],
  ["negative-infinity", Number.NEGATIVE_INFINITY],
  ["negative-zero", -0],
]);

export class WorkerValueStreamError extends TypeError {
  constructor(code, message, path = "$") {
    super(`${message} at ${path}`);
    this.name = "WorkerValueStreamError";
    this.code = code;
    this.path = path;
  }
}

function normalizedLimits(options = {}) {
  const limits = { ...workerValueStreamLimits, ...options };
  for (const name of Object.keys(workerValueStreamLimits)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  if (limits.maxTextPartUnits < 2) {
    throw new TypeError("maxTextPartUnits must be at least 2");
  }
  if (limits.maxTextPartUnits > limits.maxStringUnits) {
    throw new TypeError("maxTextPartUnits cannot exceed maxStringUnits");
  }
  return limits;
}

function createState(mode, options) {
  return {
    active: new WeakSet(),
    limits: normalizedLimits(options),
    mode,
    nodes: 0,
    stringUnits: 0,
  };
}

function streamError(state, suffix, message, path) {
  throw new WorkerValueStreamError(
    `value-stream-${state.mode}-${suffix}`,
    message,
    path,
  );
}

function checkAbort(signal, path) {
  if (signal?.aborted) {
    throw new WorkerValueStreamError(
      "value-stream-cancelled",
      "value stream traversal was cancelled",
      path,
    );
  }
}

function visit(state, depth, path) {
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    streamError(
      state,
      "limit",
      `value stream exceeds ${state.limits.maxNodes} nodes`,
      path,
    );
  }
  if (depth > state.limits.maxDepth) {
    streamError(
      state,
      "limit",
      `value stream exceeds depth ${state.limits.maxDepth}`,
      path,
    );
  }
}

function collectionLength(state, length, path) {
  if (!Number.isSafeInteger(length) || length < 0) {
    streamError(state, "invalid", "collection length must be a safe integer", path);
  }
  if (length > state.limits.maxCollectionLength) {
    streamError(
      state,
      "limit",
      `collection exceeds ${state.limits.maxCollectionLength} values`,
      path,
    );
  }
}

function stringLength(state, length, path) {
  if (!Number.isSafeInteger(length) || length < 0) {
    streamError(state, "invalid", "string length must be a safe integer", path);
  }
  if (length > state.limits.maxStringUnits) {
    streamError(
      state,
      "limit",
      `string exceeds ${state.limits.maxStringUnits} UTF-16 units`,
      path,
    );
  }
  state.stringUnits += length;
  if (state.stringUnits > state.limits.maxTotalStringUnits) {
    streamError(
      state,
      "limit",
      `value stream exceeds ${state.limits.maxTotalStringUnits} string units`,
      path,
    );
  }
}

function activate(state, value, path) {
  if (state.active.has(value)) {
    streamError(state, "cycle", "cyclic values are not transportable", path);
  }
  state.active.add(value);
}

function textPartEnd(value, start, maximumUnits) {
  let end = Math.min(value.length, start + maximumUnits);
  if (end < value.length && end > start) {
    const previous = value.charCodeAt(end - 1);
    const next = value.charCodeAt(end);
    if (previous >= 0xd800 && previous <= 0xdbff &&
        next >= 0xdc00 && next <= 0xdfff) {
      end -= 1;
    }
  }
  return end === start ? Math.min(value.length, start + 1) : end;
}

async function* encodeText(value, state, path, signal) {
  stringLength(state, value.length, path);
  yield ["text", value.length];
  for (let start = 0; start < value.length;) {
    checkAbort(signal, path);
    const end = textPartEnd(value, start, state.limits.maxTextPartUnits);
    yield ["text-part", value.slice(start, end)];
    start = end;
  }
}

function plainObjectEntries(value, state, path) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    streamError(
      state,
      "unsupported",
      `unsupported object ${Object.prototype.toString.call(value)}`,
      path,
    );
  }
  const symbolKeys = Object.getOwnPropertySymbols(value).filter(
    (key) => Object.prototype.propertyIsEnumerable.call(value, key),
  );
  if (symbolKeys.length > 0) {
    streamError(
      state,
      "unsupported",
      "host objects with enumerable Symbol keys are not transportable",
      path,
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).filter((key) => descriptors[key].enumerable);
  collectionLength(state, keys.length, path);
  return keys.map((key) => {
    const descriptor = descriptors[key];
    if (!("value" in descriptor)) {
      streamError(
        state,
        "unsupported",
        "host object accessors are not transportable",
        `${path}.${key}`,
      );
    }
    return [key, descriptor.value];
  });
}

async function* encodeValue(value, state, depth, path, signal) {
  checkAbort(signal, path);
  visit(state, depth, path);
  if (value === null || typeof value === "boolean") {
    yield ["value", value];
    return;
  }
  if (typeof value === "string") {
    yield* encodeText(value, state, path, signal);
    return;
  }
  if (value === undefined) {
    yield ["undefined"];
    return;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) yield ["number", "nan"];
    else if (value === Number.POSITIVE_INFINITY) {
      yield ["number", "positive-infinity"];
    } else if (value === Number.NEGATIVE_INFINITY) {
      yield ["number", "negative-infinity"];
    } else if (Object.is(value, -0)) yield ["number", "negative-zero"];
    else yield ["value", value];
    return;
  }
  if (isKeyword(value)) {
    yield ["open", "keyword", 2];
    yield* encodeValue(value.namespace, state, depth + 1, `${path}.namespace`, signal);
    yield* encodeValue(value.name, state, depth + 1, `${path}.name`, signal);
    return;
  }
  if (isEliscriptSymbol(value)) {
    activate(state, value, path);
    try {
      yield ["open", "symbol", 3];
      yield* encodeValue(value.namespace, state, depth + 1, `${path}.namespace`, signal);
      yield* encodeValue(value.name, state, depth + 1, `${path}.name`, signal);
      yield* encodeValue(meta(value), state, depth + 1, `${path}.metadata`, signal);
    } finally {
      state.active.delete(value);
    }
    return;
  }
  if (isPersistentList(value) || isPersistentVector(value)) {
    activate(state, value, path);
    try {
      collectionLength(state, value.count, path);
      yield ["open", isPersistentList(value) ? "list" : "vector", value.count];
      let index = 0;
      for (const item of value) {
        yield* encodeValue(item, state, depth + 1, `${path}[${index}]`, signal);
        index += 1;
      }
      yield* encodeValue(meta(value), state, depth + 1, `${path}.metadata`, signal);
    } finally {
      state.active.delete(value);
    }
    return;
  }
  if (isPersistentHashMap(value)) {
    activate(state, value, path);
    try {
      collectionLength(state, value.count, path);
      yield ["open", "map", value.count];
      let index = 0;
      for (const [key, item] of value) {
        yield* encodeValue(key, state, depth + 1, `${path}.keys[${index}]`, signal);
        yield* encodeValue(item, state, depth + 1, `${path}.values[${index}]`, signal);
        index += 1;
      }
      yield* encodeValue(meta(value), state, depth + 1, `${path}.metadata`, signal);
    } finally {
      state.active.delete(value);
    }
    return;
  }
  if (isPersistentHashSet(value)) {
    activate(state, value, path);
    try {
      collectionLength(state, value.count, path);
      yield ["open", "set", value.count];
      let index = 0;
      for (const item of value) {
        yield* encodeValue(item, state, depth + 1, `${path}[${index}]`, signal);
        index += 1;
      }
      yield* encodeValue(meta(value), state, depth + 1, `${path}.metadata`, signal);
    } finally {
      state.active.delete(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    activate(state, value, path);
    try {
      collectionLength(state, value.length, path);
      yield ["open", "array", value.length];
      for (let index = 0; index < value.length; index += 1) {
        yield* encodeValue(value[index], state, depth + 1, `${path}[${index}]`, signal);
      }
    } finally {
      state.active.delete(value);
    }
    return;
  }
  if (typeof value === "object") {
    activate(state, value, path);
    try {
      const entries = plainObjectEntries(value, state, path);
      yield ["open", "object", entries.length];
      for (let index = 0; index < entries.length; index += 1) {
        const [key, item] = entries[index];
        yield* encodeValue(key, state, depth + 1, `${path}.keys[${index}]`, signal);
        yield* encodeValue(item, state, depth + 1, `${path}.${key}`, signal);
      }
    } finally {
      state.active.delete(value);
    }
    return;
  }
  streamError(state, "unsupported", `unsupported ${typeof value} value`, path);
}

export async function* encodeWorkerValueEvents(value, options = {}) {
  const { signal, ...limitOptions } = options;
  const state = createState("encoding", limitOptions);
  yield* encodeValue(value, state, 0, "$", signal);
}

function eventBytes(event) {
  return Buffer.byteLength(JSON.stringify(event), "utf8");
}

export async function* encodeWorkerValueChunks(value, options = {}) {
  const limits = normalizedLimits(options);
  let events = [];
  let bytes = 2;
  for await (const event of encodeWorkerValueEvents(value, options)) {
    const size = eventBytes(event);
    if (size + 2 > limits.maxChunkBytes) {
      throw new WorkerValueStreamError(
        "value-stream-encoding-limit",
        `one value event exceeds ${limits.maxChunkBytes} bytes`,
      );
    }
    const added = size + (events.length === 0 ? 0 : 1);
    if (events.length > 0 &&
        (bytes + added > limits.maxChunkBytes ||
         events.length >= limits.maxEventsPerChunk)) {
      yield events;
      await yieldToEventLoop();
      events = [];
      bytes = 2;
    }
    events.push(event);
    bytes += size + (events.length === 1 ? 0 : 1);
  }
  if (events.length > 0) yield events;
}

function requireEvent(event, length, tag, path) {
  if (!Array.isArray(event) || event.length !== length || event[0] !== tag) {
    throw new WorkerValueStreamError(
      "value-stream-decoding-invalid",
      `${tag} event must contain ${length} fields`,
      path,
    );
  }
}

function requireName(value, label, path, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkerValueStreamError(
      "value-stream-decoding-invalid",
      `${label} must be a non-empty string${nullable ? " or null" : ""}`,
      path,
    );
  }
  return value;
}

function metadata(value, path) {
  if (value === null) return null;
  if (!isPersistentHashMap(value)) {
    throw new WorkerValueStreamError(
      "value-stream-decoding-invalid",
      "metadata must decode to a persistent Map",
      path,
    );
  }
  return value;
}

function childPath(frame) {
  const index = frame.received;
  switch (frame.tag) {
    case "keyword":
    case "symbol":
      return `${frame.path}.${["namespace", "name", "metadata"][index]}`;
    case "list":
    case "vector":
    case "set":
      return index < frame.length
        ? `${frame.path}[${index}]`
        : `${frame.path}.metadata`;
    case "array":
      return `${frame.path}[${index}]`;
    case "map":
      if (index === frame.length * 2) return `${frame.path}.metadata`;
      return index % 2 === 0
        ? `${frame.path}.keys[${index / 2}]`
        : `${frame.path}.values[${(index - 1) / 2}]`;
    case "object":
      return index % 2 === 0
        ? `${frame.path}.keys[${index / 2}]`
        : `${frame.path}.values[${(index - 1) / 2}]`;
    default:
      return frame.path;
  }
}

function makeFrame(tag, length, path, state) {
  if (typeof tag !== "string" || !Number.isSafeInteger(length) || length < 0) {
    streamError(state, "invalid", "open event tag and length are invalid", path);
  }
  if (tag === "keyword" && length !== 2) {
    streamError(state, "invalid", "keyword open event must declare arity 2", path);
  }
  if (tag === "symbol" && length !== 3) {
    streamError(state, "invalid", "symbol open event must declare arity 3", path);
  }
  if (!["keyword", "symbol", "list", "vector", "map", "set", "array", "object"].includes(tag)) {
    streamError(state, "invalid", `unknown open event tag ${tag}`, path);
  }
  if (!["keyword", "symbol"].includes(tag)) collectionLength(state, length, path);
  const expected = tag === "keyword" || tag === "symbol"
    ? length
    : tag === "map" || tag === "object"
      ? length * 2 + (tag === "map" ? 1 : 0)
      : length + (["list", "vector", "set"].includes(tag) ? 1 : 0);
  const frame = { tag, length, path, expected, received: 0 };
  if (["keyword", "symbol"].includes(tag)) frame.values = [];
  else if (tag === "list" || tag === "array") frame.values = [];
  else if (tag === "vector") frame.builder = transient(persistentVector());
  else if (tag === "map") frame.builder = transient(persistentHashMap());
  else if (tag === "set") frame.builder = transient(persistentHashSet());
  else if (tag === "object") {
    frame.value = {};
    frame.keys = new Set();
  }
  return frame;
}

function consumeFrame(frame, value) {
  const index = frame.received;
  switch (frame.tag) {
    case "keyword":
    case "symbol":
      frame.values.push(value);
      break;
    case "list":
    case "array":
      if (index < frame.length) frame.values.push(value);
      else frame.metadata = value;
      break;
    case "vector":
      if (index < frame.length) frame.builder = conjBang(frame.builder, value);
      else frame.metadata = value;
      break;
    case "map":
      if (index === frame.length * 2) frame.metadata = value;
      else if (index % 2 === 0) frame.key = value;
      else frame.builder = assocBang(frame.builder, frame.key, value);
      break;
    case "set":
      if (index < frame.length) frame.builder = conjBang(frame.builder, value);
      else frame.metadata = value;
      break;
    case "object":
      if (index % 2 === 0) {
        const key = requireName(value, "object key", childPath(frame));
        if (frame.keys.has(key)) {
          throw new WorkerValueStreamError(
            "value-stream-decoding-invalid",
            `object contains duplicate key ${key}`,
            childPath(frame),
          );
        }
        frame.keys.add(key);
        frame.key = key;
      } else {
        Object.defineProperty(frame.value, frame.key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      }
      break;
  }
  frame.received += 1;
}

function finalizeFrame(frame) {
  switch (frame.tag) {
    case "keyword": {
      const namespace = requireName(
        frame.values[0],
        "keyword namespace",
        `${frame.path}.namespace`,
        true,
      );
      const name = requireName(frame.values[1], "keyword name", `${frame.path}.name`);
      return namespace === null ? keyword(name) : keyword(namespace, name);
    }
    case "symbol": {
      const namespace = requireName(
        frame.values[0],
        "symbol namespace",
        `${frame.path}.namespace`,
        true,
      );
      const name = requireName(frame.values[1], "symbol name", `${frame.path}.name`);
      const result = namespace === null
        ? eliscriptSymbol(name)
        : eliscriptSymbol(namespace, name);
      const valueMetadata = metadata(frame.values[2], `${frame.path}.metadata`);
      return valueMetadata === null ? result : withMeta(result, valueMetadata);
    }
    case "list": {
      let result = EMPTY_LIST;
      for (let index = frame.values.length - 1; index >= 0; index -= 1) {
        result = result.conj(frame.values[index]);
      }
      const valueMetadata = metadata(frame.metadata, `${frame.path}.metadata`);
      return valueMetadata === null ? result : withMeta(result, valueMetadata);
    }
    case "vector": {
      const result = persistentBang(frame.builder);
      const valueMetadata = metadata(frame.metadata, `${frame.path}.metadata`);
      return valueMetadata === null ? result : withMeta(result, valueMetadata);
    }
    case "map": {
      const result = persistentBang(frame.builder);
      if (result.count !== frame.length) {
        throw new WorkerValueStreamError(
          "value-stream-decoding-invalid",
          "map contains an equivalent duplicate key",
          frame.path,
        );
      }
      const valueMetadata = metadata(frame.metadata, `${frame.path}.metadata`);
      return valueMetadata === null ? result : withMeta(result, valueMetadata);
    }
    case "set": {
      const result = persistentBang(frame.builder);
      if (result.count !== frame.length) {
        throw new WorkerValueStreamError(
          "value-stream-decoding-invalid",
          "set contains an equivalent duplicate value",
          frame.path,
        );
      }
      const valueMetadata = metadata(frame.metadata, `${frame.path}.metadata`);
      return valueMetadata === null ? result : withMeta(result, valueMetadata);
    }
    case "array":
      return frame.values;
    case "object":
      return frame.value;
    default:
      throw new WorkerValueStreamError(
        "value-stream-decoding-invalid",
        `cannot finalize unknown container ${frame.tag}`,
        frame.path,
      );
  }
}

export class WorkerValueStreamDecoder {
  constructor(options = {}) {
    this.state = createState("decoding", options);
    this.signal = options.signal;
    this.stack = [];
    this.text = undefined;
    this.hasRoot = false;
    this.root = undefined;
    this.finished = false;
  }

  currentPath() {
    const frame = this.stack.at(-1);
    return frame ? childPath(frame) : "$";
  }

  accept(value) {
    let completed = value;
    while (true) {
      const frame = this.stack.at(-1);
      if (!frame) {
        if (this.hasRoot) {
          streamError(this.state, "invalid", "value stream contains multiple roots", "$");
        }
        this.root = completed;
        this.hasRoot = true;
        return;
      }
      consumeFrame(frame, completed);
      if (frame.received < frame.expected) return;
      this.stack.pop();
      completed = finalizeFrame(frame);
    }
  }

  startText(length, path) {
    stringLength(this.state, length, path);
    if (length === 0) {
      this.accept("");
      return;
    }
    this.text = { path, remaining: length, parts: [] };
  }

  writeTextPart(event) {
    requireEvent(event, 2, "text-part", this.text.path);
    const part = event[1];
    if (typeof part !== "string" || part.length === 0) {
      streamError(this.state, "invalid", "text-part payload must be non-empty", this.text.path);
    }
    if (part.length > this.text.remaining) {
      streamError(this.state, "invalid", "text parts exceed declared string length", this.text.path);
    }
    this.text.parts.push(part);
    this.text.remaining -= part.length;
    if (this.text.remaining === 0) {
      const value = this.text.parts.join("");
      this.text = undefined;
      this.accept(value);
    }
  }

  writeEvent(event) {
    checkAbort(this.signal, this.currentPath());
    if (this.finished) {
      streamError(this.state, "invalid", "cannot write after stream completion", "$");
    }
    if (this.text) {
      this.writeTextPart(event);
      return;
    }
    if (!Array.isArray(event) || event.length === 0 || typeof event[0] !== "string") {
      streamError(this.state, "invalid", "value event must be a tagged array", this.currentPath());
    }
    const path = this.currentPath();
    switch (event[0]) {
      case "value":
        requireEvent(event, 2, "value", path);
        if (!(event[1] === null || typeof event[1] === "boolean" ||
              (typeof event[1] === "number" && Number.isFinite(event[1])))) {
          streamError(this.state, "invalid", "value event contains an invalid scalar", path);
        }
        visit(this.state, this.stack.length, path);
        this.accept(event[1]);
        break;
      case "undefined":
        requireEvent(event, 1, "undefined", path);
        visit(this.state, this.stack.length, path);
        this.accept(undefined);
        break;
      case "number":
        requireEvent(event, 2, "number", path);
        if (!SPECIAL_NUMBERS.has(event[1])) {
          streamError(this.state, "invalid", `unknown special number ${String(event[1])}`, path);
        }
        visit(this.state, this.stack.length, path);
        this.accept(SPECIAL_NUMBERS.get(event[1]));
        break;
      case "text":
        requireEvent(event, 2, "text", path);
        visit(this.state, this.stack.length, path);
        this.startText(event[1], path);
        break;
      case "open": {
        requireEvent(event, 3, "open", path);
        visit(this.state, this.stack.length, path);
        const frame = makeFrame(event[1], event[2], path, this.state);
        this.stack.push(frame);
        if (frame.expected === 0) {
          this.stack.pop();
          this.accept(finalizeFrame(frame));
        }
        break;
      }
      default:
        streamError(this.state, "invalid", `unknown value event ${event[0]}`, path);
    }
  }

  write(events) {
    if (!Array.isArray(events)) {
      streamError(this.state, "invalid", "value chunk events must be an array", this.currentPath());
    }
    let bytes;
    try {
      bytes = Buffer.byteLength(JSON.stringify(events), "utf8");
    } catch (error) {
      streamError(
        this.state,
        "invalid",
        `value chunk is not JSON-serializable: ${error.message}`,
        this.currentPath(),
      );
    }
    if (bytes > this.state.limits.maxChunkBytes) {
      streamError(
        this.state,
        "limit",
        `value chunk exceeds ${this.state.limits.maxChunkBytes} bytes`,
        this.currentPath(),
      );
    }
    if (events.length > this.state.limits.maxEventsPerChunk) {
      streamError(
        this.state,
        "limit",
        `value chunk exceeds ${this.state.limits.maxEventsPerChunk} events`,
        this.currentPath(),
      );
    }
    for (const event of events) this.writeEvent(event);
    return this;
  }

  finish() {
    checkAbort(this.signal, this.currentPath());
    if (this.finished) {
      streamError(this.state, "invalid", "value stream was already completed", "$");
    }
    if (this.text) {
      streamError(this.state, "truncated", "value stream ended inside a string", this.text.path);
    }
    if (this.stack.length > 0) {
      streamError(this.state, "truncated", "value stream ended inside a container", this.currentPath());
    }
    if (!this.hasRoot) {
      streamError(this.state, "truncated", "value stream did not contain a root", "$");
    }
    this.finished = true;
    return this.root;
  }
}

export async function decodeWorkerValueChunks(chunks, options = {}) {
  const decoder = new WorkerValueStreamDecoder(options);
  for await (const events of chunks) decoder.write(events);
  return decoder.finish();
}
