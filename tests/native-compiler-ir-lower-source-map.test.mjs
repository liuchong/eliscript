import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
const root=resolve(import.meta.dir,'..'),sourceRoot=await realpath(resolve(process.env.ELISCRIPT_NATIVE_MANAGED_SOURCE_ROOT??root));
const irNames=['ir-format','ir-version','node-kinds','node-kind-p','reference-node-kind-p','node-p','reference-node-p','make-program','make-node','program-filename','program-body','ir-kind','ir-span','ir-value','ir-children','ir-properties','ir-property','serialize-program','deserialize-program'];
const mapNames=['encode-vlq','collect-generated-marks','reference-collect-generated-marks','source-locations','reference-source-locations','create-source-map'];
const originalSourceLocations=(source,marks)=>{const wanted=new Set();const locations=new Map();for(const mark of marks){const span=(mark??[])[2]??null;const start=span.start;if(start!==undefined)wanted.add(start);}const starts=[...wanted].filter(start=>Number.isSafeInteger(start)&&start>=0).sort((left,right)=>left-right);let index=0,offset=0,line=0,column=0;for(const start of starts){while(offset<start&&index<source.length){const code=source.codePointAt(index),width=code>65535?2:1;if(code===10){line++;column=0;}else column+=width;index+=width;offset++;}if(offset===start&&(index<source.length||source.length===0))locations.set(offset,[line,column]);}return locations;};
const originalGeneratedMarks=(generated,marks)=>{const result=[];let index=0,line=0,column=0;for(const mark of marks){const target=mark.offset;while(index<target&&index<generated.length){if(generated.charCodeAt(index)===10){line++;column=0;}else column++;index++;}if(index===target&&index<generated.length)result.push([line,column,mark.span]);}return result;};
let directory,b,runtime,runtimeText,modules,graphs,refs,instantiateNative,buildBackends,moduleSources,entrySources;
const cache=new Map();
async function nativeBackend(current,label){const path=resolve(current.directory,'native-under-test-'+label+'.mjs');await writeFile(path,current.compiler.compile_string(await readFile(resolve(root,'bootstrap/backends/native.eli'),'utf8'),'native.eli'));current.native=await import(pathToFileURL(path).href);}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-ir-lower-maps-'));
 ({buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href));b=await buildBackends({outputRoot:directory});
 await nativeBackend(b,'current');
 ({instantiateNativeManagedRuntime:instantiateNative}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/native-managed-runtime.mjs')).href));
 runtimeText=await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8');runtime=b.compiler.compile_ir_string(runtimeText,'runtime.eli');modules=new Map();refs=new Map();moduleSources=new Map();
 for(const name of ['syntax','ir','lower','source-map']){const source=await readFile(resolve(sourceRoot,'bootstrap/compiler',name+'.eli'),'utf8');moduleSources.set(name,source);modules.set(name,{id:name+'.mjs',program:b.compiler.compile_ir_string(source,name+'.eli')});refs.set(name,await import(pathToFileURL(resolve(directory,'bootstrap',name+'.mjs')).href));}
 refs.set('reader',await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href));
 const irEntry='(import "./ir.mjs" '+irNames.join(' ')+') (defun describe (error) (Object/getOwnPropertyDescriptor error "cause")) (export '+irNames.join(' ')+' describe)';
 const lowerEntry='(import "./lower.mjs" lower-expression lower-top-level lower-module) (import "./ir.mjs" serialize-program) (defun run (source filename) (serialize-program (lower-module (JSON/parse source) filename))) (export run lower-expression lower-top-level lower-module)';
 const mapEntry='(import "./source-map.mjs" '+mapNames.join(' ')+') (defun location-entries (locations) (Array/from locations)) (export '+mapNames.join(' ')+' location-entries)';
 entrySources={ir:irEntry,lower:lowerEntry,map:mapEntry};
 const entry=(kind,source)=>({id:'entry.mjs',program:b.compiler.compile_ir_string(source,kind+'-entry.eli')});
 graphs={ir:[modules.get('ir'),entry('ir',irEntry)],lower:['syntax','ir','lower'].map(name=>modules.get(name)).concat(entry('lower',lowerEntry)),map:[modules.get('source-map'),entry('map',mapEntry)]};
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function artifact(kind,r=runtime,label=kind,current=b,graph=graphs[kind]){
 const key=current===b&&r===runtime&&graph===graphs[kind]?kind:null;if(key&&cache.has(key))return cache.get(key);
 const before=JSON.stringify(graph),runtimeBefore=JSON.stringify(r),lowered=current.managed.lower_managed_project(graph,'entry.mjs',r),typedBefore=JSON.stringify(lowered.typed);
 const wasm=Uint8Array.from(current.managed.emit_managed_project_wasm(graph,'entry.mjs',r));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);
 const bytes=Uint8Array.from(current.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')),path=resolve(directory,label+'.dylib');await writeFile(path,bytes);
 assert.equal(JSON.stringify(graph),before);assert.equal(JSON.stringify(r),runtimeBefore);assert.equal(JSON.stringify(lowered.typed),typedBefore);
 const result={path,lowered,bytes,wasm};if(key)cache.set(key,result);return result;
}
async function open(kind,options={},r=runtime,label=kind){const compiled=await artifact(kind,r,label);return instantiateNative(compiled.path,compiled.lowered,options);}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const child=a.get(v,i);try{return read(a,child);}finally{a.release(child);}});if(v?.kind===13){const out={},keys=a.objectKeys(v);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(v,key);try{out[a.readString(key)]=read(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return v;}
function box(a,v){if(typeof v==='number')return a.number(v);if(typeof v==='string')return a.string(v);if(Array.isArray(v)){const children=v.map(x=>box(a,x));try{return a.sourceArray(children);}finally{children.forEach(x=>a.release(x));}}if(v&&typeof v==='object'){const fields=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,box(a,x)]));try{return a.sourceObject(fields);}finally{Object.values(fields).forEach(x=>a.release(x));}}return v;}
function get(a,o,k){const key=a.string(k);try{return a.objectGet(o,key);}finally{a.release(key);}}
function call(a,name,args=[]){const inputs=args.map(x=>box(a,x));try{const out=a.invoke(name,inputs);try{if(out?.kind===15){const entries=a.invoke('location_entries',[out]);try{return read(a,entries);}finally{a.release(entries);}}return read(a,out);}finally{a.release(out);}}finally{inputs.forEach(x=>a.release(x));}}
function finish(a,values=[]){try{for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}finally{a.close();}}
function syntaxJSON(v){if(typeof v==='number'&&Object.is(v,-0))return '-0';if(Array.isArray(v))return '['+v.map(syntaxJSON).join(',')+']';if(v!==null&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+syntaxJSON(v[k])).join(',')+'}';return JSON.stringify(v);}
function sourceError(a,fn){let error;try{fn();assert.fail('must throw source schema error');}catch(caught){error=caught;}assert.equal(error.kind,13);const message=get(a,error,'message'),diagnostic=get(a,error,'eliscriptDiagnostic'),code=get(a,diagnostic,'code'),phase=get(a,diagnostic,'phase');try{return{message:a.readString(message),code:a.readString(code),phase:a.readString(phase)};}finally{for(const v of [error,message,diagnostic,code,phase])a.release(v);}}

nativeTest('entire IR syntax lower and SourceMap dependency projects execute as independent native libraries',async()=>{
 for(const kind of ['ir','lower','map'])finish(await open(kind));
},120000);
nativeTest('whole native IR round trips the unchanged WASM canonical corpus with exact text zero signs and schema diagnostics',async()=>{
 const a=await open('ir');a.auto(1);const ir=refs.get('ir');
 try{
  for(const source of ['', '(defconst answer 42)', '(defun identity (value) value)', '(defconst text "中😀\\ud800")', '(defun run () (try (throw nil) (catch [x nil &rest rest] x) (finally false)))']){
   const canonical=ir.serialize_program(b.compiler.compile_ir_string(source,'真实-ir.eli')),text=a.string(canonical),parsed=a.invoke('deserialize_program',[text]),out=a.invoke('serialize_program',[parsed]);assert.equal(a.readString(out),canonical);for(const v of [text,parsed,out])a.release(v);
  }
  for(const value of [0,-0,1,-1]){const p=b.compiler.compile_ir_string('(defconst x 0)','zero.eli');p.body[0].children[0].value=value;const canonical=ir.serialize_program(p);assert.equal(canonical.includes('"value":-0'),Object.is(value,-0));const text=a.string(canonical),parsed=a.invoke('deserialize_program',[text]),out=a.invoke('serialize_program',[parsed]);assert.equal(a.readString(out),canonical);for(const v of [text,parsed,out])a.release(v);}
  const valid=ir.serialize_program(b.compiler.compile_ir_string('(defconst x 1)','valid.eli'));
  for(const [input,message] of [[valid+' ','IR source is valid JSON but not canonical IR JSON'],['{"format":"wrong","program":{"body":[],"filename":"x"},"version":1}','unsupported IR format: wrong']]){let expected;try{ir.deserialize_program(input);}catch(e){expected=e.eliscriptDiagnostic;}assert(expected);const text=a.string(input);try{assert.deepEqual(sourceError(a,()=>a.invoke('deserialize_program',[text])),{message,code:expected.code,phase:expected.phase});}finally{a.release(text);}}
 }finally{finish(a);}
},120000);
nativeTest('native canonical JSON parse failures retain the stable outer diagnostic and the real nonenumerable SyntaxError cause',async()=>{
 const a=await open('ir');a.auto(1);
 try{for(const input of ['{','[1,]','undefined']){let expected;try{refs.get('ir').deserialize_program(input);}catch(e){expected=e;}assert(expected.cause instanceof SyntaxError);const text=a.string(input),owned=[text];const prop=(o,k)=>{const v=get(a,o,k);owned.push(v);return v;};let actual;try{a.invoke('deserialize_program',[text]);assert.fail('expected schema error');}catch(e){assert.equal(e.kind,13);actual=e;owned.push(e);}
  try{const diagnostic=prop(actual,'eliscriptDiagnostic'),cause=prop(actual,'cause');assert.equal(a.readString(prop(actual,'message')),expected.message);for(const key of ['message','code','phase'])assert.equal(a.readString(prop(diagnostic,key)),expected.eliscriptDiagnostic[key]);assert.equal(a.readString(prop(cause,'name')),expected.cause.name);assert(a.readString(prop(cause,'message')).length>0);const descriptor=a.invoke('describe',[actual]);owned.push(descriptor);assert.equal(prop(descriptor,'enumerable'),false);assert.equal(prop(descriptor,'writable'),true);assert.equal(prop(descriptor,'configurable'),true);assert(a.keyEqual(prop(descriptor,'value'),cause));const keys=a.objectKeys(actual);owned.push(keys);for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i);owned.push(key);assert.notEqual(a.readString(key),'cause');}}
  finally{for(const v of owned)a.release(v);a.collect();assert.equal(a.stats().frameDepth,0);}
 }}finally{finish(a);}
},120000);

nativeTest('native complete lower preserves all eleven original sources and 32 deterministic random syntax trees as exact IR text',async()=>{
 const a=await open('lower',{maxSlots:8192,initialBytes:262144,maxBytes:16777216});a.auto(1);
 const corpus=['(defconst x 1)','(defconst negative-zero -0)','(defun f (x &optional y &rest tail) (if x (+ y 1) tail))','(defun f () (let* ((x 1) (y 2)) (loop ((n x)) (if n (recur nil) y))))','(defun f () (try (throw (js-array)) (catch {:strs [x] :or {x 7} :as all} (js-array x all)) (finally false)))','(defconst q (quote [中 value]))',
  '(import "./dep.mjs" x y) (defvar count 0) (defun f () (setq count (1+ count)) (js-call x :method count)) (export f count) (export-default y)',
  '(defun f ([x nil &rest tail] {:keys [a] :strs [b] :syms [c] :or {a 1} :as record}) (js-array x tail a b c record))',
  '(defun f (value) (progn (put value :x (new globalThis.Map)) (get value :x) (aref value "x") (js* "value")))',
  '(defun f (value) (try (throw value) (catch [x &rest rest] (try x (finally rest))) (finally nil)))',
  '(defconst values (js-array nil undefined false true -0.0 1.5)) (defconst text "\\ud800中😀\\udfff")'];
 let state=0x91a3cbd;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 for(let index=0;index<32;index++){let text='';for(let unit=0;unit<next()%16;unit++)text+=String.fromCharCode(next()%65536);corpus.push('(defconst generated-'+index+' '+JSON.stringify(text)+') (defun f (value) (if value '+(next()%1024)+' nil))');}
 try{for(const source of corpus){const filename='实际-lower.eli',forms=refs.get('reader').read_string(source,filename),expected=refs.get('ir').serialize_program(refs.get('lower').lower_module(forms,filename));assert.equal(call(a,'run',[syntaxJSON(forms),filename]),expected,source);a.collect();assert.equal(a.stats().frameDepth,0);}}finally{finish(a);}
},120000);
nativeTest('native whole lower retains every original invalid binding error caller root and post-error recovery',async()=>{
 const a=await open('lower',{maxSlots:8192,initialBytes:262144});a.auto(1);const filename='invalid-binding.eli',file=a.string(filename),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 try{for(const source of ['(defun f ([1]) nil)','(defun f ([x :as all]) all)','(defun f () (let (([1] (js-array 2))) nil))']){
  const forms=refs.get('reader').read_string(source,filename),input=a.string(syntaxJSON(forms));let expected,actual;try{refs.get('lower').lower_module(forms,filename);}catch(e){expected=e;}assert(expected instanceof Error);
  try{a.invoke('run',[input,file]);assert.fail('expected lower error');}catch(e){assert.equal(e.kind,13);actual=e;}
  const message=get(a,actual,'message'),name=get(a,actual,'name');assert.equal(a.readString(message),expected.message);assert.equal(a.readString(name),expected.name);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));for(const v of [input,actual,message,name])a.release(v);a.collect();
 }
 const forms=refs.get('reader').read_string('(defconst recovered 7)',filename);assert.equal(call(a,'run',[syntaxJSON(forms),filename]),refs.get('ir').serialize_program(refs.get('lower').lower_module(forms,filename)));
 }finally{a.leaveFrame(caller);finish(a,[file,held]);}
},120000);
nativeTest('all six unchanged native SourceMap exports retain the original VLQ cursor EOF and exact JSON corpus',async()=>{
 const a=await open('map');a.auto(1);const ref=refs.get('source-map');
 try{
  for(const value of [-2147483649,-2147483648,-1024,-32,-1,-0,0,1,31,32,2147483647,2147483648,9007199254740991])assert.equal(call(a,'encode_vlq',[value]),ref.encode_vlq(value));
  for(const generated of ['','abc','A😀\ud800\nx\n'])for(const source of ['','中😀\nx','a\r\nb']){
   const marks=[0,0,1,2,3,generated.length,generated.length+1].map((offset,i)=>({offset,span:{start:i%5,line:2,column:3}}));
   for(const name of ['collect_generated_marks','reference_collect_generated_marks'])assert.deepEqual(call(a,name,[generated,marks]),originalGeneratedMarks(generated,marks));
   const locations=[0,1,2,2,3,-1,NaN,1.5,'1',undefined].map(start=>[0,0,{start,line:1,column:1}]);
   for(const name of ['source_locations','reference_source_locations'])assert.deepEqual(call(a,name,[source,locations]),[...originalSourceLocations(source,locations)]);
   assert.equal(call(a,'create_source_map',[generated,marks,source,'原始😀.eli','out.mjs']),ref.create_source_map(generated,marks,source,'原始😀.eli','out.mjs'));a.collect();assert.equal(a.stats().frameDepth,0);
  }
 }finally{finish(a);}
},120000);
nativeTest('native SourceMap retains the original 64 random UTF16 irregular mark groups duplicate starts and JSON bytes under collecting GC',async()=>{
 const a=await open('map',{maxSlots:8192,initialBytes:1048576});a.auto(1);let seed=0x517b9e3;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 try{for(let n=0;n<64;n++){let source='',generated='';for(let j=0,count=next()%24;j<count;j++){source+=String.fromCharCode(next()%65536);generated+=j%4===0?'\n':String.fromCharCode(next()%65536);}const marks=Array.from({length:next()%12},()=>({offset:(next()%(generated.length+5))-2,span:{start:(next()%(source.length+5))-2,line:1+next()%4,column:1+next()%8}}));
  const expected=originalGeneratedMarks(generated,marks);assert.deepEqual(call(a,'collect_generated_marks',[generated,marks]),expected);assert.deepEqual(call(a,'source_locations',[source,expected]),[...originalSourceLocations(source,expected)]);assert.equal(call(a,'create_source_map',[generated,marks,source,'随机😀.eli','out.mjs']),refs.get('source-map').create_source_map(generated,marks,source,'随机😀.eli','out.mjs'));a.collect();assert.equal(a.stats().frameDepth,0);
 }assert(a.stats().collections>100);}finally{finish(a);}
},120000);
nativeTest('native SourceMap preserves every original marks refusal nullish span error boxed primitive read and recovery',async()=>{
 const a=await open('map');a.auto(1);
 try{
  for(const marks of [null,undefined,false,0,'not-array']){const args=['abc',marks,'abc','in.eli','out.mjs'].map(v=>box(a,v));let error;try{a.invoke('create_source_map',args);}catch(e){error=e;}assert(error?.kind);const message=get(a,error,'message');assert.equal(a.readString(message),'source map marks must be an array');for(const v of [...args,error,message])a.release(v);}
  for(const mark of [null,undefined,[],[0,0,null]]){assert.throws(()=>call(a,'source_locations',['abc',[mark]]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');a.collect();assert.equal(a.stats().frameDepth,0);}
  for(const value of [false,true,0,-0,1,NaN,'','abc']){assert.deepEqual(call(a,'collect_generated_marks',['abc',[value]]),originalGeneratedMarks('abc',[value]));assert.deepEqual(call(a,'source_locations',['abc',[[0,0,value]]]),[...originalSourceLocations('abc',[[0,0,value]])]);}
  assert.deepEqual(call(a,'source_locations',['',[[0,0,{start:0}]]]),[[0,[0,0]]]);
 }finally{finish(a);}
},120000);

nativeTest('complete native IR public predicates constructors constants and accessors agree with the JS module',async()=>{
 const a=await open('ir');a.auto(1);const ir=refs.get('ir');
 try{
  for(const name of ['ir-format','ir-version','node-kinds']){const value=a.getExport(name.replaceAll('-','_'));try{assert.deepEqual(read(a,value),ir[name.replaceAll('-','_')]);}finally{a.release(value);}}
  for(const name of [...ir.node_kinds,'','unknown','中😀'])for(const predicate of ['node-kind-p','reference-node-kind-p'])assert.equal(call(a,predicate.replaceAll('-','_'),[name]),ir[predicate.replaceAll('-','_')](name));
  const p=b.compiler.compile_ir_string('(defconst sample -0)','public-ir.eli'),text=a.string(ir.serialize_program(p)),parsed=a.invoke('deserialize_program',[text]),body=a.invoke('program_body',[parsed]),node=a.get(body,0),owned=[text,parsed,body,node];
  try{
   const file=a.invoke('program_filename',[parsed]);owned.push(file);assert.equal(a.readString(file),ir.program_filename(p));
   for(const predicate of ['node_p','reference_node_p'])assert.equal(a.invoke(predicate,[node]),ir[predicate](p.body[0]));
   for(const name of ['ir_kind','ir_span','ir_value','ir_children','ir_properties']){const value=a.invoke(name,[node]);owned.push(value);assert.deepEqual(read(a,value),ir[name](p.body[0]));}
   const key=a.string('mutable'),property=a.invoke('ir_property',[node,key]);owned.push(key,property);assert.equal(read(a,property),ir.ir_property(p.body[0],'mutable'));
   const kind=a.string('literal'),span=box(a,p.body[0].span),number=a.number(-0),children=a.sourceArray([]),props=a.sourceObject({}),made=a.invoke('make_node',[kind,span,number,children,props]);owned.push(kind,span,number,children,props,made);assert.deepEqual(read(a,made),ir.make_node('literal',p.body[0].span,-0,[],{}));
   const filename=a.string('made.eli'),nodes=a.sourceArray([made]),program=a.invoke('make_program',[filename,nodes]),serialized=a.invoke('serialize_program',[program]);owned.push(filename,nodes,program,serialized);assert.equal(a.readString(serialized),ir.serialize_program(ir.make_program('made.eli',[ir.make_node('literal',p.body[0].span,-0,[],{})])));
  }finally{for(const v of owned)a.release(v);}
 }finally{finish(a);}
},120000);
nativeTest('whole native IR retains the original capacity error caller negative-zero root and canonical recovery',async()=>{
 const a=await open('ir',{maxSlots:1024,initialBytes:262144,maxBytes:16777216});a.auto(1);const ir=refs.get('ir'),huge=ir.serialize_program(b.compiler.compile_ir_string(Array.from({length:96},(_,i)=>'(defconst value-'+i+' '+i+')').join('\n'),'capacity.eli'));
 const input=a.string(huge),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 try{assert.throws(()=>a.invoke('deserialize_program',[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.collect();const canonical=ir.serialize_program(b.compiler.compile_ir_string('','recovered.eli')),text=a.string(canonical),parsed=a.invoke('deserialize_program',[text]),out=a.invoke('serialize_program',[parsed]);assert.equal(a.readString(out),canonical);for(const v of [text,parsed,out])a.release(v);}finally{a.leaveFrame(caller);finish(a,[held]);}
},120000);
nativeTest('a real native reflection bounds trap crosses the whole IR schema path without source catch swallowing it',async()=>{
 const injected=runtimeText.replace(definition(runtimeText,'heap-reflection-label'),'(defun heap-reflection-label (heap label) (load-u32 4294967295))'),r=b.compiler.compile_ir_string(injected,'reflection-trap.eli'),a=await open('ir',{},r,'ir-trap');a.auto(1);
 const input=a.string(refs.get('ir').serialize_program(b.compiler.compile_ir_string('(defconst x 1)','trap.eli'))),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 try{assert.throws(()=>a.invoke('deserialize_program',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));const version=a.getExport('ir_version');try{assert.equal(a.readNumber(version),1);}finally{a.release(version);}}finally{a.leaveFrame(caller);finish(a,[input,held]);}
},120000);

nativeTest('public Seed and three complete compiler generations retain exact JS maps and all native project artifact bytes',async()=>{
 const files=(await readdir(resolve(sourceRoot,'bootstrap/compiler'))).filter(name=>name.endsWith('.eli')).sort();assert.equal(files.length,13);
 const seedDirectory=resolve(directory,'public-seed');await mkdir(seedDirectory);
 for(const name of ['ir','lower','source-map']){const output=resolve(seedDirectory,name+'.mjs'),child=spawnSync(resolve(sourceRoot,'bin/eliscript-seed'),['--source-map','--output',output,resolve(sourceRoot,'bootstrap/compiler',name+'.eli')],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);assert.equal(await readFile(output,'utf8'),await readFile(resolve(directory,'bootstrap',name+'.mjs'),'utf8'));assert.equal(await readFile(output+'.map','utf8'),await readFile(resolve(directory,'bootstrap',name+'.mjs.map'),'utf8'));}
 let compiler=b.compiler,previous;
 for(let generation=1;generation<=3;generation++){
  const stageRoot=resolve(directory,'generation-'+generation),output=resolve(stageRoot,'bootstrap');await mkdir(output,{recursive:true});const emitted=new Map();
  for(const file of files){const input=resolve(sourceRoot,'bootstrap/compiler',file),source=await readFile(input,'utf8'),name=file.replace(/\.eli$/,'.mjs'),program=compiler.compile_ir_string(source,input),saved=JSON.stringify(program),emission=compiler.emit_ir_string_with_source_map(program,source,name,relative(resolve(directory,'fixed'),input));assert.equal(JSON.stringify(program),saved);const javascript=emission.javascript+'//# sourceMappingURL='+name+'.map\n';emitted.set(file,{javascript,map:emission.sourceMap});if(previous)assert.deepEqual(emitted.get(file),previous.get(file),'generation '+generation+': '+file);await writeFile(resolve(output,name),javascript);await writeFile(resolve(output,name+'.map'),emission.sourceMap);}
  previous=emitted;compiler=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);const stage=await buildBackends({outputRoot:stageRoot,frontend:compiler});await nativeBackend(stage,'g'+generation);const r=compiler.compile_ir_string(runtimeText,'runtime.eli');assert.deepEqual(r,runtime);
  for(const kind of ['ir','lower','map']){
   const graph=graphs[kind].map(item=>{const name=item.id.replace(/\.mjs$/,'');return{id:item.id,program:compiler.compile_ir_string(item.id==='entry.mjs'?entrySources[kind]:moduleSources.get(name),item.id==='entry.mjs'?kind+'-entry.eli':name+'.eli')};});assert.deepEqual(graph,graphs[kind]);
   const actual=await artifact(kind,r,'generation-'+generation+'-'+kind,stage,graph),expected=await artifact(kind);assert.deepEqual(actual.wasm,expected.wasm,'WASM '+kind+' generation '+generation);assert.deepEqual(actual.bytes,expected.bytes,'native '+kind+' generation '+generation);
  }
 }
},120000);
