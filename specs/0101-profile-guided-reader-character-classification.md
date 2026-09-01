# 0101: Profile-guided Reader Character Classification

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0004 Lexical Analysis and Binding Diagnostics,
  0015 Portable Lexical Analyzer,
  0019 Self-Hosted Compiler Driver,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0096 Profile-guided Compiler Runtime Requirement Scan,
  0100 Profile-guided Binary Comparison Emission

## Summary

The self-hosted reader now classifies whitespace and token delimiters through
two module-private JavaScript predicates. The previous Eliscript `or` chains
remain executable as independent reference functions.

This specialization removes nested value-preserving closures from the two
character decisions that dominate token scanning. It does not change the
general `or` contract: Eliscript `or` still returns the first truthy value or
the final value and still preserves short-circuit evaluation.

## Character Contract

Whitespace consists exactly of code points 32, 9, 10, 13, and 12. A delimiter
is `undefined`, any whitespace code point, or one of 40, 41, 91, 93, 123, 125,
34, 39, 44, 59, and 96.

The production and reference predicates return booleans for every code point.
They also agree for the `undefined` end-of-input sentinel and explicit invalid
host values used by conformance tests. Reader cursor movement, Unicode code
point width, source offsets, spans, diagnostics, and token slicing are
unchanged.

## Optimization Boundary

The native predicates are compiler-private constants in the self-hosted reader.
They are not language intrinsics, public standard-library operations, or a new
character API. The readable Eliscript predicates remain the semantic authority
used by equivalence tests and the benchmark.

The specialization is deliberately narrower than optimizing `or` globally.
General `or` operands may return arbitrary values and have effects; replacing
them with a boolean JavaScript expression would change observable semantics.

## Profile and Evidence

Whole-compiler CPU sampling after specification 0100 placed reader token
scanning and its character predicates among the largest remaining self-time
entries. Generated `delimiter-code-p` contained twelve nested value-preserving
closures, while `whitespace-code-p` contained four.

`tools/compiler/reader-character-benchmark.mjs` requires an exact detached
baseline at revision `d6822134a187d4247611db56822ef47164a76a61`. Both generated
compilers compile the same current eleven-module self-hosted compiler corpus
with Source Maps. Every generated module and Source Map must be byte-identical
before timing begins.

The predicate benchmark uses every code point encountered in that real source
corpus plus the end-of-input sentinel. Default tests separately compare both
predicate pairs over all Unicode code points and explicit host boundaries.
Timing alternates reference and optimized predicates, then baseline and
optimized complete compilers, to reduce order bias.

The reviewed macOS arm64 report records 275,381 real-source decisions, a
5.399289x predicate median speedup, 15 timing samples, 8 complete corpus rounds
per compiler sample, and a 1.249726x complete-compiler median speedup against a
predeclared threshold of 1.08x. The report is source-bound by SHA-256 and
records raw samples, medians, checksums, host identity, corpus size, and the
final decision. Default tests validate the report without using wall-clock
timing as a normal test gate.

## Core Boundary

This slice belongs only to the language reader and self-hosted compiler. Its
implementation, corpus, dependencies, goals, performance decision, and P4
maturity credit contain no application framework, UI library, Vite adapter,
bundler, blog or site generator, publishing tool, Pages host, or development
server.

Those tools may consume generated ESM in replaceable application-level probes.
They cannot supply evidence for this optimization or any language-core goal.

## P4 Status

This is the sixth profile-guided compiler slice. It removes a measured reader
hot path while preserving an executable semantic reference and exact compiler
output, but it does not close P4. Broader compiler and standard-library hot
paths still require independent profile evidence and measured decisions.

## Acceptance Criteria

- **RCC-01:** Production whitespace and delimiter decisions use bounded
  compiler-private native predicates rather than generated `or` closure chains.
- **RCC-02:** The original Eliscript predicate algorithms remain executable as
  independent references and are not called by the production predicates.
- **RCC-03:** Both predicate pairs agree over every Unicode code point, the
  `undefined` end-of-input sentinel, and maintained invalid host boundaries.
- **RCC-04:** Reader cursor, token, span, diagnostic, and Unicode-width behavior
  remains unchanged across the complete reader conformance corpus.
- **RCC-05:** The benchmark accepts only the exact pre-specialization baseline
  and compiles the same current eleven-module compiler corpus with both paths.
- **RCC-06:** Baseline and optimized compiler ESM plus Source Maps agree exactly
  before timings are recorded.
- **RCC-07:** The reviewed report contains source and host fingerprints, raw
  alternating samples, medians, checksums, threshold, and a passing decision.
- **RCC-08:** The reviewed complete-compiler median speedup is at least 1.08x.
- **RCC-09:** Seed/self-hosted parity, strict byte compilation, all reader
  fixtures, and the three-generation bootstrap fixed point remain green.
- **RCC-10:** Application frameworks, UI libraries, Vite, bundlers, publishing,
  site tooling, Pages, and development servers receive no core dependency,
  implementation role, evidence, objective, or maturity credit.
