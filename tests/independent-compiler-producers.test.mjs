import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {stringifyCompilerInput,producerProfiles} from './compiler-producer-rig.mjs';

function candidate(mode,producerHost='wasm',profile='small'){
 const child=spawnSync(process.execPath,[resolve('tests/compiler-producer-rig.mjs'),mode,producerHost,profile],{cwd:resolve('.'),encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 // Keep stage/heap evidence in the parent test log even on timeout or failure.
 if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);
 assert.equal(child.error,undefined,mode+' external process: '+child.error?.message);
 assert.equal(child.signal,null,mode+' terminated by '+child.signal);
 assert.equal(child.status,0,mode+' candidate failed at the last reported stage');
 const stages=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
 assert(stages.some(stage=>stage.stage==='producer-ready'));
 assert(stages.some(stage=>stage.stage==='candidate-complete'&&stage.mode===mode&&stage.producerHost===producerHost&&stage.profile===profile));
}

test('the complete 13-frontend/8-backend compiler hosted in WASM produces exact executable JS and numeric WASM/native artifacts',()=>candidate('numeric'),190000);

// Full-language binary emission is an explicit, fixed-budget candidate. Run the
// modes separately with `bun tests/compiler-producer-rig.mjs managed-wasm` or
// `bun tests/compiler-producer-rig.mjs managed-native`. It is not nine-grid proof.
if(process.env.ELISCRIPT_RUN_MANAGED_PRODUCER==='1'){
 test('complete WASM-hosted compiler candidate emits closure/array/string WASM with the entire current runtime',()=>candidate('managed-wasm'),190000);
 if(process.platform==='darwin'&&process.arch==='arm64')test('complete WASM-hosted compiler candidate emits a real native closure/array/string library with the entire current runtime',()=>candidate('managed-native'),190000);
}

// This host/target has independent success evidence; other platforms explicitly
// skip the unavailable ARM64 macOS runtime instead of changing its target.
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
nativeTest('the complete native-hosted compiler candidate produces exact executable JS and numeric WASM/native artifacts',()=>candidate('numeric','native'),190000);
if(process.env.ELISCRIPT_RUN_NATIVE_PRODUCER==='1'&&process.env.ELISCRIPT_RUN_MANAGED_PRODUCER==='1')for(const mode of['managed-wasm','managed-native'])nativeTest('complete native-hosted compiler candidate produces '+mode+' with the entire current runtime',()=>candidate(mode,'native'),190000);


test('producer IR wire preserves negative zero and the original JSON object omissions array holes and source property order',()=>{
 const input={value:-0,positive:0,absent:undefined,items:[,undefined,-0,null,false,NaN,Infinity,-Infinity],text:'中😀\ud800',nested:{'2':'two','1':'one',z:-0}};
 const wire=stringifyCompilerInput(input),parsed=JSON.parse(wire);
 assert(Object.is(parsed.value,-0));assert(Object.is(parsed.items[2],-0));assert(Object.is(parsed.nested.z,-0));assert(Object.is(parsed.positive,0));
 assert.equal(wire,'{"value":-0,"positive":0,"items":[null,null,-0,null,false,null,null,null],"text":'+JSON.stringify(input.text)+',"nested":{"1":"one","2":"two","z":-0}}');
 for(const input of[undefined,null,true,false,3,'中😀\ud800',{a:undefined,b:null,items:[,undefined,Symbol('x'),()=>1]},{value:NaN,items:[Infinity,-Infinity]},['x',{'10':'ten','2':'two',a:undefined}]])assert.equal(stringifyCompilerInput(input),JSON.stringify(input));
 const repeated={value:-0};assert.equal(stringifyCompilerInput([repeated,repeated]),'[{"value":-0},{"value":-0}]');
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>stringifyCompilerInput(cyclic),TypeError);assert.throws(()=>stringifyCompilerInput(1n),TypeError);
});

test('producer profiles keep the original default budget distinct from the explicit full-runtime candidate',()=>{
 assert.deepEqual(producerProfiles.small,{budget:{maxSlots:131072,initialBytes:8388608,maxBytes:67108864},memory:{initialPages:128,maximumPages:4096},auto:65536});
 assert.deepEqual(producerProfiles['full-runtime'],{budget:{maxSlots:1048575,initialBytes:67108864,maxBytes:268435456},memory:{initialPages:2048,maximumPages:16384},auto:4194304});
});


// No command silently selects the larger budget. These candidates remain OPEN;
// their first execution waits for the shared JSON parser change and delivery.
if(process.env.ELISCRIPT_RUN_FULL_RUNTIME_PRODUCER==='1'){
 test('explicit full-runtime WASM-host candidate produces a complete managed WASM artifact',()=>candidate('managed-wasm','wasm','full-runtime'),190000);
 for(const mode of['managed-wasm','managed-native'])nativeTest('explicit full-runtime native-host candidate produces '+mode,()=>candidate(mode,'native','full-runtime'),190000);
 nativeTest('explicit full-runtime WASM-host candidate produces a complete managed native artifact',()=>candidate('managed-native','wasm','full-runtime'),190000);
}


test('compiler teardown closes a native adapter on success and every cleanup failure',async()=>{
 const {finishCompiler}=await import('./whole-compiler-rig.mjs');
 for(const failure of['none','closeModule','collect','live','frame']){
  const calls=[],sentinel=new Error('injected '+failure);
  const adapter={
   closeModule(){calls.push('closeModule');if(failure==='closeModule')throw sentinel;},
   collect(){calls.push('collect');if(failure==='collect')throw sentinel;},
   live(){calls.push('live');return failure==='live'?1:0;},
   stats(){calls.push('stats');return{frameDepth:failure==='frame'?1:0};},
   close(){calls.push('close');},
  };
  if(failure==='none')finishCompiler(adapter);
  else assert.throws(()=>finishCompiler(adapter),error=>failure==='closeModule'||failure==='collect'?error===sentinel:error.code==='ERR_ASSERTION');
  assert.equal(calls.at(-1),'close',failure);assert.equal(calls.filter(name=>name==='close').length,1,failure);
  assert.deepEqual(calls,failure==='closeModule'?['closeModule','close']:failure==='collect'?['closeModule','collect','close']:failure==='live'?['closeModule','collect','live','close']:['closeModule','collect','live','stats','close']);
 }
});


// The self-hosted input is the actual complete runtime source, not host-built
// runtime JSON. This isolated manual mode emits canonical IR only.
if(process.env.ELISCRIPT_RUN_RUNTIME_IR_PRODUCER==='1'){
 test('explicit full-runtime WASM-host candidate compiles the entire runtime source to exact canonical IR',()=>candidate('runtime-ir','wasm','full-runtime'),190000);
 nativeTest('explicit full-runtime native-host candidate compiles the entire runtime source to exact canonical IR',()=>candidate('runtime-ir','native','full-runtime'),190000);
}


// This manual candidate retains every stage as an opaque managed root and feeds
// the resulting complete runtime IR directly to the original managed backend.
if(process.env.ELISCRIPT_RUN_STAGED_RUNTIME_PRODUCER==='1'){
 test('explicit full-runtime WASM-host staged compiler produces and executes the complete runtime artifact',()=>candidate('runtime-stages','wasm','full-runtime'),190000);
 nativeTest('explicit full-runtime native-host staged compiler produces and executes the complete runtime artifact',()=>candidate('runtime-stages','native','full-runtime'),190000);
}
