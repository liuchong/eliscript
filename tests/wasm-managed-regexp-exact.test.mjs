import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildCompilerCandidate} from './compiler-module-candidate-rig.mjs';
const root=resolve(import.meta.dir,'..'),sourceRoot=await realpath(resolve(process.env.ELISCRIPT_COMPILER_SOURCE_ROOT??root));
let directory,b,runtime,instantiate;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-regexp-exact-'));b=await buildCompilerCandidate(directory,sourceRoot,{'bootstrap/backends/regexp.eli':resolve(root,'bootstrap/backends/regexp.eli')});runtime=b.compiler.compile_ir_string(await readFile(resolve(sourceRoot,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');({instantiateManagedRuntime:instantiate}=await import(pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function compile(pattern,flags=''){const source=`(defconst pattern (js* ${JSON.stringify('/'+pattern+'/'+flags)})) (defun run (text) (js-call pattern :exec text)) (defun field (x key) (get x key)) (export run field)`,program=b.compiler.compile_ir_string(source,'exact.eli'),saved=JSON.stringify(program),bytes=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime));assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return{bytes,source};}
function finish(a,owned=[]){owned.forEach(v=>a.release(v));a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function exec(a,text){const input=a.string(text),out=a.invoke('run',[input]);try{if(out===null)return null;const values=Array.from({length:a.length(out)},(_,i)=>{const v=a.get(out,i);try{return v===undefined?{missing:true}:a.readString(v);}finally{a.release(v);}}),key=a.string('index'),index=a.invoke('field',[out,key]);try{return{values,index:a.readNumber(index),input:text};}finally{a.release(key);a.release(index);}}finally{a.release(input);a.release(out);}}
function model(pattern,flags,text){const out=new RegExp(pattern,flags).exec(text);return out&&{values:[...out].map(v=>v===undefined?{missing:true}:v),index:out.index,input:out.input};}
test('generic exact repetition preserves zero one multidigit leading-zero groups captures classes Unicode and escaped braces',()=>{
 const patterns=[['a{0}',''],['^a{1}$',''],['a{12}',''],['a{0002}',''],['[0-9a-f]{64}$',''],['(a|bc){2}',''],['(a|(b)){2}',''],['((a)?b){2}',''],['(a?){3}',''],['(?:){3}',''],['(?:a|){2}?',''],['(?:a{2}){2}',''],['^[😀a]{2}$','u'],['^😀{2}$','u'],['^\\uD83D\\uDE00{2}$','u'],['^\\u{1F600}{2}$','u'],['^\\uD800{2}$','u'],['^\\{{2}\\}{1}$','u'],['^[{}]{2}$','u']];
 const texts=['','a','aa','aaa','aaaa','a'.repeat(12),'a'.repeat(64),'f'.repeat(63),'g'.repeat(64),'ab','abab','abb','bb','bca','bcbc','😀','😀😀','a😀','\ud800\ud800','{{}','{}','\n😀😀'];
 for(const[pattern,flags]of patterns){const a=instantiate(compile(pattern,flags).bytes);a.auto(1);try{for(const text of texts){assert.deepEqual(exec(a,text),model(pattern,flags,text),pattern+'/'+flags+':'+JSON.stringify(text));a.collect();assert.equal(a.stats().frameDepth,0);}}finally{finish(a);}}
},120000);

test('exact repetition rejects malformed unsupported and over-capacity syntax with stable source diagnostics',()=>{
 for(const[pattern,flags]of [['a{2,3}',''],['a{2,}',''],['a{','u'],['a{}','u'],['a{-1}','u'],['a{1.5}','u'],['a{2a}','u'],['a{2}*',''],['a{2}{3}','u'],['^{0}',''],['\\b{2}','u'],['a{1048577}',''],['a{99999999999999999999999999999999}','']]){
  const p=b.compiler.compile_ir_string(`(defun run () (js* ${JSON.stringify('/'+pattern+'/'+flags)})) (export run)`,'exact-invalid.eli'),saved=JSON.stringify(p);assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),error=>error.eliscriptDiagnostic?.code==='ELI-B0001'&&error.eliscriptDiagnostic.phase==='regexp-backend'&&error.eliscriptDiagnostic.location.file==='exact-invalid.eli');assert.equal(JSON.stringify(p),saved);
 }
});
test('exact repetition deterministic captures agree with independent Node and the same zero-import WASM bytes',async()=>{
 let seed=0x415f8d21;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,atoms=['a','b','[ab]','(a|(b))','(a?)','(?:a|)','😀','\\d'],records=[];
 for(let group=0;group<24;group++){const pattern=atoms[next()%atoms.length]+'{'+(next()%5)+'}'+(next()%2?'?':''),flags=next()%2?'u':'',a=instantiate(compile(pattern,flags).bytes);a.auto(1);try{for(let i=0;i<12;i++){const chars=['a','b','2','😀','\ud800'],text=Array.from({length:next()%7},()=>chars[next()%chars.length]).join(''),expected=model(pattern,flags,text);assert.deepEqual(exec(a,text),expected);records.push({pattern,flags,text,expected});a.collect();assert.equal(a.stats().frameDepth,0);}}finally{finish(a);}}
 const cases=resolve(directory,'exact-models.json'),wasm=resolve(directory,'exact.wasm');await writeFile(cases,JSON.stringify(records));await writeFile(wasm,compile('^(a|(b)){2}$').bytes);
 const child=spawnSync('node',['--input-type=module','-e',`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';for(const r of JSON.parse(readFileSync(process.argv[1],'utf8'))){const out=new RegExp(r.pattern,r.flags).exec(r.text),actual=out&&{values:[...out].map(v=>v===undefined?{missing:true}:v),index:out.index,input:out.input};assert.deepEqual(actual,r.expected);}const{instantiateManagedRuntime}=await import(process.argv[2]),a=instantiateManagedRuntime(readFileSync(process.argv[3]));a.auto(1);const input=a.string('ab'),out=a.invoke('run',[input]);assert.equal(a.length(out),3);for(const[i,expected]of['ab','b','b'].entries()){const value=a.get(out,i);assert.equal(a.readString(value),expected);a.release(value);}a.release(out);a.release(input);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`,cases,pathToFileURL(resolve(sourceRoot,'tools/backends/managed-runtime.mjs')).href,wasm],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},120000);
