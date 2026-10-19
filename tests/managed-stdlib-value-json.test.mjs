import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import {inputs,parseBoundaryCases,encodeBoundaryCases,parseCases,encodeInputs} from './helpers/managed-stdlib-corpus.mjs';
let b,rt,modules,bytes,lowered,directory,expected;
const options={maxSlots:8192,initialBytes:262144,maxBytes:16777216},memory={initialPages:4,maximumPages:1024};
function imports(nodes,out=[]){for(const node of nodes){if(node.kind==='import-declaration')out.push(node.value);imports(node.children,out);}return out;}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-stdlib-value-json-'));b=await buildBackends({outputRoot:directory});rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');modules=[];
 const loaded=new Set(),base=resolve(directory,'reference');await mkdir(base);
 async function load(id,source){if(loaded.has(id))return;loaded.add(id);source??=await readFile(id,'utf8');const program=b.compiler.compile_ir_string(source,id);modules.push({id,program});const path=resolve(base,id);await mkdir(dirname(path),{recursive:true});await writeFile(path,b.compiler.emit_ir_string(program));for(const specifier of imports(program.body)){const target=posix.normalize(posix.join(posix.dirname(id),specifier));assert(target.startsWith('stdlib/'));await load(target);}}
 await load('entry.mjs',await readFile('tests/fixtures/managed-stdlib-value-json.eli','utf8'));console.log('original stdlib modules',modules.map(m=>m.id).join(','));
 const saved=JSON.stringify(modules);lowered=b.managed.lower_managed_project(modules,'entry.mjs',rt);bytes=Uint8Array.from(b.managed.emit_managed_project_wasm(modules,'entry.mjs',rt,memory));assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);
 const script=[parseBoundaryCases.toString(),encodeBoundaryCases.toString(),'const m=await import(process.argv[1]);console.log(JSON.stringify({values:m.values(),identities:m.identities(),json:'+JSON.stringify(inputs)+'.map(x=>m.json_case(x)),boundaries:m.json_boundaries(),order:m.order_and_identity(),errors:parseBoundaryCases().map(x=>m.parse_report(...x)),encoded:encodeBoundaryCases().map(x=>m.encode_report(x))}));'].join('\n');
 const child=spawnSync('node',['--experimental-loader',resolve('tests/fixtures/compiled-eli-node-loader.mjs'),'--input-type=module','-e',script,pathToFileURL(resolve(base,'entry.mjs')).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);expected=JSON.parse(child.stdout);
 assert.deepEqual(expected.errors[0],[true,true,'ELI-JSON-DUPLICATE','duplicate object key',7,'$["a"]']);
 assert.equal(expected.errors[1][4],12);assert.equal(expected.errors[1][5],'$["z"]["a"]');assert.equal(expected.errors[2][4],10);assert.equal(expected.errors[2][5],'$["\\ud83d\\ude00"]' );
 assert.deepEqual(expected.errors.slice(3).map(row=>row[2]),['ELI-JSON-TYPE','ELI-JSON-NUMBER','ELI-JSON-OPTIONS','ELI-JSON-OPTIONS','ELI-JSON-OPTIONS','ELI-JSON-OPTIONS','ELI-JSON-LENGTH','ELI-JSON-DEPTH','ELI-JSON-VALUES']);
 assert.deepEqual(expected.boundaries.slice(0,10),[true,true,'0',2,0xd83d,0xde00,'"\\ud83d\\ude00"',0xd800,'"\\ud800"','[[1],[1]]']);assert.equal(expected.boundaries[10][2],'ELI-JSON-CYCLE');assert.equal(expected.boundaries[10][5],'$[0]');
 assert.deepEqual(expected.order,[true,true,true,true,2,true,true,2,'left','right',false,false,false,true,true,true,6,6,1,2,3,4,5,6]);
 assert.deepEqual(expected.encoded.slice(0,3),[[true,'"中\\ud83d\\ude00"'],[true,'"\\ud800"'],[true,'"\\udfff"']]);assert.deepEqual(expected.encoded[4],[true,'0']);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function read(a,v){if(v?.kind===4)return a.readNumber(v);if(v?.kind===5)return a.readString(v);if(v?.kind===14){const out=[];for(let i=0;i<a.length(v);i++){const child=a.get(v,i);try{out.push(read(a,child));}finally{a.release(child);}}return out;}return v;}
function value(a,name,args=[]){const out=a.invoke(name,args);try{return read(a,out);}finally{a.release(out);}}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function box(a,x){if(typeof x==='string')return a.string(x);if(typeof x==='number')return a.number(x);if(x&&typeof x==='object'){if(Array.isArray(x))return a.sourceArray([]);const entries=Object.fromEntries(Object.entries(x).map(([key,v])=>[key,box(a,v)]));try{return a.sourceObject(entries);}finally{Object.values(entries).forEach(v=>a.release(v));}}return x;}
function checkAll(a){
 const errors=[];function verify(label,run){try{run();}catch(error){console.error('stdlib failure:',label,error.eliscriptDiagnostic?.code??error.message);errors.push(error);}}
 for(const[name,key]of[['values','values'],['identities','identities'],['json_boundaries','boundaries'],['order_and_identity','order']])verify(name,()=>assert.deepEqual(value(a,name),expected[key]));
 for(const[i,text]of inputs.entries())verify('JSON '+i+' '+JSON.stringify(text),()=>{const source=a.string(text);try{assert.deepEqual(value(a,'json_case',[source]),expected.json[i],JSON.stringify(text));}finally{a.release(source);}});
 for(const[i,pair]of parseCases.entries())verify('error '+i,()=>{const args=pair.map(x=>box(a,x));try{assert.deepEqual(value(a,'parse_report',args),expected.errors[i],'error '+i);}finally{args.forEach(v=>a.release(v));}});
 for(const[i,x]of encodeInputs.entries())verify('encode '+i,()=>{const input=box(a,x);try{assert.deepEqual(value(a,'encode_report',[input]),expected.encoded[i],'encode '+i);}finally{a.release(input);}});
 if(errors.length)throw new AggregateError(errors,'stdlib differential failures: '+errors.length);
}
test('Given complete original Value and JSON dependency modules when fixed and seeded scalar persistent and JSON cases execute then zero-import WASM agrees with independent Node JavaScript',()=>{const a=instantiateManagedRuntime(bytes,options);a.auto(65536);try{checkAll(a);}finally{finish(a);}},30000);
test('Given collection at every allocation when complete original stdlib modules execute then persistent callbacks identities and error recovery retain their roots',()=>{const a=instantiateManagedRuntime(bytes,options);a.auto(1);try{checkAll(a);}finally{finish(a);}},30000);
test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('Given a true native library of the same original stdlib graph when the fixed and seeded semantic corpus runs then every result matches original Node JavaScript',async()=>{const path=resolve(directory,'stdlib-value-json.dylib');await writeFile(path,Uint8Array.from(b.native.emit_typed_native_memory_library(lowered.typed,'arm64-macos')));const a=await instantiateNativeManagedRuntime(path,lowered,{...options,...memory});a.auto(65536);try{checkAll(a);}finally{try{finish(a);}finally{a.close();}}},120000);
test('Given identical zero-import stdlib bytes when Node executes the semantic corpus then the independent original JS observations agree',async()=>{
 const path=resolve(directory,'stdlib-value-json.wasm');await writeFile(path,bytes);const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const bytes=readFileSync(process.argv[2]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const inputs='+JSON.stringify(inputs)+',expected='+JSON.stringify(expected)+';',parseBoundaryCases.toString(),encodeBoundaryCases.toString(),'const parseCases=parseBoundaryCases(),encodeInputs=encodeBoundaryCases();',read.toString(),value.toString(),finish.toString(),box.toString(),checkAll.toString(),'const a=instantiateManagedRuntime(bytes,'+JSON.stringify(options)+');a.auto(65536);try{checkAll(a);}finally{finish(a);}'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,path],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
},40000);

test('Given an ordinary source function when existing own-property predicates and actual Value hash are used then opaque function semantics agree with JavaScript',()=>{const a=instantiateManagedRuntime(bytes,options);a.auto(1);const results=[],errors=[];try{for(let mode=0;mode<5;mode++){const n=a.number(mode);try{const out=value(a,'opaque_probe',[n]);results.push(out);if(mode<3)assert.deepEqual(out,['function',false,null][mode]);if(mode===3)assert.equal(typeof out,'number');if(mode===4)assert.equal(out,false);}catch(error){console.error('opaque function probe:',mode,error.eliscriptDiagnostic?.code??error.message);errors.push(error);}finally{a.release(n);}}if(errors.length)throw new AggregateError(errors,'function property/hash failures');}finally{finish(a);}},30000);
