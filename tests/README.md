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
compatibility contract and requires the committed GitHub Actions workflow to
match its deterministic render. Negative Bun tests cover missing matrix cells,
mutable Action revisions, weakened CI commands, and manual workflow drift.
Compatibility Baseline 1 then requires every specification and feature to be
classified as stable, provisional, or planning, with stable ownership and
feature status agreeing in both directions.

## Default Suite

`make test` runs the ERT suite, invokes the public CLI, compares the generated
ESM with its snapshot, validates and decodes Source Map v3 output, and executes
ordinary, source-mapped, and React server-rendered modules with Bun. It also
tests the Vite transform adapter and builds the browser counter with bundled
Eliscript source maps. Org publishing tests cover metadata, deterministic HTML,
draft and duplicate handling, the watched Vite content module, direct ESM
execution, and the production Org site bundle.

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

The analyzer fixture runs after both readers. It compares success and complete
diagnostic strings for scope resolution, declaration collisions, mutability,
imports, exports, and malformed special forms. Both analyzers must accept all
current bootstrap sources, including `analyzer.eli` itself.

The IR fixture runs the complete generated front end and lowerer, then compares
the resulting program with a normalized seed oracle. It covers every one of
the 53 public IR node kinds, JSON-safe quoted data and literal tags,
kind-specific properties, complete nested source spans, macro call origins,
and all ten bootstrap compiler modules.

The emitter fixture sends the same portable IR through the generated backend
and the Emacs seed backend. It compares complete ESM text and parsed Source Map
documents, checks signed Base64 VLQ boundaries and Unicode columns, and runs a
generated module in a fresh Bun process. The emitter and Source Map modules are
also part of the self-source fixture set.

The compiler-driver test builds Generation 1 with the Emacs Lisp seed,
Generation 2 with Generation 1, and Generation 3 with Generation 2. It compares
all ten ESM and Source Map artifacts byte-for-byte, checks the portable CLI
against seed output, and verifies mapped file output and located diagnostics.
It also compares seed and self-hosted `defportable` closure builds.

The loop/recur suite compares seed and self-hosted JavaScript plus Source Maps
byte-for-byte, then executes the same module under Bun and Node. It covers one
million function recurrences, one million binding-loop recurrences,
simultaneous swaps, vector-pattern rebinding, nested targets, conditional and
short-circuit tails, and awaited recurrence without JavaScript stack growth.

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

The portable value-semantics suite compiles `value.eli` and its complete
five-module collection/bit dependency graph with both compiler generations,
then executes both outputs under Bun and Node. Frozen scalar and collection
hashes, default Map/Set policies, insertion-order independence, a real hash
collision, opaque host identity, and nested `undefined` are checked directly.
Two thousand generated cross-family cases enforce equality/hash invariants,
and one-million-value traversals prove iterative bounded-stack behavior.

The protocol suite exercises immutable protocol definitions, direct Symbol
slots, exact prototype extensions, stable host categories, explicit defaults,
atomic validation, and structured missing diagnostics. It proves that
extensions do not modify built-in prototypes, that categories adapt values
across JavaScript realms, and that external immutable types retain value-key
semantics through `IEquiv`, `IHash`, and persistent Map. Bun and Node execute
the same dispatch report, followed by one million direct calls in the default
test host.

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
and executes the Lisp-named `stdlib/core/` facades with source maps and compares
one shared report under Bun and Node.

## JavaScript Runtime Collections

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
