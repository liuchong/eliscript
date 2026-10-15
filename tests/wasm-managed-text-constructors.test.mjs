import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime,program,reference,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-text-constructors-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
 program=b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-strings.eli','utf8'),'text-constructors.eli');
 reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));
 assert.equal(reference.from_points(65,0x1f600,0xd800),'A😀\ud800');assert.throws(()=>reference.from_point(.5),RangeError);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true})});
function artifact(){return bytes??=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime))}
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
function verify(a,name,inputs,exportName=name){a.collect();const baseline=a.live(),argv=inputs.map(x=>box(a,x));let result;try{let expected,error;try{expected=reference[name.replaceAll('-','_')](...inputs)}catch(e){error=e}if(error){assert(error instanceof RangeError);assert.throws(()=>a.invoke(exportName,argv),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003')}else{result=a.invoke(exportName,argv);assert.equal(a.readString(result),expected,name)}}finally{if(result)a.release(result);for(const x of argv)a.release(x)}a.collect();assert.equal(a.live(),baseline);assert.equal(a.stats().frameDepth,0)}
test('static String constructors execute existing source semantics with zero imports and exact UTF16',()=>{
 const raw=artifact();assert(WebAssembly.validate(raw));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(raw)),[]);const a=instantiateManagedRuntime(raw);a.auto(1);
 for(const name of['empty-units','empty-points'])verify(a,name,[]);
 for(const x of[null,false,true,undefined,0,-0,65,65535,65536,0x1f600,0x10ffff,-1,.5,-.5,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,2**32,2**32+65,'65','0x1f600','-0','1.5','x',''])for(const name of['from-unit','from-point','global-unit','global-point','constructor-capture'])verify(a,name,[x]);
 for(const x of[0,-0,0xd800,0xdfff,0x1f600,0x10ffff,NaN,Infinity,-1,.5,'65',undefined])for(const name of['from-units','from-points'])verify(a,name,[65,x,0xde00]);
});
test('deterministic full f64 words and random Unicode points match independent JS during collection',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);let seed=0x73b12941;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,view=new DataView(new ArrayBuffer(8));
 for(let i=0;i<512;i++){view.setUint32(0,next(),true);view.setUint32(4,next(),true);verify(a,'from-unit',[view.getFloat64(0,true)]);verify(a,'from-points',[next()%0x110000,next()%0x110000,next()%0x110000]);}
});
test('all arguments execute before range conversion failures and earlier values remain snapshotted',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);for(const value of[-1,.5,NaN]){const bad=a.number(value),trace=a.sourceObject({});const control={};assert.throws(()=>reference.constructor_effects(value,control),RangeError);assert.equal(control.visited,66);assert.throws(()=>a.invoke('constructor-effects',[bad,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');const key=a.string('visited'),seen=a.objectGet(trace,key);assert.equal(a.readNumber(seen),66);for(const x of[bad,trace,key,seen])a.release(x);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0)}verify(a,'constructor-capture',[65]);
});
test('shadowed constructors and malformed or dynamic static-method IR never silently invoke globals',()=>{
 for(const source of[
  '(defun f (String) (js-call (js* "String") :fromCodePoint 65)) (export f)',
  '(defun f (globalThis) (js-call globalThis/String :fromCodePoint 65)) (export f)',
  '(defconst String (js-object)) (defun f () (js-call (js* "String") :fromCharCode 65)) (export f)',
  '(defun f (method) (js-call (js* "String") method 65)) (export f)',
  '(defun f () (js-call (js* "String") :raw 65)) (export f)',
 ]){const ir=b.compiler.compile_ir_string(source,'shadowed.eli');for(const build of[()=>b.managed.emit_managed_wasm(ir,runtime),()=>b.managed.emit_managed_project_wasm([{id:'main.mjs',program:ir}],'main.mjs',runtime)])assert.throws(build,e=>e.eliscriptDiagnostic?.code==='ELI-B0001');}
 const copy=structuredClone(program);let target;const visit=x=>{if(!x||typeof x!=='object'||target)return;if(x.kind==='method-call'&&x.children?.[1]?.value==='fromCodePoint')target=x;else for(const v of Object.values(x))visit(v)};visit(copy);assert(target);target.children[0].children.push({kind:'literal',value:'extra',children:[],properties:null});assert.throws(()=>b.managed.emit_managed_wasm(copy,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 for(const literal of[null,false,0,{}, {kind:'literal',value:65,children:[],properties:null}]){const p=b.compiler.compile_ir_string('(defun f () (js-call (js* "String") :fromCharCode 65)) (export f)','malformed-constructor.eli');p.body[0].children[0].children[0].children=[literal];assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='malformed-constructor.eli');}
});
test('linked projects retain the same static constructors without source mutation',()=>{
 const saved=b.compiler.serialize_ir_program(program),raw=Uint8Array.from(b.managed.emit_managed_project_wasm([{id:'strings.mjs',program}],'strings.mjs',runtime));assert.equal(b.compiler.serialize_ir_program(program),saved);const a=instantiateManagedRuntime(raw);a.auto(1);verify(a,'from-points',[65,0x1f600,0xd800],'from_points');a.closeModule();a.collect();assert.equal(a.live(),0);
});
test('capacity errors preserve caller roots and UTF16 inputs; retry after failure remains usable',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:24,initialBytes:4096,maxBytes:4096});a.auto(1);const text=a.string('中😀'),outer=a.frame(1);a.frameSet(outer,0,text);const fillers=[];while(a.live()<22)fillers.push(a.number(65));assert.throws(()=>a.invoke('from-units',fillers.slice(0,3)),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert.equal(a.readString(text),'中😀');a.leaveFrame(outer);for(const x of[text,...fillers])a.release(x);a.collect();assert.equal(a.live(),0);verify(a,'from-unit',[65]);
});
test('independent Node executes the same code-point, modulo and range boundaries with no private roots',async()=>{
 const path=resolve(directory,'constructors.wasm');await writeFile(path,artifact());const child=spawnSync('node',['--input-type=module','-e',`
 import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
 const a=instantiateManagedRuntime(readFileSync(${JSON.stringify(path)}));a.auto(1);for(const [name,value] of [['from-point',0x1f600],['from-unit',-65535.5],['global-point',0xd800]]){const x=a.number(value),out=a.invoke(name,[x]);assert.equal(a.readString(out),name==='from-unit'?String.fromCharCode(value):String.fromCodePoint(value));a.release(x);a.release(out)}const bad=a.number(NaN);assert.throws(()=>a.invoke('from-point',[bad]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(bad);a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);
 `],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('bulk raw construction grows memory, seals exact surrogate pairs and validates modes, kinds and lifetime',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](128,4096,1048576),call=(name,...args)=>{const value=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return value;};
 const initial=e.memory.buffer.byteLength,list=call('value-refs',7,16384);call('heap-pin',list);call('heap-auto',1);const n=call('value-number',0,0x40ff6000);call('heap-pin',n);
 for(let i=0;i<16384;i++)call('value-set',list,i,n);const out=call('value-source-text-codes',list,1);call('heap-pin',out);assert.equal(call('value-length',out),32768);assert(e.memory.buffer.byteLength>initial);const p=call('value-data',out,5),view=new DataView(e.memory.buffer);for(let i=0;i<32768;i+=2){assert.equal(view.getUint16(p+i*2,true),0xd83d);assert.equal(view.getUint16(p+(i+1)*2,true),0xde00)}
 e['value-unit-set'](h,out,0,0);assert.equal(e['last-error'](),6);for(const [value,mode,code]of[[list,2,3],[out,0,1],[0,0,1]]){e['value-source-text-codes'](h,value,mode);assert.equal(e['last-error'](),code)}
 for(const value of[list,n,out])call('heap-release',value);call('heap-collect');assert.equal(call('heap-live'),0);e['value-source-text-codes'](h,list,0);assert.equal(e['last-error'](),1);assert.equal(call('frame-depth'),0);
});
test('real conversion traps unwind private scratch roots and cannot replace an earlier range error',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),needle='  (defun heap-number-word (heap input)';assert.equal(source.split(needle).length,2);const faulty=source.replace(needle,needle+'\n    (when (= (load-u32 (+ (heap-block heap input) 32)) 12345) (load-u32 4294967295))'),runtime=b.compiler.compile_ir_string(faulty,'constructor-trap.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(program,runtime)));a.auto(1);
 const bits=new DataView(new ArrayBuffer(8));bits.setUint32(0,12345,true);bits.setUint32(4,0x3ff00000,true);const held=a.string('held😀'),frame=a.frame(1);a.frameSet(frame,0,held);const bad=a.number(-1),marker=a.number(bits.getFloat64(0,true)),good=a.number(65);
 assert.throws(()=>a.invoke('from-points',[bad,marker,good]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,1);assert.throws(()=>a.invoke('from-points',[good,marker,good]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);assert.equal(a.readString(held),'held😀');a.leaveFrame(frame);for(const v of[held,bad,marker,good])a.release(v);a.collect();assert.equal(a.live(),0);
});

test('unsealed conversion input is rejected without mutating the argument list or escaping private roots',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(artifact())).exports,h=e['heap-new'](64,4096,65536),call=(name,...args)=>{const v=e[name](h,...args)>>>0;assert.equal(e['last-error'](),0,name);return v;};
 const args=call('value-refs',7,1),s=call('value-string',2);call('heap-pin',args);call('heap-pin',s);call('value-unit-set',s,0,54);call('value-unit-set',s,1,53);call('value-set',args,0,s);call('heap-auto',1);
 e['value-source-text-codes'](h,args,0);assert.equal(e['last-error'](),6);assert.equal(call('value-get',args,0),s);assert.equal(call('frame-depth'),0);call('value-seal',s);const out=call('value-source-text-codes',args,0);call('heap-pin',out);assert.equal(call('value-unit-get',out,0),65);for(const x of[args,s,out])call('heap-release',x);call('heap-collect');assert.equal(call('heap-live'),0);
});

test('intrinsic String lookup keeps module binding shadowing after hygienic project renaming',async()=>{
 const source='(defconst String (js-object :fromCharCode (lambda (x) "custom"))) (defun f (x) (string-from-code-unit x)) (export f)',p=b.compiler.compile_ir_string(source,'intrinsic-shadow.eli'),control=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64'));assert.equal(control.f(65),'custom');
 for(const build of[()=>b.managed.emit_managed_wasm(p,runtime),()=>b.managed.emit_managed_project_wasm([{id:'main.mjs',program:p}],'main.mjs',runtime)])assert.throws(build,e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});
