# 0021: Portable Functions and Dependency Closure

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0002 Emacs Acceleration Through JavaScript,
  0020 Emacs Worker Protocol and Measurement Probe

## Summary

`defportable` marks an Eliscript function as a worker entry and asks the
compiler to enforce a closed, host-independent dependency graph.

```elisp
(defconst step 2)

(defportable score-values (values)
  (* (length values) step))
```

Both the Emacs Lisp seed compiler and self-hosted Eliscript compiler implement
the declaration, diagnostics, dependency selection, IR metadata, and ESM
manifest.

## Static Boundary

A portable function may depend transitively on:

- parameters and lexical bindings
- another `defportable` declaration
- an immutable `defconst` whose own initializer satisfies this boundary
- literals, quoted data, arrays, objects, control flow, arithmetic, comparison,
  list/array operations, property reads, and string conversion
- local assignment and loops whose mutated bindings are lexical to the
  portable function

The initial subset rejects:

- ordinary `defun`/`defn` dependencies
- mutable top-level `defvar` state
- imported bindings and qualified JavaScript references
- `js*`, `print`, `put`, `js-call`, `new`, `jsx`, and `fragment`
- assignment to any non-local binding

Validation starts at every `defportable` declaration and walks constants and
portable helper functions transitively. Cycles are permitted in the graph and
visited once. Diagnostics identify the portable declaration, forbidden
dependency or form, and source location.

The checker establishes host independence, not a complete data type proof.
Arguments and results must still satisfy protocol v1 JSON serialization at
runtime.

## Closure Compilation

The ordinary compiler emits the complete source module and validates every
portable declaration. A portable build emits only requested entries and their
transitive `defconst`/`defportable` declarations, preserving source order:

```sh
./bin/eliscript --portable score-values --output dist/score.mjs source.eli
```

`--portable` is repeatable. The equivalent public APIs are
`eliscript-compile-portable-string` in the seed compiler and
`compile_portable_string` in the self-hosted compiler. Portable closure builds
do not yet support external source-map output.

## Generated Manifest

Generated modules containing portable declarations export their JavaScript
bindings and one reserved manifest:

```js
export {score_values};
export const __eliscript_portable__ = Object.freeze(Object.fromEntries([
  ["score-values", score_values],
]));
```

The manifest preserves the Eliscript source name and points to the generated
function. Explicit source exports are detected so the emitter does not produce
duplicate ESM exports.

Protocol v1 requests may continue to use `export: "score_values"`, or use
`operation: "score-values"` to resolve through the manifest. Exactly one field
is required. Missing manifest entries produce `missing-portable` without
falling back to arbitrary module exports.

The Emacs adapter exposes `eliscript-worker-call-portable` and
`eliscript-worker-call-portable-sync` for the source-name path.

## Acceptance Evidence

Seed tests cover manifest emission, explicit export deduplication, closure
selection, transitive constants and helpers, local mutation, host interop, and
non-portable dependencies. The generated analyzer runs the same valid and
invalid cases with exact diagnostic parity.

The fixed-point compiler test builds three generations and compares all
compiler artifacts before comparing seed and self-hosted portable closure
output. Real Bun and Emacs worker tests invoke `score-values` through its source
name and manifest.

## Next Phase

A3 will add source-mapped runtime diagnostics, automatic worker restart and
cache policy, then integrate a representative publishing, parsing, or indexing
workload. Explicit capability declarations for filesystem or network access
remain future work.
