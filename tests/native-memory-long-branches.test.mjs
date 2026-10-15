import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildBackends} from '../tools/backends/build.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
let directory,b,memory,assembly;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-native-long-branches-'));b=await buildBackends({outputRoot:directory});memory=await import(pathToFileURL(resolve(b.directory,'memory.mjs')).href);const text=await readFile('bootstrap/backends/native.eli','utf8'),privateSource=text.slice(0,text.lastIndexOf(')'))+' (export branch-word patch-jump finish-branches long-jump typed-code memory-code macho-library))',file=resolve(b.directory,'native-assembly-unit.mjs');await writeFile(file,b.compiler.compile_string(privateSource,'native-assembly-unit.eli'));assembly=await import(pathToFileURL(file).href);},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function* walk(node){yield node;for(const child of node.children)yield*walk(child);}
function largeProgram(){const ir=b.compiler.compile_ir_string('(defun branch (n) (if (< n 1) 7 9)) (export branch)','long-branch.eli'),program=memory.lower_memory_program(ir),node=[...walk(program.functions[0].body)].find(n=>n.kind==='if');node.children[1]={kind:'sequence',type:'u32',value:null,children:[...Array.from({length:65536},()=>({kind:'literal',type:'u32',value:0,children:[]})),node.children[1]]};return program;}
test('generic memory IR branches over more than one MiB without changing its typed input',()=>{const program=largeProgram(),saved=JSON.stringify(program),bytes=Uint8Array.from(b.native.emit_typed_native_memory_object(program,'arm64-macos'));assert.equal(JSON.stringify(program),saved);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0xfeedfacf);});

// These complete image identities were observed before branch relaxation changed.
test('unchanged short branch images',()=>{const p=b.compiler.compile_ir_string('(defun f (x) (if (< x 0) (- x) x)) (export f)','short.eli'),m=memory.lower_memory_program(p);const hashes=[b.native.emit_native_numeric_object(p,'arm64-macos'),b.native.emit_typed_native_memory_object(m,'arm64-macos'),b.native.emit_native_numeric_executable(b.compiler.compile_ir_string('(defun main () 42) (export main)','entry.eli'),'arm64-macos','main')].map(bytes=>createHash('sha256').update(Uint8Array.from(bytes)).digest('hex'));assert.deepEqual(hashes,['f66f8684c86bf732f03e9824055eeb74e2fe95b3c57c94702f6004f3bc6b606a','88ea9c0f87796a87bfc84b2f1e40d888cd38e5abcce6d18192bd3d7455293c73','6dc7091ec3074b05abadb38a3832eba658e76cb90615a0b674e8cf4216afe8c2']);});

function signed(value,bits){const sign=2**(bits-1);return value>=sign?value-2**bits:value;}
test('all emitted branch kinds retain their real signed displacement widths and original condition/register bits',()=>{
 for(const[opcode,bits]of [[0x14000000,26],[0x94000000,26],[0x5400000b,19],[0x34000009,19],[0xb500000c,19],[0x3608000d,14]]){
  const limit=2**(bits-1);for(const distance of [-limit,-1,0,1,limit-1]){const word=assembly.branch_word(opcode,distance)>>>0,immediate=bits===26?word&0x3ffffff:(word>>>5)&(2**bits-1);assert.equal(signed(immediate,bits),distance);assert.equal(word&(bits===26?0xfc000000:bits===14?0xfff8001f:0xff00001f),opcode&(bits===26?0xfc000000:bits===14?0xfff8001f:0xff00001f));}
  for(const distance of [-limit-1,limit])assert.throws(()=>assembly.branch_word(opcode,distance),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 }
});
test('layout reaches a fixed point when a newly long forward branch pushes another forward or backward branch out of range',()=>{
 const NOP=0xd503201f;
 for(const backward of [false,true]){const words=Array(262147).fill(NOP),state={words,constants:[{uses:[262143]}],tableUses:[2]},offsets=[0,262143*4];
  if(backward){words[1]=0x34000000;words[262144]=0x5400000b;assembly.patch_jump(state,1,262146);assembly.patch_jump(state,262144,0);}
  else{words[0]=0x54000000;words[1]=0x34000009;assembly.patch_jump(state,0,262143);assembly.patch_jump(state,1,262145);}
  assembly.finish_branches(state,offsets);assert.equal(state.words.length,words.length+2);assert.deepEqual(offsets,[0,(262143+(backward?1:2))*4]);assert.deepEqual(state.tableUses,[backward?3:4]);assert.deepEqual(state.constants[0].uses,[262143+(backward?1:2)]);
  if(backward){assert.equal(signed(state.words[262146]&0x3ffffff,26),-262146);}else{assert.equal(state.words[0]>>>0,0x54000041);assert.equal(state.words[2]>>>0,0x35000049);assert.equal(signed(state.words[1]&0x3ffffff,26),262144);assert.equal(signed(state.words[3]&0x3ffffff,26),262144);}
 }
});
function longDelta(words,start=0){assert.equal(words[start]>>>0,0x10000010);let result=0n;for(let i=0;i<4;i++){const word=words[start+1+i]>>>0;assert.equal(word&31,17);result|=BigInt((word>>>5)&0xffff)<<BigInt(i*16);}return BigInt.asIntN(64,result);}
test('far B BL and conditional encodings use a relocatable signed delta without needing enormous test images',()=>{
 for(const[opcode,target,size]of [[0x14000000,33554432,7],[0x94000000,-33554433,7],[0x5400000b,33554432,8],[0x35000009,-33554433,8]]){const state={words:[opcode]};assembly.patch_jump(state,0,target);assembly.finish_branches(state,[]);assert.equal(state.words.length,size);const start=size===8?1:0,mapped=target>0?target+size-1:target;assert.equal(longDelta(state.words,start),BigInt((mapped-start)*4));assert.equal(state.words[size-1]>>>0,opcode===0x94000000?0xd63f0200:0xd61f0200);if(size===8)assert.equal(signed((state.words[0]>>>5)&0x7ffff,19),8);}
});
nativeTest('real ARM64 long B and BLR sequences preserve execution and the normal memory call ABI',async()=>{
 const {openNativeMemory}=await import('../tools/backends/native-memory.mjs');
 const branchState={words:[],compact:false};assembly.long_jump(branchState,8,false);branchState.words.push(0x52800c60,0x528000e0,0xd65f03c0);const branchProgram={functions:[{name:'run',arity:0,index:0,locals:[]}],exports:['run']},branchFile=resolve(directory,'long-b.dylib');await writeFile(branchFile,Uint8Array.from(assembly.macho_library(branchProgram,{words:branchState.words,offsets:[0]})));const branch=await openNativeMemory(branchFile,{run:0});try{assert.equal(branch.invoke('run'),7);}finally{branch.close();}
 const p=memory.lower_memory_program(b.compiler.compile_ir_string('(defun target (n) (+ n 3)) (defun run (n) (target n)) (export run)','long-blr.eli')),code=assembly.memory_code(p),at=code.words.findIndex((word,i)=>i>=code.offsets[1]/4&&(word>>>26)===0x25);assert(at>=0);const replacement={words:[],compact:false};assembly.long_jump(replacement,code.offsets[0]/4-at,true);code.words.splice(at,1,...replacement.words);const file=resolve(directory,'long-blr.dylib');await writeFile(file,Uint8Array.from(assembly.macho_library(p,code)));const n=await openNativeMemory(file,{run:1});try{assert.equal(n.invoke('run',10),13);}finally{n.close();}
});
nativeTest('relaxed forward backward calls indirect table and real traps execute against identical WASM typed IR',async()=>{
 const text='(import "eliscript:memory32" load-u8 call-source) (defun table-target (a b c d) (+ (+ a b) (+ c d))) (defun target (n) (+ n 3)) (defun trap (n) (load-u8 n)) (defun forward (n) (if (< n 1) (progn (target n) 7) 9)) (defun backward (n) (while (> n 0) (setq n (- n 1))) n) (defun trapped (n) (trap n) 7) (defun dispatch (n) (call-source n 1 2 3 0)) (export forward backward trapped dispatch)',p=memory.lower_memory_program(b.compiler.compile_ir_string(text,'long-execute.eli'));
 const padding=()=>Array.from({length:65536},()=>({kind:'literal',type:'u32',value:0,children:[]}));
 const forward=[...walk(p.functions.find(f=>f.name==='forward').body)].find(n=>n.kind==='if');forward.children[1].children.splice(1,0,...padding());
 const loop=[...walk(p.functions.find(f=>f.name==='backward').body)].find(n=>n.kind==='while');loop.children[1].children.unshift(...padding());
 const trapped=p.functions.find(f=>f.name==='trapped').body;trapped.children.splice(1,0,...padding());p.table=[p.functions.find(f=>f.name==='table-target').index];
 const snapshot=JSON.stringify(p),wasm=Uint8Array.from(b.wasm.emit_typed_memory_wasm(structuredClone(p))),w=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports,file=resolve(directory,'relaxed.dylib');assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);await writeFile(file,Uint8Array.from(b.native.emit_typed_native_memory_library(p,'arm64-macos')));assert.equal(JSON.stringify(p),snapshot);const{openNativeMemory}=await import('../tools/backends/native-memory.mjs'),n=await openNativeMemory(file,{forward:1,backward:1,trapped:1,dispatch:1});try{for(const value of[0,1,2,0xffffffff])assert.equal(n.invoke('forward',value),w.forward(value)>>>0);for(const value of[0,1,2])assert.equal(n.invoke('backward',value),w.backward(value)>>>0);for(const value of[0,10,0xffffffff])assert.equal(n.invoke('dispatch',value),w.dispatch(value)>>>0);assert.throws(()=>n.invoke('trapped',65536),WebAssembly.RuntimeError);assert.throws(()=>w.trapped(65536),WebAssembly.RuntimeError);assert.equal(n.invoke('trapped',0),w.trapped(0)>>>0);}finally{n.close();}
});

nativeTest('long floating-point conditionals retain ordered NaN comparisons and signed-zero results against JavaScript and WASM',async()=>{
 const source='(defun choose (x) (if (< x 0) -0.0 x)) (export choose)',ir=b.compiler.compile_ir_string(source,'long-float.eli'),program=b.numeric.lower_numeric_program(ir),node=[...walk(program.functions[0].body)].find(n=>n.kind==='if');node.children[1]={kind:'sequence',type:'f64',value:null,children:[...Array.from({length:65536},()=>({kind:'literal',type:'f64',value:0,children:[]})),node.children[1]]};const snapshot=JSON.stringify(program),code=assembly.typed_code(program,{registerAllocation:false}),wasm=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(b.wasm.emit_typed_numeric_wasm(program)))).exports,js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64')),file=resolve(directory,'long-float.dylib');await writeFile(file,Uint8Array.from(assembly.macho_library(program,code)));assert.equal(JSON.stringify(program),snapshot);const{dlopen}=await import('bun:ffi'),native=dlopen(file,{choose:{args:['f64'],returns:'f64'}});try{for(const value of[NaN,Infinity,-Infinity,-1,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,1]){assert(Object.is(native.symbols.choose(value),js.choose(value)));assert(Object.is(wasm.choose(value),js.choose(value)));}}finally{native.close();}
});
