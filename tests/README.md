# Tests

Compiler behavior is tested from Emacs in batch mode. Source fixtures belong in
`fixtures/`; stable JavaScript output belongs in `snapshots/`.

`make test` runs the ERT suite, invokes the public CLI, compares the generated
ESM with its snapshot, validates and decodes Source Map v3 output, and executes
ordinary, source-mapped, and React server-rendered modules with Bun. It also
tests the Vite transform adapter and builds the browser counter with bundled
Eliscript source maps. Org publishing tests cover metadata, deterministic HTML,
draft and duplicate handling, the watched Vite content module, direct ESM
execution, and the production Org site bundle.
