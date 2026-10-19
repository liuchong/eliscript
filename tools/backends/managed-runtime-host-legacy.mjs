import {createManagedHostRuntime,createManagedHostCapabilityBridge,failManagedRuntime,validateManagedRuntimeOptions} from './managed-host.mjs';
import {createManagedModuleGraph,loadManagedProjectGraph,managedHostModuleEdges} from './managed-module-graph.mjs';
import {createCompilerDebugMap} from './compiler-debug.mjs';
export {createManagedModuleGraph,createManagedProjectFacades,loadManagedProjectGraph} from './managed-module-graph.mjs';

function moduleMetadata(module,name){
 const sections=WebAssembly.Module.customSections(module,name);let descriptor=null;
 if(sections.length>1)failManagedRuntime(3);
 if(sections.length) {
  const payload=new Uint8Array(sections[0]);let length=0,index=0,shift=0,ended=false;
  while(index<payload.length&&index<5){const byte=payload[index++];if(index===5&&(byte&0xf0))failManagedRuntime(3);length+=(byte&127)*2**shift;if(!(byte&128)){ended=true;break;}shift+=7;}
  if(!ended||index+length!==payload.length)failManagedRuntime(3);
  try{descriptor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload.subarray(index)));}catch{failManagedRuntime(3);}
  if(descriptor===null)failManagedRuntime(3);
 }
 return descriptor;
}
function managedDescriptor(module){return moduleMetadata(module,'eliscript-managed-control');}

function exactTrapExports(module,exports,options,capabilityErrors){
 const document=moduleMetadata(module,'eliscript-trap-sites'),global=exports.__eliscript_trap_site;
 if(document===null)return exports;
 if(!Array.isArray(document)||!(global instanceof WebAssembly.Global)||typeof global.value!=='number')throw new TypeError('invalid WASM trap site transport');
 const sites=new Map();
 for(const item of document){
  if(!item||!Number.isSafeInteger(item.site)||item.site<1||item.site>0xffffffff||sites.has(item.site)||
   !Number.isSafeInteger(item.address)||item.address<0||item.offsetBase!=='module'||
   !Number.isSafeInteger(item.functionIndex)||item.functionIndex<0||item.returnAddress!==false)throw new TypeError('invalid exact WASM trap site');
  sites.set(item.site,Object.freeze({...item}));
 }
 // Disabling input-binary source mapping does not disable exact trap sites.
 const sourceMap=options.debug===undefined||options.debug===false?null:createCompilerDebugMap(options.debug),wrapped=Object.create(null);
 for(const[name,value]of Object.entries(exports)){
  if(typeof value!=='function'){wrapped[name]=value;continue;}
  const invoke=(...args)=>{
   const previous=global.value;global.value=0;
   try{return value(...args);}
   catch(error){
    if(error instanceof WebAssembly.RuntimeError&&!capabilityErrors.has(error)&&!Object.hasOwn(error,'eliscriptFrames')){
     const site=sites.get(global.value>>>0);
     if(site)try{
      const frames=Object.freeze([Object.freeze({address:site.address,offsetBase:'module',functionIndex:site.functionIndex,returnAddress:false})]);
      Object.defineProperty(error,'eliscriptFrames',{value:frames,enumerable:true,configurable:true});
      if(sourceMap&&!Object.hasOwn(error,'eliscriptSourceFrames'))Object.defineProperty(error,'eliscriptSourceFrames',{value:sourceMap.mapFrames(error.eliscriptFrames),enumerable:true,configurable:true});
     }catch{}
    }
    throw error;
   }finally{global.value=previous;}
  };
  Object.defineProperties(invoke,{length:{value:value.length},name:{value:value.name}});wrapped[name]=invoke;
 }
 return Object.freeze(wrapped);
}

// The WASM loader owns only module validation and the binary descriptor envelope.
// Handles, roots, module state and source exceptions share the native boundary.
export function instantiateManagedRuntime(bytes,options={}) {
 options={...options,randomSeed:validateManagedRuntimeOptions(options)};
 const module=new WebAssembly.Module(bytes);
 const descriptor=managedDescriptor(module);
 const declared=descriptor?.hostCapabilities??[],required=WebAssembly.Module.imports(module);
 if(!Array.isArray(declared)||declared.length!==required.length)throw Error('managed imports differ from declared host capabilities');
 const bridge=createManagedHostCapabilityBridge(descriptor,options),imports=Object.create(null),lifecycle={capabilityBridge:bridge},capabilityErrors=new WeakSet();
 let e;
 try{
  const seen=new Set();
  for(let index=0;index<required.length;index++){
   const actual=required[index],capability=declared[index];
   if(!capability||actual.kind!=='function'||actual.module!=='eliscript.host'||actual.module!==capability.module||
    actual.name!==capability.name||capability.arity!==2||capability.abi!=='managed-host-call-v1'||seen.has(actual.name))
    throw Error('managed import is not an allowed declared capability');
   seen.add(actual.name);
   if(!Object.hasOwn(imports,actual.module))imports[actual.module]=Object.create(null);
   imports[actual.module][actual.name]=(heap,argv)=>{
    try{
     const result=bridge.dispatch(actual.name,heap>>>0,argv>>>0);
     if(!Number.isInteger(result)||result<0||result>0xffffffff)throw TypeError('host capability returned an invalid managed word');
     return result;
    }catch(error){
     // A host may itself throw a RuntimeError, including one from a different
     // managed instance. Its original frames and diagnostic belong to it.
     if(error!==null&&(typeof error==='object'||typeof error==='function'))capabilityErrors.add(error);
     throw error;
    }
   };
  }
  e=exactTrapExports(module,new WebAssembly.Instance(module,imports).exports,options,capabilityErrors);
  if(!(e.memory instanceof WebAssembly.Memory))throw Error('managed runtime requires owned memory');
 }catch(error){try{bridge.close();}catch{}throw error;}
 const memory={
  view:()=>new DataView(e.memory.buffer),
  writeBytes:(offset,bytes)=>new Uint8Array(e.memory.buffer,offset,bytes.length).set(bytes),
  readBytes:(offset,length)=>new Uint8Array(e.memory.buffer,offset,length).slice(),
 };
 try{return createManagedHostRuntime(e,descriptor,memory,options,lifecycle);}
 catch(error){try{lifecycle.dispose?.();}catch{}try{bridge.close();}catch{}throw error;}
}

function hostModuleDeclarations(descriptor){
 const declared=descriptor?.hostModules??[];
 if(!Array.isArray(declared))throw new TypeError('host module declarations must be an array');
 const ids=new Set();
 return declared.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.specifier!=='string'||!item.specifier||
   typeof item.referrer!=='string'||!item.referrer||/[\\:\u0000]/.test(item.referrer)||
   item.referrer.split('/').some(part=>!part||part==='.'||part==='..')||
   !Array.isArray(item.allowedExports)||item.allowedExports.some(name=>typeof name!=='string')||
   new Set(item.allowedExports).size!==item.allowedExports.length||typeof item.namespace!=='boolean')
   throw new TypeError('invalid declared host module');
  managedHostModuleEdges(item);ids.add(item.id);return{...item,allowedExports:[...item.allowedExports]};
 });
}

function hostNamespace(value,declaration){
 if(value===null||typeof value!=='object')throw new TypeError('host module resolver must return an actual module namespace');
 for(const name of declaration.allowedExports)if(!Object.hasOwn(value,name))
  throw new SyntaxError('host module '+declaration.specifier+' does not provide an export named '+JSON.stringify(name));
 return value;
}

// Host-module loading is explicit and asynchronous. A pure compiler never
// enters this path; existing synchronous runtimes accept preloaded namespaces.
export async function loadManagedHostModules(descriptor,options={}){
 if(descriptor?.project){
  if(!(options.moduleGraph?.hostModules instanceof Map))throw new TypeError('mixed project namespaces require phased module graph loading');
  return options.moduleGraph.hostModules;
 }
 const declarations=hostModuleDeclarations(descriptor),loaded=new Map(),pending=[];
 const accept=(declaration,namespace)=>{
  const value=hostNamespace(namespace,declaration);
  if(loaded.has(declaration.id)&&loaded.get(declaration.id)!==value)throw new TypeError('host import edges resolved to different ESM namespace identities');
  loaded.set(declaration.id,value);
 };
 const supplied=options.hostModules;
 if(supplied!==undefined&&!(supplied instanceof Map))throw new TypeError('hostModules must be a Map of actual namespaces');
 if(options.importModule!==undefined&&typeof options.importModule!=='function')throw new TypeError('importModule must be a function');
 for(const declaration of declarations.flatMap(item=>managedHostModuleEdges(item))){
  if(supplied?.has(declaration.id)){accept(declaration,supplied.get(declaration.id));continue;}
  let referrerURL;
  if(options.moduleBaseURL!==undefined)referrerURL=new URL(declaration.referrer,options.moduleBaseURL).href;
  let resolved;
  if(options.importModule)resolved=await options.importModule(declaration.specifier,Object.freeze({...declaration,referrerURL}));
  else{
   const specifier=declaration.specifier;
   const relative=specifier.startsWith('./')||specifier.startsWith('../')||specifier.startsWith('/');
   if(relative){
    if(referrerURL===undefined)throw new TypeError('relative host modules require moduleBaseURL or an explicit resolver');
    resolved=new URL(specifier,referrerURL);
   }else if(/^[a-z][a-z0-9+.-]*:/i.test(specifier))resolved=new URL(specifier);
   else throw new TypeError('bare host package imports require an explicit importModule resolver');
  }
  if(typeof resolved==='string'||resolved instanceof URL){
   const url=resolved instanceof URL?resolved.href:new URL(resolved,referrerURL).href;
   pending.push({declaration,url});
  }else accept(declaration,resolved);
 }
 if(pending.length){
  const source=[];
  for(let index=0;index<pending.length;index++){
   const {declaration,url}=pending[index];
   if(declaration.allowedExports.length)source.push('import {'+declaration.allowedExports.map((name,position)=>JSON.stringify(name)+' as __eliscript_check_'+index+'_'+position).join(',')+'} from '+JSON.stringify(url)+';');
   source.push('import * as __eliscript_namespace_'+index+' from '+JSON.stringify(url)+';');
   source.push('export {__eliscript_namespace_'+index+'};');
  }
  // Static imports validate the complete export graph before any provider
  // executes. The wrapper contains no provider code or compiler algorithm.
  const namespace=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source.join('\n')));
  for(let index=0;index<pending.length;index++){
   const declaration=pending[index].declaration;
   accept(declaration,namespace['__eliscript_namespace_'+index]);
  }
 }
 return loaded;
}

export async function instantiateManagedRuntimeWithHostModules(bytes,options={}){
 options={...options,randomSeed:validateManagedRuntimeOptions(options)};
 const module=new WebAssembly.Module(bytes),descriptor=managedDescriptor(module);
 if(descriptor?.project){
  const moduleGraph=options.moduleGraph??createManagedModuleGraph(descriptor),configuration={...options,moduleGraph,hostModules:moduleGraph.hostModules,initializeModule:false};
  if(moduleGraph.closed||moduleGraph.attached)throw new Error('module graph is already attached or closed');
  let runtime;
  try{
   runtime=instantiateManagedRuntime(bytes,configuration);
   if(options.initializeModule===false){moduleGraph.attachRuntime(runtime);return runtime;}
   await loadManagedProjectGraph(runtime,descriptor,configuration);return runtime;
  }catch(error){
   if(!moduleGraph.closed)try{runtime?.closeModule();}catch{}
   try{moduleGraph.close();}catch{}
   throw error;
  }
 }
 const hostModules=await loadManagedHostModules(descriptor,options);
 return instantiateManagedRuntime(bytes,{...options,hostModules});
}
