import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
let directory,backend,runtime,modules,reference,reader,bytes;
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-formatter-'));
  backend=await buildBackends({outputRoot:directory});
  modules=await Promise.all(['syntax','reader','formatter'].map(async name=>({id:name+'.mjs',program:backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/'+name+'.eli','utf8'),name+'.eli')})));
  modules.push({id:'entry.mjs',program:backend.compiler.compile_ir_string('(import "./formatter.mjs" formatter-format formatter-version formatter-width formatter-indent format-source) (defun format-observed (source filename) (try (js-array t (format-source source filename)) (catch error (js-array false error)))) (export formatter-format formatter-version formatter-width formatter-indent format-source format-observed)','formatter-entry.eli')});
  runtime=backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
  reference=await import(pathToFileURL(resolve(directory,'bootstrap/formatter.mjs')).href);
  reader=await import(pathToFileURL(resolve(directory,'bootstrap/reader.mjs')).href);
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(){if(bytes)return bytes;const saved=JSON.stringify(modules);bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'entry.mjs',runtime));assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return bytes;}
function decode(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14){const out=[];for(let i=0;i<a.length(value);i++){const child=a.get(value,i);try{out.push(decode(a,child));}finally{a.release(child);}}return out;}if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=decode(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return value;}
function property(a,value,name){const key=a.string(name);try{return a.objectGet(value,key);}finally{a.release(key);}}
function invoke(a,source,filename){const input=typeof source==='string'?a.string(source):typeof source==='number'?a.number(source):source,file=typeof filename==='string'?a.string(filename):typeof filename==='number'?a.number(filename):filename;try{const out=a.invoke('format_observed',[input,file]),passed=a.get(out,0),value=a.get(out,1);try{if(passed)return{value:a.readString(value)};const message=property(a,value,'message'),diagnostic=property(a,value,'eliscriptDiagnostic');try{return{message:a.readString(message),diagnostic:decode(a,diagnostic)};}finally{a.release(message);a.release(diagnostic);}}finally{a.release(out);a.release(value);}}finally{a.release(input);a.release(file);}}
function expected(source,filename){try{return{value:reference.format_source(source,filename)};}catch(error){return{message:error.message,diagnostic:error.eliscriptDiagnostic};}}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
const corpus=['',' ; heading  \n','nil t false undefined','(a [1 -0] {:x "😀\\uD800"} #{x y})',"'x `x ,x ,@x #'fn",';😀\n(module  demo (defun f (x) (if x 1 2)))','(module demo (defun f (x) ;inside  \n(+ x 1)))','#queue ;comment\n[1 2]', '(defun long-function (one two three four five six seven eight nine ten eleven twelve thirteen fourteen) (js-array one two three four five six seven eight nine ten))'];
test('complete formatter reader and syntax modules compile with their real dependencies to zero-import WASM and expose all formatter exports',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:8192,initialBytes:1048576});a.auto(1);
 for(const name of['formatter_format','formatter_version','formatter_width','formatter_indent']){const value=a.getExport(name);assert.deepEqual(decode(a,value),reference[name]);a.release(value);}
 for(const source of corpus){const actual=invoke(a,source,'format😀.eli'),oracle=expected(source,'format😀.eli');assert.deepEqual(actual,oracle,source);assert.deepEqual(invoke(a,actual.value,'format😀.eli'),actual);assert.deepEqual(JSON.parse(JSON.stringify(reader.read_string(actual.value,'same.eli'),(key,value)=>key==='span'?undefined:value)),JSON.parse(JSON.stringify(reader.read_string(source,'same.eli'),(key,value)=>key==='span'?undefined:value)));a.collect();}
 finish(a);
});
test('complete formatter preserves original formatter and reader diagnostics without extracting helper implementations',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:8192,initialBytes:1048576});a.auto(1);
 for(const source of[undefined,null,false,true,42,-0,'(', '[1)',':a/'])for(const filename of[undefined,null,false,0,'','bad.eli'])assert.deepEqual(invoke(a,source,filename),expected(source,filename));
 assert.deepEqual(invoke(a,'(ok 1)','recovered.eli'),expected('(ok 1)','recovered.eli'));finish(a);
});

const originalFailure=(message,filename)=>{const error=new Error(message);error.eliscriptDiagnostic={format:'eliscript-diagnostic',version:1,code:'ELI-F0001',severity:'error',phase:'formatter',message,...(filename?{location:{file:filename}}:{})};throw error;};
const flatten=nodes=>nodes.flatMap(node=>node.kind==='module-declaration'?flatten(node.children):[node]);
test('formatter diagnostic helper retains original arrow identity message conversion and native JS filename truth',async()=>{
 const formatter=modules.find(item=>item.id==='formatter.mjs').program,helper=flatten(formatter.body).find(node=>node.kind==='variable-declaration'&&node.value==='formatter-fail');assert(helper);
 const exports=flatten(backend.compiler.compile_ir_string('(defconst formatter-fail nil) (export formatter-fail)','failure-export.eli').body).filter(node=>node.kind==='export-declaration');
 const js=backend.compiler.emit_ir_string({...formatter,body:[helper,...exports]}),failure=(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).formatter_fail;
 assert.equal(failure.length,2);assert.equal(Object.hasOwn(failure,'prototype'),false);assert.throws(()=>Reflect.construct(String,[],failure),TypeError);
 const capture=(fn,message,filename)=>{try{fn(message,filename);assert.fail('must throw');}catch(error){return error;}};
 for(const message of[undefined,null,false,-0,NaN,Infinity,'',1n,'中😀\ud800',Symbol('message')])for(const filename of[undefined,null,false,true,-0,NaN,'',0n,'name.eli',[],{},Symbol('file')]){
   const actual=capture(failure,message,filename),expected=capture(originalFailure,message,filename);
   assert.equal(Object.getPrototypeOf(actual),Object.getPrototypeOf(expected));assert.equal(actual.message,expected.message);
   assert.deepEqual(actual.eliscriptDiagnostic,expected.eliscriptDiagnostic);
   if(actual.eliscriptDiagnostic)assert(Object.is(actual.eliscriptDiagnostic.message,message));
 }
 for(const mode of['primitive','ordinary','throws','invalid']){
   const observe=fn=>{const events=[],sentinel={},message=mode==='ordinary'?{toString(){events.push('toString');return 'text';},valueOf(){events.push('valueOf');return 7;}}:{[Symbol.toPrimitive](hint){events.push(hint);if(mode==='throws')throw sentinel;return mode==='invalid'?{}:'text';}};const error=capture(fn,message,'file.eli');return{events,kind:error===sentinel?'sentinel':error.constructor.name,message:error.message,retained:error.eliscriptDiagnostic?.message===message};};
   assert.deepEqual(observe(failure),observe(originalFailure));
 }
 const saved=globalThis.Error,returned={};try{const calls=[];globalThis.Error=function(message){calls.push(message);return returned;};const message={};assert.equal(capture(failure,message,'name'),returned);assert.equal(calls[0],message);assert.equal(returned.eliscriptDiagnostic.message,message);}finally{globalThis.Error=saved;}
});

test('random nested syntax comments Unicode and width boundaries format identically and remain idempotent in the complete WASM formatter',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:16384,initialBytes:1048576});a.auto(1);
 let seed=0x192e731a;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const atoms=['x','nil','false','undefined',':ns/key','中😀','\ud800x','"\\uD800😀"','-0','1e-8','long-name-'+ 'x'.repeat(77)];
 function form(depth){if(!depth||next()%3===0)return atoms[next()%atoms.length];const left=form(depth-1),right=form(depth-1);switch(next()%7){case 0:return '('+left+' ;😀 comment  \r\n '+right+')';case 1:return '['+left+' '+right+']';case 2:return '{:x '+left+' :y '+right+'}';case 3:return '#{'+left+' '+right+'}';case 4:return '#queue ['+left+' '+right+']';case 5:return "' ; prefix \n"+left;default:return '(defun f (value) '+left+' '+right+')';}}
 for(let i=0;i<64;i++){const source='; random '+i+'  \n'+form(3)+'\n'+form(2),actual=invoke(a,source,'随机😀.eli'),oracle=expected(source,'随机😀.eli');assert.deepEqual(actual,oracle,source);assert.deepEqual(invoke(a,actual.value,'随机😀.eli'),actual);a.collect();assert.equal(a.stats().frameDepth,0);}
 assert(a.stats().collections>100);finish(a);
},30000);

test('independent Node executes identical complete formatter WASM bytes against its native JS formatter',async()=>{
 const file=resolve(directory,'formatter.wasm');await writeFile(file,artifact());
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const reference=await import(process.argv[2]);const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',decode.toString(),property.toString(),invoke.toString(),expected.toString(),'const a=instantiateManagedRuntime(bytes,{maxSlots:8192,initialBytes:1048576});a.auto(1);','for(const source of '+JSON.stringify([...corpus,42,null,'(',':a/'])+'){assert.deepEqual(invoke(a,source,"node.eli"),expected(source,"node.eli"));a.collect();assert.equal(a.stats().frameDepth,0);}','a.closeModule();a.collect();assert.equal(a.live(),0);'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(resolve(directory,'bootstrap/formatter.mjs')).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('formatter capacity failure retains external roots and recovers without leaking formatter or reader frames',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:256,initialBytes:32768,maxBytes:262144});a.auto(1);const source=a.string('['+'x '.repeat(256)+']'),file=a.string('capacity.eli'),held=a.number(-0),frame=a.frame(1);a.frameSet(frame,0,held);
 assert.throws(()=>a.invoke('format_source',[source,file]),error=>error.eliscriptDiagnostic?.code==='ELI-RT0002');assert.equal(a.stats().frameDepth,1);assert(Object.is(a.readNumber(held),-0));a.release(source);a.release(file);a.collect();assert.deepEqual(invoke(a,'ok','recovered.eli'),expected('ok','recovered.eli'));a.leaveFrame(frame);a.release(held);finish(a);
});

test('public Seed and three complete compiler generations retain byte-identical JavaScript and maps after the formatter diagnostic migration', async () => {
  const files = (await readdir('bootstrap/compiler')).filter(name => name.endsWith('.eli')).sort();
  assert.equal(files.length, 13);
  const seedDirectory = resolve(directory, 'seed'); await mkdir(seedDirectory);
  const seedFile = resolve(seedDirectory, 'formatter.mjs');
  const seed = spawnSync(resolve('bin/eliscript-seed'), ['--source-map', '--output', seedFile, resolve('bootstrap/compiler/formatter.eli')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(seed.status, 0, seed.stderr);
  assert.equal(await readFile(seedFile, 'utf8'), await readFile(resolve(directory, 'bootstrap/formatter.mjs'), 'utf8'));
  let compiler = backend.compiler, previous;
  for (let generation = 1; generation <= 3; generation++) {
    const output = resolve(directory, 'generation-' + generation); await mkdir(output);
    const emitted = new Map();
    for (const name of files) {
      const path = resolve('bootstrap/compiler', name), source = await readFile(path, 'utf8'), filename = name.replace(/\.eli$/, '.mjs');
      // A fixed source-map coordinate isolates compiler identity from output-directory spelling.
      const program = compiler.compile_ir_string(source, path), snapshot = JSON.stringify(program);
      const result = compiler.emit_ir_string_with_source_map(program, source, filename, relative(resolve(directory, 'fixed'), path));
      assert.equal(JSON.stringify(program), snapshot);
      const javascript = result.javascript + '//# sourceMappingURL=' + filename + '.map\n';
      emitted.set(name, { javascript, map: result.sourceMap });
      if (previous) assert.deepEqual(emitted.get(name), previous.get(name), 'generation ' + generation + ': ' + name);
      await writeFile(resolve(output, filename), javascript); await writeFile(resolve(output, filename + '.map'), result.sourceMap);
    }
    previous = emitted; compiler = await import(pathToFileURL(resolve(output, 'compiler.mjs')).href);
  }
}, 30000);
