import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,mkdtemp,lstat,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './build.mjs';
import {loadCompilerSources,buildIndependentCompiler,independentCompilerProductIdentity,compilerMetadataDigest,writeCompilerMetadata} from './compiler-build.mjs';
import {createCompilerSession,registerCompilerBuildProductForwarder,registerVerifiedCompilerBuildConsumption} from './compiler-session.mjs';
import {decodeCompilerMetadataBytes,createCompilerMetadataDecoder} from './compiler-metadata.mjs';
import {ownCompilerDebugDocument} from './compiler-debug.mjs';

export const compilerHosts=Object.freeze(['javascript','wasm','native']);
const verifiedCompilerBuildSessions=new WeakSet();

export function isVerifiedCompilerBuildSession(session) {
  return verifiedCompilerBuildSessions.has(session);
}

export function normalizeCompilerHost(value) {
  const host=value==='js'?'javascript':value;
  if(!compilerHosts.includes(host))throw new TypeError('compiler host must be javascript, wasm or native');
  return host;
}

export function compilerDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function saveCompilerMetadata(path,value) {
  const temporary=path+'.'+randomUUID()+'.tmp';
  await writeCompilerMetadata(temporary,value,{flag:'wx'});
  await rename(temporary,path);
}

function failureProperty(value,name) {
  try{return value?.[name];}catch{return undefined;}
}

function failureText(value,fallback) {
  try{return String(value);}catch{return fallback;}
}

function failureData(value,ancestors=new Set()) {
  if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='bigint')return value.toString();
  if(typeof value!=='object')return undefined;
  if(ancestors.has(value)||ancestors.size>=64)return {truncatedCause:true};
  const path=new Set(ancestors);path.add(value);
  try{
    if(Array.isArray(value)){
      const result=[];
      for(let index=0;index<value.length;index++)result.push(failureData(failureProperty(value,index),path));
      return result;
    }
    const result={};
    for(const key of Object.keys(value)){
      const item=failureData(failureProperty(value,key),path);
      if(item!==undefined)Object.defineProperty(result,key,{value:item,enumerable:true,writable:true,configurable:true});
    }
    return result;
  }catch{return {truncatedCause:true};}
}

export function compilerFailure(error,ancestors=new Set()) {
  const name=failureProperty(error,'name'),message=failureProperty(error,'message');
  const record={name:name==null?'Error':failureText(name,'Error'),
    message:message==null?failureText(error,'unavailable error'):failureText(message,'unavailable error')};
  if(error!==null&&(typeof error==='object'||typeof error==='function')){
    if(ancestors.has(error)||ancestors.size>=64)return {...record,truncatedCause:true};
    ancestors=new Set(ancestors);ancestors.add(error);
  }
  const stack=failureProperty(error,'stack');
  if(stack!==undefined)record.stack=failureText(stack,'unavailable stack');
  for(const key of ['eliscriptDiagnostic','diagnostics','macroOrigins','code','eliscriptFrames','eliscriptSourceFrames']){
    const field=failureProperty(error,key);
    if(field===undefined)continue;
    if(key==='eliscriptFrames'||key==='eliscriptSourceFrames'){
      try{if(!Array.isArray(field))continue;}catch{continue;}
    }
    const data=failureData(field,ancestors);
    if(data!==undefined)record[key]=data;
  }
  const errors=failureProperty(error,'errors');
  if(errors!==undefined){
    try{
      if(Array.isArray(errors)){
        if(ancestors.has(errors)||ancestors.size>=64)record.errors={truncatedCause:true};
        else{
          const path=new Set(ancestors);path.add(errors);
          record.errors=[];
          for(let index=0;index<errors.length;index++)record.errors.push(compilerFailure(failureProperty(errors,index),path));
        }
      }else record.errors=failureData(errors,ancestors);
    }catch{record.errors={truncatedCause:true};}
  }
  const cause=failureProperty(error,'cause');
  if(cause!==undefined)record.cause=compilerFailure(cause,ancestors);
  return record;
}

function moduleId(id) {
  if(typeof id!=='string'||!id||/[\\:\u0000]/.test(id)||id.split('/').some(part=>!part||part==='.'||part==='..'))
    throw new TypeError('compiler module requires a relative source identity');
  return id;
}

function sourceDeclarationData(value,ancestors=new Set()) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value!=='object'||ancestors.has(value))throw new TypeError('host declarations require finite JSON data');
  const prototype=Object.getPrototypeOf(value);
  if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)
    throw new TypeError('host declarations require plain JSON records');
  if(Object.getOwnPropertySymbols(value).length)throw new TypeError('host declarations cannot contain symbol keys');
  const path=new Set(ancestors);path.add(value);
  if(Array.isArray(value)){
    const result=[];
    if(Object.keys(value).length!==value.length)throw new TypeError('host declarations require dense JSON arrays');
    for(let index=0;index<value.length;index++){
      if(!Object.hasOwn(value,index))throw new TypeError('host declarations require dense JSON arrays');
      result.push(sourceDeclarationData(value[index],path));
    }
    return result;
  }
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sourceDeclarationData(value[key],path)]));
}

function compilerSourceTextDigest(source) {
  // Source identities bind code units, including lone surrogates and BOM.
  // Keep compilerDigest byte-oriented for emitted binaries and other assets.
  const hash=createHash('sha256');
  forEachCompilerSourceBytes(source,'utf16le',bytes=>hash.update(bytes));
  return {encoding:'utf16le',sha256:hash.digest('hex'),bytes:source.length*2};
}

function compilerSourceDeclaration(sources) {
  const inputModules=sources?.modules;
  if(!Array.isArray(inputModules)||!inputModules.length)
    throw new TypeError('complete compiler modules and runtime source are required');
  const inputRuntime=sources.runtime,runtimeSource=inputRuntime?.source;
  if(!inputRuntime||typeof runtimeSource!=='string')throw new TypeError('complete compiler modules and runtime source are required');
  const snapshot={modules:[]};
  const ids=new Set();
  const modules=inputModules.map(record=>{
    const id=moduleId(record?.id);
    if(ids.has(id))throw new TypeError('invalid compiler source record');
    const source=record.source;
    if(typeof source!=='string')throw new TypeError('invalid compiler source record');
    const filename=record.filename;
    if(typeof filename!=='string')throw new TypeError('invalid compiler source record');
    ids.add(id);
    snapshot.modules.push({id,filename,source});
    return {id,filename,...compilerSourceTextDigest(source)};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const entry=sources.entry;
  if(!ids.has(entry))throw new TypeError('compiler entry and runtime filename are required');
  const runtimeFilename=inputRuntime.filename;
  if(typeof runtimeFilename!=='string')throw new TypeError('compiler entry and runtime filename are required');
  snapshot.entry=entry;snapshot.runtime={filename:runtimeFilename,source:runtimeSource};
  const identity={encoding:'utf16le',entry,modules,runtime:{filename:runtimeFilename,...compilerSourceTextDigest(runtimeSource)}};
  if(Object.hasOwn(sources,'hostModules')){
    const records=sources.hostModules;
    if(!Array.isArray(records))throw new TypeError('compiler hostModules must be an array');
    identity.hostModules=sourceDeclarationData(records);snapshot.hostModules=identity.hostModules;
  }
  if(Object.hasOwn(sources,'hostSources')){
    const records=sources.hostSources;
    if(!Array.isArray(records))throw new TypeError('compiler hostSources must be an array');
    snapshot.hostSources=[];
    identity.hostSources=records.map(record=>{
      const id=moduleId(record?.id),filename=record.filename??id;
      if(ids.has(id))throw new TypeError('invalid compiler host source record');
      const source=record.source;
      if(typeof source!=='string'||typeof filename!=='string')throw new TypeError('invalid compiler host source record');
      ids.add(id);
      snapshot.hostSources.push({id,filename,source});return {id,filename,...compilerSourceTextDigest(source)};
    });
  }
  if(Object.hasOwn(sources,'phased')){
    const phased=sources.phased;
    if(typeof phased!=='boolean')throw new TypeError('compiler phased input must be boolean');
    identity.phased=phased;snapshot.phased=phased;
  }
  if(Object.hasOwn(sources,'literalSources')){
    const records=sources.literalSources;
    if(!Array.isArray(records))throw new TypeError('compiler literalSources must be an array');
    snapshot.literalSources=[];
    identity.literalSources=records.map(record=>{
      const id=moduleId(record?.id);
      if(ids.has(id))throw new TypeError('invalid or colliding persistent literal source');
      const filename=record.filename;
      if(typeof filename!=='string')throw new TypeError('invalid or colliding persistent literal source');
      const source=record.source;
      if(typeof source!=='string')throw new TypeError('invalid or colliding persistent literal source');
      ids.add(id);
      snapshot.literalSources.push({id,filename,source});return {id,filename,...compilerSourceTextDigest(source)};
    });
  }
  return {sources:snapshot,identity:{...identity,sha256:compilerSourceTextDigest(JSON.stringify(identity)).sha256}};
}

export function compilerSourceIdentity(sources) {return compilerSourceDeclaration(sources).identity;}

function forEachCompilerSourceBytes(source,encoding,consume){
  for(let offset=0;offset<source.length;){
    let end=Math.min(source.length,offset+(encoding==='utf8'?16384:32768));
    // UTF8 replaces lone halves but must not manufacture them at our boundary.
    if(encoding==='utf8'&&end<source.length&&source.charCodeAt(end-1)>=0xd800&&source.charCodeAt(end-1)<=0xdbff&&
        source.charCodeAt(end)>=0xdc00&&source.charCodeAt(end)<=0xdfff)end--;
    consume(Buffer.from(source.slice(offset,end),encoding));offset=end;
  }
}

async function writeCompilerSourceText(path,source,encoding){
  const file=await open(path,'wx'),hash=createHash('sha256');let bytes=0,failed=false;
  try{
    // Each block is consumed before its source slice can be released. Avoid
    // either full encoded representation beside the complete source string.
    for(let offset=0;offset<source.length;){
      let end=Math.min(source.length,offset+(encoding==='utf8'?16384:32768));
      if(encoding==='utf8'&&end<source.length&&source.charCodeAt(end-1)>=0xd800&&source.charCodeAt(end-1)<=0xdbff&&
          source.charCodeAt(end)>=0xdc00&&source.charCodeAt(end)<=0xdfff)end--;
      const block=Buffer.from(source.slice(offset,end),encoding);hash.update(block);bytes+=block.length;
      let position=0;
      while(position<block.length){
        const {bytesWritten}=await file.write(block,position,block.length-position,null);
        if(!Number.isInteger(bytesWritten)||bytesWritten<1||bytesWritten>block.length-position)
          throw new Error('compiler source archive write did not advance');
        position+=bytesWritten;
      }
      offset=end;
    }
    return{bytes,sha256:hash.digest('hex')};
  }catch(error){failed=true;throw error;}
  finally{try{await file.close();}catch(error){if(!failed)throw error;}}
}

export async function archiveCompilerSources(sources,directory) {
  // Only declaration fields participate. Capture primitive source values
  // synchronously, without cloning unrelated caller fields or rereading a
  // source getter after the first asynchronous filesystem operation.
  const declaration=compilerSourceDeclaration(sources),identity=declaration.identity;
  sources=declaration.sources;
  await mkdir(directory,{recursive:true});
  const records=[];
  async function archive(kind,record,index){
    const path=kind==='runtime'?'source-codeunits/runtime.utf16le':
      'source-codeunits/'+kind+'/'+String(index).padStart(4,'0')+'.utf16le';
    const toolPath=compilerArchivedToolPath(kind,record.id);
    await mkdir(dirname(join(directory,path)),{recursive:true});
    await mkdir(dirname(join(directory,toolPath)),{recursive:true});
    const raw=await writeCompilerSourceText(join(directory,path),record.source,'utf16le');
    const tool=await writeCompilerSourceText(join(directory,toolPath),record.source,'utf8');
    records.push({kind,id:kind==='runtime'?null:record.id,filename:record.filename,
      path,encoding:'utf16le',...raw,
      tool:{path:toolPath,encoding:'utf8',...tool,
        role:'tool-projection',lossless:compilerSourceToolLossless(record.source)}});
  }
  for(let index=0;index<sources.modules.length;index++)await archive('module',sources.modules[index],index);
  for(let index=0;index<(sources.hostSources?.length??0);index++)await archive('host',sources.hostSources[index],index);
  for(let index=0;index<(sources.literalSources?.length??0);index++)await archive('literal',sources.literalSources[index],index);
  await archive('runtime',sources.runtime,0);
  await saveCompilerMetadata(join(directory,'identity.json'),identity);
  await saveCompilerMetadata(join(directory,'source-archive.json'),{
    format:'eliscript-compiler-source-archive',version:1,encoding:'utf16le',
    identityPath:'identity.json',identitySha256:identity.sha256,records,
  });
  return identity;
}

function compilerArchivedToolPath(kind,id){
  if(kind==='runtime')return'runtime.eli';
  if(kind==='module')return'modules/'+moduleId(id)+'.eli';
  if(kind==='host')return'host-sources/'+moduleId(id);
  if(kind==='literal')return'literal-sources/'+moduleId(id)+'.eli';
  throw new TypeError('unknown archived compiler source kind');
}

function compilerSourceToolLossless(source){
  for(let index=0;index<source.length;index++){
    const unit=source.charCodeAt(index);
    if(unit>=0xd800&&unit<=0xdbff){
      const next=source.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return false;index++;
    }else if(unit>=0xdc00&&unit<=0xdfff)return false;
  }
  return true;
}

async function compilerArchivedSourceBytes(directory,path,consume){
  moduleId(path);
  const parts=path.split('/');
  for(let index=0;index<parts.length;index++){
    const stat=await lstat(resolve(directory,...parts.slice(0,index+1)));
    if(index===parts.length-1?!stat.isFile():!stat.isDirectory())
      throw new Error('compiler source archive contains an unsupported file entry: '+path);
  }
  const file=await open(resolve(directory,path),'r'),buffer=Buffer.allocUnsafe(65536),hash=createHash('sha256');
  let bytes=0,failed=false;
  try{
    for(;;){
      const {bytesRead}=await file.read(buffer,0,buffer.length,null);
      if(!Number.isInteger(bytesRead)||bytesRead<0||bytesRead>buffer.length)
        throw new Error('compiler source archive read returned an invalid byte count');
      if(bytesRead===0)break;
      const block=buffer.subarray(0,bytesRead);hash.update(block);bytes+=bytesRead;consume(block);
    }
    return{bytes,sha256:hash.digest('hex')};
  }catch(error){failed=true;throw error;}
  finally{try{await file.close();}catch(error){if(!failed)throw error;}}
}

function compilerArchivedSourceFile(record,actual,label){
  if(!Number.isSafeInteger(record?.bytes)||record.bytes<0||!/^[0-9a-f]{64}$/.test(record.sha256??'')||
      actual.bytes!==record.bytes||actual.sha256!==record.sha256)
    throw new Error('compiler source archive '+label+' bytes differ from their identity');
}

async function readCompilerArchivedJSON(directory,path){
  const decoder=new TextDecoder('utf-8',{fatal:true}),parser=createCompilerMetadataDecoder();
  let decodeFailed=false,decodeFailure,parseFailed=false,parseFailure;
  // readFile used to finish before UTF8 decoding, then JSON parsing. Continue
  // bounded reads after a parser failure so later I/O/UTF8 failures retain
  // their original higher priority, including failures across byte seams.
  await compilerArchivedSourceBytes(directory,path,block=>{
    if(decodeFailed)return;
    let text;
    try{text=decoder.decode(block,{stream:true});}
    catch(error){decodeFailed=true;decodeFailure=error;return;}
    if(!parseFailed)try{parser.write(text);}catch(error){parseFailed=true;parseFailure=error;}
  });
  if(decodeFailed)throw decodeFailure;
  const tail=decoder.decode();
  if(parseFailed)throw parseFailure;
  parser.write(tail);return parser.finish();
}

function* compilerSourceUTF8Blocks(source){
  for(let offset=0;offset<source.length;){
    let end=Math.min(source.length,offset+16384);
    if(end<source.length&&source.charCodeAt(end-1)>=0xd800&&source.charCodeAt(end-1)<=0xdbff&&
        source.charCodeAt(end)>=0xdc00&&source.charCodeAt(end)<=0xdfff)end--;
    yield Buffer.from(source.slice(offset,end),'utf8');offset=end;
  }
}

export async function readArchivedCompilerSources(directory,{expectedIdentity}={}){
  const readJSON=path=>readCompilerArchivedJSON(directory,path);
  const manifest=await readJSON('source-archive.json'),identity=await readJSON('identity.json');
  if(manifest?.format!=='eliscript-compiler-source-archive'||manifest.version!==1||manifest.encoding!=='utf16le'||
      manifest.identityPath!=='identity.json'||!Array.isArray(manifest.records)||identity?.encoding!=='utf16le'||
      !/^[0-9a-f]{64}$/.test(identity.sha256??'')||manifest.identitySha256!==identity.sha256)
    throw new TypeError('invalid compiler source archive identity');
  if(expectedIdentity!==undefined){
    const expected=typeof expectedIdentity==='string'?expectedIdentity:expectedIdentity?.sha256;
    if(!/^[0-9a-f]{64}$/.test(expected??'')||expected!==identity.sha256)
      throw new Error('compiler source archive differs from the expected source identity');
  }
  const expected=new Map(),seenIds=new Set();
  const sources={entry:identity.entry,modules:[],runtime:undefined};
  function inventory(kind,records){
    if(!Array.isArray(records))throw new TypeError('compiler source archive has an incomplete source inventory');
    for(const record of records){
      const id=moduleId(record?.id);
      if(seenIds.has(id)||typeof record.filename!=='string')throw new TypeError('duplicate or invalid archived compiler source identity');
      seenIds.add(id);expected.set(kind+':'+id,record);
    }
  }
  inventory('module',identity.modules);
  if(!identity.runtime||typeof identity.runtime.filename!=='string')throw new TypeError('compiler source archive omits runtime identity');
  expected.set('runtime',identity.runtime);
  for(const[field,kind]of[['hostSources','host'],['literalSources','literal']])if(Object.hasOwn(identity,field)){
    inventory(kind,identity[field]);sources[field]=[];
  }
  for(const field of ['hostModules','phased'])if(Object.hasOwn(identity,field))sources[field]=structuredClone(identity[field]);
  const paths=new Set(),seen=new Set();
  for(const record of manifest.records){
    const kind=record?.kind;
    if(!['module','host','literal','runtime'].includes(kind))throw new TypeError('invalid archived compiler source kind');
    const key=kind==='runtime'?'runtime':kind+':'+moduleId(record.id),bound=expected.get(key);
    if(!bound||seen.has(key)||kind==='runtime'&&record.id!==null||record.filename!==bound.filename||
        record.encoding!=='utf16le'||bound.encoding!=='utf16le'||record.bytes!==bound.bytes||record.sha256!==bound.sha256)
      throw new Error('compiler source archive record differs from its source identity');
    seen.add(key);
    const path=moduleId(record.path),tool=record.tool;
    if(!/^source-codeunits\/(?:runtime[.]utf16le|(?:module|host|literal)\/[0-9]+[.]utf16le)$/.test(path)||paths.has(path))
      throw new TypeError('invalid or duplicate archived compiler source path');
    paths.add(path);
    if(!tool||tool.path!==compilerArchivedToolPath(kind,record.id)||tool.encoding!=='utf8'||tool.role!=='tool-projection'||typeof tool.lossless!=='boolean')
      throw new TypeError('invalid archived compiler tool projection');
    if(paths.has(tool.path))throw new TypeError('duplicate archived compiler tool projection path');
    paths.add(tool.path);
    const pieces=[];let pendingByte=-1;
    const bytes=await compilerArchivedSourceBytes(directory,path,block=>{
      let offset=0;
      if(pendingByte>=0){pieces.push(String.fromCharCode(pendingByte|(block[0]<<8)));pendingByte=-1;offset=1;}
      const end=block.length-((block.length-offset)%2);
      if(end>offset)pieces.push(block.subarray(offset,end).toString('utf16le'));
      if(end<block.length)pendingByte=block[end];
    });
    compilerArchivedSourceFile(record,bytes,'UTF-16 source');
    if(pendingByte>=0)throw new Error('compiler source archive has an incomplete UTF-16 code unit');
    const source=pieces.join('');pieces.length=0;
    const expectedProjection=compilerSourceUTF8Blocks(source);
    let expectedBlock=expectedProjection.next(),expectedOffset=0,projectionMismatch=false;
    const projection=await compilerArchivedSourceBytes(directory,tool.path,block=>{
      let offset=0;
      while(offset<block.length){
        if(expectedBlock.done){projectionMismatch=true;break;}
        const count=Math.min(block.length-offset,expectedBlock.value.length-expectedOffset);
        if(!block.subarray(offset,offset+count).equals(expectedBlock.value.subarray(expectedOffset,expectedOffset+count)))projectionMismatch=true;
        offset+=count;expectedOffset+=count;
        if(expectedOffset===expectedBlock.value.length){expectedBlock=expectedProjection.next();expectedOffset=0;}
      }
    });
    compilerArchivedSourceFile(tool,projection,'tool projection');
    if(projectionMismatch||!expectedBlock.done||tool.lossless!==compilerSourceToolLossless(source))
      throw new Error('compiler source archive tool projection differs from the exact source');
    if(kind==='runtime')sources.runtime={filename:record.filename,source};
    else sources[kind==='module'?'modules':kind==='host'?'hostSources':'literalSources'].push({id:record.id,filename:record.filename,source});
  }
  if(seen.size!==expected.size||sources.runtime===undefined)
    throw new Error('compiler source archive omits original source records');
  const restored=compilerSourceIdentity(sources);
  if(JSON.stringify(sourceDeclarationData(restored))!==JSON.stringify(sourceDeclarationData(identity)))
    throw new Error('compiler source archive does not restore its complete source identity');
  return sources;
}

async function completeSources(sourceRoot,supplied) {
  const actual=await loadCompilerSources({sourceRoot});
  const expected=compilerSourceIdentity(actual);
  if(supplied&&compilerSourceIdentity(supplied).sha256!==expected.sha256)
    throw new Error('supplied compiler sources differ from the complete source graph');
  return structuredClone(supplied??actual);
}

function assertProducer(artifact,session,sources) {
  assertCompilerArtifactSources(artifact,sources);
  const provenance=artifact?.provenance;
  if(!provenance||provenance.mode!==(session?'session':'seed')||provenance.runtimeCompiled!==true)
    throw new Error('compiler build did not record a complete runtime compilation');
  const wanted=sources.modules.map(record=>record.id).sort();
  const received=provenance.compiledModuleIds;
  if(!Array.isArray(received)||JSON.stringify([...received].sort())!==JSON.stringify(wanted))
    throw new Error('compiler build did not compile every original module');
  if(session&&normalizeCompilerHost(provenance.producerHost)!==normalizeCompilerHost(session.host))
    throw new Error('compiler build producer differs from the active independent session');
}

// Producer metadata is checked against the same complete source bundle that is
// handed to its session. A matching module inventory alone cannot authenticate
// a compiler or a cached literal/runtime bundle from an earlier revision.
export function assertCompilerArtifactSources(artifact,sources) {
  compilerSourceIdentity(sources);
  const identity=artifact?.sourceIdentity;
  if(identity?.algorithm!=='sha256'||identity.encoding!=='utf16le'||artifact.entry!==sources.entry)
    throw new Error('compiler artifact has no complete UTF-16 source identity');
  const record=source=>({id:source.id,filename:source.filename,
    sha256:compilerDigest(Buffer.from(source.source,'utf16le'))});
  const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
  const ordered=records=>[...records].sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0);
  if(!Array.isArray(identity.modules)||!same(ordered(identity.modules),ordered(sources.modules.map(record))))
    throw new Error('compiler artifact differs from the complete frontend/backend/driver source graph');
  const runtime={filename:sources.runtime.filename,sha256:compilerDigest(Buffer.from(sources.runtime.source,'utf16le'))};
  if(!same(identity.runtime,runtime))throw new Error('compiler artifact runtime source is stale');
  for(const field of ['literalSources','hostSources']){
    if(Object.hasOwn(sources,field)){
      if(!Array.isArray(identity[field])||!same(ordered(identity[field]),ordered(sources[field].map(record))))
        throw new Error('compiler artifact '+field+' source graph is stale or incomplete');
    }else if(Object.hasOwn(identity,field))throw new Error('compiler artifact contains undeclared '+field);
  }
  return artifact;
}

async function emittedFileIdentity(path) {
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path,{highWaterMark:65536})){
    hash.update(chunk);bytes+=chunk.length;
  }
  return{bytes,sha256:hash.digest('hex')};
}

async function declaredEmittedFiles(directory,declarations) {
  if(!Array.isArray(declarations))throw new TypeError('compiler artifact files must be an array');
  const files=[],seen=new Set();
  for(const declared of declarations){
    const path=moduleId(declared?.path);
    if(seen.has(path))throw new TypeError('duplicate compiler artifact file: '+path);
    seen.add(path);
    const parts=path.split('/');
    for(let index=0;index<parts.length;index++){
      const stat=await lstat(resolve(directory,...parts.slice(0,index+1)));
      if(index===parts.length-1?!stat.isFile():!stat.isDirectory())
        throw new Error('compiler artifact contains an unsupported file entry: '+path);
    }
    const record={path,...await emittedFileIdentity(resolve(directory,path))};
    if(record.sha256!==declared.sha256||record.bytes!==declared.bytes)
      throw new Error('compiler artifact changed after emission: '+path);
    files.push(record);
  }
  return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}

export async function archiveCompilerArtifact(artifact,directory) {
  const host=normalizeCompilerHost(artifact?.host);
  if(typeof artifact.path!=='string'||typeof artifact.directory!=='string')throw new TypeError('compiler artifact paths are required');
  await mkdir(directory,{recursive:true});
  // Build dependencies are outside the emitted product. Bind only the exact
  // declared deliverables, checking every path component before reading bytes.
  const files=await declaredEmittedFiles(artifact.directory,artifact.artifactIdentity?.files);
  if(!files.length)throw new Error('compiler artifact has no emitted files');
  const entry=relative(resolve(artifact.directory),resolve(artifact.path)).split(sep).join('/');
  if(!files.some(record=>record.path===entry))throw new Error('compiler artifact entry is not an emitted file');
  const payload=await emittedFileIdentity(artifact.path);
  const result={host,entry:artifact.entry,path:artifact.path,directory:artifact.directory,sha256:payload.sha256,bytes:payload.bytes,files,
    provenance:structuredClone(artifact.provenance),sourceIdentity:structuredClone(artifact.sourceIdentity),
    profile:artifact.profile,budget:artifact.budget,memory:artifact.memory,auto:artifact.auto};
  if(artifact.artifactIdentity?.files){
    const actual=new Map(files.map(record=>[record.path,record])),bound=[];
    for(const declared of artifact.artifactIdentity.files){
      const record=actual.get(declared.path);
      if(!record||record.sha256!==declared.sha256||record.bytes!==declared.bytes)throw new Error('compiler artifact changed after emission: '+declared.path);
      bound.push(record);
    }
    result.productIdentity=independentCompilerProductIdentity({host,nativeTarget:artifact.nativeTarget,files:bound,descriptor:artifact.descriptor,typed:artifact.typed});
    if(artifact.productIdentity?.sha256!==result.productIdentity.sha256)throw new Error('compiler product identity differs from its emitted bytes');
  }
  if(artifact.descriptor!==undefined){
    await saveCompilerMetadata(join(directory,'descriptor.json'),artifact.descriptor);
    result.descriptorSha256=compilerMetadataDigest(artifact.descriptor);
  }
  if(artifact.typed!==undefined){
    await saveCompilerMetadata(join(directory,'typed.json'),artifact.typed);
    result.typedSha256=compilerMetadataDigest(artifact.typed);
  }
  await saveCompilerMetadata(join(directory,'artifact.json'),result);
  return result;
}

function compilerArtifactResources(artifact,directory) {
  const declarations=new Map(),declared=artifact.artifactIdentity!==undefined;
  if(declared){
    const identity=artifact.artifactIdentity;
    if(identity?.algorithm!=='sha256'||!Array.isArray(identity.files)||!identity.files.length)
      throw new TypeError('compiler artifact requires a nonempty SHA-256 file identity');
    for(const entry of identity.files){
      const path=moduleId(entry?.path);
      if(declarations.has(path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[0-9a-f]{64}$/.test(entry.sha256??''))
        throw new TypeError('invalid or duplicate compiler resource identity: '+path);
      declarations.set(path,{path,bytes:entry.bytes,sha256:entry.sha256});
    }
  }
  function pathFor(path){
    if(typeof path!=='string'||!path)throw new TypeError('compiler resource path is required');
    return moduleId(relative(directory,resolve(directory,path)).split(sep).join('/'));
  }
  function binding(path){
    const key=pathFor(path),entry=declarations.get(key);
    if(declared&&!entry)throw new Error('compiler resource has no emitted file identity: '+key);
    return{key,entry};
  }
  function check(path,bytes){
    const {key,entry}=binding(path);
    if(entry&&(bytes.byteLength!==entry.bytes||compilerDigest(bytes)!==entry.sha256))
      throw new Error('compiler resource SHA-256 or byte length identity changed after emission: '+key);
    return bytes;
  }
  async function prepare(path){
    const resource=binding(path),{key}=resource,parts=key.split('/');
    for(let index=0;index<parts.length;index++){
      const stat=await lstat(resolve(directory,...parts.slice(0,index+1)));
      if(index===parts.length-1?!stat.isFile():!stat.isDirectory())
        throw new Error('compiler resource contains an unsupported file entry: '+key);
    }
    return resource;
  }
  async function read(path){
    const {key}=await prepare(path);
    return check(path,await readFile(resolve(directory,key)));
  }
  async function consume(path,receive){
    const {key,entry}=await prepare(path),file=await open(resolve(directory,key),'r');
    const hash=createHash('sha256'),buffer=new Uint8Array(65536);let bytes=0,failed=false;
    try{
      for(;;){
        const {bytesRead}=await file.read(buffer,0,buffer.length,null);
        if(!Number.isInteger(bytesRead)||bytesRead<0||bytesRead>buffer.length)
          throw new Error('compiler resource read returned an invalid byte count');
        if(bytesRead===0)break;
        const block=buffer.subarray(0,bytesRead);hash.update(block);bytes+=bytesRead;receive(block);
      }
      if(entry&&(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256))
        throw new Error('compiler resource SHA-256 or byte length identity changed after emission: '+key);
    }catch(error){failed=true;throw error;}
    finally{try{await file.close();}catch(error){if(!failed)throw error;}}
  }
  async function verify(path){await consume(path,()=>{});}
  async function readSource(path,encoding='utf8',beforeDecode=()=>{}){
    const supported=encoding==='utf8'||encoding==='json-utf16';
    const decoder=supported?new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}):undefined;
    const parser=encoding==='json-utf16'?createCompilerMetadataDecoder():undefined,pieces=[];
    let decodeFailed=false,decodeFailure,parseFailed=false,parseFailure;
    await consume(path,block=>{
      if(!supported||decodeFailed)return;
      let text;
      try{text=decoder.decode(block,{stream:true});}
      catch(error){decodeFailed=true;decodeFailure=error;return;}
      if(parser){if(!parseFailed)try{parser.write(text);}catch(error){parseFailed=true;parseFailure=error;}}
      else pieces.push(text);
    });
    // Original order: resource hash, cancellation/close, encoding, UTF8, JSON.
    // Deferring decode failures preserves that order without retaining bytes.
    beforeDecode();
    if(!supported)throw new TypeError('unsupported compiler source asset encoding');
    if(decodeFailed)throw decodeFailure;
    const tail=decoder.decode();
    if(parser){
      if(parseFailed)throw parseFailure;
      parser.write(tail);const source=parser.finish();
      if(typeof source!=='string')throw new TypeError('encoded compiler source asset must contain a JSON string');
      return source;
    }
    pieces.push(tail);const source=pieces.join('');pieces.length=0;return source;
  }
  async function readMetadata(path){
    const {key,entry}=await prepare(path),file=await open(resolve(directory,key),'r');
    let failed=false;
    try{
      const hash=createHash('sha256'),buffer=new Uint8Array(65536);
      const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),parser=createCompilerMetadataDecoder();
      let bytes=0,decodeFailed=false,decodeFailure;
      for(;;){
        const {bytesRead}=await file.read(buffer,0,buffer.length,null);
        if(!bytesRead)break;
        const part=buffer.subarray(0,bytesRead);hash.update(part);bytes+=bytesRead;
        // Resource identity preceded JSON parsing in the original loader.
        // Retain that priority even if corrupt JSON is detected mid-stream.
        if(!decodeFailed)try{parser.write(decoder.decode(part,{stream:true}));}
        catch(error){decodeFailed=true;decodeFailure=error;}
      }
      if(entry&&(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256))
        throw new Error('compiler resource SHA-256 or byte length identity changed after emission: '+key);
      if(decodeFailed)throw decodeFailure;
      parser.write(decoder.decode());
      return parser.finish();
    }catch(error){failed=true;throw error;}
    finally{try{await file.close();}catch(error){if(!failed)throw error;}}
  }
  return{declared,declarations,pathFor,binding,check,read,verify,readSource,readMetadata};
}

function compilerArtifactMemoryBytes(value){
  if(value instanceof Uint8Array)return Uint8Array.from(value);
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(Array.isArray(value)&&value.every(byte=>Number.isInteger(byte)&&byte>=0&&byte<=255))return Uint8Array.from(value);
  throw new TypeError('compiler WASM bytes must contain actual bytes');
}

function compilerLiteralSourceIdentity(identity,asset,source,required){
  if(identity===undefined){
    if(required)throw new Error('compiler literal source has no UTF-16 source identity: '+asset.id);
    return;
  }
  if(identity?.algorithm!=='sha256'||identity.encoding!=='utf16le'||!Array.isArray(identity.literalSources))
    throw new TypeError('compiler literal sources require a complete UTF-16 source identity');
  const matches=identity.literalSources.filter(record=>record?.id===asset.id);
  const expected=matches[0];
  if(matches.length!==1||expected.filename!==asset.filename||!/^[0-9a-f]{64}$/.test(expected.sha256??'')||
      expected.encoding!==undefined&&expected.encoding!=='utf16le'||
      expected.bytes!==undefined&&expected.bytes!==source.length*2||
      compilerSourceTextDigest(source).sha256!==expected.sha256)
    throw new Error('compiler literal source differs from its UTF-16 source identity: '+asset.id);
}

function compilerRuntimeSourceIdentity(identity,source,required){
  if(identity===undefined){
    if(required)throw new Error('compiler runtime source has no UTF-16 source identity');
    return;
  }
  const expected=identity.runtime;
  if(identity.algorithm!=='sha256'||identity.encoding!=='utf16le'||typeof expected?.filename!=='string'||
      !/^[0-9a-f]{64}$/.test(expected.sha256??'')||
      expected.encoding!==undefined&&expected.encoding!=='utf16le'||
      expected.bytes!==undefined&&expected.bytes!==source.length*2||
      compilerSourceTextDigest(source).sha256!==expected.sha256)
    throw new Error('compiler runtime source differs from its UTF-16 source identity');
}

function compilerArtifactRequestActive(session,options){
  if(session.closed)throw new Error('compiler session is closed');
  if(options?.signal?.aborted)throw options.signal.reason===undefined?new Error('compiler request aborted'):options.signal.reason;
}

export async function openCompilerArtifact(artifact,options={}) {
  const host=normalizeCompilerHost(artifact?.host);
  const artifactDirectory=artifact.directory??(artifact.metadataPath?dirname(artifact.metadataPath):dirname(artifact.path));
  const artifactPath=artifact.directory||artifact.metadataPath?resolve(artifactDirectory,artifact.path):resolve(artifact.path);
  const resources=compilerArtifactResources(artifact,resolve(artifactDirectory));
  const sourceIdentity=artifact.sourceIdentity===undefined?undefined:structuredClone(artifact.sourceIdentity);
  const literalAssets=artifact.literalSources===undefined?undefined:structuredClone(artifact.literalSources);
  const runtimeAsset={path:artifact.runtimePath,encoding:artifact.runtimeEncoding};
  // Snapshot caller-owned bytes before resource I/O. Both the on-disk entry
  // and the exact bytes passed to WASM must satisfy the emitted declaration.
  const suppliedBytes=host==='wasm'&&artifact.bytes!==undefined?compilerArtifactMemoryBytes(artifact.bytes):undefined;
  let configuration={host,memory:artifact.memory,options:{...artifact.budget,auto:artifact.auto,nativeTarget:artifact.nativeTarget,...options}};
  if(options.debug===undefined&&artifact.debugPath){
    const document=await resources.readMetadata(artifact.debugPath);
    configuration.options.debug=resources.declared?ownCompilerDebugDocument(document):document;
  }
  if(host==='javascript'){
    if(resources.declared){
      if(!Array.isArray(artifact.modules)||!artifact.modules.length)throw new TypeError('compiler JavaScript module graph is required');
      const ids=new Set(),paths=new Set();
      for(const module of artifact.modules){
        const id=moduleId(module?.id),path=resources.pathFor(module.path);
        if(ids.has(id)||paths.has(path))throw new TypeError('duplicate compiler JavaScript module');
        ids.add(id);paths.add(path);resources.binding(module.path);
      }
      if(!paths.has(resources.pathFor(artifactPath)))throw new Error('compiler entry is absent from its JavaScript module graph');
      if(Array.isArray(sourceIdentity?.modules))for(const module of sourceIdentity.modules)
        if(!ids.has(module.id))throw new Error('compiler JavaScript module graph omits a source module: '+module.id);
      // Validate executable modules and providers, rather than rescanning
      // unused frontend IR, source maps, runtime text or other deliverables.
      const executable=new Set([...paths,...[...resources.declarations.keys()].filter(path=>/\.(?:mjs|js)$/.test(path))]);
      for(const path of executable)await resources.verify(path);
    }
    // The ESM loader opens these paths again; preflight verification does not
    // claim that import() consumes our buffers or eliminates that TOCTOU gap.
    configuration.compiler=await import(pathToFileURL(artifactPath).href);
  }else if(host==='wasm'){
    const disk=resources.declared||suppliedBytes===undefined?await resources.read(artifactPath):undefined;
    configuration.bytes=suppliedBytes===undefined?Uint8Array.from(disk):resources.check(artifactPath,suppliedBytes);
  }else{
    await resources.verify(artifactPath);
    // dlopen likewise reopens the verified path using the platform loader.
    configuration.path=artifactPath;configuration.descriptor=artifact.lowered??{typed:artifact.typed,descriptor:artifact.descriptor};
  }
  const session=await createCompilerSession(configuration);
  if(normalizeCompilerHost(session.host)!==host){await session.close();throw new Error('compiler session changed its requested host');}
  if(host==='javascript'&&resources.declared){
    verifiedCompilerBuildSessions.add(session);
    try{await registerVerifiedCompilerBuildConsumption(session);}
    catch(error){verifiedCompilerBuildSessions.delete(session);try{await session.close();}catch{}throw error;}
  }
  let literalSourcesLoading,runtimeSourceLoading;
  function dispatchRuntime(record,requestOptions){
      compilerArtifactRequestActive(session,requestOptions);
      if(Object.hasOwn(record,'literalSources')||literalAssets===undefined)return session.request(record,requestOptions);
      if(!literalSourcesLoading)literalSourcesLoading=(async()=>{
        if(!Array.isArray(literalAssets))throw new TypeError('compiler literalSources must be an array');
        const ids=new Set();
        for(const item of literalAssets){
          const id=moduleId(item?.id);
          if(ids.has(id)||typeof item.filename!=='string'||typeof item.path!=='string')throw new TypeError('invalid compiler literal source asset');
          ids.add(id);
        }
        if(sourceIdentity?.literalSources!==undefined&&(!Array.isArray(sourceIdentity.literalSources)||sourceIdentity.literalSources.length!==literalAssets.length))
          throw new Error('compiler literal source inventory differs from its source identity');
        return Promise.all(literalAssets.map(async item=>{
          if(typeof item?.id!=='string'||typeof item.filename!=='string'||typeof item.path!=='string')throw new TypeError('invalid compiler literal source asset');
          const source=await resources.readSource(item.path,item.encoding,
            ()=>compilerArtifactRequestActive(session,requestOptions));
          compilerLiteralSourceIdentity(sourceIdentity,item,source,resources.declared);
          return{id:item.id,filename:item.filename,source};
        }));
      })().catch(error=>{literalSourcesLoading=undefined;throw error;});
      return literalSourcesLoading.then(literalSources=>{
        compilerArtifactRequestActive(session,requestOptions);
        return session.request({...record,literalSources},requestOptions);
      });
  }
  const adapter=Object.freeze({host:session.host,get closed(){return session.closed;},close:()=>session.close(),
    request(request,requestOptions){
      const record=typeof request==='string'?JSON.parse(request):request;
      if(record?.operation!=='runtime')return session.request(request,requestOptions);
      compilerArtifactRequestActive(session,requestOptions);
      if(Object.hasOwn(record,'source'))return dispatchRuntime(record,requestOptions);
      if(!runtimeSourceLoading)runtimeSourceLoading=(async()=>{
        if(typeof runtimeAsset.path!=='string')throw new TypeError('compiler artifact has no runtime source asset');
        const source=await resources.readSource(runtimeAsset.path,runtimeAsset.encoding,
          ()=>compilerArtifactRequestActive(session,requestOptions));
        compilerRuntimeSourceIdentity(sourceIdentity,source,resources.declared);
        return source;
      })().catch(error=>{runtimeSourceLoading=undefined;throw error;});
      return runtimeSourceLoading.then(source=>{
        compilerArtifactRequestActive(session,requestOptions);
        const payload={...record,source};
        if(!Object.hasOwn(record,'filename'))payload.filename=sourceIdentity?.runtime?.filename??'bootstrap/runtime/memory.eli';
        return dispatchRuntime(payload,requestOptions);
      });
    },
  });
  return registerCompilerBuildProductForwarder(adapter,session);
}

function abort(signal) {
  if(signal?.aborted)throw signal.reason===undefined?new Error('compiler bootstrap aborted'):signal.reason;
}

function sequence(options) {
  if(options.hosts!==undefined){
    if(!Array.isArray(options.hosts)||!options.hosts.length)throw new TypeError('bootstrap host sequence must be nonempty');
    if(options.generations!==undefined&&options.generations!==options.hosts.length)throw new TypeError('generation count differs from host sequence');
    return options.hosts.map(normalizeCompilerHost);
  }
  const count=options.generations??3;
  if(!Number.isSafeInteger(count)||count<1)throw new TypeError('bootstrap generations must be positive');
  return Array.from({length:count},()=>normalizeCompilerHost(options.host??'javascript'));
}

async function seedCompiler(options,sources,directory) {
  if(options.seedArtifact){
    const artifact=options.seedArtifact,mode=artifact.provenance?.mode;
    if(mode!=='seed'&&mode!=='session')throw new Error('initial compiler has no recorded producer');
    assertProducer(artifact,mode==='session'?{host:artifact.provenance.producerHost}:null,sources);
    return artifact;
  }
  const artifact=await buildIndependentCompiler({host:'javascript',outputRoot:directory,sources,
    profile:options.profile,budget:options.budget,memory:options.memory,auto:options.auto,nativeTarget:options.nativeTarget,signal:options.signal,
    retainIR:options.retainIR??true,debug:options.debug??true});
  assertProducer(artifact,null,sources);
  return artifact;
}

// This is production construction orchestration. Completion means construction
// returned artifacts; semantic consistency remains explicitly unverified.
export async function bootstrapCompilerChain(options={}) {
  if(typeof options.outputRoot!=='string')throw new TypeError('bootstrap outputRoot is required');
  const hosts=sequence(options),sources=await completeSources(options.sourceRoot??root,options.sources);
  await mkdir(options.outputRoot,{recursive:true});
  const directory=await mkdtemp(join(resolve(options.outputRoot),'compiler-chain-'));
  const sourceIdentity=await archiveCompilerSources(sources,join(directory,'sources'));
  const metadata={format:'eliscript-compiler-bootstrap',version:1,directory,hosts,sourceIdentity,status:'created',verification:'unverified',generations:[]};
  metadata.fixedPoint={status:'insufficient-generations',comparisons:[]};
  const manifest=join(directory,'bootstrap.json');
  await saveCompilerMetadata(manifest,metadata);
  let active=null,artifact=null,phase='seed';
  try {
    abort(options.signal);
    artifact=await seedCompiler(options,sources,join(directory,'seed'));
    metadata.seed=await archiveCompilerArtifact(artifact,join(directory,'seed-metadata'));
    phase='instantiate-seed';active=await openCompilerArtifact(artifact,options.sessionOptions);
    for(let index=0;index<hosts.length;index++){
      abort(options.signal);
      const target=hosts[index],generation=index+1;
      const record={generation,producerHost:active.host,target,sourceSha256:sourceIdentity.sha256,status:'building',verification:'unverified'};
      metadata.generations.push(record);metadata.status='building';phase='generation-'+generation+'-build';
      await saveCompilerMetadata(manifest,metadata);
      await options.onStage?.({directory,generation,producerHost:active.host,target,phase:'build'});
      const nextArtifact=await buildIndependentCompiler({host:target,outputRoot:join(directory,'generation-'+generation+'-'+target),session:active,
        sources:structuredClone(sources),profile:options.profile,budget:options.budget,memory:options.memory,auto:options.auto,
        nativeTarget:options.nativeTarget,signal:options.signal,retainIR:options.retainIR??true,debug:options.debug??true});
      assertProducer(nextArtifact,active,sources);
      if(normalizeCompilerHost(nextArtifact.host)!==target)throw new Error('compiler build changed its requested target');
      record.artifact=await archiveCompilerArtifact(nextArtifact,join(directory,'generation-'+generation+'-metadata'));
      const previous=metadata.generations.slice(0,-1).findLast(item=>item.target===target);
      if(previous){
        const left=previous.artifact?.productIdentity?.sha256,right=record.artifact.productIdentity?.sha256;
        metadata.fixedPoint.comparisons.push({target,from:previous.generation,to:generation,
          status:left&&right?(left===right?'identical':'different'):'unverified',identities:[left??null,right??null]});
      }
      record.status='built';await saveCompilerMetadata(manifest,metadata);
      phase='generation-'+generation+'-instantiate';
      const next=await openCompilerArtifact(nextArtifact,options.sessionOptions);
      const previousSession=active;active=next;artifact=nextArtifact;
      await previousSession.close();
      record.status='instantiated';await saveCompilerMetadata(manifest,metadata);
      await options.onStage?.({directory,generation,producerHost:record.producerHost,target,phase:'instantiated'});
    }
    const complete=compilerHosts.filter(host=>hosts.includes(host)).every(host=>{
      const records=metadata.generations.filter(record=>record.target===host);
      const comparisons=metadata.fixedPoint.comparisons.filter(item=>item.target===host);
      return records.length>=3&&comparisons.length===records.length-1&&comparisons.every(item=>item.status==='identical');
    });
    metadata.fixedPoint.status=complete?'identical':metadata.fixedPoint.comparisons.some(item=>item.status==='different')?'different':'insufficient-generations';
    metadata.status='constructed';await saveCompilerMetadata(manifest,metadata);
    return {directory,artifact,metadata};
  }catch(error){
    metadata.status='failed';metadata.failure={phase,...compilerFailure(error)};
    await saveCompilerMetadata(manifest,metadata);throw error;
  }finally{
    if(active){try{await active.close();}catch(error){const failed=metadata.status==='failed';metadata.cleanupFailure=compilerFailure(error);metadata.status='failed';await saveCompilerMetadata(manifest,metadata);if(!failed)throw error;}}
  }
}

export async function bootstrapIndependentCompilers(options={}) {
  if(typeof options.outputRoot!=='string')throw new TypeError('bootstrap outputRoot is required');
  const requested=options.chains??compilerHosts.map(host=>sequence({host,generations:options.generations}));
  if(!Array.isArray(requested)||!requested.length)throw new TypeError('independent bootstrap chains are required');
  const chains=requested.map(hosts=>sequence({hosts}));
  const sources=await completeSources(options.sourceRoot??root,options.sources);
  await mkdir(options.outputRoot,{recursive:true});
  const directory=await mkdtemp(join(resolve(options.outputRoot),'compiler-bootstrap-'));
  const seed=await seedCompiler(options,sources,join(directory,'seed'));
  const metadata={format:'eliscript-independent-compiler-bootstrap',version:1,status:'building',verification:'unverified',
    sourceIdentity:await archiveCompilerSources(sources,join(directory,'sources')),chains:[]};
  const manifest=join(directory,'bootstrap.json');await saveCompilerMetadata(manifest,metadata);
  const artifacts=[];
  for(let index=0;index<chains.length;index++){
    const hosts=chains[index].map(normalizeCompilerHost);
    try {
      const result=await bootstrapCompilerChain({...options,generations:undefined,hosts,sources,seedArtifact:seed,outputRoot:join(directory,'chain-'+index)});
      artifacts.push(result.artifact);metadata.chains.push({hosts,directory:result.directory,status:'constructed',verification:'unverified',
        sourceIdentity:result.metadata.sourceIdentity,artifact:result.metadata.generations.at(-1)?.artifact,
        fixedPoint:result.metadata.fixedPoint});
    }catch(error){
      metadata.chains.push({hosts,status:'failed',failure:compilerFailure(error),verification:'unverified'});
      await saveCompilerMetadata(manifest,metadata);
      if(options.continueOnError!==true){metadata.status='failed';await saveCompilerMetadata(manifest,metadata);throw error;}
    }
    await saveCompilerMetadata(manifest,metadata);
  }
  metadata.status=metadata.chains.some(chain=>chain.status==='failed')?'incomplete':'constructed';
  metadata.fixedPoint={status:metadata.chains.every(chain=>chain.fixedPoint?.status==='identical')?'identical':'unverified'};
  await saveCompilerMetadata(manifest,metadata);
  return {directory,artifacts,metadata};
}

// Rebuild the entire compiler once for each producer/target pair. These records
// are distinct from the language-program matrix and from self-host generations.
export async function bootstrapCompilerGrid(options={}) {
  if(typeof options.outputRoot!=='string')throw new TypeError('compiler grid outputRoot is required');
  const sources=await completeSources(options.sourceRoot??root,options.sources);
  await mkdir(options.outputRoot,{recursive:true});
  const directory=await mkdtemp(join(resolve(options.outputRoot),'compiler-grid-'));
  const metadata={format:'eliscript-independent-compiler-grid',version:1,status:'building',verification:'unverified',
    sourceIdentity:await archiveCompilerSources(sources,join(directory,'sources')),cells:[],comparisons:[]};
  const manifest=join(directory,'grid.json'),artifacts=[],producers=new Map();
  await saveCompilerMetadata(manifest,metadata);
  try{
    let supplied=options.compilerArtifacts;
    if(!supplied){
      const baseline=await bootstrapIndependentCompilers({...options,sources,outputRoot:join(directory,'generations')});
      metadata.generations={directory:baseline.directory,status:baseline.metadata.status,
        sourceIdentity:baseline.metadata.sourceIdentity,chains:baseline.metadata.chains,fixedPoint:baseline.metadata.fixedPoint};
      supplied=baseline.artifacts;
    }
    for(const artifact of Array.isArray(supplied)?supplied:Object.values(supplied)){
      const host=normalizeCompilerHost(artifact?.host);
      if(producers.has(host))throw new TypeError('compiler grid has duplicate producer hosts');
      assertCompilerArtifactSources(artifact,sources);
      producers.set(host,artifact);
    }
    for(const host of compilerHosts)if(!producers.has(host))throw new TypeError('compiler grid is missing producer '+host);
    for(const host of compilerHosts){
      abort(options.signal);let producer;
      try{
        producer=await openCompilerArtifact(producers.get(host),options.sessionOptions);
        for(const target of compilerHosts){
          abort(options.signal);
          const cell={host,target,status:'building',execution:'unverified'},cellDirectory=join(directory,host+'-to-'+target);
          metadata.cells.push(cell);await mkdir(cellDirectory,{recursive:true});await saveCompilerMetadata(manifest,metadata);
          let emitted,instance;
          try{
            await options.onStage?.({directory,host,target,phase:'compiler-build'});
            emitted=await buildIndependentCompiler({...options,sources,session:producer,host:target,outputRoot:join(cellDirectory,'artifact'),
              retainIR:options.retainIR??true,debug:options.debug??true});
            assertProducer(emitted,producer,sources);
            if(normalizeCompilerHost(emitted.host)!==target)throw new Error('compiler grid emitted a different host');
            cell.artifact=await archiveCompilerArtifact(emitted,join(cellDirectory,'metadata'));
            cell.status='built';await saveCompilerMetadata(manifest,metadata);
            await options.onStage?.({directory,host,target,phase:'compiler-initialize'});
            instance=await openCompilerArtifact(emitted,options.sessionOptions);
            const capabilities=await instance.request({operation:'capabilities'},{signal:options.signal});
            await saveCompilerMetadata(join(cellDirectory,'capabilities.json'),capabilities);
            cell.execution='initialized';cell.status='constructed';artifacts.push(emitted);
          }catch(error){
            cell.status='failed';cell.failure=compilerFailure(error);
            if(options.continueOnError!==true)throw error;
          }finally{
            if(instance)try{await instance.close();}catch(error){cell.cleanupFailure=compilerFailure(error);cell.status='failed';}
            await saveCompilerMetadata(manifest,metadata);
          }
        }
      }finally{
        if(producer)try{await producer.close();}catch(error){
          metadata.cleanupFailures??=[];metadata.cleanupFailures.push({host,...compilerFailure(error)});
          await saveCompilerMetadata(manifest,metadata);
        }
      }
    }
    const canonicalArtifacts=[];
    for(const target of compilerHosts){
      const cells=metadata.cells.filter(cell=>cell.target===target);
      const identities=cells.map(cell=>cell.artifact?.productIdentity?.sha256??null);
      const complete=cells.length===3&&cells.every(cell=>cell.status==='constructed'&&cell.execution==='initialized');
      const status=complete&&identities.every(Boolean)?new Set(identities).size===1?'identical':'different':'unverified';
      metadata.comparisons.push({target,status,identities});
      if(status==='identical')canonicalArtifacts.push(artifacts.find(artifact=>artifact.host===target));
    }
    const constructed=metadata.cells.length===9&&metadata.cells.every(cell=>cell.status==='constructed')&&!metadata.cleanupFailures?.length;
    metadata.identityVerification=constructed&&metadata.comparisons.every(item=>item.status==='identical')?'identical':'unverified';
    metadata.status=constructed?'constructed':'incomplete';
    // Language semantics, original gates, performance, and release acceptance
    // are separate evidence; byte identity alone cannot mark them verified.
    await saveCompilerMetadata(manifest,metadata);
    return {directory,artifacts,canonicalArtifacts,metadata};
  }catch(error){
    metadata.status='failed';metadata.failure=compilerFailure(error);await saveCompilerMetadata(manifest,metadata);throw error;
  }
}
