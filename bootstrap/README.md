# Bootstrap Compiler

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

The bootstrap grows along this dependency order:

```text
symbol semantics (implemented)
  -> syntax data model (implemented)
  -> reader (implemented)
  -> lexical analyzer (implemented)
  -> macro expander
  -> IR and emitter
  -> compiler driver
  -> reproducible self-compilation
```

`compiler/symbol.eli` owns deterministic mapping from Lisp-style names to
ECMAScript identifiers. `compiler/syntax.eli` defines serializable syntax nodes
and source spans. `compiler/reader.eli` parses the portable source grammar into
that representation. `compiler/analyzer.eli` consumes those nodes directly,
validates lexical scope and special forms, and returns the original tree. The
generated reader and analyzer can process every current bootstrap module,
including their own sources.

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

Generated files are written below `dist/bootstrap/` and are not source
artifacts. Shared fixtures cover symbol behavior, reader syntax, and lexical
analysis. The analyzer oracle compares acceptance and exact diagnostics between
the seed and generated front ends. Repeated ESM and source-map builds must be
byte-identical.

This is the beginning of Generation 1, not a self-hosted compiler yet.
Self-hosting requires a portable compiler driver, the full shared conformance
suite, and a reproducible fixed point.
