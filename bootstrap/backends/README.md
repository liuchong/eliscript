# Independent backend foundation

`optimize.eli`, `numeric.eli` and `wasm.eli` implement the optimizer, typed
numeric lowering and WASM binary emitter in Eliscript. No C, LLVM IR, WAT,
external assembler or external optimizer participates in direct emission.
`tools/backends/` supplies filesystem/bootstrap adapters only.

This is the first executable slice of the
[independent 3×3 roadmap](../../docs/native-wasm-feasibility.md#后续计划与决策门槛).
The compiler currently **runs as JavaScript**, including in the browser test;
emitting WASM does not mean the compiler itself runs as WASM. Full dynamic
runtime support and native emission remain open acceptance units.

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

All float arithmetic uses individual f64 instructions in source order. There
is no fast-math, FMA substitution, reassociation, or approximate equality.
The shared optimizer folds proven numeric constants and literal conditions;
non-finite fold results retain their original expression so canonical IR stays
lossless. Original IR is not mutated and surviving source spans are retained.

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
