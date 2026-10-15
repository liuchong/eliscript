import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const binary = [
 ['add', '+', (a,b)=>a+b], ['subtract', '-', (a,b)=>a-b], ['multiply', '*', (a,b)=>a*b], ['divide', '/', (a,b)=>a/b], ['remainder', '%', (a,b)=>a%b],
 ['less', '<', (a,b)=>a<b], ['less-equal', '<=', (a,b)=>a<=b], ['greater', '>', (a,b)=>a>b], ['greater-equal', '>=', (a,b)=>a>=b],
 ['bits-and', 'bit-and', (a,b)=>a&b], ['bits-or', 'bit-or', (a,b)=>a|b], ['bits-xor', 'bit-xor', (a,b)=>a^b],
 ['shift-left', 'bit-shift-left', (a,b)=>a<<b], ['shift-right', 'bit-shift-right', (a,b)=>a>>b], ['shift-unsigned', 'unsigned-bit-shift-right', (a,b)=>a>>>b],
 ['same', 'eq', (a,b)=>a===b], ['different', '/=', (a,b)=>a!==b],
];
const unary=[['negate', '-', x=>-x], ['signed', 'int32', x=>x|0], ['unsigned', 'uint32', x=>x>>>0], ['bits-not', 'bit-not', x=>~x]];
const methods=['at','charAt','charCodeAt','codePointAt','substring','startsWith','endsWith','repeat','trim','trimStart','trimEnd','isWellFormed','toWellFormed','valueOf','substr','toUpperCase','toLowerCase','padStart','padEnd','split'];
const fixture = '(defconst marker 1)\n' + binary.map(([name,op])=>`(defun ${name} (a b) (${op} a b))`).join('\n') + unary.map(([name,op])=>`(defun ${name} (a) (${op} a))`).join('\n') + `
 (defun hook (trace label first second mode)
  (js-object :valueOf (if (= mode 3) 7 (lambda () (put trace :events (+ (aref trace "events") label "v")) (if (or (= mode 0) (= mode 5)) first (js-object))))
   :toString (if (= mode 4) 7 (lambda () (put trace :events (+ (aref trace "events") label "s")) (if (or (= mode 2) (= mode 5)) (js-object) second)))))
 (defun inherited (prototype) (let ((item (js-object))) (put item :__proto__ prototype) item))
 (defun receiver (trace name)
  (let ((item (js-object)))
   (put item name (lambda (&rest args) (put trace :events (+ (aref trace "events") "o")) args)) item))
 (defun split (text separator limit) (js-call text :split separator limit))
 (defun numeric-after (a b trace) (+ (- a b) (put trace :later t)))
 (defun overwrite-right (trace right answer)
  (js-object :valueOf (lambda () (put trace :events (+ (aref trace "events") "l"))
    (put right :valueOf (lambda () (put trace :events (+ (aref trace "events") "n")) 9)) answer)))
` + methods.map((method,i)=>`(defun ordinary-${i} (receiver trace)
 (js-call receiver :${method}
  (progn (put trace :events (+ (aref trace "events") "a"))
   (put receiver "${method}" (lambda (&rest args) (put trace :events (+ (aref trace "events") "n")) args)) "/")
  (progn (put trace :events (+ (aref trace "events") "b")) 2)
  (progn (put trace :events (+ (aref trace "events") "c")) t)))`).join('\n') +
 `(export ${[...binary.map(x=>x[0]),...unary.map(x=>x[0]),...methods.map((_,i)=>'ordinary-'+i),'hook','inherited','receiver','split','numeric-after','overwrite-right'].join(' ')})`;
let directory,b,runtime,program,bytes;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-operands-'));b=await buildBackends({outputRoot:directory});runtime=b.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');program=b.compiler.compile_ir_string(fixture,'operand-conversion.eli');bytes=emit();},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function emit(rt=runtime){const saved=JSON.stringify(program),out=Uint8Array.from(b.managed.emit_managed_wasm(program,rt));assert.equal(JSON.stringify(program),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)),[]);return out;}
const box=(a,x)=>typeof x==='number'?a.number(x):typeof x==='string'?a.string(x):x;
function read(a,x){if(x?.kind===4)return a.readNumber(x);if(x?.kind===5)return a.readString(x);if(x?.kind===14){const out=[];for(let i=0;i<a.length(x);i++){const v=a.get(x,i);try{out.push(read(a,v));}finally{a.release(v);}}return out;}return x;}
function get(a,o,key){const k=a.string(key);try{const v=a.objectGet(o,k);try{return read(a,v);}finally{a.release(v);}}finally{a.release(k);}}
function finish(a,values=[]){for(const v of values)a.release(v);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
function hook(a,trace,label,first,second,mode=0){const values=[label,first,second,mode].map(v=>box(a,v));try{return a.invoke('hook',[trace,...values]);}finally{values.forEach(v=>a.release(v));}}
function referenceHook(trace,label,first,second,mode=0){return {valueOf:mode===3?7:function(){trace.push(label+'v');return mode===0||mode===5?first:{};},toString:mode===4?7:function(){trace.push(label+'s');return mode===2||mode===5?{}:second;}};}
function instance(options,rt=runtime){const a=instantiateManagedRuntime(rt===runtime?bytes:emit(rt),options);a.auto(1);return a;}

test('ordinary objects retain default and Number hint order across the complete supported arithmetic bitwise and relation family',()=>{
 const a=instance(),values=[undefined,null,false,true,0,-0,1,-1,NaN,Infinity,-Infinity,Number.MIN_VALUE,'','2','10','x','中\ud800'];
 for(let i=0;i<values.length;i++)for(const mode of[0,1,3]){
  for(const[name,,oracle]of binary){const events=[],empty=a.string(''),trace=a.sourceObject({events:empty}),left=hook(a,trace,'l',values[i],values[(i+3)%values.length],mode),right=hook(a,trace,'r',values[(i+1)%values.length],values[(i+5)%values.length],mode);let out;a.release(empty);
   try{const expected=oracle(referenceHook(events,'l',values[i],values[(i+3)%values.length],mode),referenceHook(events,'r',values[(i+1)%values.length],values[(i+5)%values.length],mode));out=a.invoke(name,[left,right]);assert.deepEqual(read(a,out),expected,name);assert.equal(get(a,trace,'events'),events.join(''),name);}finally{for(const v of[trace,left,right,out])a.release(v);}a.collect();
  }
 }
 finish(a);
});

test('unary conversion and inherited source hooks agree with native JS without numeric conversion during strict equality',()=>{
 const a=instance();for(const value of[undefined,null,false,true,-0,NaN,'2','-0','x'])for(const mode of[0,1,3])for(const[name,,oracle]of unary){const events=[],empty=a.string(''),trace=a.sourceObject({events:empty}),base=hook(a,trace,'v',value,value,mode),input=a.invoke('inherited',[base]);a.release(empty);const out=a.invoke(name,[input]);assert.deepEqual(read(a,out),oracle(referenceHook(events,'v',value,value,mode)));assert.equal(get(a,trace,'events'),events.join(''));for(const v of[trace,base,input,out])a.release(v);a.collect();}finish(a);
});

test('each conversion resolves the next operand after earlier hook effects and a failed first operand suppresses all later conversions',()=>{
 const a=instance();for(const[name,,oracle]of binary.filter(x=>!['same','different'].includes(x[0]))){const empty=a.string(''),trace=a.sourceObject({events:empty,later:false}),right=hook(a,trace,'r',4,4),answer=a.string('2'),left=a.invoke('overwrite-right',[trace,right,answer]);a.release(empty);const out=a.invoke(name,[left,right]);assert.deepEqual(read(a,out),oracle('2',9));assert.equal(get(a,trace,'events'),'ln');for(const v of[trace,right,answer,left,out])a.release(v);a.collect();}
 for(const mode of[2,4]){const empty=a.string(''),trace=a.sourceObject({events:empty,later:false}),left=hook(a,trace,'l',1,2,mode),right=hook(a,trace,'r',1,2);a.release(empty);assert.throws(()=>a.invoke('numeric-after',[left,right,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(get(a,trace,'events'),mode===2?'lvls':'lv');assert.equal(get(a,trace,'later'),false);assert.equal(a.stats().frameDepth,0);for(const v of[trace,left,right])a.release(v);a.collect();}finish(a);
});

test('ordinary text method values are captured before arguments and ignored extras complete before noncallable failure',()=>{
 const a=instance();for(let i=0;i<methods.length;i++){const empty=a.string(''),trace=a.sourceObject({events:empty}),name=a.string(methods[i]),receiver=a.invoke('receiver',[trace,name]);a.release(empty);const out=a.invoke('ordinary-'+i,[receiver,trace]);assert.deepEqual(read(a,out),['/',2,true]);assert.equal(get(a,trace,'events'),'abco');for(const v of[trace,name,receiver,out])a.release(v);a.collect();}
 for(const receiverValue of[{}, {split:null}, {split:false}, {split:7}]){const roots=Object.fromEntries(Object.entries(receiverValue).map(([k,v])=>[k,box(a,v)])),receiver=a.sourceObject(roots),empty=a.string(''),trace=a.sourceObject({events:empty});Object.values(roots).forEach(v=>a.release(v));a.release(empty);assert.throws(()=>a.invoke('ordinary-19',[receiver,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(get(a,trace,'events'),'abc');for(const v of[receiver,trace])a.release(v);a.collect();}
 for(const receiver of[null,undefined]){const empty=a.string(''),trace=a.sourceObject({events:empty});a.release(empty);assert.throws(()=>a.invoke('ordinary-19',[receiver,trace]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(get(a,trace,'events'),'');a.release(trace);a.collect();}finish(a);
});

test('split preserves limit-before-separator conversion including zero and skips later conversions after a first error',()=>{
 const a=instance();for(const value of[undefined,null,false,true,0,-0,1,2,-1,2**32,2**32+1,NaN,Infinity,'2'])for(const mode of[0,1,3])for(const separatorMode of[0,5]){const events=[],empty=a.string(''),trace=a.sourceObject({events:empty}),limit=hook(a,trace,'l',value,value,mode),separator=hook(a,trace,'s',separatorMode===5?'/':'ignored','/',separatorMode),text=a.string('a/b/c');a.release(empty);const out=a.invoke('split',[text,separator,limit]),expected='a/b/c'.split(referenceHook(events,'s',separatorMode===5?'/':'ignored','/',separatorMode),referenceHook(events,'l',value,value,mode));assert.deepEqual(read(a,out),expected);assert.equal(get(a,trace,'events'),events.join(''));for(const v of[trace,limit,separator,text,out])a.release(v);a.collect();}
 for(const failing of['limit','separator']){const empty=a.string(''),trace=a.sourceObject({events:empty}),limit=hook(a,trace,'l',1,1,failing==='limit'?2:0),separator=hook(a,trace,'s','x','/',failing==='separator'?2:0),text=a.string('a/b');a.release(empty);assert.throws(()=>a.invoke('split',[text,separator,limit]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(get(a,trace,'events'),failing==='limit'?'lvls':'lvsssv');for(const v of[trace,limit,separator,text])a.release(v);a.collect();}finish(a);
});

test('fixed random binary64 primitives returned by source hooks retain exact signed zero NaN and string comparison results',()=>{
 const a=instance();let seed=0x5417c32;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,bits=new DataView(new ArrayBuffer(8));const random=()=>{bits.setUint32(0,next(),true);bits.setUint32(4,next(),true);return bits.getFloat64(0,true);};
 for(let i=0;i<128;i++){const l=i%3?random():String.fromCharCode(next()%65536),r=i%3?random():String.fromCharCode(next()%65536);const empty=a.string(''),trace=a.sourceObject({events:empty}),left=hook(a,trace,'l',l,l),right=hook(a,trace,'r',r,r);a.release(empty);for(const[name,,oracle]of binary){const out=a.invoke(name,[left,right]);assert.deepEqual(read(a,out),oracle(referenceHook([],'l',l,l),referenceHook([],'r',r,r)),name);a.release(out);}for(const v of[trace,left,right])a.release(v);a.collect();}assert(a.stats().collections>1000);finish(a);
});

test('capacity failure and a real comparison trap preserve caller roots and earlier conversion effects without retaining private frames',async()=>{
 const a=instance({maxSlots:128,initialBytes:8192,maxBytes:8192}),empty=a.string(''),trace=a.sourceObject({events:empty}),left=hook(a,trace,'l',2,2),right=hook(a,trace,'r',3,3),saved=a.number(-0),frame=a.frame(1);a.release(empty);a.frameSet(frame,0,saved);
 const held=[];for(let i=0;i<256;i++){try{held.push(a.number(i));}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');break;}}assert(held.length>0&&held.length<256);
 assert.throws(()=>a.invoke('add',[left,right]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(saved),-0));held.forEach(v=>a.release(v));a.collect();const output=a.invoke('add',[left,right]);assert.equal(read(a,output),5);assert.equal(get(a,trace,'events'),'lvrv');a.leaveFrame(frame);finish(a,[trace,left,right,saved,output]);
 const text=await readFile('bootstrap/runtime/memory.eli','utf8'),start=text.indexOf('  (defun heap-source-relational '),end=text.indexOf('\n  (defun ',start+1);assert(start>=0&&end>start);const original=text.slice(start,end),tail=original.lastIndexOf('result))');assert(tail>0);const injected=original.slice(0,tail)+'(load-u32 4294967295)))'+original.slice(tail+8),rt=b.compiler.compile_ir_string(text.slice(0,start)+injected+text.slice(end),'operand-trap.eli'),trapped=instance(undefined,rt),blank=trapped.string(''),log=trapped.sourceObject({events:blank}),l=hook(trapped,log,'l',2,2),r=hook(trapped,log,'r',3,3),caller=trapped.frame(1);trapped.release(blank);trapped.frameSet(caller,0,log);
 assert.throws(()=>trapped.invoke('less',[l,r]),WebAssembly.RuntimeError);assert.equal(trapped.stats().frameDepth,1);assert.equal(get(trapped,log,'events'),'lvrv');const two=trapped.number(2),three=trapped.number(3),sum=trapped.invoke('add',[two,three]);assert.equal(read(trapped,sum),5);trapped.leaveFrame(caller);finish(trapped,[log,l,r,two,three,sum]);
});

test('malformed raw operands modes unfinished strings and private frames fail before allocation and preserve heap lifetime',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports,h=e['heap-new'](64,8192,8192),number=e['value-number'](h,0,0x3ff00000),unfinished=e['value-string'](h,1),frame=e['frame-new'](h,1);e['frame-set'](h,frame,0,number);const before=e['heap-live'](h),used=e['heap-used'](h);
 for(const[fn,args,code]of[
  ['value-primitive-binary',[number,0xffffffff,0],1],['value-primitive-binary',[frame,number,0],3],['value-primitive-binary',[number,number,5],3],
  ['value-primitive-compare',[number,number,6],3],['value-primitive-word',[number,3],3],['value-primitive-bitwise',[number,number,7],3],
 ]){assert.equal(e[fn](h,...args),0);assert.equal(e['last-error'](),code);assert.equal(e['heap-live'](h),before);assert.equal(e['heap-used'](h),used);assert.equal(e['frame-depth'](h),1);}
 e['heap-pin'](h,unfinished);e['heap-auto'](h,1);assert.equal(e['value-primitive-binary'](h,unfinished,number,0),0);assert.equal(e['last-error'](),6);assert.equal(e['frame-depth'](h),1);e['heap-release'](h,unfinished);e['frame-pop'](h,frame);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);assert.equal(e['value-primitive-negate'](h,number),0);assert.equal(e['last-error'](),1);
});

test('independent Node executes identical operand and ordinary split bytes with native operator oracles under collecting GC',async()=>{
 const file=resolve(directory,'operand-conversion.wasm');await writeFile(file,bytes);const code=`import assert from'node:assert/strict';import{readFileSync}from'node:fs';const{instantiateManagedRuntime}=await import(process.argv[1]);
 const box=${box.toString()};\n${read.toString()}\n${get.toString()}\n${finish.toString()}\n${hook.toString()}\n${referenceHook.toString()}\nconst a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);
 const operations=[${binary.map(([name,,fn])=>'['+JSON.stringify(name)+','+fn.toString()+']').join(',')}];
 for(const value of[undefined,null,false,true,-0,NaN,Infinity,'2','10','x','😀'])for(const mode of[0,1,3]){
 const empty=a.string(''),trace=a.sourceObject({events:empty}),left=hook(a,trace,'l',value,value,mode),right=hook(a,trace,'r',2,'3',mode);a.release(empty);
 for(const[name,oracle]of operations){const events=[],out=a.invoke(name,[left,right]);assert.deepEqual(read(a,out),oracle(referenceHook(events,'l',value,value,mode),referenceHook(events,'r',2,'3',mode)),name);a.release(out);}
 for(const v of[trace,left,right])a.release(v);a.collect();}
 const text=a.string('a/b/c'),separator=a.string('/'),limit=a.number(2),out=a.invoke('split',[text,separator,limit]);assert.deepEqual(read(a,out),'a/b/c'.split('/',2));finish(a,[text,separator,limit,out]);`;
 const result=spawnSync('node',['--input-type=module','-e',code,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
});

test('acyclic nested and sparse source arrays use ordinary join conversion for all operators while strict identity never converts',()=>{
 const a=instance();function array(value){const children=value.map(v=>Array.isArray(v)?array(v):box(a,v)),out=a.sourceArray(children);Object.values(children).forEach(v=>a.release(v));return out;}
 for(const value of[[],[null],[undefined],[1],[1,2],[,3,,],[[1],[null,'2']],['\ud800','😀']]){const input=array(value),right=a.string('3');for(const[name,,oracle]of binary){const out=a.invoke(name,[input,right]);assert.deepEqual(read(a,out),oracle(value,'3'),name);a.release(out);}assert.equal(a.invoke('same',[input,input]),true);for(const[name,,oracle]of unary){const out=a.invoke(name,[input]);assert.deepEqual(read(a,out),oracle(value));a.release(out);}a.release(input);a.release(right);a.collect();}finish(a);
});

test('raw internal containers and the unrepresented Symbol.split protocol remain explicit capability errors',()=>{
 const a=instance(),internal=a.array(),number=a.number(1);for(const name of['add','subtract','less'])assert.throws(()=>a.invoke(name,[internal,number]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0003');assert.equal(a.stats().frameDepth,0);finish(a,[internal,number]);
 for(const global of['Symbol.split']){const p=b.compiler.compile_ir_string('(defun unsupported () (js* '+JSON.stringify(global)+')) (export unsupported)','conversion-protocol.eli');assert.throws(()=>b.managed.emit_managed_wasm(p,runtime),e=>e.eliscriptDiagnostic?.code==='ELI-B0001'&&e.eliscriptDiagnostic.location.file==='conversion-protocol.eli');}
});
