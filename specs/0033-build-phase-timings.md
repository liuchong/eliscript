# 0033: Build Phase Timings

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0032 Build Decision Reports

## Summary

Every successful project build records four non-negative elapsed-time
measurements. The version 1 build report exposes them under `timings` so CI,
editor integrations, and developers can compare cold, partial, and complete
cache paths without parsing logs.

Timing data is observational. It is never written to the deterministic project
manifest, hashed into graph identity, or consulted by cache validation.

## Timing Model

The report contains milliseconds rounded to three decimal places:

```json
{
  "timings": {
    "cacheReadMs": 0.318,
    "workMs": 2.741,
    "manifestWriteMs": 0.407,
    "totalMs": 3.466
  }
}
```

The phases are non-overlapping:

- `cacheReadMs` measures locating, parsing, and validating manifest-level cache
  metadata.
- `workMs` measures the remainder of the build outside cache reading and
  manifest writing. It includes path and compiler identity setup, artifact
  verification, graph discovery, portable closure proof, compilation, and
  emission as applicable.
- `manifestWriteMs` measures serializing and writing the fresh project manifest.
- `totalMs` measures the complete successful public build call up to result
  construction.

A complete portable cache hit returns the already verified manifest without
rewriting it, so `manifestWriteMs` is exactly `0.0`. Its graph and artifact
verification remains part of `workMs`.

The phases deliberately describe the current builder boundary rather than
claiming a micro-benchmark of individual compiler passes. A later profile may
add finer fields without changing these meanings.

## Emacs Interface

`eliscript-project-build-result` exposes raw floating-point milliseconds through:

- `eliscript-project-build-result-cache-read-ms`
- `eliscript-project-build-result-work-ms`
- `eliscript-project-build-result-manifest-write-ms`
- `eliscript-project-build-result-total-ms`

`eliscript-project-build-report` rounds those values for compact JSON output.
Both standard and portable builders populate every field. Failed builds retain
their existing diagnostic path and do not produce a partial success report.

## Determinism Boundary

The timing record exists only in memory and in opt-in `--json` output.
`eliscript-project.json`, its public graph digest, private cache digest, generated
ESM, and Source Maps remain byte-deterministic for identical inputs.

This separation is required because elapsed time depends on the machine,
filesystem cache, process scheduling, and current workload. None of those may
invalidate a module or restart a worker generation.

## Acceptance Evidence

- ERT verifies that all four fields are numeric and non-negative for cold,
  partial, disabled-cache, and complete-hit builds.
- ERT verifies the raw build-result timing accessor and the portable no-write
  manifest path.
- The public CLI integration test parses timing fields from `--json` and checks
  their basic phase bounds.
- Existing deterministic manifest tests remain byte-identical across repeated
  builds, proving timing data did not enter persisted identity.

## Next Slice

Per-module or compiler-pass profiling should be added only when a measured
workload needs it. External macro dependency evidence requires an explicit
compile-time capability contract first; the current pure macro evaluator has no
filesystem or network dependency to record.
