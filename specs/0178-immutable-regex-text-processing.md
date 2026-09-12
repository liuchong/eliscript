# 0178: Immutable Regex Text Processing

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-12
- Depends on: 0048 Value Equality and Hashing, 0061 Composable Transducers,
  0176 Memoized Lazy Sequences and Pull Transduction

## Summary

Eliscript provides deterministic regular-expression construction, matching,
search, lazy scanning, and replacement without exposing JavaScript `RegExp`
mutation. Patterns are frozen opaque values. Every operation creates private
native matcher state, so caller-visible `lastIndex`, global flags, and repeated
traversal cannot change results.

The language module `stdlib/core/regex.eli` exports:

```text
regex regex? regex-source regex-flags
re-matches re-find re-seq re-replace
```

This is a language and standard-library facility. It has no editor, framework,
filesystem, process, network, or application dependency.

## Pattern Values

`regex` accepts a source string and optional flags. Stable flags are `i`, `m`,
`s`, and `u`; they are normalized into that order. Stateful native flags `g`
and `y`, indices flag `d`, duplicate flags, unknown flags, non-string sources,
and syntactically invalid patterns are rejected at construction with stable
errors.

Patterns are authenticated by private runtime state, frozen, and inspected only
through `regex?`, `regex-source`, and `regex-flags`. Raw JavaScript `RegExp`
objects are not pattern values. Pattern identity is opaque; this specification
does not add value equality or serialization for executable regex programs.

## Matching

`re-matches` succeeds only when one match covers the complete input. `re-find`
returns the first match at or after an optional non-negative UTF-16 start
offset. Absence returns nil.

A match with no capture groups is returned as a string. A match with capture
groups is returned as a persistent Vector containing the complete match followed
by every capture in source order. An optional group that did not participate is
represented by nil rather than JavaScript `undefined`.

## Lazy Scanning

`re-seq` returns a memoized lazy sequence of non-overlapping match values. It
does not execute the pattern at construction. Independent and interleaved
traversals share one realized prefix and one stable failure position.

Zero-width matches advance by one Unicode code point when `u` is active and by
one UTF-16 code unit otherwise. A zero-width match at the end of input is
emitted once. Scanning therefore cannot repeat one zero-width match forever.

## Replacement

`re-replace` replaces every non-overlapping match. A string replacement is
literal: dollar sequences have no hidden host substitution syntax. A function
replacement receives the normalized match value, UTF-16 match index, and
complete input, and must return a string. Matching and replacement never mutate
the input or pattern.

## Acceptance Criteria

- **RXP-01:** Pattern construction authenticates frozen values, normalizes the
  four stable flags, and rejects native-stateful or malformed input.
- **RXP-02:** Full matching and offset search distinguish absence, scalar
  matches, capture Vectors, and non-participating groups exactly.
- **RXP-03:** Every operation uses fresh private native matcher state and never
  exposes or depends on mutable `lastIndex`.
- **RXP-04:** Lazy scanning performs no construction-time match work and shares
  one memoized result prefix across traversals.
- **RXP-05:** Empty Unicode matches advance deterministically without looping or
  splitting surrogate pairs.
- **RXP-06:** Replacement is global, literal for strings, callback-driven when
  requested, and validates callback results.
- **RXP-07:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same observable report.
- **RXP-08:** Public runtime, standard-library, API, compatibility, and
  conformance inventories own the complete surface.
