import {instantiateManagedRuntime} from './managed-runtime.mjs';

const names = Object.freeze({
  create: 'compiler_session_new',
  request: 'compiler_session_request',
  close: 'compiler_session_close',
});
const compilerHeap = Object.freeze({
  maxSlots: 131072, initialBytes: 8388608, maxBytes: 67108864,
});
const compilerMemory = Object.freeze({initialPages: 128, maximumPages: 4096});
const ownedCompilerBuildRequests = new WeakMap();
const ownedCompilerBuildProducts = new WeakSet();
const compilerBuildConsumptionRequests = new WeakMap();

// Ownership is recorded by the successful private handoff, never by a field
// on a caller-provided producer or response. Only these products may stream
// their private debug values without the public writer's eager snapshot.
export function isOwnedCompilerBuildProduct(value) {
  return ownedCompilerBuildProducts.has(value);
}

// Only the concrete JavaScript session below can own a freshly emitted binary
// product. Public requests and arbitrary producer wrappers keep their wire
// snapshot contract; no caller-provided property enables this internal path.
export function requestCompilerBuildProduct(session, request, options) {
  const owned = ownedCompilerBuildRequests.get(session);
  return owned ? owned(request, options) : session.request(request, options);
}

// A driver's private handoff can retain canonical subtrees. Its public wire
// response instead creates a complete new data graph, including debug/typed
// records. A verified artifact loader may register its existing fresh-product
// handoff instead. Public producers cannot transfer either right through
// fields on a response or an old ownership token.
export async function requestCompilerBuildConsumption(session, request, options) {
  const consume = compilerBuildConsumptionRequests.get(session);
  return {product: await (consume ? consume(request, options) : session.request(request, options)),
    owned: consume !== undefined};
}

export async function registerVerifiedCompilerBuildConsumption(session) {
  const loader = './compiler-bootstrap.mjs';
  const {isVerifiedCompilerBuildSession} = await import(loader);
  const owned = ownedCompilerBuildRequests.get(session);
  if (!owned || !isVerifiedCompilerBuildSession(session)) {
    throw new TypeError('exclusive compiler consumption requires a verified JavaScript artifact session');
  }
  compilerBuildConsumptionRequests.set(session, owned);
  return session;
}

// The authenticated artifact adapter injects runtime assets in its public
// request method. Only its project dispatch forwards ownership unchanged;
// wrapping that adapter again does not inherit this private registration.
export function registerCompilerBuildProductForwarder(adapter, session) {
  const owned = ownedCompilerBuildRequests.get(session);
  if (owned) ownedCompilerBuildRequests.set(adapter, (request, options) => {
    const record = typeof request === 'string' ? JSON.parse(request) : request;
    return record?.operation === 'project' ? owned(request, options) : adapter.request(request, options);
  });
  const consume = compilerBuildConsumptionRequests.get(session);
  if (consume) compilerBuildConsumptionRequests.set(adapter, (request, options) => {
    const record = typeof request === 'string' ? JSON.parse(request) : request;
    return record?.operation === 'project' ? consume(request, options) : adapter.request(request, options);
  });
  return adapter;
}

// UTF-8 files cannot represent an unpaired UTF-16 surrogate. Such virtual
// source text crosses the file/download boundary as a JSON string instead of
// silently becoming U+FFFD; ordinary source files keep their existing format.
export function compilerSourceAssetEncoding(source) {
  if (typeof source !== 'string') throw new TypeError('compiler source asset must contain a string');
  for (let index = 0; index < source.length; index++) {
    const unit = source.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
      else return 'json-utf16';
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return 'json-utf16';
  }
  return 'utf8';
}

export function encodeCompilerSourceAsset(source) {
  const encoding = compilerSourceAssetEncoding(source);
  return {encoding, text: encoding === 'utf8' ? source : JSON.stringify(source)};
}

export function decodeCompilerSourceAsset(bytes, encoding = 'utf8') {
  if (encoding !== 'utf8' && encoding !== 'json-utf16') throw new TypeError('unsupported compiler source asset encoding');
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  if (encoding === 'utf8') return text;
  const source = JSON.parse(text);
  if (typeof source !== 'string') throw new TypeError('encoded compiler source asset must contain a JSON string');
  return source;
}

function checkSignal(signal) {
  if (signal === undefined) return;
  if (signal === null || typeof signal !== 'object' || typeof signal.aborted !== 'boolean') {
    throw new TypeError('compiler request requires an AbortSignal');
  }
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  else if (signal.aborted) {
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error('compiler request aborted');error.name = 'AbortError';throw error;
  }
}

function compilerResponseEvents(graph = false, stringChunks = false) {
  let root, hasRoot = false;
  const frames = [], references = [], activeReferences = new Set();
  const invalid = () => {throw new TypeError('compiler returned invalid response events');};
  const attach = value => {
    if (!frames.length) {
      if (hasRoot) invalid();
      root = value;hasRoot = true;return;
    }
    const frame = frames[frames.length - 1];
    if (frame.array) frame.value.push(value);
    else {
      if (!frame.hasKey) invalid();
      Object.defineProperty(frame.value, frame.key, {value, writable: true, enumerable: true, configurable: true});
      frame.hasKey = false;frame.key = undefined;
    }
  };
  return {
    append(events) {
      if (!Array.isArray(events) || !events.length || events.length > 256) invalid();
      for (const event of events) {
        if (!Array.isArray(event)) invalid();
        const [kind, value] = event;
        const active = frames[frames.length - 1];
        if (active?.string) {
          if (kind === 'string-chunk' && event.length === 2 && typeof value === 'string' &&
              value.length > 0 && value.length <= 8192 && active.units + value.length <= active.length) {
            active.parts.push(value);active.units += value.length;
          } else if (kind === 'end' && event.length === 1 && active.units === active.length) {
            frames.pop();
            const text = active.parts.join('');active.parts = undefined;
            attach(text);
          } else invalid();
        } else if (stringChunks && kind === 'string' && event.length === 2 &&
                   Number.isSafeInteger(value) && value > 0) {
          // Complete only after the announced UTF16 length is received. The
          // parent key remains pending until this single scalar is attached.
          frames.push({string: true, length: value, units: 0, parts: []});
        } else if ((kind === 'object' || kind === 'array') &&
            (graph ? event.length === 2 && Number.isSafeInteger(value) && value === references.length + 1
              : event.length === 1)) {
          const container = kind === 'array' ? [] : {};
          if (graph) {references.push(container);activeReferences.add(value);}
          attach(container);frames.push({value: container, array: kind === 'array', hasKey: false, reference: graph ? value : undefined});
        } else if (graph && kind === 'reference' && event.length === 2) {
          if (!Number.isSafeInteger(value) || value < 1 || value > references.length || activeReferences.has(value)) invalid();
          attach(references[value - 1]);
        } else if (kind === 'key' && event.length === 2 && typeof value === 'string') {
          const frame = frames[frames.length - 1];
          if (!frame || frame.array || frame.hasKey) invalid();
          frame.key = value;frame.hasKey = true;
        } else if (kind === 'value' && event.length === 2 &&
            (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
          attach(value);
        } else if (kind === 'array-values' && event.length === 2) {
          const frame = frames[frames.length - 1];
          if (!frame?.array || !Array.isArray(value) || value.length < 1 || value.length > 256 ||
              value.some(item => item !== null && (typeof item !== 'number' || !Number.isFinite(item)))) invalid();
          // Bounded scalar runs preserve every element, including IEEE -0.
          // Validate the whole run before appending any of its values.
          for (const item of value) frame.value.push(item);
        } else if (kind === 'end' && event.length === 1) {
          const frame = frames.pop();
          if (!frame || frame.hasKey) invalid();
          if (graph) activeReferences.delete(frame.reference);
        } else invalid();
      }
    },
    get complete() {return hasRoot && frames.length === 0;},
    get value() {if (!this.complete) invalid();return root;},
    release() {
      // Neither a failed/cancelled response nor a completed handoff keeps its
      // temporary string pieces or graph identity index beside later replies.
      for (const frame of frames) if (frame.string) frame.parts = undefined;
      frames.length = 0;references.length = 0;activeReferences.clear();
      root = undefined;hasRoot = false;
    },
  };
}

function encodeRequest(request) {
  if (typeof request === 'string') return request;
  const text = JSON.stringify(request);
  if (typeof text !== 'string') throw new TypeError('compiler request must contain JSON data');
  return text;
}

// A data codec for the already produced IR. It performs no compilation or IR
// reconstruction, and preserves the IEEE negative zero in JSON number text.
export function encodeCompilerIR(program) {
  return encodeCompilerData(program,false);
}

// Retained compiler data uses the same IEEE-preserving, non-recursive wire
// format. Diagnostic BigInts keep the metadata boundary's decimal-string form;
// executable IR continues to reject them rather than silently changing types.
export function encodeCompilerMetadata(value) {
  return encodeCompilerData(value,true);
}

// Packaging can hash the exact metadata wire without first materializing one
// giant string. Consumption is synchronous, so getters and shared subtrees
// have the same visit order as encodeCompilerMetadata.
export function forEachCompilerMetadataChunk(value, consume) {
  if (typeof consume !== 'function') throw new TypeError('compiler metadata chunk consumer must be a function');
  encodeCompilerData(value, true, consume);
}

// The IR wire differs from metadata only in rejecting BigInt. Archive writers
// use this exact codec without materializing an additional complete document.
export function forEachCompilerIRChunk(value, consume) {
  if (typeof consume !== 'function') throw new TypeError('compiler IR chunk consumer must be a function');
  encodeCompilerData(value, false, consume);
}

function encodeCompilerData(program,metadata,consume) {
  // Bound the number of live token strings while retaining exact wire bytes.
  // Large binaries/typed IR otherwise keep millions of tiny strings and an
  // equally large pointer array until the final join.
  const chunks = consume ? undefined : [], ancestors = new Set(), frames = [], quotedStrings = new Map();
  const emit = consume ?? (text => chunks.push(text));
  const largeTokenUnits = 1024;
  // Quoting is a discardable primitive-value cache, not an identity table.
  // Getters can produce arbitrarily many distinct long strings during a
  // streaming hash. Bound both key and quoted text retained by this call.
  const quotedStringUnitsLimit = 4194304, quotedStringEntriesLimit = 1024;
  const quotedStringBlockUnits = 8192, quotedStringWholeUnits = 32768;
  let quotedStringUnits = 0, pending = [], pendingUnits = 0;
  const flush = () => {
    if (!pending.length) return;
    emit(pending.join(''));pending = [];pendingUnits = 0;
  };
  const push = text => {
    // A repeated source token already owns its exact quoted bytes. Joining it
    // with punctuation here would create another large copy for every edge,
    // defeating sharing until the final output is assembled.
    if (text.length >= largeTokenUnits) {flush();emit(text);return;}
    pending.push(text);pendingUnits += text.length;
    if (pending.length >= 2048 || pendingUnits >= 32768) flush();
  };
  const rememberQuote = (value, text, units) => {
    if (quotedStrings.size >= quotedStringEntriesLimit || quotedStringUnits + units > quotedStringUnitsLimit) {
      quotedStrings.clear();quotedStringUnits = 0;
    }
    quotedStrings.set(value, text);quotedStringUnits += units;
  };
  const quote = value => {
    if (value.length < largeTokenUnits) return JSON.stringify(value);
    let text = quotedStrings.get(value);
    if (text === undefined) {
      text = JSON.stringify(value);
      const units = value.length + text.length;
      if (units <= quotedStringUnitsLimit) rememberQuote(value, text, units);
    }
    return text;
  };
  const pushQuoted = value => {
    if (value.length <= quotedStringWholeUnits) {push(quote(value));return;}
    // A bounded output writer must also bound quoting its largest primitive.
    // Never form a second complete escaped source string before streaming it.
    const cached = quotedStrings.get(value);
    if (cached !== undefined) {
      push('"');for (const part of cached) push(part);push('"');return;
    }
    let parts = value.length * 2 + 2 <= quotedStringUnitsLimit ? [] : undefined;
    let units = value.length + 2;
    push('"');
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + quotedStringBlockUnits, value.length);
      if (end < value.length) {
        const high = value.charCodeAt(end - 1), low = value.charCodeAt(end);
        if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) end--;
      }
      // JSON's escaping is local to code points. Keeping a surrogate pair in
      // one block preserves both well-formed JSON spelling and UTF8 hashing.
      const part = JSON.stringify(value.slice(start, end)).slice(1, -1);
      push(part);units += part.length;
      if (parts !== undefined) {
        if (units > quotedStringUnitsLimit) parts = undefined;
        else parts.push(part);
      }
      start = end;
    }
    push('"');
    if (parts !== undefined) rememberQuote(value, parts, units);
  };
  function append(value, arrayElement = false) {
    if (value === null) {push('null');return true;}
    const kind = typeof value;
    if (kind === 'bigint') {
      if (!metadata) throw new TypeError('compiler IR cannot contain BigInt values');
      pushQuoted(String(value));return true;
    }
    if (kind === 'number') {push(Object.is(value, -0) ? '-0' : JSON.stringify(value));return true;}
    if (kind === 'string') {pushQuoted(value);return true;}
    if (kind === 'boolean') {push(JSON.stringify(value));return true;}
    if (kind !== 'object') {if (arrayElement) push('null');return false;}
    if (ancestors.has(value)) throw new TypeError('compiler IR cannot contain cycles');
    ancestors.add(value);
    if (Array.isArray(value)) {
      push('[');
      frames.push({value, array: true, index: 0});
    } else {
      push('{');
      frames.push({value, array: false, keys: Object.keys(value), index: 0, first: true});
    }
    return true;
  }
  if (!append(program)) throw new TypeError('compiler IR must be JSON data');
  // Keep traversal state on the data stack. Complete compiler IR can exceed
  // the host call-stack depth, and shared subtrees must remain legal once
  // their previous traversal has completed.
  while (frames.length) {
    const frame = frames[frames.length - 1];
    if (frame.array) {
      if (frame.index < frame.value.length) {
        const index = frame.index++;
        if (index) push(',');
        append(frame.value[index], true);
        continue;
      }
    } else if (frame.index < frame.keys.length) {
      const key = frame.keys[frame.index++], item = frame.value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      if (!frame.first) push(',');
      frame.first = false;
      pushQuoted(key);push(':');
      append(item);
      continue;
    }
    push(frame.array ? ']' : '}');
    ancestors.delete(frame.value);
    frames.pop();
  }
  flush();return chunks?.join('');
}

// Like the response identity index, necessary object identities are split
// across finite host tables. The index lives only for one private handoff;
// its keys are already owned by that handoff or the compiler's source cache.
function compilerOwnedDataMemo(segmentSize = 1048576) {
  if (!Number.isSafeInteger(segmentSize) || segmentSize < 1 || segmentSize > 1048576)
    throw new TypeError('invalid owned compiler memo segment size');
  const segments = [new Map()];
  const find = key => {
    for (let index = segments.length - 1; index >= 0; index--)
      if (segments[index].has(key)) return segments[index];
  };
  return {segments,
    has(key) {return find(key) !== undefined;},
    get(key) {return find(key)?.get(key);},
    set(key, value) {
      let segment = find(key);
      if (!segment) {
        segment = segments[segments.length - 1];
        if (segment.size >= segmentSize) {segment = new Map();segments.push(segment);}
      }
      segment.set(key, value);
    },
  };
}

// The private producer hands over data records, not caller objects. Preserve
// the public wire's values without serializing and parsing the entire graph.
// Canonical subgraphs keep their storage; only changed nodes and their parent
// paths are copied. In particular, shared source spans are never mutated.
function ownedCompilerDataNormalizer({segmentSize = 1048576, completeLimit = 65536} = {}) {
  if (!Number.isSafeInteger(completeLimit) || completeLimit < 1 || completeLimit > 65536)
    throw new TypeError('invalid owned compiler completion cache size');
  const omitted = Symbol('omitted compiler field'), active = new Set(), complete = new Set();
  const replacements = compilerOwnedDataMemo(segmentSize), borrowedCopies = compilerOwnedDataMemo(segmentSize), frames = [];
  const remember = value => {
    // This only avoids walking unchanged subgraphs again; forgetting a hit is
    // safe. Changed results and detached borrowed edges have persistent memos.
    if (complete.size >= completeLimit) complete.clear();
    complete.add(value);
  };
  const resolved = (value, borrowed) => borrowed ? borrowedCopies.get(value)
    : replacements.has(value) ? replacements.get(value) : value;
  function begin(value, borrowed = false) {
    const array = Array.isArray(value);
    active.add(value);
    const keys = Object.keys(value), ownKeys = Reflect.ownKeys(value);
    frames.push({value, array, borrowed, keys: array ? undefined : keys, index: 0, changes: undefined,
      copy: borrowed || ownKeys.length !== (array ? value.length + 1 : keys.length) ||
        Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)});
  }
  function change(frame, key, before, after) {
    if (!Object.is(before, after)) {
      (frame.changes ??= new Map()).set(key, after);frame.copy = true;
    }
  }
  const scalar = (value, array) => {
    const kind = typeof value;
    if (kind === 'bigint') throw new TypeError('compiler IR cannot contain BigInt values');
    if (kind === 'number') return Number.isFinite(value) ? value : null;
    if (value === undefined || kind === 'function' || kind === 'symbol') return array ? null : omitted;
    return value;
  };
  return function normalize(root) {
  if (root === null || typeof root !== 'object') {
    const result = scalar(root, false);
    if (result === omitted) throw new TypeError('compiler IR must be JSON data');
    return result;
  }
  begin(root);
  while (frames.length) {
    const frame = frames[frames.length - 1], count = frame.array ? frame.value.length : frame.keys.length;
    if (frame.child) {
      const {key, value, borrowed} = frame.child;frame.child = undefined;
      const result = resolved(value, borrowed);
      // lower-scalar-program creates fresh function/body/local containers,
      // but function.source and expression.span borrow cached frontend IR.
      // Debug also borrows span and macroOrigins. Replace only those edges
      // on fresh records; copying their entire typed parent paths would
      // duplicate almost the whole runtime for no isolation benefit.
      if (borrowed && !frame.borrowed && Object.getOwnPropertyDescriptor(frame.value, key)?.writable) {
        Object.defineProperty(frame.value, key, {value: result});
        frame.detached = true;
      } else change(frame, key, value, result);
      continue;
    }
    if (frame.index < count) {
      const key = frame.array ? frame.index++ : frame.keys[frame.index++];
      const property = Object.getOwnPropertyDescriptor(frame.value, key);
      // Fresh compiler records contain data properties. Do not reinterpret an
      // accessor or execute it a second time while making a partial copy. Its
      // original thrown value still wins over this malformed-payload error.
      if (property && !Object.hasOwn(property, 'value')) {
        Reflect.get(frame.value, key);
        throw new TypeError('owned compiler data must contain data properties');
      }
      const value = Reflect.get(frame.value, key), normalized = scalar(value, frame.array);
      change(frame, key, value, normalized);
      if (!property) {(frame.changes ??= new Map()).set(key, normalized);frame.copy = true;}
      if (normalized === null || typeof normalized !== 'object') continue;
      if (active.has(value)) throw new TypeError('compiler IR cannot contain cycles');
      const borrowed = frame.borrowed || key === 'source' || key === 'span' || key === 'macroOrigins' || key === 'hostCapabilities';
      frame.child = {key, value, borrowed};
      if (borrowed ? borrowedCopies.has(value) : replacements.has(value) || complete.has(value)) continue;
      begin(value, borrowed);continue;
    }
    if (frame.copy) {
      const copy = frame.array ? new Array(count) : {};
      for (let index = 0; index < count; index++) {
        const key = frame.array ? index : frame.keys[index];
        const value = frame.changes?.has(key) ? frame.changes.get(key)
          : Object.getOwnPropertyDescriptor(frame.value, key)?.value;
        if (value !== omitted) Object.defineProperty(copy, key, {value, writable: true, enumerable: true, configurable: true});
      }
      (frame.borrowed ? borrowedCopies : replacements).set(frame.value, copy);
    } else if (frame.detached) {
      // A cache miss must not revisit an edge now pointing at its private
      // copy and detach it a second time. Preserve that identity independently
      // of the optional, bounded completion cache.
      replacements.set(frame.value, frame.value);
    }
    active.delete(frame.value);if (!frame.borrowed) remember(frame.value);frames.pop();
  }
  return resolved(root, false);
  };
}

function withRoots(runtime, operation) {
  const roots = [];let result, failed = false, failure;
  try {result = operation(value => {roots.push(value);return value;});}
  catch (error) {failed = true;failure = error;}
  for (let i = roots.length - 1; i >= 0; i--) {
    try {runtime.release(roots[i]);}
    catch (error) {if (!failed) {failed = true;failure = error;}}
  }
  if (failed) throw failure;
  return result;
}

function property(runtime, object, name, read, {optionalEngineStack = false} = {}) {
  return withRoots(runtime, own => {
    const key = own(runtime.string(name));
    // An independent runtime may represent explicit stack fields without
    // generating an execution stack. Never demand that missing capability
    // while transporting the source exception; represented getters still run.
    if (optionalEngineStack && runtime.errorStackAvailable?.(object, key) === false) return read(undefined);
    return read(own(runtime.objectGet(object, key)));
  });
}

// This copies diagnostic data across the ownership boundary, never compiler IR
// or executable source algorithms. All visited values remain rooted by callers.
function completedException(runtime, value, result, memo) {
  if (memo) {
    runtime.pin(value);
    memo.own(value);
    memo.entries.push({source: value, result});
  }
  return result;
}

function diagnosticData(runtime, value, ancestors = [], memo) {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (value.kind === 4) return runtime.readNumber(value);
  if (value.kind === 5) return runtime.readString(value);
  if (value.kind === 34) return runtime.readBigInt(value);
  if (ancestors.length >= 64 || ancestors.some(parent => runtime.keyEqual(parent, value))) {
    throw new TypeError('compiler diagnostic is cyclic or exceeds its nesting limit');
  }
  const completed = memo?.entries.find(entry => runtime.keyEqual(entry.source, value));
  if (completed) return completed.result;
  const path = [...ancestors, value];
  if (value.kind === 7 || value.kind === 8 || value.kind === 14) {
    const result = [];
    for (let i = 0; i < runtime.length(value); i++) {
      result.push(withRoots(runtime, own => diagnosticData(runtime, own(runtime.get(value, i)), path, memo)));
    }
    return completedException(runtime, value, result, memo);
  }
  if (value.kind !== 13) throw new TypeError('compiler diagnostic contains an opaque value');
  return withRoots(runtime, own => {
    const keys = own(runtime.objectKeys(value)), result = {};
    for (let i = 0; i < runtime.length(keys); i++) {
      withRoots(runtime, keep => {
        const key = keep(runtime.get(keys, i)), name = runtime.readString(key);
        const item = keep(runtime.objectGet(value, key));
        Object.defineProperty(result, name, {
          value: diagnosticData(runtime, item, path, memo), enumerable: true, writable: true, configurable: true,
        });
      });
    }
    return completedException(runtime, value, result, memo);
  });
}

function exceptionEntries(runtime, value, ancestors, memo) {
  if (value === null || value === undefined || typeof value === 'boolean' ||
      ![7, 8, 14].includes(value.kind)) {
    return sourceException(runtime, value, ancestors, memo);
  }
  if (ancestors.length >= 64 || ancestors.some(parent => runtime.keyEqual(parent, value))) {
    throw new TypeError('compiler exception errors are cyclic or exceed their nesting limit');
  }
  const completed = memo.entries.find(entry => runtime.keyEqual(entry.source, value));
  if (completed) return completed.result;
  const path = [...ancestors, value], result = [];
  for (let index = 0; index < runtime.length(value); index++) {
    result.push(withRoots(runtime, own =>
      exceptionEntries(runtime, own(runtime.get(value, index)), path, memo)));
  }
  return completedException(runtime, value, result, memo);
}

function sourceException(runtime, value, ancestors = [], memo) {
  if (!memo) return withRoots(runtime, own => sourceException(runtime, value, ancestors, {entries: [], own}));
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (value.kind === 4) return runtime.readNumber(value);
  if (value.kind === 5) return runtime.readString(value);
  if (value.kind === 34) return runtime.readBigInt(value);
  if ([7, 8, 14].includes(value.kind)) return exceptionEntries(runtime, value, ancestors, memo);
  if (value.kind !== 13) return diagnosticData(runtime, value, ancestors, memo);
  if (ancestors.length >= 64 || ancestors.some(parent => runtime.keyEqual(parent, value))) {
    throw new TypeError('compiler exception cause is cyclic or exceeds its nesting limit');
  }
  const completed = memo.entries.find(entry => runtime.keyEqual(entry.source, value));
  if (completed) return completed.result;
  const path = [...ancestors, value];
  const name = property(runtime, value, 'name', field => field?.kind === 5 ? runtime.readString(field) : undefined);
  const message = property(runtime, value, 'message', field => field?.kind === 5 ? runtime.readString(field) : undefined);
  if (name === undefined && message === undefined) return diagnosticData(runtime, value, ancestors, memo);
  const constructors = {Error, TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError, AggregateError};
  const Constructor = Object.hasOwn(constructors, name) ? constructors[name] : Error;
  const error = Constructor === AggregateError ? new AggregateError([], message ?? '') : new Constructor(message ?? '');
  if (name !== undefined) error.name = name;
  if (Constructor === AggregateError) {
    withRoots(runtime, own => {
      const key = own(runtime.string('errors'));
      const present = runtime.objectHas(value, key);
      const field = own(runtime.objectGet(value, key));
      if (present || field !== undefined) {
        Object.defineProperty(error, 'errors', {
          value: exceptionEntries(runtime, field, path, memo), configurable: true, writable: true,
        });
      } else delete error.errors;
    });
  }
  property(runtime, value, 'stack', field => {
    if (field?.kind === 5) Object.defineProperty(error, 'stack', {
      value: runtime.readString(field), configurable: true, writable: true,
    });
  }, {optionalEngineStack: true});
  property(runtime, value, 'eliscriptDiagnostic', field => {
    if (field !== undefined && field !== null) error.eliscriptDiagnostic = diagnosticData(runtime, field, [], memo);
  });
  for (const key of ['code', 'diagnostics', 'macroOrigins','eliscriptFrames','eliscriptSourceFrames']) {
    property(runtime, value, key, field => {
      if (field !== undefined) Object.defineProperty(error, key, {
        value: diagnosticData(runtime, field, [], memo), enumerable: true, configurable: true, writable: true,
      });
    });
  }
  withRoots(runtime, own => {
    const key = own(runtime.string('cause'));
    const present = runtime.objectHas(value, key);
    const field = own(runtime.objectGet(value, key));
    if (present || field !== undefined) Object.defineProperty(error, 'cause', {
      value: sourceException(runtime, field, path, memo), configurable: true, writable: true,
    });
  });
  return completedException(runtime, value, error, memo);
}

function transferError(runtime, error) {
  if (!runtime || error === null || typeof error !== 'object' || typeof error.kind !== 'number' || error instanceof Error) {
    return error;
  }
  let result,release=true;
  try {result = sourceException(runtime, error);}
  catch (conversionError) {
    // Even if an exhausted heap cannot copy a diagnostic, preserve the first
    // thrown value rather than replacing it with a transport/cleanup failure.
    try{result=runtime.toHostValue(error);}catch{result=error;release=false;}
    if (conversionError !== error && conversionError?.kind !== undefined) {
      try {runtime.release(conversionError);} catch {}
    }
  } finally {
    try {if(release)runtime.release(error);} catch (releaseError) {
      if (result instanceof Error) result.releaseError = releaseError;
    }
  }
  return result;
}

// A session owns one long-lived driver state. Requests cross as one JSON
// string; target selection, compilation and runtime caching stay in the driver.
// Only the private JS build handoff consumes a fresh result without a JSON copy.
export async function createCompilerSession({host, compiler, bytes, descriptor, path, memory = {}, options = {}} = {}) {
  if (!['javascript', 'wasm', 'native'].includes(host)) throw new TypeError('unknown compiler session host');
  if (options === null || typeof options !== 'object' || Array.isArray(options) ||
      memory === null || typeof memory !== 'object' || Array.isArray(memory)) {
    throw new TypeError('compiler session memory and options must be objects');
  }
  let runtime, driver, state, hasState = false, closed = false, busy = false;
  const {auto = 65536, ...heapOptions} = options;
  if (!Number.isInteger(auto) || auto < 0 || auto > 0xffffffff) throw new RangeError('invalid compiler collection threshold');

  function closeOwned() {
    let failed = false, failure;
    const attempt = operation => {
      try {operation();}
      catch (error) {const transferred = transferError(runtime, error);if (!failed) {failed = true;failure = transferred;}}
    };
    if (hasState) {
      if (runtime) {
        attempt(() => {const result = runtime.invoke(names.close, [state]);runtime.release(result);});
        attempt(() => runtime.release(state));
      } else attempt(() => Reflect.apply(driver.close, driver.module, [state]));
    }
    hasState = false;state = undefined;
    if (runtime) {
      attempt(() => runtime.closeModule());
      attempt(() => runtime.collect());
      attempt(() => runtime.close?.());
    }
    driver = undefined;runtime = undefined;
    if (failed) throw failure;
  }

  try {
    if (host === 'javascript') {
      if (!compiler || typeof compiler !== 'object') throw new TypeError('JavaScript compiler session requires a driver module');
      driver = {module: compiler, create: compiler[names.create], request: compiler[names.request], close: compiler[names.close]};
      if ([driver.create, driver.request, driver.close].some(value => typeof value !== 'function')) {
        throw new TypeError('compiler driver is missing its session exports');
      }
      state = Reflect.apply(driver.create, driver.module, []);hasState = true;
    } else {
      const settings = {...compilerHeap, ...heapOptions, initializeModule: false};
      if (host === 'wasm') {
        if (bytes === undefined) throw new TypeError('WASM compiler session requires an artifact');
        runtime = instantiateManagedRuntime(bytes, settings);
      } else {
        if (typeof path !== 'string' || !path || descriptor?.typed?.abi !== 'memory-u32' || !descriptor.descriptor) {
          throw new TypeError('native compiler session requires its library path and complete lowering descriptor');
        }
        const nativeModule = './native-managed-runtime.mjs';
        const {instantiateNativeManagedRuntime} = await import(nativeModule);
        runtime = await instantiateNativeManagedRuntime(path, descriptor, {...compilerMemory, ...memory, ...settings});
      }
      runtime.auto(auto);runtime.initializeModule();
      state = runtime.invoke(names.create);hasState = true;
    }
  } catch (error) {
    const primary = transferError(runtime, error);
    try {closeOwned();} catch {} // Setup failure remains the primary exception.
    throw primary;
  }

  function exchange(text) {
    let input, output, result, failed = false, failure;
    try {
      if (runtime) {
        input = runtime.string(text);output = runtime.invoke(names.request, [state, input]);
        result = runtime.readString(output);
      } else result = Reflect.apply(driver.request, driver.module, [state, text]);
      if (typeof result !== 'string') throw new TypeError('compiler driver returned a non-JSON response');
      result = JSON.parse(result);
    } catch (error) {failed = true;failure = transferError(runtime, error);}
    finally {
      for (const value of [output, input]) if (runtime && value !== undefined) {
        try {runtime.release(value);}
        catch (error) {if (!failed) {failed = true;failure = transferError(runtime, error);}}
      }
    }
    if (failed) throw failure;
    return result;
  }

  function requestData(request, {signal, responseMode, responseStringChunks} = {}, allowOwned = false) {
      if (closed) throw new Error('compiler session is closed');
      if (busy) throw new Error('compiler session is busy');
      if (responseMode !== undefined && responseMode !== 'events-v1' && responseMode !== 'graph-events-v1')
        throw new TypeError('unsupported compiler response mode');
      if (responseStringChunks !== undefined && typeof responseStringChunks !== 'boolean')
        throw new TypeError('compiler response string chunks must be a boolean');
      if (responseStringChunks === true && responseMode === undefined)
        throw new TypeError('compiler response string chunks require an event response mode');
      checkSignal(signal);busy = true;
      let failed = false, failure, result, token, pending = false, transferred = false;
      const receive = text => {
        try {return exchange(text);}
        catch (error) {transferred = true;throw error;}
      };
      try {
        let text = encodeRequest(request);checkSignal(signal);
        if (responseStringChunks === true) {
          // This extension is opt-in and declared by the concrete driver.
          // An opaque/older driver keeps its original request protocol and
          // never receives an unadvertised chunking field or a silent retry.
          const capabilities = receive(JSON.stringify({operation: 'capabilities'}));
          checkSignal(signal);
          if (capabilities?.responseStringChunks !== true)
            throw new TypeError('compiler driver does not support response string chunks');
        }
        let owned = false;
        if (allowOwned && !runtime) {
          const entry = driver.module.compiler_session_project_owned;
          if (typeof entry === 'function') {
            let input = JSON.parse(text);
            const target = input?.target;
            const nativeTarget = input?.nativeTarget, nativeFormat = input?.nativeFormat ?? 'library';
            const eligible = input !== null && typeof input === 'object' && !Array.isArray(input) &&
              input.operation === 'project' && (target === 'wasm' || target === 'native') && !Object.hasOwn(input, 'responseMode');
            input = undefined;
            // Pass the captured wire export itself. The actual driver refuses
            // ownership when a caller wrapped or substituted that function.
            const envelope = eligible ? Reflect.apply(entry, driver.module, [driver.request, state, text]) : null;
            if (envelope !== null) {
              if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
                  !Object.hasOwn(envelope, 'format') || !Object.hasOwn(envelope, 'version') ||
                  envelope.format !== 'eliscript-compiler-owned-project' || envelope.version !== 1 ||
                  !Object.hasOwn(envelope, 'value')) throw new TypeError('compiler returned an invalid owned project envelope');
              const product = envelope.value;
              if (!product || typeof product !== 'object' || Array.isArray(product) || product.target !== target ||
                  (target === 'wasm' ? product.typed !== undefined
                    : !product.typed || typeof product.typed !== 'object' || Array.isArray(product.typed) ||
                      product.typed.abi !== 'memory-u32' || !Array.isArray(product.typed.functions) || !Array.isArray(product.typed.exports) ||
                      typeof product.nativeTarget !== 'string' || product.nativeTarget !== nativeTarget ||
                      !['library', 'object'].includes(product.nativeFormat) || product.nativeFormat !== nativeFormat) ||
                  !product.descriptor || typeof product.descriptor !== 'object' ||
                  Array.isArray(product.descriptor) || product.bytes === undefined)
                throw new TypeError('compiler returned an invalid owned ' + target + ' project');
              // The small lowering descriptor retains the exact public JSON
              // data contract. The fresh binary and complete debug graph have
              // a single build owner and require no second serialized graph.
              // The descriptor remains a small, independent public snapshot.
              // Native typed data is also public artifact metadata: use the
              // exact wire normalization, retaining canonical DAG nodes.
              result = {...product, descriptor: JSON.parse(encodeCompilerIR(product.descriptor))};
              const normalize = ownedCompilerDataNormalizer();
              if (target === 'native') result.typed = normalize(product.typed);
              if (product.debug !== undefined) result.debug = normalize(product.debug);
              ownedCompilerBuildProducts.add(result);
              owned = true;
            }
          }
        }
        if (!owned && responseMode !== undefined) {
          const input = JSON.parse(text);
          if (input === null || typeof input !== 'object' || Array.isArray(input))
            throw new TypeError('compiler event request must be an object');
          text = JSON.stringify({...input, responseMode,
            ...(responseStringChunks === true ? {responseStringChunks: true} : {})});
        }
        if (!owned) result = receive(text);
        if (!owned && responseMode !== undefined) {
          const graph = responseMode === 'graph-events-v1', decoder = compilerResponseEvents(graph, responseStringChunks === true);
          try {
          for (;;) {
            if (!result || result.format !== 'eliscript-compiler-response-events' || result.version !== (graph ? 2 : 1) ||
                !Number.isSafeInteger(result.token) || result.token < 1 || typeof result.done !== 'boolean' ||
                (token !== undefined && token !== result.token))
              throw new TypeError('compiler returned an invalid response envelope');
            token = result.token;pending = !result.done;
            decoder.append(result.events);checkSignal(signal);
            if (result.done) {result = decoder.value;break;}
            if (decoder.complete) throw new TypeError('compiler response completed before its final envelope');
            result = receive(JSON.stringify({operation: 'response-next', token}));
          }
          } finally {decoder.release();}
        }
        // Synchronous WASM/native execution cannot be preempted by AbortSignal.
        // Observe cancellation at the completed request boundary only.
        checkSignal(signal);
      } catch (error) {failed = true;failure = transferred ? error : transferError(runtime, error);}
      finally {
        if (pending) try {exchange(JSON.stringify({operation: 'response-close', token}));} catch {}
        busy = false;
      }
      if (failed) throw failure;
      return result;
  }
  const session = Object.freeze({
    host,
    get closed() {return closed;},
    request(request, options) {return requestData(request, options);},
    close() {
      if (closed) return;
      if (busy) throw new Error('cannot close a compiler session during a request');
      closed = true;closeOwned();
    },
  });
  if (host === 'javascript') ownedCompilerBuildRequests.set(session, (request, options) => requestData(request, options, true));
  compilerBuildConsumptionRequests.set(session, (request, options) => requestData(request, options));
  return session;
}
