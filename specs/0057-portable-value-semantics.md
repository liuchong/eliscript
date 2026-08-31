# 0057: Portable Value Semantics Core

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0034 Nullish Values,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing,
  0052 Portable 32-bit Integer Operations,
  0053 Eliscript-authored Persistent Vector Trie,
  0054 Eliscript-authored Persistent List,
  0055 Eliscript-authored Persistent HAMT Map,
  0056 Eliscript-authored Persistent Map-backed Set

## Summary

This specification establishes the first shared value-semantics core written
in portable Eliscript. `stdlib/value.eli` defines recursive equality and
deterministic hashing for scalar values and all four language-authored
persistent collection families. It also supplies ordinary Map and Set
constructors whose hash and equality policies are selected by the language
rather than injected by every caller.

The implementation is both runtime library and compiler-development proof. It
uses only portable Eliscript modules and three narrowly specified value
inspection primitives. Seed and self-hosted compilers emit byte-identical ESM
and Source Maps for the complete dependency graph, and Bun and Node.js execute
the same frozen and generated semantics.

This slice completes P1 construction step 2 from 0041. It does not complete
the open protocol, metadata, printer/reader, persistent literal, transient, or
Emacs value-codec work.

## Portable Inspection Primitives

Three exact-arity forms expose the minimum host facts needed by a portable
value implementation:

- `value-type(value)` returns `"null"` for JavaScript `null`, recognizes the
  own logical brand of Keyword and Symbol values as `"keyword"` or `"symbol"`,
  and otherwise returns the JavaScript `typeof` string
- `string-code-unit-at(text, index)` returns the UTF-16 code unit at `index`
- `number-float64-words(value)` returns the IEEE-754 binary64 low and high
  unsigned 32-bit words as a two-element native vector

`number-float64-words` normalizes negative zero to positive zero before word
extraction. NaN equality and hashing are handled by library policy rather than
by depending on a host NaN payload. The forms are available to ordinary and
portable code, reject every unsupported arity during analysis, and lower
identically through the seed and self-hosted compilers.

These are mechanism primitives, not the public value abstraction. User code
normally calls `value-equal?` and `value-hash`.

## Public Surface

The provisional `stdlib/value.eli` module exports:

- `value-equal?(left, right)`
- `value-hash(value)`
- `empty-value-map()`
- `value-map-from-entries(entries)`
- `empty-value-set()`
- `value-set-from-array(values)`

The low-level `persistent-map.eli` and `persistent-set.eli` constructors that
accept explicit policies remain available. They are required for specialized
key domains and for host identity keys until identity hashing is implemented.

## Equality Contract

Equality is symmetric, reflexive for every supported value including NaN, and
does not coerce between runtime types.

- `null` and `undefined` are distinct values
- booleans, numbers, and strings compare within their own scalar category
- Keywords and Eliscript Symbols compare namespace and name within distinct
  categories
- positive and negative zero compare equal
- every NaN compares equal to every NaN
- Lists compare ordered members and remain distinct from Vectors
- Vectors compare ordered members
- Maps compare key/value membership independent of insertion order
- Sets compare membership independent of insertion order
- nested values recursively use this same contract
- functions and opaque host objects compare only by JavaScript identity
- a complete hash collision never implies equality

Persistent values cannot contain cycles through the immutable public
operations, so recursive equality requires no cycle detector. Host containers
remain opaque and are never traversed.

## Hash Contract

`value-hash` returns an unsigned deterministic 32-bit integer. Equal supported
values always produce equal hashes.

Scalar hashing uses the frozen tags, mixing, avalanche, UTF-16 string walk,
and float64 word rules established by 0048. Vector, Map, and Set hashes match
the JavaScript reference runtime exactly. List has a distinct ordered-family
tag, so equal member sequences do not erase the List/Vector category boundary.

Ordered collections fold member hashes in order. Map hashes combine entry
hashes with commutative sum, xor, and product accumulators. Set hashes apply
the same unordered aggregation to member hashes. Therefore Map and Set hashes
are independent of trie traversal and insertion order.

No collection-root hash cache exists in this slice. A hash traverses the
complete logical value each time, keeping the portable implementation direct
and independently checkable before optimization. Immutable-root caching may
be added later without changing results.

## Default Persistent Collections

`empty-value-map` and `value-map-from-entries` construct HAMT Maps with
`value-hash` for keys and `value-equal?` for keys and values.

`empty-value-set` and `value-set-from-array` construct Map-backed Sets with the
same shared key policy. Sets built by these constructors are policy-compatible
because every instance reuses the exact exported function identities.

Consequently, nested List, Vector, Map, and Set values can be ordinary Map
keys or Set members without user-supplied functions. Existing low-level
constructors preserve explicit policy injection and representation tests.

## Nullish Preservation

Every persistent collection access path distinguishes a missing position or
key from a stored `undefined` value. Internal array reads and collection reads
therefore use an explicit fallback only for absence; they do not collapse a
present `undefined` to `nil`.

The conformance suite nests `undefined` in List, Vector, Map, and Set values,
then verifies lookup, conversion, equality, and hashing. This extends the
language-level distinction defined by 0034 through the persistent layer.

## Complexity

For logical collection size `n`, bounded HAMT depth `d`, and collision group
size `c`:

| Operation | Expected time | Additional space |
| --- | --- | --- |
| scalar equality/hash | O(1), except O(string length) | O(1) |
| List/Vector equality | O(n) | O(1) iterative traversal |
| List/Vector hash | O(n) | O(1) |
| Map equality | expected O(n * d) | O(d) bounded trie stack |
| Set equality | expected O(n * d) | O(d) bounded trie stack |
| Map/Set hash | O(n), plus nested values | O(d) bounded trie stack |
| default Map/Set lookup | expected O(d), O(c) at a complete collision | O(1) |

The one-million-element Vector fixture proves iterative ordered hashing without
stack overflow. The existing collection specifications separately retain
million-scale structural and traversal evidence for List, Map, and Set. These
are correctness and bounded-stack gates, not fixed wall-clock benchmarks.

## Host and Numeric Limits

Opaque host objects and functions use strict identity equality. The portable
core currently assigns a deterministic fallback hash by host type rather than
maintaining a process-local identity table. This preserves the
equal-implies-equal-hash invariant but may place many identity keys in one
collision group and degrade their Map/Set operations to O(n).

Applications that require efficient opaque identity keys must use the
low-level injected-policy constructors until a host identity-hash primitive
or protocol adapter is accepted. BigInt is hashed from its string form, but
exact cross-runtime parity for BigInt and Symbol is not yet frozen. Symbols
here means native JavaScript Symbols. First-class Eliscript Keyword and Symbol
values are supported by the logical type and hash contract in 0067; other
user-defined value types remain outside the ordinary supported key set.

The portable `.eli` implementation dispatches directly over the four core
persistent representations. The JavaScript reference runtime now uses the
open `IEquiv` and `IHash` protocol core specified by
[0058-open-protocol-dispatch.md](0058-open-protocol-dispatch.md). Bringing the
portable collection algorithms onto the broader collection protocols remains
later P2 work.

## Hosted-Language Role

The value core follows the project's hosted-language strategy in concrete
form:

1. Emacs Lisp supplies the readable bootstrap compiler and independent
   analysis oracle.
2. Eliscript supplies the portable value algorithms and increasingly the
   compiler implementation itself.
3. JavaScript engines execute the generated compiler and collection code.
4. Exact dual-compiler and dual-host evidence prevents self-hosting from
   becoming self-validation.
5. The same immutable values later cross the Emacs worker boundary and power
   accelerated indexes, dependency graphs, transforms, and searches.

The performance return to Emacs is therefore not merely "JavaScript runs
faster." Eliscript adds a stronger immutable data and algorithm layer, emits
ordinary optimized JavaScript, and returns versioned values to editor-owned
state only after correctness and freshness checks. P5-P7 of 0041 own that
bridge and the measured end-to-end proof.

## Compatibility

This module, its six exports, the three inspection forms, collection tags,
hash constants, and current dispatch set are provisional during M8. The
Keyword/Symbol extension is specified by 0067. Frozen
scalar, Vector, Map, and Set hash outputs agree with 0048-0050; List hashes are
newly frozen here.

No literal changes in this slice. Native JavaScript arrays, objects, Maps, and
Sets retain their current behavior. Persistent literal migration remains P3
work and requires its own compatibility decision.

## Acceptance Criteria

- **EVP-01:** Seed and self-hosted compilers emit byte-identical ESM and Source
  Maps for `value.eli` and its complete portable dependency graph.
- **EVP-02:** Bun and Node.js agree on frozen scalar, List, Vector, Map, Set,
  nested, insertion-order, collision, and host-identity fixtures.
- **EVP-03:** The three inspection forms accept only their specified arities
  and emit the specified JavaScript mechanisms through both compiler paths.
- **EVP-04:** At least 2,000 generated cross-family values satisfy reflexivity,
  symmetry, unequal-category behavior, and equal-implies-equal-hash.
- **EVP-05:** A real complete-hash collision remains unequal and behaves as
  two independent Map keys and Set members.
- **EVP-06:** Default Map and Set constructors accept nested persistent values
  without caller-supplied policy and remain mutually policy-compatible.
- **EVP-07:** Stored `undefined` survives every supported persistent collection
  access and conversion path without becoming `nil`.
- **EVP-08:** Hash traversal over a one-million-element persistent Vector
  completes iteratively under the primary Bun test host; ordinary frozen and
  nested collection hashes agree between Bun and Node.js.
- **EVP-09:** Public-surface, compatibility, conformance, build, documentation,
  and default-test registries contain the module, forms, and evidence.
