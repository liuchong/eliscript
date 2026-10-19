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
function memoryPadding(){
 const ir=b.compiler.compile_ir_string('(import "eliscript:memory32" load-u8) (defun padding () (load-u8 0)) (export padding)','branch-padding.eli');
 const lowered=memory.lower_memory_program(ir),access=[...walk(lowered.functions[0].body)].find(node=>node.kind==='memory-op'&&node.value==='load-u8');
 assert(access,'padding must be an actual lowered memory read, including its trap semantics');
 return Array.from({length:65536},()=>structuredClone(access));
}
function assertLongMemoryBranches(bytes,{backward=false}={}){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),commands=view.getUint32(16,true);
 let command=32,start=-1,count=0;
 for(let i=0;i<commands;i++){
  const kind=view.getUint32(command,true),size=view.getUint32(command+4,true);
  if(kind===0x19)for(let section=0;section<view.getUint32(command+64,true);section++){
   const at=command+72+section*80;
   let name='';for(let j=0;j<16&&view.getUint8(at+j)!==0;j++)name+=String.fromCharCode(view.getUint8(at+j));
   if(name==='__text'){start=view.getUint32(at+48,true);count=Number(view.getBigUint64(at+40,true))/4;}
  }
  command+=size;
 }
 assert(start>=0&&Number.isSafeInteger(count)&&count>0,'actual image must declare its code section');
 assert(start+count*4<=bytes.byteLength);
 let relaxedForward=false,longBackward=false;
 for(let i=0;i<count;i++){
  const word=view.getUint32(start+i*4,true);
  if(((word&0xfc000000)>>>0)===0x14000000&&signed(word&0x3ffffff,26)<-262144)longBackward=true;
  const conditional=((word&0xff000010)>>>0)===0x54000000||((word&0x7e000000)>>>0)===0x34000000;
  if(conditional&&signed((word>>>5)&0x7ffff,19)===2&&i+1<count){
   const next=view.getUint32(start+(i+1)*4,true),distance=signed(next&0x3ffffff,26);
   if(((next&0xfc000000)>>>0)===0x14000000&&distance>=262143){
    assert(i+1+distance<count,'relaxed conditional must reach a real code label');relaxedForward=true;
   }
  }
 }
 assert(relaxedForward,'actual machine code must invert a conditional and branch beyond imm19 range');
 if(backward)assert(longBackward,'actual machine code must retain the long backward loop branch');
}
function largeProgram(){const ir=b.compiler.compile_ir_string('(defun branch (n) (if (< n 1) 7 9)) (export branch)','long-branch.eli'),program=memory.lower_memory_program(ir),node=[...walk(program.functions[0].body)].find(n=>n.kind==='if');node.children[1]={kind:'sequence',type:'u32',value:null,children:[...memoryPadding(),node.children[1]]};return program;}
test('generic memory IR branches over more than one MiB without changing its typed input',()=>{const program=largeProgram(),saved=JSON.stringify(program),bytes=Uint8Array.from(b.native.emit_typed_native_memory_object(program,'arm64-macos'));assert.equal(JSON.stringify(program),saved);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0xfeedfacf);assertLongMemoryBranches(bytes);});

// Numeric/executable identities predate branch relaxation. The memory identity
// was measured again after memory-only W immediate and FP local-access shrinking;
// branch relaxation still preserves all three complete image identities.
test('unchanged short branch images',async()=>{
 const p=b.compiler.compile_ir_string('(defun f (x) (if (< x 0) (- x) x)) (export f)','short.eli'),m=memory.lower_memory_program(p),saved=structuredClone(m);
 const hashes=[b.native.emit_native_numeric_object(p,'arm64-macos'),b.native.emit_typed_native_memory_object(m,'arm64-macos'),b.native.emit_native_numeric_executable(b.compiler.compile_ir_string('(defun main () 42) (export main)','entry.eli'),'arm64-macos','main')].map(bytes=>createHash('sha256').update(Uint8Array.from(bytes)).digest('hex'));
 assert.deepEqual(hashes,['f66f8684c86bf732f03e9824055eeb74e2fe95b3c57c94702f6004f3bc6b606a','9afa4a6dda8d5dd44bc9b980eb06df94b273be985e358dcdfd3579d5b5e3a1d9','6dc7091ec3074b05abadb38a3832eba658e76cb90615a0b674e8cf4216afe8c2']);
 const code=assembly.memory_code(m);
 assert(code.words.some(word=>(word>>>0)===0xb81f83a0),'parameter store uses STUR W0,[FP,#-8]');
 assert(code.words.some(word=>(word>>>0)===0xb85f83a0),'parameter read uses LDUR W0,[FP,#-8]');
 assert(code.words.some(word=>(word>>>0)===0x52800000),'word zero uses the short W-register immediate');
 const module=new WebAssembly.Module(Uint8Array.from(b.wasm.emit_typed_memory_wasm(m)));
 assert.deepEqual(WebAssembly.Module.imports(module),[]);
 const w=new WebAssembly.Instance(module).exports;
 for(const value of [0,1,0x7fffffff,0x80000000,0xffffffff])assert.equal(w.f(value)>>>0,value);
 if(process.arch==='arm64'&&(process.platform==='darwin'||process.platform==='linux')){
  const target=process.platform==='linux'?'arm64-linux':'arm64-macos',file=resolve(directory,'short-memory.'+(process.platform==='linux'?'so':'dylib'));
  await writeFile(file,Uint8Array.from(b.native.emit_typed_native_memory_library(m,target)));
  const {openNativeMemory}=await import('../tools/backends/native-memory.mjs'),n=await openNativeMemory(file,{f:1},{nativeTarget:target});
  try{for(const value of [0,1,0x7fffffff,0x80000000,0xffffffff]){assert.equal(n.invoke('f',value),value);assert.equal(n.invoke('f',value),w.f(value)>>>0);}}
  finally{n.close();}
 }
 assert.deepEqual(m,saved);
});

function signed(value,bits){const sign=2**(bits-1);return value>=sign?value-2**bits:value;}
test('all emitted branch kinds retain their real signed displacement widths and original condition/register bits',()=>{
 for(const[opcode,bits]of [[0x14000000,26],[0x94000000,26],[0x5400000b,19],[0x34000009,19],[0xb500000c,19],[0x3608000d,14]]){
  const limit=2**(bits-1);for(const distance of [-limit,-1,0,1,limit-1]){const word=assembly.branch_word(opcode,distance)>>>0,immediate=bits===26?word&0x3ffffff:(word>>>5)&(2**bits-1);assert.equal(signed(immediate,bits),distance);assert.equal(word&(bits===26?0xfc000000:bits===14?0xfff8001f:0xff00001f),opcode&(bits===26?0xfc000000:bits===14?0xfff8001f:0xff00001f));}
  for(const distance of [-limit-1,limit])assert.throws(()=>assembly.branch_word(opcode,distance),e=>e.eliscriptDiagnostic?.code==='ELI-B0001');
 }
});
test('layout reaches a fixed point when a newly long forward branch pushes another forward or backward branch out of range',()=>{
 const NOP=0xd503201f;
 for(const backward of [false,true]){const words=Array(262147).fill(NOP),originalLength=words.length,state={words,constants:[{uses:[262143]}],tableUses:[2]},offsets=[0,262143*4];
  if(backward){words[1]=0x34000000;words[262144]=0x5400000b;assembly.patch_jump(state,1,262146);assembly.patch_jump(state,262144,0);}
  else{words[0]=0x54000000;words[1]=0x34000009;assembly.patch_jump(state,0,262143);assembly.patch_jump(state,1,262145);}
  assembly.finish_branches(state,offsets);assert.equal(state.words.length,originalLength+2);assert.deepEqual(offsets,[0,(262143+(backward?1:2))*4]);assert.deepEqual(state.tableUses,[backward?3:4]);assert.deepEqual(state.constants[0].uses,[262143+(backward?1:2)]);
  if(backward){assert.equal(signed(state.words[262146]&0x3ffffff,26),-262146);}else{assert.equal(state.words[0]>>>0,0x54000041);assert.equal(state.words[2]>>>0,0x35000049);assert.equal(signed(state.words[1]&0x3ffffff,26),262144);assert.equal(signed(state.words[3]&0x3ffffff,26),262144);}
 }
});
function longDelta(words,start=0){assert.equal(words[start]>>>0,0x10000010);let result=0n;for(let i=0;i<4;i++){const word=words[start+1+i]>>>0;assert.equal(word&31,17);result|=BigInt((word>>>5)&0xffff)<<BigInt(i*16);}return BigInt.asIntN(64,result);}
test('in-place layout retains zero-growth words and all function, literal, table and debug positions',()=>{
 const NOP=0xd503201f;
 for(const patched of [false,true]){
  const words=patched?[0x14000000,0x94000000,0x54000000,0x3608000d,NOP]:[NOP,NOP,NOP,NOP,NOP];
  const ranges=[{kind:'function',start:0,end:20},{kind:'trap-site',start:12,end:16}];
  const state={words,constants:[{uses:[0,3,5]}],tableUses:[1,4],debugRanges:ranges},offsets=[0,4,12,20];
  if(patched){assembly.patch_jump(state,3,0);assembly.patch_jump(state,1,0);assembly.patch_jump(state,2,4);assembly.patch_jump(state,0,4);}
  const expected=patched?[0x14000004,0x97ffffff,0x54000040,0x360fffad,NOP]:[NOP,NOP,NOP,NOP,NOP];
  assembly.finish_branches(state,offsets);
  assert.strictEqual(state.words,words,'layout must not retain a second image array');
  assert.deepEqual(words.map(word=>word>>>0),expected);
  assert.deepEqual(offsets,[0,4,12,20]);assert.deepEqual(state.constants[0].uses,[0,3,5]);
  assert.deepEqual(state.tableUses,[1,4]);assert.deepEqual(ranges,[{kind:'function',start:0,end:20},{kind:'trap-site',start:12,end:16}]);
  assert.deepEqual(state.branches,[]);
  assembly.finish_branches(state,offsets);
  assert.strictEqual(state.words,words);assert.deepEqual(words.map(word=>word>>>0),expected);
 }
});
test('in-place mixed relaxation preserves old tail words and exact shared metadata labels',()=>{
 const NOP=0xd503201f,words=[0x3608000d,NOP,0x94000000,NOP,0x35000009,NOP,NOP];
 const trap={kind:'trap-site',start:16,end:20},functionRange={kind:'function',start:0,end:12};
 const state={words,constants:[{uses:[1,2,3,4,7]}],tableUses:[0,2,5,7],
  debugRanges:[functionRange,{kind:'expression',start:4,end:20},trap],trapSites:[trap],debugFunctionRange:functionRange};
 const offsets=[0,4,8,12,16,20,28];
 // Record out of source order. One small forward conditional grows by one
 // word, then a backward BL grows by six; the later backward CBNZ stays short.
 assembly.patch_jump(state,4,0);assembly.patch_jump(state,2,-33554431);assembly.patch_jump(state,0,8192);
 assembly.finish_branches(state,offsets);
 assert.strictEqual(state.words,words);assert.equal(words.length,14);
 assert.equal(words[0]>>>0,0x3708004d);
 assert.equal(signed(words[1]&0x3ffffff,26)+1,8199);
 assert.equal(longDelta(words,3),BigInt((-33554431-3)*4));
 assert.equal(words[9]>>>0,0xd63f0200,'BL returns after the complete long sequence');
 assert.equal(signed((words[11]>>>5)&0x7ffff,19)+11,0);
 assert.equal((words[11]&0xff00001f)>>>0,0x35000009);
 assert.deepEqual([words[2],words[10],words[12],words[13]].map(word=>word>>>0),[NOP,NOP,NOP,NOP]);
 assert.deepEqual(offsets,[0,8,12,40,44,48,56]);
 assert.deepEqual(state.constants[0].uses,[2,3,10,11,14]);assert.deepEqual(state.tableUses,[0,3,12,14]);
 assert.deepEqual(state.debugRanges,[{kind:'function',start:0,end:40},{kind:'expression',start:8,end:48},{kind:'trap-site',start:44,end:48}]);
 assert.strictEqual(state.trapSites[0],trap);assert.strictEqual(state.debugFunctionRange,functionRange);
 assert.deepEqual(state.branches,[]);
});
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
 const padding=()=>memoryPadding();
 const forward=[...walk(p.functions.find(f=>f.name==='forward').body)].find(n=>n.kind==='if');forward.children[1].children.splice(1,0,...padding());
 const loop=[...walk(p.functions.find(f=>f.name==='backward').body)].find(n=>n.kind==='while');loop.children[1].children.unshift(...padding());
 const trapped=p.functions.find(f=>f.name==='trapped').body;trapped.children.splice(1,0,...padding());p.table=[p.functions.find(f=>f.name==='table-target').index];
 const snapshot=JSON.stringify(p),wasm=Uint8Array.from(b.wasm.emit_typed_memory_wasm(structuredClone(p))),w=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports,file=resolve(directory,'relaxed.dylib');assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[]);const nativeBytes=Uint8Array.from(b.native.emit_typed_native_memory_library(p,'arm64-macos'));assertLongMemoryBranches(nativeBytes,{backward:true});await writeFile(file,nativeBytes);assert.equal(JSON.stringify(p),snapshot);const{openNativeMemory}=await import('../tools/backends/native-memory.mjs'),n=await openNativeMemory(file,{forward:1,backward:1,trapped:1,dispatch:1});try{for(const value of[0,1,2,0xffffffff])assert.equal(n.invoke('forward',value),w.forward(value)>>>0);for(const value of[0,1,2])assert.equal(n.invoke('backward',value),w.backward(value)>>>0);for(const value of[0,10,0xffffffff])assert.equal(n.invoke('dispatch',value),w.dispatch(value)>>>0);assert.throws(()=>n.invoke('trapped',65536),WebAssembly.RuntimeError);assert.throws(()=>w.trapped(65536),WebAssembly.RuntimeError);assert.equal(n.invoke('trapped',0),w.trapped(0)>>>0);}finally{n.close();}
});

nativeTest('long floating-point conditionals retain ordered NaN comparisons and signed-zero results against JavaScript and WASM',async()=>{
 const source='(defun choose (x) (if (< x 0) -0.0 x)) (export choose)',ir=b.compiler.compile_ir_string(source,'long-float.eli'),program=b.numeric.lower_numeric_program(ir),node=[...walk(program.functions[0].body)].find(n=>n.kind==='if');node.children[1]={kind:'sequence',type:'f64',value:null,children:[...Array.from({length:65536},()=>({kind:'literal',type:'f64',value:0,children:[]})),node.children[1]]};const snapshot=JSON.stringify(program),code=assembly.typed_code(program,{registerAllocation:false}),wasm=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(b.wasm.emit_typed_numeric_wasm(program)))).exports,js=await import('data:text/javascript;base64,'+Buffer.from(b.compiler.emit_ir_string(ir)).toString('base64')),file=resolve(directory,'long-float.dylib');await writeFile(file,Uint8Array.from(assembly.macho_library(program,code)));assert.equal(JSON.stringify(program),snapshot);const{dlopen}=await import('bun:ffi'),native=dlopen(file,{choose:{args:['f64'],returns:'f64'}});try{for(const value of[NaN,Infinity,-Infinity,-1,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,1]){assert(Object.is(native.symbols.choose(value),js.choose(value)));assert(Object.is(wasm.choose(value),js.choose(value)));}}finally{native.close();}
});
