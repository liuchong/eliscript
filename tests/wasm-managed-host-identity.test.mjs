import {beforeAll,afterAll,test} from 'bun:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';import {instantiateManagedRuntime,instantiateManagedRuntimeWithHostModules} from '../tools/backends/managed-runtime.mjs';import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {createManagedProjectFacades} from '../tools/backends/managed-module-graph.mjs';
const projectCases=JSON.parse(await readFile(new URL('./fixtures/managed-host-identity-projects.json',import.meta.url),'utf8'));
let b,rt,program,bytes,lowered,directory,reference;const options={maxSlots:2048,initialBytes:65536,maxBytes:16777216};
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-host-token-'));b=await buildBackends({outputRoot:directory});rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-host-identity.eli','utf8'),'host-identity.eli');reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(){if(!bytes){const saved=JSON.stringify(program);lowered=b.managed.lower_managed_program(program,rt);bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,rt));assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);}return bytes;}
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14){const out=[];for(let i=0;i<a.length(v);i++){const child=a.get(v,i);try{out.push(read(a,child));}finally{a.release(child);}}return out;}return v;}
function value(a,name,args=[]){const out=a.invoke(name,args);try{return read(a,out);}finally{a.release(out);}}
function finish(a,values=[]){try{values.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}finally{a.close?.();}}
function identities(a){a.auto(1);const x=a.sourceObject({}),y=a.sourceObject({});try{const first=value(a,'token',[x]);assert.equal(first,1);assert.equal(value(a,'alias',[x]),first);assert.equal(value(a,'nested',[x]),first);assert.equal(value(a,'token',[y]),2);for(let i=0;i<8;i++){a.collect();assert.equal(value(a,'token',[x]),first);}assert.deepEqual(value(a,'effects'),[true,[1,2]]);assert.deepEqual(value(a,'abrupt'),[true,[1]]);assert.deepEqual(value(a,'no-conversion'),[]);const symbols=value(a,'symbol-case');assert.equal(symbols[0],symbols[2]);assert.notEqual(symbols[0],symbols[1]);const functions=value(a,'function-case');assert.equal(functions[0],functions[2]);assert.notEqual(functions[0],functions[1]);}finally{finish(a,[x,y]);}}
test('Given the existing intrinsic when a module is lowered then its private identity table executes in zero-import WASM',()=>{identities(instantiateManagedRuntime(artifact(),options));});
test('Given scalar inputs when host identity is requested then original TypeError messages and later calls recover',()=>{const a=instantiateManagedRuntime(artifact(),options);a.auto(1);const values=[null,undefined,false,true,a.number(-0),a.number(NaN),a.string('')];try{for(const x of values){const raw=x?.kind===4?a.readNumber(x):x?.kind===5?a.readString(x):x;assert.equal(value(a,'safe',[x]),reference.safe(raw));}const object=a.sourceObject({});try{assert.equal(value(a,'token',[object]),1);}finally{a.release(object);}}finally{finish(a,values);}});
test('Given wrong source and IR arity when lowering then no operand is dropped or accepted',()=>{for(const source of['(host-identity-token)','(host-identity-token 1 2)'])assert.throws(()=>b.compiler.compile_string(source,'arity.eli'));for(const count of[0,2]){const p=b.compiler.compile_ir_string('(defun token (x) (host-identity-token x))','arity.eli'),node=p.body[0].children.at(-1);node.children=count===0?[]:[node.children[0],node.children[0]];assert.throws(()=>b.managed.lower_managed_program(p,rt),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');}});
test('Given no intrinsic when an ordinary function is lowered then no hidden state or module ABI is allocated',()=>{const p=b.compiler.compile_ir_string('(defun identity (x) x) (export identity)','plain.eli'),out=b.managed.lower_managed_program(p,rt);assert.equal(out.descriptor.abi,'managed-control-v1');assert.equal(out.descriptor.module,undefined);});
const projectSources=projectCases.project;
let projectFixture;
async function project(){if(projectFixture)return projectFixture;const base=resolve(directory,'project');await mkdir(base);const modules=[];for(const[id,source]of Object.entries(projectSources)){const p=b.compiler.compile_ir_string(source,id.replace(/\.mjs$/,'.eli'));modules.push({id,program:p});await writeFile(resolve(base,id),b.compiler.emit_ir_string(p));}const saved=JSON.stringify(modules),lowered=b.managed.lower_managed_project(modules,'main.mjs',rt),bytes=Uint8Array.from(b.managed.emit_managed_project_wasm(modules,'main.mjs',rt));assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);assert.deepEqual(Uint8Array.from(b.managed.emit_managed_project_wasm([...modules].reverse(),'main.mjs',rt)),bytes);const child=spawnSync('node',['--input-type=module','-e','const m=await import(process.argv[1]);const x={},y={};console.log(JSON.stringify({values:m.encounters(x,y),same:m.left===m.left_copy}));',pathToFileURL(resolve(base,'main.mjs')).href],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);return projectFixture={bytes,lowered,expected:JSON.parse(child.stdout)};}
function encounters(a,p){a.auto(1);const x=a.sourceObject({}),y=a.sourceObject({}),left=a.getExport('left'),copy=a.getExport('left_copy');try{assert.equal(a.keyEqual(left,copy),p.expected.same);assert.deepEqual(value(a,'encounters',[x,y]),p.expected.values);assert.deepEqual(p.expected.values,[1,2,1,2,1,1,2]);assert.equal(value(a,'left',[x]),1);assert.equal(value(a,'right',[x]),2);assert.equal(value(a,'closure',[x]),1);assert.equal(value(a,'own',[x]),2);}finally{finish(a,[x,y,left,copy]);}}
test('Given linked modules with opposite encounter orders when imported aliases and closures are called then defining-module identity tables remain separate',async()=>{const p=await project();encounters(instantiateManagedRuntime(p.bytes,options),p);},30000);
function heapIsolation(first,second){const x=first.sourceObject({}),y=second.sourceObject({});try{assert.equal(value(first,'token',[x]),1);assert.equal(value(second,'token',[y]),1);assert.equal(value(first,'token',[x]),1);assert.equal(value(second,'token',[y]),1);assert.throws(()=>first.invoke('token',[y]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');}finally{try{finish(first,[x]);}finally{finish(second,[y]);}}}
test('Given two heaps executing identical module bytes when encounter order differs then tokens remain heap-local',()=>{heapIsolation(instantiateManagedRuntime(artifact(),options),instantiateManagedRuntime(artifact(),options));});
test('Given an operand that collects or throws when identity is evaluated then exactly one evaluation and the original thrown identity survive',()=>{const a=instantiateManagedRuntime(artifact(),options);a.auto(1);try{assert.deepEqual(value(a,'effects'),[true,[1,2]]);assert.deepEqual(value(a,'abrupt'),[true,[1]]);}finally{finish(a);}});
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given a true native module and linked project when the same identities are encountered then the WASM and original JS contracts agree',async()=>{artifact();const one=resolve(directory,'host-token.dylib');await writeFile(one,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));identities(await instantiateNativeManagedRuntime(one,lowered,options));heapIsolation(await instantiateNativeManagedRuntime(one,lowered,options),await instantiateNativeManagedRuntime(one,lowered,options));const p=await project(),many=resolve(directory,'host-token-project.dylib');await writeFile(many,Uint8Array.from(b.native.emit_typed_native_memory_library(p.lowered.typed,'arm64-macos')));encounters(await instantiateNativeManagedRuntime(many,p.lowered,options),p);},120000);

test('Given cyclic modules before the defining module evaluates when an exported function uses its helper then the original TDZ is preserved',async()=>{
 const sources=projectCases.cycle,base=resolve(directory,'cycle');await mkdir(base);const modules=[];for(const[id,source]of Object.entries(sources)){const p=b.compiler.compile_ir_string(source,id.replace(/\.mjs$/,'.eli'));modules.push({id,program:p});await writeFile(resolve(base,id),b.compiler.emit_ir_string(p));}
 const child=spawnSync('node',['--input-type=module','-e','const m=await import(process.argv[1]);console.log(m.early);',pathToFileURL(resolve(base,'main.mjs')).href],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'ReferenceError');
 const a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_project_wasm(modules,'main.mjs',rt)),options);try{const early=a.getExport('early');try{assert.equal(a.readString(early),child.stdout.trim());}finally{a.release(early);}}finally{finish(a);}
},30000);

test('Given identical zero-import bytes when Node calls imported aliases then module identity behavior remains the same',async()=>{
 const p=await project(),path=resolve(directory,'host-token-project.wasm');await writeFile(path,p.bytes);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const bytes=readFileSync(process.argv[2]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',read.toString(),value.toString(),finish.toString(),encounters.toString(),'const a=instantiateManagedRuntime(bytes,'+JSON.stringify(options)+');encounters(a,{expected:'+JSON.stringify(p.expected)+'});'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,path],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},40000);
test('Given a cyclic early helper call when its operand has effects and throws then callee TDZ precedes every operand effect',async()=>{
 const sources={
  'trace.mjs':'(defconst trace (js-array)) (export trace)',
  'main.mjs':'(import "./trace.mjs" trace) (import "./early.mjs" early) (defun token () (host-identity-token (progn (js-call trace :push "arg") (throw "operand")))) (export early token)',
  'early.mjs':'(import "./main.mjs" token) (import "./trace.mjs" trace) (defconst early (try (token) (catch error (js-array (get error :name) (= error "operand") trace)))) (export early)'
 },base=resolve(directory,'cycle-operands');await mkdir(base);const modules=[];for(const[id,source]of Object.entries(sources)){const p=b.compiler.compile_ir_string(source,id.replace(/\.mjs$/,'.eli'));modules.push({id,program:p});await writeFile(resolve(base,id),b.compiler.emit_ir_string(p));}
 const child=spawnSync('node',['--input-type=module','-e','const m=await import(process.argv[1]);console.log(JSON.stringify(m.early));',pathToFileURL(resolve(base,'main.mjs')).href],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);const expected=JSON.parse(child.stdout);assert.deepEqual(expected,['ReferenceError',false,[]]);
 const a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_project_wasm(modules,'main.mjs',rt)),options);a.auto(1);try{const early=a.getExport('early');try{assert.deepEqual(read(a,early),expected);}finally{a.release(early);}}finally{finish(a);}
},30000);

// This helper serializes a real lowerer's product. It supplies no executable
// implementation: private identity tables and initialization run in the bytes.
function groupedIdentityProduct(input,groups){
 const lowered=b.managed.lower_managed_program(input,rt,false,undefined,undefined,groups);
 const binary=b.wasm.emit_typed_memory_wasm(lowered.typed);
 const bytes=Uint8Array.from(b.wasm.append_metadata_section(binary,'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 return{bytes,lowered};
}
function firstIdentityNodes(input){
 const found=[],pending=[...input.body].reverse();
 while(pending.length){const node=pending.pop();if(node.kind==='intrinsic'&&node.value==='host-identity-token')found.push(node);pending.push(...[...node.children].reverse());}
 return found;
}
function identityBoundary(a){
 a.auto(1);const x=a.sourceObject({}),y=a.sourceObject({});
 try{assert.equal(value(a,'left',[x]),1);assert.equal(value(a,'right',[y]),2);assert.equal(value(a,'left',[y]),2);assert.equal(value(a,'right',[x]),1);a.collect();assert.equal(value(a,'left',[x]),1);}
 finally{finish(a,[x,y]);}
}
const boundarySource='(defun left (x) (host-identity-token x)) (defun right (x) (host-identity-token x)) (export left right)';
test('Given only functions and no source globals when the default nil boundary is lowered then one private table initializes before the first call',()=>{
 const input=b.compiler.compile_ir_string(boundarySource,'function-only-identity.eli'),saved=JSON.stringify(input);
 const product=groupedIdentityProduct(input,undefined);assert.equal(JSON.stringify(input),saved);
 assert.equal(product.lowered.descriptor.module.bindingCount,1);
 identityBoundary(instantiateManagedRuntime(product.bytes,options));
 for(const before of[null,undefined]){
  const explicit=groupedIdentityProduct(input,[{nodes:firstIdentityNodes(input),before}]);
  assert.deepEqual(explicit.bytes,product.bytes);identityBoundary(instantiateManagedRuntime(explicit.bytes,options));
 }
});
test('Given a first source initializer that invokes identity when module state is created then the private helper precedes source effects without changing global indices',()=>{
 const source='(defconst trace (js-array)) '+
  '(defun encounter () (let ((item (js-object))) (js-call trace :push (host-identity-token item)))) '+
  '(defconst first (encounter)) (defconst second (encounter)) '+
  '(defun run () (js-array first second trace)) (export run)',input=b.compiler.compile_ir_string(source,'identity-first-initializer.eli');
 const product=groupedIdentityProduct(input,undefined),a=instantiateManagedRuntime(product.bytes,options);
 assert.equal(product.lowered.descriptor.module.bindingCount,4);
 try{assert.deepEqual(value(a,'run'),[1,2,[1,2]]);a.collect();assert.deepEqual(value(a,'run'),[1,2,[1,2]]);}finally{finish(a);}
});
test('Given multiple explicit groups at one empty-global boundary when functions execute then group-index insertion retains separate monotonic identity tables',()=>{
 const input=b.compiler.compile_ir_string(boundarySource,'identity-shared-boundary.eli'),nodes=firstIdentityNodes(input);
 const product=groupedIdentityProduct(input,[{nodes:[nodes[0]],before:input.body[0]},{nodes:[nodes[1]],before:input.body[1]}]);
 assert.equal(product.lowered.descriptor.module.bindingCount,2);const a=instantiateManagedRuntime(product.bytes,options);a.auto(1);
 const x=a.sourceObject({}),y=a.sourceObject({});
 try{assert.equal(value(a,'left',[x]),1);assert.equal(value(a,'left',[y]),2);assert.equal(value(a,'right',[y]),1);assert.equal(value(a,'right',[x]),2);a.collect();assert.equal(value(a,'left',[x]),1);assert.equal(value(a,'right',[y]),1);}
 finally{finish(a,[x,y]);}
});
test('Given malformed group records or a foreign before node when lowering then structured ownership rejection precedes any metadata dereference',()=>{
 const input=b.compiler.compile_ir_string(boundarySource,'identity-invalid-boundary.eli'),nodes=firstIdentityNodes(input);
 const invalid=[null,false,'group',[],{}, {nodes:[]},{nodes:[],before:null},
  {nodes,before:false},{nodes,before:0},{nodes,before:'not-a-node'},{nodes,before:{}},
  {nodes,before:structuredClone(input.body[0])}];
 for(const record of invalid)assert.throws(()=>b.managed.lower_managed_program(input,rt,false,undefined,undefined,[record]),
  error=>error.eliscriptDiagnostic?.code==='ELI-B0001'&&error.message==='invalid managed host identity group');
 for(const groups of[[],[{nodes:[nodes[0]],before:null}],
  [{nodes,before:null},{nodes:[nodes[0]],before:null}],
  [{nodes:[structuredClone(nodes[0])],before:null}]])
  assert.throws(()=>b.managed.lower_managed_program(input,rt,false,undefined,undefined,groups),error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
 identityBoundary(instantiateManagedRuntime(groupedIdentityProduct(input,undefined).bytes,options));
});
test('Given malformed identity IR when the independent source prepass rejects it then direct lowering retains the original Error message and exact structured node span',()=>{
 const source=';; 中😀\n(defun token (x)\n (host-identity-token x)) (export token)';
 for(const count of[0,2]){
  const input=b.compiler.compile_ir_string(source,'identity-arity-中.eli'),node=firstIdentityNodes(input)[0],operand=node.children[0];
  node.children=count===0?[]:[operand,structuredClone(operand)];
  assert.throws(()=>b.managed.lower_managed_program(input,rt),error=>{
   const diagnostic=error.eliscriptDiagnostic;assert.equal(error.name,'Error');assert.equal(diagnostic?.code,'ELI-B0001');
   assert.equal(diagnostic.phase,'managed-backend');assert.equal(diagnostic.message,error.message);
   assert.equal(error.message,'host-identity-token expects 1 argument, got '+count);
   assert.equal(error.eliscriptIRSpan,node.span);
   assert.deepEqual(diagnostic.location,{file:'identity-arity-中.eli',
    start:{offset:node.span.start,line:node.span.line,column:node.span.column},
    end:{offset:node.span.end,line:node.span.endLine,column:node.span.endColumn}});return true;
  });
 }
});
test.skipIf(process.arch!=='arm64'||!['darwin','linux'].includes(process.platform))('Given a true native function-only module when its absent project boundary initializes then native preserves the same one-table token order',async()=>{
 const product=groupedIdentityProduct(b.compiler.compile_ir_string(boundarySource,'identity-native-boundary.eli'),undefined);
 const target=process.platform==='linux'?'arm64-linux':'arm64-macos',path=resolve(directory,'identity-native-boundary'+(process.platform==='linux'?'.so':'.dylib'));
 await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(product.lowered.typed,target)));
 identityBoundary(await instantiateNativeManagedRuntime(path,product.lowered,options));
},120000);
test('Given phased projects when each defining module reaches its evaluation boundary then private helpers stay out of preparation and cyclic TDZ still precedes operand effects',async()=>{
 for(const name of['project','cycle','cycleOperands']){
  const modules=Object.entries(projectCases[name]).map(([id,source])=>({id,program:b.compiler.compile_ir_string(source,id.replace(/\.mjs$/,'.eli'))}));
  const saved=JSON.stringify(modules),lowered=b.managed.lower_managed_project(modules,'main.mjs',rt,{phased:true});
  assert.equal(JSON.stringify(modules),saved);assert(lowered.descriptor.project);
  if(name==='project')for(const id of['a.mjs','b.mjs']){
   const module=lowered.descriptor.project.modules.find(module=>module.id===id);assert(module);
   assert.equal(module.steps.length,1,'function-only module retains its own helper evaluation step');
  }
  const bytes=Uint8Array.from(b.wasm.append_metadata_section(b.wasm.emit_typed_memory_wasm(lowered.typed),
   'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
  const deployment=resolve(directory,'phased-'+name);
  for(const file of createManagedProjectFacades(lowered.descriptor,{entry:'main.mjs'}).files){
   const filename=resolve(deployment,file.id);await mkdir(dirname(filename),{recursive:true});await writeFile(filename,file.source);
  }
  const a=await instantiateManagedRuntimeWithHostModules(bytes,{...options,
   projectModuleBaseURL:pathToFileURL(deployment+'/').href});a.auto(1);
  if(name==='project'){
   const p=await project();encounters(a,p);
  }else{
   try{const early=a.getExport('early');try{
    assert.deepEqual(read(a,early),name==='cycle'?'ReferenceError':['ReferenceError',false,[]]);
   }finally{a.release(early);}}finally{finish(a);}
  }
 }
},120000);

test('Given finite JSON identity domains when linking without serialization then escaped keys values and normalized binding spellings choose the original exact salt',async()=>{
 const {binding_name}=await import(pathToFileURL(resolve(directory,'bootstrap/symbol.mjs')).href);
 const bindingKinds=new Set(['function-declaration','variable-declaration','parameter-binding','lexical-binding',
  'binding-name','catch-binding','import-named','import-default','import-namespace']);
 function originalPrefix(modules){
  let identity=JSON.stringify(modules);const pending=modules.flatMap(module=>module.program.body);
  while(pending.length){const node=pending.pop();if(bindingKinds.has(node.kind)){
   let key=node.value;try{key=binding_name(key);}catch{}
   identity+=' '+key;
  }pending.push(...node.children);}
  let salt=0;while(identity.includes('$eliscript_link_'+salt+'_'))salt++;
  return'$eliscript_link_'+salt+'_';
 }
 const payloads=[{},
  {text:'$eliscript_link_0_'},
  {'quoted"\\\n$eliscript_link_1_':'$eliscript_link_0_'},
  {text:'$eliscript_link_00_ $eliscript_link_000_ $eliscript_link_999999999999999999999999999999999999999999999999_'},
  {text:Array.from({length:24},(_,index)=>'$eliscript_link_'+index+'_').join(' '),
   nested:[{'$eliscript_link_24_':'\u0000😀\ud800$eliscript_link_25_'}]},
 ];
 for(const name of['token','$eliscript-link-0-'])for(const payload of payloads){
  const p=b.compiler.compile_ir_string(`(defun ${name} () 1) (export ${name})`,'prefix-中.eli');
  Object.assign(p.body[0].properties,structuredClone(payload));
  const modules=[{id:'main.mjs',program:p}],saved=JSON.stringify(modules),prefix=originalPrefix(modules);
  const linked=b.managed.link_managed_project(modules,'main.mjs');
  assert.equal(linked.exports.length,1);assert.equal(linked.exports[0].internalName,prefix+'0');
  assert.equal(JSON.stringify(modules),saved);
 }
 const p=b.compiler.compile_ir_string('(defun token () 1) (export token)','invalid-prefix.eli');
 p.body[0].properties['$eliscript_link_0_']=undefined;
 assert.throws(()=>b.managed.link_managed_project([{id:'main.mjs',program:p}],'main.mjs'),
  error=>error.eliscriptDiagnostic?.code==='ELI-I0001'&&/unsupported JSON type undefined/.test(error.message));
 const first=b.compiler.compile_ir_string('(defun first () 1)','first-invalid.eli');
 first.body[0].properties.bad=NaN;
 assert.throws(()=>b.managed.link_managed_project([{id:'first.mjs',program:first},{id:'later.mjs',program:p}],'first.mjs'),
  error=>error.eliscriptDiagnostic?.code==='ELI-I0001'&&/finite numbers/.test(error.message));
});

test('Given exported reachable namespaces and unused imported namespaces when linking then only actual module order owns namespace bindings independent of input order',()=>{
 const sources={
  'main.mjs':'(import "./a.mjs" :as a) (export a)',
  'a.mjs':'(defun token (x) (host-identity-token x)) (export token)',
  'unused.mjs':'(import "./hidden.mjs" :as hidden) (export hidden)',
  'hidden.mjs':'(defconst value "$eliscript_link_0_") (export value)',
 };
 const modules=Object.entries(sources).map(([id,source])=>({id,program:b.compiler.compile_ir_string(source,id+'.eli')}));
 const saved=JSON.stringify(modules),linked=b.managed.link_managed_project(modules,'main.mjs');
 assert.deepEqual(linked.modules,['a.mjs','main.mjs']);assert.equal(linked.namespaces.length,1);
 assert.deepEqual(linked.namespaces[0].entries.map(entry=>entry.name),['token']);
 assert.deepEqual(linked.exports.map(entry=>entry.name),['a']);
 assert(linked.program.body.some(node=>node.kind==='variable-declaration'&&node.value===linked.exports[0].internalName&&node.children[0]?.kind==='managed-module-namespace'));
 const reversed=b.managed.link_managed_project([...modules].reverse(),'main.mjs');
 assert.deepEqual(reversed,linked);assert.equal(JSON.stringify(modules),saved);
});
