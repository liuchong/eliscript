# 0027: Portable Data Indexing

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0026 Portable Immutable Object Library

## Summary

The `data.eli` library turns ordered values into keyed lookup, grouping, and
count objects. It composes with immutable primitives from `object.eli` and adds
no host capability of its own.

```elisp
(import "../../stdlib/data.eli" index-by group-by count-by)

(index-by (lambda (article) (get article :slug)) articles)
```

All three functions are `defportable`, use the existing immutable object
primitives through `import-portable`, and add no runtime capability. The graph
contract is specified in
[0028-portable-module-composition.md](0028-portable-module-composition.md).

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

## Host Integration Boundary

The data and object modules compile as one portable project graph. Application
code may use the resulting index, group, and count objects, but application
behavior is utility validation and does not define or advance this core
contract.

## Compatibility

The three exported function names, one key-function call per input value,
left-to-right traversal, right-biased indexing, stable group order, own-property
safety, and input immutability are stable. The ordinary Object and Array result
categories remain an explicit compatibility layer distinct from protocol-driven
persistent collection algorithms.

## Acceptance Evidence

- The object/data runtime fixture verifies duplicate replacement, stable group
  order, counts, empty input, and both modules' exports.
- Direct JavaScript calls verify own-property behavior for `__proto__` keys.
- ERT proves dependency-pruned `group-by` output includes `has?` and `assoc`
  while excluding the other indexing functions.
- The seed and self-hosted compilers emit byte-identical `object.eli` modules at
  the reproducible fixed point.
- A four-module project build retains data and object sources in their Source
  Maps and executes indexing and grouping under Bun and Node.

## Composition Update

The structural follow-up is implemented: these operations now live in
`data.eli` and depend on `assoc` and `has?` from `object.eli` without copying
them. Project-level portable builds prove and prune that local source graph.

## Runtime Continuation

This Object-backed portable API remains supported for compiler and historical
application use. Value-semantic persistent Map results, persistent Vector
groups, frequencies, external protocol sources, and transient-backed
construction are specified in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
