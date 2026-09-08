# 0056: Eliscript-authored Persistent Map-backed Set

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0055 Eliscript-authored Persistent HAMT Map

## Summary

This specification completes the first portable implementation of the four
core persistent collection representations. `stdlib/persistent-set.eli`
implements an immutable value-semantic Set as a thin layer over the portable
HAMT Map from 0055. It adds membership, insertion, removal, reduction, array
conversion, union, intersection, difference, subset, superset, disjointness,
and equality without duplicating any trie node or hash-routing algorithm.

The Set module uses one verified `import-portable` edge to the Map module. It
contains no JavaScript import, host API, or mutation form. Seed and self-hosted
compilers emit byte-identical Set and Map ESM and Source Maps, and both output
pairs execute equivalently under Bun and Node.js.

Hash and key equality are explicit parameters of this low-level constructor.
All versions preserve the same function identities, and binary Set operations
reject incompatible policies deterministically. Ordinary Sets now use the
shared constructors from
[0057-portable-value-semantics.md](0057-portable-value-semantics.md).

## Public Surface

The stable module exports:

- `empty-persistent-set(hash-function, key-equal-function)`
- `persistent-set?(value)`
- `persistent-set-compatible?(left, right)`
- `persistent-set-count(set)`
- `persistent-set-meta(set)`
- `persistent-set-with-meta(set, metadata)`
- `persistent-set-empty?(set)`
- `persistent-set-has?(set, value)`
- `persistent-set-conj(set, value)`
- `persistent-set-disj(set, value)`
- `persistent-set-reduce(function, initial, set)`
- `persistent-set-to-array(set)`
- `persistent-set-from-array(hash-function, key-equal-function, values)`
- `persistent-set-union(left, right)`
- `persistent-set-intersection(left, right)`
- `persistent-set-difference(left, right)`
- `persistent-set-subset?(left, right)`
- `persistent-set-superset?(left, right)`
- `persistent-set-disjoint?(left, right)`
- `persistent-set-equal?(left, right)`

`conj` returns the receiver when the member already exists. `disj` returns the
receiver when the member is absent. Reduction calls
`function(accumulator, member)` in underlying HAMT traversal order; neither
insertion order nor sorted order is promised.

## Representation and Map Reuse

A Set value contains:

```text
kind, map, hash-function, key-equal-function, metadata
```

Every member is a key in `map`; all values use one private presence sentinel.
The Map's value equality function always accepts two sentinels, so reinserting
an existing key reaches the Map's exact no-op identity path.

Set code never inspects bitmap positions, array-node slots, collision entries,
or hash fragments. Association, removal, sparse/dense conversion, full-hash
collision resolution, and structural sharing remain solely owned by 0055.
This ownership is enforced by the module dependency rather than copied source.

The representation is private. Host freezing is not a portable primitive, so
callers must not mutate the wrapper or its Map. Tests may inspect the Map root
to prove reuse and path sharing; application code uses only the stable public
functions.

## Policy Compatibility

Two Sets are compatible only when both their `hash-function` and
`key-equal-function` are identical callable values. This is intentionally
stricter than guessing that two separately created functions have equivalent
behavior.

For incompatible Sets:

- union, intersection, and difference return `nil`
- subset, superset, disjointness, and equality return false

The common value constructors from 0057 remove this constructor-level policy
distinction for ordinary Eliscript values. Explicit low-level policy mismatch
still fails deterministically, preventing asymmetric equality or membership
errors.

## Set Algebra

All binary algebra preserves both inputs:

- **union** starts from the larger Set and inserts members from the smaller
  Set, minimizing expected changed paths
- **intersection** traverses the smaller Set and probes the larger, then
  returns the left receiver when every left member survives
- **difference** traverses the right Set and removes its members from the left
- **subset** first rejects a larger candidate, then probes every left member
- **superset** reverses subset arguments
- **disjointness** traverses the smaller Set and probes the larger
- **equality** requires compatibility, equal count, and subset membership

No operation converts an input to a native JavaScript Set or array internally.
No-op union, intersection, and difference paths preserve receiver identity
when the implemented result is exactly the receiver.

## Complexity and Sharing

For `n` members, `m` members in a second Set, and bounded HAMT depth `d`:

| Operation | Expected time | New trie items |
| --- | --- | --- |
| count, empty? | O(1) | 0 |
| has? | O(d) | 0 |
| conj, disj | O(d) | O(d) on change, 0 on no-op |
| reduce | O(n) | 0 |
| union | O(min(n,m) * d) | changed paths only |
| intersection | O(min(n,m) * d) | retained-member paths |
| difference | O(m * d) | changed paths only |
| subset, superset, disjoint?, equal? | O(min(n,m) * d) | 0 |

Complete-hash collisions inherit the Map's O(c) equality scan for a collision
group of size `c`.

The million-member test inserts a distinct key with the same complete hash as
an existing member. The selected entry becomes a collision node while every
item outside that root-to-entry path is shared by identity. Removing the new
member preserves the source Set and restores observable membership and count.

`persistent-set-to-array` is an explicit compatibility boundary. Repeated
portable immutable-array construction may copy growing intermediate arrays,
so conversion is excluded from million-member complexity evidence. A future
transient builder can optimize conversion without changing Set semantics.

## P1 Role

Portable Eliscript now owns one complete implementation for each core
persistent layout:

- linked List
- indexed 32-way Vector trie
- associative HAMT Map
- Map-backed Set

The portable value layer in
[0057-portable-value-semantics.md](0057-portable-value-semantics.md) supplies
common equality/hashing, ordinary Map/Set constructors, and cross-family
properties. Open protocols, immutable metadata, printer/reader round trips,
and persistent literal integration are separately versioned layers. Metadata
propagation through Set algebra is defined by
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md).

## Emacs Reinvestment

Persistent Sets support dependency frontiers, changed-file membership,
symbol indexes, graph reachability, duplicate elimination, and incremental
invalidation inside a warm JavaScript worker. Old generations remain available
for verification or stale-result rejection while a new result shares all
untouched HAMT branches.

The acceleration API will expose these structures through the versioned value
codec rather than leaking wrapper objects. Real editor acceptance still
requires equivalent Emacs Lisp results, end-to-end crossover measurements,
cancellation, generation guards, and transactional application.

## Compatibility

This module and specification are stable in Compatibility Baseline 2. Public
exports, constructor compatibility policy, failure values, Map reuse, set
algebra, traversal contract, and structural bounds cannot change incompatibly
without a superseding specification and migration fixture.

The default suite retains seed/self-hosted byte parity, Source Maps, generated
value-key histories, algebra, collisions, exact 32/24 transitions, and
one-million-member path sharing. The public multi-entry build test also
compiles the complete persistent value library, verifies every generated
Source Map, and executes value-semantic Set membership and deduplication
directly under Bun and Node.

## Acceptance Criteria

- **EPS-01:** The implementation is one portable `.eli` module that imports
  only the portable Map API and duplicates no HAMT nodes or routing logic.
- **EPS-02:** Seed and self-hosted compilers emit byte-identical Set and Map
  ESM and Source Maps.
- **EPS-03:** Bun and Node.js produce identical 100,000-member reports from
  both compiler output pairs.
- **EPS-04:** Twenty thousand generated value-key updates agree with retained
  immutable reference models.
- **EPS-05:** Union, intersection, difference, subset, superset, disjointness,
  equality, conversion, and incompatible-policy semantics match this spec.
- **EPS-06:** Complete-hash collisions and inherited 32/24 sparse/dense
  transitions remain correct through the Set API.
- **EPS-07:** A one-million-member collision insertion shares every trie item
  outside its selected path; removal preserves the source Set.
- **EPS-08:** Public-surface, conformance, compatibility, build, documentation,
  and default-test registries include the module and all evidence.
