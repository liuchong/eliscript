// Additional full-source Reader acceptance. This intentionally remains separate
// from the unchanged WASM module corpus; failures are real self-hosting gaps.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setup,teardown,pair,observed,expected,finish,sourceRoot} from '../../tests/native-compiler-module-rig.mjs';

if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('native Reader corpus requires macOS ARM64');
const fixture=JSON.parse(await readFile(resolve(sourceRoot,'tests/fixtures/bootstrap-reader.json'),'utf8'));
const memoryOptions={initialPages:1,maximumPages:256};
for(const argument of process.argv.slice(2)){
 const match=/^--(initial|maximum)-pages=(\d+)$/.exec(argument);
 if(!match)throw new Error('expected --initial-pages=N or --maximum-pages=N');
 memoryOptions[match[1]+'Pages']=Number(match[2]);
}
if(!Number.isInteger(memoryOptions.initialPages)||!Number.isInteger(memoryOptions.maximumPages)||memoryOptions.initialPages<1||memoryOptions.initialPages>memoryOptions.maximumPages||memoryOptions.maximumPages>65535)throw new RangeError('invalid memory page bounds');
const configuration={maxSlots:131072,initialBytes:8388608,maxBytes:16777216};
console.log(JSON.stringify({format:'eliscript-native-reader-corpus-config',...configuration,autoBytes:65536,...memoryOptions,pageBytes:65536}));
let passed=0,failed=0;
try{
 await setup();
 for(const item of [...fixture.valid,...fixture.invalid]){
  const source=Object.hasOwn(item,'source')?item.source:await readFile(resolve(sourceRoot,item.file),'utf8');
  const adapters=await pair('reader',configuration,memoryOptions);
  for(const [index,a] of adapters.entries()){
   const result={case:item.name,target:index===0?'wasm':'native',bytes:Buffer.byteLength(source)};
   try{
    a.auto(65536);
    assert.deepEqual(observed(a,'read',source,item.filename),expected('read',source,item.filename));
    result.status='pass';
   }catch(error){
    result.status='fail';result.name=error.name;result.message=error.message;result.diagnostic=error.eliscriptDiagnostic;
    try{result.statsAtFailure=a.stats();}catch(statsError){result.statsFailure=statsError.message;}
   }finally{
    try{finish(a);}catch(error){result.status='fail';result.cleanupFailure=error.message;}
   }
   if(result.status==='pass')passed++;else failed++;
   console.log(JSON.stringify(result));
  }
 }
}finally{await teardown();}
console.log(JSON.stringify({format:'eliscript-native-reader-corpus',passed,failed}));
if(failed)process.exitCode=1;
