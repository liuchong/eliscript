import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildIndependentCompiler,loadCompilerSources} from '../tools/backends/compiler-build.mjs';
import {openCompilerArtifact} from '../tools/backends/compiler-bootstrap.mjs';
import {encodeCompilerIR} from '../tools/backends/compiler-session.mjs';
import {compilerSourceIdentity} from '../tools/backends/compiler-worker.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {openNativeMemory} from '../tools/backends/native-memory.mjs';
import {archiveProduct} from '../tools/backends/compiler-matrix.mjs';

let directory,sources,seed;
const artifacts=new Map();
const nativeSupported=process.arch==='arm64'&&['darwin','linux'].includes(process.platform);
const nativeTarget=process.platform==='linux'?'arm64-linux':'arm64-macos';
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-session-ir-'));
  sources=await loadCompilerSources();
  seed=await buildIndependentCompiler({host:'javascript',sources,profile:'full-runtime',
    outputRoot:resolve(directory,'javascript'),retainIR:false,debug:false});
  artifacts.set('javascript',Promise.resolve(seed));
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function artifact(host) {
  if(!artifacts.has(host))artifacts.set(host,(async()=>{
    const producer=await openCompilerArtifact(seed);
    try{return await buildIndependentCompiler({host,session:producer,sources,profile:'full-runtime',nativeTarget,
      outputRoot:resolve(directory,host),retainIR:false,debug:false});}
    finally{await producer.close();}
  })());
  return artifacts.get(host);
}
async function sessionFor(host,run) {
  const session=await openCompilerArtifact(await artifact(host));
  try {
    await session.request({operation:'runtime',source:sources.runtime.source,filename:sources.runtime.filename,
      literalSources:structuredClone(sources.literalSources)});
    await run(session);
  } finally{await session.close();}
}
async function execute(response,name,args=[]) {
  let runtime;
  if(response.target==='wasm') {
    const bytes=Uint8Array.from(response.bytes);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
    runtime=instantiateManagedRuntime(bytes);
  } else {
    assert.equal(response.target,'native');
    const path=resolve(directory,name+(process.platform==='linux'?'.so':'.dylib'));
    await writeFile(path,Uint8Array.from(response.bytes));
    runtime=await instantiateNativeManagedRuntime(path,{typed:response.typed,descriptor:response.descriptor});
  }
  try {
    runtime.auto(1);const result=runtime.invoke('run',args);
    try{return runtime.readNumber(result);}finally{runtime.release(result);}
  } finally {
    try{runtime.closeModule();runtime.collect();assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);}
    finally{runtime.close?.();}
  }
}

for(const host of ['javascript','wasm','native']) {
  const actual=test.skipIf(host==='native'&&!nativeSupported);
  actual('Given complete '+host+' compiler When validated single IR is emitted Then actual WASM and native output preserve IEEE values',async()=>{
    await sessionFor(host,async session=>{
      const source='(defun run () -0) (export run)',ir=(await session.request({operation:'compile-ir',source,filename:'ieee-ir.eli'})).ir;
      const javascript=await session.request({operation:'emit-ir',ir});
      const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript.javascript).toString('base64'));
      assert(Object.is(reference.run(),-0));
      for(const target of nativeSupported?['wasm','native']:['wasm']) {
        const product=await session.request({operation:'emit-ir',target,ir,nativeTarget,nativeFormat:'library'});
        assert.equal(product.target,target);assert.equal(product.descriptor.module,undefined);
        assert(Object.is(await execute(product,host+'-single-'+target),reference.run()));
      }
      const caps=await session.request({operation:'capabilities'});
      assert(caps.operations.includes('project-ir'));
    });
  },120000);

  actual('Given complete '+host+' compiler When original IR intrinsic operands are corrupted Then original lowering rejects them and later IR still emits',async()=>{
    await sessionFor(host,async session=>{
      const source='(defun token (x) (host-identity-token x)) (export token)';
      const original=(await session.request({operation:'compile-ir',source,filename:'arity.eli'})).ir;
      const runtimeRequest={operation:'runtime',source:sources.runtime.source,filename:sources.runtime.filename,
        literalSources:structuredClone(sources.literalSources)};
      const beforeRuntime=await session.request(runtimeRequest);
      for(const count of [0,2]) {
        const program=JSON.parse(original),node=program.body[0].children.at(-1),operand=node.children[0];
        node.children=count===0?[]:[operand,structuredClone(operand)];
        for(const target of nativeSupported?['wasm','native']:['wasm']) {
          await assert.rejects(async()=>session.request({operation:'emit-ir',target,ir:encodeCompilerIR(program),nativeTarget,literalSources:[]}),
            error=>{
              const diagnostic=error.eliscriptDiagnostic;
              assert.equal(error.name,'Error');assert.equal(diagnostic?.code,'ELI-B0001');
              assert.equal(diagnostic.phase,'managed-backend');
              assert.equal(diagnostic.message,error.message);
              assert.equal(diagnostic.location.file,node.span.filename);
              assert.deepEqual(diagnostic.location.start,{offset:node.span.start,line:node.span.line,column:node.span.column});
              assert.deepEqual(diagnostic.location.end,{offset:node.span.end,line:node.span.endLine,column:node.span.endColumn});
              assert.match(error.message,new RegExp('host-identity-token expects 1 argument, got '+count));
              return true;
            });
        }
      }
      const pairSource=';; 中😀 retain original span and first rejection\n(defun pair (x y)\n (host-identity-token x)\n (host-identity-token y)) (export pair)';
      const pair=JSON.parse((await session.request({operation:'compile-ir',source:pairSource,filename:'first-error-中.eli'})).ir);
      const tokens=pair.body[0].children.filter(node=>node.kind==='intrinsic'&&node.value==='host-identity-token');
      assert.equal(tokens.length,2);const operand=tokens[1].children[0];tokens[0].children=[];tokens[1].children=[operand,structuredClone(operand)];
      await assert.rejects(async()=>session.request({operation:'emit-ir',target:'wasm',ir:encodeCompilerIR(pair)}),error=>{
        assert.equal(error.eliscriptDiagnostic?.code,'ELI-B0001');
        assert.match(error.message,/host-identity-token expects 1 argument, got 0/);
        assert.deepEqual(error.eliscriptDiagnostic.location.start,{offset:tokens[0].span.start,line:tokens[0].span.line,column:tokens[0].span.column});
        assert.equal(error.eliscriptDiagnostic.location.file,'first-error-中.eli');return true;
      });
      await assert.rejects(async()=>session.request({operation:'emit-ir',target:'wasm',ir:encodeCompilerIR(pair),literalSources:{}}),
        error=>error.eliscriptDiagnostic?.code==='ELI-H0001'&&error.message.includes('literalSources must be an array'));
      assert.equal((await session.request({operation:'compile-ir',source,filename:'arity.eli'})).ir,original);
      assert.deepEqual(await session.request(runtimeRequest),beforeRuntime,'failed raw IR must roll back the exact prior private-library revision');
      const product=await session.request({operation:'emit-ir',target:'wasm',ir:original});
      assert.equal(product.target,'wasm');assert.equal(typeof product.descriptor,'object');
      assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(Uint8Array.from(product.bytes))),[]);
    });
  },120000);

  actual('Given complete '+host+' compiler When a source graph and its exact IR graph are emitted Then all target bytes and JS maps agree',async()=>{
    await sessionFor(host,async session=>{
      const modules=[
        {id:'library.mjs',filename:'library.eli',source:'(defun value () -0) (export value)'},
        {id:'entry.mjs',filename:'entry.eli',source:'(import "./library.eli" value) (defun run () (value)) (export run)'},
      ];
      const inputs=[];
      for(const module of modules)inputs.push({...module,ir:(await session.request({operation:'compile-ir',source:module.source,filename:module.filename})).ir});
      for(const target of nativeSupported?['javascript','wasm','native']:['javascript','wasm']) {
        const request={entry:'entry.mjs',target,resolveImports:true,sourceMap:true,debug:true,nativeTarget,nativeFormat:'library'};
        const direct=await session.request({...request,operation:'project',modules});
        const fromIR=await session.request({...request,operation:'project-ir',modules:inputs});
        assert.equal(fromIR.target,target);assert.equal(fromIR.entry,direct.entry);
        if(target==='javascript')assert.deepEqual(fromIR.modules,direct.modules);
        else {
          assert.deepEqual(fromIR.bytes,direct.bytes);assert.deepEqual(fromIR.descriptor,direct.descriptor);
          if(target==='native')assert.deepEqual(fromIR.typed,direct.typed);
          assert.deepEqual(fromIR.debug,direct.debug);
          assert(Object.is(await execute(fromIR,host+'-graph-'+target),-0));
        }
        // Products, maps, debug source order and typed IR are independent of
        // transport order for both frontend paths, without sorting assertions.
        const reversedSource=await session.request({...request,operation:'project',modules:[...modules].reverse()});
        const reversedIR=await session.request({...request,operation:'project-ir',modules:[...inputs].reverse()});
        for(const actual of[reversedSource,reversedIR]){
          if(target==='javascript'){
            assert.deepEqual(actual.modules,direct.modules);
            assert.deepEqual(actual.modules.map(module=>module.id),['entry.mjs','library.mjs']);
          }else{
            assert.deepEqual(actual.bytes,direct.bytes);assert.deepEqual(actual.descriptor,direct.descriptor);
            assert.deepEqual(actual.debug,direct.debug);
            if(target==='native')assert.deepEqual(actual.typed,direct.typed);
          }
        }
      }
      const good={operation:'project-ir',entry:'entry.mjs',target:'javascript',modules:inputs,resolveImports:true};
      for(const patch of [{modules:[]},{modules:[inputs[0],inputs[0]]},{entry:'missing.mjs'},
        {modules:[{...inputs[0],filename:'substituted.eli'}]},
        {modules:[{...inputs[0],macroOrigins:false}]},
        {sourceMap:true,modules:inputs.map(({source,...module})=>module)},
        {modules:[{...inputs[0],ir:'{'}]},
        {modules:[{...inputs[0],ir:'{"body":[],"filename":"x","unknown":true}'}]}]) {
        await assert.rejects(async()=>session.request({...good,...patch}));
      }
      assert.equal((await session.request(good)).target,'javascript');
      const unicodeModules=[
        {id:'\ue000.mjs',filename:'\ue000.eli',source:';; 私有区\n(defun private-value () 1) (export private-value)'},
        {id:'𐀀.mjs',filename:'𐀀.eli',source:';; 😀 preserve source-map bytes\n(defun astral-value () -0) (export astral-value)'},
        {id:'entry.mjs',filename:'entry.eli',source:'(import "./\ue000.eli" private-value) (import "./𐀀.eli" astral-value) (defun run () (if (= (private-value) 1) (astral-value) 1)) (export run)'},
      ],unicodeIR=[];
      for(const module of unicodeModules)unicodeIR.push({...module,ir:(await session.request({operation:'compile-ir',source:module.source,filename:module.filename})).ir});
      const unicodeRequest={entry:'entry.mjs',target:'javascript',resolveImports:true,sourceMap:true,debug:true};
      const unicodeSource=await session.request({...unicodeRequest,operation:'project',modules:unicodeModules});
      const unicodeRaw=await session.request({...unicodeRequest,operation:'project-ir',modules:[...unicodeIR].reverse()});
      assert.deepEqual(unicodeRaw.modules,unicodeSource.modules);
      assert.deepEqual(unicodeRaw.modules.map(module=>module.id),['entry.mjs','𐀀.mjs','\ue000.mjs']);

    });
  },120000);

  actual('Given complete '+host+' compiler When original memory IR or typed memory IR is emitted Then the real raw ABI and refusal paths are preserved',async()=>{
    await sessionFor(host,async session=>{
      const source='(import "eliscript:memory32" load-u32 store-u32 memory-size memory-grow) '+
        '(defun read32 (p) (load-u32 p)) (defun set32 (p v) (store-u32 p v) (load-u32 p)) '+
        '(defun grow (n) (memory-grow n)) (defun size () (memory-size)) (export read32 set32 grow size)';
      const ir=(await session.request({operation:'compile-ir',source,filename:'raw-memory.eli'})).ir;
      const memory={initialPages:1,maximumPages:2};
      const wasm=await session.request({operation:'emit-memory-ir',ir,target:'wasm',memory});
      assert.equal(wasm.abi,'memory-u32');assert.equal(wasm.descriptor,undefined);
      const typedWire=encodeCompilerIR(wasm.typed);
      const same=await session.request({operation:'emit-typed-memory',ir:typedWire,target:'wasm',memory});
      assert.deepEqual(same.bytes,wasm.bytes);assert.equal(encodeCompilerIR(same.typed),typedWire);
      const debugProduct=await session.request({operation:'emit-typed-memory',ir:typedWire,target:'wasm',memory,debug:true});
      assert.equal(encodeCompilerIR(debugProduct.typed),typedWire,'debug scratch locals must not mutate the public typed payload');
      const binary=Uint8Array.from(wasm.bytes),module=new WebAssembly.Module(binary);
      assert.deepEqual(WebAssembly.Module.imports(module),[]);
      const e=new WebAssembly.Instance(module).exports;
      assert.equal(e.set32(8,0xffffffff)>>>0,0xffffffff);assert.equal(e.read32(8)>>>0,0xffffffff);
      assert.throws(()=>e.read32(65533),WebAssembly.RuntimeError);
      assert.equal(e.grow(1),1);assert.equal(e.size(),2);
      assert.equal(e.grow(1)>>>0,0xffffffff);assert.equal(e.set32(65536,42),42);
      const saved=await archiveProduct(wasm,'wasm',resolve(directory,host+'-raw-archive'));
      assert.equal(saved.abi,'memory-u32');assert.equal(saved.descriptor,undefined);
      assert.deepEqual(JSON.parse(await readFile(resolve(saved.directory,'typed.json'),'utf8')),wasm.typed);
      for(const patch of [{abi:'invalid-memory-abi'},{functions:null}]) {
        await assert.rejects(async()=>session.request({operation:'emit-typed-memory',ir:encodeCompilerIR({...wasm.typed,...patch}),target:'wasm',memory}));
      }
      await assert.rejects(async()=>session.request({operation:'emit-memory-ir',ir,target:'javascript',memory}));
      if(nativeSupported) {
        const native=await session.request({operation:'emit-typed-memory',ir:encodeCompilerIR(wasm.typed),target:'native',nativeTarget,nativeFormat:'library',memory});
        assert.equal(encodeCompilerIR(native.typed),typedWire,'target-specific emission must retain the public typed input');
        assert.equal(encodeCompilerIR(wasm.typed),typedWire);
        const nativeArtifact=await archiveProduct(native,'native',resolve(directory,host+'-raw-native'));
        const runtime=await openNativeMemory(nativeArtifact.path,{read32:1,set32:2,grow:1,size:0},{...memory,nativeTarget});
        try {
          assert.equal(runtime.invoke('set32',8,0xffffffff)>>>0,0xffffffff);
          assert.equal(runtime.invoke('read32',8)>>>0,0xffffffff);
          assert.throws(()=>runtime.invoke('read32',65533));
          assert.equal(runtime.invoke('grow',1),1);assert.equal(runtime.invoke('size'),2);
          assert.equal(runtime.invoke('grow',1)>>>0,0xffffffff);
          assert.equal(runtime.invoke('set32',65536,42),42);
        } finally{runtime.close();}
      }
      const capabilities=await session.request({operation:'capabilities'});
      assert.deepEqual(capabilities.memoryIRTargets,['wasm','native']);
    });
  },120000);
}

test('Given two IR edits When Worker identities are calculated Then exact IR source units participate independently of the output target',async()=>{
  const module={id:'entry.mjs',filename:'entry.eli',ir:'{"value":-0,"text":"\\ud800"}'};
  const request={operation:'project-ir',entry:'entry.mjs',modules:[module],target:'javascript'};
  const original=await compilerSourceIdentity(request);
  assert.equal(await compilerSourceIdentity({...request,target:'wasm'}),original);
  assert.notEqual(await compilerSourceIdentity({...request,modules:[{...module,ir:'{"value":0,"text":"\\ud800"}'}]}),original);
  assert.notEqual(await compilerSourceIdentity({...request,modules:[{...module,ir:'{"value":-0,"text":"\\udc00"}'}]}),original);
  const single={operation:'emit-ir',filename:'entry.eli',ir:module.ir};
  assert.notEqual(await compilerSourceIdentity(single),await compilerSourceIdentity({...single,ir:module.ir.replace('-0','0')}));
  for(const input of [request,single]) {
    const empty={...input,literalSources:[]};
    const first={...input,literalSources:[{id:'runtime/value.mjs',filename:'stdlib/value.eli',source:'; original \ud800'}]};
    const edited={...first,literalSources:[{...first.literalSources[0],source:'; edited \udc00'}]};
    assert.notEqual(await compilerSourceIdentity(input),await compilerSourceIdentity(empty));
    assert.notEqual(await compilerSourceIdentity(empty),await compilerSourceIdentity(first));
    assert.notEqual(await compilerSourceIdentity(first),await compilerSourceIdentity(edited));
    assert.equal(await compilerSourceIdentity(first),await compilerSourceIdentity({...first,target:'native',debug:true,memory:{initialPages:2}}));
  }
  const origins={...request,modules:[{...module,macroOrigins:[{name:'original',span:{start:0,end:1}}]}]};
  assert.notEqual(await compilerSourceIdentity(origins),original);
  assert.notEqual(await compilerSourceIdentity(origins),await compilerSourceIdentity({...origins,
    modules:[{...origins.modules[0],macroOrigins:[{name:'edited',span:{start:0,end:1}}]}]}));
});
