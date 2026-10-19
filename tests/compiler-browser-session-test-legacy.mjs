import {afterAll, beforeAll, describe, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {dirname, resolve, relative, sep, delimiter} from 'node:path';
import {buildIndependentCompiler, independentCompilerProfiles, loadCompilerSources} from '../tools/backends/compiler-build.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
import {createCompilerDebugMap} from '../tools/backends/compiler-debug.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {compilerSourceIdentity, compilerRequestIdentity} from '../tools/backends/compiler-worker.mjs';

let directory, artifact, server, browser;
let wasmArtifactLoading;
const debugCases = new Map(), resourceRequests = new Map();
const fullProjectProducts = new Map();
const irIngressProducts = new Map();
let managedBrowserTransport, fullProjectFixtureLoading;
async function browserWasmArtifact() {
  return wasmArtifactLoading ??= (async () => {
    const producer = await openCompilerArtifact(artifact);
    try {
      const compiled = await buildIndependentCompiler({host: 'wasm', session: producer,
        outputRoot: resolve(directory, 'browser-wasm'), profile: 'full-runtime', retainIR: false, debug: true});
      assert.equal(compiled.host, 'wasm');assert.equal(typeof compiled.debugPath, 'string');
      const debug = JSON.parse(await readFile(resolve(compiled.directory, compiled.debugPath), 'utf8'));
      return {artifact: compiled, debug};
    } finally {await producer.close();}
  })();
}
async function browserDebugCase(name, settings = {}) {
  const fixture = await browserWasmArtifact();
  const prefix = '/debug-cases/' + name + '/';
  const binaryPath = relative(fixture.artifact.directory, resolve(fixture.artifact.directory, fixture.artifact.path)).split(sep).join('/');
  const debugPath = relative(fixture.artifact.directory, resolve(fixture.artifact.directory, fixture.artifact.debugPath)).split(sep).join('/');
  debugCases.set(prefix, {...fixture, ...settings, binaryPath, debugPath});
  return {...fixture, prefix, debugURL: prefix + debugPath, binaryURL: prefix + binaryPath,
    manifestURL: new URL(prefix + 'compiler-artifact.json', server.url).href};
}
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-browser-session-'));
  if (process.env.ELISCRIPT_TEST_COMPILER_ARTIFACT) {
    const path = resolve(process.env.ELISCRIPT_TEST_COMPILER_ARTIFACT);
    artifact = {...JSON.parse(await readFile(path, 'utf8')), directory: dirname(path)};
  } else artifact = await buildIndependentCompiler({host: 'javascript', outputRoot: directory, profile: 'full-runtime'});
  assert.equal(artifact.host, 'javascript');
  const sources = await loadCompilerSources();
  assert.deepEqual([...artifact.provenance.compiledModuleIds].sort(), sources.modules.map(x => x.id).sort());
  const bundle = await Bun.build({entrypoints: [resolve('tools/backends/compiler-browser.mjs')], target: 'browser', format: 'esm'});
  assert.equal(bundle.success, true, String(bundle.logs));
  const transport = await bundle.outputs[0].text();
  server = Bun.serve({port: 0, async fetch(request) {
    const url = new URL(request.url);
    resourceRequests.set(url.pathname, (resourceRequests.get(url.pathname) ?? 0) + 1);
    if (url.pathname === '/') return new Response('<!doctype html><title>Compiler session acceptance</title>', {headers: {'content-type': 'text/html'}});
    if (url.pathname === '/transport.mjs') return new Response(transport, {headers: {'content-type': 'text/javascript'}});
    if (url.pathname === '/debug-map.mjs') return new Response(await readFile(resolve('tools/backends/compiler-debug.mjs')), {headers: {'content-type': 'text/javascript'}});
    if (url.pathname === '/managed-project-runtime.mjs') return managedBrowserTransport === undefined
      ? new Response('Project runtime is not prepared', {status: 503})
      : new Response(managedBrowserTransport, {headers: {'content-type': 'text/javascript'}});
    const productPath=/^\/full-project-products\/(javascript|wasm)\/(javascript|wasm|native)\/(bytes|metadata)$/.exec(url.pathname);
    if(productPath&&request.method==='POST'){
      const key=productPath[1]+'/'+productPath[2],record=fullProjectProducts.get(key)??{};
      if(productPath[3]==='bytes')record.bytes=new Uint8Array(await request.arrayBuffer());
      else record.metadata=await request.json();
      fullProjectProducts.set(key,record);return new Response(null,{status:204});
    }
    const ingressPath=/^\/ir-ingress-products\/(javascript|wasm)\/(single|project|memory)\/(javascript|wasm|native)\/(bytes|metadata)$/.exec(url.pathname);
    if(ingressPath&&request.method==='POST'){
      const key=ingressPath.slice(1,4).join('/'),record=irIngressProducts.get(key)??{};
      if(ingressPath[4]==='bytes')record.bytes=new Uint8Array(await request.arrayBuffer());
      else record.metadata=await request.json();
      irIngressProducts.set(key,record);return new Response(null,{status:204});
    }
    for (const [prefix, fixture] of debugCases) {
      if (!url.pathname.startsWith(prefix)) continue;
      const id = decodeURIComponent(url.pathname.slice(prefix.length));
      if (id === 'compiler-artifact.json') {
        const document = {...fixture.artifact, path: fixture.binaryPath, debugPath: fixture.debugPath};
        if (fixture.debugDocument !== undefined) {
          const bytes = Buffer.from(JSON.stringify(fixture.debugDocument));
          document.artifactIdentity = {...document.artifactIdentity, files: document.artifactIdentity.files.map(record =>
            record.path === fixture.debugPath ? {...record, bytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex')} : record)};
        }
        return Response.json(document);
      }
      if (id === fixture.debugPath) {
        if (fixture.gate) await fixture.gate.wait();
        if (fixture.status) return new Response('debug unavailable', {status: fixture.status});
        return fixture.debugDocument === undefined
          ? new Response(await readFile(resolve(fixture.artifact.directory, fixture.debugPath)), {headers: {'content-type': 'application/json'}})
          : Response.json(fixture.debugDocument);
      }
      if (!fixture.artifact.artifactIdentity.files.some(record => record.path === id)) return new Response('Not found', {status: 404});
      const bytes = await readFile(resolve(fixture.artifact.directory, id));
      if (id === fixture.binaryPath && fixture.binaryMutation) bytes[bytes.length - 1] ^= 1;
      return new Response(bytes, {headers: {'content-type': 'application/octet-stream'}});
    }
    if (url.pathname === '/artifact/compiler-artifact.json') return Response.json({...artifact, path: relative(artifact.directory, resolve(artifact.directory, artifact.path)).split(sep).join('/')});
    if (url.pathname.startsWith('/artifact/')) {
      const path = resolve(artifact.directory, decodeURIComponent(url.pathname.slice('/artifact/'.length)));
      const id = relative(artifact.directory, path).split(sep).join('/');
      if (!artifact.artifactIdentity.files.some(record => record.path === id)) return new Response('Not found', {status: 404});
      return new Response(await readFile(path), {headers: {'content-type': path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'}});
    }
    return new Response('Not found', {status: 404});
  }});
  const require = createRequire(import.meta.url);
  const playwright = require(require.resolve('playwright-core', {paths: [process.cwd(), ...(process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean)]}));
  const engine = process.env.ELISCRIPT_TEST_BROWSER ?? 'chromium';
  assert(['chromium', 'firefox', 'webkit'].includes(engine));
  browser = await playwright[engine].launch();
}, 120000);
afterAll(async () => {
  try {await browser?.close();} finally {server?.stop(true);if (directory) await rm(directory, {recursive: true, force: true});}
});

test('the complete independent JS compiler runs in a browser and its module Worker with source revision and disposal checks', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);
    const evidence = await page.evaluate(async () => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const check = (value, message) => {if (!value) throw new Error(message);};
      const results = [];
      for (const worker of [false, true]) {
        const compiler = await createBrowserCompiler({host: 'javascript', manifestURL: new URL('/artifact/compiler-artifact.json', location.href).href, worker});
        try {
          const source = '(defun add (a b) (+ a b)) (export add)';
          const artifact = await compiler.compile_string_with_source_map(source, 'sum.eli', 'sum.mjs');
          const blob = URL.createObjectURL(new Blob([artifact.javascript], {type: 'text/javascript'}));
          try {check((await import(blob)).add(19, 23) === 42, 'actual compiled module execution');} finally {URL.revokeObjectURL(blob);}
          check(JSON.parse(artifact.sourceMap).sources[0] === 'sum.eli', 'source map filename');
          const ir = await compiler.compile_ir_string(source, 'sum.eli');
          const canonical = await compiler.serialize_ir_program(ir);
          check(await compiler.serialize_ir_program(await compiler.deserialize_ir_program(canonical)) === canonical, 'real IR roundtrip');
          check(await compiler.emit_ir_string(ir) === await compiler.compile_string(source, 'sum.eli'), 'IR emission parity');
          let diagnostic;
          try {await compiler.compile_string('(print missing)', 'broken.eli');} catch (error) {diagnostic = error.eliscriptDiagnostic;}
          check(diagnostic?.location?.file === 'broken.eli', 'original structured diagnostic transport');
          const request = {operation: 'compile', filename: 'revision.eli', source};
          const snapshot = await compiler.setSource(request, {revision: 10});
          await compiler.request(request, {expectedRevision: 10, expectedSourceIdentity: snapshot.sourceIdentity});
          await compiler.setSource({...request, source: source + '\n; changed'}, {revision: 11});
          let stale;
          try {await compiler.request(request, {expectedRevision: 10});} catch (error) {stale = error.code;}
          check(stale === 'stale-source', 'stale result must reject');
          const controller = new AbortController();controller.abort(new Error('cancelled acceptance request'));
          let cancelled;
          try {await compiler.compile_string(source, 'cancelled.eli', null, {signal: controller.signal});} catch (error) {cancelled = error.message;}
          check(cancelled === 'cancelled acceptance request', 'cancellation reason must survive');
          results.push({worker, executed: 42, diagnostic: diagnostic.code, stale, cancelled});
        } finally {await compiler.dispose();}
        let disposed;
        try {await compiler.compile_string('1');} catch (error) {disposed = error.message;}
        check(disposed === 'browser compiler is disposed', 'disposed compiler must reject');
      }
      return results;
    });
    assert.deepEqual(evidence.map(x => [x.worker, x.executed, x.stale]), [[false, 42, 'stale-source'], [true, 42, 'stale-source']]);
  } finally {await page.close();}
}, 120000);

// The complete original language fixture is the program, rather than a numeric
// surrogate. Keep the original fixed observation independent of all emitters.
const fullProjectReport = Object.freeze({
  threadFirst:8,threadLast:8,named:8,conditionalFirst:[3,1,2],conditionalLast:[1,2,3],
  someFirst:[3,1,2],someLast:[1,2,3],someNil:null,someFalse:false,someUndefined:'continued',
  captureSafe:11,conditionalNoop:4,someNoop:5,events:['initial','test-false','test-true','selected'],
  ifLetFalse:'missing',ifLetValue:8,ifSomeFalse:false,ifSomeUndefined:'present',ifSomeNil:'missing',
  whenLetValue:15,whenSomeFalse:'missing',calls:20,
});
const fullProjectSourceName='tests/fixtures/core-expression-forms.eli';
const fullProjectEntry='tests/fixtures/core-expression-forms.mjs';
const fullProjectNativeSupported=process.arch==='arm64'&&['darwin','linux'].includes(process.platform);
const fullProjectNativeTarget=process.platform==='darwin'?'arm64-macos':'arm64-linux';
const execFileAsync=promisify(execFile);

async function fullBrowserProjectFixture(){
  return fullProjectFixtureLoading??=(async()=>{
    const source=await readFile(resolve(fullProjectSourceName),'utf8');
    const modules=[{id:fullProjectEntry,filename:fullProjectSourceName,source}];
    const preparation=resolve(directory,'full-browser-project');await mkdir(preparation,{recursive:true});
    // This reference has no caller-supplied producer session. Its complete
    // compiler is built through the real Emacs-seeded path and runs in Node.
    const seed=await buildIndependentCompiler({host:'javascript',outputRoot:resolve(preparation,'node-seed'),
      profile:'full-runtime',retainIR:false,debug:true});
    assert.equal(seed.provenance.mode,'seed');
    assert.equal(seed.provenance.runtimeCompiled,true);
    const sources=await loadCompilerSources();
    assert.deepEqual([...seed.provenance.compiledModuleIds].sort(),sources.modules.map(item=>item.id).sort());
    assert.equal(sources.modules.filter(item=>item.filename.startsWith('bootstrap/compiler/')).length,13);
    const wasm=await browserDebugCase('full-project-compiler');
    const bundled=await Bun.build({entrypoints:[resolve('tools/backends/managed-runtime.mjs')],target:'browser',format:'esm'});
    assert.equal(bundled.success,true,String(bundled.logs));managedBrowserTransport=await bundled.outputs[0].text();
    const config=resolve(preparation,'reference-input.json'),reference=resolve(preparation,'node-reference.mjs');
    const productResources=independentCompilerProfiles.small;
    await writeFile(config,JSON.stringify({seed,modules,entry:fullProjectEntry,filename:fullProjectSourceName,source,
      output:preparation,root:resolve('.'),nativeTarget:fullProjectNativeTarget,memory:productResources.memory}));
    const script=`import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {openCompilerArtifact} from ${JSON.stringify(pathToFileURL(resolve('tools/backends/compiler-bootstrap.mjs')).href)};
import {loadCompilerSources} from ${JSON.stringify(pathToFileURL(resolve('tools/backends/compiler-build.mjs')).href)};
const input=JSON.parse(await readFile(process.argv[2],'utf8')),sources=await loadCompilerSources({sourceRoot:input.root});
assert.equal(input.seed.provenance.mode,'seed');const compiler=await openCompilerArtifact(input.seed);let failed=false;
try{
 const compiled=await compiler.request({operation:'compile',source:input.source,filename:input.filename,
   sourceMap:{generatedFile:input.entry,sourceName:input.filename}});
 assert.equal(compiled.filename,input.filename);const compile={javascript:compiled.javascript,sourceMap:compiled.sourceMap};
 const ir=await compiler.request({operation:'compile-ir',source:input.source,filename:input.filename});
 const canonical=await compiler.request({operation:'serialize-ir',ir:ir.ir});
 await compiler.request({operation:'runtime',source:sources.runtime.source,filename:sources.runtime.filename,literalSources:sources.literalSources});
 let report;
 for(const target of ['javascript','wasm','native']){
  const result=await compiler.request({operation:'project',target,modules:input.modules,entry:input.entry,resolveImports:true,
   sourceMap:true,debug:true,memory:input.memory,nativeTarget:input.nativeTarget,nativeFormat:'library'});
  assert.equal(result.target,target);assert.equal(result.entry,input.entry);
  const {bytes,...metadata}=result;
  await writeFile(resolve(input.output,'reference-'+target+'.json'),JSON.stringify(metadata));
  if(target==='javascript'){
   assert.equal(result.modules.length,input.modules.length);
   const entry=result.modules.find(item=>item.id===input.entry);assert(entry);
   const path=resolve(input.output,'reference-program.mjs');await writeFile(path,entry.javascript);
   await writeFile(path+'.map',entry.sourceMap);
   const fixture=await import(pathToFileURL(path).href);report=fixture.expression_form_report();
  }else{
   await writeFile(resolve(input.output,'reference-'+target+'.bytes'),Uint8Array.from(bytes));
   if(target==='wasm')assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(bytes))),[]);
  }
 }
 for(const target of ['javascript','wasm','native']){
  const result=await compiler.request({operation:'emit-ir',target,ir:ir.ir,source:input.source,
   sourceMap:{generatedFile:input.entry,sourceName:input.filename},debug:true,memory:input.memory,
   nativeTarget:input.nativeTarget,nativeFormat:'library'});
  const {bytes,...metadata}=result;
  await writeFile(resolve(input.output,'reference-single-ir-'+target+'.json'),JSON.stringify(metadata));
  if(target!=='javascript')await writeFile(resolve(input.output,'reference-single-ir-'+target+'.bytes'),Uint8Array.from(bytes));
 }
 await writeFile(resolve(input.output,'reference-language.json'),JSON.stringify({compile,ir:ir.ir,canonical:canonical.canonicalIR,report}));
}catch(error){failed=true;throw error;}finally{try{await compiler.close();}catch(error){if(!failed)throw error;}}
`;
    await writeFile(reference,script);
    const child=await execFileAsync(process.env.NODE??'node',[reference,config],{cwd:resolve('.'),timeout:180000,encoding:'utf8'});
    assert.equal(child.stderr,'');
    const language=JSON.parse(await readFile(resolve(preparation,'reference-language.json'),'utf8'));
    assert.deepEqual(language.report,fullProjectReport);
    const products={},singleIRProducts={};
    for(const target of ['javascript','wasm','native'])products[target]={
      metadata:JSON.parse(await readFile(resolve(preparation,'reference-'+target+'.json'),'utf8')),
      ...(target==='javascript'?{}:{bytes:new Uint8Array(await readFile(resolve(preparation,'reference-'+target+'.bytes')))}),
    };
    for(const target of ['javascript','wasm','native'])singleIRProducts[target]={
      metadata:JSON.parse(await readFile(resolve(preparation,'reference-single-ir-'+target+'.json'),'utf8')),
      ...(target==='javascript'?{}:{bytes:new Uint8Array(await readFile(resolve(preparation,'reference-single-ir-'+target+'.bytes')))}),
    };
    return{source,modules,language,products,singleIRProducts,wasmManifest:wasm.manifestURL,preparation,productResources};
  })();
}

describe('complete browser compiler hosts emit actual three-target language projects',()=>{
  let fixture;
  beforeAll(async()=>{fixture=await fullBrowserProjectFixture();},180000);
  for(const host of ['javascript','wasm'])describe(host+' compiler in its actual owned module Worker',()=>{
    let page;
    const pending=new Map();
    const ingressPending=new Map();
    async function emitted(target){
      if(!pending.has(target))pending.set(target,(async()=>{
        const observation=await page.evaluate(async({target,entry,modules,memory,nativeTarget})=>{
          const compiler=globalThis.realProjectCompiler;
          const product=await compiler.compile_project({target,entry,modules,resolveImports:true,sourceMap:true,debug:true,memory,nativeTarget,nativeFormat:'library'});
          if(product.target!==target||product.entry!==entry)throw new Error('the actual compiler changed the requested project target');
          const {bytes,...metadata}=product;
          const base='/full-project-products/'+compiler.host+'/'+target;
          const saved=await fetch(base+'/metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)});
          if(!saved.ok)throw new Error('emitted project metadata was not retained');
          if(target!=='javascript'){
            const savedBytes=await fetch(base+'/bytes',{method:'POST',body:Uint8Array.from(bytes)});
            if(!savedBytes.ok)throw new Error('emitted project bytes were not retained');
          }
          let report;
          if(target==='javascript'){
            if(product.modules.length!==modules.length)throw new Error('the complete original language source graph changed');
            const output=product.modules.find(item=>item.id===entry);
            if(!output)throw new Error('the complete original fixture was not emitted');
            const url=URL.createObjectURL(new Blob([output.javascript],{type:'text/javascript'}));
            try{report=(await import(url)).expression_form_report();}finally{URL.revokeObjectURL(url);}
          }else if(target==='wasm'){
            const binary=Uint8Array.from(bytes);
            if(WebAssembly.Module.imports(new WebAssembly.Module(binary)).length)throw new Error('the actual language product must have zero WASM imports');
            const {instantiateManagedRuntime}=await import('/managed-project-runtime.mjs');
            const runtime=instantiateManagedRuntime(binary,{...globalThis.realProjectResources.budget,...memory,debug:product.debug});
            runtime.auto(globalThis.realProjectResources.auto);let failure;
            try{
              let value;
              try{value=runtime.invoke('expression-form-report');report=JSON.parse(JSON.stringify(runtime.toHostValue(value)));}
              finally{if(value!==undefined)runtime.release(value);}
              runtime.collect();if(runtime.stats().frameDepth!==0)throw new Error('the original language program retained a call frame');
            }catch(error){failure=error;throw error;}finally{
              let cleanup;
              for(const action of[()=>runtime.closeModule(),()=>runtime.collect(),()=>{if(runtime.live()!==0)throw new Error('the original language program retained managed roots');},
                ()=>{if(runtime.stats().frameDepth!==0)throw new Error('project close retained managed frames');},()=>runtime.close?.()])try{action();}catch(error){cleanup??=error;}
              if(!failure&&cleanup)throw cleanup;
            }
          }
          return{host:compiler.host,target,report:report===undefined?null:report,lifetime:compilerLifetimes()};
        },{target,entry:fullProjectEntry,modules:fixture.modules,memory:fixture.productResources.memory,nativeTarget:fullProjectNativeTarget});
        const saved=fullProjectProducts.get(host+'/'+target);assert(saved?.metadata,'actual browser-emitted metadata');
        assert.equal(observation.host,host);assert.equal(observation.target,target);
        assert.deepEqual(saved.metadata,fixture.products[target].metadata,'same-target complete emission and actual source spans must match independent Node Seed bytes');
        if(target==='javascript'){
          const entry=saved.metadata.modules.find(item=>item.id===fullProjectEntry);
          assert.equal(entry.javascript,fixture.language.compile.javascript);
          assert.equal(entry.sourceMap,fixture.language.compile.sourceMap);
        }else{
          assert.deepEqual(saved.bytes,fixture.products[target].bytes,'actual '+target+' bytes from the real '+host+' compiler');
          const debug=saved.metadata.debug,map=createCompilerDebugMap(debug);
          assert(debug.sources.some(item=>item.id===fullProjectEntry&&item.filename===fullProjectSourceName));
          const mapped=debug.ranges.filter(item=>item.span?.filename===fullProjectSourceName&&item.end>item.start)
            .map(item=>map.lookup(item.start,{functionIndex:item.functionIndex}))
            .find(item=>item?.span?.filename===fullProjectSourceName);
          assert(mapped,'the actual emitted complete fixture requires an instruction with its original source span');
          assert(Number.isInteger(mapped.span.start)&&Number.isInteger(mapped.span.end));
          assert(mapped.span.start>=0&&mapped.span.end>mapped.span.start&&mapped.span.end<=Array.from(fixture.source).length);
        }
        if(target!=='native')assert.deepEqual(observation.report,fullProjectReport);
        assert.equal(observation.lifetime.workers,1);assert.equal(observation.lifetime.terminated,0);
        return saved;
      })());
      return pending.get(target);
    }
    async function ingress(kind){
      if(!ingressPending.has(kind))ingressPending.set(kind,(async()=>{
        const observations=await page.evaluate(async({kind,source,filename,entry,modules,memory,nativeTarget})=>{
          const compiler=globalThis.realProjectCompiler,check=(value,message)=>{if(!value)throw new Error(message);};
          const caps=await compiler.request({operation:'capabilities'});
          for(const operation of ['emit-ir','project-ir','emit-memory-ir','emit-typed-memory'])check(caps.operations.includes(operation),'missing actual IR operation '+operation);
          check(JSON.stringify(caps.memoryIRTargets)===JSON.stringify(['wasm','native']),'raw memory targets must not advertise JavaScript');
          const rawSource='(import "eliscript:memory32" load-u32 store-u32 memory-size memory-grow) '+
            '(defun read32 (p) (load-u32 p)) (defun set32 (p v) (store-u32 p v) (load-u32 p)) '+
            '(defun grow (n) (memory-grow n)) (defun size () (memory-size)) (export read32 set32 grow size)';
          const rawFilename='browser-memory-ir.eli';
          const inputs=[];
          for(const module of modules)inputs.push({...module,ir:(await compiler.request({operation:'compile-ir',source:module.source,filename:module.filename})).ir});
          const single=inputs.find(item=>item.id===entry).ir;
          const raw=kind==='memory'?(await compiler.request({operation:'compile-ir',source:rawSource,filename:rawFilename})).ir:null;
          const targets=kind==='memory'?caps.memoryIRTargets:['javascript','wasm','native'],out=[];
          for(const target of targets){
            const common={target,nativeTarget,nativeFormat:'library',debug:true,memory:kind==='memory'?{initialPages:1,maximumPages:2}:memory};
            const request=kind==='project'?{...common,operation:'project-ir',entry,modules:inputs,resolveImports:true,sourceMap:true}:
              kind==='single'?{...common,operation:'emit-ir',ir:single,source,sourceMap:{generatedFile:entry,sourceName:filename}}:
                {...common,operation:'emit-memory-ir',ir:raw};
            const product=await compiler.request(request),{bytes,...metadata}=product;
            if(target!=='javascript')check(product.target===target,'IR output changed target');
            if(kind==='project')check(product.entry===entry,'IR output changed entry');
            const endpoint='/ir-ingress-products/'+compiler.host+'/'+kind+'/'+target;
            check((await fetch(endpoint+'/metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)})).ok,'retain actual IR metadata');
            if(target!=='javascript')check((await fetch(endpoint+'/bytes',{method:'POST',body:Uint8Array.from(bytes)})).ok,'retain actual IR bytes');
            let report=null,trap=null;
            if(target==='javascript'){
              const output=kind==='project'?product.modules.find(item=>item.id===entry):product;
              check(typeof output.javascript==='string','real JS emitter output');
              check(JSON.parse(output.sourceMap).sources[0]===filename,'real JS IR map filename');
              const url=URL.createObjectURL(new Blob([output.javascript],{type:'text/javascript'}));
              try{report=(await import(url)).expression_form_report();}finally{URL.revokeObjectURL(url);}
            }else if(kind==='memory'){
              check(product.abi==='memory-u32'&&product.descriptor===undefined,'raw ABI must remain separate from managed values');
              if(target==='wasm'){
                const binary=Uint8Array.from(bytes),module=new WebAssembly.Module(binary);
                check(WebAssembly.Module.imports(module).length===0,'raw memory output must be zero imports');
                const e=new WebAssembly.Instance(module).exports;
                check((e.set32(8,0xffffffff)>>>0)===0xffffffff&&(e.read32(8)>>>0)===0xffffffff,'real raw u32 memory');
                try{e.read32(65533);}catch(error){trap={name:error.name,message:error.message};check(error instanceof WebAssembly.RuntimeError,'real raw memory bounds trap');}
                check(trap!==null,'raw memory bounds must trap');
                check(e.grow(1)===1&&e.size()===2,'real memory growth');
                check((e.grow(1)>>>0)===0xffffffff&&e.set32(65536,42)===42,'growth failure and subsequent recovery');
              }
              const same=await compiler.request({...common,operation:'emit-typed-memory',ir:JSON.stringify(product.typed)});
              check(JSON.stringify(same.bytes)===JSON.stringify(product.bytes),'actual typed and source memory-IR bytes');
            }else if(target==='wasm'){
              const binary=Uint8Array.from(bytes),module=new WebAssembly.Module(binary);
              check(WebAssembly.Module.imports(module).length===0,'complete IR language product must be zero imports');
              const {instantiateManagedRuntime}=await import('/managed-project-runtime.mjs');
              const runtime=instantiateManagedRuntime(binary,{...globalThis.realProjectResources.budget,...memory,debug:product.debug});
              runtime.auto(globalThis.realProjectResources.auto);
              try{
                const value=runtime.invoke('expression-form-report');
                try{report=JSON.parse(JSON.stringify(runtime.toHostValue(value)));}finally{runtime.release(value);}
              }finally{
                try{runtime.closeModule();runtime.collect();check(runtime.live()===0,'IR program leaked roots');check(runtime.stats().frameDepth===0,'IR program leaked frames');}
                finally{runtime.close?.();}
              }
            }
            if(target!=='javascript'){
              const {createCompilerDebugMap}=await import('/debug-map.mjs'),map=createCompilerDebugMap(product.debug);
              const expectedFilename=kind==='memory'?rawFilename:filename;
              const range=product.debug.ranges.find(item=>item.span?.filename===expectedFilename&&item.end>item.start);
              check(range!==undefined,'actual IR emission must retain its original source range');
              const mapped=map.lookup(range.start,{functionIndex:range.functionIndex});
              check(mapped?.span?.filename===expectedFilename&&mapped.span.start===range.span.start&&mapped.span.end===range.span.end,'IR instruction must map to its exact actual range');
            }
            out.push({target,report,trap,abi:product.abi??null});
          }
          if(kind==='memory'){
            let refusal;
            try{await compiler.request({operation:'emit-memory-ir',ir:raw,target:'javascript',memory:{initialPages:1,maximumPages:2}});}
            catch(error){refusal={message:error.message,diagnostic:error.eliscriptDiagnostic};}
            check(refusal!==undefined,'raw ABI must refuse a JavaScript target');
          }
          return out;
        },{kind,source:fixture.source,filename:fullProjectSourceName,entry:fullProjectEntry,modules:fixture.modules,
          memory:fixture.productResources.memory,nativeTarget:fullProjectNativeTarget});
        for(const observation of observations){
          const saved=irIngressProducts.get(host+'/'+kind+'/'+observation.target);assert(saved?.metadata);
          if(kind==='single')assert.deepEqual(saved,fixture.singleIRProducts[observation.target]);
          if(kind==='project'){
            // Project revision counters describe session history, rather than
            // emitted code. Keep every actual module/descriptor/debug field.
            const {revision:actualRevision,literalRevision:actualLiteral,...actual}=saved.metadata;
            const {revision:referenceRevision,literalRevision:referenceLiteral,...reference}=fixture.products[observation.target].metadata;
            assert(Number.isSafeInteger(actualRevision));assert(Number.isSafeInteger(referenceRevision));
            assert.deepEqual(actual,reference);
            if(observation.target!=='javascript')assert.deepEqual(saved.bytes,fixture.products[observation.target].bytes);
          }
          if(kind!=='memory'&&observation.target!=='native')assert.deepEqual(observation.report,fullProjectReport);
          if(kind==='memory')assert.equal(observation.abi,'memory-u32');
        }
        return observations;
      })());
      return ingressPending.get(kind);
    }
    beforeAll(async()=>{
      page=await browser.newPage();await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
      const result=await page.evaluate(async({host,manifestURL,source,filename,entry,resources})=>{
        const {createBrowserCompiler}=await import('/transport.mjs');
        const compiler=await createBrowserCompiler({host,manifestURL,worker:true});
        globalThis.realProjectCompiler=compiler;globalThis.realProjectResources=resources;
        if(compiler.host!==host)throw new Error('browser compiler fell back to a different host');
        const compile=await compiler.compile_string_with_source_map(source,filename,entry,filename);
        const ir=await compiler.compile_ir_string(source,filename);
        const canonical=await compiler.serialize_ir_program(ir);
        if(await compiler.serialize_ir_program(await compiler.deserialize_ir_program(canonical))!==canonical)throw new Error('canonical full-fixture IR roundtrip changed');
        return{compile,ir,canonical};
      },{host,manifestURL:host==='wasm'?fixture.wasmManifest:new URL('/artifact/compiler-artifact.json',server.url).href,
        source:fixture.source,filename:fullProjectSourceName,entry:fullProjectEntry,resources:fixture.productResources});
      assert.deepEqual(result.compile,fixture.language.compile);
      assert.deepEqual(result.ir,JSON.parse(fixture.language.ir));assert.equal(result.canonical,fixture.language.canonical);
    },180000);
    afterAll(async()=>{
      if(!page)return;let failure;
      try{
        const lifetime=await page.evaluate(async()=>{try{await globalThis.realProjectCompiler?.dispose();}finally{delete globalThis.realProjectCompiler;delete globalThis.realProjectResources;}return compilerLifetimes();});
        assert.deepEqual(lifetime,{created:1,terminated:1,workers:0,blobs:0});
      }catch(error){failure=error;}finally{await page.close();}
      if(failure)throw failure;
    });
    for(const target of ['javascript','wasm','native'])test('emits the complete original language fixture to '+target+' with exact independent Node IR maps debug and product bytes',async()=>{
      await emitted(target);
    },180000);
    for(const kind of ['single','project','memory'])test('Given the real '+host+' compiler Worker When '+kind+' IR is submitted Then actual supported target products execute with exact source maps and cleanup',async()=>{
      await ingress(kind);
    },180000);
    test.skipIf(!fullProjectNativeSupported)('Given browser IR emission When its real native libraries execute Then managed and raw ABIs preserve original observations and traps',async()=>{
      for(const kind of ['single','project']){
        await ingress(kind);
        const product=irIngressProducts.get(host+'/'+kind+'/native'),path=resolve(fixture.preparation,host+'-'+kind+'-ir'+(process.platform==='linux'?'.so':'.dylib'));
        await writeFile(path,product.bytes);
        const runtime=await instantiateNativeManagedRuntime(path,{typed:product.metadata.typed,descriptor:product.metadata.descriptor},
          {...fixture.productResources.budget,...fixture.productResources.memory,nativeTarget:fullProjectNativeTarget,debug:product.metadata.debug});
        try{
          runtime.auto(fixture.productResources.auto);const value=runtime.invoke('expression-form-report');
          try{assert.deepEqual(JSON.parse(JSON.stringify(runtime.toHostValue(value))),fullProjectReport);}finally{runtime.release(value);}
        }finally{try{runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}finally{runtime.close();}}
      }
      await ingress('memory');
      const product=irIngressProducts.get(host+'/memory/native'),path=resolve(fixture.preparation,host+'-raw-ir'+(process.platform==='linux'?'.so':'.dylib'));
      await writeFile(path,product.bytes);
      const runtime=await openNativeMemory(path,{read32:1,set32:2,grow:1,size:0},{initialPages:1,maximumPages:2,
        nativeTarget:fullProjectNativeTarget,debug:product.metadata.debug,trapSites:product.metadata.debug.trapSites});
      let originalTrap,snapshot;
      try{
        assert.equal(runtime.invoke('set32',8,0xffffffff)>>>0,0xffffffff);assert.equal(runtime.invoke('read32',8)>>>0,0xffffffff);
        assert.throws(()=>runtime.invoke('read32',65533),error=>{originalTrap=error;return error instanceof WebAssembly.RuntimeError;});
        assert(Array.isArray(originalTrap.eliscriptFrames)&&originalTrap.eliscriptFrames.length>0);
        const mapped=createCompilerDebugMap(product.metadata.debug).mapFrames(originalTrap.eliscriptFrames);
        assert(mapped.some(item=>item.source?.span?.filename==='browser-memory-ir.eli'));
        snapshot=structuredClone({frames:originalTrap.eliscriptFrames,sourceFrames:originalTrap.eliscriptSourceFrames});
        assert.equal(runtime.invoke('grow',1),1);assert.equal(runtime.invoke('size'),2);
        assert.equal(runtime.invoke('grow',1)>>>0,0xffffffff);assert.equal(runtime.invoke('set32',65536,42),42);
      }finally{runtime.close();}
      assert.deepEqual({frames:originalTrap.eliscriptFrames,sourceFrames:originalTrap.eliscriptSourceFrames},snapshot);
    },180000);
    test.skipIf(!fullProjectNativeSupported)('the browser-emitted native library actually executes the complete fixture with GC and close cleanup',async()=>{
      const product=await emitted('native');
      const path=resolve(fixture.preparation,host+'-browser'+(process.platform==='linux'?'.so':'.dylib'));
      await writeFile(path,product.bytes);
      const OldModule=WebAssembly.Module,OldInstance=WebAssembly.Instance;let runtime,failure;
      try{
        WebAssembly.Module=function(){throw new Error('native browser-product execution must not use WASM');};
        WebAssembly.Instance=function(){throw new Error('native browser-product execution must not use WASM');};
        runtime=await instantiateNativeManagedRuntime(path,{typed:product.metadata.typed,descriptor:product.metadata.descriptor},
          {...fixture.productResources.budget,...fixture.productResources.memory,nativeTarget:fullProjectNativeTarget,debug:product.metadata.debug});
        runtime.auto(fixture.productResources.auto);let value;
        try{value=runtime.invoke('expression-form-report');assert.deepEqual(JSON.parse(JSON.stringify(runtime.toHostValue(value))),fullProjectReport);}
        finally{if(value!==undefined)runtime.release(value);}
        runtime.collect();assert.equal(runtime.stats().frameDepth,0);
      }catch(error){failure=error;throw error;}finally{
        let cleanup;
        for(const action of[()=>runtime?.closeModule(),()=>runtime?.collect(),()=>{if(runtime){assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}},()=>runtime?.close?.()])try{action();}catch(error){cleanup??=error;}
        WebAssembly.Module=OldModule;WebAssembly.Instance=OldInstance;
        if(!failure&&cleanup)throw cleanup;
      }
    },180000);
  });
});

// Instrument only browser-owned resource lifetimes. Compilation continues to
// run the real emitted compiler, including inside the actual module Worker.
const installBrowserLifetimeCounters = () => {
  const NativeWorker = globalThis.Worker, create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  const liveWorkers = new Set(), liveURLs = new Set();
  let created = 0, terminated = 0;
  globalThis.Worker = class extends NativeWorker {
    constructor(...args) {super(...args);created++;liveWorkers.add(this);}
    terminate() {if (liveWorkers.delete(this)) terminated++;return super.terminate();}
  };
  URL.createObjectURL = (...args) => {const url = create(...args);liveURLs.add(url);return url;};
  URL.revokeObjectURL = url => {liveURLs.delete(url);return revoke(url);};
  globalThis.compilerLifetimes = () => ({created, terminated, workers: liveWorkers.size, blobs: liveURLs.size});
};

test('browser and owned Worker both load the emitted WASM debug sidecar and retain exact source positions', async () => {
  const fixture = await browserDebugCase('automatic');
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
    const results = await page.evaluate(async ({manifestURL, debug}) => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const {createCompilerDebugMap} = await import('/debug-map.mjs');
      const range = debug.ranges.find(item => item.span !== null && item.span !== undefined && item.end > item.start);
      if (!range) throw new Error('the emitted full compiler must retain actual source spans');
      const mapped = createCompilerDebugMap(debug).lookup(range.start, {functionIndex: range.functionIndex});
      if (!mapped?.span || mapped.span.filename !== range.span.filename || mapped.span.start !== range.span.start || mapped.span.end !== range.span.end) {
        throw new Error('emitted instruction positions must resolve to their actual original span');
      }
      const results = [];
      for (const worker of [false, true]) {
        const compiler = await createBrowserCompiler({host: 'wasm', manifestURL, worker});
        try {
          const result = await compiler.compile_string_with_source_map('(defun run () 42) (export run)', '浏览器😀.eli', 'browser.mjs');
          if (JSON.parse(result.sourceMap).sources[0] !== '浏览器😀.eli') throw new Error('source filename was lost');
          let failure;
          try {await compiler.compile_string('(print missing)', 'debug-broken.eli');} catch (error) {failure = error.eliscriptDiagnostic;}
          if (failure?.location?.file !== 'debug-broken.eli') throw new Error('actual compiler diagnostic lost its source');
          results.push({worker, host: compiler.host, filename: mapped.span.filename});
        } finally {await compiler.dispose();}
      }
      return {results, lifetime: compilerLifetimes()};
    }, {manifestURL: fixture.manifestURL, debug: fixture.debug});
    assert.deepEqual(results.results.map(item => [item.worker, item.host]), [[false, 'wasm'], [true, 'wasm']]);
    assert.equal(resourceRequests.get(fixture.debugURL), 2);assert.equal(resourceRequests.get(fixture.binaryURL), 2);
    assert.deepEqual(results.lifetime, {created: 1, terminated: 1, workers: 0, blobs: 0});
  } finally {await page.close();}
}, 120000);

test('explicit browser debug takes precedence and automatic malformed debug is rejected in both execution modes', async () => {
  const missing = await browserDebugCase('explicit-priority', {status: 404});
  const malformed = await browserDebugCase('malformed', {debugDocument: {format: 'invalid-debug-document'}});
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
    const results = await page.evaluate(async ({missingURL, malformedURL, debug}) => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const results = [];
      for (const worker of [false, true]) {
        const compiler = await createBrowserCompiler({host: 'wasm', manifestURL: missingURL, worker, options: {debug}});
        try {
          const result = await compiler.compile_string('(defun run () 42) (export run)', 'explicit.eli');
          if (typeof result !== 'string') throw new Error('explicit map must execute the actual WASM compiler');
        } finally {await compiler.dispose();}
        let message;
        try {await createBrowserCompiler({host: 'wasm', manifestURL: malformedURL, worker});}
        catch (error) {message = error.message;}
        if (!message) throw new Error('malformed automatic debug must fail actual runtime initialization');
        results.push({worker, message});
      }
      return {results, lifetime: compilerLifetimes()};
    }, {missingURL: missing.manifestURL, malformedURL: malformed.manifestURL, debug: missing.debug});
    assert.equal(resourceRequests.get(missing.debugURL) ?? 0, 0, 'an explicit debug map must suppress manifest debug I/O');
    assert.equal(resourceRequests.get(malformed.debugURL), 2);
    for (const result of results.results) assert.match(result.message, /unsupported compiler instruction map/);
    assert.deepEqual(results.lifetime, {created: 2, terminated: 2, workers: 0, blobs: 0});
  } finally {await page.close();}
}, 120000);

test('browser debug HTTP failures release Worker resources and do not poison a subsequent real initialization', async () => {
  const failure = await browserDebugCase('http-failure', {status: 503});
  const healthy = await browserDebugCase('http-recovery');
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
    const result = await page.evaluate(async ({failureURL, healthyURL}) => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const errors = [];
      for (const worker of [false, true]) {
        try {await createBrowserCompiler({host: 'wasm', manifestURL: failureURL, worker});throw new Error('expected resource failure');}
        catch (error) {if (error.message === 'expected resource failure') throw error;errors.push(error.message);}
        const compiler = await createBrowserCompiler({host: 'wasm', manifestURL: healthyURL, worker});
        try {await compiler.compile_string('(defun run () 42) (export run)', 'after-fetch-failure.eli');}
        finally {await compiler.dispose();}
      }
      return {errors, lifetime: compilerLifetimes()};
    }, {failureURL: failure.manifestURL, healthyURL: healthy.manifestURL});
    for (const message of result.errors) assert.match(message, /503/);
    assert.equal(resourceRequests.get(failure.binaryURL) ?? 0, 0, 'debug failure must precede binary consumption');
    assert.deepEqual(result.lifetime, {created: 2, terminated: 2, workers: 0, blobs: 0});
  } finally {await page.close();}
}, 120000);

test('a changed emitted WASM resource is rejected before initialization in the browser and its owned Worker', async () => {
  const changed = await browserDebugCase('changed-binary', {binaryMutation: true});
  const healthy = await browserDebugCase('unchanged-binary');
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
    const result = await page.evaluate(async ({changedURL, healthyURL}) => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const failures = [];
      for (const worker of [false, true]) {
        let failure;
        try {
          const unexpected = await createBrowserCompiler({host: 'wasm', manifestURL: changedURL, worker});
          await unexpected.dispose();
        } catch (error) {failure = error.message;}
        if (!failure) throw new Error('changed WASM bytes were accepted');
        failures.push(failure);
        const compiler = await createBrowserCompiler({host: 'wasm', manifestURL: healthyURL, worker});
        try {
          const compiled = await compiler.compile_string('(defun value () 42) (export value)', 'after-integrity-failure.eli');
          if (typeof compiled !== 'string') throw new Error('the original compiler failed after an integrity rejection');
        } finally {await compiler.dispose();}
      }
      return {failures, lifetime: compilerLifetimes()};
    }, {changedURL: changed.manifestURL, healthyURL: healthy.manifestURL});
    assert.equal(result.failures.length, 2);
    for (const message of result.failures) assert.match(message, /compiler resource SHA-256 mismatch/);
    assert.equal(resourceRequests.get(changed.binaryURL), 2);
    assert.deepEqual(result.lifetime, {created: 2, terminated: 2, workers: 0, blobs: 0});
  } finally {await page.close();}
}, 120000);

for (const worker of [false, true]) {
  test('aborting browser debug loading cleans its actual resources with worker=' + worker, async () => {
    let entered, release;
    const ready = new Promise(resolve => {entered = resolve;});
    const waiting = new Promise(resolve => {release = resolve;});
    const fixture = await browserDebugCase('cancel-' + worker, {gate: {async wait() {entered();await waiting;}}});
    const page = await browser.newPage();
    try {
      await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
      const pending = page.evaluate(async ({manifestURL, worker}) => {
        const {createBrowserCompiler} = await import('/transport.mjs');
        const controller = new AbortController();
        globalThis.cancelCompilerInitialization = () => controller.abort(new Error('cancel debug resource loading'));
        try {
          const compiler = await createBrowserCompiler({host: 'wasm', manifestURL, worker, signal: controller.signal});
          await compiler.dispose();throw new Error('initialization ignored cancellation');
        } catch (error) {return {message: error.message, lifetime: compilerLifetimes()};}
        finally {delete globalThis.cancelCompilerInitialization;}
      }, {manifestURL: fixture.manifestURL, worker});
      // The server handshake ensures cancellation occurs during the real
      // debug download, without depending on elapsed-time sleeps.
      await ready;await page.evaluate(() => cancelCompilerInitialization());
      release();const evidence = await pending;
      assert.equal(evidence.message, 'cancel debug resource loading');
      assert.deepEqual(evidence.lifetime, {created: worker ? 1 : 0, terminated: worker ? 1 : 0, workers: 0, blobs: 0});
      assert.equal(resourceRequests.get(fixture.binaryURL) ?? 0, 0);
    } finally {release();await page.close();}
  }, 120000);
}

// Identity and asset transport below deliberately use a recording client.
// They verify the browser boundary, not execution of a compiler artifact.
test('runtime source identity binds the complete explicit library input while ordinary compile identity remains stable', async () => {
  const source='\uFEFF(module runtime (defun value () "中😀"))';
  const library={id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',source:'\uFEFF(module values (defun value () "é😀"))'};
  const request={operation:'runtime',source,filename:'bootstrap/runtime/memory.eli',literalSources:[library]};
  const before=JSON.stringify(request),identity=await compilerSourceIdentity(request);
  assert.equal(await compilerSourceIdentity(JSON.stringify(request)),identity);
  assert.equal(JSON.stringify(request),before,'identity calculation must not alter source records');
  for(const changed of [
    {...library,id:'runtime/core/other.mjs'},
    {...library,filename:'stdlib/renamed-value.eli'},
    {...library,source:library.source+'\n'},
    {...library,source:library.source.slice(1)},
    {...library,source:library.source.replace('é😀','e\u0301😀')},
    {...library,source:library.source.replace('😀','😁')},
    {...library,source:library.source+'; \ud800'},
    {...library,source:library.source+'; \udc00'},
  ]) assert.notEqual(await compilerSourceIdentity({...request,literalSources:[changed]}),identity);
  assert.notEqual(await compilerSourceIdentity({...request,source:source.slice(1)}),identity);
  const omitted={operation:'runtime',source,filename:request.filename};
  assert.notEqual(await compilerSourceIdentity(omitted),await compilerSourceIdentity({...omitted,literalSources:[]}));
  assert.notEqual(identity,await compilerSourceIdentity({...request,literalSources:[]}));
  const second={id:'runtime/core/list.mjs',filename:'stdlib/managed-runtime-list.eli',source:'(module list)'};
  assert.notEqual(await compilerSourceIdentity({...request,literalSources:[library,second]}),
    await compilerSourceIdentity({...request,literalSources:[second,library]}));
  const options={...request,target:'native',nativeTarget:'arm64-linux',memory:{initialPages:4,maximumPages:1024},options:{debug:true},sourceMap:{generatedFile:'ignored.mjs'}};
  assert.equal(await compilerSourceIdentity(options),identity,'output choices are not source changes');
  assert.notEqual(await compilerRequestIdentity(options),await compilerRequestIdentity(request));

  // Independently reconstruct the pre-existing source-only UTF-16LE digest.
  const compile={operation:'compile',source:'(defun run () "😀")',filename:'ordinary.eli'};
  const snapshot=JSON.stringify({filename:compile.filename,source:compile.source,macroContext:{capabilities:[],files:[]}});
  const bytes=new Uint8Array(snapshot.length*2),view=new DataView(bytes.buffer);
  for(let index=0;index<snapshot.length;index++)view.setUint16(index*2,snapshot.charCodeAt(index),true);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
  assert.equal(await compilerSourceIdentity(compile),digest);
  assert.equal(await compilerSourceIdentity({...compile,target:'wasm',options:{debug:true},literalSources:[library]}),digest);
  for(const operation of ['compile','compile-ir','stage','format','analyze','query']){
    const original={...compile,operation};
    const ignored={...original,literalSources:[library],target:'native',options:{debug:true}};
    assert.equal(await compilerSourceIdentity(ignored),await compilerSourceIdentity(original),operation);
    assert.notEqual(await compilerRequestIdentity(ignored),await compilerRequestIdentity(original),operation);
  }
  const project={operation:'project',entry:'entry.mjs',modules:[{id:'entry.mjs',source:compile.source,filename:compile.filename}]};
  assert.notEqual(await compilerSourceIdentity(project),await compilerSourceIdentity({...project,literalSources:[]}));
  assert.notEqual(await compilerSourceIdentity({...project,literalSources:[library]}),
    await compilerSourceIdentity({...project,literalSources:[{...library,source:library.source+'\n'}]}));
});

test('browser runtime and library downloads preserve BOM and split UTF-8 through the actual asset loader',async()=>{
  const page=await browser.newPage();
  try{
    await page.goto(server.url.href);
    const result=await page.evaluate(async()=>{
      const {createBrowserCompiler}=await import('/transport.mjs');
      const originalFetch=globalThis.fetch,calls=[],registered=[],dispatched=[];
      const runtime='\uFEFF; runtime 中😀é\n(module runtime)',library='\uFEFF; library 😀中文\n(module library)';
      const base='https://compiler-assets.invalid/split/';
      const manifest={host:'javascript',path:'unused-compiler.mjs',runtimePath:'runtime.eli',literalSources:[
        {id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',path:'library.eli'},
      ]};
      const stream=text=>{
        const bytes=new TextEncoder().encode(text);
        return new Response(new ReadableStream({start(controller){
          // Every byte is a separate network chunk, including BOM and all
          // continuation bytes of the four-byte supplementary character.
          for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();
        }}));
      };
      globalThis.fetch=async input=>{
        const url=String(input);calls.push(url);
        if(url===base+'compiler-artifact.json')return Response.json(manifest);
        if(url===base+'runtime.eli')return stream(runtime);
        if(url===base+'library.eli')return stream(library);
        throw new Error('unexpected asset '+url);
      };
      const client={async setSource(payload,options){registered.push({payload,options});},
        async request(payload){if(payload.operation==='capabilities')return{host:'javascript'};dispatched.push(payload);return{host:'javascript',result:{cached:true}};},async close(){}};
      let compiler;
      try{
        compiler=await createBrowserCompiler({host:'javascript',manifestURL:base+'compiler-artifact.json',workerClient:client});
        await compiler.loadRuntime();await compiler.loadRuntime();
        return{calls,registered,dispatched,runtime,library};
      }finally{await compiler?.dispose();globalThis.fetch=originalFetch;}
    });
    assert.equal(result.dispatched.length,1);
    assert.equal(result.registered.length,1);
    const payload=result.dispatched[0];
    assert.equal(payload.source,result.runtime);assert.equal(payload.source.charCodeAt(0),0xfeff);
    assert.equal(payload.literalSources[0].source,result.library);assert.equal(payload.literalSources[0].source.charCodeAt(0),0xfeff);
    assert.equal(payload.literalSources[0].id,'runtime/core/value.mjs');
    assert.equal(payload.literalSources[0].filename,'stdlib/managed-runtime-value.eli');
    assert.deepEqual(result.registered[0].payload,payload);
    assert.deepEqual(result.calls.map(url=>new URL(url).pathname),['/split/compiler-artifact.json','/split/runtime.eli','/split/library.eli']);
  }finally{await page.close();}
},120000);

test('browser runtime and library JSON source assets preserve isolated UTF16 surrogates without replacement', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);
    const result = await page.evaluate(async () => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const originalFetch = globalThis.fetch, requests = [], base = 'https://compiler-assets.invalid/codeunits/';
      const runtime = '\uFEFF; runtime \ud800😀\n(module runtime)', library = '\uFEFF; library \udc00中\n(module library)';
      globalThis.fetch = async input => {
        const name = new URL(String(input)).pathname.split('/').at(-1);
        if (name === 'compiler-artifact.json') return Response.json({host: 'javascript', path: 'unused.mjs',
          runtimePath: 'runtime.eli.json', runtimeEncoding: 'json-utf16', literalSources: [
            {id: 'stdlib/bit.mjs', filename: 'stdlib/bit.eli', path: 'bit.eli.json', encoding: 'json-utf16'}]});
        if (name === 'runtime.eli.json') return Response.json(runtime);
        if (name === 'bit.eli.json') return Response.json(library);
        throw new Error('unexpected asset ' + name);
      };
      const client = {async setSource() {}, async request(payload) {
        if (payload.operation === 'capabilities') return {host: 'javascript'};
        requests.push(payload);return {host: 'javascript', result: {ready: true}};
      }, async close() {}};
      let compiler;
      try {
        compiler = await createBrowserCompiler({host: 'javascript', manifestURL: base + 'compiler-artifact.json', workerClient: client});
        await compiler.loadRuntime();
        return {requests, runtime, library};
      } finally {await compiler?.dispose();globalThis.fetch = originalFetch;}
    });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].source, result.runtime);
    assert.equal(result.requests[0].literalSources[0].source, result.library);
    assert(result.runtime.includes('\ud800'));assert(result.library.includes('\udc00'));
    assert.equal(result.runtime.includes('\ufffd'), false);assert.equal(result.library.includes('\ufffd'), false);
  } finally {await page.close();}
}, 120000);

test('malformed UTF-8 in either runtime or library rejects before dispatch and a corrected retry has no failed cached state',async()=>{
  const page=await browser.newPage();
  try{
    await page.goto(server.url.href);
    const results=await page.evaluate(async()=>{
      const {createBrowserCompiler}=await import('/transport.mjs');
      const originalFetch=globalThis.fetch,results=[];
      const invalidSequences=[[0xc0,0xaf],[0xe2,0x28,0xa1],[0xed,0xa0,0x80],[0xf0,0x9f,0x98]];
      try{
        for(const failing of ['runtime.eli','library.eli'])for(const invalid of invalidSequences){
          const base='https://compiler-assets.invalid/retry/',counts=new Map(),registered=[],dispatched=[];
          const runtime='\uFEFF; runtime 😀\n(module runtime)',library='\uFEFF; library 中\n(module library)';
          const manifest={host:'javascript',path:'unused.mjs',runtimePath:'runtime.eli',literalSources:[{id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',path:'library.eli'}]};
          globalThis.fetch=async input=>{
            const url=new URL(String(input)),name=url.pathname.split('/').at(-1),count=(counts.get(name)??0)+1;counts.set(name,count);
            if(name==='compiler-artifact.json')return Response.json(manifest);
            if(name!=='runtime.eli'&&name!=='library.eli')throw new Error('unexpected asset '+url);
            const bytes=name===failing&&count===1?Uint8Array.from([0xef,0xbb,0xbf,...invalid]):new TextEncoder().encode(name==='runtime.eli'?runtime:library);
            return new Response(new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}}));
          };
          const client={async setSource(payload){registered.push(payload);},async request(payload){
            if(payload.operation==='capabilities')return{host:'javascript'};dispatched.push(payload);return{host:'javascript',result:{cached:true}};
          },async close(){}};
          const compiler=await createBrowserCompiler({host:'javascript',manifestURL:base+'compiler-artifact.json',workerClient:client});
          try{
            let failure;
            try{await compiler.loadRuntime();}catch(error){failure={name:error.name,message:error.message};}
            if(!failure)throw new Error('malformed UTF-8 was accepted');
            if(registered.length||dispatched.length)throw new Error('invalid source reached the compiler client');
            await compiler.loadRuntime();await compiler.loadRuntime();
            if(registered.length!==1||dispatched.length!==1)throw new Error('retry failed to restore exactly one runtime dispatch');
            const payload=dispatched[0];
            if(payload.source!==runtime||payload.literalSources[0].source!==library)throw new Error('retry cached replacement characters or stripped BOM');
            results.push({failing,invalid,failure,counts:Object.fromEntries(counts),registered:registered.length,dispatched:dispatched.length});
          }finally{await compiler.dispose();}
        }
      }finally{globalThis.fetch=originalFetch;}
      return results;
    });
    assert.equal(results.length,8);
    for(const result of results){
      assert.equal(result.failure.name,'TypeError');assert.equal(result.registered,1);assert.equal(result.dispatched,1);
      assert.equal(result.counts['runtime.eli'],2);
      assert.equal(result.counts['library.eli'],result.failing==='runtime.eli'?1:2);
      assert.equal(result.counts['compiler-artifact.json'],1);
    }
  }finally{await page.close();}
},120000);

test('a declared browser artifact identity must completely and unambiguously bind the requested source asset', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);
    const failures = await page.evaluate(async () => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const originalFetch = globalThis.fetch, failures = [], bytes = new TextEncoder().encode('(module runtime)');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      const correct = {path: 'runtime.eli', bytes: bytes.length, sha256: hash};
      const cases = [
        {algorithm: 'sha1', files: [correct]},
        {algorithm: 'sha256', files: null},
        {algorithm: 'sha256', files: []},
        {algorithm: 'sha256', files: [correct, {...correct}]},
        ...[null, -1, 1.5, Infinity, '16'].map(size => ({algorithm: 'sha256', files: [{...correct, bytes: size}]})),
        ...['bad', 'g'.repeat(64), '', null].map(hash => ({algorithm: 'sha256', files: [{...correct, sha256: hash}]})),
      ];
      try {
        for (const artifactIdentity of cases) {
          let reads = 0, dispatched = 0;
          globalThis.fetch = async input => {
            if (String(input).endsWith('/compiler-artifact.json')) return Response.json({host: 'javascript', path: 'unused.mjs',
              runtimePath: 'runtime.eli', literalSources: [], artifactIdentity});
            reads++;return new Response(bytes);
          };
          const client = {async setSource() {throw new Error('invalid identity reached source registration');},
            async request(payload) {if (payload.operation === 'capabilities') return {host: 'javascript'};dispatched++;return {host: 'javascript', result: {}};}, async close() {}};
          const compiler = await createBrowserCompiler({host: 'javascript', manifestURL: 'https://compiler-assets.invalid/bindings/compiler-artifact.json', workerClient: client});
          try {
            let failure;
            try {await compiler.loadRuntime();} catch (error) {failure = {name: error.name, message: error.message};}
            if (!failure || reads || dispatched) throw new Error('invalid artifact declarations were consumed');
            failures.push(failure);
          } finally {await compiler.dispose();}
        }
      } finally {globalThis.fetch = originalFetch;}
      return failures;
    });
    assert.equal(failures.length, 13);
    for (const failure of failures) {
      assert.equal(failure.name, 'TypeError');
      assert.match(failure.message, /compiler (?:artifact resource identit|resource has no artifact identity)/);
    }
  } finally {await page.close();}
}, 120000);

test('browser source assets must match their emitted byte identities before any compiler dispatch and may retry an interrupted download', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(server.url.href);
    const results = await page.evaluate(async () => {
      const {createBrowserCompiler} = await import('/transport.mjs');
      const originalFetch = globalThis.fetch, results = [];
      const encoder = new TextEncoder(), base = 'https://compiler-assets.invalid/identity/';
      const assets = {'runtime.eli': encoder.encode('\uFEFF; runtime 😀\n(module runtime)'),
        'library.eli': encoder.encode('\uFEFF; library 中文\n(module library)')};
      async function identity(path) {
        const bytes = assets[path], digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return {path, bytes: bytes.length, sha256: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')};
      }
      const manifest = {host: 'javascript', path: 'unused.mjs', runtimePath: 'runtime.eli',
        literalSources: [{id: 'runtime/core/value.mjs', filename: 'stdlib/managed-runtime-value.eli', path: 'library.eli'}],
        artifactIdentity: {algorithm: 'sha256', files: await Promise.all(Object.keys(assets).map(identity))}};
      try {
        for (const failing of Object.keys(assets)) for (const mismatch of ['length', 'digest']) {
          const counts = new Map(), dispatched = [], registered = [];
          globalThis.fetch = async input => {
            const name = new URL(String(input)).pathname.split('/').at(-1), count = (counts.get(name) ?? 0) + 1;
            counts.set(name, count);
            if (name === 'compiler-artifact.json') return Response.json(manifest);
            if (!Object.hasOwn(assets, name)) throw new Error('unexpected asset ' + name);
            let bytes = assets[name];
            if (name === failing && count === 1) {
              bytes = bytes.slice();
              if (mismatch === 'length') bytes = bytes.slice(0, -1);
              else bytes[bytes.length - 1] ^= 1;
            }
            return new Response(bytes);
          };
          const client = {async setSource(payload) {registered.push(payload);}, async request(payload) {
            if (payload.operation === 'capabilities') return {host: 'javascript'};
            dispatched.push(payload);return {host: 'javascript', result: {ready: true}};
          }, async close() {}};
          const compiler = await createBrowserCompiler({host: 'javascript', manifestURL: base + 'compiler-artifact.json', workerClient: client});
          try {
            let failure;
            try {await compiler.loadRuntime();} catch (error) {failure = error.message;}
            if (!failure || registered.length || dispatched.length) throw new Error('a changed source asset reached the compiler');
            await compiler.loadRuntime();await compiler.loadRuntime();
            if (registered.length !== 1 || dispatched.length !== 1) throw new Error('a source asset retry did not recover');
            if (dispatched[0].source !== new TextDecoder('utf-8', {ignoreBOM: true}).decode(assets['runtime.eli']) ||
                dispatched[0].literalSources[0].source !== new TextDecoder('utf-8', {ignoreBOM: true}).decode(assets['library.eli'])) {
              throw new Error('the dispatched source differs from the verified asset');
            }
            results.push({failing, mismatch, failure, counts: Object.fromEntries(counts)});
          } finally {await compiler.dispose();}
        }
      } finally {globalThis.fetch = originalFetch;}
      return results;
    });
    assert.equal(results.length, 4);
    for (const result of results) {
      assert.match(result.failure, result.mismatch === 'length' ? /byte count mismatch/ : /SHA-256 mismatch/);
      assert.equal(result.counts[result.failing], 2);
    }
  } finally {await page.close();}
}, 120000);

for(const explicitFails of [false,true])test('a pending browser runtime download respects an explicit runtime '+(explicitFails?'failure without losing the default initialization':'success without a second default dispatch'),async()=>{
  const page=await browser.newPage();
  try{
    await page.goto(server.url.href);
    const result=await page.evaluate(async({explicitFails})=>{
      const {createBrowserCompiler}=await import('/transport.mjs');
      const originalFetch=globalThis.fetch,registered=[],dispatched=[];
      let entered,release;
      const downloading=new Promise(resolve=>{entered=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
      const base='https://compiler-assets.invalid/competition/';
      const fallback='\uFEFF; downloaded 😀\n(module runtime)',explicit='\uFEFF; explicit 中文\n(module runtime)';
      globalThis.fetch=async input=>{
        const name=new URL(String(input)).pathname.split('/').at(-1);
        if(name==='compiler-artifact.json')return Response.json({host:'javascript',path:'unused.mjs',runtimePath:'runtime.eli',literalSources:[]});
        if(name==='runtime.eli'){entered();await waiting;return new Response(new TextEncoder().encode(fallback));}
        throw new Error('unexpected asset '+name);
      };
      const client={async setSource(payload,options){registered.push({payload,options});},async request(payload){
        if(payload.operation==='capabilities')return{host:'javascript'};
        dispatched.push(payload);
        if(explicitFails&&payload.source===explicit)throw new Error('explicit runtime compilation failed');
        return{host:'javascript',result:{cached:true}};
      },async close(){}};
      let compiler,pending;
      try{
        compiler=await createBrowserCompiler({host:'javascript',manifestURL:base+'compiler-artifact.json',workerClient:client});
        pending=compiler.loadRuntime();await downloading;
        let failure;
        try{await compiler.request({operation:'runtime',filename:'bootstrap/runtime/memory.eli',source:explicit,literalSources:[]});}
        catch(error){failure=error.message;}
        release();await pending;await compiler.loadRuntime();
        return{registered,dispatched,failure,explicit,fallback};
      }finally{release();try{await pending;}finally{await compiler?.dispose();globalThis.fetch=originalFetch;}}
    },{explicitFails});
    assert.deepEqual(result.dispatched.map(payload=>payload.source),explicitFails?[result.explicit,result.fallback]:[result.explicit]);
    assert.deepEqual(result.registered.map(item=>item.payload.source),explicitFails?[result.explicit,result.fallback]:[result.explicit]);
    if(explicitFails)assert.equal(result.failure,'explicit runtime compilation failed');else assert.equal(result.failure,undefined);
  }finally{await page.close();}
},120000);

for(const host of ['javascript','wasm']){
  test('Given '+host+' browser semantic results When previewing Unicode edits Then text identities and Worker revisions reject stale changes without publishing',async()=>{
    const fixture=await fullBrowserProjectFixture(),page=await browser.newPage();
    try{
      await page.goto(server.url.href);
      const evidence=await page.evaluate(async({host,manifestURL})=>{
        const {createBrowserCompiler}=await import('/transport.mjs');
        const check=(condition,message)=>{if(!condition)throw new Error(message);};
        const results=[];
        for(const worker of [false,true]){
          const compiler=await createBrowserCompiler({host,manifestURL,worker});
          try{
            const filename='edit-😀.eli',source='; 😀\n(defun run (值) (+ 值 1)) (export run)';
            const request={operation:'analyze',source,filename};
            const snapshot=await compiler.setSource(request,{revision:3});
            const original=await compiler.request(request);
            check(original.ok&&original.readOnly,'original semantic result');
            const at=Array.from(source.slice(0,source.indexOf('1'))).length;
            const edit={operation:'edit-preview',source,filename,offsetUnit:'unicode-scalar',
              expectedSourceIdentity:original.sourceIdentity,edits:[{start:at,end:at+1,text:'2'}]};
            const preview=await compiler.request(edit,{expectedRevision:3,expectedSourceIdentity:snapshot.sourceIdentity});
            check(preview.ok&&preview.readOnly&&preview.source===source.replace('1','2'),'exact Unicode preview');
            check(JSON.stringify(preview.previousSourceIdentity)===JSON.stringify(original.sourceIdentity),'previous text identity');
            let unpublished;
            try{await compiler.request({...request,source:preview.source});}catch(error){unpublished=error.code;}
            check(unpublished==='stale-source','a preview must not publish or auto-register edited text');
            const same=await compiler.request(request,{expectedRevision:3});
            check(JSON.stringify(same)===JSON.stringify(original),'preview leaves current semantic result unchanged');
            await compiler.setSource({...request,source:preview.source},{revision:4});
            let stale;
            try{await compiler.request(edit,{expectedRevision:3});}catch(error){stale=error.code;}
            check(stale==='stale-source','the actual Worker or inline transport rejects an older revision');
            const refused=await compiler.request({...edit,source:preview.source},{expectedRevision:4});
            check(!refused.ok&&refused.diagnostics[0].code==='ELI-T0002','the actual compiler also rejects an older text identity');
            const current=await compiler.request({...request,source:preview.source});
            check(current.ok&&JSON.stringify(current.sourceIdentity)===JSON.stringify(preview.sourceIdentity),'full current analysis agrees with the preview identity');
            results.push({worker,unpublished,stale,compilerRefusal:refused.diagnostics[0].code});
          }finally{await compiler.dispose();}
        }
        return results;
      },{host,manifestURL:host==='wasm'?fixture.wasmManifest:new URL('/artifact/compiler-artifact.json',server.url).href});
      assert.deepEqual(evidence,[false,true].map(worker=>({worker,unpublished:'stale-source',stale:'stale-source',compilerRefusal:'ELI-T0002'})));
    }finally{await page.close();}
  },180000);

  test('Given a real '+host+' browser compiler Worker When IR changes under unchanged source text Then stale edits reject and source projects remain isolated',async()=>{
    const fixture=await fullBrowserProjectFixture(),page=await browser.newPage();
    try{
      await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
      const result=await page.evaluate(async({host,manifestURL})=>{
        const {createBrowserCompiler}=await import('/transport.mjs');
        const check=(value,message)=>{if(!value)throw new Error(message);};
        const compiler=await createBrowserCompiler({host,manifestURL,worker:true});
        const codes=[];
        async function exported(product,project=false){
          const code=project?product.modules.find(item=>item.id==='edit-entry.mjs').javascript:product.javascript;
          const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
          try{return(await import(url)).run();}finally{URL.revokeObjectURL(url);}
        }
        async function refusesStale(request,options){
          let failure;try{await compiler.request(request,options);}catch(error){failure=error;}
          check(failure?.code==='stale-source','IR edit must be rejected by its real source snapshot');codes.push(failure.code);
        }
        try{
          check(compiler.host===host,'the Worker must run the selected artifact');
          const source='; 中😀é\n(defun run () 1) (export run)',filename='same-source.eli';
          const ir=(await compiler.request({operation:'compile-ir',source,filename})).ir;
          const changed=JSON.parse(ir),fn=changed.body.find(node=>node.kind==='function-declaration'&&node.value==='run');
          check(fn?.children.at(-1)?.kind==='literal'&&fn.children.at(-1).value===1,'the edit must address a real compiled literal');
          fn.children.at(-1).value=2;
          const nextIR=JSON.stringify(changed);
          const first={operation:'emit-ir',target:'javascript',ir,source,filename};
          const next={...first,ir:nextIR};
          const before=await compiler.setSource(first,{revision:10});
          check(await exported(await compiler.request(first,{expectedRevision:10,expectedSourceIdentity:before.sourceIdentity}))===1,'original actual IR output');
          const after=await compiler.setSource(next,{revision:11});
          check(before.sourceIdentity!==after.sourceIdentity,'different actual IR with equal source must have different source identity');
          await refusesStale(first,{expectedRevision:10,expectedSourceIdentity:before.sourceIdentity});
          await refusesStale(first,{expectedRevision:11,expectedSourceIdentity:after.sourceIdentity});
          check(await exported(await compiler.request(next,{expectedRevision:11,expectedSourceIdentity:after.sourceIdentity}))===2,'IR ingress must not recompile unchanged source instead');
          const outputChoice=await compiler.setSource({...next,target:'wasm',debug:true},{revision:11});
          check(outputChoice.sourceIdentity===after.sourceIdentity,'output target must not enter source identity');
          const sourceProject={operation:'project',entry:'edit-entry.mjs',target:'javascript',resolveImports:true,
            modules:[{id:'edit-entry.mjs',source,filename}]};
          const projectIR={...sourceProject,operation:'project-ir',modules:[{...sourceProject.modules[0],ir}]};
          const changedProjectIR={...projectIR,modules:[{...projectIR.modules[0],ir:nextIR}]};
          const sourceSnapshot=await compiler.setSource(sourceProject,{revision:70});
          const projectBefore=await compiler.setSource(projectIR,{revision:20});
          const projectAfter=await compiler.setSource(changedProjectIR,{revision:21});
          check(projectBefore.sourceIdentity!==projectAfter.sourceIdentity,'project IR operands enter the true graph identity');
          await refusesStale(projectIR,{expectedRevision:20,expectedSourceIdentity:projectBefore.sourceIdentity});
          check(await exported(await compiler.request(sourceProject,{expectedRevision:70,expectedSourceIdentity:sourceSnapshot.sourceIdentity}),true)===1,'project IR edits must not overwrite the source-project snapshot');
          check(await exported(await compiler.request(changedProjectIR,{expectedRevision:21,expectedSourceIdentity:projectAfter.sourceIdentity}),true)===2,'project IR must execute the edited graph');
          check(await exported(await compiler.request(next,{expectedRevision:11,expectedSourceIdentity:after.sourceIdentity}))===2,'single IR and project IR snapshots remain separate');
          const controller=new AbortController(),reason=new Error('cancel real browser IR request');controller.abort(reason);
          let cancellation;try{await compiler.request(next,{signal:controller.signal});}catch(error){cancellation=error;}
          check(cancellation===reason,'pre-dispatch cancellation preserves the original reason');
          check(await exported(await compiler.request(next,{expectedRevision:11,expectedSourceIdentity:after.sourceIdentity}))===2,'cancelled IR request must leave the current source usable');
        }finally{await compiler.dispose();await compiler.dispose();}
        let closed;try{await compiler.request({operation:'capabilities'});}catch(error){closed=error.message;}
        check(closed==='browser compiler is disposed','closed real IR Worker must reject all further requests');
        return{host:compiler.host,codes,lifetime:compilerLifetimes()};
      },{host,manifestURL:host==='wasm'?fixture.wasmManifest:new URL('/artifact/compiler-artifact.json',server.url).href});
      assert.equal(result.host,host);assert.deepEqual(result.codes,['stale-source','stale-source','stale-source']);
      assert.deepEqual(result.lifetime,{created:1,terminated:1,workers:0,blobs:0});
    }finally{await page.close();}
  },180000);

  for(const operation of ['emit-ir','project-ir','emit-memory-ir'])test('Given an actual posted '+operation+' request in the '+host+' browser compiler Worker When it is cancelled and disposed Then owned resources are released',async()=>{
    const fixture=await fullBrowserProjectFixture(),page=await browser.newPage();
    try{
      await page.goto(server.url.href);await page.evaluate(installBrowserLifetimeCounters);
      const result=await page.evaluate(async({host,manifestURL,operation})=>{
        const {createBrowserCompiler}=await import('/transport.mjs');
        const check=(value,message)=>{if(!value)throw new Error(message);};
        const compiler=await createBrowserCompiler({host,manifestURL,worker:true});
        const previousPost=Worker.prototype.postMessage;
        let resolvePosted,actualPost;
        const posted=new Promise(resolve=>{resolvePosted=resolve;});
        try{
          const source=operation==='emit-memory-ir'?
            '(import "eliscript:memory32" load-u32) (defun read32 (p) (load-u32 p)) (export read32)':
            '(defun run () 42) (export run)';
          const filename='posted-ir.eli',ir=(await compiler.request({operation:'compile-ir',source,filename})).ir;
          const request=operation==='project-ir'?{operation,target:'javascript',entry:'posted.mjs',modules:[{id:'posted.mjs',filename,source,ir}]}:
            {operation,target:operation==='emit-memory-ir'?'wasm':'javascript',filename,source,ir,memory:{initialPages:1,maximumPages:2}};
          await compiler.setSource(request,{revision:100});
          // Observe the real Worker send boundary. Resolve a handshake only
          // after native postMessage succeeds; no sleep, alternate compiler or
          // synthetic Worker response can satisfy this cancellation case.
          Worker.prototype.postMessage=function(message,...transfer){
            const result=Reflect.apply(previousPost,this,[message,...transfer]);
            if(message?.type==='request'&&typeof message.request==='string'&&JSON.parse(message.request).operation===operation){
              actualPost={type:message.type,operation:JSON.parse(message.request).operation};resolvePosted();
            }
            return result;
          };
          const controller=new AbortController(),reason=new Error('cancel posted '+operation);
          const pending=compiler.request(request,{signal:controller.signal});
          const rejected=pending.then(()=>{throw new Error('posted request ignored cancellation');},error=>{
            check(error===reason,'actual cancellation reason must survive');return error.message;
          });
          // Keep an earlier source/transport failure primary if it prevents
          // the post handshake; the cancellation observer must not leak a
          // second unhandled rejection while finally disposes the real Worker.
          void rejected.catch(()=>{});
          await Promise.race([posted,pending.then(()=>{throw new Error('request completed before the actual send handshake');})]);
          controller.abort(reason);const message=await rejected;
          await compiler.dispose();await compiler.dispose();
          check(actualPost?.type==='request'&&actualPost.operation===operation,'the requested IR operation was not actually posted');
          return{host:compiler.host,operation,message,actualPost,lifetime:compilerLifetimes()};
        }finally{Worker.prototype.postMessage=previousPost;await compiler.dispose();}
      },{host,operation,manifestURL:host==='wasm'?fixture.wasmManifest:new URL('/artifact/compiler-artifact.json',server.url).href});
      assert.equal(result.host,host);assert.equal(result.operation,operation);assert.equal(result.message,'cancel posted '+operation);
      assert.deepEqual(result.actualPost,{type:'request',operation});assert.deepEqual(result.lifetime,{created:1,terminated:1,workers:0,blobs:0});
    }finally{await page.close();}
  },180000);
}
