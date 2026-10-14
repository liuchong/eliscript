import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateFinalAcceptanceContract} from '../tools/acceptance/finalize.mjs';
import {validateRefreshedWorkerSoak} from '../tools/acceptance/retained-soak.mjs';
const root=resolve(import.meta.dir,'..');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
test('a fully remeasured current soak retains the original accepted snapshot and final source-run hashes',async()=>{
 const contract=await read('contracts/final-acceptance.json'),run=await read('acceptance/runs/m13-01.json'),before=JSON.stringify(run);
 await validateFinalAcceptanceContract(contract,run,{root});
 assert.equal(JSON.stringify(run),before);
});

test('fresh soak replacement refuses changed thresholds, incomplete recovery, forged trends and stale source hashes',async()=>{
 const run=await read('acceptance/runs/m13-01.json'),report=await read('benchmarks/worker-lifecycle-soak-macos-arm64.json');
 for(const mutate of [r=>{r.limits.runTimeoutSeconds=181;},r=>{r.workload.successfulRequests=99999;},r=>{r.recovery.events.pop();},r=>{r.memory.budgetKiB.emacs++;},r=>{r.memory.peakKiB.worker=r.memory.budgetKiB.worker+1;},r=>{r.memory.steadyState.deltaKiB.worker++;},r=>{r.memory.generations[0].steadyState.initialMedianKiB.worker++;},r=>{r.memory.checkpoints.pop();},r=>{r.lifecycle.reclaimedProcessCount=4;},r=>{r.source.files[0].sha256='0'.repeat(64);},r=>{r.source.digest='0'.repeat(64);}]){
  const copy=structuredClone(report);mutate(copy);await assert.rejects(validateRefreshedWorkerSoak(root,'benchmarks/worker-lifecycle-soak-macos-arm64.json',Buffer.from(JSON.stringify(copy)),run));
 }
});
test('accepted snapshot identities and artifact hashes cannot be repaired by substituting another commit or report',async()=>{
 const run=await read('acceptance/runs/m13-01.json'),bytes=await readFile(resolve(root,'benchmarks/worker-lifecycle-soak-macos-arm64.json'));
 for(const mutate of [r=>{r.source.commit='0'.repeat(40);},r=>{r.source.tree='0'.repeat(40);},r=>{r.artifacts.find(x=>x.file==='benchmarks/worker-lifecycle-soak-macos-arm64.json').sha256='0'.repeat(64);}]){const copy=structuredClone(run);mutate(copy);await assert.rejects(validateRefreshedWorkerSoak(root,'benchmarks/worker-lifecycle-soak-macos-arm64.json',bytes,copy));}
 await assert.rejects(validateRefreshedWorkerSoak(root,'benchmarks/core-performance-macos-arm64.json',bytes,run));
});
