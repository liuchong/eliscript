# 0131: Source-bound Core Performance Baseline

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0033 Build Phase Timings,
  0103 Transient Bulk Builder Performance,
  0105 Emacs Analysis Performance Reinvestment,
  0109 Self-hosted Build Decision Reports,
  0129 Worker Lifecycle Soak and Recovery

## Summary

Eliscript maintains one source-bound benchmark corpus for the compiler, project
builder, Emacs worker, and a representative persistent-data workload. The
corpus preserves three independent process runs, correctness identities, raw
within-run samples, reference-host metadata, fixed regression budgets, and a
SHA-256 inventory of every source that determines the measurements.

Regression budgets were selected only after a three-run pilot on the declared
reference machine. They are fixed in source and cannot be derived from the
report under validation. The default suite validates the committed report and
its current source identity without rerunning wall-clock measurements. This
completes M12-05; it does not replace the separate performance requirements for
Emacs acceleration or persistent collection algorithms.

## Corpus

Every baseline run executes in a fresh Bun process and contains four groups.

### Compiler

The runner dynamically loads the generated self-hosted compiler, then compiles
all 13 maintained `bootstrap/compiler/*.eli` sources with Source Maps. It
records module-load time, the first complete corpus, and seven warm corpus
samples after two warmups. Every output contributes to a byte count and
SHA-256 digest; all warmups and samples must reproduce the cold result.

### Project Build

The runner copies the real four-module standard-library command-line example
to a temporary root. It measures one clean build, seven no-op builds, and seven
entry-only changes. Build reports must identify exactly four compiled modules
for the clean build, four reused modules for every no-op build, and one compiled
plus three reused modules for every incremental build. Temporary sources and
artifacts are removed after each run.

### Emacs Worker

The runner invokes the maintained real Emacs-to-Bun worker benchmark with a
10,000-value workload and ten operation rounds. It records compile, startup,
cold end-to-end, and seven warm end-to-end samples. The worker result must equal
the Emacs Lisp reference before any timing is accepted, and the report retains
worker execution plus transport and client timing segments.

### Persistent Workload

The runner constructs a 100,000-element persistent Vector through public
`into`, then computes `frequencies` over 1,000 keys. This exercises protocol
dispatch, reduction, transient HAMT construction, and persistent completion.
The first result and seven warm samples after two warmups must have the same
count, boundary values, and deterministic value hash.

## Measurement Protocol

The maintained baseline uses these fixed parameters:

| Parameter | Value |
| --- | ---: |
| Independent process runs | 3 |
| Warmup rounds | 2 |
| Timed samples per warm path | 7 |
| Worker input values | 10,000 |
| Worker operation rounds | 10 |
| Persistent workload values | 100,000 |
| Persistent workload keys | 1,000 |

The report-level sample for a warm path is the median of its seven within-run
samples. The report then records the minimum, median, maximum, and
maximum-to-minimum ratio across the three independent runs. Correctness is
evaluated before threshold decisions. A non-finite or non-positive timing,
wrong sample count, changed output identity, changed build decision, or changed
workload result invalidates the report.

## Reviewed Budgets

The first accepted baseline was measured on the macOS arm64 host recorded in
`benchmarks/core-performance-macos-arm64.json`. The first retained three-run
baseline showed cross-run spread ratios from 1.01 to 1.21. The following fixed
budgets retain headroom for ordinary host variation while rejecting material
regressions:

| Metric | Median maximum | Any-run maximum | Spread maximum |
| --- | ---: | ---: | ---: |
| Compiler module load | 8 ms | 15 ms | 2.00x |
| Compiler cold corpus | 200 ms | 300 ms | 1.50x |
| Compiler warm corpus | 125 ms | 180 ms | 1.50x |
| Clean project build | 25 ms | 40 ms | 2.00x |
| No-op project build | 4 ms | 8 ms | 2.50x |
| Incremental project build | 5 ms | 10 ms | 2.50x |
| Worker startup | 35 ms | 60 ms | 2.00x |
| Worker cold end-to-end | 20 ms | 35 ms | 2.00x |
| Worker warm end-to-end | 6 ms | 10 ms | 2.00x |
| Persistent workload cold | 35 ms | 60 ms | 1.75x |
| Persistent workload warm | 25 ms | 40 ms | 1.75x |

A metric passes only when all three constraints pass. Changing a budget is a
contract change: it requires a written rationale, a new three-run baseline,
and review of correctness and source identity. A slower unsupported host does
not justify rewriting the retained reference result.

## Source Binding

The source inventory includes the Emacs seed compiler, every self-hosted
compiler source, the self-hosted build hosts, the real four-module build
corpus, the complete core runtime, worker runtime and Emacs client, worker
fixture, and benchmark runner. Each file has an individual SHA-256 digest, and
the ordered inventory has an aggregate SHA-256 digest.

Default tests recompute this inventory. A valid-looking report with a changed
aggregate digest, changed file bytes, missing run, altered threshold, altered
summary, inconsistent result identity, or failed decision is rejected.

## Commands and Artifacts

Generate a reviewed report with:

```sh
bun run benchmark:core -- \
  --output benchmarks/core-performance-macos-arm64.json
```

The command rebuilds the self-hosted compiler before starting three fresh
measurement processes. The retained JSON report is the machine-readable
artifact; this specification and `benchmarks/README.md` are the human-readable
methodology.

## Acceptance Criteria

- **CPB-01:** One command measures compiler, build, worker, and persistent-data
  workload paths without an application framework.
- **CPB-02:** The report contains exactly three independent process runs, two
  warmups, and seven warm samples per measured path.
- **CPB-03:** Compiler output bytes and digests are identical across every
  cold, warmup, sample, and process run.
- **CPB-04:** Clean, no-op, and incremental builds report exact compile and
  reuse decisions for the real four-module project graph.
- **CPB-05:** Worker output equals its Emacs Lisp reference before cold and warm
  end-to-end timings are retained.
- **CPB-06:** The persistent workload uses protocol-driven public operations,
  transient construction, and a deterministic correct result.
- **CPB-07:** Every metric passes fixed median, any-run, and spread budgets that
  were selected after three stable pilot runs.
- **CPB-08:** The report records platform, architecture, operating system, Bun,
  and Emacs identities plus every raw timing sample.
- **CPB-09:** The retained report is bound to all measurement-defining sources
  and stale or tampered evidence fails the default suite.
- **CPB-10:** No UI framework, bundler, publisher, site generator, hosting
  system, or development server contributes to implementation or evidence.
