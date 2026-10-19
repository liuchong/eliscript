// ESM facades transport cells and initializer steps; source evaluation remains
// inside the selected managed WASM/native artifact.
const quote=JSON.stringify;
const copyArguments=Array.from;
const projectLoads=new WeakMap();
const reservedFunctionNames=new Set(('await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield arguments eval').split(' '));
function functionName(value){
 if(typeof value!=='string'||!/^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(value)||reservedFunctionNames.has(value))throw new TypeError('invalid emitted hoisted function name');
 return value;
}
function moduleId(value){
 if(typeof value!=='string'||!value||/[\\:\u0000?#]/.test(value)||value.split('/').some(part=>!part||part==='.'||part==='..'))throw new TypeError('invalid managed module graph path');
 return value;
}
function reference(item){
 if(!item||![0,1].includes(item.kind)||!Number.isSafeInteger(item.index)||item.index<0)throw new TypeError('invalid managed project cell');
 return item.kind+':'+item.index;
}
function relative(from,to){
 const left=moduleId(from).split('/');left.pop();const right=moduleId(to).split('/');
 while(left.length&&right.length&&left[0]===right[0]){left.shift();right.shift();}
 const value=[...left.map(()=>'..'),...right].join('/');return value.startsWith('.')?value:'./'+value;
}
export function managedHostModuleEdges(declaration){
 const edges=declaration.edges??[declaration];
 if(!Array.isArray(edges)||!edges.length)throw new TypeError('host module edges must be a nonempty array');
 return edges.map(edge=>{
  if(typeof edge?.specifier!=='string'||!edge.specifier||typeof edge.referrer!=='string'||!Array.isArray(edge.allowedExports)||edge.allowedExports.some(name=>typeof name!=='string')||new Set(edge.allowedExports).size!==edge.allowedExports.length||typeof edge.namespace!=='boolean')throw new TypeError('invalid host import edge');
  moduleId(edge.referrer);
  return{...edge,id:declaration.id};
 });
}
function projectDescription(descriptor){
 const project=descriptor?.project;
 if(!project||typeof project.prepare!=='string'||!Array.isArray(project.modules))throw new TypeError('managed artifact has no phased project interface');
 const modules=new Map(),exports=new Map(),steps=new Map();
 for(const item of project.modules){
  const id=moduleId(item?.id);
  if(modules.has(id)||!Array.isArray(item.dependencies)||!Array.isArray(item.steps)||!Array.isArray(item.exports))throw new TypeError('invalid phased project module');
  const names=new Set();
  for(const entry of item.exports){
   const key=reference(entry);
   if(typeof entry.name!=='string'||names.has(entry.name)||typeof entry.mutable!=='boolean')throw new TypeError('invalid managed project export');
   names.add(entry.name);
   if(entry.kind===1&&(!Number.isSafeInteger(entry.functionLength)||entry.functionLength<0||entry.functionLength>65535||typeof entry.functionName!=='string'||typeof entry.functionConstructible!=='boolean'||typeof entry.functionAsync!=='boolean'||entry.functionAsync&&entry.functionConstructible))throw new TypeError('hoisted function metadata is missing');
   const previous=exports.get(key);
   if(previous&&entry.kind===1&&['functionLength','functionName','functionConstructible','functionAsync'].some(field=>previous[field]!==entry[field]))throw new TypeError('conflicting canonical project function metadata');
   if(!previous)exports.set(key,entry);
  }
  for(const step of item.steps){
   if(typeof step?.run!=='string'||!step.run||steps.has(step.run)||!Array.isArray(step.initializes))throw new TypeError('invalid managed project initialization step');
   const initialized=new Set(step.initializes.map(reference));
   if(initialized.size>1)throw new TypeError('mixed project requires a separate phase for each lexical initialization');
   steps.set(step.run,{...step,module:id});
  }
  if(item.portable!==undefined){
   if(!Array.isArray(item.portable))throw new TypeError('managed portable manifest must be an array');
   const portableNames=new Set();
   for(const entry of item.portable){
    const key=reference(entry);
    if(entry.kind!==1||typeof entry.name!=='string'||portableNames.has(entry.name)||!item.exports.some(exported=>reference(exported)===key))throw new TypeError('portable manifest refers to an unexported managed function');
    portableNames.add(entry.name);
   }
   if(item.portable.length){
    const binding=item.portableBinding,key=reference(binding),exported=item.exports.find(entry=>entry.name==='__eliscript_portable__');
    if(binding.kind!==0||exported&&reference(exported)!==key||!item.steps.at(-1)?.initializes.some(entry=>reference(entry)===key))throw new TypeError('portable manifest lacks its original tail initialization binding');
   }
  }
  modules.set(id,item);
 }
 const hostModules=new Map();
 for(const item of descriptor.hostModules??[]){
  if(typeof item?.id!=='string'||hostModules.has(item.id)||typeof item.specifier!=='string'||!item.specifier||typeof item.referrer!=='string'||!Array.isArray(item.allowedExports)||item.allowedExports.some(name=>typeof name!=='string')||new Set(item.allowedExports).size!==item.allowedExports.length||typeof item.namespace!=='boolean')throw new TypeError('invalid mixed host module declaration');
  managedHostModuleEdges(item);hostModules.set(item.id,item);
 }
 for(const item of modules.values())for(const dependency of item.dependencies){
  if(dependency?.kind==='managed'){if(!modules.has(dependency.id))throw new TypeError('missing managed project dependency');}
  else if(dependency?.kind==='host'){if(!hostModules.has(dependency.id))throw new TypeError('missing declared host project dependency');}
  else throw new TypeError('invalid project dependency kind');
 }
 return{project,modules,exports,steps,hostModules};
}

class NamespaceBindings extends Map {
 #resolvers=new Map();
 declare(id,resolve){
  if(typeof resolve!=='function')throw new TypeError('host namespace resolver must be callable');
  const old=this.#resolvers.get(id);
  // Different importing modules may refer to the same namespace. Keep its
  // actual ESM identity instead of constructing a namespace-shaped object.
  if(!old)this.#resolvers.set(id,resolve);
  else if(old()!==resolve())throw new TypeError('declared host module has conflicting ESM namespace identities');
 }
 has(id){return super.has(id)||this.#resolvers.has(id);}
 get(id){return super.has(id)?super.get(id):this.#resolvers.get(id)?.();}
 clear(){super.clear();this.#resolvers.clear();}
 *entries(){for(const entry of super.entries())yield entry;for(const[id]of this.#resolvers)if(!super.has(id))yield[id,this.get(id)];}
 [Symbol.iterator](){return this.entries();}
}

export function createManagedModuleGraph(descriptor,options={}){
 const description=projectDescription(descriptor),hostModules=new NamespaceBindings(),listeners=new Map(),hoisted=new Map(),completed=new Set(),moduleFailures=new Map();
 let transport,prepared=false,closed=false,prepareFailed=false,prepareFailure;
 function open(){if(closed)throw new Error('managed module graph is closed');if(!transport)throw new Error('managed module graph transport is not attached');}
 function ready(){open();if(!prepared)throw new ReferenceError('managed project has not been prepared');}
 const graph=Object.freeze({
  descriptor,hostModules,
  get closed(){return closed;},
  get attached(){return transport!==undefined;},
  attachRuntime(runtime){
   const value=runtime?.project;
   if(closed||(transport&&transport!==value))throw new Error('managed module graph transport cannot attach');
   if(transport===value&&transport)return graph;
   if(!value||['prepare','run','get','bindHoisted','invoke'].some(name=>typeof value[name]!=='function'))throw new TypeError('runtime lacks managed project cell transport');
   transport=value;return graph;
  },
  prepare(){
   open();if(prepareFailed)throw prepareFailure;
   if(!prepared)try{transport.prepare();prepared=true;}catch(error){prepareFailed=true;prepareFailure=error;throw error;}
   return graph;
  },
  namespace(id,resolve){
   ready();const declaration=description.hostModules.get(id);if(!declaration)throw new TypeError('undeclared mixed host module');
   hostModules.declare(id,()=>{
    const namespace=resolve();
    if(namespace===null||typeof namespace!=='object')throw new TypeError('expected an actual ESM module namespace');
    for(const name of declaration.allowedExports)if(!Object.hasOwn(namespace,name))throw new SyntaxError('host module does not provide export '+quote(name));
    return namespace;
   });
  },
  bindHoisted(kind,index,fn){
   ready();const key=reference({kind,index});if(kind!==1||typeof fn!=='function')throw new TypeError('invalid hoisted project function');
   if(!description.exports.has(key))throw new TypeError('undeclared canonical project function');
   const existing=hoisted.get(key);
   if(existing){if(existing.source!==fn&&existing.canonical!==fn)throw new TypeError('project function already has a canonical facade');return existing.canonical;}
   const canonical=transport.bindHoisted(kind,index,fn);
   if(typeof canonical!=='function')throw new TypeError('runtime did not return its canonical source function facade');
   hoisted.set(key,{source:fn,canonical});return canonical;
  },
  invoke(kind,index,receiver,args,newTarget){
   ready();const key=reference({kind,index});
   if(newTarget!==undefined&&description.exports.get(key)?.functionConstructible!==true)throw new TypeError('managed source function is not a constructor');
   return transport.invoke(kind,index,receiver,copyArguments(args),newTarget);
  },
  read(kind,index){ready();reference({kind,index});return transport.get(kind,index);},
  step(name){
   ready();const step=description.steps.get(name);if(!step)throw new TypeError('undeclared managed initialization step');
   if(moduleFailures.has(step.module))throw moduleFailures.get(step.module);
   if(!completed.has(name))try{transport.run(name);completed.add(name);}catch(error){moduleFailures.set(step.module,error);throw error;}
  },
  watch(kind,index,listener){
   ready();const key=reference({kind,index});if(typeof listener!=='function')throw new TypeError('binding listener must be callable');
   let group=listeners.get(key);if(!group){group=new Set();listeners.set(key,group);}group.add(listener);
   return()=>{group.delete(listener);if(!group.size)listeners.delete(key);};
  },
  bindingChanged(kind,index,value){
   ready();const group=listeners.get(reference({kind,index}));if(group)for(const listener of [...group])listener(value);
  },
  close(){if(!closed){closed=true;listeners.clear();hoisted.clear();hostModules.clear();completed.clear();moduleFailures.clear();transport=undefined;options.onClose?.();}},
 });
 return graph;
}

// No provider source is rewritten. The caller installs these files beside the
// original provider files, then loads the registry and attaches its real runtime
// before importing the returned public entry module.
export function createManagedProjectFacades(descriptor,{entry,privateDirectory='__eliscript_interop'}={}){
 const description=projectDescription(descriptor),prefix=moduleId(privateDirectory),registry=prefix+'/registry.mjs',files=[],implementations=new Map(),hoists=new Map();
 if(!description.modules.has(entry))throw new TypeError('unknown managed project entry');
 for(const[id]of description.modules){if(id===registry||id.startsWith(prefix+'/'))throw new TypeError('managed project collides with private facade directory');}
 const registrySource='let current;\nexport function install(value){if(current&&current!==value)throw new Error("managed graph already installed");if(value.closed)throw new Error("managed graph is closed");current=value;}\nexport function graph(){if(!current)throw new ReferenceError("managed graph has not been installed");if(current.closed)throw new Error("managed graph is closed");return current;}\n';
 files.push({id:registry,source:registrySource});
 let position=0;
 for(const[id]of description.modules)implementations.set(id,prefix+'/module-'+(position++)+'.mjs');
 const cellOwners=new Map();
 for(const[id,item]of description.modules)for(const step of item.steps)for(const initialized of step.initializes){
  const key=reference(initialized),previous=cellOwners.get(key);
  if(previous!==undefined&&previous!==id)throw new TypeError('project cell has multiple initialization owners');
  cellOwners.set(key,id);
 }
 for(const[key,item]of description.exports)if(item.kind===1){
  const id=prefix+'/function-'+item.index+'.mjs',parameters=Array.from({length:item.functionLength},(_,index)=>'a'+index).join(',');
  const name=functionName(item.functionName),access=name==='__eliscript_graph'?'__eliscript_graph_1':'__eliscript_graph',local=name==='value'?'__eliscript_value':'value';
  let canonical='__eliscript_facade';while(canonical===name||canonical===access||canonical===local)canonical+='_';
  const declaration=item.functionConstructible?
   'function '+name+'('+parameters+'){return '+access+'().invoke(1,'+item.index+',this,arguments,new.target);}\nconst '+local+'='+name+';':
   'const '+local+'={['+quote(name)+']('+parameters+'){return '+access+'().invoke(1,'+item.index+',this,arguments,undefined);}}['+quote(name)+'];';
  const source='import {graph as '+access+'} from '+quote(relative(id,registry))+';\n'+declaration+'\nconst '+canonical+'='+access+'().bindHoisted(1,'+item.index+','+local+');\nexport {'+canonical+' as value};\n';
  files.push({id,source});hoists.set(key,id);
 }
 let moduleIndex=0;
 for(const[id,item]of description.modules){
  const implementation=implementations.get(id),registration=prefix+'/imports-'+(moduleIndex++)+'.mjs';
  const source=['import {graph} from '+quote(relative(implementation,registry))+';'],register=['import {graph} from '+quote(relative(registration,registry))+';'];
  // This back edge obtains hoisted getter declarations without evaluating the
  // implementation body. It does not read a provider export ahead of its turn.
  const external=item.dependencies.filter(dependency=>dependency.kind==='host');
  if(external.length){
   register.push('import {'+external.map((_,index)=>'namespace'+index).join(',')+'} from '+quote(relative(registration,implementation))+';');
   external.forEach((dependency,index)=>register.push('graph().namespace('+quote(dependency.id)+',namespace'+index+');'));
   files.push({id:registration,source:register.join('\n')+'\n'});source.push('import '+quote(relative(implementation,registration))+';');
  }
  const importedHoists=new Map();
  for(const exported of item.exports)if(exported.kind===1){
   const key=reference(exported);
   if(!importedHoists.has(key)){const local='function'+importedHoists.size;source.push('import {value as '+local+'} from '+quote(relative(implementation,hoists.get(key)))+';');importedHoists.set(key,local);}
  }
  let externalIndex=0;const usedEdges=new Map();
  for(const dependency of item.dependencies){
   if(dependency.kind==='managed')source.push('import '+quote(relative(implementation,dependency.id))+';');
   else{
    const declaration=description.hostModules.get(dependency.id),index=externalIndex++,edges=managedHostModuleEdges(declaration).filter(edge=>edge.referrer===id),ordinal=usedEdges.get(dependency.id)??0;
    if(!edges.length)throw new TypeError('host module has no import edge for the managed referrer');
    // Some linkers deduplicate repeated identical declarations into one edge.
    const edge=edges[ordinal]??(edges.length===1?edges[0]:undefined);
    if(!edge)throw new TypeError('host module import edge count differs from source dependency order');
    usedEdges.set(dependency.id,ordinal+1);
    // Resolve the original specifier relative to the original importing module,
    // even though its thin implementation facade lives in a private directory.
    const specifier=edge.specifier.startsWith('.')?relative(implementation,resolveRelative(edge.referrer,edge.specifier)):edge.specifier;
    if(edge.allowedExports.length)source.push('import {'+edge.allowedExports.map((name,n)=>quote(name)+' as check'+index+'_'+n).join(',')+'} from '+quote(specifier)+';');
    source.push('import * as imported'+index+' from '+quote(specifier)+';');
    source.push('export function namespace'+index+'(){return imported'+index+';}');
   }
  }
  const locals=new Map();let nextLocal=0;
  for(const step of item.steps){
   source.push('graph().step('+quote(step.run)+');');
   for(const initialized of step.initializes){
    const key=reference(initialized);if(locals.has(key)||initialized.kind===1)continue;
    const local='binding'+nextLocal++;locals.set(key,local);
    source.push('let '+local+'=graph().read('+initialized.kind+','+initialized.index+');');
    source.push('graph().watch('+initialized.kind+','+initialized.index+',value=>{'+local+'=value;});');
    source.push('export {'+local+' as '+quote('__cell_'+initialized.kind+'_'+initialized.index)+'};');
   }
  }
  for(const exported of item.exports){
   const key=reference(exported),local=exported.kind===1?importedHoists.get(key):locals.get(key);
   if(local)source.push('export {'+local+' as '+quote(exported.name)+'};');
   else{
    const owner=cellOwners.get(key);if(owner===undefined)throw new TypeError('project export has no lexical initialization phase');
    source.push('export {'+quote('__cell_'+exported.kind+'_'+exported.index)+' as '+quote(exported.name)+'} from '+quote(relative(implementation,implementations.get(owner)))+';');
   }
  }
  if(item.portable?.length){
   const local=locals.get(reference(item.portableBinding));
   if(!local)throw new TypeError('portable manifest VM binding has not been initialized');
   if(!item.exports.some(entry=>entry.name==='__eliscript_portable__'))source.push('export {'+local+' as __eliscript_portable__};');
  }
  files.push({id:implementation,source:source.join('\n')+'\n'});
  const publicNames=item.exports.map(exported=>quote(exported.name));
  if(item.portable?.length&&!item.exports.some(entry=>entry.name==='__eliscript_portable__'))publicNames.push('__eliscript_portable__');
  files.push({id,source:'export {'+publicNames.join(',')+'} from '+quote(relative(id,implementation))+';\n'});
 }
 const loadEntry=prefix+'/entry.mjs';
 files.push({id:loadEntry,source:'import * as value from '+quote(relative(loadEntry,entry))+';\nexport {value};\n'});
 return Object.freeze({entry,registry,loadEntry,files:Object.freeze(files.map(file=>Object.freeze(file))),requiresPreparedRuntime:true});
}

export async function loadManagedProjectGraph(runtime,descriptor,options={}){
 const graph=options.moduleGraph;
 if(!graph||typeof graph.attachRuntime!=='function')throw new TypeError('mixed project requires its preallocated moduleGraph');
 const previous=projectLoads.get(graph);
 if(previous){
  if(previous.runtime!==runtime||previous.base!==options.projectModuleBaseURL||previous.entry!==(options.projectEntry??descriptor.project.entry)||previous.loader!==options.importProjectModule||previous.privateDirectory!==options.projectPrivateDirectory)throw new TypeError('managed module graph is already attached to another loader');
  if(previous.failed)return previous.promise;
  if(graph.closed)throw new Error('managed module graph is closed');
  return previous.promise;
 }
 // Refusing an unrelated runtime must not close the graph's existing owner.
 graph.attachRuntime(runtime);
 const record={runtime,base:options.projectModuleBaseURL,entry:options.projectEntry??descriptor.project.entry,loader:options.importProjectModule,privateDirectory:options.projectPrivateDirectory,failed:false};
 // Publish the in-flight record before any user-provided module loader runs.
 projectLoads.set(graph,record);
 record.promise=Promise.resolve().then(async()=>{
  try{
   const facades=createManagedProjectFacades(descriptor,{entry:record.entry,privateDirectory:options.projectPrivateDirectory});
   if(record.base===undefined)throw new TypeError('mixed project requires deployed ESM facades and projectModuleBaseURL');
   const load=record.loader??(url=>import(url));
   if(typeof load!=='function')throw new TypeError('importProjectModule must load the actual generated ESM facade');
   graph.prepare();
   const registry=await load(new URL(facades.registry,record.base).href);
   if(typeof registry?.install!=='function')throw new TypeError('managed facade registry is missing');
   if(graph.closed)throw new Error('managed module graph closed while loading');
   registry.install(graph);
   const entry=await load(new URL(facades.loadEntry,record.base).href);
   if(graph.closed)throw new Error('managed module graph closed while loading');
   if(entry?.value===null||typeof entry?.value!=='object')throw new TypeError('managed facade entry namespace is missing');
   return Object.freeze({runtime,graph,namespace:entry.value,facades});
  }catch(error){
   record.failed=true;
   try{runtime.closeModule?.();}catch{}
   try{runtime.close?.();}catch{}
   try{graph.close();}catch{}
   throw error;
  }
 });
 return record.promise;
}

function resolveRelative(referrer,specifier){
 const parts=moduleId(referrer).split('/');parts.pop();
 for(const part of specifier.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){if(!parts.length)throw new TypeError('host module path escapes the project');parts.pop();}else parts.push(part);
 }
 return moduleId(parts.join('/'));
}
