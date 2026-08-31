# 0090: Large Emacs Worker Value Stream Memory Probe

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0020 Emacs Worker Protocol and Measurement Probe,
  0088 Versioned Emacs Worker Persistent Value Codec,
  0089 Chunked Emacs Worker Value Streams

## Summary

PD-08 requires process-level evidence that a 256 MiB logical dataset crosses
the real Emacs/Bun boundary through bounded chunks without exceeding a
documented memory budget. The maintained value-stream probe now performs that
round trip, verifies complete content by SHA-256, samples both resident sets,
and emits a source-bound report.

This is a language transport and Emacs integration acceptance gate. UI
libraries, application frameworks, bundlers, publishing tools, and development
servers are neither dependencies nor evidence.

## Workload

The acceptance workload constructs one ASCII string containing exactly
268,435,456 bytes and UTF-16 units. It then:

1. hashes the source in Emacs
2. sends the string through `eliscript-value-chunks-v1`
3. waits for a worker progress value proving complete input decoding
4. releases the Emacs source string and runs garbage collection
5. returns the same worker string through chunked response framing
6. hashes the returned Emacs string and compares length and digest

The operation returns the received value rather than constructing a smaller
summary, so both directions exercise the complete logical dataset. The source
is deliberately released after the progress barrier so the measurement tests
the intended bounded lifecycle rather than retaining two application-owned
copies throughout the response.

## Memory Measurement

`tools/worker/value-stream-probe.el` samples resident set size from
`process-attributes` after worker startup, dataset construction, source and
result hashing, each `accept-process-output` cycle, progress delivery, and
completion. Values are KiB, matching the host process API.

The report records:

- Emacs and Bun baseline, peak, and baseline-to-peak delta
- maximum simultaneously observed combined RSS
- number of memory samples
- actual request and response chunk counts
- encoder chunk, event, and text-part bounds reported by the worker
- dataset and result SHA-256
- host and runtime versions
- individual and aggregate digests of every measurement-defining source file

The committed baseline is invalid when any measured source digest changes.
The default test runs a 1 MiB smoke workload in a real Emacs/Bun subprocess;
the 256 MiB run remains an intentional acceptance command rather than a normal
CI cost.

## Report Contract

The version 1 report format is `eliscript-worker-value-stream-probe`. A valid
acceptance report has both `verified: true` and `withinBudget: true`.

The reference budgets are:

| Process boundary | Peak budget |
| --- | ---: |
| Emacs RSS | 2,048 MiB |
| Bun worker RSS | 1,024 MiB |
| Simultaneously observed combined RSS | 2,560 MiB |

These are hard acceptance bounds, not performance targets. A probe that
crosses any bound requests cancellation and fails. Timing values are reported
for diagnosis but are not acceptance thresholds.

## Reference Evidence

`benchmarks/worker-value-stream-macos-arm64.json` records the reference run:

| Measurement | Result |
| --- | ---: |
| Logical dataset | 256 MiB |
| Request chunks | 1,058 |
| Response chunks | 1,058 |
| Emacs peak RSS | 1,215.078125 MiB |
| Bun peak RSS | 680.046875 MiB |
| Combined peak RSS | 1,895.125 MiB |
| Memory samples | 1,074 |
| Round-trip time | 217,894.196033 ms |

The source and result digest is
`8531f9720e3f5ce15fde831a4c677c501b3ef320d4f156c1248299cd9955392d`.
The run used macOS arm64, Emacs 31.1, and Bun 1.4.0. This host record is
measurement context, not an expansion or replacement of the separately
specified Emacs 29/30 compatibility matrix.

## Reproduction

The small default probe is:

```sh
bun run probe:worker-values
```

The PD-08 workload is:

```sh
ELISCRIPT_VALUE_STREAM_PROBE_MIB=256 \
ELISCRIPT_VALUE_STREAM_PROBE_EMACS_BUDGET_MIB=2048 \
ELISCRIPT_VALUE_STREAM_PROBE_WORKER_BUDGET_MIB=1024 \
ELISCRIPT_VALUE_STREAM_PROBE_COMBINED_BUDGET_MIB=2560 \
ELISCRIPT_VALUE_STREAM_PROBE_TIMEOUT_SECONDS=840 \
bun run probe:worker-values
```

The command owns and stops its worker. Failed, cancelled, timed-out, or
over-budget runs exit unsuccessfully.

## Acceptance Criteria

- **LVP-01:** A real Emacs process starts the production Bun worker and selects
  the versioned value codec and chunk framing.
- **LVP-02:** The logical dataset is exactly 256 MiB and reaches the worker and
  returns to Emacs without summary substitution.
- **LVP-03:** Source and result lengths and SHA-256 digests match.
- **LVP-04:** Both directions use more than 1,000 chunks and report the exact
  framing limits.
- **LVP-05:** Emacs peak RSS does not exceed 2,048 MiB.
- **LVP-06:** Bun peak RSS does not exceed 1,024 MiB.
- **LVP-07:** Simultaneously observed combined RSS does not exceed 2,560 MiB.
- **LVP-08:** The report records baselines, peaks, deltas, sample count, host,
  runtimes, timings, budgets, and correctness state.
- **LVP-09:** The committed report's individual and aggregate source digests
  match the current measurement implementation.
- **LVP-10:** A small real-process probe remains in the default automated test
  suite.
- **LVP-11:** Cancellation, timeout, worker shutdown, and over-budget failure
  leave no live worker process.
- **LVP-12:** No application framework, UI library, bundler, publisher, or
  development server participates in the implementation or evidence.

## P5 Result

Specifications 0088 and 0089 prove supported value-category round trips,
malformed-input rejection, resource bounds, incremental framing,
backpressure, and cancellation. This specification supplies the remaining
large-process memory evidence. Together they satisfy PD-08 and the P5 Emacs
Value Bridge exit gate. Promotion of these accepted surfaces to stable remains
a separate compatibility decision.
