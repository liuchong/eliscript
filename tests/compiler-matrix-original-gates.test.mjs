import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {runOriginalCompilerGates} from '../tools/backends/compiler-matrix.mjs';
import {loadCompilerSources} from '../tools/backends/compiler-build.mjs';
import {loadLiteralSources} from '../tools/backends/build.mjs';
import {compilerSourceIdentity, compilerDigest, assertCompilerArtifactSources} from '../tools/backends/compiler-bootstrap.mjs';
import {addOriginalManagedLibraryAdapters} from '../tools/backends/compiler-corpus-managed-adapters.mjs';
import {addOriginalManagedFixtureAdapters} from '../tools/backends/compiler-corpus-managed-fixtures.mjs';
import {addOriginalToolsArtifactPrograms} from '../tools/backends/compiler-corpus-tools-artifact-adapters.mjs';
import {originalManagedSuites,originalManagedCaseLocators} from '../tools/backends/compiler-corpus-managed-cases.mjs';

async function fixture(recipe, run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'eliscript-original-gates-'));
  try {
    for (const path of ['bootstrap/compiler', 'bootstrap/backends', 'bootstrap/host', 'bootstrap/runtime', 'evidence']) await mkdir(resolve(directory, path), {recursive: true});
    // The loader's complete source contract includes the real private stdlib
    // graph. Keep it complete even though this unit only exercises scheduling.
    for (const record of await loadLiteralSources()) {
      const output=resolve(directory,record.filename);await mkdir(resolve(output,'..'),{recursive:true});
      await writeFile(output,record.source);
    }
    await writeFile(resolve(directory, 'bootstrap/host/compiler-session.eli'), '(export)');
    await writeFile(resolve(directory, 'bootstrap/runtime/memory.eli'), '; unit fixture runtime\n');
    await writeFile(resolve(directory, 'Makefile'), 'test-core:\n' + recipe.map(line => '\t@' + line + '\n').join(''));
    const file = 'original-corpus.json', bytes = Buffer.from('{"original":"unit fixture"}\n');
    await writeFile(resolve(directory, file), bytes);
    const corpus = {document: {originalGateEvidence: {required: true,
      execution: {provider: 'local', command: 'make test-core', applicationEvidence: false}, coverageIds: ['original-unit-locator']}},
      originals: {manifests: [{file, sha256: compilerDigest(bytes)}]}};
    const options = {sourceRoot: directory, corpus, sourceIdentity: compilerSourceIdentity(await loadCompilerSources({sourceRoot: directory})), directory: resolve(directory, 'evidence')};
    await run(options);
  } finally {await rm(directory, {recursive: true, force: true});}
}

test('matrix original gate records the actual core command exit status and exact log bytes', () => fixture(['echo original-command-ran', 'echo original-stderr >&2'], async options => {
  const result = await runOriginalCompilerGates(options);
  assert.equal(result.status, 'passed');assert.equal(result.exitCode, 0);assert.equal(result.signal, null);
  assert.deepEqual(result.command, ['make', 'test-core']);assert.deepEqual(result.coverageIds, ['original-unit-locator']);
  for (const record of result.files) {
    const data = await readFile(resolve(options.directory, record.path));
    assert.equal(compilerDigest(data), record.sha256);assert.equal(data.length, record.bytes);
  }
  assert.equal(await readFile(resolve(options.directory, 'original-gates.stdout.log'), 'utf8'), 'original-command-ran\n');
  assert.equal(await readFile(resolve(options.directory, 'original-gates.stderr.log'), 'utf8'), 'original-stderr\n');
}));

test('matrix original gate preserves command failure instead of producing acceptance', () => fixture(['echo failed-original-assertion >&2', 'exit 7'], async options => {
  const result = await runOriginalCompilerGates(options);
  assert.equal(result.status, 'failed');assert.notEqual(result.exitCode, 0);
  assert.match(await readFile(resolve(options.directory, 'original-gates.stderr.log'), 'utf8'), /failed-original-assertion/);
}));

test('matrix original gate rejects changed compiler sources or original manifest bytes', async () => {
  for (const path of ['bootstrap/runtime/memory.eli', 'original-corpus.json']) await fixture(['echo changed >> ' + path], async options => {
    const result = await runOriginalCompilerGates(options);
    assert.equal(result.status, 'failed');
    assert.equal(path.endsWith('.eli') ? result.sourceUnchanged : result.manifestsUnchanged, false);
  });
});

test('matrix original gate refuses a different command before executing it', () => fixture(['echo should-not-run'], async options => {
  options.corpus.document.originalGateEvidence.execution.command = 'make test-applications';
  await assert.rejects(runOriginalCompilerGates(options), /stable core contract/);
}));

test('compiler producers bind complete sources including negative zero Unicode runtime and private literal modules', () => {
  const sources={entry:'host/compiler-session.mjs',modules:[
    {id:'host/compiler-session.mjs',filename:'bootstrap/host/compiler-session.eli',source:'(defconst source "😀\\ud800")\n'},
    {id:'bootstrap/compiler.mjs',filename:'bootstrap/compiler/compiler.eli',source:'(defun zero () -0.0)\n'},
  ],runtime:{filename:'bootstrap/runtime/memory.eli',source:'(module runtime)\n'},
  literalSources:[{id:'stdlib/private.mjs',filename:'stdlib/private.eli',source:'(defconst literal [1 2])\n'}],
  hostSources:[{id:'host/provider.mjs',filename:'host/provider.mjs',source:'export const value=1;\n'}]};
  const record=value=>({id:value.id,filename:value.filename,sha256:compilerDigest(Buffer.from(value.source,'utf16le'))});
  const artifact={entry:sources.entry,sourceIdentity:{algorithm:'sha256',encoding:'utf16le',
    modules:sources.modules.map(record),runtime:{filename:sources.runtime.filename,sha256:compilerDigest(Buffer.from(sources.runtime.source,'utf16le'))},
    literalSources:sources.literalSources.map(record),hostSources:sources.hostSources.map(record)}};
  assert.equal(assertCompilerArtifactSources(artifact,sources),artifact);
  for(const mutate of [
    value=>value.sourceIdentity.modules.pop(),
    value=>value.sourceIdentity.modules.push({...value.sourceIdentity.modules[0]}),
    value=>value.sourceIdentity.runtime.sha256='0'.repeat(64),
    value=>value.sourceIdentity.literalSources=[],
    value=>value.sourceIdentity.hostSources[0].filename='other.mjs',
    value=>value.sourceIdentity.encoding='utf8',
    value=>value.entry='bootstrap/compiler.mjs',
  ]){
    const changed=structuredClone(artifact);mutate(changed);
    assert.throws(()=>assertCompilerArtifactSources(changed,sources));
  }
  const reordered=structuredClone(artifact);reordered.sourceIdentity.modules.reverse();
  assert.equal(assertCompilerArtifactSources(reordered,sources),reordered);
  const missing=structuredClone(sources);delete missing.literalSources;
  assert.throws(()=>assertCompilerArtifactSources(artifact,missing),/undeclared literalSources/);
});

test('new managed library corpus transports complete original fixtures and original budgets into every selected target', async () => {
  const sourceRoot=resolve(import.meta.dir,'..'),records=[],evidence=new Map();
  const fixtureNames=['core-modules','transient-state','sorted','sequence-data','wire'];
  const stableFiles=new Set(fixtureNames.map(name=>'tests/fixtures/wasm-managed-'+name+'.eli'));
  const suites=['core-modules','transient-state','sorted-core','sequence-data','wire'];
  const locators=suites.map((name,index)=>({id:'original-library-'+index,file:'tests/wasm-managed-'+name+'.test.mjs',
    contains:index===0?'Given original standard module imports':index===1?'Given the complete transient state dependency graph':
      index===2?'Given complete original sorted and ordering source modules':index===3?'internal infinite, cache, close, metadata, paths, metrics and IEEE observations':
      'Given the identical complete wire graph'}));
  locators.push({id:'original-public-tools',file:'tests/compiler-session-tools.test.mjs',contains:'Unicode scalar queries preserve exact source spans'});
  const file=async filename=>{
    if(!evidence.has(filename)){
      const bytes=await readFile(resolve(sourceRoot,filename));
      evidence.set(filename,{file:filename,sha256:compilerDigest(bytes),bytes:bytes.length,content:bytes.toString('base64')});
    }
    return evidence.get(filename);
  };
  const text=async filename=>Buffer.from((await file(filename)).content,'base64').toString('utf8');
  await addOriginalManagedLibraryAdapters({add:record=>records.push(record),locators,text,file,stableFiles,sourceRoot});
  for(const fixture of stableFiles){
    const cases=records.filter(record=>record.coverage.includes('stable-compatibility:'+fixture));
    assert(cases.length>0,fixture+' requires actual selected-artifact execution records');
    assert.deepEqual([...new Set(cases.map(record=>record.execution.hostRuntime))].sort(),['bun','node']);
    for(const record of cases){
      assert.equal(record.execution.kind,'original-program');assert.equal(record.execution.referenceArtifact,true);
      assert.equal(record.execution.childProcesses,'inherit-selected-artifact');assert.equal(record.execution.zeroImports,!fixture.endsWith('wire.eli'));
      assert.equal(record.expected.oracleRequired,true);assert(record.modules.some(module=>module.filename===fixture));
      assert.equal(record.original.sourceSha256,(await file(record.original.suite)).sha256);
      if(fixture.endsWith('sequence-data.eli')){
        assert.deepEqual(record.execution.runtimeOptions,{maxSlots:1024,initialBytes:65536,maxBytes:16777216});
        assert.deepEqual(record.memory,{initialPages:128,maximumPages:4096});
        assert.equal(record.auto,65536);assert.equal(record.execution.timeoutMs,60000);
      }else{
        assert.deepEqual(record.execution.runtimeOptions,{maxSlots:8192,initialBytes:262144,maxBytes:16777216});
        assert.deepEqual(record.memory,{initialPages:4,maximumPages:1024});
        assert([1,65536].includes(record.auto));
      }
    }
  }
  const transient=records.find(record=>record.id==='original-managed:transient-state:node:auto-1');
  assert(transient.execution.hostSource.includes('[0, 1, 31, 32, 33, 63, 64, 1023, 1024, 1055, 1056, 1057]'));
  const wire=records.find(record=>record.id==='original-managed:wire:node:auto-1');
  assert(wire.execution.hostSource.includes('index<128'));assert(wire.execution.hostSource.includes('await checkNetwork(runtime)'));
  assert(wire.execution.hostSource.includes('await checkJavaScriptNetwork()'));
  assert(wire.execution.hostSource.includes("assert.equal(item.module,'eliscript.host')"));
  const sequence=records.find(record=>record.id==='original-managed:sequence-data:node:auto-65536');
  for(const name of ['runtime/core/transducer.mjs','runtime/core/sequence.mjs','runtime/core/data.mjs','runtime/core/value-internals.mjs','runtime/testing/value.mjs'])
    assert(sequence.modules.some(module=>module.id==='public/'+name),name+' requires its actual target export cell');
  for(const family of ['sequence','text','object'])assert(records.some(record=>record.id==='original-managed:sequence-data-portable-'+family+':node:auto-65536'));
  assert(records.some(record=>record.id==='original-managed:sequence-data-relational-set:node:auto-65536'));
  const tools=records.filter(record=>record.execution.kind==='compiler-session-program');
  assert.deepEqual(tools.map(record=>record.execution.hostRuntime).sort(),['bun','node']);
  const sources=await loadCompilerSources({sourceRoot});
  for(const record of tools){
    assert.equal(record.request.phased,false);assert.equal(record.execution.runtimeProfile,'compiler');
    assert.deepEqual(record.modules,sources.modules);assert.equal(record.entry,sources.entry);
    assert.equal(record.modules.filter(module=>module.filename.startsWith('bootstrap/compiler/')).length,13);
    assert(record.execution.hostSource.includes('host:configuration.target'));
    assert(record.execution.hostSource.includes('const session = await open();'));
  }
});

test('original managed case identities bind complete declarations original dynamic titles exact input variants and original deadlines',()=>{
  const file='tests/compiler-session-tools.test.mjs';
  const source=`const fake="test('not a registration',()=>{})";
const filenames=['first.eli','second.eli'];
for(const filename of filenames)test('original '+filename,()=>{const pattern=/[(){}]/;if(!pattern.test('('))throw Error('original assertion');},3_000);
test.skipIf(process.arch!=='arm64')('actual native original',async()=>{await Promise.resolve();},120000);
`;
  const locators=originalManagedCaseLocators(file,source);
  assert.deepEqual(locators.map(item=>item.contains),['original first.eli','original second.eli','actual native original']);
  assert.deepEqual(locators.map(item=>item.originalCase.timeoutMs),[3000,3000,120000]);
  assert.deepEqual(locators.slice(0,2).map(item=>item.originalCase.parameters),[{filename:'first.eli'},{filename:'second.eli'}]);
  assert.equal(locators[0].originalCase.titleExpression,"'original '+filename");
  assert.equal(locators[0].originalCase.span.start,locators[1].originalCase.span.start);
  assert.notEqual(locators[0].id,locators[1].id);
  for(const locator of locators){
    const bound=locator.originalCase,body=source.slice(bound.span.start,bound.span.end);
    assert.equal(bound.sourceSha256,compilerDigest(Buffer.from(source)));
    assert.equal(bound.sha256,compilerDigest(Buffer.from(body)));
    assert.equal(bound.byteStart,Buffer.byteLength(source.slice(0,bound.span.start)));
    assert.equal(bound.byteEnd,Buffer.byteLength(source.slice(0,bound.span.end)));
  }
  const changed=originalManagedCaseLocators(file,source.replace('original assertion','changed assertion'));
  assert.notEqual(changed[0].originalCase.sha256,locators[0].originalCase.sha256);
  assert.throws(()=>originalManagedCaseLocators('tests/unregistered.test.mjs',source),/unregistered/);
  assert.throws(()=>originalManagedCaseLocators(file,"test('original',()=>{},timeoutFromEnvironment);"),/deadline/);
});

test('all six registered original suites enter selected-session records by individual case identity without whole-suite exemptions',async()=>{
  const sourceRoot=resolve(import.meta.dir,'..'),records=[],evidence=new Map(),locators=[];
  const file=async filename=>{
    if(!evidence.has(filename)){
      const bytes=await readFile(resolve(sourceRoot,filename));
      evidence.set(filename,{file:filename,sha256:compilerDigest(bytes),bytes:bytes.length,content:bytes.toString('base64')});
    }
    return evidence.get(filename);
  };
  const text=async filename=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.from((await file(filename)).content,'base64'));
  for(const suite of originalManagedSuites)locators.push(...originalManagedCaseLocators(suite,await text(suite)));
  const stableFiles=new Set(['core-modules','transient-state','sorted','sequence-data','wire'].map(name=>'tests/fixtures/wasm-managed-'+name+'.eli'));
  const services={add:record=>records.push(record),locators,text,file,stableFiles,sourceRoot};
  assert.deepEqual(await addOriginalManagedLibraryAdapters(services),[],'per-case mapping does not declare its original suite exhausted');
  await addOriginalToolsArtifactPrograms(services);
  for(const locator of locators){
    const plans=records.filter(record=>record.coverage.includes(locator.id));
    assert(plans.length>0,'actual original case requires selected execution: '+locator.contains);
    for(const record of plans){
      assert.notEqual(record.kind,'original-suite');assert.equal(record.expected.oracleRequired,record.kind==='sequence'?undefined:true);
      assert.equal(record.original.sourceSha256,locator.originalCase.sourceSha256);
      if(locator.originalCase.parameters.engine)assert.equal(record.execution.hostRuntime,locator.originalCase.parameters.engine);
      if(locator.originalCase.parameters.auto!==undefined)assert.equal(record.auto,locator.originalCase.parameters.auto);
      if(locator.originalCase.auto!==undefined)assert.equal(record.auto,locator.originalCase.auto);
      if(locator.originalCase.parameters.name)assert(record.id.includes('sequence-data-host-'+locator.originalCase.parameters.name+':'));
      if(locator.originalCase.parameters.family)assert(record.id.includes('sequence-data-portable-'+locator.originalCase.parameters.family+':'));
    }
  }
  const tools=locators.filter(item=>item.file==='tests/compiler-session-tools.test.mjs');
  for(const locator of tools)for(const host of ['node','bun'])assert(records.some(record=>record.coverage.includes(locator.id)&&record.execution.hostRuntime===host),locator.contains+' requires its actual '+host+' host');
  const wire=records.filter(record=>record.id.startsWith('original-managed:wire-original-host:'));
  assert(wire.length>0);for(const record of wire)assert(record.execution.hostSource.includes('wire.codec_report().validation.valid'));
});

test('original managed fixture recipes execute selected products and retain complete raw suites through the actual original Bun runner',async()=>{
  const sourceRoot=resolve(import.meta.dir,'..'),records=[],evidence=new Map();
  const contract=JSON.parse(await readFile(resolve(sourceRoot,'contracts/stable-compatibility-corpus.json'),'utf8'));
  const file=async filename=>{
    if(!evidence.has(filename)){
      const bytes=await readFile(resolve(sourceRoot,filename));
      evidence.set(filename,{file:filename,sha256:compilerDigest(bytes),bytes:bytes.length,content:bytes.toString('base64')});
    }
    return evidence.get(filename);
  };
  const text=async filename=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.from((await file(filename)).content,'base64'));
  const locators=[
    {id:'original-math-deadline',file:'tests/wasm-managed-math.test.mjs',contains:'Given precise finite cancellation and observable iterators'},
    {id:'original-arithmetic-raw',file:'tests/wasm-managed-arithmetic.test.mjs',contains:'increment and decrement retain mixed primitive conversion'},
    {id:'original-function-reflection',file:'tests/wasm-managed-function-properties.test.mjs',contains:'reflection-snapshot'},
    {id:'original-runtime-function-reflection',file:'tests/wasm-managed-function-properties-runtime.test.mjs',contains:'function'},
  ];
  assert.deepEqual(await addOriginalManagedFixtureAdapters({add:record=>records.push(record),
    locators,text,file,stableFiles:new Set(contract.fixtureFiles),sourceRoot}),[]);
  for(const family of['arithmetic','word','array-callbacks','arrays','array-construction','array-search','array-text',
    'builtins','callables','catch-destructuring','control','empty-bindings','exceptions','function-properties',
    'json','math','module-bindings','number-conversion','object-properties','objects','primitive-operators',
    'regexp','replacement','source-collections','strings','symbols','typeof','variadic-calls','js-cons']){
    const fixture='tests/fixtures/wasm-managed-'+family+'.eli';
    if(!contract.fixtureFiles.includes(fixture))continue;
    for(const host of['node','bun']){
      const record=records.find(item=>item.id==='original-managed-fixture:'+family+':'+host);
      assert(record,fixture+' has a real '+host+' selected-product observer');
      assert.equal(record.execution.hostRuntime,host);assert(record.coverage.includes('stable-compatibility:'+fixture));
      assert.equal(record.execution.kind,'original-program');assert.equal(record.execution.referenceArtifact,true);
      assert(record.execution.hostSource.includes('const expected=observe(oracle),actual=observe(m)'));
      assert(record.execution.hostSource.includes('runtime.stats().frameDepth'));
      assert(record.execution.hostSource.includes('runtime.live(),0'));
      assert(record.modules.some(module=>module.filename===fixture));
      assert.equal(record.original.sourceSha256,(await file(record.original.suite)).sha256);
    }
  }
  const sources=await loadCompilerSources({sourceRoot});
  for(const locator of locators){
    const record=records.find(item=>item.id==='original-managed-suite:complete-fixture-suites');
    assert(record);assert(record.coverage.includes(locator.id));
    assert.deepEqual(record.modules,sources.modules);assert.deepEqual(record.request.literalSources,sources.literalSources);
    assert.deepEqual(record.request.entries,sources.modules.map(module=>module.id));
    assert.equal(record.request.phased,true);assert.equal(record.entry,sources.entry);
    assert.equal(record.execution.hostRuntime,'bun');assert.equal(record.original.testSource,'unmodified');
    assert.equal(record.original.suites.find(item=>item.file===locator.file).sourceSha256,(await file(locator.file)).sha256);
    const transport=record.execution.hostSource;
    assert.match(transport,/args\s*[.]\s*push\s*\(\s*['"]--preload['"]\s*,\s*plugin\s*,\s*['"]test['"]\s*,\s*suite\s*,?\s*\)/,
      'the actual Bun runner must receive its selected namespace preload and the original suite');
    assert.match(transport,/spawn\s*\(\s*process[.]env[.]BUN\s*\?\?\s*['"]bun['"]\s*,\s*args\s*,/,
      'the original suite must execute in a real isolated Bun process');
    assert.match(transport,/suite\s*=\s*resolve\s*\(\s*sourceRoot\s*,\s*relativeSuite\s*,?\s*\)/,
      'the runner must load the original suite path');
    assert.match(transport,/assert[.]equal\s*\(\s*result[.]code\s*,\s*0\s*,\s*['"]the complete original suite must pass with the actual selected compiler product['"]\s*,?\s*\)/,
      'a failed original suite must fail its matrix record');
    assert.match(transport,/originalSelectedFrontendBuild\s*\(\s*\{\s*[.]{3}options\s*,\s*frontend\s*:\s*options[.]frontend\s*\?\?\s*actual[.]compiler\s*,?\s*\}\s*\)/,
      'explicit frontend and Seed rebuilds must retain the actual selected frontend');
    assert.match(transport,/assert[.]deepEqual\s*\(\s*interception[.]modules\s*,\s*moduleIds\s*,/,
      'the child must verify every selected compiler module identity');
    assert.match(transport,/process[.]removeListener\s*\(\s*['"]SIGTERM['"]\s*,\s*terminate\s*,?\s*\)/,
      'the completed child must remove its cancellation listener');
  }
  const replay=records.find(item=>item.id==='original-managed-suite:complete-fixture-suites');
  for(const name of['wasm-managed-builtins','wasm-managed-typeof','wasm-managed-project-linking','direct-wasm-backend',
    'wasm-managed-function-properties-runtime']){
    const filename='tests/'+name+'.test.mjs',suite=replay.original.suites.find(item=>item.file===filename);
    assert(suite,filename+' must enter unchanged original-suite replay');
    assert.equal(suite.sourceSha256,(await file(filename)).sha256);
  }
  const project=records.find(item=>item.id==='original-managed-fixture:project-entry:node');
  for(const name of['entry','state']){
    const filename='tests/fixtures/wasm-managed-project-'+name+'.eli';
    assert(project.modules.some(module=>module.filename===filename));
    assert(project.coverage.includes('stable-compatibility:'+filename));
  }
  const vector=records.find(item=>item.id==='original-managed-fixture:persistent-vector-auto-65536:node');
  assert(vector.modules.some(module=>module.filename==='stdlib/persistent-vector.eli'));
  assert.deepEqual(vector.execution.runtimeOptions,{maxSlots:8192,initialBytes:262144,maxBytes:16777216});
  assert.deepEqual(vector.memory,{initialPages:4,maximumPages:1024});
  assert(vector.execution.hostSource.includes('[0,1,31,32,33,63,64,65,1023,1024,1025,1056,1057]'));
});
