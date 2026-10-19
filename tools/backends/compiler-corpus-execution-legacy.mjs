import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, symlink,lstat} from 'node:fs/promises';
import {resolve, join,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Console} from 'node:console';
import {Writable} from 'node:stream';
import {instantiateManagedRuntime,instantiateManagedRuntimeWithHostModules} from './managed-runtime.mjs';
import {independentCompilerResources,buildIndependentCompiler} from './compiler-build.mjs';
import {openCompilerArtifact,archiveCompilerArtifact,normalizeCompilerHost,saveCompilerMetadata} from './compiler-bootstrap.mjs';
import {prepareOriginalCompilerGenerations} from './compiler-corpus-generations.mjs';
import {prepareOriginalReferenceArtifact} from './compiler-corpus-reference.mjs';
import {encodeCompilerIR,encodeCompilerMetadata} from './compiler-session.mjs';

function valueRecord(value) {
  if (value === undefined) return {$eliscriptObservation: 'undefined'};
  if (typeof value === 'bigint') return {$eliscriptObservation:'bigint',decimal:String(value)};
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return {$eliscriptObservation: '-0'};
    if (!Number.isFinite(value)) return {$eliscriptObservation: String(value)};
  }
  if (Array.isArray(value)) return value.map(valueRecord);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueRecord(item)]));
  }
  return value;
}

function managedValue(a, value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.kind === 4) return a.readNumber(value);
  if (value.kind === 5) return a.readString(value);
  if (value.kind === 34) return a.readBigInt(value);
  if(value.kind===13){
    const result={},keys=a.objectKeys(value);
    try{for(let index=0;index<a.length(keys);index++){
      const key=a.get(keys,index),child=a.objectGet(value,key);
      try{Object.defineProperty(result,a.readString(key),{value:managedValue(a,child),enumerable:true,writable:true,configurable:true});}
      finally{a.release(child);a.release(key);}
    }}finally{a.release(keys);}
    return result;
  }
  if (value.kind !== 14) throw new TypeError('original corpus observation has an unsupported source value kind');
  return Array.from({length: a.length(value)}, (_, index) => {
    const child = a.get(value, index);
    try {return managedValue(a, child);} finally {a.release(child);}
  });
}

function fromRecipe(value, results) {
  if(Array.isArray(value))return value.map(item=>fromRecipe(item,results));
  if(value===null||typeof value!=='object')return value;
  if(Object.keys(value).length===1&&Object.hasOwn(value,'$compilerCorpusRef')){
    const [step,...path]=value.$compilerCorpusRef.split('.');
    if(!results.has(step))throw new Error('original request sequence references an unavailable step');
    let result=results.get(step);for(const part of path){if(result===null||!Object.hasOwn(result,part))throw new Error('original request sequence references an unavailable result');result=result[part];}
    return structuredClone(result);
  }
  if(Object.keys(value).length===1&&Object.hasOwn(value,'$compilerCorpusConcat'))return fromRecipe(value.$compilerCorpusConcat,results).join('');
  if(Object.keys(value).length===1&&Object.hasOwn(value,'$compilerCorpusReplace')){const [source,before,after]=fromRecipe(value.$compilerCorpusReplace,results);return source.replace(before,after);}
  if(Object.keys(value).length===1&&Object.hasOwn(value,'$compilerCorpusJsonPatch')){
    const [source,patches]=fromRecipe(value.$compilerCorpusJsonPatch,results),document=JSON.parse(source);
    for(const patch of patches){
      let owner=document;for(const part of patch.path.slice(0,-1))owner=owner[part];
      const key=patch.path.at(-1);
      if(Object.hasOwn(patch,'duplicateIndex')){
        const array=owner[key],index=patch.duplicateIndex;
        if(!Array.isArray(array)||!Number.isSafeInteger(index)||index<0||index>=array.length||!Object.hasOwn(array,index)||
          Object.hasOwn(patch,'append')||Object.hasOwn(patch,'value')||Object.hasOwn(patch,'negativeZero'))
          throw new TypeError('original corpus duplicateIndex must select one existing own array element');
        array.push(structuredClone(array[index]));
      }
      else if(Object.hasOwn(patch,'append'))owner[key].push(patch.append);
      else owner[key]=patch.negativeZero?-0:patch.value;
    }
    const wire=item=>{
      if(typeof item==='number'&&Object.is(item,-0))return '-0';
      if(Array.isArray(item))return '['+item.map(wire).join(',')+']';
      if(item!==null&&typeof item==='object')return '{'+Object.keys(item).map(key=>JSON.stringify(key)+':'+wire(item[key])).join(',')+'}';
      return JSON.stringify(item);
    };
    return wire(document);
  }
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fromRecipe(item,results)]));
}
export {fromRecipe as resolveOriginalCorpusRequest};

async function childOutput(command,args,{cwd,signal,env,timeoutMs}={}){
  if(timeoutMs!==undefined&&(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0))throw new TypeError('original host deadline must retain its positive integer timeout');
  return new Promise((accept,reject)=>{
    const child=spawn(command,args,{cwd,signal,env:env?{...process.env,...env}:process.env,stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];
    let timer,termination,expired=false;
    if(timeoutMs!==undefined)timer=setTimeout(()=>{
      expired=true;child.kill('SIGTERM');
      termination=setTimeout(()=>child.kill('SIGKILL'),1000);termination.unref();
    },timeoutMs);
    const clear=()=>{clearTimeout(timer);clearTimeout(termination);};
    child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stderr.push(chunk));child.once('error',error=>{clear();reject(error);});
    child.once('close',code=>{
      clear();
      if(expired){const error=new Error('original corpus host exceeded its '+timeoutMs+' ms timeout');error.code='ELISCRIPT_ORIGINAL_HOST_TIMEOUT';error.timeoutMs=timeoutMs;reject(error);}
      else if(code===0)accept(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim()||'corpus host exited with '+code));
    });
  });
}

function box(a,value){
  if(typeof value==='bigint')return a.bigint(value);
  if(typeof value==='number')return a.number(value);if(typeof value==='string')return a.string(value);
  if(value===null||typeof value!=='object')return value;
  const children=[];
  try{
    if(Array.isArray(value)){const items=value.map(item=>{const child=box(a,item);children.push(child);return child;});return a.sourceArray(items);}
    const items=Object.fromEntries(Object.entries(value).map(([key,item])=>{const child=box(a,item);children.push(child);return[key,child];}));return a.sourceObject(items);
  }finally{children.forEach(child=>a.release(child));}
}

async function originalProgramAliases(artifact,record){
  const directory=artifact.directory??resolve(artifact.path,'..');
  const modules=artifact.target==='javascript'?artifact.modules:artifact.descriptor?.project?.modules;
  if(!Array.isArray(modules))throw new Error('original host oracle requires actual phased module exports');
  for(const module of modules){
    if(typeof module.id!=='string'||!module.id.endsWith('.mjs'))throw new TypeError('original program module identity must end in .mjs');
    const alias=module.id.slice(0,-4)+'.eli',file=resolve(directory,alias);
    if(module.id.startsWith('/')||module.id.split('/').some(part=>!part||part==='.'||part==='..')||/[\\:\u0000]/.test(module.id))throw new TypeError('original program alias escapes the product');
    await mkdir(resolve(file,'..'),{recursive:true});
    const base='./'+module.id.split('/').at(-1);
    const hasDefault=module.exports?.some(item=>item.name==='default');
    await writeFile(file,'export * from '+JSON.stringify(base)+';\n'+(hasDefault?'export {default} from '+JSON.stringify(base)+';\n':''));
  }
  await javascriptEnvironment(artifact,record.sourceRoot);
  try{await symlink(resolve(record.sourceRoot,'runtime'),resolve(directory,'runtime'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
}

async function originalProgramSidecars(artifact,record){
  const directory=resolve(artifact.directory??resolve(artifact.path,'..'));
  async function put(id,source){
    if(typeof id!=='string'||!id||/[\\:\u0000]/.test(id)||id.split('/').some(part=>!part||part==='.'||part==='..')||typeof source!=='string')throw new TypeError('invalid original provider sidecar');
    const path=resolve(directory,id),part=relative(directory,path);
    if(isAbsolute(part)||part==='..'||part.startsWith('..'+sep))throw new TypeError('original provider sidecar escapes its artifact');
    let parent=directory;
    for(const segment of id.split('/').slice(0,-1)){
      parent=join(parent,segment);await mkdir(parent,{recursive:true});
      const details=await lstat(parent);if(details.isSymbolicLink()||!details.isDirectory())throw new TypeError('original provider sidecar traverses an alias');
    }
    try{await writeFile(path,source,{flag:'wx'});}catch(error){
      if(error.code!=='EEXIST')throw error;
      const details=await lstat(path);if(details.isSymbolicLink()||!details.isFile()||!(await readFile(path)).equals(Buffer.from(source)))throw new Error('original provider sidecar conflicts with emitted source');
    }
    return path;
  }
  for(const source of record.request.hostSources??[])await put(source.id,source.source);
  if(record.execution.hostSource!==null&&record.execution.hostSource!==undefined)return put(record.execution.host,record.execution.hostSource);
  return record.execution.host?resolve(record.sourceRoot,record.execution.host):null;
}

export function originalProgramArguments(contract,entry,base){
  const records=contract.arguments??(contract.argumentModules??[entry]).map(module=>({module}));
  if(!Array.isArray(records))throw new TypeError('original program arguments must be an array');
  return records.map(record=>{
    if(record===null||typeof record!=='object'||Array.isArray(record)||Object.keys(record).length!==1)
      throw new TypeError('original program requires an explicit argument recipe');
    if(Object.hasOwn(record,'literal')){
      if(typeof record.literal!=='string')throw new TypeError('original program literal argument must be text');
      return record.literal;
    }
    if(Object.hasOwn(record,'directory')){
      if(record.directory!==true)throw new TypeError('original program directory argument must select its artifact');
      return fileURLToPath(new URL('./',base));
    }
    const id=record.module;
    if(typeof id!=='string'||!id||/[\\:\u0000]/.test(id)||id.split('/').some(part=>!part||part==='.'||part==='..'))
      throw new TypeError('original program module argument must stay inside its artifact');
    const url=new URL(id.split('/').map(encodeURIComponent).join('/'),base);
    return contract.argument==='url'?url.href:fileURLToPath(url);
  });
}

async function originalCompilerSourceMaps(context) {
  const {record, artifact, session, signal, target} = context;
  if (!record.execution.compilerSourceMaps || target === 'javascript') return [];
  const modules = record.modules ?? record.request.modules;
  if (!Array.isArray(modules) || modules.length === 0) throw new TypeError('original compiler source maps require the entire original source graph');
  const request = {...record.request, operation: 'project', modules, entry: record.entry ?? record.request.entry,
    target: 'javascript', sourceMap: true, debug: false, phased: false};
  const response = await session.request(request, {signal});
  const support = await context.archiveProduct(response, 'original-compiler-javascript-maps', 'javascript');
  assert.equal(support.target, 'javascript');
  assert.deepEqual(support.modules.map(module => module.id).sort(), modules.map(module => module.id).sort());
  const maps = [];
  for (const module of support.modules) {
    if (typeof module.sourceMapPath !== 'string') throw new Error('original compiler JavaScript source map was not emitted');
    const source = await readFile(module.sourceMapPath, 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), module.sourceMapSha256);
    maps.push({id: module.id + '.map', source});
  }
  // Only the separately produced map bytes are placed beside the binary ESM
  // facades. The companion JavaScript implementation remains in its separately
  // identified archive and is never imported as the selected target program.
  await originalProgramSidecars(artifact, {request: {hostSources: maps}, execution: {}});
  return [{role: 'original-compiler-javascript-source-maps', target: 'javascript',
    directory: relative(context.directory, support.directory).split(sep).join('/'), identitySha256: support.identitySha256}];
}

async function executeOriginalProgram(context){
  const {artifact,record,target,sourceRoot,signal}=context;
  const supplied=context.options??{},resources=record.execution.runtimeProfile==='compiler'?independentCompilerResources(supplied):null;
  const configured=resources?{...supplied,profile:resources.profile,budget:resources.budget,memory:resources.memory,auto:resources.auto,runtimeOptions:{...resources.budget,auto:resources.auto,...supplied.runtimeOptions}}:supplied;
  const options={...configured,...(record.memory?{memory:structuredClone(record.memory)}:{}),
    runtimeOptions:{...configured.runtimeOptions,...record.execution.runtimeOptions}};
  context={...context,options};
  const supportingProducts=await originalCompilerSourceMaps(context);
  if(record.execution.zeroImports===true&&target==='wasm'){
    const module=new WebAssembly.Module(new Uint8Array(await readFile(artifact.path)));
    assert.deepEqual(WebAssembly.Module.imports(module),[],'original source graph must remain a zero-import WASM product');
  }
  const reference=await prepareOriginalReferenceArtifact(context);
  if(reference)supportingProducts.push(...reference.supportingProducts);
  const generations=await prepareOriginalCompilerGenerations(context);
  if(generations)supportingProducts.push(...generations.supportingProducts);
  const generationEnvironment=generations?{ELISCRIPT_ORIGINAL_COMPILER_GENERATIONS:generations.manifestPath}:{};
  if(reference)generationEnvironment.ELISCRIPT_ORIGINAL_REFERENCE_PRODUCT_ROOT=reference.directory;
  const javascriptCompanion=supportingProducts.find(item=>item.role==='original-compiler-javascript-source-maps');
  const javascriptDirectory=target==='javascript'?artifact.directory:javascriptCompanion?resolve(context.directory,javascriptCompanion.directory):undefined;
  if(javascriptDirectory!==undefined)generationEnvironment.ELISCRIPT_ORIGINAL_JAVASCRIPT_PRODUCT_ROOT=javascriptDirectory;
  const hostFile=await originalProgramSidecars(artifact,{...record,sourceRoot});
  await originalProgramAliases(artifact,{sourceRoot});
  const directory=artifact.directory??resolve(artifact.path,'..'),entry=resolve(directory,artifact.entry),contract=record.execution;
  const timeoutMs=contract.timeoutByTarget?.[target]??contract.timeoutMs;
  const loader=resolve(sourceRoot,'tests/fixtures/compiled-eli-node-loader.mjs');
  if(contract.hostRuntime!==undefined&&!['node','bun'].includes(contract.hostRuntime))throw new TypeError('original host runtime must be node or bun');
  const bunHost=contract.hostRuntime!==undefined?contract.hostRuntime==='bun':options.programHost==='bun'||contract.requiresBun;
  const command=bunHost?(options.bun??process.env.BUN??'bun'):(options.node??process.env.NODE??'node');
  const preload=bunHost?['--preload',resolve(sourceRoot,'tests/fixtures/compiled-eli-bun-preload.mjs')]:['--experimental-loader',loader];
  if(target==='javascript'){
    let args,env={ELISCRIPT_ORIGINAL_TARGET:target,ELISCRIPT_ORIGINAL_SOURCE_ROOT:sourceRoot,...generationEnvironment};
    if(contract.hostEval){
      const script=resolve(directory,'__eliscript_original_inline.mjs');await writeFile(script,contract.hostEval);
      args=[...preload,script];env[contract.environment]=entry;
    }else args=hostFile?[...preload,hostFile,...originalProgramArguments(contract,artifact.entry,pathToFileURL(directory+'/').href)]:[...preload,entry];
    return{kind:'original-program',stdout:await childOutput(command,args,{cwd:directory,signal,env,timeoutMs}),...(supportingProducts.length?{supportingProducts}:{})};
  }
  // The original host script runs unchanged in the same process as its actual
  // managed runtime. Install prepared cells before loading the script; let its
  // own import evaluate the facade at the original point in its execution.
  const driver=resolve(directory,'__eliscript_original_program.mjs'),configuration=resolve(directory,'__eliscript_original_program.json');
  await saveCompilerMetadata(configuration,{target,path:artifact.path,descriptor:artifact.descriptor,typed:artifact.typed,
    nativeTarget:artifact.nativeTarget??options.nativeTarget??(process.platform==='linux'?'arm64-linux':'arm64-macos'),entry:artifact.entry,host:hostFile,
    argument:contract.argument,arguments:contract.arguments,argumentModules:contract.argumentModules??[artifact.entry],hostEval:contract.hostEval,environment:contract.environment,base:pathToFileURL(directory+'/').href,sourceRoot,childProcesses:contract.childProcesses,runtimeLaunchers:contract.runtimeLaunchers===true,memory:options.memory,runtimeOptions:{...options.runtimeOptions,...(record.auto===undefined?{}:{auto:record.auto}),...(artifact.debug?{debug:artifact.debug}:{})}});
  const contextURL=pathToFileURL(resolve(sourceRoot,'tools/backends/compiler-corpus-host-context.mjs')).href;
  const source=`import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {openOriginalProgramContext,inheritOriginalProgramContext,originalProgramBunLauncher} from ${JSON.stringify(contextURL)};
import {readCompilerMetadata} from ${JSON.stringify(pathToFileURL(resolve(sourceRoot,'tools/backends/compiler-metadata.mjs')).href)};
const configuration=${JSON.stringify(configuration)};
const input=await readCompilerMetadata(configuration);
const originalProgramArguments=${originalProgramArguments.toString()};
process.env.ELISCRIPT_ORIGINAL_TARGET=input.target;
process.env.ELISCRIPT_ORIGINAL_SOURCE_ROOT=input.sourceRoot;
const context=await openOriginalProgramContext(input,{identity:configuration});
if(input.childProcesses==='inherit-selected-artifact')inheritOriginalProgramContext({configuration,sourceRoot:input.sourceRoot});
if(input.runtimeLaunchers){
 const launcher=await originalProgramBunLauncher({directory:fileURLToPath(input.base),bun:process.execPath,configuration,sourceRoot:input.sourceRoot});
 process.env.ELISCRIPT_ORIGINAL_BUN=launcher;
 process.env.ELISCRIPT_JS_RUNTIME=launcher;
}

let failed=false;
try{
 const entry=new URL(input.entry,input.base);
 if(input.hostEval){process.env[input.environment]=fileURLToPath(entry);await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(input.hostEval));}
 else if(input.host){process.argv=[process.execPath,input.host,...originalProgramArguments(input,input.entry,input.base)];await import(pathToFileURL(input.host));}
 else await import(new URL(context.facades.loadEntry,input.base));
}catch(error){failed=true;throw error;}finally{
 try{await context.close();}catch(error){if(!failed)throw error;}
}
`;
  await writeFile(driver,source);
  return{kind:'original-program',stdout:await childOutput(command,[...preload,driver],{cwd:directory,signal,timeoutMs,env:{ELISCRIPT_ORIGINAL_SOURCE_ROOT:sourceRoot,ELISCRIPT_ORIGINAL_TARGET:target,...generationEnvironment}}),...(supportingProducts.length?{supportingProducts}:{})};
}

// A public compiler-tools corpus runs the emitted complete compiler itself.
// It must not import its functions as a phased program facade or substitute a
// JavaScript compiler for a requested binary compiler.
async function executeCompilerSessionProgram(context){
  const {artifact,record,target,sourceRoot,signal}=context,contract=record.execution;
  const resources=independentCompilerResources(contract.compilerProfile===undefined?context.options??{}:{profile:contract.compilerProfile}),options={...context.options,
    memory:record.memory??resources.memory,runtimeOptions:{...resources.budget,auto:resources.auto,
      ...context.options?.runtimeOptions,...contract.runtimeOptions}};
  if(!['javascript','wasm','native'].includes(target))throw new TypeError('original compiler tools require a real selected compiler target');
  if(!['node','bun'].includes(contract.hostRuntime))throw new TypeError('original compiler tools require their explicit host runtime');
  const directory=artifact.directory??resolve(artifact.path,'..');
  await javascriptEnvironment(artifact,sourceRoot);
  const host=await originalProgramSidecars(artifact,{...record,sourceRoot});
  if(!host)throw new TypeError('original compiler tools require their retained original host source');
  const configuration=resolve(directory,'__eliscript_original_compiler_session.json');
  const supportingDirectory=resolve(context.directory,'original-tool-products');
  const supportingManifest=resolve(context.directory,'original-tool-products.json');
  if(contract.preparationTimeoutMs!==undefined&&(!Number.isSafeInteger(contract.preparationTimeoutMs)||contract.preparationTimeoutMs<=0))
    throw new TypeError('original compiler preparation requires its positive original beforeAll timeout');
  const timeoutMs=contract.preparationTimeoutMs===undefined?contract.timeoutMs:contract.preparationTimeoutMs+contract.timeoutMs;
  await saveCompilerMetadata(configuration,{target,path:artifact.path,sourceRoot,entry:artifact.entry,
    descriptor:artifact.descriptor,typed:artifact.typed,memory:options.memory,
    ...(contract.preparationTimeoutMs===undefined?{}:{preparationTimeoutMs:contract.preparationTimeoutMs}),
    ...(contract.supportingCompilerProducts===true?{supportingDirectory,supportingManifest}:{}),
    runtimeOptions:{...options.runtimeOptions,nativeTarget:artifact.nativeTarget??options.nativeTarget??
      (process.platform==='linux'?'arm64-linux':'arm64-macos'),...(artifact.debug?{debug:artifact.debug}:{})}});
  const command=contract.hostRuntime==='bun'?(options.bun??process.env.BUN??'bun'):(options.node??process.env.NODE??'node');
  const stdout=await childOutput(command,[host],{cwd:sourceRoot,signal,timeoutMs,
    env:{ELISCRIPT_ORIGINAL_SOURCE_ROOT:sourceRoot,ELISCRIPT_ORIGINAL_TARGET:target,
      ELISCRIPT_ORIGINAL_COMPILER_SESSION:configuration}});
  const supportingProducts=[];
  if(contract.supportingCompilerProducts===true){
    const manifest=JSON.parse(await readFile(supportingManifest,'utf8'));
    if(manifest?.format!=='eliscript-original-compiler-supporting-products'||manifest.version!==1||
        !Array.isArray(manifest.products)||!manifest.products.length)throw new TypeError('original compiler tools did not retain their real supporting products');
    const roles=new Set();
    for(const[index,product]of manifest.products.entries()){
      if(typeof product?.role!=='string'||!product.role||roles.has(product.role))throw new TypeError('original compiler supporting product role is missing or duplicate');
      roles.add(product.role);
      const built=product.artifact;
      for(const path of [built?.directory,built?.path]){
        if(typeof path!=='string')throw new TypeError('original compiler supporting product requires actual local files');
        const inside=relative(supportingDirectory,resolve(path));
        if(!inside||isAbsolute(inside)||inside==='..'||inside.startsWith('..'+sep))throw new TypeError('original compiler supporting product escapes its case archive');
      }
      if(built.provenance?.mode!=='session'||normalizeCompilerHost(built.provenance.producerHost)!==target||
          built.provenance.runtimeCompiled!==true||!Array.isArray(built.provenance.compiledModuleIds)||
          !Array.isArray(built.sourceIdentity?.modules)||
          JSON.stringify([...built.provenance.compiledModuleIds].sort())!==JSON.stringify(built.sourceIdentity.modules.map(item=>item.id).sort()))
        throw new Error('original compiler supporting product was not built completely by the selected real compiler');
      const archived=await archiveCompilerArtifact(built,resolve(context.directory,'original-tool-product-'+index+'-metadata'));
      if(!archived.productIdentity?.sha256)throw new Error('original compiler supporting product has no authenticated emitted file identity');
      supportingProducts.push({role:product.role,target:normalizeCompilerHost(built.host),producerHost:target,
        directory:relative(context.directory,built.directory).split(sep).join('/'),identitySha256:archived.productIdentity.sha256});
    }
  }
  return{kind:'original-program',stdout,...(supportingProducts.length?{supportingProducts}:{})};
}

async function executeExports(context, contract){
  const {artifact,target,sourceRoot,options}=context,observations=[];
  if(target==='javascript'){
    if(contract.isolated){
      const url=await javascriptEnvironment(artifact,sourceRoot);
      const script=`import assert from 'node:assert/strict';const m=await import(process.argv[1]),c=JSON.parse(process.argv[2]),out=[];
        const valueRecord=${valueRecord.toString()};
        for(const[name,expected]of Object.entries(c.values??{})){assert.deepEqual(m[name],expected);out.push({name,value:valueRecord(m[name])});}
        for(const call of c.calls??[]){let value,error,failed=false;try{value=await m[call.javascriptName??call.name](...call.args);}catch(e){failed=true;error=e;}
          if(call.error!==undefined){assert(failed);assert.equal(error?.message,call.error);out.push({name:call.name,error:call.error});}
          else{if(failed)throw error;assert.deepEqual(value,call.expected);out.push({name:call.name,value:valueRecord(value)});}}
        process.stdout.write(JSON.stringify(out));`;
      const stdout=await childOutput(options.node??process.env.NODE??'node',['--input-type=module','--eval',script,url,encodeCompilerIR(contract)],{cwd:context.directory,signal:context.signal});
      return JSON.parse(stdout);
    }
    const module=await javascriptModule(artifact,sourceRoot);
    for(const [name,expected]of Object.entries(contract.values??{})){assert.deepEqual(module[name],expected);observations.push({name,value:valueRecord(module[name])});}
    for(const call of contract.calls??[]){
      let value,error,failed=false;try{value=await module[call.javascriptName??call.name](...call.args);}catch(failure){failed=true;error=failure;}
      if(call.error!==undefined){assert(failed,'original exported call must throw');assert.equal(error?.message,call.error);observations.push({name:call.name,error:call.error});}
      else{if(failed)throw error;assert.deepEqual(value,call.expected);observations.push({name:call.name,value:valueRecord(value)});}
    }
    return observations;
  }
  const a=await managedRuntime(artifact,target,{...options,allowHostCapabilities:true});let failed=false;
  try{
    a.auto(contract.auto??65536);
    for(const [name,expected]of Object.entries(contract.values??{})){
      const value=a.getExport(name);try{assert.deepEqual(managedValue(a,value),expected);observations.push({name,value:valueRecord(managedValue(a,value))});}finally{a.release(value);}
    }
    for(const call of contract.calls??[]){
      const args=[];let value,error,callFailed=false;
      try{
        for(const arg of call.args)args.push(box(a,arg));
        try{value=a.invoke(call.name,args);}catch(caught){callFailed=true;error=caught;}
        if(call.error!==undefined){assert(callFailed,'original exported call must throw');assert.equal(error?.message,call.error);observations.push({name:call.name,error:call.error});}
        else{if(callFailed)throw error;const actual=managedValue(a,value);assert.deepEqual(actual,call.expected);observations.push({name:call.name,value:valueRecord(actual)});}
      }finally{a.release(value);args.forEach(arg=>a.release(arg));}
    }
    return observations;
  }catch(error){failed=true;throw error;}
  finally{
    let cleanup,cleanupFailed=false;
    for(const action of[()=>a.closeModule(),()=>a.collect(),()=>assert.equal(a.live(),0),()=>assert.equal(a.stats().frameDepth,0),()=>a.close?.()]){
      try{action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
    }
    if(!failed&&cleanupFailed)throw cleanup;
  }
}

async function executeSequence(context){
  const {record,session,target,options,directory,signal}=context,results=new Map(),products=new Map(),observations=[];let expectedSatisfied=true;
  for(const step of record.steps){
    try{
    const request=fromRecipe(step.request,results);
    if(step.backendTarget!==undefined&&!['wasm','native','javascript'].includes(step.backendTarget))throw new TypeError('original backend diagnostic target is invalid');
    const emission=['project','project-ir','emit-ir','emit-memory-ir','emit-typed-memory'].includes(request.operation);
    if(emission)Object.assign(request,{target:step.backendTarget??request.target??target,
      memory:request.memory??record.memory??options.memory,
      nativeTarget:request.nativeTarget??record.nativeTarget??options.nativeTarget??(process.platform==='linux'?'arm64-linux':'arm64-macos'),
      nativeFormat:request.nativeFormat??'library'});
    let response,error,requestFailed=false;
    try{response=await session.request(request,{signal});}catch(failure){requestFailed=true;error=failure;}
    if(step.error){
      assert(requestFailed,'original request must fail: '+step.id);
      if(step.error.message!==undefined)assert.equal(error?.message,step.error.message);
      if(step.error.contains!==undefined)assert(String(error?.message??error).includes(step.error.contains));
      if(step.error.code!==undefined)assert.equal(error?.eliscriptDiagnostic?.code,step.error.code);
      if(step.error.phase!==undefined)assert.equal(error?.eliscriptDiagnostic?.phase,step.error.phase);
      for(const expected of step.error.expectFields??[]){
        let value=error?.eliscriptDiagnostic;
        for(const key of expected.path)value=value?.[key];
        assert.deepEqual(value,expected.value);
      }
      observations.push({id:step.id,error:diagnostic(error)});continue;
    }
    if(requestFailed)throw error;
    results.set(step.id,response);
    if(Object.hasOwn(step,'expected'))assert.deepEqual(response,step.expected);
    for(const expectation of step.expectFields??[]){let actual=response;for(const key of expectation.path)actual=actual[key];assert.deepEqual(actual,expectation.value);}
    if(step.containsData!==undefined)assert(JSON.parse(response.data).includes(step.containsData));
    for(const text of step.includesJavascript??[])assert(response.javascript.includes(text));
    for(const text of step.excludesJavascript??[])assert(!response.javascript.includes(text));
    if(step.containsField)assert(response[step.containsField.field].includes(step.containsField.text));
    if(step.negativeZeroAt){let value=JSON.parse(response.ir);for(const key of step.negativeZeroAt)value=value[key];assert(Object.is(value,-0));}
    if(step.canonicalEnvelope){assert(response.canonicalIR.startsWith('{"format":"eliscript-ir","program":{"body":'));assert(response.canonicalIR.endsWith('},"version":1}'));}
    if(step.sameFieldsAs){for(const field of step.sameFieldsAs.fields){
      const previous=results.get(step.sameFieldsAs.step)?.[field];
      if(field==='ir')assert.deepEqual(JSON.parse(response[field]),JSON.parse(previous));
      else assert.deepEqual(response[field],previous);
    }}
    let observation=response;
    if(emission){
      const product=response?.target===undefined&&typeof response?.javascript==='string'
        ?{target:'javascript',entry:step.entry??'ir.mjs',modules:[{id:step.entry??'ir.mjs',javascript:response.javascript,
          ...(response.sourceMap===undefined?{}:{sourceMap:response.sourceMap})}]}:response;
      const artifact=await context.archiveProduct(product,'sequence-'+step.id,product.target);products.set(step.id,artifact);
      if(step.sameProductAs)assert.equal(artifact.identitySha256,products.get(step.sameProductAs)?.identitySha256);
      for(const sidecar of step.sidecars??[]){
        if(typeof sidecar.file!=='string'||sidecar.file.split('/').some(part=>!part||part==='.'||part==='..')||/[\\:\u0000]/.test(sidecar.file))throw new Error('original sidecar path is not relative');
        const path=join(resolve(artifact.path,'..'),sidecar.file);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,sidecar.source,{flag:'wx'});
      }
      if(step.artifact?.kind==='exports')observation=await executeExports({...context,artifact,target:artifact.target},step.artifact);
      else if(step.artifact?.kind==='original-program') {
        observation=await executeOriginalProgram({...context,artifact,target:artifact.target,
          record:{...record,entry:artifact.entry,request,execution:{...step.artifact}}});
      }
      else if(step.artifact?.kind==='stdout'){
        let stdout;
        if(artifact.target==='javascript'){
          await javascriptEnvironment(artifact,context.sourceRoot);
          stdout=await childOutput(options.node??process.env.NODE??'node',[artifact.path],{cwd:directory,signal});
        }else{
          const chunks=[],output=new Writable({write(chunk,encoding,complete){chunks.push(Buffer.from(chunk));complete();}});
          const logger=new Console({stdout:output,stderr:output,colorMode:false});
          const a=await managedRuntime(artifact,artifact.target,{...options,allowHostCapabilities:true,runtimeOptions:{...options.runtimeOptions,console:logger}});
          let cleanup;
          for(const action of[()=>a.closeModule(),()=>a.collect(),()=>assert.equal(a.live(),0),()=>assert.equal(a.stats().frameDepth,0),()=>a.close?.(),()=>output.end()]){
            try{action();}catch(error){cleanup??=error;}
          }
          if(cleanup)throw cleanup;
          stdout=Buffer.concat(chunks).toString('utf8');
        }
        assert.equal(stdout,step.artifact.expected);observation={stdout};
      }else observation={productIdentitySha256:artifact.identitySha256};
    }
    observations.push({id:step.id,result:valueRecord(observation)});
    }catch(error){if(signal?.aborted)throw signal.reason===undefined?error:signal.reason;expectedSatisfied=false;observations.push({id:step.id,status:'failed',error:diagnostic(error)});}
  }
  return{kind:'sequence',expectedSatisfied,identity:observations};
}

function diagnostic(error) {
  return {kind: 'diagnostic', name: error?.name ?? 'Error', message: error?.message ?? String(error),
    ...(error?.eliscriptDiagnostic !== undefined ? {diagnostic: structuredClone(error.eliscriptDiagnostic)} : {})};
}

// These are the original independent acceptance oracles, not a compilation
// fallback. Each full fixture is evaluated once and its cases retain order.
export function createOriginalSeedOracle({sourceRoot, emacs = process.env.EMACS ?? 'emacs', signal,directory,node,bun,programHost,profile,budget,memory,auto,nativeTarget,sessionOptions} = {}) {
  const suites = new Map();
  return async ({record,target}) => {
    if(record.expected?.kind==='seed-program'){
      if(typeof directory!=='string')throw new TypeError('original program Seed oracle requires an explicit evidence directory');
      const originalHost=record.execution?.hostRuntime??(programHost==='bun'||record.execution?.requiresBun?'bun':'node');
      const key='program:'+record.id+':'+originalHost;
      if(!suites.has(key))suites.set(key,(async()=>{
        const output=resolve(directory,createHash('sha256').update(key).digest('hex')),product=resolve(output,'product'),modules=[];
        await mkdir(product,{recursive:true});
        for(const item of record.modules){
          const input=resolve(output,'sources',item.filename),path=resolve(product,item.id);
          await mkdir(resolve(input,'..'),{recursive:true});await writeFile(input,item.source);
          await mkdir(resolve(path,'..'),{recursive:true});
          await childOutput(resolve(sourceRoot,'bin/eliscript-seed'),['--source-map','--output',path,input],{cwd:sourceRoot,signal});
          modules.push({id:item.id,path});
        }
        const artifact={target:'javascript',entry:record.entry,path:resolve(product,record.entry),directory:product,modules};
        const options={programHost:originalHost,node,bun,profile,budget,memory,auto,nativeTarget,sessionOptions};
        const {archiveProduct}=await import('./compiler-matrix.mjs');
        const programContext={artifact,record,target:'javascript',sourceRoot,signal,options,directory:output,
          archiveProduct:async(value,name='product',productTarget='javascript')=>archiveProduct(value,productTarget,resolve(output,name))};
        if(record.execution?.kind==='compiler-session-program')return executeCompilerSessionProgram(programContext);
        if(!record.execution?.compilerGenerations)return executeOriginalProgram(programContext);
        // This is the separate independent oracle, never a replacement for a
        // selected producer that failed. Build its actual seed driver before
        // reconstructing all three JavaScript successor generations.
        const seed=await buildIndependentCompiler({host:'javascript',sourceRoot,outputRoot:resolve(output,'independent-seed-compiler'),
          profile:profile??'small',budget,memory,auto,nativeTarget,retainIR:true,debug:true,signal});
        const session=await openCompilerArtifact(seed,sessionOptions);let failed=false;
        try{
          return await executeOriginalProgram({...programContext,session});
        }catch(error){failed=true;throw error;}
        finally{try{await session.close();}catch(error){if(!failed)throw error;}}
      })());
      return suites.get(key);
    }
    if (record.kind !== 'stage' || record.original?.manifest !== 'compiler-parity' && !record.original?.oracleCase) return undefined;
    const stage = record.request.stage;
    const inline=record.original.oracleCase;
    if(inline){
      if(stage!=='emitter'||typeof directory!=='string'||typeof inline.name!=='string'||typeof inline.filename!=='string'||
        inline.source!==record.request.source||inline.filename!==record.request.filename||typeof inline.source!=='string'||
        typeof record.original.suite!=='string'||typeof record.original.sourceSha256!=='string')throw new TypeError('inline original Seed case requires its exact source and bound original suite');
      const path=resolve(sourceRoot,record.original.suite),part=relative(resolve(sourceRoot),path);
      if(isAbsolute(part)||part==='..'||part.startsWith('..'+sep)||
        createHash('sha256').update(await readFile(path)).digest('hex')!==record.original.sourceSha256)
        throw new Error('inline original Seed suite bytes changed');
    }
    const key = stage + ':' + (inline?createHash('sha256').update(JSON.stringify({inline,suite:record.original.suite,sha256:record.original.sourceSha256})).digest('hex'):record.original.fixture);
    if (!suites.has(key)) suites.set(key, (async()=>{
      let fixture=inline?resolve(directory,'inline-'+key.slice(stage.length+1)+'.json'):resolve(sourceRoot,record.original.fixture);
      if(inline){await mkdir(directory,{recursive:true});await writeFile(fixture,encodeCompilerMetadata({valid:[inline],invalid:[]})+'\n',{flag:'wx'});}
      return new Promise((accept, reject) => {
      const script = 'tests/bootstrap-' + stage + '-oracle.el';
      const child = spawn(emacs, ['--batch', '-Q', '-L', 'compiler', '-L', 'tests', '--script', script], {
        cwd: sourceRoot, signal,
        env: {...process.env, ['ELISCRIPT_' + stage.toUpperCase() + '_FIXTURE']: fixture},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [], stderr = [];
      child.stdout.on('data', chunk => stdout.push(chunk));
      child.stderr.on('data', chunk => stderr.push(chunk));
      child.once('error', reject);
      child.once('close', code => {
        if (code !== 0) {reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || 'original Seed oracle exited with ' + code));return;}
        try {const values = JSON.parse(Buffer.concat(stdout).toString('utf8'));assert(Array.isArray(values));accept(values);} catch (error) {reject(error);}
      });
    });})());
    const values = await suites.get(key);
    const originalName = inline?.name??record.original.case.name;
    const found = values.filter(value => value.name === originalName);
    if (found.length !== 1) throw new Error('original Seed oracle case identity differs: ' + originalName);
    return {kind: 'original-seed', stage, result: found[0]};
  };
}

async function javascriptEnvironment(artifact, sourceRoot) {
  // Supply the package's real runtime exports; compiler algorithms still come
  // exclusively from the selected session and its emitted artifact.
  const modules = join(resolve(artifact.path, '..'), 'node_modules');
  await mkdir(modules, {recursive: true});
  try {await symlink(resolve(sourceRoot), join(modules, 'eliscript'), 'dir');}
  catch (error) {if (error.code !== 'EEXIST') throw error;}
  return pathToFileURL(artifact.path).href;
}

async function javascriptModule(artifact,sourceRoot){return import(await javascriptEnvironment(artifact,sourceRoot));}

async function managedRuntime(artifact, target, options) {
  if(!options.allowHostCapabilities)assert.equal(artifact.descriptor?.hostCapabilities?.length??0,0,'original pure corpus declares no host capabilities');
  const runtimeOptions={...options.runtimeOptions,
    ...(artifact.debug?{debug:artifact.debug}:{}),
    moduleBaseURL:options.moduleBaseURL??pathToFileURL(artifact.path).href,
    projectModuleBaseURL:options.projectModuleBaseURL??pathToFileURL(resolve(artifact.path,'..')+'/').href,
    projectEntry:artifact.entry,
    importModule:options.importModule??options.runtimeOptions?.importModule,
    hostModules:options.hostModules??options.runtimeOptions?.hostModules};
  if (target === 'wasm') {
    const bytes = new Uint8Array(await readFile(artifact.path));
    const module = new WebAssembly.Module(bytes);
    if(!options.allowHostCapabilities)assert.deepEqual(WebAssembly.Module.imports(module), [], 'original pure corpus requires zero imports');
    return options.allowHostCapabilities?instantiateManagedRuntimeWithHostModules(bytes,runtimeOptions):instantiateManagedRuntime(bytes,runtimeOptions);
  }
  const {instantiateNativeManagedRuntime} = await import('./native-managed-runtime.mjs');
  return instantiateNativeManagedRuntime(artifact.path, {typed: artifact.typed, descriptor: artifact.descriptor},
    {...options.memory, ...runtimeOptions, nativeTarget: artifact.nativeTarget ?? options.nativeTarget ?? (process.platform === 'linux' ? 'arm64-linux' : 'arm64-macos')});
}

async function executeBehavior({record, artifact, target, sourceRoot, options}) {
  const scenario = record.execution.scenario;
  if (target === 'javascript') {
    const module = await javascriptModule(artifact, sourceRoot);
    if (scenario.runtimeError) {
      let thrown;
      try {module.run();} catch (error) {thrown = error;}
      assert(thrown, 'original scenario must throw');
      assert.equal(thrown.name, scenario.jsError);
      if (scenario.runtimeError === 'ELI-RT0009') assert.equal(thrown.eliscriptDiagnostic?.code, scenario.runtimeError);
      if (Object.hasOwn(scenario, 'recover')) assert.deepEqual(module.recover(), scenario.recover);
      return {kind: 'managed-bdd', expectedSatisfied: true, error: diagnostic(thrown),
        ...(Object.hasOwn(scenario, 'recover') ? {recovery: valueRecord(scenario.recover)} : {})};
    }
    const result = module.run();
    assert.deepEqual(result, scenario.expected);
    return {kind: 'managed-bdd', expectedSatisfied: true, value: valueRecord(result)};
  }
  const a = await managedRuntime(artifact, target, options);
  let failure;
  try {
    a.auto(record.auto);
    if (scenario.runtimeError) {
      let thrown;
      try {const value = a.invoke('run');a.release(value);} catch (error) {thrown = error;}
      assert(thrown, 'original scenario must throw');
      assert.equal(thrown.eliscriptDiagnostic?.code, scenario.runtimeError);
      if (scenario.wasmError) assert.equal(thrown.name, scenario.wasmError);
      assert.equal(a.stats().frameDepth, 0);
      if (Object.hasOwn(scenario, 'recover')) {
        const value = a.invoke('recover');
        try {assert.deepEqual(managedValue(a, value), scenario.recover);} finally {a.release(value);}
      }
      return {kind: 'managed-bdd', expectedSatisfied: true, error: diagnostic(thrown),
        ...(Object.hasOwn(scenario, 'recover') ? {recovery: valueRecord(scenario.recover)} : {})};
    }
    const value = a.invoke('run');
    let result;
    try {result = managedValue(a, value);assert.deepEqual(result, scenario.expected);} finally {a.release(value);}
    return {kind: 'managed-bdd', expectedSatisfied: true, value: valueRecord(result)};
  } catch (error) {failure = error; throw error;}
  finally {
    let cleanupError;
    for (const action of [() => a.closeModule(), () => a.collect(), () => assert.equal(a.live(), 0),
      () => assert.equal(a.stats().frameDepth, 0), () => a.close?.()]) {
      try {action();} catch (error) {cleanupError ??= error;}
    }
    if (!failure && cleanupError) throw cleanupError;
  }
}

async function executeUnicodeProfile(context){
  const {record,artifact,target,sourceRoot,options}=context,profile=record.execution.profile;
  const a=target==='javascript'?null:await managedRuntime(artifact,target,{...options,runtimeOptions:{...options.runtimeOptions,unicodeVersion:profile.version}});
  let module,failure;
  try{
    if(a)a.auto(record.auto);else module=await javascriptModule(artifact,sourceRoot);
    const convert=(name,text)=>{
      if(!a)return module[name](text);
      const input=a.string(text);let output;
      try{output=a.invoke(name,[input]);return a.readString(output);}finally{a.release(output);a.release(input);}
    };
    const hashes={upper:createHash('sha256'),lower:createHash('sha256')};let checked=0;
    for(let start=0;start<0x110000;start+=512){
      const points=[];for(let point=start;point<Math.min(start+512,0x110000);point++)if(point<0xd800||point>0xdfff)points.push(point);
      checked+=points.length;const input=String.fromCodePoint(...points);
      for(const name of['upper','lower'])hashes[name].update(convert(name,input),'utf16le');
    }
    assert.equal(checked,0x110000-0x800);
    const actual={};for(const name of['upper','lower']){actual[name]=hashes[name].digest('hex');assert.equal(actual[name],profile[name]);}
    for(const [text,expected]of profile.sigma)assert.equal(convert('lower',text),expected);
    return{kind:'unicode-profile',expectedSatisfied:true,version:profile.version,checked,sigmaCases:profile.sigma.length,hashes:actual};
  }catch(error){failure=error;throw error;}
  finally{
    if(a){let cleanup;for(const action of[()=>a.closeModule(),()=>a.collect(),()=>assert.equal(a.live(),0),()=>assert.equal(a.stats().frameDepth,0),()=>a.close?.()]){
      try{action();}catch(error){cleanup??=error;}
    }if(!failure&&cleanup)throw cleanup;}
  }
}

// Called only by the production matrix driver. Defining this module never
// executes a fixture or loads a compiler artifact.
export async function executeCompilerCorpusRecord(context) {
  const {record, response, failure, target, options = {}} = context;
  if (Object.hasOwn(context,'failure')) return diagnostic(failure);
  if (record.kind === 'stage') {
    if (response?.stage !== record.request.stage || response?.filename !== record.request.filename || typeof response.data !== 'string') {
      throw new TypeError('compiler stage did not return its lossless data envelope');
    }
    JSON.parse(response.data);
    return {kind: 'stage', stage: response.stage, filename: response.filename, data: response.data};
  }
  if(record.kind==='sequence')return executeSequence(context);
  if (record.kind === 'original-suite') {
    if (typeof options.executeOriginalFixture !== 'function') {
      return {kind: 'original-suite', status: 'executor-required', requiredLocatorIds: record.expected.requiredLocatorIds};
    }
    const observation = await options.executeOriginalFixture(context);
    if (observation?.status !== 'executed' || !Array.isArray(observation.executedLocatorIds)) {
      throw new TypeError('original-suite executor must report actual executed locator identities');
    }
    assert.deepEqual([...observation.executedLocatorIds].sort(), [...record.expected.requiredLocatorIds].sort());
    return observation;
  }
  if (record.execution?.kind === 'managed-bdd') return executeBehavior({...context, target, options});
  if(record.execution?.kind==='unicode-profile')return executeUnicodeProfile({...context,options});
  if(record.execution?.kind==='original-program')return executeOriginalProgram({...context,options});
  if(record.execution?.kind==='compiler-session-program')return executeCompilerSessionProgram({...context,options});
  return {kind: 'unsupported-execution', status: 'executor-required'};
}

export async function compareCompilerCorpusObservation({record, observation, target, options = {}}) {
  const expected = record.expected;
  if(expected?.kind==='seed-program'){
    if(observation?.kind!=='original-program')return{status:'different',reason:'original complete program did not execute'};
    if(Object.hasOwn(expected,'stdout')&&observation.stdout!==expected.stdout)return{status:'different',reason:'original frozen stdout differs'};
    if(Object.hasOwn(expected,'stdoutJSON')){
      try{assert.deepEqual(JSON.parse(observation.stdout),expected.stdoutJSON);}catch{return{status:'different',reason:'original inline host data assertion differs'};}
    }
    if(typeof options.originalOracle!=='function')return{status:'unverified',reason:'original program Seed oracle is required'};
    try{
      const oracle=await options.originalOracle({record:structuredClone(record),target});
      return oracle?.kind==='original-program'&&oracle.stdout===observation.stdout?{status:'equivalent',oracle:record.original.host??record.original.fixture}:{status:'different',reason:'original complete program or host observation differs'};
    }catch(error){return{status:'unverified',reason:'original complete program Seed oracle did not finish',failure:diagnostic(error)};}
  }
  if(expected?.kind==='unicode-profile')return observation?.kind==='unicode-profile'&&observation.expectedSatisfied===true
    ?{status:'equivalent',oracle:record.original.fixture}:{status:'different',reason:'original complete Unicode profile observation differs'};
  if(expected?.kind==='sequence')return observation?.kind==='sequence'&&observation.expectedSatisfied===true
    ?{status:'equivalent',oracle:record.original.suite}:{status:'different',reason:'original request sequence did not complete'};
  if (expected?.kind === 'diagnostic') {
    if (observation?.kind !== 'diagnostic' || observation.message !== expected.message) return {status: 'different', reason: 'original diagnostic message differs'};
    if (expected.diagnostic !== undefined) {
      try {assert.deepEqual(observation.diagnostic, expected.diagnostic);} catch {return {status: 'different', reason: 'original structured diagnostic differs'};}
    }
    return {status: 'equivalent', oracle: record.original.fixture};
  }
  if (expected?.kind === 'managed-bdd') {
    const scenario = expected.scenario;
    if (scenario.compileError && target !== 'javascript') {
      return observation?.kind === 'diagnostic' && observation.diagnostic?.code === scenario.compileError &&
        observation.diagnostic?.location?.file === record.modules[0].filename && observation.diagnostic?.location?.start?.line >= 2
        ? {status: 'equivalent', oracle: record.original.fixture}
        : {status: 'different', reason: 'original managed compile refusal differs'};
    }
    return observation?.kind === 'managed-bdd' && observation.expectedSatisfied === true
      ? {status: 'equivalent', oracle: record.original.fixture}
      : {status: 'different', reason: 'original behavior scenario did not complete'};
  }
  if (expected?.kind === 'original-suite') {
    if(observation?.kind === 'diagnostic') return {status: 'different', reason: 'original suite execution failed'};
    return observation?.status === 'executed' && observation.verification === 'equivalent'
      ? {status: 'equivalent', oracle: 'original-suite-executor'}
      : {status: 'unverified', reason: 'original suite execution and comparison are still required'};
  }
  if (expected?.oracleRequired) {
    if(observation?.kind !== 'stage') return {status: 'different', reason: 'original accepted stage failed'};
    if (typeof options.originalOracle !== 'function') return {status: 'unverified', reason: 'original Seed observation is required'};
    let oracle;
    try {oracle = await options.originalOracle({record: structuredClone(record), target});}
    catch (error) {return {status: 'unverified', reason: 'original Seed oracle could not complete', failure: diagnostic(error)};}
    if (oracle === undefined) return {status: 'unverified', reason: 'original oracle did not supply this case'};
    try {
      if (oracle.kind === 'original-seed') {
        assert.equal(oracle.stage, record.request.stage);
        assert.equal(oracle.result.status, 'ok');
        assert.equal(observation.kind, 'stage');
        const data = JSON.parse(observation.data);
        if (oracle.stage === 'reader' || oracle.stage === 'expander') assert.deepEqual(data, oracle.result.forms);
        else if (oracle.stage === 'ir') assert.deepEqual(data, oracle.result.program);
        else if (oracle.stage === 'emitter') assert.deepEqual(data, {javascript: oracle.result.javascript, sourceMap: oracle.result.sourceMap});
        else if (oracle.stage !== 'analyzer') throw new Error('unrepresented original Seed stage');
        // The original analyzer fixture compares acceptance and diagnostics;
        // cross-host stage identity separately covers its actual analysis data.
      } else assert.deepEqual(observation, oracle);
      return {status: 'equivalent', oracle: 'original-seed'};
    } catch {return {status: 'different', reason: 'original Seed observation differs'};}
  }
  return {status: 'unverified', reason: 'no original observation contract was supplied'};
}
