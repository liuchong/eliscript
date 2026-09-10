import {
  EliscriptSymbol,
  Keyword,
  eliscriptSymbol,
  identifierName,
  identifierNamespace,
  keyword,
  qualifiedIdentifierName,
} from "./identifier.mjs";
import {
  EMPTY_MAP,
  PersistentHashMap,
  isPersistentHashMap,
} from "./map.mjs";
import { PersistentList } from "./list.mjs";
import { meta, withMeta } from "./metadata.mjs";
import { PersistentQueue, persistentQueue } from "./queue.mjs";
import {
  defineProtocol,
  extendProtocolCategory,
  extendProtocolType,
  protocolMethod,
} from "./protocol.mjs";
import {
  EMPTY_SET,
  PersistentHashSet,
} from "./set.mjs";
import {
  assocBang,
  conjBang,
  persistentBang,
  transient,
} from "./transient.mjs";
import {
  EMPTY_VECTOR,
  PersistentVector,
  isPersistentVector,
} from "./vector.mjs";

const DEFAULT_MAX_DEPTH = 256;
const DEFAULT_MAX_LENGTH = 16 * 1024 * 1024;
const DEFAULT_MAX_VALUES = 1_000_000;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const BIGINT_PATTERN = /^-?(?:0|[1-9]\d*)N$/;
const UNSAFE_IDENTIFIER = /[\s()[\]{}"';,@^`~\\]/u;
const RESERVED_SYMBOLS = new Set([
  "nil",
  "true",
  "false",
  "undefined",
  "##NaN",
  "##Inf",
  "##-Inf",
]);

export const IPrint = defineProtocol("IPrint", ["print"]);
const dispatchPrint = protocolMethod(IPrint, "print");

function positiveIntegerOption(options, name, fallback) {
  const value = options?.[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function normalizeOptions(options) {
  if (options === undefined || options === null) {
    return Object.freeze({
      maxDepth: DEFAULT_MAX_DEPTH,
      maxLength: DEFAULT_MAX_LENGTH,
      maxValues: DEFAULT_MAX_VALUES,
    });
  }
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("data text options must be an object");
  }
  return Object.freeze({
    maxDepth: positiveIntegerOption(options, "maxDepth", DEFAULT_MAX_DEPTH),
    maxLength: positiveIntegerOption(options, "maxLength", DEFAULT_MAX_LENGTH),
    maxValues: positiveIntegerOption(options, "maxValues", DEFAULT_MAX_VALUES),
  });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeIdentifierPart(value) {
  return value.length > 0 && !value.includes("/") &&
    !UNSAFE_IDENTIFIER.test(value);
}

function safeBareIdentifier(value, symbol) {
  const namespace = identifierNamespace(value);
  const name = identifierName(value);
  if (!safeIdentifierPart(name) ||
      (namespace !== null && !safeIdentifierPart(namespace))) {
    return false;
  }
  const qualified = qualifiedIdentifierName(value);
  return !symbol ||
    (!RESERVED_SYMBOLS.has(qualified) &&
     !NUMBER_PATTERN.test(qualified) &&
     !BIGINT_PATTERN.test(qualified) &&
     !qualified.startsWith(":") &&
     !qualified.startsWith("#"));
}

function taggedIdentifier(tag, value) {
  const namespace = identifierNamespace(value);
  return `#eliscript/${tag} [${namespace === null
    ? "nil"
    : JSON.stringify(namespace)} ${JSON.stringify(identifierName(value))}]`;
}

function printNumber(value) {
  if (Number.isNaN(value)) return "##NaN";
  if (value === Number.POSITIVE_INFINITY) return "##Inf";
  if (value === Number.NEGATIVE_INFINITY) return "##-Inf";
  return Object.is(value, -0) ? "0" : String(value);
}

function printKeyword(value) {
  return safeBareIdentifier(value, false)
    ? `:${qualifiedIdentifierName(value)}`
    : taggedIdentifier("keyword", value);
}

function printSymbol(value) {
  return safeBareIdentifier(value, true)
    ? qualifiedIdentifierName(value)
    : taggedIdentifier("symbol", value);
}

function printVector(value, context) {
  return `[${[...value].map((item) => context.print(item)).join(" ")}]`;
}

function printList(value, context) {
  return `(${[...value].map((item) => context.print(item)).join(" ")})`;
}

function printMap(value, context) {
  const entries = [...value].map(([key, item]) => ({
    key: context.print(key),
    value: context.print(item),
  }));
  entries.sort((left, right) =>
    compareText(left.key, right.key) || compareText(left.value, right.value));
  return `{${entries.map(({ key, value: item }) => `${key} ${item}`).join(" ")}}`;
}

function printSet(value, context) {
  const items = [...value].map((item) => context.print(item));
  items.sort(compareText);
  return `#{${items.join(" ")}}`;
}

function printQueue(value, context) {
  return `#queue [${[...value].map((item) => context.print(item)).join(" ")}]`;
}

extendProtocolCategory(IPrint, "null", { print: () => "nil" });
extendProtocolCategory(IPrint, "undefined", { print: () => "undefined" });
extendProtocolCategory(IPrint, "boolean", {
  print: (value) => value ? "true" : "false",
});
extendProtocolCategory(IPrint, "number", { print: printNumber });
extendProtocolCategory(IPrint, "bigint", {
  print: (value) => `${value}N`,
});
extendProtocolCategory(IPrint, "string", {
  print: (value) => JSON.stringify(value),
});
extendProtocolType(IPrint, Keyword, { print: printKeyword });
extendProtocolType(IPrint, EliscriptSymbol, { print: printSymbol });
extendProtocolType(IPrint, PersistentList, { print: printList });
extendProtocolType(IPrint, PersistentVector, { print: printVector });
extendProtocolType(IPrint, PersistentHashMap, { print: printMap });
extendProtocolType(IPrint, PersistentHashSet, { print: printSet });
extendProtocolType(IPrint, PersistentQueue, { print: printQueue });

function makePrintContext(options) {
  const state = { values: 0 };

  function render(value, depth) {
    if (depth > options.maxDepth) {
      throw new RangeError(`data text exceeds maxDepth ${options.maxDepth}`);
    }
    state.values += 1;
    if (state.values > options.maxValues) {
      throw new RangeError(`data text exceeds maxValues ${options.maxValues}`);
    }
    const context = Object.freeze({
      print: (item) => render(item, depth + 1),
    });
    const body = dispatchPrint(value, context);
    if (typeof body !== "string") {
      throw new TypeError("IPrint/print must return a string");
    }
    const metadata = meta(value);
    const result = metadata === null
      ? body
      : `^${render(metadata, depth + 1)} ${body}`;
    if (result.length > options.maxLength) {
      throw new RangeError(`data text exceeds maxLength ${options.maxLength}`);
    }
    return result;
  }

  return (value) => render(value, 0);
}

export function printValue(value, options = undefined) {
  return makePrintContext(normalizeOptions(options))(value);
}

export class DataTextError extends SyntaxError {
  constructor(message, source, position) {
    super(`${message} at ${position.line}:${position.column}`);
    this.name = "DataTextError";
    this.code = "ELI-DATA-TEXT";
    this.offset = position.index;
    this.line = position.line;
    this.column = position.column;
    this.sourceLength = source.length;
  }
}

class Reader {
  constructor(source, options) {
    this.source = source;
    this.options = options;
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.values = 0;
  }

  position() {
    return { index: this.index, line: this.line, column: this.column };
  }

  fail(message, position = this.position()) {
    throw new DataTextError(message, this.source, position);
  }

  peek(ahead = 0) {
    return this.source[this.index + ahead];
  }

  advance() {
    const code = this.source.codePointAt(this.index);
    if (code === undefined) return undefined;
    this.index += code > 0xffff ? 2 : 1;
    if (code === 10) {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return code;
  }

  skipIgnored() {
    while (this.index < this.source.length) {
      const character = this.peek();
      if (/\s/u.test(character) || character === ",") {
        this.advance();
      } else if (character === ";") {
        while (this.index < this.source.length && this.peek() !== "\n") {
          this.advance();
        }
      } else {
        return;
      }
    }
  }

  delimiter(character) {
    return character === undefined || /[\s,()[\]{}";^]/u.test(character);
  }

  token(start) {
    while (!this.delimiter(this.peek())) this.advance();
    const token = this.source.slice(start.index, this.index);
    if (token.length === 0) this.fail("expected token", start);
    return token;
  }

  string(start) {
    this.advance();
    let escaped = false;
    while (this.index < this.source.length) {
      const character = this.peek();
      if (!escaped && character === "\n") {
        this.fail("newline in string literal", start);
      }
      this.advance();
      if (!escaped && character === "\"") {
        const raw = this.source.slice(start.index, this.index);
        try {
          return JSON.parse(raw);
        } catch {
          this.fail("invalid string escape", start);
        }
      }
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
    }
    this.fail("unexpected end of string", start);
  }

  vector(depth, start) {
    this.advance();
    const editable = transient(EMPTY_VECTOR);
    while (true) {
      this.skipIgnored();
      if (this.peek() === "]") {
        this.advance();
        return persistentBang(editable);
      }
      if (this.peek() === undefined) {
        this.fail("unexpected end of vector", start);
      }
      conjBang(editable, this.value(depth + 1));
    }
  }

  list(depth, start) {
    this.advance();
    const values = [];
    while (true) {
      this.skipIgnored();
      if (this.peek() === ")") {
        this.advance();
        return PersistentList.from(values);
      }
      if (this.peek() === undefined) {
        this.fail("unexpected end of list", start);
      }
      values.push(this.value(depth + 1));
    }
  }

  map(depth, start) {
    this.advance();
    const editable = transient(EMPTY_MAP);
    let seen = EMPTY_MAP;
    while (true) {
      this.skipIgnored();
      if (this.peek() === "}") {
        this.advance();
        return persistentBang(editable);
      }
      if (this.peek() === undefined) {
        this.fail("unexpected end of map", start);
      }
      const keyPosition = this.position();
      const key = this.value(depth + 1);
      this.skipIgnored();
      if (this.peek() === "}" || this.peek() === undefined) {
        this.fail("map requires a value for every key", keyPosition);
      }
      const item = this.value(depth + 1);
      if (seen.has(key)) this.fail("duplicate map key", keyPosition);
      seen = seen.assoc(key, true);
      assocBang(editable, key, item);
    }
  }

  set(depth, start) {
    this.advance();
    const editable = transient(EMPTY_SET);
    let seen = EMPTY_SET;
    while (true) {
      this.skipIgnored();
      if (this.peek() === "}") {
        this.advance();
        return persistentBang(editable);
      }
      if (this.peek() === undefined) {
        this.fail("unexpected end of set", start);
      }
      const position = this.position();
      const item = this.value(depth + 1);
      if (seen.has(item)) this.fail("duplicate set value", position);
      seen = seen.conj(item);
      conjBang(editable, item);
    }
  }

  taggedIdentifier(tag, depth, start) {
    this.skipIgnored();
    const payload = this.value(depth + 1);
    if (!isPersistentVector(payload) || payload.count !== 2) {
      this.fail(`${tag} tag requires [namespace name]`, start);
    }
    const namespace = payload.nth(0);
    const name = payload.nth(1);
    if ((namespace !== null && typeof namespace !== "string") ||
        typeof name !== "string") {
      this.fail(`${tag} tag requires a nil/string namespace and string name`, start);
    }
    try {
      return tag === "keyword"
        ? keyword(namespace, name)
        : eliscriptSymbol(namespace, name);
    } catch (error) {
      this.fail(error.message, start);
    }
  }

  taggedQueue(depth, start) {
    this.skipIgnored();
    const payload = this.value(depth + 1);
    if (!isPersistentVector(payload)) {
      this.fail("queue tag requires a vector", start);
    }
    return persistentQueue(...payload);
  }

  dispatch(depth, start) {
    if (this.peek(1) === "{") {
      this.advance();
      return this.set(depth, start);
    }
    const token = this.token(start);
    if (token === "##NaN") return Number.NaN;
    if (token === "##Inf") return Number.POSITIVE_INFINITY;
    if (token === "##-Inf") return Number.NEGATIVE_INFINITY;
    if (token === "#eliscript/keyword") {
      return this.taggedIdentifier("keyword", depth, start);
    }
    if (token === "#eliscript/symbol") {
      return this.taggedIdentifier("symbol", depth, start);
    }
    if (token === "#queue") return this.taggedQueue(depth, start);
    this.fail(`unknown dispatch ${token}`, start);
  }

  atom(start) {
    const token = this.token(start);
    if (token === "nil") return null;
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "undefined") return undefined;
    if (BIGINT_PATTERN.test(token)) return BigInt(token.slice(0, -1));
    if (NUMBER_PATTERN.test(token)) return Number(token);
    try {
      return token.startsWith(":")
        ? keyword(token.slice(1))
        : eliscriptSymbol(token);
    } catch (error) {
      this.fail(error.message, start);
    }
  }

  metadata(depth, start) {
    this.advance();
    const metadata = this.value(depth + 1);
    if (!isPersistentHashMap(metadata)) {
      this.fail("metadata prefix requires a persistent map", start);
    }
    const value = this.value(depth + 1);
    try {
      return withMeta(value, metadata);
    } catch (error) {
      this.fail(error.message, start);
    }
  }

  value(depth) {
    this.skipIgnored();
    const start = this.position();
    if (depth > this.options.maxDepth) {
      this.fail(`data text exceeds maxDepth ${this.options.maxDepth}`, start);
    }
    this.values += 1;
    if (this.values > this.options.maxValues) {
      this.fail(`data text exceeds maxValues ${this.options.maxValues}`, start);
    }
    const character = this.peek();
    if (character === undefined) this.fail("unexpected end of input", start);
    if (character === "\"") return this.string(start);
    if (character === "(") return this.list(depth, start);
    if (character === "[") return this.vector(depth, start);
    if (character === "{") return this.map(depth, start);
    if (character === "#") return this.dispatch(depth, start);
    if (character === "^") return this.metadata(depth, start);
    if ("]})".includes(character)) {
      this.fail(`unexpected closing delimiter ${character}`, start);
    }
    return this.atom(start);
  }
}

function makeReader(source, options) {
  if (typeof source !== "string") {
    throw new TypeError("data text source must be a string");
  }
  const normalized = normalizeOptions(options);
  if (source.length > normalized.maxLength) {
    throw new RangeError(`data text exceeds maxLength ${normalized.maxLength}`);
  }
  return new Reader(source, normalized);
}

export function readValue(source, options = undefined) {
  const reader = makeReader(source, options);
  const value = reader.value(0);
  reader.skipIgnored();
  if (reader.index !== source.length) {
    reader.fail("trailing data after value");
  }
  return value;
}

export function readValues(source, options = undefined) {
  const reader = makeReader(source, options);
  const values = [];
  reader.skipIgnored();
  while (reader.index < source.length) {
    values.push(reader.value(0));
    reader.skipIgnored();
  }
  return Object.freeze(values);
}
