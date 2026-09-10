# 0157: Persistent Dispatch Hierarchies and Preferred Multimethods

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0053 Eliscript Persistent Vector, 0055 Eliscript-authored
  Persistent HAMT Map, 0056 Eliscript Persistent Set, 0057 Portable Value
  Semantics Core, 0156 Value-dispatched Multimethods

## Summary

This specification adds immutable derivation hierarchies and hierarchy-aware
multiple dispatch to the portable standard library. It extends exact
value-dispatched multimethods without changing their callable identity,
default dispatch semantics, or persistent method snapshots.

`hierarchy.eli` is an independent data and relation module. A multimethod owns
one current hierarchy snapshot, one persistent preference table, and an
internal derived-method cache. Framework adapters and application generators
are outside this contract.

## Persistent Hierarchies

`empty-hierarchy` creates an authenticated empty hierarchy. Hierarchy state is
held in a module-private weak registry, so copying visible properties or
constructing an ordinary object cannot forge a hierarchy identity.

`derive(hierarchy, child, parent)` returns a new hierarchy snapshot containing
one direct parent edge. Repeating an existing edge returns the original
identity. Self derivation and cycles are rejected. `underive` removes one
direct edge and rebuilds transitive closure from all remaining edges; removing
an absent edge also returns the original identity.

`parents`, `ancestors`, and `descendants` return persistent Set snapshots or nil
when no relation exists. The returned collections and every earlier hierarchy
identity remain unchanged after later derivation operations.

`is-a?` is true for value-equal inputs, direct or transitive ancestry, and
equal-length persistent Vectors whose corresponding elements all satisfy
`is-a?`. Hierarchy keys therefore use the same structural value semantics and
opaque host-identity behavior as Persistent Map and Set.

## Hierarchical Method Resolution

A new multimethod starts with an empty hierarchy. `multi-fn-hierarchy` returns
its current snapshot. `set-hierarchy!` validates and installs an external
snapshot, while `derive!` and `underive!` replace it with the result of the
corresponding immutable hierarchy operation. These operations return the
original callable multimethod identity.

Method resolution proceeds in this order:

1. perform exact method lookup through the persistent method table
2. consult the hierarchy-resolution cache
3. collect every non-default method key that is an ancestor match
4. select the sole candidate that dominates every other candidate
5. use the exact configured default method when no hierarchy candidate exists

One candidate dominates another when it derives from the other or is preferred
over it. If no candidate dominates all others, resolution throws
`ELI-MULTI-FN-AMBIGUOUS-METHOD`; registration order does not silently choose a
method. Exact lookup remains the fast path and does not scan the method table.

Successful hierarchy resolutions may be cached by dispatch value. Every
method, hierarchy, or preference mutation installs a fresh persistent root and
clears that cache. A selected method is captured before invocation, so mutation
inside a callback affects only later calls.

## Method Preferences

`prefer-method!` records a directed preference between two dispatch values.
Preferences are transitive: if A is preferred over B and B over C, A is
preferred over C. Self preferences, reverse preference cycles, and attempts to
prefer an ancestor over its existing descendant precedence are rejected.

`preferred-method?` queries the transitive relation. `preferences` returns the
current persistent Map of dispatch values to directly less-preferred persistent
Sets. Earlier roots remain immutable snapshots. `remove-preference!` removes
one direct edge, and `remove-all-preferences!` clears the table; both preserve
the callable multimethod identity.

Removing all methods does not remove hierarchy or preference state. Those
dimensions have explicit independent operations.

## Errors

Hierarchy-owned failures have kind `eliscript/hierarchy-error`, a stable code,
message, child, and parent. Multimethod-owned failures retain kind
`eliscript/multi-fn-error` and the fields defined by specification 0156.

| Code | Condition |
| --- | --- |
| `ELI-HIERARCHY-INVALID` | An operation did not receive an authenticated hierarchy |
| `ELI-HIERARCHY-SELF-DERIVATION` | A value was derived from itself |
| `ELI-HIERARCHY-CYCLE` | A new edge would make an ancestor its own descendant |
| `ELI-MULTI-FN-INVALID-HIERARCHY` | A multimethod received an invalid hierarchy |
| `ELI-MULTI-FN-SELF-PREFERENCE` | A method key was preferred over itself |
| `ELI-MULTI-FN-PREFERENCE-CONFLICT` | A preference contradicted existing precedence |
| `ELI-MULTI-FN-AMBIGUOUS-METHOD` | Multiple applicable methods lack one dominant candidate |

User dispatch and method exceptions retain their original identities and are
not wrapped by hierarchy-aware resolution.

## Acceptance Criteria

- **PDH-01:** Hierarchies are authenticated immutable identities with
  persistent direct, ancestor, and descendant relation snapshots.
- **PDH-02:** Derivation computes transitive closure, preserves duplicate-edge
  identity, and rejects self edges and cycles with structured codes.
- **PDH-03:** Underivation rebuilds closure from remaining direct edges without
  changing any prior hierarchy snapshot.
- **PDH-04:** `is-a?` supports value equality, transitive ancestry, and
  component-wise persistent Vector dispatch values.
- **PDH-05:** Exact methods retain precedence and the fast path; otherwise one
  dominant ancestor method is selected before exact default fallback.
- **PDH-06:** Unordered applicable methods produce deterministic ambiguity
  errors rather than depending on registration or map traversal order.
- **PDH-07:** Preferences are transitive, immutable snapshots; mutation returns
  the original multimethod and rejects self or reverse precedence.
- **PDH-08:** Method, hierarchy, and preference mutations invalidate derived
  dispatch cache entries while preserving exact dispatch behavior.
- **PDH-09:** Seed and self-hosted compilers emit byte-identical hierarchy and
  multimethod modules and Source Maps, and Bun and Node reports agree exactly.
- **PDH-10:** Public-surface, API-index, compatibility, conformance,
  documentation, strict byte compilation, and complete local core gates pass.
