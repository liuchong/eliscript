const protocolStates = new WeakMap();
const MISSING = Symbol("eliscript.protocol.missing");

const HOST_CATEGORIES = new Set([
  "null",
  "undefined",
  "boolean",
  "number",
  "bigint",
  "string",
  "symbol",
  "function",
  "object",
]);

function protocolState(protocol) {
  const state = protocolStates.get(protocol);
  if (state === undefined) {
    throw new TypeError("expected an Eliscript protocol");
  }
  return state;
}

function operationRecord(protocol, operation) {
  const state = protocolState(protocol);
  const record = state.operations.get(operation);
  if (record === undefined) {
    throw new TypeError(
      `protocol ${protocol.name} has no operation ${String(operation)}`,
    );
  }
  return record;
}

function normalizeName(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeImplementations(protocol, implementations) {
  if (implementations === null || typeof implementations !== "object") {
    throw new TypeError(
      `protocol ${protocol.name} implementations must be an object`,
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(implementations);
  const normalized = Object.create(null);
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new TypeError(
        `protocol ${protocol.name} implementation names must be strings`,
      );
    }
    operationRecord(protocol, key);
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || typeof descriptor.value !== "function") {
      throw new TypeError(
        `protocol ${protocol.name}/${key} implementation must be a function`,
      );
    }
    Object.defineProperty(normalized, key, {
      value: descriptor.value,
      enumerable: true,
    });
    count += 1;
  }
  if (count === 0) {
    throw new TypeError(
      `protocol ${protocol.name} extension must implement at least one operation`,
    );
  }
  return Object.freeze(normalized);
}

function mergeImplementations(current, incoming) {
  return Object.freeze(Object.assign(Object.create(null), current, incoming));
}

function exactPrototype(value) {
  if ((typeof value !== "object" || value === null) &&
      typeof value !== "function") {
    return MISSING;
  }
  return Object.getPrototypeOf(value);
}

function observedType(value) {
  const category = protocolHostCategory(value);
  if (category !== "object" && category !== "function") {
    return category;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype?.constructor;
    const name = typeof constructor === "function" && constructor.name.length > 0
      ? constructor.name
      : "anonymous";
    return `${category}:${name}`;
  } catch {
    return category;
  }
}

function directMethod(record, receiver) {
  if (receiver === null || receiver === undefined) {
    return MISSING;
  }
  const target = Object(receiver);
  if (!(record.slot in target)) {
    return MISSING;
  }
  const method = target[record.slot];
  return typeof method === "function" ? method : null;
}

function externalMethod(state, record, receiver) {
  const prototype = exactPrototype(receiver);
  if (prototype !== MISSING) {
    const exact = state.types.get(prototype)?.[record.name];
    if (exact !== undefined) {
      return exact;
    }
  }
  const category = state.categories.get(protocolHostCategory(receiver))?.[record.name];
  if (category !== undefined) {
    return category;
  }
  return state.defaults[record.name] ?? MISSING;
}

function dispatch(protocol, record, receiver, arguments_) {
  const direct = directMethod(record, receiver);
  if (direct === null) {
    throw new ProtocolDispatchError(
      protocol,
      record.name,
      receiver,
      "invalid-direct-slot",
    );
  }
  if (direct !== MISSING) {
    return direct.apply(receiver, arguments_);
  }
  const external = externalMethod(protocolState(protocol), record, receiver);
  if (external === MISSING) {
    throw new ProtocolDispatchError(protocol, record.name, receiver);
  }
  return external(receiver, ...arguments_);
}

export class ProtocolDispatchError extends TypeError {
  constructor(protocol, operation, receiver, reason = "missing") {
    const type = observedType(receiver);
    const detail = reason === "missing"
      ? "has no implementation"
      : "has a non-callable direct slot";
    super(`protocol ${protocol.name}/${operation} ${detail} for ${type}`);
    this.name = "ProtocolDispatchError";
    this.code = "ELI-RUNTIME-PROTOCOL";
    this.protocol = protocol.name;
    this.operation = operation;
    this.observedType = type;
    this.reason = reason;
  }
}

export function protocolHostCategory(value) {
  return value === null ? "null" : typeof value;
}

export function defineProtocol(name, operations) {
  const protocolName = normalizeName(name, "protocol name");
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new TypeError("protocol operations must be a non-empty array");
  }

  const records = new Map();
  const operationTable = Object.create(null);
  let protocol;
  for (const value of operations) {
    const operation = normalizeName(value, "protocol operation");
    if (records.has(operation)) {
      throw new TypeError(
        `protocol ${protocolName} declares duplicate operation ${operation}`,
      );
    }
    const slot = Symbol(`eliscript.protocol.${protocolName}/${operation}`);
    const method = function protocolMethod(receiver, ...arguments_) {
      if (arguments.length === 0) {
        throw new TypeError(
          `protocol ${protocolName}/${operation} requires a dispatch value`,
        );
      }
      return dispatch(protocol, records.get(operation), receiver, arguments_);
    };
    const record = { name: operation, slot, method };
    records.set(operation, record);
    Object.defineProperty(operationTable, operation, {
      value: method,
      enumerable: true,
    });
  }

  protocol = Object.freeze({
    name: protocolName,
    operations: Object.freeze(operationTable),
  });
  for (const record of records.values()) {
    Object.defineProperties(record.method, {
      protocol: { value: protocol },
      operation: { value: record.name },
      slot: { value: record.slot },
    });
    Object.freeze(record.method);
    Object.freeze(record);
  }
  protocolStates.set(protocol, {
    operations: records,
    types: new Map(),
    categories: new Map(),
    defaults: Object.freeze(Object.create(null)),
  });
  return protocol;
}

export function protocolMethod(protocol, operation) {
  return operationRecord(protocol, operation).method;
}

export function protocolSlot(protocol, operation) {
  return operationRecord(protocol, operation).slot;
}

export function extendProtocolType(protocol, constructor, implementations) {
  const state = protocolState(protocol);
  if (typeof constructor !== "function" ||
      (typeof constructor.prototype !== "object" ||
       constructor.prototype === null)) {
    throw new TypeError(
      `protocol ${protocol.name} exact type must be a constructor with a prototype`,
    );
  }
  const normalized = normalizeImplementations(protocol, implementations);
  const current = state.types.get(constructor.prototype);
  state.types.set(
    constructor.prototype,
    mergeImplementations(current, normalized),
  );
  return protocol;
}

export function extendProtocolCategory(protocol, category, implementations) {
  const state = protocolState(protocol);
  if (!HOST_CATEGORIES.has(category)) {
    throw new TypeError(`unknown protocol host category ${String(category)}`);
  }
  const normalized = normalizeImplementations(protocol, implementations);
  const current = state.categories.get(category);
  state.categories.set(category, mergeImplementations(current, normalized));
  return protocol;
}

export function extendProtocolDefault(protocol, implementations) {
  const state = protocolState(protocol);
  const normalized = normalizeImplementations(protocol, implementations);
  state.defaults = mergeImplementations(state.defaults, normalized);
  return protocol;
}

export function implementsProtocolOperation(protocol, operation, value) {
  const record = operationRecord(protocol, operation);
  const direct = directMethod(record, value);
  return direct !== null &&
    (direct !== MISSING ||
     externalMethod(protocolState(protocol), record, value) !== MISSING);
}

export function implementsProtocol(protocol, value) {
  const state = protocolState(protocol);
  for (const record of state.operations.values()) {
    const direct = directMethod(record, value);
    if (direct === null ||
        (direct === MISSING && externalMethod(state, record, value) === MISSING)) {
      return false;
    }
  }
  return true;
}
