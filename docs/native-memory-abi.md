# Native memory-u32 ABI

The experimental `arm64-macos` emitter can produce a Mach-O object or a
self-contained, signed dynamic library from the existing `eliscript:memory32`
capability imports. `emit_native_memory_object(ir, target)` and
`emit_native_memory_library(ir, target)` validate the full canonical program.
The numeric-f64 APIs retain their existing calling convention.

Memory functions accept unsigned 32-bit source parameters and return an unsigned
32-bit word. Floating-point loads, stores, arithmetic and locals use IEEE f64
inside these functions. The instructions read and write little-endian bytes,
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

This slice includes direct calls, word arithmetic/comparisons, the eight memory
load/store capabilities, memory size/growth and explicit traps. Source indirect
calls (`call-source`), native managed-runtime integration, a native compiler
entry point and a standalone memory executable are not yet implemented. This
capability does not establish the complete compiler 3×3 matrix or performance
acceptance.
