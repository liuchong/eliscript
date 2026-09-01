# 0096: Profile-guided Compiler Runtime Requirement Scan

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0018 Portable ESM and Source Map Emission,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0062 Owner-token Transient Collections,
  0095 Stable Persistent Value and Explicit Host Container Boundary

## Summary

The self-hosted emitter now discovers conditional runtime imports with one IR
traversal. The previous implementation recursively traversed the same program
five times to detect React elements, persistent literals, generic collection
operations, List operations, and process-local host identity tokens.

The five independent predicates remain in the Eliscript-authored emitter as a
readable reference implementation. The production emitter uses the one-pass
collector only after the two implementations agree over the complete maintained
self-hosted compiler corpus and explicit positive and static-key boundary cases.

This is the first profile-guided compiler hot-path slice in P4. It does not
promote application adapters, UI frameworks, bundlers, Vite, site generators,
or publishing tools into the language core or its performance evidence.

## Profile Evidence

A Bun CPU profile of self-hosted compilation identified ESM emission and its
recursive runtime-link analysis among the dominant paths. The source-bound
benchmark therefore measures the real IR of all twelve maintained self-hosted
compiler modules rather than a generated tree with a convenient shape.

The reviewed macOS arm64 report covers:

- 275,380 bytes of maintained compiler source
- 13 programs, including one explicit requirement exercise
- 25,057 IR nodes
- 9 alternating timing samples after warmup
- exact optimized/reference agreement for every program

The reviewed median is 276.218208 ms for the one-pass collector and
440.912459 ms for the reference predicates over 80 repeated corpus scans, a
1.596247x speedup. The decision threshold was fixed at 1.25x before recording
the report. This local report supports the implementation choice; it is not a
universal host-performance promise.

## Production Algorithm

`runtime-requirements` allocates one explicit native result object and walks
each IR node once. A node may set one of five monotonic boolean requirements.
Its children are then visited in source order.

Static keyword property keys remain a special boundary. A keyword used as a
static property key does not require the persistent literal runtime, while the
same keyword in an ordinary value position does. The collector passes this
single suppression fact only to the relevant child and continues collecting
all other requirement categories normally.

The emitter reads the completed requirement object once when composing module
imports and helpers. It does not alter the IR, source spans, temporary-name
allocation, emitted expression order, or generated JavaScript body.

## Reference Contract

`reference-runtime-requirements` calls the retained recursive predicates. It is
not used by normal compilation. It exists to make the optimized traversal
reviewable and executable as an independent semantic oracle.

Tests compare both implementations over every maintained self-hosted compiler
module plus cases where all requirements are true and where a static keyword
property key must remain runtime-free. A disagreement fails before benchmark
timings can be recorded.

The reference implementation may be simplified only when its independence and
semantic clarity are preserved. Production and reference scans must not share
mutable state or delegate to one another.

## Reproducible Benchmark Contract

`tools/compiler/runtime-scan-benchmark.mjs` owns the benchmark format, corpus,
source digest, validation, timing parameters, and decision. The committed
report records raw samples, medians, host identity, corpus size, IR node count,
checksum, threshold, and outcome.

Every maintained compiler source and the benchmark implementation participate
in the SHA-256 source digest. Default tests recompute the digest and validate
the reviewed report without making wall-clock timing a normal CI gate. A source
change invalidates the report until the benchmark is rerun and reviewed.

## P4 Status

This slice satisfies the compiler profiling and portable reference review for
runtime requirement discovery. It does not by itself close all P4 work.
Additional compiler or standard-library optimizations still require their own
profile evidence, semantic reference, and observable performance gain.

## Acceptance Criteria

- **CRS-01:** The maintained self-hosted compiler corpus is compiled to real IR
  before runtime requirement scans are measured.
- **CRS-02:** Production runtime requirement discovery visits each IR subtree
  through one collector traversal rather than five category traversals.
- **CRS-03:** The readable five-predicate implementation remains executable as
  an independent reference.
- **CRS-04:** Production and reference results agree for every corpus program
  and for explicit all-requirement and static-key boundary cases.
- **CRS-05:** The production emitter links exactly the same conditional runtime
  modules and helper as the reference semantics require.
- **CRS-06:** The reviewed source-bound report contains raw samples, medians,
  host and corpus fingerprints, checksum, threshold, and passing decision.
- **CRS-07:** The reviewed median speedup is at least 1.25x over the retained
  reference implementation on the recorded host.
- **CRS-08:** Default tests reject source-digest drift, malformed reports,
  incomplete samples, failed equivalence, or a failed threshold decision.
- **CRS-09:** Seed/self-hosted output parity, Source Maps, and the three-generation
  fixed point remain unchanged.
- **CRS-10:** No UI framework, application adapter, Vite dependency, bundler,
  site generator, publishing tool, or development server participates in this
  core implementation or its acceptance evidence.
