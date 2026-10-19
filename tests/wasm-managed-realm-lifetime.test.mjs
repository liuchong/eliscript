import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {invokeWithHeapDiagnostic} from './helpers/managed-heap-diagnostic.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';

const source = `
(defun identity (value) value)
(defun function-value () identity)
(defun missing (function) (get function "unrelated-missing-field"))
(defun make-map () (new globalThis/Map))
(defun discarded-map (marker) (new globalThis/Map nil (put marker 0 7)) 9)
(defun same-map-prototype (map) (Object/is (Object/getPrototypeOf map) (get globalThis/Map "prototype")))
(defun install-map (value) (put (get globalThis/Map "prototype") "__eliscript_realm_lifetime" value))
(defun read-map () (get (new globalThis/Map) "__eliscript_realm_lifetime"))
(defun delete-map () (Reflect/deleteProperty (get globalThis/Map "prototype") "__eliscript_realm_lifetime"))
(defun install-function (value) (put (get globalThis/Function "prototype") "__eliscript_realm_lifetime" value))
(defun read-function () (get identity "__eliscript_realm_lifetime"))
(defun install-named (value) (put identity "__eliscript_named_lifetime" value))
(defun read-named () (get identity "__eliscript_named_lifetime"))
(defun lock-map () (Object/preventExtensions (get globalThis/Map "prototype")) nil)
(defun map-extensible () (Object/isExtensible (get globalThis/Map "prototype")))
(defun array-prototype-query (mode)
 (let* ((array (js-array))
        (prototype (cond ((= mode 1) nil) ((= mode 2) (js-object))
                         (t (get globalThis/Array "prototype")))))
  (when (/= mode 0) (Object/setPrototypeOf array prototype))
  (Object/is (Object/getPrototypeOf array) prototype)))
(defun object-reference () globalThis/Object)
(defun object-static (key) (get globalThis/Object key))
(defun object-prototype-member (key) (get (get globalThis/Object "prototype") key))
(defun object-static-order (mode)
 (let ((constructor globalThis/Object) (reads 0))
  (cond
   ((= mode 1) (get constructor "seal") (get constructor "assign") (get constructor "keys"))
   ((= mode 2)
    (Object/defineProperty constructor "keys"
     (js-object :get (lambda () (setq reads (1+ reads)) 9) :configurable t)))
   ((= mode 3)
    (let ((original (get constructor "keys")))
     (Reflect/deleteProperty constructor "keys") (put constructor "keys" original))))
  (JSON/stringify (js-array (Object/getOwnPropertyNames constructor) reads))))
(defun object-prototype-order (mode)
 (let ((prototype (get globalThis/Object "prototype")) (reads 0))
  (cond
   ((= mode 1) (get prototype "isPrototypeOf") (get prototype "hasOwnProperty") (get prototype "toString"))
   ((= mode 2)
    (Object/defineProperty prototype "hasOwnProperty"
     (js-object :get (lambda () (setq reads (1+ reads)) 9) :configurable t)))
   ((= mode 3)
    (let ((original (get prototype "hasOwnProperty")))
     (Reflect/deleteProperty prototype "hasOwnProperty") (put prototype "hasOwnProperty" original))))
  (JSON/stringify (js-array (Object/getOwnPropertyNames prototype) reads))))
(defun object-static-mutation (mode)
 (let* ((constructor globalThis/Object) (original (get constructor "keys"))
        (reads 0) (first undefined) (second undefined))
  (cond
   ((= mode 0) (Reflect/deleteProperty constructor "keys"))
   ((= mode 1) (put constructor "keys" false))
   ((= mode 2)
    (Object/defineProperty constructor "keys"
     (js-object :get (lambda () (setq reads (1+ reads)) -0) :configurable t))))
  (setq first (get constructor "keys") second (get constructor "keys"))
  (JSON/stringify (js-array (Object/hasOwn constructor "keys")
   (Object/is first second) (eq first undefined) (eq first false)
   (Object/is first -0) reads (get original "name") (get original "length")))))
(defun object-static-integrity ()
 (let ((constructor globalThis/Object))
  (Object/freeze constructor)
  (let ((description (Object/getOwnPropertyDescriptor constructor "keys")))
   (JSON/stringify (js-array (Object/isFrozen constructor) (Object/isExtensible constructor)
    (get description :writable) (get description :enumerable) (get description :configurable)
    (get (get constructor "keys") "name") (get (get constructor "keys") "length"))))))
(export identity function-value missing make-map discarded-map same-map-prototype
 install-map read-map delete-map install-function read-function install-named read-named lock-map map-extensible
 object-reference object-static object-prototype-member object-static-order object-prototype-order object-static-mutation object-static-integrity array-prototype-query)
`;
let directory, backend, runtime, program, bytes, lowered, nativePath, objectOracle;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-realm-lifetime-'));
  backend = await buildBackends({outputRoot: directory});
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  program = backend.compiler.compile_ir_string(source, 'realm-lifetime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime);
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed), 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const javascript = backend.compiler.emit_ir_string(program);
  const oracle = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval',
    'const m=await import(' + JSON.stringify('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64')) + ');' +
    'const map=m.make_map(); const out=[m.same_map_prototype(map)]; m.install_map(-0);out.push(Object.is(m.read_map(),-0),m.delete_map());m.install_function(9);out.push(m.read_function());m.install_named(9);out.push(m.read_named());m.lock_map();out.push(m.map_extensible());console.log(JSON.stringify(out));'], {encoding: 'utf8', timeout: 30000});
  assert.equal(oracle.status, 0, oracle.stderr);assert.deepEqual(JSON.parse(oracle.stdout), [true, true, true, 9, 9, false]);
  const objectChild = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '--eval',
    'const m=await import(' + JSON.stringify('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64')) + ');' +
    'const keys=Object.getOwnPropertyDescriptor(Object,"keys"),mutations=[];' +
    'for(let mode=0;mode<3;mode++){try{mutations.push(JSON.parse(m.object_static_mutation(mode)));}finally{Object.defineProperty(Object,"keys",keys);}}' +
    'const prototypes=[0,1,2].map(mode=>m.array_prototype_query(mode));' +
    'const integrity=JSON.parse(m.object_static_integrity());console.log(JSON.stringify({mutations,integrity,prototypes}));'],
    {encoding: 'utf8', timeout: 30000});
  assert.equal(objectChild.status, 0, objectChild.stderr);objectOracle = JSON.parse(objectChild.stdout);
  assert.deepEqual(objectOracle.mutations, [
    [false,true,true,false,false,0,'keys',1],
    [true,true,false,true,false,0,'keys',1],
    [true,true,false,false,true,2,'keys',1],
  ]);
  assert.deepEqual(objectOracle.integrity, [true,false,false,false,false,'keys',1]);
  assert.deepEqual(objectOracle.prototypes,[true,true,true]);
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    nativePath = resolve(directory, 'realm.dylib');
    await writeFile(nativePath, Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed, 'arm64-macos')));
  }
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});
function finish(a) {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);a.close?.();}

test('plain function values and missing reads fit the original 64-slot heap without materializing unrelated builtins', () => {
  const a = instantiateManagedRuntime(bytes, {maxSlots: 64, initialBytes: 8192, maxBytes: 65536});a.auto(1);
  try {
    const f = a.invoke('function-value');
    try {assert.equal(a.invoke('missing', [f]), undefined);} finally {a.release(f);}
    a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
  } finally {finish(a);}
});

for(const lookup of ['object-static','object-prototype-member']){
for(const maxSlots of [64,256])test(lookup+' recovers after exhaustion within its original '+maxSlots+' slots and keeps its identity across GC',()=>{
  const a=instantiateManagedRuntime(bytes,{maxSlots,initialBytes:16384,maxBytes:65536});a.auto(1);
  const constructor=a.invoke('object-reference'),key=a.string(lookup==='object-static'?'keys':'hasOwnProperty'),caller=a.frame(2),padding=[];let first,second;
  a.frameSet(caller,0,constructor);a.frameSet(caller,1,key);
  try{
    assert.throws(()=>{for(let index=0;index<maxSlots*2;index++)padding.push(a.number(index));},
      error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
    assert.throws(()=>a.invoke(lookup,[key]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
    assert.equal(a.stats().frameDepth,1);
    for(const value of padding)a.release(value);padding.length=0;a.collect();
    first=a.invoke(lookup,[key]);assert.equal(first.kind,18);a.collect();
    second=a.invoke(lookup,[key]);assert(a.keyEqual(first,second));assert.equal(a.stats().frameDepth,1);
  }finally{for(const value of padding)a.release(value);a.leaveFrame(caller);for(const value of [constructor,key,first,second])a.release(value);finish(a);}
});
}

test('reading default null and custom Array prototype identity does not observe its methods in the original 64 slots',()=>{
  const a=instantiateManagedRuntime(bytes,{maxSlots:64,initialBytes:16384,maxBytes:65536});a.auto(1);
  try{
    for(let mode=0;mode<3;mode++){
      const input=a.number(mode);
      try{assert.equal(invokeWithHeapDiagnostic(a,'array-prototype-query',[input]),objectOracle.prototypes[mode]);a.collect();assert.equal(a.stats().frameDepth,0);}
      finally{a.release(input);}
    }
  }finally{finish(a);}
});

test('observed Object statics retain represented key order descriptors overrides deletion and complete integrity',()=>{
  for(const [lookup,changed]of [['object-static-order','keys'],['object-prototype-order','hasOwnProperty']]){
    const orders=[];
    for(let mode=0;mode<4;mode++){
      const a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.number(mode);let out;
      try{out=a.invoke(lookup,[input]);orders.push(JSON.parse(a.readString(out)));}
      finally{a.release(input);a.release(out);finish(a);}
    }
    assert.deepEqual(orders[1],orders[0]);assert.deepEqual(orders[2],orders[0]);
    assert.deepEqual(orders[3][0].slice(0,-1),orders[0][0].filter(name=>name!==changed));assert.equal(orders[3][0].at(-1),changed);
    assert(orders.every(record=>record[1]===0),'own-name enumeration never invokes a replacement getter');
  }
  for(let mode=0;mode<3;mode++){
    const a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.number(mode);let out;
    try{out=a.invoke('object-static-mutation',[input]);assert.deepEqual(JSON.parse(a.readString(out)),objectOracle.mutations[mode]);}
    finally{a.release(input);a.release(out);finish(a);}
  }
  const a=instantiateManagedRuntime(bytes);a.auto(1);let out;
  try{out=a.invoke('object-static-integrity');assert.deepEqual(JSON.parse(a.readString(out)),objectOracle.integrity);}
  finally{a.release(out);finish(a);}
});

test('unused constructors release their default realm while held instances retain canonical prototype identity', () => {
  const a = instantiateManagedRuntime(bytes);a.auto(1);
  try {
    const marker = a.sourceArray([false]);
    let out;
    try {out = a.invoke('discarded-map', [marker]);assert.equal(a.readNumber(out), 9);const changed = a.get(marker, 0);try {assert.equal(a.readNumber(changed), 7);} finally {a.release(changed);}}
    finally {a.release(out);a.release(marker);}
    a.collect();assert.equal(a.live(), 0);
    const map = a.invoke('make-map');
    try {for (let index = 0; index < 3; index++) {a.collect();assert.equal(a.invoke('same-map-prototype', [map]), true);}}
    finally {a.release(map);}
    a.collect();assert.equal(a.live(), 0);
  } finally {finish(a);}
});

function mutations(a) {
  a.auto(1);const negative = a.number(-0), nine = a.number(9);
  try {
    for (const [name, value] of [['install-map', negative], ['install-function', nine], ['install-named', nine]]) {const out = a.invoke(name, [value]);a.release(out);}
  } finally {a.release(negative);a.release(nine);}
  a.collect();assert(a.live() > 0, 'observable changes to the realm must survive collection without external handles');
  const mapValue = a.invoke('read-map'), functionValue = a.invoke('read-function'), namedValue = a.invoke('read-named');
  try {assert(Object.is(a.readNumber(mapValue), -0));assert.equal(a.readNumber(functionValue), 9);assert.equal(a.readNumber(namedValue), 9);} finally {a.release(mapValue);a.release(functionValue);a.release(namedValue);}
  assert.equal(a.invoke('delete-map'), true);a.collect();assert.equal(a.invoke('read-map'), undefined);
  a.release(a.invoke('lock-map'));a.collect();assert.equal(a.invoke('map-extensible'), false);
}
test('user prototype assignments, deletion and preventExtensions remain observable across GC and release on close', () => {
  const a = instantiateManagedRuntime(bytes);try {mutations(a);} finally {finish(a);}
});

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')('native machine code preserves the same realm mutation lifetime', async () => {
  const a = await instantiateNativeManagedRuntime(nativePath, lowered);
  try {mutations(a);} finally {finish(a);}
});

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')('native Object statics preserve observed override deletion accessor and frozen descriptors',async()=>{
  for(const mode of [0,1,2,'integrity']){
    const a=await instantiateNativeManagedRuntime(nativePath,lowered);a.auto(1);let input,out;
    try{
      if(mode==='integrity')out=a.invoke('object-static-integrity');
      else{input=a.number(mode);out=a.invoke('object-static-mutation',[input]);}
      assert.deepEqual(JSON.parse(a.readString(out)),mode==='integrity'?objectOracle.integrity:objectOracle.mutations[mode]);
      assert.equal(a.stats().frameDepth,0);
    }finally{a.release(input);a.release(out);finish(a);}
  }
});
