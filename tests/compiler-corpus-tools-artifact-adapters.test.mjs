import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addOriginalToolsArtifactPrograms,originalToolsHostGateCase} from '../tools/backends/compiler-corpus-tools-artifact-adapters.mjs';

const sourceRoot=fileURLToPath(new URL('..',import.meta.url));
const suite='tests/compiler-session-tools.test.mjs';
const titles=[
  'a complete real managed compiler driver transports AggregateError graphs with shared errors and cause identity',
  'the real compiler CLI emits structured source failures and preserves successful output with the same built artifact',
  'real CLI streaming UTF8 preserves split astral scalars BOM diagnostics and strict malformed-tail failures',
];
const sha256=value=>createHash('sha256').update(value).digest('hex');

async function services(transform=source=>source){
  const records=[],files=new Map();
  const file=async filename=>{
    if(!files.has(filename)){
      let bytes=await readFile(resolve(sourceRoot,filename));
      if(filename===suite)bytes=Buffer.from(transform(bytes.toString('utf8')));
      files.set(filename,{file:filename,sha256:sha256(bytes),bytes:bytes.length,content:bytes.toString('base64')});
    }
    return files.get(filename);
  };
  const text=async filename=>Buffer.from((await file(filename)).content,'base64').toString('utf8');
  return {records,sourceRoot,file,text,add:record=>records.push(record),
    locators:titles.map((contains,index)=>({file:suite,id:'original-tools-'+index,contains}))};
}

const workerSuite='tests/worker-runtime.test.mjs';
const workerTitle='long-lived worker implements the versioned NDJSON protocol and maps failures through project source maps';
async function workerServices(transform=source=>source){
  const fixture=await services(),baseFile=fixture.file;
  fixture.file=async filename=>{
    const original=await baseFile(filename);
    if(filename!==workerSuite)return original;
    const bytes=Buffer.from(transform(Buffer.from(original.content,'base64').toString('utf8')));
    return {...original,sha256:sha256(bytes),bytes:bytes.length,content:bytes.toString('base64')};
  };
  fixture.text=async filename=>Buffer.from((await fixture.file(filename)).content,'base64').toString('utf8');
  fixture.locators=[{file:workerSuite,id:'original-worker-source-map',contains:workerTitle}];
  return fixture;
}

test('worker mapping adapter retains the complete original protocol case and compiles its full fixture through the selected session',async()=>{
  const fixture=await workerServices(),source=await fixture.text(workerSuite);
  const result=await addOriginalToolsArtifactPrograms(fixture);
  assert.equal(result.length,1);assert.equal(fixture.records.length,1);
  const record=fixture.records[0],start=source.indexOf('test('+JSON.stringify(workerTitle));
  const end=source.length-(source.endsWith('\n')?1:0),original=source.slice(start,end);
  assert.equal(record.id,'original-tools-artifact:worker-source-mapping:bun');
  assert.deepEqual(record.coverage,['original-worker-source-map']);
  assert.equal(record.execution.kind,'compiler-session-program');
  assert.equal(record.execution.hostRuntime,'bun');
  assert.equal(record.execution.timeoutMs,20000);
  assert.equal(record.execution.setupReplacement.originalCaseTimeoutMs,20000);
  assert.equal(record.original.sourceSha256,sha256(source));
  assert.deepEqual(record.original.regions,[{start,end,byteStart:Buffer.byteLength(source.slice(0,start)),
    byteEnd:Buffer.byteLength(source.slice(0,end)),sha256:sha256(original)}]);
  const body=record.execution.hostSource;
  assert(body.includes(original.slice(original.indexOf('    const reloadSource ='))),
    'all original source location, requests, values, cancellation, reload, errors and final cleanup assertions remain verbatim');
  assert(body.includes(source.slice(source.indexOf('function createWorkerClient()'),source.indexOf('\ntest('))),
    'original worker process, reference calculation and helpers remain intact');
  assert(body.includes('await compileSelectedWorker({input: fixturePath, output: modulePath, sourceMap: true, compiler: {'));
  assert(body.includes('compiler.request({operation: "protocol", name: "build-operation-request", input})'));
  assert(body.includes('compiler.request({operation: "compile", source, filename, sourceMap: {generatedFile, sourceName}})'));
  assert(body.includes('} finally { compiler.close(); }'));
  assert(!body.includes('[compilerPath, "--source-map", "--output", modulePath, fixturePath]'));
  assert(body.includes('assert.equal(session.host,configuration.target)'));
  assert(body.includes("configuration.target==='native'?{path:configuration.path,descriptor:{typed:configuration.typed,descriptor:configuration.descriptor}}"));
  assert(body.includes('import {compileFile as compileSelectedWorker} from '+JSON.stringify(new URL('../bootstrap/host/bun.mjs',import.meta.url).href)+';'));
  assert.deepEqual(record.original.dependencies.fixture,{file:'tests/fixtures/worker.eli',sha256:(await fixture.file('tests/fixtures/worker.eli')).sha256});
  assert.deepEqual(record.original.originalAssertions,[workerTitle]);
  assert.equal(record.original.completeLocatorCoverage,true);
  assert.equal(record.original.cases.length,1);
  assert.equal(record.original.cases[0].id,'original-worker-source-map');
  assert.equal(record.original.cases[0].sourceSha256,sha256(source));
  assert.deepEqual(record.original.cases[0].span,{start,end});
  assert.equal(record.original.coverageScope,'complete-source-mapping-worker-case-only');
  assert(record.modules.some(module=>module.filename==='bootstrap/host/compiler-session.eli'));
});

test('worker mapping binds the actual shortened manifest locator to its unique complete selected-session case',async()=>{
  const fixture=await workerServices(),source=await fixture.text(workerSuite);
  const manifest=JSON.parse(await fixture.text('tests/conformance/manifest.json'));
  const feature=manifest.features.find(feature=>feature.id==='runtime.source-level-failure-mapping');
  const index=feature.evidence.findIndex(locator=>locator.file===workerSuite);
  assert.equal(index,3);
  const locator={...feature.evidence[index],id:'stable-compatibility:evidence:'+feature.id+':'+index};
  assert.equal(locator.contains,'maps failures through project source maps');
  fixture.locators=[locator,
    {file:workerSuite,id:'unrelated-worker-case',contains:'worker negotiates the persistent value codec without changing JSON mode'},
    {file:workerSuite,id:'ambiguous-worker-case',contains:'worker'},
    {file:workerSuite,id:'missing-worker-case',contains:'unregistered worker case'}];
  await addOriginalToolsArtifactPrograms(fixture);
  assert.equal(fixture.records.length,1);
  const record=fixture.records[0],bound=record.original.cases;
  assert.deepEqual(record.coverage,[locator.id]);
  assert.equal(record.original.completeLocatorCoverage,true);
  assert.equal(bound.length,1);assert.equal(bound[0].id,locator.id);
  assert.equal(bound[0].title,workerTitle);
  assert.equal(bound[0].timeoutMs,20000);
  assert.equal(bound[0].sourceSha256,sha256(source));
  const complete=source.slice(bound[0].span.start,bound[0].span.end);
  assert.equal(bound[0].sha256,sha256(complete));
  assert(complete.includes(locator.contains));
  assert(record.execution.hostSource.includes(complete.slice(complete.indexOf('    const reloadSource ='))),
    'coverage is attached to the complete retained execution, not just a matching title');
  assert(record.execution.hostSource.includes('compiler.request({operation: "compile", source, filename, sourceMap: {generatedFile, sourceName}})'));
  assert.equal(record.execution.timeoutMs,20000);
});

test('worker mapping adapter rejects new setup imports or a changed compiler invocation before registering coverage',async()=>{
  for(const transform of [
    source=>source.replace('const projectDirectory =','import {other} from "../tools/other.mjs";\nconst projectDirectory ='),
    source=>source.replace('[compilerPath, "--source-map", "--output", modulePath, fixturePath]',
      '[compilerPath, "--source-map", "--output", modulePath, "different.eli"]'),
  ]){
    const fixture=await workerServices(transform);
    await assert.rejects(addOriginalToolsArtifactPrograms(fixture),/original worker dependencies changed|original compiler CLI setup boundary changed/);
    assert.deepEqual(fixture.records,[]);
  }
});

test('tools original gates bind the exact host execution report and source inventory cases without claiming selected execution',async()=>{
  const fixture=await services();
  const manifest=JSON.parse(await fixture.text('tests/conformance/manifest.json'));
  const featureFiles=new Map([
    ['runtime.hamt-layout-benchmark','tests/collection-layout-benchmark.test.mjs'],
    ['stdlib.transient-builder-performance','tests/transient-builder-benchmark.test.mjs'],
    ['runtime.protocol-generated-production','tests/public-surface.test.mjs'],
    ['stdlib.portable-json-values','tests/public-surface.test.mjs'],
    ['stdlib.portable-numeric-foundation','tests/public-surface.test.mjs'],
    ['stdlib.portable-result-values','tests/public-surface.test.mjs'],
    ['runtime.transport-safe-protocol-definitions','tests/worker-value-codec.test.mjs'],
  ]);
  const found=[];
  for(const feature of manifest.features){
    const filename=featureFiles.get(feature.id);if(!filename)continue;
    for(const locator of feature.evidence.filter(locator=>locator.file===filename)){
      const source=await fixture.text(filename);
      const gate=await originalToolsHostGateCase({locator,source,file:fixture.file});
      assert(gate,feature.id+': '+locator.contains);found.push({locator,gate});
      const selected=source.slice(gate.region.start,gate.region.end);
      assert(selected.includes(locator.contains));
      assert.equal(gate.region.sha256,sha256(selected));
      assert.equal(gate.region.byteStart,Buffer.byteLength(source.slice(0,gate.region.start)));
      assert.equal(gate.region.byteEnd,Buffer.byteLength(source.slice(0,gate.region.end)));
      assert.equal(gate.originalAssertion,locator.contains);
      assert.equal(gate.timeoutMs,5000);
      assert(gate.reason.includes('no language compiler or selected-product injection'));
      assert.equal(gate.execution,undefined,'a retained gate is never a fabricated selected-product program');
      for(const dependency of gate.dependencies)assert.equal(dependency.sourceSha256,(await fixture.file(dependency.file)).sha256);
      if(filename==='tests/public-surface.test.mjs')assert(gate.dependencies.some(item=>item.file==='contracts/public-surface.json'));
      if(filename==='tests/transient-builder-benchmark.test.mjs')assert(gate.dependencies.some(item=>item.file==='benchmarks/transient-builder-macos-arm64.json'));
    }
  }
  assert.equal(found.length,11);
  assert.equal(found.filter(({gate})=>gate.kind==='original-host-runtime-case').length,3);
  const current=found.find(({gate})=>gate.kind==='original-current-source-report-case');
  assert(current);assert.equal(current.gate.registration,'currentPerformanceTest(test)');
  assert((await fixture.text(current.locator.file)).slice(current.gate.region.start,current.gate.region.end)
    .includes('transientBuilderSourceDigest()'),'the original current-source performance gate is retained under its original condition');
  assert.deepEqual(fixture.records,[]);
});

test('tools gate classification refuses compiler cases unknown dependencies and borrowed sibling titles',async()=>{
  const fixture=await services();
  const worker=await fixture.text(workerSuite);
  assert.equal(await originalToolsHostGateCase({locator:{file:workerSuite,contains:workerTitle},source:worker,file:fixture.file}),null);
  const locator={file:'tests/public-surface.test.mjs',contains:'repository public surface matches every tracked implementation'};
  const source=await fixture.text(locator.file);
  for(const changed of [source+'\nimport {other} from "./other.mjs";\n',source.replace('  expect(await checkPublicSurface', '  compile_string("source");\n  expect(await checkPublicSurface')]){
    await assert.rejects(originalToolsHostGateCase({locator,source:changed,file:fixture.file}),/dependencies changed|acquired a compiler path/);
  }
  assert.equal(await originalToolsHostGateCase({locator:{...locator,contains:'new unbound case'},source,file:fixture.file}),null);
});

test('artifact adapters preserve aggregate source and bind its reference to the selected producer complete JavaScript product',async()=>{
  const fixture=await services(),source=await fixture.text(suite);
  const result=await addOriginalToolsArtifactPrograms(fixture);
  assert.equal(result.length,1);assert.equal(fixture.records.length,2);
  const start=source.indexOf('const aggregateSource='),end=source.indexOf("\ntest('optional parameter defaults resolve",start);
  assert(start>=0&&end>start);
  const original=source.slice(start,end),functionEnd=original.indexOf('\nconst aggregateEntry=');
  assert(functionEnd>0);
  const aggregateAssertions=original.slice(original.indexOf('    function caught('),original.indexOf("\ntest('the real compiler CLI"));
  const cliAssertions=original.slice(original.indexOf("test('the real compiler CLI"));
  assert(aggregateAssertions.length>0&&cliAssertions.length>0);
  for(const record of fixture.records){
    assert.deepEqual(record.coverage,fixture.locators.map(locator=>locator.id));
    assert.equal(record.original.sourceSha256,sha256(source));
    assert.deepEqual(record.original.regions,[{start,end,byteStart:Buffer.byteLength(source.slice(0,start)),
      byteEnd:Buffer.byteLength(source.slice(0,end)),sha256:sha256(original)}]);
    assert.deepEqual(record.original.originalAssertions,titles);
    const host=record.execution.hostSource;
    assert(host.includes(original.slice(0,functionEnd)),'the complete source generator must remain in the transported region');
    assert(host.includes(aggregateAssertions),'all aggregate graph identity, metadata and recovery assertions remain verbatim');
    assert(host.includes(cliAssertions),'both complete CLI cases and their original deadlines remain verbatim');
    assert(host.includes("const oracleArtifact=await buildSelectedArtifact(producer,'aggregate-reference','javascript',structuredClone(completeSources));"));
    assert(host.includes('const oracleSource=aggregateSource(pathToFileURL(oracleArtifact.path).href);'));
    assert(host.includes("const javascript=producer.request({operation:'compile',source:oracleSource,filename:'aggregate-entry.eli'}).javascript;"));
    assert(host.includes("const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));"));
    assert(host.includes("sources.modules.push({id:'aggregate-entry.mjs',filename:'aggregate-entry.eli',source:aggregateEntry});"));
    assert(host.includes("assert.equal(artifact.provenance.producerHost,producer.host);"));
    assert(host.includes('assert.deepEqual(artifact.provenance.compiledModuleIds,sources.modules.map(module=>module.id));'));
    assert(host.includes("const artifact=await buildSelectedArtifact(producer,'aggregate-selected',configuration.target,sources);"));
    assert(!host.includes('withBackendPhaseTrace'), 'optional local observation must not enter independent host replay');
    const observedSetup="const artifact=await withBackendPhaseTrace(()=>buildIndependentCompiler({host:'wasm',outputRoot:temporary,session:producer,sources}));";
    const selectedSetup="const artifact=await buildSelectedArtifact(producer,'aggregate-selected',configuration.target,sources);";
    assert(source.includes(observedSetup));
    assert(!host.includes("const oraclePath=resolve(directory,'aggregate-entry.mjs')"));
    assert(!host.includes("aggregateSource(pathToFileURL(resolve(directory,'host/compiler-session.mjs')).href)"));
    const changes=record.execution.setupReplacement.changes;
    assert.equal(changes.length,6);
    assert(changes.some(change=>change.beforeSha256===sha256(observedSetup)&&change.afterSha256===sha256(selectedSetup)),
      'selected setup must bind the complete observed original build without changing its assertions');
    const before="const oracleSource=aggregateSource(pathToFileURL(resolve(directory,'host/compiler-session.mjs')).href);";
    const after="const oracleArtifact=await buildSelectedArtifact(producer,'aggregate-reference','javascript',structuredClone(completeSources));\n    const oracleSource=aggregateSource(pathToFileURL(oracleArtifact.path).href);";
    assert(changes.some(change=>change.beforeSha256===sha256(before)&&change.afterSha256===sha256(after)),
      'the reference transport replacement must retain exact original and transformed source hashes');
    assert.deepEqual(record.original.setupReplacement.changes,changes);
    assert.equal(record.execution.setupReplacement.beforeAllTimeoutMs,120000);
    assert.deepEqual(record.execution.setupReplacement.originalCaseTimeouts,[120000,30000,30000]);
  }
  assert.deepEqual(fixture.records.map(record=>record.execution.hostRuntime),['node','bun']);
});

test('artifact adapters reject an unrecognized oracle dependency boundary instead of using a seed reference',async()=>{
  const fixture=await services(source=>source.replace(
    "const oracleSource=aggregateSource(pathToFileURL(resolve(directory,'host/compiler-session.mjs')).href);",
    "const oracleSource=aggregateSource(pathToFileURL(resolve(directory,'renamed/compiler-session.mjs')).href);"));
  await assert.rejects(addOriginalToolsArtifactPrograms(fixture),/original compiler artifact setup changed: const oracleSource=/);
  assert.deepEqual(fixture.records,[]);
});

const semanticFixtures=[
  'tests/fixtures/core-expression-forms.eli','tests/fixtures/core-language-api-usage.eli',
  'tests/fixtures/core-stdlib-usage.eli','tests/fixtures/wasm-managed-source-collections.eli',
  'tests/fixtures/managed-stdlib-value-json.eli',
];
const semanticLocators=[
  'real JavaScript compiler sessions expose compile, format and read-only semantic tools',
  'tool definitions and references preserve shadowing, initializer scope and assignment roles',
  'parallel and sequential local bindings retain their distinct actual scopes',
  'Unicode scalar queries preserve exact source spans and reject invalid units or offsets',
  'macro invocation links to its definition while generated references retain truthful expansion origins',
  'read and analysis failures return the actual stable diagnostics and leave the session usable',
  'tool requests preserve cached runtime and project revision state',
  'production tools analyze complete existing fixture ',
  'abort boundaries and close use the actual production compiler session lifecycle',
  'optional parameter defaults resolve in the enclosing scope before any required optional or rest parameter enters the function scope',
  'nested optional vector and map bindings preserve qualified local suffix spans rest bindings and actual write targets',
  'macros in unexpanded parameter patterns retain the original compiler refusal without invented semantic references',
  'parameter default queries preserve existing analyzer refusals and never invent references or new optional syntax',
  'Given nested empty and unrelated scopes When semantic tools resolve captures Then outer reads writes shadowing and unknown globals remain exact',
  'Given exact UTF16 source When semantic tools identify it Then SHA256 includes BOM astral and unmatched surrogate units',
  'Given an older semantic result When source or filename changes Then queries and edit previews reject its identity before parsing',
  'Given Unicode source and disjoint original scalar ranges When previewing a complete edit batch Then text and subsequent full analysis are exact',
  'Given insertion deletion EOF and unmatched UTF16 units When previewing edits Then scalar addressing never splits an original surrogate pair',
  'Given malformed ambiguous or overlapping edit batches When previewing Then the whole request refuses without publishing partial text',
  'Given macro and lexical tools results When previewing without publishing Then compiler caches and full-analysis origins stay isolated',
];
async function semanticServices(transform){
  const fixture=await services(transform);
  fixture.locators=semanticLocators.map((contains,index)=>({file:suite,id:'semantic-tools-'+index,contains}));
  return fixture;
}
function semanticRanges(source){
  const first=source.indexOf('const analyze ='),boundary=source.indexOf('\nasync function withBackendPhaseTrace',first);
  const tail=source.indexOf("test('optional parameter defaults resolve");
  assert(first>=0&&boundary>first&&tail>boundary);
  return [[first,boundary],[tail,source.length]].map(([start,end])=>({start,end,
    byteStart:Buffer.byteLength(source.slice(0,start)),byteEnd:Buffer.byteLength(source.slice(0,end)),
    sha256:sha256(source.slice(start,end))}));
}

test('semantic adapters retain complete original tools assertions with actual selected sessions and exact fixture identities',async()=>{
  const fixture=await semanticServices(),source=await fixture.text(suite),ranges=semanticRanges(source);
  const result=await addOriginalToolsArtifactPrograms(fixture);
  assert.equal(result.length,1);assert.equal(fixture.records.length,2);
  const before="const session = await createCompilerSession({host: 'javascript', compiler: driver});";
  const after='const session = await openSelected();';
  const first=source.slice(ranges[0].start,ranges[0].end),tail=source.slice(ranges[1].start);
  assert.equal(first.split(before).length,2);
  for(const record of fixture.records){
    assert.equal(record.id,'original-managed:compiler-session-tools:'+record.execution.hostRuntime,
      'the migrated semantic replay retains its existing record identity');
    assert.deepEqual(record.coverage,fixture.locators.map(item=>item.id));
    assert.deepEqual(record.original.regions,ranges);
    assert.equal(record.original.sourceSha256,sha256(source));
    assert.equal(record.original.coverageScope,'retained-semantic-tools-regions-only');
    assert.deepEqual(record.expected,{kind:'seed-program',oracleRequired:true});
    assert(!record.execution.supportingCompilerProducts,'semantic replay must use the selected product directly');
    assert(!record.original.originalAssertions.includes(titles[0]),'semantic coverage must not claim the separate aggregate case');
    for(const title of semanticLocators.filter(title=>!title.endsWith(' ')))assert(record.original.originalAssertions.includes(title),title);
    for(const filename of semanticFixtures){
      assert(record.original.originalAssertions.includes('production tools analyze complete existing fixture '+filename));
      const identity=record.original.fixtureIdentities.find(item=>item.filename===filename);
      assert.deepEqual(identity,{filename,sha256:(await fixture.file(filename)).sha256});
      assert(record.execution.hostSource.includes(JSON.stringify(identity)),'the exact full fixture hash is checked before replay');
    }
    const host=record.execution.hostSource;
    assert(host.includes(first.replace(before,after)),'all original early semantic assertion bodies remain verbatim');
    assert(host.includes(tail),'all original tail assertions remain verbatim, including added tools cases');
    assert(host.includes("import {createHash} from 'node:crypto';"));
    assert(host.includes('const editPreview = (session, source, identity, edits, extra = {}) => session.request({'),
      'the retained original edit-preview helper accompanies the new tail assertions');
    assert(host.includes('async function withSession(run){const session=await openSelected();try{await run(session);}finally{session.close();}}'));
    assert(host.includes('const session=await createCompilerSession({host:configuration.target,compiler:selectedDriver,'));
    assert(host.includes("const selectedDriver=configuration.target==='javascript'?await import(pathToFileURL(configuration.path).href):undefined;"));
    assert(host.includes("const selectedBytes=configuration.target==='wasm'?new Uint8Array(await readFile(configuration.path)):undefined;"));
    assert(host.includes("...(configuration.target==='native'?{path:configuration.path,descriptor:{typed:configuration.typed,descriptor:configuration.descriptor}}:{})"));
    assert(host.includes('assert.equal(session.host,configuration.target);return session;'));
    assert(!host.includes('buildSelectedArtifact('));assert(!host.includes('withBackendPhaseTrace'));
    assert(!host.includes("createCompilerSession({host: 'javascript', compiler: driver})"));
    assert(host.includes("const module = await import('data:text/javascript;base64,' + Buffer.from(compiled.javascript).toString('base64'));"),
      'the generated JavaScript still executes as the independent original semantic check');
    assert(host.includes('function test(name,run,timeout=5000){cases.push({name,run,timeout});}'));
    assert(host.includes('for(const record of cases)await timed(record.name,record.run,record.timeout);'));
    assert.equal(record.execution.setupReplacement.defaultCaseTimeoutMs,5000);
    assert.equal(record.execution.timeoutMs,120000,'the original complete semantic replay deadline remains unchanged');
    assert.equal(record.execution.setupReplacement.deadlines,'retained-test-registration-arguments');
    const dependencies=record.execution.setupReplacement.dependencies;
    assert(dependencies.imports.includes("import {createHash} from 'node:crypto';"));
    assert.deepEqual(record.original.setupReplacement.dependencies,dependencies);
    for(const dependency of [dependencies.header,dependencies.session]){
      assert.equal(dependency.sha256,sha256(source.slice(dependency.start,dependency.end)));
      assert.equal(dependency.byteStart,Buffer.byteLength(source.slice(0,dependency.start)));
      assert.equal(dependency.byteEnd,Buffer.byteLength(source.slice(0,dependency.end)));
    }
    assert.equal(source.slice(dependencies.session.start,dependencies.session.end),
      "async function withSession(run) {\n  const session = await createCompilerSession({host: 'javascript', compiler: driver});\n  try {await run(session);} finally {session.close();}\n}");
    assert.deepEqual(record.execution.setupReplacement.changes,[{role:'selected-complete-compiler-transport',
      beforeSha256:sha256(before),afterSha256:sha256(after)}]);
    assert.deepEqual(record.original.setupReplacement.changes,record.execution.setupReplacement.changes);
  }
  assert.deepEqual(fixture.records.map(record=>record.execution.hostRuntime),['node','bun']);
  assert.deepEqual(result[0].recordIds,fixture.records.map(record=>record.id));
});

test('semantic adapters include newly appended original cases and preserve their explicit registration deadlines',async()=>{
  const title='appended original semantic identity case';
  const appended="\ntest('"+title+"',()=>withSession(session=>{\n  assert.equal(analyze(session,lexical).ok,true);\n}),1234);\n";
  const fixture=await semanticServices(source=>source+appended);
  fixture.locators.push({file:suite,id:'semantic-appended',contains:title});
  await addOriginalToolsArtifactPrograms(fixture);
  const source=await fixture.text(suite);
  for(const record of fixture.records){
    assert(record.coverage.includes('semantic-appended'));
    assert.equal(record.original.originalAssertions.at(-1),title);
    assert(record.execution.hostSource.includes(appended));
    assert.equal(record.original.regions.at(-1).end,source.length);
    assert.equal(record.original.regions.at(-1).sha256,sha256(source.slice(record.original.regions.at(-1).start)));
  }
});

test('semantic adapters reject an unrecognized session setup without substituting a JavaScript host',async()=>{
  const fixture=await semanticServices(source=>source.replace(
    "const session = await createCompilerSession({host: 'javascript', compiler: driver});\n  try {\n    const reason",
    "const session = await createCompilerSession({host: 'renamed', compiler: driver});\n  try {\n    const reason"));
  await assert.rejects(addOriginalToolsArtifactPrograms(fixture),/original compiler artifact setup changed: const session =/);
  assert.deepEqual(fixture.records,[]);
});

test('artifact and migrated semantic regions retain distinct original coverage and one record per host',async()=>{
  const fixture=await services();
  fixture.locators.push(...semanticLocators.map((contains,index)=>({file:suite,id:'semantic-'+index,contains})),
    ...semanticFixtures.map((filename,index)=>({file:suite,id:'semantic-fixture-'+index,
      contains:'production tools analyze complete existing fixture '+filename,
      originalCase:{titleExpression:"'production tools analyze complete existing fixture ' + filename"}})));
  const summaries=await addOriginalToolsArtifactPrograms(fixture);
  assert.equal(summaries.length,2);assert.equal(fixture.records.length,4);
  assert.deepEqual(fixture.records.map(record=>record.id),[
    'original-tools-artifact:compiler-session-tools:node','original-tools-artifact:compiler-session-tools:bun',
    'original-managed:compiler-session-tools:node','original-managed:compiler-session-tools:bun',
  ]);
  for(const record of fixture.records){
    const semantic=record.id.startsWith('original-managed:');
    assert.deepEqual(record.coverage,fixture.locators.filter(item=>item.id.startsWith(semantic?'semantic-':'original-tools-')).map(item=>item.id));
    if(semantic){
      assert.equal(record.original.cases.length,semanticFixtures.length);
      assert.deepEqual(record.original.cases.map(item=>item.id),semanticFixtures.map((_,index)=>'semantic-fixture-'+index));
    }
  }
});

test('semantic replay rejects unknown header dependencies before any records or compiler jobs are published',async()=>{
  for(const transform of [
    source=>source.replace("import {createHash} from 'node:crypto';","import {createHash, randomUUID} from 'node:crypto';"),
    source=>source.replace("import {createHash} from 'node:crypto';","import {createHash} from 'node:crypto';\nimport {futureHelper} from './future-helper.mjs';"),
  ]){
    const fixture=await semanticServices(transform);
    await assert.rejects(addOriginalToolsArtifactPrograms(fixture),/original compiler semantic dependencies changed/);
    assert.deepEqual(fixture.records,[]);
  }
});

test('semantic replay rejects changed original lifecycle or omitted setup helpers instead of masking them with its own setup',async()=>{
  for(const transform of [
    source=>source.replace('try {await run(session);} finally {session.close();}', 'try {await run(session);} finally {await session.close();}'),
    source=>source.replace('\nconst analyze =','\nconst futureHelper = value => value;\nconst analyze ='),
  ]){
    const fixture=await semanticServices(transform);
    await assert.rejects(addOriginalToolsArtifactPrograms(fixture),/original compiler semantic session lifecycle changed/);
    assert.deepEqual(fixture.records,[]);
  }
});
