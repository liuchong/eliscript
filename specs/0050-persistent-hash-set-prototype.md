# 0050: Persistent Hash Set Prototype

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing,
  0049 Persistent Hash Map Trie Prototype

## Summary

This specification defines the stable JavaScript runtime persistent hash set.
The set is an immutable value-semantic view over the 0049 hash array mapped
trie: members are map keys and every key maps to one private sentinel. Set
construction, membership, insertion, removal, traversal, and set algebra
therefore use the same value equality, complete-hash collision handling, path
copying, and sparse/dense transitions as the persistent map.

The implementation is the JavaScript runtime reference. Set literals, compiler
IR, reader behavior, and native JavaScript Set interop remain separately
versioned language contracts.

## Runtime Surface

`runtime/core/set.mjs` exports:

- `PersistentHashSet`, the immutable set value type
- `EMPTY_SET`, the canonical empty value
- `persistentHashSet(...values)`, a variadic constructor
- `isPersistentHashSet(value)`, an exact runtime predicate

`PersistentHashSet.from(iterable)` consumes any synchronous iterable. Passing
an existing persistent hash set returns it unchanged. Direct construction is
rejected so callers cannot supply a malformed backing map or sentinel.

The stable operation surface is:

- `count` and `size`
- `has(value)`
- `conj(value)` and `disj(value)`
- `union(...collections)`
- `intersection(...collections)`
- `difference(...collections)`
- `isSubsetOf(collection)`, `isSupersetOf(collection)`, and
  `isDisjointFrom(collection)`
- `values()`, `keys()`, `entries()`, and JavaScript iteration
- `reduce(reducer, initial)`
- `toSet()` for explicit shallow conversion to a native JavaScript Set

There are intentionally no `add`, `delete`, or `clear` methods. Those names
imply the in-place mutation contract of native JavaScript Set. Eliscript uses
`conj` and `disj` to make returned-value semantics explicit.

The set object, state record, backing map, HAMT nodes, entries, and internal
sentinel are frozen. User members are not recursively frozen.

## Representation

Each set stores exactly one `PersistentHashMap` in private symbol-keyed state.
Every member is associated with the same private frozen `SET_PRESENT` value.
The sentinel is never exported, returned by traversal, or included in set
hashing.

This representation has three consequences:

1. no second hash trie implementation can drift from Map collision behavior
2. measured Map promotion at 32 branches and demotion at 24 apply unchanged
3. transient Set shares the transient HAMT owner-token machinery
   rather than inventing a Set-specific node family

The wrapper does allocate one persistent Map value and one persistent Set
value for each changed operation in the initial implementation. Transient
builders and a lower-level root constructor may remove that bulk-construction
overhead later without changing observable semantics.

## Member Semantics

Membership uses the 0048 `hashValue` and `equalValues` contract through the
backing map.

- null and undefined are distinct members
- positive and negative zero are one member
- all NaN representations are one member
- independently built value-equal persistent collections are one member
- opaque JavaScript objects and functions use process-local identity
- unequal members with the same complete 32-bit hash remain distinct

Adding an existing member returns the same set identity. Removing an absent
member also returns the same identity. Removing the last member returns
`EMPTY_SET`. A changed operation preserves every previous version and copies
only the selected HAMT path.

## Set Algebra

Set algebra accepts persistent sets and ordinary synchronous iterables. A
foreign iterable is interpreted using Eliscript membership semantics, not the
native Set identity rules.

- `union` starts from the receiver and inserts every input member
- `intersection` compares the smaller operand and retains shared members
- `difference` removes each input member from the receiver
- subset, superset, and disjoint predicates compare membership after adapting
  the input

No-op union, intersection, and difference return the receiver when the result
is observably unchanged. Operations with several arguments apply from left to
right, but their resulting membership does not depend on traversal order.

These operations use persistent updates. The protocol/transducer layer routes
profitable bulk results through invalidatable transient builders while
retaining this contract as the reference behavior.

## Traversal and Reduction

Default iteration, `values()`, and `keys()` visit stored members in HAMT branch
order. `entries()` yields newly allocated frozen `[value, value]` pairs for
compatibility with JavaScript's read-only Set traversal shape.

`reduce` visits each member once and calls:

```text
reducer(accumulator, value, set)
```

An explicit initial accumulator is required. No traversal exposes the backing
map, sentinel, node, or map-entry record.

## Equality and Hashing

Two persistent hash sets are equal when they have equal counts and every
member in one is present in the other. Native JavaScript Set remains a
different value category.

Set hashing is insertion-order independent. Every member hash enters the 0048
commutative unordered accumulator exactly once under a Set-specific domain
tag. The result therefore differs from Map and other collection categories
even when their flattened values coincide. Immutable set hashes use the same
private weak cache as vectors and maps.

Exact empty, flat, reverse-order, and complete-collision Set hashes are frozen
in `tests/fixtures/value-hashes.json` and are reproduced under Bun and Node.js.
Hash equality never substitutes for member equality.

## Host Conversion

`toSet` creates one new native JavaScript Set by shallow traversal and never
mutates the source. Host conversion preserves member object references but not
Eliscript value lookup for independently built equal persistent values,
because native Set compares object identity.

Deep `to-js`/`from-js`, cycle diagnostics, and recursive collection conversion
are owned by the later interop contract. No implicit conversion occurs at
JavaScript calls.

## Complexity

For `n` members, expected HAMT depth `d = O(log32 n)`, collision group size
`c`, and an input collection of size `m`:

| Operation | Expected time | New trie nodes |
| --- | --- | --- |
| `count`, `size` | O(1) | 0 |
| `has` | O(d), or O(d + c) | 0 |
| `conj`, `disj` | O(d), or O(d + c) | selected path |
| full traversal/reduce | O(n) | 0 |
| equality | expected O(n log32 n) | 0 |
| first hash | O(n) | 0 |
| cached hash | expected O(1) | 0 |
| union/difference | expected O(m log32(n + m)) | changed paths |
| intersection | expected O(min(n,m) log32(max(n,m))) | retained paths |

Adversarial same-hash members make collision work linear in `c`, exactly as
for Map. Future decoded-data limits remain necessary for untrusted workloads.

## Structural Evidence

`runtime/testing/set.mjs` is an internal adapter over the Map observation
surface. It reports:

- bitmap, dense-array, and collision node counts
- entry count, total node count, and maximum depth
- per-operation node allocations, visits, entry allocations, equality checks,
  promotions, and demotions
- shared HAMT node identities between two Set versions

The adapter reads private symbol state and never recognizes user objects by
property shape. At 100,000 members, the deletion fixture visits and allocates
three nodes and shares exactly every untouched node. At one million members,
membership, insertion, and removal stay within nine visited nodes.

## Conformance Evidence

The default suite verifies:

- canonical empty behavior, old-version preservation, no-op identity, frozen
  values, reduction, and explicit native conversion
- scalar, persistent-vector, and host-identity members
- a real complete 32-bit hash collision through lookup and removal
- exact sparse-to-dense promotion and dense-to-sparse demotion thresholds
- insertion-order-independent equality and exact cross-host hashes
- value-semantic union, intersection, difference, subset, superset, and
  disjoint operations
- one member hash per value on first hashing and one cache hit thereafter
- 20,000 generated updates against a native SameValueZero reference model
- exact selected-path allocation and untouched-node sharing at 100,000 members
- membership, insertion, and removal bounds at one million members
- equivalent observable results under Bun and Node.js

The generated model uses scalar values because native Set is only a valid
reference for that domain. Separate vector and collision cases prove the
stronger Eliscript semantics that native Set cannot model.

## Compatibility and Extensions

This specification and feature are stable in Compatibility Baseline 2. The
public class, constructors, operations, value semantics, set algebra, frozen
hash results, collision behavior, and structural bounds cannot change
incompatibly without a superseding specification and migration fixture.

Owner-token transients, persistent List and identifier values, metadata,
reader/printer round trips, portable implementation, literals, protocols, and
interop are layered by later specifications. They extend this contract without
weakening its retained correctness, sharing, collision, or million-scale
evidence.
