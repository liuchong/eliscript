import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCompilerSources} from './compiler-build.mjs';
import {compilerSourceIdentity} from './compiler-bootstrap.mjs';
import {originalSourceCaseLocators} from './compiler-corpus-managed-cases.mjs';
import {addOriginalWorkerProgram} from './compiler-corpus-cli-adapters.mjs';

const suite = 'tests/compiler-session-tools.test.mjs';
const digest = source => createHash('sha256').update(source).digest('hex');
const caseTitles = [
  'a complete real managed compiler driver transports AggregateError graphs with shared errors and cause identity',
  'the real compiler CLI emits structured source failures and preserves successful output with the same built artifact',
  'real CLI streaming UTF8 preserves split astral scalars BOM diagnostics and strict malformed-tail failures',
];
const semanticFixtures = [
  'tests/fixtures/core-expression-forms.eli', 'tests/fixtures/core-language-api-usage.eli',
  'tests/fixtures/core-stdlib-usage.eli', 'tests/fixtures/wasm-managed-source-collections.eli',
  'tests/fixtures/managed-stdlib-value-json.eli',
];

// These cases exercise the original host implementation or its retained
// reports. They remain mandatory original gates, not selected-compiler runs.
const hostGatePlans = new Map([
  ['tests/collection-layout-benchmark.test.mjs', {
    imports: ['./helpers/performance-acceptance.mjs', 'bun:test', 'node:fs/promises', 'node:url',
      '../tools/collections/layout-benchmark.mjs', '../tools/collections/benchmark.mjs'],
    dependencies: ['tools/collections/layout-host.mjs', 'benchmarks/hamt-layout-macos-arm64.json'],
    cases: new Map([
      ['HAMT layout core validates equivalent real node operations', 'original-host-runtime-case'],
      ['HAMT layout host adapters agree under Bun and Node', 'original-host-runtime-case'],
      ['HAMT browser benchmark uses copied native ESM without a bundler', 'original-source-inventory-case'],
      ['committed HAMT layout baseline proves the 32/24 threshold decision', 'original-retained-report-case'],
    ]),
  }],
  ['tests/transient-builder-benchmark.test.mjs', {
    imports: ['./helpers/performance-acceptance.mjs', 'bun:test', 'node:fs/promises', 'node:path',
      '../tools/collections/transient-builder-benchmark.mjs'],
    dependencies: ['benchmarks/transient-builder-macos-arm64.json'],
    cases: new Map([
      ['committed transient builder report matches core runtime sources', 'original-current-source-report-case'],
      ['transient builder report validator rejects incomplete evidence', 'original-retained-report-case'],
    ]),
  }],
  ['tests/public-surface.test.mjs', {
    imports: ['bun:test', 'node:fs/promises', 'node:path', 'node:url', '../tools/surface/check.mjs'],
    dependencies: ['contracts/public-surface.json'],
    cases: new Map([
      ['repository public surface matches every tracked implementation', 'original-source-inventory-case'],
      ['public surface checker follows aliased runtime re-exports', 'original-source-inventory-case'],
    ]),
  }],
  ['tests/worker-value-codec.test.mjs', {
    imports: ['bun:test', '../runtime/core/identifier.mjs', '../runtime/core/list.mjs', '../runtime/core/map.mjs',
      '../runtime/core/metadata.mjs', '../runtime/core/protocol.mjs', '../runtime/core/set.mjs',
      '../runtime/core/transient.mjs', '../runtime/core/value.mjs', '../runtime/core/vector.mjs',
      '../runtime/worker-value-codec.mjs'],
    dependencies: [],
    cases: new Map([
      ['worker value codec transports protocol definitions without runtime identity', 'original-host-runtime-case'],
    ]),
  }],
]);

function sourceImports(source) {
  return [...source.matchAll(/^import\s+[\s\S]*?\sfrom\s+["']([^"']+)["'];/gm)].map(match => match[1]);
}

export async function originalToolsHostGateCase({locator, source, file}) {
  const plan = hostGatePlans.get(locator?.file);
  if (!plan || !plan.cases.has(locator.contains)) return null;
  if (typeof source !== 'string' || typeof file !== 'function') throw new TypeError('original tools gate requires source services');
  const imports = sourceImports(source);
  if (imports.length !== plan.imports.length || imports.some((name, index) => name !== plan.imports[index])) {
    throw new TypeError('original tools gate dependencies changed: ' + locator.file);
  }
  if (/\b(?:compile_string|compile_ir_string|compileFile|buildIndependentCompiler|createCompilerSession|import)\s*\(|bin\/eliscript|ELISCRIPT_[A-Z_]*COMPILER/.test(source)) {
    throw new TypeError('original tools gate acquired a compiler path: ' + locator.file);
  }
  let selected = originalSourceCaseLocators(locator.file, source).find(item => item.contains === locator.contains)?.originalCase;
  if (!selected && locator.file === 'tests/transient-builder-benchmark.test.mjs') {
    const prefix = 'currentPerformanceTest(test)(' + JSON.stringify(locator.contains) + ', async () => {';
    const start = source.indexOf(prefix);
    if (start < 0 || source.indexOf(prefix, start + prefix.length) >= 0 || !source.slice(start).trimEnd().endsWith('});')) {
      throw new TypeError('original current-source report gate boundary changed');
    }
    selected = {title: locator.contains, span: {start, end: source.length},
      byteStart: Buffer.byteLength(source.slice(0, start)), byteEnd: Buffer.byteLength(source),
      sha256: digest(source.slice(start)), registration: 'currentPerformanceTest(test)', timeoutMs: 5000};
  }
  if (!selected) throw new TypeError('original tools gate case boundary changed: ' + locator.contains);
  const dependencies = [];
  const paths = new Set(plan.dependencies);
  for (const specifier of imports) if (specifier.startsWith('.')) {
    const path = new URL(specifier, 'file:///' + locator.file).pathname.slice(1);
    paths.add(path);
  }
  for (const path of paths) dependencies.push({file: path, sourceSha256: (await file(path)).sha256});
  return {kind: plan.cases.get(locator.contains), originalAssertion: locator.contains,
    region: {start: selected.span.start, end: selected.span.end, byteStart: selected.byteStart,
      byteEnd: selected.byteEnd, sha256: selected.sha256}, dependencies,
    registration: selected.registration, timeoutMs: selected.timeoutMs,
    reason: 'unchanged complete original gate; this case has no language compiler or selected-product injection'};
}

function semanticDependencies(source) {
  // These are the existing suite's complete header dependencies. The replay
  // supplies its test collector and selected-session setup explicitly; a new
  // import must be wired deliberately instead of failing deep in a VM run.
  const expected = [
    "import {beforeAll, afterAll, test, spyOn} from 'bun:test';",
    "import assert from 'node:assert/strict';",
    "import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';",
    "import {resolve} from 'node:path';",
    "import {tmpdir} from 'node:os';",
    "import {pathToFileURL} from 'node:url';",
    "import {spawnSync} from 'node:child_process';",
    "import {createHash} from 'node:crypto';",
    "import {buildIndependentCompiler,loadCompilerSources,independentCompilerResources} from '../tools/backends/compiler-build.mjs';",
    "import {createCompilerSession} from '../tools/backends/compiler-session.mjs';",
  ];
  const headerEnd = source.indexOf('\nlet directory, owned, driver;');
  const imports = headerEnd < 0 ? [] : source.slice(0, headerEnd).split('\n').map(line => line.trim()).filter(Boolean);
  if (imports.length !== expected.length || imports.some((line, index) => line !== expected[index])) {
    throw new TypeError('original compiler semantic dependencies changed');
  }
  const session = region(source, 'async function withSession(run) {', '\nconst analyze =');
  if (session.source !== "async function withSession(run) {\n  const session = await createCompilerSession({host: 'javascript', compiler: driver});\n  try {await run(session);} finally {session.close();}\n}") {
    throw new TypeError('original compiler semantic session lifecycle changed');
  }
  const {source: retained, ...sessionRange} = session;
  return {imports, header: {start: 0, end: headerEnd, byteStart: 0, byteEnd: Buffer.byteLength(source.slice(0, headerEnd)),
    sha256: digest(source.slice(0, headerEnd))}, session: sessionRange};
}

function semanticRegions(source) {
  const first = region(source, 'const analyze =', '\nasync function withBackendPhaseTrace');
  const start = source.indexOf("test('optional parameter defaults resolve");
  if (start < 0) throw new TypeError('original compiler semantic case boundary changed');
  const tail = source.slice(start);
  return [first, {source: tail, start, end: source.length, byteStart: Buffer.byteLength(source.slice(0, start)),
    byteEnd: Buffer.byteLength(source), sha256: digest(tail)}];
}

function semanticTitles(regions) {
  const names = [];
  for (const selected of regions) {
    for (const match of selected.source.matchAll(/^[ \t]*test\('([^']+)'([^\n]*)/gm)) {
      if (match[1] === 'production tools analyze complete existing fixture ') {
        if (!match[2].startsWith(' + filename,')) throw new TypeError('original compiler semantic fixture registration changed');
        names.push(...semanticFixtures.map(filename => match[1] + filename));
      } else {
        if (!match[2].startsWith(',')) throw new TypeError('original compiler semantic test registration changed');
        names.push(match[1]);
      }
    }
  }
  if (names.length === 0 || new Set(names).size !== names.length) throw new TypeError('invalid original compiler semantic case names');
  return names;
}

function semanticHostSource(sourceRoot, sourceIdentity, fixtureIdentities, body, titles) {
  return `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createCompilerSession} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-session.mjs')).href)};
import {loadCompilerSources} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-build.mjs')).href)};
import {compilerSourceIdentity} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-bootstrap.mjs')).href)};
import {readCompilerMetadata} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-metadata.mjs')).href)};
const configuration=await readCompilerMetadata(process.env.ELISCRIPT_ORIGINAL_COMPILER_SESSION);
process.chdir(configuration.sourceRoot);
assert.deepEqual(compilerSourceIdentity(await loadCompilerSources({sourceRoot:configuration.sourceRoot})),${JSON.stringify(sourceIdentity)});
for(const identity of ${JSON.stringify(fixtureIdentities)}){
 const bytes=await readFile(identity.filename);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),identity.sha256,identity.filename);
}
const selectedDriver=configuration.target==='javascript'?await import(pathToFileURL(configuration.path).href):undefined;
const selectedBytes=configuration.target==='wasm'?new Uint8Array(await readFile(configuration.path)):undefined;
async function openSelected(){
 const session=await createCompilerSession({host:configuration.target,compiler:selectedDriver,
  ...(configuration.target==='wasm'?{bytes:selectedBytes}:{}),
  ...(configuration.target==='native'?{path:configuration.path,descriptor:{typed:configuration.typed,descriptor:configuration.descriptor}}:{}),
  memory:configuration.memory,options:configuration.runtimeOptions});
 assert.equal(session.host,configuration.target);return session;
}
async function withSession(run){const session=await openSelected();try{await run(session);}finally{session.close();}}
const cases=[];
function test(name,run,timeout=5000){cases.push({name,run,timeout});}
async function timed(name,run,timeout){
 let timer;const start=performance.now();
 try{
  await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(name+' exceeded its original '+timeout+' ms timeout')),timeout);})]);
  assert(performance.now()-start<=timeout,name+' exceeded its original '+timeout+' ms timeout');
 }finally{clearTimeout(timer);}
}
` + body + `
assert.deepEqual(cases.map(record=>record.name),${JSON.stringify(titles)});
for(const record of cases)await timed(record.name,record.run,record.timeout);
console.log(JSON.stringify(cases.map(record=>record.name)));
`;
}

function region(source, begin, end, from = 0) {
  const start = source.indexOf(begin, from);
  const finish = start < 0 ? -1 : source.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0) throw new TypeError('original compiler artifact case boundary changed: ' + begin);
  const selected = source.slice(start, finish);
  return {source: selected, start, end: finish, byteStart: Buffer.byteLength(source.slice(0, start)),
    byteEnd: Buffer.byteLength(source.slice(0, finish)), sha256: digest(selected)};
}

function replaceSetup(source, before, after, changes) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + before.length) >= 0) {
    throw new TypeError('original compiler artifact setup changed: ' + before);
  }
  changes.push({role: 'selected-complete-compiler-transport', beforeSha256: digest(before), afterSha256: digest(after)});
  return source.slice(0, at) + after + source.slice(at + before.length);
}

// These are the original artifact and CLI assertion bodies, rather than a
// replacement compiler or a reduced request corpus. Only artifact construction,
// target transport, and the independent JavaScript reference setup change.
export async function addOriginalToolsArtifactPrograms({add, locators, text, file, sourceRoot}) {
  if (typeof add !== 'function' || !Array.isArray(locators) || typeof text !== 'function' ||
      typeof file !== 'function' || typeof sourceRoot !== 'string') {
    throw new TypeError('original compiler artifact adapter requires its source manifest and services');
  }
  const workerPrograms = await addOriginalWorkerProgram({add, locators, text, file, sourceRoot});
  const candidates = locators.filter(locator => locator.file === suite);
  if (candidates.length === 0) return workerPrograms;
  const source = await text(suite), identity = await file(suite);
  const selected = region(source, 'const aggregateSource=', "\ntest('optional parameter defaults resolve");
  const coverage = candidates.filter(locator => typeof locator.contains === 'string' &&
    selected.source.includes(locator.contains)).map(locator => locator.id);
  const semantics = semanticRegions(source);
  const semanticNames = semanticTitles(semantics);
  const semanticCoverage = candidates.filter(locator => typeof locator.contains === 'string' &&
    (semanticNames.includes(locator.contains) || semantics.some(selected => selected.source.includes(locator.contains)))).map(locator => locator.id);
  if (coverage.length === 0 && semanticCoverage.length === 0) return workerPrograms;
  const dependencies = semanticCoverage.length ? semanticDependencies(source) : null;

  const sources = await loadCompilerSources({sourceRoot});
  for (const record of [...sources.modules, sources.runtime, ...(sources.literalSources ?? [])]) await file(record.filename);
  const completeSourceIdentity = compilerSourceIdentity(sources);
  const changes = [];
  let body = selected.source;
  body = replaceSetup(body,
    "const producer=await createCompilerSession({host:'javascript',compiler:driver});",
    'const producer=await openSelected();', changes);
  body = replaceSetup(body, 'const sources=await loadCompilerSources();',
    'const sources=structuredClone(completeSources);', changes);
  body = replaceSetup(body,
    "const oracleSource=aggregateSource(pathToFileURL(resolve(directory,'host/compiler-session.mjs')).href);",
    `const oracleArtifact=await buildSelectedArtifact(producer,'aggregate-reference','javascript',structuredClone(completeSources));
    const oracleSource=aggregateSource(pathToFileURL(oracleArtifact.path).href);`, changes);
  body = replaceSetup(body,
    "const artifact=await withBackendPhaseTrace(()=>buildIndependentCompiler({host:'wasm',outputRoot:temporary,session:producer,sources}));",
    "const artifact=await buildSelectedArtifact(producer,'aggregate-selected',configuration.target,sources);", changes);
  body = replaceSetup(body,
    'assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact.bytes)),[]);',
    "assert.equal(artifact.host,configuration.target);\n    if(configuration.target==='wasm')assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact.bytes)),[]);", changes);
  body = replaceSetup(body,
    "managed=await createCompilerSession({host:'wasm',bytes:artifact.bytes,memory:resources.memory,options:{...resources.budget,auto:resources.auto}});",
    'managed=await openArtifact(artifact,resources);assert.equal(managed.host,configuration.target);', changes);

  const sessionURL = pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-session.mjs')).href;
  const buildURL = pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-build.mjs')).href;
  const bootstrapURL = pathToFileURL(resolve(sourceRoot, 'tools/backends/compiler-bootstrap.mjs')).href;
  const hostSource = `import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createCompilerSession} from ${JSON.stringify(sessionURL)};
import {buildIndependentCompiler,loadCompilerSources,independentCompilerResources} from ${JSON.stringify(buildURL)};
import {compilerSourceIdentity} from ${JSON.stringify(bootstrapURL)};
import {readCompilerMetadata} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot,'tools/backends/compiler-metadata.mjs')).href)};
const configuration=await readCompilerMetadata(process.env.ELISCRIPT_ORIGINAL_COMPILER_SESSION);
process.chdir(configuration.sourceRoot);
if(!configuration.supportingDirectory||!configuration.supportingManifest)throw new TypeError('original compiler artifact cases require their actual product archive');
const completeSources=await loadCompilerSources({sourceRoot:configuration.sourceRoot});
assert.deepEqual(compilerSourceIdentity(completeSources),${JSON.stringify(completeSourceIdentity)});
const cliPath=${JSON.stringify(resolve(sourceRoot, 'tools/backends/compiler-cli.mjs'))};
const resources=independentCompilerResources({profile:'small'});
assert.deepEqual(configuration.memory,resources.memory);
for(const[key,value]of Object.entries({...resources.budget,auto:resources.auto}))assert.equal(configuration.runtimeOptions[key],value,key);
const selectedDriver=configuration.target==='javascript'?await import(pathToFileURL(configuration.path).href):undefined;
async function openSelected(){
 const session=await createCompilerSession({host:configuration.target,compiler:selectedDriver,
  ...(configuration.target==='wasm'?{bytes:new Uint8Array(await readFile(configuration.path))}:{}),
  ...(configuration.target==='native'?{path:configuration.path,descriptor:{typed:configuration.typed,descriptor:configuration.descriptor}}:{}),
  memory:configuration.memory,options:configuration.runtimeOptions});
 assert.equal(session.host,configuration.target);return session;
}
async function openArtifact(artifact,limits=resources){
 const session=await createCompilerSession({host:artifact.host,
  ...(artifact.host==='javascript'?{compiler:await import(pathToFileURL(artifact.path).href)}:{}),
  ...(artifact.host==='wasm'?{bytes:artifact.bytes}:{}),
  ...(artifact.host==='native'?{path:artifact.path,descriptor:artifact.lowered??{typed:artifact.typed,descriptor:artifact.descriptor}}:{}),
  memory:limits.memory,options:{...limits.budget,auto:limits.auto,nativeTarget:artifact.nativeTarget??configuration.runtimeOptions.nativeTarget}});
 assert.equal(session.host,artifact.host);return session;
}
const supportingProducts=[];
async function saveSupportingProducts(){
 await mkdir(configuration.supportingDirectory,{recursive:true});
 await writeFile(configuration.supportingManifest,JSON.stringify({format:'eliscript-original-compiler-supporting-products',version:1,products:supportingProducts}));
}
async function buildSelectedArtifact(producer,role,target,sources){
 const artifact=await buildIndependentCompiler({host:target,outputRoot:resolve(configuration.supportingDirectory,role),
  sourceRoot:configuration.sourceRoot,session:producer,sources,profile:'small',budget:resources.budget,
  memory:resources.memory,auto:resources.auto,nativeTarget:configuration.runtimeOptions.nativeTarget});
 assert.equal(artifact.host,target);assert.equal(artifact.provenance.mode,'session');
 assert.equal(artifact.provenance.producerHost,producer.host);
 assert.deepEqual(artifact.provenance.compiledModuleIds,sources.modules.map(module=>module.id));
 assert.equal(artifact.provenance.runtimeCompiled,true);
 supportingProducts.push({role,artifact});await saveSupportingProducts();return artifact;
}
let directory,standard;
async function withSession(run){const session=await openArtifact(standard);try{return await run(session);}finally{session.close();}}
const cases=[];
function test(name,run,timeout=5000){cases.push({name,run,timeout});}
async function timed(name,run,timeout){
 let timer;
 const start=performance.now();
 try{
  await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(name+' exceeded its original '+timeout+' ms timeout')),timeout);})]);
  assert(performance.now()-start<=timeout,name+' exceeded its original '+timeout+' ms timeout');
 }finally{clearTimeout(timer);}
}
` + body + `
assert.deepEqual(cases.map(record=>record.name),${JSON.stringify(caseTitles)});
let failed=false;
try{
 await timed('original compiler artifact beforeAll',async()=>{
  const producer=await openSelected();
  try{standard=await buildSelectedArtifact(producer,'standard-selected',configuration.target,structuredClone(completeSources));directory=standard.directory;}
  finally{producer.close();}
 },120000);
 for(const record of cases)await timed(record.name,record.run,record.timeout);
 console.log(JSON.stringify(cases.map(record=>record.name)));
}catch(error){failed=true;throw error;}
finally{
 try{await saveSupportingProducts();}catch(error){if(!failed)throw error;}
}
`;

  const regions = [{start: selected.start, end: selected.end, byteStart: selected.byteStart,
    byteEnd: selected.byteEnd, sha256: selected.sha256}];
  const recordIds = [];
  for (const hostRuntime of coverage.length ? ['node', 'bun'] : []) {
    const id = 'original-tools-artifact:compiler-session-tools:' + hostRuntime;
    recordIds.push(id);
    add({id, kind: 'project', coverage: [...coverage], entry: sources.entry,
      modules: structuredClone(sources.modules), memory: {initialPages: 128, maximumPages: 4096},
      request: {operation: 'project', resolveImports: true, phased: false, sourceMap: true},
      execution: {kind: 'compiler-session-program', host: 'tests/__eliscript_original_tools_artifact_' + hostRuntime + '.mjs',
        hostRuntime, hostSource, runtimeProfile: 'compiler', compilerProfile: 'small',
        runtimeOptions: {maxSlots: 131072, initialBytes: 8388608, maxBytes: 67108864, auto: 65536},
        supportingCompilerProducts: true, timeoutMs: 300000,
        setupReplacement: {kind: 'selected-complete-compiler-artifacts', producer: 'selected-session',
          reference: 'independent-javascript-product-assertions-only', sourceIdentity: completeSourceIdentity, changes,
          beforeAllTimeoutMs: 120000, originalCaseTimeouts: [120000, 30000, 30000]}},
      expected: {kind: 'seed-program', oracleRequired: true},
      original: {suite, host: suite, sourceSha256: identity.sha256, regions,
        originalAssertions: [...caseTitles], completeSourceIdentity,
        setupReplacement: {kind: 'selected-complete-compiler-artifacts', changes},
        coverageScope: 'aggregate-entry-and-three-artifact-cli-cases-only'},
    });
  }
  const summaries = [...workerPrograms, ...(coverage.length ? [{suite, coverage: [...coverage], regions, recordIds}] : [])];
  if (semanticCoverage.length) {
    const fixtureIdentities = [];
    for (const filename of semanticFixtures) fixtureIdentities.push({filename, sha256: (await file(filename)).sha256});
    const semanticChanges = [];
    const semanticBody = replaceSetup(semantics.map(selected => selected.source).join('\n'),
      "const session = await createCompilerSession({host: 'javascript', compiler: driver});",
      'const session = await openSelected();', semanticChanges);
    const titles = semanticNames;
    const semanticRanges = semantics.map(({source, ...range}) => range);
    const semanticIds = [];
    const semanticHost = semanticHostSource(sourceRoot, completeSourceIdentity, fixtureIdentities, semanticBody, titles);
    for (const hostRuntime of ['node', 'bun']) {
      const id = 'original-managed:compiler-session-tools:' + hostRuntime;
      semanticIds.push(id);
      add({id, kind: 'project', coverage: [...semanticCoverage], entry: sources.entry,
        modules: structuredClone(sources.modules), memory: {initialPages: 128, maximumPages: 4096},
        request: {operation: 'project', resolveImports: true, phased: false, sourceMap: true},
        execution: {kind: 'compiler-session-program', host: 'tests/__eliscript_compiler_session_tools_' + hostRuntime + '.mjs',
          hostRuntime, hostSource: semanticHost, runtimeProfile: 'compiler', compilerProfile: 'small',
          runtimeOptions: {maxSlots: 131072, initialBytes: 8388608, maxBytes: 67108864, auto: 65536}, timeoutMs: 120000,
          setupReplacement: {kind: 'selected-complete-compiler-semantic-tools', producer: 'selected-session',
            reference: 'retained-original-semantic-assertions-and-generated-javascript', sourceIdentity: completeSourceIdentity,
            dependencies, changes: semanticChanges, defaultCaseTimeoutMs: 5000, deadlines: 'retained-test-registration-arguments'}},
        expected: {kind: 'seed-program', oracleRequired: true},
        original: {suite, host: suite, sourceSha256: identity.sha256, regions: semanticRanges,
          cases: candidates.filter(locator => semanticCoverage.includes(locator.id) && locator.originalCase)
            .map(locator => ({id: locator.id, ...structuredClone(locator.originalCase)})),
          originalAssertions: titles, completeSourceIdentity, fixtureIdentities,
          originalAssertion: 'all original public semantic tools cases including the original trailing parameter-default query corpus; aggregate/CLI artifact cases are separate',
          setupReplacement: {kind: 'selected-complete-compiler-semantic-tools', dependencies, changes: semanticChanges},
          coverageScope: 'retained-semantic-tools-regions-only'},
      });
    }
    summaries.push({suite, coverage: [...semanticCoverage], regions: semanticRanges, recordIds: semanticIds});
  }
  return summaries;
}
