import {afterAll,beforeAll,test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dir,'..'),sourceRoot=resolve(process.env.ELISCRIPT_COMPILER_SOURCE_ROOT??root);
const loadReader=`(progn (set-language-environment "UTF-8") (prefer-coding-system 'utf-8-unix) (setq coding-system-for-write 'utf-8-unix) (set-terminal-coding-system 'utf-8-unix) (load-file ${JSON.stringify(resolve(root,'compiler/eliscript-reader.el'))}))`;
const emacs=process.env.EMACS??'emacs';
const tokens=['-0','-00','-000','-0.','-00.','-0.0','-00.000','-.0','-.00','-0e0','-00e-00','-0E+2','-0.00e-20','-1e-9999'];
let directory,compiler,reader,seed,source,filename;
function runEmacs(arguments_,env={}){
 const child=spawnSync(emacs,['--batch','-Q','-L',resolve(sourceRoot,'compiler'),'--eval',loadReader,...arguments_.map(argument=>argument==='--script'?'--load':argument)],{cwd:sourceRoot,env:{...process.env,...env},encoding:'utf8',timeout:120000});assert.equal(child.status,0,child.stderr);return child.stdout;
}
function resolveRuntime(javascript){return javascript.replace(/from "eliscript\/([^"]+)"/g,(_,path)=>'from '+JSON.stringify(pathToFileURL(resolve(sourceRoot,path)).href));}
async function importCode(javascript){return import('data:text/javascript;base64,'+Buffer.from(resolveRuntime(javascript)).toString('base64'));}
async function seedCompile(text,name){const input=resolve(directory,name+'.eli'),output=resolve(directory,name+'.mjs');await writeFile(input,text);runEmacs(['--script',resolve(sourceRoot,'compiler/eliscript-cli.el'),'--','--output',output,input]);return{input,javascript:await readFile(output,'utf8')};}
beforeAll(async()=>{
 directory=await mkdtemp(resolve(tmpdir(),'eliscript-seed-negative-zero-'));
 const bootstrap=resolve(directory,'bootstrap');await mkdir(bootstrap);
 const files=(await readdir(resolve(sourceRoot,'bootstrap/compiler'))).filter(name=>name.endsWith('.eli')).map(name=>name.slice(0,-4)).sort();
 runEmacs(['--script',resolve(sourceRoot,'tools/bootstrap-seed.el'),'--',sourceRoot,bootstrap,...files]);compiler=await import(pathToFileURL(resolve(bootstrap,'compiler.mjs')).href);reader=await import(pathToFileURL(resolve(bootstrap,'reader.mjs')).href);
 source=';😀 negative numeric tokens keep their original spans\n'+
  '(defconst top -0)\n(defconst quoted \'-0)\n(defconst values (js-array '+tokens.join(' ')+'))\n'+
  '(defconst nested (js-array (js-array -0 -00) [-0 -00] \'(-0 -00) {:negative -0 :another -00}))\n'+
  '(defun observed () (js-array (Object/is top -0) (/ 1 top) (Object/is quoted -0)))\n'+
  '(export top quoted values nested observed)';
 const compiled=await seedCompile(source,'negative-zero');filename=compiled.input;seed=compiled.javascript;
},120000);
afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('Seed keeps integer negative zero as an observable numeric value',async()=>{
 const a=await importCode(seed),b=await importCode(compiler.compile_string(source,filename));
 assert(Object.is(a.top,-0));assert.equal(1/a.top,-Infinity);assert(Object.is(a.quoted,-0));assert.deepEqual(a.observed(),[true,-Infinity,true]);assert.deepEqual(a.observed(),b.observed());
});

test('all existing negative-zero token spellings survive nested vector list and Map contexts',async()=>{
 const a=await importCode(seed),b=await importCode(compiler.compile_string(source,filename));
 for(const module of [a,b]){
  assert.equal(module.values.length,tokens.length);for(const value of module.values){assert(Object.is(value,-0));assert.equal(1/value,-Infinity);}
  for(const container of module.nested)for(const item of container){const value=Array.isArray(item)?item[1]:item;assert(Object.is(value,-0));assert.equal(1/value,-Infinity);}
 }
});

test('Seed and JS retain complete IR values spans emitted JavaScript and source map bytes',async()=>{
 const fixture=resolve(directory,'ir.json');await writeFile(fixture,JSON.stringify({valid:[{name:'negative-zero',filename,source}]}));
 const ir=JSON.parse(runEmacs(['--script',resolve(sourceRoot,'tests/bootstrap-ir-oracle.el')],{ELISCRIPT_IR_FIXTURE:fixture}));
 assert.equal(ir[0].status,'ok');assert.deepEqual(ir[0].program,compiler.compile_ir_string(source,filename));assert.equal(seed,compiler.compile_string(source,filename));
 const mapped=resolve(directory,'negative-zero-mapped.mjs');runEmacs(['--script',resolve(sourceRoot,'compiler/eliscript-cli.el'),'--','--source-map','--output',mapped,filename]);
 const emission=compiler.compile_string_with_source_map(source,filename,'negative-zero-mapped.mjs','negative-zero.eli');
 assert.equal(await readFile(mapped,'utf8'),emission.javascript+'//# sourceMappingURL=negative-zero-mapped.mjs.map\n');assert.equal(await readFile(mapped+'.map','utf8'),emission.sourceMap);
});

test('numeric-looking strings comments and symbols stay unchanged and nonzero values retain their signs',async()=>{
 const sources=[
  ';😀 -0 -00 and -0e0 are comments\n0 +0 00 +00 0.0 +0.0 0e0 1 -1 +1 1.25 -1.25 2e3 -2e3',
  '"-0 -00 -0.0" :negative-zero -0tail --0 -0.0tail zero-0 -0/foo',
  "'(-0 (inner -00) [-0. -0e0] {:negative -0 :positive 0})",
  '#{-0} #queue [-0 -00] {:negative -0 :nested [-00]}',
 ];
 const fixture=resolve(directory,'reader.json');await writeFile(fixture,JSON.stringify({valid:sources.map((source,index)=>({name:'boundary-'+index,filename:'boundary-'+index+'.eli',source})),invalid:[]}));
 const values=JSON.parse(runEmacs(['--script',resolve(sourceRoot,'tests/bootstrap-reader-oracle.el')],{ELISCRIPT_READER_FIXTURE:fixture}));
 assert.equal(values.length,sources.length);
 for(const [index,value] of values.entries()){assert.equal(value.status,'ok');assert.deepEqual(value.forms,reader.read_string(sources[index],'boundary-'+index+'.eli'));}
});

test('negative zero keeps complete Seed and three self-hosted compiler JS IR and map fixed points',async()=>{
 const files=(await readdir(resolve(sourceRoot,'bootstrap/compiler'))).filter(name=>name.endsWith('.eli')).sort(),all=[compiler];let previous=compiler;
 for(const generation of [2,3]){
  const output=resolve(directory,'g'+generation);await mkdir(output);
  for(const file of files){const input=resolve(sourceRoot,'bootstrap/compiler',file),name=file.replace(/\.eli$/,'.mjs'),text=await readFile(input,'utf8'),emission=previous.compile_string_with_source_map(text,input,name,relative(output,input));await writeFile(resolve(output,name),emission.javascript+'//# sourceMappingURL='+name+'.map\n');await writeFile(resolve(output,name+'.map'),emission.sourceMap);}
  const current=await import(pathToFileURL(resolve(output,'compiler.mjs')).href);all.push(current);previous=current;
 }
 for(const current of all){assert.equal(current.compile_string(source,filename),seed);assert.deepEqual(current.compile_ir_string(source,filename),compiler.compile_ir_string(source,filename));assert.deepEqual(current.compile_string_with_source_map(source,filename,'negative-zero.mjs','negative-zero.eli'),compiler.compile_string_with_source_map(source,filename,'negative-zero.mjs','negative-zero.eli'));const module=await importCode(current.compile_string(source,filename));assert(Object.is(module.top,-0));assert.equal(1/module.top,-Infinity);}
 for(const file of files){const input=resolve(sourceRoot,'bootstrap/compiler',file),text=await readFile(input,'utf8'),name=file.replace(/\.eli$/,'.mjs'),expected=compiler.compile_string_with_source_map(text,input,name,'../compiler/'+file);for(const current of all.slice(1))assert.deepEqual(current.compile_string_with_source_map(text,input,name,'../compiler/'+file),expected);}
},120000);
