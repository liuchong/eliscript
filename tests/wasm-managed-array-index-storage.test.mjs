import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {invokeWithHeapDiagnostic} from './helpers/managed-heap-diagnostic.mjs';

// Use the existing receiver-forwarding method ABI rather than an implicit
// receiver inside an ordinary source callback.
const receiverMethod = '(fn, name) => { if (typeof name !== "string") throw new TypeError("method name must be a string"); return ({ [name](...args) { return Reflect.apply(fn, undefined, [this, ...args]); } })[name]; }';
const source = `
 (defconst marker -0)
 (defvar destination nil)
 (defun species (length) destination)
 (defun exercise (mode)
  (let* ((object (js* "Object")) (trace (js-array))
         (items (js-array -0 1 2)) (out undefined) (failure false))
   (setq destination (js-array))
   (when (or (= mode 1) (= mode 10))
    (let ((parent (js-object)))
     (js-call object :setPrototypeOf parent (get (js* "Array") :prototype))
     (js-call object :defineProperty parent "1"
      (js-object :get (lambda () (js-call trace :push "getter")
                      (if (= mode 10) (throw false) 9)) :configurable t))
     (Reflect/deleteProperty items "1") (js-call object :setPrototypeOf items parent)))
   (when (and (>= mode 2) (<= mode 9))
    (when (= mode 8) (setq destination (js-array 9 8 7)))
    (let ((constructor (js-object)))
     (put constructor (get (js* "Symbol") :species) species)
     (put items :constructor constructor))
    (cond
     ((= mode 2)
      (let ((parent (js-object)))
       (js-call object :setPrototypeOf parent (get (js* "Array") :prototype))
       (js-call object :defineProperty parent "0"
        (js-object :set (lambda (value) (js-call trace :push "setter")) :configurable t))
       (js-call object :setPrototypeOf destination parent)))
     ((= mode 3)
      (js-call object :defineProperty destination "0"
       (js-object :get (lambda () (throw "old getter must not run")) :configurable t)))
     ((= mode 4)
      (js-call object :defineProperty destination "0"
       (js-object :value 7 :writable false :enumerable t :configurable false)))
     ((or (= mode 5) (= mode 8)) (js-call object :preventExtensions destination))
     ((= mode 6) (js-call object :freeze destination))
     ((= mode 7) (js-call object :defineProperty destination "length" (js-object :writable false)))
     ((= mode 9) (js-call object :seal destination))))
   (try
    (setq out (js-call items :map
     (lambda (value index array)
      (js-call trace :push (js-array "callback" index (js-call object :is value -0))) value)))
    (catch error (setq failure (if (eq error false) "false" (get error :name)))))
   (let* ((result (if (eq out undefined) destination out))
          (description (js-call object :getOwnPropertyDescriptor result "0")))
    (JSON/stringify (js-array failure trace (js-length result)
     (object-has? result "0") (object-has? result "1")
     (if (eq description undefined) undefined
      (js-array (get description :writable) (get description :enumerable)
       (get description :configurable) (js-call object :is (get description :value) -0)))
     (if failure undefined result))))))
 (defun map-copy (items) (js-call items :map (lambda (value) value)))
 (defun recover () (js-call (js-array -0) :map (lambda (value) value)))
 (defun this-argument (mode)
  (let* ((items (js-array -0 1))
         (callback (funcall (js* ${JSON.stringify(receiverMethod)})
                     (lambda (receiver value index array) receiver) "callback"))
         (receiver (cond ((= mode 0) (js-object :marker -0)) ((= mode 1) nil)
                     ((= mode 2) undefined) ((= mode 3) false) ((= mode 4) -0)
                     ((= mode 5) "this中😀") (t t)))
         (out (js-call items :map callback receiver)))
   (JSON/stringify (js-array (Object/is (aref out 0) receiver)
    (Object/is (aref out 1) receiver) (Object/is (aref items 0) -0)
    (Object/is receiver -0)))))
 (defun captured-map (replace-with-function)
  (let* ((items (js-array -0 1 2)) (trace (js-array))
         (replacement (if replace-with-function
           (lambda (callback) (js-call trace :push "replacement") 9) false))
         (callback (lambda (value index array)
          (when (= index 0) (put items :map replacement))
          (js-call trace :push index) value))
         (out (js-call items :map (progn (js-call trace :push "argument") callback)))
         (next undefined) (failure false))
   (try
    (setq next (js-call items :map (progn (js-call trace :push "later argument") callback)))
    (catch error (setq failure (get error :name))))
   (JSON/stringify (js-array out trace next failure (Object/is (js-nth 0 out) -0)
    (eq (get items :map) replacement)))))
 (defun prototype () globalThis.Array.prototype)
 (defun observe-method () (aref globalThis.Array.prototype "at"))
 (defun call-observed-method ()
  (js-call (aref globalThis.Array.prototype "at") :call (js-array -0) 0))
 (defun species-observation (mode)
  (let* ((constructor globalThis/Array) (key Symbol/species)
         (original (aref constructor key)) (reads 0))
   (cond
    ((= mode 1) (Reflect/deleteProperty constructor key))
    ((= mode 2) (Object/defineProperty constructor key
      (js-object :value false :writable t :configurable t)))
    ((= mode 3) (Object/defineProperty constructor key
      (js-object :get (lambda () (setq reads (1+ reads)) -0) :configurable t))))
   (let ((first (aref constructor key)))
    (Object/getOwnPropertyNames constructor)
    (let* ((symbols (Object/getOwnPropertySymbols constructor)) (again (aref constructor key)))
     (JSON/stringify (js-array (Object/is original constructor)
      (Object/hasOwn constructor key) (Object/is first again)
      (undefined? first) (eq first false) (Object/is first -0) reads
      (js-call symbols :indexOf key)))))))
 (defun prototype-alias (mode)
  (let* ((prototype globalThis.Array.prototype) (key (get (js* "Symbol") :iterator))
         (original (if (= mode 3) (aref prototype key) (get prototype :values))))
   (when (= mode 1) (put prototype :values (lambda () 9)))
   (when (or (= mode 2) (= mode 4)) (Reflect/deleteProperty prototype "values"))
   (when (= mode 4) (put prototype :length 64))
   (let ((other (if (= mode 3) (get prototype :values) (aref prototype key))))
    (JSON/stringify (js-array (eq original other) (get other :name) (get other :length)
      (Object/hasOwn prototype "values"))))))
 (defun flags-after-growth ()
  (let ((items (js-array)) (failure false))
   (Object/preventExtensions items) (put items :length 64)
   (try (put items "0" 1) (catch error (setq failure (get error :name))))
   (JSON/stringify (js-array (Object/isExtensible items) (js-length items)
     (Object/hasOwn items "0") failure))))
 (defun prototype-order (mode)
  (let ((prototype globalThis.Array.prototype) (reads 0))
   (cond
    ((= mode 1) (get prototype :at) (get prototype :map) (get prototype :pop))
    ((= mode 2)
     (Object/defineProperty prototype "map"
      (js-object :get (lambda () (setq reads (1+ reads)) 9) :configurable t)))
    ((= mode 3)
     (let ((method (get prototype :push)))
      (Reflect/deleteProperty prototype "push") (put prototype :push method))))
   (JSON/stringify (js-array (Object/getOwnPropertyNames prototype) reads))))
 (export exercise map-copy recover this-argument captured-map prototype observe-method call-observed-method prototype-alias prototype-order flags-after-growth species-observation)`;
let directory, bytes, module, oracle, aliasOracle, growthOracle, thisArgOracle, capturedMapOracle, speciesOracle;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-array-index-storage-'));
  const b = await buildBackends({outputRoot: directory});
  const runtime = b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  const program = b.compiler.compile_ir_string(source, 'array-index-storage.eli');
  const reference = resolve(await realpath(directory), 'reference.mjs');
  await writeFile(reference, b.compiler.emit_ir_string(program));
  const child = spawnSync('node', ['--input-type=module', '-e',
    `const m=await import(process.argv[1]);
function isolated(body){const snapshots=[Array,Array.prototype].map(object=>[object,Object.getOwnPropertyDescriptors(object)]);try{return body();}finally{
for(const [object,saved]of snapshots){for(const key of Reflect.ownKeys(object))if(!Object.hasOwn(saved,key))delete object[key];
for(const key of Reflect.ownKeys(saved))Object.defineProperty(object,key,saved[key]);}}}
const exercise=Array.from({length:11},(_,i)=>m.exercise(i));
const thisArgs=Array.from({length:7},(_,i)=>m.this_argument(i));
const capturedMaps=[false,true].map(value=>m.captured_map(value));
const order=Array.from({length:4},(_,i)=>JSON.parse(isolated(()=>m.prototype_order(i))));
if(JSON.stringify(order[0])!==JSON.stringify(order[1])||JSON.stringify(order[0])!==JSON.stringify(order[2])||
JSON.stringify(order[3][0].slice(0,-1))!==JSON.stringify(order[0][0].filter(key=>key!=='push'))||
order[3][0].at(-1)!=='push'||order.some(record=>record[1]!==0))throw new Error('independent prototype order contract failed');
const aliases=Array.from({length:5},(_,i)=>isolated(()=>m.prototype_alias(i)));
const growth=m.flags_after_growth();
const species=Array.from({length:4},(_,i)=>isolated(()=>m.species_observation(i)));
process.stdout.write(JSON.stringify({exercise,aliases,growth,thisArgs,capturedMaps,species}));`,
    pathToFileURL(reference).href], {encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024});
  assert.equal(child.status, 0, child.stderr);
  const observations=JSON.parse(child.stdout);oracle=observations.exercise;aliasOracle=observations.aliases;growthOracle=observations.growth;
  thisArgOracle=observations.thisArgs;capturedMapOracle=observations.capturedMaps;
  speciesOracle=observations.species;
  const lowered = b.managed.lower_managed_program(program, runtime);
  for (const name of ['heap-new', 'heap-auto', 'heap-collect', 'heap-live', 'heap-collections', 'last-error',
    'value-array-new', 'value-number', 'value-get', 'frame-new', 'frame-set', 'frame-pop', 'frame-depth',
    'heap-source-array-prototype-index']) if (!lowered.typed.exports.includes(name)) lowered.typed.exports.push(name);
  const emitted = b.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 32});
  bytes = Uint8Array.from(b.wasm.append_metadata_section(emitted, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  module = new WebAssembly.Module(bytes);assert.deepEqual(WebAssembly.Module.imports(module), []);
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

function finish(a, values = []) {
  for (const value of values) a.release(value);
  a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);
}
function instance(options={}) {
  const a = instantiateManagedRuntime(bytes, {...options, initializeModule: false});
  a.auto(1);a.initializeModule();return a;
}

for(const [mode,scenario] of ['plain own slots','inherited getter','inherited setter on species result',
  'configurable accessor on species result','readonly species result','nonextensible species result',
  'frozen species result','readonly length','nonextensible existing slots','sealed species result',
  'inherited getter throwing false'].entries())
test('Array internal data creation preserves '+scenario+' and exact first effects', () => {
    const a = instance(), input = a.number(mode), zero = a.number(-0), frame = a.frame(1);
    a.frameSet(frame, 0, zero);
    let result;
    try {
      result = a.invoke('exercise', [input]);assert.equal(a.readString(result), oracle[mode], 'mode ' + mode);
      assert.equal(a.stats().frameDepth, 1);
      const saved = a.frameGet(frame, 0);
      try {assert(Object.is(a.readNumber(saved), -0));} finally {a.release(saved);}
      const recovered = a.invoke('recover');
      try {
        const value = a.get(recovered, 0);
        try {assert(Object.is(a.readNumber(value), -0));} finally {a.release(value);}
      } finally {a.release(recovered);}
    } finally {a.leaveFrame(frame);finish(a, [input, zero, result]);}
});

test('plain mapped values remain independent and collectible under per-allocation GC', () => {
  const a = instance(), negativeZero = a.number(-0), frame = a.frame(1);
  a.frameSet(frame, 0, negativeZero);
  const input = a.sourceArray(Array(96).fill(negativeZero));
  try {
    for (let round = 0; round < 8; round++) {
      const out = a.invoke('map-copy', [input]);
      try {
        assert.equal(a.length(out), 96);assert.equal(a.keyEqual(out, input), false);
        for (let index = 0; index < 96; index++) {
          const value = a.get(out, index);
          try {assert(Object.is(a.readNumber(value), -0));} finally {a.release(value);}
        }
      } finally {a.release(out);}
      a.collect();assert.equal(a.stats().frameDepth, 1);
      const saved = a.frameGet(frame, 0);
      try {assert(Object.is(a.readNumber(saved), -0));} finally {a.release(saved);}
    }
  } finally {a.leaveFrame(frame);finish(a, [input, negativeZero]);}
});

test('captured Array callbacks receive the exact object nullish primitive and negative-zero thisArg under collection', () => {
  assert.equal(thisArgOracle.length,7);
  for(let mode=0;mode<thisArgOracle.length;mode++){
    assert.deepEqual(JSON.parse(thisArgOracle[mode]),[true,true,true,mode===4], 'independent thisArg mode '+mode);
    const a=instance(),input=a.number(mode),zero=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,zero);
    let out;
    try{
      out=a.invoke('this-argument',[input]);assert.equal(a.readString(out),thisArgOracle[mode],'thisArg mode '+mode);
      a.collect();assert.equal(a.stats().frameDepth,1);
      const saved=a.frameGet(frame,0);try{assert(Object.is(a.readNumber(saved),-0));}finally{a.release(saved);}
    }finally{a.leaveFrame(frame);finish(a,[input,zero,out]);}
  }
});

test('a callback replacing map cannot change the captured call and the next lookup observes the replacement after arguments', () => {
  assert.equal(capturedMapOracle.length,2);
  for(const [index,replaceWithFunction]of[false,true].entries()){
    assert.deepEqual(JSON.parse(capturedMapOracle[index]),[[0,1,2],
      ['argument',0,1,2,'later argument',...(replaceWithFunction?['replacement']:[])],
      replaceWithFunction?9:null,replaceWithFunction?false:'TypeError',true,true], 'independent captured map mode '+index);
    const a=instance(),zero=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,zero);
    let out,recovered;
    try{
      out=a.invoke('captured-map',[replaceWithFunction]);assert.equal(a.readString(out),capturedMapOracle[index]);
      assert.equal(a.stats().frameDepth,1);a.collect();
      const saved=a.frameGet(frame,0);try{assert(Object.is(a.readNumber(saved),-0));}finally{a.release(saved);}
      recovered=a.invoke('recover');const first=a.get(recovered,0);
      try{assert(Object.is(a.readNumber(first),-0));}finally{a.release(first);}
      assert.equal(a.stats().frameDepth,1);
    }finally{a.leaveFrame(frame);finish(a,[zero,out,recovered]);}
  }
});

for(let mode=0;mode<4;mode++)test('observed Array species preserves deletion override and getter effects through full reflection in mode '+mode,()=>{
  assert.deepEqual(JSON.parse(speciesOracle[mode]),[true,mode!==1,true,mode===1,mode===2,mode===3,mode===3?2:0,mode===1?-1:0]);
  const a=instance(),input=a.number(mode);let out;
  try{out=a.invoke('species-observation',[input]);assert.equal(a.readString(out),speciesOracle[mode]);}
  finally{finish(a,[input,out]);}
});

for(let mode=0;mode<5;mode++)test('lazy prototype iterator alias retains the original values identity in observation mode '+mode,()=>{
  const a=instance(),input=a.number(mode);let out;
  try{out=a.invoke('prototype-alias',[input]);assert.equal(a.readString(out),aliasOracle[mode]);}
  finally{finish(a,[input,out]);}
});

test('array backing growth preserves nonextensibility and rejects new indexed properties after length growth',()=>{
  const a=instance();let out;
  try{out=a.invoke('flags-after-growth');assert.equal(a.readString(out),growthOracle);}
  finally{finish(a,[out]);}
});

test('observing and redefining native members preserves the complete represented key order while delete and readd moves the key',()=>{
  const observations=[];
  for(let mode=0;mode<4;mode++){
    const a=instance(),input=a.number(mode);let out;
    try{out=a.invoke('prototype-order',[input]);observations.push(JSON.parse(a.readString(out)));}
    finally{finish(a,[input,out]);}
  }
  assert.deepEqual(observations[1],observations[0]);assert.deepEqual(observations[2],observations[0]);
  assert.deepEqual(observations[3][0].slice(0,-1),observations[0][0].filter(key=>key!=='push'));
  assert.equal(observations[3][0].at(-1),'push');
  for(const record of observations)assert.equal(record[1],0,'own key enumeration must not invoke the replacement getter');
});

for(const maxSlots of[64,256])test('failed first native member materialization recovers in the original '+maxSlots+' slot budget',()=>{
  const a=instance({maxSlots,initialBytes:16384,maxBytes:65536}),prototype=a.invoke('prototype'),caller=a.frame(1);
  a.frameSet(caller,0,prototype);const padding=[];let exhausted=false,method,out;
  try{
    try{for(let index=0;index<maxSlots*2;index++)padding.push(a.number(index));}
    catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');exhausted=true;}
    assert(exhausted);
    assert.throws(()=>a.invoke('observe-method'),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
    assert.equal(a.stats().frameDepth,1);
    for(const value of padding)a.release(value);padding.length=0;a.collect();
    method=a.invoke('observe-method');assert.equal(method.kind,18);
    out=invokeWithHeapDiagnostic(a,'call-observed-method');assert(Object.is(a.readNumber(out),-0));
    assert.equal(a.stats().frameDepth,1);
  }finally{
    for(const value of padding)a.release(value);
    a.leaveFrame(caller);finish(a,[prototype,method,out]);
  }
});

test('ordinary indexed storage does not consume one permanent descriptor handle per element', () => {
  const r = new WebAssembly.Instance(module).exports, heap = r['heap-new'](64, 4096, 32768);
  assert.notEqual(heap, 0);r['heap-auto'](heap, 1);
  const frame = r['frame-new'](heap, 2), array = r['value-array-new'](heap, 256);
  assert.notEqual(frame, 0);assert.notEqual(array, 0);r['frame-set'](heap, frame, 0, array);
  const bits = new DataView(new ArrayBuffer(8));
  for (let index = 0; index < 256; index++) {
    bits.setFloat64(0, index, true);
    const number = r['value-number'](heap, bits.getUint32(0, true), bits.getUint32(4, true));
    assert.notEqual(number, 0);r['frame-set'](heap, frame, 1, number);
    assert.equal(r['heap-source-array-prototype-index'](heap, array, number, 4, index % 2 ? 1 : 2), 2);
    assert.equal(r['last-error'](), 0);
    assert.equal(r['heap-source-array-prototype-index'](heap, array, number, 1, 0), 2);
    assert.equal(r['heap-source-array-prototype-index'](heap, array, number, 0, 0), index % 2 ? 1 : 2);
    // The frame, the array and the current numeric key are the entire live
    // graph; ordinary indexed values require no persistent descriptor record.
    r['heap-collect'](heap);assert.equal(r['heap-live'](heap), 3);
  }
  for (let index = 0; index < 256; index++) assert.equal(r['value-get'](heap, array, index), index % 2 ? 1 : 2);
  assert(r['heap-collections'](heap) >= 256);assert.equal(r['frame-depth'](heap), 1);
  r['frame-pop'](heap, frame);r['heap-collect'](heap);
  assert.equal(r['heap-live'](heap), 0);assert.equal(r['frame-depth'](heap), 0);
});
