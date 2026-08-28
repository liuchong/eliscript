# Standard Library

This directory contains portable Eliscript functions and macros. React and
publishing support should be libraries here or in focused packages, not special
cases embedded throughout the compiler.

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
path. Hash, key-equality, and value-equality functions are supplied explicitly
until the common value protocol lands:

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

## Sequence

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

## Data

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
