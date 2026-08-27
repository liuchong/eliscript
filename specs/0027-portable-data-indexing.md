# 0027: Portable Data Indexing

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0026 Portable Immutable Object Library

## Summary

The immutable object library now turns ordered values into keyed lookup,
grouping, and count objects. This application-facing slice is driven by the Org
React site, whose hash router previously scanned every article on each
navigation event.

```elisp
(import "../../stdlib/object.eli" index-by group-by count-by)

(index-by (lambda (article) (get article :slug)) articles)
```

All three functions are `defportable`, use the existing immutable object
primitives, and add no compiler or runtime capability.

## Operations

- `index-by(key-function, values)` associates each value under its computed
  key. Duplicate keys are right-biased, so the last value wins without moving
  the key's ECMAScript enumeration position.
- `group-by(key-function, values)` associates each key with a fresh array of
  matching values in input order.
- `count-by(key-function, values)` associates each key with its occurrence
  count.

The key function is called exactly once for every input value, from left to
right. Empty arrays and `nil` produce `{}`. Computed keys follow ordinary
ECMAScript property-key conversion through `object-assoc`.

## Own-property Safety

`group-by` and `count-by` test `has?` before reading an existing accumulator.
They therefore never treat inherited properties as groups or counters. A key
such as `__proto__` becomes an own data property on the returned object and is
covered by the runtime suite.

## Immutability and Cost

Input arrays and values are never mutated. Every object association creates a
new shallow object, and `group-by` also creates a fresh array when extending a
group. This preserves the immutable object contract but can make indexing
quadratic in the number of distinct keys or values in one group. Optimization
remains contingent on measured workloads and must preserve the same observable
semantics.

## Application Integration

The Org React application constructs `articles-by-slug` once when its module is
evaluated. Hash changes now perform a direct property lookup and retain the
first published article as the fallback. Article rendering, navigation, and
the generated UI are otherwise unchanged.

## Acceptance Evidence

- The object runtime fixture verifies duplicate replacement, stable group
  order, counts, empty input, and all fourteen library exports.
- Direct JavaScript calls verify own-property behavior for `__proto__` keys.
- ERT proves dependency-pruned `group-by` output includes `has?` and `assoc`
  while excluding the other indexing functions.
- The seed and self-hosted compilers emit byte-identical `object.eli` modules at
  the reproducible fixed point.
- The Org Vite production bundle retains `object.eli` in its source map and
  executes the prebuilt slug-index path.

## Next Slice

The next structural M6 gap is portable composition across local `.eli` modules.
Today a `defportable` closure is intentionally selected within one source file;
allowing portable standard modules to depend on other portable source modules
needs an explicit graph and capability contract rather than copied helpers.
