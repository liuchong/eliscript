# Runtime

[Project README](../README.md) | [Standard library](../stdlib/README.md) |
[Specifications](../specs/README.md)

## Boundary

This directory contains the minimal JavaScript runtime semantics that cannot be
represented by ordinary host values alone. Ordinary JavaScript values and APIs
should still be emitted directly; helpers need a concrete semantic reason to
exist.

The compiler still emits a local Lisp-truthiness helper for standalone
generated forms. `core/truth.mjs` exposes the same semantics to shared runtime
algorithms: only `false`, `null`, and `undefined` are false.

React modules import `react/jsx-runtime` directly. There is no Eliscript wrapper
runtime for element construction.

## Modules

### Persistent Vector

`core/vector.mjs` is the first provisional M8 persistent-value module. It
implements an immutable 32-way bit-partitioned vector trie with a short tail.
It is tested independently before vector literal behavior changes. Internal
node shape, allocation, visit, and sharing observations are isolated in
`testing/vector.mjs`; applications must not depend on those test adapters.

### Value Semantics

`core/value.mjs` defines provisional coercion-free value equality and unsigned
32-bit hashing. Portable scalar and persistent-vector hashes are deterministic;
opaque JavaScript objects retain process-local identity semantics. Persistent
hashes are cached privately. `testing/value.mjs` exposes cache and identity
counters only for conformance tests.

### Identifier Values

`core/identifier.mjs` defines immutable Keyword and Eliscript Symbol values
with optional namespaces. Keywords are interned; Symbols use field-based value
equality without interning. Both implement `IEquiv` and `IHash`, use distinct
deterministic category tags, and participate directly in persistent Map and
Set operations. A non-enumerable global logical-type brand lets portable
Eliscript value algorithms recognize the same categories without depending on
the runtime classes. Serialization fails explicitly until the value codec is
specified.

### Metadata

`core/metadata.mjs` defines open `IMeta` and `IWithMeta` protocols plus
`meta`, `withMeta`, `varyMeta`, and capability inspection. Eliscript Symbols
and persistent Vector, Map, and Set values attach either `null` or a persistent
Map by replacing only their frozen root wrapper. Equality and hashing ignore
metadata; collection updates, `empty`, and transient round trips preserve it;
logical host conversions emit only collection contents. Keywords remain
unannotated because their global interning cannot carry per-use state.

Exact semantics and evidence are specified in
[specs/0068-immutable-metadata-semantics.md](../specs/0068-immutable-metadata-semantics.md).

### Canonical Data Text

`core/data-text.mjs` supplies the open `IPrint` protocol and canonical
`printValue`, `readValue`, and `readValues` operations. Scalar edges,
identifiers, persistent Vector/Map/Set values, and metadata round-trip through
readable Lisp-shaped text. Map entries and Set members sort by canonical text,
unsafe identifiers use explicit tags, and duplicate or malformed input fails
with a located `DataTextError`. Depth, UTF-16 length, and value-count limits
bound both directions.

This is deliberately separate from executable source reading and the future
versioned Emacs transport codec. Portable List/collection data text remains the
next P1 slice. Exact semantics are specified in
[specs/0069-canonical-runtime-data-text.md](../specs/0069-canonical-runtime-data-text.md).

### Persistent Map

`core/map.mjs` builds on that key contract with a provisional persistent HAMT.
Sparse bitmap nodes promote to dense 32-slot nodes, dense nodes compact after
deletion, and complete 32-bit collisions retain distinct keys. Internal node
shape, transition, allocation, visit, and sharing evidence lives in
`testing/map.mjs`. Cross-engine measurements select promotion at 32 occupied
branches and demotion at 24; the versioned methodology and baseline live under
`tools/collections` and `benchmarks`.

### Persistent Set

`core/set.mjs` is a thin immutable value-semantic view over that HAMT. Members
occupy map keys under one private sentinel, so Set membership, algebra,
collisions, and path sharing cannot drift from Map behavior. Set-specific
shape and sharing evidence is adapted through `testing/set.mjs` without
exposing the backing map to applications.

### Protocols and Collections

`core/collection.mjs` defines the generic collection capability layer:
`ICounted`, `IEmptyable`, `IConj`, `ILookup`, `IAssociative`, `IIndexed`,
`ISeqable`, and `IReduce`. Persistent Vector, Map, and Set values use direct
Symbol slots; native Array, Map, and Set values use exact-type extension tables
without prototype changes. Sequence views are frozen and replayable, Map
elements are frozen entries, reduced values provide early termination, and
construction operations preserve persistent inputs or return immutable native
copies.

### Transducers

`core/transducer.mjs` composes mapping, filtering, removing, bounded taking,
and dropping as destination-independent reducing-function transformations.
`transduce` delegates traversal through `IReduce`; `into` obtains an empty
target and adds logical values through `IConj` or an editable transient
builder. Pipelines preserve reduced-value termination, run completion exactly
once, reuse transducers with fresh reduction state, and allocate no
intermediate collection.

### Transient Collections

`core/transient.mjs` defines provisional `IEditable` and
`ITransientCollection` protocols plus conversion and update operations.
Persistent Vector, Map, and Set values create owner-token builders that share
their source representation until the first selected-path update. Completion
returns a persistent value and permanently invalidates the builder. Transients
reject persistent collection operations and serialization; async and module
escape checks remain compiler work. Internal ownership and allocation evidence
is exposed only through `testing/vector.mjs`, `testing/map.mjs`, and
`testing/set.mjs`.

### Core Algorithms

`core/sequence.mjs` implements eager sequence transformations and searches
against `IReduce`, returning persistent Vectors and using reduced values for
exact bounded traversal. `core/data.mjs` implements value-semantic indexing,
grouping, counting, and frequencies with persistent Map results and transient
final construction. Native and persistent collections, null, and external
protocol extensions all use the same algorithm path.

`stdlib/core/seq.eli` and `stdlib/core/data.eli` provide the maintained
Lisp-named Eliscript implementations. Portable protocol dispatch internals
remain later work.

### Worker Host

`worker.mjs` is the reference long-lived compute host. It communicates over
versioned NDJSON, imports local generated modules, correlates concurrent
requests, and supports progress, cooperative cancellation, timeouts, structured
errors, module caching, and shutdown. Protocol stdout is isolated from module
logs, which are redirected to stderr. Requests may address a raw generated ESM
export or resolve a `defportable` source name through the module's frozen
`__eliscript_portable__` manifest.
