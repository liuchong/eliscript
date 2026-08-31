# 0100: Profile-guided Binary Comparison Emission

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0003 Implemented Core Language,
  0007 Explicit Compiler Intermediate Representation,
  0008 Direct ECMAScript Emission from IR,
  0018 Portable ESM and Source Map Emission,
  0019 Self-Hosted Compiler Driver,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0096 Profile-guided Compiler Runtime Requirement Scan,
  0097 Profile-guided Constant-time IR Node-kind Decisions,
  0098 Profile-guided Source-map-aware Emitter Indentation,
  0099 Profile-guided Ordered Source-mark Location

## Summary

The seed, direct-IR, and self-hosted emitters now specialize exactly binary
numeric comparisons as direct ECMAScript infix expressions. The specialization
applies to `=`, `<`, `<=`, `>`, and `>=` with exactly two arguments.

The previous comparison emitter allocated and immediately invoked an arrow
function for every comparison, including the overwhelmingly common binary
case. That capture is necessary for comparisons with three or more arguments:
Eliscript evaluates every argument before comparing adjacent values, while a
plain JavaScript `&&` chain would skip later argument evaluation after an early
false result. It is unnecessary for two arguments because ECMAScript binary
operators already evaluate the left operand and then the right operand exactly
once before producing a result.

## Emission Contract

For a binary comparison `(operator left right)`, where `operator` is one of the
five supported comparison forms, emission is structurally equivalent to:

```text
(emit(left) js-operator emit(right))
```

The JavaScript operator mapping is:

| Eliscript | ECMAScript |
| --- | --- |
| `=` | `===` |
| `<` | `<` |
| `<=` | `<=` |
| `>` | `>` |
| `>=` | `>=` |

No temporary parameter, arrow function, IIFE, repeated operand, or additional
truth conversion may appear inside the comparison expression. The surrounding
control-flow emitter remains responsible for Eliscript truth semantics.

## Evaluation Semantics

Binary operands are evaluated left to right and exactly once. An exception or
non-local exit from the left operand prevents right-operand evaluation, as it
did when evaluating arguments for the previous immediate invocation.

Comparisons with three or more arguments retain the previous eager-capture
implementation. All operands are evaluated left to right exactly once before
adjacent comparisons begin. Therefore `(= a b c)` evaluates `c` even when
`a === b` is false.

`/=` and `not=` retain their pairwise-distinct implementation. This
specification does not change value equality, persistent collection equality,
operator arity, numeric coercion, diagnostics, or Source Map locations.

## Profile and Rejected Alternative

Whole-compiler sampling after specification 0099 identified generated binary
comparison closures throughout the reader, lowerer, Source Map generator, and
emitter. The most visible examples were delimiter classification and tight
source/mark cursor loops.

A broader constant-`cond` to JavaScript `switch` experiment was rejected before
this specification. Although its isolated dispatch microbenchmark was faster,
the required expression IIFE made an alternating complete-compiler benchmark
about 4.7% slower. No part of that experiment remains in production. This
slice instead removes a general closure cost with a direct evaluation-order
proof and is accepted only because the complete compiler improves.

## Reproducible Benchmark Contract

`tools/compiler/binary-comparison-benchmark.mjs` compares the current generated
compiler with the last accepted compiler revision before this specialization:
`a123937b275d89e833434e84064e4e120cf5495b`. The baseline must be a detached
checkout at exactly that revision with its own bootstrap compiler already
generated. The benchmark refuses any other baseline revision.

Both compilers compile the same current source text for all eleven maintained
self-hosted modules with Source Maps. Before timing, every module must compile,
every Source Map must parse, both checksums must be non-zero, and optimized
generated JavaScript must be smaller than baseline output. Timing alternates
baseline and optimized order after warmup.

The reviewed macOS arm64 report records:

- 246,920 bytes across 11 compiler modules
- 406,979 bytes of baseline generated JavaScript
- 306,947 bytes of optimized generated JavaScript
- 2 warmup rounds
- 11 alternating samples with 6 complete corpus rounds per sample
- 608.453750 ms baseline median
- 458.944625 ms optimized median
- 1.325767x complete-compiler speedup

The decision threshold was fixed at 1.15x before the reviewed report was
recorded. Every current compiler source, both seed emitter implementations,
and the benchmark implementation participate in the SHA-256 digest. Default
tests validate the report and digest without making wall-clock timing a normal
CI gate.

## Core Boundary

This is language compiler code generation. Its implementation, corpus,
performance decision, conformance evidence, and P4 roadmap credit depend only
on the Eliscript seed compiler, self-hosted compiler, ECMAScript semantics, and
the maintained compiler corpus.

Application frameworks, React integrations, Vite adapters, bundlers, blog or
site generators, publishing tools, Pages hosting, and development servers do
not participate in the implementation, goals, evidence, dependencies, or
maturity credit. They may observe smaller and faster generated code only as
application-level utility validation.

## P4 Status

This is the fifth profile-guided compiler slice. It removes a pervasive
generated closure pattern and demonstrates a complete-compiler improvement,
but does not close P4. Remaining compiler and standard-library hot paths still
require profile evidence and measured changes with explicit semantic bounds.

## Acceptance Criteria

- **BCE-01:** Exactly binary `=`, `<`, `<=`, `>`, and `>=` emit direct
  ECMAScript infix expressions without an arrow function or IIFE.
- **BCE-02:** Binary operands evaluate left to right exactly once with the same
  exception and non-local-exit ordering as ordinary strict arguments.
- **BCE-03:** Three-or-more-argument comparisons retain eager left-to-right
  evaluation of every argument before comparison short-circuiting.
- **BCE-04:** Seed, direct-IR, and self-hosted emitters implement the same
  specialization and retain exact ESM plus Source Map parity.
- **BCE-05:** Executable evidence observes binary and n-ary side effects, and
  the three-generation compiler fixed point remains byte-identical.
- **BCE-06:** The benchmark accepts only the exact pre-specialization baseline
  revision and the same eleven-module current-source corpus.
- **BCE-07:** The reviewed report contains source and host fingerprints, raw
  alternating samples, medians, byte counts, checksums, threshold, and a
  passing decision.
- **BCE-08:** The reviewed complete-compiler median speedup is at least 1.15x.
- **BCE-09:** Default tests reject source-digest drift, malformed reports,
  incomplete samples, invalid Source Maps, failed byte reduction, and failed
  threshold decisions.
- **BCE-10:** No application framework, UI library, Vite dependency, bundler,
  site generator, publishing tool, Pages host, or development server
  participates in core implementation, goals, evidence, or maturity credit.
