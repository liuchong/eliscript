import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, readFile, readdir, writeFile, lstat, symlink, rm} from 'node:fs/promises';
import {resolve, relative, sep, isAbsolute, dirname, basename} from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function relativePath(value, label) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || /[\\:\u0000]/.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new TypeError(label + ' must be a relative path inside the reference artifact');
  }
  return value;
}

function localPath(directory, path) {
  const result = relative(directory, path);
  if (!result || isAbsolute(result) || result === '..' || result.startsWith('..' + sep)) {
    throw new TypeError('independent reference must remain in its original case archive');
  }
  return result.split(sep).join('/');
}

function aborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('independent original reference aborted');
}

async function put(directory, id, bytes) {
  relativePath(id, 'reference file');
  let parent = directory;
  for (const part of id.split('/').slice(0, -1)) {
    parent = resolve(parent, part);
    await mkdir(parent, {recursive: true});
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError('reference file traverses a directory alias');
  }
  const path = resolve(directory, id);
  await writeFile(path, bytes, {flag: 'wx'});
  return path;
}

async function seedCompile(sourceRoot, input, output, portableEntries, options, signal) {
  aborted(signal);
  const args = ['--source-map', ...portableEntries.flatMap(name => ['--portable', name]), '--output', output, input];
  return new Promise(accept => {
    const stdout = [], stderr = [];
    let failure, child;
    try {
    child = spawn(resolve(sourceRoot, 'bin/eliscript-seed'), args, {
      cwd: sourceRoot, signal, stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, EMACS: options.emacs ?? process.env.EMACS ?? 'emacs'},
    });
    } catch (error) {
      accept({exitCode: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0)});
      return;
    }
    child.stdout.on('data', bytes => stdout.push(bytes));
    child.stderr.on('data', bytes => stderr.push(bytes));
    child.once('error', error => {failure = error;});
    child.once('close', (exitCode, terminationSignal) => accept({exitCode, signal: terminationSignal,
      error: failure, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr)}));
  });
}

async function seedIdentity(sourceRoot) {
  const files = ['bin/eliscript-seed', ...(await readdir(resolve(sourceRoot, 'compiler')))
    .filter(name => name.endsWith('.el')).sort().map(name => 'compiler/' + name)];
  const records = [];
  for (const file of files) {
    const bytes = await readFile(resolve(sourceRoot, file));
    records.push({file, bytes: bytes.length, sha256: digest(bytes)});
  }
  return {implementation: 'emacs-seed', files: records, sha256: digest(JSON.stringify(records))};
}

async function referenceEnvironment(directory, sourceRoot, modules, providers) {
  const files = [];
  for (const module of modules) {
    // Retain the same .eli ESM transport used by the original host runner. This
    // transports imports only; all compiler implementation bytes came from Seed.
    const alias = module.id.slice(0, -4) + '.eli';
    const specifier = './' + basename(module.id);
    const source = 'export * from ' + JSON.stringify(specifier) + ';\n';
    await put(directory, alias, source);
    files.push({path: alias, role: 'original-eli-import-transport', bytes: Buffer.byteLength(source), sha256: digest(source)});
  }
  for (const provider of providers) {
    await put(directory, provider.id, provider.source);
    files.push({path: provider.id, role: 'original-host-provider', filename: provider.filename,
      bytes: Buffer.byteLength(provider.source), sha256: digest(provider.source)});
  }
  // Runtime imports resolve to the real repository package, exactly as in the
  // original Seed oracle; this is an explicit environment dependency, not a
  // substituted compiler or a copied provider implementation.
  const packageDirectory = resolve(directory, 'node_modules');
  await mkdir(packageDirectory, {recursive: true});
  await symlink(sourceRoot, resolve(packageDirectory, 'eliscript'), 'dir');
  const runtimePath = resolve(directory, 'runtime');
  try {await symlink(resolve(sourceRoot, 'runtime'), runtimePath, 'dir');}
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // An emitted runtime/ module graph takes precedence over this convenience
    // alias. Do not replace actual emitted modules with repository JavaScript.
    const details = await lstat(runtimePath);
    if (details.isSymbolicLink() || !details.isDirectory()) throw new TypeError('independent reference runtime path conflicts with its source graph');
  }
  return files;
}

// Each call creates fresh Seed output and a distinct import directory. In
// particular the selected-program invocation and its independent Seed oracle
// must call this separately; neither a selected session nor an imported module
// cache can supply the reference implementation.
export async function prepareOriginalReferenceArtifact(context) {
  if (context.record?.execution?.referenceArtifact !== true) return undefined;
  const {record, signal} = context;
  const sourceRoot = resolve(context.sourceRoot ?? record.sourceRoot);
  if (typeof context.directory !== 'string') throw new TypeError('independent reference requires its original case directory');
  const directory = resolve(context.directory), options = context.options ?? {};
  const modules = record.modules ?? record.request?.modules;
  const entry = relativePath(record.entry ?? record.request?.entry, 'reference entry');
  if (!Array.isArray(modules) || !modules.length) throw new TypeError('independent reference requires the complete original module graph');
  // The original Seed CLI has no capability-context input. Never silently
  // replace capability-bearing module semantics with its default environment.
  if (record.request?.macroContext !== undefined || modules.some(module => module?.macroContext !== undefined) ||
      record.request?.portable === true) {
    throw new TypeError('independent reference Seed CLI cannot transport this explicit macro or implicit portable context');
  }
  const portableEntries = record.request?.portableEntries ?? [];
  if (!Array.isArray(portableEntries) || portableEntries.some(name => typeof name !== 'string' || !name || name.includes('\u0000'))) {
    throw new TypeError('independent reference portable entries must retain explicit function names');
  }
  const ids = new Set(), filenames = new Map(), outputPaths = new Set();
  for (const module of modules) {
    relativePath(module?.id, 'reference module id');
    relativePath(module?.filename, 'reference source filename');
    if (!module.id.endsWith('.mjs') || typeof module.source !== 'string' || ids.has(module.id) ||
        filenames.has(module.filename) && filenames.get(module.filename) !== module.source) {
      throw new TypeError('independent reference requires distinct complete source modules');
    }
    ids.add(module.id); filenames.set(module.filename, module.source);
    for (const path of [module.id, module.id + '.map', module.id.slice(0, -4) + '.eli']) {
      if (outputPaths.has(path)) throw new TypeError('independent reference output paths overlap');
      outputPaths.add(path);
    }
  }
  if (!ids.has(entry)) throw new TypeError('independent reference entry is outside the original graph');
  const providers = record.request?.hostSources ?? [];
  if (!Array.isArray(providers)) throw new TypeError('independent reference host sources must retain the original provider array');
  for (const provider of providers) {
    relativePath(provider?.id, 'reference provider id');
    relativePath(provider?.filename, 'reference provider filename');
    if (typeof provider.source !== 'string' || outputPaths.has(provider.id)) throw new TypeError('independent reference provider conflicts with emitted modules');
    outputPaths.add(provider.id);
  }
  aborted(signal);
  const compiler = await seedIdentity(sourceRoot);
  await mkdir(directory, {recursive: true});
  const work = await mkdtemp(resolve(directory, 'original-independent-reference-'));
  const instance = basename(work), sourcesDirectory = resolve(work, 'sources'), emitted = resolve(work, 'seed-output');
  const sourceIdentity = modules.map(module => ({id: module.id, filename: module.filename,
    bytes: Buffer.byteLength(module.source), sha256: digest(module.source),
    utf16Sha256: digest(Buffer.from(module.source, 'utf16le'))}));
  const manifestPath = resolve(work, 'reference.json');
  const manifest = {format: 'eliscript-original-independent-reference', version: 1,
    role: 'independent-reference', producer: 'emacs-seed', selectedTarget: context.target,
    entry, compiler, sourceIdentity: {modules: sourceIdentity, sha256: digest(JSON.stringify(sourceIdentity))},
    instance, portableEntries: [...portableEntries], status: 'compiling', verification: 'unverified',
    staging: {ownership: 'reference-preparation', sources: 'sources', emitted: 'seed-output', status: 'pending'},
    modules: [], environmentFiles: [], invocations: []};
  const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const clearStaging = async () => {
    // Delete only the two directories created by this invocation. The actual
    // archived product, original logs and source identities belong to the
    // caller's case archive and remain available to its host process.
    let failure;
    for (const path of [sourcesDirectory, emitted]) {
      try {await rm(path, {recursive: true, force: true});} catch (error) {failure ??= error;}
    }
    manifest.staging.status = failure ? 'cleanup-failed' : 'removed';
    if (failure) throw failure;
  };
  await save();
  try {
    await mkdir(sourcesDirectory); await mkdir(emitted);
    manifest.staging.status = 'active';
    // Stage the whole original source graph before the first compiler call.
    for (const [filename, source] of filenames) await put(sourcesDirectory, filename, source);
    const response = {target: 'javascript', entry, modules: []};
    for (const [index, module] of modules.entries()) {
      const input = resolve(sourcesDirectory, module.filename), output = resolve(emitted, module.id);
      await mkdir(dirname(output), {recursive: true});
      const modulePortableEntries = module.id === entry ? portableEntries : [];
      const invocation = await seedCompile(sourceRoot, input, output, modulePortableEntries, options, signal);
      const stdoutPath = 'invocation-' + index + '.stdout.log', stderrPath = 'invocation-' + index + '.stderr.log';
      await put(work, stdoutPath, invocation.stdout); await put(work, stderrPath, invocation.stderr);
      manifest.invocations.push({module: module.id, command: 'bin/eliscript-seed',
        arguments: ['--source-map', ...modulePortableEntries.flatMap(name => ['--portable', name]), '--output', localPath(work, output), localPath(work, input)],
        exitCode: invocation.exitCode, signal: invocation.signal,
        ...(invocation.error ? {error: {name: invocation.error.name, message: invocation.error.message}} : {}),
        stdout: {path: stdoutPath, bytes: invocation.stdout.length, sha256: digest(invocation.stdout)},
        stderr: {path: stderrPath, bytes: invocation.stderr.length, sha256: digest(invocation.stderr)}});
      await save();
      if (invocation.error) {invocation.error.moduleId = module.id; throw invocation.error;}
      aborted(signal);
      if (invocation.exitCode !== 0 || invocation.signal !== null) {
        const error = new Error(invocation.stderr.toString('utf8').trim() || 'independent reference Seed exited with ' + invocation.exitCode);
        error.code = 'ELISCRIPT_ORIGINAL_REFERENCE_COMPILE'; error.moduleId = module.id; throw error;
      }
      const javascriptBytes = await readFile(output), mapBytes = await readFile(output + '.map');
      response.modules.push({id: module.id, javascript: javascriptBytes.toString('utf8'), sourceMap: mapBytes.toString('utf8')});
      manifest.modules.push({id: module.id, filename: module.filename,
        javascript: {bytes: javascriptBytes.length, sha256: digest(javascriptBytes)},
        sourceMap: {bytes: mapBytes.length, sha256: digest(mapBytes)}});
    }
    const archive = context.archiveProduct ?? (async (value, name, target) => {
      const {archiveProduct} = await import('./compiler-matrix.mjs');
      return archiveProduct(value, target, resolve(work, 'product'));
    });
    const artifact = await archive(response, instance + '-product', 'javascript');
    if (artifact.target !== 'javascript' || typeof artifact.directory !== 'string' ||
        artifact.directory === context.artifact?.directory || artifact.path === context.artifact?.path ||
        !Array.isArray(artifact.modules) || artifact.modules.length !== modules.length ||
        typeof artifact.identitySha256 !== 'string') throw new Error('independent reference archive must contain its own complete JavaScript implementation');
    const actual = new Map(artifact.modules.map(module => [module.id, module]));
    if (actual.size !== modules.length) throw new Error('independent reference archive repeated a module');
    for (const expected of manifest.modules) {
      const module = actual.get(expected.id);
      if (!module || typeof module.path !== 'string' || typeof module.sourceMapPath !== 'string' ||
          digest(await readFile(module.path)) !== expected.javascript.sha256 ||
          digest(await readFile(module.sourceMapPath)) !== expected.sourceMap.sha256) {
        throw new Error('independent reference archive changed emitted Seed bytes');
      }
    }
    manifest.environmentFiles = await referenceEnvironment(artifact.directory, sourceRoot, modules, providers);
    manifest.environmentDependencies = [{role: 'original-runtime-package', specifier: 'eliscript', implementation: 'original-source-root'}];
    manifest.product = {directory: localPath(directory, artifact.directory), identitySha256: artifact.identitySha256};
    manifest.status = 'prepared';
    // Detect a Seed edit during generation instead of recording mixed compiler
    // implementations under one provenance identity.
    if ((await seedIdentity(sourceRoot)).sha256 !== compiler.sha256) throw new Error('independent Seed compiler changed during reference generation');
    await clearStaging();
    await save();
    const manifestBytes = await readFile(manifestPath);
    return {directory: artifact.directory, manifestPath, supportingProducts: [{
      role: 'original-independent-reference', producer: 'emacs-seed', target: 'javascript',
      selectedTarget: context.target, directory: localPath(directory, artifact.directory),
      identitySha256: artifact.identitySha256, sourceIdentitySha256: manifest.sourceIdentity.sha256,
      manifest: localPath(directory, manifestPath), manifestSha256: digest(manifestBytes),
      verification: 'unverified',
    }]};
  } catch (error) {
    manifest.status = 'failed';
    manifest.failure = {name: error?.name ?? 'Error', message: error?.message ?? String(error),
      ...(error?.moduleId ? {module: error.moduleId} : {})};
    try {await clearStaging();} catch (cleanupError) {
      manifest.staging.failure = {name: cleanupError?.name ?? 'Error', message: cleanupError?.message ?? String(cleanupError)};
      if (error && typeof error === 'object') error.referenceCleanupFailure = cleanupError;
    }
    try {await save();} catch (saveError) {if (error && typeof error === 'object') error.referenceArchiveFailure = saveError;}
    throw error;
  }
}
