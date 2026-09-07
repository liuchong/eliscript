# 0105: Emacs Analysis Performance Reinvestment

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Project Maturity Roadmap,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0061 Composable Transducers and Protocol-driven Into,
  0104 Accelerated Emacs Operation Service

## Summary

Eliscript now returns measurable performance to real Emacs text-analysis
workflows. The maintained `eliscript-analysis` package owns exact Emacs Lisp
references, workload routing, a persistent worker document snapshot,
generation-aware resynchronization, synchronous calls, and asynchronous buffer
application. Its generated Eliscript module owns document search,
per-document statistics, and corpus term-frequency candidates.

The selected search and statistics workflows each exceed the AC-19 2.0x warm
end-to-end requirement over 30 measured runs. Both construct immutable result
Vectors through transducers and owner-token persistent builders. The third
term-frequency candidate uses a persistent Map and remains maintained, but its
later crossover keeps it outside the default selection.

This specification completes P7 and PD-10 as language runtime and Emacs host
integration work. Vite, React, UI frameworks, bundlers, publishing, blog and
site generation, hosting, and development servers are application validation
choices only. They define no core goal, dependency, threshold, evidence, or
maturity credit here.

## Stateful Worker Boundary

Sending 200,000 token strings on every call made Emacs serialization dominate
the operation. Sending the same 1.58 MB source text on every call still cost
about 590 ms even though worker execution took 11-32 ms. These rejected
candidate measurements established that a coarse computation alone is
insufficient when an unchanged input snapshot repeatedly crosses the process
boundary.

The accepted boundary transfers raw documents once with a monotonically
increasing revision. The loaded generated module retains that snapshot for its
worker generation. Search then transfers only query plus revision; statistics
and frequencies transfer only revision. A mismatch fails rather than reading
another snapshot. The Emacs session records its source copy, serialized
documents, revision, and indexed worker generation, and automatically reloads
after source changes or worker restart.

The general operation service supports a validated `worker-arguments`
projection. Routing, workload sizing, and reference verification see complete
Emacs arguments; only the accelerated dispatch receives the projection. The
projection must return a list and cannot weaken the independently executable
reference path.

## Maintained Package Workflows

`eliscript-analysis-search-sync` and
`eliscript-analysis-statistics-sync` expose direct package operations.
Their asynchronous counterparts accept callbacks, timing and progress
observers, a target buffer, and an atomic application function. Modified or
dead buffers reject the result before application.

Three exact candidates are kept together:

1. `search-documents` tokenizes a query and documents, computes native local
   frequency indexes, and constructs the filtered result as a persistent
   Vector through composed mapping and filtering transducers.
2. `document-statistics` computes token and unique-token counts and constructs
   the result as a persistent Vector through a mapping transducer.
3. `term-frequencies` tokenizes the complete corpus and constructs a
   persistent Map before its explicit native-object transport boundary.

Correctness is checked before every candidate timing series. The report stores
application digests for every reference and accelerated sample.

## Performance Evidence

[`emacs-analysis-macos-arm64.json`](../benchmarks/emacs-analysis-macos-arm64.json)
records the reviewed macOS arm64 run under Emacs 31.1 and Bun 1.4.0. The primary
corpus contains 500 documents, 200,000 terms, and 1,577,523 source characters.
After three warmups, 30 alternating samples produced:

| Workflow | Emacs median | Eliscript median | Warm speedup |
| --- | ---: | ---: | ---: |
| Search | 95.888 ms | 9.906 ms | 9.679x |
| Statistics | 80.992 ms | 9.797 ms | 8.267x |
| Frequencies, candidate only | 93.284 ms | 32.091 ms | 2.907x |

The selected medians separately report worker, execution, serialization, and
transport/decode/application time. Service startup was 38.432 ms and the
one-time primary snapshot transfer was 591.388 ms; neither is hidden inside a
warm claim.

Six 30-sample crossover corpora cover 774, 3,939, 7,869, 11,813, 15,754, and
19,696 characters. The 11,813-character point varied during repeated review;
both selected workflows exceed 2.0x at 15,754 and 19,696 characters in the
committed run. Automatic routing therefore uses a conservative rounded
threshold of 16,000 characters; smaller work remains in Emacs Lisp.

The report contains raw samples, output digests, host versions, parameters,
and per-file plus aggregate source digests. Default tests validate those
properties without turning wall-clock values into a continuously rerun gate.

## Buffer Soak

[`emacs-analysis-soak-macos-arm64.json`](../benchmarks/emacs-analysis-soak-macos-arm64.json)
records 200 requests on one worker generation. It alternates both selected
operations across stable and intentionally modified temporary buffers. Exactly
100 stable results apply atomically, exactly 100 stale results are discarded,
and the recorded application count is exactly 100. The worker remains live in
the original generation throughout.

## Acceptance Criteria

- **EAP-01:** Three candidates retain exact Emacs Lisp and Eliscript
  implementations.
- **EAP-02:** Correctness is checked before timing and every sample stores an
  application digest.
- **EAP-03:** Search and statistics each exceed 2.0x warm end-to-end speedup
  across 30 measured primary runs.
- **EAP-04:** At least one selected workflow directly uses persistent
  collections and transducers; both selected workflows do.
- **EAP-05:** Cold service startup, one-time indexing, worker execution,
  serialization, and client transport/decode/application remain separately
  visible.
- **EAP-06:** Crossover evidence selects a conservative 16,000-character
  automatic routing threshold.
- **EAP-07:** Worker argument projection preserves complete reference inputs
  and validates the accelerated argument list.
- **EAP-08:** Source revisions and worker generations force snapshot reload;
  revision mismatch fails closed.
- **EAP-09:** The maintained package exposes synchronous and asynchronous
  search and statistics workflows without protocol-level caller code.
- **EAP-10:** The 200-request soak applies every stable result, discards every
  stale result, and retains one live worker generation.
- **EAP-11:** Committed reports are source-bound and validated by default
  tests without rerunning performance timing.
- **EAP-12:** Application frameworks, bundlers, publishing, sites, hosting,
  and development servers remain outside core goals, dependencies, evidence,
  and maturity credit.
