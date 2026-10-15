import {createHash} from 'node:crypto';

const reports=new Set([
 'benchmarks/transient-builder-macos-arm64.json',
 'benchmarks/worker-lifecycle-soak-macos-arm64.json',
]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const immutableGitBytes=new Map();
export function retainedGitSnapshotBytes(root,args){
 if(!['show','rev-parse','log','ls-tree'].includes(args[0]))throw Error('retained performance snapshot: unsupported Git read');
 const immutable=args[0]!=='log'&&args.some(arg=>/^[0-9a-f]{40}(?::|\^\{tree\}$)/.test(arg));
 const key=JSON.stringify([root,args]);
 if(immutable&&immutableGitBytes.has(key))return immutableGitBytes.get(key).slice();
 const child=Bun.spawnSync(['git',...args],{cwd:root,stdout:'pipe',stderr:'pipe'});
 if(child.exitCode!==0)throw Error('retained performance snapshot: measured Git snapshot is unavailable');
 // Only SHA-addressed Git objects are cached. Worktree reads and the mutable
 // last-report revision lookup are always rechecked on every validation.
 if(immutable)immutableGitBytes.set(key,Uint8Array.from(child.stdout));
 return child.stdout;
}

// A deferred current-source check must still authenticate the exact measured
// report and its measured source tree. Uncommitted replacements cannot acquire
// historical provenance merely by opting out of current-source acceptance.
export function retainedPerformanceSnapshot(root,filename,bytes){
 if(!reports.has(filename))throw Error('retained performance snapshot: unsupported report');
 const commit=new TextDecoder().decode(retainedGitSnapshotBytes(root,['log','-1','--format=%H','--',filename])).trim();
 if(!/^[0-9a-f]{40}$/.test(commit))throw Error('retained performance snapshot: measured commit is unavailable');
 const artifactSha256=digest(bytes);
 if(digest(retainedGitSnapshotBytes(root,['show',`${commit}:${filename}`]))!==artifactSha256)throw Error('retained performance snapshot: report bytes differ from their measured Git snapshot');
 const tree=new TextDecoder().decode(retainedGitSnapshotBytes(root,['rev-parse',`${commit}^{tree}`])).trim();
 if(!/^[0-9a-f]{40}$/.test(tree))throw Error('retained performance snapshot: measured tree is unavailable');
 return{commit,tree,artifactSha256};
}

export function deferredPerformanceAcceptance(report,measuredSource){
 return{report,historicalSourcesVerified:true,currentSourceAcceptance:'deferred',performanceAccepted:false,measuredSource};
}
