import {createCompilerSession, encodeCompilerIR,decodeCompilerSourceAsset} from './compiler-session.mjs';
import {installCompilerWorker, createCompilerWorkerClient, compilerSourceIdentity} from './compiler-worker.mjs';

function abort(signal) {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  else if (signal.aborted) {
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error('browser compiler request aborted');error.name = 'AbortError';throw error;
  }
}
function stale(message) {const error = new Error(message);error.code = 'stale-source';return error;}
function relativeURL(path, base, label) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split('/').includes('..')) {
    throw new TypeError(label + ' must be a relative artifact path');
  }
  return new URL(path, base);
}
const artifactResources = new WeakMap();
function resourceIdentity(manifest, path) {
  if (!Object.hasOwn(manifest, 'artifactIdentity')) return undefined;
  let files = artifactResources.get(manifest);
  if (!files) {
    const identity = manifest.artifactIdentity;
    if (identity?.algorithm !== 'sha256' || !Array.isArray(identity.files)) {
      throw new TypeError('invalid compiler artifact resource identities');
    }
    files = new Map();
    for (const record of identity.files) {
      if (typeof record?.path !== 'string' || !record.path || files.has(record.path) ||
          !Number.isSafeInteger(record.bytes) || record.bytes < 0 ||
          typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) {
        throw new TypeError('invalid or repeated compiler artifact resource identity');
      }
      files.set(record.path, {bytes: record.bytes, sha256: record.sha256});
    }
    artifactResources.set(manifest, files);
  }
  const expected = files.get(path);
  if (!expected) throw new TypeError('compiler resource has no artifact identity: ' + path);
  return expected;
}
async function response(url, signal) {
  abort(signal);
  const result = await fetch(url, {signal});
  if (!result.ok) {
    const error = new Error(`compiler resource request failed: ${result.status} ${result.statusText}`);
    error.status = result.status;error.url = result.url || String(url);throw error;
  }
  abort(signal);return result;
}
async function resourceBytes(url, signal, identity) {
  const resource = await response(url, signal);
  const bytes = new Uint8Array(await resource.arrayBuffer());
  abort(signal);
  if (identity) {
    if (bytes.byteLength !== identity.bytes) throw new Error('compiler resource byte count mismatch: ' + url);
    if (!globalThis.crypto?.subtle) throw new Error('compiler resource SHA-256 verification is unavailable');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    abort(signal);
    const actual = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== identity.sha256) throw new Error('compiler resource SHA-256 mismatch: ' + url);
  }
  return bytes;
}
async function sourceText(url, signal, identity, encoding) {
  const bytes = await resourceBytes(url, signal, identity);
  // Source offsets and identities refer to the original input, including its
  // BOM. Fetch's text decoder strips it and replaces malformed UTF-8.
  return decodeCompilerSourceAsset(bytes, encoding);
}
async function sessionConfiguration({host, manifestURL, options = {}, signal}) {
  if (!['javascript', 'wasm'].includes(host)) throw new TypeError('browser compiler host must be javascript or wasm');
  if (!manifestURL) throw new TypeError('browser compiler requires an explicit artifact manifest URL');
  const resolved = new URL(manifestURL, globalThis.location?.href ?? import.meta.url);
  const fetched = await response(resolved, signal), manifest = await fetched.json();abort(signal);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.host !== host ||
      manifest.target !== undefined && manifest.target !== host) {
    throw new TypeError('compiler manifest does not match the requested browser host');
  }
  const base = new URL('./', fetched.url || resolved.href);
  const artifactURL = relativeURL(manifest.path, base, 'compiler path');
  const configuration = {host, memory: manifest.memory ?? {}, options: {...manifest.budget, auto: manifest.auto ?? 65536, ...options}};
  if (options?.debug === undefined && manifest.debugPath !== undefined && manifest.debugPath !== null) {
    const debugURL = relativeURL(manifest.debugPath, base, 'compiler debug path');
    const bytes = await resourceBytes(debugURL, signal, resourceIdentity(manifest, manifest.debugPath));
    configuration.options.debug = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    abort(signal);
  }
  if (host === 'javascript') {
    if (!/\.(?:mjs|js)$/.test(artifactURL.pathname)) throw new TypeError('JavaScript compiler manifest must name a module');
    configuration.compiler = await import(/* @vite-ignore */ artifactURL.href);abort(signal);
  } else {
    configuration.bytes = await resourceBytes(artifactURL, signal, resourceIdentity(manifest, manifest.path));
    abort(signal);
  }
  return {configuration, manifest, manifestURL: fetched.url || resolved.href};
}

// This entry may be called by a deployment's own module Worker as well as the
// owned Worker below. No native module is imported by the browser loader.
export async function installBrowserCompilerWorker(scope, options) {
  const {configuration} = await sessionConfiguration(options);
  return installCompilerWorker(scope, configuration);
}
function keyFor(payload) {
  if (Array.isArray(payload.modules)) return (payload.operation==='project-ir'?'project-ir:':'project:') + payload.entry;
  if (typeof payload.ir === 'string') return 'ir:' + (payload.filename ?? '<input>');
  if (typeof payload.source === 'string') return 'source:' + (payload.filename ?? '<input>');
  return null;
}
function snapshotPayload(payload){
  const text=typeof payload==='string'?payload:JSON.stringify(payload);
  if(typeof text!=='string')throw new TypeError('compiler request requires a JSON object');
  const value=JSON.parse(text);
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new TypeError('compiler request requires a JSON object');
  return value;
}

export async function createBrowserCompiler({
  host = 'javascript', manifestURL, workerClient, ownsWorkerClient = false,
  worker = true, signal, options = {}, runtimeURL, runtimeSource,
} = {}) {
  if (!['javascript', 'wasm'].includes(host)) throw new TypeError('browser compiler host must be javascript or wasm');
  abort(signal);
  let session, client = workerClient, ownsClient = ownsWorkerClient, ownedWorker, blobURL, closed = false, removeLoadingAbort;
  const snapshots = new Map();let sourceRevision = 0, artifactManifest, artifactManifestURL;
  let runtimeReady = false, runtimeLoading, literalSourcesLoading;
  async function dispose() {
    if (closed) return;closed = true;snapshots.clear();
    let failed = false, failure;
    try {if (client && ownsClient) await client.close();else session?.close();}
    catch (error) {failed = true;failure = error;}
    finally {ownedWorker?.terminate();if (blobURL) URL.revokeObjectURL(blobURL);}
    client = undefined;session = undefined;ownedWorker = undefined;blobURL = undefined;
    if (failed) throw failure;
  }
  function active() {if (closed) throw new Error('browser compiler is disposed');}
  try {
    if (!client && worker) {
      if (typeof Worker !== 'function') throw new Error('module Workers are unavailable; select worker:false explicitly to use the same artifact on this thread');
      if (!manifestURL) throw new TypeError('browser compiler requires an explicit artifact manifest URL');
      const configuration = {host, manifestURL: new URL(manifestURL, globalThis.location?.href ?? import.meta.url).href, options};
      const entry = `const waiting=[],loading=new AbortController();const hold=event=>{if(event.data?.type==='abort-browser-compiler-loading')loading.abort();else waiting.push(event.data);};self.addEventListener('message',hold);\n` +
        `const{installBrowserCompilerWorker}=await import(${JSON.stringify(import.meta.url)});\n` +
        `await installBrowserCompilerWorker(self,{...${JSON.stringify(configuration)},signal:loading.signal});\n` +
        `self.removeEventListener('message',hold);for(const data of waiting)self.dispatchEvent(new MessageEvent('message',{data}));\n`;
      blobURL = URL.createObjectURL(new Blob([entry], {type: 'text/javascript'}));
      ownedWorker = new Worker(blobURL, {type: 'module'});
      if (signal) {
        const cancelLoading = () => {
          try {ownedWorker?.postMessage({type: 'abort-browser-compiler-loading'});} catch {}
        };
        signal.addEventListener('abort', cancelLoading, {once: true});
        removeLoadingAbort = () => signal.removeEventListener('abort', cancelLoading);
        if (signal.aborted) cancelLoading();
      }
      client = createCompilerWorkerClient(ownedWorker, {ownsWorker: true});ownsClient = true;
    } else if (!client) {
      const loaded = await sessionConfiguration({host, manifestURL, options, signal});
      artifactManifest = loaded.manifest;artifactManifestURL = loaded.manifestURL;
      session = await createCompilerSession(loaded.configuration);abort(signal);
    }
    if (client) {
      if (typeof client.request !== 'function' || typeof client.setSource !== 'function' || typeof client.close !== 'function') {
        throw new TypeError('browser compiler requires a compiler Worker client');
      }
      const capabilities = await client.request({operation: 'capabilities'}, {signal});
      if (capabilities?.host !== host) throw new TypeError('compiler Worker is executing a different host artifact');
      abort(signal);
    }
  } catch (error) {try {await dispose();} catch {}throw error;}
  finally {removeLoadingAbort?.();removeLoadingAbort = undefined;}

  async function dispatch(payload, requestOptions) {
    active();abort(requestOptions?.signal);
    if (!client) return session.request(payload, requestOptions);
    const reply = await client.request(payload, requestOptions);active();
    if (reply.host !== host) throw new TypeError('compiler Worker changed its host artifact');
    return reply.result;
  }

  async function runtimeRequest(payload, requestOptions = {}) {
    if (Object.hasOwn(payload, 'literalSources')) return payload;
    active();abort(requestOptions.signal);
    if (!artifactManifest && manifestURL) {
      const resolved = new URL(manifestURL, globalThis.location?.href ?? import.meta.url);
      const fetched = await response(resolved, requestOptions.signal);
      const manifest = await fetched.json();active();abort(requestOptions.signal);
      if (!manifest || manifest.host !== host) throw new TypeError('compiler runtime manifest host mismatch');
      artifactManifest = manifest;artifactManifestURL = fetched.url || resolved.href;
    }
    if (artifactManifest?.literalSources === undefined) return payload;
    if (!literalSourcesLoading) literalSourcesLoading = (async () => {
      if (!Array.isArray(artifactManifest.literalSources)) throw new TypeError('compiler literalSources must be an array');
      return Promise.all(artifactManifest.literalSources.map(async item => {
        if (typeof item?.id !== 'string' || typeof item.filename !== 'string') throw new TypeError('invalid compiler literal source asset');
        const url = relativeURL(item.path, new URL('./', artifactManifestURL), 'compiler literal source path');
        const source = await sourceText(url, requestOptions.signal, resourceIdentity(artifactManifest, item.path), item.encoding);active();abort(requestOptions.signal);
        return {id: item.id, filename: item.filename, source};
      }));
    })().catch(error => {literalSourcesLoading = undefined;throw error;});
    const literalSources = await literalSourcesLoading;active();abort(requestOptions.signal);
    return {...payload, literalSources};
  }

  async function loadRuntime(requestOptions = {}) {
    active();abort(requestOptions.signal);
    if (runtimeReady) return;
    if (!runtimeLoading) {
      runtimeLoading = (async () => {
        let source = runtimeSource;
        if (source !== undefined && typeof source !== 'string') throw new TypeError('compiler runtime source must be a string');
        if (source === undefined) {
          let url, identity, encoding;
          if (runtimeURL !== undefined) url = new URL(runtimeURL, globalThis.location?.href ?? import.meta.url);
          else {
            if (!artifactManifest) {
              if (!manifestURL) throw new TypeError('binary output requires the compiler runtime source or an artifact manifest');
              const resolved = new URL(manifestURL, globalThis.location?.href ?? import.meta.url);
              const fetched = await response(resolved, requestOptions.signal);
              const manifest = await fetched.json();abort(requestOptions.signal);
              if (!manifest || manifest.host !== host) throw new TypeError('compiler runtime manifest host mismatch');
              artifactManifest = manifest;artifactManifestURL = fetched.url || resolved.href;
            }
            url = relativeURL(artifactManifest.runtimePath, new URL('./', artifactManifestURL), 'compiler runtime path');
            identity = resourceIdentity(artifactManifest, artifactManifest.runtimePath);
            encoding = artifactManifest.runtimeEncoding;
          }
          source = await sourceText(url, requestOptions.signal, identity, encoding);
        }
        active();abort(requestOptions.signal);
        // A caller can install an explicit runtime while the default asset is
        // downloading. Keep that completed source revision as the owner.
        if (runtimeReady) return;
        const request = await runtimeRequest({operation: 'runtime', source, filename: 'bootstrap/runtime/memory.eli'}, requestOptions);
        active();abort(requestOptions.signal);
        if (runtimeReady) return;
        if (client) await setSource(request, {signal: requestOptions.signal});
        active();abort(requestOptions.signal);
        if (runtimeReady) return;
        await dispatch(request, {signal: requestOptions.signal});
        runtimeReady = true;
      })();
    }
    const pending = runtimeLoading;
    try {await pending;active();abort(requestOptions.signal);}
    finally {if (runtimeLoading === pending) runtimeLoading = undefined;}
  }

  async function setSource(payload, {revision, signal: requestSignal} = {}) {
    active();abort(requestSignal);
    payload=snapshotPayload(payload);
    const key = keyFor(payload);if (key === null) throw new TypeError('source snapshot requires source text or project modules');
    const sourceIdentity = await compilerSourceIdentity(payload);active();abort(requestSignal);
    const previous = snapshots.get(key);
    const nextRevision = revision ?? (previous?.sourceIdentity === sourceIdentity ? previous.revision : sourceRevision + 1);
    if (!Number.isSafeInteger(nextRevision) || nextRevision < 0 || previous &&
        (nextRevision < previous.revision || nextRevision === previous.revision && previous.sourceIdentity !== sourceIdentity)) {
      throw stale('source snapshot belongs to an older revision');
    }
    const next = {revision: nextRevision, sourceIdentity};sourceRevision = Math.max(sourceRevision, nextRevision);
    snapshots.set(key, next);
    try {
      if (client) await client.setSource(payload, {revision: nextRevision, signal: requestSignal});
      active();abort(requestSignal);return {...next};
    } catch (error) {
      if (!closed && snapshots.get(key) === next) {if (previous) snapshots.set(key, previous);else snapshots.delete(key);}
      throw error;
    }
  }
  async function request(payload, requestOptions = {}) {
    active();abort(requestOptions.signal);
    payload=snapshotPayload(payload);
    if (payload.operation === 'runtime') payload = await runtimeRequest(payload, requestOptions);
    if (['project','project-ir','emit-ir'].includes(payload.operation) && (payload.target === 'wasm' || payload.target === 'native')) {
      await loadRuntime(requestOptions);
    }
    const key = keyFor(payload), readOnly = ['analyze', 'query', 'edit-preview'].includes(payload.operation);let selectedSnapshot;
    if (key !== null) {
      const sourceIdentity = await compilerSourceIdentity(payload);active();abort(requestOptions.signal);
      const current = snapshots.get(key);
      if (!current || current.sourceIdentity !== sourceIdentity) {
        if (readOnly || requestOptions.expectedSourceIdentity !== undefined || requestOptions.expectedRevision !== undefined) {
          throw stale('register the current source snapshot before requesting queries or applying older results');
        }
        await setSource(payload, {signal: requestOptions.signal});
      }
      const selected = snapshots.get(key);
      selectedSnapshot=selected;
      if (requestOptions.expectedSourceIdentity !== undefined && requestOptions.expectedSourceIdentity !== selected.sourceIdentity ||
          requestOptions.expectedRevision !== undefined && requestOptions.expectedRevision !== selected.revision) {
        throw stale('request belongs to an older source snapshot');
      }
    }
    active();
    const result = await dispatch(payload, requestOptions);
    active();abort(requestOptions.signal);
    if(key!==null){const current=snapshots.get(key);if(!current||current.revision!==selectedSnapshot.revision||current.sourceIdentity!==selectedSnapshot.sourceIdentity)throw stale('compiler response belongs to an older source snapshot');}
    if (payload.operation === 'runtime') runtimeReady = true;
    return result;
  }
  return Object.freeze({
    host,
    request,
    setSource,
    loadRuntime,
    async compile_string(source, filename = '<input>', macroContext = null, requestOptions = {}) {
      return (await request({operation: 'compile', source, filename, macroContext}, requestOptions)).javascript;
    },
    async compile_string_with_source_map(source, filename = '<input>', generatedFile = 'output.mjs', sourceName = filename, macroContext = null, requestOptions = {}) {
      const result = await request({operation: 'compile', source, filename, macroContext, sourceMap: {generatedFile, sourceName}}, requestOptions);
      return {javascript: result.javascript, sourceMap: result.sourceMap};
    },
    async compile_ir_string(source, filename = '<input>', macroContext = null, requestOptions = {}) {
      const result = await request({operation: 'compile-ir', source, filename, macroContext}, requestOptions);
      return JSON.parse(result.ir);
    },
    async serialize_ir_program(program, requestOptions = {}) {
      return (await request({operation: 'serialize-ir', ir: encodeCompilerIR(program)}, requestOptions)).canonicalIR;
    },
    async deserialize_ir_program(canonicalIR, requestOptions = {}) {
      return JSON.parse((await request({operation: 'deserialize-ir', canonicalIR}, requestOptions)).ir);
    },
    async emit_ir_string(program, requestOptions = {}) {
      return (await request({operation: 'emit-ir', ir: encodeCompilerIR(program)}, requestOptions)).javascript;
    },
    async emit_ir_string_with_source_map(program, source, generatedFile = 'output.mjs', sourceName = program.filename, requestOptions = {}) {
      return request({operation: 'emit-ir', ir: encodeCompilerIR(program), source,
        sourceMap: {generatedFile, sourceName}}, requestOptions);
    },
    async compile_portable_ir_string(source, entries, filename = '<input>', macroContext = null, requestOptions = {}) {
      const result = await request({operation: 'compile-ir', source, filename, macroContext, portableEntries: entries}, requestOptions);
      return JSON.parse(result.ir);
    },
    async compile_project_portable_ir_string(source, entries, filename = '<input>', macroContext = null, requestOptions = {}) {
      const result = await request({operation: 'compile-ir', source, filename, macroContext,
        portableEntries: entries, allowProjectImports: true}, requestOptions);
      return JSON.parse(result.ir);
    },
    async compile_portable_string(source, entries, filename = '<input>', macroContext = null, requestOptions = {}) {
      return (await request({operation: 'compile', source, filename, macroContext, portableEntries: entries}, requestOptions)).javascript;
    },
    async compile_portable_string_with_source_map(source, entries, filename = '<input>', generatedFile = 'output.mjs', sourceName = filename, macroContext = null, requestOptions = {}) {
      const result = await request({operation: 'compile', source, filename, macroContext, portableEntries: entries,
        sourceMap: {generatedFile, sourceName}}, requestOptions);
      return {javascript: result.javascript, sourceMap: result.sourceMap};
    },
    async format_source(source, filename = '<input>', formatOptions = null, requestOptions = {}) {
      return (await request({operation: 'format', source, filename, options: formatOptions}, requestOptions)).source;
    },
    compile_project(project, requestOptions = {}) {return request({...project, operation: 'project'}, requestOptions);},
    project_plan(project, requestOptions = {}) {return request({...project, operation: 'project-plan'}, requestOptions);},
    protocol(name, input, requestOptions = {}) {return request({operation: 'protocol', name, input}, requestOptions);},
    analyze(input, requestOptions = {}) {return request({...input, operation: 'analyze'}, requestOptions);},
    query(input, requestOptions = {}) {return request({...input, operation: 'query'}, requestOptions);},
    dispose,
    close: dispose,
  });
}
