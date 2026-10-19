import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {resolveOriginalCorpusRequest} from '../tools/backends/compiler-corpus-execution.mjs';

const operand={kind:'reference',value:'x',children:[],properties:{scope:'original'},
  span:{start:{offset:39,line:2,column:7},end:{offset:40,line:2,column:8}}};
function recipe(index,extra={}) {
  return {$compilerCorpusJsonPatch:[{$compilerCorpusRef:'source.ir'},[
    {path:['body',0,'children'],duplicateIndex:index,...extra},
  ]]};
}
function results(children=[operand]) {
  return new Map([['source',{ir:JSON.stringify({body:[{kind:'intrinsic',value:'host-identity-token',children}]})}]]);
}

test('original corpus duplicateIndex clones the actual operand including all source fields without modifying the retained source',()=>{
  const retained=results(),original=retained.get('source').ir;
  const changed=JSON.parse(resolveOriginalCorpusRequest(recipe(0),retained));
  assert.deepEqual(changed.body[0].children,[operand,operand]);
  assert.equal(retained.get('source').ir,original);
  assert.notEqual(changed.body[0].children[0],changed.body[0].children[1]);
  changed.body[0].children[1].span.start.column=100;
  assert.equal(changed.body[0].children[0].span.start.column,7);
  assert.equal(JSON.parse(original).body[0].children[0].span.start.column,7);
});

test('original corpus duplicateIndex resolves an index reference and retains prior ordinary patch behavior',()=>{
  const retained=results();retained.set('index',{value:0});
  const value=JSON.parse(resolveOriginalCorpusRequest(recipe({$compilerCorpusRef:'index.value'}),retained));
  assert.deepEqual(value.body[0].children,[operand,operand]);
  const patched=resolveOriginalCorpusRequest({$compilerCorpusJsonPatch:[{$compilerCorpusRef:'source.ir'},[
    {path:['body',0,'children'],append:operand},
    {path:['body',0,'value'],value:'unchanged-transport'},
    {path:['zero'],negativeZero:true},
  ]]},retained);
  const output=JSON.parse(patched);assert.deepEqual(output.body[0].children,[operand,operand]);
  assert.equal(output.body[0].value,'unchanged-transport');assert(Object.is(output.zero,-0));
});

test('original corpus duplicateIndex refuses non-array targets invalid indices and ambiguous patch operations',()=>{
  for(const index of [-1,1,2,1.5,Infinity,NaN,'0',null,undefined,false,{},[]])
    assert.throws(()=>resolveOriginalCorpusRequest(recipe(index),results()),TypeError,String(index));
  for(const children of [[],{},null,'not-an-array',0])
    assert.throws(()=>resolveOriginalCorpusRequest(recipe(0),results(children)),TypeError);
  for(const extra of [{append:operand},{value:[]},{negativeZero:true},{negativeZero:false}])
    assert.throws(()=>resolveOriginalCorpusRequest(recipe(0,extra),results()),TypeError);
  assert.throws(()=>resolveOriginalCorpusRequest(recipe('length'),results()),TypeError);
  assert.throws(()=>resolveOriginalCorpusRequest(recipe('__proto__'),results()),TypeError);
});
