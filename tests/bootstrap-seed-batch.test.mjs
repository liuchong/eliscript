import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';
import {seedCompilerFixture} from './helpers/seed-compiler.mjs';

test('backend fixtures seed all compiler modules in one Emacs process with byte-identical independent CLI artifacts',async()=>{
 const root=resolve(import.meta.dir,'..'),directory=await mkdtemp(resolve(tmpdir(),'eliscript-seed-batch-')),output=resolve(directory,'bootstrap'),calls=resolve(directory,'calls'),proxy=resolve(directory,'emacs-proxy.mjs');
 const modules=['symbol','syntax','reader','formatter','expander','transient-analysis','analyzer','ir','lower','source-map','emitter','project','compiler'];
 const keys=['EMACS','ELISCRIPT_BATCH_CALL_LOG','ELISCRIPT_BATCH_REAL_EMACS'],previous=process.env.EMACS,saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try {
  const baseline=spawnSync(resolve(root,'bin/eliscript-bootstrap'),[],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ELISCRIPT_BOOTSTRAP_OUT_DIR:output}});assert.equal(baseline.status,0,baseline.stderr);
  const expected=new Map();for(const name of modules)for(const suffix of['.mjs','.mjs.map'])expected.set(name+suffix,await readFile(resolve(output,name+suffix)));
  await rm(output,{recursive:true,force:true});
  await writeFile(proxy,`#!${process.execPath}\nimport{appendFileSync}from'node:fs';appendFileSync(process.env.ELISCRIPT_BATCH_CALL_LOG,'call\\n');const result=Bun.spawnSync([process.env.ELISCRIPT_BATCH_REAL_EMACS,...process.argv.slice(2)],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});process.exit(result.exitCode??1);\n`,{mode:0o700});
  process.env.EMACS=proxy;process.env.ELISCRIPT_BATCH_CALL_LOG=calls;process.env.ELISCRIPT_BATCH_REAL_EMACS=previous??'emacs';
  await buildBackends({outputRoot:directory});
  assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1);
  assert.deepEqual((await readdir(output)).sort(),[...expected.keys()].sort());
  for(const[name,bytes]of expected)assert((await readFile(resolve(output,name))).equals(bytes),name);
  await writeFile(calls,'');const semantic=resolve(directory,'semantic');await seedCompilerFixture(semantic);
  assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1);
  assert.deepEqual((await readdir(semantic)).sort(),[...expected.keys()].sort());
  for(const[name,bytes]of expected)assert((await readFile(resolve(semantic,name))).equals(bytes),'semantic fixture '+name);
 }finally{
  for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  await rm(directory,{recursive:true,force:true});
 }
},120000);

test('the batch seed entry passes strict byte compilation and refuses malformed module paths with a failing exit status',async()=>{
 const root=resolve(import.meta.dir,'..'),directory=await mkdtemp(resolve(tmpdir(),'eliscript-seed-batch-errors-')),tool=resolve(root,'tools/bootstrap-seed.el'),emacs=process.env.EMACS??'emacs';
 try{
  await mkdir(resolve(directory,'tools'));const copied=resolve(directory,'tools/bootstrap-seed.el');await writeFile(copied,await readFile(tool));
  const compile=spawnSync(emacs,['--batch','-Q','-L',resolve(root,'compiler'),'--eval','(setq byte-compile-error-on-warn t)','--eval',`(unless (byte-compile-file ${JSON.stringify(copied)}) (kill-emacs 1))`],{encoding:'utf8',timeout:30000});assert.equal(compile.status,0,compile.stderr);
  const result=spawnSync(emacs,['--batch','-Q','--script',tool,'--',root,resolve(directory,'output'),'../outside'],{encoding:'utf8',timeout:30000});assert.equal(result.status,1);assert.match(result.stderr,/invalid bootstrap module name/);assert.deepEqual((await readdir(directory)).sort(),['tools']);
 }finally{await rm(directory,{recursive:true,force:true});}
},60000);

test('semantic compiler fixture setup rejects a failing seed process instead of reusing stale artifacts',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eliscript-semantic-seed-failure-'));
 try{
  const proxy=resolve(directory,'failing-emacs.mjs');
  await writeFile(proxy,`#!${process.execPath}\nprocess.stderr.write('intentional semantic seed failure');process.exit(17);\n`,{mode:0o700});
  const output=resolve(directory,'output');await mkdir(output);await writeFile(resolve(output,'compiler.mjs'),'stale fixture must not bypass the seed');
  await assert.rejects(seedCompilerFixture(output,{emacs:proxy}),e=>e.exitCode===17&&/intentional semantic seed failure/.test(e.message));
 }finally{await rm(directory,{recursive:true,force:true});}
});
