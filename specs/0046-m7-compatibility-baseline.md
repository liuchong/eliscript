# 0046: M7 Compatibility Baseline

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0042 Specification Registry and Conformance Evidence,
  0044 Public Surface Registry and Consistency Matrix,
  0045 Continuous Compatibility Matrix

## Summary

Eliscript Compatibility Baseline 1 closed M7 by dividing every current
specification and conformance feature into an explicit compatibility class:

- **stable:** implemented behavior covered by the compatibility promise
- **provisional:** implemented and tested behavior that may still change before
  the 1.0 core language freeze
- **planning:** draft, pending, or in-progress work that is not a current
  implementation contract

The classification lives in
`contracts/compatibility-baseline.json`. The default contract checker derives
the expected groups independently from the specification index and conformance
manifest. A missing item, duplicate classification, stale promotion, or stable
specification with provisional feature evidence fails before the test suite.

The versioned registry now records baseline 2. It retains the same
classification model while applying the pre-1.0 framework-neutral migration
defined by specification 0118. Baseline 1 remains historical evidence; baseline
2 is the current compatibility target.

## Stable Contract

Baseline 2 currently classifies 102 specifications and their 102 conformance
features as stable. The stable set covers these externally meaningful areas:

- lexical binding, deterministic macro behavior, source locations, and Source
  Map v3 output
- separately maintained application validation adapters over public compiler
  output
- reproducible self-hosting and the compiler fixed-point requirement
- worker protocol v1, portable function closure, resilient Emacs worker
  integration, and portable module composition
- multi-file builds, project graph identity, incremental decisions, build
  reports, and phase timings
- nullish values, optional/rest parameters, async/await, exceptions, and
  vector binding patterns
- deterministic value equality and hashing, first-class identifiers, immutable
  metadata, canonical runtime and portable data text, 32-bit operations,
  persistent List/Vector/Map/Set implementations, collection protocols,
  transducers, owner-token transient builders, synchronous Atom state,
  explicit JavaScript container conversion, process-local host identity
  hashing, value-semantic Result records, strict JSON, and checked numeric
  foundations, plus the million-value collection exit contract, generated
  protocol policy/runtime, and protocol-driven text and keyed-object algorithms
- portable Array/Object compatibility modules for sequence traversal, text,
  immutable host-object operations, and keyed data indexing
- persistent source literals and quoted values, the stable literal ABI,
  transport-safe protocol definitions, and static transient ownership
- versioned Emacs persistent-value encoding, bounded chunk framing, and the
  source-bound 256 MiB real-process memory contract
- seven profile-guided compiler optimizations with independent semantic
  references, fixed-point preservation, and source-bound performance decisions
- transient bulk-builder performance floors, the accelerated Emacs operation
  service, and two maintained warm workflows exceeding the 2.0x end-to-end
  acceptance floor
- closed project requests, self-hosted graph planning, canonical IR,
  compiler-owned reports and cache policy, unified public build operations,
  and versioned multi-entry project identity across Bun and Node
- the compiler-owned concrete-syntax formatter, fixed version 1 layout,
  idempotence, ESM equivalence, atomic write/check behavior, and diagnostics
- specification, diagnostic, public-surface, continuous compatibility, and
  compatibility-baseline schemas

Stable means that programs and integrations inside the stated contract do not
silently change meaning. Compatible additions remain allowed. Internal
algorithms, allocation choices, generated local names, timing values, and
other explicitly non-identity observations remain implementation details.

## Provisional Contract

Thirty-nine implemented specifications and features remain provisional. They
cover the broad pre-1.0 language, compiler internals, remaining standard-library
modules, editor tooling, host interop, compatibility-matrix closure, and final
acceptance evidence whose public contracts may still change before the 1.0
freeze.

Provisional does not mean untested. Every item continues to own executable
evidence and remains in the public-surface inventory where applicable. It
means an incompatible change may still occur with a specification update and
migration note before 1.0.

## Planning Contract

Three specifications remain planning work:

- 0001 is the still-evolving top-level language and toolchain boundary
- 0040 remains in progress until AC-01 through AC-24 pass
- 0041 remains pending until persistent values, protocols, transducers, and
  Emacs performance reinvestment are implemented and PD-01 through PD-11 pass

Planning specifications may guide implementation, but they cannot be cited as
evidence that their deliverables already exist.

## Machine-Readable Baseline

The version 1 baseline contains sorted, unique identifiers under:

```text
specifications.stable
specifications.provisional
specifications.planning
features.stable
features.provisional
```

The checker derives the corresponding expected sets using these rules:

1. `Stable` specifications must be implemented and appear in
   `specifications.stable`.
2. `Accepted` and implemented specifications appear in
   `specifications.provisional`.
3. Every non-implemented specification appears in
   `specifications.planning`.
4. A feature owned by a stable specification must itself be stable.
5. A stable feature cannot be owned by a draft or accepted specification.
6. Every conformance feature appears exactly once in the stable or provisional
   feature set.

These relationships are checked from structured data rather than inferred
from prose or counts.

## Compatibility Changes

A compatible change may:

- add syntax that does not alter existing valid programs
- add a CLI option without changing existing defaults
- add fields whose schema explicitly permits additive readers
- improve diagnostics while preserving stable codes, phases, spans, and
  machine-readable structure
- optimize implementation while preserving output identity where identity is
  part of the owning specification

An incompatible change to a stable contract requires:

1. a superseding numbered specification
2. an explicit migration note
3. updated conformance fixtures proving old and new behavior boundaries
4. a deprecation path when the old behavior can remain observable
5. a new compatibility-baseline version

Changing only the baseline JSON cannot make a behavior stable. The owning
specification, conformance status, implementation, evidence, and baseline must
agree in one change.

## M7 Exit Audit

| M7 deliverable | Evidence |
| --- | --- |
| specification status index and inventory | `specs/index.json`, specification checker |
| versioned conformance manifest | `tests/conformance/manifest.json`, negative evidence tests |
| normalized JSON diagnostics | `eliscript-diagnostic` v1 across seed, project, and self-hosted CLIs |
| public versus internal interfaces | `contracts/public-surface.json`, exact implementation comparisons |
| documentation consistency | specification metadata parity and required/forbidden documentation assertions |
| macOS/Linux and Emacs 29/30 checks | deterministic four-cell compatibility workflow |
| generated coverage matrices | conformance, public-surface, and compatibility reports before every suite |
| stable/provisional boundary | `contracts/compatibility-baseline.json` and baseline parity checks |

The M7 evidence recorded a complete local suite and the then-current four-cell
compatibility matrix. Final 1.0 acceptance requires fresh source-bound evidence
for every supported cell; historical M7 results do not satisfy that gate.

M7 completion does not imply M8 language closure or 1.0 completion. It means
the existing project now has an explicit, enforceable boundary from which
those changes can proceed without accidental compatibility claims.

## Acceptance Evidence

- Every numbered specification is classified exactly once.
- Every conformance feature is classified exactly once.
- Stable specification and feature statuses agree bidirectionally.
- Negative tests reject missing baseline entries and partially promoted
  stable contracts.
- The default local suite and the four-cell remote compatibility matrix pass.
- Every later promotion remains explicit in the owning specification,
  conformance manifest, public-surface registry, and versioned baseline.
