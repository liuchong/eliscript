import {afterAll, beforeAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {buildBackends} from '../tools/backends/build.mjs';

const target = process.arch === 'arm64' ? process.platform === 'darwin' ? 'arm64-macos'
  : process.platform === 'linux' ? 'arm64-linux' : undefined : undefined;
const nativeTest = test.skipIf(!target);
let directory, library, nativeDebug;
const signatures = {read32: 1, write32: 2, grow: 1, notify: 2, spin: 2};
const capabilities = [{name: 'source-operation', module: 'eliscript.host', arity: 2, abi: 'managed-host-call-v1'}];
beforeAll(async () => {
  if (!target) return;
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-native-node-'));
  const backend = await buildBackends({outputRoot: directory});
  const memory = await import(pathToFileURL(resolve(backend.directory, 'memory.mjs')).href);
  const typed = memory.lower_memory_program(backend.compiler.compile_ir_string(`
    (import "eliscript:memory32" load-u32 store-u32 memory-grow)
    (defun read32 (p) (load-u32 p))
    (defun write32 (p v) (store-u32 p v))
    (defun grow (n) (memory-grow n))
    (defun notify (heap argv) 0)
    (defun spin (heap argv) (while true (store-u32 64 1)))
    (export read32 write32 grow notify spin)`, 'native-node-memory.eli'));
  const notify = typed.functions.find(fn => fn.name === 'notify');
  assert(notify);
  notify.body = {kind: 'host-call', type: 'u32', value: 'source-operation', children: [
    {kind: 'local', type: 'u32', value: 0, children: []},
    {kind: 'local', type: 'u32', value: 1, children: []},
  ]};
  const spin = typed.functions.find(fn => fn.name === 'spin');
  assert(spin);
  spin.body = {kind: 'sequence', type: 'u32', value: null, children: [structuredClone(notify.body), spin.body]};
  typed.hostCapabilities = capabilities;
  library = resolve(directory, target === 'arm64-macos' ? 'memory.dylib' : 'memory.so');
  const emission = backend.native.emit_typed_native_memory_artifact(typed, target, {format: 'library'});
  nativeDebug = emission.debug;
  await writeFile(library, Uint8Array.from(emission.bytes));
}, 120000);
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true});});

async function runNode(body, name) {
  const script = resolve(directory, name + '.mjs');
  await writeFile(script, `import assert from 'node:assert/strict';
import {openNativeMemory} from ${JSON.stringify(new URL('../tools/backends/native-memory.mjs', import.meta.url).href)};
assert.equal(process.versions.bun, undefined);
const library=${JSON.stringify(library)},signatures=${JSON.stringify(signatures)};
const configuration={initialPages:1,maximumPages:8,nativeTarget:${JSON.stringify(target)},
  bunExecutable:${JSON.stringify(process.execPath)},hostCapabilities:${JSON.stringify(capabilities)}};
${body}
process.stdout.write('native-node-verified\\n');
`);
  const result = spawnSync(process.env.NODE ?? 'node', [script], {
    cwd: directory, encoding: 'utf8', timeout: 30000,
    env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
  });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.stdout, 'native-node-verified\n');
}

nativeTest('Node native memory owns real library bytes, grows and resizes bulk transfers without changing hosts', async () => {
  await runNode(`
const a=await openNativeMemory(library,signatures,{...configuration,hostCall:()=>0});
const b=await openNativeMemory(library,signatures,{...configuration,hostCall:()=>0});
try {
  assert.equal(a.byteLength,65536);
  a.invoke('write32',3,0xfedcba98);
  assert.equal(a.invoke('read32',3),0xfedcba98);
  assert.equal(b.invoke('read32',3),0);
  assert.equal(a.invoke('grow',2),1);
  assert.equal(a.byteLength,196608);
  assert.deepEqual(a.read(65536,32),new Uint8Array(32));
  const bytes=Uint8Array.from({length:196600},(_,i)=>(i*37+11)&255);
  assert.equal(a.write(bytes,3),undefined);
  const read=a.read(3,bytes.length);
  assert.deepEqual(read,bytes);
  read.fill(0);assert.deepEqual(a.read(3,32),bytes.slice(0,32));
  a.close();a.close();
  assert.throws(()=>a.invoke('read32',3),/closed/);
  assert.throws(()=>a.read(0,1),/closed/);
  assert.equal(b.invoke('read32',3),0);
} finally {a.close();b.close();}
`, 'bulk');
}, 30000);

nativeTest('Node bulk transfers bound every real base64 packet while preserving complete snapshots ranges and empty operations', async () => {
  await runNode(`
import {Worker} from 'node:worker_threads';
const post=Worker.prototype.postMessage,from=Buffer.from;
let packets=[],decoded=[],onSize,shortRead=false,a;
Worker.prototype.postMessage=function(message,...rest){
  const request=message?.request;
  if(request?.method==='size'){
    packets.push({method:'size'});
    if(onSize){const run=onSize;onSize=undefined;run();}
  }else if(request?.method==='read'){
    packets.push({method:'read',offset:request.args[0],length:request.args[1]});
    if(shortRead&&request.args[1]>0){
      shortRead=false;message={...message,request:{...request,args:[request.args[0],request.args[1]-1]}};
    }
  }else if(request?.method==='write'){
    const text=request.args[0],padding=text.endsWith('==')?2:text.endsWith('=')?1:0;
    packets.push({method:'write',offset:request.args[1],length:text.length*3/4-padding,units:text.length});
  }
  return Reflect.apply(post,this,[message,...rest]);
};
Buffer.from=function(...args){
  if(args[1]==='base64'){assert.equal(typeof args[0],'string');decoded.push(args[0].length);assert(args[0].length<=87384);}
  return Reflect.apply(from,this,args);
};
try{
  a=await openNativeMemory(library,signatures,{...configuration,hostCall:()=>0});
  assert.equal(a.invoke('grow',3),1);
  for(const length of [0,1,65535,65536,65537,131072,196625]){
    const backing=Uint8Array.from({length:length+11},(_,index)=>(index*37+11)&255);
    const input=backing.subarray(7,7+length),expected=Uint8Array.from(input),offset=3;
    packets=[];onSize=()=>backing.fill(255);
    assert.equal(a.write(input,offset),undefined);
    const writes=packets.filter(item=>item.method==='write');
    assert.equal(packets[0].method,'size');assert.equal(writes.length,Math.max(1,Math.ceil(length/65536)));
    for(let index=0;index<writes.length;index++){
      assert.equal(writes[index].offset,offset+index*65536);
      assert.equal(writes[index].length,Math.min(65536,length-index*65536));assert(writes[index].units<=87384);
    }
    packets=[];decoded=[];
    const actual=a.read(offset,length),reads=packets.filter(item=>item.method==='read');
    assert(actual instanceof Uint8Array);assert.equal(actual.byteLength,length);assert.deepEqual(actual,expected);
    assert.equal(packets[0].method,'size');assert.equal(reads.length,Math.max(1,Math.ceil(length/65536)));
    assert.equal(decoded.length,reads.length);
    for(let index=0;index<reads.length;index++){
      assert.equal(reads[index].offset,offset+index*65536);
      assert.equal(reads[index].length,Math.min(65536,length-index*65536));
    }
    actual.fill(0);assert.deepEqual(a.read(offset,length),expected,'a returned read view never aliases native memory');
  }
  const end=a.byteLength,tail=a.read(end-8,8);
  packets=[];assert.throws(()=>a.write(new Uint8Array(65537).fill(9),end-65536),RangeError);
  assert.deepEqual(packets.map(item=>item.method),['size'],'reject the whole range before writing its first block');
  assert.deepEqual(a.read(end-8,8),tail);
  packets=[];assert.throws(()=>a.read(end-65536,65537),RangeError);
  assert.deepEqual(packets.map(item=>item.method),['size']);
  packets=[];assert.equal(a.write(new Uint8Array(0),end),undefined);
  assert.deepEqual(packets,[{method:'size'},{method:'write',offset:end,length:0,units:0}]);
  packets=[];assert.deepEqual(a.read(end,0),new Uint8Array(0));
  assert.deepEqual(packets,[{method:'size'},{method:'read',offset:end,length:0}]);
  for(const action of [()=>a.read(end+1,0),()=>a.write(new Uint8Array(0),end+1)]){
    packets=[];assert.throws(action,RangeError);assert.deepEqual(packets.map(item=>item.method),['size']);
  }
  // Ask the real Bun runner for one fewer byte, without changing the caller's
  // expected length. Equal base64 text lengths still must not hide a short
  // packet by padding the public result with zeros.
  const expected=a.read(3,65535);shortRead=true;
  assert.throws(()=>a.read(3,65535),/native memory read returned an invalid byte count/);
  assert.deepEqual(a.read(3,65535),expected);
  a.close();a.close();assert.throws(()=>a.read(0,0),/closed/);assert.throws(()=>a.write(new Uint8Array(0)),/closed/);
}finally{if(a)a.close();Worker.prototype.postMessage=post;Buffer.from=from;}
`, 'bounded-bulk');
}, 30000);

nativeTest('chunked real Node native transfers remain isolated during nested callbacks original throws and callback close', async () => {
  await runNode(`
const expected=Uint8Array.from({length:131073},(_,index)=>(index*19+3)&255);
let a,b,mode='normal',reason,calls=0;
try{
  b=await openNativeMemory(library,signatures,{...configuration,hostCall:()=>0});
  b.invoke('grow',3);
  a=await openNativeMemory(library,signatures,{...configuration,hostCall:(index,heap,argv)=>{
    assert.equal(index,0);assert.equal(heap,17);assert.equal(argv,23);calls++;
    a.write(expected,5);const actual=a.read(5,expected.length);assert.deepEqual(actual,expected);
    actual.fill(0);assert.deepEqual(a.read(5,expected.length),expected);
    assert.deepEqual(b.read(5,expected.length),new Uint8Array(expected.length),'another context never observes partial or complete writes');
    if(mode==='throw')throw reason;
    if(mode==='close'){a.close();return 7;}
    return 42;
  }});
  a.invoke('grow',3);assert.equal(a.invoke('notify',17,23),42);
  for(reason of [false,Object.freeze({original:'chunked callback'})]){
    mode='throw';let caught=false;
    try{a.invoke('notify',17,23);}catch(error){caught=true;assert.strictEqual(error,reason);}assert(caught);
    mode='normal';assert.equal(a.invoke('notify',17,23),42);
  }
  mode='close';assert.equal(a.invoke('notify',17,23),7);assert.equal(calls,6);
  assert.throws(()=>a.read(0,0),/closed/);assert.throws(()=>a.write(new Uint8Array(0)),/closed/);
  assert.deepEqual(b.read(5,expected.length),new Uint8Array(expected.length));
}finally{a?.close();b?.close();}
`, 'chunked-callbacks');
}, 30000);

nativeTest('Node native memory validates the original ABI and restores native trap classes before recovery', async () => {
  await runNode(`
const a=await openNativeMemory(library,signatures,{...configuration,hostCall:()=>0});
try {
  for(const bad of [undefined,null,false,{},'1',1n,NaN,Infinity,-1,0.5,4294967296])
    assert.throws(()=>a.invoke('read32',bad),RangeError);
  assert.throws(()=>a.invoke(Symbol('missing')),TypeError);
  assert.throws(()=>a.invoke('missing'),TypeError);
  assert.throws(()=>a.invoke('read32'),TypeError);
  assert.throws(()=>a.invoke('read32',0,1),TypeError);
  for(const bad of [undefined,null,'0',NaN,Infinity,-1,0.5,1n]) {
    assert.throws(()=>a.read(bad,1),RangeError);
    assert.throws(()=>a.write(Uint8Array.of(1),bad),RangeError);
  }
  assert.throws(()=>a.write([]),TypeError);
  assert.throws(()=>a.read(65535,2),RangeError);
  assert.throws(()=>a.invoke('read32',65535),WebAssembly.RuntimeError);
  a.invoke('write32',0,42);assert.equal(a.invoke('read32',0),42);
} finally {a.close();}
await assert.rejects(openNativeMemory(library,signatures,{...configuration,
  hostCall:()=>0,bunExecutable:library+'.missing-runtime'}),error=>error.code==='ENOENT');
`, 'boundaries');
}, 30000);

nativeTest('large Unicode debug records cross real native request and error packets without changing code or source positions', async () => {
  const debug = structuredClone(nativeDebug);
  const filename = 'virtual/' + '汉😀e\u0301'.repeat(32768) + '.eli';
  const replaceSpan = item => {
    if (item.span) item.span = {...item.span, filename};
  };
  for (const fn of debug.functions) replaceSpan(fn);
  for (const range of debug.ranges) replaceSpan(range);
  debug.sources = [{id: filename, filename, macroOrigins: []}];
  await runNode(`
const debug=${JSON.stringify(debug)};
const a=await openNativeMemory(library,signatures,{...configuration,
  hostCall:()=>0,debug,trapSites:debug.trapSites});
try {
  let trapped;
  try{a.invoke('read32',65535);}catch(error){trapped=error;}
  assert(trapped instanceof WebAssembly.RuntimeError);
  assert(Array.isArray(trapped.eliscriptFrames));
  assert(Array.isArray(trapped.eliscriptSourceFrames));
  const frame=trapped.eliscriptSourceFrames.find(item=>item.source?.function==='read32');
  assert(frame,'real native read32 trap did not retain its instruction map');
  assert.equal(frame.source.span.filename,${JSON.stringify(filename)});
  assert.equal(frame.source.source,${JSON.stringify(filename)});
  const original=debug.functions.find(fn=>fn.name==='read32');
  assert(frame.source.span.start>=original.span.start&&frame.source.span.end<=original.span.end);
  assert([...debug.functions,...debug.ranges].some(item=>item.span&&
    JSON.stringify(item.span)===JSON.stringify(frame.source.span)),
    'transport changed the emitted source span');
  a.invoke('write32',0,42);assert.equal(a.invoke('read32',0),42);
  assert.equal(a.invoke('notify',0,0),0);
} finally {a.close();}
`, 'unicode-packets');
}, 30000);

nativeTest('Node native callbacks reenter their original memory and preserve each exact thrown host value', async () => {
  await runNode(`
let mode='reenter',thrown,calls=0,a;
a=await openNativeMemory(library,signatures,{...configuration,hostCall:(index,heap,argv)=>{
  assert.equal(index,0);assert.equal(heap,17);assert.equal(argv,23);calls++;
  if(mode==='throw')throw thrown;
  if(mode==='close'){a.close();return 7;}
  a.invoke('write32',32,0x80000001);
  assert.equal(a.invoke('read32',32),0x80000001);
  assert.deepEqual(a.read(32,4),Uint8Array.of(1,0,0,128));
  a.write(Uint8Array.of(42),32);
  return a.invoke('read32',32);
}});
try {
  assert.equal(a.invoke('notify',17,23),0x8000002a);
  for(thrown of [undefined,null,false,0,-0,NaN,1n,Object.freeze({tag:'host'}),new URIError('host failure')]){
    mode='throw';let caught=false;
    try{a.invoke('notify',17,23);}catch(error){caught=true;assert(Object.is(error,thrown));}
    assert(caught);
    mode='reenter';assert.equal(a.invoke('notify',17,23),0x8000002a);
  }
  mode='close';assert.equal(a.invoke('notify',17,23),7);
  assert.equal(calls,20);
  assert.throws(()=>a.invoke('read32',0),/closed/);
} finally {a.close();}
`, 'callbacks');
}, 30000);

nativeTest('the real native loader consumes multiple packets and closes only after complete requests', () => {
  const first = {id: 1, method: 'open', args: [library, signatures, {
    initialPages: 1, maximumPages: 8, nativeTarget: target, hostCapabilities: capabilities,
  }]};
  const input = [first,
    {id: 2, method: 'invoke', args: ['write32', 3, 0xfedcba98]},
    {id: 3, method: 'invoke', args: ['read32', 3]},
    {id: 4, method: 'read', args: [3, 4]},
    {id: 5, method: 'close', args: []},
  ].map(value => JSON.stringify(value) + '\n').join('');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/backends/native-node-runner.mjs', import.meta.url))], {
    cwd: directory, input, encoding: 'utf8', timeout: 30000,
    env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
  });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').map(line => JSON.parse(line)), [
    {ready: true}, {id: 1, result: true}, {id: 2, result: null},
    {id: 3, result: 0xfedcba98}, {id: 4, result: Buffer.from([0x98, 0xba, 0xdc, 0xfe]).toString('base64')},
    {id: 5, result: null},
  ]);
}, 30000);

nativeTest('the real native loader rejects truncated frames, invalid UTF8 and a forbidden transport BOM before opening a library', () => {
  const open = JSON.stringify({id: 1, method: 'open', args: [library, signatures, {
    initialPages: 1, maximumPages: 8, nativeTarget: target, hostCapabilities: capabilities,
  }]}) + '\n';
  const cases = [
    {label: 'truncated', input: Buffer.from('{"id":1'), error: /incomplete native transport request/},
    {label: 'invalid-utf8', input: Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d, 0x0a]), error: /UTF.?8|encoded data|encoding/i},
    {label: 'bom', input: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(open)]), error: /SyntaxError|JSON/i},
  ];
  for (const item of cases) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/backends/native-node-runner.mjs', import.meta.url))], {
      cwd: directory, input: item.input, encoding: 'utf8', timeout: 10000,
      env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
    });
    assert.equal(result.error, undefined, item.label + ': ' + result.stderr);
    assert.notEqual(result.status, 0, item.label);
    assert.equal(result.stdout, '{"ready":true}\n', item.label);
    assert.match(result.stderr, item.error, item.label);
  }
}, 30000);

nativeTest('terminating an owner also terminates its loader while real native code is running', async () => {
  const script = resolve(directory, 'terminated-owner.mjs');
  await writeFile(script, `import {spawn} from 'node:child_process';
const child=spawn(${JSON.stringify(process.execPath)},[${JSON.stringify(fileURLToPath(new URL('../tools/backends/native-node-runner.mjs', import.meta.url)))}],
  {stdio:['pipe','pipe','inherit'],env:{...process.env,NODE_OPTIONS:'',BUN_OPTIONS:''}});
let pending='';
child.on('error',error=>{process.stderr.write(error.stack+'\\n');process.exit(1);});
child.stdout.setEncoding('utf8');
child.stdout.on('data',chunk=>{
  pending+=chunk;let end;
  while((end=pending.indexOf('\\n'))>=0){
    const message=JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);
    if(message.ready)child.stdin.write(JSON.stringify({id:1,method:'open',args:[
      ${JSON.stringify(library)},${JSON.stringify(signatures)},
      {initialPages:1,maximumPages:8,nativeTarget:${JSON.stringify(target)},hostCapabilities:${JSON.stringify(capabilities)}}]})+'\\n');
    else if(message.id===1){
      if(message.error)throw new Error(JSON.stringify(message.error));
      child.stdin.write(JSON.stringify({id:2,method:'invoke',args:['spin',17,23]})+'\\n');
    }else if(message.callback){
      // Flush the response before publishing readiness: EOF after owner death
      // follows this response, so it cannot unwind the running native frame.
      child.stdin.write(JSON.stringify({callback:message.callback.id,result:0})+'\\n',()=>{
        process.stdout.write(JSON.stringify({pid:child.pid})+'\\n');
      });
    }else throw new Error('native spin returned unexpectedly: '+JSON.stringify(message));
  }
});
`);
  const owner = spawn(process.env.NODE ?? 'node', [script], {
    cwd: directory, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, NODE_OPTIONS: '', BUN_OPTIONS: ''},
  });
  let loaderPID, stderr = '', exited = false;
  owner.once('exit', () => {exited = true;});
  owner.stderr.on('data', bytes => {stderr += bytes.toString();});
  const alive = pid => {try {process.kill(pid, 0);return true;} catch (error) {if (error.code === 'ESRCH') return false;throw error;}};
  try {
    loaderPID = await new Promise((accept, reject) => {
      let output = '';
      const timeout = setTimeout(() => finish(new Error('native frame did not enter its callback: ' + stderr)), 10000);
      const data = bytes => {
        output += bytes.toString();
        const end = output.indexOf('\n');
        if (end >= 0) {
          try {const value = JSON.parse(output.slice(0, end));assert(Number.isSafeInteger(value.pid));finish(undefined, value.pid);}
          catch (error) {finish(error);}
        }
      };
      const error = failure => finish(failure);
      const exit = code => finish(new Error('native owner exited before its callback: ' + code + '\n' + stderr));
      const finish = (failure, pid) => {
        clearTimeout(timeout);owner.stdout.off('data', data);owner.off('error', error);owner.off('exit', exit);
        if (failure) reject(failure);else accept(pid);
      };
      owner.stdout.on('data', data);owner.once('error', error);owner.once('exit', exit);
    });
    assert(alive(loaderPID));
    const ownerExit = new Promise(accept => owner.once('exit', accept));
    owner.kill('SIGKILL');await ownerExit;
    const deadline = Date.now() + 5000;
    while (alive(loaderPID) && Date.now() < deadline) await new Promise(accept => setTimeout(accept, 25));
    assert.equal(alive(loaderPID), false, 'native loader outlived its terminated owner');
  } finally {
    if (!exited) owner.kill('SIGKILL');
    if (loaderPID && alive(loaderPID)) process.kill(loaderPID, 'SIGKILL');
  }
}, 30000);
