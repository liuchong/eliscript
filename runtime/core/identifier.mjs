import {
  VALUE_EQUAL,
  VALUE_HASH,
  finishHash,
  hashString,
  mixHash,
} from "./value-internals.mjs";
import {
  METADATA_READ,
  METADATA_WITH,
} from "./metadata-internals.mjs";

const VALUE_TYPE = Symbol.for("eliscript.value.type");
const KEYWORD_TYPE = "keyword";
const SYMBOL_TYPE = "symbol";

const KEYWORD_HASH_TAG = 0x2f6d_31a7;
const SYMBOL_HASH_TAG = 0x71c8_4e93;
const UNQUALIFIED_HASH = 0x4a91_b67d;

const KEYWORD_TOKEN = Object.freeze({});
const SYMBOL_TOKEN = Object.freeze({});
const keywordState = new WeakMap();
const symbolState = new WeakMap();
const keywordInterns = new Map();

function logicalType(value) {
  if ((typeof value !== "object" || value === null) &&
      typeof value !== "function") {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, VALUE_TYPE);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function normalizePart(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (value.includes("/")) {
    throw new TypeError(`${label} cannot contain /`);
  }
  return value;
}

function splitQualified(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const separator = value.indexOf("/");
  if (separator === -1) {
    return { namespace: null, name: value };
  }
  if (separator === 0 || separator === value.length - 1 ||
      value.indexOf("/", separator + 1) !== -1) {
    throw new TypeError(`${label} must be name or namespace/name`);
  }
  return {
    namespace: value.slice(0, separator),
    name: value.slice(separator + 1),
  };
}

function normalizeArguments(arguments_, type, predicate) {
  if (arguments_.length === 1) {
    const value = arguments_[0];
    if (predicate(value)) {
      return {
        existing: value,
        namespace: identifierNamespace(value),
        name: identifierName(value),
      };
    }
    return { existing: null, ...splitQualified(value, `${type} name`) };
  }
  if (arguments_.length === 2) {
    const [namespace, name] = arguments_;
    if (namespace !== null) {
      normalizePart(namespace, `${type} namespace`);
    }
    return {
      existing: null,
      namespace,
      name: normalizePart(name, `${type} name`),
    };
  }
  throw new TypeError(`${type} expects one qualified name or namespace and name`);
}

function qualifiedName(state) {
  return state.namespace === null
    ? state.name
    : `${state.namespace}/${state.name}`;
}

function identifierHash(tag, state) {
  const namespaceHash = state.namespace === null
    ? UNQUALIFIED_HASH
    : hashString(state.namespace);
  return finishHash(
    mixHash(mixHash(tag, namespaceHash), hashString(state.name)),
    2,
  );
}

function defineIdentifier(instance, type, state, table) {
  table.set(instance, state);
  Object.defineProperty(instance, VALUE_TYPE, {
    value: type,
    enumerable: false,
  });
  Object.freeze(instance);
}

function equalIdentifier(leftType, leftState, right) {
  if (logicalType(right) !== leftType) {
    return false;
  }
  try {
    return identifierNamespace(right) === leftState.namespace &&
      identifierName(right) === leftState.name;
  } catch {
    return false;
  }
}

export class Keyword {
  constructor(token, namespace, name) {
    if (token !== KEYWORD_TOKEN) {
      throw new TypeError("Keyword values must be created with keyword()");
    }
    defineIdentifier(this, KEYWORD_TYPE, { namespace, name }, keywordState);
  }

  get name() {
    return keywordState.get(this).name;
  }

  get namespace() {
    return keywordState.get(this).namespace;
  }

  get qualifiedName() {
    return qualifiedName(keywordState.get(this));
  }

  toString() {
    return `:${this.qualifiedName}`;
  }

  toJSON() {
    throw new TypeError("Keyword values require an explicit serialization codec");
  }

  [VALUE_EQUAL](other) {
    return equalIdentifier(KEYWORD_TYPE, keywordState.get(this), other);
  }

  [VALUE_HASH]() {
    return identifierHash(KEYWORD_HASH_TAG, keywordState.get(this));
  }

  get [Symbol.toStringTag]() {
    return "EliscriptKeyword";
  }
}

export class EliscriptSymbol {
  constructor(token, namespace, name, metadata = null) {
    if (token !== SYMBOL_TOKEN) {
      throw new TypeError(
        "EliscriptSymbol values must be created with eliscriptSymbol()",
      );
    }
    defineIdentifier(
      this,
      SYMBOL_TYPE,
      { namespace, name, metadata },
      symbolState,
    );
  }

  get name() {
    return symbolState.get(this).name;
  }

  get namespace() {
    return symbolState.get(this).namespace;
  }

  get qualifiedName() {
    return qualifiedName(symbolState.get(this));
  }

  toString() {
    return this.qualifiedName;
  }

  toJSON() {
    throw new TypeError(
      "EliscriptSymbol values require an explicit serialization codec",
    );
  }

  [VALUE_EQUAL](other) {
    return equalIdentifier(SYMBOL_TYPE, symbolState.get(this), other);
  }

  [VALUE_HASH]() {
    return identifierHash(SYMBOL_HASH_TAG, symbolState.get(this));
  }

  [METADATA_READ]() {
    return symbolState.get(this).metadata;
  }

  [METADATA_WITH](metadata) {
    const state = symbolState.get(this);
    return metadata === state.metadata
      ? this
      : new EliscriptSymbol(
        SYMBOL_TOKEN,
        state.namespace,
        state.name,
        metadata,
      );
  }

  get [Symbol.toStringTag]() {
    return "EliscriptSymbol";
  }
}

export function keyword(...arguments_) {
  const normalized = normalizeArguments(arguments_, KEYWORD_TYPE, isKeyword);
  if (normalized.existing !== null) {
    return normalized.existing;
  }
  const key = normalized.namespace === null
    ? normalized.name
    : `${normalized.namespace}/${normalized.name}`;
  const existing = keywordInterns.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const result = new Keyword(
    KEYWORD_TOKEN,
    normalized.namespace,
    normalized.name,
  );
  keywordInterns.set(key, result);
  return result;
}

export function eliscriptSymbol(...arguments_) {
  const normalized = normalizeArguments(
    arguments_,
    SYMBOL_TYPE,
    isEliscriptSymbol,
  );
  return normalized.existing ?? new EliscriptSymbol(
    SYMBOL_TOKEN,
    normalized.namespace,
    normalized.name,
  );
}

export function isKeyword(value) {
  return logicalType(value) === KEYWORD_TYPE;
}

export function isEliscriptSymbol(value) {
  return logicalType(value) === SYMBOL_TYPE;
}

export function isIdentifier(value) {
  return isKeyword(value) || isEliscriptSymbol(value);
}

export function identifierName(value) {
  if (!isIdentifier(value)) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  const name = value.name;
  if (typeof name !== "string" || name.length === 0 || name.includes("/")) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  return name;
}

export function identifierNamespace(value) {
  if (!isIdentifier(value)) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  const namespace = value.namespace;
  if (namespace !== null &&
      (typeof namespace !== "string" || namespace.length === 0 ||
       namespace.includes("/"))) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  return namespace;
}

export function qualifiedIdentifierName(value) {
  const namespace = identifierNamespace(value);
  const name = identifierName(value);
  return namespace === null ? name : `${namespace}/${name}`;
}
