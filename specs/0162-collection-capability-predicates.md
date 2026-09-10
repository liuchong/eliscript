# 0162: Collection Capability Predicates and Empty Value Semantics

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

Eliscript exposes protocol-based collection capability predicates and generic
empty-value operations through `stdlib/core/collection.eli`. Programs can ask
which operations a value supports without dispatching those operations or
depending on a concrete persistent or JavaScript collection type.

The added public API is:

```text
associative? counted? empty? indexed? not-empty reducible? reversible? seqable?
```

## Capability Predicates

`counted?`, `indexed?`, `seqable?`, `reducible?`, `reversible?`, and
`associative?` report whether the value implements the complete corresponding
protocol. Inspection does not invoke a protocol operation and has no collection
side effects. A partial extension is not a complete capability: in particular,
a membership-only Set extension does not satisfy `associative?`.

The predicates recognize persistent collections, exact registered host types,
host categories, and external protocol extensions through the same open
dispatch registry used by ordinary collection operations. Unsupported scalar
and function values return false rather than throwing.

## Empty Values

`empty?` dispatches `ISeqable/seq` and returns true exactly when the result is
`nil`. It therefore works for nil, persistent collections, supported native
collections, strings, and external sequence implementations without assuming a
count operation. Unsupported values retain the normal protocol dispatch error.

`not-empty` returns nil for an empty seqable value. For a non-empty value it
returns the original input by identity, not its sequence view or a copy. This
preserves collection type, metadata, and structural identity.

## Host Boundary And Complexity

Capability predicates inspect protocol tables and direct slots only. `empty?`
and `not-empty` inherit the cost and error behavior of one `seq` dispatch. They
perform no iteration, mutation, host I/O, framework integration, or implicit
conversion.

## Acceptance Criteria

- **CCP-01:** The core collection module exports all eight documented APIs and
  includes them in the generated public and library API inventories.
- **CCP-02:** Every capability predicate reports complete protocol support and
  returns false for unsupported scalar and function values without dispatching
  an operation.
- **CCP-03:** Persistent Vector and Map values expose their documented
  capabilities while incomplete protocol families do not produce false
  positives.
- **CCP-04:** `empty?` uses sequence semantics for nil, persistent collections,
  native collections, strings, and external extensions.
- **CCP-05:** `not-empty` returns nil for empty values and preserves the exact
  identity of every non-empty value.
- **CCP-06:** Unsupported values preserve the structured collection protocol
  dispatch error for `empty?` and `not-empty`.
- **CCP-07:** The Eliscript-authored wrappers compile reproducibly and execute
  with matching observable behavior under local Bun and Node hosts.
