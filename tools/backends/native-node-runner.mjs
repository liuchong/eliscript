import {readSync,writeSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {openNativeMemory} from './native-memory.mjs';
import {errorData} from './compiler-worker.mjs';

let memory,callbackSequence=0,remainder=Buffer.alloc(0),eof=false;
const input=Buffer.allocUnsafe(65536),hostFailures=new WeakMap(),pause=new Int32Array(new SharedArrayBuffer(4));
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function read(){
  const pieces=[];let length=0;
  for(;;){
    const end=remainder.indexOf(10);
    if(end>=0){
      const tail=remainder.subarray(0,end);
      const bytes=pieces.length?Buffer.concat([...pieces,tail],length+tail.length):tail;
      remainder=remainder.subarray(end+1);
      return JSON.parse(decoder.decode(bytes));
    }
    if(remainder.length){pieces.push(remainder);length+=remainder.length;remainder=Buffer.alloc(0);}
    if(eof){if(length)throw new Error('incomplete native transport request');return null;}
    let count;
    try{count=readSync(0,input,0,input.length,null);}
    catch(error){if(error?.code==='EINTR')continue;if(error?.code==='EAGAIN'||error?.code==='EWOULDBLOCK'){Atomics.wait(pause,0,0,1);continue;}throw error;}
    if(count===0)eof=true;
    // Keep each filled read buffer once, then join a complete packet once.
    // Growing the entire prefix here copies large compiler inputs repeatedly.
    else remainder=Buffer.from(input.subarray(0,count));
  }
}
function send(record){
  const bytes=Buffer.from(JSON.stringify(record)+'\n');let offset=0;
  while(offset<bytes.length){
    try{const written=writeSync(1,bytes,offset,bytes.length-offset,null);if(written===0)throw new Error('native transport output made no progress');offset+=written;}
    catch(error){if(error?.code==='EINTR')continue;if(error?.code==='EAGAIN'||error?.code==='EWOULDBLOCK'){Atomics.wait(pause,0,0,1);continue;}throw error;}
  }
}
function describe(error){
  return errorData(error,{transport:'json'});
}
function hostCall(index,heap,argv){
  const id=++callbackSequence;send({callback:{id,index,heap,argv}});
  for(;;){
    const message=read();
    if(message===null)throw new Error('native host disconnected during a callback');
    if(message.callback!==undefined){
      if(message.callback!==id)throw new Error('native callback response belongs to a different invocation');
      if(Object.hasOwn(message,'hostError')){const error=Object.freeze({});hostFailures.set(error,message.hostError);throw error;}
      return message.result;
    }
    // Host reflection may call back into the same library while a source frame
    // is suspended. Run that nested memory operation before resuming the frame.
    dispatch(message);
  }
}
function dispatch(message){
  const {id,method,args=[]}=message;
  try {
    if(!Number.isSafeInteger(id)||id<1)throw new TypeError('invalid native transport invocation');
    if(method==='open')throw new Error('native memory is already open');
    if(!memory)throw new Error('native memory is closed');
    let result;
    if(method==='size')result=memory.byteLength;
    else if(method==='invoke')result=memory.invoke(...args);
    else if(method==='read')result=Buffer.from(memory.read(...args)).toString('base64');
    else if(method==='write')result=memory.write(new Uint8Array(Buffer.from(args[0],'base64')),args[1]);
    else if(method==='close')result=memory.close();
    else throw new TypeError('unknown native transport method');
    send({id,result:result??null});
  }catch(error){
    if(error!==null&&(typeof error==='object'||typeof error==='function')&&hostFailures.has(error))send({id,hostError:hostFailures.get(error)});
    else send({id,error:describe(error)});
  }
}
const watchdog=new Worker(new URL('./native-node-watchdog.mjs',import.meta.url),{
  workerData:{parentPID:process.ppid},execArgv:[],env:{...process.env,NODE_OPTIONS:'',BUN_OPTIONS:''},
});
try {
  await new Promise((resolve,reject)=>{
    const ready=message=>{if(message?.ready){cleanup();resolve();}};
    const fail=error=>{cleanup();reject(error);};
    const exit=code=>fail(new Error('native loader ownership watcher exited before initialization: '+code));
    const cleanup=()=>{watchdog.off('message',ready);watchdog.off('error',fail);watchdog.off('exit',exit);};
    watchdog.on('message',ready);watchdog.once('error',fail);watchdog.once('exit',exit);
  });
} catch(error) {await watchdog.terminate();throw error;}
watchdog.on('error',error=>{send({transportFailure:describe(error)});process.exit(1);});
watchdog.unref();
send({ready:true});
try {
  const first=read();
  if(first!==null){
    try{
      if(first.method!=='open'||!Array.isArray(first.args)||first.args.length!==3)throw new TypeError('native transport requires initialization');
      memory=await openNativeMemory(first.args[0],first.args[1],{...first.args[2],hostCall});
      send({id:first.id,result:true});
    }catch(error){send({id:first.id,error:describe(error)});process.exitCode=1;}
    if(memory){let message;while((message=read())!==null)dispatch(message);}
  }
}finally{try{memory?.close();}finally{await watchdog.terminate();}}
