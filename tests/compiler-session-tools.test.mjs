import {beforeAll, afterAll, test, spyOn} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildIndependentCompiler,loadCompilerSources,independentCompilerResources} from '../tools/backends/compiler-build.mjs';
import {createCompilerSession} from '../tools/backends/compiler-session.mjs';

let directory, owned, driver;
const cliPath=resolve('tools/backends/compiler-cli.mjs');
beforeAll(async () => {
  directory = process.env.ELISCRIPT_TEST_COMPILER_SESSION_DIRECTORY;
  if (!directory) {
    owned = await mkdtemp(resolve(tmpdir(), 'eliscript-session-tools-'));
    // End the seed compiler's module-cache lifetime before importing its real
    // emitted driver and building the complete managed compiler in this process.
    const script = 'const {buildIndependentCompiler}=await import(process.argv[1]);'
      + 'const artifact=await buildIndependentCompiler({host:"javascript",outputRoot:process.argv[2]});'
      + 'process.stdout.write(JSON.stringify({host:artifact.host}));';
    const child = spawnSync(process.execPath, [
      ...(process.versions.bun ? ['--smol'] : []), '--input-type=module', '-e', script,
      new URL('../tools/backends/compiler-build.mjs', import.meta.url).href, owned,
    ], {encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.signal, null, child.stderr);
    assert.equal(child.status, 0, child.stderr);
    const artifact = JSON.parse(child.stdout);
    directory = owned;
    assert.equal(artifact.host, 'javascript');
  }
  const manifest = JSON.parse(await readFile(resolve(directory, 'compiler-artifact.json'), 'utf8'));
  assert.equal(manifest.host, 'javascript');
  driver = await import(pathToFileURL(resolve(directory, manifest.path)).href);
}, 120000);
afterAll(async () => {if (owned) await rm(owned, {recursive: true, force: true});});
async function withSession(run) {
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {await run(session);} finally {session.close();}
}
const analyze = (session, source, extra = {}) => session.request({operation: 'analyze', source, filename: 'tools.eli', ...extra});
const query = (session, source, offset, kind = 'symbol', extra = {}) => session.request({
  operation: 'query', source, filename: 'tools.eli', offset, offsetUnit: 'unicode-scalar', query: kind, ...extra,
});
const editPreview = (session, source, identity, edits, extra = {}) => session.request({
  operation: 'edit-preview', filename: 'tools.eli', source, offsetUnit: 'unicode-scalar',
  expectedSourceIdentity: identity, edits, ...extra,
});
function slice(source, span) {return Array.from(source).slice(span.start, span.end).join('');}

const lexical = '(defun outer (x) (let ((x (+ x 1))) (setq x (+ x 2)) x)) (export outer)';
test('real JavaScript compiler sessions expose compile, format and read-only semantic tools', () => withSession(async session => {
  const capabilities = session.request({operation: 'capabilities'});
  for (const name of ['compile', 'compile-ir', 'format', 'analyze', 'query']) assert(capabilities.operations.includes(name));
  const source = '(defun add(x)(+ x 1))(export add)';
  const formatted = session.request({operation: 'format', source, filename: 'format.eli'}).source;
  assert.equal(session.request({operation: 'format', source: formatted, filename: 'format.eli'}).source, formatted);
  const compiled = session.request({operation: 'compile', source, filename: 'format.eli'});
  const module = await import('data:text/javascript;base64,' + Buffer.from(compiled.javascript).toString('base64'));
  assert.equal(module.add(6), 7);
  const program = JSON.parse(session.request({operation: 'compile-ir', source, filename: 'format.eli'}).ir);
  assert.equal(program.filename, 'format.eli');
  assert.equal(analyze(session, source).readOnly, true);
}));

test('tool definitions and references preserve shadowing, initializer scope and assignment roles', () => withSession(session => {
  const report = analyze(session, lexical);assert.equal(report.ok, true);assert.deepEqual(report.diagnostics, []);
  const parameter = report.definitions.find(x => x.kind === 'parameter'), local = report.definitions.find(x => x.kind === 'local');
  assert.notEqual(parameter.id, local.id);
  const references = report.references.filter(x => x.name === 'x');
  assert.deepEqual(references.map(x => [x.role, x.bindingId]), [['read', parameter.id], ['write', local.id], ['read', local.id], ['read', local.id]]);
  for (const item of [...report.definitions, ...report.references]) assert.equal(slice(lexical, item.span), item.name);
  for (const reference of references) {
    const found = query(session, lexical, reference.span.start, 'definition');
    assert.equal(found.query.result.id, reference.bindingId);
  }
  assert.deepEqual(query(session, lexical, local.span.start, 'references').query.result.map(x => x.role), ['write', 'read', 'read']);
}));

test('parallel and sequential local bindings retain their distinct actual scopes', () => withSession(session => {
  for (const [operator, expected] of [['let', 'parameter'], ['let*', 'local']]) {
    const source = `(defun run (x) (${operator} ((x 3) (y x)) (+ x y))) (export run)`;
    const report = analyze(session, source);assert.equal(report.ok, true);
    const declaration = report.definitions.find(x => x.name === 'x' && x.kind === expected);
    const initializer = report.references.find(x => x.name === 'x');
    assert.equal(initializer.bindingId, declaration.id);
  }
}));

test('Unicode scalar queries preserve exact source spans and reject invalid units or offsets', () => withSession(session => {
  const source = '; 😀\n(defun 名 (值) 值) (export 名)';
  const report = analyze(session, source);assert.equal(report.ok, true);
  const reference = report.references.find(x => x.name === '值');
  assert.equal(reference.span.start, Array.from(source.slice(0, source.lastIndexOf('值'))).length);
  assert.equal(slice(source, reference.span), '值');
  assert.equal(query(session, source, reference.span.start, 'definition').query.result.name, '值');
  assert.equal(query(session, source, Array.from(source).length).query.result, null);
  assert.equal(query(session, source, 0).query.result, null);
  for (const extra of [{offset: -1}, {offset: 1.5}, {offset: Number.MAX_SAFE_INTEGER}, {offsetUnit: 'utf16'}, {query: 'guess'}]) {
    const failure = query(session, source, 0, 'symbol', extra);
    assert.equal(failure.ok, false);assert.equal(failure.readOnly, true);
    assert.equal(failure.diagnostics[0].code, 'ELI-T0001');
  }
}));

test('macro invocation links to its definition while generated references retain truthful expansion origins', () => withSession(session => {
  const source = '(defmacro twice (x) `(+ ,x ,x)) (defun run (a) (twice a)) (export run)';
  const report = analyze(session, source);assert.equal(report.ok, true);
  const definition = report.definitions.find(x => x.kind === 'macro'), call = report.references.find(x => x.role === 'macro-expansion');
  assert.equal(slice(source, call.span), 'twice');assert.equal(call.bindingId, definition.id);
  assert.equal(query(session, source, call.span.start, 'definition').query.result.id, definition.id);
  const generated = report.references.filter(x => x.name === 'a');assert.equal(generated.length, 2);
  for (const item of generated) {
    assert.equal(item.generated, true);assert.equal(item.span, null);
    assert.equal(item.macroOrigin.macroName, 'twice');assert.equal(item.macroOrigin.trace[0].status, 'expanded');
  }
  assert.equal(report.macroExpansionTraceAvailable, true);assert.equal(report.macroExpansions.length, 1);
}));

test('read and analysis failures return the actual stable diagnostics and leave the session usable', () => withSession(session => {
  for (const source of ['(defun broken (', '(defun broken () missing)']) {
    const result = analyze(session, source);assert.equal(result.ok, false);assert.equal(result.readOnly, true);
    assert.equal(result.diagnostics.length, 1);assert.equal(result.diagnostics[0].location.file, 'tools.eli');
    assert.match(result.diagnostics[0].code, /^ELI-[RA]/);assert.deepEqual(result.definitions, []);
  }
  assert.equal(analyze(session, lexical).ok, true);
  assert.throws(() => session.request({operation: 'analyze', source: lexical, filename: 1}), error => error.eliscriptDiagnostic?.code === 'ELI-T0001');
  assert.equal(analyze(session, lexical).ok, true);
}));

test('tool requests preserve cached runtime and project revision state', () => withSession(session => {
  const request = {operation: 'project', target: 'javascript', entry: 'entry.mjs', modules: [{id: 'entry.mjs', source: '(defun run () 9) (export run)'}]};
  const first = session.request(request);
  const before = session.request({operation: 'cached-ir', kind: 'module', id: 'entry.mjs', revision: first.revision});
  analyze(session, lexical);query(session, lexical, 14, 'references');
  const after = session.request({operation: 'cached-ir', kind: 'module', id: 'entry.mjs', revision: first.revision});
  assert.deepEqual(after, before);
  const repeated = session.request(request);assert.equal(repeated.revision, first.revision);
}));

for (const filename of ['tests/fixtures/core-expression-forms.eli', 'tests/fixtures/core-language-api-usage.eli',
  'tests/fixtures/core-stdlib-usage.eli', 'tests/fixtures/wasm-managed-source-collections.eli',
  'tests/fixtures/managed-stdlib-value-json.eli']) {
  test('production tools analyze complete existing fixture ' + filename, () => withSession(async session => {
    const source = await readFile(filename, 'utf8');
    const report = analyze(session, source, {filename});
    assert.equal(report.ok, true, JSON.stringify(report.diagnostics));assert.deepEqual(report.diagnostics, []);
    assert(report.definitions.length > 0);
    for (const record of [...report.definitions, ...report.references]) {
      if (record.span) assert.equal(slice(source, record.span), record.name);
      else assert.equal(record.generated, true);
    }
    const definition = report.definitions.find(x => x.span);assert(definition);
    const selected = query(session, source, definition.span.start, 'definition', {filename});
    assert.equal(selected.query.result.id, definition.id);
  }));
}

test('abort boundaries and close use the actual production compiler session lifecycle', async () => {
  const session = await createCompilerSession({host: 'javascript', compiler: driver});
  try {
    const reason = new Error('cancel tools'), control = new AbortController();control.abort(reason);
    assert.throws(() => session.request({operation: 'analyze', source: lexical}, {signal: control.signal}), error => error === reason);
    assert.equal(analyze(session, lexical).ok, true);
  } finally {session.close();}
  assert.equal(session.closed, true);session.close();
  assert.throws(() => session.request({operation: 'capabilities'}), /closed/);
});

async function withBackendPhaseTrace(run) {
  if (process.env.ELISCRIPT_TEST_TRACE_BACKEND_PHASES !== '1') return run();
  const spies=[];
  let records=0;
  function lengths(value) {
    if (typeof value==='string') return {stringUnits:value.length};
    if (Array.isArray(value)) return {items:value.length};
    if (ArrayBuffer.isView(value)) return {byteLength:value.byteLength};
    const result={};
    if (value && typeof value==='object') {
      for (const key of ['body','functions','modules']) if (Array.isArray(value[key])) result[key+'Length']=value[key].length;
      if (Array.isArray(value.program?.body)) result.programBodyLength=value.program.body.length;
      if (Array.isArray(value.typed?.functions)) result.typedFunctionsLength=value.typed.functions.length;
      if (ArrayBuffer.isView(value.bytes)) result.byteLength=value.bytes.byteLength;
    }
    return result;
  }
  function record(phase,event,values=[]) {
    // No sources, IR serialization, error messages or retained graph snapshots.
    // Observation failure must not replace an actual backend result/error.
    try {
      if (records++>=64) return;
      const memory=process.memoryUsage();
      process.stderr.write('[backend-phase] '+JSON.stringify({phase,event,
        lengths:values.slice(0,4).map(lengths),
        memory:{rss:memory.rss,heapUsed:memory.heapUsed,external:memory.external,arrayBuffers:memory.arrayBuffers}})+'\n');
    } catch {}
  }
  function clearHistory() {
    // Spies must not keep large arguments/results alive between backend phases.
    // Bun records a return again after the wrapper exits; the next phase's
    // entry clears that result, and the final cleanup clears the last return.
    for (const spy of spies) try {spy.mockClear();} catch {}
  }
  try {
    const hooks=[['managed','lower_managed_project'],['managed','link_managed_project'],
      ['memory','lower_memory_program'],['wasm','emit_typed_memory_wasm'],
      ['wasm','emit_managed_ir_wasm_product'],['wasm','emit_managed_project_wasm_product'],
      ['wasm','append_metadata_section'],['capabilities','prepare_host_capabilities']];
    for (const [module,name] of hooks) {
      const namespace=await import(pathToFileURL(resolve(directory,'backends',module+'.mjs')).href);
      const original=namespace[name];
      assert.equal(typeof original,'function','trace requires the actual built backend export '+name);
      const spy=spyOn(namespace,name);
      spies.push(spy);
      spy.mockImplementation(function(...args) {
        clearHistory();record(name,'enter',args);
        try {
          const result=Reflect.apply(original,this,args);
          record(name,'return',[result]);return result;
        } catch (error) {
          record(name,'throw');throw error;
        } finally {clearHistory();}
      });
    }
    // A function's direct call to a local lexical binding may bypass an ESM
    // export spy. Missing nested events therefore never prove a phase absent.
    record('esm_exports_only_local_calls_may_bypass','coverage');
    record('buildIndependentCompiler','enter');
    try {const result=await run();record('buildIndependentCompiler','return',[result]);return result;}
    catch(error){record('buildIndependentCompiler','throw');throw error;}
  } finally {
    clearHistory();
    for (let index=spies.length-1;index>=0;index--) spies[index].mockRestore();
  }
}

const aggregateSource=(sessionModule='./host/compiler-session.mjs')=>`(import ${JSON.stringify(sessionModule)} :as Original)
 (defun compiler-session-new () (js-call Original :compiler_session_new))
 (defun compiler-session-close (state) (js-call Original :compiler_session_close state))
 (defun compiler-session-request (state request-json)
  (let ((request (JSON/parse request-json)))
   (if (= (get request :operation) "transport-aggregate")
    (let* ((diagnostic (js-object :code "ELI-H0001" :phase "compiler-session" :message "aggregate boundary"))
           (child (new globalThis.TypeError "shared child" (js-object :cause -0.0)))
           (inner (new globalThis.AggregateError (js-array child) "inner" (js-object :cause child)))
           (failure (new globalThis.AggregateError (js-array child child inner undefined false) "outer" (js-object :cause child))))
     (put child :stack "TypeError: shared child\\n    at original.eli:3:7")
     (put child :eliscriptDiagnostic diagnostic)
     (put child :code "ELI-H0001")
     (put child :diagnostics (js-array diagnostic))
     (put child :macroOrigins (js-array (js-object :macroName "twice" :file "macro.eli")))
     (put child :eliscriptFrames (js-array (js-object :function "compile" :instruction 7)))
     (put child :eliscriptSourceFrames (js-array (js-object :file "original.eli" :line 3 :column 7)))
     (when (= (get request :undefinedCause false) t) (put child :cause undefined))
     (throw failure))
    (js-call Original :compiler_session_request state request-json))))
 (export compiler-session-new compiler-session-request compiler-session-close)`;
const aggregateEntry=aggregateSource();


test('a complete real managed compiler driver transports AggregateError graphs with shared errors and cause identity',async()=>{
  const producer=await createCompilerSession({host:'javascript',compiler:driver});
  let managed,oracle,temporary;
  try{
    temporary=await mkdtemp(resolve(tmpdir(),'eliscript-session-aggregate-'));
    const sources=await loadCompilerSources();
    assert.equal(sources.modules.filter(module=>module.id.startsWith('bootstrap/')).length,13);
    sources.modules.push({id:'aggregate-entry.mjs',filename:'aggregate-entry.eli',source:aggregateEntry});
    sources.entry='aggregate-entry.mjs';
    // The reference uses the same source with its one dependency resolved to
    // the already built driver. Loading a data module avoids a stale directory
    // lookup in a directory the engine has already imported; no compiler
    // implementation or error graph is replaced.
    const oracleSource=aggregateSource(pathToFileURL(resolve(directory,'host/compiler-session.mjs')).href);
    const javascript=producer.request({operation:'compile',source:oracleSource,filename:'aggregate-entry.eli'}).javascript;
    const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
    oracle=await createCompilerSession({host:'javascript',compiler:reference});
    const artifact=await withBackendPhaseTrace(()=>buildIndependentCompiler({host:'wasm',outputRoot:temporary,session:producer,sources}));
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact.bytes)),[]);
    assert.deepEqual(artifact.provenance.compiledModuleIds,sources.modules.map(module=>module.id));
    assert.equal(artifact.provenance.runtimeCompiled,true);
    const resources=independentCompilerResources();
    managed=await createCompilerSession({host:'wasm',bytes:artifact.bytes,memory:resources.memory,options:{...resources.budget,auto:resources.auto}});
    function caught(session,request){try{session.request(request);assert.fail('expected source AggregateError');}catch(error){return error;}}
    function check(error,expected){
      assert(error instanceof AggregateError);assert.equal(error.name,expected.name);assert.equal(error.message,expected.message);
      assert.equal(error.errors.length,5);assert(error.errors[0] instanceof TypeError);
      assert.equal(error.errors[0],error.cause);assert.equal(error.errors[1],error.cause);
      assert(error.errors[2] instanceof AggregateError);assert.equal(error.errors[2].message,'inner');
      assert.equal(error.errors[2].errors[0],error.cause);assert.equal(error.errors[2].cause,error.cause);
      assert.equal(error.errors[3],undefined);assert.equal(error.errors[4],false);
      assert.equal(Object.getOwnPropertyDescriptor(error,'errors').enumerable,false);
      assert.equal(Object.getOwnPropertyDescriptor(error,'cause').enumerable,false);
      const child=error.cause,original=expected.cause;
      assert.equal(Object.hasOwn(child,'cause'),true);assert(Object.is(child.cause,original.cause));
      assert.equal(child.stack,original.stack);
      for(const key of['code','eliscriptDiagnostic','diagnostics','macroOrigins','eliscriptFrames','eliscriptSourceFrames'])assert.deepEqual(child[key],original[key],key);
    }
    for(const undefinedCause of[false,true,false]){
      const request={operation:'transport-aggregate',undefinedCause};check(caught(managed,request),caught(oracle,request));
      const source='(defun recovered (x) (+ x 1)) (export recovered)';
      assert.deepEqual(managed.request({operation:'compile',source,filename:'recovered.eli'}),oracle.request({operation:'compile',source,filename:'recovered.eli'}));
    }
    managed.close();assert.equal(managed.closed,true);managed.close();
    assert.throws(()=>managed.request({operation:'capabilities'}),/closed/);
  }finally{
    let failed=false,failure;
    for(const session of[managed,oracle,producer])try{session?.close();}catch(error){if(!failed){failed=true;failure=error;}}
    if(temporary)await rm(temporary,{recursive:true,force:true});
    if(failed)throw failure;
  }
},120000);

test('the real compiler CLI emits structured source failures and preserves successful output with the same built artifact',()=>withSession(async session=>{
  const metadata=resolve(directory,'compiler-artifact.json');
  for(const [index,source]of ['; 😀\n(defun broken (','(defmacro broken () missing)\n(broken)'].entries()){
    const input=resolve(directory,'cli-bad-'+index+'.eli');await writeFile(input,source);
    let original;try{session.request({operation:'compile',source,filename:input});assert.fail('expected original compiler failure');}catch(error){original=error;}
    assert(original.eliscriptDiagnostic);
    const child=spawnSync('node',[cliPath,'compile','--compiler-artifact',metadata,'--input',input,'--target','javascript','--json-errors'],{encoding:'utf8',timeout:10000});
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,1);assert.equal(child.stdout,'');
    const result=JSON.parse(child.stderr);assert.equal(result.format,'eliscript-compiler-cli-error');assert.equal(result.version,1);
    assert.equal(result.error.name,original.name);assert.equal(result.error.message,original.message);
    for(const key of ['eliscriptDiagnostic','diagnostics','macroOrigins','code'])assert.deepEqual(result.error[key],original[key],key);
    assert.equal(result.error.eliscriptDiagnostic.location.file,input);
  }
  const source='(defun recovered (x) (+ x 1)) (export recovered)',input=resolve(directory,'cli-recovered.eli');await writeFile(input,source);
  const child=spawnSync('node',[cliPath,'compile','--compiler-artifact',metadata,'--input',input,'--target','javascript','--json-errors'],{encoding:'utf8',timeout:10000});
  assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
  assert.equal(child.stdout,session.request({operation:'compile',source,filename:input}).javascript);
}),30000);

test('real CLI streaming UTF8 preserves split astral scalars BOM diagnostics and strict malformed-tail failures',()=>withSession(async session=>{
  const metadata=resolve(directory,'compiler-artifact.json'),source='; 中😀\n(defun run () "中😀") (export run)',bytes=Buffer.from(source);
  const at=bytes.indexOf(Buffer.from('😀')),chunks=[bytes.subarray(0,at+1),bytes.subarray(at+1,at+2),bytes.subarray(at+2,at+3),bytes.subarray(at+3)];
  const input=resolve(directory,'cli-stream.eli');await writeFile(input,bytes);
  function stream(parts){
    const script='import{Readable}from"node:stream";const{main}=await import('+JSON.stringify(pathToFileURL(cliPath).href)+');Object.defineProperty(process,"stdin",{value:Readable.from('+JSON.stringify(parts.map(part=>part.toString('hex')))+'.map(hex=>Buffer.from(hex,"hex")))});await main('+JSON.stringify(['compile','--compiler-artifact',metadata,'--input','-','--target','javascript','--json-errors'])+');';
    return spawnSync('node',['--input-type=module','-e',script],{encoding:'utf8',timeout:10000});
  }
  const file=spawnSync('node',[cliPath,'compile','--compiler-artifact',metadata,'--input',input,'--target','javascript','--json-errors'],{encoding:'utf8',timeout:10000});
  for(const child of[file,stream([bytes]),stream(chunks)]){
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
    assert.equal(child.stdout,file.stdout);assert.equal(child.stdout,session.request({operation:'compile',source,filename:'<stdin>'}).javascript);
  }
  const bomSource='\ufeff'+source,bom=Buffer.from(bomSource),bomInput=resolve(directory,'cli-stream-bom.eli');await writeFile(bomInput,bom);
  const bomAt=bom.indexOf(Buffer.from('😀'))+2;
  const bomFile=spawnSync('node',[cliPath,'compile','--compiler-artifact',metadata,'--input',bomInput,'--target','javascript','--json-errors'],{encoding:'utf8',timeout:10000});
  const bomOutcomes=[];
  for(const [child,filename]of [[bomFile,bomInput],[stream([bom]),'<stdin>'],[stream([bom.subarray(0,1),bom.subarray(1,bomAt),bom.subarray(bomAt)]),'<stdin>']]){
    let original,output;try{output=session.request({operation:'compile',source:bomSource,filename}).javascript;}catch(error){original=error;}
    assert.equal(child.error,undefined);assert.equal(child.signal,null);
    if(original){
      assert.equal(child.status,1);assert.equal(child.stdout,'');const record=JSON.parse(child.stderr);
      assert.equal(record.format,'eliscript-compiler-cli-error');assert.equal(record.error.message,original.message);
      assert.deepEqual(record.error.eliscriptDiagnostic,original.eliscriptDiagnostic);
      bomOutcomes.push({name:record.error.name,location:record.error.eliscriptDiagnostic?.location.start});
    }else{assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');assert.equal(child.stdout,output);bomOutcomes.push({javascript:child.stdout});}
  }
  assert.deepEqual(bomOutcomes[0],bomOutcomes[1]);assert.deepEqual(bomOutcomes[1],bomOutcomes[2]);
  const malformed='; 😀\n(defun broken (',bad=Buffer.from(malformed),split=bad.indexOf(Buffer.from('😀'))+2;
  const failure=stream([bad.subarray(0,split),bad.subarray(split)]);
  assert.equal(failure.error,undefined);assert.equal(failure.signal,null);assert.equal(failure.status,1);assert.equal(failure.stdout,'');
  let expected;try{session.request({operation:'compile',source:malformed,filename:'<stdin>'});assert.fail('expected reader failure');}catch(error){expected=error;}
  const diagnostic=JSON.parse(failure.stderr);assert.equal(diagnostic.format,'eliscript-compiler-cli-error');assert.equal(diagnostic.version,1);
  assert.deepEqual(diagnostic.error.eliscriptDiagnostic,expected.eliscriptDiagnostic);
  const tail=Buffer.concat([Buffer.from('\ufeff; 😀\n'),Buffer.from([0xf0,0x9f,0x98])]),invalid=stream([tail.subarray(0,-2),tail.subarray(-2)]);
  assert.equal(invalid.error,undefined);assert.equal(invalid.signal,null);assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');
  const strict=JSON.parse(invalid.stderr);assert.equal(strict.format,'eliscript-compiler-cli-error');assert.equal(strict.version,1);assert.equal(strict.error.name,'TypeError');
  let decoding;try{new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(tail);}catch(error){decoding=error;}
  assert(decoding);assert.equal(strict.error.message,decoding.message);assert.equal(strict.error.code,decoding.code);
}),30000);

test('optional parameter defaults resolve in the enclosing scope before any required optional or rest parameter enters the function scope',()=>withSession(session=>{
  const source=`(defun outer (seed)
    (lambda (seed &optional plain {:strs [selected]
      :or {selected (progn (setq seed (+ seed 1)) (lambda () seed))}}
      &rest remaining)
      (setq plain (+ seed 2))
      (js-array plain (funcall selected) remaining))) (export outer)`;
  const report=analyze(session,source);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
  const seeds=report.definitions.filter(item=>item.kind==='parameter'&&item.name==='seed');
  assert.equal(seeds.length,2);
  const [outerSeed,innerSeed]=seeds;
  const references=report.references.filter(item=>item.name==='seed');
  assert.deepEqual(references.map(item=>[item.role,item.bindingId]),[
    ['write',outerSeed.id],['read',outerSeed.id],['read',outerSeed.id],['read',innerSeed.id],
  ]);
  const plain=report.definitions.find(item=>item.kind==='parameter'&&item.name==='plain');
  const selected=report.definitions.find(item=>item.kind==='parameter'&&item.name==='selected');
  const remaining=report.definitions.find(item=>item.kind==='parameter'&&item.name==='remaining');
  assert(plain&&selected&&remaining);
  assert.deepEqual(report.references.filter(item=>item.name==='plain').map(item=>[item.role,item.bindingId]),[['write',plain.id],['read',plain.id]]);
  assert.deepEqual(report.references.filter(item=>item.name==='selected').map(item=>item.bindingId),[selected.id]);
  assert.deepEqual(report.references.filter(item=>item.name==='remaining').map(item=>item.bindingId),[remaining.id]);
  for(const record of [...report.definitions,...report.references]){
    assert.equal(record.generated,false);assert.equal(record.macroOrigin,null);
    assert.equal(slice(source,record.span),record.name);
  }
  for(const reference of references)assert.equal(query(session,source,reference.span.start,'definition').query.result.id,reference.bindingId);
  assert.deepEqual(query(session,source,outerSeed.span.start,'references').query.result.map(item=>item.role),['write','read','read']);
  assert.deepEqual(query(session,source,remaining.span.start,'references').query.result.map(item=>item.name),['remaining']);
}));

test('nested optional vector and map bindings preserve qualified local suffix spans rest bindings and actual write targets',()=>withSession(session=>{
  const source=`; 😀 supplementary prefix before every measured span
  (defun 外层函数 (外层)
    (lambda (外层 &optional [{:keys [域😀/值] :or {值 (progn (setq 外层 (+ 外层 1)) 外层)} :as 行} nil &rest 尾]
      &rest 参数)
      (setq 值 (+ 值 1) 尾 参数)
      (js-array 值 尾 行 外层 参数))) (export 外层函数)`;
  const report=analyze(session,source);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
  const outer=report.definitions.filter(item=>item.kind==='parameter'&&item.name==='外层');assert.equal(outer.length,2);
  const value=report.definitions.find(item=>item.kind==='parameter'&&item.name==='值');
  const tail=report.definitions.find(item=>item.kind==='parameter'&&item.name==='尾');
  const rest=report.definitions.find(item=>item.kind==='parameter'&&item.name==='参数');
  const original=report.definitions.find(item=>item.kind==='parameter'&&item.name==='行');
  assert(value&&tail&&rest&&original);
  for(const record of [...report.definitions,...report.references]){
    assert.equal(record.generated,false);assert.equal(record.macroOrigin,null);assert.equal(slice(source,record.span),record.name);
  }
  const qualifiedAt=source.indexOf('域😀/值'),suffixAt=qualifiedAt+'域😀/'.length;
  assert.equal(value.span.start,Array.from(source.slice(0,suffixAt)).length);
  assert.equal(value.span.end,value.span.start+1);
  assert.equal(query(session,source,Array.from(source.slice(0,qualifiedAt)).length,'symbol').query.result,null,'a namespace prefix is not a declaration of the local name');
  assert.equal(query(session,source,value.span.start,'definition').query.result.id,value.id);
  assert.equal(query(session,source,value.span.start,'symbol').query.result.value.name,'值');
  assert.deepEqual(report.references.filter(item=>item.name==='外层').map(item=>[item.role,item.bindingId]),[
    ['write',outer[0].id],['read',outer[0].id],['read',outer[0].id],['read',outer[1].id],
  ]);
  assert.deepEqual(report.references.filter(item=>item.name==='值').map(item=>[item.role,item.bindingId]),[['write',value.id],['read',value.id],['read',value.id]]);
  assert.deepEqual(report.references.filter(item=>item.name==='尾').map(item=>[item.role,item.bindingId]),[['write',tail.id],['read',tail.id]]);
  assert.deepEqual(report.references.filter(item=>item.name==='参数').map(item=>item.bindingId),[rest.id,rest.id]);
  assert.deepEqual(query(session,source,tail.span.start,'references').query.result.map(item=>item.role),['write','read']);
}));

test('macros in unexpanded parameter patterns retain the original compiler refusal without invented semantic references',()=>withSession(session=>{
  const source=`(defmacro twice-default (value) \`(progn ,value ,value))
    (defun outer (seed)
      (lambda (&optional {:strs [value] :or {value (twice-default seed)}}) value))
    (export outer)`;
  let original;
  try{session.request({operation:'compile',source,filename:'tools.eli'});}
  catch(error){original=error.eliscriptDiagnostic;}
  assert(original,'the language compiler must provide its actual refusal');
  assert.equal(original.code,'ELI-A0001');assert.equal(original.message,'unbound symbol: twice-default');
  const report=analyze(session,source);
  assert.equal(report.ok,false);assert.deepEqual(report.diagnostics,[original]);
  assert.deepEqual(report.definitions,[]);assert.deepEqual(report.references,[]);
  const recovered=analyze(session,'(defun recovered (x) x) (export recovered)');
  assert.equal(recovered.ok,true);
}));

test('parameter default queries preserve existing analyzer refusals and never invent references or new optional syntax',()=>withSession(session=>{
  for(const source of [
    '(defun run (&optional (value 1)) value)',
    '(defun run (seed &optional {:strs [value] :or {value seed}}) value)',
    '(defun run (&rest [tail]) tail)',
  ]){
    const report=analyze(session,source);assert.equal(report.ok,false);assert.deepEqual(report.definitions,[]);assert.deepEqual(report.references,[]);
    assert.match(report.diagnostics[0].code,/^ELI-A/);
  }
  const source='(defun run (first &optional optional &rest rest) (setq optional first) (js-array optional rest)) (export run)';
  const report=analyze(session,source);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
  const definitions=new Map(report.definitions.filter(item=>item.kind==='parameter').map(item=>[item.name,item]));
  assert.deepEqual([...definitions.keys()],['first','optional','rest']);
  assert.deepEqual(report.references.map(item=>[item.name,item.role,item.bindingId]),[
    ['optional','write',definitions.get('optional').id],['first','read',definitions.get('first').id],
    ['optional','read',definitions.get('optional').id],['rest','read',definitions.get('rest').id],
    ['run','read',report.definitions.find(item=>item.name==='run').id],
  ]);
  for(const item of [...definitions.values(),...report.references])assert.equal(slice(source,item.span),item.name);
}));


test('Given nested empty and unrelated scopes When semantic tools resolve captures Then outer reads writes shadowing and unknown globals remain exact',()=>withSession(session=>{
  const source=`(defun outer (root)
    (lambda () (let ((unrelated 1))
      (lambda () (setq root (+ root unrelated)) root)))) (export outer)`;
  const report=analyze(session,source);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
  const root=report.definitions.find(item=>item.name==='root');
  const unrelated=report.definitions.find(item=>item.name==='unrelated');
  assert(root&&unrelated);
  const roots=report.references.filter(item=>item.name==='root');
  assert.deepEqual(roots.map(item=>[item.role,item.bindingId]),[['write',root.id],['read',root.id],['read',root.id]]);
  assert.deepEqual(report.references.filter(item=>item.name==='unrelated').map(item=>item.bindingId),[unrelated.id]);
  for(const reference of [...roots,...report.references.filter(item=>item.name==='unrelated')]){
    assert.equal(slice(source,reference.span),reference.name);
    assert.equal(query(session,source,reference.span.start,'definition').query.result.id,reference.bindingId);
  }
  const shadow='(defun outer (x) (lambda () (let ((x 2)) (lambda () x)))) (export outer)';
  const nested=analyze(session,shadow);assert.equal(nested.ok,true);
  const local=nested.definitions.find(item=>item.name==='x'&&item.kind==='local');
  assert.deepEqual(nested.references.filter(item=>item.name==='x').map(item=>item.bindingId),[local.id]);
}));

test('Given exact UTF16 source When semantic tools identify it Then SHA256 includes BOM astral and unmatched surrogate units',()=>withSession(session=>{
  for(const units of [0,1,2,26,27,28,29,30,31,32,33,55,56,63,64,65,127,128]){
    const source=';'+('a'.repeat(units))+'😀\ud800\udc00\ud800X\udc00';
    const report=analyze(session,source);
    assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
    assert.deepEqual(report.sourceIdentity,{format:'eliscript-source-identity',version:1,
      encoding:'utf16le',filename:'tools.eli',units:source.length,
      sha256:createHash('sha256').update(Buffer.from(source,'utf16le')).digest('hex')});
    assert.deepEqual(query(session,source,0).sourceIdentity,report.sourceIdentity);
  }
  for(const source of ['', '\ufeff; 😀','(defun broken (','(defun broken () missing)']){
    const report=analyze(session,source);
    assert.equal(report.sourceIdentity.sha256,createHash('sha256').update(Buffer.from(source,'utf16le')).digest('hex'));
    assert.equal(report.sourceIdentity.units,source.length);
  }
}));

test('Given an older semantic result When source or filename changes Then queries and edit previews reject its identity before parsing',()=>withSession(session=>{
  const report=analyze(session,lexical),identity=report.sourceIdentity;
  const changed=lexical+' ; a new snapshot';
  for(const request of [
    {operation:'query',source:changed,filename:'tools.eli',offset:0,offsetUnit:'unicode-scalar'},
    {operation:'analyze',source:'(',filename:'tools.eli'},
    {operation:'query',source:lexical,filename:'other.eli',offset:0,offsetUnit:'unicode-scalar'},
    {operation:'edit-preview',source:changed,filename:'tools.eli',offsetUnit:'unicode-scalar',edits:[]},
  ]){
    const failed=session.request({...request,expectedSourceIdentity:identity});
    assert.equal(failed.ok,false);assert.equal(failed.readOnly,true);
    assert.equal(failed.diagnostics[0].code,'ELI-T0002');
    assert.deepEqual(failed.definitions,[]);assert.deepEqual(failed.references,[]);
  }
  for(const expected of [null,[],{},'old',{...identity,sha256:'0'.repeat(64)},{...identity,units:identity.units+1}]){
    assert.equal(analyze(session,lexical,{expectedSourceIdentity:expected}).diagnostics[0].code,'ELI-T0002');
  }
  assert.equal(analyze(session,lexical,{expectedSourceIdentity:identity}).ok,true);
  assert.deepEqual(analyze(session,lexical).sourceIdentity,identity);
}));

test('Given Unicode source and disjoint original scalar ranges When previewing a complete edit batch Then text and subsequent full analysis are exact',()=>withSession(async session=>{
  const source='; 😀\ud800\n(defun run (值) (+ 值 1)) (export run)';
  const original=analyze(session,source);assert.equal(original.ok,true);
  const scalars=Array.from(source),positions=[];
  for(let index=0;index<scalars.length;index++)if(scalars[index]==='值')positions.push(index);
  const one=scalars.indexOf('1');
  const edits=[...positions.map(start=>({start,end:start+1,text:'参数'})),
    {start:one,end:one+1,text:'2'},{start:scalars.length,end:scalars.length,text:'\n; 完成😀'}];
  const snapshot=structuredClone(edits),preview=editPreview(session,source,original.sourceIdentity,edits);
  assert.equal(preview.ok,true);assert.equal(preview.readOnly,true);
  assert.equal(preview.source,'; 😀\ud800\n(defun run (参数) (+ 参数 2)) (export run)\n; 完成😀');
  assert.deepEqual(edits,snapshot);assert.deepEqual(preview.previousSourceIdentity,original.sourceIdentity);
  assert.notDeepEqual(preview.sourceIdentity,original.sourceIdentity);
  const next=analyze(session,preview.source,{expectedSourceIdentity:preview.sourceIdentity});
  for(const item of [...next.definitions,...next.references])if(item.span)assert.equal(slice(preview.source,item.span),item.name);
  const first=session.request({operation:'compile',source:preview.source,filename:'tools.eli'});
  const module=await import('data:text/javascript;base64,'+Buffer.from(first.javascript).toString('base64'));
  assert.equal(module.run(40),42);
  session.close();
  await withSession(fresh=>{
    assert.deepEqual(next,analyze(fresh,preview.source));
    assert.deepEqual(first,fresh.request({operation:'compile',source:preview.source,filename:'tools.eli'}));
  });
}));

test('Given insertion deletion EOF and unmatched UTF16 units When previewing edits Then scalar addressing never splits an original surrogate pair',()=>withSession(session=>{
  const source='😀a\ud800b\udc00',identity=analyze(session,source).sourceIdentity;
  const preview=editPreview(session,source,identity,[
    {start:0,end:1,text:'X'}, {start:1,end:2,text:''},
    {start:2,end:2,text:'😀'}, {start:3,end:4,text:'Y'}, {start:5,end:5,text:'!'},
  ]);
  assert.equal(preview.ok,true);assert.equal(preview.source,'X😀\ud800Y\udc00!');
  assert.equal(preview.sourceIdentity.sha256,createHash('sha256').update(Buffer.from(preview.source,'utf16le')).digest('hex'));
  const unchanged=editPreview(session,source,identity,[]);
  assert.equal(unchanged.source,source);assert.deepEqual(unchanged.sourceIdentity,identity);
}));

test('Given malformed ambiguous or overlapping edit batches When previewing Then the whole request refuses without publishing partial text',()=>withSession(session=>{
  const identity=analyze(session,lexical).sourceIdentity;
  const batches=[null,{},[null],[[]],[{}],
    [{start:-1,end:0,text:''}],[{start:1.5,end:2,text:''}],[{start:2,end:1,text:''}],
    [{start:0,end:lexical.length+1,text:''}],[{start:0,end:1,text:1}],
    [{start:2,end:5,text:'x'},{start:4,end:6,text:'y'}],
    [{start:2,end:2,text:'x'},{start:2,end:2,text:'y'}],
    [{start:3,end:3,text:'x'},{start:1,end:1,text:'y'}]];
  for(const edits of batches){
    const failure=editPreview(session,lexical,identity,edits);
    assert.equal(failure.ok,false);assert.equal(failure.readOnly,true);
    assert.equal(failure.diagnostics[0].code,'ELI-T0001');assert.equal(Object.hasOwn(failure,'source'),false);
  }
  for(const extra of [{offsetUnit:'utf16'},{offsetUnit:null},{expectedSourceIdentity:undefined}]){
    assert.equal(editPreview(session,lexical,identity,[],extra).ok,false);
  }
  assert.deepEqual(analyze(session,lexical).sourceIdentity,identity);
}));

test('Given macro and lexical tools results When previewing without publishing Then compiler caches and full-analysis origins stay isolated',()=>withSession(async session=>{
  const request={operation:'project',target:'javascript',entry:'entry.mjs',modules:[{id:'entry.mjs',source:'(defun run () 9) (export run)'}]};
  const compiled=session.request(request);
  const before=session.request({operation:'cached-ir',kind:'module',id:'entry.mjs',revision:compiled.revision});
  const source='(defmacro twice (x) `(+ ,x ,x)) (defun run (a) (twice a)) (export run)';
  const original=analyze(session,source),at=Array.from(source.slice(0,source.lastIndexOf('twice'))).length;
  const preview=editPreview(session,source,original.sourceIdentity,[{start:at,end:at+5,text:'twice'}]);
  assert.equal(preview.ok,true);assert.deepEqual(preview.sourceIdentity,original.sourceIdentity);
  const next=analyze(session,preview.source,{expectedSourceIdentity:preview.sourceIdentity});
  assert.equal(next.macroExpansions.length,1);assert.equal(next.references.filter(item=>item.generated&&item.name==='a').length,2);
  assert.deepEqual(session.request({operation:'cached-ir',kind:'module',id:'entry.mjs',revision:compiled.revision}),before);
  assert.equal(session.request(request).revision,compiled.revision);
  const control=new AbortController(),reason=new Error('cancel edit preview');control.abort(reason);
  assert.throws(()=>session.request({operation:'edit-preview',filename:'tools.eli',source,offsetUnit:'unicode-scalar',
    expectedSourceIdentity:original.sourceIdentity,edits:[]},{signal:control.signal}),error=>error===reason);
  assert.deepEqual(analyze(session,source),original);
  session.close();
  await withSession(fresh=>assert.deepEqual(next,analyze(fresh,source)));
}));
