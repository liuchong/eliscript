import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import * as publicApi from '../tools/backends/compiler-sha256.mjs';

const {createCompilerSha256} = publicApi;
const encoder = new TextEncoder();
const moduleURL = new URL('../tools/backends/compiler-sha256.mjs', import.meta.url);
const cryptoHex = bytes => createHash('sha256').update(bytes).digest('hex');

function digestChunks(bytes, size) {
  const hash = createCompilerSha256();
  hash.update(new Uint8Array(0));
  for (let offset = 0; offset < bytes.length; offset += size) {
    assert.equal(hash.update(bytes.subarray(offset, offset + size)), hash);
  }
  hash.update(new Uint8Array(0));
  const result = hash.digestHex();
  assert.match(result, /^[0-9a-f]{64}$/);
  return result;
}

function randomBytes(length, seed) {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < length; index++) {
    state ^= state << 13;state ^= state >>> 17;state ^= state << 5;
    bytes[index] = state & 255;
  }
  return bytes;
}

test('compiler SHA-256 matches NIST empty, abc, multiblock and million-a vectors', () => {
  assert.deepEqual(Object.keys(publicApi), ['createCompilerSha256']);
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno' +
      'ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ];
  for (const [message, expected] of vectors) {
    const bytes = encoder.encode(message);
    assert.equal(cryptoHex(bytes), expected);
    for (const size of [1, 3, 7, 55, 56, 63, 64, 65, 4096]) {
      assert.equal(digestChunks(bytes, size), expected, 'NIST chunk size ' + size);
    }
  }
  const millionA = new Uint8Array(1_000_000).fill(97);
  const expected = 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0';
  assert.equal(cryptoHex(millionA), expected);
  assert.equal(digestChunks(millionA, 4093), expected);
  assert.equal(digestChunks(millionA, millionA.length), expected);
});

test('every split around padding and compression boundaries equals node:crypto', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129]) {
    const bytes = randomBytes(length, 0x454c4900 + length), expected = cryptoHex(bytes);
    for (let cut = 0; cut <= length; cut++) {
      const hash = createCompilerSha256();
      hash.update(bytes.subarray(0, cut));
      hash.update(new Uint8Array(0));
      hash.update(bytes.subarray(cut));
      assert.equal(hash.digestHex(), expected, 'length ' + length + ', cut ' + cut);
    }
  }
  const bytes = randomBytes(257, 0x13579bdf), expected = cryptoHex(bytes);
  for (let size = 1; size <= 65; size++) assert.equal(digestChunks(bytes, size), expected);
});

test('deterministic random data from zero through one MiB matches crypto in varied chunks', () => {
  const lengths = [0, 2, 3, 7, 31, 55, 56, 63, 64, 65, 255, 256, 1023, 4097,
    65535, 65536, 1048575, 1048576];
  let seed = 0x243f6a88;
  for (let index = 0; index < 12; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lengths.push(seed % 1048577);
  }
  for (const length of lengths) {
    const bytes = randomBytes(length, seed ^ length), expected = cryptoHex(bytes);
    assert.equal(digestChunks(bytes, length + 1), expected);
    const hash = createCompilerSha256();
    let offset = 0, chunks = 0;
    while (offset < bytes.length) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const end = Math.min(bytes.length, offset + 1 + (seed % 4097));
      hash.update(bytes.subarray(offset, end));offset = end;chunks++;
      if ((chunks & 7) === 0) hash.update(new Uint8Array(0));
    }
    assert.equal(hash.digestHex(), expected, 'random chunks, length ' + length);
  }
});

test('updates consume caller views immediately and independent instances never share state', () => {
  for (const length of [1, 55, 64, 65, 129, 4097]) {
    const backing = randomBytes(length + 19, length), view = backing.subarray(7, 7 + length);
    const expected = cryptoHex(view), hash = createCompilerSha256();
    hash.update(view);
    backing.fill(0);
    assert.equal(hash.digestHex(), expected, 'caller mutation, length ' + length);
  }
  const first = createCompilerSha256(), second = createCompilerSha256();
  first.update(encoder.encode('a'));second.update(encoder.encode('different'));
  first.update(encoder.encode('bc'));
  assert.equal(first.digestHex(), cryptoHex(encoder.encode('abc')));
  second.update(encoder.encode(' message'));
  assert.equal(second.digestHex(), cryptoHex(encoder.encode('different message')));
  const crossRealm = runInNewContext('new Uint8Array([97, 98, 99])');
  assert.equal(createCompilerSha256().update(crossRealm).digestHex(), cryptoHex(encoder.encode('abc')));
  const overridden = encoder.encode('abc');
  Object.defineProperties(overridden, {
    length: {get() {throw new Error('must not observe caller length');}},
    subarray: {get() {throw new Error('must not observe caller subarray');}},
    constructor: {get() {throw new Error('must not observe caller species');}},
    [Symbol.toStringTag]: {value: 'spoofed'},
  });
  assert.equal(createCompilerSha256().update(overridden).digestHex(), cryptoHex(encoder.encode('abc')));
});

test('invalid updates do not mutate the hash and finalization is single use', () => {
  const fake = new Uint16Array([1, 2]);
  Object.defineProperty(fake, Symbol.toStringTag, {value: 'Uint8Array'});
  const detached = new Uint8Array([1, 2, 3]);
  structuredClone(detached.buffer, {transfer: [detached.buffer]});
  const invalid = [undefined, null, false, 17, 'abc', [], {}, new ArrayBuffer(3),
    new DataView(new ArrayBuffer(3)), new Uint16Array(3), new Uint8ClampedArray(3),
    new Proxy(new Uint8Array(3), {}), fake, detached];
  const hash = createCompilerSha256();
  hash.update(encoder.encode('a'));
  for (const value of invalid) assert.throws(() => hash.update(value), TypeError);
  hash.update(encoder.encode('bc'));
  assert.equal(hash.digestHex(), cryptoHex(encoder.encode('abc')));
  assert.throws(() => hash.digestHex(), /already been finalized/);
  assert.throws(() => hash.update(encoder.encode('later')), /already been finalized/);
  assert.throws(() => hash.update(new Uint8Array(0)), /already been finalized/);
  assert.throws(() => hash.update(null), /already been finalized/);
  const empty = createCompilerSha256();
  assert.equal(empty.digestHex(), cryptoHex(new Uint8Array(0)));
  assert.throws(() => empty.digestHex(), TypeError);
});

test('actual private length arithmetic and padding encode high 32 bits without a huge allocation', async () => {
  // Expose only these actual pure helpers in a test-local module. The public
  // hasher has no state injection API; this proves arithmetic/padding, not that
  // a multi-GiB artifact was read, compressed or accepted.
  const source = await readFile(moduleURL, 'utf8');
  const helpers = await import('data:text/javascript;base64,' + Buffer.from(source +
    '\nexport {addCompilerSha256Bytes, writeCompilerSha256BitLength};\n').toString('base64'));
  const {addCompilerSha256Bytes: add, writeCompilerSha256BitLength: write} = helpers;
  for (const bytes of [0n, 1n, 55n, 56n, 63n, 64n, 65n, 0x1fffffffn, 0x20000000n,
    0xffffffffn, 0x100000000n, 0x100000001n, 0x123456789abcdefn, 0x1fffffffffffffffn]) {
    const length = {high: Number(bytes >> 32n), low: Number(bytes & 0xffffffffn)};
    const block = new Uint8Array(64).fill(0xa5);
    write(block, length);
    assert.deepEqual([...block.subarray(0, 56)], Array(56).fill(0xa5));
    assert.equal(Buffer.from(block).readBigUInt64BE(56), bytes * 8n);
  }
  const carried = {high: 0, low: 0xfffffff0};
  add(carried, 48);assert.deepEqual(carried, {high: 1, low: 32});
  add(carried, 0x100000005);assert.deepEqual(carried, {high: 2, low: 37});
  const maximum = {high: 0x1fffffff, low: 0xfffffffe};
  add(maximum, 1);assert.deepEqual(maximum, {high: 0x1fffffff, low: 0xffffffff});
  const before = {...maximum};
  assert.throws(() => add(maximum, 1), /fewer than 2\^64 bits/);
  assert.deepEqual(maximum, before);
  for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => add(maximum, amount), RangeError);
    assert.deepEqual(maximum, before);
  }
});

test('an independent real Node process compares the portable module with node:crypto', () => {
  const script = `import assert from 'node:assert/strict';
    import {createHash} from 'node:crypto';
    assert.equal(process.release.name,'node');assert.equal(process.versions.bun,undefined);
    const {createCompilerSha256}=await import(process.argv[1]);
    for(const length of[0,3,55,56,63,64,65,1048576]){
      const bytes=new Uint8Array(length);for(let i=0;i<length;i++)bytes[i]=(i*37+11)&255;
      const expected=createHash('sha256').update(bytes).digest('hex');
      const hash=createCompilerSha256();
      for(let start=0;start<length;start+=131)hash.update(bytes.subarray(start,start+131));
      assert.equal(hash.digestHex(),expected);
    }`;
  const result = spawnSync(process.env.NODE ?? 'node', ['--input-type=module', '-e', script, moduleURL.href],
    {encoding: 'utf8', timeout: 30000, maxBuffer: 65536});
  assert.equal(result.error, undefined);assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
});
