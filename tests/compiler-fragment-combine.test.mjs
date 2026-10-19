import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
let directory,compiler,emitterModule,source,code,m;
// Independent snapshot of the original combine algorithm. Nullish indexed
// values follow js-nth, and String conversion remains before concatenation.
function oracle(parts){let text='';const marks=[];let partIndex=0;while(partIndex<parts.length){const part=parts[partIndex]??null,fragment=typeof part==='string'?{text:part,marks:[]}:part,offset=text.length,fragmentMarks=fragment.marks;let markIndex=0;while(markIndex<fragmentMarks.length){const mark=fragmentMarks[markIndex]??null;marks.push({offset:offset+mark.offset,span:mark.span});markIndex++;}text=String(text)+String(fragment.text);partIndex++;}return{text,marks};}
beforeAll(async()=>{directory=await mkdtemp(resolve(tmpdir(),'eliscript-fragment-combine-'));const out=resolve(directory,'compiler'),child=spawnSync(resolve('bin/eliscript-bootstrap'),[],{encoding:'utf8',timeout:30000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:out}});assert.equal(child.status,0,child.stderr);compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);emitterModule=await import(pathToFileURL(resolve(out,'emitter.mjs')).href);const emitter=await readFile('bootstrap/compiler/emitter.eli','utf8');source='(module fragment.combine\n(defvar function-source-profile false)\n'+['make-fragment','text-fragment','as-fragment','combine'].map(name=>definition(emitter,name)).join('\n')+'\n(export combine))';code=compiler.compile_string(source,'fragment-combine.eli');m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
function check(m){const span={},mark={offset:0,span},fragment={text:'x',marks:[mark]},out=m.combine(['before',fragment]);assert.equal(out.marks[0].span,span);assert.notEqual(out.marks,fragment.marks);assert.notEqual(out.marks[0],mark);assert.equal(mark.offset,0);for(const parts of[[],[''],['a','😀','\ud800'],[{text:'a',marks:[{offset:0,span:{start:3}}]},'|',{text:'😀\nb',marks:[{offset:0,span:false},{offset:2,span:null}]}],['',{text:'',marks:[{offset:'0',span:undefined}]}]])assert.deepEqual(m.combine(parts),oracle(parts));
 const build=()=>{const trace=[],parts=['prefix',null,'old'];let markRead=0;const mark={get offset(){trace.push('offset');return markRead++?'1':0;},get span(){trace.push('span');parts[2]='changed';return{start:1};}};parts[1]={get marks(){trace.push('marks');return new Proxy([mark],{get(t,k,r){trace.push('mark:'+String(k));return Reflect.get(t,k,r);}});},get text(){trace.push('text');return{toString(){trace.push('string');parts.push('tail');return'body';}};}};return{trace,parts:new Proxy(parts,{get(t,k,r){trace.push('part:'+String(k));return Reflect.get(t,k,r);}})};};const left=build(),right=build();assert.deepEqual(m.combine(left.parts),oracle(right.parts));assert.deepEqual(left.trace,right.trace);
 for(const parts of[[null],[undefined],[4],[{}],[{text:'bad',marks:[null]}]]){assert.throws(()=>oracle(parts),TypeError);assert.throws(()=>m.combine(parts),TypeError);}const marker={};assert.throws(()=>m.combine(['ok',{get marks(){throw marker;}}]),e=>e===marker);assert.deepEqual(m.combine(['recovered']),{text:'recovered',marks:[]});
 let state=0x76c91a23;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};for(let n=0;n<256;n++){const parts=Array.from({length:random()%12},()=>{const text=String.fromCharCode(random()%65536)+(random()%2?'😀':'');return random()%2?text:{text,marks:Array.from({length:random()%4},()=>({offset:random()%7,span:{start:random()%17}}))};});assert.deepEqual(m.combine(parts),oracle(parts));}}
test('fragment text, UTF16 offsets, mark identities, getters, mutations, exceptions and random cases retain the original algorithm',()=>{check(m);});
test('public Seed preserves the extracted helper and independent Node and Bun execute its exact oracle',async()=>{const input=resolve(directory,'combine.eli'),output=resolve(directory,'combine.mjs');await writeFile(input,source);const seed=spawnSync(resolve('bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(seed.status,0,seed.stderr);assert.equal(await readFile(output,'utf8'),compiler.compile_string(source,input));for(const host of['node','bun']){const child=spawnSync(host,['--input-type=module','-e',`import assert from 'node:assert/strict';const m=await import(process.argv[1]);${oracle.toString()}\n(${check.toString()})(m);`,pathToFileURL(output).href],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,host+': '+child.stderr);}});

test('function text capture preserves exact Node source and ordinary Source Map marks after success and failure',()=>{
 const input='; 中😀\n(defun outer (x) (lambda (y) (+ x y))) (export outer)',program=compiler.compile_ir_string(input,'function-text.eli');
 const original=emitterModule.emit_module_artifact(program);
 assert(original.marks.length>0,'ordinary emission retains its complete source locations');
 const mapped=emitterModule.emit_module_with_source_map(program,input,'function-text.mjs','function-text.eli');
 const captured=emitterModule.emit_module_function_sources(program);
 assert.equal(captured.javascript,original.text);assert.equal(captured.functions.length,2);
 const pending=[...program.body],functions=new Set();
 while(pending.length){const node=pending.pop();if(['function-declaration','function-expression'].includes(node.kind))functions.add(node);pending.push(...node.children);}
 for(const record of captured.functions){assert(functions.has(record.node));assert.equal(record.sourceText,captured.javascript.slice(record.start,record.end));}
 const node=spawnSync('node',['--input-type=module','-e',"let source='';for await(const chunk of process.stdin)source+=chunk;const m=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));process.stdout.write(JSON.stringify([m.outer.toString(),m.outer(3).toString()]));"],{input:captured.javascript,encoding:'utf8',timeout:30000});
 assert.equal(node.error,undefined);assert.equal(node.status,0,node.stderr);
 assert.deepEqual(captured.functions.map(record=>record.sourceText).sort(),JSON.parse(node.stdout).sort());
 assert.deepEqual(emitterModule.emit_module_artifact(program),original);
 assert.deepEqual(emitterModule.emit_module_with_source_map(program,input,'function-text.mjs','function-text.eli'),mapped);
 const invalid=structuredClone(program);invalid.body[0].kind='unsupported-function-source-node';
 assert.throws(()=>emitterModule.emit_module_function_sources(invalid));
 assert.deepEqual(emitterModule.emit_module_artifact(program),original,'failed capture restores ordinary location collection');
 assert.deepEqual(emitterModule.emit_module_with_source_map(program,input,'function-text.mjs','function-text.eli'),mapped);
});
