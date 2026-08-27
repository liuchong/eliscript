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

Compile the complete module and its external source map with:

```sh
bun run compile:stdlib
```

See [specs/0023-portable-sequence-library.md](../specs/0023-portable-sequence-library.md)
for exact semantics and acceptance evidence.
