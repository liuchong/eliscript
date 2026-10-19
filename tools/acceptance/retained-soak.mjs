import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {retainedPerformanceSnapshot,deferredPerformanceAcceptance,retainedGitSnapshotBytes} from './retained-performance-snapshot.mjs';

const SOAK='benchmarks/worker-lifecycle-soak-macos-arm64.json';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function require(condition,message){if(!condition)throw Error(`retained soak refresh: ${message}`);}
function relative(file){return typeof file==='string'&&file.length>0&&!path.isAbsolute(file)&&!file.split('/').includes('..')&&path.posix.normalize(file)===file;}
function git(root,args){try{return retainedGitSnapshotBytes(root,args);}catch{require(false,'accepted Git snapshot is unavailable');}}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[0]+sorted[1])/2;};

// This is an additional gate for a newly measured report. It never edits the
// accepted source run, its artifact hash, or the old artifact in Git history.
export async function validateRefreshedWorkerSoak(root,filename,currentBytes,run,options={}){
 require(filename===SOAK,'only the source-bound worker soak can be refreshed');
 const revision=run.source?.commit,tree=run.source?.tree;
 require(/^[0-9a-f]{40}$/.test(revision??'')&&/^[0-9a-f]{40}$/.test(tree??''),'invalid accepted source identity');
 require(new TextDecoder().decode(git(root,['rev-parse',`${revision}^{tree}`])).trim()===tree,'accepted tree identity changed');
 const bound=run.artifacts?.filter(entry=>entry.file===filename);
 require(bound?.length===1&&/^[0-9a-f]{64}$/.test(bound[0].sha256??''),'artifact is not uniquely bound to the accepted run');
 const acceptedBytes=git(root,['show',`${revision}:${filename}`]);
 require(digest(acceptedBytes)===bound[0].sha256,'accepted artifact hash does not match its Git snapshot');
 const accepted=JSON.parse(new TextDecoder().decode(acceptedBytes)),current=JSON.parse(new TextDecoder().decode(currentBytes));
 require(current.schemaVersion===1&&current.format==='eliscript-worker-lifecycle-soak'&&current.version===1&&current.verified===true&&current.acceptanceQualified===true,'fresh report is not acceptance qualified');
 require(same(current.limits,{runTimeoutSeconds:180,requestTimeoutMs:5000,blockingTimeoutMs:25}),'original timeout policy changed');
 require(Number.isFinite(current.elapsedMs)&&current.elapsedMs>0&&current.elapsedMs<=180000,'original elapsed budget failed');
 const w=current.workload;
 for(const [key,value] of Object.entries({successfulRequests:100000,responseCount:100000,uniqueResponses:100000,duplicateResponses:0,lostResponses:0,batchSize:64,peakInFlight:64,checkpointEvery:2500,resultChecksum:2409405,expectedChecksum:2409405}))require(w?.[key]===value,`workload ${key} failed`);
 const recovery=current.recovery;
 require(recovery?.faultCallbacks===3&&recovery.initialGeneration===1&&recovery.finalGeneration===5&&recovery.restartCount===4,'recovery counts failed');
 const events=[{name:'cooperative-cancellation',errorCode:'cancelled',callbackCount:1,pendingAfter:0},{name:'explicit-restart',fromGeneration:1,toGeneration:2,pendingAfter:0},{name:'module-replacement',fromGeneration:2,toGeneration:3,revision:2,pendingAfter:0},{name:'blocking-timeout',fromGeneration:3,errorCode:'timeout',callbackCount:1,workerStopped:true,pendingAfter:0},{name:'process-death',fromGeneration:4,errorCode:'worker-exit',callbackCount:1,pendingAfter:0}];
 require(recovery.events?.length===events.length,'recovery event inventory changed');
 for(let i=0;i<events.length;i++)for(const [key,value]of Object.entries(events[i]))require(recovery.events[i][key]===value,`recovery ${events[i].name} failed`);
 const lifecycle=current.lifecycle;
 for(const [key,value]of Object.entries({cleanShutdown:true,temporaryDirectoryRemoved:true,reclaimedProcessCount:5,pendingAfterCorpus:0,ownedProcessCount:5}))require(lifecycle?.[key]===value,`lifecycle ${key} failed`);
 require(lifecycle.ownedPids?.length===5&&new Set(lifecycle.ownedPids).size===5&&lifecycle.ownedPids.every(pid=>Number.isSafeInteger(pid)&&pid>0),'owned process inventory failed');
 const memory=current.memory,budgets={emacs:524288,worker:524288,combined:786432};
 require(memory?.unit==='KiB'&&memory.withinBudget===true&&memory.boundedTrend===true&&same(memory.budgetKiB,budgets),'original memory policy changed');
 require(Number.isSafeInteger(memory.sampleCount)&&memory.sampleCount>=40,'memory sampling incomplete');
 for(const [key,budget]of Object.entries(budgets))require(Number.isFinite(memory.peakKiB?.[key])&&memory.peakKiB[key]>=0&&memory.peakKiB[key]<=budget,`absolute ${key} budget failed`);
 require(memory.checkpoints?.length===40&&memory.generations?.length===5,'memory checkpoint inventory failed');
 for(let i=0;i<40;i++){
  const sample=memory.checkpoints[i];require(sample.request===(i+1)*2500&&sample.generation===1+Math.floor(i/8)&&sample.pid===lifecycle.ownedPids[Math.floor(i/8)],'checkpoint source identity failed');
  for(const [field,key]of [['emacsKiB','emacs'],['workerKiB','worker']])require(Number.isSafeInteger(sample[field])&&sample[field]>=0&&sample[field]<=memory.peakKiB[key],`checkpoint ${field} exceeds retained peak`);
  require(sample.emacsKiB+sample.workerKiB<=memory.peakKiB.combined,'combined checkpoint exceeds retained peak');
 }
 const medians=[];
 for(let i=0;i<5;i++){
  const group=memory.generations[i],steady=group.steadyState,samples=memory.checkpoints.slice(i*8+4,i*8+8);
  require(group.generation===i+1&&group.pid===lifecycle.ownedPids[i]&&group.checkpointCount===8&&steady?.checkpoints===8&&steady.warmupCheckpoints===4&&steady.allowanceKiB===16384&&steady.bounded===true,'original per-generation trend policy failed');
  const first={},last={};
  for(const [key,field]of [['emacs','emacsKiB'],['worker','workerKiB']]){
   first[key]=median(samples.slice(0,2).map(s=>s[field]));last[key]=median(samples.slice(2).map(s=>s[field]));
   require(steady.initialMedianKiB[key]===first[key]&&steady.finalMedianKiB[key]===last[key]&&steady.deltaKiB[key]===last[key]-first[key]&&last[key]-first[key]<=16384,`per-generation ${key} trend failed`);
  }
  medians.push(last);
 }
 const trend=memory.steadyState;
 require(trend?.fromGeneration===1&&trend.toGeneration===5&&trend.allowanceKiB===16384&&trend.bounded===true,'original total trend policy failed');
 for(const key of ['emacs','worker'])require(trend.initialMedianKiB[key]===medians[0][key]&&trend.finalMedianKiB[key]===medians[4][key]&&trend.deltaKiB[key]===medians[4][key]-medians[0][key]&&trend.deltaKiB[key]<=16384,`total ${key} trend failed`);
 const files=current.source?.files,oldFiles=accepted.source?.files;
 require(Array.isArray(files)&&Array.isArray(oldFiles)&&files.length>0&&same(files.map(x=>x.file),oldFiles.map(x=>x.file))&&new Set(files.map(x=>x.file)).size===files.length,'source inventory changed');
 const validateSources=async(measured)=>{
  const freshManifest=createHash('sha256'),oldManifest=createHash('sha256');
  for(let i=0;i<files.length;i++){
   const entry=files[i],old=oldFiles[i];require(relative(entry.file)&&/^[0-9a-f]{64}$/.test(entry.sha256??''),'unsafe source entry');
   const fresh=digest(measured?git(root,['show',`${measured.commit}:${entry.file}`]):await readFile(path.join(root,entry.file))),historical=digest(git(root,['show',`${revision}:${entry.file}`]));
   require(fresh===entry.sha256,measured?'measured source entry differs from its Git snapshot':'fresh source entry is stale');require(historical===old.sha256,'accepted source entry differs from its snapshot');
   freshManifest.update(`${entry.file}:${fresh}\n`);oldManifest.update(`${old.file}:${historical}\n`);
  }
  require(freshManifest.digest('hex')===current.source.digest,'fresh source aggregate is stale');
  require(oldManifest.digest('hex')===accepted.source.digest,'accepted source aggregate differs from its snapshot');
 };
 if(options.deferPerformanceAcceptance!==true){await validateSources(null);return true;}
 let currentFailure;
 try{await validateSources(null);return true;}catch(error){currentFailure=error;}
 try{
  const measured=retainedPerformanceSnapshot(root,filename,currentBytes);
  await validateSources(measured);
  return {...deferredPerformanceAcceptance(filename,measured),currentSourceFailure:{name:currentFailure.name,message:currentFailure.message}};
 }catch(error){error.cause=currentFailure;throw error;}
}
