import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dir,'..'),sourceRoot=await realpath(resolve(process.env.ELISCRIPT_COMPILER_SOURCE_ROOT??root));
let directory,b,runtime,runtimeText,graph,bytes,reader,reference,ported,expanderSource,originalSource,fixture;
// Freeze the original diagnostic algorithm so JS parity remains independent after migration.
const originalDiagnostic="  (defconst raise-diagnostic\n    (js* \"(diagnostic) => { const p = diagnostic.location.start; const error = new Error(`${diagnostic.location.file}:${p.line}:${p.column}: ${diagnostic.message}`); error.eliscriptDiagnostic = diagnostic; throw error; }\"))\n";
function diagnosticDefinition(source){const start=source.indexOf('  (defconst raise-diagnostic\n'),end=source.indexOf('  (defconst guard\n',start);assert(start>=0&&end>start);return source.slice(start,end);}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-expander-'));
 const {buildBackends}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/build.mjs')).href);b=await buildBackends({outputRoot:directory});
 reader=await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href);
 const original=await readFile(resolve(sourceRoot,'bootstrap/compiler/expander.eli'),'utf8'),local=await readFile(resolve(root,'bootstrap/compiler/expander.eli'),'utf8');originalSource=original.replace(diagnosticDefinition(original),originalDiagnostic);expanderSource=original.replace(diagnosticDefinition(original),diagnosticDefinition(local));fixture=JSON.parse(await readFile(resolve(sourceRoot,'tests/fixtures/bootstrap-expander.json'),'utf8'));
 const emit=source=>b.compiler.compile_string(source,'expander.eli').replace(/from \"[.]\/syntax[.]mjs\"/g,()=> 'from '+JSON.stringify(pathToFileURL(resolve(directory,'bootstrap/syntax.mjs')).href));ported=await import('data:text/javascript;base64,'+Buffer.from(emit(expanderSource)).toString('base64'));reference=await import('data:text/javascript;base64,'+Buffer.from(emit(originalSource)).toString('base64'));
 runtimeText=await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8');runtime=b.compiler.compile_ir_string(runtimeText,'runtime.eli');
 const syntax=b.compiler.compile_ir_string(await readFile(resolve(sourceRoot,'bootstrap/compiler/syntax.eli'),'utf8'),'syntax.eli'),program=b.compiler.compile_ir_string(expanderSource,'expander.eli');
 const entry=b.compiler.compile_ir_string('(import "./expander.mjs" expand-module) (defun run (source filename) (expand-module (JSON/parse source) filename)) (export run)','expander-entry.eli');
 graph=[{id:'syntax.mjs',program:syntax},{id:'expander.mjs',program},{id:'entry.mjs',program:entry}];
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
async function open(options={}){if(!bytes){const saved=JSON.stringify(graph);bytes=Uint8Array.from(b.managed.emit_managed_project_wasm(graph,'entry.mjs',runtime));assert.equal(JSON.stringify(graph),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);}const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href);return instantiateManagedRuntime(bytes,options);}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const item=a.get(v,i);try{return read(a,item);}finally{a.release(item);}});if(v?.kind===13){const result={},keys=a.objectKeys(v);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),value=a.objectGet(v,key);try{result[a.readString(key)]=read(a,value);}finally{a.release(key);a.release(value);}}}finally{a.release(keys);}return result;}return v;}
function syntaxJSON(v){if(typeof v==='number'&&Object.is(v,-0))return '-0';if(Array.isArray(v))return '['+v.map(syntaxJSON).join(',')+']';if(v!==null&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+syntaxJSON(v[k])).join(',')+'}';return JSON.stringify(v);}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('the whole expander and actual syntax dependency compile to zero-import WASM',async()=>{finish(await open());},120000);

function property(a,o,k){const key=a.string(k);try{return a.objectGet(o,key);}finally{a.release(key);}}
function expand(a,forms,filename){const input=a.string(syntaxJSON(forms)),file=typeof filename==='string'?a.string(filename):filename;
 try{let out;try{out=a.invoke('run',[input,file]);}catch(error){if(error?.kind!==13)throw error;const message=property(a,error,'message'),diagnostic=property(a,error,'eliscriptDiagnostic');try{return{status:'error',message:a.readString(message),diagnostic:read(a,diagnostic)};}finally{for(const v of [error,message,diagnostic])a.release(v);}}
  try{return{status:'ok',forms:read(a,out)};}finally{a.release(out);}
 }finally{a.release(input);a.release(file);}}
function expected(fn,forms,filename){try{return{status:'ok',forms:fn(structuredClone(forms),filename)};}catch(error){return{status:'error',message:error.message,diagnostic:error.eliscriptDiagnostic};}}

test('whole WASM expander preserves all 28 original inline fixed macro cases against the independent JS implementation',async()=>{
 const cases=fixture.valid.filter(item=>Object.hasOwn(item,'source'));assert.equal(cases.length,28);
 // Full compiler file inputs remain in their original Seed/JS gate. This
 // functional slice deliberately does not expand those twelve large files.
 assert.equal(fixture.valid.filter(item=>Object.hasOwn(item,'file')).length,12);
 const a=await open({maxSlots:8192,initialBytes:1048576});a.auto(1);
 try{for(const item of cases){const forms=reader.read_string(item.source,item.filename),before=syntaxJSON(forms),oracle=expected(reference.expand_module,forms,item.filename);assert.equal(oracle.status,'ok',item.name);assert.deepEqual(expected(ported.expand_module,forms,item.filename),oracle,item.name);assert.deepEqual(expand(a,forms,item.filename),oracle,item.name);assert.equal(syntaxJSON(forms),before);a.collect();assert.equal(a.stats().frameDepth,0);}}
 finally{finish(a);}
},120000);
test('whole WASM expander retains every original 36 invalid-case diagnostic spans and post-error recovery under GC',async()=>{
 assert.equal(fixture.invalid.length,36);const a=await open({maxSlots:8192,initialBytes:1048576});a.auto(1);
 try{for(const item of fixture.invalid){const forms=reader.read_string(item.source,item.filename),oracle=expected(reference.expand_module,forms,item.filename);assert.equal(oracle.status,'error',item.name);assert.equal(oracle.message,item.error);assert.deepEqual(expected(ported.expand_module,forms,item.filename),oracle,item.name);assert.deepEqual(expand(a,forms,item.filename),oracle,item.name);a.collect();assert.equal(a.stats().frameDepth,0);}
  const forms=reader.read_string('(defmacro id (x) x) (defconst recovered (id 7))','recovered.eli');assert.deepEqual(expand(a,forms,'recovered.eli'),expected(reference.expand_module,forms,'recovered.eli'));
 }finally{finish(a);}
},120000);
test('expander OOM retains the caller negative-zero root and original frame then expands a later small input',async()=>{
 const a=await open({maxSlots:1024,initialBytes:262144,maxBytes:16777216});a.auto(1);
 const source=Array.from({length:96},(_,i)=>'(defconst value-'+i+' '+i+')').join('\n'),forms=reader.read_string(source,'capacity.eli'),input=a.string(syntaxJSON(forms)),file=a.string('capacity.eli'),held=a.number(-0),caller=a.frame(1);a.frameSet(caller,0,held);
 try{assert.throws(()=>a.invoke('run',[input,file]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.collect();assert.deepEqual(expand(a,[],'recovered.eli'),{status:'ok',forms:[]});}
 finally{a.leaveFrame(caller);a.release(file);a.release(held);finish(a);}
},120000);

test('portable expander diagnostics preserve original arrow shape Error lookup getter order implicit Symbol rejection and thrown identity',async()=>{
 async function helper(source){const text=source.trimEnd();assert(text.endsWith(')'));const exposed=text.slice(0,-1)+'\n(export raise-diagnostic))',javascript=b.compiler.compile_string(exposed,'expander-helper.eli').replace(/from "[.]\/syntax[.]mjs"/g,()=> 'from '+JSON.stringify(pathToFileURL(resolve(directory,'bootstrap/syntax.mjs')).href));return(await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'))).raise_diagnostic;}
 const original=await helper(originalSource),actual=await helper(expanderSource);
 for(const fn of [original,actual]){assert.equal(fn.length,1);assert.equal(Object.hasOwn(fn,'prototype'),false);assert.throws(()=>Reflect.construct(function(){},[],fn),TypeError);}
 function observe(fn,mode){
  const events=[],sentinel={},BaseError=globalThis.Error,descriptor=Object.getOwnPropertyDescriptor(globalThis,'Error'),stringDescriptor=Object.getOwnPropertyDescriptor(globalThis,'String');
  const primitive=(name,value)=>({[Symbol.toPrimitive](hint){events.push(name+':'+hint);if(mode===name)throw sentinel;return mode==='symbol'&&name==='file'?Symbol('bad'):value;}});
  const point={get line(){events.push('line');return primitive('line',2);},get column(){events.push('column');return primitive('column',3);}};
  const location={get start(){events.push('start');return point;},get file(){events.push('file');return primitive('file','输入😀.eli');}};
  const diagnostic={get location(){events.push('location');if(mode==='location')throw sentinel;return location;},get message(){events.push('message');return primitive('message','failed');}};let result;
  try{
   Object.defineProperty(globalThis,'Error',{configurable:true,get(){events.push('Error');if(mode==='Error')throw sentinel;return BaseError;}});
   Object.defineProperty(globalThis,'String',{configurable:true,get(){throw sentinel;}});
   try{fn(diagnostic);}catch(error){result={kind:error===sentinel?'sentinel':error instanceof TypeError?'TypeError':'Error',message:error instanceof BaseError&&!(error instanceof TypeError)?error.message:undefined,diagnostic:error.eliscriptDiagnostic===diagnostic};}
  }finally{Object.defineProperty(globalThis,'Error',descriptor);Object.defineProperty(globalThis,'String',stringDescriptor);}
  return{events,result};
 }
 for(const mode of ['normal','location','Error','file','line','column','message','symbol'])assert.deepEqual(observe(actual,mode),observe(original,mode),mode);
});
