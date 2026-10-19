import {addOriginalStdlibRuntimeAdapters,isOriginalRuntimeHostOnly,originalRuntimeOnlyCase} from './compiler-corpus-runtime-adapters.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {resolve, relative, sep, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {addOriginalEvaluationPrograms} from './compiler-corpus-evaluation-adapters.mjs';
import {addOriginalProjectPrograms} from './compiler-corpus-project-adapters.mjs';
import {addOriginalCLIPrograms} from './compiler-corpus-cli-adapters.mjs';
import {addOriginalManagedLibraryAdapters} from './compiler-corpus-managed-adapters.mjs';
import {addOriginalManagedFixtureAdapters} from './compiler-corpus-managed-fixtures.mjs';
import {addOriginalToolsArtifactPrograms,originalToolsHostGateCase} from './compiler-corpus-tools-artifact-adapters.mjs';
import {addOriginalIdentityValueAdapters} from './compiler-corpus-identity-value-adapters.mjs';
import {originalSourceCaseLocators} from './compiler-corpus-managed-cases.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const stages = new Set(['reader', 'expander', 'analyzer', 'ir']);
const originalReportOnlyLocators = new Map([
  ['tests/compiler-runtime-scan.test.mjs','committed compiler runtime scan report matches measured sources'],
  ['tests/compiler-ir-kind.test.mjs','committed compiler IR kind report matches measured sources'],
  ['tests/compiler-indent.test.mjs','committed compiler indentation report matches measured sources'],
  ['tests/compiler-locate.test.mjs','committed compiler location report matches measured sources'],
  ['tests/compiler-binary-comparison.test.mjs','committed binary comparison report matches measured sources'],
  ['tests/compiler-reader-character.test.mjs','committed reader character report matches measured sources'],
  ['tests/compiler-source-map-cursor.test.mjs','committed Source Map cursor report matches measured sources'],
]);
const textDecoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});

// This parser admits data literals only. Original host-path interpolations are
// transported separately; they are never evaluated while loading a corpus.
function originalDataLiteral(source) {
  let at=0;
  const space=()=>{while(/\s/.test(source[at]??'')&&at<source.length)at++;};
  const string=()=>{
    const start=at++;let escaped=false;
    while(at<source.length){const code=source[at++];if(!escaped&&code==='"')return JSON.parse(source.slice(start,at));if(!escaped&&code==='\\')escaped=true;else escaped=false;}
    throw new TypeError('unterminated original data string');
  };
  const value=()=>{
    space();const code=source[at];
    if(code==='"')return string();
    if(code==='['||code==='{'){
      at++;const array=code==='[',result=array?[]:{},end=array?']':'}';space();
      while(source[at]!==end){
        if(at>=source.length)throw new TypeError('unterminated original data literal');
        if(array)result.push(value());
        else{
          space();let key;
          if(source[at]==='"')key=string();
          else{const match=/^[$A-Z_a-z][$\w]*/.exec(source.slice(at));if(!match)throw new TypeError('original data key is not literal');key=match[0];at+=key.length;}
          space();if(source[at++]!==':')throw new TypeError('original data field lacks a colon');
          Object.defineProperty(result,key,{value:value(),writable:true,enumerable:true,configurable:true});
        }
        space();if(source[at]===end)break;if(source[at++]!==',')throw new TypeError('original data literal contains an expression');space();
      }
      at++;return result;
    }
    const literal=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:[.][0-9]+)?(?:[eE][+-]?[0-9]+)?)(?![$\w.])/.exec(source.slice(at));
    if(!literal)throw new TypeError('original data contains a nonliteral expression');
    at+=literal[0].length;return JSON.parse(literal[0]);
  };
  const result=value();space();if(at!==source.length)throw new TypeError('original data has trailing code');return result;
}

function originalRegion(source,begin,end,from=0){
  const start=source.indexOf(begin,from),finish=start<0?-1:source.indexOf(end,start+begin.length);
  if(start<0||finish<0)throw new TypeError('original inline host boundary changed');
  const text=source.slice(start,finish);
  return{text,start,end:finish,byteStart:Buffer.byteLength(source.slice(0,start)),byteEnd:Buffer.byteLength(source.slice(0,finish)),sha256:digest(Buffer.from(text))};
}

function originalInlineArray(source,begin,end,bindings,joiner){
  const region=originalRegion(source,begin,end),body=region.text.slice(begin.length),lines=body.split('\n').map(line=>line.trim()).filter(Boolean),parts=[];
  for(const line of lines){
    if(bindings.has(line))continue;
    const literal=line.endsWith(',')?line.slice(0,-1):line;
    const plainSingle=literal[0]==="'"&&literal.at(-1)==="'"&&!/[\\']/.test(literal.slice(1,-1));
    if(literal[0]!=='"'&&!plainSingle)throw new TypeError('original inline host contains unsupported dynamic concatenation');
    const value=plainSingle?literal.slice(1,-1):originalDataLiteral(literal);if(typeof value!=='string')throw new TypeError('original inline host item is not a string literal');parts.push(value);
  }
  if(lines.filter(line=>bindings.has(line)).length!==bindings.size)throw new TypeError('original host-path interpolation changed');
  return{...region,code:parts.join(joiner)};
}

function originalTemplate(source, prefix, bindings = new Map()) {
  const start=source.indexOf(prefix);if(start<0)throw new TypeError('original template boundary changed');
  let at=start+prefix.length,code='';
  while(at<source.length){
    const unit=source[at++];
    if(unit==='`')return{code,start,end:at,byteStart:Buffer.byteLength(source.slice(0,start)),byteEnd:Buffer.byteLength(source.slice(0,at)),sha256:digest(Buffer.from(source.slice(start,at)))};
    if(unit==='$'&&source[at]==='{'){
      const end=source.indexOf('}',at+1),name=source.slice(at+1,end);
      if(end<0||!bindings.has(name))throw new TypeError('original template has an unbound interpolation');
      code+=bindings.get(name);at=end+1;continue;
    }
    if(unit!=='\\'){code+=unit;continue;}
    const escape=source[at++],simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0','\\':'\\','`':'`','$':'$',"'":"'",'"':'"'};
    if(Object.hasOwn(simple,escape)){code+=simple[escape];continue;}
    if(escape==='\n')continue;
    if(escape==='\r'){if(source[at]==='\n')at++;continue;}
    if(escape==='x'||escape==='u'){
      const count=escape==='x'?2:4,hex=source.slice(at,at+count);
      if(!new RegExp('^[0-9a-fA-F]{'+count+'}$').test(hex))throw new TypeError('original template contains unsupported escape');
      code+=String.fromCharCode(parseInt(hex,16));at+=count;continue;
    }
    throw new TypeError('original template contains unsupported escape');
  }
  throw new TypeError('unterminated original template');
}

function sourcePath(root, filename) {
  if (typeof filename !== 'string' || !filename || isAbsolute(filename) || /[\\:\u0000]/.test(filename)) throw new TypeError('invalid original corpus filename');
  const path = resolve(root, filename), part = relative(resolve(root), path);
  if (isAbsolute(part) || part === '..' || part.startsWith('..' + sep)) throw new TypeError('original corpus filename escapes its root');
  return path;
}

// Archive bytes and decoded source each have one owner per load. Re-decoding
// the archived base64 at every recipe edge used to allocate another copy of
// the same compiler/stdlib text for each dependent record.
export function createOriginalCorpusSourceReader({sourceRoot, read = readFile,
  decode = bytes => textDecoder.decode(bytes)}) {
  const files = new Map(), loading = new Map(), decoded = new Map();
  async function file(filename) {
    if (!files.has(filename)) {
      if (!loading.has(filename)) loading.set(filename, (async () => {
        const bytes = await read(sourcePath(sourceRoot, filename));
        const asset = {file: filename, sha256: digest(bytes), bytes: bytes.length,
          encoding: 'base64', content: bytes.toString('base64')};
        files.set(filename, asset);
      })());
      try {await loading.get(filename);} finally {loading.delete(filename);}
    }
    return files.get(filename);
  }
  async function text(filename) {
    const asset = await file(filename);
    // Recheck after the shared read: concurrent first callers must not each
    // decode. Failed UTF8 reads remain failures and are never cached as text.
    if (!decoded.has(filename)) decoded.set(filename, decode(Buffer.from(asset.content, 'base64')));
    return decoded.get(filename);
  }
  return {file, text, evidence: () => [...files.values()]};
}

// Corpus snapshots own their mutable containers, while primitive source text
// can be retained without the native clone engine copying it for every edge.
// Inspect the entire graph before copying anything: an accessor or special
// object requires one native clone of the ORIGINAL graph, preserving native
// traversal, getter calls, first errors and cross-object aliases together.
export function cloneCompilerCorpusData(value) {
  const shapes = new Map(), pending = [value];
  const fallback = () => {shapes.clear();pending.length = 0;return structuredClone(value);};
  while (pending.length) {
    const item = pending.pop(), kind = typeof item;
    if (item === null || kind === 'undefined' || kind === 'string' || kind === 'number' ||
        kind === 'boolean' || kind === 'bigint') continue;
    if (kind !== 'object' || types.isProxy(item)) return fallback();
    if (shapes.has(item)) continue;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      return fallback();
    const descriptors = Object.getOwnPropertyDescriptors(item), entries = [];
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value')) return fallback();
      // Native structuredClone ignores symbol keys and non-enumerable data.
      // Array length is retained separately so trailing holes survive too.
      if (!descriptor.enumerable) continue;
      entries.push(key, descriptor.value);pending.push(descriptor.value);
    }
    shapes.set(item, {array, length: array ? descriptors.length.value : 0, entries});
  }
  // Both passes are iterative, including cycles and deeply nested records.
  // All containers exist before links are installed, so aliases never depend
  // on which edge was encountered first during the preflight.
  for (const shape of shapes.values()) shape.copy = shape.array ? new Array(shape.length) : {};
  for (const shape of shapes.values()) for (let index = 0; index < shape.entries.length; index += 2) {
    const member = shape.entries[index + 1];
    Object.defineProperty(shape.copy, shape.entries[index], {
      value: member !== null && typeof member === 'object' ? shapes.get(member).copy : member,
      writable: true, enumerable: true, configurable: true,
    });
  }
  return value !== null && typeof value === 'object' ? shapes.get(value).copy : value;
}

export function cloneCompilerCorpusModules(modules) {
  return cloneCompilerCorpusData(modules);
}

function cloneSourceProjectRequest(request) {
  return cloneCompilerCorpusData(request);
}

// This adapter reads the original data; it does not execute its test files,
// translate their JavaScript or extract source strings from arbitrary scripts.
export async function loadOriginalCompilerCorpus({sourceRoot, originals}) {
  if (!originals?.manifests || typeof sourceRoot !== 'string') throw new TypeError('original compiler manifests and sourceRoot are required');
  const parity = originals.manifests.find(item => item.id === 'compiler-parity');
  const stable = originals.manifests.find(item => item.id === 'stable-compatibility');
  if (!parity || !stable) throw new Error('both original compiler corpora are required');
  const records = [], claimed = new Set(), irCases = [], fullyMappedSuites = new Set();
  const {file, text, evidence: sourceEvidence} = createOriginalCorpusSourceReader({sourceRoot});
  async function json(filename) {return JSON.parse(await text(filename));}
  const diagnostics = await json('contracts/diagnostic-corpus.json');
  function add(record) {
    for (const id of record.coverage) claimed.add(id);
    records.push(record);
  }
  function bindCoverage(record, ids) {
    if(!records.includes(record)||!Array.isArray(ids)||
      ids.some(id=>typeof id!=='string'||!originals.requiredCoverage.includes(id)))
      throw new TypeError('original coverage must bind an existing recipe and retained identities');
    for(const id of ids){
      if(!record.coverage.includes(id))record.coverage.push(id);
      claimed.add(id);
    }
  }
  const stableFiles = new Set(stable.document.fixtureFiles);
  for (const fixture of parity.document.fixtures) {
    if (!stages.has(fixture.id)) throw new Error('unrepresented original compiler stage: ' + fixture.id);
    const suite = await json(fixture.file);
    for (const classification of ['valid', 'invalid']) {
      // The canonical parity inventory counts an absent classification as
      // zero (the IR corpus has no negative section). A present malformed
      // section remains an error, and the declared count still must match.
      const cases = !Object.hasOwn(suite, classification) && fixture[classification] === 0 ? [] : suite[classification];
      if (!Array.isArray(cases) || cases.length !== fixture[classification]) {
        throw new Error('original fixture case count changed: ' + fixture.file + ':' + classification);
      }
      for (let index = 0; index < cases.length; index++) {
        const item = cases[index];
        const source = Object.hasOwn(item, 'source') ? item.source : await text(item.file);
        if (typeof source !== 'string' || typeof item.filename !== 'string') throw new Error('unrepresented original source case: ' + fixture.file + ':' + index);
        const id = 'compiler-parity:' + fixture.id + ':' + classification + ':' + index;
        await file('tests/bootstrap-' + fixture.id + '-oracle.el');
        const coverage = [id];
        if (stableFiles.has(fixture.file)) coverage.push('stable-compatibility:' + fixture.file);
        const diagnostic = diagnostics.suites?.find(s => s.id === fixture.id)?.cases?.find(c => c.name === item.name);
        const expected = classification === 'invalid'
          ? {kind: 'diagnostic', message: item.error, ...(diagnostic ? {diagnostic: diagnostic.diagnostic} : {})}
          : {kind: 'stage', oracleRequired: true};
        const request = {operation: 'stage', stage: fixture.id, source, filename: item.filename,
          ...(fixture.id === 'analyzer' ? {expand: false} : {}),
          ...(Object.hasOwn(item, 'macroContext') ? {macroContext: structuredClone(item.macroContext)} : {})};
        add({id, kind: 'stage', coverage, request, expected,
          original: {manifest: parity.id, fixture: fixture.file, classification, index, case: structuredClone(item)},
          ...(item.file ? {dependencies: [item.file]} : {})});
        if (fixture.id === 'ir' && classification === 'valid') {
          irCases.push({source,filename:item.filename,name:item.name});
          await file('tests/bootstrap-emitter-oracle.el');
          add({id: id + ':emitter', kind: 'stage', coverage: [...coverage],
            request: {...request, stage: 'emitter', sourceMap: {generatedFile: 'fixture.mjs', sourceName: item.filename}},
            expected: {kind: 'stage', oracleRequired: true},
            original: {manifest: parity.id, fixture: fixture.file, classification, index, case: structuredClone(item),
              suite: 'tests/bootstrap-emitter.test.mjs'}});
        }
      }
    }
  }
  // This is the exact source wrapper used by the retained behavior suite.
  // The unmodified scenario source and all error/recovery fields remain bound.
  for (const filename of stable.document.fixtureFiles) {
    await file(filename);
    if (!filename.endsWith('.json')) continue;
    const document = JSON.parse(await text(filename));
    if (document?.format !== 'eliscript-managed-bdd') continue;
    if (document.version !== 1 || !Array.isArray(document.features)) throw new Error('unsupported original BDD catalog shape');
    const ids = new Set();
    for (const feature of document.features) {
      if (!Array.isArray(feature.scenarios)) throw new Error('original BDD feature has no scenarios');
      for (const scenario of feature.scenarios) {
        if (typeof scenario.id !== 'string' || ids.has(scenario.id) || typeof scenario.source !== 'string') throw new Error('invalid original BDD scenario');
        ids.add(scenario.id);
        const source = ';中😀\n(defconst marker 1)\n' + scenario.source + '\n(export run' + (Object.hasOwn(scenario, 'recover') ? ' recover' : '') + ')';
        const sourceFilename = 'bdd-' + scenario.id + '.eli';
        add({id: 'stable-compatibility:bdd:' + scenario.id, kind: 'project', coverage: ['stable-compatibility:' + filename],
          modules: [{id: 'entry.mjs', filename: sourceFilename, source}], entry: 'entry.mjs',
          request: {operation: 'project'}, auto: 1,
          execution: {kind: 'managed-bdd', export: 'run', scenario: structuredClone(scenario)},
          expected: {kind: 'managed-bdd', scenario: structuredClone(scenario)},
          original: {manifest: stable.id, fixture: filename, feature: feature.name, case: structuredClone(scenario),
            sourceRecipe: {prefix: ';中😀\n(defconst marker 1)\n', suffix: '\n(export run' + (Object.hasOwn(scenario, 'recover') ? ' recover' : '') + ')'},
            suite: 'tests/wasm-managed-behavior.test.mjs'}});
      }
    }
  }
  // The remaining suites construct projects, mutate files, spawn host oracles,
  // invoke portable closures or supply data tables. Their auxiliary files are
  // dependencies of a suite, never invented standalone Eliscript programs.
  const conformance = await json('tests/conformance/manifest.json');
  const features = new Map(conformance.features.map(feature => [feature.id, feature]));
  const locators = [];
  for (const featureId of stable.document.stableCoreFeatureIds) {
    const feature = features.get(featureId);
    if (!feature || feature.status !== 'stable') throw new Error('original stable feature is unavailable: ' + featureId);
    for (let index = 0; index < (feature.evidence ?? []).length; index++) {
      const locator = feature.evidence[index];
      await file(locator.file);
      locators.push({id: 'stable-compatibility:evidence:' + featureId + ':' + index, featureId, ...structuredClone(locator)});
    }
  }
  if (locators.length !== stable.document.evidenceLocatorCount) throw new Error('original stable evidence inventory changed');
  for (const dimension of parity.document.dimensions) for (let index = 0; index < dimension.evidence.length; index++) {
    const locator = dimension.evidence[index];
    await file(locator.file);
    locators.push({id: 'compiler-parity:dimension:' + dimension.id + ':' + index, dimension: dimension.id, ...structuredClone(locator)});
  }
  for(const locator of originals.additionalLocators??[]){
    const original=await file(locator.file);
    if(original.sha256!==locator.originalCase?.sourceSha256)throw new Error('original managed case source changed while binding its corpus');
    locators.push(structuredClone(locator));
  }
  // Bind named fixture locators only after their complete original inventory
  // exists. Preserve case/record/evidence order and put their IDs between the
  // original case ID and the whole-fixture binding, just as for direct cases.
  for(const record of records){
    if(record.kind!=='stage'||record.original?.manifest!==parity.id||
      typeof record.original?.fixture!=='string'||typeof record.original?.case?.name!=='string')continue;
    const named=locators.filter(locator=>locator.file===record.original.fixture&&
      locator.contains===record.original.case.name&&!record.coverage.includes(locator.id));
    record.coverage.splice(1,0,...named.map(locator=>locator.id));
    for(const locator of named)claimed.add(locator.id);
  }
  for (const filename of parity.document.bootstrapSources) await file(filename);
  await file('tests/bootstrap-tests.el');
  if(stableFiles.has('tests/fixtures/bootstrap-symbols.json')){
    const symbolCases=await json('tests/fixtures/bootstrap-symbols.json');
    const functions={segment:['munge-segment','munge_segment'],binding:['binding-name','binding_name'],reference:['reference-name','reference_name']};
    const calls=[];
    for(const [operation,cases]of Object.entries(symbolCases)){
      if(!functions[operation]||!Array.isArray(cases))throw new Error('unrepresented original symbol fixture operation');
      for(const item of cases)calls.push({name:functions[operation][0],javascriptName:functions[operation][1],args:[item.input],
        ...(Object.hasOwn(item,'error')?{error:item.error}:{expected:item.output})});
    }
    const request={operation:'project',entry:'symbol.mjs',sourceMap:true,modules:[{id:'symbol.mjs',filename:'bootstrap/compiler/symbol.eli',source:await text('bootstrap/compiler/symbol.eli')}]};
    add({id:'stable-compatibility:symbol-mapping',kind:'sequence',coverage:['stable-compatibility:tests/fixtures/bootstrap-symbols.json',...locators.filter(item=>item.file==='tests/bootstrap-symbol.test.mjs').map(item=>item.id)],
      original:{suite:'tests/bootstrap-symbol.test.mjs',fixture:'tests/fixtures/bootstrap-symbols.json'},expected:{kind:'sequence'},steps:[
        {id:'first',request,artifact:{kind:'exports',auto:1,calls}},
        {id:'repeat',request:cloneSourceProjectRequest(request),artifact:{kind:'exports',auto:1,calls:structuredClone(calls)},sameProductAs:'first'},
      ]});
    await file('tests/bootstrap-symbol.test.mjs');
    // The original suite consists of the complete frozen calls and exact
    // code/map repeat comparison represented by the two project steps above.
    fullyMappedSuites.add('tests/bootstrap-symbol.test.mjs');
  }
  for(const suite of ['tests/bootstrap-project.test.mjs','tests/macro-file-dependencies.test.mjs','tests/esm-imports.test.mjs','tests/bootstrap-ir-serialization.test.mjs'])await file(suite);
  const portableSources={};for(const name of ['sequence','text','object'])portableSources[name]=await text('stdlib/'+name+'.eli');
  addOriginalRequestRecipes({add,locators,irCases,portableSources});
  const formatterSuite=await addOriginalFormatterRecipes({add,locators,text,file,sourceRoot});
  const generatedNamesSuite=await addOriginalGeneratedNamesRecipes({add,locators,text,file});
  if(generatedNamesSuite)fullyMappedSuites.add(generatedNamesSuite);
  const esmSuite=await addOriginalESMRecipes({add,locators,text,file});
  if(esmSuite)fullyMappedSuites.add(esmSuite);
  for(const suite of await addOriginalCompilerModulePrograms({add,locators,text,file,bootstrapSources:parity.document.bootstrapSources}))fullyMappedSuites.add(suite);
  for(const suite of await addOriginalEvaluationPrograms({add,locators,text,file,bootstrapSources:parity.document.bootstrapSources}))fullyMappedSuites.add(suite);
  for(const suite of await addOriginalProjectPrograms({add,locators,text,file,stableFiles,bootstrapSources:parity.document.bootstrapSources,sourceRoot}))fullyMappedSuites.add(suite);
  for(const suite of await addOriginalCLIPrograms({add,locators,text,file,bootstrapSources:parity.document.bootstrapSources,sourceRoot}))fullyMappedSuites.add(suite);
  if(formatterSuite)fullyMappedSuites.add(formatterSuite);
  // These original scripts consume a generated module (rather than importing
  // the old JS runtime as the implementation under examination).
  const cliSource=await text('tests/cli-test.sh');
  const diagnosticFilename='tests/fixtures/diagnostic-unbound.eli';
  if(stableFiles.has(diagnosticFilename)){
    const assertion=originalRegion(cliSource,'DIAGNOSTIC_FILE="$TEMP_DIR/diagnostic.json" bun -e \'','\n\'\n');
    add({id:'original-sequence:cli-unbound-diagnostic',kind:'sequence',
      coverage:['stable-compatibility:'+diagnosticFilename],expected:{kind:'sequence'},
      original:{fixture:diagnosticFilename,suite:'tests/cli-test.sh',sourceSha256:(await file('tests/cli-test.sh')).sha256,
        regions:[{start:assertion.start,end:assertion.end,byteStart:assertion.byteStart,byteEnd:assertion.byteEnd,sha256:assertion.sha256}]},
      steps:[{id:'original-json-diagnostic',request:{operation:'compile',source:await text(diagnosticFilename),filename:diagnosticFilename},
        error:{code:'ELI-A0001',phase:'analysis',expectFields:[
          {path:['message'],value:'unbound symbol: missing'},{path:['format'],value:'eliscript-diagnostic'},{path:['version'],value:1},{path:['severity'],value:'error'},
          {path:['location','file'],value:diagnosticFilename},{path:['location','start','offset'],value:19},
          {path:['location','start','line'],value:2},{path:['location','start','column'],value:3},
        ]}}]});
  }
  let runtimeSources;
  async function originalRuntimeSources(){
    if(runtimeSources)return runtimeSources;
    const result=[];
    async function walk(directory){
      const entries=await readdir(sourcePath(sourceRoot,directory),{withFileTypes:true});entries.sort((left,right)=>left.name<right.name?-1:left.name>right.name?1:0);
      for(const item of entries){
        const filename=directory+'/'+item.name;
        if(item.isDirectory())await walk(filename);
        else if(item.isFile()&&filename.endsWith('.mjs'))result.push({id:filename,filename,source:await text(filename)});
      }
    }
    await walk('runtime');runtimeSources=result;return result;
  }
  function originalInlineHost(marker){
    const block=cliSource.indexOf(marker),begin=block<0?-1:cliSource.indexOf("bun --eval '\n",block),end=begin<0?-1:cliSource.indexOf("\n')",begin);
    if(block<0||begin<0||end<0)throw new Error('original inline host oracle is unavailable: '+marker);
    return cliSource.slice(begin+"bun --eval '\n".length,end)+'\n';
  }
  const coreSetSuite=await text('tests/core-set.test.mjs'),coreStdlibSuite=await text('tests/core-stdlib.test.mjs');
  const coreSetInline=originalInlineArray(coreSetSuite,'  const source = [\n','  ].join("\\n");',new Set([
    '`const usage = await import(${JSON.stringify(pathToFileURL(module).href)});`,',
  ]),'\n');
  const coreSetExpected=originalRegion(coreSetSuite,'    const expected = {',';\n    expect(await runUsageHost',coreSetSuite.indexOf('test("Eliscript-authored set algebra'));
  const coreSetExpectedValue=originalDataLiteral(coreSetExpected.text.slice('    const expected = '.length));
  const coreStdlibInline=originalInlineArray(coreStdlibSuite,'    const nodeCheck = [\n','    ].join("");',new Set([
    ...['apiUsageModule','seqModule','identifierModule','metadataModule','collectionModule'].map((binding,index)=>'`const '+['api','seq','identifier','metadata','collection'][index]+' = await import(${JSON.stringify(pathToFileURL('+binding+').href)});`,'),
    '`const queue = await import(${JSON.stringify(pathToFileURL(resolve(ROOT, "runtime/core/queue.mjs")).href)});`,',
  ]),'');
  const coreUsage=originalRegion(coreStdlibSuite,'    const usage = await import(pathToFileURL(usageModule).href);','    const generatedUsage =');
  const coreUsageShape=originalRegion(coreStdlibSuite,'    const generatedUsage =','    const api = await import(pathToFileURL(apiUsageModule).href);',coreUsage.end);
  const coreApi=originalRegion(coreStdlibSuite,'    const api = await import(pathToFileURL(apiUsageModule).href);','    const nodeCheck = [',coreUsageShape.end);
  const coreTailShape=originalRegion(coreStdlibSuite,'    const protocolMap = await Bun.file(`${protocolModule}.map`).json();','  } finally {',coreStdlibInline.end);
  const coreLibraryNames=['protocol','identifier','data-text','metadata','collection','transient','transducer','seq','data'];
  const coreLibraryModules=coreLibraryNames.map(name=>({id:'stdlib/core/'+name+'.mjs',filename:'stdlib/core/'+name+'.eli'}));
  const coreModuleBindings={usageModule:'core-stdlib-usage.mjs',apiUsageModule:'core-language-api-usage.mjs',
    ...Object.fromEntries(coreLibraryNames.map(name=>[({'data-text':'dataText'}[name]??name)+'Module','stdlib/core/'+name+'.mjs']))};
  const coreBindingSource=Object.entries(coreModuleBindings).map(([name,id])=>'const '+name+' = fileURLToPath(new URL('+JSON.stringify('../'+id)+',import.meta.url));').join('\n');
  const coreImports=coreStdlibSuite.slice(0,coreStdlibSuite.indexOf('const ROOT ='));
  const coreOriginalRegions=[coreUsage,coreUsageShape,coreApi,coreStdlibInline,coreTailShape].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}));
  const inlinePlans=[
    {source:'tests/fixtures/core-set-usage.eli',entry:'core-set-usage.mjs',layout:'source',runtime:true,
      extraModules:[{id:'stdlib/core/set.mjs',filename:'stdlib/core/set.eli'}],hostOrigin:'tests/core-set.test.mjs',
      generatedHost:{id:'tests/__eliscript_original_core_set.mjs',source:'import {pathToFileURL} from "node:url";\nconst usage = await import(pathToFileURL(process.argv[2]).href);\n'+coreSetInline.code+'\n'},
      stdoutJSON:coreSetExpectedValue,originalRegions:[coreSetInline,coreSetExpected].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
    {source:'tests/fixtures/core-stdlib-usage.eli',entry:'core-stdlib-usage.mjs',layout:'source',runtime:true,
      extraModules:[...coreLibraryModules,{id:'core-language-api-usage.mjs',filename:'tests/fixtures/core-language-api-usage.eli'}],hostOrigin:'tests/core-stdlib.test.mjs',requiresBun:true,
      extraEntries:['core-language-api-usage.mjs',...coreLibraryModules.map(item=>item.id)],
      generatedHost:{id:'tests/__eliscript_original_core_stdlib.mjs',source:coreImports+'\nimport {fileURLToPath} from "node:url";\n'+coreBindingSource+'\n'+coreUsage.text+
        '\nif(process.env.ELISCRIPT_ORIGINAL_TARGET === "javascript"){\n'+coreUsageShape.text+'\n}\n'+coreApi.text+
        '\nif(process.env.ELISCRIPT_ORIGINAL_TARGET === "javascript"){\n'+coreTailShape.text+'\n}\n'},originalRegions:coreOriginalRegions,
      targetSpecificAssertions:{javascript:['generatedUsage/seqMap/dataMap','protocolMap/identifierMap/dataTextMap/metadataMap/collectionMap/transientMap/transducerMap']},
    },
    {source:'tests/fixtures/core-language-api-usage.eli',entry:'core-language-api-usage.mjs',layout:'source',runtime:true,
      extraModules:coreLibraryModules,hostOrigin:'tests/core-stdlib.test.mjs',originalRegions:[coreStdlibInline].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
      generatedHost:{id:'tests/__eliscript_original_core_stdlib_node.mjs',source:'import {fileURLToPath} from "node:url";\n'+coreBindingSource+'\n'+
        'const api = await import(new URL("../core-language-api-usage.mjs",import.meta.url));\n'+
        ['seq','identifier','metadata','collection'].map(name=>'const '+name+' = await import(new URL('+JSON.stringify('../stdlib/core/'+name+'.mjs')+',import.meta.url));').join('\n')+
        '\nconst queue = await import(new URL("../runtime/core/queue.mjs",import.meta.url));\n'+coreStdlibInline.code+'\n'},
    },
  ];
  const programPlans=[
    ...inlinePlans,
    {source:'tests/fixtures/core.eli'},
    {source:'tests/fixtures/compatibility/stable-core-values.eli',stdout:'tests/fixtures/compatibility/stable-core-values.stdout'},
    {source:'tests/fixtures/compatibility/native-containers-v2.eli',stdout:'tests/fixtures/compatibility/native-containers-v2.stdout'},
    ...[
      ['async','ASYNC_OUTPUT=$(', 'ELISCRIPT_ASYNC_MODULE','[21,42,20,2,3,false,"yes",5]\n'],
      ['exceptions','EXCEPTIONS_OUTPUT=$(', 'ELISCRIPT_EXCEPTIONS_MODULE','[4,"caught:zero",9,7,"async:bad","inner:outer",3]\n'],
      ['vector-patterns','PATTERNS_OUTPUT=$(', 'ELISCRIPT_PATTERNS_MODULE','[[1,2,4,[5,6],9,5,[6],9],[1,2,4,[],null,null,[],null],8,7,42,[7,"caught"]]\n'],
      ['map-patterns','MAP_PATTERNS_OUTPUT=$(', 'ELISCRIPT_MAP_PATTERNS_MODULE','[["Ada",18,"missing"],["Ada",null,null],"anonymous",["Ada","London"],["Ada",5,"text","symbol"],["Ada",7,"text","symbol"],["persistent",9,"text","symbol"],["Ada",18,{"name":"Ada"}],0,[7,"caught"],"portable",["Eliscript",18]]\n'],
    ].map(([name,marker,environment,stdoutText])=>({source:'tests/fixtures/'+name+'.eli',hostEval:originalInlineHost(marker),environment,stdoutText,hostOrigin:'tests/cli-test.sh'})),
    ...['deferred-usage','function-usage','sequence-usage','text-usage','object-usage'].map(name=>({source:'tests/fixtures/'+name+'.eli',stdlib: ['sequence-usage','text-usage','object-usage'].includes(name)?'flat':'nested'})),
    ...['core-expression-forms','language-equality','local-recursive-functions','multi-arity','value-dispatch'].map(name=>({source:'tests/fixtures/'+name+'.eli',host:'tests/fixtures/'+name+'-host.mjs',argument:name==='core-expression-forms'?'url':'path'})),
    {source:'tests/fixtures/bit-usage.eli',host:'tests/fixtures/bit-host.mjs',extraModules:[{id:'tests/fixtures/bit.mjs',filename:'stdlib/bit.eli'}],argumentModules:['tests/fixtures/bit-usage.mjs','tests/fixtures/bit.mjs']},
    {source:'stdlib/persistent-queue.eli',host:'tests/fixtures/persistent-queue-library-host.mjs',layout:'source',runtime:true},
    ...['vector','map','set'].map(collection=>({id:'persistent-core-exit-'+collection,
      source:'stdlib/value.eli',host:'tests/fixtures/persistent-core-exit-host.mjs',stdlib:'flat',
      dependencies:['bit','persistent-list','persistent-vector','persistent-map','persistent-set'],
      hostImports:['persistent-vector','persistent-map','persistent-set'],
      arguments:[{directory:true},{literal:collection}]})),
    {source:'stdlib/state/atom.eli',entry:'state/atom.mjs',host:'tests/fixtures/atom-host.mjs',stdlib:'flat',
      dependencies:['bit','persistent-list','persistent-vector','persistent-map','persistent-set','value'],hostImports:['persistent-vector']},
    {source:'stdlib/interop/js.eli',host:'tests/fixtures/interop-js-host.mjs',layout:'source',stdlib:true,runtime:true,
      dependencies:['bit','persistent-list','persistent-vector','persistent-map','persistent-set','value'],hostImports:['persistent-list','persistent-vector','persistent-map','persistent-set','value']},
    ...[
      ['lazy-sequence',['lazy-sequence','transducer']],
      ['persistent-sorted',['sorted']],
      ['persistent-tree-walk',['walk']],
      ['persistent-zipper',['zipper']],
      ['declarative-protocol',['protocol']],
      ['declarative-record',['protocol','record']],
      ['declarative-type',['protocol','type']],
      ['regex',['regex']],
      ['literal-runtime',[]],
    ].map(([name,dependencies])=>({source:'tests/fixtures/'+name+'.eli',host:'tests/fixtures/'+name+'-host.mjs',layout:'source',runtime:true,
      extraModules:dependencies.map(dependency=>({id:'stdlib/core/'+dependency+'.mjs',filename:'stdlib/core/'+dependency+'.eli'}))})),
    {source:'tests/fixtures/wire.eli',host:'tests/fixtures/wire-host.mjs',layout:'source',runtime:true,
      extraModules:['mdp','mds','gepo'].map(name=>({id:'stdlib/'+name+'.mjs',filename:'stdlib/'+name+'.eli'}))},
    {source:'stdlib/core/text.eli',host:'tests/fixtures/core-text-object-host.mjs',layout:'source',runtime:true,
      extraModules:[{id:'stdlib/core/object.mjs',filename:'stdlib/core/object.eli'}],argumentModules:['stdlib/core/text.mjs','stdlib/core/object.mjs']},
    {source:'stdlib/core/protocol.eli',entry:'stdlib/core/protocol-impl.mjs',host:'tests/fixtures/eliscript-protocol-host.mjs',layout:'source',runtime:true},
    {source:'stdlib/multimethod.eli',host:'tests/fixtures/multimethod-host.mjs',stdlib:'flat',
      extraModules:[{id:'declarative-multimethod.mjs',filename:'tests/fixtures/declarative-multimethod.eli'}],
      argumentModules:['multimethod.mjs','declarative-multimethod.mjs'],hostImports:['hierarchy','persistent-map','persistent-set','persistent-vector']},
    ...['json','numeric','result','metadata','data-text','value','identifier','persistent-list','persistent-vector','persistent-map','persistent-set'].map(name=>({source:'stdlib/'+name+'.eli',stdlib:'flat',host:'tests/fixtures/portable-'+({identifier:'identifier','persistent-list':'list','persistent-vector':'vector','persistent-map':'map','persistent-set':'set'}[name]??name)+'-host.mjs',argument:'path',
      hostImports:({json:['result','persistent-vector','persistent-map','value','identifier','persistent-list','persistent-set'],result:['persistent-vector','persistent-map','value','data-text'],metadata:['value','persistent-list','persistent-vector','persistent-map','persistent-set'],
        'data-text':['identifier','persistent-list','persistent-map','metadata','persistent-set','value','persistent-vector'],value:['identifier','persistent-list','persistent-vector','persistent-map','persistent-set']})[name]??[],
      ...(name==='value'?{extraModules:[{id:'host-identity-token.mjs',filename:'tests/fixtures/host-identity-token.eli'}],extraEntries:['host-identity-token.mjs']}:{}),
    })),
  ];
  const topLevelStdlib=(await readdir(sourcePath(sourceRoot,'stdlib'))).filter(name=>/^[a-z][a-z-]*[.]eli$/.test(name)).sort();
  for(const plan of programPlans){
    // A host oracle is only attached when it is part of the frozen inventory.
    if(plan.host&&!stableFiles.has(plan.host))continue;
    if(plan.source.startsWith('tests/fixtures/')&&!stableFiles.has(plan.source))continue;
    const prefix=plan.layout==='source'?'stdlib/':plan.stdlib==='flat'?(plan.source.startsWith('stdlib/')?'':'tests/fixtures/'):'tests/fixtures/stdlib/';
    const entry=plan.entry??(plan.layout==='source'?plan.source.slice(0,-4)+'.mjs':plan.source.startsWith('stdlib/')?plan.source.slice('stdlib/'.length,-4)+'.mjs':plan.source.slice(0,-4)+'.mjs');
    const modules=[{id:entry,filename:plan.source,source:await text(plan.source)}];
    for(const item of plan.extraModules??[])modules.push({...item,source:await text(item.filename)});
    if(plan.stdlib)for(const name of plan.dependencies?.map(name=>name+'.eli')??topLevelStdlib){
      const filename='stdlib/'+name;if(filename===plan.source)continue;
      modules.push({id:prefix+name.slice(0,-4)+'.mjs',filename,source:await text(filename)});
    }
    const coverage=['stable-compatibility:'+plan.source];
    for(const item of plan.extraModules??[])if(stableFiles.has(item.filename))coverage.push('stable-compatibility:'+item.filename);
    if(plan.host){await file(plan.host);coverage.push('stable-compatibility:'+plan.host);}
    if(plan.stdout){await file(plan.stdout);coverage.push('stable-compatibility:'+plan.stdout);}
    // Only frozen denominator IDs are claimed. Stdlib sources remain bound
    // dependencies even when the manifest lists their original host oracle.
    const bound=coverage.filter(id=>originals.requiredCoverage.includes(id));
    if(!bound.length)continue;
    await file('tests/fixtures/compiled-eli-node-loader.mjs');
    add({id:'stable-compatibility:program:'+(plan.id??plan.source),kind:'project',coverage:bound,modules,entry,
      request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,...(plan.runtime?{hostSources:await originalRuntimeSources()}:{}),
        entries:[...new Set([entry,...(plan.argumentModules??[]),...(plan.extraEntries??[]),...(plan.hostImports??[]).map(name=>prefix+name+'.mjs')])]},
      execution:{kind:'original-program',host:plan.generatedHost?.id??plan.host??null,hostSource:plan.generatedHost?.source??(plan.host?await text(plan.host):null),hostEval:plan.hostEval??null,environment:plan.environment??null,argument:plan.argument??'path',argumentModules:plan.argumentModules??[entry],...(plan.arguments?{arguments:structuredClone(plan.arguments)}:{}),aliases:true,requiresBun:plan.requiresBun===true},
      expected:{kind:'seed-program',oracleRequired:true,...(plan.stdout?{stdout:await text(plan.stdout)}:{}),...(plan.stdoutText?{stdout:plan.stdoutText}:{}),...(plan.stdoutJSON?{stdoutJSON:plan.stdoutJSON}:{})},
      original:{manifest:stable.id,fixture:plan.source,host:plan.host??plan.hostOrigin??null,stdout:plan.stdout??null,
        ...(plan.originalRegions?{sourceSha256:(await file(plan.hostOrigin)).sha256,locators:locators.filter(item=>item.file===plan.hostOrigin).map(item=>item.id),
          regions:plan.originalRegions,targetSpecificAssertions:plan.targetSpecificAssertions??null}: {})}});
  }
  for(const suite of await addOriginalStdlibRuntimeAdapters({add,records,locators,text,file,region:originalRegion,data:originalDataLiteral,bootstrapSources:parity.document.bootstrapSources}))fullyMappedSuites.add(suite);
  for(const suite of await addOriginalManagedLibraryAdapters({add,locators,text,file,stableFiles,sourceRoot}))fullyMappedSuites.add(suite);
  await addOriginalManagedFixtureAdapters({add,records,bindCoverage,locators,text,file,stableFiles,sourceRoot});
  await addOriginalIdentityValueAdapters({add,locators,text,file,stableFiles,sourceRoot});
  // Retain the artifact/CLI and semantic tools regions separately, including
  // their original case identities and deadlines. Neither claims a whole suite.
  await addOriginalToolsArtifactPrograms({add,locators,text,file,sourceRoot});
  if(stableFiles.has('tests/fixtures/unicode-case-profiles.json')){
    const reference=await json('tests/fixtures/unicode-case-profiles.json');
    if(reference.format!=='eliscript-unicode-case-reference'||!Array.isArray(reference.versions))throw new Error('unrepresented Unicode reference');
    const source='(defconst marker 1) (defun upper (value) (js-call value :toUpperCase)) (defun lower (value) (js-call value :toLowerCase)) (export upper lower)';
    for(const profile of reference.versions)add({id:'stable-compatibility:unicode-profile:'+profile.version,kind:'project',
      coverage:['stable-compatibility:tests/fixtures/unicode-case-profiles.json'],entry:'entry.mjs',modules:[{id:'entry.mjs',filename:'text-format.eli',source}],
      request:{operation:'project'},auto:1,execution:{kind:'unicode-profile',profile:structuredClone(profile)},expected:{kind:'unicode-profile'},
      original:{fixture:'tests/fixtures/unicode-case-profiles.json',suite:'tests/wasm-managed-text-format.test.mjs'}});
  }
  const unadapted=originals.requiredCoverage.filter(id=>!claimed.has(id));
  const missingCaseAdapters=[];
  const originalGateCoverage=[],hostOnlyDependencies=[];
  const semanticFeature=/^(?:language|portable|compiler|project|macro|bootstrap|stdlib|runtime)[.]/;
  const byLocator=new Map(locators.map(item=>[item.id,item]));
  for(const id of unadapted){
    const locator=byLocator.get(id);
    const originalFile=locator?.file??(id.startsWith('stable-compatibility:')?id.slice('stable-compatibility:'.length):null);
    if(originalFile==='tests/fixtures/collection-adapter-isolation.mjs'){
      const suite='tests/collection-protocol.test.mjs';
      const title='native adapters are exact, realm-explicit, and prototype preserving';
      const suiteSource=await text(suite),fixtureSource=await text(originalFile);
      const prefix='test('+JSON.stringify(title)+', async () => {';
      const region=originalRegion(suiteSource,prefix,'\ntest(');
      for(const assertion of ['new URL("./fixtures/collection-adapter-isolation.mjs", import.meta.url)',
        'const bun = await runHost(process.execPath, fixture);','const node = await runHost("node", fixture);',
        'expect(bun).toEqual(node);','unchanged: [true, true, true]',
        'protocolSlotsAbsent: [true, true, true]'])
        if(!region.text.includes(assertion))throw new TypeError('original collection isolation execution changed');
      if(!fixtureSource.includes('"../../runtime/core/collection.mjs"')||
        !fixtureSource.includes('"../../runtime/core/protocol.mjs"')||
        /(?:bin\/eliscript|buildBackends|buildProject|checkProject|compile_ir_string|compile_string|\.eli["'`]|process\.argv|ELISCRIPT_.*(?:MODULE|COMPILER))/.test(fixtureSource))
        throw new TypeError('collection isolation fixture requires a selected compiler adapter');
      const {text:caseSource,...caseRegion}=region;
      originalGateCoverage.push(id);
      hostOnlyDependencies.push({coverageId:id,file:originalFile,
        sourceSha256:(await file(originalFile)).sha256,kind:'host-only-runtime-case-fixture',
        originalAssertion:title,engines:['bun','node'],
        originalCase:{file:suite,sourceSha256:(await file(suite)).sha256,region:caseRegion},
        dependencies:await Promise.all(['runtime/core/collection.mjs','runtime/core/protocol.mjs']
          .map(async filename=>({file:filename,sourceSha256:(await file(filename)).sha256}))),
        reason:'original Bun and Node fixture checks runtime protocol adapter isolation without a compiler or language-product injection'});
      continue;
    }
    if(locator){
      const bound=await originalToolsHostGateCase({locator,source:await text(locator.file),file});
      if(bound){
        originalGateCoverage.push(id);
        hostOnlyDependencies.push({...bound,coverageId:id,file:locator.file,
          sourceSha256:(await file(locator.file)).sha256,locator:structuredClone(locator)});
        continue;
      }
    }
    if(originalFile?.startsWith('tests/')&&(originalFile.endsWith('.mjs')||originalFile==='tests/fixtures/value-hashes.json')&&isOriginalRuntimeHostOnly(originalFile,await text(originalFile))){
      originalGateCoverage.push(id);hostOnlyDependencies.push({coverageId:id,file:originalFile,sourceSha256:(await file(originalFile)).sha256,kind:'host-only-runtime',reason:'unchanged original host runtime; no selected compiler or language-product injection'});continue;
    }
    if(locator&&['tests/persistent-queue.test.mjs','tests/lazy-sequence.test.mjs','tests/persistent-sorted.test.mjs','tests/regex.test.mjs','tests/core-text-object.test.mjs','tests/core-set.test.mjs','tests/core-stdlib.test.mjs'].includes(locator.file)){
      const originalSource=await text(locator.file);
      const runtimeCase=originalRuntimeOnlyCase(locator.file,originalSource,locator.contains);
      if(runtimeCase){
        originalGateCoverage.push(id);
        hostOnlyDependencies.push({coverageId:id,file:locator.file,sourceSha256:(await file(locator.file)).sha256,
          kind:'host-only-runtime-case',region:runtimeCase,
          reason:'unchanged original runtime-only case; the separate compiled-language case remains selected-session evidence'});
        continue;
      }
    }
    if(locator?.file==='tests/diagnostic-corpus.test.mjs'&&[
      'complete negative diagnostic corpus is frozen and source-derived',
      'diagnostic corpus rejects missing cases and fixture drift',
      'diagnostic corpus rejects structured and human diagnostic drift',
    ].includes(locator.contains)){
      const originalSource=await text(locator.file);
      const prefix='test('+JSON.stringify(locator.contains)+', async () => {';
      const start=originalSource.indexOf(prefix);
      if(start<0||originalSource.indexOf(prefix,start+prefix.length)>=0)
        throw new TypeError('original diagnostic manifest case boundary changed');
      const next=originalSource.indexOf('\ntest(',start+prefix.length);
      const end=next<0?originalSource.length:next;
      const caseSource=originalSource.slice(start,end);
      if(!caseSource.includes('checkDiagnosticCorpus(')&&!caseSource.includes('validationErrors('))
        throw new TypeError('original diagnostic manifest case lost its validator');
      const dependencies=[];
      for(const filename of ['tools/diagnostics/check.mjs','contracts/diagnostic-corpus.json',
        'tests/fixtures/bootstrap-reader.json','tests/fixtures/bootstrap-expander.json','tests/fixtures/bootstrap-analyzer.json']){
        dependencies.push({file:filename,sourceSha256:(await file(filename)).sha256});
      }
      originalGateCoverage.push(id);
      hostOnlyDependencies.push({coverageId:id,file:locator.file,sourceSha256:(await file(locator.file)).sha256,
        kind:'frozen-diagnostic-manifest-case',originalAssertion:locator.contains,locator:structuredClone(locator),dependencies,
        region:{start,end,byteStart:Buffer.byteLength(originalSource.slice(0,start)),byteEnd:Buffer.byteLength(originalSource.slice(0,end)),sha256:digest(Buffer.from(caseSource))},
        reason:'original validator checks frozen diagnostic inventory and mutation rejection; every compiler negative input remains an independent selected-session stage record'});
      continue;
    }
    if(locator?.file==='tests/literal-runtime.test.mjs'&&
      locator.contains==='maintained Eliscript sources use explicit host constructors'){
      const originalSource=await text(locator.file);
      const title='maintained Eliscript sources use explicit host constructors';
      const prefix='test('+JSON.stringify(title)+', async () => {';
      const start=originalSource.indexOf(prefix);
      if(start<0||originalSource.indexOf(prefix,start+prefix.length)>=0)
        throw new TypeError('original source-only audit case boundary changed');
      const {text:caseSource,...caseRegion}=originalRegion(originalSource,prefix,'\ntest(',start);
      if(!caseSource.includes('expect(violations).toEqual([]);'))
        throw new TypeError('original source-only audit assertion changed');
      originalGateCoverage.push(id);
      hostOnlyDependencies.push({coverageId:id,file:locator.file,
        sourceSha256:(await file(locator.file)).sha256,kind:'source-only-case',
        originalAssertion:title,locator:structuredClone(locator),region:caseRegion,
        reason:'unchanged original source constructor audit; all compiled-language cases retain selected-session execution'});
      continue;
    }
    if(locator&&originalReportOnlyLocators.get(locator.file)===locator.contains){
      // This exact locator hashes and validates the frozen report; it never
      // invokes a selected compiler. Its unchanged original gate is required.
      originalGateCoverage.push(id);continue;
    }
    if(locator&&locator.kind!=='ert'&&locator.kind!=='shell'&&(!locator.featureId||semanticFeature.test(locator.featureId))){
      missingCaseAdapters.push({coverageId:id,file:locator.file,contains:locator.contains,featureId:locator.featureId,reason:'original semantic suite still needs its complete selected-session adapter'});
    }else if(id.startsWith('stable-compatibility:tests/fixtures/')){
      const filename=id.slice('stable-compatibility:'.length);
      const transport=/\/(?:compiled-eli-(?:bun-preload|node-loader)|platform-capabilities|worker-value-stream-probe)[.]mjs$/.test(filename);
      const auxiliary=filename.endsWith('.stdout')||filename.endsWith('.el')||filename.endsWith('/package.json')||filename.endsWith('/.gitkeep')||transport;
      if(auxiliary)originalGateCoverage.push(id);
      else missingCaseAdapters.push({coverageId:id,file:filename,reason:'original language fixture or host oracle has not yet been mapped to complete selected-session requests'});
    }else originalGateCoverage.push(id);
  }
  // A suite locator is not exhausted merely because one of its subcases has
  // been adapted. Keep the remaining assertions visible until its full recipe
  // is implemented; auxiliary files themselves never become programs.
  const partialSuites=new Set(records.filter(record=>record.kind==='sequence'&&record.original?.completeLocatorCoverage!==true).map(record=>record.original?.suite).filter(suite=>suite&&!fullyMappedSuites.has(suite)));
  // A separate complete selected-compiler replay may cover the very same
  // locator. A supplementary fragment must not turn that retained execution
  // back into a missing adapter. Bind the exact locator and current suite
  // revision; a fixture or another case in that file is insufficient.
  const completeReplayCoverage=new Set();
  for(const record of records){
    if(record.kind==='project'&&record.execution?.kind==='compiler-session-program'&&
      record.original?.completeLocatorCoverage===true&&
      record.original.coverageScope==='complete-source-mapping-worker-case-only'){
      const suite=record.original.suite,source=await text(suite);
      if(record.original.sourceSha256===(await file(suite)).sha256){
        const cases=originalSourceCaseLocators(suite,source);
        for(const original of record.original.cases??[]){
          const locator=byLocator.get(original.id);
          const exact=cases.find(item=>item.originalCase.sha256===original.sha256&&
            item.originalCase.span.start===original.span?.start&&item.originalCase.span.end===original.span?.end&&
            item.originalCase.sourceSha256===original.sourceSha256&&item.originalCase.timeoutMs===original.timeoutMs);
          if(locator?.file===suite&&typeof locator.contains==='string'&&locator.contains.length&&
            record.coverage.includes(original.id)&&exact&&
            source.slice(exact.originalCase.span.start,exact.originalCase.span.end).includes(locator.contains))
            completeReplayCoverage.add(original.id);
        }
      }
    }
    if(record.kind!=='project'||record.execution?.kind!=='original-program'||
      record.original?.semanticCoverage!=='complete-original-suite-with-selected-compiler-namespaces')continue;
    const coverage=new Set(record.coverage);
    for(const suite of record.original.suites??[]){
      if(suite.sourceSha256!==(await file(suite.file)).sha256)continue;
      for(const id of suite.coverage??[])if(coverage.has(id)&&byLocator.get(id)?.file===suite.file)
        completeReplayCoverage.add(id);
    }
  }
  for(const locator of locators)if(partialSuites.has(locator.file)&&locator.kind!=='ert'&&locator.kind!=='shell'&&!completeReplayCoverage.has(locator.id)&&!missingCaseAdapters.some(item=>item.coverageId===locator.id)){
    missingCaseAdapters.push({coverageId:locator.id,file:locator.file,contains:locator.contains,featureId:locator.featureId,reason:'request recipes exist; remaining original suite assertions are not yet fully mapped'});
  }
  const originalGateEvidence={required:true,verification:'not-executed',execution:structuredClone(stable.document.execution),
    coverageIds:originalGateCoverage,hostOnlyDependencies,locators,fixtures:[...stable.document.fixtureFiles],bootstrapSources:[...parity.document.bootstrapSources],
    dimensions:parity.document.dimensions.map(item=>item.id)};
  const evidence = sourceEvidence();
  return {format: 'eliscript-compiler-matrix-corpus', version: 1,
    manifests: Object.fromEntries(originals.manifests.map(item => [item.id, {sha256: item.sha256, identity: item.identity}])),
    coverageIds: [...originals.requiredCoverage], expectedIds: records.map(record => record.id), records, evidence, originalGateEvidence, missingCaseAdapters};
}

export function compilerCorpusRequest(record, target, options = {}) {
  if (record.kind === 'stage') return cloneCompilerCorpusData(record.request);
  if (record.kind === 'original-suite' || record.kind === 'sequence') return null;
  return {...record.request, operation: 'project', modules: cloneCompilerCorpusModules(record.modules), entry: record.entry, target,
    memory: record.memory ?? options.memory, nativeTarget: record.nativeTarget ?? options.nativeTarget ?? (process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos'),
    nativeFormat: record.nativeFormat ?? options.nativeFormat ?? 'library'};
}

function addOriginalRequestRecipes({add, locators, irCases, portableSources}) {
  const locatorIds = file => {
    const ids = locators.filter(item => item.file === file).map(item => item.id);
    if (!ids.length) throw new Error('original recipe has no retained suite locator: ' + file);
    return ids;
  };
  const addSequence = (id, suite, steps) => add({id: 'original-sequence:' + id, kind: 'sequence',
    coverage: locatorIds(suite), original: {suite}, steps, expected: {kind: 'sequence'}});
  const project = (source, helper) => ({operation: 'project', resolveImports: true, sourceMap: true, entry: 'main.mjs', modules: [
    {id: 'main.mjs', filename: 'main.eli', source},
    ...(helper === undefined ? [] : [{id: 'helper.mjs', filename: 'helper.eli', source: helper}]),
  ]});
  const diskSource = '(import "./helper.eli" answer)\n(print answer)\n';
  const virtualSource = '(import "./helper.eli" answer)\n(print (+ answer 1))\n';
  const helper = '(defconst answer 42)\n(export answer)\n';
  addSequence('project-source-edits', 'tests/bootstrap-project.test.mjs', [
    {id: 'initial', request: project(diskSource, helper), artifact: {kind: 'stdout', expected: '42\n'}},
    {id: 'identical', request: project(diskSource, helper), artifact: {kind: 'stdout', expected: '42\n'}, sameProductAs: 'initial'},
    {id: 'override', request: project(virtualSource, helper), artifact: {kind: 'stdout', expected: '43\n'}},
    {id: 'restore-disk', request: project(diskSource, helper), artifact: {kind: 'stdout', expected: '42\n'}, sameProductAs: 'initial'},
    {id: 'invalid-edit', request: project('(print missing)\n', helper), error: {code: 'ELI-A0001', phase: 'analysis'}},
    {id: 'after-failed-edit', request: project(diskSource, helper), artifact: {kind: 'stdout', expected: '42\n'}, sameProductAs: 'initial'},
  ]);
  const macro = '(defmacro configured-value ()\n  (macro-read-file "build-value.txt"))\n(defconst value (configured-value))\n(export value)';
  const macroProject = value => ({...project(macro), macroContext: {capabilities: ['read-file'], files: [
    {specifier: 'unused.txt', content: 'declared-but-unused'}, {specifier: 'build-value.txt', content: value},
  ]}});
  addSequence('macro-file-edits', 'tests/macro-file-dependencies.test.mjs', [
    {id: 'initial', request: macroProject('first-value'), artifact: {kind: 'exports', values: {value: 'first-value'}}},
    {id: 'cache-hit', request: macroProject('first-value'), artifact: {kind: 'exports', values: {value: 'first-value'}}, sameProductAs: 'initial'},
    {id: 'changed-file', request: macroProject('second-value'), artifact: {kind: 'exports', values: {value: 'second-value'}}},
    {id: 'no-capability', request: {operation: 'stage', stage: 'ir', source: macro, filename: 'macro-context.eli'},
      error: {contains: 'macro capability is not enabled: read-file'}},
    {id: 'undeclared-file', request: {operation: 'stage', stage: 'ir', source: macro, filename: 'macro-context.eli', macroContext: {capabilities: ['read-file'], files: []}},
      error: {contains: 'macro file dependency is not declared: build-value.txt'}},
    {id: 'direct-context', request: {operation: 'stage', stage: 'emitter', source: macro, filename: 'macro-context.eli',
      macroContext: {capabilities: ['read-file'], files: [{specifier: 'build-value.txt', content: 'forty-two'}]}}, containsData: 'const value = "forty-two";'},
  ]);
  const provider = [
    'globalThis.__eliscript_import_effects =', '  (globalThis.__eliscript_import_effects ?? 0) + 1;',
    'export default 11;', 'export const named_value = 22;', 'export const namespace_value = 33;',
    'export const effect_count = () => globalThis.__eliscript_import_effects;', '',
  ].join('\n');
  const imports = [
    '(import "./provider.mjs")', '(import "./provider.mjs" :default default-value effect-count named-value)',
    '(import "./provider.mjs" :default namespace-default :as Provider)', '(defun report ()',
    '  (js-array default-value', '            named-value', '            namespace-default',
    '            (get Provider "namespace_value")', '            (effect-count)))', '(export report)', '',
  ].join('\n');
  addSequence('esm-imports', 'tests/esm-imports.test.mjs', [{id: 'imports', request: {...project(imports), resolveImports: false,
    hostModules:[{id:'provider.mjs',specifier:'./provider.mjs',referrer:'main.mjs',allowedExports:['default','effect_count','named_value'],namespace:true}],
    hostSources:[{id:'provider.mjs',filename:'provider.mjs',source:provider}]},
    sidecars: [{file: 'provider.mjs', source: provider}], artifact: {kind: 'exports', isolated: true, calls: [{name: 'report', args: [], expected: [11, 22, 11, 33, 1]}]}}]);
  const protocolCases = [
    ['single-defaults', 'build-operation-request', {mode: 'single', input: 'src/defaults.eli'},
      {format: 'eliscript-build-operation', version: 1, mode: 'single', input: 'src/defaults.eli', output: null, sourceMap: false, portableEntries: []}],
    ['single-portable-order', 'build-operation-request', {mode: 'single', input: 'src/main.eli', output: null, sourceMap: false, portableEntries: ['zeta', 'alpha', 'zeta']},
      {format: 'eliscript-build-operation', version: 1, mode: 'single', input: 'src/main.eli', output: null, sourceMap: false, portableEntries: ['alpha', 'zeta']}],
    ['project-request', 'project-request', {entry: 'src/main.eli', outDir: 'dist', root: null, portableEntries: ['zeta', 'alpha', 'zeta'], useCache: true},
      {format: 'eliscript-project-request', version: 1, entry: 'src/main.eli', outDir: 'dist', root: null,
        portableEntries: ['alpha', 'zeta'], macroCapabilities: [], macroFileDependencies: [], useCache: true}],
    ['check-report', 'project-check-report', {mode: 'standard', root: 'root', entries: ['src/z.eli', 'src/a.eli'], portableEntries: [], modules: [
      {source: 'src/z.eli', dependencies: [], portableEntries: []}, {source: 'src/a.eli', dependencies: ['src/z.eli'], portableEntries: []}]},
      {format: 'eliscript-check-report', version: 1, status: 'ok', mode: 'standard', root: 'root', entries: ['src/a.eli', 'src/z.eli'], portableEntries: [], counts: {modules: 2}, modules: [
        {source: 'src/a.eli', dependencies: ['src/z.eli'], portableEntries: []}, {source: 'src/z.eli', dependencies: [], portableEntries: []}]}],
  ];
  addSequence('project-protocols', 'tests/bootstrap-project.test.mjs', protocolCases.map(([id, name, input, expected]) =>
    ({id, request: {operation: 'protocol', name, input}, expected})));
  const portableSource='(defconst step 2)\n(defportable helper (value) (* value step))\n(defportable work (value) (helper value))\n(defportable unused () 99)\n(defun ordinary () 1)';
  addSequence('portable-transitive-closure','tests/eliscript-tests.el',[
    {id:'selection',request:{operation:'stage',stage:'portable',source:portableSource,filename:'portable.eli',entries:['work'],allowProjectImports:false}},
    {id:'emission',request:{operation:'compile',source:portableSource,filename:'portable.eli',portableEntries:['work']},
      includesJavascript:['const step = 2;','function helper(value)','function work(value)'],excludesJavascript:['function unused','function ordinary']},
    {id:'import-requires-project',request:{operation:'stage',stage:'portable',source:'(import-portable "./math.eli" increment)\n(defportable work (value) (increment value))',filename:'portable.eli',entries:['work'],allowProjectImports:false},
      error:{contains:'portable import increment requires a project build'}},
    ...Object.entries(portableSources).map(([name,source])=>({id:'stdlib-'+name,request:{operation:'compile',source,filename:'stdlib/'+name+'.eli',portableEntries:[{sequence:'map',text:'blank?',object:'omit'}[name]]},
      includesJavascript:{sequence:['function reverse(values)','function map(function$, values)'],text:['function slice(start, end, text)','function whitespace','function trim(text)','function blank'],object:['function keys(object)','function key_in_QMARK_','function omit(object, omitted_keys)']}[name],
      excludesJavascript:{sequence:['function filter','function range'],text:['function join','function repeat'],object:['function map_values','function update']}[name]})),
  ]);
  const cacheModules=[{source:'src/main.eli',output:'src/main.mjs',sourceMap:'src/main.mjs.map',sourceDigest:'source',outputDigest:'output',sourceMapDigest:'map'}];
  const metadataModules=[{source:'src/main.eli',dependencies:[],portableEntries:[]}];
  const cacheLookupInput={enabled:true,manifestStatus:'readable',expectedEntry:'src/main.mjs',graphDigestValid:true,cacheDigestValid:true,compilerDigest:'compiler',mode:'standard',portableEntries:[]};
  const cacheManifest=version=>({format:'eliscript-project',version:1,entry:'src/main.mjs',digest:'manifest',modules:cacheModules,cache:{
    ...(version===2?{format:'eliscript-project-cache'}:{}),version,compilerDigest:'compiler',mode:'standard',portableEntries:[],modules:metadataModules}});
  const reportInput={mode:'standard',root:'root',outDir:'root/dist',entry:'src/main.eli',entryOutput:'src/main.mjs',manifest:'eliscript-project.json',digest:'abc123',portableEntries:[],
    cache:{enabled:true,reason:'verified'},timings:{cacheReadMs:0.1236,workMs:1.2344,manifestWriteMs:0.3456,totalMs:1.7036},modules:[
      {source:'src/value.eli',output:'src/value.mjs',sourceMap:'src/value.mjs.map',status:'compiled',reason:'source-changed',dependencies:[],portableEntries:[]},
      {source:'src/main.eli',output:'src/main.mjs',sourceMap:'src/main.mjs.map',status:'reused',reason:'verified',dependencies:['src/value.eli','src/value.eli'],portableEntries:[]}]};
  addSequence('project-cache-reports','tests/bootstrap-project.test.mjs',[
    {id:'current-cache',request:{operation:'protocol',name:'project-cache-lookup',input:{...cacheLookupInput,manifest:cacheManifest(2)}},expectFields:[
      {path:['reason'],value:'verified'},{path:['cache','sourceVersion'],value:2}]},
    {id:'legacy-cache',request:{operation:'protocol',name:'project-cache-lookup',input:{...cacheLookupInput,manifest:cacheManifest(1)}},expectFields:[
      {path:['reason'],value:'verified'},{path:['cache','sourceVersion'],value:1}]},
    {id:'unreadable-artifact',request:{operation:'protocol',name:'project-cache-decision',input:{record:{$compilerCorpusRef:'current-cache.cache.records.0'},output:'src/main.mjs',sourceMap:'src/main.mjs.map',
      expectedPortableEntries:[],sourceDigest:'changed',outputExists:true,sourceMapExists:true,outputDigest:'output',sourceMapDigest:'map',dependenciesValid:true,artifactFailure:'artifact-unreadable'}},
      expected:{reused:false,reason:'artifact-unreadable'}},
    {id:'report',request:{operation:'protocol',name:'project-build-report',input:reportInput},expectFields:[
      {path:['cache'],value:{enabled:true,status:'partial',reason:'dirty-modules'}},{path:['counts'],value:{modules:2,compiled:1,reused:1}},
      {path:['timings'],value:{cacheReadMs:0.124,workMs:1.234,manifestWriteMs:0.346,totalMs:1.704}},
      {path:['modules',0,'source'],value:'src/main.eli'},{path:['modules',0,'dependencies'],value:['src/value.eli']},{path:['modules',1,'source'],value:'src/value.eli'}]},
    {id:'bad-report',request:{operation:'protocol',name:'project-build-report',input:{...reportInput,cache:{enabled:'yes',reason:'verified'}}},error:{contains:'build report cache enabled must be a boolean'}},
    {id:'empty-entries',request:{operation:'protocol',name:'project-request',input:{entries:[],outDir:'dist',root:'root',portableEntries:[],useCache:true}},error:{code:'ELI-B0001',phase:'project-build'}},
    {id:'invalid-portable-entry',request:{operation:'protocol',name:'project-request',input:{entry:'main.eli',outDir:'dist',root:null,portableEntries:[42],useCache:true}},error:{code:'ELI-B0001',phase:'project-build'}},
    {id:'missing-source-map-output',request:{operation:'protocol',name:'build-operation-request',input:{mode:'single',input:'main.eli',output:null,sourceMap:true,portableEntries:[]}},error:{code:'ELI-B0001',phase:'project-build'}},
    {id:'graph',request:{operation:'protocol',name:'project-plan',input:{entries:['b','a','a'],dependencies:{a:['b'],b:['a']}}},expected:{
      format:'eliscript-project-plan',version:1,mode:'standard',entries:['a','b'],modules:[{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}]}},
    {id:'portable-graph',request:{operation:'protocol',name:'portable-project-plan',input:{entries:[{id:'a',entries:['x']}],resolutions:[
      {id:'a',includes:'z',dependencies:[{id:'c',entries:['q']}]},{id:'a',dependencies:[{id:'b',entries:['y']}]},{id:'b',dependencies:[{id:'a',entries:['z']}]}]}},expectFields:[
      {path:['calls'],value:[{id:'a',entries:['x']},{id:'b',entries:['y']},{id:'a',entries:['x','z']},{id:'c',entries:['q']}]},
      {path:['plan','modules',0,'entries'],value:['x','z']},{path:['plan','modules',0,'dependencies'],value:[{id:'b',entries:['y']},{id:'c',entries:['q']}]}]},
  ]);
  const configuration={schemaVersion:1,entry:'src/main.eli',outDir:'dist'};
  const configurationRequest=input=>({operation:'protocol',name:'project-configuration',input,filename:'eliscript.json'});
  const invalidConfigurations=[
    {...configuration,undeclared:true}, {...configuration,entry:'../main.eli'}, {...configuration,cache:'yes'},
    {schemaVersion:2,entries:[],outDir:'dist'}, {...configuration,macroCapabilities:['network']},
    {...configuration,macroFileDependencies:['build.txt']}, {...configuration,macroCapabilities:['read-file'],macroFileDependencies:['../build.txt']},
  ];
  addSequence('project-configuration','tests/bootstrap-project.test.mjs',[
    {id:'defaults',request:configurationRequest(configuration),expected:{format:'eliscript-project-request',version:1,sourceRoot:'.',entry:'src/main.eli',outDir:'dist',portableEntries:[],macroCapabilities:[],macroFileDependencies:[],cache:true}},
    {id:'multiple-entries',request:configurationRequest({schemaVersion:2,sourceRoot:'src',entries:['z.eli','a.eli'],outDir:'dist'}),expected:{format:'eliscript-project-request',version:2,sourceRoot:'src',entries:['a.eli','z.eli'],outDir:'dist',portableEntries:[],macroCapabilities:[],macroFileDependencies:[],cache:true}},
    {id:'macro-files',request:configurationRequest({schemaVersion:1,sourceRoot:'src',entry:'main.eli',outDir:'dist',macroCapabilities:['read-file'],macroFileDependencies:['z.txt','a.txt']}),expectFields:[
      {path:['macroCapabilities'],value:['read-file']},{path:['macroFileDependencies'],value:['a.txt','z.txt']}]},
    ...invalidConfigurations.map((input,index)=>({id:'invalid-'+index,request:configurationRequest(input),error:{code:'ELI-B0002',phase:'project-config'}})),
  ]);
  const evaluationSuite='tests/bootstrap-evaluation.test.mjs';
  if(locators.some(item=>item.file===evaluationSuite))addSequence('evaluation-descriptions',evaluationSuite,[
    {id:'operation',request:{operation:'protocol',name:'evaluation-operation-request',input:{id:7,operation:'evaluate',source:'(+ 1 2)',filename:'repl.eli'}},expected:{format:'eliscript-evaluation-operation',version:1,id:7,operation:'evaluate',source:'(+ 1 2)',filename:'repl.eli',root:null,line:1,column:1}},
    {id:'reset-source-refusal',request:{operation:'protocol',name:'evaluation-operation-request',input:{operation:'reset',source:'(+ 1 2)'}},error:{contains:'reset evaluation operation does not accept source fields'}},
    {id:'unknown-option',request:{operation:'protocol',name:'evaluation-operation-request',input:{operation:'describe',framework:'anything'}},error:{contains:'unknown evaluation operation key: framework'}},
    {id:'incomplete',request:{operation:'protocol',name:'evaluation-input-description',source:'(+ 1',filename:'repl.eli'},expected:{format:'eliscript-evaluation-input',version:1,status:'incomplete',filename:'repl.eli'}},
    {id:'function',request:{operation:'protocol',name:'evaluation-form-description',source:'(defun value () 42)',filename:'repl.eli'},expected:{format:'eliscript-evaluation-form',version:1,kind:'definition',head:'defun',name:'value',runtimeBinding:true,filename:'repl.eli'}},
    {id:'macro',request:{operation:'protocol',name:'evaluation-form-description',source:'(defmacro twice (value) `(+ ,value ,value))',filename:'repl.eli'},expectFields:[{path:['runtimeBinding'],value:false}]},
    {id:'method',request:{operation:'protocol',name:'evaluation-form-description',source:'(defmethod render :text (value) value)',filename:'repl.eli'},expectFields:[{path:['kind'],value:'expression'}]},
    {id:'protocol',request:{operation:'protocol',name:'evaluation-form-description',source:'(defprotocol IDescribe describe)',filename:'repl.eli'},expectFields:[{path:['kind'],value:'definition'},{path:['name'],value:'IDescribe'},{path:['runtimeBinding'],value:true}]},
    ...['(extend-type Box IDescribe (describe (value) value))','(extend-category "number" IDescribe (describe (value) value))','(extend-default IDescribe (describe (value) value))','(jsx 1)','(fragment 1)','(defcomponent 1)'].map((source,index)=>({id:'expression-'+index,request:{operation:'protocol',name:'evaluation-form-description',source,filename:'repl.eli'},expectFields:[{path:['kind'],value:'expression'}]})),
    {id:'import',request:{operation:'protocol',name:'evaluation-form-description',source:'(import "./value.mjs" value)',filename:'repl.eli'},expectFields:[{path:['kind'],value:'module'}]},
  ]);
  const ref = path => ({$compilerCorpusRef: path});
  const schemaError = contains => ({contains, code: 'ELI-I0001', phase: 'ir-schema'});
  for(let index=0;index<irCases.length;index++){
    const input=irCases[index];
    addSequence('canonical-ir-roundtrip-'+index,'tests/bootstrap-ir-serialization.test.mjs',[
      {id:'program',request:{operation:'compile-ir',source:input.source,filename:input.filename}},
      {id:'canonical',request:{operation:'serialize-ir',ir:ref('program.ir')},canonicalEnvelope:true},
      {id:'roundtrip',request:{operation:'deserialize-ir',canonicalIR:ref('canonical.canonicalIR')},sameFieldsAs:{step:'program',fields:['ir']}},
      {id:'reserialize',request:{operation:'serialize-ir',ir:ref('roundtrip.ir')},sameFieldsAs:{step:'canonical',fields:['canonicalIR']}},
    ]);
  }
  addSequence('canonical-ir-refusals', 'tests/bootstrap-ir-serialization.test.mjs', [
    {id: 'duplicate-fields', request: {operation: 'deserialize-ir', canonicalIR: '{"format":"eliscript-ir","format":"eliscript-ir","program":{"body":[],"filename":"x.eli"},"version":1}'}, error: schemaError('not canonical')},
    {id: 'invalid-json', request: {operation: 'deserialize-ir', canonicalIR: '{'}, error: schemaError('invalid canonical IR JSON')},
    {id: 'wrong-input-type', request: {operation: 'protocol', name: 'deserialize-ir', input: {text: 42}}, error: schemaError('must be a string')},
    {id: 'program', request: {operation: 'compile-ir', source: irCases[0].source, filename: irCases[0].filename}},
    {id: 'canonical', request: {operation: 'serialize-ir', ir: ref('program.ir')}, canonicalEnvelope: true},
    {id: 'roundtrip', request: {operation: 'deserialize-ir', canonicalIR: ref('canonical.canonicalIR')}, sameFieldsAs: {step: 'program', fields: ['ir']}},
    {id: 'reserialize', request: {operation: 'serialize-ir', ir: ref('roundtrip.ir')}, sameFieldsAs: {step: 'canonical', fields: ['canonicalIR']}},
    {id: 'leading-space', request: {operation: 'deserialize-ir', canonicalIR: {$compilerCorpusConcat: [' ', ref('canonical.canonicalIR')]}}, error: schemaError('not canonical')},
    {id: 'future-version', request: {operation: 'deserialize-ir', canonicalIR: {$compilerCorpusReplace: [ref('canonical.canonicalIR'), '"version":1}', '"version":2}']}}, error: schemaError('unsupported IR version')},
    {id:'extra-field',request:{operation:'deserialize-ir',canonicalIR:{$compilerCorpusJsonPatch:[ref('canonical.canonicalIR'),[{path:['extra'],value:true}]]}},error:schemaError('unknown or missing fields')},
    {id:'unknown-kind',request:{operation:'serialize-ir',ir:{$compilerCorpusJsonPatch:[ref('program.ir'),[{path:['body',0,'kind'],value:'future-node'}]]}},error:schemaError('unknown Eliscript IR node kind')},
    {id:'bad-span',request:{operation:'serialize-ir',ir:{$compilerCorpusJsonPatch:[ref('program.ir'),[{path:['body',0,'span','start'],value:-1}]]}},error:schemaError('must be a non-negative integer')},
    {id:'null-child',request:{operation:'serialize-ir',ir:{$compilerCorpusJsonPatch:[ref('program.ir'),[{path:['body',0,'children'],append:null}]]}},error:schemaError('plain data object')},
    {id:'negative-zero',request:{operation:'serialize-ir',ir:{$compilerCorpusJsonPatch:[ref('program.ir'),[{path:['body',0,'value'],negativeZero:true}]]}},containsField:{field:'canonicalIR',text:'"value":-0'}},
    {id:'negative-zero-read',request:{operation:'deserialize-ir',canonicalIR:ref('negative-zero.canonicalIR')},negativeZeroAt:['body',0,'value']},
  ]);
}

async function addOriginalFormatterRecipes({add,locators,text,file,sourceRoot}) {
  const suite='tests/bootstrap-formatter.test.mjs',suiteLocators=locators.filter(item=>item.file===suite);
  if(!suiteLocators.length)return;
  const original=await text(suite),trailing=originalRegion(original,'    const trailing = ',';\n');
  const bindings=new Map([['trailing',originalDataLiteral(trailing.text.slice('    const trailing = '.length))]]);
  const input=originalTemplate(original,'    const source = `',bindings),expected=originalTemplate(original,'    const expected = `');
  const semantic=originalTemplate(original,'    const semanticSource = `');
  const origin={suite,sourceSha256:(await file(suite)).sha256,regions:[trailing,input,expected,semantic].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))};
  const refs=path=>({$compilerCorpusRef:path});
  const append=(id,steps)=>add({id:'original-sequence:formatter-'+id,kind:'sequence',coverage:suiteLocators.map(item=>item.id),
    original:structuredClone(origin),expected:{kind:'sequence'},steps});
  const modules=[];
  for(const name of ['formatter','reader','syntax'])modules.push({id:'bootstrap/compiler/'+name+'.mjs',filename:'bootstrap/compiler/'+name+'.eli',source:await text('bootstrap/compiler/'+name+'.eli')});
  const bridge='(import "./bootstrap/compiler/formatter.mjs" formatter-format formatter-version formatter-width formatter-indent format-source)\n'+
    '(defconst formatName formatter-format) (defconst formatVersion formatter-version) (defconst formatWidth formatter-width) (defconst formatIndent formatter-indent)\n'+
    '(defun format-source-for-host (source filename) (format-source source filename))\n'+
    '(defun diagnostic-report (source mode) (try (format-source source "broken.eli") (catch error (let ((d (get error :eliscriptDiagnostic))) '+
    '(if (= mode 0) (js-array (get d :format) (get d :version) (get d :code) (get d :phase) (get (get d :location) :file)) '+
    '(js-array (get d :code) (get d :phase) (get d :message)))))))\n'+
    '(export formatName formatVersion formatWidth formatIndent format-source-for-host diagnostic-report)';
  const project={operation:'project',resolveImports:true,entry:'entry.mjs',modules:[{id:'entry.mjs',filename:'formatter-original-oracle.eli',source:bridge},...modules]};
  append('metadata-and-errors',[{id:'original-exports',request:project,artifact:{kind:'exports',isolated:true,
    values:{formatName:'eliscript-formatter',formatVersion:1,formatWidth:88,formatIndent:2},calls:[
      {name:'diagnostic-report',javascriptName:'diagnostic_report',args:['(module broken',0],expected:['eliscript-diagnostic',1,'ELI-R0001','reader','broken.eli']},
      {name:'diagnostic-report',javascriptName:'diagnostic_report',args:[42,1],expected:['ELI-F0001','formatter','formatter source must be a string']},
      {name:'format-source-for-host',javascriptName:'format_source_for_host',args:[input.code,'node.eli'],expected:expected.code},
    ]}}]);
  add({id:'original-program:formatter-node',kind:'project',coverage:suiteLocators.map(item=>item.id),
    modules,entry:'bootstrap/compiler/formatter.mjs',request:{operation:'project',resolveImports:true},
    execution:{kind:'original-program',host:null,hostSource:null,environment:'COMPILER_URL',aliases:true,
      hostEval:'import {pathToFileURL} from "node:url";\n'+
        'const c = await import(pathToFileURL(process.env.COMPILER_URL).href); '+
        'process.stdout.write(c.format_source('+JSON.stringify(input.code)+", 'node.eli'));"},
    expected:{kind:'seed-program',oracleRequired:true,stdout:expected.code},
    original:{...structuredClone(origin),fixture:'bootstrap/compiler/formatter.eli',host:suite}});
  append('concrete-syntax',[
    {id:'canonical',request:{operation:'format',source:input.code,filename:'formatter-case.eli'},expected:{source:expected.code}},
    {id:'idempotent',request:{operation:'format',source:refs('canonical.source'),filename:'formatter-case.eli'},sameFieldsAs:{step:'canonical',fields:['source']}},
  ]);
  const sources=[];
  async function visit(directory){for(const entry of await readdir(sourcePath(sourceRoot,directory),{withFileTypes:true})){
    const name=directory+'/'+entry.name;if(entry.isDirectory())await visit(name);else if(entry.isFile()&&name.endsWith('.eli'))sources.push(name);
  }}
  await visit('bootstrap/compiler');await visit('stdlib');sources.sort();
  if(sources.length<40)throw new Error('original formatter source corpus has fewer than forty programs');
  for(const [index,filename]of ['formatter-semantic.eli',...sources].entries()){
    const source=index===0?semantic.code:await text(filename);
    append('semantic-'+index,[
      {id:'canonical',request:{operation:'format',source,filename}},
      {id:'idempotent',request:{operation:'format',source:refs('canonical.source'),filename},sameFieldsAs:{step:'canonical',fields:['source']}},
      {id:'original-js',request:{operation:'compile',source,filename}},
      {id:'formatted-js',request:{operation:'compile',source:refs('canonical.source'),filename},sameFieldsAs:{step:'original-js',fields:['javascript']}},
    ]);
  }
  // Every original assertion in this suite now has an executable recipe.
  // Actual acceptance still requires all of these records on the selected cell.
  return suite;
}

async function addOriginalGeneratedNamesRecipes({add,locators,text,file}) {
  const suite='tests/macro-generated-names.test.mjs',coverage=locators.filter(item=>item.file===suite).map(item=>item.id);
  if(!coverage.length)return;
  const original=await text(suite),input=originalTemplate(original,'const source = `');
  const bun=originalRegion(original,'    const module = await import(', '\n    const nodeCheck = [');
  const node=originalInlineArray(original,'    const nodeCheck = [\n','    ].join("");',new Set([
    '`import(${JSON.stringify(pathToFileURL(outputPath).href)})`,',
  ]),'');
  const origin={suite,fixture:suite,host:suite,sourceSha256:(await file(suite)).sha256,
    regions:[input,bun,node].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))};
  const modules=[{id:'generated-names.mjs',filename:'generated-names.eli',source:input.code}];
  for(const host of ['bun','node']){
    const hostSource='import {pathToFileURL} from "node:url";\n'+(host==='bun'
      ?'import {expect} from "bun:test";\nconst outputPath=process.argv[2];\n'+bun.text
      :'import(pathToFileURL(process.argv[2]).href)'+node.code+';\n');
    add({id:'original-program:macro-generated-names-'+host,kind:'project',coverage,
      modules:cloneCompilerCorpusModules(modules),entry:'generated-names.mjs',request:{operation:'project',sourceMap:true},
      execution:{kind:'original-program',host:'tests/__eliscript_original_generated_names_'+host+'.mjs',hostSource,
        argument:'path',argumentModules:['generated-names.mjs'],aliases:true,requiresBun:host==='bun',hostRuntime:host},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},original:structuredClone(origin)});
  }
  // The original macro suite compares the entire emitted JavaScript and map
  // against the independent Emacs Seed, in addition to executing both hosts.
  add({id:'original-stage:macro-generated-names-emitter',kind:'stage',coverage,
    request:{operation:'stage',stage:'emitter',source:input.code,filename:'generated-names.eli',
      sourceMap:{generatedFile:'fixture.mjs',sourceName:'generated-names.eli'}},
    expected:{kind:'stage',oracleRequired:true},
    original:{...structuredClone(origin),manifest:'stable-compatibility',
      oracleCase:{name:'macro-generated-names',source:input.code,filename:'generated-names.eli'}}});
  const includes=[],excludes=[];
  const assertion=/expect\(seedJavaScript\)(\.not)?\.toContain\(\s*((?:"(?:\\.|[^"\\])*"|'[^'\\]*'))\s*,?\s*\)/g;
  for(const match of original.matchAll(assertion)){
    const value=match[2][0]==="'"?match[2].slice(1,-1):originalDataLiteral(match[2]);
    (match[1]?excludes:includes).push(value);
  }
  if(includes.length!==3||excludes.length!==1)throw new Error('original generated-name emission assertion inventory changed');
  add({id:'original-sequence:macro-generated-name-emission',kind:'sequence',coverage,original:structuredClone(origin),expected:{kind:'sequence'},steps:[
    {id:'first',request:{operation:'compile',source:input.code,filename:'generated-names.eli',sourceMap:{generatedFile:'generated-names.mjs',sourceName:'generated-names.eli'}},
      includesJavascript:includes,excludesJavascript:excludes},
    {id:'repeat',request:{operation:'compile',source:input.code,filename:'generated-names.eli',sourceMap:{generatedFile:'generated-names.mjs',sourceName:'generated-names.eli'}},sameFieldsAs:{step:'first',fields:['javascript','sourceMap']}},
  ]});
  return suite;
}

async function addOriginalESMRecipes({add,locators,text,file}) {
  const suite='tests/esm-imports.test.mjs',coverage=locators.filter(item=>item.file===suite).map(item=>item.id);
  if(!coverage.length)return;
  const original=await text(suite),provider=originalInlineArray(original,'    const provider = [\n','    ].join("\\n");',new Set(),'\n');
  const input=originalInlineArray(original,'    const source = [\n','    ].join("\\n");',new Set(),'\n');
  const expectedRegion=originalRegion(original,'    const expected = ',';\n');
  const expected=originalDataLiteral(expectedRegion.text.slice('    const expected = '.length));
  if(!Array.isArray(expected))throw new TypeError('original ESM expected result changed');
  const origin={suite,fixture:suite,host:suite,sourceSha256:(await file(suite)).sha256,
    regions:[provider,input,expectedRegion].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))};
  const includes=[];
  for(const match of original.matchAll(/expect\(seedJavaScript\)\.toContain\(\s*'([^'\\]*)'\s*,?\s*\)/g))includes.push(match[1]);
  if(includes.length!==3)throw new TypeError('original ESM emission assertion inventory changed');
  add({id:'original-stage:esm-imports-emitter',kind:'stage',coverage,
    request:{operation:'stage',stage:'emitter',source:input.code,filename:'imports.eli',sourceMap:{generatedFile:'fixture.mjs',sourceName:'imports.eli'}},
    expected:{kind:'stage',oracleRequired:true},original:{...structuredClone(origin),manifest:'stable-compatibility',
      oracleCase:{name:'esm-imports',source:input.code,filename:'imports.eli'}}});
  add({id:'original-sequence:esm-imports-emission',kind:'sequence',coverage,original:structuredClone(origin),expected:{kind:'sequence'},steps:[
    {id:'emission',request:{operation:'compile',source:input.code,filename:'imports.eli'},includesJavascript:includes},
  ]});
  for(const host of ['bun','node'])add({id:'original-program:esm-imports-'+host,kind:'project',coverage,
    modules:[{id:'imports.mjs',filename:'imports.eli',source:input.code}],entry:'imports.mjs',
    request:{operation:'project',resolveImports:false,sourceMap:true,
      hostModules:[{id:'provider.mjs',specifier:'./provider.mjs',referrer:'imports.mjs',allowedExports:['default','effect_count','named_value'],namespace:true}],
      hostSources:[{id:'provider.mjs',filename:'provider.mjs',source:provider.code}]},
    execution:{kind:'original-program',host:'tests/__eliscript_original_esm_'+host+'.mjs',
      hostSource:'import {pathToFileURL} from "node:url";\nconst module = await import(pathToFileURL(process.argv[2]).href);\nconsole.log(JSON.stringify(module.report()));\n',
      argument:'path',argumentModules:['imports.mjs'],aliases:true,requiresBun:host==='bun',hostRuntime:host},
    expected:{kind:'seed-program',oracleRequired:true,stdout:JSON.stringify(expected)+'\n'},original:structuredClone(origin)});
  return suite;
}

// These hosts retain the original executable assertions. Only the already
// compiled module directory and immutable original source root are supplied by
// the matrix runner; none of the compiler algorithms execute in this adapter.
async function addOriginalCompilerModulePrograms({add,locators,text,file,bootstrapSources}) {
  const modules=[],mappedSuites=[];
  for(const filename of bootstrapSources){
    if(!filename.startsWith('bootstrap/compiler/')||!filename.endsWith('.eli'))throw new TypeError('original compiler source graph changed');
    modules.push({id:filename.slice(0,-4)+'.mjs',filename,source:await text(filename)});
  }
  const plans=[
    {name:'bootstrap-reader',suite:'tests/bootstrap-reader.test.mjs',
      assertion:'bootstrapped reader matches normalized seed syntax and diagnostics',
      begin:'  const reader = await import(',end:'\n}, 30_000);',helperEnd:'\n// Build both complete compiler',
      stage:'reader',diagnostics:true,repeatGraph:true},
    {name:'bootstrap-expander',suite:'tests/bootstrap-expander.test.mjs',
      assertion:'bootstrapped expander matches seed syntax, spans, and diagnostics',begin:'    const reader = await import(',stage:'expander',diagnostics:true},
    {name:'bootstrap-analyzer',suite:'tests/bootstrap-analyzer.test.mjs',
      assertion:'bootstrapped analyzer matches seed acceptance and diagnostics',begin:'    const reader = await import(',stage:'analyzer',diagnostics:true},
    {name:'bootstrap-ir',suite:'tests/bootstrap-ir.test.mjs',
      assertion:'bootstrapped lowerer matches complete seed IR trees and spans',begin:'    const module = async (name) => import(',stage:'ir'},
    {name:'bootstrap-emitter',suite:'tests/bootstrap-emitter.test.mjs',
      assertion:'bootstrapped emitter matches seed ESM and Source Map output',begin:'    const module = async (name) => import(',stage:'emitter',child:true},
    {name:'reader-program-fuzz',suite:'tests/reader-program-fuzz.test.mjs',
      assertion:'100000 deterministic reader and program mutations preserve every invariant',
      helperStart:'async function runAcceptanceFuzz()',begin:'  await proveFuzzProgramEmission();',end:'\n}, 320_000);',child:true,fuzz:true},
    {name:'canonical-ir',suite:'tests/bootstrap-ir-serialization.test.mjs',
      assertion:'canonical IR v1 is lossless, strict, and host reproducible',begin:'    const module = async (name) => import(',child:true},
    {name:'ir-kind',suite:'tests/compiler-ir-kind.test.mjs',
      assertion:'optimized IR node-kind decisions match the linear reference',begin:'    const module = (name) => import(',constants:'compilerSources'},
    {name:'locate',suite:'tests/compiler-locate.test.mjs',
      assertion:'ordered compiler mark location matches its scan and copy reference',begin:'    const module = (name) => import(',constants:'compilerSources'},
    {name:'indent',suite:'tests/compiler-indent.test.mjs',
      assertion:'chunked compiler indentation matches its character reference',begin:'    const module = (name) => import(',constants:'compilerSources'},
    {name:'runtime-scan',suite:'tests/compiler-runtime-scan.test.mjs',
      assertion:'optimized compiler runtime scan matches its readable reference',begin:'    const module = (name) => import(',constants:'compilerSources'},
    {name:'source-map-cursor',suite:'tests/compiler-source-map-cursor.test.mjs',
      assertion:'ordered Source Map cursors match their complete scan references',begin:'    const module = (name) => import(',constants:'compilerNames'},
    {name:'reader-character',suite:'tests/compiler-reader-character.test.mjs',
      assertion:'reader character predicates match their Eliscript references',begin:'    const reader = await import('},
    {name:'binary-comparison',suite:'tests/compiler-binary-comparison.test.mjs',
      assertion:'binary comparison emission preserves strict argument evaluation',begin:'    const compiler = await import(',child:true},
  ];
  for(const plan of plans){
    if(!locators.some(item=>item.file===plan.suite))continue;
    const original=await text(plan.suite),helpers=originalRegion(original,plan.helperStart??'async function run(',plan.helperEnd??'\ntest(');
    const body=originalRegion(original,plan.begin,plan.end??'\n  } finally {');
    const transported=plan.assertion+'\n'+helpers.text+'\n'+body.text;
    const coverage=locators.filter(item=>item.file===plan.suite&&typeof item.contains==='string'&&transported.includes(item.contains)&&originalReportOnlyLocators.get(item.file)!==item.contains).map(item=>item.id);
    if(!coverage.length)throw new TypeError('original compiler host has no matching assertion locator: '+plan.suite);
    const regions=[helpers,body],parts=[helpers.text,body.text];
    let fuzzProofTransport;
    if(plan.fuzz){
      const before='  await proveFuzzProgramEmission();',after='  await proveFuzzProgramEmission(directory);';
      const start=body.text.indexOf(before);
      if(start!==0||body.text.indexOf(before,before.length)>=0)
        throw new TypeError('original fuzz semantic proof entry changed');
      parts[1]=after+body.text.slice(before.length);
      const generator=await file('tools/fuzz/reader-program-fuzz.mjs');
      fuzzProofTransport={kind:'selected-compiler-semantic-proof',
        sourceFile:plan.suite,originalCall:before,selectedCall:after,
        beforeSha256:digest(Buffer.from(before)),afterSha256:digest(Buffer.from(after)),
        compilerDirectory:'selected-artifact/bootstrap/compiler',
        compilerSources:modules.map(module=>({id:module.id,filename:module.filename,
          sourceSha256:digest(Buffer.from(module.source))})),
        generator:{file:generator.file,sourceSha256:generator.sha256},
        independentOracle:'tests/bootstrap-emitter-oracle.el',
        fallback:false};
    }
    if(plan.constants){
      const constants=originalRegion(original,'const '+plan.constants+' = [','\n];');
      regions.push(constants);parts.unshift(constants.text+'\n];');
    }
    if(plan.repeatGraph){
      // The original beforeAll compares every emitted compiler file twice.
      // Keep that assertion on the actual selected target's two products;
      // the remaining original reader/diagnostic body runs below unchanged.
      const comparison=originalRegion(original,'  for (const name of artifactNames) expect(secondArtifacts.get(name)).toBe(firstArtifacts.get(name));','\n  const reader = await import(');
      regions.push(comparison);
      const request={operation:'project',resolveImports:true,phased:true,sourceMap:true,
        modules:cloneCompilerCorpusModules(modules),entry:'bootstrap/compiler/compiler.mjs',entries:modules.map(item=>item.id)};
      add({id:'original-sequence:compiler-reader-complete-artifacts',kind:'sequence',coverage,
        original:{suite:plan.suite,sourceSha256:(await file(plan.suite)).sha256,
          regions:[comparison].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))},
        expected:{kind:'sequence'},steps:[
          {id:'first',request},
          {id:'repeat',request:cloneSourceProjectRequest(request),sameProductAs:'first'},
        ]});
    }
    const preamble=[
      'import {expect} from "bun:test";',
      'import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";',
      'import path,{resolve} from "node:path";',
      'import {pathToFileURL} from "node:url";',
      'const projectDirectory=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;',
      'if(!projectDirectory)throw new Error("original compiler host requires its source root");',
      'const directory=resolve(process.argv[2],"bootstrap/compiler");',
      'const fixturePath=resolve(projectDirectory,'+JSON.stringify('tests/fixtures/bootstrap-'+(plan.stage&&plan.stage!=='emitter'?plan.stage:'ir')+'.json')+');',
      ...(plan.repeatGraph?[
        'const firstArtifacts=new Map([["reader.mjs.map",await readFile(resolve(directory,"reader.mjs.map"),"utf8")]]);',
      ]:[]),
      ...(plan.stage?[
        'const emacs=process.env.EMACS??"emacs";',
        'const oraclePath=resolve(projectDirectory,'+JSON.stringify('tests/bootstrap-'+plan.stage+'-oracle.el')+');',
      ]:[]),
      ...(plan.fuzz?[
        'const root=projectDirectory;',
        'const {fuzzCases}=await import(pathToFileURL(resolve(projectDirectory,"tools/fuzz/reader-program-fuzz.mjs")).href);',
        'const fuzzPath=resolve(process.argv[2],"__eliscript_original_fuzz_runner.mjs");',
        'process.env.ELISCRIPT_ORIGINAL_COMPILER_DIRECTORY=directory;',
        'await writeFile(fuzzPath,'+JSON.stringify([
          'import {resolve} from "node:path";',
          'import {pathToFileURL} from "node:url";',
          'await import(pathToFileURL(resolve(process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT,"tools/backends/compiler-corpus-host-context.mjs")).href);',
          'const {runReaderProgramFuzz,parseArguments,stopReaderProgramFuzz}=await import(pathToFileURL(resolve(process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT,"tools/fuzz/reader-program-fuzz.mjs")).href);',
          'process.once("SIGINT",()=>stopReaderProgramFuzz("SIGINT"));',
          'process.once("SIGTERM",()=>stopReaderProgramFuzz("SIGTERM"));',
          'try{const report=await runReaderProgramFuzz({...parseArguments(process.argv.slice(2)),compilerDirectory:process.env.ELISCRIPT_ORIGINAL_COMPILER_DIRECTORY});process.stdout.write(JSON.stringify(report)+"\\n");}',
          'catch(error){process.stderr.write(String(error.stack??error)+"\\n");process.exitCode=1;}',
        ].join('\n'))+');',
      ]:[]),
      ...(plan.diagnostics?[
        'const {diagnosticCorpusSuite}=await import(pathToFileURL(resolve(projectDirectory,"tools/diagnostics/check.mjs")).href);',
        'const diagnosticCorpus=await Bun.file(resolve(projectDirectory,"contracts/diagnostic-corpus.json")).json();',
        'const diagnosticCases=diagnosticCorpusSuite(diagnosticCorpus,'+JSON.stringify(plan.stage)+').cases;',
      ]:[]),
    ].join('\n');
    add({id:'original-program:compiler-module-'+plan.name,kind:'project',coverage,
      modules:cloneCompilerCorpusModules(modules),entry:'bootstrap/compiler/compiler.mjs',
      request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(item=>item.id)},
      execution:{kind:'original-program',host:'tests/__eliscript_original_compiler_'+plan.name+'.mjs',
        hostSource:preamble+'\n'+parts.join('\n')+'\n',arguments:[{directory:true}],aliases:true,requiresBun:true,
        runtimeProfile:'compiler',
        ...(plan.fuzz?{timeoutMs:320000}:{}),
        ...(plan.child?{childProcesses:'inherit-selected-artifact'}:{}),
        ...(plan.stage?{compilerSourceMaps:true}:{})},
      expected:{kind:'seed-program',oracleRequired:true,stdout:''},
      original:{manifest:'stable-compatibility',suite:plan.suite,fixture:plan.suite,host:plan.suite,
        sourceSha256:(await file(plan.suite)).sha256,
        regions:regions.map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256})),
        originalAssertion:plan.assertion,...(fuzzProofTransport?{setupReplacement:fuzzProofTransport}:{})}});
    mappedSuites.push(plan.suite);
  }
  return mappedSuites;
}
