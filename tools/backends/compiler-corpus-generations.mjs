import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCompilerSources, buildIndependentCompiler, independentCompilerProfiles} from './compiler-build.mjs';
import {
  archiveCompilerArtifact, archiveCompilerSources, compilerSourceIdentity,
  compilerDigest, compilerFailure, normalizeCompilerHost, openCompilerArtifact, saveCompilerMetadata,
} from './compiler-bootstrap.mjs';

function aborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('original compiler generations aborted');
}

function localPath(base, path) {
  const result = relative(base, path).split(sep).join('/');
  if (!result || result === '..' || result.startsWith('../')) {
    throw new TypeError('original generation product must remain inside its case archive');
  }
  return result;
}

function frontendModules(context, sources) {
  const actual = sources.modules.filter(module => module.filename.startsWith('bootstrap/compiler/'));
  const declared = context.record.modules ?? context.record.request?.modules;
  if (actual.length !== 13 || !Array.isArray(declared) || declared.length !== actual.length) {
    throw new TypeError('original CLI generations require all thirteen original frontend sources');
  }
  const byFilename = new Map(actual.map(module => [module.filename, module])), seen = new Set();
  for (const module of declared) {
    const original = byFilename.get(module.filename);
    if (!original || seen.has(module.filename) || module.source !== original.source ||
        module.id !== module.filename.slice(0, -4) + '.mjs') {
      throw new TypeError('original CLI frontend source differs from the complete compiler graph');
    }
    seen.add(module.filename);
  }
  return structuredClone(declared);
}

function requireProducer(artifact, producer, sources, target) {
  const provenance = artifact.provenance;
  if (normalizeCompilerHost(artifact.host) !== target || provenance?.mode !== 'session' ||
      normalizeCompilerHost(provenance.producerHost) !== normalizeCompilerHost(producer.host) ||
      provenance.runtimeCompiled !== true || !Array.isArray(provenance.compiledModuleIds) ||
      JSON.stringify([...provenance.compiledModuleIds].sort()) !== JSON.stringify(sources.modules.map(module => module.id).sort())) {
    throw new Error('original generation was not built entirely by its preceding compiler session');
  }
}

function requireFrontendProduct(product, modules, target) {
  if (product.target !== target || product.entry !== 'bootstrap/compiler/compiler.mjs') {
    throw new Error('original compiler frontend view changed its entry or target');
  }
  const records = target === 'javascript' ? product.modules : product.descriptor?.project?.modules;
  if (!Array.isArray(records) ||
      JSON.stringify(records.map(module => module.id).sort()) !== JSON.stringify(modules.map(module => module.id).sort())) {
    throw new Error('original compiler frontend view omitted an original module');
  }
}

// Construct three actual successor compilers. No seed/bootstrap fallback is
// available here: even the first generation must use the selected cell's
// caller-owned compiler session. The frontend facades and JavaScript/map
// companions are separate, independently identified products of each successor.
export async function prepareOriginalCompilerGenerations(context) {
  const contract = context.record?.execution?.compilerGenerations;
  if (contract === undefined) return undefined;
  if (contract.count !== 3 || contract.producer !== 'previous-generation' ||
      contract.target !== 'selected-target' || contract.completeCompiler !== true || contract.sourceMaps !== true ||
      contract.manifestEnvironment !== 'ELISCRIPT_ORIGINAL_COMPILER_GENERATIONS' ||
      contract.manifestFormat !== 'eliscript-original-compiler-generations' || contract.manifestVersion !== 1) {
    throw new TypeError('unsupported original compiler generation contract');
  }
  const options = context.options ?? {}, profile = options.profile;
  if (typeof profile !== 'string' || !Object.hasOwn(independentCompilerProfiles, profile)) {
    throw new TypeError('original compiler generations require an explicit existing compiler profile');
  }
  if (typeof context.session?.request !== 'function' || typeof context.archiveProduct !== 'function') {
    throw new TypeError('original compiler generations require the actual selected session and product archiver');
  }
  const target = normalizeCompilerHost(context.target), directory = resolve(context.directory, 'original-compiler-generations');
  await mkdir(directory, {recursive: true});
  const manifestPath = resolve(directory, 'generations.json');
  const sources = await loadCompilerSources({sourceRoot: context.sourceRoot});
  // The full producer is an ordinary compiler entry, never a phased ESM view.
  // The latter is built separately only for the unchanged public host bodies.
  sources.phased = false;
  const modules = frontendModules(context, sources), identity = compilerSourceIdentity(sources);
  await archiveCompilerSources(sources, resolve(directory, 'sources'));
  const metadata = {
    format: 'eliscript-original-compiler-generations', version: 1, target, profile,
    status: 'constructing', verification: 'unverified', sourceIdentity: identity,
    generations: [], fixedPoint: {verification: 'unverified', comparisons: []},
  };
  await saveCompilerMetadata(manifestPath, metadata);
  const supportingProducts = [];
  let producer = context.session, ownedSession = null, failure, phase = 'build';
  try {
    for (let number = 1; number <= 3; number++) {
      aborted(context.signal);
      const generationDirectory = resolve(directory, 'generation-' + number);
      await mkdir(generationDirectory, {recursive: true});
      const record = {generation: number, producerHost: normalizeCompilerHost(producer.host),
        target, sourceSha256: identity.sha256, status: 'building', verification: 'unverified'};
      metadata.generations.push(record);
      phase = 'generation-' + number + '-build';
      await saveCompilerMetadata(manifestPath, metadata);
      const artifact = await buildIndependentCompiler({
        host: target, outputRoot: resolve(generationDirectory, 'compiler'), sourceRoot: context.sourceRoot,
        sources: structuredClone(sources), session: producer, profile,
        budget: options.budget, memory: options.memory, auto: options.auto,
        nativeTarget: options.nativeTarget, signal: context.signal,
        retainIR: options.retainIR ?? true, debug: options.debug ?? true,
      });
      requireProducer(artifact, producer, sources, target);
      record.fullCompiler = await archiveCompilerArtifact(artifact, resolve(generationDirectory, 'compiler-metadata'));
      record.status = 'built';
      supportingProducts.push({role: 'original-compiler-generation-full', generation: number, target,
        producerHost: record.producerHost, directory: localPath(context.directory, artifact.directory),
        identitySha256: record.fullCompiler.productIdentity.sha256});
      phase = 'generation-' + number + '-initialize';
      await saveCompilerMetadata(manifestPath, metadata);
      const next = await openCompilerArtifact(artifact, options.sessionOptions);
      const previousOwned = ownedSession;
      ownedSession = next; producer = next;
      if (previousOwned) await previousOwned.close();
      aborted(context.signal);
      phase = 'generation-' + number + '-frontend-runtime';
      await producer.request({operation: 'runtime', source: sources.runtime.source, filename: sources.runtime.filename,
        ...(Object.hasOwn(sources, 'literalSources') ? {literalSources: sources.literalSources} : {})}, {signal: context.signal});
      const request = {operation: 'project', modules: structuredClone(modules),
        entry: 'bootstrap/compiler/compiler.mjs', entries: modules.map(module => module.id),
        resolveImports: true, phased: true, sourceMap: true, target,
        memory: options.memory ?? artifact.memory, nativeTarget: options.nativeTarget ?? artifact.nativeTarget,
        nativeFormat: 'library', debug: options.debug ?? true};
      phase = 'generation-' + number + '-frontend-view';
      const response = await producer.request(request, {signal: context.signal});
      const view = await context.archiveProduct(response, 'original-generation-' + number + '-frontend-view', target);
      requireFrontendProduct(view, modules, target);
      record.frontendView = {producerHost: normalizeCompilerHost(producer.host), target,
        identitySha256: view.identitySha256, directory: localPath(context.directory, view.directory)};
      supportingProducts.push({role: 'original-compiler-generation-frontend-view', generation: number, ...record.frontendView});
      phase = 'generation-' + number + '-javascript-companion';
      const javascript = await producer.request({...request, target: 'javascript', phased: false}, {signal: context.signal});
      const companion = await context.archiveProduct(javascript, 'original-generation-' + number + '-javascript-companion', 'javascript');
      requireFrontendProduct(companion, modules, 'javascript');
      record.javascriptCompanion = {producerHost: normalizeCompilerHost(producer.host), target: 'javascript',
        identitySha256: companion.identitySha256, directory: localPath(context.directory, companion.directory)};
      supportingProducts.push({role: 'original-compiler-generation-javascript-companion', generation: number, ...record.javascriptCompanion});
      for (const module of companion.modules) {
        if (typeof module.sourceMapPath !== 'string' || typeof module.sourceMapSha256 !== 'string') {
          throw new Error('original compiler generation omitted an actual JavaScript source map');
        }
        const bytes = await readFile(module.sourceMapPath);
        if (compilerDigest(bytes) !== module.sourceMapSha256) throw new Error('original compiler source map changed after emission');
        if (target !== 'javascript') {
          const path = resolve(view.directory, module.id + '.map');
          await mkdir(resolve(path, '..'), {recursive: true});
          await writeFile(path, bytes, {flag: 'wx'});
        }
      }
      record.compilerDirectory = resolve(view.directory, 'bootstrap/compiler');
      record.javascriptDirectory = resolve(companion.directory, 'bootstrap/compiler');
      if (target !== 'javascript') {
        const configuration = resolve(generationDirectory, 'frontend-context.json');
        await saveCompilerMetadata(configuration, {
          target, path: view.path, descriptor: view.descriptor, typed: view.typed,
          nativeTarget: view.nativeTarget ?? options.nativeTarget ?? artifact.nativeTarget,
          entry: view.entry, base: pathToFileURL(view.directory + sep).href,
          sourceRoot: context.sourceRoot, memory: options.memory ?? artifact.memory,
          runtimeOptions: {...options.runtimeOptions,
            ...(options.auto === undefined ? {} : {auto: options.auto}),
            ...(view.debug ? {debug: view.debug} : {})},
        });
        record.context = configuration;
      }
      record.status = 'constructed';
      const previous = metadata.generations.at(-2);
      if (previous) {
        const left = previous.fullCompiler.productIdentity.sha256, right = record.fullCompiler.productIdentity.sha256;
        metadata.fixedPoint.comparisons.push({from: previous.generation, to: number,
          identities: [left, right], status: left === right ? 'identical' : 'different'});
      }
      await saveCompilerMetadata(manifestPath, metadata);
    }
    phase = 'complete-target-artifact-fixed-point';
    metadata.fixedPoint.status = metadata.fixedPoint.comparisons.every(item => item.status === 'identical')
      ? 'identical' : 'different';
    if (metadata.fixedPoint.status !== 'identical') {
      throw new Error('original compiler generations produced different complete target artifacts');
    }
    metadata.status = 'constructed';
    await saveCompilerMetadata(manifestPath, metadata);
    return {manifestPath, supportingProducts};
  } catch (error) {
    failure = error; metadata.status = 'failed'; metadata.failure = {phase, ...compilerFailure(error)};
    await saveCompilerMetadata(manifestPath, metadata); throw error;
  } finally {
    if (ownedSession) {
      try {await ownedSession.close();}
      catch (error) {
        metadata.cleanupFailure = compilerFailure(error); metadata.status = 'failed';
        await saveCompilerMetadata(manifestPath, metadata);
        if (!failure) throw error;
      }
    }
  }
}
