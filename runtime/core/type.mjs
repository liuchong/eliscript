const MAX_FIELDS = 1024;
const MAX_PROTOCOLS = 1024;
const TYPE_CONSTRUCTOR_TOKEN = Symbol("eliscript.type.constructor-token");
const TYPE_VALUE_STATE = new WeakMap();
const typeStates = new WeakMap();

function fail(message) {
  throw new TypeError(message);
}

function denseArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(`${label} must be a dense array of at most ${maximum} values`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
    fail(`${label} must be a dense array with no extra properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(`${label} must contain enumerable data values`);
    }
  }
  return value;
}

function normalizeTypeName(name) {
  if (typeof name !== "string" || name.length === 0) {
    fail("type name must be a non-empty string");
  }
  return name;
}

function normalizeFieldNames(fields) {
  denseArray(fields, "type fields", MAX_FIELDS);
  const seen = new Set();
  const normalized = fields.map((field) => {
    if (typeof field !== "string" || field.length === 0 || field.includes("/")) {
      fail("type field names must be non-empty unqualified strings");
    }
    if (seen.has(field)) fail(`type declares duplicate field ${field}`);
    seen.add(field);
    return field;
  });
  return Object.freeze(normalized);
}

function protocolShape(protocol) {
  if (protocol === null || typeof protocol !== "object") {
    fail("expected an Eliscript protocol");
  }
  const descriptors = Object.getOwnPropertyDescriptors(protocol);
  const keys = Reflect.ownKeys(descriptors);
  const nameDescriptor = descriptors.name;
  const operationsDescriptor = descriptors.operations;
  if (keys.length !== 2 || !nameDescriptor?.enumerable ||
      !("value" in nameDescriptor) ||
      typeof nameDescriptor.value !== "string" ||
      nameDescriptor.value.length === 0 ||
      !operationsDescriptor?.enumerable || !("value" in operationsDescriptor) ||
      !Object.isFrozen(protocol)) {
    fail("expected an Eliscript protocol");
  }
  const operations = operationsDescriptor.value;
  if (operations === null || typeof operations !== "object" ||
      Array.isArray(operations) || !Object.isFrozen(operations)) {
    fail("expected an Eliscript protocol");
  }
  const operationDescriptors = Object.getOwnPropertyDescriptors(operations);
  const operationNames = Reflect.ownKeys(operationDescriptors);
  if (operationNames.length === 0 || operationNames.length > MAX_FIELDS ||
      operationNames.some((operation) => typeof operation !== "string")) {
    fail("expected an Eliscript protocol");
  }
  const methods = operationNames.map((operation) => {
    const descriptor = operationDescriptors[operation];
    const method = descriptor?.value;
    const methodDescriptors = typeof method === "function"
      ? Object.getOwnPropertyDescriptors(method)
      : {};
    if (!descriptor?.enumerable || !("value" in descriptor) ||
        methodDescriptors.protocol?.value !== protocol ||
        methodDescriptors.operation?.value !== operation ||
        typeof methodDescriptors.slot?.value !== "symbol" ||
        !Object.isFrozen(method)) {
      fail("expected an Eliscript protocol");
    }
    return Object.freeze({ operation, slot: methodDescriptors.slot.value });
  });
  return Object.freeze({
    name: nameDescriptor.value,
    operations: Object.freeze(methods),
  });
}

function normalizeMethods(protocol, implementations) {
  const definition = protocolShape(protocol);
  if (implementations === null || typeof implementations !== "object" ||
      Array.isArray(implementations)) {
    fail(`protocol ${definition.name} implementations must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(implementations);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`protocol ${definition.name} implementations must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(implementations);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== definition.operations.length) {
    fail(`protocol ${definition.name} implementation must define every operation`);
  }
  const operationNames = definition.operations.map(({ operation }) => operation);
  if (keys.some((key) => typeof key !== "string" ||
      !operationNames.includes(key))) {
    fail(`protocol ${definition.name} implementation contains an unknown operation`);
  }
  const normalized = [];
  for (const { operation, slot } of definition.operations) {
    const descriptor = descriptors[operation];
    if (!descriptor?.enumerable || !("value" in descriptor) ||
        typeof descriptor.value !== "function") {
      fail(`protocol ${definition.name}/${operation} implementation must be a function`);
    }
    normalized.push(Object.freeze({
      operation,
      slot,
      implementation: descriptor.value,
    }));
  }
  return Object.freeze({ protocol, name: definition.name, methods: normalized });
}

function normalizeProtocolPlans(plans, allowEmpty) {
  denseArray(plans, "protocol implementations", MAX_PROTOCOLS);
  if (!allowEmpty && plans.length === 0) {
    fail("reify requires at least one protocol implementation");
  }
  const seen = new Set();
  return Object.freeze(plans.map((plan, index) => {
    denseArray(plan, `protocol implementation ${index}`, 2);
    if (plan.length !== 2) {
      fail(`protocol implementation ${index} must contain a protocol and methods`);
    }
    const [protocol, methods] = plan;
    if (seen.has(protocol)) fail("protocol may be implemented only once");
    seen.add(protocol);
    return normalizeMethods(protocol, methods);
  }));
}

function installProtocolMethods(target, plans) {
  for (const plan of plans) {
    for (const { slot, implementation } of plan.methods) {
      if (Reflect.has(target, slot)) {
        fail(`protocol slot conflict while implementing ${plan.name}`);
      }
      Object.defineProperty(target, slot, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: function (...argumentsList) {
          return implementation(this, ...argumentsList);
        },
      });
    }
  }
  return target;
}

function defineFieldAccessors(TypeValue, fieldNames) {
  for (let index = 0; index < fieldNames.length; index += 1) {
    const fieldName = fieldNames[index];
    if (fieldName in TypeValue.prototype) {
      fail(`type field ${fieldName} conflicts with a type member`);
    }
    Object.defineProperty(TypeValue.prototype, fieldName, {
      configurable: false,
      enumerable: true,
      get() {
        return TYPE_VALUE_STATE.get(this).values[index];
      },
    });
  }
}

export function defineType(name, fields, protocolPlans = []) {
  const typeName = normalizeTypeName(name);
  const fieldNames = normalizeFieldNames(fields);
  const plans = normalizeProtocolPlans(protocolPlans, true);

  class TypeValue {
    constructor(token, values) {
      if (token !== TYPE_CONSTRUCTOR_TOKEN) {
        fail(`${typeName} values must be created with its positional constructor`);
      }
      TYPE_VALUE_STATE.set(this, Object.freeze({
        type: TypeValue,
        values: Object.freeze(values),
      }));
      Object.freeze(this);
    }

    static create(...values) {
      if (values.length !== fieldNames.length) {
        fail(
          `->${typeName} expects ${fieldNames.length} values, received ${values.length}`,
        );
      }
      return new TypeValue(TYPE_CONSTRUCTOR_TOKEN, values);
    }

    static isInstance(value) {
      return TYPE_VALUE_STATE.get(value)?.type === TypeValue;
    }

    get [Symbol.toStringTag]() {
      return `EliscriptType:${typeName}`;
    }
  }

  Object.defineProperty(TypeValue, "name", { value: typeName });
  Object.defineProperties(TypeValue, {
    typeName: { enumerable: true, value: typeName },
    typeFields: { enumerable: true, value: fieldNames },
  });
  defineFieldAccessors(TypeValue, fieldNames);
  installProtocolMethods(TypeValue.prototype, plans);
  Object.freeze(TypeValue.prototype);
  Object.freeze(TypeValue);
  typeStates.set(TypeValue, Object.freeze({ name: typeName, fields: fieldNames }));
  return TypeValue;
}

export function reifyProtocols(protocolPlans) {
  const plans = normalizeProtocolPlans(protocolPlans, false);
  return Object.freeze(installProtocolMethods(Object.create(null), plans));
}

export function isType(value) {
  return typeof value === "function" && typeStates.has(value);
}

export function isTypeValue(value) {
  return value !== null && typeof value === "object" &&
    TYPE_VALUE_STATE.has(value);
}

export function typeOf(value) {
  const state = TYPE_VALUE_STATE.get(value);
  if (state === undefined) fail("expected an Eliscript type value");
  return state.type;
}

export function typeName(value) {
  const type = isType(value) ? value : typeOf(value);
  return typeStates.get(type).name;
}

export function typeFieldNames(value) {
  const type = isType(value) ? value : typeOf(value);
  return typeStates.get(type).fields;
}
