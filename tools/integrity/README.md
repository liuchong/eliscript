# Repository Integrity Audits

[Project README](../../README.md) | [Specifications](../../specs/README.md) |
[Tests](../../tests/README.md)

`check.mjs` validates the tracked repository against
`contracts/repository-integrity.json`. It owns two related audit surfaces:

- dependency closure: exact package versions and manifest sections, frozen
  lockfile resolution, structured JavaScript imports, and self-hosted Eliscript
  IR imports
- artifact closure: exact generated-module markers, byte-identical compiler
  outputs, generator-owned derived files, and source-bound benchmark reports

Run the combined gate with:

```sh
bun run check:integrity
```

Run one surface while investigating a failure with:

```sh
bun run audit:dependencies
bun run audit:artifacts
```

The dependency inventory is closed. Adding a package requires an exact version,
manifest section, and allowed source prefixes in the integrity contract. Core
language paths admit no third-party package imports; application adapters and
examples remain explicitly separated.

Private package fixtures live only under declared local-package roots. Their
nearest `package.json` owns their dependencies, and those declarations never
leak into sibling fixtures or the repository root.

The artifact inventory is also closed. Add a deterministic generated module to
the registry in the same change as its source and output. Add a benchmark report
to the exact report list and retain its current individual and aggregate SHA-256
source binding. Derived API and compatibility artifacts stay owned by their
existing generators.

The command checks but does not rewrite tracked artifacts. It rebuilds the
ignored bootstrap compiler before structured Eliscript scanning and in-memory
reproduction.
