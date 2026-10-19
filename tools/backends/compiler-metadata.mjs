// Decode artifact data without joining the complete document into a host
// string. This is a JSON transport boundary, not a compiler or IR transform.
export function createCompilerMetadataDecoder() {
  const frames = [];
  // Source maps repeat filenames and range labels millions of times. Strings
  // are immutable primitive values: reusing their storage preserves JSON's
  // value semantics while every object and array still has its own identity.
  // Bound both the atom count and size for arbitrary caller metadata.
  const strings = new Map();
  let root, hasRoot = false, done = false, offset = 0;
  let token, parts = [], escaped = false;
  // Retain only decoded UTF16 blocks, never an entire escaped JSON token.
  // The lexical backslash state above is deliberately separate from escape
  // decoding: even a malformed \u escape must wait for the same unescaped
  // closing quote at which JSON.parse used to reject the token.
  const stringUnits = new Uint16Array(4096);
  let stringBlocks = [], stringLength = 0, stringEscape = 0;
  let unicodeDigits = 0, unicodeValue = 0, stringInvalid = false;
  const fail = () => {throw new SyntaxError('invalid compiler metadata JSON at offset ' + offset);};
  const whitespace = c => c === ' ' || c === '\n' || c === '\r' || c === '\t';
  const delimiter = c => whitespace(c) || c === ',' || c === ':' || c === ']' || c === '}' || c === '[' || c === '{';
  function value(item) {
    const frame = frames[frames.length - 1];
    if (!frame) {
      if (hasRoot) fail();
      root = item;hasRoot = true;return;
    }
    if (frame.array) {
      if (frame.state !== 'first' && frame.state !== 'value') fail();
      frame.value.push(item);
    } else {
      if (frame.state !== 'value') fail();
      Object.defineProperty(frame.value, frame.key, {value: item, writable: true, enumerable: true, configurable: true});
      frame.key = undefined;
    }
    frame.state = 'comma';
  }
  function stringValue(item) {
    if (item.length <= 256) {
      const previous = strings.get(item);
      if (previous !== undefined) item = previous;
      else if (strings.size < 32768) strings.set(item, item);
    }
    const frame = frames[frames.length - 1];
    if (frame && !frame.array && (frame.state === 'first' || frame.state === 'key')) {
      frame.key = item;frame.state = 'colon';return;
    }
    value(item);
  }
  function scalar(text) {value(JSON.parse(text));}
  function decodedUnit(unit) {
    stringUnits[stringLength++] = unit.charCodeAt(0);
    if (stringLength === stringUnits.length) {
      // Materialize bounded flat blocks, avoiding a retained character-sized
      // rope node for every code unit of a large source string.
      stringBlocks.push(String.fromCharCode(...stringUnits));stringLength = 0;
    }
  }
  function invalidString() {
    stringInvalid = true;
    // Nothing from an invalid token can become a key or value. Keep scanning
    // its lexical boundary without retaining unusable decoded data.
    stringBlocks = [];stringLength = 0;
  }
  function stringCharacter(c) {
    if (stringInvalid) return;
    if (stringEscape === 2) {
      const code = c.charCodeAt(0);
      const hex = code >= 48 && code <= 57 ? code - 48
        : code >= 65 && code <= 70 ? code - 55
        : code >= 97 && code <= 102 ? code - 87 : -1;
      if (hex < 0) {invalidString();return;}
      unicodeValue = unicodeValue * 16 + hex;
      if (++unicodeDigits === 4) {
        // JSON operates on UTF16 code units. In particular, an escaped lone
        // surrogate is preserved instead of being repaired or UTF8-decoded.
        decodedUnit(String.fromCharCode(unicodeValue));stringEscape = 0;
      }
      return;
    }
    if (stringEscape === 1) {
      stringEscape = 0;
      if (c === '"' || c === '\\' || c === '/') decodedUnit(c);
      else if (c === 'b') decodedUnit('\b');
      else if (c === 'f') decodedUnit('\f');
      else if (c === 'n') decodedUnit('\n');
      else if (c === 'r') decodedUnit('\r');
      else if (c === 't') decodedUnit('\t');
      else if (c === 'u') {stringEscape = 2;unicodeDigits = 0;unicodeValue = 0;}
      else invalidString();
      return;
    }
    if (c === '\\') {stringEscape = 1;return;}
    if (c.charCodeAt(0) < 32) {invalidString();return;}
    decodedUnit(c);
  }
  function finishString() {
    if (stringInvalid || stringEscape !== 0) fail();
    let item;
    if (!stringBlocks.length) item = String.fromCharCode(...stringUnits.subarray(0, stringLength));
    else {
      if (stringLength) stringBlocks.push(String.fromCharCode(...stringUnits.subarray(0, stringLength)));
      item = stringBlocks.join('');
    }
    stringBlocks = [];stringLength = 0;
    stringValue(item);
  }
  function punctuation(c) {
    const frame = frames[frames.length - 1];
    if (c === '[' || c === '{') {
      const array = c === '[', item = array ? [] : {};
      value(item);frames.push({array, value: item, state: 'first'});return;
    }
    if (c === ']' || c === '}') {
      if (!frame || frame.array !== (c === ']') || (frame.state !== 'first' && frame.state !== 'comma')) fail();
      frames.pop();return;
    }
    if (c === ',') {
      if (!frame || frame.state !== 'comma') fail();
      frame.state = frame.array ? 'value' : 'key';return;
    }
    if (c === ':') {
      if (!frame || frame.array || frame.state !== 'colon') fail();
      frame.state = 'value';return;
    }
    fail();
  }
  return Object.freeze({
    write(text) {
      if (done) throw new TypeError('compiler metadata decoder is closed');
      if (typeof text !== 'string') throw new TypeError('compiler metadata chunks must be strings');
      let start = 0;
      for (let index = 0; index < text.length; index++) {
        const c = text[index];
        if (token === 'string') {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') {
            finishString();token = undefined;continue;
          }
          stringCharacter(c);
          continue;
        }
        if (token === 'scalar') {
          if (!delimiter(c)) continue;
          parts.push(text.slice(start, index));
          scalar(parts.join(''));parts = [];token = undefined;
        }
        if (whitespace(c)) continue;
        if (c === '"') {
          token = 'string';escaped = false;
          stringBlocks = [];stringLength = 0;stringEscape = 0;
          unicodeDigits = 0;unicodeValue = 0;stringInvalid = false;continue;
        }
        if (c === '-' || (c >= '0' && c <= '9') || c === 't' || c === 'f' || c === 'n') {
          token = 'scalar';start = index;continue;
        }
        punctuation(c);
      }
      if (token === 'scalar') parts.push(text.slice(start));
      offset += text.length;
    },
    finish() {
      if (done) throw new TypeError('compiler metadata decoder is closed');
      done = true;
      if (token === 'scalar') {scalar(parts.join(''));parts = [];token = undefined;}
      if (token || frames.length || !hasRoot) fail();
      return root;
    },
  });
}

export async function readCompilerMetadata(path) {
  const {open} = await import('node:fs/promises');
  const file = await open(path, 'r');
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  const parser = createCompilerMetadataDecoder();
  const buffer = new Uint8Array(65536);
  let failed = false;
  try {
    for (;;) {
      const {bytesRead} = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      parser.write(decoder.decode(buffer.subarray(0, bytesRead), {stream: true}));
    }
    parser.write(decoder.decode());
    return parser.finish();
  } catch (error) {failed = true;throw error;}
  finally {
    try {await file.close();} catch (error) {if (!failed) throw error;}
  }
}

// Resource identity validation stays with the caller. Decode only the checked
// bytes, without constructing a second document-sized text buffer.
export function decodeCompilerMetadataBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('compiler metadata must contain UTF8 bytes');
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  const parser = createCompilerMetadataDecoder();
  for (let offset = 0; offset < bytes.byteLength; offset += 65536)
    parser.write(decoder.decode(bytes.subarray(offset, offset + 65536), {stream: true}));
  parser.write(decoder.decode());return parser.finish();
}
