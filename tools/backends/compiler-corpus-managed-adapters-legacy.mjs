import {posix,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCompilerSources} from './compiler-build.mjs';
import {loadLiteralSources} from './build.mjs';

// These adapters retain original fixture algorithms and original host assertion
// bodies. Their extra source only transports a selected artifact into those
// bodies; the independent reference is always a separate Seed product.
function between(source,begin,end,from=0) {
  const start=source.indexOf(begin,from),finish=source.indexOf(end,start+begin.length);
  if(start<0||finish<0)throw new TypeError('original managed corpus source boundary changed: '+begin);
  return source.slice(start,finish);
}
function template(source,name) {
  const declaration=new RegExp('const '+name+'\\s*=\\s*`').exec(source);
  if(!declaration)throw new TypeError('original managed source declaration changed: '+name);
  const start=declaration.index+declaration[0].length,finish=source.indexOf('`;',start);
  if(finish<0)throw new TypeError('original managed source declaration changed: '+name);
  const text=source.slice(start,finish);
  if(text.includes('${')||text.includes('\\'))throw new TypeError('original managed source template requires explicit escape transport');
  return text;
}
const common=`import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
const root=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;
const product=process.argv[2],entry=process.argv[3];
const reference=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;
if(!root||!reference)throw new Error('complete original managed corpus requires its independent Seed source graph');
const originalEntry=pathToFileURL(resolve(reference,entry)).href;
const m=await import(pathToFileURL(resolve(product,entry)).href);
let runtime,boundaryLowered,selectedInput;
if(process.env.ELISCRIPT_ORIGINAL_TARGET!=='javascript'){
 const configuration=process.env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT;
 if(!configuration)throw new Error('selected binary original corpus requires its actual runtime context');
 const {readCompilerMetadata}=await import(pathToFileURL(resolve(root,'tools/backends/compiler-metadata.mjs')).href);
 const input=await readCompilerMetadata(configuration);
 selectedInput=input;
 const {openOriginalProgramContext}=await import(pathToFileURL(resolve(root,'tools/backends/compiler-corpus-host-context.mjs')));
 runtime=(await openOriginalProgramContext(input,{identity:configuration})).runtime;
 boundaryLowered={descriptor:input.descriptor};
}
function originalObservation(source,engine='node',args=[],selected=false){
 const executable=engine==='bun'?(process.env.BUN??'bun'):(process.env.NODE??'node');
 const preload=engine==='bun'?['--preload',resolve(root,'tests/fixtures/compiled-eli-bun-preload.mjs')]:['--experimental-loader',resolve(root,'tests/fixtures/compiled-eli-node-loader.mjs')];
 const environment={...process.env};if(!selected){delete environment.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT;delete environment.ELISCRIPT_ORIGINAL_TARGET;}
 const contextOption='--import='+pathToFileURL(resolve(root,'tools/backends/compiler-corpus-host-context.mjs')).href;
 if(!selected&&environment.NODE_OPTIONS)environment.NODE_OPTIONS=environment.NODE_OPTIONS.split(/\\s+/).filter(value=>value!==contextOption).join(' ');
 if(selected&&environment.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT)source='await import('+JSON.stringify(pathToFileURL(resolve(root,'tools/backends/compiler-corpus-host-context.mjs')).href)+');\\n'+source;
 const child=spawnSync(executable,[...preload,'--input-type=module','--eval',source,...args],{cwd:root,env:environment,encoding:'utf8',timeout:30000});
 assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr||child.stdout);
 return JSON.parse(child.stdout);
}
function plain(value){return JSON.parse(JSON.stringify(value));}
`;

async function graph(text,initial) {
  const modules=new Map(),pending=[...initial];
  while(pending.length){
    const record=pending.shift();if(modules.has(record.id))continue;
    const source=record.source??await text(record.filename);
    modules.set(record.id,{id:record.id,filename:record.filename,source});
    for(const match of source.matchAll(/\(import(?:-portable)?\s+"([^"\n]+)"/g)){
      const specifier=match[1];if(!specifier.startsWith('.'))continue;
      const target=posix.normalize(posix.join(posix.dirname(record.id),specifier));
      if(target.startsWith('runtime/'))continue;
      if(target.startsWith('../'))throw new TypeError('managed fixture import escapes its source graph');
      const id=target.endsWith('.eli')?target.slice(0,-4)+'.mjs':target;
      if(modules.has(id)||pending.some(item=>item.id===id))continue;
      pending.push({id,filename:target.endsWith('.mjs')?target.slice(0,-4)+'.eli':target});
    }
  }
  return [...modules.values()];
}

export async function addOriginalManagedLibraryAdapters({add,locators,text,file,stableFiles,sourceRoot}) {
  const mapped=[];
  const literalSources=await loadLiteralSources({sourceRoot});
  for(const record of literalSources)await file(record.filename);
  async function addProgram(plan,hostSource,modules,autos=[65536,1]) {
    const coverage=['stable-compatibility:'+plan.fixture].filter(id=>stableFiles.has(plan.fixture));
    for(const locator of locators.filter(item=>item.file===plan.suite)){
      if(locator.originalCase&&Object.entries(plan.caseParameters??{}).some(([key,value])=>locator.originalCase.parameters[key]!==value))continue;
      if(typeof locator.contains==='string'&&(hostSource.includes(locator.contains)||plan.assertionSource?.includes(locator.contains)||
        (plan.caseTitles??[]).includes(locator.originalCase?.templateTitle)||(plan.assertions??[]).some(title=>title===locator.contains)))coverage.push(locator.id);
    }
    if(!coverage.length)return;
    const original=await file(plan.suite);
    for(const auto of autos)for(const hostRuntime of ['node','bun']){
      const selectedCoverage=coverage.filter(id=>{
        const bound=locators.find(locator=>locator.id===id)?.originalCase;
        return !bound||((bound.parameters.engine===undefined||bound.parameters.engine===hostRuntime)&&
          (bound.parameters.auto===undefined||bound.parameters.auto===auto)&&(bound.auto===undefined||bound.auto===auto));
      });
      add({
      id:'original-managed:'+plan.name+':'+hostRuntime+':auto-'+auto,kind:'project',coverage:selectedCoverage,
      modules:structuredClone(modules),entry:plan.entry,
      memory:structuredClone(plan.memory??{initialPages:4,maximumPages:1024}),auto,
      request:{operation:'project',resolveImports:true,phased:true,entries:modules.map(item=>item.id),sourceMap:true},
      execution:{kind:'original-program',host:'tests/__eliscript_managed_'+plan.name+'_'+hostRuntime+'_'+auto+'.mjs',
        hostSource:hostSource.replaceAll('__ELISCRIPT_ORIGINAL_HOST_RUNTIME__',JSON.stringify(hostRuntime)),arguments:[{directory:true},{literal:plan.entry}],hostRuntime,aliases:true,
        referenceArtifact:true,zeroImports:plan.capabilityImports!==true,childProcesses:'inherit-selected-artifact',timeoutMs:plan.timeoutMs??30000,
        ...(plan.timeoutMs===undefined?{timeoutByTarget:{javascript:30000,wasm:30000,native:120000}}:{}),
        runtimeOptions:structuredClone(plan.budget??{maxSlots:8192,initialBytes:262144,maxBytes:16777216})},
      expected:{kind:'seed-program',oracleRequired:true},
      original:{manifest:'stable-compatibility',fixture:plan.fixture,suite:plan.suite,sourceSha256:original.sha256,
        host:plan.suite,originalAssertion:plan.assertions??[],
        cases:locators.filter(locator=>selectedCoverage.includes(locator.id)&&locator.originalCase).map(locator=>({id:locator.id,...structuredClone(locator.originalCase)})),
        targetSpecificAssertions:{javascript:'original public observations; managed root/frame assertions apply only to real binary heaps',binary:'original raw checkAll and GC/frame assertions on the actual selected artifact'}},
    });}
    // Individual retained assertions claim their own locators. A fixture-level
    // adapter must never hide another unadapted case in the same original suite.
  }

  const core={name:'core-modules',fixture:'tests/fixtures/wasm-managed-core-modules.eli',suite:'tests/wasm-managed-core-modules.test.mjs',entry:'tests/core-entry.mjs'};
  if(stableFiles.has(core.fixture)){
    const source=await text(core.suite),aliasSource=template(source,'aliasSource');
    const fixture=(await text(core.fixture)).replace('  (export aliases',
      '  (import "./core-patterns.mjs" :as Patterns)\n  (defun patterns () (Patterns/report))\n  (defun held-pattern () (Patterns/capture-pattern (js-array 17)))\n  (defun inspect-held-pattern (callback) (funcall callback))\n  (export patterns held-pattern inspect-held-pattern aliases');
    const modules=await graph(text,[{id:core.entry,filename:core.fixture,source:fixture},
      {id:'tests/core-aliases.mjs',filename:'tests/core-aliases.eli',source:aliasSource},
      {id:'tests/core-patterns.mjs',filename:'tests/core-patterns.eli',source:template(source,'patternSource')},
      {id:'tests/core-pattern-provider.mjs',filename:'tests/core-pattern-provider.eli',source:template(source,'patternProvider')}]);
    const names=between(source,'const cases =','let directory,');
    const raw=between(source,'function read(runtime,','\ntest(');
    const body=common+names+`\nconst script=\`const m=await import(process.argv[1]);const out={};for(const name of \${JSON.stringify(cases)})out[name]=m[name.replaceAll('-','_')]();const held=m.held_record();out.held=m.inspect_held(held);console.log(JSON.stringify(out));\`;
const expected=originalObservation(script,'node',[originalEntry]);assert.deepEqual(originalObservation(script,'bun',[originalEntry]),expected);
`+between(source,'  assert(expected.aliases.every(value => value === true));','\n}, 120000);')+raw+`\nif(runtime)checkAll(runtime);else{
 const out={};for(const name of cases)out[name]=m[name.replaceAll('-','_')]();const held=m.held_record();out.held=m.inspect_held(held);assert.deepEqual(plain(out),expected);
 const captured=m.held_pattern();for(let round=0;round<3;round++)assert.equal(m.inspect_held_pattern(captured),17);
}
console.log(JSON.stringify(expected));\n`;
    await addProgram({...core,assertionSource:between(source,"test('Given original standard module imports", "test('Given no actual source library")},body,modules);
    // Missing private sources and unrelated canonical-looking paths remain
    // actual compiler refusals, including recovery to the complete source graph.
    const code='(import "eliscript/runtime/core/type.mjs" defineType) (export defineType)';
    const rejectCoverage=locators.filter(item=>item.file===core.suite&&typeof item.contains==='string'&&item.contains.includes('no actual source library')).map(item=>item.id);
    if(rejectCoverage.length)add({id:'original-managed:core-modules:missing-private-graph',kind:'sequence',coverage:rejectCoverage,
      original:{suite:core.suite,completeLocatorCoverage:true,sourceSha256:(await file(core.suite)).sha256},expected:{kind:'sequence'},steps:[
        {id:'empty-private-graph',request:{operation:'runtime',source:await text('bootstrap/runtime/memory.eli'),filename:'runtime.eli',literalSources:[]}},
        {id:'before-private-refusal',request:{operation:'compile-ir',source:code,filename:'missing-core-library.eli'}},
        {id:'actual-private-refusal',backendTarget:'wasm',request:{operation:'project',modules:[{id:core.entry,filename:'missing-core-library.eli',source:code}],entry:core.entry,resolveImports:true},error:{code:'ELI-B0001'}},
        {id:'after-private-refusal',request:{operation:'compile-ir',source:code,filename:'missing-core-library.eli'},sameFieldsAs:{step:'before-private-refusal',fields:['ir']}},
        {id:'before-unrelated-refusal',request:{operation:'compile-ir',source:'(import "../vendor/core/vector.mjs" PersistentVector) (export PersistentVector)',filename:'unrelated-core-name.eli'}},
        {id:'unrelated-path-refusal',backendTarget:'wasm',request:{operation:'project',modules:[{id:core.entry,filename:'unrelated-core-name.eli',source:'(import "../vendor/core/vector.mjs" PersistentVector) (export PersistentVector)'}],entry:core.entry,resolveImports:true},error:{code:'ELI-B0001',phase:'managed-link'}},
        {id:'after-unrelated-refusal',request:{operation:'compile-ir',source:'(import "../vendor/core/vector.mjs" PersistentVector) (export PersistentVector)',filename:'unrelated-core-name.eli'},sameFieldsAs:{step:'before-unrelated-refusal',fields:['ir']}},
        {id:'restore-complete-private-graph',request:{operation:'runtime',source:await text('bootstrap/runtime/memory.eli'),filename:'runtime.eli',literalSources:structuredClone(literalSources)}},
      ]});
  }

  const transient={name:'transient-state',fixture:'tests/fixtures/wasm-managed-transient-state.eli',suite:'tests/wasm-managed-transient-state.test.mjs',entry:'entry.mjs'};
  if(stableFiles.has(transient.fixture)){
    const source=await text(transient.suite),modules=await graph(text,[{id:transient.entry,filename:transient.fixture}]);
    const counts=between(source,'const counts =','let directory,');
    const reference=between(source,'function originalReferenceSource()','\nbeforeAll(')
      .replace("resolve('runtime/core', file)","resolve(root,'runtime/core',file)");
    const raw=between(source,'function read(runtime,','\ntest(');
    const held=between(source,"  const state = runtime.invoke('held-state');",'\n}, 30000);');
    const body=common+counts+reference+`\nconst expected=originalObservation(originalReferenceSource(),'node');assert.deepEqual(originalObservation(originalReferenceSource(),'bun'),expected);
`+raw+`\nif(runtime){checkAll(runtime);\n${held.replace('finally { runtime.release(state);finish(runtime); }','finally { runtime.release(state); }')}\n}else{
 const out={vectors:counts.map(count=>m.vector_case(count)),vectorOwnership:m.vector_ownership(),mapBranches:m.map_branches(),collisions:m.collisions(),realCollision:m.real_collision(),setCase:m.set_case(),callbacks:[0,1,2,3].map(mode=>m.callback_order(mode)),indexErrors:m.index_errors(),vectorLimit:m.vector_limit(),invalidSources:m.invalid_sources()};
 assert.deepEqual(plain(out),expected);
 const held=m.held_state(),original=Array.from({length:65},(_,index)=>index),result=[...original];
 for(const[index,value]of[[0,100],[1,101],[32,132],[64,164]]){assert.equal(m.held_step(held,index,value),held);result[index]=value;}
 assert.deepEqual(plain(m.held_finish(held)),[original,result,17]);
}
console.log(JSON.stringify(expected));\n`;
    await addProgram({...transient,assertionSource:source.slice(source.indexOf("test('Given the complete transient state"))},body,modules);
  }

  const sorted={name:'sorted-core',fixture:'tests/fixtures/wasm-managed-sorted.eli',suite:'tests/wasm-managed-sorted-core.test.mjs',entry:'tests/sorted-entry.mjs'};
  if(stableFiles.has(sorted.fixture)){
    const source=await text(sorted.suite),modules=await graph(text,[{id:sorted.entry,filename:sorted.fixture}]);
    const cases=between(source,'const cases =','let directory,');
    const operationSource=between(source,'function operations()','\nbeforeAll(');
    const raw=between(source,'function read(runtime,','\ntest(');
    const provider=between(source,'function checkProvider(runtime)','\ntest(');
    const fixed=between(source,"  const original=JSON.parse(expected['original-report']);",'\n},120000);');
    const body=common+`\nconst OriginalSorted=await import(pathToFileURL(resolve(root,'runtime/core/sorted.mjs')));
const OriginalLiterals=await import(pathToFileURL(resolve(root,'runtime/literals.mjs')));
const OriginalMetadata=await import(pathToFileURL(resolve(root,'runtime/core/metadata.mjs')));
`+cases+operationSource+`\nconst script=\`import assert from 'node:assert/strict';const m=await import(process.argv[1]),out={};
for(const name of \${JSON.stringify(cases)})out[name]=m[name.replaceAll('-','_')]();
out.randomized=m.randomized(\${JSON.stringify(randomOperations)});const state=m.held_state();out.held=Array.from({length:5},()=>m.held_step(state));
try{m.throw_comparison();throw Error('missing expected comparison failure');}catch(error){assert.equal(error.name,'TypeError');assert.equal(error.message,'sorted comparison marker');out.failure=[error.name,error.message];}console.log(JSON.stringify(out));\`;
const expected=originalObservation(script,'node',[originalEntry]);assert.deepEqual(originalObservation(script,'bun',[originalEntry]),expected);
`+fixed+raw+provider+`\nif(runtime){checkAll(runtime);checkProvider(runtime);}else{
 const out={};for(const name of cases)out[name]=m[name.replaceAll('-','_')]();out.randomized=m.randomized(randomOperations);
 const held=m.held_state();out.held=Array.from({length:5},()=>m.held_step(held));
 try{m.throw_comparison();assert.fail('missing expected comparison failure');}catch(error){out.failure=[error.name,error.message];}
 assert.deepEqual(plain(out),expected);
 ${between(source,'  const value=call(\'provider-value\');',"\n  assert.equal(runtime.stats().frameDepth,0);\n}").replaceAll("call('","providerCall('").replace('  runtime.collect();','')}
}
console.log(JSON.stringify(expected));\n`;
    await addProgram({...sorted,assertionSource:source.slice(source.indexOf("test('Given complete original sorted"))},body.replace(' const out={};for(const name of cases)'," const providerCall=(name,args=[])=>m[name.replaceAll('-','_')](...args);\n const out={};for(const name of cases)"),modules);
  }

  const wire={name:'wire',fixture:'tests/fixtures/wasm-managed-wire.eli',suite:'tests/wasm-managed-wire.test.mjs',entry:'tests/fixtures/wasm-managed-wire.mjs',timeoutMs:120000,capabilityImports:true};
  if(stableFiles.has(wire.fixture)){
    const source=await text(wire.suite),modules=await graph(text,[{id:wire.entry,filename:wire.fixture}]);
    const corpus=between(source,'const roundtrips =','\nasync function run(command)');
    const helpers=between(source,'function finish(runtime)','\nfor(const auto of ');
    const network=between(source,'async function checkNetwork(runtime){','\nfor(const auto of ')
      .replace('async function checkNetwork(runtime){','async function checkJavaScriptNetwork(){')
      .replace("JSON.parse(call(runtime,'original-roundtrip',[JSON.stringify(originalPayload)]))","JSON.parse(m.original_roundtrip(JSON.stringify(originalPayload)))")
      .replace('const api=targetHTTP(runtime);','const api=javascriptHTTP;')
      .replace("await callAsync(runtime,'original-echo',[origin+'/rpc/echo',JSON.stringify(payload)])","await m.original_echo(origin+'/rpc/echo',JSON.stringify(payload))")
      .replace('  assert.equal(runtime.stats().frameDepth,0);','');
    const assertions=between(source,'  assert.equal(roundtrips.length,130);',"  const payload={User:{name:'小明😀'");
    const capabilityProof=`\nif(runtime){
 assert(selectedInput.descriptor.hostModules.some(item=>item.specifier==='eliscript/platform/http.mjs'));
 if(selectedInput.target==='wasm'){
  const actualImports=WebAssembly.Module.imports(new WebAssembly.Module(new Uint8Array(await readFile(selectedInput.path))));
  assert.deepEqual(actualImports.map(item=>[item.module,item.name,item.kind]),selectedInput.descriptor.hostCapabilities.map(item=>[item.module,item.name,'function']));
  for(const item of actualImports)assert.equal(item.module,'eliscript.host');
 }
}\n`;
    const body=common+capabilityProof+corpus+`\nconst referenceScript=\`import assert from 'node:assert/strict';
import * as http from \${JSON.stringify(pathToFileURL(resolve(root,'runtime/wire/http-rpc.mjs')).href)};
const fixture=await import(\${JSON.stringify(originalEntry)});const records=\${JSON.stringify(cases)};
const results=[];for(const record of records)results.push(JSON.parse(await fixture[record.fn.replaceAll('-','_')](...record.args)));
const httpContracts=\${httpContracts.toString()};console.log(JSON.stringify({results,negativeZero:fixture.parse_negative_zero(),http:await httpContracts(http)}));\`;
const expected=originalObservation(referenceScript,'node');assert.deepEqual(originalObservation(referenceScript,'bun'),expected);
`+assertions+`\nconst sources=${JSON.stringify(modules.map(record=>[record.id,record.filename]))};\n`+helpers+`\nif(runtime){await checkCorpus(runtime);await checkNetwork(runtime);}else{
 const results=[];for(const record of cases)results.push(JSON.parse(await m[record.fn.replaceAll('-','_')](...record.args)));
 assert.deepEqual(results,expected.results);assert.equal(m.parse_negative_zero(),expected.negativeZero);
 const javascriptHTTP={createService:settings=>m.http_service(settings),createClient:settings=>m.http_client(settings),discoveryCandidates:url=>m.http_candidates(url),pathIndexMarkdown:(title,operations,location='/')=>m.http_index(title,operations,location)};
 assert.deepEqual(await httpContracts(javascriptHTTP),expected.http);
 ${network}
 await checkJavaScriptNetwork();
}
console.log(JSON.stringify(expected));\n`;
    await addProgram({...wire,caseTitles:['Given complete original wire corpus and actual HTTP capabilities when WASM executes MDP MDS and GEPO at auto('],assertionSource:source.slice(source.indexOf('for(const auto of '))},body,modules);
    const originalHost=await text('tests/fixtures/wire-host.mjs');
    await addProgram({...wire,name:'wire-original-host'},common+capabilityProof+`\nconst script=${JSON.stringify(originalHost)},engine=__ELISCRIPT_ORIGINAL_HOST_RUNTIME__;
const args=directory=>['wire-host.mjs',resolve(directory,'tests/fixtures/wire.mjs')];
const expected=originalObservation(script,engine,args(reference));
assert.deepEqual(expected,{codec:true,discovery:true,usageSafe:true,post:true});
assert.deepEqual(originalObservation(script,engine,args(product),true),expected);
console.log(JSON.stringify(expected));\n`,modules);
  }
  const sequence={name:'sequence-data',fixture:'tests/fixtures/wasm-managed-sequence-data.eli',suite:'tests/wasm-managed-sequence-data.test.mjs',entry:'sequence-data.mjs',
    memory:{initialPages:128,maximumPages:4096},budget:{maxSlots:1024,initialBytes:65536,maxBytes:16777216},timeoutMs:60000};
  if(stableFiles.has(sequence.fixture)){
    const source=await text(sequence.suite),publicModules=new Map(),initial=[{id:sequence.entry,filename:sequence.fixture},
      {id:'tests/fixtures/lazy-sequence.mjs',filename:'tests/fixtures/lazy-sequence.eli'},
      {id:'core-set-usage.mjs',filename:'tests/fixtures/core-set-usage.eli'}];
    // Export names are read from the actual canonical source declarations.
    // These generated project cells contain imports/re-exports only.
    for(const record of literalSources.filter(item=>/^runtime\/(?:core|testing)\/.+[.]mjs$/.test(item.id))){
      const names=[];
      for(const match of record.source.matchAll(/\(export\s+([^()]*)\)/g))names.push(...match[1].trim().split(/\s+/).filter(Boolean));
      if(!names.length)throw new TypeError('actual canonical library has no export declaration: '+record.id);
      const id='public/'+record.id;publicModules.set(record.id,id);
      initial.push({id,filename:'sequence-data-public/'+record.id,
        source:'(import '+JSON.stringify('eliscript/'+record.id)+' '+names.join(' ')+')\n(export '+names.join(' ')+')\n'});
    }
    for(const family of ['sequence','text','object']){
      initial.push({id:family+'.mjs',filename:'stdlib/'+family+'.eli'},
        {id:family+'-usage.mjs',filename:'tests/fixtures/'+family+'-usage.eli'});
      if(family==='object')initial.push({id:'data.mjs',filename:'stdlib/data.eli'});
    }
    const modules=await graph(text,initial),names=between(source,'const observations =','let directory,'),
      observation=between(source,'function observationJSON(value)','\nfunction successful(');
    const fixed=between(source,'      assert.deepEqual(actual.bounded_consumption,','\n    }, 60000);');
    const boundaryBody=common+names+observation+`\nconst script='const m=await import(process.argv[1]);\\n'+${JSON.stringify(observation)}+'\\nconst out={};for(const name of '+JSON.stringify(observations)+')out[name]=m[name]();console.log(observationJSON(out));';
const expected=originalObservation(script,'node',[originalEntry]);assert.deepEqual(originalObservation(script,'bun',[originalEntry]),expected);
const out={};for(const name of observations)out[name]=m[name]();const actual=JSON.parse(observationJSON(out));assert.deepEqual(actual,expected);
`+fixed+`\nif(runtime)assert.equal(runtime.stats().frameDepth,0);console.log(JSON.stringify(expected));\n`;
    await addProgram({...sequence,caseTitles:['${host}/${engine}: internal infinite, cache, close, metadata, paths, metrics and IEEE observations'],assertions:['internal infinite, cache, close, metadata, paths, metrics and IEEE observations']},boundaryBody,modules,[65536]);

    const replacements=JSON.stringify([...publicModules]);
    for(const name of ['transducer','core-stdlib','data-text','value-hash','lazy-sequence','core-text-object']){
      const filename='tests/fixtures/'+name+'-host.mjs',original=await text(filename);
      const argumentIds=name==='lazy-sequence'?['tests/fixtures/lazy-sequence.mjs']:
        name==='core-text-object'?['public/runtime/core/text.mjs','public/runtime/core/object.mjs']:[];
      const body=common+`\nconst original=${JSON.stringify(original)},publicModules=new Map(${replacements});
function relocate(source,directory,selected){return source.replace(/from (["'])(?:\\.\\.\\/)+runtime\\/(core|testing)\\/([^"']+)\\1/g,(_all,_quote,family,filename)=>{
 const canonical='runtime/'+family+'/'+filename,id=selected?publicModules.get(canonical):canonical;
 assert(id,'actual public source module '+canonical);return 'from '+JSON.stringify(pathToFileURL(resolve(selected?directory:root,id)).href);
});}
const argumentIds=${JSON.stringify(argumentIds)},engine=__ELISCRIPT_ORIGINAL_HOST_RUNTIME__;
const expected=originalObservation(relocate(original,reference,false),engine,['original-host.mjs',...argumentIds.map(id=>resolve(reference,id))]);
const actual=originalObservation(relocate(original,product,true),engine,['original-host.mjs',...argumentIds.map(id=>resolve(product,id))],true);
assert.deepEqual(actual,expected);
${name==='value-hash'?"assert.deepEqual(actual,JSON.parse(await readFile(resolve(root,'tests/fixtures/value-hashes.json'),'utf8')));":''}
console.log(JSON.stringify(expected));\n`;
      // Each original host retains its original engine independently. There is
      // no Node-to-Bun substitution for a native target.
      await addProgram({...sequence,name:'sequence-data-host-'+name,
        ...(name==='lazy-sequence'||name==='core-text-object'?{}:{caseParameters:{name}}),
        caseTitles:[name==='lazy-sequence'?'${host}/${engine}: complete original compiled lazy-sequence fixture':
          name==='core-text-object'?'${host}/${engine}: complete original core text/object host corpus':'${host}/${engine}: complete original ${name} host corpus'],
        assertions:[name==='lazy-sequence'?'complete original compiled lazy-sequence fixture':name==='core-text-object'?'complete original core text/object host corpus':'complete original '+name+' host corpus']},
        body,modules,[65536]);
    }
    for(const family of ['sequence','text','object']){
      const id=family+'-usage.mjs';
      await addProgram({...sequence,name:'sequence-data-portable-'+family,caseParameters:{family},caseTitles:['${host}/${engine}: entire original portable ${family} usage'],assertions:['entire original portable '+family+' usage']},common+`\nconst script='await import(process.argv[1]);',engine=__ELISCRIPT_ORIGINAL_HOST_RUNTIME__;
const expected=originalObservation(script,engine,[pathToFileURL(resolve(reference,${JSON.stringify(id)})).href]);
const actual=originalObservation(script,engine,[pathToFileURL(resolve(product,${JSON.stringify(id)})).href],true);
assert.deepEqual(actual,expected);
console.log(JSON.stringify(expected));\n`,modules,[65536]);
    }
    const setSuite=await text('tests/core-set.test.mjs');
    const setArray=between(setSuite,'  const source = [','  return JSON.parse',setSuite.indexOf('async function runUsageHost'));
    const setLines=setArray.slice(setArray.indexOf('\n')+1,setArray.lastIndexOf('  ].join'))
      .split('\n').map(line=>line.trim()).filter(Boolean);
    const setParts=[];
    for(const line of setLines.slice(1)){
      const literal=line.endsWith(',')?line.slice(0,-1):line;
      if(!literal.startsWith('"'))throw new TypeError('original relational set host is no longer a static data string');
      setParts.push(JSON.parse(literal));
    }
    const setHost="const usage=await import(process.argv[1]);\n"+setParts.join('\n');
    await addProgram({...sequence,name:'sequence-data-relational-set',caseTitles:['${host}/${engine}: original relational set complete usage and host observations'],assertions:['original relational set complete usage and host observations']},common+`\nconst script=${JSON.stringify(setHost)},id='core-set-usage.mjs',engine=__ELISCRIPT_ORIGINAL_HOST_RUNTIME__;
const expected=originalObservation(script,engine,[pathToFileURL(resolve(reference,id)).href]);
assert.deepEqual(originalObservation(script,engine,[pathToFileURL(resolve(product,id)).href],true),expected);
console.log(JSON.stringify(expected));\n`,modules,[65536]);
    const identityRegion=between(source,"      const source = `import assert from 'node:assert/strict';",'\n      assert.equal(await runSelected(host, engine, \'standard-protocols\'');
    const identities=identityRegion.slice(identityRegion.indexOf('`')+1,identityRegion.lastIndexOf('`;'));
    // The original source uses only these three explicit URL interpolations.
    const identitySource=identities.replaceAll('${JSON.stringify(pathToFileURL(resolve(root, \'runtime/core/data-text.mjs\')).href)}',JSON.stringify(pathToFileURL(resolve(sourceRoot,'runtime/core/data-text.mjs')).href))
      .replaceAll('${JSON.stringify(pathToFileURL(resolve(root, \'runtime/core/order.mjs\')).href)}',JSON.stringify(pathToFileURL(resolve(sourceRoot,'runtime/core/order.mjs')).href))
      .replaceAll('${JSON.stringify(pathToFileURL(resolve(root, \'runtime/core/protocol.mjs\')).href)}',JSON.stringify(pathToFileURL(resolve(sourceRoot,'runtime/core/protocol.mjs')).href));
    await addProgram({...sequence,name:'sequence-data-standard-identities',caseTitles:['${host}/${engine}: standard print/compare slots keep identity in both boundary directions'],assertions:['standard print/compare slots keep identity in both boundary directions']},common+`\nprocess.argv=[process.execPath,'standard-protocols.mjs',resolve(product,entry)];
await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(${JSON.stringify(identitySource)}));\n`,modules,[65536]);
  }

  return mapped;
}
