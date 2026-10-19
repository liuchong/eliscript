import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {setup,teardown,directory,backend,runtime,modules,reader,reference,analyzerFailure,transientFailure,artifact,decode,property,finish,analyzeObserved,expectedAnalysis} from './wasm-compiler-analyzer-rig.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const originalAnalyzerFailure=diagnostic=>{const p=diagnostic.location.start;const error=new Error(`${diagnostic.location.file}:${p.line}:${p.column}: ${diagnostic.message}`);error.eliscriptDiagnostic=diagnostic;throw error;};
const originalTransientFailure=(filename,span,message)=>{const file=filename||span?.filename||'<input>';const start=span?{offset:span.start,line:span.line,column:span.column}:{offset:0,line:1,column:1};const end=span?{offset:span.end,line:span.endLine,column:span.endColumn}:{offset:0,line:1,column:1};const diagnostic={format:'eliscript-diagnostic',version:1,code:'ELI-A0001',severity:'error',phase:'analysis',message,location:{file,start,end}};const error=new Error(`${file}:${start.line}:${start.column}: ${message}`);error.eliscriptDiagnostic=diagnostic;throw error;};
beforeAll(setup,120000);
afterAll(teardown);





const valid=['','nil t false undefined','(defun f (x) (+ x 1)) (export f)','(defconst answer 42) (defun f () answer)','(defun f (x) (let ((y x)) (lambda () y)))','(defun f (x) (try (throw x) (catch error error)))'];
test('complete analyzer transient-analysis symbol reader and syntax modules compile and execute actual public analysis in zero-import WASM',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 for(const source of valid){const input=a.string(source),file=a.string('analysis😀.eli'),forms=a.invoke('read_string',[input,file]),before=decode(a,forms),expected=reader.read_string(source,'analysis😀.eli');assert.equal(reference.analyze_module(expected,'analysis😀.eli'),expected);const out=a.invoke('analyze_module',[forms,file]);assert(a.keyEqual(out,forms));assert.deepEqual(decode(a,out),expected);assert.deepEqual(decode(a,forms),before);for(const root of[input,file,forms,out])a.release(root);a.collect();assert.equal(a.stats().frameDepth,0);}finish(a);
});
test('whole analyzer preserves exact lexical binding and source-location diagnostics and recovers for subsequent valid analysis',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 for(const source of['missing','(defun f (x x) x)','(defconst x 1) (setq x 2)','(defun f () (recur 1))','(defun f () y)','(defun nil () 1)']){const file=a.string('bad😀.eli'),text=a.string(source),forms=a.invoke('read_string',[text,file]);let expected;try{reference.analyze_module(reader.read_string(source,'bad😀.eli'),'bad😀.eli');assert.fail('expected analysis error');}catch(error){expected=error;}let failure;try{a.invoke('analyze_module',[forms,file]);assert.fail('expected WASM analysis error');}catch(error){failure=error;}assert(failure?.kind,source);const message=property(a,failure,'message'),diagnostic=property(a,failure,'eliscriptDiagnostic');assert.equal(a.readString(message),expected.message);assert.deepEqual(decode(a,diagnostic),expected.eliscriptDiagnostic);for(const root of[file,text,forms,failure,message,diagnostic])a.release(root);a.collect();assert.equal(a.stats().frameDepth,0);}finish(a);
});

test('analyzer diagnostic migration preserves ordered getters precise template conversion and native arrow shape against its independent original oracle',()=>{
 const observe=(fn,mode)=>{const events=[],sentinel={},convert=(name,value)=>({[Symbol.toPrimitive](hint){events.push(name+':'+hint);if(mode==='throw-'+name)throw sentinel;return mode==='symbol-'+name?Symbol(name):value;}}),point={},location={},diagnostic={};for(const[name,value]of[['line',3],['column',4]])Object.defineProperty(point,name,{get(){events.push('read.'+name);return convert(name,value);}});Object.defineProperties(location,{start:{get(){events.push('read.start');return point;}},file:{get(){events.push('read.file');return convert('file','input.eli');}}});Object.defineProperties(diagnostic,{location:{get(){events.push('read.location');return location;}},message:{get(){events.push('read.message');return convert('message','bad');}}});let caught;try{fn(diagnostic);}catch(error){caught=error;}return{events,name:caught===sentinel?'sentinel':caught.constructor.name,message:caught.message,attached:caught.eliscriptDiagnostic===diagnostic};};
 assert.equal(analyzerFailure.length,1);assert.equal(Object.hasOwn(analyzerFailure,'prototype'),false);assert.throws(()=>Reflect.construct(String,[],analyzerFailure),TypeError);
 for(const mode of['normal',...['file','line','column','message'].flatMap(name=>['throw-'+name,'symbol-'+name])])assert.deepEqual(observe(analyzerFailure,mode),observe(originalAnalyzerFailure,mode),mode);
 for(const diagnostic of[null,undefined,{}, {location:null},{location:{start:null}}]){let left,right;try{analyzerFailure(diagnostic);}catch(error){left=error.constructor.name;}try{originalAnalyzerFailure(diagnostic);}catch(error){right=error.constructor.name;}assert.equal(left,right);}
});

test('transient diagnostics preserve native JS truth optional filename access field getter order string hints and abrupt exception identity',()=>{
 const observe=(fn,mode)=>{const events=[],sentinel={},span={},convert=(name,value)=>({[Symbol.toPrimitive](hint){events.push(name+':'+hint);if(mode==='convert-'+name)throw sentinel;return mode==='symbol-'+name?Symbol(name):value;}});for(const[name,value]of[['filename','input.eli'],['start',1],['line',2],['column',3],['end',4],['endLine',5],['endColumn',6]])Object.defineProperty(span,name,{get(){events.push('read.'+name);if(mode==='read-'+name)throw sentinel;return ['filename','line','column'].includes(name)?convert(name,value):value;}});let caught;try{fn(false,span,convert('message','bad'));}catch(error){caught=error;}return{events,name:caught===sentinel?'sentinel':caught.constructor.name,message:caught.message,code:caught.eliscriptDiagnostic?.code,phase:caught.eliscriptDiagnostic?.phase};};
 assert.equal(transientFailure.length,3);assert.equal(Object.hasOwn(transientFailure,'prototype'),false);
 for(const mode of['normal',...['filename','start','line','column','end','endLine','endColumn'].map(name=>'read-'+name),...['filename','line','column','message'].flatMap(name=>['convert-'+name,'symbol-'+name])])assert.deepEqual(observe(transientFailure,mode),observe(originalTransientFailure,mode),mode);
 for(const filename of[undefined,null,false,-0,NaN,Infinity,0n,1n,'',[],{},'😀'])for(const span of[undefined,null,false,0,'',{filename:'fallback.eli',start:0,line:1,column:2,end:3,endLine:4,endColumn:5}]){const capture=fn=>{try{fn(filename,span,undefined);}catch(error){return{message:error.message,diagnostic:error.eliscriptDiagnostic};}};assert.deepEqual(capture(transientFailure),capture(originalTransientFailure));}
});

test('both diagnostic helpers capture the Error constructor before template conversions and retain the constructed thrown object and original field values',()=>{
 function observe(fn,transient){const events=[],thrown={},descriptor=Object.getOwnPropertyDescriptor(globalThis,'Error'),file={[Symbol.toPrimitive](hint){events.push('file:'+hint);return'input.eli';}},span={filename:file,start:0,line:1,column:2,end:3,endLine:4,endColumn:5},diagnostic={location:{file,start:{line:1,column:2}},message:'bad'};function Constructor(message){events.push(['construct',new.target===Constructor,message]);return thrown;}Object.defineProperty(globalThis,'Error',{configurable:true,get(){events.push('Error');return Constructor;}});let caught;try{transient?fn(false,span,'bad'):fn(diagnostic);}catch(error){caught=error;}finally{Object.defineProperty(globalThis,'Error',descriptor);}assert.equal(caught,thrown);assert.equal(thrown.eliscriptDiagnostic.message,'bad');assert.equal(thrown.eliscriptDiagnostic.location.file,file);if(!transient)assert.equal(thrown.eliscriptDiagnostic,diagnostic);return events;}
 assert.deepEqual(observe(analyzerFailure,false),observe(originalAnalyzerFailure,false));assert.deepEqual(observe(transientFailure,true),observe(originalTransientFailure,true));
 const join=Array.prototype.join;try{Array.prototype.join=()=>{throw'join';};for(const[actual,original,args]of[[analyzerFailure,originalAnalyzerFailure,[{location:{file:null,start:{line:undefined,column:false}},message:undefined}]],[transientFailure,originalTransientFailure,[undefined,null,undefined]]]){let left,right;try{actual(...args);}catch(error){left=error.message;}try{original(...args);}catch(error){right=error.message;}assert.equal(left,right);}}finally{Array.prototype.join=join;}
});



test('the complete linked WASM analyzer preserves all 18 original small controls and all 57 frozen negative diagnostics',async()=>{
 const fixture=JSON.parse(await readFile('tests/fixtures/bootstrap-analyzer.json','utf8')),controls=fixture.valid.filter(item=>Object.hasOwn(item,'source'));
 assert.equal(fixture.valid.length,30);assert.equal(controls.length,18);assert.equal(fixture.valid.filter(item=>item.file).length,12);assert.equal(fixture.invalid.length,57);
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 for(const item of[...controls,...fixture.invalid]){const expected=expectedAnalysis(item.source,item.filename);assert.equal(expected.status,controls.includes(item)?'ok':'error',item.name);if(item.error)assert.equal(expected.message,item.error,item.name);assert.deepEqual(analyzeObserved(a,item.source,item.filename),expected,item.name);a.collect();assert.equal(a.stats().frameDepth,0,item.name);}
 finish(a);
});

test('both complete analyzer APIs preserve portable closure selection and transient ownership errors with Unicode resource ordering under per-allocation GC',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 for(const source of['(defconst base 3) (defportable add (x) (+ x base)) (defportable entry (x) (add x)) (defun ignored () (print 9))','(import-portable "./dependency.eli" imported) (defportable entry (x) (imported x))'])for(const allow of[false,true]){
  const filename='portable😀.eli',text=a.string(source),file=a.string(filename),forms=a.invoke('read_string',[text,file]),name=a.string('entry'),entries=a.sourceArray([name]);let expected,error;try{expected=reference.select_portable_module(reader.read_string(source,filename),['entry'],filename,allow);}catch(caught){error=caught;}
  try{if(error){let actual;try{a.invoke('select_portable_module',[forms,entries,file,allow]);}catch(caught){actual=caught;}assert(actual?.kind);const message=property(a,actual,'message'),diagnostic=property(a,actual,'eliscriptDiagnostic');assert.equal(a.readString(message),error.message);assert.deepEqual(decode(a,diagnostic),error.eliscriptDiagnostic);for(const root of[actual,message,diagnostic])a.release(root);}else{const out=a.invoke('select_portable_module',[forms,entries,file,allow]);assert.deepEqual(decode(a,out),expected);a.release(out);}}finally{for(const root of[text,file,forms,name,entries])a.release(root);}a.collect();
 }
 for(const pair of[['a','A'],['ä','z'],['阿','中'],['𐀀','\uE000']]){
  const source=`(import "./stdlib/core/transient.mjs" transient) (defasync build (source promise) (let ((${pair[0]} (transient source)) (${pair[1]} (transient source))) (await promise) nil))`;
  const expected=expectedAnalysis(source,'ownership😀.eli');assert.equal(expected.diagnostic.message,`transient binding ${pair.toSorted()[0]} cannot remain active across await`);assert.deepEqual(analyzeObserved(a,source,'ownership😀.eli'),expected);assert.deepEqual(analyzeObserved(a,source,'ownership😀.eli','analyze_transients'),expected);
 }
 finish(a);
});

test('complete analyzer capacity failures preserve the caller frame and roots and recover after releasing capacity',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:2048,initialBytes:262144,maxBytes:2097152});a.auto(1);const input=a.string('(defun f (x) (+ x 1))'),file=a.string('capacity.eli'),forms=a.invoke('read_string',[input,file]),held=a.number(-0),frame=a.frame(1),fillers=[];a.frameSet(frame,0,held);
 while(a.live()<2048)fillers.push(a.number(9));assert.throws(()=>a.invoke('analyze_module',[forms,file]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));fillers.forEach(value=>a.release(value));a.collect();const out=a.invoke('analyze_module',[forms,file]);assert(a.keyEqual(out,forms));a.release(out);a.leaveFrame(frame);for(const root of[input,file,forms,held])a.release(root);finish(a);
});

test('actual diagnostic conversion traps in the complete analyzer unwind private frames without swallowing machine traps or invalidating caller roots',async()=>{
 const text=await readFile('bootstrap/runtime/memory.eli','utf8'),start=text.indexOf('  (defun value-source-to-string '),end=text.indexOf('  (defun heap-source-primitive ',start);assert(start>=0&&end>start);const injected=backend.compiler.compile_ir_string(text.slice(0,start)+'  (defun value-source-to-string (heap value) (load-u32 4294967295))\n'+text.slice(end),'analyzer-trap.eli'),bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'entry.mjs',injected));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const a=instantiateManagedRuntime(bytes,{maxSlots:16384,initialBytes:1048576});a.auto(1);const input=a.string('missing'),file=a.string('trap.eli'),forms=a.invoke('read_string',[input,file]),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);assert.throws(()=>a.invoke('analyze_module',[forms,file]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.leaveFrame(frame);for(const root of[input,file,forms,held])a.release(root);assert.deepEqual(analyzeObserved(a,'(defun f (x) x)','after-trap.eli'),{status:'ok'});finish(a);
});

test('whole analyzer preserves deterministic random lexical trees Unicode bindings and invalid-reference diagnostics under per-allocation GC',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);let seed=0x72a5c19;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let index=0;index<32;index++){const name=['值','ä','é','𐀀','alpha'][next()%5],source=`(defun f (value) (let* ((${name} value) (result (+ ${name} ${next()%100}))) (if (> result 0) result value))) (export f)`;for(const input of[source,source+' missing'+index]){const expected=expectedAnalysis(input,'random😀.eli');assert.deepEqual(analyzeObserved(a,input,'random😀.eli'),expected);a.collect();assert.equal(a.stats().frameDepth,0);}}finish(a);
});

test('complete analyzer keeps cached names lexical shadowing tail state and nearest async context isolated under forced GC',()=>{
 const cases=[
  [true,'(defconst shared 7) (defun f (value) (let ((local value)) (let ((nested local)) (+ shared shared local nested))))'],
  [true,'(defconst shared 7) (defun f () (let* ((before shared) (shared 1) (after shared)) (setq shared (+ shared 1)) [before shared after]))'],
  [true,'(defun f (value) (let ((x-y value)) (let ((x_y x-y)) (+ x-y x_y))))'],
  [true,'(defasync f (promise) (let ((value (await promise))) (let ((next value)) (await next))))'],
  [true,'(defasync f (promise) (let ((value promise)) (async () (let ((next value)) (await next)))))'],
  [true,'(defun f (value) (let* ((a (+ value value)) (b (+ a a))) (if value (recur b) value)))'],
  [true,'(defun f (value) (let ((a value) (b value)) (lambda () (+ a b value))))'],
  [true,'(defun f () [console/log console/log globalThis/Math globalThis/Math])'],
  [true,'(defun f (value) (loop ((step value)) (if step (recur false) step)))'],
  [false,'(defconst shared 7) (defun f () (let ((local shared)) shared shared (setq shared local)))'],
  [false,'(defun f (x-y x_y) [x-y x_y])'],
  [false,'(defasync f (promise) (lambda () (let ((next promise)) (await next))))'],
  [false,'(defun f (value) (+ (recur value) value))'],
  [false,'(defun f (value) (try (recur value) (finally nil)))'],
  [false,'(defun f () (let ((first missing) (second 1 2)) first))'],
  [false,'(defun f () [console/log console/log __eliscript_private/value])'],
  [false,'(defun f () (let ((value 1)) value missing missing))'],
  [true,'(defun f () (let () (lambda () (let* () 1))))'],
  [true,"(defconst data '(defportable fake () missing)) (defun f () data)"],
  [true,'(module outer (defconst base 2) (module inner (defportable f (value) (+ value base))))'],
  [true,'(defun helper (value) value) (defun f (value) (helper (helper value)))'],
  [false,'(defun f () (let () missing))'],
  [false,'(defun f () (defun nested () 1))'],
  [false,'(module outer (defportable f (value) (print value)))'],
  [false,'(defun helper (value) value) (defportable f (value) (helper value))'],
 ];
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 try{
  for(let iteration=0;iteration<2;iteration++)for(let index=0;index<cases.length;index++){
   const[valid,source]=cases[index],filename=`environment😀-${iteration}-${index}.eli`,expected=expectedAnalysis(source,filename);
   assert.equal(expected.status,valid?'ok':'error',filename);
   assert.deepEqual(analyzeObserved(a,source,filename),expected,filename);
   a.collect();assert.equal(a.stats().frameDepth,1,filename);assert(Object.is(a.readNumber(held),-0),filename);
  }
 }finally{a.leaveFrame(frame);a.release(held);finish(a);}
},30000);

test('independent Node executes the same complete Analyzer WASM bytes with its native JS analysis oracle',async()=>{
 const file=resolve(directory,'complete-analyzer.wasm');await writeFile(file,artifact());
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const {instantiateManagedRuntime}=await import(process.argv[1]),reference=await import(process.argv[2]),reader=await import(process.argv[3]);',decode.toString(),property.toString(),analyzeObserved.toString(),expectedAnalysis.toString(),'const bytes=readFileSync(process.argv[4]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,{maxSlots:16384,initialBytes:1048576});a.auto(1);','for(const source of '+JSON.stringify([...valid,'missing','(defun f (x x) x)','(defportable f (x) (print x))'])+'){assert.deepEqual(analyzeObserved(a,source,"node😀.eli"),expectedAnalysis(source,"node😀.eli"),source);a.collect();assert.equal(a.stats().frameDepth,0);}','a.closeModule();a.collect();assert.equal(a.live(),0);'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(resolve(directory,'bootstrap/analyzer.mjs')).href,pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('public Seed and three complete frontend generations preserve Analyzer JavaScript Source Maps and whole linked WASM bytes',async()=>{
 const seed=spawnSync(process.env.EMACS??'emacs',['--batch','-Q','--script',resolve('tools/bootstrap-seed.el'),'--',resolve('.'),resolve(directory,'seed'),'analyzer'],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(resolve(directory,'seed/analyzer.mjs'),'utf8'),await readFile(resolve(directory,'bootstrap/analyzer.mjs'),'utf8'));
 const files=(await readdir('bootstrap/compiler')).filter(name=>name.endsWith('.eli')).sort();assert.equal(files.length,13);let compiler=backend.compiler,previous,previousWasm;
 for(let generation=1;generation<=3;generation++){
  const generationRoot=resolve(directory,'analyzer-generation-'+generation),output=resolve(generationRoot,'bootstrap');await mkdir(output,{recursive:true});const emitted=[];
  for(const name of files){const source=await readFile(resolve('bootstrap/compiler',name),'utf8'),moduleName=name.replace(/\.eli$/,'.mjs'),result=compiler.compile_string_with_source_map(source,name,moduleName,name);emitted.push([name,result.javascript,result.sourceMap]);await writeFile(resolve(output,moduleName),result.javascript);}
  if(previous)assert.deepEqual(emitted,previous,'generation '+generation);previous=emitted;compiler=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);
  const next=await buildBackends({outputRoot:generationRoot,frontend:compiler}),generationModules=modules.map(module=>({...module,program:compiler.deserialize_ir_program(backend.compiler.serialize_ir_program(module.program))})),wasm=Uint8Array.from(next.managed.emit_managed_project_wasm(generationModules,'entry.mjs',compiler.deserialize_ir_program(backend.compiler.serialize_ir_program(runtime))));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);assert.deepEqual(wasm,artifact(),'whole Analyzer WASM generation '+generation);if(previousWasm)assert.deepEqual(wasm,previousWasm);previousWasm=wasm;
 }
},30000);
