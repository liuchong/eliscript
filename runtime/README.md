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

Host libraries are imported explicitly by application modules. The runtime
contains no UI-framework wrapper, element constructor, or bundler adapter.

## Modules

### Literal Runtime ABI

`literals.mjs` is the package-owned standard ESM link for generated persistent
constructors. It exports `list`, `vector`, `hashMap`, `hashSet`, `keyword`, and
`symbol`,
delegating directly to the canonical persistent collection and identifier
implementations. The compiler imports it only when evaluated source or quoted
data constructs one of those runtime values. Static JavaScript property keys
and scalar-only quote do not link it by themselves. It has no application
framework, bundler, server, or publishing dependency. Explicit `js-array` and
`js-object` forms bypass this ABI and emit native containers directly;
`js-nth` and `js-length`
likewise bypass collection protocol dispatch.

### Persistent Vector

`core/vector.mjs` is the canonical provisional M8 persistent Vector module. It
implements an immutable 32-way bit-partitioned vector trie with a short tail
and now backs square-bracket value expressions. Internal
node shape, allocation, visit, and sharing observations are isolated in
`testing/vector.mjs`; applications must not depend on those test adapters.

### Persistent List

`core/list.mjs` is the canonical optimized Persistent List runtime. Its frozen
singly linked nodes provide constant-time front construction, complete suffix
sharing, cached counts, iterative traversal, collection protocols, value
semantics, and immutable metadata. It deliberately does not advertise indexed
collection capability: its convenience `nth` method is linear-time. Internal
allocation and sharing observations live in `testing/list.mjs` and are not
application APIs.

### Value Semantics

`core/value.mjs` defines provisional coercion-free value equality and unsigned
32-bit hashing. Portable scalar, List, and persistent-vector hashes are
deterministic;
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
the runtime classes. The versioned Emacs worker value codec preserves both
identifier categories across the process boundary.

### Metadata

`core/metadata.mjs` defines open `IMeta` and `IWithMeta` protocols plus
`meta`, `withMeta`, `varyMeta`, and capability inspection. Eliscript Symbols
and persistent List, Vector, Map, and Set values attach either `null` or a
persistent Map by replacing only their frozen root wrapper. Equality and hashing ignore
metadata; collection updates, `empty`, and transient round trips preserve it;
logical host conversions emit only collection contents. Keywords remain
unannotated because their global interning cannot carry per-use state.

Exact semantics and evidence are specified in
[specs/0068-immutable-metadata-semantics.md](../specs/0068-immutable-metadata-semantics.md).

### Canonical Data Text

`core/data-text.mjs` supplies the open `IPrint` protocol and canonical
`printValue`, `readValue`, and `readValues` operations. Scalar edges,
identifiers, persistent List/Vector/Map/Set values, and metadata round-trip through
readable Lisp-shaped text. Map entries and Set members sort by canonical text,
unsafe identifiers use explicit tags, and duplicate or malformed input fails
with a located `DataTextError`. Depth, UTF-16 length, and value-count limits
bound both directions.

This is deliberately separate from executable source reading and the future
versioned Emacs transport codec. Portable data text is implemented independently
in `stdlib/data-text.eli` over the same common grammar. Exact
semantics are specified in [0069](../specs/0069-canonical-runtime-data-text.md)
and [0071](../specs/0071-canonical-portable-data-text.md).

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

`core/protocol-impl.mjs` and its Source Map are generated from the canonical
`stdlib/core/protocol.eli` source by `bun run generate:runtime-protocol`.
`core/protocol.mjs` is a stable camel-case compatibility facade with no
dispatch policy of its own; `core/protocol-error.mjs` contains only the host
error type that cannot be expressed as an ordinary portable value.

`protocolDefinition` extracts a frozen
`eliscript-protocol-definition` v1 Object containing only a name and ordered
operation names. `defineProtocolFromDefinition` validates that data and creates
fresh local dispatch functions, Symbol slots, and empty extension state. The
definition can cross JSON and worker value boundaries; the executable protocol
object and its implementations cannot.

`core/collection.mjs` defines the generic collection capability layer:
`ICounted`, `IEmptyable`, `IConj`, `ILookup`, `IAssociative`, `IIndexed`,
`ISeqable`, `IReduce`, and `IKVReduce`. Persistent List, Vector, Map, and Set values use direct
Symbol slots; native Array, Map, Set, and ordinary Object values use exact-type
extension tables, while primitive String uses an explicit host category.
Adapters do not modify prototypes. Sequence views are frozen and replayable;
bounded views expose finite counts, while explicitly unbounded views answer
`seq` without traversal and reject `count` immediately. Keyed elements are
frozen entries. Reduction views are frozen, replayable `IReduce`-only values
that reject `count` and `seq` without traversal. Reduced values provide early
termination, and construction operations preserve persistent inputs or return
immutable native copies.

`reduceKV` passes indexes or stored keys directly to a three-argument reducer.
Persistent Vector leaf arrays and persistent Map HAMT entries are traversed
without constructing public pair values; native Array, Map, Object, nil, and
externally extended values participate through the same open protocol.

### Transducers

`core/transducer.mjs` composes mapping, filtering, removing, bounded taking,
and dropping as destination-independent reducing-function transformations.
`transduce` delegates traversal through `IReduce`; `eduction` creates a
replayable reduction-only pipeline over finite or unbounded sources;
`runBang` performs ordered effectful consumption; and `into` obtains an empty
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

`core/sequence.mjs` implements replayable range, repetition, iteration, cycle,
and indexed generation sources plus eager indexed/keep, prefix, sampling,
interposition, dedupe/distinct, flattening, partitioning, reduction-history,
boundary lookup, bounded tail selection, one-pass splitting, and search
operations against `IReduce`. Results are persistent Vectors, reduced values
stop bounded traversal exactly, and tail selection uses fixed-position ring
storage. Source callbacks are lazy, finite sources expose exact counts, and
unbounded sources compose with every reduced-value bounded consumer.
`core/data.mjs` implements
value-semantic indexing, grouping, counting, frequencies, nested associative
reads and updates, key selection, merging, and key/value zipping. Bulk result
construction uses persistent Maps and transient builders where prior-value
lookup is not required. Native and persistent collections, null, and external
protocol extensions all use the same algorithm path.

`core/order.mjs` defines the open `IComparable` protocol, deterministic
natural comparison for scalar, identifier, List, and Vector values, comparator
adaptation, stable `sort` and `sortBy`, and keyed extrema. Sorting consumes any
`IReduce` source, caches each sort key once, preserves equal-value source order,
and returns a persistent Vector without mutating its input.

`core/text-impl.mjs` and `core/object-impl.mjs` are generated from
`stdlib/core/text.eli` and `stdlib/core/object.eli`. Their public modules are
camel-case re-export facades. Text indexing uses UTF-16 code units throughout;
keyed transformations use protocols and transducer-backed `into`, selecting
transient construction for persistent Map targets without type branches.

`stdlib/core/protocol.eli`, `stdlib/core/seq.eli`, `stdlib/core/data.eli`,
`stdlib/core/order.eli`, `stdlib/core/text.eli`, and `stdlib/core/object.eli`
provide the maintained
Lisp-named Eliscript implementations. Protocol definitions and extension
tables remain process-local and are not serialized by the worker value codec.

### Worker Host

`worker.mjs` is the reference long-lived compute host. It communicates over
versioned NDJSON, imports local generated modules, correlates concurrent
requests, and supports progress, cooperative cancellation, timeouts, structured
errors, module caching, and shutdown. Protocol stdout is isolated from module
logs, which are redirected to stderr. Requests may address a raw generated ESM
export or resolve a `defportable` source name through the module's frozen
`__eliscript_portable__` manifest. `worker-value-codec.mjs` adds the explicit
`eliscript-value-v1` encoding for persistent values, identifiers, metadata,
special numeric/nullish values, and explicit native containers.
`worker-value-stream.mjs` adds `eliscript-value-chunks-v1`: an incremental
event grammar with bounded batches, persistent transient builders, traversal
limits, UTF-16-safe text parts, and cancellation checks. The worker applies
one-chunk acknowledgements to request input and stdout drain backpressure to
progress and response output. Chunked success timing reports actual argument
and response chunk counts plus the active framing bounds. The maintained
real-process probe binds its 256 MiB memory report to these runtime sources.
The worker also confines generated
`eliscript/runtime/` imports to this package runtime, so temporary portable
builds do not depend on their output directory for runtime resolution.
Request contexts now include a frozen `capabilities` token from
`platform/worker.mjs`, granting only progress and cancellation. The same
confined resolver accepts package-owned `eliscript/platform/` imports and
rejects traversal outside that directory.
