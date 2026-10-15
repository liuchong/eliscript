// Owned, synchronous mapping for the experimental arm64-macos memory-u32 ABI.
// Keep the backing store and context private: exposing either ArrayBuffer would
// allow a transfer/detach to invalidate native pointers during a later call.
export async function openNativeMemory(path, signatures, {initialPages=1,maximumPages=initialPages}={}) {
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('native memory requires arm64-macos');
  for(const pages of [initialPages,maximumPages])if(!Number.isInteger(pages)||pages<0||pages>65536)throw new RangeError('invalid memory page count');
  if(initialPages>maximumPages)throw new RangeError('initial memory exceeds maximum');
  const {dlopen,ptr}=await import('bun:ffi');
  const entries=Object.entries(signatures);
  for(const [name,arity] of entries)if(!name||!Number.isInteger(arity)||arity<0)throw new TypeError('invalid native memory signature');
  const arities=new Map(entries);
  let bytes=new Uint8Array(Math.max(1,maximumPages*65536));
  let context=new Uint8Array(32),view=new DataView(context.buffer);
  view.setBigUint64(0,BigInt(ptr(bytes)),true);
  view.setBigUint64(8,BigInt(initialPages*65536),true);
  view.setBigUint64(16,BigInt(maximumPages*65536),true);
  const library=dlopen(path,Object.fromEntries(entries.map(([name,arity])=>[name,{args:['ptr',...Array(arity).fill('u32')],returns:'u32'}])));
  let closed=false;
  const active=()=>{if(closed)throw new Error('native memory is closed');};
  const size=()=>Number(view.getBigUint64(8,true));
  const range=(offset,length)=>{active();if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>size())throw new RangeError('memory access out of bounds');};
  return {
    get byteLength(){active();return size();},
    invoke(name,...args){
      active();if(!arities.has(name))throw new TypeError('unknown native memory export');
      if(args.length!==arities.get(name))throw new TypeError('native memory argument count mismatch');
      for(const value of args)if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new RangeError('memory32 arguments must be u32');
      view.setUint32(24,0,true);
      const result=library.symbols[name](ptr(context),...args)>>>0;
      const error=view.getUint32(24,true);
      if(error)throw new WebAssembly.RuntimeError(error===1?'memory access out of bounds':error===2?'integer divide by zero':'native memory trap');
      return result;
    },
    read(offset,length){range(offset,length);return bytes.slice(offset,offset+length);},
    write(input,offset=0){
      if(!(input instanceof Uint8Array))throw new TypeError('memory write requires Uint8Array');
      range(offset,input.byteLength);bytes.set(input,offset);
    },
    close(){if(!closed){closed=true;library.close();bytes=null;context=null;view=null;}},
  };
}
