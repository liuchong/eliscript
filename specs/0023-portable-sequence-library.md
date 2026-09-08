# 0023: Portable Sequence Standard Library

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0003 Implemented Core Language,
  0021 Portable Functions and Dependency Closure

## Summary

M6 begins with a sequence library written entirely in Eliscript. The compiler
does not gain special `map`, `filter`, or `reduce` forms. Instead,
`stdlib/sequence.eli` proves that lexical functions, higher-order calls, loops,
local mutation, arrays, and portable dependency selection are sufficient to
build reusable language facilities.

```elisp
(import "../../stdlib/sequence.eli" map range)

(map (lambda (value) (* value 2)) (range 1 5))
```

The project builder compiles the complete local source graph and rewrites each
generated import to `.mjs` for ordinary ESM consumers.

## Representation and Purity

Sequence functions accept and return the existing Eliscript array
representation. They never mutate input arrays. Result-producing operations
build fresh arrays using `cons` and the library's own `reverse` function.

Every declaration uses `defportable`. This means:

- the compiler validates its transitive host-independent closure
- ordinary ESM consumers may import the generated named export
- worker closure builds may select JSON-compatible entry points
- `--portable map` emits `reverse` and `map`, but no unrelated operations

Higher-order functions accept callable values during ordinary ESM execution.
Protocol v1 cannot serialize a function from Emacs as a worker argument; the
portable checker establishes host independence, not transport type validity.

## Operations

`stdlib/sequence.eli` exports:

- `reverse(values)` returns a fresh sequence in reverse order
- `map(function, values)` transforms values while preserving order
- `filter(predicate, values)` retains values whose predicate is Eliscript-truthy
- `reduce(function, initial, values)` folds left from an explicit initial value
- `concat(left, right)` returns a fresh concatenation of two sequences
- `range(start, end)` returns an ascending, end-exclusive unit-step range
- `range-by(start, end, step)` supports positive or negative end-exclusive
  steps; a zero step returns an empty sequence
- `take(count, values)` returns at most the first `count` values
- `drop(count, values)` omits the first `count` values
- `some?(predicate, values)` and `every?(predicate, values)` short-circuit and
  return explicit booleans
- `find(predicate, values)` returns the first match or `nil`

`count` arguments are expected to be non-negative integers. Numeric values use
ECMAScript number behavior, consistent with the core language.

## Module Integration

The library compiles as an ordinary source module, participates in multi-file
project builds, and executes under every supported JavaScript host. It remains
independent of application frameworks, bundlers, browser state, and Emacs
editor state.

## Compatibility

The twelve exported function names, Array input and output categories,
left-to-right evaluation, input immutability, end-exclusive range behavior,
and Eliscript truthiness rules are stable. Dependency-pruned portable closures
remain part of the contract. Internal accumulation strategies and generated
local names are not compatibility observations.

## Acceptance Evidence

- ERT compiles the `map` portable closure and proves exact dependency pruning.
- A Bun test compiles the library and an importing Eliscript fixture with
  external source maps, then executes all exported behaviors.
- The fixed-point test compiles the complete library with both the Emacs seed
  and Generation 2 compiler and compares their JavaScript byte-for-byte.
- A four-module project build compiles sequence, text, object, and data sources,
  retains each source in its Source Map, and executes the generated graph under
  Bun and Node.
- The project CLI discovers the same source import, emits both modules and
  their maps, rewrites the relative specifier, and runs the entry with Bun.

## Runtime Continuation

The project build command is implemented in
[0024-project-builds.md](0024-project-builds.md). The Array-backed portable API
remains supported for compiler closure and compatibility use. The maintained
protocol-driven sequence surface, persistent Vector results, and exact reduced
termination are specified separately in
[0063-protocol-driven-core-algorithms.md](0063-protocol-driven-core-algorithms.md).
