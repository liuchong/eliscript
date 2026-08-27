# Bootstrap Compiler

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

The bootstrap grows along this dependency order:

```text
symbol semantics (implemented)
  -> syntax data model (implemented)
  -> reader (implemented)
  -> macro expander (implemented)
  -> lexical analyzer (implemented)
  -> IR data model (implemented)
  -> IR lowering (implemented)
  -> ESM and Source Map emitter (implemented)
  -> compiler driver
  -> reproducible self-compilation
```

`compiler/symbol.eli` owns deterministic mapping from Lisp-style names to
ECMAScript identifiers. `compiler/syntax.eli` defines serializable syntax nodes
and source spans. `compiler/reader.eli` parses the portable source grammar into
that representation. `compiler/expander.eli` evaluates the deterministic macro
subset without host `eval`, then `compiler/analyzer.eli` validates lexical
scope and special forms. `compiler/ir.eli` defines JSON-safe IR nodes, and
`compiler/lower.eli` lowers analyzed syntax across the complete language
surface. `compiler/emitter.eli` formats portable IR through explicit text and
mapping fragments, while `compiler/source-map.eli` encodes those marks as
Source Map v3. The generated pipeline can process and emit every current
bootstrap module, including its own sources.

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

Generated files are written below `dist/bootstrap/` and are not source
artifacts. Shared fixtures cover symbol behavior, reader syntax, macro
expansion, lexical analysis, all 43 IR node kinds, direct ESM emission, and
Source Map v3. Oracles compare complete syntax and IR trees, spans, properties,
acceptance, exact diagnostics, JavaScript bytes, and parsed source maps between
the seed and generated implementations. Repeated builds must be byte-identical.

This is the beginning of Generation 1, not a self-hosted compiler yet.
Self-hosting requires a portable compiler driver, the full shared conformance
suite, and a reproducible fixed point.
