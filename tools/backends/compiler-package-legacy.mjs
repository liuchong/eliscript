#!/usr/bin/env node
import {copyFile, mkdir, open, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {resolve, dirname, isAbsolute, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {parseArgs} from 'node:util';
import {root} from './build.mjs';
import {writeCompilerMetadata} from './compiler-build.mjs';
import {readCompilerMetadata} from './compiler-metadata.mjs';

const packageLoader = String.raw`import {createCompilerSession} from './transport/backends/compiler-session.mjs';
import {createCompilerMetadataDecoder} from './transport/backends/compiler-metadata.mjs';
import {createCompilerSha256} from './transport/backends/compiler-sha256.mjs';
import {ownCompilerDebugDocument} from './transport/backends/compiler-debug.mjs';

function checkIdentity(identity, label) {
  if (!identity || !Number.isSafeInteger(identity.bytes) || identity.bytes < 0 ||
      typeof identity.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(identity.sha256)) {
    throw new TypeError('compiler package has an invalid file identity: ' + label);
  }
  return identity;
}
function relativeResource(path, base) {
  if (typeof path !== 'string' || !path || /[\\%?#\u0000]/.test(path) ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') ||
      path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new TypeError('compiler package resource must have a relative path');
  }
  const url = new URL(path, base), directory = new URL('.', base);
  if (url.protocol !== directory.protocol || url.origin !== directory.origin ||
      !url.href.startsWith(directory.href)) throw new TypeError('compiler package resource escapes its directory');
  return url;
}
async function resourceHash() {
  if (typeof process !== 'undefined' && (process.versions?.node || process.versions?.bun)) {
    const {createHash} = await import('node:crypto');
    const hash = createHash('sha256');
    return {update: bytes => hash.update(bytes), digestHex: () => hash.digest('hex')};
  }
  return createCompilerSha256();
}
async function sha256(bytes) {
  const hash = await resourceHash();hash.update(bytes);return hash.digestHex();
}
// The consumer owns only its bounded chunk or final decoded value. Successful
// native verification must not leave a complete, otherwise unused image in a
// package cache beside the platform loader's image.
async function streamResource(url, fetchResource, consume, finish) {
  if (url.protocol === 'file:') {
    const {open} = await import('node:fs/promises');
    const file = await open(url, 'r');let failed = false;
    try {
      const buffer = new Uint8Array(65536);
      for (;;) {
        const {bytesRead} = await file.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        consume(buffer.subarray(0, bytesRead));
      }
      return finish();
    } catch (error) {failed = true;throw error;}
    finally {try {await file.close();} catch (error) {if (!failed) throw error;}}
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('unsupported compiler package resource protocol');
  if (typeof fetchResource !== 'function') throw new TypeError('compiler package requires fetch');
  const response = await fetchResource(url);
  if (!response.ok) throw new Error('compiler resource failed: ' + response.status);
  // Preserve legacy fetch adapters; actual streaming responses never enter
  // this full-buffer fallback.
  if (response.body == null) {consume(new Uint8Array(await response.arrayBuffer()));return finish();}
  const reader = response.body.getReader();let failed = false;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      consume(part.value);
    }
    return finish();
  } catch (error) {
    failed = true;
    try {await reader.cancel(error);} catch {}
    throw error;
  } finally {try {reader.releaseLock();} catch (error) {if (!failed) throw error;}}
}
async function resourceVerifier(identity, url) {
  const hash = await resourceHash();let bytes = 0;
  return {
    consume(chunk) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('compiler package stream requires Uint8Array chunks');
      hash.update(chunk);bytes += chunk.byteLength;
      if (!Number.isSafeInteger(bytes)) throw new RangeError('compiler package resource byte count exceeds safe integer range');
    },
    finish() {
      const digest = hash.digestHex();
      if (identity !== undefined) {
        checkIdentity(identity, url.href);
        if (bytes !== identity.bytes) throw new Error('compiler package resource byte count mismatch: ' + url.href);
        if (digest !== identity.sha256) throw new Error('compiler package resource SHA-256 mismatch: ' + url.href);
      }
    },
  };
}
async function verifyResource(url, fetchResource, identity) {
  const verifier = await resourceVerifier(identity, url);
  await streamResource(url, fetchResource, chunk => verifier.consume(chunk), () => verifier.finish());
}
async function readSourceResource(url, fetchResource, identity, resources, formats, encoding = 'utf8') {
  const key = 'source:' + url.href;
  let pending = resources.get(key);
  if (!pending) {
    pending = (async () => {
      const verifier = await resourceVerifier(identity, url);
      const variants = new Map();
      let decoder, failed = false, failure;
      if (formats.has('utf8') || formats.has('json-utf16')) {
        try {decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});}
        catch (error) {failed = true;failure = error;}
      }
      for (const format of formats) {
        let variant;
        if (format === 'utf8') variant = {blocks: []};
        else if (format === 'json-utf16') {
          try {variant = {parser: createCompilerMetadataDecoder()};}
          catch (error) {variant = {failed: true, error};}
        } else variant = {failed: true, error: new TypeError('unsupported compiler source asset encoding')};
        variants.set(format, variant);
      }
      const text = value => {
        for (const variant of variants.values()) if (!variant.failed) {
          if (variant.blocks) variant.blocks.push(value);
          else try {variant.parser.write(value);} catch (error) {variant.failed = true;variant.error = error;variant.parser = undefined;}
        }
      };
      const consume = chunk => {
        verifier.consume(chunk);
        if (decoder && !failed) try {
          for (let offset = 0; offset < chunk.length; offset += 65536)
            text(decoder.decode(chunk.subarray(offset, offset + 65536), {stream: true}));
        } catch (error) {failed = true;failure = error;}
      };
      const finish = () => {
        // Hash/length failures retain priority over every decode failure.
        verifier.finish();
        if (decoder && !failed) try {text(decoder.decode());} catch (error) {failed = true;failure = error;}
        for (const [format, variant] of variants) {
          // An unsupported encoding failed before UTF8 decoding in the public
          // asset codec. Keep that order even for malformed bytes.
          if (failed && (format === 'utf8' || format === 'json-utf16')) {variant.failed = true;variant.error = failure;}
          if (!variant.failed) try {
            variant.value = format === 'utf8' ? variant.blocks.join('') : variant.parser.finish();
            if (typeof variant.value !== 'string') throw new TypeError('encoded compiler source asset must contain a JSON string');
          } catch (error) {variant.failed = true;variant.error = error;}
          variant.blocks = undefined;variant.parser = undefined;
        }
        return variants;
      };
      // A binary also declared as source still consumes its already verified
      // bytes once. Ordinary source assets never allocate a complete byte view.
      if (resources.has(url.href)) {
        const bytes = await readResource(url, fetchResource, identity, resources);
        consume(bytes);const result = finish();resources.delete(url.href);return result;
      }
      return streamResource(url, fetchResource, consume, finish);
    })();
    resources.set(key, pending);
  }
  let variants;
  try {variants = await pending;}
  catch (error) {if (resources.get(key) === pending) resources.delete(key);throw error;}
  const result = variants.get(encoding);
  if (!result) throw new TypeError('unsupported compiler source asset encoding');
  if (result.failed) throw result.error;
  return result.value;
}
async function readResource(url, fetchResource, identity, resources) {
  const key = url.href;
  let pending = resources.get(key);
  if (!pending) {
    pending = (async () => {
      let bytes;
      if (url.protocol === 'file:') {
        const {readFile} = await import('node:fs/promises');
        const data = await readFile(url);
        // This read owns its buffer; verification and consumption share the
        // exact view instead of copying an entire binary or metadata file.
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else {
        if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('unsupported compiler package resource protocol');
        if (typeof fetchResource !== 'function') throw new TypeError('compiler package requires fetch');
        const response = await fetchResource(url);
        if (!response.ok) throw new Error('compiler resource failed: ' + response.status);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      return {bytes, digest: undefined};
    })();
    resources.set(key, pending);
  }
  try {
    const resource = await pending;
    if (identity !== undefined) {
      checkIdentity(identity, key);
      if (resource.bytes.byteLength !== identity.bytes) throw new Error('compiler package resource byte count mismatch: ' + key);
      resource.digest ??= sha256(resource.bytes);
      if (await resource.digest !== identity.sha256) throw new Error('compiler package resource SHA-256 mismatch: ' + key);
    }
    return resource.bytes;
  } catch (error) {
    if (resources.get(key) === pending) resources.delete(key);
    throw error;
  }
}
async function readMetadataResource(url, fetchResource, identity, resources) {
  const key = 'metadata:' + url.href;
  let pending = resources.get(key);
  if (!pending) {
    pending = (async () => {
      const hash = await resourceHash(), utf8 = new TextDecoder('utf-8', {fatal: true});
      const parser = createCompilerMetadataDecoder();
      let bytes = 0, decodeFailed = false, decodeError;
      function consume(chunk) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('compiler package stream requires Uint8Array chunks');
        hash.update(chunk);bytes += chunk.byteLength;
        if (!Number.isSafeInteger(bytes)) throw new RangeError('compiler package resource byte count exceeds safe integer range');
        // Verify the complete original byte stream even after malformed JSON.
        // A corrupt resource must still report its identity failure first.
        if (!decodeFailed) try {
          for (let offset = 0; offset < chunk.length; offset += 65536) {
            parser.write(utf8.decode(chunk.subarray(offset, offset + 65536), {stream: true}));
          }
        } catch (error) {decodeFailed = true;decodeError = error;}
      }
      function finish() {
        const digest = hash.digestHex();
        if (identity !== undefined) {
          checkIdentity(identity, url.href);
          if (bytes !== identity.bytes) throw new Error('compiler package resource byte count mismatch: ' + url.href);
          if (digest !== identity.sha256) throw new Error('compiler package resource SHA-256 mismatch: ' + url.href);
        }
        if (decodeFailed) throw decodeError;
        parser.write(utf8.decode());
        return parser.finish();
      }
      return streamResource(url, fetchResource, consume, finish);
    })();
    resources.set(key, pending);
  }
  try {return await pending;}
  catch (error) {if (resources.get(key) === pending) resources.delete(key);throw error;}
}

export async function openCompilerPackage({manifestURL = new URL('./compiler-package.json', import.meta.url),
  manifestIdentity, fetch: fetchResource = globalThis.fetch, options, memory} = {}) {
  const url = new URL(manifestURL, import.meta.url), resources = new Map();
  // Without an externally pinned identity the package manifest is the trust
  // anchor, not a signature or proof of authenticity for the whole package.
  if (manifestIdentity !== undefined) checkIdentity(manifestIdentity, url.href);
  const manifest = await readMetadataResource(url, fetchResource, manifestIdentity, resources);
  if (manifest.format !== 'eliscript-compiler-package' || manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new TypeError('unsupported compiler package');
  }
  const declared = new Map();
  for (const record of manifest.files) {
    const resourceURL = relativeResource(record?.path, url), identity = checkIdentity(record, record.path);
    const previous = declared.get(resourceURL.href);
    if (previous && (previous.bytes !== identity.bytes || previous.sha256 !== identity.sha256)) {
      throw new TypeError('compiler package contains conflicting file identities: ' + record.path);
    }
    declared.set(resourceURL.href, Object.freeze({bytes: identity.bytes, sha256: identity.sha256}));
  }
  async function checkedResource(resourceURL) {
    const identity = declared.get(resourceURL.href);
    if (!identity) throw new Error('compiler package resource has no declared identity: ' + resourceURL.href);
    return readResource(resourceURL, fetchResource, identity, resources);
  }
  async function checkedMetadata(resourceURL) {
    const identity = declared.get(resourceURL.href);
    if (!identity) throw new Error('compiler package resource has no declared identity: ' + resourceURL.href);
    return readMetadataResource(resourceURL, fetchResource, identity, resources);
  }
  const artifactURL = relativeResource(manifest.artifact, url);
  const artifact = await checkedMetadata(artifactURL);
  const host = artifact.host;
  if (!['javascript', 'wasm', 'native'].includes(host) || host !== manifest.host) throw new TypeError('compiler package host mismatch');
  const binaryURL = relativeResource(artifact.path, artifactURL);
  const runtimeURL = relativeResource(artifact.runtimePath, artifactURL);
  const runtimeAsset = {url: runtimeURL, encoding: artifact.runtimeEncoding};
  const debugURL = artifact.debugPath ? relativeResource(artifact.debugPath, artifactURL) : undefined;
  if (artifact.literalSources !== undefined && !Array.isArray(artifact.literalSources)) throw new TypeError('compiler literalSources must be an array');
  const literalAssets = (artifact.literalSources ?? []).map(item => {
    if (typeof item?.id !== 'string' || typeof item.filename !== 'string') throw new TypeError('invalid compiler literal source asset');
    return {...item, url: relativeResource(item.path, artifactURL)};
  });
  // Plan all declared source interpretations before the first lazy read. If
  // aliases use both encodings, decode both from one verified stream; cache
  // only the required final strings, never an extra encoded byte image.
  const sourceFormats = new Map();
  for (const item of [runtimeAsset, ...literalAssets]) {
    let formats = sourceFormats.get(item.url.href);
    if (!formats) sourceFormats.set(item.url.href, formats = new Set());
    formats.add(item.encoding === undefined ? 'utf8' : item.encoding);
  }
  async function checkedSource(item) {
    const identity = declared.get(item.url.href);
    if (!identity) throw new Error('compiler package resource has no declared identity: ' + item.url.href);
    return readSourceResource(item.url, fetchResource, identity, resources, sourceFormats.get(item.url.href), item.encoding);
  }
  // Metadata references must be present even when a resource is loaded lazily.
  for (const resourceURL of [binaryURL, runtimeURL, ...(debugURL ? [debugURL] : []), ...literalAssets.map(item => item.url)]) {
    if (!declared.has(resourceURL.href)) throw new Error('compiler package metadata references an undeclared file: ' + resourceURL.href);
  }
  const config = {host, options: {...artifact.budget, auto: artifact.auto, nativeTarget: artifact.nativeTarget, ...options}, memory: {...artifact.memory, ...memory}};
  if (options?.debug === undefined && debugURL) config.options.debug = ownCompilerDebugDocument(await checkedMetadata(debugURL));
  if (host === 'javascript') {
    // Native ESM import owns its entry/dependency reads. Fetching them here
    // cannot bind the later import to those bytes and would download them twice.
    // These imports, including this loader's static transport import above,
    // are deliberately not reported as verified resource consumption.
    config.compiler = await import(binaryURL.href);
  } else if (host === 'wasm') config.bytes = await checkedResource(binaryURL);
  else {
    const operatingSystem = artifact.nativeTarget === 'arm64-linux' ? 'linux' : artifact.nativeTarget === 'arm64-macos' ? 'darwin' : null;
    if (operatingSystem === null || artifactURL.protocol !== 'file:' ||
        typeof process === 'undefined' || process.platform !== operatingSystem || process.arch !== 'arm64' ||
        !(process.versions?.bun || process.versions?.node)) throw new Error('native compiler package requires Node or Bun on its declared arm64 platform');
    await verifyResource(binaryURL, fetchResource, declared.get(binaryURL.href));
    const {fileURLToPath} = await import('node:url');
    // The platform loader subsequently opens this verified path itself; it
    // does not consume a JavaScript implementation or a WASM substitute.
    config.path = fileURLToPath(binaryURL);
    config.descriptor = {typed: artifact.typed, descriptor: artifact.descriptor};
  }
  const session = await createCompilerSession(config);
  // Instantiation has consumed the WASM image. Only an unusual source alias
  // still needs that exact byte view; its source decoder releases it later.
  config.bytes = undefined;
  if (!sourceFormats.has(binaryURL.href)) resources.delete(binaryURL.href);
  let runtimeReady = false, runtimeLoading, literalSourcesLoading, closed = false, closeResult, closeFailed = false, closeError;
  function active() {
    if (closed) {
      const error = new Error('compiler package is closed');error.code = 'closed';throw error;
    }
  }
  async function runtimeRequest(record) {
    if (Object.hasOwn(record, 'literalSources') || artifact.literalSources === undefined) return record;
    if (!literalSourcesLoading) literalSourcesLoading = Promise.all(literalAssets.map(async item => ({
      id: item.id, filename: item.filename, source: await checkedSource(item),
    }))).catch(error => {literalSourcesLoading = undefined;throw error;});
    const literalSources = await literalSourcesLoading;active();
    return {...record, literalSources};
  }
  async function loadRuntime(requestOptions) {
    active();
    if (runtimeReady) return;
    if (!runtimeLoading) runtimeLoading = (async () => {
      const source = await checkedSource(runtimeAsset);
      active();
      // An explicit runtime request may have completed while the package
      // resource was downloading. Do not overwrite its successful state.
      if (runtimeReady) return;
      const request = await runtimeRequest({operation: 'runtime', source, filename: 'bootstrap/runtime/memory.eli'});
      active();
      if (runtimeReady) return;
      await session.request(request, requestOptions);
      active();runtimeReady = true;
    })();
    const pending = runtimeLoading;
    try {await pending;active();}
    finally {if (runtimeLoading === pending) runtimeLoading = undefined;}
  }
  function close() {
    if (closed) {
      if (closeFailed) throw closeError;
      return closeResult;
    }
    closed = true;runtimeReady = false;literalSourcesLoading = undefined;resources.clear();
    try {closeResult = session.close();return closeResult;}
    catch (error) {closeFailed = true;closeError = error;throw error;}
  }
  return Object.freeze({
    host, manifest, artifact,
    integrity: Object.freeze({manifest: manifestIdentity === undefined ? 'package-trust-anchor' : 'pinned-sha256-and-bytes',
      controlledResources: 'sha256-and-bytes-before-consumption',
      javascriptImports: 'native-esm-loader-not-intercepted',
      nativeLibrary: host === 'native' ? 'file-verified-before-platform-loader' : null}),
    async request(request, requestOptions) {
      active();
      const record = typeof request === 'string' ? JSON.parse(request) : request;
      if (['project','project-ir','emit-ir'].includes(record?.operation) && (record.target === 'wasm' || record.target === 'native')) await loadRuntime(requestOptions);
      active();
      const prepared = record?.operation === 'runtime' ? await runtimeRequest(record) : request;
      active();
      const result = await session.request(prepared, requestOptions);
      active();
      if (record?.operation === 'runtime') runtimeReady = true;
      return result;
    },
    loadRuntime,
    close,
  });
}
`;

function portablePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes('\\') || path.split('/').some(part => part === '..')) {
    throw new TypeError('compiler package paths must be relative');
  }
  return path;
}

function localPath(directory, path) {
  return isAbsolute(path) ? path : resolve(directory, path);
}

export async function packageIndependentCompiler({artifact, outputRoot, sourceRoot = root, name = 'eliscript-independent-compiler'} = {}) {
  if (!artifact || !outputRoot) throw new TypeError('compiler packaging requires artifact and outputRoot');
  let input, inputDirectory;
  if (typeof artifact === 'string') {
    const path = resolve(artifact);
    input = await readCompilerMetadata(path);
    inputDirectory = dirname(path);
  } else {
    input = artifact;
    inputDirectory = artifact.directory ?? (artifact.metadataPath ? dirname(artifact.metadataPath) : undefined);
    if (!inputDirectory) throw new TypeError('in-memory compiler artifact requires its directory');
  }
  if (!['javascript', 'wasm', 'native'].includes(input.host)) throw new TypeError('unsupported compiler package host');
  if (input.host === 'native' && !['arm64-macos', 'arm64-linux'].includes(input.nativeTarget)) throw new TypeError('native compiler package requires real arm64-macos or arm64-linux code');
  if (!input.sourceIdentity || !input.artifactIdentity) throw new TypeError('compiler package requires preserved source and artifact identities');
  for (const record of input.sourceIdentity.modules ?? []) {
    if (record.filename !== undefined) portablePath(record.filename);
  }
  for(const record of input.sourceIdentity.hostSources??[]){portablePath(record.id);if(record.filename!==undefined)portablePath(record.filename);}
  if (input.sourceIdentity.runtime?.filename !== undefined) portablePath(input.sourceIdentity.runtime.filename);
  const directory = resolve(outputRoot), artifactDirectory = resolve(directory, 'artifact');
  const declaredFiles = new Map(input.artifactIdentity.files.map(record => [portablePath(record.path), record]));
  const files = [];
  async function fileIdentity(path) {
    const hash = createHash('sha256');let bytes = 0;
    for await (const chunk of createReadStream(path, {highWaterMark: 65536})) {hash.update(chunk);bytes += chunk.length;}
    return {bytes, sha256: hash.digest('hex')};
  }
  async function put(path, data) {
    portablePath(path);
    const target = resolve(directory, path);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, data);
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    files.push({path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  async function putMetadata(path, value) {
    portablePath(path);
    const target = resolve(directory, path);
    await mkdir(dirname(target), {recursive: true});
    await writeCompilerMetadata(target, value);
    files.push({path, ...await fileIdentity(target)});
  }
  async function putFile(path, source) {
    portablePath(path);
    const target = resolve(directory, path);
    await mkdir(dirname(target), {recursive: true});
    await copyFile(source, target);
    files.push({path, ...await fileIdentity(target)});
  }
  async function copyArtifact(source, destination) {
    portablePath(destination);
    const identity = declaredFiles.get(destination);
    const target = resolve(directory, 'artifact', destination);
    await mkdir(dirname(target), {recursive: true});
    const temporary = target + '.copy-' + randomUUID();
    let inputFile, outputFile, failed = false;
    try {
      inputFile = await open(localPath(inputDirectory, source), 'r');
      outputFile = await open(temporary, 'wx');
      const buffer = new Uint8Array(65536), hash = createHash('sha256');let bytes = 0;
      for (;;) {
        const {bytesRead} = await inputFile.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        const chunk = buffer.subarray(0, bytesRead);
        await outputFile.writeFile(chunk);hash.update(chunk);bytes += bytesRead;
      }
      const digest = hash.digest('hex');
      if (!identity || identity.sha256 !== digest || identity.bytes !== bytes) {
        throw new Error('compiler artifact changed after emission: ' + destination);
      }
      await outputFile.close();outputFile = undefined;
      await inputFile.close();inputFile = undefined;
      // Only the exact bytes checked above may replace an existing package
      // resource. A failed copy leaves its destination and identity untouched.
      await rename(temporary, target);
      files.push({path: 'artifact/' + destination, bytes, sha256: digest});
    } catch (error) {failed = true;throw error;}
    finally {
      const cleanup = await Promise.allSettled([inputFile?.close(), outputFile?.close()]);
      cleanup.push(...await Promise.allSettled([rm(temporary, {force: true})]));
      if (!failed) for (const result of cleanup) if (result.status === 'rejected') throw result.reason;
    }
  }
  const {bytes, lowered, load, directory: localDirectory, url, metadataPath, ...metadata} = input;
  if (input.host === 'javascript') {
    if (!Array.isArray(input.modules) || !input.modules.length) throw new TypeError('JavaScript compiler package requires the complete module graph');
    metadata.modules = [];
    for (const module of input.modules) {
      const destination = portablePath(module.id);
      await copyArtifact(module.path, destination);
      const record = {id: module.id, path: destination};
      if (module.sourceMapPath) {
        record.sourceMapPath = destination + '.map';
        await copyArtifact(module.sourceMapPath, record.sourceMapPath);
      }
      if (module.macroOriginsPath) {
        record.macroOriginsPath = destination + '.macro-origins.json';
        await copyArtifact(module.macroOriginsPath, record.macroOriginsPath);
      }
      metadata.modules.push(record);
    }
    metadata.path = portablePath(input.entry);
  } else {
    metadata.path = input.host === 'wasm' ? 'compiler.wasm' : input.nativeTarget === 'arm64-linux' ? 'compiler.so' : 'compiler.dylib';
    await copyArtifact(input.path, metadata.path);
  }
  const artifactPath = path => portablePath(isAbsolute(path) ? relative(inputDirectory, path).split(sep).join('/') : path);
  if (input.literalSources !== undefined) {
    if (!Array.isArray(input.literalSources)) throw new TypeError('compiler literalSources must be an array');
    metadata.literalSources = [];
    for (const record of input.literalSources) {
      if (typeof record?.id !== 'string' || typeof record.filename !== 'string') throw new TypeError('invalid compiler literal source asset');
      portablePath(record.id);portablePath(record.filename);
      const destination = artifactPath(record.path);
      await copyArtifact(record.path, destination);
      metadata.literalSources.push({id: record.id, filename: record.filename, path: destination,
        ...(record.encoding === undefined ? {} : {encoding: record.encoding})});
    }
  }
  if(input.project){
    metadata.project={...input.project,files:[]};
    for(const path of input.project.files??[]){
      const destination=artifactPath(path);await copyArtifact(path,destination);metadata.project.files.push(destination);
    }
  }
  if(input.hostSources){
    metadata.hostSources=[];
    for(const record of input.hostSources){
      const destination=artifactPath(record.path);await copyArtifact(record.path,destination);
      metadata.hostSources.push({id:record.id,path:destination});
    }
  }
  if (input.debugPath) {
    metadata.debugPath = artifactPath(input.debugPath);
    await copyArtifact(input.debugPath, metadata.debugPath);
  }
  if (input.frontendIR) {
    metadata.frontendIR = [];
    for (const record of input.frontendIR) {
      const path = artifactPath(record.path), canonicalPath = artifactPath(record.canonicalPath);
      await copyArtifact(record.path, path);await copyArtifact(record.canonicalPath, canonicalPath);
      metadata.frontendIR.push({id: record.id, stage: record.stage, path, canonicalPath});
    }
  }
  metadata.runtimePath = input.runtimeEncoding === undefined ? 'runtime.eli' : 'runtime.eli.json';
  await copyArtifact(input.runtimePath, metadata.runtimePath);
  await putMetadata('artifact/compiler-artifact.json', metadata);
  const transport = [
    'tools/backends/compiler-session.mjs',
    'tools/backends/compiler-metadata.mjs',
    'tools/backends/compiler-sha256.mjs',
    'tools/backends/compiler-worker.mjs',
    'tools/backends/compiler-browser.mjs',
    'tools/backends/compiler-debug.mjs',
    'tools/backends/managed-runtime.mjs',
    'tools/backends/managed-host.mjs',
    'tools/backends/managed-source-view.mjs',
    'tools/backends/managed-module-graph.mjs',
    'tools/runtime/unicode-case-profiles.mjs',
  ];
  if (input.host === 'native') transport.push('tools/backends/native-managed-runtime.mjs', 'tools/backends/native-memory.mjs',
    'tools/backends/native-node-memory.mjs','tools/backends/native-node-worker.mjs','tools/backends/native-node-runner.mjs',
    'tools/backends/native-node-watchdog.mjs');
  for (const path of transport) await putFile('transport/' + path.slice('tools/'.length), resolve(sourceRoot, path));
  // Keep the boundary provider at its canonical package-relative location so
  // consumers and the transport import the same class/protocol module instance.
  await putFile('runtime/literals.mjs', resolve(sourceRoot, 'runtime/literals.mjs'));
  async function copyCore(directoryPath) {
    for (const entry of await readdir(resolve(sourceRoot, directoryPath), {withFileTypes: true})) {
      const path = directoryPath + '/' + entry.name;
      if (entry.isDirectory()) await copyCore(path);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) await putFile(path, resolve(sourceRoot, path));
    }
  }
  await copyCore('runtime/core');
  await copyCore('runtime/wire');
  await putFile('platform/http.mjs', resolve(sourceRoot, 'platform/http.mjs'));
  await put('compiler-loader.mjs', packageLoader);
  const packageSource = JSON.parse(await readFile(resolve(sourceRoot, 'package.json'), 'utf8'));
  const manifest = {
    format: 'eliscript-compiler-package', version: 1,
    host: input.host, target: input.target,
    artifact: 'artifact/compiler-artifact.json',
    loader: 'compiler-loader.mjs',
    worker: 'transport/backends/compiler-worker.mjs',
    browser: input.host === 'native' ? null : 'transport/backends/compiler-browser.mjs',
    runtime: 'artifact/' + metadata.runtimePath,
    capabilities: {
      compilerHost: input.host,
      productTargets: ['javascript', 'wasm', 'native'],
      environments: input.host === 'native' ? ['node', 'bun'] : ['node', 'bun', 'browser'],
      ...(input.host === 'native' ? {nativeTarget: input.nativeTarget, operatingSystem: input.nativeTarget === 'arm64-linux' ? 'linux' : 'darwin', architecture: 'arm64',
        nativeLibraryLoader:{bun:'ffi',node:'bun-subprocess',compilerBackend:'native'}} : {}),
      nativeProductTargets: input.capabilities?.nativeProductTargets ?? [input.nativeTarget ?? 'arm64-macos'],
      seedRuntimeDependency: false,
      externalCompilerBackend: false,
    },
    sourceIdentity: input.sourceIdentity,
    artifactIdentity: input.artifactIdentity,
    provenance: input.provenance,
    acceptance: input.acceptance ?? {status: 'not-recorded'},
    files,
  };
  await put('package.json', JSON.stringify({
    name, version: packageSource.version, type: 'module',
    exports: {
      '.': './compiler-loader.mjs',
      './manifest': './compiler-package.json',
      './artifact': './artifact/compiler-artifact.json',
      './worker': './transport/backends/compiler-worker.mjs',
      './debug': './transport/backends/compiler-debug.mjs',
      './runtime/*': './runtime/*',
      './platform/http': './platform/http.mjs',
      './platform/http.mjs': './platform/http.mjs',
      ...(input.host === 'native' ? {} : {'./browser': './transport/backends/compiler-browser.mjs'}),
    },
    files: ['compiler-loader.mjs', 'compiler-package.json', 'artifact', 'transport', 'runtime', 'platform'],
    license: packageSource.license,
  }, null, 2) + '\n');
  const manifestPath = resolve(directory, 'compiler-package.json');
  await writeCompilerMetadata(manifestPath, manifest);
  return {directory, artifactDirectory, manifestPath, manifest};
}

export async function main(args = process.argv.slice(2)) {
  const {values} = parseArgs({args, strict: true, options: {
    artifact: {type: 'string'}, output: {type: 'string', short: 'o'},
    name: {type: 'string'}, help: {type: 'boolean', short: 'h'},
  }});
  if (values.help) {
    process.stdout.write('Usage: compiler-package.mjs --artifact compiler-artifact.json --output DIRECTORY [--name PACKAGE]\n');
    return;
  }
  const result = await packageIndependentCompiler({artifact: values.artifact, outputRoot: values.output, name: values.name});
  process.stdout.write(result.manifestPath + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {process.stderr.write((error?.stack ?? String(error)) + '\n'); process.exitCode = 1;});
}
