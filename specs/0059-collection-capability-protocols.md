# 0059: Collection Capability Protocols and Reduction Foundation

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0047 Persistent Vector Trie Prototype,
  0049 Persistent Hash Map Trie Prototype,
  0050 Persistent Hash Set Prototype,
  0058 Open Protocol Dispatch Core

## Summary

This specification turns the generic protocol mechanism into the first shared
collection capability layer. It defines `ICounted`, `ILookup`, `IIndexed`,
`ISeqable`, `IReduce`, and `IKVReduce`; installs direct Symbol methods on
persistent Vector, Map, and Set values; and supplies external adapters for native JavaScript
Array, Map, Set, String, and exact ordinary Object values without modifying
their prototypes.

`seq` introduces an immutable, replayable logical traversal view. Generic
`reduce` dispatches to collection-native traversal, treats Map entries as
logical elements, and recognizes an explicit reduced wrapper for early
termination. These contracts are the substrate for later generic algorithms
and transducers. This slice does not yet implement transducers, transient
builders, persistent collection literals, or the remaining mutation-shaped
collection capabilities.

## Public Runtime Surface

`runtime/core/collection.mjs` exports:

- protocols: `ICounted`, `ILookup`, `IIndexed`, `ISeqable`, `IReduce`,
  `IKVReduce`, `IMap`, `ISet`, `IStack`
- generic operations: `count`, `get`, `nth`, `seq`, `reduce`, `reduceKV`,
  `dissoc`, `disj`, `peek`, `pop`
- sequence values: `SequenceView`, `sequenceView`, `unboundedSequenceView`,
  `isSequenceView`
- reduction values: `ReductionView`, `reductionView`, `isReductionView`
- early termination: `reduced`, `isReduced`, `unreduced`

The implementation identities and direct slots remain internal to
`runtime/core/collection-internals.mjs`. Applications extend a capability by
passing the public protocol object to the extension functions from
`runtime/core/protocol.mjs`.

## Capability Contracts

### ICounted

`count(collection)` returns a non-negative safe integer. A protocol
implementation returning a negative, fractional, infinite, or unsafe value is
invalid and fails at the generic boundary.

Persistent Vector, Map, and Set values answer in O(1). Native Array, String,
Map, and Set values read their current `length` or `size`; ordinary Object
counts own enumerable string keys. `null` has count zero; `undefined` remains
distinct and has no implicit collection behavior.

### ILookup

`get(collection, key, notFound = null)` never uses the result value itself to
decide whether a key is present. Stored `undefined` is therefore distinct from
absence.

- Vector, Array, and String accept in-range non-negative integer indexes.
- Map returns the value associated with an equal key under that Map's own key
  semantics.
- Set returns the queried member when present.
- ordinary Object resolves only own enumerable string keys.
- an absent or unsupported key returns `notFound`.

### IIndexed

`nth(collection, index)` provides indexed access and throws `RangeError` for a
missing or invalid index. `nth(collection, index, notFound)` returns the
provided fallback instead. Vector, native Array, and String implement this
capability; Map, Set, and Object deliberately do not.

### ISeqable

`seq(collection)` returns `null` for an empty logical collection. Otherwise it
returns an iterable logical traversal value. A persistent collection never
returns itself merely because it is iterable.

`SequenceView` is frozen and replayable: requesting an iterator twice starts
two independent traversals. It is not a mutable iterator cursor. Persistent
views close over immutable roots. Native container views deliberately observe
later host mutation; callers use a persistent conversion when they require a
snapshot.

An explicitly unbounded `SequenceView` has no finite cardinality. `seq`
returns that view without invoking its iterator factory, while `count` rejects
the operation immediately rather than attempting traversal. This marker is
part of protocol behavior but remains private representation state.

Vector yields values in index order. String yields UTF-16 code units. Map and
ordinary Object yield frozen two-element `[key, value]` entries. Set yields
members. `null` yields no sequence.

### IReduce

`reduce(collection, reducer)` uses the first logical element as the initial
accumulator and fails on an empty collection. The three-argument form
`reduce(collection, reducer, initial)` returns `initial` unchanged for an
empty collection.

The reducer receives exactly the accumulator and one logical sequence element.
Vector and Set elements are values; Map elements are the same frozen entries
produced by `seq`. Representation-specific JavaScript-style `.reduce` methods
remain compatible but do not define protocol semantics.

Every core implementation traverses its native iterator or leaf path directly;
generic reduction does not repeatedly call `seq`, `count`, or `nth`.

`ReductionView` is a frozen, replayable, reduction-only value. Its factory
callback is invoked anew for every `reduce` call and receives the reducer plus
zero or one explicit initial value. It implements `IReduce` directly but does
not advertise `ICounted` or `ISeqable`, so generic `count` and `seq` reject it
without starting traversal. This supports reusable transformed pipelines whose
  source may be unbounded without implying broad lazy-sequence behavior.

### IKVReduce

`reduceKV(collection, reducer, initial)` passes accumulator, key, and value
without constructing public entry pairs. Vector and Array keys are indexes;
Map and Object keys are their logical keys. The operation always requires an
explicit initial value and shares `reduced` early termination with `reduce`.

### Removal and Stack Capabilities

Specification [0154](0154-map-set-stack-capability-protocols.md) adds `IMap`,
`ISet`, and `IStack`. Persistent and native maps/sets gain immutable removal;
List, Vector, and Array gain representation-appropriate stack access. These
capabilities remain independent from traversal and construction protocols.

## Reduced Values

`reduced(value)` wraps a completed accumulator. Returning that wrapper from a
reducer stops traversal immediately, closes a closable iterator through normal
ECMAScript iteration semantics, and makes generic `reduce` return the unwrapped
value. Wrapping an already reduced value is idempotent.

`isReduced(value)` recognizes the wrapper and `unreduced(value)` removes one
wrapper if present. The wrapper is frozen and its private marker is not part of
the public value representation.

This early-termination contract is intentionally established before
transducers. A later transducer implementation must compose with it rather than
inventing a second termination channel.

## Direct Persistent Implementations

Persistent types install direct Symbol-keyed protocol methods:

- Vector: all sequence capabilities plus `IKVReduce` and `IStack`
- List: `ICounted`, `ISeqable`, `IReduce`, `IStack`
- Map: `ICounted`, `ILookup`, `ISeqable`, `IReduce`, `IKVReduce`, `IMap`
- Set: `ICounted`, `ILookup`, `ISeqable`, `IReduce`, `ISet`

Direct methods delegate traversal to existing representation-native iterators.
No protocol operation inspects private node shapes from outside the owning
collection module.

Direct dispatch remains one Symbol lookup and one call. Vector lookup is
O(log32 n), Map and Set lookup have expected O(log32 n) trie depth, counting is
O(1), and reduction is O(n) with O(1) reducer state apart from user results.

## Native Host Adapters

Importing `runtime/core/collection.mjs` registers exact-type adapters for the
current realm's Array, Map, Set, and Object constructors plus a primitive
String category adapter. Registration writes only to protocol-owned tables.
It does not add Symbols or string properties to any built-in prototype.

Exact registration is intentionally realm-specific. A value from another
realm does not accidentally inherit a local adapter. A host integration may
explicitly register that realm's constructor through `extendProtocolType`.
Named cross-realm adapters for broader host families remain future work.

Typed arrays, DOM collections, async iterables, and arbitrary iterables are not
guessed into this contract. String and ordinary Object behavior is specified
by [0081-protocol-driven-text-object.md](0081-protocol-driven-text-object.md).

## External Collection Types

An immutable external type can implement any subset of the capabilities by
registering each protocol separately. A complete sequence-oriented type should
normally provide `ICounted`, `ISeqable`, and `IReduce`; indexed and keyed
capabilities remain representation-dependent.

`sequenceView(factory, count)` is the standard helper for an external
`ISeqable` implementation. The factory must return a fresh iterator. `count`
may be a non-negative safe integer, a resolver for host-backed views, or
omitted when counting by traversal is acceptable.

`unboundedSequenceView(factory)` is the corresponding constructor for a source
that cannot terminate naturally. It preserves replayability while making
accidental full traversal through `count` impossible.

`reductionView(reduceFunction)` constructs an external reduction-only source.
The callback must create any cursor or traversal state inside each invocation;
the returned view is immutable and reusable but deliberately not iterable or
countable.

## Compatibility and Limits

This collection runtime surface is stable in Compatibility Baseline 2. It does
not change current Eliscript literal emission or the older array-backed
`stdlib/sequence.eli` contract. Migrating that library requires protocol-call
support in portable Eliscript and dual-compiler evidence, so it remains a
separate contract rather than an implicit change to these capabilities.

Subsequent P2 slices now provide construction protocols, owner-token
transients, generic algorithms, transducers, Eliscript-authored protocol
surfaces, portable dispatch policy, native conversion, and String/Object host
adapters through specifications
[0060](0060-collection-construction-protocols.md),
[0062](0062-owner-token-transient-collections.md),
[0063](0063-protocol-driven-core-algorithms.md),
[0066](0066-eliscript-authored-core-protocol-algorithms.md),
[0073](0073-native-javascript-container-interop.md),
[0079](0079-eliscript-protocol-dispatch-policy.md),
[0080](0080-canonical-generated-protocol-runtime.md), and
[0081](0081-protocol-driven-text-object.md). Persistent collection literal
migration, compiler specialization, and a transport-safe protocol
representation remain later compiler work. Specification
[0086](0086-optimized-runtime-persistent-list.md) adds the optimized runtime
List implementation; its `IEmptyable` and `IConj` methods follow the 0060
construction contract, while indexed access remains deliberately absent.

## Acceptance Criteria

- **CCP-01:** All collection protocol objects and operation functions are immutable
  and use the 0058 dispatch contract.
- **CCP-02:** Persistent Vector implements every applicable direct capability; Map
  and Set implement every applicable direct capability without exposing node
  internals.
- **CCP-03:** Count, lookup, and indexed operations preserve stored
  `undefined`, explicit fallbacks, null emptiness, and deterministic errors.
- **CCP-04:** Non-empty `seq` results are frozen, replayable logical views;
  empty persistent and native collections plus `null` return `null`.
- **CCP-05:** Persistent and native Map sequence/reduction elements are frozen
  key/value entries rather than value-only callbacks.
- **CCP-06:** Reduction supports explicit and implicit initial values and stops
  at the exact reducer call returning `reduced`.
- **CCP-07:** Native adapters leave Array, Map, Set, String, and Object
  prototypes byte-for-byte unchanged and do not match foreign realms
  accidentally.
- **CCP-08:** One external immutable type implements the complete capability
  set through extension tables and a standard sequence view.
- **CCP-09:** Bun and Node.js produce identical capability reports, and an
  exact one-million-element reduction completes without stack growth.
- **CCP-10:** Existing persistent collection, protocol, public-surface,
  conformance, compatibility, and full regression suites remain green.
- **CCP-11:** An explicitly unbounded sequence view answers `seq` without
  traversal, rejects `count` immediately, and composes with reduced-value
  consumers that stop at a finite boundary.
- **CCP-12:** A reduction view is frozen and replayable, implements only direct
  `IReduce`, and rejects `count` and `seq` without invoking its reduction
  callback.
- **CCP-13:** Key/value reduction passes indexes or stored keys directly,
  supports open external extension and reduced termination, and remains
  stack-constant at one million indexed values.
- **CCP-14:** Map, Set, and Stack capabilities dispatch independently, preserve
  persistent sharing and native inputs, and remain extensible by external
  immutable types.

## Next Slice

The construction protocol slice is implemented in
[0060-collection-construction-protocols.md](0060-collection-construction-protocols.md).
With both consumption and construction protocols present, the next slice can
implement transducers and `into` without binding algorithms to Vector, Map,
Set, or native containers.
