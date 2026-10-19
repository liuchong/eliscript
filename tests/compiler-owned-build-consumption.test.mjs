import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildIndependentCompiler, compilerMetadataDigest, decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {createCompilerSession, encodeCompilerIR, isOwnedCompilerBuildProduct, requestCompilerBuildProduct,
  requestCompilerBuildConsumption, registerVerifiedCompilerBuildConsumption,
  registerCompilerBuildProductForwarder} from '../tools/backends/compiler-session.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';

let directory;
beforeAll(async () => {directory = await mkdtemp(resolve(tmpdir(), 'eliscript-owned-consumption-'));});
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

const sources = {entry: 'entry.mjs', modules: [{id: 'entry.mjs', filename: 'entry.eli',
  source: '(defun run () -0.0) (export run)'}], literalSources: [],
  runtime: {filename: 'tiny-runtime.eli', source: '(defun tiny () 0) (export tiny)'}};

// This is a transport/builder fixture, not an executable compiler or native
// library. The actual codecs, file writers and identity computation consume
// complete small records without compiling another managed runtime.
function product() {
  const filename = 'virtual/中文😀\ud800.eli';
  const span = Object.freeze({filename, start: 0, end: 1, line: 1, column: 1});
  const source = Object.freeze({kind: 'function-declaration', value: 'run', span,
    children: Object.freeze([{kind: 'literal', value: -0, span, children: []}])});
  return {target: 'native', nativeTarget: 'arm64-linux', nativeFormat: 'library', revision: 1,
    bytes: {encoding: 'u16le-chunks', byteLength: 5, chunks: [String.fromCharCode(0x457f, 0x464c, 0xff)]},
    typed: {abi: 'memory-u32', filename, exports: ['run'], aliases: [], table: [], functions: [
      {name: 'run', index: 0, arity: 0, locals: [], source,
        body: {kind: 'literal', type: 'f64', value: -0, span, children: []}},
    ]},
    descriptor: {format: 'eliscript-managed-control', version: 1, abi: 'managed-control-v1',
      functions: [{name: 'run', arity: 0}]},
    debug: {format: 'eliscript-native-source-map', version: 1, target: 'arm64-linux',
      offsetUnit: 'byte', offsetBase: 'code-section', codeSection: {fileOffset: 0, virtualAddress: 0, size: 4},
      functions: [{name: 'run', index: 0, start: 0, end: 4, span}],
      ranges: [{kind: 'literal', function: 'run', functionIndex: 0, depth: 0, start: 0, end: 4, span}],
      sources: [{id: filename, filename, macroOrigins: []}]},
  };
}
const capabilities = {format: 'eliscript-compiler-capabilities', version: 1,
  responseModes: ['events-v1', 'graph-events-v1']};
function driverFor(factory, onProject = () => {}) {
  return {compiler_session_new: () => ({}), compiler_session_close: () => true,
    compiler_session_request(state, text) {
      const request = JSON.parse(text);
      if (request.operation === 'runtime') return encodeCompilerIR({revision: 1});
      // This tiny wire fixture emits normal JSON, not cursor envelopes. Do
      // not advertise event modes that its project handler cannot implement.
      if (request.operation === 'capabilities') return encodeCompilerIR({format: capabilities.format, version: 1});
      if (request.operation === 'project') {onProject(request);return encodeCompilerIR(factory());}
      throw new Error('unexpected fixture request');
    },
    compiler_session_project_owned(wire, state, text) {
      const request = JSON.parse(text);assert.equal(request.operation, 'project');assert.equal(request.target, 'native');
      onProject(request);
      return {format: 'eliscript-compiler-owned-project', version: 1, value: factory()};
    },
  };
}

async function declaredDriverFixture(name) {
  const output=resolve(directory,name);await mkdir(output,{recursive:true});
  const source=`
import {encodeCompilerIR} from ${JSON.stringify(pathToFileURL(resolve('tools/backends/compiler-session.mjs')).href)};
export const observations={owned:0,wire:0,closed:0};
function fresh(target){
 const value=JSON.parse(${JSON.stringify(encodeCompilerIR(product()))});
 const fn=value.typed.functions[0],span=fn.source.span;
 fn.source.children.push(fn.source.children[0]);
 fn.body.span=span;value.debug.ranges[0].span=span;value.debug.functions[0].span=span;
 if(target==='wasm'){value.target='wasm';delete value.typed;delete value.nativeTarget;delete value.nativeFormat;}
 return value;
}
export function compiler_session_new(){return{};}
export function compiler_session_close(){observations.closed++;return true;}
export function compiler_session_request(state,text){
 const request=JSON.parse(text);
 if(request.operation==='runtime')return encodeCompilerIR({revision:1});
 if(request.operation==='capabilities')return encodeCompilerIR({format:'eliscript-compiler-capabilities',version:1,responseModes:['events-v1','graph-events-v1']});
 if(request.operation==='project'){
  observations.wire++;
  if(request.responseMode!==undefined)throw new Error('verified build incorrectly entered graph response transport');
  return encodeCompilerIR(fresh(request.target));
 }
 throw new Error('unexpected declared fixture request');
}
export function compiler_session_project_owned(wire,state,text){
 if(wire!==compiler_session_request)return null;
 const request=JSON.parse(text);
 if(request.operation!=='project'||!['wasm','native'].includes(request.target)||Object.hasOwn(request,'responseMode'))return null;
 observations.owned++;return{format:'eliscript-compiler-owned-project',version:1,value:fresh(request.target)};
}
`;
  const path=resolve(output,'compiler.mjs');await writeFile(path,source);
  const artifact={host:'javascript',directory:output,path:'compiler.mjs',modules:[{id:'compiler.mjs',path:'compiler.mjs'}],
    artifactIdentity:{algorithm:'sha256',files:[{path:'compiler.mjs',bytes:Buffer.byteLength(source),
      sha256:createHash('sha256').update(source).digest('hex')}]}};
  return{artifact,path,source};
}

test('verified declared JavaScript artifacts transfer fresh native builds while public snapshots and later requests stay independent',async()=>{
  const fixture=await declaredDriverFixture('verified-native-driver'),session=await openCompilerArtifact(fixture.artifact);
  const driver=await import(pathToFileURL(fixture.path).href);
  const request={operation:'project',target:'native',nativeTarget:'arm64-linux',nativeFormat:'library',debug:true};
  try{
    const retained=session.request(request),original=structuredClone(retained);
    assert.equal(driver.observations.wire,1);assert.equal(driver.observations.owned,0);
    const built=await buildIndependentCompiler({host:'native',nativeTarget:'arm64-linux',sources,session,debug:true,
      outputRoot:resolve(directory,'verified-native-product')});
    assert.equal(driver.observations.wire,1,'the graph-capable verified producer must not serialize a second complete result');
    assert.equal(driver.observations.owned,1);
    assert.deepEqual(built.bytes,decodeCompilerBinary(original.bytes));assert.deepEqual(built.typed,original.typed);
    assert.equal(await readFile(built.debugPath,'utf8'),encodeCompilerIR(original.debug)+'\n');
    assert.deepEqual(JSON.parse(await readFile(built.metadataPath,'utf8')).typed,JSON.parse(encodeCompilerIR(original.typed)));
    assert.strictEqual(built.typed.functions[0].source.children[0],built.typed.functions[0].source.children[1]);
    assert(Object.is(built.typed.functions[0].body.value,-0));
    retained.typed.functions[0].source.children[0].value=91;retained.debug.ranges[0].kind='public mutation';
    assert(Object.is(built.typed.functions[0].source.children[0].value,-0));
    const later=session.request(request);
    assert.equal(driver.observations.wire,2);assert.equal(driver.observations.owned,1);
    assert.notStrictEqual(later.typed.functions[0].source,built.typed.functions[0].source);
    assert(Object.is(later.typed.functions[0].source.children[0].value,-0));
    const next=await requestCompilerBuildConsumption(session,request,{responseMode:'graph-events-v1'});
    assert.equal(next.owned,true);assert.equal(isOwnedCompilerBuildProduct(next.product),true);
    assert.equal(driver.observations.owned,2);assert.equal(driver.observations.wire,2);
    assert.notStrictEqual(next.product.typed.functions[0].source,built.typed.functions[0].source);
    assert.strictEqual(next.product.typed.functions[0].source.span,next.product.debug.ranges[0].span);
    later.typed.functions[0].source.span.start=123;
    assert.equal(next.product.typed.functions[0].source.span.start,0);
  }finally{session.close();}
});

test('verified consumption cannot be claimed by an injected driver an undeclared artifact or a public wrapper',async()=>{
  const external=product(),injected=await createCompilerSession({host:'javascript',compiler:driverFor(()=>external)});
  try{
    await assert.rejects(registerVerifiedCompilerBuildConsumption(injected),/requires a verified JavaScript artifact session/);
    const captured=await requestCompilerBuildConsumption(injected,{operation:'project',target:'native',nativeTarget:'arm64-linux'});
    assert.notStrictEqual(captured.product.debug,external.debug);assert.equal(isOwnedCompilerBuildProduct(captured.product),false);
  }finally{injected.close();}
  const fixture=await declaredDriverFixture('undeclared-driver'),{artifactIdentity,...undeclared}=fixture.artifact;
  const session=await openCompilerArtifact(undeclared),driver=await import(pathToFileURL(fixture.path).href);
  try{
    await assert.rejects(registerVerifiedCompilerBuildConsumption(session),/requires a verified JavaScript artifact session/);
    const value=await requestCompilerBuildConsumption(session,{operation:'project',target:'native',nativeTarget:'arm64-linux'});
    assert.equal(driver.observations.wire,1);assert.equal(driver.observations.owned,0);
    assert.equal(isOwnedCompilerBuildProduct(value.product),false);
  }finally{session.close();}
  const trusted=await declaredDriverFixture('verified-wrapper-driver'),actual=await openCompilerArtifact(trusted.artifact);
  const observed=await import(pathToFileURL(trusted.path).href);
  try{
    const wrapper={host:actual.host,request:(...args)=>actual.request(...args)};
    await assert.rejects(registerVerifiedCompilerBuildConsumption(wrapper),/requires a verified JavaScript artifact session/);
    const value=await requestCompilerBuildConsumption(wrapper,{operation:'project',target:'wasm',debug:true});
    assert.equal(value.owned,false);assert.equal(isOwnedCompilerBuildProduct(value.product),false);
    assert.equal(observed.observations.wire,1);assert.equal(observed.observations.owned,0);
  }finally{actual.close();}
});

test('declared JavaScript driver hash failures precede import and exclusive consumption registration',async()=>{
  const fixture=await declaredDriverFixture('tampered-verified-driver');
  await writeFile(fixture.path,fixture.source+'\nthrow new Error("must not import changed driver");\n');
  await assert.rejects(openCompilerArtifact(fixture.artifact),/compiler resource SHA-256 or byte length identity changed after emission/);
});

function seedFrontend({throwDebug = false, failSource, failure} = {}) {
  const programs = [], calls = [];
  const compile = (source, filename) => {
    calls.push([source, filename]);
    if (source === failSource) throw failure;
    const program = Object.freeze({kind: 'program', filename, source,
      children: Object.freeze([{kind: 'literal', value: -0, children: []}])});
    programs.push(program);return program;
  };
  const fixture = product(), data = encodeCompilerIR(fixture);
  const frontend = {
    compile_string_with_source_map(source, filename) {
      // Only the transport scheduler is under test. The fixture backends
      // produce the complete same small product as the public/owned driver.
      let javascript = 'export {};\n';
      if (filename.endsWith('/managed.eli')) javascript = `
        export const state = {};
        export function lower_managed_project(modules, entry, runtime, options) {
          state.modules = modules;state.runtime = runtime;state.literals = options.literalModules;
          return JSON.parse(${JSON.stringify(data)});
        }`;
      if (filename.endsWith('/native.eli')) javascript = `
        import {state as lowering} from './managed.mjs';
        export const state = {debugReads: 0, failure: {debug: 'original nested getter failure'}};
        export function emit_fresh_observed_typed_native_memory_artifact(typed, target, options, observer) {
          if (typeof observer !== 'function') throw Error('seed native emitter requires its explicit private observer');
          if (options.format !== 'library' || options.binaryEncoding !== 'u16le-chunks') throw Error('seed native options changed');
          state.programsAtEmission = lowering.modules.map(record => record.program);
          const value = JSON.parse(${JSON.stringify(data)});
          ${throwDebug ? `Object.defineProperty(value.debug.ranges[0], 'kind', {enumerable: true,
            get() {state.debugReads++;throw state.failure;}});` : ''}
          return {bytes: value.bytes, debug: value.debug};
        }`;
      return {javascript, sourceMap: '{"version":3}'};
    },
    compile_ir_string: compile,
    compile_ir_string_with_origins(source, filename) {
      return Object.freeze({program: compile(source, filename), macroOrigins: [{source, filename}]});
    },
    serialize_ir_program: program => 'canonical:' + encodeCompilerIR(program),
  };
  return {frontend, programs, calls};
}

test('owned build consumption preserves complete files typed identity and externally retained producer records', async () => {
  const products = [], factory = () => {const value = product();products.push(value);return value;};
  const session = await createCompilerSession({host: 'javascript', compiler: driverFor(factory)});
  const external = JSON.parse(encodeCompilerIR(product())), saved = structuredClone(external);
  external.ownedCompilerBuildProduct = true;
  const publicProducer = {host: 'javascript', request(request) {
    if (request.operation === 'runtime') return {revision: 1};
    // Legacy public producer: no event or private ownership support.
    if (request.operation === 'capabilities') return {format: capabilities.format, version: 1};
    assert.equal(request.operation, 'project');return external;
  }};
  try {
    assert.equal(isOwnedCompilerBuildProduct(external), false, 'caller fields cannot manufacture ownership');
    const common = {host: 'native', nativeTarget: 'arm64-linux', sources, debug: true};
    const ordinary = await buildIndependentCompiler({...common, session: publicProducer,
      outputRoot: resolve(directory, 'public')});
    const owned = await buildIndependentCompiler({...common, session, outputRoot: resolve(directory, 'owned')});
    assert.equal(products.length, 1);
    assert.deepEqual(external, {...saved, ownedCompilerBuildProduct: true}, 'a public producer keeps its response unchanged');
    assert.deepEqual(products[0], product(), 'the driver response and its borrowed cached source also remain intact');
    assert.equal(isOwnedCompilerBuildProduct(products[0]), false, 'ownership marks the private result, not its driver input');
    assert.deepEqual(owned.bytes, decodeCompilerBinary(saved.bytes));
    assert.deepEqual(owned.bytes, ordinary.bytes);
    assert.deepEqual(owned.typed, ordinary.typed);assert.deepEqual(owned.descriptor, ordinary.descriptor);
    assert.strictEqual(owned.lowered.typed, owned.typed);assert.strictEqual(owned.lowered.descriptor, owned.descriptor);
    assert.equal(owned.typed.functions[0].source.kind, 'function-declaration');
    assert(Object.is(owned.typed.functions[0].body.value, -0));
    assert.equal(compilerMetadataDigest(owned.typed), compilerMetadataDigest(ordinary.typed));
    assert.deepEqual(owned.productIdentity, ordinary.productIdentity);
    assert.deepEqual(owned.artifactIdentity, ordinary.artifactIdentity);
    for (const key of ['path', 'debugPath', 'metadataPath'])
      assert.equal((await readFile(owned[key])).equals(await readFile(ordinary[key])), true, 'complete saved ' + key);
    const metadata = JSON.parse(await readFile(owned.metadataPath, 'utf8'));
    assert.deepEqual(metadata.typed, JSON.parse(encodeCompilerIR(saved.typed)));
    assert.equal(metadata.debugEnabled, true);assert.equal(metadata.debugPath, 'compiler.so.debug.json');
    const savedDebug = JSON.parse(await readFile(owned.debugPath, 'utf8'));
    assert.deepEqual(savedDebug, JSON.parse(encodeCompilerIR(saved.debug)));
    assert.equal(savedDebug.ranges[0].span.filename, saved.typed.filename);
  } finally {session.close();}
});

test('owned transport consumption preserves decode failure cancellation and original producer errors', async () => {
  const decoding = product();decoding.bytes = [256];
  const decodeSession = await createCompilerSession({host: 'javascript', compiler: driverFor(() => decoding)});
  const phases = [], observerFailure = {observer: 'must not replace the original failure'};
  try {
    await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
      session: decodeSession, outputRoot: resolve(directory, 'decode-failure'), onPhase: name => {
        phases.push(name);throw observerFailure;
      }}),
    error => error instanceof TypeError && error.message === 'compiler binary contains an invalid byte');
    assert.deepEqual(decoding.bytes, [256]);assert(phases.includes('binary-decode-start'));
    assert.equal(phases.includes('binary-decode-complete'), false);
  } finally {decodeSession.close();}
  const original = {producer: 'first failure'};
  const failureSession = await createCompilerSession({host: 'javascript', compiler: driverFor(() => {throw original;})});
  try {
    await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
      session: failureSession, outputRoot: resolve(directory, 'producer-failure'), onPhase: () => {throw observerFailure;}}),
    error => error === original);
  } finally {failureSession.close();}
  const controller = new AbortController(), reason = {cancelled: 'owned project'}, cancelled = product();
  const cancelledSession = await createCompilerSession({host: 'javascript', compiler: driverFor(() => cancelled,
    () => controller.abort(reason))});
  try {
    await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
      session: cancelledSession, signal: controller.signal, outputRoot: resolve(directory, 'cancelled')}), error => error === reason);
    assert.deepEqual(cancelled.bytes, product().bytes);assert.deepEqual(cancelled.debug, product().debug);
    assert.equal(cancelledSession.request({operation: 'capabilities'}).format, capabilities.format);
  } finally {cancelledSession.close();}
});

test('private seed consumption preserves complete bytes debug and retained IR without mutating frontend programs', async () => {
  const supplied = structuredClone(sources), original = structuredClone(supplied);
  supplied.literalSources.push({id: 'stdlib/bit.mjs', filename: 'stdlib/bit.eli', source: 'literal 原😀\ud800'});
  original.literalSources = structuredClone(supplied.literalSources);
  for (const retainIR of [false, true]) {
    const fixture = seedFrontend(), outputRoot = resolve(directory, 'seed-' + retainIR);
    const artifact = await buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux',
      outputRoot, sources: supplied, frontend: fixture.frontend, debug: true, retainIR,
      onPhase(name) {
        if (name === 'sources-complete') supplied.modules[0].source = 'caller next revision';
      }});
    const backend = await import(pathToFileURL(resolve(outputRoot, 'seed/backends/managed.mjs')).href);
    const native = await import(pathToFileURL(resolve(outputRoot, 'seed/backends/native.mjs')).href);
    assert.equal(artifact.provenance.mode, 'seed');
    assert.deepEqual(artifact.bytes, decodeCompilerBinary(product().bytes));
    assert.deepEqual(await readFile(artifact.path), Buffer.from(artifact.bytes));
    assert.equal(backend.state.modules.every(record => record.program === null), true);
    assert.equal(backend.state.literals.every(record => record.program === null), true);
    assert.equal(native.state.programsAtEmission.every(program => program === null), !retainIR);
    assert.deepEqual(fixture.calls.map(([source]) => source),
      [original.modules[0].source, original.runtime.source, original.literalSources[0].source]);
    for (const program of fixture.programs) {
      assert.equal(Object.isFrozen(program), true);
      assert.equal(program.kind, 'program');assert(Object.is(program.children[0].value, -0));
    }
    const expectedDebug = {...product().debug, sources: [
      ...original.modules.map(record => ({id: record.id, filename: record.filename,
        macroOrigins: [{source: record.source, filename: record.filename}]})),
      ...original.literalSources.map(record => ({id: record.id, filename: record.filename,
        macroOrigins: [{source: record.source, filename: record.filename}]})),
      {id: 'runtime', filename: original.runtime.filename,
        macroOrigins: [{source: original.runtime.source, filename: original.runtime.filename}]},
    ]};
    assert.equal(await readFile(artifact.debugPath, 'utf8'), encodeCompilerIR(expectedDebug) + '\n');
    const metadata = JSON.parse(await readFile(artifact.metadataPath, 'utf8'));
    assert.deepEqual(metadata.typed, JSON.parse(encodeCompilerIR(product().typed)));
    assert.deepEqual(metadata.descriptor, product().descriptor);
    assert.equal(compilerMetadataDigest(artifact.typed), compilerMetadataDigest(product().typed));
    if (retainIR) {
      assert.deepEqual(artifact.frontendIR.map(record => record.id), ['entry.mjs', 'runtime']);
      const records = [...artifact.frontendIR, ...artifact.literalIR];
      const programs = [fixture.programs[0], fixture.programs[1], fixture.programs[2]];
      for (let index = 0; index < records.length; index++) {
        assert.equal(await readFile(records[index].path, 'utf8'), encodeCompilerIR(programs[index]));
        assert.equal(await readFile(records[index].canonicalPath, 'utf8'), 'canonical:' + encodeCompilerIR(programs[index]));
      }
    } else assert.equal(artifact.frontendIR, undefined);
    supplied.modules[0].source = original.modules[0].source;
  }
});

test('seed owned writer opens before private traversal while public writers snapshot before yielding', async () => {
  const seed = seedFrontend({throwDebug: true}), outputRoot = resolve(directory, 'seed-write-failure');
  await mkdir(resolve(outputRoot, 'compiler.so.debug.json'), {recursive: true});
  await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
    frontend: seed.frontend, debug: true, outputRoot}), error => error?.code === 'EISDIR');
  const native = await import(pathToFileURL(resolve(outputRoot, 'seed/backends/native.mjs')).href);
  assert.equal(native.state.debugReads, 0, 'an owned seed does not allocate a snapshot before an open failure');

  const external = product(), original = structuredClone(external), getterFailure = {public: 'first getter'};
  Object.defineProperty(external.debug.ranges[0], 'kind', {enumerable: true, configurable: true,
    get() {throw getterFailure;}});
  const publicProducer = {host: 'javascript', request(request) {
    if (request.operation === 'runtime') return {revision: 1};
    if (request.operation === 'capabilities') return capabilities;
    return external;
  }};
  const publicOutput = resolve(directory, 'public-write-failure');
  await mkdir(resolve(publicOutput, 'compiler.so.debug.json'), {recursive: true});
  await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
    session: publicProducer, debug: true, outputRoot: publicOutput}), error => error === getterFailure);
  assert.deepEqual(external.bytes, original.bytes, 'failure never consumes public transport');

  Object.defineProperty(external.debug.ranges[0], 'kind', {enumerable: true, configurable: true, writable: true,
    value: original.debug.ranges[0].kind});
  const artifact = await buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
    session: publicProducer, debug: true, outputRoot: resolve(directory, 'public-yield'), onPhase(name) {
      if (name === 'debug-file-start') queueMicrotask(() => {external.debug.ranges[0].kind = 'caller edit';});
      if (name === 'artifact-metadata-start') queueMicrotask(() => {external.typed.functions[0].body.value = 123;});
    }});
  assert.equal(await readFile(artifact.debugPath, 'utf8'), encodeCompilerIR(original.debug) + '\n');
  const saved = JSON.parse(await readFile(artifact.metadataPath, 'utf8'));
  assert.deepEqual(saved.typed, JSON.parse(encodeCompilerIR(original.typed)));
  assert.equal(external.debug.ranges[0].kind, 'caller edit');assert.equal(external.typed.functions[0].body.value, 123);
  assert.deepEqual(external.bytes, original.bytes);
});

test('seed frontend failures retain identity and precede all owned product consumption', async () => {
  for (const failSource of [sources.modules[0].source, sources.runtime.source]) {
    const failure = {frontend: failSource}, fixture = seedFrontend({failSource, failure}), phases = [];
    await assert.rejects(buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
      frontend: fixture.frontend, debug: true, outputRoot: resolve(directory, 'seed-frontend-' + phases.length + '-' + (failSource === sources.runtime.source)),
      onPhase(name) {phases.push(name);throw {observer: 'cannot replace frontend failure'};}}), error => error === failure);
    assert.equal(phases.includes('binary-decode-start'), false);
    assert.equal(phases.includes('debug-file-start'), false);
    assert.equal(fixture.calls.at(-1)[0], failSource);
  }
});

test('token owned consumption isolates caller edits during asynchronous persistence', async () => {
  const external = product(), original = structuredClone(external);
  const session = await createCompilerSession({host: 'javascript', compiler: driverFor(() => external)});
  try {
    const artifact = await buildIndependentCompiler({host: 'native', nativeTarget: 'arm64-linux', sources,
      session, debug: true, outputRoot: resolve(directory, 'owned-yield'), onPhase(name) {
        if (name === 'debug-file-start') queueMicrotask(() => {
          external.bytes.chunks[0] = 'edited';external.debug.ranges[0].kind = 'caller edit';
        });
        if (name === 'artifact-metadata-start') queueMicrotask(() => {external.typed.functions[0].body.value = 123;});
      }});
    assert.deepEqual(artifact.bytes, decodeCompilerBinary(original.bytes));
    assert.equal(await readFile(artifact.debugPath, 'utf8'), encodeCompilerIR(original.debug) + '\n');
    assert.deepEqual(artifact.typed, original.typed);
    assert.deepEqual(JSON.parse(await readFile(artifact.metadataPath, 'utf8')).typed,
      JSON.parse(encodeCompilerIR(original.typed)));
    assert.equal(external.bytes.chunks[0], 'edited');assert.equal(external.debug.ranges[0].kind, 'caller edit');
    assert.equal(external.typed.functions[0].body.value, 123);
    assert.equal(isOwnedCompilerBuildProduct(external), false);
  } finally {session.close();}
});

test('a retained old product token cannot grant a public producer asynchronous consumption rights',async()=>{
  const external=product(),session=await createCompilerSession({host:'javascript',compiler:driverFor(()=>external)});
  try{
    const retained=await requestCompilerBuildProduct(session,{operation:'project',target:'native',
      nativeTarget:'arm64-linux',nativeFormat:'library'});
    assert.equal(isOwnedCompilerBuildProduct(retained),true);
    assert.strictEqual(retained.debug,external.debug,'the original owned-response API retains its identity contract');
    const original=structuredClone(retained);
    const producer={host:'javascript',request(request){
      if(request.operation==='runtime')return{revision:1};
      if(request.operation==='capabilities')return{format:capabilities.format,version:1};
      return retained;
    }};
    const artifact=await buildIndependentCompiler({host:'native',nativeTarget:'arm64-linux',sources,
      session:producer,debug:true,outputRoot:resolve(directory,'public-old-token'),onPhase(name){
        if(name==='debug-file-start')queueMicrotask(()=>{retained.debug.ranges[0].kind='caller edit';});
        if(name==='artifact-metadata-start')queueMicrotask(()=>{retained.typed.functions[0].body.value=123;});
      }});
    assert.deepEqual(retained.bytes,original.bytes,'public wrappers must keep their entire transport envelope');
    assert.equal(retained.debug.ranges[0].kind,'caller edit','the caller still owns its debug record');
    assert.equal(retained.typed.functions[0].body.value,123);
    assert.equal(await readFile(artifact.debugPath,'utf8'),encodeCompilerIR(original.debug)+'\n');
    assert.deepEqual(JSON.parse(await readFile(artifact.metadataPath,'utf8')).typed,
      JSON.parse(encodeCompilerIR(original.typed)));
  }finally{session.close();}
});

test('registered artifact forwarding uses fresh wire data while another public wrapper cannot inherit consumption',async()=>{
  const external=product(),session=await createCompilerSession({host:'javascript',compiler:driverFor(()=>external)});
  try{
    const retained=await requestCompilerBuildProduct(session,{operation:'project',target:'native',
      nativeTarget:'arm64-linux',nativeFormat:'library'}),original=structuredClone(retained);
    let publicProjects=0;
    const adapter=registerCompilerBuildProductForwarder({host:'javascript',request(request,options){
      if(request.operation==='project'){publicProjects++;return retained;}
      return session.request(request,options);
    }},session);
    const direct=await buildIndependentCompiler({host:'native',nativeTarget:'arm64-linux',sources,session:adapter,
      debug:true,outputRoot:resolve(directory,'registered-fresh-wire'),onPhase(name){
        if(name==='debug-file-start')queueMicrotask(()=>{external.debug.ranges[0].kind='caller edit';});
      }});
    assert.equal(publicProjects,0,'registered project dispatch uses the actual underlying session wire');
    assert.equal(await readFile(direct.debugPath,'utf8'),encodeCompilerIR(original.debug)+'\n');
    assert.deepEqual(direct.typed,original.typed);assert.deepEqual(retained.bytes,original.bytes);
    retained.debug.ranges[0].kind=original.debug.ranges[0].kind;
    const wrapper={host:'javascript',request:(request,options)=>adapter.request(request,options)};
    const wrapped=await buildIndependentCompiler({host:'native',nativeTarget:'arm64-linux',sources,session:wrapper,
      debug:true,outputRoot:resolve(directory,'public-wrapped-adapter'),onPhase(name){
        if(name==='debug-file-start')queueMicrotask(()=>{retained.debug.ranges[0].kind='wrapped caller edit';});
      }});
    assert.equal(publicProjects,1);
    assert.equal(await readFile(wrapped.debugPath,'utf8'),encodeCompilerIR(original.debug)+'\n');
    assert.deepEqual(retained.bytes,original.bytes);assert.equal(retained.debug.ranges[0].kind,'wrapped caller edit');
  }finally{session.close();}
});

test('native typed negotiation prefers declared graph packets without changing opaque producers or other host modes',async()=>{
  const declarations=[undefined,[],['events-v1'],['graph-events-v1'],['events-v1','graph-events-v1']];
  for(const host of['native','wasm','javascript'])for(const debug of[false,true])for(let index=0;index<declarations.length;index++){
    const modes=declarations[index],calls=[],original={host,debug,index,refused:true};
    const producer={host:'javascript',request(request,options){
      calls.push({request,options});
      if(request.operation==='runtime')return{revision:1};
      if(request.operation==='capabilities')return{format:capabilities.format,version:1,...(modes===undefined?{}:{responseModes:modes})};
      throw original;
    }};
    await assert.rejects(buildIndependentCompiler({host,debug,sources,session:producer,nativeTarget:'arm64-linux',
      outputRoot:resolve(directory,`mode-${host}-${debug}-${index}`)}),error=>error===original);
    assert.deepEqual(calls.map(call=>call.request.operation),host==='javascript'?['runtime','project']:['runtime','capabilities','project']);
    assert(calls.slice(0,-1).every(call=>!Object.hasOwn(call.options,'responseMode')));
    const graph=modes?.includes('graph-events-v1'),events=modes?.includes('events-v1');
    const expected=host==='javascript'?undefined:graph&&(host==='native'||debug)?'graph-events-v1':events?'events-v1':graph?'graph-events-v1':undefined;
    const project=calls.at(-1);assert.equal(project.request.target,host);assert.equal(project.request.debug,debug);
    assert.equal(project.request.binaryEncoding,host==='javascript'?undefined:'u16le-chunks');
    assert.equal(Object.hasOwn(project.options,'responseMode'),expected!==undefined);assert.equal(project.options.responseMode,expected);
    assert(!Object.hasOwn(project.request,'responseMode'),'opaque public producers keep the existing request/options boundary');
  }
});

test('negotiated native graph builds retain complete DAG data while each decoded consumer owns independent aliases',async()=>{
  const external=product(),shared={kind:'literal',type:'f64',value:-0,children:[],span:external.typed.functions[0].source.span};
  external.typed.functions[0].source={...external.typed.functions[0].source,children:[shared,shared]};
  external.typed.functions[0].body=shared;
  const expected=encodeCompilerIR(external),wire=[],retained=[];let packets=[],next=0,token=0;
  // Small plain-data protocol fixture. Production codecs decode every packet;
  // the complete executable compiler producer remains covered by the original
  // response-events suite, including native execution and exact image bytes.
  function start(value){
    const events=[],identities=new Map();
    const visit=item=>{
      if(item===null||typeof item!=='object'){events.push(['value',item]);return;}
      if(identities.has(item)){events.push(['reference',identities.get(item)]);return;}
      const identity=identities.size+1;identities.set(item,identity);
      events.push([Array.isArray(item)?'array':'object',identity]);
      if(Array.isArray(item))for(const child of item)visit(child);
      else for(const key of Object.keys(item)){events.push(['key',key]);visit(item[key]);}
      events.push(['end']);
    };
    visit(value);token++;packets=[];
    for(let offset=0;offset<events.length;offset+=16)packets.push({format:'eliscript-compiler-response-events',version:2,token,
      done:offset+16>=events.length,events:events.slice(offset,offset+16)});
    assert(packets.length>1);next=1;return packets[0];
  }
  const driver={compiler_session_new:()=>({}),compiler_session_close:()=>true,compiler_session_request(state,text){
    const request=JSON.parse(text);wire.push(request.operation);
    if(request.operation==='runtime')return encodeCompilerIR({revision:1});
    if(request.operation==='capabilities')return encodeCompilerIR(capabilities);
    if(request.operation==='project'){
      assert.equal(request.responseMode,'graph-events-v1');
      const packet=start(external);retained.push(packet);return encodeCompilerIR(packet);
    }
    assert.equal(request.operation,'response-next');assert.equal(request.token,token);
    return encodeCompilerIR(packets[next++]);
  }};
  const session=await createCompilerSession({host:'javascript',compiler:driver});
  try{
    const artifact=await buildIndependentCompiler({host:'native',nativeTarget:'arm64-linux',sources,session,
      outputRoot:resolve(directory,'native-graph-dag')});
    assert.deepEqual(wire.slice(0,3),['runtime','capabilities','project']);assert(wire.includes('response-next'));
    assert.equal(encodeCompilerIR(external),expected,'producer-owned bytes, debug and complete typed graph survive persistence');
    assert.deepEqual(artifact.bytes,decodeCompilerBinary(external.bytes));
    const fn=artifact.typed.functions[0];assert.strictEqual(fn.body,fn.source.children[0]);assert.strictEqual(fn.body,fn.source.children[1]);
    assert.notStrictEqual(fn.body,shared);assert(Object.is(fn.body.value,-0));
    const metadata=JSON.parse(await readFile(artifact.metadataPath,'utf8'));
    assert.deepEqual(metadata.typed,JSON.parse(encodeCompilerIR(external.typed)));
    assert.deepEqual(metadata.descriptor,external.descriptor);
    assert.equal(await readFile(artifact.debugPath,'utf8'),encodeCompilerIR(external.debug)+'\n');
    const request={operation:'project',target:'native',nativeTarget:'arm64-linux',nativeFormat:'library'};
    const thirdParty=session.request(request,{responseMode:'graph-events-v1'});
    assert.strictEqual(thirdParty.typed.functions[0].body,thirdParty.typed.functions[0].source.children[1]);
    assert.notStrictEqual(thirdParty.typed.functions[0].body,fn.body);
    thirdParty.typed.functions[0].body.value=99;assert(Object.is(fn.body.value,-0));assert(Object.is(shared.value,-0));
    retained[0].events[0][0]='caller packet mutation';
    assert.equal(artifact.typed.abi,'memory-u32','decoded containers never alias producer event packets');
    const again=session.request(request,{responseMode:'graph-events-v1'});
    assert(Object.is(again.typed.functions[0].body.value,-0));assert.notStrictEqual(again.typed.functions[0].body,fn.body);
  }finally{session.close();}
});
