# 0174: Persistent Zipper Navigation and Editing

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0059 Collection Capability Protocols, 0068 Immutable Metadata
  Semantics, 0163 Replayable Sequence Head and Tail Views, 0168 Immutable
  Record Types, 0173 Persistent Tree Walk and Rewrite

## Summary

Eliscript provides immutable locations for navigation and local editing of
hierarchical values. `stdlib/core/zipper.eli` exports exactly:

```text
append-child branch? children down edit end? insert-child insert-left
insert-right left leftmost lefts list-zipper make-node next node path prev
remove replace right rightmost rights root up vector-zipper zipper zipper?
```

The module is written in Eliscript, emits ordinary ESM, and has no framework,
filesystem, process, or ambient host dependency.

## Location Model

A location is an immutable persistent Vector carrying private constructor
functions in immutable metadata. Its node may be any Eliscript or host value,
including `nil`, `false`, or `undefined`. Its path contains persistent left and
right sibling collections, the parent path, the original ancestor nodes, and a
change marker. Existing locations remain valid after navigation or editing.

`zipper` accepts a branch predicate, a child reader, a node builder, and a root
node. The child reader may return any finite reducible collection; the node
builder always receives a persistent Vector snapshot. `vector-zipper` and
`list-zipper` provide metadata-preserving constructors for nested persistent
Vectors and Lists. Native JavaScript containers are not implicitly branches.

## Navigation

`node`, `branch?`, `children`, `path`, `lefts`, and `rights` inspect a location.
`down`, `up`, `left`, and `right` return an adjacent location or `nil` when the
move is unavailable. `leftmost` and `rightmost` return the extreme sibling or
the original location when already at the edge.

`next` and `prev` follow depth-first pre-order. Advancing beyond the final node
returns a stable end location recognized by `end?`; advancing an end location
returns the same location. Moving backward from the end returns the final tree
node. Moving backward from the root returns `nil`.

`root` walks upward iteratively and returns the complete root with every edit
applied. Calling `root` on the end location returns its already rebuilt root.

## Editing

`replace` changes the current node. `edit` invokes a callback with the current
node followed by supplied arguments and replaces the node with its result.
`insert-left` and `insert-right` add siblings without moving. `insert-child`
and `append-child` rebuild a branch with a new first or last child.

`remove` deletes the current node and returns the location that precedes it in
depth-first order. When a left sibling exists, the result descends to that
sibling's deepest rightmost descendant. Otherwise, the result is the rebuilt
parent. Root sibling insertion, root removal, leaf child access, and editing
an end location fail with stable `TypeError` diagnostics.

Navigation, upward reconstruction, depth-first enumeration, and removal use
explicit loops rather than the JavaScript call stack. Working state is bounded
by the persistent path and immediate sibling collections.

## Acceptance Criteria

- **PZN-01:** The generated library API exposes exactly the 28 documented
  operations.
- **PZN-02:** Generic, Vector, and List constructors preserve immutable
  locations and rebuild branch metadata.
- **PZN-03:** Parent, child, sibling, extreme sibling, path, and child
  inspection return stable persistent values without mutating prior locations.
- **PZN-04:** Depth-first `next`, `prev`, end-location, and root behavior cover
  every node exactly once in documented order.
- **PZN-05:** Replace, callback edit, sibling insertion, child insertion, and
  removal rebuild the expected root while preserving unaffected structure.
- **PZN-06:** Nodes containing `nil`, `false`, or `undefined` retain their exact
  value through navigation and root reconstruction.
- **PZN-07:** Navigation and changed-root reconstruction complete for a tree at
  least 10,000 levels deep without host call-stack exhaustion.
- **PZN-08:** Invalid callbacks, locations, moves, and edits produce stable
  diagnostics before partial mutation.
- **PZN-09:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same report under direct local validation.
