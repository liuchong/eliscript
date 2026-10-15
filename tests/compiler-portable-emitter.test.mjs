import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildBackends, root } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

// The original indexed algorithm is the independent oracle, including its
// property reads and native + conversion. It intentionally differs from the
// older character-by-character reference on unordered or nonnumeric marks.
const oracle = (input) => { const source = input.text; const sourceMarks = input.marks; const parts = source.split('\n'); const marks = []; let start = 0; let added = 0; let markIndex = 0; let mark = sourceMarks[0]; for (let index = 0; index < parts.length; index += 1) { const line = parts[index]; const end = start + line.length + (index + 1 < parts.length ? 1 : 0); if (line.length > 0) { parts[index] = '  ' + line; added += 2; } while (mark !== undefined && mark.offset >= start && mark.offset < end) { marks.push({ offset: mark.offset + added, span: mark.span }); markIndex += 1; mark = sourceMarks[markIndex]; } start = end; } return { text: parts.join('\n'), marks }; };
let directory, backend, runtime, source, program, bytes, js;
function isolate(text) {
  const start = text.search(/  \(def(?:const|un) native-indent[\s\n]/);
  const end = text.indexOf('  (defun indent ', start);
  assert(start >= 0 && end > start);
  return '(module portable.emitter (defconst marker 1)\n' + text.slice(start, end) + '\n(export native-indent))';
}
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-portable-emitter-'));
  backend = await buildBackends({ outputRoot: directory });
  runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  source = isolate(await readFile('bootstrap/compiler/emitter.eli', 'utf8'));
  program = backend.compiler.compile_ir_string(source, 'portable-emitter.eli');
  js = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
function emit(p = program, rt = runtime) {
  const saved = JSON.stringify(p);
  const out = Uint8Array.from(backend.managed.emit_managed_wasm(p, rt));
  assert.equal(JSON.stringify(p), saved);
  assert(WebAssembly.validate(out));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(out)), []);
  return out;
}
function box(a, value) {
  if (typeof value === 'number') return a.number(value);
  if (typeof value === 'string') return a.string(value);
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  const children = Array.isArray(value) ? value.map(v => box(a, v)) : Object.fromEntries(Object.entries(value).map(([k,v]) => [k,box(a,v)]));
  const result = Array.isArray(value) ? a.sourceArray(children) : a.sourceObject(children);
  Object.values(children).forEach(v => a.release(v));
  return result;
}
function read(a, value) {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (value.kind === 4) return a.readNumber(value);
  if (value.kind === 5) return a.readString(value);
  if ([7,14].includes(value.kind)) return Array.from({ length: a.length(value) }, (_, i) => { const x = a.get(value,i); try { return read(a,x); } finally { a.release(x); } });
  const keys = a.objectKeys(value), result = {};
  try { for (let i=0;i<a.length(keys);i++) { const key=a.get(keys,i);try { const x=a.objectGet(value,key);try {result[a.readString(key)]=read(a,x);}finally{a.release(x);} } finally {a.release(key);} } } finally {a.release(keys);}
  return result;
}
function invoke(a, input) { const argument=box(a,input);try{const out=a.invoke('native-indent',[argument]);try{return read(a,out);}finally{a.release(out);}}finally{a.release(argument);} }
function finish(a) { a.closeModule(); a.collect(); assert.equal(a.stats().frameDepth,0); assert.equal(a.live(),0); }

test('native indent retains original const arrow arity and cannot be a constructor or newTarget', () => {
  assert.equal(js.native_indent.length, oracle.length);
  assert.equal(Object.hasOwn(js.native_indent, 'prototype'), false);
  assert.throws(() => Reflect.construct(function () {}, [], js.native_indent), TypeError);
});

test('indexed indent emits executable zero-import WASM rather than raw JavaScript', () => { bytes=emit(); const a=instantiateManagedRuntime(bytes);a.auto(1);assert.deepEqual(invoke(a,{text:'a\n😀b\n',marks:[{offset:0,span:{start:0}},{offset:2,span:null},{offset:6,span:false}]}),oracle({text:'a\n😀b\n',marks:[{offset:0,span:{start:0}},{offset:2,span:null},{offset:6,span:false}]}));finish(a); });

test('indexed indent keeps UTF16, empty lines, EOF and unordered or invalid mark offsets exactly', () => {
  const a=instantiateManagedRuntime(bytes??emit());a.auto(1);
  const offsets=[0,-0,1,2,3,4,5,9,-1,NaN,Infinity,-Infinity,.5,'0','1',null,false,true,undefined];
  for(const text of['','\n','\n\n','a','a\n','\na','a\n\nb','中😀\ud800\n\udfffZ']) {
    for(const offset of offsets) for(const tail of[[],[{offset:0,span:'late'}],[{offset:99,span:undefined}]]) {const input={text,marks:[{offset,span:'first'},...tail]};assert.deepEqual(js.native_indent(input),oracle(input));assert.deepEqual(invoke(a,input),oracle(input));}
    const marks=Array.from({length:text.length+2},(_,offset)=>({offset,span:{start:offset}}));const input={text,marks};assert.deepEqual(invoke(a,input),oracle(input));
  }
  finish(a);
});

test('indexed indent reads getters, changing offsets and dynamic length in original order and preserves nullish errors', () => {
  const build=()=>{const trace=[];let calls=0;const mark={get offset(){trace.push('offset');return calls++<2?0:'0';},get span(){trace.push('span');return 'value';}};const marks=new Proxy([mark],{get(t,k,r){trace.push('marks:'+String(k));return Reflect.get(t,k,r);}});const source={split(separator){trace.push('split:'+separator);return new Proxy(['a','b'],{get(t,k,r){trace.push('parts:'+String(k));return Reflect.get(t,k,r);},set(t,k,v,r){trace.push('set:'+String(k));return Reflect.set(t,k,v,r);}});}};return{trace,input:{get text(){trace.push('text');return source;},get marks(){trace.push('marks');return marks;}}};};
  const left=build(),right=build();assert.deepEqual(js.native_indent(left.input),oracle(right.input));assert.deepEqual(left.trace,right.trace);
  for(const input of[undefined,null,{}, {text:null,marks:[]},{text:'a',marks:null},{text:'a',marks:[null]}]){let expected;try{oracle(input);}catch(e){expected=e;}assert(expected instanceof TypeError);assert.throws(()=>js.native_indent(input),TypeError);}
  assert.throws(()=>js.native_indent(),TypeError);
});

test('deterministic random Unicode and mixed mark values match the raw oracle under collection at every allocation', () => {
  const a=instantiateManagedRuntime(bytes??emit());a.auto(1);let state=0x195819ab;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0,pool=['a','中','😀','\ud800','\udfff','\n','\t'];
  for(let n=0;n<200;n++){const text=Array.from({length:next()%40},()=>pool[next()%pool.length]).join(''),marks=Array.from({length:next()%20},()=>({offset:next()%(text.length+5),span:next()%3?next()%99:null}));if(next()%2)marks.sort((a,b)=>a.offset-b.offset);const input={text,marks};assert.deepEqual(invoke(a,input),oracle(input));}
  assert(a.stats().collections>100);finish(a);
});

test('WASM indent preserves offset coercion effects, sparse mark stopping and its original string addition', async () => {
  const extra=String.raw`
  (defun effects ()
    (let* ((trace (js-object :events ""))
           (offset (js-object :valueOf (lambda () (put trace :events (+ (aref trace "events") "v")) "0")))
           (mark (js-object :offset offset :span "kept"))
           (fragment (js-object :text "a\nb" :marks (js-array mark))))
      (let ((out (native-indent fragment)))
        (js-array out (aref trace "events")))))
  (defun split-effects ()
    (let* ((trace (js-object :events ""))
           (parts (js-array "a" "b"))
           (text (js-object :split (lambda (separator)
                   (put trace :events (+ (aref trace "events") separator)) parts)))
           (fragment (js-object :text text :marks (js-array (js-object :offset 0 :span 7)))))
      (js-array (native-indent fragment) (aref trace "events"))))
  `;
  const text=source.replace('(export native-indent))',extra+'(export native-indent effects split-effects))'),p=backend.compiler.compile_ir_string(text,'indent-effects.eli'),a=instantiateManagedRuntime(emit(p));a.auto(1);
  const module=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(p)).toString('base64'));
  for(const name of['effects','split-effects']){let out;try{out=a.invoke(name);assert.deepEqual(read(a,out),module[name.replaceAll('-','_')]());}catch(error){error.message=name+': '+error.message;throw error;}finally{a.release(out);}}
  const traced={text:'a\nb',marks:[{offset:{valueOf(){return '0';}},span:'kept'}]};assert.deepEqual(module.effects()[0],oracle(traced));assert.equal(module.effects()[1],'vvv');
  const sparse={text:'a\nb',marks:[, {offset:2,span:'unvisited'}]};assert.deepEqual(invoke(a,sparse),oracle(sparse));finish(a);
});

test('nullish, invalid handles and capacity failures unwind only their own frames and recover without leaking roots', () => {
  const a=instantiateManagedRuntime(bytes??emit(),{maxSlots:256});a.auto(1);
  for(const input of[undefined,null,{}, {text:null,marks:[]},{text:'a',marks:null},{text:'a',marks:[null]}])assert.throws(()=>invoke(a,input),e=>['ELI-RT0001','ELI-RT0003'].includes(e.eliscriptDiagnostic?.code));
  assert.throws(()=>a.invoke('native-indent'),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
  const input=box(a,{text:'a\nb',marks:[{offset:0,span:'span'}]}),frame=a.frame(1);a.frameSet(frame,0,input);
  for(const invalid of[{},frame])assert.throws(()=>a.invoke('native-indent',[invalid]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0001');
  assert.equal(a.stats().frameDepth,1);
  const held=[];for(let i=0;i<512;i++){try{held.push(a.number(i));}catch(e){assert.equal(e.eliscriptDiagnostic?.code,'ELI-RT0002');break;}}
  assert(held.length>0&&held.length<512);assert.throws(()=>a.invoke('native-indent',[input]),e=>e.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);
  held.forEach(v=>a.release(v));a.collect();const out=a.invoke('native-indent',[input]);try{assert.deepEqual(read(a,out),oracle({text:'a\nb',marks:[{offset:0,span:'span'}]}));}finally{a.release(out);}
  const root=a.frameGet(frame,0);a.release(root);a.leaveFrame(frame);a.release(input);finish(a);
});

test('an actual WASM trap in string splitting restores the caller frame and retains its source roots', async () => {
  const raw=await readFile('bootstrap/runtime/memory.eli','utf8'),start=raw.indexOf('  (defun heap-text-split '),end=raw.indexOf('\n  (defun ',start+1);assert(start>=0&&end>start);
  const rt=backend.compiler.compile_ir_string(raw.slice(0,start)+'  (defun heap-text-split (heap text separator argument) (load-u32 4294967295))\n'+raw.slice(end),'indent-trap-runtime.eli');
  const a=instantiateManagedRuntime(emit(program,rt));a.auto(1);const input=box(a,{text:'a',marks:[]}),frame=a.frame(1);a.frameSet(frame,0,input);assert.throws(()=>a.invoke('native-indent',[input]),WebAssembly.RuntimeError);assert.equal(a.stats().frameDepth,1);const root=a.frameGet(frame,0);assert.deepEqual(read(a,root),{text:'a',marks:[]});a.release(root);a.leaveFrame(frame);a.release(input);finish(a);
});

test('Node executes the same zero-import indent bytes against the independent original algorithm', async () => {
  const file=resolve(directory,'indent.wasm');await writeFile(file,bytes??emit());
  const script=`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const{instantiateManagedRuntime}=await import(process.argv[1]);${box.toString()}\n${read.toString()}\n${invoke.toString()}\n${finish.toString()}\nconst oracle=${oracle.toString()},a=instantiateManagedRuntime(readFileSync(process.argv[2]));a.auto(1);let state=0x198231;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;for(let n=0;n<100;n++){const text=Array.from({length:next()%24},()=>['a','😀','中','\\n','\\ud800'][next()%5]).join(''),marks=Array.from({length:next()%12},()=>({offset:next()%(text.length+3),span:next()%7}));if(next()%2)marks.sort((a,b)=>a.offset-b.offset);const input={text,marks};assert.deepEqual(invoke(a,input),oracle(input));}finish(a);`;
  const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve(root,'tools/backends/managed-runtime.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('public Seed plus all 13 compiler modules retain three-generation JS fixed points and identical independent WASM indent bytes', async () => {
  const input=resolve(directory,'portable-emitter.eli'),output=resolve(directory,'portable-emitter-seed.mjs');await writeFile(input,source);
  const child=spawnSync(resolve(root,'bin/eliscript-seed'),['--output',output,input],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
  assert.equal(await readFile(output,'utf8'),backend.compiler.emit_ir_string(program));
  const files=(await readdir('bootstrap/compiler')).filter(file=>file.endsWith('.eli')).sort();assert.equal(files.length,13);
  let compiler=backend.compiler,canonical;
  for(let generation=0;generation<3;generation++){
    const out=resolve(directory,'compiler-generation-'+generation);await mkdir(out,{recursive:true});const emitted=[];
    for(const file of files){const filename=resolve(root,'bootstrap/compiler',file),text=await readFile(filename,'utf8'),target=file.replace(/\.eli$/,'.mjs'),javascript=compiler.compile_string(text,filename);emitted.push([file,javascript]);await writeFile(resolve(out,target),javascript);}
    if(canonical)assert.deepEqual(emitted,canonical);else canonical=emitted;
    const p=compiler.compile_ir_string(source,'portable-emitter.eli');assert.deepEqual(p,program);assert.deepEqual(emit(p),bytes??emit());
    compiler=await import(pathToFileURL(resolve(out,'compiler.mjs')).href);
  }
},120000);

test('throwing and changing custom fragment fields preserve the raw algorithm exact property and method order',()=>{
 function observed(fn,failure){const events=[],hit=(key,value)=>{events.push(key);if(key===failure)throw new RangeError(key);return value;};let reads=0;
  const mark={get offset(){return hit('offset'+(++reads),0);},get span(){return hit('span','kept');}},marks=new Proxy([mark],{get(t,key,r){hit('marks:'+String(key));return Reflect.get(t,key,r);}});
  const line={get length(){return hit('line.length',1);},valueOf(){return hit('line.valueOf','a');},toString(){return hit('line.toString','a');}};
  const parts=new Proxy([line,'b'],{get(t,key,r){hit('parts:'+String(key));return Reflect.get(t,key,r);},set(t,key,value,r){hit('parts.set:'+String(key));return Reflect.set(t,key,value,r);}});
  const text={get split(){hit('split.get');return function(separator){assert.equal(this,text);hit('split.call:'+separator);return parts;};}};
  const input={get text(){return hit('text',text);},get marks(){return hit('marks',marks);}};let out,error;try{out=fn(input);}catch(e){error=[e.constructor.name,e.message];}return{out,error,events};
 }
 for(const failure of[null,'text','marks','split.get','split.call:\n','marks:0','parts:length','parts:0','line.length','line.valueOf','parts.set:0','offset1','offset2','offset3','span','marks:1','parts:join'])assert.deepEqual(observed(js.native_indent,failure),observed(oracle,failure),String(failure));
});

test('missing and extra source arguments retain undefined and complete their effects before fragment property reads',async()=>{
 const extra=`(defun indent-arguments (&rest args) (apply native-indent args))
 (defun indent-extra (fragment trace) (native-indent fragment (put trace :called t) (put fragment :text "changed")))`;
 const text=source.replace('(export native-indent))',extra+'(export native-indent indent-arguments indent-extra))'),p=backend.compiler.compile_ir_string(text,'indent-arguments.eli'),a=instantiateManagedRuntime(emit(p));a.auto(1);
 for(const args of[[],[undefined],[null]]){assert.throws(()=>oracle(...args),TypeError);assert.throws(()=>js.native_indent(...args),TypeError);assert.throws(()=>a.invoke('indent-arguments',args),e=>['ELI-RT0001','ELI-RT0003'].includes(e.eliscriptDiagnostic?.code));assert.equal(a.stats().frameDepth,0);}
 const fragment=box(a,{text:'old',marks:[]}),trace=box(a,{called:false}),out=a.invoke('indent-extra',[fragment,trace]);assert.deepEqual(read(a,out),oracle({text:'changed',marks:[]}));assert.deepEqual(read(a,trace),{called:true});for(const x of[fragment,trace,out])a.release(x);finish(a);
});

test('source spans preserve alias identity and arbitrary cyclic span data while fragments retain their original source fields',()=>{
 const a=instantiateManagedRuntime(bytes??emit());a.auto(1);const span=a.sourceObject({}),self=a.string('self');a.objectSet(span,self,span);const zero=a.number(0),two=a.number(2),first=a.sourceObject({offset:zero,span}),second=a.sourceObject({offset:two,span}),marks=a.sourceArray([first,second]),text=a.string('a\nb'),fragment=a.sourceObject({text,marks}),out=a.invoke('native-indent',[fragment]),marksKey=a.string('marks'),spanKey=a.string('span'),returned=a.objectGet(out,marksKey);
 for(let i=0;i<2;i++){const mark=a.get(returned,i),actual=a.objectGet(mark,spanKey);assert(a.keyEqual(actual,span));const cycle=a.objectGet(actual,self);assert(a.keyEqual(cycle,actual));for(const v of[mark,actual,cycle])a.release(v);}
 assert.equal(a.readString(text),'a\nb');assert.equal(a.length(marks),2);for(const v of[span,self,zero,two,first,second,marks,text,fragment,out,marksKey,spanKey,returned])a.release(v);finish(a);
});

test('represented primitive property reads preserve the original fragment algorithm and JS results',()=>{
 const a=instantiateManagedRuntime(bytes??emit());a.auto(1);
 for(const marks of['','x','中😀\ud800']){const input={text:'a',marks};assert.deepEqual(js.native_indent(input),oracle(input));assert.deepEqual(invoke(a,input),oracle(input));assert.equal(a.stats().frameDepth,0);}
 for(const marks of[false,true,0,-0,NaN,Infinity,-Infinity]){const input={text:'a',marks};assert.deepEqual(js.native_indent(input),oracle(input));assert.deepEqual(invoke(a,input),oracle(input));assert.equal(a.stats().frameDepth,0);}finish(a);
});
