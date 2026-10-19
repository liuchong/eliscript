import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildBackends} from '../tools/backends/build.mjs';
import {buildIndependentCompiler,compilerMetadataDigest,decodeCompilerBinary} from '../tools/backends/compiler-build.mjs';
import {readCompilerMetadata} from '../tools/backends/compiler-metadata.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

let directory,backend,runtimeSource;
const target=process.platform==='linux'?'arm64-linux':'arm64-macos';
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-seed-native-fresh-'));
  backend=await buildBackends({outputRoot:resolve(directory,'frontend')});
  runtimeSource=await readFile('bootstrap/runtime/memory.eli','utf8');
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('seed builds emit their actual freshly lowered shared native graph with complete public bytes debug and source identities',async()=>{
  // A real small source project, supported by the complete current runtime.
  // This exercises the build entry; it is not a complete compiler producer.
  const source='(defvar base 1) (defun answer (value) (if value (+ value base) -0.0)) (export answer)';
  const filename='virtual/中文😀\ud800.eli';
  const sources={entry:'entry.mjs',modules:[{id:'entry.mjs',filename,source}],literalSources:[],
    runtime:{filename:'bootstrap/runtime/memory.eli',source:runtimeSource}};
  const inputIdentity=compilerMetadataDigest(sources);
  for(const debug of[false,true]){
    const phases=[],observerFailure={secondary:true};
    const built=await buildIndependentCompiler({host:'native',nativeTarget:target,sources,
      debug,outputRoot:resolve(directory,'product-'+debug),onPhase(name,counts){
        phases.push({name,counts});throw observerFailure;
      }});
    assert.equal(built.provenance.mode,'seed');assert.equal(built.debugEnabled,debug);
    assert.equal(compilerMetadataDigest(sources),inputIdentity,'caller source records stay unchanged');
    assert.deepEqual(built.sourceIdentity.modules,[{id:'entry.mjs',filename,
      sha256:createHash('sha256').update(source,'utf16le').digest('hex')}]);
    assert.equal(built.sourceIdentity.runtime.sha256,createHash('sha256').update(runtimeSource,'utf16le').digest('hex'));
    assert.strictEqual(built.lowered.typed,built.typed);assert.strictEqual(built.lowered.descriptor,built.descriptor);
    let shared=0;
    for(const fn of built.typed.functions.filter(fn=>fn.name.startsWith('__eliscript_managed_'))){
      const seen=new Set(),pending=[fn.body];
      while(pending.length){const node=pending.pop();if(seen.has(node)){shared++;continue;}seen.add(node);
        pending.push(...node.children);}
    }
    assert(shared>0,'the real managed lowering provides shared typed nodes to the seed emitter');
    const digest=compilerMetadataDigest(built.typed);
    const reference=debug
      ?backend.native.emit_typed_native_memory_artifact(built.typed,target,{format:'library',binaryEncoding:'u16le-chunks'})
      :{bytes:backend.native.emit_typed_native_memory_library(built.typed,target,{binaryEncoding:'u16le-chunks'})};
    assert.deepEqual(built.bytes,decodeCompilerBinary(reference.bytes),'fresh and public emitters produce the same complete target image');
    assert.equal(compilerMetadataDigest(built.typed),digest,'neither emitter consumes the deliverable typed graph');
    assert.deepEqual(new Uint8Array(await readFile(built.path)),built.bytes);
    const saved=await readCompilerMetadata(built.metadataPath);
    assert.equal(compilerMetadataDigest(saved.typed),digest);assert.deepEqual(saved.descriptor,built.descriptor);
    assert.deepEqual(saved.sourceIdentity,built.sourceIdentity);
    if(debug){
      const {sources:debugSources,...mapping}=await readCompilerMetadata(built.debugPath);
      assert.deepEqual(mapping,reference.debug,'all functions, ranges, traps and code offsets remain identical');
      assert.deepEqual(debugSources.map(record=>[record.id,record.filename]),
        [['entry.mjs',filename],['runtime','bootstrap/runtime/memory.eli']]);
      assert(debugSources.every(record=>Array.isArray(record.macroOrigins)));
    }else assert.equal(built.debugPath,undefined);
    const names=phases.map(record=>record.name);
    const native=names.filter(name=>name.startsWith('native-'));
    assert.deepEqual(native.filter(name=>name!=='native-code-progress'),[
      'native-prepare-start','native-prepare-complete','native-code-start','native-code-complete',
      'native-container-start','native-container-complete']);
    assert(native.includes('native-code-progress'));
    assert(names.indexOf('seed-managed-lower-complete')<names.indexOf('native-prepare-start'));
    assert(names.indexOf('native-container-complete')<names.indexOf('binary-decode-start'));
    for(const{name,counts}of phases.filter(record=>record.name.startsWith('native-'))){
      assert(Object.isFrozen(counts),name);assert.equal(counts.host,'native');
      assert.deepEqual(Object.keys(counts),['host','count','words','branches','calls']);
      for(const key of['count','words','branches','calls'])assert(Number.isSafeInteger(counts[key])&&counts[key]>=0);
    }
    if(process.arch==='arm64'&&['darwin','linux'].includes(process.platform)){
      const Module=WebAssembly.Module,Instance=WebAssembly.Instance;let a;
      try{
        WebAssembly.Module=function(){throw Error('native seed execution must not substitute WASM');};
        WebAssembly.Instance=function(){throw Error('native seed execution must not substitute WASM');};
        a=await instantiateNativeManagedRuntime(built.path,built.lowered,{...built.budget,
          initialPages:built.memory.initialPages,maximumPages:built.memory.maximumPages,nativeTarget:target});
      }finally{WebAssembly.Module=Module;WebAssembly.Instance=Instance;}
      const input=a.number(41),caller=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,caller);a.auto(1);
      try{
        const result=a.invoke('answer',[input]);try{assert.equal(a.readNumber(result),42);}finally{a.release(result);}
        const negative=a.invoke('answer',[false]);try{assert(Object.is(a.readNumber(negative),-0));}finally{a.release(negative);}
        a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(caller),-0));
      }finally{a.leaveFrame(frame);a.release(input);a.release(caller);a.closeModule();a.collect();
        assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);a.close();}
    }
  }
},120000);

test('public native typed emitters still observe repeated getters and preserve the first caller failure after seed fresh routing',()=>{
  for(const suffix of['object','library','artifact']){
    let reads=0;const first={original:suffix};
    const leaf={type:'u32',value:0,children:[],get kind(){if(++reads===2)throw first;return'literal';}};
    const typed={abi:'memory-u32',filename:'caller-owned.eli',exports:['f'],functions:[{name:'f',index:0,arity:0,locals:[],
      body:{kind:'sequence',type:'u32',value:null,children:[leaf,leaf]}}]};
    assert.throws(()=>backend.native['emit_typed_native_memory_'+suffix](typed,target,{fresh:true,binaryEncoding:'u16le-chunks'}),error=>error===first);
    assert.equal(reads,2,'a public options field cannot acquire the seed-owned validation path');
    assert.strictEqual(typed.functions[0].body.children[0],leaf);assert.strictEqual(typed.functions[0].body.children[1],leaf);
  }
});
