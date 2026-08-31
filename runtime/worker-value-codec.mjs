import {
  eliscriptSymbol,
  isEliscriptSymbol,
  isKeyword,
  keyword,
} from "./core/identifier.mjs";
import {
  isPersistentList,
  persistentList,
} from "./core/list.mjs";
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
  isPersistentVector,
  persistentVector,
} from "./core/vector.mjs";

export const workerValueEncoding = "eliscript-value-v1";

export const workerValueLimits = Object.freeze({
  maxDepth: 64,
  maxNodes: 100_000,
  maxCollectionLength: 100_000,
});

const SPECIAL_NUMBERS = new Map([
  ["nan", Number.NaN],
  ["positive-infinity", Number.POSITIVE_INFINITY],
  ["negative-infinity", Number.NEGATIVE_INFINITY],
  ["negative-zero", -0],
]);
const wireEncoder = new TextEncoder();

export class WorkerValueCodecError extends TypeError {
  constructor(code, message, path = "$") {
    super(`${message} at ${path}`);
    this.name = "WorkerValueCodecError";
    this.code = code;
    this.path = path;
  }
}

function normalizedLimits(options = {}) {
  const limits = { ...workerValueLimits, ...options };
  for (const name of Object.keys(workerValueLimits)) {
    if (!Number.isInteger(limits[name]) || limits[name] < 1) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }
  return limits;
}

function createState(mode, options) {
  return {
    active: new WeakSet(),
    limits: normalizedLimits(options),
    mode,
    nodes: 0,
  };
}

function visit(state, depth, path) {
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    throw new WorkerValueCodecError(
      `value-${state.mode}-limit`,
      `value exceeds ${state.limits.maxNodes} nodes`,
      path,
    );
  }
  if (depth > state.limits.maxDepth) {
    throw new WorkerValueCodecError(
      `value-${state.mode}-limit`,
      `value exceeds depth ${state.limits.maxDepth}`,
      path,
    );
  }
}

function collectionLength(state, length, path) {
  if (length > state.limits.maxCollectionLength) {
    throw new WorkerValueCodecError(
      `value-${state.mode}-limit`,
      `collection exceeds ${state.limits.maxCollectionLength} values`,
      path,
    );
  }
}

function withActive(state, value, path, operation) {
  if (state.active.has(value)) {
    throw new WorkerValueCodecError(
      "value-encoding-cycle",
      "cyclic values are not transportable",
      path,
    );
  }
  state.active.add(value);
  try {
    return operation();
  } finally {
    state.active.delete(value);
  }
}

function encodedMetadata(value, state, depth, path) {
  const metadata = meta(value);
  return metadata === null
    ? null
    : encodeValue(metadata, state, depth + 1, `${path}.metadata`);
}

function encodeSequence(tag, value, state, depth, path) {
  return withActive(state, value, path, () => {
    collectionLength(state, value.count, path);
    const values = [];
    let index = 0;
    for (const item of value) {
      values.push(encodeValue(item, state, depth + 1, `${path}[${index}]`));
      index += 1;
    }
    return [tag, values, encodedMetadata(value, state, depth, path)];
  });
}

function wireKey(value) {
  return wireEncoder.encode(JSON.stringify(value));
}

function compareWireKeys(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function compareWireValues(left, right) {
  return compareWireKeys(wireKey(left), wireKey(right));
}

function compareText(left, right) {
  return compareWireKeys(wireEncoder.encode(left), wireEncoder.encode(right));
}

function encodeMap(value, state, depth, path) {
  return withActive(state, value, path, () => {
    collectionLength(state, value.count, path);
    const entries = [];
    let index = 0;
    for (const [key, item] of value) {
      entries.push([
        encodeValue(key, state, depth + 1, `${path}.keys[${index}]`),
        encodeValue(item, state, depth + 1, `${path}.values[${index}]`),
      ]);
      index += 1;
    }
    entries.sort(compareWireValues);
    return ["map", entries, encodedMetadata(value, state, depth, path)];
  });
}

function encodeSet(value, state, depth, path) {
  return withActive(state, value, path, () => {
    collectionLength(state, value.count, path);
    const values = [];
    let index = 0;
    for (const item of value) {
      values.push(encodeValue(item, state, depth + 1, `${path}[${index}]`));
      index += 1;
    }
    values.sort(compareWireValues);
    return ["set", values, encodedMetadata(value, state, depth, path)];
  });
}

function encodeArray(value, state, depth, path) {
  return withActive(state, value, path, () => {
    collectionLength(state, value.length, path);
    const values = [];
    for (let index = 0; index < value.length; index += 1) {
      values.push(encodeValue(
        value[index],
        state,
        depth + 1,
        `${path}[${index}]`,
      ));
    }
    return [
      "array",
      values,
    ];
  });
}

function encodeObject(value, state, depth, path) {
  return withActive(state, value, path, () => {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new WorkerValueCodecError(
        "value-encoding-unsupported",
        `unsupported object ${Object.prototype.toString.call(value)}`,
        path,
      );
    }
    const symbolKeys = Object.getOwnPropertySymbols(value).filter(
      (key) => Object.prototype.propertyIsEnumerable.call(value, key),
    );
    if (symbolKeys.length > 0) {
      throw new WorkerValueCodecError(
        "value-encoding-unsupported",
        "host objects with enumerable Symbol keys are not transportable",
        path,
      );
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors)
      .filter((key) => descriptors[key].enumerable)
      .sort(compareText);
    collectionLength(state, keys.length, path);
    const entries = keys.map((key) => {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) {
        throw new WorkerValueCodecError(
          "value-encoding-unsupported",
          "host object accessors are not transportable",
          `${path}.${key}`,
        );
      }
      return [
        key,
        encodeValue(descriptor.value, state, depth + 1, `${path}.${key}`),
      ];
    });
    return ["object", entries];
  });
}

function encodeValue(value, state, depth, path) {
  visit(state, depth, path);
  if (value === null || typeof value === "string" ||
      typeof value === "boolean") {
    return value;
  }
  if (value === undefined) return ["undefined"];
  if (typeof value === "number") {
    if (Number.isNaN(value)) return ["number", "nan"];
    if (value === Number.POSITIVE_INFINITY) {
      return ["number", "positive-infinity"];
    }
    if (value === Number.NEGATIVE_INFINITY) {
      return ["number", "negative-infinity"];
    }
    if (Object.is(value, -0)) return ["number", "negative-zero"];
    return value;
  }
  if (isKeyword(value)) {
    return ["keyword", value.namespace, value.name];
  }
  if (isEliscriptSymbol(value)) {
    return withActive(state, value, path, () => [
      "symbol",
      value.namespace,
      value.name,
      encodedMetadata(value, state, depth, path),
    ]);
  }
  if (isPersistentList(value)) {
    return encodeSequence("list", value, state, depth, path);
  }
  if (isPersistentVector(value)) {
    return encodeSequence("vector", value, state, depth, path);
  }
  if (isPersistentHashMap(value)) {
    return encodeMap(value, state, depth, path);
  }
  if (isPersistentHashSet(value)) {
    return encodeSet(value, state, depth, path);
  }
  if (Array.isArray(value)) return encodeArray(value, state, depth, path);
  if (typeof value === "object") {
    return encodeObject(value, state, depth, path);
  }
  throw new WorkerValueCodecError(
    "value-encoding-unsupported",
    `unsupported ${typeof value} value`,
    path,
  );
}

function requireArray(value, message, path) {
  if (!Array.isArray(value)) {
    throw new WorkerValueCodecError("value-decoding-invalid", message, path);
  }
  return value;
}

function requireTuple(node, length, tag, path) {
  if (node.length !== length) {
    throw new WorkerValueCodecError(
      "value-decoding-invalid",
      `${tag} node must contain ${length} fields`,
      path,
    );
  }
}

function requireName(value, label, path, allowNull = false) {
  if (allowNull && value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkerValueCodecError(
      "value-decoding-invalid",
      `${label} must be a non-empty string${allowNull ? " or null" : ""}`,
      path,
    );
  }
  return value;
}

function decodedMetadata(node, state, depth, path) {
  if (node === null) return null;
  const metadata = decodeValue(node, state, depth + 1, path);
  if (!isPersistentHashMap(metadata)) {
    throw new WorkerValueCodecError(
      "value-decoding-invalid",
      "metadata must decode to a persistent Map",
      path,
    );
  }
  return metadata;
}

function decodeSequence(node, state, depth, path, constructor) {
  requireTuple(node, 3, node[0], path);
  const values = requireArray(node[1], `${node[0]} values must be an array`, path);
  collectionLength(state, values.length, path);
  const decoded = values.map((value, index) =>
    decodeValue(value, state, depth + 1, `${path}[${index}]`));
  const result = constructor(...decoded);
  const metadata = decodedMetadata(
    node[2],
    state,
    depth,
    `${path}.metadata`,
  );
  return metadata === null ? result : withMeta(result, metadata);
}

function decodeMap(node, state, depth, path) {
  requireTuple(node, 3, "map", path);
  const entries = requireArray(node[1], "map entries must be an array", path);
  collectionLength(state, entries.length, path);
  let result = persistentHashMap();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = requireArray(
      entries[index],
      "map entry must be a two-field array",
      `${path}[${index}]`,
    );
    requireTuple(entry, 2, "map entry", `${path}[${index}]`);
    const key = decodeValue(entry[0], state, depth + 1, `${path}.keys[${index}]`);
    if (result.has(key)) {
      throw new WorkerValueCodecError(
        "value-decoding-invalid",
        "map contains an equivalent duplicate key",
        `${path}.keys[${index}]`,
      );
    }
    const value = decodeValue(
      entry[1],
      state,
      depth + 1,
      `${path}.values[${index}]`,
    );
    result = result.assoc(key, value);
  }
  const metadata = decodedMetadata(
    node[2],
    state,
    depth,
    `${path}.metadata`,
  );
  return metadata === null ? result : withMeta(result, metadata);
}

function decodeSet(node, state, depth, path) {
  requireTuple(node, 3, "set", path);
  const values = requireArray(node[1], "set values must be an array", path);
  collectionLength(state, values.length, path);
  let result = persistentHashSet();
  for (let index = 0; index < values.length; index += 1) {
    const value = decodeValue(values[index], state, depth + 1, `${path}[${index}]`);
    if (result.has(value)) {
      throw new WorkerValueCodecError(
        "value-decoding-invalid",
        "set contains an equivalent duplicate value",
        `${path}[${index}]`,
      );
    }
    result = result.conj(value);
  }
  const metadata = decodedMetadata(
    node[2],
    state,
    depth,
    `${path}.metadata`,
  );
  return metadata === null ? result : withMeta(result, metadata);
}

function decodeArray(node, state, depth, path) {
  requireTuple(node, 2, "array", path);
  const values = requireArray(node[1], "array values must be an array", path);
  collectionLength(state, values.length, path);
  return values.map((value, index) =>
    decodeValue(value, state, depth + 1, `${path}[${index}]`));
}

function decodeObject(node, state, depth, path) {
  requireTuple(node, 2, "object", path);
  const entries = requireArray(node[1], "object entries must be an array", path);
  collectionLength(state, entries.length, path);
  const result = {};
  const keys = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = requireArray(
      entries[index],
      "object entry must be a two-field array",
      `${path}[${index}]`,
    );
    requireTuple(entry, 2, "object entry", `${path}[${index}]`);
    const key = requireName(entry[0], "object key", `${path}.keys[${index}]`);
    if (keys.has(key)) {
      throw new WorkerValueCodecError(
        "value-decoding-invalid",
        `object contains duplicate key ${key}`,
        `${path}.keys[${index}]`,
      );
    }
    keys.add(key);
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: decodeValue(
        entry[1],
        state,
        depth + 1,
        `${path}.${key}`,
      ),
      writable: true,
    });
  }
  return result;
}

function decodeValue(node, state, depth, path) {
  visit(state, depth, path);
  if (node === null || typeof node === "string" ||
      typeof node === "boolean") {
    return node;
  }
  if (typeof node === "number") return node;
  requireArray(node, "encoded value must be a scalar or tagged array", path);
  if (node.length === 0 || typeof node[0] !== "string") {
    throw new WorkerValueCodecError(
      "value-decoding-invalid",
      "encoded value tag must be a non-empty string",
      path,
    );
  }
  switch (node[0]) {
    case "undefined":
      requireTuple(node, 1, "undefined", path);
      return undefined;
    case "number": {
      requireTuple(node, 2, "number", path);
      if (!SPECIAL_NUMBERS.has(node[1])) {
        throw new WorkerValueCodecError(
          "value-decoding-invalid",
          `unknown special number ${String(node[1])}`,
          path,
        );
      }
      return SPECIAL_NUMBERS.get(node[1]);
    }
    case "keyword": {
      requireTuple(node, 3, "keyword", path);
      const namespace = requireName(node[1], "keyword namespace", path, true);
      const name = requireName(node[2], "keyword name", path);
      return namespace === null ? keyword(name) : keyword(namespace, name);
    }
    case "symbol": {
      requireTuple(node, 4, "symbol", path);
      const namespace = requireName(node[1], "symbol namespace", path, true);
      const name = requireName(node[2], "symbol name", path);
      const result = namespace === null
        ? eliscriptSymbol(name)
        : eliscriptSymbol(namespace, name);
      const metadata = decodedMetadata(
        node[3],
        state,
        depth,
        `${path}.metadata`,
      );
      return metadata === null ? result : withMeta(result, metadata);
    }
    case "list":
      return decodeSequence(node, state, depth, path, persistentList);
    case "vector":
      return decodeSequence(node, state, depth, path, persistentVector);
    case "map":
      return decodeMap(node, state, depth, path);
    case "set":
      return decodeSet(node, state, depth, path);
    case "array":
      return decodeArray(node, state, depth, path);
    case "object":
      return decodeObject(node, state, depth, path);
    default:
      throw new WorkerValueCodecError(
        "value-decoding-invalid",
        `unknown value tag ${node[0]}`,
        path,
      );
  }
}

export function encodeWorkerValue(value, options) {
  return encodeValue(value, createState("encoding", options), 0, "$");
}

export function encodeWorkerValues(values, options) {
  if (!Array.isArray(values)) {
    throw new TypeError("values must be an array");
  }
  const state = createState("encoding", options);
  collectionLength(state, values.length, "$arguments");
  return values.map((value, index) =>
    encodeValue(value, state, 0, `$arguments[${index}]`));
}

export function decodeWorkerValue(value, options) {
  return decodeValue(value, createState("decoding", options), 0, "$");
}

export function decodeWorkerValues(values, options) {
  if (!Array.isArray(values)) {
    throw new WorkerValueCodecError(
      "value-decoding-invalid",
      "encoded values must be an array",
      "$arguments",
    );
  }
  const state = createState("decoding", options);
  collectionLength(state, values.length, "$arguments");
  return values.map((value, index) =>
    decodeValue(value, state, 0, `$arguments[${index}]`));
}
