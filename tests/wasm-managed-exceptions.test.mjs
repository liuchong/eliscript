import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,b,runtime,program,bytes,reference;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-exceptions-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(await readFile('tests/fixtures/wasm-managed-exceptions.eli','utf8'),'exceptions.eli');reference=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(program)).toString('base64'));},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function instance(){bytes??=Uint8Array.from(b.managed.emit_managed_wasm(program,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);return a;}
const box=(a,v)=>typeof v==='number'?a.number(v):typeof v==='string'?a.string(v):v;
const read=(a,v)=>v?.kind===4?a.readNumber(v):v?.kind===5?a.readString(v):v;
function finish(a,values=[]){for(const v of values)a.release(v);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function items(a,value){return Array.from({length:a.length(value)},(_,i)=>{const v=a.get(value,i);try{return read(a,v);}finally{a.release(v);}});}
test('throw catch and finally lower to zero-import WASM and distinguish every primitive including null false and undefined',()=>{
 const a=instance();for(const value of[null,false,true,undefined,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,'','😀\ud800']){const input=box(a,value);for(const name of['caught','indirect','handler-throw']){const out=a.invoke(name,name==='handler-throw'?[null,input]:[input]);assert.deepEqual(read(a,out),reference[name.replaceAll('-','_')](...(name==='handler-throw'?[null,value]:[value])));a.release(out);}a.release(input);}finish(a);
});
test('finally preserves successful values, runs once through nested propagation and replaces pending throws only when it throws',()=>{
 const a=instance(),first=a.string('first'),second=a.string('second');for(const name of['normal','nested']){const trace=a.sourceArray([]),expected=[];const out=a.invoke(name,[first,trace]);assert.equal(read(a,out),reference[name]('first',expected));assert.deepEqual(items(a,trace),expected);a.release(out);a.release(trace);}const trace=a.sourceArray([]);let caught;try{a.invoke('replaced',[first,second,trace]);}catch(error){caught=error;}assert(caught&&typeof caught==='object');assert(a.keyEqual(caught,second));assert.deepEqual(items(a,trace),['first','finally']);finish(a,[first,second,trace,caught]);
});
test('cross-function recursion, shadowing and captured catch bindings retain exact source identity through collecting GC',()=>{
 const a=instance(),value=a.sourceObject({}),depth=a.number(12);for(const name of['caught','indirect','across']){const out=a.invoke(name,name==='across'?[depth,value]:[value]);assert(a.keyEqual(out,value));a.release(out);}const pair=a.invoke('shadow',[value]),caught=a.get(pair,0),outer=a.get(pair,1);assert(a.keyEqual(caught,value));assert.equal(a.readNumber(outer),7);const closure=a.invoke('handler-closure',[value]);a.collect();const retained=a.invoke('call-handler',[closure]);assert(a.keyEqual(retained,value));finish(a,[value,depth,pair,caught,outer,closure,retained]);
});

test('source Error TypeError RangeError and SyntaxError retain real prototype names, nonenumerable messages and optional cause',async()=>{
 const source=`(defconst marker 1)
 (defun make (kind message options) (cond ((= kind 0) (new (js* "Error") message options)) ((= kind 1) (new (js* "TypeError") message options)) ((= kind 2) (new (js* "RangeError") message options)) (t (new (js* "SyntaxError") message options))))
 (defun describe (error) (js-array (aref error "name") (aref error "message") (Object/hasOwn error "name") (Object/hasOwn error "message") (Object/hasOwn error "cause") (Object/keys error)))
 (export make describe)`;
 const p=b.compiler.compile_ir_string(source,'source-errors.eli'),artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);const a=instantiateManagedRuntime(artifact);a.auto(1);
 for(let kind=0;kind<4;kind++)for(const message of[undefined,null,false,0,-0,NaN,'','中😀\ud800']){const k=a.number(kind),m=box(a,message),cause=a.sourceObject({}),options=a.sourceObject({cause}),out=a.invoke('make',[k,m,options]),description=a.invoke('describe',[out]);const expected=new[Error,TypeError,RangeError,SyntaxError][kind](message,{cause:{}});const fields=[];for(let i=0;i<5;i++){const value=a.get(description,i);fields.push(read(a,value));a.release(value);}const keys=a.get(description,5);assert.deepEqual(fields,[expected.name,expected.message,Object.hasOwn(expected,'name'),Object.hasOwn(expected,'message'),Object.hasOwn(expected,'cause')]);assert.deepEqual(items(a,keys),Object.keys(expected));for(const v of[k,m,cause,options,out,description,keys])a.release(v);a.collect();}finish(a);
});

test('Error default string conversion uses inherited name then message and preserves user override order',()=>{
 const source=`(defconst marker 1)
 (defun run (name message) (let ((error (new (js* "TypeError") message))) (put error "name" name) (js-call (js-array error) :join ""))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'error-string.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const name of[undefined,null,false,0,'','Other'])for(const message of[undefined,null,false,0,'','中']){const n=box(a,name),m=box(a,message),out=a.invoke('run',[n,m]),expected=new TypeError(message);expected.name=name;assert.equal(read(a,out),String(expected));for(const v of[n,m,out])a.release(v);}finish(a);
});

test('runtime TypeError and RangeError enter source catches with retained WASM diagnostics and permit recovery',()=>{
 const source=`(defconst marker 1)
 (defun run (mode) (try (if mode (Math/round (js-object :valueOf (lambda () (js-object)) :toString (lambda () (js-object)))) (js-call 1 :toString 1)) (catch error (js-array (aref error "name") (aref error "message") (aref (aref error "eliscriptDiagnostic") "code"))) (finally 7))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'runtime-catch.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const [mode,name,code]of[[true,'TypeError','ELI-RT0003'],[false,'RangeError','ELI-RT0010'],[true,'TypeError','ELI-RT0003']]){const out=a.invoke('run',[mode]);assert.deepEqual(items(a,out),[name,code==='ELI-RT0010'?'invalid Number.toString radix':'managed argument or bounds error',code]);a.release(out);}finish(a);
});

test('catch lexical mutation, source validation and firstclass Error constructors match the existing JS emitter',async()=>{
 const source=`(defconst marker 1)
 (defun mutate (value) (try (throw value) (catch error (setq error 8) (lambda () error))))
 (defun call (fn) (funcall fn))
 (defun selected () (try (throw 3) (catch error error) (finally 1)))
 (defun error-alias (message) (let ((ctor (js* "TypeError"))) (let ((error (funcall ctor message))) (js-array (aref error "name") (aref error "message")))))
 (export mutate call selected error-alias)`;
 const p=b.compiler.compile_ir_string(source,'catch-bindings.eli'),js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(p)).toString('base64')),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 const value=a.number(1),fn=a.invoke('mutate',[value]);a.collect();const out=a.invoke('call',[fn]);assert.equal(a.readNumber(out),js.call(js.mutate(1)));const selected=a.invoke('selected');assert.equal(a.readNumber(selected),js.selected());const text=a.string('x'),error=a.invoke('error-alias',[text]);assert.deepEqual(items(a,error),js.error_alias('x'));finish(a,[value,fn,out,selected,text,error]);assert.throws(()=>b.compiler.compile_ir_string('(defun f () (try 1 (catch a a) (catch b b)))','duplicate-catch.eli'),/at most one catch/);
});

test('pending source exceptions are heap roots and illegal raw handles remain numeric ABI failures',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,heap=e['heap-new'](64,4096,16384);assert(heap);e['heap-auto'](heap,1);
 const value=e['value-string'](heap,1);assert(value);e['value-unit-set'](heap,value,0,120);e['value-seal'](heap,value);e['value-throw'](heap,value);assert.equal(e['last-error'](),11);assert.equal(e['value-exception-pending'](heap),1);e['heap-collect'](heap);assert.equal(e['value-kind'](heap,value),5);assert.equal(e['value-throw'](heap,0xffffffff),0);assert.equal(e['last-error'](),1);assert.equal(e['value-exception-take'](heap),value);assert.equal(e['value-exception-pending'](heap),0);e['heap-collect'](heap);assert.equal(e['heap-live'](heap),0);assert.equal(e['value-exception-take'](heap),0);assert.equal(e['last-error'](),3);
});

test('capacity failures during Error creation preserve caller frames and recover after released source objects are collected',()=>{
 const source='(defconst marker 1) (defun make (message) (new (js* "Error") message)) (export make)',p=b.compiler.compile_ir_string(source,'error-capacity.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)),{maxSlots:64,initialBytes:4096,maxBytes:16384});a.auto(1);
 const message=a.string('x'),frame=a.frame(1);a.frameSet(frame,0,message);const retained=[];let failure;for(let i=0;i<100;i++){try{retained.push(a.invoke('make',[message]));}catch(error){failure=error;break;}}assert.equal(failure?.eliscriptDiagnostic?.code,'ELI-RT0002');assert.equal(a.stats().frameDepth,1);for(const error of retained)a.release(error);a.collect();const recovered=a.invoke('make',[message]),key=a.string('message'),text=a.objectGet(recovered,key);assert.equal(a.readString(text),'x');a.leaveFrame(frame);finish(a,[message,recovered,key,text]);
});

test('real WASM traps bypass catch and finally without being disguised as a source Error and unwind only dynamic frames',async()=>{
 const source=await readFile('bootstrap/runtime/memory.eli','utf8'),start=source.indexOf('  (defun value-cell-get (heap cell)'),end=source.indexOf('  (defun value-cell-set',start);assert(start>=0&&end>start);
 const faulty=source.slice(0,start)+'  (defun value-cell-get (heap cell) (load-u32 4294967295))\n'+source.slice(end),r=b.compiler.compile_ir_string(faulty,'trap-exception-runtime.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(program,r)));a.auto(1);const value=a.number(4),callback=a.invoke('handler-closure',[value]),frame=a.frame(1);a.frameSet(frame,0,value);assert.throws(()=>a.invoke('call-handler',[callback]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const recovered=a.invoke('caught',[value]);assert(a.keyEqual(recovered,value));a.leaveFrame(frame);finish(a,[value,callback,recovered]);
});

test('runtime origin classification separates null reads, repeat ranges and JSON syntax while finally restores the original exception class',()=>{
 const source=`(defconst marker 1)
 (defun fail-one (mode) (cond ((= mode 0) (aref nil "x")) ((= mode 1) (js-call "x" :repeat -1)) (t (JSON/parse "{"))))
 (defun run (mode) (try (try (fail-one mode) (finally (try (Math/round (js-object :valueOf (lambda () (js-object)) :toString (lambda () (js-object)))) (catch ignored 0)))) (catch error (js-array (aref error "name") (aref (aref error "eliscriptDiagnostic") "code"))))) (export run)`;
 const p=b.compiler.compile_ir_string(source,'runtime-origin.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);
 for(const [mode,name,code]of[[0,'TypeError','ELI-RT0001'],[1,'RangeError','ELI-RT0003'],[2,'SyntaxError','ELI-RT0003'],[1,'RangeError','ELI-RT0003']]){const m=a.number(mode),out=a.invoke('run',[m]);assert.deepEqual(items(a,out),[name,code]);a.release(m);a.release(out);}finish(a);
});

test('uncaught primitives cross the adapter exactly and failed module evaluation rethrows its original source value per instance until close',()=>{
 const a=instance();for(const value of[null,undefined,false,true,0,-0,NaN,'x']){const input=box(a,value);let seen=false,actual;try{a.invoke('uncaught',[input]);}catch(error){seen=true;actual=error;}assert(seen);assert.deepEqual(read(a,actual),value);a.release(actual);a.release(input);}finish(a);
 for(const value of['nil','undefined','false','(new (js* "TypeError") "init")']){const p=b.compiler.compile_ir_string('(defconst fail (throw '+value+')) (export fail)','module-throw.eli'),artifact=Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)),a=instantiateManagedRuntime(artifact,{initializeModule:false});a.auto(1);const seen=[];for(let i=0;i<2;i++){try{a.initializeModule();assert.fail('initializer must throw');}catch(error){seen.push(error);}a.collect();assert.equal(a.stats().frameDepth,0);}if(value.startsWith('(new')){assert(a.keyEqual(seen[0],seen[1]));const key=a.string('message'),text=a.objectGet(seen[0],key);assert.equal(a.readString(text),'init');a.release(key);a.release(text);}else assert.deepEqual(seen,[value==='nil'?null:value==='undefined'?undefined:false,value==='nil'?null:value==='undefined'?undefined:false]);finish(a,seen);}
});

test('unrepresented Error stack reflection fails explicitly while normal object stack fields remain ordinary data',()=>{
 const source='(defconst marker 1) (defun read-stack (error) (aref error "stack")) (defun has-stack (error) (Object/hasOwn error "stack")) (defun set-stack (error) (put error "stack" 9)) (defun make () (new (js* "Error") "x")) (export read-stack has-stack set-stack make)',p=b.compiler.compile_ir_string(source,'error-stack-boundary.eli'),a=instantiateManagedRuntime(Uint8Array.from(b.managed.emit_managed_wasm(p,runtime)));a.auto(1);const error=a.invoke('make');for(const name of['read-stack','has-stack','set-stack'])assert.throws(()=>a.invoke(name,[error]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');const object=a.sourceObject({stack:true});assert.equal(a.invoke('read-stack',[object]),true);assert.equal(a.invoke('has-stack',[object]),true);const out=a.invoke('set-stack',[object]);assert.equal(a.readNumber(out),9);finish(a,[error,object,out]);
});

let generationEvidence;
function generations(){return generationEvidence??=buildGenerations();}
async function buildGenerations(){
 const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort(),all=[b];let previous=b;
 for(const generation of[2,3]){
  const output=resolve(directory,'g'+generation),bootstrap=resolve(output,'bootstrap');await mkdir(bootstrap,{recursive:true});
  for(const file of files){const path=resolve('bootstrap/compiler',file),name=file.replace(/\.eli$/,'.mjs'),source=await readFile(path,'utf8'),emission=previous.compiler.compile_string_with_source_map(source,path,name,relative(bootstrap,path));await writeFile(resolve(bootstrap,name),emission.javascript+'//# sourceMappingURL='+name+'.map\n');await writeFile(resolve(bootstrap,name+'.map'),emission.sourceMap);}
  const current=await buildBackends({outputRoot:output,frontend:previous.compiler});current.compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);all.push(current);previous=current;
 }
 const filename=resolve('tests/fixtures/wasm-managed-exceptions.eli'),source=await readFile(filename,'utf8'),seedFile=resolve(directory,'exceptions-seed.mjs'),seed=spawnSync(resolve('bin/eliscript-seed'),['--output',seedFile,filename],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);const javascript=await readFile(seedFile,'utf8'),outputs=[];
 for(const current of all){const p=current.compiler.compile_ir_string(source,filename),r=current.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');assert.equal(current.compiler.emit_ir_string(p),javascript);outputs.push(Uint8Array.from(current.managed.emit_managed_wasm(p,r)));}
 for(const file of files){const path=resolve('bootstrap/compiler',file),source=await readFile(path,'utf8'),expected=all[0].compiler.compile_string(source,path);for(const current of all.slice(1))assert.equal(current.compiler.compile_string(source,path),expected);}
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[1],outputs[2]);
 const seeded=await buildBackends({outputRoot:resolve(directory,'seed-backends'),seed:true}),seedRuntime=seeded.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli'),seedProgram=seeded.compiler.compile_ir_string(source,filename);assert.deepEqual(Uint8Array.from(seeded.managed.emit_managed_wasm(seedProgram,seedRuntime)),outputs[0]);
 return {bytes:outputs[2],javascript};
}
test('Seed and complete three-generation frontend and backend artifacts preserve exception IR and zero-import WASM bytes',async()=>{
 const evidence=await generations(),a=instantiateManagedRuntime(evidence.bytes);a.auto(1);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(evidence.bytes)),[]);const text=a.string('seed'),trace=a.sourceArray([]),out=a.invoke('nested',[text,trace]);assert(a.keyEqual(out,text));assert.deepEqual(items(a,trace),['inner','catch','outer']);for(let i=0;i<4;i++){const kind=a.number(i),error=a.invoke('make-error',[kind,text,undefined]),description=a.invoke('error-summary',[error]);assert.deepEqual(items(a,description),[['Error','TypeError','RangeError','SyntaxError'][i],'seed',false,true,false]);for(const value of[kind,error,description])a.release(value);}finish(a,[text,trace,out]);
},120000);
test('Node executes the exact Seed and three-generation zero-import artifact with source exceptions and Error identity',async()=>{
 const evidence=await generations(),path=resolve(directory,'exceptions.wasm');await writeFile(path,evidence.bytes);
 const script=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {instantiateManagedRuntime} from ${JSON.stringify(pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href)};const bytes=await readFile(process.argv[1]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);const a=instantiateManagedRuntime(bytes);a.auto(1);for(const value of[null,undefined,false,true]){assert.equal(a.invoke('caught',[value]),value);let entered=false;try{a.invoke('uncaught',[value]);}catch(error){entered=true;assert.equal(error,value);}assert(entered);}const message=a.string('node'),kind=a.number(1),error=a.invoke('make-error',[kind,message,undefined]),out=a.invoke('caught',[error]);assert(a.keyEqual(error,out));const summary=a.invoke('error-summary',[out]),name=a.get(summary,0),text=a.get(summary,1);assert.equal(a.readString(name),'TypeError');assert.equal(a.readString(text),'node');for(const value of[message,kind,error,out,summary,name,text])a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);`;
 const result=spawnSync('node',['--input-type=module','-e',script,path],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
},120000);
