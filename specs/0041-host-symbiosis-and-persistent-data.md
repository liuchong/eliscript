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
- Browser, React, Node.js, and Bun APIs are consumed rather than reimplemented.
- Emacs remains the editor and interactive host; compiled JavaScript is an
  optional compute engine.

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

Before the stable 1.0 language contract is frozen:

- list data remains persistent list data
- vector literals become persistent vectors
- map literals become persistent maps
- set literals become persistent sets
- explicit constructors create native JavaScript arrays and objects for
  interop

This changes the current provisional vector-as-array behavior and therefore
must be completed before the compatibility corpus is frozen. During migration,
the compiler and examples use explicit host constructors wherever native array
identity or mutation is required.

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
platform/react   props, children, and event boundary adapters
platform/worker  capabilities and value-codec helpers
```

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

React props and children are converted at the element boundary using focused
adapters so application code can retain persistent values without passing
unexpected wrappers to third-party components.

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
million keys. Set, transients, keyword/symbol values, engine layout
measurements, and literal migration remain open P0/P1 work.

### P0: Semantics and Prototype

1. Freeze equality and hash rules with cross-runtime fixtures.
2. Add integer bit operations and benchmark JavaScript node layouts.
3. Prototype vector trie and HAMT operations in isolated Eliscript modules.
4. Compare node layouts under Bun, Node.js, and browser engines.
5. Select small-map and dense-node thresholds from measured data.

**Exit:** semantics are specified and prototypes meet structural sharing and
complexity counters before any literal behavior changes.

### P1: Persistent Collection Core

1. Implement list, vector, map, and set modules.
2. Implement deterministic hashing and value equality.
3. Add metadata without changing equality.
4. Add printer and reader round trips.
5. Add property tests against simple immutable reference models.

**Exit:** persistent collections pass correctness, collision, sharing, and
complexity suites on all supported JavaScript hosts.

### P2: Protocols and Algorithms

1. Implement the initial protocol dispatch path.
2. Extend core persistent values and selected native host values.
3. Rebuild sequence, text, object, and data operations over protocols.
4. Add transducers, `transduce`, and transient-backed `into`.
5. Verify zero intermediate collection allocation in instrumented pipelines.

**Exit:** generic algorithms operate on all core collections and native
adapters without concrete representation checks in user-facing functions.

### P3: Language Integration and Migration

1. Add persistent literal IR and emission.
2. Add explicit native container constructors and predicates.
3. Add shallow/deep conversion with cycle diagnostics.
4. Migrate compiler, standard library, examples, React adapters, and tests.
5. Freeze the new literal behavior in the compatibility corpus.

**Exit:** no maintained project depends accidentally on mutable vector or map
literals, and JavaScript interop remains explicit and ergonomic.

### P4: Transients and Hot-Path Optimization

1. Implement owner-token transient vector, map, and set nodes.
2. Enforce invalidation after `persistent!` and async/message escape rejection.
3. Use transients in `into`, grouping, indexing, and compiler hot paths where
   profiles justify them.
4. Add direct protocol dispatch and literal construction specializations.
5. Retain portable readable implementations as correctness references.

**Exit:** bulk builders improve measured runtime without changing persistent
semantics or observable application output.

### P5: Emacs Value Bridge

1. Version the Eliscript value codec.
2. Implement streaming Emacs and JavaScript encoders/decoders.
3. Add round-trip, malformed-input, size-limit, and cancellation tests.
4. Extend worker capability negotiation for codec and chunking support.
5. Preserve source-level diagnostics across codec failures.

**Exit:** all persistent values cross the worker boundary predictably, and
large inputs remain bounded in memory.

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
an exact path, and never mutate their source. React and JavaScript package
fixtures consume converted native values without persistent implementation
details leaking across the boundary.

### PD-08: Emacs Codec

Every supported persistent and nullish value round-trips between Emacs and the
worker. A 256 MiB logical dataset is processed through bounded chunks while
neither side exceeds the documented memory budget.

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
