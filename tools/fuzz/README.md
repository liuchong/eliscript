# Reliability Fuzzing

[Project README](../../README.md) | [Specifications](../../specs/README.md) |
[Tests](../../tests/README.md)

The reader/program fuzz runner generates a bounded deterministic corpus, builds
the self-hosted compiler once, and compares every reader decision with one
Emacs seed-oracle process. Accepted syntax trees agree exactly and retain their
values through formatting and valid recursive spans. Self-hosted reader results
must repeat exactly; rejected inputs and mutated programs must return versioned
Eliscript diagnostics rather than host exceptions.

Run the complete acceptance corpus with:

```sh
bun run fuzz:reader-program
```

The default seed produces 50,000 grammar-generated reader cases and 50,000
complete-module mutations. The corpus is written in bounded blocks, oracle
results are consumed one line at a time, and both processes have explicit
timeouts and cleanup paths. Individual sources are capped at 4,096 characters
and the corpus is capped at 64 MiB. `make test` runs the same 100,000-input
contract and checks its fixed corpus, reader-result, and compiler-result
digests.
