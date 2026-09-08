# 0052: Portable 32-bit Integer Operations

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0003 Implemented Core Language,
  0017 Portable IR Lowering,
  0018 Portable ESM and Source Map Emission,
  0021 Portable Functions and Dependency Closure,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing

## Summary

This specification defines the stable 32-bit integer operations needed
to express persistent vector addressing, HAMT bitmap navigation, population
counting, and deterministic hash mixing directly in Eliscript.

The operations are compiler intrinsics rather than calls into an opaque
runtime. Seed and self-hosted compilers lower the same source forms to ordinary
ECMAScript operators or `Math.imul`. They are valid inside `defportable`
declarations and therefore remain available to browser, Bun, Node.js, and
Emacs worker workloads without host imports.

The standard-library module `stdlib/bit.eli` proves that non-trivial bit
algorithms can now be implemented in Eliscript itself. It exports population
count and 32-bit rotations without `js*`, `js-call`, mutable host state, or a
JavaScript helper module.

## Number Domain

These forms operate in the ECMAScript Number domain. Their conversion rules
are defined in terms of the host's standard `ToInt32` and `ToUint32`
operations:

- fractional values truncate toward zero before modulo reduction
- `NaN`, positive infinity, negative infinity, positive zero, and negative
  zero normalize to zero
- values wrap modulo 2^32
- signed results use the range -2147483648 through 2147483647
- unsigned results use the range 0 through 4294967295

The stable contract covers Number operands. BigInt and non-number operands
are not portable 32-bit inputs and are not part of this language
surface.

Every operand expression is evaluated exactly once, from left to right.
Conversion and arithmetic do not allocate a persistent value or consult the
collection runtime.

## Intrinsic Forms

| Form | Arity | Result | ECMAScript operation |
| --- | ---: | --- | --- |
| `(int32 value)` | 1 | signed 32-bit | `value \| 0` |
| `(uint32 value)` | 1 | unsigned 32-bit | `value >>> 0` |
| `(imul32 left right)` | 2 | signed low 32 bits | `Math.imul(left, right)` |
| `(bit-and left right)` | 2 | signed 32-bit | `left & right` |
| `(bit-or left right)` | 2 | signed 32-bit | `left \| right` |
| `(bit-xor left right)` | 2 | signed 32-bit | `left ^ right` |
| `(bit-not value)` | 1 | signed 32-bit | `~value` |
| `(bit-shift-left value distance)` | 2 | signed 32-bit | `value << distance` |
| `(bit-shift-right value distance)` | 2 | signed 32-bit | `value >> distance` |
| `(unsigned-bit-shift-right value distance)` | 2 | unsigned 32-bit | `value >>> distance` |

All arities are exact. The compiler rejects missing or surplus operands using
the ordinary compile-error contract.

The fixed binary arity is deliberate. These forms expose primitive operations
for allocation-sensitive algorithms; collection reducers can provide
variadic convenience without complicating primitive evaluation or identity
rules.

## Shift Semantics

Shift distance is converted with `ToUint32` and masked to its low five bits.
Consequently:

- shifting by 0 and 32 uses the same effective distance
- shifting by -1 uses an effective distance of 31
- left shift discards high bits and returns a signed result
- arithmetic right shift copies the sign bit
- unsigned right shift inserts zero bits and returns an unsigned result

Algorithms that require an unsigned left-shift result compose
`bit-shift-left` with `uint32` explicitly. This keeps signed and unsigned
intent visible at the source level.

## Multiplication Semantics

Ordinary Number multiplication cannot preserve exact low-bit behavior for all
32-bit operand pairs because an intermediate product may exceed exact binary64
integer range. `imul32` performs a true two's-complement low-word multiply and
is therefore required for deterministic hash mixing.

`imul32` returns a signed result. Hash algorithms that expose an unsigned hash
apply `uint32` after their final mix.

## Portable Standard Library

`stdlib/bit.eli` exports three portable functions:

- `bit-count(value)` returns the population count of `uint32(value)` in the
  inclusive range 0 through 32
- `rotate-left(value, distance)` rotates a 32-bit word left and returns an
  unsigned result
- `rotate-right(value, distance)` rotates a 32-bit word right and returns an
  unsigned result

`bit-count` uses a fixed parallel reduction with masks and `imul32`; it does
not loop over 32 individual bits. Rotation distances use the same low-five-bit
normalization as shift intrinsics, including identity at distance 32.

These functions are reference implementations for future collection and hash
modules. A lower-level implementation may be specialized only when it remains
observably equivalent to these portable definitions.

## Compiler Pipeline

The complete compiler path owns the forms:

1. lexical analysis recognizes the names as built-in operators
2. portable validation permits them inside `defportable`
3. lowering records them as generic `intrinsic` IR nodes
4. the seed IR emitter emits parenthesized ECMAScript
5. the self-hosted analyzer, lowerer, and emitter implement the same path
6. the compatibility form emitter remains byte-equivalent for ordinary
   functions while that backend is retained

No new IR node kind is necessary because operation identity is already an
explicit value on the versioned intrinsic node. Source spans and Source Map
locations follow the existing intrinsic contract.

The deterministic macro evaluator is a separate compile-time language and
does not gain these runtime forms in this slice. A later macro-language change
must specify its own numeric domain rather than accidentally inheriting Emacs
integer behavior.

## Compatibility Status

This specification is stable in Compatibility Baseline 2. The names, exact
arities, Number conversions, signed/unsigned result categories, evaluation
order, and emitted ECMAScript mechanisms cannot change incompatibly without a
superseding specification and migration fixture.

Generated ESM uses standard syntax and requires no runtime package. Supported
hosts must provide `Math.imul`, which is part of the ECMAScript baseline used
by every declared Eliscript host.

The default suite checks every compiler stage, invalid arity, edge value,
portable library algorithm, and Bun/Node result. The public multi-entry build
test additionally compiles `bit.eli` with the complete persistent value
library, verifies its Source Map, and executes the generated module directly
under both supported JavaScript host families.

## Acceptance Criteria

- **BI-01:** Seed lexical analysis accepts all ten forms as built-ins.
- **BI-02:** Portable validation accepts all ten forms in `defportable`.
- **BI-03:** Every unary or binary form rejects incorrect arity at compile
  time.
- **BI-04:** Form and IR emitters produce equivalent ECMAScript for every
  operation.
- **BI-05:** Self-hosted lowering produces the same intrinsic IR and spans as
  the seed.
- **BI-06:** Self-hosted emission produces byte-identical ESM and Source Maps
  for the shared fixture.
- **BI-07:** Signed, unsigned, multiplication, boolean-word, shift, and
  distance-mask edge cases execute identically under Bun and Node.js.
- **BI-08:** `bit-count`, `rotate-left`, and `rotate-right` are written as
  statically checked portable Eliscript.
- **BI-09:** The standard-library algorithms execute identically under Bun
  and Node.js and retain their Eliscript source in Source Maps.
- **BI-10:** Public-surface and conformance registries reject missing forms,
  exports, or evidence.
