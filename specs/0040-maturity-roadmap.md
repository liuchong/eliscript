# 0040: Project Maturity Roadmap and 1.0 Acceptance Contract

- Status: Accepted
- Implementation: In progress
- Date: 2026-08-28
- Depends on: 0001 Language and Toolchain Boundary,
  0019 Self-Hosted Compiler Driver, 0022 Emacs Worker Integration,
  0024 Multi-file Project Builds
- Related design: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration

## Summary

This specification defines the long-term plan for turning Eliscript from a
successful language experiment into a mature, dependable project. It combines
four things that must remain aligned:

1. the final product goal
2. the target technical architecture
3. the staged construction plan
4. the mandatory acceptance standard for the 1.0 maturity baseline

The target is not broad Emacs Lisp compatibility and not a new JavaScript
application framework. The target is a stable, self-hosted Lisp-to-ECMAScript
toolchain with first-class Emacs workflows, direct access to the JavaScript
ecosystem, a deliberately small standard library, and enough engineering
quality to build and maintain real applications over time.

The 1.0 maturity baseline is reached only when every mandatory acceptance item
in this document has objective evidence. Milestone completion, feature count,
or elapsed time cannot substitute for the final acceptance gate.

## Current Baseline

Eliscript already has the difficult vertical foundations:

- an Emacs Lisp seed compiler with a located reader, deterministic macro
  expansion, lexical analysis, explicit IR, direct ESM emission, and Source
  Map v3 output
- a compiler written in Eliscript that reaches a byte-identical bootstrap
  fixed point
- direct JavaScript interop, asynchronous functions, exceptions, and vector
  binding patterns, plus application-layer browser UI validation
- optional application-level bundler integration that consumes public
  compiler output without entering the language core
- deterministic Org publishing into a custom browser application
- multi-file project builds, project graph manifests, incremental cache
  decisions, and phase timing reports
- statically validated portable functions and a resilient Emacs-to-JavaScript
  worker protocol
- initial portable bit, sequence, text, object, keyed-data, and persistent
  vector modules
- synchronous Atom state references with validators and ordered nested watch
  notifications
- shared seed/self-hosted conformance fixtures and end-to-end execution tests

This proves that the architecture is viable. It does not yet establish a
mature user contract. The main remaining gaps are:

- the persistent value and explicit host-container boundary is stable, while
  the broader M8 language and standard-library exit audit remains incomplete
- incomplete module interop and core data semantics
- some compiler capabilities outside normal build execution still split
  between the seed and self-hosted paths
- a deterministic formatter and foundational Emacs mode now exist, while
  project diagnostics, the interactive REPL, and the complete editor workflow
  remain absent
- an intentionally small standard library without a documented stability
  classification
- insufficient malformed-input, fuzz, scale, soak, and security evidence
- no multi-project proving period or formal final acceptance report

The roadmap therefore prioritizes contracts, convergence, tools, reliability,
and real-world proof over rapid growth in surface syntax.

## Long-Term Objective

The long-term objective is:

> Eliscript is a stable, self-hosted, Emacs-first functional Lisp language and
> toolchain with persistent immutable values, direct host interop, and
> protocols for producing standard ECMAScript modules and portable
> high-performance Emacs workloads.

A user should be able to start from a clean machine, write a multi-module
Eliscript project, use JavaScript packages directly, receive source-level
diagnostics in Emacs, build deterministic ESM, run it in supported JavaScript
hosts or browsers, and maintain that project without depending on undocumented
compiler behavior.

A compiler contributor should be able to change the primary compiler in
Eliscript, prove behavior against the seed and conformance suites, reproduce
the compiler fixed point, and understand the compatibility impact before the
change is accepted.

## Meaning of Maturity

For this project, maturity has six independent dimensions. All six are
required.

### 1. Stable Language

The supported syntax, values, truthiness, binding, evaluation order, modules,
macros, JavaScript interop, errors, asynchronous behavior, and source mapping
are normative rather than accidental. Programs inside the compatibility
contract do not silently change meaning.

### 2. Authoritative Compiler

The compiler written in Eliscript is the normal implementation path. The
Emacs Lisp seed remains a trusted bootstrap and semantic reference, but users
do not encounter materially different language behavior depending on which
compiler built their program.

### 3. Dependable Toolchain

Single files and projects have documented commands, deterministic output,
machine-readable diagnostics, incremental builds, watch integration, project
configuration, and predictable host boundaries.

### 4. First-Class Emacs Experience

Eliscript is pleasant to edit as a Lisp in Emacs. Indentation, formatting,
navigation, compilation diagnostics, interactive evaluation, and worker
management are coherent parts of the project rather than private setup.

### 5. Proven Host Integration

Generated output is ordinary ESM. Supported JavaScript hosts, browser
execution, command-line programs, and portable Emacs workloads are proven by
host-neutral conformance and real-process tests rather than only isolated
compiler fixtures. Maintained applications may validate those public
boundaries separately, but do not define or satisfy language maturity.

### 6. Sustainable Engineering

Specifications, compatibility policy, testing layers, performance baselines,
security boundaries, contribution workflow, and acceptance evidence make
continued development safer than rediscovering the design on every change.

## Product Boundaries

The following boundaries remain fixed through the maturity roadmap:

- Emacs Lisp compatibility is selective and explicit.
- Dynamic scope and arbitrary Emacs object compatibility are not goals.
- The compiler emits standard ESM and does not invent a proprietary runtime
  module system.
- The compiler, runtime, and standard library do not depend on Vite or any
  bundler-specific API. Application adapters may consume only public ESM, CLI,
  or host-neutral compiler boundaries.
- UI frameworks remain replaceable application/library targets; Eliscript
  does not own a reconciler or a web application framework.
- Framework-specific forms, IR nodes, and automatic runtime injection were
  removed by specification 0118. Application adapters are compatibility-
  tracked integrations, not core language evidence, and remain replaceable
  without changing the core conformance corpus, bootstrap fixed point, runtime,
  or standard library.
- Org publishing remains an adapter over the compiler, not a mandatory part of
  the language core.
- Vite, React, blog generators, site generators, Pages hosting, and other
  application conveniences may validate public language output, but they do
  not define core goals, core dependencies, standard-library scope, milestone
  completion, or final maturity acceptance.
- Portable acceleration handles explicit serializable computation, not
  transparent migration of arbitrary editor state.
- A custom package registry is not required for 1.0. Local `.eli` modules and
  standard JavaScript package imports are sufficient.
- Static typing, native-code emission, and full Emacs package compilation are
  outside the 1.0 acceptance scope.

These exclusions protect the central value of Eliscript: Lisp programmability
with a direct, inspectable JavaScript boundary.

## Hosted Lisp Design Track

The language should improve its hosts rather than merely resemble their
syntax. The project adopts the broad hosted-language strategy demonstrated by
Clojure on the JVM and ClojureScript on JavaScript:

- keep the host platform and its libraries directly reachable
- make immutable persistent collections the default composite values
- define generic algorithms through protocols instead of class hierarchies
- use structural sharing and controlled transient mutation for performance
- separate value, identity, and time-varying state
- preserve an interactive development loop

Eliscript applies these principles to its own constraints. JavaScript ESM,
promises, browsers, Bun, Node, and optional UI libraries remain explicit host
facilities.
Emacs retains editor identity and interaction while delegating coarse-grained
portable computation. The concrete vector trie, HAMT, transient, transducer,
interop, value-codec, and Emacs reinvestment design is specified in
[0041-host-symbiosis-and-persistent-data.md](0041-host-symbiosis-and-persistent-data.md).

## Target Architecture

### Contract Layer

The language specification and executable conformance corpus are the source of
truth. Each normative feature has:

- a numbered specification with status and compatibility notes
- positive and negative source fixtures
- expected diagnostics where invalid input is involved
- seed and self-hosted compiler evidence where both implementations apply
- runtime evidence when the feature has observable JavaScript behavior

Specifications use `Draft`, `Accepted`, `Stable`, or `Superseded` status.
`Stable` behavior belongs to the 1.0 compatibility contract. A stable feature
may be extended compatibly; an incompatible change requires a superseding
specification, a migration note, and a deprecation path when one is possible.

The public contract includes source syntax, diagnostics schema, generated ESM
semantics, project configuration, build reports, worker protocol, and standard
library behavior. Internal IR layout is versioned for tools but may evolve
behind explicit schema versions.

### Compiler Layer

The canonical pipeline remains:

```text
source text
  -> located syntax
  -> deterministic macro expansion
  -> lexical and semantic analysis
  -> versioned canonical IR
  -> ESM fragments and source mappings
  -> JavaScript module plus Source Map v3
```

Each phase has one documented input and output schema and cannot read files,
environment variables, editor state, or process state implicitly. Host access
is supplied through adapters or declared capabilities.

The self-hosted compiler owns normal language development. The seed compiler
has three long-term responsibilities:

1. establish Generation 1 from a clean Emacs installation
2. provide an independent semantic oracle for stable language behavior
3. diagnose bootstrap regressions when the generated compiler cannot build

New stable language behavior must not live indefinitely in only one compiler.
During convergence, a feature slice is incomplete until parity is restored or
the specification explicitly narrows the seed's reference scope.

### Host Adapter Layer

The in-memory compiler has no filesystem or process dependency. Host adapters
own:

- reading source and configuration
- canonical path resolution and containment
- output and cache writes
- package and asset resolution delegated to the selected JavaScript tool
- watch events
- terminal presentation
- process lifecycle

Bun remains the reference JavaScript development host. A Node.js LTS adapter
is added to prove that generated ESM and the self-hosted compiler do not depend
on Bun-only language behavior. Browser execution is verified from
standards-based ESM. A replaceable application toolchain may bundle reference
applications, but it is not part of the compiler or language contract.

### Project and Build Layer

Projects gain one optional `eliscript.json` file. Command-line flags continue
to work and override configuration. The initial schema contains:

- schema version
- source root and one or more entries
- output directory
- source-map policy
- development or production mode
- portable entry selections
- declared macro file dependencies and capabilities
- adapter-specific options in namespaced objects

The builder consumes expanded imports, constructs one canonical graph, and
uses content-addressed private cache metadata. Single-file compilation becomes
a one-module project operation internally so diagnostics, configuration, and
reporting do not diverge.

Build outputs remain deterministic with respect to declared inputs. Public
manifests contain portable paths and content identities; machine-local timing
and cache observations remain reports rather than artifact identity.

### Runtime and Worker Layer

Ordinary generated programs use JavaScript values and need no general
Eliscript runtime. Focused helpers are allowed only for semantics that cannot
be emitted clearly or correctly inline.

The worker remains a separate optional product surface. It uses a versioned,
capability-negotiated protocol and immutable module generations. Filesystem,
network, clock, randomness, and process access are denied to portable code
unless granted through a typed host capability. Cancellation and timeout
outcomes are observable and cannot partially mutate Emacs state.

### Library Layer

Libraries are divided into three stability groups:

- `core`: portable value and collection operations required by ordinary
  programs and the compiler
- `platform`: explicit browser, worker, UI-library, or host adapter facilities
- `experimental`: useful APIs that are not yet in the compatibility contract

Compiler intrinsics are added only when a library implementation cannot
preserve semantics, diagnostics, or performance. Every core library operation
documents mutation behavior, equality, indexing units, error behavior, and
portable dependency closure.

### Developer Tool Layer

The mature toolchain contains:

- one canonical command surface for compile, build, check, format, run, and
  interactive evaluation
- a deterministic formatter that is idempotent and preserves comments
- an Emacs major mode with indentation, font locking, navigation, compilation
  integration, and interactive commands
- a long-lived REPL/evaluation session with source-mapped errors
- stable JSON diagnostics for editor and CI integrations
- maintained application adapters that consume public compiler boundaries and
  introduce no core dependency

An LSP server is optional for 1.0. The diagnostic and project APIs must avoid
blocking one later, but Emacs integration is the required first-class editor
experience.

### Evidence Layer

Tests are organized by the claim they prove:

- unit tests for individual compiler and library behavior
- shared differential fixtures for seed/self-hosted parity
- golden tests for diagnostics, IR schemas, ESM, and source maps
- runtime tests against supported JavaScript hosts
- project tests for graph, cache, path, and configuration behavior
- integration tests for Emacs and worker workflows, plus application-level
  browser, Org, UI-library, and optional bundler proofs
- property and fuzz tests for readers, expanders, analyzers, and configuration
- scale, performance, and soak suites outside the fast development loop

Every acceptance run writes a machine-readable manifest and a human-readable
report under an acceptance-results directory. Generated evidence does not
replace the stable source fixtures used by normal tests.

## Workstreams

The roadmap is executed through six workstreams. Milestones may advance them
in parallel, but each has one owner in the architecture.

| Workstream | Owns | Does not own |
| --- | --- | --- |
| Language | semantics, specifications, compatibility corpus | host I/O |
| Compiler | phase implementations, IR, emission, bootstrap | project policy |
| Toolchain | CLI, config, project graph, cache, watch | language semantics |
| Experience | formatter, Emacs mode, REPL, diagnostics UI | compiler shortcuts |
| Libraries | portable and platform APIs | hidden compiler behavior |
| Quality | matrices, fuzzing, scale, performance, acceptance evidence | feature design |

## Progress Accounting

Human duration is not a project-progress measure. Specification 0122 defines
the versioned evidence-derived report over 42 milestone deliverable units, 35
mandatory AC/PD criteria, and the current core conformance feature set.
`bun run progress` is the authoritative current snapshot. Milestones may
advance in parallel, but only complete units enter a numerator.

## Milestone Plan

### M7: Contract Baseline (6 implementation units)

**Objective:** Convert the current implementation history into an explicit,
testable compatibility baseline.

**Deliverables:**

- a specification status index and feature inventory
- a versioned conformance manifest mapping features to fixtures and tests
- normalized JSON diagnostic schema
- documented public versus internal interfaces
- automated documentation consistency checks
- continuous checks on macOS and Linux with supported Emacs versions

**Construction steps:**

1. Enumerate every reader form, special form, declaration, IR node, CLI, report
   schema, adapter, and standard-library export.
2. Resolve contradictions and stale counts in existing documentation.
3. Mark normative specifications `Stable`; leave incomplete surfaces `Draft`.
4. Add a fixture manifest with stable feature identifiers.
5. Wrap diagnostics as structured code, severity, message, file, and span while
   retaining readable terminal text.
6. Add CI jobs for formatting checks, byte compilation, ERT, Bun tests,
   bootstrap fixed point, and CLI integration.
7. Publish one generated coverage matrix in test output so an untested stable
   feature fails the contract check.

**Exit gate:** Every currently supported public behavior has a specification
owner and executable evidence; the complete existing suite passes on macOS and
Linux without undocumented setup.

Started on 2026-08-28. The first slice separates design and implementation
status across every numbered specification, indexes all specifications in a
versioned registry, maps every implemented specification to named contract
statements and executable evidence, and runs a dependency-free checker before
the default test suite. The checker also has negative tests for metadata drift,
missing evidence, evidence outside the default suite, and uncovered
implementations. See
[0042-specification-registry.md](0042-specification-registry.md).

The second slice defines the version 1 diagnostic object, stable category
codes, public Emacs accessors and serializers, human compatibility rules, and
`--diagnostic-format json` across the seed compiler, project builder, and
self-hosted Bun driver. Analyzer failures now agree across both compiler
generations without changing the reproducible fixed point. See
[0043-structured-diagnostics.md](0043-structured-diagnostics.md).

The third slice inventories language and macro forms, all IR kinds, commands,
schemas, adapters, standard-library exports, and Emacs interfaces in a
versioned public-surface registry. Exact implementation comparisons and known
documentation assertions now fail the default contract target on drift. Both
contract checkers print generated domain matrices. See
[0044-public-surface-registry.md](0044-public-surface-registry.md).

The fourth slice defines a versioned compatibility matrix for Emacs 29.4 and
30.2 across Ubuntu 24.04 x64 and macOS 15 arm64. A deterministic renderer owns
the pinned GitHub Actions workflow, and the shared strict byte-compilation
entry promotes warnings to errors while always removing generated bytecode.
Local contract tests reject missing matrix cells, mutable Action revisions,
weakened commands, and workflow drift. Remote matrix results remain required
before the M7 platform exit gate is satisfied. See
[0045-continuous-compatibility-matrix.md](0045-continuous-compatibility-matrix.md).

The fifth slice freezes Compatibility Baseline 1 without freezing the current
mutable collection representation. Twenty-eight specifications and features
whose semantics survive the planned M8 migration are stable; fifteen
implemented compiler, collection, and standard-library surfaces remain
explicitly provisional; three roadmap specifications remain planning work.
The default checker derives and compares every classification in both
directions. The complete suite and strict byte compilation pass on all four
declared remote matrix cells. These results satisfy the M7 exit gate. See
[0046-m7-compatibility-baseline.md](0046-m7-compatibility-baseline.md).

**M7 status:** Completed on 2026-08-28. M8 work may now change only provisional
surfaces unless it follows the stable compatibility-change process.

### M8: Language Contract Closure (7 implementation units)

**Objective:** Finish the small, general-purpose hosted language contract,
then freeze the core surface against accidental changes.

**Deliverables:**

- persistent list, vector, map, and set semantics with explicit native
  JavaScript container interop
- complete binding, function, control-flow, exception, and async contracts
- `loop`/`recur`, integer bit operations, value equality, and stable hashing
- named, default, namespace, and side-effect ESM imports
- explicit property, method, constructor, promise, and raw-JavaScript interop
- deterministic macro dependency declarations, `gensym`, and capture rules
- stable equality, mutation, evaluation-order, and error behavior

**Construction steps:**

1. Implement and measure the persistent vector trie and HAMT prototypes from
   0041 before changing literal behavior.
2. Specify equality, hashing, collection identity, and state independently of
   host accidents.
3. Make vector, map, and set literals persistent values while retaining
   explicit native JavaScript constructors and conversions.
4. Complete import forms and verify receiver-preserving method calls.
5. Add `loop`/`recur`, macro-generated-name support, and declared file
   dependency APIs.
6. Create negative fixtures for every malformed special form, binding edge,
   transient escape, and host conversion.
7. Implement each slice in seed and self-hosted compilers before starting the
   next stable slice.
8. Run all stable fixtures through execution, not emission comparison alone.

**Exit gate:** The stable language reference has no unresolved semantic
question in the complete core corpus, and seed/self-hosted results match across
that corpus. Application frameworks cannot add requirements to this gate.

**M8 status:** Completed on 2026-09-07. The first provisional slice was the
32-way persistent vector trie in
[0047-persistent-vector-prototype.md](0047-persistent-vector-prototype.md),
including generated reference-model checks and one-million-value structural
bounds. Scalar and vector value semantics now have frozen Bun/Node hashes,
recursive equality, collision evidence, and a private immutable-value cache in
[0048-value-equality-and-hashing.md](0048-value-equality-and-hashing.md).
The HAMT Map prototype now adds bitmap, dense, and full-hash collision nodes,
threshold transitions, structural sharing, and million-key bounds in
[0049-persistent-hash-map-prototype.md](0049-persistent-hash-map-prototype.md).
The Map-backed persistent Set in
[0050-persistent-hash-set-prototype.md](0050-persistent-hash-set-prototype.md)
adds a distinct unordered value category, collection algebra, exact path
sharing, collision coverage, and million-member bounds without duplicating
HAMT nodes. The source-bound Bun/Node/Chrome benchmark in
[0051-hamt-layout-benchmark.md](0051-hamt-layout-benchmark.md) replaces the
initial inherited 16/8 sparse/dense transition with measured 32/24 thresholds.
The seed and self-hosted compiler paths now expose exact portable 32-bit
operations, while `stdlib/bit.eli` proves population count and rotations in
[0052-portable-32-bit-operations.md](0052-portable-32-bit-operations.md).
The complete 32-way trie in `stdlib/persistent-vector.eli` now supplies the
implementation-language proof in
[0053-eliscript-persistent-vector.md](0053-eliscript-persistent-vector.md): seed
and self-hosted artifacts are byte-identical, Bun and Node reports agree, and
generated history plus million-value structural bounds pass. This closes the
0041 P0 semantics-and-prototype phase. P1 is next: converge list, vector, map,
and set into one Eliscript-authored core with shared equality, hashing,
metadata, printing, reading, and property evidence before literal migration.
The first P1 slice is the independent linked List in
[0054-eliscript-persistent-list.md](0054-eliscript-persistent-list.md). It adds
constant-time front operations, complete suffix identity, generated histories,
and million-node iterative evidence. List and Vector now provide concrete,
contrasting capability sets for protocol design. The complete portable HAMT
Map in [0055-eliscript-persistent-map.md](0055-eliscript-persistent-map.md) now
adds injected hash/equality policy, bitmap/dense/collision nodes, 32/24
transitions, retained generated histories, and million-key path sharing. Set
migration follows in
[0056-eliscript-persistent-set.md](0056-eliscript-persistent-set.md), reusing the
portable Map for membership and collection algebra with cross-host and
million-member evidence. All four concrete persistent representations now
exist in Eliscript. The shared portable value layer in
[0057-portable-value-semantics.md](0057-portable-value-semantics.md) now adds
recursive scalar/List/Vector/Map/Set equality and hashing, ordinary Map/Set
constructors, nested `undefined` preservation, cross-family generated
invariants, and one-million-value traversal. P1 construction steps 1 and 2 are
complete. The generic runtime dispatch core in
[0058-open-protocol-dispatch.md](0058-open-protocol-dispatch.md) then begins P2
with immutable protocol definitions, direct Symbol slots, exact-type and
host-category extension tables, explicit defaults, structured diagnostics,
and production `IEquiv`/`IHash` integration. The remaining collection
protocols were still open at that point. The first collection-capability
continuation in
[0059-collection-capability-protocols.md](0059-collection-capability-protocols.md)
adds `ICounted`, `ILookup`, `IIndexed`, `ISeqable`, and `IReduce` across
persistent and selected native collections, plus immutable replayable sequence
views and reduced-value early termination. The target-side continuation
in [0060-collection-construction-protocols.md](0060-collection-construction-protocols.md)
adds `IEmptyable`, `IConj`, and `IAssociative`, including direct persistent
updates, immutable native copies, partial Set membership, bounded entry
validation, and million-value generic construction. The single-pass
transducer continuation in
[0061-composable-transducers.md](0061-composable-transducers.md) adds reusable
mapping, filtering, bounded taking, reducing completion, custom composition,
and protocol-driven `into` with zero-intermediate collection evidence.
Owner-token runtime builders in
[0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md)
then add Vector/Map/Set path ownership, deterministic invalidation,
transient-backed `into`, retained-generation safety, and structural allocation
gates. Protocol-driven sequence and keyed-data algorithms then land in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md),
with persistent results, Eliscript truth semantics, exact early termination,
and transient indexing evidence. The source-level protocol, collection,
transducer, and transient APIs plus maintained sequence/data algorithm bodies
now land in
[0066-eliscript-authored-core-protocol-algorithms.md](0066-eliscript-authored-core-protocol-algorithms.md).
Protocol policy then moves into maintained Eliscript in
[0079-eliscript-protocol-dispatch-policy.md](0079-eliscript-protocol-dispatch-policy.md),
and [0080-canonical-generated-protocol-runtime.md](0080-canonical-generated-protocol-runtime.md)
makes that compiled output the canonical production runtime behind a
policy-free JavaScript compatibility facade. Protocol-driven text and keyed
object algorithms then close the remaining P2 migration in
[0081-protocol-driven-text-object.md](0081-protocol-driven-text-object.md),
including generated production artifacts and transient persistent-Map
construction. The first P3 language-integration layer lands in
[0082-persistent-literal-runtime-abi.md](0082-persistent-literal-runtime-abi.md):
dedicated persistent Vector/Map IR, one standard ESM runtime ABI, and explicit
native container forms. Specification
[0083-default-persistent-vector-literals.md](0083-default-persistent-vector-literals.md)
then makes square-bracket values persistent Vectors, routes `nth` and `length`
through collection protocols, adds explicit host access, and annotates all
maintained compiler and standard-library host arrays. Specification
[0084-persistent-map-source-syntax.md](0084-persistent-map-source-syntax.md)
adds canonical brace Map expressions with matching seed/self-hosted reader,
macro, IR, diagnostic, and cross-host runtime evidence. Stack-safe function and
binding iteration now lands in
[0064-stack-safe-loop-recur.md](0064-stack-safe-loop-recur.md), with exact tail
positions, nearest-target analysis, simultaneous pattern rebinding,
seed/self-hosted fixed-point evidence, and million-step Bun/Node execution.
Deterministic generated symbols and explicit capture rules now land in
[0065-deterministic-macro-generated-names.md](0065-deterministic-macro-generated-names.md),
including module-wide collision avoidance and Bun/Node execution evidence.
First-class Keyword and Symbol values now land in
[0067-first-class-keyword-symbol-values.md](0067-first-class-keyword-symbol-values.md),
including immutable qualified values, deterministic runtime/portable hashes,
and Map/Set key behavior. Immutable metadata now lands in
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md),
including root-only wrappers, persistent/transient propagation, portable and
runtime APIs, equality/hash exclusion, and seed/self-hosted Bun/Node evidence.
P1 construction steps 1-5 and their all-host exit gate now have complete
implementation evidence through
[0078-persistent-collection-core-exit-audit.md](0078-persistent-collection-core-exit-audit.md).
Deterministic macro generation, portable dispatch policy, generated protocol
runtime, and protocol-driven object/text algorithms now land in
[0065-deterministic-macro-generated-names.md](0065-deterministic-macro-generated-names.md),
[0079-eliscript-protocol-dispatch-policy.md](0079-eliscript-protocol-dispatch-policy.md),
[0080-canonical-generated-protocol-runtime.md](0080-canonical-generated-protocol-runtime.md),
and
[0081-protocol-driven-text-object.md](0081-protocol-driven-text-object.md).
The literal ABI and explicit host constructors begin P3 in
[0082-persistent-literal-runtime-abi.md](0082-persistent-literal-runtime-abi.md),
and default persistent Vector literals plus explicit host access continue it in
[0083-default-persistent-vector-literals.md](0083-default-persistent-vector-literals.md).
Canonical brace Map expressions continue it in
[0084-persistent-map-source-syntax.md](0084-persistent-map-source-syntax.md).
First-class source Keyword values now land in
[0085-first-class-source-keywords.md](0085-first-class-source-keywords.md),
including reader validation, canonical interning, Map-key behavior, static
host-property boundaries, and conditional runtime linking. Specification
[0086-optimized-runtime-persistent-list.md](0086-optimized-runtime-persistent-list.md)
adds the optimized singly linked List, exact suffix sharing, collection/value/
metadata protocols, portable hash parity, million-node evidence, and
parenthesized canonical data text. First-class persistent List/Vector/Symbol/
Keyword quote then lands in
[0087-first-class-quoted-persistent-data.md](0087-first-class-quoted-persistent-data.md),
including literal ABI, canonical text, portable construction, macro-generated
Symbol, and fixed-point evidence. The opt-in Emacs worker value codec in
[0088-emacs-worker-value-codec.md](0088-emacs-worker-value-codec.md) now
preserves all persistent categories, metadata, exact special scalars, and
explicit native containers across temporary generated modules. Specification
[0089-chunked-emacs-worker-values.md](0089-chunked-emacs-worker-values.md)
adds incremental codec traversal, bounded framing, backpressure, streamed
progress and results, and upload-stage cancellation. Specification
[0090-large-worker-value-memory-probe.md](0090-large-worker-value-memory-probe.md)
closes PD-08 with a source-bound 256 MiB real-process report and explicit
Emacs, Bun, and combined RSS budgets. Transport of protocol definitions and
static escape analysis were the remaining adjacent items. Specification
[0091-transport-safe-protocol-definitions.md](0091-transport-safe-protocol-definitions.md)
now closes protocol-definition transport with a versioned data-only descriptor,
fresh local runtime identity, and strict non-executable validation. Static
transient ownership analysis now lands in
[0093-static-transient-ownership-analysis.md](0093-static-transient-ownership-analysis.md),
with provenance-aware ownership, branch merging, completion invalidation, and
escape rejection. Canonical executable Set syntax lands in
[0092-persistent-set-source-syntax.md](0092-persistent-set-source-syntax.md),
completing the Vector/Map/Set literal family through dedicated IR and the
standard literal runtime ABI without an application-framework dependency.
Persistent List language construction and operations now land in
[0094-persistent-list-language-semantics.md](0094-persistent-list-language-semantics.md),
which gives `(list ...)`, `car`, `cdr`, and `cons` canonical persistent
semantics while preserving native prepend as explicit `js-cons`.
Specification
[0095-stable-persistent-host-container-boundary.md](0095-stable-persistent-host-container-boundary.md)
removes the provisional `array`/`object` aliases, migrates all maintained
sources to explicit host construction, and promotes the consolidated value
boundary to stable. The P3 exit is satisfied.
Canonical
printing/reading for the optimized runtime family now lands in
[0069-canonical-runtime-data-text.md](0069-canonical-runtime-data-text.md);
portable Keyword/Symbol values and List/collection data text now land in
[0070-portable-identifier-values.md](0070-portable-identifier-values.md) and
[0071-canonical-portable-data-text.md](0071-canonical-portable-data-text.md).
Synchronous state identity now lands in
[0072-atomic-state-references.md](0072-atomic-state-references.md), with
validators, ordered watch snapshots, nested transition queuing, and explicit
same-Atom reentrancy rejection. The explicit JavaScript container boundary now
lands in
[0073-native-javascript-container-interop.md](0073-native-javascript-container-interop.md),
with shallow-by-default conversion, bounded deep graph traversal, sharing and
cycle semantics, and UI props evidence. Efficient portable opaque-object,
function, and native-Symbol identity hashing now lands in
[0074-process-local-host-identity-hashing.md](0074-process-local-host-identity-hashing.md),
removing the previous type-wide HAMT collision group. The first explicit M11
library value now lands early in
[0075-portable-result-values.md](0075-portable-result-values.md): inspectable
Ok/Err persistent records, exact branch combinators, dependency-pruned portable
closures, and stack-safe persistent-Vector traversal. The first portable JSON
boundary now lands in
[0076-portable-json-values.md](0076-portable-json-values.md): strict parsing
directly into persistent values, deterministic string-key encoding, exact
Result diagnostics, cycle detection, and explicit resource limits. The first
numeric foundation now lands in
[0077-portable-numeric-foundation.md](0077-portable-numeric-foundation.md):
Number classification, safe-integer checked arithmetic, signed integer
division, and iterative GCD/LCM without host Math dependencies.
The first profile-guided P4 compiler slice now lands in
[0096-profile-guided-compiler-runtime-scan.md](0096-profile-guided-compiler-runtime-scan.md):
the self-hosted emitter collects five conditional runtime requirements in one
IR traversal, the previous five recursive scans remain an executable semantic
reference, and a source-bound benchmark records exact agreement plus a reviewed
1.596247x local median speedup. Application frameworks and bundlers do not
participate in this core evidence.
Specification
[0097-profile-guided-ir-node-kind-decisions.md](0097-profile-guided-ir-node-kind-decisions.md)
then replaces the common linear IR node-kind scan with a module-private native
index, freezes the registry, retains the array scan as an executable reference,
and records exact agreement plus a reviewed 10.671811x local median speedup over
25,037 real compiler IR nodes. Application frameworks, Vite adapters, site
generators, and publishing tools remain outside this language-core slice and
its acceptance evidence.
Specification
[0098-profile-guided-emitter-indentation.md](0098-profile-guided-emitter-indentation.md)
then replaces character-by-character indentation with source-map-aware line
segments and one final join, retains the previous loop as an executable
reference, and records exact text/mark agreement plus a reviewed 14.610301x
local median speedup. The same whole-compiler profile moves indentation out of
the dominant paths. Application frameworks and publishing adapters remain
outside this compiler evidence.
Specification
[0099-profile-guided-source-mark-location.md](0099-profile-guided-source-mark-location.md)
then uses the emitter's ordered-mark invariant for constant-time start checks
and one-step immutable prepend. A compiler-private host specialization is
called directly at normal emission sites while the previous complete scan and
iterative copy remain an executable Eliscript reference. The reviewed real
artifact corpus records exact agreement plus a current 2.428094x local median
speedup after the general comparison-emission optimization;
follow-up whole-compiler sampling removes location from the dominant entries.
Application frameworks and site tooling receive no core roadmap credit.
Specification
[0100-profile-guided-binary-comparison-emission.md](0100-profile-guided-binary-comparison-emission.md)
then specializes exactly binary numeric comparisons as direct ECMAScript
infix expressions while preserving eager argument capture for n-ary forms.
An exact historical-baseline replay over all thirteen compiler modules records a
1.618252x complete-compiler median speedup and reduces generated JavaScript
from 441,772 to 337,871 bytes. A broader constant-dispatch experiment was
rejected because its complete-compiler result regressed. Application
frameworks, Vite, bundlers, publishing, and site tooling remain application
validation only and receive no language-core evidence or maturity credit.
Specification
[0101-profile-guided-reader-character-classification.md](0101-profile-guided-reader-character-classification.md)
then replaces generated whitespace and delimiter `or` closure chains with two
bounded compiler-private predicates while retaining the Eliscript algorithms
as executable references. The reviewed real-source trace records a 5.399289x
predicate median speedup, and the exact historical-baseline replay records a
1.249726x complete-compiler median speedup with byte-identical ESM and Source
Maps. Application frameworks and build tools remain absent from the core
implementation, corpus, decision, and roadmap credit.
Specification
[0102-profile-guided-source-map-cursors.md](0102-profile-guided-source-map-cursors.md)
then replaces complete generated/source position scans with ordered private
cursors while retaining both Eliscript scans as executable references. The
reviewed 22,310-mark compiler corpus records a 4.546145x combined cursor median
speedup and a 1.128405x complete-compiler median speedup against the exact
pre-specialization revision. ESM and Source Maps remain byte-identical, and no
application framework or build tool participates in the evidence.
Specification
[0103-transient-bulk-builder-performance.md](0103-transient-bulk-builder-performance.md)
then binds the complete core runtime to alternating persistent/transient
builder measurements. Over identical preconstructed inputs, owner-token
`into` records 12.329933x Vector, 17.486689x Map, and 17.937565x Set median
speedups, identical values and hashes, one completion each, and persistent-node
allocation ratios below one third. A fresh compiler profile also rejects a
1.042127x complete-compiler Source Map encoding candidate rather than adding
low-impact native complexity. This closes P4 without application evidence.
Specification
[0104-accelerated-emacs-operation-service.md](0104-accelerated-emacs-operation-service.md)
then completes the P6 operation boundary over the existing worker and value
bridge. Named dual-path operations retain executable Emacs Lisp references,
route by declared workload thresholds, optionally verify every accelerated
result, and guard transactional buffer application across cancellation,
timeout, stale versions, and worker restart. The maintained index workflow now
uses this service rather than protocol calls. This completes PD-09 and P6;
application frameworks, Vite, bundlers, publishing, and site tooling remain
outside the implementation and evidence.
Specification
[0105-emacs-analysis-performance-reinvestment.md](0105-emacs-analysis-performance-reinvestment.md)
then completes P7 and PD-10 with three maintained Emacs Lisp/Eliscript text
analysis candidates. Search and statistics use transducers plus persistent
Vector construction and record 9.679x and 8.267x median warm end-to-end
speedups across 30 runs. Source-bound cold, warm, segmented, and crossover
evidence selects a conservative 16,000-character threshold, while a
200-request one-generation soak applies 100 stable buffer results and discards
100 stale results. No application framework, bundler, publishing tool, site,
hosting system, or development server contributes to this completion.
Declared macro file inputs complete the final M8 implementation unit in
[0124-declared-macro-file-dependencies.md](0124-declared-macro-file-dependencies.md).
The seed and self-hosted compilers expose no ambient macro capabilities;
project versions 1 and 2 may explicitly grant `read-file` for an exact,
root-contained UTF-8 dependency set. Ordered SHA-256 records enter public
manifest, report, and cache identity, changed inputs conservatively invalidate
every project module, and Bun/Node plus seed/self-hosted evidence agrees. With
the stable ESM import contract in 0123, deterministic names and capture rules
in 0065, and the complete retained language corpus, all seven M8 implementation
units are complete. Final 1.0 acceptance and broader stabilization remain
tracked independently; application tooling contributes no M8 maturity credit.

### M9: Compiler and Build Convergence (6 implementation units)

**Objective:** Make the self-hosted compiler the normal complete toolchain
implementation while preserving the seed as a trustworthy bootstrap.

**Deliverables:**

- self-hosted project graph discovery and portable closure selection
- one shared project operation behind single-file and multi-file commands
- versioned `eliscript.json` configuration
- Bun and Node.js LTS host adapters
- canonical phase APIs and versioned IR serialization
- reproducible compiler and project artifacts across supported hosts

**Construction steps:**

1. Extract host-neutral project graph and closure algorithms into `.eli`
   modules.
2. Keep path and filesystem operations behind small host adapters.
3. define and validate `eliscript.json` with unknown-key diagnostics.
4. Route existing CLIs through one project service and preserve compatibility.
5. Implement the Node.js adapter against the same in-memory compiler API.
6. Compare seed, Bun-hosted, and Node-hosted results for the stable corpus.
7. Version IR and build-report schemas; add migration readers where persisted
   cache data requires them.
8. Make clean bootstrap, ordinary builds, and portable builds independently
   reproducible.

Specification 0106 delivers the first versioned single-entry project request,
closed-key configuration validation, command-line precedence, and shared seed
project operation. Specification 0107 adds host-neutral graph and portable
closure planning in `.eli`, plus byte-identical ordinary and portable project
execution under Bun and Node. Specification 0108 then adds closed, versioned,
canonical IR serialization with complete 57-node round trips, strict
diagnostics, and byte identity under Bun and Node. Specification 0109 moves
build-report version 1 normalization and cache-status policy into Eliscript and
matches cache-free seed reports under Bun and Node. Specification 0110 adds
compiler-owned v2 cache identity, v1 migration, selective recompilation, and
cross-host reuse. Specification 0111 moves request/configuration normalization
into Eliscript and routes the public multi-file project command through the
self-hosted service under Bun and Node. Specification 0112 adds one
compiler-owned build-operation request and host dispatcher behind the public
single-file and project commands while retaining explicit non-circular seed
references. Multi-entry project identity remains M9 work; these partial
deliveries are completed by specification 0113, which adds version 2 request,
manifest, report, cache-validation, CLI, and worker identity while preserving
version 1 single-entry behavior. M9 is complete.
Application frameworks, bundlers, blog and site generators, publishing,
hosting, and development servers remain replaceable
application validation and contributed no M9 core evidence or maturity credit.

**Exit gate:** All normal user builds can use the self-hosted compiler; the
seed is no longer the only implementation of a user-facing build capability.

**Status:** Complete. Seed, Bun, and Node cover normal single-file,
single-entry project, and multi-entry project builds through compiler-owned
versioned operations.

### M10: Daily Development Experience (6 implementation units)

**Objective:** Make Eliscript comfortable for sustained daily development,
especially inside Emacs.

**Deliverables:**

- deterministic formatter and format-check command
- Emacs major mode
- project-aware check command with stable JSON diagnostics
- source-mapped interactive evaluation and REPL session
- host-neutral watch API consumed by the Emacs mode and optional application
  adapters
- installation and troubleshooting documentation

**Construction steps:**

1. Define formatting from located syntax, including comments and reader forms.
2. Prove formatter idempotence and semantic preservation over the corpus.
3. Add font locking, syntax tables, indentation, imenu, beginning/end-of-defun,
   and comment behavior to the Emacs mode.
4. Connect project diagnostics to `compile-mode` or Flymake without parsing
   human terminal prose.
5. Add compile buffer/file/project and jump-to-source commands.
6. Add a persistent evaluation session with explicit namespace and reload
   behavior.
7. Unify file watching so Emacs, command-line watch mode, and replaceable
   application adapters consume the same host-neutral invalidation events.
8. Test unsaved-buffer compilation through virtual source input without making
   it an undeclared filesystem dependency.

**Exit gate:** A developer can create, navigate, format, check, evaluate,
build, and debug a project from Emacs using documented project commands.

Specification 0114 completes the first M10 deliverable. The self-hosted
compiler owns comment-preserving concrete-syntax formatting with fixed layout,
and the Bun/Node command exposes stdout, atomic write, non-mutating check, and
structured diagnostics. The maintained compiler and standard-library corpus
is byte-idempotent after formatting and emits byte-identical ESM before and
after formatting. Application tooling contributes no evidence.

Specification 0115 adds the foundational maintained Emacs major mode: complete
source syntax, fixed structural indentation, semantic font locking, Imenu,
balanced definition movement, configured/VCS project discovery, and
transactional use of the public self-hosted formatter. It deliberately leaves
project checking, diagnostic navigation, compile commands, evaluation, REPL,
watching, AC-12, and the M10 exit gate open.

Specification 0116 adds a self-hosted, read-only project check operation and
deterministic report. Bun and Node traverse the same configured source closure
without outputs or cache mutation, stdin overlays represent unsaved buffers,
and the Emacs mode maps versioned compiler JSON to asynchronous Flymake
diagnostics. Application integrations are excluded from implementation,
dependencies, evidence, and maturity credit.

Specification 0117 extends the public project build with one virtual source
under its original canonical identity. Unsaved Emacs buffers now participate
in real graph discovery, emission, source digests, and Source Maps without
saving; virtual builds disable cache reuse and the next disk build invalidates
the changed identity normally. The Emacs mode adds asynchronous buffer, file,
and configured-project compilation plus next-error source navigation.

Specification 0119 adds the first persistent evaluation slice. Seed and
self-hosted compiler code agree on closed operation, form, and module
descriptors. One Bun/Node session commits namespace revisions atomically,
preserves live Atom state between expressions, prints canonical values,
captures standard output without breaking NDJSON framing, and maps compiler
and runtime failures back to `.eli`. The Emacs mode loads unsaved buffers,
evaluates forms, displays navigable failures, and restores only acknowledged
namespace state after an unexpected process restart.

Specification 0120 completes the terminal REPL slice. The generated compiler
classifies empty, incomplete, and complete interactive input through the
self-hosted reader. One public Bun/Node terminal process preserves definitions,
macros, live values, and loaded project state; supports load, reload, reset,
help, and exit; recovers after reader, compiler, and runtime failures; and keeps
terminal presentation outside language semantics.

Specification 0121 completes the host-neutral watch slice. One versioned
content-snapshot stream reports sorted source creation, modification, and
deletion without exposing native watcher events. Explicit-root and configured
projects behave equivalently under Bun and Node, and the Emacs mode shares one
process per project, validates framed events, refreshes matching Flymake
buffers, and stops ownership explicitly.

Specification
[0133-verified-onboarding-documentation.md](0133-verified-onboarding-documentation.md)
completes the installation and troubleshooting slice. One versioned guide
covers checkout setup, a real configured project, format, check, build,
Bun/Node execution, unsaved diagnostics, terminal REPL, Emacs setup, watch, and
failure recovery. The default documentation contract checks every required
stage and entry point, while an end-to-end test executes the framework-neutral
workflow through public commands and the maintained Emacs mode.

**M10 implementation status:** Complete, 6/6 units. Formatter, single-file
format-check, the foundational Emacs major mode, project-aware check,
unsaved-buffer validation,
diagnostic navigation, virtual-source builds, and buffer/file/project compile
commands are implemented. Persistent source-mapped evaluation and Emacs
restart recovery are implemented. The terminal REPL is implemented with
compiler-owned multiline input and Bun/Node evidence. Host-neutral project
watch events and their Emacs consumer are implemented. Installation, daily
project workflows, and troubleshooting are documented and executable. The
full AC-12 matrix, final local onboarding exercise, and M10 exit audit remain
formal acceptance work rather than implementation credit.

### M11: Standard and Platform Libraries (6 implementation units)

**Objective:** Supply a coherent small library surface justified by language
semantics, compiler needs, portable workloads, and reusable host boundaries
without turning application conveniences into compiler intrinsics.

**Deliverables:**

- stable persistent list, vector, map, set, sequence, text, data, numeric,
  result, and JSON modules
- collection protocols, transient builders, and composable transducers
- documented module and export index
- explicit browser and worker capability packages
- documented, replaceable application-adapter boundaries above standard ESM
- dependency-prunable portable closures for all core modules

**Construction steps:**

1. Audit existing operations for naming, mutation, equality, Unicode, and
   error consistency.
2. Implement focused collection protocols with direct and externally
   extensible JavaScript dispatch.
3. Implement owner-token transient builders and transducer-based pipelines.
4. Classify exports as core, platform, or experimental.
5. Add only operations exercised by the compiler, core conformance corpus, or
   maintained portable workloads.
6. Specify JSON and persistent/native conversion behavior at the JavaScript
   boundary.
7. Keep framework conveniences in optional application or platform packages
   that depend only on public ESM and interop contracts.
8. Test every core export individually, through source import, through the
   project builder, and through portable closure selection where eligible.
9. Generate API reference data from explicit module metadata rather than
   scraping implementation text.

**Exit gate:** Every stable export has behavioral and portability evidence and
is justified independently of any framework, publishing tool, or site.

**M11 implementation status:** Complete, 6/6 units. Portable Result records
and combinators now land
in [0075-portable-result-values.md](0075-portable-result-values.md), and the
strict persistent JSON boundary lands in
[0076-portable-json-values.md](0076-portable-json-values.md). Portable numeric
classification and exact safe-integer operations land in
[0077-portable-numeric-foundation.md](0077-portable-numeric-foundation.md).
Specification [0125-generated-library-api-index.md](0125-generated-library-api-index.md)
adds exact module stability metadata and deterministic machine-readable and
user-facing API indexes for all 29 modules and 304 exports. Specification
[0126-explicit-host-capability-packages.md](0126-explicit-host-capability-packages.md)
adds explicit browser and request-scoped worker authority without ambient
globals or application dependencies. All six M11 implementation units are now
complete. Naming and behavior remain provisional until the complete M11
compatibility stabilization and exit audit.

### M12: Reliability, Security, and Performance (6 implementation units)

**Objective:** Demonstrate that the toolchain remains correct under malformed
input, large projects, long-lived use, and hostile project boundaries.

**Deliverables:**

- grammar-aware and mutation fuzz suites
- project scale and incremental invalidation suite
- worker soak and recovery suite
- explicit macro and worker capability security model
- benchmark corpus with stored methodology and regression thresholds
- dependency and generated-artifact audit commands

**Construction steps:**

1. Fuzz reader termination, span validity, printer round trips, and diagnostic
   determinism.
2. Mutate valid programs and assert controlled diagnostics rather than host
   stack traces.
3. Generate project graphs with chains, diamonds, cycles, wide fan-out, and
   1,000 modules.
4. Measure clean, no-op, leaf-change, and shared-dependency rebuild behavior.
5. Run worker cancellation, restart, module replacement, and timeout scenarios
   for an extended soak period.
6. Enforce root containment and capability denial with symlink and path attack
   cases.
7. Record cold and warm compiler, build, worker, and representative workload
   timings on a declared reference machine.
8. Set regression budgets only after three stable baseline runs.

**Exit gate:** All quantitative reliability and performance requirements in
the final acceptance matrix pass without an unexplained waiver.

**M12 implementation status:** Complete, 6/6 units. Specification
[0127-deterministic-reader-program-fuzz.md](0127-deterministic-reader-program-fuzz.md)
completes the grammar-aware and complete-module mutation suite with 100,000
deterministic inputs, fixed replay identities, seed/self-hosted reader
agreement, recursive span checks, formatter round trips, and structured
compiler diagnostics. Specification
[0128-project-scale-invalidation.md](0128-project-scale-invalidation.md)
completes the fixed 1,000-module chain, diamond, cycle, and shared-dependency
graph with exact no-op and mutation decisions, evaluated behavior, clean-build
equivalence, and bounded duration, memory, output, disk, and child lifetime.
Specification [0129-worker-lifecycle-soak.md](0129-worker-lifecycle-soak.md)
completes 100,000 uniquely accounted real Emacs worker requests across
cancellation, explicit restart, module replacement, blocking timeout, in-flight
process death, automatic recovery, bounded RSS trends, clean shutdown, and PID
reclamation. Specification
[0130-hostile-boundary-security.md](0130-hostile-boundary-security.md)
completes the hostile-boundary matrix across project-root containment,
declared macro and worker authority, closed configuration and protocol schemas,
and physical output isolation for modules, source maps, and manifests under
the Emacs seed, Bun, and Node paths. Specification
[0131-source-bound-core-performance-baseline.md](0131-source-bound-core-performance-baseline.md)
adds three independent, source-bound compiler, project-build, real Emacs worker,
and persistent-data workload runs with correctness identities, raw samples,
declared host metadata, and fixed median, any-run, and spread budgets.
Specification
[0132-repository-integrity-audits.md](0132-repository-integrity-audits.md)
closes package and static import boundaries, requires zero third-party package
imports in core roots, reproduces generated compiler and derived artifacts, and
validates the exact source-bound benchmark inventory. The final quantitative
M12 exit audit remains part of formal acceptance rather than implementation
credit.

### M13: Core Acceptance and Application Validation (5 implementation units)

**Objective:** Perform the formal language-core maturity audit, then exercise
the public boundaries through separately reported application validation.

**Deliverables:**

- a complete core acceptance corpus and report
- one recorded local onboarding exercise
- one compatibility migration rehearsal
- complete architecture, language, tools, library, and troubleshooting docs
- machine-readable and human-readable 1.0 acceptance reports

The non-blocking application validation set may include:

1. a multi-page Org-authored browser publishing site with deterministic
   production output, source maps, assets, and browser interaction; its UI
   library and bundler are replaceable application choices
2. a multi-module command-line or data-processing application using JavaScript
   package interop and the core standard library
3. an Emacs integration that delegates coarse-grained portable workloads to
   the worker and safely applies results in the editor

These applications are practical consumer checks, not language-core
deliverables. Their framework, publishing, hosting, or bundling results do not
contribute to core milestone completion or the 1.0 acceptance decision. The
Emacs acceleration contract is accepted independently by AC-16 and AC-17.

**Construction steps:**

1. Run the complete core acceptance corpus through public commands and
   documented APIs.
2. Follow the getting-started guide on a supported local environment and fix
   every undocumented prerequisite.
3. Rebuild a corpus written against the frozen compatibility baseline and
   document any intentional migration.
4. Run the complete acceptance matrix and retain exact environment metadata.
5. Resolve every mandatory failure and rerun the whole matrix from a clean
   checkout.
6. Run application validations separately through public output boundaries;
   record failures as consumer feedback without converting a framework or site
   requirement into a core criterion.

**Exit gate:** Every mandatory core acceptance criterion below passes in one
clean, traceable acceptance run. Application validation status is reported but
cannot block or satisfy this gate.

**M13 implementation status:** Complete, 5/5 units. Specification
[0134-versioned-core-acceptance-corpus.md](0134-versioned-core-acceptance-corpus.md)
derives the complete AC/PD inventory from normative headings, maps every
criterion to bounded probes and tracked evidence, and retains one clean audit
with every mandatory criterion classified and zero failed criteria. This
completes the corpus-and-report implementation unit without claiming final
acceptance.
Specification [0135-local-onboarding.md](0135-local-onboarding.md) records the
six-step local onboarding run and completes AC-22. Specification
[0136-local-compatibility-migration-rehearsal.md](0136-local-compatibility-migration-rehearsal.md)
records the direct local compatibility rehearsal without claiming final AC-02
closure. Specification
[0137-complete-core-documentation.md](0137-complete-core-documentation.md)
closes the exact eleven-document core inventory, local-link validation, and
executable snippet gate, completing AC-23. Specification
[0138-versioned-final-acceptance-artifacts.md](0138-versioned-final-acceptance-artifacts.md)
provides the canonical manifest, report, evidence summaries, and blocking-defect
gate. The implementation plan is complete, but AC-24 and the final 1.0 decision
remain open until all mandatory criteria pass in one source-bound run.

## Construction Protocol

Every implementation slice follows this order:

1. Write or update the numbered specification.
2. Add positive, negative, and boundary fixtures.
3. Implement the smallest complete vertical behavior.
4. Restore seed/self-hosted parity where the contract requires both.
5. Add runtime or integration proof for observable behavior.
6. Update public documentation and examples.
7. Run focused tests, the full suite, strict Emacs byte compilation, bootstrap
   fixed-point checks, and repository hygiene checks.
8. Record the milestone evidence before marking the slice implemented.

A slice is not complete when only parsing, only emission, only one compiler,
or only a happy-path example works. Generated files never become the source of
truth.

## Dependency Order

The critical path is:

```text
contract inventory
  -> language closure
  -> compiler/build convergence
  -> formatter + Emacs mode + REPL
  -> library stabilization
  -> scale/security/performance proof
  -> real-world proving
  -> final acceptance audit
```

Safe parallel work is limited to:

- CI and documentation after the contract inventory exists
- Emacs mode font locking/navigation while formatter semantics are designed
- library additions that do not depend on unresolved language semantics
- benchmark harness construction before regression thresholds are selected

## Risk Management

### Dual-Compiler Drift

**Risk:** New features are implemented twice and diverge.

**Control:** Shared fixtures are written first; the self-hosted compiler becomes
primary; seed scope is explicit; parity is a feature exit gate.

### Language Surface Expansion

**Risk:** Familiar Emacs Lisp or JavaScript features are added faster than they
can be specified and supported.

**Control:** New syntax requires a maintained application need, a specification,
and full evidence. Library solutions are preferred.

### Tooling Before Semantics

**Risk:** Formatter, editor, and build tools encode unstable syntax.

**Control:** M7 and M8 stabilize contracts before M10 freezes tool behavior.

### Host Leakage

**Risk:** Bun, Emacs, filesystem, or process behavior leaks into the portable
compiler and generated modules.

**Control:** Pure phase APIs, explicit adapters, Node parity, capability tests,
and browser execution evidence.

### Performance Claims Without Product Value

**Risk:** Engine benchmarks look impressive while transport dominates real
Emacs use.

**Control:** Acceptance uses warm end-to-end workloads, declared datasets, and
complete timing segments.

### Solo-Maintainer Load

**Risk:** Too many supported surfaces make the project difficult to sustain.

**Control:** One primary editor, one reference build host, one secondary
portability host, a small standard library, and no required custom registry or
LSP for 1.0.

## Final 1.0 Acceptance Standard

This section is normative. The maturity goal is achieved only when every
criterion marked **MUST** passes in one clean acceptance run. There is no
weighted score, partial credit, or milestone-based substitute. A failed MUST
criterion means the final goal has not been reached. The supplemental
PD-01-through-PD-11 criteria in 0041 are part of the same mandatory gate.

### A. Language and Compatibility

**AC-01 MUST - Stable specification coverage**

Every public source form, value rule, module form, macro API, interop form,
diagnostic schema, and stable standard-library export is owned by a `Stable`
specification and a conformance feature identifier. The generated coverage
matrix reports zero stable features without tests. Persistent collection,
protocol, transient, transducer, and state semantics are included in this
coverage rather than treated as library implementation details.

**AC-02 MUST - Stable corpus compatibility**

The complete frozen compatibility corpus compiles and executes with unchanged
observable results. Intentional incompatible changes have a superseding
specification and migration fixture; there are no undocumented semantic
changes.

**AC-03 MUST - Deterministic diagnostics**

All negative conformance cases produce the documented diagnostic code,
severity, file, line, column, and message in both human and JSON modes. Seed and
self-hosted diagnostics match for their shared stable scope.

### B. Bootstrap and Compiler

**AC-04 MUST - Reproducible fixed point**

On every required operating-system and Emacs-version job, the seed builds
Generation 1, Generation 1 builds Generation 2, and Generation 2 builds
Generation 3. Generations 1, 2, and 3 contain byte-identical normalized ESM and
Source Map artifacts.

**AC-05 MUST - Compiler parity**

The seed and self-hosted compilers agree on acceptance, diagnostics, canonical
IR, emitted ESM, source maps, portable closures, and project graphs for the
complete shared conformance corpus.

**AC-06 MUST - Self-hosted authority**

Single-file builds, project builds, portable builds, project reports, and the
complete core conformance corpus can all use the self-hosted compiler. No
language-core workflow requires a compiler feature available only in the seed.

**AC-07 MUST - Repeated determinism**

Twenty clean builds of the compiler and complete core acceptance corpus from
the same declared inputs produce identical identity-bearing artifacts. Timing,
temporary paths, and cache observations are excluded from artifact identity by
schema rather than text filtering. Application builds may repeat this check as
non-blocking validation.

### C. Project Toolchain

**AC-08 MUST - Clean project workflow**

Public commands can check, format-check, build, run, and watch a configured
multi-module project from a clean checkout. CLI flags and `eliscript.json`
precedence are documented and covered by integration tests.

**Status:** Complete. Specification
[0140-clean-configured-project-workflow.md](0140-clean-configured-project-workflow.md)
executes the complete public workflow in one bounded temporary multi-module
project, proves command-line precedence, restores source bytes, reclaims the
watch process, and enters the source-bound clean acceptance suite.

**AC-09 MUST - Correct incremental builds**

For the 1,000-module acceptance graph, a no-op rebuild reuses 100 percent of
modules. A leaf change rebuilds only the leaf and semantically affected closure;
a shared dependency change rebuilds every and only affected module. Output is
equivalent to a clean rebuild.

**Status:** Complete. Specification 0128 fixes the 1,000-module topology,
validates every reported edge, proves 100 percent no-op reuse, compiles exactly
the changed leaf or shared dependency under the stable-path ESM cache model,
evaluates propagation through reused importers, and compares complete artifact
trees and graph identities with forced clean builds.

**AC-10 MUST - Host portability**

The stable conformance corpus and core command-line fixtures execute on the
supported Bun version and Node.js LTS. Generated standards-based ESM contains
no tool-specific syntax and the compiler has no dependency on an application
toolchain. Browser execution may validate that boundary separately.

### D. Developer Experience

**AC-11 MUST - Formatter**

Formatting the entire maintained corpus twice produces no second diff. Comments
and reader forms are preserved, malformed input receives a located diagnostic,
and formatted programs produce the same canonical IR as their inputs.

**AC-12 MUST - Emacs mode**

On Emacs 29 and 30, the maintained mode passes automated tests for syntax,
indentation, font locking, comments, definition navigation, project discovery,
diagnostic navigation, and buffer/project commands.

**AC-13 MUST - Interactive evaluation**

A documented REPL session evaluates forms and files, reloads changed modules,
prints ordinary values, maps runtime failures to Eliscript source, and recovers
after a worker restart without losing protocol integrity.

Specification 0119 supplies executable form/file evaluation, explicit reload,
ordinary value printing, runtime source mapping, framed failures, and Emacs
restart recovery. AC-13 remains open until the complete documented terminal
REPL and maintained compatibility matrix pass together.

**AC-14 MUST - Source-level debugging evidence**

Compiler, runtime, browser event, async rejection, and worker failures in the
acceptance fixtures all identify the correct `.eli` file and source span. No
required workflow exposes only a generated `.mjs` stack location.

### E. Libraries

**AC-15 MUST - Stable library contract**

Every core export has direct tests, source-import tests, project-build tests,
documented mutation/equality/error semantics, and portable closure evidence
where eligible. The API index and actual exports match exactly. The persistent
collection implementation also passes PD-01 through PD-07 from 0041, including
structural bounds, collision behavior, transient safety, and allocation-free
composed transformation evidence.

### F. Emacs Acceleration

**AC-16 MUST - Worker correctness and recovery**

Protocol negotiation, concurrent requests, progress, cancellation, timeout,
module replacement, source-mapped errors, process death, restart, and clean
shutdown pass in real-process tests without applying a failed result to Emacs
state.

**AC-17 MUST - End-to-end performance value**

On the declared reference machine and datasets, two maintained coarse-grained
Emacs workloads each achieve at least a 2.0x median warm end-to-end speedup over
equivalent Emacs Lisp implementations across 30 measured runs. Reports include
serialization, transport, execution, and client application time. Results are
correct before timings are compared. At least one workload uses persistent
collections and transducers, and the Emacs value bridge passes PD-08 through
PD-11 from 0041.

### G. Reliability and Security

**AC-18 MUST - Fuzz robustness**

At least 100,000 deterministic generated or mutated inputs complete without a
compiler crash, hang, uncontrolled host exception, or invalid source span.
Accepted programs satisfy round-trip invariants; rejected programs return
structured diagnostics. The seed and self-hosted readers agree on the shared
input domain.

**Status:** Complete. Specification 0127 fixes and executes the 100,000-input
corpus and checks every required invariant in the default suite.

**AC-19 MUST - Scale and soak**

The 1,000-module graph completes clean and incremental builds within documented
resource limits. The worker completes an eight-hour or 100,000-request soak,
whichever is reached first, with no lost response, deadlock, orphan process,
or unbounded memory trend. Peak and steady-state memory are recorded.

**Status:** Complete. Specification 0128 completes the 1,000-module clean and
incremental scale half with explicit duration, maximum RSS, stream, source,
artifact, temporary-storage, and child-lifecycle bounds. Specification 0129
completes 100,000 correct unique worker responses across five generations,
records peak and steady-state Emacs and worker RSS under explicit limits, and
proves clean shutdown, error cleanup, and operating-system PID reclamation.

**AC-20 MUST - Boundary security**

Automated cases prove project-root containment across direct paths and
symlinks, deny undeclared macro and worker capabilities, reject protocol and
configuration schema mismatches, and prevent generated output from overwriting
source inputs.

**Status:** Complete. Specification 0130 executes the complete hostile-boundary
matrix in the default suite, including direct and symbolic root escapes,
capability denial, closed schema and protocol mismatches, symbolic and hard-link
output aliases, parent-directory escapes, full-plan preflight, and unchanged
protected inputs across the Emacs seed, Bun, and Node paths.

**AC-21 MUST - Supported environment matrix**

The full required suite passes on macOS and Linux, Emacs 29 and 30, the declared
Bun version, and Node.js LTS where applicable. Exact versions are recorded in
the acceptance manifest.

### H. Documentation and Sustainability

**AC-22 MUST - Documented local onboarding**

A new user following only repository documentation can install prerequisites,
build the compiler, compile and run a basic program, and run the core test suite
on a supported local development machine in 15 minutes of active steps,
excluding dependency download time. The run records its source revision and
toolchain. Every core prerequisite and command is documented. Application
examples have separate, non-blocking onboarding instructions.

**AC-23 MUST - Complete documentation set**

The repository contains current getting-started, language reference, macro,
interop, project configuration, compiler architecture, Emacs mode, REPL,
worker, troubleshooting, and contribution documents. Optional application,
publishing, and framework-adapter documentation is maintained outside the core
documentation gate. Links and executable snippets in the required set pass
automated checks.

**Status:** Complete. Specification 0137 versions the exact eleven-document
inventory, documentation entry points, local-link integrity, and five marked
examples that execute or validate through maintained local commands. Optional
application and publishing documents are explicitly excluded from core credit.

**AC-24 MUST - Acceptance audit**

The acceptance directory contains:

- `manifest.json` with commit identity, platform, tool versions, criterion
  results, artifact digests, and test commands
- `report.md` explaining the evidence for every MUST criterion, PD-01 through
  PD-11, and the separately labeled status of optional application validations
- machine-readable test, fuzz, benchmark, scale, and soak summaries
- zero unresolved severity-1 or severity-2 correctness, data-loss, security,
  bootstrap, or compatibility defects

The final goal is reached only when every MUST criterion and PD-01 through
PD-11 read `pass` in the same manifest and the repository is clean after
reproducing that result.

**Status:** Partial. Specification 0138 provides the canonical manifest,
report, five evidence summaries, unresolved-defect register, and deterministic
final gate. The current candidate remains non-final until every mandatory
criterion passes in one source-bound run and no severity-1 or severity-2 defect
remains.

## Optional Application Validation

Application validation is consumer feedback, not part of the core acceptance
matrix. Its status is reported separately and cannot supply, block, or weaken
any AC or PD result.

**AV-01 - Maintained application validation**

Maintained reference applications should build from public interfaces, pass
behavioral tests, retain source maps, and contain no private compiler patches,
copied generated compiler source, or undocumented build step.

**AV-02 - Browser publishing validation**

A publishing application may validate multiple Org articles, navigation,
assets, interactive state, deterministic production output, content metadata,
and mapped failures through public interfaces. Any UI library, bundler,
publishing tool, site generator, or hosting system remains a replaceable
application choice and receives no language-core maturity credit.

## Definition of Final Success

The long-term objective is achieved when Eliscript can maintain its compiler,
runtime, standard library, core tooling, and conformance corpus under the
stable contract, with efficient persistent values, reproducible builds,
first-class Emacs tools, standard JavaScript output, measurable acceleration
returned to real Emacs workflows, and a complete passing report for every MUST
criterion and PD-01 through PD-11.

Application validations demonstrate practical usefulness after and alongside
that result. Vite, React, publishing, blog and site generation, Pages hosting,
and equivalent replaceable tools remain consumers and never become core goals.

Anything less remains progress toward maturity, even when individual
milestones are complete.

## Change Control

This roadmap may be refined as implementation evidence appears, but changes to
the final acceptance standard require a numbered superseding specification.
Acceptance criteria may be strengthened directly. Removing or weakening a MUST
criterion requires an explicit rationale showing that the criterion no longer
measures the stated long-term objective.
