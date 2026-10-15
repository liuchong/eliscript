import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
let directory,backend;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-memory-'));backend=await buildBackends({outputRoot:directory});},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const source=`(import "eliscript:memory32" load-u8 load-u16 load-u32 load-f64 store-u8 store-u16 store-u32 store-f64 memory-size memory-grow word-div word-shr word-shl word-and word-or word-xor)
(defun read8 (p) (load-u8 p)) (defun read16 (p) (load-u16 p)) (defun read32 (p) (load-u32 p))
(defun write8 (p v) (store-u8 p v)) (defun write16 (p v) (store-u16 p v)) (defun write32 (p v) (store-u32 p v))
(defun copy64 (to from) (store-f64 to (load-f64 from)))
(defun grow (n) (memory-grow n)) (defun size () (memory-size))
(defun add (a b) (+ a b)) (defun sub (a b) (- a b)) (defun mul (a b) (* a b))
(defun div (a b) (word-div a b)) (defun shr (a b) (word-shr a b)) (defun shl (a b) (word-shl a b))
(defun bits (a b) (word-xor (word-or a b) (word-and a b)))
(defun less (a b) (if (< a b) 1 0))
(defun equal (a b) (if (= a b) 1 0)) (defun unequal (a b) (if (/= a b) 1 0))
(defun le (a b) (if (<= a b) 1 0)) (defun gt (a b) (if (> a b) 1 0)) (defun ge (a b) (if (>= a b) 1 0))
(defun negate (x) (- x)) (defun dec (x) (1- x))
(defun truth (n) (if n 7 8))
(defun either (n) (or n (progn (store-u8 0 99) 7)))
(defun both (n) (and n (progn (store-u8 0 77) 8)))
(defun effects (p) (store-u32 p (progn (store-u8 16 7) 42)))
(defun growth-effects (p) (store-u32 p (progn (memory-grow 1) 123)))
(defun internal (p v) (write32 p v) (read32 p))
(defun sum (a b c d e f g h i) (+ (+ (+ (+ (+ (+ (+ (+ a b) c) d) e) f) g) h) i))
(defun nested (p) (sum (read8 p) 2 3 4 5 6 7 8 9))
(defun trap-inner (p) (read32 p) (store-u8 0 99))
(defun trap-outer (p) (trap-inner p) (store-u8 1 88))
(defun loop (n) (let ((i 0) (s 0)) (while (< i n) (setq s (+ s (load-u8 i))) (setq i (1+ i))) s))
(export read8 read16 read32 write8 write16 write32 copy64 grow size add sub mul div shr shl bits less equal unequal le gt ge negate dec truth either both effects growth-effects internal sum nested trap-outer loop)`;
const arities={read8:1,read16:1,read32:1,write8:2,write16:2,write32:2,copy64:2,grow:1,size:0,add:2,sub:2,mul:2,div:2,shr:2,shl:2,bits:2,less:2,equal:2,unequal:2,le:2,gt:2,ge:2,negate:1,dec:1,truth:1,either:1,both:1,effects:1,'growth-effects':1,internal:2,sum:9,nested:1,'trap-outer':1,loop:1};
async function pair(text=source,signatures=arities,options={initialPages:1,maximumPages:2},nativeOnly=false){
 const ir=backend.compiler.compile_ir_string(text,'native-memory.eli');
 const wasm=nativeOnly?undefined:new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(backend.wasm.emit_memory_wasm(ir,options)))).exports;
 const file=resolve(directory,`memory-${pair.next++}.dylib`);
 await writeFile(file,Uint8Array.from(backend.native.emit_native_memory_library(ir,'arm64-macos')));
 const {openNativeMemory}=await import('../tools/backends/native-memory.mjs');
 const native=await openNativeMemory(file,signatures,options);
 return {native,wasm};
}
pair.next=0;

test('native memory32 emits deterministic direct Mach-O without mutating canonical IR',()=>{
 assert.equal(typeof backend.native.emit_native_memory_object,'function');
 const ir=backend.compiler.compile_ir_string(source,'native-memory.eli'),saved=JSON.stringify(ir);
 const bytes=Uint8Array.from(backend.native.emit_native_memory_object(ir,'arm64-macos'));
 assert.deepEqual(bytes,Uint8Array.from(backend.native.emit_native_memory_object(ir,'arm64-macos')));
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0xfeedfacf);
 assert.equal(JSON.stringify(ir),saved);
 for(const target of [undefined,'x64-linux','auto'])assert.throws(()=>backend.native.emit_native_memory_object(ir,target),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory32 loads and stores little endian, unaligned and truncated values against WASM and DataView',async()=>{
 const {native:n,wasm:w}=await pair();
 try{
  for(const [width,read,write] of [[1,'read8','write8'],[2,'read16','write16'],[4,'read32','write32']])
   for(const p of [0,1,3,7,65536-width])for(const value of [0,1,255,256,65535,0x80000000,0xffffffff]){
    assert.equal(n.invoke(write,p,value),w[write](p,value)>>>0);
    assert.equal(n.invoke(read,p),w[read](p)>>>0);
    const data=new Uint8Array(width),v=new DataView(data.buffer);
    v[`setUint${width*8}`](0,value,true);assert.deepEqual(n.read(p,width),data);
   }
  assert.equal(n.invoke('internal',1,0xfedcba98),0xfedcba98);
  assert.equal(n.invoke('sum',1,2,3,4,5,6,7,8,9),45);
  n.write(Uint8Array.of(1,2,3,4));new Uint8Array(w.memory.buffer).set([1,2,3,4]);
  assert.equal(n.invoke('nested',0),45);assert.equal(n.invoke('loop',4),w.loop(4)>>>0);
 }finally{n.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory32 preserves IEEE payload bytes including NaN and negative zero',async()=>{
 const {native:n,wasm:w}=await pair();
 try{for(const bits of [0n,0x8000000000000000n,0x7ff0000000000000n,0xfff0000000000000n,0x7ff8000012345678n,0x7ff0000012345678n,1n]){
  const bytes=new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,bits,true);
  n.write(bytes,3);new Uint8Array(w.memory.buffer).set(bytes,3);
  assert.equal(n.invoke('copy64',17,3),0);w.copy64(17,3);
  assert.deepEqual(n.read(17,8),new Uint8Array(w.memory.buffer).slice(17,25));assert.deepEqual(n.read(17,8),bytes);
 }}finally{n.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native bounds checks retain operand effects, propagate nested errors and do not wrap u32 addresses',async()=>{
 const {native:n,wasm:w}=await pair();
 try{for(const [width,read,write] of [[1,'read8','write8'],[2,'read16','write16'],[4,'read32','write32'],[8,'copy64','copy64']])
  for(const p of [65537-width,65536,0xfffffff8,0xfffffffc,0xffffffff]){
   assert.throws(()=>n.invoke(read,...(width===8?[p,3]:[p])),WebAssembly.RuntimeError);assert.throws(()=>w[read](p,3),WebAssembly.RuntimeError);
   if(width===8)assert.throws(()=>n.invoke('copy64',0,p),WebAssembly.RuntimeError);
   assert.throws(()=>n.invoke(write,p,42),WebAssembly.RuntimeError);assert.throws(()=>w[write](p,42),WebAssembly.RuntimeError);
  }
  assert.throws(()=>n.invoke('effects',65535),WebAssembly.RuntimeError);assert.throws(()=>w.effects(65535),WebAssembly.RuntimeError);assert.equal(n.invoke('read8',16),7);
  n.write(Uint8Array.of(0,0));assert.throws(()=>n.invoke('trap-outer',65535),WebAssembly.RuntimeError);assert.deepEqual(n.read(0,2),Uint8Array.of(0,0));
  assert.equal(n.invoke('growth-effects',65536),0);assert.equal(w['growth-effects'](65536),0);assert.equal(n.invoke('read32',65536),123);
 }finally{n.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory32 unsigned word arithmetic and numeric truth match WASM and independent JS',async()=>{
 const {native:n,wasm:w}=await pair();
 const js={add:(a,b)=>(a+b)>>>0,sub:(a,b)=>(a-b)>>>0,mul:(a,b)=>Math.imul(a,b)>>>0,div:(a,b)=>Math.trunc(a/b)>>>0,shr:(a,b)=>a>>>b,shl:(a,b)=>(a<<b)>>>0,bits:(a,b)=>(a^b)>>>0,less:(a,b)=>+(a<b),equal:(a,b)=>+(a===b),unequal:(a,b)=>+(a!==b),le:(a,b)=>+(a<=b),gt:(a,b)=>+(a>b),ge:(a,b)=>+(a>=b)};
 try{let seed=0x915e1;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  for(let i=0;i<256;i++){const a=next(),b=next();for(const name of Object.keys(js)){assert.equal(n.invoke(name,a,b),w[name](a,b)>>>0,`${name}/${a}/${b}`);assert.equal(n.invoke(name,a,b),js[name](a,b));}}
  for(const v of [0,1,0x80000000,0xffffffff]){assert.equal(n.invoke('negate',v),(-v)>>>0);assert.equal(n.invoke('dec',v),(v-1)>>>0);assert.equal(n.invoke('truth',v),7);assert.equal(n.invoke('either',v),v);assert.equal(n.invoke('both',v),8);}
  assert.throws(()=>n.invoke('div',1,0),WebAssembly.RuntimeError);assert.throws(()=>w.div(1,0),WebAssembly.RuntimeError);
 }finally{n.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory mappings own their lifetime, isolate instances and zero growth',async()=>{
 const {native:a}=await pair(),{native:b}=await pair();
 try{a.write(Uint8Array.of(77));assert.equal(b.invoke('read8',0),0);
  const copy=a.read(0,1);copy[0]=33;assert.equal(a.invoke('read8',0),77);
  Bun.gc(true);assert.equal(a.invoke('read8',0),77);assert.equal(a.invoke('grow',0),1);assert.equal(a.invoke('grow',1),1);assert.equal(a.invoke('size'),2);assert.deepEqual(a.read(65536,16),new Uint8Array(16));assert.equal(a.invoke('grow',1),0xffffffff);
  for(const bad of [-1,1.5,NaN,Infinity,4294967296])assert.throws(()=>a.invoke('read8',bad),RangeError);
  a.close();assert.throws(()=>a.invoke('read8',0),/closed/);assert.throws(()=>a.read(0,1),/closed/);assert.equal(b.invoke('read8',0),0);
 }finally{a.close();b.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory f64 arithmetic and all ordered comparisons preserve IEEE behavior',async()=>{
 const operators={fadd:'+',fsub:'-',fmul:'*',fdiv:'/',feq:'=',fne:'/=',flt:'<',fle:'<=',fgt:'>',fge:'>='};
 const names=Object.keys(operators),arities=Object.fromEntries(names.map(n=>[n,n.startsWith('f')&&['fadd','fsub','fmul','fdiv'].includes(n)?3:2]));
 const text='(import "eliscript:memory32" load-f64 store-f64) '+Object.entries(operators).map(([name,op])=>
  arities[name]===3?`(defun ${name} (to a b) (store-f64 to (${op} (load-f64 a) (load-f64 b))))`:
   `(defun ${name} (a b) (if (${op} (load-f64 a) (load-f64 b)) 1 0))`).join('\n')+` (export ${names.join(' ')})`;
 const {native:n,wasm:w}=await pair(text,arities);
 const compare={feq:(a,b)=>a===b,fne:(a,b)=>a!==b,flt:(a,b)=>a<b,fle:(a,b)=>a<=b,fgt:(a,b)=>a>b,fge:(a,b)=>a>=b};
 const calc={fadd:(a,b)=>a+b,fsub:(a,b)=>a-b,fmul:(a,b)=>a*b,fdiv:(a,b)=>a/b};
 try{for(const a of [-Infinity,-7,-0,0,Number.MIN_VALUE,1.2,Infinity,NaN])for(const b of [-Infinity,-2,-0,0,3,Infinity,NaN]){
  const bytes=new Uint8Array(16),dv=new DataView(bytes.buffer);dv.setFloat64(0,a,true);dv.setFloat64(8,b,true);n.write(bytes);new Uint8Array(w.memory.buffer).set(bytes);
  for(const name of Object.keys(compare)){assert.equal(n.invoke(name,0,8),w[name](0,8)>>>0,`${name}/${a}/${b}`);assert.equal(n.invoke(name,0,8),+compare[name](a,b));}
  for(const name of Object.keys(calc)){assert.equal(n.invoke(name,32,0,8),0);w[name](32,0,8);const got=new DataView(n.read(32,8).buffer).getFloat64(0,true);assert(Object.is(got,calc[name](a,b)),`${name}/${a}/${b}`);assert(Object.is(got,new DataView(w.memory.buffer).getFloat64(32,true)));}
 }}finally{n.close();}
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory zero-page mappings, growth limits and invalid ABI inputs fail safely',async()=>{
 // The existing WASM emitter rejects zero initial pages; this boundary checks
 // the native mapping itself without claiming emitter parity for that option.
 const {native:n}=await pair(source,arities,{initialPages:0,maximumPages:1},true);
 try{assert.equal(n.byteLength,0);assert.equal(n.invoke('size'),0);assert.equal(n.invoke('grow',0),0);
  assert.throws(()=>n.invoke('read8',0),WebAssembly.RuntimeError);
  assert.equal(n.invoke('grow',0xffffffff),0xffffffff);assert.equal(n.invoke('size'),0);
  assert.equal(n.invoke('grow',1),0);assert.equal(n.invoke('write32',65532,0xffffffff),0);assert.equal(n.invoke('read32',65532),0xffffffff);
  assert.throws(()=>n.invoke('missing'),TypeError);assert.throws(()=>n.invoke('read8'),TypeError);assert.throws(()=>n.invoke('read8',0,1),TypeError);
  assert.throws(()=>n.write(Uint8Array.of(1),65536),RangeError);assert.throws(()=>n.read(65535,2),RangeError);assert.throws(()=>n.write([]),TypeError);
  const {openNativeMemory}=await import('../tools/backends/native-memory.mjs');
  for(const options of [{initialPages:-1},{initialPages:2,maximumPages:1},{initialPages:1.5},{maximumPages:65537}])await assert.rejects(openNativeMemory('unused',{},options),RangeError);
 }finally{n.close();}
});

test('native memory rejects indirect calls and unsupported input even in unselected branches',()=>{
 for(const text of [
  '(import "eliscript:memory32" call-source) (defun f (a b c d e) (call-source a b c d e))',
  '(defun f (x) (if false (js* "x") x))',
  '(import "eliscript:memory32" store-u32 load-f64) (defun f (p) (store-u32 p (load-f64 p)))',
  '(defun f (x) -0.0)',
 ])assert.throws(()=>backend.native.emit_native_memory_object(backend.compiler.compile_ir_string(text,'memory-rejected.eli'),'arm64-macos'),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
});

test.skipIf(process.platform!=='darwin'||process.arch!=='arm64')('native memory result bytes and unsigned arithmetic agree with an independent Node oracle',async()=>{
 const values=[0,1,255,65535,0x80000000,0xffffffff];
 const script=`const a=${JSON.stringify(values)};console.log(JSON.stringify(a.flatMap(x=>a.map(y=>[x,y,(x+y)>>>0,Math.imul(x,y)>>>0,(x^y)>>>0]))));`;
 const oracle=spawnSync(process.env.NODE??'node',['--input-type=module','-e',script],{encoding:'utf8',timeout:30000});assert.equal(oracle.status,0,oracle.stderr);
 const {native:n}=await pair();
 try{for(const [a,b,add,mul,bits] of JSON.parse(oracle.stdout)){assert.equal(n.invoke('add',a,b),add);assert.equal(n.invoke('mul',a,b),mul);assert.equal(n.invoke('bits',a,b),bits);}}finally{n.close();}
});

test('native memory direct emission reaches a public Seed and three-generation byte fixed point',async()=>{
 const root=resolve(import.meta.dir,'..');
 const generations=[await buildBackends({outputRoot:resolve(directory,'g1'),seed:true})];
 const modules=(await readdir(resolve(root,'bootstrap/compiler'))).filter(n=>n.endsWith('.eli')).sort();
 for(const name of ['g2','g3']){
  const outputRoot=resolve(directory,name),output=resolve(outputRoot,'bootstrap'),previous=generations.at(-1).compiler;
  await mkdir(output,{recursive:true});
  for(const file of modules){
   const input=resolve(root,'bootstrap/compiler',file),generated=file.replace(/\.eli$/,'.mjs');
   const emission=previous.compile_string_with_source_map(await readFile(input,'utf8'),input,generated,relative(output,input));
   await writeFile(resolve(output,generated),`${emission.javascript}//# sourceMappingURL=${generated}.map\n`);
   await writeFile(resolve(output,`${generated}.map`),emission.sourceMap);
  }
  const b=await buildBackends({outputRoot,frontend:previous});b.compiler=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);generations.push(b);
 }
 const artifacts=generations.map(g=>{
  const ir=g.compiler.compile_ir_string(source,'native-memory.eli');
  return {object:Uint8Array.from(g.native.emit_native_memory_object(ir,'arm64-macos')),library:Uint8Array.from(g.native.emit_native_memory_library(ir,'arm64-macos'))};
 });
 for(const artifact of artifacts.slice(1))assert.deepEqual(artifact,artifacts[0]);
},120000);
