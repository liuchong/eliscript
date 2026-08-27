# Tests

Compiler behavior is tested from Emacs in batch mode. Source fixtures belong in
`fixtures/`; stable JavaScript output belongs in `snapshots/`.

`make test` runs the ERT suite, invokes the public CLI, compares the generated
ESM with its snapshot, and executes it with Bun.
