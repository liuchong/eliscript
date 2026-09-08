# 0097: Profile-guided Constant-time IR Node-kind Decisions

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0007 Explicit Compiler Intermediate Representation,
  0019 Self-Hosted Compiler Driver,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0095 Stable Persistent Value and Explicit Host Container Boundary,
  0096 Profile-guided Compiler Runtime Requirement Scan

## Summary

The self-hosted compiler now validates IR node kinds through a module-private
native `Set` built once from the frozen node-kind registry. Production
`node-p` and `make-node` decisions therefore perform constant-time native
membership checks instead of scanning all registered kinds for every node.

The previous `Array.prototype.includes` decision remains executable as an
independent linear reference. The optimization is accepted only because both
paths agree over every IR node generated from all maintained self-hosted
compiler modules and over explicit invalid and host-object boundary values.

This is compiler-internal host symbiosis. The native `Set` is not a language
value, a persistent collection replacement, or a new standard-library
dependency.

## Profile Evidence

A repeated self-compilation CPU profile identified `node-p` and its linear
node-kind membership expression as an isolated common path in the latest
self-hosted compiler. The source-bound benchmark therefore compiles the real
maintained compiler corpus instead of constructing a synthetic IR tree.

The reviewed macOS arm64 report covers:

- 335,900 bytes across thirteen maintained compiler modules
- 29,321 real IR nodes and 17 explicit boundary values
- exact optimized/reference agreement for all 29,338 decisions
- 9 alternating timing samples after warmup
- 100 complete corpus passes per sample

The reviewed median is 55.660084 ms for native `Set` membership and
560.254417 ms for the retained linear reference, a 10.065641x local speedup.
The decision threshold was fixed at 1.5x before recording the report. This is
host-specific implementation evidence, not a universal performance promise.

## Node-kind Registry Contract

`node-kinds` is a frozen array in declaration order. Freezing prevents the
exported registry and the module-private native index from diverging after
module initialization. Consumers may inspect and iterate the registry but
cannot add, remove, replace, or reorder entries.

`node-kind-p` returns the native `Set.has` decision without string coercion.
Symbols, nullish values, and unknown strings are rejected. The native index is
not exported and cannot become observable mutable compiler state.

## Node Decision Semantics

`node-p` preserves the previous short-circuit contract:

1. The value must be truthy.
2. Its host `typeof` must be `object`.
3. Reading `kind` uses the ordinary existing host property semantics.
4. The resulting value must occur in the frozen node-kind registry.

Inherited `kind` properties therefore retain their previous behavior. This
slice does not harden IR ownership, alter object shapes, coerce node kinds, or
change malformed-value diagnostics. `make-node` retains the exact unknown-kind
error text and all child validation.

## Reference Contract

`reference-node-kind-p` uses the original frozen-array `includes` scan, and
`reference-node-p` combines that scan with the original object guards. Normal
compilation does not call either reference function.

The reference path must remain independent and readable. It must not delegate
to the production native index, share mutable decision state, or be replaced
by a second constant-time structure. Tests compare exact return values, not
only truthiness, so falsey short-circuit behavior remains observable.

## Reproducible Benchmark Contract

`tools/compiler/ir-kind-benchmark.mjs` owns the corpus, boundary values, source
digest, validation, timing parameters, checksum, and threshold decision. Every
maintained compiler source and the benchmark implementation participates in
the SHA-256 digest.

The benchmark proves exact production/reference agreement before timing. Its
committed report records raw samples, medians, host identity, corpus size,
decision count, checksum, threshold, and outcome. Default tests recompute the
digest and validate the report without rerunning timing as a CI gate.

## Core Boundary

Application frameworks, React integrations, Vite adapters, bundlers, blog or
site generators, publishing tools, and development servers remain application
or integration experiments. None participates in this compiler optimization,
its dependency graph, its benchmark corpus, or its acceptance evidence.

## P4 Status

This slice adds a second profile-guided compiler optimization with an
executable reference and source-bound evidence. It does not close P4: broader
compiler and standard-library hot paths still require profiling, semantic
oracles, and measured gains.

## Acceptance Criteria

- **IKD-01:** The node-kind registry is frozen before its native index is
  constructed.
- **IKD-02:** Production node-kind membership uses one module-private native
  `Set` and does not linearly scan the registry.
- **IKD-03:** `node-p` and `make-node` use the production decision without
  changing valid IR, child validation, or error text.
- **IKD-04:** The original linear membership and node predicate remain
  executable as independent references.
- **IKD-05:** Production and reference return values agree for every real node
  from all maintained self-hosted compiler modules and explicit boundaries.
- **IKD-06:** The reviewed report contains source and host fingerprints, raw
  samples, medians, corpus counts, checksum, threshold, and passing decision.
- **IKD-07:** The reviewed local median speedup is at least 1.5x over the
  retained reference.
- **IKD-08:** Default tests reject digest drift, malformed or incomplete
  reports, failed equivalence, and failed threshold decisions.
- **IKD-09:** Seed/self-hosted parity and the three-generation fixed point
  remain unchanged.
- **IKD-10:** No application framework, UI library, Vite dependency, bundler,
  site generator, publishing tool, or development server participates in the
  core implementation or its evidence.
