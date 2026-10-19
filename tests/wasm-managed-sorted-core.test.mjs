import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import * as OriginalSorted from '../runtime/core/sorted.mjs';
import * as OriginalLiterals from '../runtime/literals.mjs';
import * as OriginalMetadata from '../runtime/core/metadata.mjs';

const options = {maxSlots:8192,initialBytes:262144,maxBytes:16777216};
const memory = {initialPages:4,maximumPages:1024};
const entry = 'tests/sorted-entry.mjs';
const sourceUnits = [
  [entry,'tests/fixtures/wasm-managed-sorted.eli'],
  ['tests/fixtures/persistent-sorted.mjs','tests/fixtures/persistent-sorted.eli'],
  ['stdlib/core/sorted.eli','stdlib/core/sorted.eli'],
];
const cases = ['original-report','original-boundaries','rotations','ranges','semantics','order-cases',
  'full-order-contracts','comparator-failure','transport','lazy-iterators','sharing'];
let directory,backend,lowered,bytes,nativePath,expected,boundaryLowered,boundaryBytes,boundaryNativePath;

// The same bounded operation stream enters both actual implementations. The
// existing 20,000-operation and 100,000-node original suites remain unchanged.
function operations() {
  let state=0x5eed1234;
  const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  return Array.from({length:96},()=>{
    const key=next()%32,put=next()%10<7;
    return put?[0,key,next()]:[1,key,0];
  });
}
const randomOperations=operations();

beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-sorted-core-'));
  backend=await buildBackends({outputRoot:directory});
  const runtimeIR=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
  const {literalModules}=await backend.loadLiteralModules();
  const modules=[];
  for(const[id,filename]of sourceUnits)modules.push({id,program:backend.compiler.compile_ir_string(await readFile(filename,'utf8'),filename)});
  const before=JSON.stringify(modules),libraryBefore=JSON.stringify(literalModules);
  lowered=backend.managed.lower_managed_project(modules,entry,runtimeIR,{...memory,literalModules});
  bytes=Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed,memory),
    'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
  assert.equal(JSON.stringify(modules),before,'user IR remains unchanged');
  assert.equal(JSON.stringify(literalModules),libraryBefore,'actual library IR remains unchanged');
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
  assert.deepEqual([...lowered.modules].sort(),sourceUnits.map(([id])=>id).sort());
  for(const id of ['runtime/core/order.mjs','runtime/core/sorted.mjs','stdlib/managed-sorted-state.mjs']) {
    assert(lowered.privateModules.some(privateId=>privateId.endsWith('/'+id)), 'actual private source: '+id);
  }
  if(process.platform==='darwin'&&process.arch==='arm64') {
    nativePath=resolve(directory,'sorted-core.dylib');
    await writeFile(nativePath,Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));
  }

  // A second view of this exact graph exercises real bulk provider transport;
  // the zero-import artifact above remains independent of host capabilities.
  boundaryLowered=backend.managed.lower_managed_project(modules,entry,runtimeIR,{...memory,literalModules,phased:true});
  boundaryBytes=Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(boundaryLowered.typed,memory),
    'eliscript-managed-control',JSON.stringify(boundaryLowered.descriptor)));
  assert.equal(JSON.stringify(modules),before);
  assert.equal(JSON.stringify(literalModules),libraryBefore);
  if(process.platform==='darwin'&&process.arch==='arm64') {
    boundaryNativePath=resolve(directory,'sorted-provider.dylib');
    await writeFile(boundaryNativePath,Uint8Array.from(backend.native.emit_typed_native_memory_library(boundaryLowered.typed,'arm64-macos')));
  }

  const reference=resolve(directory,'reference');
  await mkdir(resolve(reference,'node_modules'),{recursive:true});
  await symlink(resolve('runtime'),resolve(reference,'runtime'),'dir');
  await symlink(resolve('.'),resolve(reference,'node_modules/eliscript'),'dir');
  for(const module of modules) {
    const filename=resolve(reference,module.id);await mkdir(dirname(filename),{recursive:true});
    await writeFile(filename,backend.compiler.emit_ir_string(module.program));
  }
  const script=resolve(directory,'original-reference.mjs');
  await writeFile(script,`import assert from 'node:assert/strict';
const m=await import(process.argv[2]),out={};
for(const name of ${JSON.stringify(cases)})out[name]=m[name.replaceAll('-','_')]();
out.randomized=m.randomized(${JSON.stringify(randomOperations)});
const state=m.held_state();out.held=Array.from({length:5},()=>m.held_step(state));
try{m.throw_comparison();throw Error('missing expected comparison failure');}catch(error){assert.equal(error.name,'TypeError');assert.equal(error.message,'sorted comparison marker');out.failure=[error.name,error.message];}
console.log(JSON.stringify(out));`);
  const url=pathToFileURL(resolve(reference,entry)).href;
  const references=[
    [process.env.NODE??'node',['--experimental-loader',resolve('tests/fixtures/compiled-eli-node-loader.mjs')]],
    [process.execPath,['--preload',resolve('tests/fixtures/compiled-eli-bun-preload.mjs')]],
  ];
  for(const[executable,flags]of references) {
    const result=spawnSync(executable,[...flags,script,url],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const observations=JSON.parse(result.stdout);
    if(expected)assert.deepEqual(observations,expected,'independent Node and Bun original runtime');
    else expected=observations;
  }
  const original=JSON.parse(expected['original-report']);
  assert.deepEqual(original.map,[[1,'a'],[2,'b'],[3,'c'],[4,'d']]);
  assert.deepEqual(original.reverseMap,[[3,'c'],[2,'b'],[1,'a']]);
  assert.deepEqual(original.set,[1,2,3,4]);assert.deepEqual(original.reverse,[4,3,2,1]);
  assert.deepEqual(original.from,[[4,'d']]);assert.deepEqual(original.subseq,[[2,'b'],[3,'c']]);
  assert.deepEqual(original.rsubseq,[4,3,2]);assert.equal(original.folded,'1a2b3c4d');
  assert.deepEqual(original.classification,[true,true,true,true,true,true]);
  assert.deepEqual(original.value,[true,true,true]);assert.deepEqual(original.empty,[true,true]);
  assert.deepEqual(original.errors,[
    'persistentSortedMap expects an even number of key/value forms',
    'two-bound subsequence requires a lower :>/:>= bound then an upper :</:<= bound',
    'sortedSequence ascending must be a boolean',
  ]);
  assert.deepEqual(expected.rotations.slice(0,4),Array.from({length:4},()=>[2,2,3,true]));
  assert.deepEqual(expected.sharing,[true,true,true,true,0,'updated',127,127]);
  assert.deepEqual(expected.transport[2],[],'bulk transport does not call comparator');
  assert(expected.transport.slice(3).every(value=>value===true));
  const model=new Map(),snapshots=[];
  for(const[index,[kind,key,value]]of randomOperations.entries()) {
    if(kind===0)model.set(key,value);else model.delete(key);
    if(index%17===0)snapshots.push([...model].sort(([a],[b])=>a-b));
  }
  assert.deepEqual(expected.randomized,[[...model].sort(([a],[b])=>a-b),snapshots,true,snapshots,true]);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function read(runtime,value) {
  if(value?.kind===4)return runtime.readNumber(value);
  if(value?.kind===5)return runtime.readString(value);
  if(value?.kind===14)return Array.from({length:runtime.length(value)},(_,index)=>{
    const child=runtime.get(value,index);
    try{return read(runtime,child);}finally{runtime.release(child);}
  });
  return value;
}
function invoke(runtime,name,args=[]) {
  const result=runtime.invoke(name,args);
  try{return read(runtime,result);}finally{runtime.release(result);}
}
function boxedOperations(runtime) {
  const children=[];
  try {
    for(const operation of randomOperations) {
      const numbers=operation.map(value=>runtime.number(value));
      try{children.push(runtime.array(numbers));}finally{for(const number of numbers)runtime.release(number);}
    }
    return runtime.array(children);
  } finally {for(const child of children)runtime.release(child);}
}
function finish(runtime) {
  runtime.closeModule();runtime.collect();
  assert.equal(runtime.live(),0);assert.equal(runtime.stats().frameDepth,0);
}
function checkAll(runtime) {
  for(const name of cases) {
    assert.deepEqual(invoke(runtime,name),expected[name],name);
    runtime.collect();assert.equal(runtime.stats().frameDepth,0,name+' frame cleanup');
  }
  const input=boxedOperations(runtime);
  try{assert.deepEqual(invoke(runtime,'randomized',[input]),expected.randomized);}
  finally{runtime.release(input);}
  runtime.collect();assert.equal(runtime.stats().frameDepth,0);

  const held=runtime.invoke('held-state');
  try {
    for(const observation of expected.held) {
      runtime.collect();assert.deepEqual(invoke(runtime,'held-step',[held]),observation);
      assert.equal(runtime.stats().frameDepth,0,'live map metadata comparator and iterator roots');
    }
  } finally{runtime.release(held);}
  for(let round=0;round<2;round++) {
    assert.throws(()=>runtime.invoke('throw-comparison'),error=>
      error instanceof TypeError&&error.message===expected.failure[1]);
    runtime.collect();assert.equal(runtime.stats().frameDepth,0,'source callback exception unwinds frames');
    assert.deepEqual(invoke(runtime,'rotations'),expected.rotations,'resource recovery after comparison failure');
  }
}

test('Given complete original sorted and ordering source modules when the original fixture boundaries protocols metadata ranges and fixed-seed AVL updates execute then zero-import WASM matches independent Node and Bun',()=>{
  const runtime=instantiateManagedRuntime(bytes,options);runtime.auto(65536);
  try{checkAll(runtime);}finally{finish(runtime);}
},30000);
test('Given collection at every allocation when old AVL versions callbacks normalized comparators metadata and lazy iterators remain observable then the original semantic corpus and resource recovery agree',()=>{
  const runtime=instantiateManagedRuntime(bytes,options);runtime.auto(1);
  try{checkAll(runtime);}finally{finish(runtime);}
},30000);
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given native machine code from the identical typed sorted graph when all original-reference cases run then actual native execution retains values identities errors GC roots and cleanup',async()=>{
  const runtime=await instantiateNativeManagedRuntime(nativePath,lowered,{...options,...memory});runtime.auto(1);
  try{checkAll(runtime);}finally{try{finish(runtime);}finally{runtime.close();}}
},120000);

const providerOptions={...options,literalHostProvider:OriginalLiterals,hostModules:new Map([
  ['eliscript/runtime/core/sorted.mjs',OriginalSorted],
  ['eliscript/runtime/core/metadata.mjs',OriginalMetadata],
])};
function checkProvider(runtime) {
  runtime.initializeModule();
  const module=boundaryLowered.descriptor.project.modules.find(value=>value.id===entry);
  assert(module,'actual public entry metadata');
  const call=(name,args=[])=>{
    const binding=module.exports.find(value=>value.name===name.replaceAll('-','_'));
    assert(binding,'actual export '+name);
    return runtime.project.invoke(binding.kind,binding.index,undefined,args);
  };
  const value=call('provider-value');
  assert(value instanceof OriginalSorted.PersistentSortedMap);
  assert.deepEqual([...value],[[1,'a'],[2,'b'],[3,'c']]);
  assert(Object.isFrozen(value));
  assert.strictEqual(value.comparator,OriginalSorted.defaultSortedComparator());
  assert.equal(OriginalMetadata.meta(value).get('provider'),17);
  assert.strictEqual(call('provider-identity',[value]),value,'same provider value returns the same object');
  const original=OriginalMetadata.withMeta(OriginalSorted.persistentSortedMap(2,'b',1,'a',3,'c'),OriginalLiterals.hashMap('provider',17));
  assert.strictEqual(call('provider-identity',[original]),original,'incoming actual provider identity');
  assert.deepEqual(Array.from(call('provider-inspect',[original]),item=>Array.isArray(item)?Array.from(item,pair=>Array.from(pair)):item),
    [true,false,[[1,'a'],[2,'b'],[3,'c']],true,17]);
  runtime.collect();
  const changed=call('provider-change',[original]);
  assert(changed instanceof OriginalSorted.PersistentSortedMap);
  assert.deepEqual([...changed],[[1,'a'],[2,'b'],[3,'c'],[4,'d']]);
  assert.deepEqual([...original],[[1,'a'],[2,'b'],[3,'c']]);
  assert.strictEqual(changed.comparator,original.comparator);
  assert.strictEqual(OriginalMetadata.meta(changed),OriginalMetadata.meta(original));

  let calls=0;
  const custom=OriginalSorted.persistentSortedMapBy((a,b)=>{calls++;return a-b;},2,'b',1,'a',3,'c');
  calls=0;
  assert.strictEqual(call('provider-identity',[custom]),custom);
  assert.equal(calls,0,'bulk import does not repeat comparator effects');
  const customChanged=call('provider-change',[custom]);
  assert(calls>0,'actual foreign custom comparator is called by target AVL operations');
  assert.deepEqual([...customChanged],[[1,'a'],[2,'b'],[3,'c'],[4,'d']]);
  assert.strictEqual(customChanged.comparator,custom.comparator);
  assert.equal(runtime.stats().frameDepth,0);
}
test('Given actual provider sorted classes when bulk values cross the real phased WASM boundary then brands comparator metadata identity and pure target AVL updates survive GC',()=>{
  const runtime=instantiateManagedRuntime(boundaryBytes,providerOptions);runtime.auto(1);
  try{checkProvider(runtime);}finally{finish(runtime);}
},30000);
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given actual provider values when the same phased graph executes native machine code then provider identities and comparator effects are preserved without host sorting',async()=>{
  const runtime=await instantiateNativeManagedRuntime(boundaryNativePath,boundaryLowered,{...providerOptions,...memory});runtime.auto(1);
  try{checkProvider(runtime);}finally{try{finish(runtime);}finally{runtime.close();}}
},120000);
