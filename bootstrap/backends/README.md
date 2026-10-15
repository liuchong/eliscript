# Independent backend foundation

`optimize.eli`, `numeric.eli`, `memory.eli`, `wasm.eli`, `native.eli` and `sha256.eli` implement
the optimizer, typed numeric lowering, WASM/ARM64 emission and deterministic
SHA-256 in Eliscript. No C, LLVM IR, WAT,
external assembler or external optimizer participates in direct emission.
`tools/backends/` supplies filesystem/bootstrap and bulk-memory boundary adapters.

This is the first executable slice of the
[independent 3×3 roadmap](../../docs/native-wasm-feasibility.md#后续计划与决策门槛).
The compiler currently **runs as JavaScript**, including in the browser test;
emitting WASM does not mean the compiler itself runs as WASM. Full dynamic
runtime support and WASM/native compiler execution remain open acceptance units.

## Explicit numeric ABI

Every function has distinct required f64 parameters and an f64 result. Callers
must supply the declared arity and Number arguments. The compiler must validate
this subset before optimization; unsupported constructs fail with located
`ELI-B0001` diagnostics, including constructs in an unselected branch.

Supported operations:

- finite numeric constants, negative zero, local Number values and boolean
  conditions; runtime Number values include NaN and infinities;
- binary `+`, `-`, `*`, `/`, unary `+`, `-`, `*`, `/`, `1+`, `1-`, and binary
  numeric `=`, `<`, `<=`, `>`, `>=`;
- simple initialized `let`/`let*`, fixed-type local assignment and assignment
  return values, sequences, `while`, typed `if`, and homogeneous `and`/`or`;
- synchronous direct function calls, forward references, ordinary recursion,
  and named function exports, including Unicode names.

Numbers use Lisp truth: zero and NaN are true. Numeric `and`/`or` return an
operand and preserve short circuit; boolean conditions remain distinct from
Numbers. Parameters and results are deliberately not inferred to be i32.
This slice does not accept objects, strings, persistent collections, closures,
dynamic arity, host imports, raw JS, async/await, or exceptions in source
programs. It does not claim general tail-call elimination or full-language
semantic coverage.

All observable float arithmetic uses individual f64 instructions in source
order. There is no fast-math, FMA substitution, reassociation, or approximate equality.
The shared optimizer folds proven numeric constants and literal conditions;
non-finite fold results retain their original expression so canonical IR stays
lossless. Original IR is not mutated and surviving source spans are retained.

The WASM emitter distinguishes used and discarded results. Discarded
assignments use `local.set`; discarded sequences and loops do not manufacture
values only to drop them. Unused nontrapping numeric operations disappear,
while their operand effects stay in source order. Numeric truth conditions
retain evaluation effects and yield true, including for zero and NaN.
Short-circuit effects and possible nontermination remain. Eligible leaf calls
expand with isolated local slots and arguments evaluated once; recursive or
oversized calls stay intact. Assignment values remain available when used.

`numeric.eli` also owns the shared typed optimization stage. It performs:

- leaf inlining with ordered argument capture and immutable-parameter aliases;
- nonnegative integer counter specialization behind finite bounds through
  `2^31 - 1`, with f64 fallback; fractional limits use `ceil` once;
- proven cyclic integer locals, power-of-two wrap masks, zero/one-iteration
  loop versions and four-iteration unrolling with an untouched remainder;
- WASM-only counted compound guards: a proven nonnegative integer range admits
  four complete steps with one counter check, while every floating escape test
  stays at its original position; the final zero to three steps retain the
  complete original condition;
- pure lexical-initializer hoisting and loop-square reuse with dependency
  invalidation; writes, branches and calls conservatively end availability;
- two-lane scheduling of independent scalar call loops. Arguments and caller
  updates must be independent of the reduction result, and the callee bound
  must be invariant. Private lanes may interleave, while each lane's arithmetic
  and the final additions keep their original order. Dependent inputs, mutable
  limits, nonfinite or large bounds and unsupported shapes use the normal path.

The WASM emitter rotates loops, branches directly on boolean `and`/`or`, and
selects cheap pure numeric arms without executing unselected effects. Numeric
counter values still use Lisp truth; they are not exposed as boolean i32s.
No transform recognizes benchmark function names or fixed argument values.
The typed optimizer consumes validated `numeric-f64` IR and does not mutate it.

Core byte arrays, records, string code units, float64 words and array operations
are currently represented by the existing JS bootstrap runtime. Porting these
primitives is an explicit prerequisite for WASM/native compiler execution;
Eliscript algorithm ownership does not prove that host migration is finished.

## Build and compile

```sh
bun tools/backends/build.mjs
bun tools/backends/compile.mjs --abi numeric-f64 --target wasm \
  -o dist/experiments/kernels.wasm tools/experiments/native-wasm/kernels.eli
bun tools/backends/compile.mjs --abi numeric-f64 --target js \
  -o dist/experiments/kernels.mjs tools/experiments/native-wasm/kernels.eli
bun test tests/direct-wasm-backend.test.mjs
```

The explicit build creates `dist/backends/` next to `dist/bootstrap/`; it leaves
the existing bootstrap artifact inventory and public package exports intact.
The emitter returns an ordinary array of byte values, and the host converts it
to `Uint8Array` for writing or instantiation. All emitted WASM modules in this
slice are import-free. Toolchain version and release metadata are unchanged.

The tests build the core and backend modules through Seed, Generation 2 and
Generation 3, compare JS and Source Maps byte-for-byte, then compare emitted
WASM bytes. They execute semantic differential cases under Bun/Node, generated
numeric programs, multi-byte indices, and real browser compilation/execution.
Those are mandatory semantic checks; performance is evaluated separately.
Regression cases cover every inlining/loop/integer option combination, counter
range boundaries, signed zero and nonfinite values, fractional loop and grid
bounds, cyclic wraparound, ordered reductions, and rejected dependent/mutable
call-loop pipelines. Node, Bun and Chromium execute the optimized results.

## Performance decisions

```sh
bun tools/backends/benchmark.mjs
bun tools/backends/benchmark.mjs --verify
bun tools/backends/benchmark.mjs --require-production
```

The report compares the same Eliscript workload and same shared optimization
layer under Node, Bun and Chromium. Loops are inside each generated program;
host-to-module scalar call costs are not substituted for whole-program costs.
Every measured checksum must match exactly. Three fresh process sessions, five
warmups and nine samples per implementation are retained, with alternating
measurement order. Before measurement, the promotion budget is fixed at no
regression against optimized JS for **every** workload and engine.

An observed failure remains a failure: `--require-production` exits nonzero,
the experimental backend is not promoted, and existing semantic/performance
budgets remain in force. Local production may eventually select an explicitly
identified external optimizing backend after its own semantic and performance
acceptance; the browser independent path and full self-hosting roadmap remain
required. External optimization is not automatically invoked by this slice.

The retained 2026-10-14 report passes all nine frozen numeric hot-execution
pairs. Confirmation used identical JS/WASM artifact hashes. The generated JS
control is unchanged from the previous failed report. The WASM module grows
from 789 to 5517 bytes because guarded versions and unrolled code retain their
fallbacks. Subsequent counted-guard emission retains each floating guard and
uses the original loop for the remainder. The retained report records the actual
current artifact size and hash. This closes this numeric performance gate only; download, cold
startup, compiler throughput, memory and full-language/backend acceptance stay
open. The full backend remains experimental.


## Independent ARM64 native slice

The explicit `arm64-macos` target emits baseline ARM64 instructions and Mach-O
objects, dynamic libraries or standalone executables, with macOS 15 as the
minimum deployment target. Compilation requires no C compiler, assembler,
linker, host crypto or signing executable. The library/export table, symbol
layout, PC-relative branches/calls/literals, content-derived UUID and SHA-256
ad-hoc page signature are emitted by `.eli` algorithms. Ad-hoc signing supports
local execution; it does not establish release identity or notarization.

```sh
bun tools/backends/compile.mjs --abi numeric-f64 --target native \
  --platform arm64-macos --native-format object -o dist/experiments/kernels.o \
  tools/experiments/native-wasm/kernels.eli
bun tools/backends/compile.mjs --abi numeric-f64 --target native \
  --platform arm64-macos --native-format library -o dist/experiments/kernels.dylib \
  tools/experiments/native-wasm/kernels.eli
# INPUT must export a zero-argument numeric function named entry.
bun tools/backends/compile.mjs --abi numeric-f64 --target native \
  --platform arm64-macos --native-format executable --entry entry \
  -o dist/experiments/program INPUT.eli
bun test tests/native-backend.test.mjs
```

`emit_native_numeric_object`, `emit_native_numeric_library` and
`emit_native_numeric_executable` return ordinary byte arrays. Native functions
follow the ARM64 f64 calling convention, including stack parameters after the
first eight and ordinary recursive calls. The standalone numeric executable
writes exactly eight little-endian f64 bytes to stdout, preserving signed zero,
infinities and NaN; a failed/short write exits nonzero. This small output
protocol does not provide a general-language I/O runtime.

Default native optimization uses control-flow liveness and interference,
f64/i32 register classes, reuse of nonoverlapping local lifetimes, expression
scratch registers and preservation only of used/live registers. Arguments
execute before call snapshots so their assignments remain visible. Constants
use exact ARM64 immediates or deduplicated PC-relative f64 pools. Discarded nontrapping arithmetic retains operand effects, and floating
expressions compute directly into registers without redundant result copies.
Comparisons branch directly with ordered NaN behavior, and loops rotate without losing
initial/final condition effects. The shared optional `unswitch` pass moves only
pure guards whose reads cannot be written in the loop, with bounded code growth.
Native additionally enables the shared optional `constantFlow`, `parallelSingle`
and `cyclicMultiple` passes. Constant flow invalidates loop/short-circuit writes
and joins exact IEEE constants, preserving signed zero. Single-trip lane dispatch
runs outside batch loops; each cyclic initialization and update needs a range
proof. Unread storage is removed while retaining RHS effects and result values.
Loop constants occupy only unused registers and survive actual calls, and integer
updates/comparisons use proven ARM64 immediates. WASM defaults are unchanged.
The explicit `{registerAllocation:false}` native API option retains the initial
stack emitter for independent before/after measurements and semantic regression.
Neither path permits FMA, float reordering or approximate comparisons.

Tests independently check SHA vectors and page hashes, verify actual macOS
signatures, compare independently emitted and system-linked reference objects,
and execute recursion, Unicode exports, deep expressions, more than eight
arguments, nested argument effects, float immediates and IEEE boundaries. The
system linker/signer in the reference test participates in verification only.
Linux runners inspect emitted images; ARM64 macOS runners execute them. Browser
JS compilers and three bootstrap generations emit identical native images;
this does not prove native or WASM compiler execution.

```sh
bun tools/backends/native-benchmark.mjs --baseline
bun tools/backends/native-benchmark.mjs
bun tools/backends/native-benchmark.mjs --verify
bun tools/backends/native-benchmark.mjs --require-production
```

The native report freezes the same workloads, optimized JS control, three fresh
sessions, five warmups, nine samples and per-workload 1.0× minimum used by the
numeric WASM gate. Measurement includes one Bun FFI call per entire batch.
Baseline and optimized native evidence are retained separately and bound to
compiler/backend sources. A failed report blocks promotion. Numeric native
emission remains experimental; full dynamic runtime, compiler execution, native
debug information, cold startup, memory and the full 3×3 matrix remain open.

The retained native before/after reports use the identical optimized JS artifact
hash and preserve the initial stack image hash. Speedups versus JS change from
0.58×/0.22×/0.11× to 1.97×/1.11×/1.27× for recurrence/grid/tiny batches.
All three pass the unchanged numeric gate. These
measurements concern numeric kernels, not compiler throughput or full self-hosting.

The numeric WASM entry also enables strict constant data flow, unread-store
removal and invariant loop-condition hoisting. These retain exact IEEE operation
order, signed-zero identity, effects and the original fallback paths. Retained
failed/confirmation measurements distinguish unchanged-artifact variation from
actual emission changes; low-margin stability remains open in the roadmap.

## Internal memory ABI

`emit_memory_wasm(program, {initialPages: 1, maximumPages: 256})` compiles the
explicit `memory-u32` runtime subset to owned, exported memory without WASM
imports. `bootstrap/runtime/memory.eli` supplies allocation, growable bytes,
fixed word records, sealed UTF16 builders and UTF8 encoding/decoding. All
algorithms are Eliscript; `tools/backends/memory-runtime.mjs` marshals bulk data
and brands handles per instance. No character decoding or allocation is delegated
to host callbacks. This is an internal experimental runtime slice; the complete
dynamic runtime and WASM/native compiler hosts remain open.

Every required parameter/result is a word with an unsigned 32-bit bit pattern;
boolean temporaries are separate. `+`, `-`, `*`, `1+`, `1-` wrap modulo 2^32,
comparisons are unsigned, and every word is true including zero. General language
Numbers retain their existing f64 semantics. Fractional/out-of-range literals,
negative zero, heterogeneous branches, value-position `when`/`unless`, arbitrary imports and shadowed capability
calls are rejected before emission. Division uses explicit unsigned `word-div`
with a zero-divisor trap; discarded loads/divisions retain their traps.

Only `eliscript:memory32` named imports resolve to instructions: `load-u8/u16/u32`,
`store-u8/u16/u32`, `load-f64`, `store-f64`, `memory-size`, `memory-grow`, `word-div`, `word-shr`,
`word-shl`, `word-and`, `word-or`. Stores return word zero. Raw exports use the
WASM i32 ABI (normalize returned bits with `>>> 0`); the bulk bridge rejects JS
coercion, invalid words, foreign handles and retired handles. These capabilities
are restricted to internal runtime source by repository integrity checks.

Memory uses little-endian words and 8-byte alignment. Control words at 0/4/8/12
store cursor/epoch/error/live-object head; allocation begins at 256. Each 32-byte
header holds kind/epoch/length/capacity/data/sealed/next/reserved. Byte arrays,
UTF16 strings and word records have kinds 1/2/3. Membership must come from the
live allocation list, rather than a tag in arbitrary byte data. Growth preserves
handles and contents and reacquires host views after `memory.grow`. Failed object
allocation rolls back unpublished storage; failed reserve preserves the buffer.
Pages must satisfy `1 <= initialPages <= maximumPages <= 65535`.

Public raw operations clear the last error; zero may be a valid read, so always
check `last-error`. Codes 1..7 mean invalid handle, capacity, bounds, invalid UTF8,
unpaired UTF16, sealed-state violation and exhausted epoch. The bulk bridge
throws structured `ELI-RT0001`..`ELI-RT0007` diagnostics. UTF8 replacement follows
maximal-subpart decoding, strict mode rejects malformed input, and a leading BOM
is stripped unless preservation is requested. UTF16 code units, including lone
surrogates, survive builder/readback; replacement encoding matches TextEncoder.

`retire` invalidates all live handles and advances the epoch. Addresses are never
reused, so stale pointers cannot alias later objects. This arena does **not**
reclaim memory or implement GC, cyclic dynamic records, ownership transfer or
untrusted raw-memory sandboxing. Records contain words; tagged dynamic values
are supplied by the managed heap below. The raw memory ABI is trusted internal storage;
the bridge supplies the instance/lifetime boundary for host handles.

Run `bun test tests/wasm-memory-runtime.test.mjs tests/direct-wasm-backend.test.mjs`.
The latter also verifies seed/second/third-generation emission identity and runs
the memory runtime in the selected real browser. Use `ELISCRIPT_TEST_BROWSER`
with chromium, firefox or webkit. Encoding semantics follow the
[Encoding Standard](https://encoding.spec.whatwg.org/#utf-8-decoder), and byte
emission follows the [WASM binary specification](https://webassembly.github.io/spec/core/binary/instructions.html).


## Managed value heap

Compile `bootstrap/runtime/memory.eli` with `emit_memory_wasm`. All exported parameters/results are words; restricted
`load-f64` and `store-f64` additionally allow typed f64 locals and ordered Number
operations inside the runtime. Implicit Word/f64 conversion is refused.
`instantiateManagedRuntime(bytes, {maxSlots, initialBytes, maxBytes})` supplies a
bulk host bridge. `number`, `string`, `bytes`, `array` and `record` return branded
handles; `binary` (0 add, 1 subtract, 2 multiply, 3 divide), `negate` and `compare`
(0 equal, 1 unequal, 2 less, 3 less-or-equal, 4 greater, 5 greater-or-equal) run
inside WASM. NaN and signed-zero identity follow Number semantics. Strings keep
UTF16 code units, including lone surrogates. These APIs remain internal.

`readNumber`, `readString`, `readBytes`, `get`, `set`, `length`, `resize` and `truth`
check lifetime and kind. Byte results are copied. Arrays and fixed mutable records
hold handles or immediate null/false/true/undefined; ordinary Number input must
first be boxed with `number`. Arrays and bytes can resize; records stay fixed.
The internal reference record is not the language persistent Record type.

Each returned handle owns one explicit root; `get` owns a new root for the
returned child. `pin` adds a root and `release` drops one. `collect` marks rooted
objects and their reference graphs iteratively, then frees unreachable blocks
and recycles slots. Cyclic and shared graphs are supported. Pool-relative offsets
survive growth; sorted free blocks coalesce, while resize failure leaves the old
value intact. `stats` reports pool used/capacity bytes and live values, not full
process peak memory. Values use 12-bit generations and 20-bit slots; slots stop
recycling at generation 4095 to prevent stale identity reuse. Exhaustion returns
the existing capacity diagnostic. A released handle remains usable until actual
collection; using it after collection fails with ELI-RT0001.

Collection defaults to explicit. `auto(thresholdBytes)` enables allocation
safepoints at a nonzero byte threshold; `auto(0)` disables them. Successful
allocations accumulate byte debt, checked before the next allocation. With this
mode enabled, exhausted slots or blocks trigger collection and one complete
retry. Resize temporarily roots its operand and preserves its identity and data
on failure. Number operations capture their f64 operands before allocation.
`array`/`record` construction temporarily roots each borrowed argument before
subsequent getters or allocation and releases those roots on success or failure.

`frame(count)` creates a private root frame; `frameSet`/`frameGet` access its
locals, including locals of an active ancestor. `frameGet` returns an owned root.
`leaveFrame` requires the current top frame. `frameReturn(frame, value)` roots the
result before popping and returns a handle with exactly one transferred root;
place it in a caller frame and release that root when ownership is transferred.
Existing roots remain independent. Popped or unwound frames expire immediately,
and frame tokens cannot appear as ordinary values or cross runtime instances.
`unwindFrames(target)` discards frames above an active ancestor; omission unwinds
all frames. Invalid targets leave the stack unchanged. Pop/unwind clear references
without allocation or GC. Use unwind in trap/exception cleanup before the next
allocation. `stats` also reports `frameDepth` and a saturating collection counter.

The raw WASM exports are `heap-auto`, `heap-collections` and
`frame-new/set/get/pop/return/unwind/depth`, with word arguments/results.
`frame-return` adds one explicit result root; immediate nil returns word zero on
success, so raw callers must inspect `last-error` to distinguish failure.
Collection traces the active frame chain and all its locals. Before enabling
automatic collection, raw callers must keep every live reference in a frame or
explicit root. Complete compiler insertion of these calls remains open; the
internal loop/recursive fixtures insert them explicitly.

Managed text now includes sealed UTF-16 concat, checked slice, lexical compare,
constant-space linear find and code points, plus exact-allocation UTF-8 codecs.
Strict errors allocate no result; allocating operations protect inputs across
collection and refresh addresses after growth. The bridge APIs and internal word
contracts are documented in the [runtime reference](../../tools/backends/README.md).
Raw accesses explicitly check the complete access width before executing a load
or store, preserving operand effects and growth before a catchable WASM trap.

The backing arena still retains previous regions on pool growth and does not yet
destroy multiple heaps. Complete dynamic lowering, persistent collections and
full compiler hosts remain open. No full compiler memory or performance
acceptance is claimed by these runtime slices.

## Primitive Number and text conversion

The experimental managed profile now lowers `string-to-number` and variadic
`str`, and reuses those primitive conversions for String positions, concat and
Number-valued named-object keys. Decimal and binary/octal/hexadecimal strings
retain all significant digits before exact nearest-even binary64 rounding.
Empty text, ECMAScript whitespace, signed zero, subnormals, NaN and infinities
keep their separate semantics. Number text uses exact rounding intervals to
produce the shortest roundtripping ECMAScript spelling; it does not format a
fixed count of decimal digits or discard rounding information.

Private base-2^16 integers live in GC-rooted scratch bytes inside the same WASM
heap. No host parser, formatter or per-character imports are used. Scratch
addresses are used only between allocation safepoints, and all addresses are
reloaded after result allocation. Borrowed inputs, capacity failures and real
WASM traps retain the caller's roots and exact input values.

Generated JS uses a shared primitive helper for nondecimal Number conversion:
it parses valid radix integers exactly before converting to binary64, avoiding
host differences in direct Number(string) conversion. Modules with neither
numeric conversion nor dynamic numeric operators receive no helper. Seed and self-hosted emitters retain the
same bytes and source marks. Represented ordinary-object conversion hooks run
through the source call ABI. Symbol/BigInt coercion, complete JS interoperability
and full compiler hosts remain open; these slices do not close them.

## Primitive source operators and typed JS

Ordinary managed arithmetic, remainder, word operations and relations now accept
nil, booleans, undefined, Number and String inputs. Addition concatenates if
either primitive is a String; two Strings compare by UTF-16 units. Other
relational inputs use exact Number conversion. Strict equality stays distinct
from table-key equality, and single-operand `+` and `*` retain the original value.
Both operands and intermediate conversions are rooted across allocation;
conversion failure suppresses later effects and retains caller frames. The raw
Number-only API keeps its original strict argument checks.

Dynamic JS operators use shared helpers for exact radix parsing and observable
ToPrimitive/ToNumeric ordering. They retain BigInt and object-hook semantics,
snapshot built-in conversion operations before user callbacks can replace them,
and bound integer parsing only after validating the complete radix grammar.
Modules emit these helpers conditionally. Ordinary Number pairs avoid extra
primitive conversion; no per-call closure is introduced.

Closed scalar loops also receive a Number entry version: required parameters
are checked once, then the loop uses direct operators. A lexical proof excludes
free reads/writes, strings, objects, calls, host access and destructuring. Other
inputs execute the complete coercion path, with identical operand and exception
order. This keeps numerical loop intermediates unboxed without trusting an IR
annotation or relaxing the dynamic language.

The numeric backend's `emit-numeric-javascript` validates the complete original
numeric-f64 IR before shared optimization and Number-only JS emission. The
explicit numeric CLI and benchmark generators use that checked entry. It rejects
unsupported dead code, leaves input IR unchanged, restores emission state after
failure and preserves the accepted optimized JS control bytes. It is not a
user-supplied unchecked annotation or a full dynamic backend.

Backend fixture preparation compiles all frontend modules in one Emacs seed
process with the same normal file compiler. Independent CLI comparisons verify
all JS and source-map bytes; no compiler module, generation or test is omitted.
This reduces repeated startup work within the original CI budget. Complete
compiler hosts, managed Symbol/BigInt coercion, production acceptance and
the full nine-cell bootstrap matrix remain open.

## Source-array properties and sparse slots

Source arrays distinguish absent indexed slots from own slots containing
undefined. Length growth creates holes; shrink removes truncated slots; slice
preserves holes, converts primitive positions and excludes named properties.
Primitive property keys use exact Number/text conversion. Indices enumerate in
ascending order, followed by named properties in insertion order; length is an
own nonenumerable property. `object-has?`, `object-keys` and `object-assoc` accept
arrays, with assoc producing an ordinary shallow object containing enumerable
own properties. The raw reference-array layout and nil-filled ABI are unchanged.

Named-property tables are owned by the source array, traced by GC and preserved
across indexed storage growth. Private hole words never become handles or roots.
Allocating setters protect receiver, key and child; failed property allocation
does not publish a partial entry. Indexed reads and existing string-key queries
need no temporary frames, conversion strings or collection.

Static push/pop/slice calls capture lookup before evaluating arguments. A
shadowing data property causes noncallable failure after argument evaluation;
an argument replacing a builtin does not change the already captured call.
Bulk source-array bridging snapshots enumerable own string-keyed properties,
retains holes at other indices, protects earlier getter values and ignores the
input's iterator override.
Own proto data is copied as data; changing Array prototypes, general descriptors,
Symbol/BigInt keys and arbitrary host-object coercion remain explicitly unsupported.

## Source Map, Set and live iterators

The managed profile accepts unshadowed builtin Map/Set constructors, their
get/set/add/has/delete/clear calls, size, and entries/keys/values/next. Constructors
consume arrays, source collections, live source iterators and String code points;
Map entries must be objects and are read at properties 0 and 1. Null and undefined
initializers create empty collections. Ignored arguments still evaluate in order.

Source wrappers use heap kinds 15/16/17 while raw Map/Set/iterator kinds 10/11/12
retain their existing ABI. Collection entries are separate from named own data;
size is inherited and read-only, and own enumeration/copy includes only named
own data. Method lookup is captured before arguments. Noncallable shadows fail
after argument evaluation, and replacing a method during argument evaluation
does not change the captured builtin. Simple parameter-only get/has leaves use
no private frame, allocation or GC.

Table iteration stays live across insertion, deletion, clear and storage growth.
Map and Set `forEach` use those same live tickets, with `(value, key, map)` and
`(value, value, set)` callback arguments. They validate the callback even for an
empty table, preserve captured own methods and argument effects, and unwind
private roots on capacity failures or real WASM traps. Mutation does not create
a snapshot or substitute a host-side loop.
Array iterators observe current length and return undefined for holes; String
iteration consumes code points and preserves lone surrogates. Each next call
returns a fresh value/done object. Completion is sticky and releases its source.
GC traces wrappers, named data, active iterators and their current values.

Arbitrary constructors, other builtin method values, Symbol protocols, descriptors,
prototype changes and other collection APIs remain unsupported. Missing members
return undefined; known unsupported builtin function values are refused. These
zero-import WASM slices do not complete either compiler host or the full matrix.

## Exact integer rounding

Unshadowed `Math.round`, `floor`, `ceil` and `trunc` are first-class managed
builtins. They evaluate all arguments before ordinary Number conversion, retain
lexical shadows and conversion callback order, and handle missing arguments.
Their binary64 implementation preserves NaN, infinities, signed zero and
subnormals. `round` resolves negative half ties toward positive infinity without
adding 0.5 before rounding. Neither these functions nor source Number `1+`/`1-`
call a host math service. Number steps allocate the result directly and retain
the original mixed-value conversion path.

## Source sequence concatenation

Array and String `concat` capture their selected method before evaluating every
argument. Array results are fresh shallow copies: arrays spread one level,
other values remain single entries, and holes stay distinct from own undefined.
Array constructor validation follows argument effects and precedes copying.
String arguments use ordinary text conversion in order, including source
conversion callbacks and lone UTF-16 surrogates. Own methods retain their
original callable and extra argument effects. Private roots protect arguments,
partial results and caller frames through collection, capacity failure and
actual WASM traps; no host copying or conversion implementation is required.

`Object.is` is a first-class builtin with SameValue semantics: NaN equals NaN,
positive and negative zero differ, and objects retain reference identity.
The existing `Array.isArray` continues to recognize source arrays only, keeping
private reference arrays and records separate. Aliases, missing arguments,
ignored extra arguments and lexical namespace shadows preserve normal call
semantics; neither predicate performs coercion.
