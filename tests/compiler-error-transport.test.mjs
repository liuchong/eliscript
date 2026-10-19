import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {
  compilerWorkerVersion,
  createCompilerWorkerClient,
  errorData,
  fromErrorData,
} from '../tools/backends/compiler-worker.mjs';

const transports = [
  {name: 'structured clone', options: {}, wire: value => structuredClone(value)},
  {name: 'JSON', options: {transport: 'json'}, wire: value => JSON.parse(JSON.stringify(value))},
];
const primitiveValues = [undefined, null, false, true, 0, -0, NaN, Infinity, -Infinity,
  '', '原因😀\ud800', 42, 9007199254740993n, -9007199254740993n];
const errorClasses = [Error, TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError,
  WebAssembly.CompileError, WebAssembly.LinkError, WebAssembly.RuntimeError];

function roundTrip(value, transport) {
  return fromErrorData(transport.wire(errorData(value, transport.options)));
}
function samePrimitive(actual, expected) {
  assert.equal(typeof actual, typeof expected);
  assert(Object.is(actual, expected), 'exception transport changed an observable primitive value');
}
async function rejection(promise) {
  return promise.then(() => assert.fail('expected a rejected request'), reason => ({reason}));
}

for (const transport of transports) {
  test(transport.name + ' preserves actual Error classes, diagnostics, stacks and source frames', () => {
    for (const Constructor of errorClasses) {
      const original = new Constructor('compile failure');
      original.code = 'ELI-A0001';
      original.stack = Constructor.name + ': compile failure\n    at original.eli:3:7';
      original.eliscriptDiagnostic = {
        format: 'eliscript-diagnostic', version: 1, code: 'ELI-A0001', severity: 'error',
        phase: 'analysis', message: 'unbound symbol: missing',
        location: {file: 'original.eli', start: {offset: 12, line: 3, column: 7},
          end: {offset: 19, line: 3, column: 14}},
      };
      original.diagnostics = [original.eliscriptDiagnostic];
      original.macroOrigins = [{macro: 'once', file: 'macros.eli', line: 2}];
      original.eliscriptFrames = [{function: 'compile', instruction: 42}];
      original.eliscriptSourceFrames = [{file: 'original.eli', line: 3, column: 7}];
      const actual = roundTrip(original, transport);
      assert(actual instanceof Constructor, 'transport changed ' + Constructor.name + ' into another Error class');
      assert.equal(actual.name, original.name);
      assert.equal(actual.message, original.message);
      assert.equal(actual.stack, original.stack);
      assert.equal(actual.code, original.code);
      assert.deepEqual(actual.eliscriptDiagnostic, original.eliscriptDiagnostic);
      assert.equal(actual.diagnostics[0], actual.eliscriptDiagnostic);
      assert.deepEqual(actual.macroOrigins, original.macroOrigins);
      assert.deepEqual(actual.eliscriptFrames, original.eliscriptFrames);
      assert.deepEqual(actual.eliscriptSourceFrames, original.eliscriptSourceFrames);
    }
  });

  test(transport.name + ' keeps primitive throws and primitive causes distinct from Error instances', () => {
    for (const value of primitiveValues) {
      samePrimitive(roundTrip(value, transport), value);
      const original = new Error('outer', {cause: value});
      const actual = roundTrip(original, transport);
      assert(actual instanceof Error);
      assert(Object.hasOwn(actual, 'cause'));
      samePrimitive(actual.cause, value);
    }
    const absent = roundTrip(new Error('no cause'), transport);
    assert.equal(Object.hasOwn(absent, 'cause'), false);
    const present = roundTrip(new Error('undefined cause', {cause: undefined}), transport);
    assert.equal(Object.hasOwn(present, 'cause'), true);
    assert.equal(present.cause, undefined);
  });

  test(transport.name + ' preserves AggregateError elements and shared nested Error identity', () => {
    const child = new URIError('bad URI', {cause: -0});
    const original = new AggregateError([child, child, undefined, 9n], 'aggregate', {cause: child});
    original.errors.push(original);
    const actual = roundTrip(original, transport);
    assert(actual instanceof AggregateError);
    assert.equal(actual.message, 'aggregate');
    assert(actual.cause instanceof URIError);
    assert.equal(actual.errors[0], actual.cause);
    assert.equal(actual.errors[1], actual.cause);
    assert.equal(actual.errors[2], undefined);
    assert.equal(actual.errors[3], 9n);
    assert.equal(actual.errors[4], actual);
    assert(Object.is(actual.cause.cause, -0));
  });

  test(transport.name + ' preserves cycles across Error, ordinary objects, arrays, Maps and Sets', () => {
    const original = new TypeError('outer');
    const data = {name: 'Error', message: 'ordinary data', owner: original};
    const array = [data, original];
    array.length = 5;
    array[4] = undefined;
    data.array = array;
    data.map = new Map([[data, original], [original, array]]);
    data.set = new Set([data, original, array]);
    original.cause = data;
    original.extra = data;
    const actual = roundTrip(original, transport), cause = actual.cause;
    assert(actual instanceof TypeError);
    assert.equal(Object.getPrototypeOf(cause), Object.prototype);
    assert.equal(cause instanceof Error, false);
    assert.equal(actual.extra, cause);
    assert.equal(cause.owner, actual);
    assert.equal(cause.array[0], cause);
    assert.equal(cause.array[1], actual);
    assert.equal(cause.array.length, 5);
    assert.equal(Object.hasOwn(cause.array, 2), false);
    assert.equal(Object.hasOwn(cause.array, 3), false);
    assert.equal(Object.hasOwn(cause.array, 4), true);
    assert.equal(cause.map.get(cause), actual);
    assert.equal(cause.map.get(actual), cause.array);
    assert(cause.set.has(cause));
    assert(cause.set.has(actual));
    assert(cause.set.has(cause.array));
    const self = new Error('self');self.cause = self;
    const selfCopy = roundTrip(self, transport);
    assert.equal(selfCopy.cause, selfCopy);
  });

  test(transport.name + ' keeps thrown ordinary data ordinary, including Error-shaped cyclic objects', () => {
    const original = {name: 'TypeError', message: 'data only', cause: undefined};
    original.self = original;original.shared = [original, original];
    const actual = roundTrip(original, transport);
    assert.equal(actual instanceof Error, false);
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(actual.name, 'TypeError');
    assert.equal(actual.message, 'data only');
    assert(Object.hasOwn(actual, 'cause'));
    assert.equal(actual.cause, undefined);
    assert.equal(actual.self, actual);
    assert.equal(actual.shared[0], actual);
    assert.equal(actual.shared[1], actual);
  });

  test(transport.name + ' retains ArrayBuffer/view aliases and custom backreferences without transferring ownership', () => {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer, 4, 12);
    const bytes = new Uint8Array(buffer, 6, 8);
    const signed = new Int16Array(buffer, 8, 3);
    view.setUint32(0, 0x12345678, true);
    buffer.owner = view;
    view.owner = bytes;
    const actual = roundTrip(new Error('bytes', {cause: {buffer, view, bytes, signed}}), transport).cause;
    assert(actual.buffer instanceof ArrayBuffer);
    assert(actual.view instanceof DataView);
    assert(actual.bytes instanceof Uint8Array);
    assert(actual.signed instanceof Int16Array);
    assert.equal(actual.view.buffer, actual.buffer);
    assert.equal(actual.bytes.buffer, actual.buffer);
    assert.equal(actual.signed.buffer, actual.buffer);
    assert.equal(actual.buffer.owner, actual.view);
    assert.equal(actual.view.owner, actual.bytes);
    assert.equal(actual.view.byteOffset, 4);
    assert.equal(actual.view.byteLength, 12);
    assert.equal(actual.bytes.byteOffset, 6);
    assert.equal(actual.bytes.length, 8);
    assert.equal(actual.signed.byteOffset, 8);
    assert.equal(actual.signed.length, 3);
    assert.equal(actual.view.getUint32(0, true), 0x12345678);
    actual.bytes[0] = 0xab;
    assert.equal(new Uint8Array(actual.buffer)[6], 0xab);
    assert.notEqual(new Uint8Array(buffer)[6], 0xab);
    assert.equal(buffer.byteLength, 24);
  });

  test(transport.name + ' retains data descriptors, null prototypes and safe __proto__ keys', () => {
    const data = Object.create(null);
    Object.defineProperty(data, '__proto__', {value: {polluted: true}, enumerable: true,
      writable: false, configurable: false});
    Object.defineProperty(data, 'hidden', {value: undefined, enumerable: false,
      writable: false, configurable: true});
    data.self = data;
    const actual = roundTrip(new Error('data', {cause: data}), transport).cause;
    assert.equal(Object.getPrototypeOf(actual), null);
    assert.equal(actual.self, actual);
    assert.equal(actual.__proto__.polluted, true);
    assert.equal(Object.prototype.polluted, undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, 'hidden'), {
      value: undefined, enumerable: false, writable: false, configurable: true,
    });
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual, '__proto__'), {
      value: {polluted: true}, enumerable: true, writable: false, configurable: false,
    });
  });

  test(transport.name + ' materializes public lazy Error fields exactly once', () => {
    const reads = {name: 0, message: 0, stack: 0, cause: 0};
    const original = new Error();
    for (const [key, value] of Object.entries({name: 'TypeError', message: 'lazy',
      stack: 'TypeError: lazy\n    at original.eli:2:3', cause: false})) {
      Object.defineProperty(original, key, {configurable: true, get() {reads[key]++;return value;}});
    }
    const actual = roundTrip(original, transport);
    assert.deepEqual(reads, {name: 1, message: 1, stack: 1, cause: 1});
    assert(actual instanceof TypeError);
    assert.equal(actual.message, 'lazy');
    assert.equal(actual.stack, 'TypeError: lazy\n    at original.eli:2:3');
    assert.equal(actual.cause, false);
  });

  test(transport.name + ' handles a normal native Error stack and never invents removed public fields', () => {
    const original = new RangeError('native stack');
    const actual = roundTrip(original, transport);
    assert(actual instanceof RangeError);
    assert.equal(actual.stack, original.stack);
    const missing = new Error();delete missing.stack;
    const missingCopy = roundTrip(missing, transport);
    assert.equal(Object.hasOwn(missingCopy, 'stack'), false);
    assert.equal(Object.hasOwn(missingCopy, 'message'), false);
  });

  test(transport.name + ' retains Date and RegExp data without executing user property overrides', () => {
    const regex = /a+/gimu;
    regex.lastIndex = 4;
    Object.defineProperty(regex, 'global', {value: false, configurable: true, writable: true});
    const data = {invalid: new Date(NaN), date: new Date(123456), regex};
    data.date.owner = data;
    const actual = roundTrip(new Error('builtins', {cause: data}), transport).cause;
    assert(Number.isNaN(actual.invalid.getTime()));
    assert.equal(actual.date.getTime(), 123456);
    assert.equal(actual.date.owner, actual);
    assert(actual.regex instanceof RegExp);
    assert.equal(actual.regex.lastIndex, 4);
    actual.regex.lastIndex = 0;
    assert.equal(RegExp.prototype.exec.call(actual.regex, 'AAA')[0], 'AAA');
    assert.equal(Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get.call(actual.regex), 'imu');
    assert.equal(Object.getOwnPropertyDescriptor(RegExp.prototype, 'global').get.call(actual.regex), true);
    assert.equal(actual.regex.global, false);
  });

  test(transport.name + ' preserves frozen, sealed and nonextensible causes and diagnostic frames', () => {
    for (const integrity of [Object.freeze, Object.seal, Object.preventExtensions]) {
      for (const child of [new TypeError('cause'), {detail: 'ordinary cause'}]) {
        const cause = integrity(child);
        const original = new Error('integrity', {cause});
        original.eliscriptDiagnostic = Object.freeze({
          code: 'ELI-A0001', message: 'frozen diagnostic',
          location: Object.freeze({file: 'frozen.eli', line: 2, column: 3}),
        });
        original.diagnostics = Object.freeze([original.eliscriptDiagnostic]);
        original.eliscriptFrames = Object.freeze([Object.freeze({function: 'compile', instruction: 42})]);
        original.eliscriptSourceFrames = Object.freeze([Object.freeze({file: 'frozen.eli', line: 2, column: 3})]);
        const actual = roundTrip(original, transport);
        assert.equal(actual.cause instanceof Error, cause instanceof Error);
        assert.equal(Object.isFrozen(actual.cause), Object.isFrozen(cause));
        assert.equal(Object.isSealed(actual.cause), Object.isSealed(cause));
        assert.equal(Object.isExtensible(actual.cause), Object.isExtensible(cause));
        assert.equal(actual.cause instanceof Error ? actual.cause.message : actual.cause.detail,
          cause instanceof Error ? cause.message : cause.detail);
        assert(Object.isFrozen(actual.eliscriptDiagnostic));
        assert(Object.isFrozen(actual.eliscriptDiagnostic.location));
        assert(Object.isFrozen(actual.diagnostics));
        assert.equal(actual.diagnostics[0], actual.eliscriptDiagnostic);
        for (const name of ['eliscriptFrames', 'eliscriptSourceFrames']) {
          assert(Object.isFrozen(actual[name]));
          assert(Object.isFrozen(actual[name][0]));
          assert.equal(Object.isSealed(actual[name]), true);
          assert.equal(Object.isExtensible(actual[name]), false);
          assert.deepEqual(actual[name], original[name]);
        }
      }
    }
  });

  test(transport.name + ' preserves system error fields used by native subprocess failures', () => {
    const original = new Error('spawn executable ENOENT', {cause: null});
    original.code = 'ENOENT';
    original.errno = -2;
    original.syscall = 'spawn executable';
    original.path = 'missing-executable';
    original.spawnargs = ['--flag', 'argument with spaces', '', '😀'];
    const actual = roundTrip(original, transport);
    assert(actual instanceof Error);
    assert.equal(actual.message, original.message);
    assert.equal(actual.code, 'ENOENT');
    assert.equal(actual.errno, -2);
    assert.equal(actual.syscall, 'spawn executable');
    assert.equal(actual.path, 'missing-executable');
    assert.deepEqual(actual.spawnargs, original.spawnargs);
    assert.equal(actual.cause, null);
  });

  test(transport.name + ' reports untransportable causes explicitly instead of replacing their data', () => {
    for (const cause of [() => 1, Symbol('cause'), new WeakMap(), Object.create({inherited: 1})]) {
      const actual = roundTrip(new Error('original', {cause}), transport);
      assert.equal(actual.name, 'CompilerWorkerError');
      assert.equal(actual.code, 'uncloneable-error-cause');
      assert.match(actual.message, /could not transport.*exception/);
    }
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'value', {enumerable: true, get() {reads++;return 1;}});
    const error = roundTrip(new Error('accessor', {cause: accessor}), transport);
    assert.equal(error.code, 'uncloneable-error-cause');
    assert.match(error.message, /accessor/);
    assert.equal(reads, 0);
    const symbolKey = {[Symbol('untransportable key')]: 1};
    assert.equal(roundTrip(new Error('key', {cause: symbolKey}), transport).code, 'uncloneable-error-cause');
  });
}

test.skipIf(typeof SharedArrayBuffer === 'undefined')('structured clone retains shared memory while JSON explicitly rejects it', () => {
  const buffer = new SharedArrayBuffer(8);
  const source = new Error('shared', {cause: {buffer, view: new Uint8Array(buffer)}});
  const actual = roundTrip(source, transports[0]);
  assert.equal(actual.cause.view.buffer, actual.cause.buffer);
  actual.cause.view[0] = 19;
  assert.equal(new Uint8Array(buffer)[0], 19);
  const rejected = roundTrip(source, transports[1]);
  assert.equal(rejected.name, 'CompilerWorkerError');
  assert.equal(rejected.code, 'uncloneable-error-cause');
  assert.match(rejected.message, /shared memory.*JSON/);
});

test('legacy version-1 records retain Error cause classes, stacks and explicit primitive values', () => {
  const old = {name: 'URIError', message: 'outer', stack: 'old stack', code: 'OLD',
    diagnostics: [{message: 'diagnostic'}], eliscriptFrames: [{function: 'read'}],
    cause: {name: 'EvalError', message: 'inner', stack: 'old cause',
      cause: {name: 'RangeError', message: 'deep', truncatedCause: true}}};
  for (const wire of [structuredClone, value => JSON.parse(JSON.stringify(value))]) {
    const actual = fromErrorData(wire(old));
    assert(actual instanceof URIError);
    assert(actual.cause instanceof EvalError);
    assert(actual.cause.cause instanceof RangeError);
    assert.equal(actual.stack, 'old stack');
    assert.equal(actual.cause.stack, 'old cause');
    assert.equal(actual.cause.cause.truncatedCause, true);
    assert.equal(actual.code, 'OLD');
    assert.deepEqual(actual.diagnostics, old.diagnostics);
    assert.deepEqual(actual.eliscriptFrames, old.eliscriptFrames);
  }
  for (const primitive of primitiveValues) {
    const actual = fromErrorData(structuredClone({name: 'Error', message: 'legacy', cause: primitive}));
    assert(Object.hasOwn(actual, 'cause'));
    samePrimitive(actual.cause, primitive);
  }
  assert.equal(Object.hasOwn(fromErrorData({name: 'Error', message: 'legacy absent'}), 'cause'), false);
});

class MockWorker {
  listeners = new Map();
  failures = [];
  terminateCount = 0;
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) {this.listeners.get(name)?.delete(callback);}
  terminate() {this.terminateCount++;}
  postMessage(input) {
    const message = structuredClone(input);
    queueMicrotask(() => {
      if (message.type === 'cancel') return;
      const result = {version: compilerWorkerVersion, type: 'result', id: message.id,
        requestIdentity: message.requestIdentity, sourceIdentity: message.sourceIdentity,
        revision: message.revision, host: 'wasm'};
      if (message.type === 'source') Object.assign(result, {ok: true,
        result: {revision: message.revision, sourceIdentity: message.sourceIdentity}});
      else if (message.type === 'shutdown') result.ok = true;
      else if (this.failures.length) Object.assign(result, {ok: false, error: errorData(this.failures.shift())});
      else Object.assign(result, {ok: true, result: {javascript: 'export const answer = 42;'}});
      const event = {data: structuredClone(result)};
      for (const callback of this.listeners.get('message') ?? []) callback(event);
    });
  }
}

test('real Worker client rejects original primitive values and recovers for later requests on the same source', async () => {
  const worker = new MockWorker(), client = createCompilerWorkerClient(worker, {ownsWorker: true});
  const request = {operation: 'compile', source: '(defconst answer 42) (export answer)', filename: 'client.eli'};
  try {
    await client.setSource(request, {revision: 1});
    for (const primitive of primitiveValues) {
      worker.failures.push(primitive);
      samePrimitive((await rejection(client.request(request))).reason, primitive);
      const recovered = await client.request(request);
      assert.equal(recovered.host, 'wasm');
      assert.equal(recovered.revision, 1);
      assert.equal(recovered.result.javascript, 'export const answer = 42;');
    }
    const original = new AggregateError([], 'nested');
    original.cause = {owner: original};original.errors.push(original.cause);
    worker.failures.push(original);
    const error = (await rejection(client.request(request))).reason;
    assert(error instanceof AggregateError);
    assert.equal(error.cause.owner, error);
    assert.equal(error.errors[0], error.cause);
    assert.equal((await client.request(request)).result.javascript, 'export const answer = 42;');
  } finally {await client.close();}
  assert.equal(worker.terminateCount, 1);
  for (const listeners of worker.listeners.values()) assert.equal(listeners.size, 0);
});

class ControlledCompilerWorker extends MockWorker {
  posted = [];
  claimed = new Set();
  waiting = [];
  throwPost;
  postMessage(input) {
    if (this.throwPost && ['request','source'].includes(input.type)) {
      const error=this.throwPost;this.throwPost=undefined;throw error;
    }
    const message=structuredClone(input);this.posted.push(message);
    for(const waiter of [...this.waiting]){
      const found=this.posted.find(item=>item.type===waiter.type&&!this.claimed.has(item));
      if(found){this.claimed.add(found);this.waiting.splice(this.waiting.indexOf(waiter),1);waiter.resolve(found);}
    }
  }
  next(type) {
    const found=this.posted.find(item=>item.type===type&&!this.claimed.has(item));
    if(found){this.claimed.add(found);return Promise.resolve(found);}
    return new Promise(resolve=>this.waiting.push({type,resolve}));
  }
  emit(type,event) {for(const listener of [...(this.listeners.get(type)??[])])listener(event);}
  reply(request,extra={}) {
    this.emit('message',{data:{version:compilerWorkerVersion,type:'result',id:request.id,
      requestIdentity:request.requestIdentity,sourceIdentity:request.sourceIdentity,revision:request.revision,
      host:'wasm',ok:true,result:{accepted:true},...extra}});
  }
}
function noClientListeners(worker){for(const listeners of worker.listeners.values())assert.equal(listeners.size,0);}
async function gracefulClientClose(client,worker){
  const closing=client.close();assert.equal(client.close(),closing);
  const shutdown=await worker.next('shutdown');worker.reply(shutdown);await closing;
}

for(const type of ['request','source'])test('owned close reclaims posted '+type+' even after abort removed its pending promise',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true}),control=new AbortController();
  const reason=new Error('cancel posted '+type);
  const pending=type==='source'?client.setSource({operation:'compile',filename:'cancel.eli',source:'42'},{revision:1,signal:control.signal}):client.request({operation:'capabilities'},{signal:control.signal});
  const rejected=rejection(pending),posted=await worker.next(type);
  control.abort(reason);assert.equal((await rejected).reason,reason);
  const cancellation=await worker.next('cancel');assert.equal(cancellation.id,posted.id);
  const closing=client.close();assert.equal(client.close(),closing);await closing;
  assert.equal(worker.terminateCount,1);assert.equal(worker.posted.some(item=>item.type==='shutdown'),false);noClientListeners(worker);
});

test('an owned close rejects every live caller and terminates once without waiting for shutdown',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true});
  const one=rejection(client.request({operation:'capabilities'})),two=rejection(client.request({operation:'capabilities'}));
  await worker.next('request');await worker.next('request');await client.close();
  assert.equal((await one).reason.code,'closed');assert.equal((await two).reason.code,'closed');
  assert.equal(worker.terminateCount,1);assert.equal(worker.posted.filter(item=>item.type==='shutdown').length,0);noClientListeners(worker);
});

test('only the correctly bound result clears cancelled posted work and permits an owned graceful close',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true}),control=new AbortController();
  const rejected=rejection(client.request({operation:'capabilities'},{signal:control.signal}));
  const request=await worker.next('request');control.abort('cancelled');assert.equal((await rejected).reason,'cancelled');
  worker.reply(request);const closing=client.close();const shutdown=await worker.next('shutdown');
  assert.equal(worker.terminateCount,0,'completed work must retain the real graceful shutdown path');
  worker.reply(shutdown);await closing;assert.equal(worker.terminateCount,1);noClientListeners(worker);
});

for(const mismatch of ['version','requestIdentity','sourceIdentity','revision'])test('cancel acknowledgement or mismatched '+mismatch+' reply cannot make posted work appear idle',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true}),control=new AbortController();
  const rejected=rejection(client.request({operation:'capabilities'},{signal:control.signal}));
  const request=await worker.next('request');control.abort(false);assert.equal((await rejected).reason,false);
  worker.emit('message',{data:{version:compilerWorkerVersion,type:'cancel',id:request.id,accepted:true}});
  worker.reply(request,{[mismatch]:mismatch==='version'?compilerWorkerVersion+1:mismatch==='revision'?7:'0'.repeat(64)});
  await client.close();assert.equal(worker.terminateCount,1);assert.equal(worker.posted.some(item=>item.type==='shutdown'),false);noClientListeners(worker);
});

test('a rejected stale response retains busy ownership until a subsequent correctly bound completion',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true});
  const rejected=rejection(client.request({operation:'capabilities'})),request=await worker.next('request');
  worker.reply(request,{requestIdentity:'0'.repeat(64)});assert.equal((await rejected).reason.code,'stale-response');
  worker.reply(request);await gracefulClientClose(client,worker);assert.equal(worker.terminateCount,1);noClientListeners(worker);
});

test('a borrowed busy Worker is never terminated and retains graceful shutdown ownership',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:false});
  const rejected=rejection(client.request({operation:'capabilities'})),request=await worker.next('request');
  const closing=client.close(),shutdown=await worker.next('shutdown');assert.equal((await rejected).reason.code,'closed');
  assert.equal(worker.terminateCount,0);worker.reply(request);worker.reply(shutdown);await closing;
  assert.equal(worker.terminateCount,0);noClientListeners(worker);
});

test('a postMessage exception is not counted as posted work and malformed error values still reject their pending caller',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true});
  const original=new DOMException('original clone refusal','DataCloneError');worker.throwPost=original;
  assert.equal((await rejection(client.request({operation:'capabilities'}))).reason,original);
  const malformed=rejection(client.request({operation:'capabilities'})),request=await worker.next('request');
  worker.reply(request,{ok:false,error:{errorValue:{format:'invalid',version:1,nodes:[]}}});
  assert.equal((await malformed).reason.code,'invalid-error-value');
  await gracefulClientClose(client,worker);assert.equal(worker.terminateCount,1);noClientListeners(worker);
});

for(const ownsWorker of [false,true])test('terminal Worker errors clear posted work and preserve original failure with ownership='+ownsWorker,async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker});
  const pending=rejection(client.request({operation:'capabilities'}));await worker.next('request');
  const reason=new RangeError('original worker failure');worker.emit('error',{error:reason});
  assert.equal((await pending).reason,reason);await client.close();await client.close();
  assert.equal(worker.terminateCount,ownsWorker?1:0);assert.equal(worker.posted.some(item=>item.type==='shutdown'),false);noClientListeners(worker);
});

test('closing before identity awaits settle cannot post the request after the graceful shutdown',async()=>{
  const worker=new ControlledCompilerWorker(),client=createCompilerWorkerClient(worker,{ownsWorker:true});
  // Incremental hashing is synchronous internally, but the identity API and
  // request envelope still await its result. Close in that real boundary,
  // rather than manufacturing a pause in a WebCrypto implementation detail.
  const rejected=rejection(client.request({operation:'capabilities'}));
  const closing=client.close(),shutdown=await worker.next('shutdown');worker.reply(shutdown);await closing;
  assert.equal((await rejected).reason.code,'closed');
  assert.deepEqual(worker.posted.map(item=>item.type),['shutdown']);assert.equal(worker.terminateCount,1);noClientListeners(worker);
});

test('a real synchronously blocked Web Worker is reclaimed after cancellation through browser dispose without a shutdown response',async()=>{
  const {createBrowserCompiler}=await import('../tools/backends/compiler-browser.mjs');
  const workerSource=`let block;
function reply(message,result){postMessage({version:message.version,type:'result',id:message.id,requestIdentity:message.requestIdentity,sourceIdentity:message.sourceIdentity,revision:message.revision,host:'wasm',ok:true,result});}
addEventListener('message',event=>{const message=event.data;
 if(message.type==='arm-block'){block=message.buffer;postMessage({type:'armed'});return;}
 if(message.type==='cancel'){postMessage({type:'cancel',version:message.version,id:message.id,accepted:true});return;}
 if(message.type==='shutdown'){reply(message,{closed:true});return;}
 const request=JSON.parse(message.request);
 if(request.operation==='block-event-loop'){postMessage({type:'blocking-entered',id:message.id});Atomics.wait(new Int32Array(block),0,0);}
 reply(message,{host:'wasm',operation:request.operation});
});`;
  const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
  const worker=new Worker(url,{type:'module'}),buffer=new SharedArrayBuffer(4),view=new Int32Array(buffer);
  const terminate=worker.terminate.bind(worker);let terminated=0;worker.terminate=(...args)=>{terminated++;return terminate(...args);};
  const wait=type=>new Promise((resolve,reject)=>{
    const done=()=>{worker.removeEventListener('message',message);worker.removeEventListener('error',error);};
    const message=event=>{if(event.data?.type===type){done();resolve(event.data);}};
    const error=event=>{done();reject(event.error??new Error(event.message));};
    worker.addEventListener('message',message);worker.addEventListener('error',error);
  });
  let compiler;
  try{
    const armed=wait('armed');worker.postMessage({type:'arm-block',buffer});await armed;
    const client=createCompilerWorkerClient(worker,{ownsWorker:true});
    compiler=await createBrowserCompiler({host:'wasm',workerClient:client,ownsWorkerClient:true});
    const control=new AbortController(),reason=new Error('cancel a synchronous compiler boundary');
    const entered=wait('blocking-entered'),pending=rejection(compiler.request({operation:'block-event-loop'},{signal:control.signal}));
    await entered;control.abort(reason);assert.equal((await pending).reason,reason);
    await compiler.dispose();await compiler.dispose();assert.equal(terminated,1);
    await assert.rejects(()=>compiler.request({operation:'capabilities'}),/disposed/);
  }finally{
    // If an assertion fails, release a borrowed synchronous wait before final
    // cleanup. The successful path requires owned termination, not this wake.
    Atomics.store(view,0,1);Atomics.notify(view,0);
    try{await compiler?.dispose();}finally{if(!terminated)await worker.terminate();URL.revokeObjectURL(url);}
  }
},30000);
