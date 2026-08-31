# 0062: Owner-token Transient Collections

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-29
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0058 Open Protocol Dispatch Core, 0061 Composable Transducers and
  Protocol-driven Into

## Summary

This specification adds owner-token transient Vector, Map, and Set builders to
the JavaScript runtime. A transient begins by sharing the complete persistent
representation. The first update to a trie path copies only nodes whose owner
does not match the transient token; later updates through the same owner mutate
those copied nodes in place. Completing the builder returns a persistent value
in O(1) wrapper work and permanently invalidates the transient.

The public operations are protocol-driven and collection capabilities remain
truthful. Vector implements transient append and indexed association, Map
implements entry append, association, and dissociation, and Set implements
member append and dissociation. `into` selects this builder path for editable
persistent targets while retaining the immutable protocol path for native and
external targets.

## Public Runtime Surface

`runtime/core/transient.mjs` exports:

- protocols: `IEditable`, `ITransientCollection`
- conversion: `transient`, `persistentBang`
- updates: `conjBang`, `assocBang`, `dissocBang`

The operation names carried by `ITransientCollection` are `conj!`, `assoc!`,
`dissoc!`, and `persistent!`. The JavaScript function names avoid punctuation
while preserving the operation vocabulary used by the language design.

Transient concrete classes, constructor tokens, owner tokens, mutable state,
and direct Symbol slots are internal. Applications receive capability-bearing
values and cannot construct a valid transient by invoking a concrete class.

## Ownership Model

Every editable trie node carries one opaque owner token. Persistent nodes carry
`null` and remain frozen. An update follows these rules:

1. if the selected node already carries the current token, mutate its child
   storage in place
2. otherwise allocate one shallow node copy, assign the current token, and
   continue through that copy
3. retain every untouched child by identity
4. replace immutable entries and scalar values rather than mutating them

Each `transient(persistent)` call allocates a fresh token. A persistent value
produced by one transient may therefore become the source of another transient
without allowing the second builder to mutate nodes retained by the first
generation.

Persistent-to-transient conversion stores references to the source root and
tail and does not traverse the collection. An unchanged `persistentBang`
returns the exact source value. A changed completion creates only the
persistent collection wrapper around the current root, tail, and count. It
does not normalize or freeze the internal editable nodes because no live
public reference can reach or mutate them after invalidation.

## Vector

A transient Vector keeps count, shift, root, tail, and tail ownership in its
private state. The source tail is copied on the first tail update. A full owned
tail becomes an owned leaf without another copy. Trie association copies the
selected path once per owner; subsequent updates on that path reuse it.

Root growth creates owned path nodes. The persistent Vector update algorithms
continue to copy their selected path even when their source contains nodes
created by an earlier transient, so persistent updates never depend on node
freeze state.

Vector implements `conj!`, `assoc!`, and `persistent!`. Associating at exactly
the current count delegates to append. Other indexes retain the persistent
Vector bounds contract. Vector does not implement `dissoc!`.

## Map and Set

Transient Map applies the owner rule to bitmap-indexed, dense-array, and
complete-hash-collision nodes. Entries remain frozen. Sparse insertion,
32-branch promotion, 24-branch demotion, recursive collisions, replacement,
and removal return the same logical structures as persistent HAMT operations.

No-op association and missing-key dissociation do not acquire ownership or
mark the builder changed. Map implements all four transient collection
operations. `conj!` accepts the same exact key/value entry representation as
persistent Map construction.

Transient Set delegates ownership and updates to one transient backing Map and
the private Set membership sentinel. It implements `conj!`, `dissoc!`, and
`persistent!`, but not `assoc!`. An unchanged Set completion returns the exact
source Set when its backing Map also remains unchanged.

## Lifecycle and Escape Boundary

`persistentBang` is a one-way state transition. It clears the owner from the
builder state and marks that state inactive before control returns. Every
subsequent valid update or completion fails deterministically with a
collection-specific `TypeError`.

Transients intentionally do not implement persistent collection protocols.
Generic `count`, `conj`, `assoc`, traversal, equality, and hashing therefore do
not accidentally treat an editable builder as a value.

The runtime rejects JSON serialization and structured cloning of transient
values. Worker-message serialization consequently fails before a transient can
be copied to another JavaScript realm. Detecting that a value crossed an
`await` suspension or a module export requires compiler ownership analysis and
is not claimed by this runtime slice. Those static escape checks remain open
before the transient contract can become stable.

## Transient-backed Into

`into` still obtains a canonical seed with `empty(target)`. It then asks
whether that seed implements `IEditable`:

- editable persistent targets reduce through `conjBang` and complete through
  `persistentBang`
- native or external targets retain the persistent `conj` reducing path

The transient completion is a normal reducing-function completion, so early
termination and zero-input transducers still produce a persistent result
exactly once. Target and source values remain unchanged, and external protocol
extensions do not need to know about transients.

## Complexity and Allocation

Conversion in either direction is O(1). For a trie of depth `d`, the first
update through one owner allocates at most O(d) nodes; repeated updates through
owned paths allocate no replacement path. Vector append remains amortized
O(log32 n), and Map/Set updates remain expected O(log32 n).

Instrumented construction compares equivalent persistent loops and transient
`into` calls. At 100,000 Vector values and 50,000 Map/Set values, transient
construction must allocate less than one third of the corresponding
persistent path-node volume. A one-million-value Vector build must allocate
fewer than 40,000 trie nodes, clone the initially shared root once, and perform
one completion.

Allocation ratios are structural regression gates, not wall-clock promises.
Host timing remains subject to engine warmup, garbage collection, and machine
load.

## Compatibility and Limits

This surface is provisional during M8. It does not change literal emission or
the Eliscript-authored collection modules under `stdlib/`. The runtime owner
algorithms establish the executable reference behavior that a later portable
implementation can match.

This slice does not add transient List, pop, metadata, async-safe ownership,
module-export analysis, host conversion, or transient extension tables for
external types. Grouping and indexing adopt these builders in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md);
compiler algorithms have not yet been migrated.

## Acceptance Criteria

- **TRN-01:** `IEditable` and `ITransientCollection` are frozen open protocols,
  and Vector, Map, and Set expose only their truthful operation subsets.
- **TRN-02:** Persistent-to-transient conversion traverses and copies no trie
  node or Vector tail and initially shares source storage by identity.
- **TRN-03:** The first selected-path update clones owner-mismatched nodes;
  repeated updates through the same owner reuse those nodes.
- **TRN-04:** Vector tail copying, root growth, indexed association, append,
  source retention, and unchanged completion preserve persistent semantics.
- **TRN-05:** Map preserves complete collisions, no-op identity, replacement,
  removal, and measured 32/24 sparse/dense transitions.
- **TRN-06:** Set reuses the transient Map owner path, preserves unique members,
  and retains source values.
- **TRN-07:** Successive transient owners preserve every earlier committed
  Map and Set generation under deterministic generated updates.
- **TRN-08:** Every valid operation after completion fails deterministically;
  persistent collection APIs do not accept transient values.
- **TRN-09:** JSON serialization and structured cloning reject every transient
  collection family.
- **TRN-10:** `into` chooses transient builders for persistent Vector, Map, and
  Set targets while native and external target behavior remains unchanged.
- **TRN-11:** Instrumented allocation ratios and the million-value Vector bound
  meet the structural limits in this specification.
- **TRN-12:** Bun and Node.js produce identical Vector, Map, and Set reports.
- **TRN-13:** Existing persistent collections, protocols, transducers,
  conformance, public-surface, compatibility, and complete repository suites
  remain green.

## Continuation

Maintained sequence and keyed-data algorithms, transient-backed indexing, and
Eliscript source facades continue in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
Portable protocol definitions, object/text migration, compiler hot paths, and
static transient escape analysis remain open.
