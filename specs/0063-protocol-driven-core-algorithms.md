# 0063: Protocol-driven Core Sequence and Data Algorithms

- Status: Stable
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

The initial implementation supplied equivalent JavaScript algorithms plus
Lisp-named source modules. Specification 0066 moves the maintained sequence
and keyed-data algorithm bodies into those `.eli` modules while retaining the
lower-level JavaScript protocol and persistent-data substrate.

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

- transforms: `reverse`, `map`, `mapIndexed`, `keep`, `keepIndexed`, `filter`,
  `remove`, `take`, `drop`, `takeWhile`, `dropWhile`, `takeNth`, `interpose`,
  `dedupe`, `distinct`, `mapcat`, `partitionAll`, `partitionBy`, `concat`,
  `takeLast`, `dropLast`, `butlast`, `splitAt`, and `splitWith`
- sources: `range`, `repeat`, `repeatedly`, `iterate`, `cycle`, and `generate`
- searches: `first`, `last`, `sequenceNth`, `some`, `every`, `find`
- reduction history: `reductions`

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

Indexed and keep transforms preserve the transducer index and exact-nil
contracts. Prefix, sampling, interposition, adjacent dedupe, flattening, and
partitioning are eager persistent-Vector materializations of their transducer
counterparts. `distinct` differs from `dedupe`: it retains only the first
occurrence across the whole input using Eliscript value equality and hashing.

`reductions(step, initial, collection)` returns a persistent Vector containing
the initial value followed by every intermediate accumulator. A reduced
initial value prevents source traversal. A reduced step result contributes its
unwrapped accumulator exactly once and stops at that source element.

`first` and `sequenceNth` stop at the exact selected value while `last`
consumes the finite source. They distinguish a present `undefined` from
absence. Tail selection uses bounded ring storage, and `splitAt` and
`splitWith` traverse once to produce persistent Vector pairs. `splitWith`
stops predicate evaluation after the first Lisp-false result.

Sequence sources return replayable `SequenceView` values rather than eager
Vectors. Finite range, repeat, repeatedly, and generate sources expose exact
safe-integer counts. Open range, one-argument repeat/repeatedly, iterate, and
non-empty cycle are explicitly unbounded, so generic count rejects them before
traversal. Producers and transforms run only as values are consumed; cycle
captures its finite protocol source once as a persistent Vector snapshot.

## Data Algorithms

`runtime/core/data.mjs` exports:

- `indexBy(keyFunction, collection)`
- `groupBy(keyFunction, collection)`
- `countBy(keyFunction, collection)`
- `frequencies(collection)`
- `getIn(collection, path, notFound = null)`
- `assocIn(collection, path, value)`
- `update(collection, key, transform, ...arguments)`
- `updateIn(collection, path, transform, ...arguments)`
- `selectKeys(collection, keys)`
- `merge(...collections)`
- `mergeWith(combine, ...collections)`
- `zipmap(keys, values)`

Indexing, grouping, counting, and frequency results are persistent Maps using
the shared value equality and hashing contract. `groupBy` values are persistent
Vectors in source order. Repeated keys in `indexBy` retain the last source
value. Empty or null input returns the canonical empty persistent Map.

Paths are arbitrary `IReduce` sources. `getIn` returns the root for an empty
path, preserves present `null` or `undefined` leaf values, and returns the
caller-provided not-found value only for a missing path. `assocIn` replaces the
root for an empty path, preserves every existing associative container, and
creates persistent Maps for missing or nullish intermediate levels. `update`
and `updateIn` validate their transform before lookup, pass additional
arguments unchanged, and observe `null` for a missing value.

`selectKeys`, `merge`, `mergeWith`, and `zipmap` return value-semantic
persistent Maps. Selection distinguishes a present `undefined` value from an
absent key. Merge order is left to right and later values win; `mergeWith`
combines repeated keys, including keys whose prior value is `undefined`.
`zipmap` consumes arbitrary reducible key and value sources and stops at the
shorter materialized input. Every merged entry must contain exactly one key
and one value.

Map-like `IKVReduce` sources pass keys and values directly to merge reducers.
Indexed `IKVReduce` sources retain their established role as collections of
entries, so Vector and Array compatibility is unchanged. External map-like
types may implement only key/value reduction and still participate.

Each key function is validated before traversal and called exactly once per
source value. Group and count discovery uses a value-semantic persistent index
from key to dense bucket position, so equal persistent keys share one bucket
without a native identity-key side table. Final Map construction uses one
owner-token transient. `indexBy` uses a transient Map throughout.

## Eliscript Modules

`stdlib/core/seq.eli` exports:

```text
butlast concat cycle dedupe distinct drop drop-last drop-while every? filter
find first generate interpose iterate keep keep-indexed last map map-indexed
mapcat partition-all partition-by range reductions remove repeat repeatedly
reverse sequence-nth some split-at split-with take take-last take-nth take-while
```

`stdlib/core/data.eli` exports:

```text
assoc-in count-by frequencies get-in group-by index-by merge merge-with
select-keys update update-in zipmap
```

`runtime/core/order.mjs` defines open comparison and ordering operations:

```text
IComparable comparator compareValues maxKey minKey reverseComparator sort sortBy
```

Natural comparison is deterministic for nullish values, booleans, numbers,
big integers, strings, Keywords, Symbols, persistent Lists, and persistent
Vectors. Numbers order `NaN` after every other number and treat two `NaN`
values as equal for ordering. Sequential values compare lexicographically.
Incompatible natural types and values without an `IComparable` implementation
fail deterministically; user types can extend the protocol without modifying
their prototypes.

`sort` and `sortBy` accept arbitrary reducible sources and return persistent
Vectors. They are explicitly stable through source-index tie breaking and do
not mutate inputs. `sortBy` evaluates its key function once per source value.
Comparators may return finite numbers or act as Lisp-truth predicates;
`reverseComparator` reverses either form. `minKey` and `maxKey` evaluate each
key once and select the last value when keys compare equally.

The modules preserve Lisp spelling at source boundaries. As completed by
specification 0066, they import lower-level collection, transducer, transient,
truth, Map, and Vector capabilities and contain their maintained algorithm
bodies directly. They do not import `runtime/core/sequence.mjs` or
`runtime/core/data.mjs`. Generated ESM uses the compiler's normal identifier
mapping and source-map path retention. Runtime imports still make these modules
ineligible for `--portable` closure extraction.

## Complexity and Allocation

For `n` consumed values and constant-time callbacks, sequence transforms and
searches are O(n). Transform construction uses one final persistent Vector;
transient-backed operations reuse owner-selected trie paths. `reverse` uses
O(n) private temporary storage because the current protocol set has no
reversible traversal capability.

Tail selection traverses in O(n), uses O(min(n, k)) private ring storage for
limit `k`, and never performs repeated front removal. Splitting traverses once,
preserves order, and builds both persistent results through owner-token
transients.

Each finite sequence source advances in O(1) work per yielded value and retains
O(1) iterator state. Unbounded sources have the same per-value bound and cannot
be counted. `cycle` performs one O(n) snapshot of its finite source and retains
O(n) immutable storage before yielding in O(1) work per value.

`indexBy` has expected O(n) HAMT work and one transient completion. Its
instrumented 50,000-key build allocates fewer than one third of the HAMT nodes
used by equivalent repeated persistent association. `groupBy` and `countBy`
perform expected O(n) key-index work plus one final transient Map build. Group
bucket storage is O(n); count storage is O(k) for `k` distinct keys.

Nested access and update are O(p) for path length `p`, plus persistent
association path costs at each nesting level. Selection and plain merge use one
transient Map completion. Combining merge performs persistent associations so
each repeated key can use value-semantic lookup. `zipmap` materializes both
reducible inputs as persistent Vectors, then constructs one transient Map, for
O(k + v) traversal and O(min(k, v)) associations.

These are structural allocation guarantees, not timing promises. Host timing
depends on JavaScript engine warmup, garbage collection, and callback cost.

## Compatibility and Limits

This surface is stable in Compatibility Baseline 2. It adds no collection
literal rewrite and does not change the earlier portable sequence/data APIs.
Existing native Array, Map, Set, null, persistent collections, and externally
extended `IReduce` values remain valid sources.

This slice does not add memoized lazy lists, text/object protocol migration,
async reduction, metadata, or
compiler-generated direct protocol calls. Specification 0066 moves the public
protocol access surface and maintained algorithms into Eliscript; portable
dispatch internals remain later work.

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
- **PCA-09:** Both `stdlib/core/` modules compile with source maps and execute
  the complete source-level API from Eliscript.
- **PCA-10:** Bun and Node.js produce identical sequence and keyed-data reports.
- **PCA-11:** Existing protocol, transducer, transient, persistent collection,
  portable standard-library, contract, and complete repository suites remain
  green.
- **PCA-12:** Indexed, keep, prefix, sampling, interposition, dedupe,
  distinctness, mapcat, and partition functions accept arbitrary `IReduce`
  sources and return persistent Vectors with their transducer semantics.
- **PCA-13:** Reductions includes the initial and each intermediate value,
  terminates exactly on a reduced initial or step result, and constructs one
  persistent Vector through a transient builder.
- **PCA-14:** Nested associative reads and updates define empty, missing,
  nullish, present-undefined, and variadic-transform behavior over reducible
  paths without mutating the source.
- **PCA-15:** Key selection, ordered merging, combining merge, and zipping
  produce value-semantic persistent Maps, accept reducible inputs, and reject
  malformed entries deterministically.
- **PCA-16:** Natural comparison is deterministic across every registered
  scalar, identifier, and persistent sequential type and remains open to
  external `IComparable` extensions.
- **PCA-17:** Sorting accepts arbitrary `IReduce` sources, is stable, leaves
  inputs unchanged, and returns persistent Vectors under Bun and Node.
- **PCA-18:** `sortBy`, `minKey`, and `maxKey` evaluate each key once and retain
  the specified stable or last-tie behavior.
- **PCA-19:** Boundary and indexed sequence selection distinguish present
  `undefined` from absence and stop at the exact decisive source value.
- **PCA-20:** Tail and split operations accept protocol sources, use bounded or
  single-pass construction, and return persistent Vector results in source
  order.
- **PCA-21:** Replayable finite and unbounded sequence sources expose explicit
  count behavior, defer callback execution until consumption, and compose with
  bounded protocol reduction without stack growth.
- **PCA-22:** Keyed merging prefers non-indexed `IKVReduce` sources without
  allocating public entry pairs, accepts key/value-only external types, and
  preserves indexed entry-source behavior.

## Next Slice

Complete the maintained core collection vocabulary where real workloads need
it, then make protocol dispatch policy portable without regressing direct-slot
or open-extension behavior. Object/text migration and compiler hot-path
adoption should follow measured use rather than expanding the API by analogy.
