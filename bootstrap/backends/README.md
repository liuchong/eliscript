# Independent backend foundation

`optimize.eli`, `numeric.eli`, `wasm.eli`, `native.eli` and `sha256.eli` implement
the optimizer, typed numeric lowering, WASM/ARM64 emission and deterministic
SHA-256 in Eliscript. No C, LLVM IR, WAT,
external assembler or external optimizer participates in direct emission.
`tools/backends/` supplies filesystem/bootstrap adapters only.

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
  -o /tmp/kernels.wasm tools/experiments/native-wasm/kernels.eli
bun tools/backends/compile.mjs --abi numeric-f64 --target js \
  -o /tmp/kernels.mjs tools/experiments/native-wasm/kernels.eli
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

The retained 2026-10-13 report now passes all nine frozen numeric hot-execution
pairs. Confirmation used identical JS/WASM artifact hashes. The generated JS
control is unchanged from the previous failed report. The WASM module grows
from 789 to 5197 bytes because guarded versions and unrolled code retain their
fallbacks. The compound-guard expansion preserves a full guard check after
every complete iteration. This closes this numeric performance gate only; download, cold
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
  --platform arm64-macos --native-format object -o /tmp/kernels.o \
  tools/experiments/native-wasm/kernels.eli
bun tools/backends/compile.mjs --abi numeric-f64 --target native \
  --platform arm64-macos --native-format library -o /tmp/kernels.dylib \
  tools/experiments/native-wasm/kernels.eli
# INPUT must export a zero-argument numeric function named entry.
bun tools/backends/compile.mjs --abi numeric-f64 --target native \
  --platform arm64-macos --native-format executable --entry entry \
  -o /tmp/program INPUT.eli
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
0.58×/0.22×/0.11× to 1.96×/1.11×/1.23× for recurrence/grid/tiny batches.
All three pass the unchanged numeric gate. These
measurements concern numeric kernels, not compiler throughput or full self-hosting.
