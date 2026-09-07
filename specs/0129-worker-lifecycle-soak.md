# 0129: Worker Lifecycle Soak and Recovery

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0020 Worker Protocol, 0021 Emacs Worker Integration,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0104 Accelerated Emacs Operation Service

## Summary

Eliscript owns a deterministic 100,000-request real-process soak from Emacs
through the versioned worker protocol to an Eliscript-compiled JavaScript
module. The same Emacs client crosses five worker generations while exercising
cooperative cancellation, explicit restart, module replacement, an
unresponsive timeout, process death with an in-flight request, automatic
recovery, and clean protocol shutdown.

The suite verifies every successful response exactly once, drains the pending
request table after every bounded batch and fault, records high-frequency and
fixed-checkpoint resident memory, rejects sustained growth beyond a declared
steady-state allowance, and proves that every owned process and temporary file
is reclaimed. This specification completes M12-03 and, together with the
1,000-module evidence in specification 0128, completes AC-19.

## Fixed Workload

The version 1 acceptance workload has these immutable parameters:

| Parameter | Value |
| --- | ---: |
| Successful requests | 100,000 |
| Maximum in-flight requests | 64 |
| RSS checkpoint interval | 2,500 requests |
| RSS checkpoints | 40 |
| Worker generations | 5 |
| Explicit or automatic restarts | 4 |
| Whole-run deadline | 180 seconds |
| Ordinary request timeout | 5,000 ms |
| Blocking fault timeout | 25 ms |

Request indices are `0` through `99,999`. Revision 1 serves the first 40,000
requests and revision 2 serves the remaining 60,000. For request `n`, salt 31,
and module revision `r`, the expected result is:

```text
(n * 17 + 31 + r) modulo 1,000,000,007
```

The order-independent checksum of all version 1 results is `2,409,405`. A
100,000-bit response set rejects missing and duplicate completions independently
of that checksum. Deliberate fault requests are counted separately and never
inflate the successful-request total.

## Lifecycle Sequence

The acceptance process performs these phases in order:

1. generation 1 completes 10,000 requests
2. a delayed request emits progress, accepts cooperative cancellation, and
   completes exactly once with `cancelled`
3. generation 1 completes another 10,000 requests
4. an explicit restart advances generation 1 to generation 2, which completes
   20,000 requests
5. recompiling the temporary Eliscript module as revision 2 causes the client
   module-version guard to restart generation 2 as generation 3, which completes
   20,000 requests with revision 2 behavior
6. synchronous blocking JavaScript exceeds its 25 ms timeout and cannot process
   remote cancellation, so the client completes it once with `timeout`, drains
   pending state, and terminates generation 3
7. the next request automatically starts generation 4, which completes 20,000
   requests
8. generation 4 is terminated with one delayed request in flight; the client
   completes that request once with `worker-exit` and drains pending state
9. the next request automatically starts generation 5, which completes the
   final 20,000 requests
10. the client sends the protocol shutdown message, waits for exit, removes its
    temporary source and artifacts, and verifies all five operating-system PIDs
    are absent

The expected final client state is generation 5 with restart count 4. Each
fault records its generation transition, exact error code, callback count, and
post-fault pending count.

## Memory Contract

The Emacs process and current worker RSS are sampled whenever process output is
accepted and after a forced Emacs garbage collection at every 2,500 successful
requests. The report retains all 40 fixed checkpoints and the observed peak
across the denser sample stream.

Absolute version 1 limits are:

| Resource | Limit |
| --- | ---: |
| Emacs peak RSS | 512 MiB |
| Worker peak RSS | 512 MiB |
| Simultaneous combined peak RSS | 768 MiB |
| Steady-state median growth | 16 MiB |

Each worker generation owns eight checkpoints. Its first four checkpoints
record 10,000 requests of warmup without entering the trend decision. The
median of checkpoints five and six may exceed the median of checkpoints seven
and eight by at most 16 MiB. A separate cross-generation check compares the
final median of generation 1 with generation 5 to reject retained client growth
across restarts. The absolute peak gates additionally reject a bounded-window
result that still consumes excessive memory.

The committed macOS arm64 report records 100,000 unique responses in 6,916 ms,
with observed Emacs, worker, and combined peaks of 57,984 KiB, 65,408 KiB, and
123,376 KiB. Its generation 1-to-5 final-window deltas were 912 KiB for Emacs
and -648 KiB for the worker. These observations are evidence for the declared
host, not portable timing promises; the limits and algorithms are the contract.

## Evidence and Reproduction

Run the full acceptance workload with:

```sh
bun run soak:worker-lifecycle
```

Set `ELISCRIPT_WORKER_SOAK_OUTPUT` to retain JSON. Smaller request counts are
diagnostic runs and report `acceptanceQualified: false`; they cannot satisfy
this specification. The default test suite executes the full 100,000-request
run and separately validates the committed reference report.

The report binds every seed compiler source, the worker runtime and platform
package, the Emacs codecs and client, and the soak program itself by file-level
and aggregate SHA-256. A measured-source change invalidates the committed report
until the complete workload is rerun.

The runner starts no server. Normal completion and every error path use one
`unwind-protect` cleanup owner, stop the current client, terminate any remaining
owned process object, remove the temporary directory, and verify all recorded
PIDs have disappeared.

## Acceptance Criteria

- **WLS-01:** Exactly 100,000 successful requests produce 100,000 unique,
  correct responses, zero duplicates, zero losses, and checksum `2,409,405`.
- **WLS-02:** At most 64 requests are in flight, every batch drains pending
  state, and the whole run completes before its 180-second deadline.
- **WLS-03:** Cooperative cancellation, explicit restart, module replacement,
  blocking timeout, and in-flight process death produce their exact outcomes
  and generation transitions.
- **WLS-04:** Every faulted request completes its callback exactly once and
  leaves zero pending requests before subsequent work.
- **WLS-05:** Automatic recovery reaches generation 5 with restart count 4 and
  preserves exact revision-specific behavior.
- **WLS-06:** Forty fixed RSS checkpoints and denser peak observations keep
  Emacs, worker, and combined memory within their absolute limits.
- **WLS-07:** Every per-generation late steady-state window and the generation
  1-to-5 final-window comparison grow by no more than 16 MiB.
- **WLS-08:** Clean protocol shutdown succeeds, all five owned PIDs disappear,
  and the owned temporary directory is removed on success and failure.
- **WLS-09:** The committed report matches every measured source digest, while
  the default suite independently reruns the complete acceptance workload.
- **WLS-10:** No application framework, UI library, bundler, publisher, site
  generator, hosting system, or development server contributes to this core
  worker evidence.
