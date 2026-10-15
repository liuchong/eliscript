import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildCompilerCandidate} from './compiler-module-candidate-rig.mjs';
const root=resolve(import.meta.dir,'..'),sourceRoot=await realpath(resolve(process.env.ELISCRIPT_COMPILER_SOURCE_ROOT??root));
let directory,b,runtime,program,source,bytes,reference,ported,helperBytes;
const rawHelpers={
 fail: `(message) => { const error = new Error(message); error.eliscriptDiagnostic = { format: 'eliscript-diagnostic', version: 1, code: 'ELI-B0003', severity: 'error', phase: 'project-plan', message }; throw error; }`,
 'project-request-fail': `(message) => { const error = new Error(message); error.eliscriptDiagnostic = { format: 'eliscript-diagnostic', version: 1, code: 'ELI-B0001', severity: 'error', phase: 'project-build', message }; throw error; }`,
 'project-configuration-fail': `(message, filename) => { const error = new Error(message); error.eliscriptDiagnostic = { format: 'eliscript-diagnostic', version: 1, code: 'ELI-B0002', severity: 'error', phase: 'project-config', message, ...(filename ? { location: { file: filename } } : {}) }; throw error; }`,
};
function definition(text,name){const start=text.indexOf('  (defconst '+name+'\n'),end=text.indexOf('\n  (def',start+1);assert(start>=0&&end>start);return text.slice(start,end);}
const names=Object.keys(rawHelpers),jsName=name=>name.replaceAll('-','_');
function expose(text){const end=text.lastIndexOf(')');return text.slice(0,end)+'\n(export '+names.join(' ')+'))';}
function original(text){for(const name of names)text=text.replace(definition(text,name),'  (defconst '+name+' (js* '+JSON.stringify(rawHelpers[name])+'))');return text;}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-project-'));
 b=await buildCompilerCandidate(directory,sourceRoot,{'bootstrap/backends/regexp.eli':resolve(root,'bootstrap/backends/regexp.eli')});
 source=await readFile(resolve(root,'bootstrap/compiler/project.eli'),'utf8');
 runtime=b.compiler.compile_ir_string(await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');
 program=b.compiler.compile_ir_string(source,'project.eli');
 const load=text=>import('data:text/javascript;base64,'+Buffer.from(b.compiler.compile_string(expose(text),'project.eli')).toString('base64'));
 reference=await load(original(source));ported=await load(source);
 const helpers=names.map(name=>definition(source,name)).join('\n')+'\n(defun coercion-error (sentinel) (fail (js-object :toString (lambda () (throw sentinel))))) (defun same-value (left right) (eq left right)) (export coercion-error same-value '+names.join(' ')+')';
 helperBytes=Uint8Array.from(b.managed.emit_managed_wasm(b.compiler.compile_ir_string(helpers,'project-diagnostics.eli'),runtime));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(helperBytes)),[]);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
test('the complete project module compiles to zero-import WASM without changing its input IR',()=>{
 const saved=JSON.stringify(program);try{bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime));}catch(error){console.error(JSON.stringify(error.eliscriptDiagnostic));throw error;}assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
},120000);

async function openHelpers(options={}){const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href);return instantiateManagedRuntime(helperBytes,options);}
function finish(a,owned=[]){owned.forEach(value=>a.release(value));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14)return Array.from({length:a.length(v)},(_,i)=>{const item=a.get(v,i);try{return read(a,item);}finally{a.release(item);}});if(v?.kind===13){const result={},keys=a.objectKeys(v);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),value=a.objectGet(v,key);try{result[a.readString(key)]=read(a,value);}finally{a.release(key);a.release(value);}}}finally{a.release(keys);}return result;}return v;}
function field(a,value,key){const k=a.string(key);try{return a.objectGet(value,k);}finally{a.release(k);}}
function outcome(fn,args){try{return{value:fn(...args)};}catch(error){return{error:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic};}}
test('all three portable diagnostic arrows preserve original Error constructor lookup, coercion, setters and input identity',()=>{
 function observe(fn,filename,mode){
  const events=[],sentinel={},BaseError=globalThis.Error,descriptor=Object.getOwnPropertyDescriptor(globalThis,'Error');
  const message={ [Symbol.toPrimitive](hint){events.push('message:'+hint);if(mode==='coercion')throw sentinel;return mode==='symbol'?Symbol('message'):'错误😀';} };
  let thrown;
  const Ctor=function(value){events.push('construct');if(mode==='constructor')throw sentinel;const error=new BaseError(value);Object.defineProperty(error,'eliscriptDiagnostic',{set(diagnostic){events.push('diagnostic');if(mode==='setter')throw sentinel;Object.defineProperty(this,'saved',{value:diagnostic});}});return error;};
  try{Object.defineProperty(globalThis,'Error',{configurable:true,get(){events.push('Error');if(mode==='lookup')throw sentinel;return Ctor;}});try{fn(message,filename,'ignored');}catch(error){thrown={sentinel:error===sentinel,type:error instanceof TypeError,message:error instanceof BaseError?error.message:undefined,messageIdentity:error.saved?.message===message,location:error.saved?.location,keys:error.saved?Object.keys(error.saved):[]};}}
  finally{Object.defineProperty(globalThis,'Error',descriptor);}
  return{events,thrown};
 }
 for(const name of names){const expected=reference[jsName(name)],actual=ported[jsName(name)];assert.equal(actual.length,expected.length);assert.equal(Object.hasOwn(actual,'prototype'),false);assert.throws(()=>Reflect.construct(function(){},[],actual),TypeError);
  for(const filename of [undefined,null,false,true,0,-0,NaN,'','输入😀.json',{},[],Symbol('file')])for(const mode of ['normal','lookup','constructor','coercion','symbol','setter'])assert.deepEqual(observe(actual,filename,mode),observe(expected,filename,mode),name+':'+mode);
  for(const message of [undefined,null,false,0,-0,NaN,'','wrong',Symbol('message')])assert.deepEqual(outcome(actual,[message]),outcome(expected,[message]),name);
 }
});
test('WASM diagnostic helpers keep exact diagnostic fields, filename JS truth, and Error own-key contract under allocation GC',async()=>{
 const a=await openHelpers();a.auto(1);
 try{for(const name of names)for(const input of [undefined,null,false,0,-0,NaN,'','错误😀'])for(const filename of [undefined,null,false,0,-0,NaN,'','配置😀.json']){
  const box=value=>typeof value==='string'?a.string(value):typeof value==='number'?a.number(value):value,message=box(input),file=box(filename);let error;
  try{assert.throws(()=>a.invoke(name,[message,file]),value=>{error=value;return value?.kind===13;});const text=field(a,error,'message'),diagnostic=field(a,error,'eliscriptDiagnostic'),saved=field(a,diagnostic,'message'),keys=a.objectKeys(error);
   try{const oracle=outcome(reference[jsName(name)],[input,filename]);assert.equal(a.readString(text),oracle.message);assert.deepEqual(read(a,diagnostic),oracle.diagnostic);assert.deepEqual(read(a,keys),['eliscriptDiagnostic']);if(typeof input==='number')assert(Object.is(a.readNumber(saved),input));}finally{[text,diagnostic,saved,keys].forEach(v=>a.release(v));}
  }finally{[error,message,file].forEach(v=>a.release(v));}a.collect();assert.equal(a.stats().frameDepth,0);
 }}finally{finish(a);}
},120000);

const publicFunctions=['project-plan','portable-project-plan','project-build-report','project-request','project-configuration','build-operation-request','check-operation-request','project-check-report','project-cache-lookup','project-cache-decision'];
let publicBytes,publicEntry;
function entrySource(){
 const exports=source.slice(source.lastIndexOf('(export')+7).replace(/[()]/g,'').trim().split(/\s+/),constants=exports.filter(name=>!publicFunctions.includes(name));assert.equal(exports.length,27);
 const branches=publicFunctions.filter(name=>!name.endsWith('project-plan')).map(name=>'((= name '+JSON.stringify(name)+') ('+name+' input'+(name==='project-configuration'?' filename':'')+'))').join('\n');
 return `(import "./project.mjs" ${exports.join(' ')})
 (defun call (name text filename) (let ((input (JSON/parse text)))
   (JSON/stringify (cond
    ((= name "project-plan") (let ((calls (js-array))) (let ((plan (project-plan (get input :entries) (lambda (id) (js-call calls :push id) (or (get (get input :graph) id) (js-array)))))) (js-object :plan plan :calls calls))))
    ((= name "portable-project-plan") (let ((calls (js-array))) (let ((plan (portable-project-plan (get input :entries) (lambda (id entries) (js-call calls :push (js-array id (js-call entries :slice))) (if (= id "a") (if (js-call entries :includes "z") (js-array (js-object :id "c" :entries (js-array "q"))) (js-array (js-object :id "b" :entries (js-array "y")))) (if (= id "b") (js-array (js-object :id "a" :entries (js-array "z"))) (js-array))))))) (js-object :plan plan :calls calls))))
    ${branches}))))
 (defun constants () (JSON/stringify (js-array ${constants.join(' ')})))
 (defun frozen (name text filename) (let ((input (JSON/parse text))) (Object/isFrozen (cond ${branches}))))
 (export call constants frozen)`;
}
async function openProject(options={}){if(!publicBytes){publicEntry=entrySource();const graph=[{id:'project.mjs',program},{id:'entry.mjs',program:b.compiler.compile_ir_string(publicEntry,'project-entry.eli')}],saved=JSON.stringify(graph);publicBytes=Uint8Array.from(b.managed.emit_managed_project_wasm(graph,'entry.mjs',runtime));assert.equal(JSON.stringify(graph),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(publicBytes)),[]);}const {instantiateManagedRuntime}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href);return instantiateManagedRuntime(publicBytes,options);}
function oracle(m,name,input,filename){if(name==='project-plan'){const calls=[],plan=m.project_plan(input.entries,id=>{calls.push(id);return input.graph[id]??[];});return{plan,calls};}if(name==='portable-project-plan'){const calls=[],plan=m.portable_project_plan(input.entries,(id,entries)=>{calls.push([id,[...entries]]);return id==='a'?entries.includes('z')?[{id:'c',entries:['q']}]:[{id:'b',entries:['y']}]:id==='b'?[{id:'a',entries:['z']}]:[];});return{plan,calls};}return m[jsName(name)](input,filename);}
function expectedPublic(m,name,input,filename){try{return{value:JSON.stringify(oracle(m,name,JSON.parse(JSON.stringify(input)),filename))};}catch(error){return{error:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic};}}
function actualPublic(a,name,input,filename){const method=a.string(name),text=a.string(JSON.stringify(input)),file=typeof filename==='string'?a.string(filename):filename;try{let out;try{out=a.invoke('call',[method,text,file]);}catch(error){if(error?.kind!==13)throw error;const errorName=field(a,error,'name'),message=field(a,error,'message'),diagnostic=field(a,error,'eliscriptDiagnostic');try{return{error:a.readString(errorName),message:a.readString(message),diagnostic:read(a,diagnostic)};}finally{[error,errorName,message,diagnostic].forEach(v=>a.release(v));}}try{return{value:a.readString(out)};}finally{a.release(out);}}finally{[method,text,file].forEach(v=>a.release(v));}}
const request={entry:'src/main.eli',outDir:'dist',root:null,portableEntries:['z','a','z'],useCache:true};
const configuration={schemaVersion:1,entry:'src/main.eli',outDir:'dist'};
const report={mode:'standard',root:'project',outDir:'dist',entry:'src/main.eli',entryOutput:'src/main.mjs',manifest:'eliscript-project.json',digest:'abc123',portableEntries:[],cache:{enabled:true,reason:'verified'},timings:{cacheReadMs:0.1236,workMs:1.2344,manifestWriteMs:0.3456,totalMs:1.7036},modules:[{source:'src/value.eli',output:'src/value.mjs',sourceMap:'src/value.mjs.map',status:'compiled',reason:'source-changed',dependencies:[],portableEntries:[]},{source:'src/main.eli',output:'src/main.mjs',sourceMap:'src/main.mjs.map',status:'reused',reason:'verified',dependencies:['src/value.eli','src/value.eli'],portableEntries:[],macroDependencies:[{path:'z.txt',digest:'f'.repeat(64)},{path:'a.txt',digest:'0'.repeat(64)}]}]};
const checks={mode:'standard',root:'project',entries:['z.eli','a.eli'],portableEntries:[],modules:[{source:'z.eli',dependencies:['a.eli','a.eli'],portableEntries:[]},{source:'a.eli',dependencies:[],portableEntries:[]}]};
const record={identity:{source:'src/main.eli',output:'src/main.mjs',sourceMap:'src/main.mjs.map',sourceDigest:'source',outputDigest:'output',sourceMapDigest:'map'},metadata:{source:'src/main.eli',dependencies:[],portableEntries:[]}};
const decision={record,output:'src/main.mjs',sourceMap:'src/main.mjs.map',expectedPortableEntries:[],sourceDigest:'source',outputExists:true,sourceMapExists:true,outputDigest:'output',sourceMapDigest:'map',dependenciesValid:true};
const lookup={enabled:true,manifestStatus:'readable',expectedEntry:'src/main.mjs',graphDigestValid:true,cacheDigestValid:true,compilerDigest:'compiler',mode:'standard',portableEntries:[],manifest:{format:'eliscript-project',version:1,entry:'src/main.mjs',digest:'manifest',modules:[record.identity],cache:{format:'eliscript-project-cache',version:2,compilerDigest:'compiler',mode:'standard',portableEntries:[],modules:[record.metadata]}}};
function validCases(){return[
 ['project-plan',{entries:['b','a','a'],graph:{a:['b'],b:['a']}}],
 ['project-plan',{entries:['é','e\u0301','😀','𐀀','\ue000'],graph:{}}],
 ['portable-project-plan',{entries:[{id:'a',entries:['x']}]}],
 ['project-request',request],['project-request',{...request,entry:undefined,entries:['src/z.eli','src/a.eli'],portableEntries:[]}],
 ['project-configuration',configuration],['project-configuration',{schemaVersion:2,sourceRoot:'src',entries:['z.eli','a.eli'],outDir:'dist'}],['project-configuration',{...configuration,macroCapabilities:['read-file'],macroFileDependencies:['z.txt','a.txt']}],
 ['build-operation-request',{mode:'single',input:'src/main.eli'}],['build-operation-request',{mode:'single',input:'src/main.eli',output:'main.mjs',sourceMap:true,portableEntries:['z','a','z']}],['build-operation-request',{mode:'project',...request}],
 ['check-operation-request',{mode:'project',...request}],['project-check-report',checks],
 ['project-build-report',report],['project-build-report',{...report,entry:undefined,entryOutput:undefined,entries:['src/z.eli','src/a.eli'],entryOutputs:['src/z.mjs','src/a.mjs']}],
 ['project-cache-lookup',lookup],['project-cache-lookup',{...lookup,enabled:false}],['project-cache-lookup',{...lookup,manifestStatus:'missing'}],['project-cache-lookup',{...lookup,manifestStatus:'unreadable'}],['project-cache-lookup',{...lookup,graphDigestValid:false}],
 ['project-cache-decision',decision],...['sourceDigest','outputDigest','sourceMapDigest'].map(key=>['project-cache-decision',{...decision,[key]:'changed'}]),['project-cache-decision',{...decision,artifactFailure:'artifact-unreadable'}],['project-cache-decision',{...decision,macroDependenciesMatch:false}],
 ];}
function invalidCases(){return[
 ...publicFunctions.filter(name=>!name.endsWith('project-plan')).map(name=>[name,null]),
 ['project-plan',{entries:null,graph:{}}],['portable-project-plan',{entries:null}],
 ['project-plan',{entries:[],graph:{}}],['project-plan',{entries:['a'],graph:{a:[42]}}],
 ['portable-project-plan',{entries:[]}],
 ['project-request',{...request,portableEntries:[42]}],['project-request',{...request,entries:['x']}],['project-request',{...request,useCache:'yes'}],
 ...[{...configuration,undeclared:true},{...configuration,entry:'../main.eli'},{...configuration,cache:'yes'},{schemaVersion:2,entries:[],outDir:'dist'},{...configuration,macroCapabilities:['network']},{...configuration,macroFileDependencies:['build.txt']},{...configuration,macroCapabilities:['read-file'],macroFileDependencies:['../build.txt']}].map(input=>['project-configuration',input]),
 ['build-operation-request',{mode:'single',input:'x',sourceMap:true}],['build-operation-request',{mode:'wrong'}],
 ['check-operation-request',{...request,entry:42}],['project-check-report',{...checks,modules:[checks.modules[0],checks.modules[0]]}],
 ['project-build-report',{...report,cache:{enabled:'yes',reason:'verified'}}],['project-build-report',{...report,timings:{...report.timings,workMs:-1}}],['project-build-report',{...report,modules:[{...report.modules[0],macroDependencies:[{path:'bad',digest:'g'.repeat(64)}]}]}],
 ['project-cache-lookup',{...lookup,enabled:'yes'}],['project-cache-lookup',{...lookup,manifestStatus:'wrong'}],
 ];}
test('all public project functions preserve original small request plan cache report cases and UTF16 graph order',async()=>{
 const a=await openProject({maxSlots:8192,initialBytes:1048576});a.auto(1);
 try{const constants=source.slice(source.lastIndexOf('(export')+7).replace(/[()]/g,'').trim().split(/\s+/).filter(name=>!publicFunctions.includes(name)),value=a.invoke('constants');try{assert.deepEqual(JSON.parse(a.readString(value)),constants.map(name=>reference[jsName(name)]));}finally{a.release(value);}
 for(const[name,input]of validCases()){const expected=expectedPublic(reference,name,input,'配置😀.json');assert.equal(Object.hasOwn(expected,'error'),false,name+':'+JSON.stringify(input));assert.deepEqual(expectedPublic(ported,name,input,'配置😀.json'),expected);assert.deepEqual(actualPublic(a,name,input,'配置😀.json'),expected,name);a.collect();assert.equal(a.stats().frameDepth,0);}}
 finally{finish(a);}
},120000);
test('original project negative cases retain diagnostic codes phases locations and recover under allocation GC',async()=>{
 const a=await openProject({maxSlots:8192,initialBytes:1048576});a.auto(1);
 try{for(const[name,input]of invalidCases()){const expected=expectedPublic(reference,name,input,'配置😀.json');assert.equal(Object.hasOwn(expected,'error'),true,name+':'+JSON.stringify(input));assert.deepEqual(expectedPublic(ported,name,input,'配置😀.json'),expected);assert.deepEqual(actualPublic(a,name,input,'配置😀.json'),expected,name);a.collect();assert.equal(a.stats().frameDepth,0);}assert.deepEqual(actualPublic(a,'project-configuration',configuration),expectedPublic(reference,'project-configuration',configuration));}
 finally{finish(a);}
},120000);

test('project OOM preserves an external caller frame and negative zero root before later configuration recovery',async()=>{
 const a=await openProject({maxSlots:1024,initialBytes:262144,maxBytes:16777216});a.auto(1);const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 try{const large={...configuration,portableEntries:Array.from({length:1024},(_,i)=>'entry-'+i)};assert.throws(()=>actualPublic(a,'project-configuration',large,'capacity.json'),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.collect();assert.deepEqual(actualPublic(a,'project-configuration',configuration),expectedPublic(reference,'project-configuration',configuration));}
 finally{a.leaveFrame(frame);finish(a,[held]);}
},120000);
test('public outputs remain frozen and Node executes the same whole project WASM against the original JS oracle',async()=>{
 const a=await openProject();a.auto(1);
 try{for(const[name,input]of validCases().filter(([name])=>!name.endsWith('project-plan'))){const method=a.string(name),text=a.string(JSON.stringify(input)),file=a.string('配置.json');try{assert.equal(a.invoke('frozen',[method,text,file]),true,name);assert.equal(Object.isFrozen(oracle(reference,name,structuredClone(input),'配置.json')),true);}finally{[method,text,file].forEach(v=>a.release(v));}}}finally{finish(a);}
 const sourcePath=resolve(directory,'project-original.mjs'),candidatePath=resolve(directory,'project-candidate.mjs'),wasm=resolve(directory,'project.wasm'),cases=resolve(directory,'project-cases.json');
 await writeFile(sourcePath,b.compiler.compile_string(expose(original(source)),'project.eli'));await writeFile(candidatePath,b.compiler.compile_string(expose(source),'project.eli'));await writeFile(wasm,publicBytes);
 const records=[...validCases(),...invalidCases()].map(([name,input])=>({name,input,filename:'配置😀.json',expected:expectedPublic(reference,name,input,'配置😀.json')}));await writeFile(cases,JSON.stringify(records));
 const child=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const original=await import(process.argv[1]),candidate=await import(process.argv[2]),{instantiateManagedRuntime}=await import(process.argv[3]),a=instantiateManagedRuntime(readFileSync(process.argv[4]));const jsName=name=>name.replaceAll('-','_');${oracle.toString()}\n${expectedPublic.toString()}\n${read.toString()}\n${field.toString()}\n${actualPublic.toString()}\na.auto(1);for(const r of JSON.parse(readFileSync(process.argv[5],'utf8'))){assert.deepEqual(expectedPublic(original,r.name,r.input,r.filename),r.expected);assert.deepEqual(expectedPublic(candidate,r.name,r.input,r.filename),r.expected);assert.deepEqual(actualPublic(a,r.name,r.input,r.filename),r.expected);a.collect();assert.equal(a.stats().frameDepth,0);}a.closeModule();a.collect();assert.equal(a.live(),0);`,pathToFileURL(sourcePath).href,pathToFileURL(candidatePath).href,pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href,wasm,cases],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},120000);

test('diagnostic message coercion preserves a thrown source object identity and caller roots',async()=>{
 const a=await openHelpers();a.auto(1);const sentinel=a.sourceObject({}),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);let thrown;
 try{assert.throws(()=>a.invoke('coercion-error',[sentinel]),error=>{thrown=error;return error?.kind===13;});assert.equal(a.invoke('same-value',[thrown,sentinel]),true);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));}
 finally{a.leaveFrame(frame);finish(a,[thrown,sentinel,held]);}
});
