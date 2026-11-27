# Native and WASM memory ABI

The `arm64-macos` and `arm64-linux` emitters produce a Mach-O or ELF object and a
self-contained dynamic library from the canonical `eliscript:memory32` program
form. `emit_typed_native_memory_object(typed, target)` and
`emit_typed_native_memory_library(typed, target)` validate the complete typed
program before emitting; the `emit_typed_native_memory_artifact(typed, target,
options)` entry selects `:format "object"` or `:format "library"`. WASM uses the
same typed input through the managed and memory backends, so one source and one
typed program describe both targets.

## Type domains and memory primitives

Memory functions carry four explicit domains. Parameters, locals and results
each declare exactly one of them, and the domains are never implicitly
convertible:

- `u32` — unsigned 32-bit integer in a general-purpose register (`w` view).
- `f64` — IEEE 754 binary64 scalar in a floating-point register (`d` view).
- `v64` — a `Val64` tagged managed value; WASM `i64`, ARM64 `x` register.
- `bits64` — an untagged 64-bit bit group; WASM `i64`, ARM64 `x` register.

A function states its domains with a flat `(memory-sig <result> <param> ...)`
form as the first declaration of its body; the compiler rejects any other
nesting, any omitted domain, and any 64-bit value used directly in condition
position. Compile-time 64-bit constants are exact unsigned word pairs
`{low: u32, high: u32}`. The compiler IR never stores a JavaScript `BigInt`;
`v64-literal` and `bits64-literal` take the pair as two static `u32` words, and
`bits64-pack` takes two runtime `u32` operands and returns the assembled
`bits64`. Host loaders convert at their own boundary, so a `v64` or `bits64`
export surfaces as an unsigned 64-bit `BigInt`.

The capability set is closed. It provides `load-u8`, `load-u16`, `load-u32`,
`store-u8`, `store-u16`, `store-u32`, `load-f64`, `store-f64`, `load-v64`,
`store-v64`, `load-bits64`, `store-bits64`, `memory-copy`, `memory-fill`,
`copy-static-u16`, `f64-from-bits64` and `bits64-from-f64` for exact bit
reinterpretation, the `v64-*` and `bits64-*` word operations, `word-div`,
`word-shr`, `word-shl`, `word-and`, `word-or`, `word-xor`, `memory-size`,
`memory-grow` and `call-source`. All accesses are little-endian, accept
unaligned offsets, and check the complete width against the current byte length
without wrapping the address addition. Completing all operands before the bounds
check is part of the contract: a store evaluates its address and value, and a
load evaluates its address, before any trap is raised.

## ARM64 calling convention and the 32-byte context

`x0` always carries a trusted context pointer; the callee copies it to `x19`.
The context is 32 bytes, extended to 48 when host capabilities are declared, so
the host-call path can load the dispatcher pointer the compiler never sees:

| offset | width | meaning |
| --- | --- | --- |
| 0 | `u64` | mapping base address, fixed for the instance lifetime |
| 8 | `u64` | current byte length |
| 16 | `u64` | capacity |
| 24 | `u32` | trap status word |
| 28 | `u32` | precise trap site index, when debug trap sites are supplied |
| 32 | `u64` | host capability callback pointer, when capabilities are declared |

The mapping is reserved once and never moved, so `memory-grow` cannot relocate
it; growth only raises the current length and zeroes the newly visible bytes.
`memory-size` returns the current page count and `memory-grow` returns the
previous page count or `0xffffffff` on failure.

Source arguments fill two independent register groups by domain. `u32`, `v64`
and `bits64` occupy `w1..w7` / `x1..x7`, seven general-purpose slots starting at
`x1`; `f64` occupies `d0..d7`, eight floating-point slots starting at `d0`.
Results use `w0`, `x0` or `d0` according to the declared result domain. Spilled
arguments keep `SP` 16-byte aligned and follow the target platform's stack rule:
`arm64-macos` uses natural size and natural alignment (`u32` at 4 bytes and
4-aligned, `v64`/`bits64`/`f64` at 8 bytes and 8-aligned), while `arm64-linux`
uses a uniform 8-byte stack slot for every spilled scalar.

Non-parameter locals are zero-initialized, including `f64` positive zero, which
matches the typed WASM local contract.

## Indirect call table, call-source and export signatures

An indirect call table is a flat array of fixed 8-byte entries,
`[rel_offset: i32, signatureId: u32]`. `rel_offset` is the signed byte distance
from the entry itself to the target function, and `signatureId` identifies the
exact `(parameters, result)` pair interned for that target. A generated call
evaluates every argument and the table index first, then compares the index
against the table length, loads the entry, compares `signatureId` with the
statically expected identifier, and only then executes `BLR`. Indices are
limited to 65536 entries. A closed or mismatched table traps instead of
branching; raw memory lowering declares an empty table, so an unreplaced
`call-source` traps rather than reaching an arbitrary address.

The source closure entry is `call-source heap env argv argc` over the fixed
typed signature `[u32, v64, v64, u32] -> v64`: the heap, the environment or
receiver value, the argument vector, and the argument count. The lowered
indirect call carries those four typed operands plus the separately evaluated
table index, which is the fifth operand of the declared capability and selects
the entry rather than forming part of the source signature. A raised `ELI-RT`
code from the callee propagates unchanged.

Every export carries an exact signature. The typed program supplies
`exportSignatures` as a map from export name to `{arity, parameterTypes,
resultType}`, including aliases; a descriptor without it is rejected. The
descriptor's `functions` list separately records `publicArity` for the
source-level surface and the machine `arity` with both type vectors. Declaration
arrays such as `indirectSignatures` declare `parameterTypes` and `resultType`;
a table declared with arity alone is rejected outright rather than having its
domains inferred.

`openNativeMemory(path, exportSignatures, options)` in
`tools/backends/native-memory.mjs` loads the library through Bun FFI, or forwards
to the Node loader, and enforces this metadata. It validates each export's
`arity`, `parameterTypes` and `resultType`, and converts arguments by domain:
`u32` must be an integer in `0..4294967295`, `f64` must be a `Number`, and
`v64`/`bits64` must be an unsigned `BigInt`. Results are normalized by the
declared result domain, so a `u32` result is an unsigned `Number` and a `v64` or
`bits64` result is an unsigned `BigInt`. `invoke(name, ...args)` clears the trap
status before each call, converts bounds and division traps to
`WebAssembly.RuntimeError`, and attaches the recorded instruction frames when
debug data is available. `read(offset, length)` returns an independent copy,
`write(bytes, offset)` checks the whole range before writing, and `byteLength`
reports the current logical size. Instances are independent, closed instances
reject every access, and calls are synchronous.

Trap status values are fixed: `1` memory access out of bounds, `2` integer
divide by zero, `3` indirect call index out of bounds, `4` indirect call
signature mismatch, `5` host capability failed, `6` host capability unavailable.

## Static read-only image and managed heap layout

Compile-time immutable literals — string and symbol payloads, table metadata, and
the boxed blocks of raw numeric bit patterns that cannot be inlined — are emitted
into a static read-only data section: `__TEXT,__const` for Mach-O, `.rodata` for
ELF, and an active data segment for WASM. `elf-rodata-section-info` reports that
section's file offset, size and alignment so the loader can authenticate it
against the image before use. The bytes are loaded into linear memory at
`[256, imageDataEnd)`; the low `[0, 255]` region is the instance header.

The instance header holds the growth cursor at byte 0, the lifetime epoch at
byte 4, the last error at byte 8, the live-object head at byte 12, the Unicode
case profile, host property order, the static image fields (`roBase` 72, `roDir`
76, `roCount` 80, `roImageSlot` 84, `imageDataEnd` 88, `metaDir` 96, `metaCount`
100) and the outer free-block head at 92. Publication is ordered: the epoch,
image fields and metadata are written first and the cursor is stored last, so a
partially written header is never observed. The managed host loader validates
that `roBase` is 256, that `imageDataEnd` is 8-aligned and at least 288, that the
`roDir` and `metaDir` tables fit inside the image, and that the reserved word at
byte 284 is zero; a header that disagrees with the descriptor is rejected before
any allocation.

`heap-new(initialBytes, maxBytes)` allocates from `imageDataEnd` upward, 8-byte
aligned, and never copies the static literals. It validates the byte ceiling
against 1 GiB and requires `initialBytes >= 3696` and `initialBytes <= maxBytes`.
It allocates a single 8-aligned region containing: the fixed `Control` block of
892 `u32` words (3,568 payload bytes behind a 32-byte outer header, 3,600 owned
bytes) followed by the initial heap segment (`initialBytes - 3600 >= 96` bytes,
beginning with a 32-byte segment header `[next, size, cursor, end, magic,
heapId, reserved0, reserved1]`). Each `heap-new` assigns a monotonic 16-bit
`heapId` stored in both `Control + 52` and the upper handle word, preventing
cross-heap aliasing across retirements. `heap-used`, `heap-capacity`,
`heap-live`, `heap-collections` and `frame-depth` expose the live counters, and
`ffi-handle-new`, `ffi-handle-get`, `ffi-handle-release` and `ffi-handle-count`
manage explicit external GC roots for foreign embeds.

The `Control` block holds the segment list `segmentHead`/`segmentTail` at byte
offsets 4 and 8, `allObjectsHead` at 12, `auxArena` at 16, read-only and
metadata mirrors at 20..44, `segmentCount` at 48, `heapId` at 52, segment span
bounds `minSegAddr`/`maxSegEnd` at 56 and 60, `liveBytes` at 64, `freeBytes` at
68, `freeBlockHead` at 72, the address-ordered AVL `freeTreeRoot` at 76,
`liveCount` at 80, `ownedBytes` at 84, `maxBytes` at 88, `markGrayHead` at 92,
`weakTableHead` at 96, `autoThreshold` at 100, `allocDebt` at 104,
`collectionsCount` at 108, `moduleStatus` at 112, `exceptionPending` at 116,
`runtimeErrorKind` at 120, `pinnedObjectsCount` at 136, `gcStateFlags` at 140
(bit 0: mark parity; bit 1: module namespace tag flag), and the 256 weak
named-function bucket counts from 144. From byte 1168 it holds 8-byte-aligned
`Val64` slots: 24 named roots and prototypes, 15 weak well-known symbol handles
from 1360, and 256 weak named-function bucket heads from 1480. `pendingException`
sits at 1184, the cached `AggregateError.prototype` direct header pointer at
1356, the `ffiHandleTable`/`ffiHandleCount`/`ffiFreeHead` scalars at 3528..3536,
and the `rtScopeCache` (`frame`, `owner`, `data`, `idleAnchorHdr`) at 3544..3560.

The byte budget is honest about every byte the heap owns. `ownedBytes`
(`Control + 84`) and `maxBytes` (`Control + 88`) cover the fixed `Control` block
(3,600 owned bytes), all active heap segments, the lazily materialized
`auxArena` (0 until an auxiliary fixed slot is written, then 4,624 owned bytes),
and the external `ffiHandleTable` when allocated. When the active segment runs
out of bump and free-tree space (`heap-grow-segment-and-allocate`), if
`segmentTail` sits directly at the linear-memory growth cursor (byte 0), it
extends in place via `reserve`/`outer-grow-to` without fragmentation. Otherwise
it allocates a fresh secondary segment sized to satisfy the request (respecting
`maxBytes - ownedBytes`) and links it into the segment list. On `heap-collect`,
unreachable objects are swept directly into the address-ordered free list and
AVL tree (using `Val64` and header fields directly—no compaction or moving step),
segment tails are rewound where freed, and completely empty secondary segments
are returned immediately to the outer allocator via `outer-free`.

Every dynamic object uses a **non-moving 32-byte GC object header** immediately
preceding its `hdr` pointer (`hdr - 32`): `[allObjectsNext, allocSize, gcFlags,
pinCount, markGrayNext, gcWeakHead, magic=0x4f424a4c, bodyPtr]`. Inline objects
start immediately at `hdr` (`bodyPtr == hdr`), while resizable objects whose
capacity grows beyond their inline allocation (arrays, mutable byte buffers,
strings, tables, function infos) allocate a fresh out-of-line body behind an
8-byte body header (`[bodyAllocSize, magic=0x424f4459]`) and update `bodyPtr`,
returning the old inline tail or old out-of-line body to the free list without
ever moving `hdr`. `Val64` object identity therefore never changes across
collection, growth, or resizing.

`FunctionStaticMeta` is the static authority for construction capability.
Instance-header bytes 96 (`metaDir`, mirrored at `Control + 40`) and 100
(`metaCount`, mirrored at `Control + 44`) address a read-only table of 24-byte
entries, each six `u32` words `[code, length, flags, nameRoIndex, textRoIndex,
protoCode]`. A `kind 18` function object stores a 1-based `metadata` index at `+24`
(`0` means it has no static entry) and a lazy `v64` `info` handle at `+40` (`0`
until reflection or a property access materializes it). While `info` is still
unmaterialized, bit 0 of `FunctionStaticMeta.flags` is the sole authority for
constructibility — read directly by `value-function-constructible`, `new`,
`Reflect.construct` and `Array.from` — and only a function with `metadata == 0`
falls back to bit 2 of the closure-header word at `+20`. Static metadata never
shares function objects across realms: every realm and heap still allocates its
own dynamic `kind 18` handle, prototype chain and closure environment, and
materializes `name`, `length`, `.prototype` and user properties per realm when
needed.

A read-only `0xFFF9` handle is never writable. Its validation checks the mirrored
image slot (`Control + 32`), the directory bound (`Control + 28`), an 8-byte
aligned offset inside `[288, imageDataEnd - 32]`, and the static block kind,
which must be `kind 4` for a boxed special `NaN` bit pattern or `kind 5` for a
string. Any public write through `heap-mutable-block` to a `0xFFF9` handle, and
any `value-seal` of a valid one, is rejected with `ELI-RT0006` (`fail 6`,
sealed). Read-only consumers — reusing a `RegExp` source or flag string,
inspecting or comparing strings, and hashing or comparing property keys — read
or retain a valid `0xFFF9` string handle directly without routing it through the
public sealing path or materializing a mutable copy merely to inspect or reuse
static input; operations that produce new text allocate their result normally.
Instance-header bytes 104 through 135 hold a fixed, already-sealed synthetic
`kind 4` block header (`load-u32(104) == 4`), and `heap-block` returns `104` for
every inline `Val64` number so kind dispatch needs no extra branch. Callers must
never treat `104 + 32` as a writable numeric payload (`heap-mutable-block`
rejects an inline number with `ELI-RT0001`); every IEEE-754 read and
construction, including `value-number-bits`, radix formatting and the `[0, 1)`
bit construction used by `Math.random`, works directly on the `Val64`/`bits64`
words.

Every managed value is one `Val64` word and one encoding:

- `0..3` are the `nil`, `false`, `true` and `undefined` singletons. `4`, `5` and
  `6` are private sentinels for a hole, an unmaterialized lazy binding and an
  in-progress materialization, and are never exposed to source code.
- An ordinary `f64` is stored inline as its raw IEEE bits plus the fixed offset
  `0x0001_0000_0000_0000`, giving the inclusive window
  `[0x0001_0000_0000_0000, 0xFFF7_FFFF_FFFF_FFFF]`. Decoding subtracts the same
  offset. Values stay inline, occupy no heap object, never go stale, and are
  reclaimed by nothing because they own nothing.
- A raw bit pattern whose high word is at or above `0xFFF70000` — negative
  `NaN` payloads, where the bits would collide with the tag bands — is boxed
  once as a private raw-number block, and compile-time instances of those bits
  are emitted into the read-only image.
- A dynamic handle is `0xFFF8` in the high 16 bits, `heapId` (`1..65535`) in
  high bits `0..15`, and the direct non-moving 32-bit `hdr` address in the low
  word (`bits 0..31`), so dynamic object count is bounded only by the byte
  budget (`maxBytes`).
- A read-only handle is `0xFFF9` in the high 16 bits, carrying the image slot
  and the index within that image's directory.

Handles are validated directly via `heapId`, segment membership, `OBJ_LIVE_MAGIC`
(`hdr - 8`), and the allocated bit in `gcFlags` (`hdr - 24`); a stale, freed, or
cross-heap handle raises `ELI-RT0001`. `heap-pin` and `heap-release` adjust root
counts (`pinnedObjectsCount`), `heap-collect` marks from frames, prototypes,
module bindings, pending exceptions, FFI handles and pinned objects, and `retire`
increments the lifetime epoch at byte 4 while preserving `heapSerial` (`228`) and
resetting the live-object head at byte 12. `retire` deliberately preserves the
growth cursor, the static image header and every read-only byte.

## Compiler-private root scopes

Generated fixed calls keep temporary roots in a reusable, GC-traced handle area.
The public `frame-*` API and the `call-source` signature above retain their
contracts. A private direct entry instead accepts
`[u32 heap, v64 self, u32 argumentBase, u32 argumentCount] -> v64`; its argument
base is an index into the active handle area, never a pointer or a `v64` vector.
These entries do not occupy indirect-call table slots. Source closures,
callbacks, rest arguments and tail-call records continue to use real managed
argument containers where required by their ownership and lifetime.

A generated non-tail indirect call may select the same private entry after
guarding the actual callee against this program's eligible source functions and
checking its argument count. The entry receives the original function value as
`self`, including its capture layout and identity. The callee and arguments
remain rooted in their original evaluation order. A guard miss uses the normal
owned argument container and invocation path; a root index is never substituted
for that container. Rest, dynamic apply and escaping tail arguments retain their
existing ownership. The internal `heap-source-slots-code` predicate returns
`code + 1`, or zero for a miss, without changing errors or materializing function
metadata. Its result must still match the eligible table; it does not itself
authorize an arbitrary code for direct invocation.

The internal `value-source-tail-finish` entry delegates a
returned tail record to the existing tail loop, preserves a pending first error,
and returns other values without allocating. It adds no public runtime export.

A public kind-9 frame stores its handle-area owner at block offset 24, its
entry checkpoint at offset 12, its predecessor at offset 32, and its roots from
offset 40. Nested public frames inherit the owner and save its current scope
token. The owner is an ordinary kind-7 buffer; without an enclosing frame, one
kind-9 anchor serves as both frame and buffer. Both forms are charged to the
normal slot and byte budgets and are traced by the same collector.

The buffer records its initialized word count at offset 4, capacity at offset 8
and scope token at offset 12. Each scope starts with two metadata qwords:
`[previousToken: u32, rootCount: u32]` and `[entryFrame: v64]`, followed by its
language roots. The token is the nonzero index of its first language root.
`root-scope-enter` reserves and zero-initializes this range before publishing
it; capacity growth checks overflow and preserves the existing range on failure.
Indices remain valid across moving collection. Every access resolves the owner
again and checks that the index denotes an initialized language root, excluding
metadata. No payload address survives a possible allocation or collection.

`root-scope-base` identifies the current range. A function saves that base for
its locals and uses `root-scope-get-abs` / `root-scope-set-abs` while nested
argument scopes are active. `root-scope-exit` clears the released range and
restores its predecessor; retained capacity remains fully accounted until the
owner is collected. Public frame removal also restores its saved checkpoint.

Invocation boundaries save both `frame-current` and `root-scope-mark`. On a
trap they first restore the public frame chain with `frame-unwind`, then restore
the private checkpoint with `root-scope-unwind`, before continuing or collecting.
The second checkpoint also covers reentry that added no public frame. Cleanup
preserves the original thrown value and cannot release roots belonging to the
caller.

VM helpers also use these scopes when their protection-root identity stays
within the helper. Their scope token is explicitly `u32`; indexed reads and
writes validate the active scope and its own root count. Helpers that inspect
frame layout or pass a frame to another owner retain a real kind-9 frame.
Results and saved errors are propagated after restoring the helper's scope.

## Non-unwinding host FFI and trap boundaries

A native or WASM bounds, division or indirect-call trap aborts the current source
call chain and leaves the caller's managed frames intact. The managed caller
records `frame-current` before the invocation and calls `frame-unwind` after
catching the trap, before continuing or collecting. The generic adapter never
silently discards those frames, and root counts released after unwinding are
reclaimed by the next collection.

Source exceptions and host FFI boundaries are latched, never thrown through a
foreign stack frame. A raised source exception is stored as a `v64` in
`pendingException` and flagged by the `u32` `exceptionPending` word; a host
capability failure records its original host value in the invocation record and
sets trap status `5`. A host callback returns through the normal epilogue, so no
C++ exception, `longjmp` or stack unwinding crosses an FFI boundary. The loader
restores the previous trap status after each invocation and re-raises the latched
source value on the caller's side with its original identity.

## Native managed host boundary

`instantiateNativeManagedRuntime(path, lowered, options)` in
`tools/backends/native-managed-runtime.mjs` loads the real dynamic library from
its `{typed, descriptor}` lowering record. The path and the record must come from
the same compilation. The loader snapshots the machine ABI first — function
arity, `parameterTypes` and `resultType` for every export and alias — and only
then awaits host modules, so no later mutation can change the signatures it
enforces. It cross-checks three independent sources: the typed export list, the
descriptor's `functions` entries with their `publicArity`, and the mandatory
`exportSignatures` table; any disagreement is rejected. It does not infer a C
signature from machine code and does not build a WASM wrapper around the library.

The initial page count is raised automatically when the static image needs more
than the requested `initialPages`, and an image that cannot fit inside
`maximumPages` is rejected. Read-only bytes are copied into the mapping at 256
only after the section descriptor is authenticated against the image, and the
static header fields are then published in the low instance header.

The returned API exposes the same handles, Number, text, bytes, array, object
and collection operations, frames, module initialization, invocation and
explicit root operations as `instantiateManagedRuntime`. Both loaders share
`tools/backends/managed-host.mjs` for handles, containers, module lifecycle and
source-error decoding; WASM keeps direct access to its owned memory while native
uses checked reads and writes over its private mapping. Heap algorithms and
source functions execute entirely in emitted native instructions. Source
exceptions keep their managed identity, primitive values and `Error` prototypes,
and numeric runtime failures keep their `ELI-RT` codes and host error classes. A
real native trap unwinds only the invocation's private managed frames.

`close()` is idempotent, runs the shared runtime cleanup and releases the library
and the mapping even if cleanup fails; every later operation rejects the closed
instance. `closeModule()` keeps its meaning: external handles stay valid until
released or until the native instance is closed. An internal `lifecycle.dispose`
hook gives the shared host factory a single place to add compiled-runtime root
cleanup, initialization failure disposes the mapping while preserving the
original thrown value, handles cannot cross instances, and a getter that closes
an instance cannot cause a later FFI call through freed storage.

Native options extend the managed heap and Unicode settings with `initialPages`
and `maximumPages` for the reserved linear mapping (defaults 1 and 256), plus
`nativeTarget`, `hostCapabilities`, `hostCall`, `trapSites` and optional debug
metadata. Host capabilities are limited to `console-log`,
`console-log-capture` and `source-operation`; each is declared as
`{name, module: "eliscript.host", arity: 2, parameterTypes: ["u32", "v64"],
resultType: "v64", abi: "managed-host-call"}` and emitted as a WASM import of
type `(i32, i64) -> i64`, matching the ARM64 `w1/x1` and `x0` convention.
Declaring a capability without supplying a `hostCall` dispatcher is an error, as
is a duplicate declaration.
