# 0048: Value Equality and Deterministic Hashing

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0034 Nullish Values, 0041 Host Symbiosis, Persistent Data, and
  Emacs Acceleration, 0047 Persistent Vector Trie Prototype

## Summary

This specification defines the provisional M8 value comparison and 32-bit hash
foundation used by persistent collections. It separates portable value
semantics from JavaScript host identity, gives persistent vectors recursive
value equality, and freezes deterministic Bun/Node fixtures used by persistent
HAMT keys.

The implementation lives in `runtime/core/value.mjs`. It exports:

- `equalValues(left, right)`
- `hashValue(value)`

These JavaScript names are provisional runtime APIs. Compiler forms still keep
their Compatibility Baseline 1 behavior: `eq`, `equal`, and `=` currently emit
strict JavaScript comparison. Language-form migration waits for all persistent
value families and explicit host conversion.

## Equality Families

### Scalar Values

Scalar equality follows category-sensitive SameValueZero semantics:

- `null` equals only `null`
- `undefined` equals only `undefined`
- booleans equal only the same boolean
- strings compare exact UTF-16 code-unit sequences
- BigInts compare exact mathematical values and never equal Numbers
- `+0` and `-0` are equal
- every JavaScript `NaN` representation is equal to every other `NaN`
- infinities equal only the same signed infinity
- global JavaScript symbols equal by their shared symbol identity
- local JavaScript symbols equal only themselves

No coercion occurs. A string, Number, BigInt, boolean, nullish value, symbol,
object, or function never equals a value from another category merely because
JavaScript conversion could make them resemble each other.

### Persistent Values

Persistent types participate through an internal symbol-keyed equality slot.
The operation receives the recursive `equalValues` function and must compare
only values from its own collection category.

Persistent vectors:

- require another persistent vector
- require equal counts
- compare values recursively in index order
- remain distinct from native arrays and future persistent lists
- short-circuit on the first unequal element

Equality does not depend on trie depth, tail placement, cached hash, metadata,
or object identity. Independently constructed vectors with equal ordered values
are equal.

### Host Values

Native arrays, plain objects, class instances, functions, promises, typed
arrays, DOM values, and other opaque host values compare by JavaScript identity.
Two distinct host objects with equal-looking properties are not equal.

Persistent values may contain host values, but two such persistent values are
equal only when corresponding opaque values have the same identity. Portable
cross-runtime values therefore cannot rely on embedded opaque host objects.

## Hash Result

`hashValue` returns an unsigned 32-bit integer in the inclusive range
`0..4294967295`. Equal values always have equal hashes. Unequal values may
collide; every hash table must resolve a matching hash with `equalValues`.

The implementation fixes these representation rules:

- nullish values and booleans use distinct domain constants
- Numbers hash their canonical IEEE-754 binary64 bits
- `+0` and `-0` first normalize to one zero representation
- all NaN payloads use one canonical hash
- strings mix UTF-16 code units in order, including unpaired surrogates
- BigInts mix sign and little-endian 32-bit magnitude limbs
- global symbols hash their registry key as a separately tagged string
- ordered persistent collections mix a collection tag, each element hash in
  order, and the final element count

All arithmetic is explicitly normalized through JavaScript 32-bit integer
operations. IEEE-754 words are read with declared little-endian access, so the
result does not depend on machine byte order.

The exact scalar, vector, persistent-map, and persistent-set results for the
current algorithm are frozen in `tests/fixtures/value-hashes.json`. Changing
one requires an explicit provisional compatibility review and fixture update,
not an incidental engine or refactor change.

## Host Identity Hashes

Opaque host values need a hash compatible with identity equality. Objects and
functions receive a process-local identity hash stored in a `WeakMap`. Local
symbols receive a process-local identity hash stored in an internal map.

Consequences are intentional:

- the same host value keeps one hash for the process lifetime
- two distinct host identities normally receive different hashes, but normal
  32-bit collision handling still applies
- assignment order and concrete host identity hashes are not portable
- deterministic artifacts and worker messages must not serialize or compare
  these process-local hashes
- global symbols remain portable by registry key; local symbols do not

The deterministic guarantee applies to the portable scalar and persistent
value graph. A graph containing opaque host identity is only meaningful within
that host process.

## Hash Mixing

Hash construction uses three explicit operations:

1. `mixHash` combines one 32-bit state and one 32-bit input with XOR,
   `Math.imul`, and an unsigned shift.
2. `finishHash` mixes the logical count and applies a two-stage avalanche.
3. domain tags keep different value families from sharing the same initial
   state.

The algorithm is non-cryptographic. It is designed for deterministic HAMT
branch selection and ordinary collision distribution, not attacker-controlled
hash-table denial-of-service protection. Input limits and future security
review remain required at untrusted decode boundaries.

## Protocol Dispatch

`runtime/core/value-internals.mjs` owns two internal symbols:

- value equality
- value hashing

Persistent vector installs both slots directly on its prototype. This is the
first executable instance of the focused protocol direction in 0041: direct
symbol dispatch without modifying JavaScript built-in prototypes or requiring
a class hierarchy.

The symbols and mixing helpers are internal implementation facilities. Public
protocol declaration, extension tables, missing-protocol diagnostics, and
Eliscript-callable protocol functions remain a later M8/M9 slice.

## Immutable Hash Cache

Hashing a persistent value may be O(n) on first use. The runtime caches the
computed unsigned hash in a private `WeakMap` keyed by the immutable persistent
value. A repeat hash is O(1).

The cache:

- cannot affect equality
- is not observable through enumeration or serialization
- does not keep an otherwise unreachable value alive
- never caches mutable native arrays or objects as value hashes
- gives every updated persistent vector its own cache entry

`runtime/testing/value.mjs` can clear caches and inspect recursive hash calls,
protocol computations, cache hits, and host-identity assignments. It is an
internal test adapter, not an application API. The million-value fixture proves
one first-pass call per element plus the collection root, followed by one total
call for a cached lookup.

## Collision Discipline

The conformance suite contains two distinct strings with the same frozen hash.
They remain unequal. HAMT work must carry both the full hash and original key,
and collision nodes must call `equalValues` before replacement or lookup.

This fixture prevents an optimization from silently changing the contract to
"same hash means same key."

## Complexity

| Operation | Portable scalar | Host identity | Persistent vector | Persistent Map/Set |
| --- | --- | --- | --- | --- |
| equality | O(1), except string content | O(1) | O(n) worst case | expected O(n log32 n) |
| first hash | O(value width) | expected O(1) | O(n) | O(n) |
| cached hash | not cached | expected O(1) | expected O(1) | expected O(1) |

String and BigInt work is proportional to their encoded width. Vector equality
and first hash traverse leaf chunks in order rather than performing one root
lookup per element.

## Conformance Evidence

The default suite verifies:

- every scalar edge, including NaN, signed zero, infinities, BigInt, Unicode,
  null, and undefined
- equality implies equal hash across generated nested vectors
- host arrays, objects, functions, and local symbols retain identity semantics
- a real 32-bit collision never implies equality
- independently constructed nested vectors compare by recursive values
- first and repeat hashes produce the expected cache counters
- hashing and cached lookup at one million vector values
- insertion-order-independent Map and Set hashes, including collisions
- exact frozen hash output under both Bun and Node.js

## Compatibility and Remaining Work

This specification and its conformance feature are provisional in
Compatibility Baseline 1. They establish the key contract needed by HAMT Map
and Set but do not complete 0041 value semantics.

Remaining work includes:

- persistent list equality/hash implementation
- keyword and Eliscript symbol runtime values
- metadata exclusion tests
- language-form and literal migration
- public protocol dispatch and extension
- hostile-input and decode-boundary security limits

The P0 equality/hash fixture requirement is satisfied for currently
implemented runtime values. Persistent Map HAMT support is specified by
[0049-persistent-hash-map-prototype.md](0049-persistent-hash-map-prototype.md),
and Set support by
[0050-persistent-hash-set-prototype.md](0050-persistent-hash-set-prototype.md).
The full P0 exit gate still requires integer bit-operation support and
cross-engine node-layout measurements.
