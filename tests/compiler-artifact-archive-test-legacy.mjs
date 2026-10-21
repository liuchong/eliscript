import {test,spyOn} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,access,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import * as fileIO from 'node:fs/promises';
import * as metadataCodec from '../tools/backends/compiler-metadata.mjs';
import {archiveCompilerArtifact,archiveCompilerSources,readArchivedCompilerSources,compilerSourceIdentity,compilerFailure,bootstrapCompilerChain,openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {buildIndependentCompiler,independentCompilerProductIdentity,loadCompilerSources} from '../tools/backends/compiler-build.mjs';
import {decodeCompilerSourceAsset,encodeCompilerIR} from '../tools/backends/compiler-session.mjs';
import {packageIndependentCompiler} from '../tools/backends/compiler-package.mjs';
import {readCompilerMetadata} from '../tools/backends/compiler-metadata.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

function observeBoundedArtifactResources(paths){
  const owned=new Set(paths.map(path=>resolve(path))),original=fileIO.readFile;let wholeReads=0;
  const observer=spyOn(fileIO,'readFile').mockImplementation(function(path,...args){
    const local=typeof path==='string'?path:Buffer.isBuffer(path)?path.toString('utf8'):
      path instanceof URL&&path.protocol==='file:'?fileURLToPath(path):undefined;
    if(local!==undefined&&owned.has(resolve(local))){
      wholeReads++;throw new Error('authenticated artifact resources must use bounded reads instead of whole-file readFile');
    }
    return Reflect.apply(original,this,[path,...args]);
  });
  return{assertBounded(){assert.equal(wholeReads,0,'all original resource identities and source values must use the bounded production path');},
    restore(){observer.mockRestore();}};
}

test('internally loaded compiler sources retain the complete private graph and actual source identities', async () => {
  const directory=await mkdtemp(join(tmpdir(),'eliscript-private-source-graph-'));
  const expected=await loadCompilerSources({sourceRoot:root});
  const requests=[],phases=[],observerFailure={observer:true};
  let phaseOverflow=false;
  const onPhase=(phase,scalars)=>{if(phases.length<32)phases.push({phase,scalars});else phaseOverflow=true;throw observerFailure;};
  // This producer tests build I/O ownership only. It claims no compilation or
  // semantic acceptance; every real source record must still reach it intact.
  const producer={host:'javascript',request(request){
    requests.push(request);
    if(request.operation==='runtime'){
      assert.equal(request.source,expected.runtime.source);
      assert.equal(request.filename,expected.runtime.filename);
      assert.deepEqual(request.literalSources,expected.literalSources);
      return{ready:true,revision:1};
    }
    assert.equal(request.operation,'project');assert.deepEqual(request.modules,expected.modules);
    assert.equal(request.entry,expected.entry);
    return{target:'javascript',revision:1,modules:request.modules.map(module=>({id:module.id,javascript:'export {};\n'}))};
  }};
  try{
    const artifact=await buildIndependentCompiler({host:'javascript',outputRoot:directory,sourceRoot:root,session:producer,onPhase});
    assert.deepEqual(requests.map(request=>request.operation),['runtime','project']);
    assert.deepEqual(artifact.provenance.compiledModuleIds,expected.modules.map(module=>module.id));
    assert.deepEqual(artifact.sourceIdentity.modules,expected.modules.map(module=>({id:module.id,filename:module.filename,
      sha256:createHash('sha256').update(module.source,'utf16le').digest('hex')})));
    assert.deepEqual(artifact.sourceIdentity.runtime,{filename:expected.runtime.filename,
      sha256:createHash('sha256').update(expected.runtime.source,'utf16le').digest('hex')});
    assert.deepEqual(artifact.sourceIdentity.literalSources,expected.literalSources.map(module=>({id:module.id,filename:module.filename,
      sha256:createHash('sha256').update(module.source,'utf16le').digest('hex')})));
    // Assertions stay outside the observer: its deliberate exceptions are
    // secondary diagnostics, so failures inside it would otherwise be hidden.
    assert.deepEqual(phases.map(record=>record.phase),['sources-start','sources-complete','runtime-start','runtime-complete',
      'project-start','project-complete','javascript-files-start','javascript-files-complete','file-identities-start',
      'file-identities-complete','product-identity-start','product-identity-complete','artifact-metadata-start','artifact-metadata-complete']);
    assert(phases.length<=32);assert.equal(phaseOverflow,false);
    for(const{scalars}of phases){
      assert(Object.isFrozen(scalars));assert.equal(Object.getPrototypeOf(scalars),Object.prototype);
      assert.equal(scalars.host,'javascript');
      for(const[key,value]of Object.entries(scalars)){
        assert(['host','byteLength','fileCount'].includes(key));
        if(key!=='host')assert(Number.isSafeInteger(value)&&value>=0);
      }
    }
    assert.equal(phases.find(record=>record.phase==='file-identities-complete').scalars.fileCount,artifact.artifactIdentity.files.length);
    assert(requests.every(request=>!Object.hasOwn(request,'onPhase')&&!Object.hasOwn(request,'phaseObserver')));
    assert.equal(Object.hasOwn(artifact,'onPhase'),false);assert.equal(Object.hasOwn(artifact,'phaseObserver'),false);
    const stored=JSON.parse(await readFile(artifact.metadataPath,'utf8'));
    assert.deepEqual(stored.sourceIdentity,artifact.sourceIdentity);
    assert.equal(Object.hasOwn(stored,'onPhase'),false);assert.equal(Object.hasOwn(stored,'phaseObserver'),false);
    const fresh=await loadCompilerSources({sourceRoot:root});
    assert.notEqual(fresh.modules,requests[1].modules);
    assert.notEqual(fresh.modules[0],requests[1].modules[0]);
    assert.deepEqual(fresh,expected,'a later load still owns a fresh complete source graph');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('phase observer failures preserve the original producer thrown values without starting later build phases', async () => {
  const directory=await mkdtemp(join(tmpdir(),'eliscript-phase-first-throw-'));
  const sources={entry:'entry.mjs',modules:[{id:'entry.mjs',filename:'entry.eli',source:'(module entry)'}],
    runtime:{filename:'runtime.eli',source:'(module runtime)'}};
  const observerFailure={observer:true};
  try{
    for(const[index,reason]of [undefined,false,{original:true},new Error('original producer')].entries()){
      const phases=[],requests=[];
      const producer={host:'javascript',request(request){requests.push(request);throw reason;}};
      let threw=false;
      try{
        await buildIndependentCompiler({host:'wasm',sources,session:producer,outputRoot:resolve(directory,String(index)),
          onPhase(phase,scalars){phases.push({phase,scalars});throw observerFailure;}});
      }catch(error){threw=true;assert.strictEqual(error,reason);}
      assert(threw);assert.deepEqual(requests.map(request=>request.operation),['runtime']);
      assert.deepEqual(phases.map(record=>record.phase),['sources-start','sources-complete','runtime-start']);
      assert(phases.length<=32);
      for(const{scalars}of phases){assert(Object.isFrozen(scalars));assert.deepEqual(scalars,{host:'wasm'});}
      assert(requests.every(request=>!Object.hasOwn(request,'onPhase')&&!Object.hasOwn(request,'phaseObserver')));
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('explicit compiler source graphs keep their original getter snapshot and asynchronous caller isolation', async () => {
  const directory=await mkdtemp(join(tmpdir(),'eliscript-supplied-source-graph-'));
  let reads=0,requests=0;
  const original='(module original)',runtime='(module runtime)',literal='(module literal)';
  const record={id:'entry.mjs',filename:'entry.eli',get source(){reads++;return original;}};
  const supplied={entry:'entry.mjs',modules:[record],runtime:{filename:'runtime.eli',source:runtime},
    literalSources:[{id:'stdlib/literal.mjs',filename:'literal.eli',source:literal}]};
  const producer={host:'javascript',async request(request){
    requests++;
    if(request.operation==='runtime'){
      assert.equal(reads,1,'structuredClone reads the supplied source getter once');
      assert.equal(request.source,runtime);assert.equal(request.literalSources[0].source,literal);
      supplied.modules.splice(0,1,{id:'changed.mjs',filename:'changed.eli',source:'(module changed)'});
      supplied.runtime.source='changed';supplied.literalSources[0].source='changed';
      await Promise.resolve();return{ready:true,revision:1};
    }
    assert.equal(request.operation,'project');assert.equal(request.entry,'entry.mjs');
    assert.deepEqual(request.modules,[{id:'entry.mjs',filename:'entry.eli',source:original}]);
    return{target:'javascript',revision:1,modules:[{id:'entry.mjs',javascript:'export {};\n'}]};
  }};
  try{
    const artifact=await buildIndependentCompiler({host:'javascript',outputRoot:directory,
      sourceRoot:join(directory,'must-not-load'),sources:supplied,session:producer});
    assert.equal(reads,1);assert.equal(requests,2);
    assert.equal(artifact.entry,'entry.mjs');
    assert.equal(artifact.sourceIdentity.modules[0].sha256,createHash('sha256').update(original,'utf16le').digest('hex'));
    assert.equal(artifact.sourceIdentity.runtime.sha256,createHash('sha256').update(runtime,'utf16le').digest('hex'));
    assert.equal(artifact.sourceIdentity.literalSources[0].sha256,createHash('sha256').update(literal,'utf16le').digest('hex'));
    assert.equal(await readFile(artifact.path,'utf8'),'export {};\n');
    assert.equal(await readFile(artifact.runtimePath,'utf8'),runtime);
    assert.equal(artifact.literalSources[0].id,'stdlib/literal.mjs');
    assert.equal(await readFile(artifact.literalSources[0].path,'utf8'),literal);
    const metadata=JSON.parse(await readFile(join(directory,'compiler-artifact.json'),'utf8'));
    assert.deepEqual(metadata.sourceIdentity,artifact.sourceIdentity);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('built and relocated compiler source assets retain isolated surrogate code units through the actual loaders', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eliscript-source-codeunits-'));
  const runtime = '\uFEFF; original runtime \ud800😀\n(module runtime)', literal = '\uFEFF; original library \udc00中\n(module library)';
  const entry = 'host/compiler-session.mjs';
  // Only the transport driver is synthetic: it returns the exact request
  // consumed by the real artifact/package loaders, without claiming to compile.
  const driver = `export function compiler_session_new(){return {runtime:null};}
export function compiler_session_close(state){state.runtime=null;}
export function compiler_session_request(state,text){const request=JSON.parse(text);if(request.operation==='capabilities')return JSON.stringify({runtime:state.runtime});state.runtime=request;return JSON.stringify(request);}`;
  const sources = {entry, modules: [{id: entry, filename: 'host/compiler-session.eli', source: '(module transport)'}],
    runtime: {filename: 'bootstrap/runtime/memory.eli', source: runtime},
    literalSources: [{id: 'stdlib/bit.mjs', filename: 'stdlib/bit.eli', source: literal}]};
  const producer = {host: 'javascript', async request(request) {
    if (request.operation === 'runtime') return {ready: true, revision: 1};
    assert.equal(request.operation, 'project');return {target: 'javascript', revision: 1, modules: [{id: entry, javascript: driver}]};
  }};
  try {
    const artifact = await buildIndependentCompiler({host: 'javascript', outputRoot: join(directory, 'artifact'), sources, session: producer});
    assert.equal(artifact.runtimeEncoding, 'json-utf16');assert(artifact.runtimePath.endsWith('.eli.json'));
    assert.equal(artifact.literalSources[0].encoding, 'json-utf16');assert(artifact.literalSources[0].path.endsWith('.eli.json'));
    assert.equal(decodeCompilerSourceAsset(await readFile(artifact.runtimePath), artifact.runtimeEncoding), runtime);
    assert.equal(decodeCompilerSourceAsset(await readFile(artifact.literalSources[0].path), artifact.literalSources[0].encoding), literal);
    const session = await openCompilerArtifact(artifact);
    try {
      const observed = await session.request({operation: 'runtime'});
      assert.equal(observed.source, runtime);assert.equal(observed.filename, sources.runtime.filename);
      assert.deepEqual(observed.literalSources, sources.literalSources);
    } finally {await session.close();}
    const packaged = await packageIndependentCompiler({artifact, outputRoot: join(directory, 'package')});
    const {openCompilerPackage} = await import(pathToFileURL(join(packaged.directory, 'compiler-loader.mjs')).href);
    const installed = await openCompilerPackage();
    try {
      await installed.loadRuntime();
      const observed = await installed.request({operation: 'capabilities'});
      assert.equal(observed.runtime.source, runtime);assert.deepEqual(observed.runtime.literalSources, sources.literalSources);
      assert.equal(installed.artifact.runtimeEncoding, 'json-utf16');
      assert.equal(installed.artifact.literalSources[0].encoding, 'json-utf16');
    } finally {await installed.close();}
  } finally {await rm(directory, {recursive: true, force: true});}
});

async function defaultSourceArtifactInChild(sources,directory,started){
  // End the seed VM before importing its actual product in the reference VM:
  // ESM caches otherwise keep both generations' modules and JIT pages alive.
  // Both VMs exit before the parent publishes its runtime/literal cache; only
  // the one real artifact and complete reference text files cross lifetimes.
  const outputRoot=join(directory,'compiler');
  function runChild(source,label){
    const remaining=120000-(Date.now()-started);
    assert(remaining>0,'the original complete source-assets deadline must remain available');
    const args=process.versions.bun?['--smol','--eval',source]:['--input-type=module','--eval',source];
    const child=spawnSync(process.execPath,args,{cwd:process.cwd(),encoding:'utf8',input:JSON.stringify(sources),
      timeout:remaining,killSignal:'SIGKILL',maxBuffer:65536,stdio:['pipe','pipe','inherit']});
    assert.equal(child.error,undefined,label+': '+(child.error?.message??''));
    assert.equal(child.signal,null,label+' signal: '+child.signal);
    assert.equal(child.status,0,label+' exit: '+child.status+'; see inherited stderr');
    return JSON.parse(child.stdout.trim());
  }
  const built=runChild(`
import {readFileSync} from 'node:fs';
import {buildIndependentCompiler} from ${JSON.stringify(new URL('../tools/backends/compiler-build.mjs',import.meta.url).href)};
const sources=JSON.parse(readFileSync(0,'utf8'));
const artifact=await buildIndependentCompiler({host:'javascript',outputRoot:${JSON.stringify(outputRoot)},
  sources,profile:'full-runtime',retainIR:false,debug:false});
console.log(JSON.stringify({host:artifact.host,metadataPath:artifact.metadataPath}));
`,'owned complete source seed fixture');
  assert.deepEqual(Object.keys(built),['host','metadataPath']);assert.equal(built.host,'javascript');
  assert.equal(built.metadataPath,join(outputRoot,'compiler-artifact.json'));
  const result=runChild(`
import {readFileSync} from 'node:fs';
import {mkdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {openCompilerArtifact} from ${JSON.stringify(new URL('../tools/backends/compiler-bootstrap.mjs',import.meta.url).href)};
import {readCompilerMetadata} from ${JSON.stringify(new URL('../tools/backends/compiler-metadata.mjs',import.meta.url).href)};
const sources=JSON.parse(readFileSync(0,'utf8'));
const metadataPath=${JSON.stringify(join(outputRoot,'compiler-artifact.json'))};
const metadata=await readCompilerMetadata(metadataPath);
const artifact={...metadata,directory:${JSON.stringify(outputRoot)},metadataPath};
const referenceDirectory=${JSON.stringify(join(directory,'references'))};
await mkdir(referenceDirectory);
const reference=await openCompilerArtifact(artifact);
async function saveReference(input,index){
  const result=await reference.request({operation:'compile-ir',source:input.source,filename:input.filename});
  const file=await open(join(referenceDirectory,index<0?'runtime.ir.utf16':String(index).padStart(4,'0')+'.ir.utf16'),'wx');
  let failed=false;
  try{
    // UTF16LE records preserve all original code units, including lone halves.
    // Bounded writes avoid another complete encoded reference beside its IR.
    for(let offset=0;offset<result.ir.length;offset+=32768){
      const bytes=Buffer.from(result.ir.slice(offset,offset+32768),'utf16le');let position=0;
      while(position<bytes.length){
        const {bytesWritten}=await file.write(bytes,position,bytes.length-position,null);
        if(!Number.isInteger(bytesWritten)||bytesWritten<1||bytesWritten>bytes.length-position)
          throw new Error('reference IR write did not advance');
        position+=bytesWritten;
      }
    }
  }catch(error){failed=true;throw error;}
  finally{try{await file.close();}catch(error){if(!failed)throw error;}}
  if(process.env.ELISCRIPT_TEST_TRACE_IR_EXPORT==='1'&&index<128){
    const usage=process.memoryUsage();
    console.error(JSON.stringify({phase:'reference-ir-complete',index,total:sources.literalSources.length,
      units:result.ir.length,rss:usage.rss,heapUsed:usage.heapUsed}));
  }
  return result.ir.length;
}
let runtimeUnits,literalUnits=[],referenceFailed=false;
try{
  runtimeUnits=await saveReference(sources.runtime,-1);
  for(const [index,input]of sources.literalSources.entries())literalUnits.push(await saveReference(input,index));
}catch(error){referenceFailed=true;throw error;}
finally{try{await reference.close();}catch(error){if(!referenceFailed)throw error;}}
console.log(JSON.stringify({host:artifact.host,metadataPath:artifact.metadataPath,runtimeUnits,literalUnits}));
`,'owned complete source reference fixture');
  assert.deepEqual(Object.keys(result),['host','metadataPath','runtimeUnits','literalUnits']);assert.equal(result.host,'javascript');
  assert.equal(result.metadataPath,join(outputRoot,'compiler-artifact.json'));
  assert(Number.isSafeInteger(result.runtimeUnits)&&result.runtimeUnits>0);
  assert(Array.isArray(result.literalUnits));assert.equal(result.literalUnits.length,sources.literalSources.length);
  assert(result.literalUnits.every(units=>Number.isSafeInteger(units)&&units>0));
  const metadata=await readCompilerMetadata(result.metadataPath);
  assert.equal(metadata.host,'javascript');
  return{artifact:{...metadata,directory:outputRoot,metadataPath:result.metadataPath,path:resolve(outputRoot,metadata.path),
      runtimePath:resolve(outputRoot,metadata.runtimePath),
      literalSources:metadata.literalSources?.map(item=>({...item,path:resolve(outputRoot,item.path)}))},
    references:{directory:join(directory,'references'),runtimeUnits:result.runtimeUnits,literalUnits:result.literalUnits}};
}

async function assertCompleteReferenceIR(text,path,units,label,openFile=open){
  assert.equal(typeof text,'string');assert.equal(text.length,units,label+': complete reference UTF16 length must match');
  const file=await openFile(path,'r'),buffer=Buffer.allocUnsafe(65536);let offset=0,failed=false;
  try{
    for(;;){
      const {bytesRead}=await file.read(buffer,0,buffer.length,null);
      if(!bytesRead)break;
      assert(offset+bytesRead<=units*2,label+': reference has unexpected trailing bytes');
      // Account for arbitrary short reads, including an odd byte boundary.
      const start=Math.floor(offset/2),skip=offset%2;
      const expected=Buffer.from(text.slice(start,start+Math.ceil((skip+bytesRead)/2)),'utf16le');
      assert(buffer.subarray(0,bytesRead).equals(expected.subarray(skip,skip+bytesRead)),
        label+': complete IR byte content differs in block at byte '+offset);
      offset+=bytesRead;
    }
    assert.equal(offset,units*2,label+': every reference UTF16 code unit must be read and compared');
  }catch(error){failed=true;throw error;}
  finally{try{await file.close();}catch(error){if(!failed)throw error;}}
}

function assertCompleteCompilerRecord(actual,expected){
  // Compare every field and text code unit, but never give the assertion
  // formatter the two complete exported IR records if that comparison fails.
  assert.equal(isDeepStrictEqual(actual,expected),true,
    'the complete cached runtime record must survive a failed replacement unchanged');
}

function compilerRecordMetadata(record){
  const descriptors=Object.getOwnPropertyDescriptors(record);
  delete descriptors.ir;delete descriptors.canonicalIR;
  return Object.create(Object.getPrototypeOf(record),descriptors);
}

async function storeCompilerRecord(record,directory){
  const snapshot={metadata:compilerRecordMetadata(record)};
  for(const field of ['ir','canonicalIR']){
    assert(Object.hasOwn(record,field),'a complete cached record must contain both text fields');
    const text=record[field];assert.equal(typeof text,'string');
    const path=join(directory,'cached-runtime.'+field+'.utf16');
    const file=await open(path,'wx');let failed=false;
    try{
      for(let offset=0;offset<text.length;offset+=32768){
        const bytes=Buffer.from(text.slice(offset,offset+32768),'utf16le');let position=0;
        while(position<bytes.length){
          const {bytesWritten}=await file.write(bytes,position,bytes.length-position,null);
          assert(Number.isInteger(bytesWritten)&&bytesWritten>0&&bytesWritten<=bytes.length-position,
            'cached record text writes must advance within the current bounded block');
          position+=bytesWritten;
        }
      }
    }catch(error){failed=true;throw error;}
    finally{try{await file.close();}catch(error){if(!failed)throw error;}}
    snapshot[field]={path,units:text.length,enumerable:Object.prototype.propertyIsEnumerable.call(record,field)};
  }
  return snapshot;
}

async function assertStoredCompilerRecord(actual,snapshot,openFile=open){
  assertCompleteCompilerRecord(compilerRecordMetadata(actual),snapshot.metadata);
  for(const field of ['ir','canonicalIR']){
    assert(Object.hasOwn(actual,field),'a recovered cached record must contain both text fields');
    assert.equal(Object.prototype.propertyIsEnumerable.call(actual,field),snapshot[field].enumerable,
      'recovered cached text fields must retain their own enumerable presence');
    await assertCompleteReferenceIR(actual[field],snapshot[field].path,snapshot[field].units,
      'the complete recovered cached '+field,openFile);
  }
}

test('complete compiler record failures remain bounded without weakening strict Unicode or numeric equality',()=>{
  const text='private IR body 😀\ud800中'.repeat(2048);
  const expected={id:'runtime',filename:'原😀\udc00.eli',revision:1,stage:'frontend',ir:text,
    canonicalIR:text+'\udfff',nested:{zero:-0,optional:undefined}};
  assertCompleteCompilerRecord(structuredClone(expected),expected);
  const variants=[
    {...expected,ir:text.slice(0,-1)+'文'},
    {...expected,canonicalIR:text+'\udffe'},
    {...expected,revision:'1'},
    {...expected,nested:{zero:0,optional:undefined}},
    {...expected,nested:{zero:-0}},
    {...expected,extra:undefined},
    Object.assign(Object.create(null),expected),
  ];
  for(const actual of variants){
    assert.throws(()=>assertCompleteCompilerRecord(actual,expected),error=>{
      assert(error instanceof assert.AssertionError);
      assert.equal(error.actual,false);assert.equal(error.expected,true);
      assert(error.message.length<256,'a strict comparison failure must have a bounded report');
      assert.equal(error.message.includes('private IR body'),false);
      return true;
    });
  }
});

test('stored complete compiler records compare both full UTF16 texts through short reads without retaining the record',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eliscript-cached-record-text-'));
  const ir='a'.repeat(32767)+'😀\ud800中\udc00'+'private IR body'.repeat(2600);
  const record={id:'runtime',filename:'原😀\ud800.eli',revision:1,stage:'frontend',ir,
    canonicalIR:'\udfff'+ir+'\ud800',nested:{zero:-0,optional:undefined}};
  const unchanged=structuredClone(record);let shortReads=0;
  const openShort=async(...args)=>{
    const file=await open(...args),sizes=[1,65535,3,32768];
    return{read(buffer,offset,length,position){
      return file.read(buffer,offset,Math.min(length,sizes[shortReads++%sizes.length]),position);
    },close(){return file.close();}};
  };
  const boundedFailure=error=>{
    assert(error instanceof assert.AssertionError);
    assert(error.message.length<512,'stored text failures must not format either complete IR');
    assert.equal(error.message.includes('private IR body'),false);return true;
  };
  try{
    const snapshot=await storeCompilerRecord(record,directory);
    assert.equal(Object.hasOwn(snapshot.metadata,'ir'),false);
    assert.equal(Object.hasOwn(snapshot.metadata,'canonicalIR'),false);
    assert.deepEqual(Object.keys(snapshot.ir),['path','units','enumerable']);
    assert.deepEqual(Object.keys(snapshot.canonicalIR),['path','units','enumerable']);
    await assertStoredCompilerRecord(record,snapshot,openShort);
    assert(shortReads>4,'both actual files must be compared across odd and short block boundaries');
    for(const changed of [
      {...record,ir:ir.slice(0,-1)+'x'},
      {...record,canonicalIR:'\udffe'+record.canonicalIR.slice(1)},
      {...record,ir:ir+'x'},
      {...record,canonicalIR:record.canonicalIR.slice(1)},
      {...record,nested:{zero:0,optional:undefined}},
      {...record,nested:{zero:-0}},
      {...record,revision:'1'},
      {...record,extra:undefined},
      Object.assign(Object.create(null),record),
    ])await assert.rejects(()=>assertStoredCompilerRecord(changed,snapshot,openShort),boundedFailure);
    const missing={...record};delete missing.ir;
    await assert.rejects(()=>assertStoredCompilerRecord(missing,snapshot),boundedFailure);
    const hidden={...record};Object.defineProperty(hidden,'canonicalIR',{enumerable:false});
    await assert.rejects(()=>assertStoredCompilerRecord(hidden,snapshot),boundedFailure);
    for(const field of ['ir','canonicalIR']){
      const bytes=await readFile(snapshot[field].path);
      try{
        await writeFile(snapshot[field].path,bytes.subarray(0,bytes.length-1));
        await assert.rejects(()=>assertStoredCompilerRecord(record,snapshot,openShort),boundedFailure);
        await writeFile(snapshot[field].path,Buffer.concat([bytes,Buffer.from([0])]));
        await assert.rejects(()=>assertStoredCompilerRecord(record,snapshot,openShort),boundedFailure);
      }finally{await writeFile(snapshot[field].path,bytes);}
    }
    await assertStoredCompilerRecord(record,snapshot,openShort);
    assertCompleteCompilerRecord(record,unchanged);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('a complete independent compiler consumes authenticated JSON-UTF16 default sources and recovers without losing its cached IR', async () => {
  const started=Date.now();
  const directory = await mkdtemp(join(tmpdir(), 'eliscript-real-source-assets-'));
  let sources = await loadCompilerSources();
  // Comments change source identity and spans without replacing any compiler,
  // runtime or library algorithm. Both assets require the reversible codec.
  sources.runtime.source = '; runtime \uFEFF\ud800😀\r\n' + sources.runtime.source;
  assert(sources.literalSources.length > 0);
  sources.literalSources[0].source = '; literal \uFEFF\udc00中\r\n' + sources.literalSources[0].source;
  let session,resourceObserver;
  try {
    // Exercise the source archive with this same complete fixture before its
    // original single compiler generation. Only the restored source graph
    // crosses into that generation; no second compiler or retained IR is made.
    const sourceDirectory=join(directory,'source-archive');
    const sourceIdentity=await archiveCompilerSources(sources,sourceDirectory);
    sources=await(async()=>{
      const restored=await readArchivedCompilerSources(sourceDirectory,{expectedIdentity:sourceIdentity});
      assert(isDeepStrictEqual(restored,sources),'the complete source archive must preserve every original source code unit and optional field');
      assert.deepEqual(compilerSourceIdentity(restored),sourceIdentity);
      return restored;
    })();
    const {artifact,references} = await defaultSourceArtifactInChild(sources,directory,started);
    console.info('complete default source assets: JavaScript compiler build finished');
    assert.equal(artifact.runtimeEncoding, 'json-utf16');
    assert.equal(artifact.literalSources[0].encoding, 'json-utf16');
    const moduleIdentities=new Map(sourceIdentity.modules.map(record=>[record.id,record]));
    const compactIdentity=record=>({id:record.id,filename:record.filename,sha256:record.sha256});
    assert.deepEqual(artifact.sourceIdentity.modules,sources.modules.map(record=>compactIdentity(moduleIdentities.get(record.id))));
    assert.deepEqual(artifact.sourceIdentity.runtime,{filename:sourceIdentity.runtime.filename,sha256:sourceIdentity.runtime.sha256});
    assert.deepEqual(artifact.sourceIdentity.literalSources,sourceIdentity.literalSources.map(compactIdentity));
    assert.deepEqual(artifact.provenance.compiledModuleIds.slice().sort(), sources.modules.map(item => item.id).sort());
    assert.equal(artifact.provenance.runtimeCompiled, true);
    for (const field of ['frontendIR', 'runtimeIR', 'literalIR', 'typed', 'lowered']) {
      assert.equal(Object.hasOwn(artifact, field), false,
        'the complete JS product without retainIR must publish only its requested artifacts: ' + field);
    }
    let phaseCount=0;
    const literalPhase=(phase,index,units=0,canonicalUnits=0)=>{
      if(process.env.ELISCRIPT_TEST_TRACE_IR_EXPORT!=='1'||phaseCount++>=256)return;
      const usage=process.memoryUsage();
      console.info(JSON.stringify({phase,index,total:sources.literalSources.length,units,canonicalUnits,
        rss:usage.rss,heapUsed:usage.heapUsed,heapTotal:usage.heapTotal}));
    };
    await (async()=>{
      const runtimeBytes=await readFile(artifact.runtimePath),literalAsset=artifact.literalSources[0];
      const literalBytes=await readFile(literalAsset.path);
      assert.equal(decodeCompilerSourceAsset(runtimeBytes,artifact.runtimeEncoding),sources.runtime.source);
      assert.equal(decodeCompilerSourceAsset(literalBytes,literalAsset.encoding),sources.literalSources[0].source);
      // The baseline above intentionally inspects the saved bytes. The real
      // loader below must authenticate JS and decode every default source
      // without duplicating any of those complete files in a readFile buffer.
      resourceObserver=observeBoundedArtifactResources([artifact.runtimePath,
        ...artifact.literalSources.map(record=>record.path),
        ...artifact.modules.map(record=>resolve(artifact.directory,record.path))]);
      session = await openCompilerArtifact(artifact);
      const loadingController = new AbortController(), loadingReason = new Error('cancel while authentic default assets are loading');
      const cancelledLoad = session.request({operation: 'runtime'}, {signal: loadingController.signal});
      loadingController.abort(loadingReason);
      await assert.rejects(cancelledLoad, error => error === loadingReason);
      for (const [path, bytes] of [[artifact.runtimePath, runtimeBytes], [literalAsset.path, literalBytes]]) {
        const corrupted = Buffer.from(bytes);corrupted[corrupted.length - 1] ^= 1;
        await writeFile(path, corrupted);
        try {await assert.rejects(() => session.request({operation: 'runtime'}), /hash|SHA-256|identity/);}
        finally {await writeFile(path, bytes);}
      }
    })();
    literalPhase('runtime-cache-publish-start',-1);
    const ready = await session.request({operation: 'runtime'});
    resourceObserver.assertBounded();
    literalPhase('runtime-cache-publish-complete',-1);
    console.info('complete default source assets: authenticated runtime compilation finished');
    assert.equal(ready.ready, true);assert.equal(ready.filename, sources.runtime.filename);assert.equal(ready.revision, 1);
    assert.equal((await session.request({operation:'capabilities'})).responseStringChunks,true);
    const cachedIROptions=Object.freeze({responseMode:'events-v1',responseStringChunks:true});
    const cachedSnapshot=await(async()=>{
    let cached;
    if (process.env.ELISCRIPT_TEST_TRACE_IR_EXPORT === '1') {
      // Bounded diagnostic only: preserve every intrinsic call and exact result,
      // reporting lengths rather than source text or exported IR contents.
      const stringify=JSON.stringify;let observed=0;
      console.info('cached runtime IR export memory before',process.memoryUsage());
      JSON.stringify=function(...args){
        if(typeof args[0]==='string'&&args[0].length>=1048576&&observed++<8)
          console.info('cached runtime IR stringify long token',args[0].length,process.memoryUsage());
        return Reflect.apply(stringify,this,args);
      };
      try{cached=await session.request({operation:'cached-ir',kind:'runtime',revision:ready.revision},cachedIROptions);}
      finally{JSON.stringify=stringify;}
    }else cached = await session.request({operation: 'cached-ir', kind: 'runtime', revision: ready.revision},cachedIROptions);
    literalPhase('runtime-ir-export-complete',-1,cached.ir.length,cached.canonicalIR?.length??0);
    console.info('complete default source assets: cached runtime IR exported');
    await assertCompleteReferenceIR(cached.ir,join(references.directory,'runtime.ir.utf16'),references.runtimeUnits,
      'the default asset must compile the original code units and spans');
    console.info('complete default source assets: independent runtime IR comparison completed');
    literalPhase('runtime-ir-record-store-start',-1,cached.ir.length,cached.canonicalIR?.length??0);
    const snapshot=await storeCompilerRecord(cached,directory);
    cached=undefined;
    literalPhase('runtime-ir-record-stored',-1,snapshot.ir.units,snapshot.canonicalIR.units);
    return snapshot;
    })();
    async function compareLiteral(input,index){
      literalPhase('literal-ir-request-start',index);
      const retained = await session.request({operation: 'cached-ir', kind: 'literal', id: input.id, revision: ready.literalRevision},cachedIROptions);
      literalPhase('literal-ir-export-complete',index,retained.ir.length,retained.canonicalIR?.length??0);
      await assertCompleteReferenceIR(retained.ir,join(references.directory,String(index).padStart(4,'0')+'.ir.utf16'),
        references.literalUnits[index],input.id);
      literalPhase('literal-ir-complete',index,retained.ir.length,retained.canonicalIR?.length??0);
    }
    for (const [index,input] of sources.literalSources.entries()) {
      await compareLiteral(input,index);
    }
    let diagnostic;
    literalPhase('runtime-invalid-replacement-start',-1);
    await assert.rejects(() => session.request({operation: 'runtime', source: '(defun broken () missing)', filename: 'bad-runtime.eli'}), error => {
      diagnostic = error.eliscriptDiagnostic;return diagnostic?.code === 'ELI-A0001';
    });
    assert.equal(diagnostic.location.file, 'bad-runtime.eli');
    literalPhase('runtime-invalid-replacement-rejected',-1);
    await(async()=>{
      literalPhase('runtime-recovery-ir-request-start',-1);
      const recovered=await session.request({operation:'cached-ir',kind:'runtime',revision:ready.revision},cachedIROptions);
      literalPhase('runtime-recovery-ir-export-complete',-1,recovered.ir.length,recovered.canonicalIR?.length??0);
      await assertStoredCompilerRecord(recovered,cachedSnapshot);
      literalPhase('runtime-recovery-ir-comparison-complete',-1,recovered.ir.length,recovered.canonicalIR?.length??0);
    })();
    assert.deepEqual(await session.request({operation: 'runtime'}), ready);
    const reason = new Error('cancel before default source dispatch'), controller = new AbortController();controller.abort(reason);
    await assert.rejects(async () => session.request({operation: 'runtime'}, {signal: controller.signal}), error => error === reason);
    assert.deepEqual(await session.request({operation: 'runtime'}), ready);
    await session.close();assert.equal(session.closed, true);await session.close();
    await assert.rejects(async () => session.request({operation: 'runtime'}), /closed/);
    // A fresh real module state after disposal must start at revision one.
    session = await openCompilerArtifact(artifact);
    const closingLoad = session.request({operation: 'runtime'});
    const closingRejection = assert.rejects(closingLoad, /closed/);
    await session.close();await closingRejection;
    session = await openCompilerArtifact(artifact);
    assert.equal((await session.request({operation: 'runtime'})).revision, 1);
    resourceObserver.assertBounded();
    assert(Date.now()-started<=120000,'the original complete source-assets total deadline remains 120 seconds');
  } finally {resourceObserver?.restore();try {await session?.close();} finally {await rm(directory, {recursive: true, force: true});}}
}, 120000);

async function privateSeedJavaScriptProduct() {
  // Exercise the production scheduler without another full compiler build.
  // The complete original source graph is exercised by the test above.
  const source = await readFile(join(root, 'tools/backends/compiler-build.mjs'), 'utf8');
  const start = source.indexOf('function seedJavaScriptProduct(');
  const end = source.indexOf('\nasync function seedProduct(', start);
  assert(start >= 0 && end > start);
  return new Function('"use strict"; return (' + source.slice(start, end) + ');')();
}

test('internal sequential JS scheduling retains exact output maps origins and the complete runtime compilation', async () => {
  const schedule = await privateSeedJavaScriptProduct();
  const sources = Object.freeze({modules: Object.freeze([
    Object.freeze({id: 'first.mjs', filename: '原😀/first.eli', source: 'first'}),
    Object.freeze({id: 'second.mjs', source: 'second'}),
  ]), runtime: Object.freeze({source: 'complete runtime', filename: 'runtime.eli'})});
  for (const debug of [false, true]) {
    const calls = [];
    const compile = (source, filename) => {
      calls.push(['compile', source, filename]);return Object.freeze({source, filename});
    };
    const emission = program => 'JS:' + program.source;
    const compiler = {
      compile_ir_string: compile,
      compile_ir_string_with_origins(source, filename) {
        return {program: compile(source, filename), macroOrigins: [{source, filename}]};
      },
      emit_ir_string(program) {calls.push(['emit', program.source]);return emission(program);},
      emit_ir_string_with_source_map(program, source, id, filename) {
        calls.push(['emit', program.source]);assert.equal(source, program.source);
        return {javascript: emission(program), sourceMap: JSON.stringify({id, filename})};
      },
    };
    const actual = schedule(sources, compiler, debug);
    assert.deepEqual(calls, [
      ['compile', 'first', '原😀/first.eli'], ['emit', 'first'],
      ['compile', 'second', 'second.mjs'], ['emit', 'second'],
      ['compile', 'complete runtime', 'runtime.eli'],
    ]);
    assert.deepEqual(actual, {target: 'javascript', modules: sources.modules.map(record => ({
      id: record.id, javascript: 'JS:' + record.source,
      ...(debug ? {sourceMap: JSON.stringify({id: record.id, filename: record.filename}),
        macroOrigins: [{source: record.source, filename: record.filename ?? record.id}]} : {}),
    }))});
  }
});

test('internal early JS emission preserves original frontend-first failure identity including undefined throws', async () => {
  const schedule = await privateSeedJavaScriptProduct();
  const sources = {modules: [{id: 'first.mjs', source: 'first'}, {id: 'second.mjs', source: 'second'}],
    runtime: {source: 'runtime', filename: 'runtime.eli'}};
  const emitted = new Error('first emitter failure'), frontend = new Error('later frontend failure');
  for (const debug of [false, true]) for (const failure of ['first', 'second', 'runtime', 'none']) {
    const calls = [];
    const compile = (source, filename) => {
      calls.push('compile:' + source);if (source === failure) throw frontend;
      return {source, filename};
    };
    const emit = program => {calls.push('emit:' + program.source);throw emitted;};
    const compiler = {compile_ir_string: compile, emit_ir_string: emit,
      compile_ir_string_with_origins(source, filename) {return {program: compile(source, filename), macroOrigins: []};},
      emit_ir_string_with_source_map: emit};
    assert.throws(() => schedule(sources, compiler, debug), error => error === (failure === 'none' ? emitted : frontend));
    assert.deepEqual(calls, failure === 'first' ? ['compile:first'] :
      failure === 'second' ? ['compile:first', 'emit:first', 'compile:second'] :
        ['compile:first', 'emit:first', 'compile:second', 'compile:runtime']);
  }
  const compiled = [];
  let caught = false;
  try {
    schedule(sources, {
      compile_ir_string(source) {compiled.push(source);return {source};},
      emit_ir_string() {throw undefined;},
    }, false);
  } catch (error) {caught = true;assert.equal(error, undefined);}
  assert.equal(caught, true, 'an undefined first emitter error must still be rethrown');
  assert.deepEqual(compiled, ['first', 'second', 'runtime']);
  const recovered = schedule(sources, {compile_ir_string: source => ({source}),
    emit_ir_string: program => program.source}, false);
  assert.deepEqual(recovered.modules.map(record => record.javascript), ['first', 'second']);
});

test('an independent build retains one owned source revision while its asynchronous producer yields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eliscript-source-snapshot-'));
  const original = {entry: 'entry.mjs', modules: [{id: 'entry.mjs', filename: 'entry.eli', source: '(defconst marker 42) (export marker)'}],
    runtime: {filename: 'runtime.eli', source: '(module runtime)'},
    literalSources: [{id: 'stdlib/bit.mjs', filename: 'stdlib/bit.eli', source: '(defconst marker "原😀") (export marker)'}],
    hostSources: [{id: 'foreign.mjs', filename: 'foreign.mjs', source: 'export const marker = 42;'}],
    hostModules: [{id: 'original-provider', referrer: 'entry.mjs', specifier: './foreign.mjs', allowedExports: ['marker'], namespace: false}]};
  const supplied = structuredClone(original), received = [];
  // This is a transport producer, not a compiler oracle. The assertion is
  // that requests, persisted assets and identities all refer to one revision.
  const session = {host: 'javascript', async request(request) {
    received.push(structuredClone(request));
    if (request.operation === 'runtime') {
      supplied.entry = 'edited.mjs';
      supplied.modules[0].id = 'edited.mjs';supplied.modules[0].source = '(defconst marker 99)';
      supplied.runtime.source = '(module edited-runtime)';
      supplied.literalSources[0].source = '(defconst marker "edited")';
      supplied.hostSources[0].source = 'export const marker = 99;';
      supplied.hostModules[0].allowedExports.push('edited');
      await Promise.resolve();return {ready: true, revision: 1};
    }
    assert.equal(request.operation, 'project');
    return {target: 'javascript', revision: 1, modules: [{id: 'entry.mjs', javascript: 'export const marker = 42;\n'}]};
  }};
  try {
    const artifact = await buildIndependentCompiler({host: 'javascript', outputRoot: directory, sources: supplied, session});
    assert.equal(artifact.entry, original.entry);
    assert.deepEqual(received[0], {operation: 'runtime', source: original.runtime.source,
      filename: original.runtime.filename, literalSources: original.literalSources});
    assert.deepEqual(received[1].modules, original.modules);
    assert.deepEqual(received[1].hostSources, original.hostSources);
    assert.deepEqual(received[1].hostModules, original.hostModules);
    assert.equal(received[1].entry, original.entry);
    assert.equal(artifact.sourceIdentity.runtime.sha256, sha256(Buffer.from(original.runtime.source, 'utf16le')));
    assert.equal(artifact.sourceIdentity.modules[0].sha256, sha256(Buffer.from(original.modules[0].source, 'utf16le')));
    assert.equal(artifact.sourceIdentity.literalSources[0].sha256, sha256(Buffer.from(original.literalSources[0].source, 'utf16le')));
    assert.equal(artifact.sourceIdentity.hostSources[0].sha256, sha256(Buffer.from(original.hostSources[0].source, 'utf16le')));
    assert.equal(await readFile(artifact.runtimePath, 'utf8'), original.runtime.source);
    assert.equal(await readFile(resolve(directory, artifact.literalSources[0].path), 'utf8'), original.literalSources[0].source);
    assert.equal(await readFile(resolve(directory, artifact.hostSources[0].path), 'utf8'), original.hostSources[0].source);
    assert.equal(supplied.entry, 'edited.mjs', 'the producer edit must not be reverted in the caller');
  } finally {await rm(directory, {recursive: true, force: true});}
});

function bind(artifact,files){
  artifact.artifactIdentity={algorithm:'sha256',files};
  artifact.productIdentity=independentCompilerProductIdentity({host:artifact.host,files,
    descriptor:artifact.descriptor,typed:artifact.typed});
  return artifact;
}
async function fixture(operation){
  const directory=await mkdtemp(join(tmpdir(),'eliscript-artifact-archive-'));
  try{
    const product=join(directory,'product'),archive=join(directory,'archive');
    await mkdir(join(product,'bootstrap'),{recursive:true});
    // Real emitted frontend bytes, with no compiler or runtime build in this
    // transport test. Instantiation and self-hosting have separate contracts.
    const payload=await readFile(join(root,'dist/bootstrap/compiler.mjs'));
    const runtime=await readFile(join(root,'bootstrap/runtime/memory.eli'));
    const path=join(product,'bootstrap/compiler.mjs');
    await writeFile(path,payload);await writeFile(join(product,'runtime.eli'),runtime);
    const files=[{path:'bootstrap/compiler.mjs',bytes:payload.length,sha256:sha256(payload)},
      {path:'runtime.eli',bytes:runtime.length,sha256:sha256(runtime)}];
    const artifact=bind({host:'javascript',entry:'bootstrap/compiler.mjs',path,directory:product,
      provenance:{mode:'seed',producerHost:'javascript',runtimeCompiled:true,compiledModuleIds:['bootstrap/compiler.mjs']}},files);
    await operation({directory,product,archive,artifact,payload,runtime,files});
  }finally{await rm(directory,{recursive:true,force:true});}
}

test('compiler artifact archive binds actual declared files and exact persisted hashes',async()=>{
  await fixture(async({artifact,archive,payload,files})=>{
    const result=await archiveCompilerArtifact(artifact,archive);
    assert.deepEqual(result.files,files);
    assert.equal(result.bytes,payload.length);assert.equal(result.sha256,sha256(payload));
    assert.deepEqual(result.productIdentity,artifact.productIdentity);
    assert.deepEqual(JSON.parse(await readFile(join(archive,'artifact.json'),'utf8')),JSON.parse(JSON.stringify(result)));
    assert.deepEqual(result.provenance,artifact.provenance);
  });
});

test('compiler artifact archive rejects changed bytes and false size or hash bindings',async()=>{
  for(const mutation of ['bytes','size','hash','product'])await fixture(async({artifact,archive,payload})=>{
    if(mutation==='bytes'){
      const changed=Buffer.from(payload);changed[0]^=1;await writeFile(artifact.path,changed);
    }else if(mutation==='size')artifact.artifactIdentity.files[0].bytes++;
    else if(mutation==='hash')artifact.artifactIdentity.files[0].sha256='0'.repeat(64);
    else artifact.productIdentity.sha256='0'.repeat(64);
    await assert.rejects(()=>archiveCompilerArtifact(artifact,archive));
    await assert.rejects(()=>access(join(archive,'artifact.json')));
  });
});

test('compiler artifact archive rejects duplicate identities even with a matching duplicate product digest',async()=>{
  await fixture(async({artifact,archive,files})=>{
    bind(artifact,[...files,{...files[0]}]);
    await assert.rejects(()=>archiveCompilerArtifact(artifact,archive));
  });
});

test('compiler artifact archive refuses escaping or noncanonical declared paths',async()=>{
  for(const path of ['../outside.mjs','bootstrap/../outside.mjs','./runtime.eli','bootstrap//compiler.mjs',
    '/outside.mjs','C:\\outside.mjs','bootstrap\\compiler.mjs','runtime.eli\0extra']){
    await fixture(async({artifact,archive,files})=>{
      bind(artifact,[files[0],{...files[1],path}]);
      await assert.rejects(()=>archiveCompilerArtifact(artifact,archive));
    });
  }
});

test('compiler artifact archive requires an explicit complete identity and a declared entry file',async()=>{
  for(const mutation of ['missing','empty','entry','outside'])await fixture(async({artifact,archive,files,directory,payload})=>{
    if(mutation==='missing')delete artifact.artifactIdentity;
    else if(mutation==='empty')bind(artifact,[]);
    else if(mutation==='entry')bind(artifact,[files[1]]);
    else{artifact.path=join(directory,'outside.mjs');await writeFile(artifact.path,payload);}
    await assert.rejects(()=>archiveCompilerArtifact(artifact,archive));
  });
});

test('compiler artifact archive refuses declared file and intermediate directory symlinks',async()=>{
  for(const intermediate of [false,true])await fixture(async({artifact,archive,product,directory,payload,files})=>{
    const outside=join(directory,'outside');await mkdir(outside);
    await writeFile(join(outside,'compiler.mjs'),payload);
    await rm(join(product,'bootstrap'),{recursive:true});
    if(intermediate)await symlink(outside,join(product,'bootstrap'),'dir');
    else{
      await mkdir(join(product,'bootstrap'));
      await symlink(join(outside,'compiler.mjs'),artifact.path,'file');
    }
    bind(artifact,files);
    await assert.rejects(()=>archiveCompilerArtifact(artifact,archive));
  });
});

test('compiler artifact archive excludes undeclared seed and package links without traversing them',async()=>{
  await fixture(async({artifact,archive,product,directory,files})=>{
    const privateDirectory=join(directory,'private');await mkdir(privateDirectory);
    await writeFile(join(privateDirectory,'internal-seed.mjs'),'private build data\n');
    await symlink(privateDirectory,join(product,'seed'),'dir');
    await symlink(root,join(product,'node_modules'),'dir');
    await writeFile(join(product,'undeclared-cache.mjs'),'unrelated cache\n');
    const result=await archiveCompilerArtifact(artifact,archive);
    assert.deepEqual(result.files,files);
    assert(!JSON.stringify(result.files).includes('internal-seed'));
    assert(!JSON.stringify(result.files).includes('node_modules'));
    assert.deepEqual(result.productIdentity,artifact.productIdentity);
  });
});

test('the public compiler CLI retains structured backend failures without an Error stack', async () => {
  const {renderCompilerCLIError} = await import('../tools/backends/compiler-cli.mjs');
  const diagnostic = {format:'eliscript-diagnostic', version:1, code:'ELI-B0001', severity:'error', phase:'managed-backend', message:'unsupported source operation', location:{file:'original.eli', start:{line:3, column:7}}};
  const rendered = JSON.parse(renderCompilerCLIError({message:diagnostic.message, eliscriptDiagnostic:diagnostic}));
  assert.equal(rendered.message, diagnostic.message);assert.deepEqual(rendered.eliscriptDiagnostic, diagnostic);
  const error = new TypeError('original transport failure');assert.equal(renderCompilerCLIError(error), error.stack);
  for (const value of [undefined,null,0,false,'source throw']) assert.equal(renderCompilerCLIError(value), String(value));
});

function sourceGraph(){
  return {entry:'bootstrap/compiler.mjs',modules:[{id:'bootstrap/compiler.mjs',filename:'compiler.eli',source:'(defun run () 42) (export run)'}],
    runtime:{filename:'runtime.eli',source:'(module runtime)'}};
}
function hostGraph(){
  return {...sourceGraph(),hostModules:[{id:'providers/actual.mjs',specifier:'../providers/actual.mjs',referrer:'bootstrap/compiler.mjs',
    allowedExports:['run','value'],namespace:true,edges:[{specifier:'../providers/actual.mjs',referrer:'bootstrap/compiler.mjs',allowedExports:['run','value'],namespace:true}]}],
    hostSources:[{id:'providers/actual.mjs',filename:'does-not-exist/provider-source.mjs',source:'export const value="中😀"; export function run(){return value;}\n'},
      {id:'providers/second.mjs',filename:'second.mjs',source:'export const second=2;\n'}],phased:false};
}

test('compiler source identity binds exact UTF16 default source text and every optional host input without changing declaration order',()=>{
  const sourceRecord=source=>({encoding:'utf16le',sha256:sha256(Buffer.from(source,'utf16le')),bytes:source.length*2});
  const graph=sourceGraph(),expected={encoding:'utf16le',entry:graph.entry,modules:graph.modules.map(record=>({id:record.id,filename:record.filename,...sourceRecord(record.source)})),
    runtime:{filename:graph.runtime.filename,...sourceRecord(graph.runtime.source)}};
  assert.deepEqual(compilerSourceIdentity(graph),{...expected,sha256:sha256(Buffer.from(JSON.stringify(expected),'utf16le'))});
  const supplied=hostGraph(),baseline=compilerSourceIdentity(supplied);
  assert.deepEqual(baseline.hostSources.map(record=>record.id),supplied.hostSources.map(record=>record.id));
  assert.deepEqual(baseline.hostModules,supplied.hostModules);
  for(const alter of[
    value=>{value.hostSources[0].source+='// actual different bytes\n';},
    value=>{value.hostSources[0].filename='renamed.mjs';},value=>{value.hostSources[0].id='providers/renamed.mjs';},
    value=>value.hostSources.reverse(),value=>{value.hostModules[0].specifier='./another.mjs';},
    value=>{value.hostModules[0].referrer='bootstrap/another.mjs';},value=>value.hostModules[0].allowedExports.reverse(),
    value=>{value.hostModules[0].namespace=false;},value=>{value.hostModules[0].edges[0].allowedExports=['run'];},
    value=>{value.hostModules.push({...value.hostModules[0],id:'providers/second.mjs'});},
    value=>{value.phased=true;},value=>{delete value.phased;},value=>{delete value.hostSources;},value=>{delete value.hostModules;},
  ]){
    const changed=structuredClone(supplied);alter(changed);
    assert.notEqual(compilerSourceIdentity(changed).sha256,baseline.sha256);
  }
  const reordered=structuredClone(supplied);
  reordered.hostModules=reordered.hostModules.map(record=>Object.fromEntries(Object.entries(record).reverse()));
  assert.equal(compilerSourceIdentity(reordered).sha256,baseline.sha256,'record property order is canonical, declaration arrays retain order');
  assert.notEqual(compilerSourceIdentity({...graph,hostSources:[]}).sha256,compilerSourceIdentity(graph).sha256);
  assert.notEqual(compilerSourceIdentity({...graph,hostModules:[]}).sha256,compilerSourceIdentity(graph).sha256);
  for(const changes of[
    value=>{value.hostSources[0].id=value.entry;},value=>value.hostSources.push({...value.hostSources[0]}),
    value=>{value.hostSources[0].source=undefined;},value=>{value.hostModules[0].extra=()=>0;},
    value=>{value.hostModules[0].extra=value.hostModules;},value=>{value.phased=1;},
  ]){const invalid=hostGraph();changes(invalid);assert.throws(()=>compilerSourceIdentity(invalid),TypeError);}
});

test('source archive writes the supplied provider bytes and the exact complete optional source identity',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eliscript-source-archive-'));
  try{
    const graph=hostGraph(),identity=await archiveCompilerSources(graph,directory);
    assert.deepEqual(identity,compilerSourceIdentity(graph));
    assert.deepEqual(JSON.parse(await readFile(join(directory,'identity.json'),'utf8')),identity);
    for(const record of graph.modules)assert.equal(await readFile(join(directory,'modules',record.id+'.eli'),'utf8'),record.source);
    for(const record of graph.hostSources){
      const bytes=await readFile(join(directory,'host-sources',record.id));
      const bound=identity.hostSources.find(item=>item.id===record.id);
      assert.deepEqual(bytes,Buffer.from(record.source,'utf8'));
      assert.equal(bytes.toString('utf8'),record.source);assert.equal(bound.encoding,'utf16le');
      assert.equal(sha256(Buffer.from(record.source,'utf16le')),bound.sha256);assert.equal(record.source.length*2,bound.bytes);
    }
    assert.equal(await readFile(join(directory,'runtime.eli'),'utf8'),graph.runtime.source);
    const restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity});
    assert.deepEqual(restored,graph,'optional host namespace edges declarations and explicit false phased mode survive the real archive reader');
    assert.equal(Object.hasOwn(restored,'phased'),true);assert.equal(restored.phased,false);
    assert.notStrictEqual(restored.hostModules,graph.hostModules);
    assert.notStrictEqual(restored.hostModules[0].edges,graph.hostModules[0].edges);
    restored.hostModules[0].edges[0].allowedExports.push('caller-only');restored.hostSources[0].source='caller edited returned source';
    await assert.rejects(()=>readArchivedCompilerSources(directory,{expectedIdentity:'0'.repeat(64)}),/expected source identity/);
    assert.deepEqual(await readArchivedCompilerSources(directory,{expectedIdentity:identity.sha256}),graph,
      'a wrong expected identity and caller mutation cannot poison a later exact source restore');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('complete compiler input comparison rejects optional host inputs before accepting a seed or creating a chain',async()=>{
  const actual=await loadCompilerSources(),directory=await mkdtemp(join(tmpdir(),'eliscript-complete-source-identity-'));
  try{
    for(const optional of [{hostModules:[]},{hostSources:hostGraph().hostSources},{phased:false}]){
      const outputRoot=join(directory,Object.keys(optional)[0]);
      // The deliberately invalid seed must never be consulted: the complete
      // source identity mismatch is an earlier production boundary.
      await assert.rejects(()=>bootstrapCompilerChain({outputRoot,sources:{...actual,...optional},seedArtifact:{}}),/supplied compiler sources differ from the complete source graph/);
      await assert.rejects(()=>access(outputRoot));
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('compiler failure and JSON CLI errors preserve diagnostics origins codes AggregateError elements and cause cycle truncation',async()=>{
  const {renderCompilerCLIError}=await import('../tools/backends/compiler-cli.mjs');
  const diagnostic={code:'ELI-A0001',phase:'analysis',message:'original',location:{file:'原😀.eli',start:{offset:3,line:2,column:1}}};
  const child=new TypeError('child'),error=new AggregateError([child,new RangeError('range'),false],'original',{cause:child});
  Object.assign(error,{code:'ELI-A0001',eliscriptDiagnostic:diagnostic,diagnostics:[diagnostic],macroOrigins:[{macroName:'twice',trace:[{status:'expanded'}]}],
    eliscriptFrames:[{function:'compile',instruction:7}],eliscriptSourceFrames:[{file:'原😀.eli',line:2,column:1}]});
  child.cause=error;error.errors.push(error);
  const actual=compilerFailure(error);
  for(const key of['name','message','stack','code','eliscriptDiagnostic','diagnostics','macroOrigins','eliscriptFrames','eliscriptSourceFrames'])assert.deepEqual(actual[key],error[key],key);
  assert.equal(actual.errors[0].name,'TypeError');assert.equal(actual.errors[1].name,'RangeError');
  assert.deepEqual(actual.errors[2],compilerFailure(false));
  assert.equal(actual.errors[0].cause.truncatedCause,true);assert.equal(actual.errors[3].truncatedCause,true);
  assert.equal(actual.cause.name,'TypeError');assert.equal(actual.cause.cause.truncatedCause,true);
  assert.deepEqual(JSON.parse(renderCompilerCLIError(error,{json:true})).error,JSON.parse(JSON.stringify(actual)));
  diagnostic.message='changed after copying';assert.equal(actual.diagnostics[0].message,'original');
});

test('compiler failure metadata cannot replace the primary error when fields throw or contain non-JSON data',()=>{
  const error=new Error('primary failure'),sentinel=new Error('secondary getter');
  for(const name of['stack','cause','eliscriptDiagnostic','eliscriptFrames'])Object.defineProperty(error,name,{get(){throw sentinel;},configurable:true});
  error.code='ELI-H0001';error.macroOrigins=[{value:9n,unserializable:()=>0}];
  const cyclic={message:'diagnostic'};cyclic.self=cyclic;
  Object.defineProperty(cyclic,'broken',{enumerable:true,get(){throw sentinel;}});error.diagnostics=[cyclic];
  const bad=new Error('bad child');Object.defineProperty(bad,'message',{get(){throw sentinel;}});
  error.errors=[bad,error];
  const actual=compilerFailure(error);
  assert.equal(actual.name,'Error');assert.equal(actual.message,'primary failure');assert.equal(actual.code,'ELI-H0001');
  assert.equal(actual.diagnostics[0].message,'diagnostic');assert.equal(actual.diagnostics[0].self.truncatedCause,true);
  assert.equal(actual.macroOrigins[0].value,'9');assert.equal(actual.errors[1].truncatedCause,true);
  assert.doesNotThrow(()=>JSON.stringify(actual));assert(!JSON.stringify(actual).includes('secondary getter'));
});

// These tiny modules are resource-transport fixtures, not compiler substitutes
// or evidence of independent compiler execution. They record loader dispatch.
async function sessionResourceFixture(operation){
  const directory=await mkdtemp(join(tmpdir(),'eliscript-artifact-session-resource-'));
  const source=`export function compiler_session_new(){return {calls:0};}
export function compiler_session_close(state){state.closed=true;}
export function compiler_session_request(state,text){state.calls++;const input=JSON.parse(text);return JSON.stringify({operation:input.operation,calls:state.calls,literalSources:input.literalSources??null});}\n`;
  const bytes=Buffer.from(source),path=join(directory,'compiler.mjs');
  await writeFile(path,bytes);
  const artifact=bind({host:'javascript',entry:'compiler.mjs',directory,path:'compiler.mjs',modules:[{id:'compiler.mjs',path:'compiler.mjs'}]},[
    {path:'compiler.mjs',bytes:bytes.length,sha256:sha256(bytes)},
  ]);
  try{await operation({directory,artifact,path,source,bytes});}
  finally{await rm(directory,{recursive:true,force:true});}
}
async function literalResourceFixture(operation){
  await sessionResourceFixture(async context=>{
    const literal='\uFEFF; 中😀é\n(module source)',bytes=Buffer.from(literal,'utf8'),path=join(context.directory,'literal.eli');
    await writeFile(path,bytes);
    context.artifact.literalSources=[{id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',path:'literal.eli'}];
    context.artifact.sourceIdentity={algorithm:'sha256',encoding:'utf16le',modules:[{id:'compiler.mjs',filename:'compiler.eli',sha256:sha256(Buffer.from('(module compiler)','utf16le'))}],
      literalSources:[{id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',sha256:sha256(Buffer.from(literal,'utf16le'))}]};
    bind(context.artifact,[...context.artifact.artifactIdentity.files,{path:'literal.eli',bytes:bytes.length,sha256:sha256(bytes)}]);
    await operation({...context,literal,literalBytes:bytes,literalPath:path});
  });
}

test('automatic debug metadata loads exact values through authenticated bounded reads of one file',async()=>{
  await sessionResourceFixture(async({artifact,directory})=>{
    const document={format:'eliscript-debug-map',version:1,target:'wasm',offsetBase:'module',
      ranges:[{start:0,end:8,kind:'function',span:{filename:'原😀\ud800.eli',start:0,end:8}}],
      functions:[],sections:[],trapSites:[],zero:-0,
      text:'x'.repeat(65515)+'中😀\udfff"\\\n'+'é中😀'.repeat(24000),values:[null,true,-0,Number.MIN_VALUE]};
    const bytes=Buffer.from(encodeCompilerIR(document)+'\n'),debug=join(directory,'debug.json');
    await writeFile(debug,bytes);artifact.debugPath='debug.json';
    bind(artifact,[...artifact.artifactIdentity.files,{path:'debug.json',bytes:bytes.length,sha256:sha256(bytes)}]);
    const originalOpen=fileIO.open,originalDecoder=metadataCodec.createCompilerMetadataDecoder;
    const reads=[],decoded=[];let opens=0,closes=0,parsed;
    const OriginalTextDecoder=globalThis.TextDecoder;
    const decoderSpy=spyOn(metadataCodec,'createCompilerMetadataDecoder').mockImplementation(()=>{
      const parser=originalDecoder();
      return{write:text=>parser.write(text),finish(){parsed=parser.finish();return parsed;}};
    });
    const openSpy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);
      if(resolve(args[0])!==debug)return file;
      opens++;return{
        async read(buffer,offset,length,position){
          reads.push({capacity:buffer.byteLength,length});
          return file.read(buffer,offset,length,position);
        },
        async close(){closes++;return file.close();},
      };
    });
    let session;
    try{
      globalThis.TextDecoder=class extends OriginalTextDecoder{
        decode(input,options){if(input!==undefined)decoded.push(input.byteLength);return super.decode(input,options);}
      };
      session=await openCompilerArtifact(artifact);
      assert.deepEqual(parsed,document);assert(Object.is(parsed.zero,-0));assert(Object.is(parsed.values[2],-0));
      assert.equal(opens,1);assert.equal(closes,1);assert(reads.length>3);
      assert(reads.every(read=>read.capacity===65536&&read.length===65536));
      assert(decoded.length>2&&decoded.every(length=>length<=65536));
      assert.equal((await session.request({operation:'capabilities'})).operation,'capabilities');
    }finally{
      globalThis.TextDecoder=OriginalTextDecoder;openSpy.mockRestore();decoderSpy.mockRestore();
      if(session)await session.close();
    }
  });
});

test('automatic debug metadata preserves resource identity and path rejection before decode errors',async()=>{
  for(const mutation of ['hash','length','missing-binding','file-symlink','directory-symlink','missing-file','json','utf8'])
    await sessionResourceFixture(async({artifact,directory})=>{
      const maps=join(directory,'maps'),debug=join(maps,'debug.json'),bytes=Buffer.from('{"zero":-0,"text":"中😀"}\n');
      await mkdir(maps);await writeFile(debug,bytes);artifact.debugPath='maps/debug.json';
      const entry={path:'maps/debug.json',bytes:bytes.length,sha256:sha256(bytes)};
      bind(artifact,[...artifact.artifactIdentity.files,entry]);
      if(mutation==='hash'){
        const changed=Buffer.from(bytes);changed[0]=120;await writeFile(debug,changed);
      }else if(mutation==='length')await writeFile(debug,bytes.subarray(0,bytes.length-1));
      else if(mutation==='missing-binding')bind(artifact,artifact.artifactIdentity.files.slice(0,-1));
      else if(mutation==='file-symlink'||mutation==='directory-symlink'){
        const outside=join(directory,'outside');await mkdir(outside);await writeFile(join(outside,'debug.json'),bytes);
        if(mutation==='file-symlink'){await rm(debug);await symlink(join(outside,'debug.json'),debug,'file');}
        else{await rm(maps,{recursive:true});await symlink(outside,maps,'dir');}
      }else if(mutation==='missing-file')await rm(debug);
      else{
        const corrupt=mutation==='json'?Buffer.from('{"unfinished":'):Buffer.from([123,34,120,34,58,34,0xc3,34,125]);
        await writeFile(debug,corrupt);entry.bytes=corrupt.length;entry.sha256=sha256(corrupt);
        bind(artifact,[...artifact.artifactIdentity.files.slice(0,-1),entry]);
      }
      await assert.rejects(()=>openCompilerArtifact(artifact),error=>{
        if(mutation==='hash'||mutation==='length')assert.match(error.message,/SHA-256 or byte length identity/);
        else if(mutation==='missing-binding')assert.match(error.message,/no emitted file identity/);
        else if(mutation.endsWith('symlink'))assert.match(error.message,/unsupported file entry/);
        else if(mutation==='missing-file')assert.equal(error.code,'ENOENT');
        else assert(error instanceof SyntaxError||error instanceof TypeError);
        return true;
      });
    });
});

test('automatic debug metadata retains the first read identity or decode failure when file cleanup also throws',async()=>{
  await sessionResourceFixture(async({artifact,directory})=>{
    const debug=join(directory,'debug.json'),originalOpen=fileIO.open,primary={read:true},cleanup={close:true};
    artifact.debugPath='debug.json';
    for(const failure of ['read','identity','decode','close']){
      const bytes=Buffer.from(failure==='decode'?'{': '{"zero":-0}');await writeFile(debug,bytes);
      bind(artifact,[artifact.artifactIdentity.files[0],{path:'debug.json',bytes:bytes.length,
        sha256:failure==='identity'?'0'.repeat(64):sha256(bytes)}]);
      let closes=0;
      const spy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
        const file=await Reflect.apply(originalOpen,fileIO,args);
        if(resolve(args[0])!==debug)return file;
        return{read(...values){if(failure==='read')throw primary;return Reflect.apply(file.read,file,values);},
          async close(){closes++;await file.close();throw cleanup;}};
      });
      try{
        await assert.rejects(()=>openCompilerArtifact(artifact),error=>{
          if(failure==='read')assert.strictEqual(error,primary);
          else if(failure==='identity')assert.match(error.message,/SHA-256 or byte length identity/);
          else if(failure==='decode')assert(error instanceof SyntaxError);
          else assert.strictEqual(error,cleanup);
          return true;
        });
        assert.equal(closes,1);
      }finally{spy.mockRestore();}
    }
    await writeFile(debug,'{"recovered":true}');
    const bytes=await readFile(debug);bind(artifact,[artifact.artifactIdentity.files[0],{path:'debug.json',bytes:bytes.length,sha256:sha256(bytes)}]);
    const session=await openCompilerArtifact(artifact);await session.close();
  });
});

test('opening a declared JavaScript artifact rejects changed graph resources before module evaluation',async()=>{
  for(const mutation of ['entry-bytes','entry-size','entry-missing-binding','dependency-bytes','dependency-missing-binding','debug-bytes','debug-missing-binding'])await sessionResourceFixture(async({artifact,directory,path,bytes})=>{
    if(mutation.startsWith('dependency')){
      const dependency=Buffer.from('export const value=1;\n');await writeFile(join(directory,'dependency.mjs'),dependency);
      artifact.modules.push({id:'dependency.mjs',path:'dependency.mjs'});
      if(mutation==='dependency-bytes'){
        artifact.artifactIdentity.files.push({path:'dependency.mjs',bytes:dependency.length,sha256:sha256(dependency)});
        await writeFile(join(directory,'dependency.mjs'),'export const value=2;\n');
      }
    }else if(mutation.startsWith('debug')){
      const debug=Buffer.from('{"version":1}\n');artifact.debugPath='compiler.debug.json';await writeFile(join(directory,artifact.debugPath),debug);
      if(mutation==='debug-bytes'){
        artifact.artifactIdentity.files.push({path:artifact.debugPath,bytes:debug.length,sha256:sha256(debug)});
        await writeFile(join(directory,artifact.debugPath),'{"version":2}\n');
      }
    }else if(mutation==='entry-bytes')await writeFile(path,Buffer.concat([bytes,Buffer.from('// changed\n')]));
    else if(mutation==='entry-size')artifact.artifactIdentity.files[0].bytes++;
    else artifact.artifactIdentity.files=[{path:'unconsumed.eli',bytes:0,sha256:sha256(Buffer.alloc(0))}];
    await assert.rejects(()=>openCompilerArtifact(artifact),/changed after emission|no emitted file identity/);
  });
});

test('opening binds both the actual disk entry and caller-supplied WASM bytes before instantiation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eliscript-artifact-wasm-resource-'));
  try{
    const bytes=Uint8Array.from([0,97,115,109,1,0,0,0]),path=join(directory,'compiler.wasm');await writeFile(path,bytes);
    const original=bind({host:'wasm',entry:'host/compiler-session.mjs',directory,path:'compiler.wasm',bytes},[
      {path:'compiler.wasm',bytes:bytes.length,sha256:sha256(bytes)},
    ]);
    const changed=Uint8Array.from(bytes);changed[0]=1;
    await assert.rejects(()=>openCompilerArtifact({...original,bytes:changed}),/changed after emission: compiler\.wasm/);
    await writeFile(path,changed);
    await assert.rejects(()=>openCompilerArtifact(original),/changed after emission: compiler\.wasm/);
    await writeFile(path,bytes);
    await assert.rejects(()=>openCompilerArtifact({...original,artifactIdentity:{algorithm:'sha256',files:[{path:'unused.eli',bytes:0,sha256:sha256(Buffer.alloc(0))}]}}),/no emitted file identity: compiler\.wasm/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('native resource verification rejects changed declared library bytes before entering any platform loader',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eliscript-artifact-native-resource-'));
  let observer;
  try{
    const original=Buffer.from('declared native byte payload'),path=join(directory,'compiler.so');await writeFile(path,Buffer.from('changed native byte payload'));
    const artifact=bind({host:'native',nativeTarget:'arm64-linux',directory,path:'compiler.so'},[
      {path:'compiler.so',bytes:original.length,sha256:sha256(original)},
    ]);
    observer=observeBoundedArtifactResources([path]);
    await assert.rejects(()=>openCompilerArtifact(artifact),/changed after emission: compiler\.so/);
    observer.assertBounded();
  }finally{observer?.restore();await rm(directory,{recursive:true,force:true});}
});

test('opening verifies the executable module graph but does not rescan unused IR or source assets',async()=>{
  await sessionResourceFixture(async({artifact})=>{
    artifact.artifactIdentity.files.push({path:'ir/not-consumed.json',bytes:99,sha256:'0'.repeat(64)});
    artifact.artifactIdentity.files.push({path:'runtime.eli',bytes:99,sha256:'0'.repeat(64)});
    const session=await openCompilerArtifact(artifact);
    try{assert.deepEqual(session.request({operation:'capabilities'}),{operation:'capabilities',calls:1,literalSources:null});}
    finally{await session.close();}
  });
});

test('literal resource hash failures are not cached and a corrected retry retains BOM Unicode and declared UTF16 source identity',async()=>{
  await literalResourceFixture(async({artifact,literal,literalBytes,literalPath})=>{
    await writeFile(literalPath,Buffer.from([0xef,0xbb,0xbf,0xc0,0xaf]));
    const session=await openCompilerArtifact(artifact);
    const request={operation:'runtime',source:'(module runtime)',filename:'runtime.eli'};
    try{
      await assert.rejects(()=>session.request(request),/changed after emission: literal\.eli/);
      await writeFile(literalPath,literalBytes);
      const result=await session.request(request);
      assert.equal(result.calls,1,'failed asset loading must never dispatch a runtime request');
      assert.deepEqual(result.literalSources,[{id:'runtime/core/value.mjs',filename:'stdlib/managed-runtime-value.eli',source:literal}]);
      assert.equal(result.literalSources[0].source.charCodeAt(0),0xfeff);
      assert.equal((await session.request(request)).calls,2);
    }finally{await session.close();}
  });
});

test('explicitly invalid literal encodings are rejected while absent encoding retains the original UTF8 contract', async () => {
  for (const encoding of [null, 'utf16', '', 0]) await literalResourceFixture(async ({artifact}) => {
    artifact.literalSources[0].encoding = encoding;
    const session = await openCompilerArtifact(artifact);
    try {
      await assert.rejects(() => session.request({operation: 'runtime', source: '(module runtime)'}),
        error => error instanceof TypeError && /unsupported compiler source asset encoding/.test(error.message));
      const recovered = await session.request({operation: 'runtime', source: '(module explicit)', literalSources: []});
      assert.equal(recovered.calls, 1);
      assert.deepEqual(recovered.literalSources, []);
    } finally {await session.close();}
  });
});

test('literal source assets require both an emitted byte binding and their actual filename and UTF16 source hash',async()=>{
  for(const mutation of ['missing-file','missing-source','duplicate-source','filename','source-hash','source-encoding'])await literalResourceFixture(async({artifact})=>{
    if(mutation==='missing-file')artifact.artifactIdentity.files=artifact.artifactIdentity.files.filter(item=>item.path!=='literal.eli');
    else if(mutation==='missing-source')delete artifact.sourceIdentity;
    else if(mutation==='duplicate-source')artifact.sourceIdentity.literalSources.push({...artifact.sourceIdentity.literalSources[0]});
    else if(mutation==='filename')artifact.sourceIdentity.literalSources[0].filename='another.eli';
    else if(mutation==='source-hash')artifact.sourceIdentity.literalSources[0].sha256='0'.repeat(64);
    else artifact.sourceIdentity.encoding='utf8';
    const session=await openCompilerArtifact(artifact);
    try{
      await assert.rejects(()=>session.request({operation:'runtime',source:'(module runtime)'}),/identity|inventory/);
      const result=await session.request({operation:'runtime',source:'(module explicit)',literalSources:[]});
      assert.equal(result.calls,1,'an asset refusal leaves the driver request state untouched');
    }finally{await session.close();}
  });
});

test('a byte-authenticated malformed UTF8 literal is still refused and a newly authenticated repaired asset can initialize',async()=>{
  await literalResourceFixture(async({artifact,literalBytes,literalPath,literal})=>{
    const bad=Buffer.from([0xef,0xbb,0xbf,0xed,0xa0,0x80]);await writeFile(literalPath,bad);
    const file=artifact.artifactIdentity.files.find(item=>item.path==='literal.eli');file.bytes=bad.length;file.sha256=sha256(bad);
    const failed=await openCompilerArtifact(artifact);
    try{await assert.rejects(()=>failed.request({operation:'runtime',source:'(module runtime)'}),TypeError);}
    finally{await failed.close();}
    await writeFile(literalPath,literalBytes);file.bytes=literalBytes.length;file.sha256=sha256(literalBytes);
    const repaired=await openCompilerArtifact(artifact);
    try{assert.equal((await repaired.request({operation:'runtime',source:'(module runtime)'})).literalSources[0].source,literal);}
    finally{await repaired.close();}
  });
});
