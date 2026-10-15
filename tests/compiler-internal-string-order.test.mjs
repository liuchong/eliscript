import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';

const names=['a','A','z','Z','ä','å','é','e\u0301','阿','中','重','𐀀','\uE000','\uD800','\uDC00','prefix','prefix-long'];
const expected=names.toSorted();
const transientSource=(left,right)=>`(import "./stdlib/core/transient.mjs" transient) (defasync build (source promise) (let ((${left} (transient source)) (${right} (transient source))) (await promise) nil))`;
const reportInput=()=>({mode:'standard',root:resolve(directory,'report-root'),outDir:resolve(directory,'report-root/dist'),entry:'src/main.eli',entryOutput:'src/main.mjs',manifest:'eliscript-project.json',digest:'supplied-identity-unchanged',portableEntries:[],cache:{enabled:false,reason:'disabled'},timings:{cacheReadMs:0,workMs:0,manifestWriteMs:0,totalMs:0},modules:names.map(name=>({source:`src/${name}.eli`,output:`src/${name}.mjs`,sourceMap:`src/${name}.mjs.map`,status:'compiled',reason:'source-changed',dependencies:[],portableEntries:[],macroDependencies:names.map(name=>({path:`macro/${name}.eli`,digest:'a'.repeat(64)}))}))});
let directory,b,project;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-internal-order-'));b=await buildBackends({outputRoot:directory});project=await import(pathToFileURL(resolve(directory,'bootstrap/project.mjs')).href);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('compiler build and check reports order every string by UTF16 code units without locale or canonical equivalence ties',()=>{
 const input=reportInput(),report=project.project_build_report(input),ordered=names.map(name=>`src/${name}.eli`).sort();
 assert.deepEqual(report.modules.map(module=>module.source),ordered);
 for(const module of report.modules)assert.deepEqual(module.macroDependencies.map(value=>value.path),names.map(name=>`macro/${name}.eli`).sort());
 assert.equal(report.digest,'supplied-identity-unchanged');assert(Object.isFrozen(report.modules));assert(report.modules.every(Object.isFrozen));
 const check=project.project_check_report({mode:'standard',root:resolve(directory,'report-root'),entries:ordered,portableEntries:[],modules:reportInput().modules});assert.deepEqual(check.modules.map(module=>module.source),ordered);assert.deepEqual(check.entries,ordered);
 for(const inputNames of[['é','e\u0301'],['e\u0301','é']])assert.deepEqual(project.project_check_report({mode:'standard',root:resolve(directory,'report-root'),entries:['main.eli'],portableEntries:[],modules:inputNames.map(source=>({source,dependencies:[],portableEntries:[]}))}).modules.map(module=>module.source),['e\u0301','é']);
});

test('multiple active transient resources choose the same UTF16 first diagnostic as the compiler Seed',()=>{
 for(const pair of[['a','A'],['ä','z'],['阿','中'],['𐀀','\uE000']]){
  let error;try{b.compiler.compile_ir_string(transientSource(...pair),'order.eli');}catch(caught){error=caught;}
  assert.equal(error?.eliscriptDiagnostic?.message,`transient binding ${pair.toSorted()[0]} cannot remain active across await`);
 }
});

test('the original public JS compiler reports and diagnostics do not depend on Node LANG or Bun host locale',()=>{
 const probe=`const c=await import(process.argv[1]);const names=${JSON.stringify(names)},source=${JSON.stringify(transientSource('ä','z'))};const modules=names.map(name=>({source:name,dependencies:[],portableEntries:[]}));let diagnostic;try{c.compile_ir_string(source,'order.eli')}catch(error){diagnostic=error.eliscriptDiagnostic};console.log(JSON.stringify({modules:c.project_check_report({mode:'standard',root:process.argv[2],entries:['main.eli'],portableEntries:[],modules}).modules.map(module=>module.source),diagnostic}));`;
 for(const runtime of['node','bun'])for(const lang of['en_US.UTF-8','sv_SE.UTF-8','zh_CN.UTF-8']){
  const child=spawnSync(runtime,runtime==='node'?['--input-type=module','-e',probe,pathToFileURL(resolve(directory,'bootstrap/compiler.mjs')).href,resolve(directory,'report-root')]:['--eval',probe,pathToFileURL(resolve(directory,'bootstrap/compiler.mjs')).href,resolve(directory,'report-root')],{encoding:'utf8',env:{...process.env,LANG:lang,LC_ALL:lang},timeout:30000});assert.equal(child.status,0,child.stderr);const actual=JSON.parse(child.stdout);assert.deepEqual(actual.modules,expected,runtime+':'+lang);assert.equal(actual.diagnostic.message,'transient binding z cannot remain active across await');
 }
});

const units=text=>Array.from({length:text.length},(_,index)=>text.charCodeAt(index));
test('Seed report output and transient comparison preserve full UTF16 order without changing manifest macro identity helpers or caller lists',()=>{
 const child=spawnSync(process.env.EMACS??'emacs',['--batch','-Q','-L',resolve('compiler'),'--load',resolve('tests/fixtures/compiler-internal-order-oracle.el')],{encoding:'utf8',env:{...process.env,ELISCRIPT_ORDER_ROOT:resolve(directory,'report-root'),ELISCRIPT_ORDER_NAMES:JSON.stringify(names.map(text=>Array.from(text,point=>point.codePointAt(0))))},timeout:30000});assert.equal(child.status,0,child.stderr);const actual=JSON.parse(child.stdout);
 assert.deepEqual(actual.modules,names.map(name=>`src/${name}.eli`).sort().map(units));assert.deepEqual(actual.macro,names.map(name=>`macro/${name}.eli`).sort().map(units));assert.deepEqual(actual.unchangedIdentityRecords,names.map(name=>units(`macro/${name}.eli`)));assert.equal(actual.digest,'supplied-identity-unchanged');assert.deepEqual(actual.comparisons,names.map(left=>names.map(right=>left<right?-1:left>right?1:0)));assert.deepEqual(actual.messages,[['a','A'],['ä','z'],['阿','中'],['𐀀','\uE000']].map(pair=>units(`transient binding ${pair.toSorted()[0]} cannot remain active across await`)));
});

function nodes(node){return[node,...(node.children??[]).flatMap(nodes)];}
function declarations(program){return program.body.flatMap(nodes);}
function decode(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14)return Array.from({length:a.length(value)},(_,index)=>{const item=a.get(value,index);try{return decode(a,item);}finally{a.release(item);}});if(value?.kind===13){const result={},keys=a.objectKeys(value);try{for(let index=0;index<a.length(keys);index++){const key=a.get(keys,index),child=a.objectGet(value,key);try{result[a.readString(key)]=decode(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return result;}return value;}
test('all four actual compiler sorting callbacks and private comparators execute the UTF16 policy in zero-import WASM with per-allocation GC',async()=>{
 const rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 const projectNodes=declarations(b.compiler.compile_ir_string(await readFile('bootstrap/compiler/project.eli','utf8'),'project.eli'));
 const transientNodes=declarations(b.compiler.compile_ir_string(await readFile('bootstrap/compiler/transient-analysis.eli','utf8'),'transient-analysis.eli'));
 const find=(list,name)=>{const node=list.find(node=>node.kind==='function-declaration'&&node.value===name);assert(node,name);return structuredClone(node);};
 const callbacks=name=>nodes(find(projectNodes,name)).filter(node=>node.kind==='method-call'&&node.children[1]?.value==='sort'&&node.children[2]?.kind==='function-expression').map(node=>structuredClone(node.children[2]));
 const reportCallbacks=[...callbacks('normalize-report-modules'),...callbacks('normalize-check-modules')];assert.equal(reportCallbacks.length,3);
 const shell=b.compiler.compile_ir_string('(defun utf16-string-order (left right) 0) (defun sorted-macro (values) (js-call values :sort (lambda (left right) 0))) (defun sorted-build (values) (js-call values :sort (lambda (left right) 0))) (defun sorted-check (values) (js-call values :sort (lambda (left right) 0))) (export sorted-macro sorted-build sorted-check utf16-string-order)','ordering-family.eli');
 for(let index=0;index<3;index++)nodes(shell.body[index+1]).find(node=>node.kind==='method-call'&&node.children[1]?.value==='sort').children[2]=reportCallbacks[index];
 shell.body[0]=find(projectNodes,'utf16-string-order');
 const active=b.compiler.compile_ir_string('(defun utf16-string-order (left right) 0) (defun visible-active-resources (context) nil) (defun active (names) (let* ((state (new (js* "Map"))) (context (js-object :state state :functionId 1))) (js-call names :forEach (lambda (name) (js-call state :set (js-object :name name :functionId 1) "active"))) (visible-active-resources context))) (export active utf16-string-order)','transient-ordering-family.eli');
 active.body[0]=find(transientNodes,'utf16-string-order');active.body[1]=find(transientNodes,'visible-active-resources');
 for(const[program,entries]of[[shell,['sorted-macro','sorted-build','sorted-check']],[active,['active']]]){
  const bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,rt));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes,{maxSlots:4096,initialBytes:262144});a.auto(1);
  const boxed=names.map(name=>a.string(name));
  for(let i=0;i<names.length;i++)for(let j=0;j<names.length;j++){const out=a.invoke('utf16-string-order',[boxed[i],boxed[j]]);assert.equal(a.readNumber(out),names[i]<names[j]?-1:names[i]>names[j]?1:0);a.release(out);}
  for(const entry of entries){const records=entry==='active'?boxed:boxed.map(name=>a.sourceObject(entry==='sorted-macro'?{path:name}:{source:name})),input=a.sourceArray(records),out=a.invoke(entry,[input]);assert.deepEqual(decode(a,out).map(value=>typeof value==='string'?value:entry==='active'?value.name:entry==='sorted-macro'?value.path:value.source),expected);a.release(out);a.release(input);if(entry!=='active')records.forEach(value=>a.release(value));}
  boxed.forEach(value=>a.release(value));a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);assert(a.stats().collections>100);
 }
},30000);

test('public Seed and three complete frontend generations retain identical JavaScript and Source Maps after internal ordering changes',async()=>{
 const files=(await readdir('bootstrap/compiler')).filter(name=>name.endsWith('.eli')).sort(),sources=await Promise.all(files.map(async name=>[name,await readFile(resolve('bootstrap/compiler',name),'utf8')]));assert.equal(files.length,13);
 let compiler=b.compiler,previous;
 for(let generation=1;generation<=3;generation++){
  const output=resolve(directory,'generation-'+generation);await mkdir(output,{recursive:true});const products=[];
  for(const[name,source]of sources){const emitted=compiler.compile_string_with_source_map(source,name,name.replace(/\.eli$/,'.mjs'),name);products.push([name,emitted.javascript,emitted.sourceMap]);await writeFile(resolve(output,name.replace(/\.eli$/,'.mjs')),emitted.javascript);}
  if(previous)assert.deepEqual(products,previous,'complete generation '+generation);previous=products;compiler=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);
  for(const pair of[['a','A'],['ä','z'],['阿','中'],['𐀀','\uE000']]){let error;try{compiler.compile_ir_string(transientSource(...pair),'order.eli');}catch(caught){error=caught;}assert.equal(error?.eliscriptDiagnostic?.message,`transient binding ${pair.toSorted()[0]} cannot remain active across await`);}
 }
},30000);
