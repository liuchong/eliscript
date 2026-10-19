import * as literals from '../../runtime/literals.mjs';
import {PersistentList} from '../../runtime/core/list.mjs';
import {PersistentVector,readPersistentVectorView,subvec} from '../../runtime/core/vector.mjs';
import {PersistentHashMap} from '../../runtime/core/map.mjs';
import {PersistentHashSet} from '../../runtime/core/set.mjs';
import {PersistentQueue} from '../../runtime/core/queue.mjs';
import {Keyword,EliscriptSymbol} from '../../runtime/core/identifier.mjs';
import {isReducedValue,reducedValue,unreducedValue} from '../../runtime/core/collection-internals.mjs';
import {materializeRecordType,isRecordType,isRecord,readRecordState} from '../../runtime/core/record.mjs';
import {meta,withMeta} from '../../runtime/core/metadata.mjs';
import {materializeTypeDefinition,materializeTypeValue,reifyProtocols,readTypeState,readTypeValueState,readReifiedState} from '../../runtime/core/type.mjs';
import {isProtocol,protocolDefinition,materializeProtocolFromDefinition,extendProtocolDefault,
 readProtocolOperationsOwner,readProtocolMethodOwner} from '../../runtime/core/protocol.mjs';
import {compileRegex,readRegexState} from '../../runtime/core/regex.mjs';
import {readSortedMapState,readSortedSetState,materializeSortedMap,materializeSortedSet,
 isDefaultSortedComparator,defaultSortedComparator} from '../../runtime/core/sorted.mjs';
import * as collectionProtocols from '../../runtime/core/collection.mjs';
import * as valueProtocols from '../../runtime/core/value.mjs';
import * as metadataProtocols from '../../runtime/core/metadata.mjs';
import * as transientProtocols from '../../runtime/core/transient.mjs';
import * as orderProtocols from '../../runtime/core/order.mjs';
import * as printProtocols from '../../runtime/core/data-text.mjs';

const protocolRoleFields=Object.freeze({
 collection:Object.freeze(['ICounted','IEmptyable','IConj','ILookup','IAssociative','IIndexed','ISeqable',
  'IReduce','IKVReduce','IMap','ISet','IStack','IReversible']),
 value:Object.freeze(['IEquiv','IHash']),metadata:Object.freeze(['IMeta','IWithMeta']),
 transient:Object.freeze(['IEditable','ITransientCollection']),order:Object.freeze(['IComparable']),
 'data-text':Object.freeze(['IPrint']),
});
const canonicalProtocolNamespaces=Object.freeze({collection:collectionProtocols,value:valueProtocols,
 metadata:metadataProtocols,transient:transientProtocols,order:orderProtocols,'data-text':printProtocols});

// This codec is a boundary materializer. All target-side collection operations
// are performed by the compiled .eli graph; no target nodes use host methods.
export function createManagedLiteralHostProvider(provider=literals,modules={}) {
 if(provider&&['kind','read','create'].every(name=>typeof provider[name]==='function'))return provider;
 if(modules&&Reflect.ownKeys(modules).length!==0)provider={...provider,...modules};
 const factories=['list','vector','hashMap','hashSet','queue','keyword','symbol'];
 if(!provider||factories.some(name=>typeof provider[name]!=='function'))throw new TypeError('literal host provider requires its actual collection and identifier factories');
 const canonical=factories.every(name=>provider[name]===literals[name]);
 const constructors=canonical?[PersistentList,PersistentVector,PersistentHashMap,PersistentHashSet,PersistentQueue,Keyword,EliscriptSymbol]:[
  provider.list().constructor,provider.vector().constructor,provider.hashMap().constructor,provider.hashSet().constructor,provider.queue().constructor,
  provider.keyword('managed-boundary-brand').constructor,provider.symbol('managed-boundary-brand').constructor,
 ];
 const names=['list','vector','map','set','queue','keyword','symbol'];
 const readView=canonical?readPersistentVectorView:provider.readPersistentVectorView;
 const makeView=canonical?subvec:provider.subvec;
 if(typeof readView!=='function'||typeof makeView!=='function')throw new TypeError('literal host provider requires its actual vector view reader and subvec factory');
 const isReduced=canonical?isReducedValue:provider.isReducedValue;
 const makeReduced=canonical?reducedValue:provider.reducedValue;
 const unwrapReduced=canonical?unreducedValue:provider.unreducedValue;
 if([isReduced,makeReduced,unwrapReduced].some(value=>typeof value!=='function'))throw new TypeError('literal host provider requires its actual Reduced protocol functions');
 const recordTypePredicate=provider.isRecordType??(canonical?isRecordType:undefined);
 const recordPredicate=provider.isRecord??(canonical?isRecord:undefined);
 const recordState=provider.readRecordState??(canonical?readRecordState:undefined);
 const makeRecordType=provider.materializeRecordType??(canonical?materializeRecordType:undefined);
 const readMetadata=provider.meta??(canonical?meta:undefined);
 const attachMetadata=provider.withMeta??(canonical?withMeta:undefined);
 const typeState=provider.readTypeState??(canonical?readTypeState:undefined);
 const typeValueState=provider.readTypeValueState??(canonical?readTypeValueState:undefined);
 const reifiedState=provider.readReifiedState??(canonical?readReifiedState:undefined);
 const makeType=provider.materializeTypeDefinition??(canonical?materializeTypeDefinition:undefined);
 const makeTypeValue=provider.materializeTypeValue??(canonical?materializeTypeValue:undefined);
 const makeReified=provider.reifyProtocols??(canonical?reifyProtocols:undefined);
 const protocolPredicate=provider.isProtocol??(canonical?isProtocol:undefined);
 const protocolDefinitionOf=provider.protocolDefinition??(canonical?protocolDefinition:undefined);
 const makeProtocol=provider.materializeProtocolFromDefinition??(canonical?materializeProtocolFromDefinition:undefined);
 const protocolFallback=provider.extendProtocolDefault??(canonical?extendProtocolDefault:undefined);
 const protocolOperationsOwner=provider.readProtocolOperationsOwner??(canonical?readProtocolOperationsOwner:undefined);
 const protocolMethodOwner=provider.readProtocolMethodOwner??(canonical?readProtocolMethodOwner:undefined);
 const regexState=provider.readRegexState??(canonical?readRegexState:undefined);
 const makeRegex=provider.compileRegex??(canonical?compileRegex:undefined);
 const sortedMapState=provider.readSortedMapState??(canonical?readSortedMapState:undefined);
 const sortedSetState=provider.readSortedSetState??(canonical?readSortedSetState:undefined);
 const makeSortedMap=provider.materializeSortedMap??(canonical?materializeSortedMap:undefined);
 const makeSortedSet=provider.materializeSortedSet??(canonical?materializeSortedSet:undefined);
 const defaultComparisonPredicate=provider.isDefaultSortedComparator??(canonical?isDefaultSortedComparator:undefined);
 const defaultComparison=provider.defaultSortedComparator??(canonical?defaultSortedComparator:undefined);
 const protocolNamespaces={...(canonical?canonicalProtocolNamespaces:{}),...provider.protocolNamespaces};
 function standardProtocol(role){
  if(typeof role!=='string')return undefined;
  const separator=role.indexOf('.'),family=role.slice(0,separator),field=role.slice(separator+1);
  if(separator<0||!Object.hasOwn(protocolRoleFields,family)||!protocolRoleFields[family].includes(field))
   throw new TypeError('unknown canonical protocol role');
  const protocol=protocolNamespaces[family]?.[field];
  if(protocol===undefined||typeof protocolPredicate!=='function'||!protocolPredicate(protocol))
   throw new TypeError('literal host provider requires its actual canonical protocol namespace: '+family);
  return protocol;
 }
 function standardProtocolReference(value){
  for(const [family,fields]of Object.entries(protocolRoleFields))for(const field of fields){
   const protocol=protocolNamespaces[family]?.[field];if(protocol===undefined)continue;
   const role=family+'.'+field;
   if(value===protocol)return {role,member:'protocol'};
   const operations=protocol.operations;
   if(value===operations)return {role,member:'operations'};
   for(const operation of Object.keys(operations)){
    const method=operations[operation];
    if(value===method)return {role,member:'method',operation};
    if(value===method.slot)return {role,member:'slot',operation};
   }
  }
 }
 function sortedValues(root,set){
  const stack=[],values=[];let current=root;
  while(current!==null||stack.length!==0){
   while(current!==null){stack.push(current);current=current.left;}
   current=stack.pop();values.push(set?current.key:Object.freeze([current.key,current.value]));current=current.right;
  }
  return values;
 }
 function metadataOf(value){
  if(typeof readMetadata==='function')return readMetadata(value);
  throw new TypeError('literal host provider requires its actual metadata protocol reader');
 }
 function metadataWith(value,metadata){
  if(typeof attachMetadata==='function')return attachMetadata(value,metadata);
  throw new TypeError('literal host provider requires its actual metadata protocol writer');
 }
 function kind(value){
  if(value===null||(typeof value!=='object'&&typeof value!=='function'))return null;
  if(typeof defaultComparisonPredicate==='function'&&defaultComparisonPredicate(value))return 'sorted-default-comparator';
  if(typeof sortedMapState==='function'&&sortedMapState(value)!==undefined)return 'sorted-map';
  if(typeof sortedSetState==='function'&&sortedSetState(value)!==undefined)return 'sorted-set';
  if(typeof regexState==='function'&&regexState(value)!==undefined)return 'regex-pattern';
  if(typeof protocolPredicate==='function'&&protocolPredicate(value))return 'protocol';
  if(typeof protocolOperationsOwner==='function'&&protocolOperationsOwner(value)!==undefined)return 'protocol-operations';
  if(typeof protocolMethodOwner==='function'&&protocolMethodOwner(value)!==undefined)return 'protocol-method';
  if(typeof typeState==='function'&&typeState(value)!==undefined)return 'type-definition';
  if(typeof typeValueState==='function'&&typeValueState(value)!==undefined)return 'type-value';
  if(typeof reifiedState==='function'&&reifiedState(value)!==undefined)return 'reified';
  if(typeof recordTypePredicate==='function'&&recordTypePredicate(value))return 'record-type';
  if(typeof recordState==='function'&&recordState(value)!==undefined&&typeof recordPredicate==='function'&&recordPredicate(value))return 'record';
  if(isReduced(value))return 'reduced';
  if(readView(value)!==undefined)return 'subvector';
  for(let index=0;index<constructors.length;index++)if(value instanceof constructors[index])return names[index];
  return null;
 }
 return Object.freeze({
  kind,
  standardProtocol,standardProtocolReference,
  standardProtocolRoles(){
   const roles=[];
   for(const [family,fields]of Object.entries(protocolRoleFields))for(const field of fields)
    if(protocolNamespaces[family]?.[field]!==undefined)roles.push(family+'.'+field);
   return roles;
  },
  read(value){
   const type=kind(value);if(type===null)throw new TypeError('value is not owned by the literal host provider');
   if(type==='sorted-default-comparator')return {kind:type};
   if(type==='sorted-map'){
    const state=sortedMapState(value);
    return {kind:type,entries:sortedValues(state.root,false),comparison:state.comparison,metadata:state.metadata};
   }
   if(type==='sorted-set'){
    const state=sortedSetState(value),map=sortedMapState(state.map);
    if(map===undefined)throw new TypeError('sorted set has no owned sorted map state');
    return {kind:type,values:sortedValues(map.root,true),comparison:map.comparison,metadata:state.metadata};
   }
   if(type==='regex-pattern'){
    const state=regexState(value);
    return {kind:type,source:state.source,flags:state.flags};
   }
   if(type==='protocol')return {kind:type,definition:protocolDefinitionOf(value),operations:value.operations};
   if(type==='protocol-operations')return {kind:type,protocol:protocolOperationsOwner(value)};
   if(type==='protocol-method'){
    const owner=protocolMethodOwner(value);
    return {kind:type,protocol:owner.protocol,operation:owner.operation};
   }
   if(type==='type-definition'){
    const state=typeState(value);
    return {kind:type,name:state.name,fields:state.fields,protocolPlans:state.protocolPlans};
   }
   if(type==='type-value'){
    const state=typeValueState(value);
    return {kind:type,type:state.type,values:state.values};
   }
   if(type==='reified')return {kind:type,protocolPlans:reifiedState(value).protocolPlans};
   if(type==='record-type')return {kind:type,name:value.recordName,fields:value.recordFields};
   if(type==='record'){
    const state=recordState(value);
    return {kind:type,type:value.constructor,map:state.map,metadata:state.metadata};
   }
   if(type==='reduced')return {kind:type,value:unwrapReduced(value)};
   if(type==='subvector'){
    const state=readView(value);
    return {kind:type,source:state.vector,start:state.start,end:state.end,metadata:state.metadata};
   }
   const metadata=metadataOf(value);
   return {kind:type,values:type==='keyword'||type==='symbol'?[value.namespace,value.name]:Array.from(value),metadata};
  },
  create(type,values,metadata=null,view){
   if(type==='sorted-default-comparator'){
    if(typeof defaultComparison!=='function')throw new TypeError('literal host provider requires its actual default sorted comparator');
    return defaultComparison();
   }
   if(type==='sorted-map'||type==='sorted-set'){
    const materialize=type==='sorted-map'?makeSortedMap:makeSortedSet;
    if(typeof materialize!=='function'||!view)throw new TypeError('literal host provider requires its actual sorted materializer');
    return materialize(values,view.comparison,metadata);
   }
   if(type==='regex-pattern'){
    if(typeof makeRegex!=='function'||!view)throw new TypeError('literal host provider requires its actual regex compiler');
    return makeRegex(view.source,view.flags);
   }
   if(type==='protocol'){
    if(view?.role!==undefined){
     const protocol=standardProtocol(view.role),names=Object.keys(protocol.operations);
     if(names.length!==view.definition.operations.length||names.some((name,index)=>name!==view.definition.operations[index]))
      throw new TypeError('canonical protocol operation contract mismatch');
     return protocol;
    }
    if(typeof makeProtocol!=='function'||typeof protocolFallback!=='function'||!view)throw new TypeError('literal host provider requires its actual protocol materializer');
    const protocol=makeProtocol(view.definition,view.slots);
    // Unknown target extensions remain target dispatch. This default is only
    // the host boundary, never a replacement compiler/runtime implementation.
    protocolFallback(protocol,view.implementations);
    return protocol;
   }
   if(type==='type-definition'){
    if(typeof makeType!=='function'||!view)throw new TypeError('literal host provider requires its actual type constructor');
    return makeType(view.name,view.fields,view.protocolPlans);
   }
   if(type==='type-value'){
    if(typeof typeState!=='function'||!view||typeState(view.type)===undefined||typeof makeTypeValue!=='function'||!Array.isArray(values))throw new TypeError('invalid persistent type value');
    return makeTypeValue(view.type,values);
   }
   if(type==='reified'){
    if(typeof makeReified!=='function'||!view)throw new TypeError('literal host provider requires its actual reify constructor');
    return makeReified(view.protocolPlans);
   }
   if(type==='record-type'){
    if(typeof makeRecordType!=='function'||!view||typeof view.name!=='string'||!Array.isArray(view.fields))throw new TypeError('literal host provider requires its actual record type constructor');
    // Each transported constructor is constructed independently. Heap identity
    // caches, rather than its printable declaration, preserve later aliases.
    return makeRecordType(view.name,view.fields);
   }
   if(type==='record'){
    if(typeof recordTypePredicate!=='function'||!view||!recordTypePredicate(view.type))throw new TypeError('invalid persistent record type');
    let result=view.type.fromMap(view.map);
    if(metadata!==null)result=metadataWith(result,metadata);
    return result;
   }
   if(type==='reduced')return makeReduced(values);
   if(type==='subvector'){
    if(!view||!(view.source instanceof constructors[1]))throw new TypeError('invalid persistent vector view source');
    let result=makeView(view.source,view.start,view.end);
    if(metadata!==null)result=metadataWith(result,metadata);
    return result;
   }
   if(!names.includes(type)||!Array.isArray(values))throw new TypeError('invalid persistent literal boundary record');
   const index=names.indexOf(type);let result;
   if(index<5)result=constructors[index].from(values);
   else {
    if(values.length!==2)throw new TypeError('invalid persistent identifier boundary record');
    result=Reflect.apply(index===5?provider.keyword:provider.symbol,provider,values);
   }
   if(metadata!==null){
    result=metadataWith(result,metadata);
   }
   return result;
  },
 });
}

// A stable host identity for an object whose properties live in another heap.
// Reflection mirrors only the descriptors required by Proxy invariants; values
// and mutations always travel through the owning runtime.
export function createManagedSourceView({target,operations}) {
 if((typeof target!=='object'||target===null)&&typeof target!=='function')throw new TypeError('source view requires an object target');
 const descriptor=key=>operations.descriptor(key);
 function mirror(key,entry){
  const existing=Reflect.getOwnPropertyDescriptor(target,key);
  if(entry===undefined){if(existing?.configurable)Reflect.deleteProperty(target,key);return;}
  if(!Reflect.defineProperty(target,key,entry))throw new TypeError('cannot mirror managed property');
 }
 function synchronize({all=false}={}){
  const keys=operations.keys(),seen=new Set(keys),extensible=operations.extensible();
  for(const key of Reflect.ownKeys(target))if(!seen.has(key))mirror(key,undefined);
  for(const key of keys){const entry=descriptor(key);if(entry!==undefined&&(all||!extensible||!entry.configurable))mirror(key,entry);}
  if(!extensible){
   if(!Reflect.setPrototypeOf(target,operations.prototype()))throw new TypeError('cannot mirror managed prototype');
   Reflect.preventExtensions(target);
  }
  return keys;
 }
 let proxy;
 const handler={
  get(_target,key,receiver){
   const entry=descriptor(key);
   if(entry&&!entry.configurable)mirror(key,entry);
   return operations.get(key,receiver);
  },
  set(_target,key,value,receiver){
   const changed=operations.set(key,value,receiver);
   if(changed){const entry=descriptor(key);if(entry&&!entry.configurable||!Reflect.isExtensible(target))mirror(key,entry);}
   return changed;
  },
  has(_target,key){return operations.has(key);},
  ownKeys(){return synchronize();},
  getOwnPropertyDescriptor(_target,key){
   const entry=descriptor(key);
   if(entry&&!entry.configurable||!Reflect.isExtensible(target))mirror(key,entry);
   return entry;
  },
  defineProperty(_target,key,entry){
   if(!operations.define(key,entry))return false;
   mirror(key,descriptor(key));return true;
  },
  deleteProperty(_target,key){
   if(!operations.delete(key))return false;
   mirror(key,undefined);return true;
  },
  getPrototypeOf(){const prototype=operations.prototype();if(!Reflect.isExtensible(target))Reflect.setPrototypeOf(target,prototype);return prototype;},
  setPrototypeOf(_target,prototype){
   if(!operations.setPrototype(prototype))return false;
   return Reflect.setPrototypeOf(target,prototype);
  },
  isExtensible(){synchronize();return Reflect.isExtensible(target);},
  preventExtensions(){
   if(!operations.preventExtensions())return false;
   synchronize({all:true});return !Reflect.isExtensible(target);
  },
 };
 if(typeof target==='function'){
  handler.apply=(_target,receiver,args)=>operations.apply(receiver,args);
  if(operations.construct)handler.construct=(_target,args,newTarget)=>operations.construct(args,newTarget);
 }
 proxy=new Proxy(target,handler);
 return Object.freeze({value:proxy,refresh(){synchronize({all:true});return proxy;}});
}
