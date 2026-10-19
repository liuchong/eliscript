const names = new Set([
  "URL", "Response", "Headers", "AbortController", "AbortSignal",
  "TextDecoder", "Uint8Array", "fetch", "setTimeout", "clearTimeout",
]);

// Web transport capabilities are read at the point of use. The protocol and
// representation algorithms remain in the calling Eliscript module.
export function readHttpGlobal(name) {
  if (!names.has(name)) throw new TypeError("unknown HTTP host capability");
  return globalThis[name];
}

const capabilities = Object.create(null);
for (const name of names) {
  Object.defineProperty(capabilities, name, {
    get() { return globalThis[name]; },
    enumerable: true,
  });
}
export const globals = Object.freeze(capabilities);
