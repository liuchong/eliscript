# Specifications

Numbered specifications are the normative design record for the Eliscript
language, compiler, runtime, toolchain, and integrations. This page is the
human-readable catalog; [`index.json`](index.json) is the machine-readable
registry.

[Project README](../README.md) | [Core documentation](../docs/README.md) |
[1.0 roadmap](0040-maturity-roadmap.md) |
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

The registry currently contains 180 specifications.

| Classification | Count |
| --- | ---: |
| Draft design | 2 |
| Accepted design | 2 |
| Stable design | 175 |
| Superseded design | 1 |
| Implementation in progress | 3 |
| Implemented | 175 |
| Pending implementation | 1 |
| Superseded implementation | 1 |

Compatibility Baseline 2 separately classifies 175 specifications as stable,
none as provisional, 4 as planning, and 1 as superseded. That baseline is
derived from registry and feature statuses, so it cannot drift independently.

M7 and M8 are complete. M8 includes persistent List, Vector, Map, and Set
implementations, shared value semantics, open protocol dispatch, collection
capabilities, immutable collection construction, single-pass transducers,
owner-token transient Vector, Map, and Set builders, and protocol-driven core
sequence/data algorithms, stack-safe recurrence, deterministic macro-generated
names and declared, digest-tracked macro file inputs, Lisp-named
protocol/collection/transducer/transient modules, and
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
Vector, Map, and Set are value-equivalent to repeated persistent construction,
every maintained builder exceeds its 1.5x median-speedup floor, and each
allocates no more than one third of the persistent-path nodes.
The P6 accelerated-operation service now owns reference/worker routing,
continuous result verification, module generations, cancellation, stale-buffer
rejection, and transactional application. Its maintained index integration
and real-worker tests complete PD-09 without application-framework evidence.
P7 and PD-10 now close through a maintained Emacs analysis package: three
equivalent candidates, two selected transducer-backed workflows at 9.679x and
8.267x median warm end-to-end speedup, a source-bound 16,000-character
crossover decision, and a 200-request stable/stale buffer soak. No application
framework contributes to this result.
M9 is complete with closed, versioned single-entry and multi-entry project
requests, a self-hosted
host-neutral graph planner, strict canonical `eliscript-ir` version 1
serialization, and an Eliscript-owned `eliscript-build-report` version 1
operation. Ordinary closure, cycle handling, portable-name fixed points,
complete 57-node IR round trips, build-decision normalization, and
standards-based Bun/Node execution match seed semantics and reproducible bytes.
The self-hosted host also owns v2 cache identity policy, v1 migration,
selective standard recompilation, portable closure revalidation, and cross-host
Bun/Node reuse. Version 2 configuration, manifest, report, cache validation,
CLI output, and worker loading now identify the union of multiple entry
closures while preserving version 1 single-entry behavior. Application
frameworks and publishing infrastructure remain replaceable validation
outside these core deliverables.
M10 has all 6/6 implementation units complete through specifications 0114
through 0121 and 0133. The generated compiler owns a
comment-preserving deterministic formatter, and the Bun/Node public command
provides stdout, atomic write, format-check, and structured diagnostics. The
formatter passes idempotence and generated-ESM equivalence over maintained
compiler and standard-library sources. The maintained Emacs mode now provides
syntax, indentation, font locking, Imenu, definition movement, project
discovery, and transactional formatter integration. A versioned read-only
project check now traverses configured source closures without build artifacts,
supports unsaved stdin source, agrees across Bun and Node, and reports compiler
diagnostics through Flymake. The public toolchain supports virtual-source
project builds and buffer/file/project compilation through Emacs
compilation-mode. Versioned seed/self-hosted evaluation descriptors now drive a
persistent Bun/Node process with canonical value printing, source-mapped
failures, atomic namespace revisions, output framing, and project-scoped Emacs
sessions that restore acknowledged state after a host restart. The public
terminal REPL adds compiler-owned multiline input
classification, persistent definitions and macros, load/reload/reset commands,
recoverable diagnostics, prompt policy, and equivalent Bun/Node behavior.
A versioned project watch stream now normalizes content-level source changes
across Bun and Node, while the Emacs mode shares one process per project and
refreshes matching Flymake buffers. The verified onboarding guide executes the
documented project, compiler, host, REPL, and editor path. The AC-12 matrix and
M10 exit audit are complete in the retained acceptance evidence.

M11 has all 6/6 implementation units complete. Its 43-module, 584-export API
index is generated from explicit metadata and the checked public surface.
The portable library now includes callable value-dispatched multimethods with
value-semantic keys, immutable derivation hierarchies, transitive preferences,
explicit ambiguity, and persistent method and preference snapshots.
Declarative multimethod and protocol forms expose these runtime abstractions as
top-level language constructs while retaining explicit standard-library imports
and one canonical dispatch implementation. First-position, last-position, and
named threading plus truthy and nil-only conditional bindings provide
single-evaluation expression composition without a new runtime layer.
Browser and worker platform packages now expose only named host authority,
inject request-scoped progress and cancellation into the real worker, and keep
frameworks outside core evidence. Core compatibility stabilization is now
173/173 complete. The JavaScript package interoperation fixture in
specification 0142 is stable under the required local acceptance profile from
specification 0179. Linux x64 remains a visible optional target.

M12 has all 6/6 implementation units complete through specifications 0127
through 0132. The fixed 100,000-input corpus checks seed/self-hosted reader agreement,
structured diagnostics, recursive spans, formatter round trips, and compiler
behavior. The fixed 1,000-module chain, diamond, cycle, and shared-dependency
graph checks exact no-op and mutation sets, evaluated propagation through
reused importers, complete clean-build equivalence, and bounded resources. The
100,000-request real Emacs worker soak adds exact response accounting across
five generations, cancellation, replacement, timeout, process-death recovery,
bounded peak and steady-state RSS, clean shutdown, and PID reclamation. AC-18,
AC-09, and AC-19 are complete. The hostile-boundary matrix checks direct and
symbolic root containment, declared macro and worker authority, closed schemas
and protocols, and physical output isolation across Emacs seed, Bun, and Node.
AC-20 is complete. Source-bound performance evidence retains three independent
compiler, project-build, worker, and persistent-data workload runs under fixed
budgets. Repository integrity checks dependency boundaries, regenerated
artifacts, and every benchmark source binding. The M12 exit audit is complete
in the retained acceptance evidence.

M13 has completed all 5/5 implementation units through specification 0138. Its
versioned corpus derives all 35 mandatory AC/PD criteria from normative
headings, maps each criterion to bounded probes and tracked evidence, and
retains one clean audit with all 35 mandatory criteria passing and no incomplete
or failed criteria. Specification 0135 records the local,
source-bound onboarding exercise for M13-02 with all six steps passing within
the active-step budget. Specification 0136 records the passing direct local
migration rehearsal for M13-03; its original run left AC-02 incomplete before
the final stability promotion.
Specification 0137 completes M13-04 and AC-23 with an exact eleven-document
core inventory, checked local links, and five executable examples. Specification
0138 adds canonical machine-readable and human-readable acceptance artifacts,
five evidence summaries, a blocking-defect gate, and deterministic rejection
of forged final results. Application and publishing documentation remains
outside the core gate. AC-24 and all 35 mandatory criteria are now complete
under the explicit local acceptance profile.

Post-M13 verification now closes PD-01 through specification 0139. Its fixed
cross-host corpus executes 100,000 independently replayable operation
sequences for each persistent collection family, freezes exact semantic
summaries, and proves every retained older version unchanged after later
updates. Specification 0140 closes AC-08 through one clean configured project
workflow covering public format-check, check, build, standard ESM execution,
watch lifecycle, and command-line precedence. Specification 0141 defines the
AC-07 proof as twenty direct local compiler builds and complete core acceptance
executions with one versioned identity. Retained run `m13-04` completes the
criterion with twenty clean, operational, identity-equivalent executions.
Specification 0146 closes AC-05 with a source-bound compiler parity corpus over
71 stable compiler-relevant features, 122 valid fixtures, 110 diagnostics, all
13 bootstrap modules, all 58 public IR kinds, and seven observable parity
dimensions. Specification 0147 now derives a complete stable compatibility
corpus over 173 stable core features, 679 evidence locators, 101 core fixtures,
and all three migration records. Its provisional inventory is empty and AC-02
is complete after the clean retained acceptance run.

## Reading Paths

For the shortest route through the design, read by intent rather than by file
number.

### Project Direction

1. [0040: Project Maturity Roadmap](0040-maturity-roadmap.md)
2. [0041: Host Symbiosis, Persistent Data, and Emacs Acceleration](0041-host-symbiosis-and-persistent-data.md)
3. [0046: M7 Compatibility Baseline](0046-m7-compatibility-baseline.md)

### Language and Compiler

1. [0001: Language and Toolchain Boundary](0001-language-and-toolchain.md)
2. [0003: Implemented Core Language](0003-core-language-v0.md)
3. [0004: Lexical Analysis](0004-lexical-analysis.md)
4. [0007: Compiler IR](0007-intermediate-representation.md)
5. [0008: Direct ESM Emission](0008-direct-ir-emission.md)
6. [0009: Source Maps](0009-source-maps.md)
7. [0160: Threading and Conditional Binding Forms](0160-threading-and-conditional-binding-forms.md)

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
50. [0125: Generated Library API Index](0125-generated-library-api-index.md)
51. [0126: Explicit Browser and Worker Capability Packages](0126-explicit-host-capability-packages.md)
52. [0127: Deterministic Reader and Program Fuzzing](0127-deterministic-reader-program-fuzz.md)
53. [0128: Deterministic Project Scale and Invalidation](0128-project-scale-invalidation.md)
54. [0129: Worker Lifecycle Soak and Recovery](0129-worker-lifecycle-soak.md)
55. [0130: Hostile Boundary Security](0130-hostile-boundary-security.md)

### Application Validation (Non-core)

These specifications exercise public compiler and ESM boundaries. They are
replaceable application evidence and do not define core goals or maturity.

1. [0011: Vite Adapter](0011-vite-adapter.md)
2. [0012: Org Publishing](0012-org-publishing.md)

### Superseded Contracts

1. [0010: React Element Compilation](0010-react-elements.md), replaced by
   [0118: Framework-neutral Library Interoperation](0118-framework-neutral-library-interop.md)

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
| [`contracts/library-api.json`](../contracts/library-api.json) | Standard-library module metadata and generated API ownership |
| [`contracts/compatibility-matrix.json`](../contracts/compatibility-matrix.json) | Supported Emacs, OS, architecture, and Bun combinations |
| [`contracts/compatibility-baseline.json`](../contracts/compatibility-baseline.json) | Stable, provisional, and planning boundary |
| [`contracts/compiler-parity-corpus.json`](../contracts/compiler-parity-corpus.json) | Complete seed and self-hosted compiler parity inventory |
| [`contracts/stable-compatibility-corpus.json`](../contracts/stable-compatibility-corpus.json) | Complete stable core behavior and migration inventory |

The schemas and change workflow are defined by specifications
[0042](0042-specification-registry.md),
[0044](0044-public-surface-registry.md),
[0045](0045-continuous-compatibility-matrix.md), and
[0046](0046-m7-compatibility-baseline.md). Generated library API behavior is
defined by [0125](0125-generated-library-api-index.md).

## Specification Catalog

### Language, Compiler, and Integrations

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0001 | [Language and Toolchain Boundary](0001-language-and-toolchain.md) | Draft | In progress |
| 0002 | [Emacs Acceleration Through JavaScript](0002-emacs-acceleration.md) | Stable | Implemented |
| 0003 | [Implemented Core Language](0003-core-language-v0.md) | Stable | Implemented |
| 0004 | [Lexical Analysis and Binding Diagnostics](0004-lexical-analysis.md) | Stable | Implemented |
| 0005 | [Compile-time Macros](0005-compile-time-macros.md) | Stable | Implemented |
| 0006 | [Located Forms and Diagnostic Positions](0006-source-locations.md) | Stable | Implemented |
| 0007 | [Explicit Compiler Intermediate Representation](0007-intermediate-representation.md) | Stable | Implemented |
| 0008 | [Direct ECMAScript Emission from IR](0008-direct-ir-emission.md) | Stable | Implemented |
| 0009 | [Source Map v3 Emission](0009-source-maps.md) | Stable | Implemented |
| 0010 | [React Element Compilation](0010-react-elements.md) | Superseded | Superseded |
| 0011 | [Vite Adapter](0011-vite-adapter.md) | Stable | Implemented |
| 0012 | [Org Publishing](0012-org-publishing.md) | Stable | Implemented |

### Self-hosting and Emacs Acceleration

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0013 | [Bootstrap Foundation](0013-bootstrap-foundation.md) | Stable | Implemented |
| 0014 | [Portable Syntax and Reader](0014-portable-syntax-reader.md) | Stable | Implemented |
| 0015 | [Portable Lexical Analyzer](0015-portable-lexical-analyzer.md) | Stable | Implemented |
| 0016 | [Portable Macro Expander](0016-portable-macro-expander.md) | Stable | Implemented |
| 0017 | [Portable IR Lowering](0017-portable-ir-lowering.md) | Stable | Implemented |
| 0018 | [Portable ESM and Source Map Emission](0018-portable-emission.md) | Stable | Implemented |
| 0019 | [Self-Hosted Compiler Driver](0019-self-hosted-compiler.md) | Stable | Implemented |
| 0020 | [Emacs Worker Protocol and Measurement Probe](0020-worker-protocol.md) | Stable | Implemented |
| 0021 | [Portable Functions and Dependency Closure](0021-portable-functions.md) | Stable | Implemented |
| 0022 | [Emacs Worker Integration](0022-emacs-worker-integration.md) | Stable | Implemented |

### Libraries, Builds, and Language Closure

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0023 | [Portable Sequence Standard Library](0023-portable-sequence-library.md) | Stable | Implemented |
| 0024 | [Multi-file Project Builds](0024-project-builds.md) | Stable | Implemented |
| 0025 | [Portable Text Standard Library](0025-portable-text-library.md) | Stable | Implemented |
| 0026 | [Portable Immutable Object Library](0026-portable-object-library.md) | Stable | Implemented |
| 0027 | [Portable Data Indexing](0027-portable-data-indexing.md) | Stable | Implemented |
| 0028 | [Portable Module Composition](0028-portable-module-composition.md) | Stable | Implemented |
| 0029 | [Portable Indexing Composition](0029-portable-indexing-composition.md) | Stable | Implemented |
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
| 0046 | [M7 Compatibility Baseline](0046-m7-compatibility-baseline.md) | Stable | Implemented |

### Persistent Data and Protocols

| ID | Specification | Status | Implementation |
| --- | --- | --- | --- |
| 0047 | [Persistent Vector Trie Prototype](0047-persistent-vector-prototype.md) | Stable | Implemented |
| 0048 | [Value Equality and Deterministic Hashing](0048-value-equality-and-hashing.md) | Stable | Implemented |
| 0049 | [Persistent Hash Map Trie Prototype](0049-persistent-hash-map-prototype.md) | Stable | Implemented |
| 0050 | [Persistent Hash Set Prototype](0050-persistent-hash-set-prototype.md) | Stable | Implemented |
| 0051 | [HAMT Layout Benchmark and Threshold Selection](0051-hamt-layout-benchmark.md) | Stable | Implemented |
| 0052 | [Portable 32-bit Integer Operations](0052-portable-32-bit-operations.md) | Stable | Implemented |
| 0053 | [Eliscript-authored Persistent Vector Trie](0053-eliscript-persistent-vector.md) | Stable | Implemented |
| 0054 | [Eliscript-authored Persistent List](0054-eliscript-persistent-list.md) | Stable | Implemented |
| 0055 | [Eliscript-authored Persistent HAMT Map](0055-eliscript-persistent-map.md) | Stable | Implemented |
| 0056 | [Eliscript-authored Persistent Map-backed Set](0056-eliscript-persistent-set.md) | Stable | Implemented |
| 0057 | [Portable Value Semantics Core](0057-portable-value-semantics.md) | Stable | Implemented |
| 0058 | [Open Protocol Dispatch Core](0058-open-protocol-dispatch.md) | Stable | Implemented |
| 0059 | [Collection Capability Protocols and Reduction Foundation](0059-collection-capability-protocols.md) | Stable | Implemented |
| 0060 | [Collection Construction Protocols](0060-collection-construction-protocols.md) | Stable | Implemented |
| 0061 | [Composable Transducers and Protocol-driven Into](0061-composable-transducers.md) | Stable | Implemented |
| 0062 | [Owner-token Transient Collections](0062-owner-token-transient-collections.md) | Stable | Implemented |
| 0063 | [Protocol-driven Core Sequence and Data Algorithms](0063-protocol-driven-core-algorithms.md) | Stable | Implemented |
| 0064 | [Stack-safe Loop and Recur](0064-stack-safe-loop-recur.md) | Stable | Implemented |
| 0065 | [Deterministic Macro-generated Names and Capture Rules](0065-deterministic-macro-generated-names.md) | Stable | Implemented |
| 0066 | [Eliscript-authored Core Protocol Surface and Algorithms](0066-eliscript-authored-core-protocol-algorithms.md) | Stable | Implemented |
| 0067 | [First-class Keyword and Symbol Values](0067-first-class-keyword-symbol-values.md) | Stable | Implemented |
| 0068 | [Immutable Metadata Semantics](0068-immutable-metadata-semantics.md) | Stable | Implemented |
| 0069 | [Canonical Runtime Data Text](0069-canonical-runtime-data-text.md) | Stable | Implemented |
| 0070 | [Portable Keyword and Symbol Values](0070-portable-identifier-values.md) | Stable | Implemented |
| 0071 | [Canonical Portable Data Text](0071-canonical-portable-data-text.md) | Stable | Implemented |
| 0072 | [Atomic State References](0072-atomic-state-references.md) | Stable | Implemented |
| 0073 | [Native JavaScript Container Interop](0073-native-javascript-container-interop.md) | Stable | Implemented |
| 0074 | [Process-local Host Identity Hashing](0074-process-local-host-identity-hashing.md) | Stable | Implemented |
| 0075 | [Portable Result Values](0075-portable-result-values.md) | Stable | Implemented |
| 0076 | [Portable JSON Values](0076-portable-json-values.md) | Stable | Implemented |
| 0077 | [Portable Numeric Foundation](0077-portable-numeric-foundation.md) | Stable | Implemented |
| 0078 | [Persistent Collection Core Exit Audit](0078-persistent-collection-core-exit-audit.md) | Stable | Implemented |
| 0079 | [Eliscript-authored Protocol Dispatch Policy](0079-eliscript-protocol-dispatch-policy.md) | Stable | Implemented |
| 0080 | [Canonical Generated Protocol Runtime](0080-canonical-generated-protocol-runtime.md) | Stable | Implemented |
| 0081 | [Protocol-driven Text and Keyed Object Algorithms](0081-protocol-driven-text-object.md) | Stable | Implemented |
| 0082 | [Persistent Literal Runtime ABI and Explicit Host Containers](0082-persistent-literal-runtime-abi.md) | Stable | Implemented |
| 0083 | [Default Persistent Vector Literals and Explicit Host Access](0083-default-persistent-vector-literals.md) | Stable | Implemented |
| 0084 | [Persistent Map Source Syntax](0084-persistent-map-source-syntax.md) | Stable | Implemented |
| 0085 | [First-class Source Keyword Values](0085-first-class-source-keywords.md) | Stable | Implemented |
| 0086 | [Optimized Runtime Persistent List and Canonical Data Text](0086-optimized-runtime-persistent-list.md) | Stable | Implemented |
| 0087 | [First-class Quoted Persistent Data](0087-first-class-quoted-persistent-data.md) | Stable | Implemented |
| 0088 | [Versioned Emacs Worker Persistent Value Codec](0088-emacs-worker-value-codec.md) | Stable | Implemented |
| 0089 | [Chunked Emacs Worker Value Streams](0089-chunked-emacs-worker-values.md) | Stable | Implemented |
| 0090 | [Large Emacs Worker Value Stream Memory Probe](0090-large-worker-value-memory-probe.md) | Stable | Implemented |
| 0091 | [Transport-safe Protocol Definitions](0091-transport-safe-protocol-definitions.md) | Stable | Implemented |
| 0092 | [Persistent Set Source Syntax](0092-persistent-set-source-syntax.md) | Stable | Implemented |
| 0093 | [Static Transient Ownership Analysis](0093-static-transient-ownership-analysis.md) | Stable | Implemented |
| 0094 | [Persistent List Language Semantics and Explicit Host Cons](0094-persistent-list-language-semantics.md) | Stable | Implemented |
| 0095 | [Stable Persistent Value and Explicit Host Container Boundary](0095-stable-persistent-host-container-boundary.md) | Stable | Implemented |
| 0096 | [Profile-guided Compiler Runtime Requirement Scan](0096-profile-guided-compiler-runtime-scan.md) | Stable | Implemented |
| 0097 | [Profile-guided Constant-time IR Node-kind Decisions](0097-profile-guided-ir-node-kind-decisions.md) | Stable | Implemented |
| 0098 | [Profile-guided Source-map-aware Emitter Indentation](0098-profile-guided-emitter-indentation.md) | Stable | Implemented |
| 0099 | [Profile-guided Ordered Source-mark Location](0099-profile-guided-source-mark-location.md) | Stable | Implemented |
| 0100 | [Profile-guided Binary Comparison Emission](0100-profile-guided-binary-comparison-emission.md) | Stable | Implemented |
| 0101 | [Profile-guided Reader Character Classification](0101-profile-guided-reader-character-classification.md) | Stable | Implemented |
| 0102 | [Profile-guided Ordered Source Map Cursors](0102-profile-guided-source-map-cursors.md) | Stable | Implemented |
| 0103 | [Transient Bulk Builder Performance](0103-transient-bulk-builder-performance.md) | Stable | Implemented |
| 0104 | [Accelerated Emacs Operation Service](0104-accelerated-emacs-operation-service.md) | Stable | Implemented |
| 0105 | [Emacs Analysis Performance Reinvestment](0105-emacs-analysis-performance-reinvestment.md) | Stable | Implemented |
| 0106 | [Versioned Project Request Configuration](0106-versioned-project-request.md) | Stable | Implemented |
| 0107 | [Self-hosted Project Graph Planning](0107-self-hosted-project-graph-planning.md) | Stable | Implemented |
| 0108 | [Versioned Canonical IR Serialization](0108-versioned-canonical-ir.md) | Stable | Implemented |
| 0109 | [Self-hosted Build Decision Reports](0109-self-hosted-build-decision-reports.md) | Stable | Implemented |
| 0110 | [Self-hosted Incremental Project Cache](0110-self-hosted-incremental-project-cache.md) | Stable | Implemented |
| 0111 | [Self-hosted Project Command and Configuration](0111-self-hosted-project-command.md) | Stable | Implemented |
| 0112 | [Unified Self-hosted Build Operation](0112-unified-self-hosted-build-operation.md) | Stable | Implemented |
| 0113 | [Versioned Multi-entry Project Identity](0113-versioned-multi-entry-project-identity.md) | Stable | Implemented |
| 0114 | [Deterministic Concrete-syntax Formatter](0114-deterministic-concrete-syntax-formatter.md) | Stable | Implemented |
| 0115 | [Emacs Major Mode Foundation](0115-emacs-major-mode-foundation.md) | Stable | Implemented |
| 0116 | [Read-only Project Check and Emacs Diagnostics](0116-read-only-project-check-and-emacs-diagnostics.md) | Stable | Implemented |
| 0117 | [Virtual-source Builds and Emacs Compilation Commands](0117-virtual-source-builds-and-emacs-compilation.md) | Stable | Implemented |
| 0118 | [Framework-neutral Library Interoperation](0118-framework-neutral-library-interop.md) | Stable | Implemented |
| 0119 | [Self-hosted Persistent Evaluation](0119-self-hosted-persistent-evaluation.md) | Stable | Implemented |
| 0120 | [Interactive Terminal REPL](0120-interactive-terminal-repl.md) | Stable | Implemented |
| 0121 | [Host-neutral Project Watch Events](0121-host-neutral-project-watch.md) | Stable | Implemented |
| 0122 | [Evidence-derived Maturity Progress](0122-evidence-derived-maturity-progress.md) | Stable | Implemented |
| 0123 | [Stable ECMAScript Module Import Contract](0123-stable-esm-import-contract.md) | Stable | Implemented |
| 0124 | [Declared Macro File Dependencies](0124-declared-macro-file-dependencies.md) | Stable | Implemented |
| 0125 | [Generated Library API Index](0125-generated-library-api-index.md) | Stable | Implemented |
| 0126 | [Explicit Browser and Worker Capability Packages](0126-explicit-host-capability-packages.md) | Stable | Implemented |
| 0127 | [Deterministic Reader and Program Fuzzing](0127-deterministic-reader-program-fuzz.md) | Stable | Implemented |
| 0128 | [Deterministic Project Scale and Invalidation](0128-project-scale-invalidation.md) | Stable | Implemented |
| 0129 | [Worker Lifecycle Soak and Recovery](0129-worker-lifecycle-soak.md) | Stable | Implemented |
| 0130 | [Hostile Boundary Security](0130-hostile-boundary-security.md) | Stable | Implemented |
| 0131 | [Source-bound Core Performance Baseline](0131-source-bound-core-performance-baseline.md) | Stable | Implemented |
| 0132 | [Repository Dependency and Generated-artifact Audits](0132-repository-integrity-audits.md) | Stable | Implemented |
| 0133 | [Verified Installation and Daily Development Guide](0133-verified-onboarding-documentation.md) | Stable | Implemented |
| 0134 | [Versioned Core Acceptance Corpus and Truthful Audit Run](0134-versioned-core-acceptance-corpus.md) | Stable | Implemented |
| 0135 | [Traceable Local Onboarding Exercise](0135-local-onboarding.md) | Stable | Implemented |
| 0136 | [Local Compatibility Migration Rehearsal](0136-local-compatibility-migration-rehearsal.md) | Stable | Implemented |
| 0137 | [Complete Core Documentation Set](0137-complete-core-documentation.md) | Stable | Implemented |
| 0138 | [Versioned Final Acceptance Artifacts](0138-versioned-final-acceptance-artifacts.md) | Stable | Implemented |
| 0139 | [Deterministic Persistent Semantics Corpus](0139-deterministic-persistent-semantics-corpus.md) | Stable | Implemented |
| 0140 | [Clean Configured Project Workflow](0140-clean-configured-project-workflow.md) | Stable | Implemented |
| 0141 | [Repeated Core Determinism Evidence](0141-repeated-core-determinism.md) | Stable | Implemented |
| 0142 | [Maintained JavaScript Package Interop Fixture](0142-maintained-javascript-package-interop.md) | Stable | Implemented |
| 0143 | [Complete Negative Diagnostic Corpus](0143-complete-negative-diagnostic-corpus.md) | Stable | Implemented |
| 0144 | [Source-level Failure Mapping](0144-source-level-failure-mapping.md) | Stable | Implemented |
| 0145 | [Language Value Equality](0145-language-value-equality.md) | Stable | Implemented |
| 0146 | [Complete Compiler Parity Corpus](0146-complete-compiler-parity-corpus.md) | Stable | Implemented |
| 0147 | [Complete Stable Compatibility Corpus](0147-complete-stable-compatibility-corpus.md) | Stable | Implemented |
| 0148 | [Map Binding Patterns](0148-map-binding-patterns.md) | Stable | Implemented |
| 0149 | [Portable Functional Combinators](0149-portable-functional-combinators.md) | Stable | Implemented |
| 0150 | [Protocol-driven Finite Sequence Selection](0150-protocol-driven-finite-sequence-selection.md) | Stable | Implemented |
| 0151 | [Replayable Bounded and Unbounded Sequence Sources](0151-replayable-sequence-sources.md) | Stable | Implemented |
| 0152 | [Replayable Reducible Transducer Pipelines](0152-replayable-reducible-transducer-pipelines.md) | Stable | Implemented |
| 0153 | [Key/Value Reduction Protocol](0153-key-value-reduction-protocol.md) | Stable | Implemented |
| 0154 | [Map, Set, and Stack Capability Protocols](0154-map-set-stack-capability-protocols.md) | Stable | Implemented |
| 0155 | [Reversible Collection Traversal](0155-reversible-collection-traversal.md) | Stable | Implemented |
| 0156 | [Value-dispatched Multimethods](0156-value-dispatched-multimethods.md) | Stable | Implemented |
| 0157 | [Persistent Dispatch Hierarchies and Preferred Multimethods](0157-persistent-dispatch-hierarchies.md) | Stable | Implemented |
| 0158 | [Declarative Multimethod Definitions](0158-declarative-multimethod-definitions.md) | Stable | Implemented |
| 0159 | [Declarative Protocol Definitions](0159-declarative-protocol-definitions.md) | Stable | Implemented |
| 0160 | [Threading and Conditional Binding Forms](0160-threading-and-conditional-binding-forms.md) | Stable | Implemented |
| 0161 | [Deferred and Memoized Computation](0161-deferred-and-memoized-computation.md) | Stable | Implemented |
| 0162 | [Collection Capability Predicates and Empty Value Semantics](0162-collection-capability-predicates.md) | Stable | Implemented |
| 0163 | [Replayable Sequence Head and Tail Views](0163-replayable-sequence-head-tail-views.md) | Stable | Implemented |
| 0164 | [Persistent Collection Classification and Bounded Inspection](0164-persistent-collection-classification.md) | Stable | Implemented |
| 0165 | [Persistent Subvector Views](0165-persistent-subvector-views.md) | Stable | Implemented |
| 0166 | [Persistent Queue](0166-persistent-queue.md) | Stable | Implemented |
| 0167 | [Persistent Queue Language Literals](0167-persistent-queue-language-literals.md) | Stable | Implemented |
| 0168 | [Immutable Record Types](0168-immutable-record-types.md) | Stable | Implemented |
| 0169 | [Protocol Implementation Values](0169-protocol-implementation-values.md) | Stable | Implemented |
| 0170 | [Value Dispatch Forms](0170-value-dispatch-forms.md) | Stable | Implemented |
| 0171 | [Multi-arity Functions](0171-multi-arity-functions.md) | Stable | Implemented |
| 0172 | [Local Recursive Functions](0172-local-recursive-functions.md) | Stable | Implemented |
| 0173 | [Persistent Tree Walk and Rewrite](0173-persistent-tree-walk.md) | Stable | Implemented |
| 0174 | [Persistent Zipper Navigation and Editing](0174-persistent-zipper-navigation.md) | Stable | Implemented |
| 0175 | [Persistent Sorted Collections and Range Queries](0175-persistent-sorted-collections.md) | Stable | Implemented |
| 0176 | [Memoized Lazy Sequences and Pull Transduction](0176-memoized-lazy-sequences.md) | Stable | Implemented |
| 0177 | [Lazy Sequence Combinators](0177-lazy-sequence-combinators.md) | Stable | Implemented |
| 0178 | [Immutable Regex Text Processing](0178-immutable-regex-text-processing.md) | Stable | Implemented |
| 0179 | [Local Acceptance Compatibility Profile](0179-local-acceptance-compatibility-profile.md) | Stable | Implemented |
| 0180 | [General Tail-Call Optimization](0180-general-tail-call-optimization.md) | Draft | Pending |

## Adding a Specification

1. Choose the next four-digit ID and add `NNNN-short-name.md`.
2. Add matching metadata to `index.json`.
3. When implementation exists, add its feature and evidence to the conformance
   manifest.
4. Update this catalog in the same change.
5. Run `bun run check:contracts`, then run the complete test suite.

Do not mark a specification implemented without executable evidence. Do not
mark a feature stable while its specification remains draft or accepted.
