# 0054: Eliscript-authored Persistent List

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0021 Portable Functions and Dependency Closure,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0053 Eliscript-authored Persistent Vector Trie

## Summary

This specification begins the 0041 P1 collection-core phase with an immutable
singly linked List implemented entirely in portable Eliscript.
`stdlib/persistent-list.eli` provides constant-time prepend, first, rest,
peek, and pop operations; linear indexed lookup, reduction, reversal, and
explicit array conversion; and exact suffix sharing between versions.

The List complements the indexed vector trie rather than wrapping it. A
non-empty List value is one immutable node whose `rest` field is itself the
complete previous List value. Adding one element allocates one node and shares
the entire old value by identity.

The module has no JavaScript import, mutation form, host API, or hidden
runtime. Seed and self-hosted compilers produce byte-identical ESM and Source
Maps, and both outputs execute identically under Bun and Node.js.

## Public Surface

The provisional module exports:

- `empty-persistent-list()`
- `persistent-list?(value)`
- `persistent-list-empty?(list)`
- `persistent-list-count(list)`
- `persistent-list-cons(list, value)`
- `persistent-list-conj(list, value)`
- `persistent-list-first(list, not-found)`
- `persistent-list-rest(list, not-found)`
- `persistent-list-peek(list, not-found)`
- `persistent-list-pop(list)`
- `persistent-list-meta(list)`
- `persistent-list-with-meta(list, metadata)`
- `persistent-list-nth(list, index, not-found)`
- `persistent-list-reduce(function, initial, list)`
- `persistent-list-reverse(list)`
- `persistent-list-to-array(list)`
- `persistent-list-from-array(values)`

`cons` and `conj` both add at the front. This establishes the collection
meaning needed by a later generic `conj` protocol while retaining an explicit
List constructor operation. `peek` is equivalent to `first`, and `pop` is the
non-fallback form of `rest`.

Empty `first`, `rest`, and `peek` return their explicit `not-found` argument.
Empty `pop` returns `nil`. Invalid `nth` indices return `not-found`. These
total provisional operations avoid host exceptions inside portable code; the
stable protocol phase may replace invalid-operation values with diagnosed
errors consistently across all collection types.

Count is capped at 2,147,483,647. Prepending at the cap returns `nil`.

## Representation

An empty List is an object containing:

```text
kind, count = 0, empty = true, value = nil, rest = nil, metadata
```

A non-empty node contains:

```text
kind, count, empty = false, value, rest, metadata
```

`rest` points to a valid List with count one smaller. Persistent operations do
not mutate any object. As in 0053, host freezing is not yet a portable
primitive, so callers must not mutate this provisional private representation.
Stable opacity and runtime branding belong to the later value protocol.

The empty List is a value category rather than a required singleton. Separate
empty values are observably equivalent through the public operations, but
canonical identity is not promised in this slice.

## Semantics

List order begins at the current node. Constructing `a`, then prepending `b`,
produces the sequence `b, a`. `persistent-list-from-array` preserves array
iteration order by consuming the source from the end; `to-array` performs the
inverse shallow conversion.

`nth` is zero-based from the front and walks `rest` links. `reduce` visits
values front-to-back and always uses the supplied initial value. `reverse`
reduces into a fresh List and therefore changes order without modifying the
source.

Stored values are opaque. The List neither freezes them nor defines recursive
equality or hashing in this slice. Shared equality, hashing, metadata, and
printing will be composed across List, Vector, Map, and Set later in P1.

## Complexity and Sharing

For a List of `n` values:

| Operation | Time | New List nodes |
| --- | --- | --- |
| empty?, count, cons, conj | O(1) | cons/conj: exactly 1 |
| first, rest, peek, pop | O(1) | 0 |
| nth(index) | O(index) | 0 |
| reduce | O(n) | 0 |
| reverse | O(n) | n |
| from-array | O(n) | n |

After `extended = cons(original, value)`, both `rest(extended)` and
`pop(extended)` are identical to `original`. This identity proves that the
new version shares every node of the old suffix and allocates no copied path.

Array conversion is an explicit compatibility boundary. With the current
immutable array primitive, repeated `cons` while producing a native array can
copy its growing intermediate array. This does not affect List traversal or
persistence complexity; the later host-conversion layer may use a private
bounded mutable builder while preserving public value semantics.

## P1 Role

P1 now has two independent Eliscript-authored persistent structures:

- List proves constant-time front construction and complete suffix sharing.
- Vector proves bounded tail copying and logarithmic indexed path sharing.

Their contrasting capabilities provide the concrete receivers needed to
design focused count, lookup, stack, and reduction protocols. Map, Set, shared
value semantics, protocols, and metadata now exist; printer/reader round trips
and the complete cross-family P1 audit remain before persistent literal
migration. Root metadata and its navigation rules are defined by
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md).

## Compatibility

This module, representation, names, and invalid-operation values are
provisional during M8. It does not change reader list data, quoted forms,
JavaScript arrays, vector literals, or macro evaluator values.

No existing stable language or toolchain behavior changes. The module is
listed in the public-surface registry so further API changes remain visible.

## Acceptance Criteria

- **EPL-01:** The implementation is one portable `.eli` module with no host
  import or mutation form.
- **EPL-02:** Seed and self-hosted compilers emit byte-identical ESM and Source
  Maps.
- **EPL-03:** Bun and Node.js produce identical reports from both compiler
  outputs.
- **EPL-04:** Empty, count, cons, conj, first, rest, peek, pop, nth, reduce,
  reverse, and conversion semantics match this specification.
- **EPL-05:** Twenty thousand generated updates agree with a reference model
  while every retained previous List remains unchanged.
- **EPL-06:** Every prepend allocates one front node and shares the complete
  previous List by identity.
- **EPL-07:** A one-million-node List preserves exact count, first, last,
  reduction result, and complete suffix sharing without stack recursion.
- **EPL-08:** Public-surface, conformance, compatibility, build, and test
  registries include the module and its evidence.
