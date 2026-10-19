import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildBackends,root} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {sharedRealmDeclarations, assertSharedRealmOutlining, exerciseSharedRealm} from './helpers/shared-realm-initialization.mjs';

let directory,backend,runtime,runtimeSource,serial=0;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-initializer-outlining-'));
 backend=await buildBackends({outputRoot:directory});
 runtimeSource=await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8');
 runtime=backend.compiler.compile_ir_string(runtimeSource,'runtime.eli');
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

const resources={maxSlots:2048,initialBytes:65536,maxBytes:1048576,initializeModule:false};
const partPrefix='__eliscript_module_part_';
function nodes(body){
 const found=[],pending=[body];
 while(pending.length){const node=pending.pop();found.push(node);for(let index=node.children.length-1;index>=0;index--)pending.push(node.children[index]);}
 return found;
}
function lower(source,rt=runtime){
 const program=backend.compiler.compile_ir_string(source,'outlined-initializers.eli'),saved=JSON.stringify(program);
 const result=backend.managed.lower_managed_program(program,rt);
 assert.equal(JSON.stringify(program),saved,'outlining must not mutate caller-owned source IR');
 assert.equal(result.descriptor.project,undefined,'ordinary initialization does not create an ESM project');
 return result;
}
function bytes(lowered){
 const output=Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed),
  'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(output)),[]);
 return output;
}
function instance(lowered,options={}){return instantiateManagedRuntime(bytes(lowered),{...resources,...options});}
function number(a,name,args=[]){const value=a.invoke(name,args);try{return a.readNumber(value);}finally{a.release(value);}}
function arrayNumbers(a,value){
 return Array.from({length:a.length(value)},(_,index)=>{const item=a.get(value,index);try{return a.readNumber(item);}finally{a.release(item);}});
}
function finish(a,values=[]){
 for(const value of values)a.release(value);
 a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
}
async function linked(sources,entry='main.mjs'){
 const base=resolve(directory,'reference-'+serial++),modules=[];
 for(const[id,source]of Object.entries(sources)){
  const program=backend.compiler.compile_ir_string(source,id.replace(/\.mjs$/,'.eli'));
  modules.push({id,program});const filename=resolve(base,id);await mkdir(dirname(filename),{recursive:true});
  await writeFile(filename,backend.compiler.emit_ir_string(program));
 }
 const saved=JSON.stringify(modules),lowered=backend.managed.lower_managed_project(modules,entry,runtime);
 assert.equal(JSON.stringify(modules),saved);assert.equal(lowered.descriptor.project,undefined);
 return{lowered,reference:()=>import(pathToFileURL(resolve(base,entry)).href)};
}

test('ordinary initialization outlines each source initializer once and keeps the coordinator independent of literal width and count',()=>{
 function shape(count,width){
  const source=Array.from({length:count},(_,index)=>'(defconst value-'+index+' (js-array '+
   Array.from({length:width},(_,item)=>String(item)).join(' ')+'))').join('\n')+
   '\n(defun read () value-0) (export read)';
  const lowered=lower(source),functions=lowered.typed.functions;
  const parts=functions.filter(fn=>fn.name.startsWith(partPrefix)),coordinator=functions.find(fn=>fn.name==='__eliscript_module_body');
  assert(coordinator);assert.equal(parts.length,count);
  assert.deepEqual(parts.map(fn=>fn.name),Array.from({length:count},(_,index)=>partPrefix+index));
  const targets=new Set(parts.map(fn=>fn.index)),calls=nodes(coordinator.body).filter(node=>node.kind==='call'&&targets.has(node.value));
  assert.deepEqual(calls.map(node=>node.value),parts.map(fn=>fn.index),'only the original source order drives the calls');
  const moduleInit=functions.find(fn=>fn.name==='value-module-init');assert(moduleInit);
  assert.equal(nodes(coordinator.body).filter(node=>node.kind==='call'&&node.value===moduleInit.index).length,0,
   'the coordinator must not retain a duplicate complete initializer body');
  for(const part of parts)assert.equal(nodes(part.body).filter(node=>node.kind==='call'&&node.value===moduleInit.index).length,1);
  assert.equal(lowered.descriptor.module.functionCount,1,'private parts do not become source function slots');
  assert.deepEqual(lowered.descriptor.functions.map(fn=>fn.name),['read']);
  assert(!lowered.typed.aliases.some(alias=>alias.name.startsWith(partPrefix)),'parts are not public exports');
  assert(functions.every(fn=>!Object.hasOwn(fn,'initializerParts')&&!Object.hasOwn(fn,'localStorageSequence')));
  return{coordinatorLocals:coordinator.locals.length,partLocals:Math.max(...parts.map(fn=>fn.locals.length)),lowered};
 }
 const scalar=shape(1,1),wide=shape(1,32),many=shape(48,32);
 assert.equal(scalar.coordinatorLocals,wide.coordinatorLocals);
 assert.equal(wide.coordinatorLocals,many.coordinatorLocals);
 assert.equal(wide.partLocals,many.partLocals,'the widest single initializer bounds each private local bank');
 const a=instance(many.lowered);a.auto(1);
 try{a.initializeModule();const value=a.invoke('read');try{assert.deepEqual(arrayNumbers(a,value),Array.from({length:32},(_,index)=>index));}finally{a.release(value);}}
 finally{finish(a);}
},120000);

test('outlined standalone initializers preserve later declarations closures source function identity negative zero and caller roots',()=>{
 const lowered=lower(`(defvar order 0)
  (defconst first (mark 1)) (defconst second (mark 2)) (mark 3)
  (defconst zero -0.0)
  (defconst pair (let ((value 0)) (js-array (lambda () (setq value (1+ value))) (lambda () value))))
  (defun mark (value) (setq order (+ (* order 10) value)))
  (defun current () (js-array first second order zero))
  (defun advance () (funcall (get pair 0))) (defun captured () (funcall (get pair 1)))
  (defun identity () mark) (export mark current advance captured identity)`);
 const a=instance(lowered);a.auto(1);const held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 try{
  a.initializeModule();a.initializeModule();
  const values=a.invoke('current'),expected=[1,12,123,-0];
  try{assert.deepEqual(arrayNumbers(a,values),expected);}finally{a.release(values);}
  const direct=a.getExport('mark'),indirect=a.invoke('identity');
  try{assert(a.keyEqual(direct,indirect));}finally{a.release(direct);a.release(indirect);}
  for(let index=1;index<=12;index++){
   assert.equal(number(a,'advance'),index);a.collect();assert.equal(number(a,'captured'),index);
   a.initializeModule();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));
  }
  const saved=a.frameGet(caller,0);try{assert(Object.is(a.readNumber(saved),-0));}finally{a.release(saved);}
 }finally{a.leaveFrame(caller);finish(a,[held]);}
});

test('outlined linked modules retain diamond source order live namespaces and shared function identity without host imports',async()=>{
 const p=await linked({
  'main.mjs':'(import "./left.mjs" left) (import "./right.mjs" right) (import "./state.mjs" :as state) (import "./state.mjs" :as again) (state/mark 3) (defun sum () (+ left right)) (defun advance () (state/mark 4)) (defun identity () (= (get state :mark) (get again :mark))) (export state again sum advance identity)',
  'right.mjs':'(import "./state.mjs" mark) (mark 2) (defconst right 22) (export right)',
  'left.mjs':'(import "./state.mjs" mark) (mark 1) (defconst left 11) (export left)',
  'state.mjs':'(defvar order 0) (defun mark (value) (setq order (+ (* order 10) value))) (export order mark)',
 });
 const reference=await p.reference(),a=instance(p.lowered);a.auto(1);
 try{
  a.initializeModule();a.initializeModule();assert.equal(number(a,'sum'),reference.sum());assert.equal(a.invoke('identity'),true);
  const state=a.getExport('state'),again=a.getExport('again'),key=a.string('order');
  try{
   assert(a.keyEqual(state,again));const before=a.objectGet(state,key);
   try{assert.equal(a.readNumber(before),123);}finally{a.release(before);}
   assert.equal(number(a,'advance'),reference.advance());a.collect();a.initializeModule();
   const after=a.objectGet(again,key);try{assert.equal(a.readNumber(after),reference.state.order);}finally{a.release(after);}
  }finally{a.release(state);a.release(again);a.release(key);}
 }finally{finish(a);}
});

test('outlined cyclic modules retain hoisted functions while early lexical reads fail and remain cached',async()=>{
 const success=await linked({
  'main.mjs':'(import "./other.mjs" read-other) (defconst value (+ (read-other) 1)) (defun read () value) (export read)',
  'other.mjs':'(import "./main.mjs" read) (defconst value 7) (defun read-other () value) (export read-other)',
 });
 const reference=await success.reference(),a=instance(success.lowered);a.auto(1);
 try{a.initializeModule();assert.equal(number(a,'read'),reference.read());}finally{finish(a);}
 const failure=await linked({
  'main.mjs':'(import "./other.mjs" other) (defconst value other) (defun read () value) (export read)',
  'other.mjs':'(import "./main.mjs" read) (defconst other (read)) (export other)',
 });
 await assert.rejects(failure.reference(),ReferenceError);
 const failed=instance(failure.lowered);failed.auto(1);const keep=failed.number(-0),frame=failed.frame(1);failed.frameSet(frame,0,keep);
 try{
  for(let round=0;round<3;round++){
   assert.throws(()=>failed.initializeModule(),error=>error.eliscriptDiagnostic?.code==='ELI-RT0008');
   failed.collect();assert.equal(failed.stats().frameDepth,1);assert.equal(failed.live(),2);assert(Object.is(failed.readNumber(keep),-0));
  }
 }finally{failed.leaveFrame(frame);finish(failed,[keep]);}
});

test('an outlined failure stops subsequent initializer calls and repeated initialization preserves the original thrown source value',()=>{
 const lowered=lower('(defconst before (js-array 1 2)) (defconst failed (throw "first failure")) (defconst after (false)) (export before)');
 // If the coordinator reaches the later part, this real machine trap cannot
 // be masked by capture-error. It also proves that later calls are guarded.
 const later=lowered.typed.functions.find(fn=>fn.name===partPrefix+'2');assert(later);
 later.body={kind:'memory-op',type:'u32',value:'load-u32',children:[{kind:'literal',type:'u32',value:4294967295,children:[]}]};
 const a=instance(lowered);a.auto(1);const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);const failures=[];
 try{
  for(let round=0;round<3;round++){
   let threw=false;
   try{a.initializeModule();}catch(error){threw=true;failures.push(error);assert.equal(a.readString(error),'first failure');}
   assert(threw);if(round)assert(a.keyEqual(failures[0],failures[round]));
   a.collect();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(keep),-0));
  }
 }finally{a.leaveFrame(frame);finish(a,[keep,...failures]);}
});

test('capacity failure inside an outlined initializer discards partial globals without retaining roots or reentering later parts',()=>{
 const lowered=lower('(defconst before (js-array 1 2)) (defconst oversized (js-call "x" :repeat 100000)) (defconst after 9) (export before after)');
 // heap-new reserves 24 bytes per slot plus its sentinel and 32-byte margin:
 // 128 slots fit in the original 4096-byte initial pool (3128 bytes).
 const a=instance(lowered,{maxSlots:128,initialBytes:4096,maxBytes:16384});a.auto(1);
 const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
 try{
  for(let round=0;round<3;round++){
   assert.throws(()=>a.initializeModule(),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
   a.collect();assert.equal(a.stats().frameDepth,1);assert.equal(a.live(),2);assert(Object.is(a.readNumber(keep),-0));
  }
  assert.throws(()=>a.getExport('after'),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');
 }finally{a.leaveFrame(frame);finish(a,[keep]);}
});

const coldArraySource = `(defconst marker 1) (defconst spare 2)
 (defun cold-host (array)
  (let* ((method (get array (js* "Symbol.iterator"))) (iterator (js-call method :call array))
         (first (js-call iterator :next)) (second (js-call iterator :next)) (last (js-call iterator :next)))
   (js-array (get first :value) (get first :done) (get second :value) (get second :done) (get last :done))))
 (defun cold-literal () (cold-host (js-array -0.0 7)))
 (defun cold-own () (let* ((array (js-array)) (replacement (lambda () 9)))
  (put array (js* "Symbol.iterator") replacement) (eq (get array (js* "Symbol.iterator")) replacement)))
 (defun cold-own-delete () (let* ((array (js-array -0.0 7)) (replacement (lambda () 9)))
  (put array (js* "Symbol.iterator") replacement)
  (let ((same (eq (get array (js* "Symbol.iterator")) replacement)))
   (Reflect/deleteProperty array (js* "Symbol.iterator")) (js-array same (cold-host array)))))
 (defun cold-null () (let ((array (js-array)))
  (Object/setPrototypeOf array nil) (js-array (get array (js* "Symbol.iterator")) (get array :map))))
 (defun cold-custom () (let ((array (js-array)) (prototype (js-object)))
  (put prototype (js* "Symbol.iterator") 9) (Object/setPrototypeOf array prototype)
  (js-array (get array (js* "Symbol.iterator")) (get array :map))))
 (defun cold-delete () (let* ((array (js-array)) (method (get array (js* "Symbol.iterator")))
  (prototype (Object/getPrototypeOf array)) (descriptor (Object/getOwnPropertyDescriptor prototype (js* "Symbol.iterator"))))
  (try (Reflect/deleteProperty prototype (js* "Symbol.iterator"))
   (js-array (eq (get array (js* "Symbol.iterator")) undefined) (eq (get prototype (js* "Symbol.iterator")) undefined))
   (finally (Object/defineProperty prototype (js* "Symbol.iterator") descriptor)))))
 (defun cold-key-error (trace) (let* ((array (js-array))
  (key (js-object :toString (lambda () (put trace 0 1) (throw false)))))
  (get array key) (put trace 0 2)))
 (defun cold-key-primitive-error (trace) (let ((array (js-array)) (key (js-object)))
  (put key (js* "Symbol.toPrimitive") (lambda () (put trace 0 1) (throw false)))
  (get array key) (put trace 0 2)))
 (defun cold-boxed (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))
     (Object/is (get boxed :valueOf) (get (get constructor :prototype) :valueOf))
     (Object/is (js-call boxed :valueOf) value)))))
 (defun cold-boxed-symbol (brand object-first)
  (cold-boxed (funcall globalThis/Symbol "cold") brand object-first))
 (defun cold-boxed-length (value)
  (get (funcall globalThis/Object value) :length))
 (defun cold-boxed-slice (value)
  (let ((method (get (js-array) :slice)) (boxed (funcall globalThis/Object value)))
   (js-call method :call boxed)))
 (defun cold-boxed-first (value object-first)
  (let ((method (get (js-array) :slice)))
   (if object-first (funcall globalThis/Object value) (js-call method :call value)) 1))
 (defun cold-boxed-pair (value object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value)))) 2))
 (defun cold-boxed-proto (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))))))
 (defun cold-boxed-valueof-read (value brand object-first)
  (let ((method (get (js-array) :slice)) (copied nil) (boxed nil))
   (if object-first
    (progn (setq boxed (funcall globalThis/Object value)) (setq copied (js-call method :call value)))
    (progn (setq copied (js-call method :call value)) (setq boxed (funcall globalThis/Object value))))
   (let ((constructor (cond ((= brand 0) globalThis/Number) ((= brand 1) globalThis/String)
      ((= brand 2) globalThis/Boolean) ((= brand 3) globalThis/Symbol) (t globalThis/BigInt))))
    (js-array (js-length copied) (Object/is (get boxed :constructor) constructor)
     (Object/is (Object/getPrototypeOf boxed) (get constructor :prototype))
     (Object/is (get boxed :valueOf) (get (get constructor :prototype) :valueOf))))))
 (defun cold-boxed-symbol-stage (brand object-first stage)
  (let ((value (funcall globalThis/Symbol "cold")))
   (cond ((= stage 0) (cold-boxed-first value object-first))
    ((= stage 1) (cold-boxed-pair value object-first))
    ((= stage 2) (cold-boxed-proto value brand object-first))
    (t (cold-boxed-valueof-read value brand object-first)))))
 (defun cold-recover (value) (+ value marker))
 (defun argv-lifetime (value)
  (let* ((identity (lambda (entry) entry))
         (capture (funcall (lambda (entry) (lambda () entry)) value))
         (rest (funcall (lambda (&rest entries) entries) value))
         (applied (js-call identity :apply nil (js-array value)))
         (caught (try (funcall (lambda (entry) (throw false)) value)
                   (catch failure (if (eq failure false) value (throw failure))))))
   (js-array (eq (funcall identity value) value) (eq (funcall capture) value)
     (eq (aref rest 0) value) (eq applied value) (eq caught value))))
 (export cold-host cold-literal cold-own cold-own-delete cold-null cold-custom cold-delete cold-key-error cold-key-primitive-error cold-boxed cold-boxed-symbol cold-boxed-length cold-boxed-slice cold-boxed-first cold-boxed-pair cold-boxed-proto cold-boxed-valueof-read cold-boxed-symbol-stage cold-recover argv-lifetime)`;

function readColdArrayValue(a, value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.kind === 4) return a.readNumber(value);
  assert.equal(value.kind, 14);
  return Array.from({length: a.length(value)}, (_, index) => {
    const child = a.get(value, index);
    try {return readColdArrayValue(a, child);} finally {a.release(child);}
  });
}
function checkColdArray(a, reference, name, runtime = 'wasm') {
  a.auto(1);a.initializeModule();
  const keep = a.number(-0), caller = a.frame(1), held = [keep];a.frameSet(caller, 0, keep);
  try {
    if (name.startsWith('cold-boxed-')) {
      const [base, phase] = name.split(':'), [, , label, first] = base.split('-');
      const labels = ['number', 'string', 'boolean', 'symbol', 'bigint'];
      const phases = ['first', 'pair', 'proto', 'valueof-read'], phaseIndex = phases.indexOf(phase);
      const brand = a.number(labels.indexOf(label)), objectFirst = first === 'object';held.push(brand);
      const expectedInput = label === 'number' ? -0 : label === 'string' ? 'ab' : label === 'boolean' ? false : 1n;
      const input = label === 'number' ? keep : label === 'string' ? a.string(expectedInput)
        : label === 'boolean' ? false : label === 'bigint' ? a.bigint(expectedInput) : undefined;
      if (input !== keep) held.push(input);
      if (label === 'bigint') {assert.equal(input?.kind,34,'BigInt input must be an actual managed primitive');assert.equal(a.readBigInt(input),expectedInput);}
      const operation = phase ? `cold-boxed-${phase}` : 'cold-boxed';
      const boxedPrefix = phase === 'length' || phase === 'slice';
      const ordinary = boxedPrefix ? [expectedInput] : phaseIndex === 0 || phaseIndex === 1 ? [expectedInput, objectFirst]
        : [expectedInput, labels.indexOf(label), objectFirst];
      const expected = label === 'symbol' ? (phase ? reference.cold_boxed_symbol_stage(3, objectFirst, phaseIndex)
        : reference.cold_boxed_symbol(3, objectFirst)) : reference[operation.replaceAll('-', '_')](...ordinary);
      const complete = [label === 'string' ? 2 : 0, true, true, true, true];
      assert.deepEqual(expected, phase === 'length' ? undefined : phase === 'slice' ? [] : phaseIndex === 0 ? 1 : phaseIndex === 1 ? 2
        : phaseIndex === 2 ? complete.slice(0, 3) : phaseIndex === 3 ? complete.slice(0, 4) : complete);
      const stage = phase ? a.number(phaseIndex) : undefined;if (phase) held.push(stage);
      const result = label === 'symbol' ? a.invoke(phase ? 'cold-boxed-symbol-stage' : 'cold-boxed-symbol', phase ? [brand, objectFirst, stage] : [brand, objectFirst])
        : a.invoke(operation, boxedPrefix ? [input] : phaseIndex === 0 || phaseIndex === 1 ? [input, objectFirst] : [input, brand, objectFirst]);held.push(result);
      assert.deepEqual(readColdArrayValue(a, result), expected);a.collect();
    } else if (name === 'cold-key-error' || name === 'cold-key-primitive-error') {
      const zero = a.number(0), trace = a.sourceArray([zero]);held.push(zero, trace);
      const expected = [0];let expectedThrew = false, actualThrew = false;
      try {reference[name.replaceAll('-', '_')](expected);} catch (error) {expectedThrew = true;assert.strictEqual(error, false);}
      try {a.invoke(name, [trace]);} catch (error) {
        actualThrew = true;
        if (error !== false) {
          let observation;
          try {
            const first = a.get(trace, 0);
            try {observation = {length: a.length(trace), first: a.readNumber(first), frameDepth: a.stats().frameDepth};}
            finally {a.release(first);}
          } catch (inspectionError) {observation = {unavailable: String(inspectionError)};}
          console.error('[cold-array-key-failure]', JSON.stringify({name, runtime, observation}));
        }
        assert.strictEqual(error, false);
      }
      assert(expectedThrew);assert(actualThrew);assert.deepEqual(expected, [1]);
      assert.deepEqual(readColdArrayValue(a, trace), expected);a.collect();
      const input = a.number(7);held.push(input);
      assert.equal(number(a, 'cold-recover', [input]), reference.cold_recover(7));
    } else {
      const args = [];
      if (name === 'cold-host' || name === 'argv-lifetime') {const seven = a.number(7), input = a.sourceArray([keep, seven]);held.push(seven, input);args.push(input);}
      const expected = reference[name.replaceAll('-', '_')](...(['cold-host', 'argv-lifetime'].includes(name) ? [[-0, 7]] : []));
      const result = a.invoke(name, args);held.push(result);
      assert.deepEqual(readColdArrayValue(a, result), expected);a.collect();
    }
    assert.equal(a.stats().frameDepth, 1);
    const saved = a.frameGet(caller, 0);try {assert(Object.is(a.readNumber(saved), -0));} finally {a.release(saved);}
  } catch (error) {
    console.error('[cold-array-case-failure]', JSON.stringify({name, runtime, stats: a.stats()}));throw error;
  } finally {a.leaveFrame(caller);for (const value of held) a.release(value);}
}

test('cold literal and host Arrays acquire native methods lazily and preserve overrides chains deletion and key conversion errors', async () => {
 const lowered=lower(coldArraySource),image=bytes(lowered);
 const original=backend.compiler.compile_ir_string(coldArraySource,'cold-array-reference.eli');
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(original)).toString('base64'));
 assert.deepEqual(reference.cold_literal(),[-0,false,7,false,true]);
 const boxed=['number','string','boolean','symbol','bigint'].flatMap(brand=>['array','object'].flatMap(first=>{
  const name=`cold-boxed-${brand}-${first}`;
  const phases=['first','pair','proto','valueof-read'].concat(brand==='bigint'?['length','slice']:[]);
  return phases.map(phase=>`${name}:${phase}`).concat(name);
 }));
 const failures=[],failedCases=[];
 for(const name of ['cold-literal','cold-host','cold-own','cold-own-delete','cold-null','cold-custom','cold-delete','argv-lifetime',...boxed,'cold-key-primitive-error','cold-key-error']){
  const configuration=['cold-own','cold-key-error','cold-key-primitive-error'].includes(name)
   ? {...resources,maxSlots:64,initialBytes:4096,maxBytes:16384}
   : {...resources,maxSlots:1024,initialBytes:65536};
  const a=instantiateManagedRuntime(image,configuration);
  try{checkColdArray(a,reference,name);}
  catch(error){failures.push(error);failedCases.push(name);}
  finally{finish(a);}
 }
 if(failures.length)throw new AggregateError(failures,`cold Array failures: ${failedCases.join(', ')}`);
});


test('an actual trap inside an outlined initializer unwinds its private frames and retains the caller negative zero',()=>{
 const start=runtimeSource.indexOf('  (defun value-module-init (heap index value)'),end=runtimeSource.indexOf('  (defun ',start+10);
 assert(start>=0&&end>start);
 const faulty=runtimeSource.slice(0,start)+'  (defun value-module-init (heap index value) (load-u32 4294967295))\n'+runtimeSource.slice(end);
 const rt=backend.compiler.compile_ir_string(faulty,'outlined-trap-runtime.eli');
 const a=instance(lower('(defconst first (js-array 1 2)) (defconst second 7) (export first second)',rt));a.auto(1);
 const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
 try{
  assert.throws(()=>a.initializeModule(),WebAssembly.RuntimeError);a.collect();assert.equal(a.stats().frameDepth,1);assert.equal(a.live(),2);
  const saved=a.frameGet(frame,0);try{assert(Object.is(a.readNumber(saved),-0));}finally{a.release(saved);}
  assert.throws(()=>a.initializeModule(),error=>error.eliscriptDiagnostic?.code==='ELI-RT0003');
 }finally{a.leaveFrame(frame);finish(a,[keep]);}
});

function assertArrayRegistrationAdvances(){
 const declarations=runtime.body.flatMap(node=>nodes(node));
 const register=declarations.find(node=>node.kind==='function-declaration'&&node.value==='value-array-prototype-register');
 assert(register,'the actual compiled runtime must contain Array prototype registration');
 const body=nodes(register),updates=body.filter(node=>node.kind==='assignment-pair'&&node.value==='index');
 assert.equal(updates.length,1,'registration has one advancement of its method index');
 const loops=body.filter(node=>node.kind==='loop'&&nodes(node.children[0]).some(child=>child.kind==='reference'&&child.value==='index')&&
  nodes(node.children[0]).some(child=>child.kind==='literal'&&child.value===27));
 assert.equal(loops.length,1,'registration iterates over the actual 27-method table');
 assert(loops[0].children.slice(1).some(child=>nodes(child).includes(updates[0])),
  'the method index assignment must execute inside the registration loop body, before its backedge');
}

test('the actual runtime IR advances Array prototype registration inside its genuine loop body',()=>{
 assertArrayRegistrationAdvances();
});

test('a top-level Array constructor acquisition completes all 27 registrations and preserves descriptors symbols cache identity and GC roots',async()=>{
 // Keep this check local as well: selecting only this execution case on the
 // broken runtime must fail before entering the nonterminating first method.
 assertArrayRegistrationAdvances();
 const methods=[['push',1],['pop',0],['slice',2],['map',1],['filter',1],['forEach',1],['some',1],['every',1],
  ['find',1],['findIndex',1],['findLast',1],['findLastIndex',1],['reduce',1],['reduceRight',1],['sort',1],['toSorted',1],
  ['splice',2],['join',1],['toString',0],['concat',1],['includes',1],['indexOf',1],['lastIndexOf',1],
  ['entries',0],['keys',0],['values',0],['at',1]];
 const rows=methods.map(([name])=>`(let* ((method (get array-prototype ${JSON.stringify(name)}))
    (descriptor (Object/getOwnPropertyDescriptor array-prototype ${JSON.stringify(name)})))
   (js-array (value-type method) (get method :name) (get method :length)
    (Object/is method (get descriptor :value)) (get descriptor :writable)
    (get descriptor :enumerable) (get descriptor :configurable)))`).join('\n');
 const source=`(defconst array-constructor globalThis/Array)
  (defconst array-prototype (get array-constructor :prototype))
  (defconst original-map (get array-prototype :map))
  (defconst original-values (get array-prototype :values))
  (defconst iterator-symbol (get globalThis/Symbol :iterator))
  (defun methods () (JSON/stringify (js-array ${rows})))
  (defun relationships ()
   (let ((constructor-descriptor (Object/getOwnPropertyDescriptor array-prototype "constructor"))
         (iterator-descriptor (Object/getOwnPropertyDescriptor array-prototype iterator-symbol)))
    (JSON/stringify (js-array
     (Object/is array-constructor globalThis/Array)
     (Object/is array-prototype (get globalThis/Array :prototype))
     (Object/is (get array-prototype :constructor) array-constructor)
     (Object/is (get array-prototype iterator-symbol) original-values)
     (Object/is (get array-prototype :map) original-map)
     (get constructor-descriptor :writable) (get constructor-descriptor :enumerable) (get constructor-descriptor :configurable)
     (get iterator-descriptor :writable) (get iterator-descriptor :enumerable) (get iterator-descriptor :configurable)))))
  (defun cached-registration ()
   (let ((replacement (lambda () 9)))
    (try (put array-prototype :map replacement)
     (let ((again (get globalThis/Array :prototype)))
      (JSON/stringify (js-array (Object/is again array-prototype)
       (Object/is (get again :map) replacement) (Object/is (get again :values) original-values))))
     (finally (put array-prototype :map original-map)))))
  (defun borrowed ()
   (let ((items (funcall array-constructor -0.0 9)))
    (js-call (get array-prototype :push) :call items 7)
    (JSON/stringify (js-array
     (Object/is (js-call (get array-prototype :pop) :call items) 7)
     (Object/is (get items 0) -0.0)))))
  ${sharedRealmDeclarations}
  (export methods relationships cached-registration borrowed realm-read realm-shared-observation realm-clean realm-first-error)`;
 const lowered=lower(source);assertSharedRealmOutlining(lowered);
 const original=backend.compiler.compile_ir_string(source,'shared-realm-reference.eli');
 const reference=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(original)).toString('base64'));
 const a=instance(lowered);a.auto(1);const keep=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,keep);
 function report(name){const result=a.invoke(name);try{return JSON.parse(a.readString(result));}finally{a.release(result);}}
 try{
  a.initializeModule();
  for(let round=0;round<3;round++){
   assert.deepEqual(report('methods'),methods.map(([name,length])=>['function',name,length,true,true,false,true]));
   assert.deepEqual(report('relationships'),[true,true,true,true,true,true,false,true,true,false,true]);
   assert.deepEqual(report('cached-registration'),[true,true,true]);
   assert.deepEqual(report('borrowed'),[true,true]);
   a.collect();a.initializeModule();assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(keep),-0));
  }
  exerciseSharedRealm(a,reference);
 }finally{a.leaveFrame(frame);finish(a,[keep]);}
});
