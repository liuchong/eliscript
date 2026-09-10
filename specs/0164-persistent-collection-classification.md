# 0164: Persistent Collection Classification and Bounded Inspection

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0057 Portable Value Semantics Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0066 Eliscript-authored Core Protocol Surface and Algorithms,
  0151 Replayable Bounded and Unbounded Sequence Sources

## Summary

Eliscript adds explicit predicates for its persistent collection categories,
bounded cardinality inspection, and value-semantic distinctness. The maintained
Eliscript collection module exports:

```text
bounded-count collection? distinct? list? map? sequence? sequential? set?
vector?
```

The JavaScript runtime facade exports equivalent camel-cased operations. These
operations extend the language's collection vocabulary without weakening the
existing protocol and host-container boundary.

## Collection Categories

`collection?` recognizes persistent Lists, Vectors, Maps, Sets, and logical
`SequenceView` values. `sequential?` recognizes persistent Lists, persistent
Vectors, and sequence views. `sequence?` recognizes persistent Lists and
sequence views; a Vector is sequential but is not itself a sequence.

`list?`, `vector?`, `map?`, and `set?` identify only their exact persistent
language categories. Native JavaScript Arrays, Maps, Sets, plain objects, and
strings are not persistent Eliscript collections. They remain available
through explicit host interoperation and may independently satisfy open
collection capabilities such as `counted?` or `seqable?`.

## Bounded Count

`bounded-count` accepts a non-negative safe-integer limit and a sequenceable
value. It returns the smaller of the limit and the source cardinality while
consuming at most the requested number of values. This contract applies to
known finite, unknown finite, and explicitly unbounded sequence views.

A zero limit returns zero without normalizing or touching the source. Invalid
limits fail before source normalization. When traversal stops at the limit or
throws, a source iterator with a `return` method is closed exactly once.

## Distinct Values

`distinct?` accepts any number of values and returns true exactly when no two
arguments are equal under Eliscript value semantics. Structurally equal
persistent values are duplicates even when they have different identities.
Opaque host objects retain process-local identity equality.

The implementation incrementally builds a persistent value Set and terminates
on the first duplicate. It does not serialize, stringify, or mutate any input.

## Host Boundary

Classification is intentionally narrower than protocol support. Protocols
describe capabilities that persistent and native values may share;
classification describes stable language value categories. No application
framework, host I/O, implicit native conversion, or shared mutation participates
in these operations.

## Acceptance Criteria

- **PCI-01:** Both public language surfaces export all nine documented
  operations with matching argument and result behavior.
- **PCI-02:** Exact category predicates recognize persistent language values
  and reject corresponding native JavaScript containers.
- **PCI-03:** `sequential?` includes Lists, Vectors, and sequence views while
  `sequence?` excludes Vectors.
- **PCI-04:** Capability predicates remain independent from persistent
  collection classification.
- **PCI-05:** `bounded-count` returns `min(limit, cardinality)` and consumes no
  more than `limit` values from finite, unknown, or unbounded sources.
- **PCI-06:** Zero and invalid limits do not touch the source; early stop and
  exceptional traversal close closable iterators.
- **PCI-07:** `distinct?` uses persistent value equality, preserves host object
  identity semantics, and stops at the first duplicate.
- **PCI-08:** Eliscript-authored wrappers compile reproducibly and execute with
  matching observable results under local Bun and Node hosts.
