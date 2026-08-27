# 0028: Portable Module Composition

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0021 Portable Functions, 0024 Project Builds

## Summary

Portable declaration closures may now cross root-contained local `.eli`
modules. The source language uses an explicit named-only form:

```elisp
(import-portable "./object.eli" assoc)

(defportable index-by (key-function values)
  ...)
```

In a complete module build this lowers to an ordinary named ESM import. In a
portable closure build it is a proof obligation: the project builder resolves
the source edge and verifies that every selected imported name is declared with
`defportable` in the target module.

## Graph Contract

`import-portable` accepts one relative `.eli` source and one or more named
bindings. Default, namespace, bare-package, non-`.eli`, missing, root-escaping,
and symbolic-link-escaping targets are rejected for portable project builds.
Ordinary `import` remains host-defined and cannot satisfy a portable closure.

The builder starts from each repeated `--portable NAME`, computes local
declaration closures, follows selected portable imports, and repeats until the
module/name worklist is exhausted. Cycles terminate by visited module/name
pairs. Every target module is analyzed independently, so an imported `defun`,
mutable variable, host reference, or other forbidden capability fails at its
own source location.

## Extraction Boundary

Single-file `eliscript --portable` and the self-hosted Bun CLI intentionally
reject a selected portable import with `requires a project build`. Neither
command has a trusted filesystem graph, so accepting the edge there would turn
the declaration into an unchecked assertion. Full-module compilation remains
available because it does not claim to extract a closed portable artifact.

```sh
./bin/eliscript-build \
  --root stdlib \
  --portable group-by \
  --out-dir dist/portable \
  stdlib/data.eli
```

The output preserves root-relative paths, rewrites selected source edges to
`.mjs`, emits adjacent source maps, and includes a portable manifest in every
generated module.

## Standard Library Proof

`stdlib/data.eli` is the first production consumer. It imports `assoc` and
`has?` from `stdlib/object.eli`, then defines `index-by`, `group-by`, and
`count-by`. Selecting `group-by` emits two modules: the requested data function
and only the two object primitives it needs. Selected import declarations are
also reduced to referenced names, so grouped named imports do not retain
unrelated target functions.

## Compiler Parity

The seed and self-hosted analyzers recognize the same syntax, diagnostics, and
ordinary ESM lowering. Their standalone portable selectors reject unresolved
cross-module edges identically. Filesystem traversal stays in the Emacs project
builder, preserving the host-neutral self-hosted compiler core.

## Acceptance Evidence

- ERT covers ordinary lowering, standalone rejection, graph pruning, invalid
  targets, local-path enforcement, and the real data/object closure.
- Shared analyzer fixtures cover valid named imports and invalid default or
  empty portable imports in both compiler generations.
- The fixed-point suite compiles `data.eli` byte-identically through seed and
  self-hosted compilers.
- Bun executes the complete object/data module graph, including own-property
  safety for `__proto__` grouping and counting.
- The project CLI builds and executes a dependency-pruned `group-by` graph.

## Next Slice

The next M6 step should use this graph boundary for a second real composition
case, then decide whether portable project orchestration also needs a
host-neutral manifest format for non-Emacs build hosts.
