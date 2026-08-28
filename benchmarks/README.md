# Benchmarks

Benchmark reports are evidence, not universal performance promises. Every
committed report records raw samples, host fingerprints, correctness checks,
parameters, and a digest of the source files that determine the measurement.

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

Timing values are never normal test gates. Default tests validate report
shape, lookup checksums, host coverage, source digest, and the stated threshold
decision. A threshold change requires a new measured report and specification
review.
