// Host boundary: bulk memory transfer and instance-scoped handles only.
// Allocation, growth, validation and UTF8 algorithms execute in the .eli module.
const messages = ["", "invalid or retired runtime handle", "runtime capacity exhausted",
  "runtime bounds or argument error", "invalid UTF8", "unpaired UTF16 surrogate",
  "string builder must be sealed", "runtime lifetime epoch exhausted"];
function fail(code) {
  const error = new Error(messages[code]);
  error.eliscriptDiagnostic = {format: "eliscript-diagnostic", version: 1,
    code: `ELI-RT${String(code).padStart(4, "0")}`, severity: "error", phase: "runtime",
    message: error.message};
  throw error;
}
function word(value, max = 0xffffffff) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max || Object.is(value, -0)) fail(3);
  return value;
}
function flag(value) { if (typeof value !== "boolean") fail(3); return Number(value); }

export function instantiateMemoryRuntime(bytes) {
  const module = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(module).length) throw new Error("memory runtime requires zero host imports");
  const e = new WebAssembly.Instance(module).exports;
  if (!(e.memory instanceof WebAssembly.Memory)) throw new Error("memory runtime must export owned memory");
  const handles = new WeakMap();
  let epoch = 0;
  const view = () => new DataView(e.memory.buffer);
  function call(name, ...args) {
    const value = e[name](...args) >>> 0;
    const code = e['last-error']();
    if (code) fail(code);
    return value;
  }
  function wrap(pointer, kind) {
    const handle = Object.freeze({kind});
    handles.set(handle, {pointer, kind, epoch});
    return handle;
  }
  function pointer(handle, kind) {
    const entry = handles.get(handle);
    if (!entry || entry.kind !== kind || entry.epoch !== epoch) fail(1);
    return entry.pointer;
  }
  function data(handle, kind) {
    const p = pointer(handle, kind);
    // Ask the owned runtime to check live membership before touching headers.
    const length = call(kind === 'buffer' ? 'buffer-length' : kind === 'string' ? 'string-length' : 'record-length', p);
    return {p, length, offset: view().getUint32(p + 16, true)};
  }
  return Object.freeze({
    buffer(input) {
      const array = Array.from(input, value => word(value, 255));
      const p = call('buffer-new', word(array.length));
      new Uint8Array(e.memory.buffer, view().getUint32(p + 16, true), array.length).set(array);
      view().setUint32(p + 8, array.length, true);
      return wrap(p, 'buffer');
    },
    string(input) {
      if (typeof input !== 'string') fail(3);
      const p = call('string-new', word(input.length)), offset = view().getUint32(p + 16, true);
      const target = view();
      for (let i = 0; i < input.length; i++) target.setUint16(offset + i * 2, input.charCodeAt(i), true);
      call('string-seal', p);
      return wrap(p, 'string');
    },
    record(input) {
      const array = Array.from(input, value => word(value));
      const p = call('record-new', word(array.length)), offset = view().getUint32(p + 16, true);
      const target = view();
      for (let i = 0; i < array.length; i++) target.setUint32(offset + i * 4, array[i], true);
      return wrap(p, 'record');
    },
    bytes(handle) {
      const {length, offset} = data(handle, 'buffer');
      return new Uint8Array(e.memory.buffer, offset, length).slice();
    },
    text(handle) {
      const {length, offset} = data(handle, 'string'), source = view();
      const chunks = [];
      for (let start = 0; start < length; start += 8192) {
        const units = [];
        for (let i = start; i < Math.min(start + 8192, length); i++) units.push(source.getUint16(offset + i * 2, true));
        chunks.push(String.fromCharCode(...units));
      }
      return chunks.join('');
    },
    words(handle) {
      const {length, offset} = data(handle, 'record'), source = view();
      return Uint32Array.from({length}, (_, i) => source.getUint32(offset + i * 4, true));
    },
    encode(handle, {strict = false} = {}) {
      return wrap(call('utf8-encode', pointer(handle, 'string'), flag(strict)), 'buffer');
    },
    decode(handle, {strict = false, preserveBOM = false} = {}) {
      return wrap(call('utf8-decode', pointer(handle, 'buffer'), flag(strict), flag(preserveBOM)), 'string');
    },
    reserve(handle, capacity) { call('buffer-reserve', pointer(handle, 'buffer'), word(capacity)); },
    push(handle, byte) { call('buffer-push', pointer(handle, 'buffer'), word(byte, 255)); },
    retire() { call('retire'); epoch++; },
  });
}
