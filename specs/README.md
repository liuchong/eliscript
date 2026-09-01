# Specifications

Numbered specifications are the normative design record for the Eliscript
language, compiler, runtime, toolchain, and integrations. This page is the
human-readable catalog; [`index.json`](index.json) is the machine-readable
registry.

[Project README](../README.md) | [1.0 roadmap](0040-maturity-roadmap.md) |
[Persistent data and Emacs design](0041-host-symbiosis-and-persistent-data.md)

## How to Read a Specification

Every specification has two independent metadata fields.

| Field | Values | Meaning |
| --- | --- | --- |
| `Status` | `Draft`, `Accepted`, `Stable`, `Superseded` | Maturity of the design contract |
| `Implementation` | `Pending`, `In progress`, `Implemented`, `Superseded` | Delivery state of the behavior |

`Accepted` means the design is approved for implementation. It does not make
the behavior compatibility-frozen. A public behavior enters the 1.0 contract
only when its specification and conformance feature are both stable.

The specification body defines behavior and acceptance evidence. Directory
READMEs are usage guides; source code and tests are implementations. When these
sources disagree, the registry and contract checker make the mismatch visible
rather than silently choosing one.

## Current Snapshot

The registry currently contains 108 specifications.

| Classification | Count |
| --- | ---: |
| Draft design | 1 |
| Accepted design | 78 |
| Stable design | 29 |
| Implementation in progress | 3 |
| Implemented | 105 |

Compatibility Baseline 1 separately classifies 29 specifications as stable,
76 as provisional, and 3 as planning. That baseline is derived from registry
and feature statuses, so it cannot drift independently.

M7 is complete. M8 is underway, with persistent List, Vector, Map, and Set
implementations, shared value semantics, open protocol dispatch, collection
capabilities, immutable collection construction, single-pass transducers,
owner-token transient Vector, Map, and Set builders, and protocol-driven core
sequence/data algorithms, stack-safe recurrence, deterministic macro-generated
names, Lisp-named protocol/collection/transducer/transient modules, and
Eliscript-maintained core algorithm bodies, first-class immutable Keyword and
Symbol values, root-shared immutable metadata, portable identifier values, and
canonical runtime plus portable List/collection data text, including an
optimized singly linked runtime List with parenthesized canonical text,
synchronous Atom
state references, explicit native JavaScript container conversion, and
process-local host identity hashing for efficient opaque Map/Set keys, and
portable value-semantic Result records and combinators, plus a strict portable
persistent JSON codec and a portable Number/safe-integer foundation
implemented. The P1 persistent collection core now passes its complete
Bun/Node million-value exit audit, and P3 now has canonical persistent Vector
and Map expression syntax plus canonical persistent Set dispatch syntax and
first-class source Keyword values with explicit
native host-property boundaries, and quote now preserves persistent List/
Vector and first-class identifier categories. The Emacs value bridge now has a
bounded 256 MiB real-process gate, and protocol definitions now cross that
value boundary as strict versioned data while retaining fresh local execution
identity. Static transient ownership analysis now rejects lifecycle escape,
and ordinary List construction plus `car`/`cdr`/`cons` now use the canonical
persistent List while `js-cons` preserves explicit host-array prepend. The P3
compatibility freeze now removes the provisional `array`/`object` aliases and
stabilizes the explicit `js-array`/`js-object` host boundary. P4 now also has a
source-bound compiler profile, a one-pass runtime requirement scan checked
against the retained five-pass reference implementation, and constant-time IR
node-kind decisions checked against the retained linear reference.
Source-map-aware emitter indentation now also uses line-segment assembly while
retaining the original character loop as an executable reference. Ordered
source-mark location, direct binary comparison emission, bounded reader
character classification, and ordered Source Map cursors now remove four more
generated hot paths while preserving independent semantic and historical
baselines. P4 now closes with source-bound transient bulk-builder evidence:
Vector, Map, and Set are value-equivalent to repeated persistent construction
while recording 12.329933x, 17.486689x, and 17.937565x median speedups.
The P6 accelerated-operation service now owns reference/worker routing,
continuous result verification, module generations, cancellation, stale-buffer
rejection, and transactional application. Its maintained index integration
and real-worker tests complete PD-09 without application-framework evidence.
P7 and PD-10 now close through a maintained Emacs analysis package: three
equivalent candidates, two selected transducer-backed workflows at 9.648x and
8.082x median warm end-to-end speedup, a source-bound 16,000-character
crossover decision, and a 200-request stable/stale buffer soak. No application
framework contributes to this result.
M9 now has a closed, versioned single-entry project request, a self-hosted
host-neutral graph planner, strict canonical `eliscript-ir` version 1
serialization, and an Eliscript-owned `eliscript-build-report` version 1
operation. Ordinary closure, cycle handling, portable-name fixed points,
complete 57-node IR round trips, build-decision normalization, and
standards-based Bun/Node execution match seed semantics and reproducible bytes.
The self-hosted host now also owns v2 cache identity policy, v1 migration,
selective standard recompilation, portable closure revalidation, and cross-host
Bun/Node reuse. Existing project CLI/configuration routing and multi-entry
identity remain incomplete. Application frameworks and publishing
infrastructure remain replaceable validation outside these core deliverables.

## Reading Paths

For the shortest route through the design, read by intent rather than by file
number.

### Project Direction

1. [0040: Project Maturity Roadmap](0040-maturity-roadmap.md)
2. [0041: Host Symbiosis, Persistent Data, and Emacs Acceleration](0041-host-symbiosis-and-persistent-data.md)
3. [0046: M7 Compatibility Baseline 1](0046-m7-compatibility-baseline.md)

### Language and Compiler

1. [0001: Language and Toolchain Boundary](0001-language-and-toolchain.md)
2. [0003: Implemented Core Language](0003-core-language-v0.md)
3. [0004: Lexical Analysis](0004-lexical-analysis.md)
4. [0007: Compiler IR](0007-intermediate-representation.md)
5. [0008: Direct ESM Emission](0008-direct-ir-emission.md)
6. [0009: Source Maps](0009-source-maps.md)

### Self-hosting and Emacs

1. [0013: Bootstrap Foundation](0013-bootstrap-foundation.md)
2. [0014: Portable Syntax and Reader](0014-portable-syntax-reader.md)
3. [0019: Self-Hosted Compiler Driver](0019-self-hosted-compiler.md)
4. [0020: Worker Protocol](0020-worker-protocol.md)
5. [0022: Emacs Worker Integration](0022-emacs-worker-integration.md)

### Persistent Data and Protocols

1. [0053: Eliscript Persistent Vector](0053-eliscript-persistent-vector.md)
2. [0054: Eliscript Persistent List](0054-eliscript-persistent-list.md)
3. [0055: Eliscript Persistent Map](0055-eliscript-persistent-map.md)
4. [0056: Eliscript Persistent Set](0056-eliscript-persistent-set.md)
5. [0057: Portable Value Semantics](0057-portable-value-semantics.md)
6. [0058: Open Protocol Dispatch](0058-open-protocol-dispatch.md)
7. [0059: Collection Capabilities](0059-collection-capability-protocols.md)
8. [0060: Collection Construction](0060-collection-construction-protocols.md)
9. [0061: Composable Transducers](0061-composable-transducers.md)
10. [0062: Owner-token Transient Collections](0062-owner-token-transient-collections.md)
11. [0063: Protocol-driven Core Algorithms](0063-protocol-driven-core-algorithms.md)
12. [0066: Eliscript-authored Core Protocol and Algorithms](0066-eliscript-authored-core-protocol-algorithms.md)
13. [0067: First-class Keyword and Symbol Values](0067-first-class-keyword-symbol-values.md)
14. [0068: Immutable Metadata Semantics](0068-immutable-metadata-semantics.md)
15. [0069: Canonical Runtime Data Text](0069-canonical-runtime-data-text.md)
16. [0070: Portable Keyword and Symbol Values](0070-portable-identifier-values.md)
17. [0071: Canonical Portable Data Text](0071-canonical-portable-data-text.md)
18. [0072: Atomic State References](0072-atomic-state-references.md)
19. [0073: Native JavaScript Container Interop](0073-native-javascript-container-interop.md)
20. [0074: Process-local Host Identity Hashing](0074-process-local-host-identity-hashing.md)
21. [0075: Portable Result Values](0075-portable-result-values.md)
22. [0076: Portable JSON Values](0076-portable-json-values.md)
23. [0077: Portable Numeric Foundation](0077-portable-numeric-foundation.md)
24. [0078: Persistent Collection Core Exit Audit](0078-persistent-collection-core-exit-audit.md)
25. [0079: Eliscript-authored Protocol Dispatch Policy](0079-eliscript-protocol-dispatch-policy.md)
26. [0080: Canonical Generated Protocol Runtime](0080-canonical-generated-protocol-runtime.md)
27. [0081: Protocol-driven Text and Keyed Object Algorithms](0081-protocol-driven-text-object.md)
28. [0082: Persistent Literal Runtime ABI and Explicit Host Containers](0082-persistent-literal-runtime-abi.md)
29. [0083: Default Persistent Vector Literals and Explicit Host Access](0083-default-persistent-vector-literals.md)
30. [0084: Persistent Map Source Syntax](0084-persistent-map-source-syntax.md)
31. [0085: First-class Source Keyword Values](0085-first-class-source-keywords.md)
32. [0086: Optimized Runtime Persistent List and Canonical Data Text](0086-optimized-runtime-persistent-list.md)
33. [0087: First-class Quoted Persistent Data](0087-first-class-quoted-persistent-data.md)
34. [0091: Transport-safe Protocol Definitions](0091-transport-safe-protocol-definitions.md)
35. [0092: Persistent Set Source Syntax](0092-persistent-set-source-syntax.md)
36. [0096: Profile-guided Compiler Runtime Requirement Scan](0096-profile-guided-compiler-runtime-scan.md)
37. [0097: Profile-guided Constant-time IR Node-kind Decisions](0097-profile-guided-ir-node-kind-decisions.md)
38. [0098: Profile-guided Source-map-aware Emitter Indentation](0098-profile-guided-emitter-indentation.md)
39. [0099: Profile-guided Ordered Source-mark Location](0099-profile-guided-source-mark-location.md)
40. [0100: Profile-guided Binary Comparison Emission](0100-profile-guided-binary-comparison-emission.md)
41. [0101: Profile-guided Reader Character Classification](0101-profile-guided-reader-character-classification.md)
42. [0102: Profile-guided Ordered Source Map Cursors](0102-profile-guided-source-map-cursors.md)
43. [0103: Transient Bulk Builder Performance](0103-transient-bulk-builder-performance.md)
44. [0104: Accelerated Emacs Operation Service](0104-accelerated-emacs-operation-service.md)
45. [0105: Emacs Analysis Performance Reinvestment](0105-emacs-analysis-performance-reinvestment.md)
46. [0106: Versioned Project Request Configuration](0106-versioned-project-request.md)
47. [0107: Self-hosted Project Graph Planning](0107-self-hosted-project-graph-planning.md)
48. [0108: Versioned Canonical IR Serialization](0108-versioned-canonical-ir.md)
49. [0109: Self-hosted Build Decision Reports](0109-self-hosted-build-decision-reports.md)

### Application Validation (Non-core)

These specifications exercise public compiler and ESM boundaries. They are
replaceable application evidence and do not define core goals or maturity.

1. [0010: React Element Compilation](0010-react-elements.md)
2. [0011: Vite Adapter](0011-vite-adapter.md)
3. [0012: Org Publishing](0012-org-publishing.md)

## Contract System

Run the complete contract check with:

```sh
bun run check:contracts
```

The checker verifies that:

- every numbered Markdown specification appears exactly once in `index.json`
- IDs, titles, design statuses, and implementation statuses match the source
- every implemented specification owns at least one conformance feature
- every feature has observable statements and executable evidence
- every evidence locator exists and participates in the default test target
- stable, provisional, and planning classifications agree across contracts

The contract data is split by responsibility:

| Registry | Responsibility |
| --- | --- |
| [`specs/index.json`](index.json) | Specification identity and lifecycle |
| [`tests/conformance/manifest.json`](../tests/conformance/manifest.json) | Observable features and executable evidence |
| [`contracts/public-surface.json`](../contracts/public-surface.json) | Public and internal interface inventory |
| [`contracts/compatibility-matrix.json`](../contracts/compatibility-matrix.json) | Supported Emacs, OS, architecture, and Bun combinations |
| [`contracts/compatibility-baseline.json`](../contracts/compatibility-baseline.json) | Stable, provisional, and planning boundary |

The schemas and change workflow are defined by specifications
[0042](0042-specification-registry.md),
[0044](0044-public-surface-registry.md),
[0045](0045-continuous-compatibility-matrix.md), and
[0046](0046-m7-compatibility-baseline.md).

## Specification Catalog

### Language, Compiler, and Integrations

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0001 | [Language and Toolchain Boundary](0001-language-and-toolchain.md) | Draft | In progress |
| 0002 | [Emacs Acceleration Through JavaScript](0002-emacs-acceleration.md) | Accepted | Implemented |
| 0003 | [Implemented Core Language](0003-core-language-v0.md) | Accepted | Implemented |
| 0004 | [Lexical Analysis and Binding Diagnostics](0004-lexical-analysis.md) | Stable | Implemented |
| 0005 | [Compile-time Macros](0005-compile-time-macros.md) | Stable | Implemented |
| 0006 | [Located Forms and Diagnostic Positions](0006-source-locations.md) | Stable | Implemented |
| 0007 | [Explicit Compiler Intermediate Representation](0007-intermediate-representation.md) | Accepted | Implemented |
| 0008 | [Direct ECMAScript Emission from IR](0008-direct-ir-emission.md) | Accepted | Implemented |
| 0009 | [Source Map v3 Emission](0009-source-maps.md) | Stable | Implemented |
| 0010 | [React Element Compilation](0010-react-elements.md) | Stable | Implemented |
| 0011 | [Vite Adapter](0011-vite-adapter.md) | Stable | Implemented |
| 0012 | [Org Publishing](0012-org-publishing.md) | Stable | Implemented |

### Self-hosting and Emacs Acceleration

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0013 | [Bootstrap Foundation](0013-bootstrap-foundation.md) | Accepted | Implemented |
| 0014 | [Portable Syntax and Reader](0014-portable-syntax-reader.md) | Accepted | Implemented |
| 0015 | [Portable Lexical Analyzer](0015-portable-lexical-analyzer.md) | Accepted | Implemented |
| 0016 | [Portable Macro Expander](0016-portable-macro-expander.md) | Accepted | Implemented |
| 0017 | [Portable IR Lowering](0017-portable-ir-lowering.md) | Accepted | Implemented |
| 0018 | [Portable ESM and Source Map Emission](0018-portable-emission.md) | Accepted | Implemented |
| 0019 | [Self-Hosted Compiler Driver](0019-self-hosted-compiler.md) | Stable | Implemented |
| 0020 | [Emacs Worker Protocol and Measurement Probe](0020-worker-protocol.md) | Stable | Implemented |
| 0021 | [Portable Functions and Dependency Closure](0021-portable-functions.md) | Stable | Implemented |
| 0022 | [Emacs Worker Integration](0022-emacs-worker-integration.md) | Stable | Implemented |

### Libraries, Builds, and Language Closure

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0023 | [Portable Sequence Standard Library](0023-portable-sequence-library.md) | Accepted | Implemented |
| 0024 | [Multi-file Project Builds](0024-project-builds.md) | Stable | Implemented |
| 0025 | [Portable Text Standard Library](0025-portable-text-library.md) | Accepted | Implemented |
| 0026 | [Portable Immutable Object Library](0026-portable-object-library.md) | Accepted | Implemented |
| 0027 | [Portable Data Indexing](0027-portable-data-indexing.md) | Accepted | Implemented |
| 0028 | [Portable Module Composition](0028-portable-module-composition.md) | Stable | Implemented |
| 0029 | [Portable Indexing Composition](0029-portable-indexing-composition.md) | Accepted | Implemented |
| 0030 | [Project Graph Manifest](0030-project-graph-manifest.md) | Stable | Implemented |
| 0031 | [Incremental Project Builds](0031-incremental-project-builds.md) | Stable | Implemented |
| 0032 | [Build Decision Reports](0032-build-decision-reports.md) | Stable | Implemented |
| 0033 | [Build Phase Timings](0033-build-phase-timings.md) | Stable | Implemented |
| 0034 | [Nullish Values](0034-nullish-values.md) | Stable | Implemented |
| 0035 | [Deterministic Seed Macros](0035-deterministic-seed-macros.md) | Stable | Implemented |
| 0036 | [Optional and Rest Function Parameters](0036-function-parameters.md) | Stable | Implemented |
| 0037 | [Async Functions and Await](0037-async-functions.md) | Stable | Implemented |
| 0038 | [Exception Control Flow](0038-exception-control-flow.md) | Stable | Implemented |
| 0039 | [Vector Binding Patterns](0039-vector-binding-patterns.md) | Stable | Implemented |

### Project Governance and Compatibility

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0040 | [Project Maturity Roadmap and 1.0 Acceptance Contract](0040-maturity-roadmap.md) | Accepted | In progress |
| 0041 | [Host Symbiosis, Persistent Data, and Emacs Acceleration](0041-host-symbiosis-and-persistent-data.md) | Accepted | In progress |
| 0042 | [Specification Registry and Conformance Evidence](0042-specification-registry.md) | Stable | Implemented |
| 0043 | [Structured Compiler Diagnostics](0043-structured-diagnostics.md) | Stable | Implemented |
| 0044 | [Public Surface Registry and Consistency Matrix](0044-public-surface-registry.md) | Stable | Implemented |
| 0045 | [Continuous Compatibility Matrix](0045-continuous-compatibility-matrix.md) | Stable | Implemented |
| 0046 | [M7 Compatibility Baseline 1](0046-m7-compatibility-baseline.md) | Stable | Implemented |

### Persistent Data and Protocols

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0047 | [Persistent Vector Trie Prototype](0047-persistent-vector-prototype.md) | Accepted | Implemented |
| 0048 | [Value Equality and Deterministic Hashing](0048-value-equality-and-hashing.md) | Accepted | Implemented |
| 0049 | [Persistent Hash Map Trie Prototype](0049-persistent-hash-map-prototype.md) | Accepted | Implemented |
| 0050 | [Persistent Hash Set Prototype](0050-persistent-hash-set-prototype.md) | Accepted | Implemented |
| 0051 | [HAMT Layout Benchmark and Threshold Selection](0051-hamt-layout-benchmark.md) | Accepted | Implemented |
| 0052 | [Portable 32-bit Integer Operations](0052-portable-32-bit-operations.md) | Accepted | Implemented |
| 0053 | [Eliscript-authored Persistent Vector Trie](0053-eliscript-persistent-vector.md) | Accepted | Implemented |
| 0054 | [Eliscript-authored Persistent List](0054-eliscript-persistent-list.md) | Accepted | Implemented |
| 0055 | [Eliscript-authored Persistent HAMT Map](0055-eliscript-persistent-map.md) | Accepted | Implemented |
| 0056 | [Eliscript-authored Persistent Map-backed Set](0056-eliscript-persistent-set.md) | Accepted | Implemented |
| 0057 | [Portable Value Semantics Core](0057-portable-value-semantics.md) | Accepted | Implemented |
| 0058 | [Open Protocol Dispatch Core](0058-open-protocol-dispatch.md) | Accepted | Implemented |
| 0059 | [Collection Capability Protocols and Reduction Foundation](0059-collection-capability-protocols.md) | Accepted | Implemented |
| 0060 | [Collection Construction Protocols](0060-collection-construction-protocols.md) | Accepted | Implemented |
| 0061 | [Composable Transducers and Protocol-driven Into](0061-composable-transducers.md) | Accepted | Implemented |
| 0062 | [Owner-token Transient Collections](0062-owner-token-transient-collections.md) | Accepted | Implemented |
| 0063 | [Protocol-driven Core Sequence and Data Algorithms](0063-protocol-driven-core-algorithms.md) | Accepted | Implemented |
| 0064 | [Stack-safe Loop and Recur](0064-stack-safe-loop-recur.md) | Accepted | Implemented |
| 0065 | [Deterministic Macro-generated Names and Capture Rules](0065-deterministic-macro-generated-names.md) | Accepted | Implemented |
| 0066 | [Eliscript-authored Core Protocol Surface and Algorithms](0066-eliscript-authored-core-protocol-algorithms.md) | Accepted | Implemented |
| 0067 | [First-class Keyword and Symbol Values](0067-first-class-keyword-symbol-values.md) | Accepted | Implemented |
| 0068 | [Immutable Metadata Semantics](0068-immutable-metadata-semantics.md) | Accepted | Implemented |
| 0069 | [Canonical Runtime Data Text](0069-canonical-runtime-data-text.md) | Accepted | Implemented |
| 0070 | [Portable Keyword and Symbol Values](0070-portable-identifier-values.md) | Accepted | Implemented |
| 0071 | [Canonical Portable Data Text](0071-canonical-portable-data-text.md) | Accepted | Implemented |
| 0072 | [Atomic State References](0072-atomic-state-references.md) | Accepted | Implemented |
| 0073 | [Native JavaScript Container Interop](0073-native-javascript-container-interop.md) | Accepted | Implemented |
| 0074 | [Process-local Host Identity Hashing](0074-process-local-host-identity-hashing.md) | Accepted | Implemented |
| 0075 | [Portable Result Values](0075-portable-result-values.md) | Accepted | Implemented |
| 0076 | [Portable JSON Values](0076-portable-json-values.md) | Accepted | Implemented |
| 0077 | [Portable Numeric Foundation](0077-portable-numeric-foundation.md) | Accepted | Implemented |
| 0078 | [Persistent Collection Core Exit Audit](0078-persistent-collection-core-exit-audit.md) | Accepted | Implemented |
| 0079 | [Eliscript-authored Protocol Dispatch Policy](0079-eliscript-protocol-dispatch-policy.md) | Accepted | Implemented |
| 0080 | [Canonical Generated Protocol Runtime](0080-canonical-generated-protocol-runtime.md) | Accepted | Implemented |
| 0081 | [Protocol-driven Text and Keyed Object Algorithms](0081-protocol-driven-text-object.md) | Accepted | Implemented |
| 0082 | [Persistent Literal Runtime ABI and Explicit Host Containers](0082-persistent-literal-runtime-abi.md) | Accepted | Implemented |
| 0083 | [Default Persistent Vector Literals and Explicit Host Access](0083-default-persistent-vector-literals.md) | Accepted | Implemented |
| 0084 | [Persistent Map Source Syntax](0084-persistent-map-source-syntax.md) | Accepted | Implemented |
| 0085 | [First-class Source Keyword Values](0085-first-class-source-keywords.md) | Accepted | Implemented |
| 0086 | [Optimized Runtime Persistent List and Canonical Data Text](0086-optimized-runtime-persistent-list.md) | Accepted | Implemented |
| 0087 | [First-class Quoted Persistent Data](0087-first-class-quoted-persistent-data.md) | Accepted | Implemented |
| 0088 | [Versioned Emacs Worker Persistent Value Codec](0088-emacs-worker-value-codec.md) | Accepted | Implemented |
| 0089 | [Chunked Emacs Worker Value Streams](0089-chunked-emacs-worker-values.md) | Accepted | Implemented |
| 0090 | [Large Emacs Worker Value Stream Memory Probe](0090-large-worker-value-memory-probe.md) | Accepted | Implemented |
| 0091 | [Transport-safe Protocol Definitions](0091-transport-safe-protocol-definitions.md) | Accepted | Implemented |
| 0092 | [Persistent Set Source Syntax](0092-persistent-set-source-syntax.md) | Accepted | Implemented |
| 0093 | [Static Transient Ownership Analysis](0093-static-transient-ownership-analysis.md) | Accepted | Implemented |
| 0094 | [Persistent List Language Semantics and Explicit Host Cons](0094-persistent-list-language-semantics.md) | Accepted | Implemented |
| 0095 | [Stable Persistent Value and Explicit Host Container Boundary](0095-stable-persistent-host-container-boundary.md) | Stable | Implemented |
| 0096 | [Profile-guided Compiler Runtime Requirement Scan](0096-profile-guided-compiler-runtime-scan.md) | Accepted | Implemented |
| 0097 | [Profile-guided Constant-time IR Node-kind Decisions](0097-profile-guided-ir-node-kind-decisions.md) | Accepted | Implemented |
| 0098 | [Profile-guided Source-map-aware Emitter Indentation](0098-profile-guided-emitter-indentation.md) | Accepted | Implemented |
| 0099 | [Profile-guided Ordered Source-mark Location](0099-profile-guided-source-mark-location.md) | Accepted | Implemented |
| 0100 | [Profile-guided Binary Comparison Emission](0100-profile-guided-binary-comparison-emission.md) | Accepted | Implemented |
| 0101 | [Profile-guided Reader Character Classification](0101-profile-guided-reader-character-classification.md) | Accepted | Implemented |
| 0102 | [Profile-guided Ordered Source Map Cursors](0102-profile-guided-source-map-cursors.md) | Accepted | Implemented |
| 0103 | [Transient Bulk Builder Performance](0103-transient-bulk-builder-performance.md) | Accepted | Implemented |
| 0104 | [Accelerated Emacs Operation Service](0104-accelerated-emacs-operation-service.md) | Accepted | Implemented |
| 0105 | [Emacs Analysis Performance Reinvestment](0105-emacs-analysis-performance-reinvestment.md) | Accepted | Implemented |
| 0106 | [Versioned Project Request Configuration](0106-versioned-project-request.md) | Accepted | Implemented |
| 0107 | [Self-hosted Project Graph Planning](0107-self-hosted-project-graph-planning.md) | Accepted | Implemented |
| 0108 | [Versioned Canonical IR Serialization](0108-versioned-canonical-ir.md) | Accepted | Implemented |
| 0109 | [Self-hosted Build Decision Reports](0109-self-hosted-build-decision-reports.md) | Accepted | Implemented |
| 0110 | [Self-hosted Incremental Project Cache](0110-self-hosted-incremental-project-cache.md) | Accepted | Implemented |

## Adding a Specification

1. Choose the next four-digit ID and add `NNNN-short-name.md`.
2. Add matching metadata to `index.json`.
3. When implementation exists, add its feature and evidence to the conformance
   manifest.
4. Update this catalog in the same change.
5. Run `bun run check:contracts`, then run the complete test suite.

Do not mark a specification implemented without executable evidence. Do not
mark a feature stable while its specification remains draft or accepted.
