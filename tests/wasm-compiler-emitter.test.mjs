import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const originalLocate=(span,output)=>{const fragment=typeof output==='string'?{text:output,marks:[]}:output;const marks=fragment.marks;if(fragment.text.length===0||span==null||span===false||(marks.length>0&&marks[0].offset===0))return fragment;return{text:fragment.text,marks:[{offset:0,span},...marks]};};
let directory,backend,runtime,modules,emitterSource,reference,helpers,bytes;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-emitter-'));backend=await buildBackends({outputRoot:directory});runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');modules=[];
 for(const name of ['symbol','ir','source-map','emitter']){const text=await readFile('bootstrap/compiler/'+name+'.eli','utf8');if(name==='emitter')emitterSource=text;modules.push({id:name+'.mjs',program:backend.compiler.compile_ir_string(text,name+'.eli')});}
 const originalText=backend.compiler.emit_ir_string(originalProgram());
 assert(originalText.includes('/^!![A-Za-z_$][A-Za-z0-9_$]*$/'));
 const importJS=code=>import('data:text/javascript;base64,'+Buffer.from(code.replace(/from "[.]\/([^"\n]+)"/g,(_,name)=>'from '+JSON.stringify(pathToFileURL(resolve(directory,'bootstrap',name)).href))).toString('base64'));
 reference=await importJS(originalText);
 const exposed=emitterSource.trimEnd().slice(0,-1)+'\n(export native-locate boolean-reference-text-p))';helpers=await importJS(backend.compiler.emit_ir_string(backend.compiler.compile_ir_string(exposed,'emitter-helpers.eli')));
 const entry=backend.compiler.compile_ir_string('(import "./emitter.mjs" emit-module emit-module-numeric emit-module-artifact emit-module-with-source-map) (defun run (text mode source) (let ((program (JSON/parse text))) (cond ((= mode 0) (emit-module program)) ((= mode 1) (JSON/stringify (emit-module-artifact program))) ((= mode 2) (emit-module-numeric program)) (t (JSON/stringify (emit-module-with-source-map program source "out.mjs" "input.eli")))))) (defun recover () 7) (export run recover)','emitter-entry.eli');
 bytes=artifact({id:'entry.mjs',program:entry});
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function originalProgram(){
 const flatten=nodes=>nodes.flatMap(n=>n.kind==='module-declaration'?flatten(n.children):[n]),program=structuredClone(modules.at(-1).program),nodes=flatten(program.body);
 for(const[name,source]of[['native-locate',originalLocate.toString()],['boolean-reference-text-p','(text) => /^!![A-Za-z_$][A-Za-z0-9_$]*$/.test(text)']]){
  const raw=flatten(backend.compiler.compile_ir_string('(defconst '+name+' (js* '+JSON.stringify(source)+'))','original-helper.eli').body)[0],target=nodes.find(n=>n.value===name);assert(target);Object.assign(target,raw);
 }return program;
}
function artifact(extra){const all=extra?[...modules,extra]:modules,frozen=JSON.stringify(all),bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(all,extra?.id??'emitter.mjs',runtime));assert.equal(JSON.stringify(all),frozen);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return bytes;}
function finish(a,values=[]){for(const value of values)a.release(value);a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('the entire actual Emitter and symbol IR source-map dependency modules compile and initialize in zero-import WASM',()=>{const a=instantiateManagedRuntime(artifact());a.auto(1);finish(a);});

const corpus=['(defconst x 1) (export x)','(defconst zero -0.0)','(defun run (x) (if (js* "!!x") 1 2))','(defun run (x) (if x (+ x 1) 0)) (export run)','(defun run (x) (let* ((a (+ x 1)) (b (+ a 2))) (* a b)))','(defun run (x) (try (throw x) (catch [a nil b &rest tail] (js-array a b tail)) (finally (+ 1 2))))','(defun run (x) (cond ((= x 1) "one") ((= x 2) "two") (t "other")))','(defun run (x) (js-call (js-array x 2) :join ","))','(defun run () (js-object :emoji "中😀\\ud800"))','(defun run (x) (while (> x 0) (setq x (- x 1))) x)'];
function programJSON(value){if(typeof value==='number'&&Object.is(value,-0))return'-0';if(Array.isArray(value))return'['+value.map(programJSON).join(',')+']';if(value!==null&&typeof value==='object')return'{'+Object.keys(value).filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+programJSON(value[key])).join(',')+'}';return JSON.stringify(value);}
function expected(program,mode,source){return mode===0?reference.emit_module(program):mode===1?JSON.stringify(reference.emit_module_artifact(program)):mode===2?reference.emit_module_numeric(program):JSON.stringify(reference.emit_module_with_source_map(program,source,'out.mjs','input.eli'));}
function runSource(a,source,mode){const program=backend.compiler.compile_ir_string(source,'input.eli'),text=programJSON(program),input=a.string(text),m=a.number(mode),src=a.string(source);try{const out=a.invoke('run',[input,m,src]);try{return a.readString(out);}finally{a.release(out);}}finally{for(const value of[input,m,src])a.release(value);}}
test('whole Emitter emits exact JavaScript fragments marks numeric output and source maps for existing syntax',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:262144});a.auto(1);for(const source of corpus)for(let mode=0;mode<4;mode++){const program=backend.compiler.compile_ir_string(source,'input.eli');assert.equal(runSource(a,source,mode),expected(program,mode,source),source+' mode '+mode);}finish(a);
});
test('portable locate keeps original short circuit property read order identity and arrow call contracts',()=>{
 assert.equal(helpers.native_locate.length,2);assert.equal(Object.hasOwn(helpers.native_locate,'prototype'),false);assert.throws(()=>Reflect.construct(String,[],helpers.native_locate),TypeError);
 for(const span of[undefined,null,false,true,0,'',NaN,{line:1}])for(const output of['','x',{text:'x',marks:[]},{text:'x',marks:[{offset:0}]},{text:'x',marks:[{offset:1}]}]){const actual=helpers.native_locate(span,output),expected=originalLocate(span,output);assert.deepEqual(actual,expected);assert.equal(actual===output,expected===output);if(actual!==output&&actual.marks.length>1)assert.equal(actual.marks[1],output.marks[0]);}
 for(const fn of[helpers.native_locate,originalLocate])for(const args of[[],[1],[1,null],[1,false],[1,{text:'x',marks:null}]])assert.throws(()=>fn(...args),TypeError);
 const observe=fn=>{const trace=[],marks={get length(){trace.push('length');return 0;},[Symbol.iterator](){trace.push('iterator');let once=false;return{next(){trace.push('next');if(once)return{done:true};once=true;return{value:7,done:false};}};}},fragment={get marks(){trace.push('marks');return marks;},get text(){trace.push('text');return'x';}};return{out:fn(1,fragment),trace};};assert.deepEqual(observe(helpers.native_locate),observe(originalLocate));
});
test('portable boolean text recognition matches the original trimmed ASCII regular expression',()=>{
 let state=0x718f23;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;const values=['!!x','!!$','!!_0','!!0','!!',' !!x\n','!!中','!!a-b','!!a\ud800','!!a\n'];for(let n=0;n<96;n++){let value='';for(let i=0,count=next()%9;i<count;i++)value+=String.fromCharCode(next()%256);values.push(value);}
 for(const value of values){const trimmed=value.trim();assert.equal(helpers.boolean_reference_text_p(trimmed),/^!![A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed),JSON.stringify(value));}
});

test('locate creates own mark entries even when a deeper Array prototype index is nonwritable',()=>{
 const saved=Object.getOwnPropertyDescriptor(Array.prototype,'1'),output={text:'x',marks:[{offset:1,span:false}]};let actual,expected,error;
 try{Object.defineProperty(Array.prototype,'1',{value:9,writable:false,configurable:true});expected=originalLocate(true,output);try{actual=helpers.native_locate(true,output);}catch(caught){error=caught;}}
 finally{if(saved)Object.defineProperty(Array.prototype,'1',saved);else delete Array.prototype[1];}
 assert.equal(error?.name,undefined);assert.deepEqual(actual,expected);
});

test('small deterministic existing source variants keep full emitter JavaScript output unchanged',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:262144});a.auto(1);let seed=0x5198c1;for(let i=0;i<12;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const source='(defun value'+i+' (x) (let* ((a (+ x '+seed%17+')) (b (* a '+(1+seed%5)+'))) (if (> b 0) b (- b))))';const program=backend.compiler.compile_ir_string(source,'input.eli');assert.equal(runSource(a,source,0),expected(program,0,source));}finish(a);
});
test('bounded whole emitter failure preserves caller frames and a subsequent source call recovers',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:1024,initialBytes:262144}),caller=a.frame(1);a.auto(1);a.frameSet(caller,0,true);assert.throws(()=>runSource(a,corpus.find(source=>source.includes('(catch [')),1),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);const out=a.invoke('recover');assert.equal(a.readNumber(out),7);a.leaveFrame(caller);finish(a,[out]);
});
test('independent Node executes the same whole emitter WASM and compares original JavaScript output and marks',async()=>{
 const wasm=resolve(directory,'emitter.wasm'),oracle=resolve(directory,'bootstrap/emitter-original.mjs');await writeFile(wasm,bytes);
 await writeFile(oracle,backend.compiler.emit_ir_string(originalProgram()));
 const cases=corpus.map(source=>({source,program:backend.compiler.compile_ir_string(source,'input.eli')})),script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const {instantiateManagedRuntime}=await import(process.argv[1]),reference=await import(process.argv[2]),a=instantiateManagedRuntime(readFileSync(process.argv[3]),{maxSlots:8192,initialBytes:262144});a.auto(1);',expected.toString(),programJSON.toString(),finish.toString(),'for(const{source,program}of '+programJSON(cases)+')for(let mode=0;mode<4;mode++){const input=a.string(programJSON(program)),m=a.number(mode),src=a.string(source),out=a.invoke("run",[input,m,src]);assert.equal(a.readString(out),expected(program,mode,source));for(const value of[input,m,src,out])a.release(value);}finish(a);'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(oracle).href,wasm],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

const prefixSource=`(defconst prefix (js* "(head, tail) => [head, ...tail]"))
 (defun invoke-prefix (&rest args) (apply prefix args))
 (defun safe-prefix (&rest args) (try (JSON/stringify (apply prefix args)) (catch error (aref error "name"))))
 (defun recover-prefix () 7)
 (defun prototype-prefix ()
  (let ((prototype globalThis.Array.prototype) (tail (js-array false)))
   (put tail :length 2) (put prototype "1" 9) (Object/freeze prototype)
   (let ((result (prefix t tail))) (JSON/stringify (js-array result (Object/keys result) (Object/hasOwn result "1"))))))
 (defun protocol-prefix (mode)
  (let ((trace (js-array)) (marker (js-object)) (iterator nil) (source (js-object)) (n 0))
   (setq iterator (js-object :next (lambda ()
    (js-call trace :push (str "next" n))
    (when (or (= mode 1) (and (= mode 2) (= n 1))) (throw marker))
    (when (= mode 7) (put iterator :next false))
    (setq n (1+ n))
    (if (= mode 3) false (js-object :done (> n 1) :value n)))
    :return (lambda () (js-call trace :push "return") (js-object))))
   (put source (js* "Symbol.iterator") (if (= mode 5) false
    (lambda () (js-call trace :push "iterator") (if (= mode 4) false iterator))))
   (let ((out (try (prefix (progn (js-call trace :push "head") t)
                    (progn (js-call trace :push "tail") (if (= mode 6) nil source))
                    (progn (js-call trace :push "extra") false))
               (catch error (if (Object/is error marker) "marker" (aref error "name"))))))
    (JSON/stringify (js-array out trace)))))
 (export prefix invoke-prefix safe-prefix recover-prefix prototype-prefix protocol-prefix)`;
let prefixProgram,prefixBytes;
function prefixArtifact(){prefixProgram??=backend.compiler.compile_ir_string(prefixSource,'array-prefix.eli');if(!prefixBytes){const frozen=JSON.stringify(prefixProgram);prefixBytes=Uint8Array.from(backend.managed.emit_managed_wasm(prefixProgram,runtime));assert.equal(JSON.stringify(prefixProgram),frozen);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(prefixBytes)),[]);}return prefixBytes;}
test('generic array prefix spread primitive accepts arbitrary head identity and iterable tail without imports',()=>{
 const a=instantiateManagedRuntime(prefixArtifact());a.auto(1);const head=a.sourceObject({x:true}),tail=a.sourceArray([false,undefined]),out=a.invoke('prefix',[head,tail]),first=a.get(out,0);assert(a.keyEqual(first,head));assert.equal(a.length(out),3);assert.equal(a.get(out,1),false);assert.equal(a.get(out,2),undefined);finish(a,[head,tail,out,first]);
});

test('prefix spread preserves missing and ignored arguments ordinary source errors and UTF16 iteration',async()=>{
 const a=instantiateManagedRuntime(prefixArtifact());a.auto(1);const js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(prefixProgram)).toString('base64'));assert.equal(js.prefix.length,2);assert.equal(Object.hasOwn(js.prefix,'prototype'),false);assert.throws(()=>Reflect.construct(String,[],js.prefix),TypeError);
 for(const args of[[],[true],[true,null],[true,undefined],[true,false],[true,3],[undefined,'中😀\ud800'],[false,'']]){const boxed=args.map(value=>typeof value==='number'?a.number(value):typeof value==='string'?a.string(value):value),out=a.invoke('safe-prefix',boxed);assert.equal(a.readString(out),js.safe_prefix(...args));for(const value of[...boxed,out])a.release(value);}finish(a);
});
test('prefix iterator lookup extra argument effects cached next and abrupt-step no-close order match original JS',async()=>{
 const a=instantiateManagedRuntime(prefixArtifact());a.auto(1);const js=await import('data:text/javascript;base64,'+Buffer.from(backend.compiler.emit_ir_string(prefixProgram)).toString('base64'));
 for(let mode=0;mode<8;mode++){const m=a.number(mode),out=a.invoke('protocol-prefix',[m]);assert.equal(a.readString(out),js.protocol_prefix(mode),'mode '+mode);a.release(m);a.release(out);}finish(a);
});
test('prefix creates own slots over a frozen canonical Array prototype without changing inherited tail Get',()=>{
 const a=instantiateManagedRuntime(prefixArtifact());a.auto(1);const out=a.invoke('prototype-prefix'),child=spawnSync('node',['--input-type=module','-e','import vm from "node:vm";console.log(vm.runInNewContext(`const prefix=(head,tail)=>[head,...tail],tail=[false];tail.length=2;Array.prototype[1]=9;Object.freeze(Array.prototype);const result=prefix(true,tail);JSON.stringify([result,Object.keys(result),Object.hasOwn(result,"1")])`));'],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);assert.equal(a.readString(out),child.stdout.trim());finish(a,[out]);
});
test('prefix OOM preserves caller-owned roots and recovery while a real append trap unwinds only private frames',async()=>{
 const a=instantiateManagedRuntime(prefixArtifact(),{maxSlots:64,initialBytes:16384,maxBytes:65536});a.auto(1);const head=a.sourceObject({x:true}),tail=a.sourceArray(Array(48).fill(true)),caller=a.frame(2);a.frameSet(caller,0,head);a.frameSet(caller,1,tail);const padding=[];try{for(let i=0;i<128;i++)padding.push(a.number(i));}catch(error){assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0002');}assert.throws(()=>a.invoke('prefix',[head,tail]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);for(const value of padding)a.release(value);a.collect();const out=a.invoke('prefix',[head,tail]);assert.equal(a.length(out),49);a.leaveFrame(caller);finish(a,[head,tail,out]);
 const text=await readFile('bootstrap/runtime/memory.eli','utf8'),first=text.indexOf('  (defun heap-text-array-append '),last=text.indexOf('  (defun heap-text-split-regexp ',first);assert(first>=0&&last>first);const injected=backend.compiler.compile_ir_string(text.slice(0,first)+'  (defun heap-text-array-append (heap array child) (load-u32 4294967295))\n'+text.slice(last),'prefix-append-trap.eli'),artifact=Uint8Array.from(backend.managed.emit_managed_wasm(prefixProgram,injected));assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(artifact)),[]);
 const b=instantiateManagedRuntime(artifact);b.auto(1);const h=b.sourceObject({}),t=b.sourceArray([true]),frame=b.frame(2);b.frameSet(frame,0,h);b.frameSet(frame,1,t);assert.throws(()=>b.invoke('prefix',[h,t]),WebAssembly.RuntimeError);assert.equal(b.stats().frameDepth,1);const recovered=b.invoke('recover-prefix');assert.equal(b.readNumber(recovered),7);b.leaveFrame(frame);finish(b,[h,t,recovered]);
});

test('Seed-produced JavaScript emitter and the original helper oracle retain the same small-program output',()=>{
 for(const source of corpus.slice(0,4)){const program=backend.compiler.compile_ir_string(source,'input.eli');assert.equal(backend.compiler.emit_ir_string(program),expected(program,0,source));assert.equal(JSON.stringify(backend.compiler.emit_ir_string_with_source_map(program,source,'out.mjs','input.eli')),expected(program,3,source));}
});
test('whole emitter rejects original malformed IR kinds with exact source error messages and recovers',()=>{
 const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:262144});a.auto(1);
 for(const kind of['unknown-top-level','import-namespace']){const program=backend.compiler.compile_ir_string('(defconst x 1)','input.eli');program.body[0].kind=kind;let expected;try{reference.emit_module(program);}catch(error){expected=error.message;}assert.equal(typeof expected,'string');const input=a.string(JSON.stringify(program)),mode=a.number(0),source=a.string('');let thrown;try{a.invoke('run',[input,mode,source]);assert.fail('must throw');}catch(error){thrown=error;}assert.equal(thrown.kind,13);const key=a.string('message'),message=a.objectGet(thrown,key);assert.equal(a.readString(message),expected);for(const value of[input,mode,source,thrown,key,message])a.release(value);assert.equal(a.stats().frameDepth,0);const recovered=a.invoke('recover');assert.equal(a.readNumber(recovered),7);a.release(recovered);}finish(a);
});

test('prefix raw ABI rejects mismatched counts invalid stale private and unsealed values with original codes and caller frames intact',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(prefixArtifact())).exports,h=e['heap-new'](128,32768,65536),args=e['value-refs'](h,7,2),tail=e['value-array-new'](h,1),frame=e['frame-new'](h,1);e['frame-set'](h,frame,0,args);e['value-set'](h,args,0,2);e['value-set'](h,args,1,tail);
 for(const[argument,count,mode,code]of[[args,1,2,3],[args,2,3,3],[4294967295,2,2,1],[frame,2,2,1]]){assert.equal(e['value-iterate-intrinsic'](h,argument,count,mode),0);assert.equal(e['last-error'](),code);assert.equal(e['frame-depth'](h),1);}
 const stale=e['value-number'](h,0,0);e['heap-collect'](h);const offset=e['value-data'](h,args,7);for(const[value,code]of[[frame,3],[4294967295,1],[stale,1]]){new DataView(e.memory.buffer).setUint32(offset,value,true);assert.equal(e['value-iterate-intrinsic'](h,args,2,2),0);assert.equal(e['last-error'](),code);assert.equal(e['frame-depth'](h),1);}new DataView(e.memory.buffer).setUint32(offset,2,true);
 const unsealed=e['value-string'](h,1);e['value-set'](h,args,1,unsealed);assert.equal(e['value-iterate-intrinsic'](h,args,2,2),0);assert.equal(e['last-error'](),6);e['value-set'](h,args,1,tail);const out=e['value-iterate-intrinsic'](h,args,2,2);assert.equal(e['last-error'](),0);assert.equal(e['value-length'](h,out),2);assert.equal(e['value-get'](h,out,0),2);e['frame-pop'](h,frame);e['value-standard-prototypes-close'](h);e['heap-collect'](h);assert.equal(e['heap-live'](h),0);
});
