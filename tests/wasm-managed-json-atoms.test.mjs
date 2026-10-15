import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let b,rt,p,bytes,directory;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-json-atoms-'));b=await buildBackends({outputRoot:directory});rt=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');p=b.compiler.compile_ir_string('(defun parse (text) (js-call (js* "JSON") :parse text)) (defun encode (value) (JSON/stringify value)) (export parse encode)','atoms.eli');bytes=Uint8Array.from(b.managed.emit_managed_wasm(p,rt));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function finish(a,values){for(const x of values)a.release(x);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('fixed-slot parsing shares repeated immutable atoms while retaining each independently mutable container',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:512,initialBytes:65536,maxBytes:1048576});a.auto(1);
 const text='['+Array.from({length:100},()=>'{"label":"same","value":42,"items":[]}').join(',')+']',input=a.string(text),out=a.invoke('parse',[input]);
 a.collect();assert(a.live()<360,JSON.stringify(a.stats()));
 const label=a.string('label'),value=a.string('value'),items=a.string('items');let previous;
 for(let i=0;i<100;i++){const object=a.get(out,i),s=a.objectGet(object,label),n=a.objectGet(object,value),array=a.objectGet(object,items);assert.equal(a.readString(s),'same');assert.equal(a.readNumber(n),42);if(previous){assert.equal(a.keyEqual(object,previous.object),false);assert.equal(a.keyEqual(array,previous.array),false);a.release(previous.object);a.release(previous.array);}previous={object,array};a.release(s);a.release(n);}
 a.release(previous.object);a.release(previous.array);finish(a,[input,out,label,value,items]);
});

test('equivalent decoded strings and numeric spellings preserve UTF16, field order, __proto__, signed zero and overflow',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);
 const texts=['[0,-0,-0.0,-1e-9999,1,1.0,1e0,1e9999,-1e9999,5e-324,2.2250738585072014e-308,9007199254740993]',
  '["a","\\u0061","中😀","\\ud83d\\ude00","\\ud800","\\udfff",""]',
  '{"b":1,"2":2,"1":3,"a":4,"b":5,"__proto__":{"x":1},"constructor":7,"prototype":8}'];
 for(const text of texts){const input=a.string(text),out=a.invoke('parse',[input]),encoded=a.invoke('encode',[out]);assert.equal(a.readString(encoded),JSON.stringify(JSON.parse(text)));
  if(Array.isArray(JSON.parse(text)))for(let i=0;i<JSON.parse(text).length;i++){const item=a.get(out,i),expected=JSON.parse(text)[i];if(typeof expected==='number')assert(Object.is(a.readNumber(item),expected));else assert.equal(a.readString(item),expected);a.release(item);}
  for(const x of[input,out,encoded])a.release(x);a.collect();assert.equal(a.live(),0);}
 finish(a,[]);
});
test('containers remain independently mutable and the parse cache does not survive the call or cross parse boundaries',()=>{
 const a=instantiateManagedRuntime(bytes);a.auto(1);const input=a.string('[{"x":"same","a":[]},{"x":"same","a":[]}]'),out=a.invoke('parse',[input]),other=a.invoke('parse',[input]);
 const left=a.get(out,0),right=a.get(out,1),key=a.string('a'),x=a.string('x'),first=a.objectGet(left,key),second=a.objectGet(right,key),n=a.number(7);
 assert.equal(a.keyEqual(out,other),false);a.resize(first,1);a.set(first,0,n);assert.equal(a.length(second),0);a.objectSet(left,x,n);const unchanged=a.objectGet(right,x);assert.equal(a.readString(unchanged),'same');
 finish(a,[input,out,other,left,right,key,x,first,second,n,unchanged]);
 const duplicate=a.string('{"x":"discarded","x":"kept"}'),object=a.invoke('parse',[duplicate]);a.release(duplicate);a.collect();assert.equal(a.live(),4,'only object, property table, live key and final value remain');a.release(object);a.collect();assert.equal(a.live(),0);
 for(let i=0;i<12;i++){const text=a.string('["repeat","repeat",42,42]'),value=a.invoke('parse',[text]);a.release(text);a.release(value);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
});
test('unique atoms still exhaust the fixed budget honestly and grammar errors release all cache roots before a valid retry',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:128,initialBytes:8192,maxBytes:65536});a.auto(1);const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 for(const text of['['+Array.from({length:200},(_,i)=>JSON.stringify('unique'+i)).join(',')+']','["cached","cached",42,42,]']){
  const input=a.string(text);assert.throws(()=>a.invoke('parse',[input]),e=>e.eliscriptDiagnostic?.code===(text.endsWith(',]')?'ELI-RT0003':'ELI-RT0002'));assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.collect();}
 const valid=a.string('["retry","retry",0,-0]'),out=a.invoke('parse',[valid]),minus=a.get(out,3);assert(Object.is(a.readNumber(minus),-0));a.leaveFrame(frame);finish(a,[held,valid,out,minus]);
});
test('a real atom-cache growth trap preserves caller roots and does not replace an earlier JSON grammar error',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun heap-table-grow '),end=source.indexOf('  (defun ',start+3);assert(start>=0&&end>start);
 const injected=b.compiler.compile_ir_string(source.slice(0,start)+'  (defun heap-table-grow (heap table) (load-u32 4294967295))\n'+source.slice(end),'atom-trap.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,injected)));a.auto(1);
 const held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 const bad=a.string('["\\x"]');assert.throws(()=>a.invoke('parse',[bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);
 const input=a.string('["a","b","c","d","e","f"]');assert.throws(()=>a.invoke('parse',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(input);a.release(bad);a.collect();
 const retry=a.string('["ok","ok"]'),out=a.invoke('parse',[retry]);assert.equal(a.length(out),2);a.leaveFrame(frame);finish(a,[held,retry,out]);
});
test('Node executes the same zero-import bytes with exact primitive bits and the fixed repeated-atom budget',async()=>{
 const file=resolve(directory,'atoms.wasm');await writeFile(file,bytes);const result=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{instantiateManagedRuntime}from ${JSON.stringify(pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href)};
 const a=instantiateManagedRuntime(readFileSync(process.argv[1]),{maxSlots:512,initialBytes:65536,maxBytes:1048576});a.auto(1);
 const source=JSON.stringify(Array.from({length:100},()=>({label:'same',value:42,items:[]}))),input=a.string(source),out=a.invoke('parse',[input]);assert.equal(a.length(out),100);a.release(input);a.release(out);a.collect();assert.equal(a.live(),0);
 const text='[0,-0,-1e-9999,1e9999,-1e9999,5e-324,9007199254740993]',s=a.string(text),value=a.invoke('parse',[s]);for(const [i,n]of JSON.parse(text).entries()){const item=a.get(value,i);assert(Object.is(a.readNumber(item),n));a.release(item);}a.release(s);a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `,file],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});
