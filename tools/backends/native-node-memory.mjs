// Node keeps the original host program in its own process. A dedicated Bun
// process owns the native library and its linear memory; the wire carries only
// memory-u32 calls and byte blocks, never compiler or source-language work.
import {Worker} from 'node:worker_threads';
import {fromErrorData} from './compiler-worker.mjs';

function remoteFailure(record) {
  return fromErrorData(record);
}

const nativeMemoryBlockBytes = 65536;

export async function openNodeNativeMemory(path,signatures,options={}) {
  const {hostCall,bunExecutable=process.env.BUN??'bun',...configuration}=options;
  if(typeof bunExecutable!=='string'||!bunExecutable)throw new TypeError('native Node transport requires a Bun executable');
  const arities=new Map(Object.entries(signatures));
  let buffer=new SharedArrayBuffer(65536),control=new Int32Array(buffer,0,4),payload=new Uint8Array(buffer,16);
  let closed=false,depth=0,sequence=0,hostSequence=0,stopped=false,terminal;
  const hostFailures=new Map(),decoder=new TextDecoder(),worker=new Worker(new URL('./native-node-worker.mjs',import.meta.url),{
    workerData:{buffer,bunExecutable},
    // The source program's preload belongs to its Node host. Replaying that
    // preload in this transport worker would instantiate the project again.
    execArgv:[],env:{...process.env,NODE_OPTIONS:''},
  });
  try {
    await new Promise((resolve,reject)=>{
      const ready=message=>{if(message?.ready){cleanup();resolve();}else if(message?.startupFailure){cleanup();reject(remoteFailure(message.startupFailure));}};
      const fail=error=>{cleanup();reject(error);};
      const exit=code=>{cleanup();reject(new Error('native transport exited before initialization: '+code));};
      const cleanup=()=>{worker.off('message',ready);worker.off('error',fail);worker.off('exit',exit);};
      worker.on('message',ready);worker.once('error',fail);worker.once('exit',exit);
    });
  } catch(error) {await worker.terminate();throw error;}
  // Worker failures after initialization are also delivered through the shared
  // channel, which remains observable while this thread is synchronously waiting.
  worker.on('error',error=>{terminal??=error;});
  worker.unref();

  function stop() {
    if(stopped)return;stopped=true;worker.postMessage({shutdown:true});
  }
  function receive() {
    for(;;){
      if(terminal)throw terminal;
      let status=Atomics.load(control,0);
      while(status===0){Atomics.wait(control,0,0);status=Atomics.load(control,0);}
      if(status===2){
        const length=Atomics.load(control,1);
        if(length<1)throw new Error('invalid native transport buffer request');
        buffer=new SharedArrayBuffer(Math.max(buffer.byteLength*2,length+16));
        control=new Int32Array(buffer,0,4);payload=new Uint8Array(buffer,16);
        worker.postMessage({buffer});continue;
      }
      if(status!==1)throw new Error('invalid native transport response state');
      const length=Atomics.load(control,1);
      if(length<0||length>payload.length)throw new Error('invalid native transport response length');
      const text=decoder.decode(payload.subarray(0,length));
      Atomics.store(control,0,0);worker.postMessage({consumed:true});
      const record=JSON.parse(text);
      if(record?.transportFailure){terminal=remoteFailure(record.transportFailure);throw terminal;}
      return record;
    }
  }
  function exchange(method,args=[]) {
    if(stopped)throw new Error('native memory is closed');
    const id=++sequence;depth++;
    try {
      worker.postMessage({request:{id,method,args}});
      for(;;){
        const message=receive();
        if(message?.callback!==undefined){
          const callback=message.callback;
          try {
            if(typeof hostCall!=='function')throw new TypeError('native artifact requires an explicit host capability dispatcher');
            const value=hostCall(callback.index,callback.heap,callback.argv);
            if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new TypeError('native host capability returned an invalid managed word');
            worker.postMessage({request:{callback:callback.id,result:value}});
          } catch(error) {
            const token=++hostSequence;hostFailures.set(token,error);
            worker.postMessage({request:{callback:callback.id,hostError:token}});
          }
          continue;
        }
        if(message?.id!==id)throw new Error('native transport response belongs to a different invocation');
        if(Object.hasOwn(message,'hostError')){
          if(!hostFailures.has(message.hostError))throw new Error('unknown native host exception identity');
          const error=hostFailures.get(message.hostError);hostFailures.delete(message.hostError);throw error;
        }
        if(message.error)throw remoteFailure(message.error);
        return message.result;
      }
    } finally {depth--;if(closed&&depth===0){hostFailures.clear();stop();}}
  }
  const active=()=>{if(closed)throw new Error('native memory is closed');};
  const range=(offset,length)=>{
    active();
    // Validate in the original Node realm before the JSON wire can coerce an
    // unsupported value (for example NaN, undefined or a boxed number).
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0)
      throw new RangeError('memory access out of bounds');
    if(offset+length>exchange('size'))throw new RangeError('memory access out of bounds');
  };
  try {exchange('open',[path,signatures,configuration]);}
  catch(error){closed=true;stop();throw error;}
  return Object.freeze({
    get byteLength(){active();return exchange('size');},
    invoke(name,...args){
      active();
      if(!arities.has(name))throw new TypeError('unknown native memory export');
      if(args.length!==arities.get(name))throw new TypeError('native memory argument count mismatch');
      for(const value of args)
        if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new RangeError('memory32 arguments must be u32');
      return exchange('invoke',[name,...args]);
    },
    read(offset,length){
      range(offset,length);
      const result=new Uint8Array(length);
      // Keep the complete independent public result, but never a second
      // complete base64 string/decoded Buffer beside it. The empty operation
      // still crosses the original remote boundary once.
      for(let start=0;start<length||start===0;start+=nativeMemoryBlockBytes){
        const count=Math.min(nativeMemoryBlockBytes,length-start);
        const encoded=exchange('read',[offset+start,count]);
        if(typeof encoded!=='string'||encoded.length!==Math.ceil(count/3)*4)
          throw new Error('native memory read returned an invalid byte count');
        const bytes=Buffer.from(encoded,'base64');
        if(bytes.byteLength!==count)throw new Error('native memory read returned an invalid byte count');
        result.set(bytes,start);
      }
      return result;
    },
    write(input,offset=0){
      active();if(!(input instanceof Uint8Array))throw new TypeError('memory write requires Uint8Array');
      // Snapshot the whole caller view before dispatch, including before the
      // full range check. Only its cross-process encoding is block bounded.
      const bytes=Buffer.from(input);range(offset,bytes.byteLength);
      for(let start=0;start<bytes.byteLength||start===0;start+=nativeMemoryBlockBytes)
        exchange('write',[bytes.toString('base64',start,Math.min(start+nativeMemoryBlockBytes,bytes.byteLength)),offset+start]);
    },
    close(){if(closed)return;try{exchange('close');}finally{closed=true;if(depth===0){hostFailures.clear();stop();}}},
  });
}
