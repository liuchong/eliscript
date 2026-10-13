// Bulk host boundary for the .eli managed heap. GC, value operations and allocation
// execute inside WASM, with zero imports. Handles own explicit roots until release.
function fail(code) {
 const error=new Error(code===1?'invalid managed value handle':code===2?'managed capacity exhausted':code===4?'invalid UTF-8 input':code===5?'invalid UTF-16 surrogate':code===6?'managed string sealing error':'managed argument or bounds error');
 error.eliscriptDiagnostic={format:'eliscript-diagnostic',version:1,code:`ELI-RT${String(code).padStart(4,'0')}`,severity:'error',phase:'runtime',message:error.message};throw error;
}
function word(x,max=0xffffffff) {if(typeof x!=='number'||!Number.isInteger(x)||x<0||x>max||Object.is(x,-0))fail(3);return x;}
function flag(value) {if(typeof value!=='boolean')fail(3);return Number(value);}
export function instantiateManagedRuntime(bytes,{maxSlots=1024,initialBytes=65536,maxBytes=16777216}={}) {
 const module=new WebAssembly.Module(bytes);if(WebAssembly.Module.imports(module).length)throw Error('managed runtime requires zero imports');
 const e=new WebAssembly.Instance(module).exports;if(!(e.memory instanceof WebAssembly.Memory))throw Error('managed runtime requires owned memory');
 const handles=new WeakMap(),frames=new WeakMap(),view=()=>new DataView(e.memory.buffer);
 const call=(name,...args)=>{const result=e[name](...args)>>>0;const code=e['last-error']();if(code)fail(code);return result;};
 const heap=call('heap-new',word(maxSlots),word(initialBytes),word(maxBytes));
 function id(value) {
  if(value===null)return 0;if(value===false)return 1;if(value===true)return 2;if(value===undefined)return 3;
  const entry=handles.get(value);if(!entry)fail(typeof value==='number'?3:1);
  call('value-kind',heap,entry.id);return entry.id;
 }
 function wrap(value,owned=false) {
  if(value<=3)return [null,false,true,undefined][value];
  const kind=call('value-kind',heap,value),handle=Object.freeze({kind});
  if(!owned)call('heap-pin',heap,value);handles.set(handle,{id:value,roots:1});return handle;
 }
 function frameId(token) {const entry=frames.get(token);if(!entry)fail(1);return entry.id;}
 function data(value,kind) {const v=id(value);return {v,length:call('value-length',heap,v),offset:call('value-data',heap,v,kind)};}
 function refs(input,kind) {
  if(!Array.isArray(input))fail(3);const borrowed=[];
  try {
   // Protect operands before later getters or result allocation can collect them.
   const values=Array.from(input,x=>{const v=id(x);call('heap-pin',heap,v);borrowed.push(v);return v;});
   const value=call('value-refs',heap,kind,word(values.length)),offset=call('value-data',heap,value,kind),target=view();
   values.forEach((v,i)=>target.setUint32(offset+i*4,v,true));return wrap(value);
  } finally {for(const value of borrowed)call('heap-release',heap,value);}
 }
 return Object.freeze({
  number(input) {
   if(typeof input!=='number')fail(3);const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,input,true);
   return wrap(call('value-number',heap,bits.getUint32(0,true),bits.getUint32(4,true)));
  },
  readNumber(value) {return view().getFloat64(data(value,4).offset,true);},
  binary(a,b,operation) {return wrap(call('value-number-binary',heap,id(a),id(b),word(operation,3)));},
  negate(value) {return wrap(call('value-number-negate',heap,id(value)));},
  compare(a,b,operation) {return !!call('value-number-compare',heap,id(a),id(b),word(operation,5));},
  truth(value) {return !!call('value-truth',heap,id(value));},
  keyEqual(left,right) {return !!call('value-key-equal',heap,id(left),id(right));},
  keyHash(value) {return call('value-key-hash',heap,id(value));},
  string(input) {
   if(typeof input!=='string')fail(3);const value=call('value-string',heap,word(input.length)),offset=call('value-data',heap,value,5),target=view();
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
   if(!Array.isArray(input)&&!(input instanceof Uint8Array))fail(3);
   const values=Array.from(input,x=>word(x,255)),value=call('value-bytes',heap,word(values.length)),offset=call('value-data',heap,value,6);
   new Uint8Array(e.memory.buffer,offset,values.length).set(values);return wrap(value);
  },
  readBytes(value) {const {length,offset}=data(value,6);return new Uint8Array(e.memory.buffer,offset,length).slice();},
  array(input=[]) {return refs(input,7);},record(input=[]) {return refs(input,8);},
  get(value,index) {return wrap(call('value-get',heap,id(value),word(index)));},
  set(value,index,child) {call('value-set',heap,id(value),word(index),id(child));},
  length(value) {return call('value-length',heap,id(value));},
  resize(value,length) {const v=id(value),kind=call('value-kind',heap,v);if(kind!==6&&kind!==7)fail(1);
   call(kind===6?'value-bytes-resize':'value-refs-resize',heap,v,word(length));},
  pin(value) {const v=id(value);call('heap-pin',heap,v);if(v>3)handles.get(value).roots++;},
  release(value) {
   if(value===null||typeof value==='boolean'||value===undefined)return;
   const entry=handles.get(value);if(!entry)fail(1);if(!entry.roots)fail(3);
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
}
