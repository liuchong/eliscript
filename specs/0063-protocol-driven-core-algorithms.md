# 0063: Protocol-driven Core Sequence and Data Algorithms

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0059 Collection Capability Protocols and Reduction Foundation,
  0061 Composable Transducers and Protocol-driven Into,
  0062 Owner-token Transient Collections

## Summary

This specification moves the first maintained sequence and keyed-data
algorithms from concrete Array/Object assumptions onto the open collection
runtime. The algorithms accept any `IReduce` source, construct persistent
Vector and Map results, use Eliscript truth semantics, and stop traversal
through the shared reduced-value contract.

Two Eliscript modules under `stdlib/core/` provide Lisp-named source imports
for these runtime operations. They are ordinary `.eli` modules compiled by the
seed and self-hosted-compatible module pipeline, while their implementation
imports the JavaScript protocol runtime. They establish the intended language
surface without claiming that protocol dispatch itself has already been
rewritten in portable Eliscript.

The earlier portable `stdlib/sequence.eli` and `stdlib/data.eli` modules remain
supported compatibility modules. They preserve their Array/Object semantics
until a later clean migration can retain their portable compiler use cases.

## Truth Semantics

`runtime/core/truth.mjs` exports `isTruthy(value)`. Only `false`, `null`, and
`undefined` are false. Numbers including `0`, the empty string, and every
collection value are true. Core predicates use this operation rather than
JavaScript Boolean coercion.

`filtering` and `removing` therefore share language truth semantics with
`filter`, `remove`, `some`, and `every`. User callbacks are still ordinary
functions and are invoked exactly once for each value reaching their stage.

## Sequence Algorithms

`runtime/core/sequence.mjs` exports:

- transforms: `reverse`, `map`, `filter`, `remove`, `take`, `drop`, `concat`
- searches: `some`, `every`, `find`

Every source is traversed only through generic `reduce`. Transform results are
persistent Vectors. `map`, `filter`, `remove`, `take`, and `drop` delegate to
transducers and transient-backed `into`. `concat` holds one transient Vector
builder across all sources. `reverse` uses one private temporary buffer before
constructing the final persistent Vector; no mutable buffer escapes.

`some` returns the first truthy predicate result, not the source element.
`every` returns a Boolean. `find` returns the first source element whose
predicate result is truthy. `some` and `find` accept an optional not-found
value, defaulting to `null`. `take`, `some`, `every`, and `find` terminate the
source at the exact decisive element when its `IReduce` implementation honors
the reduced-value contract.

## Data Algorithms

`runtime/core/data.mjs` exports:

- `indexBy(keyFunction, collection)`
- `groupBy(keyFunction, collection)`
- `countBy(keyFunction, collection)`
- `frequencies(collection)`

All results are persistent Maps using the shared value equality and hashing
contract. `groupBy` values are persistent Vectors in source order. Repeated
keys in `indexBy` retain the last source value. Empty or null input returns the
canonical empty persistent Map.

Each key function is validated before traversal and called exactly once per
source value. Group and count discovery uses a value-semantic persistent index
from key to dense bucket position, so equal persistent keys share one bucket
without a native identity-key side table. Final Map construction uses one
owner-token transient. `indexBy` uses a transient Map throughout.

## Eliscript Modules

`stdlib/core/seq.eli` exports:

```text
concat drop every? filter find map remove reverse some take
```

`stdlib/core/data.eli` exports:

```text
count-by frequencies group-by index-by
```

The modules preserve Lisp spelling at source boundaries and import only the
corresponding public runtime modules. Generated ESM uses the compiler's normal
identifier mapping and source-map path retention. These modules are currently
runtime-backed and are not eligible for `--portable` closure extraction.

## Complexity and Allocation

For `n` consumed values and constant-time callbacks, sequence transforms and
searches are O(n). Transform construction uses one final persistent Vector;
transient-backed operations reuse owner-selected trie paths. `reverse` uses
O(n) private temporary storage because the current protocol set has no
reversible traversal capability.

`indexBy` has expected O(n) HAMT work and one transient completion. Its
instrumented 50,000-key build allocates fewer than one third of the HAMT nodes
used by equivalent repeated persistent association. `groupBy` and `countBy`
perform expected O(n) key-index work plus one final transient Map build. Group
bucket storage is O(n); count storage is O(k) for `k` distinct keys.

These are structural allocation guarantees, not timing promises. Host timing
depends on JavaScript engine warmup, garbage collection, and callback cost.

## Compatibility and Limits

This surface is provisional during M8. It adds no collection literal rewrite
and does not change the earlier portable sequence/data APIs. Existing native
Array, Map, Set, null, persistent collections, and externally extended
`IReduce` values remain valid sources.

This slice does not add lazy sequences, `mapcat`, partitioning, sorting,
comparison, text/object protocol migration, async reduction, metadata, or
compiler-generated direct protocol calls. Portable Eliscript definitions of
the runtime protocols and algorithms remain later work; the runtime-backed
facades make that remaining boundary explicit.

## Acceptance Criteria

- **PCA-01:** Eliscript truth semantics treat only false and nullish values as
  false across filtering, removing, searching, and universal predicates.
- **PCA-02:** All sequence algorithms accept an externally extended `IReduce`
  source without representation checks.
- **PCA-03:** Sequence transforms return persistent Vectors and preserve source
  order except for explicit reversal.
- **PCA-04:** `take`, `some`, `every`, and `find` stop at the exact decisive
  element through shared reduced values.
- **PCA-05:** Reusable removing and dropping transducers allocate fresh
  reduction state for each execution.
- **PCA-06:** Indexing, grouping, counting, and frequencies return
  value-semantic persistent Maps; grouped values are persistent Vectors.
- **PCA-07:** Equal persistent keys share one data bucket and every key
  function is invoked exactly once per source value.
- **PCA-08:** A 50,000-key `indexBy` build performs one transient completion and
  stays below one third of equivalent persistent HAMT node allocation.
- **PCA-09:** Both `stdlib/core/` facades compile with source maps and execute
  the complete source-level API from Eliscript.
- **PCA-10:** Bun and Node.js produce identical sequence and keyed-data reports.
- **PCA-11:** Existing protocol, transducer, transient, persistent collection,
  portable standard-library, contract, and complete repository suites remain
  green.

## Next Slice

Complete the maintained core collection vocabulary where real workloads need
it, then expose protocol operations and these algorithms as portable
Eliscript-authored definitions. Object/text migration and compiler hot-path
adoption should follow measured use rather than expanding the API by analogy.
