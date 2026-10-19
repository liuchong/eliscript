import {createCompilerSession} from './compiler-session.mjs';
import {createCompilerSha256} from './compiler-sha256.mjs';

export const compilerWorkerVersion = 1;
const identityPattern = /^[0-9a-f]{64}$/;

function transportError(code, message) {
  const error = new Error(message);error.name = 'CompilerWorkerError';error.code = code;return error;
}
function abortError(signal) {
  if (signal?.reason !== undefined) return signal.reason;
  const error = new Error('compiler request cancelled');error.name = 'AbortError';return error;
}
function encode(request) {
  if (typeof request === 'string') return request;
  const text = JSON.stringify(request);
  if (typeof text !== 'string') throw transportError('invalid-request', 'request must contain JSON data');
  return text;
}
function decode(text) {
  const request = JSON.parse(text);
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw transportError('invalid-request', 'request must be a JSON object');
  }
  return request;
}
function sourceSnapshot(request) {
  const libraries = snapshot => {
    // Only source-consuming libraries belong to this source revision. The
    // ordinary frontend operations ignore literalSources; their identity must
    // remain unchanged when a caller supplies output-only or unused fields.
    if(['compile','compile-ir','stage','format','analyze','query','edit-preview','serialize-ir',
      'deserialize-ir','emit-memory-ir','emit-typed-memory','protocol'].includes(request.operation))return snapshot;
    // Project and runtime requests distinguish omission from explicit [].
    if(Object.hasOwn(request,'literalSources'))snapshot.literalSources=Array.isArray(request.literalSources)
      ?request.literalSources.map(module=>({id:module.id,filename:module.filename,source:module.source}))
      :request.literalSources;
    return snapshot;
  };
  const macroContext = value => ({
    capabilities: Array.isArray(value?.capabilities) ? [...value.capabilities] : [],
    files: Array.isArray(value?.files) ? value.files.map(file => ({specifier: file.specifier, content: file.content})) : [],
  });
  if (Array.isArray(request.modules)) {
    return libraries({entry: request.entry, entries: request.entries, portableEntries: request.portableEntries,
      resolveImports: request.resolveImports, modules: request.modules.map(module => ({
      id: module.id, filename: module.filename ?? module.id, source: module.source,
      ...(typeof module.ir === 'string' ? {ir:module.ir} : {}),
      ...(typeof module.ir === 'string' && Object.hasOwn(module,'macroOrigins') ? {macroOrigins:module.macroOrigins} : {}),
      portableEntries: module.portableEntries,
      macroContext: macroContext(module.macroContext ?? request.macroContext),
    })),hostSources:Array.isArray(request.hostSources)?request.hostSources.map(module=>({id:module.id,filename:module.filename??module.id,source:module.source})):[],
    hostModules:Array.isArray(request.hostModules)?request.hostModules.map(module=>({id:module.id,specifier:module.specifier,referrer:module.referrer,allowedExports:module.allowedExports,namespace:module.namespace})):[]});
  }
  if (typeof request.ir === 'string') return libraries({ir:request.ir,filename:request.filename??'<input>',
    ...(typeof request.source==='string'?{source:request.source}:{})});
  if (typeof request.source === 'string') {
    const snapshot = {filename: request.filename ?? '<input>', source: request.source,
      portableEntries: request.portableEntries, allowProjectImports: request.allowProjectImports,
      macroContext: macroContext(request.macroContext)};
    return libraries(snapshot);
  }
  return null;
}
function sourceKey(request) {
  if (Array.isArray(request.modules)) return (request.operation==='project-ir'?'project-ir:':'project:') + request.entry;
  if (typeof request.ir === 'string') return 'ir:' + (request.filename ?? '<input>');
  if (typeof request.source === 'string') return 'source:' + (request.filename ?? '<input>');
  return null;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw transportError('invalid-revision', 'source revision must be a nonnegative safe integer');
  return value;
}
async function digest(text) {
  if (!globalThis.crypto?.subtle) throw transportError('unavailable-identity', 'SHA-256 is unavailable in this host');
  // Identity remains the exact pre-existing UTF16LE code-unit stream. Hash
  // bounded blocks synchronously; the hasher consumes each one before reuse.
  // Keep the async API so callers still validate cancellation/close at their
  // existing identity-await boundaries, without a whole-text byte snapshot.
  const hash = createCompilerSha256(), bytes = new Uint8Array(65536);
  for (let start = 0; start < text.length;) {
    const count = Math.min(bytes.length / 2, text.length - start);
    for (let index = 0; index < count; index++) {
      const unit = text.charCodeAt(start + index);
      bytes[index * 2] = unit & 255;bytes[index * 2 + 1] = unit >>> 8;
    }
    hash.update(bytes.subarray(0, count * 2));start += count;
  }
  return hash.digestHex();
}
export async function compilerRequestIdentity(request) {
  return digest(encode(request));
}
export async function compilerSourceIdentity(request) {
  return digest(JSON.stringify(sourceSnapshot(typeof request === 'string' ? decode(request) : request)));
}
export function errorData(error, {transport = 'structured-clone'} = {}) {
  const nodes = [], seen = new Map();
  const typedArrays = new Set(['Int8Array', 'Uint8Array', 'Uint8ClampedArray',
    'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array',
    'Float64Array', 'BigInt64Array', 'BigUint64Array']);
  const failure = (path, message) => {
    const result = transportError('uncloneable-error-cause', message + ' at ' + path);
    result.path = path;return result;
  };
  function visit(value, path) {
    if (value === undefined) return {primitive: 'undefined'};
    if (value === null) return {primitive: 'null'};
    if (typeof value === 'number') {
      if (Object.is(value, -0)) return {primitive: 'negative-zero'};
      if (Number.isNaN(value)) return {primitive: 'nan'};
      if (value === Infinity) return {primitive: 'positive-infinity'};
      if (value === -Infinity) return {primitive: 'negative-infinity'};
      return {primitive: 'number', value};
    }
    if (typeof value === 'bigint') return {primitive: 'bigint', value: value.toString()};
    if (typeof value === 'string' || typeof value === 'boolean') return {primitive: typeof value, value};
    if (typeof value !== 'object') throw failure(path, 'compiler worker exception contains an uncloneable ' + typeof value);
    if (seen.has(value)) return {ref: seen.get(value)};
    const index = nodes.length, node = {type: 'object', properties: [], extensible: Object.isExtensible(value)};
    seen.set(value, index);nodes.push(node);
    const tag = Object.prototype.toString.call(value), publicFields = new Map();
    if (value instanceof Error || tag === '[object Error]') {
      node.type = 'error';
      const name = Reflect.get(value, 'name'), message = Reflect.get(value, 'message');
      publicFields.set('name', name);publicFields.set('message', message);
      node.name = typeof name === 'string' ? name : 'Error';
      node.message = typeof message === 'string' ? message : '';
    } else if (Array.isArray(value)) node.type = 'array';
    else if (tag === '[object Map]') {
      node.type = 'map';node.entries = [];
      for (const [key, item] of Map.prototype.entries.call(value)) {
        node.entries.push([visit(key, path + '.<key>'), visit(item, path + '.<value>')]);
      }
    } else if (tag === '[object Set]') {
      node.type = 'set';node.values = [];
      for (const item of Set.prototype.values.call(value)) node.values.push(visit(item, path + '.<value>'));
    } else if (tag === '[object Date]') {
      node.type = 'date';node.time = visit(Date.prototype.getTime.call(value), path + '.<time>');
    } else if (tag === '[object RegExp]') {
      node.type = 'regexp';
      node.source = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get.call(value);
      node.flags = '';
      for (const [key, flag] of [['hasIndices','d'],['global','g'],['ignoreCase','i'],['multiline','m'],['dotAll','s'],['unicode','u'],['unicodeSets','v'],['sticky','y']]) {
        const getter = Object.getOwnPropertyDescriptor(RegExp.prototype, key)?.get;
        if (getter && getter.call(value)) node.flags += flag;
      }
    } else if (tag === '[object ArrayBuffer]') {
      node.type = 'array-buffer';node.bytes = Array.from(new Uint8Array(ArrayBuffer.prototype.slice.call(value, 0)));
    } else if (typeof SharedArrayBuffer !== 'undefined' && tag === '[object SharedArrayBuffer]') {
      if (transport === 'json') throw failure(path, 'shared memory cannot be represented by the JSON exception transport');
      node.type = 'shared-buffer';node.buffer = structuredClone(value);
    } else if (ArrayBuffer.isView(value)) {
      node.type = tag === '[object DataView]' ? 'data-view' : 'typed-array';
      node.arrayType = tag.slice(8, -1);
      if (node.type === 'typed-array' && !typedArrays.has(node.arrayType)) throw failure(path, 'unsupported exception typed array');
      node.buffer = visit(value.buffer, path + '.buffer');node.byteOffset = value.byteOffset;
      node.length = node.type === 'data-view' ? value.byteLength : value.length;
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw failure(path, 'unsupported exception object prototype');
      node.nullPrototype = prototype === null;
    }
    if (Object.getOwnPropertySymbols(value).length) throw failure(path, 'exception contains symbol property keys');
    for (const key of Object.getOwnPropertyNames(value)) {
      if (node.type === 'typed-array' && /^(?:0|[1-9][0-9]*)$/.test(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const data = Object.hasOwn(descriptor, 'value');
      if (!data && !(node.type === 'error' && ['stack', 'name', 'message', 'cause'].includes(key))) {
        throw failure(path + '.' + key, 'exception contains an unsupported accessor property');
      }
      // V8 may expose a native lazy stack accessor. Exception public fields are
      // materialized, while arbitrary data accessors remain an explicit error.
      const item = data ? descriptor.value : publicFields.has(key) ? publicFields.get(key) : Reflect.get(value, key);
      node.properties.push({key, value: visit(item, path + '.' + key),
        writable: data ? descriptor.writable : true,
        enumerable: descriptor.enumerable, configurable: descriptor.configurable});
    }
    return {ref: index};
  }
  try {
    if (!['structured-clone', 'json'].includes(transport)) throw failure('$', 'unknown exception transport');
    const root = visit(error, '$'), graph = {format: 'eliscript-worker-error-value', version: 1, root, nodes};
    const legacy = fromErrorData({errorValue: graph}, {legacyRecords: true});
    const isError = Object.hasOwn(root, 'ref') && nodes[root.ref].type === 'error';
    const result = {name: isError ? nodes[root.ref].name : 'Error',
      message: isError ? nodes[root.ref].message : typeof error === 'string' ? error : 'compiler worker threw a non-Error value'};
    if (isError) {
      if (typeof legacy.stack === 'string') result.stack = legacy.stack;
      if (transport === 'structured-clone') {
        for (const key of ['code', 'eliscriptDiagnostic', 'macroOrigins', 'cause', 'truncatedCause', 'eliscriptFrames', 'eliscriptSourceFrames']) {
          if (Object.hasOwn(legacy, key)) result[key] = legacy[key];
        }
        result.diagnostics = Array.isArray(legacy.diagnostics) ? legacy.diagnostics :
          legacy.eliscriptDiagnostic ? [legacy.eliscriptDiagnostic] : [];
      } else {
        // The graph retains the complete real fields. JSON summaries expose
        // only JSON-safe values; decoders always restore the graph first.
        if (typeof legacy.code === 'string') result.code = legacy.code;
        result.diagnostics = [];
      }
    } else result.diagnostics = [];
    result.errorValue = graph;return result;
  } catch (cause) {
    const result = {name: 'CompilerWorkerError', code: 'uncloneable-error-cause',
      message: 'compiler worker could not transport the original exception', diagnostics: []};
    if (typeof cause?.message === 'string') result.message += ': ' + cause.message;
    if (typeof cause?.path === 'string') result.transportPath = cause.path;
    if (typeof cause?.stack === 'string') result.stack = cause.stack;
    return result;
  }
}
export function fromErrorData(value, {legacyRecords = false} = {}) {
  const constructors = {Error, TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError};
  if (typeof WebAssembly !== 'undefined') {
    constructors.RuntimeError = WebAssembly.RuntimeError;
    constructors.CompileError = WebAssembly.CompileError;
    constructors.LinkError = WebAssembly.LinkError;
  }
  if (typeof AggregateError === 'function') constructors.AggregateError = AggregateError;
  const graph = value?.errorValue;
  if (graph !== undefined) {
    const invalid = message => transportError('invalid-error-value', message);
    if (graph?.format !== 'eliscript-worker-error-value' || graph.version !== 1 || !Array.isArray(graph.nodes)) {
      throw invalid('compiler worker exception graph has an invalid format');
    }
    const objects = new Map();
    const typedArrays = new Set(['Int8Array', 'Uint8Array', 'Uint8ClampedArray',
      'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array',
      'Float64Array', 'BigInt64Array', 'BigUint64Array']);
    function restore(token) {
      if (token && Object.hasOwn(token, 'primitive')) {
        switch (token.primitive) {
          case 'undefined': return undefined;
          case 'null': return null;
          case 'negative-zero': return -0;
          case 'nan': return NaN;
          case 'positive-infinity': return Infinity;
          case 'negative-infinity': return -Infinity;
          case 'number': if (typeof token.value === 'number' && Number.isFinite(token.value)) return token.value;break;
          case 'string': if (typeof token.value === 'string') return token.value;break;
          case 'boolean': if (typeof token.value === 'boolean') return token.value;break;
          case 'bigint': if (typeof token.value === 'string' && /^-?(?:0|[1-9][0-9]*)$/.test(token.value)) return BigInt(token.value);break;
        }
        throw invalid('compiler worker exception graph has an invalid primitive');
      }
      if (!Number.isSafeInteger(token?.ref) || !objects.has(token.ref)) throw invalid('compiler worker exception graph has an invalid reference');
      return objects.get(token.ref);
    }
    // Allocate all non-view shells before following edges. A buffer may hold
    // an own property pointing back to a view of itself, just like any cycle.
    for (let index = 0; index < graph.nodes.length; index++) {
      const node = graph.nodes[index];let result;
      if (node === null || typeof node !== 'object' || !Array.isArray(node.properties)) throw invalid('invalid exception node');
      if (node.type === 'data-view' || node.type === 'typed-array') continue;
      if (node.type === 'error') {
        if (typeof node.name !== 'string' || typeof node.message !== 'string') throw invalid('invalid Error summary');
        const Constructor = Object.hasOwn(constructors, node.name) ? constructors[node.name] : Error;
        result = legacyRecords ? {name: node.name, message: node.message} :
          Constructor === globalThis.AggregateError ? new Constructor([]) : new Constructor();
        if (!legacyRecords) for (const key of Object.getOwnPropertyNames(result)) {
          if (!node.properties.some(property => property.key === key)) delete result[key];
        }
        if (!legacyRecords && !Object.hasOwn(constructors, node.name)) {
          Object.defineProperty(result, 'name', {value: node.name, writable: true, configurable: true});
        }
      } else if (node.type === 'object') result = Object.create(node.nullPrototype ? null : Object.prototype);
      else if (node.type === 'array') result = [];
      else if (node.type === 'map') result = new Map();
      else if (node.type === 'set') result = new Set();
      else if (node.type === 'date') result = new Date(restore(node.time));
      else if (node.type === 'regexp') result = new RegExp(node.source, node.flags);
      else if (node.type === 'array-buffer' && Array.isArray(node.bytes) && node.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) result = Uint8Array.from(node.bytes).buffer;
      else if (node.type === 'shared-buffer' && typeof SharedArrayBuffer !== 'undefined' && node.buffer instanceof SharedArrayBuffer) result = node.buffer;
      else throw invalid('unsupported exception graph node');
      objects.set(index, result);
    }
    for (let index = 0; index < graph.nodes.length; index++) {
      const node = graph.nodes[index];
      if (node.type === 'data-view') objects.set(index, new DataView(restore(node.buffer), node.byteOffset, node.length));
      else if (node.type === 'typed-array') {
        if (!typedArrays.has(node.arrayType) || typeof globalThis[node.arrayType] !== 'function') throw invalid('unsupported exception typed array');
        objects.set(index, new globalThis[node.arrayType](restore(node.buffer), node.byteOffset, node.length));
      }
    }
    for (let index = 0; index < graph.nodes.length; index++) {
      const node = graph.nodes[index], result = objects.get(index);
      for (const property of node.properties) {
        if (typeof property?.key !== 'string') throw invalid('invalid exception property');
        Object.defineProperty(result, property.key, {value: restore(property.value),
          writable: property.writable === true,
          enumerable: legacyRecords && node.type === 'error' ? true : property.enumerable === true,
          configurable: property.configurable === true});
      }
      if (node.type === 'map') {
        if (!Array.isArray(node.entries)) throw invalid('invalid exception Map entries');
        for (const entry of node.entries) {
          if (!Array.isArray(entry) || entry.length !== 2) throw invalid('invalid exception Map entry');
          Map.prototype.set.call(result, restore(entry[0]), restore(entry[1]));
        }
      }
      if (node.type === 'set') {
        if (!Array.isArray(node.values)) throw invalid('invalid exception Set values');
        for (const item of node.values) Set.prototype.add.call(result, restore(item));
      }
      if (node.extensible === false) Object.preventExtensions(result);
    }
    return restore(graph.root);
  }
  // Old version-1 records encoded Error causes recursively without value tags.
  const records = new Map();
  function legacy(record) {
    if (record === null || typeof record !== 'object') return record;
    if (records.has(record)) return records.get(record);
    const Constructor = Object.hasOwn(constructors, record.name) ? constructors[record.name] : Error;
    const error = Constructor === globalThis.AggregateError ? new Constructor([], record.message ?? 'compiler worker failed') : new Constructor(record.message ?? 'compiler worker failed');
    records.set(record, error);error.name = record.name ?? 'Error';
    if (typeof record.stack === 'string') Object.defineProperty(error, 'stack', {value: record.stack, configurable: true, writable: true});
    for (const name of ['code', 'eliscriptDiagnostic', 'diagnostics', 'macroOrigins', 'truncatedCause', 'eliscriptFrames', 'eliscriptSourceFrames', 'transportPath']) {
      if (Object.hasOwn(record, name)) error[name] = record[name];
    }
    if (Object.hasOwn(record, 'cause')) error.cause = legacy(record.cause);
    return error;
  }
  return legacy(value);
}
function metadata(message) {
  return {version: compilerWorkerVersion, id: message.id, sourceIdentity: message.sourceIdentity,
    requestIdentity: message.requestIdentity, revision: message.revision};
}
function activeSource(records, request, message) {
  const key = sourceKey(request);
  if (key === null) return;
  const current = records.get(key);
  if (!current || current.revision !== revision(message.revision) || current.sourceIdentity !== message.sourceIdentity) {
    throw transportError('stale-source', 'compiler request does not match the current source revision and identity');
  }
  if (message.expectedRevision !== undefined && revision(message.expectedRevision) !== current.revision ||
      message.expectedSourceIdentity !== undefined && message.expectedSourceIdentity !== current.sourceIdentity) {
    throw transportError('stale-source', 'edit or query belongs to an older source snapshot');
  }
}

// Install in a dedicated module Worker. Session configuration contains actual
// artifacts or a driver module supplied by that Worker's entry, never JS fallback.
export async function installCompilerWorker(scope, configuration) {
  if (!scope || typeof scope.addEventListener !== 'function' || typeof scope.postMessage !== 'function') {
    throw new TypeError('compiler worker requires a message scope');
  }
  const records = new Map(), pending = new Map(), queue = [];
  let session, closed = false, draining = false, lastID = 0;
  const opening = createCompilerSession(configuration);
  function reply(message, fields) {scope.postMessage({...metadata(message), host: session?.host, type: 'result', ...fields});}
  async function validateIdentity(message) {
    if (message.version !== compilerWorkerVersion) throw transportError('version-mismatch', 'compiler worker protocol version 1 required');
    if (!identityPattern.test(message.requestIdentity ?? '') || !identityPattern.test(message.sourceIdentity ?? '') || typeof message.request !== 'string') {
      throw transportError('invalid-identity', 'compiler request requires request and source identities');
    }
    if (await compilerRequestIdentity(message.request) !== message.requestIdentity ||
        await compilerSourceIdentity(message.request) !== message.sourceIdentity) {
      throw transportError('stale-source', 'compiler request identity differs from its transported source');
    }
    return decode(message.request);
  }
  async function drain() {
    if (draining) return;draining = true;
    try {
      session ??= await opening;
      while (!closed && queue.length) {
        const entry = queue.shift(), {message} = entry;
        try {
          const request = await validateIdentity(message);
          if (closed || entry.controller.signal.aborted) throw abortError(entry.controller.signal);
          if (message.type === 'source') {
            const key = sourceKey(request), next = {revision: revision(message.revision), sourceIdentity: message.sourceIdentity};
            if (key === null) throw transportError('invalid-source', 'source update requires source text or project modules');
            const previous = records.get(key);
            if (previous && (next.revision < previous.revision || next.revision === previous.revision && next.sourceIdentity !== previous.sourceIdentity)) {
              throw transportError('stale-source', 'source updates must not overwrite a newer revision');
            }
            records.set(key, next);reply(message, {ok: true, result: next});
          } else {
            activeSource(records, request, message);
            const result = session.request(message.request, {signal: entry.controller.signal});
            activeSource(records, request, message);
            if (closed || entry.controller.signal.aborted) throw abortError(entry.controller.signal);
            reply(message, {ok: true, result, ...(result?.plan === undefined ? {} : {plan: result.plan}),
              ...(result?.modules === undefined ? {} : {modules: result.modules})});
          }
        } catch (error) {
          if (!closed) {
            const diagnostic = errorData(error);
            reply(message, {ok: false, ...diagnostic, error: diagnostic});
          }
        }
        finally {pending.delete(message.id);}
      }
    } catch (error) {
      const diagnostic = errorData(error);
      for (const entry of pending.values()) reply(entry.message, {ok: false, ...diagnostic, error: diagnostic});
      pending.clear();queue.length = 0;
    } finally {draining = false;}
  }
  async function close() {
    if (closed) return;closed = true;scope.removeEventListener('message', receive);
    for (const entry of pending.values()) entry.controller.abort();
    pending.clear();queue.length = 0;records.clear();
    const owned = session ?? await opening;session = undefined;owned.close();
  }
  function receive(event) {
    const message = event.data ?? {};
    if (message.type === 'cancel') {
      const entry = pending.get(message.id);
      if (message.version === compilerWorkerVersion) entry?.controller.abort();
      scope.postMessage({version: compilerWorkerVersion, type: 'cancel', id: message.id, accepted: Boolean(entry)});return;
    }
    if (message.type === 'shutdown') {
      if (message.version !== compilerWorkerVersion) {
        reply(message, {ok: false, error: errorData(transportError('version-mismatch', 'compiler worker protocol version 1 required'))});return;
      }
      close().then(() => reply(message, {ok: true}), error => reply(message, {ok: false, error: errorData(error)}));return;
    }
    if (closed) {reply(message, {ok: false, error: errorData(transportError('closed', 'compiler worker is closed'))});return;}
    if (!Number.isSafeInteger(message.id) || message.id <= lastID || !['request', 'source'].includes(message.type ?? 'request')) {
      reply(message, {ok: false, error: errorData(transportError('invalid-message', 'compiler request ids must increase without reuse'))});return;
    }
    lastID = message.id;
    const entry = {message: {...message, type: message.type ?? 'request'}, controller: new AbortController()};
    pending.set(message.id, entry);queue.push(entry);
    setTimeout(() => {void drain();}, 0);
  }
  scope.addEventListener('message', receive);
  try {session = await opening;if (!closed) scope.postMessage({ready: true, version: compilerWorkerVersion, host: session.host});}
  catch (error) {scope.removeEventListener('message', receive);closed = true;throw error;}
  return Object.freeze({close});
}

// Cancellation fences responses immediately. A synchronous in-flight compiler
// cannot read another Worker message until it returns; no preemption is claimed.
export function createCompilerWorkerClient(worker, {ownsWorker = false} = {}) {
  if (!worker || typeof worker.postMessage !== 'function' || typeof worker.addEventListener !== 'function') {
    throw new TypeError('compiler client requires a Worker');
  }
  const pending = new Map(), records = new Map(), posted = new Map();
  let counter = 0, closed = false, closing, terminated = false, terminationResult, terminalError;
  const detach = () => {worker.removeEventListener('message', receive);worker.removeEventListener('error', failed);worker.removeEventListener('messageerror', failed);};
  function terminateOwned() {
    if (ownsWorker && !terminated) {terminated = true;terminationResult = worker.terminate();}
    return terminationResult;
  }
  function sameReply(message, request) {
    return message.version === compilerWorkerVersion && message.requestIdentity === request.requestIdentity &&
      message.sourceIdentity === request.sourceIdentity && message.revision === request.revision;
  }
  function rejectPending(error) {
    for (const entry of pending.values()) {entry.removeAbort?.();entry.reject(error);}
    pending.clear();
  }
  function failed(event) {
    terminalError = event.error ?? transportError('worker-failed', event.message ?? 'compiler worker transport failed');
    closed = true;records.clear();posted.clear();rejectPending(terminalError);detach();terminateOwned();
  }
  function receive(event) {
    const message = event.data ?? {};if (message.type !== 'result') return;
    // Cancellation rejects the caller immediately but cannot interrupt a
    // synchronous compiler. Keep actual posted work until its matching result
    // arrives; cancel acknowledgements and foreign replies are not completion.
    const work = posted.get(message.id);
    if (work && sameReply(message, work)) posted.delete(message.id);
    const entry = pending.get(message.id);if (!entry) return;
    pending.delete(message.id);entry.removeAbort?.();
    if (!sameReply(message, entry.message)) {
      entry.reject(transportError('stale-response', 'compiler response belongs to a different request or source'));return;
    }
    if (entry.key !== null) {
      const current = records.get(entry.key);
      if (!current || current.revision !== message.revision || current.sourceIdentity !== message.sourceIdentity) {
        entry.reject(transportError('stale-response', 'compiler response is older than the current source'));return;
      }
    }
    if (message.ok) entry.resolve(entry.message.type === 'request'
      ? Object.freeze({...metadata(message), host: message.host, result: message.result}) : message.result);
    else {
      try {entry.reject(fromErrorData(message.error ?? message));}
      catch (error) {entry.reject(error);}
    }
  }
  worker.addEventListener('message', receive);worker.addEventListener('error', failed);worker.addEventListener('messageerror', failed);
  function send(message, key, signal) {
    if (terminalError !== undefined) throw terminalError;
    if (closed && message.type !== 'shutdown') throw transportError('closed', 'compiler worker client is closed');
    if (counter >= Number.MAX_SAFE_INTEGER) throw transportError('request-id-exhausted', 'compiler request id space exhausted');
    message.id = ++counter;
    return new Promise((resolve, reject) => {
      const entry = {message, key, resolve, reject};pending.set(message.id, entry);
      const abort = () => {
        if (!pending.delete(message.id)) return;entry.removeAbort?.();reject(abortError(signal));
        if (posted.has(message.id)) {
          try {worker.postMessage({version: compilerWorkerVersion, type: 'cancel', id: message.id});} catch {}
        }
      };
      if (signal !== undefined) {
        if (!signal || typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean') {
          pending.delete(message.id);reject(new TypeError('compiler request requires an AbortSignal'));return;
        }
        signal.addEventListener('abort', abort, {once: true});entry.removeAbort = () => signal.removeEventListener('abort', abort);
        if (signal.aborted) {abort();return;}
      }
      try {
        if (terminalError !== undefined) throw terminalError;
        if (closed && message.type !== 'shutdown') throw transportError('closed', 'compiler worker client is closed');
        if (message.type === 'request' || message.type === 'source') posted.set(message.id, {
          version: message.version, requestIdentity: message.requestIdentity,
          sourceIdentity: message.sourceIdentity, revision: message.revision,
        });
        worker.postMessage(message);
      }
      catch (error) {posted.delete(message.id);pending.delete(message.id);entry.removeAbort?.();reject(error);}
    });
  }
  async function envelope(payload, kind, selectedRevision) {
    const request = encode(payload), parsed = decode(request);
    return {version: compilerWorkerVersion, type: kind, request, revision: selectedRevision,
      requestIdentity: await compilerRequestIdentity(request), sourceIdentity: await compilerSourceIdentity(parsed)};
  }
  return Object.freeze({
    async setSource(snapshot, {revision: nextRevision, signal} = {}) {
      if (closed) throw transportError('closed', 'compiler worker client is closed');
      const message = await envelope(snapshot, 'source', revision(nextRevision)), key = sourceKey(decode(message.request));
      if (closed) throw transportError('closed', 'compiler worker client is closed');
      if (key === null) throw transportError('invalid-source', 'source update requires source text or project modules');
      const previous = records.get(key), next = {revision: message.revision, sourceIdentity: message.sourceIdentity};
      if (previous && (next.revision < previous.revision || next.revision === previous.revision && next.sourceIdentity !== previous.sourceIdentity)) {
        throw transportError('stale-source', 'source update belongs to an older revision');
      }
      records.set(key, next);
      try {return await send(message, key, signal);}
      catch (error) {if (!closed && records.get(key) === next) {if (previous) records.set(key, previous);else records.delete(key);}throw error;}
    },
    async request(payload, {signal, expectedRevision, expectedSourceIdentity} = {}) {
      if (closed) throw transportError('closed', 'compiler worker client is closed');
      const text = encode(payload), parsed = decode(text), key = sourceKey(parsed), current = key === null ? null : records.get(key);
      if (key !== null && !current) throw transportError('stale-source', 'register the source snapshot before requesting compilation or queries');
      const message = await envelope(text, 'request', current?.revision);
      if (closed) throw transportError('closed', 'compiler worker client is closed');
      if (key !== null && records.get(key) !== current) throw transportError('stale-source', 'source changed before compiler request dispatch');
      if (current && (message.sourceIdentity !== current.sourceIdentity || expectedRevision !== undefined && revision(expectedRevision) !== current.revision ||
          expectedSourceIdentity !== undefined && expectedSourceIdentity !== current.sourceIdentity)) {
        throw transportError('stale-source', 'edit or request belongs to an older source snapshot');
      }
      message.expectedRevision = expectedRevision;message.expectedSourceIdentity = expectedSourceIdentity;
      return send(message, key, signal);
    },
    close() {
      if (closing) return closing;if (closed) return Promise.resolve();closed = true;
      const busy = posted.size !== 0;
      rejectPending(transportError('closed', 'compiler worker client is closed'));records.clear();
      if (ownsWorker && busy) {
        // This Worker may be unable to process shutdown at all. Its owner can
        // reclaim the isolated process without waiting for the event loop.
        posted.clear();detach();
        let complete, fail;
        closing = new Promise((resolve, reject) => {complete = resolve;fail = reject;});
        try {Promise.resolve(terminateOwned()).then(complete,fail);} catch (error) {fail(error);}
        return closing;
      }
      closing = Promise.resolve().then(() => send({version: compilerWorkerVersion, type: 'shutdown'}, null))
        .finally(() => {posted.clear();detach();return terminateOwned();});
      return closing;
    },
  });
}
