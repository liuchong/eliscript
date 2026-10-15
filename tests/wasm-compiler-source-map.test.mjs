import {beforeAll,afterAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
const originalSourceLocations = (source, marks) => { const wanted = new Set(); const locations = new Map(); for (const mark of marks) { const span = (mark ?? [])[2] ?? null; const start = span.start; if (start !== undefined) wanted.add(start); } const starts = [...wanted].filter((start) => Number.isSafeInteger(start) && start >= 0).sort((left, right) => left - right); let index = 0; let offset = 0; let line = 0; let column = 0; for (const start of starts) { while (offset < start && index < source.length) { const code = source.codePointAt(index); const width = code > 65535 ? 2 : 1; if (code === 10) { line += 1; column = 0; } else { column += width; } index += width; offset += 1; } if (offset === start && (index < source.length || source.length === 0)) locations.set(offset, [line, column]); } return locations; };
const originalGeneratedMarks = (generated, marks) => { const result = []; let index = 0; let line = 0; let column = 0; for (const mark of marks) { const target = mark.offset; while (index < target && index < generated.length) { if (generated.charCodeAt(index) === 10) { line += 1; column = 0; } else { column += 1; } index += 1; } if (index === target && index < generated.length) result.push([line, column, mark.span]); } return result; };
const names=['encode-vlq','collect-generated-marks','reference-collect-generated-marks','source-locations','reference-source-locations','create-source-map'];
let directory,backend,runtime,program,modules,reference,ported,bytes,referenceJavaScript,runtimeText;
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-whole-source-map-'));backend=await buildBackends({outputRoot:directory});program=backend.compiler.compile_ir_string(await readFile('bootstrap/compiler/source-map.eli','utf8'),'source-map.eli');runtimeText=await readFile('bootstrap/runtime/memory.eli','utf8');
 ported=await import(pathToFileURL(resolve(directory,'bootstrap/source-map.mjs')).href);
 const originals=backend.compiler.compile_ir_string('(defconst native-source-locations (js* '+JSON.stringify(originalSourceLocations.toString())+')) (defconst native-collect-generated-marks (js* '+JSON.stringify(originalGeneratedMarks.toString())+'))','original-cursors.eli').body;
 const originalNodes=new Map(originals.map(node=>[node.value,node]));
 const rewrite=node=>originalNodes.has(node.value)&&node.kind==='variable-declaration'?structuredClone(originalNodes.get(node.value)):{...node,children:node.children.map(rewrite)};
 referenceJavaScript=backend.compiler.emit_ir_string({...program,body:program.body.map(rewrite)});reference=await import('data:text/javascript;base64,'+Buffer.from(referenceJavaScript).toString('base64'));
 modules=[{id:'source-map.mjs',program},{id:'entry.mjs',program:backend.compiler.compile_ir_string('(import "./source-map.mjs" '+names.join(' ')+') (defun location-entries (locations) (Array/from locations)) (export '+names.join(' ')+' location-entries)','source-map-entry.eli')}];
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function artifact(){if(bytes)return bytes;if(!runtime)runtime=backend.compiler.compile_ir_string(runtimeText,'runtime.eli');const saved=JSON.stringify(modules);try{bytes=Uint8Array.from(backend.managed.emit_managed_project_wasm(modules,'entry.mjs',runtime));}catch(error){error.message+=' '+JSON.stringify(error.eliscriptDiagnostic);throw error;}assert.equal(JSON.stringify(modules),saved);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);return bytes;}
function finish(a){a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
test('the entire unchanged Source Map module compiles and executes all VLQ and cursor declarations in zero-import WASM',()=>{const a=instantiateManagedRuntime(artifact());a.auto(1);for(const value of[-2147483649,-2147483648,-1024,-32,-1,-0,0,1,31,32,2147483647,2147483648,9007199254740991]){const input=a.number(value),out=a.invoke('encode_vlq',[input]);assert.equal(a.readString(out),reference.encode_vlq(value));a.release(input);a.release(out);}finish(a);});
function read(a,value){if(value?.kind===4)return a.readNumber(value);if(value?.kind===5)return a.readString(value);if(value?.kind===14)return Array.from({length:a.length(value)},(_,i)=>{const item=a.get(value,i);try{return read(a,item);}finally{a.release(item);}});if(value?.kind===13){const out={},keys=a.objectKeys(value);try{for(let i=0;i<a.length(keys);i++){const key=a.get(keys,i),child=a.objectGet(value,key);try{out[a.readString(key)]=read(a,child);}finally{a.release(key);a.release(child);}}}finally{a.release(keys);}return out;}return value;}
function box(a,value){if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);if(Array.isArray(value)){const items=value.map(item=>box(a,item));try{return a.sourceArray(items);}finally{items.forEach(item=>a.release(item));}}if(value&&typeof value==='object'){const fields=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,box(a,item)]));try{return a.sourceObject(fields);}finally{Object.values(fields).forEach(item=>a.release(item));}}return value;}
function call(a,name,args){const inputs=args.map(value=>box(a,value));try{const out=a.invoke(name,inputs);try{if(out?.kind===15){const entries=a.invoke('location_entries',[out]);try{return read(a,entries);}finally{a.release(entries);}}return read(a,out);}finally{a.release(out);}}finally{inputs.forEach(value=>a.release(value));}}
test('all six Source Map exports preserve original VLQ cursors maps EOF behavior and complete JSON documents',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const generated of['','abc','A😀\ud800\nx\n'])for(const source of['','中😀\nx','a\r\nb']){
  const marks=[0,0,1,2,3,generated.length,generated.length+1].map((offset,i)=>({offset,span:{start:i%5,line:2,column:3}}));
  for(const name of['collect_generated_marks','reference_collect_generated_marks'])assert.deepEqual(call(a,name,[generated,marks]),reference[name](generated,marks),name);
  const locations=[0,1,2,2,3,-1,NaN,1.5,'1',undefined].map(start=>[0,0,{start,line:1,column:1}]);
  for(const name of['source_locations','reference_source_locations'])assert.deepEqual(call(a,name,[source,locations]),[...reference[name](source,locations)],name);
  assert.equal(call(a,'create_source_map',[generated,marks,source,'原始😀.eli','out.mjs']),reference.create_source_map(generated,marks,source,'原始😀.eli','out.mjs'));
  a.collect();assert.equal(a.stats().frameDepth,0);
 }
 finish(a);
});

test('ported cursor JS retains original iterator getter interleaving dynamic source methods abrupt close and original error priority',()=>{
 function observe(fn,mode){const events=[],sentinel={},generated={get length(){events.push('length');if(mode==='length')throw sentinel;return 3;},get charCodeAt(){events.push('get-char');return index=>{events.push('char'+index);if(mode==='char')throw sentinel;return index===1?10:97;};}},mark={get offset(){events.push('offset');if(mode==='offset')throw sentinel;return 2;},get span(){events.push('span');if(mode==='span')throw sentinel;return{start:1};}};let n=0;const iterator={get next(){events.push('get-next');return function(){assert.equal(this,iterator);events.push('next'+n);return n++===0?{value:mark,done:0}:{done:'yes'};}},get return(){events.push('get-return');return function(){assert.equal(this,iterator);events.push('return');throw 'close-error';};}},marks={[Symbol.iterator](){events.push('iterator');return iterator;}};let value,error;try{value=fn(generated,marks);}catch(caught){error=caught===sentinel?'sentinel':caught;}return{events,value,error};}
 for(const mode of['normal','offset','span','length','char'])assert.deepEqual(observe(ported.collect_generated_marks,mode),observe(originalGeneratedMarks,mode),mode);
 function sourceTrace(fn){const events=[],source={get length(){events.push('length');return 4;},get codePointAt(){events.push('get-code');return index=>{events.push('code'+index);return 'A😀\n'.codePointAt(index);};}},mark={get 2(){events.push('span');return{get start(){events.push('start');return 2;}};}};let n=0;const marks={[Symbol.iterator](){events.push('iterator');return{next(){events.push('next'+n);return n++===0?{done:false,value:mark}:{done:true};}};}};return{events,entries:[...fn(source,marks)]};}
 assert.deepEqual(sourceTrace(ported.source_locations),sourceTrace(originalSourceLocations));
 for(const mark of[null,undefined,[],[0,0,null],[0,0,undefined]]){assert.throws(()=>ported.source_locations('abc',[mark]),TypeError);assert.throws(()=>originalSourceLocations('abc',[mark]),TypeError);}
});

test('cursor iteration and spread do not introduce mutable Symbol Reflect or Array global lookups',()=>{
 const source='A😀\n',marks=[{offset:0,span:{start:0}},{offset:3,span:{start:1}}],saved=[globalThis.Symbol,globalThis.Reflect,globalThis.Array];let left,right,locations,expected;
 try{globalThis.Symbol=undefined;globalThis.Reflect=undefined;globalThis.Array=undefined;left=ported.collect_generated_marks(source,marks);right=originalGeneratedMarks(source,marks);locations=[...ported.source_locations(source,left)];expected=[...originalSourceLocations(source,right)];}
 finally{[globalThis.Symbol,globalThis.Reflect,globalThis.Array]=saved;}
 assert.deepEqual(left,right);assert.deepEqual(locations,expected);
});

test('complete Source Map WASM preserves random UTF16 irregular mark cursors duplicate starts and exact JSON mappings under GC',()=>{
 const a=instantiateManagedRuntime(artifact(),{maxSlots:8192,initialBytes:1048576});a.auto(1);let seed=0x517b9e3;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let n=0;n<64;n++){let source='',generated='';for(let j=0,count=next()%24;j<count;j++){source+=String.fromCharCode(next()%65536);generated+=j%4===0?'\n':String.fromCharCode(next()%65536);}const marks=Array.from({length:next()%12},()=>({offset:(next()%(generated.length+5))-2,span:{start:(next()%(source.length+5))-2,line:1+next()%4,column:1+next()%8}}));
 const actual=call(a,'collect_generated_marks',[generated,marks]),expected=originalGeneratedMarks(generated,marks);assert.deepEqual(actual,expected);assert.deepEqual(call(a,'source_locations',[source,expected]),[...originalSourceLocations(source,expected)]);
 assert.equal(call(a,'create_source_map',[generated,marks,source,'随机😀.eli','out.mjs']),reference.create_source_map(generated,marks,source,'随机😀.eli','out.mjs'));a.collect();assert.equal(a.stats().frameDepth,0);}
 assert(a.stats().collections>100);finish(a);
});

test('invalid source map input preserves explicit module errors and original nullish span rejection without retaining frames',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const marks of[null,undefined,false,0,'not-array']){const args=['abc',marks,'abc','in.eli','out.mjs'].map(value=>box(a,value));let error;try{a.invoke('create_source_map',args);}catch(caught){error=caught;}assert(error?.kind);const key=a.string('message'),message=a.objectGet(error,key);assert.equal(a.readString(message),'source map marks must be an array');for(const root of[...args,error,key,message])a.release(root);}
 for(const mark of[null,undefined,[],[0,0,null]]){assert.throws(()=>call(a,'source_locations',['abc',[mark]]),error=>{assert.equal(error.eliscriptDiagnostic?.code,'ELI-RT0001','mark='+JSON.stringify(mark));return true;});a.collect();assert.equal(a.stats().frameDepth,0);}
 assert.deepEqual(call(a,'source_locations',['',[ [0,0,{start:0}] ]]),[[0,[0,0]]]);finish(a);
});

test('independent Node executes the same whole Source Map WASM against the original unported cursor algorithms',async()=>{
 const file=resolve(directory,'source-map.wasm'),original=resolve(directory,'original.mjs');await writeFile(file,artifact());await writeFile(original,referenceJavaScript);
 const script=["import assert from 'node:assert/strict';import{readFileSync}from'node:fs';",'const{instantiateManagedRuntime}=await import(process.argv[1]);const reference=await import(process.argv[2]);const bytes=readFileSync(process.argv[3]);assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)),[]);',read.toString(),box.toString(),call.toString(),'const a=instantiateManagedRuntime(bytes);a.auto(1);',
  'for(const source of ["","A😀\\ud800\\nx"]){const generated="x😀\\nvalue",marks=[0,1,3,4,generated.length].map((offset,i)=>({offset,span:{start:i,line:1,column:2}}));assert.deepEqual(call(a,"collect_generated_marks",[generated,marks]),reference.collect_generated_marks(generated,marks));assert.equal(call(a,"create_source_map",[generated,marks,source,"in.eli","out.mjs"]),reference.create_source_map(generated,marks,source,"in.eli","out.mjs"));}',
  'a.closeModule();a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);'].join('\n');
 const child=spawnSync('node',['--input-type=module','-e',script,pathToFileURL(resolve('tools/backends/managed-runtime.mjs')).href,pathToFileURL(original).href,file],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
});

test('public Seed and three complete compiler generations retain byte-identical JavaScript and maps after the Source Map cursor migration', async () => {
  const files = (await readdir('bootstrap/compiler')).filter(name => name.endsWith('.eli')).sort();
  assert.equal(files.length, 13);
  const seedDirectory = resolve(directory, 'seed'); await mkdir(seedDirectory);
  const seedFile = resolve(seedDirectory, 'source-map.mjs');
  const seed = spawnSync(resolve('bin/eliscript-seed'), ['--source-map', '--output', seedFile, resolve('bootstrap/compiler/source-map.eli')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(seed.status, 0, seed.stderr);
  assert.equal(await readFile(seedFile, 'utf8'), await readFile(resolve(directory, 'bootstrap/source-map.mjs'), 'utf8'));
  let compiler = backend.compiler, previous;
  for (let generation = 1; generation <= 3; generation++) {
    const output = resolve(directory, 'generation-' + generation, 'bootstrap'); await mkdir(output,{recursive:true});
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
    const current = await buildBackends({outputRoot:resolve(output,'..'),frontend:compiler});
    const freshModules = [{id:'source-map.mjs',program:compiler.compile_ir_string(await readFile('bootstrap/compiler/source-map.eli','utf8'),'source-map.eli')},modules[1]];
    const freshRuntime = compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli','utf8'),'runtime.eli');
    assert.deepEqual(Uint8Array.from(current.managed.emit_managed_project_wasm(freshModules,'entry.mjs',freshRuntime)),artifact(),'WASM generation '+generation);

  }
}, 30000);

test('cursor records retain ordinary boxed primitive missing-property reads instead of inventing input type errors',()=>{
 const a=instantiateManagedRuntime(artifact());a.auto(1);
 for(const value of[false,true,0,-0,1,NaN,'', 'abc']){
  assert.deepEqual(call(a,'collect_generated_marks',['abc',[value]]),originalGeneratedMarks('abc',[value]));
  assert.deepEqual(call(a,'source_locations',['abc',[[0,0,value]]]),[...originalSourceLocations('abc',[[0,0,value]])]);
 }
 finish(a);
});

test('migrated cursor comparisons preserve nonnumeric offsets repeated conversion and mutable Number predicate results in JS',()=>{
 function observe(fn,kind){const events=[],offset=kind==='object'?{valueOf(){events.push('number');return 2;}}:kind==='symbol'?Symbol('x'):kind==='bigint'?2n:kind==='string'?'2':kind==='nan'?NaN:kind==='fraction'?2.5:Infinity,mark={get offset(){events.push('offset');return offset;},get span(){events.push('span');return{start:0};}};let value,error;try{value=fn('a\nb',[mark]);}catch(caught){error=caught.constructor.name;}return{events,value,error};}
 for(const kind of['object','symbol','bigint','string','nan','fraction','infinity'])assert.deepEqual(observe(ported.collect_generated_marks,kind),observe(originalGeneratedMarks,kind),kind);
 const saved=Number.isSafeInteger;let actual,expected;try{for(const answer of[0,'',NaN,{},true]){Number.isSafeInteger=()=>answer;const marks=[[0,0,{start:'0'}],[0,0,{start:1}]];actual=[...ported.source_locations('abc',marks)];expected=[...originalSourceLocations('abc',marks)];assert.deepEqual(actual,expected);}}finally{Number.isSafeInteger=saved;}
});
