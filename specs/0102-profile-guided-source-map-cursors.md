# 0102: Profile-guided Ordered Source Map Cursors

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0006 Located Forms and Diagnostic Positions,
  0009 Source Map v3 Emission,
  0018 Portable ESM and Source Map Emission,
  0019 Self-Hosted Compiler Driver,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0098 Profile-guided Source-map-aware Emitter Indentation,
  0099 Profile-guided Ordered Source-mark Location,
  0101 Profile-guided Reader Character Classification

## Summary

The self-hosted Source Map generator now prepares generated and original
locations with two ordered compiler-private cursors. The prior complete scans
remain executable Eliscript reference implementations.

The generated cursor advances only to each ordered emitted mark instead of
checking the complete mark array at every generated code unit. The original
cursor deduplicates and sorts referenced source offsets, then advances only to
those targets instead of performing a hash lookup for every source code point.

## Generated Mark Contract

Emitter marks are ordered by nondecreasing generated UTF-16 offset. Duplicate
offsets remain in their original order. For each reachable mark, the generated
cursor returns `[line, column, span]`, where line and column are zero-based and
column counts UTF-16 code units.

Marks at the generated text length are not reachable because the historical
scan stops before that offset. Empty generated text therefore produces no
generated marks. The optimized cursor preserves both behaviors.

## Original Location Contract

Source span starts are code-point offsets. Duplicate starts collapse to one
location. Valid nonnegative safe-integer starts are sorted, and the cursor
advances through source code points while accumulating zero-based lines and
UTF-16 columns.

The existing EOF boundary is retained exactly: offset zero is locatable for an
empty source, while the end offset of a nonempty source is not entered into the
location map. Undefined and invalid starts never produce locations. This
specification records that behavior rather than changing Source Map output.

## Optimization Boundary

Both optimized functions are private implementation machinery exposed from the
generated bootstrap module only for executable reference comparison. They are
not language intrinsics, standard-library APIs, or general text-indexing
functions. The reference functions remain readable and independent; production
does not call them.

The optimization relies only on emitter ordering and the maintained span
contract. It does not change emitted JavaScript, mark spans, segment encoding,
source names, `sourcesContent`, diagnostics, or Source Map v3 JSON shape.

## Reproducible Evidence

`tools/compiler/source-map-cursor-benchmark.mjs` accepts only a detached
baseline at revision `a6013833226af047622aceca42d687b6e33e3701`. It builds
real emission artifacts for all twelve current self-hosted compiler modules,
compares both cursor pairs with their references, and adds explicit empty,
duplicate, trailing-offset, newline, tab, and non-BMP boundaries.

Both the baseline and optimized compilers then compile the same current source
corpus with Source Maps. Every JavaScript module and Source Map must be
byte-identical before timing. Reference/optimized cursor timings and
baseline/optimized complete-compiler timings alternate after warmup.

The predeclared acceptance thresholds are 1.5x for the combined cursor pipeline
and 1.08x for the complete compiler. The reviewed macOS arm64 report covers 14
pipeline cases and 22,310 artifact marks. It records a 4.546145x pipeline
median speedup and a 1.128405x complete-compiler median speedup, plus raw
samples, checksums, host identity, corpus shape, SHA-256 source identity, and
the decision. Default tests validate the report without rerunning wall-clock
timing.

## Core Boundary

This slice belongs exclusively to self-hosted compiler Source Map generation.
Its implementation, corpus, dependencies, goals, performance decision, and P4
credit contain no application framework, UI library, Vite adapter, bundler,
blog or site generator, publishing tool, Pages host, or development server.

Application integrations may consume the unchanged Source Maps only as
replaceable public-output validation. They cannot prove this core criterion.

## P4 Status

This is the seventh profile-guided compiler slice. It addresses the two largest
remaining Source Map preparation entries in the post-0101 profile. It does not
alone close P4; a fresh profile and broader compiler/standard-library review
remain required.

## Acceptance Criteria

- **SMC-01:** Generated-mark production uses one monotonic cursor over ordered
  marks and generated UTF-16 offsets.
- **SMC-02:** Original-location production uses sorted unique source targets
  without a hash membership lookup for every source code point.
- **SMC-03:** Complete-scan Eliscript implementations remain executable,
  independent references and are not called by production.
- **SMC-04:** Production and reference agree over every maintained compiler
  artifact plus empty, duplicate, trailing, newline, tab, and non-BMP cases.
- **SMC-05:** Empty-source offset zero and nonempty-source EOF behavior remain
  exactly compatible with the previous implementation.
- **SMC-06:** The benchmark accepts only the exact pre-specialization revision
  and compiles the same current eleven-module source corpus with both paths.
- **SMC-07:** Baseline and optimized ESM plus Source Maps are byte-identical
  before timings are recorded.
- **SMC-08:** The reviewed combined cursor median speedup is at least 1.5x and
  the complete-compiler median speedup is at least 1.08x.
- **SMC-09:** Default tests reject source drift, incomplete samples, failed
  equivalence, invalid Source Maps, checksum drift, or failed thresholds.
- **SMC-10:** The bootstrap fixed point, strict byte compilation, reader and
  Source Map fixtures, seed parity, and complete default suite remain green.
- **SMC-11:** Application frameworks, Vite, bundlers, publishing and site tools
  receive no core dependency, implementation role, evidence, goal, or maturity
  credit.
