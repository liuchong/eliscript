# Bootstrap Compiler

This directory contains compiler modules written in Eliscript. The Emacs Lisp
seed compiler builds them into ESM until the portable implementation can
compile itself.

The bootstrap grows along this dependency order:

```text
symbol semantics
  -> syntax data model
  -> reader
  -> macro expander and analyzer
  -> IR and emitter
  -> compiler driver
  -> reproducible self-compilation
```

The first implemented module is `compiler/symbol.eli`. It owns deterministic
mapping from Lisp-style names to ECMAScript identifiers. Its public functions
accept symbol-name strings because the future portable reader will represent
symbols explicitly rather than relying on Emacs runtime objects.

Build the current bootstrap modules with the seed compiler:

```sh
bun run build:bootstrap
```

Generated files are written below `dist/bootstrap/` and are not source
artifacts. `tests/fixtures/bootstrap-symbols.json` is consumed by both the
Emacs Lisp implementation and the generated ESM implementation, so neither
side owns a private set of expected behavior.

This is the beginning of Generation 1, not a self-hosted compiler yet.
Self-hosting requires a portable compiler driver, the full shared conformance
suite, and a reproducible fixed point.
