# Benchmarks

[Project README](../README.md) | [Tests](../tests/README.md) |
[Specifications](../specs/README.md)

Benchmark reports are evidence, not universal performance promises. Every
committed report records raw samples or bounded peak observations, host
fingerprints, correctness checks, parameters, and a digest of the source files
that determine the measurement.

## Transient Bulk Builders

Run the source-bound Vector, Map, and Set comparison with:

```sh
bun run benchmark:transient-builders -- \
  --output benchmarks/transient-builder-macos-arm64.json
```

The persistent references apply one immutable update per preconstructed input.
Production calls public `into`, which selects owner-token transient mutation
through protocols and calls `persistent!` once. Complete value equality and
hashing, allocation counters, and source identity are checked outside the
timed region. Eleven samples alternate path order after two warmups. Default
tests validate the committed report without rerunning wall-clock timings.

## Compiler Ordered Source Map Cursors

Create the exact pre-specialization baseline, generate both compilers, and run:

```sh
git worktree add --detach /tmp/eliscript-source-map-cursor-baseline \
  a6013833226af047622aceca42d687b6e33e3701
(cd /tmp/eliscript-source-map-cursor-baseline && bun run build:bootstrap)
bun run build:bootstrap
bun tools/compiler/source-map-cursor-benchmark.mjs \
  --baseline-root /tmp/eliscript-source-map-cursor-baseline \
  --output benchmarks/compiler-source-map-cursor-macos-arm64.json
git worktree remove /tmp/eliscript-source-map-cursor-baseline
```

The benchmark refuses another baseline. It compares ordered generated-mark and
source-location cursors with retained complete-scan Eliscript references over
all eleven compiler artifacts and explicit Source Map boundaries. Both
compilers must then emit byte-identical ESM and Source Maps for the same current
sources before alternating timing begins. The committed report records both
the cursor-pipeline and complete-compiler decisions.

## Compiler Reader Character Classification

Create the exact pre-specialization baseline, generate both compilers, and run:

```sh
git worktree add --detach /tmp/eliscript-reader-baseline \
  d6822134a187d4247611db56822ef47164a76a61
(cd /tmp/eliscript-reader-baseline && bun run build:bootstrap)
bun run build:bootstrap
bun tools/compiler/reader-character-benchmark.mjs \
  --baseline-root /tmp/eliscript-reader-baseline \
  --output benchmarks/compiler-reader-character-macos-arm64.json
git worktree remove /tmp/eliscript-reader-baseline
```

The benchmark refuses another baseline. It checks production whitespace and
delimiter predicates against retained Eliscript references over the real
compiler source trace, then requires both compilers to emit identical ESM and
Source Maps for all eleven current modules before alternating complete-compiler
timings. [`compiler-reader-character-macos-arm64.json`](compiler-reader-character-macos-arm64.json)
records the reviewed predicate and whole-compiler evidence. Default tests add
an exhaustive Unicode decision check and validate the report digest.

## Compiler Binary Comparison Emission

Create an exact detached baseline worktree, generate both compilers, and run:

```sh
git worktree add --detach /tmp/eliscript-comparison-baseline \
  a123937b275d89e833434e84064e4e120cf5495b
(cd /tmp/eliscript-comparison-baseline && bun run build:bootstrap)
bun run build:bootstrap
bun tools/compiler/binary-comparison-benchmark.mjs \
  --baseline-root /tmp/eliscript-comparison-baseline \
  --output benchmarks/compiler-binary-comparison-macos-arm64.json
git worktree remove /tmp/eliscript-comparison-baseline
```

The benchmark refuses a different baseline revision. Both generated compilers
compile the same current eleven-module corpus with Source Maps in alternating
order. [`compiler-binary-comparison-macos-arm64.json`](compiler-binary-comparison-macos-arm64.json)
records source-bound byte counts, checksums, raw samples, medians, and the
complete-compiler threshold decision. Default tests separately execute binary
and n-ary side-effect ordering and validate the report digest.

## Compiler Ordered Source-mark Location

Generate the self-hosted compiler and run the location benchmark with:

```sh
bun run build:bootstrap
bun run benchmark:compiler-locate
```

The benchmark uses real nodes, generated declaration fragments, and ordered
Source Map marks from every maintained self-hosted compiler module. It compares
the production first-mark check and one-step prepend with the retained full
array scan and copy reference, including real shifted-prefix fragments.

```sh
bun tools/compiler/locate-benchmark.mjs \
  --output benchmarks/compiler-locate-macos-arm64.json
```

[`compiler-locate-macos-arm64.json`](compiler-locate-macos-arm64.json) records
the source-bound evidence. Default tests verify exact result equivalence,
identity and immutability boundaries, report digest, corpus shape, raw samples,
and threshold decision without rerunning timing.

## Compiler Source-map-aware Indentation

Generate the self-hosted compiler and run the indentation benchmark with:

```sh
bun run build:bootstrap
bun run benchmark:compiler-indent
```

The benchmark compiles every maintained self-hosted compiler module, partitions
the real generated JavaScript into declaration blocks, and compares the
production line-segment builder with the retained character-by-character
reference. It requires byte-identical text and exact Source Map mark offsets
over the full corpus and explicit line-boundary cases before recording timing.

```sh
bun tools/compiler/indent-benchmark.mjs \
  --output benchmarks/compiler-indent-macos-arm64.json
```

[`compiler-indent-macos-arm64.json`](compiler-indent-macos-arm64.json) records
the source-bound evidence. Default tests verify its digest, equivalence result,
corpus counts, raw samples, and threshold decision without rerunning timing.

## Compiler IR Node-kind Decisions

Generate the self-hosted compiler and run the IR node-kind benchmark with:

```sh
bun run build:bootstrap
bun run benchmark:compiler-ir-kind
```

The benchmark compiles every maintained self-hosted compiler module to real IR
and compares the production native `Set` membership decision with the retained
linear array reference. It requires exact agreement over every real node and
explicit invalid-value boundaries before recording timings. Refresh the local
reviewed report with:

```sh
bun tools/compiler/ir-kind-benchmark.mjs \
  --output benchmarks/compiler-ir-kind-macos-arm64.json
```

[`compiler-ir-kind-macos-arm64.json`](compiler-ir-kind-macos-arm64.json)
records the source-bound evidence. Default tests verify its source digest,
equivalence result, corpus counts, raw samples, and threshold decision without
rerunning wall-clock timing.

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

## Emacs Analysis Reinvestment

Run the maintained three-candidate benchmark with:

```sh
bun run benchmark:emacs-analysis
```

Set `ELISCRIPT_ANALYSIS_OUTPUT` to intentionally refresh a reviewed report.
[`emacs-analysis-macos-arm64.json`](emacs-analysis-macos-arm64.json) records
service startup, one-time document indexing, six crossover corpora, and 30
alternating primary samples for exact Emacs Lisp and Eliscript implementations.
Search and statistics are the selected transducer-backed workflows; the
committed report records 9.142x and 8.237x median warm end-to-end speedups and
the conservative 16,000-character routing threshold.

Run the real buffer lifecycle soak with:

```sh
bun run soak:emacs-analysis
```

Set `ELISCRIPT_ANALYSIS_SOAK_OUTPUT` when refreshing
[`emacs-analysis-soak-macos-arm64.json`](emacs-analysis-soak-macos-arm64.json).
It records 100 stable atomic applications and 100 intentionally stale discards
on one worker generation. Default tests validate both reports and source
digests without rerunning wall-clock timing.

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
