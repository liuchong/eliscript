# 0029: Portable Indexing Composition

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0022 Emacs Worker Integration,
  0027 Portable Data Indexing,
  0028 Portable Module Composition

## Summary

The Emacs document indexing workload is now a three-module portable
application rather than an isolated source file:

```text
examples/emacs-index/index.eli
  -> stdlib/data.eli: count-by
     -> stdlib/object.eli: assoc, has?
```

This is the second production use of `import-portable` and the first selected
module graph executed through the long-lived worker.

## Scoring Model

`score-document` builds an immutable term-frequency object with `count-by`,
then adds the frequency of each query term. It returns the same serializable
record as before:

```elisp
(object :id id :matches matches :terms (length terms))
```

Query terms are processed in order. Duplicate query terms intentionally add
the same document frequency again, preserving the previous nested-loop
semantics. Empty term or query vectors produce zero matches.

The change does not claim unconditional speed improvement. `count-by` uses
immutable association and may be quadratic in the number of distinct terms;
the previous implementation was proportional to document terms multiplied by
query terms. The composition is valuable because it centralizes data policy
and exercises the real portable graph boundary. Optimization remains dependent
on representative corpus measurements.

## Emacs Build Boundary

`eliscript-index-start` now calls `eliscript-project-build-portable` with the
repository root and `score-document` as its entry. The returned build result is
retained on the session, and its generated entry module is passed to the worker.

The temporary directory contains root-relative modules and adjacent maps:

```text
examples/emacs-index/index.mjs
stdlib/data.mjs
stdlib/object.mjs
```

Selection removes `index-by`, `group-by`, and unrelated object operations. A
session owns this entire immutable tree; stopping it terminates the worker and
removes the directory recursively.

## Compiler and Runtime Evidence

- ERT proves the three-module build shape, rewritten imports, source maps, and
  declaration pruning.
- The real Emacs/Bun integration test executes concurrent document scoring,
  observes module cache reuse, verifies duplicate-query behavior, and confirms
  recursive cleanup.
- The fixed-point compiler suite emits byte-identical complete `index.eli`
  modules through the seed and self-hosted compilers.
- Existing object/data runtime coverage continues to prove own-property safety
  for the frequency object.

## Follow-up

The deterministic build manifest, whole-graph worker identity, and dependency
Source Map loading are implemented in
[0030-project-graph-manifest.md](0030-project-graph-manifest.md).
