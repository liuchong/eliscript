import {hostUnicodeCaseVersion} from '../runtime/unicode-case-profiles.mjs';
import {createManagedSourceView,createManagedLiteralHostProvider} from './managed-source-view.mjs';
import * as httpHostCapabilities from '../../platform/http.mjs';
// Bulk host boundary for the .eli managed heap. GC, value operations and allocation
// execute in the compiled runtime. Handles own explicit roots until release.
export function failManagedRuntime(code,sourceClass=0) {
 const message=code===1?'invalid managed value handle':code===2?'managed capacity exhausted':code===4?'invalid UTF-8 input':code===5?'invalid UTF-16 surrogate':code===6?'managed string sealing error':code===8?'uninitialized managed module binding':code===12?'uninitialized managed lexical binding':code===9?'cyclic array text conversion':code===10?'invalid Number.toString radix':'managed argument or bounds error';
 const Constructor=sourceClass===2?TypeError:sourceClass===3?RangeError:sourceClass===4?SyntaxError:sourceClass===5?ReferenceError:
  (code===8||code===12)?ReferenceError:code===9?TypeError:code===10?RangeError:Error;
 const error=new Constructor(message);
 error.eliscriptDiagnostic={format:'eliscript-diagnostic',version:1,code:`ELI-RT${String(code).padStart(4,'0')}`,severity:'error',phase:'runtime',message:error.message};throw error;
}
function word(x,max=0xffffffff) {if(typeof x!=='number'||!Number.isInteger(x)||x<0||x>max||Object.is(x,-0))failManagedRuntime(3);return x;}
function flag(value) {if(typeof value!=='boolean')failManagedRuntime(3);return Number(value);}
const hostWellKnownSymbols=Object.freeze([
 Symbol.iterator,Symbol.toPrimitive,Symbol.match,Symbol.replace,Symbol.search,Symbol.split,
 Symbol.species,Symbol.isConcatSpreadable,Symbol.toStringTag,Symbol.hasInstance,
 Symbol.asyncIterator,Symbol.unscopables,Symbol.matchAll,Symbol.dispose,Symbol.asyncDispose,
]);
const hostFunctionToString=Function.prototype.toString;
const hostCrypto=globalThis.crypto;
const hostGetRandomValues=hostCrypto?.getRandomValues;
const hostObjectToString=Object.prototype.toString;
const hostPromiseThen=Promise.prototype.then;
const hostCollectionIntrinsics=Object.freeze([
 Map.prototype.get,Map.prototype.set,Map.prototype.has,Map.prototype.delete,Map.prototype.clear,
 Map.prototype.entries,Map.prototype.keys,Map.prototype.values,Map.prototype.forEach,
 Object.getOwnPropertyDescriptor(Map.prototype,'size').get,
 Set.prototype.add,Set.prototype.has,Set.prototype.delete,Set.prototype.clear,
 Set.prototype.entries,Set.prototype.keys,Set.prototype.values,Set.prototype.forEach,
 Object.getOwnPropertyDescriptor(Set.prototype,'size').get,
 WeakMap.prototype.get,WeakMap.prototype.set,WeakMap.prototype.has,WeakMap.prototype.delete,
 WeakSet.prototype.add,WeakSet.prototype.has,WeakSet.prototype.delete,
]);
const hostIteratorIntrinsics=Object.freeze({
 328:Object.getPrototypeOf(Reflect.apply(Array.prototype.values,[],[])).next,
 329:Object.getPrototypeOf(Reflect.apply(hostCollectionIntrinsics[5],new Map(),[])).next,
 330:Object.getPrototypeOf(Reflect.apply(hostCollectionIntrinsics[16],new Set(),[])).next,
 332:Object.getPrototypeOf(Reflect.apply(RegExp.prototype[Symbol.matchAll],/(?:)/g,[''])).next,
 333:Object.getPrototypeOf(Reflect.apply(String.prototype[Symbol.iterator],'',[])).next,
});
export function createManagedHostCapabilityBridge(descriptor,options={}) {
 const declared=descriptor?.hostCapabilities??[],names=new Set();let handler,closed=false;
 if(!Array.isArray(declared))throw new TypeError('managed host capabilities must be an array');
 for(const item of declared){
  if(!['console-log','console-log-capture','source-operation'].includes(item?.name)||item.module!=='eliscript.host'||item.arity!==2||item.abi!=='managed-host-call-v1'||names.has(item.name))
   throw new TypeError('unsupported or duplicate managed host capability');
  names.add(item.name);
 }
 return Object.freeze({
  attach(value){if(closed||handler||typeof value!=='function')throw new TypeError('managed host capability bridge cannot attach');handler=value;},
  dispatch(name,heap,argumentsList){
   if(closed||!handler)throw new Error('managed host capability bridge is unavailable');
   if(!names.has(name))throw new TypeError('undeclared managed host capability');
   return handler(name,word(heap),word(argumentsList));
  },
  close(){closed=true;handler=undefined;},
 });
}
function managedWeakReference(value){return typeof WeakRef==='function'?new WeakRef(value):{deref:()=>value};}
function yieldManagedJobs(signal) {
 if(signal?.aborted)return Promise.reject(signal.reason??new DOMException('The operation was aborted','AbortError'));
 return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason??new DOMException('The operation was aborted','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},0);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
 });
}
export function validateManagedRuntimeOptions({initializeModule:initialize=true,unicodeVersion='host',randomSeed}={}) {
 if(typeof initialize!=='boolean'||!['host',15.1,16,17].includes(unicodeVersion))failManagedRuntime(3);
 if(randomSeed===undefined)return undefined;
 if(!(Array.isArray(randomSeed)||randomSeed instanceof Uint32Array)||randomSeed.length!==4)failManagedRuntime(3);
 const seed=[word(randomSeed[0]),word(randomSeed[1]),word(randomSeed[2]),word(randomSeed[3])];
 if(seed.every(value=>value===0))failManagedRuntime(3);
 return Object.freeze(seed);
}
export function createManagedHostRuntime(e,descriptor,memory,options={},lifecycle={}) {
 const {maxSlots=1024,initialBytes=65536,maxBytes=16777216,initializeModule:initialize=true,unicodeVersion='host',randomSeed}=options;
 const currentConsole=()=>Object.hasOwn(options,'console')?options.console:globalThis.console;
 const configuredRandomSeed=validateManagedRuntimeOptions({initializeModule:initialize,unicodeVersion,randomSeed});
 const entries=new Map(),moduleExports=new Map();let moduleInfo=null;
 if(descriptor!==null) {
  if(descriptor?.format!=='eliscript-managed-control'||descriptor.version!==1||!['managed-control-v1','managed-module-v1'].includes(descriptor.abi)||!Array.isArray(descriptor.functions))failManagedRuntime(3);
  if(descriptor.abi==='managed-module-v1'){
   moduleInfo=descriptor.module;
   if(!moduleInfo||typeof moduleInfo!=='object'||Array.isArray(moduleInfo)||!Number.isInteger(moduleInfo.bindingCount)||moduleInfo.bindingCount<0||moduleInfo.bindingCount>1048574||!Number.isInteger(moduleInfo.functionCount)||moduleInfo.functionCount<0||moduleInfo.functionCount>1048575||!Array.isArray(moduleInfo.exports)||moduleInfo.exports.length!==descriptor.functions.length)failManagedRuntime(3);
   for(const[field,suffix,arity]of[['initialize','init',1],['get','get',3],['status','status',1],['close','close',1],['abort','abort',2]]){
    const name='__eliscript_module_'+suffix;if(moduleInfo[field]!==name||typeof e[name]!=='function'||e[name].length!==arity)failManagedRuntime(3);
   }
  }else if(descriptor.module!==undefined)failManagedRuntime(3);
  for(const[position,item]of descriptor.functions.entries()){
   const wireName=moduleInfo?item?.wireName:item?.name;
   if(typeof item?.name!=='string'||entries.has(item.name)||typeof e[wireName]!=='function')failManagedRuntime(3);
   if(moduleInfo?wireName!=='__eliscript_export_'+position:item.wireName!==undefined)failManagedRuntime(3);
   const binding=item.callingConvention==='module-binding',uniform=item.callingConvention==='argument-list';
   if(item.callingConvention!==undefined&&!uniform&&!binding)failManagedRuntime(3);
   if(binding){
    if(!moduleInfo||item.arity!==null||item.parameterKinds!==undefined||!Number.isInteger(item.bindingIndex)||item.bindingIndex<0||item.bindingIndex>=moduleInfo.bindingCount||e[wireName].length!==4)failManagedRuntime(3);
   }else if(item.bindingIndex!==undefined)failManagedRuntime(3);
   if(uniform){
    // Required destructuring parameters also use the argument-list ABI.
    // Legacy fixed-arity readers reject null instead of miscalling this entry.
    if(item.arity!==null||!Array.isArray(item.parameterKinds)||item.parameterKinds.length===0||item.parameterKinds.length>65535||e[wireName].length!==4)failManagedRuntime(3);
    let mode='required';
    for(let i=0;i<item.parameterKinds.length;i++){
     const kind=item.parameterKinds[i];
     if(!((kind==='required'&&mode==='required')||(kind==='optional'&&mode!=='rest')||(kind==='rest'&&i===item.parameterKinds.length-1&&mode!=='rest')))failManagedRuntime(3);
     mode=kind;
    }
   }else if(!binding&&(!Number.isInteger(item.arity)||item.arity<0||item.arity>65535||item.parameterKinds!==undefined||e[wireName].length!==item.arity+1))failManagedRuntime(3);
   entries.set(item.name,{arity:item.arity,uniform:uniform||binding,binding,index:item.bindingIndex,wireName});
  }
  if(moduleInfo){
   for(const item of moduleInfo.exports){
    const entry=entries.get(item?.name);if(!entry||moduleExports.has(item.name)||!Number.isInteger(item.index)||item.index<0||(item.name.startsWith('__eliscript_')&&item.name!=='__eliscript_portable__'))failManagedRuntime(3);
    if(item.kind===0){if(!entry.binding||item.index!==entry.index||item.index>=moduleInfo.bindingCount)failManagedRuntime(3);}
    else if(item.kind===1){if(entry.binding||item.index>=moduleInfo.functionCount)failManagedRuntime(3);}else failManagedRuntime(3);
    moduleExports.set(item.name,item);
   }
  }
 }
 if(!moduleInfo&&['init','get','status','close','abort'].some(name=>Object.hasOwn(e,'__eliscript_module_'+name)))failManagedRuntime(3);
 const literalBindings=descriptor?.literalRuntime?.bindings;
 if(descriptor?.literalRuntime!==undefined){
  if(!moduleInfo||descriptor.literalRuntime?.version!==1||!literalBindings||typeof literalBindings!=='object')throw new TypeError('invalid managed literal runtime descriptor');
  for(const name of ['literal-kind','literal-export-value','literal-import-value']){
   const binding=literalBindings[name];
   if(!binding||![0,1].includes(binding.kind)||!Number.isInteger(binding.index)||binding.index<0||
      binding.index>=(binding.kind===0?moduleInfo.bindingCount:moduleInfo.functionCount))throw new TypeError('invalid managed literal runtime binding: '+name);
  }
 }
 const handles=new WeakMap(),frames=new WeakMap(),view=()=>memory.view();
 let exceptionHeap=0;
 const call=(name,...args)=>{const result=e[name](...args)>>>0;const code=e['last-error']();
  if(code===11&&exceptionHeap&&typeof e['value-exception-take']==='function'){
   const value=e['value-exception-take'](exceptionHeap)>>>0,failed=e['last-error']();if(failed)failManagedRuntime(failed);
   if(value>3&&e['value-kind'](heap,value)===35){
    const entry=foreignEntries.get(e['value-foreign-token'](heap,value)>>>0);
    if(entry)throw entry.value;
   }
   throw wrap(value);
  }
  if(code){
   const sourceClass=exceptionHeap&&typeof e['value-exception-class']==='function'?e['value-exception-class'](exceptionHeap)>>>0:0;
   if(exceptionHeap&&typeof e['value-exception-class-set']==='function')e['value-exception-class-set'](exceptionHeap,0);
   failManagedRuntime(code,sourceClass);
  }return result;};
 const caseConfigurable=typeof e['runtime-case-version']==='function';
 const caseVersion=caseConfigurable?(unicodeVersion==='host'?hostUnicodeCaseVersion():unicodeVersion===15.1?151:unicodeVersion*10):170;
 if(caseConfigurable)call('runtime-case-version',caseVersion);
 else if(unicodeVersion!=='host')failManagedRuntime(3);
 if(typeof e['runtime-random-seed']==='function'){
  let seed=configuredRandomSeed;
  if(seed===undefined){
   if(typeof hostGetRandomValues!=='function')throw new Error('managed runtime entropy is unavailable');
   const words=new Uint32Array(4);Reflect.apply(hostGetRandomValues,hostCrypto,[words]);
   // The generator has no all-zero state. This maps the one unusable entropy
   // value to a valid seed without retrying or requesting unbounded data.
   if(words.every(value=>value===0))words[3]=1;
   seed=words;
  }
  call('runtime-random-seed',...seed);
 }else if(configuredRandomSeed!==undefined)failManagedRuntime(3);
 const heap=call('heap-new',word(maxSlots),word(initialBytes),word(maxBytes));exceptionHeap=heap;
 function id(value) {
  if(value===null)return 0;if(value===false)return 1;if(value===true)return 2;if(value===undefined)return 3;
  const entry=handles.get(value);if(!entry)failManagedRuntime(typeof value==='number'?3:1);
  call('value-kind',heap,entry.id);return entry.id;
 }
 function wrap(value,owned=false) {
  if(value<=3)return [null,false,true,undefined][value];
  const kind=call('value-kind',heap,value),handle=Object.freeze({kind});
  if(!owned)call('heap-pin',heap,value);handles.set(handle,{id:value,roots:1});return handle;
 }
 function frameId(token) {const entry=frames.get(token);if(!entry)failManagedRuntime(1);return entry.id;}
 function withCallBoundary(operation) {
  const previous=typeof e['value-function-current-this']==='function'?call('value-function-current-this',heap):3;
  if(previous>3)call('heap-pin',heap,previous);
  const target=call('frame-current',heap);let failed=false;
  try{return operation();}
  catch(error){
   failed=true;
   try{call('frame-unwind',heap,target);}catch{}
   try{if(typeof e['value-call-restore']==='function')call('value-call-restore',heap,previous);else if(typeof e['value-call-reset']==='function')call('value-call-reset',heap);}catch{}
   throw error;
  }finally{if(previous>3)try{call('heap-release',heap,previous);}catch(error){if(!failed)throw error;}}
 }
 function data(value,kind) {const v=id(value);return {v,length:call('value-length',heap,v),offset:call('value-data',heap,v,kind)};}
 function refs(input,kind) {
  if(!Array.isArray(input))failManagedRuntime(3);const borrowed=[];
  try {
   if(kind===14){
    // Snapshot own slots and names, preserving holes. An overridden iterator
    // cannot replace this shape or discard operands protected before getters.
    const length=word(input.length),values=[];
    for(const key of Object.keys(input)){const v=id(input[key]);call('heap-pin',heap,v);borrowed.push(v);values.push([key,v]);}
    const value=call('value-array-new',heap,length);call('heap-pin',heap,value);
    try{
     const offset=call('value-data',heap,value,14),target=view(),names=[];
     for(const[key,v]of values){const index=Number(key);if(Number.isInteger(index)&&index>=0&&index<length&&String(index)===key)target.setUint32(offset+index*4,v,true);else names.push([key,v]);}
     for(const[key,v]of names){const name=api.string(key);try{objectCall('value-array-define',value,id(name),v);}finally{api.release(name);}}
     return wrap(value);
    }finally{call('heap-release',heap,value);}
   }
   // Protect operands before later getters or result allocation can collect them.
   const values=Array.from(input,x=>{const v=id(x);call('heap-pin',heap,v);borrowed.push(v);return v;});
   const value=kind===14?call('value-array-new',heap,word(values.length)):call('value-refs',heap,kind,word(values.length)),offset=call('value-data',heap,value,kind),target=view();
   values.forEach((v,i)=>target.setUint32(offset+i*4,v,true));return wrap(value);
  } finally {for(const value of borrowed)call('heap-release',heap,value);}
 }
 function objectCall(name,...args) {
  return withCallBoundary(()=>call(name,heap,...args));
 }
 function sourceObject(input) {
  if(input===null||typeof input!=='object'||Array.isArray(input))failManagedRuntime(3);
  const borrowed=[];let object=0;
  try {
   const values=Object.keys(input).map(key=>{const value=id(input[key]);call('heap-pin',heap,value);borrowed.push(value);return [key,value];});
   object=objectCall('value-object-new',3);call('heap-pin',heap,object);
   for(const [key,value]of values){const name=api.string(key);try{objectCall('value-object-put',object,id(name),value,2);}finally{api.release(name);}}
   return wrap(object);
  }finally{if(object)call('heap-release',heap,object);for(const value of borrowed)call('heap-release',heap,value);}
 }
 function initializeModuleInstance(){
  if(!moduleInfo)failManagedRuntime(3);const status=call(moduleInfo.status,heap);
  try{return withCollectionBoundary(()=>withCallBoundary(()=>{call(moduleInfo.initialize,heap);return true;}));}
  catch(error){
   try{if(status===0&&call(moduleInfo.status,heap)===1){const match=/^ELI-RT([0-9]+)$/.exec(error?.eliscriptDiagnostic?.code??'');e[moduleInfo.abort](heap,match?Number(match[1]):3);}}catch{}
   throw error;
  }
 }
 // A compiled-runtime cleanup boundary shared by module close and native
 // transport disposal. Realm-root cleanup can be added here independently of
 // transport ownership; externally held values keep their own heap roots.
 lifecycle.dispose=()=>{
  let failed=false,failure;
  const cleanup=[
   ()=>{if(typeof e['value-async-close']==='function')call('value-async-close',heap);},
   ()=>{if(moduleInfo)call(moduleInfo.close,heap);else if(typeof e['value-standard-prototypes-close']==='function')call('value-standard-prototypes-close',heap);},
   ()=>{if(typeof e['value-call-reset']==='function')call('value-call-reset',heap);},
   ()=>{capabilityOpen=false;},
   ()=>{for(const pending of hostPromiseJobs)pending.close();hostPromiseJobs.clear();},
   ()=>{let failure;for(const token of consoleRoots)try{api.release(token);}catch(error){failure??=error;}consoleRoots.clear();if(failure)throw failure;},
   ()=>{if(foreignBuffer){api.release(foreignBuffer);foreignBuffer=undefined;foreignBufferCapacity=0;}foreignEntries.clear();foreignSymbols.clear();sourceCache.clear();sourceSymbols.clear();},
   ()=>{lifecycle.capabilityBridge?.close();},
   ()=>{options.moduleGraph?.close();},
  ];
  for(const action of cleanup){try{action();}catch(error){if(!failed){failed=true;failure=error;}}}
  if(failed)throw failure;
 };
 const consoleRoots=new Set();
 const hostPromiseJobs=new Set();
 let capabilityOpen=true,foreignBuffer,foreignBufferCapacity=0,nextForeignToken=1;
 const foreignEntries=new Map(),foreignObjects=new WeakMap(),foreignSymbols=new Map(),sourceViews=new WeakMap(),sourceViewOperations=new WeakMap(),sourceSymbols=new Map(),sourceCache=new Map(),consoleCaptures=new WeakSet();
 const sourceFinalizers=typeof FinalizationRegistry==='function'?new FinalizationRegistry(({raw,token})=>{
  const entry=sourceCache.get(raw);
  if(capabilityOpen&&entry?.token===token&&entry.reference.deref()===undefined){
   sourceCache.delete(raw);consoleRoots.delete(token);try{api.release(token);}catch{}
  }
 }):null;
 function rememberSource(raw,value,token,refresh,synchronize){
  const previous=sourceCache.get(raw);
  if(previous){sourceFinalizers?.unregister(previous.token);consoleRoots.delete(previous.token);api.release(previous.token);}
  const reference=managedWeakReference(value);
  sourceViewOperations.set(value,{refresh,synchronize});
  sourceCache.set(raw,{
   reference,token,refreshing:false,
   get refresh(){return sourceViewOperations.get(reference.deref())?.refresh;},
   set refresh(operation){const target=reference.deref();if(target!==undefined)sourceViewOperations.get(target).refresh=operation;},
   get synchronize(){return sourceViewOperations.get(reference.deref())?.synchronize;},
   set synchronize(operation){const target=reference.deref();if(target!==undefined)sourceViewOperations.get(target).synchronize=operation;},
  });
  sourceViews.set(value,raw);consoleRoots.add(token);
  if(sourceFinalizers&&typeof WeakRef==='function')sourceFinalizers.register(value,{raw,token},token);
 }
 let collectionSynchronization=0;
 function synchronizeCollections(){
  if(collectionSynchronization||!capabilityOpen)return;
  collectionSynchronization++;
  try{
   const entries=[...sourceCache.values()];
   for(const entry of entries)if(entry.reference.deref()!==undefined&&entry.synchronize)entry.synchronize();
  }finally{collectionSynchronization--;}
 }
 function withCollectionBoundary(operation){
  synchronizeCollections();let failed=false;
  try{return operation();}catch(error){failed=true;throw error;}
  finally{try{synchronizeCollections();}catch(error){if(!failed)throw error;}}
 }
 const hostModules=options.hostModules instanceof Map?options.hostModules:new Map(Object.entries(options.hostModules??{}));
 const defaultHostModules=new Map();
 for(const declaration of descriptor?.hostModules??[]){
  if(declaration.specifier==='eliscript/platform/http.mjs'||declaration.specifier==='eliscript/platform/http')
   defaultHostModules.set(declaration.id,declaration.specifier);
 }
 function hasHostNamespace(id){return hostModules.has(id)||defaultHostModules.has(id);}
 function hostNamespace(id){
  if(hostModules.has(id))return hostModules.get(id);
  const specifier=defaultHostModules.get(id);
  if(specifier==='eliscript/platform/http.mjs'||specifier==='eliscript/platform/http')
   return hostModules.has(specifier)?hostModules.get(specifier):httpHostCapabilities;
  throw new TypeError('undeclared managed host module');
 }
 let literalHostProvider,literalHostProviderIdentity,literalVectorIdentity,literalReducedIdentity,literalRecordIdentity,literalMetadataIdentity,literalTypeIdentity,literalProtocolIdentity,literalRegexIdentity,literalSortedIdentity;
 let literalProtocolNamespaceIdentities=[];
 function literalHostModule(specifiers){
  for(const specifier of specifiers)if(hostModules.has(specifier))return hostModules.get(specifier);
  for(const declaration of descriptor?.hostModules??[]){
   if(specifiers.includes(declaration.specifier)&&hostModules.has(declaration.id))return hostModules.get(declaration.id);
  }
 }
 function literalProvider(){
  const provider=options.literalHostProvider??literalHostModule(['eliscript/runtime/literals','eliscript/runtime/literals.mjs']);
  const vector=literalHostModule(['eliscript/runtime/core/vector','eliscript/runtime/core/vector.mjs']);
  const reduced=literalHostModule(['eliscript/runtime/core/collection-internals','eliscript/runtime/core/collection-internals.mjs']);
  const record=literalHostModule(['eliscript/runtime/core/record','eliscript/runtime/core/record.mjs']);
  const metadata=literalHostModule(['eliscript/runtime/core/metadata','eliscript/runtime/core/metadata.mjs']);
  const type=literalHostModule(['eliscript/runtime/core/type','eliscript/runtime/core/type.mjs']);
  const protocol=literalHostModule(['eliscript/runtime/core/protocol','eliscript/runtime/core/protocol.mjs']);
  const regex=literalHostModule(['eliscript/runtime/core/regex','eliscript/runtime/core/regex.mjs']);
  const sorted=literalHostModule(['eliscript/runtime/core/sorted','eliscript/runtime/core/sorted.mjs']);
  const protocolNamespaceEntries=['collection','value','metadata','transient','order','data-text'].map(family=>
   [family,literalHostModule(['eliscript/runtime/core/'+family,'eliscript/runtime/core/'+family+'.mjs'])]);
  if(!literalHostProvider||provider!==literalHostProviderIdentity||vector!==literalVectorIdentity||reduced!==literalReducedIdentity||record!==literalRecordIdentity||metadata!==literalMetadataIdentity||type!==literalTypeIdentity||protocol!==literalProtocolIdentity||regex!==literalRegexIdentity||sorted!==literalSortedIdentity||protocolNamespaceEntries.some((entry,index)=>entry[1]!==literalProtocolNamespaceIdentities[index])){
   const modules={
    ...(vector?{readPersistentVectorView:vector.readPersistentVectorView,subvec:vector.subvec}:{}),
    ...(reduced?{isReducedValue:reduced.isReducedValue,reducedValue:reduced.reducedValue,unreducedValue:reduced.unreducedValue}:{}),
    ...(record?{isRecordType:record.isRecordType,isRecord:record.isRecord,readRecordState:record.readRecordState,materializeRecordType:record.materializeRecordType}:{}),
    ...(metadata?{meta:metadata.meta,withMeta:metadata.withMeta}:{}),
    ...(type?{materializeTypeDefinition:type.materializeTypeDefinition,materializeTypeValue:type.materializeTypeValue,reifyProtocols:type.reifyProtocols,
      readTypeState:type.readTypeState,readTypeValueState:type.readTypeValueState,readReifiedState:type.readReifiedState}:{}),
    ...(protocol?{isProtocol:protocol.isProtocol,protocolDefinition:protocol.protocolDefinition,
      materializeProtocolFromDefinition:protocol.materializeProtocolFromDefinition,extendProtocolDefault:protocol.extendProtocolDefault,
      readProtocolOperationsOwner:protocol.readProtocolOperationsOwner,readProtocolMethodOwner:protocol.readProtocolMethodOwner}:{}),
    ...(regex?{readRegexState:regex.readRegexState,compileRegex:regex.compileRegex}:{}),
    ...(sorted?{readSortedMapState:sorted.readSortedMapState,readSortedSetState:sorted.readSortedSetState,
      materializeSortedMap:sorted.materializeSortedMap,materializeSortedSet:sorted.materializeSortedSet,
      isDefaultSortedComparator:sorted.isDefaultSortedComparator,defaultSortedComparator:sorted.defaultSortedComparator}:{}),
    protocolNamespaces:{...provider?.protocolNamespaces,...Object.fromEntries(protocolNamespaceEntries.filter(entry=>entry[1]!==undefined))},
   };
   literalHostProvider=createManagedLiteralHostProvider(provider,modules);
   literalHostProviderIdentity=provider;
   literalVectorIdentity=vector;literalReducedIdentity=reduced;
   literalRecordIdentity=record;literalMetadataIdentity=metadata;
   literalTypeIdentity=type;
   literalProtocolIdentity=protocol;
   literalRegexIdentity=regex;
   literalSortedIdentity=sorted;
   literalProtocolNamespaceIdentities=protocolNamespaceEntries.map(entry=>entry[1]);
  }
  return literalHostProvider;
 }
 function reserveForeignBuffer(count){
  if(count<=foreignBufferCapacity)return;
  if(foreignBuffer){if(count>maxSlots)call('heap-collect',heap);pruneForeignValues();count=foreignEntries.size+1;if(count<=foreignBufferCapacity)return;}
  if(count>maxSlots)failManagedRuntime(2);
  const capacity=Math.min(maxSlots,Math.max(count,16,foreignBufferCapacity*2));
  if(foreignBuffer)call('value-bytes-resize',heap,id(foreignBuffer),word(capacity*4));
  else foreignBuffer=wrap(call('value-bytes',heap,word(capacity*4)));
  foreignBufferCapacity=capacity;
 }
 function pruneForeignValues(){
  if(!capabilityOpen||foreignEntries.size===0||!foreignBuffer)return;
  call('value-foreign-live-tokens-into',heap,id(foreignBuffer));
  const bytes=api.readBytes(foreignBuffer),buffer=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),live=new Set();
  for(let index=0;index<bytes.byteLength;index+=4)live.add(buffer.getUint32(index,true));
  for(const token of foreignEntries.keys())if(!live.has(token))foreignEntries.delete(token);
 }
 const projectSteps=new Set(descriptor?.project?.modules?.flatMap(module=>module.steps.map(step=>step.run))??[]);
 const projectTransport=descriptor?.project?Object.freeze({
  prepare(){
   const name=descriptor.project.prepare;
   if(typeof name!=='string'||typeof e[name]!=='function'||e[name].length!==1)failManagedRuntime(3);
   return withCollectionBoundary(()=>withCallBoundary(()=>{call(name,heap);return true;}));
  },
  run(name){
   if(!projectSteps.has(name)||typeof e[name]!=='function'||e[name].length!==1)failManagedRuntime(3);
   return withCollectionBoundary(()=>withCallBoundary(()=>{call(name,heap);return true;}));
  },
  get(kind,index){
   if(!moduleInfo||(kind!==0&&kind!==1))failManagedRuntime(3);
   return withHostValues(({decode})=>decode(call(moduleInfo.get,heap,kind,word(index))));
  },
  bindHoisted(kind,index,value){
   if(!moduleInfo||kind!==1||typeof value!=='function')failManagedRuntime(3);
   return withHostValues(({decode})=>decode(call(moduleInfo.get,heap,kind,word(index))));
  },
  invoke(kind,index,receiver,args,newTarget){
   if(!moduleInfo||(kind!==0&&kind!==1)||!Array.isArray(args))failManagedRuntime(3);
   return withHostValues(({encode,decode,argv,hold})=>{
    const raw=call(moduleInfo.get,heap,kind,word(index));hold(raw);
    const values=argv(args.map(value=>encode(value)));
    return decode(newTarget===undefined?
     objectCall('value-source-invoke-with-this',raw,encode(receiver),values,args.length):
     objectCall('value-source-construct-target',raw,values,args.length,encode(newTarget)));
   });
  },
 }):undefined;
 const api=Object.freeze({
  unicodeVersion:caseVersion===151?15.1:caseVersion/10,
  project:projectTransport,
  initializeModule:initializeModuleInstance,
  getExport(name){if(!moduleInfo||typeof name!=='string'||!moduleExports.has(name))failManagedRuntime(3);const item=moduleExports.get(name);return wrap(call(moduleInfo.get,heap,item.kind,item.index));},
  closeModule(){if(!moduleInfo&&typeof e['value-standard-prototypes-close']!=='function')failManagedRuntime(3);lifecycle.dispose();return moduleInfo!==null;},
  invoke(name,args=[]) {
   const output=withCollectionBoundary(()=>withCallBoundary(()=>{
   if(typeof name!=='string'||!entries.has(name)||!Array.isArray(args))failManagedRuntime(3);
   const entry=entries.get(name);if(!entry.uniform&&args.length!==entry.arity)failManagedRuntime(3);
   const borrowed=[];let entered=false,target=0,argumentsList=0,callee=0,failed=false,result;
   try {
    if(entry.binding){
     // Resolve and borrow the live callee before argument getters can replace it.
     const item=moduleExports.get(name);callee=call(moduleInfo.get,heap,item.kind,item.index);call('heap-pin',heap,callee);borrowed.push(callee);
    }
    const values=Array.from(args,value=>{const v=id(value);call('heap-pin',heap,v);borrowed.push(v);return v;});
    target=call('frame-current',heap);entered=true;
    if(entry.uniform){
     const allocated=call('value-refs',heap,7,word(values.length));call('heap-pin',heap,allocated);argumentsList=allocated;
     const offset=call('value-data',heap,argumentsList,7),targetView=view();
     values.forEach((v,i)=>targetView.setUint32(offset+i*4,v,true));
     return result=wrap(call(entry.wireName,heap,entry.binding?callee:0,argumentsList,values.length));
    }
    return result=wrap(call(entry.wireName,heap,...values));
   } catch(error){
    failed=true;
    // Cleanup must neither replace a source throw (including primitives) nor
    // prevent later roots from being returned when one cleanup action fails.
    if(entered)try{call('frame-unwind',heap,target);}catch{}
    if(typeof e['value-exception-clear']==='function')try{call('value-exception-clear',heap);}catch{}
    throw error;
   } finally{
    let cleanupFailed=false,cleanupError;
    if(argumentsList)try{call('heap-release',heap,argumentsList);}catch(error){cleanupFailed=true;cleanupError=error;}
    for(const value of borrowed)try{call('heap-release',heap,value);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}
    if(!failed&&cleanupFailed){
     // A successful result has not crossed the host boundary if cleanup fails.
     // Return its newly acquired root as well, preserving the cleanup error.
     try{api.release(result);}catch{}
     throw cleanupError;
    }
   }
   }));
   pruneForeignValues();return output;
  },
  promiseState(value) {return call('value-promise-state',heap,id(value));},
  promiseResult(value) {return wrap(call('value-promise-result',heap,id(value)));},
  drainJobs(limit=1024) {
   if(typeof e['value-async-drain']!=='function')failManagedRuntime(3);
   try{return withCollectionBoundary(()=>objectCall('value-async-drain',word(limit)));}
   catch(error){
    if(typeof e['value-async-reset']==='function')try{e['value-async-reset'](heap);}catch{}
    throw error;
   }
  },
  async invokeAsync(name,args=[],{signal,jobLimit=1024}={}) {
   if(signal?.aborted)throw signal.reason??new DOMException('The operation was aborted','AbortError');
   word(jobLimit);if(jobLimit===0)failManagedRuntime(3);
   const promise=api.invoke(name,args);
   if(promise?.kind!==26)return promise;
   let failed=false;
   try {
    for(;;){
     if(signal?.aborted)throw signal.reason??new DOMException('The operation was aborted','AbortError');
     const state=api.promiseState(promise);
     if(state===1)return api.promiseResult(promise);
     if(state===2)throw api.promiseResult(promise);
     if(state!==0)failManagedRuntime(3);
     api.drainJobs(jobLimit);
     if(api.promiseState(promise)===0)await yieldManagedJobs(signal);
    }
   } catch(error){failed=true;throw error;}
   finally {try{api.release(promise);}catch(error){if(!failed)throw error;}}
  },
  number(input) {
   if(typeof input!=='number')failManagedRuntime(3);const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,input,true);
   return wrap(call('value-number',heap,bits.getUint32(0,true),bits.getUint32(4,true)));
  },
  readNumber(value) {return view().getFloat64(data(value,4).offset,true);},
  bigint(input) {
   if(typeof input!=='bigint')failManagedRuntime(3);
   const text=api.string(String(input));
   try{return wrap(objectCall('value-bigint-parse',id(text)));}finally{api.release(text);}
  },
  readBigInt(value) {
   const text=wrap(objectCall('value-bigint-to-string',id(value),10));
   try{return BigInt(api.readString(text));}finally{api.release(text);}
  },
  binary(a,b,operation) {return wrap(call('value-number-binary',heap,id(a),id(b),word(operation,3)));},
  negate(value) {return wrap(call('value-number-negate',heap,id(value)));},
  compare(a,b,operation) {return !!call('value-number-compare',heap,id(a),id(b),word(operation,5));},
  truth(value) {return !!call('value-truth',heap,id(value));},
  keyEqual(left,right) {return !!call('value-key-equal',heap,id(left),id(right));},
  keyHash(value) {return call('value-key-hash',heap,id(value));},
  map(capacity=4) {return wrap(call('value-table-new',heap,10,word(capacity)));},
  setTable(capacity=4) {return wrap(call('value-table-new',heap,11,word(capacity)));},
  tableSize(table) {return call('value-table-size',heap,id(table));},
  tableHas(table,key) {return !!call('value-table-has',heap,id(table),id(key));},
  tableGet(table,key) {return wrap(call('value-table-get',heap,id(table),id(key)));},
  tableSet(table,key,value) {call('value-table-put',heap,id(table),id(key),id(value));return table;},
  tableAdd(table,key) {call('value-table-add',heap,id(table),id(key));return table;},
  tableDelete(table,key) {return !!call('value-table-delete',heap,id(table),id(key));},
  tableClear(table) {call('value-table-clear',heap,id(table));},
  tableIterator(table) {return wrap(call('value-table-iterator',heap,id(table)));},
  iteratorNext(iterator) {
   const it=id(iterator);if(!call('value-iterator-next',heap,it))return Object.freeze({done:true});
   const key=wrap(call('value-iterator-key',heap,it));
   try {return Object.freeze({done:false,key,value:wrap(call('value-iterator-value',heap,it))});}
   catch(error){if(key!==null&&typeof key==='object'){const entry=handles.get(key);call('heap-release',heap,entry.id);entry.roots--;}throw error;}
  },
  closeIterator(iterator) {call('value-iterator-close',heap,id(iterator));},
  string(input) {
   if(typeof input!=='string')failManagedRuntime(3);
   const length=word(input.length),bytes=new Uint8Array(length*2),units=new DataView(bytes.buffer);
   for(let i=0;i<length;i++)units.setUint16(i*2,input.charCodeAt(i),true);
   const value=call('value-string',heap,length),offset=call('value-data',heap,value,5);
   memory.writeBytes(offset,bytes);
   call('value-seal',heap,value);return wrap(value);
  },
  readString(value) {
   const {length,offset}=data(value,5),bytes=memory.readBytes(offset,length*2);
   const source=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];
   for(let start=0;start<length;start+=8192) {const units=[];for(let i=start;i<Math.min(start+8192,length);i++)units.push(source.getUint16(i*2,true));parts.push(String.fromCharCode(...units));}
   return parts.join('');
  },
  concatStrings(left,right) {return wrap(call('value-string-concat',heap,id(left),id(right)));},
  sliceString(value,start,end) {const v=id(value);return wrap(call('value-string-slice',heap,v,word(start),end===undefined?call('value-length',heap,v):word(end)));},
  compareStrings(left,right) {const result=call('value-string-compare',heap,id(left),id(right));return result===0?0:result===1?-1:1;},
  findString(value,needle,start=0) {const result=call('value-string-find',heap,id(value),id(needle),word(start));return result===0xffffffff?-1:result;},
  codePoint(value,index) {return call('value-string-code-point',heap,id(value),word(index));},
  encodeUtf8(value,{strict=false}={}) {return wrap(call('value-utf8-encode',heap,id(value),flag(strict)));},
  decodeUtf8(value,{strict=false,preserveBOM=false}={}) {return wrap(call('value-utf8-decode',heap,id(value),flag(strict),flag(preserveBOM)));},
  bytes(input) {
   if(!Array.isArray(input)&&!(input instanceof Uint8Array))failManagedRuntime(3);
   const values=Array.from(input,x=>word(x,255)),value=call('value-bytes',heap,word(values.length)),offset=call('value-data',heap,value,6);
   memory.writeBytes(offset,Uint8Array.from(values));return wrap(value);
  },
  readBytes(value) {const {length,offset}=data(value,6);return memory.readBytes(offset,length);},
  array(input=[]) {return refs(input,7);},sourceArray(input=[]) {return refs(input,14);},record(input=[]) {return refs(input,8);},
  sourceObject,
  toHostValue(value){return withHostValues(({decode})=>decode(id(value)));},
  fromHostValue(value){return withHostValues(({encode})=>wrap(encode(value)));},
  objectGet(value,key) {return wrap(objectCall('value-object-get',id(value),id(key)));},
  errorStackAvailable(value,key) {
   // Older artifacts retain their ordinary property-read behavior.
   if(typeof e['value-error-stack-available']!=='function')return true;
   return !!objectCall('value-error-stack-available',id(value),id(key));
  },
  objectHas(value,key) {return !!objectCall('value-object-has',id(value),id(key));},
  objectSet(value,key,child) {objectCall('value-object-put',id(value),id(key),id(child),0);return value;},
  objectKeys(value) {return wrap(objectCall('value-object-keys',id(value)));},
  objectCopy(value) {return wrap(objectCall('value-object-copy',id(value)));},
  get(value,index) {return wrap(call('value-get',heap,id(value),word(index)));},
  set(value,index,child) {call('value-set',heap,id(value),word(index),id(child));},
  length(value) {return call('value-length',heap,id(value));},
  resize(value,length) {const v=id(value),kind=call('value-kind',heap,v);if(kind!==6&&kind!==7&&kind!==14)failManagedRuntime(1);
   call(kind===6?'value-bytes-resize':kind===14?'value-array-resize':'value-refs-resize',heap,v,word(length));},
  pin(value) {const v=id(value);call('heap-pin',heap,v);if(v>3)handles.get(value).roots++;},
  release(value) {
   if(value===null||typeof value==='boolean'||value===undefined)return;
   const entry=handles.get(value);if(!entry)failManagedRuntime(1);if(!entry.roots)failManagedRuntime(3);
   call('heap-release',heap,entry.id);entry.roots--;
  },
  auto(thresholdBytes) {call('heap-auto',heap,word(thresholdBytes));},
  frame(count) {const value=call('frame-new',heap,word(count)),token=Object.freeze({frame:true});frames.set(token,{id:value});return token;},
  frameSet(token,index,value) {call('frame-set',heap,frameId(token),word(index),id(value));},
  frameGet(token,index) {return wrap(call('frame-get',heap,frameId(token),word(index)));},
  leaveFrame(token) {call('frame-pop',heap,frameId(token));},
  frameReturn(token,value) {return wrap(call('frame-return',heap,frameId(token),id(value)),true);},
  unwindFrames(target=null) {call('frame-unwind',heap,target===null?0:frameId(target));},
  collect() {const result=call('heap-collect',heap);pruneForeignValues();return result;},live() {return call('heap-live',heap);},
  stats() {return Object.freeze({usedBytes:call('heap-used',heap),capacityBytes:call('heap-capacity',heap),liveValues:call('heap-live',heap),frameDepth:call('frame-depth',heap),collections:call('heap-collections',heap)});},
 });
 function withHostValues(operation,sourceErrors=false){
   if(!capabilityOpen)throw new Error('managed host transport is closed');
   let sourceThrow=false,thrownValue=0,thrownPinned=false,result;
   try{result=withCollectionBoundary(()=>withCallBoundary(()=>{
    const roots=[];let memo=new Map(),reverse=new Map();
    const hold=raw=>{const token=wrap(raw);roots.push(token);return token;};
    const readString=raw=>api.readString(hold(raw));
    const kind=raw=>raw<=3?0:call('value-kind',heap,raw);
    const field=(raw,key)=>{
     const token=api.string(key);roots.push(token);return objectCall('value-object-get',raw,id(token));
    };
    const argv=values=>{
     const raw=call('value-refs',heap,7,word(values.length));hold(raw);
     values.forEach((value,index)=>call('value-set',heap,raw,index,value));return raw;
    };
    const reflect=(raw,operation,key)=>{
     const list=argv(key===undefined?[raw]:[raw,key]);const result=objectCall('value-object-reflection',list,key===undefined?1:2,operation);
     hold(result);return result;
    };
    const sourceThrown=error=>{
     if(error===null||typeof error!=='object'||!handles.has(error))return error;
     let value;
     try{value=decode(id(error));}catch{return error;}
     try{api.release(error);}catch{}
     return value;
    };
    const using=operation=>{
     if(!capabilityOpen)throw new Error('managed host value is closed');
     const start=roots.length,previousMemo=memo,previousReverse=reverse;let failed=false;
     memo=new Map();reverse=new Map();
     try{return withCollectionBoundary(()=>withCallBoundary(operation));}catch(error){failed=true;throw sourceThrown(error);}
     finally{
      memo=previousMemo;reverse=previousReverse;
      let cleanup;for(const token of roots.splice(start))if(!consoleRoots.has(token))try{api.release(token);}catch(error){cleanup??=error;}
      if(!failed&&cleanup)throw cleanup;
     }
    };
    const nativeReflect=(operation,values)=>using(()=>{
     const operands=argv(values.map(value=>encode(value)));
     return decode(objectCall('value-host-reflection',operands,values.length,operation));
    });
    function literalOperation(name,arguments_){
     if(!literalBindings)throw new TypeError('persistent values require the compiled literal runtime');
     const binding=literalBindings[name],function_=call(moduleInfo.get,heap,binding.kind,binding.index);hold(function_);
     const argumentsList=argv(arguments_);
     const result=objectCall('value-source-invoke-with-this',function_,3,argumentsList,arguments_.length);hold(result);return result;
    }
    function encodeLiteral(value,type){
     if(!literalBindings)throw new TypeError('persistent values require the compiled literal runtime');
     const record=literalProvider().read(value);
     if(record.kind!==type||(!['subvector','reduced','record-type','record','type-definition','reified','regex-pattern','sorted-map','sorted-default-comparator'].includes(type)&&!Array.isArray(record.values)))throw new TypeError('invalid literal host provider record');
     const rawRecord=objectCall('value-object-new',3);hold(rawRecord);
     const put=(key,child)=>objectCall('value-object-put',rawRecord,encode(key),child,2);
     put('kind',encode(type));
     if(type==='reduced')put('value',encode(record.value));
     else if(type==='sorted-default-comparator'){}
     else if(type==='sorted-map'){
      if(!Array.isArray(record.entries))throw new TypeError('invalid sorted map boundary entries');
      const entries=call('value-array-new',heap,record.entries.length);hold(entries);
      for(let index=0;index<record.entries.length;index++){
       const entry=record.entries[index];
       if(!Array.isArray(entry)||entry.length!==2)throw new TypeError('invalid sorted map boundary entry');
       call('value-set',heap,entries,index,encodeList(entry));
      }
      put('entries',entries);put('comparison',encode(record.comparison));
     }else if(type==='sorted-set'){
      put('values',encodeList(record.values));put('comparison',encode(record.comparison));
     }
     else if(type==='regex-pattern'){
      put('source',encode(record.source));put('flags',encode(record.flags));
     }
     else if(type==='type-definition'){
      put('name',encode(record.name));put('fields',encodeLiteralArray(record.fields));
      put('protocolPlans',encodeLiteralProtocolPlans(record.protocolPlans));
     }else if(type==='reified')put('protocolPlans',encodeLiteralProtocolPlans(record.protocolPlans));
     else if(type==='type-value'){
      put('type',encode(record.type));put('values',encodeLiteralArray(record.values));
     }
     else if(type==='record-type'){
      put('name',encode(record.name));put('fields',encodeLiteralArray(record.fields));
     }else if(type==='record'){
      put('type',encode(record.type));put('map',encode(record.map));
     }
     else if(type==='subvector'){
      put('source',encode(record.source));put('start',encode(record.start));put('end',encode(record.end));
     }else if(type==='keyword'||type==='symbol'){
      if(record.values.length!==2)throw new TypeError('invalid literal identifier record');
      put('namespace',encode(record.values[0]));put('name',encode(record.values[1]));
     }else{
      let values=record.values;
      if(type==='map'){
       values=[];
       for(const entry of record.values){if(!Array.isArray(entry)||entry.length!==2)throw new TypeError('invalid persistent map boundary entry');values.push(entry[0],entry[1]);}
      }
      put('values',encodeList(values));
     }
     put('metadata',encode(record.metadata??null));
     const raw=literalOperation('literal-import-value',[rawRecord]),token=hold(raw);
     if(kind(raw)!==(['record-type','type-definition','sorted-default-comparator'].includes(type)?18:13))throw new TypeError('compiled literal import did not return its persistent value kind');
     memo.set(raw,value);reverse.set(value,raw);rememberSource(raw,value,token);
     return raw;
    }
    function encodeLiteralArray(values){
     if(!Array.isArray(values))throw new TypeError('invalid persistent declaration array');
     if(reverse.has(values))return reverse.get(values);
     if(sourceViews.has(values))return sourceViews.get(values);
     const raw=call('value-array-new',heap,word(values.length)),token=hold(raw);
     memo.set(raw,values);reverse.set(values,raw);
     try{
      for(let index=0;index<values.length;index++){
       const descriptor=Reflect.getOwnPropertyDescriptor(values,String(index));
       if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw new TypeError('persistent declaration arrays must contain dense data values');
       call('value-set',heap,raw,index,encode(descriptor.value));
      }
      if(Object.isFrozen(values))objectCall('value-object-integrity',raw,0);
      rememberSource(raw,values,token);return raw;
     }catch(error){
      memo.delete(raw);reverse.delete(values);throw error;
     }
    }
    function encodeLiteralProtocolPlans(plans){
     if(!Array.isArray(plans))throw new TypeError('invalid type protocol plan snapshot');
     const raw=call('value-array-new',heap,plans.length);hold(raw);
     for(let index=0;index<plans.length;index++){
      const plan=plans[index];
      if(!Array.isArray(plan)||plan.length!==2||plan[1]===null||typeof plan[1]!=='object')throw new TypeError('invalid type protocol implementation snapshot');
      const pair=call('value-array-new',heap,2);hold(pair);
      const implementations=objectCall('value-object-new',0);hold(implementations);
      for(const key of Reflect.ownKeys(plan[1])){
       const entry=Reflect.getOwnPropertyDescriptor(plan[1],key);
       if(typeof key!=='string'||!entry?.enumerable||!Object.hasOwn(entry,'value')||typeof entry.value!=='function')throw new TypeError('invalid type protocol method snapshot');
       objectCall('value-object-put',implementations,encode(key),encode(entry.value),2);
      }
      objectCall('value-object-integrity',implementations,0);
      call('value-set',heap,pair,0,encode(plan[0]));call('value-set',heap,pair,1,implementations);
      objectCall('value-object-integrity',pair,0);
      call('value-set',heap,raw,index,pair);
     }
     objectCall('value-object-integrity',raw,0);return raw;
    }
    function encode(value){
     if(value===null)return 0;if(value===false)return 1;if(value===true)return 2;if(value===undefined)return 3;
     if(reverse.has(value))return reverse.get(value);
     if((typeof value==='object'||typeof value==='function')&&sourceViews.has(value))return sourceViews.get(value);
     if(typeof value==='symbol'&&sourceSymbols.has(value))return sourceSymbols.get(value);
     if(typeof value==='number'){const token=api.number(value);roots.push(token);return id(token);}
     if(typeof value==='string'){const token=api.string(value);roots.push(token);return id(token);}
     if(typeof value==='bigint'){const token=api.bigint(value);roots.push(token);return id(token);}
     if(typeof value!=='object'&&typeof value!=='function'&&typeof value!=='symbol')throw new TypeError('host value has no managed representation');
     const standardReference=literalBindings?literalProvider().standardProtocolReference?.(value):undefined;
     if(standardReference!==undefined&&literalBindings['literal-protocol-for-role']){
      const protocolRaw=literalOperation('literal-protocol-for-role',[encode(standardReference.role)]);hold(protocolRaw);
      if(protocolRaw!==3){
       decode(protocolRaw);
       const bound=typeof value==='symbol'?sourceSymbols.get(value):reverse.get(value)??sourceViews.get(value);
       if(bound===undefined)throw new TypeError('canonical protocol identity lookup did not bind the actual host member');
       hold(bound);return bound;
      }
     }
     if(value!==null&&(typeof value==='object'||typeof value==='function')){
      const literalKind=literalProvider().kind(value);
      // A host-created protocol may contain mutable extension tables. Keep its
      // actual foreign capability until it belongs to this target; a definition
      // alone is not a faithful snapshot of those dispatch semantics.
      if(literalKind!==null&&!['protocol','protocol-operations','protocol-method'].includes(literalKind))return encodeLiteral(value,literalKind);
     }
     let entry=typeof value==='symbol'?foreignSymbols.get(value):foreignObjects.get(value);
     if(entry&&foreignEntries.has(entry.token)){
      const type=e['value-kind'](heap,entry.raw)>>>0,error=e['last-error']()>>>0;
      if(error===0&&(type===35||type===22)){hold(entry.raw);return entry.raw;}
     }
     if(nextForeignToken>0xffffffff)throw new RangeError('managed foreign reference identities exhausted');
     const identity=nextForeignToken++;let raw;
     if(typeof value==='symbol'){
      const known=hostWellKnownSymbols.indexOf(value);
      if(known>=0){const raw=call('value-symbol-well-known',heap,known);hold(raw);return raw;}
      const registered=Symbol.keyFor(value);
      if(registered!==undefined){const description=encode(registered),raw=objectCall('value-symbol-builtin',argv([description]),1,1);hold(raw);return raw;}
      reserveForeignBuffer(foreignEntries.size+1);raw=objectCall('value-symbol-external',identity,encode(value.description));
     }else{
      reserveForeignBuffer(foreignEntries.size+1);
      raw=objectCall('value-foreign-new',identity,typeof value==='function'?1:0);hold(raw);
      if(typeof value==='function'){
       let constructible=false;
       try{Reflect.construct(new Proxy(value,{construct(){return {};}}),[]);constructible=true;}catch{}
       objectCall('value-foreign-constructor-set',raw,constructible?1:0);
      }
     }
     hold(raw);entry={token:identity,raw,value};foreignEntries.set(identity,entry);
     if(typeof value==='symbol')foreignSymbols.set(value,entry);else foreignObjects.set(value,entry);
     return raw;
    }
    function encodeList(values){
     const raw=call('value-array-new',heap,word(values.length));hold(raw);
     for(let index=0;index<values.length;index++)call('value-set',heap,raw,index,encode(values[index]));
     return raw;
    }
    function encodeDescriptor(value){
     if(value===undefined)return 3;
     const raw=objectCall('value-object-new',3);hold(raw);
     for(const key of Reflect.ownKeys(value)){
      const property=encode(key),child=encode(value[key]);
      objectCall('value-object-put',raw,property,child,2);
     }
     return raw;
    }
    function propertyDescriptor(raw,key){
       const description=objectCall('value-source-own-descriptor',raw,key);hold(description);
       if(description===3)return undefined;
       const item={enumerable:field(description,'enumerable')===2,configurable:field(description,'configurable')===2};
       const valueKey=api.string('value');roots.push(valueKey);
       if(objectCall('value-object-has',description,id(valueKey))){item.value=decode(field(description,'value'));item.writable=field(description,'writable')===2;}
       else{const getter=field(description,'get'),setter=field(description,'set');item.get=getter===3?undefined:decode(getter);item.set=setter===3?undefined:decode(setter);}
       return item;
    }
    function copyProperties(raw,target){
     const names=reflect(raw,1),symbols=call('value-object-symbols',heap,raw);hold(symbols);
     for(const keys of[names,symbols]){
      const count=call('value-length',heap,keys);
      for(let index=0;index<count;index++){
       const key=call('value-get',heap,keys,index);hold(key);
       const property=decode(key),item=propertyDescriptor(raw,key);
       if(item===undefined)continue;
       Object.defineProperty(target,property,item);
      }
     }
    }
    function pendingPromise(raw){
       let timer,finished=false,created,promise;
       const continuations=new WeakMap();
       promise=new Promise((resolve,reject)=>{created={resolve,reject};});
       continuations.set(promise,created);created=undefined;
       const reference=managedWeakReference(promise);
       const pending={close(){
        if(finished)return;
        finished=true;clearTimeout(timer);hostPromiseJobs.delete(pending);
        const target=reference.deref(),continuation=target===undefined?undefined:continuations.get(target);
        if(continuation)continuation.reject(new Error('managed host promise is closed'));
       }};
       const advance=()=>{
        if(finished)return;
        const target=reference.deref(),continuation=target===undefined?undefined:continuations.get(target);
        if(!continuation){finished=true;hostPromiseJobs.delete(pending);return;}
        try{
         if(!capabilityOpen){pending.close();return;}
         api.drainJobs(options.jobLimit??1024);
         const status=call('value-promise-state',heap,raw);
         if(status===0){timer=setTimeout(advance,0);return;}
         if(status!==1&&status!==2)throw new TypeError('invalid managed promise state');
         const value=using(()=>decode(call('value-promise-result',heap,raw)));
         finished=true;hostPromiseJobs.delete(pending);
         if(status===1)continuation.resolve(value);else continuation.reject(value);
        }catch(error){finished=true;hostPromiseJobs.delete(pending);continuation.reject(sourceThrown(error));}
       };
       hostPromiseJobs.add(pending);promise.catch(()=>{});queueMicrotask(advance);
     return promise;
    }
    function attachCollection(raw,result,type){
      const valueReference=managedWeakReference(result);
      const weak=value=>(typeof WeakRef==='function'&&((typeof value==='object'&&value!==null)||typeof value==='function'))?{reference:new WeakRef(value)}:{value};
      const unweak=item=>item.reference?item.reference.deref():item.value;
      let baseline=[],busy=false;
      const readHost=target=>{
       const iterator=Reflect.apply(hostCollectionIntrinsics[type===15?5:16],target,[]),items=[];
       for(const item of iterator)items.push(type===15?item:[item,item]);
       return items;
      };
      const same=(left,right)=>left.length===right.length&&left.every((entry,index)=>
       Object.is(entry[0],unweak(right[index][0]))&&Object.is(entry[1],unweak(right[index][1])));
      const remember=items=>{baseline=items.map(([key,value])=>[weak(key),weak(value)]);};
      const readSource=()=>{
       const table=view().getUint32(call('value-data',heap,raw,type),true),items=[];
       const iterator=call('value-table-iterator',heap,table);hold(iterator);
       try{
        while(call('value-iterator-next',heap,iterator)){
         const key=decode(call('value-iterator-key',heap,iterator));
         items.push([key,type===15?decode(call('value-iterator-value',heap,iterator)):key]);
        }
       }finally{call('value-iterator-close',heap,iterator);}
       return {table,items};
      };
      // Retain the longest ordered prefix already present. Delete/reinsert only
      // the suffix that actually moved, so live table iterators retain tickets.
      const retainedPrefix=(current,desired)=>{
       let cursor=0,prefix=0;
       for(const entry of desired){
        let found=-1;
        for(let index=cursor;index<current.length;index++)if(Object.is(current[index][0],entry[0])){found=index;break;}
        if(found<0)break;cursor=found+1;prefix++;
       }
       return prefix;
      };
      const importHost=(target,host)=>{
       const {table,items}=readSource(),prefix=retainedPrefix(items,host),kept=new Set(host.slice(0,prefix).map(item=>item[0]));
       for(const [key]of items)if(!kept.has(key))call('value-table-delete',heap,table,encode(key));
       for(const [key,value]of host){
        if(type===15)call('value-table-put',heap,table,encode(key),encode(value));
        else call('value-table-add',heap,table,encode(key));
       }
      };
      const exportSource=(target)=>{
       const {items}=readSource(),current=readHost(target),prefix=retainedPrefix(current,items),kept=new Set(items.slice(0,prefix).map(item=>item[0]));
       const remove=hostCollectionIntrinsics[type===15?3:12],insert=hostCollectionIntrinsics[type===15?1:10];
       for(const [key]of current)if(!kept.has(key))Reflect.apply(remove,target,[key]);
       for(const [key,value]of items)Reflect.apply(insert,target,type===15?[key,value]:[key]);
       remember(items);
      };
      const synchronizeCollection=()=>{
       const target=valueReference.deref();if(target===undefined||busy)return;
       busy=true;
       try{return using(()=>{
        const host=readHost(target);
        if(!same(host,baseline))importHost(target,host);
        exportSource(target);
       });}finally{busy=false;}
      };
      const entry=sourceCache.get(raw);
      entry.synchronize=synchronizeCollection;
      entry.refresh=synchronizeCollection;
      busy=true;
      try{exportSource(result);}finally{busy=false;}
    }
    let bindingStandardProtocols=false;
    function decodeLiteralProtocol(raw,record,token){
     const role=decode(field(record,'role'));
     const standard=role===undefined?undefined:literalProvider().standardProtocol?.(role);
     if(role!==undefined&&standard===undefined)throw new TypeError('literal host provider cannot bind the canonical protocol role');
     const definitionRaw=field(record,'definition');hold(definitionRaw);
     const namesRaw=field(definitionRaw,'operations');hold(namesRaw);
     const operationsRaw=field(record,'operations');hold(operationsRaw);
     if(kind(namesRaw)!==14||kind(operationsRaw)!==13)throw new TypeError('compiled protocol has an invalid definition');
     const names=[],methods=[],slots=[],rawSlots=[],implementations=Object.create(null);
     for(let index=0,count=call('value-length',heap,namesRaw);index<count;index++){
      const name=decode(call('value-get',heap,namesRaw,index));
      if(typeof name!=='string')throw new TypeError('compiled protocol has an invalid operation');
      const method=field(operationsRaw,name);hold(method);
      if(kind(method)!==18)throw new TypeError('compiled protocol has an invalid dispatch function');
      const slot=field(method,'slot');hold(slot);
      if(kind(slot)!==22)throw new TypeError('compiled protocol has an invalid slot');
      names.push(name);methods.push(method);rawSlots.push(slot);
      if(standard!==undefined){
       if(!Object.hasOwn(standard.operations,name))throw new TypeError('canonical protocol operation contract mismatch');
       const symbol=standard.operations[name].slot;
       const previous=memo.get(slot)??sourceCache.get(slot)?.reference.deref();
       if(previous!==undefined&&previous!==symbol)throw new TypeError('canonical protocol slot was already decoded with a different identity');
       sourceSymbols.set(symbol,slot);reverse.set(symbol,slot);memo.set(slot,symbol);slots.push(symbol);
      }else slots.push(decode(slot));
      Object.defineProperty(implementations,name,{enumerable:true,value:(receiver,...arguments_)=>using(()=>{
       const operands=argv([encode(receiver),...arguments_.map(value=>encode(value))]);
       return decode(objectCall('value-source-invoke-with-this',method,3,operands,arguments_.length+1));
      })});
     }
     const definition={format:decode(field(definitionRaw,'format')),version:decode(field(definitionRaw,'version')),
      name:decode(field(definitionRaw,'name')),operations:names};
     const protocol=literalProvider().create('protocol',undefined,null,{definition,slots,implementations,role});
     memo.set(raw,protocol);reverse.set(protocol,raw);rememberSource(raw,protocol,token);
     const operations=protocol.operations,operationsToken=hold(operationsRaw);
     memo.set(operationsRaw,operations);reverse.set(operations,operationsRaw);rememberSource(operationsRaw,operations,operationsToken);
     for(let index=0;index<names.length;index++){
      const method=operations[names[index]],methodRaw=methods[index],methodToken=hold(methodRaw);
      memo.set(methodRaw,method);reverse.set(method,methodRaw);rememberSource(methodRaw,method,methodToken);
      const slotRaw=rawSlots[index];
      sourceSymbols.set(method.slot,slotRaw);reverse.set(method.slot,slotRaw);memo.set(slotRaw,method.slot);
     }
     return protocol;
    }
    function decode(raw){
     if(raw<=3)return[null,false,true,undefined][raw];
     if(memo.has(raw))return memo.get(raw);
     const token=hold(raw),type=kind(raw);
     if(type===4)return api.readNumber(token);
     if(type===5)return api.readString(token);
     if(type===34)return api.readBigInt(token);
     if(type===35){const identity=call('value-foreign-token',heap,raw),entry=foreignEntries.get(identity);if(!entry)throw new ReferenceError('managed host reference has been released');return entry.value;}
     const cachedEntry=sourceCache.get(raw),cached=cachedEntry?.reference.deref();
     if(cached!==undefined){
      memo.set(raw,cached);reverse.set(cached,raw);
      if(cachedEntry.refresh&&!cachedEntry.refreshing){cachedEntry.refreshing=true;try{cachedEntry.refresh();}finally{cachedEntry.refreshing=false;}}
      return cached;
     }
     if(type===22){
      for(const [symbol,bound]of sourceSymbols)if(bound===raw){memo.set(raw,symbol);reverse.set(symbol,raw);return symbol;}
      // A slot can precede its owner in an output graph. Query only actual
      // already-registered target roles before creating any local Symbol.
      if(!bindingStandardProtocols&&literalBindings?.['literal-protocol-for-role']){
       bindingStandardProtocols=true;
       try{
        for(const role of literalProvider().standardProtocolRoles?.()??[]){
         const protocol=literalOperation('literal-protocol-for-role',[encode(role)]);hold(protocol);
         if(protocol!==3)decode(protocol);
         if(memo.has(raw))return memo.get(raw);
        }
       }finally{bindingStandardProtocols=false;}
      }
      const payload=call('value-data',heap,raw,22),p=view(),provenance=p.getUint32(payload-20,true),identifier=p.getUint32(payload-16,true),description=p.getUint32(payload,true);
      const text=description===3?undefined:readString(description);
      const external=provenance===3?foreignEntries.get(identifier):undefined;
      if(provenance===3&&!external)throw new ReferenceError('managed host Symbol has been released');
      const value=external?external.value:provenance===2?hostWellKnownSymbols[identifier]:provenance===1?Symbol.for(text):Symbol(text);
      if(provenance===2&&value===undefined)throw new TypeError('unknown managed well-known Symbol');
      memo.set(raw,value);reverse.set(value,raw);if(!sourceSymbols.has(value)){sourceSymbols.set(value,raw);consoleRoots.add(token);}return value;
     }
     if((type===13||type===18)&&literalBindings){
      const brand=literalOperation('literal-kind',[raw]);
      if(brand!==0){
       const type=readString(brand),record=literalOperation('literal-export-value',[raw]);
       if(record===0)throw new TypeError('compiled persistent value lost its literal brand');
       const declaredKind=readString(field(record,'kind'));
       if(declaredKind!==type)throw new TypeError('compiled persistent literal kind mismatch');
       if(type==='protocol')return decodeLiteralProtocol(raw,record,token);
       if(type==='protocol-operations'||type==='protocol-method'){
        const ownerRaw=field(record,'protocol');hold(ownerRaw);
        const owner=decode(ownerRaw);
        const result=type==='protocol-operations'?owner.operations:owner.operations[decode(field(record,'operation'))];
        if(memo.get(raw)!==result)throw new TypeError('compiled protocol member does not belong to its declared owner');
        return result;
       }
       let values,vectorView;
       if(type==='reduced')values=decode(field(record,'value'));
       else if(type==='sorted-default-comparator'){}
       else if(type==='sorted-map'||type==='sorted-set'){
        const array=field(record,type==='sorted-map'?'entries':'values');hold(array);
        if(kind(array)!==14)throw new TypeError('compiled sorted value has no bulk data');
        values=[];
        for(let index=0,count=call('value-length',heap,array);index<count;index++)values.push(decode(call('value-get',heap,array,index)));
        vectorView={comparison:decode(field(record,'comparison'))};
       }
       else if(type==='regex-pattern')vectorView={source:decode(field(record,'source')),flags:decode(field(record,'flags'))};
       else if(type==='type-definition'){
        const fields=field(record,'fields');hold(fields);
        if(kind(fields)!==14)throw new TypeError('compiled type declaration has no field list');
        vectorView={name:decode(field(record,'name')),fields:decode(fields),protocolPlans:decode(field(record,'protocolPlans'))};
       }else if(type==='reified')vectorView={protocolPlans:decode(field(record,'protocolPlans'))};
       else if(type==='type-value'){
        vectorView={type:decode(field(record,'type'))};
        const array=field(record,'values');hold(array);
        if(kind(array)!==14)throw new TypeError('compiled type value has no field list');
        values=decode(array);
       }
       else if(type==='record-type'){
        const fields=field(record,'fields');hold(fields);
        if(kind(fields)!==14)throw new TypeError('compiled record declaration has no field list');
        vectorView={name:decode(field(record,'name')),fields:decode(fields)};
       }else if(type==='record')vectorView={type:decode(field(record,'type')),map:decode(field(record,'map'))};
       else if(type==='subvector')vectorView={source:decode(field(record,'source')),start:decode(field(record,'start')),end:decode(field(record,'end'))};
       else if(type==='keyword'||type==='symbol')values=[decode(field(record,'namespace')),decode(field(record,'name'))];
       else{
        const array=field(record,'values');hold(array);
        if(kind(array)!==14)throw new TypeError('compiled persistent literal has no bulk values');
        values=[];
        for(let index=0,count=call('value-length',heap,array);index<count;index++)values.push(decode(call('value-get',heap,array,index)));
        if(type==='map'){
         if(values.length%2)throw new TypeError('compiled persistent map has an incomplete entry');
         const entries=[];for(let index=0;index<values.length;index+=2)entries.push([values[index],values[index+1]]);values=entries;
        }
       }
       const metadata=decode(field(record,'metadata'));
       const result=literalProvider().create(type,values,metadata,vectorView);
       memo.set(raw,result);reverse.set(result,raw);rememberSource(raw,result,token);return result;
      }
     }
     let result,refresh,synchronize;
     if(type===14)result=new Array(call('value-length',heap,raw));
     else if(type===13||type===17)result={};
     else if(type===15)result=new Map();
     else if(type===16)result=new Set();
     else if(type===23)result=new WeakMap();
     else if(type===24)result=new WeakSet();
     else if(type===36)result=Object(decode(call('value-source-boxed-primitive',heap,raw)));
     else if(type===18){
      const constructible=call('value-function-constructible',heap,raw)!==0;
      // A bound target has no nonconfigurable own prototype. The owning
      // runtime supplies the source function's exact own descriptors.
      result=constructible?function(){}.bind(undefined):()=>{};
     }else if(type===21){
      const payload=call('value-data',heap,raw,21),p=view(),source=p.getUint32(payload+4,true),bits=p.getUint32(payload-16,true);
      const flags=(bits&8?'g':'')+(bits&32?'i':'')+(bits&1?'m':'')+(bits&2?'s':'')+(bits&4?'u':'')+(bits&16?'y':'');
      result=new RegExp(readString(source),flags);
     }else if(type===26){
      const state=call('value-promise-state',heap,raw);
      if(state===0)result=pendingPromise(raw);
      else{
       const value=decode(call('value-promise-result',heap,raw));
       result=state===1?Promise.resolve(value):Promise.reject(value);
       if(state===2)result.catch(()=>{});
      }
     }else throw new TypeError('console value has no managed host representation');
     if(type===13||type===14||type===17||type===18||type===36){
      const target=result;
      const sourceView=createManagedSourceView({target,operations:{
       descriptor:key=>using(()=>propertyDescriptor(raw,encode(key))),
       keys:()=>using(()=>{
        const output=[],names=objectCall('value-source-own-keys',raw,1);hold(names);
        const symbols=objectCall('value-source-own-keys',raw,2);hold(symbols);
        for(const list of[names,symbols])for(let index=0,count=call('value-length',heap,list);index<count;index++)output.push(decode(call('value-get',heap,list,index)));
        return output;
       }),
       get:(key,receiver)=>nativeReflect(1,[result,key,receiver]),
       set:(key,value,receiver)=>nativeReflect(2,[result,key,value,receiver]),
       has:key=>nativeReflect(14,[result,key]),
       define:(key,entry)=>nativeReflect(10,[result,key,entry]),
       delete:key=>nativeReflect(11,[result,key]),
       prototype:()=>using(()=>decode(reflect(raw,0))),
       setPrototype:prototype=>nativeReflect(7,[result,prototype]),
       extensible:()=>nativeReflect(13,[result]),
       preventExtensions:()=>nativeReflect(12,[result]),
       apply:(receiver,args)=>using(()=>{
        const list=argv(args.map(value=>encode(value)));
        return decode(objectCall('value-source-invoke-with-this',raw,encode(receiver),list,args.length));
       }),
       construct:type===18&&call('value-function-constructible',heap,raw)!==0?(args,newTarget)=>using(()=>{
        const list=argv(args.map(value=>encode(value)));
        return decode(objectCall('value-source-construct-target',raw,list,args.length,encode(newTarget)));
       }):undefined,
      }});
      result=sourceView.value;
      refresh=sourceView.refresh;
     }
     memo.set(raw,result);reverse.set(result,raw);rememberSource(raw,result,token,refresh,synchronize);
     if(refresh){const entry=sourceCache.get(raw);entry.refreshing=true;try{refresh();}finally{entry.refreshing=false;}}
     if(type===15||type===16)attachCollection(raw,result,type);
     if(type===13||type===14||type===17||type===18||type===36)return result;
     if(type!==26)copyProperties(raw,result);
     return result;
    }
     let failed=false;
    try{return operation({encode,encodeList,encodeDescriptor,decode,argv,hold,kind,reflect,field,roots});
    }catch(error){
     failed=true;error=sourceThrown(error);if(!sourceErrors)throw error;try{thrownValue=encode(error);call('heap-pin',heap,thrownValue);thrownPinned=true;sourceThrow=true;return 0;}catch{throw error;}
    }finally{
     let cleanup;for(let index=roots.length-1;index>=0;index--)if(!consoleRoots.has(roots[index]))try{api.release(roots[index]);}catch(error){cleanup??=error;}
     memo.clear();reverse.clear();
     if(!failed&&cleanup)throw cleanup;
    }
   }));}catch(error){if(!sourceThrow)throw error;}
   if(sourceThrow){if(thrownPinned)call('heap-release',heap,thrownValue);e['value-throw'](heap,thrownValue);return 0;}
   return result;
 }
 if(lifecycle.capabilityBridge){
  lifecycle.capabilityBridge.attach((name,owner,argumentsList)=>{
   if(owner!==heap)throw new TypeError('host capability belongs to another managed heap');
   return withHostValues(({encode,encodeList,encodeDescriptor,decode,argv,hold,kind,reflect,field,roots})=>{
     hold(argumentsList);if(kind(argumentsList)!==7)throw new TypeError('host operation requires its argument tuple');
     const values=[],count=call('value-length',heap,argumentsList);
     for(let index=0;index<count;index++)values.push(decode(call('value-get',heap,argumentsList,index)));
     let output;
     if(name==='console-log-capture'){
      const receiver=currentConsole(),callee=receiver.log,capture=Object.freeze({receiver,callee});consoleCaptures.add(capture);output=capture;
     }else if(name==='console-log'){
      const[capture,...args]=values;if(!consoleCaptures.has(capture))throw new TypeError('invalid console-log capture');
      output=Reflect.apply(capture.callee,capture.receiver,args);
     }else if(name==='source-operation'){
      const[operation,target,key,value]=values;
      if(!Number.isInteger(operation)||operation<0||(operation>24&&operation!==28&&operation!==29&&operation!==30&&operation!==31))throw new TypeError('unknown managed host operation');
      switch(operation){
       case 0:{
        const declarations=descriptor.hostModules?.filter(item=>item.id===target)??[];
        if(!declarations.length||!hasHostNamespace(target))throw new TypeError('undeclared managed host module');
        const namespace=hostNamespace(target);
        if(key===undefined){if(!declarations.some(item=>item.namespace))throw new TypeError('host namespace import was not declared');output=namespace;}
        else{if(!declarations.some(item=>item.namespace||item.allowedExports.includes(key)))throw new TypeError('host export import was not declared');if(!Object.hasOwn(namespace,key))throw new SyntaxError('host module does not export '+key);output=namespace[key];}
        break;
       }
       case 1:output=Reflect.get(target,key,values.length>3?value:target);break;
       case 2:if(!Reflect.set(target,key,value))throw new TypeError('host property assignment failed');output=value;break;
       case 3:output=Object.hasOwn(target,key);break;
       case 4:return encodeList(Reflect.ownKeys(target));
       case 5:return encodeDescriptor(Reflect.getOwnPropertyDescriptor(target,key));
       case 6:output=Reflect.getPrototypeOf(target);break;
       case 7:if(!Reflect.setPrototypeOf(target,key))throw new TypeError('host prototype assignment failed');output=target;break;
       case 8:output=Reflect.apply(target,key,values.slice(3));break;
       case 9:output=Reflect.construct(target,values.slice(2));break;
       case 10:Object.defineProperty(target,key,value);output=target;break;
       case 11:output=Reflect.deleteProperty(target,key);break;
       case 12:output=Object.preventExtensions(target);break;
       case 13:output=Reflect.isExtensible(target);break;
       case 14:output=Reflect.has(target,key);break;
       case 15:output=Object.freeze(target);break;
       case 16:output=Array.isArray(target);break;
       case 17:output=Object.isFrozen(target);break;
       case 18:
        if(!options.moduleGraph||typeof options.moduleGraph.bindingChanged!=='function')throw new TypeError('managed module graph is unavailable');
        options.moduleGraph.bindingChanged(target,key,value);output=undefined;break;
       case 19:output=Reflect.construct(target,values.slice(3),key);break;
       case 20:output=Reflect.set(target,key,value,values.length>4?values[4]:target);break;
       case 21:output=Reflect.defineProperty(target,key,value);break;
       case 22:output=Reflect.setPrototypeOf(target,key);break;
       case 23:output=Reflect.preventExtensions(target);break;
       case 24:output=Reflect.apply(hostFunctionToString,target,[]);break;
       case 28:output=Reflect.apply(hostObjectToString,target,[]);break;
       case 29:{
        if(!Number.isInteger(target)||target<300||target>325)throw new TypeError('unknown managed collection intrinsic');
        output=Reflect.apply(hostCollectionIntrinsics[target-300],key,values.slice(3));break;
       }
       case 30:{
        if(!Number.isInteger(target)||!Object.hasOwn(hostIteratorIntrinsics,target))throw new TypeError('unknown managed iterator intrinsic');
        output=Reflect.apply(hostIteratorIntrinsics[target],key,values.slice(3));break;
       }
       case 31:output=Reflect.apply(hostPromiseThen,target,values.slice(2));break;
      }
     }else throw new TypeError('unknown managed host capability');
     return encode(output);
   },true);
  });
 }
 if(moduleInfo&&initialize)initializeModuleInstance();
 return api;
}
