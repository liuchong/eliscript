# Core Performance Tools

[Project README](../../README.md) | [Benchmarks](../../benchmarks/README.md) |
[Specification 0131](../../specs/0131-source-bound-core-performance-baseline.md)

`core-benchmark.mjs` runs the framework-neutral compiler, project-build, real
Emacs worker, and persistent-data workload corpus. It rebuilds the self-hosted
compiler, launches three independent Bun measurement processes, verifies every
result before timing acceptance, and writes a source-bound JSON report.

```sh
bun run benchmark:core -- \
  --output benchmarks/core-performance-macos-arm64.json
```

Regression budgets are fixed in the runner. Do not raise them automatically
from a slow sample. A budget change requires a written rationale and a new
reviewed three-run baseline on the declared reference host.
