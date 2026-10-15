// OPEN additional complete-source Analyzer acceptance. The original JS corpus
// remains mandatory; this manual WASM corpus does not claim completed self-hosting.
// A prior corpus run was externally stopped after three minutes while still
// executing self-expander; that result is incomplete, not a semantic failure.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {instantiateManagedRuntime} from '../backends/managed-runtime.mjs';
import {setup,teardown,artifact,analyzeObserved,expectedAnalysis,finish} from '../../tests/wasm-compiler-analyzer-rig.mjs';
const sourceRoot=resolve(fileURLToPath(new URL('../..',import.meta.url)));
process.chdir(sourceRoot);
const fixture=JSON.parse(await readFile('tests/fixtures/bootstrap-analyzer.json','utf8')),cases=fixture.valid.filter(item=>item.file);
assert.equal(fixture.valid.length,30);assert.equal(cases.length,12);assert.equal(fixture.invalid.length,57);
const configuration={maxSlots:524288,initialBytes:16777216,maxBytes:134217728},memoryOptions={maximumPages:4096},autoBytes=65536;
console.log(JSON.stringify({format:'eliscript-wasm-analyzer-corpus-config',...configuration,...memoryOptions,autoBytes,pageBytes:65536,cases:cases.map(item=>item.name)}));
let passed=0,failed=0;
try{
 await setup();const a=instantiateManagedRuntime(artifact(memoryOptions),configuration);a.auto(autoBytes);
 for(const item of cases){
  const source=await readFile(item.file,'utf8'),result={case:item.name,target:'wasm',bytes:Buffer.byteLength(source)};console.log(JSON.stringify({...result,status:'running',stats:a.stats()}));
  try{const expected=expectedAnalysis(source,item.filename);assert.equal(expected.status,'ok');assert.deepEqual(analyzeObserved(a,source,item.filename),expected);result.status='pass';}
  catch(error){result.status='fail';result.name=error.name;result.message=error.message;result.diagnostic=error.eliscriptDiagnostic;result.statsAtFailure=error.testManagedState??a.stats();}
  finally{try{a.collect();assert.equal(a.stats().frameDepth,0);}catch(error){result.status='fail';result.cleanupFailure=error.message;}}
  if(result.status==='pass')passed++;else failed++;console.log(JSON.stringify(result));
 }
 finish(a);
}finally{await teardown();}
console.log(JSON.stringify({format:'eliscript-wasm-analyzer-corpus',passed,failed}));
if(failed)process.exitCode=1;
