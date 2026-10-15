# Native memory-u32 ABI

The experimental `arm64-macos` emitter can produce a Mach-O object or a
self-contained, signed dynamic library from the existing `eliscript:memory32`
capability imports. `emit_native_memory_object(ir, target)` and
`emit_native_memory_library(ir, target)` validate the full canonical program.
The numeric-f64 APIs retain their existing calling convention.

Memory functions accept unsigned 32-bit source parameters and return an unsigned
32-bit word. Floating-point loads, stores, arithmetic and locals use IEEE f64
inside these functions. Nonparameter locals start at zero, including f64 +0,
matching the existing typed WASM contract. The instructions read and write little-endian bytes,
accept unaligned offsets and check every access width without wrapping the
address addition. Stores evaluate both operands before the bounds check.

A C ABI caller supplies a trusted 32-byte context pointer as the first argument.
Its aligned fields are the byte mapping pointer at offset 0, current byte length
at 8, capacity at 16 (each u64), and trap status at 24 (u32). The two lengths must
be page multiples, current length must not exceed capacity, and capacity must not
exceed 4 GiB. The mapping must remain allocated and unmoved throughout a call.
Remaining arguments use w1 through w7, then Darwin's packed u32 stack arguments;
the result uses w0. Internal calls share the context. No compiler-generated
function imports a host operation or exposes raw pointers to source code.

`openNativeMemory(path, exportArities, {initialPages, maximumPages})` in
`tools/backends/native-memory.mjs` supplies this mapping through Bun FFI. It owns
fixed-capacity backing storage, keeps both pointers private and retains their
owners until `close()`. `invoke(name, ...u32Args)` validates arity and values,
clears prior status and converts bounds/division traps to `WebAssembly.RuntimeError`.
`read(offset, length)` returns a copy; `write(Uint8Array, offset)` checks the
current bounds. `byteLength` reports the current logical size. Closed instances
reject access; mappings are independent. Calls are synchronous.

`memory-grow` returns the previous page count or `0xffffffff` on failure, zeroes
newly visible bytes and never moves the backing store. `memory-size` returns the
current page count. Out-of-bounds loads/stores and division by zero abort the
current source call chain while retaining earlier writes and operand effects.

`emit_typed_native_memory_object(typed, target)` and
`emit_typed_native_memory_library(typed, target)` also accept the existing
memory-u32 function table, indirect signature declarations and export aliases.
Each table slot holds a code-relative target and its word arity; generated calls
check the evaluated slot and signature before executing an ARM64 `BLR`. All
arguments, including the final table index, evaluate before those checks.
`call-source` uses its existing four-word source calling convention. Invalid
slots, signature mismatches and nested memory traps abort the source call chain.
Raw memory lowering declares an empty table, so a raw `call-source` traps unless
a typed producer supplies its real table. Export aliases use direct word
wrappers and do not change source or table indices.

A trap interrupts runtime frame cleanup in both WASM and native execution.
A managed caller records `frame-current` before invocation and uses
`frame-unwind` after catching a trap, before continuing or collecting the heap.
The generic memory adapter does not silently discard managed frames. The
focused native test covers this boundary and confirms that all released roots
are reclaimed after unwinding.

This slice includes direct/indirect calls, word arithmetic/comparisons, the eight
memory load/store capabilities, memory size/growth and explicit traps. The full
managed runtime and existing managed lowering execute object captures and
escaping closures through this table, including automatic GC and root release.
A native compiler entry point, standalone memory executable, full compiler 3×3
matrix and performance acceptance remain open.

## Native managed host boundary

`instantiateNativeManagedRuntime(path, lowered, options)` in
`tools/backends/native-managed-runtime.mjs` asynchronously loads the real dynamic
library using its existing `{typed, descriptor}` lowering record. The path and
record must belong to the same compilation; the record supplies word arities,
export aliases and the existing managed-control-v1 or managed-module-v1
descriptor. The loader snapshots this metadata and checks required runtime
exports and descriptor arities before execution. It does not infer C function
signatures from machine code or construct a WASM execution wrapper.

The returned API has the same handles, Number/text/bytes/array/object/collection,
frames, module initialization, invocation and explicit root operations as
`instantiateManagedRuntime`. Both loaders use `managed-host.mjs` for these
semantics; WASM retains direct access to its real owned memory while native uses
checked reads and writes on its private mapping. Heap algorithms and source
functions execute entirely in emitted native instructions. Source exceptions
retain their managed identity, primitive values and Error prototypes; numeric
runtime failures keep the existing ELI-RT codes and host error classes. A real
native memory trap unwinds only the invocation's private managed frames.

Native `close()` is idempotent, performs the shared runtime cleanup and releases
the library and mapping even if cleanup fails. All subsequent API operations
reject use of the closed instance. `closeModule()` retains its existing meaning:
external handles remain valid until explicitly released or the native instance
is closed. The shared host factory owns an internal `lifecycle.dispose` hook so
additional compiled-runtime root cleanup can be integrated in one place.
Initialization failure also disposes the native mapping while preserving the
original thrown value. Instances cannot consume each other's handles, and a
getter that closes an instance cannot cause a later FFI call through freed
storage.

Native options include the existing managed heap and Unicode settings plus
`initialPages` and `maximumPages` for the reserved linear mapping (defaults 1 and
256). The supported executable target remains arm64-macos. This host-boundary
slice does not establish a native compiler runtime or any additional accepted
compiler-matrix cell.
