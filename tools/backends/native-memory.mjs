// Synchronous memory-u32 transport. The context and the backing memory stay
// private so a caller cannot transfer/detach storage underneath native code.
import {createCompilerDebugMap} from './compiler-debug.mjs';
function nativePlatform(target) {
  const actual = process.platform === 'darwin' ? 'arm64-macos'
    : process.platform === 'linux' ? 'arm64-linux' : null;
  if (process.arch !== 'arm64' || actual === null || (target !== undefined && target !== actual)) {
    throw new Error('native memory requires the matching arm64-macos or arm64-linux host');
  }
  return actual;
}

async function linuxMapping(ffi, maximumBytes, libcLibrary) {
  const signatures = {
    mmap: {args: ['ptr', 'u64', 'i32', 'i32', 'i32', 'i64'], returns: 'ptr'},
    mprotect: {args: ['ptr', 'u64', 'i32'], returns: 'i32'},
    munmap: {args: ['ptr', 'u64'], returns: 'i32'},
    getpagesize: {args: [], returns: 'i32'},
  };
  let libc, failure;
  for (const name of libcLibrary ? [libcLibrary] : ['libc.so.6', 'libc.musl-aarch64.so.1']) {
    try {libc = ffi.dlopen(name, signatures); break;}
    catch (error) {failure = error;}
  }
  if (!libc) throw new Error('unable to load Linux virtual memory functions', {cause: failure});
  let mapping = 0, mappingBytes = 0, released = false;
  try {
    const page = libc.symbols.getpagesize();
    if (!Number.isSafeInteger(page) || page <= 0 || (page & (page - 1)) !== 0) throw new Error('invalid Linux memory page size');
    const usableBytes = Math.ceil(Math.max(1, maximumBytes) / page) * page;
    mappingBytes = usableBytes + 2 * page;
    // MAP_PRIVATE | MAP_ANONYMOUS, initially inaccessible, with one guard at
    // either end. The generated ABI enforces its current byte length itself.
    const address = libc.symbols.mmap(null, BigInt(mappingBytes), 0, 34, -1, 0n);
    if (!Number.isSafeInteger(address) || address <= 0) throw new Error('unable to reserve native linear memory');
    mapping = address;
    const base = mapping + page;
    if (libc.symbols.mprotect(base, BigInt(usableBytes), 3) !== 0) throw new Error('unable to enable native linear memory');
    const rangeView = (offset, length) => new Uint8Array(ffi.toArrayBuffer(base + offset, 0, length));
    return {
      base,
      read(offset, length) {
        if (length === 0) return new Uint8Array(0);
        return rangeView(offset, length).slice();
      },
      write(input, offset) {
        if (input.byteLength !== 0) rangeView(offset, input.byteLength).set(input);
      },
      close() {
        if (released) return;
        released = true;
        let failed = false, error;
        try {
          if (libc.symbols.munmap(mapping, BigInt(mappingBytes)) !== 0) throw new Error('unable to release native linear memory');
        } catch (failure) {failed = true; error = failure;}
        try {libc.close();} catch (failure) {if (!failed) {failed = true; error = failure;}}
        if (failed) throw error;
      },
    };
  } catch (error) {
    if (mapping) {try {libc.symbols.munmap(mapping, BigInt(mappingBytes));} catch {}}
    try {libc.close();} catch {}
    throw error;
  }
}

export async function openNativeMemory(path, signatures, {
  initialPages = 1, maximumPages = initialPages, nativeTarget, libcLibrary,
  hostCapabilities = [], hostCall,trapSites = [],debug,bunExecutable,
} = {}) {
  const platform = nativePlatform(nativeTarget);
  for (const pages of [initialPages, maximumPages]) {
    if (!Number.isInteger(pages) || pages < 0 || pages > 65536) throw new RangeError('invalid memory page count');
  }
  if (initialPages > maximumPages) throw new RangeError('initial memory exceeds maximum');
  if(!Array.isArray(hostCapabilities))throw new TypeError('native host capabilities must be an array');
  const capabilities=hostCapabilities.map(capability=>{
    if(!['console-log','console-log-capture','source-operation'].includes(capability?.name)||capability.module!=='eliscript.host'||capability.arity!==2||capability.abi!=='managed-host-call-v1')
      throw new TypeError('native host capability is not supported');
    return Object.freeze({...capability});
  });
  if(new Set(capabilities.map(capability=>capability.name)).size!==capabilities.length)throw new TypeError('duplicate native host capability');
  if(capabilities.length&&typeof hostCall!=='function')throw new TypeError('native artifact requires an explicit host capability dispatcher');
  if(!Array.isArray(trapSites))throw new TypeError('native trap sites must be an array');
  const preciseSites=new Map();
  for(const site of trapSites){
    if(!site||!Number.isSafeInteger(site.site)||site.site<1||site.site>0xffffffff||preciseSites.has(site.site)||
      !Number.isSafeInteger(site.address)||site.address<0||site.address%4!==0||site.offsetBase!=='code-section'||
      !Number.isSafeInteger(site.functionIndex)||site.functionIndex<0||site.returnAddress!==false||
      !Number.isInteger(site.code)||site.code<1||site.code>6)throw new TypeError('invalid precise native trap site');
    preciseSites.set(site.site,Object.freeze({...site}));
  }
  const sourceMap=debug===undefined||debug===false?null:createCompilerDebugMap(debug);
  const entries = Object.entries(signatures);
  for (const [name, arity] of entries) {
    if (!name || !Number.isInteger(arity) || arity < 0) throw new TypeError('invalid native memory signature');
  }
  const arities = new Map(entries);
  if(!process.versions.bun){
    const {openNodeNativeMemory}=await import('./native-node-memory.mjs');
    return openNodeNativeMemory(path,signatures,{initialPages,maximumPages,nativeTarget:platform,libcLibrary,
      hostCapabilities:capabilities,hostCall,trapSites,debug,...(bunExecutable===undefined?{}:{bunExecutable})});
  }
  const ffi = await import('bun:ffi');
  let bytes, mapping, context, view, library,callback,contextPointer,closed=false;
  const invocations=[];
  try {
    if (platform === 'arm64-linux') mapping = await linuxMapping(ffi, maximumPages * 65536, libcLibrary);
    else bytes = new Uint8Array(Math.max(1, maximumPages * 65536));
    context = new Uint8Array(capabilities.length?48:32); view = new DataView(context.buffer);
    contextPointer=ffi.ptr(context);
    view.setBigUint64(0, BigInt(mapping ? mapping.base : ffi.ptr(bytes)), true);
    view.setBigUint64(8, BigInt(initialPages * 65536), true);
    view.setBigUint64(16, BigInt(maximumPages * 65536), true);
    if(capabilities.length){
      callback=new ffi.JSCallback((actualContext,index,heap,argv)=>{
        const invocation=invocations.at(-1);
        try{
          if(actualContext!==contextPointer||!invocation||closed)throw new Error('native host callback is outside its active invocation');
          if(!Number.isInteger(index)||index<0||index>=capabilities.length)throw new TypeError('native host capability index is not declared');
          const result=hostCall(index,heap>>>0,argv>>>0);
          if(!Number.isInteger(result)||result<0||result>0xffffffff)throw new TypeError('native host capability returned an invalid managed word');
          return result;
        }catch(error){
          if(invocation&&!invocation.hasHostError){invocation.hasHostError=true;invocation.hostError=error;}
          view.setUint32(24,5,true);
          return 0;
        }
      },{args:['ptr','u32','u32','u32'],returns:'u32',threadsafe:false});
      if(callback.ptr===null)throw new Error('unable to create native host callback');
      view.setBigUint64(32,BigInt(callback.ptr),true);
    }
    library = ffi.dlopen(path, Object.fromEntries(entries.map(([name, arity]) => [name, {
      args: ['ptr', ...Array(arity).fill('u32')], returns: 'u32',
    }])));
  } catch (error) {
    try {library?.close();} catch {}
    try {callback?.close();} catch {}
    try {mapping?.close();} catch {}
    throw error;
  }
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    let failed=false,error;
    for(const action of[()=>library?.close(),()=>callback?.close(),()=>mapping?.close()]){
      try{action();}catch(failure){if(!failed){failed=true;error=failure;}}
    }
    bytes=null;mapping=null;context=null;view=null;library=null;callback=null;
    if(failed)throw error;
  };
  const active = () => {if (closed) throw new Error('native memory is closed');};
  const size = () => Number(view.getBigUint64(8, true));
  const range = (offset, length) => {
    active();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size()) {
      throw new RangeError('memory access out of bounds');
    }
  };
  return {
    get byteLength() {active(); return size();},
    invoke(name, ...args) {
      active();
      if (!arities.has(name)) throw new TypeError('unknown native memory export');
      if (args.length !== arities.get(name)) throw new TypeError('native memory argument count mismatch');
      for (const value of args) {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('memory32 arguments must be u32');
      }
      const invocation={hasHostError:false,hostError:undefined},previousTrap=view.getUint32(24,true),previousSite=view.getUint32(28,true);
      invocations.push(invocation);view.setUint32(24,0,true);view.setUint32(28,0,true);let failed=false;
      try{
        const result=library.symbols[name](contextPointer,...args)>>>0;
        if(invocation.hasHostError)throw invocation.hostError;
        const error=view.getUint32(24,true);
        if(error){
          const failure=new WebAssembly.RuntimeError(error===1?'memory access out of bounds'
          :error===2?'integer divide by zero':error===3?'indirect call index out of bounds'
          :error===4?'indirect call signature mismatch':error===5?'native host capability failed'
          :error===6?'native host capability is unavailable':'native memory trap');
          const site=preciseSites.get(view.getUint32(28,true));
          if(site&&site.code===error){
            const frames=Object.freeze([Object.freeze({address:site.address,offsetBase:'code-section',functionIndex:site.functionIndex,returnAddress:false})]);
            Object.defineProperty(failure,'eliscriptFrames',{value:frames,enumerable:true,configurable:true});
            // Capture against this artifact before an outer native callback
            // restores its context or any owner releases its linear memory.
            if(sourceMap)try{Object.defineProperty(failure,'eliscriptSourceFrames',{value:sourceMap.mapFrames(frames),enumerable:true,configurable:true});}catch{}
          }
          throw failure;
        }
        return result;
      }catch(error){failed=true;throw error;}
      finally{
        invocations.pop();view.setUint32(24,previousTrap,true);view.setUint32(28,previousSite,true);
        if(closed&&!invocations.length){try{dispose();}catch(error){if(!failed)throw error;}}
      }
    },
    read(offset, length) {
      range(offset, length);
      return mapping ? mapping.read(offset, length) : bytes.slice(offset, offset + length);
    },
    write(input, offset = 0) {
      if (!(input instanceof Uint8Array)) throw new TypeError('memory write requires Uint8Array');
      // Snapshot before borrowing an mmap view. Source getters/iterators may
      // reenter and close this instance; range checks run after that boundary.
      if (mapping) {
        const copy = new Uint8Array(input);
        range(offset, copy.byteLength); mapping.write(copy, offset);
      } else {range(offset, input.byteLength); bytes.set(input, offset);}
    },
    close() {
      if (closed) return;
      closed = true;
      // Keep the callback, library and mapping alive until an active native
      // frame has returned, including close requested by a console handler.
      if(!invocations.length)dispose();
    },
  };
}
