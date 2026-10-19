import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
let directory,compiler;
const source=String.raw`
(defun empty (value) (js-call value :join))
(defun literals (value) (js-call value :join "|" 0 -0.0 nil t false undefined))
(defun computed (receiver key) (js-call (funcall receiver) (funcall key) "|"))
(defun reference (value separator) (js-call value :join separator))
(defun effect (value next) (js-call value :join (funcall next)))
(defun extra (value next) (js-call value :join "|" (funcall next)))
(defun getter (value options) (js-call value :join (get options :separator)))
(defun raw (value) (js-call value :join (js* "'|'")))
(defun tagged (value) (js-call value :join :separator))
(defun allocated (value) (js-call value :join (js-array)))
(defun quoted (value) (js-call value :join '(1 2)))
(defun thrown (value marker) (js-call value :join (throw marker)))
(defasync pending (value separator) (js-call value :join (await separator)))
(defun text (value) (js-call value :toString))
(defun borrowed-join () (get (js* "Array.prototype") :join))
(defun borrowed-text () (get (js* "Array.prototype") :toString))
(defun method-call (method value separator) (js-call method :call value separator))
(defun method-apply (method value args) (js-call method :apply value args))
(defun method-bind (method value separator) (js-call method :bind value separator))
(defun bind-receiver (method value) (js-call method :bind value))
(defun bind-again (bound value separator) (js-call bound :bind value separator))
(defun invoke-bound (bound separator) (funcall bound separator))
(defun external-bound (callback bound) (funcall callback bound))
(defun nested-call (method value separator)
  (js-call (get (js* "Function.prototype") :call) :call method value separator))
(defun nested-apply-call (method value args)
  (js-call (get (js* "Function.prototype") :apply) :call method value args))
(defun nested-call-apply (method value separator)
  (js-call (get (js* "Function.prototype") :call) :apply method (js-array value separator)))
(defun nested-apply (method value args)
  (js-call (get (js* "Function.prototype") :apply) :apply method (js-array value args)))
(defun reflected (method value args) (Reflect/apply method value args))
(export empty literals computed reference effect extra getter raw tagged allocated quoted thrown pending text
  borrowed-join borrowed-text method-call method-apply method-bind bind-receiver bind-again invoke-bound
  external-bound nested-call nested-apply-call nested-call-apply nested-apply reflected)`;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-literal-method-'));const out=resolve(directory,'compiler'),build=spawnSync(resolve('bin/eliscript-bootstrap'),[],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:out}});assert.equal(build.status,0,build.stderr);compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
const load=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const capsuleConsumers=['runtime/core/protocol-impl.mjs','tests/snapshots/core.mjs'];
async function capsuleMaintenanceFixture(name){
 const root=resolve(directory,name);
 for(const part of['tools/compiler','runtime','compiler','bootstrap/compiler','contracts'])await mkdir(resolve(root,part),{recursive:true});
 // Run the actual maintenance implementation against an isolated small tree.
 // Its bundler sees a real entry module; the original repository files and
 // compiler bootstrap remain untouched by both successful and failed writes.
 await writeFile(resolve(root,'tools/compiler/array-text-capsule.mjs'),await readFile('tools/compiler/array-text-capsule.mjs','utf8'));
 await writeFile(resolve(root,'runtime/array-text.mjs'),'export function c(value){return value;} export function d(value){return value;}\n');
 const old=['data:text/javascript;base64,b2xkLWNhcHN1bGUtMQ==','data:text/javascript;base64,b2xkLWNhcHN1bGUtMg=='];
 const declarations=[['compiler/eliscript-emitter.el','eliscript-emitter--array-text-import'],['bootstrap/compiler/emitter.eli','array-text-import']];
 for(let index=0;index<declarations.length;index++){
  const[file,binding]=declarations[index],prelude='import { c as __eliscript_at, d as __eliscript_at_direct } from '+JSON.stringify(old[index])+';\n';
  await writeFile(resolve(root,file),'(defconst '+binding+' '+JSON.stringify(prelude)+')\n');
 }
 const contract={schemaVersion:1,preserved:{value:'original contract field'},imports:{specialSpecifiers:[
  {prefix:'node:',allowedRoots:['tools/']},
  {specifier:'z-last',allowedRoots:['tests/']},
  {specifier:old[0],allowedRoots:capsuleConsumers},
  {prefix:'aaa:',allowedRoots:['runtime/']},
  {specifier:'a-first',allowedRoots:['runtime/']},
  {specifier:old[1],allowedRoots:capsuleConsumers},
 ]}};
 await writeFile(resolve(root,'contracts/repository-integrity.json'),JSON.stringify(contract,null,2)+'\n');
 const api=await import(pathToFileURL(resolve(root,'tools/compiler/array-text-capsule.mjs')).href);
 return{root,api,old,contract,declarations};
}
test('array text capsule maintenance pins the exact generated URL at two actual consumers and orders exact selectors before prefixes',async()=>{
 const fixture=await capsuleMaintenanceFixture('capsule-integrity-order');
 const files=[...fixture.declarations.map(([file])=>file),'contracts/repository-integrity.json'];
 const before=await Promise.all(files.map(file=>readFile(resolve(fixture.root,file),'utf8')));
 await assert.rejects(()=>fixture.api.checkArrayTextCapsule(),error=>{
  assert.match(error.message,/array text capsule is stale/);
  for(const file of files)assert(error.message.includes(file),file);return true;
 });
 assert.deepEqual(await Promise.all(files.map(file=>readFile(resolve(fixture.root,file),'utf8'))),before,'check mode never writes a partially refreshed contract');
 const result=await fixture.api.checkArrayTextCapsule({write:true});
 assert.deepEqual(result.changed,files);assert(result.bytes>0);
 const preludes=[];
 for(const[file]of fixture.declarations){
  const text=await readFile(resolve(fixture.root,file),'utf8'),match=/\(defconst [^\s]+ ("(?:[^"\\]|\\.)*")\)/.exec(text);
  assert(match);preludes.push(JSON.parse(match[1]));
 }
 assert.equal(preludes[0],preludes[1]);assert.equal(Buffer.byteLength(preludes[0]),result.bytes);
 const match=/from ("(?:[^"\\]|\\.)*");\n$/.exec(preludes[0]);assert(match);
 const specifier=JSON.parse(match[1]);assert.match(specifier,/^data:text\/javascript;base64,/);
 assert(!fixture.old.includes(specifier));
 const saved=JSON.parse(await readFile(resolve(fixture.root,'contracts/repository-integrity.json'),'utf8'));
 assert.deepEqual(saved.preserved,fixture.contract.preserved);
 assert.deepEqual(saved.imports.specialSpecifiers,[
  {specifier:'a-first',allowedRoots:['runtime/']},
  {specifier,allowedRoots:capsuleConsumers},
  {specifier:'z-last',allowedRoots:['tests/']},
  {prefix:'aaa:',allowedRoots:['runtime/']},
  {prefix:'node:',allowedRoots:['tools/']},
 ]);
 assert.equal(saved.imports.specialSpecifiers.filter(record=>record.specifier===specifier).length,1);
 assert.equal(saved.imports.specialSpecifiers.some(record=>record.prefix?.startsWith('data:')),false,'no broad data-import permission is generated');
 assert.deepEqual((await fixture.api.checkArrayTextCapsule()).changed,[],'an actual second generation is deterministic and already pinned');
},30000);
test('array text capsule maintenance rejects broadened reordered or incomplete consumer roots before publishing either compiler declaration',async()=>{
 const fixture=await capsuleMaintenanceFixture('capsule-integrity-roots');
 const prelude=await fixture.api.renderArrayTextImport(),match=/from ("(?:[^"\\]|\\.)*");\n$/.exec(prelude);assert(match);
 const specifier=JSON.parse(match[1]);
 const before=await Promise.all(fixture.declarations.map(([file])=>readFile(resolve(fixture.root,file),'utf8')));
 for(const allowedRoots of[[],['runtime/','tests/'],capsuleConsumers.slice().reverse(),capsuleConsumers.slice(0,1),[...capsuleConsumers,'other.mjs']]){
  const contract=structuredClone(fixture.contract);contract.imports.specialSpecifiers.push({specifier,allowedRoots});
  const text=JSON.stringify(contract,null,2)+'\n',path=resolve(fixture.root,'contracts/repository-integrity.json');await writeFile(path,text);
  await assert.rejects(()=>fixture.api.checkArrayTextCapsule({write:true}),/array text capsule integrity roots differ/);
  assert.equal(await readFile(path,'utf8'),text);
  assert.deepEqual(await Promise.all(fixture.declarations.map(([file])=>readFile(resolve(fixture.root,file),'utf8'))),before);
 }
},30000);
function body(code,name){const start=code.indexOf('function '+name+'('),next=code.indexOf('\nfunction ',start+1);assert(start>=0,name);return code.slice(start,next<0?undefined:next);}
test('only primitive literal arguments and zero arguments use the closure-free array text entry',()=>{const code=compiler.compile_string(source,'literal-method.eli');for(const name of['empty','literals','computed','text']){assert(body(code,name).includes('__eliscript_at_direct('),body(code,name));assert(!body(code,name).includes('__eliscript_at('));}for(const name of['reference','effect','extra','getter','raw','tagged','allocated','quoted','thrown','pending'])assert(body(code,name).includes('__eliscript_at('),body(code,name));});
async function check(m){
 const events=[],identity={},value={get join(){events.push('method');return function(...args){events.push(['call',this===value,args]);return identity;};}};
 assert.equal(m.literals(value),identity);assert.equal(events[0],'method');assert.equal(events[1][1],true);assert.equal(events[1][2].length,7);assert.deepEqual(events[1][2],['|',0,-0,null,true,false,undefined]);
 const target=['a','b'],order=[];assert.equal(m.computed(()=>{order.push('receiver');return target;},()=>{order.push('key');return{[Symbol.toPrimitive](){order.push('coerce');return'join';}};}),'a|b');assert.deepEqual(order,['receiver','key','coerce']);
 let effects=0,gets=0;const own={get join(){gets++;return function(separator){assert.equal(this,own);return['original',separator];};}};assert.deepEqual(m.effect(own,()=>{effects++;Object.defineProperty(own,'join',{value:()=>['replacement'],configurable:true});return'|';}),['original','|']);assert.equal(gets,1);assert.equal(effects,1);
 const extraArray=['a','b'];assert.equal(m.extra(extraArray,()=>{extraArray.join=()=>{throw Error('replaced after capture');};effects++;}),'a|b');assert.equal(effects,2);
 for(const missing of[null,undefined]){assert.throws(()=>m.effect(missing,()=>{effects++;return'|';}),TypeError);assert.equal(effects,2);assert.throws(()=>m.empty(missing),TypeError);assert.throws(()=>m.computed(()=>missing,()=>({toString(){throw Error('must not coerce key for nullish receiver');}})),TypeError);}
 assert.throws(()=>m.extra({get join(){throw identity;}},()=>{throw Error('argument after throwing getter');}),e=>e===identity);
 const marker={};assert.throws(()=>m.thrown({get join(){events.push('before-throw');return()=>{};}},marker),e=>e===marker);assert.equal(events.at(-1),'before-throw');
 const logs=[],p={get join(){logs.push('method');return function(separator){logs.push('call');return separator;};}},separator={then(resolve){logs.push('await');resolve('|');}};assert.equal(await m.pending(p,separator),'|');assert.deepEqual(logs,['method','await','call']);
 const custom={join(){return identity;}};assert.equal(m.empty(custom),identity);assert.equal(m.text({toString(){return identity;}}),identity);assert.equal(m.empty(['a','b']),'a,b');assert.equal(m.text(['a','b']),'a,b');
 const cycle=[];cycle.push(cycle);assert.throws(()=>m.empty(cycle),e=>e.eliscriptDiagnostic?.code==='ELI-RT0009');cycle[0]='ok';assert.equal(m.empty(cycle),'ok');
 const nested=['x'];assert.equal(m.empty([nested,nested]),'x,x');assert.equal(m.empty(nested),'x');
 const intrinsics={join:Array.prototype.join,text:Array.prototype.toString,call:Function.prototype.call,
  apply:Function.prototype.apply,bind:Function.prototype.bind,reflect:Reflect.apply};
 assert.equal(m.borrowed_join(),intrinsics.join);assert.equal(m.borrowed_text(),intrinsics.text);
 const routes=[
  ['call',(method,array,separator)=>m.method_call(method,array,separator)],
  ['apply',(method,array,separator)=>m.method_apply(method,array,[separator])],
  ['nested call',(method,array,separator)=>m.nested_call(method,array,separator)],
  ['apply.call',(method,array,separator)=>m.nested_apply_call(method,array,[separator])],
  ['call.apply',(method,array,separator)=>m.nested_call_apply(method,array,separator)],
  ['apply.apply',(method,array,separator)=>m.nested_apply(method,array,[separator])],
  ['Reflect.apply',(method,array,separator)=>m.reflected(method,array,[separator])],
  ['bound funcall',(method,array,separator)=>m.invoke_bound(m.method_bind(method,array,separator),'ignored')],
  ['bound call',(method,array,separator)=>m.method_call(m.method_bind(method,array,separator),null,'ignored')],
  ['bound apply',(method,array,separator)=>m.method_apply(m.method_bind(method,array,separator),null,['ignored'])],
  ['bound Reflect.apply',(method,array,separator)=>m.reflected(m.method_bind(method,array,separator),null,['ignored'])],
  ['bound again',(method,array,separator)=>m.invoke_bound(m.bind_again(m.bind_receiver(method,array),null,separator),'ignored')],
  ['external callback',(method,array,separator)=>m.external_bound(bound=>bound(),m.method_bind(method,array,separator))],
 ];
 for(const method of[intrinsics.join,intrinsics.text])for(const[name,run]of routes){
  const ordinary=['a',null,-0,'😀'],shared=['shared'];
  assert.equal(run(method,ordinary,'|'),Reflect.apply(method,ordinary,['|']),name+' ordinary');
  assert.equal(run(method,[shared,shared],'|'),Reflect.apply(method,[shared,shared],['|']),name+' shared noncycle');
  const recursive=[];recursive.push(recursive);
  assert.throws(()=>run(method,recursive,'|'),error=>error instanceof TypeError&&error.eliscriptDiagnostic?.code==='ELI-RT0009',name+' cycle');
  recursive[0]='recovered';assert.equal(run(method,recursive,'|'),'recovered',name+' recovery');
  const reentrant=[];Object.defineProperty(reentrant,0,{get(){return run(method,reentrant,'|');},configurable:true});
  assert.throws(()=>run(method,reentrant,'|'),error=>error.eliscriptDiagnostic?.code==='ELI-RT0009',name+' getter reentry');
  delete reentrant[0];reentrant[0]='recovered';assert.equal(run(method,reentrant,'|'),'recovered',name+' getter recovery');
  const failure={},bad=[{toString(){throw failure;}}];
  assert.throws(()=>run(method,bad,'|'),error=>error===failure,name+' element first error');
  bad[0]='after';assert.equal(run(method,bad,'|'),'after',name+' element recovery');
  if(method===intrinsics.text){
   const result={},custom=[];custom.push(custom);custom.join=()=>result;
   assert.equal(run(method,custom,'|'),result,name+' custom join identity');
  }
  assert.equal(run(method,['next'],'|'),'next',name+' independent next call');
 }
 // apply must consume its complete argument list before joining can inspect
 // the receiver or convert a separator, even though join ignores extra args.
 for(const[name,run]of[
  ['apply',(method,array,args)=>m.method_apply(method,array,args)],
  ['apply.call',(method,array,args)=>m.nested_apply_call(method,array,args)],
  ['apply.apply',(method,array,args)=>m.nested_apply(method,array,args)],
  ['Reflect.apply',(method,array,args)=>m.reflected(method,array,args)],
 ]){
  function observed(throwIndex){
   const trace=[],failure={},separator={toString(){trace.push('separator');return'|';}};
   const receiver=new Proxy(['a','b'],{get(target,key,owner){trace.push('receiver.'+String(key));return Reflect.get(target,key,owner);}});
   const args={get length(){trace.push('arguments.length');return 3;},
    get 0(){trace.push('arguments.0');return separator;},get 1(){trace.push('arguments.1');return'ignored';},
    get 2(){trace.push('arguments.2');if(throwIndex)throw failure;return 42;}};
   if(throwIndex){assert.throws(()=>run(intrinsics.join,receiver,args),error=>error===failure,name+' argument error');
    assert.deepEqual(trace,['arguments.length','arguments.0','arguments.1','arguments.2'],name+' first error');}
   else{assert.equal(run(intrinsics.join,receiver,args),'a|b');
    assert.deepEqual(trace,['arguments.length','arguments.0','arguments.1','arguments.2','receiver.length','separator','receiver.0','receiver.1'],name+' ordered reads');}
  }
  observed(false);observed(true);assert.equal(run(intrinsics.join,['after','throw'],['|']),'after|throw');
  let species=0,slices=0;
  class Arguments extends Array{static get [Symbol.species](){species++;throw Error('apply must not observe species');}}
  const args=new Arguments('|','ignored');Object.defineProperty(args,'slice',{get(){slices++;throw Error('apply must not read slice');}});
  assert.equal(run(intrinsics.join,['a','b'],args),'a|b');assert.equal(species,0,name+' species');assert.equal(slices,0,name+' slice');
 }
 for(const[name,run,args]of[
  ['call',(method,value,args)=>m.method_call(method,value,args),'|'],
  ['apply',(method,value,args)=>m.method_apply(method,value,args),new Proxy({},{get(){throw Error('custom apply must receive the original list');}})],
  ['bind',(method,value,args)=>m.method_bind(method,value,args),'|'],
 ]){
  const replacement={},receiver=[],trace=[],method=function(){throw Error('custom method must win');};
  Object.defineProperty(method,name,{get(){trace.push('get');return function(...values){
   trace.push('call');assert.equal(this,method);assert.equal(values[0],receiver);assert.equal(values[1],args);return replacement;
  };}});
  assert.equal(run(method,receiver,args),replacement,name+' replacement identity');assert.deepEqual(trace,['get','call']);
 }
 assert.equal(Array.prototype.join,intrinsics.join);assert.equal(Array.prototype.toString,intrinsics.text);
 assert.equal(Function.prototype.call,intrinsics.call);assert.equal(Function.prototype.apply,intrinsics.apply);
 assert.equal(Function.prototype.bind,intrinsics.bind);assert.equal(Reflect.apply,intrinsics.reflect);
 assert.equal(m.borrowed_join(),intrinsics.join);assert.equal(m.borrowed_text(),intrinsics.text);
}
test('literal direct calls and effectful captured calls preserve independent native lookup, this, identity, error and await order',async()=>{await check(await load(compiler.compile_string(source,'literal-method.eli')));});
const qualifiedApplySource=String.raw`
(defun reflected-only (method value args) (Reflect/apply method value args))
(defun reflected-funcall (method value args) (funcall Reflect/apply method value args))
(defun reflected-spread (args) (apply Reflect/apply args))
(defun namespace-apply (receiver method value args) (receiver/apply method value args))
(defun dotted-apply (receiver method value args) (receiver.apply method value args))
(defun shadowed-apply (Reflect method value args) (Reflect/apply method value args))
(defun captured-apply (receiver method value args)
  (receiver/apply (funcall method) (funcall value) (funcall args)))
(defun apply-reference () Reflect/apply)
(defun namespace-reference (receiver) receiver/apply)
(export reflected-only reflected-funcall reflected-spread namespace-apply dotted-apply
  shadowed-apply captured-apply apply-reference namespace-reference)`;
function checkQualifiedApply(m){
 const join=Array.prototype.join,apply=Reflect.apply;
 assert.equal(m.apply_reference(),apply);
 const routes=[
  ['direct',(method,value,args)=>m.reflected_only(method,value,args)],
  ['funcall',(method,value,args)=>m.reflected_funcall(method,value,args)],
  ['spread',(method,value,args)=>m.reflected_spread([method,value,args])],
  ['namespace',(method,value,args)=>m.namespace_apply(Reflect,method,value,args)],
  ['dot',(method,value,args)=>m.dotted_apply(Reflect,method,value,args)],
  ['shadow',(method,value,args)=>m.shadowed_apply(Reflect,method,value,args)],
 ];
 for(const[name,run]of routes){
  assert.equal(run(join,['a','b'],['|']),'a|b',name);
  const cycle=[];cycle.push(cycle);
  assert.throws(()=>run(join,cycle,['|']),error=>error instanceof TypeError&&error.eliscriptDiagnostic?.code==='ELI-RT0009',name);
  cycle[0]='recovered';assert.equal(run(join,cycle,['|']),'recovered',name);
  let reads=0;assert.throws(()=>run(false,[],{get length(){reads++;throw Error('target must be checked first');}}),TypeError);
  assert.equal(reads,0,name+' noncallable target precedes argument-list reads');
 }
 const trace=[],result={},method={},value={},args={},owner={};
 const original=function(...actual){assert.equal(this,owner);assert.deepEqual(actual,[method,value,args]);trace.push('call');return result;};
 Object.defineProperty(owner,'apply',{configurable:true,get(){trace.push('get');return original;}});
 assert.equal(m.namespace_reference(owner),original,'a first-class qualified reference keeps exact identity');trace.length=0;
 assert.equal(m.captured_apply(owner,()=>{trace.push('method');Object.defineProperty(owner,'apply',{value:false,configurable:true});return method;},()=>{trace.push('value');return value;},()=>{trace.push('args');return args;}),result);
 assert.deepEqual(trace,['get','method','value','args','call']);
 for(const run of[m.namespace_apply,m.dotted_apply,m.shadowed_apply]){
  Object.defineProperty(owner,'apply',{value:original,writable:true,configurable:true});assert.equal(run(owner,method,value,args),result,'custom namespace apply retains its receiver');
 }
 const thrown={},failure={get apply(){trace.push('throw');throw thrown;}},later=()=>{throw Error('arguments must not run');};
 assert.throws(()=>m.captured_apply(failure,later,later,later),error=>error===thrown);
 for(const nullish of[null,undefined])assert.throws(()=>m.captured_apply(nullish,later,later,later),TypeError);
}
test('qualified apply calls capture the actual namespace property without changing first-class identity or argument order',async()=>{
 const input=resolve(directory,'qualified-apply.eli'),output=resolve(directory,'qualified-apply.mjs');
 await writeFile(input,qualifiedApplySource);
 const javascript=compiler.compile_string(qualifiedApplySource,input);
 assert(javascript.includes('c as __eliscript_at'),'qualified calls alone require the shared dispatch import');
 await checkQualifiedApply(await load(javascript));
 const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});
 assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),javascript);
 for(const host of['node','bun']){
  const child=spawnSync(host,['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(process.argv[1]);(${checkQualifiedApply.toString()})(m);`,pathToFileURL(output).href],{encoding:'utf8',timeout:30000});
  assert.equal(child.status,0,host+': '+child.stderr);
 }
},30000);
test('public Seed IR output matches bootstrap and Node and Bun execute the same method-order oracles',async()=>{const input=resolve(directory,'source.eli'),output=resolve(directory,'source.mjs');await writeFile(input,source);const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),compiler.compile_string(source,input));await writeFile(output,(await readFile(output,'utf8')).replaceAll('from \"eliscript/runtime/literals.mjs\"','from '+JSON.stringify(pathToFileURL(resolve('runtime/literals.mjs')).href)));for(const host of['node','bun']){const child=spawnSync(host,['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(process.argv[1]);await (${check.toString()})(m);`,pathToFileURL(output).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,host+': '+child.stderr);}});
test('legacy Seed emits direct calls for scalar literals and keeps raw, keyword, identifiers and calls on the capture path',()=>{const forms=['(js-call value :join)','(js-call value :join "|" 0 -0.0 nil t false undefined)','(js-call (funcall receiver) (funcall key) "|")','(js-call value :join separator)','(js-call value :join :separator)','(js-call value :join (js* "\'|\'"))','(js-call value :join (funcall next))'];const script=`(progn (require 'json) (require 'eliscript-emitter) (princ (json-serialize (vconcat (mapcar (lambda (text) (eliscript-emitter-emit-expression (car (read-from-string text)))) (json-parse-string (getenv "ELISCRIPT_LITERAL_FORMS") :array-type 'list))))))`;const child=spawnSync(process.env.EMACS??'emacs',['--batch','-Q','-L','compiler','--eval',script],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_LITERAL_FORMS:JSON.stringify(forms)}});assert.equal(child.status,0,child.stderr);const results=JSON.parse(child.stdout);results.forEach((code,index)=>assert(code.includes(index<3?'__eliscript_at_direct(':'__eliscript_at('),code));});
test('the new direct alias remains reserved in bindings and references',()=>{for(const input of['(defconst __eliscript_at_direct 1)','(defun alias () __eliscript_at_direct)'])assert.throws(()=>compiler.compile_string(input,'reserved.eli'),/reserved compiler prefix|unbound symbol/);});
