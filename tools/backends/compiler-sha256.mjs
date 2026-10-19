// Streaming integrity checks for compiler artifact I/O. This module has no
// host imports and owns only one block, schedule and hash state per instance.
const ROUND_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const typedArraySet = Uint8Array.prototype.set;
const emptyBytes = new Uint8Array(0);

// Count bytes without losing integer precision beyond Number.MAX_SAFE_INTEGER.
// SHA-256 encodes a bit length strictly below 2^64, so byte counts must be <2^61.
function addCompilerSha256Bytes(length, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('compiler SHA-256 byte count must be a nonnegative safe integer');
  }
  const low = length.low + (amount % 0x100000000);
  const high = length.high + Math.floor(amount / 0x100000000) + (low >= 0x100000000 ? 1 : 0);
  if (high >= 0x20000000) {
    throw new RangeError('compiler SHA-256 message must contain fewer than 2^64 bits');
  }
  length.low = low >>> 0;
  length.high = high;
}

function writeCompilerSha256BitLength(block, length) {
  const high = ((length.high << 3) | (length.low >>> 29)) >>> 0;
  const low = (length.low << 3) >>> 0;
  block[56] = high >>> 24;
  block[57] = high >>> 16;
  block[58] = high >>> 8;
  block[59] = high;
  block[60] = low >>> 24;
  block[61] = low >>> 16;
  block[62] = low >>> 8;
  block[63] = low;
}

function rotateRight(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}

function compressCompilerSha256Block(state, words, bytes, offset) {
  for (let index = 0; index < 16; index++) {
    const at = offset + index * 4;
    words[index] = (bytes[at] << 24) | (bytes[at + 1] << 16) |
      (bytes[at + 2] << 8) | bytes[at + 3];
  }
  for (let index = 16; index < 64; index++) {
    const x = words[index - 15], y = words[index - 2];
    const small0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
    const small1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
    words[index] = (words[index - 16] + small0 + words[index - 7] + small1) >>> 0;
  }
  let a = state[0], b = state[1], c = state[2], d = state[3];
  let e = state[4], f = state[5], g = state[6], h = state[7];
  for (let index = 0; index < 64; index++) {
    const large1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);
    const large0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const first = (h + large1 + choice + ROUND_CONSTANTS[index] + words[index]) >>> 0;
    const second = (large0 + majority) >>> 0;
    h = g;g = f;f = e;e = (d + first) >>> 0;
    d = c;c = b;b = a;a = (first + second) >>> 0;
  }
  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

export function createCompilerSha256() {
  const block = new Uint8Array(64);
  const words = new Uint32Array(64);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const length = {high: 0, low: 0};
  let buffered = 0, finalized = false;

  function requireOpen() {
    if (finalized) throw new TypeError('compiler SHA-256 has already been finalized');
  }

  const hasher = Object.freeze({
    update(bytes) {
      requireOpen();
      if (!ArrayBuffer.isView(bytes) || typedArrayTag.call(bytes) !== 'Uint8Array') {
        throw new TypeError('compiler SHA-256 update requires a Uint8Array');
      }
      // A zero-length intrinsic set validates detached/out-of-bounds views
      // without changing input, invoking its methods or consulting species.
      typedArraySet.call(bytes, emptyBytes);
      const count = typedArrayLength.call(bytes);
      addCompilerSha256Bytes(length, count);
      let offset = 0;
      if (buffered !== 0) {
        while (buffered < 64 && offset < count) block[buffered++] = bytes[offset++];
        if (buffered === 64) {
          compressCompilerSha256Block(state, words, block, 0);
          buffered = 0;
        }
      }
      while (offset + 64 <= count) {
        compressCompilerSha256Block(state, words, bytes, offset);
        offset += 64;
      }
      while (offset < count) block[buffered++] = bytes[offset++];
      return hasher;
    },
    digestHex() {
      requireOpen();
      finalized = true;
      block[buffered++] = 0x80;
      if (buffered > 56) {
        block.fill(0, buffered);
        compressCompilerSha256Block(state, words, block, 0);
        buffered = 0;
      }
      block.fill(0, buffered, 56);
      writeCompilerSha256BitLength(block, length);
      compressCompilerSha256Block(state, words, block, 0);
      let result = '';
      for (const word of state) result += word.toString(16).padStart(8, '0');
      return result;
    },
  });
  return hasher;
}
