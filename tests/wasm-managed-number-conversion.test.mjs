import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildBackends } from '../tools/backends/build.mjs';
import { instantiateManagedRuntime } from '../tools/backends/managed-runtime.mjs';

let directory, backend, runtimeProgram;
const compiled = new Map();
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-managed-number-conversion-'));
  backend = await buildBackends({ outputRoot: directory });
  runtimeProgram = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
}, 120000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function runtime(name, source, options) {
  if (!compiled.has(name)) {
    const ir = backend.compiler.compile_ir_string(source, `${name}.eli`);
    const snapshot = JSON.stringify(ir);
    let emission;
    try { emission = backend.managed.emit_managed_wasm(ir, runtimeProgram); }
    catch (error) { console.error(JSON.stringify(error.eliscriptDiagnostic)); throw error; }
    const bytes = Uint8Array.from(emission);
    assert.equal(JSON.stringify(ir), snapshot);
    assert(WebAssembly.validate(bytes));
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
    compiled.set(name, bytes);
  }
  const api = instantiateManagedRuntime(compiled.get(name), options);
  api.auto(1);
  return api;
}
const parseSource = '(defun parse (value) (string-to-number value)) (export parse)';
const textSource = '(defun text (value) (str value)) (export text)';
const box = (api, value) => typeof value === 'string' ? api.string(value) : typeof value === 'number' ? api.number(value) : value;
function check(api, name, input, expected) {
  const value = box(api, input);
  let result;
  try {
    result = api.invoke(name, [value]);
    const actual = result.kind === 4 ? api.readNumber(result) : api.readString(result);
    assert(Object.is(actual, expected), `${name}(${JSON.stringify(input)}): ${String(actual)} versus ${String(expected)}`);
  } finally {
    if (result) api.release(result);
    api.release(value);
  }
  api.collect();
  assert.equal(api.live(), 0);
  assert.equal(api.stats().frameDepth, 0);
}
const whitespace = '\u0009\u000a\u000b\u000c\u000d \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
const tokens = ['', ' ', whitespace, '-0', '+0', '-0.0e999999', '0e-999999', '.5', '1.', '+1.25e-3', '-1E+3', 'Infinity', '+Infinity', '-Infinity', 'NaN', 'inf', 'infinity', '1e', '1e+', '+', '-', '.', '1_000', '1n', '0x', '-0x1', '+0x1', '0x10', '0Xffffffffffffffff', '0b101', '0B1', '0o377', '0O1', '0b2', '0o8', '00', '08', '0123', '1 2', '1\0', '\u00851', '\u180e1', '\ud800', '１', '١', '1e999999', '-1e999999', '1e-999999', '-1e-999999', '9007199254740991', '9007199254740992', '9007199254740993', '9007199254740995', '1.7976931348623157e308', '1.7976931348623159e308', '2.2250738585072014e-308', '2.2250738585072012e-308', '5e-324', '2e-324', '3e-324'];
function scaledDecimal(integer, scale) {
  const digits = integer.toString().padStart(scale + 1, '0');
  return scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits;
}
// Exact decimal spelling of a binary rational and its adjacent decimal units.
function binaryDecimal(integer, exponent, delta = 0n) {
  return exponent >= 0 ? ((integer << BigInt(exponent)) + delta).toString() : scaledDecimal(integer * 5n ** BigInt(-exponent) + delta, -exponent);
}
function random(seed) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
}

test('primitive Number conversion preserves complete string grammar, whitespace, IEEE values and exact zero signs under GC', () => {
  const api = runtime('number-parse', parseSource);
  for (const input of [null, false, true, undefined, NaN, Infinity, -Infinity, -0, Number.MIN_VALUE, Number.MAX_VALUE, ...tokens]) check(api, 'parse', input, Number(input));
  for (const input of tokens) check(api, 'parse', whitespace + input + whitespace, Number(whitespace + input + whitespace));
});

test('decimal-to-binary rounding handles exact ties and adjacent decimals across the binary64 exponent range', () => {
  const api = runtime('number-parse', parseSource);
  const exponents = new Set([-1075, -1074, -1023, -1022, -53, -52, -1, 0, 1, 52, 53, 969, 970]);
  for (let exponent = -1075; exponent <= 970; exponent += 17) exponents.add(exponent);
  for (const exponent of exponents) {
    for (const significand of [1n, (1n << 53n) - 1n, (1n << 53n) + 1n]) for (const delta of [-1n, 0n, 1n]) {
      const input = binaryDecimal(significand, exponent, delta);
      check(api, 'parse', input, Number(input));
      check(api, 'parse', '-' + input, Number('-' + input));
    }
  }
  const tie = binaryDecimal(1n, -1075);
  check(api, 'parse', tie, 0);
  check(api, 'parse', '-' + tie, -0);
  check(api, 'parse', binaryDecimal(1n, -1075, 1n), Number.MIN_VALUE);
  check(api, 'parse', binaryDecimal(3n, -1075), 2 * Number.MIN_VALUE);
});

test('long coefficients, balanced exponents and nondecimal integers retain every rounding digit and reject trailing invalid data', () => {
  const api = runtime('number-parse', parseSource, { maxSlots: 256, initialBytes: 65536, maxBytes: 4194304 });
  const inputs = ['0'.repeat(4096) + '1', '1' + '0'.repeat(4096) + 'e-4096', '0.' + '0'.repeat(4096) + '1e4097', '1.' + '0'.repeat(4096) + '1', '0x' + 'f'.repeat(512), '0b1' + '0'.repeat(1075), '0o' + '7'.repeat(400), '1e' + '0'.repeat(4096) + '2'];
  for (const input of inputs) {
    check(api, 'parse', input, Number(input));
    check(api, 'parse', input + 'x', NaN);
  }
});

test('random decimal grammar and radix strings agree exactly with independent Number conversion', () => {
  const api = runtime('number-parse', parseSource);
  const next = random(0xac3b79d5);
  for (let i = 0; i < 1024; i++) {
    const digits = Array.from({ length: 1 + next() % 96 }, () => String(next() % 10)).join('');
    const point = next() % (digits.length + 1);
    const input = (next() & 1 ? '-' : '') + digits.slice(0, point) + '.' + digits.slice(point) + 'e' + (next() % 1201 - 600);
    check(api, 'parse', input, Number(input));
    const radix = [2, 8, 16][next() % 3], prefix = radix === 2 ? '0b' : radix === 8 ? '0o' : '0x';
    const text = prefix + Array.from({ length: 1 + next() % 128 }, () => (next() % radix).toString(radix)).join('');
    // Direct Number(string) on some hosts loses a carry in long radix tokens.
    // BigInt parses the integer exactly before the independent f64 conversion.
    check(api, 'parse', text, Number(BigInt(text)));
  }
});

test('Number text is shortest roundtripping ECMAScript spelling with exact exponent cutoffs and primitive identities', () => {
  const api = runtime('number-text', textSource);
  for (const input of [null, false, true, undefined, '', '中😀\ud800', NaN, Infinity, -Infinity, -0, Number.MIN_VALUE, Number.MAX_VALUE, 1e-7, 1e-6, 1e20, 1e21, .1, .5, 1000000000000000100, 2 ** 53 - 1, 2 ** 53, 2 ** 53 + 2]) check(api, 'text', input, String(input));
  const next = random(0x9f43bb71), view = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 2048; i++) {
    view.setUint32(0, next(), true); view.setUint32(4, next(), true);
    const value = view.getFloat64(0, true);
    check(api, 'text', value, String(value));
  }
});

test('existing concat and numeric object property keys use complete finite Number text rather than rejecting fractional or large values', () => {
  const api = runtime('number-property-text', '(defun concat (value) (js-call "n=" :concat value)) (defun key (value) (let ((object (js-object))) (put object value "ok") (get object value))) (export concat key)');
  for (const value of [.5, -.5, 1e-7, 1e-6, 1e20, 1e21, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity, -0]) {
    check(api, 'concat', value, 'n=' + String(value));
    check(api, 'key', value, 'ok');
  }
});

test('source string positions convert decimal/radix/invalid text with each method exact clamp and NaN defaults', () => {
  const api = runtime('number-positions', '(defun at (position) (js-call "abcdef" :at position)) (defun code (position) (js-call "abcdef" :charCodeAt position)) (defun last (position) (js-call "ababa" :lastIndexOf "a" position)) (defun slice (position) (js-call "abcdef" :slice position)) (export at code last slice)');
  for (const position of ['', '1', '-1', '1.9', '-1.9', '0x2', '0b10', whitespace + '2' + whitespace, 'NaN', 'Infinity', '-Infinity', 'invalid', '5e-324']) {
    check(api, 'code', position, 'abcdef'.charCodeAt(position));
    check(api, 'last', position, 'ababa'.lastIndexOf('a', position));
    check(api, 'slice', position, 'abcdef'.slice(position));
    const value = box(api, position); let result;
    try { result = api.invoke('at', [value]); assert.equal(result === undefined ? result : api.readString(result), 'abcdef'.at(position)); }
    finally { if (result !== undefined) api.release(result); api.release(value); }
    api.collect(); assert.equal(api.live(), 0); assert.equal(api.stats().frameDepth, 0);
  }
});

const longHex = '0xbcf8f9bdba22840724d028768a8a77b3e6b0f283670085477910eccc4e9d6b278a11db79c280d4e9c237774812029ac7ce82daaafca38';
test('generated JS primitive conversion agrees with exact nondecimal integer rounding under Bun', async () => {
  const program = backend.compiler.compile_ir_string(parseSource, 'js-number-parse.eli');
  const module = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
  assert.equal(module.parse(longHex), Number(BigInt(longHex)));
});


test('conversion captures each operand once, converts str arguments before later effects and keeps empty str and borrowed string identity', () => {
  const api = runtime('number-conversion-order', '(defun order (a b) (str a (setq a b) a)) (defun empty () (str)) (defun identity (a) (str a)) (defun capture (a b) (let ((first (string-to-number a))) (setq a b) (+ first (string-to-number a)))) (export order empty identity capture)');
  for (const [first, second] of [[.5, 1e21], ['中😀', '-0'], [null, undefined], [true, false]]) {
    const a = box(api, first), b = box(api, second);
    const out = api.invoke('order', [a, b]);
    assert.equal(api.readString(out), String(first) + String(second) + String(second));
    api.release(out); api.release(a); api.release(b); api.collect(); assert.equal(api.live(), 0);
  }
  const empty = api.invoke('empty'); assert.equal(api.readString(empty), ''); api.release(empty);
  const input = api.string('中😀\ud800'), output = api.invoke('identity', [input]);
  assert(api.keyEqual(input, output)); api.release(input); assert.equal(api.readString(output), '中😀\ud800'); api.release(output);
  const a = api.string('1.5'), b = api.string('2.5'), sum = api.invoke('capture', [a, b]);
  assert.equal(api.readNumber(sum), 4); for (const value of [a, b, sum]) api.release(value);
  api.collect(); assert.equal(api.live(), 0); assert.equal(api.stats().frameDepth, 0);
});

test('raw Number and text conversions reject unfinished strings and private frames while retaining borrowed arguments through allocating GC', () => {
  runtime('number-parse', parseSource);
  const e = new WebAssembly.Instance(new WebAssembly.Module(compiled.get('number-parse'))).exports;
  const heap = e['heap-new'](64, 4096, 65536);
  const call = (name, ...args) => { const value = e[name](heap, ...args) >>> 0; assert.equal(e['last-error'](), 0, name); return value; };
  const source = call('value-string', 3);
  for (const [i, unit] of [...'1.5'].entries()) call('value-unit-set', source, i, unit.charCodeAt(0));
  e['value-to-number'](heap, source); assert.equal(e['last-error'](), 6);
  call('value-seal', source); call('heap-auto', 1);
  const number = call('value-to-number', source); call('heap-pin', source); call('heap-pin', number);
  assert.equal(new DataView(e.memory.buffer).getFloat64(call('value-data', number, 4), true), 1.5);
  const text = call('value-to-text', number); call('heap-pin', text);
  const p = call('value-data', text, 5); assert.equal(new DataView(e.memory.buffer).getUint16(p + 2, true), 46);
  const frame = call('frame-new', 1); call('frame-set', frame, 0, source);
  e['value-to-number'](heap, frame); assert.equal(e['last-error'](), 3); assert.equal(call('frame-depth'), 1);
  call('frame-pop', frame);
  for (const value of [source, number, text]) call('heap-release', value);
  call('heap-collect'); assert.equal(call('heap-live'), 0);
});

test('conversion capacity failures preserve exact input bits and caller roots, while successful growth reloads all pool addresses', () => {
  const options = { maxSlots: 64, initialBytes: 4096, maxBytes: 4096 };
  const parse = runtime('number-parse', parseSource, options), input = '1.' + '0'.repeat(400) + '1';
  const source = parse.string(input), frame = parse.frame(1); parse.frameSet(frame, 0, source);
  assert.throws(() => parse.invoke('parse', [source]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
  assert.equal(parse.readString(source), input); assert.equal(parse.stats().frameDepth, 1);
  parse.leaveFrame(frame); parse.release(source); parse.collect(); assert.equal(parse.live(), 0);
  const format = runtime('number-text', textSource, options), number = format.number(Number.MIN_VALUE), fill = format.bytes(new Uint8Array(800));
  const outer = format.frame(1); format.frameSet(outer, 0, number);
  assert.throws(() => format.invoke('text', [number]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
  assert.equal(format.readNumber(number), Number.MIN_VALUE); assert.equal(format.stats().frameDepth, 1);
  format.leaveFrame(outer); format.release(number); format.release(fill); format.collect(); assert.equal(format.live(), 0);
  const growing = runtime('number-parse', parseSource, { ...options, maxBytes: 65536 }), original = growing.string(input);
  const result = growing.invoke('parse', [original]); assert.equal(growing.readNumber(result), Number(input));
  assert.equal(growing.readString(original), input); assert(growing.stats().capacityBytes > 4096);
  growing.release(original); growing.release(result); growing.collect(); assert.equal(growing.live(), 0);
});

test('earlier conversion errors suppress later genuine traps and true WASM conversion traps unwind only their private frames', async () => {
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const start = source.indexOf('  (defun number-big-round '), end = source.indexOf('  (defun number-text-digit ', start);
  assert(start >= 0 && end > start);
  const injected = backend.compiler.compile_ir_string(source.slice(0, start) + '  (defun number-big-round (a b temporary output sign) (load-u32 4294967295))\n' + source.slice(end), 'trap-runtime.eli');
  const program = backend.compiler.compile_ir_string('(defun fault (value) (str (string-to-number value) (string-to-number "1"))) (export fault)', 'conversion-trap.eli');
  const api = instantiateManagedRuntime(Uint8Array.from(backend.managed.emit_managed_wasm(program, injected))); api.auto(1);
  const input = api.string('1'), invalid = api.sourceObject({}), outer = api.frame(1); api.frameSet(outer, 0, input);
  assert.throws(() => api.invoke('fault', [invalid]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0003');
  assert.equal(api.stats().frameDepth, 1);
  assert.throws(() => api.invoke('fault', [input]), error => error instanceof WebAssembly.RuntimeError);
  assert.equal(api.stats().frameDepth, 1); assert.equal(api.readString(input), '1');
  api.leaveFrame(outer); api.release(input); api.release(invalid); api.collect(); assert.equal(api.live(), 0);
});

test('unsupported coercions, malformed conversion IR, stale handles and cross-instance values are refused with unchanged input IR', () => {
  const api = runtime('number-parse', parseSource), other = runtime('number-parse', parseSource);
  const object = api.sourceObject({}), foreign = other.string('1');
  assert.throws(() => api.invoke('parse', [object]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0003');
  assert.throws(() => api.invoke('parse', [foreign]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0001');
  other.release(foreign); other.collect(); api.release(object); api.collect(); assert.equal(api.live(), 0);
  const stale = api.string('1'); api.release(stale); api.collect();
  assert.throws(() => api.invoke('parse', [stale]), error => error.eliscriptDiagnostic?.code === 'ELI-RT0001');
  const ir = backend.compiler.compile_ir_string(parseSource, 'invalid-conversion.eli');
  let call; const visit = value => { if (!value || typeof value !== 'object' || call) return; if (value.kind === 'intrinsic' && value.value === 'string-to-number') call = value; else for (const child of Object.values(value)) visit(child); };
  visit(ir); assert(call); call.children = []; const saved = JSON.stringify(ir);
  assert.throws(() => backend.managed.emit_managed_wasm(ir, runtimeProgram), error => error.eliscriptDiagnostic?.code === 'ELI-B0001' && error.eliscriptDiagnostic.location.file === 'invalid-conversion.eli');
  assert.equal(JSON.stringify(ir), saved);
});

test('Node independently executes the same zero-import Number conversions with exact radix rounding, negative zero, formatting and complete root cleanup', async () => {
  runtime('number-parse', parseSource); runtime('number-text', textSource);
  const parsePath = resolve(directory, 'parse.wasm'), textPath = resolve(directory, 'text.wasm');
  await writeFile(parsePath, compiled.get('number-parse')); await writeFile(textPath, compiled.get('number-text'));
  const result = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
    import {instantiateManagedRuntime} from ${JSON.stringify(resolve('tools/backends/managed-runtime.mjs'))};
    const p=instantiateManagedRuntime(readFileSync(${JSON.stringify(parsePath)})),t=instantiateManagedRuntime(readFileSync(${JSON.stringify(textPath)}));p.auto(1);t.auto(1);
    for(const value of [${JSON.stringify(longHex)}, '-0','5e-324','2.2250738585072012e-308','1.7976931348623157e308','0b11','invalid']){const input=p.string(value),out=p.invoke('parse',[input]);assert(Object.is(p.readNumber(out),Number(value)));p.release(input);p.release(out);}
    for(const value of [Number.MIN_VALUE,Number.MAX_VALUE,NaN,Infinity,-Infinity,-0,1e21,1e-6,1000000000000000100]){const input=t.number(value),out=t.invoke('text',[input]);assert.equal(t.readString(out),String(value));t.release(input);t.release(out);}
    for(const a of [p,t]){a.collect();assert.equal(a.live(),0);assert.equal(a.stats().frameDepth,0);}
  `], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});

test('private integer precision kernels match an independent BigInt model across wide carries, shifts, subtraction and binary64 rounding', async () => {
  const names = ['number-big-init', 'number-big-copy', 'number-big-shift', 'number-big-multiply', 'number-big-subtract', 'number-big-compare', 'number-big-bits', 'number-big-add', 'number-big-round'];
  const source = await readFile('bootstrap/runtime/memory.eli', 'utf8');
  const ir = backend.compiler.compile_ir_string(source + `\n(export ${names.join(' ')})\n`, 'integer-model.eli');
  const bytes = Uint8Array.from(backend.wasm.emit_memory_wasm(ir));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  const e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const view = new DataView(e.memory.buffer), a = 10000, b = 11000, temporary = 12000, output = 13000, capacity = 128;
  const call = (name, ...args) => { const out = e[name](...args) >>> 0; assert.equal(e['last-error'](), 0, name); return out; };
  const write = (p, value) => { call('number-big-init', p, capacity, 0, 0); let i = 0; while (value) { view.setUint16(p + 8 + i * 2, Number(value & 65535n), true); value >>= 16n; i++; } view.setUint32(p, i, true); };
  const read = p => { let result = 0n; for (let i = view.getUint32(p, true) - 1; i >= 0; i--) result = (result << 16n) + BigInt(view.getUint16(p + 8 + i * 2, true)); return result; };
  const next = random(0x39bf5ed1);
  for (let i = 0; i < 512; i++) {
    let value = 0n; for (let j = 0, count = next() % 48; j < count; j++) value = (value << 32n) + BigInt(next());
    const operand = BigInt(next()), factor = 1 + next() % 32768, carry = next() % 65536, shift = next() % 128;
    write(a, value); write(b, operand); write(temporary, 0n);
    assert.equal(call('number-big-bits', a), value === 0n ? 0 : value.toString(2).length);
    assert.equal(call('number-big-compare', a, b), value < operand ? 0 : value === operand ? 1 : 2);
    call('number-big-copy', temporary, a); assert.equal(read(temporary), value);
    call('number-big-multiply', a, factor, carry); assert.equal(read(a), value * BigInt(factor) + BigInt(carry));
    write(a, value); call('number-big-shift', a, shift); assert.equal(read(a), value << BigInt(shift));
    write(a, value); call('number-big-add', a, b); assert.equal(read(a), value + operand);
    call('number-big-subtract', a, b); assert.equal(read(a), value);
    write(a, value); write(b, 1n); write(temporary, 0n);
    if (value !== 0n) { call('number-big-round', a, b, temporary, output, 0); assert(Object.is(view.getFloat64(output, true), Number(value))); }
  }
});

test('seed and self-hosted JS conversion bytes match, ignore local constructor shadowing, evaluate once and retain object and Symbol conversion behavior', async () => {
  const source = parseSource + '\n(defun shadow (Number BigInt value) (string-to-number value)) (defun once (counter value) (string-to-number (progn (put counter :calls (1+ (get counter :calls))) value))) (export shadow once)';
  const path = resolve(directory, 'js-number-input.eli'), output = resolve(directory, 'js-number-seed.mjs');
  await writeFile(path, source);
  const child = spawnSync(resolve('bin/eliscript-seed'), ['--output', output, path], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  const seed = await readFile(output, 'utf8'), ir = backend.compiler.compile_ir_string(source, path);
  assert.equal(backend.compiler.emit_ir_string(ir), seed);
  const js = await import('data:text/javascript;base64,' + Buffer.from(seed).toString('base64'));
  const unexpected = () => { throw Error('constructor parameter shadowed primitive'); };
  assert.equal(js.shadow(unexpected, unexpected, longHex), Number(BigInt(longHex)));
  const counter = { calls: 0 }; assert.equal(js.once(counter, longHex), Number(BigInt(longHex))); assert.equal(counter.calls, 1);
  const trace = []; const object = { [Symbol.toPrimitive](hint) { trace.push(hint); return '-0'; } };
  assert(Object.is(js.parse(object), -0)); assert.deepEqual(trace, ['number']);
  assert.throws(() => js.parse(Symbol('number')), TypeError);
  for (const value of ['0x', '+0xff', '-0xff', '0b2', '0o8', '0xffn', '0x1_0', '0xffz']) assert(Number.isNaN(js.parse(value)));
  const plain = backend.compiler.emit_ir_string(backend.compiler.compile_ir_string('(defun identity (value) value) (export identity)', 'plain.eli'));
  assert(!plain.includes('__eliscript_to_number'));
  const node = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'; const js=await import(${JSON.stringify(pathToFileURL(output).href)});
    const input=${JSON.stringify(longHex)},expected=Number(BigInt(input));assert.equal(js.parse(input),expected);assert.equal(js.shadow(()=>{throw Error('Number');},()=>{throw Error('BigInt');},input),expected);const counter={calls:0};assert.equal(js.once(counter,input),expected);assert.equal(counter.calls,1);
  `], { encoding: 'utf8', timeout: 30000 });
  assert.equal(node.status, 0, node.stderr);
});
