# Standard Library

This directory contains portable Eliscript functions and macros. React and
publishing support should be libraries here or in focused packages, not special
cases embedded throughout the compiler.

The compiler owns only React element construction and the automatic JSX
runtime contract. Higher-level component helpers belong here so React remains
a library target instead of a second component framework.

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
for primitive semantics, key ordering, complexity, and acceptance evidence.
