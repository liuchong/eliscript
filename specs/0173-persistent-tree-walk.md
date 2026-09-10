# 0173: Persistent Tree Walk and Rewrite

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0059 Collection Capability Protocols, 0066 Eliscript-authored
  Core Protocol Surface, 0068 Immutable Metadata Semantics, 0166 Persistent
  Queue, 0168 Immutable Record Types

## Summary

Eliscript provides stack-safe traversal and rewriting of nested persistent
values. The `stdlib/core/walk.eli` module exports exactly:

```text
walk postwalk postwalk-replace prewalk prewalk-replace
```

The module is written in Eliscript, emits ordinary ESM, and has no framework,
filesystem, process, or ambient host dependency.

## Tree Boundary

Persistent List, Vector, Queue, Map, Record, and Set values are tree branches.
List, Vector, Queue, and Set members are ordered children. Map and Record keys
and values are children in key-then-value iteration order. Map entry wrappers
are an implementation detail and are not additional visited nodes.

Scalars, functions, protocol values, and native JavaScript Array, Object, Map,
and Set containers are leaves. Native containers require explicit conversion
before recursive traversal; this preserves the language's persistent-value and
host-container boundary.

## One-level Walk

`walk` accepts an inner function, an outer function, and a form. It applies the
inner function once to every immediate child, reconstructs the recognized
branch, and applies the outer function once to the reconstructed value. For a
leaf, only the outer function runs.

If every transformed child is identical to its original child, reconstruction
returns the original branch by identity. Changed branches preserve their
concrete persistent type and metadata. Lists retain source order. Set
collisions collapse according to value semantics, and transformed Map key
collisions use the last visited value.

A Record remains a Record when transformed keys remain value-equal and only
values change. Changing a declared key lowers the result to a persistent Map
because the new shape no longer satisfies the declared Record layout.

## Recursive Traversal

`prewalk` invokes the transform before descending into a node. It traverses a
recognized persistent branch returned by that transform, but does not invoke
the transform twice on the same position.

`postwalk` transforms children before invoking the transform on the rebuilt
parent. A branch returned by the post-order transform is not traversed again.

Both operations use an explicit traversal stack rather than the JavaScript
call stack. Working memory is proportional to active depth plus the immediate
children retained by active frames. Deep, narrow persistent trees therefore do
not fail with host stack overflow.

## Replacement

`prewalk-replace` and `postwalk-replace` accept a persistent Map or Record of
replacement keys and values. Presence is tested separately from lookup, so a
mapped `nil`, `undefined`, or `false` value remains an intentional replacement.
Pre-order replacement happens before descent; post-order replacement happens
after child reconstruction.

Invalid callback values and non-Map replacement tables throw stable
`TypeError` messages before traversal begins.

## Acceptance Criteria

- **PTW-01:** The module exports exactly the five documented operations and is
  included in the generated library API.
- **PTW-02:** Traversal recognizes every persistent List, Vector, Queue, Map,
  Record, and Set branch while keeping native host containers opaque.
- **PTW-03:** One-level, pre-order, and post-order callback order is stable and
  transformations rebuild the expected nested value.
- **PTW-04:** Unchanged child identity returns the original branch; changed
  branches retain order, concrete type where valid, and metadata.
- **PTW-05:** Replacement distinguishes absence from nullish and false mapped
  values and preserves the documented pre-order and post-order behavior.
- **PTW-06:** A persistent tree at least 10,000 levels deep completes without
  host call-stack exhaustion.
- **PTW-07:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same report under direct local validation.
