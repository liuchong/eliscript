import {parentPort,workerData} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {errorData} from './compiler-worker.mjs';

let buffer=workerData.buffer,control=new Int32Array(buffer,0,4),payload=new Uint8Array(buffer,16);
let current=null,ready=false,failed=false,closing=false,parentClosed=false,receivedBytes=0;
const received=[],packets=[],encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function failure(error){
  return errorData(error,{transport:'json'});
}
function publish(){
  if(current!==null||packets.length===0)return;
  current=packets.shift();flush();
}
function flush(){
  if(current===null)return;
  if(current.length>payload.length){Atomics.store(control,1,current.length);Atomics.store(control,0,2);}
  else{payload.set(current);Atomics.store(control,1,current.length);Atomics.store(control,0,1);}
  Atomics.notify(control,0);
}
function deliver(message){packets.push(encoder.encode(JSON.stringify(message)));publish();}
function fail(error){
  if(failed||parentClosed)return;failed=true;received.length=0;receivedBytes=0;
  const record=failure(error);
  if(!ready)parentPort.postMessage({startupFailure:record});
  else deliver({transportFailure:record});
  child.kill();
}
const child=spawn(workerData.bunExecutable,[fileURLToPath(new URL('./native-node-runner.mjs',import.meta.url))],{
  stdio:['pipe','pipe','inherit'],env:{...process.env,NODE_OPTIONS:'',BUN_OPTIONS:''},
});
child.on('error',fail);child.stdin.on('error',error=>{if(!closing)fail(error);});
// Wait for stdio to drain before reporting process termination. Its final
// packet may still be buffered when the process emits the earlier exit event.
child.on('close',(code,signal)=>{
  if(parentClosed)return;
  if(!failed&&receivedBytes!==0){fail(new Error('native process ended with an incomplete JSON packet'));return;}
  if(!closing)fail(new Error('native process exited: '+(signal??code)));
  else if(!failed)parentPort.close();
});
child.stdout.on('error',fail);
child.stdout.on('data',chunk=>{
  if(failed||parentClosed)return;
  try {
    let start=0;
    // Search only the newly arrived bytes. Retained fragments are never
    // rescanned or decoded until their single complete JSON packet arrives.
    for(let end=chunk.indexOf(0x0a,start);end!==-1;end=chunk.indexOf(0x0a,start)){
      const tail=chunk.subarray(start,end);
      if(tail.length){received.push(tail);receivedBytes+=tail.length;}
      const packet=Buffer.concat(received,receivedBytes);
      received.length=0;receivedBytes=0;start=end+1;
      const message=JSON.parse(decoder.decode(packet));
      if(message?.ready){if(ready)throw new Error('duplicate native process initialization');ready=true;parentPort.postMessage({ready:true});}
      else{if(!ready)throw new Error('native process responded before initialization');deliver(message);}
    }
    if(start<chunk.length){const tail=chunk.subarray(start);received.push(tail);receivedBytes+=tail.length;}
  }catch(error){fail(error);}
});
child.stdout.on('end',()=>{
  if(!failed&&!parentClosed&&receivedBytes!==0)fail(new Error('native process ended with an incomplete JSON packet'));
});
parentPort.on('message',message=>{
  if(message?.buffer){buffer=message.buffer;control=new Int32Array(buffer,0,4);payload=new Uint8Array(buffer,16);flush();}
  else if(message?.consumed){current=null;publish();}
  else if(message?.shutdown){closing=true;child.stdin.end();}
  else if(message?.request){
    if(failed){deliver({transportFailure:failure(new Error('native process is unavailable'))});return;}
    try{child.stdin.write(JSON.stringify(message.request)+'\n');}catch(error){fail(error);}
  }
});
parentPort.once('close',()=>{parentClosed=true;closing=true;received.length=0;receivedBytes=0;child.kill('SIGTERM');});
process.on('uncaughtException',fail);
process.on('unhandledRejection',fail);
