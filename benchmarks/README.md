# Benchmarks

[Project README](../README.md) | [Tests](../tests/README.md) |
[Specifications](../specs/README.md)

Benchmark reports are evidence, not universal performance promises. Every
committed report records raw samples or bounded peak observations, host
fingerprints, correctness checks, parameters, and a digest of the source files
that determine the measurement.

## Compiler Runtime Requirement Scan

Run the self-hosted compiler scan benchmark after generating the bootstrap
compiler:

```sh
bun run build:bootstrap
bun run benchmark:compiler-runtime-scan
```

The benchmark compiles all maintained self-hosted compiler modules into IR,
then compares the production one-pass runtime requirement scan with the
retained five-pass reference implementation. It requires exact requirement
agreement before recording timings. Refresh the reviewed local report only
after the implementation and source digest have been reviewed:

```sh
bun tools/compiler/runtime-scan-benchmark.mjs \
  --output benchmarks/compiler-runtime-scan-macos-arm64.json
```

[`compiler-runtime-scan-macos-arm64.json`](compiler-runtime-scan-macos-arm64.json)
records the current source-bound evidence. Default tests verify its digest,
equivalence result, corpus size, raw samples, and threshold decision; wall-clock
timings are not rerun as a normal test gate.

## Worker Value-stream Memory

Run the small real-process probe with:

```sh
bun run probe:worker-values
```

The PD-08 acceptance run sets `ELISCRIPT_VALUE_STREAM_PROBE_MIB=256` and the
2,048 MiB Emacs, 1,024 MiB Bun, and 2,560 MiB combined RSS budgets documented
in [specification 0090](../specs/0090-large-worker-value-memory-probe.md).
It hashes one complete 256 MiB string before and after an Emacs-to-Bun-to-Emacs
round trip and samples both resident sets throughout the transfer.

[`worker-value-stream-macos-arm64.json`](worker-value-stream-macos-arm64.json)
is the reviewed reference report. The default suite recomputes every measured
source digest, validates the aggregate digest, and runs a smaller subprocess
probe. A measurement-source change invalidates the committed report until the
full acceptance command is rerun and reviewed.

## HAMT Layout

Run the HAMT layout benchmark with:

```sh
bun run benchmark:hamt-layout
```

The command measures the same real `mapFind` path over equivalent
bitmap-indexed and dense 32-slot roots under Bun, Node.js, and local headless
Chrome. It starts a temporary Vite build on fixed loopback port 8740 and uses
Chrome DevTools Protocol on fixed port 8741. Both listeners and the exact
Chrome process are closed before the command returns.

Use `--output` when intentionally refreshing a reviewed baseline:

```sh
bun tools/collections/benchmark.mjs \
  --output benchmarks/hamt-layout-macos-arm64.json
```

HAMT timing values are never normal test gates. Default tests validate report
shape, lookup checksums, host coverage, source digest, and the stated threshold
decision. A threshold change requires a new measured report and specification
review.
