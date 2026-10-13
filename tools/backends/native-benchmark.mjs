import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdtemp,rm,readdir} from "node:fs/promises";
import {tmpdir,cpus} from "node:os";
import {resolve} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {backendModules,buildBackends,root} from "./build.mjs";

// Frozen before native sampling: same inputs, JS control and 1.0x minimum
// as the WASM numeric gate. This gate includes one Bun FFI call per batch.
const inputs=[
  {name:"recurrence-batch",fn:"recurrence_batch",nativeFn:"recurrence-batch",args:[1_000_000,.123,2]},
  {name:"escape-grid-batch",fn:"escape_grid_batch",nativeFn:"escape-grid-batch",args:[160,64,2]},
  {name:"recurrence-tiny-batch",fn:"recurrence_batch",nativeFn:"recurrence-batch",args:[1,.123,2_000_000]},
];
const parameters={sessions:3,warmups:5,samples:9,minimumSpeedup:1};
const files=[...backendModules.map(n=>`bootstrap/backends/${n}.eli`),...(await readdir(resolve(root,"bootstrap/compiler"))).filter(n=>n.endsWith(".eli")).sort().map(n=>`bootstrap/compiler/${n}`),"tools/backends/build.mjs","tools/backends/native-benchmark.mjs","tools/backends/batches.eli","tools/experiments/native-wasm/kernels.eli"];
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const sources=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(resolve(root,f)))])));
const summarize=sessions=>inputs.map(input=>{
  const samples=mode=>sessions.flatMap(s=>s.results.find(r=>r.name===input.name).measurements[mode].samplesMs);
  const jsMs=median(samples("js")),nativeMs=median(samples("native"));
  return {name:input.name,jsMs,nativeMs,speedup:jsMs/nativeMs};
});
export async function validateNativeReport(report,{verifySources=true}={}) {
  assert.equal(report.format,"eliscript-native-numeric-performance");
  assert.equal(report.scope,"arm64-macos numeric-f64 hot execution including Bun FFI; not complete compiler performance");
  assert.deepEqual(report.inputs,inputs);assert.deepEqual(report.parameters,parameters);
  if(verifySources) assert.deepEqual(report.sourceHashes,await sources());
  assert.equal(typeof report.baseline,"boolean");
  assert.deepEqual(Object.keys(report.expected).sort(),inputs.map(i=>i.name).sort());
  assert(Object.values(report.expected).every(Number.isFinite));
  assert.equal(report.environment.platform,"darwin");assert.equal(report.environment.arch,"arm64");
  assert.equal(typeof report.environment.cpu,"string");assert(report.environment.cpu.length>0);
  assert.equal(report.sessions.length,3);
  assert.deepEqual(report.sessions.map(s=>s.session),[0,1,2]);
  for(const session of report.sessions) {
    assert.match(session.version,/^\d+\.\d+\.\d+(?:[-+].*)?$/);
    assert.deepEqual(session.results.map(r=>r.name),inputs.map(i=>i.name));
    for(const input of inputs) for(const mode of ["js","native"]) {
      const value=session.results.find(r=>r.name===input.name).measurements[mode];
      assert.equal(value.samplesMs.length,9);assert(value.samplesMs.every(n=>Number.isFinite(n)&&n>0));
      assert.equal(value.checksums.length,9);assert(value.checksums.every(n=>Object.is(n,report.expected[input.name])));
    }
  }
  assert.deepEqual(report.summary,summarize(report.sessions));
  assert.deepEqual(report.decision,{productionPassed:report.summary.every(r=>r.speedup>=1),minimumSpeedup:1});
  assert.equal(report.artifacts.externalBackend,false);
  assert(Number.isSafeInteger(report.artifacts.nativeBytes)&&report.artifacts.nativeBytes>4096);
  for(const key of ["javascriptSha256","nativeSha256"]) assert.match(report.artifacts[key],/^[a-f0-9]{64}$/);
  return report;
}
export async function runNativeBenchmark({baseline=false}={}) {
  assert(process.platform==="darwin"&&process.arch==="arm64","native measurement requires its actual target");
  const sourceHashes=await sources();
  const directory=await mkdtemp(resolve(tmpdir(),"eliscript-native-perf-"));
  try {
    const {compiler,optimizer,native}=await buildBackends({outputRoot:directory});
    const source=await readFile(resolve(root,"tools/experiments/native-wasm/kernels.eli"),"utf8")+"\n"+await readFile(resolve(root,"tools/backends/batches.eli"),"utf8");
    const program=compiler.compile_ir_string(source,"direct-batches.eli");
    const javascript=compiler.emit_ir_string(optimizer.optimize_program(program));
    const bytes=Uint8Array.from(native.emit_native_numeric_library(program,"arm64-macos",{registerAllocation:!baseline}));
    const jsPath=resolve(directory,"batches.mjs"),library=resolve(directory,"batches.dylib"),runner=resolve(directory,"runner.mjs");
    await writeFile(jsPath,javascript);await writeFile(library,bytes);
    await writeFile(runner,`import{dlopen}from'bun:ffi';const js=await import(process.argv[2]);const lib=dlopen(process.argv[3],{'recurrence-batch':{args:['f64','f64','f64'],returns:'f64'},'escape-grid-batch':{args:['f64','f64','f64'],returns:'f64'}});const inputs=${JSON.stringify(inputs)};const session=Number(process.argv[4]);const results=[];try{for(const input of inputs){const expected=js[input.fn](...input.args);const measurements={};for(const mode of session&1?['native','js']:['js','native']){const fn=mode==='js'?js[input.fn]:lib.symbols[input.nativeFn];for(let i=0;i<5;i++)fn(...input.args);const samplesMs=[],checksums=[];for(let i=0;i<9;i++){const start=performance.now();const value=fn(...input.args);samplesMs.push(performance.now()-start);if(!Object.is(value,expected))throw Error(input.name+' checksum');checksums.push(value)}measurements[mode]={samplesMs,checksums}}results.push({name:input.name,measurements})}console.log(JSON.stringify({version:Bun.version,results}))}finally{lib.close()}`);
    const sessions=[];
    for(let session=0;session<3;session++) {
      const child=spawnSync("bun",[runner,pathToFileURL(jsPath).href,library,String(session)],{encoding:"utf8",timeout:120000});
      assert.equal(child.status,0,child.stderr);sessions.push({session,...JSON.parse(child.stdout)});
    }
    const report={format:"eliscript-native-numeric-performance",generatedAt:new Date().toISOString(),scope:"arm64-macos numeric-f64 hot execution including Bun FFI; not complete compiler performance",parameters,inputs,baseline,environment:{platform:process.platform,arch:process.arch,cpu:cpus()[0].model},sourceHashes,artifacts:{javascriptSha256:hash(javascript),nativeSha256:hash(bytes),nativeBytes:bytes.length,externalBackend:false},expected:Object.fromEntries(inputs.map(i=>[i.name,sessions[0].results.find(r=>r.name===i.name).measurements.js.checksums[0]])),sessions,summary:summarize(sessions)};
    report.decision={productionPassed:report.summary.every(r=>r.speedup>=1),minimumSpeedup:1};
    return await validateNativeReport(report);
  } finally {await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  assert(args.every(a=>["--verify","--require-production","--baseline"].includes(a)),"unknown native benchmark argument");
  const baseline=args.includes("--baseline");
  const path=resolve(root,`tools/backends/results/native-${baseline?"baseline-":""}macos-arm64.json`);
  const report=args.includes("--verify")||args.includes("--require-production")?await validateNativeReport(JSON.parse(await readFile(path,"utf8"))):await runNativeBenchmark({baseline});
  if(!args.includes("--verify")&&!args.includes("--require-production")) await writeFile(path,JSON.stringify(report,null,2)+"\n");
  assert.equal(report.baseline,baseline,"baseline selection must match the retained report");
  console.log(JSON.stringify({summary:report.summary,decision:report.decision},null,2));
  if(args.includes("--require-production")&&!report.decision.productionPassed) process.exitCode=1;
}
