# 0026: Portable Immutable Object Library

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0003 Implemented Core Language,
  0021 Portable Functions and Dependency Closure,
  0024 Multi-file Project Builds

## Summary

`stdlib/object.eli` provides immutable operations for ordinary JavaScript
objects. Three small portable core primitives expose the behavior that cannot
be expressed by the previous language subset: own-key enumeration, own-property
testing, and a shallow immutable update. All policy and iteration remain
Eliscript library code.

```elisp
(import "../../stdlib/object.eli" assoc merge pick)

(assoc (object :name "Eliscript") :runtime "JavaScript")
```

The module works through ordinary ESM imports, Vite source imports, closure-only
worker builds, and both compiler generations.

## Core Primitives

- `(object-keys value)` returns the own enumerable string keys of `value` in
  ECMAScript enumeration order. `nil` returns an empty array.
- `(object-has? value key)` tests only own properties. It does not report a
  property inherited through the prototype chain, and `nil` returns false.
- `(object-assoc value key next)` creates a shallow ordinary-object copy and
  writes the computed key on that copy. It never mutates `value`; `nil` is
  treated as an empty object.

These forms lower through the existing generic `intrinsic` IR node. The seed
and self-hosted emitters use `Object.keys`, `Object.prototype.hasOwnProperty`,
and object spread with a computed property. The supported data model is plain,
string-keyed objects; symbols, descriptors, prototypes, and non-enumerable
properties remain explicit host-interoperability concerns.

## Library Operations

The module exports eleven `defportable` functions:

- `keys(object)`, `has?(object, key)`, and `assoc(object, key, value)` expose
  the portable primitive semantics
- `key-in?(key, keys)` performs a literal key-list membership scan
- `dissoc(object, key)` returns a copy without one key
- `merge(left, right)` returns a fresh, right-biased shallow merge
- `map-values(function, object)` transforms every value
- `filter-values(predicate, object)` retains matching values
- `pick(object, wanted-keys)` copies existing keys in requested order
- `omit(object, omitted-keys)` copies keys not present in the omitted list
- `update(object, key, function)` applies a function to the current value and
  associates the result

Every transforming operation returns an ordinary object, including empty
results. Inputs are never passed to `put`. Reads follow the core `get` contract,
so nullish property values are observed as `nil` by transforming callbacks.

## Ordering and Cost

Enumeration follows ECMAScript own-key ordering. `pick` follows the requested
key order; the remaining scans follow source-object order, with `merge`
retaining left-side positions while replacing duplicate values from the right.

The implementation favors a small portable semantic base over hidden host
mutation. Repeated immutable association can copy the growing result, making
whole-object transforms quadratic in property count. A future internal builder
may optimize measured large-object workloads, but it must preserve these public
semantics and must not expose mutation to callers.

## Application Integration

The command-line standard-library example imports sequence, text, and object
source modules. The pure Emacs project builder emits a four-module ESM graph,
rewrites every local import, and writes adjacent source maps.

The Org React site imports `assoc` from `object.eli` for browser scroll options.
Its slug index comes from `data.eli`, which composes with this module through
the contract in
[0028-portable-module-composition.md](0028-portable-module-composition.md).

## Acceptance Evidence

- ERT checks exact primitive emission, arity failures, portable analysis, and
  dependency-pruned compilation of `omit`.
- A Bun test executes all eleven exports, empty and `nil` boundaries,
  right-biased merging, own-property behavior, input immutability, and source
  maps.
- Shared analyzer and IR fixtures exercise all three primitives through both
  compiler implementations.
- The compiler fixed-point test compares complete seed and self-hosted output
  for `object.eli`.
- Project CLI and the Org React Vite production build use the library through
  real `.eli` imports.

## Next Slice

Application-facing data indexing is implemented in
[0027-portable-data-indexing.md](0027-portable-data-indexing.md). Any deeper
object path API should still be driven by a concrete React, Org publishing, or
Emacs worker workload rather than added speculatively.
