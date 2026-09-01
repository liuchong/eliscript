# Bootstrap Compiler

[Project README](../README.md) | [Seed compiler](../compiler/README.md) |
[Specifications](../specs/README.md)

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

## Dependency Order

The bootstrap grows along this dependency order:

```text
symbol semantics (implemented)
  -> syntax data model (implemented)
  -> reader (implemented)
  -> concrete-syntax formatter (implemented)
  -> macro expander (implemented)
  -> lexical analyzer (implemented)
  -> IR data model (implemented)
  -> IR lowering (implemented)
  -> ESM and Source Map emitter (implemented)
  -> project graph, portable closure, and build-report policy (implemented)
  -> compiler driver (implemented)
  -> reproducible self-compilation (implemented)
```

## Modules

`compiler/symbol.eli` owns deterministic mapping from Lisp-style names to
ECMAScript identifiers. `compiler/syntax.eli` defines serializable syntax nodes
and source spans. `compiler/reader.eli` parses the portable source grammar into
that representation. `compiler/expander.eli` evaluates the deterministic macro
subset without host `eval`, then `compiler/analyzer.eli` validates lexical
scope and special forms. `compiler/ir.eli` defines JSON-safe IR nodes plus the
closed `eliscript-ir` v1 canonical serialization boundary, and
`compiler/lower.eli` lowers analyzed syntax across the complete language
surface. `compiler/emitter.eli` formats portable IR through explicit text and
mapping fragments, while `compiler/source-map.eli` encodes those marks as
Source Map v3. The generated pipeline can process and emit every current
bootstrap module, including its own sources. `compiler/compiler.eli` composes
the complete in-memory pipeline without filesystem dependencies.
`compiler/formatter.eli` separately owns comment-preserving concrete syntax,
fixed layout, and canonical source text without using emitter or application
formatting behavior.
`compiler/project.eli` owns the versioned single-file/project operation
boundary, single-entry and multi-entry request identity, cycle-safe dependency
traversal, portable-name fixed points, and versioned build-report normalization
and cache-status policy.
`host/build.mjs` dispatches normalized operations without defining compiler
semantics.
`host/project.mjs` supplies the replaceable filesystem, path, artifact, and
timing boundary while using those generated operations for real multi-module
builds.

## Build

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

The normal command automatically establishes that seed build when needed, then
compiles through the generated compiler under Bun or Node:

```sh
./bin/eliscript --output dist/program.mjs source/program.eli
```

## Fixed-point Evidence

Generated files are written below `dist/bootstrap/` and are not source
artifacts. Shared fixtures cover symbol behavior, reader syntax, macro
expansion, lexical analysis, all 57 IR node kinds, direct ESM emission, and
Source Map v3. Oracles compare complete syntax and IR trees, spans, properties,
acceptance, exact diagnostics, JavaScript bytes, and parsed source maps between
the seed and generated implementations. Canonical IR round trips all 57 node
kinds and produces identical bytes under Bun and Node. Repeated builds must be
byte-identical.

Generation 1 is self-hosting. The conformance suite builds it with the seed,
uses it to build Generation 2, then uses Generation 2 to build Generation 3.
All thirteen ESM modules and Source Maps are byte-identical across those
generations. Formatter corpus tests additionally require canonical source to
be byte-idempotent and original/formatted core sources to emit identical ESM.
The Emacs Lisp seed remains the readable bootstrap and reference implementation.
