# 0154: Map, Set, and Stack Capability Protocols

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0060 Collection Construction Protocols,
  0066 Eliscript-authored Core Protocol Surface and Algorithms,
  0095 Stable Persistent and Host-container Boundary

## Summary

This specification completes the basic immutable collection update vocabulary
with three open capabilities: `IMap` removes mappings, `ISet` removes members,
and `IStack` reads or removes the logical top value. The runtime operations are
`dissoc`, `disj`, `peek`, and `pop`; the Eliscript core collection module
exports the same names.

The protocols describe behavior rather than representation. Persistent values
use structural sharing, native JavaScript containers return copies, and
external immutable types can implement only the capability they support.

## Public Surface

`runtime/core/collection.mjs` exports the frozen protocol identities `IMap`,
`ISet`, and `IStack` plus the four generic operations. The corresponding
Eliscript names are exported from `stdlib/core/collection.eli`.

`dissoc(collection, ...keys)` and `disj(collection, ...values)` apply removals
from left to right. Supplying no keys or values returns the original collection
without protocol dispatch. A persistent no-op removal preserves identity.

`peek(collection)` and `pop(collection)` require exactly one argument. Peek
returns `nil` for an empty stack. Pop removes one top value and preserves the
logical collection category; popping an empty concrete stack raises a located
range failure. Nil is an empty polymorphic value, so both operations return nil
for nil.

## Capability Semantics

### IMap

Persistent Hash Map, native Map, exact ordinary Object, and nil implement
`IMap/dissoc`. Persistent Hash Map removes through its HAMT path operation and
retains its original identity when the key is absent. Native Map copies before
deletion. Ordinary Object accepts only string keys, copies own enumerable
properties, and never mutates its input.

### ISet

Persistent Hash Set, native Set, and nil implement `ISet/disj`. Persistent Set
reuses its underlying HAMT Map removal, including value equality and full-hash
collision behavior. Native Set uses host membership semantics on a fresh copy.

### IStack

Persistent List uses its first value as the stack top, so peek and pop are O(1)
and pop returns the exact shared suffix. Persistent Vector and native Array use
their last value as the stack top. Persistent Vector pop copies only the
selected trie path or tail and preserves root metadata. Native Array returns a
shallow copy without its final element.

Map, Set, Object, String, sequence views, and reduction views do not infer a
stack order. List is not made indexed merely because it supports stack access.

## Persistence and Complexity

All built-in operations leave their inputs unchanged. Persistent Map, Set, and
Vector removal is expected O(log32 n) with bounded copied structure; List stack
operations are O(1). Native Map, Set, Object, and Array removal is O(n) because
the adapter must copy mutable host storage. Variadic removal performs one
protocol operation per supplied key or value.

Map, Set, and Vector root metadata remains attached after a successful
removal. List pop is navigation to the exact existing suffix, so that suffix
retains its own metadata rather than inheriting metadata from its parent.
Empty persistent results use their category's existing metadata behavior.
No-op Map and Set removals preserve both root and metadata identity.

## External Types

External types participate through normal protocol extension. An external map
need not implement lookup or reduction to implement `IMap`; an external set
need not implement construction to implement `ISet`; and an external stack
need not be indexed or sequential to implement `IStack`.

Implementations are responsible for returning immutable values or proven no-op
identities. The generic operations do not inspect private fields, constructors,
iterators, or nominal collection classes after dispatch.

## Compatibility and Limits

This surface is additive and stable in Compatibility Baseline 2. Existing
concrete `.dissoc`, `.disj`, `.peek`, and `.pop` methods keep their behavior.
Native adapters retain explicit mutable-host semantics outside these generic
operations.

The protocols do not define queues, deques, sorted collections, concurrent
updates, transient removal, arbitrary iterable adaptation, or application
framework behavior. Those concerns require separate contracts.

## Acceptance Criteria

- **MSP-01:** Runtime and Eliscript collection surfaces export frozen `IMap`,
  `ISet`, and `IStack` protocols plus `dissoc`, `disj`, `peek`, and `pop`.
- **MSP-02:** Persistent Map and Set removals preserve value semantics,
  collision behavior, metadata, unchanged input values, and no-op identity.
- **MSP-03:** Persistent List peek/pop use the head and return the exact shared
  suffix; Persistent Vector peek/pop use the tail and retain bounded trie work.
- **MSP-04:** Native Map, Set, Object, and Array adapters return correct fresh
  containers without modifying their inputs or prototypes.
- **MSP-05:** Nil has empty map, set, and stack behavior; empty concrete stack
  peek returns nil and pop fails deterministically.
- **MSP-06:** Variadic map/set removal proceeds left to right, while zero-item
  calls return the original value without dispatch.
- **MSP-07:** Unsupported categories fail through ordinary protocol dispatch,
  and Object rejects non-string dissociation keys.
- **MSP-08:** External immutable types can implement map removal, set removal,
  or stack access independently of unrelated collection capabilities.
- **MSP-09:** Bun and Node produce identical runtime and generated Eliscript
  reports for persistent and native values.
- **MSP-10:** Generic pop over a million-value Persistent Vector preserves the
  original value, returns the exact new count and top, and remains stack-safe.
- **MSP-11:** Seed and self-hosted compilers retain their fixed point, and the
  full core regression, compatibility, API, and integrity gates pass.
