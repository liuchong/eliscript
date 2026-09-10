# 0153: Key/Value Reduction Protocol

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0063 Protocol-driven Core Sequence and Data Algorithms,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

This specification adds `IKVReduce`, an open key/value reduction capability.
Reducers receive an accumulator, logical key, and logical value directly, so
indexed and associative values can traverse without first constructing public
two-element entry values.

The capability complements `IReduce`; it does not replace entry-oriented
reduction. Persistent and native indexed values use their indexes as keys,
while map-like values use their stored keys. Data algorithms may combine both
capabilities to preserve existing entry-source compatibility.

## Public Surface

`runtime/core/collection.mjs` exports `IKVReduce` and
`reduceKV(collection, reducer, initial)`. `stdlib/core/collection.eli` exports
the same protocol and the Lisp-named `reduce-kv` operation.

`reduceKV` requires exactly a collection, a three-argument reducer, and an
explicit initial value. Empty input returns the initial value without invoking
the reducer. A reduced result stops traversal at the exact key/value pair and
is unwrapped at the public boundary.

## Core Implementations

Persistent Vector and native Array values expose zero-based indexes as keys.
Persistent Hash Map, native Map, and exact ordinary Object values expose their
logical stored keys. Nil participates as an empty keyed source. List, Set,
String, sequence views, and reduction views do not infer keys and therefore do
not implement the protocol.

Persistent Vector traverses trie leaf arrays directly. Persistent Hash Map
traverses internal HAMT entries directly. Neither path constructs frozen
public entry pairs. Native Map uses its host entry iterator, and ordinary
Object snapshots own enumerable string keys at reduction start.

External immutable values participate through ordinary protocol extension.
They need not also implement `IReduce`, `ISeqable`, or a concrete map class.

## Data Algorithm Integration

`merge` and `merge-with` prefer direct key/value reduction for map-like values.
An `IKVReduce` value that also implements indexed access remains an entry
collection for these two existing APIs, preserving the stable behavior where
Vector and Array values contain key/value entries. A source without keyed
capability retains the original `IReduce` entry-validation path.

This capability composition keeps algorithms open without introducing a
nominal map hierarchy. It also allows external map-like values that implement
only `IKVReduce` to participate in merging.

## Complexity and Resource Behavior

For `n` visited key/value pairs, `reduce-kv` is O(n) time and O(1) traversal
state apart from user reducer results. Persistent collection traversal remains
stack-constant at one million values. Early termination visits no pair after
the reducer returns `reduced`.

The protocol itself allocates no output collection. Reducers and consuming
algorithms own their result allocation. Map merging continues to use the
owner-token transient HAMT builder where applicable.

## Compatibility and Limits

This surface is additive and stable in Compatibility Baseline 2. Existing
`reduce` semantics and Map entry values remain unchanged. The protocol does
not imply ordering beyond the source collection's existing traversal order,
multi-arity reducers, asynchronous reduction, parallel fold, sorted maps, or
application-framework behavior.

## Acceptance Criteria

- **KVR-01:** Runtime and Eliscript collection surfaces expose the frozen
  `IKVReduce` protocol and explicit-initial `reduce-kv` operation.
- **KVR-02:** Persistent Vector and Array pass exact indexes and values, while
  persistent Map, native Map, and Object pass exact logical keys and values.
- **KVR-03:** Nil returns the initial value and unsupported collection families
  fail through ordinary protocol dispatch.
- **KVR-04:** Persistent Vector and Hash Map traverse their internal storage
  without constructing public entry pairs or growing the stack.
- **KVR-05:** Returning `reduced` stops at the exact pair and unwraps once at
  the public boundary.
- **KVR-06:** An external immutable type can implement only `IKVReduce` and
  participate in direct reduction and map merging.
- **KVR-07:** Vector/Array entry-source behavior in `merge` and `merge-with`
  remains compatible while map-like sources use direct keyed traversal.
- **KVR-08:** One million indexed values reduce with exact keys, values, and
  bounded stack usage.
- **KVR-09:** Seed and self-hosted compilers reach a byte-identical fixed point,
  and generated collection/data modules agree under local Bun and Node.
