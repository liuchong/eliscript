# 0081: Protocol-driven Text and Keyed Object Algorithms

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0060 Collection Construction Protocols,
  0061 Composable Transducers and Protocol-driven Into,
  0062 Owner-token Transient Collections,
  0080 Canonical Generated Protocol Runtime

## Summary

This specification closes the text and keyed-object portion of the P2 core
algorithm migration. `stdlib/core/text.eli` and `stdlib/core/object.eli` are
the maintained algorithm sources. Their checked-in ESM and Source Maps are
generated into `runtime/core/*-impl.mjs`, while small camel-case JavaScript
facades preserve a conventional host API without duplicating policy.

The earlier `stdlib/text.eli` and `stdlib/object.eli` modules remain portable,
dependency-prunable worker subsets. They are not a second optimized runtime.
The new core modules consume protocol capabilities, work with persistent and
native values, and accept external immutable implementations without concrete
representation checks.

## Native Protocol Adapters

Primitive String values implement `ICounted`, `IEmptyable`, `ILookup`,
`IIndexed`, `ISeqable`, and `IReduce` through the explicit `string` host
category. Count, indexing, traversal, and reduction all use ECMAScript UTF-16
code units. They therefore agree for non-BMP text instead of mixing string
iteration by code point with indexing by code unit.

Ordinary objects whose exact prototype is the current realm's
`Object.prototype` implement the keyed collection capabilities. Enumeration
uses own enumerable string keys. Lookup distinguishes stored `undefined` from
absence, association returns a fresh object, and `__proto__` is created as a
safe own data property. Symbol association is rejected and Symbol lookup is
outside the keyed domain. Class instances, custom prototypes, null-prototype
objects, and cross-realm objects do not acquire this adapter accidentally.

No adapter modifies String or Object prototypes. Native non-empty sequence
views are replayable and observe later host mutation, matching Array, Map, and
Set adapter behavior.

## Text Algorithms

The core text module provides the thirteen established operations: empty,
slice, prefix/suffix checks, contains, strip, whitespace, trim, blank, join,
and repeat. Indexed algorithms call only `ICounted` and `IIndexed`; `join`
uses `IReduce`. An external text view can therefore reuse slicing by
implementing only the required capabilities.

Text index semantics remain UTF-16 and end-exclusive. The portable text module
retains the same observable boundary for worker closure selection.

## Keyed Algorithms

The core object module provides keys, presence, association, dissociation,
merge, value mapping/filtering, pick, omit, update, and value-semantic key-list
membership. These functions operate on the orthogonal collection protocols:

- traversal through `IReduce`
- empty result construction through `IEmptyable`
- immutable entry construction through `IConj` and `into`
- lookup and association through `ILookup` and `IAssociative`
- key comparison through `equalValues`

Mapping, filtering, key collection, pick, omit, and dissociation use
transducer-backed `into`. Persistent Map targets therefore select owner-token
transient construction automatically, while ordinary Object and Map targets
retain immutable-copy semantics. A custom keyed value that implements only
the public capabilities reuses the same algorithms.

## Reproducibility and Hosts

`generate:runtime-text`, `generate:runtime-object`, and the aggregate
`generate:runtime-core` command regenerate the production artifacts. Tests
compare seed and self-hosted ESM and Source Maps byte for byte, compare those
bytes with the committed artifacts, and execute every combination under Bun
and Node. A 50,000-entry persistent Map transformation compares transient
allocation volume with a persistent-association reference path.

## Architecture Boundary

Text and keyed algorithms are language runtime and standard-library work.
They have no dependency on UI frameworks, bundlers, development servers, or
publishing systems. Such integrations may consume the public ESM modules only
as application-level evidence and cannot define this contract or its exit
criteria.

## Compatibility

The String and ordinary-Object adapters, thirteen text operations, eleven
keyed-object operations, UTF-16 indexing, immutable update behavior, and
protocol-based extension boundary are stable. Incompatible semantic or export
changes require the compatibility process.

## Acceptance Criteria

- **PTO-01:** String count, lookup, indexing, sequence, and reduction agree on
  UTF-16 code-unit semantics, including non-BMP input.
- **PTO-02:** Ordinary Object adapters are exact-type, own-string-keyed,
  immutable, `undefined` preserving, and prototype safe.
- **PTO-03:** String and Object prototypes remain unchanged, and class or
  cross-realm values do not inherit exact Object behavior.
- **PTO-04:** All thirteen core text algorithms are authored in Eliscript and
  use protocol operations for indexed or reducible inputs.
- **PTO-05:** All eleven keyed algorithms are authored in Eliscript without
  concrete Object, Map, or persistent Map type branches.
- **PTO-06:** Persistent, native, and external capability implementations reuse
  the same keyed algorithms.
- **PTO-07:** Keyed transformations preserve stored `undefined`, value-semantic
  keys, source immutability, and safe `__proto__` association.
- **PTO-08:** Persistent Map transforms select transient construction and use
  less than one third of the persistent reference node allocations.
- **PTO-09:** Seed and self-hosted ESM and Source Maps are byte-identical for
  both modules.
- **PTO-10:** Generated seed artifacts are byte-identical to committed runtime
  implementations after source-path normalization for Source Maps.
- **PTO-11:** Bun and Node produce identical reports for every seed,
  self-hosted, and committed text/object artifact combination.
- **PTO-12:** Framework and bundler integrations remain optional application
  evidence and absent from core dependencies and acceptance conditions.
