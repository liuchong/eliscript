import { memoizedSequenceView } from "./collection.mjs";
import { persistentVector } from "./vector.mjs";

const patternStates = new WeakMap();
const ALLOWED_FLAGS = "imsu";

function requireArity(actual, expected, name) {
  if (actual !== expected) {
    const unit = expected === 1 ? "argument" : "arguments";
    throw new TypeError(`${name} requires exactly ${expected} ${unit}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function normalizeFlags(value) {
  const flags = requireString(value, "regex flags");
  const seen = new Set();
  for (const flag of flags) {
    if (!ALLOWED_FLAGS.includes(flag)) {
      throw new TypeError(`regex flags contain unsupported flag: ${flag}`);
    }
    if (seen.has(flag)) {
      throw new TypeError(`regex flags contain duplicate flag: ${flag}`);
    }
    seen.add(flag);
  }
  return [...ALLOWED_FLAGS].filter((flag) => seen.has(flag)).join("");
}

function stateOf(pattern) {
  const state = patternStates.get(pattern);
  if (state === undefined) {
    throw new TypeError("operation requires an Eliscript regex pattern");
  }
  return state;
}

function nativePattern(pattern, global = false) {
  const state = stateOf(pattern);
  return new RegExp(state.source, global ? `${state.flags}g` : state.flags);
}

function matchValue(match) {
  if (match.length === 1) return match[0];
  return persistentVector(...Array.from(
    match,
    (value) => value === undefined ? null : value,
  ));
}

function requireStart(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("regex start must be a non-negative safe integer");
  }
  return value;
}

function advanceStringIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  if (first < 0xD800 || first > 0xDBFF) return index + 1;
  const second = text.charCodeAt(index + 1);
  return second >= 0xDC00 && second <= 0xDFFF ? index + 2 : index + 1;
}

function advanceEmptyMatch(matcher, text, match) {
  if (match[0] === "") {
    matcher.lastIndex = advanceStringIndex(
      text,
      matcher.lastIndex,
      matcher.unicode,
    );
  }
}

function scanIterator(pattern, text, start) {
  const matcher = nativePattern(pattern, true);
  matcher.lastIndex = start;
  return (function* matches() {
    while (true) {
      const match = matcher.exec(text);
      if (match === null) return;
      advanceEmptyMatch(matcher, text, match);
      yield matchValue(match);
    }
  })();
}

export function compileRegex(...arguments_) {
  if (arguments_.length < 1 || arguments_.length > 2) {
    throw new TypeError("compileRegex expects a source and optional flags");
  }
  const source = requireString(arguments_[0], "regex source");
  const flags = normalizeFlags(arguments_.length === 2 ? arguments_[1] : "");
  try {
    new RegExp(source, flags);
  } catch {
    throw new SyntaxError("regex source is invalid");
  }
  const pattern = Object.freeze({});
  patternStates.set(pattern, Object.freeze({ source, flags }));
  return pattern;
}

export function isRegexPattern(value) {
  requireArity(arguments.length, 1, "isRegexPattern");
  return patternStates.has(value);
}

export function regexSource(pattern) {
  requireArity(arguments.length, 1, "regexSource");
  return stateOf(pattern).source;
}

export function regexFlags(pattern) {
  requireArity(arguments.length, 1, "regexFlags");
  return stateOf(pattern).flags;
}

export function regexMatches(pattern, text) {
  requireArity(arguments.length, 2, "regexMatches");
  const input = requireString(text, "regex input");
  const match = nativePattern(pattern).exec(input);
  return match !== null && match.index === 0 && match[0].length === input.length
    ? matchValue(match)
    : null;
}

export function regexFind(...arguments_) {
  if (arguments_.length < 2 || arguments_.length > 3) {
    throw new TypeError("regexFind expects a pattern, input, and optional start");
  }
  const input = requireString(arguments_[1], "regex input");
  const start = requireStart(arguments_.length === 3 ? arguments_[2] : 0);
  const matcher = nativePattern(arguments_[0], true);
  matcher.lastIndex = start;
  const match = matcher.exec(input);
  return match === null ? null : matchValue(match);
}

export function regexSequence(...arguments_) {
  if (arguments_.length < 2 || arguments_.length > 3) {
    throw new TypeError("regexSequence expects a pattern, input, and optional start");
  }
  const pattern = arguments_[0];
  stateOf(pattern);
  const input = requireString(arguments_[1], "regex input");
  const start = requireStart(arguments_.length === 3 ? arguments_[2] : 0);
  return memoizedSequenceView(() => scanIterator(pattern, input, start));
}

export function regexReplace(pattern, replacement, text) {
  requireArity(arguments.length, 3, "regexReplace");
  stateOf(pattern);
  const input = requireString(text, "regex input");
  if (typeof replacement !== "string" && typeof replacement !== "function") {
    throw new TypeError("regex replacement must be a string or function");
  }

  const matcher = nativePattern(pattern, true);
  let cursor = 0;
  let output = "";
  while (true) {
    const match = matcher.exec(input);
    if (match === null) break;
    output += input.slice(cursor, match.index);
    const value = typeof replacement === "function"
      ? replacement(matchValue(match), match.index, input)
      : replacement;
    if (typeof value !== "string") {
      throw new TypeError("regex replacement function must return a string");
    }
    output += value;
    cursor = match.index + match[0].length;
    advanceEmptyMatch(matcher, input, match);
  }
  return output + input.slice(cursor);
}
