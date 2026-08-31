# 0099: Profile-guided Ordered Source-mark Location

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0009 Source Map v3 Emission,
  0018 Portable ESM and Source Map Emission,
  0019 Self-Hosted Compiler Driver,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0096 Profile-guided Compiler Runtime Requirement Scan,
  0097 Profile-guided Constant-time IR Node-kind Decisions,
  0098 Profile-guided Source-map-aware Emitter Indentation

## Summary

The self-hosted emitter now locates generated fragments by relying on its
normative ordered-mark invariant. Production inspects only the first mark to
decide whether a more specific child location already begins at offset zero.
When a parent mark is required, it constructs one new mark array with the
parent mark prepended and leaves the original fragment and mark array
unchanged.

The previous Eliscript implementation remains executable as
`reference-locate`. It scans the complete mark array with `some`, then copies
every mark through `forEach` when adding a parent. Production is accepted only
because both paths return exactly equal fragments over real compiler output
and explicit identity, ordering, and immutability boundaries.

## Profile Evidence

The discovery profile covered eight complete compilations of all eleven
maintained self-hosted modules with Source Maps. The previous generated
location path was the largest self-time entry at about 5.9%; native `some`
accounted for about 9.0% total sampled time through its callers.

An intermediate implementation proved that changing only the mark algorithm
was insufficient: generated Eliscript control-flow wrappers still made
`locate` the largest self-time entry. Production therefore uses one
module-private JavaScript specialization directly at the emitter's internal
location sites, while keeping the public Eliscript wrapper and independent
reference for tests.

On the same eight-compilation follow-up workload, `locate` is absent from the
dominant profile entries and the private `native-locate` helper accounts for
about 0.7% self time. The sampled whole-run duration changed from 1.61 seconds
to 1.60 seconds, which is within measurement noise and is not claimed as an
end-to-end speedup. Sampling proves hotspot movement; the reproducible corpus
benchmark owns the local performance decision.

## Ordered-mark Contract

Emitter fragments contain ordered `{offset, span}` marks relative to their
text. Fragment composition, joining, indentation, and Source Map consumption
preserve that order. Therefore:

- an empty mark array has no child mark at offset zero
- when the first mark offset is zero, a more specific child location already
  begins the fragment
- when the first mark offset is greater than zero, no later mark can begin at
  zero

Production must not add a second offset-zero parent mark. It must not sort,
deduplicate, or otherwise reinterpret marks while locating a fragment.

## Exact Location Semantics

The private production specialization converts a string output to a fragment
with an empty mark array. Existing fragment objects are otherwise consumed
directly.

It returns the same fragment object when any of these conditions holds:

1. fragment text is empty
2. the node span is `null`, `undefined`, or `false`
3. the first existing mark has offset zero

The explicit nullish-or-false span check preserves Eliscript truth semantics;
it does not use JavaScript's broader falsiness. Otherwise production returns a
new fragment with identical text and marks equal to:

```text
[{offset: 0, span: node.span}, ...originalMarks]
```

The original fragment, mark array, mark objects, and mark order remain
unchanged. Only the new parent record and new array are allocated.

## Reference Contract

`reference-locate` is the previous pure Eliscript scan-and-copy path. It
converts strings with `as-fragment`, scans all marks for offset zero, allocates
a one-element array, and appends existing marks one at a time.

The reference must remain independent and readable. It must not call the
private native specialization, inspect only the first mark, or share the
production prepend implementation. Normal emitter paths call the private
specialization directly; `locate` remains an exported semantic test boundary.

## Reproducible Benchmark Contract

`tools/compiler/locate-benchmark.mjs` compiles all maintained self-hosted
modules to real IR and real generated fragments. The corpus contains 22 module
artifact fragments plus 11 shifted fragments whose first mark begins after
offset zero.

Before timing, all 33 optimized/reference results must contain byte-identical
text and structurally equal ordered marks. The reviewed macOS arm64 report
records:

- 246,920 bytes of maintained compiler source
- 11 compiler programs and 22 generated artifact fragments
- 11 shifted non-zero-start cases, for 33 total cases
- 612,618 generated text bytes and 41,233 Source Map marks
- 9 alternating samples after warmup, with 500 corpus passes per sample

The current reviewed median is 28.919333 ms for ordered production location and
67.200166 ms for the retained scan-and-copy reference, a 2.323711x local
speedup. The maintenance threshold is 1.75x. It was recalibrated from the
original 2x threshold after specification 0100 independently removed binary
comparison closures from both production and reference generated code. The
original acceptance report recorded 3.013590x; the lower threshold does not
claim that historical run as current evidence.
This local result supports the implementation choice; it is not a universal
host-performance promise.

Every compiler source and the benchmark implementation participates in the
SHA-256 digest. Default tests recompute that digest and validate the report,
but do not make wall-clock timing a normal CI gate.

## Core Boundary

This is a compiler-internal host specialization, not a language builtin,
general collection operation, or standard-library dependency. It exists
because a measured compiler hotspot has a stronger ordered-data invariant than
a generic collection search can express.

Application frameworks, React integrations, Vite adapters, bundlers, blog or
site generators, publishing tools, Pages hosting, and development servers do
not participate in the implementation, corpus, performance decision, roadmap
credit, or acceptance evidence. They may only consume public Eliscript output
as application-level utility validation.

## P4 Status

This is the fourth profile-guided compiler slice with an executable semantic
reference and source-bound report. It removes source-mark location from the
dominant profile entries, but does not close P4. Remaining compiler and
standard-library hot paths require their own profile evidence, independent
reference, and measured gain.

## Acceptance Criteria

- **SML-01:** Production relies on the normative ordered-mark invariant and
  checks only the first mark for an offset-zero child location.
- **SML-02:** Empty text, absent spans, and existing offset-zero marks return
  the original fragment object.
- **SML-03:** A required parent mark is prepended once without changing text,
  existing mark order, the input fragment, or its mark array.
- **SML-04:** The previous complete scan and iterative copy remain executable
  as an independent Eliscript reference and are absent from normal emission.
- **SML-05:** Production and reference agree over every maintained self-hosted
  compiler artifact fragment and shifted non-zero-start case.
- **SML-06:** Follow-up whole-compiler sampling removes `locate` from the
  dominant entries and leaves the private helper below 1% self time.
- **SML-07:** The reviewed report contains source and host fingerprints, raw
  samples, medians, corpus counts, checksum, threshold, and passing decision.
- **SML-08:** The current reviewed local median speedup is at least 1.75x over the retained
  reference.
- **SML-09:** Default tests reject digest drift, malformed or incomplete
  reports, failed equivalence, and failed threshold decisions.
- **SML-10:** Seed/self-hosted ESM and Source Map parity plus the
  three-generation fixed point remain unchanged.
- **SML-11:** No application framework, UI library, Vite dependency, bundler,
  site generator, publishing tool, Pages host, or development server
  participates in core implementation, goals, evidence, or maturity credit.
