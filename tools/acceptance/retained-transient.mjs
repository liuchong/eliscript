import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {validateTransientBuilderReport} from '../collections/transient-builder-benchmark.mjs';

const FILE='benchmarks/transient-builder-macos-arm64.json';
const PARAMETERS={vectorSize:200000,mapSize:100000,setSize:100000,warmupRounds:2,timingSamples:11};
const POLICY={minimumSpeedup:1.5,maximumAllocationRatio:1/3,passed:true};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function require(condition,message){if(!condition)throw Error(`retained transient refresh: ${message}`);}
function relative(file){return typeof file==='string'&&file.length>0&&!path.isAbsolute(file)&&!file.split('/').includes('..')&&path.posix.normalize(file)===file;}
function git(root,args){const r=Bun.spawnSync(['git',...args],{cwd:root,stdout:'pipe',stderr:'pipe'});require(r.exitCode===0,'accepted Git snapshot is unavailable');return r.stdout;}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

async function sourceDigest(root,files,revision){
 require(Array.isArray(files)&&files.length>0&&new Set(files).size===files.length,'source inventory is incomplete');
 const hash=createHash('sha256');
 for(const file of files){
  require(relative(file),'unsafe source path');hash.update(file);hash.update('\0');
  hash.update(revision?git(root,['show',`${revision}:${file}`]):await readFile(path.join(root,file)));hash.update('\0');
 }
 return hash.digest('hex');
}

// The historical report remains in its accepted Git tree. A replacement must
// independently pass the original workload and policy against all current code.
export async function validateRefreshedTransientBuilder(root,filename,currentBytes,run){
 require(filename===FILE,'only the source-bound transient benchmark can be refreshed');
 const revision=run.source?.commit,tree=run.source?.tree;
 require(/^[0-9a-f]{40}$/.test(revision??'')&&/^[0-9a-f]{40}$/.test(tree??''),'invalid accepted source identity');
 require(new TextDecoder().decode(git(root,['rev-parse',`${revision}^{tree}`])).trim()===tree,'accepted tree identity changed');
 const bound=run.artifacts?.filter(entry=>entry.file===filename);
 require(bound?.length===1&&/^[0-9a-f]{64}$/.test(bound[0].sha256??''),'artifact is not uniquely bound to the accepted run');
 const acceptedBytes=git(root,['show',`${revision}:${filename}`]);
 require(digest(acceptedBytes)===bound[0].sha256,'accepted artifact differs from its Git snapshot');
 const accepted=JSON.parse(new TextDecoder().decode(acceptedBytes)),current=JSON.parse(new TextDecoder().decode(currentBytes));
 for(const report of[accepted,current]){
  validateTransientBuilderReport(report);
  require(same(report.parameters,PARAMETERS)&&same(report.decision,POLICY),'original workload or decision policy changed');
 }
 require(same(Object.keys(current.results).sort(),['map','set','vector']),'result inventory changed');
 for(const name of['vector','map','set']){
  const item=current.results[name],size=PARAMETERS[`${name}Size`],a=item.allocation,t=item.timing,c=item.correctness;
  require(item.size===size,'workload size changed');
  const expected={valid:true,count:size,first:name==='set'?true:0,last:name==='set'?true:(size-1)*(name==='map'?2:1)};
  require(same(c.persistentObservation,expected)&&same(c.transientObservation,expected),'observed workload is incomplete');
  require(c.persistentHash===c.transientHash&&c.persistentHash===accepted.results[name].correctness.persistentHash,'value/hash equivalence changed');
  require(Number.isSafeInteger(a.persistentNodeAllocations)&&a.persistentNodeAllocations>0&&Number.isSafeInteger(a.transientNodeAllocations)&&a.transientNodeAllocations>=0,'allocation counters are invalid');
  require(a.allocationRatio===a.transientNodeAllocations/a.persistentNodeAllocations&&a.allocationRatio<=1/3,'allocation ratio differs from counters');
  const calls=name==='set'?'setPersistentCalls':'persistentCalls',invalid=name==='set'?'setInvalidCalls':'invalidCalls';
  require(a.completionCalls===1&&a.transientMetrics?.[calls]===1&&a.transientMetrics?.[invalid]===0,'transient lifecycle is incomplete');
  for(const family of['persistent','transient']){
   const samples=t[`${family}SamplesMs`];
   require(samples.length===11&&samples.every(v=>Number.isFinite(v)&&v>0),'timing samples are incomplete');
   require(t[`${family}MedianMs`]===median(samples),'timing median differs from raw samples');
  }
  require(t.speedup===t.persistentMedianMs/t.transientMedianMs&&t.speedup>=1.5,'speedup differs from raw medians');
 }
 require(accepted.sourceDigest?.algorithm==='sha256'&&current.sourceDigest?.algorithm==='sha256','source digest algorithm changed');
 require(await sourceDigest(root,accepted.sourceDigest.files,revision)===accepted.sourceDigest.value,'accepted source aggregate differs from its Git snapshot');
 const core=(await readdir(path.join(root,'runtime/core'))).filter(name=>name.endsWith('.mjs')).sort().map(name=>`runtime/core/${name}`);
 const inventory=[...core,'runtime/testing/map.mjs','runtime/testing/set.mjs','runtime/testing/vector.mjs','tools/collections/transient-builder-benchmark.mjs'];
 require(same(current.sourceDigest.files,inventory),'fresh source inventory is incomplete');
 require(await sourceDigest(root,inventory)===current.sourceDigest.value,'fresh source aggregate is stale');
 return true;
}
