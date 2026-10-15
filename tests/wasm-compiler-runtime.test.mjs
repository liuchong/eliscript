import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildWholeCompiler,readCompilerValue,finishCompiler} from './whole-compiler-rig.mjs';
let fixture,js,sourceNames;
beforeAll(async()=>{
 const source=await readFile('bootstrap/compiler/compiler.eli','utf8');sourceNames=source.slice(source.lastIndexOf('(export')+7).replace(/[()]/g,'').trim().split(/\s+/);
 const entrySource=`(import "./compiler.mjs" ${sourceNames.join(' ')})
 (defun runtime-plan (input) (let ((calls (js-array)))
  (let ((plan (project-plan (aref input "entries") (lambda (id) (js-call calls :push id) (or (aref (aref input "graph") id) (js-array)))))) (js-object :plan plan :calls calls))))
 (defun runtime-portable-plan (input) (let ((calls (js-array)))
  (let ((plan (portable-project-plan (aref input "entries") (lambda (id entries)
   (js-call calls :push (js-array id (js-call entries :slice)))
   (cond ((= id "a") (if (js-call entries :includes "z") (js-array (js-object :id "c" :entries (js-array "q"))) (js-array (js-object :id "b" :entries (js-array "y")))))
    ((= id "b") (js-array (js-object :id "a" :entries (js-array "z")))) (t (js-array))))))) (js-object :plan plan :calls calls))))
 (export ${sourceNames.join(' ')} runtime-plan runtime-portable-plan)`;
 fixture=await buildWholeCompiler({entrySource});js=fixture.backend.compiler;
},120000);
afterAll(async()=>{if(fixture)await fixture.close();});
function box(a,value){
 if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);
 if(value!==null&&typeof value==='object'){const values=Array.isArray(value)?value.map(v=>box(a,v)):Object.fromEntries(Object.entries(value).map(([key,v])=>[key,box(a,v)]));try{return Array.isArray(value)?a.sourceArray(values):a.sourceObject(values);}finally{for(const child of Object.values(values))a.release(child);}}
 return value;
}
function field(a,value,name){const key=a.string(name);try{return a.objectGet(value,key);}finally{a.release(key);}}
function call(a,name,args=[]){const roots=args.map(value=>box(a,value));try{const out=a.invoke(name,roots);try{return readCompilerValue(a,out);}finally{a.release(out);}}finally{for(const root of roots)a.release(root);}}
function sourceError(a,error){if(error?.kind!==13)throw error;const values=['name','message','eliscriptDiagnostic'].map(name=>field(a,error,name));try{return{error:readCompilerValue(a,values[0]),message:readCompilerValue(a,values[1]),diagnostic:readCompilerValue(a,values[2])};}finally{for(const root of[error,...values])a.release(root);}}
function outcome(a,name,args){try{return{value:call(a,name,args)};}catch(error){return sourceError(a,error);}}
function oracle(name,args){try{return{value:js[name](...args)};}catch(error){return{error:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic};}}
function compare(a,name,args){assert.deepEqual(outcome(a,name,args),oracle(name,args),name+': '+JSON.stringify(args));}
const corpus=[
 {source:'(defun add (a b) (+ a b)) (export add)',name:'add',calls:[[[20,22],42],[[-1,1],0]]},
 {source:'(defun run (x) (if x (+ x 1) 7)) (export run)',name:'run',calls:[[[false],7],[[0],1]]},
 {source:'(defun run (x) (let* ((a (+ x 1)) (b (* a 2))) b)) (export run)',name:'run',calls:[[[3],8]]},
 {source:'(defmacro twice (x) `(+ ,x ,x)) (defun run (x) (twice x)) (export run)',name:'run',calls:[[[21],42]]},
 {source:'(defun run () (try (throw (js-array 3 7)) (catch [first second] (+ first second)) (finally nil))) (export run)',name:'run',calls:[[[],10]]},
 {source:'(defun run (x) (let ((sum 0)) (while (> x 0) (setq sum (+ sum x)) (setq x (1- x))) sum)) (export run)',name:'run',calls:[[[4],10]]},
 {source:'(defun run () (js-array -0.0 false nil "中😀\\ud800")) (export run)',name:'run',calls:[]},
];
test('whole WASM compiler exposes every original compiler entry export and constant',async()=>{
 const a=await fixture.wasm();try{const expected=Object.keys(js).sort(),actual=sourceNames.map(name=>name.replaceAll('-','_')).sort();assert.deepEqual(actual,expected);for(const name of expected){const out=a.getExport(name);try{if(typeof js[name]==='function')assert.equal(out.kind,18,name);else assert.deepEqual(readCompilerValue(a,out),js[name],name);}finally{a.release(out);}}}finally{finishCompiler(a);}
});
test('whole WASM compile-string and real macros match JavaScript byte for byte and actual products execute in Node',async()=>{
 const a=await fixture.wasm(),products=[];try{await mkdir(resolve(fixture.directory,'node_modules'),{recursive:true});await symlink(resolve('.'),resolve(fixture.directory,'node_modules/eliscript'),'dir');
 for(let index=0;index<corpus.length;index++){const item=corpus[index],filename='runtime-'+index+'.eli',code=call(a,'compile_string',[item.source,filename]);assert(Buffer.from(code).equals(Buffer.from(js.compile_string(item.source,filename))),filename);const path=resolve(fixture.directory,'wasm-product-'+index+'.mjs');await writeFile(path,code);products.push({url:pathToFileURL(path).href,name:item.name,calls:item.calls});}
 const script='import assert from "node:assert/strict";for(const item of '+JSON.stringify(products)+'){const m=await import(item.url);for(const[args,expected]of item.calls)assert.deepEqual(m[item.name](...args),expected);}';const child=spawnSync('node',['--input-type=module','-e',script],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
 }finally{finishCompiler(a);}
},120000);
test('whole WASM public IR compile serialize deserialize and emit APIs retain canonical fields negative zero and input immutability',async()=>{
 const a=await fixture.wasm();try{for(const item of corpus){const program=call(a,'compile_ir_string',[item.source,'ir.eli']),expected=js.compile_ir_string(item.source,'ir.eli');assert.deepEqual(program,expected);const snapshot=structuredClone(program),serialized=call(a,'serialize_ir_program',[program]);assert.equal(serialized,js.serialize_ir_program(expected));assert.deepEqual(call(a,'deserialize_ir_program',[serialized]),js.deserialize_ir_program(serialized));assert.equal(call(a,'emit_ir_string',[program]),js.emit_ir_string(expected));assert.deepEqual(program,snapshot);}}finally{finishCompiler(a);}
});
test('whole WASM source maps and formatting preserve original complete documents and source coordinates',async()=>{
 const a=await fixture.wasm();try{for(const item of corpus.slice(0,5)){compare(a,'compile_string_with_source_map',[item.source,'源😀.eli','out.mjs','../源😀.eli']);const program=js.compile_ir_string(item.source,'源😀.eli');compare(a,'emit_ir_string_with_source_map',[program,item.source,'out.mjs','../源😀.eli']);}
 for(const source of[';comment\n(defconst x 1)','(defun add(a b)(+ a b))','(defmacro twice (x) `(+ ,x ,x))\n(twice 2)','[中 "😀" "\\uD800"]'])compare(a,'format_source',[source,'format.eli']);}finally{finishCompiler(a);}
});
test('whole WASM portable and project-portable selectors retain actual closure IR code and maps',async()=>{
 const a=await fixture.wasm();try{const source='(defconst base 3) (defportable add (x) (+ x base)) (defportable entry (x) (add x)) (defun ignored () 9)',args=[source,['entry'],'portable.eli'];for(const name of['compile_portable_ir_string','compile_project_portable_ir_string','compile_portable_string'])compare(a,name,args);compare(a,'compile_portable_string_with_source_map',[source,['entry'],'portable.eli','out.mjs','portable.eli']);compare(a,'compile_project_portable_ir_string',['(import-portable "./dep.eli" imported) (defportable entry (x) (imported x))',['entry'],'project-portable.eli']);}finally{finishCompiler(a);}
});
test('whole WASM preserves Reader analyzer macro IR and formatter diagnostics and recovers between failures',async()=>{
 const a=await fixture.wasm();try{for(const[name,args]of[
 ['compile_string',['(defun broken (','bad.eli']],['compile_string',['(defconst x unknown)','bad.eli']],['compile_string',['(defun f (x x) x)','bad.eli']],
 ['compile_string',['(defmacro fail (x) missing) (fail 1)','macro.eli']],['deserialize_ir_program',['{']],['deserialize_ir_program',['{"format":"wrong"}']],['format_source',[false,'format.eli']],['format_source',['(a','format.eli']],
 ]){compare(a,name,args);assert.equal(a.stats().frameDepth,0);assert.equal(call(a,'compile_string',[corpus[0].source,'recovered.eli']),js.compile_string(corpus[0].source,'recovered.eli'));}}finally{finishCompiler(a);}
});
test('whole WASM evaluation operation input form and module descriptions preserve original public metadata and rejections',async()=>{
 const a=await fixture.wasm();try{for(const input of[{operation:'describe'},{id:7,operation:'evaluate',source:'(+ 1 2)',filename:'eval.eli'},{operation:'load',source:'x',filename:'file',root:'root',line:2,column:3},null,{operation:'unknown'},{operation:'evaluate',source:'',filename:'f'},{operation:'describe',extra:1}])compare(a,'evaluation_operation_request',[input]);
 for(const source of['',' ;comment','(+ 1 2)','(defun run () 1)','(defmacro twice (x) `(+ ,x ,x))','(module sample)','(a) (b)',')'])for(const name of['evaluation_input_description','evaluation_form_description'])compare(a,name,[source,'eval.eli']);
 for(const source of['(module sample (defvar private 1) (defun public () private) (export public))','(module sample (defmacro twice (x) `(+ ,x ,x)) (defun public (x) (twice x)) (export public))'])compare(a,'evaluation_module_description',[source,'module.eli']);}finally{finishCompiler(a);}
});
const request={entry:'src/main.eli',outDir:'dist',root:null,portableEntries:['z','a','z'],useCache:true};
const record={identity:{source:'src/main.eli',output:'src/main.mjs',sourceMap:'src/main.mjs.map',sourceDigest:'source',outputDigest:'output',sourceMapDigest:'map'},metadata:{source:'src/main.eli',dependencies:[],portableEntries:[]}};
const decision={record,output:'src/main.mjs',sourceMap:'src/main.mjs.map',expectedPortableEntries:[],sourceDigest:'source',outputExists:true,sourceMapExists:true,outputDigest:'output',sourceMapDigest:'map',dependenciesValid:true};
test('whole WASM project configuration requests reports and cache decisions retain original normalizations and diagnostics',async()=>{
 const a=await fixture.wasm();try{for(const[name,args]of[
 ['project_request',[request]],['project_request',[{...request,entry:undefined,entries:['src/z.eli','src/a.eli']}]],['project_configuration',[{schemaVersion:1,entry:'src/main.eli',outDir:'dist'},'eliscript.json']],['project_configuration',[{schemaVersion:2,sourceRoot:'src',entries:['z.eli','a.eli'],outDir:'dist'},'eliscript.json']],
 ['build_operation_request',[{mode:'single',input:'src/main.eli',output:'main.mjs',sourceMap:true}]],['check_operation_request',[{mode:'project',...request}]],['project_check_report',[{mode:'standard',root:'project',entries:['z.eli','a.eli'],portableEntries:[],modules:[{source:'z.eli',dependencies:['a.eli','a.eli'],portableEntries:[]},{source:'a.eli',dependencies:[],portableEntries:[]}]}]],
 ['project_build_report',[{mode:'standard',root:'project',outDir:'dist',entry:'src/main.eli',entryOutput:'src/main.mjs',manifest:'eliscript-project.json',digest:'abc123',portableEntries:[],cache:{enabled:true,reason:'verified'},timings:{cacheReadMs:.1236,workMs:1.2344,manifestWriteMs:.3456,totalMs:1.7036},modules:[]}]],
 ['project_cache_lookup',[{enabled:false}]],['project_cache_lookup',[{enabled:true,manifestStatus:'missing'}]],['project_cache_decision',[decision]],['project_cache_decision',[{...decision,sourceDigest:'changed'}]],
 ['project_request',[{}]],['project_configuration',[{schemaVersion:1,entry:'../main.eli',outDir:'dist'},'eliscript.json']],['build_operation_request',[{mode:'unknown'}]],['check_operation_request',[{mode:'single',input:'../x.eli'}]],['project_build_report',[{}]],['project_check_report',[{}]],['project_cache_lookup',[null]],['project_cache_decision',[null]],
 ])compare(a,name,args);}finally{finishCompiler(a);}
});
test('whole WASM project planners execute real source dependency callbacks through the compiler public exports',async()=>{
 const a=await fixture.wasm();try{for(const input of[{entries:['b','a','a'],graph:{a:['b'],b:['a']}},{entries:['é','e\u0301','😀','𐀀','\ue000'],graph:{}}]){const calls=[],plan=js.project_plan(input.entries,id=>{calls.push(id);return input.graph[id]??[];});assert.deepEqual(call(a,'runtime_plan',[input]),{plan,calls});}
 const input={entries:[{id:'a',entries:['x']}]},calls=[],plan=js.portable_project_plan(input.entries,(id,entries)=>{calls.push([id,[...entries]]);return id==='a'?entries.includes('z')?[{id:'c',entries:['q']}]:[{id:'b',entries:['y']}]:id==='b'?[{id:'a',entries:['z']}]:[];});assert.deepEqual(call(a,'runtime_portable_plan',[input]),{plan,calls});}finally{finishCompiler(a);}
});
test('Seed and three JavaScript compiler-entry generations retain the added small corpus IR maps and diagnostics',async()=>{
 const source=await readFile('bootstrap/compiler/compiler.eli','utf8'),bootstrap=resolve(fixture.directory,'bootstrap');let compiler=js,previous;
 for(let generation=1;generation<=3;generation++){const directory=resolve(fixture.directory,'entry-generation-'+generation);await mkdir(directory);for(const name of fixture.modules.map(m=>m.id).filter(name=>name!=='compiler.mjs'&&name!=='test-entry.mjs'))await symlink(resolve(bootstrap,name),resolve(directory,name));
 const emitted=compiler.compile_string_with_source_map(source,'compiler.eli','compiler.mjs','compiler.eli');if(previous)assert.deepEqual(emitted,previous);previous=emitted;await writeFile(resolve(directory,'compiler.mjs'),emitted.javascript);compiler=await import(pathToFileURL(resolve(directory,'compiler.mjs')).href);
 for(const item of corpus.slice(0,5)){assert.equal(compiler.compile_string(item.source,'generation.eli'),js.compile_string(item.source,'generation.eli'));assert.deepEqual(compiler.compile_string_with_source_map(item.source,'generation.eli','out.mjs','generation.eli'),js.compile_string_with_source_map(item.source,'generation.eli','out.mjs','generation.eli'));}for(const text of['(a','(defconst x unknown)'])assert.deepEqual(captureCompilerError(compiler,text),captureCompilerError(js,text));}
});
function captureCompilerError(compiler,text){try{return{value:compiler.compile_string(text,'failure.eli')};}catch(error){return{error:error.name,message:error.message,diagnostic:error.eliscriptDiagnostic};}}
