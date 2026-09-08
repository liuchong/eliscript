# 0051: HAMT Layout Benchmark and Threshold Selection

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0040 Project Maturity Roadmap,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0049 Persistent Hash Map Trie Prototype,
  0050 Persistent Hash Set Prototype

## Summary

This specification defines the reproducible cross-host benchmark used to
select the sparse `BitmapIndexedNode` and dense `ArrayNode` transition
thresholds in the stable HAMT runtime.

The first implementation used promotion at 16 occupied branches and demotion
at 8. Correctness and structural sharing were proven, but those thresholds had
not been selected from JavaScript-engine evidence. The benchmark now compares
equivalent real nodes through the actual `mapFind`, `mapAssoc`, and
`mapDissoc` paths under Bun, Node.js, and headless Chrome.

The measured decision is:

- promote a bitmap node when insertion reaches 32 occupied branches
- retain a dense node until deletion reaches 24 occupied branches, then demote

The eight-branch hysteresis band avoids representation churn. This is a stable
internal representation decision: Map and Set values, hashes,
equality, traversal membership, and complexity contracts do not change.

## Benchmark Surface

`tools/collections/layout-benchmark.mjs` owns the host-neutral benchmark core.
It exports:

- the versioned host-report format
- default occupancy and sample parameters
- `runLayoutHostBenchmark(options)`
- `validateLayoutHostReport(report)`

`tools/collections/layout-host.mjs` adapts the core to Bun or Node.js.
`tools/collections/browser/main.mjs` adapts it to a browser. The top-level
`tools/collections/benchmark.mjs` runs all three hosts, validates their
reports, recomputes the decision, and emits one suite report.

The supported command is:

```sh
bun run benchmark:hamt-layout
```

An explicitly reviewed baseline can be written with:

```sh
bun tools/collections/benchmark.mjs \
  --output benchmarks/hamt-layout-macos-arm64.json
```

Environment variables may reduce or increase occupancies, operation counts,
sample counts, and memory node counts. A report always records the effective
parameters, so a quick smoke run cannot be mistaken for a formal baseline.

## Equivalent Node Construction

For every tested occupancy, the core builds two roots containing identical
immutable `MapEntry` values:

1. a compact bitmap and packed child array in one `BitmapIndexedNode`
2. a 32-slot child array and occupied count in one `ArrayNode`

Numeric keys are deterministically searched until every root hash branch has
two candidates. The first candidate populates the branch. A second candidate
provides an unequal missing-key probe when all 32 branches are occupied.

Before timing, both roots must return the same result for every hit and miss.
Every timed sample also computes a result-dependent checksum. Bitmap and Array
checksums must match independently for lookup, replacement, and deletion.
This prevents a fast wrong representation or dead operation loop from entering
the report.

## Measured Operations

The formal baseline measures occupancies:

```text
4, 8, 12, 15, 16, 20, 24, 28, 32
```

At every occupancy and representation it records seven raw samples and the
median for:

- 250,000 mixed hit/miss calls through the real `mapFind` path
- 50,000 existing-key replacements through the real `mapAssoc` path
- 50,000 existing-key removals through the real `mapDissoc` path

Every operation starts from the same immutable root. Update results are
consumed but never replace that root, so each sample measures one persistent
path copy rather than accumulating a changing collection.

No wall-clock value is a normal test threshold. Timings vary with scheduler,
thermal state, engine optimization, and hardware. Raw values remain in the
report for review; default tests gate only structure, checksums, source
identity, host coverage, and the recomputed threshold decision.

## Retained Heap Measurement

The memory experiment isolates representation overhead. It creates 20,000
distinct nodes per sample while sharing the same immutable entries:

- Bitmap nodes receive their own compact child arrays
- Array nodes receive their own 32-slot arrays

Two garbage collections run before the baseline and after allocation. The
retained heap delta divided by node count is reported for three samples and as
a median.

Node.js uses `process.memoryUsage().heapUsed` with `--expose-gc`. Chrome uses
precise `performance.memory.usedJSHeapSize` with exposed GC and
`--enable-precise-memory-info`. Bun 1.4 does not expose a dependable retained
JavaScript heap counter for this experiment: its large-sample heap delta can
collapse to zero. Bun memory therefore appears as `null` with no samples and
is excluded from memory decisions. RSS is not substituted because it includes
unrelated engine and process allocation.

## Host Execution

The formal baseline contains exactly three reports:

- Bun 1.4.0 using JavaScriptCore
- Node.js using V8
- local headless Chrome using browser V8

The browser source and its exact native ESM dependency closure are copied into
a temporary root without a bundler or source transformation. A static server
uses fixed loopback port 8740, and Chrome DevTools Protocol uses fixed port
8741. The runner refuses occupied ports, waits for a page target, reads the
completed report through `Runtime.evaluate`, sends `Browser.close`, and applies
SIGTERM/SIGKILL only to the exact child PID after bounded grace periods. Both
listeners and the temporary profile/module directory close in `finally` paths.

This avoids browser automation dependencies and avoids the platform-specific
non-terminating behavior of Chrome `--dump-dom` on an asynchronous module.

## Source Identity

Every suite report contains a SHA-256 digest over the exact files that define
keys, hashing, node behavior, orchestration, and measurement:

- `runtime/core/map-internals.mjs`
- `runtime/core/protocol-error.mjs`
- `runtime/core/protocol-impl.mjs`
- `runtime/core/protocol.mjs`
- `runtime/core/value.mjs`
- `runtime/core/value-internals.mjs`
- `tools/collections/benchmark.mjs`
- `tools/collections/browser/index.html`
- `tools/collections/browser/main.mjs`
- `tools/collections/layout-benchmark.mjs`

Paths, separators, and file bytes enter the digest in a declared order. The
default test recomputes it. Any relevant code change invalidates the committed
baseline until an intentional benchmark refresh is reviewed.

## Decision Policy

The runtime is expected to serve read-heavy persistent workloads, but updates
remain important. For each host and occupancy, the report computes a mixed
per-operation cost with fixed weights:

```text
80% lookup + 10% assoc + 10% dissoc
```

Raw operation ratios remain available, so another workload can be evaluated
without rerunning or accepting this policy.

The promotion candidate is the lowest measured occupancy where:

1. Array mixed cost is no greater than Bitmap on at least two of three hosts
2. at least two hosts provide precise retained-heap data
3. the median Array-to-Bitmap retained-heap ratio is at most 1.5

The demotion candidate is the highest lower occupancy where:

1. Bitmap has at least a 15% mixed-cost advantage
2. at least two hosts provide precise retained-heap data
3. Bitmap has at least a 15% retained-heap advantage

The suite validator recomputes these candidates from raw host measurements and
requires `runtimeThresholds` to match. A hand-edited conclusion with unchanged
samples fails.

## Baseline Result

The macOS arm64 baseline in
`benchmarks/hamt-layout-macos-arm64.json` produces:

- at 16 branches, no host selects Array for the mixed workload; median Array
  mixed cost is about 1.81 times Bitmap and precise retained heap is about
  1.55 times Bitmap
- at 24 branches, no host selects Array; median Array mixed cost is about 1.37
  times Bitmap and retained heap is about 1.22 times Bitmap
- at 32 branches, Array wins on at least two hosts; median mixed cost is about
  1.00 times Bitmap and retained heap is about 0.95 times Bitmap

The recomputed promotion candidate is 32 and demotion candidate is 24. The
runtime constants and Map/Set transition tests use those exact values.

These figures describe one recorded machine and engine set. They bind the
selected representation to reviewable source and host evidence; they are not
universal speed claims or regression budgets.

## Conformance Evidence

The default suite verifies:

- equivalent lookup, assoc, and dissoc checksums over real node paths
- malformed occupancy and report rejection
- Bun and Node adapters with identical parameters and structural checksums
- explicit absence of unsupported Bun retained-heap measurements
- positive precise heap samples from the recorded Node and Chrome hosts
- exact Bun, Node, and Chrome host coverage in the formal baseline
- raw seven-sample retention for every operation and occupancy
- current source digest equality
- deterministic recomputation of the 32/24 decision
- Map and Set transitions at the measured boundaries

The default suite does not launch Chrome or compare timings. It validates the
committed browser evidence and runs cheap Bun/Node adapter smoke tests. The
full three-host benchmark remains an explicit measurement command.

## Compatibility and Extension Work

The 32/24 transition changes only internal node layout and performance. It does
not alter collection values or serialized public data. Compatibility Baseline
2 freezes the source-bound report format, exact Bun/Node/Chrome host coverage,
checksum and retained-heap validation, source digest, decision policy, and
runtime thresholds.

The following measurements may extend evidence without blocking this stable
contract:

- repeat formal baselines on Linux x64 and future supported engine versions
- at least three stable runs before defining a separate performance regression
  budget
- browser engines beyond Chrome when they enter the supported matrix
- small-map flat-layout measurement if such a representation is proposed
- full-map workloads with nested paths and varied key distributions
- transient owner-token layouts and bulk-construction benchmarks

The 0041 cross-engine node-layout comparison, portable integer bit operations,
Eliscript implementation, and dense-node threshold-selection steps are
complete. Recorded timings remain machine-specific observations rather than a
fixed compatibility budget.
