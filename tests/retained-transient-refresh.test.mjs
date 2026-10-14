import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateFinalAcceptanceContract} from '../tools/acceptance/finalize.mjs';
import {validateRefreshedTransientBuilder} from '../tools/acceptance/retained-transient.mjs';
const root=resolve(import.meta.dir,'..');
const read=async file=>JSON.parse(await readFile(resolve(root,file),'utf8'));
test('a remeasured transient benchmark preserves the original accepted run and final manifest',async()=>{
 const run=await read('acceptance/runs/m13-01.json'),before=JSON.stringify(run);
 await validateFinalAcceptanceContract(await read('contracts/final-acceptance.json'),run,{root});
 assert.equal(JSON.stringify(run),before);
});
test('fresh transient replacement rejects weaker policy, forged derived data, incomplete work and stale source identities',async()=>{
 const run=await read('acceptance/runs/m13-01.json'),report=await read('benchmarks/transient-builder-macos-arm64.json');
 const mutations=[
  r=>{r.parameters.warmupRounds=1;},r=>{r.parameters.vectorSize--;},
  r=>{r.decision.minimumSpeedup=1.49;},r=>{r.decision.maximumAllocationRatio=.34;},r=>{r.decision.passed=false;},
  r=>{r.results.vector.timing.persistentSamplesMs.pop();},r=>{r.results.map.timing.transientMedianMs++;},r=>{r.results.set.timing.speedup++;},
  r=>{r.results.vector.allocation.allocationRatio=0;},r=>{r.results.map.allocation.persistentNodeAllocations+=.5;},
  r=>{r.results.set.allocation.transientMetrics.setPersistentCalls=0;},r=>{r.results.set.correctness.transientHash++;},
  r=>{r.results.vector.correctness.persistentObservation.last--;},r=>{r.sourceDigest.files.pop();},
  r=>{r.sourceDigest.value='0'.repeat(64);},r=>{r.sourceDigest.algorithm='sha512';},r=>{r.results.extra=r.results.vector;},
 ];
 for(const mutate of mutations){const copy=structuredClone(report);mutate(copy);await assert.rejects(validateRefreshedTransientBuilder(root,'benchmarks/transient-builder-macos-arm64.json',Buffer.from(JSON.stringify(copy)),run));}
});
test('transient refresh refuses substituted accepted commits, trees, artifact hashes, duplicate bindings and unrelated reports',async()=>{
 const run=await read('acceptance/runs/m13-01.json'),file='benchmarks/transient-builder-macos-arm64.json',bytes=await readFile(resolve(root,file));
 for(const mutate of[r=>{r.source.commit='0'.repeat(40);},r=>{r.source.tree='0'.repeat(40);},r=>{r.artifacts.find(a=>a.file===file).sha256='0'.repeat(64);},r=>{r.artifacts.push({...r.artifacts.find(a=>a.file===file)});}]){
  const copy=structuredClone(run);mutate(copy);await assert.rejects(validateRefreshedTransientBuilder(root,file,bytes,copy));
 }
 await assert.rejects(validateRefreshedTransientBuilder(root,'benchmarks/core-performance-macos-arm64.json',bytes,run));
});
