# 0047: Persistent Vector Trie Prototype

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0046 M7 Compatibility Baseline 1

## Summary

This specification defines the first M8 persistent collection prototype: an
immutable indexed vector backed by a 32-way bit-partitioned trie and a short
tail. It established executable semantics and structural evidence before
persistent vector literals became the language default.

The JavaScript-facing runtime API is stable. Reader, compiler IR, literal,
destructuring, and JavaScript interop behavior are owned by their later
specifications and do not alter the runtime operations frozen here.

## Runtime Surface

`runtime/core/vector.mjs` exports:

- `PersistentVector`, an immutable vector value type
- `EMPTY_VECTOR`, the canonical empty value
- `persistentVector(...values)`, a variadic constructor
- `isPersistentVector(value)`, an exact runtime predicate

`PersistentVector.from(iterable)` snapshots any synchronous JavaScript
iterable by repeated persistent append. Passing an existing persistent vector
returns that value unchanged. Direct construction with `new PersistentVector`
is rejected so callers cannot manufacture an invalid root, shift, or tail.

The initial operation surface is:

- `count` and `size`
- `nth(index[, notFound])`
- `assoc(index, value)`
- `conj(value)`
- `peek([notFound])`
- `pop()`
- `reduce(reducer[, initial])`
- `toArray()` and synchronous JavaScript iteration

Protocol functions, metadata, transient builders, printing, and reader round
trips are owned by later specifications. Recursive equality and deterministic
hashing are implemented by
[0048-value-equality-and-hashing.md](0048-value-equality-and-hashing.md). The
methods listed here are the stable JavaScript runtime surface; generic
collection dispatch is the separate stable protocol surface defined by 0059
and 0060.

## Representation

Each vector records:

```text
count, shift, root, tail
```

The root contains immutable vector nodes. Every node contains up to 32 frozen
slots. Five index bits select a slot at each level. `shift` starts at five and
grows in five-bit steps when the root is full. The frozen tail contains the
last one to 32 values, except for the canonical empty vector.

The implementation supports at most 2,147,483,647 values. This bound keeps
all trie index operations inside the explicitly supported non-negative 31-bit
index space instead of depending on accidental signed JavaScript bitwise
coercions.

Updates never mutate an existing node or tail:

- tail updates copy only the tail
- trie `assoc` copies the selected root-to-leaf path
- `conj` copies the tail until it fills, then inserts the old tail as one leaf
- `pop` copies the removal path only when it must pull a leaf back into the tail
- root growth and collapse preserve all reusable subtrees by identity

The vector object, state record, nodes, node slot arrays, and tail are frozen.
Stored user values remain ordinary Eliscript or host values and are not
recursively frozen.

## Indexed Semantics

Indices must be finite non-negative integers.

- `nth` accepts indices from zero through `count - 1`.
- Invalid `nth` throws `RangeError` unless a `notFound` value was supplied.
- `assoc` replaces indices from zero through `count - 1`.
- `assoc` at exactly `count` is equivalent to `conj`.
- `assoc` above `count` and every negative or fractional index throw
  `RangeError`.
- `peek` returns the final value in O(1), or `null` for an empty vector unless
  another `notFound` value was supplied.
- `pop` removes one final value and fails with `RangeError` when empty.

Returning an equal previous version after `pop` does not imply JavaScript
object identity with a value that existed earlier. Persistence promises value
preservation and structural sharing, not history interning.

## Traversal

Reduction and iteration traverse one 32-value leaf chunk at a time. They do
not perform `nth` from the root for every value. `reduce` follows ordinary
left-to-right order and supplies `(accumulator, value, index)` to its reducing
function.

Without an initial value, the first element becomes the accumulator and an
empty vector is rejected. With an initial value, reducing an empty vector
returns that value.

`toArray` is the explicit shallow conversion used by this prototype. The
general recursive `to-js` and `from-js` contracts remain part of the later
interop slice.

## Complexity Contract

For `n` values and trie depth `d = O(log32 n)`:

| Operation | Time | New trie nodes |
| --- | --- | --- |
| `count`, `size`, `peek` | O(1) | 0 |
| tail `nth` | O(1) | 0 |
| trie `nth` | O(d) | 0 |
| tail `assoc` | O(32) bounded copy | 0 |
| trie `assoc` | O(d) | exactly the selected path |
| `conj` | amortized O(d) | selected insertion path when tail is full |
| `pop` | O(d) worst case | selected removal path when tail has one value |
| `reduce`, iteration | O(n) | 0 |

The O(32) tail copy is a fixed branch-width cost and does not grow with vector
size.

## Structural Evidence

`runtime/testing/vector.mjs` is an internal test adapter, not an application
or language API. It exposes operation-local counters for:

- vector-node allocations
- existing vector-node visits
- tail allocations
- root growth events

It also reports trie shape and counts shared node identities between two
versions. The default suite uses these observations to prove that an indexed
update allocates exactly one node per selected path level and shares every
other trie node.

The test suite covers:

- tail boundaries at 31, 32, 33 and deeper root boundaries
- root growth at 1,057 values and root collapse after pop
- deterministic generated operations against a mutable reference array
- old-version preservation after every generated update
- chunked reduction and iteration
- indexed lookup and path-copy bounds at one million values
- equivalent module behavior under Bun and Node.js

These counters are structural evidence rather than timing claims. Engine
layout benchmarks and transient owner tokens retain separate specifications
and evidence suites.

## Compatibility

This specification and its conformance feature are stable in Compatibility
Baseline 2. The public class, constructors, operations, index semantics,
structural-sharing bounds, and value behavior cannot change incompatibly
without a superseding specification and migration fixture.

Internal helpers and allocation strategies may evolve while preserving the
declared representation invariants and structural bounds. Persistent literal,
destructuring, protocol, and interop contracts remain independently versioned.

## Exit Evidence

The slice is implemented when:

1. every public operation agrees with the specified model at all trie
   boundaries
2. previous versions remain unchanged after generated updates
3. a trie `assoc` allocates exactly the selected path and shares all untouched
   nodes
4. one-million-value lookup and update remain inside the measured depth bound
5. the module participates in the default local and compatibility test suite

This was the first P0 prototype from 0041. The later equality, hashing, HAMT,
portable integer, protocol, transient, literal, and interop slices now retain
this suite as the executable JavaScript runtime reference.
