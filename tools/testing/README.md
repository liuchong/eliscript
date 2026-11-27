# Eliscript Test Framework

Standalone parallel test execution, resource supervision, IR caching, and profiling infrastructure under `tools/testing/`.

## Architecture

- [`final-functional-scope.eli`](./final-functional-scope.eli) — Top-level orchestrator for partitioned and sharded suites. Filters `--keep-going` / `--rerun-failed`, enables content-addressed IR caching for worker processes, prepares isolated fixture environments, coordinates intra-file sharding, dispatches through `scheduler.eli`, persists profiles/reports, and archives scope results.
- [`file-workers.eli`](./file-workers.eli) — Worker discovery, test runner argument resolution, static LPT weight table, parallel capacity heuristics (`default-workers`, `default-heavy`, aggregate RSS budget), and batch worker runner (`runTestFiles` / `scheduleTestFiles`).
- [`scheduler.eli`](./scheduler.eli) — Memory-aware Longest-Processing-Time-First (`LPT`) dynamic admission scheduler (`runMemoryAwareLptQueue`). Dispatches heaviest test files first while gating new worker launches on live supervisor RSS telemetry plus a 4000ms cold-start RSS reservation (`78%` aggregate admission ceiling) so peak demand never exceeds the host memory envelope.
- [`resource-supervisor.eli`](./resource-supervisor.eli) — Out-of-process child & process-tree monitor running inside an isolated guard process. Samples child RSS, tracks per-worker `peakRssBytes`, enforces per-tree (`ELISCRIPT_TEST_TREE_RSS_BYTES`) and aggregate (`aggregateCeilingBytes` / `ELISCRIPT_TEST_TOTAL_RSS_BYTES`) ceilings, emits live `telemetry` snapshots, and tears down orphaned descendants.
- [`artifact-cache.eli`](./artifact-cache.eli) — Content-addressed compiler IR cache (`ir-exact`) keyed by compiler closure digest + filename + source bytes for large source units (`>= 16 KiB`, capped at 512 entries with LRU/mtime pruning and atomic writes). Each cache hit parses a fresh JSON object graph so downstream AST passes cannot mutate cached entries.
- [`profile-store.eli`](./profile-store.eli) — Rolling EWMA store (`0.7 * latest + 0.3 * previous`) of per-file wall-clock elapsed time and peak RSS (`eliscript-test-profile-v1`), plus the last-failed ledger (`eliscript-test-failures-v1`) used by `--rerun-failed`.
- [`reporter.eli`](./reporter.eli) — Structured suite telemetry summarizer (`eliscript-test-report-v1`) computing passed/failed/unstarted/cancelled counts, CPU-to-wall speedup, peak aggregate RSS, admission pauses, and slowest test files, writing `.eliscript-cache/test-results/latest-report.json` and formatting concise console summaries.

## CLI Flags & Environment Controls

- `--keep-going` or `ELISCRIPT_TEST_KEEP_GOING=1`: Continue dispatching queued test files after individual failures instead of halting on non-fatal suite errors.
- `--rerun-failed`: Filter execution to files recorded in `.eliscript-cache/test-framework/last-failures.json` for the active runner.
- `--shard-index i --shard-count N`: Deterministically partition test files across `N` CI or local shards.
- `ELISCRIPT_TEST_IR_CACHE=1` / `ELISCRIPT_DISABLE_TEST_IR_CACHE=1`: Enabled automatically inside managed test runs for build-tool compiler invocations; set `ELISCRIPT_DISABLE_TEST_IR_CACHE=1` to bypass the on-disk IR cache.
- `ELISCRIPT_TEST_PARALLEL=1`, `ELISCRIPT_TEST_WORKERS`, `ELISCRIPT_HEAVY_WORKERS`, `ELISCRIPT_NODE_WORKERS`, `ELISCRIPT_TEST_TOTAL_RSS_BYTES`, `ELISCRIPT_TEST_TREE_RSS_BYTES`: Override auto-detected CPU and RAM concurrency budgets.

## Persistent Runtime Files

- `.eliscript-cache/test-framework/ir-cache/*.json`: Content-addressed IR cache entries (auto-pruned).
- `.eliscript-cache/test-framework/profile.json`: EWMA per-file duration & RSS estimates.
- `.eliscript-cache/test-framework/last-failures.json`: Failed file inventory for `--rerun-failed`.
- `.eliscript-cache/test-results/latest-report.json`: Latest structured suite summary.
