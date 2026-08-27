# 0023: Portable Sequence Standard Library

- Status: Implemented
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

Vite can consume `.eli` imports directly. A command-line build compiles the
library to ESM first and imports the resulting `.mjs` module.

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

The React counter imports `map` from the source `.eli` module and uses it to
render footer items. Its Vite production build therefore exercises a real
multi-file Eliscript dependency graph. The bundled source map retains the
component, browser entry, and standard-library source paths.

The library deliberately remains independent of React, browsers, Bun, and
Emacs editor state.

## Acceptance Evidence

- ERT compiles the `map` portable closure and proves exact dependency pruning.
- A Bun test compiles the library and an importing Eliscript fixture with
  external source maps, then executes all exported behaviors.
- The fixed-point test compiles the complete library with both the Emacs seed
  and Generation 2 compiler and compares their JavaScript byte-for-byte.
- The React production build resolves `sequence.eli`, renders a mapped footer,
  and records the standard-library source in the final bundle map.

## Next Slice

M6 can continue with object/text helpers and a project build command that turns
a local `.eli` module graph into a runnable ESM tree without requiring Vite.
