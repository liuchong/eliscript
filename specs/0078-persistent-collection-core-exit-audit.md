# 0078: Persistent Collection Core Exit Audit

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0053 Eliscript-authored Persistent Vector Trie,
  0054 Eliscript-authored Persistent List,
  0055 Eliscript-authored Persistent HAMT Map,
  0056 Eliscript-authored Persistent Map-backed Set,
  0057 Portable Value Semantics Core,
  0068 Immutable Metadata Semantics,
  0071 Canonical Portable Data Text,
  0074 Process-local Host Identity Hashing

## Summary

This specification closes phase P1, Persistent Collection Core, from
specification 0041. It is an evidence contract over the complete portable
List, Vector, Map, and Set family rather than a new collection API.

P1 requires more than four working constructors. The complete family must
retain old values, resolve full-hash collisions through equality, share every
unchanged branch, stay within the declared List, vector-trie, and HAMT
complexity bounds, preserve metadata outside value identity, round-trip
canonical data text, and produce the same observable results on maintained
JavaScript execution hosts.

The existing per-collection suites already prove compiler fixed-point parity,
generated histories against simple immutable models, collision behavior,
layout transitions, metadata, printing, reading, and million-value behavior.
The dedicated exit fixture adds the missing symmetric million-value execution
under Bun and Node for Vector, Map, and Set. List already executes its
million-node report through both compiler generations on both hosts.

## Audited Surface

The P1 audit covers these portable modules:

```text
stdlib/persistent-list.eli
stdlib/persistent-vector.eli
stdlib/persistent-map.eli
stdlib/persistent-set.eli
stdlib/value.eli
stdlib/metadata.eli
stdlib/identifier.eli
stdlib/data-text.eli
```

The audit does not freeze compiler literal lowering, native JavaScript
container conversion, protocol dispatch implementation, transient escape
analysis, or the optimized JavaScript runtime representation. Those remain
separate P2-P4 contracts.

## Correctness Evidence

Each collection has a deterministic generated-history suite against a simple
immutable JavaScript reference model. Every operation checks the current
value and at least one retained predecessor so an implementation cannot pass
by mutating an old root.

The collection-specific suites also cover:

- List empty, stack, indexed traversal, reversal, conversion, and exact suffix
  identity
- Vector tail boundaries, indexed lookup, append, association, pop, and exact
  trie-path replacement
- Map lookup, association, removal, sparse/dense node promotion and demotion,
  no-op identity, and complete-hash collisions
- Set membership, addition, removal, algebra, incompatible policies, inherited
  HAMT transitions, no-op identity, and complete-hash collisions

Portable value semantics recursively compose scalars and all four collection
families. Equal values have equal hashes, insertion order does not affect Map
or Set identity, metadata is excluded from equality and hashing, and opaque
host values use stable process-local identity tokens instead of one type-wide
collision bucket.

## Structural and Complexity Evidence

The exit gate uses representation counters and identity checks, not wall-clock
timing. Timing varies with hardware, process startup, garbage collection, and
engine warmup and therefore cannot prove an asymptotic contract.

At one million values:

| Collection | Required observation |
| --- | --- |
| List | `rest` and `pop` return the exact retained suffix; traversal and reduction remain iterative |
| Vector | root shift is 15, the tail has 32 values, lookup succeeds across trie boundaries, and `assoc` replaces only its selected path |
| Map | count and probes remain exact, a changed key copies only its bounded HAMT path, removal preserves the old root, and lookup depth is at most eight items |
| Set | a colliding unequal member is independently added and removed, unchanged HAMT branches remain shared, and the original membership root is unchanged |

Vector, Map, and Set are built in isolated child processes so the audit does
not retain multiple million-value roots in the test runner. Bun and Node each
execute the same generated project graph and must emit byte-for-byte
equivalent JSON reports. The bounded path counters must also equal the exact
difference between total structural items and shared structural items.

## Evidence Matrix

| P1 requirement | Executable evidence |
| --- | --- |
| Four portable collection implementations | `portable-persistent-list.test.mjs`, `portable-persistent-vector.test.mjs`, `portable-persistent-map.test.mjs`, `portable-persistent-set.test.mjs` |
| Deterministic equality and hashing | `portable-value-semantics.test.mjs` |
| Metadata outside value identity | `portable-metadata.test.mjs` |
| Canonical printer/reader round trips | `portable-data-text.test.mjs` |
| Reference-model histories | the generated-history test in every collection suite |
| Full-hash collision correctness | Map, Set, and value-semantics suites |
| Million-scale cross-host sharing and complexity | `portable-persistent-list.test.mjs` and `persistent-core-exit.test.mjs` |
| Seed/self-hosted artifact fixed point | per-collection host suites and `bootstrap-compiler.test.mjs` |

The maintained compatibility matrix declares Bun as the reference JavaScript
host. Node execution is retained as an independent generated-ESM portability
oracle. Browser node-layout measurements were completed in P0; P1 adds no DOM
or browser API and does not claim a browser compiler adapter.

## Phase Result

P1 is complete and stable. The audited portable collection specifications,
their public API, and this exit evidence are part of Compatibility Baseline 2.
This audit does not freeze compiler literal lowering, native container
conversion, protocol implementation, transient analysis, or optimized runtime
representations; those remain independently versioned contracts.

The stable collection boundary supports protocol-based algorithms and
persistent literal integration. Standard-library breadth should continue only
where it exercises or depends on those foundations.

## Acceptance Criteria

- **PCE-01:** List, Vector, Map, and Set compile from portable Eliscript and
  retain old versions throughout generated reference-model histories.
- **PCE-02:** Full-hash collisions remain distinct by equality in Map and Set,
  and process-local identity hashing avoids type-wide collision buckets for
  opaque host values.
- **PCE-03:** Equal nested values have equal deterministic hashes; Map and Set
  equality is independent of insertion order and metadata.
- **PCE-04:** Metadata updates replace only collection roots and canonical
  data text round-trips all four collection families with bounded malformed
  input.
- **PCE-05:** The million-node List report preserves exact suffix identity and
  executes iteratively under Bun and Node for seed and self-hosted artifacts.
- **PCE-06:** Million-value Vector association copies exactly one bounded trie
  path and preserves every probe in the original root under Bun and Node.
- **PCE-07:** Million-key Map update and removal preserve the original root,
  share every item outside a path of at most eight items, and agree under Bun
  and Node.
- **PCE-08:** Million-member Set collision insertion and removal preserve the
  original membership root, share every unchanged HAMT item, and agree under
  Bun and Node.
- **PCE-09:** Exit evidence is part of the default repository test target and
  the conformance checker rejects removal of its executable locator.
