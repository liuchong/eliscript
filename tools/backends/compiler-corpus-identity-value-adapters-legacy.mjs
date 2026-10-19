import {posix} from 'node:path';
import {createHash} from 'node:crypto';
import {originalSourceCaseLocators} from './compiler-corpus-managed-cases.mjs';

export const originalIdentityValueSuites=Object.freeze([
  'tests/wasm-managed-host-identity.test.mjs',
  'tests/managed-stdlib-value-json.test.mjs',
]);

// Recipes transport the original programs and assertions. They do not execute
// a fixture or use a JavaScript implementation in place of a selected compiler.
function region(source, begin, end, from = 0) {
  const start = source.indexOf(begin, from), finish = start < 0 ? -1 : source.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0) throw new TypeError('original identity/value source boundary changed: ' + begin);
  const code = source.slice(start, finish);
  return {text: code, start, end: finish, byteStart: Buffer.byteLength(source.slice(0, start)),
    byteEnd: Buffer.byteLength(source.slice(0, finish)), sha256: createHash('sha256').update(code).digest('hex')};
}
function proof(item) {const {text, ...identity} = item;return identity;}
function originalTitles(source,file) {
  // Use the same complete source inventory as the full-suite replay. Auxiliary
  // helper execution regions are provenance, not additional test registrations.
  return originalIdentityValueCaseLocators(file,source)
    .filter(locator=>!locator.originalExecution).map(locator=>locator.originalCase.title);
}

function sourceRegion(source,start,end){
  const text=source.slice(start,end);
  return{text,start,end,byteStart:Buffer.byteLength(source.slice(0,start)),
    byteEnd:Buffer.byteLength(source.slice(0,end)),sha256:createHash('sha256').update(text).digest('hex')};
}

export function originalIdentityValueCaseLocators(file,source){
  if(!originalIdentityValueSuites.includes(file))throw new TypeError('unregistered original identity/value source suite');
  const cases=originalSourceCaseLocators(file,source);
  if(file!=='tests/wasm-managed-host-identity.test.mjs')return cases;
  const title='Given linked modules with opposite encounter orders when imported aliases and closures are called then defining-module identity tables remain separate';
  const owners=cases.filter(locator=>locator.originalCase.title===title);
  if(owners.length!==1)throw new TypeError('original module-order helper lost its unique registered caller');
  const owner=owners[0];
  const helper=region(source,'async function project(){','\nfunction encounters(a,p)');
  const assertion="assert.deepEqual(Uint8Array.from(b.managed.emit_managed_project_wasm([...modules].reverse(),'main.mjs',rt)),bytes);";
  const start=source.indexOf(assertion,helper.start);
  if(start<helper.start||start+assertion.length>helper.end)
    throw new TypeError('original project module-order assertion left its helper');
  const executed=sourceRegion(source,start,start+assertion.length);
  const caller=sourceRegion(source,owner.originalCase.span.start,owner.originalCase.span.end);
  const invocation='const p=await project();',callStart=caller.text.indexOf(invocation);
  if(callStart<0)throw new TypeError('original registered case no longer invokes its module-order helper');
  const call=sourceRegion(source,caller.start+callStart,caller.start+callStart+invocation.length);
  return [...cases,{id:'stable-compatibility:source-region:'+file+':project-module-order:0',
    file,kind:'test',contains:executed.text,originalCase:structuredClone(owner.originalCase),
    originalExecution:{record:'original-identity-value:host-token-module-order',
      span:{start:executed.start,end:executed.end},byteStart:executed.byteStart,byteEnd:executed.byteEnd,sha256:executed.sha256,
      helper:{name:'project',...proof(helper)},invocation:proof(call)}}];
}

async function sourceGraph({text, file}, entry, filename) {
  const modules = new Map(), pending = [{id: entry, filename}];
  while (pending.length) {
    const input = pending.shift();if (modules.has(input.id)) continue;
    const source = await text(input.filename);await file(input.filename);
    modules.set(input.id, {...input, source});
    for (const match of source.matchAll(/\(import(?:-portable)?\s+"([^"\n]+)"/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) throw new TypeError('original Value/JSON graph gained an undeclared external dependency');
      const path = posix.normalize(posix.join(posix.dirname(input.id), specifier));
      if (!path.startsWith('stdlib/')) throw new TypeError('original Value/JSON dependency escapes the stdlib graph');
      const id = path.endsWith('.eli') ? path.slice(0, -4) + '.mjs' : path;
      pending.push({id, filename: path.endsWith('.mjs') ? path.slice(0, -4) + '.eli' : path});
    }
  }
  return [...modules.values()];
}

const hostPrelude = String.raw`
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT,referenceDirectory=process.env.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT;
if(!root||!referenceDirectory)throw new Error('identity/value corpus requires its actual original source and independent reference');
const [product,entry]=process.argv.slice(2);
const originalEntry=pathToFileURL(resolve(referenceDirectory,entry)).href;
const reference=await import(originalEntry),m=await import(pathToFileURL(resolve(product,entry)).href);
const configuration=process.env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT;
const {readCompilerMetadata}=await import(pathToFileURL(resolve(root,'tools/backends/compiler-metadata.mjs')).href);
const selected=configuration?await readCompilerMetadata(configuration):null;
const binary=process.env.ELISCRIPT_ORIGINAL_TARGET!=='javascript';
if(binary&&!selected)throw new Error('identity/value corpus lost its selected binary artifact');
function observe(script,engine,args=[]){
 const env={...process.env};delete env.ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT;delete env.ELISCRIPT_ORIGINAL_TARGET;
 const preloadURL=pathToFileURL(resolve(root,'tools/backends/compiler-corpus-host-context.mjs')).href;
 if(env.NODE_OPTIONS)env.NODE_OPTIONS=env.NODE_OPTIONS.split(/\s+/).filter(value=>value!=='--import='+preloadURL).join(' ');
 const preload=engine==='bun'?['--preload',resolve(root,'tests/fixtures/compiled-eli-bun-preload.mjs')]:['--experimental-loader',resolve(root,'tests/fixtures/compiled-eli-node-loader.mjs')];
 const child=spawnSync(engine==='bun'?(process.env.BUN??'bun'):(process.env.NODE??'node'),[...preload,'--input-type=module','--eval',script,...args],{cwd:root,env,encoding:'utf8',timeout:30000});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr+child.stdout);
 return JSON.parse(child.stdout);
}
async function freshRuntime(){
 if(!selected)throw new Error('a raw managed heap requires its actual selected binary');
 const options={...selected.memory,...selected.runtimeOptions,initializeModule:false,nativeTarget:selected.nativeTarget};
 let a;
 if(selected.target==='wasm'){
  const bytes=new Uint8Array(await readFile(selected.path));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
  const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(root,'tools/backends/managed-runtime.mjs')).href);
  a=instantiateManagedRuntime(bytes,options);
 }else{
  const {instantiateNativeManagedRuntime}=await import(pathToFileURL(resolve(root,'tools/backends/native-managed-runtime.mjs')).href);
  a=await instantiateNativeManagedRuntime(selected.path,{typed:selected.typed,descriptor:selected.descriptor},options);
 }
 try{a.initializeModule();a.auto(selected.runtimeOptions.auto);return a;}
 catch(error){try{a.close?.();}catch{}throw error;}
}
function plain(value){return JSON.parse(JSON.stringify(value));}
`;

export async function addOriginalIdentityValueAdapters({add, locators, text, file, stableFiles}) {
  async function addProgram(plan) {
    const suiteIdentity = await file(plan.suite);
    const coverage = [plan.fixture && stableFiles.has(plan.fixture) ? 'stable-compatibility:' + plan.fixture : null,
      ...locators.filter(locator => locator.file === plan.suite && typeof locator.contains === 'string' &&
        !locator.originalCase &&
        (plan.titles.some(title => title.includes(locator.contains)) || plan.assertions.includes(locator.contains))).map(locator => locator.id)].filter(Boolean);
    const originalCases=locators.filter(locator=>locator.file===plan.suite&&locator.originalCase&&!locator.originalExecution&&
      plan.titles.includes(locator.originalCase.title)).map(locator=>({id:locator.id,...structuredClone(locator.originalCase)}));
    if(!coverage.length)throw new TypeError('original identity/value product has no executed source coverage: '+plan.name);
    for (const auto of plan.autos ?? [1]) for (const hostRuntime of ['node', 'bun']) {
      add({id: 'original-identity-value:' + plan.name + ':' + hostRuntime + ':auto-' + auto,
        kind: 'project', coverage: [...new Set(coverage)], modules: structuredClone(plan.modules), entry: plan.entry,
        auto, memory: structuredClone(plan.memory ?? {initialPages: 1, maximumPages: 256}),
        request: {operation: 'project', resolveImports: true, phased: true, sourceMap: true},
        execution: {kind: 'original-program', host: 'tests/__eliscript_identity_value_' + plan.name + '_' + hostRuntime + '_' + auto + '.mjs',
          hostSource: hostPrelude + '\n' + plan.hostSource, hostRuntime, arguments: [{directory: true}, {literal: plan.entry}],
          aliases: true, referenceArtifact: true, zeroImports: true, childProcesses: 'inherit-selected-artifact',
          timeoutByTarget: {javascript: plan.timeout ?? 30000, wasm: plan.timeout ?? 30000, native: 120000},
          runtimeOptions: {...structuredClone(plan.budget), auto}},
        expected: {kind: 'seed-program', oracleRequired: true},
        original: {manifest: 'stable-compatibility', suite: plan.suite, fixture: plan.fixture ?? null,
          host: plan.suite, sourceSha256: suiteIdentity.sha256, originalAssertion: plan.titles,
          originalCases,completeOriginalCaseCoverage:false,
          completeCases:'the unchanged original suite runs with its selected compiler and original deadlines',
          regions: (plan.regions ?? []).map(proof), graph: plan.graph ?? null,
          targetSpecificAssertions: {javascript: 'original source-level observations in the original Node/Bun host',
            binary: 'original raw-handle assertions, unchanged per-heap capacity, GC and cleanup on the actual selected binary'}}});
    }
  }

  const stdlibFixture = 'tests/fixtures/managed-stdlib-value-json.eli', stdlibSuite = 'tests/managed-stdlib-value-json.test.mjs';
  if (stableFiles.has(stdlibFixture)) {
    const original = await text(stdlibSuite), helper = 'tests/helpers/managed-stdlib-corpus.mjs';await file(helper);
    const raw = region(original, 'function read(a,v)', "\ntest('Given complete original Value");
    const assertions = region(original, ' assert.deepEqual(expected.errors[0]', '\n},120000);');
    const modules = await sourceGraph({text, file}, 'entry.mjs', stdlibFixture);
    const opaque = region(original, 'const results=[],errors=[];', '},30000);', original.indexOf("test('Given an ordinary source function"));
    const corpus = `
const {inputs,parseBoundaryCases,encodeBoundaryCases,parseCases,encodeInputs}=await import(pathToFileURL(resolve(root,${JSON.stringify(helper)})).href);
const script=[parseBoundaryCases.toString(),encodeBoundaryCases.toString(),'const m=await import(process.argv[1]);console.log(JSON.stringify({values:m.values(),identities:m.identities(),json:'+JSON.stringify(inputs)+'.map(x=>m.json_case(x)),boundaries:m.json_boundaries(),order:m.order_and_identity(),errors:parseBoundaryCases().map(x=>m.parse_report(...x)),encoded:encodeBoundaryCases().map(x=>m.encode_report(x))}));'].join('\\n');
const expected=observe(script,'node',[originalEntry]);assert.deepEqual(observe(script,'bun',[originalEntry]),expected);
${assertions.text}
${raw.text}
if(binary){const a=await freshRuntime();try{checkAll(a);}finally{try{finish(a);}finally{a.close?.();}}}
else{
 const actual={values:m.values(),identities:m.identities(),json:inputs.map(x=>m.json_case(x)),boundaries:m.json_boundaries(),order:m.order_and_identity(),errors:parseCases.map(x=>m.parse_report(...x)),encoded:encodeInputs.map(x=>m.encode_report(x))};
 assert.deepEqual(plain(actual),expected);
}
if(binary){const a=await freshRuntime();a.auto(1);try{${opaque.text}}finally{a.close?.();}}
else{
 for(let mode=0;mode<5;mode++){const out=m.opaque_probe(mode);if(mode<3)assert.deepEqual(out,['function',false,null][mode]);if(mode===3)assert.equal(typeof out,'number');if(mode===4)assert.equal(out,false);}
}
console.log(JSON.stringify(expected));
`;
    await addProgram({name: 'stdlib-value-json', fixture: stdlibFixture, suite: stdlibSuite, entry: 'entry.mjs', modules,
      autos: [65536, 1], memory: {initialPages: 4, maximumPages: 1024}, budget: {maxSlots: 8192, initialBytes: 262144, maxBytes: 16777216},
      titles: originalTitles(original,stdlibSuite), assertions: raw.text + assertions.text + opaque.text, regions: [raw, assertions, opaque], hostSource: corpus});
  }

  const identityFixture = 'tests/fixtures/wasm-managed-host-identity.eli', projectsFixture = 'tests/fixtures/managed-host-identity-projects.json';
  if (!stableFiles.has(identityFixture) && !stableFiles.has(projectsFixture)) return;
  const suite = 'tests/wasm-managed-host-identity.test.mjs', original = await text(suite), data = JSON.parse(await text(projectsFixture));
  await file(identityFixture);await file(projectsFixture);
  if (!data || Object.keys(data).some(key => !['project', 'cycle', 'cycleOperands'].includes(key)) ||
      ['project', 'cycle', 'cycleOperands'].some(key => !data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])))
    throw new TypeError('original identity project fixture shape changed');
  const helpers = region(original, 'function read(a,v)', "\ntest('Given the existing intrinsic");
  const encounters = region(original, 'function encounters(a,p)', "\ntest('Given linked modules");
  const isolation = region(original, 'function heapIsolation(first,second)', "\ntest('Given two heaps");
  const budget = {maxSlots: 2048, initialBytes: 65536, maxBytes: 16777216};
  const titlesInSource=originalTitles(original,suite);
  const nativeTitle = titlesInSource.find(title => title.includes('true native module and linked project'));
  const entry = 'main.mjs', single = [{id: entry, filename: 'host-identity.eli', source: await text(identityFixture)}];
  const singleTitles = titlesInSource.filter(title => !/wrong source|no intrinsic|linked modules with|cyclic|Node calls imported aliases/.test(title));
  const scalar = region(original, 'const values=[null,undefined,false,true,a.number(-0)', "\ntest('Given wrong source", original.indexOf("test('Given scalar inputs"));
  if(!scalar.text.endsWith('}});'))throw new TypeError('original scalar identity test closure changed');
  const scalarCode=scalar.text.slice(0,-3);
  const code = `
${helpers.text}
${isolation.text}
const scalarExpected=[null,undefined,false,true,-0,NaN,''].map(x=>reference.safe(x));
const referenceScript='const m=await import(process.argv[1]);const x={},y={};const first=m.token(x);const out={tokens:[first,m.alias(x),m.nested(x),m.token(y)],effects:m.effects(),abrupt:m.abrupt(),conversion:m.no_conversion()};const s=m.symbol_case(),f=m.function_case();out.symbols=[s[0]===s[2],s[0]!==s[1]];out.functions=[f[0]===f[2],f[0]!==f[1]];console.log(JSON.stringify(out));';
const expected=observe(referenceScript,'node',[originalEntry]);assert.deepEqual(observe(referenceScript,'bun',[originalEntry]),expected);
assert.deepEqual(expected,{tokens:[1,1,1,2],effects:[true,[1,2]],abrupt:[true,[1]],conversion:[],symbols:[true,true],functions:[true,true]});
if(binary){
 identities(await freshRuntime());
 {const a=await freshRuntime();a.auto(1);${scalarCode}}
 const first=await freshRuntime(),second=await freshRuntime();heapIsolation(first,second);
 const a=await freshRuntime();a.auto(1);try{assert.deepEqual(value(a,'effects'),[true,[1,2]]);assert.deepEqual(value(a,'abrupt'),[true,[1]]);}finally{finish(a);}
}else{
 const firstModule=await import(pathToFileURL(resolve(product,entry)).href+'?identity-isolation=first');
 const secondModule=await import(pathToFileURL(resolve(product,entry)).href+'?identity-isolation=second');
 const firstObject={},secondObject={};assert.equal(firstModule.token(firstObject),1);assert.equal(secondModule.token(secondObject),1);
 assert.equal(firstModule.token(firstObject),1);assert.equal(secondModule.token(secondObject),1);
 const x={},y={},first=m.token(x);assert.equal(first,1);assert.equal(m.alias(x),first);assert.equal(m.nested(x),first);assert.equal(m.token(y),2);
 for(let i=0;i<8;i++)assert.equal(m.token(x),first);
 assert.deepEqual(m.effects(),[true,[1,2]]);assert.deepEqual(m.abrupt(),[true,[1]]);assert.deepEqual(m.no_conversion(),[]);
 const symbols=m.symbol_case(),functions=m.function_case();assert.equal(symbols[0],symbols[2]);assert.notEqual(symbols[0],symbols[1]);assert.equal(functions[0],functions[2]);assert.notEqual(functions[0],functions[1]);
 assert.deepEqual([null,undefined,false,true,-0,NaN,''].map(x=>m.safe(x)),scalarExpected);
}
console.log(JSON.stringify(expected));
`;
  await addProgram({name: 'host-token-single', suite, fixture: identityFixture, entry, modules: single, budget,
    titles: singleTitles, assertions: helpers.text + isolation.text + scalar.text, regions: [helpers, isolation, scalar], hostSource: code});

  for (const [name, sources] of Object.entries(data)) {
    const modules = Object.entries(sources).map(([id, source]) => {
      if (typeof source !== 'string' || !/^[a-z][a-z0-9-]*\.mjs$/.test(id)) throw new TypeError('original identity module declaration changed');
      return {id, filename: id.replace(/\.mjs$/, '.eli'), source};
    });
    if (!modules.some(item => item.id === entry)) throw new TypeError('original identity graph lost its entry');
    let hostSource, titles;
    if (name === 'project') {
      const script = 'const m=await import(process.argv[1]);const x={},y={};console.log(JSON.stringify({values:m.encounters(x,y),same:m.left===m.left_copy}));';
      hostSource = helpers.text + '\n' + encounters.text + `
const expected=observe(${JSON.stringify(script)},'node',[originalEntry]);assert.deepEqual(observe(${JSON.stringify(script)},'bun',[originalEntry]),expected);
assert.deepEqual(expected.values,[1,2,1,2,1,1,2]);
if(binary)encounters(await freshRuntime(),{expected});else{
 const x={},y={};assert.equal(m.left===m.left_copy,expected.same);assert.deepEqual(m.encounters(x,y),expected.values);
 assert.equal(m.left(x),1);assert.equal(m.right(x),2);assert.equal(m.closure(x),1);assert.equal(m.own(x),2);
}
console.log(JSON.stringify(expected));\n`;
      titles = titlesInSource.filter(title => /linked modules with|Node calls imported aliases/.test(title));if (nativeTitle) titles.push(nativeTitle);
    } else {
      const script = 'const m=await import(process.argv[1]);console.log(JSON.stringify(m.early));';
      const expected = name === 'cycle' ? 'ReferenceError' : ['ReferenceError', false, []];
      hostSource = helpers.text + `
const expected=observe(${JSON.stringify(script)},'node',[originalEntry]);assert.deepEqual(observe(${JSON.stringify(script)},'bun',[originalEntry]),expected);
assert.deepEqual(expected,${JSON.stringify(expected)});
if(binary){const a=await freshRuntime();a.auto(1);try{const early=a.getExport('early');try{assert.deepEqual(read(a,early),expected);}finally{a.release(early);}}finally{finish(a);}}
else assert.deepEqual(plain(m.early),expected);
console.log(JSON.stringify(expected));\n`;
      titles = titlesInSource.filter(title => name === 'cycle' ? title.includes('cyclic modules before') : title.includes('cyclic early helper call'));
    }
    const caseRegions=locators.filter(locator=>locator.file===suite&&locator.originalCase&&!locator.originalExecution&&
      titles.includes(locator.originalCase.title)).map(locator=>sourceRegion(original,locator.originalCase.span.start,locator.originalCase.span.end));
    await addProgram({name: 'host-token-' + name, suite, fixture: projectsFixture, graph: name, entry, modules, budget,
      titles, assertions: hostSource, regions: name==='project'?[helpers,encounters]:[helpers,...caseRegions], hostSource});
    if(name==='project'){
      const order=locators.filter(locator=>locator.file===suite&&
        locator.originalExecution?.record==='original-identity-value:host-token-module-order');
      if(order.length!==1)throw new TypeError('original module-order recipe requires its exact helper assertion');
      const bound=order.map(locator=>locator.id);
      add({id:'original-identity-value:host-token-module-order',kind:'sequence',coverage:bound,
        memory:{initialPages:1,maximumPages:256},expected:{kind:'sequence'},steps:[
          {id:'original-order',request:{operation:'project',entry,modules:structuredClone(modules),resolveImports:true}},
          {id:'reversed-order',request:{operation:'project',entry,modules:structuredClone([...modules].reverse()),resolveImports:true},
            sameProductAs:'original-order'},
        ],original:{manifest:'stable-compatibility',suite,fixture:projectsFixture,graph:name,
          sourceSha256:(await file(suite)).sha256,originalAssertion:'project module order does not change emitted bytes',
          originalCase:structuredClone(order[0].originalCase),originalExecution:structuredClone(order[0].originalExecution)}});
    }
  }

  const arityTitle = titlesInSource.find(title => title.includes('wrong source and IR arity'));
  const plainTitle = titlesInSource.find(title => title.includes('no intrinsic'));
  const coverage = locators.filter(locator => locator.file === suite && typeof locator.contains === 'string' &&
    [arityTitle, plainTitle].some(title => title?.includes(locator.contains))).map(locator => locator.id);
  if(!coverage.length)throw new TypeError('original identity rejection recipe has no registered source cases');
  const valid = '(defun token (x) (host-identity-token x))', identity = '(defun identity (x) x) (export identity)';
  const steps = [
    ...['(host-identity-token)', '(host-identity-token 1 2)'].map((source, index) => ({id: 'source-arity-' + index,
      request: {operation: 'compile', source, filename: 'arity.eli'}, error: {}})),
    {id: 'valid-intrinsic-ir', request: {operation: 'compile-ir', source: valid, filename: 'arity.eli'}},
    ...[0, 2].map(count => ({id: 'ir-arity-' + count, request: {operation: 'emit-ir', target: 'wasm',
      ir: {$compilerCorpusJsonPatch: [{$compilerCorpusRef: 'valid-intrinsic-ir.ir'}, [{path: ['body', 0, 'children', 1, 'children'],
        ...(count === 0 ? {value: []} : {duplicateIndex: 0})}]]}}, error: {code: 'ELI-B0001'}})),
    {id: 'plain-ir', request: {operation: 'compile-ir', source: identity, filename: 'plain.eli'}},
    {id: 'plain-descriptor', request: {operation: 'emit-ir', target: 'wasm', ir: {$compilerCorpusRef: 'plain-ir.ir'}},
      expectFields: [{path: ['descriptor', 'abi'], value: 'managed-control-v1'}, {path: ['descriptor', 'module'], value: undefined}]},
    {id: 'recovered-ir', request: {operation: 'compile-ir', source: valid, filename: 'arity.eli'}, sameFieldsAs: {step: 'valid-intrinsic-ir', fields: ['ir']}},
  ];
  add({id: 'original-identity-value:host-token-rejections', kind: 'sequence', coverage, steps,
    expected: {kind: 'sequence'}, original: {manifest: 'stable-compatibility', suite,
      sourceSha256: (await file(suite)).sha256, originalAssertion: [arityTitle, plainTitle],
      originalCases:locators.filter(locator=>coverage.includes(locator.id)&&locator.originalCase)
        .map(locator=>({id:locator.id,...structuredClone(locator.originalCase)})),
      fixture: identityFixture, originalIRMutation: 'only host-identity-token operands are removed or duplicated'}});
}
