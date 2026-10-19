import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCompilerSources} from './compiler-build.mjs';
import {compilerSourceIdentity} from './compiler-bootstrap.mjs';
import {originalSourceCaseLocators} from './compiler-corpus-managed-cases.mjs';

const sha256 = source => createHash('sha256').update(source).digest('hex');

function replaceOriginal(source, before, after, changes) {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new TypeError('original compiler CLI setup boundary changed');
  }
  changes.push({role: 'selected-compiler-transport', beforeSha256: sha256(before), afterSha256: sha256(after)});
  return source.slice(0, start) + after + source.slice(start + before.length);
}

function region(source, before, after) {
  const start = source.indexOf(before), end = start < 0 ? -1 : source.indexOf(after, start + before.length);
  if (start < 0 || end < 0) throw new TypeError('original CLI helper boundary changed');
  return source.slice(start, end);
}

const forwardingTransport = `
async function __eliscript_install_compiler(source, destination) {
  await __cli_fs.mkdir(destination, {recursive: true});
  for (const name of moduleNames) {
    const path = resolve(source, name + '.mjs');
    await __cli_fs.readFile(path);
    await __cli_fs.writeFile(resolve(destination, name + '.mjs'),
      'export * from ' + JSON.stringify(__cli_url.pathToFileURL(path).href) + ';\\n');
    await __cli_fs.writeFile(resolve(destination, name + '.mjs.map'),
      await __cli_fs.readFile(path + '.map'));
  }
}
`;

function generationsTransport(sourceRoot) {
  return `
import * as __cli_fs from 'node:fs/promises';
import * as __cli_url from 'node:url';
const __cli_manifest_path = process.env.ELISCRIPT_ORIGINAL_COMPILER_GENERATIONS;
if (!__cli_manifest_path) throw new Error('original three-generation CLI requires selected compiler generation artifacts');
const __cli_manifest = JSON.parse(await __cli_fs.readFile(__cli_manifest_path, 'utf8'));
if (__cli_manifest.format !== 'eliscript-original-compiler-generations' || __cli_manifest.version !== 1 ||
    !['javascript', 'wasm', 'native'].includes(__cli_manifest.target) ||
    __cli_manifest.target !== process.env.ELISCRIPT_ORIGINAL_TARGET ||
    !Array.isArray(__cli_manifest.generations) || __cli_manifest.generations.length !== 3) {
  throw new TypeError('original CLI requires three actual generations for the selected target');
}
const __cli_directories = new Map();
const __cli_contexts = [];
try {for (let index = 0; index < 3; index++) {
  const generation = __cli_manifest.generations[index];
  if (generation.generation !== index + 1 || typeof generation.compilerDirectory !== 'string' ||
      typeof generation.javascriptDirectory !== 'string' ||
      !['javascript', 'wasm', 'native'].includes(generation.producerHost) ||
      (index > 0 && generation.producerHost !== __cli_manifest.target)) {
    throw new TypeError('original CLI generation provenance is incomplete');
  }
  if (__cli_manifest.target !== 'javascript') {
    if (typeof generation.context !== 'string') throw new TypeError('binary compiler generation requires its actual runtime context');
    const {openOriginalProgramContext} = await import(${JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-corpus-host-context.mjs')).href)});
    const input = JSON.parse(await __cli_fs.readFile(generation.context, 'utf8'));
    if (input.target !== __cli_manifest.target) throw new Error('compiler generation changed its execution target');
    __cli_contexts.push(await openOriginalProgramContext(input, {identity: generation.context}));
  }
}} catch (error) {
  for (const context of __cli_contexts.reverse()) {
    try {await context.close();} catch { /* Preserve the construction error. */ }
  }
  throw error;
}
${forwardingTransport}
async function __cli_place_generation(index, destination) {
  const generation = __cli_manifest.generations[index];
  if (!generation) throw new Error('original CLI requested an unavailable compiler generation');
  await __eliscript_install_compiler(generation.compilerDirectory, destination);
  __cli_directories.set(resolve(destination), generation);
}
async function __cli_prepare_command(command, options) {
  if (command[0] === buildPath) {
    if (command.length !== 1 || !options?.env?.ELISCRIPT_BOOTSTRAP_OUT_DIR) {
      throw new TypeError('original bootstrap setup command changed');
    }
    await __cli_place_generation(0, options.env.ELISCRIPT_BOOTSTRAP_OUT_DIR);
    return {exitCode: 0, stdout: '', stderr: ''};
  }
  if (command[0] === publicCliPath || command[0] === portableCliPath) {
    const directory = options?.env?.ELISCRIPT_BOOTSTRAP_MODULE_DIR;
    if (typeof directory !== 'string') throw new TypeError('original public compiler command lost its module directory');
    if (!__cli_directories.has(resolve(directory))) {
      // Automatic setup is supplied by the selected compiler construction,
      // rather than invoking the shell script's independent Emacs bootstrap.
      await __cli_place_generation(0, directory);
    }
    const generation = __cli_directories.get(resolve(directory));
    if (generation.context) options.env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT = generation.context;
  }
  return null;
}
`;
}

const runOriginalCases = `
let __cli_failure;
try {
  for (const {name, body, timeout} of __cli_cases) {
    let timer;
    try {
      await Promise.race([Promise.resolve().then(body), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(name + ' exceeded its original ' + timeout + ' ms timeout')), timeout);
      })]);
    } finally {clearTimeout(timer);}
  }
} catch (error) {__cli_failure = error; throw error;}
finally {
  let cleanup;
  for (const context of __cli_contexts.reverse()) {
    try {await context.close();} catch (error) {cleanup ??= error;}
  }
  if (!__cli_failure && cleanup) throw cleanup;
}
`;

// Define executable recipes only. Loading this module neither constructs a
// compiler generation nor invokes an original CLI or independent oracle.
export async function addOriginalCLIPrograms({add, locators, text, file, bootstrapSources, sourceRoot}) {
  if (typeof add !== 'function' || !Array.isArray(locators) || typeof text !== 'function' ||
      typeof file !== 'function' || !Array.isArray(bootstrapSources) || typeof sourceRoot !== 'string') {
    throw new TypeError('original CLI adapter requires source services and its complete compiler manifest');
  }
  const modules = [], names = [], seen = new Set();
  for (const filename of bootstrapSources) {
    if (typeof filename !== 'string' || !/^bootstrap\/compiler\/[a-z][a-z0-9-]*\.eli$/.test(filename) || seen.has(filename)) {
      throw new TypeError('original CLI compiler manifest contains an invalid or duplicate source');
    }
    seen.add(filename); names.push(filename.slice('bootstrap/compiler/'.length, -4));
    modules.push({id: filename.slice(0, -4) + '.mjs', filename, source: await text(filename)});
  }
  if (modules.length !== 13 || !seen.has('bootstrap/compiler/compiler.eli')) {
    throw new TypeError('original CLI requires the complete thirteen-module compiler graph');
  }
  const mapped = [];
  for (const suite of ['tests/bootstrap-compiler.test.mjs', 'tests/cli-test.sh']) {
    const coverage = locators.filter(locator => locator.file === suite);
    if (!coverage.length) continue;
    const original = await text(suite), identity = await file(suite), changes = [];
    for (const locator of coverage) {
      if (typeof locator.contains !== 'string' || !original.includes(locator.contains)) {
        throw new TypeError('original compiler CLI coverage locator is not present in its source');
      }
    }
    let hostSource, generations;
    if (suite.endsWith('.test.mjs')) {
      let transported = replaceOriginal(original, 'import { expect, test } from "bun:test";',
        'import { expect } from "bun:test";', changes);
      transported = replaceOriginal(transported, 'const projectDirectory = resolve(import.meta.dir, "..");',
        'const projectDirectory = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;\n' +
        'if (!projectDirectory) throw new Error("original compiler CLI requires its source root");', changes);
      transported = replaceOriginal(transported, '"../bootstrap/host/bun.mjs"',
        JSON.stringify(pathToFileURL(resolve(sourceRoot, 'bootstrap/host/bun.mjs')).href), changes);
      transported = replaceOriginal(transported, 'async function run(command, options = {}) {\n',
        'async function run(command, options = {}) {\n' +
        '  const replacement = await __cli_prepare_command(command, options);\n' +
        '  if (replacement) return replacement;\n', changes);
      const build = region(transported, 'async function buildWithPortableCompiler(', '\nasync function expectArtifactDirectoriesEqual(');
      transported = replaceOriginal(transported, build,
        'async function buildWithPortableCompiler(compilerDirectory, outputDirectory) {\n' +
        '  const previous = __cli_directories.get(resolve(compilerDirectory));\n' +
        '  if (!previous) throw new Error("generation producer is not the selected compiler");\n' +
        '  await __cli_place_generation(previous.generation, outputDirectory);\n}\n', changes);
      transported = replaceOriginal(transported, 'async function expectArtifactDirectoriesEqual(left, right) {\n',
        'async function expectArtifactDirectoriesEqual(left, right) {\n' +
        '  const leftGeneration = __cli_directories.get(resolve(left));\n' +
        '  const rightGeneration = __cli_directories.get(resolve(right));\n' +
        '  if (!leftGeneration || !rightGeneration) throw new Error("original generation comparison lacks actual products");\n' +
        '  left = leftGeneration.javascriptDirectory;\n' +
        '  right = rightGeneration.javascriptDirectory;\n', changes);
      hostSource = generationsTransport(sourceRoot) +
        '\nconst __cli_cases = [];\nfunction test(name, body, timeout) {\n' +
        '  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new TypeError("original CLI case lost its timeout");\n' +
        '  __cli_cases.push({name, body, timeout});\n}\n' + transported + runOriginalCases;
      generations = {count: 3, producer: 'previous-generation', target: 'selected-target', completeCompiler: true,
        sourceMaps: true, manifestEnvironment: 'ELISCRIPT_ORIGINAL_COMPILER_GENERATIONS',
        manifestFormat: 'eliscript-original-compiler-generations', manifestVersion: 1,
        javascriptCompanions: 'selected-generation-producer', fixedPoint: 'complete-target-artifacts-and-original-javascript-files'};
    } else {
      // The shell body is executed verbatim from the original source root.
      // Its real public CLI loads the selected target via this prepared module
      // directory. Generated user JavaScript is still executed by its original
      // Bun commands, and every diagnostic/snapshot/map assertion remains.
      hostSource = `import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root = process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;
if (!root) throw new Error('original shell CLI requires its source root');
const directory = resolve(process.argv[2], '__eliscript_original_cli_compiler');
await mkdir(directory, {recursive: true});
for (const name of ${JSON.stringify(names)}) {
  const source = resolve(process.argv[2], 'bootstrap/compiler', name + '.mjs');
  await readFile(source);
  await writeFile(resolve(directory, name + '.mjs'), 'export * from ' + JSON.stringify(pathToFileURL(source).href) + ';\\n');
  await writeFile(resolve(directory, name + '.mjs.map'), await readFile(source + '.map'));
}
const child = Bun.spawn(['sh', resolve(root, 'tests/cli-test.sh')], {
  cwd: root, env: {...process.env, ELISCRIPT_BOOTSTRAP_MODULE_DIR: directory}, stdout: 'pipe', stderr: 'pipe',
});
const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
if (code !== 0) throw new Error(stderr.trim() || stdout.trim() || 'original shell CLI failed: ' + code);
process.stdout.write(stdout);
`;
    }
    const setupReplacement = {kind: generations ? 'selected-compiler-generations' : 'selected-compiler-module-directory',
      sourceSha256: identity.sha256, modules: modules.map(module => module.id), changes,
      independentOracle: 'original-emacs-seed', algorithms: 'selected-target-only'};
    add({id: 'original-program:compiler-cli-' + (generations ? 'bootstrap-generations' : 'shell'),
      kind: 'project', coverage: coverage.map(locator => locator.id), modules: structuredClone(modules),
      entry: 'bootstrap/compiler/compiler.mjs',
      request: {operation: 'project', resolveImports: true, phased: true, sourceMap: true, entries: modules.map(module => module.id)},
      execution: {kind: 'original-program', host: 'tests/__eliscript_original_compiler_cli_' + (generations ? 'generations' : 'shell') + '.mjs',
        hostSource, arguments: [{directory: true}], aliases: true, requiresBun: true, compilerSourceMaps: true,
        runtimeLaunchers: true, childProcesses: 'inherit-selected-artifact', runtimeProfile:'compiler', setupReplacement,
        ...(generations ? {compilerGenerations: generations} : {})},
      expected: {kind: 'seed-program', oracleRequired: true,
        stdout: generations ? '' : 'CLI and Bun execution test passed\n'},
      original: {manifest: 'stable-compatibility', suite, fixture: suite, host: suite, sourceSha256: identity.sha256,
        regions: [{start: 0, end: original.length, byteStart: 0, byteEnd: Buffer.byteLength(original), sha256: sha256(original)}],
        setupReplacement},
    });
    mapped.push(suite);
  }
  return mapped;
}

// The worker remains the original Bun process and protocol implementation.
// Only its compiler setup consumes the selected complete compiler session.
export async function addOriginalWorkerProgram({add, locators, text, file, sourceRoot}) {
  const suite = 'tests/worker-runtime.test.mjs';
  const title = 'long-lived worker implements the versioned NDJSON protocol and maps failures through project source maps';
  const candidates = locators.filter(locator => locator.file === suite);
  if (!candidates.length) return [];
  const source = await text(suite), identity = await file(suite);
  const cases = originalSourceCaseLocators(suite, source);
  const selected = cases.find(locator => locator.contains === title)?.originalCase;
  if (!selected || selected.timeoutMs !== 20000 || selected.registration !== 'test') {
    throw new TypeError('original worker source mapping registration changed');
  }
  const coverage = candidates.filter(locator => {
    if (typeof locator.contains !== 'string' || !locator.contains.length) return false;
    const matches = cases.filter(item => source.slice(item.originalCase.span.start, item.originalCase.span.end).includes(locator.contains));
    return matches.length === 1 && matches[0].originalCase === selected;
  });
  if (!coverage.length) return [];
  const setupStart = source.indexOf('const projectDirectory =');
  if (setupStart < 0) throw new TypeError('original worker dependency boundary changed');
  const header = source.slice(0, setupStart);
  const expectedImports = ['bun:test', 'node:crypto', 'node:fs/promises', 'node:os', 'node:path',
    '../runtime/core/identifier.mjs', '../runtime/core/list.mjs', '../runtime/core/map.mjs',
    '../runtime/core/vector.mjs', '../runtime/core/value.mjs', '../runtime/worker-value-codec.mjs',
    '../runtime/worker-value-stream.mjs'];
  const importPattern = /^import\s+[\s\S]*?\sfrom\s+(["'])([^"']+)\1;/gm;
  const imports = [...header.matchAll(importPattern)];
  if (imports.length !== expectedImports.length || imports.some((match, index) => match[2] !== expectedImports[index]) ||
      header.replace(importPattern, '').trim()) throw new TypeError('original worker dependencies changed');
  let transportedHeader = header;
  const changes = [];
  transportedHeader = replaceOriginal(transportedHeader, 'import { expect, test } from "bun:test";',
    'import { expect } from "bun:test";', changes);
  for (const specifier of expectedImports.filter(name => name.startsWith('.'))) {
    transportedHeader = replaceOriginal(transportedHeader, JSON.stringify(specifier),
      JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tests', specifier)).href), changes);
    await file(resolve(sourceRoot, 'tests', specifier).slice(resolve(sourceRoot).length + 1));
  }
  const firstCase = Math.min(...cases.map(locator => locator.originalCase.span.start));
  let helpers = source.slice(setupStart, firstCase);
  helpers = replaceOriginal(helpers, 'const projectDirectory = resolve(import.meta.dir, "..");',
    'const projectDirectory = configuration.sourceRoot;', changes);
  let body = source.slice(selected.span.start, selected.span.end);
  const originalCompile = '    await runSuccessful(\n' +
    '      [compilerPath, "--source-map", "--output", modulePath, fixturePath],\n' +
    '      { env: { ...process.env, EMACS: emacs } },\n' +
    '    );';
  body = replaceOriginal(body, originalCompile,
    '    const compiler = await openSelected();\n' +
    '    try {\n' +
    '      await compileSelectedWorker({input: fixturePath, output: modulePath, sourceMap: true, compiler: {\n' +
    '        build_operation_request(input) { return compiler.request({operation: "protocol", name: "build-operation-request", input}); },\n' +
    '        compile_string_with_source_map(source, filename, generatedFile, sourceName) {\n' +
    '          return compiler.request({operation: "compile", source, filename, sourceMap: {generatedFile, sourceName}});\n' +
    '        },\n' +
    '      }});\n' +
    '    } finally { compiler.close(); }', changes);
  const sources = await loadCompilerSources({sourceRoot});
  for (const record of [...sources.modules, sources.runtime, ...(sources.literalSources ?? [])]) await file(record.filename);
  const completeSourceIdentity = compilerSourceIdentity(sources);
  const fixture = 'tests/fixtures/worker.eli', fixtureIdentity = await file(fixture);
  await file('bootstrap/host/bun.mjs');
  await file('runtime/worker.mjs');
  const moduleURL = name => JSON.stringify(pathToFileURL(resolve(sourceRoot, name)).href);
  const hostSource = transportedHeader + `
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createCompilerSession} from ${moduleURL('tools/backends/compiler-session.mjs')};
import {readCompilerMetadata} from ${moduleURL('tools/backends/compiler-metadata.mjs')};
import {loadCompilerSources} from ${moduleURL('tools/backends/compiler-build.mjs')};
import {compilerSourceIdentity} from ${moduleURL('tools/backends/compiler-bootstrap.mjs')};
import {compileFile as compileSelectedWorker} from ${moduleURL('bootstrap/host/bun.mjs')};
const configuration=await readCompilerMetadata(process.env.ELISCRIPT_ORIGINAL_COMPILER_SESSION);
process.chdir(configuration.sourceRoot);
assert.deepEqual(compilerSourceIdentity(await loadCompilerSources({sourceRoot:configuration.sourceRoot})),${JSON.stringify(completeSourceIdentity)});
assert.equal(createHash('sha256').update(await readFile(resolve(configuration.sourceRoot,${JSON.stringify(fixture)}))).digest('hex'),${JSON.stringify(fixtureIdentity.sha256)});
const selectedDriver=configuration.target==='javascript'?await import(pathToFileURL(configuration.path).href):undefined;
const selectedBytes=configuration.target==='wasm'?new Uint8Array(await readFile(configuration.path)):undefined;
async function openSelected(){
 const session=await createCompilerSession({host:configuration.target,compiler:selectedDriver,
  ...(configuration.target==='wasm'?{bytes:selectedBytes}:{}),
  ...(configuration.target==='native'?{path:configuration.path,descriptor:{typed:configuration.typed,descriptor:configuration.descriptor}}:{}),
  memory:configuration.memory,options:configuration.runtimeOptions});
 assert.equal(session.host,configuration.target);return session;
}
const cases=[];
function test(name,run,timeout){
 if(name!==${JSON.stringify(title)}||timeout!==20000)throw new TypeError('original worker case changed its deadline');
 cases.push({name,run,timeout});
}
` + helpers + '\n' + body + `
assert.equal(cases.length,1);
for(const record of cases){
 let timer;const start=performance.now();
 try{await Promise.race([Promise.resolve().then(record.run),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(new Error(record.name+' exceeded its original '+record.timeout+' ms timeout')),record.timeout);
 })]);assert(performance.now()-start<=record.timeout,'original worker case exceeded its deadline');}
 finally{clearTimeout(timer);}
}
console.log(JSON.stringify(cases.map(record=>record.name)));
`;
  const region = {start: selected.span.start, end: selected.span.end, byteStart: selected.byteStart,
    byteEnd: selected.byteEnd, sha256: selected.sha256};
  const id = 'original-tools-artifact:worker-source-mapping:bun';
  add({id, kind: 'project', coverage: coverage.map(locator => locator.id), entry: sources.entry,
    modules: structuredClone(sources.modules), memory: {initialPages: 128, maximumPages: 4096},
    request: {operation: 'project', resolveImports: true, phased: false, sourceMap: true},
    execution: {kind: 'compiler-session-program', host: 'tests/__eliscript_original_worker_source_mapping.mjs',
      hostRuntime: 'bun', hostSource, runtimeProfile: 'compiler', compilerProfile: 'small',
      runtimeOptions: {maxSlots: 131072, initialBytes: 8388608, maxBytes: 67108864, auto: 65536}, timeoutMs: 20000,
      setupReplacement: {kind: 'selected-complete-compiler-worker', producer: 'selected-session', changes,
        sourceIdentity: completeSourceIdentity, originalCaseTimeoutMs: selected.timeoutMs}},
    expected: {kind: 'seed-program', oracleRequired: true},
    original: {suite, host: suite, sourceSha256: identity.sha256, regions: [region],
      completeLocatorCoverage: true,
      cases: coverage.map(locator => ({id: locator.id, ...structuredClone(selected)})),
      helperRegion: {start: setupStart, end: firstCase, sha256: sha256(source.slice(setupStart, firstCase))},
      dependencies: {imports: expectedImports, headerSha256: sha256(header),
        fixture: {file: fixture, sha256: fixtureIdentity.sha256}},
      originalAssertions: [title], completeSourceIdentity,
      setupReplacement: {kind: 'selected-complete-compiler-worker', changes}, coverageScope: 'complete-source-mapping-worker-case-only'},
  });
  return [{suite, coverage: coverage.map(locator => locator.id), regions: [region], recordIds: [id]}];
}
