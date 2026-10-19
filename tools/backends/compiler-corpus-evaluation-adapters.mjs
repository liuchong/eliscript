import {createHash} from 'node:crypto';

function region(source,begin,end){
  const start=source.indexOf(begin),finish=end===undefined?source.length:source.indexOf(end,start+begin.length);
  if(start<0||finish<0)throw new TypeError('original evaluation host boundary changed');
  const text=source.slice(start,finish);
  return {text,start,end:finish,byteStart:Buffer.byteLength(source.slice(0,start)),byteEnd:Buffer.byteLength(source.slice(0,finish)),
    sha256:createHash('sha256').update(text).digest('hex')};
}

// Keep the original persistent-session, stdio and terminal bodies intact. Only
// their compiler construction setup is supplied by the selected target graph.
export async function addOriginalEvaluationPrograms({add,locators,text,file,bootstrapSources}) {
  const suite='tests/bootstrap-evaluation.test.mjs',coverage=locators.filter(item=>item.file===suite).map(item=>item.id);
  if(!coverage.length)return [];
  const original=await text(suite),helpers=region(original,'async function run(', '\nbeforeAll(');
  const bodies=region(original,'test("self-hosted evaluation descriptors are closed and framework neutral"');
  const modules=[];
  for(const filename of bootstrapSources){
    if(!/^bootstrap\/compiler\/[a-z][a-z-]*[.]eli$/.test(filename))continue;
    modules.push({id:filename.slice(0,-4)+'.mjs',filename,source:await text(filename)});
  }
  if(modules.length!==13||!modules.some(item=>item.id==='bootstrap/compiler/compiler.mjs'))
    throw new TypeError('original evaluation requires the complete original compiler module graph');
  for(const filename of ['bootstrap/host/evaluation.mjs','bootstrap/host/evaluation-cli.mjs','bootstrap/host/project.mjs',
    'bootstrap/host/bun.mjs','bin/eliscript-eval','tests/bootstrap-evaluation-oracle.el','tests/fixtures/evaluation-session/main.eli'])await file(filename);
  const host=[
    'import {expect} from "bun:test";',
    'import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";',
    'import {tmpdir} from "node:os";',
    'import {join,resolve} from "node:path";',
    'import {pathToFileURL} from "node:url";',
    'const projectDirectory=process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT;',
    'if(!projectDirectory)throw new Error("original evaluation host requires its source root");',
    'const {EvaluationSession}=await import(pathToFileURL(resolve(projectDirectory,"bootstrap/host/evaluation.mjs")).href);',
    'const evaluationPath=resolve(projectDirectory,"bin/eliscript-eval");',
    'const evaluationOracle=resolve(projectDirectory,"tests/bootstrap-evaluation-oracle.el");',
    'const fixture=resolve(projectDirectory,"tests/fixtures/evaluation-session/main.eli");',
    'const node=process.env.NODE??"node";',
    'const bun=process.env.ELISCRIPT_ORIGINAL_BUN??process.execPath;',
    'const emacs=process.env.EMACS??"emacs";',
    'const directory=mkdtempSync(join(tmpdir(),"eliscript-evaluation-original-"));',
    'const compilerDirectory=resolve(process.argv[2],"bootstrap/compiler");',
    'const compiler=await import(pathToFileURL(resolve(compilerDirectory,"compiler.mjs")).href);',
    'const originalBodies=[];',
    'function test(name,body,timeout=5000){originalBodies.push({name,body,timeout});}',
    helpers.text,
    bodies.text,
    'try{for(const entry of originalBodies){',
    ' let timer;try{await Promise.race([Promise.resolve().then(()=>entry.body()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(entry.name+": original timeout "+entry.timeout+"ms")),entry.timeout);})]);}',
    ' finally{clearTimeout(timer);}',
    '}}finally{rmSync(directory,{recursive:true,force:true});}',
  ].join('\n')+'\n';
  add({id:'original-program:compiler-persistent-evaluation',kind:'project',coverage,
    modules,entry:'bootstrap/compiler/compiler.mjs',
    request:{operation:'project',resolveImports:true,phased:true,sourceMap:true,entries:modules.map(item=>item.id)},
    execution:{kind:'original-program',host:'tests/__eliscript_original_evaluation.mjs',hostSource:host,
      arguments:[{directory:true}],aliases:true,requiresBun:true,childProcesses:'inherit-selected-artifact',runtimeLaunchers:true,runtimeProfile:'compiler',
      setupReplacement:{kind:'selected-compiler-module-directory',sourceIds:modules.map(item=>item.id),
        replaces:'beforeAll compiler construction',preservedAssertions:'complete original test bodies and timeout parameters'}},
    expected:{kind:'seed-program',oracleRequired:true,stdout:''},
    original:{manifest:'stable-compatibility',suite,fixture:suite,host:suite,sourceSha256:(await file(suite)).sha256,
      regions:[helpers,bodies].map(({start,end,byteStart,byteEnd,sha256})=>({start,end,byteStart,byteEnd,sha256}))}});
  return [suite];
}
