import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
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
(export empty literals computed reference effect extra getter raw tagged allocated quoted thrown pending text)`;
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-literal-method-'));const out=resolve(directory,'compiler'),build=spawnSync(resolve('bin/eliscript-bootstrap'),[],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:out}});assert.equal(build.status,0,build.stderr);compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
const load=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
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
}
test('literal direct calls and effectful captured calls preserve independent native lookup, this, identity, error and await order',async()=>{await check(await load(compiler.compile_string(source,'literal-method.eli')));});
test('public Seed IR output matches bootstrap and Node and Bun execute the same method-order oracles',async()=>{const input=resolve(directory,'source.eli'),output=resolve(directory,'source.mjs');await writeFile(input,source);const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),compiler.compile_string(source,input));await writeFile(output,(await readFile(output,'utf8')).replaceAll('from \"eliscript/runtime/literals.mjs\"','from '+JSON.stringify(pathToFileURL(resolve('runtime/literals.mjs')).href)));for(const host of['node','bun']){const child=spawnSync(host,['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(process.argv[1]);await (${check.toString()})(m);`,pathToFileURL(output).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,host+': '+child.stderr);}});
test('legacy Seed emits direct calls for scalar literals and keeps raw, keyword, identifiers and calls on the capture path',()=>{const forms=['(js-call value :join)','(js-call value :join "|" 0 -0.0 nil t false undefined)','(js-call (funcall receiver) (funcall key) "|")','(js-call value :join separator)','(js-call value :join :separator)','(js-call value :join (js* "\'|\'"))','(js-call value :join (funcall next))'];const script=`(progn (require 'json) (require 'eliscript-emitter) (princ (json-serialize (vconcat (mapcar (lambda (text) (eliscript-emitter-emit-expression (car (read-from-string text)))) (json-parse-string (getenv "ELISCRIPT_LITERAL_FORMS") :array-type 'list))))))`;const child=spawnSync(process.env.EMACS??'emacs',['--batch','-Q','-L','compiler','--eval',script],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_LITERAL_FORMS:JSON.stringify(forms)}});assert.equal(child.status,0,child.stderr);const results=JSON.parse(child.stdout);results.forEach((code,index)=>assert(code.includes(index<3?'__eliscript_at_direct(':'__eliscript_at('),code));});
test('the new direct alias remains reserved in bindings and references',()=>{for(const input of['(defconst __eliscript_at_direct 1)','(defun alias () __eliscript_at_direct)'])assert.throws(()=>compiler.compile_string(input,'reserved.eli'),/reserved compiler prefix|unbound symbol/);});
