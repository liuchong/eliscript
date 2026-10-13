import { afterAll, beforeAll, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildBackends } from "../tools/backends/build.mjs";

let directory, backend;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "eliscript-native-test-"));
  backend = await buildBackends({outputRoot: directory});
},120_000);
afterAll(async () => { if(directory) await rm(directory,{recursive:true,force:true}); });

test("native numeric emission produces a deterministic ARM64 Mach-O object directly", () => {
  assert.equal(typeof backend.native?.emit_native_numeric_object,"function");
  const program=backend.compiler.compile_ir_string("(defun identity (x) x) (export identity)","native.eli");
  const saved=JSON.stringify(program);
  const first=Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos"));
  assert.deepEqual(first,Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos")));
  assert.equal(JSON.stringify(program),saved);
  const view=new DataView(first.buffer);
  assert.equal(view.getUint32(0,true),0xfeedfacf);
  assert.equal(view.getUint32(4,true),0x0100000c);
  assert.equal(view.getUint32(12,true),1);
  assert.equal(view.getUint32(16,true),2);
  assert(first.length>208);
});

test("native output rejects unspecified targets and unsupported syntax before optimization", () => {
  const compile=source=>backend.compiler.compile_ir_string(source,"native-error.eli");
  for(const target of [undefined,"auto","x64-linux","wasm"]) {
    assert.throws(()=>backend.native.emit_native_numeric_object(compile("(defun f (x) x)"),target),
      error=>error.eliscriptDiagnostic?.code==="ELI-B0001");
  }
  for(const source of ['(defun f (x) (if false "text" x))','(defun f (x) (js* "x"))']) {
    assert.throws(()=>backend.native.emit_native_numeric_object(compile(source),"arm64-macos"),error=>
      error.eliscriptDiagnostic?.code==="ELI-B0001" && error.eliscriptDiagnostic.location.file==="native-error.eli");
  }
});

test("native register allocation reduces code while keeping explicit stack fallback", () => {
  const program=backend.compiler.compile_ir_string("(defun f (x) (let ((i 0) (sum x)) (while (< i 5) (setq sum (+ sum (* i x))) (setq i (1+ i))) sum)) (export f)","registers.eli");
  const stack=Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos",{registerAllocation:false}));
  const registers=Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos",{registerAllocation:true}));
  assert(registers.length<stack.length,"removing repeated local spills must reduce code");
});

test("loop unswitching hoists only invariant pure guards and preserves zero-trip and IEEE cases", async () => {
  const source=`(defun f (n x) (let ((i 0) (sum x)) (while (and (< i n) (< i 8)) (if (< x 3) (setq sum (+ sum x)) (setq sum (- sum x))) (setq i (1+ i))) sum))
    (defun changing (n x) (let ((i 0)) (while (and (< i n) (< i 8)) (if (< x 3) (setq x (+ x 1)) (setq x (- x 1))) (setq i (1+ i))) x))
    (defun guard-writes (n x) (let ((i 0) (sum 0))
      (while (and (< i 8) (< (setq x (+ x 1)) n))
        (if (< x 3) (setq sum (+ sum 1)) (setq sum (+ sum 10))) (setq i (1+ i))) sum))
    (export f changing guard-writes)`;
  const program=backend.compiler.compile_ir_string(source,"unswitch.eli");
  const typed=backend.numeric.lower_numeric_program(program),saved=JSON.stringify(typed);
  const walk=function*(n){yield n;for(const c of n.children)yield*walk(c)};
  const oracle=await import("data:text/javascript;base64,"+Buffer.from(backend.compiler.emit_ir_string(program)).toString("base64"));
  for(const unswitch of [false,true]) {
    const optimized=backend.numeric.optimize_numeric_program(typed,{unswitch,inlining:false,loops:false,integers:false,parallel:false,guardedUnroll:false});
    const hoisted=name=>[...walk(optimized.functions.find(f=>f.name===name).body)].some(n=>n.kind==="if"&&n.children[1].kind==="while"&&n.children[2].kind==="while");
    assert.equal(hoisted("f"),unswitch);assert.equal(hoisted("changing"),false);assert.equal(hoisted("guard-writes"),false);assert.equal(JSON.stringify(typed),saved);
    const wasm=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(backend.wasm.emit_typed_numeric_wasm(optimized)))).exports;
    for(const n of [-Infinity,-0,0,.1,1,2.5,8,Infinity,NaN]) for(const x of [-Infinity,-3,-0,0,Number.MIN_VALUE,.123,2.5,3,Infinity,NaN])
      for(const name of ["f","changing","guard-writes"]) assert(Object.is(wasm[name](n,x),oracle[name.replaceAll("-","_")](n,x)),`${unswitch}/${name}/${n}/${x}`);
  }
});

test("native discarded pure arithmetic adds no work while operand assignments remain observable", () => {
  const compile=source=>backend.compiler.compile_ir_string(source,"discard.eli");
  const full=compile("(defun f (x) (+ x x) (* x 4) (+ (setq x (+ x 1)) x) (+ x 3)) (export f)");
  const minimal=compile("(defun f (x) (setq x (+ x 1)) (+ x 3)) (export f)");
  assert.deepEqual(backend.native.emit_native_numeric_object(full,"arm64-macos"),backend.native.emit_native_numeric_object(minimal,"arm64-macos"));
});

test("native leaf identity does not save registers it never uses", () => {
  const program=backend.compiler.compile_ir_string("(defun f (x) x) (export f)","leaf.eli");
  const size=registerAllocation=>new DataView(Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos",{registerAllocation})).buffer).getUint32(80,true);
  assert(size(true)<=size(false),"register identity must not expand into unused callee-save traffic");
});

test("native f64 constants use a deduplicated PC-relative pool without changing exact bits", () => {
  const program=backend.compiler.compile_ir_string("(defun f (x) (+ (* x 3.8) (* x 3.8))) (export f)","literals.eli");
  const bytes=Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos"));
  const view=new DataView(bytes.buffer),size=view.getUint32(80,true);
  const words=Array.from({length:size/4},(_,i)=>view.getUint32(208+i*4,true));
  assert(words.some(w=>(w>>>24)===0x5c),"compact f64 literals must use PC-relative loads");
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,3.8,true);
  assert.equal(words.filter((w,i)=>w===bits.getUint32(0,true)&&words[i+1]===bits.getUint32(4,true)).length,1);
});

test("native register reuse preserves disjoint lifetimes, deep expressions and nested call effects", async () => {
  if(process.platform!=="darwin"||process.arch!=="arm64") return;
  const stages=Array.from({length:80},(_,i)=>`(let ((temp${i} (+ sum x))) (setq sum (+ temp${i} x)))`).join(" ");
  const deep=Array.from({length:12},()=>"(+ x ").join("")+"x"+")".repeat(12);
  const source=`(defun rec (n x) (if (<= n 0) x (+ x (rec (- n 1) x))))
    (defun pair (a b) (+ (* a 10) b))
    (defun leaf (a b c d e f g h i j k l) (+ (+ (* c 100) a) (+ (+ b d) (+ (+ e f) (+ (+ g h) (+ (+ i j) (+ k l)))))))
    (defun f (x) (let ((sum x)) ${stages} (+ sum ${deep})))
    (defun nested (x) (+ (* x 1000) (pair (rec 2 x) (pair (setq x (+ x 1)) (rec 1 x)))))
    (defun wide (x) (leaf x 2 3 4 5 6 7 8 9 10 11 12)) (export f nested wide)`;
  const program=backend.compiler.compile_ir_string(source,"register-reuse.eli");
  const oracle=await import("data:text/javascript;base64,"+Buffer.from(backend.compiler.emit_ir_string(program)).toString("base64"));
  const {dlopen}=await import("bun:ffi");
  for(const registerAllocation of [false,true]) {
    const file=resolve(directory,`lifetimes-${registerAllocation}.dylib`);
    await writeFile(file,Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos",{registerAllocation})));
    const library=dlopen(file,Object.fromEntries(["f","nested","wide"].map(n=>[n,{args:["f64"],returns:"f64"}])));
    try {for(const x of [-Infinity,-10,-0,0,Number.MIN_VALUE,.123,1,1.5,Number.MAX_VALUE,Infinity,NaN])
      for(const name of ["f","nested","wide"]) assert(Object.is(library.symbols[name](x),oracle[name](x)),`${registerAllocation}/${name}/${x}`);
    } finally {library.close()}
  }
});

test("native immediate floats preserve all encodable values and exact nonfinite input results", async () => {
  if(process.platform!=="darwin"||process.arch!=="arm64") return;
  const constants=Array.from({length:256},(_,i)=>((i&128)?-1:1)*(1+(i&15)/16)*2**((i&64)?-3+((i>>4)&3):1+((i>>4)&3)));
  constants.push(0,-0,3.8,Number.MIN_VALUE,Number.MAX_VALUE);
  const source=constants.map((v,i)=>`(defun f${i} (x) (+ x ${Object.is(v,-0)?"-0.0":v}))`).join("\n")+` (export ${constants.map((_,i)=>`f${i}`).join(" ")})`;
  const program=backend.compiler.compile_ir_string(source,"immediates.eli");
  const file=resolve(directory,"immediates.dylib");
  await writeFile(file,Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos")));
  const {dlopen}=await import("bun:ffi");
  const library=dlopen(file,Object.fromEntries(constants.map((_,i)=>[`f${i}`,{args:["f64"],returns:"f64"}])));
  try {for(let i=0;i<constants.length;i++) for(const x of [-Infinity,-1,-0,0,Number.MIN_VALUE,.123,1,Infinity,NaN])
    assert(Object.is(library.symbols[`f${i}`](x),x+constants[i]),`constant ${i}/${x}`);
  } finally {library.close()}
});

test("self-contained SHA-256 matches independent standard and padding boundary vectors", async () => {
  assert.equal(typeof backend.sha256?.sha256_bytes,"function");
  const {createHash}=await import("node:crypto");
  for(const input of [Buffer.alloc(0),Buffer.from("abc"),Buffer.from("😀中文𝄞"),...([55,56,63,64,65,127,128,4096,16384].map(n=>Buffer.from(Array.from({length:n},(_,i)=>i&255))))]) {
    const bytes=[...input],saved=[...bytes];
    assert.equal(Buffer.from(backend.sha256.sha256_bytes(bytes)).toString("hex"),createHash("sha256").update(input).digest("hex"));
    assert.deepEqual(bytes,saved,"hash input is immutable");
  }
});

test("independent native library contains its own deterministic ad-hoc page signature", async () => {
  assert.equal(typeof backend.native.emit_native_numeric_library,"function");
  const program=backend.compiler.compile_ir_string("(defun identity (x) x) (export identity)","library.eli");
  const first=Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos"));
  assert.deepEqual(first,Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos")));
  const view=new DataView(first.buffer);
  assert.equal(view.getUint32(12,true),6);
  let signature;
  for(let offset=32,count=view.getUint32(16,true);count--;offset+=view.getUint32(offset+4,true)) {
    if(view.getUint32(offset,true)===0x1d) signature={offset:view.getUint32(offset+8,true),size:view.getUint32(offset+12,true)};
  }
  assert(signature);
  assert.equal(signature.offset+signature.size,first.length);
  assert.equal(view.getUint32(signature.offset),0xfade0cc0);
  const cd=signature.offset+view.getUint32(signature.offset+16);
  assert.equal(view.getUint32(cd),0xfade0c02);
  assert.equal(view.getUint32(cd+32),signature.offset);
  const {createHash}=await import("node:crypto");
  for(let page=0;page<view.getUint32(cd+28);page++) {
    const start=page*4096,end=Math.min(start+4096,signature.offset);
    const hash=Buffer.from(first.slice(cd+view.getUint32(cd+16)+page*32,cd+view.getUint32(cd+16)+(page+1)*32));
    assert.deepEqual(hash,createHash("sha256").update(first.slice(start,end)).digest());
  }
  if(process.platform==="darwin" && process.arch==="arm64") {
    const file=resolve(directory,"independent.dylib");
    await writeFile(file,first);
    const check=spawnSync("codesign",["--verify","--strict",file],{encoding:"utf8",timeout:30000});
    assert.equal(check.status,0,check.stderr);
    const {dlopen}=await import("bun:ffi");
    const lib=dlopen(file,{identity:{args:["f64"],returns:"f64"}});
    try { for(const value of [-Infinity,-0,0,Number.MIN_VALUE,Infinity,NaN]) assert(Object.is(lib.symbols.identity(value),value)); }
    finally { lib.close(); }
  }
});

test("independent ARM64 executable returns exact IEEE bytes without a JS runtime", async () => {
  assert.equal(typeof backend.native.emit_native_numeric_executable,"function");
  for(const expression of ["-0.0","(/ 1 0)","(/ -1 0)","(/ 0 0)","(+ 1 0.5)","(f 6)"]) {
    const source=`(defun f (n) (if (<= n 1) 1 (* n (f (- n 1))))) (defun entry () ${expression}) (export entry)`;
    const program=backend.compiler.compile_ir_string(source,"executable.eli");
    const bytes=Uint8Array.from(backend.native.emit_native_numeric_executable(program,"arm64-macos","entry"));
    assert.equal(new DataView(bytes.buffer).getUint32(12,true),2);
    assert.deepEqual(bytes,Uint8Array.from(backend.native.emit_native_numeric_executable(program,"arm64-macos","entry")));
    if(process.platform==="darwin" && process.arch==="arm64") {
      const file=resolve(directory,`independent-executable-${expression.replaceAll(/[^a-z0-9]/gi,"_")}`);
      await writeFile(file,bytes,{mode:0o755});
      const child=spawnSync(file,[],{timeout:10000});
      assert.equal(child.status,0,JSON.stringify({error:child.error,signal:child.signal,stderr:String(child.stderr)}));
      assert.equal(child.stdout.length,8);
      const oracle=await import("data:text/javascript;base64,"+Buffer.from(backend.compiler.emit_ir_string(program)).toString("base64"));
      assert(Object.is(new DataView(child.stdout.buffer,child.stdout.byteOffset,8).getFloat64(0,true),oracle.entry()),expression);
    }
  }
});

test("ARM64 native arithmetic, calls, recursion and stack arguments execute against JS", async () => {
  // Actual target execution is required on the ARM64 macOS matrix. Other
  // runners validate direct emission above; they cannot execute this target.
  if(process.platform!=="darwin" || process.arch!=="arm64") return;
  const source=`
    (defun math (x y) (+ (/ (- (* x y) y) x) (- x)))
    (defun eq (x y) (if (= x y) 1 0))
    (defun lt (x y) (if (< x y) 1 0))
    (defun le (x y) (if (<= x y) 1 0))
    (defun gt (x y) (if (> x y) 1 0))
    (defun ge (x y) (if (>= x y) 1 0))
    (defun truth (x) (if x 1 2))
    (defun zero (x) (* x -0.0))
    (defun fact (n) (if (<= n 1) 1 (* n (fact (- n 1)))))
    (defun many (a b c d e f g h i j k l) (if (> a 1) (many (- a 1) b c d e f g h i j k l)
      (+ (+ a b) (+ (+ (+ c d) (+ e f)) (+ (+ g h) (+ (+ i j) (+ k l)))))))
    (defun stack-call (x) (many 2 x 3 4 5 6 7 8 9 10 11 12))
    (defun mutate (a b) (setq a (+ a b)) (+ a b))
    (defun call-effects (x) (+ (* x 100) (mutate x (setq x (+ x 1)))))
    (defun loop (n) (let ((i 0) (x 0)) (while (and (< i n) (< i 5)) (setq x (+ x (/ i 3))) (setq i (1+ i))) (+ x i)))
    (defun checks (n) (let ((i 0) (c 0)) (while (and (< (setq c (1+ c)) n) (< i 5)) (setq i (1+ i))) (+ (* c 10) i)))
    (defun short (n) (let ((x n)) (or (and (> n 1) (< (setq x (+ x 10)) 20)) (not (< x 5))) (+ x 1)))
    (defun cache (x) (let ((i 0) (sum x) (y 1))
      (while (and (< i 3) (< (+ (* x x) (* y y)) 1000))
        (setq sum (+ sum (+ (* x x) (* y y)))) (setq x (/ x 2)) (setq y (+ y 1)) (setq i (1+ i))) sum))
    (defun cache-alias (x) (let ((i 0) (sum 0) (y 1))
      (while (and (< i 3) (< (+ x (* y y)) 1000))
        (setq sum (+ sum (* y y))) (setq x 0) (setq y (+ y 1)) (setq i (1+ i))) sum))
    (defun cache-unary (x) (let ((i 0) (sum 0))
      (while (and (< i 3) (let ((guard (+ (* x x)))) (< guard 1000)))
        (setq sum (+ sum (* x x))) (setq x (/ x 2)) (setq i (1+ i))) sum))
    (defun 中文 (x) (+ x 1))
    (export math eq lt le gt ge truth zero fact stack-call call-effects loop checks short cache cache-alias cache-unary 中文)`;
  const program=backend.compiler.compile_ir_string(source,"native-execute.eli");
  const object=resolve(directory,"native.o"), library=resolve(directory,"native.dylib"), oracle=resolve(directory,"oracle.mjs");
  await writeFile(object,Uint8Array.from(backend.native.emit_native_numeric_object(program,"arm64-macos")));
  await writeFile(oracle,backend.compiler.emit_ir_string(program));
  const sdk=spawnSync("xcrun",["--show-sdk-path"],{encoding:"utf8",timeout:30000});
  assert.equal(sdk.status,0,sdk.stderr);
  const linked=spawnSync("ld",["-arch","arm64","-dylib","-platform_version","macos","15.0","15.0","-syslibroot",sdk.stdout.trim(),"-lSystem","-o",library,object],{encoding:"utf8",timeout:30000});
  assert.equal(linked.status,0,linked.stderr);
  const signed=spawnSync("codesign",["--sign","-","--timestamp=none",library],{encoding:"utf8",timeout:30000});
  assert.equal(signed.status,0,signed.stderr);
  const {dlopen}=await import("bun:ffi");
  const baseline=await import("data:text/javascript;base64,"+Buffer.from(await readFile(oracle,"utf8")).toString("base64"));
  const {binding_name}=await import(pathToFileURL(resolve(directory,"bootstrap/symbol.mjs")).href);
  const typed=backend.numeric.lower_numeric_program(program);
  const independent=resolve(directory,"full-independent.dylib");
  await writeFile(independent,Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos")));
  for(const filename of [library,independent]) {
  const binary=dlopen(filename,Object.fromEntries(typed.functions.filter(n=>typed.exports.includes(n.name)).map(n=>[n.name,{args:Array(n.arity).fill("f64"),returns:"f64"}])));
  try {
    const edges=[-Infinity,-Number.MAX_VALUE,-10,-1,-0,0,Number.MIN_VALUE,.5,1,9,Number.MAX_VALUE,Infinity,NaN];
    for(const name of ["math","eq","lt","le","gt","ge"]) for(const x of edges) for(const y of edges) {
      assert(Object.is(binary.symbols[name](x,y),baseline[name](x,y)),`${name}/${x}/${y}`);
    }
    for(const name of ["truth","zero","stack-call","call-effects","loop","checks","short","cache","cache-alias","cache-unary","中文"]) for(const x of edges) {
      // Bun 1.4 decodes returned FFI object keys as Latin-1; dlsym still uses
      // the original UTF-8 symbol. Do not change the native ABI to compensate.
      const fn=binary.symbols[name] ?? binary.symbols[Buffer.from(name).toString("latin1")];
      assert.equal(typeof fn,"function",`${filename}: missing ${name}`);
      assert(Object.is(fn(x),baseline[binding_name(name)](x)),`${name}/${x}`);
    }
    for(const x of [-0,0,1,1.5,2,6,10]) assert.equal(binary.symbols.fact(x),baseline.fact(x));
  } finally { binary.close(); }
  }
});

test("native generated numeric programs and many local slots match an independent JS oracle", async () => {
  if(process.platform!=="darwin"||process.arch!=="arm64") return;
  let state=0x51a7;const random=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
  const expr=depth=>depth?`(${["+","-","*","/"][(random()>>>16)%4]} ${expr(depth-1)} ${expr(depth-1)})`:((random()>>>16)&1?"x":String((random()>>>16)%19-9));
  const definitions=Array.from({length:140},(_,i)=>`(defun f${i} (x) ${expr(1+i%5)})`);
  const source=definitions.join("\n")+` (defun locals (x) (let (${Array.from({length:140},(_,i)=>`(v${i} ${i})`).join(" ")}) (+ x v139))) (export ${definitions.map((_,i)=>`f${i}`).join(" ")} locals)`;
  const program=backend.compiler.compile_ir_string(source,"generated-native.eli");
  const oracle=await import("data:text/javascript;base64,"+Buffer.from(backend.compiler.emit_ir_string(program)).toString("base64"));
  const {dlopen}=await import("bun:ffi");
  for(const registerAllocation of [false,true]) {
    const file=resolve(directory,`generated-${registerAllocation}.dylib`);
    await writeFile(file,Uint8Array.from(backend.native.emit_native_numeric_library(program,"arm64-macos",{registerAllocation})));
    const lib=dlopen(file,Object.fromEntries(Object.keys(oracle).map(n=>[n,{args:["f64"],returns:"f64"}])));
    try {for(const name of Object.keys(oracle)) for(const x of [-Infinity,-7,-0,0,Number.MIN_VALUE,.123,9,Number.MAX_VALUE,Infinity,NaN])
      assert(Object.is(lib.symbols[name](x),oracle[name](x)),`${registerAllocation}/${name}/${x}`);
    } finally {lib.close()}
  }
});

test("native entry validation rejects nonexported, missing and parameterized entry points", () => {
  for(const source of ["(defun entry () 1)","(defun other () 1) (export other)","(defun entry (x) x) (export entry)"]) {
    const program=backend.compiler.compile_ir_string(source,"entry-error.eli");
    assert.throws(()=>backend.native.emit_native_numeric_executable(program,"arm64-macos","entry"),e=>e.eliscriptDiagnostic?.code==="ELI-B0001");
  }
});

test("explicit native CLI emits objects, libraries and executable IEEE results", async () => {
  const input=resolve(directory,"cli-native.eli");
  await writeFile(input,"(defun entry () -0.0) (export entry)");
  for(const format of ["object","library","executable"]) {
    const output=resolve(directory,`cli-native-${format}`);
    const args=[resolve(import.meta.dir,"../tools/backends/compile.mjs"),"--abi","numeric-f64","--target","native","--platform","arm64-macos","--native-format",format,"-o",output,input];
    if(format==="executable") args.push("--entry","entry");
    const built=spawnSync(process.execPath,args,{encoding:"utf8",timeout:60000});
    assert.equal(built.status,0,built.stderr);
    const bytes=await readFile(output),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
    assert.equal(view.getUint32(12,true),{object:1,library:6,executable:2}[format]);
    if(format==="executable" && process.platform==="darwin" && process.arch==="arm64") {
      const child=spawnSync(output,[],{timeout:10000});
      assert.equal(child.status,0,String(child.stderr));
      assert(Object.is(new DataView(child.stdout.buffer,child.stdout.byteOffset,8).getFloat64(0,true),-0));
    }
  }
},120_000);

test("native retained performance evidence rejects altered budgets, samples, identities and promotion", async () => {
  const {validateNativeReport}=await import("../tools/backends/native-benchmark.mjs");
  for(const name of ["native-baseline-macos-arm64.json","native-macos-arm64.json"]) {
    const report=JSON.parse(await readFile(resolve(import.meta.dir,"../tools/backends/results",name),"utf8"));
    await validateNativeReport(report);
    for(const mutate of [r=>{r.parameters.minimumSpeedup=.5},r=>{r.sessions[0].results[0].measurements.native.checksums[0]+=1},r=>{r.summary[0].speedup=999},r=>{r.sourceHashes["bootstrap/compiler/emitter.eli"]="0".repeat(64)},r=>{r.environment.arch="x64"},r=>{r.sessions[0].results.push(r.sessions[0].results[0])},r=>{r.baseline="false"}]) {
      const changed=structuredClone(report);mutate(changed);await assert.rejects(validateNativeReport(changed));
    }
    if(!report.decision.productionPassed) {
      const forged=structuredClone(report);forged.decision.productionPassed=true;await assert.rejects(validateNativeReport(forged));
    }
    const child=spawnSync(process.execPath,[resolve(import.meta.dir,"../tools/backends/native-benchmark.mjs"),"--require-production",...(report.baseline?["--baseline"]:[])],{encoding:"utf8",timeout:10000});
    assert.equal(child.status,report.decision.productionPassed?0:1,child.stderr);
  }
});
