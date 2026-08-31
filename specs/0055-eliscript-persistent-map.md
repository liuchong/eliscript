# 0055: Eliscript-authored Persistent HAMT Map

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing,
  0051 HAMT Layout Benchmark and Threshold Selection,
  0052 Portable 32-bit Integer Operations

## Summary

This specification moves the complete persistent Map algorithm from the
JavaScript prototype layer into portable Eliscript. `stdlib/persistent-map.eli`
implements a 32-way hash array mapped trie with sparse bitmap nodes, dense
array nodes, full-hash collision nodes, immutable entries, path-copying
updates, removal compaction, reduction, and explicit entry conversion.

The module imports no JavaScript runtime collection, uses no host API, and
contains no mutation form. Seed and self-hosted compilers emit byte-identical
ESM and Source Maps. Both compiler outputs produce the same 100,000-key report
under Bun and Node.js, while the Bun structural suite exercises one million
keys without collection-size copying.

Map construction receives hash, key-equality, and value-equality functions
explicitly. This keeps the trie algorithm independent from the still-evolving
global value protocol while making every semantic dependency visible and
testable. A later P1 slice will bind these parameters to the common Eliscript
`hash` and `equal?` contract.

## Public Surface

The provisional module exports:

- `empty-persistent-map(hash-function, key-equal-function, value-equal-function)`
- `persistent-map?(value)`
- `persistent-map-count(map)`
- `persistent-map-meta(map)`
- `persistent-map-with-meta(map, metadata)`
- `persistent-map-has?(map, key)`
- `persistent-map-get(map, key, not-found)`
- `persistent-map-assoc(map, key, value)`
- `persistent-map-dissoc(map, key)`
- `persistent-map-reduce(function, initial, map)`
- `persistent-map-to-entries(map)`
- `persistent-map-from-entries(hash-function, key-equal-function,
  value-equal-function, entries)`

`get` distinguishes a stored nullish value from absence through the explicit
`not-found` argument. `has?` reports membership independently of the stored
value. Reduction calls `function(accumulator, key, value)` in trie traversal
order; no insertion-order guarantee is made.

Associating a key with a value accepted by `value-equal-function` returns the
same Map by identity. Removing a missing key also returns the same Map.
Count is capped at 2,147,483,647; insertion beyond the cap returns `nil`.

## Injected Value Semantics

Every Map root stores the three functions supplied at construction:

- `hash-function(key)` returns a value normalized to an unsigned 32-bit word.
- `key-equal-function(left, right)` resolves keys that share a full hash.
- `value-equal-function(left, right)` identifies a no-op replacement.

Each root also stores immutable metadata under the separate 0068 contract;
metadata never participates in key or value semantics.

All descendant versions preserve these exact functions. Operations never fall
back to JavaScript property coercion or object identity implicitly. Calling
code can choose scalar, value-key, or host-identity behavior explicitly. The
ordinary shared policy and default constructors now live above this low-level
API in
[0057-portable-value-semantics.md](0057-portable-value-semantics.md); explicit
injection remains supported for specialized key domains.

Hash equality is only a routing fact. Unequal keys with the same complete hash
remain separate entries in a collision node. A key lookup succeeds only after
`key-equal-function` accepts the stored key.

## Representation

The root is `nil` for an empty Map or one immutable trie item:

- **entry:** complete hash, key, and value
- **bitmap node:** one 32-bit bitmap and a packed array of occupied children
- **array node:** an occupancy count and a fixed logical 32-slot child array
- **collision node:** one complete hash and a packed array of entries

Each trie level consumes five hash bits. A sparse node promotes when insertion
fills all 32 branches. A dense node remains dense at 25 branches and packs
back to a bitmap node when deletion leaves 24. These 32/24 thresholds are the
measured M8 layout contract.

The representation is provisional and private. Host freezing is not yet a
portable primitive, so callers must not inspect or mutate node objects. Test
evidence may inspect roots to prove shape and sharing; application code uses
only the public functions.

## Association

Association follows the selected five-bit branch recursively:

1. an empty branch receives one entry
2. an equal key either returns the original entry or replaces its value
3. entries with different hashes are merged at their first differing branch
4. entries with one complete hash form or extend a collision node
5. bitmap and array nodes copy only the selected path

No update modifies an existing entry, child array, or root. Untouched child
subtrees are reused by identity. An update whose shape is unchanged allocates
one new item per selected trie level plus a replacement entry.

## Removal

Removal descends by the same hash route and copies only a path that actually
contains the key. It applies these normalizations on return:

- a missing key preserves the original Map identity
- an empty collision node disappears
- a one-entry collision node collapses to its entry
- an empty bitmap node disappears
- a one-child bitmap node may collapse when the child is an entry
- an array node packs to bitmap form at 24 children
- an empty root becomes `nil`

Old versions remain readable and retain their original count and membership.

## Complexity and Sharing

For `n` well-distributed keys and trie depth `d <= 7` for a 32-bit hash:

| Operation | Expected time | New trie items |
| --- | --- | --- |
| count | O(1) | 0 |
| get, has? | O(d) | 0 |
| assoc replacement | O(d) | O(d) |
| assoc insertion | O(d) | O(d), plus bounded node conversion |
| dissoc | O(d) | O(d), plus bounded node conversion |
| reduce | O(n) | 0 trie items |
| from-entries | expected O(n log32 n) | persistent update paths |

Complete-hash collision lookup is O(c), where `c` is the number of unequal
keys sharing that complete hash. Collision behavior is explicit rather than
hidden by a false constant-time claim.

The million-key test replaces one value and proves that the number of shared
items is exactly `total-items - changed-path-length`. It then removes another
key while confirming that the original Map is unchanged. The normal lookup,
association, and removal path does not perform whole-Map conversion.

`persistent-map-to-entries` is an explicit compatibility boundary. The
current portable immutable-array operations may copy growing intermediate
arrays, so this conversion is not used in million-key complexity evidence.
A future transient builder can optimize conversion without changing Map
semantics.

## P1 Role

P1 now owns three independent portable persistent representations:

- List proves constant-time front construction and complete suffix sharing.
- Vector proves bounded indexed trie updates and logarithmic path sharing.
- Map proves value-directed associative lookup, collision correctness,
  sparse/dense adaptation, and path-copying removal.

The next collection slice can implement Set as a thin Map-backed value while
the common hash/equality protocol replaces the injected constructor functions.
Metadata, printing, reading, transients, generic protocols, and literal
migration remain separate P1-P4 work.

## Emacs Reinvestment

This implementation is also a concrete building block for the editor
acceleration track. Large indexes, dependency graphs, grouped analysis
results, compiler tables, and syntax transforms can retain immutable versions
inside a warm JavaScript worker without repeatedly cloning complete objects.

The editor-facing result is not merely a faster Map. It is a safer compute
contract:

- an Emacs Lisp command snapshots explicit input
- a generated Eliscript module performs deterministic persistent updates
- verification mode compares the result with a reference Emacs Lisp path
- buffer versions and worker generations guard result application
- the result crosses a versioned value codec and is applied transactionally

This lets Eliscript improve Emacs Lisp programs at the library and execution
model level while Emacs keeps ownership of buffers, interaction, and editor
state. The eventual performance claim remains end-to-end and workload-based;
engine speed alone is not acceptance evidence.

## Compatibility

The module, representation, constructor parameters, traversal order, and
invalid-operation values are provisional during M8. It does not change map
literals, plain JavaScript objects, compiler tables, or the existing
JavaScript runtime prototype.

No stable language or toolchain behavior changes. The module is listed in the
public-surface registry so every future API change remains reviewable.

## Acceptance Criteria

- **EPM-01:** The implementation is one portable `.eli` module with no host
  import or mutation form.
- **EPM-02:** Seed and self-hosted compilers emit byte-identical ESM and Source
  Maps.
- **EPM-03:** Bun and Node.js produce identical 100,000-key, collision, update,
  removal, reduction, identity, and conversion reports from both outputs.
- **EPM-04:** Twenty thousand generated operations with value-equal object keys
  agree with retained immutable reference models.
- **EPM-05:** Fixtures cover bitmap nodes, 32-branch promotion, 25-branch dense
  retention, 24-branch demotion, and complete-hash collisions.
- **EPM-06:** No-op association and missing-key removal preserve exact Map
  identity.
- **EPM-07:** A one-million-key replacement shares every item outside its
  selected path; deletion is depth-bounded and preserves the source Map.
- **EPM-08:** Public-surface, conformance, compatibility, build, documentation,
  and default-test registries include the module and all evidence.
