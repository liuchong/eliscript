import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm, writeFile, symlink} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildBackends} from '../tools/backends/build.mjs';
import {instantiateManagedRuntimeWithHostModules} from '../tools/backends/managed-runtime.mjs';
import {instantiateNativeManagedRuntime} from '../tools/backends/native-managed-runtime.mjs';
import * as httpPlatform from '../platform/http.mjs';

const root = resolve(import.meta.dir, '..');
const options = {maxSlots:8192,initialBytes:262144,maxBytes:16777216};
const memory = {initialPages:4,maximumPages:1024};
const entry = 'tests/fixtures/wasm-managed-wire.mjs';
const sources = [
  ['stdlib/mdp.eli','stdlib/mdp.eli'],
  ['stdlib/mds.eli','stdlib/mds.eli'],
  ['stdlib/gepo.eli','stdlib/gepo.eli'],
  ['tests/fixtures/wire.mjs','tests/fixtures/wire.eli'],
  [entry,'tests/fixtures/wasm-managed-wire.eli'],
];
const nativeTarget = process.arch === 'arm64'
  ? (process.platform === 'darwin' ? 'arm64-macos' : process.platform === 'linux' ? 'arm64-linux' : null)
  : null;
let directory, backend, lowered, bytes, nativePath, referencePath, expected,runtimeIR,literalModules,originalModules;

// These are the complete 128 original nested records, not a reduced smoke set.
const roundtrips = [
  {version:'001',User:{name:'小明',nested:{ok:true},values:[1,null,'a|b'],rows:[{a:1,b:'x'},{b:false}],mixed:[{one:1},[2],'x']}},
  {x:'1e999',y:'\u0000\n',z:'{}',q:'[]'},
];
const originalScalars = [null,true,false,42,-1.25,'','{}','[]','null','😀','a|b','"quotes"','a\\n','\n\t',{},[]];
for (let index=0;index<128;index++) {
  const value=originalScalars[index%originalScalars.length];
  roundtrips.push({stamp:index,Data:{scalar:value,nested:{value},records:[{key:value,other:index},{other:index+1}],mixed:[value,{key:value},[value],{}]}});
}
const parseCases = [
  ['<!--\n# hidden\n-->\n```md\n- hidden: 1\n```\n# A\n- key: \\x\n### note\n## B\n- x: "\\q"\n',{}],
  ['# A\n| a | b |\n| --- | --- |\n| | null |\n',{}],
  ['# A\n- a:\n  - :\n    - k: 2\n  - : false\n',{}],
  ['- __proto__:\n  - polluted: true\n',{}],
  ['<span>inline</span>\n# A\n- ok: true',{}],
  ['\uFEFF# A\r\n- emoji: "😀"\r- value: 2\n',{}],
  ['~~~md\n# hidden\n- hidden: 1\n~~~\n# A\n- visible: true\n',{}],
  ['# A\n| a | b |\n| --- | --- |\n| "a\\|b" | "中😀" |\n',{}],
  ['## orphan',{}],['# A\n- x: 1\n| a | b |\n| --- | --- |',{}],
  ['- x: 1\n- x: 2',{}],['# A\n| a | b |\n| --- | --- |\n| 1 |',{}],
  ['# A\n| a | a |\n| --- | --- |',{}],['| a |\n| --- |',{}],['# ',{}],
  ['- a:\n    - b: 1',{}],['\t- a: 1',{}],['# ###',{}],
  ['# A\n| value |\n| --- |\n\t| 1 |',{}],
  ['- a: 1',{maxLength:2}],['- a: 1',{maxLength:6}],
  ['- a:\n  - b: 1',{maxDepth:0}],['- a: 1',{maxLength:0}],
  ['- a: 1',{maxDepth:-1}],['- a: 1',{maxDepth:513}],['- a: 1e999',{}],
  ['',{}],['\uFEFF\r\n',{}],
];
const originalErrorCodes = ['MDP-E001','MDP-E002','MDP-E003','MDP-E004','MDP-E005','MDP-E006','MDP-E007','MDP-E009','MDP-E009'];
const schema = {mds:'0.1',Sections:[{name:'User',kind:'object',required:true,additional:false}],User:[
  {name:'name',type:'string',required:true,min_len:2},{name:'age',type:'int',min:0,max:100},
],'User.Address':[{name:'zip',type:'string',pattern:'^\\d{5}$'}]};
const schemaCases = [
  [{User:{name:'😀中',age:42,Address:{zip:'12345'}},Extra:{}},schema],
  [{User:{name:'x',age:'42',unknown:true,Address:{zip:'bad'}}},schema],
  [{},schema],[{},{mds:'9'}],[{},{mds:'0.1',A:{}}],
  [{},{mds:'0.1',A:[{name:'n',type:'int',min:5,max:2}]}],
  [{A:{d:'2023-02-29'}},{mds:'0.1',A:[{name:'d',type:'date'}]}],
  ['# User\n- name: "😀中"\n- age: 42\n',schema],
  [{A:[{v:1},{v:2},{v:3}]},{mds:'0.1',Sections:[{name:'A',kind:'list',min_rows:1,max_rows:2,additional:false}],A:[{name:'v',type:'int',enum:'1, 2'}]}],
  [{title:'😀',A:{v:null}},{mds:'0.1',Preamble:[{name:'title',type:'string',min_len:1,max_len:1}],A:[{name:'v',type:'null',required:true}]}],
  [{},{mds:'0.1',A:[{name:'same',type:'int'},{name:'same',type:'string'}]}],
  [{},{mds:'0.1',A:[{name:'x',type:'unknown'}]}],
  [{},{mds:'0.1',A:[{name:'x',type:'string',required:1}]}],
  [{},{mds:'0.1',A:[{name:'x',type:'string',min_len:0.5}]}],
  [{},{mds:'0.1',A:[{name:'x',type:'string',enum:[]}]}],
  [{},{mds:'0.1',Sections:[{name:'A..B'}]}],
  [{},{mds:'0.1',Sections:[{name:'A',min_rows:5,max_rows:2}]}],
];
for (const value of ['0000-01-01','0000-02-29','0001-02-29','1900-02-29','2000-02-29','2024-02-29','2023-02-29','2024-04-31','9999-12-31','2024-1-01','2024-00-01','2024-01-00','2024-13-01']) {
  schemaCases.push([{A:{d:value}},{mds:'0.1',A:[{name:'d',type:'date'}]}]);
}
for (const value of [
  '0000-02-29T00:00:00Z','1900-02-29T12:00:00Z','2000-02-29T23:59:59Z',
  '2024-02-29T24:00:00Z','2024-02-29T24:00:00.000Z','2024-02-29T24:00:00.001Z',
  '2024-02-29T24:00:01Z','2024-02-29T23:59:60Z','2024-02-29t12:34:56z',
  '2024-02-29T12:34:56.1+05:30','2024-02-29T12:34:56.123456789-23:59',
  '2024-02-29T12:34:56.000000001Z','2024-02-29T12:34:56+24:00',
  '2024-02-29T12:34:56+00:60','2024-02-29T12:34:56','2024-02-29T12:34:56.Z',
]) schemaCases.push([{A:{d:value}},{mds:'0.1',A:[{name:'d',type:'datetime'}]}]);
for (const value of ['😀','😀中','e\u0301','\ud800','']) {
  schemaCases.push([{A:{text:value}},{mds:'0.1',A:[{name:'text',type:'string',min_len:1,max_len:1}]}]);
}
const operations = [{path:'/math/add',title:'Add',summary:'a + b'},{path:'/math',title:'Math'},{path:'/中文/😀',summary:'Unicode'}];
const gepoCases = [
  [0,{path:'/math/add',title:'Add\r\nInjected',failures:['400','500'],summary:'sum'}],
  ...['/','/math','/math/add','/missing'].map(location=>[1,{title:'Example',operations,location}]),
  [1,{title:'Empty',operations:[],location:'/'}],
  [1,{title:'Duplicate',operations:[{path:'/a'},{path:'/a'}],location:'/'}],
  [2,'https://example.test/a?secret=x#fragment'],[2,'https://example.test/'],
  [2,'https://user:password@example.test'],[2,'file:///tmp/value'],
  [3,{status:200,contentType:'text/markdown',body:'# Example\n\nGEPO 0.2\n\n## Children\n\n- `/a`\n- `/a`\n- `/中文`\n'}],
  [3,{status:200,contentType:'text/plain; charset=utf-8',body:'GEPO 0.2\nPath: `/`\nKind: operation\n## Children\nNo immediate child paths.\n'}],
  [3,{status:200,contentType:'text/markdown',body:'GEPO 0.2\n## Children\nThe visible capability set is empty.\n'}],
  [3,{status:200,contentType:'text/html',body:'<html>GEPO</html>'}],
  [3,{status:404,contentType:'text/plain',body:'GEPO 0.2'}],
  [3,{status:200,contentType:null,body:'GEPO 0.2'}],
  [4,{path:'/valid',title:'Valid'}],[5,{path:'/valid'}],
];
for (const path of ['relative','/a/../b','/a/./b','/a//b','/a/','/a b','/a?b','/a#b','/a`b','/a\\b','/.gepo','/.gepo/a','/.well-known/gepo','/%2e%2e/a']) gepoCases.push([4,{path}]);
const cases = [
  {name:'original codec',fn:'original-codec-report',args:[]},
  ...roundtrips.map((value,index)=>({name:'MDP roundtrip '+index,fn:'roundtrip-report',args:[JSON.stringify(value)]})),
  ...parseCases.map(([value,settings],index)=>({name:'MDP parse '+index,fn:'parse-report',args:[value,JSON.stringify(settings)]})),
  ...Array.from({length:10},(_,mode)=>({name:'MDP invalid encode '+mode,fn:'invalid-encode',args:[mode]})),
  ...schemaCases.map(([document,specification],index)=>({name:'MDS validate '+index,fn:'validate-report',args:[JSON.stringify(document),JSON.stringify(specification)]})),
  ...gepoCases.map(([mode,value],index)=>({name:'GEPO pure '+index,fn:'gepo-pure-report',args:[mode,JSON.stringify(value)]})),
];

// The four original HTTP suites retain their actual assertions and host
// callbacks. Only these four library entry points are supplied by the target.
async function httpContracts({createService,createClient,discoveryCandidates,pathIndexMarkdown}) {
  let calls=0;
  const service=createService({title:'Example',operations:[
    {path:'/math/add',title:'Add',request:'JSON a,b',success:'200 JSON sum',effect:'Read only',execute:async request=>{calls++;const {a,b}=await request.json();return Response.json({sum:a+b});}},
    {path:'/math',title:'Math',execute:()=>new Response('math')},
  ]});
  const transport=(url,settings)=>service(new Request(url,settings));
  const client=createClient({fetch:transport});
  const discovery=await client.discover('https://example.test/');
  assert.equal(discovery.state,'found');assert.deepEqual([...discovery.paths],['/math']);
  const index=await client.index('https://example.test/math?secret=removed');
  assert.match(index.body,/operation and directory/u);assert.match(index.body,/`\/math\/add`/u);
  assert.match((await client.usage('https://example.test/math/add?.gepo&x=1')).body,/POST `\/math\/add`/u);
  assert.equal(calls,0);
  await assert.rejects(client.invoke('https://example.test/math/add','{}'));assert.equal(calls,0);
  const reply=await client.invoke('https://example.test/math/add','{"a":2,"b":3}',{allowPost:true,contentType:'application/json'});
  assert.deepEqual(JSON.parse(reply.body),{sum:5});assert.equal(calls,1);
  assert.equal((await service(new Request('https://example.test/math/add?.gepo=false'))).status,200);
  assert.equal((await service(new Request('https://example.test/math/add',{method:'HEAD'}))).body,null);
  const headIndex=await service(new Request('https://example.test/.gepo',{method:'HEAD'}));
  assert.equal(headIndex.status,200);assert.equal(headIndex.body,null);
  assert.equal((await service(new Request('https://example.test/.gepo',{method:'OPTIONS'}))).headers.get('Allow'),'GET, HEAD, OPTIONS');
  assert.equal((await service(new Request('https://example.test/.gepo',{method:'POST'}))).status,405);
  assert.equal((await service(new Request('https://example.test/math',{method:'DELETE'}))).status,405);

  const urls=[];
  const fallback=createClient({fetch:async(url,settings)=>{
    urls.push(String(url));assert.equal(settings.redirect,'manual');
    if(urls.length===1)return new Response('<html>GEPO</html>',{headers:{'Content-Type':'text/html'}});
    return new Response(pathIndexMarkdown('Empty',[],'/'),{headers:{'Content-Type':'text/markdown'}});
  }});
  assert.equal((await fallback.discover('https://example.test/?secret=x#fragment')).state,'empty');
  assert.deepEqual(urls,['https://example.test/?.gepo','https://example.test/.gepo']);
  assert.equal(discoveryCandidates('https://example.test/a?secret=x')[0],'https://example.test/a?.gepo');
  const rootService=createService({operations:[{path:'/',execute:()=>new Response('root')}]});
  const rootClient=createClient({fetch:(url,settings)=>rootService(new Request(url,settings))});
  assert.equal((await rootClient.discover('https://example.test')).state,'found');
  assert.throws(()=>createService({operations:[{path:'/a/../b',execute(){}}]}));
  await assert.rejects(fallback.discover('https://user:password@example.test'));

  let forbiddenCalls=0;
  const forbidden=createService({operations:[{path:'/private',execute:()=>{forbiddenCalls++;return new Response('done');}}],authorize:()=>false});
  assert.equal((await forbidden(new Request('https://example.test/private',{method:'POST'}))).status,403);assert.equal(forbiddenCalls,0);
  const bounded=createClient({fetch:async()=>new Response('12345'),maxBytes:4});
  await assert.rejects(bounded.usage('https://example.test/a'),/limit/u);
  const redirect=createClient({fetch:async()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.test/'}})});
  await assert.rejects(redirect.usage('https://example.test/a'),/Redirect/u);
  let posts=0;
  const loss=createClient({fetch:async(url,settings)=>{if(settings.method==='POST'){posts++;throw new Error('lost');}return new Response('usage');}});
  await assert.rejects(loss.invoke('https://example.test/a','',{allowPost:true}),/lost/u);assert.equal(posts,1);
  const timeout=createClient({fetch:()=>new Promise(()=>{}),timeoutMs:10});
  await assert.rejects(timeout.usage('https://example.test/a'),/timeout/u);
  const stalledBody=createClient({fetch:async()=>new Response(new ReadableStream({pull(){}})),timeoutMs:10});
  await assert.rejects(stalledBody.usage('https://example.test/a'),/timeout/u);
  const aborted=new AbortController();aborted.abort(new Error('cancelled'));let requests=0;
  const cancelled=createClient({fetch:async()=>{requests++;return new Response('bad');}});
  await assert.rejects(cancelled.usage('https://example.test/a',{signal:aborted.signal}),/cancelled/u);assert.equal(requests,0);

  const identity=createService({operations:[
    {path:'/public/read',execute:()=>Response.json({ok:true})},{path:'/private/read',execute:()=>new Response('secret')},
  ],visible:(request,operation)=>!operation.path.startsWith('/private')||request.headers.get('Authorization')==='example-user',
  authorize:request=>request.method!=='POST'?true:new Response('Sign in',{status:401})});
  const publicIndex=await(await identity(new Request('https://example.test/?.gepo'))).text();
  assert.match(publicIndex,/`\/public`/u);assert(!publicIndex.includes('/private'));
  const privateIndex=await(await identity(new Request('https://example.test/?.gepo',{headers:{Authorization:'example-user'}}))).text();
  assert.match(privateIndex,/`\/private`/u);
  assert.equal((await identity(new Request('https://example.test/public/read',{method:'POST'}))).status,401);
  const notFound=createClient({fetch:async()=>new Response('ordinary site')});
  const failure=await notFound.discover('https://example.test');assert.equal(failure.state,'not-found');assert.equal(failure.attempts.length,3);
  const json=createClient({fetch:async()=>Response.json({protocol:'GEPO',children:['/api']}),classify:response=>{
    const body=JSON.parse(response.body);return{accepted:body.protocol==='GEPO',paths:body.children,empty:!body.children.length};
  }});
  assert.deepEqual([...(await json.discover('https://example.test')).paths],['/api']);
  return{hierarchical:true,fallback:true,authorization:true,bounds:true,redirects:true,lostPosts:posts,timeouts:true,cancelledRequests:requests,visibility:true,customClassifier:true};
}

async function run(command) {
  const child=spawn(command[0],command.slice(1),{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('wire reference subprocess timeout: '+command[0]+'\n'+stderr));},30000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);if(code!==0)reject(new Error('wire reference failed '+code+'/'+signal+'\n'+stderr+'\n'+stdout));else resolve(stdout.trim());});
  });
}
const hostCommands = [
  [process.env.NODE??'node','--experimental-loader',resolve(root,'tests/fixtures/compiled-eli-node-loader.mjs')],
  [process.execPath,'--preload',resolve(root,'tests/fixtures/compiled-eli-bun-preload.mjs')],
];

beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'eliscript-managed-wire-'));
  backend=await buildBackends({outputRoot:directory});
  runtimeIR=backend.compiler.compile_ir_string(await readFile(resolve(root,'bootstrap/runtime/memory.eli'),'utf8'),'runtime.eli');
  ({literalModules}=await backend.loadLiteralModules());
  const modules=[];
  for(const[id,filename]of sources)modules.push({id,program:backend.compiler.compile_ir_string(await readFile(resolve(root,filename),'utf8'),filename)});
  const originalIR=JSON.stringify(modules),libraryIR=JSON.stringify(literalModules);
  originalModules=modules;
  lowered=backend.managed.lower_managed_project(modules,entry,runtimeIR,{...memory,literalModules});
  bytes=Uint8Array.from(backend.wasm.append_metadata_section(backend.wasm.emit_typed_memory_wasm(lowered.typed,memory),'eliscript-managed-control',JSON.stringify(lowered.descriptor)));
  assert.equal(JSON.stringify(modules),originalIR);assert.equal(JSON.stringify(literalModules),libraryIR);
  for(const id of ['runtime/wire/markdown.mjs','runtime/wire/schema.mjs','runtime/wire/http-rpc.mjs'])assert(lowered.privateModules.some(path=>path.endsWith('/'+id)),id+' must execute its actual pure module');
  assert(lowered.descriptor.hostModules.some(item=>item.specifier==='eliscript/platform/http.mjs'));
  const actualImports=WebAssembly.Module.imports(new WebAssembly.Module(bytes));
  assert.deepEqual(actualImports.map(item=>[item.module,item.name,item.kind]),lowered.descriptor.hostCapabilities.map(item=>[item.module,item.name,'function']));
  for(const item of actualImports)assert.equal(item.module,'eliscript.host');
  if(nativeTarget){
    nativePath=resolve(directory,nativeTarget==='arm64-linux'?'wire.so':'wire.dylib');
    await writeFile(nativePath,Uint8Array.from(backend.native.emit_typed_native_memory_library(lowered.typed,nativeTarget)));
  }
  const reference=resolve(directory,'reference');referencePath=resolve(reference,entry);
  await mkdir(resolve(reference,'node_modules'),{recursive:true});
  await symlink(resolve(root,'runtime'),resolve(reference,'runtime'),'dir');
  await symlink(root,resolve(reference,'node_modules/eliscript'),'dir');
  for(const module of modules){const output=resolve(reference,module.id);await mkdir(dirname(output),{recursive:true});await writeFile(output,backend.compiler.emit_ir_string(module.program));}
  const oracle=resolve(directory,'original-wire-oracle.mjs');
  await writeFile(oracle,`import assert from 'node:assert/strict';
import * as http from ${JSON.stringify(pathToFileURL(resolve(root,'runtime/wire/http-rpc.mjs')).href)};
const fixture=await import(${JSON.stringify(pathToFileURL(referencePath).href)});
const records=${JSON.stringify(cases)};
const results=[];for(const record of records)results.push(JSON.parse(await fixture[record.fn.replaceAll('-','_')](...record.args)));
const httpContracts=${httpContracts.toString()};
console.log(JSON.stringify({results,negativeZero:fixture.parse_negative_zero(),http:await httpContracts(http)}));\n`);
  for(const command of hostCommands){
    const observation=JSON.parse(await run([...command,oracle]));
    if(expected)assert.deepEqual(observation,expected,'independent Node and Bun original wire implementations');else expected=observation;
    const original=JSON.parse(await run([...command,resolve(root,'tests/fixtures/wire-host.mjs'),resolve(reference,'tests/fixtures/wire.mjs')]));
    assert.deepEqual(original,{codec:true,discovery:true,usageSafe:true,post:true});
  }
  assert.equal(roundtrips.length,130);
  for(let index=0;index<roundtrips.length;index++)assert.deepEqual(expected.results[index+1].value,roundtrips[index]);
  const parseOffset=1+roundtrips.length;
  assert.deepEqual(expected.results[parseOffset+3].value,JSON.parse('{"__proto__":{"polluted":true}}'));assert.equal({}.polluted,undefined);
  for(let index=0;index<originalErrorCodes.length;index++){
    const actual=expected.results[parseOffset+8+index];assert.equal(actual.ok,false);assert.equal(actual.error.code,originalErrorCodes[index]);assert(actual.error.line>0);
  }
  const schemaOffset=parseOffset+parseCases.length+10;
  assert.deepEqual(expected.results[schemaOffset].value,{valid:true,errors:[]});
  assert.equal(expected.results[schemaOffset+1].value.valid,false);
  for(const rule of ['min_len','type','additional','pattern'])assert(expected.results[schemaOffset+1].value.errors.some(error=>error.rule===rule));
  assert.equal(expected.results[schemaOffset+2].value.errors[0].rule,'required');
  assert.equal(expected.results[schemaOffset+6].value.valid,false);
  assert.equal(expected.negativeZero,true);
  const payload={User:{name:'小明😀',tags:['中文','a|b'],nested:{ok:true}}};
  const original=resolve(directory,'original-roundtrip.mjs');
  await writeFile(original,`const fixture=await import(${JSON.stringify(pathToFileURL(referencePath).href)});console.log(fixture.original_roundtrip(${JSON.stringify(JSON.stringify(payload))}));\n`);
  for(const command of hostCommands)assert.deepEqual(JSON.parse(await run([...command,original])),payload);
},120000);

afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

function finish(runtime){runtime.closeModule();runtime.collect();assert.equal(runtime.stats().frameDepth,0);assert.equal(runtime.live(),0);}
function pinArguments(runtime,values){return values.map(value=>typeof value==='string'?runtime.string(value):runtime.fromHostValue(value));}
function call(runtime,name,values=[]){
  const arguments_=pinArguments(runtime,values);let result;
  try{result=runtime.invoke(name,arguments_);return runtime.readString(result);}finally{if(result)runtime.release(result);for(const value of arguments_)runtime.release(value);}
}
async function callAsync(runtime,name,values=[]){
  const arguments_=pinArguments(runtime,values);let result;
  try{result=await runtime.invokeAsync(name,arguments_);return runtime.readString(result);}finally{if(result)runtime.release(result);for(const value of arguments_)runtime.release(value);}
}
function hostCall(runtime,name,values){
  const arguments_=pinArguments(runtime,values);let result;
  try{result=runtime.invoke(name,arguments_);return runtime.toHostValue(result);}finally{if(result)runtime.release(result);for(const value of arguments_)runtime.release(value);}
}
function targetHTTP(runtime){return{
  createService:settings=>hostCall(runtime,'http-service',[settings]),
  createClient:settings=>hostCall(runtime,'http-client',[settings]),
  discoveryCandidates:url=>hostCall(runtime,'http-candidates',[url]),
  pathIndexMarkdown:(title,operations,location='/')=>hostCall(runtime,'http-index',[title,operations,location]),
};}
async function checkCorpus(runtime){
  for(let index=0;index<cases.length;index++){
    const record=cases[index];
    try{assert.deepEqual(JSON.parse(call(runtime,record.fn,record.args)),expected.results[index],record.name);}
    catch(error){if(error&&typeof error==='object')error.wireCase={index,name:record.name,filename:sources.at(-1)[1]};throw error;}
    runtime.collect();assert.equal(runtime.stats().frameDepth,0,record.name+' frames');
  }
  const negative=runtime.invoke('parse-negative-zero');try{assert.equal(runtime.toHostValue(negative),true);}finally{runtime.release(negative);}
  assert.equal({}.polluted,undefined);
  assert.deepEqual(await httpContracts(targetHTTP(runtime)),expected.http);
  assert.equal(runtime.stats().frameDepth,0);
}
function platformOptions(){return{...options,
  hostModules:new Map([['eliscript/platform/http.mjs',httpPlatform]]),
  importModule(specifier){assert.equal(specifier,'eliscript/platform/http.mjs');return httpPlatform;},
};}

async function checkNetwork(runtime){
  const originalPayload={User:{name:'小明😀',tags:['中文','a|b'],nested:{ok:true}}};
  assert.deepEqual(JSON.parse(call(runtime,'original-roundtrip',[JSON.stringify(originalPayload)])),originalPayload);
  const api=targetHTTP(runtime);let calls=0;
  const serve=api.createService({title:'Example',operations:[{path:'/rpc/echo',title:'Echo',execute:async request=>{
    calls++;return new Response(await request.text(),{headers:{'Content-Type':'text/markdown; variant=mdp'}});
  }}]});
  const server=createServer(async(request,response)=>{
    try{
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const result=await serve(new Request('http://127.0.0.1:'+server.address().port+request.url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
      response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());
    }catch(error){response.writeHead(500);response.end('Server error');server.lastWireError=error;}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin='http://127.0.0.1:'+server.address().port,client=api.createClient({timeoutMs:3000});
    assert.equal((await client.discover(origin)).state,'found');
    assert.match((await client.index(origin+'/rpc')).body,/`\/rpc\/echo`/u);
    await client.usage(origin+'/rpc/echo');assert.equal(calls,0);
    assert.equal((await client.invoke(origin+'/rpc/echo','- value: 42\n',{allowPost:true,contentType:'text/markdown; variant=mdp'})).body,'- value: 42\n');assert.equal(calls,1);
    const payload={User:{name:'中文😀',nested:[1,{ok:true}]}};
    assert.deepEqual(JSON.parse(await callAsync(runtime,'original-echo',[origin+'/rpc/echo',JSON.stringify(payload)])),payload);assert.equal(calls,2);
    if(server.lastWireError)throw server.lastWireError;
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(runtime.stats().frameDepth,0);
}

for(const auto of [65536,1])test('Given complete original wire corpus and actual HTTP capabilities when WASM executes MDP MDS and GEPO at auto('+auto+') then independent Node and Bun observations and cleanup agree',async()=>{
  const runtime=await instantiateManagedRuntimeWithHostModules(bytes,platformOptions());runtime.auto(auto);
  try{await checkCorpus(runtime);await checkNetwork(runtime);}finally{finish(runtime);}
},120000);
test.skipIf(!nativeTarget)('Given the identical complete wire graph when actual native code executes original codecs schema discovery and real HTTP then Node and Bun expectations and roots agree',async()=>{
  const runtime=await instantiateNativeManagedRuntime(nativePath,lowered,{...platformOptions(),...memory,nativeTarget});runtime.auto(1);
  try{await checkCorpus(runtime);await checkNetwork(runtime);}finally{try{finish(runtime);}finally{runtime.close();}}
},120000);

function visitNodes(program,visit){
  const pending=[...program.body];
  while(pending.length){const node=pending.pop();visit(node);pending.push(...node.children);}
}

test('Given the actual wire library relative transport dependency When the private literal graph links Then only its exact HTTP edge becomes the existing canonical host capability',()=>{
  const library=literalModules.find(item=>item.id==='runtime/wire/http-rpc.mjs');
  const dependency=library.program.body.flatMap(node=>node.kind==='module-declaration'?node.children:[node])
    .find(node=>node.kind==='import-declaration'&&node.value==='../../platform/http.mjs');
  assert(dependency,'the source retains its relative repository dependency');
  assert(lowered.descriptor.hostModules.some(item=>item.specifier==='eliscript/platform/http.mjs'));
  assert(!lowered.descriptor.hostModules.some(item=>item.specifier==='../../platform/http.mjs'));
  for(const replacement of ['../../platform/worker.mjs','../../platform/http.mjs?changed','../platform/http.mjs']){
    const changed=structuredClone(literalModules),copy=changed.find(item=>item.id===library.id);
    visitNodes(copy.program,node=>{if(node.kind==='import-declaration'&&node.value===dependency.value)node.value=replacement;});
    const before=structuredClone(changed);
    assert.throws(()=>backend.managed.link_managed_project(originalModules,entry,{literalModules:changed}),
      error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
    assert.deepEqual(changed,before,'failed host linking preserves all input nodes');
  }
  const wrongOwner=structuredClone(literalModules);
  const markdown=wrongOwner.find(item=>item.id==='runtime/wire/markdown.mjs');
  const declaration=structuredClone(dependency);
  // This relative spelling normalizes to the same path from the sibling ID,
  // which must still not inherit the HTTP library's declared host authority.
  const body=markdown.program.body[0]?.kind==='module-declaration'?markdown.program.body[0].children:markdown.program.body;
  body.unshift(declaration);
  assert.throws(()=>backend.managed.link_managed_project(originalModules,entry,{literalModules:wrongOwner}),
    error=>error.eliscriptDiagnostic?.code==='ELI-B0001');
},120000);

test('Given ordinary IR literals with omitted or empty optional metadata When linked and executed Then input nodes signed zero NaN and explicit undefined flags stay distinct',async()=>{
  const source=`(defun flags ()
    (JSON/stringify (js-array (Object/is -0.0 0.0) (Object/is -0.0 -0.0)
      (Number/isNaN (get globalThis/Number :NaN)) (undefined? undefined)
      (nil? nil) (eq false nil) (get (js-object :alpha -0.0) :alpha)
      (Object/is (get (js-object :alpha -0.0) :alpha) -0.0))))
    (export flags)`;
  const original=backend.compiler.compile_ir_string(source,'optional-literal-metadata.eli');
  const javascript=backend.compiler.emit_ir_string(original);
  const reference=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
  const expectedFlags=reference.flags();
  assert.deepEqual(JSON.parse(expectedFlags),[false,true,true,true,true,false,0,true]);
  for(const empty of [false,true]){
    const program=structuredClone(original);let ordinary=0,undefinedCount=0;
    visitNodes(program,node=>{
      if(node.kind!=='literal')return;
      if(node.properties?.literalKind==='undefined'){undefinedCount++;return;}
      if(node.properties?.literalKind!==undefined)return;
      ordinary++;if(empty)node.properties={};else delete node.properties;
    });
    assert(ordinary>0);assert(undefinedCount>0);
    const modules=[{id:'optional.mjs',program}],before=structuredClone(modules);
    const result=backend.managed.lower_managed_project(modules,'optional.mjs',runtimeIR,{...memory,literalModules});
    assert.deepEqual(modules,before,'lowering never adds metadata or rewrites original literal values');
    const emitted=Uint8Array.from(backend.wasm.append_metadata_section(
      backend.wasm.emit_typed_memory_wasm(result.typed,memory),'eliscript-managed-control',JSON.stringify(result.descriptor)));
    const runtime=await instantiateManagedRuntimeWithHostModules(emitted,platformOptions());runtime.auto(1);
    try{assert.equal(call(runtime,'flags'),expectedFlags);assert.equal(runtime.stats().frameDepth,0);}
    finally{finish(runtime);}
  }
  for(const properties of [null,false,[],42]){
    const program=structuredClone(original);let changed=false;
    visitNodes(program,node=>{if(!changed&&node.kind==='literal'&&typeof node.value==='number'){node.properties=properties;changed=true;}});
    assert(changed);
    const before=structuredClone(program);
    assert.throws(()=>backend.managed.link_managed_project([{id:'invalid.mjs',program}],'invalid.mjs',{literalModules}),
      error=>error.eliscriptDiagnostic?.code==='ELI-I0001','explicit malformed metadata is not an absent optional field');
    assert.deepEqual(program,before);
  }
  for(const literalKind of ['unknown',null]){
    const program=structuredClone(original);let changed=false;
    visitNodes(program,node=>{if(!changed&&node.kind==='literal'&&typeof node.value==='number'){node.properties={literalKind};changed=true;}});
    const before=structuredClone(program);
    assert.throws(()=>backend.managed.lower_managed_project([{id:'tagged.mjs',program}],'tagged.mjs',runtimeIR,{...memory,literalModules}),
      error=>error.eliscriptDiagnostic?.code==='ELI-B0001','an explicit unsupported literal tag cannot become an ordinary literal');
    assert.deepEqual(program,before);
  }
},120000);
