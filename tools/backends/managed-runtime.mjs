import {createManagedHostRuntime,failManagedRuntime,validateManagedRuntimeOptions} from './managed-host.mjs';

// The WASM loader owns only module validation and the binary descriptor envelope.
// Handles, roots, module state and source exceptions share the native boundary.
export function instantiateManagedRuntime(bytes,options={}) {
 validateManagedRuntimeOptions(options);
 const module=new WebAssembly.Module(bytes);if(WebAssembly.Module.imports(module).length)throw Error('managed runtime requires zero imports');
 const e=new WebAssembly.Instance(module).exports;if(!(e.memory instanceof WebAssembly.Memory))throw Error('managed runtime requires owned memory');
 const sections=WebAssembly.Module.customSections(module,'eliscript-managed-control');let descriptor=null;
 if(sections.length>1)failManagedRuntime(3);
 if(sections.length) {
  const payload=new Uint8Array(sections[0]);let length=0,index=0,shift=0,ended=false;
  while(index<payload.length&&index<5){const byte=payload[index++];if(index===5&&(byte&0xf0))failManagedRuntime(3);length+=(byte&127)*2**shift;if(!(byte&128)){ended=true;break;}shift+=7;}
  if(!ended||index+length!==payload.length)failManagedRuntime(3);
  try{descriptor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload.subarray(index)));}catch{failManagedRuntime(3);}
  if(descriptor===null)failManagedRuntime(3);
 }
 const memory={
  view:()=>new DataView(e.memory.buffer),
  writeBytes:(offset,bytes)=>new Uint8Array(e.memory.buffer,offset,bytes.length).set(bytes),
  readBytes:(offset,length)=>new Uint8Array(e.memory.buffer,offset,length).slice(),
 };
 return createManagedHostRuntime(e,descriptor,memory,options);
}
