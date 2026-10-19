import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {originalProgramArguments, executeCompilerCorpusRecord} from '../tools/backends/compiler-corpus-execution.mjs';
import {encodeCompilerIR,encodeCompilerSourceAsset,decodeCompilerSourceAsset} from '../tools/backends/compiler-session.mjs';
import {archiveProduct} from '../tools/backends/compiler-matrix.mjs';

test('source asset transport preserves every UTF16 unit while ordinary files retain their original UTF8 form', () => {
  const encoder = new TextEncoder();
  for (const source of ['', '\uFEFF; 中😀e\u0301\n(module source)', '(defconst value "\ud800")',
    '(defconst value "\udc00")', '(defconst value "�")', '\ud800\ud800\udc00\udc00', '\uFEFF\ud800😀\udc00']) {
    const asset = encodeCompilerSourceAsset(source);
    assert.equal(decodeCompilerSourceAsset(encoder.encode(asset.text), asset.encoding), source);
    assert.equal(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(encoder.encode(asset.text)), asset.text);
    if (source === '' || source.includes('�') || source.startsWith('\uFEFF;')) {
      assert.equal(asset.encoding, 'utf8');assert.equal(asset.text, source);
    } else assert.equal(asset.encoding, 'json-utf16');
  }
  assert.equal(decodeCompilerSourceAsset(encoder.encode('\uFEFFsource')), '\uFEFFsource');
  for (const value of [undefined, null, false, 1, {}, []]) assert.throws(() => encodeCompilerSourceAsset(value), TypeError);
});

test('source asset decoding rejects malformed encoding and non-string payloads without substituting source text', () => {
  const encoder = new TextEncoder();
  for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f, 0x98], [0xe2, 0x28, 0xa1]]) {
    for (const encoding of ['utf8', 'json-utf16']) assert.throws(() => decodeCompilerSourceAsset(Uint8Array.from(bytes), encoding), TypeError);
  }
  for (const encoding of [null, 'utf16', 'utf-8', 1, {}]) assert.throws(() => decodeCompilerSourceAsset(encoder.encode('source'), encoding), TypeError);
  for (const payload of ['null', '{}', '[]', 'true', '42']) assert.throws(() => decodeCompilerSourceAsset(encoder.encode(payload), 'json-utf16'), TypeError);
  assert.throws(() => decodeCompilerSourceAsset(encoder.encode('"unterminated'), 'json-utf16'), SyntaxError);
  assert.equal(decodeCompilerSourceAsset(encoder.encode('"\\ud800\\udc00\\ud800"'), 'json-utf16'), '𐀀\ud800');
});

test('complete compiler IR transport preserves deep trees without a recursive host traversal', () => {
  const depth = 20000;
  let object = -0, array = -0;
  for (let index = 0; index < depth; index++) {object = {child: object};array = [array];}
  assert.equal(encodeCompilerIR(object), '{"child":'.repeat(depth) + '-0' + '}'.repeat(depth));
  assert.equal(encodeCompilerIR(array), '['.repeat(depth) + '-0' + ']'.repeat(depth));
});

test('IR transport preserves shared subtrees, IEEE text, Unicode and JSON omission rules', () => {
  const child = {value: -0, text: '😀\ud800', absent: undefined};
  const input = {left: child, right: child, nan: NaN, positive: Infinity, negative: -Infinity,
    values: [undefined, Symbol('ignored'), () => 1, , -0], ignored: () => 0};
  assert.equal(encodeCompilerIR(input),
    '{"left":{"value":-0,"text":"😀\\ud800"},"right":{"value":-0,"text":"😀\\ud800"},"nan":null,"positive":null,"negative":null,"values":[null,null,null,null,-0]}');
  for (const value of [undefined, Symbol('unsupported'), () => 0]) assert.throws(() => encodeCompilerIR(value), TypeError);
  assert.throws(() => encodeCompilerIR({value: 1n}), /BigInt/);
  const cycle = {child};cycle.self = cycle;
  assert.throws(() => encodeCompilerIR(cycle), /cycles/);
  assert.equal(encodeCompilerIR(child), '{"value":-0,"text":"😀\\ud800"}');
});

test('IR transport reads properties once in source order and preserves the original thrown value', () => {
  const reads = [], reason = {message: 'original property failure'};
  const value = {get first() {reads.push('first');return {get inner() {reads.push('inner');return -0;}};},
    get omitted() {reads.push('omitted');return undefined;},
    get last() {reads.push('last');throw reason;}};
  assert.throws(() => encodeCompilerIR(value), error => error === reason);
  assert.deepEqual(reads, ['first', 'inner', 'omitted', 'last']);
  const growing = [0];
  Object.defineProperty(growing, 0, {get() {growing.push(-0);return 1;}, enumerable: true});
  assert.equal(encodeCompilerIR(growing), '[1,-0]');
});

const base = pathToFileURL(resolve('dist/unit-corpus-artifact') + '/').href;
test('original host arguments retain module order, URLs, artifact directory and literal values', () => {
  const entry = 'stdlib/core/vector.mjs';
  assert.deepEqual(originalProgramArguments({}, entry, base), [resolve('dist/unit-corpus-artifact', entry)]);
  assert.deepEqual(originalProgramArguments({argument: 'url', argumentModules: [entry, 'lib/dependency.mjs']}, entry, base), [new URL(entry, base).href, new URL('lib/dependency.mjs', base).href]);
  assert.deepEqual(originalProgramArguments({argumentModules: ['%2e%2e/file#?.mjs']}, entry, base), [resolve('dist/unit-corpus-artifact', '%2e%2e/file#?.mjs')]);
  assert.deepEqual(originalProgramArguments({arguments: [{directory: true}, {literal: 'vector'}, {literal: '1_000_000'}, {module: entry}]}, entry, base), [resolve('dist/unit-corpus-artifact') + '/', 'vector', '1_000_000', resolve('dist/unit-corpus-artifact', entry)]);
  for (const value of [null, 'vector', {}, {directory: false}, {literal: 1000000}, {module: '../outside.mjs'}, {module: '/absolute.mjs'}, {module: 'file:outside.mjs'}, {module: 'a\\b.mjs'}, {literal: 'vector', directory: true}]) assert.throws(() => originalProgramArguments({arguments: [value]}, entry, base), TypeError);
});

test('the actual original-program executor passes directory and literal arguments unchanged to the original host process', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eliscript-original-arguments-'));
  try {
    await writeFile(resolve(directory, 'entry.mjs'), 'export const value = 42;\n');
    const hostSource = 'import {pathToFileURL} from "node:url"; import {resolve} from "node:path"; const [directory, collection, count] = process.argv.slice(2); const m = await import(pathToFileURL(resolve(directory,"entry.mjs"))); console.log(JSON.stringify([collection,count,m.value]));';
    const record = {request: {hostSources: []}, execution: {kind: 'original-program', host: 'original-host.mjs', hostSource, arguments: [{directory: true}, {literal: 'vector'}, {literal: '1000000'}]}};
    const artifact = {target: 'javascript', entry: 'entry.mjs', path: resolve(directory, 'entry.mjs'), directory, modules: [{id: 'entry.mjs'}]};
    const result = await executeCompilerCorpusRecord({record, artifact, target: 'javascript', sourceRoot: resolve('.'), options: {}});
    assert.deepEqual(result, {kind: 'original-program', stdout: '["vector","1000000",42]\n'});
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('isolated original export calls retain negative-zero arguments expectations and observations across the actual Node boundary',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eliscript-isolated-ieee-'));
  try {
    const calls=[{name:'report',args:[-0],expected:[-0,true,Number.MIN_VALUE]},
      {name:'report',args:[0],expected:[0,false,Number.MIN_VALUE]}];
    const record={id:'transport:isolated-ieee',kind:'sequence',expected:{kind:'sequence'},
      steps:[{id:'original',request:{operation:'project',entry:'entry.mjs'},artifact:{kind:'exports',isolated:true,calls}}]};
    // This unit supplies a transport fixture, not a compiler implementation.
    // Both emitted module execution and the separate Node process are real.
    const javascript='export function report(value){return [value,Object.is(value,-0),Number.MIN_VALUE];}\n';
    const result=await executeCompilerCorpusRecord({record,target:'javascript',sourceRoot:resolve('.'),directory,options:{},
      session:{async request(request){assert.equal(request.operation,'project');return{target:'javascript',entry:'entry.mjs',modules:[{id:'entry.mjs',javascript}]};}},
      archiveProduct:(response,name,target)=>archiveProduct(response,target,resolve(directory,name))});
    assert.equal(result.kind,'sequence');assert.equal(result.expectedSatisfied,true);
    assert.deepEqual(result.identity,[{id:'original',result:[
      {name:'report',value:[{$eliscriptObservation:'-0'},true,Number.MIN_VALUE]},
      {name:'report',value:[0,false,Number.MIN_VALUE]},
    ]}]);
    assert(Object.is(calls[0].args[0],-0));assert(Object.is(calls[0].expected[0],-0));
  } finally{await rm(directory,{recursive:true,force:true});}
});

test('original sequence failures retain falsy thrown values instead of recording successful requests',async()=>{
  const values=[undefined,null,false,0,-0,''];
  for(const thrown of values){
    const direct=await executeCompilerCorpusRecord({record:{kind:'stage',request:{stage:'ir'}},failure:thrown});
    assert.equal(direct.kind,'diagnostic');assert.equal(direct.message,String(thrown));
    const request={operation:'capabilities'},context={target:'javascript',sourceRoot:resolve('.'),options:{},
      session:{async request(){throw thrown;}}};
    const unexpected=await executeCompilerCorpusRecord({...context,record:{kind:'sequence',steps:[{id:'reject',request}]}});
    assert.equal(unexpected.expectedSatisfied,false);
    assert.equal(unexpected.identity[0].status,'failed');
    assert.equal(unexpected.identity[0].error.message,String(thrown));
    const expected=await executeCompilerCorpusRecord({...context,record:{kind:'sequence',steps:[{id:'reject',request,error:{}}]}});
    assert.equal(expected.expectedSatisfied,true);
    assert.equal(expected.identity[0].error.message,String(thrown));
    const notThrown=await executeCompilerCorpusRecord({...context,
      session:{async request(){return undefined;}},record:{kind:'sequence',steps:[{id:'required rejection',request,error:{}}]}});
    assert.equal(notThrown.expectedSatisfied,false);
  }
});

test('cancelled original sequences preserve explicit falsy abort reasons over the in-flight failure',async()=>{
  for(const reason of[null,false,0,-0,'']){
    const controller=new AbortController();let caught=false;
    try{
      await executeCompilerCorpusRecord({target:'javascript',options:{},signal:controller.signal,
        record:{kind:'sequence',steps:[{id:'cancelled',request:{operation:'capabilities'}}]},
        session:{async request(){controller.abort(reason);throw new Error('in-flight request failure');}}});
    }catch(error){caught=true;assert(Object.is(error,reason),'original cancellation reason must survive');}
    assert.equal(caught,true);
  }
});

test('real original export execution cannot accept falsy exceptions as an undefined result in either process mode',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eliscript-original-falsy-throw-'));
  try{
    const javascript="export function fail(mode){throw [undefined,null,false,0,-0,''][mode];}\n";
    for(const isolated of[false,true])for(let mode=0;mode<6;mode++){
      const record={kind:'sequence',steps:[{id:'original',request:{operation:'project',entry:'entry.mjs'},
        artifact:{kind:'exports',isolated,calls:[{name:'fail',args:[mode],expected:undefined}]}}]};
      const result=await executeCompilerCorpusRecord({record,target:'javascript',sourceRoot:resolve('.'),directory,options:{},
        session:{async request(){return{target:'javascript',entry:'entry.mjs',modules:[{id:'entry.mjs',javascript}]};}},
        archiveProduct:(response,name,target)=>archiveProduct(response,target,resolve(directory,String(isolated)+'-'+mode,name))});
      assert.equal(result.expectedSatisfied,false,'throw must fail: '+isolated+'/'+mode);
      assert.equal(result.identity[0].status,'failed');
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('the independent compiler CLI reports actual argument and file failures as one structured error in Node and Bun', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eliscript-cli-errors-'));
  const cli = fileURLToPath(new URL('../tools/backends/compiler-cli.mjs', import.meta.url));
  try {
    for (const executable of [process.execPath, process.env.NODE ?? 'node']) {
      const cases = [
        {args: ['compile', '--unknown-option', '--json-errors'], code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION'},
        {args: ['compile', '--compiler-artifact', resolve(directory, '不存在😀.json'),
          '--input', '-', '--target', 'javascript', '--json-errors'], code: 'ENOENT'},
      ];
      for (const item of cases) {
        const child = spawnSync(executable, [cli, ...item.args], {
          cwd: directory, input: '(defun value () 42) (export value)', encoding: 'utf8', timeout: 10000,
          env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
        });
        assert.equal(child.error, undefined, child.stderr);
        assert.equal(child.status, 1, child.stderr);
        assert.equal(child.stdout, '');
        const record = JSON.parse(child.stderr);
        assert.equal(record.format, 'eliscript-compiler-cli-error');
        assert.equal(record.version, 1);
        assert.equal(record.error.code, item.code);
        assert.equal(typeof record.error.name, 'string');
        assert.equal(typeof record.error.message, 'string');
        assert.equal(typeof record.error.stack, 'string');
        if (item.code === 'ENOENT') assert(record.error.message.includes('不存在😀.json'));
      }
      const help = spawnSync(executable, [cli, '--help', '--json-errors'], {
        cwd: directory, encoding: 'utf8', timeout: 10000,
        env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
      });
      assert.equal(help.error, undefined, help.stderr);
      assert.equal(help.status, 0, help.stderr);
      assert.equal(help.stderr, '');
      assert(help.stdout.startsWith('Usage:'));
    }
  } finally {await rm(directory, {recursive: true, force: true});}
}, 30000);

import {createHash} from 'node:crypto';
import {compilerSourceIdentity,compilerDigest,assertCompilerArtifactSources} from '../tools/backends/compiler-bootstrap.mjs';

function identitySources(){return{
  entry:'entry.mjs',
  modules:[
    {id:'other.mjs',filename:'lib/other.eli',source:'(module other)'},
    {id:'entry.mjs',filename:'src/entry.eli',source:'(module entry)'},
  ],
  runtime:{filename:'bootstrap/runtime/memory.eli',source:'(module runtime)'},
  hostSources:[{id:'provider.mjs',filename:'host/provider.mjs',source:'export const value = "中😀";'}],
  literalSources:[{id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',source:'(module values)'}],
  hostModules:[{id:'provider.mjs',specifier:'./provider.mjs',referrer:'entry.mjs',allowedExports:['value'],namespace:false}],
};}
function exactSourceBytes(source){
  const bytes=new Uint8Array(source.length*2),view=new DataView(bytes.buffer);
  for(let index=0;index<source.length;index++)view.setUint16(index*2,source.charCodeAt(index),true);
  return bytes;
}
const exactSourceHash=source=>createHash('sha256').update(exactSourceBytes(source)).digest('hex');
function sourceArtifact(sources){
  const record=value=>({id:value.id,filename:value.filename,sha256:exactSourceHash(value.source)});
  return{entry:sources.entry,sourceIdentity:{algorithm:'sha256',encoding:'utf16le',
    modules:sources.modules.map(record),
    runtime:{filename:sources.runtime.filename,sha256:exactSourceHash(sources.runtime.source)},
    ...(Object.hasOwn(sources,'literalSources')?{literalSources:sources.literalSources.map(record)}:{}),
    ...(Object.hasOwn(sources,'hostSources')?{hostSources:sources.hostSources.map(record)}:{}),
  }};
}

test('compiler source identities bind exact UTF16LE code units for module runtime literal and host source records',()=>{
  for(const field of ['modules','runtime','literalSources','hostSources']){
    const identities=[];
    for(const character of ['\ud800','\udc00','\ufffd']){
      const sources=identitySources(),source='; exact '+character+'\n(module input)';
      const record=field==='runtime'?sources.runtime:sources[field][0];record.source=source;
      const before=JSON.stringify(sources),identity=compilerSourceIdentity(sources);
      const actual=field==='runtime'?identity.runtime:identity[field].find(item=>item.id===record.id);
      assert.equal(identity.encoding,'utf16le');assert.equal(actual.encoding,'utf16le');
      assert.equal(actual.bytes,source.length*2);assert.equal(actual.sha256,exactSourceHash(source));
      const {sha256,...body}=identity;assert.equal(sha256,exactSourceHash(JSON.stringify(body)));
      assert.equal(JSON.stringify(sources),before);
      assert.equal(assertCompilerArtifactSources(sourceArtifact(sources),sources).entry,sources.entry);
      identities.push(identity);
    }
    assert.equal(new Set(identities.map(item=>item.sha256)).size,3,field+' must not collapse lone high/low surrogates or U+FFFD');
    assert.equal(new Set(identities.map(item=>(field==='runtime'?item.runtime:item[field].find(value=>value.id===identitySources()[field][0].id)).sha256)).size,3);
  }
});

test('compiler source metadata preserves BOM Unicode normalization filenames IDs ordering and explicit source inventory absence',()=>{
  const base=identitySources(),before=JSON.stringify(base),original=compilerSourceIdentity(base);
  assert.deepEqual(original.modules.map(item=>item.id),['entry.mjs','other.mjs']);
  assert.equal(compilerSourceIdentity({...base,modules:[...base.modules].reverse()}).sha256,original.sha256);
  for(const field of ['modules','runtime','literalSources','hostSources']){
    const observations=[];
    for(const source of ['(module 😀 "é")','\uFEFF(module 😀 "é")','(module 😀 "e\u0301")','(module 😁 "é")']){
      const changed=structuredClone(base),record=field==='runtime'?changed.runtime:changed[field][0];record.source=source;
      observations.push(compilerSourceIdentity(changed).sha256);
    }
    assert.equal(new Set(observations).size,4,field+' must preserve BOM, exact combining code units and supplementary characters');
    const renamed=structuredClone(base),record=field==='runtime'?renamed.runtime:renamed[field][0];record.filename='renamed/中文😀.eli';
    assert.notEqual(compilerSourceIdentity(renamed).sha256,original.sha256,field+' filename');
    if(field!=='runtime'){
      const changed=structuredClone(base);changed[field][0].id='renamed/'+field+'.mjs';
      assert.notEqual(compilerSourceIdentity(changed).sha256,original.sha256,field+' module ID');
    }
  }
  for(const field of ['literalSources','hostSources','hostModules']){
    const absent=structuredClone(base);delete absent[field];
    const empty={...absent,[field]:[]};
    assert.notEqual(compilerSourceIdentity(absent).sha256,compilerSourceIdentity(empty).sha256,field+' omission and [] are distinct');
  }
  const absent=structuredClone(base);delete absent.phased;
  assert.notEqual(compilerSourceIdentity(absent).sha256,compilerSourceIdentity({...absent,phased:false}).sha256);
  assert.notEqual(compilerSourceIdentity({...base,phased:false}).sha256,compilerSourceIdentity({...base,phased:true}).sha256);
  const reordered=structuredClone(base);reordered.hostModules=reordered.hostModules.map(item=>Object.fromEntries(Object.entries(item).reverse()));
  assert.equal(compilerSourceIdentity(reordered).sha256,original.sha256,'host declaration object key ordering remains canonical');
  for(const declaration of [
    {...base.hostModules[0],allowedExports:[]},
    {...base.hostModules[0],namespace:true},
    {...base.hostModules[0],specifier:'./different.mjs'},
  ])assert.notEqual(compilerSourceIdentity({...base,hostModules:[declaration]}).sha256,original.sha256);
  assert.equal(JSON.stringify(base),before);
});

test('exact compiler source digests retain strict source inventory validation without changing generic byte digests',()=>{
  const base=identitySources();
  for(const mutate of [
    value=>value.modules.push({...value.modules[0]}),
    value=>value.modules[0].filename=undefined,
    value=>value.runtime.filename=undefined,
    value=>value.literalSources.push({...value.literalSources[0]}),
    value=>value.hostSources[0].id=value.modules[0].id,
    value=>value.literalSources[0].id='../escape.mjs',
    value=>value.hostModules[0].extra=undefined,
  ]){
    const sources=structuredClone(base);mutate(sources);assert.throws(()=>compilerSourceIdentity(sources),TypeError);
  }
  const artifact=sourceArtifact(base),mutated=structuredClone(base);mutated.runtime.source+='\ud800';
  assert.throws(()=>assertCompilerArtifactSources(artifact,mutated),/runtime source is stale/);
  for(const field of ['modules','literalSources','hostSources']){
    const changed=structuredClone(base);changed[field][0].source+='\udc00';
    assert.throws(()=>assertCompilerArtifactSources(artifact,changed),/source graph|source graph is stale|source graph is stale or incomplete/);
  }
  const bytes=Uint8Array.from([0,255,0xd8,0,0xdc,0,0xef,0xbb,0xbf]);
  assert.equal(compilerDigest(bytes),createHash('sha256').update(bytes).digest('hex'));
  assert.equal(compilerDigest('ordinary UTF8 😀'),createHash('sha256').update('ordinary UTF8 😀').digest('hex'));
});

import {readFile} from 'node:fs/promises';
import {archiveCompilerSources,readArchivedCompilerSources} from '../tools/backends/compiler-bootstrap.mjs';

async function archivedSourceFixture(sources,operation){
  const directory=await mkdtemp(resolve(tmpdir(),'eliscript-exact-source-archive-'));
  try{
    const identity=await archiveCompilerSources(sources,directory);
    const manifest=JSON.parse(await readFile(resolve(directory,'source-archive.json'),'utf8'));
    await operation({directory,identity,manifest});
  }finally{await rm(directory,{recursive:true,force:true});}
}

test('source archives restore exact high low replacement BOM and combining code units for every source category',async()=>{
  for(const field of ['modules','runtime','hostSources','literalSources']){
    const identities=[];
    for(const text of ['\ud800','\udc00','\ufffd','\uFEFF中😀é','中😀e\u0301']){
      const sources=identitySources(),source='; '+text+'\n(module exact)';
      const original=field==='runtime'?sources.runtime:sources[field][0];original.source=source;
      const before=JSON.stringify(sources);
      await archivedSourceFixture(sources,async({directory,identity,manifest})=>{
        const restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity});
        assert.deepEqual(restored,sources);assert.equal(JSON.stringify(sources),before);
        assert.deepEqual(compilerSourceIdentity(restored),identity);
        const record=manifest.records.find(item=>field==='runtime'?item.kind==='runtime':item.id===original.id);
        assert(record);assert.equal(record.encoding,'utf16le');assert.equal(record.filename,original.filename);
        const raw=await readFile(resolve(directory,record.path));
        assert.deepEqual(raw,Buffer.from(exactSourceBytes(source)));assert.equal(raw.length,source.length*2);assert.equal(sha256SourceArchive(raw),record.sha256);
        assert.equal(record.bytes,raw.length);
        assert.equal(raw.toString('utf16le'),source);
        const tool=await readFile(resolve(directory,record.tool.path));
        assert.deepEqual(tool,Buffer.from(source,'utf8'));assert.equal(record.tool.encoding,'utf8');assert.equal(record.tool.role,'tool-projection');
        const projected=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(tool);
        assert.equal(record.tool.lossless,projected===source);
        if(text==='\ud800'||text==='\udc00'){assert.equal(record.tool.lossless,false);assert.notEqual(projected,source);}
        else assert.equal(record.tool.lossless,true);
        identities.push(identity.sha256);
      });
    }
    assert.equal(new Set(identities).size,5,field+' archives must not collapse distinct source code units');
  }
});
const sha256SourceArchive=bytes=>createHash('sha256').update(bytes).digest('hex');

test('source archive identities distinguish shared filenames from colliding logical module IDs',async()=>{
  const sources=identitySources();
  sources.modules[0].filename=sources.modules[1].filename='same.eli';
  sources.hostSources[0].filename=sources.literalSources[0].filename='same.eli';
  sources.modules[0].source='; high \ud800';sources.modules[1].source='; low \udc00';
  await archivedSourceFixture(sources,async({directory,identity,manifest})=>{
    const restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity.sha256});
    assert.deepEqual(restored,sources);
    assert.equal(new Set(manifest.records.map(record=>record.path)).size,manifest.records.length);
    assert.equal(new Set(manifest.records.map(record=>record.tool.path)).size,manifest.records.length);
  });
  for(const collision of ['module','host','literal']){
    const invalid=identitySources();
    if(collision==='module')invalid.modules.push({...invalid.modules[0],source:'different'});
    else if(collision==='host')invalid.hostSources[0].id=invalid.modules[0].id;
    else invalid.literalSources[0].id=invalid.hostSources[0].id;
    const directory=await mkdtemp(resolve(tmpdir(),'eliscript-source-archive-collision-'));
    try{await assert.rejects(()=>archiveCompilerSources(invalid,directory),TypeError);}
    finally{await rm(directory,{recursive:true,force:true});}
  }
});

test('restoring source archives rejects damaged raw bytes tool bytes identities encodings and incomplete mappings',async()=>{
  for(const mutation of ['raw-byte','raw-truncated','tool-byte','encoding','size','hash','filename','id','duplicate-id','duplicate-path','missing-record','tool-lossless','expected-identity','escape']){
    const sources=identitySources();sources.modules[0].source='; \uFEFF😀\ud800 exact';
    await archivedSourceFixture(sources,async({directory,identity,manifest})=>{
      const record=manifest.records[0],manifestPath=resolve(directory,'source-archive.json');
      const rawPath=resolve(directory,record.path),toolPath=resolve(directory,record.tool.path);
      if(mutation==='raw-byte'){
        const bytes=await readFile(rawPath);bytes[0]^=1;await writeFile(rawPath,bytes);
      }else if(mutation==='raw-truncated'){
        const bytes=await readFile(rawPath);await writeFile(rawPath,bytes.subarray(0,bytes.length-1));
      }else if(mutation==='tool-byte')await writeFile(toolPath,'altered tool projection');
      else if(mutation==='encoding')record.encoding='utf8';
      else if(mutation==='size')record.bytes+=2;
      else if(mutation==='hash')record.sha256='0'.repeat(64);
      else if(mutation==='filename')record.filename='forged.eli';
      else if(mutation==='id')record.id='forged.mjs';
      else if(mutation==='duplicate-id')manifest.records.push({...record});
      else if(mutation==='duplicate-path')manifest.records[1].path=record.path;
      else if(mutation==='missing-record')manifest.records.pop();
      else if(mutation==='tool-lossless')record.tool.lossless=true;
      else if(mutation==='escape')record.path='../outside.utf16le';
      if(!['raw-byte','raw-truncated','tool-byte','expected-identity'].includes(mutation))await writeFile(manifestPath,JSON.stringify(manifest));
      await assert.rejects(()=>readArchivedCompilerSources(directory,{expectedIdentity:mutation==='expected-identity'?'0'.repeat(64):identity}));
    });
  }
});

test('a failed source archive read does not cache corrupted bytes or erase explicit empty source inventories',async()=>{
  const sources=identitySources();sources.modules[0].source='\uFEFF; \ud800\udc00 \ud800 \udc00 \ufffd 😀';
  sources.hostSources=[];sources.literalSources=[];sources.hostModules=[];sources.phased=false;
  await archivedSourceFixture(sources,async({directory,identity,manifest})=>{
    const record=manifest.records[0],path=resolve(directory,record.path),original=await readFile(path);
    const changed=Buffer.from(original);changed[changed.length-1]^=1;await writeFile(path,changed);
    await assert.rejects(()=>readArchivedCompilerSources(directory,{expectedIdentity:identity}));
    await writeFile(path,original);
    const restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity});
    assert.deepEqual(restored,sources);assert.equal(Object.hasOwn(restored,'hostSources'),true);assert.equal(Object.hasOwn(restored,'literalSources'),true);
    assert.deepEqual(restored.hostSources,[]);assert.deepEqual(restored.literalSources,[]);assert.deepEqual(restored.hostModules,[]);assert.equal(restored.phased,false);
  });
  const absent=identitySources();delete absent.hostSources;delete absent.literalSources;delete absent.hostModules;
  await archivedSourceFixture(absent,async({directory,identity})=>{
    const restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity});assert.deepEqual(restored,absent);
    for(const field of ['hostSources','literalSources','hostModules','phased'])assert.equal(Object.hasOwn(restored,field),false);
  });
});

import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';

// Asset-only loader tests use a recording driver rather than claiming any
// compiler algorithm was executed by this transport fixture.
async function runtimeAssetFixture(source,encoding,operation){
  const directory=await mkdtemp(resolve(tmpdir(),'eliscript-default-runtime-asset-'));
  try{
    const driver=`export function compiler_session_new(){return{calls:0};}
export function compiler_session_close(state){state.closed=true;}
export function compiler_session_request(state,text){const input=JSON.parse(text);return JSON.stringify({calls:++state.calls,operation:input.operation,source:input.source,filename:input.filename,ownSource:Object.hasOwn(input,'source')});}\n`;
    const compilerBytes=Buffer.from(driver,'utf8');await writeFile(resolve(directory,'compiler.mjs'),compilerBytes);
    const bytes=Buffer.from(encoding==='json-utf16'?JSON.stringify(source):source,'utf8');
    const runtimePath=encoding==='json-utf16'?'runtime.eli.json':'runtime.eli';await writeFile(resolve(directory,runtimePath),bytes);
    const artifact={host:'javascript',directory,path:'compiler.mjs',entry:'compiler.mjs',modules:[{id:'compiler.mjs',path:'compiler.mjs'}],
      runtimePath,runtimeEncoding:encoding,sourceIdentity:{algorithm:'sha256',encoding:'utf16le',
        modules:[{id:'compiler.mjs',filename:'compiler.eli',sha256:exactSourceHash('(module compiler)')}],
        runtime:{filename:'bootstrap/runtime/original😀.eli',sha256:exactSourceHash(source)}},
      artifactIdentity:{algorithm:'sha256',files:[
        {path:'compiler.mjs',bytes:compilerBytes.length,sha256:sha256SourceArchive(compilerBytes)},
        {path:runtimePath,bytes:bytes.length,sha256:sha256SourceArchive(bytes)},
      ]}};
    await operation({directory,artifact,source,bytes,path:resolve(directory,runtimePath)});
  }finally{await rm(directory,{recursive:true,force:true});}
}

test('default runtime assets use declared byte and exact UTF16 identities including BOM and JSON-transported lone surrogates',async()=>{
  for(const [source,encoding]of[['\uFEFF; runtime 中😀é','utf8'],['\uFEFF; runtime \ud800 \udc00 \ufffd','json-utf16']]){
    await runtimeAssetFixture(source,encoding,async({artifact})=>{
      const session=await openCompilerArtifact(artifact);
      try{
        const first=await session.request({operation:'runtime'});
        assert.equal(first.source,source);assert.equal(first.filename,'bootstrap/runtime/original😀.eli');assert.equal(first.calls,1);
        const second=await session.request({operation:'runtime',filename:'caller.eli'});
        assert.equal(second.source,source);assert.equal(second.filename,'caller.eli');assert.equal(second.calls,2);
      }finally{await session.close();}
    });
  }
});

test('failed default runtime asset reads can retry against the original declaration without dispatching failed source',async()=>{
  await runtimeAssetFixture('\uFEFF; exact 中😀','utf8',async({artifact,bytes,path})=>{
    await writeFile(path,Buffer.from([0xef,0xbb,0xbf,0xc0,0xaf]));
    const session=await openCompilerArtifact(artifact);
    try{
      await assert.rejects(()=>session.request({operation:'runtime'}),/changed after emission/);
      await writeFile(path,bytes);
      const result=await session.request({operation:'runtime'});
      assert.equal(result.calls,1);assert.equal(result.source,'\uFEFF; exact 中😀');
    }finally{await session.close();}
  });
});

test('explicit runtime source and explicit undefined are never replaced with a default asset and cancellation or close prevents late dispatch',async()=>{
  await runtimeAssetFixture('asset source','utf8',async({artifact,path})=>{
    await rm(path);
    const session=await openCompilerArtifact(artifact);
    try{
      const result=await session.request({operation:'runtime',source:'caller source',filename:'caller.eli'});
      assert.equal(result.source,'caller source');assert.equal(result.filename,'caller.eli');assert.equal(result.calls,1);
      const explicitUndefined=await session.request({operation:'runtime',source:undefined});
      assert.equal(explicitUndefined.source,undefined);assert.equal(explicitUndefined.calls,2);
      const control=new AbortController(),reason=new Error('cancel default asset');control.abort(reason);
      assert.throws(()=>session.request({operation:'runtime'},{signal:control.signal}),error=>error===reason);
    }finally{await session.close();}
    assert.throws(()=>session.request({operation:'runtime'}),/closed/);
  });
  await runtimeAssetFixture('pending source','utf8',async({artifact})=>{
    const session=await openCompilerArtifact(artifact),pending=session.request({operation:'runtime'});
    await session.close();await assert.rejects(pending,/closed/);
  });
});

test('default runtime loading refuses a missing byte binding or mismatched exact source identity',async()=>{
  for(const mutation of ['file','source','filename','encoding','hash'])await runtimeAssetFixture('original runtime','utf8',async({artifact})=>{
    if(mutation==='file')artifact.artifactIdentity.files=artifact.artifactIdentity.files.filter(file=>file.path!==artifact.runtimePath);
    else if(mutation==='source')delete artifact.sourceIdentity.runtime;
    else if(mutation==='filename')delete artifact.sourceIdentity.runtime.filename;
    else if(mutation==='encoding')artifact.sourceIdentity.encoding='utf8';
    else artifact.sourceIdentity.runtime.sha256='0'.repeat(64);
    const session=await openCompilerArtifact(artifact);
    try{await assert.rejects(()=>session.request({operation:'runtime'}),/identity/);}
    finally{await session.close();}
  });
});
