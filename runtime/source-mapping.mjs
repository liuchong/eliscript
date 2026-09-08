const base64Vlq = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export class SourceMappingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SourceMappingError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SourceMappingError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeVlq(segment) {
  const values = [];
  let index = 0;
  while (index < segment.length) {
    let value = 0;
    let shift = 0;
    let continuation;
    do {
      if (index >= segment.length) {
        fail("invalid-vlq", "unterminated Base64 VLQ value");
      }
      const digit = base64Vlq.indexOf(segment[index]);
      if (digit === -1) fail("invalid-vlq", "invalid Base64 VLQ digit");
      index += 1;
      value += (digit & 31) * (2 ** shift);
      continuation = (digit & 32) !== 0;
      shift += 5;
      if (shift > 50) fail("invalid-vlq", "Base64 VLQ value exceeds safe bounds");
    } while (continuation);
    const negative = (value & 1) === 1;
    const magnitude = Math.floor(value / 2);
    values.push(negative ? -magnitude : magnitude);
  }
  return values;
}

export function decodeSourceMappings(mappings) {
  if (typeof mappings !== "string") {
    fail("invalid-mappings", "source mappings must be a string");
  }
  let source = 0;
  let originalLine = 0;
  let originalColumn = 0;
  return Object.freeze(mappings.split(";").map((encodedLine) => {
    let generatedColumn = 0;
    const line = [];
    for (const encoded of encodedLine.split(",")) {
      if (encoded.length === 0) continue;
      const values = decodeVlq(encoded);
      if (![1, 4, 5].includes(values.length)) {
        fail("invalid-segment", "source map segments must contain 1, 4, or 5 fields");
      }
      generatedColumn += values[0];
      if (generatedColumn < 0) {
        fail("invalid-segment", "generated source map columns must not be negative");
      }
      const decoded = { generatedColumn };
      if (values.length >= 4) {
        source += values[1];
        originalLine += values[2];
        originalColumn += values[3];
        if (source < 0 || originalLine < 0 || originalColumn < 0) {
          fail("invalid-segment", "decoded source map positions must not be negative");
        }
        decoded.source = source;
        decoded.originalLine = originalLine;
        decoded.originalColumn = originalColumn;
      }
      line.push(Object.freeze(decoded));
    }
    return Object.freeze(line);
  }));
}

export function sourceMapDescriptor(value) {
  if (!isPlainObject(value) || typeof value.generatedFile !== "string" ||
      value.generatedFile.length === 0 || !Array.isArray(value.sources) ||
      value.sources.length === 0 || value.sources.some(
        (source) => typeof source !== "string" || source.length === 0,
      )) {
    fail(
      "invalid-source-map",
      "source map descriptor requires generatedFile sources and mappings",
    );
  }
  const lines = value.lines === undefined
    ? decodeSourceMappings(value.mappings)
    : value.lines;
  if (!Array.isArray(lines) || lines.some((line) => !Array.isArray(line))) {
    fail("invalid-source-map", "source map descriptor lines must be arrays");
  }
  for (const line of lines) {
    for (const segment of line) {
      if (!isPlainObject(segment) ||
          !Number.isInteger(segment.generatedColumn) ||
          segment.generatedColumn < 0 ||
          (segment.source !== undefined &&
            (!Number.isInteger(segment.source) || segment.source < 0 ||
              !Number.isInteger(segment.originalLine) ||
              segment.originalLine < 0 ||
              !Number.isInteger(segment.originalColumn) ||
              segment.originalColumn < 0))) {
        fail("invalid-source-map", "source map descriptor contains an invalid segment");
      }
    }
  }
  return Object.freeze({
    generatedFile: value.generatedFile,
    sources: Object.freeze([...value.sources]),
    lines: Object.freeze(lines.map((line) => Object.freeze(
      line.map((segment) => Object.freeze({ ...segment })),
    ))),
  });
}

export function parseJavaScriptStack(stack, options = {}) {
  if (typeof stack !== "string") return Object.freeze([]);
  const normalizeFile = typeof options.normalizeFile === "function"
    ? options.normalizeFile
    : (file) => file;
  const frames = [];
  for (const line of stack.split("\n")) {
    const v8 = /^\s*at (?:(.*?) \()?(.+):(\d+):(\d+)\)?$/u.exec(line);
    const browser = v8 ? null : /^(.*?)@(.+):(\d+):(\d+)$/u.exec(line.trim());
    const match = v8 ?? browser;
    if (!match) continue;
    frames.push(Object.freeze({
      function: match[1] || undefined,
      file: normalizeFile(match[2]),
      line: Number(match[3]),
      column: Number(match[4]),
    }));
  }
  return Object.freeze(frames);
}

function cleanIdentity(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return value.replace(/[?#].*$/u, "");
  }
}

function sourceIdentities(value) {
  const clean = cleanIdentity(value);
  const identities = [clean];
  try {
    const url = new URL(clean);
    if (url.protocol === "file:") identities.push(decodeURIComponent(url.pathname));
  } catch {
    // Plain filesystem paths and runtime pseudo-URLs keep their clean identity.
  }
  return identities;
}

export function mapSourceFrames(frames, sourceMaps) {
  if (!Array.isArray(frames) || !Array.isArray(sourceMaps)) {
    fail("invalid-frames", "frames and source maps must be arrays");
  }
  const mapsByFile = new Map();
  for (const sourceMap of sourceMaps) {
    for (const identity of sourceIdentities(sourceMap.generatedFile)) {
      mapsByFile.set(identity, sourceMap);
    }
  }
  return Object.freeze(frames.map((frame) => {
    const sourceMap = sourceIdentities(frame.file)
      .map((identity) => mapsByFile.get(identity))
      .find(Boolean);
    const mapping = sourceMap?.lines[frame.line - 1];
    if (!mapping) return frame;
    const generatedColumn = Math.max(0, frame.column - 1);
    let segment;
    for (const candidate of mapping) {
      if (candidate.generatedColumn > generatedColumn) break;
      segment = candidate;
    }
    if (segment?.source === undefined ||
        sourceMap.sources[segment.source] === undefined) return frame;
    return Object.freeze({
      ...frame,
      generated: Object.freeze({
        file: frame.file,
        line: frame.line,
        column: frame.column,
      }),
      file: sourceMap.sources[segment.source],
      line: segment.originalLine + 1,
      column: segment.originalColumn + 1,
    });
  }));
}

export function sourceMappedFailure(error, sourceMaps, options = {}) {
  const stack = typeof error?.stack === "string" ? error.stack : undefined;
  const frames = stack
    ? mapSourceFrames(parseJavaScriptStack(stack, options), sourceMaps)
    : Object.freeze([]);
  const location = frames.find((frame) => frame.file.endsWith(".eli")) ??
    frames[0];
  return Object.freeze({
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(stack ? { stack } : {}),
    frames,
    ...(location ? { location } : {}),
  });
}
