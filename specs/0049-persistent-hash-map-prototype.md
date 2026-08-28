# 0049: Persistent Hash Map Trie Prototype

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing

## Summary

This specification defines the provisional M8 persistent hash map. It is a
32-way hash array mapped trie with sparse bitmap nodes, dense array nodes, and
dedicated full-hash collision nodes. Keys use the value equality and hash
contract from 0048; updates preserve previous map versions and copy only the
selected trie path.

The implementation is an isolated JavaScript runtime prototype. It does not
change map literals, native object forms, compiler IR, or standard-library
object behavior. A future language integration slice must first complete Set,
explicit host conversion, reader/printer behavior, and compiler support.

## Runtime Surface

`runtime/core/map.mjs` exports:

- `PersistentHashMap`, the immutable map value type
- `EMPTY_MAP`, the canonical empty value
- `persistentHashMap(...entries)`, a constructor from key/value pairs
- `isPersistentHashMap(value)`, an exact runtime predicate

`PersistentHashMap.from(iterable)` accepts a synchronous iterable whose values
are themselves iterable pairs of exactly two values. Passing an existing
persistent hash map returns it unchanged. Invalid or non-pair entries fail
before they can create a malformed trie.

The provisional operation surface is:

- `count` and `size`
- `get(key[, notFound])`
- `has(key)`
- `assoc(key, value)`
- `dissoc(key)`
- `entries()`, `keys()`, `values()`, and JavaScript iteration
- `reduce(reducer, initial)`
- `toMap()` for explicit shallow conversion to a native JavaScript Map

Direct construction is rejected. The map object, state record, nodes, compact
arrays, 32-slot arrays, and stored entry records are frozen. User keys and
values are not recursively frozen.

## Key Semantics

Every operation hashes a key with `hashValue` and resolves candidate keys with
`equalValues`.

- null and undefined are distinct keys
- positive and negative zero are one key
- all NaN representations are one key
- value-equal persistent vectors are one key even when independently built
- opaque JavaScript objects and functions are keys by process-local identity
- distinct values with the same 32-bit hash remain distinct keys

Replacing a value through an equal key preserves the originally stored key
object. Associating a value equal to the current value returns the same map
identity. Removing an absent key also returns the same identity.

Values may be `undefined`; `has` and internal lookup use a private sentinel so
stored undefined never behaves like absence.

## Node Forms

### Map Entry

An internal immutable entry stores:

```text
key, value, unsignedHash
```

The hash is computed once at insertion. It is never treated as proof of key
equality.

### Bitmap Indexed Node

A sparse node stores one unsigned 32-bit bitmap and a compact item array. Five
hash bits select a logical branch. Population count over all lower bitmap bits
maps that branch to the compact array index.

Items are either entries or deeper nodes. Missing branches consume no array
slot. Inserting the sixteenth occupied branch promotes the node to an
`ArrayNode`.

### Array Node

A dense node stores an exact occupied-branch count and one frozen 32-slot
array. A selected slot contains an entry, a deeper node, or `undefined`.

After deletion reduces occupancy to eight branches, the node demotes to a
compact bitmap node. The separate promotion and demotion thresholds prevent
representation thrashing around one occupancy boundary.

### Hash Collision Node

Keys with equal complete 32-bit hashes but unequal values share one collision
node containing immutable entries. Lookup, replacement, and deletion scan only
that collision group and always call `equalValues`.

When a later key reaches the same outer branch but has another complete hash,
the collision node and new entry are rebranched at the first differing
five-bit segment. This preserves both the collision group and ordinary trie
depth.

## Persistent Update Rules

`assoc` and `dissoc` descend through at most the seven five-bit segments of a
32-bit hash. At each level:

- an unchanged result reuses the current node
- a changed result creates one replacement node
- every unselected sibling remains shared by identity
- leaf replacement creates one new entry
- insertion may add nodes for a newly diverging hash path
- promotion or demotion may allocate one additional representation node

No operation mutates a root reachable from another map. Returning the canonical
empty map after the last deletion does not require preserving the identity of
an earlier empty value beyond `EMPTY_MAP` itself.

## Lookup and Removal

`get` returns `null` for absence unless a `notFound` value is supplied. `has`
distinguishes absence from every stored value, including null, undefined, and
the ordinary public value domain.

`dissoc` removes only a key that matches both hash and value equality. A
two-entry collision node collapses to its remaining entry. Empty child branches
are removed from their parent, and dense nodes are compacted at the declared
threshold.

## Traversal

Traversal follows trie branch order rather than insertion order. Observable
map equality and hash do not depend on either order.

`entries()` and default iteration yield newly allocated frozen two-element
arrays. `keys()` and `values()` yield stored values directly. `reduce` visits
each entry once and calls:

```text
reducer(accumulator, value, key, map)
```

An explicit initial accumulator is required. No traversal exposes internal
node or entry records.

## Equality and Hashing

Two persistent hash maps are equal when they have equal counts and every key
in one finds an equal value in the other. Native JavaScript Map and plain
objects remain different value categories.

Map hashing is insertion-order independent:

1. each entry produces an ordered key/value pair hash
2. entry hashes are accumulated with commutative sum, rotated XOR, and odd
   product components
3. the map domain tag and final count are mixed and avalanched
4. the persistent result is cached by the 0048 private hash cache

The exact current map hashes are part of the Bun/Node fixture in
`tests/fixtures/value-hashes.json`. Equal maps built in reverse order have the
same frozen result. A dedicated collision map also has a frozen result.

## Host Conversion

`toMap` creates one new native JavaScript Map by shallow traversal. It does not
mutate the persistent source.

Native Map uses JavaScript identity for object keys. Therefore a persistent
vector key remains the same object when copied, but an independently built
value-equal vector does not look up the native entry. This is an explicit host
conversion, not a transparent preservation of Eliscript key semantics.

Deep `to-js`/`from-js`, cycle diagnostics, and React adapters remain later
interop work.

## Complexity

For `n` entries, expected trie depth `d = O(log32 n)`, and collision group size
`c`:

| Operation | Expected time | New trie nodes |
| --- | --- | --- |
| `count`, `size` | O(1) | 0 |
| `get`, `has` | O(d), or O(d + c) | 0 |
| replace existing | O(d), or O(d + c) | selected path |
| insert | O(d), or O(d + c) | selected/diverging path |
| delete | O(d), or O(d + c) | selected path plus representation change |
| full traversal | O(n) | 0 trie nodes |
| first equality | expected O(n log32 n) | 0 trie nodes |
| first hash | O(n) | 0 trie nodes |
| cached hash | expected O(1) | 0 |

Adversarial same-hash keys make collision-node work linear in `c`. Security
limits for untrusted decoded keys remain required even though correctness is
preserved.

## Structural Evidence

`runtime/testing/map.mjs` is an internal adapter that reports:

- bitmap, dense-array, and collision node counts
- entry count, total node count, and maximum structural depth
- per-operation node allocations and visits
- entry allocations and key equality checks
- sparse-to-dense promotions and dense-to-sparse demotions
- shared node identities between two map versions

The adapter recognizes internal node classes exactly and never interprets a
user value by property shape.

## Conformance Evidence

The default suite verifies:

- empty, insertion, replacement, absence, undefined values, and deletion
- null, undefined, NaN, signed zero, vector, and host-identity keys
- a real complete-hash collision through lookup, replacement, and deletion
- collision-node rebranching with a different complete hash
- exact promotion at 16 root branches and demotion at 8
- insertion-order-independent equality and frozen hashes
- one key hash and one value hash per entry on first hash, then one cached call
- 20,000 generated updates against a native SameValueZero reference model
- previous-version preservation after every generated operation
- exact selected-path allocation and untouched-node sharing at 100,000 keys
- lookup, replacement, and removal bounds at one million keys
- equivalent observable results under Bun and Node.js

The one-million-key suite permits at most nine visited nodes. This covers the
seven 5-bit hash segments plus the documented collision/implementation margin
from PD-03.

## Compatibility and Remaining Work

This specification and feature are provisional in Compatibility Baseline 1.
Existing object and map literal behavior is unchanged.

The prototype satisfies the core persistent Map correctness, collision,
sharing, and million-scale structural requirements, but does not complete the
0041 P0/P1 exits. Remaining work includes:

- persistent Set over the same HAMT key layer
- transient owner-token variants
- keyword and Eliscript symbol values
- metadata and reader/printer round trips
- property-generated operation sequences at the final PD-01 volume
- browser engine layout measurements and threshold benchmarks
- portable Eliscript implementation after integer bit operations are exposed
- literal, protocol, compiler, standard-library, and interop migration
