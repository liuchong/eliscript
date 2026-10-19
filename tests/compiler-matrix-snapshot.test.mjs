import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadCompilerMatrixCorpus,loadOriginalCompilerManifests} from '../tools/backends/compiler-matrix.mjs';

const sourceRoot=fileURLToPath(new URL('..',import.meta.url));

test('Given caller-owned corpus data When loading crosses I/O Then cases document and identity remain separate snapshots with exact source bytes',async()=>{
  const originals=await loadOriginalCompilerManifests({sourceRoot});
  const id='snapshot-case',coverage=[...originals.requiredCoverage];
  const source='; \uFEFF中😀\ud800\n(defconst value -0)';
  const shared={value:-0};
  const input={format:'eliscript-compiler-matrix-corpus',version:1,
    manifests:Object.fromEntries(originals.manifests.map(item=>[item.id,{sha256:item.sha256,identity:item.identity}])),
    coverageIds:coverage,expectedIds:[id],
    records:[{id,kind:'project',coverage:[...coverage],entry:'entry.mjs',
      modules:[{id:'entry.mjs',filename:'snapshot.eli',source}],
      request:{operation:'project',shared},expected:{value:-0,shared}}],
    originalGateEvidence:{coverageIds:[],details:{value:-0}},
    missingCaseAdapters:[{coverageId:coverage[0],reason:'retained snapshot'}]};
  const pending=loadCompilerMatrixCorpus({sourceRoot,records:input});
  input.records[0].modules[0].source='changed after dispatch';
  shared.value=1;
  input.originalGateEvidence.details.value=1;input.missingCaseAdapters[0].reason='changed';
  const result=await pending;
  assert.equal(result.records[0].modules[0].source,source);
  assert.equal(result.document.records[0].modules[0].source,source);
  assert(Object.is(result.records[0].expected.value,-0));
  assert(Object.is(result.records[0].expected.shared.value,-0));
  assert.equal(result.records[0].request.shared,result.records[0].expected.shared);
  assert.equal(result.document.records[0].request.shared,result.document.records[0].expected.shared);
  assert.notEqual(result.records[0].request.shared,result.document.records[0].request.shared);
  assert(Object.is(result.identity.originalGateEvidence.details.value,-0));
  assert.equal(result.identity.missingCaseAdapters[0].reason,'retained snapshot');
  assert.notEqual(result.document,input);assert.notEqual(result.records[0],result.document.records[0]);
  assert.notEqual(result.identity.originalGateEvidence,result.document.originalGateEvidence);
  assert.notEqual(result.identity.missingCaseAdapters,result.document.missingCaseAdapters);
  const retained=JSON.parse(Buffer.from(result.recordsBytes).toString('utf8'));
  assert.equal(retained.records[0].modules[0].source,source);
  assert(Object.is(retained.records[0].expected.value,-0));
  result.records[0].modules[0].source='case edited';
  result.identity.originalGateEvidence.details.value=2;
  result.document.missingCaseAdapters[0].reason='document edited';
  assert.equal(result.document.records[0].modules[0].source,source);
  assert(Object.is(result.document.originalGateEvidence.details.value,-0));
  assert.equal(result.identity.missingCaseAdapters[0].reason,'retained snapshot');
  assert.equal(JSON.parse(Buffer.from(result.recordsBytes).toString('utf8')).records[0].modules[0].source,source);
});
