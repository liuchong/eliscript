import {afterAll, beforeAll, test, spyOn} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildIndependentCompiler, compilerMetadataDigest, independentCompilerProductIdentity, loadCompilerSources, writeCompilerMetadata, decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {readCompilerMetadata} from '../tools/backends/compiler-metadata.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {packageIndependentCompiler} from '../tools/backends/compiler-package.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {createCompilerSession, decodeCompilerSourceAsset, encodeCompilerIR} from '../tools/backends/compiler-session.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';

let directory, installed, manifest, artifact, originalArtifact;
const fixtureChildImports = `
import assert from 'node:assert/strict';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildIndependentCompiler} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs', import.meta.url).href)};
import {readCompilerMetadata} from ${JSON.stringify(new URL('../tools/backends/compiler-metadata.mjs', import.meta.url).href)};
import {openCompilerArtifact} from ${JSON.stringify(new URL('../tools/backends/compiler-bootstrap.mjs', import.meta.url).href)};
import {packageIndependentCompiler} from ${JSON.stringify(new URL('../tools/backends/compiler-package.mjs', import.meta.url).href)};
import {createCompilerSession} from ${JSON.stringify(new URL('../tools/backends/compiler-session.mjs', import.meta.url).href)};
assert(process.versions.bun, 'package fixture generation requires the actual Bun runtime');
`;

function packageFixtureChild(kind, source, started) {
  // These are synchronous, non-detached descendants of the test's existing
  // controlled process tree. Exiting each VM releases its compiler/JIT pages;
  // only actual package paths cross stdout, never another complete IR graph.
  const remaining = 120000 - (Date.now() - started);
  assert(remaining > 0, kind + ': the original fixture deadline must remain available');
  const executable = process.versions.bun ? process.execPath : process.env.BUN ?? 'bun';
  const child = spawnSync(executable, ['--smol', '--eval', fixtureChildImports + source], {
    cwd: process.cwd(), encoding: 'utf8', timeout: remaining, killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env},
  });
  assert.equal(child.error, undefined, kind + ': ' + (child.error?.message ?? 'owned fixture child error'));
  assert.equal(child.signal, null, kind + ': owned fixture child signal ' + child.signal);
  assert.equal(child.status, 0, kind + ': owned fixture child exit ' + child.status + '; see inherited stderr');
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.format, 'eliscript-package-fixture');assert.equal(result.version, 1);assert.equal(result.kind, kind);
  assert(Object.keys(result).every(key => ['format', 'version', 'kind', 'packageDirectory', 'artifactDirectory', 'manifestPath', 'sourceArtifactPath'].includes(key)));
  for (const key of ['packageDirectory', 'artifactDirectory', 'manifestPath', 'sourceArtifactPath']) if (Object.hasOwn(result, key)) {
    assert.equal(typeof result[key], 'string');assert(isAbsolute(result[key]));assert(result[key].length < 16384);
  }
  assert(Date.now() - started <= 120000, kind + ': the original total fixture deadline remains 120 seconds');
  return result;
}

beforeAll(async () => {
  const started = Date.now();
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-package-session-'));
  try {
    let packageDirectory = process.env.ELISCRIPT_TEST_COMPILER_PACKAGE_DIRECTORY;
    if (packageDirectory) {
      assert(process.env.ELISCRIPT_TEST_COMPILER_PACKAGE_SOURCE_ARTIFACT, 'an existing package requires its actual producer artifact for identity preservation checks');
      originalArtifact = await readCompilerMetadata(resolve(process.env.ELISCRIPT_TEST_COMPILER_PACKAGE_SOURCE_ARTIFACT));
    }
    if (!packageDirectory) {
      const result = packageFixtureChild('javascript-package-setup', `
    const directory = ${JSON.stringify(directory)};
    const seed = await buildIndependentCompiler({host: 'javascript', outputRoot: resolve(directory, 'seed'), profile: 'full-runtime', retainIR: false, debug: false});
    const producer = await openCompilerArtifact(seed);
    try {
      const compiler = await buildIndependentCompiler({host: 'javascript', session: producer, outputRoot: resolve(directory, 'compiler'), profile: 'full-runtime', retainIR: false, debug: false});
      const packaged = await packageIndependentCompiler({artifact: compiler, outputRoot: resolve(directory, 'package')});
      process.stdout.write(JSON.stringify({format: 'eliscript-package-fixture', version: 1, kind: 'javascript-package-setup',
        packageDirectory: packaged.directory, sourceArtifactPath: compiler.metadataPath}) + '\\n');
    } finally {await producer.close();}
`, started);
      packageDirectory = result.packageDirectory;
      originalArtifact = await readCompilerMetadata(result.sourceArtifactPath);
    }
    installed = resolve(directory, 'installed');
    await cp(resolve(packageDirectory), installed, {recursive: true, dereference: false});
    manifest = JSON.parse(await readFile(resolve(installed, 'compiler-package.json'), 'utf8'));
    artifact = await readCompilerMetadata(resolve(installed, manifest.artifact));
    assert(Date.now() - started <= 120000, 'the original complete package setup deadline remains 120 seconds');
  } catch (error) {
    try {await rm(directory, {recursive: true, force: true});directory = undefined;} catch {}
    throw error;
  }
}, 120000);
afterAll(async () => {
  sourceObserverProducts = undefined;sourceObserverPackages.clear();
  if (directory) await rm(directory, {recursive: true, force: true});
});

const sha = data => createHash('sha256').update(data).digest('hex');
function portable(path) {
  assert.equal(typeof path, 'string');assert(path.length > 0);
  assert.equal(isAbsolute(path), false);assert.equal(/[\\:\u0000]/.test(path), false);
  assert(path.split('/').every(part => part && part !== '.' && part !== '..'));
}

test('packaging a metadata path and relocating its loader preserve complete IR through bounded UTF8 decoding', async () => {
  const typed = {functions: [{name: 'retained', arity: 4,
    body: {kind: 'sequence', children: [{kind: 'literal', value: -0, children: []}]},
    source: {kind: 'function-declaration', value: 'retained', children: [
      {kind: 'literal', value: 'x'.repeat(65530) + '中😀'.repeat(24000) + '\ud800\\\"\n', children: []},
    ]}}], exports: ['retained'], aliases: [{name: 'retained', function: 'retained'}]};
  const descriptor = {functions: [{name: 'retained', wireName: 'retained', arity: 0}],
    metadataNumbers: [-0, Number.MIN_VALUE, Number.MAX_VALUE, 1.25], source: {filename: '中😀.eli'}};
  const inputPath = resolve(installed, dirname(manifest.artifact), 'streamed-package-input.json');
  await writeCompilerMetadata(inputPath, {...artifact, typed, descriptor});
  const packaged = await packageIndependentCompiler({artifact: inputPath, outputRoot: resolve(directory, 'streamed-package')});
  const moved = resolve(directory, 'streamed-relocated');
  await cp(packaged.directory, moved, {recursive: true});
  await rm(packaged.directory, {recursive: true, force: true});
  const metadataPath = resolve(moved, packaged.manifest.artifact);
  const stored = await readCompilerMetadata(metadataPath);
  assert.deepEqual(stored.typed, typed);assert.deepEqual(stored.descriptor, descriptor);
  assert(Object.is(stored.typed.functions[0].body.children[0].value, -0));
  for (const field of ['typed', 'descriptor']) assert.equal(compilerMetadataDigest(stored[field]), compilerMetadataDigest({typed, descriptor}[field]));
  assert.deepEqual(stored.sourceIdentity, artifact.sourceIdentity);
  assert.deepEqual(stored.productIdentity, artifact.productIdentity);
  const identity = packaged.manifest.files.find(record => record.path === packaged.manifest.artifact);
  const bytes = await readFile(metadataPath);
  assert.equal(identity.bytes, bytes.length);assert.equal(identity.sha256, sha(bytes));
  assert(packaged.manifest.files.some(record => record.path === 'transport/backends/compiler-metadata.mjs'));
  const {openCompilerPackage} = await import(pathToFileURL(resolve(moved, packaged.manifest.loader)).href);
  const OriginalDecoder = globalThis.TextDecoder, sizes = [];
  let compiler;
  try {
    globalThis.TextDecoder = class extends OriginalDecoder {
      decode(input, options) {
        if (input !== undefined) {sizes.push(input.byteLength);assert(input.byteLength <= 65536, 'metadata UTF8 input must remain bounded');}
        return super.decode(input, options);
      }
    };
    compiler = await openCompilerPackage();
  } finally {globalThis.TextDecoder = OriginalDecoder;}
  try {
    assert(sizes.filter(size => size === 65536).length >= 3);
    assert.deepEqual(compiler.artifact.typed, typed);assert.deepEqual(compiler.artifact.descriptor, descriptor);
    const result = await compiler.request({operation: 'compile', source: '(defun run () -0.0) (export run)', filename: 'metadata-restart.eli'});
    assert(Object.is((await import('data:text/javascript;base64,' + Buffer.from(result.javascript).toString('base64'))).run(), -0));
  } finally {await compiler.close();}
  const changedManifest = structuredClone(packaged.manifest);
  const changedIdentity = changedManifest.files.find(record => record.path === changedManifest.artifact);
  // A bad digest is rejected before JSON decoding; correctly identified bad
  // JSON or UTF8 still fails before opening a compiler session.
  const invalid = Buffer.from('{"host":');
  await writeFile(metadataPath, invalid);
  await assert.rejects(() => openCompilerPackage(), /byte count mismatch/);
  for (const data of [invalid, Buffer.from([0x7b, 0xff, 0x7d])]) {
    await writeFile(metadataPath, data);changedIdentity.bytes = data.length;changedIdentity.sha256 = sha(data);
    await writeCompilerMetadata(resolve(moved, 'compiler-package.json'), changedManifest);
    await assert.rejects(() => openCompilerPackage(), error => error instanceof SyntaxError || error instanceof TypeError);
  }
}, 120000);

test('packaging validates the exact copied bytes before replacing a resource and cleans failed copies', async () => {
  const sourceDirectory = resolve(directory, 'copy-source');
  await cp(resolve(installed, dirname(manifest.artifact)), sourceDirectory, {recursive: true});
  const input = {...artifact, directory: sourceDirectory};
  const first = input.modules[0], source = resolve(sourceDirectory, first.path);
  const original = await readFile(source), output = resolve(directory, 'checked-copy-package');
  const destination = resolve(output, 'artifact', first.id), sentinel = Buffer.from('previous verified resource');
  await mkdir(dirname(destination), {recursive: true});await writeFile(destination, sentinel);
  const before = await readdir(dirname(destination));
  for (const corrupt of [Buffer.from(original), original.subarray(1)]) {
    if (corrupt.length === original.length) corrupt[0] ^= 1;
    await writeFile(source, corrupt);
    await assert.rejects(() => packageIndependentCompiler({artifact: input, outputRoot: output}), /compiler artifact changed after emission/);
    assert.deepEqual(await readFile(destination), sentinel);
    assert.deepEqual(await readdir(dirname(destination)), before, 'a rejected copy must remove its unpublished temporary resource');
  }
  await rm(source);
  await assert.rejects(() => packageIndependentCompiler({artifact: input, outputRoot: output}), error => {
    assert.equal(error.code, 'ENOENT');assert.equal(typeof error.stack, 'string');return true;
  });
  assert.deepEqual(await readFile(destination), sentinel);assert.deepEqual(await readdir(dirname(destination)), before);
  await writeFile(source, original);
  const packaged = await packageIndependentCompiler({artifact: input, outputRoot: output});
  assert.deepEqual(await readFile(destination), original);
  assert.equal((await readdir(dirname(destination))).some(name => name.includes('.copy-')), false);
  for (const record of packaged.manifest.files) {
    const bytes = await readFile(resolve(output, record.path));
    assert.equal(bytes.length, record.bytes);assert.equal(sha(bytes), record.sha256);
  }
}, 120000);

test('the distributable preserves every emitted compiler file, source identity and session provenance without a seed runtime', async () => {
  assert.equal(manifest.format, 'eliscript-compiler-package');assert.equal(manifest.version, 1);
  assert.equal(manifest.host, 'javascript');assert.equal(artifact.host, 'javascript');
  assert.equal(manifest.capabilities.seedRuntimeDependency, false);assert.equal(manifest.capabilities.externalCompilerBackend, false);
  assert.deepEqual(manifest.capabilities.environments, ['node', 'bun', 'browser']);
  assert.deepEqual(manifest.sourceIdentity, artifact.sourceIdentity);assert.deepEqual(manifest.artifactIdentity, artifact.artifactIdentity);
  for (const name of ['sourceIdentity', 'artifactIdentity', 'productIdentity', 'provenance']) assert.deepEqual(artifact[name], originalArtifact[name], name);
  assert.deepEqual(manifest.provenance, artifact.provenance);assert.equal(artifact.provenance.mode, 'session');
  assert.equal(artifact.provenance.producerHost, 'javascript');assert.equal(artifact.provenance.runtimeCompiled, true);
  const sources = await loadCompilerSources();
  const ids = sources.modules.map(record => record.id).sort();
  assert.deepEqual([...artifact.provenance.compiledModuleIds].sort(), ids);
  assert.deepEqual(artifact.modules.map(record => record.id).sort(), ids);
  assert.deepEqual(artifact.sourceIdentity.modules.map(record => record.id).sort(), ids);
  for (const record of manifest.files) {
    portable(record.path);
    const path = resolve(installed, record.path), data = await readFile(path);
    assert.equal((await lstat(path)).isFile(), true);assert.equal(data.length, record.bytes, record.path);
    assert.equal(sha(data), record.sha256, record.path);
  }
  assert.equal(new Set(manifest.files.map(record => record.path)).size, manifest.files.length);
  assert(manifest.files.some(record => record.path === 'transport/backends/compiler-metadata.mjs'));
  for (const record of artifact.artifactIdentity.files) {
    portable(record.path);
    const data = await readFile(resolve(installed, dirname(manifest.artifact), record.path));
    assert.equal(data.length, record.bytes, record.path);assert.equal(sha(data), record.sha256, record.path);
  }
  assert.deepEqual(independentCompilerProductIdentity({host: artifact.host, files: artifact.artifactIdentity.files}), artifact.productIdentity);
  assert.equal(sha(Buffer.from(await readFile(resolve(installed, manifest.runtime), 'utf8'), 'utf16le')), artifact.sourceIdentity.runtime.sha256);
  for (const path of [manifest.artifact, manifest.loader, manifest.worker, manifest.browser, manifest.runtime, artifact.path, artifact.runtimePath]) portable(path);
  for (const record of artifact.modules) {portable(record.path);if (record.sourceMapPath) portable(record.sourceMapPath);}
  for (const field of ['directory', 'url', 'metadataPath', 'load']) assert.equal(Object.hasOwn(artifact, field), false);
  async function walk(path) {
    for (const entry of await readdir(path, {withFileTypes: true})) {
      assert.equal(entry.isSymbolicLink(), false, entry.name);
      assert(!['seed', 'node_modules', 'compiler.el', 'eliscript-seed'].includes(entry.name), entry.name);
      if (entry.isDirectory()) await walk(resolve(path, entry.name));
    }
  }
  await walk(installed);
});

const runPackage = String.raw`
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const {openCompilerPackage}=await import('./installed/compiler-loader.mjs');
const compiler=await openCompilerPackage();
try {
  assert.equal(compiler.host,'javascript');
  const capabilities=await compiler.request({operation:'capabilities'});
  for(const name of ['compile','compile-ir','runtime','project'])assert(capabilities.operations.includes(name));
  const source='(defun add (a b) (+ a b)) (export add)';
  const compiled=await compiler.request({operation:'compile',source,filename:'sum.eli',sourceMap:{generatedFile:'sum.mjs',sourceName:'sum.eli'}});
  assert.equal(compiled.filename,'sum.eli');
  assert.equal((await import('data:text/javascript;base64,'+Buffer.from(compiled.javascript).toString('base64'))).add(19,23),42);
  assert.equal(JSON.parse(compiled.sourceMap).sources[0],'sum.eli');
  let diagnostic;
  try{await compiler.request({operation:'compile',source:'(defun broken () missing)',filename:'broken.eli'});}catch(error){diagnostic=error.eliscriptDiagnostic;assert.equal(error.name,'Error');}
  assert.equal(diagnostic.code,'ELI-A0001');assert.equal(diagnostic.location.file,'broken.eli');
  assert.match(diagnostic.message,/unbound symbol: missing/);
  const project=await compiler.request({operation:'project',target:'javascript',entry:'main.mjs',resolveImports:true,modules:[
    {id:'library.mjs',filename:'library.eli',source:'(defun twice (x) (* x 2)) (export twice)'},
    {id:'main.mjs',filename:'main.eli',source:'(import "./library.eli" twice) (defun run () (twice 21)) (export run)'}
  ]});
  assert.equal(project.target,'javascript');assert.deepEqual(project.modules.map(x=>x.id).sort(),['library.mjs','main.mjs']);
  for(const record of project.modules){const path=resolve('executed',record.id);await mkdir(dirname(path),{recursive:true});await writeFile(path,record.javascript);}
  assert.equal((await import(pathToFileURL(resolve('executed/main.mjs')).href)).run(),42);
  await compiler.loadRuntime();
  const runtimeSource=await readFile(new URL('./installed/'+compiler.manifest.runtime,import.meta.url),'utf8');
  const first=await compiler.request({operation:'runtime',source:runtimeSource,filename:'bootstrap/runtime/memory.eli'});
  assert.equal(first.ready,true);assert.equal(first.filename,'bootstrap/runtime/memory.eli');
  await compiler.loadRuntime();
  const second=await compiler.request({operation:'runtime',source:runtimeSource,filename:'bootstrap/runtime/memory.eli'});
  assert.deepEqual(second,first);
  const recovered=await compiler.request({operation:'compile',source,filename:'recovered.eli'});assert.equal(typeof recovered.javascript,'string');
  process.stdout.write(JSON.stringify({host:compiler.host,executed:42,modules:project.modules.length,diagnostic:diagnostic.code,runtimeReady:first.ready,revision:first.revision,provenance:compiler.artifact.provenance.mode})+'\n');
} finally {await compiler.close();}
await compiler.close();
await assert.rejects(()=>compiler.request({operation:'capabilities'}),/closed/);
`;
for (const engine of ['bun', 'node']) {
  test('the relocated compiler package executes compile/project/diagnostic/runtime APIs in ' + engine, async () => {
    const script = resolve(directory, 'run-package-' + engine + '.mjs');
    await writeFile(script, runPackage);
    const child = spawnSync(engine === 'bun' ? process.execPath : 'node', [script], {
      cwd: directory, encoding: 'utf8', timeout: 120000,
      env: {...process.env, ELISCRIPT_HOME: resolve(directory, 'absent-seed'), EMACS: resolve(directory, 'absent-emacs'), NODE_PATH: ''},
    });
    assert.equal(child.error, undefined);assert.equal(child.status, 0, child.stderr + child.stdout);
    const evidence = JSON.parse(child.stdout.trim());
    assert.equal(evidence.executed, 42);assert.equal(evidence.modules, 2);assert.equal(evidence.diagnostic, 'ELI-A0001');
    assert.equal(evidence.runtimeReady, true);assert.equal(evidence.provenance, 'session');
  }, 120000);

  test('the public compiler CLI compiles files and authorized projects and reports original diagnostics with ' + engine, async () => {
    const work = resolve(directory, 'cli-' + engine), sourceRoot = resolve(work, 'source');
    await mkdir(sourceRoot, {recursive: true});
    const source = resolve(sourceRoot, 'main.eli'), library = resolve(sourceRoot, 'library.eli');
    await writeFile(source, '(import "./library.eli" twice) (defun run () (twice 21)) (export run)');
    await writeFile(library, '(defun twice (x) (* x 2)) (export twice)');
    const single = resolve(work, 'single.eli'), singleOutput = resolve(work, 'single.mjs');
    await writeFile(single, '(defun add (a b) (+ a b)) (export add)');
    const command = resolve(import.meta.dir, '../bin/eliscript-compiler');
    const metadata = resolve(installed, manifest.artifact);
    const env = {...process.env, BUN: engine === 'bun' ? process.execPath : 'node',
      ELISCRIPT_HOME: resolve(directory, 'absent-seed'), EMACS: resolve(directory, 'absent-emacs'), NODE_PATH: ''};
    function cli(args) {
      const child = spawnSync(command, [...args, '--compiler-artifact', metadata], {cwd: work, encoding: 'utf8', timeout: 120000, env});
      assert.equal(child.error, undefined);return child;
    }
    const compiled = cli(['compile', '--input', single, '--target', 'javascript', '--source-map', '--output', singleOutput]);
    assert.equal(compiled.status, 0, compiled.stderr + compiled.stdout);
    assert.equal(JSON.parse(await readFile(singleOutput + '.map', 'utf8')).sources[0], single);
    const output = resolve(work, 'project');
    const project = cli(['compile', '--project', 'main.eli', '--root', sourceRoot, '--target', 'javascript', '--source-map', '--output', output]);
    assert.equal(project.status, 0, project.stderr + project.stdout);
    const saved = JSON.parse(await readFile(resolve(output, 'eliscript-project.json'), 'utf8'));
    assert.equal(saved.entry, 'main.mjs');assert.deepEqual(saved.modules.map(record => record.id).sort(), ['library.mjs', 'main.mjs']);
    for (const record of saved.modules) assert.equal(JSON.parse(await readFile(resolve(output, record.sourceMapPath), 'utf8')).sources.length, 1);
    const execute = spawnSync(engine === 'bun' ? process.execPath : 'node', ['--input-type=module', '--eval',
      'import assert from "node:assert/strict";const single=await import(' + JSON.stringify(pathToFileURL(singleOutput).href) + ');const project=await import(' + JSON.stringify(pathToFileURL(resolve(output, 'main.mjs')).href) + ');assert.equal(single.add(19,23),42);assert.equal(project.run(),42);'], {
      cwd: work, encoding: 'utf8', timeout: 120000, env,
    });
    assert.equal(execute.error, undefined);assert.equal(execute.status, 0, execute.stderr + execute.stdout);
    const invalid = resolve(work, 'broken.eli');await writeFile(invalid, '(defun broken () missing)');
    const failure = cli(['compile', '--input', invalid, '--output', resolve(work, 'broken.mjs')]);
    assert.notEqual(failure.status, 0);assert(failure.stderr.includes(invalid));
    assert.equal(failure.stderr.split(/\r?\n/)[0], 'Error: ' + invalid + ':1:18: unbound symbol: missing');
  }, 120000);
}

test('public Node and Bun compiler builds honor the selected source root and retain requested complete debug files', async () => {
  const started = Date.now(), sources = await loadCompilerSources();
  const sourceRoot = resolve(directory, 'cli-build-sources');
  const selected = 'bootstrap/compiler/reader.eli';
  for (const record of [...sources.modules, sources.runtime, ...sources.literalSources]) {
    const path = resolve(sourceRoot, record.filename);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, record.source + (record.filename === selected ? '\n; Selected CLI build source root.\n' : ''));
  }
  const selectedBytes = await readFile(resolve(sourceRoot, selected), 'utf8');
  const expectedHash = sha(Buffer.from(selectedBytes, 'utf16le'));
  assert.notEqual(expectedHash, artifact.sourceIdentity.modules.find(record => record.filename === selected).sha256);
  const metadata = resolve(installed, manifest.artifact);
  let firstIdentity;
  for (const engine of ['node', 'bun']) {
    const executable = engine === 'bun' ? process.execPath : 'node';
    function cli(args) {
      const remaining = 120000 - (Date.now() - started);assert(remaining > 0);
      const child = spawnSync(executable, [...(engine === 'bun' ? ['--smol'] : []),
        resolve('tools/backends/compiler-cli.mjs'), ...args, '--json-errors'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: remaining, killSignal: 'SIGKILL', maxBuffer: 512 * 1024,
        env: {...process.env, EMACS: resolve(directory, 'absent-emacs'), ELISCRIPT_HOME: resolve(directory, 'absent-seed'), NODE_PATH: ''},
      });
      assert.equal(child.error, undefined);assert.equal(child.signal, null);return child;
    }
    const output = resolve(directory, 'cli-build-' + engine);
    const built = cli(['build', '--producer-artifact', metadata, '--host', 'javascript',
      '--profile', 'full-runtime', '--root', sourceRoot, '--debug', '--output', output]);
    assert.equal(built.status, 0, built.stderr);
    const path = built.stdout.trim(), saved = await readCompilerMetadata(path);
    assert.equal(saved.debugEnabled, true);assert.equal(saved.host, 'javascript');
    assert.equal(saved.provenance.mode, 'session');assert.equal(saved.provenance.producerHost, 'javascript');
    assert.deepEqual(saved.provenance.compiledModuleIds, sources.modules.map(record => record.id));
    assert.equal(saved.sourceIdentity.modules.find(record => record.filename === selected).sha256, expectedHash);
    if (firstIdentity === undefined) firstIdentity = saved.productIdentity;
    else assert.deepEqual(saved.productIdentity, firstIdentity, 'the same source/debug build must have identical Node and Bun file identities');
    for (const record of saved.modules) {
      const map = JSON.parse(await readFile(resolve(dirname(path), record.sourceMapPath), 'utf8'));
      assert.equal(map.version, 3);assert.equal(map.sources.length, 1);
      assert(Array.isArray(JSON.parse(await readFile(resolve(dirname(path), record.macroOriginsPath), 'utf8'))));
    }
    const compiler = await openCompilerArtifact({...saved, directory: dirname(path)});
    try {
      const result = await compiler.request({operation: 'compile', source: '(defun run () -0.0) (export run)', filename: 'cli-built.eli'});
      assert(Object.is((await import('data:text/javascript;base64,' + Buffer.from(result.javascript).toString('base64'))).run(), -0));
    } finally {await compiler.close();}
    const missing = cli(['build', '--producer-artifact', metadata, '--host', 'javascript',
      '--root', resolve(directory, 'absent-build-sources'), '--output', output + '-missing']);
    assert.notEqual(missing.status, 0);
    assert.match(JSON.parse(missing.stderr).error.message, /ENOENT|no such file/i);
  }
  assert(Date.now() - started <= 120000);
}, 120000);

test('public Node and Bun CLI save packed binary requests with exact sidecars and executable signed-zero results', async () => {
  const metadata = resolve(installed, manifest.artifact), nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
  const producer = await openCompilerArtifact({...artifact, directory: dirname(metadata)});
  try {
    const source = '(import "eliscript:memory32" f64-literal store-f64) (defun zero64 (p) (store-f64 p (f64-literal -0.0))) (export zero64)';
    const ir = (await producer.request({operation: 'compile-ir', source, filename: 'packed-cli-memory.eli'})).ir;
    for (const target of ['wasm', 'native']) {
      const base = {operation: 'emit-memory-ir', ir, target, nativeTarget, nativeFormat: 'library',
        memory: {initialPages: 1, maximumPages: 2}, debug: true};
      const expected = await producer.request(base);
      const requestPath = resolve(directory, 'packed-' + target + '.json');
      await writeCompilerMetadata(requestPath, {...base, binaryEncoding: 'u16le-chunks'});
      for (const engine of ['bun', 'node']) {
        const path = resolve(directory, engine + '-packed.' + (target === 'wasm' ? 'wasm' : nativeTarget === 'arm64-linux' ? 'so' : 'dylib'));
        const child = spawnSync(engine === 'bun' ? process.execPath : 'node',
          [resolve('tools/backends/compiler-cli.mjs'), 'request', '--compiler-artifact', metadata,
            '--request', requestPath, '--output', path, '--json-errors'],
          {cwd: process.cwd(), encoding: 'utf8', timeout: 30000, env: {...process.env, BUN: process.execPath}});
        assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr);
        const bytes = new Uint8Array(await readFile(path));
        assert.deepEqual(bytes, decodeCompilerBinary(expected.bytes));
        const sidecar = await readCompilerMetadata(path + '.json');
        assert.equal(sidecar.abi, 'memory-u32');assert.equal(sidecar.target, target);
        assert.deepEqual(sidecar.typed, expected.typed);
        assert.deepEqual(await readCompilerMetadata(path + '.debug.json'), expected.debug);
        if (target === 'wasm') {
          const module = new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module), []);
          const runtime = new WebAssembly.Instance(module).exports;runtime.zero64(8);
          assert(Object.is(new DataView(runtime.memory.buffer).getFloat64(8, true), -0));
        } else if (process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform)) {
          const runtime = await openNativeMemory(path, {zero64: 1}, {...base.memory, nativeTarget});
          try {runtime.invoke('zero64', 8);assert(Object.is(new DataView(runtime.read(8, 8).buffer).getFloat64(0, true), -0));}
          finally {runtime.close();}
        }
      }
    }
  } finally {await producer.close();}
}, 120000);

let wasmPackageLoading;
function packagedWasm() {
  return wasmPackageLoading ??= (async () => {
    const started = Date.now();
    try {
      const result = packageFixtureChild('wasm-debug-package', `
    const directory = ${JSON.stringify(directory)};
    const sourceArtifactPath = ${JSON.stringify(resolve(installed, manifest.artifact))};
    const input = {...await readCompilerMetadata(sourceArtifactPath), directory: dirname(sourceArtifactPath)};
    const verified = await openCompilerArtifact(input);await verified.close();
    const driver = await import(pathToFileURL(resolve(input.directory, input.path)).href);
    let observations = 0;
    const collectionPhases = new Set(['managed-lower-complete', 'wasm-emit-complete', 'project-complete', 'debug-file-complete']);
    const observe = (phase, counts) => {
      if (observations++ >= 64) return;
      // Full compiler graphs create large short-lived host objects. Reclaim
      // completed phases within the original RSS budget and case deadline;
      // managed roots, caches, source inputs and delivered IR stay untouched.
      const collected = collectionPhases.delete(phase);
      if (collected) Bun.gc(true);
      const {rss, heapUsed, heapTotal} = process.memoryUsage();
      console.error('[wasm-package-build]', JSON.stringify({phase, ...counts, collected, rss, heapUsed, heapTotal}));
    };
    // Keep the verified producer and original request/close exports. Only its
    // private state observes fixed build boundaries; nothing enters the wire.
    const producer = await createCompilerSession({host: 'javascript', options: {auto: input.auto}, compiler: {
      ...driver,
      compiler_session_new() {
        const state = driver.compiler_session_new();state.phaseObserver = observe;return state;
      },
    }});
    try {
      const emitted = await buildIndependentCompiler({host: 'wasm', session: producer,
        outputRoot: resolve(directory, 'wasm-compiler'), profile: 'full-runtime', retainIR: false, debug: true, onPhase: observe});
      const packaged = await packageIndependentCompiler({artifact: emitted, outputRoot: resolve(directory, 'wasm-package')});
      process.stdout.write(JSON.stringify({format: 'eliscript-package-fixture', version: 1, kind: 'wasm-debug-package',
        packageDirectory: packaged.directory, artifactDirectory: packaged.artifactDirectory, manifestPath: packaged.manifestPath}) + '\\n');
    } finally {await producer.close();}
`, started);
      // The build VM has exited. Load only the real saved package metadata
      // here; its frontend caches and emitted typed graph have no parent owner.
      const packaged = {directory: result.packageDirectory, artifactDirectory: result.artifactDirectory,
        manifestPath: result.manifestPath, manifest: JSON.parse(await readFile(result.manifestPath, 'utf8'))};
      const metadata = await readCompilerMetadata(resolve(packaged.directory, packaged.manifest.artifact));
      const {openCompilerPackage} = await import(pathToFileURL(resolve(packaged.directory, packaged.manifest.loader)).href);
      assert(Date.now() - started <= 120000, 'the original complete WASM package fixture deadline remains 120 seconds');
      return {...packaged, metadata, openCompilerPackage};
    } catch (error) {
      await Promise.allSettled(['wasm-compiler', 'wasm-package'].map(name => rm(resolve(directory, name), {recursive: true, force: true})));
      throw error;
    }
  })();
}
function deferredResource() {
  let resolveReady, release;
  const ready = new Promise(resolve => {resolveReady = resolve;});
  const waiting = new Promise(resolve => {release = resolve;});
  return {ready, release, async wait() {resolveReady();await waiting;}};
}
async function packageFetchFixture(overrides = {}) {
  const pack = await packagedWasm(), counts = new Map();
  const resources = new Map();
  resources.set('/compiler-package.json', Buffer.from(JSON.stringify(pack.manifest)));
  for (const record of pack.manifest.files) resources.set('/' + record.path, await readFile(resolve(pack.directory, record.path)));
  const fetchResource = async url => {
    const path = new URL(url).pathname;
    counts.set(path, (counts.get(path) ?? 0) + 1);
    if (overrides[path]) return overrides[path](resources.get(path), counts.get(path));
    const bytes = resources.get(path);
    return new Response(bytes ?? 'not found', {status: bytes ? 200 : 404});
  };
  return {...pack, resources, counts, fetchResource, manifestURL: new URL('https://compiler-package.invalid/compiler-package.json')};
}

let streamedMetadataLoading;
function streamedMetadataFixture() {
  return streamedMetadataLoading ??= (async () => {
    // These small sidecars point to the original real JS compiler files.
    // No compiler generation, executable replacement or package tree copy.
    const payload = {text: 'x'.repeat(65523) + '中😀\ud800\\\n' + 'é中😀'.repeat(20000),
      zero: -0, values: [null, true, false, -0, Number.MIN_VALUE], nested: {key: '原😀\udfff'}};
    const debug = {format: 'eliscript-debug-map', version: 1, target: 'wasm', offsetBase: 'module',
      ranges: [], functions: [], sections: [], trapSites: [], payload};
    const metadata = {...artifact, debugPath: 'streamed-package-debug.json', transportFixture: payload};
    const artifactPath = dirname(manifest.artifact) + '/streamed-package-artifact.json';
    const debugPath = dirname(manifest.artifact) + '/' + metadata.debugPath;
    await writeCompilerMetadata(resolve(installed, artifactPath), metadata);
    await writeCompilerMetadata(resolve(installed, debugPath), debug);
    const metadataBytes = await readFile(resolve(installed, artifactPath)), debugBytes = await readFile(resolve(installed, debugPath));
    const supplied = {...manifest, artifact: artifactPath, transportFixture: payload,
      files: [...manifest.files, {path: artifactPath, bytes: metadataBytes.length, sha256: sha(metadataBytes)},
        {path: debugPath, bytes: debugBytes.length, sha256: sha(debugBytes)}]};
    const manifestPath = resolve(installed, 'streamed-package-manifest.json');
    await writeCompilerMetadata(manifestPath, supplied);
    const manifestBytes = await readFile(manifestPath);
    const {openCompilerPackage} = await import(pathToFileURL(resolve(installed, manifest.loader)).href);
    return {payload, debug, metadata, supplied, artifactPath, debugPath, manifestPath, manifestBytes, metadataBytes, debugBytes, openCompilerPackage};
  })();
}

function metadataBodyResponse(bytes, trace, {failRead = false, reason, failCancel = false, failRelease = false, cleanup} = {}) {
  let position = 0;
  const stream = new ReadableStream({pull(controller) {
    if (position === bytes.length) {controller.close();return;}
    // Deliberately split UTF8 scalars and JSON escapes across transport reads.
    const end = Math.min(position + (position === 0 ? 1 : 4093), bytes.length);
    controller.enqueue(bytes.subarray(position, end));position = end;
  }});
  return {ok: true, status: 200,
    arrayBuffer() {trace.arrayBuffers++;throw Error('metadata must use its actual streaming body');},
    body: {getReader() {
      trace.readers++;const reader = stream.getReader();
      return {
        read() {trace.reads++;return failRead && trace.reads === 2 ? Promise.reject(reason) : reader.read();},
        async cancel(error) {trace.cancelled++;trace.reason = error;await reader.cancel(error);if (failCancel) throw cleanup;},
        releaseLock() {trace.released++;reader.releaseLock();if (failRelease) throw cleanup;},
      };
    }},
  };
}

// A source-observer implements only the session transport. It does not
// compile programs or stand in for the complete compiler tests above/below.
// All three products execute the same small Eliscript source, emitted by the
// already built real frontend/backends; no second full compiler is generated.
const sourceObserverProgram = `(module package.source-observer
 (defun compiler_session_new () (js-object :runtime nil :calls 0))
 (defun compiler_session_close (state) (put state :runtime nil) t)
 (defun compiler_session_request (state text)
  (let ((request (JSON/parse text)))
   (cond
    ((= (get request :operation) "runtime")
     (put state :calls (1+ (get state :calls))) (put state :runtime request)
     (JSON/stringify (js-object :ready t :revision (get state :calls))))
    ((= (get request :operation) "inspect") (JSON/stringify (get state :runtime)))
    ((= (get request :operation) "summary")
     (JSON/stringify (js-object :calls (get state :calls)
       :units (if (Object/is (get state :runtime) nil) 0 (get (get (get state :runtime) :source) :length)))))
    (t (JSON/stringify (js-object :calls (get state :calls)))))))
 (export compiler_session_new compiler_session_request compiler_session_close))`;
let sourceObserverProducts;
function observerProducts() {
  return sourceObserverProducts ??= (async () => {
    const base = resolve(installed, dirname(manifest.artifact));
    const load = id => {
      const record = artifact.modules.find(record => record.id === id);assert(record, id);
      return import(pathToFileURL(resolve(base, record.path)).href);
    };
    const compiler = await load('bootstrap/compiler.mjs'), wasm = await load('backends/wasm.mjs');
    const managed = await load('backends/managed.mjs');
    const program = compiler.compile_ir_string(sourceObserverProgram, 'package-source-observer.eli');
    const runtimeText = decodeCompilerSourceAsset(await readFile(resolve(base, artifact.runtimePath)), artifact.runtimeEncoding);
    const runtime = compiler.compile_ir_string(runtimeText, 'runtime.eli');
    const lowered = managed.lower_managed_program(program, runtime, true);
    const bytes = Uint8Array.from(wasm.append_metadata_section(
      wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 128}),
      'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
    let native;
    if (nativeExecutable) {
      const backend = await load('backends/native.mjs');
      const target = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
      native = {target, bytes: Uint8Array.from(backend.emit_typed_native_memory_library(lowered.typed, target))};
    }
    return {javascript: compiler.emit_ir_string(program), bytes, lowered, native};
  })();
}
const sourceObserverPackages = new Map();
function sourceObserverPackage(host, encoding = 'json-utf16') {
  const key = host + '/' + encoding;
  if (!sourceObserverPackages.has(key)) sourceObserverPackages.set(key, (async () => {
    const products = await observerProducts();
    const runtime = encoding === 'utf8' ? '\ufeff; ' + 'x'.repeat(65530) + '😀中\r\n(module source.asset)'
      : '\ufeff; ' + 'x'.repeat(encoding === 'pressure' ? 12 * 1024 * 1024 : 65525) + '\ud800😀\udfff\r\n(module source.asset)';
    const literal = '\ufeff; ' + 'é'.repeat(4093) + '😀\ud800\udfff\ud800X\udfff\0\r\n(module source.literal)';
    const literalSources = [
      {id: 'stdlib/bit.mjs', filename: 'stdlib/bit.eli', source: literal},
      {id: 'stdlib/value.mjs', filename: 'stdlib/value.eli', source: JSON.stringify(literal)},
    ];
    const sources = {entry: 'host/compiler-session.mjs', modules: [
      {id: 'host/compiler-session.mjs', filename: 'package-source-observer.eli', source: sourceObserverProgram}],
      runtime: {filename: 'bootstrap/runtime/memory.eli', source: runtime}, literalSources};
    const producer = {host: 'javascript', async request(request) {
      if (request.operation === 'capabilities') return {};
      if (request.operation === 'runtime') {assert.equal(request.source, runtime);return {ready: true, revision: 1};}
      assert.equal(request.operation, 'project');assert.equal(request.target, host);
      assert.equal(request.modules[0].source, sourceObserverProgram);
      if (host === 'javascript') return {target: host, modules: [{id: sources.entry, javascript: products.javascript}]};
      return {target: host, bytes: host === 'wasm' ? products.bytes : products.native.bytes,
        descriptor: products.lowered.descriptor, ...(host === 'native' ? {typed: products.lowered.typed} : {})};
    }};
    const output = resolve(directory, 'source-observer-' + host + '-' + encoding);
    const emitted = await buildIndependentCompiler({host, sources, session: producer, outputRoot: resolve(output, 'artifact'),
      profile: 'small', budget: {maxSlots: 2048, initialBytes: 65536, maxBytes: 4194304},
      memory: {initialPages: 1, maximumPages: 128}, auto: 1, retainIR: false, debug: false,
      ...(host === 'native' ? {nativeTarget: products.native.target} : {})});
    const packaged = await packageIndependentCompiler({artifact: emitted, outputRoot: resolve(output, 'package')});
    const saved = await readCompilerMetadata(resolve(packaged.directory, packaged.manifest.artifact));
    // Both literal declarations intentionally consume identical bytes through
    // two encodings. Their source identities already describe those two
    // distinct strings; only the redundant file URL is shared here.
    assert.equal(saved.literalSources[0].encoding, 'json-utf16', 'isolated halves require a JSON source asset');
    assert.equal(saved.literalSources[1].encoding, undefined, 'the JSON spelling itself is valid UTF8 text');
    saved.literalSources[1].path = saved.literalSources[0].path;
    await writeCompilerMetadata(resolve(packaged.directory, packaged.manifest.artifact), saved);
    const changed = await readFile(resolve(packaged.directory, packaged.manifest.artifact));
    Object.assign(packaged.manifest.files.find(record => record.path === packaged.manifest.artifact),
      {bytes: changed.length, sha256: sha(changed)});
    await writeCompilerMetadata(packaged.manifestPath, packaged.manifest);
    const {openCompilerPackage} = await import(pathToFileURL(resolve(packaged.directory, packaged.manifest.loader)).href);
    const assets = {host: saved.host, path: saved.path, runtimePath: saved.runtimePath,
      runtimeEncoding: saved.runtimeEncoding, literalSources: saved.literalSources};
    return {...packaged, saved: assets, runtime, literalSources, openCompilerPackage};
  })());
  return sourceObserverPackages.get(key);
}
function sourceResponse(bytes, trace, configuration) {return metadataBodyResponse(bytes, trace, configuration);}
function exactSourceRecords(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < expected.length; index++) {
    const {source, ...record} = actual[index], {source: wanted, ...declaration} = expected[index];
    assert.deepEqual(record, declaration);assert.equal(typeof source, 'string');
    // Preserve complete code-unit equality without formatting two complete
    // source graphs when one unit differs.
    if (source !== wanted) {
      let at = 0;
      while (at < source.length && at < wanted.length && source.charCodeAt(at) === wanted.charCodeAt(at)) at++;
      assert.fail(`source ${index}: firstMismatch UTF16=${at}; lengths=${source.length}/${wanted.length}; ` +
        `actual=${JSON.stringify(source.slice(Math.max(0, at - 20), at + 40))}; expected=${JSON.stringify(wanted.slice(Math.max(0, at - 20), at + 40))}`);
    }
  }
}
async function observerHTTP(pack, overrides = {}) {
  const counts = new Map(), traces = new Map();
  const paths = new Map(pack.manifest.files.map(record => ['/' + record.path, resolve(pack.directory, record.path)]));
  paths.set('/compiler-package.json', pack.manifestPath);
  const fetchResource = async url => {
    const path = new URL(url).pathname;counts.set(path, (counts.get(path) ?? 0) + 1);
    assert(paths.has(path), path);
    const bytes = await readFile(paths.get(path)), trace = {readers: 0, reads: 0, cancelled: 0, released: 0, arrayBuffers: 0};
    const records = traces.get(path) ?? [];records.push(trace);traces.set(path, records);
    if (overrides[path]) return overrides[path](bytes, trace, counts.get(path));
    // The executable image still needs one complete array. All source and
    // metadata paths use real reader bodies and forbid their full-array API.
    if (path === '/' + dirname(pack.manifest.artifact) + '/' + pack.saved.path) return new Response(bytes);
    return sourceResponse(bytes, trace);
  };
  return {counts, traces, fetchResource, manifestURL: new URL('https://source-observer.invalid/compiler-package.json')};
}

test('small real JS package source loading preserves BOM astral boundaries and isolated JSON UTF16 through file streams and two encodings of one URL', async () => {
  for (const encoding of ['utf8', 'json-utf16']) {
    const pack = await sourceObserverPackage('javascript', encoding);
    const OriginalDecoder = globalThis.TextDecoder, sizes = [];let compiler;
    try {
      globalThis.TextDecoder = class extends OriginalDecoder {
        decode(input, settings) {if (input !== undefined) {sizes.push(input.byteLength);assert(input.byteLength <= 65536);}return super.decode(input, settings);}
      };
      compiler = await pack.openCompilerPackage();
      // Public metadata is mutable. Its later mutation cannot change the
      // already captured URL/encoding/identity of a source resource.
      compiler.artifact.runtimeEncoding = encoding === 'utf8' ? 'json-utf16' : 'utf8';
      compiler.artifact.runtimePath = 'not-the-captured-runtime.eli';
      compiler.artifact.literalSources[0].encoding = 'utf8';
      await Promise.all([compiler.loadRuntime(), compiler.loadRuntime()]);
      const observed = await compiler.request({operation: 'inspect'});
      assert.equal(observed.source, pack.runtime);exactSourceRecords(observed.literalSources, pack.literalSources);
      assert.equal(observed.source.charCodeAt(0), 0xfeff);
      assert.deepEqual(await compiler.request({operation: 'summary'}), {calls: 1, units: pack.runtime.length});
      await compiler.loadRuntime();assert.deepEqual(await compiler.request({operation: 'summary'}), {calls: 1, units: pack.runtime.length});
      assert(sizes.includes(65536));
    } finally {globalThis.TextDecoder = OriginalDecoder;await compiler?.close();}
  }
}, 120000);

test('small actual WASM source streams preserve identity-before-decode UTF8-before-JSON and invalid-encoding precedence without refetching decoded failures', async () => {
  const pack = await sourceObserverPackage('wasm');
  const runtimePath = '/' + dirname(pack.manifest.artifact) + '/' + pack.saved.runtimePath;
  const metadataPath = '/' + pack.manifest.artifact;
  for (const mode of ['hash-and-utf8', 'bytes-and-utf8', 'utf8-after-json', 'json', 'non-string', 'encoding-and-utf8']) {
    const supplied = structuredClone(pack.manifest);
    const metadata = await readCompilerMetadata(resolve(pack.directory, pack.manifest.artifact));
    let corrupted;
    if (mode === 'utf8-after-json') corrupted = Buffer.from([63, 32, 0xff]);
    else if (mode === 'json') corrupted = Buffer.from('"unfinished');
    else if (mode === 'non-string') corrupted = Buffer.from('{}');
    else if (mode === 'encoding-and-utf8') {corrupted = Buffer.from([0xff]);metadata.runtimeEncoding = 'unsupported-source-encoding';}
    else {
      corrupted = await readFile(resolve(pack.directory, '.' + runtimePath));corrupted = Buffer.from(corrupted);
      corrupted[0] = 0xff;if (mode === 'bytes-and-utf8') corrupted = corrupted.subarray(1);
    }
    if (!mode.startsWith('hash-') && !mode.startsWith('bytes-'))
      Object.assign(supplied.files.find(record => '/' + record.path === runtimePath), {bytes: corrupted.length, sha256: sha(corrupted)});
    const metadataBytes = Buffer.from(encodeCompilerIR(metadata));
    Object.assign(supplied.files.find(record => '/' + record.path === metadataPath), {bytes: metadataBytes.length, sha256: sha(metadataBytes)});
    const fixture = await observerHTTP(pack, {
      '/compiler-package.json': (_, trace) => sourceResponse(Buffer.from(encodeCompilerIR(supplied)), trace),
      [metadataPath]: (_, trace) => sourceResponse(metadataBytes, trace),
      [runtimePath]: (_, trace) => sourceResponse(corrupted, trace),
    });
    const compiler = await pack.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource});
    try {
      const failure = error => {
        if (mode === 'hash-and-utf8') assert.match(error.message, /SHA-256 mismatch/);
        else if (mode === 'bytes-and-utf8') assert.match(error.message, /byte count mismatch/);
        else if (mode === 'json') assert(error instanceof SyntaxError);
        else if (mode === 'encoding-and-utf8') {assert(error instanceof TypeError);assert.match(error.message, /unsupported compiler source asset encoding/);}
        else assert(error instanceof TypeError, mode + ': fatal UTF8 or a non-string JSON source is a TypeError');
        return true;
      };
      await assert.rejects(() => compiler.loadRuntime(), failure);
      const consumed = fixture.counts.get(runtimePath);assert.equal(consumed, 1);
      if (!mode.startsWith('hash-') && !mode.startsWith('bytes-')) {
        await assert.rejects(() => compiler.loadRuntime(), failure);
        assert.equal(fixture.counts.get(runtimePath), 1, 'verified malformed source bytes have the original no-refetch behavior');
      }
      assert.equal((await compiler.request({operation: 'summary'})).calls, 0, 'invalid assets never reach the source driver');
      for (const trace of fixture.traces.get(runtimePath)) {assert.equal(trace.readers, 1);assert.equal(trace.arrayBuffers, 0);assert.equal(trace.released, 1);}
    } finally {await compiler.close();}
  }
}, 120000);

test('small source downloads retry original read failures share concurrent readers support legacy fallback and reject use after close', async () => {
  const pack = await sourceObserverPackage('wasm'), gate = deferredResource();
  const runtimePath = '/' + dirname(pack.manifest.artifact) + '/' + pack.saved.runtimePath;
  const literalPath = '/' + dirname(pack.manifest.artifact) + '/' + pack.saved.literalSources[0].path;
  const primary = {originalSourceRead: true}, cleanup = {laterSourceCleanup: true};
  const fixture = await observerHTTP(pack, {[runtimePath]: async (bytes, trace, attempt) => {
    if (attempt === 1) return sourceResponse(bytes, trace, {failRead: true, reason: primary, failCancel: true, failRelease: true, cleanup});
    await gate.wait();return sourceResponse(bytes, trace);
  }});
  const compiler = await pack.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource});
  try {
    await assert.rejects(() => compiler.loadRuntime(), error => error === primary);
    const failed = fixture.traces.get(runtimePath)[0];assert.equal(failed.cancelled, 1);assert.equal(failed.released, 1);assert.strictEqual(failed.reason, primary);
    const first = compiler.loadRuntime(), second = compiler.loadRuntime();await gate.ready;
    assert.equal(fixture.counts.get(runtimePath), 2);gate.release();await Promise.all([first, second]);
    assert.equal(fixture.counts.get(runtimePath), 2);assert.equal(fixture.counts.get(literalPath), 1);
    assert.equal((await compiler.request({operation: 'summary'})).calls, 1);
  } finally {gate.release();await compiler.close();}
  const legacy = await observerHTTP(pack, Object.fromEntries([runtimePath, literalPath].map(path => [path, (bytes, trace) => ({
    ok: true, status: 200, body: null, async arrayBuffer() {trace.arrayBuffers++;return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);},
  })])));
  const oldAdapter = await pack.openCompilerPackage({manifestURL: legacy.manifestURL, fetch: legacy.fetchResource});
  try {
    await oldAdapter.loadRuntime();const observed = await oldAdapter.request({operation: 'inspect'});
    assert.equal(observed.source, pack.runtime);exactSourceRecords(observed.literalSources, pack.literalSources);
    for (const path of [runtimePath, literalPath]) {assert.equal(legacy.counts.get(path), 1);assert.equal(legacy.traces.get(path)[0].arrayBuffers, 1);}
  } finally {await oldAdapter.close();}
  const closing = deferredResource(), closeFixture = await observerHTTP(pack, {[runtimePath]: async (bytes, trace) => {
    await closing.wait();return sourceResponse(bytes, trace);
  }});
  const closed = await pack.openCompilerPackage({manifestURL: closeFixture.manifestURL, fetch: closeFixture.fetchResource});
  try {
    const pending = closed.loadRuntime(), rejection = assert.rejects(pending, /compiler package is closed/);
    await closing.ready;assert.equal(closed.close(), closed.close());
    await assert.rejects(() => closed.loadRuntime(), /compiler package is closed/);
    closing.release();await rejection;assert.equal(closeFixture.counts.get(runtimePath), 1);
    await assert.rejects(() => closed.request({operation: 'inspect'}), /compiler package is closed/);
  } finally {closing.release();await closed.close();}
}, 120000);

test('small actual WASM HTTP package streams source chunks once per URL with strict UTF16 dual decoding and reader cleanup', async () => {
  const pack = await sourceObserverPackage('wasm'), fixture = await observerHTTP(pack);
  const compiler = await pack.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource,
    options: {maxSlots: 2048, initialBytes: 65536, maxBytes: 4194304, auto: 1}});
  try {
    await Promise.all([compiler.loadRuntime(), compiler.loadRuntime(), compiler.loadRuntime()]);
    const observed = await compiler.request({operation: 'inspect'});
    assert.equal(observed.source, pack.runtime);exactSourceRecords(observed.literalSources, pack.literalSources);
    for (const path of [pack.saved.runtimePath, pack.saved.literalSources[0].path]) {
      const url = '/' + dirname(pack.manifest.artifact) + '/' + path;
      assert.equal(fixture.counts.get(url), 1);const [trace] = fixture.traces.get(url);
      assert.equal(trace.readers, 1);assert.equal(trace.arrayBuffers, 0);assert.equal(trace.released, 1);assert.equal(trace.cancelled, 0);
    }
    await compiler.loadRuntime();assert.deepEqual(await compiler.request({operation: 'summary'}), {calls: 1, units: pack.runtime.length});
  } finally {await compiler.close();}
}, 120000);

const sourceLoaderLifetimeChild = String.raw`
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {setImmediate} from 'node:timers/promises';
const [path,mode,sizeText]=process.argv.slice(1),size=Number(sizeText);
assert.equal(process.versions.bun,undefined);assert.equal(typeof globalThis.gc,'function');
const {openCompilerPackage}=await import(pathToFileURL(path).href);
const Original=WebAssembly.Module;let image;
if(mode==='wasm')WebAssembly.Module=new Proxy(Original,{construct(target,args,newTarget){
 if(args[0] instanceof Uint8Array)image=new WeakRef(args[0]);
 return Reflect.construct(target,args,newTarget);
}});
globalThis.gc();const before=process.memoryUsage().arrayBuffers;let compiler;
try{
 compiler=await openCompilerPackage({options:{debug:false}});
 WebAssembly.Module=Original;
 if(mode==='source'){
  await compiler.loadRuntime();
  assert.deepEqual(await compiler.request({operation:'summary'}),{calls:1,units:size});
 }else assert.equal((await compiler.request({operation:'summary'})).calls,0);
 // The asynchronous turns allow weak references from completed setup frames
 // to leave their keep-alive job. They do not alter any request deadline.
 for(let round=0;round<4;round++){await setImmediate();globalThis.gc();}
 const retained=process.memoryUsage().arrayBuffers-before;
 if(mode==='wasm'){
  assert(image,'the actual executable must pass through WebAssembly.Module');
  assert.equal(image.deref(),undefined,'the package/session must release its consumed input image view');
 }else{
  const limit=mode==='source'?8*1024*1024:Math.max(512*1024,Math.floor(size/2));
  assert(retained<limit,JSON.stringify({mode,retained,limit,size}));
 }
 process.stdout.write(JSON.stringify({mode,retained,size,closed:false})+'\n');
}finally{WebAssembly.Module=Original;await compiler?.close();}
await assert.rejects(()=>compiler.request({operation:'summary'}),/closed/);
`;
test('small real package loaders retain decoded sources and executable state without retaining their consumed whole-byte buffers in a bounded Node process', async () => {
  const started = Date.now();
  const pressure = await sourceObserverPackage('javascript', 'pressure'), wasm = await sourceObserverPackage('wasm');
  const cases = [
    {pack: pressure, mode: 'source', size: pressure.runtime.length},
    {pack: wasm, mode: 'wasm', size: wasm.manifest.files.find(record => record.path === dirname(wasm.manifest.artifact) + '/' + wasm.saved.path).bytes},
  ];
  if (nativeExecutable) {
    const native = await sourceObserverPackage('native');
    const identity = native.manifest.files.find(record => record.path === dirname(native.manifest.artifact) + '/' + native.saved.path);
    cases.push({pack: native, mode: 'native', size: identity.bytes});
  }
  try {
    for (const {pack, mode, size} of cases) {
      const remaining = 120000 - (Date.now() - started);assert(remaining > 0);
      const child = spawnSync('node', ['--max-old-space-size=768', '--expose-gc', '--input-type=module', '--eval',
        sourceLoaderLifetimeChild, resolve(pack.directory, pack.manifest.loader), mode, String(size)], {
        cwd: directory, encoding: 'utf8', timeout: remaining, killSignal: 'SIGKILL', maxBuffer: 65536,
        env: {...process.env, BUN: process.execPath},
      });
      assert.equal(child.error, undefined, mode);assert.equal(child.signal, null, mode);
      assert.equal(child.status, 0, mode + '\n' + child.stderr + child.stdout);
      const evidence = JSON.parse(child.stdout.trim());assert.equal(evidence.mode, mode);assert.equal(evidence.size, size);
    }
  } finally {
    // Only paths/small asset declarations remain for these loader fixtures.
    // Do not carry their producer IR or the pressure string into the original
    // complete-compiler package cases later in this file.
    sourceObserverProducts = undefined;sourceObserverPackages.delete('javascript/pressure');
  }
}, 120000);

test('real JS package file metadata and default debug retain complete streamed Unicode and IEEE values', async () => {
  const fixture = await streamedMetadataFixture();
  const codec = await import(pathToFileURL(resolve(installed, 'transport/backends/compiler-metadata.mjs')).href);
  const factory = codec.createCompilerMetadataDecoder, documents = [];
  const spy = spyOn(codec, 'createCompilerMetadataDecoder').mockImplementation(() => {
    const parser = factory();return {write: text => parser.write(text), finish() {const value = parser.finish();documents.push(value);return value;}};
  });
  const OriginalDecoder = globalThis.TextDecoder, sizes = [];let compiler;
  try {
    globalThis.TextDecoder = class extends OriginalDecoder {
      decode(input, options) {if (input !== undefined) sizes.push(input.byteLength);return super.decode(input, options);}
    };
    compiler = await fixture.openCompilerPackage({manifestURL: pathToFileURL(fixture.manifestPath)});
    assert.deepEqual(compiler.manifest, fixture.supplied);assert.deepEqual(compiler.artifact, fixture.metadata);
    assert.deepEqual(documents.find(value => value.format === 'eliscript-debug-map'), fixture.debug);
    assert(Object.is(compiler.artifact.transportFixture.zero, -0));
    assert(sizes.filter(size => size === 65536).length >= 3);assert(sizes.every(size => size <= 65536));
    const result = await compiler.request({operation: 'compile', source: '(defun run () -0.0) (export run)', filename: 'streamed-package.eli'});
    assert(Object.is((await import('data:text/javascript;base64,' + Buffer.from(result.javascript).toString('base64'))).run(), -0));
  } finally {
    globalThis.TextDecoder = OriginalDecoder;spy.mockClear();spy.mockRestore();documents.length = 0;
    await compiler?.close();
  }
}, 120000);

test('streamed package HTTP metadata preserves identity decode and read errors through failing reader cleanup', async () => {
  const fixture = await streamedMetadataFixture(), manifestURL = new URL('https://streamed-package.invalid/compiler-package.json');
  for (const path of ['/compiler-package.json', '/' + fixture.artifactPath, '/' + fixture.debugPath]) {
    for (const failure of ['same-size', 'truncated', 'malformed', 'utf8', 'read', 'release']) {
      const supplied = structuredClone(fixture.supplied), resources = new Map([
        ['/' + fixture.artifactPath, fixture.metadataBytes], ['/' + fixture.debugPath, fixture.debugBytes],
      ]);
      let bytes = path === '/compiler-package.json' ? fixture.manifestBytes : resources.get(path);
      if (failure === 'same-size') {bytes = Buffer.from(bytes);bytes[0] = 120;}
      else if (failure === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
      else if (failure === 'malformed' || failure === 'utf8') {
        bytes = failure === 'malformed' ? Buffer.from('{"unfinished":') : Buffer.from([123,34,120,34,58,34,0xc3,34,125]);
        if (path !== '/compiler-package.json') Object.assign(supplied.files.find(record => '/' + record.path === path),
          {bytes: bytes.length, sha256: sha(bytes)});
      }
      if (path !== '/compiler-package.json') resources.set(path, bytes);
      const rootBytes = path === '/compiler-package.json' ? bytes : Buffer.from(encodeCompilerIR(supplied) + '\n');
      resources.set('/compiler-package.json', rootBytes);
      // Pin the unmodified root when testing tampering; malformed matching
      // identities instead reach the real incremental UTF8/JSON decoder.
      const identityBytes = path === '/compiler-package.json' && ['same-size', 'truncated'].includes(failure)
        ? fixture.manifestBytes : rootBytes;
      const primary = {read: true}, cleanup = {cleanup: true}, traces = new Map(), fetched = [];
      const fetchResource = async url => {
        const resource = new URL(url).pathname;fetched.push(resource);
        assert(resources.has(resource), 'a metadata failure must precede executable loading');
        const trace = {readers: 0, reads: 0, cancelled: 0, released: 0, arrayBuffers: 0};traces.set(resource, trace);
        return metadataBodyResponse(resources.get(resource), trace, resource === path ? {
          failRead: failure === 'read', reason: primary, failCancel: true, failRelease: true, cleanup,
        } : {});
      };
      let threw = false;
      try {await fixture.openCompilerPackage({manifestURL, fetch: fetchResource,
        manifestIdentity: {bytes: identityBytes.length, sha256: sha(identityBytes)}});}
      catch (error) {
        threw = true;
        if (failure === 'same-size') assert.match(error.message, /SHA-256 mismatch/);
        else if (failure === 'truncated') assert.match(error.message, /byte count mismatch/);
        else if (failure === 'malformed' || failure === 'utf8') assert(error instanceof SyntaxError || error instanceof TypeError);
        else assert.strictEqual(error, failure === 'read' ? primary : cleanup);
      }
      assert(threw);assert.equal(fetched.at(-1), path);
      for (const trace of traces.values()) {assert.equal(trace.readers, 1);assert.equal(trace.arrayBuffers, 0);assert.equal(trace.released, 1);}
      const trace = traces.get(path);
      if (failure !== 'release') {assert.equal(trace.cancelled, 1);assert.notStrictEqual(trace.reason, cleanup);}
    }
  }
  // A new open after failed streams retains the original real compiler and
  // sidecar values; no failed decoder/cache or locked reader is reusable.
  const recovered = await fixture.openCompilerPackage({manifestURL: pathToFileURL(fixture.manifestPath)});
  try {assert.deepEqual(recovered.artifact, fixture.metadata);assert.equal(recovered.host, 'javascript');}
  finally {await recovered.close();}
}, 120000);

test('genuine shared WASM package retries streamed HTTP metadata and loads complete default debug without arrayBuffer metadata copies', async () => {
  const pack = await packagedWasm(), metadataPaths = new Set(['/compiler-package.json', '/' + pack.manifest.artifact,
    '/' + dirname(pack.manifest.artifact) + '/' + pack.metadata.debugPath]);
  const manifestURL = new URL('https://streamed-wasm-package.invalid/compiler-package.json');
  const primary = {firstRead: true}, cleanup = {laterCleanup: true};let first = true;
  const counts = new Map(), traces = [];
  const fetchResource = async url => {
    const path = new URL(url).pathname;counts.set(path, (counts.get(path) ?? 0) + 1);
    if (path === '/compiler-package.json' && first) {
      first = false;const trace = {readers: 0, reads: 0, cancelled: 0, released: 0, arrayBuffers: 0};traces.push(trace);
      return metadataBodyResponse(Buffer.from(JSON.stringify(pack.manifest)), trace,
        {failRead: true, reason: primary, failCancel: true, failRelease: true, cleanup});
    }
    const file = path === '/compiler-package.json' ? pack.manifestPath : resolve(pack.directory, '.' + path);
    const response = new Response(Readable.toWeb(createReadStream(file, {highWaterMark: 65536})));
    if (metadataPaths.has(path)) response.arrayBuffer = () => {throw Error('complete metadata must stream');};
    return response;
  };
  let threw = false;
  try {await pack.openCompilerPackage({manifestURL, fetch: fetchResource});}
  catch (error) {threw = true;assert.strictEqual(error, primary);}
  assert(threw);assert.equal(traces[0].cancelled, 1);assert.equal(traces[0].released, 1);
  const compiler = await pack.openCompilerPackage({manifestURL, fetch: fetchResource});
  try {
    assert.equal(compiler.host, 'wasm');assert.deepEqual(compiler.manifest, pack.manifest);assert.deepEqual(compiler.artifact, pack.metadata);
    const capabilities = await compiler.request({operation: 'capabilities'});
    assert.deepEqual(capabilities.targets, ['javascript', 'wasm', 'native']);
    const result = await compiler.request({operation: 'compile', source: '(defun run () -0.0) (export run)', filename: 'streamed-http.eli'});
    assert(Object.is((await import('data:text/javascript;base64,' + Buffer.from(result.javascript).toString('base64'))).run(), -0));
    assert.equal(counts.get('/compiler-package.json'), 2);
    for (const path of [...metadataPaths].slice(1)) assert.equal(counts.get(path), 1);
  } finally {await compiler.close();}
}, 120000);

test('package consumption rejects altered metadata, debug and actual WASM bytes before parsing or instantiation', async () => {
  const pack = await packagedWasm();
  const paths = [pack.manifest.artifact,
    dirname(pack.manifest.artifact) + '/' + pack.metadata.path,
    dirname(pack.manifest.artifact) + '/' + pack.metadata.debugPath];
  assert.equal(typeof pack.metadata.debugPath, 'string');
  for (const path of paths) {
    for (const corruption of ['same-size', 'truncated']) {
      const fixture = await packageFetchFixture({['/' + path]: bytes => {
        const changed = Buffer.from(bytes);
        if (corruption === 'same-size') changed[0] ^= 1;
        return new Response(corruption === 'truncated' ? changed.subarray(1) : changed);
      }});
      await assert.rejects(() => fixture.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource}),
        corruption === 'same-size' ? /SHA-256 mismatch/ : /byte count mismatch/);
      assert.equal(fixture.counts.get('/' + path), 1);
      if (path === pack.manifest.artifact) assert.equal(fixture.counts.has('/artifact/' + pack.metadata.path), false);
    }
  }
  const fixture = await packageFetchFixture();
  const rootBytes = fixture.resources.get('/compiler-package.json');
  await assert.rejects(() => fixture.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource,
    manifestIdentity: {bytes: rootBytes.length, sha256: '0'.repeat(64)}}), /SHA-256 mismatch/);
  assert.equal(fixture.counts.has('/' + fixture.manifest.artifact), false);
}, 120000);

test('a genuine WASM package verifies runtime before use, retries failed downloads and shares one concurrent runtime load', async () => {
  const gate = deferredResource();let attempt = 0;
  const fixture = await packageFetchFixture({'/artifact/runtime.eli': async bytes => {
    attempt++;
    if (attempt === 1) {const changed = Buffer.from(bytes);changed[0] ^= 1;return new Response(changed);}
    await gate.wait();return new Response(bytes);
  }});
  const compiler = await fixture.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource});
  try {
    assert.equal(compiler.host, 'wasm');
    await assert.rejects(() => compiler.loadRuntime(), /SHA-256 mismatch/);
    const request = {operation: 'project', target: 'wasm', entry: 'main.mjs', modules: [
      {id: 'main.mjs', filename: 'concurrent-project.eli', source: '(defun run () 42) (export run)'},
    ]};
    const first = compiler.request(request), second = compiler.request(request);
    await gate.ready;
    assert.equal(fixture.counts.get('/artifact/runtime.eli'), 2);
    gate.release();
    for (const result of await Promise.all([first, second])) {
      assert.equal(result.target, 'wasm');
      const bytes = Uint8Array.from(result.bytes);
      assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
      const runtime = instantiateManagedRuntime(bytes);
      try {
        const answer = runtime.invoke('run');
        try {assert.equal(runtime.readNumber(answer), 42);} finally {runtime.release(answer);}
      } finally {try {runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);} finally {runtime.close();}}
    }
    await compiler.loadRuntime();assert.equal(fixture.counts.get('/artifact/runtime.eli'), 2);
    const runtime = fixture.resources.get('/artifact/runtime.eli').toString('utf8');
    const ready = await compiler.request({operation: 'runtime', source: runtime, filename: 'bootstrap/runtime/memory.eli'});
    assert.equal(ready.ready, true);assert.equal(ready.revision, 1);
    const result = await compiler.request({operation: 'compile', source: '(defun run () 42) (export run)', filename: 'verified.eli'});
    assert.equal((await import('data:text/javascript;base64,' + Buffer.from(result.javascript).toString('base64'))).run(), 42);
    for (const path of ['/' + fixture.manifest.artifact, '/artifact/' + fixture.metadata.path, '/artifact/' + fixture.metadata.debugPath]) {
      assert.equal(fixture.counts.get(path), 1, path);
    }
  } finally {gate.release();await compiler.close();}
}, 120000);

test('package runtime HTTP failures allow retry and closing during download prevents subsequent session use', async () => {
  const gate = deferredResource();let attempt = 0;
  const fixture = await packageFetchFixture({'/artifact/runtime.eli': async bytes => {
    attempt++;if (attempt === 1) return new Response('unavailable', {status: 503});
    await gate.wait();return new Response(bytes);
  }});
  const compiler = await fixture.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource});
  try {
    await assert.rejects(() => compiler.loadRuntime(), /503/);
    const pending = compiler.loadRuntime();
    // Install the rejection handler before deliberately closing its session.
    const rejected = assert.rejects(pending, /compiler package is closed/);
    await gate.ready;
    assert.equal(compiler.close(), compiler.close());
    await assert.rejects(() => compiler.loadRuntime(), /compiler package is closed/);
    await assert.rejects(() => compiler.request({operation: 'capabilities'}), /compiler package is closed/);
    gate.release();await rejected;
    assert.equal(fixture.counts.get('/artifact/runtime.eli'), 2);
    assert.equal(compiler.close(), undefined);
  } finally {gate.release();await compiler.close();}
}, 120000);

test('an explicit runtime request wins a concurrent default download without replacing its session state', async () => {
  const gate = deferredResource();
  const fixture = await packageFetchFixture({'/artifact/runtime.eli': async bytes => {await gate.wait();return new Response(bytes);}});
  const compiler = await fixture.openCompilerPackage({manifestURL: fixture.manifestURL, fetch: fixture.fetchResource});
  try {
    const pending = compiler.loadRuntime();await gate.ready;
    const source = fixture.resources.get('/artifact/runtime.eli').toString('utf8');
    const explicit = await compiler.request({operation: 'runtime', source, filename: 'explicit-runtime.eli'});
    assert.equal(explicit.revision, 1);gate.release();await pending;
    const repeated = await compiler.request({operation: 'runtime', source, filename: 'explicit-runtime.eli'});
    assert.equal(repeated.revision, 1);
    await compiler.loadRuntime();assert.equal(fixture.counts.get('/artifact/runtime.eli'), 1);
  } finally {gate.release();await compiler.close();}
}, 120000);

test('package close disposes the real JavaScript driver once and preserves its original cleanup failure', async () => {
  const destination = resolve(directory, 'close-failure-package');await cp(installed, destination, {recursive: true});
  const packageManifest = structuredClone(manifest);
  const entry = resolve(destination, dirname(packageManifest.artifact), artifact.path);
  const original = await readFile(entry);
  await writeFile(resolve(dirname(entry), 'real-session-delegate.mjs'), original);
  const wrapper = `import * as driver from './real-session-delegate.mjs';\nexport * from './real-session-delegate.mjs';\nexport const closeFailure=new Error('original real-driver cleanup failure');\nexport let closedCount=0;\nexport function compiler_session_close(state){closedCount++;driver.compiler_session_close(state);throw closeFailure;}\n`;
  await writeFile(entry, wrapper);
  const entryPath = dirname(packageManifest.artifact) + '/' + artifact.path;
  const identity = packageManifest.files.find(record => record.path === entryPath);
  assert(identity);identity.bytes = Buffer.byteLength(wrapper);identity.sha256 = sha(Buffer.from(wrapper));
  await writeFile(resolve(destination, 'compiler-package.json'), JSON.stringify(packageManifest));
  const {openCompilerPackage} = await import(pathToFileURL(resolve(destination, packageManifest.loader)).href);
  const driver = await import(pathToFileURL(entry).href);
  const compiler = await openCompilerPackage();
  try {
    assert((await compiler.request({operation: 'capabilities'})).operations.includes('compile'));
    assert.throws(() => compiler.close(), error => error === driver.closeFailure);
    assert.throws(() => compiler.close(), error => error === driver.closeFailure);
    assert.equal(driver.closedCount, 1);
    await assert.rejects(() => compiler.loadRuntime(), /closed/);
    await assert.rejects(() => compiler.request({operation: 'capabilities'}), /closed/);
  } finally {
    if (driver.closedCount === 0) assert.throws(() => compiler.close(), error => error === driver.closeFailure);
  }
}, 120000);

const nativeExecutable = process.arch === 'arm64' && ['darwin', 'linux'].includes(process.platform);
const encodedCompilers = new Map();
function encodedCompiler(host) {
  if (!encodedCompilers.has(host)) encodedCompilers.set(host, (async () => {
    const sources = await loadCompilerSources();
    sources.runtime.source = '; runtime code units \uFEFF\ud800😀\r\n' + sources.runtime.source;
    assert(sources.literalSources.length > 0);
    sources.literalSources[0].source = '; library code units \uFEFF\udc00中\r\n' + sources.literalSources[0].source;
    const producer = await openCompilerArtifact({...artifact, directory: resolve(installed, dirname(manifest.artifact))});
    let emitted;
    try {
      emitted = await buildIndependentCompiler({host, session: producer, sources,
        outputRoot: resolve(directory, 'encoded-' + host), profile: 'full-runtime', retainIR: false, debug: true});
    } finally {await producer.close();}
    assert.equal(emitted.provenance.mode, 'session');assert.equal(emitted.provenance.producerHost, 'javascript');
    assert.equal(emitted.runtimeEncoding, 'json-utf16');assert.equal(emitted.literalSources[0].encoding, 'json-utf16');
    assert.deepEqual(emitted.provenance.compiledModuleIds.slice().sort(), sources.modules.map(item => item.id).sort());
    assert.equal(emitted.provenance.runtimeCompiled, true);
    const packaged = await packageIndependentCompiler({artifact: emitted, outputRoot: resolve(directory, 'encoded-package-' + host)});
    const relocated = resolve(directory, 'relocated', host);await mkdir(dirname(relocated), {recursive: true});
    await cp(packaged.directory, relocated, {recursive: true, dereference: false});
    // Consume the moved copy, rather than letting a remaining original package
    // path accidentally satisfy an absolute import or source asset reference.
    await rm(packaged.directory, {recursive: true, force: true});
    const movedManifest = JSON.parse(await readFile(resolve(relocated, 'compiler-package.json'), 'utf8'));
    const movedArtifact = await readCompilerMetadata(resolve(relocated, movedManifest.artifact));
    for (const key of ['sourceIdentity', 'artifactIdentity', 'productIdentity', 'provenance']) {
      assert.deepEqual(movedArtifact[key], emitted[key], key);
    }
    const expected = resolve(directory, 'encoded-' + host + '-sources.json');
    await writeFile(expected, JSON.stringify({runtime: sources.runtime, literal: sources.literalSources[0]}));
    return {emitted, relocated, movedManifest, movedArtifact, expected};
  })());
  return encodedCompilers.get(host);
}

// The host process stays Node or Bun independently of the compiler artifact's
// host. A native Node session uses the production FFI transport, never a JS
// compiler or a replacement Bun execution of this host program.
const runEncodedCompiler = String.raw`
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [mode,path,expectedPath,bootstrapURL,codecURL]=process.argv.slice(2);
const expected=JSON.parse(await readFile(expectedPath,'utf8'));
const {decodeCompilerSourceAsset}=await import(mode==='original'?codecURL:new URL('./transport/backends/compiler-session.mjs',pathToFileURL(path)).href);
let compiler,metadata;
if(mode==='original'){
  const {readCompilerMetadata}=await import(new URL('./compiler-metadata.mjs',codecURL).href);
  metadata=await readCompilerMetadata(path);
  compiler=await (await import(bootstrapURL)).openCompilerArtifact({...metadata,directory:dirname(path),metadataPath:path});
}else{
  compiler=await (await import(pathToFileURL(path).href)).openCompilerPackage();metadata=compiler.artifact;
}
function file(asset){return mode==='original'?resolve(dirname(path),asset):resolve(dirname(path),'artifact',asset);}
const runtime=decodeCompilerSourceAsset(await readFile(file(metadata.runtimePath)),metadata.runtimeEncoding);
const literal=metadata.literalSources.find(item=>item.id===expected.literal.id);
assert(literal);assert.equal(decodeCompilerSourceAsset(await readFile(file(literal.path)),literal.encoding),expected.literal.source);
assert.equal(runtime,expected.runtime.source);
const failures=[];
const errorData=error=>({name:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic,frames:error.eliscriptFrames,sourceFrames:error.eliscriptSourceFrames});
const capture=async request=>{try{return {result:await compiler.request(request)};}catch(error){failures.push({error,snapshot:structuredClone(errorData(error))});return {error:{name:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic}};}};
try{
  assert.equal(compiler.host,metadata.host);
  const capabilities=await compiler.request({operation:'capabilities'});
  for(const op of ['runtime','compile','project','cached-ir'])assert(capabilities.operations.includes(op));
  if(mode==='original')assert.equal((await compiler.request({operation:'runtime'})).revision,1);
  else await compiler.loadRuntime();
  const ready=await compiler.request({operation:'runtime',source:runtime,filename:expected.runtime.filename});
  assert.equal(ready.ready,true);assert.equal(ready.revision,1);
  const retained=await compiler.request({operation:'cached-ir',kind:'literal',id:literal.id,revision:ready.literalRevision});
  const direct=await compiler.request({operation:'compile-ir',source:expected.literal.source,filename:expected.literal.filename});
  assert.equal(retained.ir,direct.ir);
  const source='; 中😀é\r\n(defun add (a b) (+ a b)) (export add)',filename='unicode-source.eli';
  const compiled=await compiler.request({operation:'compile',source,filename,sourceMap:{generatedFile:'unicode.mjs',sourceName:filename}});
  const map=JSON.parse(compiled.sourceMap);assert.deepEqual(map.sources,[filename]);assert.deepEqual(map.sourcesContent,[source]);
  const outputPath=resolve(dirname(expectedPath),mode+'-'+metadata.host+'-'+process.versions.node+'-unicode.mjs');
  await writeFile(outputPath,compiled.javascript);assert.equal((await import(pathToFileURL(outputPath).href)).add(19,23),42);
  const broken='; 😀é\r\n(defun broken () missing)';
  const original=await capture({operation:'compile',source:broken,filename:'broken-runtime.eli'});
  assert(original.error);assert.equal(original.error.diagnostic.code,'ELI-A0001');
  assert.equal(original.error.diagnostic.location.start.line,2);assert.equal(original.error.diagnostic.location.start.column,18);
  assert.equal(original.error.diagnostic.location.start.offset,Array.from(broken.slice(0,broken.indexOf('missing'))).length);
  const failed=await capture({operation:'runtime',source:broken,filename:'broken-runtime.eli'});
  assert.deepEqual(failed.error,original.error);
  for(const source of [undefined,null]){
    const missing=await capture({operation:'runtime',source,filename:'explicit-missing-runtime.eli'});
    assert(missing.error,'an explicitly supplied non-string source must not load the default asset');
  }
  assert.deepEqual(await compiler.request({operation:'runtime',source:runtime,filename:expected.runtime.filename}),ready);
  assert.deepEqual(await compiler.request({operation:'cached-ir',kind:'literal',id:literal.id,revision:ready.literalRevision}),retained);
  // BOM is retained even when the language reader diagnoses it. Compare the
  // exact direct request, not a silently BOM-stripped substitute program.
  const bomSource='\uFEFF'+broken,bomFilename='bom-runtime.eli';
  const bom=await capture({operation:'compile',source:bomSource,filename:bomFilename});
  assert(bom.error);assert.equal(bom.error.diagnostic.location.file,bomFilename);
  assert.deepEqual((await capture({operation:'runtime',source:bomSource,filename:bomFilename})).error,bom.error);
  const controller=new AbortController(),reason=new Error('cancelled real compiler request');controller.abort(reason);
  await assert.rejects(async()=>compiler.request({operation:'compile',source,filename},{signal:controller.signal}),error=>error===reason);
  const recovered=await compiler.request({operation:'compile',source,filename,sourceMap:{generatedFile:'unicode.mjs',sourceName:filename}});
  assert.deepEqual(recovered,compiled);
  const product=await compiler.request({operation:'project',target:'javascript',resolveImports:true,entry:'main.mjs',modules:[
    {id:'library.mjs',filename:'library.eli',source:'(defun twice (x) (* x 2)) (export twice)'},
    {id:'main.mjs',filename:'main.eli',source:'(import "./library.eli" twice) (defun run () (twice 21)) (export run)'}]});
  assert.deepEqual(product.modules.map(item=>item.id).sort(),['library.mjs','main.mjs']);
  process.stdout.write(JSON.stringify({host:compiler.host,sourceIdentity:metadata.sourceIdentity,productIdentity:metadata.productIdentity,
    diagnostic:original.error.diagnostic,revision:ready.revision,javascript:compiled.javascript,sourceMap:compiled.sourceMap})+'\n');
}finally{await compiler.close();await compiler.close();for(const{error,snapshot}of failures)assert.deepEqual(errorData(error),snapshot);}
await assert.rejects(async()=>compiler.request({operation:'capabilities'}),/closed/);
`;

for (const host of ['javascript', 'wasm', 'native']) {
  const targetTest = host === 'native' && !nativeExecutable ? test.skip : test;
  targetTest('complete ' + host + ' compiler JSON-UTF16 sources survive original and relocated package sessions in Node and Bun', async () => {
    const prepared = await encodedCompiler(host);
    const script = resolve(directory, 'encoded-session-' + host + '.mjs');await writeFile(script, runEncodedCompiler);
    const results = [];
    for (const engine of ['bun', 'node']) for (const mode of ['original', 'package']) {
      const path = mode === 'original' ? resolve(prepared.emitted.directory, 'compiler-artifact.json')
        : resolve(prepared.relocated, prepared.movedManifest.loader);
      const child = spawnSync(engine === 'bun' ? process.execPath : 'node', [script, mode, path, prepared.expected,
        pathToFileURL(resolve(import.meta.dir, '../tools/backends/compiler-bootstrap.mjs')).href,
        pathToFileURL(resolve(import.meta.dir, '../tools/backends/compiler-session.mjs')).href], {
        cwd: directory, encoding: 'utf8', timeout: 120000,
        env: {...process.env, BUN: process.execPath, ELISCRIPT_HOME: resolve(directory, 'absent-seed'), EMACS: resolve(directory, 'absent-emacs'), NODE_PATH: ''},
      });
      assert.equal(child.error, undefined, mode + '/' + engine);assert.equal(child.signal, null);
      assert.equal(child.status, 0, mode + '/' + engine + '\n' + child.stderr + child.stdout);
      const outcome = JSON.parse(child.stdout.trim());assert.equal(outcome.host, host);
      assert.deepEqual(outcome.sourceIdentity, prepared.emitted.sourceIdentity);assert.deepEqual(outcome.productIdentity, prepared.emitted.productIdentity);
      results.push(outcome);
    }
    for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  }, 120000);
}

for (const host of ['javascript', 'wasm', 'native']) for (const engine of ['bun', 'node']) {
  const targetTest = host === 'native' && !nativeExecutable ? test.skip : test;
  targetTest('the public ' + engine + ' CLI consumes original and relocated ' + host + ' compilers with exact input bytes and default assets', async () => {
    const prepared = await encodedCompiler(host);
    const work = resolve(directory, 'encoded-cli-' + host + '-' + engine);await mkdir(work, {recursive: true});
    const command = resolve(import.meta.dir, '../tools/backends/compiler-cli.mjs');
    const cliURL = pathToFileURL(resolve(import.meta.dir, '../tools/backends/compiler-cli.mjs')).href;
    const executable = engine === 'bun' ? process.execPath : 'node';
    // The CLI host and the native FFI worker executable are independent:
    // Node runs main(), while the transport still requires actual Bun.
    const env = {...process.env, BUN: process.execPath, NODE_PATH: '',
      ELISCRIPT_HOME: resolve(directory, 'absent-seed'), EMACS: resolve(directory, 'absent-emacs')};
    const reference = await openCompilerArtifact(prepared.emitted);
    try {
      for (const mode of ['original', 'package']) {
        const metadata = mode === 'original' ? resolve(prepared.emitted.directory, 'compiler-artifact.json')
          : resolve(prepared.relocated, prepared.movedManifest.artifact);
        function cli(args, {input, chunks} = {}) {
          args = [...args, '--compiler-artifact', metadata, '--json-errors'];
          const script = chunks === undefined ? undefined :
            'import{Readable}from"node:stream";const{main}=await import(' + JSON.stringify(cliURL) + ');' +
            'Object.defineProperty(process,"stdin",{value:Readable.from(' + JSON.stringify(chunks.map(part => part.toString('hex'))) +
            '.map(hex=>Buffer.from(hex,"hex")))});await main(' + JSON.stringify(args) + ');';
          const child = script === undefined
            ? spawnSync(executable, [command, ...args], {cwd: work, env, input, encoding: 'utf8', timeout: 120000})
            : spawnSync(executable, ['--input-type=module', '--eval', script], {cwd: work, env, encoding: 'utf8', timeout: 120000});
          assert.equal(child.error, undefined);assert.equal(child.signal, null);return child;
        }
        async function originalResult(source, filename) {
          try {return {result: await reference.request({operation: 'compile', source, filename})};}
          catch (error) {return {error};}
        }
        async function checkSource(source, stem) {
          const bytes = Buffer.from(source), file = resolve(work, mode + '-' + stem + '.eli');await writeFile(file, bytes);
          const emoji = bytes.indexOf(Buffer.from('😀'));
          assert(emoji >= 0);
          // The BOM and the astral scalar each span more than one decoder
          // chunk. Readable is a transport source; the real CLI compiles it.
          const chunks = [bytes.subarray(0, 1), bytes.subarray(1, emoji + 1), bytes.subarray(emoji + 1, emoji + 2), bytes.subarray(emoji + 2)];
          const cases = [
            [cli(['compile', '--input', file, '--target', 'javascript']), file],
            [cli(['compile', '--input', '-', '--target', 'javascript'], {input: bytes}), '<stdin>'],
            [cli(['compile', '--input', '-', '--target', 'javascript'], {chunks}), '<stdin>'],
          ];
          for (const [child, filename] of cases) {
            const expected = await originalResult(source, filename);
            if (expected.error) {
              assert.equal(child.status, 1);assert.equal(child.stdout, '');
              const failure = JSON.parse(child.stderr);assert.equal(failure.format, 'eliscript-compiler-cli-error');assert.equal(failure.version, 1);
              for (const key of ['name', 'message', 'code', 'eliscriptDiagnostic', 'diagnostics', 'macroOrigins'])
                assert.deepEqual(failure.error[key], expected.error[key], mode + '/' + filename + '/' + key);
              assert.equal(failure.error.eliscriptDiagnostic.location.file, filename);
            } else {
              assert.equal(child.status, 0, child.stderr);assert.equal(child.stderr, '');assert.equal(child.stdout, expected.result.javascript);
              assert.equal((await import('data:text/javascript;base64,' + Buffer.from(child.stdout).toString('base64'))).run(), '中😀');
            }
          }
        }
        await checkSource('; 中😀é\r\n(defun run () "中😀") (export run)', 'valid');
        await checkSource('\uFEFF; 中😀é\r\n(defun run () "中😀") (export run)', 'bom');
        await checkSource('; 中😀é\r\n(defun broken () missing)', 'diagnostic');
        for (const [index, invalid] of [
          Buffer.concat([Buffer.from('\uFEFF; 中😀\n'), Buffer.from([0xf0, 0x9f, 0x98])]),
          Buffer.concat([Buffer.from('; 中😀\n'), Buffer.from([0xc0, 0xaf])]),
        ].entries()) {
          const path = resolve(work, mode + '-invalid-' + index + '.eli');await writeFile(path, invalid);
          for (const child of [
            cli(['compile', '--input', path]),
            cli(['compile', '--input', '-'], {input: invalid}),
            cli(['compile', '--input', '-'], {chunks: [invalid.subarray(0, -1), invalid.subarray(-1)]}),
          ]) {
            assert.equal(child.status, 1);assert.equal(child.stdout, '');
            const failure = JSON.parse(child.stderr);assert.equal(failure.format, 'eliscript-compiler-cli-error');
            assert.equal(failure.error.name, 'TypeError');assert.equal(failure.error.eliscriptDiagnostic, undefined);
          }
        }
        const runtimeRequest = resolve(work, mode + '-runtime.json'), readyPath = resolve(work, mode + '-ready.json');
        await writeFile(runtimeRequest, JSON.stringify({operation: 'runtime'}));
        const ready = cli(['request', '--request', runtimeRequest, '--output', readyPath]);
        assert.equal(ready.status, 0, ready.stderr);
        assert.deepEqual(JSON.parse(await readFile(readyPath, 'utf8')), await reference.request({operation: 'runtime'}));
        const sourcePath = resolve(work, mode + '-binary.eli'), output = resolve(work, mode + '-binary.wasm');
        await writeFile(sourcePath, '; 中😀\n(defun run () 42) (export run)');
        const emitted = cli(['compile', '--input', sourcePath, '--target', 'wasm', '--debug', '--output', output]);
        assert.equal(emitted.status, 0, emitted.stderr);assert.equal(emitted.stderr, '');
        const sidecar = JSON.parse(await readFile(output + '.json', 'utf8'));
        assert.equal(sidecar.target, 'wasm');assert(sidecar.descriptor);
        const debug = JSON.parse(await readFile(output + '.debug.json', 'utf8'));
        assert(JSON.stringify(debug).includes(sourcePath), 'debug must retain the actual input filename');
        const runtime = instantiateManagedRuntime(await readFile(output));
        try {
          const answer = runtime.invoke('run');try {assert.equal(runtime.readNumber(answer), 42);} finally {runtime.release(answer);}
          runtime.closeModule();runtime.collect();assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
        } finally {runtime.close();}
        const badRuntime = resolve(work, mode + '-bad-runtime.eli');await writeFile(badRuntime, '(defun broken () missing)');
        const failure = cli(['compile', '--input', sourcePath, '--target', 'wasm', '--runtime', badRuntime, '--output', resolve(work, mode + '-failed.wasm')]);
        assert.equal(failure.status, 1);assert.equal(failure.stdout, '');
        const error = JSON.parse(failure.stderr).error;assert.equal(error.eliscriptDiagnostic.code, 'ELI-A0001');
        assert.equal(error.eliscriptDiagnostic.location.file, 'bootstrap/runtime/memory.eli');
        // The subsequent public invocation must use its declared reversible
        // default runtime asset; no explicit external source or seed is given.
        const recovered = cli(['request', '--request', runtimeRequest, '--output', readyPath]);
        assert.equal(recovered.status, 0, recovered.stderr);
        assert.equal(JSON.parse(await readFile(readyPath, 'utf8')).revision, 1);
      }
    } finally {await reference.close();}
  }, 120000);
}

const requestIRInputs = new Map();
async function requestIRInput(host) {
  if (!requestIRInputs.has(host)) requestIRInputs.set(host, (async () => {
    const prepared = await encodedCompiler(host), session = await openCompilerArtifact(prepared.emitted);
    try {
      const source = '; request code units \uFEFF\ud800中😀\r\n(defun run () -0) (export run)', filename = 'request-single.eli';
      const ir = (await session.request({operation: 'compile-ir', source, filename})).ir;
      const modules = [
        {id: 'library.mjs', filename: 'library.eli', source: '(defun value () -0) (export value)'},
        {id: 'entry.mjs', filename: 'entry.eli', source: '(import "./library.eli" value) (defun run () (value)) (export run)'},
      ];
      for (const module of modules) module.ir = (await session.request({operation: 'compile-ir', source: module.source, filename: module.filename})).ir;
      const rawSource = '(import "eliscript:memory32" load-u32 store-u32 memory-size memory-grow f64-literal store-f64) '+
        '(defun read32 (p) (load-u32 p)) (defun set32 (p v) (store-u32 p v) (load-u32 p)) '+
        '(defun grow (n) (memory-grow n)) (defun size () (memory-size)) '+
        '(defun zero64 (p) (store-f64 p (f64-literal -0.0))) (export read32 set32 grow size zero64)';
      const rawIR = (await session.request({operation: 'compile-ir', source: rawSource, filename: 'request-memory.eli'})).ir;
      const raw = await session.request({operation: 'emit-memory-ir', ir: rawIR, target: 'wasm', memory: {initialPages: 1, maximumPages: 2}, debug: true});
      const typedIR = encodeCompilerIR(raw.typed);
      assert.notEqual(typedIR, JSON.stringify(raw.typed), 'the actual typed request must carry an IEEE negative zero that JSON.stringify would lose');
      assert.equal(raw.abi, 'memory-u32');assert.equal(raw.descriptor, undefined);
      const capabilities = await session.request({operation: 'capabilities'});
      assert.deepEqual(capabilities.memoryIRTargets, ['wasm', 'native']);
      return {prepared, source, filename, ir, modules, rawIR, typedIR};
    } finally {await session.close();}
  })());
  return requestIRInputs.get(host);
}

const executeCLIRequestProduct = String.raw`
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const {encodeCompilerIR}=await import(pathToFileURL(resolve(input.transport,'compiler-session.mjs')).href);
if(input.target==='javascript'){
 const saved=JSON.parse(await readFile(resolve(input.path,'eliscript-project.json'),'utf8'));
 assert.equal(saved.target,'javascript');assert.equal(saved.entry,'entry.mjs');
 assert.deepEqual(saved.modules.map(item=>item.id).sort(),input.modules.map(item=>item.id).sort());
 for(const item of saved.modules){
  const source=input.modules.find(module=>module.id===item.id),map=JSON.parse(await readFile(resolve(input.path,item.sourceMapPath),'utf8'));
  assert.deepEqual(map.sources,[source.filename]);assert.deepEqual(map.sourcesContent,[source.source]);
 }
 assert(Object.is((await import(pathToFileURL(resolve(input.path,saved.entry)).href)).run(),-0));
 process.stdout.write(JSON.stringify({target:input.target,negativeZero:true,modules:saved.modules.length})+'\n');
}else{
 const bytes=new Uint8Array(await readFile(input.path)),sidecar=JSON.parse(await readFile(input.path+'.json','utf8'));
 assert.equal(sidecar.target,input.target);assert.equal(sidecar.debugPath,input.debugName);
 const debug=JSON.parse(await readFile(resolve(dirname(input.path),sidecar.debugPath),'utf8'));
 assert(debug.ranges.some(item=>item.span?.filename===input.filename&&item.end>item.start));
 let runtime,trap,snapshot;
 if(input.raw){
  assert.equal(sidecar.abi,'memory-u32');assert.equal(sidecar.descriptor,undefined);assert(sidecar.typed);
  assert.equal(encodeCompilerIR(sidecar.typed),input.typedIR,'typed sidecar must preserve every original IEEE code unit');
  try{
   if(input.target==='wasm'){
    const module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
    const e=new WebAssembly.Instance(module).exports;
    assert.equal(e.set32(8,0xffffffff)>>>0,0xffffffff);assert.equal(e.read32(8)>>>0,0xffffffff);
    assert.equal(e.zero64(16),0);assert(Object.is(new DataView(e.memory.buffer).getFloat64(16,true),-0));
    assert.throws(()=>e.read32(65533),error=>{trap=error;return error instanceof WebAssembly.RuntimeError;});
    assert.equal(e.grow(1),1);assert.equal(e.size(),2);assert.equal(e.grow(1)>>>0,0xffffffff);assert.equal(e.set32(65536,42),42);
   }else{
    assert.equal(sidecar.nativeTarget,input.nativeTarget);assert.equal(sidecar.nativeFormat,'library');
    const {openNativeMemory}=await import(pathToFileURL(resolve(input.transport,'native-memory.mjs')).href);
    runtime=await openNativeMemory(input.path,{read32:1,set32:2,grow:1,size:0,zero64:1},{initialPages:1,maximumPages:2,nativeTarget:input.nativeTarget,debug,trapSites:debug.trapSites});
    assert.equal(runtime.invoke('set32',8,0xffffffff)>>>0,0xffffffff);assert.equal(runtime.invoke('read32',8)>>>0,0xffffffff);
    assert.equal(runtime.invoke('zero64',16),0);const raw=runtime.read(16,8);assert(Object.is(new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getFloat64(0,true),-0));
    assert.throws(()=>runtime.invoke('read32',65533),error=>{trap=error;return error instanceof WebAssembly.RuntimeError;});
    snapshot=structuredClone({frames:trap.eliscriptFrames,sourceFrames:trap.eliscriptSourceFrames});
    assert.equal(runtime.invoke('grow',1),1);assert.equal(runtime.invoke('size'),2);assert.equal(runtime.invoke('grow',1)>>>0,0xffffffff);assert.equal(runtime.invoke('set32',65536,42),42);
   }
  }finally{runtime?.close();}
  if(snapshot)assert.deepEqual({frames:trap.eliscriptFrames,sourceFrames:trap.eliscriptSourceFrames},snapshot);
  process.stdout.write(JSON.stringify({target:input.target,abi:sidecar.abi,negativeZero:true,trap:trap.name,recovered:42})+'\n');
 }else{
  assert.equal(sidecar.abi,undefined);assert(sidecar.descriptor);
  if(input.target==='wasm'){
   const module=new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
   const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(input.transport,'managed-runtime.mjs')).href);
   runtime=instantiateManagedRuntime(bytes,{debug});
  }else{
   assert(sidecar.typed);assert.equal(sidecar.nativeTarget,input.nativeTarget);assert.equal(sidecar.nativeFormat,'library');
   const {instantiateNativeManagedRuntime}=await import(pathToFileURL(resolve(input.transport,'native-managed-runtime.mjs')).href);
   runtime=await instantiateNativeManagedRuntime(input.path,{typed:sidecar.typed,descriptor:sidecar.descriptor},{...input.memory,nativeTarget:input.nativeTarget,debug});
  }
  try{
   runtime.auto(1);const value=runtime.invoke('run');try{assert(Object.is(runtime.readNumber(value),-0));}finally{runtime.release(value);}
   runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);
  }finally{runtime.close();}
  process.stdout.write(JSON.stringify({target:input.target,negativeZero:true,live:0,frameDepth:0})+'\n');
 }
}
`;

for (const host of ['javascript', 'wasm', 'native']) for (const engine of ['bun', 'node']) {
  const targetTest = host === 'native' && !nativeExecutable ? test.skip : test;
  for (const operation of ['emit-ir', 'project-ir', 'emit-memory-ir', 'emit-typed-memory']) {
    targetTest('Given the original and relocated ' + host + ' compiler When ' + engine + ' CLI request submits ' + operation + ' Then real products sidecars and recovery preserve their ABI', async () => {
      const inputs = await requestIRInput(host), {prepared} = inputs;
      const work = resolve(directory, 'request-cli', host, engine, operation);await mkdir(work, {recursive: true});
      const cli = resolve(import.meta.dir, '../tools/backends/compiler-cli.mjs'), executable = engine === 'bun' ? process.execPath : 'node';
      const nativeTarget = process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos';
      const raw = operation === 'emit-memory-ir' || operation === 'emit-typed-memory';
      const targets = operation === 'project-ir' ? ['javascript', 'wasm', 'native'] : ['wasm', 'native'];
      const env = {...process.env, BUN: process.execPath, NODE_PATH: '',
        ELISCRIPT_HOME: resolve(directory, 'absent-seed'), EMACS: resolve(directory, 'absent-emacs')};
      const runner = resolve(work, 'execute-product.mjs');await writeFile(runner, executeCLIRequestProduct);
      for (const mode of ['original', 'package']) for (const target of targets) {
        const prefix = mode + '-' + target, metadata = mode === 'original' ? resolve(prepared.emitted.directory, 'compiler-artifact.json')
          : resolve(prepared.relocated, prepared.movedManifest.artifact);
        const output = resolve(work, prefix + (target === 'javascript' ? '-project' : target === 'wasm' ? '.wasm' : nativeTarget === 'arm64-linux' ? '.so' : '.dylib'));
        const request = {operation, target, debug: true, nativeTarget, nativeFormat: 'library',
          memory: raw ? {initialPages: 1, maximumPages: 2} : prepared.emitted.memory,
          ...(operation === 'project-ir' ? {entry: 'entry.mjs', modules: inputs.modules, resolveImports: true, sourceMap: true}
            : {ir: raw ? operation === 'emit-typed-memory' ? inputs.typedIR : inputs.rawIR : inputs.ir,
              ...(raw ? {} : {source: inputs.source, filename: inputs.filename})})};
        const path = resolve(work, prefix + '-request.json');await writeFile(path, JSON.stringify(request));
        function run(requestPath, destination, extra = []) {
          const child = spawnSync(executable, [cli, 'request', '--compiler-artifact', metadata,
            '--request', requestPath, '--output', destination, '--json-errors', ...extra], {cwd: work, env, encoding: 'utf8', timeout: 120000});
          assert.equal(child.error, undefined);assert.equal(child.signal, null);return child;
        }
        // Raw output contains its own complete memory ABI and must not try to
        // read even an explicitly supplied managed-runtime filename.
        const emitted = run(path, output, raw ? ['--runtime', resolve(work, 'does-not-exist-runtime.eli')] : []);
        assert.equal(emitted.status, 0, prefix + '\n' + emitted.stderr + emitted.stdout);assert.equal(emitted.stderr, '');
        if (target !== 'javascript') {
          const sidecar = JSON.parse(await readFile(output + '.json', 'utf8'));
          assert.equal(sidecar.target, target);assert.equal(sidecar.debugPath, output.split('/').at(-1) + '.debug.json');
          assert.equal(sidecar.abi, raw ? 'memory-u32' : undefined);
          if (raw) {assert.equal(sidecar.descriptor, undefined);assert.equal(encodeCompilerIR(sidecar.typed), inputs.typedIR);}
          else assert(sidecar.descriptor);
          if (target === 'native') {assert(sidecar.typed);assert.equal(sidecar.nativeTarget, nativeTarget);}
        }
        if (target !== 'native' || nativeExecutable) {
          const executeInput = resolve(work, prefix + '-execute.json');
          await writeFile(executeInput, JSON.stringify({target, path: output, raw, typedIR: inputs.typedIR, nativeTarget,
            memory: prepared.emitted.memory, filename: raw ? 'request-memory.eli' : operation === 'project-ir' ? 'entry.eli' : inputs.filename,
            debugName: output.split('/').at(-1) + '.debug.json', modules: inputs.modules,
            transport: resolve(import.meta.dir, '../tools/backends')}));
          const child = spawnSync(executable, [runner, executeInput], {cwd: work, env, encoding: 'utf8', timeout: 120000});
          assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 0, child.stderr + child.stdout);
          const result = JSON.parse(child.stdout.trim());assert.equal(result.target, target);assert.equal(result.negativeZero, true);
          if (raw) {assert.equal(result.abi, 'memory-u32');assert.equal(result.trap, 'RuntimeError');assert.equal(result.recovered, 42);}
          else if (target !== 'javascript') {assert.equal(result.live, 0);assert.equal(result.frameDepth, 0);}
        }
        const bad = operation === 'project-ir' ? {...request, modules: [inputs.modules[0], inputs.modules[0]]}
          : operation === 'emit-typed-memory' ? {...request, ir: encodeCompilerIR({...JSON.parse(inputs.typedIR), abi: 'invalid-raw-abi'})}
            : {...request, ir: '{'};
        const badPath = resolve(work, prefix + '-invalid-request.json'), badOutput = resolve(work, prefix + '-invalid-product');
        await writeFile(badPath, JSON.stringify(bad));const failure = run(badPath, badOutput);
        assert.equal(failure.status, 1);assert.equal(failure.stdout, '');
        const error = JSON.parse(failure.stderr);assert.equal(error.format, 'eliscript-compiler-cli-error');assert.equal(error.version, 1);
        assert.equal(typeof error.error.message, 'string');await assert.rejects(() => readFile(badOutput), {code: 'ENOENT'});
        if (!raw && target !== 'javascript') {
          const badRuntime = resolve(work, prefix + '-invalid-runtime.eli');await writeFile(badRuntime, '(defun broken () missing)');
          const runtimeFailure = run(path, badOutput, ['--runtime', badRuntime]);assert.equal(runtimeFailure.status, 1);assert.equal(runtimeFailure.stdout, '');
          const diagnostic = JSON.parse(runtimeFailure.stderr).error.eliscriptDiagnostic;
          assert.equal(diagnostic.code, 'ELI-A0001');assert.equal(diagnostic.location.file, 'bootstrap/runtime/memory.eli');
          await assert.rejects(() => readFile(badOutput), {code: 'ENOENT'});
        }
        // A fresh public invocation after either refusal must consume the
        // original authenticated IR file and its default source assets again.
        const recoveredOutput=resolve(work,prefix+'-recovered'+(target==='javascript'?'-project':target==='wasm'?'.wasm':nativeTarget==='arm64-linux'?'.so':'.dylib'));
        const recovered = run(path, recoveredOutput);assert.equal(recovered.status, 0, recovered.stderr);assert.equal(recovered.stderr, '');
        if (target !== 'javascript') {
          assert.deepEqual(await readFile(recoveredOutput),await readFile(output),'recovery must emit a fresh identical binary');
          assert.equal(JSON.parse(await readFile(recoveredOutput + '.json', 'utf8')).target, target);
        }else{
          assert.deepEqual(JSON.parse(await readFile(resolve(recoveredOutput,'eliscript-project.json'),'utf8')),
            JSON.parse(await readFile(resolve(output,'eliscript-project.json'),'utf8')));
          for(const module of inputs.modules)assert.equal(await readFile(resolve(recoveredOutput,module.id),'utf8'),await readFile(resolve(output,module.id),'utf8'));
        }
      }
      if (raw) {
        const bad = {operation, target: 'javascript', ir: operation === 'emit-typed-memory' ? inputs.typedIR : inputs.rawIR};
        const path = resolve(work, 'invalid-javascript-raw.json');await writeFile(path, JSON.stringify(bad));
        const child = spawnSync(executable, [cli, 'request', '--compiler-artifact', resolve(prepared.relocated, prepared.movedManifest.artifact),
          '--request', path, '--output', resolve(work, 'must-not-be-js.mjs'), '--json-errors'], {cwd: work, env, encoding: 'utf8', timeout: 120000});
        assert.equal(child.error, undefined);assert.equal(child.signal, null);assert.equal(child.status, 1);assert.equal(child.stdout, '');
        assert.equal(JSON.parse(child.stderr).format, 'eliscript-compiler-cli-error');
        await assert.rejects(() => readFile(resolve(work, 'must-not-be-js.mjs')), {code: 'ENOENT'});
      }
    }, 120000);
  }
}
