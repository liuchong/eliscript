import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, posix} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

// Match the complete portable stdlib graph's existing resource contract.
const options = {maxSlots:8192, initialBytes:262144, maxBytes:16777216};
const memory = {initialPages:4, maximumPages:1024};
const counts = [0, 1, 31, 32, 33, 63, 64, 1023, 1024, 1055, 1056, 1057];
let directory, backend, modules, lowered, bytes, nativePath, expected;

function originalReferenceSource() {
  const from = file => JSON.stringify(pathToFileURL(resolve('runtime/core', file)).href);
  return `
import assert from 'node:assert/strict';
import {PersistentVector} from ${from('vector.mjs')};
import {PersistentHashMap} from ${from('map.mjs')};
import {PersistentHashSet} from ${from('set.mjs')};
import {transient,conjBang,assocBang,dissocBang,persistentBang} from ${from('transient.mjs')};
import {withMeta,meta} from ${from('metadata.mjs')};
import {extendValueType,hashValue} from ${from('value.mjs')};
import {VECTOR_STATE,TRANSIENT_VECTOR_STATE} from ${from('vector-internals.mjs')};
import {MAP_STATE,TRANSIENT_MAP_STATE,ArrayNode,BitmapIndexedNode} from ${from('map-internals.mjs')};
const metadataValue=()=>PersistentHashMap.from([['tag',17]]);
const caughtReport=callback=>{try{return callback();}catch(error){return [error.name,error.message];}};
class Key {constructor(id,hash){this.id=id;this.hash=hash;}}
extendValueType(Key,{hash:key=>key.hash,equal:(a,b)=>b instanceof Key&&a.id===b.id});
function vectorCase(count){
 const metadata=metadataValue(),source=withMeta(PersistentVector.from(Array.from({length:count},(_,i)=>i)),metadata),builder=transient(source),noop=transient(source),state=builder[TRANSIENT_VECTOR_STATE],original=source[VECTOR_STATE];
 const shared=state.root===original.root&&state.tail===original.tail;
 conjBang(builder,count);conjBang(builder,count+1);assocBang(builder,count+2,count+2);assocBang(builder,0,-2);const result=persistentBang(builder);
 return [[...source],[...result],shared,persistentBang(noop)===source,meta(result)===metadata,meta(result).get('tag'),state.active,state.owner===null,
  caughtReport(()=>conjBang(builder,9)),caughtReport(()=>assocBang(builder,0,9)),caughtReport(()=>persistentBang(builder))];
}
function vectorOwnership(){
 const source=PersistentVector.from(Array.from({length:97},(_,i)=>i)),builder=transient(source),state=builder[TRANSIENT_VECTOR_STATE],original=source[VECTOR_STATE],tail=original.tail,root=original.root,sibling=root.slots[1];
 conjBang(builder,97);const ownedTail=state.tail;conjBang(builder,98);const tailReused=ownedTail===state.tail;
 assocBang(builder,0,100);const ownedRoot=state.root,ownedLeaf=ownedRoot.slots[0];assocBang(builder,1,101);
 const rootReused=ownedRoot===state.root,leafReused=ownedLeaf===state.root.slots[0],result=persistentBang(builder),second=transient(result);
 assocBang(second,0,200);const next=persistentBang(second);
 return [tail!==ownedTail,tailReused,root!==ownedRoot,rootReused,leafReused,sibling===ownedRoot.slots[1],next[VECTOR_STATE].root!==result[VECTOR_STATE].root,
  source.nth(0),source.nth(1),result.nth(0),result.nth(1),next.nth(0),tail.length,source.nth(96),result.nth(98)];
}
function mapBranches(){
 const metadata=metadataValue(),empty=PersistentHashMap.empty();let source=empty;
 for(let i=0;i<32;i++)source=source.assoc(new Key(i,i),i);source=withMeta(source,metadata);
 const builder=transient(source),state=builder[TRANSIENT_MAP_STATE],root=source[MAP_STATE].root,noop=transient(source);
 assocBang(noop,new Key(0,0),0);dissocBang(noop,new Key(100,100));
 assocBang(builder,new Key(0,0),100);const owned=state.root;assocBang(builder,new Key(1,1),101);
 const reused=owned===state.root,snapshot=persistentBang(builder),grow=transient(empty),growing=grow[TRANSIENT_MAP_STATE];
 dissocBang(grow,new Key(0,0));for(let i=0;i<32;i++)assocBang(grow,new Key(i,i),i);const promoted=growing.root instanceof ArrayNode;
 for(let i=31;i>=24;i--)dissocBang(grow,new Key(i,i));const packed=growing.root,demoted=packed instanceof BitmapIndexedNode;
 dissocBang(grow,new Key(23,23));const packedReused=packed===growing.root;
 for(let i=22;i>=0;i--)dissocBang(grow,new Key(i,i));const cleared=persistentBang(grow);
 return [promoted,demoted,packedReused,reused,root!==owned,persistentBang(noop)===source,
  source.count,source.get(new Key(0,0)),snapshot.count,snapshot.get(new Key(0,0)),snapshot.get(new Key(1,1)),meta(snapshot)===metadata,meta(snapshot).get('tag'),
  cleared.count,cleared.has(new Key(0,0)),caughtReport(()=>assocBang(builder,new Key(9,9),9)),caughtReport(()=>dissocBang(builder,new Key(9,9))),caughtReport(()=>persistentBang(builder))];
}
function collisions(){
 let source=PersistentHashMap.empty();for(let i=0;i<4;i++)source=source.assoc(new Key(i,42),i);
 const builder=transient(source),state=builder[TRANSIENT_MAP_STATE],root=source[MAP_STATE].root;
 assocBang(builder,new Key(0,42),100);const owned=state.root;assocBang(builder,new Key(1,42),101);assocBang(builder,new Key(4,42),104);const reused=owned===state.root;
 dissocBang(builder,new Key(2,42));dissocBang(builder,new Key(99,42));dissocBang(builder,new Key(99,7));assocBang(builder,new Key(9,1066),109);dissocBang(builder,new Key(9,1066));dissocBang(builder,new Key(4,42));dissocBang(builder,new Key(3,42));dissocBang(builder,new Key(1,42));
 const result=persistentBang(builder);return [root!==owned,reused,source.count,source.get(new Key(0,42)),result.count,result.get(new Key(0,42)),result.get(new Key(1,42)),result.has(new Key(2,42))];
}
function realCollision(){
 const left='key-50691',right='key-194634',source=PersistentHashMap.from([[left,'left'],[right,'right']]),builder=transient(source);
 assocBang(builder,left,'changed');dissocBang(builder,right);assocBang(builder,right,'again');const result=persistentBang(builder);
 return [hashValue(left)===hashValue(right),source.count,source.get(left),source.get(right),result.count,result.get(left),result.get(right)];
}
function setCase(){
 const left=PersistentVector.from([1,2]),right=PersistentVector.from([1,2]),metadata=metadataValue(),source=withMeta(PersistentHashSet.from([left,NaN,-0]),metadata),noop=transient(source),builder=transient(source);
 conjBang(noop,right);conjBang(noop,NaN);conjBang(noop,0);dissocBang(noop,'absent');conjBang(builder,'new');dissocBang(builder,right);const result=persistentBang(builder);
 return [persistentBang(noop)===source,source.count,source.has(right),result.count,result.has(left),result.has('new'),result.has(NaN),result.has(0),meta(result)===metadata,meta(result).get('tag'),
  caughtReport(()=>conjBang(builder,9)),caughtReport(()=>dissocBang(builder,9)),caughtReport(()=>persistentBang(builder))];
}
function callbackOrder(mode){
 const trace=[],marker={};let armed=false;
 class CheckedKey {constructor(id){this.id=id;}}
 class CheckedValue {constructor(label){this.label=label;}}
 extendValueType(CheckedKey,{hash(){if(armed){trace.push('hash');if(mode===0)throw marker;}return 13;},equal(left,right){if(armed){trace.push('key');if(mode===1)throw marker;}return left.id===right.id;}});
 extendValueType(CheckedValue,{hash(){return 0;},equal(left,right){if(armed){trace.push('value');if(mode===2)throw marker;}return left.label===right.label;}});
 const source=PersistentHashMap.from([[new CheckedKey(1),new CheckedValue('old')]]),builder=transient(source);let caught=false;
 armed=true;try{assocBang(builder,new CheckedKey(1),new CheckedValue('new'));}catch(error){caught=error===marker;}armed=false;
 const result=persistentBang(builder);return [trace,caught,result===source,result.count,result.get(new CheckedKey(1)).label];
}
function indexErrors(){
 const builder=transient(PersistentVector.from([1])),trace=[],index={toString(){trace.push('string');throw 'format';}},out=[];
 for(const key of [-1,0.5,NaN,Infinity,'0',2,undefined,null])out.push(caughtReport(()=>assocBang(builder,key,9)));
 try{assocBang(builder,index,9);}catch(error){out.push(error);}persistentBang(builder);out.push(caughtReport(()=>assocBang(builder,index,9)),trace);return out;
}
function vectorLimit(){
 const builder=transient(PersistentVector.from([7])),state=builder[TRANSIENT_VECTOR_STATE];state.count=2147483647;
 return [caughtReport(()=>conjBang(builder,9)),state.count,state.changed,state.active,state.source.nth(0)];
}
function invalidSources(){
 return [PersistentVector.empty(),PersistentHashMap.empty(),PersistentHashSet.empty()].map(value=>{
  const Constructor=transient(value).constructor;return caughtReport(()=>new Constructor(null,null));
 });
}
const output={vectors:${JSON.stringify(counts)}.map(vectorCase),vectorOwnership:vectorOwnership(),mapBranches:mapBranches(),collisions:collisions(),realCollision:realCollision(),setCase:setCase(),callbacks:[0,1,2,3].map(callbackOrder),indexErrors:indexErrors(),vectorLimit:vectorLimit(),invalidSources:invalidSources()};
assert(output.vectorOwnership.slice(0,7).every(Boolean));assert(output.mapBranches.slice(0,6).every(Boolean));assert.equal(output.realCollision[0],true);
console.log(JSON.stringify(output));
`;
}

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-transient-state-'));
  backend = await buildBackends({outputRoot:directory});
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  modules = [];
  const seen = new Set();
  async function load(id, source) {
    if (seen.has(id)) return;
    seen.add(id);
    const filename = id === 'entry.mjs' ? 'tests/fixtures/wasm-managed-transient-state.eli' : id;
    const program = backend.compiler.compile_ir_string(source ?? await readFile(filename, 'utf8'), filename);
    modules.push({id,program});
    // Only module containers may contain declarations at this boundary. Walk
    // every nested container in source order without dropping its real imports.
    const declarations=[...program.body].reverse();
    while (declarations.length) {
      const node=declarations.pop();
      if(node.kind==='module-declaration'){
        for(let index=node.children.length-1;index>=0;index--)declarations.push(node.children[index]);
        continue;
      }
      if (node.kind !== 'import-declaration') continue;
      const target = posix.normalize(posix.join(posix.dirname(id), node.value));
      assert(target.startsWith('stdlib/'), 'real portable module dependency: ' + target);
      await load(target);
    }
  }
  await load('entry.mjs', await readFile('tests/fixtures/wasm-managed-transient-state.eli', 'utf8'));
  assert(modules.some(module => module.id === 'stdlib/managed-transient-state.eli'));
  for (const name of ['persistent-vector','persistent-map','persistent-set','value']) {
    assert(modules.some(module => module.id === 'stdlib/' + name + '.eli'));
  }
  const saved = JSON.stringify(modules);
  lowered = backend.managed.lower_managed_project(modules, 'entry.mjs', runtime, memory);
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(
    backend.wasm.emit_typed_memory_wasm(lowered.typed, memory),
    'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.equal(JSON.stringify(modules), saved);
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    nativePath = resolve(directory, 'transient-state.dylib');
    await writeFile(nativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, 'arm64-macos')));
  }
  const oracle = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval', originalReferenceSource()],
    {encoding:'utf8', timeout:30000});
  assert.equal(oracle.status, 0, oracle.stderr);
  expected = JSON.parse(oracle.stdout);
}, 120000);
afterAll(async () => { if (directory) await rm(directory, {recursive:true, force:true}); });

function read(runtime, value) {
  if (value?.kind === 4) return runtime.readNumber(value);
  if (value?.kind === 5) return runtime.readString(value);
  if (value?.kind === 14) return Array.from({length:runtime.length(value)}, (_, index) => {
    const item = runtime.get(value, index);
    try { return read(runtime, item); } finally { runtime.release(item); }
  });
  return value;
}
function invoke(runtime, name, arguments_ = []) {
  const result = runtime.invoke(name, arguments_);
  try { return read(runtime, result); } finally { runtime.release(result); }
}
function finish(runtime) {
  runtime.closeModule();runtime.collect();
  assert.equal(runtime.live(), 0);assert.equal(runtime.stats().frameDepth, 0);
}
function checkAll(runtime) {
  for (const [index, count] of counts.entries()) {
    const number = runtime.number(count);
    try { assert.deepEqual(invoke(runtime, 'vector-case', [number]), expected.vectors[index], 'vector count ' + count); }
    finally { runtime.release(number); }
    runtime.collect();assert.equal(runtime.stats().frameDepth, 0);
  }
  for (const [name,key] of [['vector-ownership','vectorOwnership'],['map-branches','mapBranches'],['collisions','collisions'],['real-collision','realCollision'],['set-case','setCase'],['index-errors','indexErrors'],['vector-limit','vectorLimit'],['invalid-sources','invalidSources']]) {
    assert.deepEqual(invoke(runtime, name), expected[key], name);
    runtime.collect();assert.equal(runtime.stats().frameDepth, 0);
  }
  for (const mode of [0,1,2,3]) {
    const value = runtime.number(mode);
    try { assert.deepEqual(invoke(runtime, 'callback-order', [value]), expected.callbacks[mode], 'callback mode ' + mode); }
    finally { runtime.release(value); }
    runtime.collect();assert.equal(runtime.stats().frameDepth, 0);
  }
}

test('Given the complete transient state dependency graph when vector trie boundaries and HAMT branches execute then zero-import WASM matches the original JS runtime', () => {
  const runtime = instantiateManagedRuntime(bytes, options);runtime.auto(65536);
  try { checkAll(runtime); } finally { finish(runtime); }
}, 30000);
test('Given collection at every allocation when owners mutate collision and branch nodes then old values metadata callbacks and sealed states match the original JS runtime', () => {
  const runtime = instantiateManagedRuntime(bytes, options);runtime.auto(1);
  try { checkAll(runtime); } finally { finish(runtime); }
}, 30000);
test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')('Given native machine code from the same typed complete graph when all transient state cases execute then the original JS observations and root cleanup agree', async () => {
  const runtime = await instantiateNativeManagedRuntime(nativePath, lowered, {...options,...memory});runtime.auto(1);
  try { checkAll(runtime); } finally { try { finish(runtime); } finally { runtime.close(); } }
}, 120000);
test('Given a live edit state retained between exported calls when GC runs repeatedly then owner paths and source values remain rooted until persistent sealing', () => {
  const runtime = instantiateManagedRuntime(bytes, options);runtime.auto(1);
  const state = runtime.invoke('held-state');
  const source = Array.from({length:65}, (_, index) => index), result = [...source];
  try {
    for (const [index,value] of [[0,100],[1,101],[32,132],[64,164]]) {
      runtime.collect();const key=runtime.number(index),item=runtime.number(value);
      try { const returned=runtime.invoke('held-step',[state,key,item]);try { assert(runtime.keyEqual(returned,state)); } finally { runtime.release(returned); } }
      finally { runtime.release(key);runtime.release(item); }
      result[index]=value;assert.equal(runtime.stats().frameDepth,0);
    }
    runtime.collect();assert.deepEqual(invoke(runtime,'held-finish',[state]),[source,result,17]);
  } finally { runtime.release(state);finish(runtime); }
}, 30000);
