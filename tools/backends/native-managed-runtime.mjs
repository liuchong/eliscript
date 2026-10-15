import {openNativeMemory} from './native-memory.mjs';
import {createManagedHostRuntime,failManagedRuntime,validateManagedRuntimeOptions} from './managed-host.mjs';

// The lowering record is the compiler's existing {typed, descriptor} result.
// Function arities configure the native C ABI; its descriptor is checked by the
// same boundary as WASM. Load only the library emitted from this lowering record.
export async function instantiateNativeManagedRuntime(path,lowered,options={}) {
 validateManagedRuntimeOptions(options);
 if(!lowered||lowered.typed?.abi!=='memory-u32'||!Array.isArray(lowered.typed.functions)||!Array.isArray(lowered.typed.exports)||!lowered.descriptor)failManagedRuntime(3);
 const {typed,descriptor}=structuredClone(lowered),functions=new Map(),arities=Object.create(null);
 for(const fn of typed.functions){if(typeof fn.name!=='string'||functions.has(fn.name)||!Number.isInteger(fn.arity)||fn.arity<0||fn.arity>65535)failManagedRuntime(3);functions.set(fn.name,fn.arity);}
 for(const name of typed.exports){if(!functions.has(name)||Object.hasOwn(arities,name))failManagedRuntime(3);arities[name]=functions.get(name);}
 if(typed.aliases!==undefined&&!Array.isArray(typed.aliases))failManagedRuntime(3);
 for(const alias of typed.aliases??[]){if(typeof alias.name!=='string'||!functions.has(alias.function)||Object.hasOwn(arities,alias.name))failManagedRuntime(3);arities[alias.name]=functions.get(alias.function);}
 for(const [name,arity] of [['last-error',0],['heap-new',3],['value-kind',2],['heap-pin',2],['heap-release',2],['frame-current',1],['frame-unwind',2]])if(arities[name]!==arity)failManagedRuntime(3);
 const lifecycle={};
 const owned=await openNativeMemory(path,arities,{initialPages:options.initialPages??1,maximumPages:options.maximumPages??256});
 try {
  const e=Object.create(null);
  for(const [name,arity] of Object.entries(arities)){
   const fn=(...args)=>owned.invoke(name,...args);Object.defineProperty(fn,'length',{value:arity});e[name]=fn;
  }
  const memory={
   view:()=>({
    getFloat64:(offset,littleEndian)=>new DataView(owned.read(offset,8).buffer).getFloat64(0,littleEndian),
    getUint16:(offset,littleEndian)=>new DataView(owned.read(offset,2).buffer).getUint16(0,littleEndian),
    setUint16(offset,value,littleEndian){const bytes=new Uint8Array(2);new DataView(bytes.buffer).setUint16(0,value,littleEndian);owned.write(bytes,offset);},
    setUint32(offset,value,littleEndian){const bytes=new Uint8Array(4);new DataView(bytes.buffer).setUint32(0,value,littleEndian);owned.write(bytes,offset);},
   }),
   readBytes:(offset,length)=>owned.read(offset,length),
   writeBytes:(offset,bytes)=>owned.write(bytes,offset),
  };
  const api=createManagedHostRuntime(e,descriptor,memory,options,lifecycle);let closed=false;
  const methods=Object.fromEntries(Object.entries(api).map(([name,value])=>{
   if(typeof value!=='function')return [name,value];
   const guarded=(...args)=>{if(closed)throw Error('native managed runtime is closed');return value(...args);};
   Object.defineProperties(guarded,{length:{value:value.length},name:{value:value.name}});return [name,guarded];
  }));
  methods.close=()=>{if(!closed){closed=true;try{lifecycle.dispose?.();}finally{owned.close();}}};
  return Object.freeze(methods);
 }catch(error){try{lifecycle.dispose?.();}catch{}finally{owned.close();}throw error;}
}
