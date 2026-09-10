# 0175: Persistent Sorted Collections and Range Queries

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0057 Portable Value Semantics, 0058 Open Protocol Dispatch,
  0068 Immutable Metadata Semantics, 0145 Language Value Equality, 0153
  Key/Value Reduction Protocol, 0155 Reversible Collection Traversal

## Summary

Eliscript provides immutable ordered Map and Set values backed by a
structurally shared AVL tree. `stdlib/core/sorted.eli` exports exactly:

```text
comparator empty-sorted-map empty-sorted-map-by empty-sorted-set
empty-sorted-set-by rsubseq sorted-map sorted-map-by sorted-map? sorted-seq
sorted-seq-from sorted-set sorted-set-by sorted-set? sorted? subseq
```

The representation and protocol boundary live in `runtime/core/sorted.mjs`.
The language-facing module is ordinary Eliscript that compiles to host-neutral
ESM without a framework, filesystem, process, or ambient platform dependency.

## Persistent Representation

Every tree node is frozen and stores one key/value pair, two child references,
its subtree size, and its height. Association and removal copy only the search
path and nodes needed by AVL rotations. Unaffected subtrees retain identity.
The root height remains logarithmic for ascending, descending, and randomized
updates; recursive implementation depth is therefore logarithmic rather than
input-sized.

Default collections use `compare-values`. `sorted-map-by` and `sorted-set-by`
accept either a numeric three-way comparator or the boolean comparator form
accepted by the existing `comparator` adapter. Comparator equality determines
key identity inside one sorted collection. Re-association retains the original
canonical key and changes only its value; Set lookup returns that canonical
stored value.

`empty` preserves both the comparator and metadata. Sorted Maps implement
count, empty, lookup, associative, map removal, sequence, reduction, key/value
reduction, and reversible protocols. Sorted Sets implement the corresponding
set operations. `map?`, `set?`, and `collection?` include both hash-backed and
sorted persistent values.

Hash-backed and sorted collections compare equal only when every logical key
or Set value is equal under Eliscript value semantics, not merely equivalent
under a custom comparator. Equal Hash and Sorted values produce the same
unordered value hash. Native JavaScript Map and Set values retain host identity
semantics.

## Ordered Queries

`sorted-seq` returns ascending values by default and descending values when its
direction argument is false. Map sequences contain frozen key/value pairs;
Set sequences contain canonical stored values. `sorted-seq-from` begins at a
key in either direction and independently controls whether an equal key is
included.

`subseq` and `rsubseq` accept one test/key bound or a lower then upper pair.
Bound tests are the unqualified keywords or strings `:<`, `:<=`, `:>`, and
`:>=`. Two-bound queries require a lower `:>`/`:>=` bound followed by an upper
`:<`/`:<=` bound. Traversal seeks to the starting boundary in logarithmic work
and then performs one ordered pass over the returned values. Empty ranges
return `nil`.

## Explicit Boundaries

Version 1 does not add sorted literal syntax, transient sorted builders, worker
transport tags, or canonical data-text tags that preserve comparator identity.
Canonical printing uses ordinary Map and Set notation and therefore describes
logical content, not the comparator. Those capabilities require separate
versioned contracts rather than implicit degradation.

## Acceptance Criteria

- **PSC-01:** The generated library API exposes exactly the 16 documented
  operations.
- **PSC-02:** Map and Set association and removal preserve prior values, AVL
  balance, logarithmic height, and unaffected subtree identity.
- **PSC-03:** Default and custom comparators determine deterministic ascending
  and descending order while retaining canonical comparator-equivalent keys.
- **PSC-04:** Sorted values implement their complete collection, reversible,
  value, hash, and metadata protocol surfaces.
- **PSC-05:** Equal Hash and Sorted Maps/Sets compare symmetrically and produce
  equal hashes; comparator-only key equivalence cannot forge value equality.
- **PSC-06:** `sorted-seq`, `sorted-seq-from`, `subseq`, and `rsubseq` honor
  direction and inclusive or exclusive boundaries for Maps and Sets.
- **PSC-07:** Missing, `nil`, false, and undefined values remain distinguishable
  from present keys and Set members.
- **PSC-08:** At least 20,000 deterministic randomized operations agree with a
  mutable reference model, and every sampled tree satisfies AVL invariants.
- **PSC-09:** A 100,000-entry ascending build has logarithmic height; one value
  replacement performs logarithmic comparisons and allocations while sharing
  all unaffected nodes.
- **PSC-10:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution produce the same report under direct local validation.
