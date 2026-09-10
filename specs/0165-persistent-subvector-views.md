# 0165: Persistent Subvector Views

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0047 Persistent Vector Trie Prototype,
  0053 Eliscript-authored Persistent Vector Trie,
  0059 Collection Capability Protocols and Reduction Foundation,
  0068 Immutable Metadata Semantics

## Summary

Eliscript adds `subvec`, an immutable random-access view over a contiguous
range of a persistent Vector. Creating a view is O(1): it stores the original
Vector plus start and end offsets, shares the complete trie and tail, and does
not traverse or copy source values.

The JavaScript runtime exports `subvec(vector, start, end?)` from
`runtime/core/vector.mjs`. The maintained language surface exports
`subvec` from `stdlib/core/collection.eli`.

## Range Semantics

`start` is inclusive and `end` is exclusive. Omitting `end`, or passing nil or
JavaScript `undefined`, uses the Vector count. Both bounds must be safe
integers satisfying `0 <= start <= end <= count`. Invalid bounds fail before
any traversal or allocation of persistent nodes.

Applying `subvec` to another subvector flattens both offsets onto the original
base Vector. It does not create a chain of views. A newly created view has nil
metadata; explicit metadata operations preserve metadata across subsequent
view updates.

## Vector Behavior

A subvector is a persistent Vector for classification, value equality,
hashing, metadata, and every applicable collection protocol. It supports:

```text
count nth lookup contains assoc conj empty peek pop seq rseq reduce reduce-kv
transient
```

Indexes are relative to the view. Association within the view updates the
corresponding source position through ordinary persistent path copying.
Association at the view count appends logically: it updates the source value
at the exclusive end when one exists, or appends to the source when the view
ends at the source count, then extends the view by one. No source value is ever
mutated.

Popping an empty view fails. Popping a non-empty view moves only its end offset;
the one-element case returns an empty persistent Vector with the same metadata.
Converting a view to a transient materializes only the visible range into a
fresh owner-token builder, because transient editing requires a contiguous
logical Vector independent of hidden source values.

## Complexity and Sharing

For source depth `d = O(log32 n)` and visible length `k`:

| Operation | Time | New persistent nodes |
| --- | --- | --- |
| `subvec`, nested `subvec`, count, peek, pop | O(1) | 0 |
| nth | O(d) | 0 |
| assoc within range | O(d) | one selected path |
| seq, rseq, reduce, reduce-kv | O(k * d) | 0 |
| transient conversion | O(k) construction | bounded trie paths |

The implementation keeps the base Vector's root and tail identities in the
view. A one-million-value fixture proves zero node visits and allocations at
view construction, complete source-node sharing, and exact selected-path
copying after an update.

## Host Boundary

`subvec` accepts only persistent Vector values. Native JavaScript Arrays stay
behind explicit interoperation and are never converted implicitly. The feature
introduces no framework, I/O, publishing, or host-global dependency.

## Acceptance Criteria

- **PSV-01:** Both runtime and language surfaces export `subvec` with matching
  optional-end and range validation behavior.
- **PSV-02:** View construction and nested-view flattening perform no source
  traversal and allocate no persistent trie or tail nodes.
- **PSV-03:** Subvectors satisfy persistent Vector classification, collection
  protocols, value equality, hashing, metadata, and iteration semantics.
- **PSV-04:** Relative lookup, association, append, pop, reduction, and reverse
  traversal preserve order and never mutate retained source values.
- **PSV-05:** Transient conversion contains only visible values, preserves
  metadata, and retains ordinary owner-token invalidation semantics.
- **PSV-06:** A million-value fixture proves complete node sharing before
  update and exactly one copied trie path after an internal association.
- **PSV-07:** Seed and self-hosted compilers emit byte-identical wrapper ESM and
  Source Maps, with matching local Bun and Node results.
