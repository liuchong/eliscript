# Standard Library

[Project README](../README.md) | [Runtime](../runtime/README.md) |
[Specifications](../specs/README.md)

This directory contains portable Eliscript functions and macros plus focused
runtime-backed `core/` modules for semantics that need optimized host support.
React and publishing support should be libraries here or in focused packages,
not special cases embedded throughout the compiler.

The compiler owns only React element construction and the automatic JSX
runtime contract. Higher-level component helpers belong here so React remains
a library target instead of a second component framework.

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
instead of collapsing to `nil`. Opaque JavaScript objects still use identity
equality and a collision-heavy portable fallback hash, so identity-keyed hot
paths should keep using low-level injected constructors. Exact provisional
semantics and evidence are in
[specs/0057-portable-value-semantics.md](../specs/0057-portable-value-semantics.md).

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
        add-watch atom deref reset! swap!)

(let ((counter (atom 0)))
  (add-watch counter "log"
             (lambda (_key _reference old-value new-value)
               (print old-value new-value)))
  (swap! counter (lambda (value amount) (+ value amount)) 2)
  (reset! counter 10)
  (deref counter))
```

Validators run before installation. Watches receive committed old/new pairs
after installation, and nested watch updates are queued so one transition's
complete watch snapshot runs before the next transition. Validator and swap
callbacks cannot recursively change the same Atom, preventing stale outer
writes. Atom failures use structured codes; user callback exceptions retain
their original identity. Atoms are host identities and are deliberately not
part of canonical data text or portable worker values. Exact semantics and
cross-compiler/cross-host evidence are specified in
[0072](../specs/0072-atomic-state-references.md).

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
`to-js-object` is the focused React props and JavaScript options adapter.
Exact semantics and cross-compiler/cross-host evidence are specified in
[0073](../specs/0073-native-javascript-container-interop.md).

## Protocol-driven Core

`core/seq.eli` and `core/data.eli` expose the current protocol-driven runtime
algorithms through Lisp-named Eliscript modules:

```elisp
(import "../../stdlib/core/seq.eli" map filter take every?)
(import "../../stdlib/core/data.eli" group-by frequencies)
```

Sequence transforms accept any `IReduce` source and return persistent Vectors.
Keyed-data transforms return value-semantic persistent Maps, with persistent
Vector group values. Searches and bounded transforms use reduced values for
early termination, while grouping and indexing use owner-token builders for
final construction.

These modules intentionally import `runtime/core/*.mjs` and are not yet
eligible for portable closure extraction. They are the language-level entry
points for the current protocol core. Exact semantics and allocation evidence
are specified in
[specs/0063-protocol-driven-core-algorithms.md](../specs/0063-protocol-driven-core-algorithms.md).

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
