import {test,spyOn} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,access,symlink} from 'node:fs/promises';
import * as fileIO from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {archiveCompilerSources,readArchivedCompilerSources,compilerSourceIdentity,openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const graph=()=>({entry:'entry.mjs',modules:[{id:'entry.mjs',filename:'virtual/原😀\ud800.eli',
  source:'\ufeff'+'x'.repeat(16382)+'😀'+'中é'.repeat(20000)+'\ud800\0\udfff\n'}],
  runtime:{filename:'runtime.eli',source:'\ufeff'+'中😀'.repeat(12000)+'\n'},
  literalSources:[{id:'stdlib/bit.mjs',filename:'literal.eli',source:'\ufeffliteral\ud800\n'}],
  hostSources:[{id:'provider.mjs',filename:'provider.mjs',source:'export const marker="\udfff";\n'}],
  hostModules:[{id:'provider',referrer:'entry.mjs',specifier:'./provider.mjs',allowedExports:['marker'],namespace:false}],
  phased:false});

async function fixture(action){
  const directory=await mkdtemp(join(tmpdir(),'eliscript-source-archive-stream-'));
  try{await action(directory);}finally{await rm(directory,{recursive:true,force:true});}
}

test('source archives stream exact UTF16 tool bytes and metadata across bounded odd short reads and partial writes',async()=>{
  await fixture(async directory=>{
    const sources=graph(),before=structuredClone(sources);
    // Virtual filenames belong to metadata, not filesystem paths. Force an
    // escaped JSON token across many decoder blocks without a large compiler.
    sources.modules[0].filename='virtual/'+('原😀\ud800'.repeat(6000))+'.eli';
    before.modules[0].filename=sources.modules[0].filename;
    const originalOpen=fileIO.open,originalReadFile=fileIO.readFile,reads=[],writes=[];
    let opened=0,closed=0;
    const openSpy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);opened++;
      return{
        async read(buffer,offset,length,position){
          assert(buffer.byteLength<=65536);assert(length<=65536);reads.push(length);
          return file.read(buffer,offset,Math.min(length,257),position);
        },
        async write(buffer,offset,length,position){
          assert(buffer.byteLength<=65536);assert(length<=65536);writes.push(length);
          return file.write(buffer,offset,Math.min(length,997),position);
        },
        async close(){closed++;return file.close();},
      };
    });
    const readSpy=spyOn(fileIO,'readFile').mockImplementation(async(path,...args)=>{
      if(resolve(path).startsWith(resolve(directory)+'/'))throw new Error('source archive must not read an entire file');
      return Reflect.apply(originalReadFile,fileIO,[path,...args]);
    });
    let identity,restored;
    try{
      identity=await archiveCompilerSources(sources,directory);
      restored=await readArchivedCompilerSources(directory,{expectedIdentity:identity});
    }finally{readSpy.mockRestore();openSpy.mockRestore();}
    assert.deepEqual(identity,compilerSourceIdentity(before));assert.deepEqual(restored,before);
    assert.deepEqual(sources,before,'archive and read must not consume the caller graph');
    assert(reads.length>20);assert(writes.length>20);assert.equal(opened,closed);
    const manifest=JSON.parse(await readFile(join(directory,'source-archive.json'),'utf8'));
    for(const record of manifest.records){
      const source=record.kind==='runtime'?before.runtime.source:before[record.kind==='module'?'modules':record.kind==='host'?'hostSources':'literalSources']
        .find(item=>item.id===record.id).source;
      const raw=await readFile(join(directory,record.path)),tool=await readFile(join(directory,record.tool.path));
      assert.deepEqual(raw,Buffer.from(source,'utf16le'));assert.deepEqual(tool,Buffer.from(source,'utf8'));
      assert.equal(record.bytes,raw.length);assert.equal(record.sha256,sha(raw));
      assert.equal(record.tool.bytes,tool.length);assert.equal(record.tool.sha256,sha(tool));
      assert.equal(record.tool.lossless,tool.toString('utf8')===source);
    }
  });
},30000);

test('source archives synchronously snapshot only validated declaration fields and preserve first getter failures before IO',async()=>{
  await fixture(async directory=>{
    const sources=graph(),expected=structuredClone(sources),reads=[];
    for(const[kind,record]of[['runtime',sources.runtime],['module',sources.modules[0]],['host',sources.hostSources[0]],['literal',sources.literalSources[0]]]){
      let text=record.source;
      Object.defineProperty(record,'source',{enumerable:true,configurable:true,get(){reads.push(kind);return text;},set(value){text=value;}});
      Object.defineProperty(record,'unrelated',{enumerable:true,get(){throw new Error('unused record field');}});
    }
    sources.unrelated=()=>0;sources.cycle=sources;
    Object.defineProperty(sources,'unused',{enumerable:true,get(){throw new Error('unused root field');}});
    const pending=archiveCompilerSources(sources,directory);
    assert.deepEqual(reads,['runtime','module','host','literal']);
    sources.modules[0].source='next module';sources.runtime.source='next runtime';
    sources.hostSources.splice(0);sources.literalSources[0].source='next literal';
    sources.hostModules[0].allowedExports.push('next');sources.phased=true;
    const identity=await pending;
    assert.deepEqual(identity,compilerSourceIdentity(expected));
    assert.deepEqual(await readArchivedCompilerSources(directory),expected);
    assert.deepEqual(reads,['runtime','module','host','literal'],'no source getter is reread after dispatch');
    const failure={getter:'original runtime value'},invalid=graph(),missing=join(directory,'not-created');
    Object.defineProperty(invalid.runtime,'source',{get(){throw failure;}});
    invalid.modules[0].id='../invalid.mjs';
    await assert.rejects(archiveCompilerSources(invalid,missing),error=>error===failure);
    await assert.rejects(access(missing),error=>error.code==='ENOENT');
    const badId=graph();badId.modules[0].id='../invalid.mjs';
    Object.defineProperty(badId.modules[0],'source',{get(){throw failure;}});
    await assert.rejects(archiveCompilerSources(badId,missing),error=>error instanceof TypeError&&/relative source identity/.test(error.message));
    await assert.rejects(access(missing),error=>error.code==='ENOENT');
  });
},30000);

test('streamed source metadata retains IO then UTF8 then JSON failure priority and closes failed reads',async()=>{
  await fixture(async directory=>{
    const path=join(directory,'source-archive.json');
    await writeFile(path,Buffer.concat([Buffer.from('{broken'+' '.repeat(70000)),Buffer.from([0xff])]));
    await assert.rejects(readArchivedCompilerSources(directory),error=>error instanceof TypeError&&!(error instanceof SyntaxError));
    const originalOpen=fileIO.open,first={io:'read after invalid JSON'},secondary={close:'secondary'};
    let reads=0,closes=0;
    const openSpy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);
      return{
        async read(...readArgs){if(++reads===2)throw first;return file.read(...readArgs);},
        async close(){closes++;await file.close();throw secondary;},
      };
    });
    try{await assert.rejects(readArchivedCompilerSources(directory),error=>error===first);}
    finally{openSpy.mockRestore();}
    assert.equal(closes,1);
    await writeFile(path,'{broken');
    const closeSpy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);
      return{read:(...readArgs)=>file.read(...readArgs),async close(){await file.close();throw secondary;}};
    });
    try{await assert.rejects(readArchivedCompilerSources(directory),error=>error===secondary);}
    finally{closeSpy.mockRestore();}
    await assert.rejects(readArchivedCompilerSources(directory),SyntaxError);
  });
},30000);

async function rewriteArchive(directory,mutate){
  const manifest=JSON.parse(await readFile(join(directory,'source-archive.json'),'utf8'));
  const identity=JSON.parse(await readFile(join(directory,'identity.json'),'utf8'));
  await mutate(manifest,identity);
  await writeFile(join(directory,'source-archive.json'),JSON.stringify(manifest));
  await writeFile(join(directory,'identity.json'),JSON.stringify(identity));
}

test('source archive streaming keeps hash odd-unit projection and path rejection order with valid recovery',async()=>{
  await fixture(async directory=>{
    const sources=graph(),identity=await archiveCompilerSources(sources,directory);
    const manifest=JSON.parse(await readFile(join(directory,'source-archive.json'),'utf8'));
    const first=manifest.records[0],raw=await readFile(join(directory,first.path)),tool=await readFile(join(directory,first.tool.path));
    const odd=raw.subarray(0,raw.length-1);await writeFile(join(directory,first.path),odd);
    await assert.rejects(readArchivedCompilerSources(directory),/UTF-16 source bytes differ from their identity/);
    await rewriteArchive(directory,(manifest,identity)=>{
      Object.assign(manifest.records[0],{bytes:odd.length,sha256:sha(odd)});
      Object.assign(identity.modules[0],{bytes:odd.length,sha256:sha(odd)});
    });
    await assert.rejects(readArchivedCompilerSources(directory),/incomplete UTF-16 code unit/);
    await writeFile(join(directory,first.path),raw);
    await rewriteArchive(directory,(manifest,bound)=>{
      Object.assign(manifest.records[0],{bytes:raw.length,sha256:sha(raw)});
      Object.assign(bound.modules[0],identity.modules[0]);
    });
    const altered=Buffer.from(tool);altered[altered.length-1]^=1;await writeFile(join(directory,first.tool.path),altered);
    await assert.rejects(readArchivedCompilerSources(directory),/tool projection bytes differ from their identity/);
    await rewriteArchive(directory,manifest=>{Object.assign(manifest.records[0].tool,{bytes:altered.length,sha256:sha(altered)});});
    await assert.rejects(readArchivedCompilerSources(directory),/tool projection differs from the exact source/);
    await writeFile(join(directory,first.tool.path),tool);
    await rewriteArchive(directory,manifest=>{manifest.records[0].tool=first.tool;});
    assert.deepEqual(await readArchivedCompilerSources(directory,{expectedIdentity:identity}),sources);
    const moved=join(directory,'real-codeunits');await fileIO.rename(join(directory,'source-codeunits'),moved);
    await symlink(moved,join(directory,'source-codeunits'),'dir');
    await assert.rejects(readArchivedCompilerSources(directory),/unsupported file entry/);
    await rm(join(directory,'source-codeunits'));await fileIO.rename(moved,join(directory,'source-codeunits'));
    assert.deepEqual(await readArchivedCompilerSources(directory),sources);
    await rewriteArchive(directory,manifest=>{manifest.records[0].path='../outside';});
    await assert.rejects(readArchivedCompilerSources(directory),/relative source identity/);
  });
},30000);

test('source archive partial write failures keep their original value and close the owned descriptor',async()=>{
  await fixture(async directory=>{
    const originalOpen=fileIO.open,first={write:'original'},secondary={close:'secondary'};let writes=0,closes=0;
    const spy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);
      return{
        async write(buffer,offset,length,position){
          if(++writes===2)throw first;return file.write(buffer,offset,Math.min(length,13),position);
        },
        async close(){closes++;await file.close();throw secondary;},
      };
    });
    try{await assert.rejects(archiveCompilerSources(graph(),directory),error=>error===first);}
    finally{spy.mockRestore();}
    assert.equal(closes,1);
  });
},30000);

async function sourceAssetFixture(directory){
  // Only resource transport is synthetic; the actual artifact/session/source
  // loader executes. This is not a substitute for compiler acceptance.
  const javascript=`export function compiler_session_new(){return {};}
export function compiler_session_close(state){state.closed=true;}
export function compiler_session_request(state,text){return JSON.stringify(JSON.parse(text));}\n`;
  const runtime=graph().modules[0].source,literal=graph().runtime.source;
  const files=[['compiler.mjs',Buffer.from(javascript)],['runtime.eli.json',Buffer.from(JSON.stringify(runtime))],
    ['literal.eli',Buffer.from(literal)]];
  for(const[path,bytes]of files)await writeFile(join(directory,path),bytes);
  const artifact={host:'javascript',entry:'compiler.mjs',directory,path:'compiler.mjs',
    modules:[{id:'compiler.mjs',path:'compiler.mjs'}],runtimePath:'runtime.eli.json',runtimeEncoding:'json-utf16',
    literalSources:[{id:'stdlib/bit.mjs',filename:'stdlib/bit.eli',path:'literal.eli'}],
    sourceIdentity:{algorithm:'sha256',encoding:'utf16le',modules:[{id:'compiler.mjs'}],
      runtime:{filename:'runtime.eli',sha256:sha(Buffer.from(runtime,'utf16le'))},
      literalSources:[{id:'stdlib/bit.mjs',filename:'stdlib/bit.eli',sha256:sha(Buffer.from(literal,'utf16le'))}]},
    artifactIdentity:{algorithm:'sha256',files:files.map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)}))}};
  return{artifact,runtime,literal};
}

test('artifact source assets stream exact JSON UTF16 and UTF8 with captured public declarations and bounded module verification',async()=>{
  await fixture(async directory=>{
    const{artifact,runtime,literal}=await sourceAssetFixture(directory);
    const originalOpen=fileIO.open,originalReadFile=fileIO.readFile,observed=[];let opens=0,closes=0;
    const spy=spyOn(fileIO,'readFile').mockImplementation(async(path,...args)=>{
      if(['compiler.mjs','runtime.eli.json','literal.eli'].some(name=>resolve(path)===join(directory,name)))
        throw new Error('artifact verification/source loading must use bounded reads');
      return Reflect.apply(originalReadFile,fileIO,[path,...args]);
    });
    const openSpy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);opens++;
      return{async read(buffer,offset,length,position){
        observed.push(resolve(args[0]));assert(buffer.byteLength<=65536);assert(length<=65536);
        return file.read(buffer,offset,Math.min(length,257),position);
      },async close(){closes++;return file.close();}};
    });
    let session;
    try{
      session=await openCompilerArtifact(artifact);
      artifact.runtimePath='missing';artifact.runtimeEncoding='unsupported';
      artifact.literalSources[0].path='missing';artifact.sourceIdentity.runtime.sha256='0'.repeat(64);
      artifact.sourceIdentity.literalSources.length=0;
      const actual=await session.request({operation:'runtime'});
      assert.equal(actual.source,runtime);assert.equal(actual.filename,'runtime.eli');
      assert.deepEqual(actual.literalSources,[{id:'stdlib/bit.mjs',filename:'stdlib/bit.eli',source:literal}]);
      assert.equal((await session.request({operation:'runtime'})).source,runtime);
    }finally{try{await session?.close();}finally{openSpy.mockRestore();spy.mockRestore();}}
    assert.equal(opens,closes);
    for(const name of ['compiler.mjs','runtime.eli.json','literal.eli'])assert(observed.includes(join(directory,name)));
  });
},30000);

test('streamed artifact source failures keep identity cancellation encoding UTF8 JSON order and allow retry',async()=>{
  await fixture(async directory=>{
    const{artifact,runtime}=await sourceAssetFixture(directory),path=join(directory,'runtime.eli.json');
    const bytes=Buffer.from('{broken'+' '.repeat(70000));
    await writeFile(path,Buffer.concat([bytes,Buffer.from([0xff])]));
    let session=await openCompilerArtifact(artifact);
    try{await assert.rejects(session.request({operation:'runtime'}),/SHA-256 or byte length identity changed/);}
    finally{await session.close();}
    const bound=artifact.artifactIdentity.files.find(record=>record.path==='runtime.eli.json');
    Object.assign(bound,{bytes:bytes.length+1,sha256:sha(Buffer.concat([bytes,Buffer.from([0xff])]))});
    session=await openCompilerArtifact(artifact);
    try{
      await assert.rejects(session.request({operation:'runtime'}),error=>error instanceof TypeError&&!(error instanceof SyntaxError));
      const corrected=Buffer.from(JSON.stringify(runtime));await writeFile(path,corrected);
      // Identity is captured at open. Fixing bytes alone cannot relabel it.
      await assert.rejects(session.request({operation:'runtime'}),/SHA-256 or byte length identity changed/);
      Object.assign(bound,{bytes:corrected.length,sha256:sha(corrected)});
    }finally{await session.close();}
    session=await openCompilerArtifact(artifact);
    try{assert.equal((await session.request({operation:'runtime'})).source,runtime);}
    finally{await session.close();}
    artifact.runtimeEncoding='unsupported';
    const controller=new AbortController(),reason={cancelled:'during bounded source reads'},originalOpen=fileIO.open;
    session=await openCompilerArtifact(artifact);
    const spy=spyOn(fileIO,'open').mockImplementation(async(...args)=>{
      const file=await Reflect.apply(originalOpen,fileIO,args);
      if(resolve(args[0])!==path)return file;
      return{async read(...readArgs){const result=await file.read(...readArgs);controller.abort(reason);return result;},close:()=>file.close()};
    });
    try{await assert.rejects(session.request({operation:'runtime'},{signal:controller.signal}),error=>error===reason);}
    finally{spy.mockRestore();await session.close();}
    session=await openCompilerArtifact(artifact);
    try{await assert.rejects(session.request({operation:'runtime'}),/unsupported compiler source asset encoding/);}
    finally{await session.close();}
    artifact.runtimeEncoding='json-utf16';await writeFile(path,bytes);
    Object.assign(bound,{bytes:bytes.length,sha256:sha(bytes)});
    session=await openCompilerArtifact(artifact);
    try{await assert.rejects(session.request({operation:'runtime'}),SyntaxError);}
    finally{await session.close();}
  });
},30000);
