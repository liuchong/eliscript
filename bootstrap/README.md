# Bootstrap Compiler

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

The bootstrap grows along this dependency order:

```text
symbol semantics (implemented)
  -> syntax data model (implemented)
  -> reader (implemented)
  -> macro expander and analyzer
  -> IR and emitter
  -> compiler driver
  -> reproducible self-compilation
```

`compiler/symbol.eli` owns deterministic mapping from Lisp-style names to
ECMAScript identifiers. `compiler/syntax.eli` defines serializable syntax nodes
and source spans. `compiler/reader.eli` parses the portable source grammar into
that representation and can read every current bootstrap module, including
itself.

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

Generated files are written below `dist/bootstrap/` and are not source
artifacts. Shared fixtures cover symbol behavior and reader syntax. The reader
test normalizes the seed AST, compares every generated node and span, and
checks that repeated ESM and source-map builds are byte-identical.

This is the beginning of Generation 1, not a self-hosted compiler yet.
Self-hosting requires a portable compiler driver, the full shared conformance
suite, and a reproducible fixed point.
