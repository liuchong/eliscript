# 0041: Host Symbiosis, Persistent Data, and Emacs Acceleration

- Status: Accepted
- Implementation: In Progress
- Date: 2026-08-28
- Depends on: 0002 Emacs Acceleration Through JavaScript,
  0034 Nullish Values, 0040 Project Maturity Roadmap

## Summary

Eliscript should improve JavaScript and Emacs Lisp programs in the same broad
way that a well-designed hosted Lisp improves its host platform: preserve
direct access to the host, but provide stronger language-level values,
functional collection processing, metaprogramming, and state discipline.

This specification adds two connected long-term architecture tracks:

1. efficient immutable persistent data structures and collection abstractions
   implemented for the JavaScript runtime
2. a supported acceleration layer that lets Emacs applications move explicit,
   compute-heavy Eliscript work to JavaScript and safely consume the result

The first track makes Eliscript more than alternate JavaScript syntax. The
second turns that language and runtime work back into a practical performance
extension for Emacs without trying to replace Emacs Lisp or editor state.

## Design Lessons

The design takes several general lessons from the Clojure and ClojureScript
model while remaining independent and specific to Eliscript.

### Language and Host Are Symbiotic

A hosted language should not rebuild the host platform behind an abstraction
wall. It should improve the programming model while retaining direct access to
the host's libraries, runtime, debugger, garbage collector, and deployment
reach.

For Eliscript:

- JavaScript is the runtime platform and ESM is the module contract.
- JavaScript functions remain callable and Eliscript functions remain ordinary
  callable JavaScript values at explicit interop boundaries.
- Browser, Node.js, Bun, and optional UI-library APIs are consumed rather than
  reimplemented.
- Emacs remains the editor and interactive host; compiled JavaScript is an
  optional compute engine.

Application frameworks and build tools are consumers at this boundary. Vite,
React, blog or site generators, Pages hosting, and publishing adapters may
prove that ordinary generated ESM is useful, but cannot become language-core
dependencies, core objectives, standard-library requirements, or P4
acceptance evidence.

### The Compiler Family Has Asymmetric Roles

ClojureScript demonstrates that a language can begin with a compiler hosted in
a related Lisp, then provide self-hosted compilation in JavaScript
environments. Eliscript follows that staged advantage without turning Emacs
Lisp and Eliscript into interchangeable languages.

- Emacs Lisp is the bootstrap host, trusted seed, editor integration language,
  and independent semantic oracle.
- Eliscript is the compiler maintenance language and application language.
- JavaScript is the executable compiler artifact and application runtime.
- Shared conformance defines intentional overlap; visual Lisp similarity does
  not imply full semantic compatibility.
- New compiler work normally lands in `.eli`; seed changes preserve bootstrap
  and reference coverage rather than creating a second primary compiler.

This asymmetry is useful. Emacs supplies a durable bootstrap and interactive
environment, while self-hosting lets the compiler use the performance and
deployment reach of modern JavaScript engines.

### Improvement Returns to Both Hosts

The relationship is a feedback loop rather than a one-way transpilation step:

1. Emacs Lisp bootstraps the language and exposes real editor workloads.
2. Eliscript adds immutable values, protocols, reusable algorithms, and
   explicit state discipline above raw JavaScript facilities.
3. Generated JavaScript gives those abstractions modern JIT execution,
   standard modules, browser/server deployment, and the host package
   ecosystem.
4. The worker and value bridge return selected high-cost operations to Emacs
   as versioned, cancellable services.
5. Profiles from real Emacs use identify the next language, compiler, and
   library optimizations.

This is the concrete sense in which Eliscript should improve Emacs Lisp.
Editor-owned identity and interaction stay in Emacs, while persistent indexes,
graph algorithms, parsing, transformation, and search can run as generated
JavaScript when their measured crossover justifies the boundary. Stronger
language-level values make the accelerated path easier to verify and reuse;
JavaScript speed alone is not sufficient acceptance evidence.

### Composite Values Default to Immutability

Native JavaScript arrays and objects are useful host containers, but their
identity and mutation semantics are a weak default for functional Lisp code.
Eliscript needs composite values whose updates return new values, preserve old
versions, support value equality, and share unchanged structure.

Immutability is not implemented by cloning a whole array or object on every
update. Persistent data structures copy only the path to changed nodes and
share the rest. Controlled transient mutation accelerates bulk construction
without exposing mutable shared values.

### Algorithms Target Abstractions

Collection functions should operate on small protocols rather than one
concrete array representation. A vector, list, map, set, JavaScript iterable,
or future collection can participate in `count`, lookup, reduction, and
sequence operations without inheriting from one class hierarchy.

### Efficient Reduction Comes Before Broad Laziness

A universal sequence view is useful, but a stateful JavaScript iterator should
not become the semantic foundation. Eliscript prioritizes collection-native
`reduce` and composable transducers so pipelines avoid intermediate arrays.
Persistent lazy sequences can be added where real applications require them;
they are not required to make every collection algorithm composable.

### Host Differences Remain Explicit

Eliscript does not promise that every Clojure or Emacs Lisp behavior carries
over. JavaScript numbers, promises, the event loop, property semantics, and
`null`/`undefined` remain part of the explicit host contract. The useful lesson
is disciplined adaptation, not compatibility by imitation.

## Feature Selection

The project uses the hosted Lisp model as a design lens, not a compatibility
target.

| Hosted Lisp capability | Eliscript decision for 1.0 | Reason |
| --- | --- | --- |
| code as data and macros | adopt and strengthen | already central; keep evaluation deterministic |
| immutable persistent collections | adopt | gives composite values predictable equality and sharing |
| protocols | adopt a focused single-dispatch form | enables open algorithms without class inheritance |
| sequence abstraction | adopt a small immutable traversal view | unifies collections without making iterators semantic |
| reducers and transducers | adopt eager reduce and transducers | composes work without intermediate collections |
| transients | adopt for vector, map, and set | preserves values while accelerating construction |
| `loop` and `recur` | adopt | supports predictable stack-safe collection algorithms |
| metadata | adopt after collection roots stabilize | useful for tooling without affecting equality |
| atoms | adopt one event-loop-safe reference type | cleanly separates immutable values from changing identity |
| multimethods | experimental after protocols | useful but not required for the first stable applications |
| records and user-defined runtime types | defer unless applications require them | protocols plus maps cover the initial product needs |
| pervasive lazy sequences | defer | eager reduce and transducers have clearer host and resource behavior |
| software transactional memory | exclude from 1.0 | JavaScript's event loop and Emacs worker boundary need a different model |
| agents | exclude from 1.0 | worker services already own asynchronous execution |
| dynamic vars as ambient build context | exclude | conflicts with deterministic compilation |
| host namespace replacement | exclude | standard ESM already owns module identity and loading |

The result should feel like a coherent functional Lisp on JavaScript, not a
partial port whose missing host facilities are permanent surprises.

## Eliscript Value Model

### Value Families

The mature language distinguishes three families:

1. **Scalar values:** nullish values, booleans, numbers, strings, keywords, and
   symbols
2. **Eliscript persistent values:** lists, vectors, maps, and sets
3. **Host values:** JavaScript arrays, plain objects, class instances,
   functions, promises, typed arrays, DOM values, and other opaque objects

Eliscript persistent values use value equality and stable hashing. Host objects
use JavaScript identity unless an explicit adapter says otherwise.

### Literal Direction

The stable value and host-container direction is:

- list data remains persistent list data
- vector literals become persistent vectors
- map literals become persistent maps
- set literals become persistent sets
- explicit constructors create native JavaScript arrays and objects for
  interop

Specifications 0083, 0084, 0092, and 0094 complete the persistent
Vector/Map/Set/List source model. Specification 0095 removes the provisional
`array`/`object` constructor aliases and freezes `js-array`, `js-object`, and
`js-cons` as the explicit host boundary. The compiler and maintained sources
use explicit host constructors wherever native identity or mutation is
required.

Conversion is never implicit at a JavaScript call boundary. `to-js` and
`from-js` perform declared shallow or deep conversion. Deep conversion rejects
cycles unless a future codec explicitly supports references.

### Equality and Hashing

Persistent values require one language-level `equal?` and one compatible
`hash` contract:

- equal scalar values have equal hashes
- vectors and lists compare sequential values in order but remain distinct
  collection categories unless a later stable specification unifies them
- maps compare key/value membership independent of insertion order
- sets compare membership independent of insertion order
- metadata does not affect value equality or hashing
- native host objects compare by identity
- hash collisions are resolved by equality, never treated as equality
- cyclic persistent values cannot be constructed

The initial hash is a deterministic 32-bit integer independent of JavaScript
object identity. Strings, numbers, keywords, symbols, ordered collections, and
unordered collections have separately specified mixing rules. Hashes may be
cached on immutable roots.

### Metadata

Persistent values and syntax-capable values may carry immutable metadata.
Metadata supports source, documentation, tooling, and user annotations without
changing value equality. Metadata is not emitted into ordinary JavaScript host
objects unless explicitly converted.

Metadata is useful but follows vectors and maps in implementation order. The
compiler's existing located syntax remains its own explicit representation and
does not depend on user metadata for correctness.

## Persistent Data Structures

### Persistent List

A list is a singly linked immutable node with cached count:

```text
ListNode(value, next, count, metadata)
EmptyList(metadata)
```

Complexity targets:

- `first`: O(1)
- `rest`: O(1)
- `cons`: O(1)
- `count`: O(1)
- indexed lookup: O(n), discouraged in generic algorithms

Lists are the natural representation of source forms and stack-like data.

### Persistent Vector

The vector uses a 32-way bit-partitioned vector trie with a short tail array.
A 32-bit index contributes five bits at each trie level.

```text
PersistentVector(count, shift, root, tail, metadata, cachedHash)
VectorNode(owner, slots[32])
```

The tail stores the final up-to-32 values, making append and recent indexed
access cheap. Full tails are inserted into the trie. Updates copy only nodes on
the selected root-to-leaf path.

Complexity targets:

- `count`: O(1)
- `nth`: O(log32 n), effectively a small bounded number of hops
- `assoc`: O(log32 n) with structural sharing
- `conj`: amortized O(log32 n)
- `peek`: O(1)
- `pop`: O(log32 n)
- sequential reduction: O(n), chunked by leaf arrays

The first implementation uses a regular vector trie rather than a relaxed
radix-balanced tree. Efficient arbitrary concatenation and slicing remain
library operations until profiles justify a more complex representation.

### Persistent Hash Map

The map uses a 32-way hash array mapped trie (HAMT). Each level consumes five
bits of a deterministic 32-bit key hash.

Node forms are:

- `BitmapIndexedNode`: sparse children addressed by a bitmap and popcount
- `ArrayNode`: dense 32-slot branching after a measured occupancy threshold
- `HashCollisionNode`: keys with equal full hashes but unequal values
- `MapEntry`: key/value leaf pair

`assoc` and `dissoc` copy the changed path while reusing all untouched nodes.
Dense and sparse nodes convert at specified thresholds to balance allocations
and lookup cost.

Complexity targets:

- `count`: O(1)
- `get`, `contains?`, `assoc`, and `dissoc`: expected O(log32 n)
- full reduction: O(n)
- update allocation: proportional to trie depth, not collection size

Small maps may use a compact flat representation below a measured threshold.
The threshold is selected by benchmark and does not change observable
semantics.

### Persistent Hash Set

A set is a thin value-semantic view over the persistent hash map. Membership
keys map to one internal sentinel. Set operations use map traversal and
transient builders where profitable.

Complexity targets match the map for membership, insertion, and removal.

### Transient Builders

Vectors, maps, and sets provide transient forms for isolated bulk updates.
Transients use a unique owner token stored on editable trie nodes:

- conversion from persistent to transient is O(1)
- an operation mutates a node only when its owner token matches
- otherwise the operation clones the node and assigns the current owner
- conversion back to persistent is O(1) apart from final root normalization
- every operation after `persistent!` fails deterministically
- a transient cannot cross a worker message, async suspension, module export,
  or public persistent collection API

This is controlled implementation mutation. It does not weaken the user-level
immutable value contract.

### Structural Sharing Evidence

Implementations expose test-only counters for node allocation, node visits,
and shared child identity. These counters are excluded from production APIs
and allow complexity claims to be tested without relying only on noisy wall
clock timing.

## Protocol Architecture

### Initial Protocols

The collection layer begins with these focused protocols:

- `ICounted`: `count`
- `IEmptyable`: `empty`
- `IConj`: `conj`
- `ILookup`: `get`
- `IAssociative`: `assoc`, `contains?`
- `IIndexed`: `nth`
- `ISeqable`: `seq`
- `IReduce`: `reduce`
- `IEditable`: `transient`
- `ITransientCollection`: `conj!`, `assoc!`, `dissoc!`, `persistent!`
- `IEquiv`: `equal?`
- `IHash`: `hash`

Protocol functions dispatch on the first argument. Persistent types install
direct symbol-keyed method slots for fast monomorphic dispatch. External
extensions live in protocol-owned type tables keyed by constructor or stable
host category. Eliscript never modifies built-in JavaScript prototypes.

The direct slot is checked first, then an external exact-type implementation,
then an explicit default. Missing implementations produce an Eliscript
diagnostic naming the protocol, operation, and observed host type.

### Sequence View

`seq` returns an immutable logical traversal value, not the original
collection and not a mutable iterator cursor. Lists implement the view
directly. Vectors traverse leaf chunks. Maps yield immutable entries. Sets
yield members.

Host arrays and iterables may be adapted, but mutation after adaptation is
documented as host behavior. `from-js` is required when a persistent snapshot
is needed.

### Reduction and Transducers

Collection-native `reduce` is the primary algorithmic primitive. `map`,
`filter`, `remove`, `take`, `drop`, `mapcat`, and value transforms are expressed
as reducing-function transformations where practical.

A transducer is a pure function from one reducing function to another. It does
not know the input source or output destination. `transduce` combines:

```text
source + transformation + reducing function + initial value -> result
```

`into` selects a transient builder for persistent vector, map, or set targets,
then returns one persistent result. A composed map/filter pipeline performs no
intermediate collection allocation.

Parallel fold is not a browser-language primitive. A future worker-pool
adapter may partition foldable values, but deterministic single-runtime reduce
comes first.

## Standard Library Architecture

The standard library is organized around a few data abstractions rather than a
large set of unrelated helpers:

```text
core/value       equality, hashing, comparison, metadata
core/list        persistent list construction and traversal
core/vector      indexed persistent values and stack operations
core/map         associative persistent values
core/set         membership and set algebra
core/seq         immutable traversal adapters
core/reduce      reduce, transduce, into, reduced values
core/text        explicit UTF-16 and code-point-aware text operations
core/numeric     numeric predicates and arithmetic utilities
core/result      explicit success/failure data for library boundaries
core/json        JSON encoding, decoding, and conversion diagnostics
state/atom       explicit changing identity over immutable values
interop/js       native constructors, predicates, and conversion
application/ui   replaceable props, children, and event boundary adapters
platform/worker  capabilities and value-codec helpers
```

The first `core/result` implementation now lands in
[0075-portable-result-values.md](0075-portable-result-values.md). Ok and Err are
ordinary value-semantic persistent Maps, and collection/traversal combinators
remain dependency-prunable portable Eliscript rather than a host class.

The first `core/json` implementation now lands in
[0076-portable-json-values.md](0076-portable-json-values.md). It parses strict
JSON directly into persistent Vector/Map values and deterministically encodes
the exact portable JSON subset. Duplicate keys, unsupported values, cycles,
and resource violations return value-semantic Result errors; native container
conversion remains an explicit `interop/js` operation.

The first `core/numeric` implementation now lands in
[0077-portable-numeric-foundation.md](0077-portable-numeric-foundation.md).
It exposes the actual binary64 Number categories, restricts exact integer
algorithms to the safe interval, distinguishes truncating quotient,
dividend-signed remainder, and divisor-signed modulo, and keeps GCD/LCM
iterative and dependency-prunable.

Public functions target protocols wherever that produces a real abstraction.
Representation-specific functions remain in their owning modules. A function
is not generalized merely to increase API count.

### Algorithm Policy

Core algorithms use the strongest available collection capability:

- indexed vector operations traverse 32-value leaf chunks
- `reduce` dispatches to collection-native traversal rather than calling
  `seq` for every element
- `into`, `group-by`, `frequencies`, map merge, and set construction use
  transient builders for large inputs
- set intersection traverses the smaller input and probes the larger one
- set union starts from the larger input to minimize changed trie paths
- sorted-vector lookup uses binary search when an explicit sorted value is
  provided
- sorting copies values once into a native array, uses a stable host sort with
  an Eliscript comparator, and returns one persistent vector
- hashing caches immutable root hashes and mixes unordered collections without
  depending on iteration order
- composed transducers operate in one reduction and signal early termination
  with an explicit reduced wrapper

Algorithms document both asymptotic complexity and important host costs such
as conversion, allocation, hashing, and comparator calls. Micro-optimization
is accepted only with a portable reference implementation and benchmark
evidence.

## Compiler Support

Persistent collections remain mostly library/runtime implementations, but the
compiler provides four targeted facilities:

1. persistent collection literal IR nodes and constructors
2. efficient integer bit operations required by trie algorithms
3. `loop`/`recur` lowering for allocation-conscious iteration without host
   stack growth
4. safe protocol direct-call hints when the analyzer proves the receiver type

The optimizer may specialize literal construction and protocol calls only when
the result is observably equivalent. It must not silently convert persistent
values to mutable host containers.

The self-hosted compiler should adopt the persistent core selectively after
the runtime is proven. Compiler hot paths may continue to use explicit host
arrays internally where mutation is locally contained and measured faster.
Eliscript improves defaults without forbidding expert host interop.

## JavaScript Interop

The boundary must remain low-friction:

- `js-array` and `js-object` construct native mutable host containers
- `array?` and `object?` distinguish host containers from persistent values
- `to-js` converts persistent values to host values
- `from-js` snapshots supported host values into persistent values
- shallow conversion is the default; deep conversion is explicit
- functions and opaque host objects pass through only in shallow mode
- deep conversion detects cycles and reports the precise value path
- property and method interop never invokes persistent collection lookup by
  accident

UI-library props and children may be converted at application boundaries using
focused adapters so application code can retain persistent values without
passing unexpected wrappers to third-party components. These adapters are
application evidence, not part of persistent-value semantics.

Specification 0073 implements this core boundary for Array, plain object, Map,
and Set. It adds `js-map`, `js-set`, their predicates, `to-js-object`,
cross-realm recognition, sharing preservation, duplicate value-semantics
checks, and bounded structured diagnostics. Final PD-07 acceptance still
requires the maintained package fixture and complete supported host matrix.

## State and Identity

Persistent values model immutable facts. Time-varying identity is represented
explicitly rather than by mutating collections in place.

The 1.0 core requires one simple atomic reference abstraction suitable for the
single-threaded JavaScript event loop:

- `atom` stores one current immutable value
- `deref` reads it
- `reset!` replaces it
- `swap!` computes and installs a new value
- validators reject invalid transitions before installation
- watches observe committed transitions after installation

Atoms are useful for application and REPL state, but ordinary functions should
prefer values. Software transactional memory, agents, and transparent
distributed state are outside the 1.0 scope.

**Status:** Implemented provisionally by
[0072-atomic-state-references.md](0072-atomic-state-references.md). The
Eliscript-authored module provides synchronous `atom`, `deref`, `reset!`, and
`swap!`, pre-commit validators, commit-time watch snapshots, queued nested
notifications, same-Atom transition reentrancy rejection, structured library
errors, and callback-error recovery. Generated state histories and 100,000
sequential swaps agree across seed/self-hosted artifacts and Bun/Node. This is
direct PD-11 implementation evidence; the unified final acceptance manifest
and full supported environment matrix remain open.

## Reinvestment into Emacs

### Goal

Eliscript should become a supported high-performance compute extension for
Emacs Lisp. Emacs packages keep interactive commands, buffers, markers,
overlays, keymaps, and editor mutation in Emacs Lisp while delegating explicit
pure or transactionally applied computations.

```text
Emacs command
  -> snapshot explicit input
  -> encode and batch request
  -> execute persistent Eliscript algorithm in warm JavaScript worker
  -> decode immutable result
  -> validate request generation and buffer version
  -> apply result in Emacs
```

### Public Emacs API

The mature Emacs package provides three levels:

1. **Module API:** compile/load an Eliscript project and invoke an exported
   portable function asynchronously or synchronously with a timeout.
2. **Accelerated operation API:** pair a reference Emacs Lisp implementation
   with an Eliscript implementation, select by workload size, and compare
   results in verification mode.
3. **Service API:** manage long-lived project workers, module generations,
   cancellation, progress, diagnostics, caches, and clean shutdown.

The exact Elisp names are specified when implementation begins. The API must
not require callers to construct raw protocol messages.

### Value Codec

Plain JSON is retained for protocol envelopes. Arguments and results use a
versioned Eliscript value codec inside those envelopes when values exceed JSON
semantics.

The codec represents:

- keywords and symbols without string ambiguity
- persistent lists, vectors, maps, and sets
- explicit `undefined` versus `null`
- safe integers and documented non-finite numbers
- nested source diagnostics

The codec rejects functions, transient values, cycles, editor objects, DOM
objects, and opaque JavaScript instances unless a named capability supplies a
codec. Large sequences support chunked messages so Emacs and the worker do not
need duplicate unbounded buffers.

### Candidate Emacs Workloads

The maintained benchmark and application corpus should include:

- Org or Markdown syntax-tree transformation
- project dependency graph and incremental invalidation analysis
- text indexing, token frequency, and ranked search
- large JSON-like normalization and grouping
- compiler reading, expansion, analysis, or emission
- formatter and source transformation passes

The first production targets are coarse-grained deterministic operations with
high compute-to-transport ratios. Character-at-a-time editor operations remain
in Emacs Lisp.

### Safe Result Application

Each request records the worker generation and, when relevant, source buffer
modification ticks. Emacs applies a result only if:

- the request completed successfully
- the operation was not cancelled or timed out
- the worker generation still matches the loaded module contract
- relevant buffers still match their captured versions
- the result passes the caller's validation step

Stale results are discarded or offered for explicit retry. Worker failure
cannot leave a partially applied editor mutation.

### Performance Routing

Each accelerated operation can declare a measured size threshold. Inputs below
the threshold use the Emacs Lisp implementation; larger inputs use a warm
worker. Callers can force either path for testing.

Thresholds derive from end-to-end measurements and include:

- input snapshot cost
- encoding and decoding
- transport
- module readiness
- JavaScript execution
- result validation and application

Engine-only speedup is diagnostic information, not the product claim.

### Language-to-Host Feedback Loop

The mature relationship is deliberately bidirectional. Emacs Lisp bootstraps
the language and owns editor integration; Eliscript contributes a stronger
functional programming layer; generated JavaScript turns selected algorithms
into portable high-performance services; measured editor integrations then
feed missing primitives and library requirements back into the language.

The feedback loop has five layers:

1. **Semantic layer:** persistent values, deterministic equality and hashing,
   protocols, reducers, transducers, metadata, and explicit state references
   make large transformations easier to reason about than mutation-heavy
   tables and lists.
2. **Algorithm layer:** 32-way tries, collision-safe HAMTs, chunked traversal,
   transients, and collection-aware algorithms provide bounded copying and
   predictable asymptotic costs.
3. **Generated kernel layer:** compiler, indexer, parser, graph, formatter, and
   transformation kernels are authored in Eliscript and compiled to ordinary
   ESM, allowing mature JavaScript engines to optimize hot loops and memory
   access.
4. **Editor bridge layer:** a warm managed worker, versioned value codec,
   cancellation, generations, chunking, and buffer-version guards expose those
   kernels to Emacs Lisp without exposing transport details.
5. **Adoption layer:** real packages declare paired reference and accelerated
   implementations, route by measured crossover size, compare results in
   verification mode, and retain an always-available reference path.

This is not a plan to translate arbitrary Emacs Lisp or replace the editor
runtime. Dynamic editor objects, buffer mutation, advice, hooks, keymaps,
markers, overlays, and interactive control stay in Emacs Lisp. The accelerated
subset is explicit, data-oriented, capability-bounded, and coarse grained.

Each accepted reinvestment must produce six artifacts:

1. one pure or transactionally applied operation contract
2. one reference Emacs Lisp implementation
3. one Eliscript implementation using the persistent/protocol library where
   appropriate
4. one shared correctness corpus plus generated equivalence tests
5. one segmented cold/warm benchmark with a declared crossover threshold
6. one real editor workflow proving cancellation, stale-result rejection, and
   transactional application

The library is therefore judged twice: first as a coherent language design,
then by whether its values and algorithms make actual editor work faster and
safer. Profiled editor workloads may request new primitives, but additions
enter the core only when they generalize beyond one integration and preserve
portable seed/self-hosted semantics.

## Implementation Plan

Implementation began in M8 with the provisional 32-way persistent vector
prototype specified by
[0047-persistent-vector-prototype.md](0047-persistent-vector-prototype.md).
That slice establishes indexed semantics, old-version preservation, structural
sharing counters, root growth/collapse coverage, and one-million-value depth
evidence without changing language literal behavior. Scalar and vector
equality, deterministic hashing, collision discipline, and Bun/Node fixtures
then land in
[0048-value-equality-and-hashing.md](0048-value-equality-and-hashing.md).
HAMT work then begins with the persistent Map prototype in
[0049-persistent-hash-map-prototype.md](0049-persistent-hash-map-prototype.md).
That slice covers bitmap, dense, and full-hash collision nodes through one
million keys. The Map-backed Set follows in
[0050-persistent-hash-set-prototype.md](0050-persistent-hash-set-prototype.md),
reusing those nodes for value-semantic membership, collection algebra, exact
sharing, and million-member bounds. The cross-engine benchmark in
[0051-hamt-layout-benchmark.md](0051-hamt-layout-benchmark.md) then measures the
real lookup/update paths and selects 32/24 sparse/dense thresholds. Portable
32-bit intrinsics and Eliscript-authored population count/rotation algorithms
follow in
[0052-portable-32-bit-operations.md](0052-portable-32-bit-operations.md).
The complete 32-way vector trie then crosses into portable Eliscript in
[0053-eliscript-persistent-vector.md](0053-eliscript-persistent-vector.md).
Its two compiler outputs are byte-identical, both run under Bun and Node, and
generated history plus million-value sharing evidence close P0. The linked
List and complete HAMT Map then move into portable Eliscript in
[0054-eliscript-persistent-list.md](0054-eliscript-persistent-list.md) and
[0055-eliscript-persistent-map.md](0055-eliscript-persistent-map.md), supplying
three independent collection layouts for P1. The Map-backed Set follows in
[0056-eliscript-persistent-set.md](0056-eliscript-persistent-set.md), completing
the four language-authored collection representations without duplicating the
HAMT. The shared portable policy in
[0057-portable-value-semantics.md](0057-portable-value-semantics.md) then adds
recursive equality and hashing for every core collection family, default
Map/Set constructors, nullish preservation, collision discipline, and
cross-family generated evidence. Keyword/Symbol values, metadata, and portable
printer/reader integration now complete the remaining P1 construction steps,
and [0078-persistent-collection-core-exit-audit.md](0078-persistent-collection-core-exit-audit.md)
closes the complete cross-host gate. Default Vector and Map expression syntax
is implemented by 0083 and 0084, and first-class quoted persistent data is
implemented by 0087. The first transport integration slice now lands in 0088:
an opt-in versioned worker codec carries persistent values and metadata through
explicit Emacs records while legacy JSON mode remains unchanged. Streaming,
chunking, and bounded large-value evidence now land through 0089-0090.
Transport-safe protocol definitions land in 0091 as declarative data with
fresh local runtime identities.
The reusable dispatch mechanism now begins in
[0058-open-protocol-dispatch.md](0058-open-protocol-dispatch.md): frozen
protocol objects own direct Symbol slots and private exact-type/category/default
tables, and the JavaScript value runtime migrates `IEquiv` and `IHash` onto
that path. The first collection capability layer follows in
[0059-collection-capability-protocols.md](0059-collection-capability-protocols.md):
`ICounted`, `ILookup`, `IIndexed`, `ISeqable`, and `IReduce` now dispatch over
persistent and selected native collections, with immutable sequence views and
reduced-value early termination. The construction side then continues in
[0060-collection-construction-protocols.md](0060-collection-construction-protocols.md):
`IEmptyable`, `IConj`, and `IAssociative` provide canonical empties,
persistent updates, truthful partial Set membership, and immutable native
copies. Composable reducing transformations follow in
[0061-composable-transducers.md](0061-composable-transducers.md): mapping,
filtering, bounded taking, completion, reduced termination, and
protocol-driven `into` now execute without intermediate collections.
Owner-token runtime builders and transient-backed `into` follow in
[0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md).
Protocol-driven sequence and keyed-data algorithms continue in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
Stack-safe portable iteration is now available through
[0064-stack-safe-loop-recur.md](0064-stack-safe-loop-recur.md), so portable
dispatch and future core algorithms no longer need JavaScript stack recursion
for iterative control.
The public protocol/collection/transducer/transient surface and maintained
sequence/data algorithm bodies now move into Eliscript in
[0066-eliscript-authored-core-protocol-algorithms.md](0066-eliscript-authored-core-protocol-algorithms.md).
Protocol dispatch policy and its generated runtime now live in Eliscript, and
0091 completes the data-only definition transport boundary. Static transient
ownership and escape analysis now land in
[0093-static-transient-ownership-analysis.md](0093-static-transient-ownership-analysis.md).

### P0: Semantics and Prototype

1. Freeze equality and hash rules with cross-runtime fixtures.
2. Add integer bit operations and benchmark JavaScript node layouts.
3. Prototype vector trie and HAMT operations in isolated Eliscript modules.
4. Compare node layouts under Bun, Node.js, and browser engines.
5. Select small-map and dense-node thresholds from measured data.

**Exit:** semantics are specified and prototypes meet structural sharing and
complexity counters before any literal behavior changes.

**Status:** Completed on 2026-08-28 by specifications 0047-0053. The exit
evidence includes cross-runtime equality and hashing, vector and HAMT
prototypes, measured Bun/Node/Chrome node layouts and thresholds, portable
32-bit operations, and one complete trie implementation authored in `.eli`.

### P1: Persistent Collection Core

1. Implement list, vector, map, and set modules.
2. Implement deterministic hashing and value equality.
3. Add metadata without changing equality.
4. Add printer and reader round trips.
5. Add property tests against simple immutable reference models.

**Exit:** persistent collections pass correctness, collision, sharing, and
complexity suites on all supported JavaScript hosts.

**Status:** Completed on 2026-08-31 by specifications 0054-0057, 0068,
0070-0071, 0074, and 0078. The portable linked List in
[0054-eliscript-persistent-list.md](0054-eliscript-persistent-list.md), which
adds exact suffix sharing and stack-safe million-node traversal beside the
indexed Vector trie. The portable HAMT Map in
[0055-eliscript-persistent-map.md](0055-eliscript-persistent-map.md) now adds
collision-safe associative updates, sparse/dense transitions, explicit
hash/equality policy, and million-key path sharing. The Map-backed Set in
[0056-eliscript-persistent-set.md](0056-eliscript-persistent-set.md) completes
construction step 1 with algebra, collisions, and million-member sharing.
The shared value core in
[0057-portable-value-semantics.md](0057-portable-value-semantics.md) completes
construction step 2 with one recursively composed scalar/List/Vector/Map/Set
policy, default Map/Set constructors, cross-family properties, and explicit
host-identity limits. Immutable root metadata in
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md)
completes construction step 3 across optimized Symbols/collections and all
four portable collection families, including structural sharing, propagation,
transient round trips, and equality/hash exclusion. Canonical text for the
optimized runtime family now begins step 4 in
[0069-canonical-runtime-data-text.md](0069-canonical-runtime-data-text.md),
including deterministic Map/Set order, metadata, located malformed-input
errors, resource limits, generated round trips, and Bun/Node evidence.
Portable identifiers and the matching List/Vector/Map/Set implementation in
[0070-portable-identifier-values.md](0070-portable-identifier-values.md) and
[0071-canonical-portable-data-text.md](0071-canonical-portable-data-text.md)
complete construction step 4 with common-subset byte parity. Existing
reference-model and million-scale suites cover construction step 5.
Process-local opaque host identity hashing in
[0074-process-local-host-identity-hashing.md](0074-process-local-host-identity-hashing.md)
removes the portable core's type-wide Map/Set collision fallback. The final
audit in
[0078-persistent-collection-core-exit-audit.md](0078-persistent-collection-core-exit-audit.md)
adds symmetric million-value Bun/Node structural reports for Vector, Map, and
Set beside the existing List report, closing correctness, collision, sharing,
and bounded-path complexity requirements without timing thresholds.

### P2: Protocols and Algorithms

1. Implement the initial protocol dispatch path.
2. Extend core persistent values and selected native host values.
3. Rebuild sequence, text, object, and data operations over protocols.
4. Add transducers, `transduce`, and transient-backed `into`.
5. Verify zero intermediate collection allocation in instrumented pipelines.

**Exit:** generic algorithms operate on all core collections and native
adapters without concrete representation checks in user-facing functions.

**Status:** Completed on 2026-09-01. The dispatch-mechanism step is
implemented in
[0058-open-protocol-dispatch.md](0058-open-protocol-dispatch.md), including
direct, exact-type, host-category, default, and missing paths; atomic external
registration; cross-realm adaptation; and `IEquiv`/`IHash` production use.
The consumption capabilities `ICounted`, `ILookup`, `IIndexed`, `ISeqable`,
and `IReduce` now continue in
[0059-collection-capability-protocols.md](0059-collection-capability-protocols.md),
including direct persistent implementations, native Array/Map/Set adapters,
replayable sequence views, Map-entry reduction, and explicit early
termination. The three construction protocols continue in
[0060-collection-construction-protocols.md](0060-collection-construction-protocols.md),
including direct persistent updates, native immutable-copy adapters, bounded
Map entry validation, and million-value generic construction. Reusable
transducers and the persistent reference path for `into` continue in
[0061-composable-transducers.md](0061-composable-transducers.md), including
completion, custom composition, exact early termination, protocol-only
external types, and one-million-input allocation evidence. Owner-token
transient protocols and transient-backed target construction now continue in
[0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md),
including retained generations, deterministic invalidation, HAMT transitions,
allocation gates, and Bun/Node equivalence. The maintained
sequence and keyed-data subset now continues in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md),
including external `IReduce` sources, persistent Vector/Map results, exact
search termination and transient-backed indexing. The next source-level slice
in [0066-eliscript-authored-core-protocol-algorithms.md](0066-eliscript-authored-core-protocol-algorithms.md)
adds Lisp-named protocol, collection, transducer, and transient modules and
moves the maintained sequence/data algorithm bodies into `.eli`.
Protocol definition, extension, and dispatch policy now continue in
[0079-eliscript-protocol-dispatch-policy.md](0079-eliscript-protocol-dispatch-policy.md),
with private host-reflection capabilities and byte-identical seed/self-hosted
output. Its generated artifact becomes the canonical production runtime in
[0080-canonical-generated-protocol-runtime.md](0080-canonical-generated-protocol-runtime.md),
while the JavaScript facade retains only compatibility names and the host
error type. Protocol-driven String/Object adapters and generated text/keyed
algorithms now land in
[0081-protocol-driven-text-object.md](0081-protocol-driven-text-object.md),
closing the remaining P2 algorithm migration with external-capability and
transient-construction evidence. Specification
[0091-transport-safe-protocol-definitions.md](0091-transport-safe-protocol-definitions.md)
closes the final definition-transport item: versioned plain data crosses JSON
and worker codecs, while every import creates new local methods, Symbol slots,
and empty extension tables. The P2 exit is therefore satisfied without making
runtime implementations serializable.

### P3: Language Integration and Migration

1. Add persistent literal IR and emission.
2. Add explicit native container constructors and predicates.
3. Add shallow/deep conversion with cycle diagnostics.
4. Migrate compiler, standard library, examples, application adapters, and
   tests.
5. Freeze the new literal behavior in the compatibility corpus.

**Exit:** no maintained project depends accidentally on mutable vector or map
literals, and JavaScript interop remains explicit and ergonomic.

**P3 status:** Specification
[0082-persistent-literal-runtime-abi.md](0082-persistent-literal-runtime-abi.md)
implements dedicated persistent Vector/Map IR, the standard ESM constructor
ABI, and explicit `js-array`/`js-object` forms. Specification
[0083-default-persistent-vector-literals.md](0083-default-persistent-vector-literals.md)
makes square-bracket values persistent Vectors, adds explicit `js-nth` and
`js-length`, dispatches language collection access through protocols, and
converts maintained compiler and standard-library host buffers. Native
conversion was already implemented by 0073. Specification
[0084-persistent-map-source-syntax.md](0084-persistent-map-source-syntax.md)
adds canonical brace Map expressions and seed/self-hosted reader, macro, IR,
diagnostic, and cross-host evidence. Specification
[0085-first-class-source-keywords.md](0085-first-class-source-keywords.md)
adds canonical source Keyword values while preserving static host-property
keys. Specification
[0086-optimized-runtime-persistent-list.md](0086-optimized-runtime-persistent-list.md)
adds the canonical optimized List representation and parenthesized data text
needed before quote can stop emitting mutable Arrays. Specification
[0087-first-class-quoted-persistent-data.md](0087-first-class-quoted-persistent-data.md)
then migrates quote to persistent List/Vector and first-class identifier
values, with scalar and portable boundaries. Specification
[0088-emacs-worker-value-codec.md](0088-emacs-worker-value-codec.md) then
enables persistent values in portable closures, adds explicit Emacs records,
and resolves package-owned runtime imports for temporary worker modules. The
canonical persistent Set source layer now lands in
[0092-persistent-set-source-syntax.md](0092-persistent-set-source-syntax.md),
with `#{...}`, `(hash-set ...)`, dedicated IR, literal ABI, quote, portable,
and worker-codec evidence. Specification
[0094-persistent-list-language-semantics.md](0094-persistent-list-language-semantics.md)
then closes accidental native-Array behavior in `list`, `car`, `cdr`, and
`cons`, introduces dedicated persistent List IR, and gives host prepend the
explicit `js-cons` spelling. Specification
[0095-stable-persistent-host-container-boundary.md](0095-stable-persistent-host-container-boundary.md)
removes the provisional `array`/`object` aliases, verifies every maintained
source uses explicit host constructors, and promotes the consolidated
boundary to stable. The P3 exit is satisfied.

### P4: Transients and Hot-Path Optimization

1. Implement owner-token transient vector, map, and set nodes.
2. Enforce invalidation after `persistent!` and async/message escape rejection.
3. Use transients in `into`, grouping, indexing, and compiler hot paths where
   profiles justify them.
4. Add direct protocol dispatch and literal construction specializations.
5. Retain portable readable implementations as correctness references.

**Exit:** bulk builders improve measured runtime without changing persistent
semantics or observable application output.

**Status:** Underway since 2026-08-29. Specification
[0062-owner-token-transient-collections.md](0062-owner-token-transient-collections.md)
implements owner-token Vector, Map, and Set runtime nodes, completion
invalidation, message/serialization rejection, transient-backed `into`,
retained-generation tests, and structural allocation gates. Specification
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md)
now applies transients to indexing and final grouped/count Map construction.
Specification
[0093-static-transient-ownership-analysis.md](0093-static-transient-ownership-analysis.md)
now rejects async, module, closure, call, container, assignment, and repeated
loop escape with seed/self-hosted agreement. Specification
[0096-profile-guided-compiler-runtime-scan.md](0096-profile-guided-compiler-runtime-scan.md)
adds the first source-bound compiler profile, replaces five recursive emitter
runtime-link scans with one production traversal, retains the five predicates
as an executable reference, and records a reviewed 1.683525x local median
speedup.
Specification
[0097-profile-guided-ir-node-kind-decisions.md](0097-profile-guided-ir-node-kind-decisions.md)
adds a frozen node-kind registry and module-private native membership index for
production IR validation, retains the linear scan as an executable reference,
and records exact agreement plus a reviewed 10.963980x local median speedup over
the maintained compiler corpus. The native index is compiler-internal host
symbiosis, not a language collection or standard-library dependency. Broader
compiler hot-path review remains required before P4 exits.
Specification
[0098-profile-guided-emitter-indentation.md](0098-profile-guided-emitter-indentation.md)
replaces repeated character string growth with LF-delimited source slices,
translates Source Map marks through one monotonic cursor, retains the original
character loop as an executable reference, and records a reviewed 14.848510x
local median speedup. Follow-up whole-compiler sampling moves indentation out
of the dominant paths. Broader compiler and standard-library hot-path review
remains required before P4 exits.
Specification
[0099-profile-guided-source-mark-location.md](0099-profile-guided-source-mark-location.md)
uses the emitter's ordered-mark invariant for constant-time start checks and
one-step immutable prepend. Normal emission calls a module-private host
specialization directly, while the previous complete scan and iterative copy
remain an executable Eliscript reference. The reviewed real-artifact corpus
records exact agreement plus a current 2.337552x local median speedup after the
general comparison-emission optimization, and follow-up
whole-compiler sampling moves location out of the dominant entries. This is a
compiler-internal host optimization, not a general collection primitive or an
application-tool dependency. Broader compiler and standard-library hot-path
review remains required before P4 exits.
Specification
[0100-profile-guided-binary-comparison-emission.md](0100-profile-guided-binary-comparison-emission.md)
specializes exactly binary numeric comparisons as direct ECMAScript infix
expressions while retaining eager capture for n-ary comparison arguments. The
exact pre-specialization baseline and current compiler alternately compile all
eleven maintained modules; the reviewed report records a 1.501172x
complete-compiler median speedup and a 24.6% generated-JavaScript byte
reduction. A broader constant-dispatch experiment was rejected after its
complete-compiler result regressed. This is compiler code generation, not an
application framework or site-tool dependency. Broader compiler and
standard-library hot-path review remains required before P4 exits.
Specification
[0101-profile-guided-reader-character-classification.md](0101-profile-guided-reader-character-classification.md)
uses two bounded module-private predicates for reader whitespace and delimiter
decisions while retaining the generated Eliscript `or` chains as independent
references. Exhaustive Unicode evidence and the real compiler source trace
agree exactly; the reviewed report records a 5.377091x predicate median
speedup and a 1.131204x complete-compiler median speedup against the exact
pre-specialization revision. The complete compiler outputs remain byte
identical. No application framework or build tool participates in this P4
evidence, and broader hot-path review remains required before P4 exits.

### P5: Emacs Value Bridge

1. Version the Eliscript value codec.
2. Implement streaming Emacs and JavaScript encoders/decoders.
3. Add round-trip, malformed-input, size-limit, and cancellation tests.
4. Extend worker capability negotiation for codec and chunking support.
5. Preserve source-level diagnostics across codec failures.

**Exit:** all persistent values cross the worker boundary predictably, and
large inputs remain bounded in memory.

**Status:** Complete on 2026-09-01. Specification 0088 implements the
versioned non-streaming codec, deterministic validation, Emacs records, exact
scalar categories, and temporary-module runtime resolution. Specification
[0089-chunked-emacs-worker-values.md](0089-chunked-emacs-worker-values.md)
implements incremental Emacs and JavaScript codecs, bounded chunks, explicit
input and output backpressure, progress and result streams, and cancellation
during upload and traversal. Specification
[0090-large-worker-value-memory-probe.md](0090-large-worker-value-memory-probe.md)
adds the source-bound 256 MiB round-trip report: 1,058 chunks in each
direction, 1,215.078125 MiB Emacs peak RSS, 680.046875 MiB Bun peak RSS, and
1,895.125 MiB simultaneous combined peak. All remain within the documented
2,048/1,024/2,560 MiB budgets, completing PD-08 and the P5 exit.

### P6: Accelerated Emacs API

1. Implement module, operation, and service API layers.
2. Add dual-path reference/accelerated operation declarations.
3. Add verification mode and workload threshold routing.
4. Add buffer-version guards and transactional result application.
5. Integrate progress, cancellation, timeout, restart, and project lifecycle.

**Exit:** Emacs packages invoke accelerated functions without protocol-level
code and can always exercise the reference path for correctness.

### P7: Performance Reinvestment Proof

1. Maintain equivalent Emacs Lisp and Eliscript implementations for at least
   three candidate workloads.
2. Select two whose end-to-end warm speedup is consistently worthwhile.
3. Use them in an actual Emacs package workflow, not only a benchmark script.
4. Publish segmented cold/warm reports and crossover thresholds.
5. Run an extended worker soak while repeatedly updating real buffers and
   discarding intentionally stale results.

**Exit:** the Emacs acceleration acceptance criteria in 0040 pass and the
faster path produces byte- or value-equivalent results.

## Acceptance Criteria

These criteria supplement the final 1.0 contract in 0040.

### PD-01: Persistent Semantics

All list, vector, map, and set operations match simple reference models across
at least 100,000 generated operation sequences. Previous versions remain
unchanged after every update.

### PD-02: Vector Structural Bounds

For vectors through at least one million elements, `nth`, `assoc`, `conj`, and
`pop` visit or allocate no more than the documented trie-depth bound plus two
implementation nodes. A one-element update shares every untouched branch.

### PD-03: HAMT Structural Bounds

For maps through at least one million generated keys, successful and missing
lookups, insertion, and deletion obey the documented 5-bit trie traversal
bound. Dedicated fixtures cover full-hash collisions and sparse/dense node
transitions.

### PD-04: Hash and Equality

Equal persistent values always produce equal hashes across Bun and Node.js.
Map and set hash/equality ignore insertion order. Collision fixtures never
produce false equality.

### PD-05: Transient Safety

Persistent-to-transient and transient-to-persistent conversion preserve value
semantics. Use after `persistent!`, message transfer, module export, and async
suspension is rejected. Source persistent values never change.

### PD-06: Transformation Efficiency

An instrumented composed map/filter/take transducer over one million values
allocates no intermediate persistent collection. Transient-backed bulk vector
and map construction is at least 1.5x faster than repeated persistent updates
on the declared reference machine across 30 warm runs.

### PD-07: Host Interop

Shallow and deep conversions preserve all supported values, reject cycles with
an exact path, and never mutate their source. Replaceable UI-library and
JavaScript package fixtures consume converted native values without persistent
implementation details leaking across the boundary.

Specification 0073 supplies the core conversion semantics and one React-based
application fixture. That fixture is non-normative and replaceable. This gate
remains open until the maintained JavaScript package fixture and full supported
compatibility matrix also pass.

### PD-08: Emacs Codec

Every supported persistent and nullish value round-trips between Emacs and the
worker. A 256 MiB logical dataset is processed through bounded chunks while
neither side exceeds the documented memory budget.

**Status:** Complete on 2026-09-01 through specifications 0088-0090. The
source-bound reference report records exact SHA-256 equality, 1,058 chunks in
each direction, per-process peaks, and the simultaneous combined peak below
all three budgets.

### PD-09: Accelerated Operation Correctness

For every maintained accelerated operation, reference Emacs Lisp and Eliscript
results agree over the fixed corpus and generated cases. Cancellation, stale
buffer versions, and worker replacement apply no result.

### PD-10: Emacs Performance Reinvestment

At least two real Emacs workflows satisfy AC-19 from 0040. One must use the
persistent collection/transducer layer, proving that the language's richer
data model contributes directly to useful editor performance.

### PD-11: State Discipline

Atoms preserve atomic single-transition semantics under nested callbacks,
validators reject before installation, and watches observe only committed old
and new immutable values. Generated operation sequences agree with a simple
reference state model, and failed validators leave state unchanged.

## References

The design direction is informed by these public primary references:

- [Clojure rationale](https://clojure.org/about/rationale)
- [Clojure data structures](https://clojure.org/reference/data_structures)
- [Clojure protocols](https://clojure.org/reference/protocols)
- [Clojure sequences](https://clojure.org/reference/sequences)
- [Clojure transient data structures](https://clojure.org/reference/transients)
- [Clojure transducers](https://clojure.org/reference/transducers)
- [Clojure reducers](https://clojure.org/reference/reducers)
- [ClojureScript rationale](https://clojurescript.org/about/rationale)
- [ClojureScript differences from Clojure](https://clojurescript.org/about/differences)
- [ClojureScript self-hosting guide](https://clojurescript.org/guides/self-hosting)
- [Ideal Hash Trees](https://lampwww.epfl.ch/papers/idealhashtrees.pdf)

These are design inputs, not compatibility requirements. Eliscript owns its
semantics, implementation tradeoffs, and acceptance evidence.
