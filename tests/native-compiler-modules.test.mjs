import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {setup,teardown,pair,decode,property,box,observed,expected,finish,references,fixtures,readerExports} from './native-compiler-module-rig.mjs';
const nativeTest=test.skipIf(process.platform!=='darwin'||process.arch!=='arm64');
beforeAll(setup,120000);
afterAll(teardown);

nativeTest('complete unchanged reader and syntax modules execute in real native code with the accepted WASM corpus',async()=>{
 for(const a of await pair('reader')){a.auto(1);
  for(const source of ['', ' ;😀 comment\n','nil t false undefined','0 -0 1.25 -2e3 +.5 1e-2','foo :bar :ns/name 😀 \ud800x','() (a [1 2] {:x 3} #{a b})','#queue ;comment\n [1 2]',"'x `x ,x ,@x #'fn",'"a\\n😀\\uD800"','(module demo (defun square (x) (* x x)) (export square))']){
   assert.deepEqual(observed(a,'read',source,'输入😀.eli'),expected('read',source,'输入😀.eli'),source);a.collect();assert.equal(a.stats().frameDepth,0);
  }
  finish(a);
 }
},120000);

nativeTest('complete native reader retains accepted diagnostics, filename boundaries and post-error recovery',async()=>{
 for(const a of await pair('reader')){a.auto(1);
  for(const source of ['(','[1)','{:x}','#x','#',':',':a/',':a/b/c',"'",',@','"unterminated','\n😀\n)'])for(const filename of [undefined,null,'','bad.eli'])assert.deepEqual(observed(a,'read',source,filename),expected('read',source,filename),source);
  assert.deepEqual(observed(a,'read','(ok 1)','recovered.eli'),expected('read','(ok 1)','recovered.eli'));finish(a);
 }
},120000);

nativeTest('native reader preserves the accepted JSON SyntaxError class and host diagnostic boundary',async()=>{
 for(const a of await pair('reader')){a.auto(1);
  for(const source of ['"\\uZZZZ"','"\\x41"','"a\nb"','"\\u12"']){
   let original;try{references.get('reader').read_string(source,'bad-json.eli');}catch(error){original=error;}assert(original instanceof SyntaxError);
   const input=a.string(source),file=a.string('bad-json.eli'),out=a.invoke('read_observed',[input,file]);assert.equal(a.get(out,0),false);
   const error=a.get(out,1),name=property(a,error,'name'),message=property(a,error,'message'),diagnostic=property(a,error,'eliscriptDiagnostic');
   assert.equal(a.readString(name),original.name);assert(a.readString(message).length>0);assert.equal(decode(a,diagnostic).code,'ELI-RT0003');assert.equal(decode(a,diagnostic).phase,'runtime');
   for(const value of [input,file,out,error,name,message,diagnostic])a.release(value);a.collect();
  }
  const input=a.string('"\\uZZZZ"'),file=a.string('bad-json.eli');assert.throws(()=>a.invoke('read_string',[input,file]),error=>error instanceof Error&&!(error instanceof SyntaxError)&&error.eliscriptDiagnostic?.code==='ELI-RT0003');a.release(input);a.release(file);
  assert.deepEqual(observed(a,'read','ok','after-error.eli'),expected('read','ok','after-error.eli'));finish(a);
 }
},120000);
function readerState(a,source){const fields={source,index:0,offset:0,line:1,column:1},boxed=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,box(a,v)]));try{return a.sourceObject(boxed);}finally{for(const value of Object.values(boxed))a.release(value);}}
nativeTest('all nine unchanged reader exports retain code predicates and live token-state mutation in native execution',async()=>{
 for(const a of await pair('reader')){a.auto(1);
  for(const name of readerExports.filter(name=>name.endsWith('-code-p')))for(const code of [undefined,null,false,0,9,10,12,13,32,34,35,39,40,41,44,59,91,93,96,123,125,128512]){
   const input=box(a,code);assert.equal(a.invoke(name.replaceAll('-','_'),[input]),references.get('reader')[name.replaceAll('-','_')](code));a.release(input);
  }
  for(const name of ['read-token','reference-read-token','skip-space-and-comments','reference-skip-space-and-comments'])for(const source of ['','abc ','😀中\ud800 ',' \t;😀\nabc',';end']){
   const input=readerState(a,source),before={source,index:0,offset:0,line:1,column:1},zero=a.number(0),start=a.sourceObject({index:zero});a.release(zero);
   const expected=references.get('reader')[name.replaceAll('-','_')](before,{index:0}),out=a.invoke(name.replaceAll('-','_'),name.includes('token')?[input,start]:[input]);
   assert.deepEqual(decode(a,out),expected);assert.deepEqual(decode(a,input),before);for(const value of [input,start,out])a.release(value);
  }
  finish(a);
 }
},120000);
nativeTest('native whole Reader preserves the accepted 48 deterministic random UTF16 syntax trees and spans',async()=>{
 for(const a of await pair('reader',{maxSlots:16384,initialBytes:1048576})){a.auto(1);let seed=0x631e902a;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const atoms=['nil','false','undefined','-0','1e-9',':ns/key','x','中😀','\ud800x','"\\uD800😀"'];
  function form(depth){if(!depth||next()%3===0)return atoms[next()%atoms.length];const left=form(depth-1),right=form(depth-1);switch(next()%6){case 0:return '('+left+' ;😀\n'+right+')';case 1:return '['+left+'\t'+right+']';case 2:return '{:key '+left+' :other '+right+'}';case 3:return '#{'+left+' '+right+'}';case 4:return '#queue ['+left+' '+right+']';default:return "'"+left;}}
  for(let i=0;i<48;i++){const source='; seed '+i+'\n'+form(3)+'\n'+form(2);assert.deepEqual(observed(a,'read',source,'随机😀.eli'),expected('read',source,'随机😀.eli'),source);a.collect();assert.equal(a.stats().frameDepth,0);}
  assert(a.stats().collections>100);finish(a);
 }
},120000);
const formatterCorpus=['',' ; heading  \n','nil t false undefined','(a [1 -0] {:x "😀\\uD800"} #{x y})',"'x `x ,x ,@x #'fn",';😀\n(module  demo (defun f (x) (if x 1 2)))','(module demo (defun f (x) ;inside  \n(+ x 1)))','#queue ;comment\n[1 2]','(defun long-function (one two three four five six seven eight nine ten eleven twelve thirteen fourteen) (js-array one two three four five six seven eight nine ten))'];
nativeTest('complete unchanged native formatter exposes every accepted export, formats the same corpus and stays idempotent',async()=>{
 for(const a of await pair('formatter')){a.auto(1);
  for(const name of ['formatter_format','formatter_version','formatter_width','formatter_indent']){const value=a.getExport(name);assert.deepEqual(decode(a,value),references.get('formatter')[name]);a.release(value);}
  for(const source of formatterCorpus){const actual=observed(a,'format',source,'format😀.eli');assert.deepEqual(actual,expected('format',source,'format😀.eli'),source);assert.deepEqual(observed(a,'format',actual.value,'format😀.eli'),actual);
   const strip=value=>JSON.parse(JSON.stringify(value,(key,value)=>key==='span'?undefined:value));assert.deepEqual(strip(references.get('reader').read_string(actual.value,'same.eli')),strip(references.get('reader').read_string(source,'same.eli')));a.collect();
  }
  for(const source of [undefined,null,false,true,42,-0,'(','[1)',':a/'])for(const filename of [undefined,null,false,0,'','bad.eli'])assert.deepEqual(observed(a,'format',source,filename),expected('format',source,filename));
  assert.deepEqual(observed(a,'format','(ok 1)','recovered.eli'),expected('format','(ok 1)','recovered.eli'));finish(a);
 }
},120000);
nativeTest('native whole formatter preserves the accepted 64 nested random inputs and width/comment/Unicode boundaries',async()=>{
 for(const a of await pair('formatter',{maxSlots:16384,initialBytes:1048576})){a.auto(1);let seed=0x192e731a;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const atoms=['x','nil','false','undefined',':ns/key','中😀','\ud800x','"\\uD800😀"','-0','1e-8','long-name-'+'x'.repeat(77)];
  function form(depth){if(!depth||next()%3===0)return atoms[next()%atoms.length];const left=form(depth-1),right=form(depth-1);switch(next()%7){case 0:return '('+left+' ;😀 comment  \r\n '+right+')';case 1:return '['+left+' '+right+']';case 2:return '{:x '+left+' :y '+right+'}';case 3:return '#{'+left+' '+right+'}';case 4:return '#queue ['+left+' '+right+']';case 5:return "' ; prefix \n"+left;default:return '(defun f (value) '+left+' '+right+')';}}
  for(let i=0;i<64;i++){const source='; random '+i+'  \n'+form(3)+'\n'+form(2),actual=observed(a,'format',source,'随机😀.eli');assert.deepEqual(actual,expected('format',source,'随机😀.eli'),source);assert.deepEqual(observed(a,'format',actual.value,'随机😀.eli'),actual);a.collect();assert.equal(a.stats().frameDepth,0);}
  assert(a.stats().collections>100);finish(a);
 }
},120000);
function naming(a,name,value){const input=a.string(value);try{const out=a.invoke(name,[input]);try{return{value:a.readString(out)};}finally{a.release(out);}}catch(error){const message=property(a,error,'message');try{return{error:a.readString(message)};}finally{a.release(message);a.release(error);}}finally{a.release(input);}}
function expectedName(name,value){try{return{value:references.get('symbol')[name](value)};}catch(error){return{error:error.message};}}
nativeTest('complete unchanged native symbol and syntax modules retain original fixtures, naming and real import/export edges',async()=>{
 for(const a of await pair('symbols')){a.auto(1);
  for(const [group,name] of [['segment','munge_segment'],['binding','binding_name'],['reference','reference_name']])for(const item of fixtures.symbols[group])assert.deepEqual(naming(a,name,item.input),expectedName(name,item.input),group+'/'+item.input);
  for(const name of ['munge_segment','binding_name','reference_name'])for(const input of ['','a','9lives','await','arguments','eval','nil','undefined','false','&rest','__eliscript_private','name?','set!','*value*','+','<=','a/b','a.b','/a//b/','.a..b.','中😀','\ud800x\udfff','a\u0000b','line\nname'])assert.deepEqual(naming(a,name,input),expectedName(name,input),name+':'+input);
  for(const text of ['foo-bar','value?','await','arguments','中😀','\ud800x\udfff']){const input=a.string(text),out=a.invoke('compile_name',[input]),expected=references.get('syntax').symbol_node(references.get('symbol').binding_name(text),references.get('syntax').make_span('source.eli',0,text.length,1,1,1,text.length+1));assert.deepEqual(decode(a,out),expected);
   for(const [exportName,field] of [['node_kind','kind'],['node_name','name'],['node_span','span']]){const result=a.invoke(exportName,[out]);assert.deepEqual(decode(a,result),expected[field]);a.release(result);}a.release(input);a.release(out);a.collect();
  }
  finish(a);
 }
},120000);
nativeTest('native whole symbol naming preserves the accepted 192 deterministic Unicode samples under collecting GC',async()=>{
 for(const a of await pair('symbols')){a.auto(1);let seed=0x318ac927;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  for(let n=0;n<192;n++){let value='';for(let i=0,length=next()%12;i<length;i++)value+=String.fromCharCode(next()%65536);for(const name of ['munge_segment','binding_name','reference_name'])assert.deepEqual(naming(a,name,value),expectedName(name,value));}
  assert.deepEqual(naming(a,'binding_name','recovered'),{value:'recovered'});assert(a.stats().collections>100);finish(a);
 }
},120000);
nativeTest('native Reader and formatter retain the original capacity error, caller roots and recovery contract',async()=>{
 for(const kind of ['reader','formatter'])for(const a of await pair(kind,{maxSlots:256,initialBytes:32768,maxBytes:262144})){a.auto(1);
  const source=a.string((kind==='reader'?'(':'[')+'x '.repeat(256)+(kind==='reader'?')':']')),file=a.string('capacity.eli'),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
  assert.throws(()=>a.invoke(kind==='reader'?'read_string':'format_source',[source,file]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(source);a.release(file);a.collect();
  assert.deepEqual(observed(a,kind==='reader'?'read':'format',kind==='reader'?'(ok)':'ok','recovered.eli'),expected(kind==='reader'?'read':'format',kind==='reader'?'(ok)':'ok','recovered.eli'));a.leaveFrame(frame);a.release(held);finish(a);
 }
},120000);
