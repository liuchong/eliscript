import {hostUnicodeCaseVersion} from '../runtime/unicode-case-profiles.mjs';
// Bulk host boundary for the .eli managed heap. GC, value operations and allocation
// execute in the compiled runtime. Handles own explicit roots until release.
export function failManagedRuntime(code) {
 const message=code===1?'invalid managed value handle':code===2?'managed capacity exhausted':code===4?'invalid UTF-8 input':code===5?'invalid UTF-16 surrogate':code===6?'managed string sealing error':code===8?'uninitialized managed module binding':code===12?'uninitialized managed lexical binding':code===9?'cyclic array text conversion':code===10?'invalid Number.toString radix':'managed argument or bounds error';
 const error=(code===8||code===12)?new ReferenceError(message):code===9?new TypeError(message):code===10?new RangeError(message):new Error(message);
 error.eliscriptDiagnostic={format:'eliscript-diagnostic',version:1,code:`ELI-RT${String(code).padStart(4,'0')}`,severity:'error',phase:'runtime',message:error.message};throw error;
}
function word(x,max=0xffffffff) {if(typeof x!=='number'||!Number.isInteger(x)||x<0||x>max||Object.is(x,-0))failManagedRuntime(3);return x;}
function flag(value) {if(typeof value!=='boolean')failManagedRuntime(3);return Number(value);}
export function validateManagedRuntimeOptions({initializeModule:initialize=true,unicodeVersion='host'}={}) {
 if(typeof initialize!=='boolean'||!['host',15.1,16,17].includes(unicodeVersion))failManagedRuntime(3);
}
export function createManagedHostRuntime(e,descriptor,memory,{maxSlots=1024,initialBytes=65536,maxBytes=16777216,initializeModule:initialize=true,unicodeVersion='host'}={},lifecycle={}) {
 validateManagedRuntimeOptions({initializeModule:initialize,unicodeVersion});
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
    // Legacy fixed-arity readers reject null instead of miscalling this ABI.
    if(item.arity!==null||!Array.isArray(item.parameterKinds)||item.parameterKinds.length===0||item.parameterKinds.length>65535||!item.parameterKinds.some(k=>k!=='required')||e[wireName].length!==4)failManagedRuntime(3);
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
    const entry=entries.get(item?.name);if(!entry||moduleExports.has(item.name)||!Number.isInteger(item.index)||item.index<0||item.name.startsWith('__eliscript_'))failManagedRuntime(3);
    if(item.kind===0){if(!entry.binding||item.index!==entry.index||item.index>=moduleInfo.bindingCount)failManagedRuntime(3);}
    else if(item.kind===1){if(entry.binding||item.index>=moduleInfo.functionCount)failManagedRuntime(3);}else failManagedRuntime(3);
    moduleExports.set(item.name,item);
   }
  }
 }
 if(!moduleInfo&&['init','get','status','close','abort'].some(name=>Object.hasOwn(e,'__eliscript_module_'+name)))failManagedRuntime(3);
 const handles=new WeakMap(),frames=new WeakMap(),view=()=>memory.view();
 let exceptionHeap=0;
 const call=(name,...args)=>{const result=e[name](...args)>>>0;const code=e['last-error']();
  if(code===11&&exceptionHeap&&typeof e['value-exception-take']==='function'){
   const value=e['value-exception-take'](exceptionHeap)>>>0,failed=e['last-error']();if(failed)failManagedRuntime(failed);throw wrap(value);
  }
  if(code)failManagedRuntime(code);return result;};
 const caseConfigurable=typeof e['runtime-case-version']==='function';
 const caseVersion=caseConfigurable?(unicodeVersion==='host'?hostUnicodeCaseVersion():unicodeVersion===15.1?151:unicodeVersion*10):170;
 if(caseConfigurable)call('runtime-case-version',caseVersion);
 else if(unicodeVersion!=='host')failManagedRuntime(3);
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
  const target=call('frame-current',heap);
  try{return call(name,heap,...args);}catch(error){call('frame-unwind',heap,target);throw error;}
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
  if(!moduleInfo)failManagedRuntime(3);const status=call(moduleInfo.status,heap),target=call('frame-current',heap);
  try{call(moduleInfo.initialize,heap);return true;}
  catch(error){
   call('frame-unwind',heap,target);
   if(status===0&&call(moduleInfo.status,heap)===1){const match=/^ELI-RT([0-9]+)$/.exec(error?.eliscriptDiagnostic?.code??'');e[moduleInfo.abort](heap,match?Number(match[1]):3);}
   throw error;
  }
 }
 // A compiled-runtime cleanup boundary shared by module close and native
 // transport disposal. Realm-root cleanup can be added here independently of
 // transport ownership; externally held values keep their own heap roots.
 lifecycle.dispose=()=>{if(moduleInfo)call(moduleInfo.close,heap);else if(typeof e['value-standard-prototypes-close']==='function')call('value-standard-prototypes-close',heap);};
 const api=Object.freeze({
  unicodeVersion:caseVersion===151?15.1:caseVersion/10,
  initializeModule:initializeModuleInstance,
  getExport(name){if(!moduleInfo||typeof name!=='string'||!moduleExports.has(name))failManagedRuntime(3);const item=moduleExports.get(name);return wrap(call(moduleInfo.get,heap,item.kind,item.index));},
  closeModule(){if(!moduleInfo&&typeof e['value-standard-prototypes-close']!=='function')failManagedRuntime(3);lifecycle.dispose();return moduleInfo!==null;},
  invoke(name,args=[]) {
   if(typeof name!=='string'||!entries.has(name)||!Array.isArray(args))failManagedRuntime(3);
   const entry=entries.get(name);if(!entry.uniform&&args.length!==entry.arity)failManagedRuntime(3);
   const borrowed=[];let entered=false,target=0,argumentsList=0,callee=0;
   try {
    if(entry.binding){
     // Resolve and borrow the live callee before argument getters can replace it.
     const item=moduleExports.get(name);callee=call(moduleInfo.get,heap,item.kind,item.index);call('heap-pin',heap,callee);borrowed.push(callee);
    }
    const values=Array.from(args,value=>{const v=id(value);call('heap-pin',heap,v);borrowed.push(v);return v;});
    target=call('frame-current',heap);entered=true;
    if(entry.uniform){
     argumentsList=call('value-refs',heap,7,word(values.length));call('heap-pin',heap,argumentsList);
     const offset=call('value-data',heap,argumentsList,7),targetView=view();
     values.forEach((v,i)=>targetView.setUint32(offset+i*4,v,true));
     return wrap(call(entry.wireName,heap,entry.binding?callee:0,argumentsList,values.length));
    }
    return wrap(call(entry.wireName,heap,...values));
   } catch(error){if(entered)call('frame-unwind',heap,target);if(typeof e['value-exception-clear']==='function')call('value-exception-clear',heap);throw error;}
   finally{if(argumentsList)call('heap-release',heap,argumentsList);for(const value of borrowed)call('heap-release',heap,value);}
  },
  number(input) {
   if(typeof input!=='number')failManagedRuntime(3);const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,input,true);
   return wrap(call('value-number',heap,bits.getUint32(0,true),bits.getUint32(4,true)));
  },
  readNumber(value) {return view().getFloat64(data(value,4).offset,true);},
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
   if(typeof input!=='string')failManagedRuntime(3);const value=call('value-string',heap,word(input.length)),offset=call('value-data',heap,value,5),target=view();
   for(let i=0;i<input.length;i++)target.setUint16(offset+i*2,input.charCodeAt(i),true);
   call('value-seal',heap,value);return wrap(value);
  },
  readString(value) {
   const {length,offset}=data(value,5),source=view(),parts=[];
   for(let start=0;start<length;start+=8192) {const units=[];for(let i=start;i<Math.min(start+8192,length);i++)units.push(source.getUint16(offset+i*2,true));parts.push(String.fromCharCode(...units));}
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
  objectGet(value,key) {return wrap(objectCall('value-object-get',id(value),id(key)));},
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
  collect() {return call('heap-collect',heap);},live() {return call('heap-live',heap);},
  stats() {return Object.freeze({usedBytes:call('heap-used',heap),capacityBytes:call('heap-capacity',heap),liveValues:call('heap-live',heap),frameDepth:call('frame-depth',heap),collections:call('heap-collections',heap)});},
 });
 if(moduleInfo&&initialize)initializeModuleInstance();
 return api;
}
