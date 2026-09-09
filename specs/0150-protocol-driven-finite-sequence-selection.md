# 0150: Protocol-driven Finite Sequence Selection

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-09
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0062 Owner-token Transient Collections,
  0063 Protocol-driven Core Sequence and Data Algorithms,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

This specification completes a practical finite-sequence selection layer over
the open collection runtime. It adds direct boundary lookup, bounded tail
selection, and one-pass splitting without introducing Array-only semantics,
lazy-sequence machinery, or an application-framework dependency.

The maintained Eliscript module `stdlib/core/seq.eli` exports Lisp-named
implementations. `runtime/core/sequence.mjs` provides equivalent camel-cased
JavaScript entry points for runtime consumers. Both surfaces accept arbitrary
`IReduce` sources and return persistent Vectors where an operation produces a
collection.

## Public Surface

The Eliscript module exports:

```text
first last sequence-nth butlast take-last drop-last split-at split-with
```

The JavaScript runtime module exports:

```text
first last sequenceNth butlast takeLast dropLast splitAt splitWith
```

`sequence-nth` is the sequence-oriented indexed traversal operation. Its name
keeps it distinct from the existing two-argument compiler intrinsic `nth` and
makes protocol traversal explicit at the source boundary.

## Boundary Lookup

`first(collection, not-found?)` stops after the first value. `last` consumes
the complete finite source and retains its final value. `sequence-nth` consumes
through the requested zero-based position and then stops.

All three operations distinguish an actual `undefined` source value from an
absent value. Their optional not-found result defaults to `null` and is used
only when the source is empty or the requested index is beyond the source.

`sequence-nth` requires a non-negative safe integer index. It rejects negative,
fractional, infinite, and unsafe integer values before source traversal.

## Tail Selection

`take-last(limit, collection)` returns at most the final `limit` values.
`drop-last(limit, collection)` returns every value except the final `limit`.
`butlast(collection)` is equivalent to `drop-last(1, collection)`.

Limits are non-negative safe integers and are validated before traversal. A
zero limit returns the empty persistent Vector for `take-last` and a persistent
copy of the complete source for `drop-last`.

Tail operations use fixed-position ring storage rather than repeated front
removal. For `n` input values and limit `k`, traversal is O(n), temporary ring
storage is O(min(n, k)), and final persistent output construction is linear in
the result size. Mutable ring state is private and never escapes.

## Splitting

`split-at(limit, collection)` returns a persistent Vector containing two
persistent Vectors: the first holds at most `limit` source values and the second
holds the remainder. The limit follows the same validation contract as tail
selection.

`split-with(predicate, collection)` places the longest initial run whose
predicate results are Eliscript-truthful in the first result and all remaining
values in the second. It calls the predicate exactly once per prefix candidate,
including the first false candidate, and never calls it again for the suffix.

Each split traverses the source once, preserves source order, and completes two
owner-token transient builders into persistent Vectors. The containing pair is
also a persistent Vector.

## Compatibility and Limits

This surface is stable in Compatibility Baseline 2. It extends the existing
protocol-driven sequence module without changing prior exports or the portable
Array-oriented compatibility module. Native and persistent collections, null,
and externally extended `IReduce` values follow the same path.

These operations are defined for finite reducible sources. This specification
does not add lazy sequences, reverse traversal protocols, async reduction, or
compiler specialization. It has no browser, UI, build-framework, or publishing
dependency.

## Acceptance Criteria

- **FSS-01:** Both public surfaces expose all eight operations with their
  registered Lisp and camel-case names.
- **FSS-02:** Every operation accepts an externally extended `IReduce` source
  without inspecting its representation.
- **FSS-03:** `first` and `sequence-nth` stop at the exact decisive value;
  `last` consumes the complete finite source.
- **FSS-04:** Boundary lookup preserves present `undefined` values and uses the
  optional not-found value only for absence.
- **FSS-05:** Indexed and bounded operations reject every value that is not a
  non-negative safe integer before traversal.
- **FSS-06:** Tail selection is O(n), uses O(min(n, k)) private ring storage,
  and returns persistent Vectors without front-shifting arrays.
- **FSS-07:** Both split operations traverse once and return a persistent
  Vector pair whose members are persistent Vectors in source order.
- **FSS-08:** `split-with` uses Eliscript truth and stops predicate evaluation
  after the first false result.
- **FSS-09:** Seed and self-hosted compilers reach byte-identical fixed points,
  and generated modules produce identical local Bun and Node results.
