# 0060: Collection Construction Protocols

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation

## Summary

This specification completes the non-transient collection protocol foundation
with `IEmptyable`, `IConj`, and `IAssociative`. Generic `empty`, `conj`,
`assoc`, and `contains` operations now construct and update persistent Vector,
Map, and Set values through direct Symbol methods. Exact-type native Array,
Map, Set, and ordinary Object adapters provide immutable-copy behavior without
prototype modification; primitive String supplies only its meaningful empty
construction.

Together with 0059, the runtime can now consume and construct collections
without representation checks in user-facing functions. This is the target
collection boundary required by future `into` and transducers. It does not yet
claim transient mutation, zero-intermediate transducer pipelines, portable
Eliscript protocol declarations, or persistent literal migration.

## Public Runtime Surface

`runtime/core/collection.mjs` additionally exports:

- protocols: `IEmptyable`, `IConj`, `IAssociative`
- generic operations: `empty`, `conj`, `assoc`, `contains`

The protocol objects use the dispatch and extension contract from 0058. Their
operation slots and dispatch functions remain internal to
`runtime/core/collection-internals.mjs`.

## IEmptyable

`empty(collection)` returns an empty value in the same logical collection
category:

- persistent Vector returns the canonical `EMPTY_VECTOR`
- persistent Map returns the canonical `EMPTY_MAP`
- persistent Set returns the canonical `EMPTY_SET`
- native Array, Map, Set, and ordinary Object return fresh empty native
  containers
- native String returns `""`
- `null` returns `null`

Canonical persistent empties maximize sharing and preserve value category.
Native empties are fresh because the adapter contract never mutates or aliases
the input container. Metadata preservation remains deferred until metadata has
its own value contract.

## IConj

The protocol operation `conj(collection, value)` adds one logical collection
element. The public `conj(collection, ...values)` applies that operation from
left to right. With no values it returns the original collection without
dispatch.

Element semantics are representation-specific but explicit:

- Vector appends a value
- Set adds a member
- Map accepts one iterable key/value entry containing exactly two values
- native Array appends into a fresh Array
- native Set adds into a fresh Set
- native Map copies the Map and associates the entry
- ordinary Object accepts a string-keyed entry and returns a fresh Object

Persistent Map and Set no-op updates retain object identity when their existing
value or member already satisfies the update. Native adapters always return a
copy because mutable host identity cannot safely stand for a persistent value.

### Bounded Map Entry Validation

Map entry parsing reads at most three iterator results. Fewer than two or more
than two values fail deterministically. An iterator with `return` is closed on
failure.

This bounded parser replaces whole-iterable expansion in persistent Map
construction. Consequently, malformed infinite iterables cannot cause an
unbounded allocation before the arity error is discovered.

## IAssociative

`IAssociative` declares two independently extensible operations:

- `assoc(collection, key, value)`
- `contains(collection, key)`

The public `assoc(collection, key, value, ...keyValues)` accepts one or more
key/value pairs. It validates complete pair arity before dispatching the first
update and then applies updates from left to right.

`contains` must return an exact JavaScript boolean. A non-boolean protocol
result is an invalid implementation and fails at the generic boundary.

### Associative Categories

- Vector and Array keys are non-negative integer indexes. Existing indexes are
  replaced; `index == count` appends; larger or invalid indexes fail.
- Map keys use the owning Map's key semantics. Stored `undefined` remains
  distinguishable from absence.
- Set implements `contains` membership but deliberately has no `assoc`
  operation.
- ordinary Object associates only own string keys, distinguishes stored
  `undefined`, rejects Symbol association, and treats inherited keys as absent.

Protocols permit operation-level partial extension, so Set can truthfully
implement `IAssociative/contains` without pretending that keyed association is
meaningful. `implementsProtocol(IAssociative, set)` is false while
`implementsProtocolOperation(IAssociative, "contains", set)` is true.

`contains(vector, key)` and `contains(array, key)` test index presence, not
whether an equal value occurs in the collection.

## Persistence and Failure Atomicity

Every core operation leaves the input value unchanged:

- persistent collections reuse unchanged structure and copy only update paths
- native adapters copy before mutation
- malformed public `assoc` pair arity fails before any protocol call
- a later failing variadic update may discard an intermediate result but never
  changes the original collection
- malformed Map entries do not change the source Map

These are value-level atomicity guarantees. They do not make arbitrary user
protocol implementations transactional; an external implementation remains
responsible for its own side effects and immutability.

## External Types

External types may implement any protocol or individual operation through
`extendProtocolType`, `extendProtocolCategory`, or direct slots. Construction
and consumption capabilities remain orthogonal. A type can be counted and
reduced without being constructible, or implement `contains` without `assoc`.

An immutable external type is expected to return a new value or a proven
no-op identity from `conj` and `assoc`. Returning a mutable input after changing
it violates this contract even though the runtime cannot prove that violation
dynamically.

## Native Host Adapters

Importing `runtime/core/collection.mjs` registers the current realm's Array,
Map, Set, and Object constructors plus the primitive String category.
Registration changes only private protocol tables.
Import-time tests compare every built-in prototype key before and after module
loading and verify that none of the protocol Symbols became own properties.

Adapters are exact-type and realm-specific. Foreign-realm containers require
explicit registration for each desired capability. Subclasses do not inherit
semantic behavior accidentally.

Native immutable-copy operations are O(n) in container size and allocate one
new container. Persistent Vector append is amortized O(1), indexed update is
O(log32 n), and persistent Map/Set updates have expected O(log32 n) trie-path
cost. Transient-backed bulk construction remains the optimization path for
large pipelines.

## Relationship to Into and Transducers

0059 supplies source traversal and early termination. This specification
supplies empty targets and one-element construction. A reference `into` can
therefore be expressed as reduction plus `conj`, but the public operation is
deferred until its transducer arities and transient selection are implemented
together.

This avoids freezing an inefficient or incompatible intermediate `into` API.
The next slice must preserve these protocol semantics while adding composed
reducing transformations and optimized target builders.

## Compatibility and Limits

The construction protocols are provisional during M8. Existing concrete
methods and JavaScript-style native APIs remain available. Eliscript literals
and `stdlib/sequence.eli` still use their current representations until the
portable compiler and standard library can invoke protocols with seed and
self-hosted parity.

Subsequent P2 slices now provide generic algorithms, transducers,
transient-backed `into`, owner-token invalidation, Eliscript-authored protocol
surfaces, portable dispatch policy, explicit native conversion, and named
String/Object host adapters through specifications
[0062](0062-owner-token-transient-collections.md),
[0063](0063-protocol-driven-core-algorithms.md),
[0066](0066-eliscript-authored-core-protocol-algorithms.md),
[0073](0073-native-javascript-container-interop.md),
[0079](0079-eliscript-protocol-dispatch-policy.md),
[0080](0080-canonical-generated-protocol-runtime.md), and
[0081](0081-protocol-driven-text-object.md). Persistent collection literal
migration, compiler specialization, and static transient escape analysis
remain later work.

## Acceptance Criteria

- **CCN-01:** `IEmptyable`, `IConj`, and `IAssociative` are frozen protocol
  identities using the 0058 dispatch contract.
- **CCN-02:** Persistent Vector and Map implement every applicable operation
  directly; Set directly implements empty, conj, and contains without a false
  assoc claim.
- **CCN-03:** Empty persistent values are canonical, native empties are fresh,
  and no operation mutates its input.
- **CCN-04:** Variadic conj preserves order and Map entry semantics; persistent
  Map/Set no-op updates preserve identity.
- **CCN-05:** Malformed or infinite Map entries read at most three values,
  close the iterator, fail deterministically, and leave the Map unchanged.
- **CCN-06:** Assoc supports replacement, Vector/Array end append, complete
  variadic pairs, stored undefined, and deterministic index/arity failures.
- **CCN-07:** Contains distinguishes keys/indexes from values, returns exact
  booleans, and supports Set through an operation-level partial protocol.
- **CCN-08:** An external immutable type implements construction operations
  without prototype changes, and foreign-realm adaptation remains explicit.
- **CCN-09:** Bun and Node.js produce identical construction reports and native
  adapter isolation reports.
- **CCN-10:** One million generic persistent Vector conj operations complete
  without stack growth; a subsequent assoc preserves the old million-value
  version.
- **CCN-11:** Existing collection correctness, structural sharing, protocol,
  conformance, public-surface, and complete repository suites remain green.

## Next Slice

Implement reducing-function transformations, composition, `transduce`, and a
protocol-driven `into`. Begin with a persistent reference path and explicit
allocation counters; then add owner-token transient builders without changing
the observable protocol results.
