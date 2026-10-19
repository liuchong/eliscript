import {createHash} from 'node:crypto';
import {mkdir,lstat,open} from 'node:fs/promises';
import {writeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {encodeCompilerIR,forEachCompilerIRChunk,compilerSourceAssetEncoding} from './compiler-session.mjs';
import {createCompilerMetadataDecoder} from './compiler-metadata.mjs';
import {cloneCompilerCorpusData} from './compiler-corpus.mjs';

function utf16Identity(source) {
  const hash=createHash('sha256');
  // UTF16 hashes code units, so splitting a surrogate pair is lossless here.
  for(let at=0;at<source.length;at+=32768)hash.update(source.slice(at,at+32768),'utf16le');
  return {encoding:'utf16le',bytes:source.length*2,sha256:hash.digest('hex')};
}

function jsonChunks(value,consume) {forEachCompilerIRChunk(value,consume);consume('\n');}
function sourceChunks(source,encoding,consume) {
  if(encoding==='json-utf16'){forEachCompilerIRChunk(source,consume);return;}
  for(let start=0;start<source.length;) {
    let end=Math.min(start+32768,source.length);
    if(end<source.length&&source.charCodeAt(end-1)>=0xd800&&source.charCodeAt(end-1)<=0xdbff&&
      source.charCodeAt(end)>=0xdc00&&source.charCodeAt(end)<=0xdfff)end--;
    consume(source.slice(start,end));start=end;
  }
}
function chunkIdentity(visit) {
  const hash=createHash('sha256');let bytes=0;
  visit(chunk=>{bytes+=Buffer.byteLength(chunk,'utf8');hash.update(chunk,'utf8');});
  return {bytes,sha256:hash.digest('hex')};
}
function normalizeIR(value) {
  const decoder=createCompilerMetadataDecoder();
  forEachCompilerIRChunk(value,chunk=>decoder.write(chunk));return decoder.finish();
}
async function writeOwnedChunks(path,visit) {
  // The caller already owns a complete snapshot and checked it before I/O.
  // Never retain its full escaped text or buffers for other pending assets.
  const file=await open(path,'wx');let failed=false;
  try {
    visit(chunk=>{
      const bytes=Buffer.from(chunk,'utf8');let offset=0;
      while(offset<bytes.length) {
        const count=writeSync(file.fd,bytes,offset,bytes.length-offset);
        if(!Number.isInteger(count)||count<1||count>bytes.length-offset)
          throw new Error('original source archive write did not advance');
        offset+=count;
      }
    });
  } catch(error){failed=true;throw error;}
  finally{try{await file.close();}catch(error){if(!failed)throw error;}}
}

function localFile(directory,path) {
  if(typeof path!=='string'||!path||/[\\:\u0000]/.test(path)||
      path.split('/').some(part=>!part||part==='.'||part==='..')) {
    throw new TypeError('original source archive requires a relative asset path');
  }
  return resolve(directory,...path.split('/'));
}

async function readAsset(directory,path,encoding='json',identity,mismatch) {
  const file=localFile(directory,path);
  let parent=resolve(directory);
  const root=await lstat(parent);
  if(root.isSymbolicLink()||!root.isDirectory())throw new TypeError('original source archive directory must be a real directory');
  for(const part of path.split('/')) {
    parent=resolve(parent,part);
    const info=await lstat(parent);
    if(info.isSymbolicLink())throw new TypeError('original source archive traverses a filesystem alias');
    if(parent===file ? !info.isFile() : !info.isDirectory())throw new TypeError('original source archive asset has the wrong file type');
  }
  const input=await open(file,'r'),buffer=new Uint8Array(65536),hash=createHash('sha256');
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  let parser=encoding==='json'||encoding==='json-utf16'?createCompilerMetadataDecoder():undefined;
  let parts=encoding==='utf8'?[]:undefined,bytes=0,decodeError,decodeFailed=false,result,failed=false;
  if(!['json','json-utf16','utf8'].includes(encoding)) {
    decodeError=new TypeError('unsupported compiler source asset encoding');decodeFailed=true;
  }
  const accept=text=>{if(parser)parser.write(text);else parts.push(text);};
  try {
    for(;;) {
      const {bytesRead}=await input.read(buffer,0,buffer.length,null);
      if(!Number.isInteger(bytesRead)||bytesRead<0||bytesRead>buffer.length)
        throw new Error('original source archive read returned an invalid byte count');
      if(bytesRead===0)break;
      const chunk=buffer.subarray(0,bytesRead);bytes+=bytesRead;hash.update(chunk);
      if(!decodeFailed) {
        try{accept(decoder.decode(chunk,{stream:true}));}
        catch(error){decodeError=error;decodeFailed=true;parser=undefined;parts=undefined;}
      }
    }
    if(!decodeFailed) {
      try {
        accept(decoder.decode());result=parser?parser.finish():parts.join('');
        if(encoding==='json-utf16'&&typeof result!=='string')
          throw new TypeError('encoded compiler source asset must contain a JSON string');
      }catch(error){decodeError=error;decodeFailed=true;}
    }
    const sha256=hash.digest('hex');
    // The original boundary checks complete file identity BEFORE decoding.
    // Defer any streaming parse/UTF8 failure until that same check succeeds.
    if(identity&&(bytes!==identity.bytes||sha256!==identity.sha256))throw new Error(mismatch);
    if(decodeFailed)throw decodeError;
    return result;
  }catch(error){failed=true;throw error;}
  finally{try{await input.close();}catch(error){if(!failed)throw error;}}
}

function sourceRecord(value,label) {
  if(value===null||typeof value!=='object'||typeof value.source!=='string'||
      typeof value.filename!=='string')throw new TypeError(label+' requires its exact source and filename');
  return value;
}

// A case archive is replay input, not only a display copy. Keep the entire
// request/expected/execution recipe and its IEEE values, and store source text
// without UTF-8 replacement of lone UTF-16 surrogates. Ordinal disk paths avoid
// making virtual module identities depend on the host filesystem's encoding.
export async function archiveCompilerCorpusSources(record,directory) {
  const snapshot=cloneCompilerCorpusData(record);
  if(snapshot===null||typeof snapshot!=='object'||Array.isArray(snapshot)||typeof snapshot.id!=='string') {
    throw new TypeError('original source archive requires a corpus case');
  }
  if(snapshot.modules!==undefined&&!Array.isArray(snapshot.modules))throw new TypeError('original source modules must be an array');
  const modules=snapshot.modules??[],ids=new Set();
  for(const module of modules) {
    sourceRecord(module,'original source module');
    if(typeof module.id!=='string'||ids.has(module.id))throw new TypeError('original source module identities must be unique strings');
    ids.add(module.id);
  }
  if(snapshot.kind==='stage')sourceRecord(snapshot.request,'original stage request');
  // Finish the immutable in-memory snapshot before the first asynchronous I/O.
  const recordIdentity=chunkIdentity(consume=>jsonChunks(snapshot,consume)),assets=[];
  function prepare(source,name) {
    const encoding=compilerSourceAssetEncoding(source),path=name+(encoding==='utf8'?'.eli':'.eli.json');
    const asset={path,encoding,...chunkIdentity(consume=>sourceChunks(source,encoding,consume))};
    assets.push({asset,source});
    return {...utf16Identity(source),asset};
  }
  const archivedModules=modules.map((module,index)=>({id:module.id,filename:module.filename,
    ...prepare(module.source,'modules/'+String(index).padStart(6,'0'))}));
  const stage=snapshot.kind==='stage'?{filename:snapshot.request.filename,
    ...prepare(snapshot.request.source,'stage-input'),macroContext:snapshot.request.macroContext}:undefined;
  const identity={format:'eliscript-original-case-sources',version:1,id:snapshot.id,
    kind:snapshot.kind,entry:snapshot.entry,modules:archivedModules,stage,
    coverage:snapshot.coverage,original:snapshot.original,suite:snapshot.suite,steps:snapshot.steps,
    record:{path:'record.json',encoding:'json',...recordIdentity}};
  // Normalize optional fields exactly as they appear in the retained JSON.
  const body=normalizeIR(identity);
  const result={...body,sha256:chunkIdentity(consume=>jsonChunks(body,consume)).sha256};
  await mkdir(directory,{recursive:true});
  const root=await lstat(directory);
  if(root.isSymbolicLink()||!root.isDirectory())throw new TypeError('original source archive directory must be a real directory');
  for(const {asset,source} of assets) {
    const path=localFile(directory,asset.path);await mkdir(dirname(path),{recursive:true});
    const parent=await lstat(dirname(path));
    if(parent.isSymbolicLink()||!parent.isDirectory())throw new TypeError('original source archive traverses a filesystem alias');
    await writeOwnedChunks(path,consume=>sourceChunks(source,asset.encoding,consume));
  }
  await writeOwnedChunks(localFile(directory,'record.json'),consume=>jsonChunks(snapshot,consume));
  await writeOwnedChunks(localFile(directory,'source-identity.json'),consume=>jsonChunks(result,consume));
  return result;
}

export async function readArchivedCompilerCorpusSources(directory,{expectedIdentity}={}) {
  const identity=await readAsset(directory,'source-identity.json');
  const {sha256,...body}=identity;
  if(identity.format!=='eliscript-original-case-sources'||identity.version!==1||
      sha256!==chunkIdentity(consume=>jsonChunks(body,consume)).sha256||expectedIdentity!==undefined&&sha256!==expectedIdentity) {
    throw new Error('original source archive identity differs');
  }
  const recordAsset=identity.record;
  if(recordAsset?.path!=='record.json'||recordAsset.encoding!=='json')throw new TypeError('original source archive has no complete case recipe');
  const record=await readAsset(directory,recordAsset.path,'json',recordAsset,'original source case recipe bytes changed');
  if(record.id!==identity.id||record.kind!==identity.kind||record.entry!==identity.entry||
      !Array.isArray(identity.modules)||(record.modules??[]).length!==identity.modules.length) {
    throw new Error('original source archive case inventory differs');
  }
  const paths=new Set(['record.json','source-identity.json']);
  async function check(archived,source) {
    if(archived?.encoding!=='utf16le'||archived.filename!==source.filename||
        archived.bytes!==source.source.length*2||archived.sha256!==utf16Identity(source.source).sha256) {
      throw new Error('original source archive does not bind the exact UTF16 source');
    }
    const asset=archived.asset;
    if(!asset||paths.has(asset.path))throw new Error('original source archive repeats an asset');
    paths.add(asset.path);
    const text=await readAsset(directory,asset.path,asset.encoding===undefined?'utf8':asset.encoding,
      asset,'original source archive asset bytes changed');
    if(text!==source.source)throw new Error('original source archive text differs from its case recipe');
  }
  for(let index=0;index<identity.modules.length;index++) {
    const archived=identity.modules[index],module=sourceRecord(record.modules[index],'archived source module');
    if(archived.id!==module.id)throw new Error('original source module order or identity changed');
    await check(archived,module);
  }
  if(record.kind==='stage') {
    await check(identity.stage,sourceRecord(record.request,'archived stage request'));
    if(encodeCompilerIR({value:identity.stage.macroContext})!==encodeCompilerIR({value:record.request.macroContext}))throw new Error('original stage archive changed its macro context');
  }
  else if(identity.stage!==undefined)throw new Error('original source archive added a stage request');
  for(const field of ['coverage','original','suite','steps']) {
    if(encodeCompilerIR({value:identity[field]})!==encodeCompilerIR({value:record[field]}))throw new Error('original source archive recipe metadata differs');
  }
  return record;
}
