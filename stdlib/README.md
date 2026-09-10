# Standard Library

[Project README](../README.md) | [Runtime](../runtime/README.md) |
[Specifications](../specs/README.md) | [Generated API Index](../docs/pages/api.html)

This directory contains portable Eliscript functions and macros plus focused
runtime-backed `core/` modules for semantics that need optimized host support.
UI-library and publishing support should be focused application packages, not
special cases embedded throughout the compiler or core standard library.

Framework integration uses ordinary ESM imports and calls. The standard
library contains no framework lowering or framework-specific helpers;
application ergonomics belong in replaceable application packages.

The generated API index is the exact current module/export inventory. Its
stability labels come from each module's owning specification and remain
provisional wherever the label is `accepted`.

## Core Collections

`core/collection.eli` exposes open collection capabilities alongside exact
persistent value categories. Capability predicates such as `counted?` and
`seqable?` can recognize supported host values, while `collection?`, `list?`,
`vector?`, `map?`, `set?`, `sequential?`, and `sequence?` describe Eliscript's
own persistent values and logical sequence views:

```elisp
(import "../../stdlib/core/collection.eli"
        bounded-count collection? distinct? sequence? subvec vector?)

[(collection? [1 2 3])
 (vector? [1 2 3])
 (sequence? [1 2 3])
 (bounded-count 2 [1 2 3])
 (subvec [10 20 30 40] 1 3)
 (distinct? [1 2] [1 2])]
```

`bounded-count` consumes at most its non-negative safe-integer limit, including
for unbounded views. `distinct?` compares persistent values structurally and
host objects by identity. Exact classification and traversal semantics are in
[0164](../specs/0164-persistent-collection-classification.md).
`subvec` adds O(1) persistent Vector range views with complete protocol,
structural-sharing, metadata, and value behavior; see
[0165](../specs/0165-persistent-subvector-views.md).

`persistent-queue.eli` exposes an immutable FIFO collection backed by shared
Vector views. Its append and removal operations compose with the
same collection, value, and metadata protocols; see
[0166](../specs/0166-persistent-queue.md).

`core/record.eli` supports declarative immutable domain types. A declaration
such as `(defrecord Person [name age])` creates the exact type `Person`, the
constructors `->Person` and `map->Person`, and the predicate `Person?`.
Records compose with persistent Map operations, value equality and hashing,
metadata, and `extend-type`; see [0168](../specs/0168-immutable-record-types.md).

## Core Ordering

`core/order.eli` provides the maintained language-level comparison and sorting
algorithms over the runtime's open `IComparable` protocol:

```elisp
(import "../../stdlib/core/order.eli"
        compare-values reverse-comparator sort sort-by)

[(sort [3 1 2 1])
 (sort (reverse-comparator) [3 1 2 1])
 (sort-by (lambda (entry) (get entry :priority)) entries)]
```

Natural comparison covers nullish values, booleans, numbers, big integers,
strings, Keywords, Symbols, persistent Lists, and persistent Vectors. Custom
types participate through ordinary protocol extension. Sorting is stable,
accepts any reducible source, caches each key exactly once, returns a persistent
Vector, and never mutates its source. `min-key` and `max-key` choose the last
value on an equal key, matching the stable tie contract.

## Functional Combinators

`function.eli` supplies ten higher-order building blocks in portable
Eliscript, without compiler intrinsics or host-framework helpers:

```elisp
(import "../../stdlib/function.eli"
        comp every-pred fnil juxt partial trampoline)

[(funcall (comp (lambda (value) (* value 2)) +) 3 4)
 (funcall (juxt 1+ 1-) 5)
 (funcall (fnil + 0 0) nil 8)]
```

Composition runs right to left, partial application preserves every forwarded
value including JavaScript `undefined`, and `juxt` returns a persistent Vector.
`every-pred` and `some-fn` preserve Lisp truth and short-circuit in documented
predicate-major order. `trampoline` evaluates arbitrarily long thunk chains
with constant stack usage. The complete identity, argument, nullish, ordering,
and portability contracts are specified in
[0149](../specs/0149-portable-functional-combinators.md).

## Deferred Computation

`deferred.eli` provides synchronous delayed values and value-semantic function
memoization without compiler syntax or framework policy:

```elisp
(import "../../stdlib/deferred.eli" delay force memoize realized?)

(let* ((answer (delay (lambda () (expensive-computation))))
       (cached-score (memoize score)))
  [(realized? answer)
   (force answer)
   (funcall cached-score document options)])
```

A Delay producer runs only on its first successful `force`; errors restore the
pending state, recursive forcing is rejected, and all successful values
including `nil`, `undefined`, and `false` are retained exactly. Memoization keys
complete argument vectors with persistent value equality, so structurally equal
persistent inputs share cache entries. Exact identity, retry, error, and host
parity semantics are specified in
[0161](../specs/0161-deferred-and-memoized-computation.md).

## Bit

`bit.eli` builds population count and 32-bit rotations entirely from portable
Eliscript intrinsics:

```elisp
(import "../../stdlib/bit.eli" bit-count rotate-left rotate-right)

(bit-count -1)
(rotate-left 305419896 8)
```

`bit-count` uses parallel masked reduction rather than a per-bit loop.
Rotations normalize their distance to five bits and return unsigned words.
The module is the reference algorithm layer for future trie and hash sources;
exact normalization and shift semantics are specified in
[specs/0052-portable-32-bit-operations.md](../specs/0052-portable-32-bit-operations.md).

## Persistent List

`persistent-list.eli` implements an immutable singly linked List in portable
Eliscript. `cons` and `conj` allocate one front node; `first`, `rest`, `peek`,
and `pop` are constant-time operations, and the new value shares its complete
old suffix by identity:

```elisp
(import "../../stdlib/persistent-list.eli"
        empty-persistent-list persistent-list-cons persistent-list-first)

(persistent-list-first
 (persistent-list-cons (empty-persistent-list) "value")
 nil)
```

Reduction and reversal are iterative and remain stack safe at one million
nodes. The representation and provisional failure semantics are specified in
[specs/0054-eliscript-persistent-list.md](../specs/0054-eliscript-persistent-list.md).

## Persistent Vector

`persistent-vector.eli` is the first complete persistent collection algorithm
written in portable Eliscript. It implements a 32-way trie, a bounded short
tail, path-copying `conj`, `assoc`, and `pop`, chunked reduction, and explicit
native-array conversion:

```elisp
(import "../../stdlib/persistent-vector.eli"
        empty-persistent-vector persistent-vector-conj persistent-vector-nth)

(persistent-vector-nth
 (persistent-vector-conj (empty-persistent-vector) "value")
 0
 nil)
```

The source does not import the JavaScript collection runtime and does not use
host mutation. It is the readable correctness reference for later collection
protocol, transient, and literal work. Exact provisional semantics and
structural evidence are specified in
[specs/0053-eliscript-persistent-vector.md](../specs/0053-eliscript-persistent-vector.md).

## Persistent Map

`persistent-map.eli` implements the complete associative HAMT in portable
Eliscript. Sparse bitmap nodes, dense 32-slot nodes, full-hash collision nodes,
and entries are immutable; association and removal copy only the selected
path. Its low-level constructors accept explicit hash, key-equality, and
value-equality functions for specialized domains:

```elisp
(import "../../stdlib/persistent-map.eli"
        empty-persistent-map persistent-map-assoc persistent-map-get)

(let* ((hash (lambda (key) key))
       (equal (lambda (left right) (= left right)))
       (map (persistent-map-assoc
             (empty-persistent-map hash equal equal)
             7
             "value")))
  (persistent-map-get map 7 nil))
```

Seed and self-hosted outputs are byte-identical. Bun and Node agree on a
100,000-key fixture, while generated model histories, complete-hash
collisions, measured 32/24 node transitions, and a million-key update prove
correctness and structural sharing. Exact provisional semantics are specified
in [specs/0055-eliscript-persistent-map.md](../specs/0055-eliscript-persistent-map.md).

## Persistent Set

`persistent-set.eli` is a thin immutable membership and collection-algebra
layer over `persistent-map.eli`. It imports the Map through a verified portable
source edge and duplicates no HAMT node or routing algorithm:

```elisp
(import "../../stdlib/persistent-set.eli"
        empty-persistent-set persistent-set-conj persistent-set-has?)

(let* ((hash (lambda (value) value))
       (equal (lambda (left right) (= left right)))
       (set (persistent-set-conj
             (empty-persistent-set hash equal)
             7)))
  (persistent-set-has? set 7))
```

The provisional API includes union, intersection, difference, subset,
superset, disjointness, equality, reduction, and explicit array conversion.
Two Sets must share the exact hash and key-equality function identities before
binary algebra is accepted. Dual-compiler/dual-host reports, generated model
histories, collision and 32/24 transition cases, and a million-member sharing
test are specified in
[specs/0056-eliscript-persistent-set.md](../specs/0056-eliscript-persistent-set.md).

## Value Semantics

`value.eli` is the ordinary policy layer over all four persistent collection
modules. It recursively compares and hashes scalars, Lists, Vectors, Maps, and
Sets, and supplies Map/Set constructors that share the exact same policy
functions:

```elisp
(import "../../stdlib/value.eli"
        value-equal? value-hash
        empty-value-map value-map-from-entries
        empty-value-set value-set-from-array)

(value-equal?
 (value-set-from-array [1 2 3])
 (value-set-from-array [3 2 1]))
```

Map and Set equality and hashes are independent of insertion order; List and
Vector remain distinct ordered value families. Nested `undefined` is preserved
instead of collapsing to `nil`. Opaque JavaScript objects, functions, and
native Symbols use process-local identity hashes backed by weak object/function
storage, so ordinary identity-keyed Maps and Sets retain expected HAMT depth.
Exact provisional semantics and evidence are in
[0057](../specs/0057-portable-value-semantics.md) and
[0074](../specs/0074-process-local-host-identity-hashing.md).

## Numeric Foundation

`numeric.eli` exposes the binary64 Number model and exact safe-integer
operations without a JavaScript Math dependency:

```elisp
(import "../../stdlib/numeric.eli"
        checked-multiply gcd modulo quot rem safe-integer?)

[(safe-integer? 9007199254740991)
 (quot -5 3)
 (rem -5 3)
 (modulo -5 3)
 (gcd 54 24)
 (checked-multiply 9007199254740991 2)]
```

Classification covers finite values, NaN, infinities, integers, safe
integers, sign, zero, and parity. Checked arithmetic returns nil instead of a
rounded unsafe result. `quot` truncates toward zero, `rem` follows the dividend
sign, and `modulo` follows the divisor sign. GCD and overflow-checked LCM are
iterative. See [0077](../specs/0077-portable-numeric-foundation.md) for the
complete 25-operation provisional contract.

## Result Values

`result.eli` exports portable, value-semantic Ok and Err records plus branch
and persistent-Vector combinators:

```elisp
(import "../../stdlib/result.eli"
        and-then err map-ok ok result-payload traverse-results)

(and-then
 (lambda (value) (if (> value 0) (ok (* value 2)) (err "not positive")))
 (map-ok 1+ (ok 20)))
```

Results are exact three-field persistent Maps, not JavaScript classes. Equal
payloads produce equal Results and hashes, reconstructed Results work as Map
keys, and false, nil, and undefined remain valid payloads. Inactive branch
combinators preserve the exact input identity. `collect-results` and
`traverse-results` return persistent Vectors, preserve order, and stop at the
first non-Ok item without recursive stack growth. See
[0075](../specs/0075-portable-result-values.md) for the complete 15-operation
surface and portability contract.

## JSON Values

`json.eli` implements strict JSON parsing and deterministic encoding entirely
as portable Eliscript. Parsed arrays become persistent Vectors and objects
become value-semantic persistent Maps:

```elisp
(import "../../stdlib/json.eli" parse-json stringify-json)
(import "../../stdlib/result.eli" and-then ok result-payload)

(and-then stringify-json
          (parse-json "{\"items\":[1,2,3],\"ready\":true}"))
```

Both operations return Result values. The encoder accepts only nil, booleans,
finite numbers, strings, persistent Vectors, and string-keyed persistent Maps;
native containers and other Eliscript value families require an explicit
boundary conversion. Object keys are sorted, duplicate input keys are
rejected, UTF-16 strings are escaped deterministically, and length, depth, and
value-count limits are configurable. See
[0076](../specs/0076-portable-json-values.md) for the seven-operation surface,
error codes, limits, and portability contract.

## Identifier Values

`core/identifier.eli` exposes optimized immutable, qualified Keyword and
Symbol values. `identifier.eli` provides matching constructors implemented
entirely with `defportable`:

```elisp
(import "../../stdlib/core/identifier.eli"
        identifier-name keyword keyword? qualified-name symbol symbol?)

(let ((key (keyword "article/title"))
      (name (symbol "article" "title")))
  [(keyword? key)
   (symbol? name)
   (identifier-name key)
   (qualified-name name)])
```

Keywords are interned; Symbols are non-interned values with namespace/name
equality. Both use deterministic hashes and work as runtime and portable value
Map keys or Set members. JSON serialization is deliberately rejected until a
versioned value codec exists. Source literals remain unchanged in this slice.
Portable Keywords are not interned, but equal portable/runtime identifiers
share hashes and cross-representation Map/Set behavior. Exact semantics are
specified in [0067](../specs/0067-first-class-keyword-symbol-values.md) and
[0070](../specs/0070-portable-identifier-values.md).

## Metadata

`metadata.eli` implements portable metadata dispatch for persistent Lists,
Vectors, Maps, and Sets. `core/metadata.eli` exposes the optimized runtime
protocols to ordinary Eliscript source:

```elisp
(import "../../stdlib/core/metadata.eli"
        meta supports-metadata? vary-meta with-meta)
(import "../../runtime/core/map.mjs" persistentHashMap)
(import "../../runtime/core/vector.mjs" persistentVector)

(let ((value (with-meta
              (persistentVector 1 2 3)
              (persistentHashMap ["source" "example"]))))
  [(supports-metadata? value)
   (meta value)
   (vary-meta value
              (lambda (current) current))])
```

Metadata is `nil` or a persistent Map. It changes only the root wrapper,
survives persistent and transient updates, and does not affect equality or
hashing. The portable collection modules also export representation-level
`*-meta` and `*-with-meta` functions for portable dispatch. Exact semantics
are specified in
[specs/0068-immutable-metadata-semantics.md](../specs/0068-immutable-metadata-semantics.md).

## Canonical Runtime Data Text

`core/data-text.eli` exposes the optimized runtime printer and reader through
Lisp-named functions:

```elisp
(import "../../stdlib/core/data-text.eli"
        print-value read-value read-values)

(read-value
 (print-value
  (read-value "^{:source \"example\"} {:values [1 2 3]}")))
```

The format covers scalar edges, Keyword/Symbol values, persistent Vector, Map,
Set, and metadata values. Map and Set output is deterministic, malformed and
duplicate data is rejected with source positions, and explicit limits bound
depth, text length, and value count. Portable List and portable collection
representations remain outside this optimized module and are implemented
separately in `data-text.eli`. See
[specs/0069-canonical-runtime-data-text.md](../specs/0069-canonical-runtime-data-text.md).

## Canonical Portable Data Text

`data-text.eli` prints and reads scalar, identifier, persistent List, Vector,
Map, Set, and metadata values without importing the JavaScript collection
runtime:

```elisp
(import "../../stdlib/data-text.eli"
        data-text-result-value print-value read-value)

(data-text-result-value
 (read-value
  (data-text-result-value
   (print-value value))))
```

Portable operations return explicit success/failure objects because portable
closures do not use exception control flow. Successful values live in a
one-element payload so `undefined` remains distinguishable from failure.
Lists use `(...)`; Map and Set output uses a stable Eliscript-authored merge
sort. Located errors and default depth, length, and value-count limits match
the runtime format. See
[specs/0071-canonical-portable-data-text.md](../specs/0071-canonical-portable-data-text.md).

## Atom State

`state/atom.eli` separates changing identity from immutable persistent values:

```elisp
(import "../../stdlib/state/atom.eli"
        add-watch atom compare-and-set! deref reset-vals! swap-vals!)

(let ((counter (atom 0)))
  (add-watch counter "log"
             (lambda (_key _reference old-value new-value)
               (print old-value new-value)))
  (swap-vals! counter (lambda (value amount) (+ value amount)) 2)
  (compare-and-set! counter 2 8)
  (reset-vals! counter 10)
  (deref counter))
```

Validators run before installation. Watches receive committed old/new pairs
after installation, and nested watch updates are queued so one transition's
complete watch snapshot runs before the next transition. Validator and swap
callbacks cannot recursively change the same Atom, preventing stale outer
writes. Compare-and-set uses canonical value equality and does no work on a
mismatch. The `-vals!` operations return persistent old/new pairs. Atom
failures use structured codes; user callback exceptions retain
their original identity. Atoms are host identities and are deliberately not
part of canonical data text or portable worker values. Exact semantics and
cross-compiler/cross-host evidence are specified in
[0072](../specs/0072-atomic-state-references.md).

## Value-dispatched Multimethods

`multimethod.eli` creates callable functions whose implementation is selected
from the value returned by a dispatch function:

```elisp
(import "../../stdlib/multimethod.eli"
        add-method! multi-fn methods remove-method!)

(let ((render (multi-fn "render" (lambda (kind value) kind))))
  (add-method! render "text"
               (lambda (_kind value) (str "text:" value)))
  (add-method! render "default"
               (lambda (kind value) (str kind ":" value)))
  (render "text" "hello"))
```

Dispatch keys use Eliscript value equality, so independently constructed equal
persistent values select the same method. Method additions, replacements, and
removals install new Persistent Map roots; a previous `methods` result remains
an immutable snapshot. The callable identity is authenticated by a private
weak registry, while dispatch and method exceptions keep their original
identity. Exact behavior is specified in
[0156](../specs/0156-value-dispatched-multimethods.md).

`hierarchy.eli` adds immutable derivation snapshots, and multimethods can use
those snapshots for ancestor dispatch with explicit preferences:

```elisp
(import "../../stdlib/multimethod.eli"
        add-method! derive! multi-fn prefer-method!)

(let ((render (multi-fn "render" (lambda (kind) kind))))
  (derive! render "photo" "media")
  (derive! render "photo" "visual")
  (add-method! render "media" (lambda (_kind) "media"))
  (add-method! render "visual" (lambda (_kind) "visual"))
  (prefer-method! render "visual" "media")
  (render "photo"))
```

Unordered matching ancestors raise an ambiguity error. Exact methods remain
the fast path, and every method, hierarchy, or preference mutation invalidates
derived cache entries. Full behavior is specified in
[0157](../specs/0157-persistent-dispatch-hierarchies.md).

## JavaScript Container Interop

`interop/js.eli` defines the explicit boundary between immutable persistent
values and native mutable JavaScript containers:

```elisp
(import "../../stdlib/interop/js.eli"
        from-js js-array js-object to-js to-js-object)

(let* ((source (js-object "items" (js-array "left" "right")))
       (state (from-js source (js* "({deep: true})")))
       (props (to-js-object state (js* "({deep: true})"))))
  props)
```

`to-js` and `from-js` are shallow by default. Deep conversion is explicit and
supports mixed portable/runtime List, Vector, Map, Set, native Array, Map,
Set, and plain-object graphs. It preserves repeated source identity, rejects
cycles with exact paths, rejects accessors without executing them, and refuses
Map/Set conversions that would silently collapse value-equal keys or members.
`to-js-object` is the focused UI props and JavaScript options adapter. A
particular framework may consume it, but no framework defines its semantics.
Exact semantics and cross-compiler/cross-host evidence are specified in
[0073](../specs/0073-native-javascript-container-interop.md).

## Protocol-driven Core

`core/seq.eli`, `core/data.eli`, and `core/set.eli` expose the current
protocol-driven runtime algorithms through Lisp-named Eliscript modules:

```elisp
(import "../../stdlib/core/seq.eli"
        cycle distinct flatten generate interleave iterate map mapcat
        partition partition-all range reductions repeat repeatedly tree-seq
        first sequence-nth take-last drop-last split-at split-with)
(import "../../stdlib/core/data.eli"
        assoc-in get-in group-by frequencies keys vals
        update-keys update-vals merge-with select-keys zipmap)
(import "../../stdlib/core/set.eli"
        difference disjoint? index intersection join map-invert project
        rename rename-keys select set subset? superset? union)
```

Sequence transforms accept any `IReduce` source and return persistent Vectors.
The maintained vocabulary includes indexed mapping/keeping, prefix and sampled
selection, interposition, adjacent and global deduplication, mapcat,
round-robin interleaving, stepped and padded partitioning, stack-safe tree
traversal, sequential flattening, and intermediate reduction history.
Boundary selection preserves present `undefined` values separately from
absence. Tail selection uses bounded ring storage, while positional and
predicate splitting traverse once and return persistent Vector pairs.
Keyed-data transforms return value-semantic persistent Maps, with persistent
Vector group values. Nested associative reads and updates preserve existing
container shapes and create persistent Maps for missing levels. Selection,
plain merge, and zipping use owner-token builders; combining merge retains
value-semantic prior-value lookup. Searches and bounded transforms use reduced
values for early termination.

`keys` and `vals` project any keyed protocol source into persistent Vectors.
`update-keys` and `update-vals` transform keyed entries into a new persistent
Map; source values remain unchanged and a transformed-key collision keeps the
last traversed value.

Set conversion and algebra accept arbitrary protocol collections and return
value-semantic persistent Sets. Intersection and difference retain left-hand
metadata; subset, superset, and disjoint checks stop as soon as the answer is
known.
Relations are persistent Sets of keyed rows. `select` and `project` filter and
shape rows, `rename-keys` and `rename` transform schemas, `index` groups rows by
projected persistent Map keys, and `join` performs natural or explicit
key-mapped joins using the smaller relation as its index.

`reduce-kv` passes indexes or stored keys directly through `IKVReduce`.
Persistent Vector and HAMT Map values avoid public entry allocation, external
keyed types can implement the capability independently, and merge operations
prefer the keyed path without changing Vector/Array entry-source semantics.

`dissoc` and `disj` remove one or more mappings or members through `IMap` and
`ISet`. `peek` and `pop` provide `IStack` access using the List head or
Vector/Array tail. Persistent values preserve structural sharing and their
existing root/navigation metadata rules; native values are copied before removal.

`counted?`, `indexed?`, `seqable?`, `reducible?`, `reversible?`, and
`associative?` inspect complete protocol capabilities without invoking an
operation. `empty?` uses `ISeqable` instead of assuming count support, while
`not-empty` returns nil or the original non-empty value by identity. Exact
capability and empty-value semantics are specified in
[0162](../specs/0162-collection-capability-predicates.md).

`range`, `repeat`, `repeatedly`, `iterate`, `cycle`, and `generate` create
replayable sequence views. Finite sources publish exact counts; open sources
are explicitly unbounded, so `collection-count` rejects them without starting
a traversal. Producer callbacks execute only for consumed values, and `cycle`
captures its finite `IReduce` input once as a persistent snapshot.

`rest`, `next`, `prepend`, `second`, `ffirst`, `nfirst`, `fnext`, `nnext`,
`nth-rest`, and `nth-next` compose replayable sequence views without realizing
their tails. `rest` and `nth-rest` return possibly-empty sequence values;
`next` and `nth-next` return nil when no value remains. Bounded, unknown, and
unbounded cardinality remain explicit across slicing and prepending. Exact
semantics are specified in
[0163](../specs/0163-replayable-sequence-head-tail-views.md).

`eduction` composes transducers into a replayable `IReduce`-only pipeline, so a
bounded consumer can transform an unbounded source without realizing an
intermediate Vector or tail. Reduction state is fresh for every run, while
`run!` provides explicit ordered side-effect consumption and returns nil.

These modules intentionally import `runtime/core/*.mjs` and are not yet
eligible for portable closure extraction. They are the language-level entry
points for the current protocol core. Exact semantics and allocation evidence
are specified in
[specs/0063-protocol-driven-core-algorithms.md](../specs/0063-protocol-driven-core-algorithms.md).
Finite selection and splitting are specified in
[0150](../specs/0150-protocol-driven-finite-sequence-selection.md).
Replayable bounded and unbounded sources are specified in
[0151](../specs/0151-replayable-sequence-sources.md).
Replayable reduction-only transducer pipelines are specified in
[0152](../specs/0152-replayable-reducible-transducer-pipelines.md).
Key/value reduction is specified in
[0153](../specs/0153-key-value-reduction-protocol.md).
Map, Set, and Stack capabilities are specified in
[0154](../specs/0154-map-set-stack-capability-protocols.md).
Reversible traversal and the `last`/`reverse` fast path are specified in
[0155](../specs/0155-reversible-collection-traversal.md).

## Portable Sequence Compatibility Module

`sequence.eli` is the first standard-library module. It exports fresh-array,
non-mutating sequence operations:

```elisp
(import "../../stdlib/sequence.eli" map filter reduce range)

(map (lambda (value) (* value 2)) (range 1 5))
```

Available operations are `reverse`, `map`, `filter`, `reduce`, `concat`,
`range-by`, `range`, `take`, `drop`, `some?`, `every?`, and `find`. Every
declaration is a statically checked `defportable`; closure-only builds include
only the requested entries and their transitive helpers.

Compile all current modules and their external source maps with:

```sh
bun run compile:stdlib
```

Build and run a complete project that imports the `.eli` source directly:

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```

See [specs/0023-portable-sequence-library.md](../specs/0023-portable-sequence-library.md)
for exact semantics and acceptance evidence, and
[specs/0024-project-builds.md](../specs/0024-project-builds.md) for recursive
source-module builds.

## Text

`text.eli` exports thirteen portable string operations for slicing, literal
matching, prefix and suffix removal, ASCII-boundary trimming, blank checks,
joining, and repetition:

```elisp
(import "../../stdlib/text.eli" contains? strip-prefix trim)

(trim (strip-prefix "#" "# article "))
```

Indices address ECMAScript UTF-16 code units. Matching is literal and does not
use host methods or regular expressions. Compile all current modules with
`bun run compile:stdlib`, or exercise them together with:

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```

See [specs/0025-portable-text-library.md](../specs/0025-portable-text-library.md)
for exact semantics, dependency closure, and acceptance evidence.

## Object

`object.eli` exports eleven immutable operations for own keys, property checks,
shallow association, removal, merging, value transforms, selection, omission,
and updates:

```elisp
(import "../../stdlib/object.eli" assoc merge pick)

(pick (assoc (object :name "Eliscript") :runtime "JavaScript")
      [:name :runtime])
```

All transforms return ordinary objects and do not mutate their inputs. The
module is portable and dependency-prunable; selecting `omit` includes only its
`keys`, `assoc`, and `key-in?` closure. See
[specs/0026-portable-object-library.md](../specs/0026-portable-object-library.md)
for primitive semantics.

## Portable Data Compatibility Module

`data.eli` exports `index-by`, `group-by`, and `count-by`. It is the first
standard module composed from another portable source module:

```elisp
(import-portable "./object.eli" assoc)
(import-portable "./object.eli" has?)
```

Ordinary compilation emits standard named ESM imports. A portable project build
verifies the imported declarations, follows the local graph, and emits a pruned
module tree:

```sh
../bin/eliscript-build --root . --portable group-by \
  --out-dir ../dist/portable data.eli
```

See
[specs/0027-portable-data-indexing.md](../specs/0027-portable-data-indexing.md)
for keyed collection transforms and
[specs/0028-portable-module-composition.md](../specs/0028-portable-module-composition.md)
for the cross-module proof contract.

The Emacs indexing workload imports `count-by` from this module. Its portable
project build follows the dependency into `object.eli`, emits only `count-by`,
`assoc`, and `has?`, and executes the resulting graph in the worker. See
[specs/0029-portable-indexing-composition.md](../specs/0029-portable-indexing-composition.md).
