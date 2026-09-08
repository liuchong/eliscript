# Tests

[Project README](../README.md) | [Specifications](../specs/README.md) |
[Benchmarks](../benchmarks/README.md)

## Layout

Compiler behavior is tested from Emacs in batch mode. Source fixtures belong in
`fixtures/`; stable JavaScript output belongs in `snapshots/`.

## Contract Gates

Before compiler tests run, the contract checker validates all numbered
specification metadata and requires every implemented specification to own a
conformance feature with evidence locators that still exist. Its own Bun tests
cover the passing repository plus metadata drift, missing evidence, and
uncovered implementation failures. The registry is `specs/index.json`; the
feature inventory is `conformance/manifest.json`.
Non-fixture evidence must also appear in the default `make test` driver, so a
test file cannot silently stop running while remaining present in the tree.

The same pre-test gate compares the versioned public-surface registry with
language forms, IR kinds, commands, schemas, adapters, standard-library
exports, and Emacs APIs. It also validates the Linux/macOS and Emacs 29/30
compatibility contract, verifies retained reports produced directly on real
machines, and keeps the committed workflow equal to its optional deterministic
projection. Negative Bun tests cover missing matrix cells, host-version drift,
forged completion, mutable Action revisions, weakened commands, and workflow
drift.
Compatibility Baseline 1 then requires every specification and feature to be
classified as stable, provisional, or planning, with stable ownership and
feature status agreeing in both directions.

The maturity-progress test derives implementation, verification, and
stabilization percentages from explicit core acceptance units. Application
demonstrations are validated separately and cannot raise core progress.

`reader-program-fuzz.test.mjs` runs the fixed 100,000-input M12 reliability
corpus. Half of the inputs are recursively generated reader forms and half are
complete-module mutations. The test checks seed/self-hosted reader decisions,
accepted syntax trees, deterministic structured diagnostics, recursive source
spans, formatter round trips, compiler outcomes, corpus replay, and fixed
SHA-256 identities under explicit source, corpus, process, and timeout bounds.

`project-scale.test.mjs` runs the fixed 1,000-module M12 project graph through
the public self-hosted build command. It checks every chain, diamond, cycle,
and shared-dependency edge; exact no-op, leaf, and shared invalidation sets;
evaluated propagation through reused ESM importers; complete clean-build byte
equivalence; and hard time, memory, stream, disk, child, and cleanup bounds.

`worker-lifecycle-soak.test.mjs` starts a real Emacs client and executes the
complete 100,000-request M12 worker soak on every default suite run. It checks
unique response accounting, deterministic results, bounded concurrency,
cancellation, explicit restart, module replacement, blocking timeout, in-flight
process death, five-generation recovery, forty RSS checkpoints, peak and
steady-state budgets, clean shutdown, temporary cleanup, and PID reclamation.
It separately validates the committed source-bound reference report.

`boundary-security.test.mjs` executes the M12 hostile-boundary matrix across
the self-hosted Bun and Node project hosts, the Emacs seed project command, and
the real worker protocol. It rejects direct and symbolic source escapes,
undeclared macro and worker authority, closed-schema mismatches, symbolic and
hard-link output aliases, and symbolic parent-directory escapes before any
generated write. ERT independently covers the Emacs single-file output APIs.

`core-performance-benchmark.test.mjs` validates the retained three-run M12
compiler, project-build, real Emacs worker, and persistent-data workload
baseline. It recomputes the complete source digest, checks every fixed budget
and correctness identity, and rejects missing runs, altered summaries,
rewritten thresholds, and stale source evidence without rerunning timings.

## Default Suite

`make test` runs the explicit `test-core` and `test-applications` targets.
`test-core` runs the framework-neutral ERT, Bun, and public CLI suites; it
compares generated ESM with snapshots, validates Source Map v3 output, and
executes ordinary and source-mapped modules under maintained JavaScript hosts.
`test-applications` separately runs React rendering, the Vite transform and
production builds, and Org publishing coverage for metadata, deterministic
HTML, drafts, duplicate handling, watched content, direct ESM execution, and
the production site bundle. Application failures remain visible in the
aggregate developer suite without becoming core acceptance evidence.

Worker tests separately exercise the versioned persistent-value codec and its
chunked framing. Bun unit tests cover every value category, malformed events,
limits, Unicode text, and cancellation; protocol tests cover acknowledgements,
progress, responses, sequence errors, and upload cancellation; ERT starts a
real Bun worker and verifies incremental Emacs encoding and decoding. These
tests are core integration evidence and do not use application frameworks or
bundlers.

`worker-value-stream-probe.test.mjs` starts an independent Emacs/Bun pair for
a small memory-probe smoke run. It also validates the committed 256 MiB report,
all three RSS budgets, exact bidirectional chunking, and every source digest.
The large workload is not repeated by the default suite.

Emacs analysis ERT compiles the maintained Eliscript module, compares all
three candidate workflows with their exact Emacs Lisp references, applies a
stable asynchronous result atomically, and rejects an intentionally stale
buffer result. `emacs-analysis-evidence.test.mjs` validates the committed
30-sample primary/crossover benchmark and 200-request buffer soak, including
source digests, without rerunning wall-clock measurements.

## Bootstrap and Compiler

Bootstrap tests use shared JSON conformance fixtures. ERT runs the Emacs Lisp
seed implementation, while Bun compiles the corresponding `.eli` module,
imports its generated ESM, and checks the same cases. This keeps Generation 0
and Generation 1 behavior directly comparable as compiler phases migrate.
The portable reader comparison covers full normalized syntax trees, recursive
character-based spans, diagnostics, deterministic build artifacts, and all
current bootstrap sources. The generated reader must successfully read its own
`.eli` implementation.

The macro fixture compares complete expanded syntax and call-site spans, exact
diagnostics, deterministic macro evaluation, recursive expansion, explicit and
automatic generated symbols, source and dynamic-name collision avoidance, and
capture boundaries. Every valid result is then accepted by the generated
lexical analyzer. `macro-generated-names.test.mjs` additionally compares seed
and self-hosted JavaScript and Source Maps, then executes the capture and
single-evaluation corpus under Bun and Node.js.

`bootstrap-evaluation.test.mjs` differentially checks seed and self-hosted
evaluation descriptors, then exercises atomic definition replacement, macro
reuse, complete-source reload, persistent Atom identity, canonical values,
captured output, source-mapped failures, NDJSON recovery, Node/Bun parity, and
temporary-session cleanup. It also compares compiler-owned interactive input
classification and drives equivalent Node/Bun terminal transcripts through
multiline forms, load/reload/reset, recoverable failures, prompt policy, EOF,
and explicit exit. `eliscript-repl-tests.el` drives the real public
process from Emacs, verifies project-scoped unsaved-buffer evaluation and
located failures, kills the process, proves acknowledged namespace recovery,
and stops the replacement before the test exits.

`watch.test.mjs` verifies canonical content snapshots, sorted source
create/modify/delete events, symlink and non-source exclusion, configured
project identity, bounded intervals, Node/Bun parity, and clean signal exit.
Mode ERT frames partial NDJSON, rejects sequence drift, refreshes only matching
Flymake buffers, shares and stops project ownership, and consumes the real
public watch command.

The analyzer fixture runs after both readers. It compares success and complete
diagnostic strings for scope resolution, declaration collisions, mutability,
imports, exports, and malformed special forms. Both analyzers must accept all
current bootstrap sources, including `analyzer.eli` itself.

The IR fixture runs the complete generated front end and lowerer, then compares
the resulting program with a normalized seed oracle. It covers every one of
the 57 public IR node kinds, JSON-safe quoted data and literal tags,
kind-specific properties, complete nested source spans, macro call origins,
and all thirteen bootstrap compiler modules, including the self-hosted
concrete-syntax formatter.

The canonical IR suite serializes that complete corpus through the generated
compiler, validates lossless fixed-point round trips, and compares the same
bytes under Bun and Node. Closed-schema negative cases cover duplicate keys,
unknown versions and fields, malformed spans, unsupported JSON values, sparse
arrays, accessors, and cycles.

The emitter fixture sends the same portable IR through the generated backend
and the Emacs seed backend. It compares complete ESM text and parsed Source Map
documents, checks signed Base64 VLQ boundaries and Unicode columns, and runs a
generated module in a fresh Bun process. The emitter and Source Map modules are
also part of the self-source fixture set.

The compiler-driver test builds Generation 1 with the Emacs Lisp seed,
Generation 2 with Generation 1, and Generation 3 with Generation 2. It compares
all thirteen ESM and Source Map artifacts byte-for-byte, checks the portable CLI
against seed output, and verifies mapped file output and located diagnostics.
It also compares seed and self-hosted `defportable` closure builds.

`bootstrap-formatter.test.mjs` builds the formatter with the seed, exercises
comments, strings, collection delimiters, and reader prefixes, compares Bun and
Node bytes, and checks every compiler and standard-library `.eli` source for
byte-idempotence plus byte-identical generated ESM. `format-cli-test.sh`
separately proves stdout, atomic write, non-mutating check, structured reader
and formatter diagnostics, and canonical no-op behavior through the public
command.

`eliscript-mode-tests.el` covers `.eli` activation, comments, strings,
delimiter syntax, reader punctuation, idempotent structural indentation,
semantic font locking, Imenu, balanced definition navigation, configured and
VCS project discovery, real public-formatter integration, and transactional
formatter failure. It also covers project-aware check arguments, versioned
diagnostic decoding, and asynchronous Flymake failure reporting. The mode and
its tests are included in strict byte
compilation with warnings as errors and the maintained Emacs 29/30 matrix.

The self-hosted project test exercises cycle-safe graph closure and portable
requested-name fixed points in generated Eliscript code. It then compares
ordinary and portable ESM, Source Maps, and public project-manifest identity
with cache-free seed builds and repeats the self-hosted build service under Bun
and Node. It also proves version 2 multi-entry request, manifest, report, cache,
CLI, and worker identity while preserving complete stable
`eliscript-build-report` version 1 semantics. Host-specific timing measurements
remain validated independently.

`check-cli-test.sh` checks the same configured source graph under Bun and Node,
requires byte-identical version 1 reports, overlays unsaved stdin source under
its canonical filename, validates exact compiler diagnostics, and proves that
success and failure create no configured output directory.

The project CLI test builds stdin source under its original project filename,
requires cache reuse to be disabled, executes the virtual artifact, checks
embedded Source Map content and located human diagnostics, proves the source
file unchanged, and then rebuilds from disk. Mode ERT tests invoke the same
public command from an unsaved buffer and cover buffer/file/project arguments.

`literal-runtime.test.mjs` compiles square-bracket Vector literals, brace Map
literals, `#{...}` Set literals, source Keyword values, and explicit persistent
constructors through
both compilers, compares ESM and Source Maps byte-for-byte, and executes the
output under Bun and Node. It proves nested persistent Maps/Sets, duplicate-key
and duplicate-member semantics, left-to-right Set evaluation, Keyword
interning and value-semantic Map/Set lookup, first-class quoted
List/Vector/Symbol/Keyword data and canonical text, explicit native Array/Object
construction and host access, generic
protocol `nth` and `length`, exact context-sensitive imports, portable
rejection, and matching malformed literal diagnostics.

The loop/recur suite compares seed and self-hosted JavaScript plus Source Maps
byte-for-byte, then executes the same module under Bun and Node. It covers one
million function recurrences, one million binding-loop recurrences,
simultaneous swaps, vector-pattern rebinding, nested targets, conditional and
short-circuit tails, and awaited recurrence without JavaScript stack growth.

The ESM import suite covers side-effect, named, default, namespace,
default-plus-named, and default-plus-namespace declarations. It compares seed
and self-hosted JavaScript and Source Maps byte-for-byte, then executes both
artifacts under Bun and Node against a real ESM provider.

## Standard Library and Portable Collections

Standard-library tests compile bit, sequence, text, object, and data modules
with the seed and self-hosted compiler, compare complete JavaScript output,
execute importing ESM fixtures, inspect their source maps, and retain library
sources in production bundle maps. The bit suite additionally freezes signed
and unsigned word edges, masked shift distances, low-word multiplication,
population count, and rotations under Bun and Node. ERT separately proves that
portable selection includes transitive helpers while excluding unrelated
operations.

The portable persistent-vector suite compiles the complete trie from `.eli`
with both seed and self-hosted compilers, compares ESM and Source Maps
byte-for-byte, then executes both outputs under Bun and Node. Twenty thousand
generated updates preserve retained versions against an array model, and a
one-million-value association shares every node except its four-node selected
path.

The portable persistent-list suite applies the same dual-compiler and
dual-host proof to a different data structure. It checks twenty thousand
retained model versions, exact `rest`/`pop` suffix identity, ordered reversal
and conversion, and iterative one-million-node lookup and reduction.

The portable persistent-map suite compiles the complete HAMT from `.eli` with
both compiler generations and compares ESM and Source Maps byte-for-byte. Bun
and Node execute equivalent 100,000-key reports; generated value-key histories,
complete-hash collisions, 32/24 sparse/dense transitions, no-op identity, and a
million-key update verify model agreement and exact untouched-path sharing.

The portable persistent-set suite compiles both sides of its Map dependency
with the seed and self-hosted compilers, then executes both output pairs under
Bun and Node. It covers 20,000 retained value-key operations, collection
algebra, incompatible policies, complete-hash collisions, inherited 32/24
transitions, no-op identity, and exact million-member path sharing.

The persistent-core exit suite builds the complete portable value graph once,
then runs million-value Vector, Map, and Set audits in isolated Bun and Node
processes. Deterministic reports prove exact probes, retained original roots,
collision behavior, bounded changed paths, and identity sharing for every
unchanged trie or HAMT item. Together with the List dual-host million-node
fixture, this closes the P1 all-host correctness, collision, sharing, and
complexity gate.

The portable value-semantics suite compiles `value.eli` and its complete
five-module collection/bit dependency graph with both compiler generations,
then executes both outputs under Bun and Node. Frozen scalar and collection
hashes, default Map/Set policies, insertion-order independence, a real hash
collision, opaque host identity, and nested `undefined` are checked directly.
Two thousand generated cross-family cases enforce equality/hash invariants,
20,000 opaque objects prove stable distinct process-local hashes and efficient
Map/Set identity-key lookup, and one-million-value traversals prove iterative
bounded-stack behavior.
Identifier fixtures additionally freeze qualified and unqualified
Keyword/Symbol hashes, category separation, and reconstructed Map/Set lookup.

The portable Result suite compiles `result.eli` and its complete persistent
value dependency graph with both compiler generations, compares every ESM and
Source Map byte-for-byte, and runs both outputs under Bun and Node. It verifies
15 public operations, false/nil/undefined payloads, inactive-branch identity,
exact callback counts, reconstructed Map-key lookup, 2,000 generated
equality/hash pairs, a 50,000-item traversal, exact first-error short circuit,
and declaration-level portable dependency pruning.

The portable JSON suite compiles `json.eli` and its complete persistent value
dependency graph with both compiler generations, compares every ESM and Source
Map byte-for-byte, and runs both outputs under Bun and Node. It verifies strict
grammar rejection, duplicate-key paths, UTF-16 escapes, deterministic Map-key
ordering, unsupported values, non-finite numbers, shared graphs and cycles,
three resource limits, 2,000 generated value round trips, a 20,000-item scale
case, and declaration-level parser-only dependency pruning.

The portable numeric suite compiles the zero-dependency `numeric.eli` module
with both compiler generations, compares ESM and Source Maps byte-for-byte,
and runs both outputs under Bun and Node. It freezes finite/NaN/infinity and
negative-zero behavior, safe-integer boundaries, checked overflow, all signed
quotient/remainder/modulo cases, iterative GCD/LCM, 50,000 generated algebraic
invariants, and declaration-level GCD dependency pruning.

The identifier runtime suite verifies constructor validation, Keyword
interning, non-interned Symbol value equality, freezing, explicit serialization
failure, hostile host-object handling, and runtime persistent Map/Set behavior.
The core-library execution fixture compiles the Lisp-named identifier module
and executes its public constructors, predicates, and accessors under Bun and
Node.

The metadata runtime suite verifies `IMeta`/`IWithMeta` dispatch, Symbol and
persistent collection support, deterministic validation, complete trie/HAMT
sharing on root replacement, equality/hash exclusion, logical host conversion,
persistent update propagation, generic empty values, transient round trips,
and Bun/Node agreement. The portable metadata suite compiles its seven-module
dependency graph with seed and self-hosted compilers, compares every ESM and
Source Map artifact byte-for-byte, and executes both generations under Bun and
Node. The core-library fixture also compiles and calls the Lisp-named runtime
metadata surface.

The canonical data-text suite freezes scalar/identifier spellings,
parenthesized List order, insertion-order-independent Map/Set output, metadata prefixes, unsafe
identifier tags, comments and separators, malformed and duplicate diagnostics,
and explicit depth/length/value limits. Two thousand generated nested values
must satisfy value equality and byte-identical reprinting; one shared fixture
then proves Bun/Node equivalence. The core-library fixture compiles and executes
the Lisp-named printer/reader module through both compiler generations.

The portable data-text suite compiles portable identifiers, all four
persistent collections, value semantics, metadata, and the printer/reader with
both compiler generations. It compares all nine JavaScript and Source Map
artifacts, runs Bun and Node reports, preserves List category and nested
`undefined`, checks located failures and limits, verifies 2,000 generated
round trips, and compares runtime/portable bytes over their common value
subset.

The Atom suite compiles the Eliscript-authored state module and its persistent
Map/Vector dependency graph with both compiler generations, compares every
artifact and Source Map byte-for-byte, and executes both outputs under Bun and
Node. It covers validation and callback exceptions, same-Atom reentrancy,
commit-time watch snapshots, nested transition ordering, equal-key watch
replacement, forged identities, failure recovery, 20,000 generated operations,
and 100,000 stack-safe swaps.

The JavaScript interop suite compiles the Eliscript-authored native-container
boundary and its persistent dependencies with both compiler generations,
compares every artifact and Source Map byte-for-byte, and executes both outputs
under Bun and Node. It covers cross-realm predicates, shallow and deep
conversion, sharing and cycles, accessors and Symbol keys, duplicate
value-semantic Map/Set entries, resource limits, a plain-object host API
fixture, 2,000 generated nested graphs, and a 100,000-value snapshot.

The protocol suite exercises immutable protocol definitions, direct Symbol
slots, exact prototype extensions, stable host categories, explicit defaults,
atomic validation, and structured missing diagnostics. It proves that
extensions do not modify built-in prototypes, that categories adapt values
across JavaScript realms, and that external immutable types retain value-key
semantics through `IEquiv`, `IHash`, and persistent Map. Bun and Node execute
the same dispatch report, including a versioned definition round trip with
fresh slots and empty extension state, followed by one million direct calls in
the default test host. Strict definition tests reject accessors without
invoking them, sparse or extended Arrays, non-plain Objects, unknown versions,
and more than 1,024 operations. The worker codec separately proves that the
definition data crosses the value boundary while the executable protocol does
not.

The collection-protocol suite applies that dispatch core to `ICounted`,
`ILookup`, `IIndexed`, `ISeqable`, and `IReduce`. It covers direct persistent
implementations, prototype-preserving native adapters, replayable sequence
views, frozen Map entries, explicit reduced-value termination, external types,
realm-explicit extension, Bun/Node parity, and one million reduction steps.
The construction continuation covers canonical `empty`, variadic `conj`,
variadic `assoc`, exact `contains`, persistent no-op identity, immutable native
copies, truthful partial Set protocols, bounded infinite-entry rejection, and
one million generic Vector additions while preserving the old version.

The transducer suite covers completing reducers, declared-order mapping and
filtering, exact and zero-input taking, reduced termination, reusable state,
custom transducer completion, and protocol-driven `into` across persistent,
native, and external collection types. Bun and Node execute one shared report;
an instrumented million-input scalar pipeline proves one-pass transform counts
without persistent collection allocation, followed by bounded final-target
construction.

The transient suite verifies truthful editable capabilities, O(1) conversion,
owner-matched Vector and HAMT path reuse, collision and 32/24 layout behavior,
Set delegation, retained generations, deterministic invalidation, and
serialization rejection. Instrumented persistent/transient construction gates
Vector, Map, and Set node-allocation reductions; a one-million-value Vector
build and Bun/Node fixture close the scale and host-equivalence boundary.

The protocol core-library suite extends an external `IReduce` source and runs
sequence transforms, searches, grouping, indexing, counting, and frequencies
without concrete source checks. It freezes Eliscript truth behavior, exact
reduced-value termination, persistent result families, equal persistent keys,
fresh transducer state, and a transient HAMT allocation ratio. It then compiles
and executes the Lisp-named protocol, identifier, collection, transducer,
transient, sequence, and data modules with source maps. The sequence/data maps
contain the maintained Eliscript algorithm bodies; seed and self-hosted
compiler artifacts match, strict binding references agree with declarations,
and Bun/Node execute
the same generated API report.

## JavaScript Runtime Collections

Persistent-list tests cover logical construction order, constant-time front
updates, exact suffix sharing, collection/value/metadata protocols, List versus
Vector identity, persistent-Map key behavior, portable hash parity, and
canonical parenthesized data text. Iterative construction and reduction are
also exercised over one million nodes, with matching Bun and Node reports.

Persistent-vector tests exercise the provisional M8 runtime independently of
literal compilation. They compare generated operations with a simple mutable
array model, retain and probe previous versions after each update, cross tail
and root-depth boundaries, inspect exact node allocation and sharing counts,
and verify bounded lookup and update work at one million values. Test-only
shape and counter adapters live under `runtime/testing` and are not application
APIs.

Value-semantics tests freeze scalar edge behavior, recursive vector equality,
ordered hashes, host identity, immutable hash caching, and an actual collision
pair. Generated nested vectors establish the equal-implies-equal-hash
invariant, while exact JSON fixtures and a million-value case run under Bun and
Node. The compiler's existing `equal` form is not migrated by these runtime
tests.

Persistent-map tests cover bitmap, dense-array, and complete-hash collision
nodes; exact promotion/demotion thresholds; scalar, vector, and host-identity
keys; insertion-order-independent hash/equality; and generated operations
against a native SameValueZero model. Instrumented 100,000-key updates prove
exact path sharing, while a one-million-key suite bounds lookup, replacement,
and deletion under both Bun and Node.

Persistent-set tests reuse the same HAMT observation counters while proving a
separate Set value category, value-equal members, complete-hash collisions,
set algebra, unordered hashing, and no-op identity. A generated mutable model
covers 20,000 updates, a 100,000-member deletion proves exact path sharing, and
one-million-member membership, insertion, and removal remain depth-bounded
under Bun and Node.

## Benchmarks, Projects, and Worker

`onboarding-docs.test.mjs` checks the versioned installation and daily-workflow
guide, rejects missing required stages, and executes a temporary two-module
project through formatting, graph checking, self-hosted Bun and Node builds,
structured unsaved-source diagnostics, evaluation, persistent terminal state,
and Emacs mode discovery. This is executable documentation evidence, not the
separate final local onboarding acceptance exercise.

`repository-integrity.test.mjs` runs the complete dependency and artifact audit
against the real tracked repository. Negative cases prove that package boundary
violations, undeclared packages, stale benchmark digests, missing generated
module registrations, and missing benchmark registrations fail closed.

Collection-layout benchmark tests execute equivalent real HAMT node operations,
smoke-test the Bun and Node host adapters, and validate the committed
Bun/Node/Chrome baseline. They recompute its source digest and 32/24 threshold
decision from raw samples without treating host timing values as regression
gates.

Project-build tests inspect expanded IR imports, retain non-Eliscript
specifiers, support cycles, enforce canonical root containment, and verify
per-module source maps, incremental decisions, and build phase timings. The
public CLI builds and executes a four-module source graph that crosses from
`examples/` into three `stdlib/` modules without Vite.

Worker tests compile one pure Eliscript workload, then exercise the Bun runtime
and Emacs client over real pipes. They cover framing, version negotiation,
request correlation, progress, cancellation, timeout, module logging,
serialization failures, immutable module caching, automatic restart,
source-mapped runtime errors, clean shutdown, equivalent results, and segmented
benchmark output. Both generated export names and manifest-backed Eliscript
operation names are exercised. A representative adapter concurrently scores
tokenized documents and preserves input order. Performance ratios are reported
but never asserted in CI.
